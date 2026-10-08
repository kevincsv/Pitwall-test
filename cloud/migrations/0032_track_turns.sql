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
