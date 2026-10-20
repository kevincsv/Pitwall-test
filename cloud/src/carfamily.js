// Cars that are one car under several badges (the SF23's Toyota and Honda, NASCAR's Chevrolet, Ford and Toyota, the
// Supercars' Ford and Chevrolet) share one leaderboard, record, coach model and car card. A family is known by the
// car's name; its number is the first badge the server saw (car_families, migration 0045): every other badge's laps
// go under it as soon as it shows up (noteCar), each driver keeping their faster lap. Sessions keep their real car.

export const CAR_FAMILIES = [
  { key: "sf23", name: "Super Formula SF23", re: /^Super Formula SF23\b/i },
  { key: "cup-nextgen", name: "NASCAR Cup Series Next Gen", re: /^NASCAR Cup Series Next Gen\b/i },
  { key: "cup-gen6", name: "NASCAR Cup Series Gen 6", re: /^NASCAR (Cup|Monster Energy Cup) Series (Chevrolet|Ford|Toyota)\b/i },
  { key: "xfinity", name: "NASCAR Xfinity Series", re: /^NASCAR Xfinity\b/i },
  { key: "truck", name: "NASCAR Truck Series", re: /^NASCAR (Craftsman |Camping World |Gander (RV & )?Outdoors )?Truck\b/i },
  { key: "arca", name: "ARCA Menards Series", re: /^ARCA Menards\b/i },
  { key: "supercars-gen3", name: "Supercars Gen3", re: /^Supercars?\b.*\bGen ?3\b/i },
  { key: "supercars-gen2", name: "Supercars Gen2", re: /^Supercars? (Ford Mustang GT|Holden ZB Commodore)\b/i },
  { key: "v8supercars", name: "V8 Supercars", re: /^V8 Supercars?\b/i },
];

export const famRule = (name) => CAR_FAMILIES.find((f) => f.re.test(String(name || "").trim())) || null;
// the name a family's board shows (every badge's lap keeps its own name)
export const famName = (game, carId, name) => { const f = famRule(name); return f ? f.name : name; };

// game:car → { fam, at }; families change only when a new badge shows up, so a few minutes of memory is enough
const cache = new Map();
const TTL = 5 * 60e3;

export async function famId(env, game, carId) {
  const c = Math.trunc(+carId) || 0, g = game || "iracing";
  if (!c) return 0;
  const k = g + ":" + c, hit = cache.get(k);
  if (hit && Date.now() - hit.at < TTL) return hit.fam;
  const row = await env.DB.prepare("SELECT fam_id FROM car_families WHERE game=?1 AND car_id=?2").bind(g, c).first().catch(() => null);
  const fam = row ? row.fam_id : c;
  cache.set(k, { fam, at: Date.now() });
  return fam;
}
// every badge of the car's family (the car alone when it has none)
export async function famIds(env, game, carId) {
  const fam = await famId(env, game, carId);
  if (!fam) return [];
  const r = await env.DB.prepare("SELECT car_id FROM car_families WHERE game=?1 AND fam_id=?2").bind(game || "iracing", fam).all().catch(() => null);
  const ids = new Set([fam, ...((r && r.results) || []).map((x) => x.car_id)]);
  return [...ids];
}
export const famSql = async (env, game, carId) => (await famIds(env, game, carId)).map((n) => String(Math.trunc(n) || 0)).join(",");
// every family's badges by its number (the apps' lists: which of your own cars a board is)
export async function famGroups(env, game) {
  const r = await env.DB.prepare("SELECT car_id, fam_id FROM car_families WHERE game=?1").bind(game || "iracing").all().catch(() => null);
  const by = new Map();
  for (const x of (r && r.results) || []) { if (!by.has(x.fam_id)) by.set(x.fam_id, new Set([x.fam_id])); by.get(x.fam_id).add(x.car_id); }
  return by;
}

// a car seen with its name (a lap shared, a session saved): a badge of a family joins it, and its laps already on
// the server go under the family's number; returns the number its laps go under
export async function noteCar(env, game, carId, name) {
  const c = Math.trunc(+carId) || 0, g = game || "iracing", f = famRule(name);
  if (!c || !f || c >= 900000000) return famId(env, g, c); // no family, or a car the game gave no number (pseudoId)
  const k = g + ":" + c, hit = cache.get(k);
  if (hit && Date.now() - hit.at < TTL && hit.known) return hit.fam;
  const row = await env.DB.prepare("SELECT fam_id FROM car_families WHERE game=?1 AND car_id=?2").bind(g, c).first();
  if (row) { cache.set(k, { fam: row.fam_id, at: Date.now(), known: true }); return row.fam_id; }
  const head = await env.DB.prepare("SELECT fam_id FROM car_families WHERE game=?1 AND fam=?2 ORDER BY created LIMIT 1").bind(g, f.key).first();
  const fam = head ? head.fam_id : c;
  await env.DB.prepare("INSERT OR IGNORE INTO car_families (game, car_id, fam_id, fam, created) VALUES (?1,?2,?3,?4,?5)").bind(g, c, fam, f.key, Date.now()).run();
  if (fam !== c) await joinCar(env, g, c, fam);
  cache.set(k, { fam, at: Date.now(), known: true });
  return fam;
}

// a badge's laps on the boards and in the model's memory go under the family's number (each driver's faster lap of
// the two stays); its models and car cards are learnt again from both
async function joinCar(env, game, carId, fam) {
  await env.DB.batch([
    env.DB.prepare(`DELETE FROM community_laps WHERE game=?1 AND car_id=?3 AND EXISTS (SELECT 1 FROM community_laps o WHERE o.game=?1 AND o.car_id=?2
      AND o.user_id=community_laps.user_id AND o.track_id=community_laps.track_id AND o.time<community_laps.time)`).bind(game, carId, fam),
    env.DB.prepare("UPDATE OR IGNORE community_laps SET car_id=?3 WHERE game=?1 AND car_id=?2").bind(game, carId, fam),
    env.DB.prepare("DELETE FROM community_laps WHERE game=?1 AND car_id=?2").bind(game, carId),
    env.DB.prepare("UPDATE OR IGNORE model_laps SET car_id=?3 WHERE game=?1 AND car_id=?2").bind(game, carId, fam),
    env.DB.prepare("DELETE FROM model_laps WHERE game=?1 AND car_id=?2").bind(game, carId),
    env.DB.prepare("DELETE FROM model_cache WHERE game=?1 AND car_id IN (?2, ?3)").bind(game, carId, fam),
    env.DB.prepare("DELETE FROM car_cards WHERE game=?1 AND car_id IN (?2, ?3)").bind(game, carId, fam),
  ]);
}
