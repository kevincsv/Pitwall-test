// /go#u=http://192.168.x.y:8484/pair?pin=…  — the QR code on the PC points here, because
// phone cameras only open https links. This page opens the Pitlane HQ app (or the PC in the
// browser without it). The PC's address and the PIN stay after "#", so they never reach
// this server: everything below runs in the phone's browser.
const PAGE = `<!doctype html><html lang="en"><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1">
<title>Pitlane HQ</title><meta name="robots" content="noindex">
<style>:root{color-scheme:dark}body{margin:0;min-height:100vh;display:grid;place-items:center;background:#11151b;color:#e7ebf1;font:16px/1.45 system-ui,-apple-system,Segoe UI,Roboto,sans-serif}
main{width:min(420px,100% - 32px);text-align:center}h1{font-size:22px;letter-spacing:.04em;margin:0 0 6px}p{color:#9aa6b4;margin:0 0 18px}
a.b{display:block;padding:14px 16px;border-radius:12px;margin:10px 0;text-decoration:none;font-weight:700;border:1px solid #2a323d;color:#e7ebf1;background:#1a2029}
a.b.p{background:#ffb02e;border-color:#ffb02e;color:#11151b}.err{color:#ff6b6b}small{color:#6b7684}</style>
<main><h1>PITLANE HQ</h1><p id="t"></p><div id="b"></div><small id="s"></small></main>
<script>
const es=/^es/i.test(navigator.language||""),T=(en,sp)=>es?sp:en;
const raw=new URLSearchParams(location.hash.slice(1)).get("u")||"";history.replaceState(null,"",location.pathname);
let ok=false;try{const u=new URL(raw),p=u.hostname.split(".").map(Number);ok=u.protocol==="http:"&&p.length===4&&p.every(n=>n>=0&&n<256)&&(p[0]===10||(p[0]===192&&p[1]===168)||(p[0]===172&&p[1]>=16&&p[1]<=31))}catch(e){}
const t=document.getElementById("t"),b=document.getElementById("b"),s=document.getElementById("s");
if(!ok){t.className="err";t.textContent=T("This code is not valid. Scan the code shown in Pitlane HQ on your PC again.","Este código no es válido. Vuelve a escanear el código que muestra Pitlane HQ en tu PC.")}
else{
  const app="pitlanehq://open?url="+encodeURIComponent(raw),android=/android/i.test(navigator.userAgent),ios=/iphone|ipad|ipod/i.test(navigator.userAgent)||(navigator.platform==="MacIntel"&&navigator.maxTouchPoints>1);
  const open=android?"intent://open?url="+encodeURIComponent(raw)+"#Intent;scheme=pitlanehq;package=com.pitlanehq.app;S.browser_fallback_url="+encodeURIComponent(raw)+";end":app;
  t.textContent=T("Connect this phone to Pitlane HQ on your PC. The phone and the PC must be on the same Wi-Fi.","Conecta este móvil con Pitlane HQ en tu PC. El móvil y el PC deben estar en la misma red Wi-Fi.");
  const a=(href,txt,p)=>{const x=document.createElement("a");x.className="b"+(p?" p":"");x.href=href;x.textContent=txt;b.appendChild(x);return x};
  a(open,T("Open in the Pitlane HQ app","Abrir en la app Pitlane HQ"),true);
  a(raw,T("Open in this browser","Abrir en este navegador"));
  a("/#downloads",T("Get the app","Descargar la app"));
  s.textContent=T("Your PC's address and code stay on this phone.","La dirección de tu PC y el código se quedan en este móvil.");
  if(android)location.href=open;
}
</script></html>`;

export function goPage() {
  return new Response(PAGE, {
    headers: {
      "content-type": "text/html; charset=utf-8",
      "cache-control": "no-store",
      "referrer-policy": "no-referrer",
      "x-content-type-options": "nosniff",
      "content-security-policy": "default-src 'none'; script-src 'unsafe-inline'; style-src 'unsafe-inline'; frame-ancestors 'none'; base-uri 'none'",
    },
  });
}
