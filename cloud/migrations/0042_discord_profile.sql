-- Discord on the Pitlane HQ profile and the bot's channels
-- the linked Discord user's handle ("kev_racing") and whether the driver shows it on their public profile (off until they say)
ALTER TABLE discord_links ADD COLUMN handle TEXT;
ALTER TABLE discord_links ADD COLUMN shown INTEGER NOT NULL DEFAULT 0;
ALTER TABLE discord_codes ADD COLUMN handle TEXT;
-- "Link Discord" in the apps (Discord's sign-in): one state per attempt for 10 minutes, as a hash
CREATE TABLE IF NOT EXISTS discord_oauth (
  state_hash TEXT PRIMARY KEY,
  account_id TEXT NOT NULL,
  expires INTEGER NOT NULL
);
-- a server's channels: the records' own channel (else the best laps' one) and the channels the bot answers in
-- (JSON list of channel ids; empty or NULL: every channel)
ALTER TABLE discord_guilds ADD COLUMN records_channel TEXT;
ALTER TABLE discord_guilds ADD COLUMN cmd_channels TEXT;
