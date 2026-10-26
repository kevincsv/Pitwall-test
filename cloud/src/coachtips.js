// The coach learns from what happens after its tips. Every tip the coach shows (the corner, the tip's kind, what the lap
// lost there and the time the session's best lap spent in that corner) comes here with the account, once per lap and
// reference. When the same driver drives that car and track again and opens the coach, the same corner's time in the new
// session's best lap says whether the tip worked (outcome, seconds gained). The 👍/👎 a driver presses on a tip goes with
// it. Nothing of this shows to the drivers. The admin panel shows the buckets (the tip's kind × the corner's speed), and
// from MIN_CASES cases a bucket's share of drivers who gained reorders the plan's tips (w, read by coachPlan on the web
// through /community/coach/weights). The tips' texts never change here, and no lap is made of this.
import { sessionAccount, isAdmin } from "./accounts.js";
import { famId } from "./carfamily.js";

export const MIN_CASES = 30;   // cases a bucket needs before it reorders anything
const MIN_RATINGS = 20;        // ratings a kind needs before its thumbs count
const SAME_CORNER_M = 60;      // the same corner next time: its slowest point within this many metres
const GAIN_S = 0.05;           // a corner counts as gained (or lost) from this many seconds

const JSONH = { "content-type": "application/json; charset=utf-8", "cache-control": "no-store", "access-control-allow-origin": "*" };
const json = (v, status = 200, h = {}) => new Response(JSON.stringify(v), { status, headers: { ...JSONH, ...h } });
const err = (msg, status) => json({ error: msg }, status);
const num = (v) => (typeof v === "number" && isFinite(v) ? v : null);
const int = (v) => (Number.isInteger(v) && v > 0 && v < 1e12 ? v : null);
const str = (v, max = 40) => (typeof v === "string" ? v.slice(0, max) : "");
const KIND = /^[a-z_]{1,32}$/, CLS = { slow: 1, medium: 1, fast: 1 }, REF = { level: 1, record: 1, own: 1, comm: 1 };
const r3 = (v) => Math.round(v * 1000) / 1000;
const BRAKE_KINDS = ["brake_later", "brake_earlier", "brake_late_apex"]; // the tips that ask for metres of braking: their numbers are calibrated
const MIN_ASK = 10;      // gains a bucket needs before its metres calibrate a tip
const MIN_PERSONAL = 10; // cases a driver's own bucket needs before it weighs
const HABIT_TRACKS = 3;  // tracks a kind has to repeat on to be a habit of the driver
const FLAGS = { traffic: 1, cold: 1 };
const median = (a) => { if (!a.length) return null; const v = a.slice().sort((x, y) => x - y); return v[v.length >> 1]; };
const flagsOf = (f) => (Array.isArray(f) ? f.filter((x) => FLAGS[x]).slice(0, 4).join(",") : "") || null;

// the weight of a bucket: 1 while it has fewer than MIN_CASES cases, else 0.8 + 0.4 × the share of drivers who gained
// there next time (0.7 to 1.3), and 15 % less when the drivers mostly gave the kind a thumbs down
export function weightOf(b, rt) {
  let w = 1;
  if (b.n >= MIN_CASES) w = Math.min(1.3, Math.max(0.7, 0.8 + 0.4 * (b.win / b.n)));
  if (rt && rt.up + rt.down >= MIN_RATINGS && rt.down > 0.6 * (rt.up + rt.down)) w *= 0.85;
  return Math.round(Math.max(0.6, w) * 100) / 100;
}

