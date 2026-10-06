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
