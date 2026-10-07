// The community model, built here on the server from every valid lap with telemetry of a car
// and track: the laps people shared and the valid laps of accounts that did not share them.
// The browser and the apps only get what the model learnt (the realistic ideal lap and the
// "next level" references at every pace), never the laps themselves.
//
// It is rebuilt as soon as a lap arrives (the PC uploads laps on its own, nothing else has to
// be open): the upload marks the car and track, the next request rebuilds it, and a cron
// every 10 minutes rebuilds whatever is still marked.
import { openData } from "./crypt.js";

// raise it when the way the model learns changes: every model is rebuilt from its memory
export const MODEL_VERSION = 2;
const SEG_M = 250;          // metres per micro-sector
const IDEAL_MAX = 0.005;    // the ideal lap is never more than 0.5 % faster than the fastest real lap
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
  for (const n of names.results || []) {
    if (!n.track || !n.car) continue;
    const base = String(n.track).split(" · ")[0];
    await env.DB.prepare(
      `UPDATE sessions SET track_id=?1, car_id=?2 WHERE (track_id IS NULL OR car_id IS NULL) AND game=?3 AND car=?4
         AND (track=?5 OR track=?6 OR (track||' · '||COALESCE(track_config,''))=?5)`
    ).bind(trackId, carId, game, n.car, n.track, base).run().catch(() => {});
  }
}

