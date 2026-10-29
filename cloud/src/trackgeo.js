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

// the corners of a closed path: [{i (apex point), from, to, dir (1 left, -1 right), r (radius at the apex, m)}] in lap order.
// want: the official number of turns when the game says it (iRacing's WeekendInfo.TrackNumTurns): the geometry is then
// fitted to it (fitCount); without it, the corners as the geometry finds them.
export function cornersOf(x, y, step = 5, want = 0) {
  const n = Math.min(x.length, y.length);
  if (n < 20) return [];
  const k = curvature(x, y, step);
  const cs = want > 0 && want <= 60 ? fitCount(k, n, step, want) : cornersAt(k, n, step, TURN_RADIUS);
  return cs.map(({ pts, ...c }) => c);
}

// the corners with a radius limit: the stretches over it, each one way, with their points (pts, in lap order)
function cornersAt(k, n, step, radius) {
  const lim = 1 / radius, minPts = Math.max(2, Math.round(TURN_MIN_M / step)), gapPts = Math.round(TURN_GAP_M / step);
  const runs = [];
  // start on a straight so a corner across the line is seen whole
  let start = 0;
  while (start < n && Math.abs(k[start]) > lim) start++;
  if (start >= n) return [];
  for (let c = 0; c < n; c++) {
    const i = (start + c) % n;
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
  return order(merged.filter((r) => r.pts.length >= minPts).map((r) => corner(k, r.dir, r.pts)));
}

function corner(k, dir, pts) {
  let apex = pts[0];
  for (const p of pts) if (Math.abs(k[p]) > Math.abs(k[apex])) apex = p;
  return { i: apex, from: pts[0], to: pts[pts.length - 1], dir, r: Math.round(1 / Math.max(Math.abs(k[apex]), 1e-6)), pts };
}
// in lap order from the line (the first corner after it is T1)
const order = (cs) => cs.sort((a, b) => a.i - b.i);

// ---------- the official number of turns ----------
// The geometry finds the bends; the game says how many turns the track has. More bends than turns: the two closest
// neighbours bending the same way with under MERGE_GAP_M between them become one corner (a double apex), and when no
// such pair is left the gentlest bend (the widest radius at its apex) is no turn. Fewer: a corner with two clear apexes
// (two peaks of curvature at least SPLIT_MIN_M apart, the bend between them easing to under SPLIT_DIP of the smaller
// peak) becomes two, the clearest first; still fewer, the radius limit is relaxed step by step (RELAX) and the same
// rules applied. Turns are never invented on a straight: when even the widest limit finds fewer, the closest result stays.
const MERGE_GAP_M = 100;
const SPLIT_MIN_M = 30;
const SPLIT_DIP = 0.6;
const RELAX = [TURN_RADIUS, 400, 550, 750, 1000];

export function fitCount(k, n, step, want) {
  let best = [];
  for (const radius of RELAX) {
    let cs = splitTo(cornersAt(k, n, step, radius), k, want, step);
    if (cs.length >= want) return reduceTo(cs, want, n, step, k);
    if (cs.length > best.length) best = cs;
  }
  return best;
}

// split corners with two clear apexes until there are want (or none is left to split)
function splitTo(cs, k, want, step) {
  cs = cs.slice();
  const minPts = Math.round(SPLIT_MIN_M / step), w = 3;
  while (cs.length < want) {
    let pick = null;
    cs.forEach((c, ci) => {
      const a = c.pts.map((p) => Math.abs(k[p])), m = a.length;
      if (m < 2 * minPts) return;
      // the peaks of the bend (the most curved point of its ±15 m), the two strongest far enough apart
      const peaks = [];
      for (let j = 0; j < m; j++) {
        let top = true;
        for (let d = -w; d <= w && top; d++) if (d && j + d >= 0 && j + d < m && a[j + d] > a[j]) top = false;
        if (top) peaks.push(j);
      }
      peaks.sort((p, q) => a[q] - a[p]);
      const p1 = peaks[0], p2 = peaks.find((p) => Math.abs(p - p1) >= minPts);
      if (p1 == null || p2 == null) return;
      const lo = Math.min(p1, p2), hi = Math.max(p1, p2);
      let dip = lo;
      for (let j = lo; j <= hi; j++) if (a[j] < a[dip]) dip = j;
      const ratio = a[dip] / Math.min(a[p1], a[p2]);
      if (ratio < SPLIT_DIP && (!pick || ratio < pick.ratio)) pick = { ci, dip, ratio };
    });
    if (!pick) break;
    const c = cs[pick.ci];
    cs.splice(pick.ci, 1, corner(k, c.dir, c.pts.slice(0, pick.dip + 1)), corner(k, c.dir, c.pts.slice(pick.dip + 1)));
    order(cs);
  }
  return cs;
}

// join or drop bends until there are want
function reduceTo(cs, want, n, step, k) {
  cs = order(cs.slice());
  const gapMax = Math.round(MERGE_GAP_M / step);
  while (cs.length > want && cs.length > 1) {
    let pick = -1, best = 1e9;
    for (let j = 0; j < cs.length; j++) {
      const a = cs[j], b = cs[(j + 1) % cs.length];
      if (a === b || a.dir !== b.dir) continue;
      const gap = ((b.from - a.to) + n) % n;
      if (gap <= gapMax && gap < best) { best = gap; pick = j; }
    }
    if (pick >= 0) {
      const a = cs[pick], j2 = (pick + 1) % cs.length, b = cs[j2];
      const joined = corner(k, a.dir, a.pts.concat(b.pts));
      cs = cs.filter((c, j) => j !== pick && j !== j2);
      cs.push(joined);
    } else {
      let g = 0;
      cs.forEach((c, j) => { if (c.r > cs[g].r) g = j; });
      cs.splice(g, 1);
    }
    order(cs);
  }
  return cs;
}

// the corners as the turns API gives them: fractions of the lap (0 ≤ f < 1) of each apex, T1 … Tn (want: the official
// number of turns when known)
export function turnsFromPath(x, y, want = 0) {
  const n = Math.min(x.length, y.length);
  return cornersOf(x, y, 5, want).map((c) => Math.round((c.i / n) * 1e5) / 1e5);
}

// ---------- the racing line between two paths ----------
// How far path A was to one side of path B at every point (m, + to B's left), like the apps' lineOffsets: both paths on
// the same 5 m grid and in one frame; the slow drift of dead reckoning taken out with a ±400 m moving average; NaN where
// the two do not line up. Null when the paths are not the same track.
export function lineOffsets(ax, ay, bx, by) {
  const n = Math.min(ax.length, ay.length, bx.length, by.length);
  if (n < 60) return null;
  const lat = new Array(n), lon = new Array(n);
  for (let i = 0; i < n; i++) {
    const i0 = Math.max(0, i - 2), i1 = Math.min(n - 1, i + 2);
    let tx = bx[i1] - bx[i0], ty = by[i1] - by[i0];
    const tm = Math.hypot(tx, ty) || 1;
    tx /= tm; ty /= tm;
    const dx = ax[i] - bx[i], dy = ay[i] - by[i];
    lat[i] = -ty * dx + tx * dy;
    lon[i] = tx * dx + ty * dy;
  }
  const W = 80, sm = (v) => { const pre = [0]; v.forEach((x, i) => pre.push(pre[i] + x)); return v.map((x, i) => { const lo = Math.max(0, i - W), hi = Math.min(n - 1, i + W); return x - (pre[hi + 1] - pre[lo]) / (hi - lo + 1); }); };
  const lc = sm(lat), oc = sm(lon), ab = oc.map(Math.abs).sort((p, q) => p - q);
  if (ab[n >> 1] > 6) return null;
  return lc.map((v, i) => (Math.abs(oc[i]) > 20 || Math.abs(v) > 25 ? NaN : v));
}

// path B moved into path A's frame: both from the game's position (with their origins g) or both without; null when one is each
export function sameFrame(a, b) {
  if (!a || !b || !!a.g !== !!b.g) return null;
  if (!a.g || (a.g[0] === b.g[0] && a.g[1] === b.g[1])) return b;
  const dx = (b.g[1] - a.g[1]) * 111320 * Math.cos((a.g[0] * Math.PI) / 180), dy = (b.g[0] - a.g[0]) * 110540;
  return { ...b, x: b.x.map((v) => v + dx), y: b.y.map((v) => v + dy) };
}

// which side is the inside of path B's corner at its apex point: +1 when B's left is the inside, -1 when its right
export function insideSign(bx, by, apex) {
  const n = Math.min(bx.length, by.length);
  if (apex <= 0 || apex >= n - 1) return 0;
  const tan = (i) => { const i0 = Math.max(0, i - 2), i1 = Math.min(n - 1, i + 2), tx = bx[i1] - bx[i0], ty = by[i1] - by[i0], m = Math.hypot(tx, ty) || 1; return [tx / m, ty / m]; };
  const t1 = tan(Math.max(0, apex - 8)), t2 = tan(Math.min(n - 1, apex + 8)), cr = t1[0] * t2[1] - t1[1] * t2[0];
  if (Math.abs(cr) < 0.05) return 0;
  return cr < 0 ? -1 : 1;
}
