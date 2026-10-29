// node cloud/test/support.test.mjs: the support chat (migration 0075, supportlib.js). The migration brings the old
// feedback answers in as the drivers' messages, the routes run on an in-memory SQLite behind a small D1-like wrapper:
// a driver writes and reads, Support answers (admins only), the unread counts and the conversations follow, and the
// emails say who and where.
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { DatabaseSync } from "node:sqlite";
import { handleSupport, driverMessage, cleanSupport, cleanText, replyMail, chatMail, cleanLang, SUPPORT_PER_DAY } from "../src/supportlib.js";

const mig = (n) => readFileSync(new URL(`../migrations/${n}`, import.meta.url), "utf8");
const db = new DatabaseSync(":memory:");
const stmt = (sql) => {
  const s = { args: [], bind(...a) { s.args = a; return s; },
    first: async () => { const r = db.prepare(sql).get(...s.args); return r ? { ...r } : null; },
    all: async () => ({ results: db.prepare(sql).all(...s.args).map((x) => ({ ...x })) }),
    run: async () => { const r = db.prepare(sql).run(...s.args); return { meta: { changes: r.changes } }; } };
  return s;
};
const env = { DB: { prepare: stmt, batch: async (qs) => { db.exec("BEGIN"); try { const out = []; for (const q of qs) out.push(await q.run()); db.exec("COMMIT"); return out; } catch (e) { db.exec("ROLLBACK"); throw e; } } } };

// the pure parts
assert.equal(cleanText("  ").error, "write something first");
assert.ok(cleanText("x".repeat(4001)).error.startsWith("too long"));
assert.deepEqual(cleanSupport({ text: " Hi\r\nthere \u0007", device: "WEB", v: "0.9<x>", view: "menu:home!", lang: "es-ES" }), { text: "Hi\nthere", device: "web", v: "0.9x", view: "menu:home", lang: "es" });
assert.equal(cleanSupport({ text: "x", device: "toaster", lang: "de" }).device, "");
assert.equal(cleanLang("de"), null, "English, Spanish and Portuguese only");
const rm = replyMail("We fixed it", "pt");
assert.deepEqual([rm.subject, rm.button, rm.link, rm.text], ["O suporte do Pitlane HQ respondeu", "Abrir o Pitlane HQ", "https://pitlanehq.app/app?support=1", "We fixed it"]);
assert.equal(replyMail("x", null).subject, "Pitlane HQ Support replied");
assert.equal(replyMail("x", "es").subject, "El soporte de Pitlane HQ te ha respondido");
const cm = chatMail({ text: "Help", nick: "Ana", accountId: "acc1", device: "pc", v: "0.9.14", view: "menu:home", email: "ana@example.com" });
assert.equal(cm.subject, "Support chat · Ana");
assert.ok(cm.text.startsWith("Help\n") && cm.text.includes("acc1") && cm.text.includes("ana@example.com"));
assert.equal(cm.link, "https://pitlanehq.app/app?support=acc1");

// the migration: what the drivers sent before is in their chat, unread by Support
db.exec("CREATE TABLE accounts (id TEXT PRIMARY KEY, display TEXT, escrow TEXT);");
db.exec(mig("0070_usage_feedback.sql"));
db.exec(mig("0073_overlay_feedback.sql"));
db.exec(`INSERT INTO accounts VALUES ('mart','Mart','esc:mart'), ('ana','Ana',NULL), ('adm','Admin',NULL);
  INSERT INTO feedback (id, account_id, created, device, v, rating, text, view, kind, style) VALUES
  ('f1','mart',100,'pc','0.9.13',4,'The radar is great','home','general',NULL),
  ('f2','mart',200,'pc','0.9.14',2,'The relative flickers','ovrace','overlays','lane');`);
db.exec(mig("0075_support_chat.sql"));
db.exec(mig("0075_support_chat.sql")); // twice changes nothing
assert.deepEqual(db.prepare("SELECT id, from_support, text, rating, kind, style, read_at FROM support_msgs ORDER BY created").all().map((x) => ({ ...x })), [
  { id: "f1", from_support: 0, text: "The radar is great", rating: 4, kind: "general", style: null, read_at: null },
  { id: "f2", from_support: 0, text: "The relative flickers", rating: 2, kind: "overlays", style: "lane", read_at: null },
]);
assert.deepEqual({ ...db.prepare("SELECT * FROM support_threads").get() }, { account_id: "mart", last_at: 200, last_text: "The relative flickers", last_support: 0, unread_support: 2, unread_driver: 0 });
// the polls use their indexes, never a scan of the messages
const plan = (sql) => db.prepare("EXPLAIN QUERY PLAN " + sql).all().map((x) => x.detail).join(" | ");
assert.match(plan("SELECT unread_driver AS n FROM support_threads WHERE account_id='x'"), /USING INDEX|PRIMARY KEY/);
assert.match(plan("SELECT COUNT(*) AS n FROM support_threads WHERE unread_support>0"), /support_threads_unread/);
assert.match(plan("SELECT id FROM support_msgs WHERE account_id='x' ORDER BY created DESC LIMIT 300"), /support_msgs_acct/);

