# Changelog

Pitlane HQ is in **beta**. PitlaneHQ.exe, the web app and the phone apps share one version
number: `0.MINOR.PATCH`. PATCH for fixes, MINOR for a set of new features, and 1.0.0 when the
beta ends. Every version is listed here, newest first, and gets a release on GitHub.

## 0.6.2 beta

**Changed**
- **The app is called Pitlane HQ again** everywhere: TrackIQ.exe becomes PitlaneHQ.exe (the
  installer and the updater take care of it; the 0.5–0.6.1 installs keep updating), the web,
  the phone apps, the server emails and the documents.
- **The server lives at https://pitlanehq.app**: the PC, the web and the phone apps point there.
  Accounts, laps and the community are the same.
- **Clean addresses**: the web app is simply https://pitlanehq.app/ (no more `/app/?companion=1`;
  the old addresses land there), with its own icon in the browser tab and on the home screen.
- **No portable ZIP any more**: Windows is installed with PitlaneHQ-Setup.exe and updates
  itself (the ZIP stays only as what the updater downloads). iPhone comes with the App Store.
- **Downloads and release notes from pitlanehq.app**: https://pitlanehq.app/downloads and
  https://pitlanehq.app/changelog, served from our own storage; the PC updater and the phone
  apps' version check read them there. Nothing in the apps points at GitHub any more.
- **Info** replaces the floating bell: a button in the header (PC, web, phones) with the alerts
  that matter now (new version, app news, account to-dos; dismissable) and, always, how to
  support Pitlane HQ and send feedback.
- The track maps also show the three sectors on the phones; on the web, every chart of the lap
  analyzer always says something above it (the whole lap when nothing is touched, the point when
  you touch), and a finger on the map reads the nearest point even when it is not exactly on
  the line.

## 0.6.1 beta

**Security**
- **Two-step sign-in** (optional, recommended): an authenticator app on your phone (Google
  Authenticator, Microsoft Authenticator, Authy, 1Password…). Turn it on in Account on the PC,
  the web or the phone apps; you get 8 one-use recovery codes. Signing in then asks for the
  password and the 6-digit code; 5 wrong codes lock it for 15 minutes.
- **Nothing readable in the database**: telemetry, race analyses and the authenticator secrets
  are sealed at rest with a server key (`DATA_KEY`, AES-256-GCM) on top of what was already
  there (passwords never stored, only hashed login keys; emails and session tokens only as
  hashes; synced settings end-to-end encrypted).
- **Sessions**: a session also ends 400 days after it was opened, however much it is used
  (180 days without use, as before). Every answer of the server carries protective headers
  (no sniffing, no framing, no referrer, HSTS).
- **The PC's local API is only for Pitlane HQ's own windows**: they get a one-use ticket in their
  address; any other program or web page on the PC gets the pairing PIN instead of your data.
  Everything PitlaneHQ.exe sends to the internet uses TLS 1.2 or newer.

**New**
- **Inbox**: a floating bell (PC, web, phones) with what matters now: a new version with its
  notes, news of the app, Patreon, feedback, and your account's to-dos (confirm the email, turn
  on two-step sign-in). Dismiss what you have read; a badge counts what is new.
- **New version notice at start**, everywhere, with a **What's new** button that opens that
  version's changelog. On the PC a version can be marked as **required** (`appMinVersion`):
  then the notice cannot be put off until the update is done.
- **Pitlane HQ Desktop (preview)**: the native Windows window (C#/WPF) over the same Go engine,
  built screen by screen. `PitlaneHQ-Desktop.zip` on the downloads page; `PitlaneHQ.exe -engine`
  runs the engine for it.

**Fixed**
- The track map of the lap analyzer, the Coach and the race summary shows the **three sectors**:
  the start/finish line, a cut at each sector change and S1, S2, S3 written in the middle of
  each sector (before, only two unnamed cuts marked S1 and S2).
- The server's list of shared race analyses no longer reads inside the analysis data (it has
  its own columns now), so sealed analyses list as fast as before.

## 0.6.0 beta

