// node cloud/test/model-compound.test.mjs: the model and the tyre compounds. A lap's compound comes from the agent's
// "cmp:<n>" flag (0 without it, unknown for a rival's lap); a car and track whose laps were driven on several compounds
// get the references of each one apart, and a client asking for its compound gets those, else the model of every lap.
import assert from "node:assert/strict";
import { lapCompound, compoundsOf, pickLaps, cleanLaps, refsOf, forCompound, MODEL_VERSION } from "../src/model.js";

assert.equal(lapCompound({ d: [], f: ["cmp:2"] }), 2, "the flag says the compound");
assert.equal(lapCompound({ d: [], f: ["cold", "cmp:1", "wet"] }), 1, "among other flags");
assert.equal(lapCompound({ d: [] }), 0, "an account's lap without the flag is on the first compound");
assert.equal(lapCompound({ d: [], f: ["traffic"] }), 0, "other flags say nothing of the tyres");
assert.equal(lapCompound({ d: [], src: "field" }), -1, "a rival's lap from its position: tyres unknown");
assert.equal(lapCompound({ d: [], src: "real" }), -1, "a rival's lap with its pedals: tyres unknown too");
assert.equal(lapCompound({ d: [], src: "field", f: ["cmp:3"] }), 3, "a rival's lap that says its compound has it");
assert.equal(lapCompound({ d: [], f: ["cmp:x"] }), 0, "a broken flag is no compound");

// which compounds get references of their own: several compounds, 5 laps each at least, rivals' laps never counted
const rows = (spec) => spec.flatMap(([cmp, k]) => Array.from({ length: k }, (_, i) => ({ drv: "d" + (i % 4), time: 90 + i * 0.1 + (cmp || 0), cmp })));
assert.deepEqual(compoundsOf(rows([[0, 20]])), [], "one compound: the model as before");
assert.deepEqual(compoundsOf(rows([[0, 20], [-1, 30]])), [], "rivals' laps are no second compound");
assert.deepEqual(compoundsOf(rows([[0, 20], [null, 30]])), [], "nor laps whose compound is not read yet");
assert.deepEqual(compoundsOf(rows([[0, 20], [2, 6]])), [0, 2], "two compounds with enough laps each");
assert.deepEqual(compoundsOf(rows([[0, 20], [2, 4]])), [0], "a compound with too few laps keeps to the model of every lap");
assert.deepEqual(compoundsOf(rows([[0, 4], [1, 4], [2, 9]])), [2], "only the compounds with enough laps");

// the best 3 laps of each driver, at most 80 laps
const many = Array.from({ length: 200 }, (_, i) => ({ drv: "d" + (i % 40), time: 90 + i * 0.01 }));
const p = pickLaps(many);
assert.equal(p.length, 80, "80 laps at most");
assert.ok([...new Set(p.map((x) => x.drv))].every((d) => p.filter((x) => x.drv === d).length <= 3), "3 per driver");
assert.equal(pickLaps([{ drv: "a", time: 1 }, { drv: "a", time: 2 }, { drv: "a", time: 3 }, { drv: "a", time: 4 }]).length, 4, "one driver alone gives up to 10");

// a believable lap of 400 points (2 km): a straight, a braking zone into a slow corner and back to speed;
// soft laps brake later and carry more speed than hard ones
function lap(drv, cmp, k) {
  const soft = cmp === 1, bins = [];
  const bp = soft ? 200 : 190, vmin = soft ? 30 : 27;
  let t = 0;
  for (let i = 0; i < 400; i++) {
    let v = 60 - k * 0.2, thr = 1, brk = 0;
    if (i >= bp && i < 230) { v = Math.max(vmin, 60 - (i - bp) * 2); thr = 0; brk = 0.9; }
    else if (i >= 230 && i < 260) { v = vmin + (i - 230) * 1; thr = 1; }
    bins.push([v, 0, thr, brk, 4, 0]);
  }
  for (const b of bins) { t += 5 / b[0]; b[1] = t; }
  return { time: t, bins, field: false, up: drv, cmp };
}
const soft = [1, 2, 3, 4, 5, 6].map((k) => lap("s" + k, 1, k)), hard = [1, 2, 3, 4, 5, 6].map((k) => lap("h" + k, 0, k));
const noPath = async () => null;
const all = await refsOf(cleanLaps([...soft, ...hard]), noPath);
const bySoft = await refsOf(cleanLaps(soft), noPath), byHard = await refsOf(cleanLaps(hard), noPath);
assert.ok(bySoft.idealTime < byHard.idealTime, "the soft tyres' record is faster");
assert.equal(all.idealTime, bySoft.idealTime, "the record of every lap is the softs'");
assert.equal(byHard.n, 6, "the hard tyres' references come from their laps only");
assert.ok(Math.abs(byHard.idealTime - Math.min(...hard.map((l) => l.time))) < 0.001, "the hard record is the fastest hard lap");
assert.ok(byHard.ladder.every((x) => hard.some((l) => Math.abs(l.time - x.time) < 0.001)), "the hard ladder is hard laps only");

// what the client gets
const md = { v: MODEL_VERSION, n: 12, idealTime: all.idealTime, ladder: all.ladder, corners: all.corners, times: [1, 2], byCmp: { 0: byHard, 1: bySoft } };
const def = forCompound(md, null);
assert.equal(def.byCmp, undefined, "the compounds apart never go out whole");
assert.deepEqual(def.cmps, [0, 1], "the compounds the model has apart");
assert.equal(def.idealTime, all.idealTime, "without a compound, the model of every lap");
assert.equal(def.cmp, undefined, "... saying no compound");
const h = forCompound(md, 0);
assert.equal(h.idealTime, byHard.idealTime, "the hard compound's record");
assert.equal(h.cmp, 0, "... saying which");
assert.deepEqual(h.times, [1, 2], "the pace of every driver stays");
assert.equal(forCompound(md, 5).idealTime, all.idealTime, "a compound the model does not have apart: every lap");
assert.equal(forCompound({ v: 1, n: 3, idealTime: 9 }, 1).cmps, undefined, "a model without compounds apart is as it was");
assert.ok(MODEL_VERSION >= 11, "the models are rebuilt with the compounds apart");
console.log("ok");
