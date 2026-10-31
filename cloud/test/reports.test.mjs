// node cloud/test/reports.test.mjs: the crash reports, the logs sent from the support chat and the rows per route
// (migration 0079, reportslib.js), on an in-memory SQLite behind a small D1-like wrapper
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { DatabaseSync } from "node:sqlite";
import { handleReports, cleanCrash, crashSig, routeKey, usageOf, countingDB, flushUsage, pruneReports, LOGS_PER_DAY } from "../src/reportslib.js";

const mig = (n) => readFileSync(new URL(`../migrations/${n}`, import.meta.url), "utf8");
const db = new DatabaseSync(":memory:");
const stmt = (sql) => {
  const s = { args: [], bind(...a) { s.args = a; return s; },
    first: async () => { const r = db.prepare(sql).get(...s.args); return r ? { ...r } : null; },
    all: async () => ({ results: db.prepare(sql).all(...s.args).map((x) => ({ ...x })), meta: { rows_read: 3, rows_written: 0 } }),
    run: async () => { const r = db.prepare(sql).run(...s.args); return { meta: { changes: r.changes, rows_read: 1, rows_written: r.changes } }; } };
  return s;
};
const DB = { prepare: stmt, batch: async (qs) => { const out = []; for (const q of qs) out.push(await q.run()); return out; } };
const env = { DB };
db.exec("CREATE TABLE accounts (id TEXT PRIMARY KEY, display TEXT, escrow TEXT);");
db.exec(mig("0070_usage_feedback.sql")); db.exec(mig("0073_overlay_feedback.sql")); db.exec(mig("0075_support_chat.sql")); db.exec(mig("0079_reports.sql"));
db.exec("INSERT INTO accounts VALUES ('ana','Ana',NULL), ('adm','Admin',NULL)");

// the pure parts
assert.equal(cleanCrash({ app: "toaster", msg: "x" }).error, "unknown app");
assert.equal(cleanCrash({ app: "pc" }).error, "missing msg");
const goStack = "goroutine 12 [running]:\nmain.lapRecorder()\n\tC:/a/cloud.go:1006 +0x1f\nmain.keepAlive.func1()";
assert.equal(crashSig("pc", "lapRecorder", "index out of range [5] with length 3", goStack), crashSig("pc", "lapRecorder", "index out of range [7] with length 2", goStack.replace("+0x1f", "+0x2a")), "the same error with other numbers is one kind");
assert.notEqual(crashSig("pc", "lapRecorder", "nil map", goStack), crashSig("pc", "carWatcher", "nil map", goStack));
assert.equal(routeKey("GET", "/community/track/123/board"), "GET /community/track/:x/board");
assert.equal(routeKey("POST", "/community/admin/support/acct_9f8e7d6c5b4a3210"), "POST /community/admin/support/:x");
assert.equal(routeKey("GET", "/account/sync/meta"), "GET /account/sync/meta");

