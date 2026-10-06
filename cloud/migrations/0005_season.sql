-- The current iRacing season schedule (series, weeks, tracks, cars) shared by
-- the server owner's PC, so apps without an iRacing login see the real season.
CREATE TABLE IF NOT EXISTS season_cache (
  k TEXT PRIMARY KEY,
  updated INTEGER NOT NULL,
  chunks INTEGER NOT NULL
);
CREATE TABLE IF NOT EXISTS season_chunks (
  k TEXT NOT NULL,
  idx INTEGER NOT NULL,
  data TEXT NOT NULL,
  PRIMARY KEY (k, idx)
);
