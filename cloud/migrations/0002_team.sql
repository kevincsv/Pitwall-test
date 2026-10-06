-- team support: who uploaded each session, and team members with their own key
ALTER TABLE sessions ADD COLUMN uploader TEXT;
CREATE TABLE IF NOT EXISTS members (name TEXT PRIMARY KEY, key_hash TEXT NOT NULL UNIQUE, created INTEGER NOT NULL);
