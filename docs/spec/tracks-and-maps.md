# Lap paths, track layouts, turns, racing line and pit lane

How this part of Pitlane HQ behaves. Read it before changing this area; keep it up to date when the behaviour changes.

- The lap's path (Trace.x/y every 5 m) comes from the game's own position when it gives it (iRacing's Lat/Lon; AC and LMU
  make them from the car's position): exact, x east and y north of an origin `g` [lat, lon] (the first position seen on
  the track, rounded to 0.01°, one per track while the program runs; `place`/`geoBase` in cloud.go), carried as `Trace.g`.
  Without it, dead reckoning from the heading and speed as before (no `g`, the loop closed by spreading the drift). Two
  paths line up only in one frame (`sameFrame` on the web and the phones: both with `g`, B moved to A's origin, or both
  without); a layout from the game's position (`track_maps.geo`, migration 0052, `g` on `/community/trackmaps`) replaces
  one by dead reckoning whatever the lap time and is never replaced by one (the agent's `shareLayout`, the web's
  `shareTrackMap`). The layouts drawn by dead reckoning are rebuilt from a stored lap of the same game and track with the
  game's position (`cloud/src/trackmaps.js`, `rebuildTrackMaps`: a few tracks per ten-minute run, looked at again once a
  day, app_state `trackmaps_rebuild`; Admin → Server → "Rebuild the track maps" does them all, POST
  `/community/admin/trackmaps-rebuild`), and the PC replays the newest .ibt files of a track whose community map has no
  `g` to share its fastest valid lap with the game's position (`ibtTrackScan` in trackturns.go). A track's corners come
  from the geometry of its layout (`cloud/src/trackgeo.js`: a bend tighter than 300 m of radius for 20 m or more, bends
  the same way closer than 60 m are one corner, the apex where it bends most), fitted to the track's official number of
  turns when the game says it (iRacing's `WeekendInfo.TrackNumTurns`, `track_info` on the server, migration 0074, POST
  `/community/trackinfo` and `nturns` with every layout; the agent sends it once per track while it runs, for the session
  driven, `noteTrackTurns`, and for every track of the .ibt files on the PC, their header only, `ibtTrackScan`): more
  bends than turns join the closest neighbours bending the same way under 100 m apart, else the gentlest bend is no turn;
  fewer split a corner with two clear apexes (peaks 30 m or more apart, the bend easing under 60 % between them), then
  relax the radius limit step by step (400, 550, 750, 1000 m), never inventing a turn on a straight (`fitCount`). Served
  by `/community/turns` as `auto: true` (with `count` when known) until an admin places the official turns, which always
  win, so every device numbers the same corners. The coach's corners (`cornerZones` in web/dist/pitwall-analysis.js, which the web, the PC app and the phones run,
  and in ovnative4.go; the phones' LapMath/Models keep a copy only for when their JavaScript engine cannot run) are the
  reference's braking zones named by those turns (two brake applications in one corner are one corner) plus the turns the
  reference takes without braking (a lift, from its last full throttle before the apex), whose tips never speak of braking.
- The racing line (`racingline.go`, `lineOffsets`/`cornerLine`/`lineTip` in pitwall-analysis.js; the phones' LapMath only as
  the fallback): both laps'
  paths (Trace.x/y, same frame) give how far A was to one side of B at every 5 m (drift out with a
  ±400 m moving average); the coach turns it into inside/outside at B's turn-in, apex and exit (1.5 m or more) and says
  it first when you brake at the reference's point on the wrong part of the track. The model's record and next levels
  carry their line (`idealXY`, ladder x/y, `lapPath` in model.js). The line is read in the coach's tips and the "Line"
  chart only: no map draws it (the owner's choice, they never looked right). Every map (analyzer, coach, race summary,
  track page, the live map, the Community board's map, the map overlay, phones) draws the track as a road with depth
  (shadow, rim, asphalt) from the community's generated layout (`trackMapFor`/`commTrackMap` on the web, `loadMap` in
  ovnative4.go, `trackLayout`, `layout` in the phones' `LapAnalysis`), never a lap's own path, no lap's line on it and no
  "Line A / B" switch; a lap's own path (or the live map's own laps) draws only the road's shape while the track has no
  layout. What goes on the road is placed by where on the lap it is: braking points, the coach's rings, incidents, the
  turns, the sectors, the gain and loss colours, the start/finish line, the direction arrow and the cars.
- Official turn numbers (`track_turns` on the server, `/community/turns`, `/api/turns`): an admin places T1 … Tn on a
  track's map in the race summary ("Official turns · Admin", clicks in order, saved for everyone, as fractions of the lap).
  The coach, the lap analyzer and the race summary (PC, web, phones: `turnNo`) give every corner the number of the
  official turn nearest its apex; a track without them keeps the corners counted from the laps.
- The pit lane (`pitlane.go`, `track_pits` on the server, `/community/pitlane`): every lap through the pits marks its
  points on the pit road (OnPitRoad); against a clean lap of the same track each becomes "metres to the left of the
  track at this 5 m point". The PC keeps learning it, but no map draws it for now (the owner's choice). Every map
  (analyzer, coach, race summary, phones, map overlay) draws the direction arrow beside the start/finish line.
- The coach's line: when the reference is a rival's lap (no path), the model's `lineXY` (the fastest lap of the car
  and track with a path) or, on the phones, your own best lap gives the line to compare with.
