-- What the drivers use (the admin page's Summary and Users): every app counts the views it opens, its notable actions
-- and the game it drives, and sends them in batches (POST /community/usage, usage.js). One row per day, account,
-- kind of device and key, added up; rows older than 400 days go (the ten-minute job).
CREATE TABLE IF NOT EXISTS usage_days (
  day TEXT NOT NULL,          -- 'YYYY-MM-DD' (UTC)
  account_id TEXT NOT NULL,
  device TEXT NOT NULL,       -- web, pc, android, ios
  key TEXT NOT NULL,          -- view:<name>, act:<name>, game:<id>
  n INTEGER NOT NULL DEFAULT 0,
  PRIMARY KEY (day, account_id, device, key)
);
CREATE INDEX IF NOT EXISTS usage_days_acct ON usage_days(account_id, day);

-- "Share your feedback": what the drivers write (POST /community/feedback), emailed to support@ and listed on the admin page
CREATE TABLE IF NOT EXISTS feedback (
  id TEXT PRIMARY KEY,
  account_id TEXT NOT NULL,
  created INTEGER NOT NULL,
  device TEXT,
  v TEXT,
  rating INTEGER,
  text TEXT NOT NULL,
  view TEXT
);
CREATE INDEX IF NOT EXISTS feedback_created ON feedback(created DESC);
CREATE INDEX IF NOT EXISTS feedback_acct ON feedback(account_id, created);

-- when the feedback window was last shown to an account (or put off with Not now), so its devices do not ask twice,
-- and how long the apps were in use since then (used, ms, from the usage batches' ms)
CREATE TABLE IF NOT EXISTS feedback_ask (
  account_id TEXT PRIMARY KEY,
  shown INTEGER NOT NULL,
  used INTEGER NOT NULL DEFAULT 0
);
