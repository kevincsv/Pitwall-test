// Small pages the server shows itself: email confirmed, forgot password, choose a new password.
// The new password becomes keys in the browser (same as the app); it never reaches the server.
import { lang } from "./email.js";

const S = {
  title: { en: "Pitlane HQ", es: "Pitlane HQ", de: "Pitlane HQ", pt: "Pitlane HQ" },
  verified: { en: "Your email is confirmed. You can close this page.", es: "Tu email está confirmado. Ya puedes cerrar esta página.", de: "Deine E-Mail ist bestätigt. Du kannst diese Seite schließen.", pt: "Seu email está confirmado. Pode fechar esta página." },
  badLink: { en: "This link is not valid any more. Ask for a new one from the app.", es: "Este enlace ya no es válido. Pide uno nuevo desde la app.", de: "Dieser Link ist nicht mehr gültig. Fordere in der App einen neuen an.", pt: "Este link não é mais válido. Peça um novo pelo app." },
  forgotTitle: { en: "Forgot your password?", es: "¿Olvidaste tu contraseña?", de: "Passwort vergessen?", pt: "Esqueceu a senha?" },
  forgotText: {
    en: "Type the email of your Pitlane HQ account and we send you a link to choose a new password.",
    es: "Escribe el email de tu cuenta de Pitlane HQ y te enviamos un enlace para elegir una contraseña nueva.",
    de: "Gib die E-Mail deines PitlaneHQ-Kontos ein und wir senden dir einen Link für ein neues Passwort.",
    pt: "Digite o email da sua conta Pitlane HQ e enviamos um link para escolher uma nova senha.",
  },
  send: { en: "Send me the link", es: "Enviarme el enlace", de: "Link senden", pt: "Enviar o link" },
  sent: {
    en: "If there is an account with that email, the link is on its way. Check your inbox (and spam).",
    es: "Si hay una cuenta con ese email, el enlace va de camino. Mira tu bandeja de entrada (y el spam).",
    de: "Wenn es ein Konto mit dieser E-Mail gibt, ist der Link unterwegs. Sieh in deinem Posteingang (und Spam) nach.",
    pt: "Se houver uma conta com esse email, o link está a caminho. Veja sua caixa de entrada (e o spam).",
  },
  resetTitle: { en: "Choose a new password", es: "Elige una contraseña nueva", de: "Neues Passwort wählen", pt: "Escolha uma nova senha" },
  resetText: {
    en: "Your synced data is encrypted with your old password, so the copy on the server is replaced: when you sign in on your PC with the new password, the PC uploads your data again. Your laps, name and setups stay.",
    es: "Tus datos sincronizados están cifrados con tu contraseña antigua, así que la copia del servidor se reemplaza: al entrar en tu PC con la contraseña nueva, el PC vuelve a subir tus datos. Tus vueltas, nombre y setups se quedan.",
    de: "Deine synchronisierten Daten sind mit dem alten Passwort verschlüsselt, daher wird die Kopie auf dem Server ersetzt: Wenn du dich am PC mit dem neuen Passwort anmeldest, lädt der PC deine Daten erneut hoch. Runden, Name und Setups bleiben.",
    pt: "Seus dados sincronizados são criptografados com a senha antiga, então a cópia no servidor é substituída: ao entrar no PC com a nova senha, o PC envia seus dados de novo. Suas voltas, nome e setups ficam.",
  },
  email: { en: "Email", es: "Email", de: "E-Mail", pt: "Email" },
  pass: { en: "New password (at least 10 characters)", es: "Contraseña nueva (mínimo 10 caracteres)", de: "Neues Passwort (mindestens 10 Zeichen)", pt: "Nova senha (mínimo 10 caracteres)" },
  pass2: { en: "Repeat the password", es: "Repite la contraseña", de: "Passwort wiederholen", pt: "Repita a senha" },
  save: { en: "Save the new password", es: "Guardar la contraseña nueva", de: "Neues Passwort speichern", pt: "Salvar a nova senha" },
  done: { en: "Done. Sign in with your new password in the app.", es: "Listo. Entra con tu contraseña nueva en la app.", de: "Fertig. Melde dich in der App mit dem neuen Passwort an.", pt: "Pronto. Entre com a nova senha no app." },
  mismatch: { en: "The passwords do not match.", es: "Las contraseñas no coinciden.", de: "Die Passwörter stimmen nicht überein.", pt: "As senhas não coincidem." },
  short: { en: "The password needs at least 10 characters.", es: "La contraseña necesita al menos 10 caracteres.", de: "Das Passwort braucht mindestens 10 Zeichen.", pt: "A senha precisa de pelo menos 10 caracteres." },
  working: { en: "Working…", es: "Un momento…", de: "Einen Moment…", pt: "Um momento…" },
  back: { en: "Back to Pitlane HQ", es: "Volver a Pitlane HQ", de: "Zurück zu Pitlane HQ", pt: "Voltar ao Pitlane HQ" },
  noMail: { en: "Emails are not set up on this server yet.", es: "Los emails aún no están configurados en este servidor.", de: "E-Mails sind auf diesem Server noch nicht eingerichtet.", pt: "Os emails ainda não estão configurados neste servidor." },
};
const esc = (s) => String(s).replace(/[&<>"]/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" })[c]);

