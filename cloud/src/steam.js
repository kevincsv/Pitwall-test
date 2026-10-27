// "Sign in with Steam": Steam OpenID 2.0 in a browser (the web, the phones and, for now, the PC too). The browser goes
// to steamcommunity.com and comes back to /steam/return with the SteamID, which the server verifies with Steam itself
// (check_authentication) and answers with a one-use grant: a sign-in (POST /account/login/steam), a sign-up when that
// Steam has no account yet (the account is created with it, sid on POST /account/register) or a link (Account → Steam,
// POST /account/steam/link). A grant is only good with the code the server gave the app that started (steamStart; the
// browser never sees it), so a Steam address or a grant passed on to somebody else signs nobody in and links nothing.
// The PC's browser goes on to the PC's own agent (http://127.0.0.1:<port>/steam/done), never through a server poll.
// Steam only says who: the data key still comes from the password (POST /account/key), asked once per device.
// Secrets: STEAM_WEB_API_KEY (the persona name; without it the link has no name), STEAM_APP_ID (the Steamworks session
// ticket, a later step).
import { sha256, cleanName } from "./accounts.js";

const SITE = "https://pitlanehq.app";
const OPENID = "https://steamcommunity.com/openid/login";
const NS = "http://specs.openid.net/auth/2.0";
const JSONH = { "content-type": "application/json; charset=utf-8", "cache-control": "no-store", "access-control-allow-origin": "*" };
const json = (v, status = 200) => new Response(JSON.stringify(v), { status, headers: JSONH });
const hex = (b) => [...new Uint8Array(b)].map((x) => x.toString(16).padStart(2, "0")).join("");
const rid = (n = 24) => hex(crypto.getRandomValues(new Uint8Array(n)));
const isHex48 = (v) => typeof v === "string" && /^[0-9a-f]{48}$/.test(v);
const portOf = (v) => (Number.isInteger(Number(v)) && Number(v) > 0 && Number(v) < 65536 ? Number(v) : null);
// a local server (tools/local.cmd) comes back to itself, never to pitlanehq.app
const site = (env, url) => (env.LOCAL === "1" ? url.origin : SITE);
const returnTo = (base, state) => base + "/steam/return?state=" + state;

// the parts of Steam's answer we check before asking Steam (pure, so a test can run it): the mode, the SteamID in
// claimed_id (and identity the same), Steam's own endpoint, and return_to exactly ours. Gives the SteamID and the
// parameters to post back for check_authentication, or null.
export function openidAnswer(params, ours) {
  const g = (k) => (typeof params.get === "function" ? params.get(k) : params[k]) || "";
  if (g("openid.ns") !== NS || g("openid.mode") !== "id_res") return null;
  const m = /^https:\/\/steamcommunity\.com\/openid\/id\/(\d{17})$/.exec(g("openid.claimed_id"));
  if (!m || g("openid.identity") !== g("openid.claimed_id")) return null;
  if (g("openid.op_endpoint") !== OPENID || g("openid.return_to") !== ours) return null;
  if (!g("openid.sig") || !g("openid.assoc_handle") || !g("openid.response_nonce")) return null;
  const signed = g("openid.signed").split(",").filter(Boolean);
  for (const k of ["claimed_id", "identity", "return_to", "response_nonce", "assoc_handle", "op_endpoint"]) if (!signed.includes(k)) return null;
  const check = new URLSearchParams();
  const keys = typeof params.keys === "function" ? [...params.keys()] : Object.keys(params);
  for (const k of keys) if (k.startsWith("openid.")) check.set(k, g(k));
  check.set("openid.mode", "check_authentication");
  return { steamid: m[1], check };
}
// Steam's answer to check_authentication: key:value lines, "is_valid:true" when the signature is Steam's
export const openidValid = (text) => String(text || "").split("\n").some((l) => l.trim() === "is_valid:true");

