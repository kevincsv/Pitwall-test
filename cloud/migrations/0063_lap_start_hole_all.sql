-- PitlaneHQ.exe from 27 October 09:00 UTC started each lap at the line but dropped its first metres (the game's lap
-- clock still ran the lap before's), so every lap began with a hole and no clean lap was valid. These laps had no Off
-- Track nor contact and went round the whole circuit: valid again, for every account. Their sessions' best follows
-- and the ten-minute job shares them again (the leaderboards and records).
UPDATE laps SET valid=1 WHERE id IN (
  SELECT l.id FROM laps l
  WHERE l.valid=0 AND l.time>0 AND l.sectors IS NOT NULL AND l.drv IS NULL AND l.created > 1793091600000
    AND json_valid(l.trace)
    AND json_extract(l.trace,'$.d[0]')=json_extract(l.trace,'$.d[7]')
    AND json_extract(l.trace,'$.d[0]')<>json_extract(l.trace,'$.d[40]')
    AND COALESCE(json_extract(l.trace,'$.incK'),'[]') NOT LIKE '%off%'
    AND COALESCE(json_extract(l.trace,'$.incK'),'[]') NOT LIKE '%contact%'
);
UPDATE sessions SET best=(SELECT MIN(time) FROM laps WHERE session_id=sessions.id AND valid=1 AND drv IS NULL)
  WHERE id IN (SELECT session_id FROM laps WHERE created > 1793091600000);
INSERT INTO app_state (k, v, at)
  VALUES ('reshare', (SELECT json_group_array(id) FROM (
      SELECT DISTINCT value AS id FROM json_each(COALESCE((SELECT v FROM app_state WHERE k='reshare'), '[]'))
      UNION SELECT DISTINCT session_id FROM laps WHERE created > 1793091600000)),
    CAST(strftime('%s','now') AS INTEGER)*1000)
  ON CONFLICT(k) DO UPDATE SET v=excluded.v, at=excluded.at;
