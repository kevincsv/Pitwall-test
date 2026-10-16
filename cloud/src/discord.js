// The Pitlane HQ bot for Discord. Discord sends every slash command here (POST /discord/interactions,
// signed with the application's Ed25519 key, DISCORD_PUBLIC_KEY) and the answer goes back in the same
// request: no gateway, no other server. The lap alerts are posted with the bot's token (DISCORD_BOT_TOKEN).
// What it shows follows the public pages: the accounts' nicknames (never their iRacing names), race rivals by
// their whole name as the game shows it, anonymous laps and accounts as "Anonymous", and an anonymous account's
// own answers only to itself. It answers in English, Spanish or Portuguese (Brazil), the Discord user's language.
// The Pro commands are the "discordPro" list of license_plans.json: everyone has them while the
// subscription is off (enforce: false); then admins, supporters (Patreon) and Pro accounts.
import PLANS from "../../license_plans.json";
import { isAdmin, sha256 } from "./accounts.js";
import { getModel } from "./model.js";
import { CATS, licOf } from "./categories.js";

const SITE = "https://pitlanehq.app";
const API = "https://discord.com/api/v10";
const AMBER = 0xffb02e, PURPLE = 0xa970ff, EPHEMERAL = 64, MANAGE_GUILD = 0x20n;
const PRO = new Set(PLANS.discordPro || []);
const fmt = (t) => { if (!(t > 0)) return "–"; const m = Math.floor(t / 60), s = t - m * 60; return (m ? m + ":" + (s < 10 ? "0" : "") : "") + s.toFixed(3); };
const gap = (d) => (d < 0 ? "−" : "+") + Math.abs(d).toFixed(3);
// text that came through a wrong encoding ("AutÃ³dromo") read back as it was written
const fix = (s) => { s = String(s || ""); if (!/[ÃÂ]/.test(s)) return s; try { return decodeURIComponent(escape(s)); } catch (e) { return s; } };
const slug = (s) => String(s || "").toLowerCase().normalize("NFD").replace(/[̀-ͯ]/g, "").replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "").slice(0, 80);
const PRE = { en: "", es: "/es", pt: "/pt" };
const recUrl = (l, x) => `${SITE}${PRE[l]}/records/${x.t}-${x.c}/${slug(fix(x.track) + " " + fix(x.car))}`;
// Discord's markdown: a name never formats nor mentions anyone
const md = (s) => String(s || "").replace(/[\\*_~`|[\]]/g, (c) => "\\" + c);
const CAT = {
  en: { oval: "Oval", sports_car: "Sports Car", formula_car: "Formula Car", dirt_oval: "Dirt Oval", dirt_road: "Dirt Road" },
  es: { oval: "Óvalo", sports_car: "Sports Car", formula_car: "Fórmula", dirt_oval: "Óvalo de tierra", dirt_road: "Tierra" },
  pt: { oval: "Oval", sports_car: "Sports Car", formula_car: "Fórmula", dirt_oval: "Oval de terra", dirt_road: "Terra" },
};
const langOf = (loc) => { const s = String(loc || ""); return s.startsWith("es") ? "es" : s.startsWith("pt") ? "pt" : "en"; };
const LANGS = ["en", "es", "pt"];
const tr = (l, en, es, pt) => (l === "es" ? es : l === "pt" ? pt : en);
const anonName = (l) => tr(l, "Anonymous", "Anónimo", "Anônimo");
// the name a lap shows in public (the records pages do the same: race rivals by their whole name)
const SHOWN = "CASE WHEN l.anon=1 OR COALESCE(ac.anon,0)=1 OR u.alias='Anonymous' THEN '' ELSE u.alias END";
const NOT_MODEL = "COALESCE(l.shown,'')<>'model'";

const reply = (o) => new Response(JSON.stringify(o), { headers: { "content-type": "application/json" } });
const answer = (data, eph) => ({ allowed_mentions: { parse: [] }, ...data, ...(eph ? { flags: EPHEMERAL } : {}) });
const say = (data, eph) => reply({ type: 4, data: answer(data, eph) });
const text = (content, eph = true) => say({ content }, eph);
const button = (label, url) => ({ type: 2, style: 5, label: label.slice(0, 80), url });
const buttons = (...b) => [{ type: 1, components: b.filter(Boolean) }];

const unhex = (h) => new Uint8Array((String(h).match(/../g) || []).map((x) => parseInt(x, 16)));
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

export async function isPro(env, accountId) {
  if (!PLANS.enforce) return true;
  if (!accountId) return false;
  if (isAdmin(env, accountId)) return true;
  const a = await env.DB.prepare("SELECT supporter FROM accounts WHERE id=?1").bind(accountId).first();
  return !!a && a.supporter === 1;
}

export async function discordInteraction(req, env, ctx) {
  if (req.method !== "POST") return new Response("not found", { status: 404 });
  const body = await req.text();
  if (body.length > 200000 || !(await signed(req, env, body))) return new Response("bad signature", { status: 401 });
  const it = JSON.parse(body);
  if (it.type === 1) return reply({ type: 1 }); // Discord checking the address
  if (it.type === 4) return reply({ type: 8, data: { choices: await suggest(env, it).catch(() => []) } });
  const user = (it.member && it.member.user) || it.user || {};
  // the language chosen with /language, else the one of the user's Discord app
  const me = user.id ? await env.DB.prepare("SELECT (SELECT account_id FROM discord_links WHERE discord_id=?1) AS account, (SELECT lang FROM discord_users WHERE discord_id=?1) AS lang").bind(user.id).first() : null;
  const l = LANGS.includes(me && me.lang) ? me.lang : langOf(it.locale);
  if (it.type !== 2 || !it.data) return text(tr(l, "Unknown action", "Acción desconocida", "Ação desconhecida"));
  const x = { env, ctx, it, l, user, account: (me && me.account) || null, guild: it.guild_id || null, opt: {} };
  for (const o of it.data.options || []) x.opt[o.name] = o.value;
  // a linked driver who uses the bot in a server is one of its drivers (its ranking and its alerts)
  if (x.account && x.guild) ctx.waitUntil(env.DB.prepare("INSERT INTO discord_members (guild_id, discord_id, seen) VALUES (?1,?2,?3) ON CONFLICT(guild_id, discord_id) DO UPDATE SET seen=excluded.seen").bind(x.guild, user.id, Date.now()).run().catch(() => {}));
  const name = it.data.name;
  if (PRO.has(name) && !(await isPro(env, x.account))) return proOnly(x);
  const run = { record, driver, link: linkStart, unlink, download, help, language, coach, compare, board, alerts }[name];
  if (!run) return text(tr(l, "Unknown command", "Comando desconocido", "Comando desconhecido"));
  try {
    return await run(x);
  } catch (e) {
    return text(tr(l, "Something went wrong, try again in a moment.", "Algo ha fallado, prueba otra vez en un momento.", "Algo deu errado, tente de novo em um momento."));
  }
}

// an answer that takes longer than Discord's 3 seconds (the coach builds the model when it has new laps)
function later(x, eph, work) {
  const send = (data) => fetch(`${API}/webhooks/${x.it.application_id}/${x.it.token}/messages/@original`, { method: "PATCH", headers: { "content-type": "application/json" }, body: JSON.stringify(answer(data)) });
  x.ctx.waitUntil(work().catch(() => ({ content: tr(x.l, "Something went wrong, try again in a moment.", "Algo ha fallado, prueba otra vez en un momento.", "Algo deu errado, tente de novo em um momento.") })).then(send).catch(() => {}));
  return reply({ type: 5, data: eph ? { flags: EPHEMERAL } : {} });
}

const needLink = (x) => say({ content: tr(x.l, "Link your Pitlane HQ account first with /link.", "Vincula antes tu cuenta de Pitlane HQ con /vincular.", "Vincule antes a sua conta do Pitlane HQ com /vincular.") }, true);
function proOnly(x) {
  const url = PLANS.storeUrl || SITE;
  return say({
    embeds: [{ color: PURPLE, title: tr(x.l, "A Pitlane HQ Pro feature", "Una función de Pitlane HQ Pro", "Um recurso do Pitlane HQ Pro"),
      description: x.account ? tr(x.l, "This command is part of Pitlane HQ Pro.", "Este comando es parte de Pitlane HQ Pro.", "Este comando faz parte do Pitlane HQ Pro.")
        : tr(x.l, "This command is part of Pitlane HQ Pro. Link your account with /link first.", "Este comando es parte de Pitlane HQ Pro. Vincula antes tu cuenta con /vincular.", "Este comando faz parte do Pitlane HQ Pro. Vincule antes a sua conta com /vincular.") }],
    components: buttons(button(tr(x.l, "See the plans", "Ver los planes", "Ver os planos"), url)),
  }, true);
}
const isAnon = async (env, id) => !!(id && ((await env.DB.prepare("SELECT anon FROM accounts WHERE id=?1").bind(id).first()) || {}).anon);

// ---------- cars and tracks ----------
async function combos(env, q, n) {
  // "mx5" finds "MX-5": every word against the names without spaces or signs
  const words = String(q || "").toLowerCase().split(/\s+/).map((w) => w.replace(/[^\p{L}\p{N}]/gu, "")).filter(Boolean).slice(0, 5);
  const squash = "replace(replace(replace(replace(lower(l.track||l.car),' ',''),'-',''),'.',''),'·','')";
  const where = words.map((_, i) => `AND ${squash} LIKE ?${i + 2}`).join(" ");
  const r = await env.DB.prepare(
    `SELECT l.track_id AS t, MAX(l.track) AS track, l.car_id AS c, MAX(l.car) AS car, COUNT(DISTINCT l.user_id) AS drivers, MIN(l.time) AS best
       FROM community_laps l WHERE l.game='iracing' AND l.track_id>0 AND l.car_id>0 AND ${NOT_MODEL} ${where}
      GROUP BY l.track_id, l.car_id ORDER BY drivers DESC, best LIMIT ?1`
  ).bind(n, ...words.map((w) => "%" + w + "%")).all();
  return r.results || [];
}
// what was picked in the list ("t-c"), or the most driven car and track with every word typed
async function comboOf(env, v) {
  const m = /^(\d+)-(\d+)$/.exec(String(v || ""));
  if (m) {
    const r = await env.DB.prepare("SELECT MAX(track) AS track, MAX(car) AS car FROM community_laps WHERE track_id=?1 AND car_id=?2 AND game='iracing'").bind(+m[1], +m[2]).first();
    if (r && r.track) return { t: +m[1], c: +m[2], track: r.track, car: r.car };
  }
  return (await combos(env, v, 1))[0] || null;
}
const noCombo = (x) => text(tr(x.l, "No laps on that car and track yet. Pick one from the list as you type.", "Aún no hay vueltas en ese coche y circuito. Elige uno de la lista mientras escribes.", "Ainda não há voltas nesse carro e pista. Escolha um da lista enquanto digita."));

// ---------- drivers ----------
// a driver by their public name; anonymous accounts are never found
async function driverOf(env, name) {
  const n = String(name || "").trim().toLowerCase();
  if (!n) return null;
  const q = "SELECT a.id, a.created, a.member_since, a.supporter, a.supporter_hidden, a.anon, u.alias, u.lics FROM accounts a JOIN community_users u ON u.id=a.id WHERE a.anon=0 AND ";
  const exact = await env.DB.prepare(q + "lower(u.alias)=?1").bind(n).first();
  if (exact) return exact;
  const r = await env.DB.prepare(q + "lower(u.alias) LIKE ?1 LIMIT 2").bind("%" + n.replace(/[%_]/g, "") + "%").all();
  return (r.results || []).length === 1 ? r.results[0] : null;
}
const accountOf = (env, id) => env.DB.prepare("SELECT a.id, a.created, a.member_since, a.supporter, a.supporter_hidden, a.anon, u.alias, u.lics FROM accounts a JOIN community_users u ON u.id=a.id WHERE a.id=?1").bind(id).first();

async function suggest(env, it) {
  const f = (it.data.options || []).find((o) => o.focused);
  if (!f) return [];
  if (f.name === "car_track") return (await combos(env, f.value, 25)).map((x) => ({ name: `${fix(x.track)} · ${fix(x.car)}`.slice(0, 100), value: `${x.t}-${x.c}` }));
  const n = String(f.value || "").trim().toLowerCase().replace(/[%_]/g, "");
  const r = await env.DB.prepare(
    `SELECT u.alias FROM accounts a JOIN community_users u ON u.id=a.id WHERE a.anon=0 AND lower(u.alias) LIKE ?1
      AND EXISTS (SELECT 1 FROM community_laps l WHERE l.user_id=a.id AND l.anon=0) ORDER BY (lower(u.alias) LIKE ?2) DESC, u.alias LIMIT 25`
  ).bind("%" + n + "%", n + "%").all();
  return (r.results || []).map((x) => ({ name: x.alias.slice(0, 100), value: x.alias.slice(0, 100) }));
}

// ---------- free ----------
async function record(x) {
  const k = await comboOf(x.env, x.opt.car_track);
  if (!k) return noCombo(x);
  const r = await x.env.DB.prepare(
    `SELECT l.user_id AS uid, ${SHOWN} AS alias, l.time FROM community_laps l JOIN community_users u ON u.id=l.user_id LEFT JOIN accounts ac ON ac.id=l.user_id
      WHERE l.track_id=?1 AND l.car_id=?2 AND l.game='iracing' AND ${NOT_MODEL} ORDER BY l.time LIMIT 10`
  ).bind(k.t, k.c).all();
  const laps = r.results || [];
  if (!laps.length) return noCombo(x);
  const all = (await x.env.DB.prepare(`SELECT COUNT(*) AS n FROM community_laps l WHERE l.track_id=?1 AND l.car_id=?2 AND l.game='iracing' AND ${NOT_MODEL}`).bind(k.t, k.c).first()).n;
  const medal = ["🥇", "🥈", "🥉"];
  const lines = laps.map((v, i) => `${medal[i] || `\`${String(i + 1).padStart(2)}\``} \`${fmt(v.time)}\` ${i ? `\`${gap(v.time - laps[0].time)}\` ` : ""}${md(v.alias || anonName(x.l))}`);
  // where you are, when the answer is public and your account is not anonymous
  if (x.account && !(await isAnon(x.env, x.account))) {
    const mine = await x.env.DB.prepare("SELECT time, anon FROM community_laps WHERE user_id=?1 AND track_id=?2 AND car_id=?3 AND game='iracing'").bind(x.account, k.t, k.c).first();
    if (mine && !mine.anon && !laps.some((v) => v.uid === x.account)) {
      const pos = (await x.env.DB.prepare(`SELECT COUNT(*) AS n FROM community_laps l WHERE l.track_id=?1 AND l.car_id=?2 AND l.game='iracing' AND ${NOT_MODEL} AND l.time<?3`).bind(k.t, k.c, mine.time).first()).n + 1;
      lines.push("", tr(x.l, `You: **P${pos}** \`${fmt(mine.time)}\` \`${gap(mine.time - laps[0].time)}\``, `Tú: **P${pos}** \`${fmt(mine.time)}\` \`${gap(mine.time - laps[0].time)}\``, `Você: **P${pos}** \`${fmt(mine.time)}\` \`${gap(mine.time - laps[0].time)}\``));
    }
  }
  return say({
    embeds: [{ color: AMBER, title: fix(k.car).slice(0, 250), url: recUrl(x.l, k), description: `**${md(fix(k.track))}**\n\n` + lines.join("\n"),
      footer: { text: tr(x.l, `${all} drivers · one lap each, their fastest · Pitlane HQ`, `${all} pilotos · una vuelta cada uno, la más rápida · Pitlane HQ`, `${all} pilotos · uma volta cada um, a mais rápida · Pitlane HQ`) } }],
  });
}

