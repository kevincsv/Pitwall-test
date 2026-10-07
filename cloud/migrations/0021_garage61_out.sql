-- The Garage 61 import is gone: what it brought leaves too (its sessions and laps, the leaderboard laps
-- and the model's memory that came from them); the models of those cars and tracks are rebuilt.
DELETE FROM model_laps WHERE EXISTS (SELECT 1 FROM laps l JOIN sessions s ON s.id=l.session_id WHERE s.series='Garage 61' AND s.track_id=model_laps.track_id AND s.car_id=model_laps.car_id AND ABS(l.time-model_laps.time)<0.002);
DELETE FROM community_laps WHERE EXISTS (SELECT 1 FROM laps l JOIN sessions s ON s.id=l.session_id WHERE s.series='Garage 61' AND s.uploader='acct:'||community_laps.user_id AND ABS(l.time-community_laps.time)<0.002);
UPDATE model_cache SET dirty=1 WHERE EXISTS (SELECT 1 FROM sessions s WHERE s.series='Garage 61' AND s.track_id=model_cache.track_id AND s.car_id=model_cache.car_id);
DELETE FROM laps WHERE session_id IN (SELECT id FROM sessions WHERE series='Garage 61');
DELETE FROM sessions WHERE series='Garage 61';
