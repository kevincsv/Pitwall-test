-- Le Mans Ultimate's practice says "lap counts, time does not" (LapCountFlag 1) for every lap, and the agent took that as
-- the game refusing the lap, so no practice lap was valid. The agent now counts only a drop of the flag; these laps (LMU
-- practice, no incident, every sector, within 3 % of the session's fastest) are valid again, their sessions' best follows
-- and the ten-minute job shares them again.
UPDATE laps SET valid=1 WHERE id IN (
  SELECT l.id FROM laps l JOIN sessions s ON s.id=l.session_id
  WHERE s.game='lmu' AND s.kind='Practice' AND l.valid=0 AND l.drv IS NULL AND l.time>0 AND l.sectors IS NOT NULL
    AND l.created < 1793260000000 AND json_valid(l.trace) AND json_extract(l.trace,'$.incK') IS NULL
    AND l.time <= 1.03*(SELECT MIN(x.time) FROM laps x WHERE x.session_id=l.session_id AND x.time>0 AND x.sectors IS NOT NULL)
);
UPDATE sessions SET best=(SELECT MIN(time) FROM laps WHERE session_id=sessions.id AND valid=1 AND drv IS NULL)
  WHERE game='lmu' AND kind='Practice';
INSERT INTO app_state (k, v, at)
  VALUES ('reshare', (SELECT json_group_array(id) FROM (
      SELECT DISTINCT value AS id FROM json_each(COALESCE((SELECT v FROM app_state WHERE k='reshare'), '[]'))
      UNION SELECT id FROM sessions WHERE game='lmu' AND kind='Practice')),
    CAST(strftime('%s','now') AS INTEGER)*1000)
  ON CONFLICT(k) DO UPDATE SET v=excluded.v, at=excluded.at;
