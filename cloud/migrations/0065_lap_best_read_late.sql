-- Three clean laps of one account at Tsukuba in the Ray FF1600 stayed not valid after 0063. Two were driven on 28
-- October around 00:53 UTC by a PC still on the build that dropped each lap's first metres (the start hole 0063 cleared)
-- but uploaded after 0063 ran; the third, in a race on 0.6.1, was faster than the lap two before but slower than the
-- lap just before, which iRacing's best read as the lap started missed (fixed by ed539c8). None has an incident, all
-- three have their three sectors and go round the whole circuit: valid again. Their sessions' best follows and the
-- ten-minute job shares them again (the leaderboards, the records and the model).
UPDATE laps SET valid=1 WHERE valid=0 AND inc=0 AND COALESCE(sectors,'[]')<>'[]' AND id IN (
  'acct_95613aa4572fb73372e508aa:ir-89691109-0-32',
  'acct_95613aa4572fb73372e508aa:ir-89691109-0-34',
  'acct_95613aa4572fb73372e508aa:ir-89692599-2-7');
UPDATE sessions SET best=(SELECT MIN(time) FROM laps WHERE session_id=sessions.id AND valid=1 AND drv IS NULL)
  WHERE id IN ('acct_95613aa4572fb73372e508aa:ir-89691109-0', 'acct_95613aa4572fb73372e508aa:ir-89692599-2');
INSERT INTO app_state (k, v, at)
  VALUES ('reshare', (SELECT json_group_array(id) FROM (
      SELECT DISTINCT value AS id FROM json_each(COALESCE((SELECT v FROM app_state WHERE k='reshare'), '[]'))
      UNION SELECT 'acct_95613aa4572fb73372e508aa:ir-89691109-0'
      UNION SELECT 'acct_95613aa4572fb73372e508aa:ir-89692599-2')),
    CAST(strftime('%s','now') AS INTEGER)*1000)
  ON CONFLICT(k) DO UPDATE SET v=excluded.v, at=excluded.at;
