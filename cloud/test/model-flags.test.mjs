// node cloud/test/model-flags.test.mjs: what the model learns from, by a lap's flags and where it came from. A lap
// in traffic or on a wet track is left out; a rival's lap from its position (src "field") has estimated pedals, one
// with the pedals the game itself gave (src "real") is as real as an account's.
import assert from "node:assert/strict";
import { goodLap, cardOf, MODEL_VERSION } from "../src/model.js";

// a believable lap: 100 points at a steady 50 m/s, a time on every one, the pedals as driven
const d = Array.from({ length: 100 }, (_, i) => [50, 1, 0, 4, 0, i * 0.1]);
const time = 10;

assert.ok(goodLap(time, { d }), "a clean lap is learnt");
assert.ok(goodLap(time, { d, f: ["cold"] }), "cold tyres are still the driver's own lap");
assert.ok(goodLap(time, { d, f: ["cmp:2"] }), "the compound alone changes nothing");
assert.equal(goodLap(time, { d, f: ["traffic"] }), null, "a lap in traffic is left out");
assert.equal(goodLap(time, { d, f: ["wet"] }), null, "a wet lap is left out");
assert.equal(goodLap(time, { d, f: ["cold", "cmp:1", "wet"] }), null, "wet among other flags");
assert.ok(goodLap(time, { d, f: "wet" }), "flags that are not a list are no flags");

assert.equal(goodLap(time, { d }).field, false, "an account's lap is real");
assert.equal(goodLap(time, { d, src: "field" }).field, true, "a rival's lap from its position has estimated pedals");
assert.equal(goodLap(time, { d, src: "real" }).field, false, "a rival's lap with the game's own pedals is real");
assert.equal(goodLap(time, { d, src: "real" }).rival, true, "... and is a rival's");
assert.equal(goodLap(time, { d }).rival, false, "an account's lap is no rival's");

// a rival's real lap never teaches the car card what the car does at each speed: its speed comes from its position
const accel = Array.from({ length: 240 }, (_, i) => {
  const up = i < 160, v = up ? 10 + i * 0.3 : 58 - (i - 160) * 0.5;
  return [v, 0, up ? 1 : 0, up ? 0 : 1, Math.min(6, 1 + Math.floor(v / 12)), 0];
});
let t = 0;
for (const b of accel) { t += 5 / b[0]; b[1] = t; }
const laps = (rival) => [1, 2, 3].map((k) => ({ trackId: k, drv: "d" + k, time: t, bins: accel, rival }));
const own = cardOf(laps(false)), riv = cardOf(laps(true));
assert.ok(own.shifts.length > 0 && own.pedals, "the drivers' own laps give the shift speeds and the pedals' envelope");
assert.equal(riv.shifts.length, 0, "rivals' real laps give no shift speeds");
assert.equal(riv.pedals, null, "nor the pedals' envelope");
assert.ok(MODEL_VERSION >= 10, "the models are rebuilt for the wet laps and the real rivals");
console.log("ok");
