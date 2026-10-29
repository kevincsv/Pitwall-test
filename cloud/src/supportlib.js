// The support chat (support.js wires it to the server): what a message keeps, the statements, the answers' shapes, the
// emails' texts and the routes themselves with the sign-in, the admins, the escrow and the emails handed in, so
// cloud/test/support.test.mjs runs them on SQLite without the server.
export const SUPPORT_MAX = 4000, SUPPORT_PER_DAY = 20, THREAD_MSGS = 300, CONVERSATIONS = 200;
export const ACCOUNT_RE = /^[A-Za-z0-9_.:-]{1,80}$/;
const DEVICES = ["web", "pc", "android", "ios"];
const cleanV = (v) => String(v == null ? "" : v).replace(/[^0-9a-zA-Z.+-]/g, "").slice(0, 24);
export const cleanLang = (l) => (["en", "es", "pt"].includes(String(l || "").slice(0, 2).toLowerCase()) ? String(l).slice(0, 2).toLowerCase() : null);

/** The text of a message (the driver's or Support's), or {error}. */
export function cleanText(t) {
  const text = String(t == null ? "" : t).replace(/\r\n?/g, "\n").replace(/[\u0000-\u0008\u000b\u000c\u000e-\u001f]/g, "").trim();
  if (!text) return { error: "write something first" };
  if (text.length > SUPPORT_MAX) return { error: "too long (" + SUPPORT_MAX + " characters at most)" };
  return { text };
}

/** A driver's chat message as the server keeps it, or {error}. */
export function cleanSupport(b) {
  if (!b || typeof b !== "object") return { error: "missing body" };
  const t = cleanText(b.text);
  if (t.error) return t;
  const device = String(b.device || "").toLowerCase();
  return { text: t.text, device: DEVICES.includes(device) ? device : "", v: cleanV(b.v), view: String(b.view || "").replace(/[^a-z0-9_.:-]/gi, "").slice(0, 40), lang: cleanLang(b.lang) };
}

// a message: id, account, from_support, text, created, rating, device, v, view, kind, style, lang
export const SQL_MSG_ADD = "INSERT INTO support_msgs (id, account_id, from_support, text, created, rating, device, v, view, kind, style, lang) VALUES (?1,?2,?3,?4,?5,?6,?7,?8,?9,?10,?11,?12)";
// the conversation's last line and its unread counts: a driver's message (unread by Support), Support's (by the driver)
export const SQL_THREAD_DRIVER = "INSERT INTO support_threads (account_id, last_at, last_text, last_support, unread_support, unread_driver) VALUES (?1,?2,substr(?3,1,200),0,1,0) ON CONFLICT(account_id) DO UPDATE SET last_at=excluded.last_at, last_text=excluded.last_text, last_support=0, unread_support=support_threads.unread_support+1";
export const SQL_THREAD_SUPPORT = "INSERT INTO support_threads (account_id, last_at, last_text, last_support, unread_support, unread_driver) VALUES (?1,?2,substr(?3,1,200),1,0,1) ON CONFLICT(account_id) DO UPDATE SET last_at=excluded.last_at, last_text=excluded.last_text, last_support=1, unread_driver=support_threads.unread_driver+1";
// the driver read Support's messages; Support read the driver's
export const SQL_DRIVER_READ = "UPDATE support_msgs SET read_at=?2 WHERE account_id=?1 AND from_support=1 AND read_at IS NULL";
export const SQL_DRIVER_READ_T = "UPDATE support_threads SET unread_driver=0 WHERE account_id=?1 AND unread_driver<>0";
export const SQL_SUPPORT_READ = "UPDATE support_msgs SET read_at=?2 WHERE account_id=?1 AND from_support=0 AND read_at IS NULL";
export const SQL_SUPPORT_READ_T = "UPDATE support_threads SET unread_support=0 WHERE account_id=?1 AND unread_support<>0";
// the polls: one row by key for the driver, the small partial index for the admins
export const SQL_UNREAD_DRIVER = "SELECT unread_driver AS n, last_text, last_support, last_at FROM support_threads WHERE account_id=?1";
export const SQL_UNREAD_ADMIN = "SELECT COUNT(*) AS n FROM support_threads WHERE unread_support>0";
export const SQL_THREAD_MSGS = "SELECT id, from_support, text, created, read_at, rating, device, v, view, kind, style FROM support_msgs WHERE account_id=?1 ORDER BY created DESC LIMIT " + THREAD_MSGS;
export const SQL_CONVERSATIONS = "SELECT t.account_id, t.last_at, t.last_text, t.last_support, t.unread_support, a.display AS nick FROM support_threads t LEFT JOIN accounts a ON a.id=t.account_id ORDER BY t.last_at DESC LIMIT " + CONVERSATIONS;
export const SQL_SENT_SINCE = "SELECT COUNT(*) AS n FROM support_msgs WHERE account_id=?1 AND from_support=0 AND created>?2";
export const SQL_LAST_LANG = "SELECT lang FROM support_msgs WHERE account_id=?1 AND from_support=0 AND lang IS NOT NULL ORDER BY created DESC LIMIT 1";

