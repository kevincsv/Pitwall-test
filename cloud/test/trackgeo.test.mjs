// node cloud/test/trackgeo.test.mjs: a track's corners from its layout, fitted to the official number of turns
// (iRacing's TrackNumTurns): more bends than turns join or drop the gentlest, fewer split a double apex or relax the
// radius, and no turn is ever made on a straight.
import assert from "node:assert/strict";
import { cornersOf, turnsFromPath } from "../src/trackgeo.js";

// a closed path every 5 m from pieces [length m, radius m (+ left, - right, 0 straight)]; the pieces "W" and "S" are the
// straights going west and south, as long as the lap needs to close; the last metres of error are spread over the lap
function walk(pieces) {
  const x = [], y = [];
  let px = 0, py = 0, h = 0;
  for (const [len, r] of pieces) {
    for (let s = 0; s < len; s += 5) {
      x.push(px); y.push(py);
      if (r) h += 5 / r;
      px += 5 * Math.cos(h); py += 5 * Math.sin(h);
    }
  }
  return { x, y, px, py };
}
function track(pieces) {
  const probe = walk(pieces.map((p) => (p === "W" || p === "S" ? [0, 0] : p)));
  const t = walk(pieces.map((p) => (p === "W" ? [Math.round(probe.px / 5) * 5, 0] : p === "S" ? [Math.round(probe.py / 5) * 5, 0] : p)));
  const n = t.x.length;
  return { x: t.x.map((v, i) => v - (t.px * i) / n), y: t.y.map((v, i) => v - (t.py * i) / n), n };
}
const Q = (r) => [(Math.PI / 2) * Math.abs(r), r]; // a 90° corner of radius r
const near = (got, want, n, tol = 12) => want.every((w) => got.some((g) => Math.abs(g.i - w) <= tol || Math.abs(g.i - w) >= n - tol));

// a rectangle of four 90° left corners with a left-right kink in the middle of the first straight
{
  const t = track([[300, 0], [60, 250], [40, 0], [60, -250], [300, 0], Q(50), [500, 0], Q(50), "W", Q(50), "S", Q(50)]);
  const free = cornersOf(t.x, t.y);
  assert.equal(free.length, 6, "the geometry alone sees the kink as two bends");
  const fit = cornersOf(t.x, t.y, 5, 4);
  assert.equal(fit.length, 4, "four official turns: the kink is no turn");
  assert.ok(fit.every((c) => c.r < 100), "the four kept are the real corners");
  assert.equal(turnsFromPath(t.x, t.y, 4).length, 4);
}

// a double apex: two 45° bends with 40 m between them are one corner, five official turns split it
{
  const half = (r) => [(Math.PI / 4) * r, r];
  const t = track([[500, 0], half(40), [40, 0], half(40), [500, 0], Q(50), "W", Q(50), "S", Q(50)]);
  assert.equal(cornersOf(t.x, t.y).length, 4, "one corner with a double apex");
  const fit = cornersOf(t.x, t.y, 5, 5);
  assert.equal(fit.length, 5, "split in two at its clearest dip");
  assert.equal(cornersOf(t.x, t.y, 5, 3).length, 3, "three official turns: the closest same-way pair or the gentlest goes");
}

// the same count: the geometry's corners as they are
{
  const t = track([[500, 0], Q(50), [700, 0], Q(50), "W", Q(50), "S", Q(50)]);
  const a = cornersOf(t.x, t.y), b = cornersOf(t.x, t.y, 5, 4);
  assert.deepEqual(b, a);
  assert.deepEqual(turnsFromPath(t.x, t.y, 4), turnsFromPath(t.x, t.y));
  // more turns than the track has: nothing is invented on its straights
  assert.equal(cornersOf(t.x, t.y, 5, 10).length, 4);
}

// two gentle bends (radius 350) are found once the limit is relaxed for six official turns
{
  const t = track([[300, 0], [120, 350], [300, 0], Q(50), [500, 0], [120, -350], [300, 0], Q(50), "W", Q(50), "S", Q(50)]);
  assert.equal(cornersOf(t.x, t.y).length, 4);
  const fit = cornersOf(t.x, t.y, 5, 6);
  assert.equal(fit.length, 6);
  assert.ok(near(fit, cornersOf(t.x, t.y).map((c) => c.i), t.n), "the real corners keep their apex");
}
console.log("trackgeo ok");