**New**
- **Days you drove**, on Home everywhere (PC, web, phones): the last 26 weeks in squares like
  RaceLab, brighter the more races and sessions that day. Tap or click a day to see what you
  drove: its race summaries and its sessions, each one opening its summary or the analyzer.
- **My races filters:** search a track or car, pick a track or a kind of session (race, qualify,
  practice), order by newest, fastest lap or most laps, and "only my fastest ever" (the session
  of each track and car where you drove your best lap). The race summaries follow the same
  search.
- **Your fastest lap ever** is marked in the session lists of the lap analyzer and the Coach
  ("your fastest ever 1:33.369"), so you find that session straight away.
- The small charts of the race summary (lap times, position, gap) answer to the mouse and to
  touch like every other chart: a line and a box with that lap's value.

**Changed**
- The map of the lap analyzer and the Coach shows every incident of lap A's session, like the
  race summary's map (lap A's in full, the other laps lighter), and the hover names the lap of
  each one. Laps without their own incidents take them from the race summary.
- Sector marks on the maps sit on the inside of the track with a bar across it, so they never
  cover the corner numbers; the race summary's map has them too.
- Not valid laps look the same everywhere: grey and crossed out, in the race summary, the lap
  analyzer and the phone apps' lap lists ("invalid" in words, no ✂).
- Sharing the fastest lap is in Community only (Share from your account); the lap analyzer and
  the Coach now have exactly the same bar.

**Fixed**
- Demo data on and the analyzer showed your real sessions (the account was loaded before the
  admin check): the sessions load again when demo data is switched or confirmed.

## 0.5.9 beta

**New**
- **Home is the landing everywhere.** The PC and the web on a computer open on Home (your
  races, stats and recent races), like the phone apps and the web on a phone, and Home is the
  first item of the menu.
- **Demo data runs a live race.** With demo data on (admins only) and no real telemetry, the
  Live page shows an invented race at Spa: 10 drivers, positions, relative, delta, fuel, tyres
  and the track map with every car. Nothing is uploaded.

**Changed**
- No game selector anywhere (Community, races, tracks, My races): everything follows the game you
  drive, iRacing unless an admin is testing another one.
- Race reminders in Settings are in development like the planner they belong to: only admins
  can use them, everyone else sees that they come back with the planner.
- Community: the subtitle no longer mentions race analyses (their sharing is switched off).

## 0.5.8 beta

**Changed**
- The incidents of a lap read clearly: how many in front, the points in brackets, e.g.
  "2 × Off track (1x) · Loss of control (2x)", in the lap analyzer, the race summary, the map
  readout and the phone apps.
- Lap analyzer: the button reads "Compare with the community", like the Coach's.

## 0.5.7 beta

**Fixed**
- Home (web and PC): a race showed 0x incidents (and the incident average 0.0) until you opened
  its summary; every race is now checked as it loads, so the total is right at once.
- Names saved with the wrong encoding by an older PC ("AutÃ³dromo", "LÃ©o") read right again in
  the race summary, the Home and the results, also when the name has correct characters too (the
  " · " between track and layout made the old repair give up).

**Changed**
- Lap selectors: no symbols. Each lap reads "Lap 3 · 1:44.906 · invalid · 1x"; the incidents near
  a point on the map read "Car contact 4x".

## 0.5.6 beta

**Changed**
- Light contact and loss of control are told apart. Both are 2x in iRacing; PitlaneHQ.exe now calls
  a 2x a light contact when another car was right beside you a moment before (CarLeftRight), and a
  loss of control otherwise. The race summary, the lap analyzer, the maps and the phone apps name
  them separately ("Loss of control 2x", "Light contact 2x"); light contacts are blue on the map.
  Incidents recorded before this version keep showing as loss of control.
- Lap analyzer and Coach on the PC: the title, and under it the session bar on its own row from
  the left, the same in both (it used to float on the right).

**Fixed**
- Web app on an iPhone: Safari could widen the Home past the screen (a scroll row and the grids
  took the width of their content); they are held to the screen width now.