async function driver(x) {
  let a = null, self = false;
  if (x.opt.name) a = await driverOf(x.env, x.opt.name);
  else if (x.account) { a = await accountOf(x.env, x.account); self = true; }
  else return needLink(x);
  if (!a) return text(tr(x.l, "No driver by that name (anonymous drivers have no profile).", "No hay ningún piloto con ese nombre (los pilotos anónimos no tienen perfil).", "Não há nenhum piloto com esse nome (pilotos anônimos não têm perfil)."));
  if (a.id === x.account) self = true;
  // your own anonymous laps only in an answer that only you see
  const eph = self && !!a.anon;
  const r = await x.env.DB.prepare(
    `SELECT l.track, l.car, l.time, l.created,
       (SELECT COUNT(*) FROM community_laps o WHERE o.track_id=l.track_id AND o.car_id=l.car_id AND o.game=l.game AND COALESCE(o.shown,'')<>'model' AND o.time<l.time)+1 AS pos,
       (SELECT COUNT(*) FROM community_laps o WHERE o.track_id=l.track_id AND o.car_id=l.car_id AND o.game=l.game AND COALESCE(o.shown,'')<>'model') AS total
     FROM community_laps l WHERE l.user_id=?1 AND ${NOT_MODEL} ${eph ? "" : "AND l.anon=0"} ORDER BY l.created DESC LIMIT 60`
  ).bind(a.id).all();
  const laps = r.results || [];
  const top = laps.slice().sort((p, q) => p.pos - q.pos || q.total - p.total).slice(0, 6);
  let lics = {};
  try { lics = JSON.parse(a.lics || "{}") || {}; } catch (e) {}
  const licLine = CATS.filter((c) => licOf(lics[c])).map((c) => `${CAT[x.l][c]} **${licOf(lics[c])}**`).join(" · ");
  const sup = a.supporter === 1 && (!a.supporter_hidden || self);
  const fields = [];
  if (licLine) fields.push({ name: tr(x.l, "Licences", "Licencias", "Licenças"), value: licLine });
  fields.push({ name: tr(x.l, "On the leaderboards", "En las clasificaciones", "Nos leaderboards"), value: laps.length
    ? top.map((v) => `**P${v.pos}**/${v.total} \`${fmt(v.time)}\` ${md(fix(v.car))} · ${md(fix(v.track))}`).join("\n").slice(0, 1024)
    : tr(x.l, "No laps yet", "Aún sin vueltas", "Ainda sem voltas") });
  const since = new Date(a.member_since || a.created).toISOString().slice(0, 10);
  return say({
    embeds: [{ color: AMBER, title: (sup ? "⭐ " : "") + a.alias, fields,
      footer: { text: tr(x.l, `${laps.length} cars and tracks · member since ${since}`, `${laps.length} coches y circuitos · miembro desde ${since}`, `${laps.length} carros e pistas · membro desde ${since}`) } }],
  }, eph);
}

