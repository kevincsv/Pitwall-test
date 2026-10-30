// Public pages for search engines and for people who arrive from them, rendered here as plain HTML
// (no app, no sign-in): what Pitlane HQ does for iRacing and for Le Mans Ultimate, in English, Spanish and Portuguese
// (each page names the other two with hreflang), the guides, the leagues and the leaderboards of every car and track.
// The app stays at "/"; these pages link to it, to each other and to the downloads.
// Leaderboards show the accounts' nicknames (never their iRacing names) ; race rivals (who did not join Pitlane HQ) and
// anonymous laps are "Anonymous". A page about Le Mans Ultimate's leagues or records exists only while
// there is something to show (never an empty page indexed). No text joins two phrases with a colon.
import { catMap, catOf } from "./categories.js";
import { famId, famName } from "./carfamily.js";
import { TOPICS, GUIDES } from "./seo-topics.js";
import { foundLeagues } from "./leaguescan.js";

const SITE = "https://pitlanehq.app";
// SEO_VER: raised when the public pages change (new languages, new addresses, new texts): every page is sent to
// IndexNow again once. SEO_DATE: the day their texts last changed, the sitemap's lastmod of the pages without data.
const SEO_VER = "11", SEO_DATE = "2026-10-28";
const esc = (s) => String(s ?? "").replace(/[&<>"]/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" })[c]);
const slug = (s) => String(s || "").toLowerCase().normalize("NFD").replace(/[̀-ͯ]/g, "").replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "").slice(0, 80);
const fmt = (t) => { if (!(t > 0)) return "–"; const m = Math.floor(t / 60), s = t - m * 60; return (m ? m + ":" + (s < 10 ? "0" : "") : "") + s.toFixed(3); };
const cap = (s) => String(s || "").charAt(0).toUpperCase() + String(s || "").slice(1);
const day = (v) => (v > 0 ? new Date(v).toISOString().slice(0, 10) : "");
// text that came through a wrong encoding ("AutÃ³dromo") read back as it was written
const fix = (s) => { s = String(s || ""); if (!/[ÃÂ]/.test(s)) return s; try { return decodeURIComponent(escape(s)); } catch (e) { return s; } };
// the three languages of the public pages: English at the root, Spanish under /es, Portuguese (Brazil) under /pt
const LANGS = ["en", "es", "pt"], PRE = { en: "", es: "/es", pt: "/pt" }, NAME = { en: "English", es: "Español", pt: "Português" };
const LOCALE = { en: "en_US", es: "es_ES", pt: "pt_BR" }, HLANG = { en: "en", es: "es", pt: "pt-BR" };
const altsOf = (o) => ({ en: o.en.path, es: o.es.path, pt: o.pt.path });
// the two games the public pages speak of
const GNAME = { iracing: "iRacing", lmu: "Le Mans Ultimate" }, GSHORT = { iracing: "iRacing", lmu: "LMU" };
// a record page's title: the whole game's name while it fits about 60 characters, else the short one, else none
// (the car and the description say the game)
const recTitle = (W, car, track, game) => [W.cT(car, track, GNAME[game]), W.cT(car, track, GSHORT[game]), W.cT(car, track, GSHORT[game], true)].find((x) => x.length <= 60) || W.cTs(car, track);
const CAT = {
  en: { oval: "Oval", sports_car: "Sports Car", formula_car: "Formula Car", dirt_oval: "Dirt Oval", dirt_road: "Dirt Road" },
  es: { oval: "Óvalo", sports_car: "Sports Car", formula_car: "Fórmula", dirt_oval: "Óvalo de tierra", dirt_road: "Tierra" },
  pt: { oval: "Oval", sports_car: "Sports Car", formula_car: "Fórmula", dirt_oval: "Oval de terra", dirt_road: "Terra" },
};
const T = {
  en: { tel: { iracing: "iRacing telemetry", lmu: "LMU telemetry" }, lmuH: "Le Mans Ultimate", ov: "Overlays", lgs: "Leagues", rec: "Records", dl: "Download", app: "Open the app",
    free: "Free · Windows, Android and the web", other: { iracing: "Racing in Le Mans Ultimate?", lmu: "Racing in iRacing too?" } },
  es: { tel: { iracing: "Telemetría iRacing", lmu: "Telemetría LMU" }, lmuH: "Le Mans Ultimate", ov: "Overlays", lgs: "Ligas", rec: "Récords", dl: "Descargar", app: "Abrir la app",
    free: "Gratis · Windows, Android y web", other: { iracing: "¿Corres en Le Mans Ultimate?", lmu: "¿También corres en iRacing?" } },
  pt: { tel: { iracing: "Telemetria iRacing", lmu: "Telemetria LMU" }, lmuH: "Le Mans Ultimate", ov: "Overlays", lgs: "Ligas", rec: "Recordes", dl: "Baixar", app: "Abrir o app",
    free: "Grátis · Windows, Android e web", other: { iracing: "Corre no Le Mans Ultimate?", lmu: "Também corre no iRacing?" } },
};
// the words of the records pages (gn: the game's name)
const S = {
  en: { recH: (gn) => `${gn} lap records by car and track`, recD: (gn) => `The fastest ${gn} laps on every car and track, one per driver, from drivers who use Pitlane HQ. Open a record to see its leaderboard.`,
    howT: "How a lap gets here", how: (gn) => `Pitlane HQ Agent shares each driver's fastest valid lap of every car and track in ${gn} by itself, under their public name or as Anonymous. A lap off the track, with a lost connection or not round the whole circuit never counts.`,
    faq: (gn) => [[`How does my ${gn} lap get on these records?`, `Install Pitlane HQ Agent on the PC where you race and drive. Your fastest valid lap of each car and track goes up by itself.`],
      ["Can I compare my lap with a record?", "Yes. Open the record in Community → Leaderboards and compare it with your own lap of the same track, corner by corner."],
      ["Can I stay anonymous?", "Yes. Choose Anonymous in your account and your laps show without a name."]],
    all: "All", track: "Track", car: "Car", record: "Record", drivers: "Drivers", none: "No laps yet.",
    anon: "Anonymous", driver: "Driver", time: "Time", date: "Date", nf: "This page does not exist", nfT: "Not found",
    cT: (car, track, gn, short) => `${car} at ${track} · ${gn}${short ? "" : " lap"} records`, cTs: (car, track) => `${car} at ${track} lap records`, cD: (car, track, t, n, gn) => `The ${car} lap record at ${track} is ${t}. ${n === 1 ? `The only ${gn} lap from Pitlane HQ drivers so far.` : `The ${n} fastest ${gn} laps from Pitlane HQ drivers, one per driver.`}`,
    cL: (t) => `The record is ${t}. One lap per driver, their fastest.`, cQ: "Where do you lose time in this car?", cA: (gn) => `Pitlane HQ records your ${gn} laps and compares them with these, corner by corner. It is free.` },
  es: { recH: (gn) => `Récords de ${gn} por coche y circuito`, recD: (gn) => `Las vueltas más rápidas de ${gn} en cada coche y circuito, una por piloto, de pilotos que usan Pitlane HQ. Abre un récord para ver su clasificación.`,
    howT: "Cómo llega aquí una vuelta", how: (gn) => `Pitlane HQ Agent comparte sola la vuelta válida más rápida de cada piloto en cada coche y circuito de ${gn}, con su nombre público o como Anónimo. Una vuelta fuera de pista, con la conexión perdida o que no da la vuelta entera al circuito nunca cuenta.`,
    faq: (gn) => [[`¿Cómo entra mi vuelta de ${gn} en estos récords?`, `Instala Pitlane HQ Agent en el PC donde corres y conduce. Tu vuelta válida más rápida de cada coche y circuito sube sola.`],
      ["¿Puedo comparar mi vuelta con un récord?", "Sí. Abre el récord en Comunidad → Clasificaciones y compáralo con tu propia vuelta del mismo circuito, curva a curva."],
      ["¿Puedo salir como anónimo?", "Sí. Elige Anónimo en tu cuenta y tus vueltas salen sin nombre."]],
    all: "Todas", track: "Circuito", car: "Coche", record: "Récord", drivers: "Pilotos", none: "Aún no hay vueltas.",
    anon: "Anónimo", driver: "Piloto", time: "Tiempo", date: "Fecha", nf: "Esta página no existe", nfT: "No encontrado",
    cT: (car, track, gn) => `${car} en ${track} · récords de ${gn}`, cTs: (car, track) => `Récords de ${car} en ${track}`, cD: (car, track, t, n, gn) => `El récord de ${car} en ${track} es ${t}. ${n === 1 ? `La única vuelta de ${gn} de pilotos de Pitlane HQ por ahora.` : `Las ${n} vueltas más rápidas de ${gn} de pilotos de Pitlane HQ, una por piloto.`}`,
    cL: (t) => `El récord es ${t}. Una vuelta por piloto, la más rápida.`, cQ: "¿Dónde pierdes tiempo con este coche?", cA: (gn) => `Pitlane HQ graba tus vueltas en ${gn} y las compara con estas, curva a curva. Es gratis.` },
  pt: { recH: (gn) => `Recordes do ${gn} por carro e pista`, recD: (gn) => `As voltas mais rápidas do ${gn} em cada carro e pista, uma por piloto, de pilotos que usam o Pitlane HQ. Abra um recorde para ver a classificação.`,
    howT: "Como uma volta chega aqui", how: (gn) => `O Pitlane HQ Agent compartilha sozinho a volta válida mais rápida de cada piloto em cada carro e pista do ${gn}, com o nome público ou como Anônimo. Uma volta fora da pista, com a conexão perdida ou que não dá a volta inteira no circuito nunca conta.`,
    faq: (gn) => [[`Como minha volta do ${gn} entra nestes recordes?`, `Instale o Pitlane HQ Agent no PC onde você corre e pilote. Sua volta válida mais rápida de cada carro e pista sobe sozinha.`],
      ["Posso comparar minha volta com um recorde?", "Sim. Abra o recorde em Comunidade → Classificações e compare com a sua própria volta da mesma pista, curva a curva."],
      ["Posso aparecer como anônimo?", "Sim. Escolha Anônimo na sua conta e suas voltas aparecem sem nome."]],
    all: "Todas", track: "Pista", car: "Carro", record: "Recorde", drivers: "Pilotos", none: "Ainda não há voltas.",
    anon: "Anônimo", driver: "Piloto", time: "Tempo", date: "Data", nf: "Esta página não existe", nfT: "Não encontrado",
    cT: (car, track, gn) => `${car} em ${track} · recordes do ${gn}`, cTs: (car, track) => `Recordes de ${car} em ${track}`, cD: (car, track, t, n, gn) => `O recorde de ${car} em ${track} é ${t}. ${n === 1 ? `A única volta do ${gn} de pilotos do Pitlane HQ por enquanto.` : `As ${n} voltas mais rápidas do ${gn} de pilotos do Pitlane HQ, uma por piloto.`}`,
    cL: (t) => `O recorde é ${t}. Uma volta por piloto, a mais rápida.`, cQ: "Onde você perde tempo com este carro?", cA: (gn) => `O Pitlane HQ grava suas voltas no ${gn} e as compara com estas, curva a curva. É grátis.` },
};
const LOGO = `<svg viewBox="0 0 512 512" width="30" height="30" aria-hidden="true"><defs><linearGradient id="g" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="#1f2733"/><stop offset="1" stop-color="#0d1116"/></linearGradient></defs><rect x="16" y="16" width="480" height="480" rx="112" fill="url(#g)"/><path d="M149.9 382.1A150 150 0 1 1 362.1 382.1" fill="none" stroke="#ffb02e" stroke-width="48" stroke-dasharray="460 1000"/><path d="M149.9 382.1A150 150 0 1 1 362.1 382.1" fill="none" stroke="#f2f4f7" stroke-width="48" stroke-dasharray="0 460 247 1000"/><path d="M149.9 382.1A150 150 0 1 1 362.1 382.1" fill="none" stroke="#ffb02e" stroke-width="48" stroke-dasharray="0 460 31 31 31 31 31 31 31 31 1000"/><path d="M188.1 343.9A96 96 0 1 1 323.9 343.9" fill="none" stroke="#2f3a48" stroke-width="10" stroke-linecap="round"/><path d="M256 276L330 188" stroke="#f2f4f7" stroke-width="20" stroke-linecap="round"/><circle cx="256" cy="276" r="30" fill="#f2f4f7"/><circle cx="256" cy="276" r="12" fill="#ffb02e"/></svg>`;
// the whole style inline (nothing to fetch before the first paint); the fonts arrive after it without blocking the page,
// the system's fonts standing in meanwhile
const FONTS = "https://fonts.googleapis.com/css2?family=Barlow+Condensed:wght@700&family=IBM+Plex+Sans:wght@400;600&family=JetBrains+Mono:wght@500&display=swap";
const CSS = `:root{--bg:#11151b;--card:#1a2029;--line:#2b3542;--fg:#e7ebf1;--mut:#9aa6b8;--acc:#ffb02e;--hd:'Barlow Condensed','Arial Narrow',sans-serif}*{box-sizing:border-box}
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

// the screenshots of the app (web/dist/landing/<lang>/, the same ones the landing shows) with their size, so the
// page never moves while they load
const SHOT = { "board.jpg": [2880, 1040], "coach.jpg": [2880, 1040], "compare.jpg": [2880, 1000], "laps.jpg": [2880, 880], "live.jpg": [2880, 1600], "race.jpg": [2220, 1520],
  "m-analysis-0.png": [540, 1060], "m-analysis-1.png": [540, 1060], "m-live.png": [540, 1060], "m-race.png": [540, 1060],
  "ov-g-inputs.png": [560, 262], "ov-g-timing.png": [440, 154], "ov-g-tyres.png": [420, 214], "ov-l-brakes.png": [480, 138], "ov-l-coach.png": [520, 76],
  "ov-s-sectors.png": [560, 146], "ov-trackbar.png": [700, 62], "ov-weather.png": [360, 196] };
const imgSrc = (l, f) => `/landing/${l}/${f}`;
const img = (l, f, alt) => { const [w, h] = SHOT[f] || [1200, 600]; return `<img src="${imgSrc(l, f)}" alt="${esc(alt)}" width="${w}" height="${h}" loading="lazy" decoding="async">`; };
const SHOT_ALT = { en: { "coach.jpg": "The Pitlane HQ coach", "compare.jpg": "Two laps compared in Pitlane HQ", "laps.jpg": "The laps of a session in Pitlane HQ", "race.jpg": "A race summary in Pitlane HQ", "m-live.png": "Live telemetry on the phone", "m-race.png": "A race summary on the phone", "m-analysis-0.png": "The laps on the phone" },
  es: { "coach.jpg": "El coach de Pitlane HQ", "compare.jpg": "Dos vueltas comparadas en Pitlane HQ", "laps.jpg": "Las vueltas de una sesión en Pitlane HQ", "race.jpg": "Un resumen de carrera en Pitlane HQ", "m-live.png": "Telemetría en vivo en el móvil", "m-race.png": "Un resumen de carrera en el móvil", "m-analysis-0.png": "Las vueltas en el móvil" },
  pt: { "coach.jpg": "O coach do Pitlane HQ", "compare.jpg": "Duas voltas comparadas no Pitlane HQ", "laps.jpg": "As voltas de uma sessão no Pitlane HQ", "race.jpg": "Um resumo de corrida no Pitlane HQ", "m-live.png": "Telemetria ao vivo no celular", "m-race.png": "Um resumo de corrida no celular", "m-analysis-0.png": "As voltas no celular" } };
const shot = (l, f) => `<figure class="shot">${img(l, f, SHOT_ALT[l][f] || "Pitlane HQ")}</figure>`;
const phones = (l, list) => `<div class="phs">${list.map((f) => `<figure>${img(l, f, SHOT_ALT[l][f] || "Pitlane HQ")}<figcaption>${esc(SHOT_ALT[l][f] || "")}</figcaption></figure>`).join("")}</div>`;

// what is there of Le Mans Ultimate (its leagues, its records): its pages and links exist only then. Read once per
// request, kept a few minutes per server
let HAS = { lmuLeagues: false, lmuRecords: false };
const HAS_MEMO = new WeakMap();
async function readHas(env) {
  const m = HAS_MEMO.get(env);
  if (m && Date.now() - m.at < 5 * 60e3) return (HAS = m.has);
  const [lg, rc] = await Promise.all([leaguesData(env, "lmu").then((D) => D.posted.length + D.found.length).catch(() => 0), topCombos(env, 1, "lmu").then((x) => x.length).catch(() => 0)]);
  const has = { lmuLeagues: lg > 0, lmuRecords: rc > 0 };
  HAS_MEMO.set(env, { at: Date.now(), has });
  return (HAS = has);
}

const TOPIC_BY = Object.fromEntries(TOPICS.map((x) => [x.id, x]));
// the guides of both games that the Le Mans Ultimate pages list too
const LMU_TOO = ["phone", "free"];
// their names on the Le Mans Ultimate pages, without the iRacing of their h1
const LMU_TOO_H = { phone: { en: "Telemetry on your phone", es: "La telemetría en tu móvil", pt: "A telemetria no seu celular" },
  free: { en: "Free telemetry", es: "Telemetría gratis", pt: "Telemetria grátis" } };
const lmuToo = (l) => LMU_TOO.map((id) => ({ ...TOPIC_BY[id][l], h1: LMU_TOO_H[id][l] }));
// the Le Mans Ultimate pages a page links to (only the ones that exist)
const lmuLinks = (l) => [[LANDL[l].path, LANDL[l].h1], [OVLL[l].path, OVLL[l].h1], ...TOPICS.filter((x) => x.game === "lmu").map((x) => [x[l].path, x[l].h1]),
  ...(HAS.lmuLeagues ? [[LEAGL[l].path, LEAGL[l].h1]] : []), ...(HAS.lmuRecords ? [[REC_IDX.lmu[l], S[l].recH(GNAME.lmu)]] : [])];
const iracingLinks = (l) => [...TOPICS.filter((x) => x.game !== "lmu").map((x) => [x[l].path, x[l].h1]), [OVL[l].path, OVL[l].h1], [LEAG[l].path, LEAG[l].h1], [REC_IDX.iracing[l], S[l].recH(GNAME.iracing)]];

function page(l, { title, desc, path, alts, body, ld, noindex, game = "iracing" }) {
  const t = T[l], other = game === "lmu" ? "iracing" : "lmu";
  const lg = game === "lmu" && HAS.lmuLeagues ? LEAGL[l].path : LEAG[l].path, rc = game === "lmu" && HAS.lmuRecords ? REC_IDX.lmu[l] : REC_IDX.iracing[l];
  const hl = alts ? LANGS.map((k) => `<link rel="alternate" hreflang="${HLANG[k]}" href="${SITE}${alts[k]}">`).join("") + `<link rel="alternate" hreflang="x-default" href="${SITE}${alts.en}">` : "";
  const others = alts ? LANGS.filter((k) => k !== l).map((k) => `<a href="${alts[k]}" hreflang="${HLANG[k]}" lang="${HLANG[k]}">${NAME[k]}</a>`).join("") : "";
  const og = `${SITE}/og${l === "en" ? "" : "-" + l}.png`;
  return `<!doctype html><html lang="${HLANG[l]}"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1">
