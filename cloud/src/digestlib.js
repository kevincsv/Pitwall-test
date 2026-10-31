// The weekly email (digest.js wires it to the server, migration 0080): what the driver did in the last seven days, in
// their language, sent on Monday to the drivers who turned it on in Settings. The routes and the job take the sign-in,
// the escrow, the summary and the sender handed in, so cloud/test/digest.test.mjs runs them on SQLite.
export const WEEK = 7 * 86400e3, PER_RUN = 40;
const L3 = (l) => (["en", "es", "pt"].includes(l) ? l : "en");

export const SQL_SUB_GET = "SELECT account_id, lang, sent_at FROM digest_subs WHERE account_id=?1";
export const SQL_SUB_ON = "INSERT INTO digest_subs (account_id, lang, sent_at) VALUES (?1,?2,?3) ON CONFLICT(account_id) DO UPDATE SET lang=excluded.lang";
export const SQL_SUB_OFF = "DELETE FROM digest_subs WHERE account_id=?1";
export const SQL_DUE = "SELECT d.account_id, d.lang, a.escrow, a.display FROM digest_subs d JOIN accounts a ON a.id=d.account_id WHERE d.sent_at IS NULL OR d.sent_at<?1 LIMIT " + PER_RUN;
export const SQL_SENT = "UPDATE digest_subs SET sent_at=?2 WHERE account_id=?1";
// the cars and tracks driven this week whose best beats every week before (a first time there is not a personal best)
export const SQL_PBS = `SELECT s.track, s.track_config, s.car, MIN(s.best) AS b,
  (SELECT MIN(p.best) FROM sessions p WHERE p.uploader=?1 AND p.track=s.track AND COALESCE(p.track_config,'')=COALESCE(s.track_config,'') AND p.car=s.car AND p.started<?2 AND p.best>0) AS before
  FROM sessions s WHERE s.uploader=?1 AND s.started>=?2 AND s.best>0 GROUP BY s.track, s.track_config, s.car`;

/** A lap time as the apps write it: 1:23.456. */
export const lapStr = (t) => { const m = Math.floor(t / 60), s = t - m * 60; return (m ? m + ":" + (s < 10 ? "0" : "") : "") + s.toFixed(3); };

/** The new personal bests of the week, the biggest gain first, at most three. */
export const pbsOf = (rows) => (rows || []).filter((r) => r.before != null && r.b < r.before).sort((a, b) => (b.before - b.b) - (a.before - a.b)).slice(0, 3);

const W = {
  en: { subject: "Your week in Pitlane HQ", button: "Open Pitlane HQ", off: "You can turn this email off in Settings, or with this link.",
    line: (s) => `${s.sessions} session${s.sessions === 1 ? "" : "s"}, ${s.laps} lap${s.laps === 1 ? "" : "s"} and ${hm(s.secs, "en")} on track.`,
    races: (s) => `${s.races} race${s.races === 1 ? "" : "s"}, ${s.top5} in the top 5.`,
    best: (b) => `Your best finish was P${b.pos} at ${b.track} in the ${b.car}.`,
    pb: (p) => `New personal best at ${p.track} in the ${p.car}, ${lapStr(p.b)}.` },
  es: { subject: "Tu semana en Pitlane HQ", button: "Abrir Pitlane HQ", off: "Puedes desactivar este email en Ajustes o con este enlace.",
    line: (s) => `${s.sessions} sesi${s.sessions === 1 ? "ón" : "ones"}, ${s.laps} vuelta${s.laps === 1 ? "" : "s"} y ${hm(s.secs, "es")} en pista.`,
    races: (s) => `${s.races} carrera${s.races === 1 ? "" : "s"}, ${s.top5} en el top 5.`,
    best: (b) => `Tu mejor resultado fue P${b.pos} en ${b.track} con el ${b.car}.`,
    pb: (p) => `Nuevo récord personal en ${p.track} con el ${p.car}, ${lapStr(p.b)}.` },
  pt: { subject: "Sua semana no Pitlane HQ", button: "Abrir o Pitlane HQ", off: "Você pode desligar este email em Configurações ou com este link.",
    line: (s) => `${s.sessions} sess${s.sessions === 1 ? "ão" : "ões"}, ${s.laps} volta${s.laps === 1 ? "" : "s"} e ${hm(s.secs, "pt")} na pista.`,
    races: (s) => `${s.races} corrida${s.races === 1 ? "" : "s"}, ${s.top5} no top 5.`,
    best: (b) => `Seu melhor resultado foi P${b.pos} em ${b.track} com o ${b.car}.`,
    pb: (p) => `Novo recorde pessoal em ${p.track} com o ${p.car}, ${lapStr(p.b)}.` },
};
function hm(secs, l) { const h = Math.floor(secs / 3600), m = Math.round((secs % 3600) / 60); return h ? `${h} h ${m} min` : `${m} min`; }