async function linkStart(x) {
  if (x.account) {
    const a = await accountOf(x.env, x.account);
    return text(tr(x.l, `Your Discord is linked to **${md(a ? a.alias : "?")}**. Use /unlink to change it.`, `Tu Discord está vinculado a **${md(a ? a.alias : "?")}**. Usa /desvincular para cambiarlo.`, `O seu Discord está vinculado a **${md(a ? a.alias : "?")}**. Use /desvincular para mudar.`));
  }
  const ABC = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789", code = [...crypto.getRandomValues(new Uint8Array(8))].map((b) => ABC[b % 32]).join("");
  const now = Date.now();
  await x.env.DB.batch([
    x.env.DB.prepare("DELETE FROM discord_codes WHERE expires<?1 OR discord_id=?2").bind(now, x.user.id),
    x.env.DB.prepare("INSERT INTO discord_codes (code_hash, discord_id, discord_name, guild_id, expires) VALUES (?1,?2,?3,?4,?5)")
      .bind(await sha256("discord:" + code), x.user.id, String(x.user.global_name || x.user.username || "").slice(0, 40), x.guild, now + 10 * 60e3),
  ]);
  return say({
    content: tr(x.l, "Open this link where you are signed in to Pitlane HQ (the web app) and confirm. It works for 10 minutes and only once.",
      "Abre este enlace donde tengas abierta tu cuenta de Pitlane HQ (la app web) y confirma. Vale 10 minutos y una sola vez.", "Abra este link onde a sua conta do Pitlane HQ estiver aberta (o app web) e confirme. Vale por 10 minutos e uma única vez."),
    components: buttons(button(tr(x.l, "Link my account", "Vincular mi cuenta", "Vincular minha conta"), `${SITE}/?discord=${code}`)),
  }, true);
}

