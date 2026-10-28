// The pedals of a lap known only by its speed (a rival's lap, "field": the PC sees where every car is, never its pedals).
// What the car does is learnt from the real laps of the same car on any track (the car card's "pedals"): at each speed,
// how hard it accelerates at full throttle, how much it slows with no pedal (drag and engine braking) and how hard it
// stops at full brake. The rival's acceleration at each point, against those three, says how much throttle or brake it
// took: partial throttle and partial brake, never only 0 or 100 %. The gear comes from the speeds the car shifts up at.
// Without real laps of the car, the lap's own envelope stands in (its strongest acceleration and braking at each speed).
// Bins are the model's: [speed m/s, time s, throttle 0-1, brake 0-1, gear, steering] every 5 m.

const BIN = 5;          // metres between two points
const VSTEP = 5;        // m/s per speed band of the envelope
const BANDS = 18;       // up to 90 m/s
const MIN_SAMPLES = 8;  // samples a band needs to say something

const band = (v) => Math.max(0, Math.min(BANDS - 1, Math.floor(v / VSTEP)));
const clamp01 = (x) => (x < 0 ? 0 : x > 1 ? 1 : x);
const q = (a, p) => {
  if (!a.length) return null;
  const s = [...a].sort((x, y) => x - y);
  return s[Math.min(s.length - 1, Math.max(0, Math.round(p * (s.length - 1))))];
};

// the speed smoothed over ±w points (the positions a rival's speed comes from are noisy), never below 1 m/s
function smooth(v, w) {
  const n = v.length, out = new Array(n);
  for (let i = 0; i < n; i++) {
    let s = 0, k = 0;
    for (let j = i - w; j <= i + w; j++) if (j >= 0 && j < n) { s += v[j]; k++; }
    out[i] = Math.max(1, s / k);
  }
  return out;
}

// the acceleration at every point (m/s²), over ±span points: (v₂² − v₁²) / 2d
function accel(v, span) {
  const n = v.length, a = new Array(n);
  for (let i = 0; i < n; i++) {
    const p = Math.max(0, i - span), r = Math.min(n - 1, i + span);
    a[i] = r > p ? (v[r] * v[r] - v[p] * v[p]) / (2 * BIN * (r - p)) : 0;
  }
  return a;
}

// a band left empty takes the nearest bands' values (in a straight line between them, or the end one)
function fill(arr) {
  const idx = arr.map((x, i) => (x == null ? -1 : i)).filter((i) => i >= 0);
  if (!idx.length) return null;
  return arr.map((x, i) => {
    if (x != null) return x;
    const lo = idx.filter((j) => j < i).pop(), hi = idx.find((j) => j > i);
    if (lo == null) return arr[hi];
    if (hi == null) return arr[lo];
    return arr[lo] + ((arr[hi] - arr[lo]) * (i - lo)) / (hi - lo);
  });
}

// what a car does at each speed band, from real laps (their pedals recorded): full-throttle acceleration, the
// slowing with no pedal, the full-brake deceleration (positive). null without enough of them.
export function pedalEnvelope(laps) {
  const full = Array.from({ length: BANDS }, () => []), coast = Array.from({ length: BANDS }, () => []), brake = Array.from({ length: BANDS }, () => []);
  for (const bins of laps) {
    if (!Array.isArray(bins) || bins.length < 60) continue;
    const v = smooth(bins.map((b) => +b[0] || 0), 1), a = accel(v, 2);
    for (let i = 2; i < bins.length - 2; i++) {
      const thr = +bins[i][2] || 0, brk = +bins[i][3] || 0, b = band(v[i]);
      // the pedal held for the 20 m the acceleration is measured over
      let steady = true;
      for (let j = i - 2; j <= i + 2; j++) if (Math.abs((+bins[j][2] || 0) - thr) > 0.1 || (Math.abs(j - i) < 2 && Math.abs((+bins[j][3] || 0) - brk) > 0.15)) steady = false;
      if (!steady) continue;
      if (thr >= 0.97 && brk < 0.02) full[b].push(a[i]);
      else if (thr < 0.03 && brk < 0.02) coast[b].push(a[i]);
      else if (brk >= 0.7 && thr < 0.03) brake[b].push(-a[i] / brk); // as if at full brake
    }
  }
  const pick = (arr, p) => arr.map((s) => (s.length >= MIN_SAMPLES ? q(s, p) : null));
  const f = fill(pick(full, 0.6)), c = fill(pick(coast, 0.5)), b = fill(pick(brake, 0.8));
  if (!f || !b) return null;
  const r2 = (x) => Math.round(x * 100) / 100;
  return { full: f.map(r2), coast: (c || GUESS_COAST).map(r2), brake: b.map(r2) };
}

