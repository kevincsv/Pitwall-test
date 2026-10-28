// An account's own driver of a game (driver_links, migration 0067; /link-driver and the admin's unlink-driver in
// community.js): what other PCs shared of that driver as a race rival in the game goes under the account (per car and
// track the faster lap stays), and so do their laps still to come. One driver of each game per account and one account
// per driver of each game, the first account linked keeps it.
// iRacing's driver is its own id, which nobody can take. Le Mans Ultimate gives none: a driver is the name the game
// shows (lmuDriverID on the PC), which anyone can type into their profile. So in every game but iRacing the link waits
// until the account's own PC has seen that name at the wheel on LINK_DAYS different days (driver_link_seen), keeps what
// it moved (driver_link_moves) so an admin's undo gives the laps back to the rival, and an undone link never comes back
// by itself (its "undone" row).
import { moveDriver, moveDriverBack, markModel } from "./model.js";

export const LINK_DAYS = 3;
const UNDONE = "undone";
const rid = () => [...crypto.getRandomValues(new Uint8Array(12))].map((x) => x.toString(16).padStart(2, "0")).join("");
const proofNeeded = (game) => game !== "iracing";
const COL = /^[a-z_][a-z0-9_]*$/;

// a row as SELECT * gave it, written again (the columns are the table's own)
function insertRow(env, table, row) {
  const cols = Object.keys(row).filter((c) => COL.test(c));
  return env.DB.prepare(`INSERT OR IGNORE INTO ${table} (${cols.join(", ")}) VALUES (${cols.map((_, i) => "?" + (i + 1)).join(", ")})`).bind(...cols.map((c) => row[c] ?? null));
}

// the PC of account acct saw its own driver oid (the server's id of the driver's key) at the wheel in game.
// { linked, moved } when linked; { linked: false, days, need } while the evidence is not enough yet; { linked: false,
// undone: true } when an admin undid this link; { error, status } when the driver or the account is taken
export async function linkDriver(env, acct, oid, game, deps = {}) {
  const move = deps.moveDriver || moveDriver, mark = deps.markModel || markModel, now = deps.now || Date.now();
  const had = await env.DB.prepare("SELECT oid, account_id FROM driver_links WHERE game=?3 AND (oid=?1 OR account_id=?2)").bind(oid, acct, game).all();
  for (const x of had.results || []) {
    if (x.oid === oid && x.account_id === acct) return { linked: true, moved: 0 };
    if (x.oid === oid) return { error: "this driver is already linked to another account", status: 409 };
    return { error: "this account is already linked to another driver", status: 409 };
  }
  const acc = await env.DB.prepare("SELECT anon, name_kind FROM accounts WHERE id=?1").bind(acct).first();
  if (!acc) return { error: "sign in with your Pitlane HQ account", status: 401 };
  const proof = proofNeeded(game);
  if (proof) {
    const undone = await env.DB.prepare("SELECT 1 AS x FROM driver_link_seen WHERE game=?1 AND oid=?2 AND account_id=?3 AND day=?4").bind(game, oid, acct, UNDONE).first();
    if (undone) return { linked: false, undone: true };
    await env.DB.prepare("INSERT OR IGNORE INTO driver_link_seen (game, oid, account_id, day) VALUES (?1,?2,?3,?4)").bind(game, oid, acct, new Date(now).toISOString().slice(0, 10)).run();
    const seen = await env.DB.prepare("SELECT COUNT(*) AS n FROM driver_link_seen WHERE game=?1 AND oid=?2 AND account_id=?3 AND day<>?4").bind(game, oid, acct, UNDONE).first();
    const days = (seen && seen.n) || 0;
    if (days < LINK_DAYS) return { linked: false, days, need: LINK_DAYS };
  }
  await env.DB.prepare("INSERT INTO driver_links (game, oid, account_id, created) VALUES (?4,?1,?2,?3)").bind(oid, acct, now, game).run();
  const shown = acc.name_kind === "iracing" ? "iracing" : "nick";
  // what was shared of them as a rival in this game only
  const laps = (await env.DB.prepare("SELECT * FROM community_laps WHERE user_id=?1 AND game=?2").bind(oid, game).all()).results || [];
  const q = [], combos = new Set();
  const keep = (kind, row) => { if (proof) q.push(env.DB.prepare("INSERT INTO driver_link_moves (game, account_id, oid, kind, row, created) VALUES (?1,?2,?3,?4,?5,?6)").bind(game, acct, oid, kind, JSON.stringify(row), now)); };
  for (const l of laps) {
    const mine = await env.DB.prepare("SELECT * FROM community_laps WHERE user_id=?1 AND car_id=?2 AND track_id=?3 AND game=?4").bind(acct, l.car_id, l.track_id, l.game).first();
    combos.add(l.game + "|" + l.track_id + "|" + l.car_id);
    const take = env.DB.prepare("UPDATE community_laps SET user_id=?2, anon=?3, shown=?4 WHERE id=?1").bind(l.id, acct, acc.anon ? 1 : 0, shown);
    if (!mine) { keep("took", l); q.push(take); continue; }
    const better = mine.time > l.time || (mine.trace == null && l.trace != null); // the same rule as keepBestLap
    if (better) { keep("dropped", mine); keep("took", l); q.push(env.DB.prepare("DELETE FROM community_laps WHERE id=?1").bind(mine.id), take); }
    else { keep("dropped", l); q.push(env.DB.prepare("DELETE FROM community_laps WHERE id=?1").bind(l.id)); }
  }
  if (proof) { const who = await env.DB.prepare("SELECT * FROM community_users WHERE id=?1").bind(oid).first(); if (who) keep("user", who); }
  // the rival goes when nothing of them is left (their laps of another game stay theirs)
  q.push(env.DB.prepare("DELETE FROM community_users WHERE id=?1 AND NOT EXISTS (SELECT 1 FROM community_laps WHERE user_id=?1)").bind(oid));
  await env.DB.batch(q);
  const learnt = await move(env, "acct:" + oid, "acct:" + acct, game);
  if (proof && Array.isArray(learnt) && learnt.length) await env.DB.prepare("INSERT INTO driver_link_moves (game, account_id, oid, kind, row, created) VALUES (?1,?2,?3,'model',?4,?5)").bind(game, acct, oid, JSON.stringify(learnt.map((x) => ({ game: x.game, track_id: x.track_id, car_id: x.car_id, time: x.time }))), now).run();
  for (const c of combos) { const [g, tr, ca] = c.split("|"); await mark(env, g, +tr, +ca); }
  return { linked: true, moved: laps.length };
}

