// iRacing news for the phone and web app: the public iracing.com RSS feed, read here
// (browsers cannot read it directly) and kept in the edge cache for 30 minutes.
const FEED = "https://www.iracing.com/feed/";
const H = { "content-type": "application/json; charset=utf-8", "access-control-allow-origin": "*", "access-control-allow-headers": "authorization,content-type" };

const ENT = { amp: "&", lt: "<", gt: ">", quot: '"', apos: "'", nbsp: " " };
function unesc(s) {
  return s.replace(/&(#x[0-9a-f]+|#\d+|[a-z]+);/gi, (m, e) => {
    if (e[0] === "#") { const n = e[1] === "x" || e[1] === "X" ? parseInt(e.slice(2), 16) : parseInt(e.slice(1), 10); return n > 0 && n < 0x110000 ? String.fromCodePoint(n) : ""; }
    return ENT[e.toLowerCase()] ?? m;
  });
}
const cdata = (s) => s.replace(/<!\[CDATA\[([\s\S]*?)\]\]>/g, "$1");
function plain(s, max) {
  s = unesc(cdata(s || "").replace(/<[^>]*>/g, " ")).replace(/\s+/g, " ").trim();
  return s.length > max ? s.slice(0, max).trim() + "…" : s;
}
const tag = (x, t) => { const m = x.match(new RegExp(`<${t}[^>]*>([\\s\\S]*?)</${t}>`, "i")); return m ? m[1] : ""; };
const https = (u) => (/^https:\/\//.test(u) ? u : "");

export function parseFeed(xml) {
  const out = [];
  for (const m of xml.matchAll(/<item\b[\s\S]*?<\/item>/gi)) {
    const x = m[0];
    const link = https(unesc(cdata(tag(x, "link")).trim()));
    if (!link) continue;
    const tags = [...x.matchAll(/<category[^>]*>([\s\S]*?)<\/category>/gi)].map((c) => plain(c[1], 60)).filter(Boolean);
    const d = Date.parse(cdata(tag(x, "pubDate")).trim());
    let image = "";
    const media = x.match(/<(?:media:content|enclosure)[^>]*\burl="([^"]+)"/i);
    if (media) image = https(unesc(media[1]));
    if (!image) { const im = cdata(tag(x, "content:encoded") + tag(x, "description")).match(/<img[^>]+src="([^"]+)"/i); if (im) image = https(unesc(im[1])); }
    out.push({ title: plain(tag(x, "title"), 200), link, summary: plain(tag(x, "description"), 320), tags, date: isNaN(d) ? 0 : d, image });
  }
  return out;
}

export async function news(req, env, ctx) {
  if (req.method === "OPTIONS") return new Response(null, { headers: { ...H, "access-control-allow-methods": "GET" } });
  const cache = caches.default, key = new Request("https://news.cache/iracing");
  const url = new URL(req.url);
  if (url.searchParams.get("refresh") !== "1") { const hit = await cache.match(key); if (hit) return new Response(hit.body, { headers: H }); }
  let items;
  try {
    const r = await fetch(FEED, { headers: { "user-agent": "TrackIQ-server" }, cf: { cacheTtl: 900 } });
    if (!r.ok) throw new Error("iracing.com answered HTTP " + r.status);
    items = parseFeed(await r.text());
  } catch (e) {
    return new Response(JSON.stringify({ error: "could not read the iRacing news: " + (e && e.message) }), { status: 502, headers: H });
  }
  const body = JSON.stringify({ items });
  const put = cache.put(key, new Response(body, { headers: { ...H, "cache-control": "max-age=1800" } }));
  if (ctx && ctx.waitUntil) ctx.waitUntil(put); else await put;
  return new Response(body, { headers: H });
}
