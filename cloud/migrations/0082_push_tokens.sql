-- Instant notifications on the phones (pushlib.js): each phone with Account → Notifications on gives the server its
-- Firebase Cloud Messaging token, and a new alert (alertslib.js) wakes that phone at once instead of at its next
-- background check. The message only says there is something new; the phone reads it with GET /community/alerts.
-- A token unused for 270 days goes (Firebase's own limit).
CREATE TABLE IF NOT EXISTS push_tokens (
  token TEXT PRIMARY KEY,
  account_id TEXT NOT NULL,
  platform TEXT NOT NULL DEFAULT 'android',
  updated INTEGER NOT NULL
);
CREATE INDEX IF NOT EXISTS push_tokens_account ON push_tokens(account_id);
