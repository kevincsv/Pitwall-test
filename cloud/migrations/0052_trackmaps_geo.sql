-- A track's layout drawn from the game's own position (Pitlane HQ Agent records Lat/Lon when the game gives them): the
-- origin [lat, lon] of its x=0, y=0. Null for a layout drawn by dead reckoning (older agents). A layout from the game's
-- position replaces one by dead reckoning whatever the lap time, and is never replaced by one.
ALTER TABLE track_maps ADD COLUMN geo TEXT;
