// Pitlane HQ cloud: receives sessions and laps from PitlaneHQ.exe (the
// agent) and serves the web viewer. Runs on Cloudflare Workers with D1.
import { downloads } from "./downloads.js";
import { news } from "./news.js";
import { sealData, openData } from "./crypt.js";
import { gameOf } from "./games.js";
import VIEWER from "./viewer.html";
import { community } from "./community.js";
import { accounts, sessionAccount } from "./accounts.js";
import { live } from "./live.js";
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
async function upsertSession(env, s, uploader) {
  if (!idOk(s.id) || !num(s.started) || !s.track || !s.car) return "session needs id, started, track and car";
  await env.DB.prepare(
    `INSERT INTO sessions (id, started, track, track_config, car, kind, series, driver, air_temp, track_temp, uploader, game, track_id, car_id)
     VALUES (?1,?2,?3,?4,?5,?6,?7,?8,?9,?10,?11,?12,?13,?14)
     ON CONFLICT(id) DO UPDATE SET kind=excluded.kind, air_temp=excluded.air_temp, track_temp=excluded.track_temp, track_id=COALESCE(excluded.track_id, track_id), car_id=COALESCE(excluded.car_id, car_id)`
  ).bind(s.id, Math.round(s.started), str(s.track), str(s.trackConfig), str(s.car), str(s.kind, 40), str(s.series), str(s.driver, 80), num(s.airTemp), num(s.trackTemp), uploader, gameOf(s.game), posInt(s.trackId), posInt(s.carId)).run();
  return null;
}

async function addLap(env, sessionId, l) {
  if (!idOk(sessionId) || !idOk(l.id) || !num(l.n) || !num(l.time) || l.time <= 0 || l.time > 3600) return "lap needs id, n and time";
  const plain = l.trace ? JSON.stringify(l.trace) : null;
  if (plain && plain.length > 900000) return "lap trace too large";
  const trace = await sealData(env, plain); // telemetry is sealed at rest
  const sectors = Array.isArray(l.sectors) ? JSON.stringify(l.sectors.filter((x) => typeof x === "number").slice(0, 40)) : null;
  await env.DB.batch([
    env.DB.prepare(
      `INSERT INTO laps (id, session_id, n, time, valid, fuel, vmax, sectors, trace, created, inc) VALUES (?1,?2,?3,?4,?5,?6,?7,?8,?9,?10,?11)
       ON CONFLICT(id) DO NOTHING`
    ).bind(l.id, sessionId, Math.round(l.n), l.time, l.valid === false ? 0 : 1, num(l.fuel), num(l.vmax), sectors, trace, Date.now(), Math.max(0, Math.round(num(l.inc) || 0))),
    env.DB.prepare(
      `UPDATE sessions SET laps=(SELECT COUNT(*) FROM laps WHERE session_id=?1),
       best=(SELECT MIN(time) FROM laps WHERE session_id=?1 AND valid=1) WHERE id=?1`
    ).bind(sessionId),
  ]);
  return null;
}

