// node cloud/test/lmu-class.test.mjs: Le Mans Ultimate's class boards and the wet column (migration 0071, lmuclass.js).
// Runs the migration over laps of before and the class board's own query on an in-memory SQLite behind a small D1-like
// wrapper.
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { DatabaseSync } from "node:sqlite";
import { lmuClass, wetOf, clsParam, classLaps } from "../src/lmuclass.js";

const db = new DatabaseSync(":memory:");
const stmt = (sql) => {
  const s = { args: [], bind(...a) { s.args = a; return s; },
    first: async () => db.prepare(sql).get(...s.args) ?? null,
    all: async () => ({ results: db.prepare(sql).all(...s.args).map((x) => ({ ...x })) }),
    run: async () => { const r = db.prepare(sql).run(...s.args); return { meta: { changes: r.changes } }; } };
  return s;
};
const env = { DB: { prepare: stmt } };

// the class the game gives, whatever its spelling, else the car's name
assert.equal(lmuClass("Hyper", "Toyota GR010"), "Hypercar");
assert.equal(lmuClass("GT3", "BMW M4 LMGT3"), "LMGT3");
assert.equal(lmuClass("LMP2_ELMS", ""), "LMP2");
assert.equal(lmuClass("LMP3", ""), "LMP3");
assert.equal(lmuClass("GTE", ""), "LMGTE");
assert.equal(lmuClass("", "Porsche 911 GT3 R LMGT3"), "LMGT3");
assert.equal(lmuClass(null, "Ferrari 499P"), "Hypercar");
assert.equal(lmuClass(null, "Oreca 07 Gibson"), "LMP2");
assert.equal(lmuClass(null, "Ligier JS P325"), "LMP3");
assert.equal(lmuClass(null, "Porsche 911 RSR-19"), "LMGTE");
assert.equal(lmuClass(null, "Aston Martin Vantage AMR"), "LMGTE");
assert.equal(lmuClass(null, "Aston Martin Vantage AMR LMGT3"), "LMGT3");
assert.equal(lmuClass(null, "Isotta Fraschini Tipo6-C"), "Hypercar");
assert.equal(lmuClass(null, "Some new car"), null, "an unknown car has no class");
assert.equal(lmuClass("Fun<cup>!", "Some new car"), "Fun cup", "a class of its own, letters, digits and spaces only");
assert.equal(clsParam("LMGT3"), "LMGT3");
assert.equal(clsParam("x'; DROP"), null);
assert.equal(clsParam(""), null);

// the flags of a lap's trace as bits: 2 a wet track, 1 rain, both on one lap
assert.equal(wetOf(["traffic", "wet"]), 2);
assert.equal(wetOf(["rain", "cmp:1"]), 1);
assert.equal(wetOf(["wet", "rain"]), 3);
assert.equal(wetOf(["cold"]), null);
assert.equal(wetOf(undefined), null);

db.exec(`CREATE TABLE accounts (id TEXT PRIMARY KEY, anon INTEGER NOT NULL DEFAULT 0, supporter INTEGER, supporter_hidden INTEGER);
  CREATE TABLE community_users (id TEXT PRIMARY KEY, alias TEXT NOT NULL, iracing TEXT);
  CREATE TABLE community_laps (id TEXT PRIMARY KEY, user_id TEXT NOT NULL, car_id INTEGER NOT NULL, car TEXT, track_id INTEGER NOT NULL, track TEXT,
    time REAL NOT NULL, sectors TEXT, trace TEXT, created INTEGER NOT NULL, anon INTEGER NOT NULL DEFAULT 0, game TEXT NOT NULL DEFAULT 'iracing', shown TEXT, lic TEXT,
    UNIQUE(user_id, car_id, track_id));`);
for (const [id, alias] of [["a", "Ana"], ["b", "Bea"], ["c", "Carl"], ["o:d", "Dan"]]) db.prepare("INSERT INTO community_users (id, alias) VALUES (?,?)").run(id, alias);
db.prepare("INSERT INTO accounts (id) VALUES ('a')").run();
const lap = (id, uid, game, track, car, carName, time, shown = "nick") => db.prepare("INSERT INTO community_laps (id, user_id, car_id, car, track_id, track, time, created, game, shown) VALUES (?,?,?,?,?,'T',?,1,?,?)").run(id, uid, car, carName, track, time, game, shown);
lap("1", "a", "lmu", 5, 10, "BMW M4 LMGT3", 100.5);
lap("2", "a", "lmu", 5, 11, "Porsche 911 GT3 R LMGT3", 100.1); // Ana's faster GT3: her one row
lap("3", "b", "lmu", 5, 12, "Ferrari 296 LMGT3", 100.3);
lap("4", "c", "lmu", 5, 13, "Ferrari 499P", 90.0); // another class
lap("5", "o:d", "lmu", 5, 14, "McLaren 720S LMGT3 Evo", 99.9, "model"); // hidden: only the model's
lap("6", "o:d", "lmu", 6, 14, "McLaren 720S LMGT3 Evo", 101.0); // another track
lap("7", "c", "iracing", 5, 10, "BMW M4 GT3", 95.0); // iRacing has no class
lap("8", "b", "lmu", 5, 15, "Mystery Car", 98.0);
lap("9", "c", "lmu", 7, 16, "Aston Martin Vantage AMR", 98.0);
lap("10", "c", "lmu", 7, 17, "Isotta Fraschini Tipo6-C", 98.0);

db.exec(readFileSync(new URL("../migrations/0071_lmu_class_wet.sql", import.meta.url), "utf8"));
const cls = Object.fromEntries(db.prepare("SELECT id, cls FROM community_laps").all().map((x) => [x.id, x.cls]));
assert.deepEqual(cls, { 1: "LMGT3", 2: "LMGT3", 3: "LMGT3", 4: "Hypercar", 5: "LMGT3", 6: "LMGT3", 7: null, 8: null, 9: "LMGTE", 10: "Hypercar" }, "the laps of before take their class from the car");
assert.equal(db.prepare("SELECT COUNT(*) AS n FROM community_laps WHERE wet IS NOT NULL").get().n, 0, "the laps of before are dry");
// the migration's CASE and lmuClass agree on the laps of before
for (const r of db.prepare("SELECT car, cls FROM community_laps WHERE game='lmu'").all()) assert.equal(lmuClass(null, r.car), r.cls, r.car);
const plan = db.prepare("EXPLAIN QUERY PLAN SELECT * FROM community_laps WHERE game='lmu' AND track_id=5 AND cls='LMGT3' ORDER BY time").all().map((x) => x.detail).join(" ");
assert.match(plan, /community_laps_cls/, "the class board reads its index");

db.prepare("UPDATE community_laps SET wet=2 WHERE id='3'").run();
const rows = await classLaps(env, 5, "LMGT3");
assert.deepEqual(rows.map((x) => [x.alias, x.car, x.time]), [["Ana", "Porsche 911 GT3 R LMGT3", 100.1], ["Bea", "Ferrari 296 LMGT3", 100.3]], "one row per driver, the fastest first, with the car; a hidden lap and other tracks and classes stay out");
assert.equal(rows[1].wet, 2, "the board says the lap was wet");
assert.equal(rows[0].prof, 1, "an account's profile opens");
assert.deepEqual((await classLaps(env, 5, "Hypercar")).map((x) => x.alias), ["Carl"]);
console.log("lmu-class: ok");
