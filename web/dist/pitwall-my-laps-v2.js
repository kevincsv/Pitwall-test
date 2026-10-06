(function(){
"use strict";
if(window.__PW_MY_LAPS_V2)return; window.__PW_MY_LAPS_V2=true;
const $=s=>document.querySelector(s);
const esc=v=>String(v==null?"":v).replace(/[&<>"]/g,m=>({"&":"&amp;","<":"&lt;",">":"&gt;",'"':"&quot;"}[m]));
const fmt=t=>{const n=Number(t);if(!isFinite(n)||n<=0)return "—";const m=Math.floor(n/60);return (m?m+":":"")+(n%60).toFixed(3).padStart(6,"0")};
const date=v=>{try{return new Date(v).toLocaleString(undefined,{day:"numeric",month:"short",year:"numeric",hour:"2-digit",minute:"2-digit"})}catch(e){return ""}};
function styles(){if($("#pwMyLapsCss"))return;const s=document.createElement("style");s.id="pwMyLapsCss";s.textContent=`
.pwml{display:grid;gap:14px}.pwml-head{display:flex;justify-content:space-between;gap:12px;align-items:center}.pwml-grid{display:grid;grid-template-columns:minmax(0,1fr) minmax(0,1fr);gap:14px}.pwml-card{background:var(--surface);border:1px solid var(--line);border-radius:12px;padding:14px}.pwml-row{display:flex;justify-content:space-between;gap:12px;align-items:center;padding:11px 4px;border-bottom:1px solid var(--line);cursor:pointer}.pwml-row:hover{background:var(--surface2)}.pwml-muted{color:var(--muted)}.pwml-time{font-family:var(--mono,monospace);font-weight:600}.pwml-laps{max-height:430px;overflow:auto}.pwml-detail{margin-top:0}.pwml-kpis{display:grid;grid-template-columns:repeat(4,minmax(0,1fr));gap:10px;margin-top:12px}.pwml-kpi{background:var(--surface2);border:1px solid var(--line);border-radius:10px;padding:10px}.pwml-kpi b{display:block;font-size:18px;margin-top:3px}.pwml-empty{padding:24px;text-align:center;color:var(--muted)}.pwml-back{margin-bottom:10px}@media(max-width:800px){.pwml-grid{grid-template-columns:1fr}.pwml-kpis{grid-template-columns:repeat(2,1fr)}}`;document.head.appendChild(s)}
async function sessions(box){
 if(!window.CP||!CP.acc||!CP.server||typeof cloudGet!=="function")return;
 box.innerHTML='<div class="panel pwml-empty">Loading sessions…</div>';
 try{
  const raw=await cloudGet("/api/sessions?limit=100&game="+encodeURIComponent(typeof aGame==="function"?aGame():""));
  const ss=(Array.isArray(raw)?raw:raw&&Array.isArray(raw.sessions)?raw.sessions:[]).filter(x=>x&&x.laps>0).sort((a,b)=>String(b.started||"").localeCompare(String(a.started||"")));
  const records=ss.filter(x=>Number(x.best)>0).sort((a,b)=>Number(a.best)-Number(b.best)).slice(0,8);
  box.innerHTML=`
  <div class="pwml">
   <div class="pwml-head"><div><h2 style="margin:0">My Laps</h2><div class="sub">Sessions and personal records</div></div><button class="btn small" id="pwmlRefresh">Refresh</button></div>
   <div class="pwml-grid">
    <div class="pwml-card"><h2>Sessions</h2><div class="pwml-laps">
     ${ss.length?ss.map(s=>`<div class="pwml-row" data-sid="${esc(s.id)}"><div><b>${esc(s.track||"Unknown track")}</b><div class="pwml-muted">${esc(s.track_config||"")} · ${esc(s.car||"")} · ${esc(s.game||"")}</div><div class="pwml-muted">${date(s.started)} · ${Number(s.laps||0)} laps</div></div><div class="pwml-time">${fmt(s.best)} ›</div></div>`).join(""):'<div class="pwml-empty">No sessions found.</div>'}
    </div></div>
    <div class="pwml-card"><h2>Records</h2><div class="pwml-laps">
     ${records.length?records.map((s,i)=>`<div class="pwml-row" data-sid="${esc(s.id)}" data-record="1"><div><b>#${i+1} · ${esc(s.track||"Unknown track")}</b><div class="pwml-muted">${esc(s.car||"")} · ${date(s.started)}</div></div><div class="pwml-time">${fmt(s.best)} ›</div></div>`).join(""):'<div class="pwml-empty">No records found.</div>'}
    </div></div>
   </div>
   <div id="pwmlDetail"></div>
  </div>`;
  $("#pwmlRefresh").onclick=()=>sessions(box);
  box.querySelectorAll("[data-sid]").forEach(x=>x.onclick=()=>sessionDetail(box,x.dataset.sid,x.dataset.record==="1"));
 }catch(e){box.innerHTML=`<div class="panel pwml-empty">${esc(e.message||"Unable to load laps.")}<br><button class="btn small" id="pwmlRetry">Retry</button></div>`;$("#pwmlRetry").onclick=()=>sessions(box)}
}
async function sessionDetail(box,id,record){
 const d=$("#pwmlDetail");if(!d)return;d.innerHTML='<div class="panel pwml-empty">Loading session…</div>';
 try{
  const j=await cloudGet("/api/sessions/"+encodeURIComponent(id).replace(/%3A/gi,":")),m=j.session||{};
  const ls=(j.laps||[]).filter(l=>Number(l.time)>0).sort((a,b)=>Number(a.n||0)-Number(b.n||0)),best=ls.reduce((a,b)=>!a||Number(b.time)<Number(a.time)?b:a,null);
  d.innerHTML=`<div class="panel pwml-detail"><button class="btn small pwml-back" id="pwmlBack">← Back to My Laps</button><h2 style="margin:0">${esc(m.track||"Session")}</h2><div class="pwml-muted">${esc(m.track_config||"")} · ${esc(m.car||"")} · ${date(m.started)}</div>
  <div class="pwml-kpis"><div class="pwml-kpi">Laps<b>${ls.length}</b></div><div class="pwml-kpi">Best<b>${fmt(best&&best.time)}</b></div><div class="pwml-kpi">Game<b>${esc(m.game||"—")}</b></div><div class="pwml-kpi">Session<b>${esc(m.type||m.session_type||"—")}</b></div></div>
  <h3 style="margin:18px 0 6px">Laps</h3><div class="pwml-laps">${ls.length?ls.map(l=>`<div class="pwml-row" data-lid="${esc(l.id)}"><div><b>Lap ${esc(l.n||"")}</b><div class="pwml-muted">${l.valid===false?"Invalid":"Valid"}</div></div><div class="pwml-time">${fmt(l.time)} ›</div></div>`).join(""):'<div class="pwml-empty">No laps in this session.</div>'}</div></div>`;
  $("#pwmlBack").onclick=()=>sessions(box);box.querySelectorAll("[data-lid]").forEach(x=>x.onclick=()=>lapDetail(box,id,x.dataset.lid));d.scrollIntoView({behavior:"smooth",block:"start"});if(record&&best)lapDetail(box,id,best.id);
 }catch(e){d.innerHTML=`<div class="panel pwml-empty">${esc(e.message||"Unable to load session.")}</div>`}
}
async function lapDetail(box,sid,lid){
 const d=$("#pwmlDetail");if(!d)return;d.innerHTML='<div class="panel pwml-empty">Loading lap…</div>';
 try{
  const l=await cloudGet("/api/laps/"+encodeURIComponent(lid).replace(/%3A/gi,":")),tr=l&&l.trace&&Array.isArray(l.trace.d)?l.trace.d:[],sp=tr.map(x=>Number(x[1])).filter(isFinite),mx=sp.length?Math.max(...sp):null;
  d.innerHTML=`<div class="panel pwml-detail"><button class="btn small pwml-back" id="pwmlLapBack">← Back to session</button><h2 style="margin:0">Lap ${esc(l.n||"")}</h2><div class="pwml-muted">${fmt(l.time)} · ${l.valid===false?"Invalid":"Valid"}</div><div class="pwml-kpis"><div class="pwml-kpi">Lap time<b>${fmt(l.time)}</b></div><div class="pwml-kpi">Trace points<b>${tr.length}</b></div><div class="pwml-kpi">Max speed<b>${mx==null?"—":mx.toFixed(1)}</b></div><div class="pwml-kpi">Sectors<b>${esc(Array.isArray(l.sectors)?l.sectors.length:"—")}</b></div></div><p class="note" style="margin-top:14px">Full lap telemetry is loaded. This lap can be used for comparison.</p></div>`;
  $("#pwmlLapBack").onclick=()=>sessionDetail(box,sid,false);d.scrollIntoView({behavior:"smooth",block:"start"});
 }catch(e){d.innerHTML=`<div class="panel pwml-empty">${esc(e.message||"Unable to load lap.")}</div>`}
}
function mount(){styles();const b=$("#cloudLapsBox");if(!b)return;const f=b.querySelector("iframe.cloudlaps");if(f){f.remove();sessions(b)}}
const mo=new MutationObserver(()=>{const b=$("#cloudLapsBox");if(b&&b.querySelector("iframe.cloudlaps"))mount()});
mo.observe(document.body,{childList:true,subtree:true});setTimeout(mount,300);
})();