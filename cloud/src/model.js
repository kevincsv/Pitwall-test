// The model: one per car and track, built here on the server from every real lap it knows of:
// the valid laps with telemetry of the accounts (shared or not), the laps people shared, and the
// laps of the rivals of your races (their speed from their position on track). Its references are
// real laps, never composites: the record (the fastest lap really driven) and, for every pace, the
// lap of the driver just ahead. The analysis, the coach and the lap list all use this one model.
// The browser and the apps only get what it learnt, never anyone's laps as such.
//
// It is rebuilt as soon as a lap arrives (the PC uploads laps on its own, nothing else has to
// be open): the upload marks the car and track, the next request rebuilds it, and a cron
// every 10 minutes rebuilds whatever is still marked.
import { openData } from "./crypt.js";

// raise it when the way the model learns changes: every model is rebuilt from its memory
export const MODEL_VERSION = 4; // 4: real laps only — the record and the driver just ahead, no composites
const SEG_M = 250;          // metres per micro-sector
const MAX_LAPS = 80;        // laps the model reads per car and track
const LEARN_PER_RUN = 120;  // new laps taken into the memory per run (the rest on the next one)
const LADDER_STEP = 0.004;  // a "next level" reference every 0.4 % of pace
const LADDER_SPAN = 0.08;   // up to 8 % slower than the fastest lap
const LEVEL_BIN = 2;        // the references keep one bin in two (10 m) to stay small

const median = (a) => { const v = a.filter((x) => x != null && isFinite(x)).sort((x, y) => x - y); if (!v.length) return null; const m = v.length >> 1; return v.length % 2 ? v[m] : (v[m - 1] + v[m]) / 2; };
const r = (v, d) => (v == null || !isFinite(v) ? 0 : Math.round(v * d) / d);
const tAt = (l, i) => { const b = l.bins[Math.min(i, l.bins.length - 1)]; return b ? b[1] : null; };
function segTimes(l, M, n) {
  const out = [], step = n / M;
  for (let k = 0; k < M; k++) {
    const s = Math.round(k * step), e = k === M - 1 ? n - 1 : Math.round((k + 1) * step);
    const a = tAt(l, s), b = k === M - 1 ? l.time : tAt(l, e);
    out.push(a != null && b != null && b > a ? b - a : null);
  }
  return out;
}

// a lap is only used when its telemetry is whole and believable
function goodLap(time, tr) {
  if (!tr || !Array.isArray(tr.d) || tr.d.length < 60) return null;
  const bins = tr.d.map((x) => [+x[0], +x[5], +x[1], +x[2], +x[3], +x[4]]);
  let back = 0, prev = -1;
  for (const b of bins) {
    if (!(b[0] >= 0 && b[0] < 130) || !isFinite(b[1])) return null; // speed in m/s, a time on every bin
    if (b[1] < prev - 0.05) back++;
    prev = b[1];
  }
  if (back > 2) return null;                                   // lap time going backwards: broken recording
  if (bins[bins.length - 1][1] > time + 2) return null;        // the trace does not match the lap time
  return { time, bins };
}

const sha = async (t) => [...new Uint8Array(await crypto.subtle.digest("SHA-256", new TextEncoder().encode(t)))].map((x) => x.toString(16).padStart(2, "0")).join("").slice(0, 24);

// laps from before the PC sent the iRacing ids of the track and car: found by name and given the ids,
// so the laps that already worked keep teaching the model
async function adoptOldSessions(env, game, trackId, carId) {
  const names = await env.DB.prepare(
    `SELECT track, car FROM community_laps WHERE track_id=?1 AND car_id=?2 AND game=?3
     UNION SELECT track, car FROM community_reports WHERE track_id=?1 AND car_id=?2 AND game=?3 LIMIT 20`).bind(trackId, carId, game).all();
  // the exact name only: the track and its layout ("Okayama · Full"), or a track without layouts.
  // (0.7.2 matched the track name alone and could give a session of another layout these ids)
  const full = [];
  for (const n of names.results || []) {
    if (!n.track || !n.car) continue;
    full.push(n.track);
    await env.DB.prepare(
      `UPDATE sessions SET track_id=?1, car_id=?2 WHERE (track_id IS NULL OR car_id IS NULL) AND game=?3 AND car=?4
         AND ((track||' · '||COALESCE(track_config,''))=?5 OR (track=?5 AND COALESCE(track_config,'')=''))`
    ).bind(trackId, carId, game, n.car, n.track).run().catch(() => {});
  }
  if (full.length) {
    const ph = full.map((_, i) => "?" + (i + 4)).join(",");
    await env.DB.prepare(
      `UPDATE sessions SET track_id=NULL, car_id=NULL WHERE track_id=?1 AND car_id=?2 AND game=?3 AND COALESCE(track_config,'')<>''
         AND (track||' · '||track_config) NOT IN (${ph})`
    ).bind(trackId, carId, game, ...full).run().catch(() => {});
  }
}

