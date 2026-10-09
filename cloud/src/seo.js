// Public pages for search engines and for people who arrive from them, rendered here as plain HTML
// (no app, no sign-in): what Pitlane HQ does, in English and Spanish, and the leaderboards of every car
// and track. The app stays at "/"; these pages link to it, to each other and to the downloads.
// Leaderboards show the accounts' nicknames (never their iRacing names) and race rivals by their whole name as the game
// shows it; anonymous laps are "Anonymous".
import { catMap, catOf } from "./categories.js";

const SITE = "https://pitlanehq.app";
const esc = (s) => String(s ?? "").replace(/[&<>"]/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" })[c]);
const slug = (s) => String(s || "").toLowerCase().normalize("NFD").replace(/[̀-ͯ]/g, "").replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "").slice(0, 80);
const fmt = (t) => { if (!(t > 0)) return "–"; const m = Math.floor(t / 60), s = t - m * 60; return (m ? m + ":" + (s < 10 ? "0" : "") : "") + s.toFixed(3); };
// text that came through a wrong encoding ("AutÃ³dromo") read back as it was written
const fix = (s) => { s = String(s || ""); if (!/[ÃÂ]/.test(s)) return s; try { return decodeURIComponent(escape(s)); } catch (e) { return s; } };
const CAT = {
  en: { oval: "Oval", sports_car: "Sports Car", formula_car: "Formula Car", dirt_oval: "Dirt Oval", dirt_road: "Dirt Road" },
  es: { oval: "Óvalo", sports_car: "Sports Car", formula_car: "Fórmula", dirt_oval: "Óvalo de tierra", dirt_road: "Tierra" },
};
const T = {
  en: { tel: "iRacing telemetry", rec: "Records", dl: "Download", app: "Open the app", lang: "Español", free: "Free · Windows, Android and web" },
  es: { tel: "Telemetría iRacing", rec: "Récords", dl: "Descargar", app: "Abrir la app", lang: "English", free: "Gratis · Windows, Android y web" },
};
const LOGO = `<svg viewBox="0 0 512 512" width="30" height="30" aria-hidden="true"><defs><linearGradient id="g" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="#1f2733"/><stop offset="1" stop-color="#0d1116"/></linearGradient></defs><rect x="16" y="16" width="480" height="480" rx="112" fill="url(#g)"/><path d="M149.9 382.1A150 150 0 1 1 362.1 382.1" fill="none" stroke="#ffb02e" stroke-width="48" stroke-dasharray="460 1000"/><path d="M149.9 382.1A150 150 0 1 1 362.1 382.1" fill="none" stroke="#f2f4f7" stroke-width="48" stroke-dasharray="0 460 247 1000"/><path d="M149.9 382.1A150 150 0 1 1 362.1 382.1" fill="none" stroke="#ffb02e" stroke-width="48" stroke-dasharray="0 460 31 31 31 31 31 31 31 31 1000"/><path d="M188.1 343.9A96 96 0 1 1 323.9 343.9" fill="none" stroke="#2f3a48" stroke-width="10" stroke-linecap="round"/><path d="M256 276L330 188" stroke="#f2f4f7" stroke-width="20" stroke-linecap="round"/><circle cx="256" cy="276" r="30" fill="#f2f4f7"/><circle cx="256" cy="276" r="12" fill="#ffb02e"/></svg>`;
const CSS = `:root{--bg:#11151b;--card:#1a2029;--line:#2b3542;--fg:#e7ebf1;--mut:#9aa6b8;--acc:#ffb02e}*{box-sizing:border-box}
body{margin:0;background:var(--bg);color:var(--fg);font:16px/1.6 'IBM Plex Sans',-apple-system,'Segoe UI',Roboto,sans-serif}a{color:var(--acc)}
.w{max-width:1000px;margin:0 auto;padding:0 18px}header{border-bottom:1px solid var(--line)}header .w{display:flex;align-items:center;gap:16px;flex-wrap:wrap;padding-top:12px;padding-bottom:12px}
.b{display:flex;align-items:center;gap:10px;color:var(--fg);text-decoration:none;font:700 22px/1 'Barlow Condensed',sans-serif;letter-spacing:.04em;text-transform:uppercase;margin-right:auto}
nav{display:flex;gap:14px;flex-wrap:wrap;font-size:14px}nav a{color:var(--fg);text-decoration:none;opacity:.85}nav a:hover{opacity:1;color:var(--acc)}
h1,h2,h3{font-family:'Barlow Condensed',sans-serif;line-height:1.1;letter-spacing:.02em}h1{font-size:46px;margin:40px 0 12px}h2{font-size:30px;margin:38px 0 10px}h3{font-size:21px;margin:0 0 6px}
.lead{font-size:19px;color:#c9d1dc;max-width:760px}.cta{display:flex;gap:12px;flex-wrap:wrap;margin:22px 0}
.btn{display:inline-block;padding:12px 18px;border-radius:8px;font:700 15px/1 'Barlow Condensed',sans-serif;letter-spacing:.06em;text-transform:uppercase;text-decoration:none;border:1px solid var(--line);color:var(--fg)}
.btn.p{background:var(--acc);color:#11151b;border-color:var(--acc)}.g{display:grid;grid-template-columns:repeat(auto-fit,minmax(260px,1fr));gap:14px}
.c{background:var(--card);border:1px solid var(--line);border-radius:12px;padding:18px}.c p{margin:0;color:#c9d1dc}.m{color:var(--mut)}
table{width:100%;border-collapse:collapse;font-size:15px}th,td{text-align:left;padding:8px 10px;border-bottom:1px solid var(--line)}th{color:var(--mut);font-weight:500;font-size:13px;text-transform:uppercase;letter-spacing:.06em}
td.t{font-family:'JetBrains Mono',ui-monospace,monospace;color:var(--acc)}tr:first-child td.t{font-weight:700}.n{width:44px;color:var(--mut)}
details{background:var(--card);border:1px solid var(--line);border-radius:10px;padding:12px 16px;margin:8px 0}summary{cursor:pointer;font-weight:600}
footer{border-top:1px solid var(--line);margin-top:50px;padding:22px 0;color:var(--mut);font-size:14px}.cats{display:flex;gap:8px;flex-wrap:wrap;margin:6px 0 4px}
.cats a{padding:6px 12px;border:1px solid var(--line);border-radius:20px;color:var(--fg);text-decoration:none;font-size:14px}.cats a.on{border-color:var(--acc);color:var(--acc)}
@media(max-width:600px){h1{font-size:36px}.lead{font-size:17px}th:nth-child(4),td:nth-child(4){display:none}}`;

