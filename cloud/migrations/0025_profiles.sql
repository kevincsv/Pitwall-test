-- Driver profiles and the supporter badge (0.8.11)
-- a supporter (someone who donates): set and removed by hand by the owner of Pitlane HQ; the driver can hide the badge
ALTER TABLE accounts ADD COLUMN supporter INTEGER NOT NULL DEFAULT 0;
ALTER TABLE accounts ADD COLUMN supporter_hidden INTEGER NOT NULL DEFAULT 0;
-- the recent races a driver's profile shows: a summary of your own result in each (never the other drivers),
-- sent by your apps, because the race history of an account is encrypted and the server cannot read it
CREATE TABLE IF NOT EXISTS profile_races (
  account_id TEXT NOT NULL,
  id TEXT NOT NULL,
  at INTEGER NOT NULL,
  data TEXT NOT NULL,
  PRIMARY KEY (account_id, id)
);
CREATE INDEX IF NOT EXISTS profile_races_at ON profile_races (account_id, at DESC);
