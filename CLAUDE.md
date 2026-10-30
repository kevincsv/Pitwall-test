# Pitlane HQ: rules for working on this project

- Reply to the owner in Spanish.
- The apps' languages are English, Spanish and Portuguese (Brazil) only (`LANGS` in index.html, `uiLang` in Go, `lang` in
  email.js): no German and no bilingual "EN + ES"; a German or bilingual choice from before reads English or Spanish.
- Push only when the owner says so ("súbelo", "sube todo"…). Never create pull requests unless asked. When they say
  so, push every pending change (designs and small fixes included), never only part of it.
- Changes are released in big batches, never one by one: people should not get a stream of small updates. Every
  change is committed and pushed to the working branch only (never master), tested together, and goes to master in
  one push when the owner asks for the batch ("sube todo", "súbelo a producción"). A fix that cannot wait (the app
  broken for people) is the one exception, and only when the owner says so.
- The notices the apps show in their inbox (`web/dist/app-news.json`, every device reads it from the server) are
  never added or changed without asking the owner first, one by one, even when they say "sube todo" for everything
  else: show the text and wait for their yes before it goes in.
- Anything sensitive that goes to GitHub is encrypted or kept in GitHub secrets; never paste
  Cloudflare tokens or keys anywhere.
- The subscription stays off (`license_plans.json` → `enforce: false`).
- Pitlane HQ Pro (`cloud/src/lemon.js`, migration 0043, `PRO`/`proGated`/`renderProCard` in index.html): everything is
  free during the beta; when it ends the admin switches Pro on (admin page → Pro, app_state `pro_gate`). Then without Pro
  the experimental overlays close (and never open by themselves) and only `freeApps` (3) of the programs the PC
  starts by itself (Settings → Programs, when Pitlane HQ opens or iRacing starts, `apps.go`) start; the overlays on Auto
  have no limit of their own; admins always have it. Pro is the
  lifetime offer (`lifetime` in license_plans.json: 12 € during the beta, 24 € after, paid once) bought with Lemon
  Squeezy (`lifetime.buy` is the checkout link; the checkout carries the account id; POST `/lemonsqueezy/webhook`
  signed with LEMONSQUEEZY_WEBHOOK_SECRET; a buyer without an account gets it when they sign up with that email) or
  given by hand on the admin page. Patreon donations are still welcome beside it (Account → Pitlane HQ Pro). The Account card is hidden for now
  (`PRO_CARD_ON` false in index.html) until the owner says otherwise.
  Pro limits only the PC (its experimental overlays and the programs it starts); the web and the phones only receive and always have
  everything. Pro lives on one PC at a time (`pcid.go`: a hash of Windows' MachineGuid, sent as `?pc=` on `/community/pro`
  and `/account/me`; `pro_pc` on the account, `proHere` in lemon.js): the first PC that asks takes it, another PC of the
  account is told where it is and offers "Move to this PC" (`/community/pro/pc`; the other PC goes back to free). The
  Auto list goes with the account and is never trimmed: the agent opens only what this PC may (`proAutoList`: the
  basic overlays; `proAppsAllowed`: the first 3 programs of the list), and the app asks for Pro on a fourth program.
- The admin panel is its own page, only for admins (pitlanehq.app/admin → `/app#admin`, `v-admin`), reached from the
  header's Admin button with admin mode on (Account shows its button only then).
- Admin mode (the owner's choice): an admin sees Pitlane HQ exactly as everyone does by default, on every device. The
  header's Admin button (`#viewTg`, a shield, only for admins; `renderViewToggle`) turns admin mode on for that device
  (`pw.adminMode` in localStorage, `adminMode()`/`setAdminMode` in index.html; `isAdmin()` = an admin's account and admin
  mode on, `realAdmin()` the account alone) and opens the admin page; with it on, the button opens a small menu (Open the
  admin page, Turn admin mode off) and everything for admins and in development shows. Opening /admin with it off turns
  it on. The PC's agent follows the page (POST `/api/adminmode`, `adminmode.go`, `admin-mode.json` in the data folder,
  never synced): `wipAllowed()` is an admin's account and admin mode on, while what is not "in development" keeps
  reading the account (`realAdminSigned`: DRINKS, the voice chat answering, the LMU data capture). About also has the
  switch. The phones have their own admin mode (off by default) in Settings.
- Real data by default: no demo races, sample drivers or made-up laps on the server. Invented data
  only behind Settings → About → Demo data, which only admins see (web/PC: pitwall-demo.js; phone
  apps: Settings → Admin), never uploaded, with a banner on every screen. The `-demo` flag of
  PitlaneHQ.exe is for development only and has no button in the app. The one exception is the web's visitor
  (`web/dist/pitwall-tour.js`, COMPANION and not signed in): the landing. The app header carries Downloads, Records
  and the language; the "me" view's own sign-in (or create account) panel moves into the hero beside the tagline (styled
  as the design: sentence-case buttons, Sign in and Create account side by side), its title and welcome hidden; and under it (`#tour` after `#meBody`, mounted by `signWall` while the wall is up) one page
  like a product site in the "clean data" design (never a slideshow): the tagline and the calls to action, the app in a
  Windows 11 window (its icon and name, minimise, maximise, close; never a browser bar or an address), "What Pitlane HQ
  does" as rows (a title, one short sentence, a screenshot of the app in that window), "Overlays over iRacing and Le Mans Ultimate" (the
  overlays moving over a dark scene: one lap played in a loop with the relative, delta bar, the agent's own radar
  (`drawRadarOv`: no box, 20 m, grey/amber/red cars, the red side bar, trails, the nearest distance), dash, pedals,
  map and fuel, labelled only "● LIVE", each frame writing only the overlays' boxes; then the overlays as the agent
  draws them, `landing/ov-*.png` from `ovSavePNG`), "Also on your phone" (the phone apps' own screenshots,
  `landing/<lang>/m-*.png` from the phones' screenshot job: race summary, laps, coach, telemetry), "And also" (driver notes, rev beeps,
  overlays in VR; never "one account everywhere") and "Start in two minutes". The screenshots (`landing/*.jpg`) are
  the app with its demo data, in Spanish, without the demo badge and with plausible names (never the owner's).
  "Create account" scrolls to the form at the top; a visitor never enters the app on invented data (`sampleOn()` is
  always false). Never on the PC app.
- One version number for PitlaneHQ.exe, the web and the phone apps, shown with "beta" until 1.0.0. The numbering
  started again at 0.4.1 (the owner's choice): the changelogs and What's new begin there, the releases of a higher number
  are deleted by the builds, and the phones announce an update when the server's number differs from theirs (not only
  when it is higher)
  (`appVersion`/`appStage` in main.go = `WEB_VERSION`/`APP_STAGE` in index.html, checked by a
  test). Raise it rarely: a MINOR version for a big set of features; fixes and small changes go into the current
  version (or a PATCH only when a fix must reach PCs that already have it), never one version per build.
  CHANGELOG.md (newest first), the phones' and whats-new.json list only the big versions and only what users notice;
  internal, server and small fixes are one "Fixes and improvements" line. These notes read as a person wrote them, in plain short sentences: no "Title: text" headings and never a
  ";" or a ":". A version gets a GitHub release.
- Every feature goes to the PC app, the web and the phone apps (the one exception, the owner's choice: the "Share your
  feedback" window that asks by itself is on the PC app and the web only; the phones have the floating feedback button,
  send their usage and their admin panel lists the feedback). Equivalent screens show the same information under the
  same names on every device (the phones' sub-tabs and labels are the PC's, never shortened versions; the web's
  phone-width layout is checked with `tools/ui-sweep.js`, a Playwright sweep of every view at 1300 and 390 px: no page
  error and no element wider than the screen, tables only inside a scrolling container).
- DRINKS mode (formerly Friday night mode): admins only, on the PC or from the phone app. A driver already on the
  list can be renamed (✎: the same driver on the server, `/guest-rename`, so their shared laps change name too) or
  taken off the list (×: what they shared stays; renamed, their laps in the summaries and the account follow). A lap
  is theirs who drove most of it (`noteDriver`/`topDriver`, counted once a second, `lapDriver` for the race report),
  never whoever is at the wheel after the line. Every lap goes to the account as soon as it is done, a friend's too
  with their name (`drv` on the lap, migration 0036): the session and its race summary keep every lap, and a
  friend's lap is never the account's best, its share or its trackbook best. Every race lap keeps who drove it (`drv`), and a race a friend drove
  any lap of carries them (`drinks`, you by your public name): My races, Home, My sessions, the race summary and the
  phones show a "DRINKS · Ana" badge, or "DRINKS · Multiple drivers" that opens who drove (their laps and best); the
  summary's laps say their driver (admins change it with ✎: `lapDriver` in /api/races and `/api/sessions/:id/driver`;
  a race recorded without the friends' names gets them with "Say who drove each lap (DRINKS)", `DRK_EDIT`) and
  your car in the results says who drove it; such a race never goes to your public profile. "DRINKS · Who drove"
  renames a driver everywhere (✎, `renameDrinksDriver` → `guestRename`). The PC's list of drivers (`Guests` in
  `community.json`, this PC only, never synced) comes back from the server by itself (`restoreGuests`,
  `/community/guests`: every friend who shared a lap from this account) and with "Recover the drivers from the
  server". When who drove a lap changes, the server makes every driver's shared best of that car and track again
  from the account's sessions (`reshareSession`): no leaderboard keeps a lap that is somebody else's now, and the
  lap goes up under its driver's name when it is their best. An admin joins a DRINKS driver to the friend's own
  account ("Link a DRINKS driver" on an account in the admin panel, PC, web and phones; `guest_links`, migration
  0037, `/admin/users/:id/link-guest` by driver id or name, `unlink-guest`): what was shared under the name goes
  to the account (per car and track the faster lap stays, like `/link-driver`), its reports and the model's memory
  too, and the laps shared later under that name (`/laps`, `/reports`, `reshareSession`) go to the account as it
  chose to be shown. Each driver is
  measured against their own laps only: the PC's stream says who drives (`driver` event, `drinksActive`), the overlays'
  and the app's laps keep their driver, and the delta, the live compare, the coach and the braking markers take that
  driver's best lap (`bestLap`/`ownDelta` in ovnative4.go, `liveBest`/`deltaNow` in index.html), never the game's
  best of the car.
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
- One model per car and track (`cloud/src/model.js`, fed to the coach and the lap analyzer by
  `web/dist/pitwall-model.js`): it learns from every real lap it knows (the accounts' laps, shared
  or not; shared laps; the laps of the rivals of your races) and its references are real laps,
  never composites: the record (the fastest lap really driven) and, for your pace, the lap of the
  driver just ahead. It has no panel of its own: the coach shows the record, the next level and
  your pace among the drivers known there, and both views offer its references as lap B; the lap
  list is coloured by it. No second "ideal" or theoretical lap anywhere (the Mini-sectors widget and overlay show the
  current lap against your best only, never a lap made of the best pieces).
  Test drives never teach the model nor go to the leaderboards; the model learns only from practice,
  qualifying and race laps of official series and of sessions against iRacing's AI, whose people are real drivers
  (`ai` on the session and the lap, `hasAI` in journal.go, migration 0035; the bots' laps never go up); hosted and
  league laps still show on the boards.
  The car card (`car_cards`, one per car, `buildCarCard` in model.js, `/community/car`): what a car
  does on every track it was driven on (hardest braking, the speeds the fast drivers shift up at, top
  speed and where), from the model's memory. The coach shows it against lap A only when nobody known
  is ahead on that car and track; the phone apps show it in the lap analysis. It is a hint of what the
  car can do, never a reference lap.
- The rev beep (Telemetry → Rev beep, its own sub-tab after Tyres, `v-revbeep`, `renderShiftPanel`/`shiftTick`, `pw.shift`;
  on Pitlane HQ Desktop the "REV BEEP" card at the top of Telemetry opens it): a beep to change up at the revs the driver chooses, kept per car: "Every gear
  at" one RPM, or one for each gear ("My RPM"), or iRacing's shift lights, or the estimate from their own flat-out laps;
  a moment early for the reaction time, pitch and volume, "Beeps in this screen" (the PC by default). No braking beeps
  any more (they did not work well): the Braking markers widget and overlay only show where to brake. There is no voice
  engineer, spotter, radio or audio packs anywhere any more (the owner's choice, 0.9.12): the PC never speaks and the only
  sound it makes by itself is the rev beep. The one exception is the voice chat, for admins only (`voice.go`, `VOICE`/
  `voiceIn` in index.html, `/voice/ice` in voiceice.js): a person talking to the driver, never a computer voice. A WebRTC
  call (Opus at 32 kbps at most, nothing sent while nobody talks (DTX, `voiceSdp`), no extra jitter buffer, echo and
  noise cancelled; TURN only when the two cannot reach each other directly) between the driver's PC (the app's page; it answers by
  itself, the driver is driving) and whoever watches it live (a device of the account the PC accepted, or anyone with its
  share code): "Talk to the driver" shows for them only while the PC is live and its account is an admin's. The call's
  messages go through the live room sealed like the telemetry (the agent passes them between the room and the page, and
  one window of the PC answers each call); the voice goes straight between the two. STUN by default, Cloudflare TURN
  when the server has TURN_KEY_ID and TURN_KEY_TOKEN; none in local mode. The bar (who, time, Mute, Hang up) stays above
  every window. Both PC windows let the app's own page use the microphone (Pitlane HQ Desktop's PermissionRequested for
  loopback; the agent's window through go-webview2, patched in vendor/ to read the permission's kind and allow the
  microphone: keep the patch if the library is vendored again). Settings → Phone & sharing has "Test the microphone"
  for admins, and a microphone that fails says why (`voiceMicError`: Windows' privacy switch, none found, in use). Web and PC for now (phone browsers too). Their braking
  points come from the model (the next level for your best lap of the session; your own best lap while the model has
  none or you are its fastest), each marker moves with your speed against that lap and with a car close ahead or
  alongside, and they name their corners by the official turns (`turnNo`, `turnName`), like the coach: "T7", never "C7".
- A race's real iRating comes from your next session of the same discipline only (each has its own iRating; a change
  over 300 is another one's), never from a session of another one (`applyRealIR`, which finds your last race of that
  discipline even with races of others after it). iRacing says "Road" for sports and formula cars alike, so the car
  tells which (`discipline` in journal.go). A race left on the estimate takes the real change from your next race of
  the same discipline (`chainRealIR`); races spoiled by another category go back to the estimate (`repairRealIR`).
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
- Your iRating and licence of every discipline (`ratings.go`, `ratings.json` in the account, `/api/ratings`; iRacing's
  sessions say "Formula" for the formula cars, `discipline`/`raceDisc`/`catOf` read it as Formula Car): the game
  only says the one of the session you are in, so the PC keeps the last seen of each (every session, and from the
  recorded races, ir + irChange); Home's "Licence summary" (PC, web, Pitlane HQ Desktop; the phones' Licence summary)
  shows them per discipline with Community's symbols and colours (`DISC_IC`, `.c-*`; `DiscIcons.cs` on the Desktop),
  centred in their cards, the licence as a pill in its colour, only as the game shows it in a session ("B 3.21"): a race
  gives none, so a discipline you have only raced shows no pill until a session (`licPill`, `LicBadge`, `licFull`),
  the change of the last races of each and one short line ("Updated when you join a session with iRacing and Pitlane HQ open"). Never one "current iRating" mixed
  from every discipline. The phones show the same five cards (`Licences`/`LicCard`, the symbols as path data in
  `DISC_PATHS`), and `/api/ratings` carries the change of the last five races of each (`chg`, `n`) for the Desktop.
