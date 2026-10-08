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
const COMBOS={g:"",list:null,p:null},MODEL={key:"",busy:false,data:null,err:"",at:0,p:null},CARD={id:0,data:null,busy:false,at:0,p:null};

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
/* a reference's line kept one point in two: back to every 5 m, like up() does with its bins */
const upXY=(x,y,nb)=>{if(!Array.isArray(x)||!Array.isArray(y)||x.length<6)return null;const ox=[],oy=[];x.forEach((v,i)=>{const nx=i+1<x.length?i+1:i;ox.push(v,(v+x[nx])/2);oy.push(y[i],(y[i]+y[nx])/2)});return{x:ox.slice(0,nb),y:oy.slice(0,nb)}};
const up=bins=>{const out=[];bins.forEach((b,i)=>{const nx=bins[i+1];out.push([b[0],b[1],b[2],b[3],b[4],0,null]);out.push(nx?[(b[0]+nx[0])/2,(b[1]+nx[1])/2,b[2],b[3],b[4],0,null]:[b[0],b[1],b[2],b[3],b[4],0,null])});return out};
function buildModel(c){
  const key=keyOf(c);
  if(MODEL.key===key&&(MODEL.data||MODEL.busy)&&Date.now()-(MODEL.at||0)<300000)return MODEL.busy?MODEL.p:Promise.resolve(MODEL.data);
  MODEL.key=key;MODEL.busy=true;MODEL.err="";MODEL.data=null;MODEL.at=Date.now();
  MODEL.p=(async()=>{
    try{
      const r=await cget(url(`/api/community/model?trackId=${c.trackId}&carId=${c.carId}`));
      if(r.car&&r.car.n){CARD.id=c.carId;CARD.data=r.car;CARD.busy=false;CARD.at=Date.now()} // the car card came with the model
      MODEL.data={key,trackId:c.trackId,carId:c.carId,n:r.n||0,drivers:r.drivers||0,total:r.shared||0,fastShared:r.fastShared||null,M:r.M,nb:r.nb,pool:r.pool,idealTime:r.idealTime,built:r.built,
        times:r.times||[],ideal:(r.ideal||[]).map(b=>[b[0],b[1],b[2],b[3],b[4],b[5],null]),idealXY:r.idealXY&&Array.isArray(r.idealXY.x)?r.idealXY:null,lineXY:r.lineXY&&Array.isArray(r.lineXY.x)?r.lineXY:null,ladder:(r.ladder||[]).map(x=>({time:x.time,n:x.n,upTo:x.upTo,seg:x.seg,bins:null,raw:x.bins,rx:x.x,ry:x.y}))}}
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
  return{n:"★ "+TX("Record","Récord","Rekord","Recorde"),alias:TX("Record (real lap)","Récord (vuelta real)","Rekord (echte Runde)","Recorde (volta real)"),name:TX("Record (real lap)","Récord (vuelta real)","Rekord (echte Runde)","Recorde (volta real)"),time:m.idealTime,bins:m.ideal,maxBin:m.ideal.length-1,xy:m.idealXY||m.lineXY,comm:true,model:"ideal"}}
/* where a lap time stands among the drivers the model knows: 1 = the fastest */
function rankOf(m,t){const T=(m&&m.times)||[];if(!T.length||!(t>0))return null;return{pos:T.filter(x=>x<t).length+1,of:T.length+(T.some(x=>Math.abs(x-t)<0.002)?0:1)}}
/* the next level for a lap time: the real lap of the driver just ahead (0.3–3 % faster) */
function refFor(m,t){const L=(m&&m.ladder)||[];if(!L.length)return null;let i=L.findIndex(x=>t<=x.upTo);if(i<0)i=L.length-1;
  while(i>0&&!(L[i].time<t*0.997))i--; // the driver just ahead is really ahead (not this very lap)
  const x=L[i];if(!x.bins){x.bins=up(x.raw).slice(0,m.nb);x.xy=upXY(x.rx,x.ry,m.nb)}return x}
function levelLap(m,t){const x=refFor(m,t);if(!x)return null;
  return{n:"▲ "+TX("Next level","Siguiente nivel","Nächstes Level","Próximo nível"),alias:TX("Next level (the driver just ahead)","Siguiente nivel (el piloto justo por delante)","Nächstes Level (der Fahrer knapp vor dir)","Próximo nível (o piloto logo à frente)"),name:TX("Next level (the driver just ahead)","Siguiente nivel (el piloto justo por delante)","Nächstes Level (der Fahrer knapp vor dir)","Próximo nível (o piloto logo à frente)"),time:x.time,bins:x.bins,maxBin:x.bins.length-1,xy:x.xy||m.lineXY||null,comm:true,model:"level"}}
/* the references of a lap: the record (unless this lap is it) and the next level (when someone is ahead) */
function refsFor(m,A){if(!m||!A)return{rec:null,level:null};const rec=idealLap(m),lv=levelLap(m,A.time);
  return{rec:rec&&Math.abs(rec.time-A.time)>=0.002?rec:null,level:lv&&lv.time<A.time-0.001?lv:null}}

/* ---------- the car card: what this car does on other tracks ---------- */
/* one lap's facts, as the server reads them: its hardest braking (m/s², the top 5 % of its braking), the
   speed it shifted up at in every gear (the highest point it took the gear to), its top speed */
function lapFacts(bins){const dec=[],shifts={};let vmax=0,geared=false;
  for(let i=0;i+1<bins.length;i++){const a=bins[i],b=bins[i+1];if(!a||!b)continue;if(a[0]>vmax)vmax=a[0];if(a[4]>=1)geared=true;
    const dt=b[1]-a[1];if(dt>0.01&&dt<2&&a[3]>=0.5&&a[0]>12&&a[0]>b[0])dec.push((a[0]-b[0])/dt);
    if(a[4]>=1&&b[4]===a[4]+1&&a[0]>5)shifts[a[4]]=Math.max(shifts[a[4]]||0,a[0])}
  dec.sort((x,y)=>x-y);return{brake:dec.length>=5?dec[Math.min(dec.length-1,Math.floor(0.95*(dec.length-1)+0.5))]:null,shifts:geared?shifts:null,vmax}}
/* the car of a lap, by its id or its name alone: the card needs no track, so a car and track nobody known
   drove yet (the very case the card is for) still finds its car among the cars the community knows */
function carIdSync(lap){if(!lap)return 0;const c=comboSync(lap);if(c)return c.carId;if(lap.carId)return lap.carId;
  const car=norm(lap.car);if(!car||!COMBOS.list||COMBOS.g!==game())return 0;const hit=COMBOS.list.find(x=>norm(x.car)===car);return hit?hit.carId:0}
function loadCard(id){if(!id)return Promise.resolve(null);
  if(CARD.id===id&&(CARD.data||CARD.busy)&&Date.now()-(CARD.at||0)<300000)return CARD.busy?CARD.p:Promise.resolve(CARD.data);
  CARD.id=id;CARD.busy=true;CARD.data=null;CARD.at=Date.now();
  CARD.p=cget(url(`/api/community/car?carId=${id}`)).then(r=>r&&r.n?r:null).catch(()=>null).then(k=>{if(CARD.id===id){CARD.data=k;CARD.busy=false}return k});return CARD.p}
async function cardFor(lap){if(!lap||lap.comm)return null;await combos();return loadCard(carIdSync(lap))}
/* the card of lap A's car when it is already here (as the server learnt it on every track), with what lap A did */
function carCard(A){if(!A||!Array.isArray(A.bins))return null;const id=carIdSync(A),k=id&&CARD.id===id&&!CARD.busy?CARD.data:null;return k?{card:k,mine:lapFacts(A.bins)}:null}

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
let lapsKey="",coachKey="",cardKey="";
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
    modelFor(A).then(m=>{const k=(m?m.key:"none")+"|"+A.time;if(k===coachKey)return;coachKey=k;window.renderCoach()}).catch(()=>{});
    // the car card the same way: once it is here, the coach renders once more
    cardFor(A).then(c=>{const k=(c?c.carId+":"+c.built:"none")+"|"+A.time;if(k===cardKey)return;cardKey=k;if(c)window.renderCoach()}).catch(()=>{})}catch(e){console.warn(e)}return r};
const st=document.createElement("style");st.textContent=`.pb,.pb-t{color:var(--pb)!important;font-weight:700}tr.lap-invalid td{opacity:.5;text-decoration:line-through}tr.lap-invalid td:last-child .pill{text-decoration:none}`;document.head.appendChild(st);
window.PW_MODEL={buildModel,modelFor,current,loading,error,idealLap,levelLap,refsFor,rankOf,comboOf,carCard,cardFor,lapFacts};
})();
