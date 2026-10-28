// node cloud/test/analysis.test.mjs: the lap analysis and the coach live in one file, web/dist/pitwall-analysis.js, which
// the web, the PC app and the phones run. This test keeps what the web shows exactly as it was before the analysis moved
// there: realistic laps (braking zones, trail braking, coasting, lifts, gears, steering, paths in both frames, sectors,
// official turns, the coach's weights) go through the app's own functions, taken out of web/dist/index.html with a small
// loader, and every answer (the corners and their tips, the plan, the sectors, the line, the analyzer's facts, the HTML
// of the analyzer and the coach's phases) must hash to what index.html gave before the move (analysis.fixture.json, made
// with --capture from the index.html of that time). The module is also run the way the phones run it (plain JSON in,
// plain JSON out) and must give the web's answers, with the tips in Portuguese too.
//
//   node cloud/test/analysis.test.mjs                    check the current web/dist against the fixture
//   node cloud/test/analysis.test.mjs --capture FILE     write the fixture from that index.html's own functions
import fs from "node:fs";
import crypto from "node:crypto";
import assert from "node:assert/strict";

const ROOT = new URL("../../", import.meta.url);
const FIXTURE = new URL("analysis.fixture.json", import.meta.url);

// ---------- the loader: top-level definitions of index.html, one statement from its first line to the next one at column 0
const NAMES = ["lapSeries", "serOf", "lapShape", "sameFrame", "lineOffsets", "cornerLine", "lineTip", "lapDriving", "renderLapAnalyzer",
  "pairSecs", "brakeZones", "PHASES", "phaseName", "turnNo", "COACH_GEN", "cornerClass", "cornerZones", "coachCompare", "coachPhasesHTML",
  "cornerConsistency", "coachPlan", "tipWeight", "tipAsk", "tipOff", "coachKindName", "stepText", "areaName",
  // the new index.html: what builds the module's context and reads its texts (the line's and the corners' helpers above
  // live only in the module now)
  "anaCtx", "tipTx", "PWA"];
function extract(src, optional) {
  const lines = src.split("\n"), out = [];
  for (const nm of NAMES) {
    const re = new RegExp("^(?:async\\s+)?(?:function\\s+" + nm + "\\s*\\(|(?:const|let|var)\\s+" + nm + "\\s*=)");
    const i = lines.findIndex((l) => re.test(l));
    if (i < 0) { if (optional.includes(nm)) continue; throw new Error("index.html has no " + nm); }
    let j = i + 1;
    while (j < lines.length && /^\s+\S/.test(lines[j])) j++;
    out.push(lines.slice(i, j).join("\n"));
  }
  return out.join("\n");
}

// the app's functions with the few globals they read: the language, the units, the official turns, the coach's weights
// and the model's corner cards, set by each case
function appApi(html, moduleSrc) {
  const code = `
const window={};
${moduleSrc || ""}
let LANG="en",UNITS="metric";const BIN=5;
const spd=ms=>UNITS==="imperial"?ms*2.23694:ms*3.6, spdU=()=>UNITS==="imperial"?"mph":"km/h";
const sgn=(d,n=3)=>d==null||isNaN(d)?"–":(d>=0?"+":"−")+Math.abs(d).toFixed(n);
const esc=s=>String(s??"").replace(/[&<>"]/g,c=>({"&":"&amp;","<":"&lt;",">":"&gt;",'"':"&quot;"}[c]));
const devWords=r=>r;
const Tx=(en,es,de,pt)=>devWords(LANG==="es"?es:LANG==="pt"?(pt!=null?pt:en):en);
let TURNS={},TURN_TID=null;function turnsFor(id){return id&&TURNS[id]||null}
let COACH_W={at:0,w:{},b:{},off:new Set(),conf:false,min:30},COACH_ME={at:0,habits:[],w:{}};
let CARDS=[];const hintOf=(cs,apex)=>{if(!cs||!cs.length||!(apex>=0))return null;let b=null;for(const c of cs){const g=Math.abs(c.apex-apex);if(g<=60&&(!b||g<Math.abs(b.apex-apex)))b=c}return b};
window.PW_MODEL={cornerHint:(A,apex)=>hintOf(CARDS,apex)};
const BOX={hidden:true,innerHTML:"",querySelectorAll:()=>[]};const $=s=>s==="#lapAnalyzer"?BOX:null;let CMP_HOVER=null;const drawCmp=()=>{};
${extract(html, moduleSrc ? ["sameFrame", "cornerLine", "lineTip", "PHASES", "COACH_GEN", "cornerClass"] : ["anaCtx", "tipTx", "PWA"])}
return{set(o){LANG=o.lang;UNITS=o.units;TURNS=o.turns;TURN_TID=null;COACH_W=o.w;COACH_ME=o.me;CARDS=o.cards},BOX,
  lapSeries,serOf,lineOffsets,lapDriving,renderLapAnalyzer,pairSecs,brakeZones,cornerZones,coachCompare,coachPhasesHTML,
  cornerConsistency,coachPlan,coachKindName,stepText,turnNo,PW_ANALYSIS:window.PW_ANALYSIS};`;
  return new Function(code)();
}

