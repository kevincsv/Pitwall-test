-- Only real data: removes the example community drivers and laps, and the test sessions,
-- laps and community laps that were added to the owner's account. Nothing a real driver
-- uploaded is touched (those never have these ids).
DELETE FROM community_laps WHERE user_id LIKE 'sample-%';
DELETE FROM community_users WHERE id LIKE 'sample-%';
DELETE FROM community_laps WHERE id IN ('tst166', 'tst353');
DELETE FROM laps WHERE id LIKE 'acct_3e224233fde0e11f670d2d97:test-%';
DELETE FROM sessions WHERE id LIKE 'acct_3e224233fde0e11f670d2d97:test-%';
DELETE FROM track_maps WHERE user_id LIKE 'sample-%';
