-- The Discord bot (slash commands answered by this Worker, /discord/interactions)
-- a Discord user linked to a Pitlane HQ account: one each way
CREATE TABLE IF NOT EXISTS discord_links (
  discord_id TEXT PRIMARY KEY,
  account_id TEXT NOT NULL UNIQUE,
  created INTEGER NOT NULL
);
-- the one-use codes of /link (10 minutes), as a hash
CREATE TABLE IF NOT EXISTS discord_codes (
  code_hash TEXT PRIMARY KEY,
  discord_id TEXT NOT NULL,
  discord_name TEXT,
  guild_id TEXT,
  expires INTEGER NOT NULL
);
-- the linked drivers of each Discord server: the ones who used the bot there (its ranking and its alerts)
CREATE TABLE IF NOT EXISTS discord_members (
  guild_id TEXT NOT NULL,
  discord_id TEXT NOT NULL,
  seen INTEGER NOT NULL,
  PRIMARY KEY (guild_id, discord_id)
);
CREATE INDEX IF NOT EXISTS discord_members_user ON discord_members (discord_id);
-- a server's settings: the channel of its lap alerts and the account that set it up
CREATE TABLE IF NOT EXISTS discord_guilds (
  guild_id TEXT PRIMARY KEY,
  alerts_channel TEXT,
  set_by TEXT,
  lang TEXT,                     -- the language of its alerts (en, es)
  updated INTEGER NOT NULL
);