/** A message as the driver sees it (GET /community/support): theirs (me) or Support's. */
export const driverMsg = (r) => {
  const o = { id: r.id, me: !r.from_support, text: r.text, created: r.created, kind: r.kind || "chat" };
  if (r.rating) o.rating = r.rating;
  return o;
};
/** A message as the admins see it (GET /community/admin/support/:id). */
export const adminMsg = (r) => ({ id: r.id, support: !!r.from_support, text: r.text, created: r.created, read: r.read_at || null, rating: r.rating || null,
  device: r.device || "", v: r.v || "", view: r.view || "", kind: r.kind || "chat", style: r.style || null });
/** A conversation in the admins' list (GET /community/admin/support). */
export const conversation = (r) => ({ accountId: r.account_id, nick: r.nick || "", last: r.last_text, lastAt: r.last_at, lastSupport: !!r.last_support, unread: r.unread_support || 0 });
/** The oldest first, from rows read the newest first. */
export const chrono = (rows) => rows.slice().reverse();

/** The email to the driver when Support answers, in their language. */
export function replyMail(text, l) {
  const L = cleanLang(l) || "en";
  return {
    lang: L,
    subject: { en: "Pitlane HQ Support replied", es: "El soporte de Pitlane HQ te ha respondido", pt: "O suporte do Pitlane HQ respondeu" }[L],
    text,
    button: { en: "Open Pitlane HQ", es: "Abrir Pitlane HQ", pt: "Abrir o Pitlane HQ" }[L],
    link: "https://pitlanehq.app/app?support=1",
  };
}
/** The email to support@ for a driver's chat message, in English (it is for us). */
export function chatMail(f) {
  return {
    subject: "Support chat · " + (f.nick || "a driver"),
    text: [f.text, "", "From " + (f.nick || "–") + " (" + (f.accountId || "–") + ")", "Device " + (f.device || "–") + " · version " + (f.v || "–") + " · in " + (f.view || "–"),
      f.email ? "Reply to answer " + f.email + ", or answer in the app" : "No email known for this account, answer in the app"].join("\n"),
    link: "https://pitlanehq.app/app?support=" + encodeURIComponent(f.accountId || ""),
  };
}

const json = (o, s = 200) => new Response(JSON.stringify(o), { status: s, headers: { "content-type": "application/json", "cache-control": "no-store" } });
const err = (m, s) => json({ error: m }, s);

/** The statements that add a driver's message to their conversation (the feedback windows use them too). */
export const driverMessage = (env, accId, id, now, m) => [
  env.DB.prepare(SQL_MSG_ADD).bind(id, accId, 0, m.text, now, m.rating || null, m.device || "", m.v || "", m.view || "", m.kind || "chat", m.style || null, m.lang || null),
  env.DB.prepare(SQL_THREAD_DRIVER).bind(accId, now, m.text),
];

/** The routes above (null when the path is none of them); deps are the account's sign-in, the admins, the escrow and
 *  the emails, handed in by support.js so the test runs the routes on SQLite. */
