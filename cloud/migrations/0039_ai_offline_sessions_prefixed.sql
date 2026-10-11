-- The same as 0038, which looked for ids starting with "t-": on the server a session's id carries the account's
-- prefix ("acct_…:t-…"), so this marks the sessions against iRacing's AI recorded before the agent said so (an
-- iRacing session without a subsession that is not a test), and the models of those cars and tracks are rebuilt.
UPDATE sessions SET ai=1 WHERE ai IS NULL AND COALESCE(game,'iracing')='iracing' AND (id LIKE 't-%' OR id LIKE '%:t-%') AND LOWER(COALESCE(kind,'')) NOT LIKE '%test%';
UPDATE model_cache SET dirty=1 WHERE EXISTS (SELECT 1 FROM sessions s WHERE s.ai=1 AND (s.id LIKE 't-%' OR s.id LIKE '%:t-%') AND s.track_id=model_cache.track_id AND s.car_id=model_cache.car_id);
