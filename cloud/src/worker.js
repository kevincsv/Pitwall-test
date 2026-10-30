// Pitlane HQ cloud: receives sessions and laps from PitlaneHQ.exe (the
// agent) and serves the web viewer. Runs on Cloudflare Workers with D1.
import { voiceIce } from "./voiceice.js";
import { downloads, latestBuild } from "./downloads.js";
import { markModel, rebuildDirty, reconcileIds } from "./model.js";
import { rebuildTrackMaps } from "./trackmaps.js";
import { autoShare, reshareSession, unshareInvalid } from "./community.js";
import { catMap, catOf, licOf } from "./categories.js";
import { patreonWebhook } from "./patreon.js";
import { lemonWebhook } from "./lemon.js";
import { news } from "./news.js";
import { sealData, openData } from "./crypt.js";
import { gameOf } from "./games.js";
import { noteCar } from "./carfamily.js";
import VIEWER from "./viewer.html";
import { community } from "./community.js";
import { accounts, sessionAccount } from "./accounts.js";
import { live } from "./live.js";
import { seoPage, indexNow, notFound } from "./seo.js";
import { discordInteraction, discordOAuth } from "./discord.js";
import { steamReturn } from "./steam.js";
import { scanLeagues } from "./leaguescan.js";
import { onlineRoute, prunePresence } from "./presence.js";
import { usageRoute, pruneUsage } from "./usage.js";
import { supportRoute } from "./support.js";
import { sessionSummary } from "./sessionsum.js";
import { pruneSeen } from "./seasonseen.js";
export { LiveRoom } from "./live.js";

const JSONH = { "content-type": "application/json; charset=utf-8", "cache-control": "no-store" };
const json = (v, status = 200) => new Response(JSON.stringify(v), { status, headers: JSONH });
const err = (msg, status) => json({ error: msg }, status);

// constant-time comparison of two strings
function same(a, b) {
  if (typeof a !== "string" || typeof b !== "string" || !a || a.length !== b.length) return false;
  let d = 0;
  for (let i = 0; i < a.length; i++) d |= a.charCodeAt(i) ^ b.charCodeAt(i);
  return d === 0;
}

// "owner" manages everything, "member" (a team mate with their own key)
// uploads their laps and reads everything, "viewer" can only read
async function sha256(t) {
  const b = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(t));
  return [...new Uint8Array(b)].map((x) => x.toString(16).padStart(2, "0")).join("");
}
async function who(req, env) {
  const h = req.headers.get("authorization") || "";
  const key = h.startsWith("Bearer ") ? h.slice(7).trim() : "";
  if (!key) return null;
  // a Pitlane HQ account: uploads and sees only its own laps, with nothing to set up
  const acc = await sessionAccount(req, env).catch(() => null);
  if (acc) return { role: "account", name: "acct:" + acc.id, display: acc.display };
  if (env.PITLANE_KEY && same(key, env.PITLANE_KEY)) return { role: "owner", name: "owner" };
  if (env.VIEW_KEY && same(key, env.VIEW_KEY)) return { role: "viewer", name: "viewer" };
  const m = await env.DB.prepare("SELECT name FROM members WHERE key_hash=?1").bind(await sha256(key)).first().catch(() => null);
  return m ? { role: "member", name: m.name } : null;
}

const str = (v, max = 120) => (typeof v === "string" ? v.slice(0, max) : v == null ? null : String(v).slice(0, max));
const num = (v) => (typeof v === "number" && isFinite(v) ? v : null);
const idOk = (v) => typeof v === "string" && /^[A-Za-z0-9_.:-]{6,80}$/.test(v);

const posInt = (v) => (Number.isInteger(v) && v > 0 && v < 1e9 ? v : null);
// a session against iRacing's AI the agent did not flag (an older one): an iRacing session without a subsession
// (id "t-…", after the account's "acct_…:" prefix) that is not a test is a single-player session, so against the AI
// (markOfflineAI on the PC)
const offlineAI = (s) => gameOf(s.game) === "iracing" && /(^|:)t-/.test(String(s.id || "")) && !/test/i.test(String(s.kind || ""));
async function upsertSession(env, s, uploader) {
  if (!idOk(s.id) || !num(s.started) || !s.track || !s.car) return "session needs id, started, track and car";
  await env.DB.prepare(
    `INSERT INTO sessions (id, started, track, track_config, car, kind, series, driver, air_temp, track_temp, uploader, game, track_id, car_id, official, lic, cat, ai, pos, field, pos_cls)
     VALUES (?1,?2,?3,?4,?5,?6,?7,?8,?9,?10,?11,?12,?13,?14,?15,?16,?17,?18,?19,?20,?21)
     ON CONFLICT(id) DO UPDATE SET kind=excluded.kind, air_temp=excluded.air_temp, track_temp=excluded.track_temp, track_id=COALESCE(excluded.track_id, track_id), car_id=COALESCE(excluded.car_id, car_id), official=COALESCE(excluded.official, official), ai=COALESCE(excluded.ai, ai),
       lic=COALESCE(excluded.lic, lic), cat=COALESCE(excluded.cat, cat),
       pos=COALESCE(excluded.pos, pos), field=CASE WHEN excluded.pos IS NULL THEN field ELSE excluded.field END, pos_cls=CASE WHEN excluded.pos IS NULL THEN pos_cls ELSE excluded.pos_cls END`
  ).bind(s.id, Math.round(s.started), str(s.track), str(s.trackConfig), str(s.car), str(s.kind, 40), str(s.series), str(s.driver, 80), num(s.airTemp), num(s.trackTemp), uploader, gameOf(s.game), posInt(s.trackId), posInt(s.carId), typeof s.official === "boolean" ? (s.official ? 1 : 0) : null, licOf(s.lic), str(s.cat, 20), s.ai === true || offlineAI(s) ? 1 : null, ...placeOf(s)).run();
  return null;
}

