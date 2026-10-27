// Who is using Pitlane HQ right now and where (the admin page's Online tab, migration 0061).
// The apps already read the account about every minute (GET /account/me, /account/sync, /account/sync/meta); each of those
// reads notes the device here, at most once a minute per device (a memory of this isolate first, then the row's own age).
// The kind of app comes from X-Pitlane-Client ("pc/0.6.0", "desktop/0.6.0", "web/0.6.0", "android/0.6.0", "ios/0.6.0"),
// else from the User-Agent the clients send anyway (a browser, Go's client, OkHttp, CFNetwork). Never an address.
import { sessionAccount, isAdmin } from "./accounts.js";

const KINDS = ["web", "pc", "desktop", "android", "ios"];
const EVERY = 60e3;
const seen = new Map(); // account|kind|device → when this isolate last wrote it

export function clientOf(req) {
  const h = String(req.headers.get("x-pitlane-client") || "").trim().toLowerCase();
  const m = h.match(/^([a-z]+)(?:\/([0-9][0-9a-z.+-]{0,23}))?/);
  if (m && KINDS.includes(m[1])) return { kind: m[1], version: m[2] || "" };
  const ua = String(req.headers.get("user-agent") || "");
  if (/^okhttp\//i.test(ua) || /^Dalvik\//.test(ua)) return { kind: "android", version: "" };
  if (/CFNetwork|Darwin\//.test(ua) && !/^Mozilla\//.test(ua)) return { kind: "ios", version: "" };
  if (/^Go-http-client\//.test(ua)) return { kind: "pc", version: "" };
  if (/^Mozilla\//.test(ua)) return { kind: "web", version: "" };
  return null;
}

// a = the signed-in session (sessionAccount): a.id the account, a.sid the sign-in, a.session_device its device name
export async function notePresence(env, req, a) {
  try {
    const c = clientOf(req);
    if (!c || !a || !a.sid) return;
    const now = Date.now(), key = a.id + "|" + c.kind + "|" + a.sid;
    if (now - (seen.get(key) || 0) < EVERY) return;
    seen.set(key, now);
    if (seen.size > 5000) for (const [k, t] of seen) if (now - t > EVERY) seen.delete(k);
    await env.DB.prepare(
      `INSERT INTO presence (account_id, kind, device, name, app_version, last_seen) VALUES (?1,?2,?3,?4,?5,?6)
       ON CONFLICT(account_id, kind, device) DO UPDATE SET name=excluded.name, app_version=COALESCE(NULLIF(excluded.app_version,''), presence.app_version), last_seen=excluded.last_seen
       WHERE presence.last_seen < ?7`
    ).bind(a.id, c.kind, String(a.sid).slice(0, 32), String(a.session_device || "").slice(0, 60), c.version, now, now - EVERY).run();
  } catch (e) {}
}

// the ten-minute job: a week is enough
export async function prunePresence(env) {
  await env.DB.prepare("DELETE FROM presence WHERE last_seen < ?1").bind(Date.now() - 7 * 86400e3).run();
}

// GET /community/admin/online: online = seen in the last 3 minutes, recent = the last 24 hours; counts per kind
export async function onlineRoute(req, env) {
  const json = (o, s = 200) => new Response(JSON.stringify(o), { status: s, headers: { "content-type": "application/json", "cache-control": "no-store" } });
  const acc = await sessionAccount(req, env);
  if (!acc || !isAdmin(env, acc.id)) return json({ error: "only the admins of this server can do this" }, 403);
  const now = Date.now(), on = now - 3 * 60e3;
  const r = await env.DB.prepare(
    `SELECT p.account_id AS accountId, p.kind, p.name AS device, p.app_version AS version, p.last_seen AS lastSeen, a.display AS nick
     FROM presence p LEFT JOIN accounts a ON a.id=p.account_id WHERE p.last_seen > ?1 ORDER BY p.last_seen DESC LIMIT 500`
  ).bind(now - 86400e3).all().catch(() => ({ results: [] }));
  const rows = r.results || [];
  const count = (list) => {
    const c = Object.fromEntries(KINDS.map((k) => [k, 0]));
    const accs = new Set();
    for (const x of list) {
      c[x.kind] = (c[x.kind] || 0) + 1;
      accs.add(x.accountId);
    }
    return { ...c, accounts: accs.size, devices: list.length };
  };
  const online = rows.filter((x) => x.lastSeen > on), recent = rows.filter((x) => x.lastSeen <= on);
  return json({ now, online, recent, counts: { online: count(online), recent: count(rows) } });
}
