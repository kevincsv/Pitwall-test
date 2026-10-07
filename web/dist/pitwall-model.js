/* TrackIQ community model: learns each car and track from every lap people share.
   - Ideal lap: the fastest micro-sector of every shared lap, stitched together.
   - Next level: the drivers just ahead of your pace (0.3–3 % faster), averaged bin by bin,
     so the target is reachable and gets sharper as more laps of every speed arrive.
   - Where you lose time against that group, why (braking, corner speed, exit), the lap
     list and sectors in purple like the sims, and the track map coloured by gain and loss.
   Everything runs here, on the laps the server already has: no PC needed. */
(function(){
"use strict";
if(window.__PW_MODEL)return;window.__PW_MODEL=true;
const $=s=>document.querySelector(s);
const TX=(...a)=>typeof Tx==="function"?Tx(...a):a[0];
const E=s=>typeof esc==="function"?esc(s):String(s);
const FT=t=>typeof fmtT==="function"?fmtT(t):(+t).toFixed(3);
const SEG_M=250;           // metres per micro-sector (long enough that noise does not add up)
const MAX_TRACES=24;       // laps the model reads per car and track
const IDEAL_MAX=0.005;     // the ideal lap is never more than 0.5 % faster than the fastest real lap
const TRACE_CACHE=new Map(),COMBOS={g:"",list:null},MAPS=new Map();
const MODEL={key:"",busy:false,data:null,err:""};

/* ---------- lap helpers: bins are [speed m/s, lap time s, throttle, brake, gear, steer] every 5 m ---------- */
const binsOf=tr=>tr.d.map(x=>[x[0],x[5],x[1],x[2],x[3],x[4],null]);
const tAt=(l,i)=>{const b=l.bins[Math.min(i,l.bins.length-1)];return b?b[1]:null};
function segTimes(l,M,n){const out=[];const step=n/M;for(let k=0;k<M;k++){const s=Math.round(k*step),e=k===M-1?n-1:Math.round((k+1)*step);const a=tAt(l,s),b=k===M-1?l.time:tAt(l,e);out.push(a!=null&&b!=null&&b>a?b-a:null)}return out}
const median=a=>{const v=a.filter(x=>x!=null&&isFinite(x)).sort((x,y)=>x-y);if(!v.length)return null;const m=v.length>>1;return v.length%2?v[m]:(v[m-1]+v[m])/2};

/* ---------- which car and track: ids from the community list, by name ---------- */
const norm=s=>String(s||"").toLowerCase().replace(/\s+/g," ").trim();
async function combos(){const g=typeof aGame==="function"?aGame():"iracing";if(COMBOS.list&&COMBOS.g===g)return COMBOS.list;
  try{COMBOS.list=(await cget("/api/community/combos")).combos||[];COMBOS.g=g}catch(e){COMBOS.list=[]}return COMBOS.list}
async function comboOf(lap){
  if(!lap)return null;
  if(!lap.cloud&&!lap.comm&&typeof S!=="undefined"&&S.WeekendInfo&&S.WeekendInfo.TrackID&&typeof myDriver==="function"&&myDriver().CarID)return{trackId:S.WeekendInfo.TrackID,carId:myDriver().CarID};
  if(lap.trackId&&lap.carId)return{trackId:lap.trackId,carId:lap.carId};
  if(!lap.track)return null;
  const list=await combos(),tr=norm(lap.track),full=norm(lap.track+(lap.track_config?" · "+lap.track_config:"")),car=norm(lap.car);
  const hit=list.find(c=>norm(c.car)===car&&norm(c.track)===full)||list.find(c=>norm(c.car)===car&&norm(c.track).startsWith(tr))||list.find(c=>norm(c.car)===car&&norm(c.track).split(" · ")[0]===tr);
  return hit?{trackId:hit.trackId,carId:hit.carId}:null}

/* ---------- the model of one car and track ---------- */
async function trace(id){if(TRACE_CACHE.has(id))return TRACE_CACHE.get(id);const p=cget("/api/community/laps?id="+encodeURIComponent(id)).then(l=>l&&l.trace&&l.trace.d&&l.trace.d.length?{id,alias:l.alias||"",time:l.time,bins:binsOf(l.trace),comm:true}:null).catch(()=>null);TRACE_CACHE.set(id,p);return p}
function pickLaps(list){const w=list.filter(l=>l.hasTrace!==false&&l.time>0).sort((a,b)=>a.time-b.time);if(w.length<=MAX_TRACES)return w;
  // the fastest ones and an even spread of every other pace
  const out=w.slice(0,8),rest=w.slice(8),step=rest.length/(MAX_TRACES-8);for(let i=0;i<MAX_TRACES-8;i++)out.push(rest[Math.floor(i*step)]);return out}
async function buildModel(c){
  const key=(typeof aGame==="function"?aGame():"")+":"+c.trackId+":"+c.carId;
  if(MODEL.key===key&&(MODEL.data||MODEL.busy))return MODEL.data;
  MODEL.key=key;MODEL.busy=true;MODEL.err="";MODEL.data=null;
  try{
    const list=(await cget(`/api/community/laps?trackId=${c.trackId}&carId=${c.carId}`)).laps||[];
    const laps=(await Promise.all(pickLaps(list).map(l=>trace(l.id)))).filter(Boolean);
    if(laps.length<2){MODEL.data={key,n:laps.length,drivers:new Set(laps.map(l=>l.alias)).size,total:list.length,laps};return MODEL.data}
    const n=Math.min(...laps.map(l=>l.bins.length)),M=Math.max(8,Math.round(n*5/SEG_M));
    laps.forEach(l=>{l.seg=segTimes(l,M,n)});
    // ideal: the quickest of each micro-sector, with whose lap it came from
    // A realistic ideal, not a fantasy: only laps close to the fastest one (within 2 %) count,
    // each micro-sector takes the median of its best three (mean of two with fewer laps),
    // and the result is never more than IDEAL_MAX below the fastest lap really driven.
    const fastest=laps.reduce((a,b)=>b.time<a.time?b:a),pool=laps.filter(l=>l.time<=fastest.time*1.02);
    const best=[];for(let k=0;k<M;k++){const v=pool.map(l=>({v:l.seg[k],l})).filter(x=>x.v!=null).sort((a,b)=>a.v-b.v);if(!v.length){best.push(null);continue}
      const top=v.slice(0,v.length>=5?3:v.length>=2?2:1),mid=top.length===3?top[1].v:top.reduce((s,x)=>s+x.v,0)/top.length;best.push({v:mid,l:top[0].l})}
    let idealTime=best.reduce((s,b)=>s+(b?b.v:0),0);
    const floor=fastest.time*(1-IDEAL_MAX);if(idealTime<floor){const f=(fastest.time-floor)/Math.max(1e-6,fastest.time-idealTime);best.forEach((b,k)=>{if(b&&fastest.seg[k]!=null)b.v=fastest.seg[k]-(fastest.seg[k]-b.v)*f});idealTime=best.reduce((s,b)=>s+(b?b.v:0),0)}
    MODEL.data={key,trackId:c.trackId,carId:c.carId,n:laps.length,total:list.length,drivers:new Set(laps.map(l=>l.alias)).size,laps,M,nb:n,best,idealTime,fastest,pool:pool.length};
  }catch(e){MODEL.err=e.message}
  MODEL.busy=false;return MODEL.data}

/* the ideal lap as a lap you can compare with: the quickest micro-sector of each lap, stitched */
function idealLap(m){const bins=[];let off=0;const step=m.nb/m.M;
  for(let k=0;k<m.M;k++){const b=m.best[k];if(!b)continue;const s=Math.round(k*step),e=k===m.M-1?m.nb:Math.round((k+1)*step),t0=tAt(b.l,s);
    const raw=b.l.seg[k]||b.v,f=raw>0?b.v/raw:1;
    for(let i=s;i<e;i++){const x=b.l.bins[i];if(!x)continue;bins[i]=[x[0]/f,off+(x[1]-t0)*f,x[2],x[3],x[4],x[5],null]}off+=b.v}
  for(let i=0;i<m.nb;i++)if(!bins[i])bins[i]=bins[i-1]||[0,0,0,0,0,0,null];
  return{n:"★ "+TX("Realistic ideal","Ideal realista","Realistisches Ideal","Ideal realista"),alias:TX("Realistic ideal","Ideal realista","Realistisches Ideal","Ideal realista"),time:m.idealTime,bins,maxBin:bins.length-1,comm:true,model:"ideal"}}
/* the next level: drivers 0.3–3 % faster than this lap, averaged bin by bin */
function groupFor(m,t){let g=m.laps.filter(l=>l.time<t*0.997&&l.time>t*0.97);
  if(g.length<2)g=m.laps.filter(l=>l.time<t).sort((a,b)=>b.time-a.time).slice(0,3);
  if(!g.length)g=m.laps.slice().sort((a,b)=>a.time-b.time).slice(0,3);return g}
function levelLap(m,t){const g=groupFor(m,t);if(!g.length)return null;const bins=[];let time=0;
  for(let i=0;i<m.nb;i++){const v=median(g.map(l=>l.bins[i]&&l.bins[i][0]))||0.1,th=median(g.map(l=>l.bins[i]&&l.bins[i][2])),br=median(g.map(l=>l.bins[i]&&l.bins[i][3])),gr=median(g.map(l=>l.bins[i]&&l.bins[i][4]));
    bins.push([v,time,th||0,br||0,Math.round(gr||0),0,null]);time+=5/Math.max(v,1)}
  const target=median(g.map(l=>l.time)),sc=target/time;bins.forEach(b=>b[1]*=sc);
  return{n:"▲ "+TX("Next level","Siguiente nivel","Nächstes Level","Próximo nível"),alias:TX("Next level","Siguiente nivel","Nächstes Level","Próximo nível")+" ("+g.length+")",time:target,bins,maxBin:bins.length-1,comm:true,model:"level",group:g}}

/* where this lap loses time against the next level, and why */
function insights(m,A){const g=groupFor(m,A.time);if(!g.length)return[];const segA=segTimes(A,m.M,Math.min(m.nb,A.bins.length));const step=m.nb/m.M,out=[];
  for(let k=0;k<m.M;k++){const ref=median(g.map(l=>l.seg[k]));if(segA[k]==null||ref==null)continue;const lost=segA[k]-ref;if(lost<.04)continue;
    const s=Math.round(k*step),e=Math.min(A.bins.length,Math.round((k+1)*step));
    const brakeAt=l=>{for(let i=s;i<e;i++){const b=l.bins[i];if(b&&b[3]>.3)return i}return null},minV=l=>{let v=1e9;for(let i=s;i<e;i++){const b=l.bins[i];if(b)v=Math.min(v,b[0])}return v<1e9?v:null},
      thrAt=l=>{const mi=(()=>{let v=1e9,j=s;for(let i=s;i<e;i++){const b=l.bins[i];if(b&&b[0]<v){v=b[0];j=i}}return j})();for(let i=mi;i<e;i++){const b=l.bins[i];if(b&&b[2]>.9)return i-mi}return null};
    const ba=brakeAt(A),bg=median(g.map(brakeAt)),va=minV(A),vg=median(g.map(minV)),ta=thrAt(A),tg=median(g.map(thrAt));
    let tip;
    if(ba!=null&&bg!=null&&(bg-ba)*5>=10)tip=TX(`brake ${Math.round((bg-ba)*5)} m later`,`frena ${Math.round((bg-ba)*5)} m más tarde`,`${Math.round((bg-ba)*5)} m später bremsen`,`frear ${Math.round((bg-ba)*5)} m mais tarde`);
    else if(va!=null&&vg!=null&&(vg-va)*3.6>=3)tip=TX(`carry ${Math.round((vg-va)*3.6)} km/h more through the corner`,`pasa ${Math.round((vg-va)*3.6)} km/h más rápido por la curva`,`${Math.round((vg-va)*3.6)} km/h mehr Kurvengeschwindigkeit`,`passe ${Math.round((vg-va)*3.6)} km/h mais rápido pela curva`);
    else if(ta!=null&&tg!=null&&(ta-tg)*5>=10)tip=TX(`full throttle ${Math.round((ta-tg)*5)} m earlier on the exit`,`acelera a fondo ${Math.round((ta-tg)*5)} m antes a la salida`,`${Math.round((ta-tg)*5)} m früher Vollgas am Ausgang`,`acelere tudo ${Math.round((ta-tg)*5)} m antes na saída`);
    else tip=TX("smoother and faster through this part","más fino y rápido en este tramo","sauberer und schneller durch diesen Teil","mais limpo e rápido neste trecho");
    out.push({k,at:Math.round(s*5),lost,tip})}
  return out.sort((a,b)=>b.lost-a.lost).slice(0,4)}

/* ---------- track map coloured by where A gains or loses against B ---------- */
async function outline(trackId){if(MAPS.has(trackId))return MAPS.get(trackId);const g=typeof aGame==="function"?aGame():"iracing";
  const p=fetch("/api/trackmap?trackId="+trackId+"&game="+g).then(r=>r.ok?r.json():null).then(c=>c&&Array.isArray(c.x)&&c.x.length>20?c:null).catch(()=>null);MAPS.set(trackId,p);return p}
function drawMap(cv,o,A,B,M){const W=cv.clientWidth||600,H=cv.height=Math.round(Math.min(360,Math.max(220,W*.55)));cv.width=W;const x=cv.getContext("2d");x.clearRect(0,0,W,H);
  const X=o.x,Y=o.y,n=X.length;let a=1e9,b=-1e9,c=1e9,d=-1e9;for(let i=0;i<n;i++){a=Math.min(a,X[i]);b=Math.max(b,X[i]);c=Math.min(c,Y[i]);d=Math.max(d,Y[i])}
  const sc=Math.min((W-30)/(b-a||1),(H-30)/(d-c||1)),ox=(W-(b-a)*sc)/2,oy=(H-(d-c)*sc)/2,P=i=>[ox+(X[i]-a)*sc,H-(oy+(Y[i]-c)*sc)];
  const nb=Math.min(A.bins.length,B.bins.length),sa=segTimes(A,M,nb),sb=segTimes(B,M,nb),css=v=>getComputedStyle(document.documentElement).getPropertyValue(v).trim()||"#888";
  x.lineCap="round";x.lineWidth=9;x.strokeStyle=css("--line");x.beginPath();for(let i=0;i<=n;i++){const p=P(i%n);i?x.lineTo(p[0],p[1]):x.moveTo(p[0],p[1])}x.stroke();
  x.lineWidth=5;for(let i=0;i<n;i++){const k=Math.min(M-1,Math.floor(i/n*M)),dd=sa[k]!=null&&sb[k]!=null?sa[k]-sb[k]:0,f=Math.min(1,Math.abs(dd)/.15);
    x.strokeStyle=Math.abs(dd)<.01?css("--muted"):dd>0?`rgba(255,99,99,${.35+.65*f})`:`rgba(56,201,124,${.35+.65*f})`;const p=P(i),q=P((i+1)%n);x.beginPath();x.moveTo(p[0],p[1]);x.lineTo(q[0],q[1]);x.stroke()}
  const s=P(0);x.fillStyle=css("--fg");x.beginPath();x.arc(s[0],s[1],5,0,7);x.fill();x.font="600 11px "+(css("--f-data")||"monospace");x.fillText("S/F",s[0]+8,s[1]-6)}

/* ---------- lap list and sectors in purple, like the sims ---------- */
function colourLapTable(LP){const tb=$("#lapTable tbody"),th=$("#lapTable thead tr");if(!tb||!th||!LP||!LP.length)return;
  const ns=Math.max(0,...LP.map(l=>Array.isArray(l.sectors)?l.sectors.length:0));if(!th.dataset.sec){th.dataset.sec="1";th.insertAdjacentHTML("beforeend",[1,2,3,4,5].map(i=>`<th class="r sec-h" data-s="${i}">S${i}</th>`).join(""))}
  th.querySelectorAll(".sec-h").forEach(h=>h.hidden=+h.dataset.s>ns);
  const valid=LP.filter(l=>l.valid!==false),bestT=Math.min(...valid.map(l=>l.time)),bestS=[];for(let i=0;i<ns;i++)bestS[i]=Math.min(...valid.map(l=>l.sectors&&l.sectors[i]>0?l.sectors[i]:1e9));
  const rows=LP.slice().reverse();[...tb.rows].forEach((tr,ri)=>{const l=rows[ri];if(!l)return;tr.classList.toggle("lap-invalid",l.valid===false);const t=tr.cells[1];if(t)t.classList.toggle("pb",l.valid!==false&&l.time===bestT);
    tr.querySelectorAll(".sec-c").forEach(c=>c.remove());for(let i=0;i<5;i++){if(i>=ns)break;const v=l.sectors&&l.sectors[i];tr.insertAdjacentHTML("beforeend",`<td class="r mono sec-c ${v>0&&l.valid!==false&&v===bestS[i]?"pb":""}">${v>0?(+v).toFixed(3):"–"}</td>`)}});
  // the ideal lap: the best sector of each
  tb.querySelector(".ideal-row")?.remove();if(ns>1&&bestS.every(v=>v<1e9)){const it=bestS.reduce((a,b)=>a+b,0);tb.insertAdjacentHTML("afterbegin",`<tr class="ideal-row"><td>${E(TX("Ideal","Ideal","Ideal","Ideal"))}</td><td class="r mono pb">${FT(it)}</td>${Array.from({length:Math.max(0,th.querySelectorAll("th:not(.sec-h)").length-2)},()=>"<td></td>").join("")}${bestS.map(v=>`<td class="r mono pb">${v.toFixed(3)}</td>`).join("")}</tr>`)}}

/* ---------- the panel under the analyzer (and in the coach) ---------- */
function panel(id,after){let p=document.getElementById(id);if(!p&&after){p=document.createElement("div");p.id=id;p.className="panel pw-model";after.after(p)}return p}
async function renderModel(boxId,anchor,A,B,useRef){const box=panel(boxId,anchor);if(!box)return;if(!A){box.hidden=true;return}box.hidden=false;
  const c=await comboOf(A);
  if(!c){box.innerHTML=`<div class="label">${E(TX("Community model","Modelo de la comunidad","Community-Modell","Modelo da comunidade"))}</div><p class="note">${E(TX("Nobody has shared a lap of this car and track yet: the model starts learning with the first ones.","Nadie ha compartido aún una vuelta de este coche y circuito: el modelo empieza a aprender con las primeras.","Noch niemand hat eine Runde mit diesem Auto und dieser Strecke geteilt: das Modell lernt ab den ersten.","Ninguém compartilhou uma volta deste carro e pista ainda: o modelo começa a aprender com as primeiras."))}</p>`;return}
  if(!box.dataset.k||box.dataset.k!==c.trackId+":"+c.carId)box.innerHTML=`<p class="note">${E(TX("Learning from the community laps…","Aprendiendo de las vueltas de la comunidad…","Lerne aus den Community-Runden…","Aprendendo com as voltas da comunidade…"))}</p>`;
  box.dataset.k=c.trackId+":"+c.carId;
  const m=await buildModel(c);
  const [o]=await Promise.all([outline(c.trackId)]);
  if(!m||m.n<2){box.innerHTML=`<div class="label">${E(TX("Community model","Modelo de la comunidad","Community-Modell","Modelo da comunidade"))}</div><p class="note">${E(TX(`It learns from shared laps with telemetry: ${m?m.n:0} so far for this car and track; it needs 2.`,`Aprende de las vueltas compartidas con telemetría: ${m?m.n:0} de momento con este coche y circuito; necesita 2.`,`Es lernt aus geteilten Runden mit Telemetrie: bisher ${m?m.n:0}; es braucht 2.`,`Aprende com voltas compartilhadas com telemetria: ${m?m.n:0} até agora; precisa de 2.`))}</p>`;return}
  const ins=insights(m,A),gap=A.time-m.idealTime,grp=groupFor(m,A.time);
  box.innerHTML=`<div class="pwm-head"><div><div class="label">${E(TX("Community model","Modelo de la comunidad","Community-Modell","Modelo da comunidade"))}</div>
      <p class="note" style="margin:2px 0 0">${E(TX(`Learnt from ${m.n} laps of ${m.drivers} drivers (${m.total} shared). It gets sharper with every lap shared, at every pace.`,`Aprendido de ${m.n} vueltas de ${m.drivers} pilotos (${m.total} compartidas). Mejora con cada vuelta que se comparte, a cualquier ritmo.`,`Gelernt aus ${m.n} Runden von ${m.drivers} Fahrern (${m.total} geteilt). Wird mit jeder geteilten Runde genauer.`,`Aprendido de ${m.n} voltas de ${m.drivers} pilotos (${m.total} compartilhadas). Melhora a cada volta compartilhada.`))}</p></div>
    <div class="pwm-btns"><button type="button" class="btn small" data-mref="level">▲ ${E(TX("Compare with the next level","Comparar con el siguiente nivel","Mit nächstem Level vergleichen","Comparar com o próximo nível"))}</button><button type="button" class="btn small" data-mref="ideal">★ ${E(TX("Compare with the ideal lap","Comparar con la vuelta ideal","Mit Ideal-Runde vergleichen","Comparar com a volta ideal"))}</button></div></div>
    <div class="pwm-kpis"><div class="lap-metric"><small>${E(TX("Realistic ideal lap","Vuelta ideal realista","Realistische Ideal-Runde","Volta ideal realista"))}</small><b class="mono pb-t">${FT(m.idealTime)}</b><small>${E(TX(`best parts of the ${m.pool} quickest laps, at most 0.5 % under the best`,`mejores tramos de las ${m.pool} vueltas más rápidas, como mucho un 0,5 % bajo la mejor`,`beste Teile der ${m.pool} schnellsten Runden, höchstens 0,5 % unter der besten`,`melhores trechos das ${m.pool} voltas mais rápidas, no máximo 0,5 % abaixo da melhor`))}</small></div>
      <div class="lap-metric"><small>${E(TX("Fastest shared lap","Vuelta compartida más rápida","Schnellste geteilte Runde","Volta compartilhada mais rápida"))}</small><b class="mono">${FT(m.fastest.time)}</b><small>${E(m.fastest.alias)}</small></div>
      <div class="lap-metric"><small>${E(TX("Your lap to the ideal","Tu vuelta a la ideal","Deine Runde zum Ideal","Sua volta até a ideal"))}</small><b class="mono ${gap>0?"bad":"good"}">${gap>0?"+":""}${gap.toFixed(3)}</b></div>
      <div class="lap-metric"><small>${E(TX("Next level (drivers just ahead)","Siguiente nivel (pilotos justo por delante)","Nächstes Level (knapp schneller)","Próximo nível (pilotos logo à frente)"))}</small><b class="mono">${FT(median(grp.map(l=>l.time)))}</b><small>${grp.length} ${E(TX("laps","vueltas","Runden","voltas"))}</small></div></div>
    ${ins.length?`<div class="label" style="margin-top:10px">${E(TX("Where the next level is faster","Dónde es más rápido el siguiente nivel","Wo das nächste Level schneller ist","Onde o próximo nível é mais rápido"))}</div><div class="lap-insights">${ins.map(i=>`<div class="lap-insight"><b class="mono">${i.at} m</b> · ${E(i.tip)} <span class="mono bad" style="float:right">+${i.lost.toFixed(2)}</span></div>`).join("")}</div>`:`<p class="note">${E(TX("You match the drivers just ahead of you all lap. Try the ideal lap as the next target.","Igualas en toda la vuelta a los pilotos justo por delante. Prueba la vuelta ideal como siguiente objetivo.","Du hältst überall mit den knapp Schnelleren mit. Nimm die Ideal-Runde als nächstes Ziel.","Você acompanha os pilotos logo à frente na volta toda. Tente a volta ideal como próximo objetivo."))}</p>`}
    ${o&&B?`<div class="label" style="margin-top:10px">${E(TX("Track: green where A is faster, red where it loses","Circuito: verde donde A es más rápida, rojo donde pierde","Strecke: grün wo A schneller ist, rot wo sie verliert","Pista: verde onde A é mais rápida, vermelho onde perde"))}</div><canvas class="pwm-map"></canvas>`:o?"":`<p class="note">${E(TX("The track map appears when someone drives a lap without incidents here with TrackIQ.","El mapa del circuito aparece cuando alguien da aquí una vuelta sin incidentes con TrackIQ.","Die Streckenkarte erscheint, sobald jemand hier eine Runde ohne Zwischenfälle mit TrackIQ fährt.","O mapa da pista aparece quando alguém dá aqui uma volta sem incidentes com o TrackIQ."))}</p>`}`;
  const cv=box.querySelector(".pwm-map");if(cv&&o&&B)requestAnimationFrame(()=>drawMap(cv,o,A,B,m.M));
  box.querySelectorAll("[data-mref]").forEach(b=>b.onclick=()=>{const L=b.dataset.mref==="ideal"?idealLap(m):levelLap(m,A.time);if(!L)return;useRef(L)})}

/* ---------- hooks into the analyzer and the coach ---------- */
function addRef(L){const i=CREF.findIndex(x=>x.model===L.model);if(i>=0)CREF[i]=L;else CREF.push(L);return CREF.indexOf(L)}
const origLaps=window.renderLaps;
if(typeof origLaps==="function")window.renderLaps=function(){const r=origLaps.apply(this,arguments);try{
    const LP=typeof analysisLaps==="function"?analysisLaps():[];colourLapTable(LP);
    const A=lapOf($("#lapA")&&$("#lapA").value),B=lapOf($("#lapB")&&$("#lapB").value);
    renderModel("lapModel",$("#lapAnalyzer"),A,B,L=>{const i=addRef(L);window.renderLaps();const b=$("#lapB");if(b){b.value="c"+i;window.renderLaps()}})}catch(e){console.warn(e)}return r};
const origCoach=window.renderCoach;
if(typeof origCoach==="function")window.renderCoach=function(){const r=origCoach.apply(this,arguments);try{
    const LP=typeof coachLaps==="function"?coachLaps():[],rs=$("#coachRef");
    const A=window.COACH_A||LP[LP.length-1],R=window.COACH_R||null;
    renderModel("coachModel",$("#coachBody"),A,R,L=>{G61REF=L;if(rs)rs.value="g61";window.renderCoach();if(rs)rs.value="g61";window.renderCoach()})}catch(e){console.warn(e)}return r};
const st=document.createElement("style");st.textContent=`.pw-model{margin-top:12px}.pwm-head{display:flex;gap:10px;justify-content:space-between;align-items:flex-start;flex-wrap:wrap}.pwm-btns{display:flex;gap:6px;flex-wrap:wrap}
.pwm-kpis{display:grid;grid-template-columns:repeat(4,minmax(0,1fr));gap:8px;margin-top:10px}@media(max-width:820px){.pwm-kpis{grid-template-columns:1fr 1fr}}
.pwm-map{width:100%;display:block;margin-top:6px;border:1px solid var(--line);border-radius:10px;background:var(--surface2)}
.pb,.pb-t{color:var(--pb)!important;font-weight:700}tr.lap-invalid td{opacity:.5;text-decoration:line-through}.ideal-row td{border-bottom:2px solid var(--line);font-weight:700}`;document.head.appendChild(st);
window.PW_MODEL={buildModel,idealLap,levelLap,insights,comboOf};
})();
