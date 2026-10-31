// node cloud/test/legal.test.mjs: the privacy policy and the account-deletion page (legal.js), the two addresses app
// stores ask for: in English, Spanish and Portuguese, and never a word about how the data is stored or protected
import assert from "node:assert/strict";
import { legal, legalLang, privacyPage, deletePage } from "../src/legal.js";

const get = (path, al = "") => { const req = new Request("https://pitlanehq.app" + path, { headers: { "accept-language": al } }); return legal(req, new URL(req.url)); };
assert.equal(get("/downloads"), null);
for (const p of ["/privacy", "/privacy/", "/delete-account"]) assert.equal(get(p).status, 200, p);
assert.equal(legalLang(new Request("https://x/"), new URL("https://x/?lang=pt")), "pt");
assert.equal(legalLang(new Request("https://x/", { headers: { "accept-language": "de-DE,es;q=0.8" } }), new URL("https://x/")), "es");
assert.equal(legalLang(new Request("https://x/", { headers: { "accept-language": "de-DE" } }), new URL("https://x/")), "en", "no German");
assert.match(await get("/privacy", "es-ES").text(), /Política de privacidad/);
for (const l of ["en", "es", "pt"]) {
  for (const html of [privacyPage(l), deletePage(l)]) {
    const text = html.replace(/<style>[\s\S]*?<\/style>/, "").replace(/<[^>]+>/g, " ");
    assert.ok(!/encrypt|cifra|criptograf|sealed|sellad|password goes|contraseña va/i.test(text), "no text about how data is protected (" + l + ")");
    assert.ok(!/[;]/.test(text.replace(/&[a-z]+;/g, "")), "no ; (" + l + ")");
  }
  assert.match(deletePage(l), /support@pitlanehq\.app/);
}
console.log("legal ok");
