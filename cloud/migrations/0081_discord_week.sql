-- The Discord bot's weekly post (the server's best laps of the week in its alerts channel, on Monday) and a server
-- linked to its league in the leagues hub with /league (the league's invite must lead to that server).
ALTER TABLE discord_guilds ADD COLUMN week_at INTEGER;
ALTER TABLE discord_guilds ADD COLUMN league_id TEXT;
CREATE INDEX IF NOT EXISTS discord_guilds_league ON discord_guilds (league_id);
