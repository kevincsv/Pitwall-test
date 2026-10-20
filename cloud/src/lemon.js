// Pitlane HQ Pro: who has it and the lifetime offer.
// During the beta everything is free; the admins switch Pro on when it ends (the admin page, app_state 'pro_gate').
// Then the experimental overlays and more than freeApps programs starting by themselves need Pro. Pro comes from Lemon Squeezy (the
// lifetime offer: half price during the beta) or from an admin by hand. Lemon Squeezy calls POST /lemonsqueezy/webhook
// for every order and subscription, signed with the webhook's secret (LEMONSQUEEZY_WEBHOOK_SECRET, HMAC-SHA256 of the
// body in X-Signature); the checkout carries the account's id (custom data), else the buyer's email is matched by its
// hash (the server never keeps emails). A buyer without an account yet gets Pro when they create one with that email.
import PLANS from "../../license_plans.json";
import { sessionAccount, isAdmin, emailHash } from "./accounts.js";

const JSONH = { "content-type": "application/json", "access-control-allow-origin": "*" };
const json = (o, s = 200) => new Response(JSON.stringify(o), { status: s, headers: JSONH });
const err = (e, s = 400) => json({ error: e }, s);

// is Pro switched on (the beta is over)? cached for a minute
let gateAt = 0, gateOn = false;
export async function proGate(env) {
  if (Date.now() - gateAt < 60e3) return gateOn;
  const r = await env.DB.prepare("SELECT v FROM app_state WHERE k='pro_gate'").first().catch(() => null);
  gateOn = !!(r && r.v === "1"); gateAt = Date.now();
  return gateOn;
}

// an account's Pro, from its row (accounts.*)
export function proOf(a) {
  const on = !!(a && a.pro) && (!a.pro_until || a.pro_until > Date.now());
  return { pro: on, proSrc: on ? a.pro_src || "" : "", proUntil: on ? a.pro_until || 0 : 0 };
}

// what the apps show: the lifetime offer (its price now, the beta's half price while it lasts) and how many overlays
// may be on Auto without Pro
export async function proOffer(env) {
  const gate = await proGate(env), L = PLANS.lifetime || {};
  return { gate, beta: !gate, freeApps: PLANS.freeApps || 3, lifetime: { price: gate ? L.full : L.beta, full: L.full, beta: L.beta, currency: L.currency || "EUR", buy: L.buy || "" } };
}

async function hmacHex(secret, body) {
  const k = await crypto.subtle.importKey("raw", new TextEncoder().encode(secret), { name: "HMAC", hash: "SHA-256" }, false, ["sign"]);
  const s = new Uint8Array(await crypto.subtle.sign("HMAC", k, new TextEncoder().encode(body)));
  return [...s].map((b) => b.toString(16).padStart(2, "0")).join("");
}
const same = (a, b) => { if (a.length !== b.length) return false; let d = 0; for (let i = 0; i < a.length; i++) d |= a.charCodeAt(i) ^ b.charCodeAt(i); return d === 0; };

// give (or take) Pro: on the account when it is known, and kept by the email's hash for an account made later
async function setPro(env, { accountId, eh, kind, until, on, order }) {
  const now = Date.now();
  if (!accountId && eh) { const a = await env.DB.prepare("SELECT id FROM accounts WHERE email_hash=?1").bind(eh).first().catch(() => null); if (a) accountId = a.id; }
  if (order) await env.DB.prepare("INSERT INTO pro_orders (id, account_id, email_hash, kind, status, until, at) VALUES (?1,?2,?3,?4,?5,?6,?7) ON CONFLICT(id) DO UPDATE SET account_id=COALESCE(excluded.account_id, pro_orders.account_id), status=excluded.status, until=excluded.until, at=excluded.at")
    .bind(order, accountId || null, eh || null, kind, on ? "on" : "off", until || 0, now).run();
  if (!accountId) return false;
  if (on) await env.DB.prepare("UPDATE accounts SET pro=1, pro_src=?2, pro_until=?3, pro_since=CASE WHEN pro_since>0 THEN pro_since ELSE ?4 END WHERE id=?1 AND NOT (pro=1 AND pro_src='lifetime' AND ?2<>'lifetime')").bind(accountId, kind, until || 0, now).run();
  // a subscription that ends or an order refunded never takes away a lifetime or a Pro given by hand
  else await env.DB.prepare("UPDATE accounts SET pro=0, pro_src=NULL, pro_until=0 WHERE id=?1 AND pro_src=?2").bind(accountId, kind).run();
  return true;
}