// the persona name, when the server has the Web API key (the link keeps working without one, unnamed)
async function personaOf(env, steamid) {
  if (!env.STEAM_WEB_API_KEY) return null;
  try {
    const r = await fetch("https://api.steampowered.com/ISteamUser/GetPlayerSummaries/v2/?" + new URLSearchParams({ key: env.STEAM_WEB_API_KEY, steamids: steamid }));
    const j = r.ok ? await r.json() : null;
    const p = j && j.response && j.response.players && j.response.players[0];
    return (p && cleanName(p.personaname)) || null;
  } catch (e) {
    return null;
  }
}

// the address the browser opens, and what only the app that asked keeps: the state (in Steam's return_to, 10 minutes, as
// a hash) and the code its grant is redeemed with. kind "link" (an account linking its Steam) or "login" (a sign-in, or a
// sign-up when that Steam has no account); port is the PC's agent, which the browser goes on to instead of the web app
export async function steamStart(env, url, kind, accountId, device, port) {
  const state = rid(), code = rid(), now = Date.now(), base = site(env, url);
  await env.DB.batch([
    env.DB.prepare("DELETE FROM steam_oauth WHERE expires<?1 OR (account_id IS NOT NULL AND account_id=?2)").bind(now, accountId || ""),
    env.DB.prepare("INSERT INTO steam_oauth (state_hash, code_hash, account_id, device, kind, port, expires) VALUES (?1,?2,?3,?4,?5,?6,?7)")
      .bind(await sha256("steam-oauth:" + state), await sha256("steam-code:" + code), accountId || null, cleanName(device) || null, kind, portOf(port), now + 10 * 60e3),
  ]);
  const q = new URLSearchParams({ "openid.ns": NS, "openid.mode": "checkid_setup", "openid.identity": NS + "/identifier_select", "openid.claimed_id": NS + "/identifier_select", "openid.return_to": returnTo(base, state), "openid.realm": base });
  return { url: OPENID + "?" + q, state, code };
}

// link one Steam account to one account: "taken" when the SteamID is another account's (it unlinks there first);
// a relink of the same pair keeps "shown"
export async function linkSteam(env, steamid, accountId, persona) {
  const other = await env.DB.prepare("SELECT account_id, shown FROM steam_links WHERE steamid=?1").bind(steamid).first();
  if (other && other.account_id !== accountId) return "taken";
  await env.DB.batch([
    env.DB.prepare("DELETE FROM steam_links WHERE steamid=?1 OR account_id=?2").bind(steamid, accountId),
    env.DB.prepare("INSERT INTO steam_links (steamid, account_id, persona, created, shown) VALUES (?1,?2,?3,?4,?5)").bind(steamid, accountId, persona || null, Date.now(), other && other.shown ? 1 : 0),
  ]);
  return "ok";
}
// a grant carries the state's code hash (and, for a link, its account), so only the app that started can use it
async function newGrant(env, kind, st, steamid, persona, ttl) {
  const g = rid();
  await env.DB.batch([
    env.DB.prepare("DELETE FROM steam_grants WHERE expires<?1").bind(Date.now()),
    env.DB.prepare("INSERT INTO steam_grants (grant_hash, code_hash, account_id, steamid, persona, device, kind, expires) VALUES (?1,?2,?3,?4,?5,?6,?7,?8)")
      .bind(await sha256("steam-grant:" + g), st.code_hash, st.account_id || null, steamid, persona, st.device, kind, Date.now() + ttl),
  ]);
  return g;
}
// a grant is used once, with the code of the app that started: what Steam proved (the SteamID, the persona, the device
// that asked, the account that asked to link), or null
export async function useSteamGrant(env, g, kind, code) {
  if (!isHex48(g) || !isHex48(code)) return null;
  const r = await env.DB.prepare("DELETE FROM steam_grants WHERE grant_hash=?1 AND kind=?2 RETURNING code_hash, account_id, steamid, persona, device, expires").bind(await sha256("steam-grant:" + g), kind).first();
  return r && r.expires >= Date.now() && r.code_hash === (await sha256("steam-code:" + code)) ? r : null;
}
// the account behind a SteamID, for POST /account/login/steam
export const steamAccountId = async (env, steamid) => ((await env.DB.prepare("SELECT account_id FROM steam_links WHERE steamid=?1").bind(steamid).first()) || {}).account_id || null;