function page(l, { title, desc, path, alt, body, ld }) {
  const t = T[l], other = l === "en" ? "es" : "en";
  const links = { en: { tel: "/iracing-telemetry", rec: "/records" }, es: { tel: "/es/telemetria-iracing", rec: "/es/records" } }[l];
  return `<!doctype html><html lang="${l}"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1">
<title>${esc(title)}</title><meta name="description" content="${esc(desc)}"><link rel="canonical" href="${SITE}${path}">
${alt ? `<link rel="alternate" hreflang="${l}" href="${SITE}${path}"><link rel="alternate" hreflang="${other}" href="${SITE}${alt}"><link rel="alternate" hreflang="x-default" href="${SITE}${l === "en" ? path : alt}">` : ""}
<meta property="og:type" content="website"><meta property="og:site_name" content="Pitlane HQ"><meta property="og:title" content="${esc(title)}"><meta property="og:description" content="${esc(desc)}"><meta property="og:url" content="${SITE}${path}"><meta property="og:image" content="${SITE}/og.png"><meta name="twitter:card" content="summary_large_image">
<meta name="theme-color" content="#11151b"><link rel="icon" href="/favicon.ico" sizes="any"><link rel="icon" href="/logo.svg" type="image/svg+xml"><link rel="apple-touch-icon" href="/icon-180.png">
<link rel="preconnect" href="https://fonts.googleapis.com"><link rel="stylesheet" href="https://fonts.googleapis.com/css2?family=Barlow+Condensed:wght@600;700&family=IBM+Plex+Sans:wght@400;500;600&family=JetBrains+Mono:wght@500;700&display=swap">
<style>${CSS}</style>${ld ? `<script type="application/ld+json">${JSON.stringify(ld)}</script>` : ""}</head><body>
<header><div class="w"><a class="b" href="/">${LOGO}Pitlane HQ</a><nav><a href="${links.tel}">${esc(t.tel)}</a><a href="${links.rec}">${esc(t.rec)}</a><a href="/downloads">${esc(t.dl)}</a><a href="/">${esc(t.app)}</a>${alt ? `<a href="${alt}" hreflang="${other}">${esc(t.lang)}</a>` : ""}</nav></div></header>
<main class="w">${body}</main>
<footer><div class="w">Pitlane HQ · ${esc(t.free)} · <a href="/downloads">${esc(t.dl)}</a> · <a href="mailto:support@pitlanehq.app">support@pitlanehq.app</a></div></footer></body></html>`;
}
const html = (s, cache = 600) => new Response(s, { headers: { "content-type": "text/html; charset=utf-8", "cache-control": `public, max-age=${cache}`, "x-content-type-options": "nosniff" } });

