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

// the weight of a bucket: 1 while it has fewer than MIN_CASES cases, else 0.8 + 0.4 × the share of drivers who gained
// there next time (0.7 to 1.3), and 15 % less when the drivers mostly gave the kind a thumbs down
export function weightOf(b, rt) {
  let w = 1;
  if (b.n >= MIN_CASES) w = Math.min(1.3, Math.max(0.7, 0.8 + 0.4 * (b.win / b.n)));
  if (rt && rt.up + rt.down >= MIN_RATINGS && rt.down > 0.6 * (rt.up + rt.down)) w *= 0.85;
  return Math.round(Math.max(0.6, w) * 100) / 100;
}

async function buckets(env) {
  const b = await env.DB.prepare(
    `SELECT kind, cls, COUNT(*) AS n, SUM(outcome>?1) AS win, SUM(outcome<-?1) AS loss, AVG(outcome) AS avg
       FROM coach_tips WHERE outcome IS NOT NULL AND kind<>'' GROUP BY kind, cls`).bind(GAIN_S).all();
  const t = await env.DB.prepare("SELECT kind, SUM(rating=1) AS up, SUM(rating=-1) AS down FROM coach_tips WHERE rating<>0 AND kind<>'' GROUP BY kind").all();
  const ratings = {};
  for (const x of t.results || []) ratings[x.kind] = { up: x.up || 0, down: x.down || 0 };
  const out = (b.results || []).map((x) => ({ kind: x.kind, cls: x.cls || "", n: x.n, win: x.win || 0, loss: x.loss || 0, avg: r3(x.avg || 0), w: weightOf(x, ratings[x.kind]) }));
  // a kind whose thumbs are down also weighs less on corners where it has no scored case yet
  for (const [kind, rt] of Object.entries(ratings)) for (const cls of Object.keys(CLS)) if (!out.some((x) => x.kind === kind && x.cls === cls)) { const w = weightOf({ n: 0, win: 0 }, rt); if (w !== 1) out.push({ kind, cls, n: 0, win: 0, loss: 0, avg: 0, w }); }
  return { buckets: out, ratings };
}

