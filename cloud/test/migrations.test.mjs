// node cloud/test/migrations.test.mjs: every migration applies in order to an empty database, with no number used twice,
// so a broken migration never reaches a deploy
import assert from "node:assert/strict";
import { readFileSync, readdirSync } from "node:fs";
import { DatabaseSync } from "node:sqlite";

const dir = new URL("../migrations/", import.meta.url);
const files = readdirSync(dir).filter((f) => f.endsWith(".sql")).sort();
const nums = files.map((f) => Number(f.slice(0, 4)));
nums.forEach((n, i) => assert.ok(Number.isInteger(n) && (i === 0 || n > nums[i - 1]), `migration ${files[i]} reuses or breaks the numbering`));
const db = new DatabaseSync(":memory:");
for (const f of files) {
  try { db.exec(readFileSync(new URL(f, dir), "utf8")); }
  catch (e) { assert.fail(`${f} does not apply: ${e.message}`); }
}
for (const t of ["sessions", "laps", "accounts"]) assert.ok(db.prepare("SELECT name FROM sqlite_master WHERE type='table' AND name=?").get(t), `table ${t}`);
console.log(`migrations ok (${files.length})`);
