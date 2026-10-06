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
  created INTEGER NOT NULL
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