export function pageLang(req, url) {
  const q = url.searchParams.get("lang");
  if (q) return lang(q);
  const a = (req.headers.get("accept-language") || "").slice(0, 2).toLowerCase();
  return lang(a);
}

function page(l, body, script = "") {
  return new Response(
    `<!doctype html><html lang="${l}"><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>Pitlane HQ - Telemetry &amp; Coach</title>
<style>body{margin:0;min-height:100vh;display:grid;place-items:center;background:#11151b;color:#e7ebf1;font:16px/1.5 system-ui,sans-serif}main{width:min(420px,calc(100% - 32px))}
h1{font-size:22px;letter-spacing:.05em;text-transform:uppercase}p{color:#a9b4c3}label{display:block;margin:12px 0 4px;font-size:13px;color:#8a97a9;text-transform:uppercase;letter-spacing:.06em}
input{width:100%;box-sizing:border-box;font:16px system-ui;padding:12px;border-radius:8px;border:1px solid #2b3542;background:#19202a;color:#e7ebf1}
button{margin-top:16px;width:100%;padding:13px;border:0;border-radius:8px;background:#ffb02e;color:#11151b;font:700 15px system-ui;text-transform:uppercase;letter-spacing:.05em;cursor:pointer}
.err{color:#ff6363;min-height:1.4em}.ok{color:#38c97c}.back{display:inline-block;margin-top:22px;color:#8a97a9;font-size:14px;text-decoration:none}.back:hover{color:#e7ebf1}</style><main>${body}<a class="back" href="/">← ${esc(S.back[l])}</a></main>${script ? `<script>${script}</script>` : ""}</html>`,
    {
      headers: {
        "content-type": "text/html; charset=utf-8",
        "cache-control": "no-store",
        "content-security-policy": "default-src 'none'; script-src 'unsafe-inline'; style-src 'unsafe-inline'; connect-src 'self'; form-action 'none'; frame-ancestors 'none'",
        "referrer-policy": "no-referrer",
      },
    }
  );
}

export const messagePage = (l, ok) => page(l, `<h1>${S.title[l]}</h1><p class="${ok ? "ok" : "err"}">${esc(ok ? S.verified[l] : S.badLink[l])}</p>`);
export const badLinkPage = (l) => page(l, `<h1>${S.title[l]}</h1><p class="err">${esc(S.badLink[l])}</p>`);