async function unlink(x) {
  if (!x.account) return text(tr(x.l, "Your Discord is not linked to any Pitlane HQ account.", "Tu Discord no está vinculado a ninguna cuenta de Pitlane HQ.", "O seu Discord não está vinculado a nenhuma conta do Pitlane HQ."));
  await x.env.DB.batch([
    x.env.DB.prepare("DELETE FROM discord_links WHERE discord_id=?1").bind(x.user.id),
    x.env.DB.prepare("DELETE FROM discord_members WHERE discord_id=?1").bind(x.user.id),
  ]);
  return text(tr(x.l, "Unlinked. Your laps stay in your account.", "Desvinculado. Tus vueltas siguen en tu cuenta.", "Desvinculado. As suas voltas continuam na sua conta."));
}

async function download(x) {
  let apk = null;
  try { const o = x.env.DL && (await x.env.DL.get("phones.json")); apk = o ? (JSON.parse(await o.text()) || {}).apk : null; } catch (e) {}
  return say({
    content: tr(x.l, "Pitlane HQ is free: Pitlane HQ for Windows records your laps, the web and the phone apps show them.", "Pitlane HQ es gratis: Pitlane HQ para Windows graba tus vueltas, la web y las apps de móvil las muestran.", "O Pitlane HQ é grátis: o Pitlane HQ para Windows grava as suas voltas, a web e os apps de celular as mostram."),
    components: buttons(button(tr(x.l, "Pitlane HQ for Windows", "Pitlane HQ para Windows", "Pitlane HQ para Windows"), `${SITE}/dl/PitlaneHQ-Setup.exe`), apk && button("Android", `${SITE}/dl/${encodeURIComponent(apk)}`),
      button(tr(x.l, "Web app", "App web", "App web"), SITE + "/"), button(tr(x.l, "All downloads", "Todas las descargas", "Todos os downloads"), SITE + "/downloads")),
  });
}

