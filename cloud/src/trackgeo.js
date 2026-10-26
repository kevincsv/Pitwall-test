// The corners of a track from the geometry of its layout (the path a lap really drove, every 5 m): a corner is a
// stretch where the path bends with a radius under TURN_RADIUS for TURN_MIN_M or more; its apex is where it bends the
// most; stretches bending the same way with less than TURN_GAP_M of straight between them are one corner (a long corner
// with a lighter middle, a double apex). The numbering follows the start line and the direction of the lap, T1 … Tn.
// It serves /community/turns when no admin placed the official turns, so every device (the coach, the analyzer, the
// overlays, the phones) numbers the same corners; braking says where time is lost, geometry says what a corner is.
const TURN_RADIUS = 300; // m: a bend tighter than this is a corner
const TURN_MIN_M = 20;   // m: for at least this long
const TURN_GAP_M = 60;   // m: two bends the same way closer than this are one corner
const SMOOTH = 3;        // points each side (±15 m) the heading is smoothed over

// the curvature (1/m, signed) at every point of a closed path sampled every step metres
export function curvature(x, y, step = 5) {
  const n = Math.min(x.length, y.length), k = new Array(n).fill(0);
  if (n < 20) return k;
  const at = (i) => ((i % n) + n) % n;
  const head = new Array(n);
  for (let i = 0; i < n; i++) {
    const a = at(i - SMOOTH), b = at(i + SMOOTH);
    head[i] = Math.atan2(y[b] - y[a], x[b] - x[a]);
  }
  for (let i = 0; i < n; i++) {
    let d = head[at(i + 1)] - head[at(i - 1)];
    while (d > Math.PI) d -= 2 * Math.PI;
    while (d < -Math.PI) d += 2 * Math.PI;
    k[i] = d / (2 * step);
  }
  return k;
}

// the corners of a closed path: [{i (apex point), from, to, dir (1 left, -1 right), r (radius at the apex, m)}] in lap order
export function cornersOf(x, y, step = 5) {
  const n = Math.min(x.length, y.length);
  if (n < 20) return [];
  const k = curvature(x, y, step), lim = 1 / TURN_RADIUS, minPts = Math.max(2, Math.round(TURN_MIN_M / step)), gapPts = Math.round(TURN_GAP_M / step);
  // the stretches over the limit, each one way
  const runs = [];
  let i = 0;
  // start on a straight so a corner across the line is seen whole
  let start = 0;
  while (start < n && Math.abs(k[start]) > lim) start++;
  if (start >= n) return [];
  for (let c = 0; c < n; c++) {
    i = (start + c) % n;
    const s = Math.abs(k[i]) > lim ? Math.sign(k[i]) : 0;
    const last = runs[runs.length - 1];
    if (s && last && last.dir === s && last.open) last.pts.push(i);
    else if (s) { if (last) last.open = false; runs.push({ dir: s, pts: [i], open: true }); }
    else if (last && last.open) { last.open = false; }
  }
  // merge runs the same way with a short straight between them
  const merged = [];
  for (const r of runs) {
    const last = merged[merged.length - 1];
    const gap = last ? ((r.pts[0] - last.pts[last.pts.length - 1]) + n) % n : 1e9;
    if (last && last.dir === r.dir && gap <= gapPts) last.pts.push(...r.pts);
    else merged.push({ dir: r.dir, pts: r.pts.slice() });
  }
  const out = [];
  for (const r of merged) {
    if (r.pts.length < minPts) continue;
    let apex = r.pts[0];
    for (const p of r.pts) if (Math.abs(k[p]) > Math.abs(k[apex])) apex = p;
    out.push({ i: apex, from: r.pts[0], to: r.pts[r.pts.length - 1], dir: r.dir, r: Math.round(1 / Math.max(Math.abs(k[apex]), 1e-6)) });
  }
  // in lap order from the line (the first corner after it is T1)
  out.sort((a, b) => a.i - b.i);
  return out;
}

// the corners as the turns API gives them: fractions of the lap (0 ≤ f < 1) of each apex, T1 … Tn
export function turnsFromPath(x, y) {
  const n = Math.min(x.length, y.length);
  return cornersOf(x, y).map((c) => Math.round((c.i / n) * 1e5) / 1e5);
}
