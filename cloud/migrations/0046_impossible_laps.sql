-- A lap goes round the whole circuit (through the pit lane too): one without sector times where its session's other
-- laps have them never crossed the sector lines (a reset or a tow counted as a lap) and is no best
-- (src/worker.js dropImpossibleLaps does it for every upload from now). A share made from one goes and the account's
-- best is shared again by the ten-minute job (repairImpossibleShares).
UPDATE laps SET valid=0 WHERE valid=1 AND COALESCE(sectors,'[]')='[]'
  AND EXISTS (SELECT 1 FROM laps l2 WHERE l2.session_id=laps.session_id AND COALESCE(l2.sectors,'[]')<>'[]');
UPDATE sessions SET best=(SELECT MIN(time) FROM laps WHERE session_id=sessions.id AND valid=1 AND drv IS NULL);
