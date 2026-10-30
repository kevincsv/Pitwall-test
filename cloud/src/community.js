// Community: drivers who choose to share their best laps (time, and if they
// want the whole lap trace) and race analyses. Reading is public; writing
// needs the device token given at registration. Turn it on for the central
// server with the variable COMMUNITY = "1".
import { sessionAccount, isAdmin, nameTaken, purgeAccount, emailHash, cleanName } from "./accounts.js";
import { mailReady, mailLog, mailDomain } from "./email.js";
import { sealData, openData } from "./crypt.js";
import { getModel, forCompound, getCarCard, markModel, forgetLap, pseudoId, PSEUDO_MIN, moveDriver } from "./model.js";
import { linkDriver, unlinkDriver } from "./driverlinks.js";
import { recordSeen, seenSummary } from "./seasonseen.js";
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
// race rivals (ids "o:…") did not join Pitlane HQ: their laps are anonymous and only an admin with admin mode on (the
// apps send X-Pitlane-Admin: 1 then) sees their name. The SQL of a lap's shown name, for the lap table as `l` and its
// community user as `u`
const seesRivals = (req, env, who) => !!who && isAdmin(env, who.id) && req.headers.get("x-pitlane-admin") === "1";
export const shownName = (l, u, rivals) => `CASE WHEN ${l}.anon=1${rivals ? ` AND ${l}.user_id NOT LIKE 'o:%'` : ""} THEN 'Anonymous' WHEN ${l}.shown='iracing' AND COALESCE(${u}.iracing,'')<>'' THEN ${u}.iracing ELSE ${u}.alias END`;
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
import { famId, famIds, famName, famGroups, noteCar } from "./carfamily.js";
import { proRoutes } from "./lemon.js";
import { coachTipRoutes } from "./coachtips.js";
import { lmuApiRoutes } from "./lmuapi.js";
import { turnsFromPath } from "./trackgeo.js";
import { turnCount, noteTurnCount, rebuildTrackMaps } from "./trackmaps.js";
import { estimateTrace } from "./pedals.js";
import { discordLapAlert } from "./discord.js";
import { addFound, editFound, foundLeagues, leagueGame, scanLeagues } from "./leaguescan.js";
import { catMap, catOf, licOf, CATS } from "./categories.js";
import { lmuClass, wetOf, clsParam, classLaps } from "./lmuclass.js";

// one shared lap per driver, car and track: a faster lap replaces the slower one, and a slower lap
// replaces a faster one only when it brings the telemetry the faster one lacks
// leagues a driver may post: supporters (Patreon or by hand) more
const LEAGUES_FREE = 3, LEAGUES_SUPPORTER = 10;
// a test drive: anything can happen in one, so its laps never go to the leaderboard nor teach the model
export const isTestDrive = (kind) => /test/i.test(String(kind || ""));
const officialOf = (v) => (typeof v === "boolean" ? (v ? 1 : 0) : v === 1 || v === 0 ? v : null);

