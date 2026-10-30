// node cloud/test/sessions-read-less.test.mjs: each session keeps its lap count, best, time on track and friends' names
// (SESSION_SUMS, migration 0078), and Home's numbers read only the account's sessions, with or without a game
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { DatabaseSync } from "node:sqlite";
import { sessionSummary, SESSION_SUMS, ALL_SESSION_SUMS, summarySql } from "../src/sessionsum.js";

const db = new DatabaseSync(":memory:");
db.exec(`CREATE TABLE sessions (id TEXT PRIMARY KEY, started INTEGER NOT NULL, track TEXT, track_config TEXT, car TEXT, kind TEXT,
  laps INTEGER DEFAULT 0, best REAL, uploader TEXT, game TEXT, pos INTEGER, field INTEGER, pos_cls INTEGER);
  CREATE INDEX sessions_uploader ON sessions(uploader);
  CREATE TABLE laps (id TEXT PRIMARY KEY, session_id TEXT, n INTEGER, time REAL, valid INTEGER, drv TEXT);`);
const stmt = (sql) => {
  const s = { args: [], bind(...a) { s.args = a; return s; },
    first: async () => db.prepare(sql).get(...s.args) ?? null,
    run: async () => db.prepare(sql).run(...s.args) };
  return s;
};
const DB = { prepare: stmt };
const now = Date.UTC(2026, 9, 30, 12), m0 = Date.UTC(2026, 9, 1);
db.prepare("INSERT INTO sessions (id, started, track, car, kind, uploader, game, pos, field) VALUES (?,?,?,?,?,?,?,?,?)").run("s1", now - 864e5, "Spa", "GT3", "Race", "acct:a", "iracing", 3, 20);
db.prepare("INSERT INTO sessions (id, started, track, car, kind, uploader, game) VALUES (?,?,?,?,?,?,?)").run("s2", now, "Spa", "GT3", "Practice", "acct:b", "iracing");
const lap = (id, sid, n, time, valid, drv = null) => db.prepare("INSERT INTO laps VALUES (?,?,?,?,?,?)").run(id, sid, n, time, valid, drv);
lap("l1", "s1", 1, 140, 1); lap("l2", "s1", 2, 138.5, 1); lap("l3", "s1", 3, 137, 0); lap("l4", "s1", 4, 136, 1, "Juan"); lap("l5", "s2", 1, 139, 1);
// the migration fills the old sessions, SESSION_SUMS keeps them
db.exec(readFileSync(new URL("../migrations/0078_sessions_read_less.sql", import.meta.url), "utf8"));
assert.deepEqual({ ...db.prepare("SELECT secs, drvs FROM sessions WHERE id='s1'").get() }, { secs: 551.5, drvs: "Juan" });
await stmt(SESSION_SUMS).bind("s1").run();
assert.deepEqual({ ...db.prepare("SELECT laps, best, secs, drvs FROM sessions WHERE id='s1'").get() }, { laps: 4, best: 138.5, secs: 551.5, drvs: "Juan" }, "a friend's lap and an invalid one are never the best");
await stmt(ALL_SESSION_SUMS).run();
assert.equal(db.prepare("SELECT laps FROM sessions WHERE id='s2'").get().laps, 1);
// the account's own sessions by its index, never every driver's of the month
assert.match(db.prepare("EXPLAIN QUERY PLAN " + summarySql("iracing", "acct:a")).all().map((x) => x.detail).join(" "), /sessions_uploader_started/);
for (const game of ["iracing", null]) {
  const s = await sessionSummary(DB, { from: m0, tz: 0, game, uploader: "acct:a", now });
  assert.equal(s.sessions, 1); assert.equal(s.laps, 4); assert.equal(s.secs, 552); assert.equal(s.races, 1); assert.equal(s.top5, 1);
  assert.deepEqual(s.best && s.best.pos, 3);
}
assert.equal((await sessionSummary(DB, { from: m0, tz: 0, game: null, uploader: null, now })).sessions, 2, "every session without an account");
console.log("sessions read less ok");
