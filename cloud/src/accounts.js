// Pitlane HQ accounts: sign-in and end-to-end encrypted sync between PCs.
// The PC derives a login key from the password (PBKDF2, 600 000 rounds) and
// sends only that; it is stored salted and hashed. Synced data arrives
// already encrypted with a key the server never has. Emails are stored only
// as a hash, so the database holds nothing readable about you but your
// public name. Turned on with the variable COMMUNITY = "1".
const JSONH = { "content-type": "application/json; charset=utf-8", "cache-control": "no-store" };
const json = (v, status = 200) => new Response(JSON.stringify(v), { status, headers: JSONH });
const err = (msg, status) => json({ error: msg }, status);
const hex = (b) => [...new Uint8Array(b)].map((x) => x.toString(16).padStart(2, "0")).join("");
const rid = (n = 12) => hex(crypto.getRandomValues(new Uint8Array(n)));
export async function sha256(t) {
  return hex(await crypto.subtle.digest("SHA-256", new TextEncoder().encode(t)));
}
function same(a, b) {
  if (typeof a !== "string" || typeof b !== "string" || a.length !== b.length) return false;
  let d = 0;
  for (let i = 0; i < a.length; i++) d |= a.charCodeAt(i) ^ b.charCodeAt(i);
  return d === 0;
}
const isKey = (v) => typeof v === "string" && /^[0-9a-f]{64}$/.test(v);
const isB64 = (v, max) => typeof v === "string" && v.length > 20 && v.length <= max && /^[A-Za-z0-9+/=]+$/.test(v);
export const cleanName = (a) => (typeof a === "string" ? a : "").slice(0, 32).replace(/[\u0000-\u001f<>]/g, "").trim();
const emailHash = (env, e) => sha256("pitlanehq-email:" + (env.EMAIL_PEPPER || "") + ":" + String(e || "").trim().toLowerCase());
const authHash = (salt, auth) => sha256(salt + ":" + auth);
const ipOf = (req) => req.headers.get("cf-connecting-ip") || "unknown";
const CHUNK = 900000; // D1 rows stay well under 2 MB
const SESSION_IDLE = 180 * 86400e3;

// failed sign-ins: 5 per email and 30 per address in 15 minutes
async function tooMany(env, keys, limits) {
  const since = Date.now() - 15 * 60e3;
  await env.DB.prepare("DELETE FROM auth_fails WHERE t < ?1").bind(since).run();
  for (let i = 0; i < keys.length; i++) {
    const r = await env.DB.prepare("SELECT COUNT(*) AS n FROM auth_fails WHERE k=?1 AND t>=?2").bind(keys[i], since).first();
    if (r && r.n >= limits[i]) return true;
  }
  return false;
}
const fail = (env, keys) => env.DB.batch(keys.map((k) => env.DB.prepare("INSERT INTO auth_fails (k, t) VALUES (?1, ?2)").bind(k, Date.now())));

async function newSession(env, accountId, device) {
  const token = rid(32);
  await env.DB.prepare("INSERT INTO account_sessions (id, account_id, token_hash, device, created, last_seen) VALUES (?1,?2,?3,?4,?5,?5)")
    .bind(rid(8), accountId, await sha256(token), cleanName(device) || "PC", Date.now()).run();
  return token;
}

// the account behind a session token (also used by the community)
export async function sessionAccount(req, env) {
  const h = req.headers.get("authorization") || "";
  const t = h.startsWith("Bearer ") ? h.slice(7).trim() : "";
  if (t.length < 40) return null;
  const s = await env.DB.prepare(
    "SELECT s.id AS sid, s.last_seen, a.* FROM account_sessions s JOIN accounts a ON a.id=s.account_id WHERE s.token_hash=?1"
  ).bind(await sha256(t)).first();
  if (!s) return null;
  if (Date.now() - s.last_seen > SESSION_IDLE) {
    await env.DB.prepare("DELETE FROM account_sessions WHERE id=?1").bind(s.sid).run();
    return null;
  }
  if (Date.now() - s.last_seen > 3600e3) await env.DB.prepare("UPDATE account_sessions SET last_seen=?2 WHERE id=?1").bind(s.sid, Date.now()).run();
  return s;
}

