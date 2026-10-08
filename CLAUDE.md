# Pitlane HQ: rules for working on this project

- Reply to the owner in Spanish.
- Push only when the owner says so ("súbelo", "sube todo"…). Never create pull requests unless asked.
- Anything sensitive that goes to GitHub is encrypted or kept in GitHub secrets; never paste
  Cloudflare tokens or keys anywhere.
- The subscription stays off (`license_plans.json` → `enforce: false`).
- Real data by default: no demo races, sample drivers or made-up laps on the server. Invented data
  only behind Settings → About → Demo data, which only admins see (web/PC: pitwall-demo.js; phone
  apps: Settings → Admin), never uploaded, with a banner on every screen. The `-demo` flag of
  PitlaneHQ.exe is for development only and has no button in the app.
- One version number for PitlaneHQ.exe, the web and the phone apps, shown with "beta" until 1.0.0
  (`appVersion`/`appStage` in main.go = `WEB_VERSION`/`APP_STAGE` in index.html, checked by a
  test). Raise it slowly: PATCH for fixes, MINOR for a set of features, never on every build.
  Every version gets an entry in CHANGELOG.md (newest first) and a GitHub release. Changelogs (CHANGELOG.md, the
  phones' and whats-new.json) only say what users notice; internal or server changes go as "Fixes and improvements".
- Every feature goes to the PC app, the web and the phone apps.
- DRINKS mode (formerly Friday night mode): admins only, on the PC or from the phone app. A driver already on the
  list can be renamed (✎: the same driver on the server, `/guest-rename`, so their shared laps change name too) or
  taken off the list (×: what they shared stays).
- One model per car and track (`cloud/src/model.js`, fed to the coach and the lap analyzer by
  `web/dist/pitwall-model.js`): it learns from every real lap it knows (the accounts' laps, shared
  or not; shared laps; the laps of the rivals of your races) and its references are real laps,
  never composites: the record (the fastest lap really driven) and, for your pace, the lap of the
  driver just ahead. It has no panel of its own: the coach shows the record, the next level and
  your pace among the drivers known there, and both views offer its references as lap B; the lap
  list is coloured by it. No second "ideal" or theoretical lap anywhere.
  Test drives never teach the model nor go to the leaderboards; the model learns only from practice,
  qualifying and race laps of official series (hosted, league and AI laps still show on the boards).
  The car card (`car_cards`, one per car, `buildCarCard` in model.js, `/community/car`): what a car
  does on every track it was driven on (hardest braking, the speeds the fast drivers shift up at, top
  speed and where), from the model's memory. The coach shows it against lap A only when nobody known
  is ahead on that car and track; the phone apps show it in the lap analysis. It is a hint of what the
  car can do, never a reference lap.
- Braking beeps (Settings → Engineer → Beeps: Off, 1 or 3 beeps, earlier with traffic, volume; and the Braking
  markers widget): the braking points come from the model (the next level for your best lap of the session; your
  own best lap while the model has none or you are its fastest), and each beep moves with your speed against that
  lap (the extra braking distance at its own deceleration) and with a car close ahead or alongside.
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
  and A's beside it at 2.2 px a metre (1 px/pt on the phones), "Line A / B" switch.
- Official turn numbers (`track_turns` on the server, `/community/turns`, `/api/turns`): an admin places T1 … Tn on a
  track's map in the race summary ("Official turns · Admin", clicks in order, saved for everyone, as fractions of the lap).
  The coach, the lap analyzer and the race summary (PC, web, phones: `turnNo`) give every corner the number of the
  official turn nearest its apex; a track without them keeps the corners counted from the laps.
- Your iRating and licence of every discipline (`ratings.go`, `ratings.json` in the account, `/api/ratings`): the game
  only says the one of the session you are in, so the PC keeps the last seen of each (every session, and from the
  recorded races, ir + irChange); Home's "Licence summary" (PC, web, Pitlane HQ Desktop; the phones' Licence summary)
  shows them per discipline with Community's symbols and colours (`DISC_IC`, `.c-*`; `DiscIcons.cs` on the Desktop),
  the change of the last races of each and one short line ("Updated when you join a session with iRacing and Pitlane HQ open"). Never one "current iRating" mixed
  from every discipline.
- Started with Windows (the installer's or Settings' "PitlaneHQ" Run entry, one only), PitlaneHQ.exe opens minimized
  and never brings an already open window forward.
- Race rivals named after the fact: the PC sends its race history's rivals once (`nameOldRivals`, `/rival-names`:
  matched by car, track and best lap; only Anonymous rivals this account shared).
- Wherever other drivers show (the relative and the standings in the overlays, the app and Pitlane HQ Desktop; the race
  summary on the PC, web and phones), the cars a lap or more up or down on you carry a red "+1L" pill (they lap you,
  or finished laps ahead) or a blue "−1L". The Community car list shows no counts.
