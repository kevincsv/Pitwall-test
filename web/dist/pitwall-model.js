/* Pitlane HQ community model: learns each car and track on the server from every valid lap
   with telemetry (shared or not; the laps themselves never leave the server).
   - Ideal lap: the fastest micro-sector of every shared lap, stitched together.
   - Next level: the drivers just ahead of your pace (0.3–3 % faster), averaged bin by bin,
     so the target is reachable and gets sharper as more laps of every speed arrive.
   - Where you lose time against that group, why (braking, corner speed, exit), the lap
     list and sectors in purple like the sims, and the track map coloured by gain and loss.
   The server rebuilds it as laps arrive; here it is only shown and compared. */
(function(){
"use strict";
if(window.__PW_MODEL)return;window.__PW_MODEL=true;
const $=s=>document.querySelector(s);
const TX=(...a)=>typeof Tx==="function"?Tx(...a):a[0];
const E=s=>typeof esc==="function"?esc(s):String(s);
const FT=t=>typeof fmtT==="function"?fmtT(t):(+t).toFixed(3);
const SEG_M=250;           // metres per micro-sector (long enough that noise does not add up)
const IDEAL_MAX=0.005;     // the ideal lap is never more than 0.5 % faster than the fastest real lap
const COMBOS={g:"",list:null},MAPS=new Map();
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
/* the model is learnt on the server from every valid lap of this car and track (shared or not);
   here only what it learnt arrives: the realistic ideal lap and the "next level" at every pace */
const up=bins=>{const out=[];bins.forEach((b,i)=>{const nx=bins[i+1];out.push([b[0],b[1],b[2],b[3],b[4],0,null]);out.push(nx?[(b[0]+nx[0])/2,(b[1]+nx[1])/2,b[2],b[3],b[4],0,null]:[b[0],b[1],b[2],b[3],b[4],0,null])});return out};
async function buildModel(c){
  const key=(typeof aGame==="function"?aGame():"")+":"+c.trackId+":"+c.carId;
  if(MODEL.key===key&&(MODEL.data||MODEL.busy)&&Date.now()-(MODEL.at||0)<300000)return MODEL.data;
  MODEL.key=key;MODEL.busy=true;MODEL.err="";MODEL.data=null;MODEL.at=Date.now();
  try{
    const r=await cget(`/api/community/model?trackId=${c.trackId}&carId=${c.carId}`);
    const m={key,trackId:c.trackId,carId:c.carId,n:r.n||0,drivers:r.drivers||0,total:r.shared||0,fastShared:r.fastShared||null,M:r.M,nb:r.nb,pool:r.pool,idealTime:r.idealTime,built:r.built,
      ideal:(r.ideal||[]).map(b=>[b[0],b[1],b[2],b[3],b[4],b[5],null]),ladder:(r.ladder||[]).map(x=>({time:x.time,n:x.n,upTo:x.upTo,seg:x.seg,bins:null,raw:x.bins}))};
    MODEL.data=m}
  catch(e){MODEL.err=e.message}
  MODEL.busy=false;return MODEL.data}

/* the ideal lap as a lap you can compare with */
function idealLap(m){if(!m.ideal||!m.ideal.length)return null;
  return{n:"★ "+TX("Realistic ideal","Ideal realista","Realistisches Ideal","Ideal realista"),alias:TX("Realistic ideal","Ideal realista","Realistisches Ideal","Ideal realista"),time:m.idealTime,bins:m.ideal,maxBin:m.ideal.length-1,comm:true,model:"ideal"}}
/* the next level for a lap time: the reference of the drivers 0.3–3 % faster */
function refFor(m,t){const L=m.ladder||[];if(!L.length)return null;let x=L.find(x=>t<=x.upTo)||L[L.length-1];if(!x.bins)x.bins=up(x.raw).slice(0,m.nb);return x}
function groupFor(m,t){const x=refFor(m,t);return x?[{time:x.time,bins:x.bins,seg:x.seg,n:x.n}]:[]}
function levelLap(m,t){const x=refFor(m,t);if(!x)return null;
  return{n:"▲ "+TX("Next level","Siguiente nivel","Nächstes Level","Próximo nível"),alias:TX("Next level","Siguiente nivel","Nächstes Level","Próximo nível")+" ("+x.n+")",time:x.time,bins:x.bins,maxBin:x.bins.length-1,comm:true,model:"level"}}

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
  if(!m||m.n<2){box.innerHTML=`<div class="label">${E(TX("Community model","Modelo de la comunidad","Community-Modell","Modelo da comunidade"))}</div><p class="note">${E(TX(`It learns from valid laps with telemetry: ${m?m.n:0} so far for this car and track; it needs 2.`,`Aprende de las vueltas válidas con telemetría: ${m?m.n:0} de momento con este coche y circuito; necesita 2.`,`Es lernt aus gültigen Runden mit Telemetrie: bisher ${m?m.n:0}; es braucht 2.`,`Aprende com voltas válidas com telemetria: ${m?m.n:0} até agora; precisa de 2.`))}</p>`;return}
  const ins=insights(m,A),gap=A.time-m.idealTime,grp=groupFor(m,A.time),grpN=grp.length?grp[0].n:0;
  box.innerHTML=`<div class="pwm-head"><div><div class="label">${E(TX("Community model","Modelo de la comunidad","Community-Modell","Modelo da comunidade"))}</div>
      <p class="note" style="margin:2px 0 0">${E(TX(`Learnt from ${m.n} laps of ${m.drivers} drivers (${m.total} shared). It keeps learning from every valid lap driven, at every pace.`,`Aprendido de ${m.n} vueltas de ${m.drivers} pilotos (${m.total} compartidas). Sigue aprendiendo de cada vuelta válida, a cualquier ritmo.`,`Gelernt aus ${m.n} Runden von ${m.drivers} Fahrern (${m.total} geteilt). Lernt weiter aus jeder gültigen Runde, in jedem Tempo.`,`Aprendido de ${m.n} voltas de ${m.drivers} pilotos (${m.total} compartilhadas). Melhora a cada volta compartilhada.`))}</p></div>
    <div class="pwm-btns"><button type="button" class="btn small" data-mref="level">▲ ${E(TX("Compare with the next level","Comparar con el siguiente nivel","Mit nächstem Level vergleichen","Comparar com o próximo nível"))}</button><button type="button" class="btn small" data-mref="ideal">★ ${E(TX("Compare with the ideal lap","Comparar con la vuelta ideal","Mit Ideal-Runde vergleichen","Comparar com a volta ideal"))}</button></div></div>
    <div class="pwm-kpis"><div class="lap-metric"><small>${E(TX("Realistic ideal lap","Vuelta ideal realista","Realistische Ideal-Runde","Volta ideal realista"))}</small><b class="mono pb-t">${FT(m.idealTime)}</b><small>${E(TX(`best parts of the ${m.pool} quickest laps, at most 0.5 % under the best`,`mejores tramos de las ${m.pool} vueltas más rápidas, como mucho un 0,5 % bajo la mejor`,`beste Teile der ${m.pool} schnellsten Runden, höchstens 0,5 % unter der besten`,`melhores trechos das ${m.pool} voltas mais rápidas, no máximo 0,5 % abaixo da melhor`))}</small></div>
      <div class="lap-metric"><small>${E(TX("Fastest shared lap","Vuelta compartida más rápida","Schnellste geteilte Runde","Volta compartilhada mais rápida"))}</small><b class="mono">${m.fastShared?FT(m.fastShared.time):"–"}</b><small>${E(m.fastShared?m.fastShared.alias:"")}</small></div>
      <div class="lap-metric"><small>${E(TX("Your lap to the ideal","Tu vuelta a la ideal","Deine Runde zum Ideal","Sua volta até a ideal"))}</small><b class="mono ${gap>0?"bad":"good"}">${gap>0?"+":""}${gap.toFixed(3)}</b></div>
      <div class="lap-metric"><small>${E(TX("Next level (drivers just ahead)","Siguiente nivel (pilotos justo por delante)","Nächstes Level (knapp schneller)","Próximo nível (pilotos logo à frente)"))}</small><b class="mono">${grp.length?FT(grp[0].time):"–"}</b><small>${grpN} ${E(TX("laps","vueltas","Runden","voltas"))}</small></div></div>
    ${ins.length?`<div class="label" style="margin-top:10px">${E(TX("Where the next level is faster","Dónde es más rápido el siguiente nivel","Wo das nächste Level schneller ist","Onde o próximo nível é mais rápido"))}</div><div class="lap-insights">${ins.map(i=>`<div class="lap-insight"><b class="mono">${i.at} m</b> · ${E(i.tip)} <span class="mono bad" style="float:right">+${i.lost.toFixed(2)}</span></div>`).join("")}</div>`:`<p class="note">${E(TX("You match the drivers just ahead of you all lap. Try the ideal lap as the next target.","Igualas en toda la vuelta a los pilotos justo por delante. Prueba la vuelta ideal como siguiente objetivo.","Du hältst überall mit den knapp Schnelleren mit. Nimm die Ideal-Runde als nächstes Ziel.","Você acompanha os pilotos logo à frente na volta toda. Tente a volta ideal como próximo objetivo."))}</p>`}
    ${o&&B?`<div class="label" style="margin-top:10px">${E(TX("Track: green where A is faster, red where it loses","Circuito: verde donde A es más rápida, rojo donde pierde","Strecke: grün wo A schneller ist, rot wo sie verliert","Pista: verde onde A é mais rápida, vermelho onde perde"))}</div><canvas class="pwm-map"></canvas>`:o?"":`<p class="note">${E(TX("The track map appears when someone drives a lap without incidents here with Pitlane HQ.","El mapa del circuito aparece cuando alguien da aquí una vuelta sin incidentes con Pitlane HQ.","Die Streckenkarte erscheint, sobald jemand hier eine Runde ohne Zwischenfälle mit Pitlane HQ fährt.","O mapa da pista aparece quando alguém dá aqui uma volta sem incidentes com o Pitlane HQ."))}</p>`}`;
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
.pb,.pb-t{color:var(--pb)!important;font-weight:700}tr.lap-invalid td{opacity:.5;text-decoration:line-through}tr.lap-invalid td:last-child .pill{text-decoration:none}.ideal-row td{border-bottom:2px solid var(--line);font-weight:700}`;document.head.appendChild(st);
window.PW_MODEL={buildModel,idealLap,levelLap,insights,comboOf};
})();