// ---------- realistic laps, from basic arithmetic only (the same numbers on every machine)
function rng(seed) {
  let s = seed >>> 0 || 1;
  const next = () => (s = (Math.imul(s, 1664525) + 1013904223) >>> 0) / 4294967296;
  return { f: (a, b) => a + (b - a) * next(), i: (a, b) => Math.floor(a + (b - a + 1) * next()), p: (q) => next() < q };
}
function expn(x) { // e^x for x <= 0: a Taylor series on x/64, squared six times
  if (x < -40) return 0;
  let y = x / 64, t = 1, s = 1;
  for (let k = 1; k < 12; k++) { t *= y / k; s += t; }
  for (let k = 0; k < 6; k++) s *= s;
  return s;
}
function sincos(a) { // sin and cos by their series, after bringing the angle to [-pi, pi]
  const P = 3.141592653589793;
  let x = a - 2 * P * Math.floor((a + P) / (2 * P));
  let s = 0, c = 0, ts = x, tc = 1;
  for (let k = 0; k < 14; k++) { s += ts; c += tc; ts *= -x * x / ((2 * k + 2) * (2 * k + 3)); tc *= -x * x / ((2 * k + 1) * (2 * k + 2)); }
  return [s, c];
}
const gauss = (d, w) => expn(-(d * d) / (2 * w * w));
const smoothStep = (d, w) => d <= -3 * w ? 0 : d >= 3 * w ? 1 : (() => { const u = (d + 3 * w) / (6 * w); return u * u * (3 - 2 * u); })();

