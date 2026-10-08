// Emails (verify the address, reset the password), two ways:
//  - your own mailbox over SMTP (Proton Mail's SMTP submission): secret SMTP_TOKEN + EMAIL_FROM (smtp.js)
//  - or Resend (resend.com): secret RESEND_API_KEY + EMAIL_FROM, with the domain verified there
// EMAIL_FROM looks like "Pitlane HQ <support@pitlanehq.app>".
import { smtpReady, smtpSend } from "./smtp.js";
export const mailReady = (env) => !!env.EMAIL_FROM && (smtpReady(env) || !!env.RESEND_API_KEY);
// where people write to us; the answers to our emails land there too (Reply-To)
export const SUPPORT = "support@pitlanehq.app";

const T = {
  verifySubject: { en: "Confirm your Pitlane HQ email", es: "Confirma tu email de Pitlane HQ", de: "Bestätige deine PitlaneHQ-E-Mail", pt: "Confirme seu email do Pitlane HQ" },
  verifyText: {
    en: "Welcome to Pitlane HQ! Confirm this is your email by opening the link below (it works for 7 days):",
    es: "¡Bienvenido a Pitlane HQ! Confirma que este es tu email abriendo el enlace de abajo (vale 7 días):",
    de: "Willkommen bei Pitlane HQ! Bestätige deine E-Mail-Adresse mit dem Link unten (7 Tage gültig):",
    pt: "Bem-vindo ao Pitlane HQ! Confirme que este é o seu email abrindo o link abaixo (vale 7 dias):",
  },
  verifyButton: { en: "Confirm my email", es: "Confirmar mi email", de: "E-Mail bestätigen", pt: "Confirmar meu email" },
  resetSubject: { en: "Reset your Pitlane HQ password", es: "Restablece tu contraseña de Pitlane HQ", de: "PitlaneHQ-Passwort zurücksetzen", pt: "Redefina sua senha do Pitlane HQ" },
  resetText: {
    en: "Someone (hopefully you) asked to reset the password of your Pitlane HQ account. Open the link below within 1 hour to choose a new one. If it was not you, ignore this email: nothing changes.",
    es: "Alguien (esperamos que tú) ha pedido restablecer la contraseña de tu cuenta de Pitlane HQ. Abre el enlace de abajo antes de 1 hora para elegir una nueva. Si no fuiste tú, ignora este email: no cambia nada.",
    de: "Jemand (hoffentlich du) möchte das Passwort deines PitlaneHQ-Kontos zurücksetzen. Öffne den Link unten innerhalb von 1 Stunde, um ein neues zu wählen. Warst du es nicht, ignoriere diese E-Mail: Es ändert sich nichts.",
    pt: "Alguém (esperamos que você) pediu para redefinir a senha da sua conta Pitlane HQ. Abra o link abaixo em até 1 hora para escolher uma nova. Se não foi você, ignore este email: nada muda.",
  },
  resetButton: { en: "Choose a new password", es: "Elegir una contraseña nueva", de: "Neues Passwort wählen", pt: "Escolher uma nova senha" },
};
export const lang = (l) => (["en", "es", "de", "pt"].includes(l) ? l : "en");
const esc = (s) => String(s).replace(/[&<>"]/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" })[c]);

