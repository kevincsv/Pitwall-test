// The supporter badge by itself for the people who donate on Patreon. Patreon calls POST /patreon/webhook
// when a membership starts, changes or ends, signed with the webhook's secret (PATREON_WEBHOOK_SECRET,
// HMAC-MD5 of the body in X-Patreon-Signature). The patron's email is matched against the accounts by its
// hash (the server never keeps emails): an active patron gets the badge, a former one loses it unless an
// admin gave it by hand. A patron without an account yet gets it when they create one with that email.
import { emailHash } from "./accounts.js";

// MD5 (RFC 1321): WebCrypto has no MD5, and Patreon signs with HMAC-MD5
function md5(bytes) {
  const K = new Uint32Array(64), S = [7, 12, 17, 22, 5, 9, 14, 20, 4, 11, 16, 23, 6, 10, 15, 21];
  for (let i = 0; i < 64; i++) K[i] = Math.floor(Math.abs(Math.sin(i + 1)) * 2 ** 32) >>> 0;
  const n = bytes.length, len = ((n + 8) >> 6) * 64 + 64, m = new Uint8Array(len);
  m.set(bytes); m[n] = 0x80;
  const bits = n * 8;
  for (let i = 0; i < 8; i++) m[len - 8 + i] = i < 4 ? (bits >>> (8 * i)) & 255 : Math.floor(bits / 2 ** (8 * i)) & 255;
  let a0 = 0x67452301, b0 = 0xefcdab89, c0 = 0x98badcfe, d0 = 0x10325476;
  const w = new Uint32Array(16);
  for (let o = 0; o < len; o += 64) {
    for (let i = 0; i < 16; i++) w[i] = m[o + 4 * i] | (m[o + 4 * i + 1] << 8) | (m[o + 4 * i + 2] << 16) | (m[o + 4 * i + 3] << 24);
    let a = a0, b = b0, c = c0, d = d0;
    for (let i = 0; i < 64; i++) {
      let f, g;
      if (i < 16) { f = (b & c) | (~b & d); g = i; }
      else if (i < 32) { f = (d & b) | (~d & c); g = (5 * i + 1) % 16; }
      else if (i < 48) { f = b ^ c ^ d; g = (3 * i + 5) % 16; }
      else { f = c ^ (b | ~d); g = (7 * i) % 16; }
      const t = d; d = c; c = b;
      const x = (a + f + K[i] + w[g]) >>> 0, s = S[(i >> 4) * 4 + (i % 4)];
      b = (b + ((x << s) | (x >>> (32 - s)))) >>> 0;
      a = t;
    }
    a0 = (a0 + a) >>> 0; b0 = (b0 + b) >>> 0; c0 = (c0 + c) >>> 0; d0 = (d0 + d) >>> 0;
  }
  const out = new Uint8Array(16);
  [a0, b0, c0, d0].forEach((v, i) => { for (let k = 0; k < 4; k++) out[4 * i + k] = (v >>> (8 * k)) & 255; });
  return out;
}

export function hmacMd5Hex(key, msg) {
  const enc = new TextEncoder();
  let k = enc.encode(key);
  if (k.length > 64) k = md5(k);
  const kp = new Uint8Array(64); kp.set(k);
  const ip = kp.map((x) => x ^ 0x36), op = kp.map((x) => x ^ 0x5c), m = enc.encode(msg);
  const inner = new Uint8Array(64 + m.length); inner.set(ip); inner.set(m, 64);
  const outer = new Uint8Array(80); outer.set(op); outer.set(md5(inner), 64);
  return [...md5(outer)].map((x) => x.toString(16).padStart(2, "0")).join("");
}
export const md5Hex = (s) => [...md5(new TextEncoder().encode(s))].map((x) => x.toString(16).padStart(2, "0")).join("");

const same = (a, b) => { if (a.length !== b.length) return false; let r = 0; for (let i = 0; i < a.length; i++) r |= a.charCodeAt(i) ^ b.charCodeAt(i); return r === 0; };

export async function patreonWebhook(req, env) {
  const json = (o, s = 200) => new Response(JSON.stringify(o), { status: s, headers: { "content-type": "application/json" } });
  if (!env.PATREON_WEBHOOK_SECRET) return json({ error: "Patreon is not set up on this server" }, 404);
  const body = await req.text();
  if (body.length > 200000) return json({ error: "too large" }, 413);
  const sig = (req.headers.get("x-patreon-signature") || "").toLowerCase();
  if (!sig || !same(sig, hmacMd5Hex(env.PATREON_WEBHOOK_SECRET, body))) return json({ error: "bad signature" }, 401);
  let j = null;
  try { j = JSON.parse(body); } catch (e) { return json({ error: "not JSON" }, 400); }
  const ev = req.headers.get("x-patreon-event") || "";
  const at = (j && j.data && j.data.attributes) || {};
  const email = String(at.email || "").trim().toLowerCase();
  if (!email) return json({ ok: true, skipped: "no email" });
  const active = !/delete/.test(ev) && at.patron_status === "active_patron";
  const eh = await emailHash(env, email), now = Date.now();
  await env.DB.batch([
    env.DB.prepare("INSERT INTO patreon_patrons (email_hash, active, updated) VALUES (?1,?2,?3) ON CONFLICT(email_hash) DO UPDATE SET active=excluded.active, updated=excluded.updated").bind(eh, active ? 1 : 0, now),
    active
      ? env.DB.prepare("UPDATE accounts SET supporter=1, supporter_src=COALESCE(supporter_src,'patreon') WHERE email_hash=?1").bind(eh)
      : env.DB.prepare("UPDATE accounts SET supporter=0, supporter_src=NULL WHERE email_hash=?1 AND supporter_src='patreon'").bind(eh),
  ]);
  return json({ ok: true, active });
}

// a new account whose email is an active patron's
export async function patreonOnRegister(env, id, eh) {
  const p = await env.DB.prepare("SELECT active FROM patreon_patrons WHERE email_hash=?1").bind(eh).first().catch(() => null);
  if (p && p.active) await env.DB.prepare("UPDATE accounts SET supporter=1, supporter_src='patreon' WHERE id=?1").bind(id).run();
}