// the buckets (a tip's kind × the corner's speed) for everyone, or for one account (the driver's own weights)
async function buckets(env, account) {
  const who = account ? " AND account=?2" : "";
  const b = await env.DB.prepare(
    `SELECT kind, cls, COUNT(*) AS n, SUM(outcome>?1) AS win, SUM(outcome<-?1) AS loss, AVG(outcome) AS avg
       FROM coach_tips WHERE outcome IS NOT NULL AND kind<>''${who} GROUP BY kind, cls`).bind(...(account ? [GAIN_S, account] : [GAIN_S])).all();
  const t = await env.DB.prepare(`SELECT kind, SUM(rating=1) AS up, SUM(rating=-1) AS down FROM coach_tips WHERE rating<>0 AND kind<>''${account ? " AND account=?1" : ""} GROUP BY kind`).bind(...(account ? [account] : [])).all();
  const ratings = {};
  for (const x of t.results || []) ratings[x.kind] = { up: x.up || 0, down: x.down || 0 };
  const out = (b.results || []).map((x) => ({ kind: x.kind, cls: x.cls || "", n: x.n, win: x.win || 0, loss: x.loss || 0, avg: r3(x.avg || 0), w: weightOf(x, ratings[x.kind]) }));
  // a kind whose thumbs are down also weighs less on corners where it has no scored case yet
  for (const [kind, rt] of Object.entries(ratings)) for (const cls of Object.keys(CLS)) if (!out.some((x) => x.kind === kind && x.cls === cls)) { const w = weightOf({ n: 0, win: 0 }, rt); if (w !== 1) out.push({ kind, cls, n: 0, win: 0, loss: 0, avg: 0, w }); }
  // the metres a braking tip should ask for: among the drivers who gained next time, the median of how much their braking
  // point really moved (a tip that asks for 8 m when 4 m is what paid is calibrated down to 4)
  if (!account) {
    const d = await env.DB.prepare(
      `SELECT kind, cls, dd, ddn FROM coach_tips WHERE outcome>?1 AND kind IN (${BRAKE_KINDS.map((k) => `'${k}'`).join(",")}) AND dd IS NOT NULL AND ddn IS NOT NULL`).bind(GAIN_S).all();
    const moved = {};
    for (const x of d.results || []) { const k = x.kind + "|" + (x.cls || ""); (moved[k] = moved[k] || []).push(Math.abs(x.ddn - x.dd)); }
    for (const [k, a] of Object.entries(moved)) if (a.length >= MIN_ASK) { const [kind, cls] = k.split("|"); let bk = out.find((x) => x.kind === kind && x.cls === cls); if (!bk) { bk = { kind, cls, n: 0, win: 0, loss: 0, avg: 0, w: 1 }; out.push(bk); } bk.ask = Math.max(2, Math.round(median(a))); }
  }
  return { buckets: out, ratings };
}

// the tips an admin turned off (a kind on corners of one speed): the apps say the phase's plain tip instead
async function offList(env) {
  const r = await env.DB.prepare("SELECT kind, cls FROM coach_off").all().catch(() => ({ results: [] }));
  return (r.results || []).map((x) => x.kind + "|" + x.cls);
}
async function confidenceOn(env) {
  const r = await env.DB.prepare("SELECT v FROM app_state WHERE k='coach_confidence'").first().catch(() => null);
  return !!(r && r.v === "1");
}