export async function coachTipRoutes(req, env, p, m, body, game) {
  if (!p.startsWith("/coach/") && p !== "/admin/coach") return null;
  const acc = await sessionAccount(req, env);
  if (!acc) return err("sign in with your Pitlane HQ account", 401);

  // the tips of one lap, with the corner times of the session's best lap; then the tips of this driver's earlier
  // sessions here get their outcome from this one
  if (p === "/coach/tips" && m === "POST") {
    const trackId = int(body.trackId), carId = int(body.carId) && (await famId(env, game, body.carId)), sid = str(body.sid, 120), started = int(body.started);
    const ref = REF[body.ref] ? body.ref : "own";
    if (!trackId || !carId || !sid || !started || !Array.isArray(body.corners)) return err("trackId, carId, sid, started and corners", 400);
    const now = Date.now(), rows = [];
    for (const c of body.corners.slice(0, 40)) {
      const n = int(c.n), apex = num(c.apex);
      if (!n || apex == null) continue;
      const kind = KIND.test(c.kind || "") ? c.kind : "";
      rows.push({ n, d: num(c.d), apex, kind, cls: CLS[c.cls] ? c.cls : "", lost: num(c.lost), ta: num(c.ta), tb: num(c.tb), tbest: num(c.tbest) });
    }
    if (!rows.length) return json({ ok: true, kept: 0, scored: 0 });
    const ins = env.DB.prepare(
      `INSERT INTO coach_tips (account, game, track_id, car_id, session_id, started, n, d, apex, kind, cls, ref, lost, ta, tb, tbest, created)
       VALUES (?1,?2,?3,?4,?5,?6,?7,?8,?9,?10,?11,?12,?13,?14,?15,?16,?17)
       ON CONFLICT(account, session_id, n) DO UPDATE SET d=excluded.d, apex=excluded.apex, kind=excluded.kind, cls=excluded.cls, ref=excluded.ref,
         lost=excluded.lost, ta=excluded.ta, tb=excluded.tb, tbest=COALESCE(excluded.tbest, coach_tips.tbest), created=excluded.created`);
    await env.DB.batch(rows.map((c) => ins.bind(acc.id, game, trackId, carId, sid, started, c.n, c.d, c.apex, c.kind, c.cls, ref, c.lost, c.ta, c.tb, c.tbest, now)));
    // the earlier sessions of this driver here whose tips have no outcome yet: the same corner (by its slowest point) in
    // this session's best lap says what came of them
    const old = await env.DB.prepare(
      `SELECT id, apex, tbest FROM coach_tips WHERE account=?1 AND game=?2 AND track_id=?3 AND car_id=?4 AND started<?5 AND session_id<>?6
         AND outcome IS NULL AND kind<>'' AND tbest IS NOT NULL ORDER BY started DESC LIMIT 200`).bind(acc.id, game, trackId, carId, started, sid).all();
    const upd = [];
    for (const o of old.results || []) {
      let best = null;
      for (const c of rows) if (c.tbest != null && Math.abs(c.apex - o.apex) <= SAME_CORNER_M && (!best || Math.abs(c.apex - o.apex) < Math.abs(best.apex - o.apex))) best = c;
      if (best) upd.push(env.DB.prepare("UPDATE coach_tips SET outcome=?2, outcome_at=?3 WHERE id=?1").bind(o.id, r3(o.tbest - best.tbest), now));
    }
    // and the other way round: when the driver opens an older session after a newer one here, the newer one's best lap
    // (the nearest later session the coach saw) answers these tips now
    const later = await env.DB.prepare(
      `SELECT session_id FROM coach_tips WHERE account=?1 AND game=?2 AND track_id=?3 AND car_id=?4 AND started>?5 AND tbest IS NOT NULL ORDER BY started LIMIT 1`).bind(acc.id, game, trackId, carId, started).first();
    if (later) {
      const nx = await env.DB.prepare("SELECT apex, tbest FROM coach_tips WHERE account=?1 AND session_id=?2 AND tbest IS NOT NULL").bind(acc.id, later.session_id).all();
      for (const c of rows) {
        if (!c.kind || c.tbest == null) continue;
        let best = null;
        for (const o of nx.results || []) if (Math.abs(c.apex - o.apex) <= SAME_CORNER_M && (!best || Math.abs(o.apex - c.apex) < Math.abs(best.apex - c.apex))) best = o;
        if (best) upd.push(env.DB.prepare("UPDATE coach_tips SET outcome=?3, outcome_at=?4 WHERE account=?1 AND session_id=?2 AND n=?5 AND outcome IS NULL").bind(acc.id, sid, r3(c.tbest - best.tbest), now, c.n));
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

  // what the apps read to order the plan: the weight of every bucket (1 until it has MIN_CASES cases)
  if (p === "/coach/weights" && m === "GET") {
    const { buckets: b } = await buckets(env);
    return json({ min: MIN_CASES, buckets: b.filter((x) => x.w !== 1) }, 200, { "cache-control": "private, max-age=3600" });
  }

  // the admin panel: every bucket with its cases, how many gained, the average gain and the thumbs
  if (p === "/admin/coach" && m === "GET") {
    if (!isAdmin(env, acc.id)) return err("only the admins of this server can do this", 403);
    const { buckets: b, ratings } = await buckets(env);
    const tot = await env.DB.prepare(
      `SELECT COUNT(*) AS tips, SUM(kind<>'') AS withTip, SUM(outcome IS NOT NULL) AS scored, SUM(rating<>0) AS rated, COUNT(DISTINCT account) AS drivers,
         COUNT(DISTINCT track_id||':'||car_id) AS combos, SUM(created>?1) AS week FROM coach_tips`).bind(Date.now() - 7 * 86400e3).first();
    const kinds = await env.DB.prepare("SELECT kind, COUNT(*) AS n, SUM(outcome IS NOT NULL) AS scored FROM coach_tips WHERE kind<>'' GROUP BY kind ORDER BY n DESC").all();
    return json({ min: MIN_CASES, gain: GAIN_S, totals: tot || {}, buckets: b, ratings, kinds: kinds.results || [] });
  }
  return null;
}