// every valid lap with telemetry that is not in the memory yet goes in: account laps (shared or
// not), shared laps of drivers without an account (DRINKS drivers, older PCs)
async function learnNewLaps(env, game, trackId, carId) {
  const known = new Set(((await env.DB.prepare("SELECT k FROM model_laps WHERE game=?1 AND track_id=?2 AND car_id=?3").bind(game, trackId, carId).all()).results || []).map((x) => x.k));
  const a = await env.DB.prepare(
    `SELECT s.uploader AS up, a.time, a.trace FROM laps a JOIN sessions s ON s.id=a.session_id
     WHERE s.track_id=?1 AND s.car_id=?2 AND s.game=?3 AND s.uploader LIKE 'acct:%' AND a.valid=1 AND a.time>10 AND a.trace IS NOT NULL
     ORDER BY a.time LIMIT 3000`).bind(trackId, carId, game).all();
  const c = await env.DB.prepare(
    `SELECT 'acct:'||user_id AS up, time, trace FROM community_laps WHERE track_id=?1 AND car_id=?2 AND game=?3 AND trace IS NOT NULL ORDER BY time LIMIT 800`
  ).bind(trackId, carId, game).all();
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
  const per = new Map();
  for (const x of all.results || []) {
    const l = per.get(x.drv) || [];
    if (l.length >= 3) continue;
    l.push(x);
    per.set(x.drv, l);
  }
  const drivers = per.size;
  // one lap per driver first (the best), then their next best ones while there is room
  const rounds = [[], [], []];
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
    `SELECT COUNT(*) AS n, MIN(time) AS best FROM community_laps WHERE track_id=?1 AND car_id=?2 AND game=?3`).bind(trackId, carId, game).first();
  const base = { v: MODEL_VERSION, game, trackId, carId, built: Date.now(), more: !!more, drivers, shared: (shared && shared.n) || 0 };
  if (raw.length < 2) return { ...base, n: raw.length };
  // same length of track for every lap (another layout or a broken recording would not line up)
  const len = median(raw.map((l) => l.bins.length));
  let laps = raw.filter((l) => Math.abs(l.bins.length - len) <= len * 0.03);
  // far slower laps (spins, traffic, out laps that slipped through) say nothing about the line
  const tMed = median(laps.map((l) => l.time));
  laps = laps.filter((l) => l.time <= tMed * 1.12);
  if (laps.length < 2) return { ...base, n: laps.length };
  const n = Math.min(...laps.map((l) => l.bins.length)), M = Math.max(8, Math.round((n * 5) / SEG_M));
  laps.forEach((l) => { l.seg = segTimes(l, M, n); });
  // realistic ideal: laps within 2 % of the fastest, the median of the best three of every
  // micro-sector, and never more than IDEAL_MAX under the fastest lap really driven
  const fastest = laps.reduce((a, b) => (b.time < a.time ? b : a));
  const pool = laps.filter((l) => l.time <= fastest.time * 1.02);
  const best = [];
  for (let k = 0; k < M; k++) {
    const v = pool.map((l) => ({ v: l.seg[k], l })).filter((x) => x.v != null).sort((a, b) => a.v - b.v);
    if (!v.length) { best.push(null); continue; }
    const top = v.slice(0, v.length >= 5 ? 3 : v.length >= 2 ? 2 : 1), mid = top.length === 3 ? top[1].v : top.reduce((s, x) => s + x.v, 0) / top.length;
    // never slower than the fastest lap in that micro-sector: an ideal is at least that lap
    const fs = fastest.seg[k];
    if (fs != null && fs < mid) best.push({ v: fs, l: fastest });
    else best.push({ v: mid, l: top[top.length === 3 ? 1 : 0].l });
  }
  let idealTime = best.reduce((s, b) => s + (b ? b.v : 0), 0);
  const floor = fastest.time * (1 - IDEAL_MAX);
  if (idealTime < floor) {
    const f = (fastest.time - floor) / Math.max(1e-6, fastest.time - idealTime);
    best.forEach((b, k) => { if (b && fastest.seg[k] != null) b.v = fastest.seg[k] - (fastest.seg[k] - b.v) * f; });
    idealTime = best.reduce((s, b) => s + (b ? b.v : 0), 0);
  }
  // the ideal lap as a trace: every micro-sector from the lap that gave its median, scaled to its time
  const ideal = [];
  let off = 0;
  const step = n / M;
  for (let k = 0; k < M; k++) {
    const b = best[k];
    const s = Math.round(k * step), e = k === M - 1 ? n : Math.round((k + 1) * step);
    if (!b) { for (let i = s; i < e; i++) ideal[i] = ideal[i - 1] || [0, off, 0, 0, 0, 0]; continue; }
    const t0 = tAt(b.l, s), raw0 = b.l.seg[k] || b.v, f = raw0 > 0 ? b.v / raw0 : 1;
    for (let i = s; i < e; i++) { const x = b.l.bins[i]; ideal[i] = x ? [x[0] / f, off + (x[1] - t0) * f, x[2], x[3], x[4], x[5]] : ideal[i - 1] || [0, off, 0, 0, 0, 0]; }
    off += b.v;
  }
  // the "next level" ladder: for every pace, the drivers 0.3–3 % faster, averaged bin by bin
  const ladder = [];
  for (let j = 0; j * LADDER_STEP <= LADDER_SPAN; j++) {
    const t = fastest.time * (1 + j * LADDER_STEP);
    let g = laps.filter((l) => l.time < t * 0.997 && l.time > t * 0.97);
    if (g.length < 2) g = laps.filter((l) => l.time < t).sort((a, b) => b.time - a.time).slice(0, 3);
    if (!g.length) g = laps.slice().sort((a, b) => a.time - b.time).slice(0, 3);
    const key = g.map((l) => l.time).join(",");
    if (ladder.length && ladder[ladder.length - 1].key === key) { ladder[ladder.length - 1].upTo = t; continue; }
    const bins = [];
    let time = 0;
    for (let i = 0; i < n; i += LEVEL_BIN) {
      const v = median(g.map((l) => l.bins[i] && l.bins[i][0])) || 0.1;
      bins.push([r(v, 10), 0, r(median(g.map((l) => l.bins[i] && l.bins[i][2])), 100), r(median(g.map((l) => l.bins[i] && l.bins[i][3])), 100), Math.round(median(g.map((l) => l.bins[i] && l.bins[i][4])) || 0)]);
      bins[bins.length - 1][1] = time;
      time += (5 * LEVEL_BIN) / Math.max(v, 1);
    }
    const target = median(g.map((l) => l.time)), sc = target / time;
    bins.forEach((b) => { b[1] = r(b[1] * sc, 1000); });
    ladder.push({ key, upTo: t, time: r(target, 1000), n: g.length, seg: segTimes({ time: target, bins: bins.flatMap((b) => [b, b]) }, M, n).map((x) => r(x, 1000)), bins });
  }
  return {
    ...base, n: laps.length, M, nb: n, pool: pool.length, idealTime: r(idealTime, 1000), fastest: r(fastest.time, 1000),
    ideal: ideal.map((b) => [r(b[0], 10), r(b[1], 1000), r(b[2], 100), r(b[3], 100), Math.round(b[4] || 0), r(b[5], 100)]),
    ladder: ladder.map(({ key, ...x }) => ({ ...x, upTo: r(x.upTo, 1000) })),
  };
}

const gz = async (s) => new Uint8Array(await new Response(new Blob([s]).stream().pipeThrough(new CompressionStream("gzip"))).arrayBuffer());
// D1 gives a BLOB back as an array of numbers
const gunz = async (b) => await new Response(new Blob([b instanceof ArrayBuffer || ArrayBuffer.isView(b) ? b : new Uint8Array(b)]).stream().pipeThrough(new DecompressionStream("gzip"))).text();

// a car and track got a new lap: the model has to learn it
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