// every valid lap with telemetry that is not in the memory yet goes in: account laps (shared or
// not), shared laps of drivers without an account (DRINKS drivers, older PCs)
async function learnNewLaps(env, game, trackId, carId) {
  const known = new Set(((await env.DB.prepare("SELECT k FROM model_laps WHERE game=?1 AND track_id=?2 AND car_id=?3").bind(game, trackId, carId).all()).results || []).map((x) => x.k));
  const a = await env.DB.prepare(
    `SELECT s.uploader AS up, a.time, a.trace FROM laps a JOIN sessions s ON s.id=a.session_id
     WHERE s.track_id=?1 AND s.car_id=?2 AND s.game=?3 AND s.uploader LIKE 'acct:%' AND a.valid=1 AND a.time>10 AND a.trace IS NOT NULL
       AND LOWER(COALESCE(s.kind,'')) NOT LIKE '%test%' AND COALESCE(s.official,1)<>0
     ORDER BY a.time LIMIT 3000`).bind(trackId, carId, game).all();
  const c = await env.DB.prepare(
    `SELECT 'acct:'||user_id AS up, time, trace FROM community_laps WHERE track_id=?1 AND car_id=?2 AND game=?3 AND trace IS NOT NULL AND COALESCE(official,1)<>0 ORDER BY time LIMIT 800`
  ).bind(trackId, carId, game).all();
  // what it learnt before from a test drive or a session outside the official series leaves its memory
  const out = await env.DB.prepare(
    `SELECT s.uploader AS up, a.time FROM laps a JOIN sessions s ON s.id=a.session_id
     WHERE s.track_id=?1 AND s.car_id=?2 AND s.game=?3 AND s.uploader LIKE 'acct:%' AND a.valid=1 AND a.time>10 AND a.trace IS NOT NULL
       AND (LOWER(COALESCE(s.kind,'')) LIKE '%test%' OR s.official=0) LIMIT 3000`).bind(trackId, carId, game).all();
  for (const x of out.results || []) {
    const k = await sha(x.up + ":" + x.time.toFixed(3));
    if (!known.has(k)) continue;
    known.delete(k);
    await env.DB.prepare("DELETE FROM model_laps WHERE game=?1 AND track_id=?2 AND car_id=?3 AND k=?4").bind(game, trackId, carId, k).run();
  }
  let added = 0;
  for (const x of [...(a.results || []), ...(c.results || [])]) {
    const k = await sha(x.up + ":" + x.time.toFixed(3));
    if (known.has(k)) continue;
    if (added >= LEARN_PER_RUN) return { added, more: true }; // the rest on the next run
    known.add(k);
    let tr = null;
    try { tr = JSON.parse(await openData(env, x.trace)); } catch (e) { continue; }
    if (!goodLap(x.time, tr)) continue;
    await env.DB.prepare("INSERT INTO model_laps (game, track_id, car_id, k, drv, time, data, created) VALUES (?1,?2,?3,?4,?5,?6,?7,?8) ON CONFLICT DO NOTHING")
      .bind(game, trackId, carId, k, await sha("drv:" + x.up), x.time, await gz(JSON.stringify(tr.d)), Date.now()).run();
    added++;
  }
  return { added, more: false };
}

// what the model learns from: its memory, the best few laps of every driver
async function candidates(env, game, trackId, carId) {
  await adoptOldSessions(env, game, trackId, carId);
  const learnt = await learnNewLaps(env, game, trackId, carId);
  const all = await env.DB.prepare("SELECT drv, time, data FROM model_laps WHERE game=?1 AND track_id=?2 AND car_id=?3 ORDER BY time LIMIT 5000").bind(game, trackId, carId).all();
  // the best 3 laps of each driver; with fewer than 3 drivers (one driver's Garage 61 history, say) up to 10
  // of theirs, so the ideal lap settles on the median of many laps instead of three
  const drivers = new Set((all.results || []).map((x) => x.drv)).size;
  const cap = drivers < 3 ? 10 : 3;
  const per = new Map();
  for (const x of all.results || []) {
    const l = per.get(x.drv) || [];
    if (l.length >= cap) continue;
    l.push(x);
    per.set(x.drv, l);
  }
  // one lap per driver first (the best), then their next best ones while there is room
  const rounds = Array.from({ length: cap }, () => []);
  for (const l of per.values()) l.forEach((x, i) => rounds[i].push(x));
  const pick = [];
  for (const rd of rounds) for (const x of rd.sort((p, q) => p.time - q.time)) if (pick.length < MAX_LAPS) pick.push(x);
  const laps = [];
  for (const x of pick) {
    try { const g = goodLap(x.time, { d: JSON.parse(await gunz(x.data)) }); if (g) { g.up = x.drv; laps.push(g); } } catch (e) {}
  }
  return { laps, drivers, more: learnt.more };
}

