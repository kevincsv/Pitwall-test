// The games TrackIQ reads. Everything shared or uploaded says which one, so laps
// and analyses of different games are never compared; older data (and anything
// unknown) counts as iRacing.
export const GAMES = ["iracing", "lmu", "acc", "ac"];
export const gameOf = (g) => (GAMES.includes(g) ? g : "iracing");