// the community's id of a race rival: from the opaque key their PC-side id gives (never the iRacing id)
async function otherId(env, key) {
  return "o:" + (await sha256("other|" + (env.DATA_KEY || "") + "|" + String(key).toLowerCase())).slice(0, 24);
}
// a race rival's name as the game shows it ("Juan Pablo Montoya"), kept for the admins only (seesRivals), cleaned
// of anything that is not a letter, a number or ' . -; "" when there is no name
export function driverName(v) {
  const w = String(v || "").normalize("NFC").split(/\s+/).map((x) => x.replace(/[^\p{L}\p{N}'.-]/gu, "")).filter(Boolean);
  if (!w.length || /^anonym/i.test(w[0])) return "";
  return [...w.join(" ")].slice(0, 48).join("");
}
// the short form older PCs sent ("Juan M."): rivals named so before take their whole name when it comes
export function shortDriverName(v) {
  const w = String(v || "").normalize("NFC").split(/\s+/).map((x) => x.replace(/[^\p{L}\p{N}'.-]/gu, "")).filter(Boolean);
  if (!w.length) return "";
  const first = [...w[0]].slice(0, 20).join("").replace(/\.$/, "");
  if (!first || /^anonym/i.test(first)) return "";
  if (w.length === 1) return first;
  const ini = [...w[w.length - 1]].find((c) => /[\p{L}\p{N}]/u.test(c));
  return ini ? first + " " + ini.toUpperCase() + "." : first;
}

// what a lap whose trace is sealed already was driven in (a lap from a session in the account): bits, 2 a wet track, 4 a damp one, 1 rain
async function sealedWet(env, trace) {
  if (!trace) return null;
  try { const tr = JSON.parse(await openData(env, trace)); return wetOf(tr && tr.f); } catch { return null; }
}

export async function keepBestLap(env, uid, x) {
  x = { ...x, carId: await noteCar(env, x.game, x.carId, x.car) }; // one board for the brands of one car (carfamily.js)
  const old = await env.DB.prepare("SELECT time, game, trace IS NOT NULL AS traced FROM community_laps WHERE user_id=?1 AND car_id=?2 AND track_id=?3").bind(uid, x.carId, x.trackId).first();
  if (old && old.game === x.game && old.time <= x.time && (old.traced || !x.trace)) return { kept: true, traced: !!old.traced };
  if (x.count && !(await x.count())) return { limit: true };
  // Le Mans Ultimate's class (its class boards), and whether the track was wet or damp and whether it rained (every game): from the flags of the trace before it was
  // sealed when the caller has them, else from the sealed trace itself (only here, when the lap is really kept)
  const cls = x.game === "lmu" ? lmuClass(x.cls, x.car) : null;
  const wet = x.wet !== undefined ? x.wet : await sealedWet(env, x.trace);
  await env.DB.prepare(
    `INSERT INTO community_laps (id, user_id, car_id, car, track_id, track, time, sectors, trace, created, anon, game, shown, lic, cat, official, ai, cls, wet) VALUES (?1,?2,?3,?4,?5,?6,?7,?8,?9,?10,?11,?12,?13,?14,?15,?16,?17,?18,?19)
     ON CONFLICT(user_id, car_id, track_id) DO UPDATE SET time=excluded.time, sectors=excluded.sectors, trace=excluded.trace, created=excluded.created, car=excluded.car, track=excluded.track, anon=excluded.anon, game=excluded.game, shown=excluded.shown,
       lic=COALESCE(excluded.lic, community_laps.lic), cat=COALESCE(excluded.cat, community_laps.cat), official=excluded.official, ai=excluded.ai, cls=COALESCE(excluded.cls, community_laps.cls), wet=excluded.wet`
  ).bind(rid(), uid, x.carId, str(x.car), x.trackId, str(x.track), x.time, x.sectors || null, x.trace || null, Date.now(), x.anon ? 1 : 0, x.game, x.shown || "nick", licOf(x.lic), str(x.cat, 20), officialOf(x.official), x.ai ? 1 : null, cls, wet ?? null).run();
  await markModel(env, x.game, x.trackId, x.carId);
  // improved: a faster lap than the one shared before (the Discord alerts), not only its telemetry added
  const improved = !old || old.game !== x.game || x.time < old.time;
  const res = { shared: true, traced: !!x.trace, improved, prev: old && old.game === x.game ? old.time : null, game: x.game, trackId: x.trackId, carId: x.carId, track: x.track, car: x.car, time: x.time, anon: !!x.anon };
  // a new best lap: the Discord servers of its driver hear about it (x.ctx only where a lap was just driven)
  if (improved && x.ctx) x.ctx.waitUntil(discordLapAlert(env, uid, res).catch(() => {}));
  return res;
}

// the iRacing ids of a session's track and car: from the session (newer PCs), from the app (it knows your
// tracks and cars), or from what others shared with the same names; provisional ids from the names when
// nobody recorded them yet (the first session that brings the real ids moves everything over, reconcileIds)
async function comboIds(env, s, name, g, uid, body) {
  let trackId = s.track_id, carId = s.car_id;
  if (!trackId && int(body && body.trackId)) trackId = int(body.trackId);
  if (!carId && int(body && body.carId)) carId = int(body.carId);
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
  if (!trackId || !carId) {
    const o = await env.DB.prepare("SELECT track_id, car_id FROM sessions WHERE game=?1 AND lower(car)=lower(?2) AND (lower(track)=lower(?3) OR lower(track||' · '||COALESCE(track_config,''))=lower(?4)) AND track_id>0 AND car_id>0 ORDER BY (uploader=?5) DESC, started DESC LIMIT 1")
      .bind(g, s.car, s.track, name, "acct:" + uid).first();
    if (o) { trackId = trackId || o.track_id; carId = carId || o.car_id; }
  }
  if (!trackId) trackId = await pseudoId("t", g, name);
  if (!carId) carId = await pseudoId("c", g, s.car);
  if (!s.track_id || !s.car_id) await env.DB.prepare("UPDATE sessions SET track_id=COALESCE(track_id,?2), car_id=COALESCE(car_id,?3) WHERE id=?1").bind(s.id, trackId, carId).run();
  return { trackId, carId };
}

// a lap saved in an account goes to the leaderboard by itself: the fastest valid lap of what was just uploaded
// (with its telemetry when it has some), when it beats what the account already shares for that car and track;
// under the account's public name, or as Anonymous when the account chose so
export async function autoShare(env, accountId, sessionId, laps, hint, ctx) {
  // a friend's lap in DRINKS mode (drv) is shared by the PC under the friend's own name, never as the account's;
  // only a lap the server keeps as valid (a pit-lane or impossible lap is not, dropImpossibleLaps)
  const ok = new Set((((await env.DB.prepare("SELECT id FROM laps WHERE session_id=?1 AND valid=1 AND drv IS NULL").bind(sessionId).all()).results) || []).map((r) => String(r.id)));
  const best = (laps || []).filter((l) => l && ok.has(String(l.id)) && !(typeof l.drv === "string" && l.drv.trim()) && num(l.time) > 10 && l.time < 3600)
    .sort((a, b) => a.time - b.time || (b.trace ? 1 : 0) - (a.trace ? 1 : 0))[0];
  if (!best) return null;
  const acc = await env.DB.prepare("SELECT a.anon, a.name_kind FROM accounts a JOIN community_users u ON u.id=a.id WHERE a.id=?1").bind(accountId).first();
  const s = await env.DB.prepare("SELECT * FROM sessions WHERE id=?1 AND uploader=?2").bind(sessionId, "acct:" + accountId).first();
  const lap = await env.DB.prepare("SELECT time, sectors, trace FROM laps WHERE id=?1 AND session_id=?2 AND valid=1 AND drv IS NULL").bind(String(best.id), sessionId).first();
  if (!acc || !s || !lap || isTestDrive(s.kind)) return null;
  const g = s.game || "iracing", name = s.track + (s.track_config ? " · " + s.track_config : "");
  const { trackId, carId } = await comboIds(env, s, name, g, accountId, hint);
  // the license class of this discipline is the account's current one (kept per discipline)
  if (g === "iracing" && licOf(hint && hint.lic) && !(hint && hint.imported)) await rememberLic(env, accountId, catOf(await catMap(env), trackId, carId, hint && hint.cat, name, s.car), hint.lic).catch(() => {});
  return keepBestLap(env, accountId, { game: g, carId, trackId, car: s.car, track: name, time: lap.time, sectors: lap.sectors, trace: lap.trace, anon: !!acc.anon, shown: acc.name_kind === "iracing" ? "iracing" : "nick", lic: hint && hint.lic, cat: hint && hint.cat, official: s.official, ai: s.ai === 1, ctx });
}

// laps of a session that are no longer valid (an impossible lap, or an admin's call): a share made from one goes,
// the model forgets it, and the account's best of the car and track is shared again from its valid laps
export async function unshareInvalid(env, accountId, sid) {
  const s = await env.DB.prepare("SELECT * FROM sessions WHERE id=?1 AND uploader=?2").bind(sid, "acct:" + accountId).first();
  if (!s) return;
  const bad = (await env.DB.prepare("SELECT time FROM laps WHERE session_id=?1 AND valid=0 AND time>0").bind(sid).all()).results || [];
  const g = s.game || "iracing", name = s.track + (s.track_config ? " · " + s.track_config : "");
  const { trackId, carId } = await comboIds(env, s, name, g, accountId, null);
  if (!trackId || !carId) return;
  const fam = await famId(env, g, carId);
  for (const b of bad) {
    await env.DB.prepare("DELETE FROM community_laps WHERE user_id=?1 AND car_id=?2 AND track_id=?3 AND game=?4 AND abs(time-?5)<0.0006").bind(accountId, fam, trackId, g, b.time).run();
    await forgetLap(env, g, trackId, carId, "acct:" + accountId, b.time);
  }
  await reshareSession(env, accountId, sid);
}

// after who drove a lap changes (DRINKS mode: a lap given to a friend, or back to you): every driver's shared best
// for that car and track is made again from the account's sessions, so no leaderboard keeps a lap that is somebody
// else's now, and the lap goes up under its driver's name when it is their best (or to their own account once joined)
export async function reshareSession(env, accountId, sid) {
  const s = await env.DB.prepare("SELECT * FROM sessions WHERE id=?1 AND uploader=?2").bind(sid, "acct:" + accountId).first();
  if (!s || isTestDrive(s.kind)) return;
  const g = s.game || "iracing", name = s.track + (s.track_config ? " · " + s.track_config : "");
  const { trackId, carId } = await comboIds(env, s, name, g, accountId, null);
  if (!trackId || !carId) return;
  const acc = await env.DB.prepare("SELECT anon, name_kind FROM accounts WHERE id=?1").bind(accountId).first();
  if (!acc) return;
  const key = (d) => String(d || "").trim().toLowerCase();
  const here = (await env.DB.prepare("SELECT time, COALESCE(drv,'') AS drv FROM laps WHERE session_id=?1 AND valid=1").bind(sid).all()).results || [];
  // the laps of this car and track in every session of the account, by driver ("" the account itself)
  const all = (await env.DB.prepare(`SELECT l.time, l.sectors, l.trace, COALESCE(l.drv,'') AS drv FROM laps l JOIN sessions s ON s.id=l.session_id
    WHERE s.uploader=?1 AND lower(s.track)=lower(?2) AND lower(COALESCE(s.track_config,''))=lower(?3) AND lower(s.car)=lower(?4) AND COALESCE(s.game,'iracing')=?5
    AND l.valid=1 AND l.time>10 AND l.time<3600 AND lower(COALESCE(s.kind,'')) NOT LIKE '%test%'`).bind("acct:" + accountId, s.track, s.track_config || "", s.car, g).all()).results || [];
  const by = new Map();
  for (const l of all) { const k = key(l.drv); if (!by.has(k)) by.set(k, []); by.get(k).push(l); }
  // who shares what: the account under its own name, each friend under theirs (or their own account once joined)
  const who = async (k, nm) => {
    if (!k) return { uid: accountId, anon: !!acc.anon, shown: acc.name_kind === "iracing" ? "iracing" : "nick" };
    const alias = cleanAlias(nm);
    if (!alias) return null;
    let row = await env.DB.prepare("SELECT id FROM community_users WHERE owner=?1 AND id LIKE 'guest-%' AND lower(alias)=lower(?2)").bind(accountId, alias).first();
    if (!row) {
      if (await nameTaken(env, alias, accountId)) return null;
      const gid = "guest-" + (await sha256(accountId + ":" + alias.toLowerCase())).slice(0, 20);
      await env.DB.prepare("INSERT INTO community_users (id, token_hash, alias, created, owner) VALUES (?1,?2,?3,?4,?5) ON CONFLICT(id) DO UPDATE SET alias=excluded.alias, owner=excluded.owner")
        .bind(gid, await sha256("guest:" + gid + ":" + rid()), alias, Date.now(), accountId).run();
      row = { id: gid };
    }
    const gl = await env.DB.prepare("SELECT l.account_id AS id, a.anon, a.name_kind FROM guest_links l JOIN accounts a ON a.id=l.account_id WHERE l.gid=?1").bind(row.id).first();
    if (gl) return { uid: gl.id, anon: !!gl.anon, shown: gl.name_kind === "iracing" ? "iracing" : "nick" };
    return { uid: row.id, anon: false, shown: "nick" };
  };
  // a share that came from a lap of this session which is somebody else's now goes
  const mine = (await env.DB.prepare("SELECT c.id, c.user_id, c.time, u.alias FROM community_laps c JOIN community_users u ON u.id=c.user_id WHERE c.car_id=?1 AND c.track_id=?2 AND (c.user_id=?3 OR (u.owner=?3 AND u.id LIKE 'guest-%'))").bind(await famId(env, g, carId), trackId, accountId).all()).results || [];
  for (const c of mine) {
    const k = c.user_id === accountId ? "" : key(c.alias);
    if (here.some((l) => Math.abs(l.time - c.time) < 0.0015 && key(l.drv) !== k)) await env.DB.prepare("DELETE FROM community_laps WHERE id=?1").bind(c.id).run();
  }
  for (const [k, laps] of by) {
    const w = await who(k, laps[0].drv).catch(() => null);
    if (!w) continue;
    const best = laps.sort((a, b) => a.time - b.time || (b.trace ? 1 : 0) - (a.trace ? 1 : 0))[0];
    await keepBestLap(env, w.uid, { game: g, carId, trackId, car: s.car, track: name, time: best.time, sectors: best.sectors, trace: best.trace, anon: w.anon, shown: w.shown, official: s.official, ai: s.ai === 1 });
  }
}

// an account's license class in one discipline (the others stay as they were)
async function rememberLic(env, uid, cat, lic) {
  const v = licOf(lic);
  if (!v || !CATS.includes(cat)) return;
  const row = await env.DB.prepare("SELECT lics FROM community_users WHERE id=?1").bind(uid).first();
  let cur = {};
  try { cur = JSON.parse((row && row.lics) || "{}") || {}; } catch (e) {}
  if (cur[cat] === v) return;
  cur[cat] = v;
  await env.DB.prepare("UPDATE community_users SET lics=?2 WHERE id=?1").bind(uid, JSON.stringify(cur)).run();
}

// an answer of the database kept a minute in the server's cache (the same for everyone who asks it): fn() → {results}
async function minuteCache(env, k, fn) {
  const cache = env.LOCAL !== "1" && typeof caches !== "undefined" && caches.default ? caches.default : null;
  const key = new Request("https://db.cache/" + k);
  if (cache) {
    const hit = await cache.match(key).catch(() => null);
    if (hit) { try { return await hit.json(); } catch (e) {} }
  }
  const r = await fn();
  if (cache) await cache.put(key, new Response(JSON.stringify({ results: r.results || [] }), { headers: { "content-type": "application/json", "cache-control": "max-age=60" } })).catch(() => {});
  return r;
}

export async function community(req, env, url, ctx) {
  if (env.COMMUNITY !== "1") return err("the community is not enabled on this server", 404);
  const p = url.pathname.replace(/^\/community/, ""), m = req.method;
  if (m === "OPTIONS") return new Response(null, { headers: { ...JSONH, "access-control-allow-methods": "GET,POST,DELETE", "access-control-max-age": "86400", "access-control-allow-headers": "authorization,content-type" } });
  { const la = await lmuApiRoutes(req, env, p, m, url); if (la) return la; } // admins: what LMU's own API answered (lmuapi.js; its body is gzipped)
  const body = m === "POST" ? await req.json().catch(() => ({})) : {};

  if (p === "/register" && m === "POST") {
    const id = rid(), token = rid() + rid();
    await env.DB.prepare("INSERT INTO community_users (id, token_hash, alias, created) VALUES (?1,?2,?3,?4)").bind(id, await sha256(token), cleanAlias(body.alias), Date.now()).run();
    return json({ id, token });
  }
  { const pr = await proRoutes(req, env, p, m, body); if (pr) return pr; } // Pitlane HQ Pro: the offer, the beta switch
  // every list is for one game: laps and analyses of different games are never mixed
  const game = gameOf(url.searchParams.get("game") || body.game);
  { const ct = await coachTipRoutes(req, env, p, m, body, game); if (ct) return ct; } // the coach learns from its tips: coachtips.js
  if (p === "/combos" && m === "GET") {
    const r = await env.DB.prepare(
      "SELECT track_id AS trackId, MAX(track) AS track, car_id AS carId, MAX(car) AS car, COUNT(*) AS laps, MIN(time) AS best, MAX(cat) AS hint FROM community_laps WHERE game=?1 AND COALESCE(shown,'')<>'model' GROUP BY track_id, car_id ORDER BY laps DESC LIMIT 500"
    ).bind(game).all();
    // each car and track in its discipline (Oval, Sports Car, Formula Car, Dirt Oval, Dirt Road): the leaderboards by discipline
    const cm = game === "iracing" ? await catMap(env) : { tc: {}, c: {} };
    const fams = await famGroups(env, game); // a family's board lists its badges, so the apps know which of your cars it is
    return json({ combos: (r.results || []).map(({ hint, ...x }) => ({ ...x, ...(fams.has(x.carId) ? { ids: [...fams.get(x.carId)] } : {}), car: famName(game, x.carId, x.car), cat: game === "iracing" ? catOf(cm, x.trackId, x.carId, hint, x.track, x.car) : "sports_car" })) });
  }
  // the model, learnt on the server from every real lap it knows (shared or not, rivals of races): only
  // what it learnt goes out (the record and the next-level laps), never anyone's laps as such
  if (p === "/model" && m === "GET") {
    const t = +url.searchParams.get("trackId"), c = await famId(env, game, url.searchParams.get("carId"));
    if (!t || !c) return err("trackId and carId", 400);
    // the compound of the lap the client measures (its "cmp:<n>" flag, 0 without it): that compound's references when
    // the model has them apart, else the model of every lap
    const cq = url.searchParams.get("cmp");
    const md = forCompound(await getModel(env, game, t, c), cq != null && /^\d{1,2}$/.test(cq) ? +cq : null);
    const rivals = seesRivals(req, env, await me(req, env).catch(() => null));
    const fs = await env.DB.prepare(`SELECT l.time, ${shownName("l", "u", rivals)} AS alias FROM community_laps l JOIN community_users u ON u.id=l.user_id WHERE l.track_id=?1 AND l.car_id=?2 AND l.game=?3 AND COALESCE(l.shown,'')<>'model' ORDER BY l.time LIMIT 1`).bind(t, c, game).first();
    // with the card of the car: what it does on other tracks, for when nobody known drove it here yet
    return json({ ...md, car: await getCarCard(env, game, c).catch(() => null), fastShared: fs || null });
  }
  // the card of a car alone (the phone apps): its hardest braking, the speeds the fast drivers shift up
  // at, its top speed, learnt from its laps on every track; {} when it has no laps yet
  if (p === "/car" && m === "GET") {
    const c = await famId(env, game, url.searchParams.get("carId"));
    if (!c) return err("carId", 400);
    return json((await getCarCard(env, game, c).catch(() => null)) || {});
  }
  // the records: the fastest lap of every car and track, the newest first, with the lap it beat (the second fastest
  // of the same car and track): Community's "Recent records" on every device
  if (p === "/records" && m === "GET") {
    const lim = Math.min(100, Math.max(1, +url.searchParams.get("limit") || 40));
    const who = await me(req, env).catch(() => null);
    // game=all (the admin page's newest records): every game's together, each record saying its game
    const all = url.searchParams.get("game") === "all";
    const rv = seesRivals(req, env, who), adm = !!who && isAdmin(env, who.id);
    // every open app asks for them every minute: the answer is read from the database once a minute for everyone who
    // sees the same (the database's reads per day are limited); "mine" is worked out per driver below
    const r = await minuteCache(env, `records/${all ? "all" : game}/${lim}/${rv ? 1 : 0}${adm ? 1 : 0}`, () => env.DB.prepare(
      `WITH rk AS (SELECT *, ROW_NUMBER() OVER (PARTITION BY game, track_id, car_id ORDER BY time) AS rk, COUNT(*) OVER (PARTITION BY game, track_id, car_id) AS n
         FROM community_laps WHERE ${all ? "game IN ('iracing','lmu')" : "game=?1"} AND COALESCE(shown,'')<>'model')
       SELECT l.id, l.user_id AS uid, l.game, l.track_id AS trackId, l.track, l.car_id AS carId, l.car, l.cat AS hint, l.time, l.created, l.n, l.wet,
         ${shownName("l", "u", rv)} AS alias,
         (${adm ? "ac.id IS NOT NULL OR " : ""}(l.anon=0 AND ac.id IS NOT NULL AND COALESCE(ac.anon,0)=0)) AS prof, (l.anon=0 AND COALESCE(ac.supporter,0)=1 AND COALESCE(ac.supporter_hidden,0)=0) AS sup,
         (l.trace IS NOT NULL OR ${ACCT_TRACE}) AS hasTrace,
         p.time AS prevTime, CASE WHEN p.id IS NULL THEN NULL ELSE ${shownName("p", "pu", rv)} END AS prevAlias
       FROM rk l JOIN community_users u ON u.id=l.user_id LEFT JOIN accounts ac ON ac.id=l.user_id
         LEFT JOIN rk p ON p.game=l.game AND p.track_id=l.track_id AND p.car_id=l.car_id AND p.rk=2 LEFT JOIN community_users pu ON pu.id=p.user_id
       WHERE l.rk=1 ORDER BY l.created DESC LIMIT ?2`
    ).bind(game, lim).all());
    const cm = all || game === "iracing" ? await catMap(env) : null;
    return json({ records: (r.results || []).map(({ uid, hint, prevTime, prevAlias, ...x }) => ({ ...x, game: gameOf(x.game), car: famName(gameOf(x.game), x.carId, x.car), cat: cm && gameOf(x.game) === "iracing" ? catOf(cm, x.trackId, x.carId, hint, x.track, x.car) : "sports_car", prof: !!x.prof, sup: !!x.sup, hasTrace: !!x.hasTrace, mine: !!who && uid === who.id, field: String(uid).startsWith("o:"), prev: prevTime ? { time: prevTime, alias: prevAlias } : null })) });
  }
  // one track: its layout and official turns, how many drivers and laps it has, and the record of every car on it
  // (the track page, in development)
  if (p === "/track" && m === "GET") {
    const t = +url.searchParams.get("trackId");
    if (!t) return err("trackId", 400);
    const who = await me(req, env).catch(() => null);
    const [lay, tu, r, tot] = await Promise.all([
      env.DB.prepare("SELECT track, n, len, pts FROM track_maps WHERE game=?1 AND track_id=?2").bind(game, t).first(),
      env.DB.prepare("SELECT turns FROM track_turns WHERE game=?1 AND track_id=?2").bind(game, t).first(),
      env.DB.prepare(
        `WITH rk AS (SELECT *, ROW_NUMBER() OVER (PARTITION BY car_id ORDER BY time) AS rk, COUNT(*) OVER (PARTITION BY car_id) AS n
           FROM community_laps WHERE game=?1 AND track_id=?2 AND COALESCE(shown,'')<>'model')
         SELECT l.id, l.user_id AS uid, l.car_id AS carId, l.car, l.track, l.cat AS hint, l.time, l.created, l.n, l.wet, l.cls,
           ${shownName("l", "u", seesRivals(req, env, who))} AS alias,
           (${who && isAdmin(env, who.id) ? "ac.id IS NOT NULL OR " : ""}(l.anon=0 AND ac.id IS NOT NULL AND COALESCE(ac.anon,0)=0)) AS prof, (l.anon=0 AND COALESCE(ac.supporter,0)=1 AND COALESCE(ac.supporter_hidden,0)=0) AS sup,
           (l.trace IS NOT NULL OR ${ACCT_TRACE}) AS hasTrace
         FROM rk l JOIN community_users u ON u.id=l.user_id LEFT JOIN accounts ac ON ac.id=l.user_id
         WHERE l.rk=1 ORDER BY l.n DESC, l.time`
      ).bind(game, t).all(),
      env.DB.prepare("SELECT COUNT(*) AS laps, COUNT(DISTINCT user_id) AS drivers, MAX(track) AS track FROM community_laps WHERE game=?1 AND track_id=?2 AND COALESCE(shown,'')<>'model'").bind(game, t).first(),
    ]);
    const cm = game === "iracing" ? await catMap(env) : null;
    const pts = lay && lay.pts ? JSON.parse(lay.pts) : null;
    const name = (tot && tot.track) || (lay && lay.track) || "";
    return json({
      trackId: t, game, track: name, drivers: (tot && tot.drivers) || 0, laps: (tot && tot.laps) || 0,
      layout: pts && pts.x && pts.x.length > 10 ? { n: lay.n, len: lay.len, x: pts.x, y: pts.y } : null,
      turns: tu && tu.turns ? JSON.parse(tu.turns) : [],
      cars: (r.results || []).map(({ uid, hint, ...x }) => ({ ...x, car: famName(game, x.carId, x.car), track: x.track || name, trackId: t, cat: cm ? catOf(cm, t, x.carId, hint, x.track || name, x.car) : "sports_car", prof: !!x.prof, sup: !!x.sup, hasTrace: !!x.hasTrace, mine: !!who && uid === who.id, field: String(uid).startsWith("o:") })),
    });
  }
  if (p === "/laps" && m === "GET") {
    // Le Mans Ultimate's class board (?cls= instead of the car): each driver's best lap of any car of the class here
    const cq = game === "lmu" ? clsParam(url.searchParams.get("cls")) : null;
    if (cq && +url.searchParams.get("trackId")) {
      const who = await me(req, env).catch(() => null);
      const rows = await classLaps(env, +url.searchParams.get("trackId"), cq, { admin: !!who && isAdmin(env, who.id), rivals: seesRivals(req, env, who), acctTrace: ACCT_TRACE });
      return json({ cat: "sports_car", cls: cq, laps: rows.map(({ uid, ...x }) => ({ ...x, car: famName(game, x.carId, x.car), lic: licOf(x.lic), prof: !!x.prof, sup: !!x.sup, mine: !!who && uid === who.id, field: String(uid).startsWith("o:"), hasTrace: !!x.hasTrace, sectors: x.sectors ? JSON.parse(x.sectors) : null })) });
    }
    const t = +url.searchParams.get("trackId"), c = await famId(env, game, url.searchParams.get("carId"));
    if (!t || !c) return err("trackId and carId", 400);
    // signed in: your own laps are marked as yours (also the anonymous ones; only you see that)
    const who = await me(req, env).catch(() => null);
    const h = await env.DB.prepare("SELECT MAX(cat) AS hint, MAX(track) AS track, MAX(car) AS car, MAX(cls) AS cls FROM community_laps WHERE track_id=?1 AND car_id=?2 AND game=?3").bind(t, c, game).first().catch(() => null);
    const cat = game === "iracing" ? catOf(await catMap(env), t, c, h && h.hint, h && h.track, h && h.car) : "sports_car";
    const r = await env.DB.prepare(
      `SELECT l.id, l.user_id AS uid, ${shownName("l", "u", seesRivals(req, env, who))} AS alias, l.time, l.sectors, l.created, (l.trace IS NOT NULL OR ${ACCT_TRACE}) AS hasTrace, l.car, l.track, l.wet,
         COALESCE(json_extract(u.lics, '$.' || ?4), l.lic) AS lic,
         (${who && isAdmin(env, who.id) ? "ac.id IS NOT NULL OR " : ""}(l.anon=0 AND ac.id IS NOT NULL AND COALESCE(ac.anon,0)=0)) AS prof, (l.anon=0 AND COALESCE(ac.supporter,0)=1 AND COALESCE(ac.supporter_hidden,0)=0) AS sup
       FROM community_laps l JOIN community_users u ON u.id=l.user_id LEFT JOIN accounts ac ON ac.id=l.user_id
       WHERE l.track_id=?1 AND l.car_id=?2 AND l.game=?3 AND COALESCE(l.shown,'')<>'model' ORDER BY l.time LIMIT 200`
    ).bind(t, c, game, cat).all();
    // field: another driver of a race someone drove, anonymous (their speed trace with estimated pedals)
    // cls: the board's Le Mans Ultimate class (its class board, ?cls=), null in iRacing
    return json({ cat, cls: game === "lmu" ? (h && h.cls) || lmuClass(null, h && h.car) : null, laps: (r.results || []).map(({ uid, ...x }) => ({ ...x, lic: licOf(x.lic), prof: !!x.prof, sup: !!x.sup, mine: !!who && uid === who.id, field: String(uid).startsWith("o:"), hasTrace: !!x.hasTrace, sectors: x.sectors ? JSON.parse(x.sectors) : null })) });
  }
  if (p.startsWith("/laps/") && m === "GET") {
    const rivals = seesRivals(req, env, await me(req, env).catch(() => null));
    const l = await env.DB.prepare(`SELECT l.*, ${shownName("l", "u", rivals)} AS alias FROM community_laps l JOIN community_users u ON u.id=l.user_id WHERE l.id=?1`).bind(p.slice(6)).first();
    if (!l) return err("not found", 404);
    let trace = l.trace;
    if (!trace) {
      const a = await env.DB.prepare(`SELECT a.trace FROM laps a JOIN sessions s ON s.id=a.session_id WHERE ${ACCT_TRACE_WHERE} LIMIT 1`).bind(l.user_id, l.time, l.game).first();
      if (a) trace = a.trace;
    }
    let tr = trace ? JSON.parse(await openData(env, trace)) : null;
    // a rival's lap: its pedals and gears from its speed and what this car really does (pedals.js)
    if (tr && tr.src === "field") {
      const card = await getCarCard(env, l.game, l.car_id).catch(() => null);
      tr = estimateTrace(tr, card && card.pedals, card && card.shifts);
    }
    return json({ id: l.id, alias: l.alias, game: l.game, time: l.time, car: famName(l.game, l.car_id, l.car), track: l.track, carId: l.car_id, trackId: l.track_id, sectors: l.sectors ? JSON.parse(l.sectors) : null, trace: tr });
  }
  if (p === "/reports" && m === "GET") {
    const t = +url.searchParams.get("trackId"), c = +url.searchParams.get("carId");
    const fam = c ? await famIds(env, game, c) : [0];
    const r = await env.DB.prepare(
      `SELECT r.id, r.user_id AS uid, CASE WHEN r.anon=1 THEN 'Anonymous' WHEN r.shown='iracing' AND COALESCE(u.iracing,'')<>'' THEN u.iracing ELSE u.alias END AS alias, r.car, r.track, r.created, COALESCE(r.finish, CASE WHEN substr(r.data,1,4)='enc:' THEN NULL ELSE json_extract(r.data,'$.finish') END) AS finish,
       COALESCE(r.field, CASE WHEN substr(r.data,1,4)='enc:' THEN NULL ELSE json_extract(r.data,'$.field') END) AS field,
       COALESCE(r.best, CASE WHEN substr(r.data,1,4)='enc:' THEN NULL ELSE json_extract(r.data,'$.best') END) AS best
       FROM community_reports r JOIN community_users u ON u.id=r.user_id WHERE (?1=0 OR r.track_id=?1) AND (?2=0 OR r.car_id IN (${fam.map((n) => +n || 0).join(",")})) AND r.game=?3 ORDER BY r.created DESC LIMIT 100`
    ).bind(t || 0, c || 0, game).all();
    const who = await me(req, env).catch(() => null);
    return json({ reports: (r.results || []).map(({ uid, ...x }) => ({ ...x, car: famName(game, c, x.car), mine: !!who && uid === who.id })) });
  }
  // track outlines (from clean best laps): anyone can read them
  if (p === "/trackmaps" && m === "GET") {
    const t = +url.searchParams.get("trackId");
    if (!t) return err("trackId", 400);
    const r = await env.DB.prepare("SELECT track, n, len, pts, time, created, geo FROM track_maps WHERE game=?1 AND track_id=?2").bind(game, t).first();
    if (!r) return err("no layout for this track yet", 404);
    const pts = JSON.parse(r.pts);
    // g: the origin [lat, lon] of x=0, y=0 when the layout comes from the game's position (the apps put their own laps in the same frame)
    let g = null;
    try { g = r.geo ? JSON.parse(r.geo) : null; } catch (e) { g = null; }
    return new Response(JSON.stringify({ trackId: t, game, track: r.track, n: r.n, len: r.len, x: pts.x, y: pts.y, g, time: r.time, updated: r.created }), { headers: { ...JSONH, "cache-control": "public, max-age=3600" } });
  }
  // the official turn numbers of a track (placed by an admin on its map): anyone reads them, only admins change them
  if (p === "/turns" && m === "GET") {
    const t = +url.searchParams.get("trackId");
    if (!t) return err("trackId", 400);
    const r = await env.DB.prepare("SELECT turns, updated FROM track_turns WHERE game=?1 AND track_id=?2").bind(game, t).first();
    let turns = [], auto = false, count = 0;
    try { turns = r ? JSON.parse(r.turns) : []; } catch (e) { turns = []; }
    // no official turns placed yet: the corners come from the geometry of the track's layout (trackgeo.js), the same on
    // every device, until an admin places them
    if (!turns.length) {
      // fitted to the track's official number of turns when the game said it (iRacing's TrackNumTurns, track_info)
      const [lay, want] = await Promise.all([env.DB.prepare("SELECT pts FROM track_maps WHERE game=?1 AND track_id=?2").bind(game, t).first(), turnCount(env, game, t)]);
      if (lay) { try { const p = JSON.parse(lay.pts); turns = turnsFromPath(p.x, p.y, want); auto = true; } catch (e) { turns = []; } }
      if (want) count = want;
    }
    return new Response(JSON.stringify({ trackId: t, game, turns, auto, ...(count ? { count } : {}), updated: r ? r.updated : 0 }), { headers: { ...JSONH, "cache-control": "public, max-age=300" } });
  }
  // the pit lane of a track, from laps through the pits: [point of the lap (5 m), metres to the left of the track]
  if (p === "/pitlane" && m === "GET") {
    const t = +url.searchParams.get("trackId");
    if (!t) return err("trackId", 400);
    const r = await env.DB.prepare("SELECT n, pts, updated FROM track_pits WHERE game=?1 AND track_id=?2").bind(game, t).first();
    const pts = r ? Object.entries(JSON.parse(r.pts)).map(([i, v]) => [+i, v]).sort((a, b) => a[0] - b[0]) : [];
    return new Response(JSON.stringify({ trackId: t, game, n: r ? r.n : 0, pts, updated: r ? r.updated : 0 }), { headers: { ...JSONH, "cache-control": "public, max-age=600" } });
  }
  if (p === "/turns" && m === "POST") {
    const acc = await sessionAccount(req, env);
    if (!acc || !isAdmin(env, acc.id)) return err("only the admins of this server can do this", 403);
    const b = body;
    const t = +b.trackId, g = String(b.game || "iracing").slice(0, 20);
    const turns = Array.isArray(b.turns) ? b.turns.map(Number).filter(x => isFinite(x) && x >= 0 && x < 1).slice(0, 60) : null; // in the order T1 … Tn
    if (!t || !turns) return err("trackId and turns", 400);
    if (!turns.length) await env.DB.prepare("DELETE FROM track_turns WHERE game=?1 AND track_id=?2").bind(g, t).run();
    else await env.DB.prepare("INSERT INTO track_turns (game, track_id, turns, updated) VALUES (?1, ?2, ?3, ?4) ON CONFLICT(game, track_id) DO UPDATE SET turns=excluded.turns, updated=excluded.updated")
      .bind(g, t, JSON.stringify(turns.map(x => Math.round(x * 1e5) / 1e5)), Date.now()).run();
    return json({ ok: true, trackId: t, game: g, turns });
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
    await purgeAccount(env, id);
    return json({ deleted: true });
  }
  if (m === "GET" && p === "/admin/status") {
    const acc = await sessionAccount(req, env);
    if (!acc || !isAdmin(env, acc.id)) return err("only the admins of this server can do this", 403);
    const st = await env.DB.prepare("SELECT k, v, at FROM app_state WHERE k IN ('mail_error','mail_ok')").all().catch(() => ({ results: [] }));
    const get = (k) => (st.results || []).find((x) => x.k === k);
    const e = get("mail_error"), ok = get("mail_ok");
    const now = Date.now(), d1 = now - 86400e3, d7 = now - 7 * 86400e3, d30 = now - 30 * 86400e3;
    const counts = await env.DB.prepare(`SELECT (SELECT COUNT(*) FROM accounts) AS accounts, (SELECT COUNT(*) FROM accounts WHERE verified=1) AS verified,
      (SELECT COUNT(*) FROM accounts WHERE created>?1) AS new7, (SELECT COUNT(*) FROM accounts WHERE created>?2) AS new30, (SELECT COUNT(*) FROM accounts WHERE totp_on=1) AS twoFactor,
      (SELECT COUNT(*) FROM sessions) AS sessions, (SELECT COUNT(*) FROM sessions WHERE started>?3) AS sessions1, (SELECT COUNT(*) FROM sessions WHERE started>?1) AS sessions7,
      (SELECT COUNT(DISTINCT uploader) FROM sessions WHERE started>?1) AS drivers7,
      (SELECT COUNT(*) FROM community_laps) AS shared, (SELECT COUNT(*) FROM (SELECT 1 FROM community_laps WHERE COALESCE(shown,'')<>'model' GROUP BY game, track_id, car_id)) AS boards,
      (SELECT COUNT(*) FROM model_laps) AS learnt, (SELECT COUNT(*) FROM model_cache) AS models, (SELECT COUNT(*) FROM model_cache WHERE dirty=1) AS modelsDirty, (SELECT COUNT(*) FROM car_cards) AS cars,
      (SELECT COUNT(*) FROM leagues) AS leagues, (SELECT COUNT(*) FROM accounts WHERE supporter=1) AS supporters, (SELECT COUNT(*) FROM accounts WHERE supporter=1 AND supporter_src='patreon') AS supportersPatreon,
      (SELECT COUNT(*) FROM patreon_patrons WHERE active=1) AS patrons, (SELECT MAX(updated) FROM patreon_patrons) AS patreonLast,
      (SELECT COUNT(*) FROM auth_fails) AS authFails`).bind(d7, d30, d1).first().catch((x) => ({ error: String(x && x.message || x) }));
    return json({
      mail: { ready: mailReady(env), via: env.RESEND_API_KEY ? "resend" : "", from: env.EMAIL_FROM || "", lastOk: ok ? ok.at : 0, lastError: e && (!ok || e.at > ok.at) ? { at: e.at, ...JSON.parse(e.v || "{}") } : null },
      counts,
      config: { patreon: !!env.PATREON_WEBHOOK_SECRET, leaguesOpen: env.LEAGUES_OPEN === "1", community: env.COMMUNITY !== "0", dataKey: !!env.DATA_KEY, pepper: !!env.EMAIL_PEPPER, admins: String(env.ADMINS || env.SEASON_UPLOADERS || "").split(",").filter(Boolean).length },
    });
  }
  // the last emails and whether they really arrived (Resend's answer for each one)
  if (m === "GET" && p === "/admin/mail") {
    const acc = await sessionAccount(req, env);
    if (!acc || !isAdmin(env, acc.id)) return err("only the admins of this server can do this", 403);
    const [items, domain] = await Promise.all([mailLog(env), mailDomain(env).catch(() => null)]);
    return json({ items, domain });
  }
  // every DRINKS driver on the platform (a friend who drove on an admin's PC), with the account it was joined to
  if (m === "GET" && p === "/admin/guests") {
    const acc = await sessionAccount(req, env);
    if (!acc || !isAdmin(env, acc.id)) return err("only the admins of this server can do this", 403);
    const r = await env.DB.prepare(`SELECT g.id, g.alias, g.created, g.owner, o.display AS ownerName, (SELECT COUNT(*) FROM community_laps l WHERE l.user_id=g.id) AS laps, gl.account_id AS linked, la.display AS linkedName
      FROM community_users g LEFT JOIN accounts o ON o.id=g.owner LEFT JOIN guest_links gl ON gl.gid=g.id LEFT JOIN accounts la ON la.id=gl.account_id WHERE g.id LIKE 'guest-%' ORDER BY g.created DESC LIMIT 300`).all();
    return json({ guests: (r.results || []).map((x) => ({ id: x.id, name: x.alias, created: x.created, owner: x.owner, ownerName: x.ownerName || "", laps: x.laps || 0, linked: x.linked || null, linkedName: x.linkedName || null })) });
  }
  if (m === "GET" && (p === "/admin/uploads" || p === "/admin/users")) {
    const acc = await sessionAccount(req, env);
    if (!acc || !isAdmin(env, acc.id)) return err("only the admins of this server can do this", 403);
    if (p === "/admin/users") {
      const q = String(url.searchParams.get("q") || "").trim().slice(0, 60);
      const r = await env.DB.prepare(`SELECT a.id, a.display, a.name_kind AS nameKind, a.anon, a.verified, a.created, a.member_since AS memberSince, a.totp_on AS twoFactor, a.supporter, a.supporter_src AS supporterSrc, a.supporter_hidden AS supporterHidden,
        (SELECT COUNT(*) FROM sessions s WHERE s.uploader='acct:'||a.id) AS sessions,
        (SELECT MAX(started) FROM sessions s WHERE s.uploader='acct:'||a.id) AS lastSession,
        (SELECT COUNT(*) FROM community_laps l WHERE l.user_id=a.id) AS laps,
        (SELECT COUNT(*) FROM community_users g WHERE g.owner=a.id AND g.id LIKE 'guest-%') AS guests,
        (SELECT group_concat(gl.gid || '|' || g.alias, ',') FROM guest_links gl JOIN community_users g ON g.id=gl.gid WHERE gl.account_id=a.id) AS guestLinked,
        (SELECT COUNT(*) FROM leagues g WHERE g.owner=a.id) AS leagues,
        EXISTS (SELECT 1 FROM driver_links d WHERE d.account_id=a.id) AS driverLinked,
        (SELECT group_concat(d.game, ',') FROM driver_links d WHERE d.account_id=a.id) AS driverGames
        FROM accounts a ${q ? "WHERE a.display LIKE ?1 OR a.id LIKE ?1" : ""} ORDER BY a.created DESC LIMIT 500`).bind(...(q ? ["%" + q.replace(/[%_]/g, "") + "%"] : [])).all();
      return json({ users: (r.results || []).map((x) => ({ ...x, admin: isAdmin(env, x.id) })) });
    }
    const q = (t, extra) => env.DB.prepare(`SELECT x.id, '${t}' AS kind, x.car, x.track, x.created, x.anon, COALESCE(x.shown,'nick') AS shown, ${extra}
      u.id AS userId, u.alias, u.iracing, u.owner, o.display AS ownerName, ac.display AS account
      FROM community_${t} x JOIN community_users u ON u.id=x.user_id LEFT JOIN accounts o ON o.id=u.owner LEFT JOIN accounts ac ON ac.id=u.id
      ORDER BY x.created DESC LIMIT 300`).all();
    const [l, r] = await Promise.all([q("laps", "x.time,"), q("reports", "x.best AS time,")]);
    const items = [...(l.results || []), ...(r.results || [])].sort((a, b) => b.created - a.created).map((x) => ({
      ...x, shownAs: x.anon ? "Anonymous" : x.shown === "iracing" && x.iracing ? x.iracing : x.alias,
      // a rival of a race ("o:…", shared by the PC that raced them) is not a Drinks driver ("guest-…", who drove that PC)
      via: !x.owner ? "account" : String(x.userId).startsWith("o:") ? "rival" : "drinks",
      realUploader: !x.owner ? x.account || x.alias : String(x.userId).startsWith("o:") ? `${x.alias} (race rival · shared by ${x.ownerName || x.owner})` : `${x.alias} (Drinks · ${x.ownerName || x.owner})`,
    }));
    return json({ items });
  }
  // the supporter badge: the owner of Pitlane HQ (an admin) gives it and takes it away by hand
  if (p === "/admin/supporter" && m === "POST") {
    const acc = await sessionAccount(req, env);
    if (!acc || !isAdmin(env, acc.id)) return err("only the admins of this server can do this", 403);
    const id = String(body.id || "");
    const r = await env.DB.prepare("UPDATE accounts SET supporter=?2, supporter_src=?3 WHERE id=?1").bind(id, body.on ? 1 : 0, body.on ? "manual" : null).run();
    return r.meta && r.meta.changes ? json({ ok: true, supporter: !!body.on }) : err("account not found", 404);
  }
  // "in Pitlane HQ since" by hand (empty: the day the account was created)
  if (p === "/admin/since" && m === "POST") {
    const acc = await sessionAccount(req, env);
    if (!acc || !isAdmin(env, acc.id)) return err("only the admins of this server can do this", 403);
    const since = body.since == null || body.since === "" ? null : Number(body.since);
    if (since !== null && !(isFinite(since) && since > 946684800000 && since < Date.now() + 86400e3)) return err("that date is not valid", 400);
    const r = await env.DB.prepare("UPDATE accounts SET member_since=?2 WHERE id=?1").bind(String(body.id || ""), since === null ? null : Math.round(since)).run();
    return r.meta && r.meta.changes ? json({ ok: true, since }) : err("account not found", 404);
  }
  // the track maps drawn by dead reckoning take a lap of the same track with the game's own position (trackmaps.js)
  if (p === "/admin/trackmaps-rebuild" && m === "POST") {
    const acc = await sessionAccount(req, env);
    if (!acc || !isAdmin(env, acc.id)) return err("only the admins of this server can do this", 403);
    return json({ ok: true, ...(await rebuildTrackMaps(env, { all: true })) });
  }
  // the coach models of every car and track learn again from all their laps (the cron rebuilds them)
  if (p === "/admin/models" && m === "POST") {
    const acc = await sessionAccount(req, env);
    if (!acc || !isAdmin(env, acc.id)) return err("only the admins of this server can do this", 403);
    const r = await env.DB.prepare("UPDATE model_cache SET dirty=1").run();
    await env.DB.prepare("UPDATE car_cards SET dirty=1").run().catch(() => {});
    return json({ ok: true, models: (r.meta && r.meta.changes) || 0 });
  }
  // what is blocked now after wrong passwords or too many tries (15 minutes): one row per account, email or
  // network, with who it is when it is an account; a network only by a short mark of its hash
  if (p === "/admin/blocked" && m === "GET") {
    const acc = await sessionAccount(req, env);
    if (!acc || !isAdmin(env, acc.id)) return err("only the admins of this server can do this", 403);
    const since = Date.now() - 15 * 60e3;
    const rows = (await env.DB.prepare("SELECT k, COUNT(*) AS n, MAX(t) AS last FROM auth_fails WHERE t>=?1 GROUP BY k ORDER BY last DESC LIMIT 200").bind(since).all()).results || [];
    const hashes = rows.map((x) => /^(login|mail):([0-9a-f]{64})$/.exec(x.k)).filter(Boolean).map((x) => x[2]), ids = rows.map((x) => /^2fa:(.+)$/.exec(x.k)).filter(Boolean).map((x) => x[1]);
    const who = {};
    for (const h of hashes) { const a = await env.DB.prepare("SELECT id, display FROM accounts WHERE email_hash=?1").bind(h).first(); if (a) who[h] = a; }
    for (const id of ids) { const a = await env.DB.prepare("SELECT id, display FROM accounts WHERE id=?1").bind(id).first(); if (a) who[id] = a; }
    // networks are kept as a hash of their address (never the address): a short mark tells them apart
    const mask = (v) => /^ip:[0-9a-f]{6}/.test(v) ? "#" + v.slice(3, 9) : "#" + String(v).slice(0, 6);
    const limit = { login: 5, "2fa": 5, mail: 3, reset: 10, reg: 5, ip: 30 };
    return json({ blocked: rows.map((x) => {
      const m2 = /^(login|mail|2fa|reset|reg):(.+)$/.exec(x.k), kind = m2 ? m2[1] : "ip", v = m2 ? m2[2] : x.k, a = who[v];
      const net = kind === "ip" || ((kind === "mail" || kind === "reset" || kind === "reg") && !/^[0-9a-f]{64}$/.test(v));
      return { k: x.k, kind, n: x.n, last: x.last, account: a ? { id: a.id, display: a.display } : null, net: net ? mask(v) : null, blocked: x.n >= (net && kind === "mail" ? 10 : limit[kind] || 5) };
    }) });
  }
  // the blocked sign-ins open again: one entry ({k}), one email ({email}: its sign-ins, codes and emails) or all of them
  if (p === "/admin/unlock" && m === "POST") {
    const acc = await sessionAccount(req, env);
    if (!acc || !isAdmin(env, acc.id)) return err("only the admins of this server can do this", 403);
    let r;
    if (typeof body.k === "string" && body.k) r = await env.DB.prepare("DELETE FROM auth_fails WHERE k=?1").bind(body.k.slice(0, 200)).run();
    else if (typeof body.account === "string" && /^[A-Za-z0-9]{8,40}$/.test(body.account)) {
      const a = await env.DB.prepare("SELECT id, email_hash FROM accounts WHERE id=?1").bind(body.account).first();
      if (!a) return err("account not found", 404);
      r = await env.DB.prepare("DELETE FROM auth_fails WHERE k IN (?1, ?2, ?3)").bind("login:" + a.email_hash, "mail:" + a.email_hash, "2fa:" + a.id).run();
    } else if (typeof body.email === "string" && body.email.includes("@")) {
      const eh = await emailHash(env, body.email), a = await env.DB.prepare("SELECT id FROM accounts WHERE email_hash=?1").bind(eh).first();
      r = await env.DB.prepare("DELETE FROM auth_fails WHERE k IN (?1, ?2, ?3)").bind("login:" + eh, "mail:" + eh, "2fa:" + (a ? a.id : "-")).run();
    } else if (body.all === true) r = await env.DB.prepare("DELETE FROM auth_fails").run();
    else return err("say what to unblock", 400);
    return json({ ok: true, cleared: (r.meta && r.meta.changes) || 0 });
  }
  // help with an account (support and moderation): confirm its email, turn off its two-step sign-in (a lost
  // phone), sign it out everywhere, give it another public name (an offensive one) or undo its iRacing driver link
  const ua = p.match(/^\/admin\/users\/([A-Za-z0-9]{8,40})\/(verify|2fa-off|signout|rename|unlink-driver|link-guest|unlink-guest)$/);
  if (ua && m === "POST") {
    const acc = await sessionAccount(req, env);
    if (!acc || !isAdmin(env, acc.id)) return err("only the admins of this server can do this", 403);
    const id = ua[1], a = await env.DB.prepare("SELECT id FROM accounts WHERE id=?1").bind(id).first();
    if (!a) return err("account not found", 404);
    if (ua[2] === "verify") await env.DB.prepare("UPDATE accounts SET verified=1 WHERE id=?1").bind(id).run();
    if (ua[2] === "2fa-off") await env.DB.batch([env.DB.prepare("UPDATE accounts SET totp=NULL, totp_on=0, totp_pending=NULL WHERE id=?1").bind(id), env.DB.prepare("DELETE FROM recovery_codes WHERE account_id=?1").bind(id)]);
    if (ua[2] === "signout") await env.DB.prepare("DELETE FROM account_sessions WHERE account_id=?1").bind(id).run();
    // a wrong link to a driver of a game (body.game, or name from the phones; without it every game's): their laps still
    // to come go back to the rival of a race
    // (in Le Mans Ultimate what the link took goes back to the rival, and it never links again by itself: driverlinks.js)
    if (ua[2] === "unlink-driver") {
      const g = String(body.game || body.name || "");
      await unlinkDriver(env, id, g ? gameOf(g) : null);
    }
    // a DRINKS driver (a friend who drove on an admin's PC) joined to the friend's own account: what was shared
    // under the driver's name goes to the account (per car and track the faster lap stays, like an iRacing driver's)
    // and so does what comes later; undone, the laps stay where they are and new ones go under the name again
    if (ua[2] === "link-guest" || ua[2] === "unlink-guest") {
      const want = String(body.guest || body.name || "").trim();
      if (!want) return err("which DRINKS driver?", 400);
      const g = want.startsWith("guest-")
        ? await env.DB.prepare("SELECT id, alias FROM community_users WHERE id=?1 AND id LIKE 'guest-%'").bind(want).first()
        : await env.DB.prepare("SELECT id, alias FROM community_users WHERE id LIKE 'guest-%' AND lower(alias)=lower(?1) ORDER BY (owner=?2) DESC LIMIT 1").bind(cleanAlias(want), acc.id).first();
      if (!g) return err("DRINKS driver not found", 404);
      if (ua[2] === "unlink-guest") {
        await env.DB.prepare("DELETE FROM guest_links WHERE gid=?1 AND account_id=?2").bind(g.id, id).run();
        return json({ ok: true, name: g.alias });
      }
      const had = await env.DB.prepare("SELECT account_id FROM guest_links WHERE gid=?1").bind(g.id).first();
      if (had && had.account_id !== id) return err("this DRINKS driver is already joined to another account", 409);
      const target = await env.DB.prepare("SELECT anon, name_kind FROM accounts WHERE id=?1").bind(id).first();
      const shown = target && target.name_kind === "iracing" ? "iracing" : "nick";
      const laps = (await env.DB.prepare("SELECT id, car_id, track_id, time, game, trace IS NOT NULL AS traced FROM community_laps WHERE user_id=?1").bind(g.id).all()).results || [];
      const q = [], combos = new Set();
      for (const l of laps) {
        const mine = await env.DB.prepare("SELECT id, time, trace IS NOT NULL AS traced FROM community_laps WHERE user_id=?1 AND car_id=?2 AND track_id=?3").bind(id, l.car_id, l.track_id).first();
        combos.add(l.game + "|" + l.track_id + "|" + l.car_id);
        const take = env.DB.prepare("UPDATE community_laps SET user_id=?2, anon=?3, shown=?4 WHERE id=?1").bind(l.id, id, target && target.anon ? 1 : 0, shown);
        if (!mine) { q.push(take); continue; }
        const better = mine.time > l.time || (!mine.traced && !!l.traced); // the same rule as keepBestLap
        if (better) q.push(env.DB.prepare("DELETE FROM community_laps WHERE id=?1").bind(mine.id), take);
        else q.push(env.DB.prepare("DELETE FROM community_laps WHERE id=?1").bind(l.id));
      }
      q.push(env.DB.prepare("UPDATE community_reports SET user_id=?2 WHERE user_id=?1").bind(g.id, id));
      if (!had) q.push(env.DB.prepare("INSERT INTO guest_links (gid, account_id, created) VALUES (?1,?2,?3)").bind(g.id, id, Date.now()));
      await env.DB.batch(q);
      await moveDriver(env, "acct:" + g.id, "acct:" + id).catch(() => {}); // what the model learnt of the driver is the account's pace now
      for (const c of combos) { const [gm, t, cId] = c.split("|"); await markModel(env, gm, +t, +cId).catch(() => {}); }
      return json({ ok: true, name: g.alias, moved: laps.length });
    }
    if (ua[2] === "rename") {
      const display = cleanName(body.name);
      if (!display) return err("choose a public name", 400);
      if (await nameTaken(env, display, id)) return err("this nickname is already taken", 409);
      await env.DB.batch([env.DB.prepare("UPDATE accounts SET display=?2, name_kind='nick' WHERE id=?1").bind(id, display), env.DB.prepare("UPDATE community_users SET alias=?2 WHERE id=?1").bind(id, display)]);
    }
    return json({ ok: true });
  }
  // the latest sessions uploaded to the server (every account): what is coming in
  if (p === "/admin/sessions" && m === "GET") {
    const acc = await sessionAccount(req, env);
    if (!acc || !isAdmin(env, acc.id)) return err("only the admins of this server can do this", 403);
    const r = await env.DB.prepare(`SELECT s.id, s.started, s.track, s.track_config AS trackConfig, s.car, s.kind, s.laps, s.game, s.official, s.cat, a.display AS who, a.id AS accountId
      FROM sessions s LEFT JOIN accounts a ON 'acct:'||a.id=s.uploader ORDER BY s.started DESC LIMIT 100`).all();
    return json({ sessions: r.results || [] });
  }
  // a supporter hides (or shows again) their own badge
  if (p === "/profile/badge" && m === "POST") {
    const who = await sessionAccount(req, env);
    if (!who) return err("sign in with your Pitlane HQ account", 401);
    await env.DB.prepare("UPDATE accounts SET supporter_hidden=?2 WHERE id=?1").bind(who.id, body.hidden ? 1 : 0).run();
    return json({ ok: true, hidden: !!body.hidden });
  }
  // your recent races for your profile, as your apps summarise them: only your own result, never the other drivers
  if (p === "/profile/races" && m === "POST") {
    const who = await sessionAccount(req, env);
    if (!who) return err("sign in with your Pitlane HQ account", 401);
    const n = (v, lo, hi) => (typeof v === "number" && isFinite(v) && v >= lo && v <= hi ? v : null);
    const list = (Array.isArray(body.races) ? body.races : []).slice(0, 30).map((x) => x && typeof x.id === "string" && /^[A-Za-z0-9_.:-]{1,80}$/.test(x.id) && n(x.when, 1e12, 1e13) ? {
      id: x.id, when: Math.round(x.when), game: gameOf(x.game), track: str(x.track), car: str(x.car), cat: CATS.includes(x.cat) ? x.cat : null, lic: licOf(x.lic),
      official: x.official === true, start: n(x.start, 0, 200), finish: n(x.finish, 0, 200), field: n(x.field, 0, 200), inc: n(x.inc, 0, 999),
      best: n(x.best, 0, 3600), laps: n(x.laps, 0, 9999), ir: n(x.ir, 0, 20000), irChange: n(x.irChange, -2000, 2000), sof: n(x.sof, 0, 20000), dnf: x.dnf === true,
    } : null).filter(Boolean);
    await env.DB.batch([
      env.DB.prepare("DELETE FROM profile_races WHERE account_id=?1").bind(who.id),
      ...list.map((x) => env.DB.prepare("INSERT INTO profile_races (account_id, id, at, data) VALUES (?1,?2,?3,?4) ON CONFLICT DO NOTHING").bind(who.id, x.id, x.when, JSON.stringify(x))),
    ]);
    return json({ ok: true, races: list.length });
  }
  // the league hub: a league is a post (the days it races, the usual start in its time zone, one or several
  // disciplines, an optional Discord invite and website, whether it is looking for drivers), everyone browses the
  // posts, and each creator sees the views and clicks theirs get: one view per viewer and day when the post is
  // opened, one click per viewer, day and link, never the creator's own. In development: only the admins until
  // LEAGUES_OPEN is "1"; the owner of a league (or an admin) edits or removes it
  if (p === "/leagues" || p.startsWith("/leagues/")) {
    const who = await sessionAccount(req, env).catch(() => null), admin = !!who && isAdmin(env, who.id);
    const parts = p.slice(9).split("/").filter(Boolean), lid = parts[0] || "", sub = parts[1] || "";
    // the game whose leagues are listed (?game=iracing|lmu, iRacing unless said)
    const lgGame = leagueGame(url.searchParams.get("game") || (m === "POST" && body && body.game));
    // the most active leagues are public (the landing, the public leagues page): anyone reads them, signed in or not
    if (lid === "found" && !sub && m === "GET") return json(await foundLeagues(env, admin, lgGame));
    if (env.LEAGUES_OPEN !== "1" && !admin) return err("leagues are in development", 403);
    // the most active leagues found in public posts (r/iRacing, r/iRacingLeagues; r/LeMansUltimateWEC for LMU) with their Discord; admins hide
    // one, edit its name, text and disciplines, or read the feeds again now
    if (lid === "found") {
      if (m === "GET") return json(await foundLeagues(env, admin, lgGame));
      if (m !== "POST" || !admin) return err("only the admins can do this", 403);
      if (sub && "edit" in body) return (await editFound(env, sub, body.edit)) ? json(await foundLeagues(env, admin, lgGame)) : err("league not found", 404);
      if (sub) { await env.DB.prepare("UPDATE league_found SET hidden=?2 WHERE guild=?1").bind(sub, body.hidden ? 1 : 0).run(); return json({ ok: true }); }
      if (body.invite) { const r = await addFound(env, body.invite, body.game); if (r.error) return err(r.error, 400); return json(await foundLeagues(env, admin, lgGame)); }
      await scanLeagues(env, true);
      return json(await foundLeagues(env, admin, lgGame));
    }
    const lst = (v) => { try { const a = JSON.parse(v || "[]"); return Array.isArray(a) ? a : []; } catch (e) { return []; } };
    const row = (x) => {
      const cats = lst(x.cats).filter((c) => CATS.includes(c));
      const o = { id: x.id, name: x.name, about: x.about || "", cat: cats.length === 1 ? cats[0] : null, cats, days: lst(x.days).map(Number).filter((d) => d >= 0 && d <= 6),
        time: x.time || "", tz: x.tz || "", open: !!x.open, discord: x.discord || "", web: x.web || "", schedule: x.schedule || "", cars: x.cars || "", lang: x.lang || "",
        created: x.created, updated: x.updated, game: x.game || "iracing", mine: !!who && x.owner === who.id, by: x.alias || "Driver" };
      if (o.mine || admin) { o.views = x.views || 0; o.clicks = x.clicks || 0; }
      return o;
    };
    // how many leagues a driver may post: 3, or 10 for a supporter (Patreon or by hand, shown or hidden)
    const leagueLimit = async () => {
      if (!who) return LEAGUES_FREE;
      const a = await env.DB.prepare("SELECT supporter FROM accounts WHERE id=?1").bind(who.id).first().catch(() => null);
      return a && a.supporter ? LEAGUES_SUPPORTER : LEAGUES_FREE;
    };
    if (m === "GET" && !lid) {
      const r = await env.DB.prepare("SELECT l.*, u.alias FROM leagues l LEFT JOIN community_users u ON u.id=l.owner WHERE l.game=?1 ORDER BY l.updated DESC LIMIT 300").bind(lgGame).all();
      const limit = await leagueLimit();
      // the limit counts the driver's leagues of every game together
      const mineN = who ? ((await env.DB.prepare("SELECT COUNT(*) AS n FROM leagues WHERE owner=?1").bind(who.id).first().catch(() => null)) || {}).n || 0 : 0;
      return json({ game: lgGame, posted: mineN, leagues: (r.results || []).map(row), admin, open: env.LEAGUES_OPEN === "1", limit, supporter: limit === LEAGUES_SUPPORTER, limits: { free: LEAGUES_FREE, supporter: LEAGUES_SUPPORTER } });
    }
    const cur = lid ? await env.DB.prepare("SELECT l.*, u.alias FROM leagues l LEFT JOIN community_users u ON u.id=l.owner WHERE l.id=?1").bind(lid).first() : null;
    if (lid && !cur) return err("league not found", 404);
    if (m === "GET") {
      // one post, with its last 14 days of views and clicks for its creator (and the admins)
      const o = row(cur);
      let days = [];
      if (o.views !== undefined) {
        const since = new Date(Date.now() - 13 * 864e5).toISOString().slice(0, 10);
        const r = await env.DB.prepare("SELECT day, views, clicks FROM league_days WHERE league_id=?1 AND day>=?2 ORDER BY day").bind(lid, since).all();
        days = (r.results || []).map((d) => ({ day: d.day, views: d.views || 0, clicks: d.clicks || 0 }));
      }
      return json({ league: o, days });
    }
    if (m !== "POST") return err("not found", 404);
    if (lid && sub === "hit") {
      // a view (the post opened) or a click (its Discord or website): once per viewer and day, never the creator's
      const kind = ["view", "discord", "web"].includes(body.kind) ? body.kind : "";
      if (!kind) return err("what was it", 400);
      if (who && who.id === cur.owner) return json({ ok: true, counted: false });
      const viewer = who ? "a:" + who.id : "n:" + (await sha256("league-viewer|" + (env.DATA_KEY || "") + "|" + (req.headers.get("cf-connecting-ip") || "") + "|" + (req.headers.get("user-agent") || ""))).slice(0, 24);
      const day = new Date().toISOString().slice(0, 10);
      const ins = await env.DB.prepare("INSERT OR IGNORE INTO league_hits (league_id, viewer, day, kind) VALUES (?1,?2,?3,?4)").bind(lid, viewer, day, kind).run();
      if (!(ins.meta && ins.meta.changes)) return json({ ok: true, counted: false });
      const col = kind === "view" ? "views" : "clicks";
      const q = [
        env.DB.prepare(`UPDATE leagues SET ${col}=${col}+1 WHERE id=?1`).bind(lid),
        env.DB.prepare(`INSERT INTO league_days (league_id, day, ${col}) VALUES (?1,?2,1) ON CONFLICT(league_id, day) DO UPDATE SET ${col}=${col}+1`).bind(lid, day),
      ];
      if (Math.random() < 0.02) q.push(env.DB.prepare("DELETE FROM league_hits WHERE day < ?1").bind(new Date(Date.now() - 45 * 864e5).toISOString().slice(0, 10)));
      await env.DB.batch(q);
      return json({ ok: true, counted: true });
    }
    if (!who) return err("sign in with your Pitlane HQ account", 401);
    if (lid && cur.owner !== who.id && !admin) return err("league not found", 404);
    if (lid && body.delete) {
      await env.DB.batch([
        env.DB.prepare("DELETE FROM league_hits WHERE league_id=?1").bind(lid),
        env.DB.prepare("DELETE FROM league_days WHERE league_id=?1").bind(lid),
        env.DB.prepare("DELETE FROM leagues WHERE id=?1").bind(lid),
      ]);
      return json({ ok: true, deleted: true });
    }
    const txt = (v, n) => (typeof v === "string" ? v.replace(/[\u0000-\u001f\u007f]/g, " ").replace(/\s+/g, " ").trim().slice(0, n) : "");
    const link = (v, re) => { const t = txt(v, 200); return re.test(t) ? t : ""; };
    const discord = link(body.discord, /^https:\/\/(discord\.gg|(www\.)?discord\.com\/invite)\/[A-Za-z0-9-]{2,40}\/?$/);
    const web = link(body.web, /^https:\/\/[^\s"'<>]{4,190}$/);
    const name = txt(body.name, 60);
    if (name.length < 3) return err("the league needs a name", 400);
    if (txt(body.discord, 200) && !discord) return err("the Discord link must be an invite: https://discord.gg/… or https://discord.com/invite/…", 400);
    if (txt(body.web, 200) && !web) return err("the website must be an https:// address", 400);
    if (!discord && !web) return err("give drivers a way in: a Discord invite or a website", 400);
    const cats = Array.isArray(body.cats) ? [...new Set(body.cats.filter((c) => CATS.includes(c)))] : CATS.includes(body.cat) ? [body.cat] : [];
    const days = Array.isArray(body.days) ? [...new Set(body.days.map(Number).filter((d) => Number.isInteger(d) && d >= 0 && d <= 6))].sort((a, b) => a - b) : [];
    const time = /^([01]\d|2[0-3]):[0-5]\d$/.test(String(body.time || "")) ? String(body.time) : "";
    let tz = txt(body.tz, 60);
    try { if (tz) new Intl.DateTimeFormat("en", { timeZone: tz }); } catch (e) { tz = ""; }
    const x = { name, about: txt(body.about, 600), cat: cats.length === 1 ? cats[0] : null, cats: JSON.stringify(cats), days: JSON.stringify(days), time, tz: time ? tz : "",
      open: body.open === undefined ? 1 : body.open ? 1 : 0, game: body.game ? leagueGame(body.game) : cur ? leagueGame(cur.game) : "iracing", discord, web, schedule: txt(body.schedule, 80), cars: txt(body.cars, 120), lang: txt(body.lang, 30) };
    const now = Date.now();
    if (cur) {
      await env.DB.prepare("UPDATE leagues SET name=?2, about=?3, cat=?4, cats=?5, days=?6, time=?7, tz=?8, open=?9, discord=?10, web=?11, schedule=?12, cars=?13, lang=?14, updated=?15, game=?16 WHERE id=?1")
        .bind(lid, x.name, x.about, x.cat, x.cats, x.days, x.time, x.tz, x.open, x.discord, x.web, x.schedule, x.cars, x.lang, now, x.game).run();
      return json({ ok: true, id: lid });
    }
    const n = await env.DB.prepare("SELECT COUNT(*) AS n FROM leagues WHERE owner=?1").bind(who.id).first();
    const limit = await leagueLimit();
    if (n && n.n >= limit && !admin) return err(limit === LEAGUES_SUPPORTER ? `you can post up to ${limit} leagues` : `you can post up to ${limit} leagues (${LEAGUES_SUPPORTER} as a supporter)`, 429);
    const id = rid();
    await env.DB.prepare("INSERT INTO leagues (id, owner, name, about, cat, cats, days, time, tz, open, discord, web, schedule, cars, lang, created, updated, game) VALUES (?1,?2,?3,?4,?5,?6,?7,?8,?9,?10,?11,?12,?13,?14,?15,?16,?16,?17)")
      .bind(id, who.id, x.name, x.about, x.cat, x.cats, x.days, x.time, x.tz, x.open, x.discord, x.web, x.schedule, x.cars, x.lang, now, x.game).run();
    return json({ ok: true, id, game: x.game });
  }
  // a driver's profile, opened from one of their laps on a leaderboard (or yours, ?me=1): their nickname (never
  // their iRacing name), their license classes, their laps on the leaderboards and their recent races. An
  // anonymous driver has no profile; their anonymous laps never show on it. Admins see everything.
  if (p === "/profile" && m === "GET") {
    const viewer = await sessionAccount(req, env).catch(() => null), admin = !!viewer && isAdmin(env, viewer.id);
    let uid = null, fromAnon = false;
    if (url.searchParams.get("me") === "1") uid = viewer ? viewer.id : null;
    else if (admin && /^[A-Za-z0-9]{8,40}$/.test(url.searchParams.get("id") || "")) uid = url.searchParams.get("id"); // the admin panel
    else {
      const l = await env.DB.prepare("SELECT user_id, anon FROM community_laps WHERE id=?1").bind(String(url.searchParams.get("lap") || "")).first();
      if (l) { uid = l.user_id; fromAnon = l.anon === 1; }
    }
    const a = uid ? await env.DB.prepare("SELECT a.id, a.anon, a.name_kind, a.created, a.member_since, a.supporter, a.supporter_hidden, u.alias, u.lics FROM accounts a JOIN community_users u ON u.id=a.id WHERE a.id=?1").bind(uid).first() : null;
    const mine = !!a && !!viewer && viewer.id === a.id;
    if (!a || ((fromAnon || a.anon) && !admin && !mine)) return err("this driver is anonymous", 404);
    const laps = (await env.DB.prepare(
      `SELECT id, track, car, track_id AS trackId, car_id AS carId, time, created, anon, game, cat, lic,
         (SELECT COUNT(*) FROM community_laps o WHERE o.track_id=l.track_id AND o.car_id=l.car_id AND o.game=l.game AND COALESCE(o.shown,'')<>'model' AND o.time<l.time)+1 AS pos,
         (SELECT COUNT(*) FROM community_laps o WHERE o.track_id=l.track_id AND o.car_id=l.car_id AND o.game=l.game AND COALESCE(o.shown,'')<>'model') AS "of",
         (SELECT MIN(o.time) FROM community_laps o WHERE o.track_id=l.track_id AND o.car_id=l.car_id AND o.game=l.game AND COALESCE(o.shown,'')<>'model') AS rec
       FROM community_laps l WHERE user_id=?1 AND COALESCE(shown,'')<>'model' ${admin || mine ? "" : "AND anon=0"} ORDER BY created DESC LIMIT 60`
    ).bind(a.id).all()).results || [];
    const cm = await catMap(env).catch(() => ({ tc: {}, c: {} }));
    const races = (((await env.DB.prepare("SELECT data FROM profile_races WHERE account_id=?1 ORDER BY at DESC LIMIT 20").bind(a.id).all()).results) || []).map((x) => JSON.parse(x.data));
    let lics = {};
    try { lics = JSON.parse(a.lics || "{}") || {}; } catch (e) {}
    const sup = !!a.supporter;
    // the days they drove in the last 6 months (sessions per day, in the viewer's time zone), like the calendar of Home
    const tz = Math.max(-840, Math.min(840, parseInt(url.searchParams.get("tz") || "0", 10) || 0));
    const days = {};
    for (const x of ((await env.DB.prepare("SELECT started FROM sessions WHERE uploader=?1 AND started>?2 LIMIT 3000").bind("acct:" + a.id, Date.now() - 200 * 86400e3).all()).results) || []) {
      const d = new Date(x.started - tz * 60000), k = d.getUTCFullYear() + "-" + (d.getUTCMonth() + 1) + "-" + d.getUTCDate();
      days[k] = (days[k] || 0) + 1;
    }
    // their Discord, when they chose to show it (Account → Discord) so other drivers can find them there
    const dc = await env.DB.prepare("SELECT discord_id, handle FROM discord_links WHERE account_id=?1 AND shown=1").bind(a.id).first().catch(() => null);
    // and their Steam (Account → Steam), the same way
    const sl = await env.DB.prepare("SELECT steamid, persona FROM steam_links WHERE account_id=?1 AND shown=1").bind(a.id).first().catch(() => null);
    // admins: the driver's latest sessions, to open their laps one by one (a private account too)
    const sessions = admin ? (((await env.DB.prepare("SELECT id, started, track, track_config AS trackConfig, car, kind, laps, best FROM sessions WHERE uploader=?1 ORDER BY started DESC LIMIT 30").bind("acct:" + a.id).all()).results) || []) : undefined;
    // your own profile: how your best came down over your last sessions of each car and track (the best so far after
    // each of them, oldest first), for the line beside each of your leaderboards in Community
    const trend = {};
    if (mine) {
      const fam = new Map();
      for (const x of (((await env.DB.prepare("SELECT game, car_id, fam_id FROM car_families").all().catch(() => null)) || {}).results || [])) fam.set((x.game || "iracing") + ":" + x.car_id, x.fam_id);
      const by = new Map();
      for (const x of ((await env.DB.prepare("SELECT game, track_id, car_id, best FROM sessions WHERE uploader=?1 AND best>0 AND track_id>0 AND car_id>0 ORDER BY started ASC LIMIT 5000").bind("acct:" + a.id).all()).results) || []) {
        const g = x.game || "iracing", k = g + ":" + x.track_id + ":" + (fam.get(g + ":" + x.car_id) || x.car_id);
        if (!by.has(k)) by.set(k, []);
        by.get(k).push(x.best);
      }
      for (const [k, list] of by) {
        let b = Infinity;
        const run = list.map((v) => (b = Math.min(b, v)));
        if (run.length > 1) trend[k] = run.slice(-8).map((v) => Math.round(v * 1000) / 1000);
      }
    }
    return json({
      name: a.alias || "Driver", since: a.member_since || a.created, mine, admin, anonymous: !!a.anon,
      shownAs: admin || mine ? (a.anon ? "anonymous" : a.name_kind === "iracing" ? "iracing" : "nick") : undefined, // how the account shows itself
      discord: dc ? { id: dc.discord_id, handle: dc.handle || "" } : undefined,
      steam: sl ? { id: sl.steamid, persona: sl.persona || "" } : undefined,
      supporter: sup && (!a.supporter_hidden || mine || admin), supporterHidden: mine || admin ? !!a.supporter_hidden : undefined,
      lics, races, days, sessions,
      laps: laps.map((x) => ({ ...x, trend: trend[(x.game || "iracing") + ":" + x.trackId + ":" + x.carId], car: famName(x.game, x.carId, x.car), anon: !!x.anon, lic: licOf(lics[x.cat]) || licOf(x.lic), cat: (x.game || "iracing") === "iracing" ? catOf(cm, x.trackId, x.carId, x.cat, x.track, x.car) : null })),
    });
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
    // the other drivers of the race are anonymous (they did not join Pitlane HQ; an admin with admin mode on sees their
    // name); the sharer as "Anonymous" when asked
    const rivals = seesRivals(req, env, await me(req, env).catch(() => null));
    for (const k of ["results", "brakes"]) if (Array.isArray(data[k])) data[k] = data[k].map((x) => (!x ? x : x.me ? (r.anon ? { ...x, name: "Anonymous" } : x) : rivals ? x : { ...x, name: "Anonymous" }));
    return json({ ...data, id: r.id, alias: r.alias, game: r.game, shared: true });
  }

  // the current season schedule: public to read, uploaded by the accounts in SEASON_UPLOADERS
  if (p === "/season" && m === "GET") {
    const c = await env.DB.prepare("SELECT updated, chunks FROM season_cache WHERE k='current'").first();
    if (!c) return err("no season schedule on this server yet", 404);
    const r = await env.DB.prepare("SELECT data FROM season_chunks WHERE k='current' AND idx<?1 ORDER BY idx").bind(c.chunks).all();
    // and when the official races of each season really started lately (seasonseen.js): the planner corrects its times
    const seen = await seenSummary(env).catch(() => ({}));
    return new Response('{"updated":' + c.updated + ',"seen":' + JSON.stringify(seen) + ',"season":' + (r.results || []).map((x) => x.data).join("") + "}", { headers: { ...JSONH, "cache-control": "public, max-age=900" } });
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
  // the DRINKS drivers of this admin (every friend who ever shared a lap from their PC): a list lost on the PC
  // comes back from here
  if (p === "/guests" && m === "GET") {
    if (!u.account || !isAdmin(env, u.id)) return err("only the admins of this server can do this", 403);
    const r = await env.DB.prepare("SELECT g.id, g.alias, g.created, (SELECT COUNT(*) FROM community_laps l WHERE l.user_id=g.id) AS laps, (SELECT a.display FROM guest_links gl JOIN accounts a ON a.id=gl.account_id WHERE gl.gid=g.id) AS linked FROM community_users g WHERE g.owner=?1 AND g.id LIKE 'guest-%' ORDER BY g.created DESC LIMIT 60").bind(u.id).all();
    return json({ guests: (r.results || []).map((x) => ({ id: x.id, name: x.alias, laps: x.laps || 0, created: x.created, linked: x.linked || null })) });
  }
  // Friday night mode: an admin shares the laps of friends who drive on the admin's PC,
  // each under the friend's own name (one community driver per name, owned by that admin)
  if (m === "POST" && (p === "/laps" || p === "/reports") && typeof body.guest === "string" && body.guest.trim()) {
    if (!u.account || !isAdmin(env, u.id)) return err("only the admins of this server can share laps for other drivers", 403);
    const name = cleanAlias(body.guest);
    // a driver renamed before keeps their id (and their laps): found by name among this admin's drivers first
    const had = await env.DB.prepare("SELECT id FROM community_users WHERE owner=?1 AND id LIKE 'guest-%' AND lower(alias)=lower(?2)").bind(u.id, name).first();
    const gid = had ? had.id : "guest-" + (await sha256(u.id + ":" + name.toLowerCase())).slice(0, 20);
    // your own Drinks drivers never clash with each other or with you, only with the rest of the platform
    if (await nameTaken(env, name, u.id)) return json({ error: `"${name}" is already used by another driver on Pitlane HQ, choose another name`, code: "name_taken" }, 409);
    await env.DB.prepare("INSERT INTO community_users (id, token_hash, alias, created, owner) VALUES (?1,?2,?3,?4,?5) ON CONFLICT(id) DO UPDATE SET alias=excluded.alias, owner=excluded.owner")
      .bind(gid, await sha256("guest:" + gid + ":" + rid()), name, Date.now(), u.id).run();
    // a driver an admin joined to the friend's own Pitlane HQ account: the lap goes to that account, as the account chose
    const gl = await env.DB.prepare("SELECT l.account_id AS id, a.anon, a.name_kind FROM guest_links l JOIN accounts a ON a.id=l.account_id WHERE l.gid=?1").bind(gid).first();
    const to = gl ? await env.DB.prepare("SELECT id, alias, uploads_day, uploads FROM community_users WHERE id=?1").bind(gl.id).first() : null;
    u = to || (await env.DB.prepare("SELECT id, alias, uploads_day, uploads FROM community_users WHERE id=?1").bind(gid).first());
    body.anon = !!(to && gl.anon);
    body.as = to && gl.name_kind === "iracing" ? "iracing" : "nick";
  }
  // the name a shared item goes under, asked before every share: anonymous (stays anonymous
  // whatever you change later), your nickname or your iRacing name (both follow your changes)
  if (body.as === "anon") body.anon = true;
  else if (body.as === "nick" || body.as === "iracing") body.anon = false;
  const shownAs = body.as === "iracing" ? "iracing" : "nick";
  if (shownAs === "iracing" && typeof body.iracingName === "string" && body.iracingName.trim())
    await env.DB.prepare("UPDATE community_users SET iracing=?2 WHERE id=?1").bind(u.id, cleanAlias(body.iracingName)).run();
  // rename one of your Drinks drivers: the same driver (and laps, on every leaderboard) under the new name
  if (p === "/guest-rename" && m === "POST") {
    if (!u.account || !isAdmin(env, u.id)) return err("only the admins of this server can do this", 403);
    const from = cleanAlias(body.from || ""), to = cleanAlias(body.to || "");
    if (!from || !to) return err("both names are needed", 400);
    if (await nameTaken(env, to, u.id)) return json({ error: `"${to}" is already used by another driver on Pitlane HQ, choose another name`, code: "name_taken" }, 409);
    const row = await env.DB.prepare("SELECT id FROM community_users WHERE owner=?1 AND id LIKE 'guest-%' AND lower(alias)=lower(?2)").bind(u.id, from).first();
    if (from.toLowerCase() !== to.toLowerCase()) {
      const clash = await env.DB.prepare("SELECT id FROM community_users WHERE owner=?1 AND id LIKE 'guest-%' AND lower(alias)=lower(?2)").bind(u.id, to).first();
      if (clash) return json({ error: `You already have a driver called "${to}"`, code: "name_taken" }, 409);
    }
    if (row) await env.DB.prepare("UPDATE community_users SET alias=?2 WHERE id=?1").bind(row.id, to).run();
    // and their laps in the account's sessions
    await env.DB.prepare("UPDATE laps SET drv=?3 WHERE lower(drv)=lower(?2) AND session_id IN (SELECT id FROM sessions WHERE uploader=?1)").bind("acct:" + u.id, from, to).run().catch(() => {});
    // the names each session keeps of its friends (migration 0078) follow
    await env.DB.prepare("UPDATE sessions SET drvs=(SELECT group_concat(DISTINCT drv) FROM laps WHERE session_id=sessions.id) WHERE uploader=?1 AND drvs IS NOT NULL").bind("acct:" + u.id).run().catch(() => {});
    return json({ ok: true, renamed: !!row, name: to });
  }
  // is this name free? (Drinks drivers of an admin only clash with other people on the platform)
  if (p === "/name-check" && m === "POST") {
    if (!u.account || !isAdmin(env, u.id)) return err("only the admins of this server can do this", 403);
    return json({ free: !(await nameTaken(env, cleanAlias(body.name), u.id)) });
  }
  // an official race this PC is in: when it really started (no driver, only the season, track and minute)
  if (p === "/season/seen" && m === "POST") {
    const r = await recordSeen(env, u.id, body);
    return r.error ? err(r.error, r.status) : json(r);
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
  // a PC signed in to an account brings what it shared before with its own community token (an older PC,
  // or before the account existed): it all goes under the account and its one public name; per car and
  // track the faster lap stays (or the one with telemetry), the model counts them as one driver
  if (p === "/adopt" && m === "POST") {
    if (!u.account) return err("sign in with your Pitlane HQ account", 401);
    const t = typeof body.token === "string" ? body.token.trim() : "";
    if (t.length < 20) return err("missing token", 400);
    const d = await env.DB.prepare("SELECT id FROM community_users WHERE token_hash=?1").bind(await sha256(t)).first();
    if (!d || d.id === u.id || /^(o:|guest-)/.test(d.id) || (await env.DB.prepare("SELECT 1 FROM accounts WHERE id=?1").bind(d.id).first())) return json({ adopted: 0 });
    const laps = (await env.DB.prepare("SELECT id, car_id, track_id, time, game, trace IS NOT NULL AS traced FROM community_laps WHERE user_id=?1").bind(d.id).all()).results || [];
    const q = [], combos = new Set();
    for (const l of laps) {
      const mine = await env.DB.prepare("SELECT id, time, trace IS NOT NULL AS traced FROM community_laps WHERE user_id=?1 AND car_id=?2 AND track_id=?3").bind(u.id, l.car_id, l.track_id).first();
      combos.add(l.game + "|" + l.track_id + "|" + l.car_id);
      if (!mine) { q.push(env.DB.prepare("UPDATE community_laps SET user_id=?2 WHERE id=?1").bind(l.id, u.id)); continue; }
      const better = mine.time > l.time || (!mine.traced && !!l.traced); // the same rule as keepBestLap
      if (better) q.push(env.DB.prepare("DELETE FROM community_laps WHERE id=?1").bind(mine.id), env.DB.prepare("UPDATE community_laps SET user_id=?2 WHERE id=?1").bind(l.id, u.id));
      else q.push(env.DB.prepare("DELETE FROM community_laps WHERE id=?1").bind(l.id));
    }
    q.push(
      env.DB.prepare("UPDATE community_reports SET user_id=?2 WHERE user_id=?1").bind(d.id, u.id),
      env.DB.prepare("UPDATE OR IGNORE community_setups SET user_id=?2 WHERE user_id=?1").bind(d.id, u.id),
      env.DB.prepare("DELETE FROM community_setups WHERE user_id=?1").bind(d.id),
      env.DB.prepare("UPDATE track_maps SET user_id=?2 WHERE user_id=?1").bind(d.id, u.id),
      env.DB.prepare("DELETE FROM community_users WHERE id=?1").bind(d.id),
    );
    await env.DB.batch(q);
    await moveDriver(env, "acct:" + d.id, "acct:" + u.id);
    for (const c of combos) { const [g, tr, ca] = c.split("|"); await markModel(env, g, +tr, +ca); }
    return json({ adopted: laps.length });
  }
  // the names of the race rivals this account's PC shared before their names went up (they stayed "Anonymous"): the
  // PC's race history knows each rival's name, car, track and best lap, and the rival whose lap is that one takes
  // their whole name (rivals named "Juan M." before take it too). Only rivals this account shared
  if (p === "/rival-names" && m === "POST") {
    if (!u.account) return err("sign in with your Pitlane HQ account", 401);
    const items = (Array.isArray(body.items) ? body.items : []).slice(0, 600);
    let named = 0;
    for (const x of items) {
      const carId = int(x && x.carId), trackId = int(x && x.trackId), time = num(x && x.time), full = driverName(x && (x.name || x.short));
      if (!carId || !trackId || !(time > 10) || !full) continue;
      const short = shortDriverName(full);
      const hit = await env.DB.prepare(
        `SELECT DISTINCT u.id FROM community_laps l JOIN community_users u ON u.id=l.user_id
         WHERE l.car_id=?1 AND l.track_id=?2 AND abs(l.time-?3)<0.0006 AND u.id LIKE 'o:%' AND (u.alias='Anonymous' OR u.alias=?5) AND u.owner=?4`
      ).bind(await famId(env, gameOf(x && x.game), carId), trackId, time, u.id, short).all();
      const ids = (hit.results || []).map((r) => r.id);
      if (ids.length !== 1) continue; // two unnamed rivals with the very same lap: no guessing
      // the name is kept for the admins; their laps stay anonymous
      await env.DB.prepare("UPDATE community_users SET alias=?2 WHERE id=?1 AND (alias='Anonymous' OR alias=?3)").bind(ids[0], full, short).run();
      named++;
    }
    return json({ named });
  }
  // the PC saw this account's own driver at the wheel: what other PCs shared of them as a race rival goes
  // under the account (per car and track the faster lap stays), and their laps still to come too. Per game (game, an
  // older PC's link is iRacing's): one driver of each game per account and one account per driver of each game, the
  // first account linked keeps it
  if (p === "/link-driver" && m === "POST") {
    if (!u.account) return err("sign in with your Pitlane HQ account", 401);
    if (typeof body.key !== "string" || !/^[0-9a-f]{16,64}$/i.test(body.key)) return err("missing key", 400);
    // in Le Mans Ultimate only once the account's own PC saw that name at the wheel on a few days (driverlinks.js)
    const r = await linkDriver(env, u.id, await otherId(env, body.key), game);
    return r.error ? err(r.error, r.status) : json(r);
  }
  if (p === "/lics" && m === "POST") {
    if (!u.account) return err("sign in with your Pitlane HQ account", 401);
    const row = await env.DB.prepare("SELECT lics FROM community_users WHERE id=?1").bind(u.id).first();
    let out = {};
    try { out = JSON.parse((row && row.lics) || "{}") || {}; } catch (e) {}
    let n = 0;
    for (const k of CATS) { const v = licOf(body.lics && body.lics[k]); if (v) { out[k] = v; n++; } }
    if (!n) return err("no license classes", 400);
    await env.DB.prepare("UPDATE community_users SET lics=?2 WHERE id=?1").bind(u.id, JSON.stringify(out)).run();
    return json({ ok: true, lics: out });
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
      ? await env.DB.prepare("SELECT time, sectors, trace, valid FROM laps WHERE id=?1 AND session_id=?2 AND drv IS NULL").bind(String(body.lapId), s.id).first()
      : (await env.DB.prepare("SELECT time, sectors, trace FROM laps WHERE session_id=?1 AND valid=1 AND drv IS NULL AND time>0 AND trace IS NOT NULL ORDER BY time LIMIT 1").bind(s.id).first()) ||
        (await env.DB.prepare("SELECT time, sectors, trace FROM laps WHERE session_id=?1 AND valid=1 AND drv IS NULL AND time>0 ORDER BY time LIMIT 1").bind(s.id).first());
    if (!lap || !(lap.time > 10)) return err("this session has no valid lap to share", 404);
    // only valid laps go to the community: no cutting, no pit lane
    if (body.lapId && lap.valid !== 1) return err("this lap is not valid (off track or the pit lane): it cannot be shared", 400);
    const name = s.track + (s.track_config ? " · " + s.track_config : "");
    const g = s.game || "iracing";
    const { trackId, carId } = await comboIds(env, s, name, g, u.id, body);
    // your faster lap stays, unless it has no telemetry and this one does
    const r = await keepBestLap(env, u.id, { game: g, carId, trackId, car: s.car, track: name, time: lap.time, sectors: lap.sectors, trace: lap.trace, anon: !!body.anon, shown: shownAs, count: () => countUpload(env, u), ctx });
    if (r.limit) return err("too many uploads today", 429);
    if (r.kept) return json({ kept: "your faster lap is already shared", traced: r.traced });
    return json({ shared: true, traced: r.traced });
  }
  if (p === "/laps" && m === "POST") {
    const carId = int(body.carId), trackId = int(body.trackId), time = num(body.time);
    if (!carId || !trackId || !time || time <= 10 || time > 3600) return err("lap needs carId, trackId and time", 400);
    if (isTestDrive(body.kind)) return json({ kept: "laps of a test drive are not shared" });
    const sectors = Array.isArray(body.sectors) ? JSON.stringify(body.sectors.filter((x) => typeof x === "number").slice(0, 10)) : null;
    // the top 3 of a race you drove: their best lap times go up anonymously (no name, no telemetry), one
    // anonymous driver per real driver, so their faster lap of a later race replaces this one
    if (typeof body.other === "string" && /^[0-9a-f]{16,64}$/i.test(body.other)) {
      if (!u.account) return err("sign in with your Pitlane HQ account to share other drivers' times", 401);
      const oid = await otherId(env, body.other);
      // the speed trace their position gave (src "field", pedals estimated), or the game's own telemetry of their car
      // (src "real", Le Mans Ultimate: a real lap for the model, no estimate on top); the model, the leaderboard and
      // comparisons use it
      const plain = body.trace && Array.isArray(body.trace.d) && body.trace.d.length >= 60 ? JSON.stringify({ ...body.trace, src: body.trace.src === "real" ? "real" : "field" }) : null;
      if (plain && plain.length > 900000) return err("lap trace too large", 400);
      // a rival who has an account (their PC saw them at the wheel): the lap goes to their account, under
      // its public name or as Anonymous, as the account chose
      const link = await env.DB.prepare("SELECT l.account_id AS id, a.anon, a.name_kind FROM driver_links l JOIN accounts a ON a.id=l.account_id WHERE l.oid=?1 AND l.game=?2").bind(oid, game).first();
      if (link) {
        const r = await keepBestLap(env, link.id, { game, carId, trackId, car: body.car, track: body.track, time, sectors, trace: await sealData(env, plain), cls: body.cls, wet: wetOf(body.trace && body.trace.f), anon: !!link.anon, shown: link.name_kind === "iracing" ? "iracing" : "nick", lic: body.lic, cat: body.cat, official: body.official, ai: body.ai === true, count: () => countUpload(env, u), ctx });
        if (r.limit) return err("too many uploads today", 429);
        return json(r.kept ? { kept: "a faster lap of this driver is already shared" } : { shared: true });
      }
      // everyone else did not join Pitlane HQ: their whole name as the game shows it is kept, but their laps are
      // anonymous (only an admin with admin mode on sees the name, seesRivals)
      const short = driverName(body.name || body.short);
      await env.DB.prepare("INSERT INTO community_users (id, token_hash, alias, created, owner) VALUES (?1,?2,?5,?3,?4) ON CONFLICT(id) DO UPDATE SET alias=excluded.alias WHERE excluded.alias<>'Anonymous'")
        .bind(oid, "other:" + oid, Date.now(), u.id, short || "Anonymous").run();
      // on the leaderboard only when the PC says so (faster than you, with their trace); the rest teach the model unseen
      const r = await keepBestLap(env, oid, { game, carId, trackId, car: body.car, track: body.track, time, sectors, trace: await sealData(env, plain), cls: body.cls, wet: wetOf(body.trace && body.trace.f), anon: true, shown: body.hidden ? "model" : "nick", lic: body.lic, cat: body.cat, official: body.official, ai: body.ai === true, count: () => countUpload(env, u) });
      if (r.limit) return err("too many uploads today", 429);
      return json(r.kept ? { kept: "a faster lap of this driver is already shared" } : { shared: true });
    }
    const plainTrace = body.trace ? JSON.stringify(body.trace) : null;
    if (plainTrace && plainTrace.length > 900000) return err("lap trace too large", 400);
    const trace = await sealData(env, plainTrace);
    // your faster lap stays, unless it has no telemetry and this one does: then the whole lap is worth more
    const r = await keepBestLap(env, u.id, { game, carId, trackId, car: body.car, track: body.track, time, sectors, trace, cls: body.cls, wet: wetOf(body.trace && body.trace.f), anon: !!body.anon, shown: shownAs, lic: body.lic, cat: body.cat, official: body.official, ai: body.ai === true, count: () => countUpload(env, u), ctx });
    if (r.limit) return err("too many uploads today", 429);
    return json(r.kept ? { kept: "your faster lap is already shared" } : { shared: true });
  }
  // what the game says of a track: its official number of turns (iRacing's WeekendInfo.TrackNumTurns), once per track
  // and program run, also from the .ibt files on the PC
  if (p === "/trackinfo" && m === "POST") {
    const trackId = int(body.trackId);
    if (!trackId || !(Number.isInteger(body.nturns) && body.nturns >= 1 && body.nturns <= 60)) return err("trackInfo needs trackId and nturns", 400);
    return json({ ok: true, changed: await noteTurnCount(env, game, trackId, str(body.track), body.nturns) });
  }
  // a track outline from a lap without incidents: kept when it is the fastest one
  if (p === "/trackmaps" && m === "POST") {
    const trackId = int(body.trackId), time = num(body.time), n = int(body.n);
    if (trackId && Number.isInteger(body.nturns)) await noteTurnCount(env, game, trackId, str(body.track), body.nturns).catch(() => {});
    const x = body.x, y = body.y;
    if (!trackId || !time || time <= 10 || time > 3600) return err("layout needs trackId and the lap time", 400);
    if (body.clean !== true) return err("only laps without incidents", 400);
    if (!(n >= 100 && n <= 3000) || !Array.isArray(x) || !Array.isArray(y) || x.length !== n || y.length !== n) return err("layout points missing", 400);
    const ok = (v) => typeof v === "number" && isFinite(v) && Math.abs(v) < 30000;
    if (!x.every(ok) || !y.every(ok)) return err("layout points out of range", 400);
    // g: the layout comes from the game's own position (exact), with the origin [lat, lon] of its x=0, y=0
    const g = Array.isArray(body.g) && body.g.length === 2 && body.g.every((v) => typeof v === "number" && isFinite(v)) && Math.abs(body.g[0]) <= 90 && Math.abs(body.g[1]) <= 180 ? body.g.map((v) => Math.round(v * 1e5) / 1e5) : null;
    const r2 = (v) => Math.round(v * 10) / 10;
    const old = await env.DB.prepare("SELECT time, geo FROM track_maps WHERE game=?1 AND track_id=?2").bind(game, trackId).first();
    // a layout from the game's position replaces one by dead reckoning whatever the lap time, and is never replaced by one
    if (old && old.geo && !g) return json({ kept: "a layout from the game's position already draws this track" });
    if (old && old.time <= time && !(g && !old.geo)) return json({ kept: "a faster clean lap already drew this track" });
    if (!(await countUpload(env, u))) return err("too many uploads today", 429);
    await env.DB.prepare(
      `INSERT INTO track_maps (game, track_id, track, n, len, pts, time, user_id, created, geo) VALUES (?1,?2,?3,?4,?5,?6,?7,?8,?9,?10)
       ON CONFLICT(game, track_id) DO UPDATE SET track=excluded.track, n=excluded.n, len=excluded.len, pts=excluded.pts, time=excluded.time, user_id=excluded.user_id, created=excluded.created, geo=excluded.geo`
    ).bind(game, trackId, str(body.track), n, num(body.len), JSON.stringify({ x: x.map(r2), y: y.map(r2) }), time, u.id, Date.now(), g ? JSON.stringify(g) : null).run();
    return json({ shared: true });
  }
  if (p === "/pitlane" && m === "POST") {
    const trackId = int(body.trackId), n = int(body.n), pts = body.pts;
    if (!trackId || !(n >= 60 && n <= 4000) || !Array.isArray(pts) || pts.length < 10 || pts.length > 2000) return err("pit lane needs trackId, n and its points", 400);
    const ok = pts.every(q => Array.isArray(q) && q.length === 2 && Number.isInteger(q[0]) && q[0] >= 0 && q[0] < n && typeof q[1] === "number" && isFinite(q[1]) && Math.abs(q[1]) <= 80);
    if (!ok) return err("pit lane points out of range", 400);
    if (!(await countUpload(env, u))) return err("too many uploads today", 429);
    const old = await env.DB.prepare("SELECT n, pts FROM track_pits WHERE game=?1 AND track_id=?2").bind(game, trackId).first();
    // each point is the average of what the laps through the pits measured there (a lap of another length starts over)
    const keep = old && Math.abs(old.n - n) <= 4 ? JSON.parse(old.pts) : {};
    for (const [i, v] of pts) keep[i] = keep[i] == null ? v : Math.round((keep[i] * 0.6 + v * 0.4) * 10) / 10;
    await env.DB.prepare(`INSERT INTO track_pits (game, track_id, n, pts, updated) VALUES (?1,?2,?3,?4,?5)
       ON CONFLICT(game, track_id) DO UPDATE SET n=excluded.n, pts=excluded.pts, updated=excluded.updated`).bind(game, trackId, n, JSON.stringify(keep), Date.now()).run();
    return json({ shared: true, points: Object.keys(keep).length });
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
