-- The iRacing track and car ids of each session in an account, so a lap can be shared with the
-- community straight from the account (the community leaderboard is keyed by these ids).
ALTER TABLE sessions ADD COLUMN track_id INTEGER;
ALTER TABLE sessions ADD COLUMN car_id INTEGER;
