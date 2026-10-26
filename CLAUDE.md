# Pitlane HQ: rules for working on this project

- Reply to the owner in Spanish.
- The apps' languages are English, Spanish and Portuguese (Brazil) only (`LANGS` in index.html, `uiLang` in Go, `lang` in
  email.js): no German and no bilingual "EN + ES"; a German or bilingual choice from before reads English or Spanish.
- Push only when the owner says so ("súbelo", "sube todo"…). Never create pull requests unless asked.
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
- The admin panel is its own page, only for admins (pitlanehq.app/admin → `/app#admin`, `v-admin`); Account only has
  the button that opens it.
- Real data by default: no demo races, sample drivers or made-up laps on the server. Invented data
  only behind Settings → About → Demo data, which only admins see (web/PC: pitwall-demo.js; phone
  apps: Settings → Admin), never uploaded, with a banner on every screen. The `-demo` flag of
  PitlaneHQ.exe is for development only and has no button in the app. The one exception is the web's visitor
  (`web/dist/pitwall-tour.js`, COMPANION and not signed in): the landing. The sign-in stays at the top of the page
  (the "me" view as it is) and under it (`#tour` after `#meBody`, mounted by `signWall` while the wall is up) one page
  like a product site (never a slideshow): a tagline, then every feature as a section with a sample that draws itself
  as it scrolls into view (IntersectionObserver, `tr-rv` reveals), "And also" cards (driver notes, rev beeps, overlays
  in VR; never "one account everywhere") and the calls to action. The samples of the lap, the comparison, the coach
  and the board are real laps from the leaderboards (`loadReal`: the record of the most driven car and track with ≥ 2
  laps and the lap behind it, with their traces; a car and track whose laps cannot be read is skipped; the names as
  the public pages show them, Anonymous included; the tag says "Real laps from the leaderboards · car · track"), the
  invented data only when the server has none ("Sample data · invented laps"); the live relative and the race summary
  are always a sample. No "Try it with sample data" (the owner's choice: a visitor never enters the app on invented
  data; `sampleOn()` is always false); "Create account" scrolls to the form at the top. Never on the PC app.
- One version number for PitlaneHQ.exe, the web and the phone apps, shown with "beta" until 1.0.0. The numbering
  started again at 0.4.1 (the owner's choice): the changelogs and What's new begin there, the releases of a higher number
  are deleted by the builds, and the phones announce an update when the server's number differs from theirs (not only
  when it is higher)
  (`appVersion`/`appStage` in main.go = `WEB_VERSION`/`APP_STAGE` in index.html, checked by a
  test). Raise it rarely: a MINOR version for a big set of features; fixes and small changes go into the current
  version (or a PATCH only when a fix must reach PCs that already have it), never one version per build.
  CHANGELOG.md (newest first), the phones' and whats-new.json list only the big versions and only what users notice;
  internal, server and small fixes are one "Fixes and improvements" line. A version gets a GitHub release.
