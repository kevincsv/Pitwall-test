var __defProp = Object.defineProperty;
var __name = (target, value) => __defProp(target, "name", { value, configurable: true });

// src/voiceice.js
var STUN = [{ urls: ["stun:stun.cloudflare.com:3478", "stun:stun.l.google.com:19302"] }];
var json = /* @__PURE__ */ __name((o) => new Response(JSON.stringify(o), { headers: { "content-type": "application/json", "access-control-allow-origin": "*", "cache-control": "no-store" } }), "json");
async function voiceIce(env) {
  if (!env.TURN_KEY_ID || !env.TURN_KEY_TOKEN) return json({ iceServers: STUN });
  try {
    const r2 = await fetch(`https://rtc.live.cloudflare.com/v1/turn/keys/${env.TURN_KEY_ID}/credentials/generate-ice-servers`, {
      method: "POST",
      headers: { authorization: "Bearer " + env.TURN_KEY_TOKEN, "content-type": "application/json" },
      body: JSON.stringify({ ttl: 86400 })
    });
    const j = await r2.json();
    const got = Array.isArray(j.iceServers) ? j.iceServers : j.iceServers ? [j.iceServers] : [];
    return json({ iceServers: got.length ? got : STUN });
  } catch (e) {
    return json({ iceServers: STUN });
  }
}
__name(voiceIce, "voiceIce");

// src/downloads.js
var H = { "content-type": "text/html; charset=utf-8", "cache-control": "no-cache", "referrer-policy": "no-referrer", vary: "Accept-Language" };
var esc = /* @__PURE__ */ __name((s) => String(s ?? "").replace(/[&<>"]/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" })[c]), "esc");
var TYPES = { exe: "application/vnd.microsoft.portable-executable", zip: "application/zip", apk: "application/vnd.android.package-archive", aab: "application/octet-stream", ipa: "application/octet-stream", json: "application/json; charset=utf-8", md: "text/markdown; charset=utf-8" };
async function downloads(req, env, url) {
  const p = url.pathname;
  if (!env.DL) return new Response(JSON.stringify({ error: "downloads are not set up on this server (R2 bucket DL)" }), { status: 404, headers: { "content-type": "application/json" } });
  if (p.startsWith("/dl/")) {
    const name2 = decodeURIComponent(p.slice(4));
    if (!/^[A-Za-z0-9._-]{1,80}$/.test(name2)) return new Response("not found", { status: 404 });
    const o = await env.DL.get(name2);
    if (!o) return new Response("not found", { status: 404 });
    const ext = name2.split(".").pop().toLowerCase();
    const h = new Headers({ "content-type": TYPES[ext] || "application/octet-stream", "cache-control": ext === "json" || ext === "md" ? "no-cache" : "public, max-age=300", "x-content-type-options": "nosniff", "access-control-allow-origin": "*" });
    if (o.httpEtag) h.set("etag", o.httpEtag);
    if (!["json", "md"].includes(ext)) h.set("content-disposition", `attachment; filename="${name2}"`);
    h.set("content-length", String(o.size));
    return new Response(o.body, { headers: h });
  }
  const read = /* @__PURE__ */ __name(async (n) => {
    const o = await env.DL.get(n);
    return o ? o.text() : null;
  }, "read");
  const json14 = /* @__PURE__ */ __name(async (n) => {
    try {
      return JSON.parse(await read(n) || "null");
    } catch (e) {
      return null;
    }
  }, "json");
  const es = (req.headers.get("accept-language") || "").toLowerCase().startsWith("es");
  if (p === "/downloads/" || p === "/changelog/") return Response.redirect("https://pitlanehq.app" + p.slice(0, -1), 301);
  if (p === "/downloads") {
    const pc = await json14("version.json") || {}, ph = await json14("phones.json") || {};
    const t = /* @__PURE__ */ __name((en, s) => es ? s : en, "t");
    const row = /* @__PURE__ */ __name((title, sub, file) => `<a class="c" href="/dl/${esc(file)}"><b>${esc(title)}</b><span>${esc(sub)}</span></a>`, "row");
    const body = `<h1>${t("Download Pitlane HQ", "Descargar Pitlane HQ")}</h1><p>${t("Free. One account for the PC, the web and the phone apps.", "Gratis. Una cuenta para el PC, la web y las apps de m\xF3vil.")}</p>
<h2>Windows ${pc.version ? `<small>v${esc(pc.version)} beta</small>` : ""}</h2><div class="g">
${row(t("Pitlane HQ for Windows", "Pitlane HQ para Windows"), t("Records your laps and uploads them so you can analyse them", "Graba tus vueltas y las sube para que las analices"), "PitlaneHQ-Setup.exe")}</div>
<h2>${t("Phones", "M\xF3viles")} ${ph.version ? `<small>v${esc(String(ph.version).replace(/^v/, "").replace(/-?beta$/i, ""))} beta</small>` : ""}</h2><div class="g">
${ph.apk ? row("Android", t("App (APK). Google Play soon", "App (APK). Pronto en Google Play"), ph.apk) : ""}<div class="c" style="opacity:.7"><b>iPhone</b><span>${t("Coming to the App Store", "Pronto en la App Store")}</span></div></div>
<p class="n"><a href="/changelog">${t("What changed in each version", "Qu\xE9 cambi\xF3 en cada versi\xF3n")}</a> \xB7 <a href="/">${t("Open the web app", "Abrir la app web")}</a></p>`;
    return new Response(page(body, { lang: es ? "es" : "en" }), { headers: H });
  }
  if (p === "/changelog" || p === "/changelog/phones") {
    let vs = [];
    try {
      vs = (await (await env.ASSETS.fetch(new Request(new URL("/whats-new.json", url.origin)))).json()).versions || [];
    } catch (e) {
    }
    const l = es ? "es" : "en";
    const body = `<h1>${es ? "Novedades" : "What's new"}</h1>` + vs.map((x) => `<h2 id="${esc(String(x.v).replace(/\./g, ""))}-beta">${esc(x.v)} <small>${esc(x.date || "")}</small></h2><ul>${(x[l] || x.en || []).map((t) => `<li>${esc(t)}</li>`).join("")}</ul>`).join("");
    return new Response(page(
      body + `<p class="n"><a href="/downloads">${es ? "Descargas" : "Downloads"}</a> \xB7 <a href="/">${es ? "Abrir la app" : "Open the app"}</a></p>`,
      { lang: es ? "es" : "en", path: p, title: "What's new in Pitlane HQ \xB7 Changelog", desc: "What changed in each version of Pitlane HQ, the iRacing and Le Mans Ultimate telemetry app for Windows, the web and Android." }
    ), { headers: H });
  }
  return new Response("not found", { status: 404 });
}
__name(downloads, "downloads");
var page = /* @__PURE__ */ __name((body, o = {}) => `<!doctype html><html lang="${o.lang || "en"}"><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>${o.title || "Download Pitlane HQ \xB7 iRacing and LMU telemetry for Windows"}</title><meta name="description" content="${o.desc || "Download Pitlane HQ Agent for Windows, which records your iRacing and Le Mans Ultimate laps, and the Android app. Free."}"><link rel="canonical" href="https://pitlanehq.app${o.path || "/downloads"}"><meta property="og:image" content="https://pitlanehq.app/og.png"><link rel="icon" href="/favicon.ico" sizes="any"><link rel="icon" href="/logo.svg" type="image/svg+xml">
<style>body{margin:0;background:#11151b;color:#e7ebf1;font:16px/1.55 system-ui,sans-serif}main{max-width:760px;margin:0 auto;padding:28px 16px 48px}h1{font-size:26px;letter-spacing:.04em;text-transform:uppercase;margin:0 0 6px}h2{font-size:18px;margin:26px 0 10px;letter-spacing:.03em}h2 small{color:#8a97a9;font-weight:600;font-size:12px;margin-left:8px}
h3{font-size:14px;color:#ffb02e;margin:18px 0 4px}p{color:#a9b4c3;margin:6px 0}ul{padding-left:20px;color:#c9d2de}li{margin:4px 0}code{background:#19202a;padding:1px 5px;border-radius:4px;font-size:13px}a{color:#ffb02e}
.g{display:grid;grid-template-columns:repeat(auto-fill,minmax(220px,1fr));gap:10px}.c{display:grid;gap:3px;padding:14px;border:1px solid #2b3542;border-radius:12px;background:#19202a;text-decoration:none;color:#e7ebf1}.c:hover{border-color:#ffb02e}.c span{color:#8a97a9;font-size:13px}.n{margin-top:26px;font-size:14px}
.top{display:flex;align-items:center;gap:10px;margin-bottom:18px}.top b{font-size:15px;letter-spacing:.06em}.top img{width:28px;height:28px;border-radius:7px}</style>
<main><div class="top"><img src="/icon-192.png" alt=""><b>PITLANE HQ</b></div>${body}</main></html>`, "page");
var buildCache = { at: 0, build: "" };
async function latestBuild(env) {
  const now = Date.now();
  if (now - buildCache.at < 6e4) return buildCache.build;
  buildCache.at = now;
  try {
    const o = env.DL && await env.DL.get("version.json");
    const v = o ? JSON.parse(await o.text()) : null;
    buildCache.build = v && typeof v.build === "string" ? v.build : "";
  } catch (e) {
    buildCache.build = "";
  }
  return buildCache.build;
}
__name(latestBuild, "latestBuild");

// src/carfamily.js
var CAR_FAMILIES = [
  { key: "sf23", name: "Super Formula SF23", re: /^Super Formula SF23\b/i },
  { key: "cup-nextgen", name: "NASCAR Cup Series Next Gen", re: /^NASCAR Cup Series Next Gen\b/i },
  { key: "cup-gen6", name: "NASCAR Cup Series Gen 6", re: /^NASCAR (Cup|Monster Energy Cup) Series (Chevrolet|Ford|Toyota)\b/i },
  { key: "xfinity", name: "NASCAR Xfinity Series", re: /^NASCAR Xfinity\b/i },
  { key: "truck", name: "NASCAR Truck Series", re: /^NASCAR (Craftsman |Camping World |Gander (RV & )?Outdoors )?Truck\b/i },
  { key: "arca", name: "ARCA Menards Series", re: /^ARCA Menards\b/i },
  { key: "supercars-gen3", name: "Supercars Gen3", re: /^Supercars?\b.*\bGen ?3\b/i },
  { key: "supercars-gen2", name: "Supercars Gen2", re: /^Supercars? (Ford Mustang GT|Holden ZB Commodore)\b/i },
  { key: "v8supercars", name: "V8 Supercars", re: /^V8 Supercars?\b/i }
];
var famRule = /* @__PURE__ */ __name((name2) => CAR_FAMILIES.find((f) => f.re.test(String(name2 || "").trim())) || null, "famRule");
var famName = /* @__PURE__ */ __name((game, carId, name2) => {
  const f = famRule(name2);
  return f ? f.name : name2;
}, "famName");
var cache = /* @__PURE__ */ new Map();
var TTL = 5 * 6e4;
async function famId(env, game, carId) {
  const c = Math.trunc(+carId) || 0, g = game || "iracing";
  if (!c) return 0;
  const k = g + ":" + c, hit = cache.get(k);
  if (hit && Date.now() - hit.at < TTL) return hit.fam;
  const row = await env.DB.prepare("SELECT fam_id FROM car_families WHERE game=?1 AND car_id=?2").bind(g, c).first().catch(() => null);
  const fam = row ? row.fam_id : c;
  cache.set(k, { fam, at: Date.now() });
  return fam;
}
__name(famId, "famId");
async function famIds(env, game, carId) {
  const fam = await famId(env, game, carId);
  if (!fam) return [];
  const r2 = await env.DB.prepare("SELECT car_id FROM car_families WHERE game=?1 AND fam_id=?2").bind(game || "iracing", fam).all().catch(() => null);
  const ids = /* @__PURE__ */ new Set([fam, ...(r2 && r2.results || []).map((x) => x.car_id)]);
  return [...ids];
}
__name(famIds, "famIds");
var famSql = /* @__PURE__ */ __name(async (env, game, carId) => (await famIds(env, game, carId)).map((n) => String(Math.trunc(n) || 0)).join(","), "famSql");
async function famGroups(env, game) {
  const r2 = await env.DB.prepare("SELECT car_id, fam_id FROM car_families WHERE game=?1").bind(game || "iracing").all().catch(() => null);
  const by = /* @__PURE__ */ new Map();
  for (const x of r2 && r2.results || []) {
    if (!by.has(x.fam_id)) by.set(x.fam_id, /* @__PURE__ */ new Set([x.fam_id]));
    by.get(x.fam_id).add(x.car_id);
  }
  return by;
}
__name(famGroups, "famGroups");
async function noteCar(env, game, carId, name2) {
  const c = Math.trunc(+carId) || 0, g = game || "iracing", f = famRule(name2);
  if (!c || !f || c >= 9e8) return famId(env, g, c);
  const k = g + ":" + c, hit = cache.get(k);
  if (hit && Date.now() - hit.at < TTL && hit.known) return hit.fam;
  const row = await env.DB.prepare("SELECT fam_id FROM car_families WHERE game=?1 AND car_id=?2").bind(g, c).first();
  if (row) {
    cache.set(k, { fam: row.fam_id, at: Date.now(), known: true });
    return row.fam_id;
  }
  const head = await env.DB.prepare("SELECT fam_id FROM car_families WHERE game=?1 AND fam=?2 ORDER BY created LIMIT 1").bind(g, f.key).first();
  const fam = head ? head.fam_id : c;
  await env.DB.prepare("INSERT OR IGNORE INTO car_families (game, car_id, fam_id, fam, created) VALUES (?1,?2,?3,?4,?5)").bind(g, c, fam, f.key, Date.now()).run();
  if (fam !== c) await joinCar(env, g, c, fam);
  cache.set(k, { fam, at: Date.now(), known: true });
  return fam;
}
__name(noteCar, "noteCar");
async function joinCar(env, game, carId, fam) {
  await env.DB.batch([
    env.DB.prepare(`DELETE FROM community_laps WHERE game=?1 AND car_id=?3 AND EXISTS (SELECT 1 FROM community_laps o WHERE o.game=?1 AND o.car_id=?2
      AND o.user_id=community_laps.user_id AND o.track_id=community_laps.track_id AND o.time<community_laps.time)`).bind(game, carId, fam),
    env.DB.prepare("UPDATE OR IGNORE community_laps SET car_id=?3 WHERE game=?1 AND car_id=?2").bind(game, carId, fam),
    env.DB.prepare("DELETE FROM community_laps WHERE game=?1 AND car_id=?2").bind(game, carId),
    env.DB.prepare("UPDATE OR IGNORE model_laps SET car_id=?3 WHERE game=?1 AND car_id=?2").bind(game, carId, fam),
    env.DB.prepare("DELETE FROM model_laps WHERE game=?1 AND car_id=?2").bind(game, carId),
    env.DB.prepare("DELETE FROM model_cache WHERE game=?1 AND car_id IN (?2, ?3)").bind(game, carId, fam),
    env.DB.prepare("DELETE FROM car_cards WHERE game=?1 AND car_id IN (?2, ?3)").bind(game, carId, fam)
  ]);
}
__name(joinCar, "joinCar");

// src/trackgeo.js
var TURN_RADIUS = 300;
var TURN_MIN_M = 20;
var TURN_GAP_M = 60;
var SMOOTH = 3;
function curvature(x, y, step = 5) {
  const n = Math.min(x.length, y.length), k = new Array(n).fill(0);
  if (n < 20) return k;
  const at2 = /* @__PURE__ */ __name((i) => (i % n + n) % n, "at");
  const head = new Array(n);
  for (let i = 0; i < n; i++) {
    const a = at2(i - SMOOTH), b = at2(i + SMOOTH);
    head[i] = Math.atan2(y[b] - y[a], x[b] - x[a]);
  }
  for (let i = 0; i < n; i++) {
    let d = head[at2(i + 1)] - head[at2(i - 1)];
    while (d > Math.PI) d -= 2 * Math.PI;
    while (d < -Math.PI) d += 2 * Math.PI;
    k[i] = d / (2 * step);
  }
  return k;
}
__name(curvature, "curvature");
function cornersOf(x, y, step = 5, want = 0) {
  const n = Math.min(x.length, y.length);
  if (n < 20) return [];
  const k = curvature(x, y, step);
  const cs = want > 0 && want <= 60 ? fitCount(k, n, step, want) : cornersAt(k, n, step, TURN_RADIUS);
  return cs.map(({ pts, ...c }) => c);
}
__name(cornersOf, "cornersOf");
function cornersAt(k, n, step, radius) {
  const lim = 1 / radius, minPts = Math.max(2, Math.round(TURN_MIN_M / step)), gapPts = Math.round(TURN_GAP_M / step);
  const runs = [];
  let start = 0;
  while (start < n && Math.abs(k[start]) > lim) start++;
  if (start >= n) return [];
  for (let c = 0; c < n; c++) {
    const i = (start + c) % n;
    const s = Math.abs(k[i]) > lim ? Math.sign(k[i]) : 0;
    const last = runs[runs.length - 1];
    if (s && last && last.dir === s && last.open) last.pts.push(i);
    else if (s) {
      if (last) last.open = false;
      runs.push({ dir: s, pts: [i], open: true });
    } else if (last && last.open) {
      last.open = false;
    }
  }
  const merged = [];
  for (const r2 of runs) {
    const last = merged[merged.length - 1];
    const gap2 = last ? (r2.pts[0] - last.pts[last.pts.length - 1] + n) % n : 1e9;
    if (last && last.dir === r2.dir && gap2 <= gapPts) last.pts.push(...r2.pts);
    else merged.push({ dir: r2.dir, pts: r2.pts.slice() });
  }
  return order(merged.filter((r2) => r2.pts.length >= minPts).map((r2) => corner(k, r2.dir, r2.pts)));
}
__name(cornersAt, "cornersAt");
function corner(k, dir, pts) {
  let apex = pts[0];
  for (const p of pts) if (Math.abs(k[p]) > Math.abs(k[apex])) apex = p;
  return { i: apex, from: pts[0], to: pts[pts.length - 1], dir, r: Math.round(1 / Math.max(Math.abs(k[apex]), 1e-6)), pts };
}
__name(corner, "corner");
var order = /* @__PURE__ */ __name((cs) => cs.sort((a, b) => a.i - b.i), "order");
var MERGE_GAP_M = 100;
var SPLIT_MIN_M = 30;
var SPLIT_DIP = 0.6;
var RELAX = [TURN_RADIUS, 400, 550, 750, 1e3];
function fitCount(k, n, step, want) {
  let best = [];
  for (const radius of RELAX) {
    let cs = splitTo(cornersAt(k, n, step, radius), k, want, step);
    if (cs.length >= want) return reduceTo(cs, want, n, step, k);
    if (cs.length > best.length) best = cs;
  }
  return best;
}
__name(fitCount, "fitCount");
function splitTo(cs, k, want, step) {
  cs = cs.slice();
  const minPts = Math.round(SPLIT_MIN_M / step), w = 3;
  while (cs.length < want) {
    let pick = null;
    cs.forEach((c2, ci) => {
      const a = c2.pts.map((p) => Math.abs(k[p])), m = a.length;
      if (m < 2 * minPts) return;
      const peaks = [];
      for (let j = 0; j < m; j++) {
        let top = true;
        for (let d = -w; d <= w && top; d++) if (d && j + d >= 0 && j + d < m && a[j + d] > a[j]) top = false;
        if (top) peaks.push(j);
      }
      peaks.sort((p, q2) => a[q2] - a[p]);
      const p1 = peaks[0], p2 = peaks.find((p) => Math.abs(p - p1) >= minPts);
      if (p1 == null || p2 == null) return;
      const lo = Math.min(p1, p2), hi = Math.max(p1, p2);
      let dip = lo;
      for (let j = lo; j <= hi; j++) if (a[j] < a[dip]) dip = j;
      const ratio = a[dip] / Math.min(a[p1], a[p2]);
      if (ratio < SPLIT_DIP && (!pick || ratio < pick.ratio)) pick = { ci, dip, ratio };
    });
    if (!pick) break;
    const c = cs[pick.ci];
    cs.splice(pick.ci, 1, corner(k, c.dir, c.pts.slice(0, pick.dip + 1)), corner(k, c.dir, c.pts.slice(pick.dip + 1)));
    order(cs);
  }
  return cs;
}
__name(splitTo, "splitTo");
function reduceTo(cs, want, n, step, k) {
  cs = order(cs.slice());
  const gapMax = Math.round(MERGE_GAP_M / step);
  while (cs.length > want && cs.length > 1) {
    let pick = -1, best = 1e9;
    for (let j = 0; j < cs.length; j++) {
      const a = cs[j], b = cs[(j + 1) % cs.length];
      if (a === b || a.dir !== b.dir) continue;
      const gap2 = (b.from - a.to + n) % n;
      if (gap2 <= gapMax && gap2 < best) {
        best = gap2;
        pick = j;
      }
    }
    if (pick >= 0) {
      const a = cs[pick], j2 = (pick + 1) % cs.length, b = cs[j2];
      const joined = corner(k, a.dir, a.pts.concat(b.pts));
      cs = cs.filter((c, j) => j !== pick && j !== j2);
      cs.push(joined);
    } else {
      let g = 0;
      cs.forEach((c, j) => {
        if (c.r > cs[g].r) g = j;
      });
      cs.splice(g, 1);
    }
    order(cs);
  }
  return cs;
}
__name(reduceTo, "reduceTo");
function turnsFromPath(x, y, want = 0) {
  const n = Math.min(x.length, y.length);
  return cornersOf(x, y, 5, want).map((c) => Math.round(c.i / n * 1e5) / 1e5);
}
__name(turnsFromPath, "turnsFromPath");
function lineOffsets(ax, ay, bx, by) {
  const n = Math.min(ax.length, ay.length, bx.length, by.length);
  if (n < 60) return null;
  const lat = new Array(n), lon = new Array(n);
  for (let i = 0; i < n; i++) {
    const i0 = Math.max(0, i - 2), i1 = Math.min(n - 1, i + 2);
    let tx = bx[i1] - bx[i0], ty = by[i1] - by[i0];
    const tm = Math.hypot(tx, ty) || 1;
    tx /= tm;
    ty /= tm;
    const dx = ax[i] - bx[i], dy = ay[i] - by[i];
    lat[i] = -ty * dx + tx * dy;
    lon[i] = tx * dx + ty * dy;
  }
  const W2 = 80, sm = /* @__PURE__ */ __name((v) => {
    const pre = [0];
    v.forEach((x, i) => pre.push(pre[i] + x));
    return v.map((x, i) => {
      const lo = Math.max(0, i - W2), hi = Math.min(n - 1, i + W2);
      return x - (pre[hi + 1] - pre[lo]) / (hi - lo + 1);
    });
  }, "sm");
  const lc = sm(lat), oc = sm(lon), ab = oc.map(Math.abs).sort((p, q2) => p - q2);
  if (ab[n >> 1] > 6) return null;
  return lc.map((v, i) => Math.abs(oc[i]) > 20 || Math.abs(v) > 25 ? NaN : v);
}
__name(lineOffsets, "lineOffsets");
function sameFrame(a, b) {
  if (!a || !b || !!a.g !== !!b.g) return null;
  if (!a.g || a.g[0] === b.g[0] && a.g[1] === b.g[1]) return b;
  const dx = (b.g[1] - a.g[1]) * 111320 * Math.cos(a.g[0] * Math.PI / 180), dy = (b.g[0] - a.g[0]) * 110540;
  return { ...b, x: b.x.map((v) => v + dx), y: b.y.map((v) => v + dy) };
}
__name(sameFrame, "sameFrame");
function insideSign(bx, by, apex) {
  const n = Math.min(bx.length, by.length);
  if (apex <= 0 || apex >= n - 1) return 0;
  const tan = /* @__PURE__ */ __name((i) => {
    const i0 = Math.max(0, i - 2), i1 = Math.min(n - 1, i + 2), tx = bx[i1] - bx[i0], ty = by[i1] - by[i0], m = Math.hypot(tx, ty) || 1;
    return [tx / m, ty / m];
  }, "tan");
  const t1 = tan(Math.max(0, apex - 8)), t2 = tan(Math.min(n - 1, apex + 8)), cr = t1[0] * t2[1] - t1[1] * t2[0];
  if (Math.abs(cr) < 0.05) return 0;
  return cr < 0 ? -1 : 1;
}
__name(insideSign, "insideSign");

// src/crypt.js
var enc = new TextEncoder();
var dec = new TextDecoder();
var b64 = /* @__PURE__ */ __name((b) => btoa(String.fromCharCode(...new Uint8Array(b))), "b64");
var unb64 = /* @__PURE__ */ __name((s) => Uint8Array.from(atob(s), (c) => c.charCodeAt(0)), "unb64");
var keyCache = null;
async function dataKey(env) {
  if (!env.DATA_KEY) return null;
  if (keyCache && keyCache.src === env.DATA_KEY) return keyCache.key;
  const raw = await crypto.subtle.digest("SHA-256", enc.encode("trackiq-data-v1:" + env.DATA_KEY));
  const key = await crypto.subtle.importKey("raw", raw, { name: "AES-GCM" }, false, ["encrypt", "decrypt"]);
  keyCache = { src: env.DATA_KEY, key };
  return key;
}
__name(dataKey, "dataKey");
async function sealData(env, s) {
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
__name(sealData, "sealData");
async function openData(env, s) {
  if (typeof s !== "string" || !s.startsWith("enc:")) return s;
  const key = await dataKey(env);
  if (!key) throw new Error("DATA_KEY is not set on this server: sealed data cannot be read");
  const all = unb64(s.slice(4));
  const pt = await crypto.subtle.decrypt({ name: "AES-GCM", iv: all.subarray(0, 12), additionalData: enc.encode("trackiq-data") }, key, all.subarray(12));
  return dec.decode(pt);
}
__name(openData, "openData");
var B32 = "ABCDEFGHIJKLMNOPQRSTUVWXYZ234567";
function base32(bytes) {
  let bits = 0, val = 0, out = "";
  for (const b of bytes) {
    val = val << 8 | b;
    bits += 8;
    while (bits >= 5) {
      out += B32[val >>> bits - 5 & 31];
      bits -= 5;
    }
  }
  if (bits > 0) out += B32[val << 5 - bits & 31];
  return out;
}
__name(base32, "base32");
function unbase32(s) {
  const clean2 = String(s || "").toUpperCase().replace(/[^A-Z2-7]/g, "");
  let bits = 0, val = 0;
  const out = [];
  for (const c of clean2) {
    val = val << 5 | B32.indexOf(c);
    bits += 5;
    if (bits >= 8) {
      out.push(val >>> bits - 8 & 255);
      bits -= 8;
    }
  }
  return new Uint8Array(out);
}
__name(unbase32, "unbase32");
var newTotpSecret = /* @__PURE__ */ __name(() => base32(crypto.getRandomValues(new Uint8Array(20))), "newTotpSecret");
async function hotp(secret, counter) {
  const key = await crypto.subtle.importKey("raw", unbase32(secret), { name: "HMAC", hash: "SHA-1" }, false, ["sign"]);
  const msg = new Uint8Array(8);
  for (let i = 7; i >= 0; i--) {
    msg[i] = counter & 255;
    counter = Math.floor(counter / 256);
  }
  const h = new Uint8Array(await crypto.subtle.sign("HMAC", key, msg));
  const o = h[19] & 15;
  const code = ((h[o] & 127) << 24 | h[o + 1] << 16 | h[o + 2] << 8 | h[o + 3]) % 1e6;
  return String(code).padStart(6, "0");
}
__name(hotp, "hotp");
async function totpOK(secret, code) {
  const c = String(code || "").replace(/\s+/g, "");
  if (!/^\d{6}$/.test(c)) return false;
  const now = Math.floor(Date.now() / 3e4);
  for (const d of [0, -1, 1]) if (await hotp(secret, now + d) === c) return true;
  return false;
}
__name(totpOK, "totpOK");
var otpauthURL = /* @__PURE__ */ __name((secret, label, issuer = "Pitlane HQ") => `otpauth://totp/${encodeURIComponent(issuer)}:${encodeURIComponent(label)}?secret=${secret}&issuer=${encodeURIComponent(issuer)}&algorithm=SHA1&digits=6&period=30`, "otpauthURL");
function newRecoveryCodes() {
  const a = "abcdefghjkmnpqrstuvwxyz23456789";
  return Array.from({ length: 8 }, () => {
    const r2 = crypto.getRandomValues(new Uint8Array(8));
    const s = [...r2].map((x) => a[x % a.length]).join("");
    return s.slice(0, 4) + "-" + s.slice(4);
  });
}
__name(newRecoveryCodes, "newRecoveryCodes");

// src/pedals.js
var BIN = 5;
var VSTEP = 5;
var BANDS = 18;
var MIN_SAMPLES = 8;
var band = /* @__PURE__ */ __name((v) => Math.max(0, Math.min(BANDS - 1, Math.floor(v / VSTEP))), "band");
var clamp01 = /* @__PURE__ */ __name((x) => x < 0 ? 0 : x > 1 ? 1 : x, "clamp01");
var q = /* @__PURE__ */ __name((a, p) => {
  if (!a.length) return null;
  const s = [...a].sort((x, y) => x - y);
  return s[Math.min(s.length - 1, Math.max(0, Math.round(p * (s.length - 1))))];
}, "q");
function smooth(v, w) {
  const n = v.length, out = new Array(n);
  for (let i = 0; i < n; i++) {
    let s = 0, k = 0;
    for (let j = i - w; j <= i + w; j++) if (j >= 0 && j < n) {
      s += v[j];
      k++;
    }
    out[i] = Math.max(1, s / k);
  }
  return out;
}
__name(smooth, "smooth");
function accel(v, span) {
  const n = v.length, a = new Array(n);
  for (let i = 0; i < n; i++) {
    const p = Math.max(0, i - span), r2 = Math.min(n - 1, i + span);
    a[i] = r2 > p ? (v[r2] * v[r2] - v[p] * v[p]) / (2 * BIN * (r2 - p)) : 0;
  }
  return a;
}
__name(accel, "accel");
function fill(arr) {
  const idx = arr.map((x, i) => x == null ? -1 : i).filter((i) => i >= 0);
  if (!idx.length) return null;
  return arr.map((x, i) => {
    if (x != null) return x;
    const lo = idx.filter((j) => j < i).pop(), hi = idx.find((j) => j > i);
    if (lo == null) return arr[hi];
    if (hi == null) return arr[lo];
    return arr[lo] + (arr[hi] - arr[lo]) * (i - lo) / (hi - lo);
  });
}
__name(fill, "fill");
function pedalEnvelope(laps) {
  const full = Array.from({ length: BANDS }, () => []), coast = Array.from({ length: BANDS }, () => []), brake = Array.from({ length: BANDS }, () => []);
  for (const bins of laps) {
    if (!Array.isArray(bins) || bins.length < 60) continue;
    const v = smooth(bins.map((b2) => +b2[0] || 0), 1), a = accel(v, 2);
    for (let i = 2; i < bins.length - 2; i++) {
      const thr = +bins[i][2] || 0, brk = +bins[i][3] || 0, b2 = band(v[i]);
      let steady = true;
      for (let j = i - 2; j <= i + 2; j++) if (Math.abs((+bins[j][2] || 0) - thr) > 0.1 || Math.abs(j - i) < 2 && Math.abs((+bins[j][3] || 0) - brk) > 0.15) steady = false;
      if (!steady) continue;
      if (thr >= 0.97 && brk < 0.02) full[b2].push(a[i]);
      else if (thr < 0.03 && brk < 0.02) coast[b2].push(a[i]);
      else if (brk >= 0.7 && thr < 0.03) brake[b2].push(-a[i] / brk);
    }
  }
  const pick = /* @__PURE__ */ __name((arr, p) => arr.map((s) => s.length >= MIN_SAMPLES ? q(s, p) : null), "pick");
  const f = fill(pick(full, 0.6)), c = fill(pick(coast, 0.5)), b = fill(pick(brake, 0.8));
  if (!f || !b) return null;
  const r2 = /* @__PURE__ */ __name((x) => Math.round(x * 100) / 100, "r2");
  return { full: f.map(r2), coast: (c || GUESS_COAST).map(r2), brake: b.map(r2) };
}
__name(pedalEnvelope, "pedalEnvelope");
var GUESS_COAST = Array.from({ length: BANDS }, (_, k) => -(0.6 + 5e-4 * (k * VSTEP + VSTEP / 2) ** 2));
function ownEnvelope(v, a) {
  const up = Array.from({ length: BANDS }, () => []), dn = Array.from({ length: BANDS }, () => []);
  for (let i = 0; i < v.length; i++) (a[i] >= 0 ? up : dn)[band(v[i])].push(Math.abs(a[i]));
  const f = fill(up.map((s) => s.length >= 3 ? q(s, 0.9) : null)) || new Array(BANDS).fill(4);
  const b = fill(dn.map((s) => s.length >= 3 ? q(s, 0.95) : null)) || new Array(BANDS).fill(10);
  return { full: f, coast: GUESS_COAST, brake: b.map((x) => Math.max(x, 4)) };
}
__name(ownEnvelope, "ownEnvelope");
function at(env, v) {
  const x = v / VSTEP - 0.5, i = Math.max(0, Math.min(BANDS - 2, Math.floor(x))), f = Math.max(0, Math.min(1, x - i));
  return env[i] + (env[i + 1] - env[i]) * f;
}
__name(at, "at");
function estimatePedals(bins, pe, shifts) {
  if (!Array.isArray(bins) || bins.length < 20) return bins;
  const raw = bins.map((b) => +b[0] || 0);
  const v = smooth(raw, 2), a = accel(v, 3), vb = smooth(raw, 1), ab = accel(vb, 2);
  const env = pe && Array.isArray(pe.full) && pe.full.length === BANDS ? pe : ownEnvelope(v, a);
  const n = bins.length, thr = new Array(n), brk = new Array(n);
  for (let i = 0; i < n; i++) {
    const f = Math.max(0.3, at(env.full, v[i])), c = Math.min(f - 0.2, at(env.coast, v[i])), b = Math.max(2, at(env.brake, v[i]));
    if (ab[i] < c - 1.5 && a[i] < c - 0.4) {
      brk[i] = clamp01((c - ab[i]) / (b + c));
      thr[i] = 0;
    } else if (a[i] > c + 0.2) {
      thr[i] = clamp01((a[i] - c) / (f - c));
      brk[i] = 0;
    } else {
      thr[i] = 0;
      brk[i] = 0;
    }
    if (thr[i] > 0.92) thr[i] = 1;
  }
  const sm = /* @__PURE__ */ __name((x) => x.map((_, i) => (x[Math.max(0, i - 1)] + x[i] + x[Math.min(n - 1, i + 1)]) / 3), "sm");
  const T3 = sm(thr), B = brk;
  const ups = (Array.isArray(shifts) ? shifts : []).filter((s) => Array.isArray(s) && s[1] > 0).sort((x, y) => x[0] - y[0]);
  return bins.map((x, i) => {
    let g = +x[4] || 0;
    if (ups.length) {
      g = 1;
      for (const [gear, sp] of ups) if (v[i] > sp) g = gear + 1;
    }
    return [x[0], x[1], Math.round(T3[i] * 100) / 100, Math.round(B[i] * 100) / 100, g, x[5] || 0];
  });
}
__name(estimatePedals, "estimatePedals");
function estimateTrace(tr2, pe, shifts) {
  if (!tr2 || tr2.src !== "field" || !Array.isArray(tr2.d)) return tr2;
  const bins = tr2.d.map((x) => [+x[0], +x[5], +x[1] || 0, +x[2] || 0, +x[3] || 0, +x[4] || 0]);
  const est = estimatePedals(bins, pe, shifts);
  return { ...tr2, d: tr2.d.map((x, i) => [x[0], est[i][2], est[i][3], est[i][4], x[4], x[5]]), est: 2 };
}
__name(estimateTrace, "estimateTrace");

// src/model.js
var MODEL_VERSION = 11;
var CARD_VERSION = 2;
var SEG_M = 250;
var MAX_LAPS = 80;
var LEARN_PER_RUN = 120;
var LADDER_STEP = 4e-3;
var LADDER_SPAN = 0.08;
var LEVEL_BIN = 2;
var CMP_MIN = 5;
var CMP_DRIVERS = 3;
var median = /* @__PURE__ */ __name((a) => {
  const v = a.filter((x) => x != null && isFinite(x)).sort((x, y) => x - y);
  if (!v.length) return null;
  const m = v.length >> 1;
  return v.length % 2 ? v[m] : (v[m - 1] + v[m]) / 2;
}, "median");
var r = /* @__PURE__ */ __name((v, d) => v == null || !isFinite(v) ? 0 : Math.round(v * d) / d, "r");
var tAt = /* @__PURE__ */ __name((l, i) => {
  const b = l.bins[Math.min(i, l.bins.length - 1)];
  return b ? b[1] : null;
}, "tAt");
function segTimes(l, M, n) {
  const out = [], step = n / M;
  for (let k = 0; k < M; k++) {
    const s = Math.round(k * step), e = k === M - 1 ? n - 1 : Math.round((k + 1) * step);
    const a = tAt(l, s), b = k === M - 1 ? l.time : tAt(l, e);
    out.push(a != null && b != null && b > a ? b - a : null);
  }
  return out;
}
__name(segTimes, "segTimes");
function goodLap(time, tr2) {
  if (!tr2 || !Array.isArray(tr2.d) || tr2.d.length < 60) return null;
  if (Array.isArray(tr2.f) && tr2.f.includes("traffic")) return null;
  if (Array.isArray(tr2.f) && tr2.f.includes("wet")) return null;
  const bins = tr2.d.map((x) => [+x[0], +x[5], Math.min(1, Math.max(0, +x[1] || 0)), Math.min(1, Math.max(0, +x[2] || 0)), +x[3], +x[4]]);
  let back = 0, jumps = 0, prev = -1, prevV = null;
  for (const b of bins) {
    if (!(b[0] >= 0 && b[0] < 130) || !isFinite(b[1])) return null;
    if (b[1] < prev - 0.05) back++;
    prev = b[1];
    if (prevV != null && Math.abs(b[0] - prevV) > 10) jumps++;
    prevV = b[0];
  }
  if (back > 2 || jumps > 2) return null;
  if (bins[bins.length - 1][1] > time + 2) return null;
  return { time, bins, field: tr2.src === "field", rival: tr2.src === "real" };
}
__name(goodLap, "goodLap");
function lapCompound(tr2) {
  const f = tr2 && Array.isArray(tr2.f) ? tr2.f.find((x) => typeof x === "string" && /^cmp:\d+$/.test(x)) : null;
  if (f) return +f.slice(4);
  return tr2 && (tr2.src === "field" || tr2.src === "real") ? -1 : 0;
}
__name(lapCompound, "lapCompound");
var sha = /* @__PURE__ */ __name(async (t) => [...new Uint8Array(await crypto.subtle.digest("SHA-256", new TextEncoder().encode(t)))].map((x) => x.toString(16).padStart(2, "0")).join("").slice(0, 24), "sha");
async function adoptOldSessions(env, game, trackId, carId) {
  const names = await env.DB.prepare(
    `SELECT track, car FROM community_laps WHERE track_id=?1 AND car_id=?2 AND game=?3
     UNION SELECT track, car FROM community_reports WHERE track_id=?1 AND car_id=?2 AND game=?3 LIMIT 20`
  ).bind(trackId, carId, game).all();
  const full = [];
  for (const n of names.results || []) {
    if (!n.track || !n.car) continue;
    full.push(n.track);
    await env.DB.prepare(
      `UPDATE sessions SET track_id=?1, car_id=?2 WHERE (track_id IS NULL OR car_id IS NULL) AND game=?3 AND car=?4
         AND ((track||' \xB7 '||COALESCE(track_config,''))=?5 OR (track=?5 AND COALESCE(track_config,'')=''))`
    ).bind(trackId, carId, game, n.car, n.track).run().catch(() => {
    });
  }
  if (full.length) {
    const ph = full.map((_, i) => "?" + (i + 4)).join(",");
    await env.DB.prepare(
      `UPDATE sessions SET track_id=NULL, car_id=NULL WHERE track_id=?1 AND car_id=?2 AND game=?3 AND COALESCE(track_config,'')<>''
         AND (track||' \xB7 '||track_config) NOT IN (${ph})`
    ).bind(trackId, carId, game, ...full).run().catch(() => {
    });
  }
}
__name(adoptOldSessions, "adoptOldSessions");
async function learnNewLaps(env, game, trackId, carId) {
  const known = new Map(((await env.DB.prepare("SELECT k, cmp FROM model_laps WHERE game=?1 AND track_id=?2 AND car_id=?3").bind(game, trackId, carId).all()).results || []).map((x) => [x.k, x.cmp]));
  const a = await env.DB.prepare(
    `SELECT s.uploader AS up, a.time, a.trace, s.track_temp AS temp FROM laps a JOIN sessions s ON s.id=a.session_id
     WHERE s.track_id=?1 AND (s.car_id=?2 OR s.car_id IN (${await famSql(env, game, carId)})) AND s.game=?3 AND s.uploader LIKE 'acct:%' AND a.valid=1 AND a.time>10 AND a.trace IS NOT NULL
       AND LOWER(COALESCE(s.kind,'')) NOT LIKE '%test%' AND (COALESCE(s.official,1)<>0 OR s.ai=1)
     ORDER BY a.time LIMIT 3000`
  ).bind(trackId, carId, game).all();
  const c = await env.DB.prepare(
    `SELECT 'acct:'||user_id AS up, time, trace, NULL AS temp FROM community_laps WHERE track_id=?1 AND car_id=?2 AND game=?3 AND trace IS NOT NULL AND (COALESCE(official,1)<>0 OR ai=1) ORDER BY time LIMIT 800`
  ).bind(trackId, carId, game).all();
  const out = await env.DB.prepare(
    `SELECT s.uploader AS up, a.time FROM laps a JOIN sessions s ON s.id=a.session_id
     WHERE s.track_id=?1 AND (s.car_id=?2 OR s.car_id IN (${await famSql(env, game, carId)})) AND s.game=?3 AND s.uploader LIKE 'acct:%' AND a.valid=1 AND a.time>10 AND a.trace IS NOT NULL
       AND (LOWER(COALESCE(s.kind,'')) LIKE '%test%' OR (s.official=0 AND COALESCE(s.ai,0)=0)) LIMIT 3000`
  ).bind(trackId, carId, game).all();
  for (const x of out.results || []) {
    const k = await sha(x.up + ":" + x.time.toFixed(3));
    if (!known.has(k)) continue;
    known.delete(k);
    await env.DB.prepare("DELETE FROM model_laps WHERE game=?1 AND track_id=?2 AND car_id=?3 AND k=?4").bind(game, trackId, carId, k).run();
  }
  let added = 0, read = 0;
  for (const x of [...a.results || [], ...c.results || []]) {
    const k = await sha(x.up + ":" + x.time.toFixed(3));
    const old = known.has(k);
    if (old && known.get(k) != null) continue;
    if (added + read >= LEARN_PER_RUN) return { added, more: true };
    let tr2 = null;
    try {
      tr2 = JSON.parse(await openData(env, x.trace));
    } catch (e) {
      tr2 = null;
    }
    if (old) {
      read++;
      const cmp = tr2 ? lapCompound(tr2) : -1;
      known.set(k, cmp);
      await env.DB.prepare("UPDATE model_laps SET cmp=?5 WHERE game=?1 AND track_id=?2 AND car_id=?3 AND k=?4").bind(game, trackId, carId, k, cmp).run();
      continue;
    }
    if (!tr2) {
      known.set(k, -1);
      continue;
    }
    known.set(k, -1);
    if (!goodLap(x.time, tr2)) continue;
    await env.DB.prepare("INSERT INTO model_laps (game, track_id, car_id, k, drv, time, data, created, temp, cmp) VALUES (?1,?2,?3,?4,?5,?6,?7,?8,?9,?10) ON CONFLICT DO NOTHING").bind(game, trackId, carId, k, await sha("drv:" + x.up), x.time, await gz(JSON.stringify(tr2.src === "field" || tr2.src === "real" ? { d: tr2.d, src: tr2.src } : tr2.d)), Date.now(), typeof x.temp === "number" && isFinite(x.temp) ? x.temp : null, lapCompound(tr2)).run();
    added++;
  }
  return { added, more: false };
}
__name(learnNewLaps, "learnNewLaps");
async function lapPath(env, game, trackId, carId, time) {
  const ok = /* @__PURE__ */ __name((tr2) => tr2 && Array.isArray(tr2.x) && Array.isArray(tr2.y) && tr2.x.length > 10 && tr2.x.length === tr2.y.length, "ok");
  const open = /* @__PURE__ */ __name(async (row) => {
    if (!row || !row.trace) return null;
    try {
      const tr2 = JSON.parse(await openData(env, row.trace));
      return ok(tr2) ? { x: tr2.x, y: tr2.y, g: Array.isArray(tr2.g) && tr2.g.length === 2 ? tr2.g : null } : null;
    } catch (e) {
      return null;
    }
  }, "open");
  const c = await env.DB.prepare("SELECT trace FROM community_laps WHERE track_id=?1 AND car_id=?2 AND game=?3 AND abs(time-?4)<0.0006 AND trace IS NOT NULL LIMIT 3").bind(trackId, carId, game, time).all();
  for (const row of c.results || []) {
    const p = await open(row);
    if (p) return p;
  }
  const a = await env.DB.prepare(
    `SELECT a.trace FROM laps a JOIN sessions s ON s.id=a.session_id
     WHERE s.track_id=?1 AND (s.car_id=?2 OR s.car_id IN (${await famSql(env, game, carId)})) AND s.game=?3 AND abs(a.time-?4)<0.0006 AND a.trace IS NOT NULL LIMIT 3`
  ).bind(trackId, carId, game, time).all();
  for (const row of a.results || []) {
    const p = await open(row);
    if (p) return p;
  }
  return null;
}
__name(lapPath, "lapPath");
var memTrace = /* @__PURE__ */ __name((v) => Array.isArray(v) ? { d: v } : { d: v.d, src: v.src }, "memTrace");
function pickLaps(rows) {
  const drivers = new Set(rows.map((x) => x.drv)).size;
  const cap2 = drivers < 3 ? 10 : 3;
  const per = /* @__PURE__ */ new Map();
  for (const x of rows) {
    const l = per.get(x.drv) || [];
    if (l.length >= cap2) continue;
    l.push(x);
    per.set(x.drv, l);
  }
  const rounds = Array.from({ length: cap2 }, () => []);
  for (const l of per.values()) l.forEach((x, i) => rounds[i].push(x));
  const pick = [];
  for (const rd of rounds) for (const x of rd.sort((p, q2) => p.time - q2.time)) if (pick.length < MAX_LAPS) pick.push(x);
  return pick;
}
__name(pickLaps, "pickLaps");
function compoundsOf(rows) {
  const n = /* @__PURE__ */ new Map(), d = /* @__PURE__ */ new Map();
  for (const x of rows) {
    if (typeof x.cmp !== "number" || x.cmp < 0) continue;
    n.set(x.cmp, (n.get(x.cmp) || 0) + 1);
    if (!d.has(x.cmp)) d.set(x.cmp, /* @__PURE__ */ new Set());
    d.get(x.cmp).add(x.drv);
  }
  if (n.size < 2) return [];
  return [...n.entries()].filter(([c, k]) => k >= CMP_MIN && d.get(c).size >= CMP_DRIVERS).map(([c]) => c).sort((p, q2) => p - q2);
}
__name(compoundsOf, "compoundsOf");
async function candidates(env, game, trackId, carId) {
  await adoptOldSessions(env, game, trackId, carId);
  const learnt = await learnNewLaps(env, game, trackId, carId);
  const rows = (await env.DB.prepare("SELECT drv, time, data, temp, cmp FROM model_laps WHERE game=?1 AND track_id=?2 AND car_id=?3 ORDER BY time LIMIT 5000").bind(game, trackId, carId).all()).results || [];
  const drivers = new Set(rows.map((x) => x.drv)).size;
  const open = /* @__PURE__ */ new Map();
  let card;
  const lapsOf = /* @__PURE__ */ __name(async (pick) => {
    const out = [];
    for (const x of pick) {
      if (!open.has(x)) {
        let g2 = null;
        try {
          g2 = goodLap(x.time, memTrace(JSON.parse(await gunz(x.data))));
        } catch (e) {
        }
        if (g2) {
          g2.up = x.drv;
          g2.temp = typeof x.temp === "number" ? x.temp : null;
          g2.cmp = typeof x.cmp === "number" && x.cmp >= 0 ? x.cmp : null;
          if (g2.field) {
            if (card === void 0) card = await getCarCard(env, game, carId).catch(() => null);
            g2.bins = estimatePedals(g2.bins, card && card.pedals, card && card.shifts);
          }
        }
        open.set(x, g2);
      }
      const g = open.get(x);
      if (g) out.push(g);
    }
    return out;
  }, "lapsOf");
  const laps = await lapsOf(pickLaps(rows));
  const byCmp = /* @__PURE__ */ new Map();
  for (const c of compoundsOf(rows)) byCmp.set(c, await lapsOf(pickLaps(rows.filter((x) => x.cmp === c))));
  return { laps, byCmp, drivers, more: learnt.more, added: learnt.added };
}
__name(candidates, "candidates");
var CORNER_FAST = 0.3;
var CORNER_MIN = 3;
var CORNER_MAX = 12;
var SAME_ZONE = 20;
function brakeZones(bins, n) {
  const out = [];
  for (let i = 1; i < n; i++) {
    const a = bins[i], b = bins[i - 1];
    if (!a || !b) continue;
    if (a[3] > 0.12 && b[3] <= 0.12) {
      let k = i, vmin = a[0], imin = i;
      while (k < n && k < i + 120 && bins[k] && !(bins[k][2] > 0.6 && bins[k][3] < 0.05)) {
        if (bins[k][0] < vmin) {
          vmin = bins[k][0];
          imin = k;
        }
        k++;
      }
      if (a[0] - vmin > 4) out.push({ i, vmin, imin });
      i = k;
    }
  }
  return out;
}
__name(brakeZones, "brakeZones");
var BANDS2 = ["cold", "mild", "hot"];
var bandOf = /* @__PURE__ */ __name((t) => typeof t === "number" && isFinite(t) ? t < 25 ? "cold" : t > 35 ? "hot" : "mild" : null, "bandOf");
var cornerTime = /* @__PURE__ */ __name((bins, z, n) => {
  const i0 = Math.max(0, z.i - 10), i1 = Math.min(n - 1, z.imin + 30);
  return bins[i0] && bins[i1] ? bins[i1][1] - bins[i0][1] : null;
}, "cornerTime");
var sd = /* @__PURE__ */ __name((a) => {
  if (a.length < 3) return null;
  const mu = a.reduce((p, q2) => p + q2, 0) / a.length;
  return Math.sqrt(a.reduce((p, q2) => p + (q2 - mu) * (q2 - mu), 0) / a.length);
}, "sd");
function fastPicks(sorted) {
  const seen2 = /* @__PURE__ */ new Set(), fast = [];
  for (const l of sorted) {
    if (seen2.has(l.up)) continue;
    seen2.add(l.up);
    fast.push(l);
  }
  return fast.slice(0, Math.min(CORNER_MAX, Math.max(CORNER_MIN, Math.round(fast.length * CORNER_FAST))));
}
__name(fastPicks, "fastPicks");
function cornerCard(sorted, fastest, n) {
  const pick = fastPicks(sorted);
  if (pick.length < CORNER_MIN) return [];
  const zones = pick.map((l) => brakeZones(l.bins, n)), out = [];
  const range = /* @__PURE__ */ __name((ls, zs, z) => {
    const bp = [], va = [];
    zs.forEach((q2, k) => {
      if (!ls[k]) return;
      const m = q2.filter((x) => Math.abs(x.i - z.i) <= SAME_ZONE).sort((p, w) => Math.abs(p.i - z.i) - Math.abs(w.i - z.i))[0];
      if (m) {
        bp.push(m.i * 5);
        va.push(m.vmin);
      }
    });
    if (bp.length < CORNER_MIN) return null;
    bp.sort((a, b) => a - b);
    va.sort((a, b) => a - b);
    return { b0: bp[0], b1: bp[bp.length - 1], v0: r(va[0], 10), v1: r(va[va.length - 1], 10), n: bp.length };
  }, "range");
  for (const z of brakeZones(fastest.bins, n)) {
    const all = range(pick.map(() => true), zones, z);
    if (!all) continue;
    const c = { d: z.i * 5, apex: z.imin * 5, ...all };
    const bands = {};
    for (const b of BANDS2) {
      const rg = range(pick.map((l) => bandOf(l.temp) === b), zones, z);
      if (rg) bands[b] = rg;
    }
    if (Object.keys(bands).length) c.bands = bands;
    const ts = sorted.map((l) => cornerTime(l.bins, z, n)).filter((t) => t != null);
    const spread = sd(ts);
    if (spread != null) c.spread = r(spread, 1e3);
    out.push(c);
  }
  return out;
}
__name(cornerCard, "cornerCard");
function levelStep(pick, laps, zones, n) {
  const G = laps.filter((l) => l !== pick && l.time > pick.time && l.time <= pick.time * 1.03);
  if (G.length < 2) return [];
  const out = [];
  for (const z of zones) {
    const tp = cornerTime(pick.bins, z, n);
    if (tp == null) continue;
    const d = G.map((l) => cornerTime(l.bins, z, n)).filter((t) => t != null).map((t) => t - tp).sort((a, b) => a - b);
    if (d.length < 2) continue;
    const gain = d[d.length >> 1];
    if (gain > 0.03) out.push({ apex: z.imin * 5, gain: r(gain, 1e3) });
  }
  return out.sort((a, b) => b.gain - a.gain).slice(0, 3);
}
__name(levelStep, "levelStep");
function lineRanges(record2, recPath2, picks, zones, n) {
  if (!recPath2 || recPath2.x.length < n) return [];
  const offs = [];
  for (const { lap, path } of picks) {
    if (lap === record2) continue;
    const p = sameFrame(recPath2, path);
    if (!p || p.x.length < n) continue;
    const o = lineOffsets(p.x.slice(0, n), p.y.slice(0, n), recPath2.x.slice(0, n), recPath2.y.slice(0, n));
    if (o) offs.push(o);
  }
  if (offs.length < CORNER_MIN) return [];
  const out = [];
  for (const z of zones) {
    const sg = insideSign(recPath2.x, recPath2.y, z.imin);
    if (!sg) continue;
    const at2 = /* @__PURE__ */ __name((i) => {
      const v = [];
      for (const o of offs) {
        let s = 0, c2 = 0;
        for (let k = Math.max(0, i - 2); k <= Math.min(n - 1, i + 2); k++) if (!isNaN(o[k])) {
          s += o[k];
          c2++;
        }
        if (c2) v.push(s / c2 * sg);
      }
      return v;
    }, "at");
    const rg = /* @__PURE__ */ __name((v) => {
      if (v.length < CORNER_MIN) return null;
      v.sort((a2, b2) => a2 - b2);
      return [r(v[0], 10), r(v[v.length - 1], 10)];
    }, "rg");
    const a = rg(at2(z.i)), b = rg(at2(z.imin)), c = rg(at2(Math.min(n - 1, z.imin + 16)));
    if (a && b && c) out.push({ apex: z.imin * 5, in: a, at: b, out: c, n: offs.length });
  }
  return out;
}
__name(lineRanges, "lineRanges");
function cleanLaps(raw) {
  if (raw.length < 2) return raw.slice();
  const len = median(raw.map((l) => l.bins.length));
  let laps = raw.filter((l) => Math.abs(l.bins.length - len) <= len * 0.03);
  laps = laps.filter((l) => {
    let t = 0, n = 0;
    for (const b of l.bins) if (b[0] > 0.5) {
      t += 5 / b[0];
      n++;
    }
    return n >= l.bins.length * 0.9 && Math.abs(t - l.time) / l.time < 0.04;
  });
  const tMed = median(laps.map((l) => l.time));
  laps = laps.filter((l) => l.time <= tMed * 1.12);
  if (laps.length >= 3) {
    const nb = Math.min(...laps.map((l) => l.bins.length)), prof = [];
    for (let i = 0; i < nb; i++) prof.push(median(laps.map((l) => l.bins[i][0])));
    const M0 = Math.max(8, Math.round(nb * 5 / SEG_M));
    laps.forEach((l) => {
      l.seg0 = segTimes(l, M0, nb);
    });
    const segMed = [];
    for (let k = 0; k < M0; k++) segMed.push(median(laps.map((l) => l.seg0[k])));
    laps = laps.filter((l) => {
      let dev = 0;
      for (let i = 0; i < nb; i++) dev += Math.abs(l.bins[i][0] - prof[i]) / Math.max(prof[i], 5);
      if (dev / nb > 0.2) return false;
      return l.seg0.every((v, k) => v == null || segMed[k] == null || v >= segMed[k] * 0.88);
    });
  }
  return laps;
}
__name(cleanLaps, "cleanLaps");
async function refsOf(laps, pathFor) {
  const n = Math.min(...laps.map((l) => l.bins.length)), M = Math.max(8, Math.round(n * 5 / SEG_M));
  laps.forEach((l) => {
    l.seg = segTimes(l, M, n);
  });
  const fastest = laps.reduce((a, b) => b.time < a.time ? b : a);
  const record2 = fastest.bins.slice(0, n).map((b) => [r(b[0], 10), r(b[1], 1e3), r(b[2], 100), r(b[3], 100), Math.round(b[4] || 0), r(b[5], 100)]);
  const compact = /* @__PURE__ */ __name((l) => {
    const out2 = [];
    for (let i = 0; i < n; i += LEVEL_BIN) {
      const b = l.bins[i];
      out2.push([r(b[0], 10), r(b[1], 1e3), r(b[2], 100), r(b[3], 100), Math.round(b[4] || 0)]);
    }
    return out2;
  }, "compact");
  const sorted = laps.slice().sort((a, b) => a.time - b.time);
  const corners = cornerCard(sorted, fastest, n);
  const zr = brakeZones(fastest.bins, n);
  const ladder = [];
  for (let j = 0; j * LADDER_STEP <= LADDER_SPAN; j++) {
    const t = fastest.time * (1 + j * LADDER_STEP);
    let g = sorted.filter((l) => l.time < t * 0.997 && l.time > t * 0.97);
    if (!g.length) g = sorted.filter((l) => l.time < t * 0.997);
    const real = g.filter((l) => !l.field);
    const pick = real.length ? real[real.length - 1] : g.length ? g[g.length - 1] : fastest;
    if (ladder.length && ladder[ladder.length - 1].lap === pick) {
      ladder[ladder.length - 1].upTo = t;
      continue;
    }
    ladder.push({ lap: pick, upTo: t, time: r(pick.time, 1e3), n: 1, field: !!pick.field, seg: pick.seg.map((x) => r(x, 1e3)), bins: compact(pick) });
  }
  const fp = await pathFor(fastest);
  const out = [];
  for (const { lap, ...x } of ladder) {
    const p = await pathFor(lap), e = { ...x, upTo: r(x.upTo, 1e3) };
    if (p && p.x.length >= n) {
      e.x = [];
      e.y = [];
      for (let i = 0; i < n; i += LEVEL_BIN) {
        e.x.push(r(p.x[i], 10));
        e.y.push(r(p.y[i], 10));
      }
      if (p.g) e.g = p.g;
    }
    e.step = levelStep(lap, laps, zr, n);
    out.push(e);
  }
  if (fp && fp.x.length >= n) {
    const pp = [];
    for (const l of fastPicks(sorted)) {
      const p = await pathFor(l);
      if (p) pp.push({ lap: l, path: p });
    }
    for (const q2 of lineRanges(fastest, fp, pp, zr, n)) {
      const c = corners.find((x) => x.apex === q2.apex);
      if (c) c.line = { in: q2.in, at: q2.at, out: q2.out, n: q2.n };
    }
  }
  let lineXY = null;
  if (!(fp && fp.x.length >= n)) {
    for (const l of sorted.slice(0, 40)) {
      const p = await pathFor(l);
      if (p && p.x.length >= n) {
        lineXY = { time: r(l.time, 1e3), x: p.x.slice(0, n).map((v) => r(v, 10)), y: p.y.slice(0, n).map((v) => r(v, 10)), ...p.g ? { g: p.g } : {} };
        break;
      }
    }
  }
  return {
    n: laps.length,
    M,
    nb: n,
    pool: laps.length,
    idealTime: r(fastest.time, 1e3),
    fastest: r(fastest.time, 1e3),
    lineXY,
    ideal: record2,
    idealField: !!fastest.field,
    corners,
    idealXY: fp && fp.x.length >= n ? { x: fp.x.slice(0, n).map((v) => r(v, 10)), y: fp.y.slice(0, n).map((v) => r(v, 10)), ...fp.g ? { g: fp.g } : {} } : null,
    ladder: out
  };
}
__name(refsOf, "refsOf");
async function buildModel(env, game, trackId, carId) {
  carId = await famId(env, game, carId);
  const { laps: raw, byCmp: rawCmp, drivers, more, added } = await candidates(env, game, trackId, carId);
  if (added) await markCar(env, game, carId);
  const shared = await env.DB.prepare(
    `SELECT COUNT(*) AS n, MIN(time) AS best FROM community_laps WHERE track_id=?1 AND car_id=?2 AND game=?3 AND COALESCE(shown,'')<>'model'`
  ).bind(trackId, carId, game).first();
  const base2 = { v: MODEL_VERSION, game, trackId, carId, built: Date.now(), more: !!more, drivers, shared: shared && shared.n || 0 };
  if (raw.length < 2) return { ...base2, n: raw.length };
  const laps = cleanLaps(raw);
  const timed = await env.DB.prepare("SELECT user_id, MIN(time) AS t FROM community_laps WHERE track_id=?1 AND car_id=?2 AND game=?3 AND time>10 AND (COALESCE(official,1)<>0 OR ai=1) GROUP BY user_id").bind(trackId, carId, game).all();
  const byDrv = /* @__PURE__ */ new Map();
  for (const l of laps) if (!byDrv.has(l.up) || l.time < byDrv.get(l.up)) byDrv.set(l.up, l.time);
  for (const x of timed.results || []) {
    const k = await sha("drv:acct:" + x.user_id);
    if (!byDrv.has(k) || x.t < byDrv.get(k)) byDrv.set(k, x.t);
  }
  const times = [...byDrv.values()].sort((a, b) => a - b).map((t) => r(t, 1e3));
  if (laps.length < 2) return { ...base2, n: laps.length, drivers: Math.max(drivers, times.length), times };
  const paths = /* @__PURE__ */ new Map();
  const pathFor = /* @__PURE__ */ __name(async (l) => {
    if (!paths.has(l)) paths.set(l, await lapPath(env, game, trackId, carId, l.time).catch(() => null));
    return paths.get(l);
  }, "pathFor");
  const model = { ...base2, drivers: Math.max(drivers, times.length), times, ...await refsOf(laps, pathFor) };
  const cmps = {};
  for (const [c, ls] of rawCmp) {
    const cl = cleanLaps(ls);
    if (cl.length >= 2) cmps[c] = await refsOf(cl, pathFor);
  }
  if (Object.keys(cmps).length) model.byCmp = cmps;
  return model;
}
__name(buildModel, "buildModel");
function forCompound(md2, cmp) {
  if (!md2) return md2;
  const { byCmp, ...m } = md2;
  const list = byCmp ? Object.keys(byCmp).map(Number).sort((p, q2) => p - q2) : [];
  const one = byCmp && Number.isInteger(cmp) && cmp >= 0 ? byCmp[cmp] : null;
  return { ...m, ...list.length ? { cmps: list } : {}, ...one ? { ...one, cmp } : {} };
}
__name(forCompound, "forCompound");
var CARD_TRACKS = 12;
var CARD_PER_TRACK = 8;
var CARD_PER_DRIVER = 2;
var pct = /* @__PURE__ */ __name((a, q2) => {
  const v = a.filter((x) => x != null && isFinite(x)).sort((x, y) => x - y);
  return v.length ? v[Math.min(v.length - 1, Math.floor(q2 * (v.length - 1) + 0.5))] : null;
}, "pct");
function lapFacts(bins) {
  const dec2 = [], shifts = {};
  let vmax = 0, geared = false;
  for (let i = 0; i + 1 < bins.length; i++) {
    const a = bins[i], b = bins[i + 1];
    if (a[0] > vmax) vmax = a[0];
    if (a[4] >= 1) geared = true;
    const dt = b[1] - a[1];
    if (dt > 0.01 && dt < 2 && a[3] >= 0.5 && a[0] > 12 && a[0] > b[0]) dec2.push((a[0] - b[0]) / dt);
    if (a[4] >= 1 && b[4] === a[4] + 1 && a[0] > 5) shifts[a[4]] = Math.max(shifts[a[4]] || 0, a[0]);
  }
  return { brake: dec2.length >= 5 ? pct(dec2, 0.95) : null, shifts: geared ? shifts : null, vmax };
}
__name(lapFacts, "lapFacts");
function cardOf(laps) {
  const f = laps.map((l) => ({ ...lapFacts(l.bins), trackId: l.trackId, drv: l.drv, field: !!l.field || !!l.rival }));
  const brakes = f.map((x) => x.brake).filter((x) => x != null);
  const shifts = [];
  for (let g = 1; g <= 8; g++) {
    const v = f.filter((x) => !x.field).map((x) => x.shifts && x.shifts[g]).filter((x) => x > 0);
    if (v.length >= 3) shifts.push([g, r(pct(v, 0.8), 10)]);
  }
  let vmax = 0, vmaxAt = 0;
  for (const x of f) if (x.vmax > vmax) {
    vmax = x.vmax;
    vmaxAt = x.trackId;
  }
  return {
    n: laps.length,
    tracks: new Set(laps.map((l) => l.trackId)).size,
    drivers: new Set(laps.map((l) => l.drv)).size,
    brake: brakes.length >= 3 ? r(pct(brakes, 0.8), 100) : null,
    shifts,
    vmax: r(vmax, 10),
    vmaxAt,
    // what the car does at every speed with full throttle, no pedal and full brake: rivals' pedals from their speed
    pedals: pedalEnvelope(laps.filter((l) => !l.field && !l.rival).map((l) => l.bins))
  };
}
__name(cardOf, "cardOf");
async function buildCarCard(env, game, carId) {
  carId = await famId(env, game, carId);
  const all = (await env.DB.prepare("SELECT track_id, drv, time, data FROM model_laps WHERE game=?1 AND car_id=?2 ORDER BY time LIMIT 4000").bind(game, carId).all()).results || [];
  const byTrack = /* @__PURE__ */ new Map();
  for (const x of all) {
    const t = byTrack.get(x.track_id) || [];
    t.push(x);
    byTrack.set(x.track_id, t);
  }
  const pick = [];
  for (const [, rows] of [...byTrack.entries()].sort((a, b) => b[1].length - a[1].length).slice(0, CARD_TRACKS)) {
    const per = /* @__PURE__ */ new Map();
    let n = 0;
    for (const x of rows) {
      const c = per.get(x.drv) || 0;
      if (c >= CARD_PER_DRIVER || n >= CARD_PER_TRACK) continue;
      per.set(x.drv, c + 1);
      n++;
      pick.push(x);
    }
  }
  const laps = [];
  for (const x of pick) {
    try {
      const g = goodLap(x.time, memTrace(JSON.parse(await gunz(x.data))));
      if (g) laps.push({ trackId: x.track_id, drv: x.drv, time: x.time, bins: g.bins, field: g.field, rival: g.rival });
    } catch (e) {
    }
  }
  const card = { v: CARD_VERSION, game, carId, built: Date.now(), ...cardOf(laps) };
  if (card.vmaxAt) {
    const t = await env.DB.prepare("SELECT track, track_config FROM sessions WHERE game=?1 AND track_id=?2 AND track IS NOT NULL LIMIT 1").bind(game, card.vmaxAt).first().catch(() => null) || await env.DB.prepare("SELECT track, NULL AS track_config FROM community_laps WHERE game=?1 AND track_id=?2 LIMIT 1").bind(game, card.vmaxAt).first().catch(() => null);
    if (t && t.track) card.vmaxTrack = t.track + (t.track_config ? " \xB7 " + t.track_config : "");
  }
  await env.DB.prepare(
    `INSERT INTO car_cards (game, car_id, dirty, built, data) VALUES (?1,?2,0,?3,?4)
     ON CONFLICT(game, car_id) DO UPDATE SET dirty=0, built=excluded.built, data=excluded.data`
  ).bind(game, carId, card.built, await gz(JSON.stringify(card))).run();
  return card;
}
__name(buildCarCard, "buildCarCard");
async function markCar(env, game, carId) {
  carId = await famId(env, game, carId);
  if (!carId) return;
  await env.DB.prepare(
    `INSERT INTO car_cards (game, car_id, dirty, built, data) VALUES (?1,?2,1,0,NULL)
     ON CONFLICT(game, car_id) DO UPDATE SET dirty=1`
  ).bind(game, carId).run().catch(() => {
  });
}
__name(markCar, "markCar");
async function getCarCard(env, game, carId) {
  carId = await famId(env, game, carId);
  if (!carId) return null;
  const row = await env.DB.prepare("SELECT dirty, data FROM car_cards WHERE game=?1 AND car_id=?2").bind(game, carId).first().catch(() => null);
  if (row && row.data && !row.dirty) {
    const c = JSON.parse(await gunz(row.data));
    if (c.v === CARD_VERSION) return c.n ? c : null;
  }
  try {
    const c = await buildCarCard(env, game, carId);
    return c.n ? c : null;
  } catch (e) {
    if (row && row.data) {
      const c = JSON.parse(await gunz(row.data));
      return c.n ? c : null;
    }
    return null;
  }
}
__name(getCarCard, "getCarCard");
var PSEUDO_MIN = 9e8;
var normName = /* @__PURE__ */ __name((v) => String(v || "").toLowerCase().normalize("NFD").replace(/[\u0300-\u036f]/g, "").replace(/[^a-z0-9]+/g, ""), "normName");
async function pseudoId(kind, game, name2) {
  const b = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(kind + "|" + game + "|" + normName(name2)));
  const n = new DataView(b).getUint32(0);
  return PSEUDO_MIN + n % 99999999;
}
__name(pseudoId, "pseudoId");
async function reconcileIds(env, game, track2, trackConfig, car, trackId, carId) {
  if (!trackId || !carId || trackId >= PSEUDO_MIN || carId >= PSEUDO_MIN) return;
  const full = track2 + (trackConfig ? " \xB7 " + trackConfig : "");
  const pt = await pseudoId("t", game, full), pc = await pseudoId("c", game, car);
  const hit = await env.DB.prepare("SELECT 1 FROM sessions WHERE game=?1 AND (track_id=?2 OR car_id=?3) LIMIT 1").bind(game, pt, pc).first() || await env.DB.prepare("SELECT 1 FROM community_laps WHERE game=?1 AND (track_id=?2 OR car_id=?3) LIMIT 1").bind(game, pt, pc).first() || await env.DB.prepare("SELECT 1 FROM community_reports WHERE game=?1 AND (track_id=?2 OR car_id=?3) LIMIT 1").bind(game, pt, pc).first();
  if (!hit) return;
  const fix3 = /* @__PURE__ */ __name((t) => [
    env.DB.prepare(`UPDATE OR IGNORE ${t} SET track_id=CASE WHEN track_id=?1 THEN ?2 ELSE track_id END, car_id=CASE WHEN car_id=?3 THEN ?4 ELSE car_id END WHERE game=?5 AND (track_id=?1 OR car_id=?3)`).bind(pt, trackId, pc, carId, game),
    env.DB.prepare(`DELETE FROM ${t} WHERE game=?1 AND (track_id=?2 OR car_id=?3)`).bind(game, pt, pc)
    // a row the real combo already had wins
  ], "fix");
  await env.DB.batch([
    env.DB.prepare("UPDATE sessions SET track_id=CASE WHEN track_id=?1 THEN ?2 ELSE track_id END, car_id=CASE WHEN car_id=?3 THEN ?4 ELSE car_id END WHERE game=?5 AND (track_id=?1 OR car_id=?3)").bind(pt, trackId, pc, carId, game),
    ...fix3("community_laps"),
    ...fix3("community_reports"),
    ...fix3("model_laps"),
    env.DB.prepare("UPDATE OR IGNORE car_cards SET car_id=?2, dirty=1 WHERE game=?3 AND car_id=?1").bind(pc, carId, game),
    env.DB.prepare("DELETE FROM car_cards WHERE game=?2 AND car_id=?1").bind(pc, game),
    env.DB.prepare("DELETE FROM model_cache WHERE game=?1 AND (track_id=?2 OR car_id=?3)").bind(game, pt, pc)
  ]);
  await markModel(env, game, trackId, carId);
}
__name(reconcileIds, "reconcileIds");
var gz = /* @__PURE__ */ __name(async (s) => new Uint8Array(await new Response(new Blob([s]).stream().pipeThrough(new CompressionStream("gzip"))).arrayBuffer()), "gz");
var gunz = /* @__PURE__ */ __name(async (b) => await new Response(new Blob([b instanceof ArrayBuffer || ArrayBuffer.isView(b) ? b : new Uint8Array(b)]).stream().pipeThrough(new DecompressionStream("gzip"))).text(), "gunz");
async function moveDriver(env, fromUp, toUp, game) {
  const from = await sha("drv:" + fromUp), to = await sha("drv:" + toUp);
  const rows = (await env.DB.prepare("SELECT game, track_id, car_id, k, time FROM model_laps WHERE drv=?1" + (game ? " AND game=?2" : "")).bind(...game ? [from, game] : [from]).all()).results || [];
  for (const r2 of rows) {
    await env.DB.prepare("UPDATE OR IGNORE model_laps SET drv=?5, k=?6 WHERE game=?1 AND track_id=?2 AND car_id=?3 AND k=?4").bind(r2.game, r2.track_id, r2.car_id, r2.k, to, await sha(toUp + ":" + r2.time.toFixed(3))).run();
  }
  await env.DB.prepare("DELETE FROM model_laps WHERE drv=?1" + (game ? " AND game=?2" : "")).bind(...game ? [from, game] : [from]).run();
  return rows;
}
__name(moveDriver, "moveDriver");
async function moveDriverBack(env, rows, fromUp, toUp) {
  const from = await sha("drv:" + fromUp), to = await sha("drv:" + toUp);
  for (const x of rows || []) {
    if (!x || typeof x.time !== "number") continue;
    await env.DB.prepare("UPDATE OR IGNORE model_laps SET drv=?5, k=?6 WHERE game=?1 AND track_id=?2 AND car_id=?3 AND k=?4 AND drv=?7").bind(x.game, x.track_id, x.car_id, await sha(fromUp + ":" + x.time.toFixed(3)), to, await sha(toUp + ":" + x.time.toFixed(3)), from).run();
  }
}
__name(moveDriverBack, "moveDriverBack");
async function forgetLap(env, game, trackId, carId, uploader, time) {
  carId = await famId(env, game, carId);
  if (!trackId || !carId) return;
  await env.DB.prepare("DELETE FROM model_laps WHERE game=?1 AND track_id=?2 AND car_id=?3 AND k=?4").bind(game, trackId, carId, await sha(uploader + ":" + Number(time).toFixed(3))).run();
  await markModel(env, game, trackId, carId);
}
__name(forgetLap, "forgetLap");
async function markModel(env, game, trackId, carId) {
  carId = await famId(env, game, carId);
  if (!trackId || !carId) return;
  await env.DB.prepare(
    `INSERT INTO model_cache (game, track_id, car_id, dirty, built, data) VALUES (?1,?2,?3,1,0,NULL)
     ON CONFLICT(game, track_id, car_id) DO UPDATE SET dirty=1`
  ).bind(game, trackId, carId).run().catch(() => {
  });
  await markCar(env, game, carId);
}
__name(markModel, "markModel");
async function rebuild(env, game, trackId, carId) {
  const m = await buildModel(env, game, trackId, carId);
  await env.DB.prepare(
    `INSERT INTO model_cache (game, track_id, car_id, dirty, built, data) VALUES (?1,?2,?3,?6,?4,?5)
     ON CONFLICT(game, track_id, car_id) DO UPDATE SET dirty=excluded.dirty, built=excluded.built, data=excluded.data`
  ).bind(game, trackId, carId, m.built, await gz(JSON.stringify(m)), m.more ? 1 : 0).run();
  return m;
}
__name(rebuild, "rebuild");
async function getModel(env, game, trackId, carId) {
  carId = await famId(env, game, carId);
  const row = await env.DB.prepare("SELECT dirty, built, data FROM model_cache WHERE game=?1 AND track_id=?2 AND car_id=?3").bind(game, trackId, carId).first();
  if (row && row.data && !row.dirty) {
    const m = JSON.parse(await gunz(row.data));
    if (m.v === MODEL_VERSION) return m;
  }
  try {
    return await rebuild(env, game, trackId, carId);
  } catch (e) {
    if (row && row.data) return JSON.parse(await gunz(row.data));
    throw e;
  }
}
__name(getModel, "getModel");
async function rebuildDirty(env, { daily = false } = {}) {
  if (daily) await env.DB.prepare(
    `INSERT INTO model_cache (game, track_id, car_id, dirty, built, data)
     SELECT DISTINCT game, track_id, car_id, 1, 0, NULL FROM community_laps WHERE track_id>0 AND car_id>0
     UNION SELECT DISTINCT game, track_id, car_id, 1, 0, NULL FROM sessions WHERE track_id>0 AND car_id>0 AND uploader LIKE 'acct:%'
     ON CONFLICT DO NOTHING`
  ).run().catch(() => {
  });
  const r2 = await env.DB.prepare("SELECT game, track_id, car_id FROM model_cache WHERE dirty=1 ORDER BY built LIMIT 25").all();
  for (const x of r2.results || []) {
    try {
      await rebuild(env, x.game, x.track_id, x.car_id);
    } catch (e) {
    }
  }
  if (daily) await env.DB.prepare("INSERT INTO car_cards (game, car_id, dirty, built, data) SELECT DISTINCT game, car_id, 1, 0, NULL FROM model_laps WHERE car_id>0 ON CONFLICT DO NOTHING").run().catch(() => {
  });
  const c = await env.DB.prepare("SELECT game, car_id FROM car_cards WHERE dirty=1 ORDER BY built LIMIT 10").all().catch(() => ({ results: [] }));
  for (const x of c.results || []) {
    try {
      await buildCarCard(env, x.game, x.car_id);
    } catch (e) {
    }
    await env.DB.prepare("UPDATE car_cards SET dirty=0, built=?3 WHERE game=?1 AND car_id=?2 AND dirty=1").bind(x.game, x.car_id, Date.now()).run().catch(() => {
    });
  }
}
__name(rebuildDirty, "rebuildDirty");

// src/trackmaps.js
var STATE = "trackmaps_rebuild";
var PER_RUN = 3;
var PER_TRACK = 6;
async function turnCount(env, game, trackId) {
  const r2 = await env.DB.prepare("SELECT nturns FROM track_info WHERE game=?1 AND track_id=?2").bind(game, trackId).first().catch(() => null);
  return r2 && r2.nturns > 0 ? r2.nturns : 0;
}
__name(turnCount, "turnCount");
async function noteTurnCount(env, game, trackId, track2, nturns) {
  const n = Number(nturns);
  if (!trackId || !Number.isInteger(n) || n < 1 || n > 60) return false;
  const old = await env.DB.prepare("SELECT nturns, track FROM track_info WHERE game=?1 AND track_id=?2").bind(game, trackId).first().catch(() => null);
  if (old && old.nturns === n && (old.track || "") === (track2 || old.track || "")) return false;
  await env.DB.prepare(`INSERT INTO track_info (game, track_id, track, nturns, updated) VALUES (?1,?2,?3,?4,?5)
     ON CONFLICT(game, track_id) DO UPDATE SET nturns=excluded.nturns, track=COALESCE(excluded.track, track_info.track), updated=excluded.updated`).bind(game, trackId, track2 ? String(track2).slice(0, 120) : null, n, Date.now()).run();
  return true;
}
__name(noteTurnCount, "noteTurnCount");
function geoPath(tr2) {
  if (!tr2 || !Array.isArray(tr2.g) || tr2.g.length !== 2 || !tr2.g.every((v) => typeof v === "number" && isFinite(v))) return null;
  const x = tr2.x, y = tr2.y;
  if (!Array.isArray(x) || !Array.isArray(y) || x.length !== y.length || x.length < 100 || x.length > 3e3) return null;
  const ok = /* @__PURE__ */ __name((v) => typeof v === "number" && isFinite(v) && Math.abs(v) < 3e4, "ok");
  if (!x.every(ok) || !y.every(ok)) return null;
  const r1 = /* @__PURE__ */ __name((v) => Math.round(v * 10) / 10, "r1");
  return { x: x.map(r1), y: y.map(r1), g: tr2.g.map((v) => Math.round(v * 1e5) / 1e5) };
}
__name(geoPath, "geoPath");
async function rebuildTrackMaps(env, { all = false } = {}) {
  const st = await env.DB.prepare("SELECT v FROM app_state WHERE k=?1").bind(STATE).first().catch(() => null);
  let state = { done: false, seen: [] };
  try {
    if (st && st.v) state = { done: false, seen: [], ...JSON.parse(st.v) };
  } catch (e) {
  }
  if (all || state.done && Date.now() - (state.at || 0) > 864e5) state = { done: false, seen: [] };
  if (state.done) return { checked: 0, rebuilt: 0, left: 0, done: true };
  const rows = (await env.DB.prepare("SELECT game, track_id, time FROM track_maps WHERE geo IS NULL").all()).results || [];
  const seen2 = new Set(state.seen), todo = rows.filter((r2) => !seen2.has(r2.game + ":" + r2.track_id));
  const now = todo.slice(0, all ? 40 : PER_RUN);
  let rebuilt = 0;
  for (const t of now) {
    seen2.add(t.game + ":" + t.track_id);
    const laps = (await env.DB.prepare(
      `SELECT a.trace, a.time FROM sessions s JOIN laps a ON a.session_id=s.id
       WHERE s.track_id=?1 AND s.game=?2 AND a.valid=1 AND a.trace IS NOT NULL AND (instr(a.trace,'"g":[')>0 OR substr(a.trace,1,4)='enc:')
         AND COALESCE(s.kind,'') NOT LIKE '%test%' ORDER BY a.time LIMIT ${PER_TRACK}`
    ).bind(t.track_id, t.game).all().catch(() => ({ results: [] }))).results || [];
    for (const l of laps) {
      let path = null;
      try {
        path = geoPath(JSON.parse(await openData(env, l.trace)));
      } catch (e) {
        path = null;
      }
      if (!path) continue;
      await env.DB.prepare("UPDATE track_maps SET n=?3, pts=?4, time=?5, geo=?6, created=?7 WHERE game=?1 AND track_id=?2 AND geo IS NULL").bind(t.game, t.track_id, path.x.length, JSON.stringify({ x: path.x, y: path.y }), l.time, JSON.stringify(path.g), Date.now()).run();
      rebuilt++;
      break;
    }
  }
  const left = todo.length - now.length;
  state = { done: left <= 0, seen: [...seen2].slice(-500), at: left <= 0 ? Date.now() : 0 };
  await env.DB.prepare("INSERT INTO app_state (k, v, at) VALUES (?1, ?2, ?3) ON CONFLICT(k) DO UPDATE SET v=excluded.v, at=excluded.at").bind(STATE, JSON.stringify(state), Date.now()).run();
  return { checked: now.length, rebuilt, left, done: state.done, withoutGeo: rows.length - rebuilt };
}
__name(rebuildTrackMaps, "rebuildTrackMaps");

// src/supportlib.js
var SUPPORT_MAX = 4e3;
var SUPPORT_PER_DAY = 20;
var THREAD_MSGS = 300;
var CONVERSATIONS = 200;
var ACCOUNT_RE = /^[A-Za-z0-9_.:-]{1,80}$/;
var DEVICES = ["web", "pc", "android", "ios"];
var cleanV = /* @__PURE__ */ __name((v) => String(v == null ? "" : v).replace(/[^0-9a-zA-Z.+-]/g, "").slice(0, 24), "cleanV");
var cleanLang = /* @__PURE__ */ __name((l) => ["en", "es", "pt"].includes(String(l || "").slice(0, 2).toLowerCase()) ? String(l).slice(0, 2).toLowerCase() : null, "cleanLang");
function cleanText(t) {
  const text2 = String(t == null ? "" : t).replace(/\r\n?/g, "\n").replace(/[\u0000-\u0008\u000b\u000c\u000e-\u001f]/g, "").trim();
  if (!text2) return { error: "write something first" };
  if (text2.length > SUPPORT_MAX) return { error: "too long (" + SUPPORT_MAX + " characters at most)" };
  return { text: text2 };
}
__name(cleanText, "cleanText");
function cleanSupport(b) {
  if (!b || typeof b !== "object") return { error: "missing body" };
  const t = cleanText(b.text);
  if (t.error) return t;
  const device = String(b.device || "").toLowerCase();
  return { text: t.text, device: DEVICES.includes(device) ? device : "", v: cleanV(b.v), view: String(b.view || "").replace(/[^a-z0-9_.:-]/gi, "").slice(0, 40), lang: cleanLang(b.lang) };
}
__name(cleanSupport, "cleanSupport");
var SQL_MSG_ADD = "INSERT INTO support_msgs (id, account_id, from_support, text, created, rating, device, v, view, kind, style, lang) VALUES (?1,?2,?3,?4,?5,?6,?7,?8,?9,?10,?11,?12)";
var SQL_THREAD_DRIVER = "INSERT INTO support_threads (account_id, last_at, last_text, last_support, unread_support, unread_driver) VALUES (?1,?2,substr(?3,1,200),0,1,0) ON CONFLICT(account_id) DO UPDATE SET last_at=excluded.last_at, last_text=excluded.last_text, last_support=0, unread_support=support_threads.unread_support+1";
var SQL_THREAD_SUPPORT = "INSERT INTO support_threads (account_id, last_at, last_text, last_support, unread_support, unread_driver) VALUES (?1,?2,substr(?3,1,200),1,0,1) ON CONFLICT(account_id) DO UPDATE SET last_at=excluded.last_at, last_text=excluded.last_text, last_support=1, unread_driver=support_threads.unread_driver+1";
var SQL_DRIVER_READ = "UPDATE support_msgs SET read_at=?2 WHERE account_id=?1 AND from_support=1 AND read_at IS NULL";
var SQL_DRIVER_READ_T = "UPDATE support_threads SET unread_driver=0 WHERE account_id=?1 AND unread_driver<>0";
var SQL_SUPPORT_READ = "UPDATE support_msgs SET read_at=?2 WHERE account_id=?1 AND from_support=0 AND read_at IS NULL";
var SQL_SUPPORT_READ_T = "UPDATE support_threads SET unread_support=0 WHERE account_id=?1 AND unread_support<>0";
var SQL_UNREAD_DRIVER = "SELECT unread_driver AS n, last_text, last_support, last_at FROM support_threads WHERE account_id=?1";
var SQL_UNREAD_ADMIN = "SELECT COUNT(*) AS n FROM support_threads WHERE unread_support>0";
var SQL_THREAD_MSGS = "SELECT id, from_support, text, created, read_at, rating, device, v, view, kind, style FROM support_msgs WHERE account_id=?1 ORDER BY created DESC LIMIT " + THREAD_MSGS;
var SQL_CONVERSATIONS = "SELECT t.account_id, t.last_at, t.last_text, t.last_support, t.unread_support, a.display AS nick FROM support_threads t LEFT JOIN accounts a ON a.id=t.account_id ORDER BY t.last_at DESC LIMIT " + CONVERSATIONS;
var SQL_SENT_SINCE = "SELECT COUNT(*) AS n FROM support_msgs WHERE account_id=?1 AND from_support=0 AND created>?2";
var SQL_LAST_LANG = "SELECT lang FROM support_msgs WHERE account_id=?1 AND from_support=0 AND lang IS NOT NULL ORDER BY created DESC LIMIT 1";
var driverMsg = /* @__PURE__ */ __name((r2) => {
  const o = { id: r2.id, me: !r2.from_support, text: r2.text, created: r2.created, kind: r2.kind || "chat" };
  if (r2.rating) o.rating = r2.rating;
  return o;
}, "driverMsg");
var adminMsg = /* @__PURE__ */ __name((r2) => ({
  id: r2.id,
  support: !!r2.from_support,
  text: r2.text,
  created: r2.created,
  read: r2.read_at || null,
  rating: r2.rating || null,
  device: r2.device || "",
  v: r2.v || "",
  view: r2.view || "",
  kind: r2.kind || "chat",
  style: r2.style || null
}), "adminMsg");
var conversation = /* @__PURE__ */ __name((r2) => ({ accountId: r2.account_id, nick: r2.nick || "", last: r2.last_text, lastAt: r2.last_at, lastSupport: !!r2.last_support, unread: r2.unread_support || 0 }), "conversation");
var chrono = /* @__PURE__ */ __name((rows) => rows.slice().reverse(), "chrono");
function replyMail(text2, l) {
  const L = cleanLang(l) || "en";
  return {
    lang: L,
    subject: { en: "Pitlane HQ Support replied", es: "El soporte de Pitlane HQ te ha respondido", pt: "O suporte do Pitlane HQ respondeu" }[L],
    text: text2,
    button: { en: "Open Pitlane HQ", es: "Abrir Pitlane HQ", pt: "Abrir o Pitlane HQ" }[L],
    link: "https://pitlanehq.app/app?support=1"
  };
}
__name(replyMail, "replyMail");
function chatMail(f) {
  return {
    subject: "Support chat \xB7 " + (f.nick || "a driver"),
    text: [
      f.text,
      "",
      "From " + (f.nick || "\u2013") + " (" + (f.accountId || "\u2013") + ")",
      "Device " + (f.device || "\u2013") + " \xB7 version " + (f.v || "\u2013") + " \xB7 in " + (f.view || "\u2013"),
      f.email ? "Reply to answer " + f.email + ", or answer in the app" : "No email known for this account, answer in the app"
    ].join("\n"),
    link: "https://pitlanehq.app/app?support=" + encodeURIComponent(f.accountId || "")
  };
}
__name(chatMail, "chatMail");
var json2 = /* @__PURE__ */ __name((o, s = 200) => new Response(JSON.stringify(o), { status: s, headers: { "content-type": "application/json", "cache-control": "no-store" } }), "json");
var err = /* @__PURE__ */ __name((m, s) => json2({ error: m }, s), "err");
var driverMessage = /* @__PURE__ */ __name((env, accId, id2, now, m) => [
  env.DB.prepare(SQL_MSG_ADD).bind(id2, accId, 0, m.text, now, m.rating || null, m.device || "", m.v || "", m.view || "", m.kind || "chat", m.style || null, m.lang || null),
  env.DB.prepare(SQL_THREAD_DRIVER).bind(accId, now, m.text)
], "driverMessage");
async function handleSupport(req, env, url, { sessionAccount: sessionAccount2, isAdmin: isAdmin2, openEscrow: openEscrow2, sendSupportChat: sendSupportChat2, sendSupportReply: sendSupportReply2 }) {
  const p = url.pathname, m = req.method;
  if (p !== "/community/support" && p !== "/community/support/unread" && !p.startsWith("/community/admin/support")) return null;
  const acc = await sessionAccount2(req, env);
  if (!acc) return err("sign in with your Pitlane HQ account", 401);
  const now = Date.now();
  if (p === "/community/support/unread" && m === "GET") {
    const r2 = await env.DB.prepare(SQL_UNREAD_DRIVER).bind(acc.id).first(), n = r2 && r2.n || 0;
    return json2(n && r2.last_support ? { n, last: r2.last_text, at: r2.last_at } : { n });
  }
  if (p === "/community/support" && m === "GET") {
    const [rows, u] = await Promise.all([env.DB.prepare(SQL_THREAD_MSGS).bind(acc.id).all(), env.DB.prepare(SQL_UNREAD_DRIVER).bind(acc.id).first()]);
    const unread = u && u.n || 0;
    if (unread) await env.DB.batch([env.DB.prepare(SQL_DRIVER_READ).bind(acc.id, now), env.DB.prepare(SQL_DRIVER_READ_T).bind(acc.id)]);
    return json2({ msgs: chrono(rows.results || []).map(driverMsg), unread });
  }
  if (p === "/community/support" && m === "POST") {
    const f = cleanSupport(await req.json().catch(() => null));
    if (f.error) return err(f.error, 400);
    const c = await env.DB.prepare(SQL_SENT_SINCE).bind(acc.id, now - 864e5).first();
    if (c && c.n >= SUPPORT_PER_DAY) return err("that is enough for today, we answer soon", 429);
    const id3 = crypto.randomUUID();
    await env.DB.batch(driverMessage(env, acc.id, id3, now, { ...f, kind: "chat" }));
    const esc5 = await openEscrow2(env, acc.escrow).catch(() => null);
    const mailed = await sendSupportChat2(env, { ...f, nick: acc.display || "", accountId: acc.id, email: esc5 && esc5.email || "" }).catch(() => false);
    return json2({ ok: true, mailed, msg: { id: id3, me: true, text: f.text, created: now, kind: "chat" } });
  }
  if (!p.startsWith("/community/admin/support")) return err("not found", 404);
  if (!isAdmin2(env, acc.id)) return err("only the admins of this server can do this", 403);
  if (p === "/community/admin/support/unread" && m === "GET") {
    const r2 = await env.DB.prepare(SQL_UNREAD_ADMIN).first();
    return json2({ n: r2 && r2.n || 0 });
  }
  if (p === "/community/admin/support" && m === "GET") {
    const r2 = await env.DB.prepare(SQL_CONVERSATIONS).all();
    const items = (r2.results || []).map(conversation);
    return json2({ items, unread: items.filter((x) => x.unread > 0).length });
  }
  const mm = /^\/community\/admin\/support\/([^/]+)$/.exec(p);
  const id2 = mm ? decodeURIComponent(mm[1]) : "";
  if (!ACCOUNT_RE.test(id2)) return err("not found", 404);
  const a = await env.DB.prepare("SELECT id, display, escrow FROM accounts WHERE id=?1").bind(id2).first();
  if (m === "GET") {
    const rows = await env.DB.prepare(SQL_THREAD_MSGS).bind(id2).all();
    await env.DB.batch([env.DB.prepare(SQL_SUPPORT_READ).bind(id2, now), env.DB.prepare(SQL_SUPPORT_READ_T).bind(id2)]);
    return json2({ accountId: id2, nick: a && a.display || "", gone: !a, msgs: chrono(rows.results || []).map(adminMsg) });
  }
  if (m === "POST") {
    if (!a) return err("this account does not exist any more", 404);
    const t = cleanText((await req.json().catch(() => null) || {}).text);
    if (t.error) return err(t.error, 400);
    const mid = crypto.randomUUID();
    await env.DB.batch([
      env.DB.prepare(SQL_MSG_ADD).bind(mid, id2, 1, t.text, now, null, "", "", "", "reply", null, null),
      env.DB.prepare(SQL_THREAD_SUPPORT).bind(id2, now, t.text),
      // answering is reading what they wrote
      env.DB.prepare(SQL_SUPPORT_READ).bind(id2, now),
      env.DB.prepare(SQL_SUPPORT_READ_T).bind(id2)
    ]);
    const [esc5, lr] = await Promise.all([openEscrow2(env, a.escrow).catch(() => null), env.DB.prepare(SQL_LAST_LANG).bind(id2).first()]);
    const mailed = esc5 && esc5.email ? await sendSupportReply2(env, esc5.email, t.text, lr && lr.lang).catch(() => false) : false;
    return json2({ ok: true, mailed, msg: { id: mid, support: true, text: t.text, created: now, read: null, rating: null, device: "", v: "", view: "", kind: "reply", style: null } });
  }
  return err("not found", 404);
}
__name(handleSupport, "handleSupport");

// src/email.js
var mailReady = /* @__PURE__ */ __name((env) => !!env.EMAIL_FROM && !!env.RESEND_API_KEY, "mailReady");
var SUPPORT = "support@pitlanehq.app";
var T = {
  verifySubject: { en: "Confirm your Pitlane HQ email", es: "Confirma tu email de Pitlane HQ", de: "Best\xE4tige deine PitlaneHQ-E-Mail", pt: "Confirme seu email do Pitlane HQ" },
  verifyText: {
    en: "Welcome to Pitlane HQ! Confirm this is your email by opening the link below (it works for 7 days):",
    es: "\xA1Bienvenido a Pitlane HQ! Confirma que este es tu email abriendo el enlace de abajo (vale 7 d\xEDas):",
    de: "Willkommen bei Pitlane HQ! Best\xE4tige deine E-Mail-Adresse mit dem Link unten (7 Tage g\xFCltig):",
    pt: "Bem-vindo ao Pitlane HQ! Confirme que este \xE9 o seu email abrindo o link abaixo (vale 7 dias):"
  },
  verifyButton: { en: "Confirm my email", es: "Confirmar mi email", de: "E-Mail best\xE4tigen", pt: "Confirmar meu email" },
  resetSubject: { en: "Reset your Pitlane HQ password", es: "Restablece tu contrase\xF1a de Pitlane HQ", de: "PitlaneHQ-Passwort zur\xFCcksetzen", pt: "Redefina sua senha do Pitlane HQ" },
  resetText: {
    en: "Someone (hopefully you) asked to reset the password of your Pitlane HQ account. Open the link below within 1 hour to choose a new one. If it was not you, ignore this email: nothing changes.",
    es: "Alguien (esperamos que t\xFA) ha pedido restablecer la contrase\xF1a de tu cuenta de Pitlane HQ. Abre el enlace de abajo antes de 1 hora para elegir una nueva. Si no fuiste t\xFA, ignora este email: no cambia nada.",
    de: "Jemand (hoffentlich du) m\xF6chte das Passwort deines PitlaneHQ-Kontos zur\xFCcksetzen. \xD6ffne den Link unten innerhalb von 1 Stunde, um ein neues zu w\xE4hlen. Warst du es nicht, ignoriere diese E-Mail: Es \xE4ndert sich nichts.",
    pt: "Algu\xE9m (esperamos que voc\xEA) pediu para redefinir a senha da sua conta Pitlane HQ. Abra o link abaixo em at\xE9 1 hora para escolher uma nova. Se n\xE3o foi voc\xEA, ignore este email: nada muda."
  },
  resetButton: { en: "Choose a new password", es: "Elegir una contrase\xF1a nueva", de: "Neues Passwort w\xE4hlen", pt: "Escolher uma nova senha" }
};
var SITE = "https://pitlanehq.app";
var F = "-apple-system,'Segoe UI',Roboto,Helvetica,Arial,sans-serif";
function mailHTML(subject, text2, link, button2, l) {
  const L = lang(l), ask = { en: "Questions? Write to", es: "\xBFDudas? Escr\xEDbenos a", de: "Fragen? Schreib uns an", pt: "D\xFAvidas? Escreva para" }[L];
  const alt = { en: "If the button does not work, open this link:", es: "Si el bot\xF3n no funciona, abre este enlace:", de: "Wenn der Button nicht geht, \xF6ffne diesen Link:", pt: "Se o bot\xE3o n\xE3o funcionar, abra este link:" }[L];
  const why = { en: "You get this email because someone used this address on Pitlane HQ.", es: "Recibes este email porque alguien us\xF3 esta direcci\xF3n en Pitlane HQ.", de: "Du bekommst diese E-Mail, weil diese Adresse bei Pitlane HQ verwendet wurde.", pt: "Voc\xEA recebe este email porque algu\xE9m usou este endere\xE7o no Pitlane HQ." }[L];
  return `<!doctype html><html lang="${L}"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><meta name="color-scheme" content="dark"><meta name="supported-color-schemes" content="dark"><title>${esc2(subject)}</title></head>
<body style="margin:0;padding:0;background:#11151b">
<div style="display:none;max-height:0;overflow:hidden;opacity:0">${esc2(text2.slice(0, 110))}</div>
<table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0" bgcolor="#11151b" style="background:#11151b"><tr><td align="center" style="padding:32px 14px">
<table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0" style="max-width:520px">
<tr><td style="padding:0 4px 18px"><a href="${SITE}" style="text-decoration:none"><table role="presentation" cellpadding="0" cellspacing="0" border="0"><tr>
<td style="padding-right:12px"><img src="${SITE}/icon-192.png" width="40" height="40" alt="" style="display:block;border:0;width:40px;height:40px"></td>
<td style="font:800 20px ${F};letter-spacing:.06em;text-transform:uppercase;color:#e7ebf1">PITLANE HQ</td></tr></table></a></td></tr>
<tr><td bgcolor="#1a2029" style="background:#1a2029;border:1px solid #2b3542;border-radius:14px;padding:28px 26px">
<div style="font:800 13px ${F};letter-spacing:.1em;text-transform:uppercase;color:#ffb02e;margin:0 0 10px">${esc2(subject.replace(/^Pitlane HQ:\s*/, ""))}</div>
<p style="font:16px/1.55 ${F};color:#e7ebf1;margin:0 0 22px;white-space:pre-line">${esc2(text2)}</p>
<table role="presentation" cellpadding="0" cellspacing="0" border="0"><tr><td bgcolor="#ffb02e" style="background:#ffb02e;border-radius:8px">
<a href="${esc2(link)}" style="display:inline-block;padding:13px 22px;font:800 14px ${F};letter-spacing:.06em;text-transform:uppercase;color:#11151b;text-decoration:none">${esc2(button2)}</a></td></tr></table>
<p style="font:13px/1.5 ${F};color:#8a96a8;margin:22px 0 0">${esc2(alt)}<br><a href="${esc2(link)}" style="color:#aab4c3;word-break:break-all">${esc2(link)}</a></p>
</td></tr>
<tr><td style="padding:18px 6px 0;font:12px/1.6 ${F};color:#6c7789">${esc2(ask)} <a href="mailto:${SUPPORT}" style="color:#aab4c3">${SUPPORT}</a><br>${esc2(why)}<br><a href="${SITE}" style="color:#6c7789">pitlanehq.app</a></td></tr>
</table></td></tr></table></body></html>`;
}
__name(mailHTML, "mailHTML");
var lang = /* @__PURE__ */ __name((l) => ["en", "es", "pt"].includes(l) ? l : "en", "lang");
var esc2 = /* @__PURE__ */ __name((s) => String(s).replace(/[&<>"]/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" })[c]), "esc");
async function note(env, ok) {
  await env.DB.prepare("INSERT INTO app_state (k, v, at) VALUES (?1,?2,?3) ON CONFLICT(k) DO UPDATE SET v=excluded.v, at=excluded.at").bind(ok ? "mail_ok" : "mail_error", ok ? "" : JSON.stringify(lastError), Date.now()).run().catch(() => {
  });
}
__name(note, "note");
var mask = /* @__PURE__ */ __name((e) => {
  const [u, d] = String(e).split("@");
  return (u || "").slice(0, 2) + "\u2022\u2022\u2022@" + (d || "");
}, "mask");
async function logSent(env, to, subject, via, id2) {
  const row = await env.DB.prepare("SELECT v FROM app_state WHERE k='mail_log'").first().catch(() => null);
  let l = [];
  try {
    l = JSON.parse(row && row.v || "[]");
  } catch (e) {
  }
  l.unshift({ at: Date.now(), to: mask(to), subject, via, id: id2 || "" });
  await env.DB.prepare("INSERT INTO app_state (k, v, at) VALUES ('mail_log',?1,?2) ON CONFLICT(k) DO UPDATE SET v=excluded.v, at=excluded.at").bind(JSON.stringify(l.slice(0, 10)), Date.now()).run().catch(() => {
  });
}
__name(logSent, "logSent");
async function dns(name2, type) {
  try {
    const r2 = await fetch(`https://cloudflare-dns.com/dns-query?name=${encodeURIComponent(name2)}&type=${type}`, { headers: { accept: "application/dns-json" } });
    const j = await r2.json();
    return (j.Answer || []).map((a) => String(a.data || "").replace(/^"|"$/g, "").replace(/" "/g, ""));
  } catch (e) {
    return null;
  }
}
__name(dns, "dns");
async function mailDomain(env) {
  const from = (/<([^>]+)>/.exec(env.EMAIL_FROM || "") || [null, env.EMAIL_FROM || ""])[1].trim(), dom = from.split("@")[1] || "";
  if (!dom) return { domain: "", checks: [] };
  const [txt, mx, dmarc, rk, smx, stxt, bimi] = await Promise.all([
    dns(dom, "TXT"),
    dns(dom, "MX"),
    dns("_dmarc." + dom, "TXT"),
    dns("resend._domainkey." + dom, "TXT"),
    dns("send." + dom, "MX"),
    dns("send." + dom, "TXT"),
    dns("default._bimi." + dom, "TXT")
  ]);
  const spf = (txt || []).filter((x) => /^v=spf1/i.test(x)), checks = [];
  checks.push({ k: "resend-dkim", ok: (rk || []).some((x) => /^p=/.test(x)), got: (rk || []).join(" | ").slice(0, 60) || "\u2014", want: "TXT resend._domainkey: the p=\u2026 value from Resend \u2192 Domains" });
  checks.push({
    k: "resend-spf",
    ok: (smx || []).some((x) => /amazonses\.com/.test(x)) && (stxt || []).some((x) => /include:amazonses\.com/.test(x)),
    got: [...smx || [], ...stxt || []].join(" | ") || "\u2014",
    want: "on send: MX 10 feedback-smtp.us-east-1.amazonses.com and TXT v=spf1 include:amazonses.com ~all"
  });
  checks.push({
    k: "spf",
    ok: spf.length === 1 && !/protonmail/i.test(spf[0]),
    got: spf.join(" | ") || "\u2014",
    want: spf.length > 1 ? "one SPF record only (there are " + spf.length + ": join them)" : "v=spf1 include:_spf.mx.cloudflare.net ~all (Email Routing's), or v=spf1 -all"
  });
  checks.push({
    k: "mx",
    opt: true,
    ok: (mx || []).some((x) => /mx\.cloudflare\.net/.test(x)) && !(mx || []).some((x) => /protonmail/.test(x)),
    got: (mx || []).join(" | ") || "\u2014",
    want: "Cloudflare Email Routing's MX (route1/2/3.mx.cloudflare.net): Cloudflare \u2192 Email \u2192 Email Routing"
  });
  checks.push({ k: "dmarc", ok: (dmarc || []).some((x) => /^v=DMARC1/i.test(x)), got: (dmarc || []).join(" | ") || "\u2014", want: "_dmarc: v=DMARC1; p=quarantine" });
  const strict = (dmarc || []).some((x) => /p=(quarantine|reject)/i.test(x) && !/pct=(?!100)\d+/i.test(x));
  checks.push({
    k: "bimi",
    ok: strict && (bimi || []).some((x) => /^v=BIMI1/i.test(x) && /l=https:\/\//i.test(x)),
    got: (bimi || []).join(" | ") || "\u2014",
    want: (strict ? "" : "DMARC at p=quarantine (now: " + ((dmarc || [])[0] || "none") + "), and ") + "TXT default._bimi: v=BIMI1; l=https://" + dom + "/bimi.svg;"
  });
  return { domain: dom, via: "resend", checks, dnsOk: txt !== null };
}
__name(mailDomain, "mailDomain");
async function mailLog(env) {
  const row = await env.DB.prepare("SELECT v FROM app_state WHERE k='mail_log'").first().catch(() => null);
  let l = [];
  try {
    l = JSON.parse(row && row.v || "[]");
  } catch (e) {
  }
  for (const x of l.slice(0, 6)) {
    if (x.via !== "resend" || !x.id || !env.RESEND_API_KEY) continue;
    try {
      const r2 = await fetch("https://api.resend.com/emails/" + encodeURIComponent(x.id), { headers: { authorization: "Bearer " + env.RESEND_API_KEY } });
      const j = await r2.json().catch(() => ({}));
      x.state = r2.ok ? j.last_event || "sent" : r2.status === 401 || r2.status === 403 ? "resend-sent" : "unknown (" + r2.status + ")";
    } catch (e) {
      x.state = "unknown";
    }
  }
  return l;
}
__name(mailLog, "mailLog");
async function send(env, to, subject, text2, link, button2, l, reply2) {
  if (!mailReady(env)) {
    lastError = { at: Date.now(), message: "emails are not set up: EMAIL_FROM or RESEND_API_KEY is missing" };
    await note(env, false);
    return false;
  }
  try {
    return await send1(env, to, subject, text2, link, button2, l, reply2);
  } catch (e) {
    lastError = { at: Date.now(), message: String(e && e.message || e) };
    await note(env, false);
    return false;
  }
}
__name(send, "send");
async function send1(env, to, subject, text2, link, button2, l, reply2) {
  const html2 = mailHTML(subject, text2, link, button2, l);
  const plain2 = text2 + "\n\n" + link + "\n\n" + SUPPORT, replyTo = reply2 || env.EMAIL_REPLY_TO || SUPPORT;
  if (env.RESEND_API_KEY) {
    const r2 = await fetch("https://api.resend.com/emails", {
      method: "POST",
      headers: { authorization: "Bearer " + env.RESEND_API_KEY, "content-type": "application/json" },
      body: JSON.stringify({ from: env.EMAIL_FROM, reply_to: replyTo, to: [to], subject, text: plain2, html: html2 })
    });
    if (r2.ok) {
      lastError = null;
      const j = await r2.json().catch(() => ({}));
      await logSent(env, to, subject, "resend", j.id);
      await note(env, true);
      return true;
    }
    lastError = { at: Date.now(), via: "resend", status: r2.status, body: (await r2.text().catch(() => "")).slice(0, 500), from: env.EMAIL_FROM };
    console.error("email not sent by Resend", lastError);
    await note(env, false);
    return false;
  }
  await note(env, false);
  return false;
}
__name(send1, "send1");
var lastError = null;
async function sendTest(env, to, l) {
  const ok = await send(env, to, "Pitlane HQ: " + (lang(l) === "es" ? "email de prueba" : "test email"), lang(l) === "es" ? "Si lees esto, los emails del servidor funcionan." : "If you read this, the server's emails work.", "https://pitlanehq.app/", "Pitlane HQ", l);
  return { ok, via: env.RESEND_API_KEY ? "resend" : "", from: env.EMAIL_FROM, replyTo: env.EMAIL_REPLY_TO || SUPPORT, error: ok ? null : lastError };
}
__name(sendTest, "sendTest");
var sendVerify = /* @__PURE__ */ __name((env, to, link, l) => send(env, to, T.verifySubject[lang(l)], T.verifyText[lang(l)], link, T.verifyButton[lang(l)], l), "sendVerify");
var sendReset = /* @__PURE__ */ __name((env, to, link, l) => send(env, to, T.resetSubject[lang(l)], T.resetText[lang(l)], link, T.resetButton[lang(l)], l), "sendReset");
function feedbackMail(f) {
  const stars = f.rating ? "\u2605".repeat(f.rating) + "\u2606".repeat(5 - f.rating) + " (" + f.rating + "/5)" : "no stars";
  const ov = f.kind === "overlays";
  const subject = (ov ? "Pitlane HQ overlay feedback \xB7 " : "Pitlane HQ feedback \xB7 ") + (f.nick || "a driver") + (f.rating ? " \xB7 " + f.rating + "/5" : "");
  const text2 = [f.text, "", ...ov ? ["About the overlays \xB7 design " + (f.style || "classic")] : [], "From " + (f.nick || "\u2013") + " (" + (f.accountId || "\u2013") + ")", "Device " + (f.device || "\u2013") + " \xB7 version " + (f.v || "\u2013") + " \xB7 asked in " + (f.view || "\u2013"), stars, f.email ? "Reply to answer " + f.email : "No email known for this account"].join("\n");
  return { subject, text: text2 };
}
__name(feedbackMail, "feedbackMail");
async function sendFeedback(env, f) {
  const { subject, text: text2 } = feedbackMail(f);
  return send(env, SUPPORT, subject, text2, SITE + "/admin", "Open the admin page", "en", f.email || "");
}
__name(sendFeedback, "sendFeedback");
async function sendSupportChat(env, f) {
  const { subject, text: text2, link } = chatMail(f);
  return send(env, SUPPORT, subject, text2, link, "Open the support chat", "en", f.email || "");
}
__name(sendSupportChat, "sendSupportChat");
async function sendSupportReply(env, to, reply2, l) {
  const m = replyMail(reply2, l);
  return send(env, to, m.subject, m.text, m.link, m.button, m.lang);
}
__name(sendSupportReply, "sendSupportReply");

// src/pages.js
var S = {
  title: { en: "Pitlane HQ", es: "Pitlane HQ", de: "Pitlane HQ", pt: "Pitlane HQ" },
  verified: { en: "Your email is confirmed. You can close this page.", es: "Tu email est\xE1 confirmado. Ya puedes cerrar esta p\xE1gina.", de: "Deine E-Mail ist best\xE4tigt. Du kannst diese Seite schlie\xDFen.", pt: "Seu email est\xE1 confirmado. Pode fechar esta p\xE1gina." },
  badLink: { en: "This link is not valid any more. Ask for a new one from the app.", es: "Este enlace ya no es v\xE1lido. Pide uno nuevo desde la app.", de: "Dieser Link ist nicht mehr g\xFCltig. Fordere in der App einen neuen an.", pt: "Este link n\xE3o \xE9 mais v\xE1lido. Pe\xE7a um novo pelo app." },
  forgotTitle: { en: "Forgot your password?", es: "\xBFOlvidaste tu contrase\xF1a?", de: "Passwort vergessen?", pt: "Esqueceu a senha?" },
  forgotText: {
    en: "Type the email of your Pitlane HQ account and we send you a link to choose a new password.",
    es: "Escribe el email de tu cuenta de Pitlane HQ y te enviamos un enlace para elegir una contrase\xF1a nueva.",
    de: "Gib die E-Mail deines PitlaneHQ-Kontos ein und wir senden dir einen Link f\xFCr ein neues Passwort.",
    pt: "Digite o email da sua conta Pitlane HQ e enviamos um link para escolher uma nova senha."
  },
  send: { en: "Send me the link", es: "Enviarme el enlace", de: "Link senden", pt: "Enviar o link" },
  sent: {
    en: "If there is an account with that email, the link is on its way. Check your inbox (and spam).",
    es: "Si hay una cuenta con ese email, el enlace va de camino. Mira tu bandeja de entrada (y el spam).",
    de: "Wenn es ein Konto mit dieser E-Mail gibt, ist der Link unterwegs. Sieh in deinem Posteingang (und Spam) nach.",
    pt: "Se houver uma conta com esse email, o link est\xE1 a caminho. Veja sua caixa de entrada (e o spam)."
  },
  resetTitle: { en: "Choose a new password", es: "Elige una contrase\xF1a nueva", de: "Neues Passwort w\xE4hlen", pt: "Escolha uma nova senha" },
  resetText: {
    en: "When you sign in on your PC with the new password, the PC uploads your settings and races again. Your laps, name and setups stay.",
    es: "Al entrar en tu PC con la contrase\xF1a nueva, el PC vuelve a subir tus ajustes y carreras. Tus vueltas, nombre y setups se quedan.",
    de: "Wenn du dich am PC mit dem neuen Passwort anmeldest, l\xE4dt der PC deine Einstellungen und Rennen erneut hoch. Runden, Name und Setups bleiben.",
    pt: "Ao entrar no PC com a nova senha, o PC envia seus ajustes e corridas de novo. Suas voltas, nome e setups ficam."
  },
  email: { en: "Email", es: "Email", de: "E-Mail", pt: "Email" },
  pass: { en: "New password (at least 10 characters)", es: "Contrase\xF1a nueva (m\xEDnimo 10 caracteres)", de: "Neues Passwort (mindestens 10 Zeichen)", pt: "Nova senha (m\xEDnimo 10 caracteres)" },
  pass2: { en: "Repeat the password", es: "Repite la contrase\xF1a", de: "Passwort wiederholen", pt: "Repita a senha" },
  save: { en: "Save the new password", es: "Guardar la contrase\xF1a nueva", de: "Neues Passwort speichern", pt: "Salvar a nova senha" },
  done: { en: "Done. Sign in with your new password in the app.", es: "Listo. Entra con tu contrase\xF1a nueva en la app.", de: "Fertig. Melde dich in der App mit dem neuen Passwort an.", pt: "Pronto. Entre com a nova senha no app." },
  mismatch: { en: "The passwords do not match.", es: "Las contrase\xF1as no coinciden.", de: "Die Passw\xF6rter stimmen nicht \xFCberein.", pt: "As senhas n\xE3o coincidem." },
  short: { en: "The password needs at least 10 characters.", es: "La contrase\xF1a necesita al menos 10 caracteres.", de: "Das Passwort braucht mindestens 10 Zeichen.", pt: "A senha precisa de pelo menos 10 caracteres." },
  working: { en: "Working\u2026", es: "Un momento\u2026", de: "Einen Moment\u2026", pt: "Um momento\u2026" },
  back: { en: "Back to Pitlane HQ", es: "Volver a Pitlane HQ", de: "Zur\xFCck zu Pitlane HQ", pt: "Voltar ao Pitlane HQ" },
  noMail: { en: "Emails are not set up on this server yet.", es: "Los emails a\xFAn no est\xE1n configurados en este servidor.", de: "E-Mails sind auf diesem Server noch nicht eingerichtet.", pt: "Os emails ainda n\xE3o est\xE3o configurados neste servidor." }
};
var esc3 = /* @__PURE__ */ __name((s) => String(s).replace(/[&<>"]/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" })[c]), "esc");
function pageLang(req, url) {
  const q2 = url.searchParams.get("lang");
  if (q2) return lang(q2);
  const a = (req.headers.get("accept-language") || "").slice(0, 2).toLowerCase();
  return lang(a);
}
__name(pageLang, "pageLang");
function page2(l, body, script = "") {
  return new Response(
    `<!doctype html><html lang="${l}"><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>Pitlane HQ - Telemetry &amp; Coach</title>
<style>body{margin:0;min-height:100vh;display:grid;place-items:center;background:#11151b;color:#e7ebf1;font:16px/1.5 system-ui,sans-serif}main{width:min(420px,calc(100% - 32px))}
h1{font-size:22px;letter-spacing:.05em;text-transform:uppercase}p{color:#a9b4c3}label{display:block;margin:12px 0 4px;font-size:13px;color:#8a97a9;text-transform:uppercase;letter-spacing:.06em}
input{width:100%;box-sizing:border-box;font:16px system-ui;padding:12px;border-radius:8px;border:1px solid #2b3542;background:#19202a;color:#e7ebf1}
button{margin-top:16px;width:100%;padding:13px;border:0;border-radius:8px;background:#ffb02e;color:#11151b;font:700 15px system-ui;text-transform:uppercase;letter-spacing:.05em;cursor:pointer}
.err{color:#ff6363;min-height:1.4em}.ok{color:#38c97c}.back{display:inline-block;margin-top:22px;color:#8a97a9;font-size:14px;text-decoration:none}.back:hover{color:#e7ebf1}</style><main>${body}<a class="back" href="/">\u2190 ${esc3(S.back[l])}</a></main>${script ? `<script>${script}<\/script>` : ""}</html>`,
    {
      headers: {
        "content-type": "text/html; charset=utf-8",
        "cache-control": "no-store",
        "content-security-policy": "default-src 'none'; script-src 'unsafe-inline'; style-src 'unsafe-inline'; connect-src 'self'; form-action 'none'; frame-ancestors 'none'",
        "referrer-policy": "no-referrer"
      }
    }
  );
}
__name(page2, "page");
var messagePage = /* @__PURE__ */ __name((l, ok) => page2(l, `<h1>${S.title[l]}</h1><p class="${ok ? "ok" : "err"}">${esc3(ok ? S.verified[l] : S.badLink[l])}</p>`), "messagePage");
var badLinkPage = /* @__PURE__ */ __name((l) => page2(l, `<h1>${S.title[l]}</h1><p class="err">${esc3(S.badLink[l])}</p>`), "badLinkPage");
function forgotPage(l, ready) {
  if (!ready) return page2(l, `<h1>${esc3(S.forgotTitle[l])}</h1><p class="err">${esc3(S.noMail[l])}</p>`);
  return page2(
    l,
    `<h1>${esc3(S.forgotTitle[l])}</h1><p>${esc3(S.forgotText[l])}</p><form id="f"><label for="e">${esc3(S.email[l])}</label><input id="e" type="email" autocomplete="username" required><div class="err" id="m"></div><button>${esc3(S.send[l])}</button></form>`,
    `document.getElementById("f").onsubmit=async e=>{e.preventDefault();const m=document.getElementById("m");m.className="";m.textContent=${JSON.stringify(S.working[l])};
try{const r=await fetch("/account/forgot",{method:"POST",headers:{"content-type":"application/json"},body:JSON.stringify({email:document.getElementById("e").value.trim().toLowerCase(),lang:${JSON.stringify(l)}})});const j=await r.json().catch(()=>({}));
if(!r.ok)throw new Error(j.error||("HTTP "+r.status));m.className="ok";m.textContent=${JSON.stringify(S.sent[l])}}catch(x){m.className="err";m.textContent=x.message}}`
  );
}
__name(forgotPage, "forgotPage");
function resetPage(l, token) {
  return page2(
    l,
    `<h1>${esc3(S.resetTitle[l])}</h1><p>${esc3(S.resetText[l])}</p><form id="f"><label for="e">${esc3(S.email[l])}</label><input id="e" type="email" autocomplete="username" required>
<label for="p">${esc3(S.pass[l])}</label><input id="p" type="password" autocomplete="new-password" minlength="10" required><label for="p2">${esc3(S.pass2[l])}</label><input id="p2" type="password" autocomplete="new-password" minlength="10" required>
<div class="err" id="m"></div><button>${esc3(S.save[l])}</button></form>`,
    `const T=${JSON.stringify(token)},te=new TextEncoder(),hex=b=>[...new Uint8Array(b)].map(x=>x.toString(16).padStart(2,"0")).join("");
async function keys(email,pw){const salt=await crypto.subtle.digest("SHA-256",te.encode("pitlanehq-account-v1:"+email));const k=await crypto.subtle.importKey("raw",te.encode(pw),"PBKDF2",false,["deriveBits"]);
 const master=await crypto.subtle.deriveBits({name:"PBKDF2",hash:"SHA-256",salt,iterations:600000},k,256);const hk=await crypto.subtle.importKey("raw",master,"HKDF",false,["deriveBits"]);
 const d=info=>crypto.subtle.deriveBits({name:"HKDF",hash:"SHA-256",salt:new Uint8Array(0),info:te.encode(info)},hk,256);return{auth:hex(await d("pitlanehq auth")),wrap:await d("pitlanehq wrap")}}
async function seal(wrap,plain){const iv=crypto.getRandomValues(new Uint8Array(12));const key=await crypto.subtle.importKey("raw",wrap,"AES-GCM",false,["encrypt"]);
 const c=new Uint8Array(await crypto.subtle.encrypt({name:"AES-GCM",iv,additionalData:te.encode("pitlanehq-v1")},key,plain));const o=new Uint8Array(12+c.length);o.set(iv);o.set(c,12);let b="";o.forEach(x=>b+=String.fromCharCode(x));return btoa(b)}
document.getElementById("f").onsubmit=async e=>{e.preventDefault();const m=document.getElementById("m"),pw=document.getElementById("p").value;m.className="err";
 if(pw.length<10){m.textContent=${JSON.stringify(S.short[l])};return}if(pw!==document.getElementById("p2").value){m.textContent=${JSON.stringify(S.mismatch[l])};return}
 m.className="";m.textContent=${JSON.stringify(S.working[l])};
 try{const email=document.getElementById("e").value.trim().toLowerCase(),k=await keys(email,pw),wrappedKey=await seal(k.wrap,crypto.getRandomValues(new Uint8Array(32)));
  const r=await fetch("/account/reset",{method:"POST",headers:{"content-type":"application/json"},body:JSON.stringify({token:T,email,auth:k.auth,wrappedKey})});const j=await r.json().catch(()=>({}));
  if(!r.ok)throw new Error(j.error||("HTTP "+r.status));m.className="ok";m.textContent=${JSON.stringify(S.done[l])};document.querySelector("button").disabled=true}catch(x){m.className="err";m.textContent=x.message}}`
  );
}
__name(resetPage, "resetPage");

// src/patreon.js
function md5(bytes) {
  const K = new Uint32Array(64), S3 = [7, 12, 17, 22, 5, 9, 14, 20, 4, 11, 16, 23, 6, 10, 15, 21];
  for (let i = 0; i < 64; i++) K[i] = Math.floor(Math.abs(Math.sin(i + 1)) * 2 ** 32) >>> 0;
  const n = bytes.length, len = (n + 8 >> 6) * 64 + 64, m = new Uint8Array(len);
  m.set(bytes);
  m[n] = 128;
  const bits = n * 8;
  for (let i = 0; i < 8; i++) m[len - 8 + i] = i < 4 ? bits >>> 8 * i & 255 : Math.floor(bits / 2 ** (8 * i)) & 255;
  let a0 = 1732584193, b0 = 4023233417, c0 = 2562383102, d0 = 271733878;
  const w = new Uint32Array(16);
  for (let o = 0; o < len; o += 64) {
    for (let i = 0; i < 16; i++) w[i] = m[o + 4 * i] | m[o + 4 * i + 1] << 8 | m[o + 4 * i + 2] << 16 | m[o + 4 * i + 3] << 24;
    let a = a0, b = b0, c = c0, d = d0;
    for (let i = 0; i < 64; i++) {
      let f, g;
      if (i < 16) {
        f = b & c | ~b & d;
        g = i;
      } else if (i < 32) {
        f = d & b | ~d & c;
        g = (5 * i + 1) % 16;
      } else if (i < 48) {
        f = b ^ c ^ d;
        g = (3 * i + 5) % 16;
      } else {
        f = c ^ (b | ~d);
        g = 7 * i % 16;
      }
      const t = d;
      d = c;
      c = b;
      const x = a + f + K[i] + w[g] >>> 0, s = S3[(i >> 4) * 4 + i % 4];
      b = b + (x << s | x >>> 32 - s) >>> 0;
      a = t;
    }
    a0 = a0 + a >>> 0;
    b0 = b0 + b >>> 0;
    c0 = c0 + c >>> 0;
    d0 = d0 + d >>> 0;
  }
  const out = new Uint8Array(16);
  [a0, b0, c0, d0].forEach((v, i) => {
    for (let k = 0; k < 4; k++) out[4 * i + k] = v >>> 8 * k & 255;
  });
  return out;
}
__name(md5, "md5");
function hmacMd5Hex(key, msg) {
  const enc2 = new TextEncoder();
  let k = enc2.encode(key);
  if (k.length > 64) k = md5(k);
  const kp = new Uint8Array(64);
  kp.set(k);
  const ip = kp.map((x) => x ^ 54), op = kp.map((x) => x ^ 92), m = enc2.encode(msg);
  const inner = new Uint8Array(64 + m.length);
  inner.set(ip);
  inner.set(m, 64);
  const outer = new Uint8Array(80);
  outer.set(op);
  outer.set(md5(inner), 64);
  return [...md5(outer)].map((x) => x.toString(16).padStart(2, "0")).join("");
}
__name(hmacMd5Hex, "hmacMd5Hex");
var same = /* @__PURE__ */ __name((a, b) => {
  if (a.length !== b.length) return false;
  let r2 = 0;
  for (let i = 0; i < a.length; i++) r2 |= a.charCodeAt(i) ^ b.charCodeAt(i);
  return r2 === 0;
}, "same");
async function patreonWebhook(req, env) {
  const json14 = /* @__PURE__ */ __name((o, s = 200) => new Response(JSON.stringify(o), { status: s, headers: { "content-type": "application/json" } }), "json");
  if (!env.PATREON_WEBHOOK_SECRET) return json14({ error: "Patreon is not set up on this server" }, 404);
  const body = await req.text();
  if (body.length > 2e5) return json14({ error: "too large" }, 413);
  const sig = (req.headers.get("x-patreon-signature") || "").toLowerCase();
  if (!sig || !same(sig, hmacMd5Hex(env.PATREON_WEBHOOK_SECRET, body))) return json14({ error: "bad signature" }, 401);
  let j = null;
  try {
    j = JSON.parse(body);
  } catch (e) {
    return json14({ error: "not JSON" }, 400);
  }
  const ev = req.headers.get("x-patreon-event") || "";
  const at2 = j && j.data && j.data.attributes || {};
  const email = String(at2.email || "").trim().toLowerCase();
  if (!email) return json14({ ok: true, skipped: "no email" });
  const active = !/delete/.test(ev) && at2.patron_status === "active_patron";
  const eh = await emailHash(env, email), now = Date.now();
  await env.DB.batch([
    env.DB.prepare("INSERT INTO patreon_patrons (email_hash, active, updated) VALUES (?1,?2,?3) ON CONFLICT(email_hash) DO UPDATE SET active=excluded.active, updated=excluded.updated").bind(eh, active ? 1 : 0, now),
    active ? env.DB.prepare("UPDATE accounts SET supporter=1, supporter_src=COALESCE(supporter_src,'patreon') WHERE email_hash=?1").bind(eh) : env.DB.prepare("UPDATE accounts SET supporter=0, supporter_src=NULL WHERE email_hash=?1 AND supporter_src='patreon'").bind(eh)
  ]);
  return json14({ ok: true, active });
}
__name(patreonWebhook, "patreonWebhook");
async function patreonOnRegister(env, id2, eh) {
  const p = await env.DB.prepare("SELECT active FROM patreon_patrons WHERE email_hash=?1").bind(eh).first().catch(() => null);
  if (p && p.active) await env.DB.prepare("UPDATE accounts SET supporter=1, supporter_src='patreon' WHERE id=?1").bind(id2).run();
}
__name(patreonOnRegister, "patreonOnRegister");

// ../license_plans.json
var license_plans_default = {
  _help: "Pitlane HQ Pro. The admin page switches Pro on when the beta ends (until then everything is free). The lifetime offer: its price during the beta and after, and the Lemon Squeezy checkout link of its product (buy). The store charges; the server hears of each purchase through its webhook (secret LEMONSQUEEZY_WEBHOOK_SECRET).",
  enforce: false,
  provider: "lemonsqueezy",
  customUrl: "",
  storeUrl: "https://pitlanehq.lemonsqueezy.com",
  trialDays: 14,
  graceDays: 0,
  plans: [
    {
      id: "free",
      name: [
        "Free",
        "Gratis"
      ],
      price: [
        "\u20AC0",
        "0 \u20AC"
      ],
      features: [
        [
          "Live dashboard and overlays",
          "Panel en vivo y overlays"
        ],
        [
          "Calendar and series",
          "Calendario y series"
        ],
        [
          "Phone as a second screen",
          "M\xF3vil como segunda pantalla"
        ]
      ]
    },
    {
      id: "monthly",
      name: [
        "Pro monthly",
        "Pro mensual"
      ],
      price: [
        "\u20AC4.99 / month",
        "4,99 \u20AC / mes"
      ],
      buy: "https://pitlanehq.lemonsqueezy.com/checkout/buy/MONTHLY",
      features: [
        [
          "Everything in Free",
          "Todo lo de Gratis"
        ],
        [
          "Voice engineer",
          "Ingeniero por voz"
        ],
        [
          "Race analysis and braking coach",
          "An\xE1lisis de carrera y coach de frenada"
        ],
        [
          "Your laps on the web and the phone",
          "Tus vueltas en la web y el m\xF3vil"
        ],
        [
          "Discord bot: coach, compare, your server's ranking and alerts",
          "Bot de Discord: coach, comparar, ranking de tu servidor y alertas"
        ]
      ]
    },
    {
      id: "yearly",
      name: [
        "Pro yearly",
        "Pro anual"
      ],
      price: [
        "\u20AC39.99 / year",
        "39,99 \u20AC / a\xF1o"
      ],
      buy: "https://pitlanehq.lemonsqueezy.com/checkout/buy/YEARLY",
      features: [
        [
          "Everything in Pro",
          "Todo lo de Pro"
        ],
        [
          "2 months free",
          "2 meses gratis"
        ]
      ]
    },
    {
      id: "lifetime",
      name: [
        "Lifetime",
        "De por vida"
      ],
      price: [
        "\u20AC99 once",
        "99 \u20AC una vez"
      ],
      buy: "https://pitlanehq.lemonsqueezy.com/checkout/buy/LIFETIME",
      features: [
        [
          "Everything in Pro, forever",
          "Todo lo de Pro, para siempre"
        ],
        [
          "All future updates",
          "Todas las actualizaciones futuras"
        ]
      ]
    }
  ],
  variantPlans: {
    month: "monthly",
    year: "yearly",
    annual: "yearly",
    lifetime: "lifetime"
  },
  proViews: [
    "engineer",
    "races",
    "tracks",
    "coach",
    "cars"
  ],
  proFeatures: [
    "cloud",
    "discord",
    "shiftBeep",
    "brakeMarkers",
    "voicePacks"
  ],
  discordPro: [
    "coach",
    "compare",
    "board",
    "alerts"
  ],
  lifetime: {
    beta: 12,
    full: 24,
    currency: "EUR",
    buy: ""
  },
  freeApps: 3
};

// src/lemon.js
var JSONH = { "content-type": "application/json", "access-control-allow-origin": "*" };
var json3 = /* @__PURE__ */ __name((o, s = 200) => new Response(JSON.stringify(o), { status: s, headers: JSONH }), "json");
var err2 = /* @__PURE__ */ __name((e, s = 400) => json3({ error: e }, s), "err");
var gateAt = 0;
var gateOn = false;
async function proGate(env) {
  if (Date.now() - gateAt < 6e4) return gateOn;
  const r2 = await env.DB.prepare("SELECT v FROM app_state WHERE k='pro_gate'").first().catch(() => null);
  gateOn = !!(r2 && r2.v === "1");
  gateAt = Date.now();
  return gateOn;
}
__name(proGate, "proGate");
function proOf(a) {
  const on = !!(a && a.pro) && (!a.pro_until || a.pro_until > Date.now());
  return { pro: on, proSrc: on ? a.pro_src || "" : "", proUntil: on ? a.pro_until || 0 : 0 };
}
__name(proOf, "proOf");
async function proOffer(env) {
  const gate = await proGate(env), L = license_plans_default.lifetime || {};
  return { gate, beta: !gate, freeApps: license_plans_default.freeApps || 3, lifetime: { price: gate ? L.full : L.beta, full: L.full, beta: L.beta, currency: L.currency || "EUR", buy: L.buy || "" } };
}
__name(proOffer, "proOffer");
async function hmacHex(secret, body) {
  const k = await crypto.subtle.importKey("raw", new TextEncoder().encode(secret), { name: "HMAC", hash: "SHA-256" }, false, ["sign"]);
  const s = new Uint8Array(await crypto.subtle.sign("HMAC", k, new TextEncoder().encode(body)));
  return [...s].map((b) => b.toString(16).padStart(2, "0")).join("");
}
__name(hmacHex, "hmacHex");
var same2 = /* @__PURE__ */ __name((a, b) => {
  if (a.length !== b.length) return false;
  let d = 0;
  for (let i = 0; i < a.length; i++) d |= a.charCodeAt(i) ^ b.charCodeAt(i);
  return d === 0;
}, "same");
async function setPro(env, { accountId, eh, kind, until, on, order: order2 }) {
  const now = Date.now();
  if (!accountId && eh) {
    const a = await env.DB.prepare("SELECT id FROM accounts WHERE email_hash=?1").bind(eh).first().catch(() => null);
    if (a) accountId = a.id;
  }
  if (order2) await env.DB.prepare("INSERT INTO pro_orders (id, account_id, email_hash, kind, status, until, at) VALUES (?1,?2,?3,?4,?5,?6,?7) ON CONFLICT(id) DO UPDATE SET account_id=COALESCE(excluded.account_id, pro_orders.account_id), status=excluded.status, until=excluded.until, at=excluded.at").bind(order2, accountId || null, eh || null, kind, on ? "on" : "off", until || 0, now).run();
  if (!accountId) return false;
  if (on) await env.DB.prepare("UPDATE accounts SET pro=1, pro_src=?2, pro_until=?3, pro_since=CASE WHEN pro_since>0 THEN pro_since ELSE ?4 END WHERE id=?1 AND NOT (pro=1 AND pro_src='lifetime' AND ?2<>'lifetime')").bind(accountId, kind, until || 0, now).run();
  else await env.DB.prepare("UPDATE accounts SET pro=0, pro_src=NULL, pro_until=0 WHERE id=?1 AND pro_src=?2").bind(accountId, kind).run();
  return true;
}
__name(setPro, "setPro");
async function lemonWebhook(req, env) {
  if (!env.LEMONSQUEEZY_WEBHOOK_SECRET) return err2("Lemon Squeezy is not set up on this server", 404);
  const body = await req.text();
  if (body.length > 3e5) return err2("too large", 413);
  const sig = (req.headers.get("x-signature") || "").toLowerCase();
  if (!sig || !same2(sig, await hmacHex(env.LEMONSQUEEZY_WEBHOOK_SECRET, body))) return err2("bad signature", 401);
  let j;
  try {
    j = JSON.parse(body);
  } catch (e) {
    return err2("not JSON");
  }
  const ev = j.meta && j.meta.event_name || "", custom = j.meta && j.meta.custom_data || {}, d = j.data || {}, at2 = d.attributes || {};
  const email = String(at2.user_email || "").trim().toLowerCase();
  const eh = email ? await emailHash(env, email) : null;
  let accountId = /^[\w-]{6,80}$/.test(String(custom.account || "")) ? String(custom.account) : null;
  if (accountId) {
    const a = await env.DB.prepare("SELECT id FROM accounts WHERE id=?1").bind(accountId).first().catch(() => null);
    if (!a) accountId = null;
  }
  const t = /* @__PURE__ */ __name((v) => v ? Date.parse(v) || 0 : 0, "t");
  if (ev === "order_created" || ev === "order_refunded") {
    const items = at2.first_order_item || {}, isSub = !!(custom.kind === "subscription" || /month|year|mes|año|anual/i.test(String(items.variant_name || "")));
    if (isSub) return json3({ ok: true, skipped: "subscription order" });
    const paid = ev === "order_created" && at2.status === "paid" && !at2.refunded;
    await setPro(env, { accountId, eh, kind: "lifetime", until: 0, on: paid, order: "order:" + d.id });
    return json3({ ok: true, lifetime: paid });
  }
  if (/^subscription_/.test(ev)) {
    const live2 = ["active", "on_trial", "past_due", "cancelled"].includes(at2.status);
    const until = at2.status === "cancelled" ? t(at2.ends_at) : t(at2.renews_at) + 3 * 864e5;
    await setPro(env, { accountId, eh, kind: "subscription", until, on: live2 && until > Date.now(), order: "sub:" + d.id });
    return json3({ ok: true, subscription: live2 });
  }
  return json3({ ok: true, skipped: ev });
}
__name(lemonWebhook, "lemonWebhook");
async function proOnRegister(env, id2, eh) {
  const o = await env.DB.prepare("SELECT kind, until FROM pro_orders WHERE email_hash=?1 AND status='on' ORDER BY (kind='lifetime') DESC, until DESC LIMIT 1").bind(eh).first().catch(() => null);
  if (o && (!o.until || o.until > Date.now())) await env.DB.prepare("UPDATE accounts SET pro=1, pro_src=?2, pro_until=?3, pro_since=?4 WHERE id=?1").bind(id2, o.kind, o.until || 0, Date.now()).run();
}
__name(proOnRegister, "proOnRegister");
var pcOf = /* @__PURE__ */ __name((q2) => /^[0-9a-f]{32}$/.test(q2.get("pc") || "") ? q2.get("pc") : "", "pcOf");
var pcNameOf = /* @__PURE__ */ __name((q2) => String(q2.get("pcname") || "").replace(/[^\w .-]/g, "").slice(0, 40), "pcNameOf");
async function proHere(env, acc, q2) {
  const pc = pcOf(q2);
  if (!pc || !proOf(acc).pro) return {};
  if (!acc.pro_pc) {
    await env.DB.prepare("UPDATE accounts SET pro_pc=?2, pro_pc_name=?3, pro_pc_at=?4 WHERE id=?1 AND pro_pc IS NULL").bind(acc.id, pc, pcNameOf(q2), Date.now()).run();
    return { pcOk: true };
  }
  return acc.pro_pc === pc ? { pcOk: true } : { pcOk: false, pcName: acc.pro_pc_name || "" };
}
__name(proHere, "proHere");
async function proRoutes(req, env, p, m, body) {
  if (p === "/pro" && m === "GET") {
    const acc2 = await sessionAccount(req, env).catch(() => null);
    const q2 = new URL(req.url).searchParams, out = { ...await proOffer(env), ...acc2 ? proOf(acc2) : {}, admin: !!(acc2 && isAdmin(env, acc2.id)) };
    if (acc2) Object.assign(out, await proHere(env, acc2, q2));
    return json3(out);
  }
  if (p === "/pro/pc" && m === "POST") {
    const acc2 = await sessionAccount(req, env);
    if (!acc2) return err2("sign in", 401);
    const q2 = new URL(req.url).searchParams, pc = pcOf(q2);
    if (!pc) return err2("only the Pitlane HQ Agent on a PC can do this");
    if (!proOf(acc2).pro) return err2("this account has no Pro", 403);
    await env.DB.prepare("UPDATE accounts SET pro_pc=?2, pro_pc_name=?3, pro_pc_at=?4 WHERE id=?1").bind(acc2.id, pc, pcNameOf(q2), Date.now()).run();
    return json3({ ok: true, pcOk: true });
  }
  if (p !== "/admin/pro" && p !== "/admin/pro-user") return null;
  const acc = await sessionAccount(req, env);
  if (!acc || !isAdmin(env, acc.id)) return err2("only the admins of this server can do this", 403);
  if (p === "/admin/pro" && m === "POST") {
    await env.DB.prepare("INSERT INTO app_state (k, v, at) VALUES ('pro_gate', ?1, ?2) ON CONFLICT(k) DO UPDATE SET v=excluded.v, at=excluded.at").bind(body.gate ? "1" : "0", Date.now()).run();
    gateAt = 0;
  }
  if (p === "/admin/pro-user" && m === "POST") {
    const id2 = String(body.id || "");
    const r2 = body.on ? await env.DB.prepare("UPDATE accounts SET pro=1, pro_src='manual', pro_until=0, pro_since=CASE WHEN pro_since>0 THEN pro_since ELSE ?2 END WHERE id=?1").bind(id2, Date.now()).run() : await env.DB.prepare("UPDATE accounts SET pro=0, pro_src=NULL, pro_until=0 WHERE id=?1 AND pro_src='manual'").bind(id2).run();
    return r2.meta && r2.meta.changes ? json3({ ok: true }) : err2("account not found, or its Pro was bought (only a Pro given by hand is taken away here)", 404);
  }
  const c = await env.DB.prepare("SELECT COUNT(*) AS n, SUM(pro_src='lifetime') AS life, SUM(pro_src='subscription') AS sub, SUM(pro_src='manual') AS man FROM accounts WHERE pro=1 AND (pro_until=0 OR pro_until>?1)").bind(Date.now()).first().catch(() => ({}));
  const waiting = await env.DB.prepare("SELECT COUNT(*) AS n FROM pro_orders WHERE account_id IS NULL AND status='on'").first().catch(() => ({ n: 0 }));
  return json3({
    ...await proOffer(env),
    counts: { pro: c.n || 0, lifetime: c.life || 0, subscription: c.sub || 0, manual: c.man || 0, waiting: waiting.n || 0 },
    store: { webhook: !!env.LEMONSQUEEZY_WEBHOOK_SECRET, checkout: !!(license_plans_default.lifetime && license_plans_default.lifetime.buy), url: "https://pitlanehq.app/lemonsqueezy/webhook" }
  });
}
__name(proRoutes, "proRoutes");

// src/categories.js
var CATS = ["oval", "sports_car", "formula_car", "dirt_oval", "dirt_road"];
var LICS = ["R", "D", "C", "B", "A", "P"];
var MEMO = { stamp: -1, map: { tc: {}, c: {} } };
async function catMap(env) {
  const c = await env.DB.prepare("SELECT updated, chunks FROM season_cache WHERE k='current'").first().catch(() => null);
  if (!c) return MEMO.map;
  if (MEMO.stamp === c.updated) return MEMO.map;
  let season = null;
  try {
    const r2 = await env.DB.prepare("SELECT data FROM season_chunks WHERE k='current' AND idx<?1 ORDER BY idx").bind(c.chunks).all();
    season = JSON.parse((r2.results || []).map((x) => x.data).join(""));
  } catch (e) {
  }
  const norm = /* @__PURE__ */ __name((x) => x === "road" ? "sports_car" : x, "norm");
  const classes = {};
  for (const k of season && season.classes || []) classes[k.car_class_id] = (k.cars_in_class || []).map((x) => x.car_id);
  const tc = {}, votes = {};
  for (const s of season && season.seasons || []) {
    const cars = (s.car_class_ids || []).flatMap((id2) => classes[id2] || []);
    for (const w of s.schedules || []) {
      const cat = norm(w.category);
      if (!CATS.includes(cat)) continue;
      const wc = (w.race_week_cars || []).map((x) => x.car_id);
      const t = w.track && w.track.track_id;
      for (const car of wc.length ? wc : cars) {
        if (t) tc[t + ":" + car] = cat;
        const v = votes[car] = votes[car] || {};
        v[cat] = (v[cat] || 0) + 1;
      }
    }
  }
  for (const car of season && season.cars || []) {
    const cs = (car.categories || []).map(norm).filter((x) => CATS.includes(x));
    if (cs.length && !votes[car.car_id]) votes[car.car_id] = { [cs[0]]: 1 };
  }
  const cm = {};
  for (const [car, v] of Object.entries(votes)) cm[car] = Object.entries(v).sort((a, b) => b[1] - a[1])[0][0];
  MEMO = { stamp: c.updated, map: { tc, c: cm } };
  return MEMO.map;
}
__name(catMap, "catMap");
function guessCat(track2, car) {
  const t = String(track2 || ""), c = String(car || "");
  if (/dirt/i.test(t + " " + c) || /sprint ?car|midget|\bpro ?[24]\b|rallycross|stadium truck|\blites?\b/i.test(c))
    return /rallycross|road|\brx\b/i.test(t) || /rallycross|pro ?[24]\b|\blites?\b|stadium/i.test(c) ? "dirt_road" : "dirt_oval";
  if (/nascar|cup series|next gen|xfinity|craftsman|\btrucks?\b|\barca\b|late model|modified|legends|street stock|silver crown|stock ?car|super late/i.test(c)) return "oval";
  if (/\boval\b|superspeedway/i.test(t)) return "oval";
  if (/p217|lmp|\bgtp\b|\bdpi?\b|prototype|hypercar/i.test(c)) return "sports_car";
  if (/formula|\bf[1-4]\b|super ?formula|dallara|indy|\bir-?\d+|skip barber|ff1600|pro mazda|\busf\b|lotus (18|49|79)|williams|mercedes-amg w1|tatuus|\bvee\b|\bfr ?[23]\.|renault/i.test(c)) return "formula_car";
  return "sports_car";
}
__name(guessCat, "guessCat");
function catOf(map, trackId, carId, hint, track2, car) {
  const h = String(hint || "").toLowerCase().replace(/[^a-z]/g, "");
  const sure = { oval: "oval", dirtoval: "dirt_oval", dirtroad: "dirt_road", formulacar: "formula_car", formula: "formula_car", sportscar: "sports_car" }[h];
  const x = map.tc[trackId + ":" + carId] || sure || map.c[carId] || guessCat(track2, car);
  if (h === "road" && !["sports_car", "formula_car"].includes(x)) {
    const g = guessCat("", car);
    return g === "formula_car" ? g : "sports_car";
  }
  return x;
}
__name(catOf, "catOf");
var licOf = /* @__PURE__ */ __name((v) => {
  const s = String(v || "").trim().toUpperCase();
  if (s.startsWith("WC") || s.startsWith("PRO")) return "P";
  return LICS.includes(s[0]) ? s[0] : null;
}, "licOf");

// src/steam.js
var SITE2 = "https://pitlanehq.app";
var OPENID = "https://steamcommunity.com/openid/login";
var NS = "http://specs.openid.net/auth/2.0";
var JSONH2 = { "content-type": "application/json; charset=utf-8", "cache-control": "no-store", "access-control-allow-origin": "*" };
var json4 = /* @__PURE__ */ __name((v, status = 200) => new Response(JSON.stringify(v), { status, headers: JSONH2 }), "json");
var hex = /* @__PURE__ */ __name((b) => [...new Uint8Array(b)].map((x) => x.toString(16).padStart(2, "0")).join(""), "hex");
var rid = /* @__PURE__ */ __name((n = 24) => hex(crypto.getRandomValues(new Uint8Array(n))), "rid");
var isHex48 = /* @__PURE__ */ __name((v) => typeof v === "string" && /^[0-9a-f]{48}$/.test(v), "isHex48");
var portOf = /* @__PURE__ */ __name((v) => Number.isInteger(Number(v)) && Number(v) > 0 && Number(v) < 65536 ? Number(v) : null, "portOf");
var appOf = /* @__PURE__ */ __name((v) => v === 1 || v === true || v === "1", "appOf");
var site = /* @__PURE__ */ __name((env, url) => env.LOCAL === "1" ? url.origin : SITE2, "site");
var returnTo = /* @__PURE__ */ __name((base2, state) => base2 + "/steam/return?state=" + state, "returnTo");
function openidAnswer(params, ours) {
  const g = /* @__PURE__ */ __name((k) => (typeof params.get === "function" ? params.get(k) : params[k]) || "", "g");
  if (g("openid.ns") !== NS || g("openid.mode") !== "id_res") return null;
  const m = /^https:\/\/steamcommunity\.com\/openid\/id\/(\d{17})$/.exec(g("openid.claimed_id"));
  if (!m || g("openid.identity") !== g("openid.claimed_id")) return null;
  if (g("openid.op_endpoint") !== OPENID || g("openid.return_to") !== ours) return null;
  if (!g("openid.sig") || !g("openid.assoc_handle") || !g("openid.response_nonce")) return null;
  const signed2 = g("openid.signed").split(",").filter(Boolean);
  for (const k of ["claimed_id", "identity", "return_to", "response_nonce", "assoc_handle", "op_endpoint"]) if (!signed2.includes(k)) return null;
  const check = new URLSearchParams();
  const keys = typeof params.keys === "function" ? [...params.keys()] : Object.keys(params);
  for (const k of keys) if (k.startsWith("openid.")) check.set(k, g(k));
  check.set("openid.mode", "check_authentication");
  return { steamid: m[1], check };
}
__name(openidAnswer, "openidAnswer");
var openidValid = /* @__PURE__ */ __name((text2) => String(text2 || "").split("\n").some((l) => l.trim() === "is_valid:true"), "openidValid");
async function personaOf(env, steamid) {
  if (!env.STEAM_WEB_API_KEY) return null;
  try {
    const r2 = await fetch("https://api.steampowered.com/ISteamUser/GetPlayerSummaries/v2/?" + new URLSearchParams({ key: env.STEAM_WEB_API_KEY, steamids: steamid }));
    const j = r2.ok ? await r2.json() : null;
    const p = j && j.response && j.response.players && j.response.players[0];
    return p && cleanName(p.personaname) || null;
  } catch (e) {
    return null;
  }
}
__name(personaOf, "personaOf");
async function nameLink(env, steamid, persona) {
  if (!steamid) return null;
  if (persona === void 0) persona = await personaOf(env, steamid);
  if (!persona) return null;
  await env.DB.prepare("UPDATE steam_links SET persona=?2 WHERE steamid=?1 AND COALESCE(persona,'')<>?2").bind(steamid, persona).run().catch(() => {
  });
  return persona;
}
__name(nameLink, "nameLink");
async function steamStart(env, url, kind, accountId, device, port, app) {
  if (portOf(port) && appOf(app)) return { error: "port or app, not both" };
  const state = rid(), code = rid(), now = Date.now(), base2 = site(env, url);
  await env.DB.batch([
    env.DB.prepare("DELETE FROM steam_oauth WHERE expires<?1 OR (account_id IS NOT NULL AND account_id=?2)").bind(now, accountId || ""),
    env.DB.prepare("INSERT INTO steam_oauth (state_hash, code_hash, account_id, device, kind, port, app, expires) VALUES (?1,?2,?3,?4,?5,?6,?7,?8)").bind(await sha256("steam-oauth:" + state), await sha256("steam-code:" + code), accountId || null, cleanName(device) || null, kind, portOf(port), appOf(app) ? 1 : 0, now + 10 * 6e4)
  ]);
  const q2 = new URLSearchParams({ "openid.ns": NS, "openid.mode": "checkid_setup", "openid.identity": NS + "/identifier_select", "openid.claimed_id": NS + "/identifier_select", "openid.return_to": returnTo(base2, state), "openid.realm": base2 });
  return { url: OPENID + "?" + q2, state, code };
}
__name(steamStart, "steamStart");
async function linkSteam(env, steamid, accountId, persona) {
  const other = await env.DB.prepare("SELECT account_id, shown FROM steam_links WHERE steamid=?1").bind(steamid).first();
  if (other && other.account_id !== accountId) return "taken";
  await env.DB.batch([
    env.DB.prepare("DELETE FROM steam_links WHERE steamid=?1 OR account_id=?2").bind(steamid, accountId),
    env.DB.prepare("INSERT INTO steam_links (steamid, account_id, persona, created, shown) VALUES (?1,?2,?3,?4,?5)").bind(steamid, accountId, persona || null, Date.now(), other && other.shown ? 1 : 0)
  ]);
  return "ok";
}
__name(linkSteam, "linkSteam");
async function newGrant(env, kind, st, steamid, persona, ttl) {
  const g = rid();
  await env.DB.batch([
    env.DB.prepare("DELETE FROM steam_grants WHERE expires<?1").bind(Date.now()),
    env.DB.prepare("INSERT INTO steam_grants (grant_hash, code_hash, account_id, steamid, persona, device, kind, expires) VALUES (?1,?2,?3,?4,?5,?6,?7,?8)").bind(await sha256("steam-grant:" + g), st.code_hash, st.account_id || null, steamid, persona, st.device, kind, Date.now() + ttl)
  ]);
  return g;
}
__name(newGrant, "newGrant");
async function useSteamGrant(env, g, kind, code) {
  if (!isHex48(g) || !isHex48(code)) return null;
  const r2 = await env.DB.prepare("DELETE FROM steam_grants WHERE grant_hash=?1 AND kind=?2 RETURNING code_hash, account_id, steamid, persona, device, expires").bind(await sha256("steam-grant:" + g), kind).first();
  return r2 && r2.expires >= Date.now() && r2.code_hash === await sha256("steam-code:" + code) ? r2 : null;
}
__name(useSteamGrant, "useSteamGrant");
var steamAccountId = /* @__PURE__ */ __name(async (env, steamid) => (await env.DB.prepare("SELECT account_id FROM steam_links WHERE steamid=?1").bind(steamid).first() || {}).account_id || null, "steamAccountId");
function goOn(base2, prov, st, state, q2) {
  if (!st) return Response.redirect(base2 + "/?" + q2, 302);
  if (st.port) return Response.redirect("http://127.0.0.1:" + st.port + "/" + prov + "/done?state=" + state + "&" + q2, 302);
  if (st.app) return new Response(null, { status: 302, headers: { location: "pitlanehq://" + prov + "?state=" + state + "&" + q2, "cache-control": "no-store" } });
  return Response.redirect(base2 + "/?state=" + state + "&" + q2, 302);
}
__name(goOn, "goOn");
async function steamReturn(req, env, url) {
  const base2 = site(env, url);
  const state = url.searchParams.get("state") || "";
  if (!isHex48(state)) return Response.redirect(base2 + "/?steamLogin=0", 302);
  const st = await env.DB.prepare("DELETE FROM steam_oauth WHERE state_hash=?1 RETURNING code_hash, account_id, device, kind, port, app, expires").bind(await sha256("steam-oauth:" + state)).first();
  const back = /* @__PURE__ */ __name((q2) => goOn(base2, "steam", st, state, q2), "back");
  const fail2 = /* @__PURE__ */ __name(() => back(st && st.kind === "link" ? "steamLinked=0" : "steamLogin=0"), "fail");
  if (!st || st.expires < Date.now()) return fail2();
  try {
    return await steamAnswer(env, url, base2, state, st, back, fail2);
  } catch (e) {
    return fail2();
  }
}
__name(steamReturn, "steamReturn");
async function steamAnswer(env, url, base2, state, st, back, fail2) {
  const ans = openidAnswer(url.searchParams, returnTo(base2, state));
  if (!ans) return fail2();
  try {
    const r2 = await fetch(OPENID, { method: "POST", headers: { "content-type": "application/x-www-form-urlencoded" }, body: ans.check });
    if (!r2.ok || !openidValid(await r2.text())) return fail2();
  } catch (e) {
    return fail2();
  }
  const persona = await personaOf(env, ans.steamid);
  if (st.kind === "link") {
    if (!st.account_id) return fail2();
    return back("steamLink=" + await newGrant(env, "link", st, ans.steamid, persona, 5 * 6e4));
  }
  if (await steamAccountId(env, ans.steamid)) {
    await nameLink(env, ans.steamid, persona);
    return back("steamLogin=" + await newGrant(env, "login", st, ans.steamid, persona, 5 * 6e4));
  }
  const q2 = new URLSearchParams({ steamLogin: "0", new: "1", sid: await newGrant(env, "signup", st, ans.steamid, persona, 30 * 6e4) });
  if (persona) q2.set("persona", persona);
  return back(String(q2));
}
__name(steamAnswer, "steamAnswer");
async function steamAccount(env, a, p, m, body, url, passCheck) {
  if (p === "/steam" && m === "GET") {
    const l = await env.DB.prepare("SELECT steamid, persona, shown FROM steam_links WHERE account_id=?1").bind(a.id).first();
    if (l && !l.persona) l.persona = await nameLink(env, l.steamid);
    return json4({ linked: !!l, id: l ? l.steamid : void 0, persona: l ? l.persona || "" : void 0, shown: !!(l && l.shown) });
  }
  if (p === "/steam/start" && m === "POST") {
    const no = await passCheck();
    if (no) return no;
    const r2 = await steamStart(env, url, "link", a.id, body.device, body.port, body.app || url.searchParams.get("app"));
    return json4(r2, r2.error ? 400 : 200);
  }
  if (p === "/steam/link" && m === "POST") {
    const g = await useSteamGrant(env, body.grant, "link", body.code);
    if (!g || g.account_id !== a.id) return json4({ error: "this Steam sign-in is not valid any more, sign in with Steam again" }, 400);
    const res = await linkSteam(env, g.steamid, a.id, g.persona);
    if (res === "taken") return json4({ error: "this Steam account is already linked to another account", code: "taken" }, 409);
    return json4({ ok: true, persona: g.persona || "" });
  }
  if (p === "/steam/shown" && m === "POST") {
    await env.DB.prepare("UPDATE steam_links SET shown=?2 WHERE account_id=?1").bind(a.id, body.shown ? 1 : 0).run();
    return json4({ ok: true, shown: !!body.shown });
  }
  if (p === "/steam/unlink" && m === "POST") {
    const no = await passCheck();
    if (no) return no;
    await env.DB.prepare("DELETE FROM steam_links WHERE account_id=?1").bind(a.id).run();
    return json4({ ok: true });
  }
  return json4({ error: "not found" }, 404);
}
__name(steamAccount, "steamAccount");

// src/discord.js
var SITE3 = "https://pitlanehq.app";
var API = "https://discord.com/api/v10";
var AMBER = 16756782;
var PURPLE = 11104511;
var EPHEMERAL = 64;
var MANAGE_GUILD = 0x20n;
var PRO = new Set(license_plans_default.discordPro || []);
var PUBLIC_CMDS = /* @__PURE__ */ new Set(["record", "driver", "download", "coach", "compare", "board", "track"]);
var fmt = /* @__PURE__ */ __name((t) => {
  if (!(t > 0)) return "\u2013";
  const m = Math.floor(t / 60), s = t - m * 60;
  return (m ? m + ":" + (s < 10 ? "0" : "") : "") + s.toFixed(3);
}, "fmt");
var gap = /* @__PURE__ */ __name((d) => (d < 0 ? "\u2212" : "+") + Math.abs(d).toFixed(3), "gap");
var fix = /* @__PURE__ */ __name((s) => {
  s = String(s || "");
  if (!/[ÃÂ]/.test(s)) return s;
  try {
    return decodeURIComponent(escape(s));
  } catch (e) {
    return s;
  }
}, "fix");
var slug = /* @__PURE__ */ __name((s) => String(s || "").toLowerCase().normalize("NFD").replace(/[̀-ͯ]/g, "").replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "").slice(0, 80), "slug");
var PRE = { en: "", es: "/es", pt: "/pt" };
var recUrl = /* @__PURE__ */ __name((l, x) => `${SITE3}${PRE[l]}/records/${x.t}-${x.c}/${slug(fix(x.track) + " " + fix(x.car))}`, "recUrl");
var md = /* @__PURE__ */ __name((s) => String(s || "").replace(/[\\*_~`|[\]]/g, (c) => "\\" + c), "md");
var CAT = {
  en: { oval: "Oval", sports_car: "Sports Car", formula_car: "Formula Car", dirt_oval: "Dirt Oval", dirt_road: "Dirt Road" },
  es: { oval: "\xD3valo", sports_car: "Sports Car", formula_car: "F\xF3rmula", dirt_oval: "\xD3valo de tierra", dirt_road: "Tierra" },
  pt: { oval: "Oval", sports_car: "Sports Car", formula_car: "F\xF3rmula", dirt_oval: "Oval de terra", dirt_road: "Terra" }
};
var langOf = /* @__PURE__ */ __name((loc) => {
  const s = String(loc || "");
  return s.startsWith("es") ? "es" : s.startsWith("pt") ? "pt" : "en";
}, "langOf");
var LANGS = ["en", "es", "pt"];
var tr = /* @__PURE__ */ __name((l, en, es, pt) => l === "es" ? es : l === "pt" ? pt : en, "tr");
var anonName = /* @__PURE__ */ __name((l) => tr(l, "Anonymous", "An\xF3nimo", "An\xF4nimo"), "anonName");
var SHOWN = "CASE WHEN l.anon=1 OR COALESCE(ac.anon,0)=1 OR u.alias='Anonymous' THEN '' ELSE u.alias END";
var NOT_MODEL = "COALESCE(l.shown,'')<>'model'";
var reply = /* @__PURE__ */ __name((o) => new Response(JSON.stringify(o), { headers: { "content-type": "application/json" } }), "reply");
var answer = /* @__PURE__ */ __name((data, eph) => ({ allowed_mentions: { parse: [] }, ...data, ...eph ? { flags: EPHEMERAL } : {} }), "answer");
var say = /* @__PURE__ */ __name((data, eph) => reply({ type: 4, data: answer(data, eph) }), "say");
var text = /* @__PURE__ */ __name((content, eph = true) => say({ content }, eph), "text");
var button = /* @__PURE__ */ __name((label, url) => ({ type: 2, style: 5, label: label.slice(0, 80), url }), "button");
var buttons = /* @__PURE__ */ __name((...b) => [{ type: 1, components: b.filter(Boolean) }], "buttons");
var unhex = /* @__PURE__ */ __name((h) => new Uint8Array((String(h).match(/../g) || []).map((x) => parseInt(x, 16))), "unhex");
async function signed(req, env, body) {
  const sig = req.headers.get("x-signature-ed25519") || "", ts = req.headers.get("x-signature-timestamp") || "";
  if (!env.DISCORD_PUBLIC_KEY || !/^[0-9a-f]{128}$/i.test(sig) || !/^\d{1,16}$/.test(ts)) return false;
  try {
    const key = await crypto.subtle.importKey("raw", unhex(env.DISCORD_PUBLIC_KEY.trim()), { name: "Ed25519" }, false, ["verify"]);
    return await crypto.subtle.verify({ name: "Ed25519" }, key, unhex(sig), new TextEncoder().encode(ts + body));
  } catch (e) {
    return false;
  }
}
__name(signed, "signed");
async function isPro(env, accountId) {
  if (!license_plans_default.enforce) return true;
  if (!accountId) return false;
  if (isAdmin(env, accountId)) return true;
  const a = await env.DB.prepare("SELECT supporter FROM accounts WHERE id=?1").bind(accountId).first();
  return !!a && a.supporter === 1;
}
__name(isPro, "isPro");
async function discordInteraction(req, env, ctx) {
  if (req.method !== "POST") return new Response("not found", { status: 404 });
  const body = await req.text();
  if (body.length > 2e5 || !await signed(req, env, body)) return new Response("bad signature", { status: 401 });
  const it = JSON.parse(body);
  if (it.type === 1) return reply({ type: 1 });
  if (it.type === 4) return reply({ type: 8, data: { choices: await suggest(env, it).catch(() => []) } });
  const user = it.member && it.member.user || it.user || {};
  const me2 = user.id ? await env.DB.prepare("SELECT (SELECT account_id FROM discord_links WHERE discord_id=?1) AS account, (SELECT lang FROM discord_users WHERE discord_id=?1) AS lang, (SELECT cmd_channels FROM discord_guilds WHERE guild_id=?2) AS chans").bind(user.id, it.guild_id || "").first() : null;
  const l = LANGS.includes(me2 && me2.lang) ? me2.lang : langOf(it.locale);
  if (it.type !== 2 && it.type !== 3 || !it.data) return text(tr(l, "Unknown action", "Acci\xF3n desconocida", "A\xE7\xE3o desconhecida"));
  const x = { env, ctx, it, l, user, account: me2 && me2.account || null, guild: it.guild_id || null, opt: {} };
  if (it.type === 3) {
    try {
      return await panelAction(x);
    } catch (e) {
      return text(tr(l, "Something went wrong, try again in a moment.", "Algo ha fallado, prueba otra vez en un momento.", "Algo deu errado, tente de novo em um momento."));
    }
  }
  for (const o of it.data.options || []) x.opt[o.name] = o.value;
  if (x.account && x.guild) ctx.waitUntil(env.DB.prepare("INSERT INTO discord_members (guild_id, discord_id, seen) VALUES (?1,?2,?3) ON CONFLICT(guild_id, discord_id) DO UPDATE SET seen=excluded.seen").bind(x.guild, user.id, Date.now()).run().catch(() => {
  }));
  const name2 = it.data.name;
  let chans = [];
  try {
    chans = JSON.parse(me2 && me2.chans || "[]") || [];
  } catch (e) {
  }
  if (x.guild && chans.length && PUBLIC_CMDS.has(name2) && !chans.includes(it.channel_id) && !chans.includes(it.channel && it.channel.parent_id))
    return text(tr(l, "In this server the bot answers in ", "En este servidor el bot responde en ", "Neste servidor o bot responde em ") + chans.map((c) => `<#${c}>`).join(" ") + ".");
  if (PRO.has(name2) && !await isPro(env, x.account)) return proOnly(x);
  const run = { record, driver, link: linkStart, unlink, download, help, language, setup, coach, compare, board, alerts, recent, track, league }[name2];
  if (!run) return text(tr(l, "Unknown command", "Comando desconocido", "Comando desconhecido"));
  try {
    return await run(x);
  } catch (e) {
    return text(tr(l, "Something went wrong, try again in a moment.", "Algo ha fallado, prueba otra vez en un momento.", "Algo deu errado, tente de novo em um momento."));
  }
}
__name(discordInteraction, "discordInteraction");
function later(x, eph, work, update) {
  const send2 = /* @__PURE__ */ __name((data) => fetch(`${API}/webhooks/${x.it.application_id}/${x.it.token}/messages/@original`, { method: "PATCH", headers: { "content-type": "application/json" }, body: JSON.stringify(answer(data)) }), "send");
  x.ctx.waitUntil(work().catch(() => ({ content: tr(x.l, "Something went wrong, try again in a moment.", "Algo ha fallado, prueba otra vez en un momento.", "Algo deu errado, tente de novo em um momento.") })).then(send2).catch(() => {
  }));
  return reply(update ? { type: 6 } : { type: 5, data: eph ? { flags: EPHEMERAL } : {} });
}
__name(later, "later");
var needLink = /* @__PURE__ */ __name((x) => say({ content: tr(x.l, "Link your Pitlane HQ account first with /link.", "Vincula antes tu cuenta de Pitlane HQ con /link.", "Vincule antes a sua conta do Pitlane HQ com /link.") }, true), "needLink");
function proOnly(x) {
  const url = license_plans_default.storeUrl || SITE3;
  return say({
    embeds: [{
      color: PURPLE,
      title: tr(x.l, "A Pitlane HQ Pro feature", "Una funci\xF3n de Pitlane HQ Pro", "Um recurso do Pitlane HQ Pro"),
      description: x.account ? tr(x.l, "This command is part of Pitlane HQ Pro.", "Este comando es parte de Pitlane HQ Pro.", "Este comando faz parte do Pitlane HQ Pro.") : tr(x.l, "This command is part of Pitlane HQ Pro. Link your account with /link first.", "Este comando es parte de Pitlane HQ Pro. Vincula antes tu cuenta con /link.", "Este comando faz parte do Pitlane HQ Pro. Vincule antes a sua conta com /link.")
    }],
    components: buttons(button(tr(x.l, "See the plans", "Ver los planes", "Ver os planos"), url))
  }, true);
}
__name(proOnly, "proOnly");
var isAnon = /* @__PURE__ */ __name(async (env, id2) => !!(id2 && (await env.DB.prepare("SELECT anon FROM accounts WHERE id=?1").bind(id2).first() || {}).anon), "isAnon");
async function combos(env, q2, n) {
  const words = String(q2 || "").toLowerCase().split(/\s+/).map((w) => w.replace(/[^\p{L}\p{N}]/gu, "")).filter(Boolean).slice(0, 5);
  const squash = "replace(replace(replace(replace(lower(l.track||l.car),' ',''),'-',''),'.',''),'\xB7','')";
  const where = words.map((_, i) => `AND ${squash} LIKE ?${i + 2}`).join(" ");
  const r2 = await env.DB.prepare(
    `SELECT l.track_id AS t, MAX(l.track) AS track, l.car_id AS c, MAX(l.car) AS car, COUNT(DISTINCT l.user_id) AS drivers, MIN(l.time) AS best
       FROM community_laps l WHERE l.game='iracing' AND l.track_id>0 AND l.car_id>0 AND ${NOT_MODEL} ${where}
      GROUP BY l.track_id, l.car_id ORDER BY drivers DESC, best LIMIT ?1`
  ).bind(n, ...words.map((w) => "%" + w + "%")).all();
  return (r2.results || []).map((x) => ({ ...x, car: famName("iracing", x.c, x.car) }));
}
__name(combos, "combos");
async function comboOf(env, v) {
  const m = /^(\d+)-(\d+)$/.exec(String(v || ""));
  if (m) {
    const c = await famId(env, "iracing", m[2]);
    const r2 = await env.DB.prepare("SELECT MAX(track) AS track, MAX(car) AS car FROM community_laps WHERE track_id=?1 AND car_id=?2 AND game='iracing'").bind(+m[1], c).first();
    if (r2 && r2.track) return { t: +m[1], c, track: r2.track, car: famName("iracing", c, r2.car) };
  }
  return (await combos(env, v, 1))[0] || null;
}
__name(comboOf, "comboOf");
var noCombo = /* @__PURE__ */ __name((x) => text(tr(x.l, "No laps on that car and track yet. Pick one from the list as you type.", "A\xFAn no hay vueltas en ese coche y circuito. Elige uno de la lista mientras escribes.", "Ainda n\xE3o h\xE1 voltas nesse carro e pista. Escolha um da lista enquanto digita.")), "noCombo");
async function driverOf(env, name2) {
  const n = String(name2 || "").trim().toLowerCase();
  if (!n) return null;
  const q2 = "SELECT a.id, a.created, a.member_since, a.supporter, a.supporter_hidden, a.anon, u.alias, u.lics FROM accounts a JOIN community_users u ON u.id=a.id WHERE a.anon=0 AND ";
  const exact = await env.DB.prepare(q2 + "lower(u.alias)=?1").bind(n).first();
  if (exact) return exact;
  const r2 = await env.DB.prepare(q2 + "lower(u.alias) LIKE ?1 LIMIT 2").bind("%" + n.replace(/[%_]/g, "") + "%").all();
  return (r2.results || []).length === 1 ? r2.results[0] : null;
}
__name(driverOf, "driverOf");
var accountOf = /* @__PURE__ */ __name((env, id2) => env.DB.prepare("SELECT a.id, a.created, a.member_since, a.supporter, a.supporter_hidden, a.anon, u.alias, u.lics FROM accounts a JOIN community_users u ON u.id=a.id WHERE a.id=?1").bind(id2).first(), "accountOf");
async function suggest(env, it) {
  const f = (it.data.options || []).find((o) => o.focused);
  if (!f) return [];
  if (f.name === "car_track") return (await combos(env, f.value, 25)).map((x) => ({ name: `${fix(x.track)} \xB7 ${fix(x.car)}`.slice(0, 100), value: `${x.t}-${x.c}` }));
  if (f.name === "track") return (await tracks(env, f.value, 25)).map((x) => ({ name: fix(x.track).slice(0, 100), value: String(x.t) }));
  if (f.name === "league") {
    const r4 = await env.DB.prepare("SELECT id, name FROM leagues WHERE lower(name) LIKE ?1 ORDER BY updated DESC LIMIT 25").bind("%" + String(f.value || "").trim().toLowerCase().replace(/[%_]/g, "") + "%").all();
    return (r4.results || []).map((x) => ({ name: fix(x.name).slice(0, 100), value: x.id }));
  }
  const n = String(f.value || "").trim().toLowerCase().replace(/[%_]/g, "");
  const r2 = await env.DB.prepare(
    `SELECT u.alias FROM accounts a JOIN community_users u ON u.id=a.id WHERE a.anon=0 AND lower(u.alias) LIKE ?1
      AND EXISTS (SELECT 1 FROM community_laps l WHERE l.user_id=a.id AND l.anon=0) ORDER BY (lower(u.alias) LIKE ?2) DESC, u.alias LIMIT 25`
  ).bind("%" + n + "%", n + "%").all();
  return (r2.results || []).map((x) => ({ name: x.alias.slice(0, 100), value: x.alias.slice(0, 100) }));
}
__name(suggest, "suggest");
async function record(x) {
  const k = await comboOf(x.env, x.opt.car_track);
  if (!k) return noCombo(x);
  const r2 = await x.env.DB.prepare(
    `SELECT l.user_id AS uid, ${SHOWN} AS alias, l.time FROM community_laps l JOIN community_users u ON u.id=l.user_id LEFT JOIN accounts ac ON ac.id=l.user_id
      WHERE l.track_id=?1 AND l.car_id=?2 AND l.game='iracing' AND ${NOT_MODEL} ORDER BY l.time LIMIT 10`
  ).bind(k.t, k.c).all();
  const laps = r2.results || [];
  if (!laps.length) return noCombo(x);
  const all = (await x.env.DB.prepare(`SELECT COUNT(*) AS n FROM community_laps l WHERE l.track_id=?1 AND l.car_id=?2 AND l.game='iracing' AND ${NOT_MODEL}`).bind(k.t, k.c).first()).n;
  const medal = ["\u{1F947}", "\u{1F948}", "\u{1F949}"];
  const lines = laps.map((v, i) => `${medal[i] || `\`${String(i + 1).padStart(2)}\``} \`${fmt(v.time)}\` ${i ? `\`${gap(v.time - laps[0].time)}\` ` : ""}${md(v.alias || anonName(x.l))}`);
  if (x.account && !await isAnon(x.env, x.account)) {
    const mine = await x.env.DB.prepare("SELECT time, anon FROM community_laps WHERE user_id=?1 AND track_id=?2 AND car_id=?3 AND game='iracing'").bind(x.account, k.t, k.c).first();
    if (mine && !mine.anon && !laps.some((v) => v.uid === x.account)) {
      const pos = (await x.env.DB.prepare(`SELECT COUNT(*) AS n FROM community_laps l WHERE l.track_id=?1 AND l.car_id=?2 AND l.game='iracing' AND ${NOT_MODEL} AND l.time<?3`).bind(k.t, k.c, mine.time).first()).n + 1;
      lines.push("", tr(x.l, `You: **P${pos}** \`${fmt(mine.time)}\` \`${gap(mine.time - laps[0].time)}\``, `T\xFA: **P${pos}** \`${fmt(mine.time)}\` \`${gap(mine.time - laps[0].time)}\``, `Voc\xEA: **P${pos}** \`${fmt(mine.time)}\` \`${gap(mine.time - laps[0].time)}\``));
    }
  }
  return say({
    embeds: [{
      color: AMBER,
      title: fix(k.car).slice(0, 250),
      url: recUrl(x.l, k),
      description: `**${md(fix(k.track))}**

` + lines.join("\n"),
      footer: { text: tr(x.l, `${all} drivers \xB7 one lap each, their fastest \xB7 Pitlane HQ`, `${all} pilotos \xB7 una vuelta cada uno, la m\xE1s r\xE1pida \xB7 Pitlane HQ`, `${all} pilotos \xB7 uma volta cada um, a mais r\xE1pida \xB7 Pitlane HQ`) }
    }]
  });
}
__name(record, "record");
async function driver(x) {
  let a = null, self = false;
  if (x.opt.name) a = await driverOf(x.env, x.opt.name);
  else if (x.account) {
    a = await accountOf(x.env, x.account);
    self = true;
  } else return needLink(x);
  if (!a) return text(tr(x.l, "No driver by that name (anonymous drivers have no profile).", "No hay ning\xFAn piloto con ese nombre (los pilotos an\xF3nimos no tienen perfil).", "N\xE3o h\xE1 nenhum piloto com esse nome (pilotos an\xF4nimos n\xE3o t\xEAm perfil)."));
  if (a.id === x.account) self = true;
  const eph = self && !!a.anon;
  const r2 = await x.env.DB.prepare(
    `SELECT l.track, l.car, l.time, l.created,
       (SELECT COUNT(*) FROM community_laps o WHERE o.track_id=l.track_id AND o.car_id=l.car_id AND o.game=l.game AND COALESCE(o.shown,'')<>'model' AND o.time<l.time)+1 AS pos,
       (SELECT COUNT(*) FROM community_laps o WHERE o.track_id=l.track_id AND o.car_id=l.car_id AND o.game=l.game AND COALESCE(o.shown,'')<>'model') AS total
     FROM community_laps l WHERE l.user_id=?1 AND ${NOT_MODEL} ${eph ? "" : "AND l.anon=0"} ORDER BY l.created DESC LIMIT 60`
  ).bind(a.id).all();
  const laps = r2.results || [];
  const top = laps.slice().sort((p, q2) => p.pos - q2.pos || q2.total - p.total).slice(0, 6);
  let lics = {};
  try {
    lics = JSON.parse(a.lics || "{}") || {};
  } catch (e) {
  }
  const licLine = CATS.filter((c) => licOf(lics[c])).map((c) => `${CAT[x.l][c]} **${licOf(lics[c])}**`).join(" \xB7 ");
  const sup = a.supporter === 1 && (!a.supporter_hidden || self);
  const fields = [];
  if (licLine) fields.push({ name: tr(x.l, "Licences", "Licencias", "Licen\xE7as"), value: licLine });
  const dc = !a.anon ? await x.env.DB.prepare("SELECT discord_id FROM discord_links WHERE account_id=?1 AND shown=1").bind(a.id).first() : null;
  if (dc) fields.push({ name: "Discord", value: `<@${dc.discord_id}>` });
  fields.push({ name: tr(x.l, "On the leaderboards", "En las clasificaciones", "Nos leaderboards"), value: laps.length ? top.map((v) => `**P${v.pos}**/${v.total} \`${fmt(v.time)}\` ${md(fix(v.car))} \xB7 ${md(fix(v.track))}`).join("\n").slice(0, 1024) : tr(x.l, "No laps yet", "A\xFAn sin vueltas", "Ainda sem voltas") });
  const since = new Date(a.member_since || a.created).toISOString().slice(0, 10);
  return say({
    embeds: [{
      color: AMBER,
      title: (sup ? "\u2B50 " : "") + a.alias,
      fields,
      footer: { text: tr(x.l, `${laps.length} cars and tracks \xB7 member since ${since}`, `${laps.length} coches y circuitos \xB7 miembro desde ${since}`, `${laps.length} carros e pistas \xB7 membro desde ${since}`) }
    }]
  }, eph);
}
__name(driver, "driver");
async function linkStart(x) {
  if (x.account) {
    const a = await accountOf(x.env, x.account);
    return text(tr(x.l, `Your Discord is linked to **${md(a ? a.alias : "?")}**. Use /unlink to change it.`, `Tu Discord est\xE1 vinculado a **${md(a ? a.alias : "?")}**. Usa /unlink para cambiarlo.`, `O seu Discord est\xE1 vinculado a **${md(a ? a.alias : "?")}**. Use /unlink para mudar.`));
  }
  const ABC = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789", code = [...crypto.getRandomValues(new Uint8Array(8))].map((b) => ABC[b % 32]).join("");
  const now = Date.now();
  await x.env.DB.batch([
    x.env.DB.prepare("DELETE FROM discord_codes WHERE expires<?1 OR discord_id=?2").bind(now, x.user.id),
    x.env.DB.prepare("INSERT INTO discord_codes (code_hash, discord_id, discord_name, guild_id, expires, handle) VALUES (?1,?2,?3,?4,?5,?6)").bind(await sha256("discord:" + code), x.user.id, String(x.user.global_name || x.user.username || "").slice(0, 40), x.guild, now + 10 * 6e4, String(x.user.username || "").slice(0, 40) || null)
  ]);
  return say({
    content: tr(
      x.l,
      "Open this link where you are signed in to Pitlane HQ (the web app) and confirm. It works for 10 minutes and only once.",
      "Abre este enlace donde tengas abierta tu cuenta de Pitlane HQ (la app web) y confirma. Vale 10 minutos y una sola vez.",
      "Abra este link onde a sua conta do Pitlane HQ estiver aberta (o app web) e confirme. Vale por 10 minutos e uma \xFAnica vez."
    ),
    components: buttons(button(tr(x.l, "Link my account", "Vincular mi cuenta", "Vincular minha conta"), `${SITE3}/?discord=${code}`))
  }, true);
}
__name(linkStart, "linkStart");
async function unlink(x) {
  if (!x.account) return text(tr(x.l, "Your Discord is not linked to any Pitlane HQ account.", "Tu Discord no est\xE1 vinculado a ninguna cuenta de Pitlane HQ.", "O seu Discord n\xE3o est\xE1 vinculado a nenhuma conta do Pitlane HQ."));
  await x.env.DB.batch([
    x.env.DB.prepare("DELETE FROM discord_links WHERE discord_id=?1").bind(x.user.id),
    x.env.DB.prepare("DELETE FROM discord_members WHERE discord_id=?1").bind(x.user.id)
  ]);
  return text(tr(x.l, "Unlinked. Your laps stay in your account.", "Desvinculado. Tus vueltas siguen en tu cuenta.", "Desvinculado. As suas voltas continuam na sua conta."));
}
__name(unlink, "unlink");
async function download(x) {
  let apk = null;
  try {
    const o = x.env.DL && await x.env.DL.get("phones.json");
    apk = o ? (JSON.parse(await o.text()) || {}).apk : null;
  } catch (e) {
  }
  return say({
    content: tr(x.l, "Pitlane HQ is free: Pitlane HQ for Windows records your laps, the web and the phone apps show them.", "Pitlane HQ es gratis: Pitlane HQ para Windows graba tus vueltas, la web y las apps de m\xF3vil las muestran.", "O Pitlane HQ \xE9 gr\xE1tis: o Pitlane HQ para Windows grava as suas voltas, a web e os apps de celular as mostram."),
    components: buttons(
      button(tr(x.l, "Pitlane HQ for Windows", "Pitlane HQ para Windows", "Pitlane HQ para Windows"), `${SITE3}/dl/PitlaneHQ-Setup.exe`),
      apk && button("Android", `${SITE3}/dl/${encodeURIComponent(apk)}`),
      button(tr(x.l, "Web app", "App web", "App web"), SITE3 + "/"),
      button(tr(x.l, "All downloads", "Todas las descargas", "Todos os downloads"), SITE3 + "/downloads")
    )
  });
}
__name(download, "download");
function help(x) {
  const free = tr(
    x.l,
    "`/record` the record and top 10 of a car and track\n`/driver` a driver's profile, or yours\n`/link` \xB7 `/unlink` your Pitlane HQ account\n`/recent` your last sessions\n`/track` a track's records on every car\n`/download` the apps\n`/language` the bot's language",
    "`/record` el r\xE9cord y el top 10 de un coche y circuito\n`/driver` el perfil de un piloto, o el tuyo\n`/link` \xB7 `/unlink` tu cuenta de Pitlane HQ\n`/recent` tus \xFAltimas sesiones\n`/track` los r\xE9cords de un circuito en cada coche\n`/download` las apps\n`/language` el idioma del bot",
    "`/record` o recorde e o top 10 de um carro e pista\n`/driver` o perfil de um piloto, ou o seu\n`/link` \xB7 `/unlink` a sua conta do Pitlane HQ\n`/recent` as suas \xFAltimas sess\xF5es\n`/track` os recordes de uma pista em cada carro\n`/download` os apps\n`/language` o idioma do bot"
  );
  const pro = tr(
    x.l,
    "`/coach` your best lap against the next level and the record\n`/compare` your laps against another driver's\n`/board` this server's ranking on a car and track\n`/alerts` this server's new best laps and records, posted in a channel",
    "`/coach` tu mejor vuelta contra el siguiente nivel y el r\xE9cord\n`/compare` tus vueltas contra las de otro piloto\n`/board` el ranking de este servidor en un coche y circuito\n`/alerts` las mejores vueltas y r\xE9cords de este servidor, en un canal",
    "`/coach` a sua melhor volta contra o pr\xF3ximo n\xEDvel e o recorde\n`/compare` as suas voltas contra as de outro piloto\n`/board` o ranking deste servidor em um carro e pista\n`/alerts` as melhores voltas e recordes deste servidor, em um canal"
  );
  const open = license_plans_default.enforce ? "" : tr(x.l, "\n*Open to everyone for now.*", "\n*Abierto a todos por ahora.*", "\n*Aberto a todos por enquanto.*");
  return say({
    embeds: [{
      color: AMBER,
      title: "Pitlane HQ",
      url: SITE3,
      fields: [
        { name: tr(x.l, "Free", "Gratis", "Gr\xE1tis"), value: free },
        { name: "Pro", value: pro + open },
        {
          name: tr(x.l, "For the server's managers", "Para quien gestiona el servidor", "Para quem gerencia o servidor"),
          value: tr(
            x.l,
            "`/setup` the channels the bot answers in, the channels for best laps and records, and their language\n`/league` this server's league in the leagues hub",
            "`/setup` los canales donde responde el bot, los de mejores vueltas y r\xE9cords, y su idioma\n`/league` la liga de este servidor en el hub de ligas",
            "`/setup` os canais onde o bot responde, os das melhores voltas e recordes, e o idioma deles\n`/league` a liga deste servidor no hub de ligas"
          )
        }
      ],
      footer: { text: tr(x.l, "Your laps reach the bot once Pitlane HQ for Windows records them.", "Tus vueltas llegan al bot cuando Pitlane HQ para Windows las graba.", "As suas voltas chegam ao bot quando o Pitlane HQ para Windows as grava.") }
    }]
  }, true);
}
__name(help, "help");
async function language(x) {
  const v = String(x.opt.lang || "auto");
  if (LANGS.includes(v)) await x.env.DB.prepare("INSERT INTO discord_users (discord_id, lang, updated) VALUES (?1,?2,?3) ON CONFLICT(discord_id) DO UPDATE SET lang=excluded.lang, updated=excluded.updated").bind(x.user.id, v, Date.now()).run();
  else await x.env.DB.prepare("DELETE FROM discord_users WHERE discord_id=?1").bind(x.user.id).run();
  const l = LANGS.includes(v) ? v : langOf(x.it.locale);
  return text(LANGS.includes(v) ? tr(l, "Done: the bot answers you in English.", "Hecho: el bot te responde en espa\xF1ol.", "Pronto: o bot responde a voc\xEA em portugu\xEAs.") : tr(l, "Done: the bot answers you in your Discord app's language.", "Hecho: el bot te responde en el idioma de tu app de Discord.", "Pronto: o bot responde a voc\xEA no idioma do seu app do Discord."));
}
__name(language, "language");
var canManage = /* @__PURE__ */ __name((x) => {
  try {
    return !!(BigInt(x.it.member && x.it.member.permissions || "0") & MANAGE_GUILD);
  } catch (e) {
    return false;
  }
}, "canManage");
var LNAME = { en: "English", es: "Espa\xF1ol", pt: "Portugu\xEAs" };
async function guildCfg(env, guild) {
  const g = await env.DB.prepare("SELECT alerts_channel, records_channel, cmd_channels, lang FROM discord_guilds WHERE guild_id=?1").bind(guild).first();
  let cmd = [];
  try {
    cmd = JSON.parse(g && g.cmd_channels || "[]") || [];
  } catch (e) {
  }
  return { laps: g && g.alerts_channel || null, recs: g && g.records_channel || null, cmd, lang: g && g.lang || null };
}
__name(guildCfg, "guildCfg");
var saveGuild = /* @__PURE__ */ __name((env, guild, col, val) => env.DB.prepare(`INSERT INTO discord_guilds (guild_id, ${col}, updated) VALUES (?1,?2,?3) ON CONFLICT(guild_id) DO UPDATE SET ${col}=excluded.${col}, updated=excluded.updated`).bind(guild, val, Date.now()).run(), "saveGuild");
function panel(x, c, note2) {
  const L = c.lang || langOf(x.it.guild_locale || x.it.locale), off = tr(x.l, "off", "apagado", "desligado");
  const pick = /* @__PURE__ */ __name((id2, ph, max, vals) => ({ type: 1, components: [{ type: 8, custom_id: id2, placeholder: ph, min_values: 0, max_values: max, channel_types: [0, 5], default_values: vals.map((v) => ({ id: v, type: "channel" })) }] }), "pick");
  const lines = [
    "**" + tr(x.l, "Pitlane HQ in this server", "Pitlane HQ en este servidor", "Pitlane HQ neste servidor") + "**",
    tr(x.l, "Commands answer in: ", "Los comandos responden en: ", "Os comandos respondem em: ") + (c.cmd.length ? c.cmd.map((v) => `<#${v}>`).join(" ") : tr(x.l, "every channel", "todos los canales", "todos os canais")),
    tr(x.l, "New best laps: ", "Mejores vueltas: ", "Melhores voltas: ") + (c.laps ? `<#${c.laps}>` : off),
    tr(x.l, "New records: ", "R\xE9cords: ", "Recordes: ") + (c.recs ? `<#${c.recs}>` : c.laps ? `<#${c.laps}>` : off),
    tr(x.l, "Alerts' language: ", "Idioma de las alertas: ", "Idioma dos alertas: ") + LNAME[L]
  ];
  if (note2) lines.push("", note2);
  return {
    content: lines.join("\n"),
    components: [
      pick("cfg:cmd", tr(x.l, "Channels where the bot answers (none: all)", "Canales donde responde el bot (ninguno: todos)", "Canais onde o bot responde (nenhum: todos)"), 25, c.cmd),
      pick("cfg:laps", tr(x.l, "Channel for new best laps (none: off)", "Canal de mejores vueltas (ninguno: apagado)", "Canal das melhores voltas (nenhum: desligado)"), 1, c.laps ? [c.laps] : []),
      pick("cfg:recs", tr(x.l, "Channel for new records (none: the best laps' one)", "Canal de r\xE9cords (ninguno: el de mejores vueltas)", "Canal dos recordes (nenhum: o das melhores voltas)"), 1, c.recs ? [c.recs] : []),
      { type: 1, components: [{ type: 3, custom_id: "cfg:lang", placeholder: tr(x.l, "Alerts' language", "Idioma de las alertas", "Idioma dos alertas"), options: LANGS.map((v) => ({ label: LNAME[v], value: v, default: v === L })) }] }
    ]
  };
}
__name(panel, "panel");
var onlyManagers = /* @__PURE__ */ __name((x) => text(tr(x.l, "Only the people who manage this server can change this.", "Solo quien gestiona este servidor puede cambiar esto.", "S\xF3 quem gerencia este servidor pode mudar isto.")), "onlyManagers");
async function setup(x) {
  if (!x.guild) return text(tr(x.l, "This works inside a server.", "Esto funciona dentro de un servidor.", "Isto funciona dentro de um servidor."));
  if (!canManage(x)) return onlyManagers(x);
  return say(panel(x, await guildCfg(x.env, x.guild)), true);
}
__name(setup, "setup");
async function panelAction(x) {
  const id2 = String(x.it.data.custom_id || "");
  if (!id2.startsWith("cfg:")) return reply({ type: 6 });
  if (!x.guild || !canManage(x)) return onlyManagers(x);
  const kind = id2.slice(4), raw = (x.it.data.values || []).map(String), chans = raw.filter((v) => /^\d{5,25}$/.test(v));
  const upd = /* @__PURE__ */ __name(async (note2) => reply({ type: 7, data: answer(panel(x, await guildCfg(x.env, x.guild), note2)) }), "upd");
  if (kind === "lang") {
    if (LANGS.includes(raw[0])) await saveGuild(x.env, x.guild, "lang", raw[0]);
    return upd(tr(x.l, "Saved.", "Guardado.", "Salvo."));
  }
  if (kind === "cmd") {
    await saveGuild(x.env, x.guild, "cmd_channels", chans.length ? JSON.stringify(chans.slice(0, 25)) : null);
    return upd(tr(x.l, "Saved.", "Guardado.", "Salvo."));
  }
  if (kind !== "laps" && kind !== "recs") return reply({ type: 6 });
  const col = kind === "laps" ? "alerts_channel" : "records_channel", ch = chans[0] || null;
  if (!ch) {
    await saveGuild(x.env, x.guild, col, null);
    return upd(tr(x.l, "Saved.", "Guardado.", "Salvo."));
  }
  if (!x.account) return upd(tr(x.l, "Link your Pitlane HQ account first with /link to set the alerts.", "Vincula antes tu cuenta de Pitlane HQ con /link para configurar las alertas.", "Vincule antes a sua conta do Pitlane HQ com /link para configurar os alertas."));
  if (!await isPro(x.env, x.account)) return upd(tr(x.l, "The alerts are part of Pitlane HQ Pro.", "Las alertas son parte de Pitlane HQ Pro.", "Os alertas fazem parte do Pitlane HQ Pro."));
  if (!x.env.DISCORD_BOT_TOKEN) return upd(tr(x.l, "The bot cannot post yet (no bot token on the server).", "El bot a\xFAn no puede publicar (falta su token en el servidor).", "O bot ainda n\xE3o pode publicar (falta o token dele no servidor)."));
  return later(x, true, async () => {
    const c = await guildCfg(x.env, x.guild), gl = c.lang || langOf(x.it.guild_locale || x.it.locale);
    const hello = kind === "laps" ? tr(gl, "\u{1F3C1} Pitlane HQ: this server's new best laps will show up here.", "\u{1F3C1} Pitlane HQ: aqu\xED saldr\xE1n las nuevas mejores vueltas de este servidor.", "\u{1F3C1} Pitlane HQ: aqui v\xE3o aparecer as novas melhores voltas deste servidor.") : tr(gl, "\u{1F3C6} Pitlane HQ: the records this server's drivers set will show up here.", "\u{1F3C6} Pitlane HQ: aqu\xED saldr\xE1n los r\xE9cords que batan los pilotos de este servidor.", "\u{1F3C6} Pitlane HQ: aqui v\xE3o aparecer os recordes que os pilotos deste servidor baterem.");
    if (!await post(x.env, ch, { content: hello }))
      return panel(x, c, tr(x.l, `I cannot post in <#${ch}>: give the bot View channel, Send messages and Embed links there.`, `No puedo publicar en <#${ch}>: da al bot Ver canal, Enviar mensajes e Insertar enlaces all\xED.`, `N\xE3o consigo publicar em <#${ch}>: d\xEA ao bot Ver canal, Enviar mensagens e Inserir links l\xE1.`));
    await x.env.DB.batch([
      x.env.DB.prepare(`INSERT INTO discord_guilds (guild_id, ${col}, set_by, lang, updated) VALUES (?1,?2,?3,?4,?5) ON CONFLICT(guild_id) DO UPDATE SET ${col}=excluded.${col}, set_by=excluded.set_by, lang=COALESCE(discord_guilds.lang, excluded.lang), updated=excluded.updated`).bind(x.guild, ch, x.account, gl, Date.now())
    ]);
    return panel(x, await guildCfg(x.env, x.guild), tr(x.l, "Saved.", "Guardado.", "Salvo."));
  }, true);
}
__name(panelAction, "panelAction");
async function coach(x) {
  if (!x.account) return needLink(x);
  const k = await comboOf(x.env, x.opt.car_track);
  if (!k) return noCombo(x);
  const mine = await x.env.DB.prepare("SELECT time FROM community_laps WHERE user_id=?1 AND track_id=?2 AND car_id=?3 AND game='iracing'").bind(x.account, k.t, k.c).first();
  if (!mine) return text(tr(x.l, "You have no lap on this car and track yet (test drives do not count).", "A\xFAn no tienes vuelta en este coche y circuito (las pruebas libres no cuentan).", "Voc\xEA ainda n\xE3o tem volta neste carro e pista (test drives n\xE3o contam)."));
  return later(x, true, async () => {
    const m = await getModel(x.env, "iracing", k.t, k.c);
    let times = (m.times || []).slice();
    if (!times.length) times = ((await x.env.DB.prepare("SELECT time FROM community_laps WHERE track_id=?1 AND car_id=?2 AND game='iracing' AND COALESCE(shown,'')<>'model' AND time>10 AND COALESCE(official,1)<>0").bind(k.t, k.c).all()).results || []).map((v) => v.time);
    const me2 = mine.time;
    if (!times.some((t) => Math.abs(t - me2) < 5e-4)) times.push(me2);
    times.sort((a, b) => a - b);
    const pos = times.filter((t) => t < me2 - 5e-4).length + 1;
    const rec = Math.min(m.fastest || Infinity, times[0]);
    const lv = (m.ladder || []).find((e) => me2 <= e.upTo + 5e-4) || (m.ladder || []).slice(-1)[0];
    const ahead = times.filter((t) => t < me2 - 5e-4).pop() || null;
    const next = lv && lv.time < me2 - 5e-4 ? lv.time : ahead;
    const fields = [
      { name: tr(x.l, "Your best", "Tu mejor vuelta", "Sua melhor volta"), value: `\`${fmt(me2)}\` \xB7 **P${pos}** ${tr(x.l, "of", "de", "de")} ${times.length}`, inline: true },
      { name: tr(x.l, "Next level", "Siguiente nivel", "Pr\xF3ximo n\xEDvel"), value: next ? `\`${fmt(next)}\` \`${gap(next - me2)}\`` : tr(x.l, "You are the fastest known here", "Eres el m\xE1s r\xE1pido conocido aqu\xED", "Voc\xEA \xE9 o mais r\xE1pido conhecido aqui"), inline: true },
      { name: tr(x.l, "Record", "R\xE9cord", "Recorde"), value: rec < me2 - 5e-4 ? `\`${fmt(rec)}\` \`${gap(rec - me2)}\`` : tr(x.l, "Yours", "El tuyo", "O seu"), inline: true }
    ];
    return {
      embeds: [{
        color: AMBER,
        title: `${fix(k.car)} \xB7 ${fix(k.track)}`.slice(0, 250),
        fields,
        description: tr(x.l, "Where you lose the time, corner by corner: the coach in the app.", "D\xF3nde pierdes el tiempo, curva a curva: el coach en la app.", "Onde voc\xEA perde tempo, curva a curva: o coach no app.")
      }],
      components: buttons(button(tr(x.l, "Open the coach", "Abrir el coach", "Abrir o coach"), SITE3 + "/"))
    };
  });
}
__name(coach, "coach");
async function compare(x) {
  if (!x.account) return needLink(x);
  const b = await driverOf(x.env, x.opt.name);
  if (!b) return text(tr(x.l, "No driver by that name (anonymous drivers have no profile).", "No hay ning\xFAn piloto con ese nombre (los pilotos an\xF3nimos no tienen perfil).", "N\xE3o h\xE1 nenhum piloto com esse nome (pilotos an\xF4nimos n\xE3o t\xEAm perfil)."));
  if (b.id === x.account) return text(tr(x.l, "That is you.", "Ese eres t\xFA.", "Esse \xE9 voc\xEA."));
  const r2 = await x.env.DB.prepare(
    `SELECT a.track, a.car, a.time AS mine, b.time AS theirs, MAX(a.created, b.created) AS at
       FROM community_laps a JOIN community_laps b ON b.track_id=a.track_id AND b.car_id=a.car_id AND b.game=a.game
      WHERE a.user_id=?1 AND b.user_id=?2 AND b.anon=0 AND COALESCE(a.shown,'')<>'model' AND COALESCE(b.shown,'')<>'model'
      ORDER BY at DESC LIMIT 300`
  ).bind(x.account, b.id).all();
  const rows = r2.results || [];
  const eph = await isAnon(x.env, x.account);
  if (!rows.length) return text(tr(x.l, `You and **${md(b.alias)}** have no car and track in common yet.`, `T\xFA y **${md(b.alias)}** a\xFAn no ten\xE9is ning\xFAn coche y circuito en com\xFAn.`, `Voc\xEA e **${md(b.alias)}** ainda n\xE3o t\xEAm nenhum carro e pista em comum.`), eph);
  const won = rows.filter((v) => v.mine < v.theirs).length;
  const lines = rows.slice(0, 12).map((v) => `${v.mine < v.theirs ? "\u{1F7E2}" : v.mine > v.theirs ? "\u{1F534}" : "\u26AA"} \`${gap(v.mine - v.theirs)}\` ${md(fix(v.car))} \xB7 ${md(fix(v.track))}`);
  return say({
    embeds: [{
      color: AMBER,
      title: tr(x.l, `You against ${b.alias}`, `T\xFA contra ${b.alias}`, `Voc\xEA contra ${b.alias}`).slice(0, 250),
      description: tr(x.l, `Faster on **${won}** of **${rows.length}** cars and tracks.`, `M\xE1s r\xE1pido en **${won}** de **${rows.length}** coches y circuitos.`, `Mais r\xE1pido em **${won}** de **${rows.length}** carros e pistas.`) + "\n\n" + lines.join("\n"),
      footer: { text: tr(x.l, "Your gap on each one's fastest lap \xB7 most recent first", "Tu diferencia en la vuelta m\xE1s r\xE1pida de cada uno \xB7 las m\xE1s recientes primero", "A sua diferen\xE7a na volta mais r\xE1pida de cada um \xB7 as mais recentes primeiro") }
    }]
  }, eph);
}
__name(compare, "compare");
async function board(x) {
  if (!x.guild) return text(tr(x.l, "This works inside a server.", "Esto funciona dentro de un servidor.", "Isto funciona dentro de um servidor."));
  const k = await comboOf(x.env, x.opt.car_track);
  if (!k) return noCombo(x);
  const r2 = await x.env.DB.prepare(
    `SELECT dl.discord_id AS did, u.alias, l.time,
       (SELECT COUNT(*) FROM community_laps o WHERE o.track_id=l.track_id AND o.car_id=l.car_id AND o.game=l.game AND COALESCE(o.shown,'')<>'model' AND o.time<l.time)+1 AS pos
       FROM discord_members m JOIN discord_links dl ON dl.discord_id=m.discord_id JOIN community_laps l ON l.user_id=dl.account_id
       JOIN community_users u ON u.id=l.user_id JOIN accounts ac ON ac.id=l.user_id
      WHERE m.guild_id=?1 AND l.track_id=?2 AND l.car_id=?3 AND l.game='iracing' AND l.anon=0 AND ac.anon=0 AND ${NOT_MODEL}
      ORDER BY l.time LIMIT 20`
  ).bind(x.guild, k.t, k.c).all();
  const rows = r2.results || [];
  if (!rows.length) return text(tr(
    x.l,
    "Nobody in this server has a lap there yet. Drivers show up once they link their account (/link) and use the bot here.",
    "Nadie de este servidor tiene vuelta ah\xED todav\xEDa. Los pilotos aparecen cuando vinculan su cuenta (/link) y usan el bot aqu\xED.",
    "Ningu\xE9m deste servidor tem volta a\xED ainda. Os pilotos aparecem quando vinculam a conta (/link) e usam o bot aqui."
  ), false);
  const lines = rows.map((v, i) => `\`${String(i + 1).padStart(2)}\` \`${fmt(v.time)}\` ${i ? `\`${gap(v.time - rows[0].time)}\` ` : ""}<@${v.did}> ${md(v.alias)} \xB7 P${v.pos} ${tr(x.l, "overall", "general", "geral")}`);
  return say({
    embeds: [{ color: AMBER, title: `${fix(k.car)}`.slice(0, 250), url: recUrl(x.l, k), description: `**${md(fix(k.track))}** \xB7 ${tr(x.l, "this server", "este servidor", "este servidor")}

` + lines.join("\n") }]
  });
}
__name(board, "board");
async function alerts(x) {
  if (!x.guild) return text(tr(x.l, "This works inside a server.", "Esto funciona dentro de un servidor.", "Isto funciona dentro de um servidor."));
  if (!canManage(x)) return text(tr(x.l, "Only the people who manage this server can set the alerts.", "Solo quien gestiona este servidor puede configurar las alertas.", "S\xF3 quem gerencia este servidor pode configurar os alertas."));
  if (!x.account) return needLink(x);
  const ch = x.opt.channel, now = Date.now(), gl = LANGS.includes(x.opt.language) ? x.opt.language : langOf(x.it.guild_locale || x.it.locale);
  if (!ch) {
    await x.env.DB.prepare("UPDATE discord_guilds SET alerts_channel=NULL, records_channel=NULL, updated=?2 WHERE guild_id=?1").bind(x.guild, now).run();
    return text(tr(x.l, "Alerts off.", "Alertas apagadas.", "Alertas desligados."));
  }
  if (!x.env.DISCORD_BOT_TOKEN) return text(tr(x.l, "The bot cannot post yet (no bot token on the server).", "El bot a\xFAn no puede publicar (falta su token en el servidor).", "O bot ainda n\xE3o pode publicar (falta o token dele no servidor)."));
  return later(x, true, async () => {
    const ok = await post(x.env, ch, { content: tr(gl, "\u{1F3C1} Pitlane HQ alerts: this server's new best laps and records will show up here.", "\u{1F3C1} Alertas de Pitlane HQ: aqu\xED saldr\xE1n las mejores vueltas y los r\xE9cords de este servidor.", "\u{1F3C1} Alertas do Pitlane HQ: aqui v\xE3o aparecer as melhores voltas e os recordes deste servidor.") });
    if (!ok) return { content: tr(x.l, `I cannot post in <#${ch}>: give the bot View channel, Send messages and Embed links there.`, `No puedo publicar en <#${ch}>: da al bot Ver canal, Enviar mensajes e Insertar enlaces all\xED.`, `N\xE3o consigo publicar em <#${ch}>: d\xEA ao bot Ver canal, Enviar mensagens e Inserir links l\xE1.`) };
    await x.env.DB.prepare("INSERT INTO discord_guilds (guild_id, alerts_channel, set_by, lang, updated) VALUES (?1,?2,?3,?4,?5) ON CONFLICT(guild_id) DO UPDATE SET alerts_channel=excluded.alerts_channel, records_channel=NULL, set_by=excluded.set_by, lang=excluded.lang, updated=excluded.updated").bind(x.guild, ch, x.account, gl, now).run();
    return { content: tr(x.l, `Alerts on in <#${ch}>. They cover the drivers who linked their account and used the bot in this server.`, `Alertas activadas en <#${ch}>. Cubren a los pilotos que vincularon su cuenta y usaron el bot en este servidor.`, `Alertas ativados em <#${ch}>. Cobrem os pilotos que vincularam a conta e usaram o bot neste servidor.`) };
  });
}
__name(alerts, "alerts");
var KIND = /* @__PURE__ */ __name((l, k) => {
  const s = String(k || "").toLowerCase();
  return /race/.test(s) ? tr(l, "Race", "Carrera", "Corrida") : /qual/.test(s) ? tr(l, "Qualifying", "Clasificaci\xF3n", "Classifica\xE7\xE3o") : tr(l, "Practice", "Pr\xE1ctica", "Treino");
}, "KIND");
async function recent(x) {
  if (!x.account) return needLink(x);
  const r2 = await x.env.DB.prepare("SELECT started, track, car, kind, laps, best, pos, field, game FROM sessions WHERE uploader=?1 ORDER BY started DESC LIMIT 8").bind("acct:" + x.account).all();
  const rows = r2.results || [];
  if (!rows.length) return text(tr(x.l, "No sessions on your account yet.", "A\xFAn no hay sesiones en tu cuenta.", "Ainda n\xE3o h\xE1 sess\xF5es na sua conta."));
  const lines = rows.map((v) => `<t:${Math.floor(v.started / 1e3)}:d> **${md(fix(v.track))}** \xB7 ${md(fix(v.car))}
${KIND(x.l, v.kind)}${v.pos ? ` **P${v.pos}**${v.field ? "/" + v.field : ""}` : ""} \xB7 ${v.laps || 0} ${tr(x.l, "laps", "vueltas", "voltas")}${v.best > 0 ? ` \xB7 \`${fmt(v.best)}\`` : ""}${v.game === "lmu" ? " \xB7 LMU" : ""}`);
  return say({
    embeds: [{ color: AMBER, title: tr(x.l, "Your last sessions", "Tus \xFAltimas sesiones", "As suas \xFAltimas sess\xF5es"), description: lines.join("\n\n").slice(0, 4e3) }],
    components: buttons(button(tr(x.l, "Open Pitlane HQ", "Abrir Pitlane HQ", "Abrir o Pitlane HQ"), SITE3 + "/"))
  }, true);
}
__name(recent, "recent");
async function tracks(env, q2, n) {
  const words = String(q2 || "").toLowerCase().split(/\s+/).map((w) => w.replace(/[^\p{L}\p{N}]/gu, "")).filter(Boolean).slice(0, 5);
  const squash = "replace(replace(replace(lower(l.track),' ',''),'-',''),'.','')";
  const where = words.map((_, i) => `AND ${squash} LIKE ?${i + 2}`).join(" ");
  const r2 = await env.DB.prepare(`SELECT l.track_id AS t, MAX(l.track) AS track, COUNT(DISTINCT l.user_id) AS drivers FROM community_laps l
    WHERE l.game='iracing' AND l.track_id>0 AND ${NOT_MODEL} ${where} GROUP BY l.track_id ORDER BY drivers DESC LIMIT ?1`).bind(n, ...words.map((w) => "%" + w + "%")).all();
  return r2.results || [];
}
__name(tracks, "tracks");
async function track(x) {
  const v = String(x.opt.track || "");
  const t = /^\d+$/.test(v) ? { t: +v } : (await tracks(x.env, v, 1))[0];
  if (!t) return text(tr(x.l, "No laps on that track yet. Pick one from the list as you type.", "A\xFAn no hay vueltas en ese circuito. Elige uno de la lista mientras escribes.", "Ainda n\xE3o h\xE1 voltas nessa pista. Escolha uma da lista enquanto digita."));
  const r2 = await x.env.DB.prepare(`SELECT l.car_id AS c, MAX(l.car) AS car, MAX(l.track) AS track, MIN(l.time) AS best, COUNT(DISTINCT l.user_id) AS drivers FROM community_laps l
    WHERE l.track_id=?1 AND l.game='iracing' AND ${NOT_MODEL} GROUP BY l.car_id ORDER BY drivers DESC LIMIT 10`).bind(t.t).all();
  const cars = r2.results || [];
  if (!cars.length) return text(tr(x.l, "No laps on that track yet.", "A\xFAn no hay vueltas en ese circuito.", "Ainda n\xE3o h\xE1 voltas nessa pista."));
  const name2 = fix(cars[0].track);
  const lines = cars.map((c) => `\`${fmt(c.best)}\` ${md(famName("iracing", c.c, fix(c.car)))} \xB7 ${c.drivers} ${tr(x.l, "drivers", "pilotos", "pilotos")}`);
  if (x.account && !await isAnon(x.env, x.account)) {
    const mine = (await x.env.DB.prepare(`SELECT l.car, l.car_id AS c, l.time, (SELECT COUNT(*) FROM community_laps o WHERE o.track_id=l.track_id AND o.car_id=l.car_id AND o.game=l.game AND COALESCE(o.shown,'')<>'model' AND o.time<l.time)+1 AS pos
      FROM community_laps l WHERE l.user_id=?1 AND l.track_id=?2 AND l.game='iracing' AND l.anon=0 AND ${NOT_MODEL} ORDER BY pos LIMIT 3`).bind(x.account, t.t).all()).results || [];
    if (mine.length) lines.push("", tr(x.l, "**You**", "**T\xFA**", "**Voc\xEA**"), ...mine.map((m) => `**P${m.pos}** \`${fmt(m.time)}\` ${md(famName("iracing", m.c, fix(m.car)))}`));
  }
  return say({ embeds: [{
    color: AMBER,
    title: name2.slice(0, 250),
    description: lines.join("\n").slice(0, 4e3),
    footer: { text: tr(x.l, "The record on each car \xB7 the most driven cars first \xB7 Pitlane HQ", "El r\xE9cord en cada coche \xB7 primero los coches m\xE1s usados \xB7 Pitlane HQ", "O recorde em cada carro \xB7 primeiro os carros mais usados \xB7 Pitlane HQ") }
  }] });
}
__name(track, "track");
async function inviteGuild(env, url) {
  const m = /(?:discord\.gg|discord(?:app)?\.com\/invite)\/([A-Za-z0-9-]+)/.exec(String(url || ""));
  if (!m) return null;
  const r2 = await fetch(`${API}/invites/${m[1]}`, env.DISCORD_BOT_TOKEN ? { headers: { authorization: "Bot " + env.DISCORD_BOT_TOKEN } } : {}).catch(() => null);
  const j = r2 && r2.ok ? await r2.json().catch(() => null) : null;
  return j && j.guild && j.guild.id || null;
}
__name(inviteGuild, "inviteGuild");
async function league(x) {
  if (!x.guild) return text(tr(x.l, "This works inside a server.", "Esto funciona dentro de un servidor.", "Isto funciona dentro de um servidor."));
  if (!canManage(x)) return text(tr(x.l, "Only the people who manage this server can link its league.", "Solo quien gestiona este servidor puede vincular su liga.", "S\xF3 quem gerencia este servidor pode vincular a liga."));
  const now = Date.now(), id2 = String(x.opt.league || "");
  if (!id2) {
    await x.env.DB.prepare("UPDATE discord_guilds SET league_id=NULL, updated=?2 WHERE guild_id=?1").bind(x.guild, now).run();
    return text(tr(x.l, "This server is not linked to a league any more.", "Este servidor ya no est\xE1 vinculado a ninguna liga.", "Este servidor n\xE3o est\xE1 mais vinculado a nenhuma liga."));
  }
  const lg = await x.env.DB.prepare("SELECT id, name, discord FROM leagues WHERE id=?1").bind(id2).first();
  if (!lg) return text(tr(x.l, "Pick the league from the list as you type.", "Elige la liga de la lista mientras escribes.", "Escolha a liga da lista enquanto digita."));
  return later(x, true, async () => {
    if (await inviteGuild(x.env, lg.discord) !== x.guild)
      return { content: tr(x.l, `The invite of **${md(fix(lg.name))}** in the leagues hub does not lead to this server. Its creator can change it on pitlanehq.app.`, `La invitaci\xF3n de **${md(fix(lg.name))}** en el hub de ligas no lleva a este servidor. Quien la cre\xF3 puede cambiarla en pitlanehq.app.`, `O convite de **${md(fix(lg.name))}** no hub de ligas n\xE3o leva a este servidor. Quem a criou pode mud\xE1-lo em pitlanehq.app.`) };
    await x.env.DB.prepare("INSERT INTO discord_guilds (guild_id, league_id, set_by, updated) VALUES (?1,?2,?3,?4) ON CONFLICT(guild_id) DO UPDATE SET league_id=excluded.league_id, updated=excluded.updated").bind(x.guild, lg.id, x.account, now).run();
    return { content: tr(x.l, `This server is now **${md(fix(lg.name))}** in the leagues hub. With /alerts on, the week's best laps post there on Monday.`, `Este servidor es ahora **${md(fix(lg.name))}** en el hub de ligas. Con /alerts activado, las mejores vueltas de la semana se publican all\xED el lunes.`, `Este servidor agora \xE9 **${md(fix(lg.name))}** no hub de ligas. Com /alerts ligado, as melhores voltas da semana s\xE3o publicadas l\xE1 na segunda-feira.`) };
  });
}
__name(league, "league");
async function discordWeekly(env, now = Date.now()) {
  if (!env.DISCORD_BOT_TOKEN) return 0;
  const gs = (await env.DB.prepare(`SELECT g.guild_id, g.alerts_channel, g.set_by, g.lang, lg.name AS league FROM discord_guilds g LEFT JOIN leagues lg ON lg.id=g.league_id
    WHERE g.alerts_channel IS NOT NULL AND (g.week_at IS NULL OR g.week_at<?1) LIMIT 20`).bind(now - 5 * 864e5).all()).results || [];
  let n = 0;
  for (const g of gs) {
    await env.DB.prepare("UPDATE discord_guilds SET week_at=?2 WHERE guild_id=?1").bind(g.guild_id, now).run();
    if (!await isPro(env, g.set_by)) continue;
    const rows = (await env.DB.prepare(`SELECT dl.discord_id AS did, u.alias, l.track, l.car, l.car_id AS c, l.time,
        (SELECT COUNT(*) FROM community_laps o WHERE o.track_id=l.track_id AND o.car_id=l.car_id AND o.game=l.game AND COALESCE(o.shown,'')<>'model' AND o.time<l.time)+1 AS pos
        FROM discord_members m JOIN discord_links dl ON dl.discord_id=m.discord_id JOIN community_laps l ON l.user_id=dl.account_id
        JOIN community_users u ON u.id=l.user_id JOIN accounts ac ON ac.id=l.user_id
       WHERE m.guild_id=?1 AND l.created>=?2 AND l.game='iracing' AND l.anon=0 AND ac.anon=0 AND ${NOT_MODEL} ORDER BY pos, l.time LIMIT 10`).bind(g.guild_id, now - 7 * 864e5).all()).results || [];
    if (!rows.length) continue;
    const l = ["es", "pt"].includes(g.lang) ? g.lang : "en";
    const lines = rows.map((v) => `**P${v.pos}** \`${fmt(v.time)}\` <@${v.did}> ${md(v.alias)}
${md(famName("iracing", v.c, fix(v.car)))} \xB7 ${md(fix(v.track))}`);
    if (await post(env, g.alerts_channel, { embeds: [{
      color: AMBER,
      title: tr(l, "\u{1F5D3}\uFE0F The week's best laps", "\u{1F5D3}\uFE0F Las mejores vueltas de la semana", "\u{1F5D3}\uFE0F As melhores voltas da semana") + (g.league ? " \xB7 " + fix(g.league) : ""),
      description: lines.join("\n\n").slice(0, 4e3),
      footer: { text: tr(l, "Each driver's best of the week and their place on the leaderboard \xB7 Pitlane HQ", "La mejor de cada piloto en la semana y su puesto en la leaderboard \xB7 Pitlane HQ", "A melhor de cada piloto na semana e a posi\xE7\xE3o na classifica\xE7\xE3o \xB7 Pitlane HQ") }
    }] })) n++;
  }
  return n;
}
__name(discordWeekly, "discordWeekly");
async function post(env, channel, msg) {
  const r2 = await fetch(`${API}/channels/${channel}/messages`, {
    method: "POST",
    headers: { authorization: "Bot " + env.DISCORD_BOT_TOKEN, "content-type": "application/json" },
    body: JSON.stringify({ allowed_mentions: { parse: [] }, ...msg })
  }).catch(() => null);
  return !!(r2 && r2.ok);
}
__name(post, "post");
async function discordLapAlert(env, accountId, lap) {
  if (!env.DISCORD_BOT_TOKEN || !lap || !lap.improved || lap.game !== "iracing") return;
  const a = await env.DB.prepare("SELECT a.anon, u.alias, dl.discord_id FROM accounts a JOIN community_users u ON u.id=a.id JOIN discord_links dl ON dl.account_id=a.id WHERE a.id=?1").bind(accountId).first();
  if (!a || a.anon || lap.anon) return;
  const gs = (await env.DB.prepare("SELECT g.guild_id, g.alerts_channel, g.records_channel, g.set_by, g.lang FROM discord_members m JOIN discord_guilds g ON g.guild_id=m.guild_id WHERE m.discord_id=?1 AND (g.alerts_channel IS NOT NULL OR g.records_channel IS NOT NULL)").bind(a.discord_id).all()).results || [];
  if (!gs.length) return;
  const st = await env.DB.prepare(
    `SELECT (SELECT COUNT(*) FROM community_laps l WHERE l.track_id=?1 AND l.car_id=?2 AND l.game='iracing' AND ${NOT_MODEL} AND l.time<?3)+1 AS pos,
            (SELECT COUNT(*) FROM community_laps l WHERE l.track_id=?1 AND l.car_id=?2 AND l.game='iracing' AND ${NOT_MODEL}) AS total`
  ).bind(lap.trackId, lap.carId, lap.time).first();
  const k = { t: lap.trackId, c: lap.carId, track: lap.track, car: lap.car };
  for (const g of gs) {
    const rec = st.pos === 1 && st.total > 1, channel = rec ? g.records_channel || g.alerts_channel : g.alerts_channel;
    if (!channel || !await isPro(env, g.set_by)) continue;
    const l = ["es", "pt"].includes(g.lang) ? g.lang : "en";
    const fields = [
      { name: tr(l, "Time", "Tiempo", "Tempo"), value: `\`${fmt(lap.time)}\`` + (lap.prev ? ` \`${gap(lap.time - lap.prev)}\`` : ""), inline: true },
      { name: tr(l, "Position", "Posici\xF3n", "Posi\xE7\xE3o"), value: `**P${st.pos}** ${tr(l, "of", "de", "de")} ${st.total}`, inline: true }
    ];
    await post(env, channel, {
      embeds: [{
        color: rec ? PURPLE : AMBER,
        url: recUrl(l, k),
        title: rec ? tr(l, "\u{1F3C6} New record", "\u{1F3C6} Nuevo r\xE9cord", "\u{1F3C6} Novo recorde") : tr(l, "\u23F1\uFE0F New best lap", "\u23F1\uFE0F Nueva mejor vuelta", "\u23F1\uFE0F Nova melhor volta"),
        description: `<@${a.discord_id}> **${md(a.alias)}**
${md(fix(lap.car))} \xB7 ${md(fix(lap.track))}`,
        fields
      }]
    });
  }
}
__name(discordLapAlert, "discordLapAlert");
async function linkPair(env, discordId, accountId, handle2, guildId, login) {
  const was = await env.DB.prepare("SELECT shown, login FROM discord_links WHERE discord_id=?1 AND account_id=?2").bind(discordId, accountId).first();
  const now = Date.now();
  await env.DB.batch([
    env.DB.prepare("DELETE FROM discord_links WHERE discord_id=?1 OR account_id=?2").bind(discordId, accountId),
    env.DB.prepare("INSERT INTO discord_links (discord_id, account_id, created, handle, shown, login) VALUES (?1,?2,?3,?4,?5,?6)").bind(discordId, accountId, now, handle2 || null, was && was.shown ? 1 : 0, login || was && was.login ? 1 : 0),
    ...guildId ? [env.DB.prepare("INSERT OR REPLACE INTO discord_members (guild_id, discord_id, seen) VALUES (?1,?2,?3)").bind(guildId, discordId, now)] : []
  ]);
}
__name(linkPair, "linkPair");
var JSONH3 = { "content-type": "application/json; charset=utf-8", "cache-control": "no-store", "access-control-allow-origin": "*" };
var json5 = /* @__PURE__ */ __name((v, status = 200) => new Response(JSON.stringify(v), { status, headers: JSONH3 }), "json");
var hexOf = /* @__PURE__ */ __name((b) => [...new Uint8Array(b)].map((x) => x.toString(16).padStart(2, "0")).join(""), "hexOf");
var rid2 = /* @__PURE__ */ __name(() => hexOf(crypto.getRandomValues(new Uint8Array(24))), "rid");
var isHex482 = /* @__PURE__ */ __name((v) => typeof v === "string" && /^[0-9a-f]{48}$/.test(v), "isHex48");
var portOf2 = /* @__PURE__ */ __name((v) => Number.isInteger(Number(v)) && Number(v) > 0 && Number(v) < 65536 ? Number(v) : null, "portOf");
var clean32 = /* @__PURE__ */ __name((a) => (typeof a === "string" ? a : "").slice(0, 32).replace(/[\u0000-\u001f<>]/g, "").trim(), "clean32");
var siteOf = /* @__PURE__ */ __name((env, url) => env.LOCAL === "1" && url ? url.origin : SITE3, "siteOf");
var oauthBack = /* @__PURE__ */ __name((env, url) => siteOf(env, url) + "/discord/oauth", "oauthBack");
var oauthReady = /* @__PURE__ */ __name((env) => !!(env.DISCORD_APP_ID && env.DISCORD_CLIENT_SECRET), "oauthReady");
var NOT_READY = "Discord sign-in is not set up on this server yet";
var AGAIN = "this Discord sign-in is not valid any more, sign in with Discord again";
async function discordStart(env, url, kind, accountId, device, port, app) {
  if (portOf2(port) && appOf(app)) return { error: "port or app, not both" };
  const state = rid2(), code = rid2(), now = Date.now();
  await env.DB.batch([
    env.DB.prepare("DELETE FROM discord_oauth WHERE expires<?1 OR (account_id IS NOT NULL AND account_id=?2)").bind(now, accountId || ""),
    env.DB.prepare("INSERT INTO discord_oauth (state_hash, code_hash, account_id, device, kind, port, app, expires) VALUES (?1,?2,?3,?4,?5,?6,?7,?8)").bind(await sha256("discord-oauth:" + state), await sha256("discord-code:" + code), accountId || null, clean32(device) || null, kind, portOf2(port), appOf(app) ? 1 : 0, now + 10 * 6e4)
  ]);
  const q2 = new URLSearchParams({ client_id: env.DISCORD_APP_ID, response_type: "code", scope: "identify", redirect_uri: oauthBack(env, url), state });
  if (kind === "login") q2.set("prompt", "none");
  return { url: "https://discord.com/oauth2/authorize?" + q2, state, code };
}
__name(discordStart, "discordStart");
async function newGrant2(env, kind, st, me2, ttl) {
  const g = rid2();
  await env.DB.batch([
    env.DB.prepare("DELETE FROM discord_grants WHERE expires<?1").bind(Date.now()),
    env.DB.prepare("INSERT INTO discord_grants (grant_hash, code_hash, account_id, discord_id, handle, name, device, kind, expires) VALUES (?1,?2,?3,?4,?5,?6,?7,?8,?9)").bind(await sha256("discord-grant:" + g), st.code_hash, st.account_id || null, me2.id, me2.handle || null, me2.name || null, st.device, kind, Date.now() + ttl)
  ]);
  return g;
}
__name(newGrant2, "newGrant");
async function useDiscordGrant(env, g, kind, code) {
  if (!isHex482(g) || !isHex482(code)) return null;
  const r2 = await env.DB.prepare("DELETE FROM discord_grants WHERE grant_hash=?1 AND kind=?2 RETURNING code_hash, account_id, discord_id, handle, name, device, expires").bind(await sha256("discord-grant:" + g), kind).first();
  return r2 && r2.expires >= Date.now() && r2.code_hash === await sha256("discord-code:" + code) ? r2 : null;
}
__name(useDiscordGrant, "useDiscordGrant");
var discordAccountId = /* @__PURE__ */ __name(async (env, discordId) => (await env.DB.prepare("SELECT account_id FROM discord_links WHERE discord_id=?1 AND login=1").bind(discordId).first() || {}).account_id || null, "discordAccountId");
var discordLinkedAny = /* @__PURE__ */ __name(async (env, discordId) => !!await env.DB.prepare("SELECT 1 FROM discord_links WHERE discord_id=?1").bind(discordId).first(), "discordLinkedAny");
async function linkDiscordLogin(env, g, accountId) {
  const other = await env.DB.prepare("SELECT account_id FROM discord_links WHERE discord_id=?1").bind(g.discord_id).first();
  if (other && other.account_id !== accountId) return "taken";
  await linkPair(env, g.discord_id, accountId, g.handle, null, true);
  return "ok";
}
__name(linkDiscordLogin, "linkDiscordLogin");
function discordUser(me2) {
  if (!me2 || !/^\d{5,25}$/.test(String(me2.id || ""))) return null;
  const handle2 = String(me2.username || "").replace(/[^A-Za-z0-9_.]/g, "").slice(0, 40);
  return { id: String(me2.id), handle: handle2, name: clean32(me2.global_name) || clean32(handle2) };
}
__name(discordUser, "discordUser");
async function discordOAuth(req, env, url) {
  const base2 = siteOf(env, url);
  const state = url.searchParams.get("state") || "", code = url.searchParams.get("code") || "";
  if (!isHex482(state)) return Response.redirect(base2 + "/?discordLogin=0", 302);
  const st = await env.DB.prepare("DELETE FROM discord_oauth WHERE state_hash=?1 RETURNING code_hash, account_id, device, kind, port, app, expires").bind(await sha256("discord-oauth:" + state)).first();
  const back = /* @__PURE__ */ __name((q2) => goOn(base2, "discord", st && st.kind !== "legacy" ? st : null, state, q2), "back");
  const fail2 = /* @__PURE__ */ __name(() => back(st && st.kind !== "login" ? "discordLinked=0" : "discordLogin=0"), "fail");
  if (!st || st.expires < Date.now() || !code || !oauthReady(env)) return fail2();
  try {
    return await discordAnswer(env, url, st, code, back, fail2);
  } catch (e) {
    return fail2();
  }
}
__name(discordOAuth, "discordOAuth");
async function discordAnswer(env, url, st, code, back, fail2) {
  let me2 = null;
  try {
    const t = await fetch(API + "/oauth2/token", {
      method: "POST",
      headers: { "content-type": "application/x-www-form-urlencoded" },
      body: new URLSearchParams({ client_id: env.DISCORD_APP_ID, client_secret: env.DISCORD_CLIENT_SECRET, grant_type: "authorization_code", code, redirect_uri: oauthBack(env, url) })
    });
    const tok = t.ok ? await t.json() : null;
    if (!tok || !tok.access_token) return fail2();
    const u = await fetch(API + "/users/@me", { headers: { authorization: "Bearer " + tok.access_token } });
    me2 = discordUser(u.ok ? await u.json() : null);
  } catch (e) {
    return fail2();
  }
  if (!me2) return fail2();
  if (st.kind === "legacy") {
    if (!st.account_id) return fail2();
    const other = await env.DB.prepare("SELECT account_id FROM discord_links WHERE discord_id=?1").bind(me2.id).first();
    if (other && other.account_id !== st.account_id) return back("discordLinked=taken");
    await linkPair(env, me2.id, st.account_id, me2.handle, null, false);
    return back("discordLinked=1");
  }
  if (st.kind === "link") {
    if (!st.account_id) return fail2();
    return back("discordLink=" + await newGrant2(env, "link", st, me2, 5 * 6e4));
  }
  if (await discordAccountId(env, me2.id)) return back("discordLogin=" + await newGrant2(env, "login", st, me2, 5 * 6e4));
  if (await discordLinkedAny(env, me2.id)) return back("discordLogin=0&relink=1");
  const q2 = new URLSearchParams({ discordLogin: "0", new: "1", sid: await newGrant2(env, "signup", st, me2, 30 * 6e4) });
  if (me2.name) q2.set("name", me2.name);
  return back(String(q2));
}
__name(discordAnswer, "discordAnswer");
async function discordAccount(env, a, p, m, body, url, passCheck) {
  if (p === "/discord" && m === "GET") {
    const l = await env.DB.prepare("SELECT discord_id, handle, shown, login FROM discord_links WHERE account_id=?1").bind(a.id).first();
    return json5({ linked: !!l, id: l ? l.discord_id : void 0, handle: l ? l.handle || "" : void 0, shown: !!(l && l.shown), login: !!(l && l.login), oauth: oauthReady(env) });
  }
  if (p === "/discord/start" && m === "POST") {
    if (!oauthReady(env)) return json5({ error: NOT_READY + ": use /link in Discord" }, 503);
    const app = body.app || url.searchParams.get("app");
    if (body.auth == null && !app && !body.port) return json5(await discordStart(env, url, "legacy", a.id, body.device));
    const no = await passCheck();
    if (no) return no;
    const r2 = await discordStart(env, url, "link", a.id, body.device, body.port, app);
    return json5(r2, r2.error ? 400 : 200);
  }
  if (p === "/discord/link/grant" && m === "POST") {
    const g = await useDiscordGrant(env, body.grant, "link", body.code);
    if (!g || g.account_id !== a.id) return json5({ error: AGAIN }, 400);
    if (await linkDiscordLogin(env, g, a.id) === "taken") return json5({ error: "this Discord account is already linked to another account", code: "taken" }, 409);
    return json5({ ok: true, handle: g.handle || "" });
  }
  if (p === "/discord/show" && m === "POST") {
    await env.DB.prepare("UPDATE discord_links SET shown=?2 WHERE account_id=?1").bind(a.id, body.shown ? 1 : 0).run();
    return json5({ ok: true, shown: !!body.shown });
  }
  if (p === "/discord/unlink" && m === "POST") {
    const l = await env.DB.prepare("SELECT login FROM discord_links WHERE account_id=?1").bind(a.id).first();
    if (body.auth != null || l && l.login) {
      const no = await passCheck();
      if (no) return no;
    }
    await env.DB.batch([
      env.DB.prepare("DELETE FROM discord_members WHERE discord_id IN (SELECT discord_id FROM discord_links WHERE account_id=?1)").bind(a.id),
      env.DB.prepare("DELETE FROM discord_links WHERE account_id=?1").bind(a.id)
    ]);
    return json5({ ok: true });
  }
  const code = String((m === "GET" ? url.searchParams.get("c") : body.code) || "").toUpperCase().replace(/[^A-Z0-9]/g, "");
  if (code.length !== 8) return json5({ error: "this link is not valid" }, 400);
  const h = await sha256("discord:" + code);
  const c = await env.DB.prepare("SELECT discord_id, discord_name, guild_id, handle FROM discord_codes WHERE code_hash=?1 AND expires>?2").bind(h, Date.now()).first();
  if (!c) return json5({ error: "this link expired: ask the bot again with /link" }, 404);
  if (p === "/discord/code" && m === "GET") return json5({ name: c.discord_name });
  if (p === "/discord/link" && m === "POST") {
    const no = await passCheck();
    if (no) return no;
    await linkPair(env, c.discord_id, a.id, c.handle, c.guild_id, false);
    await env.DB.prepare("DELETE FROM discord_codes WHERE code_hash=?1").bind(h).run();
    return json5({ ok: true, name: c.discord_name });
  }
  return json5({ error: "not found" }, 404);
}
__name(discordAccount, "discordAccount");

// src/presence.js
var KINDS = ["web", "pc", "desktop", "android", "ios"];
var EVERY = 6e4;
var seen = /* @__PURE__ */ new Map();
function clientOf(req) {
  const h = String(req.headers.get("x-pitlane-client") || "").trim().toLowerCase();
  const m = h.match(/^([a-z]+)(?:\/([0-9][0-9a-z.+-]{0,23}))?/);
  if (m && KINDS.includes(m[1])) return { kind: m[1], version: m[2] || "" };
  const ua = String(req.headers.get("user-agent") || "");
  if (/^okhttp\//i.test(ua) || /^Dalvik\//.test(ua)) return { kind: "android", version: "" };
  if (/CFNetwork|Darwin\//.test(ua) && !/^Mozilla\//.test(ua)) return { kind: "ios", version: "" };
  if (/^Go-http-client\//.test(ua)) return { kind: "pc", version: "" };
  if (/^Mozilla\//.test(ua)) return { kind: "web", version: "" };
  return null;
}
__name(clientOf, "clientOf");
async function notePresence(env, req, a) {
  try {
    const c = clientOf(req);
    if (!c || !a || !a.sid) return;
    const now = Date.now(), key = a.id + "|" + c.kind + "|" + a.sid;
    if (now - (seen.get(key) || 0) < EVERY) return;
    seen.set(key, now);
    if (seen.size > 5e3) {
      for (const [k, t] of seen) if (now - t > EVERY) seen.delete(k);
    }
    await env.DB.prepare(
      `INSERT INTO presence (account_id, kind, device, name, app_version, last_seen) VALUES (?1,?2,?3,?4,?5,?6)
       ON CONFLICT(account_id, kind, device) DO UPDATE SET name=excluded.name, app_version=COALESCE(NULLIF(excluded.app_version,''), presence.app_version), last_seen=excluded.last_seen
       WHERE presence.last_seen < ?7`
    ).bind(a.id, c.kind, String(a.sid).slice(0, 32), String(a.session_device || "").slice(0, 60), c.version, now, now - EVERY).run();
  } catch (e) {
  }
}
__name(notePresence, "notePresence");
async function prunePresence(env) {
  await env.DB.prepare("DELETE FROM presence WHERE last_seen < ?1").bind(Date.now() - 7 * 864e5).run();
}
__name(prunePresence, "prunePresence");
async function onlineRoute(req, env) {
  const json14 = /* @__PURE__ */ __name((o, s = 200) => new Response(JSON.stringify(o), { status: s, headers: { "content-type": "application/json", "cache-control": "no-store" } }), "json");
  const acc = await sessionAccount(req, env);
  if (!acc || !isAdmin(env, acc.id)) return json14({ error: "only the admins of this server can do this" }, 403);
  const now = Date.now(), on = now - 3 * 6e4;
  const r2 = await env.DB.prepare(
    `SELECT p.account_id AS accountId, p.kind, p.name AS device, p.app_version AS version, p.last_seen AS lastSeen, a.display AS nick
     FROM presence p LEFT JOIN accounts a ON a.id=p.account_id WHERE p.last_seen > ?1 ORDER BY p.last_seen DESC LIMIT 500`
  ).bind(now - 864e5).all().catch(() => ({ results: [] }));
  const rows = r2.results || [];
  const count = /* @__PURE__ */ __name((list) => {
    const c = Object.fromEntries(KINDS.map((k) => [k, 0]));
    const accs = /* @__PURE__ */ new Set();
    for (const x of list) {
      c[x.kind] = (c[x.kind] || 0) + 1;
      accs.add(x.accountId);
    }
    return { ...c, accounts: accs.size, devices: list.length };
  }, "count");
  const online = rows.filter((x) => x.lastSeen > on), recent2 = rows.filter((x) => x.lastSeen <= on);
  return json14({ now, online, recent: recent2, counts: { online: count(online), recent: count(rows) } });
}
__name(onlineRoute, "onlineRoute");

// src/escrow.js
var isDataKey = /* @__PURE__ */ __name((v) => typeof v === "string" && /^[0-9a-f]{64}$/.test(v), "isDataKey");
var escrowReady = /* @__PURE__ */ __name((env) => !!env.DATA_KEY, "escrowReady");
var cleanEmail = /* @__PURE__ */ __name((e) => typeof e === "string" ? e.trim().toLowerCase() : "", "cleanEmail");
var isEmail = /* @__PURE__ */ __name((e) => e.length <= 254 && /^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(e), "isEmail");
async function sealEscrow(env, key, email, emailOK) {
  if (!escrowReady(env)) return { error: "the server cannot keep the key", status: 503 };
  const k = typeof key === "string" ? key.trim().toLowerCase() : "";
  if (!isDataKey(k)) return { error: "missing key", status: 400 };
  const e = cleanEmail(email);
  const keep = e && isEmail(e) && await emailOK(e) ? e : "";
  return { value: await sealData(env, JSON.stringify(keep ? { k, e: keep } : { k })) };
}
__name(sealEscrow, "sealEscrow");
async function openEscrow(env, s) {
  if (typeof s !== "string" || !s.startsWith("enc:") || !escrowReady(env)) return null;
  try {
    const o = JSON.parse(await openData(env, s));
    return o && isDataKey(o.k) ? { key: o.k, email: typeof o.e === "string" ? o.e : "" } : null;
  } catch (e) {
    return null;
  }
}
__name(openEscrow, "openEscrow");
async function escrowLogin(env, a) {
  const x = await openEscrow(env, a && a.escrow);
  return x ? { dataKey: x.key, email: x.email || void 0, escrow: true } : { needKey: true, escrow: false };
}
__name(escrowLogin, "escrowLogin");

// src/accounts.js
var JSONH4 = { "content-type": "application/json; charset=utf-8", "cache-control": "no-store", "access-control-allow-origin": "*" };
var json6 = /* @__PURE__ */ __name((v, status = 200) => new Response(JSON.stringify(v), { status, headers: JSONH4 }), "json");
var err3 = /* @__PURE__ */ __name((msg, status) => json6({ error: msg }, status), "err");
var hex2 = /* @__PURE__ */ __name((b) => [...new Uint8Array(b)].map((x) => x.toString(16).padStart(2, "0")).join(""), "hex");
var rid3 = /* @__PURE__ */ __name((n = 12) => hex2(crypto.getRandomValues(new Uint8Array(n))), "rid");
async function sha256(t) {
  return hex2(await crypto.subtle.digest("SHA-256", new TextEncoder().encode(t)));
}
__name(sha256, "sha256");
function same3(a, b) {
  if (typeof a !== "string" || typeof b !== "string" || a.length !== b.length) return false;
  let d = 0;
  for (let i = 0; i < a.length; i++) d |= a.charCodeAt(i) ^ b.charCodeAt(i);
  return d === 0;
}
__name(same3, "same");
var isKey = /* @__PURE__ */ __name((v) => typeof v === "string" && /^[0-9a-f]{64}$/.test(v), "isKey");
var isB64 = /* @__PURE__ */ __name((v, max) => typeof v === "string" && v.length > 20 && v.length <= max && /^[A-Za-z0-9+/=]+$/.test(v), "isB64");
var cleanName = /* @__PURE__ */ __name((a) => (typeof a === "string" ? a : "").slice(0, 32).replace(/[\u0000-\u001f<>]/g, "").trim(), "cleanName");
var emailHash = /* @__PURE__ */ __name((env, e) => sha256("pitlanehq-email:" + (env.EMAIL_PEPPER || "") + ":" + String(e || "").trim().toLowerCase()), "emailHash");
var authHash = /* @__PURE__ */ __name((salt, auth) => sha256(salt + ":" + auth), "authHash");
var keyTag = /* @__PURE__ */ __name(async (wrapped) => (await sha256("pitlanehq-key:" + String(wrapped || ""))).slice(0, 16), "keyTag");
var ipOf = /* @__PURE__ */ __name((req) => req.headers.get("cf-connecting-ip") || "unknown", "ipOf");
var CHUNK = 9e5;
var SESSION_IDLE = 180 * 864e5;
var SESSION_MAX = 400 * 864e5;
async function tooMany(env, keys, limits) {
  const since = Date.now() - 15 * 6e4;
  await env.DB.prepare("DELETE FROM auth_fails WHERE t < ?1").bind(since).run();
  for (let i = 0; i < keys.length; i++) {
    const r2 = await env.DB.prepare("SELECT COUNT(*) AS n FROM auth_fails WHERE k=?1 AND t>=?2").bind(keys[i], since).first();
    if (r2 && r2.n >= limits[i]) return true;
  }
  return false;
}
__name(tooMany, "tooMany");
var fail = /* @__PURE__ */ __name((env, keys) => env.DB.batch(keys.map((k) => env.DB.prepare("INSERT INTO auth_fails (k, t) VALUES (?1, ?2)").bind(k, Date.now()))), "fail");
async function newSession(env, accountId, device) {
  const token = rid3(32);
  await env.DB.prepare("INSERT INTO account_sessions (id, account_id, token_hash, device, created, last_seen) VALUES (?1,?2,?3,?4,?5,?5)").bind(rid3(8), accountId, await sha256(token), cleanName(device) || "PC", Date.now()).run();
  return token;
}
__name(newSession, "newSession");
async function sessionAccount(req, env) {
  const h = req.headers.get("authorization") || "";
  const t = h.startsWith("Bearer ") ? h.slice(7).trim() : "";
  if (t.length < 40) return null;
  const s = await env.DB.prepare(
    "SELECT s.id AS sid, s.last_seen, s.created AS session_created, s.device AS session_device, a.* FROM account_sessions s JOIN accounts a ON a.id=s.account_id WHERE s.token_hash=?1"
  ).bind(await sha256(t)).first();
  if (!s) return null;
  if (Date.now() - s.last_seen > SESSION_IDLE || Date.now() - s.session_created > SESSION_MAX) {
    await env.DB.prepare("DELETE FROM account_sessions WHERE id=?1").bind(s.sid).run();
    return null;
  }
  if (Date.now() - s.last_seen > 36e5) await env.DB.prepare("UPDATE account_sessions SET last_seen=?2 WHERE id=?1").bind(s.sid, Date.now()).run();
  return s;
}
__name(sessionAccount, "sessionAccount");
async function newEmailToken(env, accountId, kind, ttl) {
  const t = rid3(24);
  await env.DB.batch([
    env.DB.prepare("DELETE FROM email_tokens WHERE (account_id=?1 AND kind=?2) OR expires<?3").bind(accountId, kind, Date.now()),
    env.DB.prepare("INSERT INTO email_tokens (token_hash, account_id, kind, expires) VALUES (?1,?2,?3,?4)").bind(await sha256(t), accountId, kind, Date.now() + ttl)
  ]);
  return t;
}
__name(newEmailToken, "newEmailToken");
async function useEmailToken(env, t, kind, consume) {
  if (typeof t !== "string" || !/^[0-9a-f]{48}$/.test(t)) return null;
  const h = await sha256(t);
  const r2 = await env.DB.prepare("SELECT account_id, expires FROM email_tokens WHERE token_hash=?1 AND kind=?2").bind(h, kind).first();
  if (!r2 || r2.expires < Date.now()) return null;
  if (consume) await env.DB.prepare("DELETE FROM email_tokens WHERE token_hash=?1").bind(h).run();
  return r2.account_id;
}
__name(useEmailToken, "useEmailToken");
var VERIFY_SINCE = 1791396e6;
var mustVerify = /* @__PURE__ */ __name((env, a) => !a.verified && (a.created || 0) >= VERIFY_SINCE && mailReady(env) && !isAdmin(env, a.id), "mustVerify");
async function mailVerify(env, url, accountId, email, l) {
  if (!mailReady(env)) return false;
  const t = await newEmailToken(env, accountId, "verify", 7 * 864e5);
  return sendVerify(env, email, url.origin + "/account/verify?t=" + t + "&lang=" + lang(l), l);
}
__name(mailVerify, "mailVerify");
var accountRows = /* @__PURE__ */ __name((env, id2) => [
  env.DB.prepare("DELETE FROM account_sync_chunks WHERE account_id=?1").bind(id2),
  env.DB.prepare("DELETE FROM account_sync WHERE account_id=?1").bind(id2),
  env.DB.prepare("DELETE FROM account_sessions WHERE account_id=?1").bind(id2),
  env.DB.prepare("DELETE FROM email_tokens WHERE account_id=?1").bind(id2),
  env.DB.prepare("DELETE FROM recovery_codes WHERE account_id=?1").bind(id2),
  env.DB.prepare("DELETE FROM login_pending WHERE account_id=?1").bind(id2),
  env.DB.prepare("DELETE FROM profile_races WHERE account_id=?1").bind(id2),
  env.DB.prepare("DELETE FROM league_hits WHERE league_id IN (SELECT id FROM leagues WHERE owner=?1)").bind(id2),
  env.DB.prepare("DELETE FROM league_days WHERE league_id IN (SELECT id FROM leagues WHERE owner=?1)").bind(id2),
  env.DB.prepare("DELETE FROM leagues WHERE owner=?1").bind(id2),
  env.DB.prepare("DELETE FROM discord_members WHERE discord_id IN (SELECT discord_id FROM discord_links WHERE account_id=?1)").bind(id2),
  env.DB.prepare("DELETE FROM discord_links WHERE account_id=?1").bind(id2),
  env.DB.prepare("DELETE FROM discord_oauth WHERE account_id=?1").bind(id2),
  env.DB.prepare("DELETE FROM discord_grants WHERE account_id=?1").bind(id2),
  env.DB.prepare("DELETE FROM steam_links WHERE account_id=?1").bind(id2),
  env.DB.prepare("DELETE FROM steam_oauth WHERE account_id=?1").bind(id2),
  env.DB.prepare("DELETE FROM steam_grants WHERE account_id=?1").bind(id2),
  env.DB.prepare("DELETE FROM usage_days WHERE account_id=?1").bind(id2),
  env.DB.prepare("DELETE FROM feedback WHERE account_id=?1").bind(id2),
  env.DB.prepare("DELETE FROM feedback_ask WHERE account_id=?1").bind(id2),
  env.DB.prepare("DELETE FROM support_msgs WHERE account_id=?1").bind(id2),
  env.DB.prepare("DELETE FROM support_logs WHERE account_id=?1").bind(id2),
  env.DB.prepare("DELETE FROM alerts WHERE account_id=?1").bind(id2),
  env.DB.prepare("DELETE FROM alert_subs WHERE account_id=?1").bind(id2),
  env.DB.prepare("UPDATE crash_reports SET last_account=NULL WHERE last_account=?1").bind(id2),
  env.DB.prepare("DELETE FROM support_threads WHERE account_id=?1").bind(id2),
  env.DB.prepare("DELETE FROM accounts WHERE id=?1").bind(id2)
], "accountRows");
async function deleteAccount(env, id2) {
  const up = "acct:" + id2;
  await env.DB.batch([
    // a shared lap without its own telemetry showed the same lap of the account: it keeps it now
    env.DB.prepare(`UPDATE community_laps SET trace=(SELECT a.trace FROM laps a JOIN sessions s ON s.id=a.session_id
        WHERE s.uploader=?2 AND ABS(a.time-community_laps.time)<0.002 AND s.game=community_laps.game AND a.valid=1 AND a.trace IS NOT NULL LIMIT 1)
      WHERE user_id=?1 AND trace IS NULL AND EXISTS (SELECT 1 FROM community_laps c2 WHERE c2.user_id=?1 AND c2.trace IS NOT NULL)`).bind(id2, up),
    env.DB.prepare("UPDATE community_laps SET anon=1 WHERE user_id=?1").bind(id2),
    env.DB.prepare("UPDATE community_users SET alias='Anonymous', iracing=NULL, owner=NULL, token_hash='deleted:'||id WHERE id=?1").bind(id2),
    // the rivals of your races and your Drinks drivers are other people: their laps stay as they are
    env.DB.prepare("UPDATE community_users SET owner=NULL WHERE owner=?1").bind(id2),
    env.DB.prepare("DELETE FROM driver_links WHERE account_id=?1").bind(id2),
    env.DB.prepare("DELETE FROM driver_link_seen WHERE account_id=?1").bind(id2),
    env.DB.prepare("DELETE FROM driver_link_moves WHERE account_id=?1").bind(id2),
    env.DB.prepare("DELETE FROM community_reports WHERE user_id=?1").bind(id2),
    env.DB.prepare("DELETE FROM community_setups WHERE user_id=?1").bind(id2),
    // of your own laps only the ones the model learns from stay (valid, with telemetry), under no name
    env.DB.prepare("DELETE FROM laps WHERE session_id IN (SELECT id FROM sessions WHERE uploader=?1) AND (valid<>1 OR trace IS NULL OR time<=10)").bind(up),
    env.DB.prepare("DELETE FROM sessions WHERE uploader=?1 AND NOT EXISTS (SELECT 1 FROM laps WHERE session_id=sessions.id)").bind(up),
    ...accountRows(env, id2)
  ]);
}
__name(deleteAccount, "deleteAccount");
async function purgeAccount(env, id2) {
  await env.DB.batch([
    env.DB.prepare("DELETE FROM laps WHERE session_id IN (SELECT id FROM sessions WHERE uploader=?1)").bind("acct:" + id2),
    env.DB.prepare("DELETE FROM sessions WHERE uploader=?1").bind("acct:" + id2),
    env.DB.prepare("DELETE FROM community_laps WHERE user_id IN (SELECT id FROM community_users WHERE owner=?1)").bind(id2),
    env.DB.prepare("DELETE FROM community_users WHERE owner=?1").bind(id2),
    env.DB.prepare("DELETE FROM driver_links WHERE account_id=?1").bind(id2),
    env.DB.prepare("DELETE FROM driver_link_seen WHERE account_id=?1").bind(id2),
    env.DB.prepare("DELETE FROM driver_link_moves WHERE account_id=?1").bind(id2),
    env.DB.prepare("DELETE FROM community_laps WHERE user_id=?1").bind(id2),
    env.DB.prepare("DELETE FROM community_reports WHERE user_id=?1").bind(id2),
    env.DB.prepare("DELETE FROM community_setups WHERE user_id=?1").bind(id2),
    env.DB.prepare("DELETE FROM community_users WHERE id=?1").bind(id2),
    ...accountRows(env, id2)
  ]);
}
__name(purgeAccount, "purgeAccount");
async function nameTaken(env, name2, mine) {
  const n = String(name2 || "").trim().toLowerCase();
  if (!n) return false;
  if (n === "anonymous" || n === "an\xF3nimo" || n === "anonimo") return true;
  return !!await env.DB.prepare("SELECT 1 FROM community_users WHERE lower(alias)=?1 AND id<>?2 AND (owner IS NULL OR owner<>?2) AND (token_hash LIKE 'acct:%' OR id LIKE 'guest-%') LIMIT 1").bind(n, mine || "").first();
}
__name(nameTaken, "nameTaken");
var isAdmin = /* @__PURE__ */ __name((env, id2) => env.LOCAL === "1" || String(env.ADMINS || env.SEASON_UPLOADERS || "").split(",").map((x) => x.trim()).filter(Boolean).includes(id2), "isAdmin");
async function accounts(req, env, url) {
  if (env.COMMUNITY !== "1") return err3("accounts are not enabled on this server", 404);
  const p = url.pathname.replace(/^\/account/, ""), m = req.method;
  if (m === "OPTIONS") return new Response(null, { status: 204, headers: { ...JSONH4, "access-control-allow-methods": "GET,POST,PUT,DELETE", "access-control-allow-headers": "authorization,content-type", "access-control-max-age": "86400" } });
  const body = m === "POST" || m === "PUT" ? await req.json().catch(() => ({})) : {};
  const ip = "ip:" + await sha256(ipOf(req));
  if (p === "/verify" && m === "GET") {
    const id2 = await useEmailToken(env, url.searchParams.get("t"), "verify", true);
    if (id2) await env.DB.prepare("UPDATE accounts SET verified=1 WHERE id=?1").bind(id2).run();
    return messagePage(pageLang(req, url), !!id2);
  }
  if (p === "/forgot" && m === "GET") return forgotPage(pageLang(req, url), mailReady(env));
  if (p === "/reset" && m === "GET") {
    const t = url.searchParams.get("t") || "";
    if (!await useEmailToken(env, t, "reset", false)) return badLinkPage(pageLang(req, url));
    return resetPage(pageLang(req, url), t);
  }
  if (p === "/forgot" && m === "POST") {
    if (!mailReady(env)) return err3("password reset by email is not set up on this server", 503);
    if (typeof body.email !== "string" || !/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(body.email)) return err3("write a valid email", 400);
    const eh = await emailHash(env, body.email);
    if (await tooMany(env, ["mail:" + ip, "mail:" + eh], [10, 3])) return err3("too many emails: try again in 15 minutes", 429);
    await fail(env, ["mail:" + ip, "mail:" + eh]);
    const a2 = await env.DB.prepare("SELECT id FROM accounts WHERE email_hash=?1").bind(eh).first();
    if (a2) {
      const t = await newEmailToken(env, a2.id, "reset", 36e5);
      await sendReset(env, body.email.trim(), url.origin + "/account/reset?t=" + t + "&lang=" + lang(body.lang), body.lang);
    }
    return json6({ ok: true });
  }
  if (p === "/reset" && m === "POST") {
    if (await tooMany(env, ["reset:" + ip], [10])) return err3("too many tries: wait 15 minutes", 429);
    const id2 = await useEmailToken(env, body.token, "reset", false);
    if (!id2) return err3("this link is not valid any more: ask for a new one", 400);
    if (typeof body.email !== "string" || !isKey(body.auth) || !isB64(body.wrappedKey, 200)) return err3("missing email or key", 400);
    const a2 = await env.DB.prepare("SELECT id, email_hash FROM accounts WHERE id=?1").bind(id2).first();
    if (!a2 || !same3(await emailHash(env, body.email), a2.email_hash)) {
      await fail(env, ["reset:" + ip]);
      return err3("this is not the email of that account", 400);
    }
    const salt = rid3(16);
    await env.DB.batch([
      env.DB.prepare("UPDATE accounts SET auth_salt=?2, auth_hash=?3, wrapped_key=?4, verified=1, escrow=NULL WHERE id=?1").bind(id2, salt, await authHash(salt, body.auth), body.wrappedKey),
      // the synced copy was encrypted with the old password: the PCs upload it again
      env.DB.prepare("DELETE FROM account_sync_chunks WHERE account_id=?1").bind(id2),
      env.DB.prepare("DELETE FROM account_sync WHERE account_id=?1").bind(id2),
      env.DB.prepare("DELETE FROM account_sessions WHERE account_id=?1").bind(id2),
      env.DB.prepare("DELETE FROM email_tokens WHERE account_id=?1").bind(id2)
    ]);
    return json6({ ok: true });
  }
  if (p === "/register" && m === "POST") {
    if (await tooMany(env, ["reg:" + ip], [5])) return err3("too many new accounts from this network, try later", 429);
    if (typeof body.email !== "string" || !/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(body.email) || !isKey(body.auth) || !isB64(body.wrappedKey, 200)) return err3("missing email, key or data key", 400);
    const display = cleanName(body.display);
    if (!display) return err3("choose a public name", 400);
    if (await nameTaken(env, display, "")) return json6({ error: "this nickname is already taken, choose another one", code: "name_taken" }, 409);
    const eh = await emailHash(env, body.email);
    if (await env.DB.prepare("SELECT id FROM accounts WHERE email_hash=?1").bind(eh).first()) {
      await fail(env, ["reg:" + ip]);
      return err3("there is already an account with this email", 409);
    }
    let steam = null, discord = null;
    if (body.sid && body.discordSid) return err3("sign up with one of the two", 400);
    if (body.sid) {
      steam = await useSteamGrant(env, body.sid, "signup", body.code);
      if (!steam) return err3("this Steam sign-in is not valid any more, sign in with Steam again", 400);
      if (await steamAccountId(env, steam.steamid)) return json6({ error: "this Steam account is already linked to another account", code: "taken" }, 409);
    }
    if (body.discordSid) {
      discord = await useDiscordGrant(env, body.discordSid, "signup", body.code);
      if (!discord) return err3("this Discord sign-in is not valid any more, sign in with Discord again", 400);
      if (await discordLinkedAny(env, discord.discord_id)) return json6({ error: "this Discord account is already linked to another account", code: "taken" }, 409);
    }
    await fail(env, ["reg:" + ip]);
    const id2 = rid3(), salt = rid3(16);
    await env.DB.batch([
      env.DB.prepare("INSERT INTO accounts (id, email_hash, auth_salt, auth_hash, wrapped_key, display, name_kind, created) VALUES (?1,?2,?3,?4,?5,?6,?7,?8)").bind(id2, eh, salt, await authHash(salt, body.auth), body.wrappedKey, display, body.nameKind === "iracing" ? "iracing" : "nick", Date.now()),
      env.DB.prepare("INSERT INTO community_users (id, token_hash, alias, created) VALUES (?1,?2,?3,?4)").bind(id2, "acct:" + id2, display, Date.now())
    ]);
    if (steam) await linkSteam(env, steam.steamid, id2, steam.persona);
    const taken = discord && await linkDiscordLogin(env, discord, id2) === "taken" ? { discordTaken: true } : {};
    await patreonOnRegister(env, id2, eh).catch(() => {
    });
    await proOnRegister(env, id2, eh).catch(() => {
    });
    const mailed = await mailVerify(env, url, id2, body.email.trim(), body.lang).catch(() => false);
    if (mailed) return json6({ verifyFirst: true, mailed: true, error: "verify your email first: we sent you a link, open it and then sign in", code: "verify_first", ...taken }, 202);
    const token = await newSession(env, id2, body.device);
    return json6({ id: id2, token, display, nameKind: body.nameKind === "iracing" ? "iracing" : "nick", wrappedKey: body.wrappedKey, keyTag: await keyTag(body.wrappedKey), admin: isAdmin(env, id2), verified: false, mailed, escrow: false, ...taken });
  }
  const signedIn = /* @__PURE__ */ __name(async (a2, token, social) => json6({ id: a2.id, token, display: a2.display, nameKind: a2.name_kind, anon: !!a2.anon, wrappedKey: social ? void 0 : a2.wrapped_key, keyTag: await keyTag(a2.wrapped_key), admin: isAdmin(env, a2.id), verified: !!a2.verified, twoFactor: !!a2.totp_on, escrow: !!a2.escrow, ...social ? await escrowLogin(env, a2) : {} }), "signedIn");
  if (p === "/steam/login/start" && (m === "GET" || m === "POST")) {
    if (await tooMany(env, ["steam:" + ip], [30])) return err3("too many tries: wait 15 minutes", 429);
    await fail(env, ["steam:" + ip]);
    const q2 = m === "GET" ? url.searchParams : null;
    const r2 = await steamStart(env, url, "login", null, q2 ? q2.get("device") : body.device, q2 ? q2.get("port") : body.port, body.app || url.searchParams.get("app"));
    return json6(r2, r2.error ? 400 : 200);
  }
  if (p === "/discord/login/start" && (m === "GET" || m === "POST")) {
    if (!oauthReady(env)) return err3("Discord sign-in is not set up on this server yet", 503);
    if (await tooMany(env, ["discord:" + ip], [30])) return err3("too many tries: wait 15 minutes", 429);
    await fail(env, ["discord:" + ip]);
    const q2 = m === "GET" ? url.searchParams : null;
    const r2 = await discordStart(env, url, "login", null, q2 ? q2.get("device") : body.device, q2 ? q2.get("port") : body.port, body.app || url.searchParams.get("app"));
    return json6(r2, r2.error ? 400 : 200);
  }
  if (p === "/login" && m === "POST") {
    if (typeof body.email !== "string" || !isKey(body.auth)) return err3("missing email or key", 400);
    const eh = await emailHash(env, body.email), keys = ["login:" + eh, ip];
    if (await tooMany(env, keys, [5, 30])) return err3("too many wrong passwords: wait 15 minutes", 429);
    const a2 = await env.DB.prepare("SELECT * FROM accounts WHERE email_hash=?1").bind(eh).first();
    if (!a2) {
      await fail(env, [ip]);
      return json6({ error: "there is no account with this email: create one", code: "no_account" }, 404);
    }
    if (!same3(await authHash(a2.auth_salt, body.auth), a2.auth_hash)) {
      await fail(env, keys);
      return err3("wrong email or password", 401);
    }
    if (mustVerify(env, a2)) {
      const recent2 = await env.DB.prepare("SELECT 1 FROM email_tokens WHERE account_id=?1 AND kind='verify' AND expires>?2").bind(a2.id, Date.now() + 7 * 864e5 - 12e4).first();
      if (!recent2) await mailVerify(env, url, a2.id, body.email.trim(), body.lang).catch(() => false);
      return json6({ error: "verify your email first: we sent you a link, open it and then sign in", code: "verify_first" }, 403);
    }
    if (a2.totp_on) {
      const t = rid3(24);
      await env.DB.batch([
        env.DB.prepare("DELETE FROM login_pending WHERE expires<?1").bind(Date.now()),
        env.DB.prepare("INSERT INTO login_pending (token_hash, account_id, device, expires) VALUES (?1,?2,?3,?4)").bind(await sha256(t), a2.id, cleanName(body.device) || "PC", Date.now() + 5 * 6e4)
      ]);
      return json6({ twoFactor: true, pending: t });
    }
    return signedIn(a2, await newSession(env, a2.id, body.device));
  }
  if ((p === "/login/steam" || p === "/login/discord") && m === "POST") {
    if (await tooMany(env, [ip], [30])) return err3("too many tries: wait 15 minutes", 429);
    const viaDiscord = p === "/login/discord";
    const g = viaDiscord ? await useDiscordGrant(env, body.grant, "login", body.code) : await useSteamGrant(env, body.grant, "login", body.code);
    const aid = g ? viaDiscord ? await discordAccountId(env, g.discord_id) : await steamAccountId(env, g.steamid) : null;
    const a2 = aid ? await env.DB.prepare("SELECT * FROM accounts WHERE id=?1").bind(aid).first() : null;
    if (!a2) {
      await fail(env, [ip]);
      return err3(viaDiscord ? "this Discord sign-in is not valid any more, sign in with Discord again" : "this Steam sign-in is not valid any more, sign in with Steam again", 401);
    }
    if (mustVerify(env, a2)) return json6({ error: "verify your email first: we sent you a link, open it and then sign in", code: "verify_first" }, 403);
    const device = cleanName(body.device) || g.device || "PC";
    if (a2.totp_on) {
      const t = rid3(24);
      await env.DB.batch([
        env.DB.prepare("DELETE FROM login_pending WHERE expires<?1").bind(Date.now()),
        // steam 1: the session comes without the wrapped key, with the server's copy of the data key (Steam or Discord signed in)
        env.DB.prepare("INSERT INTO login_pending (token_hash, account_id, device, expires, steam) VALUES (?1,?2,?3,?4,1)").bind(await sha256(t), a2.id, device, Date.now() + 5 * 6e4)
      ]);
      return json6({ twoFactor: true, pending: t, needKey: !a2.escrow });
    }
    return signedIn(a2, await newSession(env, a2.id, device), true);
  }
  if (p === "/login/2fa" && m === "POST") {
    if (typeof body.pending !== "string" || !/^[0-9a-f]{48}$/.test(body.pending)) return err3("sign in again", 400);
    const ph = await sha256(body.pending);
    const pend = await env.DB.prepare("SELECT * FROM login_pending WHERE token_hash=?1").bind(ph).first();
    if (!pend || pend.expires < Date.now()) return err3("the code took too long: sign in again", 401);
    const keys = ["2fa:" + pend.account_id, ip];
    if (await tooMany(env, keys, [5, 30])) return err3("too many wrong codes: wait 15 minutes", 429);
    const a2 = await env.DB.prepare("SELECT * FROM accounts WHERE id=?1").bind(pend.account_id).first();
    if (!a2 || !a2.totp_on) return err3("sign in again", 401);
    const code = String(body.code || "").trim().toLowerCase();
    let ok = await totpOK(await openData(env, a2.totp), code);
    if (!ok && /^[a-z0-9]{4}-?[a-z0-9]{4}$/.test(code)) {
      const h = await sha256("recovery:" + code.replace("-", ""));
      const r2 = await env.DB.prepare("DELETE FROM recovery_codes WHERE account_id=?1 AND code_hash=?2 RETURNING code_hash").bind(a2.id, h).first();
      ok = !!r2;
    }
    if (!ok) {
      await fail(env, keys);
      return err3("wrong code", 401);
    }
    await env.DB.prepare("DELETE FROM login_pending WHERE token_hash=?1").bind(ph).run();
    return signedIn(a2, await newSession(env, a2.id, pend.device), !!pend.steam);
  }
  const a = await sessionAccount(req, env);
  if (!a) return err3("signed out: sign in again", 401);
  if (m === "GET" && (p === "/me" || p === "/sync" || p === "/sync/meta")) await notePresence(env, req, a);
  const reauth = /* @__PURE__ */ __name(async () => isKey(body.auth) && same3(await authHash(a.auth_salt, body.auth), a.auth_hash), "reauth");
  const passCheck = /* @__PURE__ */ __name(async () => {
    if (await tooMany(env, ["login:" + a.email_hash], [5])) return err3("too many wrong passwords: wait 15 minutes", 429);
    if (await reauth()) return null;
    await fail(env, ["login:" + a.email_hash]);
    return err3("the password is wrong", 401);
  }, "passCheck");
  if (p === "/steam" || p.startsWith("/steam/")) return steamAccount(env, a, p, m, body, url, passCheck);
  if (p === "/discord" || p.startsWith("/discord/")) return discordAccount(env, a, p, m, body, url, passCheck);
  if (p === "/key" && m === "POST") {
    const no = await passCheck();
    if (no) return no;
    return json6({ wrappedKey: a.wrapped_key, keyTag: await keyTag(a.wrapped_key) });
  }
  if (p === "/escrow" && m === "POST") {
    const r2 = await sealEscrow(env, body.key, body.email, async (e) => same3(await emailHash(env, e), a.email_hash));
    if (r2.error) return err3(r2.error, r2.status);
    await env.DB.prepare("UPDATE accounts SET escrow=?2 WHERE id=?1").bind(a.id, r2.value).run();
    return json6({ ok: true, escrow: true });
  }
  if (p === "/me" && m === "GET") return json6({ id: a.id, display: a.display, nameKind: a.name_kind, anon: !!a.anon, created: a.created, admin: isAdmin(env, a.id), supporter: !!a.supporter, supporterHidden: !!a.supporter_hidden, ...proOf(a), ...await proHere(env, a, url.searchParams), proGate: await proGate(env), verified: !!a.verified, mail: mailReady(env), twoFactor: !!a.totp_on, escrow: !!a.escrow, recoveryLeft: a.totp_on ? (await env.DB.prepare("SELECT COUNT(*) AS n FROM recovery_codes WHERE account_id=?1").bind(a.id).first() || {}).n || 0 : 0 });
  if (p === "/2fa/setup" && m === "POST") {
    if (await tooMany(env, ["login:" + a.email_hash], [5])) return err3("too many wrong passwords: wait 15 minutes", 429);
    if (!await reauth()) {
      await fail(env, ["login:" + a.email_hash]);
      return err3("the password is wrong", 401);
    }
    if (a.totp_on) return err3("two-step sign-in is already on", 409);
    const secret = newTotpSecret();
    await env.DB.prepare("UPDATE accounts SET totp_pending=?2 WHERE id=?1").bind(a.id, await sealData(env, secret)).run();
    return json6({ secret, url: otpauthURL(secret, a.display || a.id) });
  }
  if (p === "/2fa/enable" && m === "POST") {
    if (a.totp_on) return err3("two-step sign-in is already on", 409);
    if (!a.totp_pending) return err3("start the setup first", 400);
    if (await tooMany(env, ["2fa:" + a.id], [5])) return err3("too many wrong codes: wait 15 minutes", 429);
    const secret = await openData(env, a.totp_pending);
    if (!await totpOK(secret, body.code)) {
      await fail(env, ["2fa:" + a.id]);
      return err3("wrong code: check the time of your phone and try again", 401);
    }
    const codes = newRecoveryCodes();
    await env.DB.batch([
      env.DB.prepare("UPDATE accounts SET totp=?2, totp_on=1, totp_pending=NULL WHERE id=?1").bind(a.id, await sealData(env, secret)),
      env.DB.prepare("DELETE FROM recovery_codes WHERE account_id=?1").bind(a.id),
      ...await Promise.all(codes.map(async (c) => env.DB.prepare("INSERT INTO recovery_codes (account_id, code_hash) VALUES (?1,?2)").bind(a.id, await sha256("recovery:" + c.replace("-", ""))))),
      env.DB.prepare("DELETE FROM account_sessions WHERE account_id=?1 AND id<>?2").bind(a.id, a.sid)
      // every other device signs in again, with the code
    ]);
    return json6({ ok: true, codes });
  }
  if (p === "/2fa/disable" && m === "POST") {
    if (!a.totp_on) return json6({ ok: true });
    if (await tooMany(env, ["login:" + a.email_hash, "2fa:" + a.id], [5, 5])) return err3("too many attempts: wait 15 minutes", 429);
    const code = String(body.code || "").trim().toLowerCase();
    let codeOK = await totpOK(await openData(env, a.totp), code);
    if (!codeOK && /^[a-z0-9]{4}-?[a-z0-9]{4}$/.test(code)) codeOK = !!await env.DB.prepare("SELECT 1 AS x FROM recovery_codes WHERE account_id=?1 AND code_hash=?2").bind(a.id, await sha256("recovery:" + code.replace("-", ""))).first();
    if (!await reauth() || !codeOK) {
      await fail(env, ["login:" + a.email_hash, "2fa:" + a.id]);
      return err3("the password or the code is wrong", 401);
    }
    await env.DB.batch([
      env.DB.prepare("UPDATE accounts SET totp=NULL, totp_on=0, totp_pending=NULL WHERE id=?1").bind(a.id),
      env.DB.prepare("DELETE FROM recovery_codes WHERE account_id=?1").bind(a.id)
    ]);
    return json6({ ok: true });
  }
  if (p === "/me" && m === "POST") {
    const display = cleanName(body.display);
    if (!display) return err3("choose a public name", 400);
    if (await nameTaken(env, display, a.id)) return json6({ error: "this nickname is already taken, choose another one", code: "name_taken" }, 409);
    const anon = body.anon === void 0 ? !!a.anon : body.anon ? 1 : 0;
    const kind = body.nameKind === "iracing" ? "iracing" : "nick", was = a.name_kind === "iracing" ? "iracing" : "nick";
    const q2 = [
      env.DB.prepare("UPDATE accounts SET display=?2, name_kind=?3, anon=?4 WHERE id=?1").bind(a.id, display, kind, anon ? 1 : 0),
      env.DB.prepare("UPDATE community_users SET alias=?2 WHERE id=?1").bind(a.id, display)
    ];
    if (kind === "iracing") q2.push(env.DB.prepare("UPDATE community_users SET iracing=?2 WHERE id=?1").bind(a.id, display));
    if (kind !== was) for (const t of ["community_laps", "community_reports"])
      q2.push(env.DB.prepare(`UPDATE ${t} SET shown=?2 WHERE user_id=?1 AND anon=0 AND COALESCE(shown,'nick')=?3`).bind(a.id, kind, was));
    await env.DB.batch(q2);
    return json6({ ok: true, display, nameKind: kind, anon: !!anon });
  }
  if (p === "/verify/resend" && m === "POST") {
    if (a.verified) return json6({ ok: true, verified: true });
    if (!mailReady(env)) return err3("emails are not set up on this server", 503);
    if (typeof body.email !== "string" || !same3(await emailHash(env, body.email), a.email_hash)) return err3("this is not the email of your account", 400);
    if (await tooMany(env, ["mail:" + a.id], [3])) return err3("too many emails: try again in 15 minutes", 429);
    await fail(env, ["mail:" + a.id]);
    return json6({ ok: await mailVerify(env, url, a.id, body.email.trim(), body.lang) });
  }
  if (p === "/mail/test" && m === "POST") {
    if (!isAdmin(env, a.id)) return err3("only the admins of this server can do this", 403);
    if (!mailReady(env)) return err3("emails are not set up on this server (RESEND_API_KEY and EMAIL_FROM)", 503);
    if (typeof body.email !== "string" || !/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(body.email)) return err3("write a valid email", 400);
    return json6(await sendTest(env, body.email.trim(), body.lang));
  }
  if (p === "/logout" && m === "POST") {
    await env.DB.prepare("DELETE FROM account_sessions WHERE id=?1").bind(a.sid).run();
    return json6({ ok: true });
  }
  if (p === "/sessions" && m === "GET") {
    const r2 = await env.DB.prepare("SELECT id, device, created, last_seen AS lastSeen FROM account_sessions WHERE account_id=?1 ORDER BY last_seen DESC").bind(a.id).all();
    return json6({ sessions: (r2.results || []).map((s) => ({ ...s, current: s.id === a.sid })) });
  }
  if (p === "/sessions/revoke" && m === "POST") {
    if (body.id === "others") await env.DB.prepare("DELETE FROM account_sessions WHERE account_id=?1 AND id<>?2").bind(a.id, a.sid).run();
    else await env.DB.prepare("DELETE FROM account_sessions WHERE account_id=?1 AND id=?2").bind(a.id, String(body.id || "")).run();
    return json6({ ok: true });
  }
  if (p === "/password" && m === "POST") {
    if (await tooMany(env, ["login:" + a.email_hash], [5])) return err3("too many wrong passwords: wait 15 minutes", 429);
    if (!await reauth()) {
      await fail(env, ["login:" + a.email_hash]);
      return err3("the current password is wrong", 401);
    }
    if (!isKey(body.newAuth) || !isB64(body.wrappedKey, 200)) return err3("missing new key", 400);
    const salt = rid3(16);
    await env.DB.batch([
      env.DB.prepare("UPDATE accounts SET auth_salt=?2, auth_hash=?3, wrapped_key=?4 WHERE id=?1").bind(a.id, salt, await authHash(salt, body.newAuth), body.wrappedKey),
      env.DB.prepare("DELETE FROM account_sessions WHERE account_id=?1 AND id<>?2").bind(a.id, a.sid)
      // sign out everywhere else
    ]);
    return json6({ ok: true });
  }
  if (p === "/delete" && m === "POST") {
    if (!await reauth()) {
      await fail(env, ["login:" + a.email_hash]);
      return err3("the password is wrong", 401);
    }
    await deleteAccount(env, a.id);
    return json6({ deleted: true });
  }
  if (p === "/sync/meta" && m === "GET") {
    const s = await env.DB.prepare("SELECT version, updated FROM account_sync WHERE account_id=?1").bind(a.id).first();
    return json6({ version: s ? s.version : 0, updated: s ? s.updated : null });
  }
  if (p === "/sync" && m === "GET") {
    const s = await env.DB.prepare("SELECT version, updated, chunks FROM account_sync WHERE account_id=?1").bind(a.id).first();
    if (!s) return json6({ version: 0, blob: "" });
    const r2 = await env.DB.prepare("SELECT data FROM account_sync_chunks WHERE account_id=?1 AND idx<?2 ORDER BY idx").bind(a.id, s.chunks).all();
    return json6({ version: s.version, updated: s.updated, blob: (r2.results || []).map((x) => x.data).join("") });
  }
  if (p === "/sync" && m === "PUT") {
    if (!isB64(body.blob, 8 * 1024 * 1024)) return err3("missing or too large data (8 MB max)", 400);
    const s = await env.DB.prepare("SELECT version FROM account_sync WHERE account_id=?1").bind(a.id).first();
    const cur = s ? s.version : 0;
    if (!body.force && Number(body.base) !== cur) return err3("conflict: the account changed on another PC", 409);
    const parts = [];
    for (let i = 0; i < body.blob.length; i += CHUNK) parts.push(body.blob.slice(i, i + CHUNK));
    const v = cur + 1;
    await env.DB.batch([
      env.DB.prepare("DELETE FROM account_sync_chunks WHERE account_id=?1").bind(a.id),
      ...parts.map((d, i) => env.DB.prepare("INSERT INTO account_sync_chunks (account_id, idx, data) VALUES (?1,?2,?3)").bind(a.id, i, d)),
      env.DB.prepare(
        "INSERT INTO account_sync (account_id, version, updated, chunks) VALUES (?1,?2,?3,?4) ON CONFLICT(account_id) DO UPDATE SET version=excluded.version, updated=excluded.updated, chunks=excluded.chunks"
      ).bind(a.id, v, Date.now(), parts.length)
    ]);
    if (env.LIVE) await env.LIVE.get(env.LIVE.idFromName(a.id)).fetch(new Request("https://live/nudge", { headers: { "x-live-nudge": "sync", "x-live-version": String(v) } })).catch(() => {
    });
    return json6({ version: v });
  }
  return err3("not found", 404);
}
__name(accounts, "accounts");

// src/driverlinks.js
var LINK_DAYS = 3;
var UNDONE = "undone";
var rid4 = /* @__PURE__ */ __name(() => [...crypto.getRandomValues(new Uint8Array(12))].map((x) => x.toString(16).padStart(2, "0")).join(""), "rid");
var proofNeeded = /* @__PURE__ */ __name((game) => game !== "iracing", "proofNeeded");
var COL = /^[a-z_][a-z0-9_]*$/;
function insertRow(env, table, row) {
  const cols = Object.keys(row).filter((c) => COL.test(c));
  return env.DB.prepare(`INSERT OR IGNORE INTO ${table} (${cols.join(", ")}) VALUES (${cols.map((_, i) => "?" + (i + 1)).join(", ")})`).bind(...cols.map((c) => row[c] ?? null));
}
__name(insertRow, "insertRow");
async function linkDriver(env, acct, oid, game, deps = {}) {
  const move = deps.moveDriver || moveDriver, mark = deps.markModel || markModel, now = deps.now || Date.now();
  const had = await env.DB.prepare("SELECT oid, account_id FROM driver_links WHERE game=?3 AND (oid=?1 OR account_id=?2)").bind(oid, acct, game).all();
  for (const x of had.results || []) {
    if (x.oid === oid && x.account_id === acct) return { linked: true, moved: 0 };
    if (x.oid === oid) return { error: "this driver is already linked to another account", status: 409 };
    return { error: "this account is already linked to another driver", status: 409 };
  }
  const acc = await env.DB.prepare("SELECT anon, name_kind FROM accounts WHERE id=?1").bind(acct).first();
  if (!acc) return { error: "sign in with your Pitlane HQ account", status: 401 };
  const proof = proofNeeded(game);
  if (proof) {
    const undone = await env.DB.prepare("SELECT 1 AS x FROM driver_link_seen WHERE game=?1 AND oid=?2 AND account_id=?3 AND day=?4").bind(game, oid, acct, UNDONE).first();
    if (undone) return { linked: false, undone: true };
    await env.DB.prepare("INSERT OR IGNORE INTO driver_link_seen (game, oid, account_id, day) VALUES (?1,?2,?3,?4)").bind(game, oid, acct, new Date(now).toISOString().slice(0, 10)).run();
    const seen2 = await env.DB.prepare("SELECT COUNT(*) AS n FROM driver_link_seen WHERE game=?1 AND oid=?2 AND account_id=?3 AND day<>?4").bind(game, oid, acct, UNDONE).first();
    const days = seen2 && seen2.n || 0;
    if (days < LINK_DAYS) return { linked: false, days, need: LINK_DAYS };
  }
  await env.DB.prepare("INSERT INTO driver_links (game, oid, account_id, created) VALUES (?4,?1,?2,?3)").bind(oid, acct, now, game).run();
  const shown = acc.name_kind === "iracing" ? "iracing" : "nick";
  const laps = (await env.DB.prepare("SELECT * FROM community_laps WHERE user_id=?1 AND game=?2").bind(oid, game).all()).results || [];
  const q2 = [], combos2 = /* @__PURE__ */ new Set();
  const keep = /* @__PURE__ */ __name((kind, row) => {
    if (proof) q2.push(env.DB.prepare("INSERT INTO driver_link_moves (game, account_id, oid, kind, row, created) VALUES (?1,?2,?3,?4,?5,?6)").bind(game, acct, oid, kind, JSON.stringify(row), now));
  }, "keep");
  for (const l of laps) {
    const mine = await env.DB.prepare("SELECT * FROM community_laps WHERE user_id=?1 AND car_id=?2 AND track_id=?3 AND game=?4").bind(acct, l.car_id, l.track_id, l.game).first();
    combos2.add(l.game + "|" + l.track_id + "|" + l.car_id);
    const take = env.DB.prepare("UPDATE community_laps SET user_id=?2, anon=?3, shown=?4 WHERE id=?1").bind(l.id, acct, acc.anon ? 1 : 0, shown);
    if (!mine) {
      keep("took", l);
      q2.push(take);
      continue;
    }
    const better = mine.time > l.time || mine.trace == null && l.trace != null;
    if (better) {
      keep("dropped", mine);
      keep("took", l);
      q2.push(env.DB.prepare("DELETE FROM community_laps WHERE id=?1").bind(mine.id), take);
    } else {
      keep("dropped", l);
      q2.push(env.DB.prepare("DELETE FROM community_laps WHERE id=?1").bind(l.id));
    }
  }
  if (proof) {
    const who2 = await env.DB.prepare("SELECT * FROM community_users WHERE id=?1").bind(oid).first();
    if (who2) keep("user", who2);
  }
  q2.push(env.DB.prepare("DELETE FROM community_users WHERE id=?1 AND NOT EXISTS (SELECT 1 FROM community_laps WHERE user_id=?1)").bind(oid));
  await env.DB.batch(q2);
  const learnt = await move(env, "acct:" + oid, "acct:" + acct, game);
  if (proof && Array.isArray(learnt) && learnt.length) await env.DB.prepare("INSERT INTO driver_link_moves (game, account_id, oid, kind, row, created) VALUES (?1,?2,?3,'model',?4,?5)").bind(game, acct, oid, JSON.stringify(learnt.map((x) => ({ game: x.game, track_id: x.track_id, car_id: x.car_id, time: x.time }))), now).run();
  for (const c of combos2) {
    const [g, tr2, ca] = c.split("|");
    await mark(env, g, +tr2, +ca);
  }
  return { linked: true, moved: laps.length };
}
__name(linkDriver, "linkDriver");
async function unlinkDriver(env, acct, game, deps = {}) {
  const back = deps.moveDriverBack || moveDriverBack, mark = deps.markModel || markModel;
  const links = (await env.DB.prepare("SELECT game, oid FROM driver_links WHERE account_id=?1" + (game ? " AND game=?2" : "")).bind(...game ? [acct, game] : [acct]).all()).results || [];
  let restored = 0;
  for (const { game: g, oid } of links) {
    const moves = ((await env.DB.prepare("SELECT kind, row FROM driver_link_moves WHERE account_id=?1 AND game=?2 AND oid=?3 ORDER BY id").bind(acct, g, oid).all()).results || []).map((x) => {
      try {
        return { kind: x.kind, row: JSON.parse(x.row) };
      } catch (e) {
        return null;
      }
    }).filter(Boolean);
    const q2 = [], combos2 = /* @__PURE__ */ new Set();
    for (const { row } of moves.filter((x) => x.kind === "user")) q2.push(insertRow(env, "community_users", row));
    for (const { row } of moves.filter((x) => x.kind === "took")) {
      combos2.add(row.game + "|" + row.track_id + "|" + row.car_id);
      const now = await env.DB.prepare("SELECT user_id, time FROM community_laps WHERE id=?1").bind(row.id).first();
      if (now && now.user_id === acct && Math.abs(now.time - row.time) < 1e-6) q2.push(env.DB.prepare("UPDATE community_laps SET user_id=?2, anon=?3, shown=?4 WHERE id=?1").bind(row.id, row.user_id, row.anon ?? 0, row.shown ?? null));
      else q2.push(insertRow(env, "community_laps", now ? { ...row, id: rid4() } : row));
      restored++;
    }
    for (const { row } of moves.filter((x) => x.kind === "dropped")) {
      combos2.add(row.game + "|" + row.track_id + "|" + row.car_id);
      q2.push(insertRow(env, "community_laps", row));
      if (row.user_id === oid) restored++;
    }
    if (proofNeeded(g)) q2.push(env.DB.prepare("INSERT OR IGNORE INTO driver_link_seen (game, oid, account_id, day) VALUES (?1,?2,?3,?4)").bind(g, oid, acct, UNDONE));
    q2.push(env.DB.prepare("DELETE FROM driver_links WHERE account_id=?1 AND game=?2").bind(acct, g));
    q2.push(env.DB.prepare("DELETE FROM driver_link_moves WHERE account_id=?1 AND game=?2").bind(acct, g));
    q2.push(env.DB.prepare("UPDATE community_laps SET anon=1 WHERE user_id=?1").bind(oid));
    await env.DB.batch(q2);
    for (const { row } of moves.filter((x) => x.kind === "model")) await back(env, row, "acct:" + acct, "acct:" + oid);
    for (const c of combos2) {
      const [cg, tr2, ca] = c.split("|");
      await mark(env, cg, +tr2, +ca);
    }
  }
  return { unlinked: links.length, restored };
}
__name(unlinkDriver, "unlinkDriver");

// src/seasonseen.js
var MIN = 6e4;
var DAY = 864e5;
var SEEN_DAYS = 8;
var SEEN_PER_DAY = 60;
var name = /* @__PURE__ */ __name((v) => typeof v === "string" ? v.trim().slice(0, 80) : "", "name");
var id = /* @__PURE__ */ __name((v) => Number.isInteger(v) && v > 0 && v < 2 ** 31 ? v : 0, "id");
async function recordSeen(env, userId, body, now = Date.now()) {
  const sub = id(body.sub), season = id(body.season), series = id(body.series), track2 = id(body.track);
  const start = Math.round(Number(body.start) / MIN) * MIN;
  if (!sub || !season || !series || !track2 || !Number.isFinite(start)) return { error: "subsession, season, series, track and start are needed", status: 400 };
  if (start > now + 5 * MIN || start < now - 6 * 36e5) return { error: "only a race seen now can be reported", status: 400 };
  const n = await env.DB.prepare("SELECT COUNT(*) AS n FROM season_seen WHERE user_id=?1 AND at>?2").bind(userId, now - DAY).first();
  if (n && n.n >= SEEN_PER_DAY) return { error: "too many race starts today", status: 429 };
  const r2 = await env.DB.prepare("INSERT INTO season_seen (sub, season_id, series_id, track_id, track_name, track_cfg, car, start, user_id, at) VALUES (?1,?2,?3,?4,?5,?6,?7,?8,?9,?10) ON CONFLICT(sub) DO NOTHING").bind(sub, season, series, track2, name(body.trackName), name(body.trackConfig), name(body.car), start, userId, now).run();
  return { ok: true, kept: !!(r2.meta && r2.meta.changes) };
}
__name(recordSeen, "recordSeen");
async function seenSummary(env, now = Date.now()) {
  const r2 = await env.DB.prepare("SELECT season_id AS s, start AS t, COUNT(*) AS n, MAX(track_name) AS tn, MAX(track_cfg) AS tc, MAX(car) AS c FROM season_seen WHERE start>?1 GROUP BY season_id, start ORDER BY season_id, start").bind(now - SEEN_DAYS * DAY).all();
  const out = {};
  for (const x of r2.results || []) (out[x.s] ||= []).push([x.t, x.n, x.tn || "", x.tc || "", x.c || ""]);
  return out;
}
__name(seenSummary, "seenSummary");
async function pruneSeen(env, now = Date.now()) {
  await env.DB.prepare("DELETE FROM season_seen WHERE start<?1").bind(now - 14 * DAY).run();
}
__name(pruneSeen, "pruneSeen");

// src/games.js
var GAMES = ["iracing", "lmu", "acc", "ac"];
var gameOf = /* @__PURE__ */ __name((g) => GAMES.includes(g) ? g : "iracing", "gameOf");

// src/coachtips.js
var MIN_CASES = 30;
var MIN_RATINGS = 20;
var SAME_CORNER_M = 60;
var GAIN_S = 0.05;
var JSONH5 = { "content-type": "application/json; charset=utf-8", "cache-control": "no-store", "access-control-allow-origin": "*" };
var json7 = /* @__PURE__ */ __name((v, status = 200, h = {}) => new Response(JSON.stringify(v), { status, headers: { ...JSONH5, ...h } }), "json");
var err4 = /* @__PURE__ */ __name((msg, status) => json7({ error: msg }, status), "err");
var num = /* @__PURE__ */ __name((v) => typeof v === "number" && isFinite(v) ? v : null, "num");
var int = /* @__PURE__ */ __name((v) => Number.isInteger(v) && v > 0 && v < 1e12 ? v : null, "int");
var str = /* @__PURE__ */ __name((v, max = 40) => typeof v === "string" ? v.slice(0, max) : "", "str");
var KIND2 = /^[a-z_]{1,32}$/;
var CLS = { slow: 1, medium: 1, fast: 1 };
var REF = { level: 1, record: 1, own: 1, comm: 1 };
var r3 = /* @__PURE__ */ __name((v) => Math.round(v * 1e3) / 1e3, "r3");
var BRAKE_KINDS = ["brake_later", "brake_earlier", "brake_late_apex"];
var MIN_ASK = 10;
var MIN_PERSONAL = 10;
var HABIT_TRACKS = 3;
var FLAGS = { traffic: 1, cold: 1 };
var median2 = /* @__PURE__ */ __name((a) => {
  if (!a.length) return null;
  const v = a.slice().sort((x, y) => x - y);
  return v[v.length >> 1];
}, "median");
var flagsOf = /* @__PURE__ */ __name((f) => (Array.isArray(f) ? f.filter((x) => FLAGS[x]).slice(0, 4).join(",") : "") || null, "flagsOf");
function weightOf(b, rt) {
  let w = 1;
  if (b.n >= MIN_CASES) w = Math.min(1.3, Math.max(0.7, 0.8 + 0.4 * (b.win / b.n)));
  if (rt && rt.up + rt.down >= MIN_RATINGS && rt.down > 0.6 * (rt.up + rt.down)) w *= 0.85;
  return Math.round(Math.max(0.6, w) * 100) / 100;
}
__name(weightOf, "weightOf");
async function buckets(env, account) {
  const who2 = account ? " AND account=?2" : "";
  const b = await env.DB.prepare(
    `SELECT kind, cls, COUNT(*) AS n, SUM(outcome>?1) AS win, SUM(outcome<-?1) AS loss, AVG(outcome) AS avg
       FROM coach_tips WHERE outcome IS NOT NULL AND kind<>''${who2} GROUP BY kind, cls`
  ).bind(...account ? [GAIN_S, account] : [GAIN_S]).all();
  const t = await env.DB.prepare(`SELECT kind, SUM(rating=1) AS up, SUM(rating=-1) AS down FROM coach_tips WHERE rating<>0 AND kind<>''${account ? " AND account=?1" : ""} GROUP BY kind`).bind(...account ? [account] : []).all();
  const ratings = {};
  for (const x of t.results || []) ratings[x.kind] = { up: x.up || 0, down: x.down || 0 };
  const out = (b.results || []).map((x) => ({ kind: x.kind, cls: x.cls || "", n: x.n, win: x.win || 0, loss: x.loss || 0, avg: r3(x.avg || 0), w: weightOf(x, ratings[x.kind]) }));
  for (const [kind, rt] of Object.entries(ratings)) for (const cls of Object.keys(CLS)) if (!out.some((x) => x.kind === kind && x.cls === cls)) {
    const w = weightOf({ n: 0, win: 0 }, rt);
    if (w !== 1) out.push({ kind, cls, n: 0, win: 0, loss: 0, avg: 0, w });
  }
  if (!account) {
    const d = await env.DB.prepare(
      `SELECT kind, cls, dd, ddn FROM coach_tips WHERE outcome>?1 AND kind IN (${BRAKE_KINDS.map((k) => `'${k}'`).join(",")}) AND dd IS NOT NULL AND ddn IS NOT NULL`
    ).bind(GAIN_S).all();
    const moved = {};
    for (const x of d.results || []) {
      const k = x.kind + "|" + (x.cls || "");
      (moved[k] = moved[k] || []).push(Math.abs(x.ddn - x.dd));
    }
    for (const [k, a] of Object.entries(moved)) if (a.length >= MIN_ASK) {
      const [kind, cls] = k.split("|");
      let bk = out.find((x) => x.kind === kind && x.cls === cls);
      if (!bk) {
        bk = { kind, cls, n: 0, win: 0, loss: 0, avg: 0, w: 1 };
        out.push(bk);
      }
      bk.ask = Math.max(2, Math.round(median2(a)));
    }
  }
  return { buckets: out, ratings };
}
__name(buckets, "buckets");
async function offList(env) {
  const r2 = await env.DB.prepare("SELECT kind, cls FROM coach_off").all().catch(() => ({ results: [] }));
  return (r2.results || []).map((x) => x.kind + "|" + x.cls);
}
__name(offList, "offList");
async function confidenceOn(env) {
  const r2 = await env.DB.prepare("SELECT v FROM app_state WHERE k='coach_confidence'").first().catch(() => null);
  return !!(r2 && r2.v === "1");
}
__name(confidenceOn, "confidenceOn");
async function coachTipRoutes(req, env, p, m, body, game) {
  if (!p.startsWith("/coach/") && !p.startsWith("/admin/coach")) return null;
  const acc = await sessionAccount(req, env);
  if (!acc) return err4("sign in with your Pitlane HQ account", 401);
  if (p === "/coach/tips" && m === "POST") {
    const trackId = int(body.trackId), carId = int(body.carId) && await famId(env, game, body.carId), sid = str(body.sid, 120), started = int(body.started);
    const ref = REF[body.ref] ? body.ref : "own";
    if (!trackId || !carId || !sid || !started || !Array.isArray(body.corners)) return err4("trackId, carId, sid, started and corners", 400);
    const now = Date.now(), rows = [], flags = flagsOf(body.flags);
    for (const c of body.corners.slice(0, 40)) {
      const n = int(c.n), apex = num(c.apex);
      if (!n || apex == null) continue;
      const kind = KIND2.test(c.kind || "") ? c.kind : "";
      rows.push({ n, d: num(c.d), apex, kind, cls: CLS[c.cls] ? c.cls : "", lost: num(c.lost), ta: num(c.ta), tb: num(c.tb), tbest: num(c.tbest), dd: num(c.dd) });
    }
    if (!rows.length) return json7({ ok: true, kept: 0, scored: 0 });
    const ins = env.DB.prepare(
      `INSERT INTO coach_tips (account, game, track_id, car_id, session_id, started, n, d, apex, kind, cls, ref, lost, ta, tb, tbest, created, dd, flags)
       VALUES (?1,?2,?3,?4,?5,?6,?7,?8,?9,?10,?11,?12,?13,?14,?15,?16,?17,?18,?19)
       ON CONFLICT(account, session_id, n) DO UPDATE SET d=excluded.d, apex=excluded.apex, kind=excluded.kind, cls=excluded.cls, ref=excluded.ref,
         lost=excluded.lost, ta=excluded.ta, tb=excluded.tb, tbest=COALESCE(excluded.tbest, coach_tips.tbest), created=excluded.created, dd=excluded.dd, flags=excluded.flags`
    );
    await env.DB.batch(rows.map((c) => ins.bind(acc.id, game, trackId, carId, sid, started, c.n, c.d, c.apex, c.kind, c.cls, ref, c.lost, c.ta, c.tb, c.tbest, now, c.dd, flags)));
    const old = await env.DB.prepare(
      `SELECT id, apex, tbest FROM coach_tips WHERE account=?1 AND game=?2 AND track_id=?3 AND car_id=?4 AND started<?5 AND session_id<>?6
         AND outcome IS NULL AND kind<>'' AND tbest IS NOT NULL ORDER BY started DESC LIMIT 200`
    ).bind(acc.id, game, trackId, carId, started, sid).all();
    const upd = [];
    for (const o of old.results || []) {
      let best = null;
      for (const c of rows) if (c.tbest != null && Math.abs(c.apex - o.apex) <= SAME_CORNER_M && (!best || Math.abs(c.apex - o.apex) < Math.abs(best.apex - o.apex))) best = c;
      if (best) upd.push(env.DB.prepare("UPDATE coach_tips SET outcome=?2, outcome_at=?3, ddn=?4 WHERE id=?1").bind(o.id, r3(o.tbest - best.tbest), now, best.dd));
    }
    const later2 = await env.DB.prepare(
      `SELECT session_id FROM coach_tips WHERE account=?1 AND game=?2 AND track_id=?3 AND car_id=?4 AND started>?5 AND tbest IS NOT NULL ORDER BY started LIMIT 1`
    ).bind(acc.id, game, trackId, carId, started).first();
    if (later2) {
      const nx = await env.DB.prepare("SELECT apex, tbest, dd FROM coach_tips WHERE account=?1 AND session_id=?2 AND tbest IS NOT NULL").bind(acc.id, later2.session_id).all();
      for (const c of rows) {
        if (!c.kind || c.tbest == null) continue;
        let best = null;
        for (const o of nx.results || []) if (Math.abs(c.apex - o.apex) <= SAME_CORNER_M && (!best || Math.abs(o.apex - c.apex) < Math.abs(best.apex - c.apex))) best = o;
        if (best) upd.push(env.DB.prepare("UPDATE coach_tips SET outcome=?3, outcome_at=?4, ddn=?6 WHERE account=?1 AND session_id=?2 AND n=?5 AND outcome IS NULL").bind(acc.id, sid, r3(c.tbest - best.tbest), now, c.n, best.dd));
      }
    }
    if (upd.length) await env.DB.batch(upd);
    return json7({ ok: true, kept: rows.length, scored: upd.length });
  }
  if (p === "/coach/rate" && m === "POST") {
    const trackId = int(body.trackId), carId = int(body.carId) && await famId(env, game, body.carId), sid = str(body.sid, 120), started = int(body.started), n = int(body.n), apex = num(body.apex);
    if (!trackId || !carId || !sid || !started || !n || apex == null) return err4("trackId, carId, sid, started, n and apex", 400);
    const up = body.up === 1 ? 1 : body.up === -1 ? -1 : 0, kind = KIND2.test(body.kind || "") ? body.kind : "", cls = CLS[body.cls] ? body.cls : "";
    await env.DB.prepare(
      `INSERT INTO coach_tips (account, game, track_id, car_id, session_id, started, n, apex, kind, cls, rating, created) VALUES (?1,?2,?3,?4,?5,?6,?7,?8,?9,?10,?11,?12)
       ON CONFLICT(account, session_id, n) DO UPDATE SET rating=excluded.rating, kind=CASE WHEN coach_tips.kind='' THEN excluded.kind ELSE coach_tips.kind END, cls=CASE WHEN coach_tips.cls='' THEN excluded.cls ELSE coach_tips.cls END`
    ).bind(acc.id, game, trackId, carId, sid, started, n, apex, kind, cls, up, Date.now()).run();
    return json7({ ok: true });
  }
  if (p === "/coach/weights" && m === "GET") {
    const { buckets: b } = await buckets(env);
    return json7({ min: MIN_CASES, buckets: b.filter((x) => x.w !== 1 || x.ask || x.n >= MIN_CASES), off: await offList(env), confidence: await confidenceOn(env) }, 200, { "cache-control": "private, max-age=3600" });
  }
  if (p === "/coach/me" && m === "GET") {
    const h = await env.DB.prepare(
      `SELECT kind, COUNT(DISTINCT track_id||':'||car_id) AS tracks, COUNT(DISTINCT session_id) AS sessions, COUNT(*) AS n, SUM(outcome>?2) AS win, SUM(outcome<-?2) AS loss
         FROM coach_tips WHERE account=?1 AND kind<>'' GROUP BY kind ORDER BY tracks DESC, n DESC LIMIT 12`
    ).bind(acc.id, GAIN_S).all();
    const habits = (h.results || []).filter((x) => x.tracks >= HABIT_TRACKS).map((x) => ({ kind: x.kind, tracks: x.tracks, sessions: x.sessions, n: x.n, win: x.win || 0, loss: x.loss || 0 }));
    const { buckets: mine } = await buckets(env, acc.id);
    const w = {};
    for (const x of mine) if (x.n >= MIN_PERSONAL && x.w !== 1) w[x.kind + "|" + x.cls] = x.w;
    return json7({ habits, w, minTracks: HABIT_TRACKS }, 200, { "cache-control": "private, max-age=600" });
  }
  if (p === "/admin/coach/off" && m === "POST") {
    if (!isAdmin(env, acc.id)) return err4("only the admins of this server can do this", 403);
    const kind = KIND2.test(body.kind || "") ? body.kind : "", cls = CLS[body.cls] ? body.cls : "";
    if (!kind || !cls) return err4("kind and cls", 400);
    if (body.off) await env.DB.prepare("INSERT INTO coach_off (kind, cls, created) VALUES (?1,?2,?3) ON CONFLICT DO NOTHING").bind(kind, cls, Date.now()).run();
    else await env.DB.prepare("DELETE FROM coach_off WHERE kind=?1 AND cls=?2").bind(kind, cls).run();
    return json7({ ok: true, off: await offList(env) });
  }
  if (p === "/admin/coach/confidence" && m === "POST") {
    if (!isAdmin(env, acc.id)) return err4("only the admins of this server can do this", 403);
    await env.DB.prepare("INSERT INTO app_state (k, v, at) VALUES ('coach_confidence', ?1, ?2) ON CONFLICT(k) DO UPDATE SET v=excluded.v, at=excluded.at").bind(body.on ? "1" : "0", Date.now()).run();
    return json7({ ok: true, confidence: !!body.on });
  }
  if (p === "/admin/coach" && m === "GET") {
    if (!isAdmin(env, acc.id)) return err4("only the admins of this server can do this", 403);
    const { buckets: b, ratings } = await buckets(env);
    const tot = await env.DB.prepare(
      `SELECT COUNT(*) AS tips, SUM(kind<>'') AS withTip, SUM(outcome IS NOT NULL) AS scored, SUM(rating<>0) AS rated, COUNT(DISTINCT account) AS drivers,
         COUNT(DISTINCT track_id||':'||car_id) AS combos, SUM(created>?1) AS week FROM coach_tips`
    ).bind(Date.now() - 7 * 864e5).first();
    const kinds = await env.DB.prepare("SELECT kind, COUNT(*) AS n, SUM(outcome IS NOT NULL) AS scored FROM coach_tips WHERE kind<>'' GROUP BY kind ORDER BY n DESC").all();
    return json7({ min: MIN_CASES, gain: GAIN_S, totals: tot || {}, buckets: b, ratings, kinds: kinds.results || [], off: await offList(env), confidence: await confidenceOn(env) });
  }
  return null;
}
__name(coachTipRoutes, "coachTipRoutes");

// src/lmuapi.js
var JSONH6 = { "content-type": "application/json; charset=utf-8", "cache-control": "no-store" };
var json8 = /* @__PURE__ */ __name((v, status = 200) => new Response(JSON.stringify(v), { status, headers: JSONH6 }), "json");
var err5 = /* @__PURE__ */ __name((msg, status) => json8({ error: msg }, status), "err");
var LMU_BODY_MAX = 256 * 1024;
var RAW_MAX = 64 << 20;
var ITEMS_MAX = 400;
var VER = /^[A-Za-z0-9._ -]{1,64}$/;
var str2 = /* @__PURE__ */ __name((v, max) => typeof v === "string" ? v.slice(0, max) : "", "str");
var int2 = /* @__PURE__ */ __name((v) => Number.isFinite(+v) ? Math.max(-1, Math.min(2 ** 40, Math.round(+v))) : 0, "int");
async function readBody(req) {
  const ct = req.headers.get("content-type") || "";
  let stream = req.body;
  if (!stream) return null;
  if (/gzip/.test(ct) || req.headers.get("content-encoding") === "gzip") stream = stream.pipeThrough(new DecompressionStream("gzip"));
  const rd = stream.getReader(), parts = [];
  let n = 0;
  for (; ; ) {
    const { done, value } = await rd.read();
    if (done) break;
    n += value.length;
    if (n > RAW_MAX) {
      await rd.cancel().catch(() => {
      });
      throw new Error("too big");
    }
    parts.push(value);
  }
  const all = new Uint8Array(n);
  let o = 0;
  for (const p of parts) {
    all.set(p, o);
    o += p.length;
  }
  return JSON.parse(new TextDecoder().decode(all));
}
__name(readBody, "readBody");
function lmuRows(b) {
  const version = str2(b && b.version, 64);
  if (!VER.test(version) || !Array.isArray(b.items)) return null;
  const rows = [];
  for (const it of b.items.slice(0, ITEMS_MAX)) {
    const path = str2(it && it.path, 512);
    if (!path || !(path.startsWith("/") || path.startsWith("#"))) continue;
    rows.push({ path, status: int2(it.status), ctype: str2(it.ctype, 120), size: int2(it.size), ms: int2(it.ms), body: str2(it.body, LMU_BODY_MAX) });
  }
  return { version, build: int2(b.build), rows };
}
__name(lmuRows, "lmuRows");
async function lmuApiRoutes(req, env, p, m, url) {
  if (p !== "/admin/lmu-api" && p !== "/admin/lmu-api/item") return null;
  const acc = await sessionAccount(req, env);
  if (!acc || !isAdmin(env, acc.id)) return err5("only the admins of this server can do this", 403);
  if (p === "/admin/lmu-api" && m === "POST") {
    let b;
    try {
      b = await readBody(req);
    } catch (e) {
      return err5("unreadable upload", 400);
    }
    const up = lmuRows(b);
    if (!up) return err5("version and items", 400);
    const now = Date.now();
    const st = env.DB.prepare(`INSERT INTO lmu_api (account_id, at, game_version, path, status, ctype, size, ms, body) VALUES (?1,?2,?3,?4,?5,?6,?7,?8,?9)
      ON CONFLICT(account_id, game_version, path) DO UPDATE SET at=excluded.at, status=excluded.status, ctype=excluded.ctype, size=excluded.size, ms=excluded.ms, body=excluded.body`);
    for (let i = 0; i < up.rows.length; i += 50) {
      await env.DB.batch(up.rows.slice(i, i + 50).map((r2) => st.bind(acc.id, now, up.version, r2.path, r2.status, r2.ctype, r2.size, r2.ms, r2.body)));
    }
    return json8({ ok: true, version: up.version, stored: up.rows.length });
  }
  if (p === "/admin/lmu-api" && m === "GET") {
    const v = url.searchParams.get("version");
    if (!v) {
      const r4 = await env.DB.prepare("SELECT game_version AS version, COUNT(*) AS paths, SUM(status=200) AS ok, MAX(at) AS at, COUNT(DISTINCT account_id) AS accounts FROM lmu_api GROUP BY game_version ORDER BY MAX(at) DESC LIMIT 100").all();
      return json8({ versions: r4.results || [] });
    }
    const r2 = await env.DB.prepare("SELECT id, account_id AS account, at, game_version AS version, path, status, ctype, size, ms, LENGTH(body) AS kept FROM lmu_api WHERE game_version=?1 ORDER BY path LIMIT 5000").bind(v).all();
    return json8({ version: v, items: r2.results || [] });
  }
  if (p === "/admin/lmu-api/item" && m === "GET") {
    const id2 = +url.searchParams.get("id");
    if (!Number.isInteger(id2) || id2 <= 0) return err5("id", 400);
    const r2 = await env.DB.prepare("SELECT id, account_id AS account, at, game_version AS version, path, status, ctype, size, ms, body FROM lmu_api WHERE id=?1").bind(id2).first();
    return r2 ? json8(r2) : err5("not found", 404);
  }
  return err5("method", 405);
}
__name(lmuApiRoutes, "lmuApiRoutes");

// src/sessionsum.js
function base(game, uploader, secs) {
  return `SELECT started, kind, pos, field, pos_cls, track, track_config, car, laps, best,
    ${secs ? "secs" : "NULL"} AS secs,
    CASE WHEN LOWER(COALESCE(kind,'')) LIKE '%race%' THEN 1 ELSE 0 END AS race
  FROM sessions WHERE ${uploader ? "uploader=?3 AND " : ""}started>=?1 AND laps>0${game ? " AND game=?2" : ""}`;
}
__name(base, "base");
var summarySql = /* @__PURE__ */ __name((game, uploader) => `WITH s AS (${base(game, uploader, true)})
  SELECT COUNT(*) AS sessions, COALESCE(SUM(laps),0) AS laps,
    COALESCE(SUM(CASE WHEN secs>0 THEN secs WHEN best>0 AND best<3600 THEN laps*best*1.03 ELSE 0 END),0) AS secs,
    COUNT(DISTINCT CAST((started+?4)/86400000 AS INTEGER)) AS days,
    COALESCE(SUM(race),0) AS races,
    COALESCE(SUM(CASE WHEN race=1 AND pos BETWEEN 1 AND 5 THEN 1 ELSE 0 END),0) AS top5
  FROM s`, "summarySql");
var bestSql = /* @__PURE__ */ __name((game, uploader) => `WITH s AS (${base(game, uploader, false)}) SELECT pos, field, pos_cls, track, track_config, car, started FROM s
  WHERE race=1 AND pos>0 ORDER BY pos, started DESC LIMIT 1`, "bestSql");
var SUMS_OF = /* @__PURE__ */ __name((sid) => `(SELECT COUNT(*), MIN(CASE WHEN valid=1 AND drv IS NULL THEN time END),
       SUM(CASE WHEN time>0 AND time<3600 THEN time END), group_concat(DISTINCT drv) FROM laps WHERE session_id=${sid})`, "SUMS_OF");
var SESSION_SUMS = `UPDATE sessions SET (laps, best, secs, drvs)=${SUMS_OF("?1")} WHERE id=?1`;
var ALL_SESSION_SUMS = `UPDATE sessions SET (laps, best, secs, drvs)=${SUMS_OF("sessions.id")}`;
var TZ_MAX = 14 * 60;
function monthStart(now, tz) {
  const d = new Date(now + tz * 6e4);
  return Date.UTC(d.getUTCFullYear(), d.getUTCMonth(), 1) - tz * 6e4;
}
__name(monthStart, "monthStart");
async function sessionSummary(DB, { from, tz, game, uploader, now }) {
  now = now || Date.now();
  tz = Number.isFinite(+tz) ? Math.max(-TZ_MAX, Math.min(TZ_MAX, Math.round(+tz))) : 0;
  from = Number.isFinite(+from) && +from > 0 ? Math.round(+from) : monthStart(now, tz);
  game = game || null;
  uploader = uploader || null;
  const args = [from, game, uploader, tz * 6e4];
  const upTo = /* @__PURE__ */ __name((n2) => args.slice(0, n2), "upTo");
  const used = /* @__PURE__ */ __name((sql) => upTo(Math.max(...[...sql.matchAll(/\?(\d)/g)].map((m) => +m[1]))), "used");
  const sq = summarySql(game, uploader), bq = bestSql(game, uploader);
  const [r2, b] = await Promise.all([DB.prepare(sq).bind(...used(sq)).first(), DB.prepare(bq).bind(...used(bq)).first()]);
  const n = /* @__PURE__ */ __name((v) => +v || 0, "n");
  return {
    laps: n(r2 && r2.laps),
    secs: Math.round(n(r2 && r2.secs)),
    sessions: n(r2 && r2.sessions),
    days: n(r2 && r2.days),
    races: n(r2 && r2.races),
    top5: n(r2 && r2.top5),
    best: b ? { pos: b.pos, field: b.field || null, cls: b.pos_cls === 1, track: b.track, track_config: b.track_config || null, car: b.car, started: b.started } : null,
    from,
    at: now
  };
}
__name(sessionSummary, "sessionSummary");

// src/alertslib.js
var ALERT_DAYS = 30;
var ALERT_MAX = 20;
var WEEK = 7 * 864e5;
var PER_RUN2 = 100;
var L3 = /* @__PURE__ */ __name((l) => ["en", "es", "pt"].includes(l) ? l : "en", "L3");
var json9 = /* @__PURE__ */ __name((o, status = 200) => new Response(JSON.stringify(o), { status, headers: { "content-type": "application/json", "cache-control": "no-store" } }), "json");
var SQL_RECORD = "SELECT user_id, time FROM community_laps WHERE game=?1 AND track_id=?2 AND car_id=?3 AND COALESCE(shown,'')<>'model' ORDER BY time LIMIT 1";
var SQL_ACCOUNT_OF = "SELECT COALESCE(a.id, CASE WHEN u.id LIKE 'guest-%' THEN u.owner END) AS acc FROM community_users u LEFT JOIN accounts a ON a.id=u.id WHERE u.id=?1";
var SQL_ALIAS = "SELECT alias FROM community_users WHERE id=?1";
var SQL_ALERT_ADD = "INSERT INTO alerts (id, account_id, kind, created, data) VALUES (?1,?2,?3,?4,?5)";
var SQL_ALERTS = "SELECT id, kind, created, data FROM alerts WHERE account_id=?1 AND created>?2 ORDER BY created DESC LIMIT " + ALERT_MAX;
var SQL_ALERT_PRUNE = "DELETE FROM alerts WHERE created<?1";
var SQL_SUB_GET = "SELECT account_id FROM alert_subs WHERE account_id=?1";
var SQL_SUB_ON = "INSERT INTO alert_subs (account_id, lang) VALUES (?1,?2) ON CONFLICT(account_id) DO UPDATE SET lang=excluded.lang";
var SQL_SUB_OFF = "DELETE FROM alert_subs WHERE account_id=?1";
var SQL_DUE = "SELECT account_id, lang FROM alert_subs WHERE week_at IS NULL OR week_at<?1 LIMIT " + PER_RUN2;
var SQL_WEEK_DONE = "UPDATE alert_subs SET week_at=?2 WHERE account_id=?1";
var SQL_PBS = `SELECT s.track, s.track_config, s.car, MIN(s.best) AS b,
  (SELECT MIN(p.best) FROM sessions p WHERE p.uploader=?1 AND p.track=s.track AND COALESCE(p.track_config,'')=COALESCE(s.track_config,'') AND p.car=s.car AND p.started<?2 AND p.best>0) AS before
  FROM sessions s WHERE s.uploader=?1 AND s.started>=?2 AND s.best>0 GROUP BY s.track, s.track_config, s.car`;
var rid5 = /* @__PURE__ */ __name(() => crypto.randomUUID().replace(/-/g, "").slice(0, 20), "rid");
var pbsOf = /* @__PURE__ */ __name((rows) => (rows || []).filter((r2) => r2.before != null && r2.b < r2.before).sort((a, b) => b.before - b.b - (a.before - a.b)).slice(0, 3), "pbsOf");
function hm(secs) {
  const h = Math.floor(secs / 3600), m = Math.round(secs % 3600 / 60);
  return h ? `${h} h ${m} min` : `${m} min`;
}
__name(hm, "hm");
var W = {
  en: {
    title: "Your week in Pitlane HQ",
    line: /* @__PURE__ */ __name((s) => `${s.sessions} session${s.sessions === 1 ? "" : "s"}, ${s.laps} lap${s.laps === 1 ? "" : "s"} and ${hm(s.secs)} on track.`, "line"),
    races: /* @__PURE__ */ __name((s) => `${s.races} race${s.races === 1 ? "" : "s"}, ${s.top5} in the top 5.`, "races"),
    pb: /* @__PURE__ */ __name((n) => n === 1 ? "1 new personal best." : `${n} new personal bests.`, "pb")
  },
  es: {
    title: "Tu semana en Pitlane HQ",
    line: /* @__PURE__ */ __name((s) => `${s.sessions} sesi${s.sessions === 1 ? "\xF3n" : "ones"}, ${s.laps} vuelta${s.laps === 1 ? "" : "s"} y ${hm(s.secs)} en pista.`, "line"),
    races: /* @__PURE__ */ __name((s) => `${s.races} carrera${s.races === 1 ? "" : "s"}, ${s.top5} en el top 5.`, "races"),
    pb: /* @__PURE__ */ __name((n) => n === 1 ? "1 nuevo r\xE9cord personal." : `${n} nuevos r\xE9cords personales.`, "pb")
  },
  pt: {
    title: "Sua semana no Pitlane HQ",
    line: /* @__PURE__ */ __name((s) => `${s.sessions} sess${s.sessions === 1 ? "\xE3o" : "\xF5es"}, ${s.laps} volta${s.laps === 1 ? "" : "s"} e ${hm(s.secs)} na pista.`, "line"),
    races: /* @__PURE__ */ __name((s) => `${s.races} corrida${s.races === 1 ? "" : "s"}, ${s.top5} no top 5.`, "races"),
    pb: /* @__PURE__ */ __name((n) => n === 1 ? "1 novo recorde pessoal." : `${n} novos recordes pessoais.`, "pb")
  }
};
function weekNote(sum, pbs, l) {
  if (!sum || !sum.sessions) return null;
  const w = W[L3(l)], lines = [w.line(sum)];
  if (sum.races) lines.push(w.races(sum));
  if (pbs && pbs.length) lines.push(w.pb(pbs.length));
  return { title: w.title, text: lines.join(" ") };
}
__name(weekNote, "weekNote");
async function recordBeaten(env, uid, x, now = Date.now()) {
  if (x.shown === "model" || String(uid).startsWith("o:")) return null;
  const rec = await env.DB.prepare(SQL_RECORD).bind(x.game, x.trackId, x.carId).first();
  if (!rec || rec.user_id === uid || !(x.time < rec.time)) return null;
  const [was, by] = await Promise.all([env.DB.prepare(SQL_ACCOUNT_OF).bind(rec.user_id).first(), env.DB.prepare(SQL_ACCOUNT_OF).bind(uid).first()]);
  const acc = was && was.acc;
  if (!acc || by && by.acc === acc) return null;
  const who2 = x.anon ? null : await env.DB.prepare(SQL_ALIAS).bind(uid).first();
  const data = {
    game: x.game,
    trackId: x.trackId,
    carId: x.carId,
    track: String(x.track || "").slice(0, 80),
    car: String(x.car || "").slice(0, 80),
    time: x.time,
    was: rec.time,
    by: who2 && who2.alias || ""
  };
  await env.DB.prepare(SQL_ALERT_ADD).bind(rid5(), acc, "record_beaten", now, JSON.stringify(data)).run();
  return { account: acc, ...data };
}
__name(recordBeaten, "recordBeaten");
async function handleAlerts(req, env, url, { sessionAccount: sessionAccount2 }, now = Date.now()) {
  const p = url.pathname, m = req.method;
  if (p !== "/community/alerts" && p !== "/community/alerts/on") return null;
  const acc = await sessionAccount2(req, env);
  if (!acc) return json9({ error: "sign in with your Pitlane HQ account" }, 401);
  if (p === "/community/alerts" && m === "GET") {
    const since = Math.max(now - ALERT_DAYS * 864e5, +url.searchParams.get("since") || 0);
    const r2 = await env.DB.prepare(SQL_ALERTS).bind(acc.id, since).all();
    return json9({ now, alerts: (r2.results || []).map((a) => {
      let d = {};
      try {
        d = JSON.parse(a.data);
      } catch (e) {
      }
      return { ...d, id: a.id, kind: a.kind, created: a.created };
    }) });
  }
  if (p === "/community/alerts/on" && m === "GET") return json9({ on: !!await env.DB.prepare(SQL_SUB_GET).bind(acc.id).first() });
  if (p === "/community/alerts/on" && m === "POST") {
    const b = await req.json().catch(() => null) || {};
    if (b.on) await env.DB.prepare(SQL_SUB_ON).bind(acc.id, L3(String(b.lang || "").slice(0, 2))).run();
    else await env.DB.prepare(SQL_SUB_OFF).bind(acc.id).run();
    return json9({ on: !!b.on });
  }
  return json9({ error: "not found" }, 404);
}
__name(handleAlerts, "handleAlerts");
async function weeklyAlerts(env, { sessionSummary: sessionSummary2 }, now = Date.now()) {
  const due = (await env.DB.prepare(SQL_DUE).bind(now - 5 * 864e5).all()).results || [];
  let written = 0;
  for (const d of due) {
    try {
      const up = "acct:" + d.account_id, from = now - WEEK;
      const sum = await sessionSummary2(env.DB, { from, tz: 0, game: null, uploader: up, now });
      const note2 = sum && sum.sessions ? weekNote(sum, pbsOf((await env.DB.prepare(SQL_PBS).bind(up, from).all()).results || []), d.lang) : null;
      if (note2) {
        await env.DB.prepare(SQL_ALERT_ADD).bind(rid5(), d.account_id, "week", now, JSON.stringify(note2)).run();
        written++;
      }
    } catch (e) {
    }
    await env.DB.prepare(SQL_WEEK_DONE).bind(d.account_id, now).run();
  }
  return { due: due.length, written };
}
__name(weeklyAlerts, "weeklyAlerts");
var pruneAlerts = /* @__PURE__ */ __name((env, now = Date.now()) => env.DB.prepare(SQL_ALERT_PRUNE).bind(now - ALERT_DAYS * 864e5).run(), "pruneAlerts");

// src/alerts.js
var alertsRoute = /* @__PURE__ */ __name((req, env, url) => handleAlerts(req, env, url, { sessionAccount }), "alertsRoute");
var weeklyAlerts2 = /* @__PURE__ */ __name((env, now) => weeklyAlerts(env, { sessionSummary }, now), "weeklyAlerts");

// src/leaguescan.js
var FEEDS = [
  ["iRacing", "https://www.reddit.com/r/iRacing/new/.rss?limit=100", "iracing"],
  ["iRacingLeagues", "https://www.reddit.com/r/iRacingLeagues/new/.rss?limit=100", "iracing"],
  ["LeMansUltimateWEC", "https://www.reddit.com/r/LeMansUltimateWEC/new/.rss?limit=100", "lmu"],
  ["simracing", "https://www.reddit.com/r/simracing/new/.rss?limit=100", ""]
];
var LEAGUE_GAMES = ["iracing", "lmu"];
var leagueGame = /* @__PURE__ */ __name((g) => {
  const x = gameOf(String(g || "").toLowerCase());
  return LEAGUE_GAMES.includes(x) ? x : "iracing";
}, "leagueGame");
var LMU_RE = /le ?mans ultimate|\blmu\b/i;
var gameOfPost = /* @__PURE__ */ __name((t) => /iracing/i.test(t) ? "iracing" : LMU_RE.test(t) ? "lmu" : "", "gameOfPost");
var UA = "web:app.pitlanehq.leagues:v1.0 (+https://pitlanehq.app)";
var EVERY2 = 6 * 36e5;
var RETRY = 30 * 6e4;
var STUCK = 24 * 36e5;
var KEEP = 60 * 864e5;
var RECHECK = 6 * 36e5;
var MIN_ONLINE = 5;
var INVITE = /(?:discord\.gg|discord(?:app)?\.com\/invite)\/([A-Za-z0-9-]{2,32})/i;
var LEAGUE = /\b(leagues?|series|season|championship|endurance|cup|drivers? wanted|recruit\w*|looking for (?:new |more )?(?:drivers|racers)|join us|sign[- ]?ups?|open to all|all welcome)\b/i;
var NOT = /\blooking for an? (?:league|team|series)\b|\bbroadcast(?:ing)? your league\b/i;
var unesc = /* @__PURE__ */ __name((s) => String(s || "").replace(/&lt;/g, "<").replace(/&gt;/g, ">").replace(/&quot;/g, '"').replace(/&#39;/g, "'").replace(/&#x27;/g, "'").replace(/&amp;/g, "&"), "unesc");
var tag = /* @__PURE__ */ __name((e, t) => {
  const m = e.match(new RegExp(`<${t}[^>]*>([\\s\\S]*?)</${t}>`));
  return m ? m[1] : "";
}, "tag");
var DISC = [
  ["dirt_oval", /\bdirt (?:oval|late model|track)|sprint ?cars?|midgets?|modifieds? dirt|world of outlaws/i],
  ["dirt_road", /\brallycross|dirt road|\brx\b|pro ?[24] (?:lite|trucks?)|off[- ]road/i],
  ["oval", /\bnascar|\boval\b|\btrucks?\b|\barca\b|late models?|next gen|xfinity|cup series|superspeedway|indy ?500/i],
  ["formula_car", /\bf1\b|formula|\bf[34]\b|super formula|indycar|open[- ]wheel|skip barber|\bff1600|\bfr2\.0|dallara|\bsfl\b|lights/i],
  ["sports_car", /\bgt[34]\b|\bgte\b|\blmp\d?\b|\blmdh|\bgtp\b|porsche|mx-?5|\bbmw\b|ferrari|imsa|endurance|supercars?|\btcr\b|touring|multi-?class|gr86|supra|mustang|camaro|mercedes|audi|lamborghini|mclaren|aston/i]
];
var catsOf = /* @__PURE__ */ __name((t) => DISC.filter(([, re]) => re.test(t)).map(([k]) => k), "catsOf");
async function redditToken(env) {
  if (!env.REDDIT_CLIENT_ID || !env.REDDIT_CLIENT_SECRET) return "";
  const r2 = await fetch("https://www.reddit.com/api/v1/access_token", { method: "POST", headers: { "User-Agent": UA, Authorization: "Basic " + btoa(env.REDDIT_CLIENT_ID + ":" + env.REDDIT_CLIENT_SECRET), "Content-Type": "application/x-www-form-urlencoded" }, body: "grant_type=client_credentials" });
  return r2.ok ? (await r2.json()).access_token || "" : "";
}
__name(redditToken, "redditToken");
async function readFeed(sub, url, token) {
  if (token) {
    const r4 = await fetch(`https://oauth.reddit.com/r/${sub}/new?limit=100&raw_json=1`, { headers: { "User-Agent": UA, Authorization: "Bearer " + token } });
    if (!r4.ok) throw new Error(String(r4.status));
    return (((await r4.json()).data || {}).children || []).map(({ data: d }) => ({ id: "t3_" + d.id, title: String(d.title || "").slice(0, 200), body: (d.selftext || "") + " " + (d.url || ""), at: (d.created_utc || 0) * 1e3, link: "https://www.reddit.com" + (d.permalink || "") }));
  }
  const r2 = await fetch(url, { headers: { "User-Agent": UA, Accept: "application/atom+xml" } });
  if (!r2.ok) throw new Error(String(r2.status));
  const xml = await r2.text();
  return (xml.match(/<entry>[\s\S]*?<\/entry>/g) || []).map((e) => ({
    id: tag(e, "id"),
    title: unesc(tag(e, "title")).slice(0, 200),
    body: unesc(unesc(tag(e, "content"))),
    at: Date.parse(tag(e, "published")) || Date.now(),
    link: (e.match(/<link href="([^"]+)"/) || [])[1] || ""
  }));
}
__name(readFeed, "readFeed");
async function invite(code) {
  const r2 = await fetch(`https://discord.com/api/v10/invites/${encodeURIComponent(code)}?with_counts=true`, { headers: { "User-Agent": UA } });
  if (r2.status === 404) return { dead: true };
  if (!r2.ok) return null;
  const j = await r2.json();
  if (!j.guild || !j.guild.id) return { dead: true };
  return {
    guild: String(j.guild.id),
    name: String(j.guild.name || "").slice(0, 100),
    icon: j.guild.icon ? `https://cdn.discordapp.com/icons/${j.guild.id}/${j.guild.icon}.png?size=64` : "",
    members: +j.approximate_member_count || 0,
    online: +j.approximate_presence_count || 0
  };
}
__name(invite, "invite");
async function scanLeagues(env, force) {
  if (env.LOCAL === "1") return;
  const now = Date.now(), st = /* @__PURE__ */ __name(async (sub) => {
    try {
      const r2 = await env.DB.prepare("SELECT v FROM app_state WHERE k=?1").bind("lg_feed_" + sub).first();
      return JSON.parse(r2 && r2.v || "{}");
    } catch (e) {
      return {};
    }
  }, "st");
  const save = /* @__PURE__ */ __name((sub, o) => env.DB.prepare("INSERT INTO app_state (k, v, at) VALUES (?1, ?2, ?3) ON CONFLICT(k) DO UPDATE SET v=?2, at=?3").bind("lg_feed_" + sub, JSON.stringify(o), now).run(), "save");
  const due = [];
  for (const [sub, url, game] of FEEDS) {
    const f = await st(sub);
    if (force || now - (f.ok || 0) >= EVERY2 && now - (f.fail || 0) >= RETRY) due.push([sub, url, f, game]);
  }
  const lastScan = await env.DB.prepare("SELECT at FROM app_state WHERE k='leagues_scan'").first().catch(() => null);
  if (!due.length && !force && lastScan && now - lastScan.at < EVERY2) return;
  let read = 0, found = 0, okAny = false;
  const token = due.length ? await redditToken(env).catch(() => "") : "";
  for (const [sub, url, f, feedGame] of due) {
    if (read) await new Promise((r2) => setTimeout(r2, 2e3));
    let posts = [];
    try {
      posts = await readFeed(sub, url, token);
    } catch (e) {
      await save(sub, { ...f, fail: now, err: e.message, since: f.since || now });
      continue;
    }
    await save(sub, { ok: now });
    okAny = true;
    for (const { id: id2, title, body, at: at2, link } of posts) {
      read++;
      if (!id2) continue;
      const m = (title + " " + body).match(INVITE);
      if (!m || !LEAGUE.test(title + " " + body.slice(0, 1500)) || NOT.test(title)) continue;
      const game = feedGame || gameOfPost(title + " " + body);
      if (!game) continue;
      const seen2 = await env.DB.prepare("SELECT 1 FROM league_found_posts WHERE id=?1").bind(id2).first();
      if (seen2) continue;
      const code = m[1], known = await env.DB.prepare("SELECT guild FROM league_found WHERE code=?1").bind(code).first();
      let guild = known && known.guild, info = null;
      if (!guild) {
        info = await invite(code).catch(() => null);
        if (!info) continue;
        if (info.dead) {
          await env.DB.prepare("INSERT OR IGNORE INTO league_found_posts (id, guild, at) VALUES (?1, '', ?2)").bind(id2, at2).run();
          continue;
        }
        guild = info.guild;
      }
      const cats = JSON.stringify(game === "lmu" ? ["sports_car"] : catsOf(title + " " + body.slice(0, 2e3)));
      await env.DB.batch([
        env.DB.prepare("INSERT OR IGNORE INTO league_found_posts (id, guild, at) VALUES (?1, ?2, ?3)").bind(id2, guild, at2),
        // a league already found keeps its game (the subreddit it was found in first)
        env.DB.prepare(`INSERT INTO league_found (guild, code, name, icon, title, url, sub, posted, first, posts, members, online, cats, checked, game)
          VALUES (?1, ?2, ?3, ?4, ?5, ?6, ?7, ?8, ?8, 1, ?9, ?10, ?11, ?12, ?13)
          ON CONFLICT(guild) DO UPDATE SET posts=posts+1, dead=0, code=CASE WHEN ?8>=COALESCE(posted,0) THEN ?2 ELSE code END,
            title=CASE WHEN ?8>=COALESCE(posted,0) THEN ?5 ELSE title END, url=CASE WHEN ?8>=COALESCE(posted,0) THEN ?6 ELSE url END,
            sub=CASE WHEN ?8>=COALESCE(posted,0) THEN ?7 ELSE sub END, posted=MAX(COALESCE(posted,0), ?8), first=MIN(COALESCE(first,?8), ?8),
            cats=CASE WHEN cats IS NULL OR cats='[]' THEN ?11 ELSE cats END`).bind(guild, code, info ? info.name : null, info ? info.icon : null, title, link, sub, at2, info ? info.members : null, info ? info.online : null, cats, info ? now : null, game)
      ]);
      found++;
    }
  }
  const stale = (await env.DB.prepare("SELECT guild, code FROM league_found WHERE dead=0 AND (checked IS NULL OR checked<?1) ORDER BY COALESCE(checked,0) ASC LIMIT 40").bind(now - RECHECK).all()).results || [];
  for (const x of stale) {
    const info = await invite(x.code).catch(() => null);
    if (!info) continue;
    if (info.dead) await env.DB.prepare("UPDATE league_found SET dead=1, checked=?2 WHERE guild=?1").bind(x.guild, now).run();
    else await env.DB.prepare("UPDATE league_found SET name=?2, icon=?3, members=?4, online=?5, checked=?6 WHERE guild=?1").bind(x.guild, info.name, info.icon, info.members, info.online, now).run();
  }
  await env.DB.prepare("DELETE FROM league_found_posts WHERE at<?1").bind(now - 2 * KEEP).run();
  if (okAny || stale.length || !lastScan) await env.DB.prepare("INSERT INTO app_state (k, v, at) VALUES ('leagues_scan', ?1, ?2) ON CONFLICT(k) DO UPDATE SET v=?1, at=?2").bind(JSON.stringify({ read, found, checked: stale.length }), now).run();
}
__name(scanLeagues, "scanLeagues");
async function addFound(env, link, game) {
  const g = leagueGame(game);
  const m = String(link || "").match(INVITE) || String(link || "").match(/^([A-Za-z0-9-]{2,32})$/);
  if (!m) return { error: "not a Discord invite" };
  const info = await invite(m[1]).catch(() => null);
  if (!info) return { error: "Discord did not answer, try again" };
  if (info.dead) return { error: "this invite does not work" };
  const now = Date.now();
  await env.DB.prepare(`INSERT INTO league_found (guild, code, name, icon, title, url, sub, posted, first, posts, members, online, cats, checked, dead, hidden, game)
    VALUES (?1, ?2, ?3, ?4, '', '', 'manual', ?5, ?5, 0, ?6, ?7, ?9, ?5, 0, 0, ?8)
    ON CONFLICT(guild) DO UPDATE SET code=?2, name=?3, icon=?4, sub='manual', members=?6, online=?7, checked=?5, dead=0, hidden=0, game=?8`).bind(info.guild, m[1], info.name, info.icon, now, info.members, info.online, g, g === "lmu" ? '["sports_car"]' : "[]").run();
  return { ok: true, name: info.name, game: g };
}
__name(addFound, "addFound");
var editOf = /* @__PURE__ */ __name((x) => {
  try {
    return JSON.parse(x.edit || "{}") || {};
  } catch (e) {
    return {};
  }
}, "editOf");
var FOUND_CATS = ["oval", "sports_car", "formula_car", "dirt_oval", "dirt_road"];
async function editFound(env, guild, e) {
  let v = null;
  if (e) {
    const o = {}, name2 = String(e.name || "").trim().slice(0, 80), title = e.title == null ? null : String(e.title).trim().slice(0, 240);
    if (name2) o.name = name2;
    if (title != null) o.title = title;
    if (Array.isArray(e.cats)) o.cats = [...new Set(e.cats.filter((c) => FOUND_CATS.includes(c)))];
    v = JSON.stringify(o);
  }
  const r2 = await env.DB.prepare("UPDATE league_found SET edit=?2 WHERE guild=?1").bind(guild, v).run();
  return !!(r2.meta && r2.meta.changes);
}
__name(editFound, "editFound");
async function foundLeagues(env, admin, game) {
  const g = leagueGame(game);
  const now = Date.now();
  const st = await env.DB.prepare("SELECT v, at FROM app_state WHERE k='leagues_scan'").first().catch(() => null);
  const rows = (await env.DB.prepare(`SELECT * FROM league_found WHERE game=?2 AND dead=0 AND (sub='manual' OR online>=?1) ${admin ? "" : "AND hidden=0"}
    ORDER BY online DESC, members DESC LIMIT 60`).bind(MIN_ONLINE, g).all()).results || [];
  let info = {};
  try {
    info = JSON.parse(st && st.v || "{}");
  } catch (e) {
  }
  const errs = [];
  if (admin) for (const [sub, , fg] of FEEDS) {
    if (fg && fg !== g) continue;
    const r2 = await env.DB.prepare("SELECT v FROM app_state WHERE k=?1").bind("lg_feed_" + sub).first().catch(() => null);
    let f = {};
    try {
      f = JSON.parse(r2 && r2.v || "{}");
    } catch (e) {
    }
    if (f.fail && now - (f.since || f.fail) > STUCK) errs.push(`r/${sub} ${f.err || ""}`.trim());
  }
  return {
    game: g,
    updated: st ? st.at : 0,
    read: info.read || 0,
    errs: admin ? errs : void 0,
    leagues: rows.map((x) => {
      const e = editOf(x), cats = (() => {
        try {
          return JSON.parse(x.cats || "[]");
        } catch (er) {
          return [];
        }
      })();
      return {
        guild: x.guild,
        name: e.name || x.name || "",
        icon: x.icon || "",
        invite: "https://discord.gg/" + x.code,
        title: e.title != null ? e.title : x.title || "",
        url: x.url || "",
        sub: x.sub || "",
        posted: x.posted,
        posts: x.posts,
        members: x.members || 0,
        online: x.online || 0,
        cats: e.cats || cats,
        game: x.game || "iracing",
        checked: x.checked,
        hidden: admin ? !!x.hidden : void 0,
        edited: admin ? !!x.edit : void 0
      };
    })
  };
}
__name(foundLeagues, "foundLeagues");

// src/lmuclass.js
var NAMED = [
  [/hyper/i, "Hypercar"],
  [/lmp\s*2/i, "LMP2"],
  [/lmp\s*3/i, "LMP3"],
  [/gte/i, "LMGTE"],
  [/gt3/i, "LMGT3"]
];
var BY_CAR = [
  [/gt3/i, "LMGT3"],
  [/gte|rsr|c8\.r|vantage amr/i, "LMGTE"],
  [/499p|963|gr010|9x8|v-series\.r|m hybrid|a424|sc63|scg ?007|vanwall|vandervell|isotta|tipo ?6|valkyrie|hypercar|lmdh|lmh/i, "Hypercar"],
  [/oreca|lmp2/i, "LMP2"],
  [/ligier|ginetta|duqueine|lmp3/i, "LMP3"]
];
function lmuClass(raw, car) {
  const r2 = String(raw || "").trim();
  for (const [re, n] of NAMED) if (re.test(r2)) return n;
  const c = String(car || "");
  for (const [re, n] of BY_CAR) if (re.test(c)) return n;
  const own = r2.replace(/[^A-Za-z0-9 ]/g, " ").replace(/\s+/g, " ").trim().slice(0, 16);
  return own || null;
}
__name(lmuClass, "lmuClass");
function wetOf(flags) {
  if (!Array.isArray(flags)) return null;
  const w = (flags.includes("wet") ? 2 : flags.includes("damp") ? 4 : 0) | (flags.includes("rain") ? 1 : 0);
  return w || null;
}
__name(wetOf, "wetOf");
var clsParam = /* @__PURE__ */ __name((v) => {
  const s = String(v || "").trim();
  return /^[A-Za-z0-9 ]{1,16}$/.test(s) ? s : null;
}, "clsParam");
async function classLaps(env, trackId, cls, opts = {}) {
  const r2 = await env.DB.prepare(
    `WITH b AS (SELECT l.*, ROW_NUMBER() OVER (PARTITION BY l.user_id ORDER BY l.time) AS rk
         FROM community_laps l WHERE l.game='lmu' AND l.track_id=?1 AND l.cls=?2 AND COALESCE(l.shown,'')<>'model')
     SELECT l.id, l.user_id AS uid, CASE WHEN l.anon=1${opts.rivals ? " AND l.user_id NOT LIKE 'o:%'" : ""} THEN 'Anonymous' WHEN l.shown='iracing' AND COALESCE(u.iracing,'')<>'' THEN u.iracing ELSE u.alias END AS alias,
       l.time, l.sectors, l.created, (l.trace IS NOT NULL OR ${opts.acctTrace || "0"}) AS hasTrace, l.car, l.car_id AS carId, l.track, l.lic, l.wet, l.cls,
       (${opts.admin ? "ac.id IS NOT NULL OR " : ""}(l.anon=0 AND ac.id IS NOT NULL AND COALESCE(ac.anon,0)=0)) AS prof, (l.anon=0 AND COALESCE(ac.supporter,0)=1 AND COALESCE(ac.supporter_hidden,0)=0) AS sup
     FROM b l JOIN community_users u ON u.id=l.user_id LEFT JOIN accounts ac ON ac.id=l.user_id
     WHERE l.rk=1 ORDER BY l.time LIMIT 200`
  ).bind(trackId, cls).all();
  return r2.results || [];
}
__name(classLaps, "classLaps");

// src/community.js
var JSONH7 = { "content-type": "application/json; charset=utf-8", "cache-control": "no-store", "access-control-allow-origin": "*" };
var json10 = /* @__PURE__ */ __name((v, status = 200) => new Response(JSON.stringify(v), { status, headers: JSONH7 }), "json");
var err6 = /* @__PURE__ */ __name((msg, status) => json10({ error: msg }, status), "err");
var str3 = /* @__PURE__ */ __name((v, max = 120) => typeof v === "string" ? v.slice(0, max) : v == null ? null : String(v).slice(0, max), "str");
var num2 = /* @__PURE__ */ __name((v) => typeof v === "number" && isFinite(v) ? v : null, "num");
var int3 = /* @__PURE__ */ __name((v) => Number.isInteger(v) && v > 0 && v < 1e9 ? v : null, "int");
var rid6 = /* @__PURE__ */ __name(() => [...crypto.getRandomValues(new Uint8Array(12))].map((x) => x.toString(16).padStart(2, "0")).join(""), "rid");
var SHARES_TRACES = "EXISTS (SELECT 1 FROM community_laps c2 WHERE c2.user_id=?1 AND c2.trace IS NOT NULL)";
var ACCT_TRACE_WHERE = `s.uploader='acct:'||?1 AND ABS(a.time-?2)<0.002 AND s.game=?3 AND a.valid=1 AND a.trace IS NOT NULL AND ${SHARES_TRACES}`;
var ACCT_TRACE = `(EXISTS (SELECT 1 FROM laps a JOIN sessions s ON s.id=a.session_id WHERE s.uploader='acct:'||l.user_id AND ABS(a.time-l.time)<0.002 AND s.game=l.game AND a.valid=1 AND a.trace IS NOT NULL)
  AND EXISTS (SELECT 1 FROM community_laps c2 WHERE c2.user_id=l.user_id AND c2.trace IS NOT NULL))`;
async function sha2562(t) {
  const b = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(t));
  return [...new Uint8Array(b)].map((x) => x.toString(16).padStart(2, "0")).join("");
}
__name(sha2562, "sha256");
var cleanAlias = /* @__PURE__ */ __name((a) => (str3(a, 32) || "").replace(/[\u0000-\u001f<>]/g, "").trim() || "Driver", "cleanAlias");
async function me(req, env) {
  const a = await sessionAccount(req, env);
  if (a) {
    const u = await env.DB.prepare("SELECT id, alias, uploads_day, uploads FROM community_users WHERE id=?1").bind(a.id).first();
    return u ? { ...u, account: true } : null;
  }
  const h = req.headers.get("authorization") || "";
  const t = h.startsWith("Bearer ") ? h.slice(7).trim() : "";
  if (t.length < 20) return null;
  return env.DB.prepare("SELECT id, alias, uploads_day, uploads FROM community_users WHERE token_hash=?1").bind(await sha2562(t)).first();
}
__name(me, "me");
var seesRivals = /* @__PURE__ */ __name((req, env, who2) => !!who2 && isAdmin(env, who2.id) && req.headers.get("x-pitlane-admin") === "1", "seesRivals");
var shownName = /* @__PURE__ */ __name((l, u, rivals) => `CASE WHEN ${l}.anon=1${rivals ? ` AND ${l}.user_id NOT LIKE 'o:%'` : ""} THEN 'Anonymous' WHEN ${l}.shown='iracing' AND COALESCE(${u}.iracing,'')<>'' THEN ${u}.iracing ELSE ${u}.alias END`, "shownName");
var CAR_RE = /^[A-Za-z0-9 _.\-]{1,80}$/;
var cleanFile = /* @__PURE__ */ __name((n) => (typeof n === "string" ? n : "").replace(/[^A-Za-z0-9 _\-()+.,]/g, "").replace(/^[ .]+|[ .]+$/g, "").slice(0, 60) || "setup", "cleanFile");
async function countUpload(env, u) {
  const day4 = (/* @__PURE__ */ new Date()).toISOString().slice(0, 10);
  const n = u.uploads_day === day4 ? u.uploads + 1 : 1;
  if (n > 300) return false;
  await env.DB.prepare("UPDATE community_users SET uploads_day=?2, uploads=?3 WHERE id=?1").bind(u.id, day4, n).run();
  return true;
}
__name(countUpload, "countUpload");
var LEAGUES_FREE = 3;
var LEAGUES_SUPPORTER = 10;
var isTestDrive = /* @__PURE__ */ __name((kind) => /test/i.test(String(kind || "")), "isTestDrive");
var officialOf = /* @__PURE__ */ __name((v) => typeof v === "boolean" ? v ? 1 : 0 : v === 1 || v === 0 ? v : null, "officialOf");
async function otherId(env, key) {
  return "o:" + (await sha2562("other|" + (env.DATA_KEY || "") + "|" + String(key).toLowerCase())).slice(0, 24);
}
__name(otherId, "otherId");
function driverName(v) {
  const w = String(v || "").normalize("NFC").split(/\s+/).map((x) => x.replace(/[^\p{L}\p{N}'.-]/gu, "")).filter(Boolean);
  if (!w.length || /^anonym/i.test(w[0])) return "";
  return [...w.join(" ")].slice(0, 48).join("");
}
__name(driverName, "driverName");
function shortDriverName(v) {
  const w = String(v || "").normalize("NFC").split(/\s+/).map((x) => x.replace(/[^\p{L}\p{N}'.-]/gu, "")).filter(Boolean);
  if (!w.length) return "";
  const first = [...w[0]].slice(0, 20).join("").replace(/\.$/, "");
  if (!first || /^anonym/i.test(first)) return "";
  if (w.length === 1) return first;
  const ini = [...w[w.length - 1]].find((c) => /[\p{L}\p{N}]/u.test(c));
  return ini ? first + " " + ini.toUpperCase() + "." : first;
}
__name(shortDriverName, "shortDriverName");
async function sealedWet(env, trace) {
  if (!trace) return null;
  try {
    const tr2 = JSON.parse(await openData(env, trace));
    return wetOf(tr2 && tr2.f);
  } catch {
    return null;
  }
}
__name(sealedWet, "sealedWet");
async function keepBestLap(env, uid, x) {
  x = { ...x, carId: await noteCar(env, x.game, x.carId, x.car) };
  const old = await env.DB.prepare("SELECT time, game, trace IS NOT NULL AS traced FROM community_laps WHERE user_id=?1 AND car_id=?2 AND track_id=?3").bind(uid, x.carId, x.trackId).first();
  if (old && old.game === x.game && old.time <= x.time && (old.traced || !x.trace)) return { kept: true, traced: !!old.traced };
  if (x.count && !await x.count()) return { limit: true };
  await recordBeaten(env, uid, x).catch(() => {
  });
  const cls = x.game === "lmu" ? lmuClass(x.cls, x.car) : null;
  const wet = x.wet !== void 0 ? x.wet : await sealedWet(env, x.trace);
  await env.DB.prepare(
    `INSERT INTO community_laps (id, user_id, car_id, car, track_id, track, time, sectors, trace, created, anon, game, shown, lic, cat, official, ai, cls, wet) VALUES (?1,?2,?3,?4,?5,?6,?7,?8,?9,?10,?11,?12,?13,?14,?15,?16,?17,?18,?19)
     ON CONFLICT(user_id, car_id, track_id) DO UPDATE SET time=excluded.time, sectors=excluded.sectors, trace=excluded.trace, created=excluded.created, car=excluded.car, track=excluded.track, anon=excluded.anon, game=excluded.game, shown=excluded.shown,
       lic=COALESCE(excluded.lic, community_laps.lic), cat=COALESCE(excluded.cat, community_laps.cat), official=excluded.official, ai=excluded.ai, cls=COALESCE(excluded.cls, community_laps.cls), wet=excluded.wet`
  ).bind(rid6(), uid, x.carId, str3(x.car), x.trackId, str3(x.track), x.time, x.sectors || null, x.trace || null, Date.now(), x.anon ? 1 : 0, x.game, x.shown || "nick", licOf(x.lic), str3(x.cat, 20), officialOf(x.official), x.ai ? 1 : null, cls, wet ?? null).run();
  await markModel(env, x.game, x.trackId, x.carId);
  const improved = !old || old.game !== x.game || x.time < old.time;
  const res = { shared: true, traced: !!x.trace, improved, prev: old && old.game === x.game ? old.time : null, game: x.game, trackId: x.trackId, carId: x.carId, track: x.track, car: x.car, time: x.time, anon: !!x.anon };
  if (improved && x.ctx) x.ctx.waitUntil(discordLapAlert(env, uid, res).catch(() => {
  }));
  return res;
}
__name(keepBestLap, "keepBestLap");
async function comboIds(env, s, name2, g, uid, body) {
  let trackId = s.track_id, carId = s.car_id;
  if (!trackId && int3(body && body.trackId)) trackId = int3(body.trackId);
  if (!carId && int3(body && body.carId)) carId = int3(body.carId);
  if (!trackId || !carId) {
    const x = await env.DB.prepare("SELECT track_id, car_id FROM community_laps WHERE (lower(track)=lower(?1) OR lower(track)=lower(?2)) AND lower(car)=lower(?3) AND game=?4 ORDER BY (track_id<900000000) DESC LIMIT 1").bind(name2, s.track, s.car, g).first() || await env.DB.prepare("SELECT track_id, car_id FROM community_reports WHERE (lower(track)=lower(?1) OR lower(track)=lower(?2)) AND lower(car)=lower(?3) AND game=?4 AND track_id>0 AND car_id>0 ORDER BY (track_id<900000000) DESC LIMIT 1").bind(name2, s.track, s.car, g).first();
    if (x) {
      trackId = trackId || x.track_id;
      carId = carId || x.car_id;
    }
  }
  if (!trackId) {
    const t = await env.DB.prepare("SELECT track_id FROM community_laps WHERE (track=?1 OR track=?2) AND game=?3 LIMIT 1").bind(name2, s.track, g).first() || await env.DB.prepare("SELECT track_id FROM track_maps WHERE (track=?1 OR track=?2) AND game=?3 LIMIT 1").bind(name2, s.track, g).first();
    if (t) trackId = t.track_id;
  }
  if (!carId) {
    const c = await env.DB.prepare("SELECT car_id FROM community_laps WHERE car=?1 AND game=?2 LIMIT 1").bind(s.car, g).first();
    if (c) carId = c.car_id;
  }
  if (!trackId || !carId) {
    const o = await env.DB.prepare("SELECT track_id, car_id FROM sessions WHERE game=?1 AND lower(car)=lower(?2) AND (lower(track)=lower(?3) OR lower(track||' \xB7 '||COALESCE(track_config,''))=lower(?4)) AND track_id>0 AND car_id>0 ORDER BY (uploader=?5) DESC, started DESC LIMIT 1").bind(g, s.car, s.track, name2, "acct:" + uid).first();
    if (o) {
      trackId = trackId || o.track_id;
      carId = carId || o.car_id;
    }
  }
  if (!trackId) trackId = await pseudoId("t", g, name2);
  if (!carId) carId = await pseudoId("c", g, s.car);
  if (!s.track_id || !s.car_id) await env.DB.prepare("UPDATE sessions SET track_id=COALESCE(track_id,?2), car_id=COALESCE(car_id,?3) WHERE id=?1").bind(s.id, trackId, carId).run();
  return { trackId, carId };
}
__name(comboIds, "comboIds");
async function autoShare(env, accountId, sessionId, laps, hint, ctx) {
  const ok = new Set(((await env.DB.prepare("SELECT id FROM laps WHERE session_id=?1 AND valid=1 AND drv IS NULL").bind(sessionId).all()).results || []).map((r2) => String(r2.id)));
  const best = (laps || []).filter((l) => l && ok.has(String(l.id)) && !(typeof l.drv === "string" && l.drv.trim()) && num2(l.time) > 10 && l.time < 3600).sort((a, b) => a.time - b.time || (b.trace ? 1 : 0) - (a.trace ? 1 : 0))[0];
  if (!best) return null;
  const acc = await env.DB.prepare("SELECT a.anon, a.name_kind FROM accounts a JOIN community_users u ON u.id=a.id WHERE a.id=?1").bind(accountId).first();
  const s = await env.DB.prepare("SELECT * FROM sessions WHERE id=?1 AND uploader=?2").bind(sessionId, "acct:" + accountId).first();
  const lap = await env.DB.prepare("SELECT time, sectors, trace FROM laps WHERE id=?1 AND session_id=?2 AND valid=1 AND drv IS NULL").bind(String(best.id), sessionId).first();
  if (!acc || !s || !lap || isTestDrive(s.kind)) return null;
  const g = s.game || "iracing", name2 = s.track + (s.track_config ? " \xB7 " + s.track_config : "");
  const { trackId, carId } = await comboIds(env, s, name2, g, accountId, hint);
  if (g === "iracing" && licOf(hint && hint.lic) && !(hint && hint.imported)) await rememberLic(env, accountId, catOf(await catMap(env), trackId, carId, hint && hint.cat, name2, s.car), hint.lic).catch(() => {
  });
  return keepBestLap(env, accountId, { game: g, carId, trackId, car: s.car, track: name2, time: lap.time, sectors: lap.sectors, trace: lap.trace, anon: !!acc.anon, shown: acc.name_kind === "iracing" ? "iracing" : "nick", lic: hint && hint.lic, cat: hint && hint.cat, official: s.official, ai: s.ai === 1, ctx });
}
__name(autoShare, "autoShare");
async function unshareInvalid(env, accountId, sid) {
  const s = await env.DB.prepare("SELECT * FROM sessions WHERE id=?1 AND uploader=?2").bind(sid, "acct:" + accountId).first();
  if (!s) return;
  const bad = (await env.DB.prepare("SELECT time FROM laps WHERE session_id=?1 AND valid=0 AND time>0").bind(sid).all()).results || [];
  const g = s.game || "iracing", name2 = s.track + (s.track_config ? " \xB7 " + s.track_config : "");
  const { trackId, carId } = await comboIds(env, s, name2, g, accountId, null);
  if (!trackId || !carId) return;
  const fam = await famId(env, g, carId);
  for (const b of bad) {
    await env.DB.prepare("DELETE FROM community_laps WHERE user_id=?1 AND car_id=?2 AND track_id=?3 AND game=?4 AND abs(time-?5)<0.0006").bind(accountId, fam, trackId, g, b.time).run();
    await forgetLap(env, g, trackId, carId, "acct:" + accountId, b.time);
  }
  await reshareSession(env, accountId, sid);
}
__name(unshareInvalid, "unshareInvalid");
async function reshareSession(env, accountId, sid) {
  const s = await env.DB.prepare("SELECT * FROM sessions WHERE id=?1 AND uploader=?2").bind(sid, "acct:" + accountId).first();
  if (!s || isTestDrive(s.kind)) return;
  const g = s.game || "iracing", name2 = s.track + (s.track_config ? " \xB7 " + s.track_config : "");
  const { trackId, carId } = await comboIds(env, s, name2, g, accountId, null);
  if (!trackId || !carId) return;
  const acc = await env.DB.prepare("SELECT anon, name_kind FROM accounts WHERE id=?1").bind(accountId).first();
  if (!acc) return;
  const key = /* @__PURE__ */ __name((d) => String(d || "").trim().toLowerCase(), "key");
  const here = (await env.DB.prepare("SELECT time, COALESCE(drv,'') AS drv FROM laps WHERE session_id=?1 AND valid=1").bind(sid).all()).results || [];
  const all = (await env.DB.prepare(`SELECT l.time, l.sectors, l.trace, COALESCE(l.drv,'') AS drv FROM laps l JOIN sessions s ON s.id=l.session_id
    WHERE s.uploader=?1 AND lower(s.track)=lower(?2) AND lower(COALESCE(s.track_config,''))=lower(?3) AND lower(s.car)=lower(?4) AND COALESCE(s.game,'iracing')=?5
    AND l.valid=1 AND l.time>10 AND l.time<3600 AND lower(COALESCE(s.kind,'')) NOT LIKE '%test%'`).bind("acct:" + accountId, s.track, s.track_config || "", s.car, g).all()).results || [];
  const by = /* @__PURE__ */ new Map();
  for (const l of all) {
    const k = key(l.drv);
    if (!by.has(k)) by.set(k, []);
    by.get(k).push(l);
  }
  const who2 = /* @__PURE__ */ __name(async (k, nm) => {
    if (!k) return { uid: accountId, anon: !!acc.anon, shown: acc.name_kind === "iracing" ? "iracing" : "nick" };
    const alias = cleanAlias(nm);
    if (!alias) return null;
    let row = await env.DB.prepare("SELECT id FROM community_users WHERE owner=?1 AND id LIKE 'guest-%' AND lower(alias)=lower(?2)").bind(accountId, alias).first();
    if (!row) {
      if (await nameTaken(env, alias, accountId)) return null;
      const gid = "guest-" + (await sha2562(accountId + ":" + alias.toLowerCase())).slice(0, 20);
      await env.DB.prepare("INSERT INTO community_users (id, token_hash, alias, created, owner) VALUES (?1,?2,?3,?4,?5) ON CONFLICT(id) DO UPDATE SET alias=excluded.alias, owner=excluded.owner").bind(gid, await sha2562("guest:" + gid + ":" + rid6()), alias, Date.now(), accountId).run();
      row = { id: gid };
    }
    const gl = await env.DB.prepare("SELECT l.account_id AS id, a.anon, a.name_kind FROM guest_links l JOIN accounts a ON a.id=l.account_id WHERE l.gid=?1").bind(row.id).first();
    if (gl) return { uid: gl.id, anon: !!gl.anon, shown: gl.name_kind === "iracing" ? "iracing" : "nick" };
    return { uid: row.id, anon: false, shown: "nick" };
  }, "who");
  const mine = (await env.DB.prepare("SELECT c.id, c.user_id, c.time, u.alias FROM community_laps c JOIN community_users u ON u.id=c.user_id WHERE c.car_id=?1 AND c.track_id=?2 AND (c.user_id=?3 OR (u.owner=?3 AND u.id LIKE 'guest-%'))").bind(await famId(env, g, carId), trackId, accountId).all()).results || [];
  for (const c of mine) {
    const k = c.user_id === accountId ? "" : key(c.alias);
    if (here.some((l) => Math.abs(l.time - c.time) < 15e-4 && key(l.drv) !== k)) await env.DB.prepare("DELETE FROM community_laps WHERE id=?1").bind(c.id).run();
  }
  for (const [k, laps] of by) {
    const w = await who2(k, laps[0].drv).catch(() => null);
    if (!w) continue;
    const best = laps.sort((a, b) => a.time - b.time || (b.trace ? 1 : 0) - (a.trace ? 1 : 0))[0];
    await keepBestLap(env, w.uid, { game: g, carId, trackId, car: s.car, track: name2, time: best.time, sectors: best.sectors, trace: best.trace, anon: w.anon, shown: w.shown, official: s.official, ai: s.ai === 1 });
  }
}
__name(reshareSession, "reshareSession");
async function rememberLic(env, uid, cat, lic) {
  const v = licOf(lic);
  if (!v || !CATS.includes(cat)) return;
  const row = await env.DB.prepare("SELECT lics FROM community_users WHERE id=?1").bind(uid).first();
  let cur = {};
  try {
    cur = JSON.parse(row && row.lics || "{}") || {};
  } catch (e) {
  }
  if (cur[cat] === v) return;
  cur[cat] = v;
  await env.DB.prepare("UPDATE community_users SET lics=?2 WHERE id=?1").bind(uid, JSON.stringify(cur)).run();
}
__name(rememberLic, "rememberLic");
async function minuteCache(env, k, fn) {
  const cache2 = env.LOCAL !== "1" && typeof caches !== "undefined" && caches.default ? caches.default : null;
  const key = new Request("https://db.cache/" + k);
  if (cache2) {
    const hit = await cache2.match(key).catch(() => null);
    if (hit) {
      try {
        return await hit.json();
      } catch (e) {
      }
    }
  }
  const r2 = await fn();
  if (cache2) await cache2.put(key, new Response(JSON.stringify({ results: r2.results || [] }), { headers: { "content-type": "application/json", "cache-control": "max-age=60" } })).catch(() => {
  });
  return r2;
}
__name(minuteCache, "minuteCache");
async function community(req, env, url, ctx) {
  if (env.COMMUNITY !== "1") return err6("the community is not enabled on this server", 404);
  const p = url.pathname.replace(/^\/community/, ""), m = req.method;
  if (m === "OPTIONS") return new Response(null, { headers: { ...JSONH7, "access-control-allow-methods": "GET,POST,DELETE", "access-control-max-age": "86400", "access-control-allow-headers": "authorization,content-type" } });
  {
    const la = await lmuApiRoutes(req, env, p, m, url);
    if (la) return la;
  }
  const body = m === "POST" ? await req.json().catch(() => ({})) : {};
  if (p === "/register" && m === "POST") {
    const id2 = rid6(), token = rid6() + rid6();
    await env.DB.prepare("INSERT INTO community_users (id, token_hash, alias, created) VALUES (?1,?2,?3,?4)").bind(id2, await sha2562(token), cleanAlias(body.alias), Date.now()).run();
    return json10({ id: id2, token });
  }
  {
    const pr = await proRoutes(req, env, p, m, body);
    if (pr) return pr;
  }
  const game = gameOf(url.searchParams.get("game") || body.game);
  {
    const ct = await coachTipRoutes(req, env, p, m, body, game);
    if (ct) return ct;
  }
  if (p === "/combos" && m === "GET") {
    const r2 = await env.DB.prepare(
      "SELECT track_id AS trackId, MAX(track) AS track, car_id AS carId, MAX(car) AS car, COUNT(*) AS laps, MIN(time) AS best, MAX(cat) AS hint FROM community_laps WHERE game=?1 AND COALESCE(shown,'')<>'model' GROUP BY track_id, car_id ORDER BY laps DESC LIMIT 500"
    ).bind(game).all();
    const cm = game === "iracing" ? await catMap(env) : { tc: {}, c: {} };
    const fams = await famGroups(env, game);
    return json10({ combos: (r2.results || []).map(({ hint, ...x }) => ({ ...x, ...fams.has(x.carId) ? { ids: [...fams.get(x.carId)] } : {}, car: famName(game, x.carId, x.car), cat: game === "iracing" ? catOf(cm, x.trackId, x.carId, hint, x.track, x.car) : "sports_car" })) });
  }
  if (p === "/model" && m === "GET") {
    const t = +url.searchParams.get("trackId"), c = await famId(env, game, url.searchParams.get("carId"));
    if (!t || !c) return err6("trackId and carId", 400);
    const cq = url.searchParams.get("cmp");
    const md2 = forCompound(await getModel(env, game, t, c), cq != null && /^\d{1,2}$/.test(cq) ? +cq : null);
    const rivals = seesRivals(req, env, await me(req, env).catch(() => null));
    const fs = await env.DB.prepare(`SELECT l.time, ${shownName("l", "u", rivals)} AS alias FROM community_laps l JOIN community_users u ON u.id=l.user_id WHERE l.track_id=?1 AND l.car_id=?2 AND l.game=?3 AND COALESCE(l.shown,'')<>'model' ORDER BY l.time LIMIT 1`).bind(t, c, game).first();
    return json10({ ...md2, car: await getCarCard(env, game, c).catch(() => null), fastShared: fs || null });
  }
  if (p === "/car" && m === "GET") {
    const c = await famId(env, game, url.searchParams.get("carId"));
    if (!c) return err6("carId", 400);
    return json10(await getCarCard(env, game, c).catch(() => null) || {});
  }
  if (p === "/records" && m === "GET") {
    const lim = Math.min(100, Math.max(1, +url.searchParams.get("limit") || 40));
    const who2 = await me(req, env).catch(() => null);
    const all = url.searchParams.get("game") === "all";
    const rv = seesRivals(req, env, who2), adm = !!who2 && isAdmin(env, who2.id);
    const r2 = await minuteCache(env, `records/${all ? "all" : game}/${lim}/${rv ? 1 : 0}${adm ? 1 : 0}`, () => env.DB.prepare(
      `WITH rk AS (SELECT *, ROW_NUMBER() OVER (PARTITION BY game, track_id, car_id ORDER BY time) AS rk, COUNT(*) OVER (PARTITION BY game, track_id, car_id) AS n
         FROM community_laps WHERE ${all ? "game IN ('iracing','lmu')" : "game=?1"} AND COALESCE(shown,'')<>'model')
       SELECT l.id, l.user_id AS uid, l.game, l.track_id AS trackId, l.track, l.car_id AS carId, l.car, l.cat AS hint, l.time, l.created, l.n, l.wet,
         ${shownName("l", "u", rv)} AS alias,
         (${adm ? "ac.id IS NOT NULL OR " : ""}(l.anon=0 AND ac.id IS NOT NULL AND COALESCE(ac.anon,0)=0)) AS prof, (l.anon=0 AND COALESCE(ac.supporter,0)=1 AND COALESCE(ac.supporter_hidden,0)=0) AS sup,
         (l.trace IS NOT NULL OR ${ACCT_TRACE}) AS hasTrace,
         p.time AS prevTime, CASE WHEN p.id IS NULL THEN NULL ELSE ${shownName("p", "pu", rv)} END AS prevAlias
       FROM rk l JOIN community_users u ON u.id=l.user_id LEFT JOIN accounts ac ON ac.id=l.user_id
         LEFT JOIN rk p ON p.game=l.game AND p.track_id=l.track_id AND p.car_id=l.car_id AND p.rk=2 LEFT JOIN community_users pu ON pu.id=p.user_id
       WHERE l.rk=1 ORDER BY l.created DESC LIMIT ?2`
    ).bind(game, lim).all());
    const cm = all || game === "iracing" ? await catMap(env) : null;
    return json10({ records: (r2.results || []).map(({ uid, hint, prevTime, prevAlias, ...x }) => ({ ...x, game: gameOf(x.game), car: famName(gameOf(x.game), x.carId, x.car), cat: cm && gameOf(x.game) === "iracing" ? catOf(cm, x.trackId, x.carId, hint, x.track, x.car) : "sports_car", prof: !!x.prof, sup: !!x.sup, hasTrace: !!x.hasTrace, mine: !!who2 && uid === who2.id, field: String(uid).startsWith("o:"), prev: prevTime ? { time: prevTime, alias: prevAlias } : null })) });
  }
  if (p === "/track" && m === "GET") {
    const t = +url.searchParams.get("trackId");
    if (!t) return err6("trackId", 400);
    const who2 = await me(req, env).catch(() => null);
    const [lay, tu, r2, tot] = await Promise.all([
      env.DB.prepare("SELECT track, n, len, pts FROM track_maps WHERE game=?1 AND track_id=?2").bind(game, t).first(),
      env.DB.prepare("SELECT turns FROM track_turns WHERE game=?1 AND track_id=?2").bind(game, t).first(),
      env.DB.prepare(
        `WITH rk AS (SELECT *, ROW_NUMBER() OVER (PARTITION BY car_id ORDER BY time) AS rk, COUNT(*) OVER (PARTITION BY car_id) AS n
           FROM community_laps WHERE game=?1 AND track_id=?2 AND COALESCE(shown,'')<>'model')
         SELECT l.id, l.user_id AS uid, l.car_id AS carId, l.car, l.track, l.cat AS hint, l.time, l.created, l.n, l.wet, l.cls,
           ${shownName("l", "u", seesRivals(req, env, who2))} AS alias,
           (${who2 && isAdmin(env, who2.id) ? "ac.id IS NOT NULL OR " : ""}(l.anon=0 AND ac.id IS NOT NULL AND COALESCE(ac.anon,0)=0)) AS prof, (l.anon=0 AND COALESCE(ac.supporter,0)=1 AND COALESCE(ac.supporter_hidden,0)=0) AS sup,
           (l.trace IS NOT NULL OR ${ACCT_TRACE}) AS hasTrace
         FROM rk l JOIN community_users u ON u.id=l.user_id LEFT JOIN accounts ac ON ac.id=l.user_id
         WHERE l.rk=1 ORDER BY l.n DESC, l.time`
      ).bind(game, t).all(),
      env.DB.prepare("SELECT COUNT(*) AS laps, COUNT(DISTINCT user_id) AS drivers, MAX(track) AS track FROM community_laps WHERE game=?1 AND track_id=?2 AND COALESCE(shown,'')<>'model'").bind(game, t).first()
    ]);
    const cm = game === "iracing" ? await catMap(env) : null;
    const pts = lay && lay.pts ? JSON.parse(lay.pts) : null;
    const name2 = tot && tot.track || lay && lay.track || "";
    return json10({
      trackId: t,
      game,
      track: name2,
      drivers: tot && tot.drivers || 0,
      laps: tot && tot.laps || 0,
      layout: pts && pts.x && pts.x.length > 10 ? { n: lay.n, len: lay.len, x: pts.x, y: pts.y } : null,
      turns: tu && tu.turns ? JSON.parse(tu.turns) : [],
      cars: (r2.results || []).map(({ uid, hint, ...x }) => ({ ...x, car: famName(game, x.carId, x.car), track: x.track || name2, trackId: t, cat: cm ? catOf(cm, t, x.carId, hint, x.track || name2, x.car) : "sports_car", prof: !!x.prof, sup: !!x.sup, hasTrace: !!x.hasTrace, mine: !!who2 && uid === who2.id, field: String(uid).startsWith("o:") }))
    });
  }
  if (p === "/laps" && m === "GET") {
    const cq = game === "lmu" ? clsParam(url.searchParams.get("cls")) : null;
    if (cq && +url.searchParams.get("trackId")) {
      const who3 = await me(req, env).catch(() => null);
      const rows = await classLaps(env, +url.searchParams.get("trackId"), cq, { admin: !!who3 && isAdmin(env, who3.id), rivals: seesRivals(req, env, who3), acctTrace: ACCT_TRACE });
      return json10({ cat: "sports_car", cls: cq, laps: rows.map(({ uid, ...x }) => ({ ...x, car: famName(game, x.carId, x.car), lic: licOf(x.lic), prof: !!x.prof, sup: !!x.sup, mine: !!who3 && uid === who3.id, field: String(uid).startsWith("o:"), hasTrace: !!x.hasTrace, sectors: x.sectors ? JSON.parse(x.sectors) : null })) });
    }
    const t = +url.searchParams.get("trackId"), c = await famId(env, game, url.searchParams.get("carId"));
    if (!t || !c) return err6("trackId and carId", 400);
    const who2 = await me(req, env).catch(() => null);
    const h = await env.DB.prepare("SELECT MAX(cat) AS hint, MAX(track) AS track, MAX(car) AS car, MAX(cls) AS cls FROM community_laps WHERE track_id=?1 AND car_id=?2 AND game=?3").bind(t, c, game).first().catch(() => null);
    const cat = game === "iracing" ? catOf(await catMap(env), t, c, h && h.hint, h && h.track, h && h.car) : "sports_car";
    const r2 = await env.DB.prepare(
      `SELECT l.id, l.user_id AS uid, ${shownName("l", "u", seesRivals(req, env, who2))} AS alias, l.time, l.sectors, l.created, (l.trace IS NOT NULL OR ${ACCT_TRACE}) AS hasTrace, l.car, l.track, l.wet,
         COALESCE(json_extract(u.lics, '$.' || ?4), l.lic) AS lic,
         (${who2 && isAdmin(env, who2.id) ? "ac.id IS NOT NULL OR " : ""}(l.anon=0 AND ac.id IS NOT NULL AND COALESCE(ac.anon,0)=0)) AS prof, (l.anon=0 AND COALESCE(ac.supporter,0)=1 AND COALESCE(ac.supporter_hidden,0)=0) AS sup
       FROM community_laps l JOIN community_users u ON u.id=l.user_id LEFT JOIN accounts ac ON ac.id=l.user_id
       WHERE l.track_id=?1 AND l.car_id=?2 AND l.game=?3 AND COALESCE(l.shown,'')<>'model' ORDER BY l.time LIMIT 200`
    ).bind(t, c, game, cat).all();
    return json10({ cat, cls: game === "lmu" ? h && h.cls || lmuClass(null, h && h.car) : null, laps: (r2.results || []).map(({ uid, ...x }) => ({ ...x, lic: licOf(x.lic), prof: !!x.prof, sup: !!x.sup, mine: !!who2 && uid === who2.id, field: String(uid).startsWith("o:"), hasTrace: !!x.hasTrace, sectors: x.sectors ? JSON.parse(x.sectors) : null })) });
  }
  if (p.startsWith("/laps/") && m === "GET") {
    const rivals = seesRivals(req, env, await me(req, env).catch(() => null));
    const l = await env.DB.prepare(`SELECT l.*, ${shownName("l", "u", rivals)} AS alias FROM community_laps l JOIN community_users u ON u.id=l.user_id WHERE l.id=?1`).bind(p.slice(6)).first();
    if (!l) return err6("not found", 404);
    let trace = l.trace;
    if (!trace) {
      const a = await env.DB.prepare(`SELECT a.trace FROM laps a JOIN sessions s ON s.id=a.session_id WHERE ${ACCT_TRACE_WHERE} LIMIT 1`).bind(l.user_id, l.time, l.game).first();
      if (a) trace = a.trace;
    }
    let tr2 = trace ? JSON.parse(await openData(env, trace)) : null;
    if (tr2 && tr2.src === "field") {
      const card = await getCarCard(env, l.game, l.car_id).catch(() => null);
      tr2 = estimateTrace(tr2, card && card.pedals, card && card.shifts);
    }
    return json10({ id: l.id, alias: l.alias, game: l.game, time: l.time, car: famName(l.game, l.car_id, l.car), track: l.track, carId: l.car_id, trackId: l.track_id, sectors: l.sectors ? JSON.parse(l.sectors) : null, trace: tr2 });
  }
  if (p === "/reports" && m === "GET") {
    const t = +url.searchParams.get("trackId"), c = +url.searchParams.get("carId");
    const fam = c ? await famIds(env, game, c) : [0];
    const r2 = await env.DB.prepare(
      `SELECT r.id, r.user_id AS uid, CASE WHEN r.anon=1 THEN 'Anonymous' WHEN r.shown='iracing' AND COALESCE(u.iracing,'')<>'' THEN u.iracing ELSE u.alias END AS alias, r.car, r.track, r.created, COALESCE(r.finish, CASE WHEN substr(r.data,1,4)='enc:' THEN NULL ELSE json_extract(r.data,'$.finish') END) AS finish,
       COALESCE(r.field, CASE WHEN substr(r.data,1,4)='enc:' THEN NULL ELSE json_extract(r.data,'$.field') END) AS field,
       COALESCE(r.best, CASE WHEN substr(r.data,1,4)='enc:' THEN NULL ELSE json_extract(r.data,'$.best') END) AS best
       FROM community_reports r JOIN community_users u ON u.id=r.user_id WHERE (?1=0 OR r.track_id=?1) AND (?2=0 OR r.car_id IN (${fam.map((n) => +n || 0).join(",")})) AND r.game=?3 ORDER BY r.created DESC LIMIT 100`
    ).bind(t || 0, c || 0, game).all();
    const who2 = await me(req, env).catch(() => null);
    return json10({ reports: (r2.results || []).map(({ uid, ...x }) => ({ ...x, car: famName(game, c, x.car), mine: !!who2 && uid === who2.id })) });
  }
  if (p === "/trackmaps" && m === "GET") {
    const t = +url.searchParams.get("trackId");
    if (!t) return err6("trackId", 400);
    const r2 = await env.DB.prepare("SELECT track, n, len, pts, time, created, geo FROM track_maps WHERE game=?1 AND track_id=?2").bind(game, t).first();
    if (!r2) return err6("no layout for this track yet", 404);
    const pts = JSON.parse(r2.pts);
    let g = null;
    try {
      g = r2.geo ? JSON.parse(r2.geo) : null;
    } catch (e) {
      g = null;
    }
    return new Response(JSON.stringify({ trackId: t, game, track: r2.track, n: r2.n, len: r2.len, x: pts.x, y: pts.y, g, time: r2.time, updated: r2.created }), { headers: { ...JSONH7, "cache-control": "public, max-age=3600" } });
  }
  if (p === "/turns" && m === "GET") {
    const t = +url.searchParams.get("trackId");
    if (!t) return err6("trackId", 400);
    const r2 = await env.DB.prepare("SELECT turns, updated FROM track_turns WHERE game=?1 AND track_id=?2").bind(game, t).first();
    let turns = [], auto = false, count = 0;
    try {
      turns = r2 ? JSON.parse(r2.turns) : [];
    } catch (e) {
      turns = [];
    }
    if (!turns.length) {
      const [lay, want] = await Promise.all([env.DB.prepare("SELECT pts FROM track_maps WHERE game=?1 AND track_id=?2").bind(game, t).first(), turnCount(env, game, t)]);
      if (lay) {
        try {
          const p2 = JSON.parse(lay.pts);
          turns = turnsFromPath(p2.x, p2.y, want);
          auto = true;
        } catch (e) {
          turns = [];
        }
      }
      if (want) count = want;
    }
    return new Response(JSON.stringify({ trackId: t, game, turns, auto, ...count ? { count } : {}, updated: r2 ? r2.updated : 0 }), { headers: { ...JSONH7, "cache-control": "public, max-age=300" } });
  }
  if (p === "/pitlane" && m === "GET") {
    const t = +url.searchParams.get("trackId");
    if (!t) return err6("trackId", 400);
    const r2 = await env.DB.prepare("SELECT n, pts, updated FROM track_pits WHERE game=?1 AND track_id=?2").bind(game, t).first();
    const pts = r2 ? Object.entries(JSON.parse(r2.pts)).map(([i, v]) => [+i, v]).sort((a, b) => a[0] - b[0]) : [];
    return new Response(JSON.stringify({ trackId: t, game, n: r2 ? r2.n : 0, pts, updated: r2 ? r2.updated : 0 }), { headers: { ...JSONH7, "cache-control": "public, max-age=600" } });
  }
  if (p === "/turns" && m === "POST") {
    const acc = await sessionAccount(req, env);
    if (!acc || !isAdmin(env, acc.id)) return err6("only the admins of this server can do this", 403);
    const b = body;
    const t = +b.trackId, g = String(b.game || "iracing").slice(0, 20);
    const turns = Array.isArray(b.turns) ? b.turns.map(Number).filter((x) => isFinite(x) && x >= 0 && x < 1).slice(0, 60) : null;
    if (!t || !turns) return err6("trackId and turns", 400);
    if (!turns.length) await env.DB.prepare("DELETE FROM track_turns WHERE game=?1 AND track_id=?2").bind(g, t).run();
    else await env.DB.prepare("INSERT INTO track_turns (game, track_id, turns, updated) VALUES (?1, ?2, ?3, ?4) ON CONFLICT(game, track_id) DO UPDATE SET turns=excluded.turns, updated=excluded.updated").bind(g, t, JSON.stringify(turns.map((x) => Math.round(x * 1e5) / 1e5)), Date.now()).run();
    return json10({ ok: true, trackId: t, game: g, turns });
  }
  const um = p.match(/^\/admin\/reports\/([A-Za-z0-9_.:-]{1,64})\/uncut$/);
  if (um && m === "POST") {
    const acc = await sessionAccount(req, env);
    if (!acc || !isAdmin(env, acc.id)) return err6("only the admins of this server can do this", 403);
    const r2 = await env.DB.prepare("SELECT data FROM community_reports WHERE id=?1").bind(um[1]).first();
    if (!r2) return err6("not found", 404);
    const d = JSON.parse(await openData(env, r2.data));
    if (Array.isArray(d.laps)) d.laps = d.laps.map((l) => l.i ? l : { ...l, cut: false });
    await env.DB.prepare("UPDATE community_reports SET data=?2 WHERE id=?1").bind(um[1], await sealData(env, JSON.stringify(d))).run();
    return json10({ ok: true });
  }
  const du = p.match(/^\/admin\/users\/([A-Za-z0-9]{8,40})$/);
  if (du && m === "DELETE") {
    const acc = await sessionAccount(req, env);
    if (!acc || !isAdmin(env, acc.id)) return err6("only the admins of this server can do this", 403);
    const id2 = du[1];
    if (id2 === acc.id || isAdmin(env, id2)) return err6("an admin account cannot be deleted from here", 400);
    await purgeAccount(env, id2);
    return json10({ deleted: true });
  }
  if (m === "GET" && p === "/admin/status") {
    const acc = await sessionAccount(req, env);
    if (!acc || !isAdmin(env, acc.id)) return err6("only the admins of this server can do this", 403);
    const st = await env.DB.prepare("SELECT k, v, at FROM app_state WHERE k IN ('mail_error','mail_ok')").all().catch(() => ({ results: [] }));
    const get = /* @__PURE__ */ __name((k) => (st.results || []).find((x) => x.k === k), "get");
    const e = get("mail_error"), ok = get("mail_ok");
    const now = Date.now(), d1 = now - 864e5, d7 = now - 7 * 864e5, d30 = now - 30 * 864e5;
    const counts = await env.DB.prepare(`SELECT (SELECT COUNT(*) FROM accounts) AS accounts, (SELECT COUNT(*) FROM accounts WHERE verified=1) AS verified,
      (SELECT COUNT(*) FROM accounts WHERE created>?1) AS new7, (SELECT COUNT(*) FROM accounts WHERE created>?2) AS new30, (SELECT COUNT(*) FROM accounts WHERE totp_on=1) AS twoFactor,
      (SELECT COUNT(*) FROM sessions) AS sessions, (SELECT COUNT(*) FROM sessions WHERE started>?3) AS sessions1, (SELECT COUNT(*) FROM sessions WHERE started>?1) AS sessions7,
      (SELECT COUNT(DISTINCT uploader) FROM sessions WHERE started>?1) AS drivers7,
      (SELECT COUNT(*) FROM community_laps) AS shared, (SELECT COUNT(*) FROM (SELECT 1 FROM community_laps WHERE COALESCE(shown,'')<>'model' GROUP BY game, track_id, car_id)) AS boards,
      (SELECT COUNT(*) FROM model_laps) AS learnt, (SELECT COUNT(*) FROM model_cache) AS models, (SELECT COUNT(*) FROM model_cache WHERE dirty=1) AS modelsDirty, (SELECT COUNT(*) FROM car_cards) AS cars,
      (SELECT COUNT(*) FROM leagues) AS leagues, (SELECT COUNT(*) FROM accounts WHERE supporter=1) AS supporters, (SELECT COUNT(*) FROM accounts WHERE supporter=1 AND supporter_src='patreon') AS supportersPatreon,
      (SELECT COUNT(*) FROM patreon_patrons WHERE active=1) AS patrons, (SELECT MAX(updated) FROM patreon_patrons) AS patreonLast,
      (SELECT COUNT(*) FROM auth_fails) AS authFails`).bind(d7, d30, d1).first().catch((x) => ({ error: String(x && x.message || x) }));
    return json10({
      mail: { ready: mailReady(env), via: env.RESEND_API_KEY ? "resend" : "", from: env.EMAIL_FROM || "", lastOk: ok ? ok.at : 0, lastError: e && (!ok || e.at > ok.at) ? { at: e.at, ...JSON.parse(e.v || "{}") } : null },
      counts,
      config: { patreon: !!env.PATREON_WEBHOOK_SECRET, leaguesOpen: env.LEAGUES_OPEN === "1", community: env.COMMUNITY !== "0", dataKey: !!env.DATA_KEY, pepper: !!env.EMAIL_PEPPER, admins: String(env.ADMINS || env.SEASON_UPLOADERS || "").split(",").filter(Boolean).length }
    });
  }
  if (m === "GET" && p === "/admin/mail") {
    const acc = await sessionAccount(req, env);
    if (!acc || !isAdmin(env, acc.id)) return err6("only the admins of this server can do this", 403);
    const [items, domain] = await Promise.all([mailLog(env), mailDomain(env).catch(() => null)]);
    return json10({ items, domain });
  }
  if (m === "GET" && p === "/admin/guests") {
    const acc = await sessionAccount(req, env);
    if (!acc || !isAdmin(env, acc.id)) return err6("only the admins of this server can do this", 403);
    const r2 = await env.DB.prepare(`SELECT g.id, g.alias, g.created, g.owner, o.display AS ownerName, (SELECT COUNT(*) FROM community_laps l WHERE l.user_id=g.id) AS laps, gl.account_id AS linked, la.display AS linkedName
      FROM community_users g LEFT JOIN accounts o ON o.id=g.owner LEFT JOIN guest_links gl ON gl.gid=g.id LEFT JOIN accounts la ON la.id=gl.account_id WHERE g.id LIKE 'guest-%' ORDER BY g.created DESC LIMIT 300`).all();
    return json10({ guests: (r2.results || []).map((x) => ({ id: x.id, name: x.alias, created: x.created, owner: x.owner, ownerName: x.ownerName || "", laps: x.laps || 0, linked: x.linked || null, linkedName: x.linkedName || null })) });
  }
  if (m === "GET" && (p === "/admin/uploads" || p === "/admin/users")) {
    const acc = await sessionAccount(req, env);
    if (!acc || !isAdmin(env, acc.id)) return err6("only the admins of this server can do this", 403);
    if (p === "/admin/users") {
      const q3 = String(url.searchParams.get("q") || "").trim().slice(0, 60);
      const r4 = await env.DB.prepare(`SELECT a.id, a.display, a.name_kind AS nameKind, a.anon, a.verified, a.created, a.member_since AS memberSince, a.totp_on AS twoFactor, a.supporter, a.supporter_src AS supporterSrc, a.supporter_hidden AS supporterHidden,
        (SELECT COUNT(*) FROM sessions s WHERE s.uploader='acct:'||a.id) AS sessions,
        (SELECT MAX(started) FROM sessions s WHERE s.uploader='acct:'||a.id) AS lastSession,
        (SELECT COUNT(*) FROM community_laps l WHERE l.user_id=a.id) AS laps,
        (SELECT COUNT(*) FROM community_users g WHERE g.owner=a.id AND g.id LIKE 'guest-%') AS guests,
        (SELECT group_concat(gl.gid || '|' || g.alias, ',') FROM guest_links gl JOIN community_users g ON g.id=gl.gid WHERE gl.account_id=a.id) AS guestLinked,
        (SELECT COUNT(*) FROM leagues g WHERE g.owner=a.id) AS leagues,
        EXISTS (SELECT 1 FROM driver_links d WHERE d.account_id=a.id) AS driverLinked,
        (SELECT group_concat(d.game, ',') FROM driver_links d WHERE d.account_id=a.id) AS driverGames
        FROM accounts a ${q3 ? "WHERE a.display LIKE ?1 OR a.id LIKE ?1" : ""} ORDER BY a.created DESC LIMIT 500`).bind(...q3 ? ["%" + q3.replace(/[%_]/g, "") + "%"] : []).all();
      return json10({ users: (r4.results || []).map((x) => ({ ...x, admin: isAdmin(env, x.id) })) });
    }
    const q2 = /* @__PURE__ */ __name((t, extra) => env.DB.prepare(`SELECT x.id, '${t}' AS kind, x.car, x.track, x.created, x.anon, COALESCE(x.shown,'nick') AS shown, ${extra}
      u.id AS userId, u.alias, u.iracing, u.owner, o.display AS ownerName, ac.display AS account
      FROM community_${t} x JOIN community_users u ON u.id=x.user_id LEFT JOIN accounts o ON o.id=u.owner LEFT JOIN accounts ac ON ac.id=u.id
      ORDER BY x.created DESC LIMIT 300`).all(), "q");
    const [l, r2] = await Promise.all([q2("laps", "x.time,"), q2("reports", "x.best AS time,")]);
    const items = [...l.results || [], ...r2.results || []].sort((a, b) => b.created - a.created).map((x) => ({
      ...x,
      shownAs: x.anon ? "Anonymous" : x.shown === "iracing" && x.iracing ? x.iracing : x.alias,
      // a rival of a race ("o:…", shared by the PC that raced them) is not a Drinks driver ("guest-…", who drove that PC)
      via: !x.owner ? "account" : String(x.userId).startsWith("o:") ? "rival" : "drinks",
      realUploader: !x.owner ? x.account || x.alias : String(x.userId).startsWith("o:") ? `${x.alias} (race rival \xB7 shared by ${x.ownerName || x.owner})` : `${x.alias} (Drinks \xB7 ${x.ownerName || x.owner})`
    }));
    return json10({ items });
  }
  if (p === "/admin/supporter" && m === "POST") {
    const acc = await sessionAccount(req, env);
    if (!acc || !isAdmin(env, acc.id)) return err6("only the admins of this server can do this", 403);
    const id2 = String(body.id || "");
    const r2 = await env.DB.prepare("UPDATE accounts SET supporter=?2, supporter_src=?3 WHERE id=?1").bind(id2, body.on ? 1 : 0, body.on ? "manual" : null).run();
    return r2.meta && r2.meta.changes ? json10({ ok: true, supporter: !!body.on }) : err6("account not found", 404);
  }
  if (p === "/admin/since" && m === "POST") {
    const acc = await sessionAccount(req, env);
    if (!acc || !isAdmin(env, acc.id)) return err6("only the admins of this server can do this", 403);
    const since = body.since == null || body.since === "" ? null : Number(body.since);
    if (since !== null && !(isFinite(since) && since > 9466848e5 && since < Date.now() + 864e5)) return err6("that date is not valid", 400);
    const r2 = await env.DB.prepare("UPDATE accounts SET member_since=?2 WHERE id=?1").bind(String(body.id || ""), since === null ? null : Math.round(since)).run();
    return r2.meta && r2.meta.changes ? json10({ ok: true, since }) : err6("account not found", 404);
  }
  if (p === "/admin/trackmaps-rebuild" && m === "POST") {
    const acc = await sessionAccount(req, env);
    if (!acc || !isAdmin(env, acc.id)) return err6("only the admins of this server can do this", 403);
    return json10({ ok: true, ...await rebuildTrackMaps(env, { all: true }) });
  }
  if (p === "/admin/models" && m === "POST") {
    const acc = await sessionAccount(req, env);
    if (!acc || !isAdmin(env, acc.id)) return err6("only the admins of this server can do this", 403);
    const r2 = await env.DB.prepare("UPDATE model_cache SET dirty=1").run();
    await env.DB.prepare("UPDATE car_cards SET dirty=1").run().catch(() => {
    });
    return json10({ ok: true, models: r2.meta && r2.meta.changes || 0 });
  }
  if (p === "/admin/blocked" && m === "GET") {
    const acc = await sessionAccount(req, env);
    if (!acc || !isAdmin(env, acc.id)) return err6("only the admins of this server can do this", 403);
    const since = Date.now() - 15 * 6e4;
    const rows = (await env.DB.prepare("SELECT k, COUNT(*) AS n, MAX(t) AS last FROM auth_fails WHERE t>=?1 GROUP BY k ORDER BY last DESC LIMIT 200").bind(since).all()).results || [];
    const hashes = rows.map((x) => /^(login|mail):([0-9a-f]{64})$/.exec(x.k)).filter(Boolean).map((x) => x[2]), ids = rows.map((x) => /^2fa:(.+)$/.exec(x.k)).filter(Boolean).map((x) => x[1]);
    const who2 = {};
    for (const h of hashes) {
      const a = await env.DB.prepare("SELECT id, display FROM accounts WHERE email_hash=?1").bind(h).first();
      if (a) who2[h] = a;
    }
    for (const id2 of ids) {
      const a = await env.DB.prepare("SELECT id, display FROM accounts WHERE id=?1").bind(id2).first();
      if (a) who2[id2] = a;
    }
    const mask2 = /* @__PURE__ */ __name((v) => /^ip:[0-9a-f]{6}/.test(v) ? "#" + v.slice(3, 9) : "#" + String(v).slice(0, 6), "mask");
    const limit = { login: 5, "2fa": 5, mail: 3, reset: 10, reg: 5, ip: 30 };
    return json10({ blocked: rows.map((x) => {
      const m2 = /^(login|mail|2fa|reset|reg):(.+)$/.exec(x.k), kind = m2 ? m2[1] : "ip", v = m2 ? m2[2] : x.k, a = who2[v];
      const net = kind === "ip" || (kind === "mail" || kind === "reset" || kind === "reg") && !/^[0-9a-f]{64}$/.test(v);
      return { k: x.k, kind, n: x.n, last: x.last, account: a ? { id: a.id, display: a.display } : null, net: net ? mask2(v) : null, blocked: x.n >= (net && kind === "mail" ? 10 : limit[kind] || 5) };
    }) });
  }
  if (p === "/admin/unlock" && m === "POST") {
    const acc = await sessionAccount(req, env);
    if (!acc || !isAdmin(env, acc.id)) return err6("only the admins of this server can do this", 403);
    let r2;
    if (typeof body.k === "string" && body.k) r2 = await env.DB.prepare("DELETE FROM auth_fails WHERE k=?1").bind(body.k.slice(0, 200)).run();
    else if (typeof body.account === "string" && /^[A-Za-z0-9]{8,40}$/.test(body.account)) {
      const a = await env.DB.prepare("SELECT id, email_hash FROM accounts WHERE id=?1").bind(body.account).first();
      if (!a) return err6("account not found", 404);
      r2 = await env.DB.prepare("DELETE FROM auth_fails WHERE k IN (?1, ?2, ?3)").bind("login:" + a.email_hash, "mail:" + a.email_hash, "2fa:" + a.id).run();
    } else if (typeof body.email === "string" && body.email.includes("@")) {
      const eh = await emailHash(env, body.email), a = await env.DB.prepare("SELECT id FROM accounts WHERE email_hash=?1").bind(eh).first();
      r2 = await env.DB.prepare("DELETE FROM auth_fails WHERE k IN (?1, ?2, ?3)").bind("login:" + eh, "mail:" + eh, "2fa:" + (a ? a.id : "-")).run();
    } else if (body.all === true) r2 = await env.DB.prepare("DELETE FROM auth_fails").run();
    else return err6("say what to unblock", 400);
    return json10({ ok: true, cleared: r2.meta && r2.meta.changes || 0 });
  }
  const ua = p.match(/^\/admin\/users\/([A-Za-z0-9]{8,40})\/(verify|2fa-off|signout|rename|unlink-driver|link-guest|unlink-guest)$/);
  if (ua && m === "POST") {
    const acc = await sessionAccount(req, env);
    if (!acc || !isAdmin(env, acc.id)) return err6("only the admins of this server can do this", 403);
    const id2 = ua[1], a = await env.DB.prepare("SELECT id FROM accounts WHERE id=?1").bind(id2).first();
    if (!a) return err6("account not found", 404);
    if (ua[2] === "verify") await env.DB.prepare("UPDATE accounts SET verified=1 WHERE id=?1").bind(id2).run();
    if (ua[2] === "2fa-off") await env.DB.batch([env.DB.prepare("UPDATE accounts SET totp=NULL, totp_on=0, totp_pending=NULL WHERE id=?1").bind(id2), env.DB.prepare("DELETE FROM recovery_codes WHERE account_id=?1").bind(id2)]);
    if (ua[2] === "signout") await env.DB.prepare("DELETE FROM account_sessions WHERE account_id=?1").bind(id2).run();
    if (ua[2] === "unlink-driver") {
      const g = String(body.game || body.name || "");
      await unlinkDriver(env, id2, g ? gameOf(g) : null);
    }
    if (ua[2] === "link-guest" || ua[2] === "unlink-guest") {
      const want = String(body.guest || body.name || "").trim();
      if (!want) return err6("which DRINKS driver?", 400);
      const g = want.startsWith("guest-") ? await env.DB.prepare("SELECT id, alias FROM community_users WHERE id=?1 AND id LIKE 'guest-%'").bind(want).first() : await env.DB.prepare("SELECT id, alias FROM community_users WHERE id LIKE 'guest-%' AND lower(alias)=lower(?1) ORDER BY (owner=?2) DESC LIMIT 1").bind(cleanAlias(want), acc.id).first();
      if (!g) return err6("DRINKS driver not found", 404);
      if (ua[2] === "unlink-guest") {
        await env.DB.prepare("DELETE FROM guest_links WHERE gid=?1 AND account_id=?2").bind(g.id, id2).run();
        return json10({ ok: true, name: g.alias });
      }
      const had = await env.DB.prepare("SELECT account_id FROM guest_links WHERE gid=?1").bind(g.id).first();
      if (had && had.account_id !== id2) return err6("this DRINKS driver is already joined to another account", 409);
      const target = await env.DB.prepare("SELECT anon, name_kind FROM accounts WHERE id=?1").bind(id2).first();
      const shown = target && target.name_kind === "iracing" ? "iracing" : "nick";
      const laps = (await env.DB.prepare("SELECT id, car_id, track_id, time, game, trace IS NOT NULL AS traced FROM community_laps WHERE user_id=?1").bind(g.id).all()).results || [];
      const q2 = [], combos2 = /* @__PURE__ */ new Set();
      for (const l of laps) {
        const mine = await env.DB.prepare("SELECT id, time, trace IS NOT NULL AS traced FROM community_laps WHERE user_id=?1 AND car_id=?2 AND track_id=?3").bind(id2, l.car_id, l.track_id).first();
        combos2.add(l.game + "|" + l.track_id + "|" + l.car_id);
        const take = env.DB.prepare("UPDATE community_laps SET user_id=?2, anon=?3, shown=?4 WHERE id=?1").bind(l.id, id2, target && target.anon ? 1 : 0, shown);
        if (!mine) {
          q2.push(take);
          continue;
        }
        const better = mine.time > l.time || !mine.traced && !!l.traced;
        if (better) q2.push(env.DB.prepare("DELETE FROM community_laps WHERE id=?1").bind(mine.id), take);
        else q2.push(env.DB.prepare("DELETE FROM community_laps WHERE id=?1").bind(l.id));
      }
      q2.push(env.DB.prepare("UPDATE community_reports SET user_id=?2 WHERE user_id=?1").bind(g.id, id2));
      if (!had) q2.push(env.DB.prepare("INSERT INTO guest_links (gid, account_id, created) VALUES (?1,?2,?3)").bind(g.id, id2, Date.now()));
      await env.DB.batch(q2);
      await moveDriver(env, "acct:" + g.id, "acct:" + id2).catch(() => {
      });
      for (const c of combos2) {
        const [gm, t, cId] = c.split("|");
        await markModel(env, gm, +t, +cId).catch(() => {
        });
      }
      return json10({ ok: true, name: g.alias, moved: laps.length });
    }
    if (ua[2] === "rename") {
      const display = cleanName(body.name);
      if (!display) return err6("choose a public name", 400);
      if (await nameTaken(env, display, id2)) return err6("this nickname is already taken", 409);
      await env.DB.batch([env.DB.prepare("UPDATE accounts SET display=?2, name_kind='nick' WHERE id=?1").bind(id2, display), env.DB.prepare("UPDATE community_users SET alias=?2 WHERE id=?1").bind(id2, display)]);
    }
    return json10({ ok: true });
  }
  if (p === "/admin/sessions" && m === "GET") {
    const acc = await sessionAccount(req, env);
    if (!acc || !isAdmin(env, acc.id)) return err6("only the admins of this server can do this", 403);
    const r2 = await env.DB.prepare(`SELECT s.id, s.started, s.track, s.track_config AS trackConfig, s.car, s.kind, s.laps, s.game, s.official, s.cat, a.display AS who, a.id AS accountId
      FROM sessions s LEFT JOIN accounts a ON 'acct:'||a.id=s.uploader ORDER BY s.started DESC LIMIT 100`).all();
    return json10({ sessions: r2.results || [] });
  }
  if (p === "/profile/badge" && m === "POST") {
    const who2 = await sessionAccount(req, env);
    if (!who2) return err6("sign in with your Pitlane HQ account", 401);
    await env.DB.prepare("UPDATE accounts SET supporter_hidden=?2 WHERE id=?1").bind(who2.id, body.hidden ? 1 : 0).run();
    return json10({ ok: true, hidden: !!body.hidden });
  }
  if (p === "/profile/races" && m === "POST") {
    const who2 = await sessionAccount(req, env);
    if (!who2) return err6("sign in with your Pitlane HQ account", 401);
    const n = /* @__PURE__ */ __name((v, lo, hi) => typeof v === "number" && isFinite(v) && v >= lo && v <= hi ? v : null, "n");
    const list = (Array.isArray(body.races) ? body.races : []).slice(0, 30).map((x) => x && typeof x.id === "string" && /^[A-Za-z0-9_.:-]{1,80}$/.test(x.id) && n(x.when, 1e12, 1e13) ? {
      id: x.id,
      when: Math.round(x.when),
      game: gameOf(x.game),
      track: str3(x.track),
      car: str3(x.car),
      cat: CATS.includes(x.cat) ? x.cat : null,
      lic: licOf(x.lic),
      official: x.official === true,
      start: n(x.start, 0, 200),
      finish: n(x.finish, 0, 200),
      field: n(x.field, 0, 200),
      inc: n(x.inc, 0, 999),
      best: n(x.best, 0, 3600),
      laps: n(x.laps, 0, 9999),
      ir: n(x.ir, 0, 2e4),
      irChange: n(x.irChange, -2e3, 2e3),
      sof: n(x.sof, 0, 2e4),
      dnf: x.dnf === true
    } : null).filter(Boolean);
    await env.DB.batch([
      env.DB.prepare("DELETE FROM profile_races WHERE account_id=?1").bind(who2.id),
      ...list.map((x) => env.DB.prepare("INSERT INTO profile_races (account_id, id, at, data) VALUES (?1,?2,?3,?4) ON CONFLICT DO NOTHING").bind(who2.id, x.id, x.when, JSON.stringify(x)))
    ]);
    return json10({ ok: true, races: list.length });
  }
  if (p === "/leagues" || p.startsWith("/leagues/")) {
    const who2 = await sessionAccount(req, env).catch(() => null), admin = !!who2 && isAdmin(env, who2.id);
    const parts = p.slice(9).split("/").filter(Boolean), lid = parts[0] || "", sub = parts[1] || "";
    const lgGame = leagueGame(url.searchParams.get("game") || m === "POST" && body && body.game);
    if (lid === "found" && !sub && m === "GET") return json10(await foundLeagues(env, admin, lgGame));
    if (env.LEAGUES_OPEN !== "1" && !admin) return err6("leagues are in development", 403);
    if (lid === "found") {
      if (m === "GET") return json10(await foundLeagues(env, admin, lgGame));
      if (m !== "POST" || !admin) return err6("only the admins can do this", 403);
      if (sub && "edit" in body) return await editFound(env, sub, body.edit) ? json10(await foundLeagues(env, admin, lgGame)) : err6("league not found", 404);
      if (sub) {
        await env.DB.prepare("UPDATE league_found SET hidden=?2 WHERE guild=?1").bind(sub, body.hidden ? 1 : 0).run();
        return json10({ ok: true });
      }
      if (body.invite) {
        const r2 = await addFound(env, body.invite, body.game);
        if (r2.error) return err6(r2.error, 400);
        return json10(await foundLeagues(env, admin, lgGame));
      }
      await scanLeagues(env, true);
      return json10(await foundLeagues(env, admin, lgGame));
    }
    const lst = /* @__PURE__ */ __name((v) => {
      try {
        const a = JSON.parse(v || "[]");
        return Array.isArray(a) ? a : [];
      } catch (e) {
        return [];
      }
    }, "lst");
    const row = /* @__PURE__ */ __name((x2) => {
      const cats2 = lst(x2.cats).filter((c) => CATS.includes(c));
      const o = {
        id: x2.id,
        name: x2.name,
        about: x2.about || "",
        cat: cats2.length === 1 ? cats2[0] : null,
        cats: cats2,
        days: lst(x2.days).map(Number).filter((d) => d >= 0 && d <= 6),
        time: x2.time || "",
        tz: x2.tz || "",
        open: !!x2.open,
        discord: x2.discord || "",
        web: x2.web || "",
        schedule: x2.schedule || "",
        cars: x2.cars || "",
        lang: x2.lang || "",
        created: x2.created,
        updated: x2.updated,
        game: x2.game || "iracing",
        mine: !!who2 && x2.owner === who2.id,
        by: x2.alias || "Driver",
        bot: !!x2.bot
      };
      if (o.mine || admin) {
        o.views = x2.views || 0;
        o.clicks = x2.clicks || 0;
      }
      return o;
    }, "row");
    const leagueLimit = /* @__PURE__ */ __name(async () => {
      if (!who2) return LEAGUES_FREE;
      const a = await env.DB.prepare("SELECT supporter FROM accounts WHERE id=?1").bind(who2.id).first().catch(() => null);
      return a && a.supporter ? LEAGUES_SUPPORTER : LEAGUES_FREE;
    }, "leagueLimit");
    if (m === "GET" && !lid) {
      const r2 = await env.DB.prepare("SELECT l.*, u.alias, EXISTS (SELECT 1 FROM discord_guilds g WHERE g.league_id=l.id) AS bot FROM leagues l LEFT JOIN community_users u ON u.id=l.owner WHERE l.game=?1 ORDER BY l.updated DESC LIMIT 300").bind(lgGame).all();
      const limit2 = await leagueLimit();
      const mineN = who2 ? (await env.DB.prepare("SELECT COUNT(*) AS n FROM leagues WHERE owner=?1").bind(who2.id).first().catch(() => null) || {}).n || 0 : 0;
      return json10({ game: lgGame, posted: mineN, leagues: (r2.results || []).map(row), admin, open: env.LEAGUES_OPEN === "1", limit: limit2, supporter: limit2 === LEAGUES_SUPPORTER, limits: { free: LEAGUES_FREE, supporter: LEAGUES_SUPPORTER } });
    }
    const cur = lid ? await env.DB.prepare("SELECT l.*, u.alias FROM leagues l LEFT JOIN community_users u ON u.id=l.owner WHERE l.id=?1").bind(lid).first() : null;
    if (lid && !cur) return err6("league not found", 404);
    if (m === "GET") {
      const o = row(cur);
      let days2 = [];
      if (o.views !== void 0) {
        const since = new Date(Date.now() - 13 * 864e5).toISOString().slice(0, 10);
        const r2 = await env.DB.prepare("SELECT day, views, clicks FROM league_days WHERE league_id=?1 AND day>=?2 ORDER BY day").bind(lid, since).all();
        days2 = (r2.results || []).map((d) => ({ day: d.day, views: d.views || 0, clicks: d.clicks || 0 }));
      }
      return json10({ league: o, days: days2 });
    }
    if (m !== "POST") return err6("not found", 404);
    if (lid && sub === "hit") {
      const kind = ["view", "discord", "web"].includes(body.kind) ? body.kind : "";
      if (!kind) return err6("what was it", 400);
      if (who2 && who2.id === cur.owner) return json10({ ok: true, counted: false });
      const viewer = who2 ? "a:" + who2.id : "n:" + (await sha2562("league-viewer|" + (env.DATA_KEY || "") + "|" + (req.headers.get("cf-connecting-ip") || "") + "|" + (req.headers.get("user-agent") || ""))).slice(0, 24);
      const day4 = (/* @__PURE__ */ new Date()).toISOString().slice(0, 10);
      const ins = await env.DB.prepare("INSERT OR IGNORE INTO league_hits (league_id, viewer, day, kind) VALUES (?1,?2,?3,?4)").bind(lid, viewer, day4, kind).run();
      if (!(ins.meta && ins.meta.changes)) return json10({ ok: true, counted: false });
      const col = kind === "view" ? "views" : "clicks";
      const q2 = [
        env.DB.prepare(`UPDATE leagues SET ${col}=${col}+1 WHERE id=?1`).bind(lid),
        env.DB.prepare(`INSERT INTO league_days (league_id, day, ${col}) VALUES (?1,?2,1) ON CONFLICT(league_id, day) DO UPDATE SET ${col}=${col}+1`).bind(lid, day4)
      ];
      if (Math.random() < 0.02) q2.push(env.DB.prepare("DELETE FROM league_hits WHERE day < ?1").bind(new Date(Date.now() - 45 * 864e5).toISOString().slice(0, 10)));
      await env.DB.batch(q2);
      return json10({ ok: true, counted: true });
    }
    if (!who2) return err6("sign in with your Pitlane HQ account", 401);
    if (lid && cur.owner !== who2.id && !admin) return err6("league not found", 404);
    if (lid && body.delete) {
      await env.DB.batch([
        env.DB.prepare("DELETE FROM league_hits WHERE league_id=?1").bind(lid),
        env.DB.prepare("DELETE FROM league_days WHERE league_id=?1").bind(lid),
        env.DB.prepare("DELETE FROM leagues WHERE id=?1").bind(lid)
      ]);
      return json10({ ok: true, deleted: true });
    }
    const txt = /* @__PURE__ */ __name((v, n2) => typeof v === "string" ? v.replace(/[\u0000-\u001f\u007f]/g, " ").replace(/\s+/g, " ").trim().slice(0, n2) : "", "txt");
    const link = /* @__PURE__ */ __name((v, re) => {
      const t = txt(v, 200);
      return re.test(t) ? t : "";
    }, "link");
    const discord = link(body.discord, /^https:\/\/(discord\.gg|(www\.)?discord\.com\/invite)\/[A-Za-z0-9-]{2,40}\/?$/);
    const web = link(body.web, /^https:\/\/[^\s"'<>]{4,190}$/);
    const name2 = txt(body.name, 60);
    if (name2.length < 3) return err6("the league needs a name", 400);
    if (txt(body.discord, 200) && !discord) return err6("the Discord link must be an invite: https://discord.gg/\u2026 or https://discord.com/invite/\u2026", 400);
    if (txt(body.web, 200) && !web) return err6("the website must be an https:// address", 400);
    if (!discord && !web) return err6("give drivers a way in: a Discord invite or a website", 400);
    const cats = Array.isArray(body.cats) ? [...new Set(body.cats.filter((c) => CATS.includes(c)))] : CATS.includes(body.cat) ? [body.cat] : [];
    const days = Array.isArray(body.days) ? [...new Set(body.days.map(Number).filter((d) => Number.isInteger(d) && d >= 0 && d <= 6))].sort((a, b) => a - b) : [];
    const time = /^([01]\d|2[0-3]):[0-5]\d$/.test(String(body.time || "")) ? String(body.time) : "";
    let tz = txt(body.tz, 60);
    try {
      if (tz) new Intl.DateTimeFormat("en", { timeZone: tz });
    } catch (e) {
      tz = "";
    }
    const x = {
      name: name2,
      about: txt(body.about, 600),
      cat: cats.length === 1 ? cats[0] : null,
      cats: JSON.stringify(cats),
      days: JSON.stringify(days),
      time,
      tz: time ? tz : "",
      open: body.open === void 0 ? 1 : body.open ? 1 : 0,
      game: body.game ? leagueGame(body.game) : cur ? leagueGame(cur.game) : "iracing",
      discord,
      web,
      schedule: txt(body.schedule, 80),
      cars: txt(body.cars, 120),
      lang: txt(body.lang, 30)
    };
    const now = Date.now();
    if (cur) {
      await env.DB.prepare("UPDATE leagues SET name=?2, about=?3, cat=?4, cats=?5, days=?6, time=?7, tz=?8, open=?9, discord=?10, web=?11, schedule=?12, cars=?13, lang=?14, updated=?15, game=?16 WHERE id=?1").bind(lid, x.name, x.about, x.cat, x.cats, x.days, x.time, x.tz, x.open, x.discord, x.web, x.schedule, x.cars, x.lang, now, x.game).run();
      return json10({ ok: true, id: lid });
    }
    const n = await env.DB.prepare("SELECT COUNT(*) AS n FROM leagues WHERE owner=?1").bind(who2.id).first();
    const limit = await leagueLimit();
    if (n && n.n >= limit && !admin) return err6(limit === LEAGUES_SUPPORTER ? `you can post up to ${limit} leagues` : `you can post up to ${limit} leagues (${LEAGUES_SUPPORTER} as a supporter)`, 429);
    const id2 = rid6();
    await env.DB.prepare("INSERT INTO leagues (id, owner, name, about, cat, cats, days, time, tz, open, discord, web, schedule, cars, lang, created, updated, game) VALUES (?1,?2,?3,?4,?5,?6,?7,?8,?9,?10,?11,?12,?13,?14,?15,?16,?16,?17)").bind(id2, who2.id, x.name, x.about, x.cat, x.cats, x.days, x.time, x.tz, x.open, x.discord, x.web, x.schedule, x.cars, x.lang, now, x.game).run();
    return json10({ ok: true, id: id2, game: x.game });
  }
  if (p === "/profile" && m === "GET") {
    const viewer = await sessionAccount(req, env).catch(() => null), admin = !!viewer && isAdmin(env, viewer.id);
    let uid = null, fromAnon = false;
    if (url.searchParams.get("me") === "1") uid = viewer ? viewer.id : null;
    else if (admin && /^[A-Za-z0-9]{8,40}$/.test(url.searchParams.get("id") || "")) uid = url.searchParams.get("id");
    else {
      const l = await env.DB.prepare("SELECT user_id, anon FROM community_laps WHERE id=?1").bind(String(url.searchParams.get("lap") || "")).first();
      if (l) {
        uid = l.user_id;
        fromAnon = l.anon === 1;
      }
    }
    const a = uid ? await env.DB.prepare("SELECT a.id, a.anon, a.name_kind, a.created, a.member_since, a.supporter, a.supporter_hidden, u.alias, u.lics FROM accounts a JOIN community_users u ON u.id=a.id WHERE a.id=?1").bind(uid).first() : null;
    const mine = !!a && !!viewer && viewer.id === a.id;
    if (!a || (fromAnon || a.anon) && !admin && !mine) return err6("this driver is anonymous", 404);
    const laps = (await env.DB.prepare(
      `SELECT id, track, car, track_id AS trackId, car_id AS carId, time, created, anon, game, cat, lic,
         (SELECT COUNT(*) FROM community_laps o WHERE o.track_id=l.track_id AND o.car_id=l.car_id AND o.game=l.game AND COALESCE(o.shown,'')<>'model' AND o.time<l.time)+1 AS pos,
         (SELECT COUNT(*) FROM community_laps o WHERE o.track_id=l.track_id AND o.car_id=l.car_id AND o.game=l.game AND COALESCE(o.shown,'')<>'model') AS "of",
         (SELECT MIN(o.time) FROM community_laps o WHERE o.track_id=l.track_id AND o.car_id=l.car_id AND o.game=l.game AND COALESCE(o.shown,'')<>'model') AS rec
       FROM community_laps l WHERE user_id=?1 AND COALESCE(shown,'')<>'model' ${admin || mine ? "" : "AND anon=0"} ORDER BY created DESC LIMIT 60`
    ).bind(a.id).all()).results || [];
    const cm = await catMap(env).catch(() => ({ tc: {}, c: {} }));
    const races = ((await env.DB.prepare("SELECT data FROM profile_races WHERE account_id=?1 ORDER BY at DESC LIMIT 20").bind(a.id).all()).results || []).map((x) => JSON.parse(x.data));
    let lics = {};
    try {
      lics = JSON.parse(a.lics || "{}") || {};
    } catch (e) {
    }
    const sup = !!a.supporter;
    const tz = Math.max(-840, Math.min(840, parseInt(url.searchParams.get("tz") || "0", 10) || 0));
    const days = {};
    for (const x of (await env.DB.prepare("SELECT started FROM sessions WHERE uploader=?1 AND started>?2 LIMIT 3000").bind("acct:" + a.id, Date.now() - 200 * 864e5).all()).results || []) {
      const d = new Date(x.started - tz * 6e4), k = d.getUTCFullYear() + "-" + (d.getUTCMonth() + 1) + "-" + d.getUTCDate();
      days[k] = (days[k] || 0) + 1;
    }
    const dc = await env.DB.prepare("SELECT discord_id, handle FROM discord_links WHERE account_id=?1 AND shown=1").bind(a.id).first().catch(() => null);
    const sl = await env.DB.prepare("SELECT steamid, persona FROM steam_links WHERE account_id=?1 AND shown=1").bind(a.id).first().catch(() => null);
    const sessions = admin ? (await env.DB.prepare("SELECT id, started, track, track_config AS trackConfig, car, kind, laps, best FROM sessions WHERE uploader=?1 ORDER BY started DESC LIMIT 30").bind("acct:" + a.id).all()).results || [] : void 0;
    const trend = {};
    if (mine) {
      const fam = /* @__PURE__ */ new Map();
      for (const x of (await env.DB.prepare("SELECT game, car_id, fam_id FROM car_families").all().catch(() => null) || {}).results || []) fam.set((x.game || "iracing") + ":" + x.car_id, x.fam_id);
      const by = /* @__PURE__ */ new Map();
      for (const x of (await env.DB.prepare("SELECT game, track_id, car_id, best FROM sessions WHERE uploader=?1 AND best>0 AND track_id>0 AND car_id>0 ORDER BY started ASC LIMIT 5000").bind("acct:" + a.id).all()).results || []) {
        const g = x.game || "iracing", k = g + ":" + x.track_id + ":" + (fam.get(g + ":" + x.car_id) || x.car_id);
        if (!by.has(k)) by.set(k, []);
        by.get(k).push(x.best);
      }
      for (const [k, list] of by) {
        let b = Infinity;
        const run = list.map((v) => b = Math.min(b, v));
        if (run.length > 1) trend[k] = run.slice(-8).map((v) => Math.round(v * 1e3) / 1e3);
      }
    }
    return json10({
      name: a.alias || "Driver",
      since: a.member_since || a.created,
      mine,
      admin,
      anonymous: !!a.anon,
      shownAs: admin || mine ? a.anon ? "anonymous" : a.name_kind === "iracing" ? "iracing" : "nick" : void 0,
      // how the account shows itself
      discord: dc ? { id: dc.discord_id, handle: dc.handle || "" } : void 0,
      steam: sl ? { id: sl.steamid, persona: sl.persona || "" } : void 0,
      supporter: sup && (!a.supporter_hidden || mine || admin),
      supporterHidden: mine || admin ? !!a.supporter_hidden : void 0,
      lics,
      races,
      days,
      sessions,
      laps: laps.map((x) => ({ ...x, trend: trend[(x.game || "iracing") + ":" + x.trackId + ":" + x.carId], car: famName(x.game, x.carId, x.car), anon: !!x.anon, lic: licOf(lics[x.cat]) || licOf(x.lic), cat: (x.game || "iracing") === "iracing" ? catOf(cm, x.trackId, x.carId, x.cat, x.track, x.car) : null }))
    });
  }
  const am = p.match(/^\/admin\/(laps|reports|setups|trackmaps)\/([A-Za-z0-9_.:-]{1,64})$/);
  if (am && m === "DELETE") {
    const acc = await sessionAccount(req, env);
    if (!acc || !isAdmin(env, acc.id)) return err6("only the admins of this server can do this", 403);
    const [, kind, id2] = am;
    const q2 = {
      laps: ["DELETE FROM community_laps WHERE id=?1", id2],
      reports: ["DELETE FROM community_reports WHERE id=?1", id2],
      setups: ["DELETE FROM community_setups WHERE id=?1", id2],
      trackmaps: ["DELETE FROM track_maps WHERE track_id=?1 AND game=?2", +id2 || 0, game]
    }[kind];
    const r2 = await env.DB.prepare(q2[0]).bind(...q2.slice(1)).run();
    return json10({ deleted: !!(r2.meta && r2.meta.changes) });
  }
  if (p.startsWith("/reports/") && m === "GET") {
    const r2 = await env.DB.prepare("SELECT r.*, CASE WHEN r.anon=1 THEN 'Anonymous' WHEN r.shown='iracing' AND COALESCE(u.iracing,'')<>'' THEN u.iracing ELSE u.alias END AS alias FROM community_reports r JOIN community_users u ON u.id=r.user_id WHERE r.id=?1").bind(p.slice(9)).first();
    if (!r2) return err6("not found", 404);
    const data = JSON.parse(await openData(env, r2.data));
    const rivals = seesRivals(req, env, await me(req, env).catch(() => null));
    for (const k of ["results", "brakes"]) if (Array.isArray(data[k])) data[k] = data[k].map((x) => !x ? x : x.me ? r2.anon ? { ...x, name: "Anonymous" } : x : rivals ? x : { ...x, name: "Anonymous" });
    return json10({ ...data, id: r2.id, alias: r2.alias, game: r2.game, shared: true });
  }
  if (p === "/season" && m === "GET") {
    const c = await env.DB.prepare("SELECT updated, chunks FROM season_cache WHERE k='current'").first();
    if (!c) return err6("no season schedule on this server yet", 404);
    const r2 = await env.DB.prepare("SELECT data FROM season_chunks WHERE k='current' AND idx<?1 ORDER BY idx").bind(c.chunks).all();
    const seen2 = await seenSummary(env).catch(() => ({}));
    return new Response('{"updated":' + c.updated + ',"seen":' + JSON.stringify(seen2) + ',"season":' + (r2.results || []).map((x) => x.data).join("") + "}", { headers: { ...JSONH7, "cache-control": "public, max-age=900" } });
  }
  if (p === "/setups/cars" && m === "GET") {
    const r2 = await env.DB.prepare("SELECT car_path AS carPath, MAX(car) AS car, COUNT(*) AS n FROM community_setups WHERE game=?1 GROUP BY car_path ORDER BY n DESC LIMIT 500").bind(game).all();
    return json10({ cars: r2.results || [] });
  }
  if (p === "/setups" && m === "GET") {
    const car = url.searchParams.get("car") || "", track2 = (url.searchParams.get("track") || "").slice(0, 80), q2 = (url.searchParams.get("q") || "").slice(0, 60);
    const r2 = await env.DB.prepare(
      `SELECT s.id, u.alias, s.car_path AS carPath, s.car, s.track, s.name, s.notes, s.size, s.downloads, s.created FROM community_setups s JOIN community_users u ON u.id=s.user_id
       WHERE (?1='' OR s.car_path=?1) AND (?2='' OR s.track LIKE '%'||?2||'%') AND (?3='' OR s.name LIKE '%'||?3||'%' OR s.car LIKE '%'||?3||'%' OR s.track LIKE '%'||?3||'%') AND s.game=?4
       ORDER BY s.downloads DESC, s.created DESC LIMIT 200`
    ).bind(car, track2, q2, game).all();
    return json10({ setups: r2.results || [] });
  }
  if (p.startsWith("/setups/") && p !== "/setups/mine" && m === "GET") {
    const id2 = p.slice(8);
    const s = await env.DB.prepare("SELECT s.*, u.alias FROM community_setups s JOIN community_users u ON u.id=s.user_id WHERE s.id=?1").bind(id2).first();
    if (!s) return err6("not found", 404);
    await env.DB.prepare("UPDATE community_setups SET downloads=downloads+1 WHERE id=?1").bind(id2).run();
    return json10({ id: s.id, alias: s.alias, carPath: s.car_path, car: s.car, track: s.track, name: s.name, notes: s.notes, sha: s.sha, data: s.data });
  }
  let u = await me(req, env);
  if (!u) return err6("wrong or missing token", 401);
  if (p === "/guests" && m === "GET") {
    if (!u.account || !isAdmin(env, u.id)) return err6("only the admins of this server can do this", 403);
    const r2 = await env.DB.prepare("SELECT g.id, g.alias, g.created, (SELECT COUNT(*) FROM community_laps l WHERE l.user_id=g.id) AS laps, (SELECT a.display FROM guest_links gl JOIN accounts a ON a.id=gl.account_id WHERE gl.gid=g.id) AS linked FROM community_users g WHERE g.owner=?1 AND g.id LIKE 'guest-%' ORDER BY g.created DESC LIMIT 60").bind(u.id).all();
    return json10({ guests: (r2.results || []).map((x) => ({ id: x.id, name: x.alias, laps: x.laps || 0, created: x.created, linked: x.linked || null })) });
  }
  if (m === "POST" && (p === "/laps" || p === "/reports") && typeof body.guest === "string" && body.guest.trim()) {
    if (!u.account || !isAdmin(env, u.id)) return err6("only the admins of this server can share laps for other drivers", 403);
    const name2 = cleanAlias(body.guest);
    const had = await env.DB.prepare("SELECT id FROM community_users WHERE owner=?1 AND id LIKE 'guest-%' AND lower(alias)=lower(?2)").bind(u.id, name2).first();
    const gid = had ? had.id : "guest-" + (await sha2562(u.id + ":" + name2.toLowerCase())).slice(0, 20);
    if (await nameTaken(env, name2, u.id)) return json10({ error: `"${name2}" is already used by another driver on Pitlane HQ, choose another name`, code: "name_taken" }, 409);
    await env.DB.prepare("INSERT INTO community_users (id, token_hash, alias, created, owner) VALUES (?1,?2,?3,?4,?5) ON CONFLICT(id) DO UPDATE SET alias=excluded.alias, owner=excluded.owner").bind(gid, await sha2562("guest:" + gid + ":" + rid6()), name2, Date.now(), u.id).run();
    const gl = await env.DB.prepare("SELECT l.account_id AS id, a.anon, a.name_kind FROM guest_links l JOIN accounts a ON a.id=l.account_id WHERE l.gid=?1").bind(gid).first();
    const to = gl ? await env.DB.prepare("SELECT id, alias, uploads_day, uploads FROM community_users WHERE id=?1").bind(gl.id).first() : null;
    u = to || await env.DB.prepare("SELECT id, alias, uploads_day, uploads FROM community_users WHERE id=?1").bind(gid).first();
    body.anon = !!(to && gl.anon);
    body.as = to && gl.name_kind === "iracing" ? "iracing" : "nick";
  }
  if (body.as === "anon") body.anon = true;
  else if (body.as === "nick" || body.as === "iracing") body.anon = false;
  const shownAs = body.as === "iracing" ? "iracing" : "nick";
  if (shownAs === "iracing" && typeof body.iracingName === "string" && body.iracingName.trim())
    await env.DB.prepare("UPDATE community_users SET iracing=?2 WHERE id=?1").bind(u.id, cleanAlias(body.iracingName)).run();
  if (p === "/guest-rename" && m === "POST") {
    if (!u.account || !isAdmin(env, u.id)) return err6("only the admins of this server can do this", 403);
    const from = cleanAlias(body.from || ""), to = cleanAlias(body.to || "");
    if (!from || !to) return err6("both names are needed", 400);
    if (await nameTaken(env, to, u.id)) return json10({ error: `"${to}" is already used by another driver on Pitlane HQ, choose another name`, code: "name_taken" }, 409);
    const row = await env.DB.prepare("SELECT id FROM community_users WHERE owner=?1 AND id LIKE 'guest-%' AND lower(alias)=lower(?2)").bind(u.id, from).first();
    if (from.toLowerCase() !== to.toLowerCase()) {
      const clash = await env.DB.prepare("SELECT id FROM community_users WHERE owner=?1 AND id LIKE 'guest-%' AND lower(alias)=lower(?2)").bind(u.id, to).first();
      if (clash) return json10({ error: `You already have a driver called "${to}"`, code: "name_taken" }, 409);
    }
    if (row) await env.DB.prepare("UPDATE community_users SET alias=?2 WHERE id=?1").bind(row.id, to).run();
    await env.DB.prepare("UPDATE laps SET drv=?3 WHERE lower(drv)=lower(?2) AND session_id IN (SELECT id FROM sessions WHERE uploader=?1)").bind("acct:" + u.id, from, to).run().catch(() => {
    });
    await env.DB.prepare("UPDATE sessions SET drvs=(SELECT group_concat(DISTINCT drv) FROM laps WHERE session_id=sessions.id) WHERE uploader=?1 AND drvs IS NOT NULL").bind("acct:" + u.id).run().catch(() => {
    });
    return json10({ ok: true, renamed: !!row, name: to });
  }
  if (p === "/name-check" && m === "POST") {
    if (!u.account || !isAdmin(env, u.id)) return err6("only the admins of this server can do this", 403);
    return json10({ free: !await nameTaken(env, cleanAlias(body.name), u.id) });
  }
  if (p === "/season/seen" && m === "POST") {
    const r2 = await recordSeen(env, u.id, body);
    return r2.error ? err6(r2.error, r2.status) : json10(r2);
  }
  if (p === "/season" && m === "POST") {
    const allowed = String(env.SEASON_UPLOADERS || env.ADMINS || "").split(",").map((x) => x.trim()).filter(Boolean);
    if (!u.account || !allowed.includes(u.id)) return err6("this account cannot publish the season schedule", 403);
    const data = JSON.stringify(body.season || null);
    if (data.length < 100 || data.length > 12e6 || !Array.isArray(body.season.seasons)) return err6("season schedule missing or too large", 400);
    const parts = [];
    for (let i = 0; i < data.length; i += 9e5) parts.push(data.slice(i, i + 9e5));
    await env.DB.batch([
      env.DB.prepare("DELETE FROM season_chunks WHERE k='current'"),
      ...parts.map((d, i) => env.DB.prepare("INSERT INTO season_chunks (k, idx, data) VALUES ('current',?1,?2)").bind(i, d)),
      env.DB.prepare("INSERT INTO season_cache (k, updated, chunks) VALUES ('current',?1,?2) ON CONFLICT(k) DO UPDATE SET updated=excluded.updated, chunks=excluded.chunks").bind(Date.now(), parts.length)
    ]);
    return json10({ published: true, size: data.length });
  }
  if (p === "/setups/mine" && m === "GET") {
    const r2 = await env.DB.prepare("SELECT id, car_path AS carPath, car, track, name, notes, size, downloads, created FROM community_setups WHERE user_id=?1 ORDER BY created DESC").bind(u.id).all();
    return json10({ setups: (r2.results || []).map((x) => ({ ...x, alias: u.alias, mine: true })) });
  }
  if (p === "/setups" && m === "POST") {
    if (typeof body.carPath !== "string" || !CAR_RE.test(body.carPath) || body.carPath.includes("..")) return err6("unknown car folder", 400);
    if (typeof body.data !== "string" || !/^[A-Za-z0-9+/=]+$/.test(body.data) || body.data.length > 56e4) return err6("setup missing or too large (400 KB max)", 400);
    if (typeof body.sha !== "string" || !/^[0-9a-f]{64}$/.test(body.sha)) return err6("missing checksum", 400);
    const bytes = Uint8Array.from(atob(body.data), (c) => c.charCodeAt(0));
    if (await crypto.subtle.digest("SHA-256", bytes).then((b) => [...new Uint8Array(b)].map((x) => x.toString(16).padStart(2, "0")).join("")) !== body.sha) return err6("checksum does not match", 400);
    if (!await countUpload(env, u)) return err6("too many uploads today", 429);
    const id2 = rid6();
    const r2 = await env.DB.prepare(
      "INSERT INTO community_setups (id, user_id, car_path, car, track, name, notes, data, sha, size, created, game) VALUES (?1,?2,?3,?4,?5,?6,?7,?8,?9,?10,?11,?12) ON CONFLICT(user_id, sha) DO NOTHING"
    ).bind(id2, u.id, body.carPath, str3(body.car), str3(body.track, 80), cleanFile(body.name), str3(body.notes, 1e3), body.data, body.sha, bytes.length, Date.now(), game).run();
    if (!r2.meta || !r2.meta.changes) return json10({ kept: "you already shared this setup" });
    return json10({ shared: true, id: id2 });
  }
  if (p.startsWith("/setups/") && m === "DELETE") {
    await env.DB.prepare("DELETE FROM community_setups WHERE id=?1 AND user_id=?2").bind(p.slice(8), u.id).run();
    return json10({ deleted: true });
  }
  if (p === "/adopt" && m === "POST") {
    if (!u.account) return err6("sign in with your Pitlane HQ account", 401);
    const t = typeof body.token === "string" ? body.token.trim() : "";
    if (t.length < 20) return err6("missing token", 400);
    const d = await env.DB.prepare("SELECT id FROM community_users WHERE token_hash=?1").bind(await sha2562(t)).first();
    if (!d || d.id === u.id || /^(o:|guest-)/.test(d.id) || await env.DB.prepare("SELECT 1 FROM accounts WHERE id=?1").bind(d.id).first()) return json10({ adopted: 0 });
    const laps = (await env.DB.prepare("SELECT id, car_id, track_id, time, game, trace IS NOT NULL AS traced FROM community_laps WHERE user_id=?1").bind(d.id).all()).results || [];
    const q2 = [], combos2 = /* @__PURE__ */ new Set();
    for (const l of laps) {
      const mine = await env.DB.prepare("SELECT id, time, trace IS NOT NULL AS traced FROM community_laps WHERE user_id=?1 AND car_id=?2 AND track_id=?3").bind(u.id, l.car_id, l.track_id).first();
      combos2.add(l.game + "|" + l.track_id + "|" + l.car_id);
      if (!mine) {
        q2.push(env.DB.prepare("UPDATE community_laps SET user_id=?2 WHERE id=?1").bind(l.id, u.id));
        continue;
      }
      const better = mine.time > l.time || !mine.traced && !!l.traced;
      if (better) q2.push(env.DB.prepare("DELETE FROM community_laps WHERE id=?1").bind(mine.id), env.DB.prepare("UPDATE community_laps SET user_id=?2 WHERE id=?1").bind(l.id, u.id));
      else q2.push(env.DB.prepare("DELETE FROM community_laps WHERE id=?1").bind(l.id));
    }
    q2.push(
      env.DB.prepare("UPDATE community_reports SET user_id=?2 WHERE user_id=?1").bind(d.id, u.id),
      env.DB.prepare("UPDATE OR IGNORE community_setups SET user_id=?2 WHERE user_id=?1").bind(d.id, u.id),
      env.DB.prepare("DELETE FROM community_setups WHERE user_id=?1").bind(d.id),
      env.DB.prepare("UPDATE track_maps SET user_id=?2 WHERE user_id=?1").bind(d.id, u.id),
      env.DB.prepare("DELETE FROM community_users WHERE id=?1").bind(d.id)
    );
    await env.DB.batch(q2);
    await moveDriver(env, "acct:" + d.id, "acct:" + u.id);
    for (const c of combos2) {
      const [g, tr2, ca] = c.split("|");
      await markModel(env, g, +tr2, +ca);
    }
    return json10({ adopted: laps.length });
  }
  if (p === "/rival-names" && m === "POST") {
    if (!u.account) return err6("sign in with your Pitlane HQ account", 401);
    const items = (Array.isArray(body.items) ? body.items : []).slice(0, 600);
    let named = 0;
    for (const x of items) {
      const carId = int3(x && x.carId), trackId = int3(x && x.trackId), time = num2(x && x.time), full = driverName(x && (x.name || x.short));
      if (!carId || !trackId || !(time > 10) || !full) continue;
      const short = shortDriverName(full);
      const hit = await env.DB.prepare(
        `SELECT DISTINCT u.id FROM community_laps l JOIN community_users u ON u.id=l.user_id
         WHERE l.car_id=?1 AND l.track_id=?2 AND abs(l.time-?3)<0.0006 AND u.id LIKE 'o:%' AND (u.alias='Anonymous' OR u.alias=?5) AND u.owner=?4`
      ).bind(await famId(env, gameOf(x && x.game), carId), trackId, time, u.id, short).all();
      const ids = (hit.results || []).map((r2) => r2.id);
      if (ids.length !== 1) continue;
      await env.DB.prepare("UPDATE community_users SET alias=?2 WHERE id=?1 AND (alias='Anonymous' OR alias=?3)").bind(ids[0], full, short).run();
      named++;
    }
    return json10({ named });
  }
  if (p === "/link-driver" && m === "POST") {
    if (!u.account) return err6("sign in with your Pitlane HQ account", 401);
    if (typeof body.key !== "string" || !/^[0-9a-f]{16,64}$/i.test(body.key)) return err6("missing key", 400);
    const r2 = await linkDriver(env, u.id, await otherId(env, body.key), game);
    return r2.error ? err6(r2.error, r2.status) : json10(r2);
  }
  if (p === "/lics" && m === "POST") {
    if (!u.account) return err6("sign in with your Pitlane HQ account", 401);
    const row = await env.DB.prepare("SELECT lics FROM community_users WHERE id=?1").bind(u.id).first();
    let out = {};
    try {
      out = JSON.parse(row && row.lics || "{}") || {};
    } catch (e) {
    }
    let n = 0;
    for (const k of CATS) {
      const v = licOf(body.lics && body.lics[k]);
      if (v) {
        out[k] = v;
        n++;
      }
    }
    if (!n) return err6("no license classes", 400);
    await env.DB.prepare("UPDATE community_users SET lics=?2 WHERE id=?1").bind(u.id, JSON.stringify(out)).run();
    return json10({ ok: true, lics: out });
  }
  if (p === "/me" && m === "POST") {
    if (u.account) return err6("change your public name in your account", 400);
    await env.DB.prepare("UPDATE community_users SET alias=?2 WHERE id=?1").bind(u.id, cleanAlias(body.alias)).run();
    return json10({ ok: true });
  }
  if (p === "/me" && m === "DELETE") {
    await env.DB.batch([
      env.DB.prepare("DELETE FROM community_laps WHERE user_id=?1").bind(u.id),
      env.DB.prepare("DELETE FROM community_reports WHERE user_id=?1").bind(u.id),
      env.DB.prepare("DELETE FROM community_setups WHERE user_id=?1").bind(u.id),
      ...u.account ? [] : [env.DB.prepare("DELETE FROM community_users WHERE id=?1").bind(u.id)]
    ]);
    return json10({ deleted: true });
  }
  if (p === "/share-lap" && m === "POST") {
    if (!u.account) return err6("sign in with your Pitlane HQ account", 401);
    const s = await env.DB.prepare("SELECT * FROM sessions WHERE id=?1 AND uploader=?2").bind(String(body.sessionId || ""), "acct:" + u.id).first();
    if (!s) return err6("session not found in your account", 404);
    const lap = body.lapId ? await env.DB.prepare("SELECT time, sectors, trace, valid FROM laps WHERE id=?1 AND session_id=?2 AND drv IS NULL").bind(String(body.lapId), s.id).first() : await env.DB.prepare("SELECT time, sectors, trace FROM laps WHERE session_id=?1 AND valid=1 AND drv IS NULL AND time>0 AND trace IS NOT NULL ORDER BY time LIMIT 1").bind(s.id).first() || await env.DB.prepare("SELECT time, sectors, trace FROM laps WHERE session_id=?1 AND valid=1 AND drv IS NULL AND time>0 ORDER BY time LIMIT 1").bind(s.id).first();
    if (!lap || !(lap.time > 10)) return err6("this session has no valid lap to share", 404);
    if (body.lapId && lap.valid !== 1) return err6("this lap is not valid (off track or the pit lane): it cannot be shared", 400);
    const name2 = s.track + (s.track_config ? " \xB7 " + s.track_config : "");
    const g = s.game || "iracing";
    const { trackId, carId } = await comboIds(env, s, name2, g, u.id, body);
    const r2 = await keepBestLap(env, u.id, { game: g, carId, trackId, car: s.car, track: name2, time: lap.time, sectors: lap.sectors, trace: lap.trace, anon: !!body.anon, shown: shownAs, count: /* @__PURE__ */ __name(() => countUpload(env, u), "count"), ctx });
    if (r2.limit) return err6("too many uploads today", 429);
    if (r2.kept) return json10({ kept: "your faster lap is already shared", traced: r2.traced });
    return json10({ shared: true, traced: r2.traced });
  }
  if (p === "/laps" && m === "POST") {
    const carId = int3(body.carId), trackId = int3(body.trackId), time = num2(body.time);
    if (!carId || !trackId || !time || time <= 10 || time > 3600) return err6("lap needs carId, trackId and time", 400);
    if (isTestDrive(body.kind)) return json10({ kept: "laps of a test drive are not shared" });
    const sectors = Array.isArray(body.sectors) ? JSON.stringify(body.sectors.filter((x) => typeof x === "number").slice(0, 10)) : null;
    if (typeof body.other === "string" && /^[0-9a-f]{16,64}$/i.test(body.other)) {
      if (!u.account) return err6("sign in with your Pitlane HQ account to share other drivers' times", 401);
      const oid = await otherId(env, body.other);
      const plain2 = body.trace && Array.isArray(body.trace.d) && body.trace.d.length >= 60 ? JSON.stringify({ ...body.trace, src: body.trace.src === "real" ? "real" : "field" }) : null;
      if (plain2 && plain2.length > 9e5) return err6("lap trace too large", 400);
      const link = await env.DB.prepare("SELECT l.account_id AS id, a.anon, a.name_kind FROM driver_links l JOIN accounts a ON a.id=l.account_id WHERE l.oid=?1 AND l.game=?2").bind(oid, game).first();
      if (link) {
        const r5 = await keepBestLap(env, link.id, { game, carId, trackId, car: body.car, track: body.track, time, sectors, trace: await sealData(env, plain2), cls: body.cls, wet: wetOf(body.trace && body.trace.f), anon: !!link.anon, shown: link.name_kind === "iracing" ? "iracing" : "nick", lic: body.lic, cat: body.cat, official: body.official, ai: body.ai === true, count: /* @__PURE__ */ __name(() => countUpload(env, u), "count"), ctx });
        if (r5.limit) return err6("too many uploads today", 429);
        return json10(r5.kept ? { kept: "a faster lap of this driver is already shared" } : { shared: true });
      }
      const short = driverName(body.name || body.short);
      await env.DB.prepare("INSERT INTO community_users (id, token_hash, alias, created, owner) VALUES (?1,?2,?5,?3,?4) ON CONFLICT(id) DO UPDATE SET alias=excluded.alias WHERE excluded.alias<>'Anonymous'").bind(oid, "other:" + oid, Date.now(), u.id, short || "Anonymous").run();
      const r4 = await keepBestLap(env, oid, { game, carId, trackId, car: body.car, track: body.track, time, sectors, trace: await sealData(env, plain2), cls: body.cls, wet: wetOf(body.trace && body.trace.f), anon: true, shown: body.hidden ? "model" : "nick", lic: body.lic, cat: body.cat, official: body.official, ai: body.ai === true, count: /* @__PURE__ */ __name(() => countUpload(env, u), "count") });
      if (r4.limit) return err6("too many uploads today", 429);
      return json10(r4.kept ? { kept: "a faster lap of this driver is already shared" } : { shared: true });
    }
    const plainTrace = body.trace ? JSON.stringify(body.trace) : null;
    if (plainTrace && plainTrace.length > 9e5) return err6("lap trace too large", 400);
    const trace = await sealData(env, plainTrace);
    const r2 = await keepBestLap(env, u.id, { game, carId, trackId, car: body.car, track: body.track, time, sectors, trace, cls: body.cls, wet: wetOf(body.trace && body.trace.f), anon: !!body.anon, shown: shownAs, lic: body.lic, cat: body.cat, official: body.official, ai: body.ai === true, count: /* @__PURE__ */ __name(() => countUpload(env, u), "count"), ctx });
    if (r2.limit) return err6("too many uploads today", 429);
    return json10(r2.kept ? { kept: "your faster lap is already shared" } : { shared: true });
  }
  if (p === "/trackinfo" && m === "POST") {
    const trackId = int3(body.trackId);
    if (!trackId || !(Number.isInteger(body.nturns) && body.nturns >= 1 && body.nturns <= 60)) return err6("trackInfo needs trackId and nturns", 400);
    return json10({ ok: true, changed: await noteTurnCount(env, game, trackId, str3(body.track), body.nturns) });
  }
  if (p === "/trackmaps" && m === "POST") {
    const trackId = int3(body.trackId), time = num2(body.time), n = int3(body.n);
    if (trackId && Number.isInteger(body.nturns)) await noteTurnCount(env, game, trackId, str3(body.track), body.nturns).catch(() => {
    });
    const x = body.x, y = body.y;
    if (!trackId || !time || time <= 10 || time > 3600) return err6("layout needs trackId and the lap time", 400);
    if (body.clean !== true) return err6("only laps without incidents", 400);
    if (!(n >= 100 && n <= 3e3) || !Array.isArray(x) || !Array.isArray(y) || x.length !== n || y.length !== n) return err6("layout points missing", 400);
    const ok = /* @__PURE__ */ __name((v) => typeof v === "number" && isFinite(v) && Math.abs(v) < 3e4, "ok");
    if (!x.every(ok) || !y.every(ok)) return err6("layout points out of range", 400);
    const g = Array.isArray(body.g) && body.g.length === 2 && body.g.every((v) => typeof v === "number" && isFinite(v)) && Math.abs(body.g[0]) <= 90 && Math.abs(body.g[1]) <= 180 ? body.g.map((v) => Math.round(v * 1e5) / 1e5) : null;
    const r2 = /* @__PURE__ */ __name((v) => Math.round(v * 10) / 10, "r2");
    const old = await env.DB.prepare("SELECT time, geo FROM track_maps WHERE game=?1 AND track_id=?2").bind(game, trackId).first();
    if (old && old.geo && !g) return json10({ kept: "a layout from the game's position already draws this track" });
    if (old && old.time <= time && !(g && !old.geo)) return json10({ kept: "a faster clean lap already drew this track" });
    if (!await countUpload(env, u)) return err6("too many uploads today", 429);
    await env.DB.prepare(
      `INSERT INTO track_maps (game, track_id, track, n, len, pts, time, user_id, created, geo) VALUES (?1,?2,?3,?4,?5,?6,?7,?8,?9,?10)
       ON CONFLICT(game, track_id) DO UPDATE SET track=excluded.track, n=excluded.n, len=excluded.len, pts=excluded.pts, time=excluded.time, user_id=excluded.user_id, created=excluded.created, geo=excluded.geo`
    ).bind(game, trackId, str3(body.track), n, num2(body.len), JSON.stringify({ x: x.map(r2), y: y.map(r2) }), time, u.id, Date.now(), g ? JSON.stringify(g) : null).run();
    return json10({ shared: true });
  }
  if (p === "/pitlane" && m === "POST") {
    const trackId = int3(body.trackId), n = int3(body.n), pts = body.pts;
    if (!trackId || !(n >= 60 && n <= 4e3) || !Array.isArray(pts) || pts.length < 10 || pts.length > 2e3) return err6("pit lane needs trackId, n and its points", 400);
    const ok = pts.every((q2) => Array.isArray(q2) && q2.length === 2 && Number.isInteger(q2[0]) && q2[0] >= 0 && q2[0] < n && typeof q2[1] === "number" && isFinite(q2[1]) && Math.abs(q2[1]) <= 80);
    if (!ok) return err6("pit lane points out of range", 400);
    if (!await countUpload(env, u)) return err6("too many uploads today", 429);
    const old = await env.DB.prepare("SELECT n, pts FROM track_pits WHERE game=?1 AND track_id=?2").bind(game, trackId).first();
    const keep = old && Math.abs(old.n - n) <= 4 ? JSON.parse(old.pts) : {};
    for (const [i, v] of pts) keep[i] = keep[i] == null ? v : Math.round((keep[i] * 0.6 + v * 0.4) * 10) / 10;
    await env.DB.prepare(`INSERT INTO track_pits (game, track_id, n, pts, updated) VALUES (?1,?2,?3,?4,?5)
       ON CONFLICT(game, track_id) DO UPDATE SET n=excluded.n, pts=excluded.pts, updated=excluded.updated`).bind(game, trackId, n, JSON.stringify(keep), Date.now()).run();
    return json10({ shared: true, points: Object.keys(keep).length });
  }
  if (p === "/reports" && m === "POST") {
    const data = JSON.stringify(body.report || {});
    if (data.length < 20 || data.length > 9e5) return err6("report missing or too large", 400);
    if (!await countUpload(env, u)) return err6("too many uploads today", 429);
    const r2 = body.report;
    await env.DB.prepare("INSERT INTO community_reports (id, user_id, car_id, car, track_id, track, data, created, anon, game, finish, field, best, shown) VALUES (?1,?2,?3,?4,?5,?6,?7,?8,?9,?10,?11,?12,?13,?14)").bind(rid6(), u.id, int3(r2.carId), str3(r2.car), int3(r2.trackId), str3(r2.track), await sealData(env, data), Date.now(), body.anon ? 1 : 0, gameOf(body.game || r2.game), int3(r2.finish), int3(r2.field), num2(r2.best), shownAs).run();
    return json10({ shared: true });
  }
  return err6("not found", 404);
}
__name(community, "community");

// src/news.js
var FEED = "https://www.iracing.com/feed/";
var H2 = { "content-type": "application/json; charset=utf-8", "access-control-allow-origin": "*", "access-control-allow-headers": "authorization,content-type" };
var ENT = { amp: "&", lt: "<", gt: ">", quot: '"', apos: "'", nbsp: " " };
function unesc2(s) {
  return s.replace(/&(#x[0-9a-f]+|#\d+|[a-z]+);/gi, (m, e) => {
    if (e[0] === "#") {
      const n = e[1] === "x" || e[1] === "X" ? parseInt(e.slice(2), 16) : parseInt(e.slice(1), 10);
      return n > 0 && n < 1114112 ? String.fromCodePoint(n) : "";
    }
    return ENT[e.toLowerCase()] ?? m;
  });
}
__name(unesc2, "unesc");
var cdata = /* @__PURE__ */ __name((s) => s.replace(/<!\[CDATA\[([\s\S]*?)\]\]>/g, "$1"), "cdata");
function plain(s, max) {
  s = unesc2(cdata(s || "").replace(/<[^>]*>/g, " ")).replace(/\s+/g, " ").trim();
  return s.length > max ? s.slice(0, max).trim() + "\u2026" : s;
}
__name(plain, "plain");
var tag2 = /* @__PURE__ */ __name((x, t) => {
  const m = x.match(new RegExp(`<${t}[^>]*>([\\s\\S]*?)</${t}>`, "i"));
  return m ? m[1] : "";
}, "tag");
var https = /* @__PURE__ */ __name((u) => /^https:\/\//.test(u) ? u : "", "https");
function parseFeed(xml) {
  const out = [];
  for (const m of xml.matchAll(/<item\b[\s\S]*?<\/item>/gi)) {
    const x = m[0];
    const link = https(unesc2(cdata(tag2(x, "link")).trim()));
    if (!link) continue;
    const tags = [...x.matchAll(/<category[^>]*>([\s\S]*?)<\/category>/gi)].map((c) => plain(c[1], 60)).filter(Boolean);
    const d = Date.parse(cdata(tag2(x, "pubDate")).trim());
    let image = "";
    const media = x.match(/<(?:media:content|enclosure)[^>]*\burl="([^"]+)"/i);
    if (media) image = https(unesc2(media[1]));
    if (!image) {
      const im = cdata(tag2(x, "content:encoded") + tag2(x, "description")).match(/<img[^>]+src="([^"]+)"/i);
      if (im) image = https(unesc2(im[1]));
    }
    out.push({ title: plain(tag2(x, "title"), 200), link, summary: plain(tag2(x, "description"), 320), tags, date: isNaN(d) ? 0 : d, image });
  }
  return out;
}
__name(parseFeed, "parseFeed");
async function news(req, env, ctx) {
  if (req.method === "OPTIONS") return new Response(null, { headers: { ...H2, "access-control-allow-methods": "GET" } });
  const cache2 = caches.default, key = new Request("https://news.cache/iracing");
  const url = new URL(req.url);
  if (url.searchParams.get("refresh") !== "1") {
    const hit = await cache2.match(key);
    if (hit) return new Response(hit.body, { headers: H2 });
  }
  let items;
  try {
    const r2 = await fetch(FEED, { headers: { "user-agent": "PitlaneHQ-server" }, cf: { cacheTtl: 900 } });
    if (!r2.ok) throw new Error("iracing.com answered HTTP " + r2.status);
    items = parseFeed(await r2.text());
  } catch (e) {
    return new Response(JSON.stringify({ error: "could not read the iRacing news: " + (e && e.message) }), { status: 502, headers: H2 });
  }
  const body = JSON.stringify({ items });
  const put = cache2.put(key, new Response(body, { headers: { ...H2, "cache-control": "max-age=1800" } }));
  if (ctx && ctx.waitUntil) ctx.waitUntil(put);
  else await put;
  return new Response(body, { headers: H2 });
}
__name(news, "news");

// src/worker.js
import VIEWER from "./08b98ecbb95c8d52a3cf408dc7ea49553569cdf3-viewer.html";

// src/live.js
import { DurableObject } from "cloudflare:workers";
var MAX_MSG = 512 * 1024;
var jerr = /* @__PURE__ */ __name((msg, status) => new Response(JSON.stringify({ error: msg }), { status, headers: { "content-type": "application/json" } }), "jerr");
async function live(req, env) {
  if (!env.LIVE) return jerr("live telemetry is not set up on this server", 404);
  if ((req.headers.get("upgrade") || "").toLowerCase() !== "websocket") return jerr("expected a WebSocket", 426);
  const url = new URL(req.url);
  const r0 = url.searchParams.get("role");
  const role = r0 === "pc" ? "pc" : r0 === "idle" ? "idle" : "view";
  const share = url.searchParams.get("share") || "";
  if (share && !/^[0-9a-f]{32}$/.test(share)) return jerr("bad share code", 400);
  const protos = (req.headers.get("sec-websocket-protocol") || "").split(",").map((x) => x.trim()).filter(Boolean);
  let auth = req.headers.get("authorization") || "";
  if (!auth && protos[0] === "pitlane" && protos[1]) auth = "Bearer " + protos[1];
  const acc = auth ? await sessionAccount(new Request(req.url, { headers: { authorization: auth } }), env) : null;
  if (!acc && (!share || role === "pc")) return jerr("sign in again", 401);
  const room = env.LIVE.get(env.LIVE.idFromName(share ? "share:" + share : acc.id));
  const h = new Headers(req.headers);
  h.set("x-live-role", role);
  h.set("x-live-proto", protos[0] === "pitlane" ? "pitlane" : "");
  h.delete("authorization");
  h.delete("sec-websocket-protocol");
  h.delete("x-live-nudge");
  return room.fetch(new Request(req.url, { headers: h }));
}
__name(live, "live");
var LiveRoom = class extends DurableObject {
  static {
    __name(this, "LiveRoom");
  }
  constructor(ctx, env) {
    super(ctx, env);
    ctx.setWebSocketAutoResponse(new WebSocketRequestResponsePair("ping", "pong"));
  }
  socks(role, except) {
    return this.ctx.getWebSockets(role).filter((w) => w !== except && w.readyState === 1);
  }
  tell(list, obj) {
    const s = JSON.stringify(obj);
    for (const w of list) {
      try {
        w.send(s);
      } catch (e) {
      }
    }
  }
  // the PC needs to know whether anybody watches; the viewers (and the idle screens) whether the PC is there
  announce(except) {
    const pcs = this.socks("pc", except), views = this.socks("view", except);
    this.tell(pcs, { ctl: "viewers", n: views.length });
    this.tell([...views, ...this.socks("idle", except)], { ctl: "pc", on: pcs.length > 0 });
  }
  async fetch(req) {
    if (req.headers.get("x-live-nudge") === "sync") {
      this.tell([...this.socks("pc"), ...this.socks("view"), ...this.socks("idle")], { ctl: "sync", version: Number(req.headers.get("x-live-version") || 0) });
      return new Response(null, { status: 204 });
    }
    const r0 = req.headers.get("x-live-role"), role = r0 === "pc" ? "pc" : r0 === "idle" ? "idle" : "view";
    const pair = new WebSocketPair();
    const [client, server] = Object.values(pair);
    if (role === "pc") {
      for (const w of this.socks("pc")) {
        try {
          w.close(4e3, "replaced");
        } catch (e) {
        }
      }
    } else if (this.socks(role).length >= (role === "idle" ? 16 : 8)) {
      return jerr("too many screens watching", 429);
    }
    this.ctx.acceptWebSocket(server, [role]);
    this.announce();
    const h = new Headers();
    if (req.headers.get("x-live-proto")) h.set("sec-websocket-protocol", "pitlane");
    return new Response(null, { status: 101, webSocket: client, headers: h });
  }
  async webSocketMessage(ws, msg) {
    if (typeof msg !== "string" || msg.length > MAX_MSG) return;
    const role = this.ctx.getTags(ws)[0];
    if (!msg.startsWith("e:") || role === "idle") return;
    const to = this.socks(role === "pc" ? "view" : "pc");
    for (const w of to) {
      try {
        w.send(msg);
      } catch (e) {
      }
    }
  }
  async webSocketClose(ws, code) {
    try {
      ws.close(code === 1005 || code === 1006 ? 1e3 : code, "bye");
    } catch (e) {
    }
    this.announce(ws);
  }
  async webSocketError(ws) {
    this.announce(ws);
  }
};

// src/seo-topics.js
var TOPICS = [
  {
    id: "coach",
    img: "coach.jpg",
    lmu: "lmu-coach",
    en: {
      path: "/iracing-coach",
      title: "iRacing coach that shows where you lose time \xB7 Pitlane HQ",
      desc: "A free iRacing driving coach. Pitlane HQ compares your lap with real faster laps and tells you which corners cost the most and what to change.",
      h1: "An iRacing coach that uses real laps",
      lead: "Pitlane HQ compares your lap with a faster lap driven by a real person on the same car and track, and tells you, corner by corner, where the time goes and what to change first.",
      secs: [
        ["The corners that cost the most", "Every corner of the lap is measured against the reference, where you brake, how fast you reach the apex and when you pick up the throttle. The coach lists the corners that lose the most time first."],
        ["A tip that follows the data", "Brake later or earlier, carry more speed to the apex, pick up the throttle sooner, take a different line or gear. Each tip comes from what your lap and the faster one really did."],
        ["Real references, not an ideal lap", "The reference is a real lap, the record of the car and track or the lap of the driver just ahead of your pace. Nothing is made up from pieces of different laps."],
        ["A plan for the next session", "What to work on first, the habits that repeat over the lap and the map with the corners marked."],
        ["Live on track", "The coach overlay shows the next corner's tip and braking point while you drive, and after the corner what it gave or took."]
      ],
      faq: [
        ["Is the iRacing coach free?", "Yes. The coach and the telemetry of Pitlane HQ are free."],
        ["Where does the faster lap come from?", "From the laps of Pitlane HQ drivers on the same car and track, the fastest lap and the next level above your pace."],
        ["Do I need to set anything up?", "No. Install Pitlane HQ Agent on the PC where you race, drive, and open Analysis \u2192 Coach."],
        ["Does the coach work in Le Mans Ultimate?", "Yes. It works the same in Le Mans Ultimate, whose support is in beta."]
      ]
    },
    es: {
      path: "/es/coach-iracing",
      title: "Coach para iRacing con vueltas reales \xB7 Pitlane HQ",
      desc: "Un coach de conducci\xF3n gratis para iRacing. Pitlane HQ compara tu vuelta con vueltas reales m\xE1s r\xE1pidas y te dice qu\xE9 curvas te cuestan m\xE1s y qu\xE9 cambiar.",
      h1: "Un coach de iRacing con vueltas reales",
      lead: "Pitlane HQ compara tu vuelta con una vuelta m\xE1s r\xE1pida de una persona real en el mismo coche y circuito, y te dice, curva a curva, d\xF3nde se va el tiempo y qu\xE9 cambiar primero.",
      secs: [
        ["Las curvas que m\xE1s te cuestan", "Cada curva de la vuelta se mide frente a la referencia, d\xF3nde frenas, a qu\xE9 velocidad llegas al v\xE9rtice y cu\xE1ndo vuelves a acelerar. El coach pone primero las curvas que m\xE1s tiempo pierden."],
        ["Un consejo que sigue a los datos", "Frenar m\xE1s tarde o antes, llevar m\xE1s velocidad al v\xE9rtice, acelerar antes, otra trazada u otra marcha. Cada consejo sale de lo que hicieron de verdad tu vuelta y la m\xE1s r\xE1pida."],
        ["Referencias reales, no una vuelta ideal", "La referencia es una vuelta real, el r\xE9cord del coche y circuito o la vuelta del piloto justo por encima de tu ritmo. Nada se inventa con trozos de vueltas distintas."],
        ["Un plan para la pr\xF3xima sesi\xF3n", "Qu\xE9 trabajar primero, los h\xE1bitos que se repiten en la vuelta y el mapa con las curvas marcadas."],
        ["En vivo en pista", "El overlay del coach muestra el consejo y el punto de frenada de la siguiente curva mientras conduces, y al salir lo que ganaste o perdiste."]
      ],
      faq: [
        ["\xBFEl coach de iRacing es gratis?", "S\xED. El coach y la telemetr\xEDa de Pitlane HQ son gratis."],
        ["\xBFDe d\xF3nde sale la vuelta m\xE1s r\xE1pida?", "De las vueltas de los pilotos de Pitlane HQ en el mismo coche y circuito, la m\xE1s r\xE1pida y el siguiente nivel por encima de tu ritmo."],
        ["\xBFHay que configurar algo?", "No. Instala Pitlane HQ Agent en el PC donde corres, conduce y abre An\xE1lisis \u2192 Coach."],
        ["\xBFEl coach funciona en Le Mans Ultimate?", "S\xED. Funciona igual en Le Mans Ultimate, cuyo soporte est\xE1 en beta."]
      ]
    },
    pt: {
      path: "/pt/coach-iracing",
      title: "Coach para iRacing com voltas reais \xB7 Pitlane HQ",
      desc: "Um coach de pilotagem gr\xE1tis para iRacing. O Pitlane HQ compara sua volta com voltas reais mais r\xE1pidas e diz quais curvas custam mais e o que mudar.",
      h1: "Um coach de iRacing com voltas reais",
      lead: "O Pitlane HQ compara sua volta com uma volta mais r\xE1pida de uma pessoa real no mesmo carro e pista, e diz, curva a curva, onde o tempo vai embora e o que mudar primeiro.",
      secs: [
        ["As curvas que mais custam", "Cada curva da volta \xE9 medida contra a refer\xEAncia, onde voc\xEA freia, com que velocidade chega ao \xE1pice e quando volta a acelerar. O coach mostra primeiro as curvas que mais perdem tempo."],
        ["Uma dica que segue os dados", "Frear mais tarde ou antes, levar mais velocidade ao \xE1pice, acelerar antes, outro tra\xE7ado ou outra marcha. Cada dica vem do que sua volta e a mais r\xE1pida realmente fizeram."],
        ["Refer\xEAncias reais, n\xE3o uma volta ideal", "A refer\xEAncia \xE9 uma volta real, o recorde do carro e pista ou a volta do piloto logo acima do seu ritmo. Nada \xE9 inventado com peda\xE7os de voltas diferentes."],
        ["Um plano para a pr\xF3xima sess\xE3o", "O que treinar primeiro, os h\xE1bitos que se repetem na volta e o mapa com as curvas marcadas."],
        ["Ao vivo na pista", "O overlay do coach mostra a dica e o ponto de frenagem da pr\xF3xima curva enquanto voc\xEA pilota, e na sa\xEDda o que voc\xEA ganhou ou perdeu."]
      ],
      faq: [
        ["O coach de iRacing \xE9 gr\xE1tis?", "Sim. O coach e a telemetria do Pitlane HQ s\xE3o gr\xE1tis."],
        ["De onde vem a volta mais r\xE1pida?", "Das voltas dos pilotos do Pitlane HQ no mesmo carro e pista, a mais r\xE1pida e o pr\xF3ximo n\xEDvel acima do seu ritmo."],
        ["Preciso configurar algo?", "N\xE3o. Instale o Pitlane HQ Agent no PC onde voc\xEA corre, pilote e abra An\xE1lise \u2192 Coach."],
        ["O coach funciona no Le Mans Ultimate?", "Sim. Funciona igual no Le Mans Ultimate, cujo suporte est\xE1 em beta."]
      ]
    }
  },
  {
    id: "compare",
    img: "compare.jpg",
    lmu: "lmu-compare",
    en: {
      path: "/iracing-lap-comparison",
      title: "Compare iRacing laps side by side \xB7 Pitlane HQ",
      desc: "Compare two iRacing laps for free. Speed, throttle, brake, gear, steering and the time gap along the lap, with the track map, sectors and braking points.",
      h1: "Compare two iRacing laps",
      lead: "Put any two laps side by side, two of yours, one from another session, the record of the car and track or a lap from the leaderboard. Pitlane HQ shows where one gains and the other loses, metre by metre.",
      secs: [
        ["The charts along the lap", "Speed, throttle, brake, gear and steering of both laps, and the time gap growing or shrinking, with the corners marked by their official turn numbers."],
        ["The track map", "Where lap A gains or loses against lap B, both laps' braking points, the incidents and the two racing lines."],
        ["Every corner at a glance", "Each corner as a small bar with the time it gives or takes. Press one and the charts and the map go to it."],
        ["Laps from anyone", "Compare with the record of the car and track or with the driver just ahead of your pace, taken from real laps."],
        ["Away from the PC", "Your laps are in your account, so you compare them at pitlanehq.app or in the Android app as well."]
      ],
      faq: [
        ["Can I compare my lap with someone else's?", "Yes, with any lap on the Pitlane HQ leaderboards for the same car and track."],
        ["Can I see it without the PC?", "Yes. Your laps are in your account, so open them at pitlanehq.app or in the Android app."],
        ["Can I compare Le Mans Ultimate laps?", "Yes. Lap comparison works the same in Le Mans Ultimate, in beta."],
        ["Is it free?", "Yes."]
      ]
    },
    es: {
      path: "/es/comparar-vueltas-iracing",
      title: "Comparar vueltas de iRacing una junto a otra \xB7 Pitlane HQ",
      desc: "Compara gratis dos vueltas de iRacing. Velocidad, acelerador, freno, marcha, volante y la diferencia de tiempo, con el mapa, los sectores y las frenadas.",
      h1: "Compara dos vueltas de iRacing",
      lead: "Pon dos vueltas una al lado de la otra, dos tuyas, una de otra sesi\xF3n, el r\xE9cord del coche y circuito o una vuelta de la clasificaci\xF3n. Pitlane HQ te ense\xF1a d\xF3nde gana una y pierde la otra, metro a metro.",
      secs: [
        ["Las gr\xE1ficas a lo largo de la vuelta", "Velocidad, acelerador, freno, marcha y volante de las dos vueltas, y la diferencia de tiempo creciendo o bajando, con las curvas marcadas por su n\xFAmero oficial."],
        ["El mapa del circuito", "D\xF3nde la vuelta A gana o pierde frente a la B, las frenadas de las dos, los incidentes y las dos trazadas."],
        ["Cada curva de un vistazo", "Cada curva como una barra peque\xF1a con el tiempo que da o quita. P\xFAlsala y las gr\xE1ficas y el mapa van a ella."],
        ["Vueltas de cualquiera", "Comp\xE1rate con el r\xE9cord del coche y circuito o con el piloto justo por encima de tu ritmo, con vueltas reales."],
        ["Lejos del PC", "Tus vueltas est\xE1n en tu cuenta, as\xED que tambi\xE9n las comparas en pitlanehq.app o en la app de Android."]
      ],
      faq: [
        ["\xBFPuedo comparar mi vuelta con la de otro?", "S\xED, con cualquier vuelta de las clasificaciones de Pitlane HQ del mismo coche y circuito."],
        ["\xBFPuedo verlo sin el PC?", "S\xED. Tus vueltas est\xE1n en tu cuenta, as\xED que \xE1brelas en pitlanehq.app o en la app de Android."],
        ["\xBFPuedo comparar vueltas de Le Mans Ultimate?", "S\xED. La comparaci\xF3n funciona igual en Le Mans Ultimate, en beta."],
        ["\xBFEs gratis?", "S\xED."]
      ]
    },
    pt: {
      path: "/pt/comparar-voltas-iracing",
      title: "Comparar voltas do iRacing lado a lado \xB7 Pitlane HQ",
      desc: "Compare gr\xE1tis duas voltas do iRacing. Velocidade, acelerador, freio, marcha, volante e a diferen\xE7a de tempo, com o mapa, os setores e as frenagens.",
      h1: "Compare duas voltas do iRacing",
      lead: "Coloque duas voltas lado a lado, duas suas, uma de outra sess\xE3o, o recorde do carro e pista ou uma volta da classifica\xE7\xE3o. O Pitlane HQ mostra onde uma ganha e a outra perde, metro a metro.",
      secs: [
        ["Os gr\xE1ficos ao longo da volta", "Velocidade, acelerador, freio, marcha e volante das duas voltas, e a diferen\xE7a de tempo crescendo ou diminuindo, com as curvas marcadas pelo n\xFAmero oficial."],
        ["O mapa da pista", "Onde a volta A ganha ou perde contra a B, as frenagens das duas, os incidentes e os dois tra\xE7ados."],
        ["Cada curva num relance", "Cada curva como uma barra pequena com o tempo que d\xE1 ou tira. Toque nela e os gr\xE1ficos e o mapa v\xE3o at\xE9 ela."],
        ["Voltas de qualquer um", "Compare com o recorde do carro e pista ou com o piloto logo acima do seu ritmo, com voltas reais."],
        ["Longe do PC", "Suas voltas est\xE3o na sua conta, ent\xE3o voc\xEA tamb\xE9m as compara em pitlanehq.app ou no app Android."]
      ],
      faq: [
        ["Posso comparar minha volta com a de outro?", "Sim, com qualquer volta das classifica\xE7\xF5es do Pitlane HQ no mesmo carro e pista."],
        ["Posso ver sem o PC?", "Sim. Suas voltas est\xE3o na sua conta, ent\xE3o abra em pitlanehq.app ou no app Android."],
        ["Posso comparar voltas do Le Mans Ultimate?", "Sim. A compara\xE7\xE3o funciona igual no Le Mans Ultimate, em beta."],
        ["\xC9 gr\xE1tis?", "Sim."]
      ]
    }
  },
  {
    id: "braking",
    lmu: "lmu-braking",
    en: {
      path: "/iracing-braking-points",
      title: "iRacing braking points and braking markers \xB7 Pitlane HQ",
      desc: "Find your braking points in iRacing. Pitlane HQ shows where you brake against a faster lap, on the map, in the charts and live on track with markers.",
      h1: "Braking points for iRacing",
      lead: "Most lap time is won or lost under braking. Pitlane HQ shows where you brake, how hard and how long, next to a faster lap of the same car, and marks the points on track while you drive.",
      secs: [
        ["Where you brake against a faster lap", "Both laps' braking points on the track map, with the speed before the corner and the lowest speed in it."],
        ["How you brake", "The brake trace of both laps, hard at once or building up, trail braking into the corner, and when you release."],
        ["Braking markers on track", "An overlay marks the next braking point while you drive, taken from the next level above your best lap, and moves with your speed and the car close ahead."],
        ["What the fast drivers do", "Under each corner, the range of braking points and apex speeds of the fastest drivers there, from their real laps."],
        ["Named by the official turns", "T1, T2, T7 and so on, the same numbers as the track's official turns."]
      ],
      faq: [
        ["Where do the braking points come from?", "From real laps of the same car and track, the next level above your pace, or your own best lap while there is none."],
        ["Do the markers work in VR?", "Yes. The overlays also show in the headset through SteamVR."],
        ["Do they work in Le Mans Ultimate?", "Yes. The braking markers and the coach work in Le Mans Ultimate too, in beta."],
        ["Is it free?", "Yes."]
      ]
    },
    es: {
      path: "/es/puntos-de-frenada-iracing",
      title: "Puntos de frenada en iRacing y marcas en pista \xB7 Pitlane HQ",
      desc: "Tus puntos de frenada en iRacing. Pitlane HQ muestra d\xF3nde frenas frente a una vuelta m\xE1s r\xE1pida, en el mapa, en las gr\xE1ficas y en pista con marcas.",
      h1: "Puntos de frenada para iRacing",
      lead: "La mayor parte del tiempo se gana o se pierde frenando. Pitlane HQ muestra d\xF3nde frenas, cu\xE1nto y durante cu\xE1nto, junto a una vuelta m\xE1s r\xE1pida del mismo coche, y marca los puntos en pista mientras conduces.",
      secs: [
        ["D\xF3nde frenas frente a una vuelta m\xE1s r\xE1pida", "Las frenadas de las dos vueltas en el mapa, con la velocidad antes de la curva y la m\xEDnima dentro de ella."],
        ["C\xF3mo frenas", "La traza del freno de las dos vueltas, fuerte de golpe o progresivo, trail braking hacia la curva y cu\xE1ndo sueltas."],
        ["Marcas de frenada en pista", "Un overlay marca el siguiente punto de frenada mientras conduces, sacado del siguiente nivel por encima de tu mejor vuelta, y se mueve con tu velocidad y con el coche que llevas delante."],
        ["Lo que hacen los r\xE1pidos", "Bajo cada curva, entre qu\xE9 metros frenan y a qu\xE9 velocidad pasan el v\xE9rtice los pilotos m\xE1s r\xE1pidos de all\xED, con sus vueltas reales."],
        ["Con las curvas oficiales", "T1, T2, T7 y las dem\xE1s, los mismos n\xFAmeros que las curvas oficiales del circuito."]
      ],
      faq: [
        ["\xBFDe d\xF3nde salen los puntos de frenada?", "De vueltas reales del mismo coche y circuito, el siguiente nivel por encima de tu ritmo, o tu propia mejor vuelta mientras no lo haya."],
        ["\xBFLas marcas funcionan en VR?", "S\xED. Los overlays tambi\xE9n se ven en las gafas a trav\xE9s de SteamVR."],
        ["\xBFFuncionan en Le Mans Ultimate?", "S\xED. Las marcas de frenada y el coach tambi\xE9n funcionan en Le Mans Ultimate, en beta."],
        ["\xBFEs gratis?", "S\xED."]
      ]
    },
    pt: {
      path: "/pt/pontos-de-frenagem-iracing",
      title: "Pontos de frenagem no iRacing e marcas na pista \xB7 Pitlane HQ",
      desc: "Seus pontos de frenagem no iRacing. O Pitlane HQ mostra onde voc\xEA freia contra uma volta mais r\xE1pida, no mapa, nos gr\xE1ficos e na pista com marcas.",
      h1: "Pontos de frenagem para iRacing",
      lead: "A maior parte do tempo se ganha ou se perde na frenagem. O Pitlane HQ mostra onde voc\xEA freia, quanto e por quanto tempo, ao lado de uma volta mais r\xE1pida do mesmo carro, e marca os pontos na pista enquanto voc\xEA pilota.",
      secs: [
        ["Onde voc\xEA freia contra uma volta mais r\xE1pida", "As frenagens das duas voltas no mapa, com a velocidade antes da curva e a m\xEDnima dentro dela."],
        ["Como voc\xEA freia", "O tra\xE7o do freio das duas voltas, forte de uma vez ou progressivo, trail braking para a curva e quando voc\xEA solta."],
        ["Marcas de frenagem na pista", "Um overlay marca o pr\xF3ximo ponto de frenagem enquanto voc\xEA pilota, tirado do pr\xF3ximo n\xEDvel acima da sua melhor volta, e se move com a sua velocidade e o carro \xE0 frente."],
        ["O que os r\xE1pidos fazem", "Embaixo de cada curva, entre quais metros freiam e com que velocidade passam o \xE1pice os pilotos mais r\xE1pidos dali, com suas voltas reais."],
        ["Com as curvas oficiais", "T1, T2, T7 e as outras, os mesmos n\xFAmeros das curvas oficiais da pista."]
      ],
      faq: [
        ["De onde v\xEAm os pontos de frenagem?", "De voltas reais do mesmo carro e pista, o pr\xF3ximo n\xEDvel acima do seu ritmo, ou a sua melhor volta enquanto n\xE3o houver."],
        ["As marcas funcionam em VR?", "Sim. Os overlays tamb\xE9m aparecem nos \xF3culos pelo SteamVR."],
        ["Funcionam no Le Mans Ultimate?", "Sim. As marcas de frenagem e o coach tamb\xE9m funcionam no Le Mans Ultimate, em beta."],
        ["\xC9 gr\xE1tis?", "Sim."]
      ]
    }
  },
  {
    id: "line",
    lmu: "lmu-coach",
    en: {
      path: "/iracing-racing-line",
      title: "iRacing racing line next to a faster lap \xB7 Pitlane HQ",
      desc: "Your iRacing racing line next to a faster lap. Pitlane HQ draws both on the map and says where you were inside or outside at turn-in, apex and exit.",
      h1: "Your racing line in iRacing",
      lead: "Two laps with the same braking point can still be seconds apart because of the line. Pitlane HQ draws your line next to a faster one and measures how far to one side you were, every 5 metres.",
      secs: [
        ["Both lines on the map", "The faster lap's line dashed along the middle of the road and yours beside it, so the difference is plain to see."],
        ["Inside or outside", "At the turn-in, the apex and the exit of each corner, the coach says when you were 1.5 metres or more off the faster line."],
        ["The Line chart", "How far you were to the left or right of the other lap along the whole lap, next to the speed and the inputs."],
        ["From real laps", "The line comes from the laps' own path. When the reference has none, the fastest lap of the car and track with a path gives it."]
      ],
      faq: [
        ["Does iRacing give the position on track?", "Yes. Pitlane HQ takes the car's position from the game, and works it out from speed and heading when there is none, so both lines can be compared."],
        ["Does it work in Le Mans Ultimate?", "Yes. Le Mans Ultimate gives the car's position too, so your line is drawn from it."],
        ["Is it free?", "Yes."]
      ]
    },
    es: {
      path: "/es/trazada-iracing",
      title: "Trazada en iRacing frente a una vuelta r\xE1pida \xB7 Pitlane HQ",
      desc: "Tu trazada en iRacing junto a una vuelta m\xE1s r\xE1pida. Pitlane HQ dibuja las dos en el mapa y dice si ibas por dentro o por fuera en cada curva.",
      h1: "Tu trazada en iRacing",
      lead: "Dos vueltas con el mismo punto de frenada pueden estar a segundos por la trazada. Pitlane HQ dibuja tu l\xEDnea junto a una m\xE1s r\xE1pida y mide cu\xE1nto ibas hacia un lado, cada 5 metros.",
      secs: [
        ["Las dos l\xEDneas en el mapa", "La l\xEDnea de la vuelta m\xE1s r\xE1pida discontinua por el centro de la pista y la tuya a su lado, para ver la diferencia de un vistazo."],
        ["Por dentro o por fuera", "En la entrada, el v\xE9rtice y la salida de cada curva, el coach te dice cu\xE1ndo ibas a 1,5 metros o m\xE1s de la l\xEDnea r\xE1pida."],
        ["La gr\xE1fica de l\xEDnea", "Cu\xE1nto ibas a la izquierda o a la derecha de la otra vuelta durante toda la vuelta, junto a la velocidad y los pedales."],
        ["Con vueltas reales", "La l\xEDnea sale del recorrido de las propias vueltas. Si la referencia no lo tiene, lo da la vuelta m\xE1s r\xE1pida del coche y circuito que s\xED lo tenga."]
      ],
      faq: [
        ["\xBFiRacing da la posici\xF3n en pista?", "S\xED. Pitlane HQ toma la posici\xF3n del coche del juego, y la calcula con la velocidad y la direcci\xF3n cuando no la hay, as\xED que las dos l\xEDneas se pueden comparar."],
        ["\xBFFunciona en Le Mans Ultimate?", "S\xED. Le Mans Ultimate tambi\xE9n da la posici\xF3n del coche, y tu l\xEDnea se dibuja con ella."],
        ["\xBFEs gratis?", "S\xED."]
      ]
    },
    pt: {
      path: "/pt/tracado-iracing",
      title: "Tra\xE7ado no iRacing contra uma volta r\xE1pida \xB7 Pitlane HQ",
      desc: "Seu tra\xE7ado no iRacing ao lado de uma volta mais r\xE1pida. O Pitlane HQ desenha os dois no mapa e diz se voc\xEA estava por dentro ou por fora em cada curva.",
      h1: "Seu tra\xE7ado no iRacing",
      lead: "Duas voltas com o mesmo ponto de frenagem podem estar a segundos por causa do tra\xE7ado. O Pitlane HQ desenha sua linha ao lado de uma mais r\xE1pida e mede o quanto voc\xEA estava para um lado, a cada 5 metros.",
      secs: [
        ["As duas linhas no mapa", "A linha da volta mais r\xE1pida tracejada pelo meio da pista e a sua ao lado, para ver a diferen\xE7a de relance."],
        ["Por dentro ou por fora", "Na entrada, no \xE1pice e na sa\xEDda de cada curva, o coach diz quando voc\xEA estava a 1,5 metro ou mais da linha r\xE1pida."],
        ["O gr\xE1fico de linha", "O quanto voc\xEA estava \xE0 esquerda ou \xE0 direita da outra volta ao longo de toda a volta, ao lado da velocidade e dos pedais."],
        ["Com voltas reais", "A linha vem do percurso das pr\xF3prias voltas. Se a refer\xEAncia n\xE3o tiver, a volta mais r\xE1pida do carro e pista que tiver d\xE1 a linha."]
      ],
      faq: [
        ["O iRacing d\xE1 a posi\xE7\xE3o na pista?", "Sim. O Pitlane HQ pega a posi\xE7\xE3o do carro do jogo, e calcula com a velocidade e a dire\xE7\xE3o quando n\xE3o h\xE1, ent\xE3o as duas linhas podem ser comparadas."],
        ["Funciona no Le Mans Ultimate?", "Sim. O Le Mans Ultimate tamb\xE9m d\xE1 a posi\xE7\xE3o do carro, e sua linha \xE9 desenhada com ela."],
        ["\xC9 gr\xE1tis?", "Sim."]
      ]
    }
  },
  {
    id: "irating",
    img: "race.jpg",
    en: {
      path: "/iracing-irating-tracker",
      title: "iRacing iRating and licence tracker \xB7 Pitlane HQ",
      desc: "Your iRacing iRating and licence in oval, sports car, formula, dirt oval and dirt road, with the change of your last races. Free with Pitlane HQ.",
      h1: "Your iRating and licence in every discipline",
      lead: "iRacing gives you one iRating and one licence per discipline. Pitlane HQ keeps each of them, updated every time you join a session, with what your last races gave or took.",
      secs: [
        ["Five disciplines, five cards", "Oval, sports car, formula, dirt oval and dirt road, each with its iRating, its licence and safety rating as the game shows them."],
        ["What your races did", "The iRating change of your last races of each discipline, and after every race its estimate, replaced by the real change at your next session."],
        ["Race summaries", "Your result, positions gained or lost, incidents and laps of every race, next to the drivers around you."],
        ["Races against the AI apart", "Races against iRacing's AI never touch your iRating, so they show none."]
      ],
      faq: [
        ["Do I need to sign in to iRacing?", "No. Pitlane HQ Agent reads what the game shows while it runs next to iRacing."],
        ["Why is my iRating split by discipline?", "Because iRacing keeps one per discipline. Pitlane HQ never mixes them into one number."],
        ["Is it free?", "Yes."]
      ]
    },
    es: {
      path: "/es/irating-iracing",
      title: "iRating y licencia de iRacing por disciplina \xB7 Pitlane HQ",
      desc: "Tu iRating y licencia de iRacing en \xF3valo, sports car, f\xF3rmula, \xF3valo de tierra y tierra, con el cambio de tus \xFAltimas carreras. Gratis con Pitlane HQ.",
      h1: "Tu iRating y licencia en cada disciplina",
      lead: "iRacing te da un iRating y una licencia por disciplina. Pitlane HQ guarda cada uno, al d\xEDa cada vez que entras en una sesi\xF3n, con lo que te dieron o quitaron tus \xFAltimas carreras.",
      secs: [
        ["Cinco disciplinas, cinco tarjetas", "\xD3valo, sports car, f\xF3rmula, \xF3valo de tierra y tierra, cada una con su iRating, su licencia y su safety rating como los muestra el juego."],
        ["Lo que hicieron tus carreras", "El cambio de iRating de tus \xFAltimas carreras de cada disciplina, y tras cada carrera su estimaci\xF3n, que se cambia por la real en tu siguiente sesi\xF3n."],
        ["Res\xFAmenes de carrera", "Tu resultado, las posiciones ganadas o perdidas, los incidentes y las vueltas de cada carrera, junto a los pilotos de tu alrededor."],
        ["Las carreras contra la IA aparte", "Las carreras contra la IA de iRacing no tocan tu iRating, as\xED que no muestran ninguno."]
      ],
      faq: [
        ["\xBFTengo que iniciar sesi\xF3n en iRacing?", "No. Pitlane HQ Agent lee lo que muestra el juego mientras est\xE1 abierto junto a iRacing."],
        ["\xBFPor qu\xE9 mi iRating va por disciplina?", "Porque iRacing guarda uno por disciplina. Pitlane HQ nunca los mezcla en un solo n\xFAmero."],
        ["\xBFEs gratis?", "S\xED."]
      ]
    },
    pt: {
      path: "/pt/irating-iracing",
      title: "iRating e licen\xE7a do iRacing por disciplina \xB7 Pitlane HQ",
      desc: "Seu iRating e licen\xE7a do iRacing em oval, sports car, f\xF3rmula, oval de terra e terra, com a varia\xE7\xE3o das \xFAltimas corridas. Gr\xE1tis com o Pitlane HQ.",
      h1: "Seu iRating e licen\xE7a em cada disciplina",
      lead: "O iRacing d\xE1 um iRating e uma licen\xE7a por disciplina. O Pitlane HQ guarda cada um, atualizado sempre que voc\xEA entra numa sess\xE3o, com o que suas \xFAltimas corridas deram ou tiraram.",
      secs: [
        ["Cinco disciplinas, cinco cart\xF5es", "Oval, sports car, f\xF3rmula, oval de terra e terra, cada uma com seu iRating, sua licen\xE7a e seu safety rating como o jogo mostra."],
        ["O que suas corridas fizeram", "A varia\xE7\xE3o de iRating das suas \xFAltimas corridas de cada disciplina, e depois de cada corrida a estimativa, trocada pela real na sua pr\xF3xima sess\xE3o."],
        ["Resumos de corrida", "Seu resultado, posi\xE7\xF5es ganhas ou perdidas, incidentes e voltas de cada corrida, ao lado dos pilotos ao seu redor."],
        ["Corridas contra a IA \xE0 parte", "Corridas contra a IA do iRacing n\xE3o mexem no seu iRating, ent\xE3o n\xE3o mostram nenhum."]
      ],
      faq: [
        ["Preciso entrar no iRacing?", "N\xE3o. O Pitlane HQ Agent l\xEA o que o jogo mostra enquanto roda ao lado do iRacing."],
        ["Por que meu iRating \xE9 por disciplina?", "Porque o iRacing guarda um por disciplina. O Pitlane HQ nunca os mistura num s\xF3 n\xFAmero."],
        ["\xC9 gr\xE1tis?", "Sim."]
      ]
    }
  },
  {
    id: "shift",
    lmu: "tel",
    en: {
      path: "/iracing-shift-beep",
      title: "iRacing shift beep at the RPM you choose \xB7 Pitlane HQ",
      desc: "A shift beep for iRacing and Le Mans Ultimate. Pitlane HQ beeps at the revs you choose for each car, one RPM for every gear, one per gear or the shift lights.",
      h1: "A shift beep for iRacing",
      lead: "Keep your eyes on the track. Pitlane HQ beeps when it is time to change up, at the revs you choose for each car, a moment early to make up for your reaction time.",
      secs: [
        ["Your RPM, per car", "The same RPM for every gear or one for each gear, kept for each car."],
        ["Or the best estimate", "From your own flat-out laps Pitlane HQ works out where the next gear would pull harder, gear by gear."],
        ["Or iRacing's shift lights", "The beep at the RPM the game's shift lights use."],
        ["Early, pitch and volume", "How early it sounds, a low, middle or high beep and its volume, in Telemetry \u2192 Rev beep."]
      ],
      faq: [
        ["Where does it sound?", "On the PC where Pitlane HQ runs, or in the screen where you turn it on."],
        ["Does it work in Le Mans Ultimate?", "Yes, with your own RPM or the estimate from your laps."],
        ["Is it free?", "Yes."]
      ]
    },
    es: {
      path: "/es/pitido-cambio-marcha-iracing",
      title: "Pitido de cambio de marcha para iRacing \xB7 Pitlane HQ",
      desc: "Un pitido de cambio para iRacing y Le Mans Ultimate. Pitlane HQ pita a las RPM que elijas en cada coche, para todas las marchas o una por marcha.",
      h1: "Un pitido de cambio de marcha para iRacing",
      lead: "Los ojos en la pista. Pitlane HQ pita cuando toca subir de marcha, a las revoluciones que elijas para cada coche, un instante antes para compensar tu tiempo de reacci\xF3n.",
      secs: [
        ["Tus RPM, por coche", "Las mismas RPM en todas las marchas o unas para cada marcha, guardadas para cada coche."],
        ["O el \xF3ptimo estimado", "Con tus propias vueltas a fondo Pitlane HQ calcula d\xF3nde la siguiente marcha tirar\xEDa m\xE1s, marcha a marcha."],
        ["O las luces de cambio de iRacing", "El pitido a las RPM de las luces de cambio del juego."],
        ["Adelanto, tono y volumen", "Cu\xE1nto antes suena, un pitido grave, medio o agudo y su volumen, en Telemetr\xEDa \u2192 Pitido de revoluciones."]
      ],
      faq: [
        ["\xBFD\xF3nde suena?", "En el PC donde corre Pitlane HQ, o en la pantalla donde lo actives."],
        ["\xBFFunciona en Le Mans Ultimate?", "S\xED, con tus propias RPM o con el \xF3ptimo estimado de tus vueltas."],
        ["\xBFEs gratis?", "S\xED."]
      ]
    },
    pt: {
      path: "/pt/bipe-troca-de-marcha-iracing",
      title: "Bipe de troca de marcha para iRacing \xB7 Pitlane HQ",
      desc: "Um bipe de troca para iRacing e Le Mans Ultimate. O Pitlane HQ apita no RPM que voc\xEA escolher em cada carro, para todas as marchas ou um por marcha.",
      h1: "Um bipe de troca de marcha para iRacing",
      lead: "Olhos na pista. O Pitlane HQ apita quando \xE9 hora de subir de marcha, nos giros que voc\xEA escolher para cada carro, um instante antes para compensar o seu tempo de rea\xE7\xE3o.",
      secs: [
        ["Seu RPM, por carro", "O mesmo RPM em todas as marchas ou um para cada marcha, guardado para cada carro."],
        ["Ou o \xF3timo estimado", "Com as suas voltas de p\xE9 embaixo o Pitlane HQ calcula onde a pr\xF3xima marcha puxaria mais, marcha a marcha."],
        ["Ou as luzes de troca do iRacing", "O bipe no RPM das luzes de troca do jogo."],
        ["Antecipa\xE7\xE3o, tom e volume", "Quanto antes toca, um bipe grave, m\xE9dio ou agudo e o volume, em Telemetria \u2192 Bipe de giros."]
      ],
      faq: [
        ["Onde toca?", "No PC onde o Pitlane HQ roda, ou na tela onde voc\xEA o ativar."],
        ["Funciona no Le Mans Ultimate?", "Sim, com o seu pr\xF3prio RPM ou com o \xF3timo estimado das suas voltas."],
        ["\xC9 gr\xE1tis?", "Sim."]
      ]
    }
  },
  {
    id: "phone",
    phones: ["m-live.png", "m-race.png", "m-analysis-0.png"],
    lmu: "tel",
    en: {
      path: "/iracing-telemetry-on-phone",
      title: "iRacing telemetry live on your phone or tablet \xB7 Pitlane HQ",
      desc: "Your iRacing and Le Mans Ultimate telemetry live on a phone, tablet or browser. Position, delta, fuel, the relative and the map, free on Android and the web.",
      h1: "Your iRacing telemetry on the phone",
      lead: "Put the phone or a tablet next to the wheel and see your race live, position, delta, last lap, fuel, the relative and the map. It works over Wi-Fi or mobile data, from anywhere.",
      secs: [
        ["Same account, nothing to pair", "Sign in on the phone with the same Pitlane HQ account as your PC and press Connect. The PC asks you to accept the phone, by its name."],
        ["A friend can watch", "Make a share code on the PC and a friend watches your telemetry from anywhere. They only watch."],
        ["Your laps afterwards", "Every lap goes to your account. Analyse it on the phone, compare it and read your race summaries."],
        ["On Android and in any browser", "The Android app, or pitlanehq.app in any browser. The iPhone app is coming to the App Store, and until then the web works on the iPhone."],
        ["Le Mans Ultimate too", "The live view works the same with Le Mans Ultimate, in beta."]
      ],
      faq: [
        ["Does the phone need to be on the same Wi-Fi?", "No. It works from anywhere, over Wi-Fi or mobile data."],
        ["Is there an iPhone app?", "It is coming to the App Store. On the iPhone, pitlanehq.app works in the browser and can be added to the home screen."],
        ["Is it free?", "Yes."]
      ]
    },
    es: {
      path: "/es/telemetria-iracing-en-el-movil",
      title: "Telemetr\xEDa de iRacing en vivo en el m\xF3vil \xB7 Pitlane HQ",
      desc: "Tu telemetr\xEDa de iRacing y Le Mans Ultimate en vivo en el m\xF3vil, la tablet o el navegador. Posici\xF3n, delta, combustible, el relative y el mapa, gratis.",
      h1: "Tu telemetr\xEDa de iRacing en el m\xF3vil",
      lead: "Pon el m\xF3vil o una tablet junto al volante y sigue tu carrera en vivo, posici\xF3n, delta, \xFAltima vuelta, combustible, el relative y el mapa. Funciona con Wi-Fi o datos, desde cualquier sitio.",
      secs: [
        ["La misma cuenta, nada que emparejar", "Entra en el m\xF3vil con la misma cuenta de Pitlane HQ que en tu PC y pulsa Conectar. El PC te pide aceptar el m\xF3vil, por su nombre."],
        ["Un amigo puede verla", "Crea un c\xF3digo en el PC y un amigo ve tu telemetr\xEDa desde cualquier sitio. Solo mira."],
        ["Tus vueltas, despu\xE9s", "Cada vuelta va a tu cuenta. Anal\xEDzala en el m\xF3vil, comp\xE1rala y lee tus res\xFAmenes de carrera."],
        ["En Android y en cualquier navegador", "La app de Android, o pitlanehq.app en cualquier navegador. La app de iPhone llegar\xE1 a la App Store, y mientras tanto la web funciona en el iPhone."],
        ["Tambi\xE9n en Le Mans Ultimate", "La vista en vivo funciona igual con Le Mans Ultimate, en beta."]
      ],
      faq: [
        ["\xBFEl m\xF3vil tiene que estar en el mismo Wi-Fi?", "No. Funciona desde cualquier sitio, con Wi-Fi o datos."],
        ["\xBFHay app para iPhone?", "Llegar\xE1 a la App Store. En el iPhone, pitlanehq.app funciona en el navegador y se puede a\xF1adir a la pantalla de inicio."],
        ["\xBFEs gratis?", "S\xED."]
      ]
    },
    pt: {
      path: "/pt/telemetria-iracing-no-celular",
      title: "Telemetria do iRacing ao vivo no celular \xB7 Pitlane HQ",
      desc: "Sua telemetria do iRacing e do Le Mans Ultimate ao vivo no celular, tablet ou navegador. Posi\xE7\xE3o, delta, combust\xEDvel e o mapa, gr\xE1tis no Android e na web.",
      h1: "Sua telemetria do iRacing no celular",
      lead: "Coloque o celular ou um tablet ao lado do volante e acompanhe sua corrida ao vivo, posi\xE7\xE3o, delta, \xFAltima volta, combust\xEDvel, o relative e o mapa. Funciona com Wi-Fi ou dados, de qualquer lugar.",
      secs: [
        ["A mesma conta, nada para parear", "Entre no celular com a mesma conta do Pitlane HQ do seu PC e toque em Conectar. O PC pede para aceitar o celular, pelo nome."],
        ["Um amigo pode assistir", "Crie um c\xF3digo no PC e um amigo v\xEA sua telemetria de qualquer lugar. S\xF3 assiste."],
        ["Suas voltas, depois", "Cada volta vai para a sua conta. Analise no celular, compare e leia seus resumos de corrida."],
        ["No Android e em qualquer navegador", "O app Android, ou pitlanehq.app em qualquer navegador. O app de iPhone vai chegar \xE0 App Store, e at\xE9 l\xE1 a web funciona no iPhone."],
        ["Tamb\xE9m no Le Mans Ultimate", "A vis\xE3o ao vivo funciona igual com o Le Mans Ultimate, em beta."]
      ],
      faq: [
        ["O celular precisa estar no mesmo Wi-Fi?", "N\xE3o. Funciona de qualquer lugar, com Wi-Fi ou dados."],
        ["Tem app para iPhone?", "Vai chegar \xE0 App Store. No iPhone, pitlanehq.app funciona no navegador e pode ser adicionado \xE0 tela inicial."],
        ["\xC9 gr\xE1tis?", "Sim."]
      ]
    }
  },
  {
    id: "free",
    img: "laps.jpg",
    lmu: "tel",
    en: {
      path: "/free-iracing-telemetry",
      title: "Free iRacing and Le Mans Ultimate telemetry \xB7 Pitlane HQ",
      desc: "Free sim racing telemetry for iRacing and Le Mans Ultimate. Lap analysis, a coach with real laps, leaderboards, overlays and live telemetry on your phone.",
      h1: "Free telemetry for iRacing and Le Mans Ultimate",
      lead: "Pitlane HQ puts in one free app what usually takes several. Lap telemetry and analysis, a coach that compares you with real faster laps, overlays on top of the game, leaderboards and your race summaries.",
      secs: [
        ["Telemetry and analysis", "Every lap recorded with nothing to set up, two laps compared on charts and on the map, the sectors and the braking points."],
        ["A coach", "The corners that cost the most against the record or the driver just ahead of your pace, with what to change."],
        ["Overlays", "Relative, standings, radar, delta bar, fuel, tyres, track map, braking markers and more, also in VR."],
        ["Everywhere", "Windows for driving, and the web and Android to look at your laps and follow your race live."],
        ["What is free", "During the beta everything is free. The telemetry, the coach, the leaderboards, the basic overlays and the phone app stay free after it."],
        ["Free Le Mans Ultimate telemetry", "The same app records Le Mans Ultimate, in beta, with nothing to install in the game."]
      ],
      faq: [
        ["Is it really free?", "Yes. The PC app, the web and the Android app are free."],
        ["Looking for a free alternative to RaceLab, Garage 61, Track Titan or VRS?", "Pitlane HQ brings overlays, lap telemetry with comparisons and a coach with reference laps from its own leaderboards together in one free app."],
        ["Which sims?", "iRacing and Le Mans Ultimate (in beta). ACC and Assetto Corsa are in development."]
      ]
    },
    es: {
      path: "/es/telemetria-iracing-gratis",
      title: "Telemetr\xEDa gratis para iRacing y Le Mans Ultimate \xB7 Pitlane HQ",
      desc: "Telemetr\xEDa gratis para iRacing y Le Mans Ultimate. An\xE1lisis de vueltas, un coach con vueltas reales, clasificaciones, overlays y telemetr\xEDa en el m\xF3vil.",
      h1: "Telemetr\xEDa gratis para iRacing y Le Mans Ultimate",
      lead: "Pitlane HQ re\xFAne en una app gratis lo que suele necesitar varias. Telemetr\xEDa y an\xE1lisis de vueltas, un coach que te compara con vueltas reales m\xE1s r\xE1pidas, overlays sobre el juego, clasificaciones y tus res\xFAmenes de carrera.",
      secs: [
        ["Telemetr\xEDa y an\xE1lisis", "Cada vuelta grabada sin configurar nada, dos vueltas comparadas en gr\xE1ficas y en el mapa, los sectores y las frenadas."],
        ["Un coach", "Las curvas que m\xE1s te cuestan frente al r\xE9cord o al piloto justo por encima de tu ritmo, con qu\xE9 cambiar."],
        ["Overlays", "Relative, clasificaci\xF3n, radar, barra de delta, combustible, neum\xE1ticos, mapa, marcas de frenada y m\xE1s, tambi\xE9n en VR."],
        ["En todas partes", "Windows para conducir, y la web y Android para ver tus vueltas y seguir tu carrera en vivo."],
        ["Qu\xE9 es gratis", "Durante la beta todo es gratis. La telemetr\xEDa, el coach, las clasificaciones, los overlays b\xE1sicos y la app del m\xF3vil siguen gratis despu\xE9s."],
        ["Telemetr\xEDa gratis para Le Mans Ultimate", "La misma app graba Le Mans Ultimate, en beta, sin instalar nada en el juego."]
      ],
      faq: [
        ["\xBFDe verdad es gratis?", "S\xED. La app del PC, la web y la app de Android son gratis."],
        ["\xBFBuscas una alternativa gratis a RaceLab, Garage 61, Track Titan o VRS?", "Pitlane HQ junta overlays, telemetr\xEDa de vueltas con comparaciones y un coach con vueltas de referencia de sus propias clasificaciones en una sola app gratis."],
        ["\xBFQu\xE9 simuladores?", "iRacing y Le Mans Ultimate (en beta). ACC y Assetto Corsa est\xE1n en desarrollo."]
      ]
    },
    pt: {
      path: "/pt/telemetria-iracing-gratis",
      title: "Telemetria gr\xE1tis para iRacing e Le Mans Ultimate \xB7 Pitlane HQ",
      desc: "Telemetria gr\xE1tis para iRacing e Le Mans Ultimate. An\xE1lise de voltas, um coach com voltas reais, classifica\xE7\xF5es, overlays e telemetria no celular.",
      h1: "Telemetria gr\xE1tis para iRacing e Le Mans Ultimate",
      lead: "O Pitlane HQ junta num app gr\xE1tis o que costuma precisar de v\xE1rios. Telemetria e an\xE1lise de voltas, um coach que compara voc\xEA com voltas reais mais r\xE1pidas, overlays sobre o jogo, classifica\xE7\xF5es e seus resumos de corrida.",
      secs: [
        ["Telemetria e an\xE1lise", "Cada volta gravada sem configurar nada, duas voltas comparadas em gr\xE1ficos e no mapa, os setores e as frenagens."],
        ["Um coach", "As curvas que mais custam contra o recorde ou o piloto logo acima do seu ritmo, com o que mudar."],
        ["Overlays", "Relative, classifica\xE7\xE3o, radar, barra de delta, combust\xEDvel, pneus, mapa, marcas de frenagem e mais, tamb\xE9m em VR."],
        ["Em todo lugar", "Windows para pilotar, e a web e o Android para ver suas voltas e acompanhar sua corrida ao vivo."],
        ["O que \xE9 gr\xE1tis", "Durante a beta tudo \xE9 gr\xE1tis. A telemetria, o coach, as classifica\xE7\xF5es, os overlays b\xE1sicos e o app de celular continuam gr\xE1tis depois."],
        ["Telemetria gr\xE1tis para Le Mans Ultimate", "O mesmo app grava o Le Mans Ultimate, em beta, sem instalar nada no jogo."]
      ],
      faq: [
        ["\xC9 gr\xE1tis mesmo?", "Sim. O app do PC, a web e o app Android s\xE3o gr\xE1tis."],
        ["Procurando uma alternativa gr\xE1tis ao RaceLab, Garage 61, Track Titan ou VRS?", "O Pitlane HQ junta overlays, telemetria de voltas com compara\xE7\xF5es e um coach com voltas de refer\xEAncia das suas pr\xF3prias classifica\xE7\xF5es num s\xF3 app gr\xE1tis."],
        ["Quais simuladores?", "iRacing e Le Mans Ultimate (em beta). ACC e Assetto Corsa est\xE3o em desenvolvimento."]
      ]
    }
  },
  {
    id: "fuel",
    lmu: "ov",
    en: {
      path: "/iracing-fuel-calculator",
      title: "iRacing fuel calculator that measures every lap \xB7 Pitlane HQ",
      desc: "A live iRacing fuel calculator. The Pitlane HQ fuel overlay measures each lap and shows the laps left and what you may use per lap to finish without a stop.",
      h1: "An iRacing fuel calculator that measures every lap",
      lead: "No table to fill in before the race. The fuel overlay of Pitlane HQ measures what each lap really uses, with your pace and the traffic you meet, and tells you while you drive if the tank reaches the flag.",
      secs: [
        ["What each lap uses", "The last lap's use and the average of the clean laps, measured from the car itself, not from a guess made before the start."],
        ["Laps left in the tank", "How many laps the fuel you carry gives at the pace you are driving, with the spare laps of margin you choose."],
        ["To finish without a stop", "What you may use per lap to reach the flag on the fuel you have. Lift and coast until the number turns green."],
        ["The pit stop", "On the pit road the pit overlay shows your speed against the limit and the fuel and repairs of the stop."],
        ["Every race in your account", "Each lap's fuel goes into your laps, so the next race at the same track starts with what you used last time."]
      ],
      faq: [
        ["Do I need to type the race length or the tank size?", "No. The overlay reads the session, the tank and every lap from iRacing by itself."],
        ["How much margin does it keep?", "0.3 laps by default. You choose the spare laps in the overlay's settings."],
        ["Does it work in Le Mans Ultimate?", "Yes, in beta. The fuel overlay works the same, and the dash shows the virtual energy left."],
        ["Is it free?", "Yes. The fuel overlay is one of the free overlays."]
      ]
    },
    es: {
      path: "/es/calculadora-combustible-iracing",
      title: "Calculadora de combustible para iRacing en vivo \xB7 Pitlane HQ",
      desc: "Una calculadora de combustible en vivo para iRacing. El overlay de Pitlane HQ mide cada vuelta y te dice cu\xE1ntas te quedan y cu\xE1nto gastar para no parar.",
      h1: "Una calculadora de combustible para iRacing que mide cada vuelta",
      lead: "Sin tablas que rellenar antes de la carrera. El overlay de combustible de Pitlane HQ mide lo que gasta de verdad cada vuelta, con tu ritmo y el tr\xE1fico que encuentras, y te dice mientras conduces si el dep\xF3sito llega a la bandera.",
      secs: [
        ["Lo que gasta cada vuelta", "El consumo de la \xFAltima vuelta y la media de las vueltas limpias, medidos en el propio coche, no estimados antes de la salida."],
        ["Vueltas que quedan en el dep\xF3sito", "Cu\xE1ntas vueltas da el combustible que llevas al ritmo al que vas, con las vueltas de margen que elijas."],
        ["Para terminar sin parar", "Lo que puedes gastar por vuelta para llegar a la bandera con el combustible que tienes. Levanta y deja rodar hasta que el n\xFAmero se ponga verde."],
        ["La parada en boxes", "En el pit lane el overlay de boxes muestra tu velocidad frente al l\xEDmite y el combustible y las reparaciones de la parada."],
        ["Cada carrera en tu cuenta", "El combustible de cada vuelta se guarda con tus vueltas, as\xED que la pr\xF3xima carrera en el mismo circuito empieza con lo que gastaste la \xFAltima vez."]
      ],
      faq: [
        ["\xBFTengo que escribir la duraci\xF3n de la carrera o el dep\xF3sito?", "No. El overlay lee la sesi\xF3n, el dep\xF3sito y cada vuelta de iRacing \xE9l solo."],
        ["\xBFCu\xE1nto margen deja?", "0,3 vueltas por defecto. Las vueltas de margen se eligen en los ajustes del overlay."],
        ["\xBFFunciona en Le Mans Ultimate?", "S\xED, en beta. El overlay de combustible funciona igual, y el dash muestra la energ\xEDa virtual que queda."],
        ["\xBFEs gratis?", "S\xED. El overlay de combustible es uno de los overlays gratis."]
      ]
    },
    pt: {
      path: "/pt/calculadora-combustivel-iracing",
      title: "Calculadora de combust\xEDvel para iRacing ao vivo \xB7 Pitlane HQ",
      desc: "Uma calculadora de combust\xEDvel ao vivo para iRacing. O overlay do Pitlane HQ mede cada volta e mostra quantas restam e quanto gastar para n\xE3o parar.",
      h1: "Uma calculadora de combust\xEDvel para iRacing que mede cada volta",
      lead: "Sem tabela para preencher antes da corrida. O overlay de combust\xEDvel do Pitlane HQ mede o que cada volta realmente gasta, com o seu ritmo e o tr\xE1fego que encontra, e diz enquanto voc\xEA pilota se o tanque chega \xE0 bandeirada.",
      secs: [
        ["O que cada volta gasta", "O consumo da \xFAltima volta e a m\xE9dia das voltas limpas, medidos no pr\xF3prio carro, n\xE3o estimados antes da largada."],
        ["Voltas que restam no tanque", "Quantas voltas o combust\xEDvel que voc\xEA leva d\xE1 no ritmo em que est\xE1, com as voltas de margem que escolher."],
        ["Para terminar sem parar", "O que voc\xEA pode gastar por volta para chegar \xE0 bandeirada com o combust\xEDvel que tem. Tire o p\xE9 antes da frenagem at\xE9 o n\xFAmero ficar verde."],
        ["O pit stop", "No pit lane o overlay de boxes mostra sua velocidade contra o limite e o combust\xEDvel e os reparos da parada."],
        ["Cada corrida na sua conta", "O combust\xEDvel de cada volta fica com as suas voltas, ent\xE3o a pr\xF3xima corrida na mesma pista come\xE7a com o que voc\xEA gastou da \xFAltima vez."]
      ],
      faq: [
        ["Preciso digitar a dura\xE7\xE3o da corrida ou o tanque?", "N\xE3o. O overlay l\xEA a sess\xE3o, o tanque e cada volta do iRacing sozinho."],
        ["Quanta margem ele deixa?", "0,3 voltas por padr\xE3o. As voltas de margem s\xE3o escolhidas nos ajustes do overlay."],
        ["Funciona no Le Mans Ultimate?", "Sim, em beta. O overlay de combust\xEDvel funciona igual, e o dash mostra a energia virtual que resta."],
        ["\xC9 gr\xE1tis?", "Sim. O overlay de combust\xEDvel \xE9 um dos overlays gr\xE1tis."]
      ]
    }
  },
  {
    id: "lmu-compare",
    game: "lmu",
    img: "compare.jpg",
    lmu: "compare",
    en: {
      path: "/le-mans-ultimate-lap-comparison",
      title: "Compare Le Mans Ultimate laps side by side \xB7 Pitlane HQ",
      desc: "Compare two Le Mans Ultimate laps on charts and on the map. Speed, throttle, brake, gear and the time gap, against your best or a faster real lap. Free.",
      h1: "Compare Le Mans Ultimate laps side by side",
      lead: "Pitlane HQ records every Le Mans Ultimate lap by itself and lays two of them over each other, yours against your best, a team mate's or a faster lap from the leaderboard of the same car and track.",
      secs: [
        ["Every channel on one chart", "Speed, throttle, brake, gear, steering and the time gap along the lap, so you see where the gap opens and why."],
        ["On the track map", "Both racing lines drawn on the circuit, with the braking points and the corners where the time goes."],
        ["Sector by sector", "The official sectors of Le Mans Ultimate, learnt from the game, and the time of each against the other lap."],
        ["A faster lap to compare with", "The record of the car and track, or the next level above your pace, from the laps of Pitlane HQ drivers and their rivals."],
        ["Hypercar, LMP2, LMP3, GTE and LMGT3", "Every car is compared with laps of the same car on the same track, never another class."],
        ["On the PC, the web and the phone", "Open the comparison wherever you are, the laps are in your account."]
      ],
      faq: [
        ["Do I need to export anything from the game?", "No. Turn on Settings \u2192 Gameplay \u2192 Enable Plugins in Le Mans Ultimate and Pitlane HQ Agent records the laps by itself."],
        ["Can I compare with a faster driver?", "Yes. Lap B can be the record of the car and track or the next level above your pace, both laps someone really drove."],
        ["Does it count laps off the track?", "A lap off the track or not round the whole circuit is never valid, and never a reference."],
        ["Is it free?", "Yes. Le Mans Ultimate support is in beta and free."]
      ]
    },
    es: {
      path: "/es/comparar-vueltas-le-mans-ultimate",
      title: "Comparar vueltas de Le Mans Ultimate \xB7 Pitlane HQ",
      desc: "Compara dos vueltas de Le Mans Ultimate en gr\xE1ficas y en el mapa. Velocidad, acelerador, freno, marcha y diferencia, frente a tu mejor vuelta o una m\xE1s r\xE1pida.",
      h1: "Comparar vueltas de Le Mans Ultimate una junto a otra",
      lead: "Pitlane HQ graba cada vuelta de Le Mans Ultimate \xE9l solo y pone dos una encima de otra, la tuya frente a tu mejor vuelta, la de un compa\xF1ero o una m\xE1s r\xE1pida de la clasificaci\xF3n del mismo coche y circuito.",
      secs: [
        ["Todos los canales en una gr\xE1fica", "Velocidad, acelerador, freno, marcha, volante y la diferencia de tiempo a lo largo de la vuelta, para ver d\xF3nde se abre la diferencia y por qu\xE9."],
        ["En el mapa del circuito", "Las dos trazadas dibujadas sobre el circuito, con los puntos de frenada y las curvas donde se va el tiempo."],
        ["Sector a sector", "Los sectores oficiales de Le Mans Ultimate, aprendidos del juego, y el tiempo de cada uno frente a la otra vuelta."],
        ["Una vuelta m\xE1s r\xE1pida con la que comparar", "El r\xE9cord del coche y circuito, o el siguiente nivel por encima de tu ritmo, de las vueltas de los pilotos de Pitlane HQ y de sus rivales."],
        ["Hypercar, LMP2, LMP3, GTE y LMGT3", "Cada coche se compara con vueltas del mismo coche en el mismo circuito, nunca de otra clase."],
        ["En el PC, la web y el m\xF3vil", "Abre la comparaci\xF3n donde est\xE9s, las vueltas est\xE1n en tu cuenta."]
      ],
      faq: [
        ["\xBFTengo que exportar algo del juego?", "No. Activa Settings \u2192 Gameplay \u2192 Enable Plugins en Le Mans Ultimate y Pitlane HQ Agent graba las vueltas \xE9l solo."],
        ["\xBFPuedo compararme con un piloto m\xE1s r\xE1pido?", "S\xED. La vuelta B puede ser el r\xE9cord del coche y circuito o el siguiente nivel por encima de tu ritmo, las dos vueltas que alguien condujo de verdad."],
        ["\xBFCuenta las vueltas fuera de pista?", "Una vuelta fuera de pista o que no recorre todo el circuito nunca es v\xE1lida, ni sirve de referencia."],
        ["\xBFEs gratis?", "S\xED. El soporte de Le Mans Ultimate est\xE1 en beta y es gratis."]
      ]
    },
    pt: {
      path: "/pt/comparar-voltas-le-mans-ultimate",
      title: "Comparar voltas do Le Mans Ultimate \xB7 Pitlane HQ",
      desc: "Compare duas voltas do Le Mans Ultimate em gr\xE1ficos e no mapa. Velocidade, acelerador, freio, marcha e a diferen\xE7a, contra a sua melhor ou uma mais r\xE1pida.",
      h1: "Comparar voltas do Le Mans Ultimate lado a lado",
      lead: "O Pitlane HQ grava cada volta do Le Mans Ultimate sozinho e coloca duas uma sobre a outra, a sua contra a sua melhor, a de um colega ou uma mais r\xE1pida da classifica\xE7\xE3o do mesmo carro e pista.",
      secs: [
        ["Todos os canais num gr\xE1fico", "Velocidade, acelerador, freio, marcha, volante e a diferen\xE7a de tempo ao longo da volta, para ver onde a diferen\xE7a abre e por qu\xEA."],
        ["No mapa da pista", "Os dois tra\xE7ados desenhados na pista, com os pontos de frenagem e as curvas onde o tempo vai embora."],
        ["Setor a setor", "Os setores oficiais do Le Mans Ultimate, aprendidos do jogo, e o tempo de cada um contra a outra volta."],
        ["Uma volta mais r\xE1pida para comparar", "O recorde do carro e pista, ou o pr\xF3ximo n\xEDvel acima do seu ritmo, das voltas dos pilotos do Pitlane HQ e dos seus rivais."],
        ["Hypercar, LMP2, LMP3, GTE e LMGT3", "Cada carro \xE9 comparado com voltas do mesmo carro na mesma pista, nunca de outra classe."],
        ["No PC, na web e no celular", "Abra a compara\xE7\xE3o onde estiver, as voltas est\xE3o na sua conta."]
      ],
      faq: [
        ["Preciso exportar algo do jogo?", "N\xE3o. Ative Settings \u2192 Gameplay \u2192 Enable Plugins no Le Mans Ultimate e o Pitlane HQ Agent grava as voltas sozinho."],
        ["Posso comparar com um piloto mais r\xE1pido?", "Sim. A volta B pode ser o recorde do carro e pista ou o pr\xF3ximo n\xEDvel acima do seu ritmo, as duas voltas que algu\xE9m realmente pilotou."],
        ["Conta voltas fora da pista?", "Uma volta fora da pista ou que n\xE3o percorre a pista inteira nunca \xE9 v\xE1lida, nem serve de refer\xEAncia."],
        ["\xC9 gr\xE1tis?", "Sim. O suporte ao Le Mans Ultimate est\xE1 em beta e \xE9 gr\xE1tis."]
      ]
    }
  },
  {
    id: "lmu-braking",
    game: "lmu",
    lmu: "braking",
    en: {
      path: "/le-mans-ultimate-braking-points",
      title: "Le Mans Ultimate braking points and markers \xB7 Pitlane HQ",
      desc: "Find your braking points in Le Mans Ultimate. Pitlane HQ shows where you brake against a faster lap of the same car, on the map and live on track. In beta.",
      h1: "Braking points for Le Mans Ultimate",
      lead: "At Le Mans, Spa or Bahrain most of the time is won or lost under braking. Pitlane HQ shows where you brake, how hard and how long, next to a faster lap of the same car, and marks the next point on track while you drive.",
      secs: [
        ["Where you brake against a faster lap", "Both laps' braking points on the track map, in metres, with the speed before the corner and the lowest speed in it."],
        ["How you brake", "The brake trace of both laps, the peak pressure, trail braking into the corner and when you release"],
        ["Braking markers on track", "An overlay marks the next braking point while you drive, taken from the next level above your best lap, and moves with your speed and the car close ahead."],
        ["What the fast drivers do", "Under each corner, the range of braking points and apex speeds of the fastest drivers there, from their real laps."],
        ["Every class on its own", "A Hypercar brakes much later than an LMGT3, so each car is compared only with laps of the same car."]
      ],
      faq: [
        ["Where do the braking points come from?", "From real laps of the same car and track, the next level above your pace, or your own best lap while there is none."],
        ["Do the markers work in VR?", "Yes. The overlays also show in the headset through SteamVR."],
        ["What do I need?", "Pitlane HQ Agent on Windows and, in the game, Settings \u2192 Gameplay \u2192 Enable Plugins turned on."],
        ["Is it free?", "Yes. Le Mans Ultimate support is in beta and free."]
      ]
    },
    es: {
      path: "/es/puntos-de-frenada-le-mans-ultimate",
      title: "Puntos de frenada en Le Mans Ultimate \xB7 Pitlane HQ",
      desc: "Encuentra tus puntos de frenada en Le Mans Ultimate. Pitlane HQ te ense\xF1a d\xF3nde frenas frente a una vuelta m\xE1s r\xE1pida del mismo coche, en el mapa y en pista.",
      h1: "Puntos de frenada para Le Mans Ultimate",
      lead: "En Le Mans, Spa o Bahr\xE9in casi todo el tiempo se gana o se pierde frenando. Pitlane HQ te ense\xF1a d\xF3nde frenas, cu\xE1nto y durante cu\xE1nto, junto a una vuelta m\xE1s r\xE1pida del mismo coche, y marca el siguiente punto en pista mientras conduces.",
      secs: [
        ["D\xF3nde frenas frente a una vuelta m\xE1s r\xE1pida", "Los puntos de frenada de las dos vueltas en el mapa, en metros, con la velocidad antes de la curva y la m\xEDnima dentro."],
        ["C\xF3mo frenas", "La traza de freno de las dos vueltas, la presi\xF3n m\xE1xima, el trail braking hasta la curva y cu\xE1ndo sueltas"],
        ["Marcas de frenada en pista", "Un overlay marca el siguiente punto de frenada mientras conduces, sacado del siguiente nivel por encima de tu mejor vuelta, y se ajusta a tu velocidad y al coche que llevas delante."],
        ["Lo que hacen los r\xE1pidos", "En cada curva, entre qu\xE9 metros frenan y a qu\xE9 velocidad pasan por el v\xE9rtice los pilotos m\xE1s r\xE1pidos de all\xED, de sus vueltas reales."],
        ["Cada clase por su lado", "Un Hypercar frena mucho m\xE1s tarde que un LMGT3, as\xED que cada coche se compara solo con vueltas del mismo coche."]
      ],
      faq: [
        ["\xBFDe d\xF3nde salen los puntos de frenada?", "De vueltas reales del mismo coche y circuito, del siguiente nivel por encima de tu ritmo, o de tu mejor vuelta mientras no haya otra."],
        ["\xBFLas marcas funcionan en VR?", "S\xED. Los overlays tambi\xE9n se ven en las gafas a trav\xE9s de SteamVR."],
        ["\xBFQu\xE9 necesito?", "Pitlane HQ Agent en Windows y, en el juego, Settings \u2192 Gameplay \u2192 Enable Plugins activado."],
        ["\xBFEs gratis?", "S\xED. El soporte de Le Mans Ultimate est\xE1 en beta y es gratis."]
      ]
    },
    pt: {
      path: "/pt/pontos-de-frenagem-le-mans-ultimate",
      title: "Pontos de frenagem no Le Mans Ultimate \xB7 Pitlane HQ",
      desc: "Encontre seus pontos de frenagem no Le Mans Ultimate. O Pitlane HQ mostra onde voc\xEA freia contra uma volta mais r\xE1pida do mesmo carro, no mapa e na pista.",
      h1: "Pontos de frenagem para Le Mans Ultimate",
      lead: "Em Le Mans, Spa ou Bahrein quase todo o tempo \xE9 ganho ou perdido na frenagem. O Pitlane HQ mostra onde voc\xEA freia, quanto e por quanto tempo, ao lado de uma volta mais r\xE1pida do mesmo carro, e marca o pr\xF3ximo ponto na pista enquanto voc\xEA pilota.",
      secs: [
        ["Onde voc\xEA freia contra uma volta mais r\xE1pida", "Os pontos de frenagem das duas voltas no mapa, em metros, com a velocidade antes da curva e a m\xEDnima dentro dela."],
        ["Como voc\xEA freia", "O tra\xE7o de freio das duas voltas, a press\xE3o m\xE1xima, o trail braking at\xE9 a curva e quando voc\xEA solta"],
        ["Marcas de frenagem na pista", "Um overlay marca o pr\xF3ximo ponto de frenagem enquanto voc\xEA pilota, tirado do pr\xF3ximo n\xEDvel acima da sua melhor volta, e se ajusta \xE0 sua velocidade e ao carro logo \xE0 frente."],
        ["O que os r\xE1pidos fazem", "Em cada curva, entre quais metros freiam e com que velocidade passam pelo \xE1pice os pilotos mais r\xE1pidos dali, das voltas reais deles."],
        ["Cada classe separada", "Um Hypercar freia muito mais tarde que um LMGT3, ent\xE3o cada carro \xE9 comparado s\xF3 com voltas do mesmo carro."]
      ],
      faq: [
        ["De onde v\xEAm os pontos de frenagem?", "De voltas reais do mesmo carro e pista, do pr\xF3ximo n\xEDvel acima do seu ritmo, ou da sua melhor volta enquanto n\xE3o houver outra."],
        ["As marcas funcionam em VR?", "Sim. Os overlays tamb\xE9m aparecem nos \xF3culos pelo SteamVR."],
        ["Do que preciso?", "Do Pitlane HQ Agent no Windows e, no jogo, de Settings \u2192 Gameplay \u2192 Enable Plugins ativado."],
        ["\xC9 gr\xE1tis?", "Sim. O suporte ao Le Mans Ultimate est\xE1 em beta e \xE9 gr\xE1tis."]
      ]
    }
  },
  {
    id: "lmu-coach",
    game: "lmu",
    img: "coach.jpg",
    en: {
      path: "/le-mans-ultimate-coach",
      title: "Le Mans Ultimate coach, braking points and line \xB7 Pitlane HQ",
      desc: "A free coach for Le Mans Ultimate, in beta. Compare your lap with real reference laps and see your braking points and racing line, corner by corner.",
      h1: "A Le Mans Ultimate coach with real reference laps",
      lead: "Pitlane HQ compares your Le Mans Ultimate lap with a faster lap driven by a real person on the same car and track. It shows where you brake, how fast you reach the apex and which line you take, and says what to change first.",
      secs: [
        ["The corners that cost the most", "Every corner is measured against the reference, braking point, apex speed and throttle. The coach lists the corners that lose the most first, named by the track's turns."],
        ["Braking points in metres", "Where you brake against the faster lap, how hard and how long, and the range of braking points of the fastest drivers there. The braking markers overlay shows the next one on track."],
        ["The racing line", "Le Mans Ultimate gives the car's position, so your line is drawn next to the faster one and the coach says where you were inside or outside at turn-in, apex and exit."],
        ["Reference laps from the leaderboard", "Lap B can be your own best, the next level above your pace or the record of the car and track. All of them are laps someone really drove."],
        ["Compare any two laps", "Speed, throttle, brake, gear, steering and the time gap along the lap, with the sectors and the map, on the PC, the web or the phone."],
        ["Live on track", "The coach overlay shows the next corner's tip and braking point while you drive, and after the corner what it gave or took."]
      ],
      faq: [
        ["Does the coach work in Le Mans Ultimate?", "Yes. Le Mans Ultimate support is in beta, and the coach, lap comparison and braking markers work as they do in iRacing."],
        ["Where do the reference laps come from?", "From the laps of Pitlane HQ drivers and their rivals on the same car and track. The more people drive a combination, the closer the next level is to your pace."],
        ["Does it work with Hypercar, LMP2 and LMGT3?", "Yes. Every car is compared with laps of the same car on the same track."],
        ["Is it free?", "Yes."]
      ]
    },
    es: {
      path: "/es/coach-le-mans-ultimate",
      title: "Coach de Le Mans Ultimate, frenadas y trazada \xB7 Pitlane HQ",
      desc: "Un coach gratis para Le Mans Ultimate, en beta. Compara tu vuelta con vueltas de referencia reales y mira tus puntos de frenada y tu trazada, curva a curva.",
      h1: "Un coach de Le Mans Ultimate con vueltas de referencia reales",
      lead: "Pitlane HQ compara tu vuelta de Le Mans Ultimate con una vuelta m\xE1s r\xE1pida de una persona real en el mismo coche y circuito. Te ense\xF1a d\xF3nde frenas, a qu\xE9 velocidad llegas al v\xE9rtice y qu\xE9 trazada llevas, y te dice qu\xE9 cambiar primero.",
      secs: [
        ["Las curvas que m\xE1s te cuestan", "Cada curva se mide frente a la referencia, punto de frenada, velocidad en el v\xE9rtice y acelerador. El coach pone primero las que m\xE1s pierden, con el nombre de las curvas del circuito."],
        ["Puntos de frenada en metros", "D\xF3nde frenas frente a la vuelta m\xE1s r\xE1pida, cu\xE1nto y durante cu\xE1nto, y entre qu\xE9 metros frenan los pilotos m\xE1s r\xE1pidos de all\xED. El overlay de marcas de frenada te ense\xF1a la siguiente en pista."],
        ["La trazada", "Le Mans Ultimate da la posici\xF3n del coche, as\xED que tu l\xEDnea se dibuja junto a la r\xE1pida y el coach te dice si ibas por dentro o por fuera en la entrada, el v\xE9rtice y la salida."],
        ["Vueltas de referencia de la clasificaci\xF3n", "La vuelta B puede ser tu mejor vuelta, el siguiente nivel por encima de tu ritmo o el r\xE9cord del coche y circuito. Todas son vueltas que alguien condujo de verdad."],
        ["Compara dos vueltas cualquiera", "Velocidad, acelerador, freno, marcha, volante y la diferencia de tiempo a lo largo de la vuelta, con los sectores y el mapa, en el PC, la web o el m\xF3vil."],
        ["En vivo en pista", "El overlay del coach muestra el consejo y el punto de frenada de la siguiente curva mientras conduces, y al salir lo que ganaste o perdiste."]
      ],
      faq: [
        ["\xBFEl coach funciona en Le Mans Ultimate?", "S\xED. El soporte de Le Mans Ultimate est\xE1 en beta, y el coach, la comparaci\xF3n de vueltas y las marcas de frenada funcionan como en iRacing."],
        ["\xBFDe d\xF3nde salen las vueltas de referencia?", "De las vueltas de los pilotos de Pitlane HQ y de sus rivales en el mismo coche y circuito. Cuanta m\xE1s gente corre una combinaci\xF3n, m\xE1s cerca de tu ritmo est\xE1 el siguiente nivel."],
        ["\xBFFunciona con Hypercar, LMP2 y LMGT3?", "S\xED. Cada coche se compara con vueltas del mismo coche en el mismo circuito."],
        ["\xBFEs gratis?", "S\xED."]
      ]
    },
    pt: {
      path: "/pt/coach-le-mans-ultimate",
      title: "Coach de Le Mans Ultimate, frenagens e tra\xE7ado \xB7 Pitlane HQ",
      desc: "Um coach gr\xE1tis para Le Mans Ultimate, em beta. Compare sua volta com voltas de refer\xEAncia reais e veja seus pontos de frenagem e seu tra\xE7ado, curva a curva.",
      h1: "Um coach de Le Mans Ultimate com voltas de refer\xEAncia reais",
      lead: "O Pitlane HQ compara sua volta do Le Mans Ultimate com uma volta mais r\xE1pida de uma pessoa real no mesmo carro e pista. Mostra onde voc\xEA freia, com que velocidade chega ao \xE1pice e qual tra\xE7ado faz, e diz o que mudar primeiro.",
      secs: [
        ["As curvas que mais custam", "Cada curva \xE9 medida contra a refer\xEAncia, ponto de frenagem, velocidade no \xE1pice e acelerador. O coach mostra primeiro as que mais perdem, com o nome das curvas da pista."],
        ["Pontos de frenagem em metros", "Onde voc\xEA freia contra a volta mais r\xE1pida, quanto e por quanto tempo, e entre quais metros freiam os pilotos mais r\xE1pidos dali. O overlay de marcas de frenagem mostra a pr\xF3xima na pista."],
        ["O tra\xE7ado", "O Le Mans Ultimate d\xE1 a posi\xE7\xE3o do carro, ent\xE3o sua linha \xE9 desenhada ao lado da r\xE1pida e o coach diz se voc\xEA estava por dentro ou por fora na entrada, no \xE1pice e na sa\xEDda."],
        ["Voltas de refer\xEAncia da classifica\xE7\xE3o", "A volta B pode ser a sua melhor, o pr\xF3ximo n\xEDvel acima do seu ritmo ou o recorde do carro e pista. Todas s\xE3o voltas que algu\xE9m pilotou de verdade."],
        ["Compare duas voltas quaisquer", "Velocidade, acelerador, freio, marcha, volante e a diferen\xE7a de tempo ao longo da volta, com os setores e o mapa, no PC, na web ou no celular."],
        ["Ao vivo na pista", "O overlay do coach mostra a dica e o ponto de frenagem da pr\xF3xima curva enquanto voc\xEA pilota, e na sa\xEDda o que voc\xEA ganhou ou perdeu."]
      ],
      faq: [
        ["O coach funciona no Le Mans Ultimate?", "Sim. O suporte ao Le Mans Ultimate est\xE1 em beta, e o coach, a compara\xE7\xE3o de voltas e as marcas de frenagem funcionam como no iRacing."],
        ["De onde v\xEAm as voltas de refer\xEAncia?", "Das voltas dos pilotos do Pitlane HQ e dos seus rivais no mesmo carro e pista. Quanto mais gente corre uma combina\xE7\xE3o, mais perto do seu ritmo fica o pr\xF3ximo n\xEDvel."],
        ["Funciona com Hypercar, LMP2 e LMGT3?", "Sim. Cada carro \xE9 comparado com voltas do mesmo carro na mesma pista."],
        ["\xC9 gr\xE1tis?", "Sim."]
      ]
    }
  }
];
var GUIDES = { en: "Guides", es: "Gu\xEDas", pt: "Guias" };

// src/seo.js
var SITE4 = "https://pitlanehq.app";
var SEO_VER = "12";
var SEO_DATE = "2026-10-30";
var esc4 = /* @__PURE__ */ __name((s) => String(s ?? "").replace(/[&<>"]/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" })[c]), "esc");
var slug2 = /* @__PURE__ */ __name((s) => String(s || "").toLowerCase().normalize("NFD").replace(/[̀-ͯ]/g, "").replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "").slice(0, 80), "slug");
var fmt2 = /* @__PURE__ */ __name((t) => {
  if (!(t > 0)) return "\u2013";
  const m = Math.floor(t / 60), s = t - m * 60;
  return (m ? m + ":" + (s < 10 ? "0" : "") : "") + s.toFixed(3);
}, "fmt");
var cap = /* @__PURE__ */ __name((s) => String(s || "").charAt(0).toUpperCase() + String(s || "").slice(1), "cap");
var day = /* @__PURE__ */ __name((v) => v > 0 ? new Date(v).toISOString().slice(0, 10) : "", "day");
var fix2 = /* @__PURE__ */ __name((s) => {
  s = String(s || "");
  if (!/[ÃÂ]/.test(s)) return s;
  try {
    return decodeURIComponent(escape(s));
  } catch (e) {
    return s;
  }
}, "fix");
var LANGS2 = ["en", "es", "pt"];
var PRE2 = { en: "", es: "/es", pt: "/pt" };
var NAME = { en: "English", es: "Espa\xF1ol", pt: "Portugu\xEAs" };
var LOCALE = { en: "en_US", es: "es_ES", pt: "pt_BR" };
var HLANG = { en: "en", es: "es", pt: "pt-BR" };
var altsOf = /* @__PURE__ */ __name((o) => ({ en: o.en.path, es: o.es.path, pt: o.pt.path }), "altsOf");
var GNAME = { iracing: "iRacing", lmu: "Le Mans Ultimate" };
var GSHORT = { iracing: "iRacing", lmu: "LMU" };
var recTitle = /* @__PURE__ */ __name((W2, car, track2, game) => [W2.cT(car, track2, GNAME[game]), W2.cT(car, track2, GSHORT[game]), W2.cT(car, track2, GSHORT[game], true)].find((x) => x.length <= 60) || W2.cTs(car, track2), "recTitle");
var CAT2 = {
  en: { oval: "Oval", sports_car: "Sports Car", formula_car: "Formula Car", dirt_oval: "Dirt Oval", dirt_road: "Dirt Road" },
  es: { oval: "\xD3valo", sports_car: "Sports Car", formula_car: "F\xF3rmula", dirt_oval: "\xD3valo de tierra", dirt_road: "Tierra" },
  pt: { oval: "Oval", sports_car: "Sports Car", formula_car: "F\xF3rmula", dirt_oval: "Oval de terra", dirt_road: "Terra" }
};
var T2 = {
  en: {
    tel: { iracing: "iRacing telemetry", lmu: "LMU telemetry" },
    lmuH: "Le Mans Ultimate",
    ov: "Overlays",
    lgs: "Leagues",
    rec: "Records",
    dl: "Download",
    app: "Open the app",
    free: "Free \xB7 Windows, Android and the web",
    other: { iracing: "Racing in Le Mans Ultimate?", lmu: "Racing in iRacing too?" }
  },
  es: {
    tel: { iracing: "Telemetr\xEDa iRacing", lmu: "Telemetr\xEDa LMU" },
    lmuH: "Le Mans Ultimate",
    ov: "Overlays",
    lgs: "Ligas",
    rec: "R\xE9cords",
    dl: "Descargar",
    app: "Abrir la app",
    free: "Gratis \xB7 Windows, Android y web",
    other: { iracing: "\xBFCorres en Le Mans Ultimate?", lmu: "\xBFTambi\xE9n corres en iRacing?" }
  },
  pt: {
    tel: { iracing: "Telemetria iRacing", lmu: "Telemetria LMU" },
    lmuH: "Le Mans Ultimate",
    ov: "Overlays",
    lgs: "Ligas",
    rec: "Recordes",
    dl: "Baixar",
    app: "Abrir o app",
    free: "Gr\xE1tis \xB7 Windows, Android e web",
    other: { iracing: "Corre no Le Mans Ultimate?", lmu: "Tamb\xE9m corre no iRacing?" }
  }
};
var S2 = {
  en: {
    recH: /* @__PURE__ */ __name((gn) => `${gn} lap records by car and track`, "recH"),
    recD: /* @__PURE__ */ __name((gn) => `The fastest ${gn} laps on every car and track, one per driver, from drivers who use Pitlane HQ. Open a record to see its leaderboard.`, "recD"),
    howT: "How a lap gets here",
    how: /* @__PURE__ */ __name((gn) => `Pitlane HQ Agent shares each driver's fastest valid lap of every car and track in ${gn} by itself, under their public name or as Anonymous. A lap off the track, with a lost connection or not round the whole circuit never counts.`, "how"),
    faq: /* @__PURE__ */ __name((gn) => [
      [`How does my ${gn} lap get on these records?`, `Install Pitlane HQ Agent on the PC where you race and drive. Your fastest valid lap of each car and track goes up by itself.`],
      ["Can I compare my lap with a record?", "Yes. Open the record in Community \u2192 Leaderboards and compare it with your own lap of the same track, corner by corner."],
      ["Can I stay anonymous?", "Yes. Choose Anonymous in your account and your laps show without a name."]
    ], "faq"),
    all: "All",
    track: "Track",
    car: "Car",
    record: "Record",
    drivers: "Drivers",
    none: "No laps yet.",
    anon: "Anonymous",
    driver: "Driver",
    time: "Time",
    date: "Date",
    nf: "This page does not exist",
    nfT: "Not found",
    cT: /* @__PURE__ */ __name((car, track2, gn, short) => `${car} at ${track2} \xB7 ${gn}${short ? "" : " lap"} records`, "cT"),
    cTs: /* @__PURE__ */ __name((car, track2) => `${car} at ${track2} lap records`, "cTs"),
    cD: /* @__PURE__ */ __name((car, track2, t, n, gn) => `The ${car} lap record at ${track2} is ${t}. ${n === 1 ? `The only ${gn} lap from Pitlane HQ drivers so far.` : `The ${n} fastest ${gn} laps from Pitlane HQ drivers, one per driver.`}`, "cD"),
    cL: /* @__PURE__ */ __name((t) => `The record is ${t}. One lap per driver, their fastest.`, "cL"),
    cQ: "Where do you lose time in this car?",
    cA: /* @__PURE__ */ __name((gn) => `Pitlane HQ records your ${gn} laps and compares them with these, corner by corner. It is free.`, "cA")
  },
  es: {
    recH: /* @__PURE__ */ __name((gn) => `R\xE9cords de ${gn} por coche y circuito`, "recH"),
    recD: /* @__PURE__ */ __name((gn) => `Las vueltas m\xE1s r\xE1pidas de ${gn} en cada coche y circuito, una por piloto, de pilotos que usan Pitlane HQ. Abre un r\xE9cord para ver su clasificaci\xF3n.`, "recD"),
    howT: "C\xF3mo llega aqu\xED una vuelta",
    how: /* @__PURE__ */ __name((gn) => `Pitlane HQ Agent comparte sola la vuelta v\xE1lida m\xE1s r\xE1pida de cada piloto en cada coche y circuito de ${gn}, con su nombre p\xFAblico o como An\xF3nimo. Una vuelta fuera de pista, con la conexi\xF3n perdida o que no da la vuelta entera al circuito nunca cuenta.`, "how"),
    faq: /* @__PURE__ */ __name((gn) => [
      [`\xBFC\xF3mo entra mi vuelta de ${gn} en estos r\xE9cords?`, `Instala Pitlane HQ Agent en el PC donde corres y conduce. Tu vuelta v\xE1lida m\xE1s r\xE1pida de cada coche y circuito sube sola.`],
      ["\xBFPuedo comparar mi vuelta con un r\xE9cord?", "S\xED. Abre el r\xE9cord en Comunidad \u2192 Clasificaciones y comp\xE1ralo con tu propia vuelta del mismo circuito, curva a curva."],
      ["\xBFPuedo salir como an\xF3nimo?", "S\xED. Elige An\xF3nimo en tu cuenta y tus vueltas salen sin nombre."]
    ], "faq"),
    all: "Todas",
    track: "Circuito",
    car: "Coche",
    record: "R\xE9cord",
    drivers: "Pilotos",
    none: "A\xFAn no hay vueltas.",
    anon: "An\xF3nimo",
    driver: "Piloto",
    time: "Tiempo",
    date: "Fecha",
    nf: "Esta p\xE1gina no existe",
    nfT: "No encontrado",
    cT: /* @__PURE__ */ __name((car, track2, gn) => `${car} en ${track2} \xB7 r\xE9cords de ${gn}`, "cT"),
    cTs: /* @__PURE__ */ __name((car, track2) => `R\xE9cords de ${car} en ${track2}`, "cTs"),
    cD: /* @__PURE__ */ __name((car, track2, t, n, gn) => `El r\xE9cord de ${car} en ${track2} es ${t}. ${n === 1 ? `La \xFAnica vuelta de ${gn} de pilotos de Pitlane HQ por ahora.` : `Las ${n} vueltas m\xE1s r\xE1pidas de ${gn} de pilotos de Pitlane HQ, una por piloto.`}`, "cD"),
    cL: /* @__PURE__ */ __name((t) => `El r\xE9cord es ${t}. Una vuelta por piloto, la m\xE1s r\xE1pida.`, "cL"),
    cQ: "\xBFD\xF3nde pierdes tiempo con este coche?",
    cA: /* @__PURE__ */ __name((gn) => `Pitlane HQ graba tus vueltas en ${gn} y las compara con estas, curva a curva. Es gratis.`, "cA")
  },
  pt: {
    recH: /* @__PURE__ */ __name((gn) => `Recordes do ${gn} por carro e pista`, "recH"),
    recD: /* @__PURE__ */ __name((gn) => `As voltas mais r\xE1pidas do ${gn} em cada carro e pista, uma por piloto, de pilotos que usam o Pitlane HQ. Abra um recorde para ver a classifica\xE7\xE3o.`, "recD"),
    howT: "Como uma volta chega aqui",
    how: /* @__PURE__ */ __name((gn) => `O Pitlane HQ Agent compartilha sozinho a volta v\xE1lida mais r\xE1pida de cada piloto em cada carro e pista do ${gn}, com o nome p\xFAblico ou como An\xF4nimo. Uma volta fora da pista, com a conex\xE3o perdida ou que n\xE3o d\xE1 a volta inteira no circuito nunca conta.`, "how"),
    faq: /* @__PURE__ */ __name((gn) => [
      [`Como minha volta do ${gn} entra nestes recordes?`, `Instale o Pitlane HQ Agent no PC onde voc\xEA corre e pilote. Sua volta v\xE1lida mais r\xE1pida de cada carro e pista sobe sozinha.`],
      ["Posso comparar minha volta com um recorde?", "Sim. Abra o recorde em Comunidade \u2192 Classifica\xE7\xF5es e compare com a sua pr\xF3pria volta da mesma pista, curva a curva."],
      ["Posso aparecer como an\xF4nimo?", "Sim. Escolha An\xF4nimo na sua conta e suas voltas aparecem sem nome."]
    ], "faq"),
    all: "Todas",
    track: "Pista",
    car: "Carro",
    record: "Recorde",
    drivers: "Pilotos",
    none: "Ainda n\xE3o h\xE1 voltas.",
    anon: "An\xF4nimo",
    driver: "Piloto",
    time: "Tempo",
    date: "Data",
    nf: "Esta p\xE1gina n\xE3o existe",
    nfT: "N\xE3o encontrado",
    cT: /* @__PURE__ */ __name((car, track2, gn) => `${car} em ${track2} \xB7 recordes do ${gn}`, "cT"),
    cTs: /* @__PURE__ */ __name((car, track2) => `Recordes de ${car} em ${track2}`, "cTs"),
    cD: /* @__PURE__ */ __name((car, track2, t, n, gn) => `O recorde de ${car} em ${track2} \xE9 ${t}. ${n === 1 ? `A \xFAnica volta do ${gn} de pilotos do Pitlane HQ por enquanto.` : `As ${n} voltas mais r\xE1pidas do ${gn} de pilotos do Pitlane HQ, uma por piloto.`}`, "cD"),
    cL: /* @__PURE__ */ __name((t) => `O recorde \xE9 ${t}. Uma volta por piloto, a mais r\xE1pida.`, "cL"),
    cQ: "Onde voc\xEA perde tempo com este carro?",
    cA: /* @__PURE__ */ __name((gn) => `O Pitlane HQ grava suas voltas no ${gn} e as compara com estas, curva a curva. \xC9 gr\xE1tis.`, "cA")
  }
};
var LOGO = `<svg viewBox="0 0 512 512" width="30" height="30" aria-hidden="true"><defs><linearGradient id="g" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="#1f2733"/><stop offset="1" stop-color="#0d1116"/></linearGradient></defs><rect x="16" y="16" width="480" height="480" rx="112" fill="url(#g)"/><path d="M149.9 382.1A150 150 0 1 1 362.1 382.1" fill="none" stroke="#ffb02e" stroke-width="48" stroke-dasharray="460 1000"/><path d="M149.9 382.1A150 150 0 1 1 362.1 382.1" fill="none" stroke="#f2f4f7" stroke-width="48" stroke-dasharray="0 460 247 1000"/><path d="M149.9 382.1A150 150 0 1 1 362.1 382.1" fill="none" stroke="#ffb02e" stroke-width="48" stroke-dasharray="0 460 31 31 31 31 31 31 31 31 1000"/><path d="M188.1 343.9A96 96 0 1 1 323.9 343.9" fill="none" stroke="#2f3a48" stroke-width="10" stroke-linecap="round"/><path d="M256 276L330 188" stroke="#f2f4f7" stroke-width="20" stroke-linecap="round"/><circle cx="256" cy="276" r="30" fill="#f2f4f7"/><circle cx="256" cy="276" r="12" fill="#ffb02e"/></svg>`;
var FONTS = "https://fonts.googleapis.com/css2?family=Barlow+Condensed:wght@700&family=IBM+Plex+Sans:wght@400;600&family=JetBrains+Mono:wght@500&display=swap";
var CSS = `:root{--bg:#11151b;--card:#1a2029;--line:#2b3542;--fg:#e7ebf1;--mut:#9aa6b8;--acc:#ffb02e;--hd:'Barlow Condensed','Arial Narrow',sans-serif}*{box-sizing:border-box}
body{margin:0;background:var(--bg);color:var(--fg);font:16px/1.6 'IBM Plex Sans',-apple-system,'Segoe UI',Roboto,sans-serif}a{color:var(--acc)}img{max-width:100%}
.w{max-width:1000px;margin:0 auto;padding:0 18px}header{border-bottom:1px solid var(--line)}header .w{display:flex;align-items:center;gap:16px;flex-wrap:wrap;padding-top:12px;padding-bottom:12px}
.b{display:flex;align-items:center;gap:10px;color:var(--fg);text-decoration:none;font:700 22px/1 var(--hd);letter-spacing:.04em;text-transform:uppercase;margin-right:auto}
nav{display:flex;gap:14px;flex-wrap:wrap;font-size:14px}nav a{color:var(--fg);text-decoration:none;opacity:.85}nav a:hover{opacity:1;color:var(--acc)}
h1,h2,h3{font-family:var(--hd);font-weight:700;line-height:1.1;letter-spacing:.02em}h1{font-size:46px;margin:40px 0 12px}h2{font-size:30px;margin:38px 0 10px}h3{font-size:21px;margin:0 0 6px}.c h2{font-size:22px;margin:0 0 6px}
.lead{font-size:19px;color:#c9d1dc;max-width:760px}.cta{display:flex;gap:12px;flex-wrap:wrap;margin:22px 0}
.btn{display:inline-block;padding:12px 18px;border-radius:8px;font:700 15px/1 var(--hd);letter-spacing:.06em;text-transform:uppercase;text-decoration:none;border:1px solid var(--line);color:var(--fg)}
.btn.p{background:var(--acc);color:#11151b;border-color:var(--acc)}.g{display:grid;grid-template-columns:repeat(auto-fit,minmax(260px,1fr));gap:14px}
.c{background:var(--card);border:1px solid var(--line);border-radius:12px;padding:18px}.c p{margin:0;color:#c9d1dc}.m{color:var(--mut)}a.c{text-decoration:none;color:inherit}
.x{margin:22px 0 0;padding:14px 16px;border:1px solid var(--line);border-radius:10px;background:var(--card)}
table{width:100%;border-collapse:collapse;font-size:15px}th,td{text-align:left;padding:8px 10px;border-bottom:1px solid var(--line)}th{color:var(--mut);font-weight:400;font-size:13px;text-transform:uppercase;letter-spacing:.06em}
td.t{font-family:'JetBrains Mono',ui-monospace,monospace;color:var(--acc)}.n{width:44px;color:var(--mut)}.tw{overflow-x:auto}
details{background:var(--card);border:1px solid var(--line);border-radius:10px;padding:12px 16px;margin:8px 0}summary{cursor:pointer;font-weight:600}
footer{border-top:1px solid var(--line);margin-top:50px;padding:22px 0;color:var(--mut);font-size:14px}.cats{display:flex;gap:8px;flex-wrap:wrap;margin:6px 0 4px}
.cats a{padding:6px 12px;border:1px solid var(--line);border-radius:20px;color:var(--fg);text-decoration:none;font-size:14px}.cats a.on{border-color:var(--acc);color:var(--acc)}
.lg h3{font-size:22px;margin:0 0 4px}.lg .k{margin:0 0 8px}.lg img{width:44px;height:44px;border-radius:10px;float:right;margin-left:10px}.on{color:#38c97c}
figure{margin:0}figcaption{font-size:13px;color:var(--mut);margin-top:6px}.shot{margin:26px 0 0}.shot img{display:block;width:100%;height:auto;border:1px solid var(--line);border-radius:12px;background:#0d1116}
.ovs{display:grid;grid-template-columns:repeat(auto-fill,minmax(220px,1fr));gap:14px;margin-top:18px}.ovs figure{background:#0d1116;border:1px solid var(--line);border-radius:12px;padding:12px;text-align:center}.ovs img{height:auto}
.phs{display:grid;grid-template-columns:repeat(3,minmax(0,1fr));gap:14px;max-width:640px;margin-top:22px}.phs img{display:block;width:100%;height:auto;border:5px solid #2a313c;border-radius:26px}.phs figcaption{text-align:center}
@media(max-width:600px){h1{font-size:36px}.lead{font-size:17px}th:nth-child(4),td:nth-child(4){display:none}}`;
var SHOT = {
  "board.jpg": [2880, 1040],
  "coach.jpg": [2880, 1040],
  "compare.jpg": [2880, 1e3],
  "laps.jpg": [2880, 880],
  "live.jpg": [2880, 1600],
  "race.jpg": [2220, 1520],
  "m-analysis-0.png": [540, 1060],
  "m-analysis-1.png": [540, 1060],
  "m-live.png": [540, 1060],
  "m-race.png": [540, 1060],
  "ov-g-inputs.png": [560, 262],
  "ov-g-timing.png": [440, 154],
  "ov-g-tyres.png": [420, 214],
  "ov-l-brakes.png": [480, 138],
  "ov-l-coach.png": [520, 76],
  "ov-s-sectors.png": [560, 146],
  "ov-trackbar.png": [700, 62],
  "ov-weather.png": [360, 196]
};
var imgSrc = /* @__PURE__ */ __name((l, f) => `/landing/${l}/${f}`, "imgSrc");
var img = /* @__PURE__ */ __name((l, f, alt) => {
  const [w, h] = SHOT[f] || [1200, 600];
  return `<img src="${imgSrc(l, f)}" alt="${esc4(alt)}" width="${w}" height="${h}" loading="lazy" decoding="async">`;
}, "img");
var SHOT_ALT = {
  en: { "coach.jpg": "The Pitlane HQ coach", "compare.jpg": "Two laps compared in Pitlane HQ", "laps.jpg": "The laps of a session in Pitlane HQ", "race.jpg": "A race summary in Pitlane HQ", "m-live.png": "Live telemetry on the phone", "m-race.png": "A race summary on the phone", "m-analysis-0.png": "The laps on the phone" },
  es: { "coach.jpg": "El coach de Pitlane HQ", "compare.jpg": "Dos vueltas comparadas en Pitlane HQ", "laps.jpg": "Las vueltas de una sesi\xF3n en Pitlane HQ", "race.jpg": "Un resumen de carrera en Pitlane HQ", "m-live.png": "Telemetr\xEDa en vivo en el m\xF3vil", "m-race.png": "Un resumen de carrera en el m\xF3vil", "m-analysis-0.png": "Las vueltas en el m\xF3vil" },
  pt: { "coach.jpg": "O coach do Pitlane HQ", "compare.jpg": "Duas voltas comparadas no Pitlane HQ", "laps.jpg": "As voltas de uma sess\xE3o no Pitlane HQ", "race.jpg": "Um resumo de corrida no Pitlane HQ", "m-live.png": "Telemetria ao vivo no celular", "m-race.png": "Um resumo de corrida no celular", "m-analysis-0.png": "As voltas no celular" }
};
var shot = /* @__PURE__ */ __name((l, f) => `<figure class="shot">${img(l, f, SHOT_ALT[l][f] || "Pitlane HQ")}</figure>`, "shot");
var phones = /* @__PURE__ */ __name((l, list) => `<div class="phs">${list.map((f) => `<figure>${img(l, f, SHOT_ALT[l][f] || "Pitlane HQ")}<figcaption>${esc4(SHOT_ALT[l][f] || "")}</figcaption></figure>`).join("")}</div>`, "phones");
var HAS = { lmuLeagues: false, lmuRecords: false };
var HAS_MEMO = /* @__PURE__ */ new WeakMap();
async function readHas(env) {
  const m = HAS_MEMO.get(env);
  if (m && Date.now() - m.at < 5 * 6e4) return HAS = m.has;
  const [lg, rc] = await Promise.all([leaguesData(env, "lmu").then((D) => D.posted.length + D.found.length).catch(() => 0), topCombos(env, 1, "lmu").then((x) => x.length).catch(() => 0)]);
  const has = { lmuLeagues: lg > 0, lmuRecords: rc > 0 };
  HAS_MEMO.set(env, { at: Date.now(), has });
  return HAS = has;
}
__name(readHas, "readHas");
var TOPIC_BY = Object.fromEntries(TOPICS.map((x) => [x.id, x]));
var LMU_TOO = ["phone", "free"];
var LMU_TOO_H = {
  phone: { en: "Telemetry on your phone", es: "La telemetr\xEDa en tu m\xF3vil", pt: "A telemetria no seu celular" },
  free: { en: "Free telemetry", es: "Telemetr\xEDa gratis", pt: "Telemetria gr\xE1tis" }
};
var lmuToo = /* @__PURE__ */ __name((l) => LMU_TOO.map((id2) => ({ ...TOPIC_BY[id2][l], h1: LMU_TOO_H[id2][l] })), "lmuToo");
var lmuLinks = /* @__PURE__ */ __name((l) => [
  [LANDL[l].path, LANDL[l].h1],
  [OVLL[l].path, OVLL[l].h1],
  ...TOPICS.filter((x) => x.game === "lmu").map((x) => [x[l].path, x[l].h1]),
  ...HAS.lmuLeagues ? [[LEAGL[l].path, LEAGL[l].h1]] : [],
  ...HAS.lmuRecords ? [[REC_IDX.lmu[l], S2[l].recH(GNAME.lmu)]] : []
], "lmuLinks");
var iracingLinks = /* @__PURE__ */ __name((l) => [...TOPICS.filter((x) => x.game !== "lmu").map((x) => [x[l].path, x[l].h1]), [OVL[l].path, OVL[l].h1], [LEAG[l].path, LEAG[l].h1], [REC_IDX.iracing[l], S2[l].recH(GNAME.iracing)]], "iracingLinks");
function page3(l, { title, desc, path, alts, body, ld, noindex, game = "iracing" }) {
  const t = T2[l], other = game === "lmu" ? "iracing" : "lmu";
  const lg = game === "lmu" && HAS.lmuLeagues ? LEAGL[l].path : LEAG[l].path, rc = game === "lmu" && HAS.lmuRecords ? REC_IDX.lmu[l] : REC_IDX.iracing[l];
  const hl = alts ? LANGS2.map((k) => `<link rel="alternate" hreflang="${HLANG[k]}" href="${SITE4}${alts[k]}">`).join("") + `<link rel="alternate" hreflang="x-default" href="${SITE4}${alts.en}">` : "";
  const others = alts ? LANGS2.filter((k) => k !== l).map((k) => `<a href="${alts[k]}" hreflang="${HLANG[k]}" lang="${HLANG[k]}">${NAME[k]}</a>`).join("") : "";
  const og = `${SITE4}/og${l === "en" ? "" : "-" + l}.png`;
  return `<!doctype html><html lang="${HLANG[l]}"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1">
<title>${esc4(title)}</title><meta name="description" content="${esc4(desc)}">${path ? `<link rel="canonical" href="${SITE4}${path}">` : ""}${noindex ? '<meta name="robots" content="noindex,follow">' : '<meta name="robots" content="index,follow,max-image-preview:large">'}
${hl}
<meta property="og:type" content="website"><meta property="og:site_name" content="Pitlane HQ"><meta property="og:locale" content="${LOCALE[l]}"><meta property="og:title" content="${esc4(title)}"><meta property="og:description" content="${esc4(desc)}">${path ? `<meta property="og:url" content="${SITE4}${path}">` : ""}<meta property="og:image" content="${og}"><meta property="og:image:width" content="1200"><meta property="og:image:height" content="630"><meta property="og:image:alt" content="Pitlane HQ">
<meta name="twitter:card" content="summary_large_image"><meta name="twitter:title" content="${esc4(title)}"><meta name="twitter:description" content="${esc4(desc)}"><meta name="twitter:image" content="${og}">
<meta name="theme-color" content="#11151b"><link rel="icon" href="/favicon.ico" sizes="any"><link rel="icon" href="/logo.svg" type="image/svg+xml"><link rel="apple-touch-icon" href="/icon-180.png">
<style>${CSS}</style><link rel="preconnect" href="https://fonts.googleapis.com"><link rel="preconnect" href="https://fonts.gstatic.com" crossorigin><link rel="stylesheet" href="${FONTS}" media="print" onload="this.media='all'"><noscript><link rel="stylesheet" href="${FONTS}"></noscript>
${ld ? `<script type="application/ld+json">${JSON.stringify(ld).replace(/</g, "\\u003c")}<\/script>` : ""}</head><body>
<header><div class="w"><a class="b" href="/">${LOGO}Pitlane HQ</a><nav><a href="${(game === "lmu" ? LANDL : LAND)[l].path}">${esc4(t.tel[game])}</a><a href="${(game === "lmu" ? OVLL : OVL)[l].path}">${esc4(t.ov)}</a><a href="${lg}">${esc4(t.lgs)}</a><a href="${rc}">${esc4(t.rec)}</a><a href="${(other === "lmu" ? LANDL : LAND)[l].path}">${esc4(GNAME[other])}</a><a href="/downloads">${esc4(t.dl)}</a><a href="/">${esc4(t.app)}</a>${others}</nav></div></header>
<main class="w">${body}</main>
<footer><div class="w"><p class="m">${esc4(GUIDES[l])} \xB7 iRacing \xB7 ${iracingLinks(l).map(([p, h]) => `<a href="${p}">${esc4(h)}</a>`).join(" \xB7 ")}</p><p class="m">${esc4(t.lmuH)} \xB7 ${lmuLinks(l).map(([p, h]) => `<a href="${p}">${esc4(h)}</a>`).join(" \xB7 ")}</p>Pitlane HQ \xB7 ${esc4(t.free)} \xB7 <a href="/downloads">${esc4(t.dl)}</a> \xB7 <a href="mailto:support@pitlanehq.app">support@pitlanehq.app</a> \xB7 ${LANGS2.map((k) => `<a href="${LAND[k].path}" hreflang="${HLANG[k]}">${NAME[k]}</a>`).join(" \xB7 ")}</div></footer></body></html>`;
}
__name(page3, "page");
var crumbs = /* @__PURE__ */ __name((items) => ({ "@context": "https://schema.org", "@type": "BreadcrumbList", itemListElement: items.map(([name2, path], i) => ({ "@type": "ListItem", position: i + 1, name: name2, item: SITE4 + path })) }), "crumbs");
var faqLd = /* @__PURE__ */ __name((faq) => ({ "@context": "https://schema.org", "@type": "FAQPage", mainEntity: faq.map(([q2, a]) => ({ "@type": "Question", name: q2, acceptedAnswer: { "@type": "Answer", text: a } })) }), "faqLd");
var appLd = /* @__PURE__ */ __name((l, desc, shots) => ({
  "@context": "https://schema.org",
  "@type": "SoftwareApplication",
  "@id": SITE4 + "/#app",
  name: "Pitlane HQ",
  alternateName: ["PitlaneHQ", "Pitlane HQ Agent"],
  url: SITE4 + "/",
  applicationCategory: "SportsApplication",
  applicationSubCategory: "Sim racing telemetry",
  operatingSystem: "Windows, Android, Web",
  description: desc,
  inLanguage: HLANG[l],
  image: `${SITE4}/og${l === "en" ? "" : "-" + l}.png`,
  ...shots && shots.length ? { screenshot: shots.map((f) => ({ "@type": "ImageObject", url: SITE4 + imgSrc(l, f), width: (SHOT[f] || [])[0], height: (SHOT[f] || [])[1] })) } : {},
  offers: { "@type": "Offer", price: "0", priceCurrency: "USD" },
  publisher: { "@id": SITE4 + "/#org" }
}), "appLd");
var siteLd = /* @__PURE__ */ __name((l) => [
  { "@context": "https://schema.org", "@type": "WebSite", "@id": SITE4 + "/#website", name: "Pitlane HQ", alternateName: ["PitlaneHQ", "Pitlane"], url: SITE4 + "/", inLanguage: HLANG[l], publisher: { "@id": SITE4 + "/#org" } },
  { "@context": "https://schema.org", "@type": "Organization", "@id": SITE4 + "/#org", name: "Pitlane HQ", alternateName: "PitlaneHQ", url: SITE4 + "/", logo: SITE4 + "/icon-512.png", email: "support@pitlanehq.app" }
], "siteLd");
var etagOf = /* @__PURE__ */ __name((s) => {
  let h = 2166136261;
  for (let i = 0; i < s.length; i++) {
    h ^= s.charCodeAt(i);
    h = Math.imul(h, 16777619);
  }
  return `W/"${(h >>> 0).toString(36)}-${s.length.toString(36)}"`;
}, "etagOf");
var html = /* @__PURE__ */ __name((s, cache2 = 600, status = 200) => new Response(s, { status, headers: { "content-type": "text/html; charset=utf-8", "cache-control": `public, max-age=${cache2}, stale-while-revalidate=86400`, etag: etagOf(s), "x-content-type-options": "nosniff" } }), "html");
var cross = /* @__PURE__ */ __name((l, game) => {
  const o = game === "lmu" ? LAND[l] : LANDL[l];
  return `<p class="x">${esc4(T2[l].other[game])} <a href="${o.path}">${esc4(o.h1)} \u2192</a></p>`;
}, "cross");
var LAND = {
  en: {
    path: "/iracing-telemetry",
    title: "iRacing telemetry, lap analysis and overlays \xB7 Pitlane HQ",
    desc: "Free iRacing telemetry from Pitlane HQ. Record every lap, see where you lose time, compare with faster drivers and race with overlays on top of the game.",
    h1: "iRacing telemetry and a coach for your laps",
    lead: "Pitlane HQ records every lap you drive in iRacing and shows where you lose time, against your own best lap, the record and the driver just ahead of you in the same car. It is free and works on Windows, Android and the web.",
    cards: [
      ["Telemetry from every lap", "Pitlane HQ Agent runs next to iRacing and saves speed, throttle, brake, gear and steering on every lap, with nothing to set up. The laps go to your account, so you can open them later on the web or on your phone."],
      ["Compare two laps", "Speed, inputs and the time gap along the lap, the track map, the sectors and the braking points. Pick any two laps, yours, one from another session or one from the leaderboard."],
      ["A coach that uses real laps", "For each car and track Pitlane HQ learns from real laps driven by real people. The coach compares your lap with the record and with the driver just ahead of you, and tells you which corners cost the most."],
      ["Live telemetry on your phone", "While you drive, watch your telemetry on the phone or in a browser. Share a code and a friend can watch too."],
      ["Leaderboards by car and track", "The fastest lap of every driver on each car and track, by discipline, oval, sports car, formula, dirt oval and dirt road."],
      ["Race summaries and iRating", "After each race, your result, your laps, your incidents, your iRating and how you compared with the drivers around you."],
      ["Overlays on top of the game", "Relative, standings, radar, delta bar, fuel, tyres, track map, flags, a live coach and more, drawn by Pitlane HQ Agent over iRacing and also shown in VR."]
    ],
    recs: "Records by car and track",
    recsLead: "The fastest laps driven with Pitlane HQ.",
    faqT: "Questions",
    faq: [
      ["What is Pitlane HQ?", "Pitlane HQ (also written PitlaneHQ) is a free sim racing telemetry app for iRacing and Le Mans Ultimate. Pitlane HQ Agent records your laps on Windows, and the web and the phone app show them with a coach, leaderboards and overlays."],
      ["Is it free?", "Yes. The telemetry, the coach, the leaderboards and the basic overlays are free, and during the beta everything is."],
      ["Which sims does it work with?", "iRacing and Le Mans Ultimate (in beta). ACC and Assetto Corsa are in development."],
      ["What do I need?", "A Windows PC where you race in iRacing or Le Mans Ultimate, to record the laps. To look at them, any browser or the Android app."],
      ["Who sees my laps?", "Your laps are in your account. On the leaderboards only your fastest lap of each car and track appears, under your public name or as Anonymous."],
      ["How is it different from looking at a replay?", "A replay shows what happened. Telemetry shows how, where you braked, how much throttle you used and where the time went, metre by metre, next to a faster lap."]
    ],
    dl: "Download for Windows",
    app: "Open the app"
  },
  es: {
    path: "/es/telemetria-iracing",
    title: "Telemetr\xEDa de iRacing, an\xE1lisis y overlays \xB7 Pitlane HQ",
    desc: "Telemetr\xEDa gratis para iRacing con Pitlane HQ. Graba tus vueltas, mira d\xF3nde pierdes tiempo, comp\xE1rate con pilotos m\xE1s r\xE1pidos y usa overlays en el juego.",
    h1: "Telemetr\xEDa para iRacing y un coach para tus vueltas",
    lead: "Pitlane HQ graba cada vuelta que das en iRacing y te ense\xF1a d\xF3nde pierdes tiempo, frente a tu mejor vuelta, frente al r\xE9cord y frente al piloto que va justo por delante con el mismo coche. Es gratis y funciona en Windows, Android y la web.",
    cards: [
      ["Telemetr\xEDa de cada vuelta", "Pitlane HQ Agent funciona junto a iRacing y guarda velocidad, acelerador, freno, marcha y volante en cada vuelta, sin configurar nada. Las vueltas van a tu cuenta, as\xED que luego las abres en la web o en el m\xF3vil."],
      ["Comparar dos vueltas", "Velocidad, pedales y diferencia de tiempo a lo largo de la vuelta, el mapa del circuito, los sectores y los puntos de frenada. Eliges dos vueltas cualquiera, tuyas, de otra sesi\xF3n o de la clasificaci\xF3n."],
      ["Un coach con vueltas reales", "Para cada coche y circuito, Pitlane HQ aprende de vueltas reales de pilotos reales. El coach compara tu vuelta con el r\xE9cord y con el piloto que va justo por delante, y te dice qu\xE9 curvas te cuestan m\xE1s."],
      ["Telemetr\xEDa en vivo en el m\xF3vil", "Mientras corres, mira tu telemetr\xEDa en el m\xF3vil o en el navegador. Comparte un c\xF3digo y un amigo tambi\xE9n puede verla."],
      ["Clasificaciones por coche y circuito", "La vuelta m\xE1s r\xE1pida de cada piloto en cada coche y circuito, por disciplina, \xF3valo, sports car, f\xF3rmula, \xF3valo de tierra y tierra."],
      ["Resumen de carrera e iRating", "Despu\xE9s de cada carrera, tu resultado, tus vueltas, tus incidentes, tu iRating y c\xF3mo ibas frente a los pilotos de tu alrededor."],
      ["Overlays encima del juego", "Relative, clasificaci\xF3n, radar, barra de delta, combustible, neum\xE1ticos, mapa, banderas, un coach en vivo y m\xE1s, dibujados por Pitlane HQ Agent sobre iRacing y tambi\xE9n en VR."]
    ],
    recs: "R\xE9cords por coche y circuito",
    recsLead: "Las vueltas m\xE1s r\xE1pidas hechas con Pitlane HQ.",
    faqT: "Preguntas",
    faq: [
      ["\xBFQu\xE9 es Pitlane HQ?", "Pitlane HQ (tambi\xE9n escrito PitlaneHQ) es una app gratis de telemetr\xEDa para sim racing en iRacing y Le Mans Ultimate. Pitlane HQ Agent graba tus vueltas en Windows, y la web y la app del m\xF3vil te las ense\xF1an con un coach, clasificaciones y overlays."],
      ["\xBFEs gratis?", "S\xED. La telemetr\xEDa, el coach, las clasificaciones y los overlays b\xE1sicos son gratis, y durante la beta lo es todo."],
      ["\xBFCon qu\xE9 simuladores funciona?", "Con iRacing y Le Mans Ultimate (en beta). ACC y Assetto Corsa est\xE1n en desarrollo."],
      ["\xBFQu\xE9 necesito?", "Un PC con Windows donde corras en iRacing o Le Mans Ultimate, para grabar las vueltas. Para verlas, cualquier navegador o la app de Android."],
      ["\xBFQui\xE9n ve mis vueltas?", "Tus vueltas est\xE1n en tu cuenta. En las clasificaciones solo aparece tu vuelta m\xE1s r\xE1pida de cada coche y circuito, con tu nombre p\xFAblico o como An\xF3nimo."],
      ["\xBFEn qu\xE9 se diferencia de ver una repetici\xF3n?", "La repetici\xF3n muestra qu\xE9 pas\xF3. La telemetr\xEDa muestra c\xF3mo, d\xF3nde frenaste, cu\xE1nto acelerador diste y d\xF3nde se fue el tiempo, metro a metro, al lado de una vuelta m\xE1s r\xE1pida."]
    ],
    dl: "Descargar para Windows",
    app: "Abrir la app"
  },
  pt: {
    path: "/pt/telemetria-iracing",
    title: "Telemetria do iRacing, an\xE1lise e overlays \xB7 Pitlane HQ",
    desc: "Telemetria gr\xE1tis para iRacing com o Pitlane HQ. Grave suas voltas, veja onde perde tempo, compare com pilotos mais r\xE1pidos e use overlays no jogo.",
    h1: "Telemetria para iRacing e um coach para suas voltas",
    lead: "O Pitlane HQ grava cada volta que voc\xEA d\xE1 no iRacing e mostra onde voc\xEA perde tempo, contra a sua melhor volta, contra o recorde e contra o piloto logo \xE0 sua frente no mesmo carro. \xC9 gr\xE1tis e funciona no Windows, no Android e na web.",
    cards: [
      ["Telemetria de cada volta", "O Pitlane HQ Agent roda ao lado do iRacing e salva velocidade, acelerador, freio, marcha e volante em cada volta, sem configurar nada. As voltas v\xE3o para a sua conta, ent\xE3o voc\xEA as abre depois na web ou no celular."],
      ["Compare duas voltas", "Velocidade, pedais e a diferen\xE7a de tempo ao longo da volta, o mapa da pista, os setores e os pontos de frenagem. Escolha duas voltas quaisquer, suas, de outra sess\xE3o ou da classifica\xE7\xE3o."],
      ["Um coach com voltas reais", "Para cada carro e pista, o Pitlane HQ aprende com voltas reais de pilotos reais. O coach compara a sua volta com o recorde e com o piloto logo \xE0 frente e diz quais curvas custam mais."],
      ["Telemetria ao vivo no celular", "Enquanto voc\xEA corre, veja a sua telemetria no celular ou no navegador. Compartilhe um c\xF3digo e um amigo tamb\xE9m pode acompanhar."],
      ["Classifica\xE7\xF5es por carro e pista", "A volta mais r\xE1pida de cada piloto em cada carro e pista, por disciplina, oval, sports car, f\xF3rmula, oval de terra e terra."],
      ["Resumo de corrida e iRating", "Depois de cada corrida, o seu resultado, as suas voltas, os seus incidentes, o seu iRating e como voc\xEA foi contra os pilotos ao seu redor."],
      ["Overlays sobre o jogo", "Relative, classifica\xE7\xE3o, radar, barra de delta, combust\xEDvel, pneus, mapa, bandeiras, um coach ao vivo e mais, desenhados pelo Pitlane HQ Agent sobre o iRacing e tamb\xE9m em VR."]
    ],
    recs: "Recordes por carro e pista",
    recsLead: "As voltas mais r\xE1pidas feitas com o Pitlane HQ.",
    faqT: "Perguntas",
    faq: [
      ["O que \xE9 o Pitlane HQ?", "O Pitlane HQ (tamb\xE9m escrito PitlaneHQ) \xE9 um app gr\xE1tis de telemetria para sim racing no iRacing e no Le Mans Ultimate. O Pitlane HQ Agent grava suas voltas no Windows, e a web e o app de celular mostram com um coach, classifica\xE7\xF5es e overlays."],
      ["\xC9 gr\xE1tis?", "Sim. A telemetria, o coach, as classifica\xE7\xF5es e os overlays b\xE1sicos s\xE3o gr\xE1tis, e durante a beta tudo \xE9."],
      ["Com quais simuladores funciona?", "Com o iRacing e o Le Mans Ultimate (em beta). ACC e Assetto Corsa est\xE3o em desenvolvimento."],
      ["Do que eu preciso?", "Um PC com Windows onde voc\xEA corre no iRacing ou no Le Mans Ultimate, para gravar as voltas. Para v\xEA-las, qualquer navegador ou o app de Android."],
      ["Quem v\xEA as minhas voltas?", "As suas voltas ficam na sua conta. Nas classifica\xE7\xF5es aparece s\xF3 a sua volta mais r\xE1pida de cada carro e pista, com o seu nome p\xFAblico ou como An\xF4nimo."],
      ["Qual a diferen\xE7a para ver um replay?", "O replay mostra o que aconteceu. A telemetria mostra como, onde voc\xEA freou, quanto acelerador usou e para onde foi o tempo, metro a metro, ao lado de uma volta mais r\xE1pida."]
    ],
    dl: "Baixar para Windows",
    app: "Abrir o app"
  }
};
var LANDL = {
  en: {
    path: "/le-mans-ultimate-telemetry",
    title: "Le Mans Ultimate telemetry, coach and overlays \xB7 Pitlane HQ",
    desc: "Free Le Mans Ultimate telemetry app, in beta. Record every LMU lap, compare it with faster drivers, see where you lose time and race with overlays.",
    h1: "Le Mans Ultimate telemetry and a coach for your laps",
    lead: "Pitlane HQ records every lap you drive in Le Mans Ultimate and shows where you lose time, against your best lap, the record and the driver just ahead of you in the same car. Le Mans Ultimate support is in beta and free, on Windows, Android and the web.",
    cards: [
      ["Nothing to install in the game", "Pitlane HQ Agent reads the game's own data. Turn on Enable Plugins in the game's Settings \u2192 Gameplay and drive. Every lap is saved with its speed, pedals, gear, steering and official sectors."],
      ["Compare laps and reference laps", "Put two laps side by side, yours or the leaderboard's, with the time gap, the inputs, the racing line on the map and the braking points."],
      ["A coach with real laps", "The coach compares your lap with the record and with the driver just ahead of your pace on the same car and track, and lists the corners that cost the most."],
      ["Overlays for multiclass races", "Relative and standings with class colours, radar, delta bar, fuel, a track map with every class, flags and a dash with TC, ABS, brake bias and the virtual energy left."],
      ["Live on your phone", "Watch position, delta, fuel, the relative and the map on a phone or tablet next to the wheel, over Wi-Fi or mobile data."],
      ["Race summaries and rivals", "After each race, your place, your laps and the field as the game shows it, with the best lap of every rival."],
      ["Leaderboards and leagues", "Your fastest lap of each car and track goes to its leaderboard by itself, and the leagues hub lists Le Mans Ultimate leagues with their Discord."]
    ],
    recs: "Le Mans Ultimate records by car and track",
    recsLead: "The fastest Le Mans Ultimate laps driven with Pitlane HQ.",
    faqT: "Questions",
    faq: [
      ["Is there a free Le Mans Ultimate telemetry app?", "Yes. Pitlane HQ is free. Its Le Mans Ultimate support is in beta, so write to support@pitlanehq.app when something looks wrong."],
      ["How do I turn on LMU telemetry?", "In Le Mans Ultimate open Settings \u2192 Gameplay and turn on Enable Plugins. Pitlane HQ Agent finds the game by itself, with nothing else to install."],
      ["Does it work with Hypercar, LMP2 and LMGT3?", "Yes. Every car of the game is recorded, and the overlays colour each class."],
      ["Does it show the virtual energy?", "Yes. The dash overlay shows the virtual energy left next to TC, ABS, the engine map and the brake bias, and the fuel overlay shows what each lap used and what you may use per lap to finish."],
      ["Can I see my LMU telemetry on the phone?", "Yes. Sign in with the same account on the phone or at pitlanehq.app and press Connect in Telemetry."],
      ["Is there an iRating?", "Le Mans Ultimate has no iRating or licences, so Pitlane HQ shows none for it. Everything else works as in iRacing."]
    ],
    dl: "Download for Windows",
    app: "Open the app"
  },
  es: {
    path: "/es/telemetria-le-mans-ultimate",
    title: "Telemetr\xEDa y overlays para Le Mans Ultimate \xB7 Pitlane HQ",
    desc: "App de telemetr\xEDa gratis para Le Mans Ultimate, en beta. Graba cada vuelta de LMU, comp\xE1rala con pilotos m\xE1s r\xE1pidos y corre con overlays sobre el juego.",
    h1: "Telemetr\xEDa para Le Mans Ultimate y un coach para tus vueltas",
    lead: "Pitlane HQ graba cada vuelta que das en Le Mans Ultimate y te ense\xF1a d\xF3nde pierdes tiempo, frente a tu mejor vuelta, el r\xE9cord y el piloto que va justo por delante con el mismo coche. El soporte de Le Mans Ultimate est\xE1 en beta y es gratis, en Windows, Android y la web.",
    cards: [
      ["Nada que instalar en el juego", "Pitlane HQ Agent lee los datos del propio juego. Activa Enable Plugins en Settings \u2192 Gameplay del juego y conduce. Cada vuelta se guarda con su velocidad, pedales, marcha, volante y sectores oficiales."],
      ["Compara vueltas y vueltas de referencia", "Pon dos vueltas una al lado de la otra, tuyas o de la clasificaci\xF3n, con la diferencia de tiempo, los pedales, la trazada en el mapa y los puntos de frenada."],
      ["Un coach con vueltas reales", "El coach compara tu vuelta con el r\xE9cord y con el piloto justo por encima de tu ritmo en el mismo coche y circuito, y pone primero las curvas que m\xE1s te cuestan."],
      ["Overlays para carreras multiclase", "Relative y clasificaci\xF3n con los colores de cada clase, radar, barra de delta, combustible, mapa con todas las clases, banderas y un dash con TC, ABS, reparto de frenada y la energ\xEDa virtual que queda."],
      ["En vivo en el m\xF3vil", "Mira posici\xF3n, delta, combustible, el relative y el mapa en un m\xF3vil o una tablet junto al volante, con Wi-Fi o datos."],
      ["Res\xFAmenes de carrera y rivales", "Despu\xE9s de cada carrera, tu posici\xF3n, tus vueltas y la parrilla como la muestra el juego, con la mejor vuelta de cada rival."],
      ["Clasificaciones y ligas", "Tu vuelta m\xE1s r\xE1pida de cada coche y circuito entra sola en su clasificaci\xF3n, y el hub de ligas re\xFAne ligas de Le Mans Ultimate con su Discord."]
    ],
    recs: "R\xE9cords de Le Mans Ultimate por coche y circuito",
    recsLead: "Las vueltas m\xE1s r\xE1pidas de Le Mans Ultimate hechas con Pitlane HQ.",
    faqT: "Preguntas",
    faq: [
      ["\xBFHay una app de telemetr\xEDa gratis para Le Mans Ultimate?", "S\xED. Pitlane HQ es gratis. Su soporte de Le Mans Ultimate est\xE1 en beta, as\xED que escribe a support@pitlanehq.app si algo no cuadra."],
      ["\xBFC\xF3mo activo la telemetr\xEDa de LMU?", "En Le Mans Ultimate abre Settings \u2192 Gameplay y activa Enable Plugins. Pitlane HQ Agent encuentra el juego solo, sin instalar nada m\xE1s."],
      ["\xBFFunciona con Hypercar, LMP2 y LMGT3?", "S\xED. Se graba cada coche del juego, y los overlays colorean cada clase."],
      ["\xBFMuestra la energ\xEDa virtual?", "S\xED. El overlay del dash muestra la energ\xEDa virtual que queda junto al TC, el ABS, el mapa motor y el reparto de frenada, y el de combustible lo que gast\xF3 cada vuelta y lo que puedes gastar por vuelta para terminar."],
      ["\xBFPuedo ver mi telemetr\xEDa de LMU en el m\xF3vil?", "S\xED. Entra con la misma cuenta en el m\xF3vil o en pitlanehq.app y pulsa Conectar en Telemetr\xEDa."],
      ["\xBFHay iRating?", "Le Mans Ultimate no tiene iRating ni licencias, as\xED que Pitlane HQ no muestra ninguno. Todo lo dem\xE1s funciona como en iRacing."]
    ],
    dl: "Descargar para Windows",
    app: "Abrir la app"
  },
  pt: {
    path: "/pt/telemetria-le-mans-ultimate",
    title: "Telemetria e overlays para Le Mans Ultimate \xB7 Pitlane HQ",
    desc: "App de telemetria gr\xE1tis para Le Mans Ultimate, em beta. Grave cada volta do LMU, compare com pilotos mais r\xE1pidos e corra com overlays sobre o jogo.",
    h1: "Telemetria para Le Mans Ultimate e um coach para suas voltas",
    lead: "O Pitlane HQ grava cada volta que voc\xEA d\xE1 no Le Mans Ultimate e mostra onde voc\xEA perde tempo, contra a sua melhor volta, o recorde e o piloto logo \xE0 sua frente no mesmo carro. O suporte ao Le Mans Ultimate est\xE1 em beta e \xE9 gr\xE1tis, no Windows, no Android e na web.",
    cards: [
      ["Nada para instalar no jogo", "O Pitlane HQ Agent l\xEA os dados do pr\xF3prio jogo. Ative Enable Plugins em Settings \u2192 Gameplay do jogo e pilote. Cada volta \xE9 salva com velocidade, pedais, marcha, volante e setores oficiais."],
      ["Compare voltas e voltas de refer\xEAncia", "Coloque duas voltas lado a lado, suas ou da classifica\xE7\xE3o, com a diferen\xE7a de tempo, os pedais, o tra\xE7ado no mapa e os pontos de frenagem."],
      ["Um coach com voltas reais", "O coach compara sua volta com o recorde e com o piloto logo acima do seu ritmo no mesmo carro e pista, e mostra primeiro as curvas que mais custam."],
      ["Overlays para corridas multiclasse", "Relative e classifica\xE7\xE3o com as cores de cada classe, radar, barra de delta, combust\xEDvel, mapa com todas as classes, bandeiras e um dash com TC, ABS, balan\xE7o de freio e a energia virtual que resta."],
      ["Ao vivo no celular", "Veja posi\xE7\xE3o, delta, combust\xEDvel, o relative e o mapa num celular ou tablet ao lado do volante, com Wi-Fi ou dados."],
      ["Resumos de corrida e rivais", "Depois de cada corrida, a sua posi\xE7\xE3o, as suas voltas e o grid como o jogo mostra, com a melhor volta de cada rival."],
      ["Classifica\xE7\xF5es e ligas", "Sua volta mais r\xE1pida de cada carro e pista entra sozinha na classifica\xE7\xE3o, e o hub de ligas re\xFAne ligas de Le Mans Ultimate com o Discord delas."]
    ],
    recs: "Recordes do Le Mans Ultimate por carro e pista",
    recsLead: "As voltas mais r\xE1pidas do Le Mans Ultimate feitas com o Pitlane HQ.",
    faqT: "Perguntas",
    faq: [
      ["Existe um app de telemetria gr\xE1tis para Le Mans Ultimate?", "Sim. O Pitlane HQ \xE9 gr\xE1tis. O suporte ao Le Mans Ultimate est\xE1 em beta, ent\xE3o escreva para support@pitlanehq.app se algo parecer errado."],
      ["Como ativo a telemetria do LMU?", "No Le Mans Ultimate abra Settings \u2192 Gameplay e ative Enable Plugins. O Pitlane HQ Agent encontra o jogo sozinho, sem instalar mais nada."],
      ["Funciona com Hypercar, LMP2 e LMGT3?", "Sim. Cada carro do jogo \xE9 gravado, e os overlays colorem cada classe."],
      ["Mostra a energia virtual?", "Sim. O overlay do dash mostra a energia virtual que resta ao lado do TC, do ABS, do mapa do motor e do balan\xE7o de freio, e o de combust\xEDvel o que cada volta gastou e o que voc\xEA pode gastar por volta para terminar."],
      ["Posso ver minha telemetria do LMU no celular?", "Sim. Entre com a mesma conta no celular ou em pitlanehq.app e toque em Conectar em Telemetria."],
      ["Tem iRating?", "O Le Mans Ultimate n\xE3o tem iRating nem licen\xE7as, ent\xE3o o Pitlane HQ n\xE3o mostra nenhum. Todo o resto funciona como no iRacing."]
    ],
    dl: "Baixar para Windows",
    app: "Abrir o app"
  }
};
var LAND_ALTS = altsOf(LAND);
var LANDL_ALTS = altsOf(LANDL);
var OV_IMGS = {
  en: [["ov-l-brakes.png", "Braking markers"], ["ov-l-coach.png", "Coach"], ["ov-g-inputs.png", "Inputs"], ["ov-g-timing.png", "Timing"], ["ov-s-sectors.png", "Mini-sectors"], ["ov-g-tyres.png", "Tyres"], ["ov-weather.png", "Weather"], ["ov-trackbar.png", "Track position bar"]],
  es: [["ov-l-brakes.png", "Marcas de frenada"], ["ov-l-coach.png", "Coach"], ["ov-g-inputs.png", "Pedales"], ["ov-g-timing.png", "Tiempos"], ["ov-s-sectors.png", "Minisectores"], ["ov-g-tyres.png", "Neum\xE1ticos"], ["ov-weather.png", "Clima"], ["ov-trackbar.png", "Barra de posiciones"]],
  pt: [["ov-l-brakes.png", "Marcas de frenagem"], ["ov-l-coach.png", "Coach"], ["ov-g-inputs.png", "Pedais"], ["ov-g-timing.png", "Tempos"], ["ov-s-sectors.png", "Minissetores"], ["ov-g-tyres.png", "Pneus"], ["ov-weather.png", "Clima"], ["ov-trackbar.png", "Barra de posi\xE7\xF5es"]]
};
var OVW = {
  en: {
    listT: "The overlays",
    expT: "Experimental overlays",
    exp: "Live lap compare, DRS and push-to-pass, g-force, mini-sectors, gaps, session stats, telemetry traces and performance (frames a second, CPU, GPU and latency). Switch them on in the Overlays tab.",
    vrT: "Overlays in VR",
    vr: "Every open overlay also shows in the headset as a SteamVR overlay, where it sits on your screen, so moving it on the screen moves it in VR. Meta headsets work through SteamVR. Turn it on in Settings \u2192 VR.",
    howT: "How they work",
    shotsT: "As Pitlane HQ Agent draws them",
    how: ["Drawn natively by Pitlane HQ Agent on Windows, not in a browser window.", "Only the panel shows. The rest is see-through and every click goes to the game.", "Drag and resize them while you place them. They never leave the screen.", "Four presets built in, and your own, saved in your account.", "Six looks, Lane, Wall, Light, Board, Frameless and Classic, for every overlay or a different one for each.", "Each overlay has its own opacity, text size and rows, and can hide by itself in the pits or when you are out of the car.", "Auto opens them when you get in the car and closes them when you get out."]
  },
  es: {
    listT: "Los overlays",
    expT: "Overlays experimentales",
    exp: "Comparaci\xF3n de vueltas en vivo, DRS y push-to-pass, fuerzas g, minisectores, diferencias, estad\xEDsticas de la sesi\xF3n, trazas de telemetr\xEDa y rendimiento (fotogramas por segundo, CPU, GPU y latencia). Se activan en la pesta\xF1a Overlays.",
    vrT: "Overlays en VR",
    vr: "Cada overlay abierto tambi\xE9n se ve en las gafas como un overlay de SteamVR, donde est\xE1 en tu pantalla, as\xED que moverlo en la pantalla lo mueve en VR. Las gafas Meta funcionan a trav\xE9s de SteamVR. Se activa en Ajustes \u2192 VR.",
    howT: "C\xF3mo funcionan",
    shotsT: "Tal como los dibuja Pitlane HQ Agent",
    how: ["Dibujados de forma nativa por Pitlane HQ Agent en Windows, no en una ventana de navegador.", "Solo se ve el panel. El resto es transparente y cada clic va al juego.", "Los arrastras y cambias de tama\xF1o mientras los colocas. Nunca se salen de la pantalla.", "Cuatro presets incluidos y los tuyos, guardados en tu cuenta.", "Seis estilos, Lane, Wall, Light, Board, Frameless y Classic, para todos los overlays o uno distinto para cada uno.", "Cada overlay tiene su propia opacidad, tama\xF1o de texto y filas, y puede ocultarse solo en boxes o al bajarte del coche.", "Auto los abre al subirte al coche y los cierra al bajarte."]
  },
  pt: {
    listT: "Os overlays",
    expT: "Overlays experimentais",
    exp: "Compara\xE7\xE3o de voltas ao vivo, DRS e push-to-pass, for\xE7as g, minissetores, diferen\xE7as, estat\xEDsticas da sess\xE3o, tra\xE7os de telemetria e desempenho (quadros por segundo, CPU, GPU e lat\xEAncia). Ative na aba Overlays.",
    vrT: "Overlays em VR",
    vr: "Cada overlay aberto tamb\xE9m aparece nos \xF3culos como um overlay do SteamVR, onde ele est\xE1 na sua tela, ent\xE3o mov\xEA-lo na tela o move em VR. Os \xF3culos Meta funcionam pelo SteamVR. Ative em Configura\xE7\xF5es \u2192 VR.",
    howT: "Como funcionam",
    shotsT: "Como o Pitlane HQ Agent os desenha",
    how: ["Desenhados de forma nativa pelo Pitlane HQ Agent no Windows, n\xE3o numa janela de navegador.", "S\xF3 o painel aparece. O resto \xE9 transparente e cada clique vai para o jogo.", "Arraste e redimensione enquanto posiciona. Eles nunca saem da tela.", "Quatro presets inclu\xEDdos e os seus, salvos na sua conta.", "Seis estilos, Lane, Wall, Light, Board, Frameless e Classic, para todos os overlays ou um diferente para cada um.", "Cada overlay tem sua pr\xF3pria opacidade, tamanho de texto e linhas, e pode se esconder sozinho nos boxes ou quando voc\xEA sai do carro.", "Auto abre quando voc\xEA entra no carro e fecha quando sai."]
  }
};
var OVL = {
  en: {
    path: "/iracing-overlays",
    title: "iRacing overlays, relative, radar and fuel \xB7 Pitlane HQ",
    desc: "Free iRacing overlays from Pitlane HQ. Relative, standings, radar, delta bar, fuel, tyres, track map, a live coach and more, also in VR through SteamVR.",
    h1: "iRacing overlays",
    lead: "Pitlane HQ Agent draws its overlays itself, on top of iRacing. They are light, sharp and see-through, and every click goes to the game. Place them once, save them as a preset and they open by themselves when you get in the car.",
    faq: [["Do the overlays cost anything?", "The basic overlays are free. During the beta the experimental ones are free too."], ["Do they need anything else?", "Only Pitlane HQ Agent on the Windows PC where you race."], ["Do they work in VR?", "Yes, through SteamVR, Meta headsets included."], ["Do they work in Le Mans Ultimate?", "Yes. The same overlays work in Le Mans Ultimate, in beta."]],
    items: [["Relative", "The cars ahead and behind on track, with the gaps, their trend, the class colours, your driver notes and +1L / \u22121L."], ["Standings", "The positions of the race, the gaps, the last laps and each driver's pace against yours."], ["Radar", "The cars beside and behind you, 60 times a second, with a red side bar and the nearest distance."], ["Delta bar", "Your gap to your best lap, metre by metre, and the lap this pace gives."], ["Fuel", "What each lap uses and what you may use per lap to finish without a stop."], ["Tyres", "Temperatures inside, middle and outside, the pressure and the wear."], ["Track map", "Every car on the track, the official turn numbers and the sectors."], ["Flags", "The start lights, the flags, debris, laps to go and one lap to green."], ["Dash", "Gear, speed, revs, the pedals, ABS and a strip with the lap, the place, the delta and the incidents."], ["Timing", "The official sectors of the lap in purple, green or yellow."], ["Pit stop", "Your speed against the pit lane limit and what the stop is doing."], ["Braking markers", "Where to brake in each corner, from the next level above your best lap."], ["Coach", "The next corner's tip and braking point while you drive, and after it what it gave or took."], ["Inputs", "Throttle, brake, clutch and steering as traces and bars."], ["Engine", "The game's engine warnings, the pit limiter and the rev limiter."], ["Incidents", "Your incident count and what is left before the limit."], ["Weather", "Track and air temperature, the wind against your car, the rain and how wet the track is."], ["Track position bar", "Every car along the lap on one line, class colours and you marked."]]
  },
  es: {
    path: "/es/overlays-iracing",
    title: "Overlays para iRacing, relative, radar y m\xE1s \xB7 Pitlane HQ",
    desc: "Overlays gratis para iRacing. Relative, clasificaci\xF3n, radar, barra de delta, combustible, neum\xE1ticos, mapa, un coach en vivo y m\xE1s, tambi\xE9n en VR.",
    h1: "Overlays para iRacing",
    lead: "Pitlane HQ Agent dibuja sus overlays \xE9l mismo, encima de iRacing. Son ligeros, n\xEDtidos y transparentes, y cada clic va al juego. Col\xF3calos una vez, gu\xE1rdalos como preset y se abren solos al subirte al coche.",
    faq: [["\xBFLos overlays cuestan algo?", "Los overlays b\xE1sicos son gratis. Durante la beta los experimentales tambi\xE9n lo son."], ["\xBFNecesitan algo m\xE1s?", "Solo Pitlane HQ Agent en el PC con Windows donde corres."], ["\xBFFuncionan en VR?", "S\xED, a trav\xE9s de SteamVR, tambi\xE9n con gafas Meta."], ["\xBFFuncionan en Le Mans Ultimate?", "S\xED. Los mismos overlays funcionan en Le Mans Ultimate, en beta."]],
    items: [["Relative", "Los coches delante y detr\xE1s en pista, con las diferencias, su tendencia, los colores de clase, tus notas de pilotos y +1L / \u22121L."], ["Clasificaci\xF3n", "Las posiciones de la carrera, las diferencias, las \xFAltimas vueltas y el ritmo de cada piloto frente al tuyo."], ["Radar", "Los coches a tu lado y detr\xE1s, 60 veces por segundo, con una barra lateral roja y la distancia al m\xE1s cercano."], ["Barra de delta", "Tu diferencia con tu mejor vuelta, metro a metro, y la vuelta que da este ritmo."], ["Combustible", "Lo que gasta cada vuelta y lo que puedes gastar por vuelta para terminar sin parar."], ["Neum\xE1ticos", "Temperaturas por dentro, centro y fuera, la presi\xF3n y el desgaste."], ["Mapa del circuito", "Todos los coches en pista, los n\xFAmeros oficiales de las curvas y los sectores."], ["Banderas", "El sem\xE1foro de salida, las banderas, restos en pista, vueltas restantes y una para la verde."], ["Dash", "Marcha, velocidad, revoluciones, los pedales, el ABS y una tira con la vuelta, la posici\xF3n, el delta y los incidentes."], ["Tiempos", "Los sectores oficiales de la vuelta en morado, verde o amarillo."], ["Parada en boxes", "Tu velocidad frente al l\xEDmite del pit lane y lo que est\xE1 haciendo la parada."], ["Marcas de frenada", "D\xF3nde frenar en cada curva, del siguiente nivel por encima de tu mejor vuelta."], ["Coach", "El consejo y el punto de frenada de la siguiente curva mientras conduces, y al salir lo que ganaste o perdiste."], ["Pedales", "Acelerador, freno, embrague y volante como trazas y barras."], ["Motor", "Los avisos del motor del juego, el limitador de boxes y el corte de revoluciones."], ["Incidentes", "Tus incidentes y lo que queda hasta el l\xEDmite."], ["Clima", "Temperatura de pista y aire, el viento contra tu coche, la lluvia y lo mojada que est\xE1 la pista."], ["Barra de posiciones", "Todos los coches a lo largo de la vuelta en una l\xEDnea, con los colores de clase y t\xFA marcado."]]
  },
  pt: {
    path: "/pt/overlays-iracing",
    title: "Overlays para iRacing, relative, radar e mais \xB7 Pitlane HQ",
    desc: "Overlays gr\xE1tis para iRacing do Pitlane HQ. Relative, classifica\xE7\xE3o, radar, barra de delta, combust\xEDvel, pneus, mapa, um coach ao vivo e mais, tamb\xE9m em VR.",
    h1: "Overlays para iRacing",
    lead: "O Pitlane HQ Agent desenha seus overlays sozinho, sobre o iRacing. S\xE3o leves, n\xEDtidos e transparentes, e cada clique vai para o jogo. Posicione uma vez, salve como preset e eles abrem sozinhos quando voc\xEA entra no carro.",
    faq: [["Os overlays custam algo?", "Os overlays b\xE1sicos s\xE3o gr\xE1tis. Durante a beta os experimentais tamb\xE9m s\xE3o."], ["Precisam de mais alguma coisa?", "S\xF3 do Pitlane HQ Agent no PC com Windows onde voc\xEA corre."], ["Funcionam em VR?", "Sim, pelo SteamVR, tamb\xE9m com \xF3culos Meta."], ["Funcionam no Le Mans Ultimate?", "Sim. Os mesmos overlays funcionam no Le Mans Ultimate, em beta."]],
    items: [["Relative", "Os carros \xE0 frente e atr\xE1s na pista, com as diferen\xE7as, a tend\xEAncia, as cores de classe, suas notas de pilotos e +1L / \u22121L."], ["Classifica\xE7\xE3o", "As posi\xE7\xF5es da corrida, as diferen\xE7as, as \xFAltimas voltas e o ritmo de cada piloto contra o seu."], ["Radar", "Os carros ao seu lado e atr\xE1s, 60 vezes por segundo, com uma barra lateral vermelha e a dist\xE2ncia do mais pr\xF3ximo."], ["Barra de delta", "A sua diferen\xE7a para a sua melhor volta, metro a metro, e a volta que esse ritmo d\xE1."], ["Combust\xEDvel", "O que cada volta gasta e o que voc\xEA pode gastar por volta para terminar sem parar."], ["Pneus", "Temperaturas por dentro, meio e fora, a press\xE3o e o desgaste."], ["Mapa da pista", "Todos os carros na pista, os n\xFAmeros oficiais das curvas e os setores."], ["Bandeiras", "As luzes de largada, as bandeiras, detritos, voltas restantes e uma para a verde."], ["Dash", "Marcha, velocidade, rota\xE7\xE3o, os pedais, o ABS e uma faixa com a volta, a posi\xE7\xE3o, o delta e os incidentes."], ["Tempos", "Os setores oficiais da volta em roxo, verde ou amarelo."], ["Pit stop", "A sua velocidade contra o limite do pit lane e o que a parada est\xE1 fazendo."], ["Marcas de frenagem", "Onde frear em cada curva, do pr\xF3ximo n\xEDvel acima da sua melhor volta."], ["Coach", "A dica e o ponto de frenagem da pr\xF3xima curva enquanto voc\xEA pilota, e na sa\xEDda o que voc\xEA ganhou ou perdeu."], ["Pedais", "Acelerador, freio, embreagem e volante como tra\xE7os e barras."], ["Motor", "Os avisos do motor do jogo, o limitador do pit e o corte de giro."], ["Incidentes", "Seus incidentes e o que falta at\xE9 o limite."], ["Clima", "Temperatura da pista e do ar, o vento contra o seu carro, a chuva e o quanto a pista est\xE1 molhada."], ["Barra de posi\xE7\xF5es", "Todos os carros ao longo da volta numa linha, com as cores de classe e voc\xEA marcado."]]
  }
};
var OVLL = {
  en: {
    path: "/le-mans-ultimate-overlays",
    title: "Le Mans Ultimate overlays, relative and radar \xB7 Pitlane HQ",
    desc: "Free Le Mans Ultimate overlays from Pitlane HQ, in beta. A multiclass relative, standings, radar, delta bar, fuel, track map and a dash with virtual energy.",
    h1: "Le Mans Ultimate overlays",
    lead: "Pitlane HQ Agent draws its overlays on top of Le Mans Ultimate, read from the game's own data. They are see-through, every click goes to the game, and they open by themselves when you get in the car. Le Mans Ultimate support is in beta.",
    faq: [["Are there free Le Mans Ultimate overlays?", "Yes. The basic overlays are free, and during the beta everything is."], ["What do I need to install?", "Only Pitlane HQ Agent on Windows. In the game, turn on Settings \u2192 Gameplay \u2192 Enable Plugins."], ["Do they work in VR?", "Yes. Every open overlay also shows in the headset through SteamVR."], ["Is there a fuel calculator?", "The fuel overlay is not a calculator you fill in. It measures each lap and shows what you may use per lap to finish without a stop, and the dash shows the virtual energy left."]],
    items: [["Relative", "The cars ahead and behind on track with the gaps, their trend, the colours of each class and +1L / \u22121L, made for multiclass races."], ["Standings", "Overall and by class, the gaps, the last laps and each driver's pace against yours."], ["Radar", "The cars beside and behind you, with a red side bar and the nearest distance."], ["Delta bar", "Your gap to your best lap, metre by metre, and the lap this pace gives."], ["Fuel", "What each lap uses and what you may use per lap to finish without a stop."], ["Dash", "Gear, speed, revs, the pedals, TC, ABS, engine map, brake bias and the virtual energy and battery left."], ["Track map", "Every car on the track coloured by class, the turns and the sectors."], ["Flags", "The start lights, the flags and the laps to go."], ["Timing", "The official sectors of the lap in purple, green or yellow."], ["Tyres", "Temperatures inside, middle and outside, and the pressure."], ["Pit stop", "Your speed on the pit road and whether the pit limiter is on."], ["Braking markers", "Where to brake in each corner, from the next level above your best lap."], ["Coach", "The next corner's tip and braking point while you drive."], ["Weather", "Track and air temperature and the wind against your car."], ["Track position bar", "Every car along the lap on one line, coloured by class."]]
  },
  es: {
    path: "/es/overlays-le-mans-ultimate",
    title: "Overlays para Le Mans Ultimate, relative y radar \xB7 Pitlane HQ",
    desc: "Overlays gratis para Le Mans Ultimate de Pitlane HQ, en beta. Relative multiclase, clasificaci\xF3n, radar, delta, combustible, mapa y un dash con energ\xEDa virtual.",
    h1: "Overlays para Le Mans Ultimate",
    lead: "Pitlane HQ Agent dibuja sus overlays encima de Le Mans Ultimate, con los datos del propio juego. Son transparentes, cada clic va al juego y se abren solos al subirte al coche. El soporte de Le Mans Ultimate est\xE1 en beta.",
    faq: [["\xBFHay overlays gratis para Le Mans Ultimate?", "S\xED. Los overlays b\xE1sicos son gratis, y durante la beta lo es todo."], ["\xBFQu\xE9 tengo que instalar?", "Solo Pitlane HQ Agent en Windows. En el juego, activa Settings \u2192 Gameplay \u2192 Enable Plugins."], ["\xBFFuncionan en VR?", "S\xED. Cada overlay abierto tambi\xE9n se ve en las gafas a trav\xE9s de SteamVR."], ["\xBFHay una calculadora de combustible?", "El overlay de combustible no es una calculadora que rellenas. Mide cada vuelta y te dice lo que puedes gastar por vuelta para terminar sin parar, y el dash muestra la energ\xEDa virtual que queda."]],
    items: [["Relative", "Los coches delante y detr\xE1s en pista con las diferencias, su tendencia, los colores de cada clase y +1L / \u22121L, pensado para carreras multiclase."], ["Clasificaci\xF3n", "General y por clase, las diferencias, las \xFAltimas vueltas y el ritmo de cada piloto frente al tuyo."], ["Radar", "Los coches a tu lado y detr\xE1s, con una barra lateral roja y la distancia al m\xE1s cercano."], ["Barra de delta", "Tu diferencia con tu mejor vuelta, metro a metro, y la vuelta que da este ritmo."], ["Combustible", "Lo que gasta cada vuelta y lo que puedes gastar por vuelta para terminar sin parar."], ["Dash", "Marcha, velocidad, revoluciones, los pedales, TC, ABS, mapa motor, reparto de frenada y la energ\xEDa virtual y la bater\xEDa que quedan."], ["Mapa del circuito", "Todos los coches en pista con el color de su clase, las curvas y los sectores."], ["Banderas", "El sem\xE1foro de salida, las banderas y las vueltas restantes."], ["Tiempos", "Los sectores oficiales de la vuelta en morado, verde o amarillo."], ["Neum\xE1ticos", "Temperaturas por dentro, centro y fuera, y la presi\xF3n."], ["Parada en boxes", "Tu velocidad en el pit lane y si el limitador est\xE1 puesto."], ["Marcas de frenada", "D\xF3nde frenar en cada curva, del siguiente nivel por encima de tu mejor vuelta."], ["Coach", "El consejo y el punto de frenada de la siguiente curva mientras conduces."], ["Clima", "Temperatura de pista y aire y el viento contra tu coche."], ["Barra de posiciones", "Todos los coches a lo largo de la vuelta en una l\xEDnea, con el color de su clase."]]
  },
  pt: {
    path: "/pt/overlays-le-mans-ultimate",
    title: "Overlays para Le Mans Ultimate, relative e radar \xB7 Pitlane HQ",
    desc: "Overlays gr\xE1tis para Le Mans Ultimate, em beta. Relative multiclasse, classifica\xE7\xE3o, radar, delta, combust\xEDvel, mapa e um dash com energia virtual.",
    h1: "Overlays para Le Mans Ultimate",
    lead: "O Pitlane HQ Agent desenha seus overlays sobre o Le Mans Ultimate, com os dados do pr\xF3prio jogo. S\xE3o transparentes, cada clique vai para o jogo e eles abrem sozinhos quando voc\xEA entra no carro. O suporte ao Le Mans Ultimate est\xE1 em beta.",
    faq: [["Existem overlays gr\xE1tis para Le Mans Ultimate?", "Sim. Os overlays b\xE1sicos s\xE3o gr\xE1tis, e durante a beta tudo \xE9."], ["O que preciso instalar?", "S\xF3 o Pitlane HQ Agent no Windows. No jogo, ative Settings \u2192 Gameplay \u2192 Enable Plugins."], ["Funcionam em VR?", "Sim. Cada overlay aberto tamb\xE9m aparece nos \xF3culos pelo SteamVR."], ["Tem uma calculadora de combust\xEDvel?", "O overlay de combust\xEDvel n\xE3o \xE9 uma calculadora para preencher. Ele mede cada volta e mostra o que voc\xEA pode gastar por volta para terminar sem parar, e o dash mostra a energia virtual que resta."]],
    items: [["Relative", "Os carros \xE0 frente e atr\xE1s na pista com as diferen\xE7as, a tend\xEAncia, as cores de cada classe e +1L / \u22121L, feito para corridas multiclasse."], ["Classifica\xE7\xE3o", "Geral e por classe, as diferen\xE7as, as \xFAltimas voltas e o ritmo de cada piloto contra o seu."], ["Radar", "Os carros ao seu lado e atr\xE1s, com uma barra lateral vermelha e a dist\xE2ncia do mais pr\xF3ximo."], ["Barra de delta", "A sua diferen\xE7a para a sua melhor volta, metro a metro, e a volta que esse ritmo d\xE1."], ["Combust\xEDvel", "O que cada volta gasta e o que voc\xEA pode gastar por volta para terminar sem parar."], ["Dash", "Marcha, velocidade, rota\xE7\xE3o, os pedais, TC, ABS, mapa do motor, balan\xE7o de freio e a energia virtual e a bateria que restam."], ["Mapa da pista", "Todos os carros na pista com a cor da classe, as curvas e os setores."], ["Bandeiras", "As luzes de largada, as bandeiras e as voltas restantes."], ["Tempos", "Os setores oficiais da volta em roxo, verde ou amarelo."], ["Pneus", "Temperaturas por dentro, meio e fora, e a press\xE3o."], ["Pit stop", "A sua velocidade no pit lane e se o limitador est\xE1 ligado."], ["Marcas de frenagem", "Onde frear em cada curva, do pr\xF3ximo n\xEDvel acima da sua melhor volta."], ["Coach", "A dica e o ponto de frenagem da pr\xF3xima curva enquanto voc\xEA pilota."], ["Clima", "Temperatura da pista e do ar e o vento contra o seu carro."], ["Barra de posi\xE7\xF5es", "Todos os carros ao longo da volta numa linha, com a cor da classe."]]
  }
};
var OVL_ALTS = altsOf(OVL);
var OVLL_ALTS = altsOf(OVLL);
function overlaysPage(l, game) {
  const O = (game === "lmu" ? OVLL : OVL)[l], W2 = OVW[l], L = (game === "lmu" ? LANDL : LAND)[l];
  const shots = OV_IMGS[l];
  const body = `<h1>${esc4(O.h1)}</h1><p class="lead">${esc4(O.lead)}</p>
<div class="cta"><a class="btn p" href="/dl/PitlaneHQ-Setup.exe">${esc4(L.dl)}</a><a class="btn" href="${L.path}">${esc4(T2[l].tel[game])}</a></div>
<h2>${esc4(W2.listT)}</h2><div class="g">${O.items.map(([h, p]) => `<section class="c"><h3>${esc4(h)}</h3><p>${esc4(p)}</p></section>`).join("")}</div>
<h2>${esc4(W2.shotsT)}</h2><div class="ovs">${shots.map(([f, c]) => `<figure>${img(l, f, c)}<figcaption>${esc4(c)}</figcaption></figure>`).join("")}</div>
<h2>${esc4(W2.expT)}</h2><p>${esc4(W2.exp)}</p>
<h2>${esc4(W2.vrT)}</h2><p>${esc4(W2.vr)}</p>
<h2>${esc4(W2.howT)}</h2><ul>${W2.how.map((x) => `<li>${esc4(x)}</li>`).join("")}</ul>
<h2>${esc4(L.faqT)}</h2>${O.faq.map(([q2, a]) => `<details open><summary>${esc4(q2)}</summary><p>${esc4(a)}</p></details>`).join("")}
${game === "lmu" ? `<p class="x">${esc4(T2[l].other.lmu)} <a href="${OVL[l].path}">${esc4(OVL[l].h1)} \u2192</a></p>` : `<p class="x">${esc4(T2[l].other.iracing)} <a href="${OVLL[l].path}">${esc4(OVLL[l].h1)} \u2192</a></p>`}`;
  const ld = [
    crumbs(game === "lmu" ? [["Pitlane HQ", LAND[l].path], ["Le Mans Ultimate", LANDL[l].path], [O.h1, O.path]] : [["Pitlane HQ", LAND[l].path], [O.h1, O.path]]),
    appLd(l, O.desc, shots.map(([f]) => f)),
    faqLd(O.faq)
  ];
  return html(page3(l, { title: O.title, desc: O.desc, path: O.path, alts: game === "lmu" ? OVLL_ALTS : OVL_ALTS, body, ld, game }));
}
__name(overlaysPage, "overlaysPage");
var LG_CAT = {
  en: { oval: "oval", sports_car: "sports-car", formula_car: "formula", dirt_oval: "dirt-oval", dirt_road: "dirt-road" },
  es: { oval: "ovalo", sports_car: "sports-car", formula_car: "formula", dirt_oval: "ovalo-de-tierra", dirt_road: "tierra" },
  pt: { oval: "oval", sports_car: "sports-car", formula_car: "formula", dirt_oval: "oval-de-terra", dirt_road: "terra" }
};
var LG_DAYS = { en: ["Mon", "Tue", "Wed", "Thu", "Fri", "Sat", "Sun"], es: ["Lun", "Mar", "Mi\xE9", "Jue", "Vie", "S\xE1b", "Dom"], pt: ["Seg", "Ter", "Qua", "Qui", "Sex", "S\xE1b", "Dom"] };
var LG_MIN = 3;
var LGW = {
  en: {
    posted: "Leagues posted on Pitlane HQ",
    byCat: "By discipline",
    all: "All",
    post: "Post your league for free",
    join: "Join the Discord",
    site: "Website",
    online: "online",
    members: "members",
    none: "No leagues yet.",
    upd: "Updated",
    open: "Looking for drivers",
    races: "Races",
    cars: "Cars",
    lang: "Language",
    see: "See it in Pitlane HQ"
  },
  es: {
    posted: "Ligas publicadas en Pitlane HQ",
    byCat: "Por disciplina",
    all: "Todas",
    post: "Publica tu liga gratis",
    join: "Unirse al Discord",
    site: "Web",
    online: "conectados",
    members: "miembros",
    none: "A\xFAn no hay ligas.",
    upd: "Actualizado",
    open: "Busca pilotos",
    races: "Corre",
    cars: "Coches",
    lang: "Idioma",
    see: "Verla en Pitlane HQ"
  },
  pt: {
    posted: "Ligas publicadas no Pitlane HQ",
    byCat: "Por disciplina",
    all: "Todas",
    post: "Publique sua liga de gra\xE7a",
    join: "Entrar no Discord",
    site: "Site",
    online: "online",
    members: "membros",
    none: "Ainda n\xE3o h\xE1 ligas.",
    upd: "Atualizado",
    open: "Procura pilotos",
    races: "Corre",
    cars: "Carros",
    lang: "Idioma",
    see: "Ver no Pitlane HQ"
  }
};
var LEAG = {
  en: {
    path: "/iracing-leagues",
    title: "iRacing leagues to join, with their Discord \xB7 Pitlane HQ",
    catT: /* @__PURE__ */ __name((c) => `iRacing ${c} leagues to join \xB7 Pitlane HQ`, "catT"),
    desc: "Find an iRacing league to race in. Leagues looking for drivers, the days they race and how many drivers are on their Discord right now.",
    catD: /* @__PURE__ */ __name((c) => `${cap(c)} leagues on iRacing you can join, with the days they race, their Discord and how many drivers are online now.`, "catD"),
    h1: "iRacing leagues",
    catH: /* @__PURE__ */ __name((c) => `iRacing ${c} leagues`, "catH"),
    lead: "Leagues to race in on iRacing, posted by their organisers on Pitlane HQ, and the most active leagues sorted by how many drivers are on their Discord right now. Join one in a click, or post your own league for free.",
    catLead: /* @__PURE__ */ __name((c) => `iRacing ${c} leagues to race in, posted by their organisers on Pitlane HQ or found on Reddit, sorted by how many drivers are on their Discord right now.`, "catLead"),
    active: "The most active iRacing leagues",
    any: "iRacing league",
    catQ: /* @__PURE__ */ __name((c) => [`Where do I find an iRacing ${c} league?`, `Here, sorted by how many drivers are online on its Discord. Every card links to the league's Discord or website.`], "catQ"),
    faq: [
      ["How do I join an iRacing league?", "Pick a league here and join its Discord or its website. The organisers say there when the league races, which cars and tracks it uses and how to sign up."],
      ["Do iRacing leagues cost anything?", "Most leagues are free to join. You need an iRacing subscription and the cars and tracks the league races with."],
      ["How are these leagues chosen?", "Some are posted by their organisers on Pitlane HQ. The others are leagues posted on Reddit with a Discord invite, and every few hours Pitlane HQ reads how many members each Discord has and how many are online."],
      ["Can I add my league?", "Yes. Create a free Pitlane HQ account and post it in Community \u2192 Leagues with its race days, its start time, its Discord or its website."]
    ]
  },
  es: {
    path: "/es/ligas-iracing",
    title: "Ligas de iRacing para unirte, con su Discord \xB7 Pitlane HQ",
    catT: /* @__PURE__ */ __name((c) => `Ligas de ${c} de iRacing para unirte \xB7 Pitlane HQ`, "catT"),
    desc: "Encuentra una liga de iRacing en la que correr. Ligas que buscan pilotos, los d\xEDas que corren y cu\xE1ntos pilotos hay ahora en su Discord.",
    catD: /* @__PURE__ */ __name((c) => `Ligas de ${c} en iRacing a las que puedes unirte, con los d\xEDas que corren, su Discord y cu\xE1ntos pilotos hay conectados ahora.`, "catD"),
    h1: "Ligas de iRacing",
    catH: /* @__PURE__ */ __name((c) => `Ligas de ${c} de iRacing`, "catH"),
    lead: "Ligas en las que correr en iRacing, publicadas por sus organizadores en Pitlane HQ, y las ligas m\xE1s activas ordenadas por cu\xE1ntos pilotos hay ahora mismo en su Discord. \xDAnete a una con un clic, o publica tu liga gratis.",
    catLead: /* @__PURE__ */ __name((c) => `Ligas de ${c} de iRacing en las que correr, publicadas por sus organizadores en Pitlane HQ o encontradas en Reddit, ordenadas por cu\xE1ntos pilotos hay ahora en su Discord.`, "catLead"),
    active: "Las ligas de iRacing m\xE1s activas",
    any: "Liga de iRacing",
    catQ: /* @__PURE__ */ __name((c) => [`\xBFD\xF3nde encuentro una liga de ${c} de iRacing?`, `Aqu\xED, ordenadas por cu\xE1ntos pilotos hay conectados en su Discord. Cada tarjeta lleva al Discord o a la web de la liga.`], "catQ"),
    faq: [
      ["\xBFC\xF3mo me uno a una liga de iRacing?", "Elige una liga aqu\xED y entra en su Discord o en su web. Los organizadores cuentan ah\xED cu\xE1ndo corre la liga, con qu\xE9 coches y circuitos, y c\xF3mo apuntarte."],
      ["\xBFCuestan algo las ligas de iRacing?", "La mayor\xEDa de las ligas son gratis. Necesitas una suscripci\xF3n de iRacing y los coches y circuitos con los que corre la liga."],
      ["\xBFC\xF3mo se eligen estas ligas?", "Unas las publican sus organizadores en Pitlane HQ. Las dem\xE1s son ligas publicadas en Reddit con una invitaci\xF3n de Discord, y cada pocas horas Pitlane HQ lee cu\xE1ntos miembros tiene cada Discord y cu\xE1ntos est\xE1n conectados."],
      ["\xBFPuedo a\xF1adir mi liga?", "S\xED. Crea una cuenta gratis de Pitlane HQ y publ\xEDcala en Comunidad \u2192 Ligas con sus d\xEDas de carrera, su hora de inicio, su Discord o su web."]
    ]
  },
  pt: {
    path: "/pt/ligas-iracing",
    title: "Ligas de iRacing para entrar, com o Discord \xB7 Pitlane HQ",
    catT: /* @__PURE__ */ __name((c) => `Ligas de ${c} do iRacing para entrar \xB7 Pitlane HQ`, "catT"),
    desc: "Encontre uma liga de iRacing para correr. Ligas que procuram pilotos, os dias em que correm e quantos pilotos est\xE3o no Discord delas agora.",
    catD: /* @__PURE__ */ __name((c) => `Ligas de ${c} no iRacing em que voc\xEA pode entrar, com os dias em que correm, o Discord e quantos pilotos est\xE3o online agora.`, "catD"),
    h1: "Ligas de iRacing",
    catH: /* @__PURE__ */ __name((c) => `Ligas de ${c} do iRacing`, "catH"),
    lead: "Ligas para correr no iRacing, publicadas pelos organizadores no Pitlane HQ, e as ligas mais ativas ordenadas por quantos pilotos est\xE3o no Discord delas agora. Entre numa com um clique, ou publique sua liga de gra\xE7a.",
    catLead: /* @__PURE__ */ __name((c) => `Ligas de ${c} do iRacing para correr, publicadas pelos organizadores no Pitlane HQ ou encontradas no Reddit, ordenadas por quantos pilotos est\xE3o no Discord agora.`, "catLead"),
    active: "As ligas de iRacing mais ativas",
    any: "Liga de iRacing",
    catQ: /* @__PURE__ */ __name((c) => [`Onde encontro uma liga de ${c} do iRacing?`, `Aqui, ordenadas por quantos pilotos est\xE3o online no Discord. Cada cart\xE3o leva ao Discord ou ao site da liga.`], "catQ"),
    faq: [
      ["Como entro numa liga de iRacing?", "Escolha uma liga aqui e entre no Discord ou no site dela. Os organizadores contam l\xE1 quando a liga corre, com quais carros e pistas e como se inscrever."],
      ["As ligas de iRacing custam algo?", "A maioria das ligas \xE9 gr\xE1tis. Voc\xEA precisa de uma assinatura do iRacing e dos carros e pistas com que a liga corre."],
      ["Como essas ligas s\xE3o escolhidas?", "Algumas s\xE3o publicadas pelos organizadores no Pitlane HQ. As outras s\xE3o ligas publicadas no Reddit com um convite do Discord, e a cada poucas horas o Pitlane HQ l\xEA quantos membros cada Discord tem e quantos est\xE3o online."],
      ["Posso adicionar minha liga?", "Sim. Crie uma conta gr\xE1tis no Pitlane HQ e publique em Comunidade \u2192 Ligas com os dias de corrida, a hora de in\xEDcio, o Discord ou o site."]
    ]
  }
};
var LEAGL = {
  en: {
    path: "/le-mans-ultimate-leagues",
    title: "Le Mans Ultimate leagues to join \xB7 Pitlane HQ",
    desc: "Find a Le Mans Ultimate league to race in. LMU leagues looking for drivers, the days they race and how many drivers are on their Discord right now.",
    h1: "Le Mans Ultimate leagues",
    lead: "Leagues to race in on Le Mans Ultimate, posted by their organisers on Pitlane HQ or found on Reddit, sorted by how many drivers are on their Discord right now. Join one in a click, or post your own league for free.",
    active: "The most active Le Mans Ultimate leagues",
    any: "Le Mans Ultimate league",
    faq: [
      ["How do I join a Le Mans Ultimate league?", "Pick a league here and join its Discord or its website. The organisers say there when it races, which classes and tracks it uses and how to sign up."],
      ["Do LMU leagues cost anything?", "Most are free to join. You need Le Mans Ultimate and the content the league races with."],
      ["How are these leagues chosen?", "Some are posted by their organisers on Pitlane HQ. The others are leagues posted on Reddit with a Discord invite, and every few hours Pitlane HQ reads how many members each Discord has and how many are online."],
      ["Can I add my league?", "Yes. Create a free Pitlane HQ account and post it in Community \u2192 Leagues, choosing Le Mans Ultimate."]
    ]
  },
  es: {
    path: "/es/ligas-le-mans-ultimate",
    title: "Ligas de Le Mans Ultimate para unirte \xB7 Pitlane HQ",
    desc: "Encuentra una liga de Le Mans Ultimate en la que correr. Ligas de LMU que buscan pilotos, los d\xEDas que corren y cu\xE1ntos pilotos hay ahora en su Discord.",
    h1: "Ligas de Le Mans Ultimate",
    lead: "Ligas en las que correr en Le Mans Ultimate, publicadas por sus organizadores en Pitlane HQ o encontradas en Reddit, ordenadas por cu\xE1ntos pilotos hay ahora en su Discord. \xDAnete a una con un clic, o publica tu liga gratis.",
    active: "Las ligas de Le Mans Ultimate m\xE1s activas",
    any: "Liga de Le Mans Ultimate",
    faq: [
      ["\xBFC\xF3mo me uno a una liga de Le Mans Ultimate?", "Elige una liga aqu\xED y entra en su Discord o en su web. Los organizadores cuentan ah\xED cu\xE1ndo corre, con qu\xE9 clases y circuitos, y c\xF3mo apuntarte."],
      ["\xBFCuestan algo las ligas de LMU?", "La mayor\xEDa son gratis. Necesitas Le Mans Ultimate y el contenido con el que corre la liga."],
      ["\xBFC\xF3mo se eligen estas ligas?", "Unas las publican sus organizadores en Pitlane HQ. Las dem\xE1s son ligas publicadas en Reddit con una invitaci\xF3n de Discord, y cada pocas horas Pitlane HQ lee cu\xE1ntos miembros tiene cada Discord y cu\xE1ntos est\xE1n conectados."],
      ["\xBFPuedo a\xF1adir mi liga?", "S\xED. Crea una cuenta gratis de Pitlane HQ y publ\xEDcala en Comunidad \u2192 Ligas, eligiendo Le Mans Ultimate."]
    ]
  },
  pt: {
    path: "/pt/ligas-le-mans-ultimate",
    title: "Ligas de Le Mans Ultimate para entrar \xB7 Pitlane HQ",
    desc: "Encontre uma liga de Le Mans Ultimate para correr. Ligas de LMU que procuram pilotos, os dias em que correm e quantos pilotos est\xE3o no Discord agora.",
    h1: "Ligas de Le Mans Ultimate",
    lead: "Ligas para correr no Le Mans Ultimate, publicadas pelos organizadores no Pitlane HQ ou encontradas no Reddit, ordenadas por quantos pilotos est\xE3o no Discord agora. Entre numa com um clique, ou publique sua liga de gra\xE7a.",
    active: "As ligas de Le Mans Ultimate mais ativas",
    any: "Liga de Le Mans Ultimate",
    faq: [
      ["Como entro numa liga de Le Mans Ultimate?", "Escolha uma liga aqui e entre no Discord ou no site dela. Os organizadores contam l\xE1 quando corre, com quais classes e pistas e como se inscrever."],
      ["As ligas de LMU custam algo?", "A maioria \xE9 gr\xE1tis. Voc\xEA precisa do Le Mans Ultimate e do conte\xFAdo com que a liga corre."],
      ["Como essas ligas s\xE3o escolhidas?", "Algumas s\xE3o publicadas pelos organizadores no Pitlane HQ. As outras s\xE3o ligas publicadas no Reddit com um convite do Discord, e a cada poucas horas o Pitlane HQ l\xEA quantos membros cada Discord tem e quantos est\xE3o online."],
      ["Posso adicionar minha liga?", "Sim. Crie uma conta gr\xE1tis no Pitlane HQ e publique em Comunidade \u2192 Ligas, escolhendo Le Mans Ultimate."]
    ]
  }
};
var LEAG_ALTS = altsOf(LEAG);
var LEAGL_ALTS = altsOf(LEAGL);
var lgPath = /* @__PURE__ */ __name((l, cat) => LEAG[l].path + (cat ? "/" + LG_CAT[l][cat] : ""), "lgPath");
var lgAlts = /* @__PURE__ */ __name((cat) => ({ en: lgPath("en", cat), es: lgPath("es", cat), pt: lgPath("pt", cat) }), "lgAlts");
var LG_CN = {
  en: { oval: "oval", sports_car: "sports car", formula_car: "formula", dirt_oval: "dirt oval", dirt_road: "dirt road" },
  es: { oval: "\xF3valo", sports_car: "Sports Car", formula_car: "f\xF3rmula", dirt_oval: "\xF3valo de tierra", dirt_road: "tierra" },
  pt: { oval: "oval", sports_car: "Sports Car", formula_car: "f\xF3rmula", dirt_oval: "oval de terra", dirt_road: "terra" }
};
async function postedLeagues(env, game) {
  const r2 = await env.DB.prepare("SELECT id, name, about, cats, days, time, tz, open, discord, web, cars, lang, updated FROM leagues WHERE game=?1 ORDER BY open DESC, updated DESC LIMIT 100").bind(game).all().catch(() => ({ results: [] }));
  const lst = /* @__PURE__ */ __name((v) => {
    try {
      return JSON.parse(v || "[]") || [];
    } catch (e) {
      return [];
    }
  }, "lst");
  return (r2.results || []).map((x) => ({ ...x, cats: lst(x.cats), days: lst(x.days).map(Number).filter((d) => d >= 0 && d <= 6) }));
}
__name(postedLeagues, "postedLeagues");
async function leaguesData(env, game = "iracing") {
  const [posted, F2] = await Promise.all([postedLeagues(env, game), foundLeagues(env, false, game).catch(() => ({ leagues: [] }))]);
  const lastPost = Math.max(0, ...posted.map((x) => +x.updated || 0));
  return { posted, found: F2.leagues || [], updated: Math.max(F2.updated || 0, lastPost) };
}
__name(leaguesData, "leaguesData");
var catCounts = /* @__PURE__ */ __name((D) => {
  const n = {};
  for (const x of D.posted.concat(D.found)) for (const c of x.cats || []) n[c] = (n[c] || 0) + 1;
  return n;
}, "catCounts");
async function leaguesPage(env, l, cat, game = "iracing") {
  const lmu = game === "lmu", G = (lmu ? LEAGL : LEAG)[l], W2 = LGW[l], D = await leaguesData(env, game), has = /* @__PURE__ */ __name((x) => !cat || (x.cats || []).includes(cat), "has");
  const posted = D.posted.filter(has), found = D.found.filter(has).slice(0, 40);
  if ((cat || lmu) && !posted.length && !found.length) return notFound(l);
  const cn = cat ? LG_CN[l][cat] : "", path = lmu ? G.path : lgPath(l, cat), num4 = /* @__PURE__ */ __name((n) => Number(n || 0).toLocaleString(HLANG[l]), "num");
  const counts = catCounts(D), cats = lmu ? [] : Object.keys(CAT2.en).filter((k) => counts[k]);
  const catsOf2 = /* @__PURE__ */ __name((x) => (lmu ? [] : (x.cats || []).map((c) => CAT2[l][c] || c)).join(" \xB7 ") || G.any, "catsOf");
  const ext = /* @__PURE__ */ __name((u) => /^https:\/\//.test(String(u || "")) ? esc4(u) : "", "ext");
  const postedHTML = posted.map((x) => `<section class="c lg"><h3>${esc4(fix2(x.name))}</h3><p class="m k">${esc4(catsOf2(x))}${x.open ? ` \xB7 <b class="on">${esc4(W2.open)}</b>` : ""}</p>
${x.days.length ? `<p style="margin:0 0 4px">${esc4(W2.races)} ${esc4(x.days.map((d) => LG_DAYS[l][d]).join(", "))}${x.time ? ` \xB7 ${esc4(x.time)}${x.tz ? ` (${esc4(x.tz)})` : ""}` : ""}</p>` : ""}${x.cars ? `<p class="m" style="margin:0 0 4px">${esc4(W2.cars)} ${esc4(fix2(x.cars))}</p>` : ""}${x.lang ? `<p class="m" style="margin:0 0 4px">${esc4(W2.lang)} ${esc4(x.lang)}</p>` : ""}${x.about ? `<p class="m" style="font-size:14px;margin:6px 0 10px">${esc4(fix2(x.about).slice(0, 400))}</p>` : ""}
<p style="margin:8px 0 0">${ext(x.discord) ? `<a class="btn" href="${ext(x.discord)}" rel="nofollow noopener" target="_blank">${esc4(W2.join)}</a> ` : ""}${ext(x.web) ? `<a class="btn" href="${ext(x.web)}" rel="nofollow noopener" target="_blank">${esc4(W2.site)}</a> ` : ""}<a href="/?league=${encodeURIComponent(x.id)}" rel="nofollow">${esc4(W2.see)}</a></p></section>`).join("");
  const foundHTML = found.map((x) => `<section class="c lg">${x.icon ? `<img src="${esc4(x.icon)}" alt="" width="44" height="44" loading="lazy" decoding="async">` : ""}<h3>${esc4(fix2(x.name))}</h3><p class="m k">${esc4(catsOf2(x))}</p><p style="margin:0 0 6px"><b class="on">${num4(x.online)}</b> ${esc4(W2.online)} \xB7 <b>${num4(x.members)}</b> ${esc4(W2.members)}</p>${x.title ? `<p class="m" style="font-size:14px;margin:0 0 10px">${esc4(fix2(x.title))}</p>` : ""}<a class="btn" href="${esc4(x.invite)}" rel="nofollow noopener" target="_blank">${esc4(W2.join)}</a></section>`).join("");
  const faq = cat ? [G.catQ(cn), ...G.faq] : G.faq;
  const otherLg = lmu ? `<p class="x"><a href="${LEAG[l].path}">${esc4(LEAG[l].h1)} \u2192</a></p>` : HAS.lmuLeagues ? `<p class="x"><a href="${LEAGL[l].path}">${esc4(LEAGL[l].h1)} \u2192</a></p>` : "";
  const body = `<h1>${esc4(cat ? G.catH(cn) : G.h1)}</h1><p class="lead">${esc4(cat ? G.catLead(cn) : G.lead)}</p>
<div class="cta"><a class="btn p" href="/?league-post=1" rel="nofollow">${esc4(W2.post)}</a><a class="btn" href="${(lmu ? LANDL : LAND)[l].path}">${esc4(T2[l].tel[game])}</a></div>
${cats.length ? `<div class="cats" aria-label="${esc4(W2.byCat)}"><a href="${lgPath(l)}"${cat ? "" : ' class="on"'}>${esc4(W2.all)}</a>${cats.map((k) => `<a href="${lgPath(l, k)}"${k === cat ? ' class="on"' : ""}>${esc4(CAT2[l][k])}</a>`).join("")}</div>` : ""}
${posted.length ? `<h2>${esc4(W2.posted)}</h2><div class="g">${postedHTML}</div>` : ""}
${found.length ? `<h2>${esc4(G.active)}</h2><div class="g">${foundHTML}</div>${D.updated ? `<p class="m" style="font-size:14px">${esc4(W2.upd)} ${day(D.updated)}</p>` : ""}` : ""}
${!posted.length && !found.length ? `<p class="m">${esc4(W2.none)}</p>` : ""}
<h2>${esc4(LAND[l].faqT)}</h2>${faq.map(([q2, a]) => `<details open><summary>${esc4(q2)}</summary><p>${esc4(a)}</p></details>`).join("")}${otherLg}`;
  const root = lmu ? [["Pitlane HQ", LAND[l].path], ["Le Mans Ultimate", LANDL[l].path], [G.h1, G.path]] : [["Pitlane HQ", LAND[l].path], [G.h1, G.path]];
  const ld = [crumbs(cat ? [...root, [CAT2[l][cat], path]] : root), faqLd(faq)];
  const thin = cat ? posted.length + found.length < LG_MIN : !posted.length && !found.length;
  return html(page3(l, { title: cat ? G.catT(cn) : G.title, desc: cat ? G.catD(cn) : G.desc, path, alts: lmu ? LEAGL_ALTS : lgAlts(cat), body, ld, noindex: thin, game }), 1800);
}
__name(leaguesPage, "leaguesPage");
var REC_IDX = { iracing: { en: "/records", es: "/es/records", pt: "/pt/records" }, lmu: { en: "/le-mans-ultimate-records", es: "/es/records-le-mans-ultimate", pt: "/pt/recordes-le-mans-ultimate" } };
async function topCombos(env, n, game = "iracing") {
  const r2 = await env.DB.prepare(
    "SELECT track_id AS t, MAX(track) AS track, car_id AS c, MAX(car) AS car, COUNT(DISTINCT user_id) AS drivers, MIN(time) AS best, MAX(cat) AS hint, MAX(created) AS upd FROM community_laps WHERE game=?2 AND track_id>0 AND car_id>0 AND COALESCE(shown,'')<>'model' GROUP BY track_id, car_id ORDER BY drivers DESC, best LIMIT ?1"
  ).bind(n, game).all().catch(() => ({ results: [] }));
  return (r2.results || []).map((x) => ({ ...x, car: famName(game, x.c, x.car) }));
}
__name(topCombos, "topCombos");
var recPath = /* @__PURE__ */ __name((l, x, game = "iracing") => `${PRE2[l]}/records/${game === "lmu" ? "lmu/" : ""}${x.t}-${x.c}/${slug2(fix2(x.track) + " " + fix2(x.car))}`, "recPath");
var recAlts = /* @__PURE__ */ __name((x, game) => ({ en: recPath("en", x, game), es: recPath("es", x, game), pt: recPath("pt", x, game) }), "recAlts");
var catFor = /* @__PURE__ */ __name((cm, game, x, hint, track2, car) => game === "lmu" ? "sports_car" : catOf(cm, x.t, x.c, hint, track2, car), "catFor");
async function landing(env, l, game) {
  const lmu = game === "lmu", L = (lmu ? LANDL : LAND)[l], combos2 = await topCombos(env, 8, game);
  const guides = lmu ? [...TOPICS.filter((x) => x.game === "lmu").map((x) => x[l]), OVLL[l], ...HAS.lmuLeagues ? [LEAGL[l]] : [], ...lmuToo(l)] : [...TOPICS.filter((x) => x.game !== "lmu").map((x) => x[l]), OVL[l], LEAG[l]];
  const body = `<h1>${esc4(L.h1)}</h1><p class="lead">${esc4(L.lead)}</p>
<div class="cta"><a class="btn p" href="/dl/PitlaneHQ-Setup.exe">${esc4(L.dl)}</a><a class="btn" href="/">${esc4(L.app)}</a></div>
<div class="g">${L.cards.map(([h, p]) => `<section class="c"><h2>${esc4(h)}</h2><p>${esc4(p)}</p></section>`).join("")}</div>
${shot(l, lmu ? "coach.jpg" : "compare.jpg")}
${cross(l, game)}
<h2>${esc4(GUIDES[l])}</h2><div class="g">${guides.map((x) => `<a class="c" href="${x.path}"><h3>${esc4(x.h1)} \u2192</h3><p>${esc4(x.desc)}</p></a>`).join("")}</div>
${combos2.length ? `<h2>${esc4(L.recs)}</h2><p class="m">${esc4(L.recsLead)}</p><div class="tw"><table><tbody>${combos2.map((x) => `<tr><td><a href="${recPath(l, x, game)}">${esc4(fix2(x.track))}</a></td><td class="m">${esc4(fix2(x.car))}</td><td class="t">${fmt2(x.best)}</td></tr>`).join("")}</tbody></table></div><p><a href="${REC_IDX[game][l]}">${esc4(T2[l].rec)} \u2192</a></p>` : ""}
<h2>${esc4(L.faqT)}</h2>${L.faq.map(([q2, a]) => `<details><summary>${esc4(q2)}</summary><p>${esc4(a)}</p></details>`).join("")}`;
  const ld = [...lmu ? [crumbs([["Pitlane HQ", LAND[l].path], ["Le Mans Ultimate", L.path]])] : [], appLd(l, L.desc, [lmu ? "coach.jpg" : "compare.jpg"]), ...siteLd(l), faqLd(L.faq)];
  return html(page3(l, { title: L.title, desc: L.desc, path: L.path, alts: lmu ? LANDL_ALTS : LAND_ALTS, body, ld, game }));
}
__name(landing, "landing");
async function recordsIndex(env, l, cat, game = "iracing") {
  const all = await topCombos(env, 1e3, game), cm = game === "lmu" ? { tc: {}, c: {} } : await catMap(env).catch(() => ({ tc: {}, c: {} }));
  if (game === "lmu" && !all.length) return notFound(l);
  const gn = GNAME[game], rows = all.map((x) => ({ ...x, cat: catFor(cm, game, x, x.hint, x.track, x.car) }));
  const cats = Object.keys(CAT2.en).filter((k) => rows.some((x) => x.cat === k));
  const list = cat ? rows.filter((x) => x.cat === cat) : rows;
  const W2 = S2[l], A = REC_IDX[game], base2 = A[l], q2 = cat ? "?d=" + cat : "", path = base2 + q2;
  const title = `${W2.recH(gn)}${cat ? " \xB7 " + CAT2[l][cat] : ""} \xB7 Pitlane HQ`, desc = W2.recD(gn);
  const body = `<h1>${esc4(W2.recH(gn))}</h1><p class="lead">${esc4(desc)}</p>
${cats.length > 1 ? `<div class="cats"><a href="${base2}"${cat ? "" : ' class="on"'}>${esc4(W2.all)}</a>${cats.map((k) => `<a href="${base2}?d=${k}"${k === cat ? ' class="on"' : ""}>${esc4(CAT2[l][k])}</a>`).join("")}</div>` : ""}
${list.length ? `<div class="tw"><table><thead><tr><th>${esc4(W2.track)}</th><th>${esc4(W2.car)}</th><th>${esc4(W2.record)}</th><th>${esc4(W2.drivers)}</th></tr></thead><tbody>${list.map((x) => `<tr><td><a href="${recPath(l, x, game)}">${esc4(fix2(x.track))}</a></td><td class="m">${esc4(fix2(x.car))}</td><td class="t">${fmt2(x.best)}</td><td class="m">${x.drivers}</td></tr>`).join("")}</tbody></table></div>` : `<p class="m">${esc4(W2.none)}</p>`}
<h2>${esc4(W2.howT)}</h2><p>${esc4(W2.how(gn))}</p>
<h2>${esc4(LAND[l].faqT)}</h2>${W2.faq(gn).map(([q3, a]) => `<details open><summary>${esc4(q3)}</summary><p>${esc4(a)}</p></details>`).join("")}${cross(l, game)}`;
  const root = game === "lmu" ? [["Pitlane HQ", LAND[l].path], ["Le Mans Ultimate", LANDL[l].path], [T2[l].rec, base2]] : [["Pitlane HQ", LAND[l].path], [T2[l].rec, base2]];
  const ld = [
    crumbs(root),
    { "@context": "https://schema.org", "@type": "ItemList", name: W2.recH(gn), itemListElement: list.slice(0, 100).map((x, i) => ({ "@type": "ListItem", position: i + 1, url: SITE4 + recPath(l, x, game), name: fix2(x.car) + " \xB7 " + fix2(x.track) })) },
    faqLd(W2.faq(gn))
  ];
  return html(page3(l, { title, desc, path, alts: { en: A.en + q2, es: A.es + q2, pt: A.pt + q2 }, body, ld, noindex: !list.length, game }));
}
__name(recordsIndex, "recordsIndex");
async function recordsCombo(env, l, t, c, asked, game = "iracing") {
  c = await famId(env, game, c);
  const nm = await env.DB.prepare("SELECT MAX(track) AS track, MAX(car) AS car FROM community_laps WHERE track_id=?1 AND car_id=?2 AND game=?3").bind(t, c, game).first().catch(() => null);
  if (!nm || !nm.track) return null;
  nm.car = famName(game, c, nm.car);
  const canon = recPath(l, { t, c, track: nm.track, car: nm.car }, game);
  if (asked !== canon) return Response.redirect(SITE4 + canon, 301);
  const r2 = await env.DB.prepare(
    `SELECT l.user_id AS uid, CASE WHEN l.anon=1 OR COALESCE(ac.anon,0)=1 OR u.alias='Anonymous' THEN '' ELSE u.alias END AS alias, l.time, l.created, l.track, l.car, l.cat
       FROM community_laps l JOIN community_users u ON u.id=l.user_id LEFT JOIN accounts ac ON ac.id=l.user_id
      WHERE l.track_id=?1 AND l.car_id=?2 AND l.game=?3 AND COALESCE(l.shown,'')<>'model' ORDER BY l.time LIMIT 300`
  ).bind(t, c, game).all().catch(() => ({ results: [] }));
  const seen2 = /* @__PURE__ */ new Set(), laps = [];
  for (const x2 of r2.results || []) {
    if (seen2.has(x2.uid)) continue;
    seen2.add(x2.uid);
    laps.push(x2);
    if (laps.length >= 50) break;
  }
  if (!laps.length) return null;
  const gn = GNAME[game], track2 = fix2(nm.track), car = fix2(nm.car), cm = game === "lmu" ? { tc: {}, c: {} } : await catMap(env).catch(() => ({ tc: {}, c: {} }));
  const x = { t, c, track: track2, car }, cat = catFor(cm, game, x, laps[0].cat, laps[0].track, laps[0].car);
  const W2 = S2[l], rec = fmt2(laps[0].time), idx = REC_IDX[game][l];
  const title = recTitle(W2, car, track2, game), desc = W2.cD(car, track2, rec, laps.length, gn), L = (game === "lmu" ? LANDL : LAND)[l];
  const body = `<p class="m"><a href="${idx}">${esc4(W2.recH(gn))}</a>${game === "lmu" ? "" : ` \xB7 <a href="${idx}?d=${cat}">${esc4(CAT2[l][cat] || "")}</a>`}</p>
<h1>${esc4(car)}<br><span class="m" style="font-size:.7em">${esc4(track2)}</span></h1>
<p class="lead">${esc4(W2.cL(rec))}</p>
<div class="tw"><table><thead><tr><th class="n">#</th><th>${esc4(W2.driver)}</th><th>${esc4(W2.time)}</th><th>${esc4(W2.date)}</th></tr></thead><tbody>${laps.map((v, i) => `<tr><td class="n">${i + 1}</td><td>${esc4(v.alias || W2.anon)}</td><td class="t">${fmt2(v.time)}</td><td class="m">${day(v.created)}</td></tr>`).join("")}</tbody></table></div>
<div class="c" style="margin-top:22px"><h2>${esc4(W2.cQ)}</h2><p>${esc4(W2.cA(gn))}</p><div class="cta" style="margin-bottom:0"><a class="btn p" href="/dl/PitlaneHQ-Setup.exe">${esc4(L.dl)}</a><a class="btn" href="${L.path}">${esc4(T2[l].tel[game])}</a></div></div>`;
  const ld = [crumbs([["Pitlane HQ", LAND[l].path], ...game === "lmu" ? [["Le Mans Ultimate", LANDL[l].path]] : [], [T2[l].rec, idx], [car + " \xB7 " + track2, recPath(l, x, game)]])];
  return html(page3(l, { title, desc, path: recPath(l, x, game), alts: recAlts(x, game), body, ld, game }));
}
__name(recordsCombo, "recordsCombo");
var notFound = /* @__PURE__ */ __name((l) => noIndex(html(page3(l, {
  title: S2[l].nfT + " \xB7 Pitlane HQ",
  desc: S2[l].nf,
  path: null,
  noindex: true,
  body: `<h1>${esc4(S2[l].nf)}</h1><p><a href="${LAND[l].path}">${esc4(T2[l].tel.iracing)}</a> \xB7 <a href="${LANDL[l].path}">${esc4(T2[l].tel.lmu)}</a> \xB7 <a href="${REC_IDX.iracing[l]}">${esc4(T2[l].rec)}</a> \xB7 <a href="/">${esc4(T2[l].app)}</a></p>`
}), 600, 404)), "notFound");
var noIndex = /* @__PURE__ */ __name((r2) => {
  r2.headers.set("x-robots-tag", "noindex");
  r2.headers.set("cache-control", "public, max-age=60");
  return r2;
}, "noIndex");
var topicAlts = /* @__PURE__ */ __name((x) => altsOf(x), "topicAlts");
function topicPage(x, l) {
  const G = x[l], lmu = x.game === "lmu", L = (lmu ? LANDL : LAND)[l], game = lmu ? "lmu" : "iracing";
  const more = lmu ? lmuLinks(l).filter(([p]) => p !== G.path).concat(lmuToo(l).map((x2) => [x2.path, x2.h1])) : iracingLinks(l).filter(([p]) => p !== G.path).concat([[L.path, L.h1]]);
  const to = x.lmu ? x.lmu === "tel" ? LANDL[l] : x.lmu === "ov" ? OVLL[l] : TOPIC_BY[x.lmu] ? TOPIC_BY[x.lmu][l] : null : lmu ? TOPIC_BY.coach[l] : null;
  const body = `<h1>${esc4(G.h1)}</h1><p class="lead">${esc4(G.lead)}</p>
<div class="cta"><a class="btn p" href="/dl/PitlaneHQ-Setup.exe">${esc4(L.dl)}</a><a class="btn" href="/">${esc4(L.app)}</a></div>
<div class="g">${G.secs.map(([h, p]) => `<section class="c"><h2>${esc4(h)}</h2><p>${esc4(p)}</p></section>`).join("")}</div>
${x.img ? shot(l, x.img) : ""}${x.phones ? phones(l, x.phones) : ""}
${to ? `<p class="x">${esc4(T2[l].other[game])} <a href="${to.path}">${esc4(to.h1)} \u2192</a></p>` : ""}
<h2>${esc4(L.faqT)}</h2>${G.faq.map(([q2, a]) => `<details open><summary>${esc4(q2)}</summary><p>${esc4(a)}</p></details>`).join("")}
<h2>${esc4(GUIDES[l])}</h2><ul>${more.map(([p, h]) => `<li><a href="${p}">${esc4(h)}</a></li>`).join("")}</ul>`;
  const ld = [
    crumbs(lmu ? [["Pitlane HQ", LAND[l].path], ["Le Mans Ultimate", LANDL[l].path], [G.h1, G.path]] : [["Pitlane HQ", LAND[l].path], [G.h1, G.path]]),
    faqLd(G.faq),
    appLd(l, G.desc, x.img ? [x.img] : x.phones || [])
  ];
  return html(page3(l, { title: G.title, desc: G.desc, path: G.path, alts: topicAlts(x), body, ld, game }));
}
__name(topicPage, "topicPage");
var PAGES = [
  { alts: LAND_ALTS, draw: /* @__PURE__ */ __name((env, l) => landing(env, l, "iracing"), "draw"), alias: { en: ["/telemetry"], es: ["/es/telemetria", "/es"], pt: ["/pt/telemetria", "/pt", "/pt-br"] } },
  { alts: LANDL_ALTS, draw: /* @__PURE__ */ __name((env, l) => landing(env, l, "lmu"), "draw"), alias: { en: ["/lmu-telemetry", "/le-mans-ultimate", "/lmu"], es: ["/es/telemetria-lmu", "/es/le-mans-ultimate", "/es/lmu"], pt: ["/pt/telemetria-lmu", "/pt/le-mans-ultimate", "/pt/lmu"] } },
  { alts: OVL_ALTS, draw: /* @__PURE__ */ __name((env, l) => overlaysPage(l, "iracing"), "draw"), alias: { en: ["/overlays"], es: ["/es/overlays"], pt: ["/pt/overlays"] } },
  { alts: OVLL_ALTS, draw: /* @__PURE__ */ __name((env, l) => overlaysPage(l, "lmu"), "draw"), alias: { en: ["/lmu-overlays"], es: ["/es/overlays-lmu"], pt: ["/pt/overlays-lmu"] } },
  { alts: LEAG_ALTS, draw: /* @__PURE__ */ __name((env, l) => leaguesPage(env, l, "", "iracing"), "draw"), alias: { en: ["/leagues"], es: ["/es/ligas"], pt: ["/pt/ligas"] } },
  { alts: LEAGL_ALTS, draw: /* @__PURE__ */ __name((env, l) => leaguesPage(env, l, "", "lmu"), "draw"), alias: { en: ["/lmu-leagues"], es: ["/es/ligas-lmu"], pt: ["/pt/ligas-lmu"] } },
  { alts: REC_IDX.iracing, draw: /* @__PURE__ */ __name((env, l, cat) => recordsIndex(env, l, cat, "iracing"), "draw"), alias: {} },
  { alts: REC_IDX.lmu, draw: /* @__PURE__ */ __name((env, l, cat) => recordsIndex(env, l, cat, "lmu"), "draw"), alias: { en: ["/lmu-records"], es: ["/es/records-lmu"], pt: ["/pt/recordes-lmu"] } },
  ...TOPICS.map((x) => ({ alts: topicAlts(x), draw: /* @__PURE__ */ __name((env, l) => topicPage(x, l), "draw"), alias: x.id === "lmu-coach" ? { en: ["/lmu-coach"], es: ["/es/coach-lmu"], pt: ["/pt/coach-lmu"] } : {} }))
];
var AT = /* @__PURE__ */ new Map();
for (const pg of PAGES) for (const l of LANGS2) {
  AT.set(pg.alts[l], [pg, l, pg.alts[l]]);
  for (const a of pg.alias[l] || []) AT.set(a, [pg, l, pg.alts[l]]);
}
var STATIC_ALTS = [LAND_ALTS, LANDL_ALTS, OVL_ALTS, OVLL_ALTS, ...TOPICS.map(topicAlts)];
async function sitemap(env) {
  const [combos2, lmuCombos, D, DL] = await Promise.all([topCombos(env, 2e3), topCombos(env, 2e3, "lmu"), leaguesData(env), leaguesData(env, "lmu")]);
  const u = /* @__PURE__ */ __name((p, f, pr, alts, mod) => `<url><loc>${SITE4}${p}</loc>${mod ? `<lastmod>${mod}</lastmod>` : ""}<changefreq>${f}</changefreq><priority>${pr}</priority>${alts ? LANGS2.map((k) => `<xhtml:link rel="alternate" hreflang="${HLANG[k]}" href="${SITE4}${alts[k]}"/>`).join("") + `<xhtml:link rel="alternate" hreflang="x-default" href="${SITE4}${alts.en}"/>` : ""}</url>`, "u");
  const later2 = /* @__PURE__ */ __name((...d) => d.filter(Boolean).sort().pop() || SEO_DATE, "later");
  const newest = /* @__PURE__ */ __name((cs) => later2(SEO_DATE, day(Math.max(0, ...cs.map((x) => x.upd || 0)))), "newest");
  const s = [u("/", "weekly", "1.0", null, newest(combos2))];
  const all = /* @__PURE__ */ __name((alts, f, pr, mod) => {
    for (const k of LANGS2) s.push(u(alts[k], f, k === "en" ? pr : (pr - 0.1).toFixed(1), alts, mod));
  }, "all");
  all(LAND_ALTS, "weekly", 0.9, newest(combos2));
  all(LANDL_ALTS, "weekly", 0.9, newest(lmuCombos));
  all(OVL_ALTS, "monthly", 0.8, SEO_DATE);
  all(OVLL_ALTS, "monthly", 0.8, SEO_DATE);
  for (const x of TOPICS) all(topicAlts(x), "monthly", 0.8, SEO_DATE);
  const lgDay = /* @__PURE__ */ __name((d) => later2(SEO_DATE, day(d.updated)), "lgDay");
  all(LEAG_ALTS, "daily", 0.8, lgDay(D));
  const n = catCounts(D);
  for (const c of Object.keys(CAT2.en)) if ((n[c] || 0) >= LG_MIN) all(lgAlts(c), "daily", 0.7, lgDay(D));
  if (DL.posted.length + DL.found.length) all(LEAGL_ALTS, "daily", 0.8, lgDay(DL));
  all(REC_IDX.iracing, "daily", 0.8, newest(combos2));
  if (lmuCombos.length) all(REC_IDX.lmu, "daily", 0.8, newest(lmuCombos));
  s.push(u("/downloads", "weekly", "0.7", null, SEO_DATE), u("/changelog", "weekly", "0.4", null, SEO_DATE));
  for (const [game, cs] of [["iracing", combos2], ["lmu", lmuCombos]]) for (const x of cs) all(recAlts(x, game), "daily", 0.6, day(x.upd) || SEO_DATE);
  return new Response(`<?xml version="1.0" encoding="UTF-8"?>
<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9" xmlns:xhtml="http://www.w3.org/1999/xhtml">
${s.join("\n")}
</urlset>
`, { headers: { "content-type": "application/xml; charset=utf-8", "cache-control": "public, max-age=3600" } });
}
__name(sitemap, "sitemap");
var INDEXNOW_KEY = "1fbc105af121e0dcfc14e13a8740813a";
async function indexNow(env) {
  if (env.LOCAL === "1") return;
  const row = await env.DB.prepare("SELECT v FROM app_state WHERE k='indexnow_at'").first().catch(() => null);
  const ver = await env.DB.prepare("SELECT v FROM app_state WHERE k='indexnow_ver'").first().catch(() => null);
  const full = !ver || ver.v !== SEO_VER;
  let last = full ? 0 : +(row && row.v || 0);
  if (!full && Date.now() - last < 20 * 36e5) return;
  const tried = await env.DB.prepare("SELECT at FROM app_state WHERE k='indexnow_last'").first().catch(() => null);
  if (tried && Date.now() - tried.at < 6 * 36e5 && !(last > tried.at)) {
    const okBefore = await env.DB.prepare("SELECT v FROM app_state WHERE k='indexnow_last'").first().catch(() => null);
    if (!okBefore || !/^"?\{?.*"said":"2\d\d/.test(okBefore.v || "")) return;
  }
  const fresh = await env.DB.prepare(
    "SELECT game, track_id AS t, MAX(track) AS track, car_id AS c, MAX(car) AS car FROM community_laps WHERE game IN ('iracing','lmu') AND track_id>0 AND car_id>0 AND created>?1 GROUP BY game, track_id, car_id LIMIT 4000"
  ).bind(last).all().catch(() => ({ results: [] }));
  const rows = fresh.results || [], urls = [];
  if (!last) {
    const [D, DL, lmuCombos] = await Promise.all([leaguesData(env), leaguesData(env, "lmu"), topCombos(env, 1, "lmu")]);
    const n = catCounts(D);
    urls.push(
      "/",
      ...STATIC_ALTS.flatMap((a) => Object.values(a)),
      ...Object.values(LEAG_ALTS),
      ...Object.values(REC_IDX.iracing),
      "/downloads",
      "/changelog",
      ...Object.keys(CAT2.en).filter((c) => (n[c] || 0) >= LG_MIN).flatMap((c) => Object.values(lgAlts(c))),
      ...DL.posted.length + DL.found.length ? Object.values(LEAGL_ALTS) : [],
      ...lmuCombos.length ? Object.values(REC_IDX.lmu) : []
    );
  } else for (const g of ["iracing", "lmu"]) if (rows.some((x) => (x.game || "iracing") === g)) urls.push(...Object.values(REC_IDX[g]));
  for (const x of rows) {
    const g = x.game === "lmu" ? "lmu" : "iracing";
    urls.push(...Object.values(recAlts({ ...x, car: famName(g, x.c, x.car) }, g)));
  }
  if (urls.length) {
    const r2 = await fetch("https://api.indexnow.org/indexnow", {
      method: "POST",
      headers: { "content-type": "application/json; charset=utf-8" },
      body: JSON.stringify({ host: "pitlanehq.app", key: INDEXNOW_KEY, keyLocation: `${SITE4}/${INDEXNOW_KEY}.txt`, urlList: [...new Set(urls)].slice(0, 1e4).map((u) => SITE4 + u) })
    }).catch(() => null);
    const said = r2 ? r2.status + " " + (await r2.text().catch(() => "")).slice(0, 200) : "no answer";
    await env.DB.prepare("INSERT INTO app_state (k, v, at) VALUES ('indexnow_last', ?1, ?2) ON CONFLICT(k) DO UPDATE SET v=excluded.v, at=excluded.at").bind(JSON.stringify({ said, urls: urls.length }), Date.now()).run().catch(() => {
    });
    if (!r2 || r2.status >= 300) return;
  }
  await env.DB.prepare("INSERT INTO app_state (k, v, at) VALUES ('indexnow_at', ?1, ?1) ON CONFLICT(k) DO UPDATE SET v=excluded.v, at=excluded.at").bind(String(Date.now())).run().catch(() => {
  });
  if (full) await env.DB.prepare("INSERT INTO app_state (k, v, at) VALUES ('indexnow_ver', ?1, ?2) ON CONFLICT(k) DO UPDATE SET v=excluded.v, at=excluded.at").bind(SEO_VER, Date.now()).run().catch(() => {
  });
}
__name(indexNow, "indexNow");
var BOT = /(Googlebot|Google-InspectionTool|bingbot|YandexBot|DuckDuckBot|Applebot)/i;
async function noteBot(req, env, p) {
  const m = BOT.exec(req.headers.get("user-agent") || "");
  if (!m || !env.DB) return;
  await env.DB.prepare("INSERT INTO app_state (k, v, at) VALUES (?1, ?2, ?3) ON CONFLICT(k) DO UPDATE SET v=excluded.v, at=excluded.at").bind("bot_" + m[1].toLowerCase(), JSON.stringify({ path: p.slice(0, 200) }), Date.now()).run().catch(() => {
  });
}
__name(noteBot, "noteBot");
var RECORD_RE = /^(?:\/(es|pt))?\/records\/(?:(lmu)\/)?(\d+)-(\d+)(?:\/[a-z0-9-]*)?$/;
var LEAGUE_CAT_RE = /^(?:\/(es|pt))?\/(?:iracing-leagues|ligas-iracing)\/([a-z-]+)$/;
var isPublic = /* @__PURE__ */ __name((p) => p === "/sitemap.xml" || AT.has(p) || RECORD_RE.test(p) || LEAGUE_CAT_RE.test(p) || /^(\/(es|pt))?\/records\//.test(p), "isPublic");
async function draw(req, env, url, p) {
  if (p === "/sitemap.xml") return sitemap(env);
  await readHas(env);
  const at2 = /* @__PURE__ */ __name((canon, show) => url.pathname === canon ? show() : Response.redirect(SITE4 + canon + url.search, 301), "at");
  const hit = AT.get(p);
  if (hit) {
    const [pg, l, canon] = hit, dsc = url.searchParams.get("d");
    return at2(canon, () => pg.draw(env, l, CAT2.en[dsc] ? dsc : ""));
  }
  {
    const lm = LEAGUE_CAT_RE.exec(p);
    if (lm) {
      const l = lm[1] || "en", cat = Object.keys(LG_CAT[l]).find((k) => LG_CAT[l][k] === lm[2]);
      if (cat && LEAG[l].path === p.slice(0, p.lastIndexOf("/"))) return at2(p, () => leaguesPage(env, l, cat));
      return notFound(l);
    }
  }
  const m = RECORD_RE.exec(p);
  if (m) return await recordsCombo(env, m[1] || "en", +m[3], +m[4], url.pathname, m[2] ? "lmu" : "iracing") || notFound(m[1] || "en");
  return notFound(p.startsWith("/es") ? "es" : p.startsWith("/pt") ? "pt" : "en");
}
__name(draw, "draw");
async function seoPage(req, env, url, ctx) {
  if (req.method !== "GET" && req.method !== "HEAD") return null;
  const p = url.pathname.replace(/\/+$/, "") || "/";
  await noteBot(req, env, p);
  if (p === "/" + INDEXNOW_KEY + ".txt") return new Response(INDEXNOW_KEY, { headers: { "content-type": "text/plain; charset=utf-8" } });
  if (!isPublic(p)) return null;
  const cache2 = env.LOCAL !== "1" && typeof caches !== "undefined" && caches.default ? caches.default : null;
  const key = new Request(SITE4 + url.pathname + url.search, { method: "GET" });
  let res = cache2 ? await cache2.match(key).catch(() => null) : null;
  if (!res) {
    res = await draw(req, env, url, p);
    if (cache2 && res.status === 200) {
      const put = cache2.put(key, res.clone()).catch(() => {
      });
      if (ctx && ctx.waitUntil) ctx.waitUntil(put);
      else await put;
    }
  }
  const tag3 = res.headers.get("etag"), inm = req.headers.get("if-none-match");
  if (tag3 && inm && inm.split(/\s*,\s*/).includes(tag3)) return new Response(null, { status: 304, headers: { etag: tag3, "cache-control": res.headers.get("cache-control") || "" } });
  return req.method === "HEAD" ? new Response(null, { status: res.status, headers: res.headers }) : res;
}
__name(seoPage, "seoPage");

// src/usagelib.js
var DEVICES2 = ["web", "pc", "android", "ios"];
var KEY_RE = /^(view|act|game):[a-z0-9_.-]{1,40}$/;
var MAX_KEYS = 100;
var MAX_N = 1e3;
var MAX_DAYS = 90;
var FEEDBACK_MAX = 4e3;
var FEEDBACK_PER_DAY = 20;
var ASK_USED = 6 * 36e5;
var ASK_RACES = 2;
var MAX_MS = 10 * 6e4;
var OV_FIRST = 1;
var OV_AGAIN = 6;
var OV_GAMES = ["iracing", "lmu"];
var OV_MAX = 30;
var STYLE_RE = /^[a-z0-9_-]{1,20}$/;
var OV_RE = /^[a-z]{2,12}$/;
var USAGE_GAMES = ["iracing", "lmu", "acc", "ac"];
var gameKeyOk = /* @__PURE__ */ __name((k) => !k.startsWith("game:") || USAGE_GAMES.includes(k.slice(5)), "gameKeyOk");
var day2 = /* @__PURE__ */ __name((t) => new Date(t).toISOString().slice(0, 10), "day");
var cleanV2 = /* @__PURE__ */ __name((v) => String(v == null ? "" : v).replace(/[^0-9a-zA-Z.+-]/g, "").slice(0, 24), "cleanV");
function cleanUsage(b) {
  if (!b || typeof b !== "object") return { error: "missing body" };
  const device = String(b.device || "").toLowerCase();
  if (!DEVICES2.includes(device)) return { error: "unknown device" };
  const counts = [];
  if (b.counts && typeof b.counts === "object" && !Array.isArray(b.counts)) {
    for (const [k0, n0] of Object.entries(b.counts)) {
      if (counts.length >= MAX_KEYS) break;
      const k = String(k0).toLowerCase(), n = Math.floor(Number(n0));
      if (!KEY_RE.test(k) || !gameKeyOk(k) || !(n > 0)) continue;
      counts.push([k, Math.min(n, MAX_N)]);
    }
  }
  const ms = Math.max(0, Math.min(MAX_MS, Math.floor(Number(b.ms) || 0)));
  return { device, v: cleanV2(b.v), counts, ms };
}
__name(cleanUsage, "cleanUsage");
function cleanFeedback(b) {
  if (!b || typeof b !== "object") return { error: "missing body" };
  const text2 = String(b.text == null ? "" : b.text).replace(/\r\n?/g, "\n").replace(/[\u0000-\u0008\u000b\u000c\u000e-\u001f]/g, "").trim();
  if (!text2) return { error: "write something first" };
  if (text2.length > FEEDBACK_MAX) return { error: "too long (" + FEEDBACK_MAX + " characters at most)" };
  let rating = null;
  if (b.rating != null && b.rating !== "" && b.rating !== 0) {
    const r2 = Number(b.rating);
    if (!Number.isInteger(r2) || r2 < 1 || r2 > 5) return { error: "the rating goes from 1 to 5" };
    rating = r2;
  }
  const kind = b.kind === "overlays" ? "overlays" : "general";
  let style = null;
  if (kind === "overlays") {
    style = cleanStyle(b.style);
    if (!style) return { error: "unknown overlay design" };
  }
  const device = String(b.device || "").toLowerCase();
  return { text: text2, rating, kind, style, device: DEVICES2.includes(device) ? device : "", v: cleanV2(b.v), view: String(b.view || "").replace(/[^a-z0-9_.:-]/gi, "").slice(0, 40) };
}
__name(cleanFeedback, "cleanFeedback");
function cleanStyle(v) {
  if (v == null || v === "") return "classic";
  const s = String(v).toLowerCase();
  return STYLE_RE.test(s) ? s : null;
}
__name(cleanStyle, "cleanStyle");
function cleanOvRace(b) {
  if (!b || typeof b !== "object") return { error: "missing body" };
  const style = cleanStyle(b.style);
  if (!style) return { error: "unknown overlay design" };
  const game = String(b.game || "").toLowerCase();
  if (!OV_GAMES.includes(game)) return { error: "unknown game" };
  const ovs = [...new Set((Array.isArray(b.ovs) ? b.ovs : []).map((x) => String(x).toLowerCase()).filter((x) => OV_RE.test(x)))].slice(0, OV_MAX);
  if (!ovs.length) return { error: "no overlay was open" };
  const sid = String(b.sid == null ? "" : b.sid).replace(/[^A-Za-z0-9._:-]/g, "").slice(0, 80);
  return { style, game, ovs, sid };
}
__name(cleanOvRace, "cleanOvRace");
var shouldAskOv = /* @__PURE__ */ __name((answered, races) => answered ? races >= OV_AGAIN : races >= OV_FIRST, "shouldAskOv");
var shouldAsk = /* @__PURE__ */ __name((used, races) => used >= ASK_USED || races >= ASK_RACES, "shouldAsk");
function analyticsOf(days, perDay, rows, presence, accounts2) {
  const byDev = /* @__PURE__ */ new Map(), byKey = /* @__PURE__ */ new Map(), byGame = /* @__PURE__ */ new Map(), byUser = /* @__PURE__ */ new Map();
  const add = /* @__PURE__ */ __name((m, k, acc, n) => {
    let x = m.get(k);
    if (!x) m.set(k, x = { n: 0, users: /* @__PURE__ */ new Set() });
    x.n += n;
    x.users.add(acc);
  }, "add");
  for (const r2 of rows) {
    if (!gameKeyOk(r2.key)) continue;
    add(byDev, r2.device, r2.account_id, r2.n);
    if (r2.key.startsWith("game:")) add(byGame, r2.key.slice(5), r2.account_id, r2.n);
    else add(byKey, r2.key, r2.account_id, r2.n);
    let u = byUser.get(r2.account_id);
    if (!u) byUser.set(r2.account_id, u = { n: 0, devices: /* @__PURE__ */ new Set(), keys: /* @__PURE__ */ new Map(), last: "" });
    u.n += r2.n;
    u.devices.add(r2.device);
    u.keys.set(r2.key, (u.keys.get(r2.key) || 0) + r2.n);
    if (r2.last > u.last) u.last = r2.last;
  }
  const seen2 = /* @__PURE__ */ new Map(), versions = /* @__PURE__ */ new Map();
  for (const p of presence) {
    if (!seen2.has(p.account_id) || p.last_seen > seen2.get(p.account_id)) seen2.set(p.account_id, p.last_seen);
    if (p.app_version) {
      const k = p.kind + "|" + p.app_version;
      versions.set(k, (versions.get(k) || 0) + 1);
    }
  }
  const list = /* @__PURE__ */ __name((m, name2) => [...m].map(([k, x]) => ({ [name2]: k, users: x.users.size, n: x.n })).sort((a, b) => b.n - a.n), "list");
  return {
    days,
    active: perDay.map((x) => ({ day: x.day, users: x.users })),
    byDevice: list(byDev, "device"),
    top: list(byKey, "key").slice(0, 60),
    games: list(byGame, "game"),
    versions: [...versions].map(([k, n]) => ({ device: k.split("|")[0], v: k.split("|")[1], devices: n })).sort((a, b) => b.devices - a.devices),
    users: [...byUser].map(([id2, u]) => ({
      id: id2,
      nick: (accounts2.get(id2) || {}).display || "",
      lastSeen: seen2.get(id2) || (u.last ? Date.parse(u.last + "T12:00:00Z") : 0),
      lastDay: u.last,
      devices: [...u.devices],
      n: u.n,
      top: [...u.keys].map(([key, n]) => ({ key, n })).sort((a, b) => b.n - a.n).slice(0, 6)
    })).sort((a, b) => b.lastSeen - a.lastSeen).slice(0, 300)
  };
}
__name(analyticsOf, "analyticsOf");
var SQL_USAGE_ADD = "INSERT INTO usage_days (day, account_id, device, key, n) VALUES (?1,?2,?3,?4,?5) ON CONFLICT(day, account_id, device, key) DO UPDATE SET n=MIN(usage_days.n+excluded.n, 100000)";
var SQL_ASK_USED = "INSERT INTO feedback_ask (account_id, shown, used) VALUES (?1,?2,?3) ON CONFLICT(account_id) DO UPDATE SET used=feedback_ask.used+excluded.used";
var SQL_ASK_SEEN = "INSERT INTO feedback_ask (account_id, shown, used) VALUES (?1,?2,0) ON CONFLICT(account_id) DO UPDATE SET shown=excluded.shown, used=0";
var SQL_RACES_SINCE = "SELECT COUNT(*) AS n FROM sessions WHERE uploader=?1 AND started>?2 AND lower(COALESCE(kind,'')) LIKE '%race%'";
var SQL_OV_RACE = "INSERT INTO feedback_ask (account_id, shown, used, ov_races, ov_last_style, ov_last_sid) VALUES (?1,?2,0,1,?3,?4) ON CONFLICT(account_id) DO UPDATE SET ov_races=MIN(feedback_ask.ov_races+(CASE WHEN COALESCE(feedback_ask.ov_last_sid,'')=excluded.ov_last_sid THEN 0 ELSE 1 END), 1000), ov_last_style=excluded.ov_last_style, ov_last_sid=excluded.ov_last_sid";
var SQL_OV_SEEN = "UPDATE feedback_ask SET ov_races=0 WHERE account_id=?1";
var SQL_OV_ANSWERED = "INSERT INTO feedback_ask (account_id, shown, used, ov_races, ov_answered) VALUES (?1,?2,0,0,1) ON CONFLICT(account_id) DO UPDATE SET ov_races=0, ov_answered=1";

// src/usage.js
var json11 = /* @__PURE__ */ __name((o, s = 200) => new Response(JSON.stringify(o), { status: s, headers: { "content-type": "application/json", "cache-control": "no-store" } }), "json");
var err7 = /* @__PURE__ */ __name((m, s) => json11({ error: m }, s), "err");
async function usageRoute(req, env, url) {
  const p = url.pathname, m = req.method;
  const ours = ["/community/usage", "/community/feedback", "/community/feedback/ask", "/community/feedback/seen", "/community/feedback/ovrace", "/community/admin/analytics", "/community/admin/feedback"];
  if (!ours.includes(p)) return null;
  const acc = await sessionAccount(req, env);
  if (!acc) return err7("sign in with your Pitlane HQ account", 401);
  const now = Date.now();
  if (p === "/community/usage" && m === "POST") {
    const u = cleanUsage(await req.json().catch(() => null));
    if (u.error) return err7(u.error, 400);
    const d = day2(now), st = [];
    for (const [k, n] of u.counts)
      st.push(env.DB.prepare(SQL_USAGE_ADD).bind(d, acc.id, u.device, k, n));
    if (u.ms) st.push(env.DB.prepare(SQL_ASK_USED).bind(acc.id, now, u.ms));
    if (st.length) await env.DB.batch(st);
    return json11({ ok: true, kept: u.counts.length });
  }
  if (p === "/community/feedback/ask" && m === "GET") {
    const r2 = await env.DB.prepare("SELECT shown, used, ov_races, ov_answered, ov_last_style FROM feedback_ask WHERE account_id=?1").bind(acc.id).first();
    if (!r2) {
      await env.DB.prepare("INSERT OR IGNORE INTO feedback_ask (account_id, shown, used) VALUES (?1,?2,0)").bind(acc.id, now).run();
      return json11({ ask: false, ov: false });
    }
    let races = 0;
    if (r2.used < ASK_USED) {
      const c = await env.DB.prepare(SQL_RACES_SINCE).bind("acct:" + acc.id, r2.shown).first();
      races = c && c.n || 0;
    }
    return json11({ ask: shouldAsk(r2.used, races), used: r2.used, races, ov: shouldAskOv(!!r2.ov_answered, r2.ov_races || 0), ovRaces: r2.ov_races || 0, ovStyle: r2.ov_last_style || "classic" });
  }
  if (p === "/community/feedback/seen" && m === "POST") {
    const b = await req.json().catch(() => null);
    if (b && b.kind === "overlays") await env.DB.prepare(SQL_OV_SEEN).bind(acc.id).run();
    else await env.DB.prepare(SQL_ASK_SEEN).bind(acc.id, now).run();
    return json11({ ok: true });
  }
  if (p === "/community/feedback/ovrace" && m === "POST") {
    const o = cleanOvRace(await req.json().catch(() => null));
    if (o.error) return err7(o.error, 400);
    await env.DB.prepare(SQL_OV_RACE).bind(acc.id, now, o.style, o.sid || crypto.randomUUID()).run();
    return json11({ ok: true });
  }
  if (p === "/community/feedback" && m === "POST") {
    const b = await req.json().catch(() => null), f = cleanFeedback(b);
    if (f.error) return err7(f.error, 400);
    const c = await env.DB.prepare("SELECT COUNT(*) AS n FROM feedback WHERE account_id=?1 AND created>?2").bind(acc.id, now - 864e5).first();
    if (c && c.n >= FEEDBACK_PER_DAY) return err7("thank you, that is enough for today", 429);
    const id2 = crypto.randomUUID();
    await env.DB.batch([
      env.DB.prepare("INSERT INTO feedback (id, account_id, created, device, v, rating, text, view, kind, style) VALUES (?1,?2,?3,?4,?5,?6,?7,?8,?9,?10)").bind(id2, acc.id, now, f.device, f.v, f.rating, f.text, f.view, f.kind, f.style),
      f.kind === "overlays" ? env.DB.prepare(SQL_OV_ANSWERED).bind(acc.id, now) : env.DB.prepare(SQL_ASK_SEEN).bind(acc.id, now),
      // and it is a message of the driver's support chat (support.js), so they see it there
      ...driverMessage(env, acc.id, id2, now, { ...f, lang: cleanLang(b && b.lang) })
    ]);
    const esc5 = await openEscrow(env, acc.escrow).catch(() => null);
    const mailed = await sendFeedback(env, { ...f, nick: acc.display || "", accountId: acc.id, email: esc5 && esc5.email || "" }).catch(() => false);
    return json11({ ok: true, id: id2, mailed });
  }
  if (!isAdmin(env, acc.id)) return err7("only the admins of this server can do this", 403);
  if (p === "/community/admin/feedback" && m === "GET") {
    const r2 = await env.DB.prepare("SELECT f.id, f.account_id AS accountId, f.created, f.device, f.v, f.rating, f.text, f.view, f.kind, f.style, a.display AS nick FROM feedback f LEFT JOIN accounts a ON a.id=f.account_id ORDER BY f.created DESC LIMIT 300").all();
    const items = r2.results || [];
    const rated = items.filter((x) => x.rating);
    return json11({ items, count: items.length, avg: rated.length ? Math.round(rated.reduce((s, x) => s + x.rating, 0) / rated.length * 10) / 10 : null });
  }
  if (p === "/community/admin/analytics" && m === "GET") {
    const days = Math.max(1, Math.min(MAX_DAYS, Math.floor(Number(url.searchParams.get("days")) || 30)));
    const from = day2(now - (days - 1) * 864e5);
    const [perDay, rows, pres] = await Promise.all([
      env.DB.prepare("SELECT day, COUNT(DISTINCT account_id) AS users FROM usage_days WHERE day>=?1 GROUP BY day ORDER BY day").bind(from).all(),
      env.DB.prepare("SELECT account_id, device, key, SUM(n) AS n, MAX(day) AS last FROM usage_days WHERE day>=?1 GROUP BY account_id, device, key LIMIT 20000").bind(from).all(),
      env.DB.prepare("SELECT account_id, kind, app_version, last_seen FROM presence WHERE last_seen>?1 LIMIT 5000").bind(now - 7 * 864e5).all()
    ]);
    const R = rows.results || [], ids = [...new Set(R.map((x) => x.account_id))].slice(0, 300), accounts2 = /* @__PURE__ */ new Map();
    for (let i = 0; i < ids.length; i += 90) {
      const part = ids.slice(i, i + 90);
      const a = await env.DB.prepare(`SELECT id, display FROM accounts WHERE id IN (${part.map((_, j) => "?" + (j + 1)).join(",")})`).bind(...part).all();
      for (const x of a.results || []) accounts2.set(x.id, x);
    }
    return json11(analyticsOf(days, perDay.results || [], R, pres.results || [], accounts2));
  }
  return err7("not found", 404);
}
__name(usageRoute, "usageRoute");
async function pruneUsage(env) {
  await env.DB.prepare("DELETE FROM usage_days WHERE day < ?1").bind(day2(Date.now() - 400 * 864e5)).run();
}
__name(pruneUsage, "pruneUsage");

// src/support.js
var supportRoute = /* @__PURE__ */ __name((req, env, url) => handleSupport(req, env, url, { sessionAccount, isAdmin, openEscrow, sendSupportChat, sendSupportReply }), "supportRoute");

// src/reportslib.js
var APPS = ["pc", "web", "android", "ios"];
var STACK_MAX = 8e3;
var MSG_MAX = 500;
var LOG_MAX = 512 * 1024;
var LOGS_PER_DAY = 3;
var CRASH_DAYS = 30;
var USAGE_DAYS = 30;
var clean = /* @__PURE__ */ __name((v, max) => String(v == null ? "" : v).replace(/[\u0000-\u0008\u000b\u000c\u000e-\u001f]/g, "").slice(0, max), "clean");
var cleanV3 = /* @__PURE__ */ __name((v) => String(v == null ? "" : v).replace(/[^0-9a-zA-Z.+-]/g, "").slice(0, 24), "cleanV");
function crashSig(app, where, msg, stack) {
  const norm = /* @__PURE__ */ __name((s2) => String(s2 || "").replace(/0x[0-9a-f]+/gi, "0x").replace(/\d+/g, "0"), "norm");
  const frames = String(stack || "").split("\n").map((l) => l.trim()).filter((l) => l && !/^goroutine |^\s*$/.test(l)).slice(0, 6).map(norm).join("|");
  const s = [app, norm(where), norm(String(msg || "").split("\n")[0]), frames].join("~");
  let h = 2166136261;
  for (let i = 0; i < s.length; i++) {
    h ^= s.charCodeAt(i);
    h = Math.imul(h, 16777619) >>> 0;
  }
  return app + "-" + h.toString(36);
}
__name(crashSig, "crashSig");
function cleanCrash(b) {
  if (!b || typeof b !== "object") return { error: "missing body" };
  const app = String(b.app || "").toLowerCase();
  if (!APPS.includes(app)) return { error: "unknown app" };
  const msg = clean(b.msg, MSG_MAX).trim();
  if (!msg) return { error: "missing msg" };
  const where = clean(b.where, 80).trim(), stack = clean(b.stack, STACK_MAX);
  return { app, v: cleanV3(b.v), os: clean(b.os, 60), where, msg, stack, sig: crashSig(app, where, msg, stack) };
}
__name(cleanCrash, "cleanCrash");
var SQL_CRASH_ADD = `INSERT INTO crash_reports (sig, app, v, os, at_where, msg, stack, first, last, n, last_account) VALUES (?1,?2,?3,?4,?5,?6,?7,?8,?8,1,?9)
  ON CONFLICT(sig) DO UPDATE SET n=crash_reports.n+1, last=excluded.last, v=excluded.v, os=excluded.os, msg=excluded.msg, stack=excluded.stack, last_account=COALESCE(excluded.last_account, crash_reports.last_account)`;
var SQL_CRASHES = "SELECT c.sig, c.app, c.v, c.os, c.at_where, c.msg, c.stack, c.first, c.last, c.n, c.last_account, a.display AS nick FROM crash_reports c LEFT JOIN accounts a ON a.id=c.last_account WHERE c.last>?1 ORDER BY c.last DESC LIMIT 200";
var SQL_CRASH_DEL = "DELETE FROM crash_reports WHERE sig=?1";
var SQL_CRASH_PRUNE = "DELETE FROM crash_reports WHERE last<?1";
var SQL_LOG_ADD = "INSERT INTO support_logs (id, account_id, created, device, v, bytes, text) VALUES (?1,?2,?3,?4,?5,?6,?7)";
var SQL_LOGS_SINCE = "SELECT COUNT(*) AS n FROM support_logs WHERE account_id=?1 AND created>?2";
var SQL_LOG_GET = "SELECT id, account_id, created, device, v, bytes, text FROM support_logs WHERE id=?1";
var SQL_LOG_PRUNE = "DELETE FROM support_logs WHERE created<?1";
var SQL_USAGE_ADD2 = `INSERT INTO d1_usage (day, route, reqs, rows_read, rows_written) VALUES (?1,?2,?3,?4,?5)
  ON CONFLICT(day, route) DO UPDATE SET reqs=d1_usage.reqs+excluded.reqs, rows_read=d1_usage.rows_read+excluded.rows_read, rows_written=d1_usage.rows_written+excluded.rows_written`;
var SQL_USAGE_DAYS = "SELECT day, route, reqs, rows_read, rows_written FROM d1_usage WHERE day>=?1 ORDER BY day";
var SQL_USAGE_PRUNE = "DELETE FROM d1_usage WHERE day<?1";
var day3 = /* @__PURE__ */ __name((t) => new Date(t).toISOString().slice(0, 10), "day");
function usageOf(rows) {
  const by = /* @__PURE__ */ new Map(), days = /* @__PURE__ */ new Map();
  for (const r2 of rows) {
    const x = by.get(r2.route) || { route: r2.route, reqs: 0, read: 0, written: 0, days: {} };
    x.reqs += r2.reqs;
    x.read += r2.rows_read;
    x.written += r2.rows_written;
    x.days[r2.day] = r2.rows_read;
    by.set(r2.route, x);
    const d = days.get(r2.day) || { day: r2.day, reqs: 0, read: 0, written: 0 };
    d.reqs += r2.reqs;
    d.read += r2.rows_read;
    d.written += r2.rows_written;
    days.set(r2.day, d);
  }
  return { routes: [...by.values()].sort((a, b) => b.read - a.read), days: [...days.values()].sort((a, b) => a.day < b.day ? -1 : 1) };
}
__name(usageOf, "usageOf");
function routeKey(method, path) {
  const segs = String(path || "/").split("/").map((s) => /\d/.test(s) || s.length > 24 || /^[A-Za-z0-9_-]{16,}$/.test(s) ? ":x" : s);
  return (method || "GET") + " " + (segs.join("/").slice(0, 80) || "/");
}
__name(routeKey, "routeKey");
var json12 = /* @__PURE__ */ __name((o, s = 200) => new Response(JSON.stringify(o), { status: s, headers: { "content-type": "application/json", "cache-control": "no-store" } }), "json");
var err8 = /* @__PURE__ */ __name((m, s) => json12({ error: m }, s), "err");
async function handleReports(req, env, url, { sessionAccount: sessionAccount2, isAdmin: isAdmin2 }) {
  const p = url.pathname, m = req.method, now = Date.now();
  if (p === "/community/crash" && m === "POST") {
    const raw = await req.text().catch(() => "");
    if (raw.length > STACK_MAX * 2) return err8("too big", 413);
    let b = null;
    try {
      b = JSON.parse(raw);
    } catch (e) {
    }
    const c = cleanCrash(b);
    if (c.error) return err8(c.error, 400);
    const acc2 = await sessionAccount2(req, env).catch(() => null);
    await env.DB.prepare(SQL_CRASH_ADD).bind(c.sig, c.app, c.v, c.os, c.where, c.msg, c.stack, now, acc2 ? acc2.id : null).run();
    return json12({ ok: true });
  }
  const ours = p === "/community/support/logs" || p === "/community/admin/crashes" || p.startsWith("/community/admin/crashes/") || p.startsWith("/community/admin/support/logs/") || p === "/community/admin/d1";
  if (!ours) return null;
  const acc = await sessionAccount2(req, env);
  if (!acc) return err8("sign in with your Pitlane HQ account", 401);
  if (p === "/community/support/logs" && m === "POST") {
    const b = await req.json().catch(() => null) || {};
    const text2 = clean(b.text, LOG_MAX + 1).replace(/\r\n?/g, "\n");
    if (!text2.trim()) return err8("the log is empty", 400);
    if (text2.length > LOG_MAX) return err8("the log is too big", 413);
    const c = await env.DB.prepare(SQL_LOGS_SINCE).bind(acc.id, now - 864e5).first();
    if (c && c.n >= LOGS_PER_DAY) return err8("that is enough for today, we answer soon", 429);
    const id2 = crypto.randomUUID(), mid = crypto.randomUUID(), device = APPS.includes(String(b.device)) ? String(b.device) : "", v = cleanV3(b.v);
    const kb = Math.max(1, Math.round(text2.length / 1024));
    const line = "Logs sent, " + kb + " KB";
    await env.DB.batch([
      env.DB.prepare(SQL_LOG_ADD).bind(id2, acc.id, now, device, v, text2.length, text2),
      ...driverMessage(env, acc.id, mid, now, { text: line, device, v, view: "log:" + id2, kind: "logs" })
    ]);
    return json12({ ok: true, msg: { id: mid, me: true, text: line, created: now, kind: "logs" } });
  }
  if (!isAdmin2(env, acc.id)) return err8("only the admins of this server can do this", 403);
  const days = Math.min(90, Math.max(1, parseInt(url.searchParams.get("days") || "7", 10) || 7));
  if (p === "/community/admin/crashes" && m === "GET") {
    const r2 = await env.DB.prepare(SQL_CRASHES).bind(now - days * 864e5).all();
    return json12({ items: (r2.results || []).map((x) => ({ sig: x.sig, app: x.app, v: x.v, os: x.os, where: x.at_where, msg: x.msg, stack: x.stack, first: x.first, last: x.last, n: x.n, nick: x.nick || "" })) });
  }
  if (p.startsWith("/community/admin/crashes/") && m === "DELETE") {
    await env.DB.prepare(SQL_CRASH_DEL).bind(decodeURIComponent(p.slice(25))).run();
    return json12({ ok: true });
  }
  if (p.startsWith("/community/admin/support/logs/") && m === "GET") {
    const r2 = await env.DB.prepare(SQL_LOG_GET).bind(decodeURIComponent(p.slice(30))).first();
    if (!r2) return err8("not found", 404);
    return json12({ id: r2.id, accountId: r2.account_id, created: r2.created, device: r2.device || "", v: r2.v || "", bytes: r2.bytes, text: r2.text });
  }
  if (p === "/community/admin/d1" && m === "GET") {
    const r2 = await env.DB.prepare(SQL_USAGE_DAYS).bind(day3(now - (days - 1) * 864e5)).all();
    return json12(usageOf(r2.results || []));
  }
  return err8("not found", 404);
}
__name(handleReports, "handleReports");
var pruneReports = /* @__PURE__ */ __name((env, now = Date.now()) => env.DB.batch([
  env.DB.prepare(SQL_CRASH_PRUNE).bind(now - CRASH_DAYS * 864e5),
  env.DB.prepare(SQL_LOG_PRUNE).bind(now - CRASH_DAYS * 864e5),
  env.DB.prepare(SQL_USAGE_PRUNE).bind(day3(now - USAGE_DAYS * 864e5))
]), "pruneReports");
var TALLY = /* @__PURE__ */ new Map();
var lastFlush = Date.now();
function countingDB(db, route) {
  const add = /* @__PURE__ */ __name((meta) => {
    const t = TALLY.get(route) || { reqs: 0, read: 0, written: 0 };
    if (meta) {
      t.read += meta.rows_read || 0;
      t.written += meta.rows_written || 0;
    }
    TALLY.set(route, t);
  }, "add");
  add(null);
  TALLY.get(route).reqs++;
  const RAW = /* @__PURE__ */ Symbol.for("pitlane.raw");
  const wrap = /* @__PURE__ */ __name((s) => new Proxy(s, {
    get(o, k) {
      if (k === RAW) return o;
      if (k === "bind") return (...a) => wrap(o.bind(...a));
      if (k === "all" || k === "run") return async (...a) => {
        const r2 = await o[k](...a);
        add(r2 && r2.meta);
        return r2;
      };
      if (k === "first") return async (col) => {
        const r2 = await o.all();
        add(r2 && r2.meta);
        const row = r2 && r2.results && r2.results[0] || null;
        return col == null ? row : row ? row[col] ?? null : null;
      };
      const v = o[k];
      return typeof v === "function" ? v.bind(o) : v;
    }
  }), "wrap");
  return new Proxy(db, {
    get(o, k) {
      if (k === "prepare") return (sql) => wrap(o.prepare(sql));
      if (k === "batch") return async (qs) => {
        const out = await o.batch(qs.map((q2) => q2 && q2[RAW] || q2));
        for (const r2 of out || []) add(r2 && r2.meta);
        return out;
      };
      const v = o[k];
      return typeof v === "function" ? v.bind(o) : v;
    }
  });
}
__name(countingDB, "countingDB");
async function flushUsage(db, force = false, now = Date.now()) {
  if (!TALLY.size || !force && now - lastFlush < 6e4) return;
  lastFlush = now;
  const d = day3(now), rows = [...TALLY.entries()];
  TALLY.clear();
  await db.batch(rows.map(([route, t]) => db.prepare(SQL_USAGE_ADD2).bind(d, route, t.reqs, t.read, t.written))).catch(() => {
  });
}
__name(flushUsage, "flushUsage");

// src/reports.js
var reportsRoute = /* @__PURE__ */ __name((req, env, url) => handleReports(req, env, url, { sessionAccount, isAdmin }), "reportsRoute");

// src/worker.js
var JSONH8 = { "content-type": "application/json; charset=utf-8", "cache-control": "no-store" };
var json13 = /* @__PURE__ */ __name((v, status = 200) => new Response(JSON.stringify(v), { status, headers: JSONH8 }), "json");
var err9 = /* @__PURE__ */ __name((msg, status) => json13({ error: msg }, status), "err");
function same4(a, b) {
  if (typeof a !== "string" || typeof b !== "string" || !a || a.length !== b.length) return false;
  let d = 0;
  for (let i = 0; i < a.length; i++) d |= a.charCodeAt(i) ^ b.charCodeAt(i);
  return d === 0;
}
__name(same4, "same");
async function sha2563(t) {
  const b = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(t));
  return [...new Uint8Array(b)].map((x) => x.toString(16).padStart(2, "0")).join("");
}
__name(sha2563, "sha256");
async function who(req, env) {
  const h = req.headers.get("authorization") || "";
  const key = h.startsWith("Bearer ") ? h.slice(7).trim() : "";
  if (!key) return null;
  const acc = await sessionAccount(req, env).catch(() => null);
  if (acc) return { role: "account", name: "acct:" + acc.id, display: acc.display };
  if (env.PITLANE_KEY && same4(key, env.PITLANE_KEY)) return { role: "owner", name: "owner" };
  if (env.VIEW_KEY && same4(key, env.VIEW_KEY)) return { role: "viewer", name: "viewer" };
  const m = await env.DB.prepare("SELECT name FROM members WHERE key_hash=?1").bind(await sha2563(key)).first().catch(() => null);
  return m ? { role: "member", name: m.name } : null;
}
__name(who, "who");
var str4 = /* @__PURE__ */ __name((v, max = 120) => typeof v === "string" ? v.slice(0, max) : v == null ? null : String(v).slice(0, max), "str");
var num3 = /* @__PURE__ */ __name((v) => typeof v === "number" && isFinite(v) ? v : null, "num");
var idOk = /* @__PURE__ */ __name((v) => typeof v === "string" && /^[A-Za-z0-9_.:-]{6,80}$/.test(v), "idOk");
var posInt = /* @__PURE__ */ __name((v) => Number.isInteger(v) && v > 0 && v < 1e9 ? v : null, "posInt");
var offlineAI = /* @__PURE__ */ __name((s) => gameOf(s.game) === "iracing" && /(^|:)t-/.test(String(s.id || "")) && !/test/i.test(String(s.kind || "")), "offlineAI");
async function upsertSession(env, s, uploader) {
  if (!idOk(s.id) || !num3(s.started) || !s.track || !s.car) return "session needs id, started, track and car";
  await env.DB.prepare(
    `INSERT INTO sessions (id, started, track, track_config, car, kind, series, driver, air_temp, track_temp, uploader, game, track_id, car_id, official, lic, cat, ai, pos, field, pos_cls)
     VALUES (?1,?2,?3,?4,?5,?6,?7,?8,?9,?10,?11,?12,?13,?14,?15,?16,?17,?18,?19,?20,?21)
     ON CONFLICT(id) DO UPDATE SET kind=excluded.kind, air_temp=excluded.air_temp, track_temp=excluded.track_temp, track_id=COALESCE(excluded.track_id, track_id), car_id=COALESCE(excluded.car_id, car_id), official=COALESCE(excluded.official, official), ai=COALESCE(excluded.ai, ai),
       lic=COALESCE(excluded.lic, lic), cat=COALESCE(excluded.cat, cat),
       pos=COALESCE(excluded.pos, pos), field=CASE WHEN excluded.pos IS NULL THEN field ELSE excluded.field END, pos_cls=CASE WHEN excluded.pos IS NULL THEN pos_cls ELSE excluded.pos_cls END`
  ).bind(s.id, Math.round(s.started), str4(s.track), str4(s.trackConfig), str4(s.car), str4(s.kind, 40), str4(s.series), str4(s.driver, 80), num3(s.airTemp), num3(s.trackTemp), uploader, gameOf(s.game), posInt(s.trackId), posInt(s.carId), typeof s.official === "boolean" ? s.official ? 1 : 0 : null, licOf(s.lic), str4(s.cat, 20), s.ai === true || offlineAI(s) ? 1 : null, ...placeOf(s)).run();
  return null;
}
__name(upsertSession, "upsertSession");
function placeOf(s) {
  const pos = Number.isInteger(s.pos) && s.pos > 0 && s.pos < 1e3 ? s.pos : null;
  if (!pos) return [null, null, null];
  const field = Number.isInteger(s.field) && s.field >= pos && s.field < 1e3 ? s.field : pos;
  return [pos, field, s.cls === true ? 1 : 0];
}
__name(placeOf, "placeOf");
var placeOut = /* @__PURE__ */ __name(({ pos_cls, ...x }) => ({ ...x, pos: x.pos || null, field: x.field || null, cls: pos_cls === 1 }), "placeOut");
var lapDrv = /* @__PURE__ */ __name((l) => typeof l.drv === "string" && l.drv.trim() ? l.drv.trim().slice(0, 32) : null, "lapDrv");
async function dropImpossibleLaps(env, sid) {
  const r2 = await env.DB.batch([
    env.DB.prepare("UPDATE laps SET valid=0 WHERE session_id=?1 AND valid=1 AND COALESCE(sectors,'[]')='[]' AND EXISTS (SELECT 1 FROM laps WHERE session_id=?1 AND COALESCE(sectors,'[]')<>'[]')").bind(sid),
    env.DB.prepare(SESSION_SUMS).bind(sid)
  ]);
  return r2[0].meta.changes || 0;
}
__name(dropImpossibleLaps, "dropImpossibleLaps");
async function validityChanged(env, sid) {
  await env.DB.prepare(SESSION_SUMS).bind(sid).run().catch(() => {
  });
  const s = await env.DB.prepare("SELECT uploader FROM sessions WHERE id=?1").bind(sid).first().catch(() => null);
  if (s && String(s.uploader).startsWith("acct:")) await unshareInvalid(env, String(s.uploader).slice(5), sid).catch(() => {
  });
}
__name(validityChanged, "validityChanged");
async function addLap(env, sessionId, l) {
  if (!idOk(sessionId) || !idOk(l.id) || !num3(l.n) || !num3(l.time) || l.time <= 0 || l.time > 3600) return "lap needs id, n and time";
  const plain2 = l.trace ? JSON.stringify(l.trace) : null;
  if (plain2 && plain2.length > 9e5) return "lap trace too large";
  const trace = await sealData(env, plain2);
  const sectors = Array.isArray(l.sectors) ? JSON.stringify(l.sectors.filter((x) => typeof x === "number").slice(0, 40)) : null;
  await env.DB.batch([
    env.DB.prepare(
      `INSERT INTO laps (id, session_id, n, time, valid, fuel, vmax, sectors, trace, created, inc, drv) VALUES (?1,?2,?3,?4,?5,?6,?7,?8,?9,?10,?11,?12)
       ON CONFLICT(id) DO NOTHING`
    ).bind(l.id, sessionId, Math.round(l.n), l.time, l.valid === false ? 0 : 1, num3(l.fuel), num3(l.vmax), sectors, trace, Date.now(), Math.max(0, Math.round(num3(l.inc) || 0)), lapDrv(l)),
    env.DB.prepare(SESSION_SUMS).bind(sessionId)
  ]);
  return null;
}
__name(addLap, "addLap");
async function api(req, env, url, ctx) {
  const me2 = await who(req, env);
  if (!me2) return err9(env.PITLANE_KEY ? "wrong or missing key" : "sign in with your Pitlane HQ account (this server has no PITLANE_KEY)", 401);
  const role = me2.role;
  const p = url.pathname;
  const m = req.method;
  if (p === "/api/me") return json13({ role, name: me2.name, display: me2.display });
  const admins = (env.ADMINS || env.SEASON_UPLOADERS || "").split(",").map((x) => x.trim()).filter(Boolean);
  const admin = role === "account" && admins.includes(me2.name.replace(/^acct:/, ""));
  const own = role === "account" ? me2.name : null;
  const ownRead = admin ? null : own;
  if (p === "/api/upload" && m === "POST") {
    if (role === "viewer") return err9("this key can only read", 403);
    const body = await req.json().catch(() => null);
    if (!body || !body.session) return err9("bad upload", 400);
    if ((role === "member" || role === "account") && body.session.id) body.session.id = (me2.name.replace(/[^A-Za-z0-9_.-]/g, "_") + ":" + body.session.id).slice(0, 80);
    if (body.session.imported === true && Array.isArray(body.laps) && body.laps.length) {
      const st = Number(body.session.started) || 0;
      const have = await env.DB.prepare(
        `SELECT l.time FROM laps l JOIN sessions s ON s.id=l.session_id WHERE s.uploader=?1 AND s.track=?2 AND s.car=?3 AND s.started BETWEEN ?4 AND ?5`
      ).bind(me2.name, str4(body.session.track), str4(body.session.car), st - 12 * 36e5, st + 12 * 36e5).all().catch(() => ({ results: [] }));
      const times = (have.results || []).map((x) => x.time);
      body.laps = body.laps.filter((l) => !(l && num3(l.time) && times.some((t) => Math.abs(t - l.time) < 6e-4)));
      if (!body.laps.length) return json13({ ok: true, shared: false, duplicate: true });
    }
    let e = await upsertSession(env, body.session, me2.name);
    if (!e && posInt(body.session.trackId) && posInt(body.session.carId)) await reconcileIds(env, gameOf(body.session.game), str4(body.session.track), str4(body.session.trackConfig), str4(body.session.car), posInt(body.session.trackId), posInt(body.session.carId)).catch(() => {
    });
    if (!e && posInt(body.session.carId)) await noteCar(env, gameOf(body.session.game), posInt(body.session.carId), str4(body.session.car)).catch(() => {
    });
    if (role === "member" || role === "account") body.laps = (body.laps || []).map((l) => ({ ...l, id: (me2.name.replace(/[^A-Za-z0-9_.-]/g, "_") + ":" + l.id).slice(0, 80) }));
    if (e) return err9(e, 400);
    for (const l of (body.laps || []).slice(0, 50)) {
      e = await addLap(env, body.session.id, l);
      if (e) return err9(e, 400);
    }
    const dropped = await dropImpossibleLaps(env, body.session.id).catch(() => 0);
    if (dropped && role === "account") await unshareInvalid(env, me2.name.slice(5), body.session.id).catch(() => {
    });
    if ((body.laps || []).some((l) => l.valid !== false && l.trace)) await markModel(env, gameOf(body.session.game), posInt(body.session.trackId), posInt(body.session.carId));
    let shared = null;
    const imported = body.session.imported === true;
    if (role === "account") shared = await autoShare(env, me2.name.slice(5), body.session.id, body.laps, { trackId: body.session.trackId, carId: body.session.carId, lic: body.session.lic, cat: body.session.cat, imported }, imported ? null : ctx).catch(() => null);
    return json13({ ok: true, shared: !!(shared && shared.shared) });
  }
  if (p === "/api/sessions/summary" && m === "GET") {
    const q2 = url.searchParams;
    return json13(await sessionSummary(env.DB, { from: q2.get("from"), tz: q2.get("tz"), game: q2.get("game") ? gameOf(q2.get("game")) : null, uploader: own || q2.get("who") || null }));
  }
  if (p === "/api/sessions-owned" && m === "GET") {
    if (!own) return json13({ tracks: [], cars: [] });
    const { results } = await env.DB.prepare(
      "SELECT DISTINCT track, track_config, car FROM sessions WHERE uploader=?1 AND COALESCE(game,'iracing')='iracing' AND LOWER(COALESCE(kind,'')) NOT LIKE '%test%' LIMIT 2000"
    ).bind(own).all();
    const tracks2 = /* @__PURE__ */ new Map(), cars = /* @__PURE__ */ new Set();
    for (const r2 of results || []) {
      const cfg = /^TrackCity:/i.test(r2.track_config || "") ? "" : r2.track_config || "";
      if (r2.track) tracks2.set(r2.track + "\0" + cfg, [r2.track, cfg]);
      if (r2.car) cars.add(r2.car);
    }
    return json13({ tracks: [...tracks2.values()], cars: [...cars] });
  }
  if (p === "/api/sessions" && m === "GET") {
    const q2 = url.searchParams;
    const lim = Math.min(200, +q2.get("limit") || 60);
    let sql = "SELECT * FROM sessions";
    const args = [];
    if (q2.get("track")) {
      args.push(q2.get("track"));
      sql += ` WHERE track=?${args.length}`;
    }
    if (q2.get("car")) {
      args.push(q2.get("car"));
      sql += `${args.length > 1 ? " AND" : " WHERE"} car=?${args.length}`;
    }
    if (q2.get("game")) {
      args.push(gameOf(q2.get("game")));
      sql += `${args.length > 1 ? " AND" : " WHERE"} game=?${args.length}`;
    }
    if (own || q2.get("who")) {
      args.push(own || q2.get("who"));
      sql += `${args.length > 1 ? " AND" : " WHERE"} uploader=?${args.length}`;
    }
    sql += ` ORDER BY started DESC LIMIT ${lim}`;
    const { results } = await env.DB.prepare(sql).bind(...args).all();
    const cm = await catMap(env).catch(() => ({ tc: {}, c: {} }));
    let lics = {};
    if (own && own.startsWith("acct:")) {
      const u = await env.DB.prepare("SELECT lics FROM community_users WHERE id=?1").bind(own.slice(5)).first().catch(() => null);
      try {
        lics = JSON.parse(u && u.lics || "{}") || {};
      } catch (e) {
      }
    }
    return json13((results || []).map(placeOut).map(({ cat, lic, ...x }) => {
      const ir = (x.game || "iracing") === "iracing";
      const c = ir ? catOf(cm, x.track_id, x.car_id, cat, x.track + (x.track_config ? " \xB7 " + x.track_config : ""), x.car) : "sports_car";
      return { ...x, cat: c, lic: lic || ir && c && lics[c] || null };
    }));
  }
  if (p === "/api/bests" && m === "GET") {
    const { results } = await env.DB.prepare(
      `SELECT s.game, s.track, s.track_config, s.car, COALESCE(s.uploader,'owner') AS who, MAX(s.driver) AS driver, MIN(l.time) AS best, COUNT(l.id) AS laps, MAX(s.started) AS last,
        (SELECT l2.id FROM laps l2 JOIN sessions s2 ON s2.id=l2.session_id
         WHERE l2.valid=1 AND l2.drv IS NULL AND s2.game=s.game AND s2.track=s.track AND COALESCE(s2.track_config,'')=COALESCE(s.track_config,'')
           AND s2.car=s.car AND COALESCE(s2.uploader,'')=COALESCE(s.uploader,'') AND (?1 IS NULL OR s2.uploader=?1)
         ORDER BY l2.time LIMIT 1) AS bestLapId,
        (SELECT s2.id FROM laps l2 JOIN sessions s2 ON s2.id=l2.session_id
         WHERE l2.valid=1 AND l2.drv IS NULL AND s2.game=s.game AND s2.track=s.track AND COALESCE(s2.track_config,'')=COALESCE(s.track_config,'')
           AND s2.car=s.car AND COALESCE(s2.uploader,'')=COALESCE(s.uploader,'') AND (?1 IS NULL OR s2.uploader=?1)
         ORDER BY l2.time LIMIT 1) AS bestSessionId
       FROM laps l JOIN sessions s ON s.id=l.session_id WHERE l.valid=1 AND l.drv IS NULL AND (?1 IS NULL OR s.uploader=?1)
       GROUP BY s.game, s.track, s.track_config, s.car, who ORDER BY last DESC LIMIT 600`
    ).bind(own).all();
    return json13(results);
  }
  let mm = p.match(/^\/api\/sessions\/([A-Za-z0-9_.:-]+)\/validate$/);
  if (mm && m === "POST") {
    const admins2 = (env.ADMINS || env.SEASON_UPLOADERS || "").split(",").map((x) => x.trim()).filter(Boolean);
    if (role !== "account" || !admins2.includes(me2.name.replace(/^acct:/, ""))) return err9("only the admins of this server can do this", 403);
    const sid = decodeURIComponent(mm[1]);
    const ls = (await env.DB.prepare("SELECT id, time, sectors, COALESCE(inc,0) AS inc FROM laps WHERE session_id=?1 AND time>0").bind(sid).all()).results || [];
    const secs = /* @__PURE__ */ __name((l) => {
      try {
        const x = JSON.parse(l.sectors || "null");
        return Array.isArray(x) && x.length >= 3 && x.every((v) => v > 0) ? x : null;
      } catch (e) {
        return null;
      }
    }, "secs");
    const med = /* @__PURE__ */ __name((a) => {
      const b = a.filter((x) => x > 0).sort((x, y) => x - y);
      return b.length ? b[Math.floor(b.length / 2)] : 0;
    }, "med");
    const whole = ls.filter((l) => secs(l));
    let mt = med(whole.map((l) => l.time)), ms = [0, 1, 2].map((k) => med(whole.map((l) => secs(l)[k])));
    const ss = await env.DB.prepare("SELECT track_id, car_id, COALESCE(game,'iracing') AS game FROM sessions WHERE id=?1").bind(sid).first().catch(() => null);
    const rec = ss && ss.track_id && ss.car_id ? await env.DB.prepare("SELECT MIN(time) AS t FROM community_laps WHERE track_id=?1 AND car_id=?2 AND game=?3").bind(ss.track_id, ss.car_id, ss.game).first().catch(() => null) : null;
    if (rec && rec.t > mt) {
      const k = rec.t / mt;
      mt = rec.t;
      ms = ms.map((x) => x * k);
    }
    const ok = ls.filter((l) => !l.inc && secs(l) && mt > 0 && l.time >= 0.85 * mt && secs(l).every((v, k) => v >= 0.5 * ms[k]));
    if (ok.length) await env.DB.batch(ok.map((l) => env.DB.prepare("UPDATE laps SET valid=1 WHERE id=?1").bind(l.id)));
    await validityChanged(env, sid);
    return json13({ ok: true, laps: ok.length });
  }
  mm = p.match(/^\/api\/sessions\/([A-Za-z0-9_.:-]+)\/driver$/);
  if (mm && m === "POST") {
    const sid = decodeURIComponent(mm[1]);
    const s = await env.DB.prepare("SELECT uploader FROM sessions WHERE id=?1").bind(sid).first();
    if (!s || role === "viewer" || own && s.uploader !== own) return err9("not found", 404);
    const b = await req.json().catch(() => ({}));
    const n = Math.round(num3(b.n) || 0);
    if (!n) return err9("which lap?", 400);
    await env.DB.batch([env.DB.prepare("UPDATE laps SET drv=?3 WHERE session_id=?1 AND n=?2").bind(sid, n, lapDrv(b)), env.DB.prepare(SESSION_SUMS).bind(sid)]);
    if (String(s.uploader).startsWith("acct:")) await reshareSession(env, String(s.uploader).slice(5), sid).catch(() => {
    });
    return json13({ ok: true });
  }
  mm = p.match(/^\/api\/sessions\/([A-Za-z0-9_.:-]+)\/incidents$/);
  if (mm && m === "POST") {
    const sid = decodeURIComponent(mm[1]);
    const s = await env.DB.prepare("SELECT uploader FROM sessions WHERE id=?1").bind(sid).first();
    if (!s || role === "viewer" || own && s.uploader !== own) return err9("not found", 404);
    const b = await req.json().catch(() => ({}));
    const laps = Array.isArray(b.laps) ? b.laps.slice(0, 200) : [];
    const stmts = [];
    const have = (await env.DB.prepare("SELECT n, trace FROM laps WHERE session_id=?1 AND COALESCE(inc,0)=0").bind(sid).all()).results || [];
    const byN = new Map(have.map((r2) => [r2.n, r2]));
    for (const l of laps) {
      const n = Math.round(num3(l.n) || 0), inc = Math.max(0, Math.round(num3(l.inc) || 0));
      const at2 = Array.isArray(l.at) ? l.at.filter((v) => typeof v === "number" && isFinite(v)).slice(0, 160) : [];
      if (!n || !byN.has(n)) continue;
      const ks = Array.isArray(l.k) ? l.k.filter((v) => ["off", "loss", "light", "contact"].includes(v)).slice(0, 80) : [];
      let trace = byN.get(n).trace;
      if (trace) {
        try {
          const t = JSON.parse(await openData(env, trace));
          t.inc = at2;
          t.incK = ks;
          trace = await sealData(env, JSON.stringify(t));
        } catch (e) {
        }
      }
      stmts.push(env.DB.prepare("UPDATE laps SET inc=?3, trace=?4 WHERE session_id=?1 AND n=?2 AND COALESCE(inc,0)=0").bind(sid, n, inc, trace));
    }
    if (stmts.length) await env.DB.batch(stmts);
    return json13({ ok: true, laps: stmts.length });
  }
  mm = p.match(/^\/api\/laps\/([A-Za-z0-9_.:-]+)\/valid$/);
  if (mm && m === "POST") {
    const admins2 = (env.ADMINS || env.SEASON_UPLOADERS || "").split(",").map((x) => x.trim()).filter(Boolean);
    if (role !== "account" || !admins2.includes(me2.name.replace(/^acct:/, ""))) return err9("only the admins of this server can do this", 403);
    const b = await req.json().catch(() => ({}));
    const lid = decodeURIComponent(mm[1]);
    const r2 = await env.DB.prepare("UPDATE laps SET valid=?2 WHERE id=?1").bind(lid, b.valid === false ? 0 : 1).run();
    const lr = await env.DB.prepare("SELECT session_id FROM laps WHERE id=?1").bind(lid).first();
    if (lr) await validityChanged(env, lr.session_id);
    return json13({ ok: true, changed: r2.meta ? r2.meta.changes : void 0, valid: b.valid !== false });
  }
  mm = p.match(/^\/api\/sessions\/([A-Za-z0-9_.:-]+)$/);
  if (mm) {
    if (m === "DELETE") {
      const own2 = await env.DB.prepare("SELECT uploader FROM sessions WHERE id=?1").bind(mm[1]).first();
      if (role === "viewer" || (role === "member" || role === "account") && (!own2 || own2.uploader !== me2.name)) return err9("you can only delete your own sessions", 403);
      await env.DB.batch([env.DB.prepare("DELETE FROM laps WHERE session_id=?1").bind(mm[1]), env.DB.prepare("DELETE FROM sessions WHERE id=?1").bind(mm[1])]);
      return json13({ ok: true });
    }
    const sid = decodeURIComponent(mm[1]);
    const s = await env.DB.prepare("SELECT * FROM sessions WHERE id=?1").bind(sid).first();
    if (!s || ownRead && s.uploader !== ownRead) return err9("not found", 404);
    const withTraces = url.searchParams.get("traces") === "1";
    const { results } = await env.DB.prepare(`SELECT id, n, time, valid, fuel, vmax, sectors, inc, drv${withTraces ? ", trace" : ""} FROM laps WHERE session_id=?1 ORDER BY n`).bind(sid).all();
    const laps = [];
    for (const l of results) laps.push({ ...l, sectors: l.sectors ? JSON.parse(l.sectors) : null, ...withTraces ? { trace: l.trace ? JSON.parse(await openData(env, l.trace)) : null } : {} });
    let who2;
    if (me2 && s.uploader !== me2.name && String(s.uploader || "").startsWith("acct:")) {
      const a = await env.DB.prepare("SELECT display FROM accounts WHERE id=?1").bind(String(s.uploader).slice(5)).first().catch(() => null);
      who2 = a && a.display || "";
    }
    return json13({ session: { ...placeOut(s), ...who2 !== void 0 ? { other: true, who: who2 } : {} }, laps });
  }
  if (p === "/api/teambest" && m === "GET") {
    const q2 = url.searchParams;
    const l = await env.DB.prepare(
      `SELECT l.id FROM laps l JOIN sessions s ON s.id=l.session_id WHERE l.valid=1 AND l.drv IS NULL AND l.trace IS NOT NULL AND s.track=?1 AND COALESCE(s.track_config,'')=?2 AND s.car=?3 AND (?4 IS NULL OR s.uploader=?4) AND s.game=?5 ORDER BY l.time LIMIT 1`
    ).bind(q2.get("track") || "", q2.get("config") || "", q2.get("car") || "", own, gameOf(q2.get("game"))).first();
    return json13(l || {});
  }
  if (p === "/api/team") {
    if (role === "account") return json13({ members: [], me: me2.display || me2.name, role });
    if (m === "GET") {
      const { results } = await env.DB.prepare("SELECT name, created FROM members ORDER BY name").all();
      return json13({ members: results, me: me2.name, role });
    }
    if (role !== "owner") return err9("only the owner manages the team", 403);
    if (m === "POST") {
      const b = await req.json().catch(() => ({}));
      const name2 = str4(b.name, 40);
      if (!name2 || !/^[\p{L}\p{N} _.'-]{2,40}$/u.test(name2) || name2 === "owner" || name2 === "viewer") return err9("choose a name of 2 to 40 letters", 400);
      const key = [...crypto.getRandomValues(new Uint8Array(24))].map((x) => x.toString(16).padStart(2, "0")).join("");
      try {
        await env.DB.prepare("INSERT INTO members (name, key_hash, created) VALUES (?1,?2,?3)").bind(name2, await sha2563(key), Date.now()).run();
      } catch (e) {
        return err9("that name is already in the team", 400);
      }
      return json13({ name: name2, key });
    }
  }
  mm = p.match(/^\/api\/team\/(.+)$/);
  if (mm && m === "DELETE") {
    if (role !== "owner") return err9("only the owner manages the team", 403);
    await env.DB.prepare("DELETE FROM members WHERE name=?1").bind(decodeURIComponent(mm[1])).run();
    return json13({ ok: true });
  }
  mm = p.match(/^\/api\/laps\/([A-Za-z0-9_.:-]+)\/valid$/);
  if (mm && m === "POST") {
    if (!admin) return err9("only the admins of this server can do this", 403);
    const b = await req.json().catch(() => ({}));
    const l = await env.DB.prepare("SELECT l.session_id, s.uploader FROM laps l JOIN sessions s ON s.id=l.session_id WHERE l.id=?1").bind(decodeURIComponent(mm[1])).first();
    if (!l) return err9("not found", 404);
    await env.DB.batch([env.DB.prepare("UPDATE laps SET valid=?2 WHERE id=?1").bind(decodeURIComponent(mm[1]), b.valid ? 1 : 0), env.DB.prepare(SESSION_SUMS).bind(l.session_id)]);
    if (String(l.uploader).startsWith("acct:")) {
      const uid = String(l.uploader).slice(5);
      if (b.valid) await reshareSession(env, uid, l.session_id).catch(() => {
      });
      else await unshareInvalid(env, uid, l.session_id).catch(() => {
      });
    }
    return json13({ ok: true });
  }
  mm = p.match(/^\/api\/laps\/([A-Za-z0-9_.:-]+)$/);
  if (mm && m === "GET") {
    const lid = decodeURIComponent(mm[1]);
    const l = await env.DB.prepare("SELECT l.*, s.track, s.car, s.started, s.driver, s.uploader FROM laps l JOIN sessions s ON s.id=l.session_id WHERE l.id=?1").bind(lid).first();
    if (!l || ownRead && l.uploader !== ownRead) return err9("not found", 404);
    return json13({ ...l, trace: l.trace ? JSON.parse(await openData(env, l.trace)) : null, sectors: l.sectors ? JSON.parse(l.sectors) : null });
  }
  return err9("not found", 404);
}
__name(api, "api");
function traceLapTime(t) {
  const d = t && Array.isArray(t.d) ? t.d : null;
  if (!d || d.length < 40) return null;
  const bin = num3(t.bin) || 5;
  let k = d.length - 1;
  while (k > 0 && d[k - 1] && d[k] && d[k - 1][5] === d[k][5]) k--;
  const p = d[k];
  if (!p || !(p[5] > 0) || !(p[0] > 1)) return null;
  return p[5] + (d.length - k) * bin / p[0];
}
__name(traceLapTime, "traceLapTime");
async function repairImpossibleShares(env) {
  const { results } = await env.DB.prepare(
    `SELECT DISTINCT c.user_id AS uid, l.session_id AS sid FROM laps l
       JOIN sessions s ON s.id=l.session_id AND s.uploader LIKE 'acct:%'
       JOIN community_laps c ON c.user_id=substr(s.uploader,6) AND abs(l.time-c.time)<0.0006
     WHERE l.valid=0 AND l.drv IS NULL
       AND NOT EXISTS (SELECT 1 FROM laps v WHERE v.session_id=l.session_id AND v.valid=1 AND v.drv IS NULL AND abs(v.time-l.time)<0.0006)
     LIMIT 5`
  ).all();
  for (const r2 of results || []) await unshareInvalid(env, r2.uid, r2.sid).catch(() => {
  });
}
__name(repairImpossibleShares, "repairImpossibleShares");
async function resharePending(env) {
  const row = await env.DB.prepare("SELECT v FROM app_state WHERE k='reshare'").first().catch(() => null);
  let ids = [];
  try {
    ids = JSON.parse(row && row.v || "[]");
  } catch (e) {
  }
  if (!ids.length) return;
  const now = ids.slice(0, 8), rest = ids.slice(8);
  for (const sid of now) {
    const s = await env.DB.prepare("SELECT uploader FROM sessions WHERE id=?1").bind(sid).first();
    if (s && String(s.uploader).startsWith("acct:")) await reshareSession(env, String(s.uploader).slice(5), sid).catch(() => {
    });
  }
  await env.DB.prepare(rest.length ? "UPDATE app_state SET v=?1 WHERE k='reshare'" : "DELETE FROM app_state WHERE k='reshare'").bind(...rest.length ? [JSON.stringify(rest)] : []).run();
}
__name(resharePending, "resharePending");
async function fixLapTimes(env) {
  const { results } = await env.DB.prepare(
    `SELECT a.id, a.session_id AS sid, a.time, a.trace, s.game, s.track_id AS tid, s.car_id AS cid FROM laps a
     JOIN laps b ON b.session_id=a.session_id AND b.n=a.n-1 AND b.time=a.time JOIN sessions s ON s.id=a.session_id
     WHERE a.tfix IS NULL AND a.trace IS NOT NULL LIMIT 15`
  ).all().catch(() => ({ results: [] }));
  for (const l of results || []) {
    let est = null;
    try {
      est = traceLapTime(JSON.parse(await openData(env, l.trace)));
    } catch (e) {
    }
    const fix3 = est != null && Math.abs(est - l.time) > 0.3 && est > 10 && est < 3600;
    await env.DB.batch([
      env.DB.prepare(fix3 ? "UPDATE laps SET time=?2, tfix=1 WHERE id=?1" : "UPDATE laps SET tfix=1 WHERE id=?1").bind(...fix3 ? [l.id, Math.round(est * 1e3) / 1e3] : [l.id]),
      env.DB.prepare(SESSION_SUMS).bind(l.sid)
    ]);
    if (fix3 && l.tid && l.cid) await markModel(env, l.game || "iracing", l.tid, l.cid).catch(() => {
    });
  }
}
__name(fixLapTimes, "fixLapTimes");
var HARDEN = { "x-content-type-options": "nosniff", "x-frame-options": "DENY", "referrer-policy": "no-referrer", "permissions-policy": "camera=(), microphone=(), geolocation=()", "strict-transport-security": "max-age=31536000; includeSubDomains", "cross-origin-opener-policy": "same-origin" };
function harden(r2) {
  if (r2.status === 101 || r2.webSocket) return r2;
  const h = new Headers(r2.headers);
  for (const k in HARDEN) if (!h.has(k)) h.set(k, HARDEN[k]);
  if (h.get("x-frame-options") === "DENY" && (h.get("content-security-policy") || "").includes("frame-ancestors *")) h.delete("x-frame-options");
  return new Response(r2.body, { status: r2.status, statusText: r2.statusText, headers: h });
}
__name(harden, "harden");
var worker_default = {
  // every 10 minutes: the models of the cars and tracks that got new laps
  async scheduled(ev, env, ctx) {
    const at2 = new Date(ev.scheduledTime || Date.now()), hourly = at2.getUTCMinutes() < 10, daily = hourly && at2.getUTCHours() === 3;
    const raw = env.DB;
    env = { ...env, DB: countingDB(raw, daily ? "cron daily" : hourly ? "cron hourly" : "cron 10 min") };
    if (hourly) ctx.waitUntil(pruneReports({ DB: raw }).catch(() => {
    }));
    if (hourly) ctx.waitUntil(pruneAlerts({ DB: raw }).catch(() => {
    }));
    if (hourly && at2.getUTCDay() === 1 && at2.getUTCHours() >= 7) ctx.waitUntil(weeklyAlerts2(env, at2.getTime()).catch(() => {
    }));
    if (hourly && at2.getUTCDay() === 1 && at2.getUTCHours() >= 9) ctx.waitUntil(discordWeekly(env, at2.getTime()).catch(() => {
    }));
    const all = [];
    const wait = ctx.waitUntil.bind(ctx);
    ctx = { ...ctx, waitUntil: /* @__PURE__ */ __name((pr) => {
      all.push(pr);
      wait(pr);
    }, "waitUntil") };
    ctx.waitUntil(rebuildDirty(env, { daily }));
    ctx.waitUntil(indexNow(env).catch(() => {
    }));
    if (hourly) {
      ctx.waitUntil(pruneUsage(env).catch(() => {
      }));
      ctx.waitUntil(pruneSeen(env).catch(() => {
      }));
    }
    if (daily) {
      ctx.waitUntil(fixLapTimes(env).catch(() => {
      }));
      ctx.waitUntil(repairImpossibleShares(env).catch(() => {
      }));
      ctx.waitUntil(env.DB.prepare(ALL_SESSION_SUMS).run().catch(() => {
      }));
    }
    ctx.waitUntil(resharePending(env).catch(() => {
    }));
    ctx.waitUntil(rebuildTrackMaps(env).catch(() => {
    }));
    ctx.waitUntil(scanLeagues(env).catch(() => {
    }));
    ctx.waitUntil(prunePresence(env).catch(() => {
    }));
    wait(Promise.allSettled(all).then(() => flushUsage(raw, true)));
  },
  async fetch(req, env, ctx) {
    if (!env.DB) return harden(await handle(req, env, ctx));
    const raw = env.DB, url = new URL(req.url);
    try {
      return harden(await handle(req, { ...env, DB: countingDB(raw, routeKey(req.method, url.pathname)) }, ctx));
    } finally {
      ctx.waitUntil(flushUsage(raw));
    }
  }
};
async function handle(req, env, ctx) {
  const url = new URL(req.url);
  if (url.protocol === "http:" && env.LOCAL !== "1" && !/^(localhost|127\.|\[::1\])/.test(url.hostname) && (req.method === "GET" || req.method === "HEAD")) {
    url.protocol = "https:";
    if (url.hostname.startsWith("www.")) url.hostname = url.hostname.slice(4);
    return Response.redirect(url.toString(), 301);
  }
  if (url.hostname.startsWith("www.")) {
    url.hostname = url.hostname.slice(4);
    return Response.redirect(url.toString(), 301);
  }
  if (url.pathname === "/news") return news(req, env, ctx);
  {
    const sp = await seoPage(req, env, url, ctx).catch(() => null);
    if (sp) return sp;
  }
  if (url.pathname.startsWith("/dl/") || url.pathname.startsWith("/downloads") || url.pathname.startsWith("/changelog")) return downloads(req, env, url);
  if (url.pathname === "/community/admin/online" && req.method === "GET") return onlineRoute(req, env).catch((e) => new Response(JSON.stringify({ error: "server error: " + (e && e.message) }), { status: 500, headers: { "content-type": "application/json" } }));
  if (url.pathname.startsWith("/community/usage") || url.pathname.startsWith("/community/feedback") || url.pathname === "/community/admin/analytics" || url.pathname === "/community/admin/feedback") {
    const r2 = await usageRoute(req, env, url).catch((e) => new Response(JSON.stringify({ error: "server error: " + (e && e.message) }), { status: 500, headers: { "content-type": "application/json" } }));
    if (r2) return r2;
  }
  if (url.pathname === "/community/alerts" || url.pathname === "/community/alerts/on") {
    const r2 = await alertsRoute(req, env, url).catch((e) => new Response(JSON.stringify({ error: "server error: " + (e && e.message) }), { status: 500, headers: { "content-type": "application/json" } }));
    if (r2) return r2;
  }
  if (url.pathname === "/community/crash" || url.pathname === "/community/support/logs" || url.pathname.startsWith("/community/admin/crashes") || url.pathname.startsWith("/community/admin/support/logs/") || url.pathname === "/community/admin/d1") {
    const r2 = await reportsRoute(req, env, url).catch((e) => new Response(JSON.stringify({ error: "server error: " + (e && e.message) }), { status: 500, headers: { "content-type": "application/json" } }));
    if (r2) return r2;
  }
  if (url.pathname.startsWith("/community/support") || url.pathname.startsWith("/community/admin/support")) {
    const r2 = await supportRoute(req, env, url).catch((e) => new Response(JSON.stringify({ error: "server error: " + (e && e.message) }), { status: 500, headers: { "content-type": "application/json" } }));
    if (r2) return r2;
  }
  if (url.pathname.startsWith("/community/")) {
    try {
      return await community(req, env, url, ctx);
    } catch (e) {
      return new Response(JSON.stringify({ error: "server error: " + (e && e.message) }), { status: 500, headers: { "content-type": "application/json" } });
    }
  }
  if (url.pathname.startsWith("/account/")) {
    try {
      {
        const res = await accounts(req, env, url);
        if (res && url.pathname === "/account/sync/meta") {
          try {
            const b = await latestBuild(env);
            if (b) res.headers.set("X-Pitlane-Build", b);
          } catch (e) {
          }
        }
        return res;
      }
    } catch (e) {
      return err9("server error: " + (e && e.message), 500);
    }
  }
  if (url.pathname === "/app" || url.pathname.startsWith("/app/")) {
    const to = new URL(req.url);
    to.pathname = url.pathname.slice(4) || "/";
    to.searchParams.delete("companion");
    return Response.redirect(to.href, 301);
  }
  if (url.pathname === "/index.html") {
    const to = new URL(req.url);
    to.pathname = "/";
    return Response.redirect(to.href, 301);
  }
  const isAppFile = /^\/(fonts\.css|pitwall-[a-z0-9-]+\.js|app-news\.json|whats-new\.json|server\.json|manifest\.webmanifest|favicon\.ico|favicon-32\.png|icon-\d+\.png|logo\.svg|bimi\.svg|og(?:-es|-pt)?\.png|robots\.txt|landing\/(?:en\/|es\/|pt\/)?[a-z0-9-]+\.(?:jpg|png))$/.test(url.pathname);
  if (url.pathname === "/" && url.searchParams.get("embed") !== "1" || isAppFile) {
    if (!env.ASSETS) return err9("the app is not published on this server", 404);
    if (url.pathname === "/server.json" && env.LOCAL === "1") return new Response(JSON.stringify({ url: url.origin }), { headers: { "content-type": "application/json", "cache-control": "no-cache" } });
    const r2 = await env.ASSETS.fetch(new Request(new URL(url.pathname, url.origin), req));
    const h = new Headers(r2.headers);
    h.set("referrer-policy", "no-referrer");
    h.set("x-frame-options", "DENY");
    h.set("x-content-type-options", "nosniff");
    h.set("cache-control", /^\/(landing\/|og)/.test(url.pathname) ? "public, max-age=86400, stale-while-revalidate=604800" : "no-cache");
    return new Response(r2.body, { status: r2.status, headers: h });
  }
  if (url.pathname === "/live") return live(req, env);
  if (url.pathname === "/discord/interactions") {
    try {
      return await discordInteraction(req, env, ctx);
    } catch (e) {
      return err9("server error", 500);
    }
  }
  if (url.pathname === "/discord/oauth" && req.method === "GET") return discordOAuth(req, env, url).catch(() => Response.redirect("https://pitlanehq.app/?discordLogin=0", 302));
  if (url.pathname === "/steam/return" && req.method === "GET") return steamReturn(req, env, url).catch(() => Response.redirect("https://pitlanehq.app/?steamLogin=0", 302));
  if (url.pathname === "/patreon/webhook" && req.method === "POST") return patreonWebhook(req, env);
  if (url.pathname === "/lemonsqueezy/webhook" && req.method === "POST") return lemonWebhook(req, env);
  if (url.pathname === "/voice/ice" && req.method === "GET") return voiceIce(env);
  if (url.pathname === "/admin" && req.method === "GET") return Response.redirect(url.origin + "/app#admin", 302);
  if (url.pathname.startsWith("/api/")) {
    try {
      return await api(req, env, url, ctx);
    } catch (e) {
      return err9("server error: " + (e && e.message), 500);
    }
  }
  if (url.pathname !== "/" && url.pathname.replace(/\/+$/, "") !== "/laps") {
    const al = /^\/(es|pt)(\/|$)/.exec(url.pathname)?.[1] || (req.headers.get("accept-language") || "").toLowerCase().slice(0, 2);
    return notFound(al === "es" || al === "pt" ? al : "en");
  }
  return new Response(VIEWER, {
    headers: {
      "content-type": "text/html; charset=utf-8",
      // shown inside the Pitlane HQ apps with embed=1 (then it only uses the session handed in the address)
      "content-security-policy": "default-src 'self'; script-src 'unsafe-inline'; style-src 'unsafe-inline' https://fonts.googleapis.com; font-src https://fonts.gstatic.com; connect-src 'self'; img-src 'self' data:; frame-ancestors " + (url.searchParams.get("embed") === "1" ? "*" : "'none'"),
      "referrer-policy": "no-referrer",
      // the viewer is part of the app, never a page of its own in search results
      "x-robots-tag": "noindex"
    }
  });
}
__name(handle, "handle");
export {
  LiveRoom,
  worker_default as default,
  traceLapTime
};
//# sourceMappingURL=worker.js.map
