// Downloads and release notes served from our own storage (an R2 bucket, binding DL): the
// Windows build and the phone apps are uploaded there by the build workflows, with version.json
// (PC) and phones.json (apps) beside them and the changelogs. Nothing points at GitHub.
//   /dl/<file>            a file (PitlaneHQ-Setup.exe, PitlaneHQ-windows.zip, the APK, the IPA…)
//   /dl/version.json      the PC version, build and minimum version (the updater reads it)
//   /dl/phones.json       the phone apps' version and files
//   /downloads            the downloads page
//   /changelog[/phones]   the release notes, one anchor per version (#062-beta)
const H = { "content-type": "text/html; charset=utf-8", "cache-control": "no-cache", "referrer-policy": "no-referrer" };
const esc = (s) => String(s ?? "").replace(/[&<>"]/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" })[c]);
const TYPES = { exe: "application/vnd.microsoft.portable-executable", zip: "application/zip", apk: "application/vnd.android.package-archive", aab: "application/octet-stream", ipa: "application/octet-stream", json: "application/json; charset=utf-8", md: "text/markdown; charset=utf-8" };

export async function downloads(req, env, url) {
  const p = url.pathname;
  if (!env.DL) return new Response(JSON.stringify({ error: "downloads are not set up on this server (R2 bucket DL)" }), { status: 404, headers: { "content-type": "application/json" } });
  if (p.startsWith("/dl/")) {
    const name = decodeURIComponent(p.slice(4));
    if (!/^[A-Za-z0-9._-]{1,80}$/.test(name)) return new Response("not found", { status: 404 });
    const o = await env.DL.get(name);
    if (!o) return new Response("not found", { status: 404 });
    const ext = name.split(".").pop().toLowerCase();
    const h = new Headers({ "content-type": TYPES[ext] || "application/octet-stream", "cache-control": ext === "json" || ext === "md" ? "no-cache" : "public, max-age=300", "x-content-type-options": "nosniff", "access-control-allow-origin": "*" });
    if (o.httpEtag) h.set("etag", o.httpEtag);
    if (!["json", "md"].includes(ext)) h.set("content-disposition", `attachment; filename="${name}"`);
    h.set("content-length", String(o.size));
    return new Response(o.body, { headers: h });
  }
  const read = async (n) => { const o = await env.DL.get(n); return o ? o.text() : null; };
  const json = async (n) => { try { return JSON.parse((await read(n)) || "null"); } catch (e) { return null; } };
  const es = (req.headers.get("accept-language") || "").toLowerCase().startsWith("es");
  if (p === "/downloads" || p === "/downloads/") {
    const pc = (await json("version.json")) || {}, ph = (await json("phones.json")) || {};
    const t = (en, s) => (es ? s : en);
    const row = (title, sub, file) => `<a class="c" href="/dl/${esc(file)}"><b>${esc(title)}</b><span>${esc(sub)}</span></a>`;
    const body = `<h1>${t("Download Pitlane HQ", "Descargar Pitlane HQ")}</h1><p>${t("Free. One account for the PC, the web and the phone apps.", "Gratis. Una cuenta para el PC, la web y las apps de móvil.")}</p>
<h2>Windows ${pc.version ? `<small>v${esc(pc.version)} beta</small>` : ""}</h2><div class="g">
${row("Windows", t("Installer; it updates itself", "Instalador; se actualiza solo"), "PitlaneHQ-Setup.exe")}
${row(t("Native window (preview)", "Ventana nativa (preview)"), t("The new window over the same engine", "La ventana nueva sobre el mismo motor"), "PitlaneHQ-Desktop-Setup.exe")}</div>
<h2>${t("Phones", "Móviles")} ${ph.version ? `<small>v${esc(ph.version)} beta</small>` : ""}</h2><div class="g">
${ph.apk ? row("Android", t("App (APK); Google Play soon", "App (APK); pronto en Google Play"), ph.apk) : ""}<div class="c" style="opacity:.7"><b>iPhone</b><span>${t("Coming to the App Store", "Pronto en la App Store")}</span></div></div>
<p class="n"><a href="/changelog">${t("What changed in each version", "Qué cambió en cada versión")}</a> · <a href="/">${t("Open the web app", "Abrir la app web")}</a></p>`;
    return new Response(page(body), { headers: H });
  }
  if (p === "/changelog" || p === "/changelog/phones") {
    // the short notes for people (web/dist/whats-new.json), the same ones the apps show
    let vs = [];
    try { vs = (await (await env.ASSETS.fetch(new Request(new URL("/whats-new.json", url.origin)))).json()).versions || []; } catch (e) { /* none yet */ }
    const l = es ? "es" : "en";
    const body = `<h1>${es ? "Novedades" : "What's new"}</h1>` + vs.map((x) => `<h2 id="${esc(String(x.v).replace(/\./g, ""))}-beta">${esc(x.v)} <small>${esc(x.date || "")}</small></h2><ul>${(x[l] || x.en || []).map((t) => `<li>${esc(t)}</li>`).join("")}</ul>`).join("");
    return new Response(page(body + `<p class="n"><a href="/downloads">${es ? "Descargas" : "Downloads"}</a> · <a href="/">${es ? "Abrir la app" : "Open the app"}</a></p>`), { headers: H });
  }
  return new Response("not found", { status: 404 });
}