// a track: corners with their slowest speed, braking, direction and how much they turn; some are lifts with no braking
function track(r) {
  const L = r.i(600, 1000) * 5, n = L / 5, k = r.i(6, 11), out = [];
  for (let c = 0; c < k; c++) {
    const ia = Math.round((60 + (n - 120) * (c + 0.5) / k + r.f(-15, 15)));
    const lift = r.p(0.18);
    out.push({ ia, lift, dir: r.p(0.5) ? 1 : -1, turn: r.f(0.5, 1.9), w: r.f(4, 9), vmin: lift ? r.f(62, 68) : r.f(14, 50), dec: lift ? 30 : r.f(12, 24), acc: r.f(4, 9),
      peak: r.f(0.8, 1), trail: r.f(10, 40), coast: 0, pick: r.f(0, 10), ramp: r.f(20, 60), lifts: 0, corr: r.f(0, 1), gear: 0, line: [0, 0, 0] });
  }
  return { n, L, corners: out, vmax: r.f(70, 80) };
}
// the same track driven differently: a later or earlier brake, a slower apex, coasting, a later throttle, lifts, gears, the line
function variant(tk, r, amount, focus) {
  if (focus) return { ...tk, corners: tk.corners.map((c) => {
    if (c.lift) return focus === "apex" ? { ...c, vmin: c.vmin - r.f(1, 4) } : c;
    const o = { ...c };
    if (focus === "trail") { o.trail = Math.max(0, c.trail - r.f(15, 30)); o.slowE = r.f(0.5, 3); if (r.p(0.4)) o.slowB = r.f(0.5, 2); }
    if (focus === "coast") { o.coast = r.f(12, 35); o.trail = Math.max(0, c.trail - r.f(0, 10)); o.slowE = r.f(0.5, 3); }
    if (focus === "apex") { o.vmin = c.vmin - r.f(1, 5); o.dec = c.dec * (1 + r.f(0.05, 0.3)); }
    if (focus === "exit") { o.acc = c.acc * r.f(0.6, 0.9); o.vmin = c.vmin + r.f(0, 1.5); }
    if (focus === "pick") { o.pick = c.pick + r.f(8, 30); o.ramp = c.ramp + r.f(-10, 30); o.slowX = r.f(0.5, 3); }
    if (focus === "lifts") { o.lifts = r.i(2, 3); o.gear = r.p(0.3) ? 1 : 0; o.slowX = r.f(0.5, 2.5); }
    if (focus === "line") { o.line = [r.f(-3.5, 3.5), r.f(-3.5, 3.5), r.f(-3.5, 3.5)].map((v) => v + (v > 0 ? 1 : -1)); o.slowE = r.f(0, 1.5); o.slowX = r.f(0, 1.5); }
    if (focus === "gear") { o.gear = r.p(0.5) ? 1 : -1; o.vmin = c.vmin - r.f(0, 0.8); }
    if (focus === "peak") { o.peak = Math.max(0.3, c.peak - r.f(0.1, 0.35)); o.slowB = r.f(0.5, 3); }
    return o;
  }) };
  return { ...tk, corners: tk.corners.map((c) => {
    if (c.lift) return { ...c, vmin: c.vmin + r.f(-3, 1) * amount };
    return { ...c, vmin: Math.max(10, c.vmin + r.f(-4, 2) * amount), dec: c.dec * (1 + r.f(-0.25, 0.3) * amount), peak: Math.max(0.3, c.peak - r.f(0, 0.25) * amount),
      trail: Math.max(0, c.trail + r.f(-25, 15) * amount), coast: r.p(0.3 * amount) ? r.f(5, 35) : 0, pick: Math.max(0, c.pick + r.f(-15, 25) * amount),
      ramp: Math.max(5, c.ramp + r.f(-35, 35) * amount), lifts: r.p(0.25 * amount) ? r.i(1, 3) : 0, corr: c.corr + (r.p(0.3 * amount) ? r.f(1, 5) : 0),
      gear: r.p(0.2 * amount) ? (r.p(0.5) ? 1 : -1) : 0, line: [r.f(-3, 3) * amount, r.f(-3, 3) * amount, r.f(-3, 3) * amount] };
  }) };
}
function drive(tk, opt) {
  const { n, corners, vmax } = tk, v = new Array(n), act = new Array(n);
  for (let i = 0; i < n; i++) {
    let best = vmax, who = -1;
    corners.forEach((c, k) => { const d = (i - c.ia) * 5, lim = Math.sqrt(c.vmin * c.vmin + 2 * (d <= 0 ? c.dec : c.acc) * Math.abs(d)); if (lim < best) { best = lim; who = k; } });
    // what a driver loses with the pedals: in the braking zone, into the turn, out of it
    corners.forEach((c) => { if (c.slowB) best -= c.slowB * gauss(i - (c.ia - 18), 5); if (c.slowE) best -= c.slowE * gauss(i - (c.ia - 5), 4); if (c.slowX) best -= c.slowX * gauss(i - (c.ia + 16), 7); });
    v[i] = best; act[i] = who;
  }
  const bins = [];
  let t = 0, h = opt.h0 || 0, x = 0, y = 0;
  const xs = [], ys = [], hs = [];
  for (let i = 0; i < n; i++) {
    const k = act[i], c = k >= 0 ? corners[k] : null, d = c ? (c.ia - i) * 5 : 0;
    let thr = 1, brk = 0;
    if (c && c.lift && d >= 0) thr = 0.6;
    else if (c && !c.lift && d >= 0 && v[i] < vmax - 0.05) {
      const relS = c.coast + c.trail;
      brk = d > relS ? c.peak : d > c.coast ? c.peak * (d - c.coast) / Math.max(1, c.trail) : 0;
      if (i > 0 && act[i - 1] === k && v[i - 1] >= vmax - 0.05) brk *= 0.6;
      thr = 0;
    } else if (c && !c.lift && d < 0) {
      const a = -d - c.pick;
      thr = a <= 0 ? 0 : Math.min(1, 0.05 + a / c.ramp);
      if (c.lifts && a > c.ramp && a < c.ramp + c.lifts * 20 && Math.floor((a - c.ramp) / 10) % 2 === 1) thr = 0.3;
    }
    let gear = Math.max(1, Math.min(7, 1 + Math.floor(v[i] / 13)));
    let steer = 0;
    corners.forEach((cc) => { const g = gauss(i - cc.ia, cc.w * 1.5); if (g > 0.001) { const [s] = sincos((i - cc.ia) * 1.3); steer += cc.dir * 0.3 * g + 0.012 * cc.corr * s * g; if (Math.abs(i - cc.ia) < 12 && cc.gear) gear = Math.max(1, gear + cc.gear); } });
    t += i ? 10 / (v[i - 1] + v[i]) : 0;
    bins.push([v[i], t, thr, brk, gear, opt.noSteer ? null : steer, null]);
    // the path: the heading turns through every corner, the car a little to one side of the middle where its line says
    if (i) { const [s, co] = sincos(h); x += 5 * co; y += 5 * s; }
    h = (opt.h0 || 0) + corners.reduce((q, cc) => q + cc.dir * cc.turn * smoothStep(i - cc.ia, cc.w), 0);
    hs.push(h); xs.push(x); ys.push(y);
  }
  let o = 0;
  const X = [], Y = [];
  for (let i = 0; i < n; i++) {
    o = corners.reduce((q, cc) => q + cc.line[0] * gauss(i - (cc.ia - 12), 4) + cc.line[1] * gauss(i - cc.ia, 4) + cc.line[2] * gauss(i - (cc.ia + 14), 4), 0);
    const [s, co] = sincos(hs[i]);
    X.push(Math.round((xs[i] - o * s + (opt.drift || 0) * i + (opt.dx || 0)) * 10) / 10);
    Y.push(Math.round((ys[i] + o * co + (opt.dy || 0)) * 10) / 10);
  }
  const time = t + 5 / v[n - 1];
  return { bins, time, X, Y };
}
function lapOf(tk, opt, extra) {
  const d = drive(tk, opt), lap = { n: extra.n, time: d.time, bins: d.bins, valid: extra.valid !== false };
  if (extra.maxBin !== false) lap.maxBin = d.bins.length - 1;
  if (opt.xy !== false) lap.xy = { x: d.X, y: d.Y, g: opt.g || null };
  if (extra.holes) for (const i of extra.holes) lap.bins[i] = undefined;
  if (extra.trackId) lap.trackId = extra.trackId;
  if (extra.sectors === "game") { const a = d.time * 0.31, b = d.time * 0.37; lap.sectors = [a, b, d.time - a - b]; }
  if (extra.sectors === "bad") lap.sectors = [d.time * 0.3, d.time * 0.3, d.time * 0.3 + 3];
  return lap;
}

