// Instant notifications on the phones (migration 0082): Firebase Cloud Messaging's HTTP v1 API. A new alert
// (alertslib.js) sends each phone of the account a data message that only says "alerts"; the phone then reads them with
// GET /community/alerts and shows the notification in its own language, so the alert's text never goes through Google.
// Without the FCM_SERVICE_ACCOUNT secret (the service account's JSON key from the Firebase console) nothing is sent and
// the phones keep finding their alerts in their background check. fetch and the time are handed in so
// cloud/test/push.test.mjs runs it without the network.

export const TOKEN_DAYS = 270, TOKENS_MAX = 10;
export const SQL_TOKEN_ADD = "INSERT INTO push_tokens (token, account_id, platform, updated) VALUES (?1,?2,?3,?4) ON CONFLICT(token) DO UPDATE SET account_id=excluded.account_id, platform=excluded.platform, updated=excluded.updated";
export const SQL_TOKEN_DEL = "DELETE FROM push_tokens WHERE token=?1";
export const SQL_TOKENS = "SELECT token FROM push_tokens WHERE account_id=?1 ORDER BY updated DESC LIMIT " + TOKENS_MAX;
export const SQL_TOKEN_PRUNE = "DELETE FROM push_tokens WHERE updated<?1";

/** A token as a phone gives it (FCM's are about 160 characters of letters, digits, ":", "-" and "_"). */
export const isPushToken = (t) => typeof t === "string" && t.length >= 20 && t.length <= 400 && /^[A-Za-z0-9:_\-]+$/.test(t);

const b64url = (b) => btoa(typeof b === "string" ? b : String.fromCharCode(...new Uint8Array(b))).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");

let cache = null; // { email, token, exp }: Google's access token, good for an hour

/** Google's access token for the service account (a JWT signed with its key, RS256), kept until 5 minutes before it ends. */
export async function accessToken(sa, { fetch: f = fetch, now = Date.now() } = {}) {
  if (cache && cache.email === sa.client_email && cache.exp > now + 300e3) return cache.token;
  const pem = String(sa.private_key || "").replace(/-----[^-]+-----/g, "").replace(/\s+/g, "");
  const der = Uint8Array.from(atob(pem), (c) => c.charCodeAt(0));
  const key = await crypto.subtle.importKey("pkcs8", der, { name: "RSASSA-PKCS1-v1_5", hash: "SHA-256" }, false, ["sign"]);
  const iat = Math.floor(now / 1000);
  const head = b64url(JSON.stringify({ alg: "RS256", typ: "JWT" }));
  const claim = b64url(JSON.stringify({ iss: sa.client_email, scope: "https://www.googleapis.com/auth/firebase.messaging", aud: "https://oauth2.googleapis.com/token", iat, exp: iat + 3600 }));
  const sig = b64url(await crypto.subtle.sign("RSASSA-PKCS1-v1_5", key, new TextEncoder().encode(head + "." + claim)));
  const r = await f("https://oauth2.googleapis.com/token", { method: "POST", headers: { "content-type": "application/x-www-form-urlencoded" },
    body: "grant_type=" + encodeURIComponent("urn:ietf:params:oauth:grant-type:jwt-bearer") + "&assertion=" + head + "." + claim + "." + sig });
  const j = await r.json().catch(() => ({}));
  if (!r.ok || !j.access_token) throw new Error("google token: " + r.status);
  cache = { email: sa.client_email, token: j.access_token, exp: now + (j.expires_in || 3600) * 1000 };
  return cache.token;
}
export const forgetToken = () => { cache = null; };

/** The service account of FCM_SERVICE_ACCOUNT, or null when it is not set (or not a key). */
export function serviceAccount(env) {
  try { const sa = JSON.parse(env.FCM_SERVICE_ACCOUNT || ""); return sa && sa.project_id && sa.client_email && sa.private_key ? sa : null; } catch (e) { return null; }
}

/** Wakes every phone of the account that gave a token: {sent, gone}. A token Firebase no longer knows is deleted. */
export async function pushAccount(env, accountId, kind = "alerts", { fetch: f = fetch, now = Date.now() } = {}) {
  const sa = serviceAccount(env);
  if (!sa || !accountId) return { sent: 0, gone: 0 };
  const rows = (await env.DB.prepare(SQL_TOKENS).bind(accountId).all()).results || [];
  if (!rows.length) return { sent: 0, gone: 0 };
  const at = await accessToken(sa, { fetch: f, now });
  let sent = 0, gone = 0;
  await Promise.all(rows.map(async ({ token }) => {
    const r = await f(`https://fcm.googleapis.com/v1/projects/${encodeURIComponent(sa.project_id)}/messages:send`, {
      method: "POST", headers: { authorization: "Bearer " + at, "content-type": "application/json" },
      body: JSON.stringify({ message: { token, data: { kind }, android: { priority: "HIGH", ttl: "86400s", collapse_key: kind } } }),
    }).catch(() => null);
    if (r && r.ok) { sent++; return; }
    const e = r ? await r.json().catch(() => ({})) : {};
    const code = JSON.stringify((e.error && e.error.details) || []) + " " + ((e.error && e.error.status) || "");
    if (r && (r.status === 404 || /UNREGISTERED|INVALID_ARGUMENT/.test(code))) { await env.DB.prepare(SQL_TOKEN_DEL).bind(token).run(); gone++; }
  }));
  return { sent, gone };
}

export const prunePushTokens = (env, now = Date.now()) => env.DB.prepare(SQL_TOKEN_PRUNE).bind(now - TOKEN_DAYS * 864e5).run();
