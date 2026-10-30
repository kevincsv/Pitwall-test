// node cloud/test/driver-links.test.mjs: an account's own driver is linked per game (migration 0067, driverlinks.js,
// /link-driver and the admin's unlink-driver in community.js). Runs migrations 0030 and 0067 and the server's own
// linkDriver/unlinkDriver (with the model's moveDriver) on an in-memory SQLite behind a small D1-like wrapper.
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { DatabaseSync } from "node:sqlite";
import { linkDriver, unlinkDriver, LINK_DAYS } from "../src/driverlinks.js";

const mig = (n) => readFileSync(new URL(`../migrations/${n}`, import.meta.url), "utf8");
const db = new DatabaseSync(":memory:");
// D1's prepare/bind/first/all/run/batch over node:sqlite (a batch is one transaction, as on D1)
const stmt = (sql) => {
  const s = { args: [], bind(...a) { s.args = a; return s; },
    first: async () => db.prepare(sql).get(...s.args) ?? null,
    all: async () => ({ results: db.prepare(sql).all(...s.args).map((x) => ({ ...x })) }),
    run: async () => { const r = db.prepare(sql).run(...s.args); return { meta: { changes: r.changes } }; } };
  return s;
};
const env = { DB: { prepare: stmt, batch: async (qs) => { db.exec("BEGIN"); try { const out = []; for (const q of qs) out.push(await q.run()); db.exec("COMMIT"); return out; } catch (e) { db.exec("ROLLBACK"); throw e; } } } };
const marked = [];
const deps = (day) => ({ now: Date.UTC(2026, 9, day, 12), markModel: async (_e, g, t, c) => { marked.push(g + "|" + t + "|" + c); } });

db.exec(`CREATE TABLE accounts (id TEXT PRIMARY KEY, anon INTEGER NOT NULL DEFAULT 0, name_kind TEXT NOT NULL DEFAULT 'nick');
  CREATE TABLE community_users (id TEXT PRIMARY KEY, token_hash TEXT NOT NULL UNIQUE, alias TEXT NOT NULL, created INTEGER NOT NULL, owner TEXT);
  CREATE TABLE community_laps (id TEXT PRIMARY KEY, user_id TEXT NOT NULL, car_id INTEGER NOT NULL, car TEXT, track_id INTEGER NOT NULL, track TEXT,
    time REAL NOT NULL, sectors TEXT, trace TEXT, created INTEGER NOT NULL, anon INTEGER NOT NULL DEFAULT 0, game TEXT NOT NULL DEFAULT 'iracing', shown TEXT,
    UNIQUE(user_id, car_id, track_id));
  CREATE TABLE model_laps (game TEXT NOT NULL, track_id INTEGER NOT NULL, car_id INTEGER NOT NULL, k TEXT NOT NULL, drv TEXT NOT NULL, time REAL NOT NULL,
    data BLOB NOT NULL, created INTEGER NOT NULL, PRIMARY KEY (game, track_id, car_id, k));`);

// the migration: the links of before are iRacing's
db.exec(mig("0030_driver_links.sql"));
db.prepare("INSERT INTO driver_links (oid, account_id, created) VALUES (?,?,?)").run("o:ir1", "acc1", 1);
db.exec(mig("0067_driver_links_game.sql"));
assert.deepEqual(db.prepare("SELECT game, oid, account_id FROM driver_links").all().map((x) => ({ ...x })), [{ game: "iracing", oid: "o:ir1", account_id: "acc1" }], "the links of before are iRacing's");
const add = (game, oid, acc) => db.prepare("INSERT INTO driver_links (game, oid, account_id, created) VALUES (?,?,?,?)").run(game, oid, acc, 3);
assert.throws(() => add("iracing", "o:ir3", "acc1"), /UNIQUE/, "one iRacing driver per account");

