-- Laps and race analyses shared anonymously: others see "Anonymous" instead of the name.
ALTER TABLE community_laps ADD COLUMN anon INTEGER NOT NULL DEFAULT 0;
ALTER TABLE community_reports ADD COLUMN anon INTEGER NOT NULL DEFAULT 0;
