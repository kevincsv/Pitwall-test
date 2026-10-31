// The phones' notifications (alerts.js wires it to the server, migration 0081): a record of a driver's beaten by another
// driver (keepBestLap in community.js calls recordBeaten before it keeps a faster lap) and, for the accounts with
// notifications on in a phone, the summary of their week on Monday. The phones read GET /community/alerts?since= in the
// background and show a notification; the PC and the web show a beaten record on Home. Nothing goes by email. The
// statements, the route and the job take the sign-in and the summary handed in, so cloud/test/alerts.test.mjs runs them
// on SQLite without the server.

export const ALERT_DAYS = 30, ALERT_MAX = 20, WEEK = 7 * 864e5, PER_RUN = 100;
const L3 = (l) => (["en", "es", "pt"].includes(l) ? l : "en");
const json = (o, status = 200) => new Response(JSON.stringify(o), { status, headers: { "content-type": "application/json", "cache-control": "no-store" } });

// the fastest lap of a car and track before the new one (the drivers' own boards, never the model's)
export const SQL_RECORD = "SELECT user_id, time FROM community_laps WHERE game=?1 AND track_id=?2 AND car_id=?3 AND COALESCE(shown,'')<>'model' ORDER BY time LIMIT 1";
// the account a driver's laps belong to: their own, or the one a DRINKS guest driver is joined to
export const SQL_ACCOUNT_OF = "SELECT COALESCE(a.id, CASE WHEN u.id LIKE 'guest-%' THEN u.owner END) AS acc FROM community_users u LEFT JOIN accounts a ON a.id=u.id WHERE u.id=?1";
export const SQL_ALIAS = "SELECT alias FROM community_users WHERE id=?1";
export const SQL_ALERT_ADD = "INSERT INTO alerts (id, account_id, kind, created, data) VALUES (?1,?2,?3,?4,?5)";
export const SQL_ALERTS = "SELECT id, kind, created, data FROM alerts WHERE account_id=?1 AND created>?2 ORDER BY created DESC LIMIT " + ALERT_MAX;
export const SQL_ALERT_PRUNE = "DELETE FROM alerts WHERE created<?1";
export const SQL_SUB_GET = "SELECT account_id FROM alert_subs WHERE account_id=?1";
export const SQL_SUB_ON = "INSERT INTO alert_subs (account_id, lang) VALUES (?1,?2) ON CONFLICT(account_id) DO UPDATE SET lang=excluded.lang";
export const SQL_SUB_OFF = "DELETE FROM alert_subs WHERE account_id=?1";
export const SQL_DUE = "SELECT account_id, lang FROM alert_subs WHERE week_at IS NULL OR week_at<?1 LIMIT " + PER_RUN;
export const SQL_WEEK_DONE = "UPDATE alert_subs SET week_at=?2 WHERE account_id=?1";
// the cars and tracks driven this week whose best beats every week before (a first time there is not a personal best)
export const SQL_PBS = `SELECT s.track, s.track_config, s.car, MIN(s.best) AS b,
  (SELECT MIN(p.best) FROM sessions p WHERE p.uploader=?1 AND p.track=s.track AND COALESCE(p.track_config,'')=COALESCE(s.track_config,'') AND p.car=s.car AND p.started<?2 AND p.best>0) AS before
  FROM sessions s WHERE s.uploader=?1 AND s.started>=?2 AND s.best>0 GROUP BY s.track, s.track_config, s.car`;

const rid = () => crypto.randomUUID().replace(/-/g, "").slice(0, 20);

/** A lap time as the apps write it: 1:23.456. */
export const lapStr = (t) => { const m = Math.floor(t / 60), s = t - m * 60; return (m ? m + ":" + (s < 10 ? "0" : "") : "") + s.toFixed(3); };

/** The new personal bests of the week, the biggest gain first, at most three. */
export const pbsOf = (rows) => (rows || []).filter((r) => r.before != null && r.b < r.before).sort((a, b) => (b.before - b.b) - (a.before - a.b)).slice(0, 3);

function hm(secs) { const h = Math.floor(secs / 3600), m = Math.round((secs % 3600) / 60); return h ? `${h} h ${m} min` : `${m} min`; }
const W = {
  en: { title: "Your week in Pitlane HQ",
    line: (s) => `${s.sessions} session${s.sessions === 1 ? "" : "s"}, ${s.laps} lap${s.laps === 1 ? "" : "s"} and ${hm(s.secs)} on track.`,
    races: (s) => `${s.races} race${s.races === 1 ? "" : "s"}, ${s.top5} in the top 5.`,
    pb: (n) => n === 1 ? "1 new personal best." : `${n} new personal bests.` },
  es: { title: "Tu semana en Pitlane HQ",
    line: (s) => `${s.sessions} sesi${s.sessions === 1 ? "ón" : "ones"}, ${s.laps} vuelta${s.laps === 1 ? "" : "s"} y ${hm(s.secs)} en pista.`,
    races: (s) => `${s.races} carrera${s.races === 1 ? "" : "s"}, ${s.top5} en el top 5.`,
    pb: (n) => n === 1 ? "1 nuevo récord personal." : `${n} nuevos récords personales.` },
  pt: { title: "Sua semana no Pitlane HQ",
    line: (s) => `${s.sessions} sess${s.sessions === 1 ? "ão" : "ões"}, ${s.laps} volta${s.laps === 1 ? "" : "s"} e ${hm(s.secs)} na pista.`,
    races: (s) => `${s.races} corrida${s.races === 1 ? "" : "s"}, ${s.top5} no top 5.`,
    pb: (n) => n === 1 ? "1 novo recorde pessoal." : `${n} novos recordes pessoais.` },
};

