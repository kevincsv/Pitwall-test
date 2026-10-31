// What breaks and what the database costs (reports.js wires it to the server, migration 0079): the crash and error
// reports every app sends, the logs a driver sends from the support chat and the rows each route reads per day. The
// routes take the sign-in, the admins and the support chat's statements handed in, so cloud/test/reports.test.mjs runs
// them on SQLite without the server.
import { driverMessage } from "./supportlib.js";

export const APPS = ["pc", "web", "android", "ios"];
export const STACK_MAX = 8000, MSG_MAX = 500, LOG_MAX = 512 * 1024, LOGS_PER_DAY = 3, CRASH_DAYS = 30, USAGE_DAYS = 30;
const clean = (v, max) => String(v == null ? "" : v).replace(/[\u0000-\u0008\u000b\u000c\u000e-\u001f]/g, "").slice(0, max);
const cleanV = (v) => String(v == null ? "" : v).replace(/[^0-9a-zA-Z.+-]/g, "").slice(0, 24);

/** The kind of an error: the same app, part and message (numbers and addresses left out) and its top frames are one. */
export function crashSig(app, where, msg, stack) {
  const norm = (s) => String(s || "").replace(/0x[0-9a-f]+/gi, "0x").replace(/\d+/g, "0");
  const frames = String(stack || "").split("\n").map((l) => l.trim()).filter((l) => l && !/^goroutine |^\s*$/.test(l)).slice(0, 6).map(norm).join("|");
  const s = [app, norm(where), norm(String(msg || "").split("\n")[0]), frames].join("~");
  let h = 2166136261;
  for (let i = 0; i < s.length; i++) { h ^= s.charCodeAt(i); h = Math.imul(h, 16777619) >>> 0; }
  return app + "-" + h.toString(36);
}

/** A crash report as the server keeps it, or {error}. */
export function cleanCrash(b) {
  if (!b || typeof b !== "object") return { error: "missing body" };
  const app = String(b.app || "").toLowerCase();
  if (!APPS.includes(app)) return { error: "unknown app" };
  const msg = clean(b.msg, MSG_MAX).trim();
  if (!msg) return { error: "missing msg" };
  const where = clean(b.where, 80).trim(), stack = clean(b.stack, STACK_MAX);
  return { app, v: cleanV(b.v), os: clean(b.os, 60), where, msg, stack, sig: crashSig(app, where, msg, stack) };
}

export const SQL_CRASH_ADD = `INSERT INTO crash_reports (sig, app, v, os, at_where, msg, stack, first, last, n, last_account) VALUES (?1,?2,?3,?4,?5,?6,?7,?8,?8,1,?9)
  ON CONFLICT(sig) DO UPDATE SET n=crash_reports.n+1, last=excluded.last, v=excluded.v, os=excluded.os, msg=excluded.msg, stack=excluded.stack, last_account=COALESCE(excluded.last_account, crash_reports.last_account)`;
export const SQL_CRASHES = "SELECT c.sig, c.app, c.v, c.os, c.at_where, c.msg, c.stack, c.first, c.last, c.n, c.last_account, a.display AS nick FROM crash_reports c LEFT JOIN accounts a ON a.id=c.last_account WHERE c.last>?1 ORDER BY c.last DESC LIMIT 200";
export const SQL_CRASH_DEL = "DELETE FROM crash_reports WHERE sig=?1";
export const SQL_CRASH_PRUNE = "DELETE FROM crash_reports WHERE last<?1";
export const SQL_LOG_ADD = "INSERT INTO support_logs (id, account_id, created, device, v, bytes, text) VALUES (?1,?2,?3,?4,?5,?6,?7)";
export const SQL_LOGS_SINCE = "SELECT COUNT(*) AS n FROM support_logs WHERE account_id=?1 AND created>?2";
export const SQL_LOG_GET = "SELECT id, account_id, created, device, v, bytes, text FROM support_logs WHERE id=?1";
export const SQL_LOG_PRUNE = "DELETE FROM support_logs WHERE created<?1";
export const SQL_USAGE_ADD = `INSERT INTO d1_usage (day, route, reqs, rows_read, rows_written) VALUES (?1,?2,?3,?4,?5)
  ON CONFLICT(day, route) DO UPDATE SET reqs=d1_usage.reqs+excluded.reqs, rows_read=d1_usage.rows_read+excluded.rows_read, rows_written=d1_usage.rows_written+excluded.rows_written`;
