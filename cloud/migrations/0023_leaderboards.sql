-- Leaderboards by discipline and license class, and the fastest lap shared by itself (0.8.11)
-- the license class of the driver when the lap was driven (R, D, C, B, A, P) and the discipline the PC saw
ALTER TABLE community_laps ADD COLUMN lic TEXT;
ALTER TABLE community_laps ADD COLUMN cat TEXT;
-- an account's current license class per discipline (JSON, from iRacing when the PC or the web knows it)
ALTER TABLE community_users ADD COLUMN lics TEXT;
-- the fastest valid lap of each car and track in every account goes to the leaderboard by itself (with its
-- telemetry when it has some), under the account's name, or as Anonymous when the account chose so; a faster
-- lap already shared stays
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
