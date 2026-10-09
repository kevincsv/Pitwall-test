// Public pages for search engines and for people who arrive from them, rendered here as plain HTML
// (no app, no sign-in): what Pitlane HQ does, in English, Spanish and Portuguese (each page names the other two with
// hreflang), and the leaderboards of every car and track. The app stays at "/"; these pages link to it, to each other and to the downloads.
// Leaderboards show the accounts' nicknames (never their iRacing names) and race rivals by their whole name as the game
// shows it; anonymous laps are "Anonymous".
import { catMap, catOf } from "./categories.js";

const SITE = "https://pitlanehq.app";
const esc = (s) => String(s ?? "").replace(/[&<>"]/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" })[c]);
const slug = (s) => String(s || "").toLowerCase().normalize("NFD").replace(/[̀-ͯ]/g, "").replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "").slice(0, 80);
const fmt = (t) => { if (!(t > 0)) return "–"; const m = Math.floor(t / 60), s = t - m * 60; return (m ? m + ":" + (s < 10 ? "0" : "") : "") + s.toFixed(3); };
// text that came through a wrong encoding ("AutÃ³dromo") read back as it was written
const fix = (s) => { s = String(s || ""); if (!/[ÃÂ]/.test(s)) return s; try { return decodeURIComponent(escape(s)); } catch (e) { return s; } };
// the three languages of the public pages: English at the root, Spanish under /es, Portuguese (Brazil) under /pt
const LANGS = ["en", "es", "pt"], PRE = { en: "", es: "/es", pt: "/pt" }, NAME = { en: "English", es: "Español", pt: "Português" };
const LOCALE = { en: "en_US", es: "es_ES", pt: "pt_BR" };
const CAT = {
  en: { oval: "Oval", sports_car: "Sports Car", formula_car: "Formula Car", dirt_oval: "Dirt Oval", dirt_road: "Dirt Road" },
  es: { oval: "Óvalo", sports_car: "Sports Car", formula_car: "Fórmula", dirt_oval: "Óvalo de tierra", dirt_road: "Tierra" },
  pt: { oval: "Oval", sports_car: "Sports Car", formula_car: "Fórmula", dirt_oval: "Oval de terra", dirt_road: "Terra" },
};
const T = {
  en: { tel: "iRacing telemetry", rec: "Records", dl: "Download", app: "Open the app", free: "Free · Windows, Android and web" },
  es: { tel: "Telemetría iRacing", rec: "Récords", dl: "Descargar", app: "Abrir la app", free: "Gratis · Windows, Android y web" },
  pt: { tel: "Telemetria iRacing", rec: "Recordes", dl: "Baixar", app: "Abrir o app", free: "Grátis · Windows, Android e web" },
};
// the words of the records pages
const S = {
  en: { recH: "iRacing records by car and track", recD: "The fastest iRacing laps on every car and track, from drivers who use Pitlane HQ.", all: "All", track: "Track", car: "Car", record: "Record", drivers: "Drivers", none: "No laps yet.",
    anon: "Anonymous", driver: "Driver", time: "Time", date: "Date", nf: "This page does not exist", nfT: "Not found",
    cT: (car, track) => `${car} at ${track}: iRacing lap records`, cD: (car, track, t, n) => `${car} at ${track} lap record: ${t}. The ${n} fastest iRacing laps from Pitlane HQ drivers, one per driver.`,
    cL: (t) => `Record: ${t}. One lap per driver, their fastest.`, cQ: "Where do you lose time in this car?", cA: "Pitlane HQ records your iRacing laps and compares them with these, corner by corner. It is free." },
  es: { recH: "Récords de iRacing por coche y circuito", recD: "Las vueltas más rápidas de iRacing en cada coche y circuito, de pilotos que usan Pitlane HQ.", all: "Todas", track: "Circuito", car: "Coche", record: "Récord", drivers: "Pilotos", none: "Aún no hay vueltas.",
    anon: "Anónimo", driver: "Piloto", time: "Tiempo", date: "Fecha", nf: "Esta página no existe", nfT: "No encontrado",
    cT: (car, track) => `${car} en ${track}: récords y vueltas más rápidas en iRacing`, cD: (car, track, t, n) => `Récord de ${car} en ${track}: ${t}. Las ${n} vueltas más rápidas de iRacing de pilotos de Pitlane HQ, una por piloto.`,
    cL: (t) => `Récord: ${t}. Una vuelta por piloto, la más rápida.`, cQ: "¿Dónde pierdes tiempo con este coche?", cA: "Pitlane HQ graba tus vueltas en iRacing y las compara con estas, curva a curva. Es gratis." },
  pt: { recH: "Recordes do iRacing por carro e pista", recD: "As voltas mais rápidas do iRacing em cada carro e pista, de pilotos que usam o Pitlane HQ.", all: "Todas", track: "Pista", car: "Carro", record: "Recorde", drivers: "Pilotos", none: "Ainda não há voltas.",
    anon: "Anônimo", driver: "Piloto", time: "Tempo", date: "Data", nf: "Esta página não existe", nfT: "Não encontrado",
    cT: (car, track) => `${car} em ${track}: recordes e voltas mais rápidas no iRacing`, cD: (car, track, t, n) => `Recorde de ${car} em ${track}: ${t}. As ${n} voltas mais rápidas do iRacing de pilotos do Pitlane HQ, uma por piloto.`,
    cL: (t) => `Recorde: ${t}. Uma volta por piloto, a mais rápida.`, cQ: "Onde você perde tempo com este carro?", cA: "O Pitlane HQ grava suas voltas no iRacing e as compara com estas, curva a curva. É grátis." },
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

function page(l, { title, desc, path, alts, body, ld, noindex }) {
  const t = T[l], links = { tel: LAND[l].path, rec: PRE[l] + "/records" };
  const hl = alts ? LANGS.map((k) => `<link rel="alternate" hreflang="${k}" href="${SITE}${alts[k]}">`).join("") + `<link rel="alternate" hreflang="x-default" href="${SITE}${alts.en}">` : "";
  const others = alts ? LANGS.filter((k) => k !== l).map((k) => `<a href="${alts[k]}" hreflang="${k}" lang="${k}">${NAME[k]}</a>`).join("") : "";
  return `<!doctype html><html lang="${l === "pt" ? "pt-BR" : l}"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1">
<title>${esc(title)}</title><meta name="description" content="${esc(desc)}"><link rel="canonical" href="${SITE}${path}">${noindex ? '<meta name="robots" content="noindex">' : '<meta name="robots" content="index,follow,max-image-preview:large">'}
${hl}
<meta property="og:type" content="website"><meta property="og:site_name" content="Pitlane HQ"><meta property="og:locale" content="${LOCALE[l]}"><meta property="og:title" content="${esc(title)}"><meta property="og:description" content="${esc(desc)}"><meta property="og:url" content="${SITE}${path}"><meta property="og:image" content="${SITE}/og.png"><meta property="og:image:width" content="1200"><meta property="og:image:height" content="630">
<meta name="twitter:card" content="summary_large_image"><meta name="twitter:title" content="${esc(title)}"><meta name="twitter:description" content="${esc(desc)}"><meta name="twitter:image" content="${SITE}/og.png">
<meta name="theme-color" content="#11151b"><link rel="icon" href="/favicon.ico" sizes="any"><link rel="icon" href="/logo.svg" type="image/svg+xml"><link rel="apple-touch-icon" href="/icon-180.png">
<link rel="preconnect" href="https://fonts.googleapis.com"><link rel="stylesheet" href="https://fonts.googleapis.com/css2?family=Barlow+Condensed:wght@600;700&family=IBM+Plex+Sans:wght@400;500;600&family=JetBrains+Mono:wght@500;700&display=swap">
<style>${CSS}</style>${ld ? `<script type="application/ld+json">${JSON.stringify(ld).replace(/</g, "\\u003c")}</script>` : ""}</head><body>
<header><div class="w"><a class="b" href="/">${LOGO}Pitlane HQ</a><nav><a href="${links.tel}">${esc(t.tel)}</a><a href="${links.rec}">${esc(t.rec)}</a><a href="/downloads">${esc(t.dl)}</a><a href="/">${esc(t.app)}</a>${others}</nav></div></header>
<main class="w">${body}</main>
<footer><div class="w">Pitlane HQ · ${esc(t.free)} · <a href="/downloads">${esc(t.dl)}</a> · <a href="${links.rec}">${esc(t.rec)}</a> · <a href="mailto:support@pitlanehq.app">support@pitlanehq.app</a> · ${LANGS.map((k) => `<a href="${LAND[k].path}" hreflang="${k}">${NAME[k]}</a>`).join(" · ")}</div></footer></body></html>`;
}
// the breadcrumb search engines show under the result: Pitlane HQ › Records › the page
const crumbs = (items) => ({ "@context": "https://schema.org", "@type": "BreadcrumbList", itemListElement: items.map(([name, path], i) => ({ "@type": "ListItem", position: i + 1, name, item: SITE + path })) });
const html = (s, cache = 600) => new Response(s, { headers: { "content-type": "text/html; charset=utf-8", "cache-control": `public, max-age=${cache}`, "x-content-type-options": "nosniff" } });

// ---------- what Pitlane HQ does ----------
const LAND = {
  en: {
    path: "/iracing-telemetry",
    title: "iRacing telemetry and lap analysis · Pitlane HQ",
    desc: "Free iRacing telemetry: record your laps, see where you lose time and compare with faster drivers in the same car.",
    h1: "iRacing telemetry and a coach for your laps",
    lead: "Pitlane HQ records every lap you drive in iRacing and shows where you lose time: against your own best lap, against the record and against the driver just ahead of you in the same car. It is free and works on Windows, Android and the web.",
    cards: [
      ["Telemetry from every lap", "Pitlane HQ Agent runs next to iRacing and saves speed, throttle, brake, gear and steering on every lap, with nothing to set up. The laps go to your account, so you can open them later on the web or on your phone."],
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
    path: "/es/telemetria-iracing",
    title: "Telemetría para iRacing y análisis de vueltas · Pitlane HQ",
    desc: "Telemetría gratis para iRacing: graba tus vueltas, mira dónde pierdes tiempo y compárate con pilotos más rápidos con el mismo coche.",
    h1: "Telemetría para iRacing y un coach para tus vueltas",
    lead: "Pitlane HQ graba cada vuelta que das en iRacing y te enseña dónde pierdes tiempo: frente a tu mejor vuelta, frente al récord y frente al piloto que va justo por delante con el mismo coche. Es gratis y funciona en Windows, Android y la web.",
    cards: [
      ["Telemetría de cada vuelta", "Pitlane HQ Agent funciona junto a iRacing y guarda velocidad, acelerador, freno, marcha y volante en cada vuelta, sin configurar nada. Las vueltas van a tu cuenta, así que luego las abres en la web o en el móvil."],
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
  pt: {
    path: "/pt/telemetria-iracing",
    title: "Telemetria para iRacing e análise de voltas · Pitlane HQ",
    desc: "Telemetria grátis para iRacing: grave suas voltas, veja onde você perde tempo e compare com pilotos mais rápidos no mesmo carro.",
    h1: "Telemetria para iRacing e um coach para suas voltas",
    lead: "O Pitlane HQ grava cada volta que você dá no iRacing e mostra onde você perde tempo: contra a sua melhor volta, contra o recorde e contra o piloto logo à sua frente no mesmo carro. É grátis e funciona no Windows, no Android e na web.",
    cards: [
      ["Telemetria de cada volta", "O Pitlane HQ Agent roda ao lado do iRacing e salva velocidade, acelerador, freio, marcha e volante em cada volta, sem configurar nada. As voltas vão para a sua conta, então você as abre depois na web ou no celular."],
      ["Compare duas voltas", "Velocidade, pedais e a diferença de tempo ao longo da volta, o mapa da pista, os setores e os pontos de frenagem. Escolha duas voltas quaisquer: suas, de outra sessão ou do leaderboard."],
      ["Um coach com voltas reais", "Para cada carro e pista, o Pitlane HQ aprende com voltas reais de pilotos reais. O coach compara a sua volta com o recorde e com o piloto logo à frente e diz quais curvas custam mais."],
      ["Telemetria ao vivo no celular", "Enquanto você corre, veja a sua telemetria no celular ou no navegador. Compartilhe um código e um amigo ou o seu engenheiro também pode acompanhar."],
      ["Leaderboards por carro e pista", "A volta mais rápida de cada piloto em cada carro e pista, por disciplina: oval, sports car, fórmula, oval de terra e terra."],
      ["Resumo de cada corrida", "Depois de cada corrida: o seu resultado, as suas voltas, os seus incidentes e como você foi contra os pilotos ao seu redor."],
    ],
    recs: "Recordes por carro e pista", recsLead: "As voltas mais rápidas feitas com o Pitlane HQ:",
    faqT: "Perguntas",
    faq: [
      ["É grátis?", "Sim. O app do PC, a web e o app de Android são grátis."],
      ["Com quais simuladores funciona?", "Com o iRacing. Le Mans Ultimate, ACC e Assetto Corsa estão em desenvolvimento."],
      ["Do que eu preciso?", "Um PC com Windows onde você corre no iRacing, para gravar as voltas. Para vê-las, qualquer navegador ou o app de Android."],
      ["Quem vê as minhas voltas?", "As suas voltas ficam na sua conta. Nos leaderboards aparece só a sua volta mais rápida de cada carro e pista, com o seu nome público ou como Anônimo."],
      ["Qual a diferença para ver um replay?", "O replay mostra o que aconteceu; a telemetria mostra como: onde você freou, quanto acelerador usou e para onde foi o tempo, metro a metro, ao lado de uma volta mais rápida."],
    ],
    dl: "Baixar para Windows", app: "Abrir o app",
  },
};
const LAND_ALTS = { en: LAND.en.path, es: LAND.es.path, pt: LAND.pt.path };

async function topCombos(env, n) {
  const r = await env.DB.prepare(
    "SELECT track_id AS t, MAX(track) AS track, car_id AS c, MAX(car) AS car, COUNT(DISTINCT user_id) AS drivers, MIN(time) AS best, MAX(cat) AS hint, MAX(created) AS upd FROM community_laps WHERE game='iracing' AND track_id>0 AND car_id>0 AND COALESCE(shown,'')<>'model' GROUP BY track_id, car_id ORDER BY drivers DESC, best LIMIT ?1"
  ).bind(n).all().catch(() => ({ results: [] }));
  return r.results || [];
}
const recPath = (l, x) => `${PRE[l]}/records/${x.t}-${x.c}/${slug(fix(x.track) + " " + fix(x.car))}`;
const recAlts = (x) => ({ en: recPath("en", x), es: recPath("es", x), pt: recPath("pt", x) });

async function landing(env, l) {
  const L = LAND[l], combos = await topCombos(env, 8);
  const body = `<h1>${esc(L.h1)}</h1><p class="lead">${esc(L.lead)}</p>
<div class="cta"><a class="btn p" href="/dl/PitlaneHQ-Setup.exe">${esc(L.dl)}</a><a class="btn" href="/">${esc(L.app)}</a></div>
<div class="g">${L.cards.map(([h, p]) => `<section class="c"><h3>${esc(h)}</h3><p>${esc(p)}</p></section>`).join("")}</div>
${combos.length ? `<h2>${esc(L.recs)}</h2><p class="m">${esc(L.recsLead)}</p><table><tbody>${combos.map((x) => `<tr><td><a href="${recPath(l, x)}">${esc(fix(x.track))}</a></td><td class="m">${esc(fix(x.car))}</td><td class="t">${fmt(x.best)}</td></tr>`).join("")}</tbody></table><p><a href="${PRE[l]}/records">${esc(T[l].rec)} →</a></p>` : ""}
<h2>${esc(L.faqT)}</h2>${L.faq.map(([q, a]) => `<details><summary>${esc(q)}</summary><p>${esc(a)}</p></details>`).join("")}`;
  const ld = [
    { "@context": "https://schema.org", "@type": "SoftwareApplication", name: "Pitlane HQ", url: SITE + "/", applicationCategory: "SportsApplication", operatingSystem: "Windows, Android, Web", description: L.desc, image: SITE + "/og.png", inLanguage: l, offers: { "@type": "Offer", price: "0", priceCurrency: "USD" } },
    { "@context": "https://schema.org", "@type": "WebSite", name: "Pitlane HQ", url: SITE + "/", inLanguage: l },
    { "@context": "https://schema.org", "@type": "Organization", name: "Pitlane HQ", url: SITE + "/", logo: SITE + "/icon-512.png", email: "support@pitlanehq.app" },
    { "@context": "https://schema.org", "@type": "FAQPage", mainEntity: L.faq.map(([q, a]) => ({ "@type": "Question", name: q, acceptedAnswer: { "@type": "Answer", text: a } })) },
  ];
  return html(page(l, { title: L.title, desc: L.desc, path: L.path, alts: LAND_ALTS, body, ld }));
}

// ---------- the leaderboards ----------
async function recordsIndex(env, l, cat) {
  const all = await topCombos(env, 1000), cm = await catMap(env).catch(() => ({ tc: {}, c: {} }));
  const rows = all.map((x) => ({ ...x, cat: catOf(cm, x.t, x.c, x.hint, x.track, x.car) }));
  const cats = Object.keys(CAT.en).filter((k) => rows.some((x) => x.cat === k));
  const list = cat ? rows.filter((x) => x.cat === cat) : rows;
  const W = S[l], base = PRE[l] + "/records", q = cat ? "?d=" + cat : "", path = base + q;
  const title = `${W.recH}${cat ? " · " + CAT[l][cat] : ""} · Pitlane HQ`, desc = W.recD;
  const body = `<h1>${esc(W.recH)}</h1><p class="lead">${esc(desc)}</p>
<div class="cats"><a href="${base}"${cat ? "" : ' class="on"'}>${esc(W.all)}</a>${cats.map((k) => `<a href="${base}?d=${k}"${k === cat ? ' class="on"' : ""}>${esc(CAT[l][k])}</a>`).join("")}</div>
${list.length ? `<table><thead><tr><th>${esc(W.track)}</th><th>${esc(W.car)}</th><th>${esc(W.record)}</th><th>${esc(W.drivers)}</th></tr></thead><tbody>${list.map((x) => `<tr><td><a href="${recPath(l, x)}">${esc(fix(x.track))}</a></td><td class="m">${esc(fix(x.car))}</td><td class="t">${fmt(x.best)}</td><td class="m">${x.drivers}</td></tr>`).join("")}</tbody></table>` : `<p class="m">${esc(W.none)}</p>`}`;
  const ld = [crumbs([["Pitlane HQ", LAND[l].path], [T[l].rec, base]]),
    { "@context": "https://schema.org", "@type": "ItemList", name: W.recH, itemListElement: list.slice(0, 100).map((x, i) => ({ "@type": "ListItem", position: i + 1, url: SITE + recPath(l, x), name: fix(x.car) + " · " + fix(x.track) })) }];
  return html(page(l, { title, desc, path, alts: { en: "/records" + q, es: "/es/records" + q, pt: "/pt/records" + q }, body, ld }));
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
  const W = S[l], x = { t, c, track, car }, rec = fmt(laps[0].time);
  const title = W.cT(car, track), desc = W.cD(car, track, rec, laps.length);
  const body = `<p class="m"><a href="${PRE[l]}/records">${esc(T[l].rec)}</a> · <a href="${PRE[l]}/records?d=${cat}">${esc(CAT[l][cat] || "")}</a></p>
<h1>${esc(car)}<br><span class="m" style="font-size:.7em">${esc(track)}</span></h1>
<p class="lead">${esc(W.cL(rec))}</p>
<table><thead><tr><th class="n">#</th><th>${esc(W.driver)}</th><th>${esc(W.time)}</th><th>${esc(W.date)}</th></tr></thead><tbody>${laps.map((v, i) => `<tr><td class="n">${i + 1}</td><td>${esc(v.alias || W.anon)}</td><td class="t">${fmt(v.time)}</td><td class="m">${d(v.created)}</td></tr>`).join("")}</tbody></table>
<div class="c" style="margin-top:22px"><h3>${esc(W.cQ)}</h3><p>${esc(W.cA)}</p><div class="cta" style="margin-bottom:0"><a class="btn p" href="/dl/PitlaneHQ-Setup.exe">${esc(LAND[l].dl)}</a><a class="btn" href="${LAND[l].path}">${esc(T[l].tel)}</a></div></div>`;
  const ld = [crumbs([["Pitlane HQ", LAND[l].path], [T[l].rec, PRE[l] + "/records"], [car + " · " + track, recPath(l, x)]])];
  return html(page(l, { title, desc, path: recPath(l, x), alts: recAlts(x), body, ld }));
}

// an address of the public pages that does not exist: a real 404 (never the app), so it is not indexed
const notFound = (l) => new Response(page(l, { title: S[l].nfT + " · Pitlane HQ", desc: "", path: PRE[l] + "/records", noindex: true,
  body: `<h1>${esc(S[l].nf)}</h1><p><a href="${PRE[l]}/records">${esc(T[l].rec)}</a> · <a href="/">${esc(T[l].app)}</a></p>` }),
  { status: 404, headers: { "content-type": "text/html; charset=utf-8", "x-robots-tag": "noindex" } });

async function sitemap(env) {
  const combos = await topCombos(env, 2000), day = (v) => (v > 0 ? new Date(v).toISOString().slice(0, 10) : "");
  // every page with its two other languages (xhtml:link), as search engines like them
  const u = (p, f, pr, alts, mod) => `<url><loc>${SITE}${p}</loc>${mod ? `<lastmod>${mod}</lastmod>` : ""}<changefreq>${f}</changefreq><priority>${pr}</priority>${alts ? LANGS.map((k) => `<xhtml:link rel="alternate" hreflang="${k}" href="${SITE}${alts[k]}"/>`).join("") + `<xhtml:link rel="alternate" hreflang="x-default" href="${SITE}${alts.en}"/>` : ""}</url>`;
  const newest = day(Math.max(0, ...combos.map((x) => x.upd || 0)));
  const recAll = { en: "/records", es: "/es/records", pt: "/pt/records" };
  const s = [u("/", "weekly", "1.0", null, newest)];
  for (const k of LANGS) s.push(u(LAND_ALTS[k], "weekly", k === "en" ? "0.9" : "0.8", LAND_ALTS, newest));
  for (const k of LANGS) s.push(u(recAll[k], "daily", k === "en" ? "0.8" : "0.7", recAll, newest));
  s.push(u("/downloads", "weekly", "0.7"), u("/changelog", "weekly", "0.4"));
  for (const x of combos) { const a = recAlts(x); for (const k of LANGS) s.push(u(a[k], "daily", k === "en" ? "0.6" : "0.5", a, day(x.upd))); }
  return new Response(`<?xml version="1.0" encoding="UTF-8"?>\n<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9" xmlns:xhtml="http://www.w3.org/1999/xhtml">\n${s.join("\n")}\n</urlset>\n`, { headers: { "content-type": "application/xml; charset=utf-8", "cache-control": "public, max-age=3600" } });
}

// IndexNow: Bing (and through it DuckDuckGo, Yandex…) hears at once about new and changed pages. The key is
// public by design (search engines read it at /<key>.txt); it only proves the pings come from this site.
const INDEXNOW_KEY = "1fbc105af121e0dcfc14e13a8740813a";
// SEO_VER: raised when the public pages change (new languages, new addresses): every page is sent again once
const SEO_VER = "3";
export async function indexNow(env) {
  const row = await env.DB.prepare("SELECT v FROM app_state WHERE k='indexnow_at'").first().catch(() => null);
  const ver = await env.DB.prepare("SELECT v FROM app_state WHERE k='indexnow_ver'").first().catch(() => null);
  const full = !ver || ver.v !== SEO_VER;
  let last = full ? 0 : +((row && row.v) || 0);
  if (!full && Date.now() - last < 20 * 3600e3) return; // once a day
  const fresh = await env.DB.prepare(
    "SELECT track_id AS t, MAX(track) AS track, car_id AS c, MAX(car) AS car FROM community_laps WHERE game='iracing' AND track_id>0 AND car_id>0 AND created>?1 GROUP BY track_id, car_id LIMIT 4000"
  ).bind(last).all().catch(() => ({ results: [] }));
  const urls = [];
  if (!last) urls.push("/", ...Object.values(LAND_ALTS), "/records", "/es/records", "/pt/records", "/downloads", "/changelog");
  else if ((fresh.results || []).length) urls.push("/records", "/es/records", "/pt/records");
  for (const x of fresh.results || []) urls.push(...Object.values(recAlts(x)));
  if (urls.length) {
    const r = await fetch("https://api.indexnow.org/indexnow", { method: "POST", headers: { "content-type": "application/json; charset=utf-8" },
      body: JSON.stringify({ host: "pitlanehq.app", key: INDEXNOW_KEY, keyLocation: `${SITE}/${INDEXNOW_KEY}.txt`, urlList: urls.slice(0, 10000).map((u) => SITE + u) }) }).catch(() => null);
    if (!r || r.status >= 300) return; // try again on the next run
  }
  await env.DB.prepare("INSERT INTO app_state (k, v, at) VALUES ('indexnow_at', ?1, ?1) ON CONFLICT(k) DO UPDATE SET v=excluded.v, at=excluded.at").bind(String(Date.now())).run().catch(() => {});
  if (full) await env.DB.prepare("INSERT INTO app_state (k, v, at) VALUES ('indexnow_ver', ?1, ?2) ON CONFLICT(k) DO UPDATE SET v=excluded.v, at=excluded.at").bind(SEO_VER, Date.now()).run().catch(() => {});
}

/** The public pages, or null when the address is not one of them. */
export async function seoPage(req, env, url) {
  if (req.method !== "GET" && req.method !== "HEAD") return null;
  const p = url.pathname.replace(/\/+$/, "") || "/";
  if (p === "/sitemap.xml") return sitemap(env);
  if (p === "/" + INDEXNOW_KEY + ".txt") return new Response(INDEXNOW_KEY, { headers: { "content-type": "text/plain; charset=utf-8" } });
  if (p === "/iracing-telemetry" || p === "/telemetry") return landing(env, "en");
  if (p === "/es/telemetria-iracing" || p === "/es/telemetria" || p === "/es") return landing(env, "es");
  if (p === "/pt/telemetria-iracing" || p === "/pt/telemetria" || p === "/pt" || p === "/pt-br") return landing(env, "pt");
  const dsc = url.searchParams.get("d"), cat = CAT.en[dsc] ? dsc : "";
  if (p === "/records") return recordsIndex(env, "en", cat);
  if (p === "/es/records") return recordsIndex(env, "es", cat);
  if (p === "/pt/records") return recordsIndex(env, "pt", cat);
  const m = /^(?:\/(es|pt))?\/records\/(\d+)-(\d+)(?:\/[a-z0-9-]*)?$/.exec(p);
  if (m) return (await recordsCombo(env, m[1] || "en", +m[2], +m[3], p)) || notFound(m[1] || "en");
  if (/^(\/(es|pt))?\/records\//.test(p)) return notFound(p.startsWith("/es") ? "es" : p.startsWith("/pt") ? "pt" : "en");
  return null;
}
