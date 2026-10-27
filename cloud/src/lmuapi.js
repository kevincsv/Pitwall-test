// What Le Mans Ultimate's own API answered on an admin's PC (the agent's lmuapi.go reads every GET path of the game's
// API once per version, in the menus, and sends it here gzipped). Admins only, both ways: nobody else's PC sends it
// and nobody else reads it. Table lmu_api (migration 0062).
import { sessionAccount, isAdmin } from "./accounts.js";

const JSONH = { "content-type": "application/json; charset=utf-8", "cache-control": "no-store" };
const json = (v, status = 200) => new Response(JSON.stringify(v), { status, headers: JSONH });
const err = (msg, status) => json({ error: msg }, status);
export const LMU_BODY_MAX = 256 * 1024;  // characters kept of one answer
const RAW_MAX = 64 << 20;                // one upload, unzipped
const ITEMS_MAX = 400;                   // answers in one upload
const VER = /^[A-Za-z0-9._ -]{1,64}$/;

const str = (v, max) => (typeof v === "string" ? v.slice(0, max) : "");
const int = (v) => (Number.isFinite(+v) ? Math.max(-1, Math.min(2 ** 40, Math.round(+v))) : 0);

// the upload's JSON: gzipped (content-type application/gzip, the agent) or plain
async function readBody(req) {
  const ct = req.headers.get("content-type") || "";
  let stream = req.body;
  if (!stream) return null;
  if (/gzip/.test(ct) || req.headers.get("content-encoding") === "gzip") stream = stream.pipeThrough(new DecompressionStream("gzip"));
  const rd = stream.getReader(), parts = [];
  let n = 0;
  for (;;) {
    const { done, value } = await rd.read();
    if (done) break;
    n += value.length;
    if (n > RAW_MAX) { await rd.cancel().catch(() => {}); throw new Error("too big"); }
    parts.push(value);
  }
  const all = new Uint8Array(n);
  let o = 0;
  for (const p of parts) { all.set(p, o); o += p.length; }
  return JSON.parse(new TextDecoder().decode(all));
}

// the rows of one upload, cleaned (the same account, version and path replaces the old row)
export function lmuRows(b) {
  const version = str(b && b.version, 64);
  if (!VER.test(version) || !Array.isArray(b.items)) return null;
  const rows = [];
  for (const it of b.items.slice(0, ITEMS_MAX)) {
    const path = str(it && it.path, 512);
    if (!path || !(path.startsWith("/") || path.startsWith("#"))) continue;
    rows.push({ path, status: int(it.status), ctype: str(it.ctype, 120), size: int(it.size), ms: int(it.ms), body: str(it.body, LMU_BODY_MAX) });
  }
  return { version, build: int(b.build), rows };
}

// p is the path under /community; null when it is not one of these routes
export async function lmuApiRoutes(req, env, p, m, url) {
  if (p !== "/admin/lmu-api" && p !== "/admin/lmu-api/item") return null;
  const acc = await sessionAccount(req, env);
  if (!acc || !isAdmin(env, acc.id)) return err("only the admins of this server can do this", 403);
  if (p === "/admin/lmu-api" && m === "POST") {
    let b;
    try { b = await readBody(req); } catch (e) { return err("unreadable upload", 400); }
    const up = lmuRows(b);
    if (!up) return err("version and items", 400);
    const now = Date.now();
    const st = env.DB.prepare(`INSERT INTO lmu_api (account_id, at, game_version, path, status, ctype, size, ms, body) VALUES (?1,?2,?3,?4,?5,?6,?7,?8,?9)
      ON CONFLICT(account_id, game_version, path) DO UPDATE SET at=excluded.at, status=excluded.status, ctype=excluded.ctype, size=excluded.size, ms=excluded.ms, body=excluded.body`);
    for (let i = 0; i < up.rows.length; i += 50) {
      await env.DB.batch(up.rows.slice(i, i + 50).map((r) => st.bind(acc.id, now, up.version, r.path, r.status, r.ctype, r.size, r.ms, r.body)));
    }
    return json({ ok: true, version: up.version, stored: up.rows.length });
  }
  if (p === "/admin/lmu-api" && m === "GET") {
    const v = url.searchParams.get("version");
    if (!v) { // the versions read
      const r = await env.DB.prepare("SELECT game_version AS version, COUNT(*) AS paths, SUM(status=200) AS ok, MAX(at) AS at, COUNT(DISTINCT account_id) AS accounts FROM lmu_api GROUP BY game_version ORDER BY MAX(at) DESC LIMIT 100").all();
      return json({ versions: r.results || [] });
    }
    const r = await env.DB.prepare("SELECT id, account_id AS account, at, game_version AS version, path, status, ctype, size, ms, LENGTH(body) AS kept FROM lmu_api WHERE game_version=?1 ORDER BY path LIMIT 5000").bind(v).all();
    return json({ version: v, items: r.results || [] });
  }
  if (p === "/admin/lmu-api/item" && m === "GET") {
    const id = +url.searchParams.get("id");
    if (!Number.isInteger(id) || id <= 0) return err("id", 400);
    const r = await env.DB.prepare("SELECT id, account_id AS account, at, game_version AS version, path, status, ctype, size, ms, body FROM lmu_api WHERE id=?1").bind(id).first();
    return r ? json(r) : err("not found", 404);
  }
  return err("method", 405);
}