- One Windows app, "Pitlane HQ" (never "preview" or a second download): one installer (`installer/PitlaneHQ.iss`,
  `PitlaneHQ-Setup.exe`; `PitlaneHQ-Desktop-Setup.exe` is the same file for old links) puts the native window
  (`PitlaneHQ.Desktop.exe`, self-contained) and the agent next to it, and its shortcuts open the window, which runs the
  agent as its engine (`-engine`). PitlaneHQ.exe started by itself (old shortcuts, the Run entry, the updater) opens
  the window when it sits next to it (`openDesktop`, desktoplaunch*.go); it uninstalls the old preview install. The
  updater's zip is the whole app folder (`out-desktop`, sub-folders kept); in engine mode it installs by itself too
  and says `PITLANEHQ_RESTART=` so the window starts again on the new version (`-replace <pid>`, with `-minimized`
  when it was hidden in the notification area, so it comes back as it was). The window is one instance
  (`Local\PitlaneHQ.Desktop`): a second start brings it forward, hidden or minimised (it sets the event
  `Local\PitlaneHQ.Desktop.Show` the running window waits on), never when Windows started it. Pitlane HQ lives in
  Windows' notification area like Steam or Garage 61 (`Tray.cs`, the app's icon with "Open Pitlane HQ" and "Quit" in
  the app's language, a click opens the window, never a balloon or a toast): closing the window (the header's close,
  Alt+F4) hides it there while the engine, the overlays, the sync, the updates and the live link keep running, and only
  Quit on its icon (or Windows shutting down or signing out) stops everything. Settings → "Closing the window keeps
  Pitlane HQ in the notification area" (`trayOnClose` in the agent's settings, on by default, read by the window from
  `/api/now`; shown only in Pitlane HQ Desktop, `INFO.desktop`) turned off makes closing quit. A device that presses
  Connect while the window is hidden brings it to the taskbar minimised with its button flashing, and the icon's menu
  says "A device wants to watch your telemetry" until it is answered (`pwAttention` from `liveAskShow`); never in front
  of the game. The installer asks it to quit first (`Local\PitlaneHQ.Desktop.Quit`, `QuitPitlaneHQ` in the .iss) so no
  icon is left behind, taskkill only as the fallback.
- Local mode (the owner's development, `tools/local.cmd`, never a button in the app): the whole of Pitlane HQ on one PC
  without internet. The server (`cloud/`, the same code as pitlanehq.app) runs on the PC with `wrangler dev --local
  --var LOCAL:1 --test-scheduled` (database and files in `cloud/.wrangler`, `DATA_KEY` in `cloud/.dev.vars`; `LOCAL=1`:
  every account is an admin, sign-up needs no email, `/server.json` names the local server). `PitlaneHQ.exe -local`
  (or `-server URL`, or the `PITLANEHQ_SERVER`, `PITLANEHQ_DATA`, `PITLANEHQ_PORT` environment the native window's engine
  and the overlay windows inherit; `localmode.go`): `commBase()` is that server, its own data folder (`PitlaneHQ-local`,
  the script copies the normal one once without the sign-ins) and port (8585), the native window its own instance, no
  updates, and the PC calls the server's ten-minute job (`/__scheduled`, the models). Nothing leaves the PC: every HTTP
  client of the program dials through `localDialContext` (`tlsTransport`, the live relay, the default transport), which
  refuses any host but the PC itself, the page is served without its Google Fonts link (`localPage`), the local server
  listens on 127.0.0.1 only and never pings IndexNow. pitlanehq.app never hears of local mode, and local mode is the
  owner's alone (the script needs the repository and Node.js; the shipped flag does nothing without that server). The
  laps already on pitlanehq.app are not there: the local server gets the laps driven from then on.
- The app's page takes its fonts from the program first (`/fonts.css` and `/fonts/*` from the embedded `ovfonts/`,
  `registerLocalRoutes`; on the web `fonts.css` is empty) and Google Fonts after, so with internet nothing changes
  and without it the app looks the same.
- Started with Windows (the installer's or Settings' "PitlaneHQ" Run entry, one only), PitlaneHQ.exe starts Pitlane HQ
  in the notification area (the window with `-minimized`: hidden there, nothing in the taskbar, the engine running,
  never shown by itself) and never brings an already open window forward.
- Race rivals named after the fact: the PC sends its race history's rivals once (`nameOldRivals`, `/rival-names`:
  matched by car, track and best lap; Anonymous or "Juan M." rivals this account shared take their whole name).
- Wherever other drivers show (the relative and the standings in the overlays, the app and Pitlane HQ Desktop; the race
  summary on the PC, web and phones), the cars a lap or more up or down on you carry a red "+1L" pill (they lap you,
  or finished laps ahead) or a blue "−1L". The Community car list shows no counts.