<title>${esc(title)}</title><meta name="description" content="${esc(desc)}">${path ? `<link rel="canonical" href="${SITE}${path}">` : ""}${noindex ? '<meta name="robots" content="noindex,follow">' : '<meta name="robots" content="index,follow,max-image-preview:large">'}
${hl}
<meta property="og:type" content="website"><meta property="og:site_name" content="Pitlane HQ"><meta property="og:locale" content="${LOCALE[l]}"><meta property="og:title" content="${esc(title)}"><meta property="og:description" content="${esc(desc)}">${path ? `<meta property="og:url" content="${SITE}${path}">` : ""}<meta property="og:image" content="${og}"><meta property="og:image:width" content="1200"><meta property="og:image:height" content="630"><meta property="og:image:alt" content="Pitlane HQ">
<meta name="twitter:card" content="summary_large_image"><meta name="twitter:title" content="${esc(title)}"><meta name="twitter:description" content="${esc(desc)}"><meta name="twitter:image" content="${og}">
<meta name="theme-color" content="#11151b"><link rel="icon" href="/favicon.ico" sizes="any"><link rel="icon" href="/logo.svg" type="image/svg+xml"><link rel="apple-touch-icon" href="/icon-180.png">
<style>${CSS}</style><link rel="preconnect" href="https://fonts.googleapis.com"><link rel="preconnect" href="https://fonts.gstatic.com" crossorigin><link rel="stylesheet" href="${FONTS}" media="print" onload="this.media='all'"><noscript><link rel="stylesheet" href="${FONTS}"></noscript>
${ld ? `<script type="application/ld+json">${JSON.stringify(ld).replace(/</g, "\\u003c")}</script>` : ""}</head><body>
<header><div class="w"><a class="b" href="/">${LOGO}Pitlane HQ</a><nav><a href="${(game === "lmu" ? LANDL : LAND)[l].path}">${esc(t.tel[game])}</a><a href="${(game === "lmu" ? OVLL : OVL)[l].path}">${esc(t.ov)}</a><a href="${lg}">${esc(t.lgs)}</a><a href="${rc}">${esc(t.rec)}</a><a href="${(other === "lmu" ? LANDL : LAND)[l].path}">${esc(GNAME[other])}</a><a href="/downloads">${esc(t.dl)}</a><a href="/">${esc(t.app)}</a>${others}</nav></div></header>
<main class="w">${body}</main>
<footer><div class="w"><p class="m">${esc(GUIDES[l])} · iRacing · ${iracingLinks(l).map(([p, h]) => `<a href="${p}">${esc(h)}</a>`).join(" · ")}</p><p class="m">${esc(t.lmuH)} · ${lmuLinks(l).map(([p, h]) => `<a href="${p}">${esc(h)}</a>`).join(" · ")}</p>Pitlane HQ · ${esc(t.free)} · <a href="/downloads">${esc(t.dl)}</a> · <a href="mailto:support@pitlanehq.app">support@pitlanehq.app</a> · ${LANGS.map((k) => `<a href="${LAND[k].path}" hreflang="${HLANG[k]}">${NAME[k]}</a>`).join(" · ")}</div></footer></body></html>`;
}
// the breadcrumb search engines show under the result: Pitlane HQ › Records › the page
const crumbs = (items) => ({ "@context": "https://schema.org", "@type": "BreadcrumbList", itemListElement: items.map(([name, path], i) => ({ "@type": "ListItem", position: i + 1, name, item: SITE + path })) });
const faqLd = (faq) => ({ "@context": "https://schema.org", "@type": "FAQPage", mainEntity: faq.map(([q, a]) => ({ "@type": "Question", name: q, acceptedAnswer: { "@type": "Answer", text: a } })) });
// the app, as search engines like it described (never a rating: Pitlane HQ has none to show)
const appLd = (l, desc, shots) => ({ "@context": "https://schema.org", "@type": "SoftwareApplication", "@id": SITE + "/#app", name: "Pitlane HQ", alternateName: ["PitlaneHQ", "Pitlane HQ Agent"], url: SITE + "/",
  applicationCategory: "SportsApplication", applicationSubCategory: "Sim racing telemetry", operatingSystem: "Windows, Android, Web", description: desc, inLanguage: HLANG[l], image: `${SITE}/og${l === "en" ? "" : "-" + l}.png`,
  ...(shots && shots.length ? { screenshot: shots.map((f) => ({ "@type": "ImageObject", url: SITE + imgSrc(l, f), width: (SHOT[f] || [])[0], height: (SHOT[f] || [])[1] })) } : {}),
  offers: { "@type": "Offer", price: "0", priceCurrency: "USD" }, publisher: { "@id": SITE + "/#org" } });
const siteLd = (l) => [
  { "@context": "https://schema.org", "@type": "WebSite", "@id": SITE + "/#website", name: "Pitlane HQ", alternateName: ["PitlaneHQ", "Pitlane"], url: SITE + "/", inLanguage: HLANG[l], publisher: { "@id": SITE + "/#org" } },
  { "@context": "https://schema.org", "@type": "Organization", "@id": SITE + "/#org", name: "Pitlane HQ", alternateName: "PitlaneHQ", url: SITE + "/", logo: SITE + "/icon-512.png", email: "support@pitlanehq.app" },
];
// a weak validator of the page (FNV-1a), so a browser or a robot that has it gets 304
const etagOf = (s) => { let h = 0x811c9dc5; for (let i = 0; i < s.length; i++) { h ^= s.charCodeAt(i); h = Math.imul(h, 0x01000193); } return `W/"${(h >>> 0).toString(36)}-${s.length.toString(36)}"`; };
const html = (s, cache = 600, status = 200) => new Response(s, { status, headers: { "content-type": "text/html; charset=utf-8", "cache-control": `public, max-age=${cache}, stale-while-revalidate=86400`, etag: etagOf(s), "x-content-type-options": "nosniff" } });
const cross = (l, game) => { const o = game === "lmu" ? LAND[l] : LANDL[l]; return `<p class="x">${esc(T[l].other[game])} <a href="${o.path}">${esc(o.h1)} →</a></p>`; };

// ---------- what Pitlane HQ does, for iRacing ----------
const LAND = {
  en: {
    path: "/iracing-telemetry",
    title: "iRacing telemetry, lap analysis and overlays · Pitlane HQ",
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
      ["Overlays on top of the game", "Relative, standings, radar, delta bar, fuel, tyres, track map, flags, a live coach and more, drawn by Pitlane HQ Agent over iRacing and also shown in VR."],
    ],
    recs: "Records by car and track", recsLead: "The fastest laps driven with Pitlane HQ.",
    faqT: "Questions",
    faq: [
      ["What is Pitlane HQ?", "Pitlane HQ (also written PitlaneHQ) is a free sim racing telemetry app for iRacing and Le Mans Ultimate. Pitlane HQ Agent records your laps on Windows, and the web and the phone app show them with a coach, leaderboards and overlays."],
      ["Is it free?", "Yes. The telemetry, the coach, the leaderboards and the basic overlays are free, and during the beta everything is."],
      ["Which sims does it work with?", "iRacing and Le Mans Ultimate (in beta). ACC and Assetto Corsa are in development."],
      ["What do I need?", "A Windows PC where you race in iRacing or Le Mans Ultimate, to record the laps. To look at them, any browser or the Android app."],
      ["Who sees my laps?", "Your laps are in your account. On the leaderboards only your fastest lap of each car and track appears, under your public name or as Anonymous."],
      ["How is it different from looking at a replay?", "A replay shows what happened. Telemetry shows how, where you braked, how much throttle you used and where the time went, metre by metre, next to a faster lap."],
    ],
    dl: "Download for Windows", app: "Open the app",
  },
  es: {
    path: "/es/telemetria-iracing",
    title: "Telemetría de iRacing, análisis y overlays · Pitlane HQ",
    desc: "Telemetría gratis para iRacing con Pitlane HQ. Graba tus vueltas, mira dónde pierdes tiempo, compárate con pilotos más rápidos y usa overlays en el juego.",
    h1: "Telemetría para iRacing y un coach para tus vueltas",
    lead: "Pitlane HQ graba cada vuelta que das en iRacing y te enseña dónde pierdes tiempo, frente a tu mejor vuelta, frente al récord y frente al piloto que va justo por delante con el mismo coche. Es gratis y funciona en Windows, Android y la web.",
    cards: [
      ["Telemetría de cada vuelta", "Pitlane HQ Agent funciona junto a iRacing y guarda velocidad, acelerador, freno, marcha y volante en cada vuelta, sin configurar nada. Las vueltas van a tu cuenta, así que luego las abres en la web o en el móvil."],
      ["Comparar dos vueltas", "Velocidad, pedales y diferencia de tiempo a lo largo de la vuelta, el mapa del circuito, los sectores y los puntos de frenada. Eliges dos vueltas cualquiera, tuyas, de otra sesión o de la clasificación."],
      ["Un coach con vueltas reales", "Para cada coche y circuito, Pitlane HQ aprende de vueltas reales de pilotos reales. El coach compara tu vuelta con el récord y con el piloto que va justo por delante, y te dice qué curvas te cuestan más."],
      ["Telemetría en vivo en el móvil", "Mientras corres, mira tu telemetría en el móvil o en el navegador. Comparte un código y un amigo también puede verla."],
      ["Clasificaciones por coche y circuito", "La vuelta más rápida de cada piloto en cada coche y circuito, por disciplina, óvalo, sports car, fórmula, óvalo de tierra y tierra."],
      ["Resumen de carrera e iRating", "Después de cada carrera, tu resultado, tus vueltas, tus incidentes, tu iRating y cómo ibas frente a los pilotos de tu alrededor."],
      ["Overlays encima del juego", "Relative, clasificación, radar, barra de delta, combustible, neumáticos, mapa, banderas, un coach en vivo y más, dibujados por Pitlane HQ Agent sobre iRacing y también en VR."],
    ],
    recs: "Récords por coche y circuito", recsLead: "Las vueltas más rápidas hechas con Pitlane HQ.",
    faqT: "Preguntas",
    faq: [
      ["¿Qué es Pitlane HQ?", "Pitlane HQ (también escrito PitlaneHQ) es una app gratis de telemetría para sim racing en iRacing y Le Mans Ultimate. Pitlane HQ Agent graba tus vueltas en Windows, y la web y la app del móvil te las enseñan con un coach, clasificaciones y overlays."],
      ["¿Es gratis?", "Sí. La telemetría, el coach, las clasificaciones y los overlays básicos son gratis, y durante la beta lo es todo."],
      ["¿Con qué simuladores funciona?", "Con iRacing y Le Mans Ultimate (en beta). ACC y Assetto Corsa están en desarrollo."],
      ["¿Qué necesito?", "Un PC con Windows donde corras en iRacing o Le Mans Ultimate, para grabar las vueltas. Para verlas, cualquier navegador o la app de Android."],
      ["¿Quién ve mis vueltas?", "Tus vueltas están en tu cuenta. En las clasificaciones solo aparece tu vuelta más rápida de cada coche y circuito, con tu nombre público o como Anónimo."],
      ["¿En qué se diferencia de ver una repetición?", "La repetición muestra qué pasó. La telemetría muestra cómo, dónde frenaste, cuánto acelerador diste y dónde se fue el tiempo, metro a metro, al lado de una vuelta más rápida."],
    ],
    dl: "Descargar para Windows", app: "Abrir la app",
  },
  pt: {
    path: "/pt/telemetria-iracing",
    title: "Telemetria do iRacing, análise e overlays · Pitlane HQ",
    desc: "Telemetria grátis para iRacing com o Pitlane HQ. Grave suas voltas, veja onde perde tempo, compare com pilotos mais rápidos e use overlays no jogo.",
    h1: "Telemetria para iRacing e um coach para suas voltas",
    lead: "O Pitlane HQ grava cada volta que você dá no iRacing e mostra onde você perde tempo, contra a sua melhor volta, contra o recorde e contra o piloto logo à sua frente no mesmo carro. É grátis e funciona no Windows, no Android e na web.",
    cards: [
      ["Telemetria de cada volta", "O Pitlane HQ Agent roda ao lado do iRacing e salva velocidade, acelerador, freio, marcha e volante em cada volta, sem configurar nada. As voltas vão para a sua conta, então você as abre depois na web ou no celular."],
      ["Compare duas voltas", "Velocidade, pedais e a diferença de tempo ao longo da volta, o mapa da pista, os setores e os pontos de frenagem. Escolha duas voltas quaisquer, suas, de outra sessão ou da classificação."],
      ["Um coach com voltas reais", "Para cada carro e pista, o Pitlane HQ aprende com voltas reais de pilotos reais. O coach compara a sua volta com o recorde e com o piloto logo à frente e diz quais curvas custam mais."],
      ["Telemetria ao vivo no celular", "Enquanto você corre, veja a sua telemetria no celular ou no navegador. Compartilhe um código e um amigo também pode acompanhar."],
      ["Classificações por carro e pista", "A volta mais rápida de cada piloto em cada carro e pista, por disciplina, oval, sports car, fórmula, oval de terra e terra."],
      ["Resumo de corrida e iRating", "Depois de cada corrida, o seu resultado, as suas voltas, os seus incidentes, o seu iRating e como você foi contra os pilotos ao seu redor."],
      ["Overlays sobre o jogo", "Relative, classificação, radar, barra de delta, combustível, pneus, mapa, bandeiras, um coach ao vivo e mais, desenhados pelo Pitlane HQ Agent sobre o iRacing e também em VR."],
    ],
    recs: "Recordes por carro e pista", recsLead: "As voltas mais rápidas feitas com o Pitlane HQ.",
    faqT: "Perguntas",
    faq: [
      ["O que é o Pitlane HQ?", "O Pitlane HQ (também escrito PitlaneHQ) é um app grátis de telemetria para sim racing no iRacing e no Le Mans Ultimate. O Pitlane HQ Agent grava suas voltas no Windows, e a web e o app de celular mostram com um coach, classificações e overlays."],
      ["É grátis?", "Sim. A telemetria, o coach, as classificações e os overlays básicos são grátis, e durante a beta tudo é."],
      ["Com quais simuladores funciona?", "Com o iRacing e o Le Mans Ultimate (em beta). ACC e Assetto Corsa estão em desenvolvimento."],
      ["Do que eu preciso?", "Um PC com Windows onde você corre no iRacing ou no Le Mans Ultimate, para gravar as voltas. Para vê-las, qualquer navegador ou o app de Android."],
      ["Quem vê as minhas voltas?", "As suas voltas ficam na sua conta. Nas classificações aparece só a sua volta mais rápida de cada carro e pista, com o seu nome público ou como Anônimo."],
      ["Qual a diferença para ver um replay?", "O replay mostra o que aconteceu. A telemetria mostra como, onde você freou, quanto acelerador usou e para onde foi o tempo, metro a metro, ao lado de uma volta mais rápida."],
    ],
    dl: "Baixar para Windows", app: "Abrir o app",
  },
};

// ---------- what Pitlane HQ does, for Le Mans Ultimate (in beta) ----------
const LANDL = {
  en: {
    path: "/le-mans-ultimate-telemetry",
    title: "Le Mans Ultimate telemetry, coach and overlays · Pitlane HQ",
    desc: "Free Le Mans Ultimate telemetry app, in beta. Record every LMU lap, compare it with faster drivers, see where you lose time and race with overlays.",
    h1: "Le Mans Ultimate telemetry and a coach for your laps",
    lead: "Pitlane HQ records every lap you drive in Le Mans Ultimate and shows where you lose time, against your best lap, the record and the driver just ahead of you in the same car. Le Mans Ultimate support is in beta and free, on Windows, Android and the web.",
    cards: [
      ["Nothing to install in the game", "Pitlane HQ Agent reads the game's own data. Turn on Enable Plugins in the game's Settings → Gameplay and drive. Every lap is saved with its speed, pedals, gear, steering and official sectors."],
      ["Compare laps and reference laps", "Put two laps side by side, yours or the leaderboard's, with the time gap, the inputs, the racing line on the map and the braking points."],
      ["A coach with real laps", "The coach compares your lap with the record and with the driver just ahead of your pace on the same car and track, and lists the corners that cost the most."],
      ["Overlays for multiclass races", "Relative and standings with class colours, radar, delta bar, fuel, a track map with every class, flags and a dash with TC, ABS, brake bias and the virtual energy left."],
      ["Live on your phone", "Watch position, delta, fuel, the relative and the map on a phone or tablet next to the wheel, over Wi-Fi or mobile data."],
      ["Race summaries and rivals", "After each race, your place, your laps and the field as the game shows it, with the best lap of every rival."],
      ["Leaderboards and leagues", "Your fastest lap of each car and track goes to its leaderboard by itself, and the leagues hub lists Le Mans Ultimate leagues with their Discord."],
    ],
    recs: "Le Mans Ultimate records by car and track", recsLead: "The fastest Le Mans Ultimate laps driven with Pitlane HQ.",
    faqT: "Questions",
    faq: [
      ["Is there a free Le Mans Ultimate telemetry app?", "Yes. Pitlane HQ is free. Its Le Mans Ultimate support is in beta, so write to support@pitlanehq.app when something looks wrong."],
      ["How do I turn on LMU telemetry?", "In Le Mans Ultimate open Settings → Gameplay and turn on Enable Plugins. Pitlane HQ Agent finds the game by itself, with nothing else to install."],
      ["Does it work with Hypercar, LMP2 and LMGT3?", "Yes. Every car of the game is recorded, and the overlays colour each class."],
      ["Does it show the virtual energy?", "Yes. The dash overlay shows the virtual energy left next to TC, ABS, the engine map and the brake bias, and the fuel overlay shows what each lap used and what you may use per lap to finish."],
      ["Can I see my LMU telemetry on the phone?", "Yes. Sign in with the same account on the phone or at pitlanehq.app and press Connect in Telemetry."],
      ["Is there an iRating?", "Le Mans Ultimate has no iRating or licences, so Pitlane HQ shows none for it. Everything else works as in iRacing."],
    ],
    dl: "Download for Windows", app: "Open the app",
  },
  es: {
    path: "/es/telemetria-le-mans-ultimate",
    title: "Telemetría y overlays para Le Mans Ultimate · Pitlane HQ",
    desc: "App de telemetría gratis para Le Mans Ultimate, en beta. Graba cada vuelta de LMU, compárala con pilotos más rápidos y corre con overlays sobre el juego.",
    h1: "Telemetría para Le Mans Ultimate y un coach para tus vueltas",
    lead: "Pitlane HQ graba cada vuelta que das en Le Mans Ultimate y te enseña dónde pierdes tiempo, frente a tu mejor vuelta, el récord y el piloto que va justo por delante con el mismo coche. El soporte de Le Mans Ultimate está en beta y es gratis, en Windows, Android y la web.",
    cards: [
      ["Nada que instalar en el juego", "Pitlane HQ Agent lee los datos del propio juego. Activa Enable Plugins en Settings → Gameplay del juego y conduce. Cada vuelta se guarda con su velocidad, pedales, marcha, volante y sectores oficiales."],
      ["Compara vueltas y vueltas de referencia", "Pon dos vueltas una al lado de la otra, tuyas o de la clasificación, con la diferencia de tiempo, los pedales, la trazada en el mapa y los puntos de frenada."],
      ["Un coach con vueltas reales", "El coach compara tu vuelta con el récord y con el piloto justo por encima de tu ritmo en el mismo coche y circuito, y pone primero las curvas que más te cuestan."],
      ["Overlays para carreras multiclase", "Relative y clasificación con los colores de cada clase, radar, barra de delta, combustible, mapa con todas las clases, banderas y un dash con TC, ABS, reparto de frenada y la energía virtual que queda."],
      ["En vivo en el móvil", "Mira posición, delta, combustible, el relative y el mapa en un móvil o una tablet junto al volante, con Wi-Fi o datos."],
      ["Resúmenes de carrera y rivales", "Después de cada carrera, tu posición, tus vueltas y la parrilla como la muestra el juego, con la mejor vuelta de cada rival."],
      ["Clasificaciones y ligas", "Tu vuelta más rápida de cada coche y circuito entra sola en su clasificación, y el hub de ligas reúne ligas de Le Mans Ultimate con su Discord."],
    ],
    recs: "Récords de Le Mans Ultimate por coche y circuito", recsLead: "Las vueltas más rápidas de Le Mans Ultimate hechas con Pitlane HQ.",
    faqT: "Preguntas",
    faq: [
      ["¿Hay una app de telemetría gratis para Le Mans Ultimate?", "Sí. Pitlane HQ es gratis. Su soporte de Le Mans Ultimate está en beta, así que escribe a support@pitlanehq.app si algo no cuadra."],
      ["¿Cómo activo la telemetría de LMU?", "En Le Mans Ultimate abre Settings → Gameplay y activa Enable Plugins. Pitlane HQ Agent encuentra el juego solo, sin instalar nada más."],
      ["¿Funciona con Hypercar, LMP2 y LMGT3?", "Sí. Se graba cada coche del juego, y los overlays colorean cada clase."],
      ["¿Muestra la energía virtual?", "Sí. El overlay del dash muestra la energía virtual que queda junto al TC, el ABS, el mapa motor y el reparto de frenada, y el de combustible lo que gastó cada vuelta y lo que puedes gastar por vuelta para terminar."],
      ["¿Puedo ver mi telemetría de LMU en el móvil?", "Sí. Entra con la misma cuenta en el móvil o en pitlanehq.app y pulsa Conectar en Telemetría."],
      ["¿Hay iRating?", "Le Mans Ultimate no tiene iRating ni licencias, así que Pitlane HQ no muestra ninguno. Todo lo demás funciona como en iRacing."],
    ],
    dl: "Descargar para Windows", app: "Abrir la app",
  },
  pt: {
    path: "/pt/telemetria-le-mans-ultimate",
    title: "Telemetria e overlays para Le Mans Ultimate · Pitlane HQ",
    desc: "App de telemetria grátis para Le Mans Ultimate, em beta. Grave cada volta do LMU, compare com pilotos mais rápidos e corra com overlays sobre o jogo.",
    h1: "Telemetria para Le Mans Ultimate e um coach para suas voltas",
    lead: "O Pitlane HQ grava cada volta que você dá no Le Mans Ultimate e mostra onde você perde tempo, contra a sua melhor volta, o recorde e o piloto logo à sua frente no mesmo carro. O suporte ao Le Mans Ultimate está em beta e é grátis, no Windows, no Android e na web.",
    cards: [
      ["Nada para instalar no jogo", "O Pitlane HQ Agent lê os dados do próprio jogo. Ative Enable Plugins em Settings → Gameplay do jogo e pilote. Cada volta é salva com velocidade, pedais, marcha, volante e setores oficiais."],
      ["Compare voltas e voltas de referência", "Coloque duas voltas lado a lado, suas ou da classificação, com a diferença de tempo, os pedais, o traçado no mapa e os pontos de frenagem."],
      ["Um coach com voltas reais", "O coach compara sua volta com o recorde e com o piloto logo acima do seu ritmo no mesmo carro e pista, e mostra primeiro as curvas que mais custam."],
      ["Overlays para corridas multiclasse", "Relative e classificação com as cores de cada classe, radar, barra de delta, combustível, mapa com todas as classes, bandeiras e um dash com TC, ABS, balanço de freio e a energia virtual que resta."],
      ["Ao vivo no celular", "Veja posição, delta, combustível, o relative e o mapa num celular ou tablet ao lado do volante, com Wi-Fi ou dados."],
      ["Resumos de corrida e rivais", "Depois de cada corrida, a sua posição, as suas voltas e o grid como o jogo mostra, com a melhor volta de cada rival."],
      ["Classificações e ligas", "Sua volta mais rápida de cada carro e pista entra sozinha na classificação, e o hub de ligas reúne ligas de Le Mans Ultimate com o Discord delas."],
    ],
    recs: "Recordes do Le Mans Ultimate por carro e pista", recsLead: "As voltas mais rápidas do Le Mans Ultimate feitas com o Pitlane HQ.",
    faqT: "Perguntas",
    faq: [
      ["Existe um app de telemetria grátis para Le Mans Ultimate?", "Sim. O Pitlane HQ é grátis. O suporte ao Le Mans Ultimate está em beta, então escreva para support@pitlanehq.app se algo parecer errado."],
      ["Como ativo a telemetria do LMU?", "No Le Mans Ultimate abra Settings → Gameplay e ative Enable Plugins. O Pitlane HQ Agent encontra o jogo sozinho, sem instalar mais nada."],
      ["Funciona com Hypercar, LMP2 e LMGT3?", "Sim. Cada carro do jogo é gravado, e os overlays colorem cada classe."],
      ["Mostra a energia virtual?", "Sim. O overlay do dash mostra a energia virtual que resta ao lado do TC, do ABS, do mapa do motor e do balanço de freio, e o de combustível o que cada volta gastou e o que você pode gastar por volta para terminar."],
      ["Posso ver minha telemetria do LMU no celular?", "Sim. Entre com a mesma conta no celular ou em pitlanehq.app e toque em Conectar em Telemetria."],
      ["Tem iRating?", "O Le Mans Ultimate não tem iRating nem licenças, então o Pitlane HQ não mostra nenhum. Todo o resto funciona como no iRacing."],
    ],
    dl: "Baixar para Windows", app: "Abrir o app",
  },
};
const LAND_ALTS = altsOf(LAND), LANDL_ALTS = altsOf(LANDL);

// ---------- the overlays ----------
// the overlays every driver has (OV_BASIC); the experimental ones are named in one line
const OV_IMGS = { en: [["ov-l-brakes.png", "Braking markers"], ["ov-l-coach.png", "Coach"], ["ov-g-inputs.png", "Inputs"], ["ov-g-timing.png", "Timing"], ["ov-s-sectors.png", "Mini-sectors"], ["ov-g-tyres.png", "Tyres"], ["ov-weather.png", "Weather"], ["ov-trackbar.png", "Track position bar"]],
  es: [["ov-l-brakes.png", "Marcas de frenada"], ["ov-l-coach.png", "Coach"], ["ov-g-inputs.png", "Pedales"], ["ov-g-timing.png", "Tiempos"], ["ov-s-sectors.png", "Minisectores"], ["ov-g-tyres.png", "Neumáticos"], ["ov-weather.png", "Clima"], ["ov-trackbar.png", "Barra de posiciones"]],
  pt: [["ov-l-brakes.png", "Marcas de frenagem"], ["ov-l-coach.png", "Coach"], ["ov-g-inputs.png", "Pedais"], ["ov-g-timing.png", "Tempos"], ["ov-s-sectors.png", "Minissetores"], ["ov-g-tyres.png", "Pneus"], ["ov-weather.png", "Clima"], ["ov-trackbar.png", "Barra de posições"]] };
const OVW = {
  en: { listT: "The overlays", expT: "Experimental overlays", exp: "Live lap compare, DRS and push-to-pass, g-force, mini-sectors, gaps, session stats, telemetry traces and performance (frames a second, CPU, GPU and latency). Switch them on in the Overlays tab.",
    vrT: "Overlays in VR", vr: "Every open overlay also shows in the headset as a SteamVR overlay, where it sits on your screen, so moving it on the screen moves it in VR. Meta headsets work through SteamVR. Turn it on in Settings → VR.",
    howT: "How they work", shotsT: "As Pitlane HQ Agent draws them",
    how: ["Drawn natively by Pitlane HQ Agent on Windows, not in a browser window.", "Only the panel shows. The rest is see-through and every click goes to the game.", "Drag and resize them while you place them. They never leave the screen.", "Four presets built in, and your own, saved in your account.", "Auto opens them when you get in the car and closes them when you get out."] },
  es: { listT: "Los overlays", expT: "Overlays experimentales", exp: "Comparación de vueltas en vivo, DRS y push-to-pass, fuerzas g, minisectores, diferencias, estadísticas de la sesión, trazas de telemetría y rendimiento (fotogramas por segundo, CPU, GPU y latencia). Se activan en la pestaña Overlays.",
    vrT: "Overlays en VR", vr: "Cada overlay abierto también se ve en las gafas como un overlay de SteamVR, donde está en tu pantalla, así que moverlo en la pantalla lo mueve en VR. Las gafas Meta funcionan a través de SteamVR. Se activa en Ajustes → VR.",
    howT: "Cómo funcionan", shotsT: "Tal como los dibuja Pitlane HQ Agent",
    how: ["Dibujados de forma nativa por Pitlane HQ Agent en Windows, no en una ventana de navegador.", "Solo se ve el panel. El resto es transparente y cada clic va al juego.", "Los arrastras y cambias de tamaño mientras los colocas. Nunca se salen de la pantalla.", "Cuatro presets incluidos y los tuyos, guardados en tu cuenta.", "Auto los abre al subirte al coche y los cierra al bajarte."] },
  pt: { listT: "Os overlays", expT: "Overlays experimentais", exp: "Comparação de voltas ao vivo, DRS e push-to-pass, forças g, minissetores, diferenças, estatísticas da sessão, traços de telemetria e desempenho (quadros por segundo, CPU, GPU e latência). Ative na aba Overlays.",
    vrT: "Overlays em VR", vr: "Cada overlay aberto também aparece nos óculos como um overlay do SteamVR, onde ele está na sua tela, então movê-lo na tela o move em VR. Os óculos Meta funcionam pelo SteamVR. Ative em Configurações → VR.",
    howT: "Como funcionam", shotsT: "Como o Pitlane HQ Agent os desenha",
    how: ["Desenhados de forma nativa pelo Pitlane HQ Agent no Windows, não numa janela de navegador.", "Só o painel aparece. O resto é transparente e cada clique vai para o jogo.", "Arraste e redimensione enquanto posiciona. Eles nunca saem da tela.", "Quatro presets incluídos e os seus, salvos na sua conta.", "Auto abre quando você entra no carro e fecha quando sai."] },
};
const OVL = {
  en: { path: "/iracing-overlays", title: "iRacing overlays, relative, radar and fuel · Pitlane HQ",
    desc: "Free iRacing overlays from Pitlane HQ. Relative, standings, radar, delta bar, fuel, tyres, track map, a live coach and more, also in VR through SteamVR.",
    h1: "iRacing overlays", lead: "Pitlane HQ Agent draws its overlays itself, on top of iRacing. They are light, sharp and see-through, and every click goes to the game. Place them once, save them as a preset and they open by themselves when you get in the car.",
    faq: [["Do the overlays cost anything?", "The basic overlays are free. During the beta the experimental ones are free too."], ["Do they need anything else?", "Only Pitlane HQ Agent on the Windows PC where you race."], ["Do they work in VR?", "Yes, through SteamVR, Meta headsets included."], ["Do they work in Le Mans Ultimate?", "Yes. The same overlays work in Le Mans Ultimate, in beta."]],
    items: [["Relative", "The cars ahead and behind on track, with the gaps, their trend, the class colours, your driver notes and +1L / −1L."], ["Standings", "The positions of the race, the gaps, the last laps and each driver's pace against yours."], ["Radar", "The cars beside and behind you, 60 times a second, with a red side bar and the nearest distance."], ["Delta bar", "Your gap to your best lap, metre by metre, and the lap this pace gives."], ["Fuel", "What each lap uses and what you may use per lap to finish without a stop."], ["Tyres", "Temperatures inside, middle and outside, the pressure and the wear."], ["Track map", "Every car on the track, the official turn numbers and the sectors."], ["Flags", "The start lights, the flags, debris, laps to go and one lap to green."], ["Dash", "Gear, speed, revs, the pedals, ABS and a strip with the lap, the place, the delta and the incidents."], ["Timing", "The official sectors of the lap in purple, green or yellow."], ["Pit stop", "Your speed against the pit lane limit and what the stop is doing."], ["Braking markers", "Where to brake in each corner, from the next level above your best lap."], ["Coach", "The next corner's tip and braking point while you drive, and after it what it gave or took."], ["Inputs", "Throttle, brake, clutch and steering as traces and bars."], ["Engine", "The game's engine warnings, the pit limiter and the rev limiter."], ["Incidents", "Your incident count and what is left before the limit."], ["Weather", "Track and air temperature, the wind against your car, the rain and how wet the track is."], ["Track position bar", "Every car along the lap on one line, class colours and you marked."]] },
  es: { path: "/es/overlays-iracing", title: "Overlays para iRacing, relative, radar y más · Pitlane HQ",
    desc: "Overlays gratis para iRacing. Relative, clasificación, radar, barra de delta, combustible, neumáticos, mapa, un coach en vivo y más, también en VR.",
    h1: "Overlays para iRacing", lead: "Pitlane HQ Agent dibuja sus overlays él mismo, encima de iRacing. Son ligeros, nítidos y transparentes, y cada clic va al juego. Colócalos una vez, guárdalos como preset y se abren solos al subirte al coche.",
    faq: [["¿Los overlays cuestan algo?", "Los overlays básicos son gratis. Durante la beta los experimentales también lo son."], ["¿Necesitan algo más?", "Solo Pitlane HQ Agent en el PC con Windows donde corres."], ["¿Funcionan en VR?", "Sí, a través de SteamVR, también con gafas Meta."], ["¿Funcionan en Le Mans Ultimate?", "Sí. Los mismos overlays funcionan en Le Mans Ultimate, en beta."]],
    items: [["Relative", "Los coches delante y detrás en pista, con las diferencias, su tendencia, los colores de clase, tus notas de pilotos y +1L / −1L."], ["Clasificación", "Las posiciones de la carrera, las diferencias, las últimas vueltas y el ritmo de cada piloto frente al tuyo."], ["Radar", "Los coches a tu lado y detrás, 60 veces por segundo, con una barra lateral roja y la distancia al más cercano."], ["Barra de delta", "Tu diferencia con tu mejor vuelta, metro a metro, y la vuelta que da este ritmo."], ["Combustible", "Lo que gasta cada vuelta y lo que puedes gastar por vuelta para terminar sin parar."], ["Neumáticos", "Temperaturas por dentro, centro y fuera, la presión y el desgaste."], ["Mapa del circuito", "Todos los coches en pista, los números oficiales de las curvas y los sectores."], ["Banderas", "El semáforo de salida, las banderas, restos en pista, vueltas restantes y una para la verde."], ["Dash", "Marcha, velocidad, revoluciones, los pedales, el ABS y una tira con la vuelta, la posición, el delta y los incidentes."], ["Tiempos", "Los sectores oficiales de la vuelta en morado, verde o amarillo."], ["Parada en boxes", "Tu velocidad frente al límite del pit lane y lo que está haciendo la parada."], ["Marcas de frenada", "Dónde frenar en cada curva, del siguiente nivel por encima de tu mejor vuelta."], ["Coach", "El consejo y el punto de frenada de la siguiente curva mientras conduces, y al salir lo que ganaste o perdiste."], ["Pedales", "Acelerador, freno, embrague y volante como trazas y barras."], ["Motor", "Los avisos del motor del juego, el limitador de boxes y el corte de revoluciones."], ["Incidentes", "Tus incidentes y lo que queda hasta el límite."], ["Clima", "Temperatura de pista y aire, el viento contra tu coche, la lluvia y lo mojada que está la pista."], ["Barra de posiciones", "Todos los coches a lo largo de la vuelta en una línea, con los colores de clase y tú marcado."]] },
  pt: { path: "/pt/overlays-iracing", title: "Overlays para iRacing, relative, radar e mais · Pitlane HQ",
    desc: "Overlays grátis para iRacing do Pitlane HQ. Relative, classificação, radar, barra de delta, combustível, pneus, mapa, um coach ao vivo e mais, também em VR.",
    h1: "Overlays para iRacing", lead: "O Pitlane HQ Agent desenha seus overlays sozinho, sobre o iRacing. São leves, nítidos e transparentes, e cada clique vai para o jogo. Posicione uma vez, salve como preset e eles abrem sozinhos quando você entra no carro.",
    faq: [["Os overlays custam algo?", "Os overlays básicos são grátis. Durante a beta os experimentais também são."], ["Precisam de mais alguma coisa?", "Só do Pitlane HQ Agent no PC com Windows onde você corre."], ["Funcionam em VR?", "Sim, pelo SteamVR, também com óculos Meta."], ["Funcionam no Le Mans Ultimate?", "Sim. Os mesmos overlays funcionam no Le Mans Ultimate, em beta."]],
    items: [["Relative", "Os carros à frente e atrás na pista, com as diferenças, a tendência, as cores de classe, suas notas de pilotos e +1L / −1L."], ["Classificação", "As posições da corrida, as diferenças, as últimas voltas e o ritmo de cada piloto contra o seu."], ["Radar", "Os carros ao seu lado e atrás, 60 vezes por segundo, com uma barra lateral vermelha e a distância do mais próximo."], ["Barra de delta", "A sua diferença para a sua melhor volta, metro a metro, e a volta que esse ritmo dá."], ["Combustível", "O que cada volta gasta e o que você pode gastar por volta para terminar sem parar."], ["Pneus", "Temperaturas por dentro, meio e fora, a pressão e o desgaste."], ["Mapa da pista", "Todos os carros na pista, os números oficiais das curvas e os setores."], ["Bandeiras", "As luzes de largada, as bandeiras, detritos, voltas restantes e uma para a verde."], ["Dash", "Marcha, velocidade, rotação, os pedais, o ABS e uma faixa com a volta, a posição, o delta e os incidentes."], ["Tempos", "Os setores oficiais da volta em roxo, verde ou amarelo."], ["Pit stop", "A sua velocidade contra o limite do pit lane e o que a parada está fazendo."], ["Marcas de frenagem", "Onde frear em cada curva, do próximo nível acima da sua melhor volta."], ["Coach", "A dica e o ponto de frenagem da próxima curva enquanto você pilota, e na saída o que você ganhou ou perdeu."], ["Pedais", "Acelerador, freio, embreagem e volante como traços e barras."], ["Motor", "Os avisos do motor do jogo, o limitador do pit e o corte de giro."], ["Incidentes", "Seus incidentes e o que falta até o limite."], ["Clima", "Temperatura da pista e do ar, o vento contra o seu carro, a chuva e o quanto a pista está molhada."], ["Barra de posições", "Todos os carros ao longo da volta numa linha, com as cores de classe e você marcado."]] },
};
const OVLL = {
  en: { path: "/le-mans-ultimate-overlays", title: "Le Mans Ultimate overlays, relative and radar · Pitlane HQ",
    desc: "Free Le Mans Ultimate overlays from Pitlane HQ, in beta. A multiclass relative, standings, radar, delta bar, fuel, track map and a dash with virtual energy.",
    h1: "Le Mans Ultimate overlays", lead: "Pitlane HQ Agent draws its overlays on top of Le Mans Ultimate, read from the game's own data. They are see-through, every click goes to the game, and they open by themselves when you get in the car. Le Mans Ultimate support is in beta.",
    faq: [["Are there free Le Mans Ultimate overlays?", "Yes. The basic overlays are free, and during the beta everything is."], ["What do I need to install?", "Only Pitlane HQ Agent on Windows. In the game, turn on Settings → Gameplay → Enable Plugins."], ["Do they work in VR?", "Yes. Every open overlay also shows in the headset through SteamVR."], ["Is there a fuel calculator?", "The fuel overlay is not a calculator you fill in. It measures each lap and shows what you may use per lap to finish without a stop, and the dash shows the virtual energy left."]],
    items: [["Relative", "The cars ahead and behind on track with the gaps, their trend, the colours of each class and +1L / −1L, made for multiclass races."], ["Standings", "Overall and by class, the gaps, the last laps and each driver's pace against yours."], ["Radar", "The cars beside and behind you, with a red side bar and the nearest distance."], ["Delta bar", "Your gap to your best lap, metre by metre, and the lap this pace gives."], ["Fuel", "What each lap uses and what you may use per lap to finish without a stop."], ["Dash", "Gear, speed, revs, the pedals, TC, ABS, engine map, brake bias and the virtual energy and battery left."], ["Track map", "Every car on the track coloured by class, the turns and the sectors."], ["Flags", "The start lights, the flags and the laps to go."], ["Timing", "The official sectors of the lap in purple, green or yellow."], ["Tyres", "Temperatures inside, middle and outside, and the pressure."], ["Pit stop", "Your speed on the pit road and whether the pit limiter is on."], ["Braking markers", "Where to brake in each corner, from the next level above your best lap."], ["Coach", "The next corner's tip and braking point while you drive."], ["Weather", "Track and air temperature and the wind against your car."], ["Track position bar", "Every car along the lap on one line, coloured by class."]] },
  es: { path: "/es/overlays-le-mans-ultimate", title: "Overlays para Le Mans Ultimate, relative y radar · Pitlane HQ",
    desc: "Overlays gratis para Le Mans Ultimate de Pitlane HQ, en beta. Relative multiclase, clasificación, radar, delta, combustible, mapa y un dash con energía virtual.",
    h1: "Overlays para Le Mans Ultimate", lead: "Pitlane HQ Agent dibuja sus overlays encima de Le Mans Ultimate, con los datos del propio juego. Son transparentes, cada clic va al juego y se abren solos al subirte al coche. El soporte de Le Mans Ultimate está en beta.",
    faq: [["¿Hay overlays gratis para Le Mans Ultimate?", "Sí. Los overlays básicos son gratis, y durante la beta lo es todo."], ["¿Qué tengo que instalar?", "Solo Pitlane HQ Agent en Windows. En el juego, activa Settings → Gameplay → Enable Plugins."], ["¿Funcionan en VR?", "Sí. Cada overlay abierto también se ve en las gafas a través de SteamVR."], ["¿Hay una calculadora de combustible?", "El overlay de combustible no es una calculadora que rellenas. Mide cada vuelta y te dice lo que puedes gastar por vuelta para terminar sin parar, y el dash muestra la energía virtual que queda."]],
    items: [["Relative", "Los coches delante y detrás en pista con las diferencias, su tendencia, los colores de cada clase y +1L / −1L, pensado para carreras multiclase."], ["Clasificación", "General y por clase, las diferencias, las últimas vueltas y el ritmo de cada piloto frente al tuyo."], ["Radar", "Los coches a tu lado y detrás, con una barra lateral roja y la distancia al más cercano."], ["Barra de delta", "Tu diferencia con tu mejor vuelta, metro a metro, y la vuelta que da este ritmo."], ["Combustible", "Lo que gasta cada vuelta y lo que puedes gastar por vuelta para terminar sin parar."], ["Dash", "Marcha, velocidad, revoluciones, los pedales, TC, ABS, mapa motor, reparto de frenada y la energía virtual y la batería que quedan."], ["Mapa del circuito", "Todos los coches en pista con el color de su clase, las curvas y los sectores."], ["Banderas", "El semáforo de salida, las banderas y las vueltas restantes."], ["Tiempos", "Los sectores oficiales de la vuelta en morado, verde o amarillo."], ["Neumáticos", "Temperaturas por dentro, centro y fuera, y la presión."], ["Parada en boxes", "Tu velocidad en el pit lane y si el limitador está puesto."], ["Marcas de frenada", "Dónde frenar en cada curva, del siguiente nivel por encima de tu mejor vuelta."], ["Coach", "El consejo y el punto de frenada de la siguiente curva mientras conduces."], ["Clima", "Temperatura de pista y aire y el viento contra tu coche."], ["Barra de posiciones", "Todos los coches a lo largo de la vuelta en una línea, con el color de su clase."]] },
  pt: { path: "/pt/overlays-le-mans-ultimate", title: "Overlays para Le Mans Ultimate, relative e radar · Pitlane HQ",
    desc: "Overlays grátis para Le Mans Ultimate, em beta. Relative multiclasse, classificação, radar, delta, combustível, mapa e um dash com energia virtual.",
    h1: "Overlays para Le Mans Ultimate", lead: "O Pitlane HQ Agent desenha seus overlays sobre o Le Mans Ultimate, com os dados do próprio jogo. São transparentes, cada clique vai para o jogo e eles abrem sozinhos quando você entra no carro. O suporte ao Le Mans Ultimate está em beta.",
    faq: [["Existem overlays grátis para Le Mans Ultimate?", "Sim. Os overlays básicos são grátis, e durante a beta tudo é."], ["O que preciso instalar?", "Só o Pitlane HQ Agent no Windows. No jogo, ative Settings → Gameplay → Enable Plugins."], ["Funcionam em VR?", "Sim. Cada overlay aberto também aparece nos óculos pelo SteamVR."], ["Tem uma calculadora de combustível?", "O overlay de combustível não é uma calculadora para preencher. Ele mede cada volta e mostra o que você pode gastar por volta para terminar sem parar, e o dash mostra a energia virtual que resta."]],
    items: [["Relative", "Os carros à frente e atrás na pista com as diferenças, a tendência, as cores de cada classe e +1L / −1L, feito para corridas multiclasse."], ["Classificação", "Geral e por classe, as diferenças, as últimas voltas e o ritmo de cada piloto contra o seu."], ["Radar", "Os carros ao seu lado e atrás, com uma barra lateral vermelha e a distância do mais próximo."], ["Barra de delta", "A sua diferença para a sua melhor volta, metro a metro, e a volta que esse ritmo dá."], ["Combustível", "O que cada volta gasta e o que você pode gastar por volta para terminar sem parar."], ["Dash", "Marcha, velocidade, rotação, os pedais, TC, ABS, mapa do motor, balanço de freio e a energia virtual e a bateria que restam."], ["Mapa da pista", "Todos os carros na pista com a cor da classe, as curvas e os setores."], ["Bandeiras", "As luzes de largada, as bandeiras e as voltas restantes."], ["Tempos", "Os setores oficiais da volta em roxo, verde ou amarelo."], ["Pneus", "Temperaturas por dentro, meio e fora, e a pressão."], ["Pit stop", "A sua velocidade no pit lane e se o limitador está ligado."], ["Marcas de frenagem", "Onde frear em cada curva, do próximo nível acima da sua melhor volta."], ["Coach", "A dica e o ponto de frenagem da próxima curva enquanto você pilota."], ["Clima", "Temperatura da pista e do ar e o vento contra o seu carro."], ["Barra de posições", "Todos os carros ao longo da volta numa linha, com a cor da classe."]] },
};
const OVL_ALTS = altsOf(OVL), OVLL_ALTS = altsOf(OVLL);
function overlaysPage(l, game) {
  const O = (game === "lmu" ? OVLL : OVL)[l], W = OVW[l], L = (game === "lmu" ? LANDL : LAND)[l];
  const shots = OV_IMGS[l];
  const body = `<h1>${esc(O.h1)}</h1><p class="lead">${esc(O.lead)}</p>
