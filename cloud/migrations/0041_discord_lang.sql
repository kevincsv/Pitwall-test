-- The Discord bot's language chosen with /language (en, es, pt); without a row, the Discord app's language
CREATE TABLE IF NOT EXISTS discord_users (
  discord_id TEXT PRIMARY KEY,
  lang TEXT NOT NULL,
  updated INTEGER NOT NULL
);
