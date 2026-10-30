-- D1 limits the rows read per day, and every open app asks for My sessions and Home's numbers about once a minute.
-- An account's sessions, newest first, come straight from one index (it covers what sessions_uploader did), and each
-- session keeps its time on track (secs) and its friends' names (drvs) beside its laps and best (SESSION_SUMS in
-- worker.js), so neither answer reads the laps again.
CREATE INDEX IF NOT EXISTS sessions_uploader_started ON sessions(uploader, started DESC);
DROP INDEX IF EXISTS sessions_uploader;
ALTER TABLE sessions ADD COLUMN secs REAL;
ALTER TABLE sessions ADD COLUMN drvs TEXT;
UPDATE sessions SET
  secs=(SELECT SUM(time) FROM laps WHERE session_id=sessions.id AND time>0 AND time<3600),
  drvs=(SELECT group_concat(DISTINCT drv) FROM laps WHERE session_id=sessions.id AND drv IS NOT NULL);