- One car under several badges is one car (`cloud/src/carfamily.js`, `CAR_FAMILIES` by the car's name: the Super
  Formula SF23, NASCAR's Cup Next Gen, Gen 6, Xfinity, Truck and ARCA, the Supercars Gen3, Gen2 and V8): they share one
  leaderboard, record, track page row, public page, Discord board and coach model under the first badge the server saw
  (`car_families`, migration 0045; the SF23 under 171 by 0044). A new badge joins by itself the first time a session or
  a lap brings it (`noteCar`), its laps going under the family's number, each driver keeping their faster lap; the
  sessions keep their real car but every list of cars (the session picker's filter) shows the family without the brand
  (`carFam`/`CAR_FAMS` in index.html, the same as `CAR_FAMILIES`), and a board lists its badges (`ids` in /combos, `onBoard` in index.html). Different
  layouts of a track (Spa's Grand Prix and Historic Grand Prix) stay apart. A new family is one line in `CAR_FAMILIES`.
- Leaderboards are by lap time, per discipline (Oval, Sports Car, Formula Car, Dirt Oval, Dirt Road),
  without license classes. The fastest lap of each car and track in an account is shared by itself
  (no "share" button), under the public name or as Anonymous. The discipline symbols are our own
  (`DISC_IC`), never copied; the same discipline cards are in Community and in "Choose a session".
  Sharing is never optional (no switches to keep the times, the traces, the rivals' laps or the live link to
  yourself): only the public name and Anonymous are chosen. Community on the web and the PC is three parts (`CMV`, `cl-*` in index.html, the "clean data" design): Summary
  (your numbers, your leaderboards with the record of each and how your best came down over your last sessions:
  `rec` and `trend` on /profile?me=1; the latest records; you in the community), Leaderboards (the table with the
  sectors and the track map coloured by sector against your lap, or the record when you have none: the shape and
  where each sector ends from a lap of the board with its telemetry, `commMapGeo`) and Recent records.
  A Le Mans Ultimate leaderboard has "This car / Whole class" (`CMF.whole`, `COMM_CLS` in index.html; the phones the
  same): every LMU class mixes many car models, so the class view is each driver's best lap of any car of that class on
  the track, one per driver, with their car (`community_laps.cls`, migration 0071, `cloud/src/lmuclass.js`: GET
  `/laps?cls=` for game lmu, indexed by game, track, class and time; the PC sends the game's CarClassShortName as `cls`
  for its own laps and its rivals', `lapClass`; a lap without it, and the laps of before, take it from the car's name).
  The per-car boards stay, and the coach and the reference laps are per car, never a class. iRacing has no class view.
  A leaderboard, record or track page row whose lap was driven in the rain or on a wet or damp track says so beside the
  time (`wetTag`; "Rain"/"Lluvia"/"Chuva", "Wet"/"Mojada"/"Molhada", "Damp"/"Húmeda"/"Úmida"; Rain goes with Wet or
  Damp), in every game: the trace's flags "rain" (Precipitation over 0 or WeatherDeclaredWet at any point), "wet"
  (TrackWetness 4 or more at any point) and "damp" (its highest 2 or 3, never 4), own laps in cloud.go and rivals in
  field.go (LMU makes them from its rain and path wetness), become `community_laps.wet` (bits: 2 wet, 4 damp, 1 rain)
  on POST /laps. "damp" and "rain" are notes only: they never keep a lap from the model nor from the coach's default
  lap A (only "wet" does).
  Community's "Recent records" (PC, web, Pitlane HQ Desktop, phones; `/community/records`): the fastest lap of every
  car and track, the newest first, with the lap it beat ("beat Juan by 0.312 s", or "the first lap here"), filtered
  by the discipline chosen; a record opens as lap B (Compare), its leaderboard (`commGoBoard`) or its track page. Every
  record, track page row, profile lap and admin record says its game (`gameChip`, `game` on each record; the admin's
  newest records are every game's, `/records?game=all`), and a lap, board, record or session of a game opens in that
  game (`toGame`: Analysis looks for your sessions of that game on that track).
  The track page (`/community/track`, `openTrackPage` on the web, `TrackPageScreen`/`TrackPageView` on the phones):
  the map with the official turns and the direction arrow, how many drivers and laps the track has and the record of
  every car on it. It opens from the leaderboard's "Track page" chip and from every record; on Pitlane HQ Desktop
  it is the "Track page" button beside the car (`TrackPage.cs`), a row opening that car's leaderboard.
- Analysis (lap analyzer and coach): "Choose a session" is a window (discipline, kind of session, car
  and track, a day you drove on the calendar, then the session) that opens by itself when you enter
  Analysis from another tab; the bars only show what is chosen; the car and the track are two
  filters. The phone apps filter their session list the same way. Laps A and B are one choice for the
  lap analyzer and the coach (`ANASEL`, a lap known by itself, not by its place in a list), with the same
  default and the model's references as B in both, each once ("▲ Next level", "★ Record"); with
  "+ Session" lap B is only the laps of the other session (and the references). A community lap is compared only with
  your own laps of the same track: Compare in Community needs a session of yours there with a valid lap (else it says
  you have none, `sesOnTrack`/`uiNotice`) and opens the comparator filtered to that track on your newest session there;
  a community reference of another track never shows as lap B (`refFits`). The window's title
  and its × stay at the top while it scrolls. "MY BEST" goes after the time.
- Track notes (`notes.json` in the account, `/api/notes`, `NOTES`/`saveNotes` in index.html): your own notes on a track,
  a general note and notes per corner (`n`, `dist`, `name`, `note`). The track page shows them and writes the general
  note (`trackNotesBox` on the web and the PC; `TrackNotesPanel` on the phones, which write the account's bundle like
  driver notes), and the phones list them all in Account → Track notes.
- Driver notes (like RaceLab's): your own marks on other drivers, one tag (dangerous, careful, clean, friend, our own
  icons: a red triangle, an amber circle, a green tick, a blue star) and a note only you see (`drivers.json` in the
  account, `drivers.go`, `/api/drivers`). A driver is known by the community's opaque key (`driverKey`, the races keep
  it as `k`; never their iRacing id) or by name for older races. The icon shows before the name in the relative and the
  standings (native overlays, the app, Pitlane HQ Desktop) and in the race summary, where you mark them (✎; the phone
  apps tap the driver and write the account's bundle); Analysis → My races lists them.
- Race rivals (the other real drivers of your races, whose best laps your PC shares, in iRacing and in Le Mans Ultimate (LMU gives no driver id: `lmuDriverID`, a stable hash of the name the game shows, far above iRacing's ids, is the driver's `UserID` in the synthesized YAML); AI drivers and the pace car never,
  `CarIsAI`/`CarIsPaceCar`, `ai` in journal.go) show on the leaderboards with their
  whole name as the game shows it (`driverName` on the server; rivals named "Juan M." before take it from the PC's race
  history, `rivalnames.v2`), with no "rival" tag beside them, on the public pages too. When a driver's own signed-in PC sees them at the wheel
  in iRacing or Le Mans Ultimate, what was shared of them as a rival in that game goes to their account, and so does what
  comes later (`/link-driver` with the game, `driver_links` per game, migration 0067: one driver of each game per account
  and one account per driver of each game; `linkOwnDriver`/`ownLinkKey`: iRacing by the driver's own id, LMU by
  `lmuDriverID` of the player's own name, never a profile's default name such as "Player" nor one of a letter or two),
  so a driver with an account shows once on the LMU boards; admins undo one game's link (`unlink-driver` with the game,
  `driverGames` in the accounts list: "Unlink its iRacing driver", "Unlink its Le Mans Ultimate driver" on the web, the
  PC and the phones). An LMU name is one anyone can type, so in every game but iRacing (`cloud/src/driverlinks.js`,
  `linkDriver`/`unlinkDriver`) the link waits until the account's own PC saw that name at the wheel on three different
  days (`driver_link_seen`, `LINK_DAYS`; the PC asks again some hours later, `linkAgain`), keeps what it moved
  (`driver_link_moves`: the laps taken and dropped, the rival, the model's memory), and the admin's undo gives all of it
  back to the rival (a lap the account improved since stays the account's) and is never linked again by itself
  ("undone"). An iRacing undo leaves the laps where they are, as before.
- Driver profiles show the nickname only (never the iRacing name); anonymous laps open no profile and
  never show on one (admins see them). The supporter badge comes by itself to Patreon patrons with
  the same email (`/patreon/webhook`, secret PATREON_WEBHOOK_SECRET) or by hand from the admin
  profile (a manual one stays); a supporter can hide their own. Badges show wherever your name does.
  A main tab always opens on its first sub-tab. The main menu: Home, Analysis, Telemetry (was Live; the
  same name in the phone apps), Overlays (its own tab, only on the PC), Community (just before Account) and Account. No text calls the section
  "Live" any more ("Telemetry → …"). Telemetry → Phone & sharing on the PC: your phone or tablet (pitlanehq.app or
  the app, same account, Telemetry → Connect, accept on the PC; a QR to the web app and the Android download) and
  sharing with a code; no Wi-Fi addresses, PIN or local links (`renderPhoneHow`).
- Telemetry has three modes (`LIVE_MODE`, `liveModeBar`): Basic (the essentials below), Full (every basic widget, the
  experimental ones too (not on a PC without Pro), and the lap's traces of speed, throttle/brake, delta and gear, `drawLiveTraces`)
  and Compare laps, live (`renderLiveCmp`/`tickLiveCmp`: the lap now against B, "My best" in purple, the last lap, other
  laps, and "▲ Next level" / "★ Record" only when the model has a full-telemetry lap of someone else, corner by corner by
  the official turns). Standings: gap to the leader or interval, the class filter only when several classes race, your
  position lap by lap (`renderStandings`, `drawPosHistory`); Tyres show their wear. The rev beep page is a list of cars
  and the chosen car's mode as three cards (iRacing lights, My laps, My RPM with one number or one per gear) and its
  sound (early, pitch, volume, test). Overlays is one list (`renderOverlaysTab`, `.ov-row`): every overlay always (no switch for the
  experimental ones, which keep their "Experimental" pill and ask for Pro on a PC without it), each with its games and its
  "when I get in the car" switch for each game, Open/Closed and Configure, the presets and the buttons on top, "Place on the screen" shows
  the screen editor. The PC app never zooms (Ctrl+wheel and Ctrl +/− blocked, `IsZoomControlEnabled` off).
- In Basic, the Telemetry screen shows only the essentials (`LIVE_ESSENTIAL`: flags, the top card with position, delta, last
  lap and fuel beside the cars ahead and behind, incidents and what is left, the delta bar, the map, the relative,
  fuel and incidents); every other widget is one click away in Layout ("Essentials" puts them back). The live map is
  the coach maps' road with depth, its start/finish line, the direction arrow and the official turns; it has no
  "ideal" line.
- Live in the web and phone apps: Connect/Disconnect for your own PC (presence only until Connect),
  and watching someone else with a share code made on the PC (Settings → Phone) or from the phone.
  The room is one hash of the code and the key a PBKDF2 of it, so the server never reads the
  telemetry; code viewers only watch (no DRINKS, no race summaries). Connect asks the PC first: a
  window there accepts or declines the device (by its name) and nothing is sent to it before you
  accept; an accepted device is remembered while Pitlane HQ runs. A declined device is not asked again by its automatic
  retries for two minutes, but pressing Connect again always asks the PC again (`again` in the hello). No Wi-Fi pairing panel and no
  encryption wording on the Live card. The Live page is: your PC, watch another driver (the code gets
  its dashes as you type), then the download, with the same gap between the boxes.
- What is encrypted how (for us, never said in the apps): the account (settings, race summaries, notes, ratings) is
  end-to-end encrypted with the password's key, except that the server keeps a copy of the data key (and the account's
  email) sealed with its own secret (DATA_KEY, `escrow` on the account, migration 0064, `cloud/src/escrow.js`) so Steam and
  Discord sign in without the password (the owner's choice). Every device (web, PC agent,
  phones) uploads it once after a sync that opened the account (POST /account/escrow, `cpEscrow`, `plEscrowUp`,
  `escrowUp`) while the server says it has none (`escrow` on the sign-in and /account/me); a Steam or Discord sign-in (and
  its 2FA step) answers `dataKey` and `email`, and only without a copy (`needKey`), or when the copy does not open the
  account, the password is asked once as before and that key goes up instead. A password reset with a new key clears the
  copy, a password change keeps it, deleting the account deletes it; the laps' telemetry is stored sealed on the
  server (DATA_KEY), which opens it to teach the model and share the fastest laps; live telemetry with a code is
  end-to-end. The analysis of your laps runs on your device.
- No text that explains what something is (the owner's choice): no subtitle under a title, no line saying what a chart
  or a list shows; the title and the data say it. The one exception is the admin page, which the owner asked to have
  explained: every section and every part has one short line saying what it is for and what its buttons do. Only the notes the driver needs to act. A text never joins two
  phrases with a colon ("No records yet: the first lap…"); it is one sentence, or two.
- No text anywhere (PC, web, Pitlane HQ Desktop, phones, the server's pages, the landing) about encryption, how the data
  is protected, where the password goes or what the server can see: no "How your data is protected" list, no privacy
  panel, no password note. Only the notes the driver needs to act ("your data does not need to be uploaded again",
  what deleting the account removes, the PC uploading again after a new password).
- Emails go through Resend only (domain pitlanehq.app, its records on `send.` and `resend._domainkey`, secret
  RESEND_API_KEY; no SMTP or Proton any more). What people write to support@ (the Reply-To of every email) arrives by
  Cloudflare Email Routing (its MX). Admin → Server shows the last emails (Resend's delivery state) and checks the
  domain's Resend DKIM, send. records, SPF (one, no Proton), the Email Routing MX, DMARC and BIMI
  (`web/dist/bimi.svg`, the logo in SVG Tiny PS, needs DMARC at quarantine).
- The logo is the rev gauge with a kerb in the rev limit (`assets/logo.svg`, the master; `web/dist/logo.svg`).
  Its PNGs and ICOs (web/dist icons, assets/pitlanehq.ico and -1024.png, the phone apps' launcher icons)
  are rendered from it; the phone icons are the full square (no transparent corners).
- Emails look like the app (`mailHTML` in email.js: the logo from pitlanehq.app/icon-192.png, the dark
  card, the amber button), tables and inline styles only.
- SEO: index.html has the title, a short plain description (both naming iRacing and Le Mans Ultimate), Open Graph/Twitter
  cards (`og.png`, and `og-es.png`/`og-pt.png` for the Spanish and Portuguese public pages) and JSON-LD (SoftwareApplication,
  WebSite and Organization, never a rating); robots.txt is in web/dist (it lets robots read `/community/leagues/found`,
  which the landing shows). Descriptions are short and plain, never hype. The public pages (`cloud/src/seo.js`, plain HTML,
  English, Spanish and Portuguese, each naming the other two with hreflang (`pt-BR`) and x-default): for iRacing
  /iracing-telemetry, /es/telemetria-iracing and /pt/telemetria-iracing and the overlays (/iracing-overlays,
  /es/overlays-iracing, /pt/overlays-iracing); for Le Mans Ultimate (beta) /le-mans-ultimate-telemetry,
  /es/telemetria-le-mans-ultimate, /pt/telemetria-le-mans-ultimate and /le-mans-ultimate-overlays,
  /es/overlays-le-mans-ultimate, /pt/overlays-le-mans-ultimate (short addresses such as /lmu, /lmu-telemetry,
  /lmu-overlays, /lmu-coach go there with 301); the guides (`seo-topics.js`, one page per thing people search for, each in
  the three languages, linked at the foot of every public page and in the app's <noscript>: the coach, comparing laps,
  braking points, the racing line, the iRating, the shift beep, telemetry on the phone, free telemetry, and the Le Mans
  Ultimate coach /le-mans-ultimate-coach; the iRacing guides that work in Le Mans Ultimate say so and link its page, the
  iRating one stays iRacing only); /records, /es/records and /pt/records, one page per car and track (BreadcrumbList; the
  records index an ItemList and a FAQPage; the landings WebSite, Organization, SoftwareApplication and FAQPage; every
  guide and overlays page a SoftwareApplication with its screenshots); Le Mans Ultimate's records
  (/le-mans-ultimate-records, /es/records-le-mans-ultimate, /pt/recordes-le-mans-ultimate, its cars and tracks under
  /records/lmu/<track>-<car>/<slug>, never mixed with iRacing's ids) and leagues (/le-mans-ultimate-leagues,
  /es/ligas-le-mans-ultimate, /pt/ligas-le-mans-ultimate) exist only while there is something to show: else a real 404,
  no link to them and nothing in the sitemap. A league discipline page with fewer than 3 leagues (`LG_MIN`) is shown but
  noindex and left out of the sitemap; league pages carry no ItemList (their leagues are not pages of the site) and the
  app's links from them are nofollow. The pages show the app's screenshots (`landing/<lang>/`, with width and height,
  lazy), keep their whole style inline, load the fonts without blocking (`media="print"` swapped on load), and are
  kept at the edge (Cache API) for their max-age with an ETag (304); the landing's pictures and the og images are cached
  a day. No text on them joins two phrases with a colon, and titles stay near 60 characters, each its own (a record
  page names the game in full, then as "LMU", then not at all while its car and track do not fit, `recTitle`; one
  driver's record says it is the only lap). A Le Mans Ultimate page promises only what the game gives (no pit lane
  limit, the rivals' positions about five times a second), the Le Mans Ultimate pages name the shared guides without
  "iRacing" (`LMU_TOO_H`), the league pages say their leagues are found on Reddit, and the 404 page has no canonical.
  `cloud/test/seo.test.mjs` draws every page in the three languages and checks the titles, descriptions, canonical,
  hreflang, JSON-LD, links, sitemap and index.html's head and <noscript>. The sitemap carries every language
  (xhtml:link) and a lastmod everywhere (`SEO_DATE` for the pages without data); IndexNow sends every page again when
  SEO_VER changes; the app's "/" has its doctype, no hreflang of its own (it is the brand's page; the landings carry the
  language set) and a <noscript> with crawlable links after an explicit `</head><body>` (never before the head's tags, never
  inside the head, where a browser reads it as text) (one canonical address, 301 for any other such as /index.html, a real
  404 page for any address that does not exist, never the app or the lap viewer with 200; the viewer is noindex), the
  sitemap made by the server, IndexNow once a day. www.pitlanehq.app is a custom domain of the Worker
  (made by the deploy) that answers 301 to pitlanehq.app.
  Titles, descriptions and texts name the brand as people search it (Pitlane HQ, PitlaneHQ; `alternateName` in the
  JSON-LD) and what it is (iRacing and Le Mans Ultimate telemetry, sim racing telemetry, lap analysis, overlays), plainly,
  never stuffed, never claiming an iPhone app before it is on the App Store; competitors' names only in a question, never a
  claim about them.
  They show the accounts' nicknames (never their iRacing names), race rivals by their whole name as the game shows it,
  or Anonymous.
- The Discord bot (`cloud/src/discord.js`, commands in `discord-commands.js`, registered by the deploy with
  `discord-register.mjs`, migrations 0040 to 0042): slash commands (their names in English only, one per command; the
  descriptions in each language) answered by the Worker at `/discord/interactions`
  (Ed25519, DISCORD_PUBLIC_KEY), lap alerts posted with DISCORD_BOT_TOKEN. In English, Spanish and Portuguese: the
  language each user chose with /language (`discord_users`), else their Discord app's; the alerts in the language
  chosen in /alerts or /setup, else the server's. /setup (the server's managers) is a panel of Discord's own pickers: the
  channels the bot answers in (`cmd_channels`: the public commands only there, private answers anywhere), the channel
  of new best laps, the channel of new records (else the best laps' one) and the alerts' language. Account → Discord
  (PC, web, Pitlane HQ Desktop, phones; `/account/discord`, actions `discord*` in /api/sync) links the Discord account
  with Discord's sign-in (`/discord/oauth`, DISCORD_APP_ID + DISCORD_CLIENT_SECRET, only "identify") and shows it on the
  public profile only when the driver says (`shown`, off by default), so other drivers can find them there (the
  profile's "Discord: @handle", /driver too). Free: /record, /driver, /link, /unlink, /download, /help, /language, /setup; Pro (`discordPro` in license_plans.json, open to
  everyone while `enforce` is false): /coach, /compare, /board (the server's ranking), /alerts (a channel for the
  server's new best laps and records, `discordLapAlert` from autoShare, `/laps` and `reshareSession`). /link gives a
  one-use button to pitlanehq.app (`?discord=`) where the signed-in web app confirms (`discordLinkAsk`). It shows
  what the public pages show: nicknames, race rivals by their whole name, anonymous laps and accounts as
  "Anonymous"; an anonymous account's answers only to itself; the Windows app is "Pitlane HQ for Windows", as on the downloads page.
- Signing in with an email that has no account says so and offers to create it (`no_account`).
- The welcome window of a new account (the downloads) stays until the driver closes it (`uiPanel` sticky).
- Leagues are a hub of posts (Community → Leagues on the web, the PC and the phones; `LEAG`/`leagCard`/`leagOpen` in
  index.html, `LeagueHub` on the phones, `/community/leagues` in community.js, migration 0033): a league post has the
  days it races (`days`, 0 Monday … 6 Sunday), the usual start (`time`) in its own time zone (`tz`, the browser's or
  phone's when posted), one or several disciplines (`cats`; several = "Mixed"), an optional Discord invite and website
  (one of the two at least), the cars, the language, "looking for drivers" (`open`) and what the creator writes.
  Every card shows a week strip, the start in the league's zone and in the viewer's, the next race (`leagNext`,
  `leagueNext`: the first of its days at its time, a race under way counts) and sorts by it; filters by discipline,
  day, open and search. A post opened counts a view and its Discord or website a click, once per viewer and day
  (`league_hits`, the account or a hash of network and browser), never the creator's own; only the creator (and the
  admins) see the counts and the last 14 days (`league_days`). A post has a link (pitlanehq.app/app?league=id,
  opened on arrival) and, on the web, an .ics of its weekly race. The hub is released, never labelled "in development". The hub's "Most active leagues" (`cloud/src/leaguescan.js`, migration 0047, `/community/leagues/found`,
  `drawLeagFound`): every six hours the server reads the public feeds of r/iRacing and r/iRacingLeagues (two requests,
  Reddit's application-only OAuth when REDDIT_CLIENT_ID/SECRET are set), keeps the posts of leagues with a Discord
  invite and asks Discord's public invite counts how many members each has and how many are online; the most active
  show (online now, then members, at least 5 online, a post in the last 60 days) with the post's link and when it was
  last read; admins hide one, edit its name, text and disciplines (`editFound`, `edit` on the row, migration 0050: the six-hourly read never undoes it, "Put back" returns to the post's), read now or add a league by its Discord invite (`addFound`, sub "manual": never
  expires, shows whoever is online; FSRS by migration 0048). The hub is open to everyone (`LEAGUES_OPEN = "1"` in wrangler.toml) and the most active leagues are public (GET
  `/community/leagues/found` needs no account): Home's "Private leagues for you" (`homeLeagHTML`, three of the discipline you
  race most), the landing's "Find your league" (six cards, "See every league", "Post your league for free" and a line
  under the hero buttons, which lead to creating the account and then the hub's form) and the public pages
  /iracing-leagues, /es/ligas-iracing and /pt/ligas-iracing (`leaguesPage` in seo.js: the leagues posted in the hub with
  their days and start, then the most active ones; one page per discipline, /iracing-leagues/oval, /es/ligas-iracing/ovalo…,
  only for a discipline with leagues; in the sitemap, the footers, the landings' guides and the app's <noscript>).
  Never iRacing's members site (its terms forbid scraping) nor another
  directory's data without its permission. Up to 3 leagues per driver, 10 for a supporter (Patreon or by hand; `LEAGUES_FREE`/`LEAGUES_SUPPORTER`,
  `limit` in the list): under "Post the league" the form says how many you have posted and, to the rest, that supporters
  post up to 10, with a small "♥ Support on Patreon" link.
- Admins: the admin page (on the PC, the web and the phones; `admSecs`/`admParts`/`wireAdminProfile` in index.html) is
  sections as tabs, each with its line of explanation: Summary (the key numbers, then the analytics), Users (every
  account with what it uses in the last 30 days, its devices and when it was seen, a name opening its detail,
  `admUserDetail`; member since set by hand, the supporter badge, its profile, delete; per account: confirm its email,
  turn off its two-step sign-in, sign it out everywhere, rename it, join a DRINKS driver to it or undo it, unlink its
  game drivers; `/admin/guests` lists every DRINKS driver on the platform for the chooser; and Online now), Feedback
  (every answer of "Share your feedback", the newest first), Content (the shared items, the leagues and the newest
  records, a record's lap deleted by hand), Sessions (the latest sessions of any driver, a private one too: an admin
  opens every account's profile from the leaderboards, and the profile lists its sessions for admins; "See the laps"
  opens its laps one by one with their top speed and sectors, and an admin marks a lap not valid or valid again:
  `admSessionLaps`, `/api/laps/:id/valid`; the session's best, the driver's share and the model follow), Coach (the
  coach's buckets) and Server (the server's emails and the domain's records, the tools: rebuild the coach models, the
  blocked sign-ins one by one, by email or all, the .ibt import, demo data, admin mode; and Pro). Networks are only ever a
  hash of their address.
- What the drivers use (`cloud/src/usage.js`, the pure part in `usagelib.js`, migration 0070 `usage_days`): every app
  counts the views it opens (`view:<name>`), its notable actions (`act:<name>`: race summary opened, plan to the coach
  overlay, track page, leaderboard, overlay opened, profile, coach report, feedback sent…) and the game it drives
  (`game:iracing`, `game:lmu`, once when the car goes on track in a new session; the game read, `STATUS.source`, never the
  Settings choice "auto", and the server keeps only real games, `USAGE_GAMES`, and leaves the old `game:auto` rows out of
  the analytics) and sends them as POST `/community/usage`
  {device: web|pc|android|ios, v, counts, ms} every 5 minutes and when the page goes to the background (fetch with
  keepalive; `USAGE`/`usageCount`/`usageFlush` in index.html, through the agent's `/api/sync/get` on the PC); never in
  demo data, never for a visitor (dropped unsent), never from an overlay window, never while an admin has admin mode on.
  The server keeps keys matching `^(view|act|game):[a-z0-9_.-]{1,40}$` only, 100 a batch, 1000 per key, added into one row
  per day, account, device and key (rows over 400 days go, hourly). `ms` (how long the page was on the screen, 10 minutes
  a batch at most) adds to the account's use for the feedback window. GET `/community/admin/analytics?days=N` (admins, 1 to
  90 days) answers {days, active [{day, users}], byDevice [{device, users, n}], top [{key, n, users}], games [{game, users,
  n}], versions [{device, v, devices}] from presence, users [{id, nick, lastSeen, devices, n, top [{key, n}]}]} from two
  grouped reads of usage_days and one of presence, never a query per account; the Summary draws it (active drivers per
  day, devices, games, screens and actions with how many drivers, versions) and Users merges it into every account.
- "Share your feedback" (the window that asks by itself, PC app and web only): a window with a text box, 1 to 5 optional stars, Send and Not now
  (`feedbackAsk` in index.html). The server says when (GET `/community/feedback/ask` → {ask}: six hours of use, the
  usage batches' ms, or two race sessions uploaded since it was last shown; `feedback_ask` per account, so the devices
  never ask twice, its clock starting the first time the account asks). The page asks 3 minutes after it opens and every 10
  minutes, never in the car (the PC while the car is on track), in demo data, from an overlay window, over another window
  or to an admin in admin mode; shown, it is marked at once (POST `/community/feedback/seen`), so Not now waits six more
  hours of use or two races. "Send feedback" is always in Settings → About and the inbox, and a round floating
  button with a square speech bubble sits at the bottom right of every screen (its menu: "Send feedback", the stars and the text as often as they like, or "Chat with support", `fbMenu`; an admin in admin mode goes straight to the support inbox) ("Support", `fbFab` in index.html, counted
  `act:feedback_button`; PC app, web and phones): signed in only, never for a visitor, in an overlay window or in demo
  data, hidden while the car is on the track and under any open window, a toast or the voice call's bar, above the
  phone-width tab bar. It opens the support chat (`supportOpen`/`SUP` in index.html, `cloud/src/support.js`, the routes
  and statements in `supportlib.js`, migration 0075 `support_msgs` and `support_threads`, which brought in every answer
  of before): one conversation per account, the window "Support" (filling a phone's screen), the driver's messages on the
  right, Support's on the left as "Pitlane HQ Support" (never an admin's name), the newest at the bottom, Enter sends and
  Shift+Enter is a new line, "Write to us. We answer here." while empty. What the feedback and overlay windows send is a
  message of the chat too (POST `/community/feedback` adds it). GET `/community/support` {msgs [{id, me, text, created,
  kind, rating?}], unread} marks Support's replies read; POST `/community/support` {text, device, v, view, lang} (20 a
  day) emails support@ ("Support chat · nick", Reply-To the driver's email from the escrow); GET
  `/community/support/unread` {n, last?, at?} is one row by key, polled every 2 minutes while the page is on the screen
  (and the phones the same). The button carries the count of Support's replies not read ("1"… "9+", amber like the
  inbox's), and a reply not read is an inbox notice "Support replied" with its first line, both cleared when the chat
  opens. For an admin with admin mode on the button opens the support inbox and counts the conversations with messages
  not read (GET `/community/admin/support` {items [{accountId, nick, last, lastAt, lastSupport, unread}], unread}, GET
  `/community/admin/support/unread` {n}): a conversation (GET `/community/admin/support/:id` {accountId, nick, gone,
  msgs [{id, support, text, created, read, rating, device, v, view, kind, style}]}, marking the driver's read) with the
  driver's profile and the reply box (POST `/community/admin/support/:id` {text} → {ok, mailed, msg}: a reply as
  Support, emailed to the driver in the language they last wrote in, "Pitlane HQ Support replied" with "Open Pitlane HQ"
  to pitlanehq.app/app?support=1, which opens the chat on arrival; ?support=<account> opens that conversation for an
  admin, the link of support@'s email). The admin page's Feedback tab has "Open the support chat" on every answer.
  Counted `act:support_open`, `act:support_sent`, `act:support_reply`; deleting an account deletes its conversation. POST `/community/feedback`
  {text 1–4000, rating 1–5 or none, device, v, view} keeps it (`feedback`, 20 a day per account) and emails it through
  Resend to support@pitlanehq.app (`sendFeedback` in email.js: the nickname, account id, device, version, stars, where it
  was asked and the text; Reply-To the driver's email when the server keeps one in the escrow, else support@). The
  overlay window (the PC only, "How are the overlays?", the stars, the text box and the overlay design used, "Design ·
  Classic"): a race of iRacing or Le Mans Ultimate (vs AI too, never in demo data) that ends or is left with an overlay
  open goes to the server once (the agent's `reportOvRace` in ovfeedback.go, POST `/community/feedback/ovrace` {style,
  ovs, game, sid}, the same session counted once; `style` is `ui.ovstyle`, else the default design, a free name matching
  `^[a-z0-9_-]{1,20}$` so new designs come beside the old one), and the page checks a moment later once the car is off
  the track (the "ovrace" notice, `fbOvSoon`). The ask answers `ov` after the first such race and, once answered, every
  six (`ov_races`, `ov_answered`, `ov_last_style` on `feedback_ask`, migration 0073); shown, it is marked at once (POST
  `/community/feedback/seen` {kind: "overlays"}). The same blocking rules as the general window, and when both are due
  only the overlay one shows. Its answers are `kind` "overlays" with their `style` (`feedback`, the general ones
  "general") and their email says so. GET `/community/admin/feedback` (admins) lists them, the newest first, with the
  count and the average stars; the Feedback tab tags the overlay answers ("Overlays · Classic") and filters All, General
  and Overlays. Deleting an
  account deletes its usage and its feedback.
- The coach and the lap analyzer stay short: the coach is the gap, what to work on first, the plan,
  the map, the sectors and the corners that cost the most; the analyzer is the gap with its three
  key facts (plus the corners against the straights), every corner as a small bar you can press to pin the charts
  and the map at it (`la-corners`; `CornerStrip` on the phones, where a corner is "T3" too), the charts with the reference's corners as bands labelled by the official turns
  (`cmpCornerBands`), the "Line" chart (how far A was to one side of B, + left, `LAPCH.line`), the map, the sectors,
  the lap list and the braking points. The lap list has a column per sector (S1, S2, S3…: the game's official sectors that add
  up to the lap's time, `lapSecCols`; a session without them has no sector columns, on the phones neither), purple the
  session's best of each among the valid laps, green a valid lap's one better than your best lap's. The braking points are a table of lap A against lap B per corner of
  `coachCompare` in pitwall-analysis.js (`renderBrakeTable`): the turn ("T7"), where A and B brake, Δ m (+ A later; red when A brakes 3 m or more
  before B, muted otherwise), the speed at each apex, the gear at the apex ("3 / 4" when they differ), the time lost and what
  to do (the tip of the phase that loses the most in a few words, without the line tip added after it, `tipMain`/`tipShort` in pitwall-analysis.js, `todo` on the corners the phones get;
  a line tip that replaced a generic one stays); a row pins the charts and the map like the corner bars. The phones' lap
  list and lap analysis show the same. "Take the plan to the coach overlay" takes the turns of the plan's first four steps
  (`turns` on each step of `coachPlan`, `planTurns`), on the phones too when they run the module.
  The corner tips (`coachCompare` in pitwall-analysis.js wherever the app or the phones analyse a lap, `compareLaps` in
  ovnative4.go for the coach overlay; the phones' `corners` in LapMath/Models only as the fallback):
  the phase that loses the most says the tip, and every tip follows the measured facts, never against them: braking
  later than the reference and arriving slower at the apex is one mistake whatever phase pays for it ("brake a little
  earlier and carry the speed"); with the same braking point the tip is about the brake (harder at first, trail, or
  "brake hard at once, then release progressively"), never "brake later"; an apex reached as fast as the reference's
  says the time goes before it (entry) or in a longer slow part (apex); a throttle picked up earlier than the
  reference's but a slower apex says to carry the speed, never "full throttle sooner". A generic tip gives way to
  what the data shows plainly, in this order: the line (inside/outside), the gear at the apex against the reference's,
  throttle lifts after the apex (exit), steering corrections in the corner (wherever both laps carry steering, the phones
  too since they run the same module; never against a model reference, whose points have none). The plan's habit advice (`coachPlan`) takes its direction from the averages over the corners: where
  you brake against the reference, how fast you reach the apex and when you pick up the throttle. The PC's coach overlay
  measures the last lap against the model's next level when it is faster than the session's best, else the best.
- The lap analysis and the coach are one file, `web/dist/pitwall-analysis.js` (`PW_ANALYSIS`, pure JavaScript: no page, no
  storage, no network), run by the web and the PC app (index.html loads it with a relative script tag before its own script
  and calls it through thin wrappers, `anaCtx` hands it the language, units, official turns, `COACH_W`/`COACH_ME` and the
  model's corner cards) and by the phones (Android's JavaScriptSandbox, iOS's JavaScriptCore; they download
  pitlanehq.app/pitwall-analysis.js, served with `no-cache` and its ETag like every app file, keep it on disk and carry a
  copy in the app used until a download succeeds; the mobile repository's `tools/sync-analysis.sh` refreshes that copy). It has the corners and their tips, the plan, the sectors, the line, how
  the lap is driven, the analyzer's key facts and the next level's step (`stepText`), and what the coach learnt
  (`coachOf`: the plan's weights, the metres a braking tip asks for, the kinds turned off); `analyse(A, B, ctx)` gives all
  of it as plain JSON (`v`, the shape's version, 1: the phones run only the version they were built for, and a newer
  shape raises it) with the session's laps in `ctx.laps` for how steady each corner is, so the phones' plan is the PC's. Its
  texts are in English, Spanish and Portuguese (a corner's `tip` is [en, es, pt], `tipTx` on the web). A change there is
  a change on every device at once: `cloud/test/analysis.test.mjs` runs index.html's own functions and the module over
  realistic laps and keeps every answer as it was (`analysis.fixture.json`; a change meant to change them writes it again
  with `--capture web/dist/index.html` and says why in the commit). The Go copies (`compareLaps`, `cornerZones` in
  ovnative4.go, racingline.go) still serve the overlays.
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
- The coach learns from what happens after its tips (`cloud/src/coachtips.js`, migration 0051 `coach_tips`; never an LLM
  and never an outside API). Every tip has a kind (`kind` in `coachCompare`, the same names as the phones' `tip_*` keys:
  brake_later, trail, coast, apex_speed, line_apex…) and every corner a speed class (`cls`: slow, medium, fast at the
  reference's slowest point). When the coach shows a lap (web and PC, `coachReport`), its tips go to the account once per
  lap and reference (POST `/community/coach/tips`) with the time the session's best lap spent in every corner (`tbest`);
  the driver's next session on that car and track answers them (`outcome`, seconds gained in the same corner, matched by
  its slowest point within 60 m). Every tip card has 👍/👎 (web, PC and phones, POST `/community/coach/rate`, `TIPRATE` on
  the web, `tipRatings` on the phones). The drivers see none of the counts. The admin panel's Coach tab shows the buckets
  (kind × speed, cases, how many gained, the thumbs). From 30 answered cases a bucket's share of gains reorders the plan
  (`w` from GET `/community/coach/weights`, `coachOf` in pitwall-analysis.js, 0.7 to 1.3, and 15 % less for a kind the drivers
  mostly thumb down); the tips' texts never change by themselves and no lap is made of this. The corner card
  (`cornerCard` in model.js, `corners` in the model, MODEL_VERSION 8 and up): for every braking zone of the record lap, the range
  of braking points and of speeds at the slowest point among the fastest drivers here (one lap each, the fastest 30 %, 3 to
  12), shown under the tip as one line ("The fast drivers here brake between 312 and 328 m and pass the apex at
  112–118 km/h (6 drivers)", `cornerHint` in pitwall-model.js, `CornerCard` on the phones): a hint, never a reference lap.
  How the coach keeps learning (migration 0053), all of it counts over real laps, never an LLM: the metres a braking tip
  asks for are what the drivers who gained really moved their braking by (`dd`/`ddn` on the tips, `ask` per bucket from 10
  gains, `coachOf` in pitwall-analysis.js, never more than the gap seen); the driver's own memory (`/community/coach/me`: the kinds that
  repeat on 3 or more of their tracks are habits, shown first in the plan and on the phones, and their own buckets weigh
  from 10 cases, `COACH_ME`); the step to the next level (`levelStep` in model.js, `step` on every ladder entry: the
  corners where the laps just slower than that reference lose to it, "the drivers at your pace make the step in T4 and
  T9" under the Next level card); each corner's difficulty (`spread` of the drivers' corner times, weighing the plan with
  `dif`); laps in traffic (a car within a second ahead for a fifth of the lap, `traffic` in `Trace.f`, the agent checks
  twice a second), on cold tyres (the first lap of a run, `cold`) or on a wet track (`wet`, TrackWetness at 4 or more,
  lightly wet on iRacing's scale, at any point of the lap, "wet track" on the web) are tagged on the web (`lapOptText`;
  a damp track, `damp`, says "damp track" and a lap in the rain, `rain`, "rain", and neither is a disturbance),
  never the coach's default lap A (`lapClean`) and, traffic and wet, never the model's (`goodLap`; a cold lap is the
  driver's own); the tyre compound travels as `cmp:<n>` in `Trace.f` when the car has several (PlayerTireCompound over
  0, the value at the lap's end), shown nowhere and no disturbance for the coach's default lap; a corner taken
  differently every lap (its spread over twice its loss) hears
  "the same braking point every lap" first (kind `cons`); the corner card by track temperature band (cold under 25 °C,
  hot over 35, `bands`, `model_laps.temp`) when a band has enough laps, and the fast drivers' line at the apex against
  the record's (`lineRanges`, `line` on the corner, a range never a composite); a tip may say how many drivers it helped
  on corners like it only when the admin turns it on (Coach tab, `coach_confidence`); an admin turns a kind off for
  corners of one speed (`coach_off`, `off` in /coach/weights: web, PC and phones say the phase's plain tip instead).
- The coach overlay is live (`drawCoachOv`, `coachTick` in ovnative4.go, design A): as the car comes to a corner with a
  tip it shows the turn, the metres to the reference's braking point with a bar, the last lap's loss there, the tip and
  the fast drivers' range (the model's corner card, `modelCor`); after the corner, for a few seconds, the verdict (this
  lap against the reference from the braking zone to the exit, `liveDelta`) and the lap's corners as dots (green gained,
  red lost). The tips are computed once per lap (`compareLaps` with every corner, cached by `key`). It is set before the
  session in the overlay's settings on the web (Overlays → Coach → configure, `UI_DEFAULTS.coach`, `CONFIGURABLE.coach`):
  the reference (the next level or your best lap), its style (the card, the column with a bar filling to the braking point,
  the corner drawn with your path, the reference's line and both braking points, big letters for VR with the tip in two
  or three words, `coachCue`; how it names the corner, "Next turn (T7)" by default, "Next turn" or "T7", `turnName`/`coachTurn`; the preview in its settings draws the chosen style, `coachStyleHTML`), which
  corners (the three that cost the most, or the track's turns as chips), the fast drivers' hint, the verdict's seconds and
  from how far it speaks. The settings travel with the account like every overlay's. The coach's plan has "Take the plan
  to the coach overlay" (`planToOverlay`): the plan's corners become the overlay's chosen ones on that track (`turns`, `turnsTrack`; on another
  track the overlay speaks at the three that cost the most, `coachPicked`, and the chips of Overlays → Coach are the
  track's the game is on, `coachTurnsHere`); on the PC it opens
  the coach overlay when it is closed, on the web it writes `ui.coach` into the account's settings.json (`cpSetUI`) and the
  PC takes it at its next sync.
- The model (`cloud/src/model.js`, MODEL_VERSION 11) learns clean traces only (a speed jump over 10 m/s between two
  points is a glitch), never a lap in traffic or on a wet track (`goodLap`: a wet lap teaches braking points of another
  track state) and marks a rival's lap (`field`: pedals and gears estimated from its speed against what that car really does at each speed, full-throttle acceleration, slowing with no pedal and full-brake deceleration learnt from the real laps of the car on any track, `pedals` in the car card, `cloud/src/pedals.js`, partial throttle and brake, never only 0 or 100 %; served that way by the model and `/community/laps/:id`); the next level prefers a
  lap with real pedals, and `idealField` says when the record is a rival's. A rival's lap whose pedals the game itself
  gave (Le Mans Ultimate's telemetry of the other cars, `Trace.src` "real" from field.go, kept as such by POST `/laps`)
  is a real lap: the model and `/community/laps/:id` estimate pedals only over src "field". It is "real" only when its
  pedals move (the throttle to half and the brake to a fifth at least; still or missing pedals are estimated), it keeps
  its src in `model_laps` and it never teaches the car card what the car does at each speed (`rival` in `goodLap`: no
  pedals' envelope, no shift speeds), its speed coming from its position. A rival's lap on a wet track carries `wet` too.
  Tyre compounds are never mixed in a reference: the memory keeps every lap's compound (`model_laps.cmp`, migration
  0066, `lapCompound`: the lap's `cmp:<n>`, 0 for an account's lap without it, -1 for a rival's whose tyres nobody
  knows), and when a car and track have laps on several compounds each one with 5 laps or more from 3 drivers or more
  (`CMP_MIN`, `CMP_DRIVERS`) gets its own record,
  next levels and corner card (`byCmp`, `compoundsOf`, `refsOf`); the model of every lap stays the default. A client
  asks for the compound of its lap A (`cmp` on `/community/model`, `forCompound`; `cmpOf` in pitwall-model.js, the
  phones' `Trace.cmp`, the PC's coach and braking overlays and the app's live compare and Braking markers widget by
  PlayerTireCompound, `liveCmp`, which the laps recorded live keep as `cmp`) and gets that compound's references
  when the model has them, else every lap's; `cmps` lists the compounds it has apart. The pace among the drivers
  (`times`) is every lap's.
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
- In development (shown with "In development", usable only by admins with admin mode on, on every device): the
  Planner (until iRacing switches its data API back on), ACC, Assetto Corsa,
  NASCAR 26, team mode and the Data view. The overlays on top of the game are open to everyone (0.9.0). The
  Full telemetry view is gone everywhere.
  Switched off for now: setups, per-car settings, the Data view and sharing race analyses. Hidden from everyone
  on the PC (admins too) until the owner says otherwise: profiles (no button, no Settings section, the PC keeps its
  one profile), Settings → Connections (`CONN_ON` in index.html) and Full telemetry. Per-car settings never
  apply (`carProfilesOn` in carprofiles.go), and a sync reload never closes or reopens the overlays. An overlay
  window is the widget itself, with Windows 11's rounded corners and a quiet border (`ovwin`, `noWinBorder`); it
  fits its content's height (grows at once, shrinks after a moment). An overlay never leaves the desktop when
  dragged, resized or placed (`keepOnScreen`, `clampMove`). Nor is it made smaller than it can be read: its default width
  (`overlayMinSize`; the map, the radar and the g-force their default height too), when resized, moved or opened, and
  not even while the corner is dragged (`WM_GETMINMAXINFO`, `OV_MINW` in the Overlays screen editor). The
  Overlays cards show no OBS address. An overlay window draws only its own widget; only the
  radar's window hides itself when nobody is near. Every overlay is native UI drawn in Go, never WebView2 (its
  content is always opaque; a test checks every overlay in `overlayOrder`): `ovnative.go` (shapes, the app's own
  fonts embedded from `ovfonts/` (IBM Plex Sans, JetBrains Mono, Barlow Condensed, OFL), its colours, licence badges
  and pills; the live stream; radar, delta bar, relative, standings), `ovnative2.go` (flag, dash, timing, fuel,
  engine, tyres, inputs, DRS & push-to-pass, telemetry, g-force), `ovnative3.go` (stats, pit stop, mini-sectors,
  gaps, incidents), `ovnative4.go` (track map from `/api/map` or the community's layout, live compare, braking
  markers with the model's next level from `/api/community/model`, coach), `ovnative5.go` (weather: the track's and
  the air's temperature, the wind against your car with the game's clock, rain and how wet the track is; the track position
  bar: every car along the lap on one line, class colours, you marked, the two nearest numbers each way; performance:
  frames a second with the last minute, GPU and CPU, the connection's latency and quality) and `ovnative_windows.go` (a
  layered window with alpha per pixel and each overlay's opacity). Only the panel and its content show, the rest is
  see-through, every click goes to the game, and while
  moving the overlays they are dragged and resized from the corner. They scale with the window's width and fit
  their height to what they show (the map and the radar keep the window's). The radar is only your car's outline,
  the cars coming, the red side bar and the nearest distance; it reads and draws every sample the game gives (60 a
  second), each car where its lap distance puts it (an alpha-beta filter predicts every draw and corrects on each new
  sample, plus the sample's age, so it glides at its own closing speed and sits where it is now), a car beside you keeps
  its side (even while the game's flag lags) and slides there smoothly, three wide puts the second car beyond the first,
  a car that stops overlapping eases back into line over the next 7 m, a car closing fast turns red before it is beside
  you and trails a fading line, a car off the track beside you still shows as an outline, a car on the pit road dimmed. The windows that need laps record the ones they see.
  The main window (Pitlane HQ Desktop, `desktop/PitlaneHQ.Desktop`, C#/WPF) is the app itself: `web/dist` served by the
  engine in a WebView2 on every screen, exactly the web (the owner's choice, 0.9.12: the native WPF screens were never
  the same as the web). The window has no title bar of its own: the app's header is the title bar (`ownFrame`:
  `window.pwWin` for drag, minimise, maximise, close and the top edges, `window.pwOpen` for other sites, given to the
  page by the shell before its scripts run, `HostScript`, as the agent's own window did), a 6 px margin leaves the
  resize borders to the window. The native screens (Home, Analysis with `DrawMap`, Telemetry from `/api/desk`,
  Overlays, Community, Account, Settings; `/api/desk/coach`, `/api/trackmap`, `desknow.go`) stay in the code but are
  not shown (`Native` is empty). Builds of other branches only check
  (nothing is published unless it is master). The app tells the PC its language and units (`/api/lang?l=&u=`), and the native overlays get
  both in the stream's config event, so they change at once. The gaps overlay and widget drop a sample a whole lap
  off from both its neighbours (`cleanGaps`: the game counts a car's lap a moment before or after its distance
  wraps), the track bar's car numbers never overlap, and the live compare's "Now" waits for a lap the game times.
  Overlay presets: the four built in and your own (saved in the overlay settings, `CFG.ui.ovpresets`, so they go
  with the account), applied with one click and deleted with their ×; names asked in the app's own dialog.
  Overlay windows use the app's language (`&lang=` from `uiLangChoice`). The Overlays screen editor shows only the
  overlays that are open or Auto, always inside the screen. In a narrow PC window the main tabs show only icons. The delta bar overlay has no title: a rounded track and the delta in a pill in the centre.
  An overlay asks the PC only for the values it shows, 60 times a second, and redraws fast (relative 10/s,
  standings 4/s, radar 30/s). The agent stays light: the stream's frame is written straight from the telemetry buffer
  (`streamFrame`, byte for byte what encoding/json wrote) and an overlay reads it without encoding/json (`ovframe.go`,
  the same values), the session text is read by scanning (`yamlField`/`listItem`, never a regexp compiled per call),
  the LMU frame decodes a car's texts only when they change, the stream's frame and the LMU frame allocate nothing once
  warm, the lap recorder and the field watcher only as their laps grow, and an overlay a few lists of numbers per frame
  (`perf_bench_test.go` measures them, `go test -run '^$' -bench . -benchmem`). An overlay draws and pushes to the screen
  only what changed (`ovpace.go`: a frame with the same values, settings and a still picture is not drawn again, a
  picture the same as the one on the screen is never handed to UpdateLayeredWindow again, off the track or with no game
  four draws a second, at once at its full rate back on the track, a hidden overlay closes its stream), its shapes skip
  the per-pixel distance where the answer is known and the text's glyphs and widths are kept (`textMask`, `ovWidths`),
  the map's still part is drawn once per size and track (`mapLayer`), always the same pixels as before
  (`TestOverlayShapesSameAsBefore`, `TestOverlaysRedrawTheSame`; `ovbench_test.go` measures every overlay's draw), and
  Overlays → More → Frame rate (30 by default, 20, 15 or 10 a second, `ui.ovfps`; the radar twice it) lowers it.
  Every overlay's Configure window has its own Opacity (`ui.<overlay>.alpha`, 60–255, `ovAlpha`/`ovAlphaOf`; unset, the
  old setting for all of them, `CFG.alpha`, else opaque; VR too; the designs' panels are opaque themselves, fillA 1, so at 255 nothing of the game shows through, Frameless aside, `TestOverlayStylesOpaque`) and, for the overlays with a title (`OV_TITLED`),
  "Show the title" (`ui.<overlay>.title`, on by default, `titleOn`/`titleH`: off, the content moves up and the overlay
  is shorter; the engine's and the pit lane's badges keep their row while lit); Overlays → More → Titles shows or
  hides them all at once. Every overlay window's Configure also has its text size (`ui.<overlay>.textScale` 0.85/1/1.2,
  scaling its whole drawing, `textScale`) and "Hide by itself" (`ui.<overlay>.hide`: "car" out of the car, garage or no
  game, "pits" that and on the pit road; nothing on the screen, like the radar with nobody near, never while moving the
  overlays; `autoHidden`, OnPitRoad asked only then; the web widget in an overlay window the same, `ovOwnApply`), and
  each overlay its own content options (`OV_OPTS` in index.html, the native overlays read the same keys, `ovsettings.go`;
  unset, everything draws exactly as before, `TestOverlayOptionDefaults`): relative (`ui.rel`: classHead, a band of the
  classes with their SOF; dimLapped; rowSize s/m/l; notes), standings (`ui.std`: classHead, each class under a header
  with its cars and SOF, the same class bands the Beta designs always draw, made in `tableRows`; irShort "1.8k"; fastMark; pitTag), delta bar (`ui.deltabar`: barOnly, trend), timing
  (`ui.timing`: sectors, lastBest, flash), inputs (`ui.inp.lineW`), radar (`ui.radar`: carSize, trails, dist), coach
  ("text": the tip only, nothing between corners), pit (`ui.pit`: limTol, the margin over the pit limit in m/s, 0.4 by
  default; pitOnly), gaps (`ui.gaps.numbers`), track bar (`ui.trackbar`: lineOnly, height, near, sectors, myClass), dash
  (`ui.dash`: shift, strip, spdUnit), fuel (`ui.fuel`: show, spare laps of margin, unset 0.3 in the verdict and none in
  "to finish without a stop"), tyres (`ui.tyres`: press, wear, avgOnly), weather (`ui.weather`: show, trend; with its
  title hidden the game's clock moves into the content), flags (`ui.flag`: lights, kinds), map (`ui.map`: turns,
  sectors, myClass, width), engine (`ui.engine`: rows, badges), incidents (`ui.incidents.list`), braking markers
  (`ui.brakes`: speeds, fb), mini-sectors (`ui.sectors`: last, legend), stats (`ui.stats`: rows, slipNow), compare
  (`ui.cmp.last`), g-force (`ui.gg`: trail s/m/l, peaks) and performance (`ui.system.show`).
  The relative always has the rows you chose ahead and behind (empty when no car).
  A widget's or overlay's settings open in a floating window you drag by its title (`floatDrawer`), not a side
  panel, with its live preview always in view on the left and the settings on the right (`.cfgsplit`; stacked on a phone). Changing tab closes the side panel and any open window (`closeOpenPanels`), on the PC as on the web.
  Its live preview is the overlay itself; with no real telemetry it runs the demo data's invented race only inside
  the preview, tagged "Sample data" (`previewDemoTick`), and switches to the real data once the game sends it.
  (`wipOk()`/`wipView()` in index.html, `wipAllowed()` in Go).
  What the overlays show beyond the basics (`ovnative6.go` keeps the memory): the flags show the start lights (ready,
  set, go), a green for 4 s only, debris, 10 and 5 to go, one lap to green, disqualified; the delta bar a ▲/▼ for the
  last second's trend; the relative and the standings colour the car number by class when several race and offer a
  "pace" column (their last lap against yours); the dash lights the brake bar with the ABS and carries a strip with
  the lap, the place, the delta and the incidents; the timing times the official sectors (SplitTimeInfo) of the lap,
  purple for the session's best, green when better than your best lap's; the fuel says the last lap's use and what
  you may use per lap to finish without a stop; the engine shows the game's EngineWarnings (rows in red, badges for
  the pit limiter, the rev limiter and a stalled engine); the tyres show the three zones (inside, middle, outside)
  and the pressure; the pit stop overlay turns into the pit lane on the pit road (your speed against
  TrackPitSpeedLimit, red when over, the stop's repairs and fuel); the map numbers the official turns and colours the
  classes; the braking markers and the coach name corners by the official turns (`turnName`). The relative marks
  each gap's trend over ten seconds (`gapTrend`: ▼ green catching the car ahead, ▲ red the car behind catching you);
  the timing flashes the lap just finished for 4 s (purple a best, green better than the one before); the delta bar
  shows the lap this pace gives (best + delta, `predict` in its settings); the weather says where the track's
  temperature goes over ten minutes (`trackTrend`); the map and the track bar mark the sectors.
  The overlays in VR (Settings → VR on the PC and Pitlane HQ Desktop, `CFG.ui.vr`: on, distance, size, height):
  every open overlay window also shows in the headset as a SteamVR overlay (OpenVR 2.5.1, `vr/openvr_api.dll`
  embedded and written to %LOCALAPPDATA%\PitlaneHQ\openvr, `vr_windows.go`) with the same picture it draws on the
  screen, where it sits on the main screen (`vrPlace` in vrmath.go: a flat screen of that width at that distance and
  height, each overlay turned to face you), so moving them in Overlays → Edit positions moves them in VR. It joins
  SteamVR only when it is running (a background app, never starting it), lets go when it quits, and Meta headsets
  work through SteamVR as the OpenXR runtime.
  There is no car controls overlay. The overlays' designs (the owner's choice): Lane is the default (still labelled Beta,
  `ovDefaultStyle` in ovtheme.go, `OV_DEFAULT_STYLE` in index.html: every overlay nobody chose a design for), Classic is
  the native look drawn exactly as before, and beside them the Beta designs Lane, Wall, Board, Frameless and Light (Carril, Muro, Pizarra,
  Sin marco, Claro; Faixa, Muro, Quadro, Sem moldura, Claro), each labelled "Beta" wherever it is offered, never replacing
  Classic. One design for all the overlays (Overlays → Design, `ui.ovstyle`) and one per overlay over it (its Configure
  window's Design, `ui.<overlay>.style`, empty follows the one for all); `ovtheme.go` draws them (an `ovTheme` set per
  frame in `ovDraw`, read by the panel, the title, the labels, the faces, the colours and the relative's and standings'
  rows: Lane's big white names, the class bar in our palette, turquoise, violet and orange, straight and rounded, never
  slanted stripes, the class bands with their cars and SOF, the iRating pill, your row in muted gold, the cars out of the
  race faded), the numbers white and bold in every Beta design, and the app's overlay windows approximate them in CSS
  (`OV_STYLES`, `ovStyleOf`, `data-ovs`). The relative and the standings overlays (only the overlays, the owner's choice: never the
  Telemetry tables, the race summary, the leaderboards or the phones) show the
  driver's country flag before the name where the game gives it (iRacing's FlairName; `flagCode`, the flag-icons set, MIT,
  `web/dist/flags/` made by `tools/flags-sprite.js`; "Country flags" in their overlay settings, `ui.rel.flags`/`ui.std.flags`, off by
  default; the race results keep `cc` and `flair` but show no flag) and a clock after it for a penalty to serve (iRacing's black or furled
  black flag on the car, `CarIdxSessionFlags`, which cannot tell a slowdown from another black flag; Le Mans Ultimate's
  `CarIdxNumPenalties`).
  The basic overlays (`OV_BASIC`): radar, delta bar, relative, standings,
  flags, dash, timing, map, fuel, tyres, inputs, pit, brakes, coach, incidents, engine, weather, track bar.
  Experimental (listed with the rest, an "Experimental" pill): compare, boost, gg, stats, sectors, gaps, telemetry, system.
- Sync is automatic and covers everything in the account: every app reads the account when it starts,
  when it comes back to the screen and every minute (the PC also a few seconds after any change), and
  changes from several devices are merged (`syncmerge.go`), never a "which copy" question. The moment any device
  uploads the account (`/sync` PUT), the server nudges the account's live room (`{ctl:"sync", version}` to the PC
  and the screens in it, `live.js`): the PC syncs at once (`kickSyncFrom`, never for its own upload), the web
  companion reads the account again (`CP.refresh`) and so do the phones, which keep the live room open as presence
  (the `idle` role, nothing sent) on every screen while the app is on the screen (`startPresence`/`syncNudges` on
  Android, `Live.startPresence`/`Account.nudged` on iOS; Telemetry takes the link over while it is on screen), so a
  change on any device is on every other one in seconds. When the server
  answers "signed out" to the PC's token (`plSessionEnded`), the PC signs out by itself keeping the email and
  shows the sign-in screen with a note; a wrong password never signs it out. My account has "Sign out on this
  PC" and says when the PC could not sync; it shows no sync card (no last sync, no version) on any device (the PC's
  "My laps": keep my laps in my account and see them on the web). Nobody syncs by hand: no "Sync now" button and no switch to turn the sync
  off anywhere (PC, web, Pitlane HQ Desktop, phones); the sync is always on while signed in. One
  public name per account: changing it anywhere changes it everywhere, shared laps included.
- Deleting your own account never deletes what the leaderboard shows or what the model learns from:
  those laps stay as an anonymous driver (`deleteAccount` in `cloud/src/accounts.js`); everything
  else of the account goes. Only an admin removing an account (abuse) removes its shares (`purgeAccount`).
- Uninstalling PitlaneHQ.exe removes everything it keeps on the PC (`[UninstallDelete]` in
  installer/PitlaneHQ.iss); nothing on the server is touched (the account, the leaderboards, the model).
- Home, clean data (`homeCleanHTML`, signed in): the greeting and the PC's state, four numbers (the laps and the hours on track
  this month, from the account's sessions, the races this month and the best result), your last race (its place against the
  start, its position lap by lap, the iRating, incidents and best lap; Race summary and Analyse my laps), the recent
  sessions (races and the other sessions together, tagged Race, Qualifying, Practice, Test drive, vs AI and DRINKS), the
  licence summary (each discipline with "iRating" over its numbers; the chosen one draws its iRating over your races)
  and the days you drove. Each block of Home and Community sits on a card (the downloads' surface and border) for depth.
- Analysis's sub-tabs: Laps, Coach, My sessions (`cloudlaps`, every session in the account) and My races (`races`, the
  race summaries with the driver notes); Home's "See all" opens My races. The phone apps have the same four (and
  Telemetry, Standings and Tyres under Telemetry). A finished race shows no notice on the PC
  (it appears in My races); only the phones tell you.
- Pitlane HQ never shows Windows notifications (nothing in the action centre; `notify` only logs, and the PC app
  schedules no browser notifications): what it has to say shows inside the app.
- PitlaneHQ.exe checks for updates every 10 minutes, and at once when the server's answer to its minute sync names a
  newer build (`X-Pitlane-Build`, from version.json; `updateNudge`), notifies once per build and installs by itself
  when no sim is connected (unless switched off in Settings → About). A required update (the PC's version is older
  than version.json's `min`, `appMinVersion`) installs as soon as the car is not on the track, whatever that switch,
  never while driving. The client tag (`clientTag`, `X-Pitlane-Client`) carries the build, shown in Admin → Users → Online now.
- People see the PC program as "Pitlane HQ Agent" (or "the agent"), never "PitlaneHQ.exe" (the file keeps its name):
  on the web, the PC app, Pitlane HQ Desktop, the phones, the downloads page and the changelog. Away from the PC (the web,
  the phones) a text never says "this PC": it is "your PC" (`PC_WORDS`/`devWords` in index.html turn every "this PC",
  "este PC", "diesem PC", "neste PC" into the driver's). The web in a computer's browser, signed in, says when the
  agent is not detected (no presence from your PC on the account) with "Download for Windows" and a ×, closed for that
  tab (`agentBar`); never on the PC app nor the phones.
- This repository is only the PC app (PitlaneHQ.exe, Go) and the web (`cloud/`, Cloudflare).
  The Android and iOS apps live in their own repository. Android and iOS are always the same app: a change asked
  for one of them goes to both.
- One app everywhere: `web/dist` is the PC app and the web app at `/app` (computers and phones).
  Web scripts are loaded with relative paths.
- `master` is the main branch the builds come from (Windows and the server).
- The owner's name never appears in the code, the documents or the tests; the apps never link to
  GitHub: downloads and release notes come from https://pitlanehq.app (R2 bucket, `cloud/src/downloads.js`).