// ---------- what Pitlane HQ does ----------
const LAND = {
  en: {
    path: "/iracing-telemetry", alt: "/es/telemetria-iracing",
    title: "iRacing telemetry and lap analysis · Pitlane HQ",
    desc: "Free iRacing telemetry: record your laps, see where you lose time and compare with faster drivers in the same car.",
    h1: "iRacing telemetry and a coach for your laps",
    lead: "Pitlane HQ records every lap you drive in iRacing and shows where you lose time: against your own best lap, against the record and against the driver just ahead of you in the same car. It is free and works on Windows, Android and the web.",
    cards: [
      ["Telemetry from every lap", "The Windows app runs next to iRacing and saves speed, throttle, brake, gear and steering on every lap, with nothing to set up. The laps go to your account, so you can open them later on the web or on your phone."],
      ["Compare two laps", "Speed, inputs and the time gap along the lap, the track map, the sectors and the braking points. Pick any two laps: yours, one from another session or one from the leaderboard."],
      ["A coach that uses real laps", "For each car and track Pitlane HQ learns from real laps driven by real people. The coach compares your lap with the record and with the driver just ahead of you, and tells you which corners cost the most."],
      ["Live telemetry on your phone", "While you drive, watch your telemetry on the phone or in a browser. Share a code and a friend or your engineer can watch too."],
      ["Leaderboards by car and track", "The fastest lap of every driver on each car and track, by discipline: oval, sports car, formula, dirt oval and dirt road."],
      ["Race summaries", "After each race: your result, your laps, your incidents and how you compared with the drivers around you."],
    ],
    recs: "Records by car and track", recsLead: "The fastest laps driven with Pitlane HQ:",
    faqT: "Questions",
    faq: [
      ["Is it free?", "Yes. The PC app, the web and the Android app are free."],
      ["Which sims does it work with?", "iRacing. Le Mans Ultimate, ACC and Assetto Corsa are in development."],
      ["What do I need?", "A Windows PC where you race in iRacing, to record the laps. To look at them, any browser or the Android app."],
      ["Who sees my laps?", "Your laps are in your account. On the leaderboards only your fastest lap of each car and track appears, under your public name or as Anonymous."],
      ["How is it different from looking at a replay?", "A replay shows what happened; telemetry shows how: where you braked, how much throttle you used and where the time went, metre by metre, next to a faster lap."],
    ],
    dl: "Download for Windows", app: "Open the app",
  },
  es: {
    path: "/es/telemetria-iracing", alt: "/iracing-telemetry",
    title: "Telemetría para iRacing y análisis de vueltas · Pitlane HQ",
    desc: "Telemetría gratis para iRacing: graba tus vueltas, mira dónde pierdes tiempo y compárate con pilotos más rápidos con el mismo coche.",
    h1: "Telemetría para iRacing y un coach para tus vueltas",
    lead: "Pitlane HQ graba cada vuelta que das en iRacing y te enseña dónde pierdes tiempo: frente a tu mejor vuelta, frente al récord y frente al piloto que va justo por delante con el mismo coche. Es gratis y funciona en Windows, Android y la web.",
    cards: [
      ["Telemetría de cada vuelta", "La app de Windows funciona junto a iRacing y guarda velocidad, acelerador, freno, marcha y volante en cada vuelta, sin configurar nada. Las vueltas van a tu cuenta, así que luego las abres en la web o en el móvil."],
      ["Comparar dos vueltas", "Velocidad, pedales y diferencia de tiempo a lo largo de la vuelta, el mapa del circuito, los sectores y los puntos de frenada. Eliges dos vueltas cualquiera: tuyas, de otra sesión o de la clasificación."],
      ["Un coach con vueltas reales", "Para cada coche y circuito, Pitlane HQ aprende de vueltas reales de pilotos reales. El coach compara tu vuelta con el récord y con el piloto que va justo por delante, y te dice qué curvas te cuestan más."],
      ["Telemetría en vivo en el móvil", "Mientras corres, mira tu telemetría en el móvil o en el navegador. Comparte un código y un amigo o tu ingeniero también puede verla."],
      ["Clasificaciones por coche y circuito", "La vuelta más rápida de cada piloto en cada coche y circuito, por disciplina: óvalo, sports car, fórmula, óvalo de tierra y tierra."],
      ["Resumen de cada carrera", "Después de cada carrera: tu resultado, tus vueltas, tus incidentes y cómo ibas frente a los pilotos de tu alrededor."],
    ],
    recs: "Récords por coche y circuito", recsLead: "Las vueltas más rápidas hechas con Pitlane HQ:",
    faqT: "Preguntas",
    faq: [
      ["¿Es gratis?", "Sí. La app del PC, la web y la app de Android son gratis."],
      ["¿Con qué simuladores funciona?", "Con iRacing. Le Mans Ultimate, ACC y Assetto Corsa están en desarrollo."],
      ["¿Qué necesito?", "Un PC con Windows donde corras en iRacing, para grabar las vueltas. Para verlas, cualquier navegador o la app de Android."],
      ["¿Quién ve mis vueltas?", "Tus vueltas están en tu cuenta. En las clasificaciones solo aparece tu vuelta más rápida de cada coche y circuito, con tu nombre público o como Anónimo."],
      ["¿En qué se diferencia de ver una repetición?", "La repetición muestra qué pasó; la telemetría muestra cómo: dónde frenaste, cuánto acelerador diste y dónde se fue el tiempo, metro a metro, al lado de una vuelta más rápida."],
    ],
    dl: "Descargar para Windows", app: "Abrir la app",
  },
};

