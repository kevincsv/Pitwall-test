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
 s.textContent='#v-live.pw-hascmd .lhead>div:first-child,#v-live.pw-hascmd .lhead .row>div{display:none}#v-live.pw-hascmd .lhead{justify-content:flex-end;margin-bottom:8px}.pw-state{display:inline-flex;align-items:center;gap:6px;border:1px solid var(--line);border-radius:999px;padding:4px 8px;font:700 10px var(--f-data);letter-spacing:.08em;color:var(--muted);white-space:nowrap}.pw-state i{width:6px;height:6px;border-radius:50%;background:currentColor}.pw-state.good{color:var(--good);border-color:var(--good)}.pw-state.warn{color:var(--warn);border-color:var(--warn)}.pw-state.bad{color:var(--bad);border-color:var(--bad)}.pw-state.acc{color:var(--accent);border-color:var(--accent)}.pw-state.blue{color:var(--blue);border-color:var(--blue)}'+
'.pw-cmd{display:grid;grid-template-columns:1.35fr .65fr;gap:10px;margin:0 0 10px}.pw-cmd-main,.pw-sidecard{background:var(--surface);border:1px solid var(--line);border-radius:10px;padding:13px;min-width:0}.pw-cmd-main{border-color:color-mix(in srgb,var(--accent) 35%,var(--line))}.pw-cmd-head{display:flex;justify-content:space-between;gap:10px}.pw-cmd-track{font:700 27px/1 var(--f-display);text-transform:uppercase;white-space:nowrap;overflow:hidden;text-overflow:ellipsis}.pw-cmd-sub{color:var(--muted);font-size:12px;margin-top:4px}.pw-cmd-kpis{display:grid;grid-template-columns:repeat(4,minmax(0,1fr));gap:8px;margin-top:14px}.pw-kpi{background:var(--surface2);border:1px solid var(--line);border-radius:7px;padding:8px;min-width:0}.pw-kpi .k{font:600 9px var(--f-data);letter-spacing:.08em;text-transform:uppercase;color:var(--muted)}.pw-kpi b{display:block;font:800 27px/1 var(--f-display);margin-top:3px;white-space:nowrap;overflow:hidden;text-overflow:ellipsis}.pw-kpi small{display:block;color:var(--muted);font:11px var(--f-data);margin-top:3px}.pw-cmd-side{display:grid;gap:10px}.pw-sidecard h3{font:700 13px var(--f-display);text-transform:uppercase;letter-spacing:.06em;margin:0 0 8px}.pw-side-row{display:flex;justify-content:space-between;gap:8px;padding:6px 0;border-bottom:1px solid var(--line);font-size:12px}.pw-side-row b{font-family:var(--f-data)}.pw-health{display:flex;gap:5px;flex-wrap:wrap;margin-bottom:5px}.pw-tyres{display:grid;grid-template-columns:1fr 1fr;gap:5px}.pw-tyre{padding:6px;background:var(--surface2);border:1px solid var(--line);border-radius:5px;text-align:center;font:600 11px var(--f-data)}.pw-tyre small{display:block;color:var(--muted);font-size:9px}.pw-legacy-hide{display:none!important}'+
'.pw-modal{position:fixed;inset:0;z-index:80;background:rgba(3,6,10,.64);backdrop-filter:blur(5px);display:grid;place-items:center;padding:16px}.pw-modal[hidden]{display:none}.pw-modal-card{width:min(920px,100%);max-height:86vh;overflow:auto;background:var(--bg);border:1px solid var(--line);border-radius:14px;box-shadow:0 24px 80px rgba(0,0,0,.55)}.pw-modal-head{position:sticky;top:0;background:color-mix(in srgb,var(--bg) 94%,transparent);display:flex;align-items:center;justify-content:space-between;padding:14px 16px;border-bottom:1px solid var(--line)}.pw-modal-head h2{margin:0}.pw-modal-body{padding:14px 16px 18px}.pw-x{width:34px;height:34px;border:1px solid var(--line);background:var(--surface);color:var(--fg);border-radius:6px;cursor:pointer;font-size:20px}.pw-center-grid{display:grid;grid-template-columns:repeat(2,minmax(0,1fr));gap:10px}.pw-center-card,.pw-diag-item{background:var(--surface);border:1px solid var(--line);border-radius:9px;padding:12px}.pw-center-card .top{display:flex;justify-content:space-between}.pw-center-card h3{margin:0;font:700 17px var(--f-display);text-transform:uppercase}.pw-center-card p{margin:8px 0 0;color:var(--muted);font-size:13px}.pw-actions{display:flex;gap:7px;flex-wrap:wrap;margin-top:10px}.pw-diag-grid{display:grid;grid-template-columns:repeat(3,minmax(0,1fr));gap:7px}.pw-diag-item .k{font:600 9px var(--f-data);color:var(--muted);text-transform:uppercase}.pw-diag-item b{display:block;font:700 17px var(--f-data);margin-top:3px;overflow:hidden;text-overflow:ellipsis}.pw-overlay-presets{display:flex;gap:6px;flex-wrap:wrap;align-items:center;margin-top:10px;padding-top:10px;border-top:1px solid var(--line)}.pw-preset{background:var(--surface2);border:1px solid var(--line);color:var(--fg);border-radius:999px;padding:6px 10px;font:600 12px var(--f-body);cursor:pointer}.pw-preset:hover{border-color:var(--accent);color:var(--accent)}.pw-mine{display:inline-flex;align-items:center;gap:2px;padding:0 4px 0 10px}.pw-mine button{background:none;border:0;color:inherit;font:inherit;cursor:pointer;padding:6px 0}.pw-mine .pw-del{padding:2px 6px;margin-left:4px;border-radius:999px;color:var(--muted);font-size:15px;line-height:1}.pw-mine .pw-del:hover{color:var(--bad);background:color-mix(in srgb,var(--bad) 15%,transparent)}@media(max-width:900px){.pw-cmd{grid-template-columns:1fr}.pw-cmd-kpis{grid-template-columns:repeat(2,1fr)}.pw-center-grid,.pw-diag-grid{grid-template-columns:1fr}}';
 s.textContent+='@media (max-width:520px){.pw-cmd-head{flex-wrap:wrap}.pw-state{white-space:normal}}'; // the state badge goes under the title on a phone
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
// the top of the Telemetry screen: what matters while you drive and nothing else. Where you are (position and lap),
// the delta to your best and your best lap, the last lap, the fuel and how many laps it lasts; beside it the gaps to
// the cars just ahead and behind, your incidents and what is left of the session
function installDashboard(){
 if(typeof OV!=="undefined"&&OV.on)return;
 var live=$("#v-live"),grid=$("#liveGrid");if(!live||!grid||$("#pwCommandDash"))return;
 var a=grid.querySelector('[data-w="dash"]'),b=grid.querySelector('[data-w="timing"]');if(a)a.classList.add("pw-legacy-hide");if(b)b.classList.add("pw-legacy-hide");
 var d=document.createElement("div");d.id="pwCommandDash";d.className="pw-cmd";
 var kpi=function(k,id,sub){return'<div class="pw-kpi"><div class="k">'+k+'</div><b id="'+id+'">—</b><small id="'+sub+'">—</small></div>'},row=function(k,id){return'<div class="pw-side-row"><span>'+k+'</span><b id="'+id+'">—</b></div>'};
 d.innerHTML='<div class="pw-cmd-main"><div class="pw-cmd-head"><div><div class="pw-cmd-track" id="pwTrack">—</div><div class="pw-cmd-sub" id="pwSession">—</div></div><div id="pwDashState">'+badge("OFFLINE")+'</div></div><div class="pw-cmd-kpis">'+
  kpi(tr("Position","Posición"),"pwPos","pwLap")+kpi("Delta","pwDelta","pwBest")+kpi(tr("Last lap","Última vuelta"),"pwLast","pwLastSub")+kpi(tr("Fuel","Combustible"),"pwFuel","pwFuelSub")+
  '</div></div><div class="pw-cmd-side"><div class="pw-sidecard"><h3 id="pwSessType">'+tr("Race","Carrera")+'</h3>'+row(tr("Ahead","Delante"),"pwAhead")+row(tr("Behind","Detrás"),"pwBehind")+row(tr("Incidents","Incidentes"),"pwInc")+row(tr("Left","Quedan"),"pwLeft")+'</div></div>';
 live.insertBefore(d,grid);live.classList.add("pw-hascmd") // the card says the track, the position and the lap: the heading above keeps only Layout
}
function updateDashboard(){
 var d=$("#pwCommandDash");if(!d)return;remember();var s=derive(),sx=typeof S!=="undefined"?S:{},tx=typeof T!=="undefined"?T:{},wi=sx.WeekendInfo||{},si=sx.SessionInfo||{},di=sx.DriverInfo||{},sess=(si.Sessions||[]).find(function(x){return x.SessionNum===si.CurrentSessionNum})||{};
 var gname=typeof gameName==="function"?gameName():"iRacing",set=function(id,v,c){var e=$("#"+id);if(!e)return;e.textContent=v;if(c!==undefined)e.className=c};
 // the connection state is shown here only (left card): what we wait for, or the track
 set("pwTrack",wi.TrackDisplayName||wi.TrackDisplayShortName||(s.pc==="COMPANION"?tr("Waiting for your PC","Esperando a tu PC"):tr("Waiting for "+gname,"Esperando a "+gname)));
 var car=((di.Drivers||[]).find(function(x){return x.CarIdx===di.DriverCarIdx})||{}).CarScreenNameShort||"";
 set("pwSession",[sess.SessionName||sess.SessionType||"",wi.TrackConfigName||"",car].filter(Boolean).join(" · ")||"—");$("#pwDashState").innerHTML=badge(s.telemetry);
 var p=tx.PlayerCarPosition||((tx.CarIdxPosition||[])[di.DriverCarIdx]),field=(di.Drivers||[]).filter(function(x){return!x.IsSpectator&&!x.CarIsPaceCar}).length,total=sess.SessionLaps||tx.SessionLapsTotal;
 set("pwPos",p>0?"P"+p+(field>1?" / "+field:""):"—");set("pwLap",tx.Lap!=null?tr("Lap ","Vuelta ")+tx.Lap+(total&&total<32000?" / "+total:""):"—");
 var dd=tx.LapDeltaToBestLap_OK===false||tx.LapDeltaToBestLap==null?null:+tx.LapDeltaToBestLap;set("pwDelta",dd==null?"—":(dd>=0?"+":"−")+Math.abs(dd).toFixed(2)+" s",dd==null?"":dd<=0?"good":"bad");
 set("pwBest",tx.LapBestLapTime>0?tr("Best ","Mejor ")+sec(tx.LapBestLapTime):"—");
 var ll=tx.LapLastLapTime>0?+tx.LapLastLapTime:null,bb=tx.LapBestLapTime>0?+tx.LapBestLapTime:null;set("pwLast",ll?sec(ll):"—",ll&&bb&&ll<=bb+.001?"pb":"");set("pwLastSub",ll&&bb?(ll<=bb+.001?tr("your best","tu mejor vuelta"):"+"+(ll-bb).toFixed(2)+" s "+tr("off your best","de tu mejor")):"—");
 var f=typeof fuelInfo==="function"?fuelInfo():null,fu=typeof vol==="function"?vol:function(v){return v},fl=typeof volU==="function"?volU():"L";
 set("pwFuel",tx.FuelLevel==null?"—":fmt(fu(tx.FuelLevel),1)+" "+fl);set("pwFuelSub",f&&f.laps!=null?f.laps.toFixed(1)+tr(" laps"," vueltas"):"—");
 var g=null;try{g=typeof gapsNow==="function"?gapsNow():null}catch(e){}
 set("pwAhead",g&&g.ahead?"−"+g.ahead.g.toFixed(1)+" s":"—");set("pwBehind",g&&g.behind?"+"+g.behind.g.toFixed(1)+" s":"—");
 var inc=tx.PlayerCarMyIncidentCount;set("pwInc",inc==null?"—":inc+"x",inc>=8?"bad":"");
 var lr=tx.SessionLapsRemainEx,tr2=tx.SessionTimeRemain,left="—";if(lr!=null&&lr>=0&&lr<32000)left=lr+tr(" laps"," vueltas");else if(tr2!=null&&tr2>0&&tr2<604800)left=Math.floor(tr2/60)+":"+String(Math.floor(tr2%60)).padStart(2,"0");set("pwLeft",left);
 set("pwSessType",sess.SessionType||sess.SessionName||tr("Session","Sesión"))
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
function hook(){
 installCss();installModals();installDashboard();
 // the web app on a phone: the header's "Connect PC" goes to the Live page (pairing, live through the account), the centre is for the PC
 var c=$("#conn");if(c&&!(typeof COMPANION!=="undefined"&&COMPANION))c.onclick=function(){$("#pwCenter").hidden=false;renderCenter();refreshInfo(true)};
 setInterval(function(){headerState();updateDashboard();if($("#pwCenter")&&!$("#pwCenter").hidden)renderCenter();if($("#pwDiag")&&!$("#pwDiag").hidden)renderDiag();if(typeof CUR_VIEW!=="undefined"&&CUR_VIEW==="overlays")overlayPresets()},250);
 setInterval(function(){refreshInfo(false)},5000);overlayPresets()
}
if(document.readyState==="loading")document.addEventListener("DOMContentLoaded",hook);else hook();
})();