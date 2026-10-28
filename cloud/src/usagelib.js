// The pure part of usage.js (what a batch or an answer keeps, when to ask, the analytics from the rows), so
// cloud/test/usage.test.mjs runs it without the server.
export const DEVICES = ["web", "pc", "android", "ios"];
export const KEY_RE = /^(view|act|game):[a-z0-9_.-]{1,40}$/;
export const MAX_KEYS = 100, MAX_N = 1000, MAX_DAYS = 90;
export const FEEDBACK_MAX = 4000, FEEDBACK_PER_DAY = 5;
export const ASK_USED = 6 * 3600e3, ASK_RACES = 2, MAX_MS = 10 * 60e3;

export const day = (t) => new Date(t).toISOString().slice(0, 10);
const cleanV = (v) => String(v == null ? "" : v).replace(/[^0-9a-zA-Z.+-]/g, "").slice(0, 24);

/** A usage batch as the server keeps it, or {error}. Unknown keys are dropped, never an error. */
export function cleanUsage(b) {
  if (!b || typeof b !== "object") return { error: "missing body" };
  const device = String(b.device || "").toLowerCase();
  if (!DEVICES.includes(device)) return { error: "unknown device" };
  const counts = [];
  if (b.counts && typeof b.counts === "object" && !Array.isArray(b.counts)) {
    for (const [k0, n0] of Object.entries(b.counts)) {
      if (counts.length >= MAX_KEYS) break;
      const k = String(k0).toLowerCase(), n = Math.floor(Number(n0));
      if (!KEY_RE.test(k) || !(n > 0)) continue;
      counts.push([k, Math.min(n, MAX_N)]);
    }
  }
  const ms = Math.max(0, Math.min(MAX_MS, Math.floor(Number(b.ms) || 0)));
  return { device, v: cleanV(b.v), counts, ms };
}

/** A feedback answer as the server keeps it, or {error}. */
export function cleanFeedback(b) {
  if (!b || typeof b !== "object") return { error: "missing body" };
  const text = String(b.text == null ? "" : b.text).replace(/\r\n?/g, "\n").replace(/[\u0000-\u0008\u000b\u000c\u000e-\u001f]/g, "").trim();
  if (!text) return { error: "write something first" };
  if (text.length > FEEDBACK_MAX) return { error: "too long (" + FEEDBACK_MAX + " characters at most)" };
  let rating = null;
  if (b.rating != null && b.rating !== "" && b.rating !== 0) {
    const r = Number(b.rating);
    if (!Number.isInteger(r) || r < 1 || r > 5) return { error: "the rating goes from 1 to 5" };
    rating = r;
  }
  const device = String(b.device || "").toLowerCase();
  return { text, rating, device: DEVICES.includes(device) ? device : "", v: cleanV(b.v), view: String(b.view || "").replace(/[^a-z0-9_.:-]/gi, "").slice(0, 40) };
}

/** Whether to ask now: six hours of use, or two races, since the window was last shown. */
export const shouldAsk = (used, races) => used >= ASK_USED || races >= ASK_RACES;

/** The analytics answer from the grouped rows (pure, so the test can run it). */
export function analyticsOf(days, perDay, rows, presence, accounts) {
  const byDev = new Map(), byKey = new Map(), byGame = new Map(), byUser = new Map();
  const add = (m, k, acc, n) => { let x = m.get(k); if (!x) m.set(k, (x = { n: 0, users: new Set() })); x.n += n; x.users.add(acc); };
  for (const r of rows) {
    add(byDev, r.device, r.account_id, r.n);
    if (r.key.startsWith("game:")) add(byGame, r.key.slice(5), r.account_id, r.n);
    else add(byKey, r.key, r.account_id, r.n);
    let u = byUser.get(r.account_id);
    if (!u) byUser.set(r.account_id, (u = { n: 0, devices: new Set(), keys: new Map(), last: "" }));
    u.n += r.n;
    u.devices.add(r.device);
    u.keys.set(r.key, (u.keys.get(r.key) || 0) + r.n);
    if (r.last > u.last) u.last = r.last;
  }
  const seen = new Map(), versions = new Map();
  for (const p of presence) {
    if (!seen.has(p.account_id) || p.last_seen > seen.get(p.account_id)) seen.set(p.account_id, p.last_seen);
    if (p.app_version) { const k = p.kind + "|" + p.app_version; versions.set(k, (versions.get(k) || 0) + 1); }
  }
  const list = (m, name) => [...m].map(([k, x]) => ({ [name]: k, users: x.users.size, n: x.n })).sort((a, b) => b.n - a.n);
  return {
    days,
    active: perDay.map((x) => ({ day: x.day, users: x.users })),
    byDevice: list(byDev, "device"),
    top: list(byKey, "key").slice(0, 60),
    games: list(byGame, "game"),
    versions: [...versions].map(([k, n]) => ({ device: k.split("|")[0], v: k.split("|")[1], devices: n })).sort((a, b) => b.devices - a.devices),
    users: [...byUser].map(([id, u]) => ({
      id, nick: (accounts.get(id) || {}).display || "", lastSeen: seen.get(id) || (u.last ? Date.parse(u.last + "T12:00:00Z") : 0), lastDay: u.last,
      devices: [...u.devices], n: u.n, top: [...u.keys].map(([key, n]) => ({ key, n })).sort((a, b) => b.n - a.n).slice(0, 6),
    })).sort((a, b) => b.lastSeen - a.lastSeen).slice(0, 300),
  };
}


// the statements of usage.js the test runs on SQLite too
export const SQL_USAGE_ADD = "INSERT INTO usage_days (day, account_id, device, key, n) VALUES (?1,?2,?3,?4,?5) ON CONFLICT(day, account_id, device, key) DO UPDATE SET n=MIN(usage_days.n+excluded.n, 100000)";
export const SQL_ASK_USED = "INSERT INTO feedback_ask (account_id, shown, used) VALUES (?1,?2,?3) ON CONFLICT(account_id) DO UPDATE SET used=feedback_ask.used+excluded.used";
export const SQL_ASK_SEEN = "INSERT INTO feedback_ask (account_id, shown, used) VALUES (?1,?2,0) ON CONFLICT(account_id) DO UPDATE SET shown=excluded.shown, used=0";
export const SQL_RACES_SINCE = "SELECT COUNT(*) AS n FROM sessions WHERE uploader=?1 AND started>?2 AND lower(COALESCE(kind,'')) LIKE '%race%'";
