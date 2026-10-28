-- The ten-minute job read the whole database on every run (about 4 million rows a day): an index of the laps not valid
-- (few) for repairImpossibleShares, and the sessions by uploader, which every account's lists and the admin page ask for.
CREATE INDEX IF NOT EXISTS laps_invalid ON laps(session_id) WHERE valid=0;
CREATE INDEX IF NOT EXISTS sessions_uploader ON sessions(uploader);
