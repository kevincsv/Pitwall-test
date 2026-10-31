// node cloud/test/push.test.mjs: instant notifications on the phones (migration 0082, pushlib.js): a phone's Firebase
// token is kept while its notifications are on and forgotten when they go off, a new alert wakes the account's phones
// through FCM HTTP v1 with a signed service-account token, nothing is sent without FCM_SERVICE_ACCOUNT, and a token
// Firebase no longer knows is deleted
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { DatabaseSync } from "node:sqlite";
import { pushAccount, isPushToken, serviceAccount, forgetToken, prunePushTokens } from "../src/pushlib.js";
import { handleAlerts, recordBeaten } from "../src/alertslib.js";

const db = new DatabaseSync(":memory:");
const stmt = (sql) => {
  const s = { args: [], bind(...a) { s.args = a; return s; },
    first: async () => { const r = db.prepare(sql).get(...s.args); return r ? { ...r } : null; },
    all: async () => ({ results: db.prepare(sql).all(...s.args).map((x) => ({ ...x })) }),
    run: async () => db.prepare(sql).run(...s.args) };
  return s;
};
db.exec(`CREATE TABLE accounts (id TEXT PRIMARY KEY);
  CREATE TABLE community_users (id TEXT PRIMARY KEY, alias TEXT, owner TEXT);
  CREATE TABLE community_laps (id TEXT PRIMARY KEY, user_id TEXT, car_id INTEGER, track_id INTEGER, time REAL, game TEXT, shown TEXT);`);
db.exec(readFileSync(new URL("../migrations/0081_alerts.sql", import.meta.url), "utf8"));
db.exec(readFileSync(new URL("../migrations/0082_push_tokens.sql", import.meta.url), "utf8"));
db.exec(`INSERT INTO accounts VALUES ('ana'), ('bo'); INSERT INTO community_users VALUES ('ana','Ana',NULL), ('bo','Bo',NULL);
  INSERT INTO community_laps VALUES ('l1','ana',1,10,90.5,'iracing','nick');`);

// a real RSA key, as the Firebase console gives it (PKCS8 PEM)
const kp = await crypto.subtle.generateKey({ name: "RSASSA-PKCS1-v1_5", modulusLength: 2048, publicExponent: new Uint8Array([1, 0, 1]), hash: "SHA-256" }, true, ["sign", "verify"]);
const der = Buffer.from(await crypto.subtle.exportKey("pkcs8", kp.privateKey)).toString("base64");
const sa = { type: "service_account", project_id: "pitlanehq-test", client_email: "push@pitlanehq-test.iam.gserviceaccount.com",
  private_key: "-----BEGIN PRIVATE KEY-----\n" + der.match(/.{1,64}/g).join("\n") + "\n-----END PRIVATE KEY-----\n" };

const sent = [];
let tokenCalls = 0;
const fakeFetch = async (url, o) => {
  if (url === "https://oauth2.googleapis.com/token") {
    tokenCalls++;
    const jwt = new URLSearchParams(o.body).get("assertion").split(".");
    const claim = JSON.parse(Buffer.from(jwt[1], "base64url").toString());
    assert.equal(claim.iss, sa.client_email); assert.equal(claim.scope, "https://www.googleapis.com/auth/firebase.messaging");
    const ok = await crypto.subtle.verify("RSASSA-PKCS1-v1_5", kp.publicKey, Buffer.from(jwt[2], "base64url"), new TextEncoder().encode(jwt[0] + "." + jwt[1]));
    assert.ok(ok, "the JWT is signed with the service account's key");
    return new Response(JSON.stringify({ access_token: "at-1", expires_in: 3599 }));
  }
  assert.equal(url, "https://fcm.googleapis.com/v1/projects/pitlanehq-test/messages:send");
  assert.equal(o.headers.authorization, "Bearer at-1");
  const m = JSON.parse(o.body).message;
  sent.push(m);
  if (m.token.startsWith("gone")) return new Response(JSON.stringify({ error: { status: "NOT_FOUND", details: [{ errorCode: "UNREGISTERED" }] } }), { status: 404 });
  return new Response(JSON.stringify({ name: "projects/x/messages/1" }));
};