async function deleteAccount(env, id) {
  await env.DB.batch([
    env.DB.prepare("DELETE FROM community_laps WHERE user_id=?1").bind(id),
    env.DB.prepare("DELETE FROM community_reports WHERE user_id=?1").bind(id),
    env.DB.prepare("DELETE FROM community_setups WHERE user_id=?1").bind(id),
    env.DB.prepare("DELETE FROM community_users WHERE id=?1").bind(id),
    env.DB.prepare("DELETE FROM account_sync_chunks WHERE account_id=?1").bind(id),
    env.DB.prepare("DELETE FROM account_sync WHERE account_id=?1").bind(id),
    env.DB.prepare("DELETE FROM account_sessions WHERE account_id=?1").bind(id),
    env.DB.prepare("DELETE FROM accounts WHERE id=?1").bind(id),
  ]);
}

export async function accounts(req, env, url) {
  if (env.COMMUNITY !== "1") return err("accounts are not enabled on this server", 404);
  const p = url.pathname.replace(/^\/account/, ""), m = req.method;
  const body = m === "POST" || m === "PUT" ? await req.json().catch(() => ({})) : {};
  const ip = "ip:" + (await sha256(ipOf(req)));

  if (p === "/register" && m === "POST") {
    if (await tooMany(env, ["reg:" + ip], [5])) return err("too many new accounts from this network, try later", 429);
    if (typeof body.email !== "string" || !/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(body.email) || !isKey(body.auth) || !isB64(body.wrappedKey, 200)) return err("missing email, key or data key", 400);
    const display = cleanName(body.display);
    if (!display) return err("choose a public name", 400);
    const eh = await emailHash(env, body.email);
    if (await env.DB.prepare("SELECT id FROM accounts WHERE email_hash=?1").bind(eh).first()) {
      await fail(env, ["reg:" + ip]);
      return err("there is already an account with this email", 409);
    }
    await fail(env, ["reg:" + ip]); // counts towards the hourly limit too
    const id = rid(), salt = rid(16);
    await env.DB.batch([
      env.DB.prepare("INSERT INTO accounts (id, email_hash, auth_salt, auth_hash, wrapped_key, display, name_kind, created) VALUES (?1,?2,?3,?4,?5,?6,?7,?8)")
        .bind(id, eh, salt, await authHash(salt, body.auth), body.wrappedKey, display, body.nameKind === "iracing" ? "iracing" : "nick", Date.now()),
      env.DB.prepare("INSERT INTO community_users (id, token_hash, alias, created) VALUES (?1,?2,?3,?4)").bind(id, "acct:" + id, display, Date.now()),
    ]);
    const token = await newSession(env, id, body.device);
    return json({ id, token, display, nameKind: body.nameKind === "iracing" ? "iracing" : "nick", wrappedKey: body.wrappedKey });
  }
  if (p === "/login" && m === "POST") {
    if (typeof body.email !== "string" || !isKey(body.auth)) return err("missing email or key", 400);
    const eh = await emailHash(env, body.email), keys = ["login:" + eh, ip];
    if (await tooMany(env, keys, [5, 30])) return err("too many wrong passwords: wait 15 minutes", 429);
    const a = await env.DB.prepare("SELECT * FROM accounts WHERE email_hash=?1").bind(eh).first();
    if (!a || !same(await authHash(a.auth_salt, body.auth), a.auth_hash)) {
      await fail(env, keys);
      return err("wrong email or password", 401);
    }
    const token = await newSession(env, a.id, body.device);
    return json({ id: a.id, token, display: a.display, nameKind: a.name_kind, wrappedKey: a.wrapped_key });
  }

  const a = await sessionAccount(req, env);
  if (!a) return err("signed out: sign in again", 401);
  const reauth = async () => isKey(body.auth) && same(await authHash(a.auth_salt, body.auth), a.auth_hash);

  if (p === "/me" && m === "GET") return json({ id: a.id, display: a.display, nameKind: a.name_kind, created: a.created });
  if (p === "/me" && m === "POST") {
    const display = cleanName(body.display);
    if (!display) return err("choose a public name", 400);
    await env.DB.batch([
      env.DB.prepare("UPDATE accounts SET display=?2, name_kind=?3 WHERE id=?1").bind(a.id, display, body.nameKind === "iracing" ? "iracing" : "nick"),
      env.DB.prepare("UPDATE community_users SET alias=?2 WHERE id=?1").bind(a.id, display),
    ]);
    return json({ ok: true });
  }
  if (p === "/logout" && m === "POST") {
    await env.DB.prepare("DELETE FROM account_sessions WHERE id=?1").bind(a.sid).run();
    return json({ ok: true });
  }
  if (p === "/sessions" && m === "GET") {
    const r = await env.DB.prepare("SELECT id, device, created, last_seen AS lastSeen FROM account_sessions WHERE account_id=?1 ORDER BY last_seen DESC").bind(a.id).all();
    return json({ sessions: (r.results || []).map((s) => ({ ...s, current: s.id === a.sid })) });
  }
  if (p === "/sessions/revoke" && m === "POST") {
    if (body.id === "others") await env.DB.prepare("DELETE FROM account_sessions WHERE account_id=?1 AND id<>?2").bind(a.id, a.sid).run();
    else await env.DB.prepare("DELETE FROM account_sessions WHERE account_id=?1 AND id=?2").bind(a.id, String(body.id || "")).run();
    return json({ ok: true });
  }
  if (p === "/password" && m === "POST") {
    if (await tooMany(env, ["login:" + a.email_hash], [5])) return err("too many wrong passwords: wait 15 minutes", 429);
    if (!(await reauth())) {
      await fail(env, ["login:" + a.email_hash]);
      return err("the current password is wrong", 401);
    }
    if (!isKey(body.newAuth) || !isB64(body.wrappedKey, 200)) return err("missing new key", 400);
    const salt = rid(16);
    await env.DB.batch([
      env.DB.prepare("UPDATE accounts SET auth_salt=?2, auth_hash=?3, wrapped_key=?4 WHERE id=?1").bind(a.id, salt, await authHash(salt, body.newAuth), body.wrappedKey),
      env.DB.prepare("DELETE FROM account_sessions WHERE account_id=?1 AND id<>?2").bind(a.id, a.sid), // sign out everywhere else
    ]);
    return json({ ok: true });
  }
  if (p === "/delete" && m === "POST") {
    if (!(await reauth())) {
      await fail(env, ["login:" + a.email_hash]);
      return err("the password is wrong", 401);
    }
    await deleteAccount(env, a.id);
    return json({ deleted: true });
  }
  if (p === "/sync/meta" && m === "GET") {
    const s = await env.DB.prepare("SELECT version, updated FROM account_sync WHERE account_id=?1").bind(a.id).first();
    return json({ version: s ? s.version : 0, updated: s ? s.updated : null });
  }
  if (p === "/sync" && m === "GET") {
    const s = await env.DB.prepare("SELECT version, updated, chunks FROM account_sync WHERE account_id=?1").bind(a.id).first();
    if (!s) return json({ version: 0, blob: "" });
    const r = await env.DB.prepare("SELECT data FROM account_sync_chunks WHERE account_id=?1 AND idx<?2 ORDER BY idx").bind(a.id, s.chunks).all();
    return json({ version: s.version, updated: s.updated, blob: (r.results || []).map((x) => x.data).join("") });
  }
  if (p === "/sync" && m === "PUT") {
    if (!isB64(body.blob, 8 * 1024 * 1024)) return err("missing or too large data (8 MB max)", 400);
    const s = await env.DB.prepare("SELECT version FROM account_sync WHERE account_id=?1").bind(a.id).first();
    const cur = s ? s.version : 0;
    if (!body.force && Number(body.base) !== cur) return err("conflict: the account changed on another PC", 409);
    const parts = [];
    for (let i = 0; i < body.blob.length; i += CHUNK) parts.push(body.blob.slice(i, i + CHUNK));
    const v = cur + 1;
    await env.DB.batch([
      env.DB.prepare("DELETE FROM account_sync_chunks WHERE account_id=?1").bind(a.id),
      ...parts.map((d, i) => env.DB.prepare("INSERT INTO account_sync_chunks (account_id, idx, data) VALUES (?1,?2,?3)").bind(a.id, i, d)),
      env.DB.prepare(
        "INSERT INTO account_sync (account_id, version, updated, chunks) VALUES (?1,?2,?3,?4) ON CONFLICT(account_id) DO UPDATE SET version=excluded.version, updated=excluded.updated, chunks=excluded.chunks"
      ).bind(a.id, v, Date.now(), parts.length),
    ]);
    return json({ version: v });
  }
  return err("not found", 404);
}
