// Community: drivers who choose to share their best laps (time, and if they
// want the whole lap trace) and race analyses. Reading is public; writing
// needs the device token given at registration. Turn it on for the central
// server with the variable COMMUNITY = "1".
import { sessionAccount, isAdmin, nameTaken, deleteAccount } from "./accounts.js";
import { mailReady } from "./email.js";
import { smtpReady } from "./smtp.js";
import { sealData, openData } from "./crypt.js";
import { getModel, markModel, pseudoId, PSEUDO_MIN } from "./model.js";
const JSONH = { "content-type": "application/json; charset=utf-8", "cache-control": "no-store", "access-control-allow-origin": "*" };
const json = (v, status = 200) => new Response(JSON.stringify(v), { status, headers: JSONH });
const err = (msg, status) => json({ error: msg }, status);
const str = (v, max = 120) => (typeof v === "string" ? v.slice(0, max) : v == null ? null : String(v).slice(0, max));
const num = (v) => (typeof v === "number" && isFinite(v) ? v : null);
const int = (v) => (Number.isInteger(v) && v > 0 && v < 1e9 ? v : null);
const rid = () => [...crypto.getRandomValues(new Uint8Array(12))].map((x) => x.toString(16).padStart(2, "0")).join("");
// a shared lap that went without its telemetry: the same lap (same time) in the driver's account
// laps has it. Only for drivers who share telemetry (they have another shared lap with it).
const SHARES_TRACES = "EXISTS (SELECT 1 FROM community_laps c2 WHERE c2.user_id=?1 AND c2.trace IS NOT NULL)";
const ACCT_TRACE_WHERE = `s.uploader='acct:'||?1 AND ABS(a.time-?2)<0.002 AND s.game=?3 AND a.valid=1 AND a.trace IS NOT NULL AND ${SHARES_TRACES}`;
const ACCT_TRACE = `(EXISTS (SELECT 1 FROM laps a JOIN sessions s ON s.id=a.session_id WHERE s.uploader='acct:'||l.user_id AND ABS(a.time-l.time)<0.002 AND s.game=l.game AND a.valid=1 AND a.trace IS NOT NULL)
  AND EXISTS (SELECT 1 FROM community_laps c2 WHERE c2.user_id=l.user_id AND c2.trace IS NOT NULL))`;
async function sha256(t) {
  const b = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(t));
  return [...new Uint8Array(b)].map((x) => x.toString(16).padStart(2, "0")).join("");
}
const cleanAlias = (a) => (str(a, 32) || "").replace(/[\u0000-\u001f<>]/g, "").trim() || "Driver";
// a Pitlane HQ account session, or the older per-PC community token
async function me(req, env) {
  const a = await sessionAccount(req, env);
  if (a) {
    const u = await env.DB.prepare("SELECT id, alias, uploads_day, uploads FROM community_users WHERE id=?1").bind(a.id).first();
    return u ? { ...u, account: true } : null;
  }
  const h = req.headers.get("authorization") || "";
  const t = h.startsWith("Bearer ") ? h.slice(7).trim() : "";
  if (t.length < 20) return null;
  return env.DB.prepare("SELECT id, alias, uploads_day, uploads FROM community_users WHERE token_hash=?1").bind(await sha256(t)).first();
}
const CAR_RE = /^[A-Za-z0-9 _.\-]{1,80}$/;
const cleanFile = (n) => (typeof n === "string" ? n : "").replace(/[^A-Za-z0-9 _\-()+.,]/g, "").replace(/^[ .]+|[ .]+$/g, "").slice(0, 60) || "setup";
// at most 300 uploads a day per driver
async function countUpload(env, u) {
  const day = new Date().toISOString().slice(0, 10);
  const n = u.uploads_day === day ? u.uploads + 1 : 1;
  if (n > 300) return false;
  await env.DB.prepare("UPDATE community_users SET uploads_day=?2, uploads=?3 WHERE id=?1").bind(u.id, day, n).run();
  return true;
}

import { gameOf } from "./games.js";

// one shared lap per driver, car and track: a faster lap replaces the slower one, and a slower lap
// replaces a faster one only when it brings the telemetry the faster one lacks
async function keepBestLap(env, uid, x) {
  const old = await env.DB.prepare("SELECT time, game, trace IS NOT NULL AS traced FROM community_laps WHERE user_id=?1 AND car_id=?2 AND track_id=?3").bind(uid, x.carId, x.trackId).first();
  if (old && old.game === x.game && old.time <= x.time && (old.traced || !x.trace)) return { kept: true, traced: !!old.traced };
  if (x.count && !(await x.count())) return { limit: true };
  await env.DB.prepare(
    `INSERT INTO community_laps (id, user_id, car_id, car, track_id, track, time, sectors, trace, created, anon, game, shown) VALUES (?1,?2,?3,?4,?5,?6,?7,?8,?9,?10,?11,?12,?13)
     ON CONFLICT(user_id, car_id, track_id) DO UPDATE SET time=excluded.time, sectors=excluded.sectors, trace=excluded.trace, created=excluded.created, car=excluded.car, track=excluded.track, anon=excluded.anon, game=excluded.game, shown=excluded.shown`
  ).bind(rid(), uid, x.carId, str(x.car), x.trackId, str(x.track), x.time, x.sectors || null, x.trace || null, Date.now(), x.anon ? 1 : 0, x.game, x.shown || "nick").run();
  await markModel(env, x.game, x.trackId, x.carId);
  return { shared: true, traced: !!x.trace };
}