## 0.5.5 beta

**Changed**
- **Pitlane HQ needs your account**, like the phone apps: on the PC and on the web, until you sign in
  (or create your free account) only the Account page opens; the menus come back as soon as you
  are signed in. The overlays on top of the game are never blocked, and neither is a PC whose
  Pitlane HQ server is not set up, so racing never stops for this.

**Fixed**
- Web app on phones: the session bar of the lap analyzer and of the Coach broke into a narrow
  column (the "Compare with the community" button stood on end). Both now show the same layout:
  the session on its own row, then lap A · vs · lap B · ＋ Session, then the buttons. On the PC
  both stay on one row.

## 0.5.4 beta

**Changed**
- **One map everywhere.** The map in the lap analyzer and in the Coach now shows exactly what the
  race summary's map shows: where lap A brakes (orange) and where lap B brakes (blue), the
  incidents with their points next to the mark (1x, 2x, 4x, as the game gives them), the coach's
  corners (where you lose time) and the corner numbers, with switches for Braking, Incidents,
  Coach and the A-vs-B time colouring. One line sums up the incidents of the lap (how many, of
  what kind, in which corner most of them). The hover reads the braking of both laps at that
  point. The race summary's map shows the points of each incident too.
- Race summary: the lap table names the incidents of each lap by kind (Off track 1x, Loss of
  control 2x, Car contact 4x), like the lap analyzer.
- The phone apps draw the same map (braking of both laps, incidents with points, coach corners,
  switches).

## 0.5.3 beta

**Fixed**
- Web app on a phone: "Connect PC" in the header failed (a missing helper in the connection
  centre) and the Diagnostics and Refresh buttons did nothing; on phones it now opens the Live
  page (pairing and live through your account), and the connection centre works on the PC.
- The version number shows again on phones, next to the connection pill. Nothing on the Home can
  push the page sideways any more (long names wrap or are cut instead).
- Lap analyzer: laps recorded before 0.5.1 take their incidents from the race summary of the same
  session (per lap and where they happened), and your account keeps them, so they show on every
  device. Track names saved with the wrong encoding by an older version read right again.
- Coach: the game selector is gone from it, like in the lap analyzer.

## 0.5.2 beta

**New**
- Recorded laps: the incidents of each lap as the game names them (Off track 1x, Loss of control
  or slight contact 2x, Car contact 4x), and for admins a button per lap to mark it valid or not
  valid by hand.
- Coach and lap analyzer now have exactly the same session bar and lap lists: one row, the same
  laps in B (with ★, ✂ and ⚠) and the fastest lap chosen by default; the Coach's synthetic "My
  best lap" entry is gone.
- My races: the race summaries open from here on the PC and the web too (a list of your recorded
  races, and "Race summary" when you open a session that has one), not only on the phone.

## 0.5.1 beta

**New**
- **Incidents on your laps.** PitlaneHQ.exe records the incidents of every lap (how many points and
  where on the lap). The lap analyzer shows them in the lap table and in the selectors (⚠), the
  track map marks where they happened (a switch hides them) and the hover reads them. Incidents
  never make a lap invalid; only leaving the track does. The phone apps show them too.
- **Your name in the community, one choice:** your iRacing name (the one of your registered
  session), a nickname, or Anonymous, in which case nothing you share carries a name: not the
  leaderboard, not the telemetry of a fast lap, not an analysis. The choice is kept with your
  account, so the PC, the web and the phones share the same way. The other drivers in a shared
  analysis only ever show by their first name, whoever shared it.

**Changed**
- Lap analyzer and Coach use the same session bar: A session, ＋ session, B session. Lap B
  lists the laps of session A as well as those of the added session, and both lists mark the
  fastest lap (★), the not valid ones (✂) and the incidents (⚠). The Coach's reference can be a
  lap of the added session too.
- Admin "mark laps valid" (analyzer and race summary) only validates the laps without incidents.

## 0.5.0 beta

