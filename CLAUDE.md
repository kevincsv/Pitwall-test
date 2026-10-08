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
  Every version gets an entry in CHANGELOG.md (newest first) and a GitHub release.
- Every feature goes to the PC app, the web and the phone apps.
- DRINKS mode (formerly Friday night mode): admins only, on the PC or from the phone app.
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
- Driver profiles show the nickname only (never the iRacing name); anonymous laps open no profile and
  never show on one (admins see them). The supporter badge comes by itself to Patreon patrons with
  the same email (`/patreon/webhook`, secret PATREON_WEBHOOK_SECRET) or by hand from the admin
  profile (a manual one stays); a supporter can hide their own. Badges show wherever your name does.
  A main tab always opens on its first sub-tab.
- Live in the web and phone apps: Connect/Disconnect for your own PC (presence only until Connect),
  and watching someone else with a share code made on the PC (Settings → Phone) or from the phone.
  The room is one hash of the code and the key a PBKDF2 of it, so the server never reads the
  telemetry; code viewers only watch (no DRINKS, no race summaries). Connect asks the PC first: a
  window there accepts or declines the device (by its name) and nothing is sent to it before you
  accept; an accepted device is remembered while Pitlane HQ runs. No Wi-Fi pairing panel and no
  encryption wording on the Live card. The Live page is: your PC, watch another driver (the code gets
  its dashes as you type), then the download, with the same gap between the boxes.
- No text about encryption or about everything sync does in the account, sync, Live or community
  screens (only notes the driver needs, like "your data does not need to be uploaded again"); the
  "How your data is protected" list in About is the one place that explains it.
- Emails go through Proton Mail's SMTP (`smtp.js`, bodies in base64) or Resend; Admin → Server shows the last
  emails (Resend's delivery state) and checks the domain's SPF, Proton verification, DKIM, MX and DMARC.
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
  NASCAR 26, team mode, leagues, the overlays on top of the game, and the Data and Full telemetry views.
  Switched off for now: setups, per-car settings, the Data view and sharing race analyses.
  (`wipOk()`/`wipView()` in index.html, `wipAllowed()` in Go).
- Sync is automatic and covers everything in the account: every app reads the account when it starts,
  when it comes back to the screen and every minute (the PC also a few seconds after any change), and
  changes from several devices are merged (`syncmerge.go`), never a "which copy" question. One
  public name per account: changing it anywhere changes it everywhere, shared laps included.
- Deleting your own account never deletes what the leaderboard shows or what the model learns from:
  those laps stay as an anonymous driver (`deleteAccount` in `cloud/src/accounts.js`); everything
  else of the account goes. Only an admin removing an account (abuse) removes its shares (`purgeAccount`).
- Uninstalling PitlaneHQ.exe removes everything it keeps on the PC (`[UninstallDelete]` in
  installer/PitlaneHQ.iss); nothing on the server is touched (the account, the leaderboards, the model).
- PitlaneHQ.exe checks for updates every 30 minutes, notifies once per version and installs by
  itself when no sim is running (unless switched off in Settings → About).
- This repository is only the PC app (PitlaneHQ.exe, Go) and the web (`cloud/`, Cloudflare).
  The Android and iOS apps live in their own repository.
- One app everywhere: `web/dist` is the PC app and the web app at `/app` (computers and phones).
  Web scripts are loaded with relative paths.
- `master` is the main branch the builds come from (Windows and the server).
- The owner's name never appears in the code, the documents or the tests; the apps never link to
  GitHub: downloads and release notes come from https://pitlanehq.app (R2 bucket, `cloud/src/downloads.js`).