export async function lemonWebhook(req, env) {
  if (!env.LEMONSQUEEZY_WEBHOOK_SECRET) return err("Lemon Squeezy is not set up on this server", 404);
  const body = await req.text();
  if (body.length > 300000) return err("too large", 413);
  const sig = (req.headers.get("x-signature") || "").toLowerCase();
  if (!sig || !same(sig, await hmacHex(env.LEMONSQUEEZY_WEBHOOK_SECRET, body))) return err("bad signature", 401);
  let j;
  try { j = JSON.parse(body); } catch (e) { return err("not JSON"); }
  const ev = (j.meta && j.meta.event_name) || "", custom = (j.meta && j.meta.custom_data) || {}, d = j.data || {}, at = d.attributes || {};
  const email = String(at.user_email || "").trim().toLowerCase();
  const eh = email ? await emailHash(env, email) : null;
  let accountId = /^[\w-]{6,80}$/.test(String(custom.account || "")) ? String(custom.account) : null;
  if (accountId) { const a = await env.DB.prepare("SELECT id FROM accounts WHERE id=?1").bind(accountId).first().catch(() => null); if (!a) accountId = null; }
  const t = (v) => (v ? Date.parse(v) || 0 : 0);
  if (ev === "order_created" || ev === "order_refunded") {
    // a one-off order is the lifetime offer (a subscription's first order comes with its own subscription events)
    const items = at.first_order_item || {}, isSub = !!(custom.kind === "subscription" || /month|year|mes|año|anual/i.test(String(items.variant_name || "")));
    if (isSub) return json({ ok: true, skipped: "subscription order" });
    const paid = ev === "order_created" && at.status === "paid" && !at.refunded;
    await setPro(env, { accountId, eh, kind: "lifetime", until: 0, on: paid, order: "order:" + d.id });
    return json({ ok: true, lifetime: paid });
  }
  if (/^subscription_/.test(ev)) {
    const live = ["active", "on_trial", "past_due", "cancelled"].includes(at.status);
    const until = at.status === "cancelled" ? t(at.ends_at) : t(at.renews_at) + 3 * 86400e3; // a few days of grace for the renewal
    await setPro(env, { accountId, eh, kind: "subscription", until, on: live && until > Date.now(), order: "sub:" + d.id });
    return json({ ok: true, subscription: live });
  }
  return json({ ok: true, skipped: ev });
}

// a new account whose email already bought Pro
export async function proOnRegister(env, id, eh) {
  const o = await env.DB.prepare("SELECT kind, until FROM pro_orders WHERE email_hash=?1 AND status='on' ORDER BY (kind='lifetime') DESC, until DESC LIMIT 1").bind(eh).first().catch(() => null);
  if (o && (!o.until || o.until > Date.now())) await env.DB.prepare("UPDATE accounts SET pro=1, pro_src=?2, pro_until=?3, pro_since=?4 WHERE id=?1").bind(id, o.kind, o.until || 0, Date.now()).run();
}

const pcOf = (q) => (/^[0-9a-f]{32}$/.test(q.get("pc") || "") ? q.get("pc") : "");
const pcNameOf = (q) => String(q.get("pcname") || "").replace(/[^\w .-]/g, "").slice(0, 40);