**New**
- **Track maps draw themselves.** PitlaneHQ.exe now records where the car was on every lap (from its
  heading and speed) and keeps it in the lap's telemetry (`x`, `y`), so the map in the lap analyzer,
  the Coach and the phone apps comes from the lap itself: no Live screen open, no community layout
  needed. Every valid lap also sends the circuit's outline to the community when it is faster than
  the one everyone has, so the race summaries of other drivers get the map too.
- **Hover on the map**: in the lap analyzer and the Coach, moving over (or touching) the track map
  reads that point: distance and corner, the speed of both laps, the gap there, throttle and brake.
  In the analyzer the charts follow the point on the map, and the map follows the charts.
- **Admin: mark the laps of a session valid** from the lap analyzer (My races), for sessions where
  the cut check got it wrong; the race summary already had this button.
- Demo data: laps carry the shape of the track too, so the maps show in the demo.

**Changed**
- **Valid laps mean the same everywhere.** A lap is invalid only when the car left the track
  (cutting), exactly as the race summary decides it. Laps through the pit lane, laps with a hole in
  their telemetry and laps whose official time arrived late are no longer crossed out in the
  analyzer; they still never count as your best and are never shared.
- PitlaneHQ.exe starts cleaner: the window stays hidden and dark until the app has painted itself,
  instead of showing a white window and a page loading in pieces.

**Fixed**
- The track map was empty in the web app for laps of your account: the web could not find the
  circuit's id (older sessions have none and the web never loaded the community's track list). It
  now uses the community's combos too, and the lap's own shape when there is no layout.

## 0.4.2 beta

**Fixed**
- The track map in the Coach and in the lap analyzer did not show for laps whose session had no
  circuit id (older sessions, laps from your account): it now finds the circuit by its name, and a
  map that could not be loaded is tried again a moment later instead of staying empty.

## 0.4.1 beta

**New**
- Pitlane HQ is now **Pitlane HQ** everywhere: the app, the web, the emails, the installer
  (PitlaneHQ-Setup.exe), the program (PitlaneHQ.exe) and the browser tab, which reads
  "Pitlane HQ - Telemetry & Coach". Your data, settings and sign-ins stay where they were, and
  installs made before the rename keep updating (the update still reaches them under their old file
  name).
- Lap analyzer: the sector lines (S1, S2, S3) now show on every chart, not only on speed: delta,
  throttle, brake, gear and steering.
- Track map in the Coach and in the lap analyzer: shows where lap A gains (green) or loses (red)
  time against lap B on the circuit, with the corner numbers and the sector marks. In the
  analyzer a point follows the cursor on the map as you move over the charts.

## 0.4.0 beta

**New**
- Coach (formerly Braking coach): a plan for your next session from everything the telemetry
  says about a lap against a reference: time lost in corners by phase (braking, entry, apex,
  exit) and on the straights, what to work on first with the gain each item brings, the
  sectors, how steady each corner is over the session, and how you drive the lap (flat out,
  coasting, lifts, steering). One card per corner with braking point, slowest speed, trail
  braking and coasting.
- The braking coach lives in the lap analyzer too: corner cards under the charts.
- Lap analyzer: every channel (speed, delta, throttle, brake, gear, steering) has its own panel
  with the values at the point you hover or touch shown right above it, and can still be switched
  on or off. On the PC the card follows the pointer over any chart.
- Race analysis map: hover or touch the track to see the distance, the corner, where you brake
  (and the driver you compare with), the incidents there and the coach's tip.
- Home on phones (web) like the phone apps: licences (in development), a race summary (iRating,
  change, races, wins, top 5, incidents) and your recent races, which open the race summary.
- Admins: a race analysis whose cut check was wrong can have every lap marked as valid again
  (local reports and shared analyses); incidents stay as they are.

**Fixed**
- Demo data: the corners of a track are in the same place on every lap, so the coach's phases
  make sense on the demo too.

## 0.3.9 beta