export async function buildModel(env, game, trackId, carId) {
  const { laps: raw, drivers, more } = await candidates(env, game, trackId, carId);
  const shared = await env.DB.prepare(
    `SELECT COUNT(*) AS n, MIN(time) AS best FROM community_laps WHERE track_id=?1 AND car_id=?2 AND game=?3 AND COALESCE(shown,'')<>'model'`).bind(trackId, carId, game).first();
  const base = { v: MODEL_VERSION, game, trackId, carId, built: Date.now(), more: !!more, drivers, shared: (shared && shared.n) || 0 };
  if (raw.length < 2) return { ...base, n: raw.length };
  // same length of track for every lap (another layout or a broken recording would not line up)
  const len = median(raw.map((l) => l.bins.length));
  let laps = raw.filter((l) => Math.abs(l.bins.length - len) <= len * 0.03);
  // the telemetry has to add up to the lap time (speed over every 5 m gives the time back): a lap that
  // started part way round (out of the pits, a reset, a tow) has a short clock and is left out
  laps = laps.filter((l) => { let t = 0, n = 0; for (const b of l.bins) if (b[0] > 0.5) { t += 5 / b[0]; n++; } return n >= l.bins.length * 0.9 && Math.abs(t - l.time) / l.time < 0.04; });
  // far slower laps (spins, traffic, out laps that slipped through) say nothing about the line
  const tMed = median(laps.map((l) => l.time));
  laps = laps.filter((l) => l.time <= tMed * 1.12);
  // with a few laps, each one has to look like the others: the same speed profile along the lap
  // (another layout of the same track does not) and no part impossibly faster than the rest
  if (laps.length >= 3) {
    const nb = Math.min(...laps.map((l) => l.bins.length)), prof = [];
    for (let i = 0; i < nb; i++) prof.push(median(laps.map((l) => l.bins[i][0])));
    const M0 = Math.max(8, Math.round((nb * 5) / SEG_M));
    laps.forEach((l) => { l.seg0 = segTimes(l, M0, nb); });
    const segMed = [];
    for (let k = 0; k < M0; k++) segMed.push(median(laps.map((l) => l.seg0[k])));
    laps = laps.filter((l) => {
      let dev = 0;
      for (let i = 0; i < nb; i++) dev += Math.abs(l.bins[i][0] - prof[i]) / Math.max(prof[i], 5);
      if (dev / nb > 0.2) return false;
      return l.seg0.every((v, k) => v == null || segMed[k] == null || v >= segMed[k] * 0.88);
    });
  }
  // the pace of every driver the model knows, with or without telemetry (the rivals of your races
  // whose lap the PC did not see whole still bring their time): where your pace stands among them
  const timed = await env.DB.prepare("SELECT user_id, MIN(time) AS t FROM community_laps WHERE track_id=?1 AND car_id=?2 AND game=?3 AND time>10 AND COALESCE(official,1)<>0 GROUP BY user_id").bind(trackId, carId, game).all();
  const byDrv = new Map();
  for (const l of laps) if (!byDrv.has(l.up) || l.time < byDrv.get(l.up)) byDrv.set(l.up, l.time);
  for (const x of timed.results || []) { const k = await sha("drv:acct:" + x.user_id); if (!byDrv.has(k) || x.t < byDrv.get(k)) byDrv.set(k, x.t); }
  const times = [...byDrv.values()].sort((a, b) => a - b).map((t) => r(t, 1000));
  if (laps.length < 2) return { ...base, n: laps.length, drivers: Math.max(drivers, times.length), times };
  const n = Math.min(...laps.map((l) => l.bins.length)), M = Math.max(8, Math.round((n * 5) / SEG_M));
  laps.forEach((l) => { l.seg = segTimes(l, M, n); });
  // the record: the fastest lap really driven, whole, as the reference everyone can be measured against
  const fastest = laps.reduce((a, b) => (b.time < a.time ? b : a));
  const record = fastest.bins.slice(0, n).map((b) => [r(b[0], 10), r(b[1], 1000), r(b[2], 100), r(b[3], 100), Math.round(b[4] || 0), r(b[5], 100)]);
  // the "next level" for every pace: the real lap of the driver just ahead (0.3 % to 3 % faster; the
  // closest one), kept small (one bin in two); the same lap serves a stretch of paces
  const compact = (l) => { const out = []; for (let i = 0; i < n; i += LEVEL_BIN) { const b = l.bins[i]; out.push([r(b[0], 10), r(b[1], 1000), r(b[2], 100), r(b[3], 100), Math.round(b[4] || 0)]); } return out; };
  const sorted = laps.slice().sort((a, b) => a.time - b.time);
  const ladder = [];
  for (let j = 0; j * LADDER_STEP <= LADDER_SPAN; j++) {
    const t = fastest.time * (1 + j * LADDER_STEP);
    let g = sorted.filter((l) => l.time < t * 0.997 && l.time > t * 0.97);
    if (!g.length) g = sorted.filter((l) => l.time < t * 0.997); // nobody that close ahead: the nearest faster lap
    const pick = g.length ? g[g.length - 1] : fastest;
    if (ladder.length && ladder[ladder.length - 1].lap === pick) { ladder[ladder.length - 1].upTo = t; continue; }
    ladder.push({ lap: pick, upTo: t, time: r(pick.time, 1000), n: 1, seg: pick.seg.map((x) => r(x, 1000)), bins: compact(pick) });
  }
  return {
    ...base, n: laps.length, drivers: Math.max(drivers, times.length), M, nb: n, pool: laps.length, idealTime: r(fastest.time, 1000), fastest: r(fastest.time, 1000), times,
    ideal: record,
    ladder: ladder.map(({ lap, ...x }) => ({ ...x, upTo: r(x.upTo, 1000) })),
  };
}

