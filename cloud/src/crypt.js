// Server-side protection for what must stay readable by the server (telemetry, race analyses,
// the second-factor secret): sealed at rest with AES-GCM under DATA_KEY, a secret only the
// Worker has (`npx wrangler secret put DATA_KEY`). A database dump alone reads nothing.
// Without DATA_KEY everything is stored as before (plain), so an old server keeps working.
// Also the time-based one-time codes (TOTP, RFC 6238) of the authenticator apps.

const enc = new TextEncoder(), dec = new TextDecoder();
const b64 = (b) => btoa(String.fromCharCode(...new Uint8Array(b)));
const unb64 = (s) => Uint8Array.from(atob(s), (c) => c.charCodeAt(0));

let keyCache = null;
async function dataKey(env) {
  if (!env.DATA_KEY) return null;
  if (keyCache && keyCache.src === env.DATA_KEY) return keyCache.key;
  const raw = await crypto.subtle.digest("SHA-256", enc.encode("trackiq-data-v1:" + env.DATA_KEY));
  const key = await crypto.subtle.importKey("raw", raw, { name: "AES-GCM" }, false, ["encrypt", "decrypt"]);
  keyCache = { src: env.DATA_KEY, key };
  return key;
}

/** Seals a string for the database: "enc:" + base64(iv + ciphertext). Plain when DATA_KEY is not set. */
export async function sealData(env, s) {
  if (s == null) return s;
  const key = await dataKey(env);
  if (!key) return s;
  const iv = crypto.getRandomValues(new Uint8Array(12));
  const ct = await crypto.subtle.encrypt({ name: "AES-GCM", iv, additionalData: enc.encode("trackiq-data") }, key, enc.encode(String(s)));
  const out = new Uint8Array(12 + ct.byteLength);
  out.set(iv, 0);
  out.set(new Uint8Array(ct), 12);
  return "enc:" + b64(out);
}

/** Opens what sealData sealed; a plain value (older rows, or no DATA_KEY) comes back as it is. */
export async function openData(env, s) {
  if (typeof s !== "string" || !s.startsWith("enc:")) return s;
  const key = await dataKey(env);
  if (!key) throw new Error("DATA_KEY is not set on this server: sealed data cannot be read");
  const all = unb64(s.slice(4));
  const pt = await crypto.subtle.decrypt({ name: "AES-GCM", iv: all.subarray(0, 12), additionalData: enc.encode("trackiq-data") }, key, all.subarray(12));
  return dec.decode(pt);
}

// ---------- TOTP ----------
const B32 = "ABCDEFGHIJKLMNOPQRSTUVWXYZ234567";
export function base32(bytes) {
  let bits = 0, val = 0, out = "";
  for (const b of bytes) {
    val = (val << 8) | b;
    bits += 8;
    while (bits >= 5) { out += B32[(val >>> (bits - 5)) & 31]; bits -= 5; }
  }
  if (bits > 0) out += B32[(val << (5 - bits)) & 31];
  return out;
}
export function unbase32(s) {
  const clean = String(s || "").toUpperCase().replace(/[^A-Z2-7]/g, "");
  let bits = 0, val = 0;
  const out = [];
  for (const c of clean) {
    val = (val << 5) | B32.indexOf(c);
    bits += 5;
    if (bits >= 8) { out.push((val >>> (bits - 8)) & 255); bits -= 8; }
  }
  return new Uint8Array(out);
}
export const newTotpSecret = () => base32(crypto.getRandomValues(new Uint8Array(20)));

async function hotp(secret, counter) {
  const key = await crypto.subtle.importKey("raw", unbase32(secret), { name: "HMAC", hash: "SHA-1" }, false, ["sign"]);
  const msg = new Uint8Array(8);
  for (let i = 7; i >= 0; i--) { msg[i] = counter & 255; counter = Math.floor(counter / 256); }
  const h = new Uint8Array(await crypto.subtle.sign("HMAC", key, msg));
  const o = h[19] & 15;
  const code = ((h[o] & 127) << 24 | h[o + 1] << 16 | h[o + 2] << 8 | h[o + 3]) % 1000000;
  return String(code).padStart(6, "0");
}

/** True when `code` is the current one-time code of `secret`, or the one just before or after (clock drift). */
export async function totpOK(secret, code) {
  const c = String(code || "").replace(/\s+/g, "");
  if (!/^\d{6}$/.test(c)) return false;
  const now = Math.floor(Date.now() / 30000);
  for (const d of [0, -1, 1]) if ((await hotp(secret, now + d)) === c) return true;
  return false;
}

export const otpauthURL = (secret, label, issuer = "TrackIQ") =>
  `otpauth://totp/${encodeURIComponent(issuer)}:${encodeURIComponent(label)}?secret=${secret}&issuer=${encodeURIComponent(issuer)}&algorithm=SHA1&digits=6&period=30`;

/** Recovery codes: 8 codes like "k4m7-p2x9", shown once; only their hashes are stored. */
export function newRecoveryCodes() {
  const a = "abcdefghjkmnpqrstuvwxyz23456789";
  return Array.from({ length: 8 }, () => {
    const r = crypto.getRandomValues(new Uint8Array(8));
    const s = [...r].map((x) => a[x % a.length]).join("");
    return s.slice(0, 4) + "-" + s.slice(4);
  });
}
