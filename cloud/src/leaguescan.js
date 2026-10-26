// Leagues found in public posts: every six hours the server reads the public feeds of r/iRacing and
// r/iRacingLeagues (two requests), keeps the posts of leagues that carry a Discord invite, and asks Discord's
// public invite endpoint how many members each server has and how many are online. The Leagues hub shows the
// most active ones (online now, then members) with a link to the post, and when the list was last read.
const FEEDS = [
  ["iRacing", "https://www.reddit.com/r/iRacing/new/.rss?limit=100"],
  ["iRacingLeagues", "https://www.reddit.com/r/iRacingLeagues/new/.rss?limit=100"],
  ["simracing", "https://www.reddit.com/r/simracing/new/.rss?limit=100"],
];
const UA = "web:app.pitlanehq.leagues:v1.0 (+https://pitlanehq.app)"; // the form Reddit asks automated clients to use
const EVERY = 6 * 3600e3, RETRY = 30 * 60e3, STUCK = 24 * 3600e3, KEEP = 60 * 86400e3, RECHECK = 6 * 3600e3, MIN_ONLINE = 5;
const INVITE = /(?:discord\.gg|discord(?:app)?\.com\/invite)\/([A-Za-z0-9-]{2,32})/i;
// a league or a series looking for drivers (not a driver looking for a league, not a service selling to leagues)
const LEAGUE = /\b(leagues?|series|season|championship|endurance|cup|drivers? wanted|recruit\w*|looking for (?:new |more )?(?:drivers|racers)|join us|sign[- ]?ups?|open to all|all welcome)\b/i;
const NOT = /\blooking for an? (?:league|team|series)\b|\bbroadcast(?:ing)? your league\b/i;
const unesc = (s) => String(s || "").replace(/&lt;/g, "<").replace(/&gt;/g, ">").replace(/&quot;/g, '"').replace(/&#39;/g, "'").replace(/&#x27;/g, "'").replace(/&amp;/g, "&");
const tag = (e, t) => { const m = e.match(new RegExp(`<${t}[^>]*>([\\s\\S]*?)</${t}>`)); return m ? m[1] : ""; };
const DISC = [
  ["dirt_oval", /\bdirt (?:oval|late model|track)|sprint ?cars?|midgets?|modifieds? dirt|world of outlaws/i],
  ["dirt_road", /\brallycross|dirt road|\brx\b|pro ?[24] (?:lite|trucks?)|off[- ]road/i],
  ["oval", /\bnascar|\boval\b|\btrucks?\b|\barca\b|late models?|next gen|xfinity|cup series|superspeedway|indy ?500/i],
  ["formula_car", /\bf1\b|formula|\bf[34]\b|super formula|indycar|open[- ]wheel|skip barber|\bff1600|\bfr2\.0|dallara|\bsfl\b|lights/i],
  ["sports_car", /\bgt[34]\b|\bgte\b|\blmp\d?\b|\blmdh|\bgtp\b|porsche|mx-?5|\bbmw\b|ferrari|imsa|endurance|supercars?|\btcr\b|touring|multi-?class|gr86|supra|mustang|camaro|mercedes|audi|lamborghini|mclaren|aston/i],
];
const catsOf = (t) => DISC.filter(([, re]) => re.test(t)).map(([k]) => k);

// Reddit's application-only OAuth (an app made at reddit.com/prefs/apps, REDDIT_CLIENT_ID and REDDIT_CLIENT_SECRET):
// used when the server has it, in case the public feeds refuse the server's address
async function redditToken(env) {
  if (!env.REDDIT_CLIENT_ID || !env.REDDIT_CLIENT_SECRET) return "";
  const r = await fetch("https://www.reddit.com/api/v1/access_token", { method: "POST", headers: { "User-Agent": UA, Authorization: "Basic " + btoa(env.REDDIT_CLIENT_ID + ":" + env.REDDIT_CLIENT_SECRET), "Content-Type": "application/x-www-form-urlencoded" }, body: "grant_type=client_credentials" });
  return r.ok ? (await r.json()).access_token || "" : "";
}
async function readFeed(sub, url, token) {
  if (token) {
    const r = await fetch(`https://oauth.reddit.com/r/${sub}/new?limit=100&raw_json=1`, { headers: { "User-Agent": UA, Authorization: "Bearer " + token } });
    if (!r.ok) throw new Error(String(r.status));
    return (((await r.json()).data || {}).children || []).map(({ data: d }) => ({ id: "t3_" + d.id, title: String(d.title || "").slice(0, 200), body: (d.selftext || "") + " " + (d.url || ""), at: (d.created_utc || 0) * 1000, link: "https://www.reddit.com" + (d.permalink || "") }));
  }
  const r = await fetch(url, { headers: { "User-Agent": UA, Accept: "application/atom+xml" } });
  if (!r.ok) throw new Error(String(r.status));
  const xml = await r.text();
  return (xml.match(/<entry>[\s\S]*?<\/entry>/g) || []).map((e) => ({ id: tag(e, "id"), title: unesc(tag(e, "title")).slice(0, 200), body: unesc(unesc(tag(e, "content"))),
    at: Date.parse(tag(e, "published")) || Date.now(), link: (e.match(/<link href="([^"]+)"/) || [])[1] || "" }));
}

async function invite(code) {
  const r = await fetch(`https://discord.com/api/v10/invites/${encodeURIComponent(code)}?with_counts=true`, { headers: { "User-Agent": UA } });
  if (r.status === 404) return { dead: true };
  if (!r.ok) return null; // rate limited or down: try again next time
  const j = await r.json();
  if (!j.guild || !j.guild.id) return { dead: true };
  return { guild: String(j.guild.id), name: String(j.guild.name || "").slice(0, 100), icon: j.guild.icon ? `https://cdn.discordapp.com/icons/${j.guild.id}/${j.guild.icon}.png?size=64` : "",
    members: +j.approximate_member_count || 0, online: +j.approximate_presence_count || 0 };
}

export async function scanLeagues(env, force) {
  if (env.LOCAL === "1") return; // local mode: nothing leaves the PC
  // each feed keeps its own clock: read every six hours, and a feed Reddit refused (429, a shared address) is
  // tried again half an hour later, not six hours later
  const now = Date.now(), st = async (sub) => { try { const r = await env.DB.prepare("SELECT v FROM app_state WHERE k=?1").bind("lg_feed_" + sub).first(); return JSON.parse((r && r.v) || "{}"); } catch (e) { return {}; } };
  const save = (sub, o) => env.DB.prepare("INSERT INTO app_state (k, v, at) VALUES (?1, ?2, ?3) ON CONFLICT(k) DO UPDATE SET v=?2, at=?3").bind("lg_feed_" + sub, JSON.stringify(o), now).run();
  const due = [];
  for (const [sub, url] of FEEDS) { const f = await st(sub); if (force || (now - (f.ok || 0) >= EVERY && now - (f.fail || 0) >= RETRY)) due.push([sub, url, f]); }
  const lastScan = await env.DB.prepare("SELECT at FROM app_state WHERE k='leagues_scan'").first().catch(() => null);
  if (!due.length && !force && lastScan && now - lastScan.at < EVERY) return;
  let read = 0, found = 0, okAny = false;
  const token = due.length ? await redditToken(env).catch(() => "") : "";
  for (const [sub, url, f] of due) {
    if (read) await new Promise((r) => setTimeout(r, 2000)); // one request at a time, a moment apart
    let posts = [];
    try { posts = await readFeed(sub, url, token); } catch (e) { await save(sub, { ...f, fail: now, err: e.message, since: f.since || now }); continue; }
    await save(sub, { ok: now }); okAny = true;
    for (const { id, title, body, at, link } of posts) {
      read++;
      if (!id) continue;
      const m = (title + " " + body).match(INVITE);
      if (!m || !LEAGUE.test(title + " " + body.slice(0, 1500)) || NOT.test(title)) continue;
      if (sub === "simracing" && !/iracing/i.test(title + " " + body)) continue;
      const seen = await env.DB.prepare("SELECT 1 FROM league_found_posts WHERE id=?1").bind(id).first();
      if (seen) continue;
      const code = m[1], known = await env.DB.prepare("SELECT guild FROM league_found WHERE code=?1").bind(code).first();
      let guild = known && known.guild, info = null;
      if (!guild) { info = await invite(code).catch(() => null); if (!info) continue; if (info.dead) { await env.DB.prepare("INSERT OR IGNORE INTO league_found_posts (id, guild, at) VALUES (?1, '', ?2)").bind(id, at).run(); continue; } guild = info.guild; }
      const cats = JSON.stringify(catsOf(title + " " + body.slice(0, 2000)));
      await env.DB.batch([
        env.DB.prepare("INSERT OR IGNORE INTO league_found_posts (id, guild, at) VALUES (?1, ?2, ?3)").bind(id, guild, at),
        env.DB.prepare(`INSERT INTO league_found (guild, code, name, icon, title, url, sub, posted, first, posts, members, online, cats, checked)
          VALUES (?1, ?2, ?3, ?4, ?5, ?6, ?7, ?8, ?8, 1, ?9, ?10, ?11, ?12)
          ON CONFLICT(guild) DO UPDATE SET posts=posts+1, dead=0, code=CASE WHEN ?8>=COALESCE(posted,0) THEN ?2 ELSE code END,
            title=CASE WHEN ?8>=COALESCE(posted,0) THEN ?5 ELSE title END, url=CASE WHEN ?8>=COALESCE(posted,0) THEN ?6 ELSE url END,
            sub=CASE WHEN ?8>=COALESCE(posted,0) THEN ?7 ELSE sub END, posted=MAX(COALESCE(posted,0), ?8), first=MIN(COALESCE(first,?8), ?8),
            cats=CASE WHEN cats IS NULL OR cats='[]' THEN ?11 ELSE cats END`)
          .bind(guild, code, info ? info.name : null, info ? info.icon : null, title, link, sub, at, info ? info.members : null, info ? info.online : null, cats, info ? now : null),
      ]);
      found++;
    }
  }
  // how active each league is now: its Discord's members and who is online (the ones read longest ago first)
  const stale = (await env.DB.prepare("SELECT guild, code FROM league_found WHERE dead=0 AND (checked IS NULL OR checked<?1) ORDER BY COALESCE(checked,0) ASC LIMIT 40").bind(now - RECHECK).all()).results || [];
  for (const x of stale) {
    const info = await invite(x.code).catch(() => null);
    if (!info) continue;
    if (info.dead) await env.DB.prepare("UPDATE league_found SET dead=1, checked=?2 WHERE guild=?1").bind(x.guild, now).run();
    else await env.DB.prepare("UPDATE league_found SET name=?2, icon=?3, members=?4, online=?5, checked=?6 WHERE guild=?1").bind(x.guild, info.name, info.icon, info.members, info.online, now).run();
  }
  await env.DB.prepare("DELETE FROM league_found_posts WHERE at<?1").bind(now - 2 * KEEP).run();
  // "updated" is the last time the leagues were read again (a feed, or Discord's counts)
  if (okAny || stale.length || !lastScan) await env.DB.prepare("INSERT INTO app_state (k, v, at) VALUES ('leagues_scan', ?1, ?2) ON CONFLICT(k) DO UPDATE SET v=?1, at=?2")
    .bind(JSON.stringify({ read, found, checked: stale.length }), now).run();
}

// a league an admin adds by its Discord invite (sub "manual"): never expires and shows whoever is online
export async function addFound(env, link) {
  const m = String(link || "").match(INVITE) || String(link || "").match(/^([A-Za-z0-9-]{2,32})$/);
  if (!m) return { error: "not a Discord invite" };
  const info = await invite(m[1]).catch(() => null);
  if (!info) return { error: "Discord did not answer, try again" };
  if (info.dead) return { error: "this invite does not work" };
  const now = Date.now();
  await env.DB.prepare(`INSERT INTO league_found (guild, code, name, icon, title, url, sub, posted, first, posts, members, online, cats, checked, dead, hidden)
    VALUES (?1, ?2, ?3, ?4, '', '', 'manual', ?5, ?5, 0, ?6, ?7, '[]', ?5, 0, 0)
    ON CONFLICT(guild) DO UPDATE SET code=?2, name=?3, icon=?4, sub='manual', members=?6, online=?7, checked=?5, dead=0, hidden=0`)
    .bind(info.guild, m[1], info.name, info.icon, now, info.members, info.online).run();
  return { ok: true, name: info.name };
}

// the most active leagues found: posted about in the last 60 days, an invite that still works, people online
export async function foundLeagues(env, admin) {
  const now = Date.now();
  const st = await env.DB.prepare("SELECT v, at FROM app_state WHERE k='leagues_scan'").first().catch(() => null);
  const rows = (await env.DB.prepare(`SELECT * FROM league_found WHERE dead=0 AND (sub='manual' OR online>=?1) ${admin ? "" : "AND hidden=0"}
    ORDER BY online DESC, members DESC LIMIT 60`).bind(MIN_ONLINE).all()).results || [];
  let info = {};
  try { info = JSON.parse((st && st.v) || "{}"); } catch (e) {}
  // the admins only hear of a feed that has not been read for a day
  const errs = [];
  if (admin) for (const [sub] of FEEDS) { const r = await env.DB.prepare("SELECT v FROM app_state WHERE k=?1").bind("lg_feed_" + sub).first().catch(() => null); let f = {}; try { f = JSON.parse((r && r.v) || "{}"); } catch (e) {} if (f.fail && now - (f.since || f.fail) > STUCK) errs.push(`r/${sub} ${f.err || ""}`.trim()); }
  return {
    updated: st ? st.at : 0, read: info.read || 0, errs: admin ? errs : undefined,
    leagues: rows.map((x) => ({ guild: x.guild, name: x.name || "", icon: x.icon || "", invite: "https://discord.gg/" + x.code, title: x.title || "", url: x.url || "",
      sub: x.sub || "", posted: x.posted, posts: x.posts, members: x.members || 0, online: x.online || 0, cats: (() => { try { return JSON.parse(x.cats || "[]"); } catch (e) { return []; } })(),
      checked: x.checked, hidden: admin ? !!x.hidden : undefined })),
  };
}