async function topCombos(env, n) {
  const r = await env.DB.prepare(
    "SELECT track_id AS t, MAX(track) AS track, car_id AS c, MAX(car) AS car, COUNT(DISTINCT user_id) AS drivers, MIN(time) AS best, MAX(cat) AS hint FROM community_laps WHERE game='iracing' AND track_id>0 AND car_id>0 AND COALESCE(shown,'')<>'model' GROUP BY track_id, car_id ORDER BY drivers DESC, best LIMIT ?1"
  ).bind(n).all().catch(() => ({ results: [] }));
  return r.results || [];
}
const recPath = (l, x) => `${l === "es" ? "/es" : ""}/records/${x.t}-${x.c}/${slug(fix(x.track) + " " + fix(x.car))}`;

async function landing(env, l) {
  const L = LAND[l], combos = await topCombos(env, 8);
  const body = `<h1>${esc(L.h1)}</h1><p class="lead">${esc(L.lead)}</p>
<div class="cta"><a class="btn p" href="/dl/PitlaneHQ-Setup.exe">${esc(L.dl)}</a><a class="btn" href="/">${esc(L.app)}</a></div>
<div class="g">${L.cards.map(([h, p]) => `<section class="c"><h3>${esc(h)}</h3><p>${esc(p)}</p></section>`).join("")}</div>
${combos.length ? `<h2>${esc(L.recs)}</h2><p class="m">${esc(L.recsLead)}</p><table><tbody>${combos.map((x) => `<tr><td><a href="${recPath(l, x)}">${esc(fix(x.track))}</a></td><td class="m">${esc(fix(x.car))}</td><td class="t">${fmt(x.best)}</td></tr>`).join("")}</tbody></table><p><a href="${l === "es" ? "/es/records" : "/records"}">${esc(T[l].rec)} →</a></p>` : ""}
<h2>${esc(L.faqT)}</h2>${L.faq.map(([q, a]) => `<details><summary>${esc(q)}</summary><p>${esc(a)}</p></details>`).join("")}`;
  const ld = [
    { "@context": "https://schema.org", "@type": "SoftwareApplication", name: "Pitlane HQ", url: SITE + "/", applicationCategory: "SportsApplication", operatingSystem: "Windows, Android, Web", description: L.desc, image: SITE + "/og.png", inLanguage: l, offers: { "@type": "Offer", price: "0", priceCurrency: "USD" } },
    { "@context": "https://schema.org", "@type": "FAQPage", mainEntity: L.faq.map(([q, a]) => ({ "@type": "Question", name: q, acceptedAnswer: { "@type": "Answer", text: a } })) },
  ];
  return html(page(l, { title: L.title, desc: L.desc, path: L.path, alt: L.alt, body, ld }));
}