// an admin undoes an account's link of one game (every game's without one): the rival's laps still to come go back to
// the rival of a race; where the link kept what it moved (every game but iRacing), what it took goes back to the rival
// too (a lap the account replaced since stays the account's, the rival's comes back beside it), and that link never
// comes back by itself
export async function unlinkDriver(env, acct, game, deps = {}) {
  const back = deps.moveDriverBack || moveDriverBack, mark = deps.markModel || markModel;
  const links = (await env.DB.prepare("SELECT game, oid FROM driver_links WHERE account_id=?1" + (game ? " AND game=?2" : "")).bind(...(game ? [acct, game] : [acct])).all()).results || [];
  let restored = 0;
  for (const { game: g, oid } of links) {
    const moves = ((await env.DB.prepare("SELECT kind, row FROM driver_link_moves WHERE account_id=?1 AND game=?2 AND oid=?3 ORDER BY id").bind(acct, g, oid).all()).results || [])
      .map((x) => { try { return { kind: x.kind, row: JSON.parse(x.row) }; } catch (e) { return null; } }).filter(Boolean);
    const q = [], combos = new Set();
    // the rival first, then the laps it took (the row still the same lap goes back; one replaced since comes back
    // beside it), then the laps the link had dropped
    for (const { row } of moves.filter((x) => x.kind === "user")) q.push(insertRow(env, "community_users", row));
    for (const { row } of moves.filter((x) => x.kind === "took")) {
      combos.add(row.game + "|" + row.track_id + "|" + row.car_id);
      const now = await env.DB.prepare("SELECT user_id, time FROM community_laps WHERE id=?1").bind(row.id).first();
      if (now && now.user_id === acct && Math.abs(now.time - row.time) < 1e-6) q.push(env.DB.prepare("UPDATE community_laps SET user_id=?2, anon=?3, shown=?4 WHERE id=?1").bind(row.id, row.user_id, row.anon ?? 0, row.shown ?? null));
      else q.push(insertRow(env, "community_laps", now ? { ...row, id: rid() } : row));
      restored++;
    }
    for (const { row } of moves.filter((x) => x.kind === "dropped")) {
      combos.add(row.game + "|" + row.track_id + "|" + row.car_id);
      q.push(insertRow(env, "community_laps", row));
      if (row.user_id === oid) restored++;
    }
    if (proofNeeded(g)) q.push(env.DB.prepare("INSERT OR IGNORE INTO driver_link_seen (game, oid, account_id, day) VALUES (?1,?2,?3,?4)").bind(g, oid, acct, UNDONE));
    q.push(env.DB.prepare("DELETE FROM driver_links WHERE account_id=?1 AND game=?2").bind(acct, g));
    q.push(env.DB.prepare("DELETE FROM driver_link_moves WHERE account_id=?1 AND game=?2").bind(acct, g));
    await env.DB.batch(q);
    for (const { row } of moves.filter((x) => x.kind === "model")) await back(env, row, "acct:" + acct, "acct:" + oid);
    for (const c of combos) { const [cg, tr, ca] = c.split("|"); await mark(env, cg, +tr, +ca); }
  }
  return { unlinked: links.length, restored };
}
