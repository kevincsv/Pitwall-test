// The account's data key kept by the server, sealed with its own secret (DATA_KEY, sealData in crypt.js), so a sign-in
// with Steam or Discord opens the account without the password (the owner's choice: it does not have to be that safe).
// A device that holds the key uploads it once (POST /account/escrow) with the account's email, which is kept only when
// it is the account's (its hash); the sign-ins that have no password hand both back. Without DATA_KEY nothing is kept,
// so a key never lies in the database in the clear.
import { sealData, openData } from "./crypt.js";

export const isDataKey = (v) => typeof v === "string" && /^[0-9a-f]{64}$/.test(v);
export const escrowReady = (env) => !!env.DATA_KEY;
const cleanEmail = (e) => (typeof e === "string" ? e.trim().toLowerCase() : "");
const isEmail = (e) => e.length <= 254 && /^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(e);

/** What a device sent (key, email) as the column's value, or an error. [emailOK]: whether this email is the account's. */
export async function sealEscrow(env, key, email, emailOK) {
  if (!escrowReady(env)) return { error: "the server cannot keep the key", status: 503 };
  const k = typeof key === "string" ? key.trim().toLowerCase() : "";
  if (!isDataKey(k)) return { error: "missing key", status: 400 };
  const e = cleanEmail(email);
  const keep = e && isEmail(e) && (await emailOK(e)) ? e : "";
  return { value: await sealData(env, JSON.stringify(keep ? { k, e: keep } : { k })) };
}

/** The key (and email) of the column, or null: none kept, or sealed under another secret. */
export async function openEscrow(env, s) {
  if (typeof s !== "string" || !s.startsWith("enc:") || !escrowReady(env)) return null;
  try {
    const o = JSON.parse(await openData(env, s));
    return o && isDataKey(o.k) ? { key: o.k, email: typeof o.e === "string" ? o.e : "" } : null;
  } catch (e) {
    return null;
  }
}

/** What a sign-in without the password adds to its answer: the key from the escrow, else needKey (the password once). */
export async function escrowLogin(env, a) {
  const x = await openEscrow(env, a && a.escrow);
  return x ? { dataKey: x.key, email: x.email || undefined, escrow: true } : { needKey: true, escrow: false };
}