async function api(req, env, url) {
  const me = await who(req, env);
  if (!me) return err(env.PITLANE_KEY ? "wrong or missing key" : "sign in with your Pitlane HQ account (this server has no PITLANE_KEY)", 401);
  const role = me.role;
  const p = url.pathname;
  const m = req.method;

  if (p === "/api/me") return json({ role, name: me.name, display: me.display });
  const own = role === "account" ? me.name : null; // accounts only ever see their own laps

  if (p === "/api/upload" && m === "POST") {
    if (role === "viewer") return err("this key can only read", 403);
    const body = await req.json().catch(() => null);
    if (!body || !body.session) return err("bad upload", 400);
    // a member's sessions are kept apart from the owner's even with the same iRacing session id
    if ((role === "member" || role === "account") && body.session.id) body.session.id = (me.name.replace(/[^A-Za-z0-9_.-]/g, "_") + ":" + body.session.id).slice(0, 80);
    let e = await upsertSession(env, body.session, me.name);
    if (role === "member" || role === "account") body.laps = (body.laps || []).map((l) => ({ ...l, id: (me.name.replace(/[^A-Za-z0-9_.-]/g, "_") + ":" + l.id).slice(0, 80) }));
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
    let sql = "SELECT sessions.*, (SELECT MIN(l.time) FROM laps l WHERE l.session_id=sessions.id AND l.valid=1 AND l.time>0) AS best FROM sessions";
    const args = [];
    if (q.get("track")) { args.push(q.get("track")); sql += ` WHERE track=?${args.length}`; }
    if (q.get("car")) { args.push(q.get("car")); sql += `${args.length > 1 ? " AND" : " WHERE"} car=?${args.length}`; }
    if (q.get("game")) { args.push(gameOf(q.get("game"))); sql += `${args.length > 1 ? " AND" : " WHERE"} game=?${args.length}`; }
    if (own || q.get("who")) { args.push(own || q.get("who")); sql += `${args.length > 1 ? " AND" : " WHERE"} uploader=?${args.length}`; }
    sql += ` ORDER BY started DESC LIMIT ${lim}`;
    const { results } = await env.DB.prepare(sql).bind(...args).all();
    return json(results);
  }

  if (p === "/api/bests" && m === "GET") {
    const { results } = await env.DB.prepare(
      `SELECT s.game, s.track, s.track_config, s.car, COALESCE(s.uploader,'owner') AS who, MAX(s.driver) AS driver, MIN(l.time) AS best, COUNT(l.id) AS laps, MAX(s.started) AS last,
        (SELECT l2.id FROM laps l2 JOIN sessions s2 ON s2.id=l2.session_id
         WHERE l2.valid=1 AND s2.game=s.game AND s2.track=s.track AND COALESCE(s2.track_config,'')=COALESCE(s.track_config,'')
           AND s2.car=s.car AND COALESCE(s2.uploader,'')=COALESCE(s.uploader,'') AND (?1 IS NULL OR s2.uploader=?1)
         ORDER BY l2.time LIMIT 1) AS bestLapId,
        (SELECT s2.id FROM laps l2 JOIN sessions s2 ON s2.id=l2.session_id
         WHERE l2.valid=1 AND s2.game=s.game AND s2.track=s.track AND COALESCE(s2.track_config,'')=COALESCE(s.track_config,'')
           AND s2.car=s.car AND COALESCE(s2.uploader,'')=COALESCE(s.uploader,'') AND (?1 IS NULL OR s2.uploader=?1)
         ORDER BY l2.time LIMIT 1) AS bestSessionId
       FROM laps l JOIN sessions s ON s.id=l.session_id WHERE l.valid=1 AND (?1 IS NULL OR s.uploader=?1)
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
    // only the laps without incidents: an incident lap stays as it is
    const r = await env.DB.prepare("UPDATE laps SET valid=1 WHERE session_id=?1 AND time>0 AND COALESCE(inc,0)=0").bind(sid).run();
    return json({ ok: true, laps: r.meta ? r.meta.changes : undefined });
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
    const r = await env.DB.prepare("UPDATE laps SET valid=?2 WHERE id=?1").bind(decodeURIComponent(mm[1]), b.valid === false ? 0 : 1).run();
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
    if (!s || (own && s.uploader !== own)) return err("not found", 404);
    // ?traces=1: every lap with its telemetry in one answer (the app's analyzer), instead of one call per lap
    const withTraces = url.searchParams.get("traces") === "1";
    const { results } = await env.DB.prepare(`SELECT id, n, time, valid, fuel, vmax, sectors, inc${withTraces ? ", trace" : ""} FROM laps WHERE session_id=?1 ORDER BY n`).bind(sid).all();
    const laps = [];
    for (const l of results) laps.push({ ...l, sectors: l.sectors ? JSON.parse(l.sectors) : null, ...(withTraces ? { trace: l.trace ? JSON.parse(await openData(env, l.trace)) : null } : {}) });
    return json({ session: s, laps });
  }

  // fastest valid lap of anyone in the team for a track, layout and car
  if (p === "/api/teambest" && m === "GET") {
    const q = url.searchParams;
    const l = await env.DB.prepare(
      `SELECT l.id FROM laps l JOIN sessions s ON s.id=l.session_id WHERE l.valid=1 AND l.trace IS NOT NULL AND s.track=?1 AND COALESCE(s.track_config,'')=?2 AND s.car=?3 AND (?4 IS NULL OR s.uploader=?4) AND s.game=?5 ORDER BY l.time LIMIT 1`
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

  mm = p.match(/^\/api\/laps\/([A-Za-z0-9_.:-]+)$/);
  if (mm && m === "GET") {
    const lid = decodeURIComponent(mm[1]);
    const l = await env.DB.prepare("SELECT l.*, s.track, s.car, s.started, s.driver, s.uploader FROM laps l JOIN sessions s ON s.id=l.session_id WHERE l.id=?1").bind(lid).first();
    if (!l || (own && l.uploader !== own)) return err("not found", 404);
    return json({ ...l, trace: l.trace ? JSON.parse(await openData(env, l.trace)) : null, sectors: l.sectors ? JSON.parse(l.sectors) : null });
  }

  return err("not found", 404);
}

// every answer leaves with the same protective headers (no sniffing, no framing by other sites,
// no referrer, nothing cached by proxies unless the handler said so)
const HARDEN = { "x-content-type-options": "nosniff", "x-frame-options": "DENY", "referrer-policy": "no-referrer", "permissions-policy": "camera=(), microphone=(), geolocation=()", "strict-transport-security": "max-age=31536000; includeSubDomains", "cross-origin-opener-policy": "same-origin" };
function harden(r) {
  const h = new Headers(r.headers);
  for (const k in HARDEN) if (!h.has(k)) h.set(k, HARDEN[k]);
  if (h.get("x-frame-options") === "DENY" && (h.get("content-security-policy") || "").includes("frame-ancestors *")) h.delete("x-frame-options"); // the embedded viewer
  return new Response(r.body, { status: r.status, statusText: r.statusText, headers: h });
}

export default {
  async fetch(req, env, ctx) {
    return harden(await handle(req, env, ctx));
  },
};

async function handle(req, env, ctx) {
    const url = new URL(req.url);
    if (url.pathname === "/news") return news(req, env, ctx);
    if (url.pathname.startsWith("/dl/") || url.pathname.startsWith("/downloads") || url.pathname.startsWith("/changelog")) return downloads(req, env, url);
    if (url.pathname.startsWith("/community/")) {
      try {
        return await community(req, env, url);
      } catch (e) {
        return new Response(JSON.stringify({ error: "server error: " + (e && e.message) }), { status: 500, headers: { "content-type": "application/json" } });
      }
    }
    if (url.pathname.startsWith("/account/")) {
      try {
        return await accounts(req, env, url);
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
    const isAppFile = /^\/(index\.html|pitwall-[a-z0-9-]+\.js|app-news\.json|server\.json|manifest\.webmanifest|favicon\.ico|favicon-32\.png|icon-\d+\.png)$/.test(url.pathname);
    if ((url.pathname === "/" && url.searchParams.get("embed") !== "1") || isAppFile) {
      if (!env.ASSETS) return err("the app is not published on this server", 404);
      const r = await env.ASSETS.fetch(new Request(new URL(url.pathname, url.origin), req));
      const h = new Headers(r.headers);
      h.set("referrer-policy", "no-referrer");
      h.set("x-frame-options", "DENY");
      h.set("x-content-type-options", "nosniff");
      // the browser asks the server every time (ETag): a new build is seen at once, nothing stale after an update
      h.set("cache-control", "no-cache");
      return new Response(r.body, { status: r.status, headers: h });
    }
    // live telemetry from your PC to your browser or phone, end-to-end encrypted
    if (url.pathname === "/live") return live(req, env);
    if (url.pathname.startsWith("/api/")) {
      try {
        return await api(req, env, url);
      } catch (e) {
        return err("server error: " + (e && e.message), 500);
      }
    }
    // the lap viewer: My laps lives inside the app (/?embed=1); /laps alone still signs in with a server key (owner, team, read-only)
    return new Response(VIEWER, {
      headers: {
        "content-type": "text/html; charset=utf-8",
        // shown inside the Pitlane HQ apps with embed=1 (then it only uses the session handed in the address)
        "content-security-policy": "default-src 'self'; script-src 'unsafe-inline'; style-src 'unsafe-inline' https://fonts.googleapis.com; font-src https://fonts.gstatic.com; connect-src 'self'; img-src 'self' data:; frame-ancestors " + (url.searchParams.get("embed") === "1" ? "*" : "'none'"),
        "referrer-policy": "no-referrer",
      },
    });
}
