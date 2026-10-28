// node cloud/test/lap-valid-again.test.mjs: migration 0065 makes exactly the three clean laps valid again, sets their
// sessions' best and queues them for the reshare, keeping what was already queued. Runs it on an in-memory SQLite.
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { DatabaseSync } from "node:sqlite";

const mig = (n) => readFileSync(new URL(`../migrations/${n}`, import.meta.url), "utf8");
// 0065: exactly the three laps, their sessions' best and the reshare queue (with what was already queued)
const d2 = new DatabaseSync(":memory:");
d2.exec(`CREATE TABLE sessions (id TEXT PRIMARY KEY, best REAL);
  CREATE TABLE laps (id TEXT PRIMARY KEY, session_id TEXT, n INTEGER, time REAL, valid INTEGER, inc INTEGER, sectors TEXT, drv TEXT);
  CREATE TABLE app_state (k TEXT PRIMARY KEY, v TEXT, at INTEGER);`);
const A = "acct_95613aa4572fb73372e508aa:", s1 = A + "ir-89691109-0", s2 = A + "ir-89692599-2";
d2.prepare("INSERT INTO sessions VALUES (?,?)").run(s1, 60.394);
d2.prepare("INSERT INTO sessions VALUES (?,?)").run(s2, 59.209);
const lap = (sid, n, t, valid, inc, sec = "[21,21,17]") => d2.prepare("INSERT INTO laps VALUES (?,?,?,?,?,?,?,NULL)").run(sid + "-" + n, sid, n, t, valid, inc, sec);
lap(s1, 31, 60.394, 1, 0); lap(s1, 32, 60.201, 0, 0); lap(s1, 33, 64.115, 0, 2); lap(s1, 34, 59.753, 0, 0);
lap(s2, 6, 59.209, 1, 0); lap(s2, 7, 59.863, 0, 0); lap(s2, 8, 59.905, 1, 0);
d2.prepare("INSERT INTO app_state VALUES ('reshare', '[\"other\"]', 1)").run();
d2.exec(mig("0065_lap_best_read_late.sql"));
assert.deepEqual(d2.prepare("SELECT id FROM laps WHERE valid=1 ORDER BY id").all().map((x) => x.id.slice(A.length)).sort(),
  ["ir-89691109-0-31", "ir-89691109-0-32", "ir-89691109-0-34", "ir-89692599-2-6", "ir-89692599-2-7", "ir-89692599-2-8"].sort(), "the three laps are valid, the one with a Loss of Control is not");
assert.equal(d2.prepare("SELECT best FROM sessions WHERE id=?").get(s1).best, 59.753, "the session's best follows");
assert.equal(d2.prepare("SELECT best FROM sessions WHERE id=?").get(s2).best, 59.209, "a session whose best stays");
assert.deepEqual(JSON.parse(d2.prepare("SELECT v FROM app_state WHERE k='reshare'").get().v).sort(), [s1, s2, "other"].sort(), "both sessions queued for the reshare, the queue kept");
console.log("ok");