for (const id of ["acc1", "acc2", "acc3"]) db.prepare("INSERT INTO accounts (id) VALUES (?)").run(id);
const rival = (oid, alias) => db.prepare("INSERT INTO community_users (id, token_hash, alias, created, owner) VALUES (?,?,?,1,'accX')").run(oid, "other:" + oid, alias);
const lap = (id, uid, game, track, car, time, trace = "t") => db.prepare("INSERT INTO community_laps (id, user_id, car_id, track_id, time, trace, created, game, shown) VALUES (?,?,?,?,?,?,1,?,'nick')").run(id, uid, car, track, time, trace, game);
const lapsOf = (uid) => db.prepare("SELECT id, game, track_id AS t, time FROM community_laps WHERE user_id=? ORDER BY id").all(uid).map((x) => ({ ...x }));

// iRacing: the id is the driver's own, the link is at once, its laps move and the rival goes
rival("o:ir2", "Juan Pablo Montoya");
lap("i1", "o:ir2", "iracing", 1, 10, 90.5);
lap("i2", "acc2", "iracing", 1, 10, 91.0); // the account's own slower lap of the same car and track
lap("i3", "o:ir2", "iracing", 2, 10, 80.0);
lap("x1", "o:ir2", "lmu", 7, 10, 70.0); // the same rival key in another game stays theirs
let r = await linkDriver(env, "acc2", "o:ir2", "iracing", deps(1));
assert.deepEqual(r, { linked: true, moved: 2 }, "iRacing links at once");
assert.deepEqual(lapsOf("acc2").map((x) => x.id), ["i1", "i3"], "the rival's faster lap replaces the account's, the other one is taken");
assert.deepEqual(lapsOf("o:ir2").map((x) => x.id), ["x1"], "their laps of another game stay theirs");
assert.ok(db.prepare("SELECT 1 FROM community_users WHERE id='o:ir2'").get(), "the rival stays while they have laps of another game");
assert.equal(db.prepare("SELECT COUNT(*) AS n FROM driver_link_moves").get().n, 0, "iRacing keeps no record of what moved");
assert.deepEqual(await linkDriver(env, "acc2", "o:ir2", "iracing", deps(1)), { linked: true, moved: 0 }, "asked again, nothing to do");
assert.equal((await linkDriver(env, "acc3", "o:ir2", "iracing", deps(1))).status, 409, "one account per iRacing driver");

// Le Mans Ultimate: a name anyone can type, so the account's own PC has to see it at the wheel on LINK_DAYS days
rival("o:ana", "Ana García");
lap("a1", "o:ana", "lmu", 5, 20, 100.0, "ana-fast");
lap("a2", "o:ana", "lmu", 6, 20, 120.0, "ana-slow");
lap("m1", "acc3", "lmu", 5, 20, 101.0, "mine-slow");
lap("m2", "acc3", "lmu", 6, 20, 119.0, "mine-fast");
r = await linkDriver(env, "acc3", "o:ana", "lmu", deps(1));
assert.deepEqual(r, { linked: false, days: 1, need: LINK_DAYS }, "the first day is not enough");
r = await linkDriver(env, "acc3", "o:ana", "lmu", deps(1));
assert.equal(r.days, 1, "the same day counts once");
await linkDriver(env, "acc3", "o:ana", "lmu", deps(2));
assert.deepEqual(lapsOf("o:ana").map((x) => x.id), ["a1", "a2"], "nothing moves before the link");
assert.equal(db.prepare("SELECT COUNT(*) AS n FROM driver_links WHERE game='lmu'").get().n, 0);
// what the model learnt of the rival
const sha = async (t) => [...new Uint8Array(await crypto.subtle.digest("SHA-256", new TextEncoder().encode(t)))].map((x) => x.toString(16).padStart(2, "0")).join("").slice(0, 24);
db.prepare("INSERT INTO model_laps (game, track_id, car_id, k, drv, time, data, created) VALUES ('lmu',5,20,?,?,100.0,'x',1)").run(await sha("acct:o:ana:100.000"), await sha("drv:acct:o:ana"));
const learnt = () => db.prepare("SELECT drv, k FROM model_laps WHERE game='lmu' AND track_id=5").get();
marked.length = 0;
r = await linkDriver(env, "acc3", "o:ana", "lmu", deps(3));
assert.deepEqual(r, { linked: true, moved: 2 }, "linked on the third day");
assert.deepEqual(lapsOf("acc3").map((x) => x.id), ["a1", "m2"], "per car and track the faster lap stays");
assert.equal(db.prepare("SELECT 1 FROM community_users WHERE id='o:ana'").get(), undefined, "the rival with nothing left goes");
assert.deepEqual(marked.sort(), ["lmu|5|20", "lmu|6|20"], "the models of the moved laps learn again");
assert.deepEqual({ ...learnt() }, { drv: await sha("drv:acct:acc3"), k: await sha("acct:acc3:100.000") }, "the model's memory of the rival is the account's");
assert.equal((await linkDriver(env, "acc1", "o:ana", "lmu", deps(4))).status, 409, "one account per LMU driver");
assert.equal((await linkDriver(env, "acc3", "o:other", "lmu", deps(4))).status, 409, "one LMU driver per account");
// the iRacing link of an account never stands in the way of its LMU one
assert.equal((await linkDriver(env, "acc1", "o:lmu9", "lmu", deps(4))).linked, false, "acc1 (linked in iRacing) may start its LMU link");