// the routes
const mails = [];
const deps = {
  sessionAccount: async (req) => { const t = req.headers.get("authorization"); const id = t && t.slice(7); return id ? { ...db.prepare("SELECT * FROM accounts WHERE id=?").get(id) } : null; },
  isAdmin: (_e, id) => id === "adm",
  openEscrow: async (_e, s) => (s === "esc:mart" ? { key: "k", email: "mart@example.com" } : null),
  sendSupportChat: async (_e, f) => { mails.push(["chat", f.nick, f.email, f.text]); return true; },
  sendSupportReply: async (_e, to, text, l) => { mails.push(["reply", to, text, l]); return true; },
};
const call = async (who, method, path, body) => {
  const req = new Request("https://pitlanehq.app" + path, { method, headers: who ? { authorization: "Bearer " + who } : {}, body: body ? JSON.stringify(body) : undefined });
  const r = await handleSupport(req, env, new URL(req.url), deps);
  return r && { status: r.status, body: await r.json() };
};
assert.equal(await call("mart", "GET", "/community/other"), null, "not its path");
assert.equal((await call(null, "GET", "/community/support")).status, 401);
assert.deepEqual((await call("mart", "GET", "/community/support/unread")).body, { n: 0 });
assert.deepEqual((await call("ana", "GET", "/community/support/unread")).body, { n: 0 }, "no conversation yet");
let r = await call("mart", "GET", "/community/support");
assert.deepEqual(r.body.msgs.map((x) => [x.id, x.me, x.kind, x.rating]), [["f1", true, "general", 4], ["f2", true, "overlays", 2]], "what they sent before, the oldest first");
// a driver writes
r = await call("ana", "POST", "/community/support", { text: "Where are my laps?", device: "web", v: "0.9.14", view: "menu:laps", lang: "es" });
assert.equal(r.status, 200);
assert.equal(r.body.msg.me, true);
assert.deepEqual(mails.pop(), ["chat", "Ana", "", "Where are my laps?"]);
assert.equal((await call("ana", "POST", "/community/support", { text: " " })).status, 400);
// admins only
for (const [m, p] of [["GET", "/community/admin/support"], ["GET", "/community/admin/support/unread"], ["GET", "/community/admin/support/ana"], ["POST", "/community/admin/support/ana"]])
  assert.equal((await call("ana", m, p, m === "POST" ? { text: "x" } : null)).status, 403, m + " " + p);
assert.deepEqual((await call("adm", "GET", "/community/admin/support/unread")).body, { n: 2 });
r = await call("adm", "GET", "/community/admin/support");
assert.deepEqual(r.body.items.map((x) => [x.accountId, x.nick, x.last, x.lastSupport, x.unread]), [["ana", "Ana", "Where are my laps?", false, 1], ["mart", "Mart", "The relative flickers", false, 2]]);
assert.equal(r.body.unread, 2);
// Support opens Mart's thread: read
r = await call("adm", "GET", "/community/admin/support/mart");
assert.deepEqual([r.body.nick, r.body.msgs.length, r.body.msgs[1].style, r.body.msgs[0].support], ["Mart", 2, "lane", false]);
assert.deepEqual((await call("adm", "GET", "/community/admin/support/unread")).body, { n: 1 });
assert.equal(db.prepare("SELECT COUNT(*) AS n FROM support_msgs WHERE account_id='mart' AND read_at IS NULL").get().n, 0);
// and answers: the driver gets it by email (their address from the escrow) and as unread
r = await call("adm", "POST", "/community/admin/support/mart", { text: "Thanks, fixed in the next version" });
assert.deepEqual([r.status, r.body.mailed, r.body.msg.support], [200, true, true]);
assert.deepEqual(mails.pop(), ["reply", "mart@example.com", "Thanks, fixed in the next version", null]);
r = (await call("mart", "GET", "/community/support/unread")).body;
assert.deepEqual([r.n, r.last, typeof r.at], [1, "Thanks, fixed in the next version", "number"], "the inbox's notice says Support's last line");
r = await call("adm", "POST", "/community/admin/support/ana", { text: "Analysis → My sessions" });
assert.deepEqual([r.body.mailed, mails.length], [false, 0], "no email known, no email");
assert.deepEqual((await call("adm", "GET", "/community/admin/support/unread")).body, { n: 0 }, "answering is reading");
r = await call("adm", "GET", "/community/admin/support");
assert.deepEqual(r.body.items.map((x) => [x.accountId, x.lastSupport, x.unread]), [["ana", true, 0], ["mart", true, 0]]);
assert.equal((await call("adm", "POST", "/community/admin/support/nobody", { text: "x" })).status, 404);
assert.equal((await call("adm", "GET", "/community/admin/support/a%20b")).status, 404);
// the driver reads it
r = await call("mart", "GET", "/community/support");
assert.equal(r.body.unread, 1);
assert.deepEqual(r.body.msgs.map((x) => [x.me, x.text]).at(-1), [false, "Thanks, fixed in the next version"]);
assert.deepEqual((await call("mart", "GET", "/community/support/unread")).body, { n: 0 });
assert.equal((await call("mart", "GET", "/community/support")).body.unread, 0);
// a feedback window's answer joins the conversation (usage.js runs these statements)
await env.DB.batch(driverMessage(env, "mart", "f3", 900, { text: "Five stars", rating: 5, kind: "general", lang: "pt" }));
assert.deepEqual((await call("adm", "GET", "/community/admin/support/unread")).body, { n: 1 });
r = await call("adm", "POST", "/community/admin/support/mart", { text: "Obrigado" });
assert.deepEqual(mails.pop(), ["reply", "mart@example.com", "Obrigado", "pt"], "the reply's email follows the language they last wrote in");
// twenty a day
for (let i = 0; i < SUPPORT_PER_DAY - 1; i++) assert.equal((await call("ana", "POST", "/community/support", { text: "m" + i })).status, 200);
assert.equal((await call("ana", "POST", "/community/support", { text: "one more" })).status, 429);
console.log("ok");