function help(x) {
  const free = tr(x.l,
    "`/record` the record and top 10 of a car and track\n`/driver` a driver's profile, or yours\n`/link` · `/unlink` your Pitlane HQ account\n`/download` the apps\n`/language` the bot's language",
    "`/record` el récord y el top 10 de un coche y circuito\n`/piloto` el perfil de un piloto, o el tuyo\n`/vincular` · `/desvincular` tu cuenta de Pitlane HQ\n`/descargar` las apps\n`/idioma` el idioma del bot", "`/recorde` o recorde e o top 10 de um carro e pista\n`/piloto` o perfil de um piloto, ou o seu\n`/vincular` · `/desvincular` a sua conta do Pitlane HQ\n`/baixar` os apps\n`/idioma` o idioma do bot");
  const pro = tr(x.l,
    "`/coach` your best lap against the next level and the record\n`/compare` your laps against another driver's\n`/board` this server's ranking on a car and track\n`/alerts` this server's new best laps and records, posted in a channel",
    "`/coach` tu mejor vuelta contra el siguiente nivel y el récord\n`/comparar` tus vueltas contra las de otro piloto\n`/ranking` el ranking de este servidor en un coche y circuito\n`/alertas` las mejores vueltas y récords de este servidor, en un canal", "`/coach` a sua melhor volta contra o próximo nível e o recorde\n`/comparar` as suas voltas contra as de outro piloto\n`/ranking` o ranking deste servidor em um carro e pista\n`/alertas` as melhores voltas e recordes deste servidor, em um canal");
  const open = PLANS.enforce ? "" : tr(x.l, "\n*Open to everyone for now.*", "\n*Abierto a todos por ahora.*", "\n*Aberto a todos por enquanto.*");
  return say({
    embeds: [{ color: AMBER, title: "Pitlane HQ", url: SITE,
      fields: [{ name: tr(x.l, "Free", "Gratis", "Grátis"), value: free }, { name: "Pro", value: pro + open }],
      footer: { text: tr(x.l, "Your laps reach the bot once Pitlane HQ for Windows records them.", "Tus vueltas llegan al bot cuando Pitlane HQ para Windows las graba.", "As suas voltas chegam ao bot quando o Pitlane HQ para Windows as grava.") } }],
  }, true);
}

// the bot's language for this Discord user ("auto": the Discord app's own); the command names always follow the app's
async function language(x) {
  const v = String(x.opt.lang || "auto");
  if (LANGS.includes(v)) await x.env.DB.prepare("INSERT INTO discord_users (discord_id, lang, updated) VALUES (?1,?2,?3) ON CONFLICT(discord_id) DO UPDATE SET lang=excluded.lang, updated=excluded.updated").bind(x.user.id, v, Date.now()).run();
  else await x.env.DB.prepare("DELETE FROM discord_users WHERE discord_id=?1").bind(x.user.id).run();
  const l = LANGS.includes(v) ? v : langOf(x.it.locale);
  const note = tr(l, "Command names follow your Discord app's language.", "Los nombres de los comandos siguen el idioma de tu app de Discord.", "Os nomes dos comandos seguem o idioma do seu app do Discord.");
  return text((LANGS.includes(v) ? tr(l, "Done: the bot answers you in English.", "Hecho: el bot te responde en español.", "Pronto: o bot responde a você em português.")
    : tr(l, "Done: the bot answers you in your Discord app's language.", "Hecho: el bot te responde en el idioma de tu app de Discord.", "Pronto: o bot responde a você no idioma do seu app do Discord.")) + "\n" + note);
}

