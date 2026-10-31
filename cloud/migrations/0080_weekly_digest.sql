-- The weekly email (digest.js): a driver turns it on in Settings; on Monday the server sends their week (sessions, laps,
-- time on track, races, the best finish and new personal bests) in the language the app had when they turned it on.
CREATE TABLE IF NOT EXISTS digest_subs (
  account_id TEXT PRIMARY KEY,
  lang TEXT,
  sent_at INTEGER              -- the last week sent (or looked at, when the driver did not drive)
);
