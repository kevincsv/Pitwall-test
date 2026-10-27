-- the leagues of each game: the app shows the leagues of the game chosen (iRacing or Le Mans Ultimate). Every league
-- posted or found before is an iRacing one
ALTER TABLE leagues ADD COLUMN game TEXT NOT NULL DEFAULT 'iracing';
ALTER TABLE league_found ADD COLUMN game TEXT NOT NULL DEFAULT 'iracing';
CREATE INDEX IF NOT EXISTS leagues_game ON leagues (game, updated DESC);
CREATE INDEX IF NOT EXISTS league_found_game ON league_found (game, online DESC);