// ---------- ids for a track and car nobody recorded with iRacing's ids yet ----------
// Sharing never waits for the ids: a car and track get provisional ids made from their names
// (900 000 000 and up), and the first session that brings the real ids replaces them everywhere.
export const PSEUDO_MIN = 900000000;
const normName = (v) => String(v || "").toLowerCase().normalize("NFD").replace(/[\u0300-\u036f]/g, "").replace(/[^a-z0-9]+/g, "");
export async function pseudoId(kind, game, name) {
  const b = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(kind + "|" + game + "|" + normName(name)));
  const n = new DataView(b).getUint32(0);
  return PSEUDO_MIN + (n % 99999999);
}
// a session with the real ids arrived: whatever was shared or learnt under provisional ids of the
// same track and car moves to the real ones
export async function reconcileIds(env, game, track, trackConfig, car, trackId, carId) {
  if (!trackId || !carId || trackId >= PSEUDO_MIN || carId >= PSEUDO_MIN) return;
  const full = track + (trackConfig ? " · " + trackConfig : "");
  const pt = await pseudoId("t", game, full), pc = await pseudoId("c", game, car);
  const hit = await env.DB.prepare("SELECT 1 FROM sessions WHERE game=?1 AND (track_id=?2 OR car_id=?3) LIMIT 1").bind(game, pt, pc).first()
    || await env.DB.prepare("SELECT 1 FROM community_laps WHERE game=?1 AND (track_id=?2 OR car_id=?3) LIMIT 1").bind(game, pt, pc).first()
    || await env.DB.prepare("SELECT 1 FROM community_reports WHERE game=?1 AND (track_id=?2 OR car_id=?3) LIMIT 1").bind(game, pt, pc).first();
  if (!hit) return;
  const fix = (t) => [
    env.DB.prepare(`UPDATE OR IGNORE ${t} SET track_id=CASE WHEN track_id=?1 THEN ?2 ELSE track_id END, car_id=CASE WHEN car_id=?3 THEN ?4 ELSE car_id END WHERE game=?5 AND (track_id=?1 OR car_id=?3)`).bind(pt, trackId, pc, carId, game),
    env.DB.prepare(`DELETE FROM ${t} WHERE game=?1 AND (track_id=?2 OR car_id=?3)`).bind(game, pt, pc), // a row the real combo already had wins
  ];
  await env.DB.batch([
    env.DB.prepare("UPDATE sessions SET track_id=CASE WHEN track_id=?1 THEN ?2 ELSE track_id END, car_id=CASE WHEN car_id=?3 THEN ?4 ELSE car_id END WHERE game=?5 AND (track_id=?1 OR car_id=?3)").bind(pt, trackId, pc, carId, game),
    ...fix("community_laps"), ...fix("community_reports"), ...fix("model_laps"),
    env.DB.prepare("DELETE FROM model_cache WHERE game=?1 AND (track_id=?2 OR car_id=?3)").bind(game, pt, pc)]);
  await markModel(env, game, trackId, carId);
}