const KINDS = ["brake_late_apex", "brake_later", "brake_harder", "brake_earlier", "trail", "brake_same", "brake_generic", "coast", "entry_before", "entry_speed",
  "apex_speed", "apex_longer", "apex_line", "throttle", "no_wait", "exit_speed", "full_throttle", "gear_up", "gear_down", "lifts", "throttle_slow", "throttle_rough",
  "steer", "line_same_brake", "line_turnin", "line_apex", "line_exit", "cons", "unknown_kind"];

// the cases: each a track, lap A against lap B, the session's laps, and what the app knows around them
function cases() {
  const out = [];
  const FOCUS = ["trail", "coast", "apex", "exit", "pick", "lifts", "line", "gear", "peak", "trail", "apex", "exit", "coast", "line"];
  for (let s = 1; s <= 16 + FOCUS.length; s++) {
    const r = rng(s * 7919), tk = track(r), amount = [1, 0.6, 1.4, 0.3][s % 4], focus = FOCUS[s - 17];
    const ga = s % 5 === 1 ? null : [46.95 + s * 0.01, 7.4];
    const gb = s % 7 === 3 ? [ga ? ga[0] + 0.001 : 46.9, 7.401] : ga;
    const sb = gb && ga && (gb[0] !== ga[0] || gb[1] !== ga[1]) ? { dx: -(gb[1] - ga[1]) * 111320 * Math.cos(ga[0] * Math.PI / 180), dy: -(gb[0] - ga[0]) * 110540 } : {};
    const tid = s % 3 === 0 ? null : 100 + s, onB = s % 4 === 2;
    const tkA = variant(tk, r, amount, focus), tkC = variant(tk, r, amount * 0.7), tkD = variant(tk, r, amount * 1.2);
    const secs = ["game", "bad", null][s % 3];
    const A = lapOf(tkA, { g: ga, drift: 0.004 * (s % 3), xy: s % 6 !== 5, noSteer: s % 8 === 7, h0: s * 0.3 }, { n: 4, trackId: onB ? null : tid, sectors: secs, holes: s % 5 === 4 ? [33, 34, 120] : null, maxBin: s % 4 !== 1 });
    const B = lapOf(tk, { g: gb, xy: s % 9 !== 8, h0: s * 0.3, ...sb }, { n: 2, trackId: onB ? tid : null, sectors: secs === "bad" ? "game" : secs });
    const C = lapOf(tkC, { g: ga, h0: s * 0.3 }, { n: 5 }), D = lapOf(tkD, { g: ga, h0: s * 0.3 }, { n: 6, valid: s % 2 === 0 });
    const turns = {};
    if (tid) turns[tid] = tk.corners.filter((c, k) => s % 4 !== 3 || k % 3 !== 1).map((c) => Math.round((c.ia / tk.n + r.f(-0.004, 0.004)) * 1e4) / 1e4).concat(s % 2 ? [0.995] : []).sort((p, q) => p - q);
    const W = { at: 1, w: { "brake_later|slow": 1.2, "trail|medium": 0.8, "apex_speed|fast": 1.3, "throttle|slow": 0.7 }, b: { "brake_late_apex|slow": { ask: 4, n: 40 }, "brake_earlier|medium": { ask: 3 }, "brake_later|fast": { ask: 2 }, "brake_later|slow": { ask: 60 } },
      off: new Set(s % 2 ? ["trail|medium", "apex_speed|slow", "throttle|fast"] : []), conf: false, min: 30 };
    const ME = { at: 1, habits: s % 3 === 1 ? [{ kind: ["brake_later", "trail", "apex_speed"][s % 3], tracks: 3 + (s % 2), sessions: 7 }] : [], w: s % 2 ? { "brake_later|slow": 1.1, "coast|medium": 0.9 } : {} };
    const cards = s % 4 === 0 ? [] : tk.corners.map((c, k) => ({ apex: c.ia * 5 + (k % 3) * 20, spread: (k % 4) * 0.05 + 0.01, spreadMax: 0.16 }));
    out.push({ name: "case" + s + (focus ? "-" + focus : ""), A, B, LP: [A, B, C, D], tid, turns, W, ME, cards });
  }
  return out;
}

