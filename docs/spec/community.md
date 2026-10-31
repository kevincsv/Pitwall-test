# Community, leaderboards, rivals and car families

How this part of Pitlane HQ behaves. Read it before changing this area; keep it up to date when the behaviour changes.

- Race rivals named after the fact: the PC sends its race history's rivals once (`nameOldRivals`, `/rival-names`:
  matched by car, track and best lap; Anonymous or "Juan M." rivals this account shared take their whole name, which only admins see).
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
  by the discipline chosen (the server reads them from the database once a minute for everyone who sees the same names,
  `minuteCache`, to stay under D1's daily reads); a record opens as lap B (Compare), its leaderboard (`commGoBoard`) or its track page. Every
  record, track page row, profile lap and admin record says its game (`gameChip`, `game` on each record; the admin's
  newest records are every game's, `/records?game=all`), and a lap, board, record or session of a game opens in that
  game (`toGame`: Analysis looks for your sessions of that game on that track).
  The track page (`/community/track`, `openTrackPage` on the web, `TrackPageScreen`/`TrackPageView` on the phones):
  the map with the official turns and the direction arrow, how many drivers and laps the track has and the record of
  every car on it. It opens from the leaderboard's "Track page" chip and from every record; on Pitlane HQ Desktop
  it is the "Track page" button beside the car (`TrackPage.cs`), a row opening that car's leaderboard.
- Race rivals (the other real drivers of your races, whose best laps your PC shares, in iRacing and in Le Mans Ultimate (LMU gives no driver id: `lmuDriverID`, a stable hash of the name the game shows, far above iRacing's ids, is the driver's `UserID` in the synthesized YAML); AI drivers and the pace car never,
  `CarIsAI`/`CarIsPaceCar`, `ai` in journal.go) show on the leaderboards as Anonymous,
  with no "rival" tag beside them, on the public pages too: they did not join Pitlane HQ, so they never agreed to be
  there by name. Everywhere (leaderboards, records and "beat … by", track pages, the coach's fastest shared lap, public
  pages, Discord, a shared race analysis's other drivers) their laps are anonymous (`community_laps.anon` 1 for every
  `o:…` driver, migration 0076; an admin's undo of a driver link gives them back anonymous too). Their whole name as the
  game shows it is still kept (`driverName`; rivals named "Juan M." before take it from the PC's race history,
  `rivalnames.v2`), and only an admin with admin mode on sees it: the web, the agent and the phones send
  `X-Pitlane-Admin: 1` then, and the server shows it only to an admin's account (`seesRivals`/`shownName` in
  community.js). When a driver's own signed-in PC sees them at the wheel
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
- "Share my lap" (the leaderboard's title, when the driver is on that board, never in demo data): a 1200×630 picture
  drawn on the device (`lapCardCanvas`/`shareLapCard` in index.html: the dark card with the amber edge, Pitlane HQ and
  the game, the track, the car, the time, "P3 of 42 on the leaderboard", wet when it was, pitlanehq.app). The share
  sheet when the device has one (phones, most browsers), else the picture is saved. Counted `act:share_card`. The phones
  draw the same picture natively.
