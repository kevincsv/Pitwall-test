// node cloud/test/usage.test.mjs: the usage batches and the feedback answers (usage.js) keep only what they should,
// the feedback window asks after six hours of use or two races, and the analytics add the rows up per device, feature,
// game and account. The feedback email says who wrote it and answers them.
import assert from "node:assert/strict";
import { cleanUsage, cleanFeedback, shouldAsk, analyticsOf, MAX_KEYS, MAX_N, MAX_MS, ASK_USED } from "../src/usagelib.js";
import { feedbackMail } from "../src/email.js";
import { SQL_USAGE_ADD, SQL_ASK_USED, SQL_ASK_SEEN, SQL_RACES_SINCE } from "../src/usagelib.js";
import { readFileSync } from "node:fs";
import { DatabaseSync } from "node:sqlite";

// usage
assert.equal(cleanUsage(null).error, "missing body");
assert.equal(cleanUsage({ device: "fridge", counts: {} }).error, "unknown device");
const u = cleanUsage({ device: "PC", v: "0.9.14<script>", counts: { "view:laps": 3, "ACT:Compare": 1, "game:iracing": 2.7, "junk": 5, "view:": 1, "view:a b": 1, "act:x": -4, "act:big": 1e9, ["view:" + "x".repeat(41)]: 1 }, ms: 1e9 });
assert.equal(u.device, "pc");
assert.equal(u.v, "0.9.14script");
assert.deepEqual(u.counts, [["view:laps", 3], ["act:compare", 1], ["game:iracing", 2], ["act:big", MAX_N]], "unknown keys are dropped, n is capped");
assert.equal(u.ms, MAX_MS, "a batch counts ten minutes of use at most");
const many = {};
for (let i = 0; i < 300; i++) many["view:v" + i] = 1;
assert.equal(cleanUsage({ device: "web", counts: many }).counts.length, MAX_KEYS, "at most 100 keys a batch");
assert.deepEqual(cleanUsage({ device: "ios", counts: [1, 2] }).counts, [], "counts is an object");

// feedback
assert.equal(cleanFeedback({ text: "   " }).error, "write something first");
assert.ok(cleanFeedback({ text: "x".repeat(4001) }).error.startsWith("too long"));
assert.equal(cleanFeedback({ text: "ok", rating: 6 }).error, "the rating goes from 1 to 5");
assert.equal(cleanFeedback({ text: "ok", rating: 2.5 }).error, "the rating goes from 1 to 5");
const f = cleanFeedback({ text: " The coach is great\r\nbut slow \u0007", rating: 4, device: "web", v: "0.9.14", view: "home<x>" });
assert.deepEqual(f, { text: "The coach is great\nbut slow", rating: 4, device: "web", v: "0.9.14", view: "homex" });
assert.equal(cleanFeedback({ text: "ok", device: "toaster" }).device, "");
assert.equal(cleanFeedback({ text: "ok" }).rating, null, "the stars are optional");

// when to ask
assert.equal(shouldAsk(0, 0), false);
assert.equal(shouldAsk(ASK_USED - 1, 1), false);
assert.equal(shouldAsk(ASK_USED, 0), true, "six hours of use");
assert.equal(shouldAsk(0, 2), true, "two races");