const SETS = [{ lang: "en", units: "metric" }, { lang: "es", units: "metric" }, { lang: "en", units: "imperial" }, { lang: "es", units: "imperial" }];
const fresh = (l) => { const o = JSON.parse(JSON.stringify(l, (k, v) => (k === "_ser" || k === "_serN" ? undefined : v))); if (Array.isArray(l.bins)) o.bins = l.bins.map((b) => (b ? b.slice() : undefined)); return o; };
const hash = (v) => crypto.createHash("sha256").update(JSON.stringify(v)).digest("hex").slice(0, 20);

// everything the web's analyzer and coach show for one case
function answers(api, cs, set) {
  api.set({ ...set, turns: cs.turns, w: cs.W, me: cs.ME, cards: cs.cards });
  const A = fresh(cs.A), B = fresh(cs.B), LP = [A, B, fresh(cs.LP[2]), fresh(cs.LP[3])], tid = A.trackId || B.trackId;
  const sa = api.lapSeries(A), sb = api.lapSeries(B), n = Math.min(sa.end, sb.end);
  const cc = api.coachCompare(A, B);
  const out = {
    corners: cc.map((c) => ({ ...c, tip: c.tip.slice(0, 2) })),
    plan: (() => { const p = api.coachPlan(A, B, LP); return { ...p, cs: p.cs.map((c) => ({ ...c, tip: c.tip.slice(0, 2) })) }; })(),
    line: api.lineOffsets(A, B),
    brakeA: api.brakeZones(api.serOf(A)), brakeB: api.brakeZones(api.serOf(B)),
    zones: api.cornerZones(api.serOf(B), n, tid),
    secs: api.pairSecs(A, B, sa, sb, n),
    driving: api.lapDriving(sa, sb, n),
    cons: api.cornerConsistency(LP, B, tid), consNoTurns: api.cornerConsistency(LP, B),
    phasesHTML: api.coachPhasesHTML(cc, A, B, LP),
    analyzer: (api.renderLapAnalyzer(A, B), api.BOX.innerHTML),
    kinds: KINDS.map((k) => api.coachKindName(k)),
    step: api.stepText({ step: [{ apex: 300 }, { apex: 1700 }] }, A),
    turnNo: [0, 250, 1234.5, 2999].map((d) => api.turnNo(tid, d, n * 5, 9)),
  };
  return out;
}