/** The email of one week, or null when the driver did not drive. */
export function digestMail(sum, pbs, l, offLink) {
  if (!sum || !sum.sessions) return null;
  const w = W[L3(l)], lines = [w.line(sum)];
  if (sum.races) lines.push(w.races(sum) + (sum.best && sum.best.pos ? " " + w.best(sum.best) : ""));
  for (const p of pbs || []) lines.push(w.pb(p));
  return { subject: w.subject, text: lines.join("\n") + "\n\n" + w.off + "\n" + offLink, button: w.button, link: "https://pitlanehq.app/", lang: L3(l) };
}

async function hmac(key, msg) {
  const k = await crypto.subtle.importKey("raw", new TextEncoder().encode(key), { name: "HMAC", hash: "SHA-256" }, false, ["sign"]);
  const b = await crypto.subtle.sign("HMAC", k, new TextEncoder().encode(msg));
  return [...new Uint8Array(b)].slice(0, 16).map((x) => x.toString(16).padStart(2, "0")).join("");
}
const offKey = (env) => env.DATA_KEY || env.EMAIL_PEPPER || env.PITLANE_KEY || "pitlanehq-digest";
export const offToken = (env, id) => hmac(offKey(env), "digest-off:" + id);
export const offLink = async (env, id) => "https://pitlanehq.app/community/digest/off?a=" + encodeURIComponent(id) + "&t=" + (await offToken(env, id));

const json = (o, s = 200) => new Response(JSON.stringify(o), { status: s, headers: { "content-type": "application/json", "cache-control": "no-store" } });
const OFF_PAGE = { en: ["Weekly email turned off", "You will not get it again. Turn it on in Settings whenever you like."],
  es: ["Email semanal desactivado", "No te llegará más. Actívalo en Ajustes cuando quieras."], pt: ["Email semanal desligado", "Você não vai recebê-lo mais. Ligue em Configurações quando quiser."] };

// GET  /community/digest (signed in)  {on}
// POST /community/digest (signed in)  {on, lang}  → {on}
// GET  /community/digest/off?a=&t=  the email's link: turns it off without signing in (t is the server's signature)
export async function handleDigest(req, env, url, { sessionAccount }) {
  const p = url.pathname, m = req.method;
  if (p === "/community/digest/off" && m === "GET") {
    const id = url.searchParams.get("a") || "", t = url.searchParams.get("t") || "";
    const ok = id && t && t === (await offToken(env, id));
    const row = ok ? await env.DB.prepare(SQL_SUB_GET).bind(id).first() : null;
    if (ok) await env.DB.prepare(SQL_SUB_OFF).bind(id).run();
    const [h, b] = OFF_PAGE[L3(row && row.lang)];
    return new Response(`<!doctype html><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><meta name="robots" content="noindex"><title>Pitlane HQ</title><body style="margin:0;background:#11151b;color:#e7ebf1;font:16px/1.5 -apple-system,'Segoe UI',Roboto,sans-serif;display:grid;place-items:center;min-height:100vh"><main style="max-width:420px;padding:24px;text-align:center"><h1 style="font-size:20px">${ok ? h : "Pitlane HQ"}</h1><p>${ok ? b : "This link does not work any more."}</p><p><a href="https://pitlanehq.app/" style="color:#ffb02e">pitlanehq.app</a></p></main></body>`,
      { status: ok ? 200 : 400, headers: { "content-type": "text/html; charset=utf-8", "cache-control": "no-store", "x-robots-tag": "noindex" } });
  }
  if (p !== "/community/digest") return null;
  const acc = await sessionAccount(req, env);
  if (!acc) return json({ error: "sign in with your Pitlane HQ account" }, 401);
  if (m === "GET") return json({ on: !!(await env.DB.prepare(SQL_SUB_GET).bind(acc.id).first()) });
  if (m === "POST") {
    const b = (await req.json().catch(() => null)) || {};
    if (b.on) await env.DB.prepare(SQL_SUB_ON).bind(acc.id, L3(String(b.lang || "").slice(0, 2)), Date.now()).run();
    else await env.DB.prepare(SQL_SUB_OFF).bind(acc.id).run();
    return json({ on: !!b.on });
  }
  return json({ error: "not found" }, 404);
}

/** Monday's job (the hourly runs from 07:00 UTC): up to PER_RUN drivers a run whose last week went out 5 days ago or more. */
export async function sendDigests(env, { openEscrow, sessionSummary, send }, now = Date.now()) {
  const due = (await env.DB.prepare(SQL_DUE).bind(now - 5 * 86400e3).all()).results || [];
  let sent = 0;
  for (const d of due) {
    try {
      const up = "acct:" + d.account_id, from = now - WEEK;
      const sum = await sessionSummary(env.DB, { from, tz: 0, game: null, uploader: up, now });
      let mail = null;
      if (sum.sessions) {
        const pbs = pbsOf(((await env.DB.prepare(SQL_PBS).bind(up, from).all()).results) || []);
        mail = digestMail(sum, pbs, d.lang, await offLink(env, d.account_id));
      }
      if (mail) {
        const esc = await openEscrow(env, d.escrow).catch(() => null);
        if (esc && esc.email && (await send(env, esc.email, mail).catch(() => false))) sent++;
      }
    } catch (e) {}
    await env.DB.prepare(SQL_SENT).bind(d.account_id, now).run();
  }
  return { due: due.length, sent };
}