export function forgotPage(l, ready) {
  if (!ready) return page(l, `<h1>${esc(S.forgotTitle[l])}</h1><p class="err">${esc(S.noMail[l])}</p>`);
  return page(
    l,
    `<h1>${esc(S.forgotTitle[l])}</h1><p>${esc(S.forgotText[l])}</p><form id="f"><label for="e">${esc(S.email[l])}</label><input id="e" type="email" autocomplete="username" required><div class="err" id="m"></div><button>${esc(S.send[l])}</button></form>`,
    `document.getElementById("f").onsubmit=async e=>{e.preventDefault();const m=document.getElementById("m");m.className="";m.textContent=${JSON.stringify(S.working[l])};
try{const r=await fetch("/account/forgot",{method:"POST",headers:{"content-type":"application/json"},body:JSON.stringify({email:document.getElementById("e").value.trim().toLowerCase(),lang:${JSON.stringify(l)}})});const j=await r.json().catch(()=>({}));
if(!r.ok)throw new Error(j.error||("HTTP "+r.status));m.className="ok";m.textContent=${JSON.stringify(S.sent[l])}}catch(x){m.className="err";m.textContent=x.message}}`
  );
}

export function resetPage(l, token) {
  return page(
    l,
    `<h1>${esc(S.resetTitle[l])}</h1><p>${esc(S.resetText[l])}</p><form id="f"><label for="e">${esc(S.email[l])}</label><input id="e" type="email" autocomplete="username" required>
<label for="p">${esc(S.pass[l])}</label><input id="p" type="password" autocomplete="new-password" minlength="10" required><label for="p2">${esc(S.pass2[l])}</label><input id="p2" type="password" autocomplete="new-password" minlength="10" required>
<div class="err" id="m"></div><button>${esc(S.save[l])}</button></form>`,
    `const T=${JSON.stringify(token)},te=new TextEncoder(),hex=b=>[...new Uint8Array(b)].map(x=>x.toString(16).padStart(2,"0")).join("");
async function keys(email,pw){const salt=await crypto.subtle.digest("SHA-256",te.encode("pitlanehq-account-v1:"+email));const k=await crypto.subtle.importKey("raw",te.encode(pw),"PBKDF2",false,["deriveBits"]);
 const master=await crypto.subtle.deriveBits({name:"PBKDF2",hash:"SHA-256",salt,iterations:600000},k,256);const hk=await crypto.subtle.importKey("raw",master,"HKDF",false,["deriveBits"]);
 const d=info=>crypto.subtle.deriveBits({name:"HKDF",hash:"SHA-256",salt:new Uint8Array(0),info:te.encode(info)},hk,256);return{auth:hex(await d("pitlanehq auth")),wrap:await d("pitlanehq wrap")}}
async function seal(wrap,plain){const iv=crypto.getRandomValues(new Uint8Array(12));const key=await crypto.subtle.importKey("raw",wrap,"AES-GCM",false,["encrypt"]);
 const c=new Uint8Array(await crypto.subtle.encrypt({name:"AES-GCM",iv,additionalData:te.encode("pitlanehq-v1")},key,plain));const o=new Uint8Array(12+c.length);o.set(iv);o.set(c,12);let b="";o.forEach(x=>b+=String.fromCharCode(x));return btoa(b)}
document.getElementById("f").onsubmit=async e=>{e.preventDefault();const m=document.getElementById("m"),pw=document.getElementById("p").value;m.className="err";
 if(pw.length<10){m.textContent=${JSON.stringify(S.short[l])};return}if(pw!==document.getElementById("p2").value){m.textContent=${JSON.stringify(S.mismatch[l])};return}
 m.className="";m.textContent=${JSON.stringify(S.working[l])};
 try{const email=document.getElementById("e").value.trim().toLowerCase(),k=await keys(email,pw),wrappedKey=await seal(k.wrap,crypto.getRandomValues(new Uint8Array(32)));
  const r=await fetch("/account/reset",{method:"POST",headers:{"content-type":"application/json"},body:JSON.stringify({token:T,email,auth:k.auth,wrappedKey})});const j=await r.json().catch(()=>({}));
  if(!r.ok)throw new Error(j.error||("HTTP "+r.status));m.className="ok";m.textContent=${JSON.stringify(S.done[l])};document.querySelector("button").disabled=true}catch(x){m.className="err";m.textContent=x.message}}`
  );
}
