// node cloud/test/braketable.test.mjs: the analyzer's braking points table and lap list, run from index.html's own
// functions. "What to do" is the tip of the phase that loses the most, never the line tip coachCompare adds after it
// (the phones say the same); the sector columns are the game's official sectors only, green only on a valid lap; the
// coach overlay's chosen corners count only on the track they were chosen for.
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import vm from "node:vm";

const html = readFileSync(new URL("../../web/dist/index.html", import.meta.url), "utf8");
// a top-level function of the page by its name, up to its closing brace
function fn(name) {
  const i = html.indexOf(`function ${name}(`);
  assert.ok(i >= 0, `${name} is in index.html`);
  let depth = 0, j = html.indexOf("{", i);
  for (; j < html.length; j++) {
    const ch = html[j];
    if (ch === "{") depth++;
    else if (ch === "}" && --depth === 0) break;
  }
  return html.slice(i, j + 1);
}
const ctx = { S: { WeekendInfo: { TrackID: 12 } }, window: {} };
vm.createContext(ctx);
// the analysis lives in pitwall-analysis.js (PWA in the page), the table's own functions in index.html
vm.runInContext(readFileSync(new URL("../../web/dist/pitwall-analysis.js", import.meta.url), "utf8"), ctx);
vm.runInContext("const PWA = window.PW_ANALYSIS;\n" + ["tipMain", "tipShort", "lapSecsOf", "lapSecCols", "coachTurnsHere"].map(fn).join("\n"), ctx);
const { tipMain, tipShort, lapSecCols, coachTurnsHere } = ctx, lineTip = ctx.window.PW_ANALYSIS.lineTip;

// a corner whose line tip went after the tip of the phase (the corner turned in 2 m more to the inside)
const line = { entry: 2, apex: 0, exit: 0 };
const lt = lineTip(line, false);
const main = ["You brake 12 m later than the reference and lose 5 km/h at the apex. Brake a little earlier and carry the speed",
  "Frenas 12 m más tarde que la referencia y pierdes 5 km/h en el vértice. Frena un poco antes y conserva la velocidad"];
const c = { tip: [main[0] + ". " + lt[0], main[1] + ". " + lt[1]], kind: "brake_late_apex", line, dd: 12, lost: .2 };
assert.deepEqual([...tipMain(c).slice(0, 2)], main, "the line tip goes, the phase's tip stays");
assert.equal(tipShort(tipMain(c)[0]), "Brake a little earlier and carry the speed");
assert.equal(tipShort(tipMain(c)[1]), "Frena un poco antes y conserva la velocidad");
// the Portuguese tip loses its line tip the same way
const pt = "Você freia 12 m mais tarde que a referência e perde 5 km/h no ápice. Freie um pouco antes e mantenha a velocidade";
assert.equal(tipMain({ ...c, tip: [...c.tip, pt + ". " + lt[3]] })[2], pt);
// a line tip that replaced a generic one is the corner's tip
const lc = { tip: [lt[0], lt[1]], kind: lt[2], line, dd: 12, lost: .2 };
assert.equal(tipShort(tipMain(lc)[0]), "Start the corner from the outside");
// a tip without a line tip, and the measurement before the instruction
assert.equal(tipShort(tipMain({ tip: ["Brake 12 m later", "Frena 12 m más tarde"], kind: "brake_later", line: null, dd: -12 })[0]), "Brake 12 m later");
assert.equal(tipShort("Do not coast before the apex. 30 m without throttle or brake (reference 10 m)"), "Do not coast before the apex");

// the sector columns: official sectors (that add up to the lap), green only on a valid lap
const best = { time: 90, sectors: [30, 30, 30], valid: true };
const cut = { time: 89, sectors: [29, 30, 30], valid: false };
const slow = { time: 91, sectors: [29.5, 30.5, 31], valid: true };
const SC = lapSecCols([best, cut, slow], best);
assert.equal((SC.heads.match(/<th/g) || []).length, 3, "S1 S2 S3");
assert.ok(!/class="r mono good"/.test(SC.cells(cut)) && !/pb/.test(SC.cells(cut)), "a lap that is not valid is never green nor purple");
assert.match(SC.cells(slow), /class="r mono pb">29\.500/, "the session's best S1 among the valid laps is purple");
// no official sectors (or sectors that do not add up to the lap): no columns, on the phones neither
assert.equal(lapSecCols([{ time: 90, sectors: [], valid: true, bins: [] }, { time: 91, sectors: [10, 10, 10], valid: true }], null).heads, "");

// the coach overlay's corners chosen at one track are not chosen at another
assert.deepEqual([...coachTurnsHere({ turns: ["T9", "T3"], turnsTrack: 12 })], ["T9", "T3"]);
ctx.S.WeekendInfo.TrackID = 40;
assert.deepEqual([...coachTurnsHere({ turns: ["T9", "T3"], turnsTrack: 12 })], []);
assert.deepEqual([...coachTurnsHere({ turns: ["T4"] })], ["T4"], "chosen before the track was kept: every track");
console.log("braketable ok");