const indexHtml = (p) => fs.readFileSync(p || new URL("web/dist/index.html", ROOT), "utf8");
const moduleSrc = () => fs.readFileSync(new URL("web/dist/pitwall-analysis.js", ROOT), "utf8");

if (process.argv[2] === "--capture") {
  // an index.html from before the module has the functions itself; a newer one runs the pitwall-analysis.js beside it
  const html = indexHtml(process.argv[3]), mod = new URL("pitwall-analysis.js", new URL(process.argv[3] || "web/dist/index.html", "file://" + process.cwd() + "/"));
  const api = appApi(html, /pitwall-analysis\.js/.test(html) ? fs.readFileSync(mod, "utf8") : null), fx = {};
  for (const cs of cases()) for (const set of SETS) {
    const a = answers(api, cs, set);
    fx[cs.name + ":" + set.lang + ":" + set.units] = Object.fromEntries(Object.entries(a).map(([k, v]) => [k, hash(v)]));
  }
  fs.writeFileSync(FIXTURE, JSON.stringify(fx, null, 1) + "\n");
  console.log("fixture written:", Object.keys(fx).length, "cases");
  process.exit(0);
}

const fx = JSON.parse(fs.readFileSync(FIXTURE, "utf8"));
const src = moduleSrc(), api = appApi(indexHtml(), src), PWA = api.PW_ANALYSIS;
assert.ok(PWA && typeof PWA.analyse === "function", "pitwall-analysis.js exposes PW_ANALYSIS.analyse");
assert.ok(/<script src="pitwall-analysis\.js"><\/script>/.test(indexHtml()), "index.html loads pitwall-analysis.js with a relative script tag");
// the module touches nothing of a page: no document, no window of its own, no storage, no network
assert.ok(!/\bdocument\b|localStorage|fetch\(|XMLHttpRequest/.test(src), "pitwall-analysis.js is pure");

let checked = 0;
const seen = new Set();
for (const cs of cases()) for (const set of SETS) {
  const key = cs.name + ":" + set.lang + ":" + set.units, want = fx[key];
  assert.ok(want, "fixture has " + key);
  const got = answers(api, cs, set);
  for (const [k, v] of Object.entries(got)) { assert.equal(hash(v), want[k], `${key} ${k}: the web's answer changed`); checked++; }
  got.corners.forEach((c) => seen.add(c.kind));
  got.plan.cs.forEach((c) => seen.add(c.kind));

  // the phones' way: laps and context as plain JSON (no functions, no Sets), one call, plain JSON back, the web's answers
  const A = fresh(cs.A), B = fresh(cs.B), LP = [fresh(cs.LP[2]), fresh(cs.LP[3])];
  const tid = A.trackId || B.trackId, ctx = { lang: set.lang, units: set.units, turns: tid ? cs.turns[tid] || null : null,
    weights: { w: cs.W.w, b: cs.W.b, off: [...cs.W.off] }, me: { w: cs.ME.w, habits: cs.ME.habits }, cards: cs.cards, laps: [A, B, ...LP] };
  const res = JSON.parse(PWA.analyse(JSON.parse(JSON.stringify(A)), JSON.parse(JSON.stringify(B)), JSON.parse(JSON.stringify(ctx)), { json: true }));
  const web = answers(api, cs, set);
  assert.deepEqual(res.corners.map((c) => ({ ...c, tip: c.tip.slice(0, 2), text: undefined })).map((c) => JSON.parse(JSON.stringify(c))), JSON.parse(JSON.stringify(web.corners)), key + " corners as the phones get them");
  assert.deepEqual(JSON.parse(JSON.stringify(res.coach.plan)), JSON.parse(JSON.stringify(web.plan.plan)), key + " plan as the phones get it");
  assert.deepEqual(res.coach.secs, JSON.parse(JSON.stringify(web.plan.secs)), key + " sectors as the phones get them");
  assert.equal(res.gap, cs.A.time - cs.B.time);
  res.corners.forEach((c) => {
    assert.equal(c.tip.length, 3, "every tip in English, Spanish and Portuguese");
    if (c.tip[0]) { assert.ok(c.tip[2] && !/undefined|NaN/.test(c.tip.join("|")), key + " T" + c.n + " tip " + c.kind); assert.equal(c.text, set.lang === "es" ? c.tip[1] : c.tip[0]); }
    else assert.equal(c.text, "");
  });
  // in Portuguese every text the module writes is Portuguese (never English left over), and every corner tip has one
  const pt = JSON.parse(PWA.analyse(JSON.parse(JSON.stringify(A)), JSON.parse(JSON.stringify(B)), { ...JSON.parse(JSON.stringify(ctx)), lang: "pt" }, { json: true }));
  pt.corners.forEach((c, i) => { if (c.tip[0]) { assert.equal(c.text, c.tip[2]); assert.notEqual(c.tip[2], c.tip[0], key + " Portuguese tip " + c.kind); } });
  pt.coach.plan.forEach((p) => { for (const f of ["t", "why", "how"]) assert.ok(!/undefined|NaN/.test(p[f] || ""), key + " pt plan " + f); });
  const en = res.coach.plan;
  pt.coach.plan.forEach((p, i) => { if (en[i] && en[i].why && set.lang === "en") assert.notEqual(p.why, en[i].why, key + " Portuguese plan " + p.k); });
}
// the cases reach most of what the coach can say
const missing = KINDS.filter((k) => !seen.has(k) && !["unknown_kind", "cons", "steer", "line_same_brake"].includes(k));
assert.ok(missing.length <= 6, "the cases reach the coach's tips; missing: " + missing.join(", "));
console.log(`analysis: ${checked} answers as before, ${seen.size} kinds of tip reached${missing.length ? " (not reached: " + missing.join(", ") + ")" : ""}`);