// analytics
const rows = [
  { account_id: "a", device: "web", key: "view:laps", n: 5, last: "2026-10-27" },
  { account_id: "a", device: "pc", key: "act:compare", n: 2, last: "2026-10-28" },
  { account_id: "a", device: "pc", key: "game:iracing", n: 1, last: "2026-10-28" },
  { account_id: "b", device: "android", key: "view:laps", n: 1, last: "2026-10-20" },
  { account_id: "b", device: "android", key: "game:lmu", n: 3, last: "2026-10-20" },
];
const pres = [{ account_id: "a", kind: "pc", app_version: "0.9.14", last_seen: 1000 }, { account_id: "a", kind: "web", app_version: "0.9.14", last_seen: 2000 }, { account_id: "c", kind: "ios", app_version: "", last_seen: 5 }];
const A = analyticsOf(30, [{ day: "2026-10-27", users: 1 }, { day: "2026-10-28", users: 1 }], rows, pres, new Map([["a", { display: "Ana" }], ["b", { display: "Bea" }]]));
assert.equal(A.days, 30);
assert.deepEqual(A.active, [{ day: "2026-10-27", users: 1 }, { day: "2026-10-28", users: 1 }]);
assert.deepEqual(A.top, [{ key: "view:laps", users: 2, n: 6 }, { key: "act:compare", users: 1, n: 2 }], "the games are apart from the features");
assert.deepEqual(A.games, [{ game: "lmu", users: 1, n: 3 }, { game: "iracing", users: 1, n: 1 }]);
assert.deepEqual(A.byDevice.map((x) => [x.device, x.users, x.n]), [["web", 1, 5], ["pc", 1, 3], ["android", 1, 4]].sort((a, b) => b[2] - a[2]));
assert.deepEqual(A.versions, [{ device: "pc", v: "0.9.14", devices: 1 }, { device: "web", v: "0.9.14", devices: 1 }]);
const ua = A.users.find((x) => x.id === "a"), ub = A.users.find((x) => x.id === "b");
assert.equal(ua.nick, "Ana");
assert.equal(ua.lastSeen, 2000, "the last time any of its devices was seen");
assert.deepEqual(ua.devices.sort(), ["pc", "web"]);
assert.equal(ua.n, 8);
assert.equal(ua.top[0].key, "view:laps");
assert.equal(ub.lastSeen, Date.parse("2026-10-20T12:00:00Z"), "without presence, the last day it used the app");

// the email
const m = feedbackMail({ text: "Love it", rating: 5, nick: "Ana", accountId: "acct_1", device: "pc", v: "0.9.14", view: "home", email: "ana@example.com" });
assert.equal(m.subject, "Pitlane HQ feedback · Ana · 5/5");
assert.ok(m.text.startsWith("Love it\n"));
assert.ok(m.text.includes("acct_1") && m.text.includes("pc") && m.text.includes("0.9.14") && m.text.includes("★★★★★") && m.text.includes("ana@example.com"));
assert.ok(feedbackMail({ text: "x" }).text.includes("No email known"));
// the migration and the statements on SQLite: the counts add up, the use adds up, Not now starts again, races count
const db = new DatabaseSync(":memory:");
db.exec("CREATE TABLE sessions (id TEXT PRIMARY KEY, started INTEGER, kind TEXT, uploader TEXT);");
db.exec(readFileSync(new URL("../migrations/0070_usage_feedback.sql", import.meta.url), "utf8"));
db.prepare(SQL_USAGE_ADD).run("2026-10-28", "a", "web", "view:laps", 3);
db.prepare(SQL_USAGE_ADD).run("2026-10-28", "a", "web", "view:laps", 4);
db.prepare(SQL_USAGE_ADD).run("2026-10-28", "a", "pc", "view:laps", 1);
assert.deepEqual(db.prepare("SELECT device, n FROM usage_days ORDER BY device").all().map((x) => [x.device, x.n]), [["pc", 1], ["web", 7]]);
db.prepare(SQL_ASK_USED).run("a", 100, 60e3);
db.prepare(SQL_ASK_USED).run("a", 200, 30e3);
assert.deepEqual({ ...db.prepare("SELECT shown, used FROM feedback_ask").get() }, { shown: 100, used: 90e3 }, "the use adds up, the first time keeps its clock");
db.prepare(SQL_ASK_SEEN).run("a", 500);
assert.deepEqual({ ...db.prepare("SELECT shown, used FROM feedback_ask").get() }, { shown: 500, used: 0 }, "shown: it waits again");
for (const [id, t, k] of [["1", 400, "Race"], ["2", 600, "Race"], ["3", 700, "Practice"], ["4", 800, "Heat race"]]) db.prepare("INSERT INTO sessions VALUES (?,?,?,?)").run(id, t, k, "acct:a");
assert.equal(db.prepare(SQL_RACES_SINCE).get("acct:a", 500).n, 2, "two races since it was shown");
console.log("ok");
