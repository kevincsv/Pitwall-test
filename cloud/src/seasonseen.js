// The real start of official iRacing races, reported by the PCs that drove them (raceWatcher → seenStart in the
// agent), so the planner can check and correct the season's race times without iRacing's data API. Each race once
// (by subsession); the planner gets each season's start minutes of the last eight days and how many PCs saw each.

const MIN = 60e3, DAY = 864e5;
export const SEEN_DAYS = 8, SEEN_PER_DAY = 60;

const name = (v) => (typeof v === "string" ? v.trim().slice(0, 80) : "");
const id = (v) => (Number.isInteger(v) && v > 0 && v < 2 ** 31 ? v : 0);

// recordSeen: one race start from one PC. A start is believed only near now (a race seen live) and to the minute.
export async function recordSeen(env, userId, body, now = Date.now()) {
  const sub = id(body.sub), season = id(body.season), series = id(body.series), track = id(body.track);
  const start = Math.round(Number(body.start) / MIN) * MIN;
  if (!sub || !season || !series || !track || !Number.isFinite(start)) return { error: "subsession, season, series, track and start are needed", status: 400 };
  if (start > now + 5 * MIN || start < now - 6 * 3600e3) return { error: "only a race seen now can be reported", status: 400 };
  const n = await env.DB.prepare("SELECT COUNT(*) AS n FROM season_seen WHERE user_id=?1 AND at>?2").bind(userId, now - DAY).first();
  if (n && n.n >= SEEN_PER_DAY) return { error: "too many race starts today", status: 429 };
  // the first PC of a race sets its start; the others of the same race add nothing (a race is one start)
  const r = await env.DB.prepare("INSERT INTO season_seen (sub, season_id, series_id, track_id, track_name, track_cfg, car, start, user_id, at) VALUES (?1,?2,?3,?4,?5,?6,?7,?8,?9,?10) ON CONFLICT(sub) DO NOTHING")
    .bind(sub, season, series, track, name(body.trackName), name(body.trackConfig), name(body.car), start, userId, now).run();
  return { ok: true, kept: !!(r.meta && r.meta.changes) };
}

// seenSummary: { season_id: [[start, races, track, config, car], …] } over the last eight days (the names as the sim
// shows them: a season imported from the schedule PDF has no iRacing ids, the planner matches it by them). Races of a season that started in the
// same minute are one time seen that many times (several splits of one slot, or PCs in different races).
export async function seenSummary(env, now = Date.now()) {
  const r = await env.DB.prepare("SELECT season_id AS s, start AS t, COUNT(*) AS n, MAX(track_name) AS tn, MAX(track_cfg) AS tc, MAX(car) AS c FROM season_seen WHERE start>?1 GROUP BY season_id, start ORDER BY season_id, start")
    .bind(now - SEEN_DAYS * DAY).all();
  const out = {};
  for (const x of r.results || []) (out[x.s] ||= []).push([x.t, x.n, x.tn || "", x.tc || "", x.c || ""]);
  return out;
}

// pruneSeen: starts older than a season are of no use to anyone
export async function pruneSeen(env, now = Date.now()) {
  await env.DB.prepare("DELETE FROM season_seen WHERE start<?1").bind(now - 120 * DAY).run();
}
