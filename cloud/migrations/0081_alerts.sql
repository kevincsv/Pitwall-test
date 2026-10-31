-- The phones' notifications (alertslib.js): a record of a driver's beaten by another driver, and the summary of their
-- week on Monday. alert_subs holds the accounts with notifications on in a phone (the weekly summary is only written for
-- them); the phones read alerts in the background (GET /community/alerts) and the PC and the web show a beaten record on
-- Home. Kept 30 days.
CREATE TABLE IF NOT EXISTS alerts (
  id TEXT PRIMARY KEY,
  account_id TEXT NOT NULL,
  kind TEXT NOT NULL,
  created INTEGER NOT NULL,
  data TEXT NOT NULL
);
CREATE INDEX IF NOT EXISTS alerts_account ON alerts(account_id, created);
CREATE TABLE IF NOT EXISTS alert_subs (
  account_id TEXT PRIMARY KEY,
  lang TEXT NOT NULL DEFAULT 'en',
  week_at INTEGER
);
