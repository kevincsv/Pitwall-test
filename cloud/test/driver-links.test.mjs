// node cloud/test/driver-links.test.mjs: an account's own driver is linked per game (migration 0067, /link-driver in
// community.js). The links of before become iRacing's; each game has one driver per account and one account per
// driver; the rival path and the admin's undo read the game. Runs the migrations on an in-memory SQLite.
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { DatabaseSync } from "node:sqlite";

const mig = (n) => readFileSync(new URL(`../migrations/${n}`, import.meta.url), "utf8");
const db = new DatabaseSync(":memory:");
db.exec(mig("0030_driver_links.sql"));
db.prepare("INSERT INTO driver_links (oid, account_id, created) VALUES (?,?,?)").run("o:ir1", "acc1", 1);
db.prepare("INSERT INTO driver_links (oid, account_id, created) VALUES (?,?,?)").run("o:ir2", "acc2", 2);
db.exec(mig("0067_driver_links_game.sql"));

const rows = db.prepare("SELECT game, oid, account_id FROM driver_links ORDER BY oid").all().map((x) => ({ ...x }));
assert.deepEqual(rows, [{ game: "iracing", oid: "o:ir1", account_id: "acc1" }, { game: "iracing", oid: "o:ir2", account_id: "acc2" }], "the links of before are iRacing's");

const add = (game, oid, acc) => db.prepare("INSERT INTO driver_links (game, oid, account_id, created) VALUES (?,?,?,?)").run(game, oid, acc, 3);
add("lmu", "o:lmu1", "acc1");
assert.equal(db.prepare("SELECT COUNT(*) AS n FROM driver_links WHERE account_id='acc1'").get().n, 2, "an account has its iRacing driver and its LMU driver");
assert.throws(() => add("lmu", "o:lmu2", "acc1"), /UNIQUE/, "one LMU driver per account");
assert.throws(() => add("lmu", "o:lmu1", "acc2"), /UNIQUE|PRIMARY/, "one account per LMU driver");
assert.throws(() => add("iracing", "o:ir3", "acc1"), /UNIQUE/, "still one iRacing driver per account");
add("lmu", "o:lmu2", "acc2");

// what /link-driver asks before linking: only this game's links stand in the way
const had = (game, oid, acc) => db.prepare("SELECT oid, account_id FROM driver_links WHERE game=?3 AND (oid=?1 OR account_id=?2)").all(oid, acc, game).length;
assert.equal(had("lmu", "o:lmu3", "acc3"), 0, "a new driver of a new account");
assert.equal(had("iracing", "o:ir9", "acc3"), 0, "another game's links never stand in the way");
assert.equal(had("lmu", "o:lmu1", "acc3"), 1, "a driver of this game already linked");

// the rival path: a lap shared of an LMU driver goes to the account linked in LMU only
const link = (oid, game) => db.prepare("SELECT account_id FROM driver_links WHERE oid=?1 AND game=?2").get(oid, game);
assert.equal(link("o:lmu1", "lmu").account_id, "acc1");
assert.equal(link("o:lmu1", "iracing"), undefined, "never under another game");

// the admin's undo: one game's link, or every game's
db.prepare("DELETE FROM driver_links WHERE account_id=?1 AND game=?2").run("acc1", "lmu");
assert.deepEqual(db.prepare("SELECT game FROM driver_links WHERE account_id='acc1'").all().map((x) => x.game), ["iracing"], "the LMU link goes, the iRacing one stays");
db.prepare("DELETE FROM driver_links WHERE account_id=?1").run("acc2");
assert.equal(db.prepare("SELECT COUNT(*) AS n FROM driver_links WHERE account_id='acc2'").get().n, 0, "without a game, every link of the account");

console.log("ok");
