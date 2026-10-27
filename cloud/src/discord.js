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
import { famId, famName } from "./carfamily.js";
import { CATS, licOf } from "./categories.js";
import { goOn, appOf } from "./steam.js";

const SITE = "https://pitlanehq.app";
const API = "https://discord.com/api/v10";
const AMBER = 0xffb02e, PURPLE = 0xa970ff, EPHEMERAL = 64, MANAGE_GUILD = 0x20n;
const PRO = new Set(PLANS.discordPro || []);
// the commands that answer in the channel for everyone (a server can keep them to its chosen channels)
const PUBLIC_CMDS = new Set(["record", "driver", "download", "coach", "compare", "board"]);
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
  const me = user.id ? await env.DB.prepare("SELECT (SELECT account_id FROM discord_links WHERE discord_id=?1) AS account, (SELECT lang FROM discord_users WHERE discord_id=?1) AS lang, (SELECT cmd_channels FROM discord_guilds WHERE guild_id=?2) AS chans")
    .bind(user.id, it.guild_id || "").first() : null;
  const l = LANGS.includes(me && me.lang) ? me.lang : langOf(it.locale);
  if ((it.type !== 2 && it.type !== 3) || !it.data) return text(tr(l, "Unknown action", "Acción desconocida", "Ação desconhecida"));
  const x = { env, ctx, it, l, user, account: (me && me.account) || null, guild: it.guild_id || null, opt: {} };
  if (it.type === 3) {
    try { return await panelAction(x); } catch (e) { return text(tr(l, "Something went wrong, try again in a moment.", "Algo ha fallado, prueba otra vez en un momento.", "Algo deu errado, tente de novo em um momento.")); }
  }
  for (const o of it.data.options || []) x.opt[o.name] = o.value;
  // a linked driver who uses the bot in a server is one of its drivers (its ranking and its alerts)
  if (x.account && x.guild) ctx.waitUntil(env.DB.prepare("INSERT INTO discord_members (guild_id, discord_id, seen) VALUES (?1,?2,?3) ON CONFLICT(guild_id, discord_id) DO UPDATE SET seen=excluded.seen").bind(x.guild, user.id, Date.now()).run().catch(() => {}));
  const name = it.data.name;
  // a server that chose the channels the bot answers in: its public answers only there (private ones anywhere)
  let chans = [];
  try { chans = JSON.parse((me && me.chans) || "[]") || []; } catch (e) {}
  if (x.guild && chans.length && PUBLIC_CMDS.has(name) && !chans.includes(it.channel_id) && !chans.includes(it.channel && it.channel.parent_id))
    return text(tr(l, "In this server the bot answers in ", "En este servidor el bot responde en ", "Neste servidor o bot responde em ") + chans.map((c) => `<#${c}>`).join(" ") + ".");
  if (PRO.has(name) && !(await isPro(env, x.account))) return proOnly(x);
  const run = { record, driver, link: linkStart, unlink, download, help, language, setup, coach, compare, board, alerts }[name];
  if (!run) return text(tr(l, "Unknown command", "Comando desconocido", "Comando desconhecido"));
  try {
    return await run(x);
  } catch (e) {
    return text(tr(l, "Something went wrong, try again in a moment.", "Algo ha fallado, prueba otra vez en un momento.", "Algo deu errado, tente de novo em um momento."));
  }
}

// an answer that takes longer than Discord's 3 seconds (the coach builds the model when it has new laps)
function later(x, eph, work, update) {
  const send = (data) => fetch(`${API}/webhooks/${x.it.application_id}/${x.it.token}/messages/@original`, { method: "PATCH", headers: { "content-type": "application/json" }, body: JSON.stringify(answer(data)) });
  x.ctx.waitUntil(work().catch(() => ({ content: tr(x.l, "Something went wrong, try again in a moment.", "Algo ha fallado, prueba otra vez en un momento.", "Algo deu errado, tente de novo em um momento.") })).then(send).catch(() => {}));
  return reply(update ? { type: 6 } : { type: 5, data: eph ? { flags: EPHEMERAL } : {} });
}

