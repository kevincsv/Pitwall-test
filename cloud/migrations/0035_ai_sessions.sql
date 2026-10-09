-- A session against iRacing's AI: not an official series, but the people driving in it are real, so their laps
-- teach the model (the AI drivers' never go up). 1 = the session had AI drivers.
ALTER TABLE sessions ADD COLUMN ai INTEGER;
ALTER TABLE community_laps ADD COLUMN ai INTEGER;
