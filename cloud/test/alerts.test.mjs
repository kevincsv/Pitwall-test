// node cloud/test/alerts.test.mjs: the phones' notifications (migration 0081, alertslib.js): a beaten record goes to the
// account that had it (never for beating your own, the model's laps or an anonymous driver's name), the alerts route,
// turning notifications on and off, and Monday's summary of the week
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { DatabaseSync } from "node:sqlite";
import { recordBeaten, handleAlerts, weeklyAlerts, weekNote, pruneAlerts, SQL_PBS } from "../src/alertslib.js";
import { sessionSummary } from "../src/sessionsum.js";

const db = new DatabaseSync(":memory:");
const stmt = (sql) => {
  const s = { args: [], bind(...a) { s.args = a; return s; },
    first: async () => { const r = db.prepare(sql).get(...s.args); return r ? { ...r } : null; },
    all: async () => ({ results: db.prepare(sql).all(...s.args).map((x) => ({ ...x })) }),
    run: async () => db.prepare(sql).run(...s.args) };
  return s;
};
const env = { DB: { prepare: stmt } };
db.exec(`CREATE TABLE accounts (id TEXT PRIMARY KEY, display TEXT);
  CREATE TABLE community_users (id TEXT PRIMARY KEY, alias TEXT, owner TEXT);
  CREATE TABLE community_laps (id TEXT PRIMARY KEY, user_id TEXT, car_id INTEGER, track_id INTEGER, time REAL, game TEXT, shown TEXT);
  CREATE TABLE sessions (id TEXT PRIMARY KEY, started INTEGER NOT NULL, track TEXT, track_config TEXT, car TEXT, kind TEXT, laps INTEGER DEFAULT 0, best REAL,
    uploader TEXT, game TEXT, pos INTEGER, field INTEGER, pos_cls INTEGER, secs REAL, drvs TEXT);
  CREATE INDEX sessions_uploader_started ON sessions(uploader, started DESC);`);
db.exec(readFileSync(new URL("../migrations/0081_alerts.sql", import.meta.url), "utf8"));
db.exec(`INSERT INTO accounts VALUES ('ana','Ana'), ('bo','Bo');
  INSERT INTO community_users VALUES ('ana','Ana',NULL), ('bo','Bo',NULL), ('guest-1','Cris','ana'), ('o:x','',NULL);
  INSERT INTO community_laps VALUES ('l1','ana',1,10,90.5,'iracing','nick'), ('l2','bo',1,10,91.2,'iracing','nick'), ('m1','o:x',2,10,80,'iracing','model');`);

const lap = { game: "iracing", trackId: 10, carId: 1, track: "Spa", car: "GT3", time: 90.1, shown: "nick" };
assert.equal(await recordBeaten(env, "bo", { ...lap, time: 90.6 }), null, "slower than the record");
assert.equal(await recordBeaten(env, "ana", lap), null, "beating your own record");
assert.equal(await recordBeaten(env, "guest-1", lap), null, "a DRINKS driver of the same account");
assert.equal(await recordBeaten(env, "o:x", lap), null, "the model's laps");
assert.equal(await recordBeaten(env, "bo", { ...lap, shown: "model" }), null);
const b = await recordBeaten(env, "bo", lap, 1000);
assert.equal(b.account, "ana"); assert.equal(b.by, "Bo"); assert.equal(b.was, 90.5);
assert.equal((await recordBeaten(env, "bo", { ...lap, carId: 2, time: 79 }, 1000)), null, "the model's lap is no record");
db.exec("UPDATE community_laps SET user_id='guest-1' WHERE id='l1'");
assert.equal((await recordBeaten(env, "bo", { ...lap, anon: true }, 2000)).account, "ana", "a DRINKS driver's record goes to its account");

