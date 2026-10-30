// node cloud/test/season-seen.test.mjs: official race starts reported by the PCs (migration 0077, seasonseen.js):
// one start per race, only near now and to the minute, a daily limit per driver, and the planner's summary.
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { DatabaseSync } from "node:sqlite";
import { recordSeen, seenSummary, pruneSeen, SEEN_PER_DAY } from "../src/seasonseen.js";

const db = new DatabaseSync(":memory:");
db.exec(readFileSync(new URL("../migrations/0077_season_seen.sql", import.meta.url), "utf8"));
const stmt = (sql) => {
  const s = { args: [], bind(...a) { s.args = a; return s; },
    first: async () => db.prepare(sql).get(...s.args) ?? null,
    all: async () => ({ results: db.prepare(sql).all(...s.args).map((x) => ({ ...x })) }),
    run: async () => { const r = db.prepare(sql).run(...s.args); return { meta: { changes: r.changes } }; } };
  return s;
};
const env = { DB: { prepare: stmt } };
const now = Date.UTC(2026, 9, 30, 14, 20), slot = Date.UTC(2026, 9, 30, 14, 15);
const race = (sub, start = slot + 20e3) => ({ sub, season: 5101, series: 139, track: 166, start });

assert.deepEqual(await recordSeen(env, "a", race(1), now), { ok: true, kept: true });
assert.deepEqual(await recordSeen(env, "b", race(1, slot), now), { ok: true, kept: false }, "the same race once");
assert.equal((await recordSeen(env, "b", race(2, slot - 20e3), now)).kept, true, "another split of the slot");
assert.equal((await recordSeen(env, "a", race(3, now - 7 * 3600e3), now)).status, 400, "an old start is not believed");
assert.equal((await recordSeen(env, "a", { ...race(4), track: 0 }, now)).status, 400);
let s = await seenSummary(env, now);
assert.deepEqual(s, { 5101: [[slot, 2]] }, "both splits started in the same minute");
for (let i = 0; i < SEEN_PER_DAY; i++) await recordSeen(env, "c", race(100 + i), now);
assert.equal((await recordSeen(env, "c", race(999), now)).status, 429);
await pruneSeen(env, now + 200 * 864e5);
assert.deepEqual(await seenSummary(env, now), {});
console.log("season seen ok");