// the driver's place in the session and its number of cars (the agent's sessionplace.go): later uploads replace it, a
// session sent without one keeps what it has; cls: the place in the driver's class (a multiclass session)
function placeOf(s) {
  const pos = Number.isInteger(s.pos) && s.pos > 0 && s.pos < 1000 ? s.pos : null;
  if (!pos) return [null, null, null];
  const field = Number.isInteger(s.field) && s.field >= pos && s.field < 1000 ? s.field : pos;
  return [pos, field, s.cls === true ? 1 : 0];
}
// how the apps read it: pos, field and cls (true when the place is in the class); none on older sessions
const placeOut = ({ pos_cls, ...x }) => ({ ...x, pos: x.pos || null, field: x.field || null, cls: pos_cls === 1 });

// DRINKS mode: the friend who drove a lap (null: the account's own)
const lapDrv = (l) => (typeof l.drv === "string" && l.drv.trim() ? l.drv.trim().slice(0, 32) : null);
// a session's lap count and its best: the account's own laps only (a friend's lap in DRINKS mode is never yours)
const SESSION_SUMS = `UPDATE sessions SET laps=(SELECT COUNT(*) FROM laps WHERE session_id=?1),
       best=(SELECT MIN(time) FROM laps WHERE session_id=?1 AND valid=1 AND drv IS NULL) WHERE id=?1`;

// a lap goes round the whole circuit, through the pit lane too: one that did not is never a best, a share or the
// model's. A lap without sector times where the session's other laps have them never crossed the sector lines (a
// reset or a tow counted as a lap); newer PCs check the whole lap themselves (fullLap)
async function dropImpossibleLaps(env, sid) {
  const r = await env.DB.batch([
    env.DB.prepare("UPDATE laps SET valid=0 WHERE session_id=?1 AND valid=1 AND COALESCE(sectors,'[]')='[]' AND EXISTS (SELECT 1 FROM laps WHERE session_id=?1 AND COALESCE(sectors,'[]')<>'[]')").bind(sid),
    env.DB.prepare(SESSION_SUMS).bind(sid),
  ]);
  return r[0].meta.changes || 0;
}

// laps made valid or not valid by hand: the session's best follows at once, and so do the leaderboards (a share made
// from a lap no longer valid goes, the account's best of the car and track is shared again from its valid laps)
async function validityChanged(env, sid) {
  await env.DB.prepare(SESSION_SUMS).bind(sid).run().catch(() => {});
  const s = await env.DB.prepare("SELECT uploader FROM sessions WHERE id=?1").bind(sid).first().catch(() => null);
  if (s && String(s.uploader).startsWith("acct:")) await unshareInvalid(env, String(s.uploader).slice(5), sid).catch(() => {});
}

async function addLap(env, sessionId, l) {
  if (!idOk(sessionId) || !idOk(l.id) || !num(l.n) || !num(l.time) || l.time <= 0 || l.time > 3600) return "lap needs id, n and time";
  const plain = l.trace ? JSON.stringify(l.trace) : null;
  if (plain && plain.length > 900000) return "lap trace too large";
  const trace = await sealData(env, plain); // telemetry is sealed at rest
  const sectors = Array.isArray(l.sectors) ? JSON.stringify(l.sectors.filter((x) => typeof x === "number").slice(0, 40)) : null;
  await env.DB.batch([
    env.DB.prepare(
      `INSERT INTO laps (id, session_id, n, time, valid, fuel, vmax, sectors, trace, created, inc, drv) VALUES (?1,?2,?3,?4,?5,?6,?7,?8,?9,?10,?11,?12)
       ON CONFLICT(id) DO NOTHING`
    ).bind(l.id, sessionId, Math.round(l.n), l.time, l.valid === false ? 0 : 1, num(l.fuel), num(l.vmax), sectors, trace, Date.now(), Math.max(0, Math.round(num(l.inc) || 0)), lapDrv(l)),
    env.DB.prepare(SESSION_SUMS).bind(sessionId),
  ]);
  return null;
}

