// The tracks' layouts and their official number of turns.
//
// The number of turns comes from the game (iRacing's WeekendInfo.TrackNumTurns), sent by Pitlane HQ Agent for every track
// it sees: a session, a layout it shares, the .ibt files on the PC (track_info, migration 0074). The automatic turns
// (/community/turns, trackgeo.js) are fitted to it until an admin places the official ones.
//
// The layouts drawn by dead reckoning (no geo) are rebuilt from a lap of the same game and track whose path came from the
// game's own position (Trace.g): the same rule as POST /trackmaps (a layout from the game's position replaces one by dead
// reckoning whatever the lap time). A few tracks a run, from the ten-minute job until every one was looked at (app_state
// "trackmaps_rebuild", looked at again once a day), and all of them at once from the admin page.
import { openData } from "./crypt.js";

const STATE = "trackmaps_rebuild";
const PER_RUN = 3;   // tracks looked at per ten-minute run
const PER_TRACK = 6; // laps opened per track at most (the fastest first)

// a track's official number of turns (0: not known)
export async function turnCount(env, game, trackId) {
  const r = await env.DB.prepare("SELECT nturns FROM track_info WHERE game=?1 AND track_id=?2").bind(game, trackId).first().catch(() => null);
  return r && r.nturns > 0 ? r.nturns : 0;
}

// what the agent says of a track: kept when it is new or different (one write at most)
export async function noteTurnCount(env, game, trackId, track, nturns) {
  const n = Number(nturns);
  if (!trackId || !Number.isInteger(n) || n < 1 || n > 60) return false;
  const old = await env.DB.prepare("SELECT nturns, track FROM track_info WHERE game=?1 AND track_id=?2").bind(game, trackId).first().catch(() => null);
  if (old && old.nturns === n && (old.track || "") === (track || old.track || "")) return false;
  await env.DB.prepare(`INSERT INTO track_info (game, track_id, track, nturns, updated) VALUES (?1,?2,?3,?4,?5)
     ON CONFLICT(game, track_id) DO UPDATE SET nturns=excluded.nturns, track=COALESCE(excluded.track, track_info.track), updated=excluded.updated`)
    .bind(game, trackId, track ? String(track).slice(0, 120) : null, n, Date.now()).run();
  return true;
}

// the path of a stored lap when it comes from the game's position: {x, y, g} rounded as a layout keeps them, else null
export function geoPath(tr) {
  if (!tr || !Array.isArray(tr.g) || tr.g.length !== 2 || !tr.g.every((v) => typeof v === "number" && isFinite(v))) return null;
  const x = tr.x, y = tr.y;
  if (!Array.isArray(x) || !Array.isArray(y) || x.length !== y.length || x.length < 100 || x.length > 3000) return null;
  const ok = (v) => typeof v === "number" && isFinite(v) && Math.abs(v) < 30000;
  if (!x.every(ok) || !y.every(ok)) return null;
  const r1 = (v) => Math.round(v * 10) / 10;
  return { x: x.map(r1), y: y.map(r1), g: tr.g.map((v) => Math.round(v * 1e5) / 1e5) };
}

// one run: the layouts without geo not looked at yet (all of them when all is set) take the fastest valid lap of their
// game and track with a path from the game's position. Answers {checked, rebuilt, left, done}.
export async function rebuildTrackMaps(env, { all = false } = {}) {
  const st = await env.DB.prepare("SELECT v FROM app_state WHERE k=?1").bind(STATE).first().catch(() => null);
  let state = { done: false, seen: [] };
  try { if (st && st.v) state = { done: false, seen: [], ...JSON.parse(st.v) }; } catch (e) { /* starts again */ }
  // looked at again once a day: a lap with the game's position may have come since (the PCs' .ibt files too)
  if (all || (state.done && Date.now() - (state.at || 0) > 86400e3)) state = { done: false, seen: [] };
  if (state.done) return { checked: 0, rebuilt: 0, left: 0, done: true };
  const rows = (await env.DB.prepare("SELECT game, track_id, time FROM track_maps WHERE geo IS NULL").all()).results || [];
  const seen = new Set(state.seen), todo = rows.filter((r) => !seen.has(r.game + ":" + r.track_id));
  const now = todo.slice(0, all ? 40 : PER_RUN);
  let rebuilt = 0;
  for (const t of now) {
    seen.add(t.game + ":" + t.track_id);
    // the session's laps by its track (sessions_combo_ids), only the ones whose trace can hold the game's position
    const laps = (await env.DB.prepare(
      `SELECT a.trace, a.time FROM sessions s JOIN laps a ON a.session_id=s.id
       WHERE s.track_id=?1 AND s.game=?2 AND a.valid=1 AND a.trace IS NOT NULL AND (instr(a.trace,'"g":[')>0 OR substr(a.trace,1,4)='enc:')
         AND COALESCE(s.kind,'') NOT LIKE '%test%' ORDER BY a.time LIMIT ${PER_TRACK}`
    ).bind(t.track_id, t.game).all().catch(() => ({ results: [] }))).results || [];
    for (const l of laps) {
      let path = null;
      try { path = geoPath(JSON.parse(await openData(env, l.trace))); } catch (e) { path = null; }
      if (!path) continue;
      await env.DB.prepare("UPDATE track_maps SET n=?3, pts=?4, time=?5, geo=?6, created=?7 WHERE game=?1 AND track_id=?2 AND geo IS NULL")
        .bind(t.game, t.track_id, path.x.length, JSON.stringify({ x: path.x, y: path.y }), l.time, JSON.stringify(path.g), Date.now()).run();
      rebuilt++;
      break;
    }
  }
  const left = todo.length - now.length;
  state = { done: left <= 0, seen: [...seen].slice(-500), at: left <= 0 ? Date.now() : 0 };
  await env.DB.prepare("INSERT INTO app_state (k, v, at) VALUES (?1, ?2, ?3) ON CONFLICT(k) DO UPDATE SET v=excluded.v, at=excluded.at").bind(STATE, JSON.stringify(state), Date.now()).run();
  return { checked: now.length, rebuilt, left, done: state.done, withoutGeo: rows.length - rebuilt };
}
