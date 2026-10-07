-- incident points during the lap (they do not make it invalid; only cutting does)
ALTER TABLE laps ADD COLUMN inc INTEGER NOT NULL DEFAULT 0;