**Changed**
- Lap analyzer: the card where you hover or touch shows only the channels you have switched on.
- Sharing from the analyzer or from Community always takes the fastest valid lap of the session.
- Community: the sessions you can share say practice, qualifying or race.
- Sharing race analyses is switched off for now (they are no longer sent, and the panel is gone).
- Data is switched off for now in Analysis (Full telemetry stays for admins on the PC).
- Web on phones: the same five tabs as the phone apps (Home, Analysis, Community, Live,
  Account) and the sections of each one as pills with short names, so moving around is easy.

## 0.3.8 beta

**Fixed**
- Race reports marked laps as not valid that were fine: the report now uses the same check as
  the lap analyzer and sharing (off the track for a third of a second, measured 30 times a
  second), so they always agree.

## 0.3.7 beta

**Fixed**
- Sessions recorded before 0.3.6 can be shared with the community too: the track and car are
  found from your track book and what others shared.
- A lap without telemetry can be shared: only the time goes, and the leaderboard says its
  telemetry was not shared, so others know why they cannot compare with it.
- Only valid laps go to the community: a lap where the car left the track (cutting a corner) or
  went through the pit lane is never shared, by the PC or from your account. An incident alone no
  longer makes a lap invalid.
- Race analyses and the lap analyzer say which laps were not valid (✂ off track), and those laps
  never count as your best.
- Lap analyzer: hovering or touching the charts keeps working after switching speed or delta off
  and on again.
- A session with a single lap no longer hides the session and lap pickers.
- My races on phones: the rows fit the screen.

**Changed**
- Every session says whether it was practice, qualifying or race (My races, the session pickers,
  sharing from your account and the phone apps).

## 0.3.6 beta

PC app and web only: the phone apps wait for the next build.

**New**
- My races (formerly My laps): every session in your account. Open one in the lap analyzer or the
  braking coach.
- Lap analyzer: throttle, brake, gear and steering under the speed chart, each one switched on or
  off (speed and delta too). The analyzer and the braking coach read them: time flat out,
  coasting, lifts in the middle of a corner and how busy the steering is, with what to change.
- Share with the community from your account: the fastest lap of any session (Community), or
  lap A from the lap analyzer, always with its telemetry.

**Changed**
- Community: one switch, "Share with the community", shares everything at once (best laps with
  telemetry, race analyses, track layouts). Your public name moved here from My account.
- Leaderboard: laps whose telemetry was not shared are listed too, and say so.
- Loading a session from your account takes one call instead of one per lap, the last sessions
  stay ready, and changing race quickly no longer leaves the analyzer loading forever.
- Data and Full telemetry are for admins only for now; per-car settings and setups are switched
  off; Settings left the My account tab (it is behind the gear icon).

## 0.3.5 beta

**Changed**
- Lap analyzer and braking coach on the PC: choose the laps of this session live or any session
  in your account (with "Compare with the community" as before), so a race can be analysed after
  it ends.

**Fixed**
- Race analysis map: two corners the same way close together are now two corners (a track with
  12 turns shows 12).
- Race analyses shared anonymously show "Anonymous" inside, also the ones shared before this
  version.
- Community leaderboard: a shared lap that went without its telemetry now shows it when the same
  lap is in your account laps (only for drivers who share their telemetry).

## 0.3.4 beta

