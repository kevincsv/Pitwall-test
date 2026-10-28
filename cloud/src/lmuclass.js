// Le Mans Ultimate's classes (Hypercar, LMP2, LMP3, LMGTE, LMGT3): every class mixes many car models, so beside each car's
// leaderboard a track has one board per class (community_laps.cls, migration 0071, GET /laps?cls=). The PC sends the
// class the game gives the car (CarClassShortName: "Hyper", "GT3", "LMP2_ELMS"…); a lap without it takes its class from
// the car's name. One name per class, whatever the game's spelling. iRacing's laps have none.
const NAMED = [
  [/hyper/i, "Hypercar"],
  [/lmp\s*2/i, "LMP2"],
  [/lmp\s*3/i, "LMP3"],
  [/gte/i, "LMGTE"],
  [/gt3/i, "LMGT3"],
];
// the cars by their names (a lap whose PC did not send the class, and the laps from before): the same rules as the
// migration's CASE
const BY_CAR = [
  [/gt3/i, "LMGT3"],
  [/gte|rsr|c8\.r|vantage amr/i, "LMGTE"],
  [/499p|963|gr010|9x8|v-series\.r|m hybrid|a424|sc63|scg ?007|vanwall|vandervell|isotta|tipo ?6|valkyrie|hypercar|lmdh|lmh/i, "Hypercar"],
  [/oreca|lmp2/i, "LMP2"],
  [/ligier|ginetta|duqueine|lmp3/i, "LMP3"],
];
export function lmuClass(raw, car) {
  const r = String(raw || "").trim();
  for (const [re, n] of NAMED) if (re.test(r)) return n;
  const c = String(car || "");
  for (const [re, n] of BY_CAR) if (re.test(c)) return n;
  // a class the game names that is none of these: kept as it is, short letters, digits and spaces only
  const own = r.replace(/[^A-Za-z0-9 ]/g, " ").replace(/\s+/g, " ").trim().slice(0, 16);
  return own || null;
}
// how wet the track was on a lap, from its trace's flags: 2 wet, 1 damp, null dry (community_laps.wet)
export function wetOf(flags) {
  if (!Array.isArray(flags)) return null;
  return flags.includes("wet") ? 2 : flags.includes("damp") ? 1 : null;
}

// a class name asked for (GET /laps?cls=): only the letters, digits and spaces a class has
export const clsParam = (v) => {
  const s = String(v || "").trim();
  return /^[A-Za-z0-9 ]{1,16}$/.test(s) ? s : null;
};

// the class board of a track: each driver's best lap of any car of that class, one per driver, the fastest first, with
// its car (the per-car boards stay as they are: the coach and the reference laps are per car). opts.admin: an admin
// opens every account's profile; opts.acctTrace: the SQL that says the lap's telemetry is in its driver's account
export async function classLaps(env, trackId, cls, opts = {}) {
  const r = await env.DB.prepare(
    `WITH b AS (SELECT l.*, ROW_NUMBER() OVER (PARTITION BY l.user_id ORDER BY l.time) AS rk
         FROM community_laps l WHERE l.game='lmu' AND l.track_id=?1 AND l.cls=?2 AND COALESCE(l.shown,'')<>'model')
     SELECT l.id, l.user_id AS uid, CASE WHEN l.anon=1 THEN 'Anonymous' WHEN l.shown='iracing' AND COALESCE(u.iracing,'')<>'' THEN u.iracing ELSE u.alias END AS alias,
       l.time, l.sectors, l.created, (l.trace IS NOT NULL OR ${opts.acctTrace || "0"}) AS hasTrace, l.car, l.car_id AS carId, l.track, l.lic, l.wet, l.cls,
       (${opts.admin ? "ac.id IS NOT NULL OR " : ""}(l.anon=0 AND ac.id IS NOT NULL AND COALESCE(ac.anon,0)=0)) AS prof, (l.anon=0 AND COALESCE(ac.supporter,0)=1 AND COALESCE(ac.supporter_hidden,0)=0) AS sup
     FROM b l JOIN community_users u ON u.id=l.user_id LEFT JOIN accounts ac ON ac.id=l.user_id
     WHERE l.rk=1 ORDER BY l.time LIMIT 200`
  ).bind(trackId, cls).all();
  return r.results || [];
}