// ---------- Pro ----------
async function coach(x) {
  if (!x.account) return needLink(x);
  const k = await comboOf(x.env, x.opt.car_track);
  if (!k) return noCombo(x);
  const mine = await x.env.DB.prepare("SELECT time FROM community_laps WHERE user_id=?1 AND track_id=?2 AND car_id=?3 AND game='iracing'").bind(x.account, k.t, k.c).first();
  if (!mine) return text(tr(x.l, "You have no lap on this car and track yet (test drives do not count).", "Aún no tienes vuelta en este coche y circuito (las pruebas libres no cuentan).", "Você ainda não tem volta neste carro e pista (test drives não contam)."));
  return later(x, true, async () => {
    const m = await getModel(x.env, "iracing", k.t, k.c);
    // the pace of every driver known there; a model without enough telemetry yet has none: the leaderboard's
    let times = (m.times || []).slice();
    if (!times.length) times = ((await x.env.DB.prepare("SELECT time FROM community_laps WHERE track_id=?1 AND car_id=?2 AND game='iracing' AND COALESCE(shown,'')<>'model' AND time>10 AND COALESCE(official,1)<>0").bind(k.t, k.c).all()).results || []).map((v) => v.time);
    const me = mine.time;
    if (!times.some((t) => Math.abs(t - me) < 0.0005)) times.push(me);
    times.sort((a, b) => a - b);
    const pos = times.filter((t) => t < me - 0.0005).length + 1;
    const rec = Math.min(m.fastest || Infinity, times[0]);
    // the next level: the real lap of the driver just ahead of your pace (the model's ladder)
    const lv = (m.ladder || []).find((e) => me <= e.upTo + 0.0005) || (m.ladder || []).slice(-1)[0];
    // without a ladder yet (too little telemetry): the time of the driver just ahead
    const ahead = times.filter((t) => t < me - 0.0005).pop() || null;
    const next = lv && lv.time < me - 0.0005 ? lv.time : ahead;
    const fields = [
      { name: tr(x.l, "Your best", "Tu mejor vuelta", "Sua melhor volta"), value: `\`${fmt(me)}\` · **P${pos}** ${tr(x.l, "of", "de", "de")} ${times.length}`, inline: true },
      { name: tr(x.l, "Next level", "Siguiente nivel", "Próximo nível"), value: next ? `\`${fmt(next)}\` \`${gap(next - me)}\`` : tr(x.l, "You are the fastest known here", "Eres el más rápido conocido aquí", "Você é o mais rápido conhecido aqui"), inline: true },
      { name: tr(x.l, "Record", "Récord", "Recorde"), value: rec < me - 0.0005 ? `\`${fmt(rec)}\` \`${gap(rec - me)}\`` : tr(x.l, "Yours", "El tuyo", "O seu"), inline: true },
    ];
    return {
      embeds: [{ color: AMBER, title: `${fix(k.car)} · ${fix(k.track)}`.slice(0, 250), fields,
        description: tr(x.l, "Where you lose the time, corner by corner: the coach in the app.", "Dónde pierdes el tiempo, curva a curva: el coach en la app.", "Onde você perde tempo, curva a curva: o coach no app.") }],
      components: buttons(button(tr(x.l, "Open the coach", "Abrir el coach", "Abrir o coach"), SITE + "/")),
    };
  });
}

async function compare(x) {
  if (!x.account) return needLink(x);
  const b = await driverOf(x.env, x.opt.name);
  if (!b) return text(tr(x.l, "No driver by that name (anonymous drivers have no profile).", "No hay ningún piloto con ese nombre (los pilotos anónimos no tienen perfil).", "Não há nenhum piloto com esse nome (pilotos anônimos não têm perfil)."));
  if (b.id === x.account) return text(tr(x.l, "That is you.", "Ese eres tú.", "Esse é você."));
  const r = await x.env.DB.prepare(
    `SELECT a.track, a.car, a.time AS mine, b.time AS theirs, MAX(a.created, b.created) AS at
       FROM community_laps a JOIN community_laps b ON b.track_id=a.track_id AND b.car_id=a.car_id AND b.game=a.game
      WHERE a.user_id=?1 AND b.user_id=?2 AND b.anon=0 AND COALESCE(a.shown,'')<>'model' AND COALESCE(b.shown,'')<>'model'
      ORDER BY at DESC LIMIT 300`
  ).bind(x.account, b.id).all();
  const rows = r.results || [];
  const eph = await isAnon(x.env, x.account);
  if (!rows.length) return text(tr(x.l, `You and **${md(b.alias)}** have no car and track in common yet.`, `Tú y **${md(b.alias)}** aún no tenéis ningún coche y circuito en común.`, `Você e **${md(b.alias)}** ainda não têm nenhum carro e pista em comum.`), eph);
  const won = rows.filter((v) => v.mine < v.theirs).length;
  const lines = rows.slice(0, 12).map((v) => `${v.mine < v.theirs ? "🟢" : v.mine > v.theirs ? "🔴" : "⚪"} \`${gap(v.mine - v.theirs)}\` ${md(fix(v.car))} · ${md(fix(v.track))}`);
  return say({
    embeds: [{ color: AMBER, title: tr(x.l, `You against ${b.alias}`, `Tú contra ${b.alias}`, `Você contra ${b.alias}`).slice(0, 250),
      description: tr(x.l, `Faster on **${won}** of **${rows.length}** cars and tracks.`, `Más rápido en **${won}** de **${rows.length}** coches y circuitos.`, `Mais rápido em **${won}** de **${rows.length}** carros e pistas.`) + "\n\n" + lines.join("\n"),
      footer: { text: tr(x.l, "Your gap on each one's fastest lap · most recent first", "Tu diferencia en la vuelta más rápida de cada uno · las más recientes primero", "A sua diferença na volta mais rápida de cada um · as mais recentes primeiro") } }],
  }, eph);
}

