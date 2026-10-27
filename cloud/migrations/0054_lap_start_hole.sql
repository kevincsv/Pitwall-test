-- PitlaneHQ.exe started every lap when iRacing counted it, a second or more after the line, so each lap began with a
-- hole of tens of metres and the hole check made the clean fast laps not valid. These laps had no Off Track and went
-- round the whole circuit: valid again, their sessions' best follows, and the job reshares their sessions.
UPDATE laps SET valid=1 WHERE id IN (
  SELECT l.id FROM laps l JOIN sessions s ON s.id=l.session_id
  WHERE l.valid=0 AND l.time>0 AND l.sectors IS NOT NULL AND l.drv IS NULL
    AND s.uploader='acct:95613aa4572fb73372e508aa' AND l.created > 1792972800000
    AND json_extract(l.trace,'$.d[0]')=json_extract(l.trace,'$.d[7]')
    AND json_extract(l.trace,'$.d[0]')<>json_extract(l.trace,'$.d[40]')
    AND COALESCE(json_extract(l.trace,'$.incK'),'[]') NOT LIKE '%off%'
    AND COALESCE(json_extract(l.trace,'$.incK'),'[]') NOT LIKE '%contact%'
);
UPDATE sessions SET best=(SELECT MIN(time) FROM laps WHERE session_id=sessions.id AND valid=1 AND drv IS NULL)
  WHERE uploader='acct:95613aa4572fb73372e508aa' AND started > 1792972800000;
INSERT INTO app_state (k, v, at)
  SELECT 'reshare', json_group_array(id), CAST(strftime('%s','now') AS INTEGER)*1000 FROM sessions
  WHERE uploader='acct:95613aa4572fb73372e508aa' AND started > 1792972800000
  ON CONFLICT(k) DO UPDATE SET v=excluded.v, at=excluded.at;