async function api(req, env, url, ctx) {
  const me = await who(req, env);
  if (!me) return err(env.PITLANE_KEY ? "wrong or missing key" : "sign in with your Pitlane HQ account (this server has no PITLANE_KEY)", 401);
  const role = me.role;
  const p = url.pathname;
  const m = req.method;

  if (p === "/api/me") return json({ role, name: me.name, display: me.display });
  // accounts only ever see their own laps; the admins of this server read anybody's (to check a lap)
  const admins = (env.ADMINS || env.SEASON_UPLOADERS || "").split(",").map((x) => x.trim()).filter(Boolean);
  const admin = role === "account" && admins.includes(me.name.replace(/^acct:/, ""));
  const own = role === "account" ? me.name : null;
  const ownRead = admin ? null : own; // one session or lap, read by id

  if (p === "/api/upload" && m === "POST") {
    if (role === "viewer") return err("this key can only read", 403);
    const body = await req.json().catch(() => null);
    if (!body || !body.session) return err("bad upload", 400);
    // a member's sessions are kept apart from the owner's even with the same iRacing session id
    if ((role === "member" || role === "account") && body.session.id) body.session.id = (me.name.replace(/[^A-Za-z0-9_.-]/g, "_") + ":" + body.session.id).slice(0, 80);
    // a session read afterwards from a telemetry file on the PC: a lap the account has already (the same time on the same
    // track and car within 12 hours of it, under any session) never comes in twice, whatever the PC checked before
    if (body.session.imported === true && Array.isArray(body.laps) && body.laps.length) {
      const st = Number(body.session.started) || 0;
      const have = await env.DB.prepare(
        `SELECT l.time FROM laps l JOIN sessions s ON s.id=l.session_id WHERE s.uploader=?1 AND s.track=?2 AND s.car=?3 AND s.started BETWEEN ?4 AND ?5`
      ).bind(me.name, str(body.session.track), str(body.session.car), st - 12 * 3600e3, st + 12 * 3600e3).all().catch(() => ({ results: [] }));
      const times = (have.results || []).map((x) => x.time);
      body.laps = body.laps.filter((l) => !(l && num(l.time) && times.some((t) => Math.abs(t - l.time) < 0.0006)));
      if (!body.laps.length) return json({ ok: true, shared: false, duplicate: true });
    }
    let e = await upsertSession(env, body.session, me.name);
    // this session brings the real iRacing ids: what was shared under provisional ids of the same track and car moves over
    if (!e && posInt(body.session.trackId) && posInt(body.session.carId)) await reconcileIds(env, gameOf(body.session.game), str(body.session.track), str(body.session.trackConfig), str(body.session.car), posInt(body.session.trackId), posInt(body.session.carId)).catch(() => {});
    // a badge of a car family (NASCAR's, the Supercars', the SF23's) joins it the first time it is seen
    if (!e && posInt(body.session.carId)) await noteCar(env, gameOf(body.session.game), posInt(body.session.carId), str(body.session.car)).catch(() => {});
    if (role === "member" || role === "account") body.laps = (body.laps || []).map((l) => ({ ...l, id: (me.name.replace(/[^A-Za-z0-9_.-]/g, "_") + ":" + l.id).slice(0, 80) }));
    if (e) return err(e, 400);
    for (const l of (body.laps || []).slice(0, 50)) {
      e = await addLap(env, body.session.id, l);
      if (e) return err(e, 400);
    }
    // a lap that did not go round the whole circuit is no best; a share made from one before goes (unshareInvalid)
    const dropped = await dropImpossibleLaps(env, body.session.id).catch(() => 0);
    if (dropped && role === "account") await unshareInvalid(env, me.name.slice(5), body.session.id).catch(() => {});
    // a valid lap with telemetry: the community model learns it (works with only the PC open)
    if ((body.laps || []).some((l) => l.valid !== false && l.trace)) await markModel(env, gameOf(body.session.game), posInt(body.session.trackId), posInt(body.session.carId));
    // the fastest lap of each car and track goes to the leaderboard by itself once it is in the account
    let shared = null;
    // (a faster lap than before: the Discord servers of this driver hear about it, their alerts channel)
    // a session read afterwards from a telemetry file on the PC (imported): its laps follow the same rules, but an old
    // licence never replaces the current one and no Discord server hears of a lap driven long ago
    const imported = body.session.imported === true;
    if (role === "account") shared = await autoShare(env, me.name.slice(5), body.session.id, body.laps, { trackId: body.session.trackId, carId: body.session.carId, lic: body.session.lic, cat: body.session.cat, imported }, imported ? null : ctx).catch(() => null);
    return json({ ok: true, shared: !!(shared && shared.shared) });
  }

  // Home's four numbers over every session of the account since the device's start of the month (sessionsum.js)
  if (p === "/api/sessions/summary" && m === "GET") {
    const q = url.searchParams;
    return json(await sessionSummary(env.DB, { from: q.get("from"), tz: q.get("tz"), game: q.get("game") ? gameOf(q.get("game")) : null, uploader: own || q.get("who") || null }));
  }

  // the iRacing tracks and cars the account has driven outside a test drive (official, hosted, league or AI sessions all
  // need the content bought): the planner's "you own it" without iRacing's API
  if (p === "/api/sessions-owned" && m === "GET") {
    if (!own) return json({ tracks: [], cars: [] });
    const { results } = await env.DB.prepare(
      "SELECT DISTINCT track, track_config, car FROM sessions WHERE uploader=?1 AND COALESCE(game,'iracing')='iracing' AND LOWER(COALESCE(kind,'')) NOT LIKE '%test%' LIMIT 2000"
    ).bind(own).all();
    const tracks = new Map(), cars = new Set();
    for (const r of results || []) {
      const cfg = /^TrackCity:/i.test(r.track_config || "") ? "" : r.track_config || "";
      if (r.track) tracks.set(r.track + "\u0000" + cfg, [r.track, cfg]);
      if (r.car) cars.add(r.car);
    }
    return json({ tracks: [...tracks.values()], cars: [...cars] });
  }

  if (p === "/api/sessions" && m === "GET") {
    const q = url.searchParams;
    const lim = Math.min(200, +q.get("limit") || 60);
    let sql = "SELECT sessions.*, (SELECT MIN(l.time) FROM laps l WHERE l.session_id=sessions.id AND l.valid=1 AND l.time>0 AND l.drv IS NULL) AS best, (SELECT group_concat(DISTINCT l.drv) FROM laps l WHERE l.session_id=sessions.id AND l.drv IS NOT NULL) AS drvs, (SELECT SUM(l.time) FROM laps l WHERE l.session_id=sessions.id AND l.time>0 AND l.time<3600) AS secs FROM sessions";
    const args = [];
    if (q.get("track")) { args.push(q.get("track")); sql += ` WHERE track=?${args.length}`; }
    if (q.get("car")) { args.push(q.get("car")); sql += `${args.length > 1 ? " AND" : " WHERE"} car=?${args.length}`; }
    if (q.get("game")) { args.push(gameOf(q.get("game"))); sql += `${args.length > 1 ? " AND" : " WHERE"} game=?${args.length}`; }
    if (own || q.get("who")) { args.push(own || q.get("who")); sql += `${args.length > 1 ? " AND" : " WHERE"} uploader=?${args.length}`; }
    sql += ` ORDER BY started DESC LIMIT ${lim}`;
    const { results } = await env.DB.prepare(sql).bind(...args).all();
    // each session in its discipline (Oval, Sports Car, Formula Car, Dirt Oval, Dirt Road) with your license class in it:
    // the one of the session, else your current one in that discipline
    const cm = await catMap(env).catch(() => ({ tc: {}, c: {} }));
    let lics = {};
    if (own && own.startsWith("acct:")) {
      const u = await env.DB.prepare("SELECT lics FROM community_users WHERE id=?1").bind(own.slice(5)).first().catch(() => null);
      try { lics = JSON.parse((u && u.lics) || "{}") || {}; } catch (e) {}
    }
    return json((results || []).map(placeOut).map(({ cat, lic, ...x }) => {
      // the other games race sports cars only (LMU), as /combos and /records say
      const ir = (x.game || "iracing") === "iracing";
      const c = ir ? catOf(cm, x.track_id, x.car_id, cat, x.track + (x.track_config ? " · " + x.track_config : ""), x.car) : "sports_car";
      return { ...x, cat: c, lic: lic || (ir && c && lics[c]) || null }; // the licence is iRacing's: never on another game's session
    }));
  }

  if (p === "/api/bests" && m === "GET") {
    const { results } = await env.DB.prepare(
      `SELECT s.game, s.track, s.track_config, s.car, COALESCE(s.uploader,'owner') AS who, MAX(s.driver) AS driver, MIN(l.time) AS best, COUNT(l.id) AS laps, MAX(s.started) AS last,
        (SELECT l2.id FROM laps l2 JOIN sessions s2 ON s2.id=l2.session_id
         WHERE l2.valid=1 AND l2.drv IS NULL AND s2.game=s.game AND s2.track=s.track AND COALESCE(s2.track_config,'')=COALESCE(s.track_config,'')
           AND s2.car=s.car AND COALESCE(s2.uploader,'')=COALESCE(s.uploader,'') AND (?1 IS NULL OR s2.uploader=?1)
         ORDER BY l2.time LIMIT 1) AS bestLapId,
        (SELECT s2.id FROM laps l2 JOIN sessions s2 ON s2.id=l2.session_id
         WHERE l2.valid=1 AND l2.drv IS NULL AND s2.game=s.game AND s2.track=s.track AND COALESCE(s2.track_config,'')=COALESCE(s.track_config,'')
           AND s2.car=s.car AND COALESCE(s2.uploader,'')=COALESCE(s.uploader,'') AND (?1 IS NULL OR s2.uploader=?1)
         ORDER BY l2.time LIMIT 1) AS bestSessionId
       FROM laps l JOIN sessions s ON s.id=l.session_id WHERE l.valid=1 AND l.drv IS NULL AND (?1 IS NULL OR s.uploader=?1)
       GROUP BY s.game, s.track, s.track_config, s.car, who ORDER BY last DESC LIMIT 600`
    ).bind(own).all();
    return json(results);
  }

  // admins of this server: every lap of a session counts as valid again (a wrong cut check)
  let mm = p.match(/^\/api\/sessions\/([A-Za-z0-9_.:-]+)\/validate$/);
  if (mm && m === "POST") {
    const admins = (env.ADMINS || env.SEASON_UPLOADERS || "").split(",").map((x) => x.trim()).filter(Boolean);
    if (role !== "account" || !admins.includes(me.name.replace(/^acct:/, ""))) return err("only the admins of this server can do this", 403);
    const sid = decodeURIComponent(mm[1]);
    // only the laps without incidents that went round the whole circuit: three sector times, none under half the
    // session's usual one, and a time over 85 % of its usual lap (a reset or a lap out of the pits in a few seconds
    // never becomes valid); an incident lap stays as it is
    const ls = (await env.DB.prepare("SELECT id, time, sectors, COALESCE(inc,0) AS inc FROM laps WHERE session_id=?1 AND time>0").bind(sid).all()).results || [];
    const secs = (l) => { try { const x = JSON.parse(l.sectors || "null"); return Array.isArray(x) && x.length >= 3 && x.every((v) => v > 0) ? x : null; } catch (e) { return null; } };
    const med = (a) => { const b = a.filter((x) => x > 0).sort((x, y) => x - y); return b.length ? b[Math.floor(b.length / 2)] : 0; };
    const whole = ls.filter((l) => secs(l));
    let mt = med(whole.map((l) => l.time)), ms = [0, 1, 2].map((k) => med(whole.map((l) => secs(l)[k])));
    // a session of mostly short laps (resets) has a short usual lap: the record of the car and track says better
    const ss = await env.DB.prepare("SELECT track_id, car_id, COALESCE(game,'iracing') AS game FROM sessions WHERE id=?1").bind(sid).first().catch(() => null);
    const rec = ss && ss.track_id && ss.car_id ? await env.DB.prepare("SELECT MIN(time) AS t FROM community_laps WHERE track_id=?1 AND car_id=?2 AND game=?3").bind(ss.track_id, ss.car_id, ss.game).first().catch(() => null) : null;
    if (rec && rec.t > mt) { const k = rec.t / mt; mt = rec.t; ms = ms.map((x) => x * k); }
    const ok = ls.filter((l) => !l.inc && secs(l) && mt > 0 && l.time >= 0.85 * mt && secs(l).every((v, k) => v >= 0.5 * ms[k]));
    if (ok.length) await env.DB.batch(ok.map((l) => env.DB.prepare("UPDATE laps SET valid=1 WHERE id=?1").bind(l.id)));
    await validityChanged(env, sid);
    return json({ ok: true, laps: ok.length });
  }

  // DRINKS mode: who drove a lap of your session, changed by hand ("" or null: you); the session's best follows
  mm = p.match(/^\/api\/sessions\/([A-Za-z0-9_.:-]+)\/driver$/);
  if (mm && m === "POST") {
    const sid = decodeURIComponent(mm[1]);
    const s = await env.DB.prepare("SELECT uploader FROM sessions WHERE id=?1").bind(sid).first();
    if (!s || role === "viewer" || (own && s.uploader !== own)) return err("not found", 404);
    const b = await req.json().catch(() => ({}));
    const n = Math.round(num(b.n) || 0);
    if (!n) return err("which lap?", 400);
    await env.DB.batch([env.DB.prepare("UPDATE laps SET drv=?3 WHERE session_id=?1 AND n=?2").bind(sid, n, lapDrv(b)), env.DB.prepare(SESSION_SUMS).bind(sid)]);
    // the leaderboards follow: every driver's shared best of this car and track made again
    if (String(s.uploader).startsWith("acct:")) await reshareSession(env, String(s.uploader).slice(5), sid).catch(() => {});
    return json({ ok: true });
  }

  // the incidents of older laps, copied from the race summary by the app (your own sessions only)
  mm = p.match(/^\/api\/sessions\/([A-Za-z0-9_.:-]+)\/incidents$/);
  if (mm && m === "POST") {
    const sid = decodeURIComponent(mm[1]);
    const s = await env.DB.prepare("SELECT uploader FROM sessions WHERE id=?1").bind(sid).first();
    if (!s || role === "viewer" || (own && s.uploader !== own)) return err("not found", 404);
    const b = await req.json().catch(() => ({}));
    const laps = Array.isArray(b.laps) ? b.laps.slice(0, 200) : [];
    const stmts = [];
    const have = (await env.DB.prepare("SELECT n, trace FROM laps WHERE session_id=?1 AND COALESCE(inc,0)=0").bind(sid).all()).results || [];
    const byN = new Map(have.map((r) => [r.n, r]));
    for (const l of laps) {
      const n = Math.round(num(l.n) || 0), inc = Math.max(0, Math.round(num(l.inc) || 0));
      const at = Array.isArray(l.at) ? l.at.filter((v) => typeof v === "number" && isFinite(v)).slice(0, 160) : [];
      if (!n || !byN.has(n)) continue;
      const ks = Array.isArray(l.k) ? l.k.filter((v) => ["off", "loss", "light", "contact"].includes(v)).slice(0, 80) : [];
      let trace = byN.get(n).trace;
      if (trace) {
        try {
          const t = JSON.parse(await openData(env, trace));
          t.inc = at;
          t.incK = ks;
          trace = await sealData(env, JSON.stringify(t));
        } catch (e) { /* an unreadable trace keeps what it has */ }
      }
      stmts.push(env.DB.prepare("UPDATE laps SET inc=?3, trace=?4 WHERE session_id=?1 AND n=?2 AND COALESCE(inc,0)=0").bind(sid, n, inc, trace));
    }
    if (stmts.length) await env.DB.batch(stmts);
    return json({ ok: true, laps: stmts.length });
  }

  // admins: one lap valid or not valid by hand (the cut check got it wrong)
  mm = p.match(/^\/api\/laps\/([A-Za-z0-9_.:-]+)\/valid$/);
  if (mm && m === "POST") {
    const admins = (env.ADMINS || env.SEASON_UPLOADERS || "").split(",").map((x) => x.trim()).filter(Boolean);
    if (role !== "account" || !admins.includes(me.name.replace(/^acct:/, ""))) return err("only the admins of this server can do this", 403);
    const b = await req.json().catch(() => ({}));
    const lid = decodeURIComponent(mm[1]);
    const r = await env.DB.prepare("UPDATE laps SET valid=?2 WHERE id=?1").bind(lid, b.valid === false ? 0 : 1).run();
    const lr = await env.DB.prepare("SELECT session_id FROM laps WHERE id=?1").bind(lid).first();
    if (lr) await validityChanged(env, lr.session_id);
    return json({ ok: true, changed: r.meta ? r.meta.changes : undefined, valid: b.valid !== false });
  }

  mm = p.match(/^\/api\/sessions\/([A-Za-z0-9_.:-]+)$/);
  if (mm) {
    if (m === "DELETE") {
      const own = await env.DB.prepare("SELECT uploader FROM sessions WHERE id=?1").bind(mm[1]).first();
      if (role === "viewer" || ((role === "member" || role === "account") && (!own || own.uploader !== me.name))) return err("you can only delete your own sessions", 403);
      await env.DB.batch([env.DB.prepare("DELETE FROM laps WHERE session_id=?1").bind(mm[1]), env.DB.prepare("DELETE FROM sessions WHERE id=?1").bind(mm[1])]);
      return json({ ok: true });
    }
    const sid = decodeURIComponent(mm[1]);
    const s = await env.DB.prepare("SELECT * FROM sessions WHERE id=?1").bind(sid).first();
    if (!s || (ownRead && s.uploader !== ownRead)) return err("not found", 404);
    // ?traces=1: every lap with its telemetry in one answer (the app's analyzer), instead of one call per lap
    const withTraces = url.searchParams.get("traces") === "1";
    const { results } = await env.DB.prepare(`SELECT id, n, time, valid, fuel, vmax, sectors, inc, drv${withTraces ? ", trace" : ""} FROM laps WHERE session_id=?1 ORDER BY n`).bind(sid).all();
    const laps = [];
    for (const l of results) laps.push({ ...l, sectors: l.sectors ? JSON.parse(l.sectors) : null, ...(withTraces ? { trace: l.trace ? JSON.parse(await openData(env, l.trace)) : null } : {}) });
    // another driver's session (an admin opening it): who it is, so the analyzer never calls their laps "my best"
    let who;
    if (me && s.uploader !== me.name && String(s.uploader || "").startsWith("acct:")) {
      const a = await env.DB.prepare("SELECT display FROM accounts WHERE id=?1").bind(String(s.uploader).slice(5)).first().catch(() => null);
      who = (a && a.display) || "";
    }
    return json({ session: { ...placeOut(s), ...(who !== undefined ? { other: true, who } : {}) }, laps });
  }

  // fastest valid lap of anyone in the team for a track, layout and car
  if (p === "/api/teambest" && m === "GET") {
    const q = url.searchParams;
    const l = await env.DB.prepare(
      `SELECT l.id FROM laps l JOIN sessions s ON s.id=l.session_id WHERE l.valid=1 AND l.drv IS NULL AND l.trace IS NOT NULL AND s.track=?1 AND COALESCE(s.track_config,'')=?2 AND s.car=?3 AND (?4 IS NULL OR s.uploader=?4) AND s.game=?5 ORDER BY l.time LIMIT 1`
    ).bind(q.get("track") || "", q.get("config") || "", q.get("car") || "", own, gameOf(q.get("game"))).first();
    return json(l || {});
  }

  if (p === "/api/team") {
    if (role === "account") return json({ members: [], me: me.display || me.name, role });
    if (m === "GET") {
      const { results } = await env.DB.prepare("SELECT name, created FROM members ORDER BY name").all();
      return json({ members: results, me: me.name, role });
    }
    if (role !== "owner") return err("only the owner manages the team", 403);
    if (m === "POST") {
      const b = await req.json().catch(() => ({}));
      const name = str(b.name, 40);
      if (!name || !/^[\p{L}\p{N} _.'-]{2,40}$/u.test(name) || name === "owner" || name === "viewer") return err("choose a name of 2 to 40 letters", 400);
      const key = [...crypto.getRandomValues(new Uint8Array(24))].map((x) => x.toString(16).padStart(2, "0")).join("");
      try {
        await env.DB.prepare("INSERT INTO members (name, key_hash, created) VALUES (?1,?2,?3)").bind(name, await sha256(key), Date.now()).run();
      } catch (e) {
        return err("that name is already in the team", 400);
      }
      return json({ name, key });
    }
  }
  mm = p.match(/^\/api\/team\/(.+)$/);
  if (mm && m === "DELETE") {
    if (role !== "owner") return err("only the owner manages the team", 403);
    await env.DB.prepare("DELETE FROM members WHERE name=?1").bind(decodeURIComponent(mm[1])).run();
    return json({ ok: true });
  }

  // admins: a lap valid or not (an impossible lap the checks missed, or one they caught wrongly); its session's best,
  // the account's shares and the model follow
  mm = p.match(/^\/api\/laps\/([A-Za-z0-9_.:-]+)\/valid$/);
  if (mm && m === "POST") {
    if (!admin) return err("only the admins of this server can do this", 403);
    const b = await req.json().catch(() => ({}));
    const l = await env.DB.prepare("SELECT l.session_id, s.uploader FROM laps l JOIN sessions s ON s.id=l.session_id WHERE l.id=?1").bind(decodeURIComponent(mm[1])).first();
    if (!l) return err("not found", 404);
    await env.DB.batch([env.DB.prepare("UPDATE laps SET valid=?2 WHERE id=?1").bind(decodeURIComponent(mm[1]), b.valid ? 1 : 0), env.DB.prepare(SESSION_SUMS).bind(l.session_id)]);
    if (String(l.uploader).startsWith("acct:")) {
      const uid = String(l.uploader).slice(5);
      if (b.valid) await reshareSession(env, uid, l.session_id).catch(() => {});
      else await unshareInvalid(env, uid, l.session_id).catch(() => {});
    }
    return json({ ok: true });
  }

  mm = p.match(/^\/api\/laps\/([A-Za-z0-9_.:-]+)$/);
  if (mm && m === "GET") {
    const lid = decodeURIComponent(mm[1]);
    const l = await env.DB.prepare("SELECT l.*, s.track, s.car, s.started, s.driver, s.uploader FROM laps l JOIN sessions s ON s.id=l.session_id WHERE l.id=?1").bind(lid).first();
    if (!l || (ownRead && l.uploader !== ownRead)) return err("not found", 404);
    return json({ ...l, trace: l.trace ? JSON.parse(await openData(env, l.trace)) : null, sectors: l.sectors ? JSON.parse(l.sectors) : null });
  }

  return err("not found", 404);
}

// older PCs could give a lap the time of the lap before when the game updated it late and the two laps were close
// (two laps in a row with the very same time): the lap's own telemetry says its time (the clock at its last point
// and the few metres left at its speed), and the session's best and the model follow. A few laps each run.
export function traceLapTime(t) {
  const d = t && Array.isArray(t.d) ? t.d : null;
  if (!d || d.length < 40) return null;
  const bin = num(t.bin) || 5;
  let k = d.length - 1;
  while (k > 0 && d[k - 1] && d[k] && d[k - 1][5] === d[k][5]) k--; // the end filled in with the last real point
  const p = d[k];
  if (!p || !(p[5] > 0) || !(p[0] > 1)) return null;
  return p[5] + ((d.length - k) * bin) / p[0];
}
// a share made from a lap that is not valid any more (an impossible lap: migration 0046, dropImpossibleLaps) goes and
// the account's best of the car and track is shared again from its valid laps; a few each run
async function repairImpossibleShares(env) {
  // from the laps not valid (an index of them alone, migration 0068) to their session and the account's shares (both by
  // index), never the shares against every session and lap; a share a valid lap of the same time backs is right and is
  // never picked again (it was, every ten minutes, reading the whole database each time)
  const { results } = await env.DB.prepare(
    `SELECT DISTINCT c.user_id AS uid, l.session_id AS sid FROM laps l
       JOIN sessions s ON s.id=l.session_id AND s.uploader LIKE 'acct:%'
       JOIN community_laps c ON c.user_id=substr(s.uploader,6) AND abs(l.time-c.time)<0.0006
     WHERE l.valid=0 AND l.drv IS NULL
       AND NOT EXISTS (SELECT 1 FROM laps v WHERE v.session_id=l.session_id AND v.valid=1 AND v.drv IS NULL AND abs(v.time-l.time)<0.0006)
     LIMIT 5`).all();
  for (const r of results || []) await unshareInvalid(env, r.uid, r.sid).catch(() => {});
}

// sessions a migration asked to share again (laps made valid again): a few on every run of the job
async function resharePending(env) {
  const row = await env.DB.prepare("SELECT v FROM app_state WHERE k='reshare'").first().catch(() => null);
  let ids = [];
  try { ids = JSON.parse((row && row.v) || "[]"); } catch (e) {}
  if (!ids.length) return;
  const now = ids.slice(0, 8), rest = ids.slice(8);
  for (const sid of now) {
    const s = await env.DB.prepare("SELECT uploader FROM sessions WHERE id=?1").bind(sid).first();
    if (s && String(s.uploader).startsWith("acct:")) await reshareSession(env, String(s.uploader).slice(5), sid).catch(() => {});
  }
  await env.DB.prepare(rest.length ? "UPDATE app_state SET v=?1 WHERE k='reshare'" : "DELETE FROM app_state WHERE k='reshare'").bind(...(rest.length ? [JSON.stringify(rest)] : [])).run();
}

async function fixLapTimes(env) {
  const { results } = await env.DB.prepare(
    `SELECT a.id, a.session_id AS sid, a.time, a.trace, s.game, s.track_id AS tid, s.car_id AS cid FROM laps a
     JOIN laps b ON b.session_id=a.session_id AND b.n=a.n-1 AND b.time=a.time JOIN sessions s ON s.id=a.session_id
     WHERE a.tfix IS NULL AND a.trace IS NOT NULL LIMIT 15`
  ).all().catch(() => ({ results: [] }));
  for (const l of results || []) {
    let est = null;
    try { est = traceLapTime(JSON.parse(await openData(env, l.trace))); } catch (e) {}
    const fix = est != null && Math.abs(est - l.time) > 0.3 && est > 10 && est < 3600;
    await env.DB.batch([
      env.DB.prepare(fix ? "UPDATE laps SET time=?2, tfix=1 WHERE id=?1" : "UPDATE laps SET tfix=1 WHERE id=?1").bind(...(fix ? [l.id, Math.round(est * 1000) / 1000] : [l.id])),
      env.DB.prepare(SESSION_SUMS).bind(l.sid),
    ]);
    if (fix && l.tid && l.cid) await markModel(env, l.game || "iracing", l.tid, l.cid).catch(() => {});
  }
}

// every answer leaves with the same protective headers (no sniffing, no framing by other sites,
// no referrer, nothing cached by proxies unless the handler said so)
const HARDEN = { "x-content-type-options": "nosniff", "x-frame-options": "DENY", "referrer-policy": "no-referrer", "permissions-policy": "camera=(), microphone=(), geolocation=()", "strict-transport-security": "max-age=31536000; includeSubDomains", "cross-origin-opener-policy": "same-origin" };
function harden(r) {
  // a WebSocket (the live telemetry) goes through untouched: copying it into a new Response drops the
  // socket (status 101), and the web and the phones could never connect to the live view
  if (r.status === 101 || r.webSocket) return r;
  const h = new Headers(r.headers);
  for (const k in HARDEN) if (!h.has(k)) h.set(k, HARDEN[k]);
  if (h.get("x-frame-options") === "DENY" && (h.get("content-security-policy") || "").includes("frame-ancestors *")) h.delete("x-frame-options"); // the embedded viewer
  return new Response(r.body, { status: r.status, statusText: r.statusText, headers: h });
}

export default {
  // every 10 minutes: the models of the cars and tracks that got new laps
  async scheduled(ev, env, ctx) {
    // the repairs of old data once an hour (the first run of each hour), the rest every ten minutes
    const hourly = new Date(ev.scheduledTime || Date.now()).getUTCMinutes() < 10;
    ctx.waitUntil(rebuildDirty(env)); ctx.waitUntil(indexNow(env).catch(() => {}));
    if (hourly) { ctx.waitUntil(pruneUsage(env).catch(() => {})); ctx.waitUntil(pruneSeen(env).catch(() => {})); ctx.waitUntil(fixLapTimes(env).catch(() => {})); ctx.waitUntil(repairImpossibleShares(env).catch(() => {})); } ctx.waitUntil(resharePending(env).catch(() => {})); ctx.waitUntil(rebuildTrackMaps(env).catch(() => {})); ctx.waitUntil(scanLeagues(env).catch(() => {})); ctx.waitUntil(prunePresence(env).catch(() => {})); },
  async fetch(req, env, ctx) {
    return harden(await handle(req, env, ctx));
  },
};

async function handle(req, env, ctx) {
    const url = new URL(req.url);
    // www.pitlanehq.app is the same site: one address for people and search engines (301 to pitlanehq.app)
    // http:// is the same page as https://: people and search engines go to the secure one (never the local server on the PC)
    if (url.protocol === "http:" && env.LOCAL !== "1" && !/^(localhost|127\.|\[::1\])/.test(url.hostname) && (req.method === "GET" || req.method === "HEAD")) {
      url.protocol = "https:"; if (url.hostname.startsWith("www.")) url.hostname = url.hostname.slice(4);
      return Response.redirect(url.toString(), 301);
    }
    if (url.hostname.startsWith("www.")) {
      url.hostname = url.hostname.slice(4);
      return Response.redirect(url.toString(), 301);
    }
    if (url.pathname === "/news") return news(req, env, ctx);
    // the public pages for search engines: what Pitlane HQ does, the records of every car and track, the sitemap
    { const sp = await seoPage(req, env, url, ctx).catch(() => null); if (sp) return sp; }
    if (url.pathname.startsWith("/dl/") || url.pathname.startsWith("/downloads") || url.pathname.startsWith("/changelog")) return downloads(req, env, url);
    // the admin page's Online tab: who is on the web, the PC or the phones now (presence.js)
    if (url.pathname === "/community/admin/online" && req.method === "GET") return onlineRoute(req, env).catch((e) => new Response(JSON.stringify({ error: "server error: " + (e && e.message) }), { status: 500, headers: { "content-type": "application/json" } }));
    // what the drivers use and what they tell us (usage.js): the usage batches, the feedback window, the admin's analytics
    if (url.pathname.startsWith("/community/usage") || url.pathname.startsWith("/community/feedback") || url.pathname === "/community/admin/analytics" || url.pathname === "/community/admin/feedback") {
      const r = await usageRoute(req, env, url).catch((e) => new Response(JSON.stringify({ error: "server error: " + (e && e.message) }), { status: 500, headers: { "content-type": "application/json" } }));
      if (r) return r;
    }
    // the support chat behind the floating button (support.js)
    if (url.pathname.startsWith("/community/support") || url.pathname.startsWith("/community/admin/support")) {
      const r = await supportRoute(req, env, url).catch((e) => new Response(JSON.stringify({ error: "server error: " + (e && e.message) }), { status: 500, headers: { "content-type": "application/json" } }));
      if (r) return r;
    }
    if (url.pathname.startsWith("/community/")) {
      try {
        return await community(req, env, url, ctx);
      } catch (e) {
        return new Response(JSON.stringify({ error: "server error: " + (e && e.message) }), { status: 500, headers: { "content-type": "application/json" } });
      }
    }
    if (url.pathname.startsWith("/account/")) {
      try {
        {
          // the PC's minute sync carries the newest Windows build, so a PC behind checks for its update at once
          const res = await accounts(req, env, url);
          if (res && url.pathname === "/account/sync/meta") { try { const b = await latestBuild(env); if (b) res.headers.set("X-Pitlane-Build", b); } catch (e) {} }
          return res;
        }
      } catch (e) {
        return err("server error: " + (e && e.message), 500);
      }
    }
    // the full Pitlane HQ app (analysis, community, account, live from your PC), same as the phone app, at the
    // address itself: https://pitlanehq.app/ (the old /app/?companion=1 addresses still land here)
    if (url.pathname === "/app" || url.pathname.startsWith("/app/")) {
      const to = new URL(req.url);
      to.pathname = url.pathname.slice(4) || "/";
      to.searchParams.delete("companion");
      return Response.redirect(to.href, 301);
    }
    // one address for the app: /index.html is "/"
    if (url.pathname === "/index.html") { const to = new URL(req.url); to.pathname = "/"; return Response.redirect(to.href, 301); }
    const isAppFile = /^\/(fonts\.css|pitwall-[a-z0-9-]+\.js|app-news\.json|whats-new\.json|server\.json|manifest\.webmanifest|favicon\.ico|favicon-32\.png|icon-\d+\.png|logo\.svg|bimi\.svg|og(?:-es|-pt)?\.png|robots\.txt|landing\/(?:en\/|es\/|pt\/)?[a-z0-9-]+\.(?:jpg|png))$/.test(url.pathname);
    if ((url.pathname === "/" && url.searchParams.get("embed") !== "1") || isAppFile) {
      if (!env.ASSETS) return err("the app is not published on this server", 404);
      // a local server (wrangler dev --var LOCAL:1, tools/local.cmd): the app served by it uses it, not pitlanehq.app
      if (url.pathname === "/server.json" && env.LOCAL === "1") return new Response(JSON.stringify({ url: url.origin }), { headers: { "content-type": "application/json", "cache-control": "no-cache" } });
      const r = await env.ASSETS.fetch(new Request(new URL(url.pathname, url.origin), req));
      const h = new Headers(r.headers);
      h.set("referrer-policy", "no-referrer");
      h.set("x-frame-options", "DENY");
      h.set("x-content-type-options", "nosniff");
      // the browser asks the server every time (ETag): a new build is seen at once, nothing stale after an update; the
      // landing's screenshots and the sharing pictures change rarely, so they are kept a day and checked in the background
      h.set("cache-control", /^\/(landing\/|og)/.test(url.pathname) ? "public, max-age=86400, stale-while-revalidate=604800" : "no-cache");
      return new Response(r.body, { status: r.status, headers: h });
    }
    // live telemetry from your PC to your browser or phone, end-to-end encrypted
    if (url.pathname === "/live") return live(req, env);
    // the Discord bot: Discord sends its slash commands here (signed), the answer goes back at once
    if (url.pathname === "/discord/interactions") {
      try {
        return await discordInteraction(req, env, ctx);
      } catch (e) {
        return err("server error", 500);
      }
    }
    // "Sign in with Discord" and "Link Discord" in the apps: Discord's sign-in comes back here and the browser goes on to the
    // web app, to the PC's agent when the PC started or to the phone app (discord.js); an error before the state is known is a
    // sign-in's
    if (url.pathname === "/discord/oauth" && req.method === "GET") return discordOAuth(req, env, url).catch(() => Response.redirect("https://pitlanehq.app/?discordLogin=0", 302));
    // "Sign in with Steam" and "Link Steam" in the apps: Steam's sign-in comes back here and the browser goes on to the web app
    if (url.pathname === "/steam/return" && req.method === "GET") return steamReturn(req, env, url).catch(() => Response.redirect("https://pitlanehq.app/?steamLogin=0", 302));
    // Patreon tells the server about memberships: the supporter badge by itself
    if (url.pathname === "/patreon/webhook" && req.method === "POST") return patreonWebhook(req, env);
    // Lemon Squeezy tells the server about purchases: Pitlane HQ Pro on the account
    if (url.pathname === "/lemonsqueezy/webhook" && req.method === "POST") return lemonWebhook(req, env);
    if (url.pathname === "/voice/ice" && req.method === "GET") return voiceIce(env);
    // the admin page: the app opened on it (only the admins see anything there)
    if (url.pathname === "/admin" && req.method === "GET") return Response.redirect(url.origin + "/app#admin", 302);
    if (url.pathname.startsWith("/api/")) {
      try {
        return await api(req, env, url, ctx);
      } catch (e) {
        return err("server error: " + (e && e.message), 500);
      }
    }
    // any other address does not exist: a real 404 (never a page with 200, which search engines would index)
    if (url.pathname !== "/" && url.pathname.replace(/\/+$/, "") !== "/laps") {
      const al = /^\/(es|pt)(\/|$)/.exec(url.pathname)?.[1] || (req.headers.get("accept-language") || "").toLowerCase().slice(0, 2);
      return notFound(al === "es" || al === "pt" ? al : "en");
    }
    // the lap viewer: My laps lives inside the app (/?embed=1); /laps alone still signs in with a server key (owner, team, read-only)
    return new Response(VIEWER, {
      headers: {
        "content-type": "text/html; charset=utf-8",
        // shown inside the Pitlane HQ apps with embed=1 (then it only uses the session handed in the address)
        "content-security-policy": "default-src 'self'; script-src 'unsafe-inline'; style-src 'unsafe-inline' https://fonts.googleapis.com; font-src https://fonts.gstatic.com; connect-src 'self'; img-src 'self' data:; frame-ancestors " + (url.searchParams.get("embed") === "1" ? "*" : "'none'"),
        "referrer-policy": "no-referrer",
        // the viewer is part of the app, never a page of its own in search results
        "x-robots-tag": "noindex",
      },
    });
}
