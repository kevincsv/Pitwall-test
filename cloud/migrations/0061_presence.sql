-- who is using Pitlane HQ right now and where (the admin page's Online tab): one row per signed-in device and kind of app,
-- written by the account's own reads (GET /account/me, /account/sync, /account/sync/meta) at most once a minute.
-- device is the sign-in's id (never an address), name the device name it signed in with; rows older than 7 days go
CREATE TABLE IF NOT EXISTS presence (
  account_id TEXT NOT NULL,
  kind TEXT NOT NULL,
  device TEXT NOT NULL,
  name TEXT,
  app_version TEXT,
  last_seen INTEGER NOT NULL,
  PRIMARY KEY (account_id, kind, device)
);
CREATE INDEX IF NOT EXISTS presence_seen ON presence(last_seen);
