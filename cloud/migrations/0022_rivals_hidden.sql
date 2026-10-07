-- Rivals of races without their speed trace never show on the leaderboard: they feed the model unseen.
UPDATE community_laps SET shown='model' WHERE user_id LIKE 'o:%' AND trace IS NULL;
