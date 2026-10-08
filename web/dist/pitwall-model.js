/* Pitlane HQ model: one per car and track, learnt on the server from every real lap it knows
   (yours, shared or not; the shared ones; the rivals of your races). Its references are real laps:
   - the record: the fastest lap really driven;
   - the next level: for your pace, the lap of the driver just ahead (0.3–3 % faster).
   Here it feeds the coach and the lap analyzer: the record and the next level among the laps you can
   compare with, the coach's default reference, your pace among the drivers known here, and the lap
   list in purple. It has no panel of its own. */
(function(){
"use strict";
if(window.__PW_MODEL)return;window.__PW_MODEL=true;
const $=s=>document.querySelector(s);
const TX=(...a)=>typeof Tx==="function"?Tx(...a):a[0];
const game=()=>typeof aGame==="function"?aGame():"iracing";
const url=u=>typeof withGame==="function"?withGame(u,game()):u;
const COMBOS={g:"",list:null,p:null},MODEL={key:"",busy:false,data:null,err:"",at:0,p:null};

/* ---------- which car and track: ids from the community list, by name ---------- */
const norm=s=>String(s||"").toLowerCase().replace(/\s+/g," ").trim();
function combos(){const g=game();if(COMBOS.list&&COMBOS.g===g)return Promise.resolve(COMBOS.list);if(COMBOS.p&&COMBOS.g===g)return COMBOS.p;
  COMBOS.g=g;COMBOS.list=null;COMBOS.p=cget(url("/api/community/combos")).then(r=>r.combos||[]).catch(()=>[]).then(l=>{COMBOS.list=l;COMBOS.p=null;return l});return COMBOS.p}
/* the car and track of a lap, with what is already loaded (null while the list loads, or when unknown) */
function comboSync(lap){
  if(!lap)return null;
  if(!lap.cloud&&!lap.comm&&typeof S!=="undefined"&&S.WeekendInfo&&S.WeekendInfo.TrackID&&typeof myDriver==="function"&&myDriver().CarID)return{trackId:S.WeekendInfo.TrackID,carId:myDriver().CarID};
  if(lap.trackId&&lap.carId)return{trackId:lap.trackId,carId:lap.carId};
  if(!lap.track||!COMBOS.list||COMBOS.g!==game())return null;
  const list=COMBOS.list,tr=norm(lap.track),full=norm(lap.track+(lap.track_config?" · "+lap.track_config:"")),car=norm(lap.car);
  const hit=list.find(c=>norm(c.car)===car&&norm(c.track)===full)||list.find(c=>norm(c.car)===car&&norm(c.track).startsWith(tr))||list.find(c=>norm(c.car)===car&&norm(c.track).split(" · ")[0]===tr);
  return hit?{trackId:hit.trackId,carId:hit.carId}:null}
async function comboOf(lap){if(!lap)return null;await combos();return comboSync(lap)}
const keyOf=c=>game()+":"+c.trackId+":"+c.carId;

/* ---------- the model of one car and track, as the server learnt it ---------- */
/* the record lap, the next level at every pace (real laps, one bin in two) and the pace of every driver it knows */
const up=bins=>{const out=[];bins.forEach((b,i)=>{const nx=bins[i+1];out.push([b[0],b[1],b[2],b[3],b[4],0,null]);out.push(nx?[(b[0]+nx[0])/2,(b[1]+nx[1])/2,b[2],b[3],b[4],0,null]:[b[0],b[1],b[2],b[3],b[4],0,null])});return out};
function buildModel(c){
  const key=keyOf(c);
  if(MODEL.key===key&&(MODEL.data||MODEL.busy)&&Date.now()-(MODEL.at||0)<300000)return MODEL.busy?MODEL.p:Promise.resolve(MODEL.data);
  MODEL.key=key;MODEL.busy=true;MODEL.err="";MODEL.data=null;MODEL.at=Date.now();
  MODEL.p=(async()=>{
    try{
      const r=await cget(url(`/api/community/model?trackId=${c.trackId}&carId=${c.carId}`));
      MODEL.data={key,trackId:c.trackId,carId:c.carId,n:r.n||0,drivers:r.drivers||0,total:r.shared||0,fastShared:r.fastShared||null,M:r.M,nb:r.nb,pool:r.pool,idealTime:r.idealTime,built:r.built,
        times:r.times||[],ideal:(r.ideal||[]).map(b=>[b[0],b[1],b[2],b[3],b[4],b[5],null]),ladder:(r.ladder||[]).map(x=>({time:x.time,n:x.n,upTo:x.upTo,seg:x.seg,bins:null,raw:x.bins}))}}
    catch(e){MODEL.err=e.message}
    MODEL.busy=false;return MODEL.data})();
  return MODEL.p}
/* the model of a lap's car and track when it is already here; null while it loads or when there is none */
function current(lap){const c=comboSync(lap);if(!c)return null;const m=MODEL.data;return m&&!MODEL.busy&&m.key===keyOf(c)?m:null}
/* whether the model of this lap is still on its way (the car and track list, or the model itself) */
/* why there is no model for this lap: the community could not be reached (its message), or "" */
function error(lap){const c=comboSync(lap);return c&&MODEL.key===keyOf(c)&&!MODEL.busy&&!MODEL.data?MODEL.err||"":""}
function loading(lap){if(!lap)return false;if(!COMBOS.list||COMBOS.g!==game())return true;const c=comboSync(lap);return !!c&&MODEL.key===keyOf(c)&&MODEL.busy}
async function modelFor(lap){const c=await comboOf(lap);if(!c)return null;return await buildModel(c)}

/* the record lap (the fastest lap really driven) as a lap you can compare with */
function idealLap(m){if(!m||!m.ideal||!m.ideal.length)return null;
  return{n:"★ "+TX("Record","Récord","Rekord","Recorde"),alias:TX("Record (real lap)","Récord (vuelta real)","Rekord (echte Runde)","Recorde (volta real)"),name:TX("Record (real lap)","Récord (vuelta real)","Rekord (echte Runde)","Recorde (volta real)"),time:m.idealTime,bins:m.ideal,maxBin:m.ideal.length-1,comm:true,model:"ideal"}}
/* where a lap time stands among the drivers the model knows: 1 = the fastest */
function rankOf(m,t){const T=(m&&m.times)||[];if(!T.length||!(t>0))return null;return{pos:T.filter(x=>x<t).length+1,of:T.length+(T.some(x=>Math.abs(x-t)<0.002)?0:1)}}
/* the next level for a lap time: the real lap of the driver just ahead (0.3–3 % faster) */
function refFor(m,t){const L=(m&&m.ladder)||[];if(!L.length)return null;let i=L.findIndex(x=>t<=x.upTo);if(i<0)i=L.length-1;
  while(i>0&&!(L[i].time<t*0.997))i--; // the driver just ahead is really ahead (not this very lap)
  const x=L[i];if(!x.bins)x.bins=up(x.raw).slice(0,m.nb);return x}
function levelLap(m,t){const x=refFor(m,t);if(!x)return null;
  return{n:"▲ "+TX("Next level","Siguiente nivel","Nächstes Level","Próximo nível"),alias:TX("Next level (the driver just ahead)","Siguiente nivel (el piloto justo por delante)","Nächstes Level (der Fahrer knapp vor dir)","Próximo nível (o piloto logo à frente)"),name:TX("Next level (the driver just ahead)","Siguiente nivel (el piloto justo por delante)","Nächstes Level (der Fahrer knapp vor dir)","Próximo nível (o piloto logo à frente)"),time:x.time,bins:x.bins,maxBin:x.bins.length-1,comm:true,model:"level"}}
/* the references of a lap: the record (unless this lap is it) and the next level (when someone is ahead) */
function refsFor(m,A){if(!m||!A)return{rec:null,level:null};const rec=idealLap(m),lv=levelLap(m,A.time);
  return{rec:rec&&Math.abs(rec.time-A.time)>=0.002?rec:null,level:lv&&lv.time<A.time-0.001?lv:null}}

/* ---------- lap list and sectors in purple, like the sims ---------- */
function colourLapTable(LP){const tb=$("#lapTable tbody"),th=$("#lapTable thead tr");if(!tb||!th||!LP||!LP.length)return;
  const ns=Math.max(0,...LP.map(l=>Array.isArray(l.sectors)?l.sectors.length:0));if(!th.dataset.sec){th.dataset.sec="1";th.insertAdjacentHTML("beforeend",[1,2,3,4,5].map(i=>`<th class="r sec-h" data-s="${i}">S${i}</th>`).join(""))}
  th.querySelectorAll(".sec-h").forEach(h=>h.hidden=+h.dataset.s>ns);
  const valid=LP.filter(l=>l.valid!==false),bestT=Math.min(...valid.map(l=>l.time)),bestS=[];for(let i=0;i<ns;i++)bestS[i]=Math.min(...valid.map(l=>l.sectors&&l.sectors[i]>0?l.sectors[i]:1e9));
  const rows=LP.slice().reverse();[...tb.rows].forEach((tr,ri)=>{const l=rows[ri];if(!l)return;tr.classList.toggle("lap-invalid",l.valid===false);const t=tr.cells[1];if(t)t.classList.toggle("pb",l.valid!==false&&l.time===bestT);
    tr.querySelectorAll(".sec-c").forEach(c=>c.remove());for(let i=0;i<5;i++){if(i>=ns)break;const v=l.sectors&&l.sectors[i];tr.insertAdjacentHTML("beforeend",`<td class="r mono sec-c ${v>0&&l.valid!==false&&v===bestS[i]?"pb":""}">${v>0?(+v).toFixed(3):"–"}</td>`)}})}

/* ---------- into the analyzer and the coach ---------- */
/* the analyzer's B list keeps one entry per model reference (CREF, the "c<i>" options), replaced in place so a
   chosen reference keeps its place; marked stale when lap A is of a car and track the model does not know */
function syncRefs(m,A){if(typeof CREF==="undefined")return false;let changed=false;
  const r=refsFor(m,A),want=[r.rec,r.level].filter(Boolean);
  CREF.forEach((x,i)=>{if(!x||!x.model)return;const w=want.find(y=>y.model===x.model);
    if(w){const same=!x.stale&&x.time===w.time&&x.key===m.key;CREF[i]=Object.assign(w,{key:m.key});if(!same)changed=true}else if(!x.stale){x.stale=true;changed=true}});
  want.forEach(w=>{if(!CREF.some(x=>x&&x.model===w.model)){CREF.push(Object.assign(w,{key:m.key}));changed=true}});
  return changed}
let lapsKey="",coachKey="";
const origLaps=window.renderLaps;
if(typeof origLaps==="function")window.renderLaps=function(){const r=origLaps.apply(this,arguments);try{
    const LP=typeof analysisLaps==="function"?analysisLaps():[];colourLapTable(LP);
    const A=typeof lapOf==="function"?lapOf($("#lapA")&&$("#lapA").value):null;if(!A||A.comm)return r;
    // once the model is here (or lap A changes), the record and the next level join the B laps: one more render then
    modelFor(A).then(m=>{const k=(m?m.key:"none")+"|"+A.time;if(k===lapsKey)return;lapsKey=k;if(syncRefs(m,A))window.renderLaps()}).catch(()=>{})}catch(e){console.warn(e)}return r};
const origCoach=window.renderCoach;
if(typeof origCoach==="function")window.renderCoach=function(){const r=origCoach.apply(this,arguments);try{
    const A=window.COACH_A;if(!A||A.comm)return r;
    // the coach reads the model as it renders (PW_MODEL.current); when the model arrives it renders once more
    modelFor(A).then(m=>{const k=(m?m.key:"none")+"|"+A.time;if(k===coachKey)return;coachKey=k;window.renderCoach()}).catch(()=>{})}catch(e){console.warn(e)}return r};
const st=document.createElement("style");st.textContent=`.pb,.pb-t{color:var(--pb)!important;font-weight:700}tr.lap-invalid td{opacity:.5;text-decoration:line-through}tr.lap-invalid td:last-child .pill{text-decoration:none}`;document.head.appendChild(st);
window.PW_MODEL={buildModel,modelFor,current,loading,error,idealLap,levelLap,refsFor,rankOf,comboOf};
})();
