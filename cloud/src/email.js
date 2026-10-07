// Emails (verify the address, reset the password) through Resend (resend.com).
// Needs the secret RESEND_API_KEY and the variable EMAIL_FROM, e.g.
// "Pitlane HQ <no-reply@your-domain.com>" with that domain verified in Resend.
export const mailReady = (env) => !!(env.RESEND_API_KEY && env.EMAIL_FROM);
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

async function send(env, to, subject, text, link, button, l) {
  if (!mailReady(env)) return false;
  const html = `<div style="font:15px/1.5 system-ui,sans-serif;color:#141a22;max-width:520px">
<p style="font:700 20px system-ui;letter-spacing:.04em;text-transform:uppercase">Pitlane HQ</p>
<p>${esc(text)}</p><p><a href="${esc(link)}" style="display:inline-block;background:#ffb02e;color:#11151b;padding:12px 18px;border-radius:8px;text-decoration:none;font-weight:700">${esc(button)}</a></p>
<p style="color:#5b677a;font-size:13px">${esc(link)}</p>
<p style="color:#5b677a;font-size:12px;margin-top:24px">${esc(lang(l) === "es" ? "¿Dudas? Escríbenos a" : lang(l) === "de" ? "Fragen? Schreib uns an" : lang(l) === "pt" ? "Dúvidas? Escreva para" : "Questions? Write to")} <a href="mailto:${SUPPORT}" style="color:#5b677a">${SUPPORT}</a></p></div>`;
  const r = await fetch("https://api.resend.com/emails", {
    method: "POST",
    headers: { authorization: "Bearer " + env.RESEND_API_KEY, "content-type": "application/json" },
    body: JSON.stringify({ from: env.EMAIL_FROM, reply_to: env.EMAIL_REPLY_TO || SUPPORT, to: [to], subject, text: text + "\n\n" + link + "\n\n" + SUPPORT, html }),
  });
  if (!r.ok) {
    // Resend said no (domain not verified, sender not allowed, bad key…): keep the reason for the admins' test
    lastError = { at: Date.now(), status: r.status, body: (await r.text().catch(() => "")).slice(0, 500), from: env.EMAIL_FROM };
    console.error("email not sent", lastError);
  } else lastError = null;
  return r.ok;
}
let lastError = null;
export const mailLastError = () => lastError;
/** For the admins: sends a test email and answers with Resend's status and reason. */
export async function sendTest(env, to, l) {
  const ok = await send(env, to, "Pitlane HQ: " + (lang(l) === "es" ? "email de prueba" : "test email"), lang(l) === "es" ? "Si lees esto, los emails del servidor funcionan." : "If you read this, the server's emails work.", "https://pitlanehq.app/", "Pitlane HQ", l);
  return { ok, from: env.EMAIL_FROM, replyTo: env.EMAIL_REPLY_TO || SUPPORT, error: ok ? null : lastError };
}

export const sendVerify = (env, to, link, l) => send(env, to, T.verifySubject[lang(l)], T.verifyText[lang(l)], link, T.verifyButton[lang(l)], l);
export const sendReset = (env, to, link, l) => send(env, to, T.resetSubject[lang(l)], T.resetText[lang(l)], link, T.resetButton[lang(l)], l);
