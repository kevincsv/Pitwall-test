-- Race rivals (the other real drivers of a race, shared by the PC that raced them) did not join Pitlane HQ: their laps
-- are anonymous for everyone (leaderboards, records, track pages, public pages, Discord). Their names stay in
-- community_users for the admins, who see them with admin mode on (X-Pitlane-Admin). Nothing is deleted.
UPDATE community_laps SET anon=1 WHERE user_id LIKE 'o:%';
-- what a driver link keeps to give back on an admin's undo: the rival's laps anonymous too
UPDATE driver_link_moves SET row=json_set(row, '$.anon', 1) WHERE kind IN ('took', 'dropped') AND json_valid(row) AND json_extract(row, '$.user_id') LIKE 'o:%';