// with no pedal a car slows a little, more at speed (drag): a guess when nothing says better
const GUESS_COAST = Array.from({ length: BANDS }, (_, k) => -(0.6 + 0.0005 * (k * VSTEP + VSTEP / 2) ** 2));

// the envelope of one lap by itself (no real laps of the car): its strongest acceleration and braking at each speed
function ownEnvelope(v, a) {
  const up = Array.from({ length: BANDS }, () => []), dn = Array.from({ length: BANDS }, () => []);
  for (let i = 0; i < v.length; i++) (a[i] >= 0 ? up : dn)[band(v[i])].push(Math.abs(a[i]));
  const f = fill(up.map((s) => (s.length >= 3 ? q(s, 0.9) : null))) || new Array(BANDS).fill(4);
  const b = fill(dn.map((s) => (s.length >= 3 ? q(s, 0.95) : null))) || new Array(BANDS).fill(10);
  return { full: f, coast: GUESS_COAST, brake: b.map((x) => Math.max(x, 4)) };
}

// the value of an envelope at a speed, between the middles of its bands
function at(env, v) {
  const x = v / VSTEP - 0.5, i = Math.max(0, Math.min(BANDS - 2, Math.floor(x))), f = Math.max(0, Math.min(1, x - i));
  return env[i] + (env[i + 1] - env[i]) * f;
}

// the pedals and the gear of a lap from its speed: bins in the model's form, a new array (speed and time untouched).
// pe: the car's envelope (pedalEnvelope) or null; shifts: the car card's [[gear, speed it shifts up at (m/s)]]
export function estimatePedals(bins, pe, shifts) {
  if (!Array.isArray(bins) || bins.length < 20) return bins;
  const raw = bins.map((b) => +b[0] || 0);
  // the throttle from the speed smoothed over 25 m and its slope over 30 m (part throttle is a small slope); the brake,
  // whose slope is large and starts sharply, over less (it would start late and end late)
  const v = smooth(raw, 2), a = accel(v, 3), vb = smooth(raw, 1), ab = accel(vb, 2);
  const env = pe && Array.isArray(pe.full) && pe.full.length === BANDS ? pe : ownEnvelope(v, a);
  const n = bins.length, thr = new Array(n), brk = new Array(n);
  for (let i = 0; i < n; i++) {
    const f = Math.max(0.3, at(env.full, v[i])), c = Math.min(f - 0.2, at(env.coast, v[i])), b = Math.max(2, at(env.brake, v[i]));
    if (ab[i] < c - 1.5 && a[i] < c - 0.4) { brk[i] = clamp01((c - ab[i]) / (b + c)); thr[i] = 0; }
    else if (a[i] > c + 0.2) { thr[i] = clamp01((a[i] - c) / (f - c)); brk[i] = 0; }
    else { thr[i] = 0; brk[i] = 0; }
    if (thr[i] > 0.92) thr[i] = 1; // what the car gives at full throttle is a spread: near it is full
  }
  // the throttle over 15 m, so the noise of the speed never makes it flicker
  const sm = (x) => x.map((_, i) => (x[Math.max(0, i - 1)] + x[i] + x[Math.min(n - 1, i + 1)]) / 3);
  const T = sm(thr), B = brk;
  const ups = (Array.isArray(shifts) ? shifts : []).filter((s) => Array.isArray(s) && s[1] > 0).sort((x, y) => x[0] - y[0]);
  return bins.map((x, i) => {
    let g = +x[4] || 0;
    if (ups.length) { g = 1; for (const [gear, sp] of ups) if (v[i] > sp) g = gear + 1; }
    return [x[0], x[1], Math.round(T[i] * 100) / 100, Math.round(B[i] * 100) / 100, g, x[5] || 0];
  });
}

// the same for a trace as it is stored and served ({d: [[speed, thr, brk, gear, steer, time]…], src: "field"})
export function estimateTrace(tr, pe, shifts) {
  if (!tr || tr.src !== "field" || !Array.isArray(tr.d)) return tr;
  const bins = tr.d.map((x) => [+x[0], +x[5], +x[1] || 0, +x[2] || 0, +x[3] || 0, +x[4] || 0]);
  const est = estimatePedals(bins, pe, shifts);
  return { ...tr, d: tr.d.map((x, i) => [x[0], est[i][2], est[i][3], est[i][4], x[4], x[5]]), est: 2 };
}
