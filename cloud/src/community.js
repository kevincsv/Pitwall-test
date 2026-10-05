// Community: drivers who choose to share their best laps (time, and if they
// want the whole lap trace) and race analyses. Reading is public; writing
// needs the device token given at registration. Turn it on for the central
// server with the variable COMMUNITY = "1".
import { sessionAccount } from "./accounts.js";
const JSONH = { "content-type": "application/json; charset=utf-8", "cache-control": "no-store", "access-control-allow-origin": "*" };
const json = (v, status = 200) => new Response(JSON.stringify(v), { status, headers: JSONH });
const err = (msg, status) => json({ error: msg }, status);
const str = (v, max = 120) => (typeof v === "string" ? v.slice(0, max) : v == null ? null : String(v).slice(0, max));
const num = (v) => (typeof v === "number" && isFinite(v) ? v : null);
const int = (v) => (Number.isInteger(v) && v > 0 && v < 1e9 ? v : null);
const rid = () => [...crypto.getRandomValues(new Uint8Array(12))].map((x) => x.toString(16).padStart(2, "0")).join("");
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
  if (p === "/combos" && m === "GET") {
    const r = await env.DB.prepare(
      "SELECT track_id AS trackId, MAX(track) AS track, car_id AS carId, MAX(car) AS car, COUNT(*) AS laps, MIN(time) AS best FROM community_laps GROUP BY track_id, car_id ORDER BY laps DESC LIMIT 500"
    ).all();
    return json({ combos: r.results || [] });
  }
  if (p === "/laps" && m === "GET") {
    const t = +url.searchParams.get("trackId"), c = +url.searchParams.get("carId");
    if (!t || !c) return err("trackId and carId", 400);
    const r = await env.DB.prepare(
      `SELECT l.id, u.alias, l.time, l.sectors, l.created, l.trace IS NOT NULL AS hasTrace, l.car, l.track FROM community_laps l JOIN community_users u ON u.id=l.user_id
       WHERE l.track_id=?1 AND l.car_id=?2 ORDER BY l.time LIMIT 200`
    ).bind(t, c).all();
    return json({ laps: (r.results || []).map((x) => ({ ...x, hasTrace: !!x.hasTrace, sectors: x.sectors ? JSON.parse(x.sectors) : null })) });
  }
  if (p.startsWith("/laps/") && m === "GET") {
    const l = await env.DB.prepare("SELECT l.*, u.alias FROM community_laps l JOIN community_users u ON u.id=l.user_id WHERE l.id=?1").bind(p.slice(6)).first();
    if (!l) return err("not found", 404);
    return json({ id: l.id, alias: l.alias, time: l.time, car: l.car, track: l.track, carId: l.car_id, trackId: l.track_id, sectors: l.sectors ? JSON.parse(l.sectors) : null, trace: l.trace ? JSON.parse(l.trace) : null });
  }
  if (p === "/reports" && m === "GET") {
    const t = +url.searchParams.get("trackId"), c = +url.searchParams.get("carId");
    const r = await env.DB.prepare(
      `SELECT r.id, u.alias, r.car, r.track, r.created, json_extract(r.data,'$.finish') AS finish, json_extract(r.data,'$.field') AS field, json_extract(r.data,'$.best') AS best
       FROM community_reports r JOIN community_users u ON u.id=r.user_id WHERE (?1=0 OR r.track_id=?1) AND (?2=0 OR r.car_id=?2) ORDER BY r.created DESC LIMIT 100`
    ).bind(t || 0, c || 0).all();
    return json({ reports: r.results || [] });
  }
  if (p.startsWith("/reports/") && m === "GET") {
    const r = await env.DB.prepare("SELECT r.*, u.alias FROM community_reports r JOIN community_users u ON u.id=r.user_id WHERE r.id=?1").bind(p.slice(9)).first();
    if (!r) return err("not found", 404);
    return json({ ...JSON.parse(r.data), id: r.id, alias: r.alias, shared: true });
  }

  // the current season schedule: public to read, uploaded by the accounts in SEASON_UPLOADERS
  if (p === "/season" && m === "GET") {
    const c = await env.DB.prepare("SELECT updated, chunks FROM season_cache WHERE k='current'").first();
    if (!c) return err("no season schedule on this server yet", 404);
    const r = await env.DB.prepare("SELECT data FROM season_chunks WHERE k='current' AND idx<?1 ORDER BY idx").bind(c.chunks).all();
    return new Response('{"updated":' + c.updated + ',"season":' + (r.results || []).map((x) => x.data).join("") + "}", { headers: { ...JSONH, "cache-control": "public, max-age=900" } });
  }
  if (p === "/setups/cars" && m === "GET") {
    const r = await env.DB.prepare("SELECT car_path AS carPath, MAX(car) AS car, COUNT(*) AS n FROM community_setups GROUP BY car_path ORDER BY n DESC LIMIT 500").all();
    return json({ cars: r.results || [] });
  }
  if (p === "/setups" && m === "GET") {
    const car = url.searchParams.get("car") || "", track = (url.searchParams.get("track") || "").slice(0, 80), q = (url.searchParams.get("q") || "").slice(0, 60);
    const r = await env.DB.prepare(
      `SELECT s.id, u.alias, s.car_path AS carPath, s.car, s.track, s.name, s.notes, s.size, s.downloads, s.created FROM community_setups s JOIN community_users u ON u.id=s.user_id
       WHERE (?1='' OR s.car_path=?1) AND (?2='' OR s.track LIKE '%'||?2||'%') AND (?3='' OR s.name LIKE '%'||?3||'%' OR s.car LIKE '%'||?3||'%' OR s.track LIKE '%'||?3||'%')
       ORDER BY s.downloads DESC, s.created DESC LIMIT 200`
    ).bind(car, track, q).all();
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
  const u = await me(req, env);
  if (!u) return err("wrong or missing token", 401);
  if (p === "/season" && m === "POST") {
    const allowed = String(env.SEASON_UPLOADERS || "").split(",").map((x) => x.trim()).filter(Boolean);
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
      "INSERT INTO community_setups (id, user_id, car_path, car, track, name, notes, data, sha, size, created) VALUES (?1,?2,?3,?4,?5,?6,?7,?8,?9,?10,?11) ON CONFLICT(user_id, sha) DO NOTHING"
    ).bind(id, u.id, body.carPath, str(body.car), str(body.track, 80), cleanFile(body.name), str(body.notes, 1000), body.data, body.sha, bytes.length, Date.now()).run();
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
  if (p === "/laps" && m === "POST") {
    const carId = int(body.carId), trackId = int(body.trackId), time = num(body.time);
    if (!carId || !trackId || !time || time <= 10 || time > 3600) return err("lap needs carId, trackId and time", 400);
    const trace = body.trace ? JSON.stringify(body.trace) : null;
    if (trace && trace.length > 900000) return err("lap trace too large", 400);
    if (!(await countUpload(env, u))) return err("too many uploads today", 429);
    const old = await env.DB.prepare("SELECT time FROM community_laps WHERE user_id=?1 AND car_id=?2 AND track_id=?3").bind(u.id, carId, trackId).first();
    if (old && old.time <= time) return json({ kept: "your faster lap is already shared" });
    const sectors = Array.isArray(body.sectors) ? JSON.stringify(body.sectors.filter((x) => typeof x === "number").slice(0, 10)) : null;
    await env.DB.prepare(
      `INSERT INTO community_laps (id, user_id, car_id, car, track_id, track, time, sectors, trace, created) VALUES (?1,?2,?3,?4,?5,?6,?7,?8,?9,?10)
       ON CONFLICT(user_id, car_id, track_id) DO UPDATE SET time=excluded.time, sectors=excluded.sectors, trace=excluded.trace, created=excluded.created, car=excluded.car, track=excluded.track`
    ).bind(rid(), u.id, carId, str(body.car), trackId, str(body.track), time, sectors, trace, Date.now()).run();
    return json({ shared: true });
  }
  if (p === "/reports" && m === "POST") {
    const data = JSON.stringify(body.report || {});
    if (data.length < 20 || data.length > 900000) return err("report missing or too large", 400);
    if (!(await countUpload(env, u))) return err("too many uploads today", 429);
    const r = body.report;
    await env.DB.prepare("INSERT INTO community_reports (id, user_id, car_id, car, track_id, track, data, created) VALUES (?1,?2,?3,?4,?5,?6,?7,?8)")
      .bind(rid(), u.id, int(r.carId), str(r.car), int(r.trackId), str(r.track), data, Date.now()).run();
    return json({ shared: true });
  }
  return err("not found", 404);
}
