-- Test drives never teach the model nor go to the leaderboard: anything can happen in one (0.8.11).
-- whether the session was of an official series (iRacing's WeekendInfo.Official; null when the PC did not say):
-- the laps of hosted, league and AI sessions still show on the leaderboard but do not teach the model
ALTER TABLE sessions ADD COLUMN official INTEGER;
-- your license class in the session and the discipline the PC saw: the analyzer and the coach filter by them
ALTER TABLE sessions ADD COLUMN lic TEXT;
ALTER TABLE sessions ADD COLUMN cat TEXT;
ALTER TABLE community_laps ADD COLUMN official INTEGER;
-- the laps already shared from a test drive leave the leaderboard
DELETE FROM community_laps WHERE EXISTS (
  SELECT 1 FROM laps a JOIN sessions s ON s.id=a.session_id
  WHERE s.uploader='acct:' || community_laps.user_id AND s.track_id=community_laps.track_id AND s.car_id=community_laps.car_id
    AND ABS(a.time-community_laps.time)<0.0005 AND LOWER(COALESCE(s.kind,'')) LIKE '%test%');
-- and the account's fastest lap of a practice, qualifying or race takes their place
INSERT INTO community_laps (id, user_id, car_id, car, track_id, track, time, sectors, trace, created, anon, game, shown)
SELECT lower(hex(randomblob(12))), x.uid, x.car_id, x.car, x.track_id, x.track, x.time, x.sectors, x.trace, x.created, x.anon, x.game, x.shown FROM (
  SELECT acc.id AS uid, s.car_id, s.car, s.track_id,
    s.track || CASE WHEN COALESCE(s.track_config,'')<>'' THEN ' · ' || s.track_config ELSE '' END AS track,
    a.time, a.sectors, a.trace, a.created, COALESCE(acc.anon,0) AS anon, s.game,
    CASE WHEN acc.name_kind='iracing' THEN 'iracing' ELSE 'nick' END AS shown,
    ROW_NUMBER() OVER (PARTITION BY acc.id, s.track_id, s.car_id ORDER BY a.time, (a.trace IS NULL)) AS rn
  FROM laps a JOIN sessions s ON s.id=a.session_id JOIN accounts acc ON s.uploader='acct:' || acc.id JOIN community_users u ON u.id=acc.id
  WHERE s.uploader LIKE 'acct:%' AND s.track_id>0 AND s.car_id>0 AND a.valid=1 AND a.time>10 AND a.time<3600 AND LOWER(COALESCE(s.kind,'')) NOT LIKE '%test%'
) x WHERE x.rn=1
ON CONFLICT(user_id, car_id, track_id) DO UPDATE SET time=excluded.time, sectors=excluded.sectors, trace=excluded.trace, created=excluded.created, car=excluded.car, track=excluded.track, game=excluded.game
  WHERE excluded.time < community_laps.time OR (community_laps.trace IS NULL AND excluded.trace IS NOT NULL);
UPDATE model_cache SET dirty=1;