async function board(x) {
  if (!x.guild) return text(tr(x.l, "This works inside a server.", "Esto funciona dentro de un servidor.", "Isto funciona dentro de um servidor."));
  const k = await comboOf(x.env, x.opt.car_track);
  if (!k) return noCombo(x);
  const r = await x.env.DB.prepare(
    `SELECT dl.discord_id AS did, u.alias, l.time,
       (SELECT COUNT(*) FROM community_laps o WHERE o.track_id=l.track_id AND o.car_id=l.car_id AND o.game=l.game AND COALESCE(o.shown,'')<>'model' AND o.time<l.time)+1 AS pos
       FROM discord_members m JOIN discord_links dl ON dl.discord_id=m.discord_id JOIN community_laps l ON l.user_id=dl.account_id
       JOIN community_users u ON u.id=l.user_id JOIN accounts ac ON ac.id=l.user_id
      WHERE m.guild_id=?1 AND l.track_id=?2 AND l.car_id=?3 AND l.game='iracing' AND l.anon=0 AND ac.anon=0 AND ${NOT_MODEL}
      ORDER BY l.time LIMIT 20`
  ).bind(x.guild, k.t, k.c).all();
  const rows = r.results || [];
  if (!rows.length) return text(tr(x.l, "Nobody in this server has a lap there yet. Drivers show up once they link their account (/link) and use the bot here.",
    "Nadie de este servidor tiene vuelta ahí todavía. Los pilotos aparecen cuando vinculan su cuenta (/vincular) y usan el bot aquí.", "Ninguém deste servidor tem volta aí ainda. Os pilotos aparecem quando vinculam a conta (/vincular) e usam o bot aqui."), false);
  const lines = rows.map((v, i) => `\`${String(i + 1).padStart(2)}\` \`${fmt(v.time)}\` ${i ? `\`${gap(v.time - rows[0].time)}\` ` : ""}<@${v.did}> ${md(v.alias)} · P${v.pos} ${tr(x.l, "overall", "general", "geral")}`);
  return say({
    embeds: [{ color: AMBER, title: `${fix(k.car)}`.slice(0, 250), url: recUrl(x.l, k), description: `**${md(fix(k.track))}** · ${tr(x.l, "this server", "este servidor", "este servidor")}\n\n` + lines.join("\n") }],
  });
}

async function alerts(x) {
  if (!x.guild) return text(tr(x.l, "This works inside a server.", "Esto funciona dentro de un servidor.", "Isto funciona dentro de um servidor."));
  let perms = 0n;
  try { perms = BigInt((x.it.member && x.it.member.permissions) || "0"); } catch (e) {}
  if (!(perms & MANAGE_GUILD)) return text(tr(x.l, "Only the people who manage this server can set the alerts.", "Solo quien gestiona este servidor puede configurar las alertas.", "Só quem gerencia este servidor pode configurar os alertas."));
  if (!x.account) return needLink(x);
  const ch = x.opt.channel, now = Date.now(), gl = LANGS.includes(x.opt.language) ? x.opt.language : langOf(x.it.guild_locale || x.it.locale);
  if (!ch) {
    await x.env.DB.prepare("UPDATE discord_guilds SET alerts_channel=NULL, updated=?2 WHERE guild_id=?1").bind(x.guild, now).run();
    return text(tr(x.l, "Alerts off.", "Alertas apagadas.", "Alertas desligados."));
  }
  if (!x.env.DISCORD_BOT_TOKEN) return text(tr(x.l, "The bot cannot post yet (no bot token on the server).", "El bot aún no puede publicar (falta su token en el servidor).", "O bot ainda não pode publicar (falta o token dele no servidor)."));
  return later(x, true, async () => {
    // a first message: the bot can post there, or it says what it is missing
    const ok = await post(x.env, ch, { content: tr(gl, "🏁 Pitlane HQ alerts: this server's new best laps and records will show up here.", "🏁 Alertas de Pitlane HQ: aquí saldrán las mejores vueltas y los récords de este servidor.", "🏁 Alertas do Pitlane HQ: aqui vão aparecer as melhores voltas e os recordes deste servidor.") });
    if (!ok) return { content: tr(x.l, `I cannot post in <#${ch}>: give the bot View channel, Send messages and Embed links there.`, `No puedo publicar en <#${ch}>: da al bot Ver canal, Enviar mensajes e Insertar enlaces allí.`, `Não consigo publicar em <#${ch}>: dê ao bot Ver canal, Enviar mensagens e Inserir links lá.`) };
    await x.env.DB.prepare("INSERT INTO discord_guilds (guild_id, alerts_channel, set_by, lang, updated) VALUES (?1,?2,?3,?4,?5) ON CONFLICT(guild_id) DO UPDATE SET alerts_channel=excluded.alerts_channel, set_by=excluded.set_by, lang=excluded.lang, updated=excluded.updated")
      .bind(x.guild, ch, x.account, gl, now).run();
    return { content: tr(x.l, `Alerts on in <#${ch}>. They cover the drivers who linked their account and used the bot in this server.`, `Alertas activadas en <#${ch}>. Cubren a los pilotos que vincularon su cuenta y usaron el bot en este servidor.`, `Alertas ativados em <#${ch}>. Cobrem os pilotos que vincularam a conta e usaram o bot neste servidor.`) };
  });
}

