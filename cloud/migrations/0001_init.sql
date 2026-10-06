-- Pitlane HQ Cloud: first version of the database
CREATE TABLE IF NOT EXISTS sessions (
  id TEXT PRIMARY KEY,            -- chosen by the agent: unique per sim session
  started INTEGER NOT NULL,       -- ms since 1970
  track TEXT NOT NULL,
  track_config TEXT,
  car TEXT NOT NULL,
  kind TEXT,                      -- Practice, Qualify, Race…
  series TEXT,
  driver TEXT,
  air_temp REAL,
  track_temp REAL,
  laps INTEGER DEFAULT 0,
  best REAL
);
CREATE INDEX IF NOT EXISTS sessions_started ON sessions(started DESC);
CREATE INDEX IF NOT EXISTS sessions_combo ON sessions(track, car);

CREATE TABLE IF NOT EXISTS laps (
  id TEXT PRIMARY KEY,
  session_id TEXT NOT NULL REFERENCES sessions(id) ON DELETE CASCADE,
  n INTEGER NOT NULL,
  time REAL NOT NULL,             -- seconds
  valid INTEGER NOT NULL DEFAULT 1,
  fuel REAL,                      -- litres used
  vmax REAL,                      -- m/s
  sectors TEXT,                   -- JSON array of seconds
  trace TEXT,                     -- JSON {bin, d:[[speed,throttle,brake,gear,steer],…]}
  created INTEGER NOT NULL
);
CREATE INDEX IF NOT EXISTS laps_session ON laps(session_id, n);