/** "Max Verstappen2" → "Max": only the first name of another driver is shown. */
function firstName(n) {
  const w = String(n || "").trim().split(/\s+/);
  return w[0] ? w[0].replace(/\d+$/, "") : "";
}

export async function community(req, env, url) {
  if (env.COMMUNITY !== "1") return err("the community is not enabled on this server", 404);
  const p = url.pathname.replace(/^\/community/, ""), m = req.method;
  if (m === "OPTIONS") return new Response(null, { headers: { ...JSONH, "access-control-allow-methods": "GET,POST,DELETE", "access-control-max-age": "86400", "access-control-allow-headers": "authorization,content-type" } });
  const body = m === "POST" ? await req.json().catch(() => ({})) : {};

  if (p === "/register" && m === "POST") {
    const id = rid(), token = rid() + rid();
    await env.DB.prepare("INSERT INTO community_users (id, token_hash, alias, created) VALUES (?1,?2,?3,?4)").bind(id, await sha256(token), cleanAlias(body.alias), Date.now()).run();
    return json({ id, token });
  }
  // every list is for one game: laps and analyses of different games are never mixed
  const game = gameOf(url.searchParams.get("game") || body.game);
  if (p === "/combos" && m === "GET") {
    const r = await env.DB.prepare(
      "SELECT track_id AS trackId, MAX(track) AS track, car_id AS carId, MAX(car) AS car, COUNT(*) AS laps, MIN(time) AS best FROM community_laps WHERE game=?1 AND COALESCE(shown,'')<>'model' GROUP BY track_id, car_id ORDER BY laps DESC LIMIT 500"
    ).bind(game).all();
    return json({ combos: r.results || [] });
  }
  // the model, learnt on the server from every real lap it knows (shared or not, rivals of races): only
  // what it learnt goes out (the record and the next-level laps), never anyone's laps as such
  if (p === "/model" && m === "GET") {
    const t = +url.searchParams.get("trackId"), c = +url.searchParams.get("carId");
    if (!t || !c) return err("trackId and carId", 400);
    const md = await getModel(env, game, t, c);
    const fs = await env.DB.prepare(`SELECT l.time, CASE WHEN l.anon=1 THEN 'Anonymous' WHEN l.shown='iracing' AND COALESCE(u.iracing,'')<>'' THEN u.iracing ELSE u.alias END AS alias FROM community_laps l JOIN community_users u ON u.id=l.user_id WHERE l.track_id=?1 AND l.car_id=?2 AND l.game=?3 AND COALESCE(l.shown,'')<>'model' ORDER BY l.time LIMIT 1`).bind(t, c, game).first();
    return json({ ...md, fastShared: fs || null });
  }
  if (p === "/laps" && m === "GET") {
    const t = +url.searchParams.get("trackId"), c = +url.searchParams.get("carId");
    if (!t || !c) return err("trackId and carId", 400);
    // signed in: your own laps are marked as yours (also the anonymous ones; only you see that)
    const who = await me(req, env).catch(() => null);
    const r = await env.DB.prepare(
      `SELECT l.id, l.user_id AS uid, CASE WHEN l.anon=1 THEN 'Anonymous' WHEN l.shown='iracing' AND COALESCE(u.iracing,'')<>'' THEN u.iracing ELSE u.alias END AS alias, l.time, l.sectors, l.created, (l.trace IS NOT NULL OR ${ACCT_TRACE}) AS hasTrace, l.car, l.track FROM community_laps l JOIN community_users u ON u.id=l.user_id
       WHERE l.track_id=?1 AND l.car_id=?2 AND l.game=?3 AND COALESCE(l.shown,'')<>'model' ORDER BY l.time LIMIT 200`
    ).bind(t, c, game).all();
    // field: another driver of a race someone drove, anonymous (their speed trace with estimated pedals)
    return json({ laps: (r.results || []).map(({ uid, ...x }) => ({ ...x, mine: !!who && uid === who.id, field: String(uid).startsWith("o:"), hasTrace: !!x.hasTrace, sectors: x.sectors ? JSON.parse(x.sectors) : null })) });
  }
  if (p.startsWith("/laps/") && m === "GET") {
    const l = await env.DB.prepare("SELECT l.*, CASE WHEN l.anon=1 THEN 'Anonymous' WHEN l.shown='iracing' AND COALESCE(u.iracing,'')<>'' THEN u.iracing ELSE u.alias END AS alias FROM community_laps l JOIN community_users u ON u.id=l.user_id WHERE l.id=?1").bind(p.slice(6)).first();
    if (!l) return err("not found", 404);
    let trace = l.trace;
    if (!trace) {
      const a = await env.DB.prepare(`SELECT a.trace FROM laps a JOIN sessions s ON s.id=a.session_id WHERE ${ACCT_TRACE_WHERE} LIMIT 1`).bind(l.user_id, l.time, l.game).first();
      if (a) trace = a.trace;
    }
    return json({ id: l.id, alias: l.alias, game: l.game, time: l.time, car: l.car, track: l.track, carId: l.car_id, trackId: l.track_id, sectors: l.sectors ? JSON.parse(l.sectors) : null, trace: trace ? JSON.parse(await openData(env, trace)) : null });
  }
  if (p === "/reports" && m === "GET") {
    const t = +url.searchParams.get("trackId"), c = +url.searchParams.get("carId");
    const r = await env.DB.prepare(
      `SELECT r.id, r.user_id AS uid, CASE WHEN r.anon=1 THEN 'Anonymous' WHEN r.shown='iracing' AND COALESCE(u.iracing,'')<>'' THEN u.iracing ELSE u.alias END AS alias, r.car, r.track, r.created, COALESCE(r.finish, CASE WHEN substr(r.data,1,4)='enc:' THEN NULL ELSE json_extract(r.data,'$.finish') END) AS finish,
       COALESCE(r.field, CASE WHEN substr(r.data,1,4)='enc:' THEN NULL ELSE json_extract(r.data,'$.field') END) AS field,
       COALESCE(r.best, CASE WHEN substr(r.data,1,4)='enc:' THEN NULL ELSE json_extract(r.data,'$.best') END) AS best
       FROM community_reports r JOIN community_users u ON u.id=r.user_id WHERE (?1=0 OR r.track_id=?1) AND (?2=0 OR r.car_id=?2) AND r.game=?3 ORDER BY r.created DESC LIMIT 100`
    ).bind(t || 0, c || 0, game).all();
    const who = await me(req, env).catch(() => null);
    return json({ reports: (r.results || []).map(({ uid, ...x }) => ({ ...x, mine: !!who && uid === who.id })) });
  }
  // track outlines (from clean best laps): anyone can read them
  if (p === "/trackmaps" && m === "GET") {
    const t = +url.searchParams.get("trackId");
    if (!t) return err("trackId", 400);
    const r = await env.DB.prepare("SELECT track, n, len, pts, time, created FROM track_maps WHERE game=?1 AND track_id=?2").bind(game, t).first();
    if (!r) return err("no layout for this track yet", 404);
    const pts = JSON.parse(r.pts);
    return new Response(JSON.stringify({ trackId: t, game, track: r.track, n: r.n, len: r.len, x: pts.x, y: pts.y, time: r.time, updated: r.created }), { headers: { ...JSONH, "cache-control": "public, max-age=3600" } });
  }
  // the admins of this server (ADMINS) can remove anything shared in the community
  // admins: every lap of a shared race analysis counts as valid again (a wrong cut check)
  const um = p.match(/^\/admin\/reports\/([A-Za-z0-9_.:-]{1,64})\/uncut$/);
  if (um && m === "POST") {
    const acc = await sessionAccount(req, env);
    if (!acc || !isAdmin(env, acc.id)) return err("only the admins of this server can do this", 403);
    const r = await env.DB.prepare("SELECT data FROM community_reports WHERE id=?1").bind(um[1]).first();
    if (!r) return err("not found", 404);
    const d = JSON.parse(await openData(env, r.data));
    if (Array.isArray(d.laps)) d.laps = d.laps.map((l) => (l.i ? l : { ...l, cut: false })); // only the laps without incidents
    await env.DB.prepare("UPDATE community_reports SET data=?2 WHERE id=?1").bind(um[1], await sealData(env, JSON.stringify(d))).run();
    return json({ ok: true });
  }
  // the admin profile: who really shared each item (also anonymous ones and Drinks drivers), and the accounts
  // the admin deletes an account: the account, its synced data, its laps and everything it shared
  const du = p.match(/^\/admin\/users\/([A-Za-z0-9]{8,40})$/);
  if (du && m === "DELETE") {
    const acc = await sessionAccount(req, env);
    if (!acc || !isAdmin(env, acc.id)) return err("only the admins of this server can do this", 403);
    const id = du[1];
    if (id === acc.id || isAdmin(env, id)) return err("an admin account cannot be deleted from here", 400);
    await env.DB.batch([
      env.DB.prepare("DELETE FROM laps WHERE session_id IN (SELECT id FROM sessions WHERE uploader=?1)").bind("acct:" + id),
      env.DB.prepare("DELETE FROM sessions WHERE uploader=?1").bind("acct:" + id),
      env.DB.prepare("DELETE FROM community_laps WHERE user_id IN (SELECT id FROM community_users WHERE owner=?1)").bind(id),
      env.DB.prepare("DELETE FROM community_users WHERE owner=?1").bind(id),
    ]);
    await deleteAccount(env, id);
    return json({ deleted: true });
  }
  if (m === "GET" && p === "/admin/status") {
    const acc = await sessionAccount(req, env);
    if (!acc || !isAdmin(env, acc.id)) return err("only the admins of this server can do this", 403);
    const st = await env.DB.prepare("SELECT k, v, at FROM app_state WHERE k IN ('mail_error','mail_ok')").all().catch(() => ({ results: [] }));
    const get = (k) => (st.results || []).find((x) => x.k === k);
    const e = get("mail_error"), ok = get("mail_ok");
    const counts = await env.DB.prepare("SELECT (SELECT COUNT(*) FROM accounts) AS accounts, (SELECT COUNT(*) FROM accounts WHERE verified=1) AS verified, (SELECT COUNT(*) FROM sessions) AS sessions, (SELECT COUNT(*) FROM community_laps) AS shared, (SELECT COUNT(*) FROM model_laps) AS learnt, (SELECT COUNT(*) FROM model_cache) AS models").first().catch(() => null);
    return json({
      mail: { ready: mailReady(env), via: smtpReady(env) ? "smtp" : env.RESEND_API_KEY ? "resend" : "", from: env.EMAIL_FROM || "", lastOk: ok ? ok.at : 0, lastError: e && (!ok || e.at > ok.at) ? { at: e.at, ...JSON.parse(e.v || "{}") } : null },
      counts,
    });
  }
  if (m === "GET" && (p === "/admin/uploads" || p === "/admin/users")) {
    const acc = await sessionAccount(req, env);
    if (!acc || !isAdmin(env, acc.id)) return err("only the admins of this server can do this", 403);
    if (p === "/admin/users") {
      const r = await env.DB.prepare(`SELECT a.id, a.display, a.name_kind AS nameKind, a.anon, a.verified, a.created, a.totp_on AS twoFactor,
        (SELECT COUNT(*) FROM sessions s WHERE s.uploader='acct:'||a.id) AS sessions,
        (SELECT COUNT(*) FROM community_laps l WHERE l.user_id=a.id) AS laps,
        (SELECT COUNT(*) FROM community_users g WHERE g.owner=a.id) AS guests
        FROM accounts a ORDER BY a.created DESC LIMIT 500`).all();
      return json({ users: (r.results || []).map((x) => ({ ...x, admin: isAdmin(env, x.id) })) });
    }
    const q = (t, extra) => env.DB.prepare(`SELECT x.id, '${t}' AS kind, x.car, x.track, x.created, x.anon, COALESCE(x.shown,'nick') AS shown, ${extra}
      u.id AS userId, u.alias, u.iracing, u.owner, o.display AS ownerName, ac.display AS account
      FROM community_${t} x JOIN community_users u ON u.id=x.user_id LEFT JOIN accounts o ON o.id=u.owner LEFT JOIN accounts ac ON ac.id=u.id
      ORDER BY x.created DESC LIMIT 300`).all();
    const [l, r] = await Promise.all([q("laps", "x.time,"), q("reports", "x.best AS time,")]);
    const items = [...(l.results || []), ...(r.results || [])].sort((a, b) => b.created - a.created).map((x) => ({
      ...x, shownAs: x.anon ? "Anonymous" : x.shown === "iracing" && x.iracing ? x.iracing : x.alias,
      realUploader: x.owner ? `${x.alias} (Drinks · ${x.ownerName || x.owner})` : x.account || x.alias,
    }));
    return json({ items });
  }
  const am = p.match(/^\/admin\/(laps|reports|setups|trackmaps)\/([A-Za-z0-9_.:-]{1,64})$/);
  if (am && m === "DELETE") {
    const acc = await sessionAccount(req, env);
    if (!acc || !isAdmin(env, acc.id)) return err("only the admins of this server can do this", 403);
    const [, kind, id] = am;
    const q = {
      laps: ["DELETE FROM community_laps WHERE id=?1", id],
      reports: ["DELETE FROM community_reports WHERE id=?1", id],
      setups: ["DELETE FROM community_setups WHERE id=?1", id],
      trackmaps: ["DELETE FROM track_maps WHERE track_id=?1 AND game=?2", +id || 0, game],
    }[kind];
    const r = await env.DB.prepare(q[0]).bind(...q.slice(1)).run();
    return json({ deleted: !!(r.meta && r.meta.changes) });
  }
  if (p.startsWith("/reports/") && m === "GET") {
    const r = await env.DB.prepare("SELECT r.*, CASE WHEN r.anon=1 THEN 'Anonymous' WHEN r.shown='iracing' AND COALESCE(u.iracing,'')<>'' THEN u.iracing ELSE u.alias END AS alias FROM community_reports r JOIN community_users u ON u.id=r.user_id WHERE r.id=?1").bind(p.slice(9)).first();
    if (!r) return err("not found", 404);
    const data = JSON.parse(await openData(env, r.data));
    // the other drivers only by their first name (their privacy); the sharer as "Anonymous" when asked
    for (const k of ["results", "brakes"]) if (Array.isArray(data[k])) data[k] = data[k].map((x) => (!x ? x : x.me ? (r.anon ? { ...x, name: "Anonymous" } : x) : { ...x, name: firstName(x.name) }));
    return json({ ...data, id: r.id, alias: r.alias, game: r.game, shared: true });
  }

  // the current season schedule: public to read, uploaded by the accounts in SEASON_UPLOADERS
  if (p === "/season" && m === "GET") {
    const c = await env.DB.prepare("SELECT updated, chunks FROM season_cache WHERE k='current'").first();
    if (!c) return err("no season schedule on this server yet", 404);
    const r = await env.DB.prepare("SELECT data FROM season_chunks WHERE k='current' AND idx<?1 ORDER BY idx").bind(c.chunks).all();
    return new Response('{"updated":' + c.updated + ',"season":' + (r.results || []).map((x) => x.data).join("") + "}", { headers: { ...JSONH, "cache-control": "public, max-age=900" } });
  }
  if (p === "/setups/cars" && m === "GET") {
    const r = await env.DB.prepare("SELECT car_path AS carPath, MAX(car) AS car, COUNT(*) AS n FROM community_setups WHERE game=?1 GROUP BY car_path ORDER BY n DESC LIMIT 500").bind(game).all();
    return json({ cars: r.results || [] });
  }
  if (p === "/setups" && m === "GET") {
    const car = url.searchParams.get("car") || "", track = (url.searchParams.get("track") || "").slice(0, 80), q = (url.searchParams.get("q") || "").slice(0, 60);
    const r = await env.DB.prepare(
      `SELECT s.id, u.alias, s.car_path AS carPath, s.car, s.track, s.name, s.notes, s.size, s.downloads, s.created FROM community_setups s JOIN community_users u ON u.id=s.user_id
       WHERE (?1='' OR s.car_path=?1) AND (?2='' OR s.track LIKE '%'||?2||'%') AND (?3='' OR s.name LIKE '%'||?3||'%' OR s.car LIKE '%'||?3||'%' OR s.track LIKE '%'||?3||'%') AND s.game=?4
       ORDER BY s.downloads DESC, s.created DESC LIMIT 200`
    ).bind(car, track, q, game).all();
    return json({ setups: r.results || [] });
  }
  if (p.startsWith("/setups/") && p !== "/setups/mine" && m === "GET") {
    const id = p.slice(8);
    const s = await env.DB.prepare("SELECT s.*, u.alias FROM community_setups s JOIN community_users u ON u.id=s.user_id WHERE s.id=?1").bind(id).first();
    if (!s) return err("not found", 404);
    await env.DB.prepare("UPDATE community_setups SET downloads=downloads+1 WHERE id=?1").bind(id).run();
    return json({ id: s.id, alias: s.alias, carPath: s.car_path, car: s.car, track: s.track, name: s.name, notes: s.notes, sha: s.sha, data: s.data });
  }

  // everything below needs the driver's token
  let u = await me(req, env);
  if (!u) return err("wrong or missing token", 401);
  // Friday night mode: an admin shares the laps of friends who drive on the admin's PC,
  // each under the friend's own name (one community driver per name, owned by that admin)
  if (m === "POST" && (p === "/laps" || p === "/reports") && typeof body.guest === "string" && body.guest.trim()) {
    if (!u.account || !isAdmin(env, u.id)) return err("only the admins of this server can share laps for other drivers", 403);
    const name = cleanAlias(body.guest);
    const gid = "guest-" + (await sha256(u.id + ":" + name.toLowerCase())).slice(0, 20);
    // your own Drinks drivers never clash with each other or with you, only with the rest of the platform
    if (await nameTaken(env, name, u.id)) return json({ error: `"${name}" is already used by another driver on Pitlane HQ, choose another name`, code: "name_taken" }, 409);
    await env.DB.prepare("INSERT INTO community_users (id, token_hash, alias, created, owner) VALUES (?1,?2,?3,?4,?5) ON CONFLICT(id) DO UPDATE SET alias=excluded.alias, owner=excluded.owner")
      .bind(gid, await sha256("guest:" + gid + ":" + rid()), name, Date.now(), u.id).run();
    u = await env.DB.prepare("SELECT id, alias, uploads_day, uploads FROM community_users WHERE id=?1").bind(gid).first();
    body.anon = false;
    body.as = "nick";
  }
  // the name a shared item goes under, asked before every share: anonymous (stays anonymous
  // whatever you change later), your nickname or your iRacing name (both follow your changes)
  if (body.as === "anon") body.anon = true;
  else if (body.as === "nick" || body.as === "iracing") body.anon = false;
  const shownAs = body.as === "iracing" ? "iracing" : "nick";
  if (shownAs === "iracing" && typeof body.iracingName === "string" && body.iracingName.trim())
    await env.DB.prepare("UPDATE community_users SET iracing=?2 WHERE id=?1").bind(u.id, cleanAlias(body.iracingName)).run();
  // is this name free? (Drinks drivers of an admin only clash with other people on the platform)
  if (p === "/name-check" && m === "POST") {
    if (!u.account || !isAdmin(env, u.id)) return err("only the admins of this server can do this", 403);
    return json({ free: !(await nameTaken(env, cleanAlias(body.name), u.id)) });
  }
  if (p === "/season" && m === "POST") {
    const allowed = String(env.SEASON_UPLOADERS || env.ADMINS || "").split(",").map((x) => x.trim()).filter(Boolean);
    if (!u.account || !allowed.includes(u.id)) return err("this account cannot publish the season schedule", 403);
    const data = JSON.stringify(body.season || null);
    if (data.length < 100 || data.length > 12000000 || !Array.isArray(body.season.seasons)) return err("season schedule missing or too large", 400);
    const parts = [];
    for (let i = 0; i < data.length; i += 900000) parts.push(data.slice(i, i + 900000));
    await env.DB.batch([
      env.DB.prepare("DELETE FROM season_chunks WHERE k='current'"),
      ...parts.map((d, i) => env.DB.prepare("INSERT INTO season_chunks (k, idx, data) VALUES ('current',?1,?2)").bind(i, d)),
      env.DB.prepare("INSERT INTO season_cache (k, updated, chunks) VALUES ('current',?1,?2) ON CONFLICT(k) DO UPDATE SET updated=excluded.updated, chunks=excluded.chunks").bind(Date.now(), parts.length),
    ]);
    return json({ published: true, size: data.length });
  }
  if (p === "/setups/mine" && m === "GET") {
    const r = await env.DB.prepare("SELECT id, car_path AS carPath, car, track, name, notes, size, downloads, created FROM community_setups WHERE user_id=?1 ORDER BY created DESC").bind(u.id).all();
    return json({ setups: (r.results || []).map((x) => ({ ...x, alias: u.alias, mine: true })) });
  }
  if (p === "/setups" && m === "POST") {
    if (typeof body.carPath !== "string" || !CAR_RE.test(body.carPath) || body.carPath.includes("..")) return err("unknown car folder", 400);
    if (typeof body.data !== "string" || !/^[A-Za-z0-9+/=]+$/.test(body.data) || body.data.length > 560000) return err("setup missing or too large (400 KB max)", 400);
    if (typeof body.sha !== "string" || !/^[0-9a-f]{64}$/.test(body.sha)) return err("missing checksum", 400);
    const bytes = Uint8Array.from(atob(body.data), (c) => c.charCodeAt(0));
    if ((await crypto.subtle.digest("SHA-256", bytes).then((b) => [...new Uint8Array(b)].map((x) => x.toString(16).padStart(2, "0")).join(""))) !== body.sha) return err("checksum does not match", 400);
    if (!(await countUpload(env, u))) return err("too many uploads today", 429);
    const id = rid();
    const r = await env.DB.prepare(
      "INSERT INTO community_setups (id, user_id, car_path, car, track, name, notes, data, sha, size, created, game) VALUES (?1,?2,?3,?4,?5,?6,?7,?8,?9,?10,?11,?12) ON CONFLICT(user_id, sha) DO NOTHING"
    ).bind(id, u.id, body.carPath, str(body.car), str(body.track, 80), cleanFile(body.name), str(body.notes, 1000), body.data, body.sha, bytes.length, Date.now(), game).run();
    if (!r.meta || !r.meta.changes) return json({ kept: "you already shared this setup" });
    return json({ shared: true, id });
  }
  if (p.startsWith("/setups/") && m === "DELETE") {
    await env.DB.prepare("DELETE FROM community_setups WHERE id=?1 AND user_id=?2").bind(p.slice(8), u.id).run();
    return json({ deleted: true });
  }
  if (p === "/me" && m === "POST") {
    if (u.account) return err("change your public name in your account", 400);
    await env.DB.prepare("UPDATE community_users SET alias=?2 WHERE id=?1").bind(u.id, cleanAlias(body.alias)).run();
    return json({ ok: true });
  }
  if (p === "/me" && m === "DELETE") {
    await env.DB.batch([
      env.DB.prepare("DELETE FROM community_laps WHERE user_id=?1").bind(u.id),
      env.DB.prepare("DELETE FROM community_reports WHERE user_id=?1").bind(u.id),
      env.DB.prepare("DELETE FROM community_setups WHERE user_id=?1").bind(u.id),
      ...(u.account ? [] : [env.DB.prepare("DELETE FROM community_users WHERE id=?1").bind(u.id)]),
    ]);
    return json({ deleted: true });
  }
  // a lap from your account to the community: the one you chose, or the session's fastest valid lap
  // (with telemetry when it has some; without it, only the time goes and the leaderboard says so)
  if (p === "/share-lap" && m === "POST") {
    if (!u.account) return err("sign in with your Pitlane HQ account", 401);
    const s = await env.DB.prepare("SELECT * FROM sessions WHERE id=?1 AND uploader=?2").bind(String(body.sessionId || ""), "acct:" + u.id).first();
    if (!s) return err("session not found in your account", 404);
    const lap = body.lapId
      ? await env.DB.prepare("SELECT time, sectors, trace, valid FROM laps WHERE id=?1 AND session_id=?2").bind(String(body.lapId), s.id).first()
      : (await env.DB.prepare("SELECT time, sectors, trace FROM laps WHERE session_id=?1 AND valid=1 AND time>0 AND trace IS NOT NULL ORDER BY time LIMIT 1").bind(s.id).first()) ||
        (await env.DB.prepare("SELECT time, sectors, trace FROM laps WHERE session_id=?1 AND valid=1 AND time>0 ORDER BY time LIMIT 1").bind(s.id).first());
    if (!lap || !(lap.time > 10)) return err("this session has no valid lap to share", 404);
    // only valid laps go to the community: no cutting, no pit lane
    if (body.lapId && lap.valid !== 1) return err("this lap is not valid (off track or the pit lane): it cannot be shared", 400);
    const name = s.track + (s.track_config ? " · " + s.track_config : "");
    const g = s.game || "iracing";
    // the iRacing ids of the track and car: from the session (newer PCs), from the app (it knows your
    // tracks and cars), or from what others shared with the same names
    let trackId = s.track_id, carId = s.car_id;
    if (!trackId && int(body.trackId)) trackId = int(body.trackId);
    if (!carId && int(body.carId)) carId = int(body.carId);
    if (!trackId || !carId) {
      const x = await env.DB.prepare("SELECT track_id, car_id FROM community_laps WHERE (lower(track)=lower(?1) OR lower(track)=lower(?2)) AND lower(car)=lower(?3) AND game=?4 ORDER BY (track_id<900000000) DESC LIMIT 1").bind(name, s.track, s.car, g).first()
        || await env.DB.prepare("SELECT track_id, car_id FROM community_reports WHERE (lower(track)=lower(?1) OR lower(track)=lower(?2)) AND lower(car)=lower(?3) AND game=?4 AND track_id>0 AND car_id>0 ORDER BY (track_id<900000000) DESC LIMIT 1").bind(name, s.track, s.car, g).first();
      if (x) { trackId = trackId || x.track_id; carId = carId || x.car_id; }
    }
    if (!trackId) {
      const t = await env.DB.prepare("SELECT track_id FROM community_laps WHERE (track=?1 OR track=?2) AND game=?3 LIMIT 1").bind(name, s.track, g).first()
        || await env.DB.prepare("SELECT track_id FROM track_maps WHERE (track=?1 OR track=?2) AND game=?3 LIMIT 1").bind(name, s.track, g).first();
      if (t) trackId = t.track_id;
    }
    if (!carId) {
      const c = await env.DB.prepare("SELECT car_id FROM community_laps WHERE car=?1 AND game=?2 LIMIT 1").bind(s.car, g).first();
      if (c) carId = c.car_id;
    }
    // still unknown: another session of this account (or anyone's) with the same track and car names
    // recorded by a newer PC carries the ids
    if (!trackId || !carId) {
      const o = await env.DB.prepare("SELECT track_id, car_id FROM sessions WHERE game=?1 AND lower(car)=lower(?2) AND (lower(track)=lower(?3) OR lower(track||' · '||COALESCE(track_config,''))=lower(?4)) AND track_id>0 AND car_id>0 ORDER BY (uploader=?5) DESC, started DESC LIMIT 1")
        .bind(g, s.car, s.track, name, "acct:" + u.id).first();
      if (o) { trackId = trackId || o.track_id; carId = carId || o.car_id; }
    }
    // nobody recorded this track or car with its ids yet: provisional ids from the names, so the lap is
    // shared anyway; the first session that brings the real ids moves everything over (reconcileIds)
    if (!trackId) trackId = await pseudoId("t", g, name);
    if (!carId) carId = await pseudoId("c", g, s.car);
    if (!s.track_id || !s.car_id) await env.DB.prepare("UPDATE sessions SET track_id=COALESCE(track_id,?2), car_id=COALESCE(car_id,?3) WHERE id=?1").bind(s.id, trackId, carId).run();
    // your faster lap stays, unless it has no telemetry and this one does
    const r = await keepBestLap(env, u.id, { game: g, carId, trackId, car: s.car, track: name, time: lap.time, sectors: lap.sectors, trace: lap.trace, anon: !!body.anon, shown: shownAs, count: () => countUpload(env, u) });
    if (r.limit) return err("too many uploads today", 429);
    if (r.kept) return json({ kept: "your faster lap is already shared", traced: r.traced });
    return json({ shared: true, traced: r.traced });
  }
  if (p === "/laps" && m === "POST") {
    const carId = int(body.carId), trackId = int(body.trackId), time = num(body.time);
    if (!carId || !trackId || !time || time <= 10 || time > 3600) return err("lap needs carId, trackId and time", 400);
    const sectors = Array.isArray(body.sectors) ? JSON.stringify(body.sectors.filter((x) => typeof x === "number").slice(0, 10)) : null;
    // the top 3 of a race you drove: their best lap times go up anonymously (no name, no telemetry), one
    // anonymous driver per real driver, so their faster lap of a later race replaces this one
    if (typeof body.other === "string" && /^[0-9a-f]{16,64}$/i.test(body.other)) {
      if (!u.account) return err("sign in with your Pitlane HQ account to share other drivers' times", 401);
      const oid = "o:" + (await sha256("other|" + (env.DATA_KEY || "") + "|" + body.other.toLowerCase())).slice(0, 24);
      await env.DB.prepare("INSERT INTO community_users (id, token_hash, alias, created, owner) VALUES (?1,?2,'Anonymous',?3,?4) ON CONFLICT(id) DO NOTHING").bind(oid, "other:" + oid, Date.now(), u.id).run();
      // the speed trace their position gave (pedals estimated): the model, the leaderboard and comparisons use it
      const plain = body.trace && Array.isArray(body.trace.d) && body.trace.d.length >= 60 ? JSON.stringify({ ...body.trace, src: "field" }) : null;
      if (plain && plain.length > 900000) return err("lap trace too large", 400);
      // on the leaderboard only when the PC says so (faster than you, with their trace); the rest teach the model unseen
      const r = await keepBestLap(env, oid, { game, carId, trackId, car: body.car, track: body.track, time, sectors, trace: await sealData(env, plain), anon: true, shown: body.hidden ? "model" : "nick", count: () => countUpload(env, u) });
      if (r.limit) return err("too many uploads today", 429);
      return json(r.kept ? { kept: "a faster lap of this driver is already shared" } : { shared: true });
    }
    const plainTrace = body.trace ? JSON.stringify(body.trace) : null;
    if (plainTrace && plainTrace.length > 900000) return err("lap trace too large", 400);
    const trace = await sealData(env, plainTrace);
    // your faster lap stays, unless it has no telemetry and this one does: then the whole lap is worth more
    const r = await keepBestLap(env, u.id, { game, carId, trackId, car: body.car, track: body.track, time, sectors, trace, anon: !!body.anon, shown: shownAs, count: () => countUpload(env, u) });
    if (r.limit) return err("too many uploads today", 429);
    return json(r.kept ? { kept: "your faster lap is already shared" } : { shared: true });
  }
  // a track outline from a lap without incidents: kept when it is the fastest one
  if (p === "/trackmaps" && m === "POST") {
    const trackId = int(body.trackId), time = num(body.time), n = int(body.n);
    const x = body.x, y = body.y;
    if (!trackId || !time || time <= 10 || time > 3600) return err("layout needs trackId and the lap time", 400);
    if (body.clean !== true) return err("only laps without incidents", 400);
    if (!(n >= 100 && n <= 3000) || !Array.isArray(x) || !Array.isArray(y) || x.length !== n || y.length !== n) return err("layout points missing", 400);
    const ok = (v) => typeof v === "number" && isFinite(v) && Math.abs(v) < 30000;
    if (!x.every(ok) || !y.every(ok)) return err("layout points out of range", 400);
    const r2 = (v) => Math.round(v * 10) / 10;
    const old = await env.DB.prepare("SELECT time FROM track_maps WHERE game=?1 AND track_id=?2").bind(game, trackId).first();
    if (old && old.time <= time) return json({ kept: "a faster clean lap already drew this track" });
    if (!(await countUpload(env, u))) return err("too many uploads today", 429);
    await env.DB.prepare(
      `INSERT INTO track_maps (game, track_id, track, n, len, pts, time, user_id, created) VALUES (?1,?2,?3,?4,?5,?6,?7,?8,?9)
       ON CONFLICT(game, track_id) DO UPDATE SET track=excluded.track, n=excluded.n, len=excluded.len, pts=excluded.pts, time=excluded.time, user_id=excluded.user_id, created=excluded.created`
    ).bind(game, trackId, str(body.track), n, num(body.len), JSON.stringify({ x: x.map(r2), y: y.map(r2) }), time, u.id, Date.now()).run();
    return json({ shared: true });
  }
  if (p === "/reports" && m === "POST") {
    const data = JSON.stringify(body.report || {});
    if (data.length < 20 || data.length > 900000) return err("report missing or too large", 400);
    if (!(await countUpload(env, u))) return err("too many uploads today", 429);
    const r = body.report;
    await env.DB.prepare("INSERT INTO community_reports (id, user_id, car_id, car, track_id, track, data, created, anon, game, finish, field, best, shown) VALUES (?1,?2,?3,?4,?5,?6,?7,?8,?9,?10,?11,?12,?13,?14)")
      .bind(rid(), u.id, int(r.carId), str(r.car), int(r.trackId), str(r.track), await sealData(env, data), Date.now(), body.anon ? 1 : 0, gameOf(body.game || r.game), int(r.finish), int(r.field), num(r.best), shownAs).run();
    return json({ shared: true });
  }
  return err("not found", 404);
}