- Leaderboards are by lap time, per discipline (Oval, Sports Car, Formula Car, Dirt Oval, Dirt Road),
  without license classes. The fastest lap of each car and track in an account is shared by itself
  (no "share" button), under the public name or as Anonymous. The discipline symbols are our own
  (`DISC_IC`), never copied; the same discipline cards are in Community and in "Choose a session".
- Analysis (lap analyzer and coach): "Choose a session" is a window (discipline, kind of session, car
  and track, a day you drove on the calendar, then the session) that opens by itself when you enter
  Analysis from another tab; the bars only show what is chosen; the car and the track are two
  filters. The phone apps filter their session list the same way. Laps A and B are one choice for the
  lap analyzer and the coach (`ANASEL`, a lap known by itself, not by its place in a list), with the same
  default and the model's references as B in both, each once ("▲ Next level", "★ Record"); with
  "+ Session" lap B is only the laps of the other session (and the references). The window's title
  and its × stay at the top while it scrolls. "MY BEST" goes after the time.
- Driver notes (like RaceLab's): your own marks on other drivers, one tag (dangerous, careful, clean, friend, our own
  icons: a red triangle, an amber circle, a green tick, a blue star) and a note only you see (`drivers.json` in the
  account, `drivers.go`, `/api/drivers`). A driver is known by the community's opaque key (`driverKey`, the races keep
  it as `k`; never their iRacing id) or by name for older races. The icon shows before the name in the relative and the
  standings (native overlays, the app, Pitlane HQ Desktop) and in the race summary, where you mark them (✎; the phone
  apps tap the driver and write the account's bundle); Analysis → My races lists them; the engineer warns you when a driver
  you marked dangerous or careful is within 1.5 s (Settings → Engineer, "A driver I marked…").
- Race rivals (the other drivers of your races, whose best laps your PC shares) show on the leaderboards with their
  first name and the initial of their last name ("Juan M.", `shortName` in journal.go, `shortDriverName` on the server),
  never the whole name; the public pages keep them Anonymous. When a driver's own signed-in PC sees them at the wheel
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
- Live in the web and phone apps: Connect/Disconnect for your own PC (presence only until Connect),
  and watching someone else with a share code made on the PC (Settings → Phone) or from the phone.
  The room is one hash of the code and the key a PBKDF2 of it, so the server never reads the
  telemetry; code viewers only watch (no DRINKS, no race summaries). Connect asks the PC first: a
  window there accepts or declines the device (by its name) and nothing is sent to it before you
  accept; an accepted device is remembered while Pitlane HQ runs. A declined device is not asked again by its automatic
  retries for two minutes, but pressing Connect again always asks the PC again (`again` in the hello). No Wi-Fi pairing panel and no
  encryption wording on the Live card. The Live page is: your PC, watch another driver (the code gets
  its dashes as you type), then the download, with the same gap between the boxes.
- No text about encryption or about everything sync does in the account, sync, Live or community
  screens (only notes the driver needs, like "your data does not need to be uploaded again"); the
  "How your data is protected" list in About is the one place that explains it.
- Emails go through Resend (domain pitlanehq.app, secret RESEND_API_KEY); Proton Mail's SMTP (`smtp.js`,
  bodies in base64) only when Resend is not set up, never after Resend refuses one (Proton's mail as pitlanehq.app
  fails SPF and DKIM, so Gmail bounces it); Admin → Server shows the last
  emails (Resend's delivery state) and checks the domain's SPF, Proton verification, DKIM, MX, DMARC and BIMI
  (`web/dist/bimi.svg`, the logo in SVG Tiny PS, needs DMARC at quarantine).
- The logo is the rev gauge with a kerb in the rev limit (`assets/logo.svg`, the master; `web/dist/logo.svg`).
  Its PNGs and ICOs (web/dist icons, assets/pitlanehq.ico and -1024.png, the phone apps' launcher icons)
  are rendered from it; the phone icons are the full square (no transparent corners).
- Emails look like the app (`mailHTML` in email.js: the logo from pitlanehq.app/icon-192.png, the dark
  card, the amber button), tables and inline styles only.
- SEO: index.html has the title, a short plain description, Open Graph/Twitter cards (`og.png`) and
  JSON-LD; robots.txt is in web/dist. Descriptions are short and plain, never hype. The public pages
  (`cloud/src/seo.js`, plain HTML, English and Spanish with hreflang): /iracing-telemetry and
  /es/telemetria-iracing, /records and /es/records, one page per car and track (one canonical address,
  301 for any other, 404 when it does not exist), the sitemap made by the server, IndexNow once a day. www.pitlanehq.app is a custom domain of the Worker
  (made by the deploy) that answers 301 to pitlanehq.app.
  They never show iRacing names: nicknames, or Anonymous.
- Signing in with an email that has no account says so and offers to create it (`no_account`).
- The welcome window of a new account (the downloads) stays until the driver closes it (`uiPanel` sticky).
- Leagues (in development, admins only until LEAGUES_OPEN=1): drivers post their league with a
  Discord invite, its schedule, cars and language.
- Admins: the admin panel (Account, on the PC, the web and the phones) has the overview, every
  account (member since, set by hand; the supporter badge; its profile; delete), the shared items,
  the leagues, the latest sessions, the server's emails and the tools (rebuild the coach models; the
  blocked sign-ins one by one, by email or all; per account: confirm its email, turn off its two-step
  sign-in, sign it out everywhere, rename it). Networks are only ever a hash of their address. An admin
  can see the app as a normal user on one device (the shield in the header, the admin panel, or
  Settings on the phones): everything for admins and in development hides until the admin view is back.
- The coach and the lap analyzer stay short: the coach is the gap, what to work on first, the plan,
  the map, the sectors and the corners that cost the most; the analyzer is the gap with its three
  key facts, the charts, the map, the sectors, the lap list and the braking points.
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
  dragged, resized or placed (`keepOnScreen`, `clampMove`). An overlay window draws only its own widget; only the
  radar's window hides itself when nobody is near. Every overlay is native UI drawn in Go, never WebView2 (its
  content is always opaque; a test checks every overlay in `overlayOrder`): `ovnative.go` (shapes, the app's own
  fonts embedded from `ovfonts/` (IBM Plex Sans, JetBrains Mono, Barlow Condensed, OFL), its colours, licence badges
  and pills; the live stream; radar, delta bar, relative, standings), `ovnative2.go` (flag, dash, timing, fuel,
  engine, tyres, inputs, DRS & push-to-pass, telemetry, g-force), `ovnative3.go` (stats, pit stop, mini-sectors,
  gaps, incidents), `ovnative4.go` (track map from `/api/map` or the community's layout, live compare, braking
  markers with the model's next level from `/api/community/model`, coach, radio) and `ovnative_windows.go` (a
  layered window with alpha per pixel and the overlays' opacity). Only the panel and its content show, the rest is
  see-through, every click goes to the game (the radio's buttons take clicks without taking the focus), and while
  moving the overlays they are dragged and resized from the corner. They scale with the window's width and fit
  their height to what they show (the map and the radar keep the window's). The radar is only your car's outline,
  the cars coming, the red side bar and the nearest distance. The windows that need laps record the ones they see.
  WebView2 is only the main window now, until it moves to C#/WPF (`desktop/PitlaneHQ.Desktop`) screen by screen
  (the owner's choice): its Home, Analysis (laps A/B with the model's references, the charts, `/api/desk/coach`), Telemetry,
  Overlays, Community (leaderboards), Account and Settings screens are native (WPF; Telemetry fed by `/api/desk`,
  `desknow.go`); the parts not moved yet (map, profiles, full settings) are the app in a WebView that runs hidden
  from the start (engineer, beeps and lap recording live there). Builds of other branches only check
  (nothing is published unless it is master). The app tells the PC its language and units (`/api/lang?l=&u=`), and the native overlays get
  both in the stream's config event, so they change at once.
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
- Sync is automatic and covers everything in the account: every app reads the account when it starts,
  when it comes back to the screen and every minute (the PC also a few seconds after any change), and
  changes from several devices are merged (`syncmerge.go`), never a "which copy" question. When the server
  answers "signed out" to the PC's token (`plSessionEnded`), the PC signs out by itself keeping the email and
  shows the sign-in screen with a note; a wrong password never signs it out. My account has "Sign out on this
  PC" and says when the PC could not sync. One
  public name per account: changing it anywhere changes it everywhere, shared laps included.
- Deleting your own account never deletes what the leaderboard shows or what the model learns from:
  those laps stay as an anonymous driver (`deleteAccount` in `cloud/src/accounts.js`); everything
  else of the account goes. Only an admin removing an account (abuse) removes its shares (`purgeAccount`).
- Uninstalling PitlaneHQ.exe removes everything it keeps on the PC (`[UninstallDelete]` in
  installer/PitlaneHQ.iss); nothing on the server is touched (the account, the leaderboards, the model).
- Analysis's sub-tabs: Laps, Coach, My sessions (`cloudlaps`, every session in the account) and My races (`races`, the
  race summaries with the driver notes); Home's "See all" opens My races. A finished race shows no notice on the PC
  (it appears in My races); only the phones tell you.
- Pitlane HQ never shows Windows notifications (nothing in the action centre; `notify` only logs, and the PC app
  schedules no browser notifications): what it has to say shows inside the app.
- PitlaneHQ.exe checks for updates every 30 minutes, notifies once per version and installs by
  itself when no sim is running (unless switched off in Settings → About).
- This repository is only the PC app (PitlaneHQ.exe, Go) and the web (`cloud/`, Cloudflare).
  The Android and iOS apps live in their own repository.
- One app everywhere: `web/dist` is the PC app and the web app at `/app` (computers and phones).
  Web scripts are loaded with relative paths.
- `master` is the main branch the builds come from (Windows and the server).
- The owner's name never appears in the code, the documents or the tests; the apps never link to
  GitHub: downloads and release notes come from https://pitlanehq.app (R2 bucket, `cloud/src/downloads.js`).
