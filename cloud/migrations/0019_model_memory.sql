-- the model's memory: every lap that ever taught a car and track, anonymous (hashes, no account),
-- in its original telemetry format, so new versions of the model relearn everything and nothing is forgotten
CREATE TABLE IF NOT EXISTS model_laps (
  game TEXT NOT NULL,
  track_id INTEGER NOT NULL,
  car_id INTEGER NOT NULL,
  k TEXT NOT NULL,
  drv TEXT NOT NULL,
  time REAL NOT NULL,
  data BLOB NOT NULL,
  created INTEGER NOT NULL,
  PRIMARY KEY (game, track_id, car_id, k)
);
CREATE INDEX IF NOT EXISTS model_laps_combo ON model_laps(game, track_id, car_id, time);
CREATE INDEX IF NOT EXISTS sessions_combo_ids ON sessions(track_id, car_id, game);
