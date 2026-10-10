-- DRINKS mode: who drove each lap of an account's session when it was a friend (their name; NULL the account's
-- own). Such a lap stays in the session and its race summary, and is never the account's best nor its share.
ALTER TABLE laps ADD COLUMN drv TEXT;
-- 1 once the lap's time was checked against its own telemetry (older PCs could give a lap the time of the lap
-- before when the two were close: the cron puts the lap's own time back)
ALTER TABLE laps ADD COLUMN tfix INTEGER;
