-- Pitlane HQ cloud: your sessions and laps, uploaded by PitlaneHQ.exe
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
  best REAL,
  uploader TEXT                   -- 'owner' or the team member's name
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

-- team members: each has their own key (only its hash is stored)
CREATE TABLE IF NOT EXISTS members (
  name TEXT PRIMARY KEY,
  key_hash TEXT NOT NULL UNIQUE,
  created INTEGER NOT NULL
);
-- Community: laps and race analyses that drivers choose to share
CREATE TABLE IF NOT EXISTS community_users (
  id TEXT PRIMARY KEY,
  token_hash TEXT NOT NULL UNIQUE,
  alias TEXT NOT NULL,
  created INTEGER NOT NULL,
  uploads_day TEXT,
  uploads INTEGER DEFAULT 0
);
CREATE TABLE IF NOT EXISTS community_laps (
  id TEXT PRIMARY KEY,
  user_id TEXT NOT NULL,
  car_id INTEGER NOT NULL,
  car TEXT,
  track_id INTEGER NOT NULL,
  track TEXT,
  time REAL NOT NULL,
  sectors TEXT,
  trace TEXT,
  created INTEGER NOT NULL,
  UNIQUE(user_id, car_id, track_id)
);
CREATE INDEX IF NOT EXISTS community_laps_combo ON community_laps(track_id, car_id, time);
CREATE TABLE IF NOT EXISTS community_reports (
  id TEXT PRIMARY KEY,
  user_id TEXT NOT NULL,
  car_id INTEGER,
  car TEXT,
  track_id INTEGER,
  track TEXT,
  data TEXT NOT NULL,
  created INTEGER NOT NULL
);
CREATE INDEX IF NOT EXISTS community_reports_combo ON community_reports(track_id, car_id, created);