// the last result is kept in the database too, so the admin profile shows why emails do not go out
async function note(env, ok) {
  await env.DB.prepare("INSERT INTO app_state (k, v, at) VALUES (?1,?2,?3) ON CONFLICT(k) DO UPDATE SET v=excluded.v, at=excluded.at")
    .bind(ok ? "mail_ok" : "mail_error", ok ? "" : JSON.stringify(lastError), Date.now()).run().catch(() => {});
}
// the last emails that went out (to whom, masked; Resend's id), so the admins can ask Resend whether they
// arrived: "sent" by the server does not mean "in the inbox"
const mask = (e) => { const [u, d] = String(e).split("@"); return (u || "").slice(0, 2) + "•••@" + (d || ""); };
async function logSent(env, to, subject, via, id) {
  const row = await env.DB.prepare("SELECT v FROM app_state WHERE k='mail_log'").first().catch(() => null);
  let l = [];
  try { l = JSON.parse((row && row.v) || "[]"); } catch (e) {}
  l.unshift({ at: Date.now(), to: mask(to), subject, via, id: id || "" });
  await env.DB.prepare("INSERT INTO app_state (k, v, at) VALUES ('mail_log',?1,?2) ON CONFLICT(k) DO UPDATE SET v=excluded.v, at=excluded.at")
    .bind(JSON.stringify(l.slice(0, 10)), Date.now()).run().catch(() => {});
}
// ---------- the sender's domain: are its mail records right? ----------
// Proton (and any mailbox) only reaches inboxes when the domain says it may send: one SPF record that
// includes the sender, the DKIM keys, a DMARC policy. Read here from Cloudflare's DNS, for the admins.
async function dns(name, type) {
  try {
    const r = await fetch(`https://cloudflare-dns.com/dns-query?name=${encodeURIComponent(name)}&type=${type}`, { headers: { accept: "application/dns-json" } });
    const j = await r.json();
    return (j.Answer || []).map((a) => String(a.data || "").replace(/^"|"$/g, "").replace(/" "/g, ""));
  } catch (e) { return null; }
}
export async function mailDomain(env) {
  const from = (/<([^>]+)>/.exec(env.EMAIL_FROM || "") || [null, env.EMAIL_FROM || ""])[1].trim(), dom = from.split("@")[1] || "";
  if (!dom) return { domain: "", checks: [] };
  const proton = smtpReady(env) && !env.SMTP_HOST;
  const [txt, mx, dmarc, k1, k2, k3] = await Promise.all([dns(dom, "TXT"), dns(dom, "MX"), dns("_dmarc." + dom, "TXT"),
    dns("protonmail._domainkey." + dom, "CNAME"), dns("protonmail2._domainkey." + dom, "CNAME"), dns("protonmail3._domainkey." + dom, "CNAME")]);
  const spf = (txt || []).filter((x) => /^v=spf1/i.test(x)), checks = [];
  checks.push({ k: "spf", ok: spf.length === 1 && (!proton || /_spf\.protonmail\.ch/.test(spf[0])), got: spf.join(" | ") || "—",
    want: spf.length > 1 ? "one SPF record only (there are " + spf.length + ": join them)" : proton ? "v=spf1 include:_spf.protonmail.ch ~all" : "an SPF record that includes your sender" });
  if (proton) {
    checks.push({ k: "verify", ok: (txt || []).some((x) => /^protonmail-verification=/.test(x)), got: (txt || []).find((x) => /protonmail-verification/.test(x)) || "—", want: "the protonmail-verification=… record from Proton → Domain names" });
    const keys = [k1, k2, k3].map((x) => (x && x[0]) || "");
    checks.push({ k: "dkim", ok: keys.every((x) => /protonmail/.test(x)), got: keys.map((x, i) => `protonmail${i ? i + 1 : ""}: ${x || "—"}`).join(" | "), want: "the three CNAME records protonmail._domainkey, protonmail2._domainkey, protonmail3._domainkey from Proton" });
    checks.push({ k: "mx", ok: (mx || []).some((x) => /protonmail\.ch/.test(x)) && !(mx || []).some((x) => /mx\.cloudflare\.net/.test(x)), got: (mx || []).join(" | ") || "—",
      want: (mx || []).some((x) => /mx\.cloudflare\.net/.test(x)) ? "Proton's MX (mail.protonmail.ch, mailsec.protonmail.ch) instead of Cloudflare Email Routing" : "10 mail.protonmail.ch and 20 mailsec.protonmail.ch" });
  }
  checks.push({ k: "dmarc", ok: (dmarc || []).some((x) => /^v=DMARC1/i.test(x)), got: (dmarc || []).join(" | ") || "—", want: "_dmarc: v=DMARC1; p=quarantine" });
  return { domain: dom, via: proton ? "proton" : smtpReady(env) ? "smtp" : "resend", checks, dnsOk: txt !== null };
}
/** For the admins: the last emails and, for Resend's, what happened to them (delivered, bounced, complained…). */
export async function mailLog(env) {
  const row = await env.DB.prepare("SELECT v FROM app_state WHERE k='mail_log'").first().catch(() => null);
  let l = [];
  try { l = JSON.parse((row && row.v) || "[]"); } catch (e) {}
  for (const x of l.slice(0, 6)) {
    if (x.via !== "resend" || !x.id || !env.RESEND_API_KEY) continue;
    try {
      const r = await fetch("https://api.resend.com/emails/" + encodeURIComponent(x.id), { headers: { authorization: "Bearer " + env.RESEND_API_KEY } });
      const j = await r.json().catch(() => ({}));
      x.state = r.ok ? j.last_event || "sent" : "unknown (" + r.status + ")";
    } catch (e) { x.state = "unknown"; }
  }
  return l;
}
async function send(env, to, subject, text, link, button, l) {
  if (!mailReady(env)) { lastError = { at: Date.now(), message: "emails are not set up: EMAIL_FROM and SMTP_TOKEN (or RESEND_API_KEY) are missing" }; await note(env, false); return false; }
  try { return await send1(env, to, subject, text, link, button, l); }
  catch (e) { lastError = { at: Date.now(), message: String((e && e.message) || e) }; await note(env, false); return false; }
}
async function send1(env, to, subject, text, link, button, l) {
  const html = `<div style="font:15px/1.5 system-ui,sans-serif;color:#141a22;max-width:520px">
<p style="font:700 20px system-ui;letter-spacing:.04em;text-transform:uppercase">Pitlane HQ</p>
<p>${esc(text)}</p><p><a href="${esc(link)}" style="display:inline-block;background:#ffb02e;color:#11151b;padding:12px 18px;border-radius:8px;text-decoration:none;font-weight:700">${esc(button)}</a></p>
<p style="color:#5b677a;font-size:13px">${esc(link)}</p>
<p style="color:#5b677a;font-size:12px;margin-top:24px">${esc(lang(l) === "es" ? "¿Dudas? Escríbenos a" : lang(l) === "de" ? "Fragen? Schreib uns an" : lang(l) === "pt" ? "Dúvidas? Escreva para" : "Questions? Write to")} <a href="mailto:${SUPPORT}" style="color:#5b677a">${SUPPORT}</a></p></div>`;
  const plain = text + "\n\n" + link + "\n\n" + SUPPORT, replyTo = env.EMAIL_REPLY_TO || SUPPORT;
  if (smtpReady(env)) {
    const r = await smtpSend(env, { to, subject, text: plain, html, replyTo });
    if (!r.ok) {
      lastError = { at: Date.now(), via: "smtp", ...r.error, from: env.EMAIL_FROM };
      console.error("email not sent", lastError);
    } else { lastError = null; await logSent(env, to, subject, "smtp", ""); }
    await note(env, r.ok);
    return r.ok;
  }
  const r = await fetch("https://api.resend.com/emails", {
    method: "POST",
    headers: { authorization: "Bearer " + env.RESEND_API_KEY, "content-type": "application/json" },
    body: JSON.stringify({ from: env.EMAIL_FROM, reply_to: replyTo, to: [to], subject, text: plain, html }),
  });
  if (!r.ok) {
    // Resend said no (domain not verified, sender not allowed, bad key…): keep the reason for the admins' test
    lastError = { at: Date.now(), via: "resend", status: r.status, body: (await r.text().catch(() => "")).slice(0, 500), from: env.EMAIL_FROM };
    console.error("email not sent", lastError);
  } else { lastError = null; const j = await r.json().catch(() => ({})); await logSent(env, to, subject, "resend", j.id); }
  await note(env, r.ok);
  return r.ok;
}
let lastError = null;
export const mailLastError = () => lastError;
/** For the admins: sends a test email and answers with Resend's status and reason. */
export async function sendTest(env, to, l) {
  const ok = await send(env, to, "Pitlane HQ: " + (lang(l) === "es" ? "email de prueba" : "test email"), lang(l) === "es" ? "Si lees esto, los emails del servidor funcionan." : "If you read this, the server's emails work.", "https://pitlanehq.app/", "Pitlane HQ", l);
  return { ok, via: smtpReady(env) ? "smtp" : "resend", from: env.EMAIL_FROM, replyTo: env.EMAIL_REPLY_TO || SUPPORT, error: ok ? null : lastError };
}

export const sendVerify = (env, to, link, l) => send(env, to, T.verifySubject[lang(l)], T.verifyText[lang(l)], link, T.verifyButton[lang(l)], l);
export const sendReset = (env, to, link, l) => send(env, to, T.resetSubject[lang(l)], T.resetText[lang(l)], link, T.resetButton[lang(l)], l);