const T1 = "tok1:" + "a".repeat(140), T2 = "gone:" + "b".repeat(140);
assert.ok(isPushToken(T1)); assert.ok(!isPushToken("short")); assert.ok(!isPushToken("x".repeat(30) + " <script>"));
assert.equal(serviceAccount({}), null); assert.equal(serviceAccount({ FCM_SERVICE_ACCOUNT: "{" }), null);
assert.equal(serviceAccount({ FCM_SERVICE_ACCOUNT: JSON.stringify(sa) }).project_id, "pitlanehq-test");

// the phone turns notifications on with its token, and off again
const deps = { sessionAccount: async (req) => { const t = req.headers.get("authorization"); return t ? { id: t.slice(7) } : null; } };
const env0 = { DB: { prepare: stmt } };
const call = async (body, who, now = 1000) => {
  const req = new Request("https://pitlanehq.app/community/alerts/on", { method: "POST", headers: { "content-type": "application/json", authorization: "Bearer " + who }, body: JSON.stringify(body) });
  return (await handleAlerts(req, env0, new URL(req.url), deps, now)).json();
};
await call({ on: true, lang: "en", push: { token: T1, platform: "android" } }, "ana");
await call({ on: true, lang: "en", push: { token: T2, platform: "android" } }, "ana");
await call({ on: true, lang: "en", push: { token: "not a token" } }, "ana");
assert.equal(db.prepare("SELECT COUNT(*) AS n FROM push_tokens WHERE account_id='ana'").get().n, 2);
await call({ on: true, lang: "en", push: { token: T1 } }, "bo", 2000);
assert.equal(db.prepare("SELECT account_id FROM push_tokens WHERE token=?").get(T1).account_id, "bo", "a phone signed in to another account moves");
await call({ on: false, push: { token: T1 } }, "bo");
assert.equal(db.prepare("SELECT COUNT(*) AS n FROM push_tokens").get().n, 1, "off forgets that phone");
await call({ on: true, lang: "en", push: { token: T1 } }, "ana", 3000);

// nothing goes without the secret
assert.deepEqual(await pushAccount(env0, "ana", "alerts", { fetch: fakeFetch }), { sent: 0, gone: 0 });
assert.equal(sent.length, 0);

// with it: a data message to each phone, the access token asked once, a token Firebase forgot is deleted
forgetToken();
const env = { DB: { prepare: stmt }, FCM_SERVICE_ACCOUNT: JSON.stringify(sa) };
assert.deepEqual(await pushAccount(env, "ana", "alerts", { fetch: fakeFetch, now: 5000 }), { sent: 1, gone: 1 });
assert.equal(sent.length, 2);
assert.deepEqual(sent.find((m) => m.token === T1).data, { kind: "alerts" }, "only says there is something new");
assert.equal(sent[0].android.priority, "HIGH");
assert.ok(!sent.some((m) => m.notification), "no text through Google");
assert.equal(db.prepare("SELECT COUNT(*) AS n FROM push_tokens").get().n, 1);
await pushAccount(env, "ana", "alerts", { fetch: fakeFetch, now: 6000 });
assert.equal(tokenCalls, 1, "the access token is kept for the hour");
assert.deepEqual(await pushAccount(env, "bo", "alerts", { fetch: fakeFetch }), { sent: 0, gone: 0 }, "no phone");

// a beaten record wakes the phones of the account that had it
let woke = null;
const env2 = { DB: { prepare: stmt }, push: async (e, acc) => { woke = acc; return { sent: 1 }; } };
await recordBeaten(env2, "bo", { game: "iracing", trackId: 10, carId: 1, track: "Spa", car: "GT3", time: 90.1, shown: "nick" }, 7000);
assert.equal(woke, "ana");

await prunePushTokens(env, 3000 + 271 * 864e5);
assert.equal(db.prepare("SELECT COUNT(*) AS n FROM push_tokens").get().n, 0, "270 days unused");
console.log("push ok");
