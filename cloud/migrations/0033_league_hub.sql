-- The league hub (0.9.6): a league is a post with the days it races, the usual start time in its own time zone,
-- one or several disciplines (mixed), an optional Discord invite and website, whether it is looking for drivers,
-- and the views and clicks its creator can see (one view per viewer and day; one click per viewer, day and link).
ALTER TABLE leagues ADD COLUMN cats TEXT;                        -- JSON list of disciplines; several = mixed
ALTER TABLE leagues ADD COLUMN days TEXT;                        -- JSON list of the weekdays it races, 0 Monday … 6 Sunday
ALTER TABLE leagues ADD COLUMN time TEXT;                        -- the usual start, "20:30", in tz
ALTER TABLE leagues ADD COLUMN tz TEXT;                          -- the IANA time zone of that time, "Europe/Madrid"
ALTER TABLE leagues ADD COLUMN open INTEGER NOT NULL DEFAULT 1;  -- 1: looking for drivers
ALTER TABLE leagues ADD COLUMN views INTEGER NOT NULL DEFAULT 0;
ALTER TABLE leagues ADD COLUMN clicks INTEGER NOT NULL DEFAULT 0;
UPDATE leagues SET cats = '["' || cat || '"]' WHERE cat IS NOT NULL AND cat != '' AND cats IS NULL;
-- what counts once: one row per viewer, day and kind (view, discord, web)
CREATE TABLE IF NOT EXISTS league_hits (
  league_id TEXT NOT NULL,
  viewer TEXT NOT NULL,          -- the account, or a hash of the network and browser; never an address
  day TEXT NOT NULL,             -- YYYY-MM-DD (UTC)
  kind TEXT NOT NULL,
  PRIMARY KEY (league_id, viewer, day, kind)
);
-- the creator's chart: views and clicks per day
CREATE TABLE IF NOT EXISTS league_days (
  league_id TEXT NOT NULL,
  day TEXT NOT NULL,
  views INTEGER NOT NULL DEFAULT 0,
  clicks INTEGER NOT NULL DEFAULT 0,
  PRIMARY KEY (league_id, day)
);
