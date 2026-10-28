// node cloud/test/escrow.test.mjs: the data key the server keeps for the sign-ins with Steam or Discord. It is sealed with
// DATA_KEY (never in the clear), keeps the email only when it is the account's, and a sign-in gets it back (dataKey) or,
// with none kept, needKey.
import assert from "node:assert/strict";
import { sealEscrow, openEscrow, escrowLogin, isDataKey } from "../src/escrow.js";

const env = { DATA_KEY: "test-secret" }, other = { DATA_KEY: "another-secret" }, none = {};
const key = "0123456789abcdef".repeat(4), mine = async (e) => e === "ana@example.com";

assert.ok(isDataKey(key));
assert.equal(isDataKey(key.slice(2)), false, "a short key is no key");
assert.equal(isDataKey(key.toUpperCase()), false, "the key travels in lower-case hex");

const s = await sealEscrow(env, key, " Ana@Example.com ", mine);
assert.ok(s.value && s.value.startsWith("enc:"), "sealed with DATA_KEY");
assert.ok(!s.value.includes(key) && !s.value.includes("ana@"), "nothing readable in the column");
assert.deepEqual(await openEscrow(env, s.value), { key, email: "ana@example.com" });
assert.equal(await openEscrow(other, s.value), null, "another secret opens nothing");
assert.equal(await openEscrow(env, null), null, "no escrow");

const w = await sealEscrow(env, key, "bob@example.com", mine);
assert.deepEqual(await openEscrow(env, w.value), { key, email: "" }, "an email that is not the account's is not kept");
assert.equal((await sealEscrow(env, "nope", "", mine)).status, 400, "a malformed key is refused");
assert.equal((await sealEscrow(none, key, "", mine)).status, 503, "without DATA_KEY the key is never stored");
assert.equal(await openEscrow(none, s.value), null);

assert.deepEqual(await escrowLogin(env, { escrow: s.value }), { dataKey: key, email: "ana@example.com", escrow: true });
assert.deepEqual(await escrowLogin(env, { escrow: w.value }), { dataKey: key, email: undefined, escrow: true });
assert.deepEqual(await escrowLogin(env, { escrow: null }), { needKey: true, escrow: false }, "none kept: the password once");
assert.deepEqual(await escrowLogin(other, { escrow: s.value }), { needKey: true, escrow: false }, "one that cannot be opened: the password");
console.log("ok");
