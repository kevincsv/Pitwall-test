/* Pitlane HQ model: one per car and track, learnt on the server from every real lap it knows
   (yours, shared or not; the shared ones; the rivals of your races). Its references are real laps:
   - the record: the fastest lap really driven;
   - the next level: for your pace, the lap of the driver just ahead (0.3–3 % faster).
   Here it is only shown and compared: where you lose time against the next level and why, the
   coach's default reference, the lap list and sectors in purple, the track map by gain and loss. */
(function(){
"use strict";
if(window.__PW_MODEL)return;window.__PW_MODEL=true;
const $=s=>document.querySelector(s);
const TX=(...a)=>typeof Tx==="function"?Tx(...a):a[0];
const E=s=>typeof esc==="function"?esc(s):String(s);
const FT=t=>typeof fmtT==="function"?fmtT(t):(+t).toFixed(3);
const AL=a=>a==="Anonymous"?TX("Anonymous","Anónimo","Anonym","Anônimo"):a;
const SEG_M=250;           // metres per micro-sector (long enough that noise does not add up)
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
/* as the server learnt it: the record lap, the next level at every pace (real laps, one bin in two)
   and the pace of every driver it knows */
const up=bins=>{const out=[];bins.forEach((b,i)=>{const nx=bins[i+1];out.push([b[0],b[1],b[2],b[3],b[4],0,null]);out.push(nx?[(b[0]+nx[0])/2,(b[1]+nx[1])/2,b[2],b[3],b[4],0,null]:[b[0],b[1],b[2],b[3],b[4],0,null])});return out};
async function buildModel(c){
  const key=(typeof aGame==="function"?aGame():"")+":"+c.trackId+":"+c.carId;
  if(MODEL.key===key&&(MODEL.data||MODEL.busy)&&Date.now()-(MODEL.at||0)<300000)return MODEL.data;
  MODEL.key=key;MODEL.busy=true;MODEL.err="";MODEL.data=null;MODEL.at=Date.now();
  try{
    const r=await cget(`/api/community/model?trackId=${c.trackId}&carId=${c.carId}`);
    const m={key,trackId:c.trackId,carId:c.carId,n:r.n||0,drivers:r.drivers||0,total:r.shared||0,fastShared:r.fastShared||null,M:r.M,nb:r.nb,pool:r.pool,idealTime:r.idealTime,built:r.built,
      times:r.times||[],ideal:(r.ideal||[]).map(b=>[b[0],b[1],b[2],b[3],b[4],b[5],null]),ladder:(r.ladder||[]).map(x=>({time:x.time,n:x.n,upTo:x.upTo,seg:x.seg,bins:null,raw:x.bins}))};
    MODEL.data=m}
  catch(e){MODEL.err=e.message}
  MODEL.busy=false;return MODEL.data}

/* the record lap (the fastest lap really driven) as a lap you can compare with */
function idealLap(m){if(!m.ideal||!m.ideal.length)return null;
  return{n:"★ "+TX("Record","Récord","Rekord","Recorde"),alias:TX("Record (real lap)","Récord (vuelta real)","Rekord (echte Runde)","Recorde (volta real)"),name:TX("Record (real lap)","Récord (vuelta real)","Rekord (echte Runde)","Recorde (volta real)"),time:m.idealTime,bins:m.ideal,maxBin:m.ideal.length-1,comm:true,model:"ideal"}}
/* where a lap time stands among the drivers the model knows: 1 = the fastest */
function rankOf(m,t){const T=m.times||[];if(!T.length||!(t>0))return null;return{pos:T.filter(x=>x<t).length+1,of:T.length+(T.some(x=>Math.abs(x-t)<0.002)?0:1)}}
/* the next level for a lap time: the real lap of the driver just ahead (0.3–3 % faster) */
function refFor(m,t){const L=m.ladder||[];if(!L.length)return null;let i=L.findIndex(x=>t<=x.upTo);if(i<0)i=L.length-1;
  while(i>0&&!(L[i].time<t*0.997))i--; // the driver just ahead is really ahead (not this very lap)
  const x=L[i];if(!x.bins)x.bins=up(x.raw).slice(0,m.nb);return x}
function groupFor(m,t){const x=refFor(m,t);return x?[{time:x.time,bins:x.bins,seg:x.seg,n:x.n}]:[]}
function levelLap(m,t){const x=refFor(m,t);if(!x)return null;
  return{n:"▲ "+TX("Next level","Siguiente nivel","Nächstes Level","Próximo nível"),alias:TX("Next level (the driver just ahead)","Siguiente nivel (el piloto justo por delante)","Nächstes Level (der Fahrer knapp vor dir)","Próximo nível (o piloto logo à frente)"),name:TX("Next level (the driver just ahead)","Siguiente nivel (el piloto justo por delante)","Nächstes Level (der Fahrer knapp vor dir)","Próximo nível (o piloto logo à frente)"),time:x.time,bins:x.bins,maxBin:x.bins.length-1,comm:true,model:"level"}}

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
  tb.querySelector(".ideal-row")?.remove()}

/* ---------- the panel under the analyzer (and in the coach) ---------- */
function panel(id,after){let p=document.getElementById(id);if(!p&&after){p=document.createElement("div");p.id=id;p.className="panel pw-model";after.after(p)}return p}
async function renderModel(boxId,anchor,A,B,useRef){const box=panel(boxId,anchor);if(!box)return;if(!A){box.hidden=true;return}box.hidden=false;
  const c=await comboOf(A);
  if(!c){box.innerHTML=`<div class="label">${E(TX("The model","El modelo","Das Modell","O modelo"))}</div><p class="note">${E(TX("No lap of this car and track is known yet: the model starts learning with the first ones (yours, shared ones, your race rivals').","Aún no se conoce ninguna vuelta de este coche y circuito: el modelo empieza a aprender con las primeras (tuyas, compartidas, de tus rivales de carrera).","Noch keine Runde mit diesem Auto und dieser Strecke bekannt: das Modell lernt ab den ersten.","Nenhuma volta deste carro e pista é conhecida ainda: o modelo começa a aprender com as primeiras."))}</p>`;return}
  if(!box.dataset.k||box.dataset.k!==c.trackId+":"+c.carId)box.innerHTML=`<p class="note">${E(TX("Loading the model…","Cargando el modelo…","Modell wird geladen…","Carregando o modelo…"))}</p>`;
  box.dataset.k=c.trackId+":"+c.carId;
  const m=await buildModel(c);
  const [o]=await Promise.all([outline(c.trackId)]);
  if(!m||m.n<2){const known=m&&m.times&&m.times.length?TX(` It knows the pace of ${m.times.length} ${m.times.length===1?"driver":"drivers"} here.`,` Conoce el ritmo de ${m.times.length} ${m.times.length===1?"piloto":"pilotos"} aquí.`,` Es kennt das Tempo von ${m.times.length} Fahrern hier.`,` Conhece o ritmo de ${m.times.length} pilotos aqui.`):"";
    box.innerHTML=`<div class="label">${E(TX("The model","El modelo","Das Modell","O modelo"))}</div><p class="note">${E(TX(`It learns from real laps with telemetry: ${m?m.n:0} so far for this car and track; it needs 2.`,`Aprende de vueltas reales con telemetría: ${m?m.n:0} de momento con este coche y circuito; necesita 2.`,`Es lernt aus echten Runden mit Telemetrie: bisher ${m?m.n:0}; es braucht 2.`,`Aprende com voltas reais com telemetria: ${m?m.n:0} até agora; precisa de 2.`)+known)}</p>`;return}
  const ins=insights(m,A),gap=A.time-m.idealTime,grp=groupFor(m,A.time),rk=rankOf(m,A.time);
  box.innerHTML=`<div class="pwm-head"><div><div class="label">${E(TX("The model","El modelo","Das Modell","O modelo"))}</div>
      <p class="note" style="margin:2px 0 0">${E(TX(`Learnt from ${m.n} real ${m.n===1?"lap":"laps"} of ${m.drivers} ${m.drivers===1?"driver":"drivers"}: yours, shared ones and your race rivals'. Its references are real laps, never composites; it keeps learning from every lap driven.`,`Aprendido de ${m.n} ${m.n===1?"vuelta real":"vueltas reales"} de ${m.drivers} ${m.drivers===1?"piloto":"pilotos"}: tuyas, compartidas y de tus rivales de carrera. Sus referencias son vueltas reales, nunca compuestas; sigue aprendiendo de cada vuelta.`,`Gelernt aus ${m.n} echten Runden von ${m.drivers} Fahrern: deine, geteilte und die deiner Rennrivalen. Seine Referenzen sind echte Runden.`,`Aprendido de ${m.n} voltas reais de ${m.drivers} pilotos: suas, compartilhadas e dos rivais das suas corridas. Suas referências são voltas reais.`))}</p></div>
    <div class="pwm-btns"><button type="button" class="btn small" data-mref="level">▲ ${E(TX("Compare with the next level","Comparar con el siguiente nivel","Mit nächstem Level vergleichen","Comparar com o próximo nível"))}</button><button type="button" class="btn small" data-mref="ideal">★ ${E(TX("Compare with the record","Comparar con el récord","Mit dem Rekord vergleichen","Comparar com o recorde"))}</button></div></div>
    <div class="pwm-kpis"><div class="lap-metric"><small>${E(TX("Record (fastest real lap)","Récord (vuelta real más rápida)","Rekord (schnellste echte Runde)","Recorde (volta real mais rápida)"))}</small><b class="mono pb-t">${FT(m.idealTime)}</b><small>${E(m.fastShared&&Math.abs(m.fastShared.time-m.idealTime)<0.002?AL(m.fastShared.alias):TX("a lap really driven here","una vuelta real dada aquí","eine hier wirklich gefahrene Runde","uma volta real dada aqui"))}</small></div>
      <div class="lap-metric"><small>${E(TX("Your lap to the record","Tu vuelta al récord","Deine Runde zum Rekord","Sua volta até o recorde"))}</small><b class="mono ${gap>0?"bad":"good"}">${gap>0?"+":""}${gap.toFixed(3)}</b><small>${E(m.fastShared&&m.fastShared.time>m.idealTime+0.002?TX(`fastest shared: ${FT(m.fastShared.time)} (${AL(m.fastShared.alias)})`,`compartida más rápida: ${FT(m.fastShared.time)} (${AL(m.fastShared.alias)})`,`schnellste geteilte: ${FT(m.fastShared.time)}`,`compartilhada mais rápida: ${FT(m.fastShared.time)}`):"")}</small></div>
      <div class="lap-metric"><small>${E(TX("Next level (the driver just ahead)","Siguiente nivel (el piloto justo por delante)","Nächstes Level (knapp vor dir)","Próximo nível (logo à frente)"))}</small><b class="mono">${grp.length?FT(grp[0].time):"–"}</b><small>${E(grp.length?TX(`a real lap, ${(A.time-grp[0].time).toFixed(3)} s from yours`,`una vuelta real, a ${(A.time-grp[0].time).toFixed(3)} s de la tuya`,`eine echte Runde, ${(A.time-grp[0].time).toFixed(3)} s vor deiner`,`uma volta real, ${(A.time-grp[0].time).toFixed(3)} s da sua`):"")}</small></div>
      <div class="lap-metric"><small>${E(TX("Your pace among the drivers known here","Tu ritmo entre los pilotos conocidos aquí","Dein Tempo unter den bekannten Fahrern","Seu ritmo entre os pilotos conhecidos"))}</small><b class="mono">${rk?`${rk.pos}º / ${rk.of}`:"–"}</b><small>${E(TX("by best lap, rivals of races included","por mejor vuelta, rivales de carrera incluidos","nach bester Runde, Rennrivalen eingeschlossen","por melhor volta, rivais incluídos"))}</small></div></div>
    ${ins.length?`<div class="label" style="margin-top:10px">${E(TX("Where the next level is faster","Dónde es más rápido el siguiente nivel","Wo das nächste Level schneller ist","Onde o próximo nível é mais rápido"))}</div><div class="lap-insights">${ins.map(i=>`<div class="lap-insight"><b class="mono">${i.at} m</b> · ${E(i.tip)} <span class="mono bad" style="float:right">+${i.lost.toFixed(2)}</span></div>`).join("")}</div>`:`<p class="note">${E(TX("You match the driver just ahead of you all lap. Try the record as the next target.","Igualas en toda la vuelta al piloto justo por delante. Prueba el récord como siguiente objetivo.","Du hältst überall mit dem Fahrer knapp vor dir mit. Nimm den Rekord als nächstes Ziel.","Você acompanha o piloto logo à frente na volta toda. Tente o recorde como próximo objetivo."))}</p>`}
    ${o||typeof renderCmpMap==="function"?`<div class="label" style="margin-top:10px">${E(TX("Track against the next level: green where your lap is faster, red where it loses","Circuito frente al siguiente nivel: verde donde tu vuelta es más rápida, rojo donde pierde","Strecke gegen das nächste Level: grün wo deine Runde schneller ist, rot wo sie verliert","Pista contra o próximo nível: verde onde sua volta é mais rápida, vermelho onde perde"))}</div><div class="pwm-mapbox"></div>`:o?"":`<p class="note">${E(TX("The track map appears when someone drives a lap without incidents here with Pitlane HQ.","El mapa del circuito aparece cuando alguien da aquí una vuelta sin incidentes con Pitlane HQ.","Die Streckenkarte erscheint, sobald jemand hier eine Runde ohne Zwischenfälle mit Pitlane HQ fährt.","O mapa da pista aparece quando alguém dá aqui uma volta sem incidentes com o Pitlane HQ."))}</p>`}`;
  // the same map as the analyzer (corners, sectors, braking points, incidents, coach, hover), here
  // your lap against what the model learnt: the next level for your pace (or lap B while it has none)
  const mb=box.querySelector(".pwm-mapbox");if(mb){const ref=levelLap(m,A.time)||B;
    if(ref&&typeof renderCmpMap==="function")renderCmpMap(A,ref,mb);else{const cv=document.createElement("canvas");cv.className="pwm-map";mb.appendChild(cv);if(o&&B)requestAnimationFrame(()=>drawMap(cv,o,A,B,m.M))}}
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
    const useRef=L=>{G61REF=L;if(rs)rs.value="g61";window.renderCoach();if(rs)rs.value="g61";window.renderCoach()};
    renderModel("coachModel",$("#coachBody"),A,R,useRef).then(()=>{
      // the coach's reference, by default: the model's next level for your lap (a real lap), once per car and track
      const m=MODEL.data;if(!m||!A||typeof G61REF==="undefined"||G61REF)return;const L=levelLap(m,A.time);if(!L||MODEL.autoKey===m.key)return;MODEL.autoKey=m.key;useRef(L)})}catch(e){console.warn(e)}return r};
const st=document.createElement("style");st.textContent=`.pw-model{margin-top:12px}.pwm-head{display:flex;gap:10px;justify-content:space-between;align-items:flex-start;flex-wrap:wrap}.pwm-btns{display:flex;gap:6px;flex-wrap:wrap}
.pwm-kpis{display:grid;grid-template-columns:repeat(4,minmax(0,1fr));gap:8px;margin-top:10px}@media(max-width:820px){.pwm-kpis{grid-template-columns:1fr 1fr}}
.pwm-map{width:100%;display:block;margin-top:6px;border:1px solid var(--line);border-radius:10px;background:var(--surface2)}
.pb,.pb-t{color:var(--pb)!important;font-weight:700}tr.lap-invalid td{opacity:.5;text-decoration:line-through}tr.lap-invalid td:last-child .pill{text-decoration:none}.ideal-row td{border-bottom:2px solid var(--line);font-weight:700}`;document.head.appendChild(st);
window.PW_MODEL={buildModel,idealLap,levelLap,insights,comboOf};
})();