const gz = async (s) => new Uint8Array(await new Response(new Blob([s]).stream().pipeThrough(new CompressionStream("gzip"))).arrayBuffer());
// D1 gives a BLOB back as an array of numbers
const gunz = async (b) => await new Response(new Blob([b instanceof ArrayBuffer || ArrayBuffer.isView(b) ? b : new Uint8Array(b)]).stream().pipeThrough(new DecompressionStream("gzip"))).text();

// a car and track got a new lap: the model has to learn it
// the laps one driver taught the model, moved to another driver (a PC's community token merged into its
// account): the same laps, counted once and under the account
export async function moveDriver(env, fromUp, toUp) {
  const from = await sha("drv:" + fromUp), to = await sha("drv:" + toUp);
  const rows = (await env.DB.prepare("SELECT game, track_id, car_id, k, time FROM model_laps WHERE drv=?1").bind(from).all()).results || [];
  for (const r of rows) {
    await env.DB.prepare("UPDATE OR IGNORE model_laps SET drv=?5, k=?6 WHERE game=?1 AND track_id=?2 AND car_id=?3 AND k=?4")
      .bind(r.game, r.track_id, r.car_id, r.k, to, await sha(toUp + ":" + r.time.toFixed(3))).run();
  }
  // a lap both drivers had (the same lap learnt twice) stays once
  await env.DB.prepare("DELETE FROM model_laps WHERE drv=?1").bind(from).run();
  return rows.length;
}

export async function markModel(env, game, trackId, carId) {
  if (!trackId || !carId) return;
  await env.DB.prepare(
    `INSERT INTO model_cache (game, track_id, car_id, dirty, built, data) VALUES (?1,?2,?3,1,0,NULL)
     ON CONFLICT(game, track_id, car_id) DO UPDATE SET dirty=1`).bind(game, trackId, carId).run().catch(() => {});
}

async function rebuild(env, game, trackId, carId) {
  const m = await buildModel(env, game, trackId, carId);
  await env.DB.prepare(
    `INSERT INTO model_cache (game, track_id, car_id, dirty, built, data) VALUES (?1,?2,?3,?6,?4,?5)
     ON CONFLICT(game, track_id, car_id) DO UPDATE SET dirty=excluded.dirty, built=excluded.built, data=excluded.data`
  ).bind(game, trackId, carId, m.built, await gz(JSON.stringify(m)), m.more ? 1 : 0).run();
  return m;
}

// what the apps ask for: the model of a car and track, rebuilt when new laps came in
export async function getModel(env, game, trackId, carId) {
  const row = await env.DB.prepare("SELECT dirty, built, data FROM model_cache WHERE game=?1 AND track_id=?2 AND car_id=?3").bind(game, trackId, carId).first();
  if (row && row.data && !row.dirty) {
    const m = JSON.parse(await gunz(row.data));
    if (m.v === MODEL_VERSION) return m; // a model from an older version is relearnt below
  }
  // new laps (or never built): learn them now; if that fails, the last model is still good
  try { return await rebuild(env, game, trackId, carId); } catch (e) { if (row && row.data) return JSON.parse(await gunz(row.data)); throw e; }
}

// the cron: whatever got new laps and nobody looked at yet
export async function rebuildDirty(env) {
  // cars and tracks with laps that never had a model (laps from before the model): they get one
  await env.DB.prepare(
    `INSERT INTO model_cache (game, track_id, car_id, dirty, built, data)
     SELECT DISTINCT game, track_id, car_id, 1, 0, NULL FROM community_laps WHERE track_id>0 AND car_id>0
     UNION SELECT DISTINCT game, track_id, car_id, 1, 0, NULL FROM sessions WHERE track_id>0 AND car_id>0 AND uploader LIKE 'acct:%'
     ON CONFLICT DO NOTHING`).run().catch(() => {});
  const r = await env.DB.prepare("SELECT game, track_id, car_id FROM model_cache WHERE dirty=1 ORDER BY built LIMIT 25").all();
  for (const x of r.results || []) { try { await rebuild(env, x.game, x.track_id, x.car_id); } catch (e) {} }
}