<div class="cta"><a class="btn p" href="/dl/PitlaneHQ-Setup.exe">${esc(L.dl)}</a><a class="btn" href="${L.path}">${esc(T[l].tel[game])}</a></div>
<h2>${esc(W.listT)}</h2><div class="g">${O.items.map(([h, p]) => `<section class="c"><h3>${esc(h)}</h3><p>${esc(p)}</p></section>`).join("")}</div>
<h2>${esc(W.shotsT)}</h2><div class="ovs">${shots.map(([f, c]) => `<figure>${img(l, f, c)}<figcaption>${esc(c)}</figcaption></figure>`).join("")}</div>
<h2>${esc(W.expT)}</h2><p>${esc(W.exp)}</p>
<h2>${esc(W.vrT)}</h2><p>${esc(W.vr)}</p>
<h2>${esc(W.howT)}</h2><ul>${W.how.map((x) => `<li>${esc(x)}</li>`).join("")}</ul>
<h2>${esc(L.faqT)}</h2>${O.faq.map(([q, a]) => `<details open><summary>${esc(q)}</summary><p>${esc(a)}</p></details>`).join("")}
${game === "lmu" ? `<p class="x">${esc(T[l].other.lmu)} <a href="${OVL[l].path}">${esc(OVL[l].h1)} →</a></p>` : `<p class="x">${esc(T[l].other.iracing)} <a href="${OVLL[l].path}">${esc(OVLL[l].h1)} →</a></p>`}`;
  const ld = [crumbs(game === "lmu" ? [["Pitlane HQ", LAND[l].path], ["Le Mans Ultimate", LANDL[l].path], [O.h1, O.path]] : [["Pitlane HQ", LAND[l].path], [O.h1, O.path]]),
    appLd(l, O.desc, shots.map(([f]) => f)), faqLd(O.faq)];
  return html(page(l, { title: O.title, desc: O.desc, path: O.path, alts: game === "lmu" ? OVLL_ALTS : OVL_ALTS, body, ld, game }));
}

// ---------- the leagues ----------
// Leagues for people who search "iRacing leagues", "ligas de Le Mans Ultimate"…: the leagues posted on Pitlane HQ (their
// race days and start time) and the most active leagues found on Reddit (who is on their Discord now). iRacing's, all
// of them and one page per discipline; Le Mans Ultimate's (all sports cars) on one page, only while there are some.
const LG_CAT = { en: { oval: "oval", sports_car: "sports-car", formula_car: "formula", dirt_oval: "dirt-oval", dirt_road: "dirt-road" },
  es: { oval: "ovalo", sports_car: "sports-car", formula_car: "formula", dirt_oval: "ovalo-de-tierra", dirt_road: "tierra" },
  pt: { oval: "oval", sports_car: "sports-car", formula_car: "formula", dirt_oval: "oval-de-terra", dirt_road: "terra" } };
const LG_DAYS = { en: ["Mon", "Tue", "Wed", "Thu", "Fri", "Sat", "Sun"], es: ["Lun", "Mar", "Mié", "Jue", "Vie", "Sáb", "Dom"], pt: ["Seg", "Ter", "Qua", "Qui", "Sex", "Sáb", "Dom"] };
// a discipline's page is indexed only with this many leagues (a page of one league says little of its own)
const LG_MIN = 3;
const LGW = {
  en: { posted: "Leagues posted on Pitlane HQ", byCat: "By discipline", all: "All", post: "Post your league for free", join: "Join the Discord", site: "Website", online: "online", members: "members",
    none: "No leagues yet.", upd: "Updated", open: "Looking for drivers", races: "Races", cars: "Cars", lang: "Language", see: "See it in Pitlane HQ" },
  es: { posted: "Ligas publicadas en Pitlane HQ", byCat: "Por disciplina", all: "Todas", post: "Publica tu liga gratis", join: "Unirse al Discord", site: "Web", online: "conectados", members: "miembros",
    none: "Aún no hay ligas.", upd: "Actualizado", open: "Busca pilotos", races: "Corre", cars: "Coches", lang: "Idioma", see: "Verla en Pitlane HQ" },
  pt: { posted: "Ligas publicadas no Pitlane HQ", byCat: "Por disciplina", all: "Todas", post: "Publique sua liga de graça", join: "Entrar no Discord", site: "Site", online: "online", members: "membros",
    none: "Ainda não há ligas.", upd: "Atualizado", open: "Procura pilotos", races: "Corre", cars: "Carros", lang: "Idioma", see: "Ver no Pitlane HQ" },
};
const LEAG = {
  en: { path: "/iracing-leagues", title: "iRacing leagues to join, with their Discord · Pitlane HQ", catT: (c) => `iRacing ${c} leagues to join · Pitlane HQ`,
    desc: "Find an iRacing league to race in. Leagues looking for drivers, the days they race and how many drivers are on their Discord right now.",
    catD: (c) => `${cap(c)} leagues on iRacing you can join, with the days they race, their Discord and how many drivers are online now.`,
    h1: "iRacing leagues", catH: (c) => `iRacing ${c} leagues`, lead: "Leagues to race in on iRacing, posted by their organisers on Pitlane HQ, and the most active leagues sorted by how many drivers are on their Discord right now. Join one in a click, or post your own league for free.",
    catLead: (c) => `iRacing ${c} leagues to race in, posted by their organisers on Pitlane HQ or found on Reddit, sorted by how many drivers are on their Discord right now.`,
    active: "The most active iRacing leagues", any: "iRacing league",
    catQ: (c) => [`Where do I find an iRacing ${c} league?`, `Here, sorted by how many drivers are online on its Discord. Every card links to the league's Discord or website.`],
    faq: [["How do I join an iRacing league?", "Pick a league here and join its Discord or its website. The organisers say there when the league races, which cars and tracks it uses and how to sign up."],
      ["Do iRacing leagues cost anything?", "Most leagues are free to join. You need an iRacing subscription and the cars and tracks the league races with."],
      ["How are these leagues chosen?", "Some are posted by their organisers on Pitlane HQ. The others are leagues posted on Reddit with a Discord invite, and every few hours Pitlane HQ reads how many members each Discord has and how many are online."],
      ["Can I add my league?", "Yes. Create a free Pitlane HQ account and post it in Community → Leagues with its race days, its start time, its Discord or its website."]] },
  es: { path: "/es/ligas-iracing", title: "Ligas de iRacing para unirte, con su Discord · Pitlane HQ", catT: (c) => `Ligas de ${c} de iRacing para unirte · Pitlane HQ`,
    desc: "Encuentra una liga de iRacing en la que correr. Ligas que buscan pilotos, los días que corren y cuántos pilotos hay ahora en su Discord.",
    catD: (c) => `Ligas de ${c} en iRacing a las que puedes unirte, con los días que corren, su Discord y cuántos pilotos hay conectados ahora.`,
    h1: "Ligas de iRacing", catH: (c) => `Ligas de ${c} de iRacing`, lead: "Ligas en las que correr en iRacing, publicadas por sus organizadores en Pitlane HQ, y las ligas más activas ordenadas por cuántos pilotos hay ahora mismo en su Discord. Únete a una con un clic, o publica tu liga gratis.",
    catLead: (c) => `Ligas de ${c} de iRacing en las que correr, publicadas por sus organizadores en Pitlane HQ o encontradas en Reddit, ordenadas por cuántos pilotos hay ahora en su Discord.`,
    active: "Las ligas de iRacing más activas", any: "Liga de iRacing",
    catQ: (c) => [`¿Dónde encuentro una liga de ${c} de iRacing?`, `Aquí, ordenadas por cuántos pilotos hay conectados en su Discord. Cada tarjeta lleva al Discord o a la web de la liga.`],
    faq: [["¿Cómo me uno a una liga de iRacing?", "Elige una liga aquí y entra en su Discord o en su web. Los organizadores cuentan ahí cuándo corre la liga, con qué coches y circuitos, y cómo apuntarte."],
      ["¿Cuestan algo las ligas de iRacing?", "La mayoría de las ligas son gratis. Necesitas una suscripción de iRacing y los coches y circuitos con los que corre la liga."],
      ["¿Cómo se eligen estas ligas?", "Unas las publican sus organizadores en Pitlane HQ. Las demás son ligas publicadas en Reddit con una invitación de Discord, y cada pocas horas Pitlane HQ lee cuántos miembros tiene cada Discord y cuántos están conectados."],
      ["¿Puedo añadir mi liga?", "Sí. Crea una cuenta gratis de Pitlane HQ y publícala en Comunidad → Ligas con sus días de carrera, su hora de inicio, su Discord o su web."]] },
  pt: { path: "/pt/ligas-iracing", title: "Ligas de iRacing para entrar, com o Discord · Pitlane HQ", catT: (c) => `Ligas de ${c} do iRacing para entrar · Pitlane HQ`,
    desc: "Encontre uma liga de iRacing para correr. Ligas que procuram pilotos, os dias em que correm e quantos pilotos estão no Discord delas agora.",
    catD: (c) => `Ligas de ${c} no iRacing em que você pode entrar, com os dias em que correm, o Discord e quantos pilotos estão online agora.`,
    h1: "Ligas de iRacing", catH: (c) => `Ligas de ${c} do iRacing`, lead: "Ligas para correr no iRacing, publicadas pelos organizadores no Pitlane HQ, e as ligas mais ativas ordenadas por quantos pilotos estão no Discord delas agora. Entre numa com um clique, ou publique sua liga de graça.",
    catLead: (c) => `Ligas de ${c} do iRacing para correr, publicadas pelos organizadores no Pitlane HQ ou encontradas no Reddit, ordenadas por quantos pilotos estão no Discord agora.`,
    active: "As ligas de iRacing mais ativas", any: "Liga de iRacing",
    catQ: (c) => [`Onde encontro uma liga de ${c} do iRacing?`, `Aqui, ordenadas por quantos pilotos estão online no Discord. Cada cartão leva ao Discord ou ao site da liga.`],
    faq: [["Como entro numa liga de iRacing?", "Escolha uma liga aqui e entre no Discord ou no site dela. Os organizadores contam lá quando a liga corre, com quais carros e pistas e como se inscrever."],
      ["As ligas de iRacing custam algo?", "A maioria das ligas é grátis. Você precisa de uma assinatura do iRacing e dos carros e pistas com que a liga corre."],
      ["Como essas ligas são escolhidas?", "Algumas são publicadas pelos organizadores no Pitlane HQ. As outras são ligas publicadas no Reddit com um convite do Discord, e a cada poucas horas o Pitlane HQ lê quantos membros cada Discord tem e quantos estão online."],
      ["Posso adicionar minha liga?", "Sim. Crie uma conta grátis no Pitlane HQ e publique em Comunidade → Ligas com os dias de corrida, a hora de início, o Discord ou o site."]] },
};
const LEAGL = {
  en: { path: "/le-mans-ultimate-leagues", title: "Le Mans Ultimate leagues to join · Pitlane HQ",
    desc: "Find a Le Mans Ultimate league to race in. LMU leagues looking for drivers, the days they race and how many drivers are on their Discord right now.",
    h1: "Le Mans Ultimate leagues", lead: "Leagues to race in on Le Mans Ultimate, posted by their organisers on Pitlane HQ or found on Reddit, sorted by how many drivers are on their Discord right now. Join one in a click, or post your own league for free.",
    active: "The most active Le Mans Ultimate leagues", any: "Le Mans Ultimate league",
    faq: [["How do I join a Le Mans Ultimate league?", "Pick a league here and join its Discord or its website. The organisers say there when it races, which classes and tracks it uses and how to sign up."],
      ["Do LMU leagues cost anything?", "Most are free to join. You need Le Mans Ultimate and the content the league races with."],
      ["How are these leagues chosen?", "Some are posted by their organisers on Pitlane HQ. The others are leagues posted on Reddit with a Discord invite, and every few hours Pitlane HQ reads how many members each Discord has and how many are online."],
      ["Can I add my league?", "Yes. Create a free Pitlane HQ account and post it in Community → Leagues, choosing Le Mans Ultimate."]] },
  es: { path: "/es/ligas-le-mans-ultimate", title: "Ligas de Le Mans Ultimate para unirte · Pitlane HQ",
    desc: "Encuentra una liga de Le Mans Ultimate en la que correr. Ligas de LMU que buscan pilotos, los días que corren y cuántos pilotos hay ahora en su Discord.",
    h1: "Ligas de Le Mans Ultimate", lead: "Ligas en las que correr en Le Mans Ultimate, publicadas por sus organizadores en Pitlane HQ o encontradas en Reddit, ordenadas por cuántos pilotos hay ahora en su Discord. Únete a una con un clic, o publica tu liga gratis.",
    active: "Las ligas de Le Mans Ultimate más activas", any: "Liga de Le Mans Ultimate",
    faq: [["¿Cómo me uno a una liga de Le Mans Ultimate?", "Elige una liga aquí y entra en su Discord o en su web. Los organizadores cuentan ahí cuándo corre, con qué clases y circuitos, y cómo apuntarte."],
      ["¿Cuestan algo las ligas de LMU?", "La mayoría son gratis. Necesitas Le Mans Ultimate y el contenido con el que corre la liga."],
      ["¿Cómo se eligen estas ligas?", "Unas las publican sus organizadores en Pitlane HQ. Las demás son ligas publicadas en Reddit con una invitación de Discord, y cada pocas horas Pitlane HQ lee cuántos miembros tiene cada Discord y cuántos están conectados."],
      ["¿Puedo añadir mi liga?", "Sí. Crea una cuenta gratis de Pitlane HQ y publícala en Comunidad → Ligas, eligiendo Le Mans Ultimate."]] },
  pt: { path: "/pt/ligas-le-mans-ultimate", title: "Ligas de Le Mans Ultimate para entrar · Pitlane HQ",
    desc: "Encontre uma liga de Le Mans Ultimate para correr. Ligas de LMU que procuram pilotos, os dias em que correm e quantos pilotos estão no Discord agora.",
    h1: "Ligas de Le Mans Ultimate", lead: "Ligas para correr no Le Mans Ultimate, publicadas pelos organizadores no Pitlane HQ ou encontradas no Reddit, ordenadas por quantos pilotos estão no Discord agora. Entre numa com um clique, ou publique sua liga de graça.",
    active: "As ligas de Le Mans Ultimate mais ativas", any: "Liga de Le Mans Ultimate",
    faq: [["Como entro numa liga de Le Mans Ultimate?", "Escolha uma liga aqui e entre no Discord ou no site dela. Os organizadores contam lá quando corre, com quais classes e pistas e como se inscrever."],
      ["As ligas de LMU custam algo?", "A maioria é grátis. Você precisa do Le Mans Ultimate e do conteúdo com que a liga corre."],
      ["Como essas ligas são escolhidas?", "Algumas são publicadas pelos organizadores no Pitlane HQ. As outras são ligas publicadas no Reddit com um convite do Discord, e a cada poucas horas o Pitlane HQ lê quantos membros cada Discord tem e quantos estão online."],
      ["Posso adicionar minha liga?", "Sim. Crie uma conta grátis no Pitlane HQ e publique em Comunidade → Ligas, escolhendo Le Mans Ultimate."]] },
};
const LEAG_ALTS = altsOf(LEAG), LEAGL_ALTS = altsOf(LEAGL);
const lgPath = (l, cat) => LEAG[l].path + (cat ? "/" + LG_CAT[l][cat] : "");
const lgAlts = (cat) => ({ en: lgPath("en", cat), es: lgPath("es", cat), pt: lgPath("pt", cat) });
const LG_CN = { en: { oval: "oval", sports_car: "sports car", formula_car: "formula", dirt_oval: "dirt oval", dirt_road: "dirt road" },
  es: { oval: "óvalo", sports_car: "Sports Car", formula_car: "fórmula", dirt_oval: "óvalo de tierra", dirt_road: "tierra" },
  pt: { oval: "oval", sports_car: "Sports Car", formula_car: "fórmula", dirt_oval: "oval de terra", dirt_road: "terra" } };
