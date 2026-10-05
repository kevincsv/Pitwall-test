// Community: drivers who choose to share their best laps (time, and if they
// want the whole lap trace) and race analyses. Reading is public; writing
// needs the device token given at registration. Turn it on for the central
// server with the variable COMMUNITY = "1".
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
async function me(req, env) {
  const h = req.headers.get("authorization") || "";
  const t = h.startsWith("Bearer ") ? h.slice(7).trim() : "";
  if (t.length < 20) return null;
  return env.DB.prepare("SELECT id, alias, uploads_day, uploads FROM community_users WHERE token_hash=?1").bind(await sha256(t)).first();
}
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
  if (m === "OPTIONS") return new Response(null, { headers: { ...JSONH, "access-control-allow-methods": "GET,POST,DELETE", "access-control-allow-headers": "authorization,content-type" } });
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

  // everything below needs the driver's token
  const u = await me(req, env);
  if (!u) return err("wrong or missing token", 401);
  if (p === "/me" && m === "POST") {
    await env.DB.prepare("UPDATE community_users SET alias=?2 WHERE id=?1").bind(u.id, cleanAlias(body.alias)).run();
    return json({ ok: true });
  }
  if (p === "/me" && m === "DELETE") {
    await env.DB.batch([
      env.DB.prepare("DELETE FROM community_laps WHERE user_id=?1").bind(u.id),
      env.DB.prepare("DELETE FROM community_reports WHERE user_id=?1").bind(u.id),
      env.DB.prepare("DELETE FROM community_users WHERE id=?1").bind(u.id),
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
