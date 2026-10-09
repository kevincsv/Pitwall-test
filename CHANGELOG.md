# Changelog

Pitlane HQ is in **beta**. PitlaneHQ.exe, the web app and the phone apps share one version
number: `0.MINOR.PATCH`. A MINOR version is a set of new features; fixes ride along as "Fixes and
improvements". 1.0.0 comes when the beta ends. Newest first.

## 0.9.1 beta

- **Your licence in the licence summary**: the class and safety rating of each category, in the licence's colour,
  once you join a session of it with iRacing open.
- Race charts with bigger points; a lap that does not count (off track) is an empty ring.
- The radar moves the cars around you smoothly, shows three wide as it is, and a car that passes you moves back
  into line little by little.
- Fixes and improvements.

## 0.9.0 beta

**Added**
- **Overlays for everyone.** Every overlay on top of the game is drawn by Pitlane HQ itself, sharp and light:
  relative, standings, radar, delta bar, track map, fuel, tyres, inputs, flags, timing, pit stop, gaps, the coach
  and more. Presets (four built in and your own), Auto (they open when you get in the car) and your settings saved
  in your account. Their settings show the live preview next to them, with sample data until the game sends data.
- **The coach reads your racing line**: where your car was on the track against the lap you compare with. It
  tells you when you brake at the same point but on the wrong part of the track, turn in too far inside, miss the
  apex or do not use the whole track on exit, in metres. Against a rival's lap it uses the fastest line known.
- **Track maps like iRacing's**: a road with depth, both laps' lines, the official turn numbers (T1 … T16 at Fuji)
  and the direction of the lap, on the PC, the web, the phones and the map overlay.
- **Licence summary on Home**: the iRating of each category on its own (never one number mixed from all of them),
  with what your last races in it gave. It updates when you join a session with iRacing and Pitlane HQ open.
- **Driver notes**: mark any driver as dangerous, careful, clean or a friend, with a note only you see; their
  icon shows in the relative, the standings and the race summary, and the engineer warns you when a marked driver
  is close.
- **"+1L" / "−1L"** next to the cars a lap or more up or down on you, wherever other drivers show.

**Changed**
- The game is found as soon as it starts, and Auto overlays open the moment you get in the car.
- Started with Windows, Pitlane HQ opens minimized; it sends no Windows notifications.
- Race rivals on the leaderboards show their whole name, as the game shows it; when they join Pitlane HQ their laps
  go to their account.
- The radar shows the cars around you at 60 frames a second, and a car beside you keeps its side.
- Analysis has "My sessions" and "My races" (your race summaries); "See all" on Home opens My races.
- The main menu is Home, Analysis, Telemetry, Overlays, Community and Account.

**Fixed**
- A race's real iRating only comes from your next session of the same category.
- Fixes and improvements.

## 0.8.0 beta

**Added**
- **Community by discipline**: leaderboards for Oval, Sports Car, Formula Car, Dirt Oval and Dirt Road, with your
  fastest lap of each car and track shared by itself, under your nickname or as Anonymous.
- **Driver profiles** with their recent races and a calendar of the days they drove, and a supporter badge that
  Patreon supporters get by themselves.
- **A coach model that learns from everyone**: every real lap of a car and track, yours and your race rivals',
  with real reference laps (the record and the driver just ahead of you), never a made-up "ideal" lap.
- **The car card**: what each car does on every track (hardest braking, where the fast drivers shift, top speed).
- **Braking beeps** from the coach model: one or three beeps before each braking point, earlier with traffic.
- **Choose a session**: one window to pick the discipline, the kind of session, the car, the track and the day,
  for the lap analyzer and the coach, with the same laps A and B in both.
- **Your account syncs by itself** on every device (when it starts, when you come back and every minute), and
  changes from several devices are merged instead of asking which copy to keep.
- **Watch another driver's live telemetry with a code**, and connect your phone to your PC with one button (the PC
  asks you to accept it first).
- **Two-step sign-in, email confirmation and a welcome window** with what to install.
- **Pitlane HQ Desktop (preview)**: the native Windows app, with Home, Analysis, Telemetry, Overlays, Community,
  Account and Settings.
- A new logo, emails that look like the app and public pages with the records of every car and track.

**Changed**
- Live is called Telemetry, and Overlays has its own tab on the PC.
- The coach and the lap analyzer are shorter: the gap, what to work on first, the plan, the map and the corners
  that cost the most.
- Signing in with an email that has no account says so and offers to create it.
- Fixes and improvements.

## 0.7.0 beta

**Added**
- **Unique nicknames**, and your choice of name (nickname, iRacing name or Anonymous) before you share anything.
- **The coach model** learns on the server from every valid lap as soon as it arrives, old laps included, and
  never forgets.

**Changed**
- Fixes and improvements.

## 0.6.0 beta

**Added**
- **Days you drove** on Home, like a calendar of the last six months.
- **Filters in My races**, and your fastest lap ever marked everywhere.
- **Two-step sign-in** and a notice when a new version is out.
- Race charts you can hover or touch.

**Changed**
- Pitlane HQ lives at https://pitlanehq.app and installs with PitlaneHQ-Setup.exe.
- Laps that do not count are grey and crossed out.
- Fixes and improvements.

## 0.5.0 beta

**Added**
- **Track maps draw themselves** from your laps, with the sectors, the braking points of both laps, the coach's
  corners and the incidents, and you can hover or touch them.
- **Incidents on every lap**, named as the game does (off track, loss of control, light contact, contact), with
  their points.
- Home is where the app opens, on every device; Pitlane HQ needs your account.

**Changed**
- One map everywhere: the lap analyzer, the coach and the race summary.
- Fixes and improvements.

## 0.4.0 beta

**Added**
- **The coach**: a plan for your next session, and a corner-by-corner reading of braking, entry, apex and exit
  inside the lap analyzer.
- The lap analyzer has one panel per channel, with its readout, the sectors on every chart and a map of where you
  gain or lose.

**Changed**
- Fixes and improvements.

## 0.3.0 beta

**Added**
- **One version** for the PC app, the web and the phone apps, shown with "beta", and this changelog.
- **My races**: every race in your account, opened in the lap analyzer or the coach.
- **Sharing with the community** from your account with one switch, and race summaries with their incidents.
- **DRINKS mode** (admins): friends drive on your PC and their laps go under their own name.
- Downloads of the Android and iPhone apps, and support on Patreon.

**Changed**
- Fixes and improvements.

## 0.2.0

**Added**
- **The community**: share your lap times, lap traces and race analyses if you want, and compare with them in the
  lap analyzer.
- **Your Pitlane HQ account**, its laps uploaded by themselves and everything you keep synced between devices,
  with password reset and email confirmation.
- **A race summary after every race**.
- **The website** with sign-up and downloads in English, Spanish, German and Portuguese, and the whole app on the
  web.
- Every iRacing track and car with its picture.
- The installer for Windows, which removes everything it installed when you uninstall it.
- **The phone apps without the PC**: your races and iRating on Home, the lap analysis, the community and the
  settings, in English and Spanish, also offline.

## 0.1.0

The first build of Pitlane HQ:
- **Live telemetry from iRacing** on the PC, with widgets you place and resize, and overlays on top of the game.
- **Lap comparison** with exact deltas, and a braking coach.
- **Race reports**, braking markers, a shift beep for each car and notes for every track.
- **A calendar** of your races, with a reminder five minutes before each one.
- **The first iPhone and Android apps**: live telemetry from your PC on the phone.
