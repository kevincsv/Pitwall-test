(function(){
"use strict";
if(window.__PW_MY_LAPS_V2)return; window.__PW_MY_LAPS_V2=true;
const $=s=>document.querySelector(s), esc2=v=>String(v==null?"":v).replace(/[&<>"]/g,m=>({"&":"&amp;","<":"&lt;",">":"&gt;",'"':"&quot;"}[m]));
const fmt2=t=>{const n=Number(t);if(!isFinite(n)||n<=0)return "—";const m=Math.floor(n/60),s=(n%60).toFixed(3).padStart(6,"0");return (m?m+":":"")+s};
const date2=v=>{try{return new Date(v).toLocaleString(undefined,{day:"numeric",month:"short",year:"numeric",hour:"2-digit",minute:"2-digit"})}catch(e){return ""}};
const tx2=(a,b)=>typeof Tx==="function"?Tx(a,b||a):a;
function css(){
 if($("#pwMyLapsCss"))return;
 const st=document.createElement("style");st.id="pwMyLapsCss";st.textContent=
 ".pwml{display:grid;gap:14px}.pwml-head{display:flex;justify-content:space-between;gap:12px;align-items:center}.pwml-grid{display:grid;grid-template-columns:minmax(0,1fr) minmax(0,1fr);gap:14px}.pwml-card{background:var(--surface);border:1px solid var(--line);border-radius:12px;padding:14px}.pwml-row{display:flex;justify-content:space-between;gap:12px;align-items:center;padding:11px 4px;border-bottom:1px solid var(--line);cursor:pointer}.pwml-row:last-child{border-bottom:0}.pwml-row:hover{background:var(--surface2)}.pwml-muted{color:var(--muted)}.pwml-time{font-family:var(--mono,monospace);font-weight:600}.pwml-detail{margin-top:2px}.pwml-kpis{display:grid;grid-template-columns:repeat(4,minmax(0,1fr));gap:10px;margin-top:12px}.pwml-kpi{background:var(--surface2);border:1px solid var(--line);border-radius:10px;padding:10px}.pwml-kpi b{display:block;font-size:18px;margin-top:3px}.pwml-laps{max-height:430px;overflow:auto}.pwml-back{margin-bottom:10px}.pwml-empty{padding:24px;text-align:center;color:var(--muted)}@media(max-width:800px){.pwml-grid{grid-template-columns:1fr}.pwml-kpis{grid-template-columns:repeat(2,1fr)}}";
 document.head.appendChild(st);
}
async function loadSessions(box){
 if(!window.CP||!CP.acc||!CP.server||typeof cloudGet!=="function")return;
 box.innerHTML='<div class="panel pwml-empty">Loading sessions…</div>';
 try{
  const raw=await cloudGet("/api/sessions?limit=100&game="+encodeURIComponent(typeof aGame==="function"?aGame():""));
  const ss=(Array.isArray(raw)?raw:(raw&&Array.isArray(raw.sessions)?raw.sessions:[])).filter(x=>x&&x.laps>0);
  ss.sort((a,b)=>String(b.started||"").localeCompare(String(a.started||"")));
  const records=[];
  ss.forEach(s=>{if(Number(s.best)>0)records.push({...s,recordTime:Number(s.best),recordKind:"Best lap"});});
  records.sort((a,b)=>a.recordTime-b.recordTime);
  const top=records.slice(0,8);
  box.innerHTML='<div class="pwml"><div class="pwml-head"><div><h2 style="margin:0">My Laps</h2><div class="sub">Sessions and personal records</div></div><button class="btn small" id="pwmlRefresh">Refresh</button></div>'+
   '<div class="pwml-grid"><div class="pwml-card"><h2>Sessions</h2><div class="pwml-laps">'+
   (ss.length?ss.map(s=>'<div class="pwml-row" data-sid="'+esc2(s.id)+'"><div><b>'+esc2(s.track||"Unknown track")+'</b><div class="pwml-muted">'+esc2(s.track_config||"")+" · "+esc2(s.car||"")+" · "+esc2(s.game||"")+'</div><div class="pwml-muted">'+date2(s.started)+" · "+Number(s.laps||0)+" laps</div></div><div class="pwml-time">'+esc2(s.best?fmt2(s.best):"—")+' ›</div></div>').join(""):'<div class="pwml-empty">No sessions found.</div>')+
   '</div></div><div class="pwml-card"><h2>Records</h2><div class="pwml-laps">'+
   (top.length?top.map((s,i)=>'<div class="pwml-row" data-sid="'+esc2(s.id)+'" data-record="1"><div><b>#'+(i+1)+" · "+esc2(s.track||"Unknown track")+'</b><div class="pwml-muted">'+esc2(s.car||"")+' · '+date2(s.started)+'</div></div><div class="pwml-time">'+fmt2(s.recordTime)+' ›</div></div>').join(""):'<div class="pwml-empty">No records found.</div>')+
   '</div></div></div><div id="pwmlDetail"></div></div>';
  $("#pwmlRefresh").onclick=()=>loadSessions(box);
  box.querySelectorAll("[data-sid]").forEach(x=>x.onclick=()=>loadSessionDetail(box,x.dataset.sid,x.dataset.record==="1"));
 }catch(e){box.innerHTML='<div class="panel pwml-empty">'+esc2(e.message||"Unable to load laps.")+'<br><button class="btn small" id="pwmlRetry">Retry</button></div>';$("#pwmlRetry").onclick=()=>loadSessions(box)}
}
async function loadSessionDetail(box,id,focusRecord){
 const detail=$("#pwmlDetail");if(!detail)return;
 detail.innerHTML='<div class="panel pwml-empty">Loading session…</div>';
 try{
  const j=await cloudGet("/api/sessions/"+encodeURIComponent(id).replace(/%3A/gi,":"));
  const meta=j.session||{};
  const ls=(j.laps||[]).filter(l=>Number(l.time)>0).sort((a,b)=>Number(a.n||0)-Number(b.n||0));
  const best=ls.reduce((a,b)=>!a||Number(b.time)<Number(a.time)?b:a,null);
  detail.innerHTML='<div class="panel pwml-detail"><button class="btn small pwml-back" id="pwmlBack">← Back to My Laps</button><h2 style="margin:0">'+esc2(meta.track||"Session")+'</h2><div class="pwml-muted">'+esc2(meta.track_config||"")+" · "+esc2(meta.car||"")+" · "+date2(meta.started)+'</div>'+
   '<div class="pwml-kpis"><div class="pwml-kpi">Laps<b>'+ls.length+'</b></div><div class="pwml-kpi">Best<b>'+fmt2(best&&best.time)+'</b></div><div class="pwml-kpi">Game<b>'+esc2(meta.game||"—")+'</b></div><div class="pwml-kpi">Session<b>'+esc2(meta.type||meta.session_type||"—")+'</b></div></div>'+
   '<h3 style="margin:18px 0 6px">Laps</h3><div class="pwml-laps">'+(ls.length?ls.map(l=>'<div class="pwml-row" data-lid="'+esc2(l.id)+'"><div><b>Lap '+esc2(l.n||"")+'</b><div class="pwml-muted">'+(l.valid===false?"Invalid":"Valid")+'</div></div><div class="pwml-time">'+fmt2(l.time)+' ›</div></div>').join(""):'<div class="pwml-empty">No laps in this session.</div>')+'</div></div>';
  $("#pwmlBack").onclick=()=>loadSessions(box);
  detail.scrollIntoView({behavior:"smooth",block:"start"});
  box.querySelectorAll("[data-lid]").forEach(x=>x.onclick=()=>loadLapDetail(box,id,x.dataset.lid));
  if(focusRecord&&best) loadLapDetail(box,id,best.id);
 }catch(e){detail.innerHTML='<div class="panel pwml-empty">'+esc2(e.message||"Unable to load session.")+'</div>'}
}
async function loadLapDetail(box,sid,lid){
 const detail=$("#pwmlDetail");if(!detail)return;
 detail.innerHTML='<div class="panel pwml-empty">Loading lap…</div>';
 try{
  const l=await cloudGet("/api/laps/"+encodeURIComponent(lid).replace(/%3A/gi,":"));
  const tr=l&&l.trace&&Array.isArray(l.trace.d)?l.trace.d:[];
  const vals=tr.map(x=>Number(x[0])).filter(isFinite);
  const speeds=tr.map(x=>Number(x[1])).filter(isFinite);
  const maxSpeed=speeds.length?Math.max(...speeds):null;
  detail.innerHTML='<div class="panel pwml-detail"><button class="btn small pwml-back" id="pwmlLapBack">← Back to session</button><h2 style="margin:0">Lap '+esc2(l.n||"")+'</h2><div class="pwml-muted">'+fmt2(l.time)+' · '+(l.valid===false?"Invalid":"Valid")+'</div>'+
   '<div class="pwml-kpis"><div class="pwml-kpi">Lap time<b>'+fmt2(l.time)+'</b></div><div class="pwml-kpi">Trace points<b>'+tr.length+'</b></div><div class="pwml-kpi">Max speed<b>'+esc2(maxSpeed==null?"—":maxSpeed.toFixed(1))+'</b></div><div class="pwml-kpi">Sectors<b>'+esc2(Array.isArray(l.sectors)?l.sectors.length:"—")+'</b></div></div>'+
   '<p class="note" style="margin-top:14px">This lap is loaded from your cloud telemetry. You can use it as the selected lap for comparison.</p></div>';
  $("#pwmlLapBack").onclick=()=>loadSessionDetail(box,sid,false);
  detail.scrollIntoView({behavior:"smooth",block:"start"});
 }catch(e){detail.innerHTML='<div class="panel pwml-empty">'+esc2(e.message||"Unable to load lap.")+'</div>'}
}
function mount(){
 css();
 const box=$("#cloudLapsBox");if(!box)return;
 const iframe=box.querySelector("iframe.cloudlaps");
 if(iframe){iframe.remove();loadSessions(box)}
}
const mo=new MutationObserver(()=>{const b=$("#cloudLapsBox");if(b&&b.querySelector("iframe.cloudlaps"))mount()});
mo.observe(document.body,{childList:true,subtree:true});
setTimeout(mount,300);
window.addEventListener("hashchange",()=>setTimeout(mount,100));
})();