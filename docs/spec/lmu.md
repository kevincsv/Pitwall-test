# Le Mans Ultimate support

How this part of Pitlane HQ behaves. Read it before changing this area; keep it up to date when the behaviour changes.

- Le Mans Ultimate is supported like iRacing (PC, web and phones), labelled "Beta" wherever it is offered (drivers report
  problems to support@pitlanehq.app): read from the game's own `LMU_Data` shared memory
  (Settings → Gameplay → Enable Plugins, nothing to install), turned into an iRacing-shaped image (`lmu.go`,
  `irimage.go`) so every overlay, the recorder, the journal and the coach work unchanged. Its official sectors are
  learnt from the game's sector changes (`lmuSectors`, kept per track in `lmu-sectors.json`) and written as
  SplitTimeInfo; start lights, wind and the fuel rate come from the game; it has no iRating, licences or incident
  count (contacts stand in, `GAME_NO.lmu`). What works in which game is one table, `web/dist/pitwall-games.js`
  (`PW_GAMES`: what each game lacks, what each overlay, column and item needs), read by the app (`gameHas`,
  `gameBadges`) and the agent (`gamesupport.go`, `gamesupport_test.go`): the Overlays tab badges the games each overlay
  works in and its Auto switch is per game (`CFG.autoWidgets` plus `ui.autoOff[game]`, `setAutoIn`/`autoIn`; a game it
  does not work in is disabled and the agent never opens it there, `autoFor`), the settings of the relative and the
  standings badge the iRacing-only columns and items and do not offer them while LMU is chosen, and the native
  relative and standings leave them out in LMU (the stream's status names the game). A session is "vs AI" when the game marks AI drivers (`CarIsAI`), an
  online one counts as official for the model, a test day is "Offline Testing"; the session text carries the results
  as iRacing writes them (`lmuResults`: ResultsPositions with the place, class place, laps and best of every car,
  rebuilt only when a car crosses the line or sets its best, compared field by field), so an LMU race summary has its
  field and its rivals; every car keeps its index for the session (`carIdx`), given again only to a car long gone (five
  minutes) when all 64 are taken, and the field watcher then starts that index again (`fieldDrivers`: another driver
  there in the session text, by team, else driver id, else name, read by `fieldText.update` after `fieldSession` when
  the text changes), so the newcomer never inherits the car before's best; a rival's position comes about five times a second, so the bins it goes through
  between two take the move's speed (`fieldFillBins`); the layouts, pit lanes and turns
  are per game on the server (`track_maps`, `track_pits`, `track_turns` keyed by game and track id, the agent's
  `/api/trackmap` and `/api/turns` default to the game being read). The map's position is made from the game's
  world frame (left-handed: north = -z, east = -x, to be confirmed against a real circuit).
