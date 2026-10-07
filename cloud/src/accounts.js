// TrackIQ accounts: sign-in and end-to-end encrypted sync between PCs.
// The PC derives a login key from the password (PBKDF2, 600 000 rounds) and
// sends only that; it is stored salted and hashed. Synced data arrives
// already encrypted with a key the server never has. Emails are stored only
// as a hash, so the database holds nothing readable about you but your
// public name. Turned on with the variable COMMUNITY = "1".
import { mailReady, sendVerify, sendReset, lang } from "./email.js";
import { pageLang, messagePage, badLinkPage, forgotPage, resetPage } from "./pages.js";
import { sealData, openData, newTotpSecret, totpOK, otpauthURL, newRecoveryCodes } from "./crypt.js";
// the phone app calls the server directly (bearer tokens, no cookies), so any origin may ask
const JSONH = { "content-type": "application/json; charset=utf-8", "cache-control": "no-store", "access-control-allow-origin": "*" };
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
const SESSION_MAX = 400 * 86400e3; // a session never lives longer than this, however much it is used

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
    "SELECT s.id AS sid, s.last_seen, s.created AS session_created, a.* FROM account_sessions s JOIN accounts a ON a.id=s.account_id WHERE s.token_hash=?1"
  ).bind(await sha256(t)).first();
  if (!s) return null;
  if (Date.now() - s.last_seen > SESSION_IDLE || Date.now() - s.session_created > SESSION_MAX) {
    await env.DB.prepare("DELETE FROM account_sessions WHERE id=?1").bind(s.sid).run();
    return null;
  }
  if (Date.now() - s.last_seen > 3600e3) await env.DB.prepare("UPDATE account_sessions SET last_seen=?2 WHERE id=?1").bind(s.sid, Date.now()).run();
  return s;
}

// one-use links sent by email: only their hash is stored
async function newEmailToken(env, accountId, kind, ttl) {
  const t = rid(24);
  await env.DB.batch([
    env.DB.prepare("DELETE FROM email_tokens WHERE (account_id=?1 AND kind=?2) OR expires<?3").bind(accountId, kind, Date.now()),
    env.DB.prepare("INSERT INTO email_tokens (token_hash, account_id, kind, expires) VALUES (?1,?2,?3,?4)").bind(await sha256(t), accountId, kind, Date.now() + ttl),
  ]);
  return t;
}
async function useEmailToken(env, t, kind, consume) {
  if (typeof t !== "string" || !/^[0-9a-f]{48}$/.test(t)) return null;
  const h = await sha256(t);
  const r = await env.DB.prepare("SELECT account_id, expires FROM email_tokens WHERE token_hash=?1 AND kind=?2").bind(h, kind).first();
  if (!r || r.expires < Date.now()) return null;
  if (consume) await env.DB.prepare("DELETE FROM email_tokens WHERE token_hash=?1").bind(h).run();
  return r.account_id;
}
async function mailVerify(env, url, accountId, email, l) {
  if (!mailReady(env)) return false;
  const t = await newEmailToken(env, accountId, "verify", 7 * 86400e3);
  return sendVerify(env, email, url.origin + "/account/verify?t=" + t + "&lang=" + lang(l), l);
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
    env.DB.prepare("DELETE FROM email_tokens WHERE account_id=?1").bind(id),
    env.DB.prepare("DELETE FROM recovery_codes WHERE account_id=?1").bind(id),
    env.DB.prepare("DELETE FROM login_pending WHERE account_id=?1").bind(id),
    env.DB.prepare("DELETE FROM accounts WHERE id=?1").bind(id),
  ]);
}

// admins of this server: the account ids in ADMINS (or SEASON_UPLOADERS); they see the Connections settings in the app
export const isAdmin = (env, id) => String(env.ADMINS || env.SEASON_UPLOADERS || "").split(",").map((x) => x.trim()).filter(Boolean).includes(id);

