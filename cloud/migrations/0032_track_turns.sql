-- The official turn numbers of a track (T1 … Tn as the circuit names them), placed by an admin on its map: where
-- each one is on the lap, as a fraction of the lap from the start/finish line. The coach, the lap analyzer and the
-- race summaries number their corners with them; a track without them keeps the corners found from the laps.
CREATE TABLE IF NOT EXISTS track_turns (
  game TEXT NOT NULL DEFAULT 'iracing',
  track_id INTEGER NOT NULL,
  turns TEXT NOT NULL,        -- JSON [0.04, 0.11, …], T1 … Tn in order
  updated INTEGER NOT NULL,
  PRIMARY KEY (game, track_id)
);

-- The pit lane of each track, from laps through the pits: {"<5 m point of the lap>": metres to the left of the track}
CREATE TABLE IF NOT EXISTS track_pits (
  game TEXT NOT NULL DEFAULT 'iracing',
  track_id INTEGER NOT NULL,
  n INTEGER NOT NULL,         -- the points of a lap there (its length / 5 m)
  pts TEXT NOT NULL,
  updated INTEGER NOT NULL,
  PRIMARY KEY (game, track_id)
);

-- Fuji Speedway Grand Prix (444): its 16 official turns, as iRacing's map numbers them (TGR 1-2, Coca-Cola 3,
-- 100R 4-5, Hairpin 6-7, 8, 300R 9, Dunlop 10-11, 12, 13, Netz 14-15, Panasonic 16); admins can move them on the map
INSERT OR IGNORE INTO track_turns (game, track_id, turns, updated) VALUES ('iracing', 444,
  '[0.1717,0.203,0.2922,0.3323,0.397,0.4461,0.4706,0.5085,0.5776,0.6278,0.6412,0.668,0.688,0.7271,0.755,0.8063]', 1791504000000);
