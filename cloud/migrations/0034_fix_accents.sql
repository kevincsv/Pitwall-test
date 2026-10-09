-- Names saved by PCs before 0.3.4 read the game's UTF-8 as latin-1 ("AutÃ³dromo"): put the accents back.
-- The PC keeps valid UTF-8 since then (latin1 in irsdk.go), so only old rows carry it.
UPDATE sessions SET track = replace(replace(replace(replace(replace(replace(replace(track, 'Ã¡', 'á'), 'Ã©', 'é'), 'Ã­', 'í'), 'Ã³', 'ó'), 'Ãº', 'ú'), 'Ã±', 'ñ'), 'Ã¼', 'ü') WHERE track LIKE '%Ã%';
UPDATE sessions SET track_config = replace(replace(replace(replace(replace(replace(replace(track_config, 'Ã¡', 'á'), 'Ã©', 'é'), 'Ã­', 'í'), 'Ã³', 'ó'), 'Ãº', 'ú'), 'Ã±', 'ñ'), 'Ã¼', 'ü') WHERE track_config LIKE '%Ã%';
UPDATE sessions SET car = replace(replace(replace(replace(replace(replace(replace(car, 'Ã¡', 'á'), 'Ã©', 'é'), 'Ã­', 'í'), 'Ã³', 'ó'), 'Ãº', 'ú'), 'Ã±', 'ñ'), 'Ã¼', 'ü') WHERE car LIKE '%Ã%';
UPDATE community_laps SET track = replace(replace(replace(replace(replace(replace(replace(track, 'Ã¡', 'á'), 'Ã©', 'é'), 'Ã­', 'í'), 'Ã³', 'ó'), 'Ãº', 'ú'), 'Ã±', 'ñ'), 'Ã¼', 'ü') WHERE track LIKE '%Ã%';
UPDATE community_laps SET car = replace(replace(replace(replace(replace(replace(replace(car, 'Ã¡', 'á'), 'Ã©', 'é'), 'Ã­', 'í'), 'Ã³', 'ó'), 'Ãº', 'ú'), 'Ã±', 'ñ'), 'Ã¼', 'ü') WHERE car LIKE '%Ã%';
UPDATE community_reports SET track = replace(replace(replace(replace(replace(replace(replace(track, 'Ã¡', 'á'), 'Ã©', 'é'), 'Ã­', 'í'), 'Ã³', 'ó'), 'Ãº', 'ú'), 'Ã±', 'ñ'), 'Ã¼', 'ü') WHERE track LIKE '%Ã%';
UPDATE community_reports SET car = replace(replace(replace(replace(replace(replace(replace(car, 'Ã¡', 'á'), 'Ã©', 'é'), 'Ã­', 'í'), 'Ã³', 'ó'), 'Ãº', 'ú'), 'Ã±', 'ñ'), 'Ã¼', 'ü') WHERE car LIKE '%Ã%';
UPDATE track_maps SET track = replace(replace(replace(replace(replace(replace(replace(track, 'Ã¡', 'á'), 'Ã©', 'é'), 'Ã­', 'í'), 'Ã³', 'ó'), 'Ãº', 'ú'), 'Ã±', 'ñ'), 'Ã¼', 'ü') WHERE track LIKE '%Ã%';
-- the car cards name the tracks they were driven on: build them again
UPDATE car_cards SET dirty = 1;