export async function accounts(req, env, url) {
  if (env.COMMUNITY !== "1") return err("accounts are not enabled on this server", 404);
  const p = url.pathname.replace(/^\/account/, ""), m = req.method;
  if (m === "OPTIONS") return new Response(null, { status: 204, headers: { ...JSONH, "access-control-allow-methods": "GET,POST,PUT,DELETE", "access-control-allow-headers": "authorization,content-type", "access-control-max-age": "86400" } });
  const body = m === "POST" || m === "PUT" ? await req.json().catch(() => ({})) : {};
  const ip = "ip:" + (await sha256(ipOf(req)));

  // pages opened from the emails
  if (p === "/verify" && m === "GET") {
    const id = await useEmailToken(env, url.searchParams.get("t"), "verify", true);
    if (id) await env.DB.prepare("UPDATE accounts SET verified=1 WHERE id=?1").bind(id).run();
    return messagePage(pageLang(req, url), !!id);
  }
  if (p === "/forgot" && m === "GET") return forgotPage(pageLang(req, url), mailReady(env));
  if (p === "/reset" && m === "GET") {
    const t = url.searchParams.get("t") || "";
    if (!(await useEmailToken(env, t, "reset", false))) return badLinkPage(pageLang(req, url));
    return resetPage(pageLang(req, url), t);
  }
  if (p === "/forgot" && m === "POST") {
    if (!mailReady(env)) return err("password reset by email is not set up on this server", 503);
    if (typeof body.email !== "string" || !/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(body.email)) return err("write a valid email", 400);
    const eh = await emailHash(env, body.email);
    if (await tooMany(env, ["mail:" + ip, "mail:" + eh], [10, 3])) return err("too many emails: try again in 15 minutes", 429);
    await fail(env, ["mail:" + ip, "mail:" + eh]);
    const a = await env.DB.prepare("SELECT id FROM accounts WHERE email_hash=?1").bind(eh).first();
    if (a) {
      const t = await newEmailToken(env, a.id, "reset", 3600e3);
      await sendReset(env, body.email.trim(), url.origin + "/account/reset?t=" + t + "&lang=" + lang(body.lang), body.lang);
    }
    return json({ ok: true }); // the same answer whether the account exists or not
  }
  if (p === "/reset" && m === "POST") {
    if (await tooMany(env, ["reset:" + ip], [10])) return err("too many tries: wait 15 minutes", 429);
    const id = await useEmailToken(env, body.token, "reset", false);
    if (!id) return err("this link is not valid any more: ask for a new one", 400);
    if (typeof body.email !== "string" || !isKey(body.auth) || !isB64(body.wrappedKey, 200)) return err("missing email or key", 400);
    const a = await env.DB.prepare("SELECT id, email_hash FROM accounts WHERE id=?1").bind(id).first();
    if (!a || !same(await emailHash(env, body.email), a.email_hash)) {
      await fail(env, ["reset:" + ip]);
      return err("this is not the email of that account", 400);
    }
    const salt = rid(16);
    await env.DB.batch([
      env.DB.prepare("UPDATE accounts SET auth_salt=?2, auth_hash=?3, wrapped_key=?4, verified=1 WHERE id=?1").bind(id, salt, await authHash(salt, body.auth), body.wrappedKey),
      // the synced copy was encrypted with the old password: the PCs upload it again
      env.DB.prepare("DELETE FROM account_sync_chunks WHERE account_id=?1").bind(id),
      env.DB.prepare("DELETE FROM account_sync WHERE account_id=?1").bind(id),
      env.DB.prepare("DELETE FROM account_sessions WHERE account_id=?1").bind(id),
      env.DB.prepare("DELETE FROM email_tokens WHERE account_id=?1").bind(id),
    ]);
    return json({ ok: true });
  }

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
    const mailed = await mailVerify(env, url, id, body.email.trim(), body.lang).catch(() => false);
    return json({ id, token, display, nameKind: body.nameKind === "iracing" ? "iracing" : "nick", wrappedKey: body.wrappedKey, admin: isAdmin(env, id), verified: false, mailed });
  }
  const signedIn = (a, token) => json({ id: a.id, token, display: a.display, nameKind: a.name_kind, anon: !!a.anon, wrappedKey: a.wrapped_key, admin: isAdmin(env, a.id), verified: !!a.verified, twoFactor: !!a.totp_on });
  if (p === "/login" && m === "POST") {
    if (typeof body.email !== "string" || !isKey(body.auth)) return err("missing email or key", 400);
    const eh = await emailHash(env, body.email), keys = ["login:" + eh, ip];
    if (await tooMany(env, keys, [5, 30])) return err("too many wrong passwords: wait 15 minutes", 429);
    const a = await env.DB.prepare("SELECT * FROM accounts WHERE email_hash=?1").bind(eh).first();
    if (!a || !same(await authHash(a.auth_salt, body.auth), a.auth_hash)) {
      await fail(env, keys);
      return err("wrong email or password", 401);
    }
    if (a.totp_on) {
      // the password is right: the session only exists once the authenticator code is right too
      const t = rid(24);
      await env.DB.batch([
        env.DB.prepare("DELETE FROM login_pending WHERE expires<?1").bind(Date.now()),
        env.DB.prepare("INSERT INTO login_pending (token_hash, account_id, device, expires) VALUES (?1,?2,?3,?4)").bind(await sha256(t), a.id, cleanName(body.device) || "PC", Date.now() + 5 * 60e3),
      ]);
      return json({ twoFactor: true, pending: t });
    }
    return signedIn(a, await newSession(env, a.id, body.device));
  }
  // second step of a sign-in: the 6-digit code of the authenticator app, or one recovery code
  if (p === "/login/2fa" && m === "POST") {
    if (typeof body.pending !== "string" || !/^[0-9a-f]{48}$/.test(body.pending)) return err("sign in again", 400);
    const ph = await sha256(body.pending);
    const pend = await env.DB.prepare("SELECT * FROM login_pending WHERE token_hash=?1").bind(ph).first();
    if (!pend || pend.expires < Date.now()) return err("the code took too long: sign in again", 401);
    const keys = ["2fa:" + pend.account_id, ip];
    if (await tooMany(env, keys, [5, 30])) return err("too many wrong codes: wait 15 minutes", 429);
    const a = await env.DB.prepare("SELECT * FROM accounts WHERE id=?1").bind(pend.account_id).first();
    if (!a || !a.totp_on) return err("sign in again", 401);
    const code = String(body.code || "").trim().toLowerCase();
    let ok = await totpOK(await openData(env, a.totp), code);
    if (!ok && /^[a-z0-9]{4}-?[a-z0-9]{4}$/.test(code)) {
      const h = await sha256("recovery:" + code.replace("-", ""));
      const r = await env.DB.prepare("DELETE FROM recovery_codes WHERE account_id=?1 AND code_hash=?2 RETURNING code_hash").bind(a.id, h).first();
      ok = !!r;
    }
    if (!ok) {
      await fail(env, keys);
      return err("wrong code", 401);
    }
    await env.DB.prepare("DELETE FROM login_pending WHERE token_hash=?1").bind(ph).run();
    return signedIn(a, await newSession(env, a.id, pend.device));
  }

  const a = await sessionAccount(req, env);
  if (!a) return err("signed out: sign in again", 401);
  const reauth = async () => isKey(body.auth) && same(await authHash(a.auth_salt, body.auth), a.auth_hash);

  if (p === "/me" && m === "GET") return json({ id: a.id, display: a.display, nameKind: a.name_kind, anon: !!a.anon, created: a.created, admin: isAdmin(env, a.id), verified: !!a.verified, mail: mailReady(env), twoFactor: !!a.totp_on, recoveryLeft: a.totp_on ? ((await env.DB.prepare("SELECT COUNT(*) AS n FROM recovery_codes WHERE account_id=?1").bind(a.id).first()) || {}).n || 0 : 0 });
  // two-step sign-in with an authenticator app (Google Authenticator, Authy, 1Password…):
  // setup gives the secret (and the QR address), enable confirms it with a first code and hands
  // out the recovery codes once; disable needs the password and a code
  if (p === "/2fa/setup" && m === "POST") {
    if (await tooMany(env, ["login:" + a.email_hash], [5])) return err("too many wrong passwords: wait 15 minutes", 429);
    if (!(await reauth())) {
      await fail(env, ["login:" + a.email_hash]);
      return err("the password is wrong", 401);
    }
    if (a.totp_on) return err("two-step sign-in is already on", 409);
    const secret = newTotpSecret();
    await env.DB.prepare("UPDATE accounts SET totp_pending=?2 WHERE id=?1").bind(a.id, await sealData(env, secret)).run();
    return json({ secret, url: otpauthURL(secret, a.display || a.id) });
  }
  if (p === "/2fa/enable" && m === "POST") {
    if (a.totp_on) return err("two-step sign-in is already on", 409);
    if (!a.totp_pending) return err("start the setup first", 400);
    if (await tooMany(env, ["2fa:" + a.id], [5])) return err("too many wrong codes: wait 15 minutes", 429);
    const secret = await openData(env, a.totp_pending);
    if (!(await totpOK(secret, body.code))) {
      await fail(env, ["2fa:" + a.id]);
      return err("wrong code: check the time of your phone and try again", 401);
    }
    const codes = newRecoveryCodes();
    await env.DB.batch([
      env.DB.prepare("UPDATE accounts SET totp=?2, totp_on=1, totp_pending=NULL WHERE id=?1").bind(a.id, await sealData(env, secret)),
      env.DB.prepare("DELETE FROM recovery_codes WHERE account_id=?1").bind(a.id),
      ...(await Promise.all(codes.map(async (c) => env.DB.prepare("INSERT INTO recovery_codes (account_id, code_hash) VALUES (?1,?2)").bind(a.id, await sha256("recovery:" + c.replace("-", "")))))),
      env.DB.prepare("DELETE FROM account_sessions WHERE account_id=?1 AND id<>?2").bind(a.id, a.sid), // every other device signs in again, with the code
    ]);
    return json({ ok: true, codes });
  }
  if (p === "/2fa/disable" && m === "POST") {
    if (!a.totp_on) return json({ ok: true });
    if (await tooMany(env, ["login:" + a.email_hash, "2fa:" + a.id], [5, 5])) return err("too many attempts: wait 15 minutes", 429);
    const code = String(body.code || "").trim().toLowerCase();
    let codeOK = await totpOK(await openData(env, a.totp), code);
    if (!codeOK && /^[a-z0-9]{4}-?[a-z0-9]{4}$/.test(code)) codeOK = !!(await env.DB.prepare("SELECT 1 AS x FROM recovery_codes WHERE account_id=?1 AND code_hash=?2").bind(a.id, await sha256("recovery:" + code.replace("-", ""))).first());
    if (!(await reauth()) || !codeOK) {
      await fail(env, ["login:" + a.email_hash, "2fa:" + a.id]);
      return err("the password or the code is wrong", 401);
    }
    await env.DB.batch([
      env.DB.prepare("UPDATE accounts SET totp=NULL, totp_on=0, totp_pending=NULL WHERE id=?1").bind(a.id),
      env.DB.prepare("DELETE FROM recovery_codes WHERE account_id=?1").bind(a.id),
    ]);
    return json({ ok: true });
  }
  if (p === "/me" && m === "POST") {
    const display = cleanName(body.display);
    if (!display) return err("choose a public name", 400);
    // anon: what you share shows as "Anonymous" (kept with the account so every device agrees)
    const anon = body.anon === undefined ? !!a.anon : body.anon ? 1 : 0;
    await env.DB.batch([
      env.DB.prepare("UPDATE accounts SET display=?2, name_kind=?3, anon=?4 WHERE id=?1").bind(a.id, display, body.nameKind === "iracing" ? "iracing" : "nick", anon ? 1 : 0),
      env.DB.prepare("UPDATE community_users SET alias=?2 WHERE id=?1").bind(a.id, display),
    ]);
    return json({ ok: true });
  }
  if (p === "/verify/resend" && m === "POST") {
    if (a.verified) return json({ ok: true, verified: true });
    if (!mailReady(env)) return err("emails are not set up on this server", 503);
    if (typeof body.email !== "string" || !same(await emailHash(env, body.email), a.email_hash)) return err("this is not the email of your account", 400);
    if (await tooMany(env, ["mail:" + a.id], [3])) return err("too many emails: try again in 15 minutes", 429);
    await fail(env, ["mail:" + a.id]);
    return json({ ok: await mailVerify(env, url, a.id, body.email.trim(), body.lang) });
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