// Pro is kept on one PC: the first PC that asks takes it, any other is told where it is (pcName) and may move it
// (POST /community/pro/pc); asked by /community/pro and /account/me with the PC's ?pc=&pcname=
export async function proHere(env, acc, q) {
  const pc = pcOf(q);
  if (!pc || !proOf(acc).pro) return {};
  if (!acc.pro_pc) {
    await env.DB.prepare("UPDATE accounts SET pro_pc=?2, pro_pc_name=?3, pro_pc_at=?4 WHERE id=?1 AND pro_pc IS NULL").bind(acc.id, pc, pcNameOf(q), Date.now()).run();
    return { pcOk: true };
  }
  return acc.pro_pc === pc ? { pcOk: true } : { pcOk: false, pcName: acc.pro_pc_name || "" };
}

// /community/pro (the offer and your Pro), /community/admin/pro (the beta switch, the counts) and
// /community/admin/pro-user (Pro by hand for one account)
export async function proRoutes(req, env, p, m, body) {
  if (p === "/pro" && m === "GET") {
    const acc = await sessionAccount(req, env).catch(() => null);
    const q = new URL(req.url).searchParams, out = { ...(await proOffer(env)), ...(acc ? proOf(acc) : {}), admin: !!(acc && isAdmin(env, acc.id)) };
    // Pro is kept on one PC: the first PC that asks takes it, any other is told where it is and may move it
    if (acc) Object.assign(out, await proHere(env, acc, q));
    return json(out);
  }
  if (p === "/pro/pc" && m === "POST") {
    // move Pro to this PC: the other one loses it
    const acc = await sessionAccount(req, env);
    if (!acc) return err("sign in", 401);
    const q = new URL(req.url).searchParams, pc = pcOf(q);
    if (!pc) return err("only the Pitlane HQ Agent on a PC can do this");
    if (!proOf(acc).pro) return err("this account has no Pro", 403);
    await env.DB.prepare("UPDATE accounts SET pro_pc=?2, pro_pc_name=?3, pro_pc_at=?4 WHERE id=?1").bind(acc.id, pc, pcNameOf(q), Date.now()).run();
    return json({ ok: true, pcOk: true });
  }
  if (p !== "/admin/pro" && p !== "/admin/pro-user") return null;
  const acc = await sessionAccount(req, env);
  if (!acc || !isAdmin(env, acc.id)) return err("only the admins of this server can do this", 403);
  if (p === "/admin/pro" && m === "POST") {
    await env.DB.prepare("INSERT INTO app_state (k, v, at) VALUES ('pro_gate', ?1, ?2) ON CONFLICT(k) DO UPDATE SET v=excluded.v, at=excluded.at").bind(body.gate ? "1" : "0", Date.now()).run();
    gateAt = 0;
  }
  if (p === "/admin/pro-user" && m === "POST") {
    const id = String(body.id || "");
    const r = body.on
      ? await env.DB.prepare("UPDATE accounts SET pro=1, pro_src='manual', pro_until=0, pro_since=CASE WHEN pro_since>0 THEN pro_since ELSE ?2 END WHERE id=?1").bind(id, Date.now()).run()
      : await env.DB.prepare("UPDATE accounts SET pro=0, pro_src=NULL, pro_until=0 WHERE id=?1 AND pro_src='manual'").bind(id).run();
    return r.meta && r.meta.changes ? json({ ok: true }) : err("account not found, or its Pro was bought (only a Pro given by hand is taken away here)", 404);
  }
  const c = await env.DB.prepare("SELECT COUNT(*) AS n, SUM(pro_src='lifetime') AS life, SUM(pro_src='subscription') AS sub, SUM(pro_src='manual') AS man FROM accounts WHERE pro=1 AND (pro_until=0 OR pro_until>?1)").bind(Date.now()).first().catch(() => ({}));
  const waiting = await env.DB.prepare("SELECT COUNT(*) AS n FROM pro_orders WHERE account_id IS NULL AND status='on'").first().catch(() => ({ n: 0 }));
  return json({ ...(await proOffer(env)), counts: { pro: c.n || 0, lifetime: c.life || 0, subscription: c.sub || 0, manual: c.man || 0, waiting: waiting.n || 0 },
    store: { webhook: !!env.LEMONSQUEEZY_WEBHOOK_SECRET, checkout: !!(PLANS.lifetime && PLANS.lifetime.buy), url: "https://pitlanehq.app/lemonsqueezy/webhook" } });
}