// ---------- the leaderboards ----------
async function recordsIndex(env, l, cat) {
  const all = await topCombos(env, 1000), cm = await catMap(env).catch(() => ({ tc: {}, c: {} }));
  const rows = all.map((x) => ({ ...x, cat: catOf(cm, x.t, x.c, x.hint, x.track, x.car) }));
  const cats = Object.keys(CAT.en).filter((k) => rows.some((x) => x.cat === k));
  const list = cat ? rows.filter((x) => x.cat === cat) : rows;
  const base = l === "es" ? "/es/records" : "/records", path = base + (cat ? "?d=" + cat : "");
  const title = l === "es" ? `Récords de iRacing por coche y circuito${cat ? " · " + CAT.es[cat] : ""} · Pitlane HQ` : `iRacing records by car and track${cat ? " · " + CAT.en[cat] : ""} · Pitlane HQ`;
  const desc = l === "es" ? "Las vueltas más rápidas de iRacing en cada coche y circuito, de pilotos que usan Pitlane HQ." : "The fastest iRacing laps on every car and track, from drivers who use Pitlane HQ.";
  const body = `<h1>${esc(l === "es" ? "Récords de iRacing por coche y circuito" : "iRacing records by car and track")}</h1><p class="lead">${esc(desc)}</p>
<div class="cats"><a href="${base}"${cat ? "" : ' class="on"'}>${l === "es" ? "Todas" : "All"}</a>${cats.map((k) => `<a href="${base}?d=${k}"${k === cat ? ' class="on"' : ""}>${esc(CAT[l][k])}</a>`).join("")}</div>
${list.length ? `<table><thead><tr><th>${l === "es" ? "Circuito" : "Track"}</th><th>${l === "es" ? "Coche" : "Car"}</th><th>${l === "es" ? "Récord" : "Record"}</th><th>${l === "es" ? "Pilotos" : "Drivers"}</th></tr></thead><tbody>${list.map((x) => `<tr><td><a href="${recPath(l, x)}">${esc(fix(x.track))}</a></td><td class="m">${esc(fix(x.car))}</td><td class="t">${fmt(x.best)}</td><td class="m">${x.drivers}</td></tr>`).join("")}</tbody></table>` : `<p class="m">${l === "es" ? "Aún no hay vueltas." : "No laps yet."}</p>`}`;
  return html(page(l, { title, desc, path, alt: (l === "es" ? "/records" : "/es/records") + (cat ? "?d=" + cat : ""), body }));
}

