-- When official iRacing races really started, as the PCs that drove them saw it (one row per subsession). The
-- planner checks the season's race times against these and corrects them, so it keeps working without iRacing's
-- data API. Only the schedule: which season, track and minute, never who drove (user_id is for limits, not shown).
CREATE TABLE IF NOT EXISTS season_seen (
  sub INTEGER PRIMARY KEY,
  season_id INTEGER NOT NULL,
  series_id INTEGER NOT NULL,
  track_id INTEGER NOT NULL,
  start INTEGER NOT NULL,
  user_id TEXT NOT NULL,
  at INTEGER NOT NULL
);
CREATE INDEX IF NOT EXISTS season_seen_start ON season_seen (start);
CREATE INDEX IF NOT EXISTS season_seen_user ON season_seen (user_id, at);