// the leagues posted in the hub of one game, newest first
async function postedLeagues(env, game) {
  const r = await env.DB.prepare("SELECT id, name, about, cats, days, time, tz, open, discord, web, cars, lang, updated FROM leagues WHERE game=?1 ORDER BY open DESC, updated DESC LIMIT 100").bind(game).all().catch(() => ({ results: [] }));
  const lst = (v) => { try { return JSON.parse(v || "[]") || []; } catch (e) { return []; } };
  return (r.results || []).map((x) => ({ ...x, cats: lst(x.cats), days: lst(x.days).map(Number).filter((d) => d >= 0 && d <= 6) }));
}
async function leaguesData(env, game = "iracing") {
  const [posted, F] = await Promise.all([postedLeagues(env, game), foundLeagues(env, false, game).catch(() => ({ leagues: [] }))]);
  const lastPost = Math.max(0, ...posted.map((x) => +x.updated || 0));
  return { posted, found: F.leagues || [], updated: Math.max(F.updated || 0, lastPost) };
}
// how many leagues each discipline of iRacing has
const catCounts = (D) => { const n = {}; for (const x of D.posted.concat(D.found)) for (const c of x.cats || []) n[c] = (n[c] || 0) + 1; return n; };
async function leaguesPage(env, l, cat, game = "iracing") {
  const lmu = game === "lmu", G = (lmu ? LEAGL : LEAG)[l], W = LGW[l], D = await leaguesData(env, game), has = (x) => !cat || (x.cats || []).includes(cat);
  const posted = D.posted.filter(has), found = D.found.filter(has).slice(0, 40);
  if ((cat || lmu) && !posted.length && !found.length) return notFound(l);
  const cn = cat ? LG_CN[l][cat] : "", path = lmu ? G.path : lgPath(l, cat), num = (n) => Number(n || 0).toLocaleString(HLANG[l]);
  const counts = catCounts(D), cats = lmu ? [] : Object.keys(CAT.en).filter((k) => counts[k]);
  const catsOf = (x) => (lmu ? [] : (x.cats || []).map((c) => CAT[l][c] || c)).join(" · ") || G.any;
  const ext = (u) => /^https:\/\//.test(String(u || "")) ? esc(u) : "";
  const postedHTML = posted.map((x) => `<section class="c lg"><h3>${esc(fix(x.name))}</h3><p class="m k">${esc(catsOf(x))}${x.open ? ` · <b class="on">${esc(W.open)}</b>` : ""}</p>
${x.days.length ? `<p style="margin:0 0 4px">${esc(W.races)} ${esc(x.days.map((d) => LG_DAYS[l][d]).join(", "))}${x.time ? ` · ${esc(x.time)}${x.tz ? ` (${esc(x.tz)})` : ""}` : ""}</p>` : ""}${x.cars ? `<p class="m" style="margin:0 0 4px">${esc(W.cars)} ${esc(fix(x.cars))}</p>` : ""}${x.lang ? `<p class="m" style="margin:0 0 4px">${esc(W.lang)} ${esc(x.lang)}</p>` : ""}${x.about ? `<p class="m" style="font-size:14px;margin:6px 0 10px">${esc(fix(x.about).slice(0, 400))}</p>` : ""}
<p style="margin:8px 0 0">${ext(x.discord) ? `<a class="btn" href="${ext(x.discord)}" rel="nofollow noopener" target="_blank">${esc(W.join)}</a> ` : ""}${ext(x.web) ? `<a class="btn" href="${ext(x.web)}" rel="nofollow noopener" target="_blank">${esc(W.site)}</a> ` : ""}<a href="/?league=${encodeURIComponent(x.id)}" rel="nofollow">${esc(W.see)}</a></p></section>`).join("");
  const foundHTML = found.map((x) => `<section class="c lg">${x.icon ? `<img src="${esc(x.icon)}" alt="" width="44" height="44" loading="lazy" decoding="async">` : ""}<h3>${esc(fix(x.name))}</h3><p class="m k">${esc(catsOf(x))}</p><p style="margin:0 0 6px"><b class="on">${num(x.online)}</b> ${esc(W.online)} · <b>${num(x.members)}</b> ${esc(W.members)}</p>${x.title ? `<p class="m" style="font-size:14px;margin:0 0 10px">${esc(fix(x.title))}</p>` : ""}<a class="btn" href="${esc(x.invite)}" rel="nofollow noopener" target="_blank">${esc(W.join)}</a></section>`).join("");
  const faq = cat ? [G.catQ(cn), ...G.faq] : G.faq;
  // the other game's leagues, when there are any
  const otherLg = lmu ? `<p class="x"><a href="${LEAG[l].path}">${esc(LEAG[l].h1)} →</a></p>` : HAS.lmuLeagues ? `<p class="x"><a href="${LEAGL[l].path}">${esc(LEAGL[l].h1)} →</a></p>` : "";
  const body = `<h1>${esc(cat ? G.catH(cn) : G.h1)}</h1><p class="lead">${esc(cat ? G.catLead(cn) : G.lead)}</p>
<div class="cta"><a class="btn p" href="/?league-post=1" rel="nofollow">${esc(W.post)}</a><a class="btn" href="${(lmu ? LANDL : LAND)[l].path}">${esc(T[l].tel[game])}</a></div>
${cats.length ? `<div class="cats" aria-label="${esc(W.byCat)}"><a href="${lgPath(l)}"${cat ? "" : ' class="on"'}>${esc(W.all)}</a>${cats.map((k) => `<a href="${lgPath(l, k)}"${k === cat ? ' class="on"' : ""}>${esc(CAT[l][k])}</a>`).join("")}</div>` : ""}
${posted.length ? `<h2>${esc(W.posted)}</h2><div class="g">${postedHTML}</div>` : ""}
${found.length ? `<h2>${esc(G.active)}</h2><div class="g">${foundHTML}</div>${D.updated ? `<p class="m" style="font-size:14px">${esc(W.upd)} ${day(D.updated)}</p>` : ""}` : ""}
${!posted.length && !found.length ? `<p class="m">${esc(W.none)}</p>` : ""}
<h2>${esc(LAND[l].faqT)}</h2>${faq.map(([q, a]) => `<details open><summary>${esc(q)}</summary><p>${esc(a)}</p></details>`).join("")}${otherLg}`;
  const root = lmu ? [["Pitlane HQ", LAND[l].path], ["Le Mans Ultimate", LANDL[l].path], [G.h1, G.path]] : [["Pitlane HQ", LAND[l].path], [G.h1, G.path]];
  const ld = [crumbs(cat ? [...root, [CAT[l][cat], path]] : root), faqLd(faq)];
  // a discipline with few leagues, or no league at all: shown to people, never indexed
  const thin = cat ? posted.length + found.length < LG_MIN : !posted.length && !found.length;
  return html(page(l, { title: cat ? G.catT(cn) : G.title, desc: cat ? G.catD(cn) : G.desc, path, alts: lmu ? LEAGL_ALTS : lgAlts(cat), body, ld, noindex: thin, game }), 1800);
}