async function recordsCombo(env, l, t, c, asked) {
  // the names as the sitemap and the index have them (one address per car and track); any other spelling of
  // the address goes there for good (301), so search engines see one page, not several
  const nm = await env.DB.prepare("SELECT MAX(track) AS track, MAX(car) AS car FROM community_laps WHERE track_id=?1 AND car_id=?2 AND game='iracing'").bind(t, c).first().catch(() => null);
  if (!nm || !nm.track) return null;
  const canon = recPath(l, { t, c, track: nm.track, car: nm.car });
  if (asked !== canon) return Response.redirect(SITE + canon, 301);
  const r = await env.DB.prepare(
    `SELECT l.user_id AS uid, CASE WHEN l.anon=1 OR COALESCE(ac.anon,0)=1 OR u.alias='Anonymous' THEN '' ELSE u.alias END AS alias, l.time, l.created, l.track, l.car, l.cat
       FROM community_laps l JOIN community_users u ON u.id=l.user_id LEFT JOIN accounts ac ON ac.id=l.user_id
      WHERE l.track_id=?1 AND l.car_id=?2 AND l.game='iracing' AND COALESCE(l.shown,'')<>'model' ORDER BY l.time LIMIT 300`
  ).bind(t, c).all().catch(() => ({ results: [] }));
  const seen = new Set(), laps = [];
  for (const x of r.results || []) { if (seen.has(x.uid)) continue; seen.add(x.uid); laps.push(x); if (laps.length >= 50) break; }
  if (!laps.length) return null;
  const track = fix(nm.track), car = fix(nm.car), cm = await catMap(env).catch(() => ({ tc: {}, c: {} }));
  const cat = catOf(cm, t, c, laps[0].cat, laps[0].track, laps[0].car), d = (v) => v ? new Date(v).toISOString().slice(0, 10) : "";
  const anon = l === "es" ? "Anónimo" : "Anonymous", x = { t, c, track, car };
  const title = l === "es" ? `${car} en ${track}: récords y vueltas más rápidas en iRacing` : `${car} at ${track}: iRacing lap records`;
  const desc = l === "es" ? `Récord de ${car} en ${track}: ${fmt(laps[0].time)}. Las ${laps.length} vueltas más rápidas de iRacing de pilotos de Pitlane HQ, una por piloto.` : `${car} at ${track} lap record: ${fmt(laps[0].time)}. The ${laps.length} fastest iRacing laps from Pitlane HQ drivers, one per driver.`;
  const body = `<p class="m"><a href="${l === "es" ? "/es/records" : "/records"}">${esc(T[l].rec)}</a> · ${esc(CAT[l][cat] || "")}</p>
<h1>${esc(car)}<br><span class="m" style="font-size:.7em">${esc(track)}</span></h1>
<p class="lead">${esc(l === "es" ? `Récord: ${fmt(laps[0].time)}. Una vuelta por piloto, la más rápida.` : `Record: ${fmt(laps[0].time)}. One lap per driver, their fastest.`)}</p>
<table><thead><tr><th class="n">#</th><th>${l === "es" ? "Piloto" : "Driver"}</th><th>${l === "es" ? "Tiempo" : "Time"}</th><th>${l === "es" ? "Fecha" : "Date"}</th></tr></thead><tbody>${laps.map((v, i) => `<tr><td class="n">${i + 1}</td><td>${esc(v.alias || anon)}</td><td class="t">${fmt(v.time)}</td><td class="m">${d(v.created)}</td></tr>`).join("")}</tbody></table>
<div class="c" style="margin-top:22px"><h3>${esc(l === "es" ? "¿Dónde pierdes tiempo con este coche?" : "Where do you lose time in this car?")}</h3><p>${esc(l === "es" ? "Pitlane HQ graba tus vueltas en iRacing y las compara con estas, curva a curva. Es gratis." : "Pitlane HQ records your iRacing laps and compares them with these, corner by corner. It is free.")}</p><div class="cta" style="margin-bottom:0"><a class="btn p" href="/dl/PitlaneHQ-Setup.exe">${esc(LAND[l].dl)}</a><a class="btn" href="${LAND[l].path}">${esc(T[l].tel)}</a></div></div>`;
  return html(page(l, { title, desc, path: recPath(l, x), alt: recPath(l === "es" ? "en" : "es", x), body }));
}

// an address of the public pages that does not exist: a real 404 (never the app), so it is not indexed
const notFound = (l) => new Response(page(l, { title: l === "es" ? "No encontrado · Pitlane HQ" : "Not found · Pitlane HQ", desc: "", path: l === "es" ? "/es/records" : "/records",
  body: `<h1>${l === "es" ? "Esta página no existe" : "This page does not exist"}</h1><p><a href="${l === "es" ? "/es/records" : "/records"}">${esc(T[l].rec)}</a> · <a href="/">${esc(T[l].app)}</a></p>` }),
  { status: 404, headers: { "content-type": "text/html; charset=utf-8", "x-robots-tag": "noindex" } });