export async function coachTipRoutes(req, env, p, m, body, game) {
  if (!p.startsWith("/coach/") && !p.startsWith("/admin/coach")) return null;
  const acc = await sessionAccount(req, env);
  if (!acc) return err("sign in with your Pitlane HQ account", 401);

  // the tips of one lap, with the corner times of the session's best lap; then the tips of this driver's earlier
  // sessions here get their outcome from this one
  if (p === "/coach/tips" && m === "POST") {
    const trackId = int(body.trackId), carId = int(body.carId) && (await famId(env, game, body.carId)), sid = str(body.sid, 120), started = int(body.started);
    const ref = REF[body.ref] ? body.ref : "own";
    if (!trackId || !carId || !sid || !started || !Array.isArray(body.corners)) return err("trackId, carId, sid, started and corners", 400);
    const now = Date.now(), rows = [], flags = flagsOf(body.flags);
    for (const c of body.corners.slice(0, 40)) {
      const n = int(c.n), apex = num(c.apex);
      if (!n || apex == null) continue;
      const kind = KIND.test(c.kind || "") ? c.kind : "";
      rows.push({ n, d: num(c.d), apex, kind, cls: CLS[c.cls] ? c.cls : "", lost: num(c.lost), ta: num(c.ta), tb: num(c.tb), tbest: num(c.tbest), dd: num(c.dd) });
    }
    if (!rows.length) return json({ ok: true, kept: 0, scored: 0 });
    const ins = env.DB.prepare(
      `INSERT INTO coach_tips (account, game, track_id, car_id, session_id, started, n, d, apex, kind, cls, ref, lost, ta, tb, tbest, created, dd, flags)
       VALUES (?1,?2,?3,?4,?5,?6,?7,?8,?9,?10,?11,?12,?13,?14,?15,?16,?17,?18,?19)
       ON CONFLICT(account, session_id, n) DO UPDATE SET d=excluded.d, apex=excluded.apex, kind=excluded.kind, cls=excluded.cls, ref=excluded.ref,
         lost=excluded.lost, ta=excluded.ta, tb=excluded.tb, tbest=COALESCE(excluded.tbest, coach_tips.tbest), created=excluded.created, dd=excluded.dd, flags=excluded.flags`);
    await env.DB.batch(rows.map((c) => ins.bind(acc.id, game, trackId, carId, sid, started, c.n, c.d, c.apex, c.kind, c.cls, ref, c.lost, c.ta, c.tb, c.tbest, now, c.dd, flags)));
    // the earlier sessions of this driver here whose tips have no outcome yet: the same corner (by its slowest point) in
    // this session's best lap says what came of them
    const old = await env.DB.prepare(
      `SELECT id, apex, tbest FROM coach_tips WHERE account=?1 AND game=?2 AND track_id=?3 AND car_id=?4 AND started<?5 AND session_id<>?6
         AND outcome IS NULL AND kind<>'' AND tbest IS NOT NULL ORDER BY started DESC LIMIT 200`).bind(acc.id, game, trackId, carId, started, sid).all();
    const upd = [];
    for (const o of old.results || []) {
      let best = null;
      for (const c of rows) if (c.tbest != null && Math.abs(c.apex - o.apex) <= SAME_CORNER_M && (!best || Math.abs(c.apex - o.apex) < Math.abs(best.apex - o.apex))) best = c;
      if (best) upd.push(env.DB.prepare("UPDATE coach_tips SET outcome=?2, outcome_at=?3, ddn=?4 WHERE id=?1").bind(o.id, r3(o.tbest - best.tbest), now, best.dd));
    }
    // and the other way round: when the driver opens an older session after a newer one here, the newer one's best lap
    // (the nearest later session the coach saw) answers these tips now
    const later = await env.DB.prepare(
      `SELECT session_id FROM coach_tips WHERE account=?1 AND game=?2 AND track_id=?3 AND car_id=?4 AND started>?5 AND tbest IS NOT NULL ORDER BY started LIMIT 1`).bind(acc.id, game, trackId, carId, started).first();
    if (later) {
      const nx = await env.DB.prepare("SELECT apex, tbest, dd FROM coach_tips WHERE account=?1 AND session_id=?2 AND tbest IS NOT NULL").bind(acc.id, later.session_id).all();
      for (const c of rows) {
        if (!c.kind || c.tbest == null) continue;
        let best = null;
        for (const o of nx.results || []) if (Math.abs(c.apex - o.apex) <= SAME_CORNER_M && (!best || Math.abs(o.apex - c.apex) < Math.abs(best.apex - c.apex))) best = o;
        if (best) upd.push(env.DB.prepare("UPDATE coach_tips SET outcome=?3, outcome_at=?4, ddn=?6 WHERE account=?1 AND session_id=?2 AND n=?5 AND outcome IS NULL").bind(acc.id, sid, r3(c.tbest - best.tbest), now, c.n, best.dd));
      }
    }
    if (upd.length) await env.DB.batch(upd);
    return json({ ok: true, kept: rows.length, scored: upd.length });
  }

  // a thumb on one tip (1 up, -1 down, 0 takes it back)
  if (p === "/coach/rate" && m === "POST") {
    const trackId = int(body.trackId), carId = int(body.carId) && (await famId(env, game, body.carId)), sid = str(body.sid, 120), started = int(body.started), n = int(body.n), apex = num(body.apex);
    if (!trackId || !carId || !sid || !started || !n || apex == null) return err("trackId, carId, sid, started, n and apex", 400);
    const up = body.up === 1 ? 1 : body.up === -1 ? -1 : 0, kind = KIND.test(body.kind || "") ? body.kind : "", cls = CLS[body.cls] ? body.cls : "";
    await env.DB.prepare(
      `INSERT INTO coach_tips (account, game, track_id, car_id, session_id, started, n, apex, kind, cls, rating, created) VALUES (?1,?2,?3,?4,?5,?6,?7,?8,?9,?10,?11,?12)
       ON CONFLICT(account, session_id, n) DO UPDATE SET rating=excluded.rating, kind=CASE WHEN coach_tips.kind='' THEN excluded.kind ELSE coach_tips.kind END, cls=CASE WHEN coach_tips.cls='' THEN excluded.cls ELSE coach_tips.cls END`
    ).bind(acc.id, game, trackId, carId, sid, started, n, apex, kind, cls, up, Date.now()).run();
    return json({ ok: true });
  }

  // what the apps read to order the plan: the weight of every bucket (1 until it has MIN_CASES cases), the metres a braking
  // tip should ask for, the tips an admin turned off, and whether a tip may say how many drivers it helped
  if (p === "/coach/weights" && m === "GET") {
    const { buckets: b } = await buckets(env);
    return json({ min: MIN_CASES, buckets: b.filter((x) => x.w !== 1 || x.ask || x.n >= MIN_CASES), off: await offList(env), confidence: await confidenceOn(env) }, 200, { "cache-control": "private, max-age=3600" });
  }
  // the driver's own memory: the kinds that repeat across their tracks (habits), and their own buckets' weights
  if (p === "/coach/me" && m === "GET") {
    const h = await env.DB.prepare(
      `SELECT kind, COUNT(DISTINCT track_id||':'||car_id) AS tracks, COUNT(DISTINCT session_id) AS sessions, COUNT(*) AS n, SUM(outcome>?2) AS win, SUM(outcome<-?2) AS loss
         FROM coach_tips WHERE account=?1 AND kind<>'' GROUP BY kind ORDER BY tracks DESC, n DESC LIMIT 12`).bind(acc.id, GAIN_S).all();
    const habits = (h.results || []).filter((x) => x.tracks >= HABIT_TRACKS).map((x) => ({ kind: x.kind, tracks: x.tracks, sessions: x.sessions, n: x.n, win: x.win || 0, loss: x.loss || 0 }));
    const { buckets: mine } = await buckets(env, acc.id);
    const w = {};
    for (const x of mine) if (x.n >= MIN_PERSONAL && x.w !== 1) w[x.kind + "|" + x.cls] = x.w;
    return json({ habits, w, minTracks: HABIT_TRACKS }, 200, { "cache-control": "private, max-age=600" });
  }

  // the admin panel: a tip's kind on corners of one speed turned off (or back on), and whether the tips say how many drivers they helped
  if (p === "/admin/coach/off" && m === "POST") {
    if (!isAdmin(env, acc.id)) return err("only the admins of this server can do this", 403);
    const kind = KIND.test(body.kind || "") ? body.kind : "", cls = CLS[body.cls] ? body.cls : "";
    if (!kind || !cls) return err("kind and cls", 400);
    if (body.off) await env.DB.prepare("INSERT INTO coach_off (kind, cls, created) VALUES (?1,?2,?3) ON CONFLICT DO NOTHING").bind(kind, cls, Date.now()).run();
    else await env.DB.prepare("DELETE FROM coach_off WHERE kind=?1 AND cls=?2").bind(kind, cls).run();
    return json({ ok: true, off: await offList(env) });
  }
  if (p === "/admin/coach/confidence" && m === "POST") {
    if (!isAdmin(env, acc.id)) return err("only the admins of this server can do this", 403);
    await env.DB.prepare("INSERT INTO app_state (k, v, at) VALUES ('coach_confidence', ?1, ?2) ON CONFLICT(k) DO UPDATE SET v=excluded.v, at=excluded.at").bind(body.on ? "1" : "0", Date.now()).run();
    return json({ ok: true, confidence: !!body.on });
  }
  // the admin panel: every bucket with its cases, how many gained, the average gain and the thumbs
  if (p === "/admin/coach" && m === "GET") {
    if (!isAdmin(env, acc.id)) return err("only the admins of this server can do this", 403);
    const { buckets: b, ratings } = await buckets(env);
    const tot = await env.DB.prepare(
      `SELECT COUNT(*) AS tips, SUM(kind<>'') AS withTip, SUM(outcome IS NOT NULL) AS scored, SUM(rating<>0) AS rated, COUNT(DISTINCT account) AS drivers,
         COUNT(DISTINCT track_id||':'||car_id) AS combos, SUM(created>?1) AS week FROM coach_tips`).bind(Date.now() - 7 * 86400e3).first();
    const kinds = await env.DB.prepare("SELECT kind, COUNT(*) AS n, SUM(outcome IS NOT NULL) AS scored FROM coach_tips WHERE kind<>'' GROUP BY kind ORDER BY n DESC").all();
    return json({ min: MIN_CASES, gain: GAIN_S, totals: tot || {}, buckets: b, ratings, kinds: kinds.results || [], off: await offList(env), confidence: await confidenceOn(env) });
  }
  return null;
}