// Steam comes back here (GET /steam/return?state=…&openid.*): the answer is checked with Steam, the state used once, and
// the browser goes on with the grant: to the web app (like Discord's /?discordLinked=) or, when the PC started, to the
// PC's own agent, which redeems it with its code
export async function steamReturn(req, env, url) {
  const base = site(env, url);
  const state = url.searchParams.get("state") || "";
  if (!isHex48(state)) return Response.redirect(base + "/?steamLogin=0", 302);
  const st = await env.DB.prepare("DELETE FROM steam_oauth WHERE state_hash=?1 RETURNING code_hash, account_id, device, kind, port, expires").bind(await sha256("steam-oauth:" + state)).first();
  const back = (q) => Response.redirect((st && st.port ? "http://127.0.0.1:" + st.port + "/steam/done?state=" + state + "&" : base + "/?") + q, 302);
  const fail = () => back(st && st.kind === "link" ? "steamLinked=0" : "steamLogin=0");
  if (!st || st.expires < Date.now()) return fail();
  const ans = openidAnswer(url.searchParams, returnTo(base, state));
  if (!ans) return fail();
  try {
    const r = await fetch(OPENID, { method: "POST", headers: { "content-type": "application/x-www-form-urlencoded" }, body: ans.check });
    if (!r.ok || !openidValid(await r.text())) return fail();
  } catch (e) {
    return fail();
  }
  const persona = await personaOf(env, ans.steamid);
  if (st.kind === "link") {
    // linked by the app that asked (POST /account/steam/link), never by this browser
    if (!st.account_id) return fail();
    return back("steamLink=" + (await newGrant(env, "link", st, ans.steamid, persona, 5 * 60e3)));
  }
  // a sign-in: the app signs in with the grant, or creates the account with the sign-up grant (linked at once)
  if (await steamAccountId(env, ans.steamid)) return back("steamLogin=" + (await newGrant(env, "login", st, ans.steamid, persona, 5 * 60e3)));
  const q = new URLSearchParams({ steamLogin: "0", new: "1", sid: await newGrant(env, "signup", st, ans.steamid, persona, 30 * 60e3) });
  if (persona) q.set("persona", persona);
  return back(String(q));
}

// the account side (signed in, /account/steam/…): what is linked, the sign-in to link it from any app, the link with its
// grant, whether the profile shows it, and unlinking. Linking and unlinking ask the password first (passCheck): a session
// alone never adds or removes a way into the account
export async function steamAccount(env, a, p, m, body, url, passCheck) {
  if (p === "/steam" && m === "GET") {
    const l = await env.DB.prepare("SELECT steamid, persona, shown FROM steam_links WHERE account_id=?1").bind(a.id).first();
    return json({ linked: !!l, id: l ? l.steamid : undefined, persona: l ? l.persona || "" : undefined, shown: !!(l && l.shown) });
  }
  if (p === "/steam/start" && m === "POST") {
    const no = await passCheck();
    if (no) return no;
    return json(await steamStart(env, url, "link", a.id, body.device, body.port));
  }
  if (p === "/steam/link" && m === "POST") {
    const g = await useSteamGrant(env, body.grant, "link", body.code);
    if (!g || g.account_id !== a.id) return json({ error: "this Steam sign-in is not valid any more, sign in with Steam again" }, 400);
    const res = await linkSteam(env, g.steamid, a.id, g.persona);
    if (res === "taken") return json({ error: "this Steam account is already linked to another account", code: "taken" }, 409);
    return json({ ok: true, persona: g.persona || "" });
  }
  if (p === "/steam/shown" && m === "POST") {
    await env.DB.prepare("UPDATE steam_links SET shown=?2 WHERE account_id=?1").bind(a.id, body.shown ? 1 : 0).run();
    return json({ ok: true, shown: !!body.shown });
  }
  if (p === "/steam/unlink" && m === "POST") {
    const no = await passCheck();
    if (no) return no;
    await env.DB.prepare("DELETE FROM steam_links WHERE account_id=?1").bind(a.id).run();
    return json({ ok: true });
  }
  return json({ error: "not found" }, 404);
}