async function sitemap(env) {
  const combos = await topCombos(env, 2000), u = (p, f, pr) => `<url><loc>${SITE}${p}</loc><changefreq>${f}</changefreq><priority>${pr}</priority></url>`;
  const s = [u("/", "weekly", "1.0"), u("/iracing-telemetry", "weekly", "0.9"), u("/es/telemetria-iracing", "weekly", "0.9"), u("/records", "daily", "0.8"), u("/es/records", "daily", "0.7"), u("/downloads", "weekly", "0.7"), u("/changelog", "weekly", "0.4")];
  for (const x of combos) { s.push(u(recPath("en", x), "daily", "0.6")); s.push(u(recPath("es", x), "daily", "0.5")); }
  return new Response(`<?xml version="1.0" encoding="UTF-8"?>\n<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">\n${s.join("\n")}\n</urlset>\n`, { headers: { "content-type": "application/xml; charset=utf-8", "cache-control": "public, max-age=3600" } });
}

// IndexNow: Bing (and through it DuckDuckGo, Yandex…) hears at once about new and changed pages. The key is
// public by design (search engines read it at /<key>.txt); it only proves the pings come from this site.
const INDEXNOW_KEY = "1fbc105af121e0dcfc14e13a8740813a";
export async function indexNow(env) {
  const row = await env.DB.prepare("SELECT v FROM app_state WHERE k='indexnow_at'").first().catch(() => null), last = +((row && row.v) || 0);
  if (Date.now() - last < 20 * 3600e3) return; // once a day
  const fresh = await env.DB.prepare(
    "SELECT track_id AS t, MAX(track) AS track, car_id AS c, MAX(car) AS car FROM community_laps WHERE game='iracing' AND track_id>0 AND car_id>0 AND created>?1 GROUP BY track_id, car_id LIMIT 4000"
  ).bind(last).all().catch(() => ({ results: [] }));
  const urls = [];
  if (!last) urls.push("/", "/iracing-telemetry", "/es/telemetria-iracing", "/records", "/es/records", "/downloads");
  else if ((fresh.results || []).length) urls.push("/records", "/es/records");
  for (const x of fresh.results || []) urls.push(recPath("en", x), recPath("es", x));
  if (urls.length) {
    const r = await fetch("https://api.indexnow.org/indexnow", { method: "POST", headers: { "content-type": "application/json; charset=utf-8" },
      body: JSON.stringify({ host: "pitlanehq.app", key: INDEXNOW_KEY, keyLocation: `${SITE}/${INDEXNOW_KEY}.txt`, urlList: urls.slice(0, 10000).map((u) => SITE + u) }) }).catch(() => null);
    if (!r || r.status >= 300) return; // try again on the next run
  }
  await env.DB.prepare("INSERT INTO app_state (k, v, at) VALUES ('indexnow_at', ?1, ?1) ON CONFLICT(k) DO UPDATE SET v=excluded.v, at=excluded.at").bind(String(Date.now())).run().catch(() => {});
}

/** The public pages, or null when the address is not one of them. */
export async function seoPage(req, env, url) {
  if (req.method !== "GET" && req.method !== "HEAD") return null;
  const p = url.pathname.replace(/\/+$/, "") || "/";
  if (p === "/sitemap.xml") return sitemap(env);
  if (p === "/" + INDEXNOW_KEY + ".txt") return new Response(INDEXNOW_KEY, { headers: { "content-type": "text/plain; charset=utf-8" } });
  if (p === "/iracing-telemetry" || p === "/telemetry") return landing(env, "en");
  if (p === "/es/telemetria-iracing" || p === "/es/telemetria" || p === "/es") return landing(env, "es");
  const dsc = url.searchParams.get("d"), cat = CAT.en[dsc] ? dsc : "";
  if (p === "/records") return recordsIndex(env, "en", cat);
  if (p === "/es/records") return recordsIndex(env, "es", cat);
  const m = /^(\/es)?\/records\/(\d+)-(\d+)(?:\/[a-z0-9-]*)?$/.exec(p);
  if (m) return (await recordsCombo(env, m[1] ? "es" : "en", +m[2], +m[3], p)) || notFound(m[1] ? "es" : "en");
  if (/^(\/es)?\/records\//.test(p)) return notFound(p.startsWith("/es") ? "es" : "en");
  return null;
}
