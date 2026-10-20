// Cars that are the same car under different badges (iRacing gives each badge its own car number): one leaderboard,
// one record, one coach model and one set of references for all of them, under the family's name; each lap keeps
// the badge it was driven with. The family's number is its first car's (the one its laps are kept under).
export const CAR_FAMILIES = [
  { game: "iracing", id: 171, name: "Super Formula SF23", ids: [171, 172] }, // Toyota, Honda
];

const byCar = new Map();
for (const f of CAR_FAMILIES) for (const c of f.ids) byCar.set(f.game + ":" + c, f);

export const carFamily = (game, carId) => byCar.get((game || "iracing") + ":" + +carId) || null;
// the number a car's laps are kept under (itself when it has no family)
export const famId = (game, carId) => { const f = carFamily(game, carId); return f ? f.id : +carId; };
// every car number of its family (itself alone when it has none), for SQL IN (…): plain numbers only
export const famIds = (game, carId) => { const f = carFamily(game, carId); return f ? f.ids.slice() : [+carId]; };
export const famSql = (game, carId) => famIds(game, carId).map((n) => String(Math.trunc(n))).join(",");
// the name a board or a record shows for a car: the family's, else its own
export const famName = (game, carId, name) => { const f = carFamily(game, carId); return f ? f.name : name; };
