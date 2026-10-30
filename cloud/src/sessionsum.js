// Home's four numbers (the laps and the hours on track this month, the races this month and the best result), the same
// on the PC, the web and the phones: counted here over every session of the account since `from`, never from a list
// the device happened to load (GET /api/sessions/summary)
//   from: ms, the device's local start of the month (else this month in tz)
//   tz:   the device's offset in minutes east of UTC (-Date.getTimezoneOffset()), for the days driven
//   game: iracing | lmu (none: every game)
// → { laps, secs, sessions, days, races, top5, best: {pos, field, cls, track, track_config, car, started} | null, from, at }

// a session's time is the sum of its laps' times (kept on the session, SESSION_SUMS in worker.js); one without lap times
// counts its laps at its best's pace (as the page did).
// The filters go into the SQL only when given (never "?2 IS NULL OR game=?2"), so an account's sessions of the month are
// read from its own index (sessions_uploader_started, migration 0078), not every driver's: every open app asks once a minute
function base(game, uploader, secs) {
  return `SELECT started, kind, pos, field, pos_cls, track, track_config, car, laps, best,
    ${secs ? "secs" : "NULL"} AS secs,
    CASE WHEN LOWER(COALESCE(kind,'')) LIKE '%race%' THEN 1 ELSE 0 END AS race
  FROM sessions WHERE ${uploader ? "uploader=?3 AND " : ""}started>=?1 AND laps>0${game ? " AND game=?2" : ""}`;
}

export const summarySql = (game, uploader) => `WITH s AS (${base(game, uploader, true)})
  SELECT COUNT(*) AS sessions, COALESCE(SUM(laps),0) AS laps,
    COALESCE(SUM(CASE WHEN secs>0 THEN secs WHEN best>0 AND best<3600 THEN laps*best*1.03 ELSE 0 END),0) AS secs,
    COUNT(DISTINCT CAST((started+?4)/86400000 AS INTEGER)) AS days,
    COALESCE(SUM(race),0) AS races,
    COALESCE(SUM(CASE WHEN race=1 AND pos BETWEEN 1 AND 5 THEN 1 ELSE 0 END),0) AS top5
  FROM s`;
// the best race place: the lowest, the newest of a tie (no lap is read for it)
export const bestSql = (game, uploader) => `WITH s AS (${base(game, uploader, false)}) SELECT pos, field, pos_cls, track, track_config, car, started FROM s
  WHERE race=1 AND pos>0 ORDER BY pos, started DESC LIMIT 1`;

// a session's lap count, its best (the account's own laps only: a friend's lap in DRINKS mode is never yours), its time
// on track and its friends' names, read from its laps in one pass and kept on the session (migration 0078): My sessions
// and Home's numbers (below), asked by every open app about once a minute, never read the laps (D1 limits the rows read per day)
const SUMS_OF = (sid) => `(SELECT COUNT(*), MIN(CASE WHEN valid=1 AND drv IS NULL THEN time END),
       SUM(CASE WHEN time>0 AND time<3600 THEN time END), group_concat(DISTINCT drv) FROM laps WHERE session_id=${sid})`;
export const SESSION_SUMS = `UPDATE sessions SET (laps, best, secs, drvs)=${SUMS_OF("?1")} WHERE id=?1`;
// every session again once a day: whatever changed its laps without SESSION_SUMS is right by the next morning
export const ALL_SESSION_SUMS = `UPDATE sessions SET (laps, best, secs, drvs)=${SUMS_OF("sessions.id")}`;

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
  game = game || null; uploader = uploader || null;
  // ?1 from, ?2 game, ?3 uploader, ?4 the offset: the ones the SQL leaves out are bound as null (a numbered parameter
  // that is not used is fine; the highest one used sets how many are bound)
  const args = [from, game, uploader, tz * 60000];
  const upTo = (n) => args.slice(0, n);
  const used = (sql) => upTo(Math.max(...[...sql.matchAll(/\?(\d)/g)].map((m) => +m[1])));
  const sq = summarySql(game, uploader), bq = bestSql(game, uploader);
  const [r, b] = await Promise.all([DB.prepare(sq).bind(...used(sq)).first(), DB.prepare(bq).bind(...used(bq)).first()]);
  const n = (v) => +v || 0;
  return {
    laps: n(r && r.laps), secs: Math.round(n(r && r.secs)), sessions: n(r && r.sessions), days: n(r && r.days),
    races: n(r && r.races), top5: n(r && r.top5),
    best: b ? { pos: b.pos, field: b.field || null, cls: b.pos_cls === 1, track: b.track, track_config: b.track_config || null, car: b.car, started: b.started } : null,
    from, at: now,
  };
}