export const SQL_USAGE_DAYS = "SELECT day, route, reqs, rows_read, rows_written FROM d1_usage WHERE day>=?1 ORDER BY day";
export const SQL_USAGE_PRUNE = "DELETE FROM d1_usage WHERE day<?1";
export const day = (t) => new Date(t).toISOString().slice(0, 10);

/** The admin page's table: per route the rows over the days asked, the biggest first, and the totals per day. */
export function usageOf(rows) {
  const by = new Map(), days = new Map();
  for (const r of rows) {
    const x = by.get(r.route) || { route: r.route, reqs: 0, read: 0, written: 0, days: {} };
    x.reqs += r.reqs; x.read += r.rows_read; x.written += r.rows_written; x.days[r.day] = r.rows_read;
    by.set(r.route, x);
    const d = days.get(r.day) || { day: r.day, reqs: 0, read: 0, written: 0 };
    d.reqs += r.reqs; d.read += r.rows_read; d.written += r.rows_written; days.set(r.day, d);
  }
  return { routes: [...by.values()].sort((a, b) => b.read - a.read), days: [...days.values()].sort((a, b) => (a.day < b.day ? -1 : 1)) };
}

/** The route a request counts under: the method and the path with its ids and numbers left out. */
export function routeKey(method, path) {
  const segs = String(path || "/").split("/").map((s) => (/\d/.test(s) || s.length > 24 || /^[A-Za-z0-9_-]{16,}$/.test(s) ? ":x" : s));
  return (method || "GET") + " " + (segs.join("/").slice(0, 80) || "/");
}

const json = (o, s = 200) => new Response(JSON.stringify(o), { status: s, headers: { "content-type": "application/json", "cache-control": "no-store" } });
const err = (m, s) => json({ error: m }, s);

// POST /community/crash  {app, v, os, where, msg, stack}  → {ok}  signed in or not (a crash before the sign-in counts too)
// POST /community/support/logs (signed in)  {text, device, v}  → {ok, msg}  the agent's or the app's log, kept for Support
//   and added to the chat as a message ("Logs sent, 120 KB"), 3 a day
// GET  /community/admin/crashes?days=N (admins)  {items: [{sig, app, v, os, where, msg, stack, first, last, n, nick}]}
// DELETE /community/admin/crashes/:sig (admins)  a kind of error fixed: it goes, and comes back if it happens again
// GET  /community/admin/support/logs/:id (admins)  {id, accountId, created, device, v, bytes, text}  one log
// GET  /community/admin/d1?days=N (admins)  {routes: [{route, reqs, read, written, days}], days: [{day, reqs, read, written}]}
export async function handleReports(req, env, url, { sessionAccount, isAdmin }) {
  const p = url.pathname, m = req.method, now = Date.now();
  if (p === "/community/crash" && m === "POST") {
    const raw = await req.text().catch(() => "");
    if (raw.length > STACK_MAX * 2) return err("too big", 413);
    let b = null; try { b = JSON.parse(raw); } catch (e) {}
    const c = cleanCrash(b);
    if (c.error) return err(c.error, 400);
    const acc = await sessionAccount(req, env).catch(() => null);
    await env.DB.prepare(SQL_CRASH_ADD).bind(c.sig, c.app, c.v, c.os, c.where, c.msg, c.stack, now, acc ? acc.id : null).run();
    return json({ ok: true });
  }
  const ours = p === "/community/support/logs" || p === "/community/admin/crashes" || p.startsWith("/community/admin/crashes/") || p.startsWith("/community/admin/support/logs/") || p === "/community/admin/d1";
  if (!ours) return null;
  const acc = await sessionAccount(req, env);
  if (!acc) return err("sign in with your Pitlane HQ account", 401);
  if (p === "/community/support/logs" && m === "POST") {
    const b = (await req.json().catch(() => null)) || {};
    const text = clean(b.text, LOG_MAX + 1).replace(/\r\n?/g, "\n");
    if (!text.trim()) return err("the log is empty", 400);
    if (text.length > LOG_MAX) return err("the log is too big", 413);
    const c = await env.DB.prepare(SQL_LOGS_SINCE).bind(acc.id, now - 86400e3).first();
    if (c && c.n >= LOGS_PER_DAY) return err("that is enough for today, we answer soon", 429);
    const id = crypto.randomUUID(), mid = crypto.randomUUID(), device = APPS.includes(String(b.device)) ? String(b.device) : "", v = cleanV(b.v);
    const kb = Math.max(1, Math.round(text.length / 1024));
    const line = "Logs sent, " + kb + " KB";
    await env.DB.batch([env.DB.prepare(SQL_LOG_ADD).bind(id, acc.id, now, device, v, text.length, text),
      ...driverMessage(env, acc.id, mid, now, { text: line, device, v, view: "log:" + id, kind: "logs" })]);
    return json({ ok: true, msg: { id: mid, me: true, text: line, created: now, kind: "logs" } });
  }
  if (!isAdmin(env, acc.id)) return err("only the admins of this server can do this", 403);
  const days = Math.min(90, Math.max(1, parseInt(url.searchParams.get("days") || "7", 10) || 7));
  if (p === "/community/admin/crashes" && m === "GET") {
    const r = await env.DB.prepare(SQL_CRASHES).bind(now - days * 86400e3).all();
    return json({ items: (r.results || []).map((x) => ({ sig: x.sig, app: x.app, v: x.v, os: x.os, where: x.at_where, msg: x.msg, stack: x.stack, first: x.first, last: x.last, n: x.n, nick: x.nick || "" })) });
  }
  if (p.startsWith("/community/admin/crashes/") && m === "DELETE") {
    await env.DB.prepare(SQL_CRASH_DEL).bind(decodeURIComponent(p.slice(25))).run();
    return json({ ok: true });
  }
  if (p.startsWith("/community/admin/support/logs/") && m === "GET") {
    const r = await env.DB.prepare(SQL_LOG_GET).bind(decodeURIComponent(p.slice(30))).first();
    if (!r) return err("not found", 404);
    return json({ id: r.id, accountId: r.account_id, created: r.created, device: r.device || "", v: r.v || "", bytes: r.bytes, text: r.text });
  }
  if (p === "/community/admin/d1" && m === "GET") {
    const r = await env.DB.prepare(SQL_USAGE_DAYS).bind(day(now - (days - 1) * 86400e3)).all();
    return json(usageOf(r.results || []));
  }
  return err("not found", 404);
}

