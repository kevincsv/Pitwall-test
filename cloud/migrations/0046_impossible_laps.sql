-- Laps that cannot be racing laps are no best (src/worker.js dropImpossibleLaps does it for every upload from now):
-- one that did not go round the whole circuit (no sector times where its session's other laps have them), one driven
-- at pit-lane speed (its top speed under 40 % of its session's fastest lap's) or one far quicker than
-- anybody's laps of the same car and track (under 70 % of their average). A share made from one goes and the
-- account's best is shared again by the ten-minute job (repairImpossibleShares).
UPDATE laps SET valid=0 WHERE valid=1 AND vmax>0
  AND vmax < 0.4*(SELECT MAX(l2.vmax) FROM laps l2 WHERE l2.session_id=laps.session_id);
UPDATE laps SET valid=0 WHERE valid=1 AND COALESCE(sectors,'[]')='[]'
  AND EXISTS (SELECT 1 FROM laps l2 WHERE l2.session_id=laps.session_id AND COALESCE(l2.sectors,'[]')<>'[]');
UPDATE laps SET valid=0 WHERE valid=1 AND time < 0.7*(
  SELECT AVG(l2.time) FROM laps l2 JOIN sessions s2 ON s2.id=l2.session_id JOIN sessions s1 ON s1.id=laps.session_id
  WHERE l2.valid=1 AND l2.session_id<>laps.session_id AND s2.track=s1.track AND COALESCE(s2.track_config,'')=COALESCE(s1.track_config,'')
    AND s2.car=s1.car AND COALESCE(s2.game,'iracing')=COALESCE(s1.game,'iracing'));
UPDATE sessions SET best=(SELECT MIN(time) FROM laps WHERE session_id=sessions.id AND valid=1 AND drv IS NULL);