// ---------- the leaderboards ----------
// the records of a game: its index and one page per car and track; Le Mans Ultimate's under its own prefix (its ids
// are its own, never mixed with iRacing's)
const REC_IDX = { iracing: { en: "/records", es: "/es/records", pt: "/pt/records" }, lmu: { en: "/le-mans-ultimate-records", es: "/es/records-le-mans-ultimate", pt: "/pt/recordes-le-mans-ultimate" } };
async function topCombos(env, n, game = "iracing") {
  const r = await env.DB.prepare(
    "SELECT track_id AS t, MAX(track) AS track, car_id AS c, MAX(car) AS car, COUNT(DISTINCT user_id) AS drivers, MIN(time) AS best, MAX(cat) AS hint, MAX(created) AS upd FROM community_laps WHERE game=?2 AND track_id>0 AND car_id>0 AND COALESCE(shown,'')<>'model' GROUP BY track_id, car_id ORDER BY drivers DESC, best LIMIT ?1"
  ).bind(n, game).all().catch(() => ({ results: [] }));
  return (r.results || []).map((x) => ({ ...x, car: famName(game, x.c, x.car) }));
}
const recPath = (l, x, game = "iracing") => `${PRE[l]}/records/${game === "lmu" ? "lmu/" : ""}${x.t}-${x.c}/${slug(fix(x.track) + " " + fix(x.car))}`;
const recAlts = (x, game) => ({ en: recPath("en", x, game), es: recPath("es", x, game), pt: recPath("pt", x, game) });
// Le Mans Ultimate races sports cars only
const catFor = (cm, game, x, hint, track, car) => (game === "lmu" ? "sports_car" : catOf(cm, x.t, x.c, hint, track, car));

