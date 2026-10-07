// Emails (verify the address, reset the password) through Resend (resend.com).
// Needs the secret RESEND_API_KEY and the variable EMAIL_FROM, e.g.
// "TrackIQ <no-reply@your-domain.com>" with that domain verified in Resend.
export const mailReady = (env) => !!(env.RESEND_API_KEY && env.EMAIL_FROM);

const T = {
  verifySubject: { en: "Confirm your TrackIQ email", es: "Confirma tu email de TrackIQ", de: "Bestätige deine Pitlane-HQ-E-Mail", pt: "Confirme seu email do TrackIQ" },
  verifyText: {
    en: "Welcome to TrackIQ! Confirm this is your email by opening the link below (it works for 7 days):",
    es: "¡Bienvenido a TrackIQ! Confirma que este es tu email abriendo el enlace de abajo (vale 7 días):",
    de: "Willkommen bei TrackIQ! Bestätige deine E-Mail-Adresse mit dem Link unten (7 Tage gültig):",
    pt: "Bem-vindo ao TrackIQ! Confirme que este é o seu email abrindo o link abaixo (vale 7 dias):",
  },
  verifyButton: { en: "Confirm my email", es: "Confirmar mi email", de: "E-Mail bestätigen", pt: "Confirmar meu email" },
  resetSubject: { en: "Reset your TrackIQ password", es: "Restablece tu contraseña de TrackIQ", de: "Pitlane-HQ-Passwort zurücksetzen", pt: "Redefina sua senha do TrackIQ" },
  resetText: {
    en: "Someone (hopefully you) asked to reset the password of your TrackIQ account. Open the link below within 1 hour to choose a new one. If it was not you, ignore this email: nothing changes.",
    es: "Alguien (esperamos que tú) ha pedido restablecer la contraseña de tu cuenta de TrackIQ. Abre el enlace de abajo antes de 1 hora para elegir una nueva. Si no fuiste tú, ignora este email: no cambia nada.",
    de: "Jemand (hoffentlich du) möchte das Passwort deines Pitlane-HQ-Kontos zurücksetzen. Öffne den Link unten innerhalb von 1 Stunde, um ein neues zu wählen. Warst du es nicht, ignoriere diese E-Mail: Es ändert sich nichts.",
    pt: "Alguém (esperamos que você) pediu para redefinir a senha da sua conta TrackIQ. Abra o link abaixo em até 1 hora para escolher uma nova. Se não foi você, ignore este email: nada muda.",
  },
  resetButton: { en: "Choose a new password", es: "Elegir una contraseña nueva", de: "Neues Passwort wählen", pt: "Escolher uma nova senha" },
};
export const lang = (l) => (["en", "es", "de", "pt"].includes(l) ? l : "en");
const esc = (s) => String(s).replace(/[&<>"]/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" })[c]);

async function send(env, to, subject, text, link, button) {
  if (!mailReady(env)) return false;
  const html = `<div style="font:15px/1.5 system-ui,sans-serif;color:#141a22;max-width:520px">
<p style="font:700 20px system-ui;letter-spacing:.04em;text-transform:uppercase">TrackIQ</p>
<p>${esc(text)}</p><p><a href="${esc(link)}" style="display:inline-block;background:#ffb02e;color:#11151b;padding:12px 18px;border-radius:8px;text-decoration:none;font-weight:700">${esc(button)}</a></p>
<p style="color:#5b677a;font-size:13px">${esc(link)}</p></div>`;
  const r = await fetch("https://api.resend.com/emails", {
    method: "POST",
    headers: { authorization: "Bearer " + env.RESEND_API_KEY, "content-type": "application/json" },
    body: JSON.stringify({ from: env.EMAIL_FROM, to: [to], subject, text: text + "\n\n" + link, html }),
  });
  return r.ok;
}

export const sendVerify = (env, to, link, l) => send(env, to, T.verifySubject[lang(l)], T.verifyText[lang(l)], link, T.verifyButton[lang(l)]);
export const sendReset = (env, to, link, l) => send(env, to, T.resetSubject[lang(l)], T.resetText[lang(l)], link, T.resetButton[lang(l)]);