/** The hourly clean-up: old crash kinds, logs and usage rows go. */
export const pruneReports = (env, now = Date.now()) => env.DB.batch([
  env.DB.prepare(SQL_CRASH_PRUNE).bind(now - CRASH_DAYS * 86400e3),
  env.DB.prepare(SQL_LOG_PRUNE).bind(now - CRASH_DAYS * 86400e3),
  env.DB.prepare(SQL_USAGE_PRUNE).bind(day(now - USAGE_DAYS * 86400e3)),
]);

/** Counts the rows each route reads and writes: env.DB wrapped for one request. first() reads through all(), which
 *  reads the same rows and carries D1's meta. The counts gather per Worker instance and go to d1_usage about once a
 *  minute (flushUsage), so counting costs one write per route and minute, not one per request. */
const TALLY = new Map();
let lastFlush = Date.now();
export function countingDB(db, route) {
  const add = (meta) => {
    const t = TALLY.get(route) || { reqs: 0, read: 0, written: 0 };
    if (meta) { t.read += meta.rows_read || 0; t.written += meta.rows_written || 0; }
    TALLY.set(route, t);
  };
  add(null); TALLY.get(route).reqs++;
  const RAW = Symbol.for("pitlane.raw");
  const wrap = (s) => new Proxy(s, {
    get(o, k) {
      if (k === RAW) return o;
      if (k === "bind") return (...a) => wrap(o.bind(...a));
      if (k === "all" || k === "run") return async (...a) => { const r = await o[k](...a); add(r && r.meta); return r; };
      if (k === "first") return async (col) => { const r = await o.all(); add(r && r.meta); const row = (r && r.results && r.results[0]) || null; return col == null ? row : row ? row[col] ?? null : null; };
      const v = o[k]; return typeof v === "function" ? v.bind(o) : v;
    },
  });
  return new Proxy(db, {
    get(o, k) {
      if (k === "prepare") return (sql) => wrap(o.prepare(sql));
      if (k === "batch") return async (qs) => { const out = await o.batch(qs.map((q) => (q && q[RAW]) || q)); for (const r of out || []) add(r && r.meta); return out; };
      const v = o[k]; return typeof v === "function" ? v.bind(o) : v;
    },
  });
}
export async function flushUsage(db, force = false, now = Date.now()) {
  if (!TALLY.size || (!force && now - lastFlush < 60e3)) return;
  lastFlush = now;
  const d = day(now), rows = [...TALLY.entries()];
  TALLY.clear();
  await db.batch(rows.map(([route, t]) => db.prepare(SQL_USAGE_ADD).bind(d, route, t.reqs, t.read, t.written))).catch(() => {});
}