async function post(env, channel, msg) {
  const r = await fetch(`${API}/channels/${channel}/messages`, {
    method: "POST",
    headers: { authorization: "Bot " + env.DISCORD_BOT_TOKEN, "content-type": "application/json" },
    body: JSON.stringify({ allowed_mentions: { parse: [] }, ...msg }),
  }).catch(() => null);
  return !!(r && r.ok);
}

// a new best lap of a linked driver (keepBestLap improved what the account shares): posted in the alerts
// channel of every server where they use the bot, while the account that set the alerts up has Pro
export async function discordLapAlert(env, accountId, lap) {
  if (!env.DISCORD_BOT_TOKEN || !lap || !lap.improved || lap.game !== "iracing") return;
  const a = await env.DB.prepare("SELECT a.anon, u.alias, dl.discord_id FROM accounts a JOIN community_users u ON u.id=a.id JOIN discord_links dl ON dl.account_id=a.id WHERE a.id=?1").bind(accountId).first();
  if (!a || a.anon || lap.anon) return;
  const gs = (await env.DB.prepare("SELECT g.guild_id, g.alerts_channel, g.set_by, g.lang FROM discord_members m JOIN discord_guilds g ON g.guild_id=m.guild_id WHERE m.discord_id=?1 AND g.alerts_channel IS NOT NULL").bind(a.discord_id).all()).results || [];
  if (!gs.length) return;
  const st = await env.DB.prepare(
    `SELECT (SELECT COUNT(*) FROM community_laps l WHERE l.track_id=?1 AND l.car_id=?2 AND l.game='iracing' AND ${NOT_MODEL} AND l.time<?3)+1 AS pos,
            (SELECT COUNT(*) FROM community_laps l WHERE l.track_id=?1 AND l.car_id=?2 AND l.game='iracing' AND ${NOT_MODEL}) AS total`
  ).bind(lap.trackId, lap.carId, lap.time).first();
  const k = { t: lap.trackId, c: lap.carId, track: lap.track, car: lap.car };
  for (const g of gs) {
    if (!(await isPro(env, g.set_by))) continue;
    const l = ["es", "pt"].includes(g.lang) ? g.lang : "en", rec = st.pos === 1 && st.total > 1;
    const fields = [
      { name: tr(l, "Time", "Tiempo", "Tempo"), value: `\`${fmt(lap.time)}\`` + (lap.prev ? ` \`${gap(lap.time - lap.prev)}\`` : ""), inline: true },
      { name: tr(l, "Position", "Posición", "Posição"), value: `**P${st.pos}** ${tr(l, "of", "de", "de")} ${st.total}`, inline: true },
    ];
    await post(env, g.alerts_channel, {
      embeds: [{ color: rec ? PURPLE : AMBER, url: recUrl(l, k), title: rec ? tr(l, "🏆 New record", "🏆 Nuevo récord", "🏆 Novo recorde") : tr(l, "⏱️ New best lap", "⏱️ Nueva mejor vuelta", "⏱️ Nova melhor volta"),
        description: `<@${a.discord_id}> **${md(a.alias)}**\n${md(fix(lap.car))} · ${md(fix(lap.track))}`, fields }],
    });
  }
}

// the account side of /link: the web app shows who is asking and confirms (signed in, /account/discord/…)
export async function discordAccount(env, a, p, m, body, url) {
  const JSONH = { "content-type": "application/json; charset=utf-8", "cache-control": "no-store", "access-control-allow-origin": "*" };
  const json = (v, status = 200) => new Response(JSON.stringify(v), { status, headers: JSONH });
  const code = String((m === "GET" ? url.searchParams.get("c") : body.code) || "").toUpperCase().replace(/[^A-Z0-9]/g, "");
  if (code.length !== 8) return json({ error: "this link is not valid" }, 400);
  const h = await sha256("discord:" + code);
  const c = await env.DB.prepare("SELECT discord_id, discord_name, guild_id FROM discord_codes WHERE code_hash=?1 AND expires>?2").bind(h, Date.now()).first();
  if (!c) return json({ error: "this link expired: ask the bot again with /link" }, 404);
  if (p === "/discord/code" && m === "GET") return json({ name: c.discord_name });
  if (p === "/discord/link" && m === "POST") {
    const now = Date.now();
    await env.DB.batch([
      env.DB.prepare("DELETE FROM discord_links WHERE discord_id=?1 OR account_id=?2").bind(c.discord_id, a.id),
      env.DB.prepare("INSERT INTO discord_links (discord_id, account_id, created) VALUES (?1,?2,?3)").bind(c.discord_id, a.id, now),
      env.DB.prepare("DELETE FROM discord_codes WHERE code_hash=?1").bind(h),
      ...(c.guild_id ? [env.DB.prepare("INSERT OR REPLACE INTO discord_members (guild_id, discord_id, seen) VALUES (?1,?2,?3)").bind(c.guild_id, c.discord_id, now)] : []),
    ]);
    return json({ ok: true, name: c.discord_name });
  }
  return json({ error: "not found" }, 404);
}
