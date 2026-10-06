-- The shape of each track, from the fastest lap without incidents someone drove
-- there (iRacing). Only the outline (x, y in metres from the start/finish line,
-- north up): no speed, braking or other telemetry.
CREATE TABLE IF NOT EXISTS track_maps (
  game TEXT NOT NULL DEFAULT 'iracing',
  track_id INTEGER NOT NULL,
  track TEXT,
  n INTEGER NOT NULL,
  len REAL,
  pts TEXT NOT NULL,          -- JSON {x:[…], y:[…]}
  time REAL NOT NULL,         -- the lap it came from (s)
  user_id TEXT,
  created INTEGER NOT NULL,
  PRIMARY KEY (game, track_id)
);
