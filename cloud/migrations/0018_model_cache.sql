-- the community model of every car and track, learnt on the server (gzip JSON); dirty when new laps came in
CREATE TABLE IF NOT EXISTS model_cache (
  game TEXT NOT NULL,
  track_id INTEGER NOT NULL,
  car_id INTEGER NOT NULL,
  dirty INTEGER NOT NULL DEFAULT 1,
  built INTEGER NOT NULL DEFAULT 0,
  data BLOB,
  PRIMARY KEY (game, track_id, car_id)
);
CREATE INDEX IF NOT EXISTS model_cache_dirty ON model_cache(dirty, built);
CREATE INDEX IF NOT EXISTS sessions_combo ON sessions(track_id, car_id, game);
