-- For sites created before team support: npx wrangler d1 execute pitlanehq --remote --file migrations/0002_team.sql
ALTER TABLE sessions ADD COLUMN uploader TEXT;
CREATE TABLE IF NOT EXISTS members (name TEXT PRIMARY KEY, key_hash TEXT NOT NULL UNIQUE, created INTEGER NOT NULL);