// the routes
const deps = { sessionAccount: async (req) => { const t = req.headers.get("authorization"); const id = t && t.slice(7); return id ? { ...db.prepare("SELECT * FROM accounts WHERE id=?").get(id) } : null; }, isAdmin: (e, id) => id === "adm" };
const call = async (method, path, body, who) => {
  const h = { "content-type": "application/json" }; if (who) h.authorization = "Bearer " + who;
  const req = new Request("https://pitlanehq.app" + path, { method, headers: h, body: body == null ? undefined : typeof body === "string" ? body : JSON.stringify(body) });
  const r = await handleReports(req, env, new URL(req.url), deps);
  if (!r) return null;
  const t = await r.text(); let j = t; try { j = JSON.parse(t); } catch (e) {}
  return { status: r.status, body: j, type: r.headers.get("content-type") || "" };
};
assert.equal(await call("GET", "/community/leaderboard"), null, "not ours");
const crash = { app: "pc", v: "0.8.2", os: "windows", where: "lapRecorder", msg: "index out of range [5] with length 3", stack: goStack };
assert.equal((await call("POST", "/community/crash", crash)).status, 200, "a crash before the sign-in counts");
assert.equal((await call("POST", "/community/crash", { ...crash, msg: "index out of range [9] with length 1", v: "0.8.3" }, "ana")).status, 200);
assert.equal((await call("POST", "/community/crash", { app: "web", msg: "x".repeat(20000) })).status, 413);
const row = db.prepare("SELECT n, v, last_account FROM crash_reports").get();
assert.deepEqual({ ...row }, { n: 2, v: "0.8.3", last_account: "ana" });
assert.equal((await call("GET", "/community/admin/crashes", null, "ana")).status, 403);
const cr = await call("GET", "/community/admin/crashes?days=7", null, "adm");
assert.equal(cr.body.items.length, 1); assert.equal(cr.body.items[0].nick, "Ana"); assert.equal(cr.body.items[0].where, "lapRecorder");
assert.equal((await call("DELETE", "/community/admin/crashes/" + cr.body.items[0].sig, null, "adm")).status, 200);
assert.equal(db.prepare("SELECT COUNT(*) AS n FROM crash_reports").get().n, 0, "fixed: it goes");

// the logs from the support chat
assert.equal((await call("POST", "/community/support/logs", { text: "x" })).status, 401);
assert.equal((await call("POST", "/community/support/logs", { text: "  " }, "ana")).status, 400);
const lg = await call("POST", "/community/support/logs", { text: "12:00 lmu: shared memory opened\n".repeat(100), device: "pc", v: "0.8.2" }, "ana");
assert.equal(lg.status, 200); assert.equal(lg.body.msg.kind, "logs"); assert.match(lg.body.msg.text, /^Logs sent, \d+ KB$/);
const m = db.prepare("SELECT kind, view, text FROM support_msgs WHERE account_id='ana'").get();
assert.equal(m.kind, "logs"); assert.ok(m.view.startsWith("log:"));
assert.equal(db.prepare("SELECT unread_support FROM support_threads WHERE account_id='ana'").get().unread_support, 1, "Support sees it in the chat");
const got = await call("GET", "/community/admin/support/logs/" + m.view.slice(4), null, "adm");
assert.equal(got.status, 200); assert.ok(got.body.text.startsWith("12:00 lmu")); assert.equal(got.body.device, "pc");
assert.equal((await call("GET", "/community/admin/support/logs/" + m.view.slice(4), null, "ana")).status, 403);
for (let i = 1; i < LOGS_PER_DAY; i++) await call("POST", "/community/support/logs", { text: "y" }, "ana");
assert.equal((await call("POST", "/community/support/logs", { text: "y" }, "ana")).status, 429);
assert.equal((await call("POST", "/community/support/logs", { text: "z".repeat(600 * 1024) }, "adm")).status, 413);

// the rows per route
const cdb = countingDB(DB, "GET /community/x");
await cdb.prepare("SELECT 1 AS a").all(); await cdb.prepare("SELECT 2 AS a").bind().first();
assert.equal(await cdb.prepare("SELECT 3 AS a").first("a"), 3, "first(column) still answers the column");
await cdb.batch([cdb.prepare("SELECT 4")]);
await flushUsage(DB, true);
const u = await call("GET", "/community/admin/d1?days=7", null, "adm");
const x = u.body.routes.find((r) => r.route === "GET /community/x");
assert.deepEqual([x.reqs, x.read], [1, 10], "three reads of 3 rows and a batch of 1");
assert.equal(u.body.days.length, 1);
assert.deepEqual(usageOf([{ day: "2026-10-30", route: "a", reqs: 1, rows_read: 5, rows_written: 0 }, { day: "2026-10-31", route: "b", reqs: 2, rows_read: 9, rows_written: 1 }]).routes.map((r) => r.route), ["b", "a"], "the biggest first");
await pruneReports(env, Date.now() + 40 * 86400e3);
assert.equal(db.prepare("SELECT COUNT(*) AS n FROM support_logs").get().n, 0);
console.log("reports ok");
