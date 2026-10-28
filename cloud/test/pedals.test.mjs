// node cloud/test/pedals.test.mjs: rivals' pedals estimated from their speed, against laps whose pedals are known.
// The laps are simulated with a simple car (power, drag, grip with downforce): the pedals make the speed, the speed
// is read back with the noise a rival's position has, and the estimate is compared with the pedals that made it.
import { pedalEnvelope, estimatePedals } from "../src/pedals.js";
import assert from "node:assert/strict";
import { cardOf } from "../src/model.js";

const car = {
  full: (v) => Math.min(9, 420 / Math.max(v, 1)) - 0.00045 * v * v,      // power-limited, drag
  coast: (v) => -(0.6 + 0.00045 * v * v + 0.8),                          // rolling, drag, engine braking
  brake: (v) => 14 + 0.0018 * v * v,                                     // grip with downforce
};
let seed = 7;
const rnd = () => ((seed = (seed * 16807) % 2147483647) / 2147483647);

// a lap as drivers drive it: full throttle on the straights (a short lift sometimes), the brake pressed in a tenth of a
// second, held, then released while turning in (trail braking), part throttle through the corner, fed in on the exit
function lap(variant) {
  const corners = [[600, 28], [1400, 45], [2100, 22], [2900, 60], [3500, 35]].map(([at, vc]) => [at, vc + variant * (rnd() - 0.5) * 4]);
  const d = [];
  let v = 30, ci = 0, phase = "exit", zone = null, thr = 0.5;
  for (let i = 0; i < 800; i++) {
    const pos = i * 5, [at, vc] = corners[Math.min(ci, corners.length - 1)];
    let brk = 0;
    const need = (v * v - vc * vc) / (2 * (car.brake(v) * 0.85 + 1));
    if (phase !== "brake" && ci < corners.length && pos >= at - need - 5) { phase = "brake"; zone = { from: pos, to: at, peak: 0.85 + 0.15 * rnd() }; }
    if (phase === "brake") {
      const f = (pos - zone.from) / Math.max(10, zone.to - zone.from);
      brk = f < 0.08 ? zone.peak * (0.4 + 0.6 * f / 0.08) : f < 0.6 ? zone.peak : Math.max(0.15, zone.peak * (1 - (f - 0.6) / 0.4));
      thr = 0;
      if (pos >= zone.to || v <= vc) { phase = "corner"; ci++; zone = { from: pos }; }
    } else if (phase === "corner") {
      thr = 0.35 + 0.15 * rnd();
      if (pos - zone.from > 40) phase = "exit";
    } else {
      thr = Math.min(1, thr + 0.05 + 0.03 * rnd());
      if (thr === 1 && rnd() < 0.01) thr = 0; // a lift
    }
    const a = brk > 0 ? car.coast(v) - brk * (car.brake(v) + car.coast(v)) : car.coast(v) + thr * (car.full(v) - car.coast(v));
    d.push({ v, thr, brk });
    v = Math.max(5, Math.sqrt(Math.max(1, v * v + 2 * a * 5)));
  }
  return d;
}
const toBins = (l, noise) => { let t = 0; return l.map((p) => { const b = [p.v + (noise ? (rnd() - 0.5) * noise : 0), t, p.thr, p.brk, 0, 0]; t += 5 / p.v; return b; }); };

// the old estimate (field.go): full throttle or none, brake from the drop of speed over 20 m
function old(bins) {
  const sp = bins.map((b) => b[0]), vmax = Math.max(...sp);
  return bins.map((b, i) => {
    const dv = sp[Math.min(sp.length - 1, i + 2)] - sp[Math.max(0, i - 2)];
    return dv < -0.8 ? [0, Math.min(1, -dv / 6)] : dv > 0.3 || b[0] > 0.85 * vmax ? [1, 0] : [0, 0];
  });
}
const mae = (truth, est) => {
  let t = 0, b = 0;
  truth.forEach((p, i) => { t += Math.abs(p.thr - est[i][0]); b += Math.abs(p.brk - est[i][1]); });
  return { thr: t / truth.length, brk: b / truth.length };
};

const learn = [1, 2, 3, 4, 5, 6].map((k) => toBins(lap(k), 0.1));
const pe = pedalEnvelope(learn);
assert.ok(pe, "an envelope from real laps");
// five rivals of the same car, their speed from their position (noisier than a recorded lap)
const sum = { e0: { thr: 0, brk: 0 }, e1: { thr: 0, brk: 0 }, e2: { thr: 0, brk: 0 }, z0: 0, z1: 0 };
let withCar = [];
for (const k of [9, 10, 11, 12, 13]) {
  const truth = lap(k), rival = toBins(truth, 0.6);
  withCar = estimatePedals(rival, pe, null).map((b) => [b[2], b[3]]);
  const alone = estimatePedals(rival, null, null).map((b) => [b[2], b[3]]), before = old(rival);
  for (const [key, est] of [["e1", withCar], ["e2", alone], ["e0", before]]) { const e = mae(truth, est); sum[key].thr += e.thr / 5; sum[key].brk += e.brk / 5; }
  // in the braking zones alone: how far the brake estimate is from the brake that was pressed
  const zone = truth.map((p, i) => [p, i]).filter(([p]) => p.brk > 0);
  sum.z0 += zone.reduce((s, [p, i]) => s + Math.abs(p.brk - before[i][1]), 0) / zone.length / 5;
  sum.z1 += zone.reduce((s, [p, i]) => s + Math.abs(p.brk - withCar[i][1]), 0) / zone.length / 5;
}
const { e0, e1, e2 } = sum;
console.log("mean error  throttle  brake  brake in braking zones");
console.log("before      " + e0.thr.toFixed(3) + "    " + e0.brk.toFixed(3) + "  " + sum.z0.toFixed(3));
console.log("lap alone   " + e2.thr.toFixed(3) + "    " + e2.brk.toFixed(3));
console.log("with car    " + e1.thr.toFixed(3) + "    " + e1.brk.toFixed(3) + "  " + sum.z1.toFixed(3));
const rival = toBins(lap(9), 0.6);
// part throttle is seen: values between 0 and 1, not only 0 or 1
assert.ok(withCar.some(([t]) => t > 0.2 && t < 0.8), "part throttle");
assert.ok(e1.thr < 0.7 * e0.thr, "the throttle much closer with the car's laps");
assert.ok(e1.brk < 1.1 * e0.brk && sum.z1 < sum.z0, "the brake no worse overall, closer where it is pressed");
assert.ok(e2.thr + e2.brk <= e0.thr + e0.brk, "no worse than before without them");
// gears from the car's shift speeds
const g = estimatePedals(rival, pe, [[1, 25], [2, 36], [3, 47]]).map((b) => b[4]);
assert.ok(Math.min(...g) >= 1 && Math.max(...g) <= 4, "gears");
// the car card learns it from real laps only, never from rivals' estimated ones
const card = cardOf([...learn.map((bins) => ({ trackId: 1, drv: "a", bins })), { trackId: 1, drv: "b", bins: toBins(lap(20), 0.6).map((b) => [b[0], b[1], 1, 0, 0, 0]), field: true }]);
assert.ok(card.pedals && card.pedals.full.length === 18, "the card's pedals");
assert.deepEqual(card.pedals, pedalEnvelope(learn), "rivals' laps never teach the card");
console.log("ok");
