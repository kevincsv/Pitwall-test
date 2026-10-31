// node cloud/test/digest.test.mjs: the weekly email (migration 0080, digestlib.js): turning it on and off, the email of
// a week in each language with its personal bests, the link that turns it off and Monday's job
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { DatabaseSync } from "node:sqlite";
import { handleDigest, sendDigests, digestMail, pbsOf, lapStr, offToken, SQL_PBS } from "../src/digestlib.js";
import { sessionSummary } from "../src/sessionsum.js";

const db = new DatabaseSync(":memory:");
const stmt = (sql) => {
  const s = { args: [], bind(...a) { s.args = a; return s; },
    first: async () => { const r = db.prepare(sql).get(...s.args); return r ? { ...r } : null; },
    all: async () => ({ results: db.prepare(sql).all(...s.args).map((x) => ({ ...x })) }),
    run: async () => db.prepare(sql).run(...s.args) };
  return s;
};
const env = { DB: { prepare: stmt }, DATA_KEY: "k" };
db.exec(`CREATE TABLE accounts (id TEXT PRIMARY KEY, display TEXT, escrow TEXT);
  CREATE TABLE sessions (id TEXT PRIMARY KEY, started INTEGER NOT NULL, track TEXT, track_config TEXT, car TEXT, kind TEXT, laps INTEGER DEFAULT 0, best REAL,
    uploader TEXT, game TEXT, pos INTEGER, field INTEGER, pos_cls INTEGER, secs REAL, drvs TEXT);
  CREATE INDEX sessions_uploader_started ON sessions(uploader, started DESC);`);
db.exec(readFileSync(new URL("../migrations/0080_weekly_digest.sql", import.meta.url), "utf8"));
db.exec("INSERT INTO accounts VALUES ('ana','Ana','esc:ana'), ('bo','Bo','esc:bo')");

assert.equal(lapStr(83.456), "1:23.456"); assert.equal(lapStr(59.1), "59.100"); assert.equal(lapStr(121.05), "2:01.050");
assert.deepEqual(pbsOf([{ track: "Spa", car: "GT3", b: 137, before: 138 }, { track: "Monza", car: "GT3", b: 100, before: null }, { track: "Imola", car: "GT3", b: 99, before: 98 }]).map((x) => x.track), ["Spa"], "a first time is no personal best");
assert.equal(digestMail({ sessions: 0 }, [], "en", "x"), null, "no email for a week without driving");
const sum = { sessions: 3, laps: 41, secs: 5520, races: 1, top5: 1, best: { pos: 2, track: "Spa", car: "Porsche 911 GT3 R" } };
const en = digestMail(sum, [{ track: "Spa", car: "Porsche 911 GT3 R", b: 137.456 }], "en", "https://off");
assert.equal(en.subject, "Your week in Pitlane HQ");
assert.ok(en.text.startsWith("3 sessions, 41 laps and 1 h 32 min on track.\n1 race, 1 in the top 5. Your best finish was P2 at Spa in the Porsche 911 GT3 R.\nNew personal best at Spa in the Porsche 911 GT3 R, 2:17.456."), en.text);
assert.ok(en.text.endsWith("https://off"));
assert.equal(digestMail(sum, [], "es", "x").subject, "Tu semana en Pitlane HQ");
assert.equal(digestMail(sum, [], "de", "x").lang, "en", "English, Spanish and Portuguese only");
for (const l of ["en", "es", "pt"]) assert.ok(!/[;:](?!\/\/)/.test(digestMail(sum, [{ track: "Spa", car: "GT3", b: 137 }], l, "").text.replace(/\d+:\d/g, "")), "no ; or : in the text (" + l + ")");

// on and off
const deps = { sessionAccount: async (req) => { const t = req.headers.get("authorization"); const id = t && t.slice(7); return id ? { ...db.prepare("SELECT * FROM accounts WHERE id=?").get(id) } : null; } };
const call = async (method, path, body, who) => {
  const h = { "content-type": "application/json" }; if (who) h.authorization = "Bearer " + who;
  const req = new Request("https://pitlanehq.app" + path, { method, headers: h, body: body == null ? undefined : JSON.stringify(body) });
  const r = await handleDigest(req, env, new URL(req.url), deps);
  if (!r) return null;
  const t = await r.text(); let j = t; try { j = JSON.parse(t); } catch (e) {}
  return { status: r.status, body: j };
};
assert.equal((await call("GET", "/community/digest")).status, 401);
assert.equal((await call("GET", "/community/digest", null, "ana")).body.on, false);
assert.equal((await call("POST", "/community/digest", { on: true, lang: "es-ES" }, "ana")).body.on, true);
assert.equal(db.prepare("SELECT lang FROM digest_subs WHERE account_id='ana'").get().lang, "es");
await call("POST", "/community/digest", { on: true, lang: "pt" }, "bo");
assert.equal((await call("GET", "/community/digest/off?a=bo&t=wrong")).status, 400);
const off = await call("GET", "/community/digest/off?a=bo&t=" + (await offToken(env, "bo")));
assert.equal(off.status, 200); assert.match(off.body, /Email semanal desligado/);
assert.equal(db.prepare("SELECT COUNT(*) AS n FROM digest_subs WHERE account_id='bo'").get().n, 0);

// Monday's job
const now = Date.UTC(2026, 10, 2, 8), day = 864e5;
const ses = (id, t, track, car, best, pos) => db.prepare("INSERT INTO sessions (id, started, track, car, kind, laps, best, uploader, game, pos, field, secs) VALUES (?,?,?,?,?,?,?,?,?,?,?,?)").run(id, t, track, car, pos ? "Race" : "Practice", 10, best, "acct:ana", "iracing", pos, pos ? 20 : null, 1200);
ses("old", now - 20 * day, "Spa", "GT3", 138.2, null); ses("w1", now - 2 * day, "Spa", "GT3", 137.9, null); ses("w2", now - 1 * day, "Spa", "GT3", 138.5, 4);
const pbRows = db.prepare(SQL_PBS).all("acct:ana", now - 7 * day).map((x) => ({ ...x }));
assert.deepEqual(pbsOf(pbRows).map((x) => x.b), [137.9]);
db.exec("UPDATE digest_subs SET sent_at=0");
const out = [];
const run = await sendDigests(env, { openEscrow: async (e, s) => ({ email: s.slice(4) + "@example.com" }), sessionSummary, send: async (e, to, m) => { out.push([to, m]); return true; } }, now);
assert.deepEqual(run, { due: 1, sent: 1 });
assert.equal(out[0][0], "ana@example.com"); assert.equal(out[0][1].subject, "Tu semana en Pitlane HQ");
assert.match(out[0][1].text, /^2 sesiones, 20 vueltas/); assert.match(out[0][1].text, /Nuevo récord personal en Spa con el GT3, 2:17\.900\./);
assert.deepEqual(await sendDigests(env, { openEscrow: async () => null, sessionSummary, send: async () => true }, now + 3600e3), { due: 0, sent: 0 }, "once a week");
console.log("digest ok");