export async function handleSupport(req, env, url, { sessionAccount, isAdmin, openEscrow, sendSupportChat, sendSupportReply }) {
  const p = url.pathname, m = req.method;
  if (p !== "/community/support" && p !== "/community/support/unread" && !p.startsWith("/community/admin/support")) return null;
  const acc = await sessionAccount(req, env);
  if (!acc) return err("sign in with your Pitlane HQ account", 401);
  const now = Date.now();
  if (p === "/community/support/unread" && m === "GET") {
    const r = await env.DB.prepare(SQL_UNREAD_DRIVER).bind(acc.id).first(), n = (r && r.n) || 0;
    // with something unread, Support's last line for the inbox's notice
    return json(n && r.last_support ? { n, last: r.last_text, at: r.last_at } : { n });
  }
  if (p === "/community/support" && m === "GET") {
    const [rows, u] = await Promise.all([env.DB.prepare(SQL_THREAD_MSGS).bind(acc.id).all(), env.DB.prepare(SQL_UNREAD_DRIVER).bind(acc.id).first()]);
    const unread = (u && u.n) || 0;
    if (unread) await env.DB.batch([env.DB.prepare(SQL_DRIVER_READ).bind(acc.id, now), env.DB.prepare(SQL_DRIVER_READ_T).bind(acc.id)]);
    return json({ msgs: chrono(rows.results || []).map(driverMsg), unread });
  }
  if (p === "/community/support" && m === "POST") {
    const f = cleanSupport(await req.json().catch(() => null));
    if (f.error) return err(f.error, 400);
    const c = await env.DB.prepare(SQL_SENT_SINCE).bind(acc.id, now - 86400e3).first();
    if (c && c.n >= SUPPORT_PER_DAY) return err("that is enough for today, we answer soon", 429);
    const id = crypto.randomUUID();
    await env.DB.batch(driverMessage(env, acc.id, id, now, { ...f, kind: "chat" }));
    const esc = await openEscrow(env, acc.escrow).catch(() => null);
    const mailed = await sendSupportChat(env, { ...f, nick: acc.display || "", accountId: acc.id, email: (esc && esc.email) || "" }).catch(() => false);
    return json({ ok: true, mailed, msg: { id, me: true, text: f.text, created: now, kind: "chat" } });
  }
  if (!p.startsWith("/community/admin/support")) return err("not found", 404);
  if (!isAdmin(env, acc.id)) return err("only the admins of this server can do this", 403);
  if (p === "/community/admin/support/unread" && m === "GET") {
    const r = await env.DB.prepare(SQL_UNREAD_ADMIN).first();
    return json({ n: (r && r.n) || 0 });
  }
  if (p === "/community/admin/support" && m === "GET") {
    const r = await env.DB.prepare(SQL_CONVERSATIONS).all();
    const items = (r.results || []).map(conversation);
    return json({ items, unread: items.filter((x) => x.unread > 0).length });
  }
  const mm = /^\/community\/admin\/support\/([^/]+)$/.exec(p);
  const id = mm ? decodeURIComponent(mm[1]) : "";
  if (!ACCOUNT_RE.test(id)) return err("not found", 404);
  const a = await env.DB.prepare("SELECT id, display, escrow FROM accounts WHERE id=?1").bind(id).first();
  if (m === "GET") {
    const rows = await env.DB.prepare(SQL_THREAD_MSGS).bind(id).all();
    await env.DB.batch([env.DB.prepare(SQL_SUPPORT_READ).bind(id, now), env.DB.prepare(SQL_SUPPORT_READ_T).bind(id)]);
    return json({ accountId: id, nick: (a && a.display) || "", gone: !a, msgs: chrono(rows.results || []).map(adminMsg) });
  }
  if (m === "POST") {
    if (!a) return err("this account does not exist any more", 404);
    const t = cleanText(((await req.json().catch(() => null)) || {}).text);
    if (t.error) return err(t.error, 400);
    const mid = crypto.randomUUID();
    await env.DB.batch([
      env.DB.prepare(SQL_MSG_ADD).bind(mid, id, 1, t.text, now, null, "", "", "", "reply", null, null),
      env.DB.prepare(SQL_THREAD_SUPPORT).bind(id, now, t.text),
      // answering is reading what they wrote
      env.DB.prepare(SQL_SUPPORT_READ).bind(id, now), env.DB.prepare(SQL_SUPPORT_READ_T).bind(id),
    ]);
    const [esc, lr] = await Promise.all([openEscrow(env, a.escrow).catch(() => null), env.DB.prepare(SQL_LAST_LANG).bind(id).first()]);
    const mailed = esc && esc.email ? await sendSupportReply(env, esc.email, t.text, lr && lr.lang).catch(() => false) : false;
    return json({ ok: true, mailed, msg: { id: mid, support: true, text: t.text, created: now, read: null, rating: null, device: "", v: "", view: "", kind: "reply", style: null } });
  }
  return err("not found", 404);
}