/** The notification of one week ({title, text}), or null when the driver did not drive. */
export function weekNote(sum, pbs, l) {
  if (!sum || !sum.sessions) return null;
  const w = W[L3(l)], lines = [w.line(sum)];
  if (sum.races) lines.push(w.races(sum));
  if (pbs && pbs.length) lines.push(w.pb(pbs.length));
  return { title: w.title, text: lines.join(" ") };
}

/** Before driver `uid` keeps lap `x` ({game, trackId, carId, track, car, time, anon, shown}): when it beats another
 *  driver's record there, that driver's account hears about it. Never for the model's laps or a driver beating their own. */
export async function recordBeaten(env, uid, x, now = Date.now()) {
  if (x.shown === "model" || String(uid).startsWith("o:")) return null;
  const rec = await env.DB.prepare(SQL_RECORD).bind(x.game, x.trackId, x.carId).first();
  if (!rec || rec.user_id === uid || !(x.time < rec.time)) return null;
  const [was, by] = await Promise.all([env.DB.prepare(SQL_ACCOUNT_OF).bind(rec.user_id).first(), env.DB.prepare(SQL_ACCOUNT_OF).bind(uid).first()]);
  const acc = was && was.acc;
  if (!acc || (by && by.acc === acc)) return null;
  const who = x.anon ? null : await env.DB.prepare(SQL_ALIAS).bind(uid).first();
  const data = { game: x.game, trackId: x.trackId, carId: x.carId, track: String(x.track || "").slice(0, 80), car: String(x.car || "").slice(0, 80),
    time: x.time, was: rec.time, by: (who && who.alias) || "" };
  await env.DB.prepare(SQL_ALERT_ADD).bind(rid(), acc, "record_beaten", now, JSON.stringify(data)).run();
  return { account: acc, ...data };
}

// GET  /community/alerts?since=<ms>  the account's alerts after that time, the newest first (at most 30 days back)
// GET  /community/alerts/on           {on}: notifications on in one of the account's phones
// POST /community/alerts/on           {on, lang} → {on}
export async function handleAlerts(req, env, url, { sessionAccount }, now = Date.now()) {
  const p = url.pathname, m = req.method;
  if (p !== "/community/alerts" && p !== "/community/alerts/on") return null;
  const acc = await sessionAccount(req, env);
  if (!acc) return json({ error: "sign in with your Pitlane HQ account" }, 401);
  if (p === "/community/alerts" && m === "GET") {
    const since = Math.max(now - ALERT_DAYS * 864e5, +url.searchParams.get("since") || 0);
    const r = await env.DB.prepare(SQL_ALERTS).bind(acc.id, since).all();
    return json({ now, alerts: (r.results || []).map((a) => { let d = {}; try { d = JSON.parse(a.data); } catch (e) {} return { ...d, id: a.id, kind: a.kind, created: a.created }; }) });
  }
  if (p === "/community/alerts/on" && m === "GET") return json({ on: !!(await env.DB.prepare(SQL_SUB_GET).bind(acc.id).first()) });
  if (p === "/community/alerts/on" && m === "POST") {
    const b = (await req.json().catch(() => null)) || {};
    if (b.on) await env.DB.prepare(SQL_SUB_ON).bind(acc.id, L3(String(b.lang || "").slice(0, 2))).run();
    else await env.DB.prepare(SQL_SUB_OFF).bind(acc.id).run();
    return json({ on: !!b.on });
  }
  return json({ error: "not found" }, 404);
}

/** Monday's job (the hourly runs from 07:00 UTC): the week's summary of up to PER_RUN accounts with notifications on a
 *  run, those whose last one was written 5 days ago or more. */
export async function weeklyAlerts(env, { sessionSummary }, now = Date.now()) {
  const due = (await env.DB.prepare(SQL_DUE).bind(now - 5 * 864e5).all()).results || [];
  let written = 0;
  for (const d of due) {
    try {
      const up = "acct:" + d.account_id, from = now - WEEK;
      const sum = await sessionSummary(env.DB, { from, tz: 0, game: null, uploader: up, now });
      const note = sum && sum.sessions ? weekNote(sum, pbsOf(((await env.DB.prepare(SQL_PBS).bind(up, from).all()).results) || []), d.lang) : null;
      if (note) { await env.DB.prepare(SQL_ALERT_ADD).bind(rid(), d.account_id, "week", now, JSON.stringify(note)).run(); written++; }
    } catch (e) {}
    await env.DB.prepare(SQL_WEEK_DONE).bind(d.account_id, now).run();
  }
  return { due: due.length, written };
}

export const pruneAlerts = (env, now = Date.now()) => env.DB.prepare(SQL_ALERT_PRUNE).bind(now - ALERT_DAYS * 864e5).run();