/** A small Markdown subset: headings (with an anchor like the app's links use: "## 0.6.2 beta" → #062-beta), bold, lists, paragraphs. */
function renderMd(md) {
  const inline = (s) => esc(s).replace(/\*\*(.+?)\*\*/g, "<b>$1</b>").replace(/`([^`]+)`/g, "<code>$1</code>").replace(/\[([^\]]+)\]\((https?:\/\/[^)]+)\)/g, '<a href="$2">$1</a>');
  let out = "", list = false, para = [];
  const flush = () => { if (para.length) { out += `<p>${inline(para.join(" "))}</p>`; para = []; } if (list) { out += "</ul>"; list = false; } };
  for (const raw of md.split("\n")) {
    const line = raw.replace(/\s+$/, "");
    const h = /^(#{1,3})\s+(.*)$/.exec(line);
    if (h) { flush(); const id = h[2].toLowerCase().replace(/[^a-z0-9]+/g, "").replace(/beta$/, "-beta"); out += `<h${h[1].length} id="${id}">${inline(h[2])}</h${h[1].length}>`; continue; }
    if (/^\s*-\s+/.test(line)) { if (para.length) { out += `<p>${inline(para.join(" "))}</p>`; para = []; } if (!list) { out += "<ul>"; list = true; } out += `<li>${inline(line.replace(/^\s*-\s+/, ""))}</li>`; continue; }
    if (/^\s+\S/.test(line) && list) { out = out.replace(/<\/li>$/, " " + inline(line.trim()) + "</li>"); continue; }
    if (!line.trim()) { flush(); continue; }
    para.push(line.trim());
  }
  flush();
  return out;
}

const page = (body) => `<!doctype html><html><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>Download Pitlane HQ · iRacing telemetry for Windows and Android</title><meta name="description" content="Download Pitlane HQ for Windows (it records your iRacing laps) and the Android app. Free."><link rel="canonical" href="https://pitlanehq.app/downloads"><meta property="og:image" content="https://pitlanehq.app/og.png"><link rel="icon" href="/favicon.ico" sizes="any"><link rel="icon" href="/logo.svg" type="image/svg+xml">
<style>body{margin:0;background:#11151b;color:#e7ebf1;font:16px/1.55 system-ui,sans-serif}main{max-width:760px;margin:0 auto;padding:28px 16px 48px}h1{font-size:26px;letter-spacing:.04em;text-transform:uppercase;margin:0 0 6px}h2{font-size:18px;margin:26px 0 10px;letter-spacing:.03em}h2 small{color:#8a97a9;font-weight:600;font-size:12px;margin-left:8px}
h3{font-size:14px;color:#ffb02e;margin:18px 0 4px}p{color:#a9b4c3;margin:6px 0}ul{padding-left:20px;color:#c9d2de}li{margin:4px 0}code{background:#19202a;padding:1px 5px;border-radius:4px;font-size:13px}a{color:#ffb02e}
.g{display:grid;grid-template-columns:repeat(auto-fill,minmax(220px,1fr));gap:10px}.c{display:grid;gap:3px;padding:14px;border:1px solid #2b3542;border-radius:12px;background:#19202a;text-decoration:none;color:#e7ebf1}.c:hover{border-color:#ffb02e}.c span{color:#8a97a9;font-size:13px}.n{margin-top:26px;font-size:14px}
.top{display:flex;align-items:center;gap:10px;margin-bottom:18px}.top b{font-size:15px;letter-spacing:.06em}.top img{width:28px;height:28px;border-radius:7px}</style>
<main><div class="top"><img src="/icon-192.png" alt=""><b>PITLANE HQ</b></div>${body}</main></html>`;
