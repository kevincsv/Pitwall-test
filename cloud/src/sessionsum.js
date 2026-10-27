// Home's four numbers (the laps and the hours on track this month, the races this month and the best result), the same
// on the PC, the web and the phones: counted here over every session of the account since `from`, never from a list
// the device happened to load (GET /api/sessions/summary)
//   from: ms, the device's local start of the month (else this month in tz)
//   tz:   the device's offset in minutes east of UTC (-Date.getTimezoneOffset()), for the days driven
//   game: iracing | lmu (none: every game)
// → { laps, secs, sessions, days, races, top5, best: {pos, field, cls, track, track_config, car, started} | null, from, at }

// a session's time is the sum of its laps' times; one without lap times counts its laps at its best's pace (as the page did)
const BASE = `SELECT started, kind, pos, field, pos_cls, track, track_config, car, laps, best,
    (SELECT SUM(l.time) FROM laps l WHERE l.session_id=sessions.id AND l.time>0 AND l.time<3600) AS secs,
    CASE WHEN LOWER(COALESCE(kind,'')) LIKE '%race%' THEN 1 ELSE 0 END AS race
  FROM sessions WHERE started>=?1 AND laps>0 AND (?2 IS NULL OR game=?2) AND (?3 IS NULL OR uploader=?3)`;

export const SUMMARY_SQL = `WITH s AS (${BASE})
  SELECT COUNT(*) AS sessions, COALESCE(SUM(laps),0) AS laps,
    COALESCE(SUM(CASE WHEN secs>0 THEN secs WHEN best>0 AND best<3600 THEN laps*best*1.03 ELSE 0 END),0) AS secs,
    COUNT(DISTINCT CAST((started+?4)/86400000 AS INTEGER)) AS days,
    COALESCE(SUM(race),0) AS races,
    COALESCE(SUM(CASE WHEN race=1 AND pos BETWEEN 1 AND 5 THEN 1 ELSE 0 END),0) AS top5
  FROM s`;
// the best race place: the lowest, the newest of a tie
export const BEST_SQL = `WITH s AS (${BASE}) SELECT pos, field, pos_cls, track, track_config, car, started FROM s
  WHERE race=1 AND pos>0 ORDER BY pos, started DESC LIMIT 1`;

const TZ_MAX = 14 * 60;

// the start of this month for a device tz minutes east of UTC
export function monthStart(now, tz) {
  const d = new Date(now + tz * 60000);
  return Date.UTC(d.getUTCFullYear(), d.getUTCMonth(), 1) - tz * 60000;
}

export async function sessionSummary(DB, { from, tz, game, uploader, now }) {
  now = now || Date.now();
  tz = Number.isFinite(+tz) ? Math.max(-TZ_MAX, Math.min(TZ_MAX, Math.round(+tz))) : 0;
  from = Number.isFinite(+from) && +from > 0 ? Math.round(+from) : monthStart(now, tz);
  const args = [from, game || null, uploader || null, tz * 60000];
  const [r, b] = await Promise.all([
    DB.prepare(SUMMARY_SQL).bind(...args).first(),
    DB.prepare(BEST_SQL).bind(...args.slice(0, 3)).first(),
  ]);
  const n = (v) => +v || 0;
  return {
    laps: n(r && r.laps), secs: Math.round(n(r && r.secs)), sessions: n(r && r.sessions), days: n(r && r.days),
    races: n(r && r.races), top5: n(r && r.top5),
    best: b ? { pos: b.pos, field: b.field || null, cls: b.pos_cls === 1, track: b.track, track_config: b.track_config || null, car: b.car, started: b.started } : null,
    from, at: now,
  };
}
