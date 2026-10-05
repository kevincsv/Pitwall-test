// Pitlane HQ cloud: receives sessions and laps from PitlaneHQ.exe (the
// agent) and serves the web viewer. Runs on Cloudflare Workers with D1.
import VIEWER from "./viewer.html";

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

// "owner" can upload and delete; "viewer" can only read
function role(req, env) {
  const h = req.headers.get("authorization") || "";
  const key = h.startsWith("Bearer ") ? h.slice(7).trim() : "";
  if (same(key, env.PITLANE_KEY)) return "owner";
  if (env.VIEW_KEY && same(key, env.VIEW_KEY)) return "viewer";
  return null;
}

const str = (v, max = 120) => (typeof v === "string" ? v.slice(0, max) : v == null ? null : String(v).slice(0, max));
const num = (v) => (typeof v === "number" && isFinite(v) ? v : null);
const idOk = (v) => typeof v === "string" && /^[A-Za-z0-9_.:-]{6,80}$/.test(v);

async function upsertSession(env, s) {
  if (!idOk(s.id) || !num(s.started) || !s.track || !s.car) return "session needs id, started, track and car";
  await env.DB.prepare(
    `INSERT INTO sessions (id, started, track, track_config, car, kind, series, driver, air_temp, track_temp)
     VALUES (?1,?2,?3,?4,?5,?6,?7,?8,?9,?10)
     ON CONFLICT(id) DO UPDATE SET kind=excluded.kind, air_temp=excluded.air_temp, track_temp=excluded.track_temp`
  ).bind(s.id, Math.round(s.started), str(s.track), str(s.trackConfig), str(s.car), str(s.kind, 40), str(s.series), str(s.driver, 80), num(s.airTemp), num(s.trackTemp)).run();
  return null;
}

async function addLap(env, sessionId, l) {
  if (!idOk(sessionId) || !idOk(l.id) || !num(l.n) || !num(l.time) || l.time <= 0 || l.time > 3600) return "lap needs id, n and time";
  const trace = l.trace ? JSON.stringify(l.trace) : null;
  if (trace && trace.length > 900000) return "lap trace too large";
  const sectors = Array.isArray(l.sectors) ? JSON.stringify(l.sectors.filter((x) => typeof x === "number").slice(0, 40)) : null;
  await env.DB.batch([
    env.DB.prepare(
      `INSERT INTO laps (id, session_id, n, time, valid, fuel, vmax, sectors, trace, created) VALUES (?1,?2,?3,?4,?5,?6,?7,?8,?9,?10)
       ON CONFLICT(id) DO NOTHING`
    ).bind(l.id, sessionId, Math.round(l.n), l.time, l.valid === false ? 0 : 1, num(l.fuel), num(l.vmax), sectors, trace, Date.now()),
    env.DB.prepare(
      `UPDATE sessions SET laps=(SELECT COUNT(*) FROM laps WHERE session_id=?1),
       best=(SELECT MIN(time) FROM laps WHERE session_id=?1 AND valid=1) WHERE id=?1`
    ).bind(sessionId),
  ]);
  return null;
}

async function api(req, env, url) {
  const who = role(req, env);
  if (!env.PITLANE_KEY) return err("The server has no PITLANE_KEY yet. Run: npx wrangler secret put PITLANE_KEY", 500);
  if (!who) return err("wrong or missing key", 401);
  const p = url.pathname;
  const m = req.method;

  if (p === "/api/me") return json({ role: who });

  if (p === "/api/upload" && m === "POST") {
    if (who !== "owner") return err("this key can only read", 403);
    const body = await req.json().catch(() => null);
    if (!body || !body.session) return err("bad upload", 400);
    let e = await upsertSession(env, body.session);
    if (e) return err(e, 400);
    for (const l of (body.laps || []).slice(0, 50)) {
      e = await addLap(env, body.session.id, l);
      if (e) return err(e, 400);
    }
    return json({ ok: true });
  }

  if (p === "/api/sessions" && m === "GET") {
    const q = url.searchParams;
    const lim = Math.min(200, +q.get("limit") || 60);
    let sql = "SELECT * FROM sessions";
    const args = [];
    if (q.get("track")) { args.push(q.get("track")); sql += ` WHERE track=?${args.length}`; }
    if (q.get("car")) { args.push(q.get("car")); sql += `${args.length > 1 ? " AND" : " WHERE"} car=?${args.length}`; }
    sql += ` ORDER BY started DESC LIMIT ${lim}`;
    const { results } = await env.DB.prepare(sql).bind(...args).all();
    return json(results);
  }

  if (p === "/api/bests" && m === "GET") {
    const { results } = await env.DB.prepare(
      `SELECT s.track, s.track_config, s.car, MIN(l.time) AS best, COUNT(l.id) AS laps, MAX(s.started) AS last
       FROM laps l JOIN sessions s ON s.id=l.session_id WHERE l.valid=1
       GROUP BY s.track, s.track_config, s.car ORDER BY last DESC LIMIT 200`
    ).all();
    return json(results);
  }

  let mm = p.match(/^\/api\/sessions\/([A-Za-z0-9_.:-]+)$/);
  if (mm) {
    if (m === "DELETE") {
      if (who !== "owner") return err("this key can only read", 403);
      await env.DB.batch([env.DB.prepare("DELETE FROM laps WHERE session_id=?1").bind(mm[1]), env.DB.prepare("DELETE FROM sessions WHERE id=?1").bind(mm[1])]);
      return json({ ok: true });
    }
    const s = await env.DB.prepare("SELECT * FROM sessions WHERE id=?1").bind(mm[1]).first();
    if (!s) return err("not found", 404);
    const { results } = await env.DB.prepare("SELECT id, n, time, valid, fuel, vmax, sectors FROM laps WHERE session_id=?1 ORDER BY n").bind(mm[1]).all();
    return json({ session: s, laps: results.map((l) => ({ ...l, sectors: l.sectors ? JSON.parse(l.sectors) : null })) });
  }

  mm = p.match(/^\/api\/laps\/([A-Za-z0-9_.:-]+)$/);
  if (mm && m === "GET") {
    const l = await env.DB.prepare("SELECT l.*, s.track, s.car, s.started FROM laps l JOIN sessions s ON s.id=l.session_id WHERE l.id=?1").bind(mm[1]).first();
    if (!l) return err("not found", 404);
    return json({ ...l, trace: l.trace ? JSON.parse(l.trace) : null, sectors: l.sectors ? JSON.parse(l.sectors) : null });
  }

  return err("not found", 404);
}

export default {
  async fetch(req, env) {
    const url = new URL(req.url);
    if (url.pathname.startsWith("/api/")) {
      try {
        return await api(req, env, url);
      } catch (e) {
        return err("server error: " + (e && e.message), 500);
      }
    }
    return new Response(VIEWER, {
      headers: {
        "content-type": "text/html; charset=utf-8",
        "content-security-policy": "default-src 'self'; script-src 'unsafe-inline'; style-src 'unsafe-inline' https://fonts.googleapis.com; font-src https://fonts.gstatic.com; connect-src 'self'; img-src 'self' data:; frame-ancestors 'none'",
        "referrer-policy": "no-referrer",
      },
    });
  },
};