// the rival's laps shared after the link go to the account (community.js's /laps reads driver_links by game)
assert.equal(db.prepare("SELECT account_id FROM driver_links WHERE oid='o:ana' AND game='lmu'").get().account_id, "acc3");
assert.equal(db.prepare("SELECT account_id FROM driver_links WHERE oid='o:ana' AND game='iracing'").get(), undefined, "never under another game");

// the account improves on one combo after the link: its own lap takes the place of the one the link took
db.prepare("UPDATE community_laps SET time=99.0, trace='mine-new' WHERE id='a1'").run();

// the admin's undo of the LMU link gives the rival their laps back and the link never comes back by itself
marked.length = 0;
r = await unlinkDriver(env, "acc3", "lmu", deps(5));
assert.equal(r.unlinked, 1);
const ana = db.prepare("SELECT track_id AS t, time, trace FROM community_laps WHERE user_id='o:ana' ORDER BY track_id").all().map((x) => ({ ...x }));
assert.deepEqual(ana, [{ t: 5, time: 100.0, trace: "ana-fast" }, { t: 6, time: 120.0, trace: "ana-slow" }], "both of the rival's laps are theirs again");
const mine = db.prepare("SELECT track_id AS t, time, trace FROM community_laps WHERE user_id='acc3' ORDER BY track_id").all().map((x) => ({ ...x }));
assert.deepEqual(mine, [{ t: 5, time: 99.0, trace: "mine-new" }, { t: 6, time: 119.0, trace: "mine-fast" }], "the account keeps its own laps, the newer one too");
assert.equal(db.prepare("SELECT alias FROM community_users WHERE id='o:ana'").get().alias, "Anonymous", "the rival is back, as Anonymous (never by their name)");
assert.ok(db.prepare("SELECT anon FROM community_laps WHERE user_id='o:ana'").all().every((x) => x.anon === 1), "their laps show as Anonymous");
assert.deepEqual({ ...learnt() }, { drv: await sha("drv:acct:o:ana"), k: await sha("acct:o:ana:100.000") }, "and so is the model's memory of them");
assert.equal(db.prepare("SELECT COUNT(*) AS n FROM driver_links WHERE account_id='acc3'").get().n, 0);
assert.equal(db.prepare("SELECT COUNT(*) AS n FROM driver_link_moves WHERE account_id='acc3'").get().n, 0, "the record of what moved goes");
assert.deepEqual(await linkDriver(env, "acc3", "o:ana", "lmu", deps(9)), { linked: false, undone: true }, "an undone LMU link never comes back by itself");

// an admin's undo without a game: every game's link of the account; iRacing's laps stay where they are, as before
r = await unlinkDriver(env, "acc2", null, deps(5));
assert.equal(r.unlinked, 1);
assert.equal(db.prepare("SELECT COUNT(*) AS n FROM driver_links WHERE account_id='acc2'").get().n, 0);
assert.deepEqual(lapsOf("acc2").map((x) => x.id), ["i1", "i3"], "the iRacing laps stay in the account");
assert.deepEqual(await linkDriver(env, "acc2", "o:ir2", "iracing", deps(6)), { linked: true, moved: 0 }, "an iRacing link may come back (its id is the driver's own)");

console.log("ok");
