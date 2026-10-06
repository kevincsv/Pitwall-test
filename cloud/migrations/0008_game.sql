-- Pitlane HQ reads several games (iRacing, Le Mans Ultimate, Assetto Corsa
-- Competizione, Assetto Corsa). Everything shared or uploaded says which one, so
-- laps and analyses of different games are never compared. What was there before
-- came from iRacing.
ALTER TABLE community_laps ADD COLUMN game TEXT NOT NULL DEFAULT 'iracing';
ALTER TABLE community_reports ADD COLUMN game TEXT NOT NULL DEFAULT 'iracing';
ALTER TABLE community_setups ADD COLUMN game TEXT NOT NULL DEFAULT 'iracing';
ALTER TABLE sessions ADD COLUMN game TEXT NOT NULL DEFAULT 'iracing';
CREATE INDEX IF NOT EXISTS community_laps_game ON community_laps(game, track_id, car_id);
CREATE INDEX IF NOT EXISTS community_reports_game ON community_reports(game, created DESC);
