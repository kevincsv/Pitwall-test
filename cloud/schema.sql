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
  uploader TEXT                   -- 'owner' or the team member's name,
  track_id INTEGER,
  car_id INTEGER
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
  inc INTEGER NOT NULL DEFAULT 0, -- incident points during the lap
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
  data TEXT NOT NULL,                -- sealed with DATA_KEY when the server has one
  created INTEGER NOT NULL,
  finish INTEGER,                    -- what the list shows without opening the data
  field INTEGER,
  best REAL
);
CREATE INDEX IF NOT EXISTS community_reports_combo ON community_reports(track_id, car_id, created);
-- Pitlane HQ accounts (end-to-end encrypted sync) and shared setups.
-- The server never sees passwords or readable synced data: only a login key
-- derived on the PC (stored salted and hashed), the data key wrapped by the
-- password, and the encrypted data. Emails are kept only as a hash.
CREATE TABLE IF NOT EXISTS accounts (
  id TEXT PRIMARY KEY,
  email_hash TEXT NOT NULL UNIQUE,
  auth_salt TEXT NOT NULL,
  auth_hash TEXT NOT NULL,
  wrapped_key TEXT NOT NULL,
  display TEXT NOT NULL,
  name_kind TEXT NOT NULL DEFAULT 'nick',
  anon INTEGER NOT NULL DEFAULT 0,  -- shares as "Anonymous"
  created INTEGER NOT NULL,
  verified INTEGER NOT NULL DEFAULT 0,
  totp TEXT,                         -- authenticator secret, sealed with DATA_KEY
  totp_on INTEGER NOT NULL DEFAULT 0,
  totp_pending TEXT                  -- secret shown but not confirmed yet
);
CREATE TABLE IF NOT EXISTS recovery_codes (  -- one-use codes for when the phone is lost (hashes only)
  account_id TEXT NOT NULL,
  code_hash TEXT NOT NULL,
  PRIMARY KEY (account_id, code_hash)
);
CREATE TABLE IF NOT EXISTS login_pending (   -- a sign-in waiting for its second factor (5 minutes)
  token_hash TEXT PRIMARY KEY,
  account_id TEXT NOT NULL,
  device TEXT,
  expires INTEGER NOT NULL
);
CREATE TABLE IF NOT EXISTS account_sessions (
  id TEXT PRIMARY KEY,
  account_id TEXT NOT NULL,
  token_hash TEXT NOT NULL UNIQUE,
  device TEXT,
  created INTEGER NOT NULL,
  last_seen INTEGER NOT NULL
);
CREATE INDEX IF NOT EXISTS account_sessions_acc ON account_sessions(account_id);
CREATE TABLE IF NOT EXISTS account_sync (
  account_id TEXT PRIMARY KEY,
  version INTEGER NOT NULL,
  updated INTEGER NOT NULL,
  chunks INTEGER NOT NULL
);
CREATE TABLE IF NOT EXISTS account_sync_chunks (
  account_id TEXT NOT NULL,
  idx INTEGER NOT NULL,
  data TEXT NOT NULL,
  PRIMARY KEY (account_id, idx)
);
CREATE TABLE IF NOT EXISTS auth_fails (
  k TEXT NOT NULL,
  t INTEGER NOT NULL
);
CREATE INDEX IF NOT EXISTS auth_fails_k ON auth_fails(k, t);
CREATE TABLE IF NOT EXISTS community_setups (
  id TEXT PRIMARY KEY,
  user_id TEXT NOT NULL,
  car_path TEXT NOT NULL,
  car TEXT,
  track TEXT,
  name TEXT NOT NULL,
  notes TEXT,
  data TEXT NOT NULL,
  sha TEXT NOT NULL,
  size INTEGER NOT NULL,
  downloads INTEGER NOT NULL DEFAULT 0,
  created INTEGER NOT NULL,
  UNIQUE(user_id, sha)
);
CREATE INDEX IF NOT EXISTS community_setups_car ON community_setups(car_path, created);
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

CREATE TABLE IF NOT EXISTS email_tokens (
  token_hash TEXT PRIMARY KEY,
  account_id TEXT NOT NULL,
  kind TEXT NOT NULL,
  expires INTEGER NOT NULL
);
CREATE INDEX IF NOT EXISTS email_tokens_acc ON email_tokens(account_id, kind);

ALTER TABLE community_laps ADD COLUMN anon INTEGER NOT NULL DEFAULT 0;
ALTER TABLE community_reports ADD COLUMN anon INTEGER NOT NULL DEFAULT 0;

ALTER TABLE community_users ADD COLUMN owner TEXT;
ALTER TABLE community_users ADD COLUMN iracing TEXT;
ALTER TABLE community_laps ADD COLUMN shown TEXT;
ALTER TABLE community_reports ADD COLUMN shown TEXT;
CREATE INDEX IF NOT EXISTS community_users_alias ON community_users(lower(alias));

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
