-- leagues found in public posts (r/iRacing, r/iRacingLeagues) with a Discord invite: one row per Discord server,
-- how many members it has and how many are online (Discord's public invite counts), the latest post about it
CREATE TABLE IF NOT EXISTS league_found (
  guild TEXT PRIMARY KEY,
  code TEXT NOT NULL,
  name TEXT,
  icon TEXT,
  title TEXT,
  url TEXT,
  sub TEXT,
  posted INTEGER,
  first INTEGER,
  posts INTEGER NOT NULL DEFAULT 1,
  members INTEGER,
  online INTEGER,
  cats TEXT,
  checked INTEGER,
  dead INTEGER NOT NULL DEFAULT 0,
  hidden INTEGER NOT NULL DEFAULT 0
);
CREATE INDEX IF NOT EXISTS league_found_online ON league_found (online DESC);
-- every post already read, so a post is counted once
CREATE TABLE IF NOT EXISTS league_found_posts (
  id TEXT PRIMARY KEY,
  guild TEXT,
  at INTEGER NOT NULL
);