const deps = { sessionAccount: async (req) => { const t = req.headers.get("authorization"); const id = t && t.slice(7); return id ? { id } : null; } };
const call = async (method, path, body, who, now = 3000) => {
  const h = { "content-type": "application/json" }; if (who) h.authorization = "Bearer " + who;
  const req = new Request("https://pitlanehq.app" + path, { method, headers: h, body: body == null ? undefined : JSON.stringify(body) });
  const r = await handleAlerts(req, env, new URL(req.url), deps, now);
  return r && { status: r.status, body: await r.json() };
};
assert.equal(await call("GET", "/community/other", null, "ana"), null);
assert.equal((await call("GET", "/community/alerts")).status, 401);
const all = (await call("GET", "/community/alerts?since=0", null, "ana")).body;
assert.equal(all.alerts.length, 2); assert.equal(all.alerts[0].created, 2000); assert.equal(all.alerts[0].by, "", "an anonymous driver's name never goes");
assert.equal(all.alerts[1].kind, "record_beaten"); assert.equal(all.alerts[1].track, "Spa");
assert.equal((await call("GET", "/community/alerts?since=1500", null, "ana")).body.alerts.length, 1);
assert.equal((await call("GET", "/community/alerts?since=0", null, "bo")).body.alerts.length, 0);

assert.equal((await call("GET", "/community/alerts/on", null, "ana")).body.on, false);
assert.equal((await call("POST", "/community/alerts/on", { on: true, lang: "es-ES" }, "ana")).body.on, true);
assert.equal(db.prepare("SELECT lang FROM alert_subs WHERE account_id='ana'").get().lang, "es");
await call("POST", "/community/alerts/on", { on: true, lang: "de" }, "bo");
assert.equal(db.prepare("SELECT lang FROM alert_subs WHERE account_id='bo'").get().lang, "en", "English, Spanish and Portuguese only");

// Monday's summary
assert.equal(weekNote({ sessions: 0 }, [], "en"), null);
const sum = { sessions: 3, laps: 41, secs: 5520, races: 1, top5: 1 };
assert.deepEqual(weekNote(sum, [{}], "en"), { title: "Your week in Pitlane HQ", text: "3 sessions, 41 laps and 1 h 32 min on track. 1 race, 1 in the top 5. 1 new personal best." });
assert.equal(weekNote(sum, [], "pt").title, "Sua semana no Pitlane HQ");
for (const l of ["en", "es", "pt"]) assert.ok(!/[;:]/.test(weekNote(sum, [{}, {}], l).text), "no ; or : (" + l + ")");
const now = Date.UTC(2026, 10, 2, 8), day = 864e5;
const ses = (id, t, best, pos) => db.prepare("INSERT INTO sessions (id, started, track, car, kind, laps, best, uploader, game, pos, field, secs) VALUES (?,?,?,?,?,?,?,?,?,?,?,?)").run(id, t, "Spa", "GT3", pos ? "Race" : "Practice", 10, best, "acct:ana", "iracing", pos, pos ? 20 : null, 1200);
ses("old", now - 20 * day, 138.2, null); ses("w1", now - 2 * day, 137.9, null); ses("w2", now - day, 138.5, 4);
assert.equal((await db.prepare(SQL_PBS).all("acct:ana", now - 7 * day)).length, 1);
const run = await weeklyAlerts(env, { sessionSummary }, now);
assert.deepEqual(run, { due: 2, written: 1 }, "Bo did not drive");
const wk = (await call("GET", "/community/alerts?since=" + (now - 1), null, "ana", now + 1)).body.alerts[0];
assert.equal(wk.kind, "week"); assert.equal(wk.title, "Tu semana en Pitlane HQ"); assert.match(wk.text, /^2 sesiones, 20 vueltas/);
assert.deepEqual(await weeklyAlerts(env, { sessionSummary }, now + 3600e3), { due: 0, written: 0 }, "once a week");
await call("POST", "/community/alerts/on", { on: false }, "ana");
assert.equal((await call("GET", "/community/alerts/on", null, "ana")).body.on, false);

await pruneAlerts(env, now + 31 * day);
assert.equal(db.prepare("SELECT COUNT(*) AS n FROM alerts").get().n, 0);
console.log("alerts ok");