const needLink = (x) => say({ content: tr(x.l, "Link your Pitlane HQ account first with /link.", "Vincula antes tu cuenta de Pitlane HQ con /link.", "Vincule antes a sua conta do Pitlane HQ com /link.") }, true);
function proOnly(x) {
  const url = PLANS.storeUrl || SITE;
  return say({
    embeds: [{ color: PURPLE, title: tr(x.l, "A Pitlane HQ Pro feature", "Una función de Pitlane HQ Pro", "Um recurso do Pitlane HQ Pro"),
      description: x.account ? tr(x.l, "This command is part of Pitlane HQ Pro.", "Este comando es parte de Pitlane HQ Pro.", "Este comando faz parte do Pitlane HQ Pro.")
        : tr(x.l, "This command is part of Pitlane HQ Pro. Link your account with /link first.", "Este comando es parte de Pitlane HQ Pro. Vincula antes tu cuenta con /link.", "Este comando faz parte do Pitlane HQ Pro. Vincule antes a sua conta com /link.") }],
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
  return (r.results || []).map((x) => ({ ...x, car: famName("iracing", x.c, x.car) }));
}
// what was picked in the list ("t-c"), or the most driven car and track with every word typed
async function comboOf(env, v) {
  const m = /^(\d+)-(\d+)$/.exec(String(v || ""));
  if (m) {
    const c = await famId(env, "iracing", m[2]);
    const r = await env.DB.prepare("SELECT MAX(track) AS track, MAX(car) AS car FROM community_laps WHERE track_id=?1 AND car_id=?2 AND game='iracing'").bind(+m[1], c).first();
    if (r && r.track) return { t: +m[1], c, track: r.track, car: famName("iracing", c, r.car) };
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
  const dc = !a.anon ? await x.env.DB.prepare("SELECT discord_id FROM discord_links WHERE account_id=?1 AND shown=1").bind(a.id).first() : null;
  if (dc) fields.push({ name: "Discord", value: `<@${dc.discord_id}>` });
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
    return text(tr(x.l, `Your Discord is linked to **${md(a ? a.alias : "?")}**. Use /unlink to change it.`, `Tu Discord está vinculado a **${md(a ? a.alias : "?")}**. Usa /unlink para cambiarlo.`, `O seu Discord está vinculado a **${md(a ? a.alias : "?")}**. Use /unlink para mudar.`));
  }
  const ABC = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789", code = [...crypto.getRandomValues(new Uint8Array(8))].map((b) => ABC[b % 32]).join("");
  const now = Date.now();
  await x.env.DB.batch([
    x.env.DB.prepare("DELETE FROM discord_codes WHERE expires<?1 OR discord_id=?2").bind(now, x.user.id),
    x.env.DB.prepare("INSERT INTO discord_codes (code_hash, discord_id, discord_name, guild_id, expires, handle) VALUES (?1,?2,?3,?4,?5,?6)")
      .bind(await sha256("discord:" + code), x.user.id, String(x.user.global_name || x.user.username || "").slice(0, 40), x.guild, now + 10 * 60e3, String(x.user.username || "").slice(0, 40) || null),
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
    "`/record` el récord y el top 10 de un coche y circuito\n`/driver` el perfil de un piloto, o el tuyo\n`/link` · `/unlink` tu cuenta de Pitlane HQ\n`/download` las apps\n`/language` el idioma del bot", "`/record` o recorde e o top 10 de um carro e pista\n`/driver` o perfil de um piloto, ou o seu\n`/link` · `/unlink` a sua conta do Pitlane HQ\n`/download` os apps\n`/language` o idioma do bot");
  const pro = tr(x.l,
    "`/coach` your best lap against the next level and the record\n`/compare` your laps against another driver's\n`/board` this server's ranking on a car and track\n`/alerts` this server's new best laps and records, posted in a channel",
    "`/coach` tu mejor vuelta contra el siguiente nivel y el récord\n`/compare` tus vueltas contra las de otro piloto\n`/board` el ranking de este servidor en un coche y circuito\n`/alerts` las mejores vueltas y récords de este servidor, en un canal", "`/coach` a sua melhor volta contra o próximo nível e o recorde\n`/compare` as suas voltas contra as de outro piloto\n`/board` o ranking deste servidor em um carro e pista\n`/alerts` as melhores voltas e recordes deste servidor, em um canal");
  const open = PLANS.enforce ? "" : tr(x.l, "\n*Open to everyone for now.*", "\n*Abierto a todos por ahora.*", "\n*Aberto a todos por enquanto.*");
  return say({
    embeds: [{ color: AMBER, title: "Pitlane HQ", url: SITE,
      fields: [{ name: tr(x.l, "Free", "Gratis", "Grátis"), value: free }, { name: "Pro", value: pro + open },
        { name: tr(x.l, "For the server's managers", "Para quien gestiona el servidor", "Para quem gerencia o servidor"),
          value: tr(x.l, "`/setup` the channels the bot answers in, the channels for best laps and records, and their language",
            "`/setup` los canales donde responde el bot, los de mejores vueltas y récords, y su idioma",
            "`/setup` os canais onde o bot responde, os das melhores voltas e recordes, e o idioma deles") }],
      footer: { text: tr(x.l, "Your laps reach the bot once Pitlane HQ for Windows records them.", "Tus vueltas llegan al bot cuando Pitlane HQ para Windows las graba.", "As suas voltas chegam ao bot quando o Pitlane HQ para Windows as grava.") } }],
  }, true);
}

// the bot's language for this Discord user ("auto": the Discord app's own); the command names are English for everyone
async function language(x) {
  const v = String(x.opt.lang || "auto");
  if (LANGS.includes(v)) await x.env.DB.prepare("INSERT INTO discord_users (discord_id, lang, updated) VALUES (?1,?2,?3) ON CONFLICT(discord_id) DO UPDATE SET lang=excluded.lang, updated=excluded.updated").bind(x.user.id, v, Date.now()).run();
  else await x.env.DB.prepare("DELETE FROM discord_users WHERE discord_id=?1").bind(x.user.id).run();
  const l = LANGS.includes(v) ? v : langOf(x.it.locale);
  return text(LANGS.includes(v) ? tr(l, "Done: the bot answers you in English.", "Hecho: el bot te responde en español.", "Pronto: o bot responde a você em português.")
    : tr(l, "Done: the bot answers you in your Discord app's language.", "Hecho: el bot te responde en el idioma de tu app de Discord.", "Pronto: o bot responde a você no idioma do seu app do Discord."));
}

// ---------- the server's settings: /setup ----------
const canManage = (x) => { try { return !!(BigInt((x.it.member && x.it.member.permissions) || "0") & MANAGE_GUILD); } catch (e) { return false; } };
const LNAME = { en: "English", es: "Español", pt: "Português" };
async function guildCfg(env, guild) {
  const g = await env.DB.prepare("SELECT alerts_channel, records_channel, cmd_channels, lang FROM discord_guilds WHERE guild_id=?1").bind(guild).first();
  let cmd = [];
  try { cmd = JSON.parse((g && g.cmd_channels) || "[]") || []; } catch (e) {}
  return { laps: (g && g.alerts_channel) || null, recs: (g && g.records_channel) || null, cmd, lang: (g && g.lang) || null };
}
const saveGuild = (env, guild, col, val) => env.DB.prepare(`INSERT INTO discord_guilds (guild_id, ${col}, updated) VALUES (?1,?2,?3) ON CONFLICT(guild_id) DO UPDATE SET ${col}=excluded.${col}, updated=excluded.updated`).bind(guild, val, Date.now()).run();
function panel(x, c, note) {
  const L = c.lang || langOf(x.it.guild_locale || x.it.locale), off = tr(x.l, "off", "apagado", "desligado");
  const pick = (id, ph, max, vals) => ({ type: 1, components: [{ type: 8, custom_id: id, placeholder: ph, min_values: 0, max_values: max, channel_types: [0, 5], default_values: vals.map((v) => ({ id: v, type: "channel" })) }] });
  const lines = [
    "**" + tr(x.l, "Pitlane HQ in this server", "Pitlane HQ en este servidor", "Pitlane HQ neste servidor") + "**",
    tr(x.l, "Commands answer in: ", "Los comandos responden en: ", "Os comandos respondem em: ") + (c.cmd.length ? c.cmd.map((v) => `<#${v}>`).join(" ") : tr(x.l, "every channel", "todos los canales", "todos os canais")),
    tr(x.l, "New best laps: ", "Mejores vueltas: ", "Melhores voltas: ") + (c.laps ? `<#${c.laps}>` : off),
    tr(x.l, "New records: ", "Récords: ", "Recordes: ") + (c.recs ? `<#${c.recs}>` : c.laps ? `<#${c.laps}>` : off),
    tr(x.l, "Alerts' language: ", "Idioma de las alertas: ", "Idioma dos alertas: ") + LNAME[L],
  ];
  if (note) lines.push("", note);
  return {
    content: lines.join("\n"),
    components: [
      pick("cfg:cmd", tr(x.l, "Channels where the bot answers (none: all)", "Canales donde responde el bot (ninguno: todos)", "Canais onde o bot responde (nenhum: todos)"), 25, c.cmd),
      pick("cfg:laps", tr(x.l, "Channel for new best laps (none: off)", "Canal de mejores vueltas (ninguno: apagado)", "Canal das melhores voltas (nenhum: desligado)"), 1, c.laps ? [c.laps] : []),
      pick("cfg:recs", tr(x.l, "Channel for new records (none: the best laps' one)", "Canal de récords (ninguno: el de mejores vueltas)", "Canal dos recordes (nenhum: o das melhores voltas)"), 1, c.recs ? [c.recs] : []),
      { type: 1, components: [{ type: 3, custom_id: "cfg:lang", placeholder: tr(x.l, "Alerts' language", "Idioma de las alertas", "Idioma dos alertas"), options: LANGS.map((v) => ({ label: LNAME[v], value: v, default: v === L })) }] },
    ],
  };
}
const onlyManagers = (x) => text(tr(x.l, "Only the people who manage this server can change this.", "Solo quien gestiona este servidor puede cambiar esto.", "Só quem gerencia este servidor pode mudar isto."));
async function setup(x) {
  if (!x.guild) return text(tr(x.l, "This works inside a server.", "Esto funciona dentro de un servidor.", "Isto funciona dentro de um servidor."));
  if (!canManage(x)) return onlyManagers(x);
  return say(panel(x, await guildCfg(x.env, x.guild)), true);
}
// a choice in the panel: saved at once, the panel shows the server as it is now
async function panelAction(x) {
  const id = String(x.it.data.custom_id || "");
  if (!id.startsWith("cfg:")) return reply({ type: 6 });
  if (!x.guild || !canManage(x)) return onlyManagers(x);
  const kind = id.slice(4), raw = (x.it.data.values || []).map(String), chans = raw.filter((v) => /^\d{5,25}$/.test(v));
  const upd = async (note) => reply({ type: 7, data: answer(panel(x, await guildCfg(x.env, x.guild), note)) });
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
  if (!ch) { await saveGuild(x.env, x.guild, col, null); return upd(tr(x.l, "Saved.", "Guardado.", "Salvo.")); }
  // the alerts are Pro and go out while the account that set them has it
  if (!x.account) return upd(tr(x.l, "Link your Pitlane HQ account first with /link to set the alerts.", "Vincula antes tu cuenta de Pitlane HQ con /link para configurar las alertas.", "Vincule antes a sua conta do Pitlane HQ com /link para configurar os alertas."));
  if (!(await isPro(x.env, x.account))) return upd(tr(x.l, "The alerts are part of Pitlane HQ Pro.", "Las alertas son parte de Pitlane HQ Pro.", "Os alertas fazem parte do Pitlane HQ Pro."));
  if (!x.env.DISCORD_BOT_TOKEN) return upd(tr(x.l, "The bot cannot post yet (no bot token on the server).", "El bot aún no puede publicar (falta su token en el servidor).", "O bot ainda não pode publicar (falta o token dele no servidor)."));
  return later(x, true, async () => {
    const c = await guildCfg(x.env, x.guild), gl = c.lang || langOf(x.it.guild_locale || x.it.locale);
    const hello = kind === "laps"
      ? tr(gl, "🏁 Pitlane HQ: this server's new best laps will show up here.", "🏁 Pitlane HQ: aquí saldrán las nuevas mejores vueltas de este servidor.", "🏁 Pitlane HQ: aqui vão aparecer as novas melhores voltas deste servidor.")
      : tr(gl, "🏆 Pitlane HQ: the records this server's drivers set will show up here.", "🏆 Pitlane HQ: aquí saldrán los récords que batan los pilotos de este servidor.", "🏆 Pitlane HQ: aqui vão aparecer os recordes que os pilotos deste servidor baterem.");
    if (!(await post(x.env, ch, { content: hello })))
      return panel(x, c, tr(x.l, `I cannot post in <#${ch}>: give the bot View channel, Send messages and Embed links there.`, `No puedo publicar en <#${ch}>: da al bot Ver canal, Enviar mensajes e Insertar enlaces allí.`, `Não consigo publicar em <#${ch}>: dê ao bot Ver canal, Enviar mensagens e Inserir links lá.`));
    await x.env.DB.batch([
      x.env.DB.prepare(`INSERT INTO discord_guilds (guild_id, ${col}, set_by, lang, updated) VALUES (?1,?2,?3,?4,?5) ON CONFLICT(guild_id) DO UPDATE SET ${col}=excluded.${col}, set_by=excluded.set_by, lang=COALESCE(discord_guilds.lang, excluded.lang), updated=excluded.updated`)
        .bind(x.guild, ch, x.account, gl, Date.now()),
    ]);
    return panel(x, await guildCfg(x.env, x.guild), tr(x.l, "Saved.", "Guardado.", "Salvo."));
  }, true);
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
    "Nadie de este servidor tiene vuelta ahí todavía. Los pilotos aparecen cuando vinculan su cuenta (/link) y usan el bot aquí.", "Ninguém deste servidor tem volta aí ainda. Os pilotos aparecem quando vinculam a conta (/link) e usam o bot aqui."), false);
  const lines = rows.map((v, i) => `\`${String(i + 1).padStart(2)}\` \`${fmt(v.time)}\` ${i ? `\`${gap(v.time - rows[0].time)}\` ` : ""}<@${v.did}> ${md(v.alias)} · P${v.pos} ${tr(x.l, "overall", "general", "geral")}`);
  return say({
    embeds: [{ color: AMBER, title: `${fix(k.car)}`.slice(0, 250), url: recUrl(x.l, k), description: `**${md(fix(k.track))}** · ${tr(x.l, "this server", "este servidor", "este servidor")}\n\n` + lines.join("\n") }],
  });
}

async function alerts(x) {
  if (!x.guild) return text(tr(x.l, "This works inside a server.", "Esto funciona dentro de un servidor.", "Isto funciona dentro de um servidor."));
  if (!canManage(x)) return text(tr(x.l, "Only the people who manage this server can set the alerts.", "Solo quien gestiona este servidor puede configurar las alertas.", "Só quem gerencia este servidor pode configurar os alertas."));
  if (!x.account) return needLink(x);
  const ch = x.opt.channel, now = Date.now(), gl = LANGS.includes(x.opt.language) ? x.opt.language : langOf(x.it.guild_locale || x.it.locale);
  if (!ch) {
    await x.env.DB.prepare("UPDATE discord_guilds SET alerts_channel=NULL, records_channel=NULL, updated=?2 WHERE guild_id=?1").bind(x.guild, now).run();
    return text(tr(x.l, "Alerts off.", "Alertas apagadas.", "Alertas desligados."));
  }
  if (!x.env.DISCORD_BOT_TOKEN) return text(tr(x.l, "The bot cannot post yet (no bot token on the server).", "El bot aún no puede publicar (falta su token en el servidor).", "O bot ainda não pode publicar (falta o token dele no servidor)."));
  return later(x, true, async () => {
    // a first message: the bot can post there, or it says what it is missing
    const ok = await post(x.env, ch, { content: tr(gl, "🏁 Pitlane HQ alerts: this server's new best laps and records will show up here.", "🏁 Alertas de Pitlane HQ: aquí saldrán las mejores vueltas y los récords de este servidor.", "🏁 Alertas do Pitlane HQ: aqui vão aparecer as melhores voltas e os recordes deste servidor.") });
    if (!ok) return { content: tr(x.l, `I cannot post in <#${ch}>: give the bot View channel, Send messages and Embed links there.`, `No puedo publicar en <#${ch}>: da al bot Ver canal, Enviar mensajes e Insertar enlaces allí.`, `Não consigo publicar em <#${ch}>: dê ao bot Ver canal, Enviar mensagens e Inserir links lá.`) };
    await x.env.DB.prepare("INSERT INTO discord_guilds (guild_id, alerts_channel, set_by, lang, updated) VALUES (?1,?2,?3,?4,?5) ON CONFLICT(guild_id) DO UPDATE SET alerts_channel=excluded.alerts_channel, records_channel=NULL, set_by=excluded.set_by, lang=excluded.lang, updated=excluded.updated")
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
  const gs = (await env.DB.prepare("SELECT g.guild_id, g.alerts_channel, g.records_channel, g.set_by, g.lang FROM discord_members m JOIN discord_guilds g ON g.guild_id=m.guild_id WHERE m.discord_id=?1 AND (g.alerts_channel IS NOT NULL OR g.records_channel IS NOT NULL)").bind(a.discord_id).all()).results || [];
  if (!gs.length) return;
  const st = await env.DB.prepare(
    `SELECT (SELECT COUNT(*) FROM community_laps l WHERE l.track_id=?1 AND l.car_id=?2 AND l.game='iracing' AND ${NOT_MODEL} AND l.time<?3)+1 AS pos,
            (SELECT COUNT(*) FROM community_laps l WHERE l.track_id=?1 AND l.car_id=?2 AND l.game='iracing' AND ${NOT_MODEL}) AS total`
  ).bind(lap.trackId, lap.carId, lap.time).first();
  const k = { t: lap.trackId, c: lap.carId, track: lap.track, car: lap.car };
  for (const g of gs) {
    const rec = st.pos === 1 && st.total > 1, channel = rec ? g.records_channel || g.alerts_channel : g.alerts_channel;
    if (!channel || !(await isPro(env, g.set_by))) continue;
    const l = ["es", "pt"].includes(g.lang) ? g.lang : "en";
    const fields = [
      { name: tr(l, "Time", "Tiempo", "Tempo"), value: `\`${fmt(lap.time)}\`` + (lap.prev ? ` \`${gap(lap.time - lap.prev)}\`` : ""), inline: true },
      { name: tr(l, "Position", "Posición", "Posição"), value: `**P${st.pos}** ${tr(l, "of", "de", "de")} ${st.total}`, inline: true },
    ];
    await post(env, channel, {
      embeds: [{ color: rec ? PURPLE : AMBER, url: recUrl(l, k), title: rec ? tr(l, "🏆 New record", "🏆 Nuevo récord", "🏆 Novo recorde") : tr(l, "⏱️ New best lap", "⏱️ Nueva mejor vuelta", "⏱️ Nova melhor volta"),
        description: `<@${a.discord_id}> **${md(a.alias)}**\n${md(fix(lap.car))} · ${md(fix(lap.track))}`, fields }],
    });
  }
}

// link one Discord user to one account (either side's older link goes); a relink of the same pair keeps "shown", and
// "login" (it signs in with Discord) when this link proves it (Discord's sign-in from the account) or the old one did
async function linkPair(env, discordId, accountId, handle, guildId, login) {
  const was = await env.DB.prepare("SELECT shown, login FROM discord_links WHERE discord_id=?1 AND account_id=?2").bind(discordId, accountId).first();
  const now = Date.now();
  await env.DB.batch([
    env.DB.prepare("DELETE FROM discord_links WHERE discord_id=?1 OR account_id=?2").bind(discordId, accountId),
    env.DB.prepare("INSERT INTO discord_links (discord_id, account_id, created, handle, shown, login) VALUES (?1,?2,?3,?4,?5,?6)").bind(discordId, accountId, now, handle || null, was && was.shown ? 1 : 0, login || (was && was.login) ? 1 : 0),
    ...(guildId ? [env.DB.prepare("INSERT OR REPLACE INTO discord_members (guild_id, discord_id, seen) VALUES (?1,?2,?3)").bind(guildId, discordId, now)] : []),
  ]);
}

// ---------- "Sign in with Discord" and "Link Discord" (Discord's OAuth2, scope identify) ----------
// Made like "Sign in with Steam" (steam.js): the browser goes to discord.com and comes back to /discord/oauth with a code
// the server exchanges (DISCORD_APP_ID + DISCORD_CLIENT_SECRET) for who signed in, and the app that started gets a one-use
// grant: a sign-in (POST /account/login/discord), a sign-up when that Discord has no account yet (discordSid on POST
// /account/register, linked at once) or a link (POST /account/discord/link/grant). A grant is only good with the code the
// server gave the app that started (discordStart; the browser never sees it), so a Discord answer or a grant passed on to
// somebody else signs nobody in and links nothing to anybody. The PC's browser goes on to the PC's own agent
// (http://127.0.0.1:<port>/discord/done). Discord only says who: the data key still comes from the password.
// The phone apps (app: 1 on the start, never with port) get it back by their own scheme, pitlanehq://discord?state=<state>&
// and the same query the web gets (discordLogin=<grant> | discordLogin=0 | discordLogin=0&new=1&sid=&name= |
// discordLogin=0&relink=1 | discordLink=<grant> | discordLinked=0 | discordLinked=taken); the grant is still good only with
// the app's code. The phone builds from before this (POST /account/discord/start without auth) link at once (kind
// "legacy", a link that never signs in) and come back to /?discordLinked=1 as they did.
const JSONH = { "content-type": "application/json; charset=utf-8", "cache-control": "no-store", "access-control-allow-origin": "*" };
const json = (v, status = 200) => new Response(JSON.stringify(v), { status, headers: JSONH });
const hexOf = (b) => [...new Uint8Array(b)].map((x) => x.toString(16).padStart(2, "0")).join("");
const rid = () => hexOf(crypto.getRandomValues(new Uint8Array(24)));
const isHex48 = (v) => typeof v === "string" && /^[0-9a-f]{48}$/.test(v);
const portOf = (v) => (Number.isInteger(Number(v)) && Number(v) > 0 && Number(v) < 65536 ? Number(v) : null);
const clean32 = (a) => (typeof a === "string" ? a : "").slice(0, 32).replace(/[\u0000-\u001f<>]/g, "").trim();
// a local server (tools/local.cmd) comes back to itself, never to pitlanehq.app
const siteOf = (env, url) => (env.LOCAL === "1" && url ? url.origin : SITE);
const oauthBack = (env, url) => siteOf(env, url) + "/discord/oauth";
export const oauthReady = (env) => !!(env.DISCORD_APP_ID && env.DISCORD_CLIENT_SECRET);
const NOT_READY = "Discord sign-in is not set up on this server yet";
const AGAIN = "this Discord sign-in is not valid any more, sign in with Discord again";

// the address the browser opens, and what only the app that asked keeps: the state (10 minutes, as a hash) and the code
// its grant is redeemed with. kind "link" (an account linking its Discord) or "login" (a sign-in, or a sign-up when that
// Discord has no account); port is the PC's agent, which the browser goes on to instead of the web app, app the phone
// apps (their scheme); one of the two at most ({ error } then)
export async function discordStart(env, url, kind, accountId, device, port, app) {
  if (portOf(port) && appOf(app)) return { error: "port or app, not both" };
  const state = rid(), code = rid(), now = Date.now();
  await env.DB.batch([
    env.DB.prepare("DELETE FROM discord_oauth WHERE expires<?1 OR (account_id IS NOT NULL AND account_id=?2)").bind(now, accountId || ""),
    env.DB.prepare("INSERT INTO discord_oauth (state_hash, code_hash, account_id, device, kind, port, app, expires) VALUES (?1,?2,?3,?4,?5,?6,?7,?8)")
      .bind(await sha256("discord-oauth:" + state), await sha256("discord-code:" + code), accountId || null, clean32(device) || null, kind, portOf(port), appOf(app) ? 1 : 0, now + 10 * 60e3),
  ]);
  const q = new URLSearchParams({ client_id: env.DISCORD_APP_ID, response_type: "code", scope: "identify", redirect_uri: oauthBack(env, url), state });
  if (kind === "login") q.set("prompt", "none"); // a driver who already allowed the app goes straight back

  return { url: "https://discord.com/oauth2/authorize?" + q, state, code };
}
// a grant carries the state's code hash (and, for a link, its account), so only the app that started can use it
async function newGrant(env, kind, st, me, ttl) {
  const g = rid();
  await env.DB.batch([
    env.DB.prepare("DELETE FROM discord_grants WHERE expires<?1").bind(Date.now()),
    env.DB.prepare("INSERT INTO discord_grants (grant_hash, code_hash, account_id, discord_id, handle, name, device, kind, expires) VALUES (?1,?2,?3,?4,?5,?6,?7,?8,?9)")
      .bind(await sha256("discord-grant:" + g), st.code_hash, st.account_id || null, me.id, me.handle || null, me.name || null, st.device, kind, Date.now() + ttl),
  ]);
  return g;
}
// a grant is used once, with the code of the app that started: what Discord proved (the user, the handle, the device that
// asked, the account that asked to link), or null
export async function useDiscordGrant(env, g, kind, code) {
  if (!isHex48(g) || !isHex48(code)) return null;
  const r = await env.DB.prepare("DELETE FROM discord_grants WHERE grant_hash=?1 AND kind=?2 RETURNING code_hash, account_id, discord_id, handle, name, device, expires").bind(await sha256("discord-grant:" + g), kind).first();
  return r && r.expires >= Date.now() && r.code_hash === (await sha256("discord-code:" + code)) ? r : null;
}
// the account a Discord user signs in to: only a link Discord's own sign-in made (login 1)
export const discordAccountId = async (env, discordId) => ((await env.DB.prepare("SELECT account_id FROM discord_links WHERE discord_id=?1 AND login=1").bind(discordId).first()) || {}).account_id || null;
// whether the Discord user is linked to any account (a sign-up with it is not possible then)
export const discordLinkedAny = async (env, discordId) => !!(await env.DB.prepare("SELECT 1 FROM discord_links WHERE discord_id=?1").bind(discordId).first());
// the link made with a sign-up or a link grant (it signs in with Discord): "taken" when that Discord is another account's
export async function linkDiscordLogin(env, g, accountId) {
  const other = await env.DB.prepare("SELECT account_id FROM discord_links WHERE discord_id=?1").bind(g.discord_id).first();
  if (other && other.account_id !== accountId) return "taken";
  await linkPair(env, g.discord_id, accountId, g.handle, null, true);
  return "ok";
}
// who Discord's answer names (pure, so a test can run it): the id, the handle and the name to offer for a new account
export function discordUser(me) {
  if (!me || !/^\d{5,25}$/.test(String(me.id || ""))) return null;
  const handle = String(me.username || "").replace(/[^A-Za-z0-9_.]/g, "").slice(0, 40);
  return { id: String(me.id), handle, name: clean32(me.global_name) || clean32(handle) };
}

// Discord comes back here (GET /discord/oauth?code&state, or ?error&state when the driver said no): the state is used
// once, the code exchanged, and the browser goes on with the grant (goOn in steam.js): to the web app, the PC's own agent
// or the phone app, which redeems it with its code. Only "identify" is asked: the id, the username and the display name.
// An unknown state is a sign-in's
export async function discordOAuth(req, env, url) {
  const base = siteOf(env, url);
  const state = url.searchParams.get("state") || "", code = url.searchParams.get("code") || "";
  if (!isHex48(state)) return Response.redirect(base + "/?discordLogin=0", 302);
  const st = await env.DB.prepare("DELETE FROM discord_oauth WHERE state_hash=?1 RETURNING code_hash, account_id, device, kind, port, app, expires").bind(await sha256("discord-oauth:" + state)).first();
  const back = (q) => goOn(base, "discord", st && st.kind !== "legacy" ? st : null, state, q);
  const fail = () => back(st && st.kind !== "login" ? "discordLinked=0" : "discordLogin=0");
  if (!st || st.expires < Date.now() || !code || !oauthReady(env)) return fail();
  // once the state is known an error still goes back to the app that started (its port or its scheme)
  try {
    return await discordAnswer(env, url, st, code, back, fail);
  } catch (e) {
    return fail();
  }
}
async function discordAnswer(env, url, st, code, back, fail) {
  let me = null;
  try {
    const t = await fetch(API + "/oauth2/token", {
      method: "POST",
      headers: { "content-type": "application/x-www-form-urlencoded" },
      body: new URLSearchParams({ client_id: env.DISCORD_APP_ID, client_secret: env.DISCORD_CLIENT_SECRET, grant_type: "authorization_code", code, redirect_uri: oauthBack(env, url) }),
    });
    const tok = t.ok ? await t.json() : null;
    if (!tok || !tok.access_token) return fail();
    const u = await fetch(API + "/users/@me", { headers: { authorization: "Bearer " + tok.access_token } });
    me = discordUser(u.ok ? await u.json() : null);
  } catch (e) {
    return fail();
  }
  if (!me) return fail();
  if (st.kind === "legacy") {
    // the old phone builds: linked at once, a link that never signs in (login 0), and never one that is another account's
    if (!st.account_id) return fail();
    const other = await env.DB.prepare("SELECT account_id FROM discord_links WHERE discord_id=?1").bind(me.id).first();
    if (other && other.account_id !== st.account_id) return back("discordLinked=taken");
    await linkPair(env, me.id, st.account_id, me.handle, null, false);
    return back("discordLinked=1");
  }
  if (st.kind === "link") {
    // linked by the app that asked (POST /account/discord/link/grant), never by this browser
    if (!st.account_id) return fail();
    return back("discordLink=" + (await newGrant(env, "link", st, me, 5 * 60e3)));
  }
  // a sign-in: the app signs in with the grant, or creates the account with the sign-up grant (linked at once). A Discord
  // linked only by the bot's /link code signs in nowhere: the driver links it again from Account (relink)
  if (await discordAccountId(env, me.id)) return back("discordLogin=" + (await newGrant(env, "login", st, me, 5 * 60e3)));
  if (await discordLinkedAny(env, me.id)) return back("discordLogin=0&relink=1");
  const q = new URLSearchParams({ discordLogin: "0", new: "1", sid: await newGrant(env, "signup", st, me, 30 * 60e3) });
  if (me.name) q.set("name", me.name);
  return back(String(q));
}

// the account side (signed in, /account/discord/…): what is linked, Discord's sign-in to link it from any app, the link
// with its grant, whether the profile shows it, unlinking, and the bot's /link code that the web app confirms. Linking
// and unlinking ask the password first (passCheck): a session alone never adds or removes a way into the account
export async function discordAccount(env, a, p, m, body, url, passCheck) {
  if (p === "/discord" && m === "GET") {
    const l = await env.DB.prepare("SELECT discord_id, handle, shown, login FROM discord_links WHERE account_id=?1").bind(a.id).first();
    return json({ linked: !!l, id: l ? l.discord_id : undefined, handle: l ? l.handle || "" : undefined, shown: !!(l && l.shown), login: !!(l && l.login), oauth: oauthReady(env) });
  }
  if (p === "/discord/start" && m === "POST") {
    if (!oauthReady(env)) return json({ error: NOT_READY + ": use /link in Discord" }, 503);
    const app = body.app || url.searchParams.get("app");
    // the phone builds from before Discord's sign-in send no password (nor app or port): their link never signs in
    if (body.auth == null && !app && !body.port) return json(await discordStart(env, url, "legacy", a.id, body.device));
    const no = await passCheck();
    if (no) return no;
    const r = await discordStart(env, url, "link", a.id, body.device, body.port, app);
    return json(r, r.error ? 400 : 200);
  }
  if (p === "/discord/link/grant" && m === "POST") {
    const g = await useDiscordGrant(env, body.grant, "link", body.code);
    if (!g || g.account_id !== a.id) return json({ error: AGAIN }, 400);
    if ((await linkDiscordLogin(env, g, a.id)) === "taken") return json({ error: "this Discord account is already linked to another account", code: "taken" }, 409);
    return json({ ok: true, handle: g.handle || "" });
  }
  if (p === "/discord/show" && m === "POST") {
    await env.DB.prepare("UPDATE discord_links SET shown=?2 WHERE account_id=?1").bind(a.id, body.shown ? 1 : 0).run();
    return json({ ok: true, shown: !!body.shown });
  }
  if (p === "/discord/unlink" && m === "POST") {
    // the phone builds from before unlink without the password: only a link that never signs in (login 0) goes that way
    const l = await env.DB.prepare("SELECT login FROM discord_links WHERE account_id=?1").bind(a.id).first();
    if (body.auth != null || (l && l.login)) {
      const no = await passCheck();
      if (no) return no;
    }
    await env.DB.batch([
      env.DB.prepare("DELETE FROM discord_members WHERE discord_id IN (SELECT discord_id FROM discord_links WHERE account_id=?1)").bind(a.id),
      env.DB.prepare("DELETE FROM discord_links WHERE account_id=?1").bind(a.id),
    ]);
    return json({ ok: true });
  }
  // the bot's /link: its one-use code, confirmed in the web app with the password. Such a link names the account in
  // Discord but never signs in with Discord (the code came from Discord, not from this browser)
  const code = String((m === "GET" ? url.searchParams.get("c") : body.code) || "").toUpperCase().replace(/[^A-Z0-9]/g, "");
  if (code.length !== 8) return json({ error: "this link is not valid" }, 400);
  const h = await sha256("discord:" + code);
  const c = await env.DB.prepare("SELECT discord_id, discord_name, guild_id, handle FROM discord_codes WHERE code_hash=?1 AND expires>?2").bind(h, Date.now()).first();
  if (!c) return json({ error: "this link expired: ask the bot again with /link" }, 404);
  if (p === "/discord/code" && m === "GET") return json({ name: c.discord_name });
  if (p === "/discord/link" && m === "POST") {
    const no = await passCheck();
    if (no) return no;
    await linkPair(env, c.discord_id, a.id, c.handle, c.guild_id, false);
    await env.DB.prepare("DELETE FROM discord_codes WHERE code_hash=?1").bind(h).run();
    return json({ ok: true, name: c.discord_name });
  }
  return json({ error: "not found" }, 404);
}
