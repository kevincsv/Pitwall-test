# App screens: Home, Analysis, notes, navigation

How this part of Pitlane HQ behaves. Read it before changing this area; keep it up to date when the behaviour changes.

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
- Wherever other drivers show (the relative and the standings in the overlays, the app and Pitlane HQ Desktop; the race
  summary on the PC, web and phones), the cars a lap or more up or down on you carry a red "+1L" pill (they lap you,
  or finished laps ahead) or a blue "−1L". The Community car list shows no counts.
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
- Driver profiles show the nickname only (never the iRacing name); anonymous laps open no profile and
  never show on one (admins see them). The supporter badge comes by itself to Patreon patrons with
  the same email (`/patreon/webhook`, secret PATREON_WEBHOOK_SECRET) or by hand from the admin
  profile (a manual one stays); a supporter can hide their own. Badges show wherever your name does.
  A main tab always opens on its first sub-tab. The main menu: Home, Analysis, Telemetry (was Live; the
  same name in the phone apps), Overlays (its own tab, only on the PC), Community (just before Account) and Account. No text calls the section
  "Live" any more ("Telemetry → …"). Telemetry → Phone & sharing on the PC: your phone or tablet (pitlanehq.app or
  the app, same account, Telemetry → Connect, accept on the PC; a QR to the web app and the Android download) and
  sharing with a code; no Wi-Fi addresses, PIN or local links (`renderPhoneHow`).
- The welcome window of a new account (the downloads) stays until the driver closes it (`uiPanel` sticky).
- Home, clean data (`homeCleanHTML`, signed in): the greeting and the PC's state, four numbers (the laps and the hours on track
  this month, from the account's sessions, the races this month and the best result), your last race (its place against the
  start, its position lap by lap, the iRating, incidents and best lap; Race summary and Analyse my laps), the recent
  sessions (races and the other sessions together, tagged Race, Qualifying, Practice, Test drive, vs AI and DRINKS), the
  licence summary (each discipline with "iRating" over its numbers; the chosen one draws its iRating over your races)
  and the days you drove. Each block of Home and Community sits on a card (the downloads' surface and border) for depth.
  The four numbers (`/api/sessions/summary`, sessionsum.js) and the session list (`/api/sessions`) read only the
  account's sessions (index `sessions_uploader_started`) and never their laps: each session keeps its lap count, best,
  time on track and friends' names (`SESSION_SUMS` on every change, all of them again once a day, migration 0078),
  because every open app asks about once a minute and D1 limits the rows read per day.
- Analysis's sub-tabs: Laps, Coach, My sessions (`cloudlaps`, every session in the account) and My races (`races`, the
  race summaries with the driver notes); Home's "See all" opens My races. The phone apps have the same four (and
  Telemetry, Standings and Tyres under Telemetry). A finished race shows no notice on the PC
  (it appears in My races); only the phones tell you.
