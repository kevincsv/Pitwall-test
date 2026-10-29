-- The official number of turns of a track, as the game says it (iRacing's WeekendInfo.TrackNumTurns), sent by Pitlane HQ
-- Agent for every track it sees (a session, a layout, the .ibt files on the PC). It exists before the track has a layout.
-- The automatic turns (trackgeo.js, /community/turns) are fitted to it while no admin placed the official ones.
CREATE TABLE IF NOT EXISTS track_info (
  game TEXT NOT NULL,
  track_id INTEGER NOT NULL,
  track TEXT,
  nturns INTEGER,
  updated INTEGER NOT NULL,
  PRIMARY KEY (game, track_id)
);