**Fixed**
- Race analyses (yours and the shared ones): the incident count no longer shows 0 when the laps
  had incidents (iRacing's results can still say 0 at the flag), so the summary no longer calls
  it a clean race. Laps without a time are left out of the lap chart instead of dropping to the
  bottom.
- Track and car names with accents ("Autódromo Hermanos Rodríguez") are no longer garbled.
- Race analyses shared anonymously no longer carry your name inside (results and braking
  points say "Anonymous"). The other drivers show by their first name instead of only "P1, P2…".
- PC: Analysis shows the laps in your account when the window has none of its own (after a race
  or a restart), and My laps works on the PC when you are signed in.

**Changed**
- Race analysis map: the corners are found from the shape of the track (T1, T2… from the start
  line), not only where you brake, so every real corner gets its number.
- Incidents say what they were: leaving the track (1x), loss of control (2x) or contact (4x). They
  are summed up in one line and shown per corner, instead of a long list.
- The coach explains each corner in plain words: what the driver you compare with does
  differently and what to try. One card per corner, also on phones.
- Shared race analyses show the track map too: the community layout of any track someone has
  driven with Pitlane HQ.
- Community leaderboard: a lap with its telemetry replaces your faster shared lap when that one
  went without telemetry, so your shared lap can always be compared in full.

## 0.3.3 beta

**Changed**
- Lap charts on phones are open to everyone (they were in development): on the web from a phone
  and in the phone apps.
- Touching a lap chart on a phone answers at once: a tap shows the values and sliding sideways
  follows the finger, no press-and-hold first. The card with the values keeps its place above
  the chart, so the chart does not move under your finger.
- The web on phones is cleaner, like the phone apps: a short demo banner, one settings button,
  your recent races on Home, and the lap tables keep only the columns that fit.

## 0.3.2 beta

**New**
- DRINKS mode can be switched from Settings → About on the PC and on the web (admins only), not
  only from the phone. On the web it goes to your PC through your account.

**Changed**
- The box that shows the values where you hover or touch a lap chart is cleaner and organized
  like the phone apps: distance, sector and the gap there, then both laps side by side (speed,
  throttle, brake, gear) and the sector times. On phones it sits above the chart instead of on
  top of it.

**Fixed**
- Lap charts on the PC and the web no longer grow without end and crash when the mouse moves over
  them on screens with Windows scaling above 100 %; hovering only redraws the charts.
- Demo data can always be turned off again: the switch in About no longer disappears after the
  page reloads.
- The demo data banner is bigger and easier to see.
- My account on wide screens: the two columns are balanced and delete account sits under the
  left column.

## 0.3.1 beta

**New**
- Braking coach in four phases (web, PC and the phone apps), as driver coaches read data: braking (brake point, how hard),
  entry (releasing the brake into the turn, trail braking, coasting), apex (minimum speed) and
  exit (when the throttle comes back). Each corner says which phase loses the time and what to
  change; a summary shows the time lost per phase over the lap, the metres spent coasting and
  the least steady corners over the session.

**Changed**
- Compact menus on phones and narrow windows: the header fits on one line, smaller tabs and
  bottom bar, the two laps side by side, smaller download cards. The version is in About.

## 0.3.0 beta

The first numbered beta. Before it, every build raised the version (up to 0.25.0): from now on
the numbers move slowly and each one comes with this changelog.

**New**
- One version for the PC app, the web and the phone apps, shown as "0.3.0 beta" everywhere.
- Demo data for testing, for the server's admins only (Settings → About): invented sessions,
  laps, races and community laps. Nothing is uploaded, and a banner shows while it is on.
- DRINKS mode (formerly Friday night mode, admins only): friends drive on your PC and their laps
  go to the community under their name. It can also be switched from the phone app.
- A loading screen while Pitlane HQ starts, instead of a half-drawn live view.
- The web shows its version in About.
- Downloads: the Android app (APK) and the iPhone app, always the newest version.
- About: support Pitlane HQ on Patreon.

**Changed**
- Everything still in development is closed except for admins, on every device: Le Mans
  Ultimate, ACC, Assetto Corsa, NASCAR 26, the Planner (until iRacing switches its data API back
  on), the overlays on top of the game, team mode, and the lap charts on phones.
- Live telemetry: the connection state is shown in one place (the main card on the left) and
  the dashboard texts are translated.

**Fixed**
- Lap recording: laps are kept in the right session, the lap time is read correctly, and a lap
  the server rejects no longer blocks the ones after it.
- Live telemetry from the PC to the web and the phone starts reliably and resumes when the PC
  or the page restarts.
- Lap charts on phones: lighter (sharp at a third of the memory), no redraw while scrolling, and
  readable by touch (tap, or press and drag sideways).

## Before 0.3.0

Builds 0.1.0 to 0.25.0 (before the beta numbering): live telemetry and overlays, lap analysis
and the braking coach, the community with its ideal lap, race reports, the planner, the account
with end-to-end encrypted sync, the web version on Cloudflare and the phone apps.
