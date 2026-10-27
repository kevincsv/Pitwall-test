-- A lap with an Off Track incident is never valid (the rule since 0.4.4); the laps recorded before it by an older
-- agent kept their verdict. The same verdict for every lap, the sessions' best follows, and the job shares them again.
UPDATE laps SET valid=0 WHERE valid=1 AND COALESCE(json_extract(trace,'$.incK'),'[]') LIKE '%off%';
UPDATE sessions SET best=(SELECT MIN(time) FROM laps WHERE session_id=sessions.id AND valid=1 AND drv IS NULL)
  WHERE id IN (SELECT session_id FROM laps WHERE COALESCE(json_extract(trace,'$.incK'),'[]') LIKE '%off%');
INSERT INTO app_state (k, v, at)
  VALUES ('reshare', (SELECT json_group_array(id) FROM (
      SELECT DISTINCT value AS id FROM json_each(COALESCE((SELECT v FROM app_state WHERE k='reshare'), '[]'))
      UNION SELECT DISTINCT session_id FROM laps WHERE COALESCE(json_extract(trace,'$.incK'),'[]') LIKE '%off%')),
    CAST(strftime('%s','now') AS INTEGER)*1000)
  ON CONFLICT(k) DO UPDATE SET v=excluded.v, at=excluded.at;
