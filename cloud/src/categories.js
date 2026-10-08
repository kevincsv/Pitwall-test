// The discipline of a car and track, as iRacing splits its licenses: Oval, Sports Car, Formula Car, Dirt Oval
// and Dirt Road. From the season schedule the server keeps (each week names its category, its track and its
// cars), then from what the PC saw in the session, then from the car's and the track's names.
export const CATS = ["oval", "sports_car", "formula_car", "dirt_oval", "dirt_road"];
export const LICS = ["R", "D", "C", "B", "A", "P"];
let MEMO = { stamp: -1, map: { tc: {}, c: {} } };

export async function catMap(env) {
  const c = await env.DB.prepare("SELECT updated, chunks FROM season_cache WHERE k='current'").first().catch(() => null);
  if (!c) return MEMO.map;
  if (MEMO.stamp === c.updated) return MEMO.map;
  let season = null;
  try {
    const r = await env.DB.prepare("SELECT data FROM season_chunks WHERE k='current' AND idx<?1 ORDER BY idx").bind(c.chunks).all();
    season = JSON.parse((r.results || []).map((x) => x.data).join(""));
  } catch (e) {}
  const norm = (x) => (x === "road" ? "sports_car" : x);
  const classes = {};
  for (const k of (season && season.classes) || []) classes[k.car_class_id] = (k.cars_in_class || []).map((x) => x.car_id);
  const tc = {}, votes = {};
  for (const s of (season && season.seasons) || []) {
    const cars = (s.car_class_ids || []).flatMap((id) => classes[id] || []);
    for (const w of s.schedules || []) {
      const cat = norm(w.category);
      if (!CATS.includes(cat)) continue;
      const wc = (w.race_week_cars || []).map((x) => x.car_id);
      const t = w.track && w.track.track_id;
      for (const car of wc.length ? wc : cars) {
        if (t) tc[t + ":" + car] = cat;
        const v = (votes[car] = votes[car] || {});
        v[cat] = (v[cat] || 0) + 1;
      }
    }
  }
  for (const car of (season && season.cars) || []) {
    const cs = (car.categories || []).map(norm).filter((x) => CATS.includes(x));
    if (cs.length && !votes[car.car_id]) votes[car.car_id] = { [cs[0]]: 1 };
  }
  const cm = {};
  for (const [car, v] of Object.entries(votes)) cm[car] = Object.entries(v).sort((a, b) => b[1] - a[1])[0][0];
  MEMO = { stamp: c.updated, map: { tc, c: cm } };
  return MEMO.map;
}

// the last resort: the names (a car or track the season does not have, another game)
export function guessCat(track, car) {
  const t = String(track || ""), c = String(car || "");
  if (/dirt/i.test(t + " " + c) || /sprint ?car|midget|\bpro ?[24]\b|rallycross|stadium truck|\blites?\b/i.test(c))
    return /rallycross|road|\brx\b/i.test(t) || /rallycross|pro ?[24]\b|\blites?\b|stadium/i.test(c) ? "dirt_road" : "dirt_oval";
  // "Cup" alone is no oval car (MX-5 Cup, Porsche Cup): the NASCAR Cup Series is
  if (/nascar|cup series|next gen|xfinity|craftsman|\btrucks?\b|\barca\b|late model|modified|legends|street stock|silver crown|stock ?car|super late/i.test(c)) return "oval";
  if (/\boval\b|superspeedway/i.test(t)) return "oval";
  if (/p217|lmp|\bgtp\b|\bdpi?\b|prototype|hypercar/i.test(c)) return "sports_car";
  if (/formula|\bf[1-4]\b|super ?formula|dallara|indy|\bir-?\d+|skip barber|ff1600|pro mazda|\busf\b|lotus (18|49|79)|williams|mercedes-amg w1|tatuus|\bvee\b|\bfr ?[23]\.|renault/i.test(c)) return "formula_car";
  return "sports_car";
}

// hint: what the PC saw (Oval, DirtOval, DirtRoad are sure; Road can be a sports car or a formula car)
export function catOf(map, trackId, carId, hint, track, car) {
  const h = String(hint || "").toLowerCase().replace(/[^a-z]/g, "");
  const sure = { oval: "oval", dirtoval: "dirt_oval", dirtroad: "dirt_road", formulacar: "formula_car", sportscar: "sports_car" }[h];
  const x = map.tc[trackId + ":" + carId] || sure || map.c[carId] || guessCat(track, car);
  // "Road" from the PC: a sports car or a formula car, never an oval or dirt
  if (h === "road" && !["sports_car", "formula_car"].includes(x)) { const g = guessCat("", car); return g === "formula_car" ? g : "sports_car"; }
  return x;
}

export const licOf = (v) => {
  const s = String(v || "").trim().toUpperCase();
  if (s.startsWith("WC") || s.startsWith("PRO")) return "P";
  return LICS.includes(s[0]) ? s[0] : null;
};