- Every feature goes to the PC app, the web and the phone apps. Equivalent screens show the same information under the
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
- The racing line (`racingline.go`, `lineOffsets`/`cornerLine`/`lineTip` in index.html and the phones' LapMath): both laps'
  paths (Trace.x/y, dead reckoning, same orientation) give how far A was to one side of B at every 5 m (drift out with a
  ±400 m moving average); the coach turns it into inside/outside at B's turn-in, apex and exit (1.5 m or more) and says
  it first when you brake at the reference's point on the wrong part of the track. The model's record and next levels
  carry their line (`idealXY`, ladder x/y, `lapPath` in model.js). Every coach map (analyzer, coach, race summary,
  phones) draws the track as a road with depth (shadow, rim, asphalt) and, with a line, B's dashed along the middle
  and A's beside it at 2.2 px a metre (1 px/pt on the phones), "Line A / B" switch: the road is B's own path when
  both laps have one (`lapShape(B)` first on the web, `c.bx`/`c.by` on the phones), so the dashed line really is B
  and the offsets are A's; else the lap's own path, else the community's layout (web, PC and phones: `trackLayout`,
  `layout` in the phones' `LapAnalysis`).
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
- Your iRating and licence of every discipline (`ratings.go`, `ratings.json` in the account, `/api/ratings`): the game
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
  and says `PITLANEHQ_RESTART=` so the window starts again on the new version (`-replace <pid>`). The window is one
  instance (`Local\PitlaneHQ.Desktop`): a second start brings it forward, never when Windows started it.
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
- Started with Windows (the installer's or Settings' "PitlaneHQ" Run entry, one only), PitlaneHQ.exe opens minimized
  (the window with `-minimized`) and never brings an already open window forward.
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
  sessions keep their real car, and a board lists its badges (`ids` in /combos, `onBoard` in index.html). Different
  layouts of a track (Spa's Grand Prix and Historic Grand Prix) stay apart. A new family is one line in `CAR_FAMILIES`.
- Leaderboards are by lap time, per discipline (Oval, Sports Car, Formula Car, Dirt Oval, Dirt Road),
  without license classes. The fastest lap of each car and track in an account is shared by itself
  (no "share" button), under the public name or as Anonymous. The discipline symbols are our own
  (`DISC_IC`), never copied; the same discipline cards are in Community and in "Choose a session".
  Community on the web and the PC is three parts (`CMV`, `cl-*` in index.html, the "clean data" design): Summary
  (your numbers, your leaderboards with the record of each and how your best came down over your last sessions:
  `rec` and `trend` on /profile?me=1; the latest records; you in the community), Leaderboards (the table with the
  sectors and the track map coloured by sector against your lap, or the record when you have none: the shape and
  where each sector ends from a lap of the board with its telemetry, `commMapGeo`) and Recent records.
  Community's "Recent records" (PC, web, Pitlane HQ Desktop, phones; `/community/records`): the fastest lap of every
  car and track, the newest first, with the lap it beat ("beat Juan by 0.312 s", or "the first lap here"), filtered
  by the discipline chosen; a record opens as lap B (Compare), its leaderboard (`commGoBoard`) or its track page.
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
  "+ Session" lap B is only the laps of the other session (and the references). The window's title
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
- Race rivals (the other real drivers of your races, whose best laps your PC shares; AI drivers and the pace car never,
  `CarIsAI`/`CarIsPaceCar`, `ai` in journal.go) show on the leaderboards with their
  whole name as the game shows it (`driverName` on the server; rivals named "Juan M." before take it from the PC's race
  history, `rivalnames.v2`), with no "rival" tag beside them, on the public pages too. When a driver's own signed-in PC sees them at the wheel
  in iRacing, what was shared of them as a rival goes to their account, and so does what comes later (`/link-driver`,
  `driver_links`: one iRacing driver per account and one account per driver; admins can undo it).
- Driver profiles show the nickname only (never the iRacing name); anonymous laps open no profile and
  never show on one (admins see them). The supporter badge comes by itself to Patreon patrons with
  the same email (`/patreon/webhook`, secret PATREON_WEBHOOK_SECRET) or by hand from the admin
  profile (a manual one stays); a supporter can hide their own. Badges show wherever your name does.
  A main tab always opens on its first sub-tab. The main menu: Home, Analysis, Telemetry (was Live; the
  same name in the phone apps), Overlays (its own tab, only on the PC), Community (just before Account) and Account. No text calls the section
  "Live" any more ("Telemetry → …"). Telemetry → Phone & sharing on the PC: your phone or tablet (pitlanehq.app or
  the app, same account, Telemetry → Connect, accept on the PC; a QR to the web app and the Android download) and
  sharing with a code; no Wi-Fi addresses, PIN or local links (`renderPhoneHow`).
- The Telemetry screen shows only the essentials (`LIVE_ESSENTIAL`: flags, the top card with position, delta, last
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
  end-to-end encrypted with the password's key, the server cannot read it; the laps' telemetry is stored sealed on the
  server (DATA_KEY), which opens it to teach the model and share the fastest laps; live telemetry with a code is
  end-to-end. The analysis of your laps runs on your device.
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
- SEO: index.html has the title, a short plain description, Open Graph/Twitter cards (`og.png`) and
  JSON-LD; robots.txt is in web/dist. Descriptions are short and plain, never hype. The public pages
  (`cloud/src/seo.js`, plain HTML, English, Spanish and Portuguese, each naming the other two with hreflang and
  x-default): /iracing-telemetry, /es/telemetria-iracing and /pt/telemetria-iracing, the overlays (/iracing-overlays,
  /es/overlays-iracing, /pt/overlays-iracing), the guides (`seo-topics.js`, one page per thing people search for, each in the
  three languages, linked at the foot of every public page and in the app's <noscript>: the coach, comparing laps, braking
  points, the racing line, the iRating, the shift beep, telemetry on the phone, free telemetry), /records, /es/records and
  /pt/records, one page per car and track (BreadcrumbList; the records index an ItemList; the landings WebSite,
  Organization, SoftwareApplication and FAQPage); the sitemap carries every language (xhtml:link) and lastmod; IndexNow
  sends every page again when SEO_VER changes; the app's "/" has its doctype, the hreflang links and a <noscript> with crawlable links in the
  body (never before the head's tags) (one canonical address, 301 for any other such as /index.html, a real 404 page for any address
  that does not exist, never the app or the lap viewer with 200; the viewer is noindex), the sitemap made by the server, IndexNow once a day. www.pitlanehq.app is a custom domain of the Worker
  (made by the deploy) that answers 301 to pitlanehq.app.
  Titles, descriptions and texts name the brand as people search it (Pitlane HQ, PitlaneHQ; `alternateName` in the
  JSON-LD) and what it is (iRacing and sim racing telemetry, lap analysis, overlays), plainly, never stuffed.
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
  opened on arrival) and, on the web, an .ics of its weekly race. In development: the server opens the hub to
  everyone with LEAGUES_OPEN=1; until then it answers "in development" and every app shows the card for it (admins
  see the hub). Up to 3 leagues per driver, 10 for a supporter (Patreon or by hand; `LEAGUES_FREE`/`LEAGUES_SUPPORTER`,
  `limit` in the list): under "Post the league" the form says how many you have posted and, to the rest, that supporters
  post up to 10, with a small "♥ Support on Patreon" link.
- Admins: the admin panel (Account, on the PC, the web and the phones) has the overview, every
  account (member since, set by hand; the supporter badge; its profile; delete), the shared items,
  the leagues, the latest sessions (any driver's, a private one too: an admin opens every account's profile from the
  leaderboards, and the profile lists its sessions for admins; "See the laps" opens its laps one by one with their top speed and
  sectors, and an admin marks a lap not valid or valid again: `admSessionLaps`, `/api/laps/:id/valid`; the session's
  best, the driver's share and the model follow), the server's emails and the tools (rebuild the coach models; the
  blocked sign-ins one by one, by email or all; per account: confirm its email, turn off its two-step
  sign-in, sign it out everywhere, rename it, join a DRINKS driver to it or undo it; `/admin/guests` lists every
  DRINKS driver on the platform for the chooser). Networks are only ever a hash of their address. An admin
  can see the app as a normal user on one device (the shield in the header, the admin panel, or
  Settings on the phones): everything for admins and in development hides until the admin view is back.
- The coach and the lap analyzer stay short: the coach is the gap, what to work on first, the plan,
  the map, the sectors and the corners that cost the most; the analyzer is the gap with its three
  key facts (plus the corners against the straights), every corner as a small bar you can press to pin the charts
  and the map at it (`la-corners`; `CornerStrip` on the phones, where a corner is "T3" too), the charts with the reference's corners as bands labelled by the official turns
  (`cmpCornerBands`), the "Line" chart (how far A was to one side of B, + left, `LAPCH.line`), the map, the sectors,
  the lap list and the braking points.
  The corner tips (`coachCompare` in index.html, `compareLaps` in ovnative4.go, `corners` in the phones' LapMath):
  the phase that loses the most says the tip, and every tip follows the measured facts, never against them: braking
  later than the reference and arriving slower at the apex is one mistake whatever phase pays for it ("brake a little
  earlier and carry the speed"); with the same braking point the tip is about the brake (harder at first, trail, or
  "brake hard at once, then release progressively"), never "brake later"; an apex reached as fast as the reference's
  says the time goes before it (entry) or in a longer slow part (apex); a throttle picked up earlier than the
  reference's but a slower apex says to carry the speed, never "full throttle sooner". A generic tip gives way to
  what the data shows plainly, in this order: the line (inside/outside), the gear at the apex against the reference's,
  throttle lifts after the apex (exit), steering corrections in the corner (PC and web only: the phones' traces carry
  no steering). The plan's habit advice (`coachPlan`) takes its direction from the averages over the corners: where
  you brake against the reference, how fast you reach the apex and when you pick up the throttle. The PC's coach overlay
  measures the last lap against the model's next level when it is faster than the session's best, else the best.
- What makes a lap not valid, and only that (`invalid()` in cloud.go, the same verdict for the race summary's laps):
  leaving the track (an Off Track incident, or all four wheels out for a third of a second) or lost connection (a hole
  of more than 40 m in its telemetry, or not the whole circuit). A Loss of Control (2x) or a Car Contact (4x) counts
  only when it takes the car off the track; a lap through the pit lane is valid, a rival's too (field.go). Incidents
  are named as iRacing names them, by their points: 1x Off Track, 2x Loss of Control, 4x Car Contact, 0x Light
  Contact (never seen in the count); never "spin".
- A lap goes round the whole circuit (through the pit lane counts): one that did not is never a best, a share or the
  model's. The PC marks it not valid (under 90 % of its points seen on track, `fullLap` in cloud.go: a reset, a tow),
  and the server a lap without sector times where its session's other laps have them (`dropImpossibleLaps` on every
  upload, migration 0046 for the old ones, `repairImpossibleShares` in the ten-minute job).
- The model (`cloud/src/model.js`, MODEL_VERSION 7) learns clean traces only (a speed jump over 10 m/s between two
  points is a glitch) and marks a rival's lap (`field`: pedals estimated from its speed); the next level prefers a
  lap with real pedals, and `idealField` says when the record is a rival's.
- In development (shown with "In development", usable only by admins, on every device): the
  Planner (until iRacing switches its data API back on), Le Mans Ultimate, ACC, Assetto Corsa,
  NASCAR 26, team mode, leagues and the Data view. The overlays on top of the game are open to everyone (0.9.0). The
  Full telemetry view is gone everywhere.
  Switched off for now: setups, per-car settings, the Data view and sharing race analyses. Hidden from everyone
  on the PC (admins too) until the owner says otherwise: profiles (no button, no Settings section, the PC keeps its
  one profile), Settings → Connections (`CONN_ON` in index.html) and Full telemetry. Per-car settings never
  apply (`carProfilesOn` in carprofiles.go), and a sync reload never closes or reopens the overlays. An overlay
  window is the widget itself, with Windows 11's rounded corners and a quiet border (`ovwin`, `noWinBorder`); it
  fits its content's height (grows at once, shrinks after a moment). An overlay never leaves the desktop when
  dragged, resized or placed (`keepOnScreen`, `clampMove`). Nor is it made smaller than it can be read: 70 % of its default width
  (`overlayMinSize`; the map, the radar and the g-force 70 % of their height too), when resized, moved or opened. The
  Overlays cards show no OBS address. An overlay window draws only its own widget; only the
  radar's window hides itself when nobody is near. Every overlay is native UI drawn in Go, never WebView2 (its
  content is always opaque; a test checks every overlay in `overlayOrder`): `ovnative.go` (shapes, the app's own
  fonts embedded from `ovfonts/` (IBM Plex Sans, JetBrains Mono, Barlow Condensed, OFL), its colours, licence badges
  and pills; the live stream; radar, delta bar, relative, standings), `ovnative2.go` (flag, dash, timing, fuel,
  engine, tyres, inputs, DRS & push-to-pass, telemetry, g-force), `ovnative3.go` (stats, pit stop, mini-sectors,
  gaps, incidents), `ovnative4.go` (track map from `/api/map` or the community's layout, live compare, braking
  markers with the model's next level from `/api/community/model`, coach), `ovnative5.go` (weather: the track's and
  the air's temperature, the wind against your car with the game's clock, rain and how wet the track is; the car's
  controls: every in-car adjustment this car has, `controlRows`, lit up for a moment when it changes; the track position
  bar: every car along the lap on one line, class colours, you marked, the two nearest numbers each way; performance:
  frames a second with the last minute, GPU and CPU, the connection's latency and quality) and `ovnative_windows.go` (a
  layered window with alpha per pixel and the overlays' opacity). Only the panel and its content show, the rest is
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
  standings 4/s, radar 30/s). The relative always has the rows you chose ahead and behind (empty when no car).
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
  The basic overlays, shown without the experimental switch (`OV_BASIC`): radar, delta bar, relative, standings,
  flags, dash, timing, map, fuel, tyres, inputs, pit, brakes, coach, incidents, engine, weather, controls, track bar.
  Experimental: compare, boost, gg, stats, sectors, gaps, telemetry, system.
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
- Analysis's sub-tabs: Laps, Coach, My sessions (`cloudlaps`, every session in the account) and My races (`races`, the
  race summaries with the driver notes); Home's "See all" opens My races. The phone apps have the same four (and
  Telemetry, Standings and Tyres under Telemetry). A finished race shows no notice on the PC
  (it appears in My races); only the phones tell you.
- Pitlane HQ never shows Windows notifications (nothing in the action centre; `notify` only logs, and the PC app
  schedules no browser notifications): what it has to say shows inside the app.
- PitlaneHQ.exe checks for updates every 30 minutes, notifies once per version and installs by
  itself when no sim is running (unless switched off in Settings → About).
- People see the PC program as "Pitlane HQ Agent" (or "the agent"), never "PitlaneHQ.exe" (the file keeps its name):
  on the web, the PC app, Pitlane HQ Desktop, the phones, the downloads page and the changelog. Away from the PC (the web,
  the phones) a text never says "this PC": it is "your PC" (`PC_WORDS`/`devWords` in index.html turn every "this PC",
  "este PC", "diesem PC", "neste PC" into the driver's). The web in a computer's browser, signed in, says when the
  agent is not detected (no presence from your PC on the account) with "Download for Windows" and a ×, closed for that
  tab (`agentBar`); never on the PC app nor the phones.
- This repository is only the PC app (PitlaneHQ.exe, Go) and the web (`cloud/`, Cloudflare).
  The Android and iOS apps live in their own repository.
- One app everywhere: `web/dist` is the PC app and the web app at `/app` (computers and phones).
  Web scripts are loaded with relative paths.
- `master` is the main branch the builds come from (Windows and the server).
- The owner's name never appears in the code, the documents or the tests; the apps never link to
  GitHub: downloads and release notes come from https://pitlanehq.app (R2 bucket, `cloud/src/downloads.js`).