async function landing(env, l, game) {
  const lmu = game === "lmu", L = (lmu ? LANDL : LAND)[l], combos = await topCombos(env, 8, game);
  const guides = lmu ? [...TOPICS.filter((x) => x.game === "lmu").map((x) => x[l]), OVLL[l], ...(HAS.lmuLeagues ? [LEAGL[l]] : []), ...lmuToo(l)]
    : [...TOPICS.filter((x) => x.game !== "lmu").map((x) => x[l]), OVL[l], LEAG[l]];
  const body = `<h1>${esc(L.h1)}</h1><p class="lead">${esc(L.lead)}</p>
<div class="cta"><a class="btn p" href="/dl/PitlaneHQ-Setup.exe">${esc(L.dl)}</a><a class="btn" href="/">${esc(L.app)}</a></div>
<div class="g">${L.cards.map(([h, p]) => `<section class="c"><h2>${esc(h)}</h2><p>${esc(p)}</p></section>`).join("")}</div>
${shot(l, lmu ? "coach.jpg" : "compare.jpg")}
${cross(l, game)}
<h2>${esc(GUIDES[l])}</h2><div class="g">${guides.map((x) => `<a class="c" href="${x.path}"><h3>${esc(x.h1)} →</h3><p>${esc(x.desc)}</p></a>`).join("")}</div>
${combos.length ? `<h2>${esc(L.recs)}</h2><p class="m">${esc(L.recsLead)}</p><div class="tw"><table><tbody>${combos.map((x) => `<tr><td><a href="${recPath(l, x, game)}">${esc(fix(x.track))}</a></td><td class="m">${esc(fix(x.car))}</td><td class="t">${fmt(x.best)}</td></tr>`).join("")}</tbody></table></div><p><a href="${REC_IDX[game][l]}">${esc(T[l].rec)} →</a></p>` : ""}
<h2>${esc(L.faqT)}</h2>${L.faq.map(([q, a]) => `<details><summary>${esc(q)}</summary><p>${esc(a)}</p></details>`).join("")}`;
  const ld = [...(lmu ? [crumbs([["Pitlane HQ", LAND[l].path], ["Le Mans Ultimate", L.path]])] : []), appLd(l, L.desc, [lmu ? "coach.jpg" : "compare.jpg"]), ...siteLd(l), faqLd(L.faq)];
  return html(page(l, { title: L.title, desc: L.desc, path: L.path, alts: lmu ? LANDL_ALTS : LAND_ALTS, body, ld, game }));
}

