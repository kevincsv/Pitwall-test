// node cloud/test/seo.test.mjs: every public page (seo.js, seo-topics.js) drawn in English, Spanish and Portuguese
// against a pretend database, and checked as a search engine reads it: a title and a description of a sensible length,
// each its own, one canonical address, hreflang that names the same three pages from each of them, JSON-LD that parses,
// one h1, no phrases joined with a colon, every link of the site answering, and every page in the sitemap. The pages
// of Le Mans Ultimate's leagues and records exist only while there is something to show. The app's "/" (index.html)
// is checked too: its head, its JSON-LD and its <noscript> links in the body.
import assert from "node:assert/strict";
import { readFileSync, existsSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { seoPage } from "../src/seo.js";
import { TOPICS } from "../src/seo-topics.js";

const SITE = "https://pitlanehq.app";
const DIST = fileURLToPath(new URL("../../web/dist/", import.meta.url));
const now = Date.parse("2026-10-20T12:00:00Z");

// the pretend database: a few cars and tracks of each game, leagues posted and found
function world({ lmu = true } = {}) {
  const combos = {
    iracing: [
      { t: 1, track: "Okayama International Circuit", c: 10, car: "Mazda MX-5 Cup", drivers: 12, best: 98.123, hint: "sports_car", upd: now },
      { t: 2, track: "Spa-Francorchamps", c: 20, car: "Porsche 911 GT3 R", drivers: 8, best: 137.5, hint: "sports_car", upd: now - 86400e3 },
      { t: 3, track: "Daytona International Speedway", c: 30, car: "NASCAR Cup Series Next Gen Chevrolet", drivers: 5, best: 47.9, hint: "oval", upd: now },
    ],
    lmu: lmu ? [{ t: 7001, track: "Circuit de la Sarthe", c: 9001, car: "Toyota GR010 Hybrid", drivers: 3, best: 205.4, hint: "", upd: now }] : [],
  };
  const lg = (id, name, cats, extra = {}) => ({ id, name, about: "We race every week.", cats: JSON.stringify(cats), days: "[2]", time: "20:00", tz: "Europe/Madrid", open: 1, discord: "https://discord.gg/abc" + id, web: "", cars: "GT3", lang: "English", updated: now, ...extra });
  const leagues = { iracing: [lg("a1", "Sunday Sprint Series", ["sports_car"]), lg("a2", "Oval Nights", ["oval"])], lmu: lmu ? [lg("l1", "Endurance Club", ["sports_car"])] : [] };
  const fd = (guild, name, cats) => ({ guild, code: "c" + guild, name, icon: "", title: "Looking for drivers", url: "", sub: "iRacing", posted: now, posts: 1, members: 300, online: 40, cats: JSON.stringify(cats), dead: 0, hidden: 0 });
  const found = { iracing: [fd("g1", "GT League", ["sports_car"]), fd("g2", "Formula Friday", ["formula_car"]), fd("g3", "Sports Car Cup", ["sports_car"]), fd("g4", "Prototype Night", ["sports_car"])], lmu: lmu ? [fd("g9", "LMU Endurance", ["sports_car"])] : [] };
  const laps = (game, t, c) => [{ uid: "u1", alias: "Speedy", time: (combos[game].find((x) => x.t === t && x.c === c) || {}).best, created: now, track: "", car: "", cat: "" }, { uid: "u2", alias: "", time: 999, created: now, track: "", car: "", cat: "" }];
  const all = (sql, a) => {
    if (/FROM community_laps WHERE game=\?2/.test(sql)) return combos[a[1]].slice(0, a[0]);
    if (/FROM leagues WHERE game=\?1/.test(sql)) return leagues[a[0]] || [];
    if (/FROM league_found/.test(sql)) return found[a[1]] || [];
    if (/FROM community_laps l JOIN/.test(sql)) return laps(a[2], a[0], a[1]);
    if (/GROUP BY game, track_id/.test(sql)) return [];
    return [];
  };
  const first = (sql, a) => {
    if (/SELECT MAX\(track\) AS track, MAX\(car\) AS car FROM community_laps/.test(sql)) { const x = combos[a[2]].find((y) => y.t === a[0] && y.c === a[1]); return x ? { track: x.track, car: x.car } : null; }
    return null;
  };
  return { DB: { prepare(sql) { let a = []; const o = { bind(...x) { a = x; return o; }, all: async () => ({ results: all(sql, a) }), first: async () => first(sql, a), run: async () => ({ meta: { changes: 0 } }) }; return o; } } };
}

const get = async (env, path, headers = {}) => { const url = new URL(SITE + path); return seoPage(new Request(url, { headers }), env, url); };
const pick = (s, re) => (re.exec(s) || [])[1];
const unesc = (s) => String(s || "").replace(/&quot;/g, '"').replace(/&lt;/g, "<").replace(/&gt;/g, ">").replace(/&amp;/g, "&");
function parse(html) {
  const head = html.slice(0, html.indexOf("</head>"));
  const alts = {};
  for (const m of head.matchAll(/<link rel="alternate" hreflang="([^"]+)" href="([^"]+)">/g)) alts[m[1]] = m[2];
  const ld = [...html.matchAll(/<script type="application\/ld\+json">([\s\S]*?)<\/script>/g)].map((m) => JSON.parse(m[1]));
  const main = pick(html, /<main class="w">([\s\S]*)<\/main>/) || "";
  return { title: unesc(pick(head, /<title>([^<]*)<\/title>/)), desc: unesc(pick(head, /<meta name="description" content="([^"]*)">/)), canon: pick(head, /<link rel="canonical" href="([^"]+)">/),
    robots: pick(head, /<meta name="robots" content="([^"]+)">/), alts, ld: ld.flat(), h1: (main.match(/<h1[\s>]/g) || []).length, main,
    text: unesc(main.replace(/<[^>]+>/g, " ")), links: [...html.matchAll(/href="(\/[^"#]*)"/g)].map((m) => unesc(m[1])), imgs: [...html.matchAll(/<img src="(\/[^"]+)"/g)].map((m) => m[1]) };
}

// the pages that never depend on data, in the three languages
const LANGS = ["en", "es", "pt"];
const STATIC = [
  { en: "/iracing-telemetry", es: "/es/telemetria-iracing", pt: "/pt/telemetria-iracing" },
  { en: "/le-mans-ultimate-telemetry", es: "/es/telemetria-le-mans-ultimate", pt: "/pt/telemetria-le-mans-ultimate" },
  { en: "/iracing-overlays", es: "/es/overlays-iracing", pt: "/pt/overlays-iracing" },
  { en: "/le-mans-ultimate-overlays", es: "/es/overlays-le-mans-ultimate", pt: "/pt/overlays-le-mans-ultimate" },
  { en: "/iracing-leagues", es: "/es/ligas-iracing", pt: "/pt/ligas-iracing" },
  { en: "/records", es: "/es/records", pt: "/pt/records" },
  ...TOPICS.map((x) => ({ en: x.en.path, es: x.es.path, pt: x.pt.path })),
];
const LMU_DATA = [
  { en: "/le-mans-ultimate-leagues", es: "/es/ligas-le-mans-ultimate", pt: "/pt/ligas-le-mans-ultimate" },
  { en: "/le-mans-ultimate-records", es: "/es/records-le-mans-ultimate", pt: "/pt/recordes-le-mans-ultimate" },
];
assert.ok(TOPICS.some((x) => x.id === "lmu-coach"), "a coach guide for Le Mans Ultimate");

const env = world();
const seen = { title: new Map(), desc: new Map() }, pages = new Map();
for (const set of [...STATIC, ...LMU_DATA]) for (const l of LANGS) {
  const path = set[l], r = await get(env, path);
  assert.equal(r.status, 200, path);
  const h = await r.text(), p = parse(h);
  pages.set(path, p);
  assert.ok(p.title && p.title.length <= 62, `${path} title "${p.title}" (${p.title.length})`);
  assert.ok(p.desc && p.desc.length >= 70 && p.desc.length <= 160, `${path} description (${p.desc.length}) "${p.desc}"`);
  assert.ok(!/\S: /.test(p.title) && !/\S: /.test(p.desc), `${path} joins phrases with a colon in its title or description`);
  assert.ok(!seen.title.has(p.title), `${path} has the same title as ${seen.title.get(p.title)}`); seen.title.set(p.title, path);
  assert.ok(!seen.desc.has(p.desc), `${path} has the same description as ${seen.desc.get(p.desc)}`); seen.desc.set(p.desc, path);
  assert.equal(p.canon, SITE + path, `${path} canonical`);
  assert.match(p.robots, /^index/, `${path} indexed`);
  assert.equal(p.h1, 1, `${path} has one h1`);
  assert.ok(!/[^\s\d]: /.test(p.text.replace(/support@pitlanehq\.app/g, "")), `${path} joins phrases with a colon: ${(/.{40}[^\s\d]: .{20}/.exec(p.text) || [])[0]}`);
  assert.ok(p.text.split(/\s+/).length > 150, `${path} is thin`);
  assert.ok(p.ld.some((x) => x["@type"] === "BreadcrumbList") || /telemetry|telemetria/.test(path) && !/le-mans/.test(path), `${path} has its breadcrumb`);
  // hreflang: the three languages and x-default, the same set on each of the three pages
  assert.deepEqual(Object.keys(p.alts).sort(), ["en", "es", "pt-BR", "x-default"], `${path} hreflang`);
  for (const k of LANGS) assert.equal(p.alts[k === "pt" ? "pt-BR" : k], SITE + set[k], `${path} names ${k}`);
  assert.equal(p.alts["x-default"], SITE + set.en);
  assert.equal(r.headers.get("etag") ? 1 : 0, 1, `${path} etag`);
  for (const src of p.imgs) assert.ok(existsSync(DIST + src.slice(1)), `${path} shows ${src}, which web/dist does not have`);
}
// every landing names Le Mans Ultimate, and the iRacing pages that work in it say so
for (const path of ["/iracing-telemetry", "/iracing-overlays", "/iracing-coach", "/iracing-lap-comparison", "/iracing-braking-points", "/iracing-racing-line", "/iracing-telemetry-on-phone", "/free-iracing-telemetry"])
  assert.match(pages.get(path).text, /Le Mans Ultimate/, `${path} names Le Mans Ultimate`);
assert.ok(!/car controls/i.test(pages.get("/iracing-overlays").text), "no car controls overlay");
assert.ok(!/App Store app|on the App Store\b/.test(pages.get("/iracing-telemetry-on-phone").text), "no iPhone app is claimed");

// a page draws the same with the edge's validator: 304
{ const r = await get(env, "/iracing-telemetry"), tag = r.headers.get("etag"); const r2 = await get(env, "/iracing-telemetry", { "if-none-match": tag }); assert.equal(r2.status, 304); }

// short addresses go to their page for good
for (const [from, to] of [["/telemetry", "/iracing-telemetry"], ["/lmu-telemetry", "/le-mans-ultimate-telemetry"], ["/lmu", "/le-mans-ultimate-telemetry"], ["/es/telemetria-lmu", "/es/telemetria-le-mans-ultimate"],
  ["/lmu-overlays", "/le-mans-ultimate-overlays"], ["/lmu-coach", "/le-mans-ultimate-coach"], ["/pt/coach-lmu", "/pt/coach-le-mans-ultimate"], ["/lmu-leagues", "/le-mans-ultimate-leagues"], ["/lmu-records", "/le-mans-ultimate-records"],
  ["/iracing-coach/", "/iracing-coach"], ["/es", "/es/telemetria-iracing"]]) {
  const r = await get(env, from); assert.equal(r.status, 301, from); assert.equal(r.headers.get("location"), SITE + to, from);
}

// a car and track of each game, in the three languages; a wrong spelling goes to the right one
for (const [game, pre, t, c] of [["iracing", "", 1, 10], ["lmu", "lmu/", 7001, 9001]]) {
  const any = await get(env, `/records/${pre}${t}-${c}`);
  assert.equal(any.status, 301);
  const canon = new URL(any.headers.get("location")).pathname;
  const r = await get(env, canon); assert.equal(r.status, 200, canon);
  const p = parse(await r.text());
  assert.equal(p.canon, SITE + canon);
  assert.equal(p.alts.es, SITE + "/es" + canon); assert.equal(p.alts["pt-BR"], SITE + "/pt" + canon);
  assert.ok(p.ld.some((x) => x["@type"] === "BreadcrumbList"));
  assert.match(p.text, /Speedy/); assert.match(p.text, game === "lmu" ? /Le Mans Ultimate/ : /iRacing/);
  assert.ok(!/\S: /.test(p.title), p.title);
}
assert.equal((await get(env, "/records/lmu/1-10")).status, 404, "an iRacing car is no Le Mans Ultimate record");
assert.equal((await get(env, "/records/999-999/x")).status, 404);
assert.equal((await get(env, "/es/records/nothing")).status, 404);

// a discipline with few leagues is shown but not indexed; one with none does not exist
{ const sc = await get(env, "/iracing-leagues/sports-car"); assert.equal(sc.status, 200); assert.match(parse(await sc.text()).robots, /^index/);
  const ov = await get(env, "/iracing-leagues/oval"); assert.equal(ov.status, 200); const po = parse(await ov.text()); assert.match(po.robots, /^noindex/); assert.match(po.desc, /^[A-Z]/, "a description starts with a capital");
  assert.equal((await get(env, "/iracing-leagues/dirt-road")).status, 404);
  assert.equal((await get(env, "/es/ligas-iracing/ovalo")).status, 200); }

// the sitemap: every page, its languages, a lastmod everywhere but the changelog, and no thin discipline
const sm = await (await get(env, "/sitemap.xml")).text();
const locs = [...sm.matchAll(/<loc>([^<]+)<\/loc>/g)].map((m) => m[1].slice(SITE.length));
for (const set of [...STATIC, ...LMU_DATA]) for (const l of LANGS) assert.ok(locs.includes(set[l]), `sitemap lists ${set[l]}`);
for (const u of sm.match(/<url>[\s\S]*?<\/url>/g)) if (!u.includes("/changelog")) assert.match(u, /<lastmod>\d{4}-\d\d-\d\d<\/lastmod>/, u.slice(0, 80));
assert.ok(locs.includes("/iracing-leagues/sports-car") && !locs.includes("/iracing-leagues/oval"), "only the disciplines with leagues enough");
assert.ok(locs.some((x) => x.startsWith("/records/lmu/")) && locs.some((x) => x.startsWith("/es/records/lmu/")), "Le Mans Ultimate's cars and tracks");
assert.ok(!/<loc>https:\/\/pitlanehq\.app\/<\/loc><lastmod>[^<]+<\/lastmod><changefreq>weekly<\/changefreq><priority>1\.0<\/priority><xhtml/.test(sm), '"/" carries no alternates');
assert.equal(new Set(locs).size, locs.length, "no address twice");

// every link of every page answers (or is the app, the downloads or a download)
const OUTSIDE = /^\/($|\?|downloads$|changelog$|dl\/|landing\/|favicon|logo\.svg|icon-)/;
for (const [path, p] of pages) for (const href of new Set(p.links)) {
  if (OUTSIDE.test(href)) continue;
  const r = await get(env, href); assert.ok(r && r.status === 200, `${path} links to ${href}, which answers ${r && r.status}`);
}

// without anything of Le Mans Ultimate: its leagues and records do not exist, no page links to them, the sitemap leaves them out
{
  const bare = world({ lmu: false });
  for (const set of LMU_DATA) for (const l of LANGS) { const r = await get(bare, set[l]); assert.equal(r.status, 404, set[l]); assert.equal(r.headers.get("x-robots-tag"), "noindex"); }
  const h = await (await get(bare, "/le-mans-ultimate-telemetry")).text();
  for (const set of LMU_DATA) assert.ok(!h.includes(`href="${set.en}"`), `no link to ${set.en}`);
  const sm2 = await (await get(bare, "/sitemap.xml")).text();
  for (const set of LMU_DATA) assert.ok(!sm2.includes(SITE + set.en + "<"), `the sitemap leaves out ${set.en}`);
  assert.equal((await get(bare, "/le-mans-ultimate-overlays")).status, 200, "the pages without data stay");
}

// the app's "/": its head says both games, short, no hreflang of its own (the landings have theirs), its JSON-LD parses,
// and its <noscript> links sit in the body and answer
{
  const ix = readFileSync(DIST + "index.html", "utf8");
  const head = ix.slice(0, ix.indexOf("</head>"));
  assert.ok(ix.indexOf("</head>") > 0 && ix.indexOf("</head>") < ix.indexOf("<noscript>"), "<noscript> comes after </head>");
  assert.ok(/<\/head>\s*<body>\s*<noscript>/.test(ix), "the body starts before <noscript>");
  const title = pick(head, /<title>([^<]+)<\/title>/), desc = pick(head, /<meta name="description" content="([^"]+)">/);
  assert.ok(title.length <= 60 && /Le Mans Ultimate/.test(title), title);
  assert.ok(desc.length <= 160 && /Le Mans Ultimate/.test(desc), desc);
  assert.ok(!/hreflang/.test(head), '"/" names no languages');
  const ld = [...head.matchAll(/<script type="application\/ld\+json">([\s\S]*?)<\/script>/g)].flatMap((m) => [JSON.parse(m[1])].flat());
  for (const t of ["SoftwareApplication", "WebSite", "Organization"]) assert.ok(ld.some((x) => x["@type"] === t), t);
  assert.ok(!ld.some((x) => x.aggregateRating || x.review), "no rating");
  const ns = pick(ix, /<noscript>([\s\S]*?)<\/noscript>/);
  const hrefs = [...ns.matchAll(/href="(\/[^"]*)"/g)].map((m) => m[1]);
  for (const set of [...STATIC]) assert.ok(hrefs.includes(set.en), `<noscript> links ${set.en}`);
  for (const href of hrefs) { if (OUTSIDE.test(href)) continue; const r = await get(env, href); assert.ok(r && r.status === 200, `<noscript> links ${href}`); }
}
console.log("seo ok:", pages.size, "pages,", locs.length, "addresses in the sitemap");
