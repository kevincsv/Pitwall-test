-- A session against iRacing's AI recorded before the agent said so: an iRacing session without a subsession
-- (id "t-…") that is not a test is a single-player session, so against the AI. Its people's laps teach the
-- model now, so the models of those cars and tracks are rebuilt.
UPDATE sessions SET ai=1 WHERE ai IS NULL AND COALESCE(game,'iracing')='iracing' AND id LIKE 't-%' AND LOWER(COALESCE(kind,'')) NOT LIKE '%test%';
UPDATE model_cache SET dirty=1 WHERE EXISTS (SELECT 1 FROM sessions s WHERE s.ai=1 AND s.id LIKE 't-%' AND s.track_id=model_cache.track_id AND s.car_id=model_cache.car_id);