async function recordsIndex(env, l, cat, game = "iracing") {
  const all = await topCombos(env, 1000, game), cm = game === "lmu" ? { tc: {}, c: {} } : await catMap(env).catch(() => ({ tc: {}, c: {} }));
  if (game === "lmu" && !all.length) return notFound(l);
  const gn = GNAME[game], rows = all.map((x) => ({ ...x, cat: catFor(cm, game, x, x.hint, x.track, x.car) }));
  const cats = Object.keys(CAT.en).filter((k) => rows.some((x) => x.cat === k));
  const list = cat ? rows.filter((x) => x.cat === cat) : rows;
  const W = S[l], A = REC_IDX[game], base = A[l], q = cat ? "?d=" + cat : "", path = base + q;
  const title = `${W.recH(gn)}${cat ? " · " + CAT[l][cat] : ""} · Pitlane HQ`, desc = W.recD(gn);
  const body = `<h1>${esc(W.recH(gn))}</h1><p class="lead">${esc(desc)}</p>
${cats.length > 1 ? `<div class="cats"><a href="${base}"${cat ? "" : ' class="on"'}>${esc(W.all)}</a>${cats.map((k) => `<a href="${base}?d=${k}"${k === cat ? ' class="on"' : ""}>${esc(CAT[l][k])}</a>`).join("")}</div>` : ""}
${list.length ? `<div class="tw"><table><thead><tr><th>${esc(W.track)}</th><th>${esc(W.car)}</th><th>${esc(W.record)}</th><th>${esc(W.drivers)}</th></tr></thead><tbody>${list.map((x) => `<tr><td><a href="${recPath(l, x, game)}">${esc(fix(x.track))}</a></td><td class="m">${esc(fix(x.car))}</td><td class="t">${fmt(x.best)}</td><td class="m">${x.drivers}</td></tr>`).join("")}</tbody></table></div>` : `<p class="m">${esc(W.none)}</p>`}
<h2>${esc(W.howT)}</h2><p>${esc(W.how(gn))}</p>
<h2>${esc(LAND[l].faqT)}</h2>${W.faq(gn).map(([q, a]) => `<details open><summary>${esc(q)}</summary><p>${esc(a)}</p></details>`).join("")}${cross(l, game)}`;
  const root = game === "lmu" ? [["Pitlane HQ", LAND[l].path], ["Le Mans Ultimate", LANDL[l].path], [T[l].rec, base]] : [["Pitlane HQ", LAND[l].path], [T[l].rec, base]];
  const ld = [crumbs(root),
    { "@context": "https://schema.org", "@type": "ItemList", name: W.recH(gn), itemListElement: list.slice(0, 100).map((x, i) => ({ "@type": "ListItem", position: i + 1, url: SITE + recPath(l, x, game), name: fix(x.car) + " · " + fix(x.track) })) }, faqLd(W.faq(gn))];
  return html(page(l, { title, desc, path, alts: { en: A.en + q, es: A.es + q, pt: A.pt + q }, body, ld, noindex: !list.length, game }));
}

async function recordsCombo(env, l, t, c, asked, game = "iracing") {
  c = await famId(env, game, c); // the brands of one car have one page (an old address of another brand goes there)
  // the names as the sitemap and the index have them (one address per car and track); any other spelling of
  // the address goes there for good (301), so search engines see one page, not several
  const nm = await env.DB.prepare("SELECT MAX(track) AS track, MAX(car) AS car FROM community_laps WHERE track_id=?1 AND car_id=?2 AND game=?3").bind(t, c, game).first().catch(() => null);
  if (!nm || !nm.track) return null;
  nm.car = famName(game, c, nm.car);
  const canon = recPath(l, { t, c, track: nm.track, car: nm.car }, game);
  if (asked !== canon) return Response.redirect(SITE + canon, 301);
  const r = await env.DB.prepare(
    `SELECT l.user_id AS uid, CASE WHEN l.anon=1 OR COALESCE(ac.anon,0)=1 OR u.alias='Anonymous' THEN '' ELSE u.alias END AS alias, l.time, l.created, l.track, l.car, l.cat
       FROM community_laps l JOIN community_users u ON u.id=l.user_id LEFT JOIN accounts ac ON ac.id=l.user_id
      WHERE l.track_id=?1 AND l.car_id=?2 AND l.game=?3 AND COALESCE(l.shown,'')<>'model' ORDER BY l.time LIMIT 300`
  ).bind(t, c, game).all().catch(() => ({ results: [] }));
  const seen = new Set(), laps = [];
  for (const x of r.results || []) { if (seen.has(x.uid)) continue; seen.add(x.uid); laps.push(x); if (laps.length >= 50) break; }
  if (!laps.length) return null;
  const gn = GNAME[game], track = fix(nm.track), car = fix(nm.car), cm = game === "lmu" ? { tc: {}, c: {} } : await catMap(env).catch(() => ({ tc: {}, c: {} }));
  const x = { t, c, track, car }, cat = catFor(cm, game, x, laps[0].cat, laps[0].track, laps[0].car);
  const W = S[l], rec = fmt(laps[0].time), idx = REC_IDX[game][l];
  const title = recTitle(W, car, track, game), desc = W.cD(car, track, rec, laps.length, gn), L = (game === "lmu" ? LANDL : LAND)[l];
  const body = `<p class="m"><a href="${idx}">${esc(W.recH(gn))}</a>${game === "lmu" ? "" : ` · <a href="${idx}?d=${cat}">${esc(CAT[l][cat] || "")}</a>`}</p>
<h1>${esc(car)}<br><span class="m" style="font-size:.7em">${esc(track)}</span></h1>
<p class="lead">${esc(W.cL(rec))}</p>
<div class="tw"><table><thead><tr><th class="n">#</th><th>${esc(W.driver)}</th><th>${esc(W.time)}</th><th>${esc(W.date)}</th></tr></thead><tbody>${laps.map((v, i) => `<tr><td class="n">${i + 1}</td><td>${esc(v.alias || W.anon)}</td><td class="t">${fmt(v.time)}</td><td class="m">${day(v.created)}</td></tr>`).join("")}</tbody></table></div>
<div class="c" style="margin-top:22px"><h2>${esc(W.cQ)}</h2><p>${esc(W.cA(gn))}</p><div class="cta" style="margin-bottom:0"><a class="btn p" href="/dl/PitlaneHQ-Setup.exe">${esc(L.dl)}</a><a class="btn" href="${L.path}">${esc(T[l].tel[game])}</a></div></div>`;
  const ld = [crumbs([["Pitlane HQ", LAND[l].path], ...(game === "lmu" ? [["Le Mans Ultimate", LANDL[l].path]] : []), [T[l].rec, idx], [car + " · " + track, recPath(l, x, game)]])];
  return html(page(l, { title, desc, path: recPath(l, x, game), alts: recAlts(x, game), body, ld, game }));
}

// an address of the public pages that does not exist: a real 404 (never the app), so it is not indexed
export const notFound = (l) => noIndex(html(page(l, { title: S[l].nfT + " · Pitlane HQ", desc: S[l].nf, path: null, noindex: true,
  body: `<h1>${esc(S[l].nf)}</h1><p><a href="${LAND[l].path}">${esc(T[l].tel.iracing)}</a> · <a href="${LANDL[l].path}">${esc(T[l].tel.lmu)}</a> · <a href="${REC_IDX.iracing[l]}">${esc(T[l].rec)}</a> · <a href="/">${esc(T[l].app)}</a></p>` }), 600, 404));
const noIndex = (r) => { r.headers.set("x-robots-tag", "noindex"); r.headers.set("cache-control", "public, max-age=60"); return r; };

// ---------- the guides (seo-topics.js) ----------
const topicAlts = (x) => altsOf(x);
function topicPage(x, l) {
  const G = x[l], lmu = x.game === "lmu", L = (lmu ? LANDL : LAND)[l], game = lmu ? "lmu" : "iracing";
  const more = lmu ? lmuLinks(l).filter(([p]) => p !== G.path).concat(lmuToo(l).map((x) => [x.path, x.h1]))
    : iracingLinks(l).filter(([p]) => p !== G.path).concat([[L.path, L.h1]]);
  // the same thing for Le Mans Ultimate (or the guide of the other game)
  const to = x.lmu ? (x.lmu === "tel" ? LANDL[l] : TOPIC_BY[x.lmu] ? TOPIC_BY[x.lmu][l] : null) : lmu ? TOPIC_BY.coach[l] : null;
  const body = `<h1>${esc(G.h1)}</h1><p class="lead">${esc(G.lead)}</p>
<div class="cta"><a class="btn p" href="/dl/PitlaneHQ-Setup.exe">${esc(L.dl)}</a><a class="btn" href="/">${esc(L.app)}</a></div>
<div class="g">${G.secs.map(([h, p]) => `<section class="c"><h2>${esc(h)}</h2><p>${esc(p)}</p></section>`).join("")}</div>
${x.img ? shot(l, x.img) : ""}${x.phones ? phones(l, x.phones) : ""}
${to ? `<p class="x">${esc(T[l].other[game])} <a href="${to.path}">${esc(to.h1)} →</a></p>` : ""}
<h2>${esc(L.faqT)}</h2>${G.faq.map(([q, a]) => `<details open><summary>${esc(q)}</summary><p>${esc(a)}</p></details>`).join("")}
<h2>${esc(GUIDES[l])}</h2><ul>${more.map(([p, h]) => `<li><a href="${p}">${esc(h)}</a></li>`).join("")}</ul>`;
  const ld = [crumbs(lmu ? [["Pitlane HQ", LAND[l].path], ["Le Mans Ultimate", LANDL[l].path], [G.h1, G.path]] : [["Pitlane HQ", LAND[l].path], [G.h1, G.path]]),
    faqLd(G.faq), appLd(l, G.desc, x.img ? [x.img] : x.phones || [])];
  return html(page(l, { title: G.title, desc: G.desc, path: G.path, alts: topicAlts(x), body, ld, game }));
}

