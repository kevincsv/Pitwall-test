# Sessions, laps, lap validity, AI races and iRating

How this part of Pitlane HQ behaves. Read it before changing this area; keep it up to date when the behaviour changes.

- A session started again without leaving it (an AI race restarted: same session number, its clock back at zero)
  numbers its laps after the ones already driven (`sessionrun.go`, `noteRun`): no lap takes another's place on the
  server or in the race summary, and an unfinished race goes on with every run's laps (a finished one starts a new
  report). A lap's time waits until the game's is this lap's (`waitLastLap`, `lapTimeRec`), never the lap before's.
- Races against iRacing's AI (`ai`; an offline race, id "t-…", counts too) say "vs AI" (`aiBadge`, the phones'
  `AiBadge`), the AI drivers are marked "AI" in the results (no driver notes), and they never go to the public profile.
  They have no iRating at all: no change, no estimate, no iR columns, nothing in Home's races, the licence summary or
  the ratings (`clearAIRatings`, which also cleans older summaries when the journal loads; `isAIRace` on the web; `ai`
  on the phones). An estimate is never made from a driver without an iRating (`irChanges`).
  A session the server has no `ai` flag for (recorded by an older agent) is against the AI when it is an iRacing
  session without a subsession (id "t-…" after the server's `acct_…:` prefix) that is not a test (like `markOfflineAI`): the web's `sessIsAI` (the session
  picker, My sessions, the session's window, the "Looking at" line and the session lists' text), the server when it
  saves a session (`offlineAI`; migration 0039 marks the old ones) and the phones' session parsing. Every session list
  shows "vs AI" and the DRINKS pill the same way.
- A race's real iRating comes from your next session of the same discipline only (each has its own iRating; a change
  over 300 is another one's), never from a session of another one (`applyRealIR`, which finds your last race of that
  discipline even with races of others after it). iRacing says "Road" for sports and formula cars alike, so the car
  tells which (`discipline` in journal.go). A race left on the estimate takes the real change from your next race of
  the same discipline (`chainRealIR`); races spoiled by another category go back to the estimate (`repairRealIR`).
- What makes a lap not valid, and only that (`invalid()` in cloud.go, the same verdict for the race summary's laps):
  leaving the track (an Off Track incident, or all four wheels out for a third of a second) or lost connection (a hole
  of more than 40 m in its telemetry, or not the whole circuit). A Loss of Control (2x) or a Car Contact (4x) counts
  only when it takes the car off the track; a lap through the pit lane is valid, a rival's too (field.go). Incidents
  are named as iRacing names them, by their points: 1x Off Track, 2x Loss of Control, 4x Car Contact, 0x Light
  Contact (never seen in the count); never "spin". The game's own verdict counts too: Le Mans Ultimate's `LapCountFlag` (the game says the lap's time does not count, the pit lane aside) and iRacing's own best lap (`gameAccepts`: a lap faster than iRacing's best of the session that iRacing does not take as its best was not accepted, so it is not valid; a slower lap, or no best yet, says nothing).
  A penalty the game gives during the lap (Le Mans Ultimate's `PlayerNumPenalties` rising off the pit road after the
  lap's first 100 m, `penalty` on the lap) makes it not valid too and is recorded as a 1x Off Track where it was given.
  A kerb never makes a lap not valid: a sample off the track (`PlayerTrackSurface` 0) counts toward the four wheels out
  only when the surface under the car (`PlayerTrackSurfaceMaterial`, iRacing's irsdk_TrkSurf) is not asphalt, concrete,
  paint or a rumble strip (`pavedMaterial`); without that variable every sample off the track counts, as before. In Le
  Mans Ultimate the car is off the track only with all four wheels on grass, dirt or gravel (lmu.go reads the wheels;
  two on the grass are a wide line, not an Off Track), the surface under the wheels goes out as iRacing's material and
  the game's own `LapCountFlag` catches the cuts (only a drop counts: the flag said the lap's time counts and then took it back, `cntOK`; LMU's practice says "lap, not time" for every lap, which says nothing). A rival's lap is judged the same way (field.go): a third of a second
  off the track counted in the game's time (`fieldOffTime`, the same at 60 or 5 updates a second), a kerb or paint
  under it never counting when the game says the material (`CarIdxTrackSurfaceMaterial`), the game's own best, and
  `LapCountFlag` judged when the lap ends (a pit road reached within 200 m of the flag's drop is the in-lap).
- A lap goes round the whole circuit (through the pit lane counts): one that did not is never a best, a share or the
  model's. The PC marks it not valid (under 90 % of its points seen on track, `fullLap` in cloud.go: a reset, a tow;
  a hole over 40 m, `lapHoleM`: two samples further apart than that leave the points between them empty, never filled
  in; the end of a lap never recorded, from its last sample to the line by where the game put that sample on the lap,
  counts as a hole too; a reset, the car put back further on the lap than it was and not over the line it could have
  driven to, `drivable`, even to a box just past the line), judged when the lap ends (`markHoles`) so the race summary
  says the same (laprec_test.go drives an out-lap, a reset to a box ahead and behind, a tow and lost telemetry through
  the recorder),
  and the server a lap without sector times where its session's other laps have them (`dropImpossibleLaps` on every
  upload, migration 0046 for the old ones, `repairImpossibleShares` in the ten-minute job).
