-- an admin's own name, text and disciplines for a league found in the posts: kept apart from what the read finds,
-- so the six-hourly read never puts the old ones back
ALTER TABLE league_found ADD COLUMN edit TEXT;
