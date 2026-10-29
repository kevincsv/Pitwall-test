// node cloud/test/trackmaps.test.mjs: the track maps drawn by dead reckoning are rebuilt from a stored lap with the
// game's own position, and the official number of turns is kept per track.
import assert from "node:assert/strict";
import { geoPath, rebuildTrackMaps, noteTurnCount, turnCount } from "../src/trackmaps.js";

const ring = (n, g) => ({ bin: 5, d: [], x: Array.from({ length: n }, (_, i) => 300 * Math.cos((2 * Math.PI * i) / n)), y: Array.from({ length: n }, (_, i) => 300 * Math.sin((2 * Math.PI * i) / n)), ...(g ? { g } : {}) });
assert.equal(geoPath(ring(400)), null, "a dead-reckoning path is no exact layout");
assert.equal(geoPath(ring(50, [50, 6])), null, "too short");
const gp = geoPath(ring(400, [50.123456, 6.987654]));
assert.equal(gp.x.length, 400);
assert.deepEqual(gp.g, [50.12346, 6.98765]);

// a small D1 stand-in: the statements trackmaps.js runs
function fakeDB() {
  const st = { app: {}, maps: { "iracing:1": { geo: null }, "iracing:2": { geo: null }, "iracing:3": { geo: "[1,2]" } }, info: {}, writes: 0 };
  const laps = { 1: [{ trace: JSON.stringify(ring(400)), time: 80 }, { trace: JSON.stringify(ring(420, [40, -3])), time: 81 }], 2: [] };
  const q = (sql, args) => ({
    first: async () => {
      if (sql.includes("FROM app_state")) return st.app[args[0]] ? { v: st.app[args[0]] } : null;
      if (sql.includes("FROM track_info")) return st.info[args[0] + ":" + args[1]] || null;
      return null;
    },
    all: async () => {
      if (sql.includes("FROM track_maps WHERE geo IS NULL")) return { results: Object.entries(st.maps).filter(([, m]) => !m.geo).map(([k]) => ({ game: k.split(":")[0], track_id: +k.split(":")[1], time: 90 })) };
      if (sql.includes("FROM sessions s JOIN laps a")) { st.reads = (st.reads || 0) + 1; return { results: laps[args[0]] || [] }; }
      return { results: [] };
    },
    run: async () => {
      st.writes++;
      if (sql.startsWith("UPDATE track_maps")) st.maps[args[0] + ":" + args[1]] = { geo: args[5], n: args[2] };
      if (sql.includes("INSERT INTO app_state")) st.app[args[0]] = args[1];
      if (sql.includes("INSERT INTO track_info")) st.info[args[0] + ":" + args[1]] = { nturns: args[3], track: args[2] };
      return { meta: { changes: 1 } };
    },
  });
  return { st, DB: { prepare: (sql) => ({ bind: (...a) => q(sql, a), ...q(sql, []) }) } };
}
{
  const env = fakeDB();
  const r = await rebuildTrackMaps(env);
  assert.equal(r.checked, 2);
  assert.equal(r.rebuilt, 1, "track 1 has a lap with the game's position, track 2 none");
  assert.equal(env.st.maps["iracing:1"].n, 420);
  assert.equal(env.st.maps["iracing:1"].geo, "[40,-3]");
  assert.ok(env.st.maps["iracing:2"].geo == null);
  const again = await rebuildTrackMaps(env);
  assert.equal(again.done, true, "nothing left to look at until tomorrow");
  assert.equal(again.checked, 0);
  const all = await rebuildTrackMaps(env, { all: true });
  assert.equal(all.checked, 1, "the admin's button looks at every map without geo again");
}
{
  const env = fakeDB();
  assert.equal(await turnCount(env, "iracing", 7), 0);
  assert.equal(await noteTurnCount(env, "iracing", 7, "Spa", 19), true);
  assert.equal(await turnCount(env, "iracing", 7), 19);
  assert.equal(await noteTurnCount(env, "iracing", 7, "Spa", 19), false, "the same count is not written again");
  assert.equal(await noteTurnCount(env, "iracing", 7, "Spa", 0), false);
  assert.equal(await noteTurnCount(env, "iracing", 7, "Spa", 99), false);
}
console.log("trackmaps ok");
