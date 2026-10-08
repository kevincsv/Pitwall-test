/* PitWall UI v1: states, connection center, diagnostics, command dashboard and overlay presets. */
(function(){
"use strict";
if(window.__PW_UI_V1)return;window.__PW_UI_V1=true;
var $=function(s){return document.querySelector(s)}, escx=function(v){try{return esc(String(v==null?"":v))}catch(e){return String(v==null?"":v)}};
var tr=function(a,b){return typeof Tx==="function"?Tx(a,b,a,b):a}, safe=escx;
var fmt=function(v,d){return v==null||!isFinite(+v)?"—":(+v).toFixed(d==null?2:d)};
var sec=function(v){if(v==null||!isFinite(+v)||v<0)return"—";v=+v;return Math.floor(v/60)+":"+String((v%60).toFixed(3)).padStart(6,"0")};
var spd=function(v){if(v==null||!isFinite(+v))return"—";var n=+v*(UNITS==="imperial"?2.236936:3.6);return n.toFixed(n>=100?0:1)+" "+(UNITS==="imperial"?"mph":"km/h")};
var ST={telemetry:"OFFLINE",pc:"OFFLINE",cloud:"IDLE",overall:"OFFLINE",last:0,obj:null,times:[],info:null};
var cls={LIVE:"good",WAITING:"warn",STALE:"warn",OFFLINE:"bad",DEMO:"acc",CONNECTED:"good",COMPANION:"blue",IDLE:"muted"};
function badge(k){return '<span class="pw-state '+(cls[k]||"muted")+'"><i></i>'+escx(k)+"</span>"}
function installCss(){
 if($("#pwUiStyle"))return;
 var s=document.createElement("style");s.id="pwUiStyle";
 s.textContent='.pw-state{display:inline-flex;align-items:center;gap:6px;border:1px solid var(--line);border-radius:999px;padding:4px 8px;font:700 10px var(--f-data);letter-spacing:.08em;color:var(--muted);white-space:nowrap}.pw-state i{width:6px;height:6px;border-radius:50%;background:currentColor}.pw-state.good{color:var(--good);border-color:var(--good)}.pw-state.warn{color:var(--warn);border-color:var(--warn)}.pw-state.bad{color:var(--bad);border-color:var(--bad)}.pw-state.acc{color:var(--accent);border-color:var(--accent)}.pw-state.blue{color:var(--blue);border-color:var(--blue)}'+
'.pw-cmd{display:grid;grid-template-columns:1.35fr .65fr;gap:10px;margin:0 0 10px}.pw-cmd-main,.pw-sidecard{background:var(--surface);border:1px solid var(--line);border-radius:10px;padding:13px;min-width:0}.pw-cmd-main{border-color:color-mix(in srgb,var(--accent) 35%,var(--line))}.pw-cmd-head{display:flex;justify-content:space-between;gap:10px}.pw-cmd-track{font:700 27px/1 var(--f-display);text-transform:uppercase;white-space:nowrap;overflow:hidden;text-overflow:ellipsis}.pw-cmd-sub{color:var(--muted);font-size:12px;margin-top:4px}.pw-cmd-kpis{display:grid;grid-template-columns:repeat(4,minmax(0,1fr));gap:8px;margin-top:14px}.pw-kpi{background:var(--surface2);border:1px solid var(--line);border-radius:7px;padding:8px;min-width:0}.pw-kpi .k{font:600 9px var(--f-data);letter-spacing:.08em;text-transform:uppercase;color:var(--muted)}.pw-kpi b{display:block;font:800 27px/1 var(--f-display);margin-top:3px;white-space:nowrap;overflow:hidden;text-overflow:ellipsis}.pw-kpi small{display:block;color:var(--muted);font:11px var(--f-data);margin-top:3px}.pw-cmd-side{display:grid;gap:10px}.pw-sidecard h3{font:700 13px var(--f-display);text-transform:uppercase;letter-spacing:.06em;margin:0 0 8px}.pw-side-row{display:flex;justify-content:space-between;gap:8px;padding:6px 0;border-bottom:1px solid var(--line);font-size:12px}.pw-side-row b{font-family:var(--f-data)}.pw-health{display:flex;gap:5px;flex-wrap:wrap;margin-bottom:5px}.pw-tyres{display:grid;grid-template-columns:1fr 1fr;gap:5px}.pw-tyre{padding:6px;background:var(--surface2);border:1px solid var(--line);border-radius:5px;text-align:center;font:600 11px var(--f-data)}.pw-tyre small{display:block;color:var(--muted);font-size:9px}.pw-legacy-hide{display:none!important}'+
'.pw-modal{position:fixed;inset:0;z-index:80;background:rgba(3,6,10,.64);backdrop-filter:blur(5px);display:grid;place-items:center;padding:16px}.pw-modal[hidden]{display:none}.pw-modal-card{width:min(920px,100%);max-height:86vh;overflow:auto;background:var(--bg);border:1px solid var(--line);border-radius:14px;box-shadow:0 24px 80px rgba(0,0,0,.55)}.pw-modal-head{position:sticky;top:0;background:color-mix(in srgb,var(--bg) 94%,transparent);display:flex;align-items:center;justify-content:space-between;padding:14px 16px;border-bottom:1px solid var(--line)}.pw-modal-head h2{margin:0}.pw-modal-body{padding:14px 16px 18px}.pw-x{width:34px;height:34px;border:1px solid var(--line);background:var(--surface);color:var(--fg);border-radius:6px;cursor:pointer;font-size:20px}.pw-center-grid{display:grid;grid-template-columns:repeat(2,minmax(0,1fr));gap:10px}.pw-center-card,.pw-diag-item{background:var(--surface);border:1px solid var(--line);border-radius:9px;padding:12px}.pw-center-card .top{display:flex;justify-content:space-between}.pw-center-card h3{margin:0;font:700 17px var(--f-display);text-transform:uppercase}.pw-center-card p{margin:8px 0 0;color:var(--muted);font-size:13px}.pw-actions{display:flex;gap:7px;flex-wrap:wrap;margin-top:10px}.pw-diag-grid{display:grid;grid-template-columns:repeat(3,minmax(0,1fr));gap:7px}.pw-diag-item .k{font:600 9px var(--f-data);color:var(--muted);text-transform:uppercase}.pw-diag-item b{display:block;font:700 17px var(--f-data);margin-top:3px;overflow:hidden;text-overflow:ellipsis}.pw-overlay-presets{display:flex;gap:6px;flex-wrap:wrap;align-items:center;margin-top:10px;padding-top:10px;border-top:1px solid var(--line)}.pw-preset{background:var(--surface2);border:1px solid var(--line);color:var(--fg);border-radius:999px;padding:6px 10px;font:600 12px var(--f-body);cursor:pointer}.pw-preset:hover{border-color:var(--accent);color:var(--accent)}.pw-mine{display:inline-flex;align-items:center;gap:2px;padding:0 4px 0 10px}.pw-mine button{background:none;border:0;color:inherit;font:inherit;cursor:pointer;padding:6px 0}.pw-mine .pw-del{padding:2px 6px;margin-left:4px;border-radius:999px;color:var(--muted);font-size:15px;line-height:1}.pw-mine .pw-del:hover{color:var(--bad);background:color-mix(in srgb,var(--bad) 15%,transparent)}@media(max-width:900px){.pw-cmd{grid-template-columns:1fr}.pw-cmd-kpis{grid-template-columns:repeat(2,1fr)}.pw-center-grid,.pw-diag-grid{grid-template-columns:1fr}}';
 document.head.appendChild(s)
}
function installModals(){
 if($("#pwCenter"))return;
 var w=document.createElement("div");
 w.innerHTML='<div class="pw-modal" id="pwCenter" hidden><div class="pw-modal-card"><div class="pw-modal-head"><h2>'+tr("Connection Center","Centro de conexiones")+'</h2><button class="pw-x" data-pwc="pwCenter">×</button></div><div class="pw-modal-body"><div class="pw-center-grid" id="pwCenterGrid"></div><div class="pw-actions"><button class="btn" id="pwDiagBtn">'+tr("Open diagnostics","Abrir diagnóstico")+'</button><button class="btn" id="pwRefreshBtn">'+tr("Refresh","Actualizar")+'</button></div></div></div></div>'+
 '<div class="pw-modal" id="pwDiag" hidden><div class="pw-modal-card"><div class="pw-modal-head"><h2>Diagnostics</h2><button class="pw-x" data-pwc="pwDiag">×</button></div><div class="pw-modal-body" id="pwDiagBody"></div></div></div>';
 document.body.appendChild(w);
 w.querySelectorAll("[data-pwc]").forEach(function(b){b.onclick=function(){var m=document.getElementById(b.dataset.pwc);if(m)m.hidden=true}}); // by id: querySelector("pwDiag") found nothing and the window never closed
 // a click outside the card or Escape closes them too
 w.querySelectorAll(".pw-modal").forEach(function(m){m.addEventListener("click",function(e){if(e.target===m)m.hidden=true})});
 document.addEventListener("keydown",function(e){if(e.key==="Escape")w.querySelectorAll(".pw-modal").forEach(function(m){m.hidden=true})});
 $("#pwDiagBtn").onclick=function(){$("#pwCenter").hidden=true;$("#pwDiag").hidden=false;renderDiag()};
 $("#pwRefreshBtn").onclick=function(){refreshInfo(true)}
}
function derive(){
 var age=ST.last?performance.now()-ST.last:Infinity;
 ST.telemetry=age<900?"LIVE":age<4000?"STALE":"OFFLINE";
 if(typeof STATUS!=="undefined"&&STATUS.demo)ST.telemetry="DEMO";
 if(typeof STATUS!=="undefined"&&STATUS.connected)ST.pc="CONNECTED";
 else if(typeof STATUS!=="undefined"&&STATUS.companion)ST.pc=(typeof CPLIVE!=="undefined"&&CPLIVE.on)?"CONNECTED":"COMPANION";
 else ST.pc="OFFLINE";
 ST.cloud=(typeof CPLIVE!=="undefined"&&CPLIVE.on)?"CONNECTED":"IDLE";
 ST.overall=(ST.telemetry==="LIVE"||ST.telemetry==="DEMO")?"LIVE":ST.pc==="COMPANION"?"COMPANION":ST.pc==="CONNECTED"?"WAITING":"OFFLINE";
 return ST
}
function remember(){if(typeof T==="undefined")return;if(T!==ST.obj){ST.obj=T;ST.last=performance.now();ST.times.push(ST.last);if(ST.times.length>30)ST.times.shift()}}
// the header label stays the app's own (renderConn): translated, and right on the PC, the web and the phones
function headerState(){}
async function refreshInfo(force){if(typeof MODE!=="undefined"&&!["bridge","local"].includes(MODE))return;try{var r=await fetch("/api/info",{cache:"no-store"});if(r.ok)ST.info=await r.json()}catch(e){}if(force)renderCenter()}
function renderCenter(){
 var b=$("#pwCenterGrid");if(!b)return;var s=derive(),i=ST.info||{},st=typeof STATUS!=="undefined"?STATUS:{},hz=ST.times.length>2?Math.round((ST.times.length-1)/((ST.times.at(-1)-ST.times[0])/1000)):0,open=typeof OV_OPEN!=="undefined"?OV_OPEN.size:0;
 var cards=[["iRacing / Telemetry",s.telemetry,s.telemetry==="LIVE"?"Telemetry is updating normally.":s.telemetry==="DEMO"?"Demo data is active.":"Waiting for telemetry frames.",(st.source||"—")+" · "+(hz?hz+" Hz":"—")],["PitWall PC",s.pc,i.host?i.host:"Local PC",i.version?"v"+i.version:""],["Cloud / Remote",s.cloud,s.cloud==="CONNECTED"?"Live relay connected":"Ready for account/remote use",typeof CP!=="undefined"&&CP.acc?"Account signed in":""],["Overlays",open?open+" OPEN":"READY",(CFG.autoWidgets||[]).length+" automatic · "+(CFG.edit?"unlocked":"locked"),"Engine: "+(CFG.engine||"webview")]];
 var html=cards.map(function(c){return'<div class="pw-center-card"><div class="top"><h3>'+safe(c[0])+'</h3>'+badge(c[1])+'</div><p>'+safe(c[2])+'</p><p class="mono">'+safe(c[3])+"</p></div>"}).join("");if(b.__h!==html){b.__h=html;b.innerHTML=html}
}
function diagData(){
 var s=derive(),st=typeof STATUS!=="undefined"?STATUS:{},age=ST.last?Math.round(performance.now()-ST.last):null,hz=ST.times.length>2?Math.round((ST.times.length-1)/((ST.times.at(-1)-ST.times[0])/1000)):0,ov=typeof OV_OPEN!=="undefined"?Array.from(OV_OPEN):[];
 return{overall:s.overall,telemetry:s.telemetry,pc:s.pc,cloud:s.cloud,telemetryAgeMs:age,telemetryHz:hz,source:st.source||"",demo:!!st.demo,connected:!!st.connected,companion:!!st.companion,mode:typeof MODE!=="undefined"?MODE:"",remote:typeof REMOTE!=="undefined"?!!REMOTE:false,eventSource:typeof es!=="undefined"&&es?es.readyState:null,configPending:typeof cfgPending!=="undefined"&&!!cfgPending,overlays:ov,autoOverlays:CFG.autoWidgets||[],engine:CFG.engine,info:ST.info}
}
// built once and then only the values change: rebuilding it four times a second ate every click
// (the copy button and the raw report were replaced before the click landed)
function renderDiag(){
 var b=$("#pwDiagBody");if(!b)return;var d=diagData(),rows=[[tr("Overall","General"),d.overall],["Telemetry",d.telemetry],["PC",d.pc],["Cloud",d.cloud],[tr("Telemetry age","Edad de la telemetría"),d.telemetryAgeMs==null?"—":d.telemetryAgeMs+" ms"],[tr("Estimated rate","Frecuencia estimada"),d.telemetryHz+" Hz"],[tr("Source","Fuente"),d.source||"—"],[tr("Mode","Modo"),d.mode],["EventSource",d.eventSource==null?"—":d.eventSource],[tr("Config sync","Sincronización de ajustes"),d.configPending?tr("Pending","Pendiente"):tr("Clean","Al día")],["Overlays",d.overlays.length+" "+tr("open","abiertos")],[tr("Engine","Motor"),d.engine||"—"]];
 if(!b.querySelector(".pw-diag-grid")){
  b.innerHTML='<div class="pw-diag-grid">'+rows.map(function(x){return'<div class="pw-diag-item"><div class="k">'+safe(x[0])+'</div><b></b></div>'}).join("")+'</div><div class="pw-center-card" style="margin-top:10px"><div class="label">'+tr("Open overlays","Overlays abiertos")+'</div><p class="mono" data-d="ov"></p><div class="label">'+tr("Automatic overlays","Overlays automáticos")+'</div><p class="mono" data-d="auto"></p></div><details style="margin-top:10px"><summary class="label">'+tr("Raw diagnostic report","Informe completo")+'</summary><pre class="discpre" data-d="raw"></pre></details><div class="pw-actions"><button class="btn primary" id="pwCopyDiag">'+tr("Copy report","Copiar informe")+'</button></div>';
  var c=$("#pwCopyDiag");if(c)c.onclick=async function(){var txt=JSON.stringify(diagData(),null,2);try{await navigator.clipboard.writeText(txt);toast(tr("Diagnostic report copied.","Informe copiado."))}catch(e){try{var t=document.createElement("textarea");t.value=txt;document.body.appendChild(t);t.select();document.execCommand("copy");t.remove();toast(tr("Diagnostic report copied.","Informe copiado."))}catch(x){toast(tr("Could not copy report.","No se pudo copiar el informe."))}}}
 }
 var vals=b.querySelectorAll(".pw-diag-item b");rows.forEach(function(x,i){var v=String(x[1]);if(vals[i]&&vals[i].textContent!==v)vals[i].textContent=v});
 var set=function(k,v){var e=b.querySelector('[data-d="'+k+'"]');if(e&&e.textContent!==v)e.textContent=v};
 set("ov",d.overlays.join(", ")||tr("none","ninguno"));set("auto",d.autoOverlays.join(", ")||tr("none","ninguno"));
 var det=b.querySelector("details");if(det&&det.open)set("raw",JSON.stringify(d,null,2))
}
function installDashboard(){
 if(typeof OV!=="undefined"&&OV.on)return;
 var live=$("#v-live"),grid=$("#liveGrid");if(!live||!grid||$("#pwCommandDash"))return;
 var a=grid.querySelector('[data-w="dash"]'),b=grid.querySelector('[data-w="timing"]');if(a)a.classList.add("pw-legacy-hide");if(b)b.classList.add("pw-legacy-hide");
 var d=document.createElement("div");d.id="pwCommandDash";d.className="pw-cmd";
 d.innerHTML='<div class="pw-cmd-main"><div class="pw-cmd-head"><div><div class="pw-cmd-track" id="pwTrack">—</div><div class="pw-cmd-sub" id="pwSession">—</div></div><div id="pwDashState">'+badge("OFFLINE")+'</div></div><div class="pw-cmd-kpis"><div class="pw-kpi"><div class="k">'+tr("Position","Posición")+'</div><b id="pwPos">—</b><small id="pwLap">—</small></div><div class="pw-kpi"><div class="k">'+tr("Speed","Velocidad")+'</div><b id="pwSpeed">—</b><small id="pwGear">—</small></div><div class="pw-kpi"><div class="k">Delta</div><b id="pwDelta">—</b><small id="pwBest">—</small></div><div class="pw-kpi"><div class="k">'+tr("Fuel","Combustible")+'</div><b id="pwFuel">—</b><small id="pwFuelSub">—</small></div></div></div><div class="pw-cmd-side"><div class="pw-sidecard"><h3>'+tr("Race","Carrera")+'</h3><div class="pw-side-row"><span>'+tr("Relative","Relativo")+'</span><b id="pwRel">—</b></div><div class="pw-side-row"><span>'+tr("Session","Sesión")+'</span><b id="pwSessType">—</b></div></div><div class="pw-sidecard"><h3>'+tr("Tyres","Neumáticos")+'</h3><div class="pw-tyres" id="pwTyres"></div></div></div>';
 live.insertBefore(d,grid)
}
function updateDashboard(){
 var d=$("#pwCommandDash");if(!d)return;remember();var s=derive(),sx=typeof S!=="undefined"?S:{},tx=typeof T!=="undefined"?T:{},wi=sx.WeekendInfo||{},si=sx.SessionInfo||{},di=sx.DriverInfo||{},sess=(si.Sessions||[]).find(function(x){return x.SessionNum===si.CurrentSessionNum})||{};
 var live=s.telemetry==="LIVE"||s.telemetry==="DEMO"||s.telemetry==="STALE",gname=typeof gameName==="function"?gameName():"iRacing";
 // the connection state is shown here only (left card): what we wait for, or the track
 $("#pwTrack").textContent=wi.TrackDisplayName||wi.TrackDisplayShortName||(s.pc==="COMPANION"?tr("Waiting for your PC","Esperando a tu PC"):tr("Waiting for "+gname,"Esperando a "+gname));$("#pwSession").textContent=[sess.SessionName||sess.SessionType||"",wi.TrackConfigName||"",wi.TrackLength||""].filter(Boolean).join(" · ")||"—";$("#pwDashState").innerHTML=badge(s.telemetry);
 var p=tx.PlayerCarPosition||((tx.CarIdxPosition||[])[di.DriverCarIdx]);$("#pwPos").textContent=p>0?"P"+p:"—";var total=sess.SessionLaps||tx.SessionLapsTotal;$("#pwLap").textContent=tx.Lap!=null?tr("Lap ","Vuelta ")+tx.Lap+(total&&total<32000?"/"+total:""):"—";$("#pwSpeed").textContent=spd(tx.Speed);$("#pwGear").textContent=tx.Gear==null?"—":tr("Gear ","Marcha ")+tx.Gear;
 var dd=tx.LapDeltaToBestLap==null?null:+tx.LapDeltaToBestLap,de=$("#pwDelta");de.textContent=dd==null?"—":(dd>=0?"+":"")+dd.toFixed(3)+" s";de.className=dd==null?"":dd<=0?"good":"bad";$("#pwBest").textContent=tx.LapBestLapTime>0?tr("Best ","Mejor ")+sec(tx.LapBestLapTime):"—";
 var f=typeof fuelInfo==="function"?fuelInfo():null;$("#pwFuel").textContent=tx.FuelLevel==null?"—":fmt(tx.FuelLevel,1)+" L";$("#pwFuelSub").textContent=f&&f.laps!=null?f.laps.toFixed(1)+tr(" laps"," vueltas")+(f.left!=null?" · "+f.left+tr(" left"," restantes"):""):"—";
 var rel="—";try{var g=typeof gapsNow==="function"?gapsNow():null;if(g)rel=g.ahead?Math.abs(g.ahead.g).toFixed(1)+tr("s ahead"," s delante"):g.behind?Math.abs(g.behind.g).toFixed(1)+tr("s behind"," s detrás"):"—"}catch(e){}$("#pwRel").textContent=rel;$("#pwSessType").textContent=sess.SessionType||sess.SessionName||"—";
 $("#pwTyres").innerHTML=[["FL","LF"],["FR","RF"],["RL","LR"],["RR","RR"]].map(function(x){try{var v=typeof tyreVals==="function"?tyreVals(x[1]):{},t=v&&v.M!=null?v.M:null;return'<div class="pw-tyre">'+x[0]+'<b>'+(t==null||!live?"—":fmt(t,0)+"°")+'</b><small>'+(!live||t==null?"":v&&v.live?tr("LIVE","EN VIVO"):tr("PIT READING","LECTURA EN BOXES"))+"</small></div>"}catch(e){return'<div class="pw-tyre">'+x[0]+'<b>—</b><small></small></div>'}}).join("")
}
var PRESETS={race:["radar","deltabar","relative","standings"],qualifying:["deltabar","compare","inputs","map"],endurance:["relative","fuel","tyres","deltabar","standings"],engineer:["map","relative","radar","inputs","fuel","tyres","telemetry"]};
var PRESET_NAMES={race:["Race","Carrera"],qualifying:["Qualifying","Clasificación"],endurance:["Endurance","Resistencia"],engineer:["Engineer","Ingeniero"]};
// your own presets live in the overlay settings (CFG.ui.ovpresets), so they go with the account to every PC;
// the ones saved before only in this browser are moved there once
function myPresets(){var u=(CFG.ui||{}).ovpresets,list=u&&u.list&&typeof u.list==="object"?u.list:{};
 try{var old=JSON.parse(localStorage.getItem("pw.overlayPresets")||"null");if(old&&typeof old==="object"){var moved=false;Object.keys(old).forEach(function(k){if(!list[k]&&Array.isArray(old[k])){list[k]=old[k];moved=true}});localStorage.removeItem("pw.overlayPresets");if(moved)savePresets(list)}}catch(e){}
 return list}
function savePresets(list){CFG.ui=CFG.ui||{};CFG.ui.ovpresets={list:list};saveCfg()}
function applyPreset(ws){CFG.autoWidgets=ws.filter(function(w){return WIDGETS.includes(w)});CFG.autoStart=true;CFG.closeOnExit=true;saveCfg();renderOverlaysTab();toast(tr("Overlay preset applied.","Perfil de overlays aplicado."))}
function overlayPresets(){
 var g=$("#ovGlobal");if(!g)return;var bar=$("#pwOverlayPresets"),mine=myPresets(),key=LANG+JSON.stringify(mine);
 if(bar&&bar.dataset.k===key)return;
 if(!bar){bar=document.createElement("div");bar.id="pwOverlayPresets";bar.className="pw-overlay-presets";g.appendChild(bar)}
 bar.dataset.k=key;
 bar.innerHTML='<span class="label">'+tr("Presets","Perfiles")+'</span>'+Object.keys(PRESETS).map(function(k){return'<button type="button" class="pw-preset" data-pwpreset="'+k+'">'+safe(tr(PRESET_NAMES[k][0],PRESET_NAMES[k][1]))+"</button>"}).join("")
  +Object.keys(mine).map(function(k){return'<span class="pw-preset pw-mine"><button type="button" data-pwmine="'+safe(k)+'">'+safe(k)+'</button><button type="button" class="pw-del" data-pwdel="'+safe(k)+'" title="'+safe(tr("Delete","Eliminar"))+'" aria-label="'+safe(tr("Delete","Eliminar")+" "+k)+'">×</button></span>'}).join("")
  +'<button type="button" class="pw-preset" id="pwSavePreset">+ '+tr("Save current","Guardar el actual")+'</button>';
 bar.querySelectorAll("[data-pwpreset]").forEach(function(x){x.onclick=function(){applyPreset(PRESETS[x.dataset.pwpreset])}});
 bar.querySelectorAll("[data-pwmine]").forEach(function(x){x.onclick=function(){var l=myPresets()[x.dataset.pwmine];if(l)applyPreset(l)}});
 bar.querySelectorAll("[data-pwdel]").forEach(function(x){x.onclick=async function(){var n=x.dataset.pwdel;if(!await uiConfirm(tr("Delete the preset “"+n+"”?","¿Eliminar el perfil «"+n+"»?")))return;var l=myPresets();delete l[n];savePresets(l);overlayPresets();toast(tr("Preset deleted.","Perfil eliminado."))}});
 $("#pwSavePreset").onclick=async function(){var ws=(CFG.autoWidgets||[]).slice();if(!ws.length){toast(tr("Turn on Auto for the overlays you want first.","Activa primero Auto en los overlays que quieras."));return}
  var n=await uiPrompt(tr("Preset name","Nombre del perfil"),tr("My preset","Mi perfil"));n=String(n||"").trim().slice(0,32);if(!n)return;
  var l=myPresets();if(l[n]&&!await uiConfirm(tr("Replace the preset “"+n+"”?","¿Reemplazar el perfil «"+n+"»?")))return;l[n]=ws;savePresets(l);overlayPresets();toast(tr("Preset saved.","Perfil guardado."))}
}
function installFullTelemetry(){
 if(window.__PW_FULL_TEL)return;window.__PW_FULL_TEL=true;
 try{
  if(typeof I18N!=="undefined")I18N["tab.fulltelemetry"]=["Full Telemetry","Telemetría completa","Vollständige Telemetrie","Telemetria completa"];
  if(typeof VIEW_LABEL!=="undefined")VIEW_LABEL.fulltelemetry="tab.fulltelemetry";
  if(typeof GROUPS!=="undefined"&&GROUPS.analysis&&!GROUPS.analysis.includes("fulltelemetry"))GROUPS.analysis.push("fulltelemetry");
 }catch(e){}
 var sec=document.getElementById("v-fulltelemetry");
 if(!sec){sec=document.createElement("section");sec.className="view";sec.id="v-fulltelemetry";sec.hidden=true;sec.innerHTML='<div class="vhead"><div><h1>'+tr("Full Telemetry","Telemetría completa")+'</h1><div class="sub">'+tr("All iRacing SDK variables received from the PC.","Todas las variables del SDK de iRacing que llegan del PC.")+'</div></div><div class="controls"><button class="btn small" id="ftClear">'+tr("Clear history","Borrar historial")+'</button></div></div><div class="panel" id="ftSummary"></div><div class="panel" style="margin-top:10px"><div class="frow"><input id="ftSearch" placeholder="'+tr("Search telemetry variable…","Buscar variable…")+'" style="flex:1;min-width:220px"><select id="ftVar" style="min-width:220px"></select></div><div id="ftChart" style="height:190px;margin-top:10px"></div><div id="ftTable" class="tscroll" style="margin-top:10px"></div></div>';document.body.appendChild(sec)}
 var hist=[],lastTick=null,lastSample=0,selected="",maxHist=300;
 function valText(v){if(v==null)return"—";if(Array.isArray(v))return"["+v.length+" values] "+v.slice(0,8).map(function(x){return x==null?"—":typeof x==="number"?Number(x).toFixed(3):String(x)}).join(", ")+(v.length>8?"…":"");if(typeof v==="number")return isFinite(v)?(Math.abs(v)>=1000?v.toFixed(1):v.toFixed(4)):"—";return String(v)}
 function render(){
  var t=typeof T!=="undefined"&&T?T:{},sc=typeof SCHEMA!=="undefined"&&Array.isArray(SCHEMA)?SCHEMA:[],tick=t.SessionTick??t.SessionTime,now=performance.now();
  // only real frames go to the history: nothing is recorded while no telemetry arrives,
  // and it starts again when the session restarts
  if(tick!=null&&isFinite(tick)){if(lastTick!=null&&tick<lastTick)hist=[];if(tick!==lastTick&&now-lastSample>=95){lastTick=tick;lastSample=now;hist.push({at:now,v:{...t}});if(hist.length>maxHist)hist.shift()}}
  var span=hist.length>1?(hist[hist.length-1].at-hist[0].at)/1000:0;
  var q=(($("#ftSearch")&&$("#ftSearch").value)||"").toLowerCase().trim(),rows=sc.filter(function(v){return!q||String(v.name).toLowerCase().includes(q)||String(v.desc||"").toLowerCase().includes(q)||String(v.unit||"").toLowerCase().includes(q)}).slice(0,500);
  if(!selected||!rows.some(function(v){return v.name===selected}))selected=rows[0]?rows[0].name:"";
  $("#ftVar").innerHTML=rows.map(function(v){return'<option value="'+escx(v.name)+'">'+escx(v.name)+(v.unit?" · "+escx(v.unit):"")+(v.count>1?" · ×"+v.count:"")+"</option>"}).join("");$("#ftVar").value=selected;
  var missing=sc.filter(function(v){return!(v.name in t)}).length;$("#ftSummary").innerHTML='<div class="tiles"><div class="tile"><div class="label">'+tr("SDK variables","Variables del SDK")+'</div><div class="mid mono">'+sc.length+'</div></div><div class="tile"><div class="label">'+tr("Values in frame","Valores recibidos")+'</div><div class="mid mono">'+Object.keys(t).length+'</div></div><div class="tile"><div class="label">'+tr("History","Historial")+'</div><div class="mid mono">'+Math.round(span)+' s</div><div class="sub">'+hist.length+'/'+maxHist+' '+tr("samples","muestras")+'</div></div><div class="tile"><div class="label">'+tr("Missing","Faltan")+'</div><div class="mid mono">'+missing+'</div></div></div>';
  $("#ftTable").innerHTML=rows.length?'<table class="wtable"><thead><tr><th>Variable</th><th>Type</th><th>Unit</th><th>Count</th><th class="r">Current</th></tr></thead><tbody>'+rows.map(function(v){return'<tr data-ft="'+escx(v.name)+'"><td class="mono">'+escx(v.name)+'</td><td>'+escx(v.type||"")+'</td><td>'+escx(v.unit||"")+'</td><td class="mono">'+(v.count||1)+'</td><td class="r mono">'+escx(valText(t[v.name]))+'</td></tr>'}).join("")+'</tbody></table>':'<div class="empty">No telemetry variables match the search.</div>';
  $("#ftTable").querySelectorAll("[data-ft]").forEach(function(tr){tr.onclick=function(){selected=tr.dataset.ft;draw()}});draw()
 }
 function draw(){var box=$("#ftChart"),pts=[];hist.forEach(function(h){var v=h.v[selected];if(typeof v==="number"&&isFinite(v))pts.push(v)});if(pts.length<2){box.innerHTML='<div class="empty">Select a numeric variable to see its recent trace.</div>';return}var W=Math.max(420,box.clientWidth||700),H=180,p={l:48,r:12,t:12,b:24},lo=Math.min(...pts),hi=Math.max(...pts);if(hi===lo){hi+=1;lo-=1}var X=i=>p.l+i*(W-p.l-p.r)/(pts.length-1),Y=v=>p.t+(hi-v)/(hi-lo)*(H-p.t-p.b),d=pts.map((v,i)=>X(i)+","+Y(v)).join(" ");box.innerHTML='<svg viewBox="0 0 '+W+' '+H+'" width="100%" height="'+H+'"><line x1="'+p.l+'" x2="'+(W-p.r)+'" y1="'+Y(hi)+'" y2="'+Y(hi)+'" stroke="var(--line)"/><line x1="'+p.l+'" x2="'+(W-p.r)+'" y1="'+Y(lo)+'" y2="'+Y(lo)+'" stroke="var(--line)"/><polyline points="'+d+'" fill="none" stroke="var(--accent)" stroke-width="2"/><text x="4" y="18" fill="var(--muted)" font-size="11">'+escx(valText(hi))+'</text><text x="4" y="'+(H-8)+'" fill="var(--muted)" font-size="11">'+escx(valText(lo))+'</text><text x="'+p.l+'" y="'+(H-6)+'" fill="var(--muted)" font-size="11">'+escx(selected)+'</text></svg>'}
 $("#ftSearch").oninput=render;$("#ftVar").onchange=function(){selected=this.value;draw()};$("#ftClear").onclick=function(){hist=[];lastTick=null;render()};setInterval(function(){if(typeof CUR_VIEW!=="undefined"&&CUR_VIEW==="fulltelemetry")render()},250)
}
function hook(){
 installCss();installModals();installDashboard();installFullTelemetry();
 // the web app on a phone: the header's "Connect PC" goes to the Live page (pairing, live through the account), the centre is for the PC
 var c=$("#conn");if(c&&!(typeof COMPANION!=="undefined"&&COMPANION))c.onclick=function(){$("#pwCenter").hidden=false;renderCenter();refreshInfo(true)};
 setInterval(function(){headerState();updateDashboard();if($("#pwCenter")&&!$("#pwCenter").hidden)renderCenter();if($("#pwDiag")&&!$("#pwDiag").hidden)renderDiag();if(typeof CUR_VIEW!=="undefined"&&CUR_VIEW==="overlays")overlayPresets()},250);
 setInterval(function(){refreshInfo(false)},5000);overlayPresets()
}
if(document.readyState==="loading")document.addEventListener("DOMContentLoaded",hook);else hook();
})();