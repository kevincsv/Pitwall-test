-- Race rivals (the other real drivers of a race, shared by the PC that raced them) did not join Pitlane HQ: they show
-- as "Anonymous" everywhere (leaderboards, records, track pages, public pages, Discord), and their names are not kept.
-- A rival who has an account (driver_links) is that account's already, under its own choice.
UPDATE community_users SET alias='Anonymous', iracing=NULL WHERE id LIKE 'o:%';
UPDATE community_laps SET anon=1 WHERE user_id LIKE 'o:%';
-- what a driver link keeps to give back on an admin's undo: the rival's row and laps without the name
UPDATE driver_link_moves SET row=json_set(row, '$.alias', 'Anonymous', '$.iracing', NULL) WHERE kind='user' AND json_valid(row);
UPDATE driver_link_moves SET row=json_set(row, '$.anon', 1) WHERE kind IN ('took', 'dropped') AND json_valid(row) AND json_extract(row, '$.user_id') LIKE 'o:%';
