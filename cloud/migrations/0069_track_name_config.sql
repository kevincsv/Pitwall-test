-- An empty track configuration read the session text's next line, so some shared laps are named
-- "Tsukuba Circuit 2k Full · TrackCity: Shimotsuma": their own name back (a real configuration never has a colon).
UPDATE community_laps SET track=substr(track,1,instr(track,' · ')-1) WHERE instr(track,' · ')>1 AND instr(substr(track,instr(track,' · ')),':')>0;
UPDATE community_reports SET track=substr(track,1,instr(track,' · ')-1) WHERE instr(track,' · ')>1 AND instr(substr(track,instr(track,' · ')),':')>0;