// ---------- the addresses ----------
// every page with its three languages, the function that draws it and the short addresses that lead to it (301)
const PAGES = [
  { alts: LAND_ALTS, draw: (env, l) => landing(env, l, "iracing"), alias: { en: ["/telemetry"], es: ["/es/telemetria", "/es"], pt: ["/pt/telemetria", "/pt", "/pt-br"] } },
  { alts: LANDL_ALTS, draw: (env, l) => landing(env, l, "lmu"), alias: { en: ["/lmu-telemetry", "/le-mans-ultimate", "/lmu"], es: ["/es/telemetria-lmu", "/es/le-mans-ultimate", "/es/lmu"], pt: ["/pt/telemetria-lmu", "/pt/le-mans-ultimate", "/pt/lmu"] } },
  { alts: OVL_ALTS, draw: (env, l) => overlaysPage(l, "iracing"), alias: { en: ["/overlays"], es: ["/es/overlays"], pt: ["/pt/overlays"] } },
  { alts: OVLL_ALTS, draw: (env, l) => overlaysPage(l, "lmu"), alias: { en: ["/lmu-overlays"], es: ["/es/overlays-lmu"], pt: ["/pt/overlays-lmu"] } },
  { alts: LEAG_ALTS, draw: (env, l) => leaguesPage(env, l, "", "iracing"), alias: { en: ["/leagues"], es: ["/es/ligas"], pt: ["/pt/ligas"] } },
  { alts: LEAGL_ALTS, draw: (env, l) => leaguesPage(env, l, "", "lmu"), alias: { en: ["/lmu-leagues"], es: ["/es/ligas-lmu"], pt: ["/pt/ligas-lmu"] } },
  { alts: REC_IDX.iracing, draw: (env, l, cat) => recordsIndex(env, l, cat, "iracing"), alias: {} },
  { alts: REC_IDX.lmu, draw: (env, l, cat) => recordsIndex(env, l, cat, "lmu"), alias: { en: ["/lmu-records"], es: ["/es/records-lmu"], pt: ["/pt/recordes-lmu"] } },
  ...TOPICS.map((x) => ({ alts: topicAlts(x), draw: (env, l) => topicPage(x, l), alias: x.id === "lmu-coach" ? { en: ["/lmu-coach"], es: ["/es/coach-lmu"], pt: ["/pt/coach-lmu"] } : {} })),
];
const AT = new Map(); // address → [page, language, canonical address]
for (const pg of PAGES) for (const l of LANGS) { AT.set(pg.alts[l], [pg, l, pg.alts[l]]); for (const a of pg.alias[l] || []) AT.set(a, [pg, l, pg.alts[l]]); }
// every page that never depends on data, for the sitemap and IndexNow
const STATIC_ALTS = [LAND_ALTS, LANDL_ALTS, OVL_ALTS, OVLL_ALTS, ...TOPICS.map(topicAlts)];

async function sitemap(env) {
  const [combos, lmuCombos, D, DL] = await Promise.all([topCombos(env, 2000), topCombos(env, 2000, "lmu"), leaguesData(env), leaguesData(env, "lmu")]);
  // every page with its two other languages (xhtml:link), as search engines like them
  const u = (p, f, pr, alts, mod) => `<url><loc>${SITE}${p}</loc>${mod ? `<lastmod>${mod}</lastmod>` : ""}<changefreq>${f}</changefreq><priority>${pr}</priority>${alts ? LANGS.map((k) => `<xhtml:link rel="alternate" hreflang="${HLANG[k]}" href="${SITE}${alts[k]}"/>`).join("") + `<xhtml:link rel="alternate" hreflang="x-default" href="${SITE}${alts.en}"/>` : ""}</url>`;
  const later = (...d) => d.filter(Boolean).sort().pop() || SEO_DATE;
  const newest = (cs) => later(SEO_DATE, day(Math.max(0, ...cs.map((x) => x.upd || 0))));
  const s = [u("/", "weekly", "1.0", null, newest(combos))];
  const all = (alts, f, pr, mod) => { for (const k of LANGS) s.push(u(alts[k], f, k === "en" ? pr : (pr - 0.1).toFixed(1), alts, mod)); };
  all(LAND_ALTS, "weekly", 0.9, newest(combos));
  all(LANDL_ALTS, "weekly", 0.9, newest(lmuCombos));
  all(OVL_ALTS, "monthly", 0.8, SEO_DATE);
  all(OVLL_ALTS, "monthly", 0.8, SEO_DATE);
  for (const x of TOPICS) all(topicAlts(x), "monthly", 0.8, SEO_DATE);
  const lgDay = (d) => later(SEO_DATE, day(d.updated));
  all(LEAG_ALTS, "daily", 0.8, lgDay(D));
  const n = catCounts(D);
  for (const c of Object.keys(CAT.en)) if ((n[c] || 0) >= LG_MIN) all(lgAlts(c), "daily", 0.7, lgDay(D));
  if (DL.posted.length + DL.found.length) all(LEAGL_ALTS, "daily", 0.8, lgDay(DL));
  all(REC_IDX.iracing, "daily", 0.8, newest(combos));
  if (lmuCombos.length) all(REC_IDX.lmu, "daily", 0.8, newest(lmuCombos));
  s.push(u("/downloads", "weekly", "0.7", null, SEO_DATE), u("/changelog", "weekly", "0.4", null, SEO_DATE));
  for (const [game, cs] of [["iracing", combos], ["lmu", lmuCombos]]) for (const x of cs) all(recAlts(x, game), "daily", 0.6, day(x.upd) || SEO_DATE);
  return new Response(`<?xml version="1.0" encoding="UTF-8"?>\n<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9" xmlns:xhtml="http://www.w3.org/1999/xhtml">\n${s.join("\n")}\n</urlset>\n`, { headers: { "content-type": "application/xml; charset=utf-8", "cache-control": "public, max-age=3600" } });
}

// IndexNow: Bing (and through it DuckDuckGo, Yandex…) hears at once about new and changed pages. The key is
// public by design (search engines read it at /<key>.txt); it only proves the pings come from this site.
const INDEXNOW_KEY = "1fbc105af121e0dcfc14e13a8740813a";
export async function indexNow(env) {
  if (env.LOCAL === "1") return; // a local server (one PC, tools/local.cmd) tells no search engine anything
  const row = await env.DB.prepare("SELECT v FROM app_state WHERE k='indexnow_at'").first().catch(() => null);
  const ver = await env.DB.prepare("SELECT v FROM app_state WHERE k='indexnow_ver'").first().catch(() => null);
  const full = !ver || ver.v !== SEO_VER;
  let last = full ? 0 : +((row && row.v) || 0);
  if (!full && Date.now() - last < 20 * 3600e3) return; // once a day
  // after a refusal (429: too many requests) wait 6 hours before trying again, never every 10 minutes
  const tried = await env.DB.prepare("SELECT at FROM app_state WHERE k='indexnow_last'").first().catch(() => null);
  if (tried && Date.now() - tried.at < 6 * 3600e3 && !(last > tried.at)) {
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
    urls.push("/", ...STATIC_ALTS.flatMap((a) => Object.values(a)), ...Object.values(LEAG_ALTS), ...Object.values(REC_IDX.iracing), "/downloads", "/changelog",
      ...Object.keys(CAT.en).filter((c) => (n[c] || 0) >= LG_MIN).flatMap((c) => Object.values(lgAlts(c))),
      ...(DL.posted.length + DL.found.length ? Object.values(LEAGL_ALTS) : []), ...(lmuCombos.length ? Object.values(REC_IDX.lmu) : []));
  } else for (const g of ["iracing", "lmu"]) if (rows.some((x) => (x.game || "iracing") === g)) urls.push(...Object.values(REC_IDX[g]));
  for (const x of rows) { const g = x.game === "lmu" ? "lmu" : "iracing"; urls.push(...Object.values(recAlts({ ...x, car: famName(g, x.c, x.car) }, g))); }
  if (urls.length) {
    const r = await fetch("https://api.indexnow.org/indexnow", { method: "POST", headers: { "content-type": "application/json; charset=utf-8" },
      body: JSON.stringify({ host: "pitlanehq.app", key: INDEXNOW_KEY, keyLocation: `${SITE}/${INDEXNOW_KEY}.txt`, urlList: [...new Set(urls)].slice(0, 10000).map((u) => SITE + u) }) }).catch(() => null);
    // what the search engines answered, for the admins (200/202 accepted; 403 the key file was not reachable; 422 wrong host)
    const said = r ? r.status + " " + (await r.text().catch(() => "")).slice(0, 200) : "no answer";
    await env.DB.prepare("INSERT INTO app_state (k, v, at) VALUES ('indexnow_last', ?1, ?2) ON CONFLICT(k) DO UPDATE SET v=excluded.v, at=excluded.at").bind(JSON.stringify({ said, urls: urls.length }), Date.now()).run().catch(() => {});
    if (!r || r.status >= 300) return; // try again on the next run
  }
  await env.DB.prepare("INSERT INTO app_state (k, v, at) VALUES ('indexnow_at', ?1, ?1) ON CONFLICT(k) DO UPDATE SET v=excluded.v, at=excluded.at").bind(String(Date.now())).run().catch(() => {});
  if (full) await env.DB.prepare("INSERT INTO app_state (k, v, at) VALUES ('indexnow_ver', ?1, ?2) ON CONFLICT(k) DO UPDATE SET v=excluded.v, at=excluded.at").bind(SEO_VER, Date.now()).run().catch(() => {});
}

// the search engines' robots that reached the server (Googlebot, Bingbot…): the last visit of each, for the admins, so
// it is clear whether they get in at all (a robot blocked before the server never shows here)
const BOT = /(Googlebot|Google-InspectionTool|bingbot|YandexBot|DuckDuckBot|Applebot)/i;
async function noteBot(req, env, p) {
  const m = BOT.exec(req.headers.get("user-agent") || "");
  if (!m || !env.DB) return;
  await env.DB.prepare("INSERT INTO app_state (k, v, at) VALUES (?1, ?2, ?3) ON CONFLICT(k) DO UPDATE SET v=excluded.v, at=excluded.at")
    .bind("bot_" + m[1].toLowerCase(), JSON.stringify({ path: p.slice(0, 200) }), Date.now()).run().catch(() => {});
}

// the addresses of the public pages, before anything is read (the rest of the server's addresses pass straight on)
const RECORD_RE = /^(?:\/(es|pt))?\/records\/(?:(lmu)\/)?(\d+)-(\d+)(?:\/[a-z0-9-]*)?$/;
const LEAGUE_CAT_RE = /^(?:\/(es|pt))?\/(?:iracing-leagues|ligas-iracing)\/([a-z-]+)$/;
const isPublic = (p) => p === "/sitemap.xml" || AT.has(p) || RECORD_RE.test(p) || LEAGUE_CAT_RE.test(p) || /^(\/(es|pt))?\/records\//.test(p);

async function draw(req, env, url, p) {
  if (p === "/sitemap.xml") return sitemap(env);
  await readHas(env);
  // one address per page: a short alias or a trailing slash goes to it for good (301), never a second copy with 200
  const at = (canon, show) => url.pathname === canon ? show() : Response.redirect(SITE + canon + url.search, 301);
  const hit = AT.get(p);
  if (hit) { const [pg, l, canon] = hit, dsc = url.searchParams.get("d"); return at(canon, () => pg.draw(env, l, CAT.en[dsc] ? dsc : "")); }
  { const lm = LEAGUE_CAT_RE.exec(p);
    if (lm) { const l = lm[1] || "en", cat = Object.keys(LG_CAT[l]).find((k) => LG_CAT[l][k] === lm[2]);
      if (cat && LEAG[l].path === p.slice(0, p.lastIndexOf("/"))) return at(p, () => leaguesPage(env, l, cat)); return notFound(l); } }
  const m = RECORD_RE.exec(p);
  if (m) return (await recordsCombo(env, m[1] || "en", +m[3], +m[4], url.pathname, m[2] ? "lmu" : "iracing")) || notFound(m[1] || "en");
  return notFound(p.startsWith("/es") ? "es" : p.startsWith("/pt") ? "pt" : "en");
}

/** The public pages, or null when the address is not one of them. */
export async function seoPage(req, env, url, ctx) {
  if (req.method !== "GET" && req.method !== "HEAD") return null;
  const p = url.pathname.replace(/\/+$/, "") || "/";
  await noteBot(req, env, p);
  if (p === "/" + INDEXNOW_KEY + ".txt") return new Response(INDEXNOW_KEY, { headers: { "content-type": "text/plain; charset=utf-8" } });
  if (!isPublic(p)) return null;
  // the page as the server's edge keeps it for a few minutes (the database is read once for many visits); a local
  // server keeps nothing
  const cache = env.LOCAL !== "1" && typeof caches !== "undefined" && caches.default ? caches.default : null;
  const key = new Request(SITE + url.pathname + url.search, { method: "GET" });
  let res = cache ? await cache.match(key).catch(() => null) : null;
  if (!res) {
    res = await draw(req, env, url, p);
    if (cache && res.status === 200) { const put = cache.put(key, res.clone()).catch(() => {}); if (ctx && ctx.waitUntil) ctx.waitUntil(put); else await put; }
  }
  // the browser or the robot already has this version
  const tag = res.headers.get("etag"), inm = req.headers.get("if-none-match");
  if (tag && inm && inm.split(/\s*,\s*/).includes(tag)) return new Response(null, { status: 304, headers: { etag: tag, "cache-control": res.headers.get("cache-control") || "" } });
  return req.method === "HEAD" ? new Response(null, { status: res.status, headers: res.headers }) : res;
}
