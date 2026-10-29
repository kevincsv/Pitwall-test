// node cloud/test/usage.test.mjs: the usage batches and the feedback answers (usage.js) keep only what they should,
// the feedback window asks after six hours of use or two races, and the analytics add the rows up per device, feature,
// game and account. The feedback email says who wrote it and answers them.
import assert from "node:assert/strict";
import { cleanUsage, cleanFeedback, cleanOvRace, cleanStyle, shouldAsk, shouldAskOv, analyticsOf, MAX_KEYS, MAX_N, MAX_MS, ASK_USED } from "../src/usagelib.js";
import { feedbackMail } from "../src/email.js";
import { SQL_USAGE_ADD, SQL_ASK_USED, SQL_ASK_SEEN, SQL_RACES_SINCE, SQL_OV_RACE, SQL_OV_SEEN, SQL_OV_ANSWERED } from "../src/usagelib.js";
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
assert.deepEqual(f, { text: "The coach is great\nbut slow", rating: 4, kind: "general", style: null, device: "web", v: "0.9.14", view: "homex" });
// the overlay window's answers carry the design they were about
assert.deepEqual([cleanFeedback({ text: "ok", kind: "overlays" }).kind, cleanFeedback({ text: "ok", kind: "overlays" }).style], ["overlays", "classic"]);
assert.equal(cleanFeedback({ text: "ok", kind: "overlays", style: "Neon_2" }).style, "neon_2");
assert.equal(cleanFeedback({ text: "ok", kind: "overlays", style: "bad style!" }).error, "unknown overlay design");
assert.equal(cleanFeedback({ text: "ok", kind: "junk", style: "x" }).kind, "general", "any other kind is the general window");
assert.equal(cleanFeedback({ text: "ok", kind: "junk", style: "x" }).style, null);

// the overlay design and the races with overlays
assert.equal(cleanStyle(undefined), "classic");
assert.equal(cleanStyle(""), "classic");
assert.equal(cleanStyle("classic"), "classic");
assert.equal(cleanStyle("x".repeat(20)), "x".repeat(20));
assert.equal(cleanStyle("x".repeat(21)), null);
assert.equal(cleanStyle("a b"), null);
assert.equal(cleanStyle("<b>"), null);
assert.equal(cleanOvRace(null).error, "missing body");
assert.equal(cleanOvRace({ game: "iracing", ovs: ["radar"], style: "no way" }).error, "unknown overlay design");
assert.equal(cleanOvRace({ game: "acc", ovs: ["radar"] }).error, "unknown game");
assert.equal(cleanOvRace({ game: "lmu", ovs: [] }).error, "no overlay was open");
assert.equal(cleanOvRace({ game: "lmu", ovs: ["1", "a b"] }).error, "no overlay was open");
assert.deepEqual(cleanOvRace({ game: "LMU", ovs: ["radar", "Radar", "relative", "x/y"], sid: "123-4 <x>" }), { style: "classic", game: "lmu", ovs: ["radar", "relative"], sid: "123-4x" });

// when to show the overlay window: the first race with overlays, then every six once answered
assert.equal(shouldAskOv(false, 0), false);
assert.equal(shouldAskOv(false, 1), true, "never answered, one race");
assert.equal(shouldAskOv(true, 1), false);
assert.equal(shouldAskOv(true, 5), false, "answered, five races");
assert.equal(shouldAskOv(true, 6), true, "answered, six races");
assert.equal(cleanFeedback({ text: "ok", device: "toaster" }).device, "");
assert.equal(cleanFeedback({ text: "ok" }).rating, null, "the stars are optional");

assert.deepEqual(cleanUsage({ device: "pc", counts: { "game:auto": 1, "game:demo": 1, "game:lmu": 1 } }).counts, [["game:lmu", 1]], "only a game really driven is counted");

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
  { account_id: "a", device: "pc", key: "game:auto", n: 9, last: "2026-10-28" },
];
const pres = [{ account_id: "a", kind: "pc", app_version: "0.9.14", last_seen: 1000 }, { account_id: "a", kind: "web", app_version: "0.9.14", last_seen: 2000 }, { account_id: "c", kind: "ios", app_version: "", last_seen: 5 }];
const A = analyticsOf(30, [{ day: "2026-10-27", users: 1 }, { day: "2026-10-28", users: 1 }], rows, pres, new Map([["a", { display: "Ana" }], ["b", { display: "Bea" }]]));
assert.equal(A.days, 30);
assert.deepEqual(A.active, [{ day: "2026-10-27", users: 1 }, { day: "2026-10-28", users: 1 }]);
assert.deepEqual(A.top, [{ key: "view:laps", users: 2, n: 6 }, { key: "act:compare", users: 1, n: 2 }], "the games are apart from the features");
assert.deepEqual(A.games, [{ game: "lmu", users: 1, n: 3 }, { game: "iracing", users: 1, n: 1 }], "the old game:auto rows never show");
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
const mo = feedbackMail({ text: "The radar lags", rating: 3, nick: "Ana", kind: "overlays", style: "classic" });
assert.equal(mo.subject, "Pitlane HQ overlay feedback · Ana · 3/5");
assert.ok(mo.text.includes("About the overlays · design classic"));
assert.ok(!m.text.includes("overlays"), "a general answer says nothing of the overlays");
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
// 0073: the overlay window's counts, and the old answers read as general ones
db.exec("INSERT INTO feedback (id, account_id, created, text) VALUES ('old','a',1,'hi')");
db.exec(readFileSync(new URL("../migrations/0073_overlay_feedback.sql", import.meta.url), "utf8"));
assert.deepEqual({ ...db.prepare("SELECT kind, style FROM feedback WHERE id='old'").get() }, { kind: "general", style: null });
const ovr = () => ({ ...db.prepare("SELECT ov_races AS n, ov_answered AS a, ov_last_style AS s FROM feedback_ask WHERE account_id=?").get("a") });
assert.deepEqual(ovr(), { n: 0, a: 0, s: null });
db.prepare(SQL_OV_RACE).run("a", 900, "classic", "s1");
db.prepare(SQL_OV_RACE).run("a", 901, "classic", "s1");
assert.deepEqual(ovr(), { n: 1, a: 0, s: "classic" }, "the same race told twice counts once");
db.prepare(SQL_OV_RACE).run("a", 902, "neon", "s2");
assert.deepEqual(ovr(), { n: 2, a: 0, s: "neon" });
db.prepare(SQL_OV_SEEN).run("a");
assert.deepEqual(ovr(), { n: 0, a: 0, s: "neon" }, "shown, it waits for the next race");
db.prepare(SQL_OV_RACE).run("a", 903, "classic", "s3");
db.prepare(SQL_OV_ANSWERED).run("a", 904);
assert.deepEqual(ovr(), { n: 0, a: 1, s: "classic" }, "answered");
assert.deepEqual({ ...db.prepare("SELECT shown, used FROM feedback_ask").get() }, { shown: 500, used: 0 }, "the overlay window leaves the general one's clock alone");
db.prepare(SQL_OV_RACE).run("b", 1000, "classic", "x1");
assert.deepEqual({ ...db.prepare("SELECT shown, used, ov_races AS n FROM feedback_ask WHERE account_id='b'").get() }, { shown: 1000, used: 0, n: 1 }, "a first race with overlays starts the account's row");
db.prepare(SQL_OV_ANSWERED).run("c", 1100);
assert.deepEqual({ ...db.prepare("SELECT ov_races AS n, ov_answered AS a FROM feedback_ask WHERE account_id='c'").get() }, { n: 0, a: 1 });
console.log("ok");
