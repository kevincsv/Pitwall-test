-- Cars that are one car under different badges share one leaderboard, record and coach model (src/carfamily.js):
-- the Super Formula SF23's Honda (172) laps go under its Toyota's number (171). Each driver keeps their faster lap of
-- the two on every track; the lap keeps its own name (its badge).
DELETE FROM community_laps WHERE game='iracing' AND car_id=171 AND EXISTS (
  SELECT 1 FROM community_laps o WHERE o.game='iracing' AND o.car_id=172 AND o.user_id=community_laps.user_id AND o.track_id=community_laps.track_id AND o.time<community_laps.time);
UPDATE OR IGNORE community_laps SET car_id=171 WHERE game='iracing' AND car_id=172;
DELETE FROM community_laps WHERE game='iracing' AND car_id=172;
-- the model's memory joins too; its models and the car's card are made again from both
UPDATE OR IGNORE model_laps SET car_id=171 WHERE game='iracing' AND car_id=172;
DELETE FROM model_laps WHERE game='iracing' AND car_id=172;
DELETE FROM model_cache WHERE game='iracing' AND car_id IN (171, 172);
DELETE FROM car_cards WHERE game='iracing' AND car_id IN (171, 172);
