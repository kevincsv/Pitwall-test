# Changelog

Pitlane HQ is in **beta**. PitlaneHQ.exe, the web app and the phone apps share one version
number: `0.MINOR.PATCH`. PATCH for fixes, MINOR for a set of new features, and 1.0.0 when the
beta ends. Every version is listed here, newest first, and gets a release on GitHub.

## 0.8.21 beta

**New**
- **Public pages for search engines**, plain HTML in English and Spanish: what Pitlane HQ does
  (`/iracing-telemetry`, `/es/telemetria-iracing`, with questions and answers), the iRacing records by
  car and track (`/records`, `/es/records`, by discipline) and one page per car and track with its 50
  fastest drivers (nicknames only; anonymous laps and race rivals as Anonymous).
- The sitemap is made by the server with every one of those pages, and new records are sent to Bing and
  the others through IndexNow once a day. Wrong addresses of a record page go to the right one (301);
  addresses that do not exist answer 404.
- The sign-in page links to "How it works" and to the records.

## 0.8.20 beta

**New**
- **A new logo:** a rev gauge whose last part is a kerb, with the needle in the rev limit. It is the
  icon of PitlaneHQ.exe and its installer, the web (favicon, home screen), the Android and iOS apps,
  the header and the loading screen.
- **Emails that look like Pitlane HQ:** the logo and name on top, the dark card, the amber button, the
  link written out below it and who to write to (confirm your email, reset your password, test).
- **Search engines and shared links:** a title and a short description, the picture shown when a link
  to pitlanehq.app is shared, robots.txt, a sitemap and the app described for Google.

**Changed**
- The sign-in page says plainly what Pitlane HQ does.

## 0.8.19 beta

**Changed**
- Emails go through Resend first (the domain pitlanehq.app, with its own DKIM and SPF on `send`) and
  through the Proton mailbox only when Resend is not set up or refuses one; Admin → Server checks
  Resend's records too and shows which way each email went.

## 0.8.18 beta

**New**
- Admin → Server → Emails checks the sender's domain for Proton Mail: one SPF record that includes
  Proton, Proton's verification record, the three DKIM keys, the MX records (and whether Cloudflare
  Email Routing is in the way) and DMARC, each with what it has now and what it needs.

**Fixed**
- Emails sent over SMTP (Proton) carry their text in base64, so no line is ever too long for a mail
  server on the way.

## 0.8.17 beta

**New**
- Signing in with an email that has no account says so ("There is no account with this email") and
  offers to create it with the same email (web, PC and phone apps).
- Admin → Server: the last emails sent and what happened to each one (delivered, bounced, marked as
  spam, delayed), as Resend reports it, to find out why an email does not reach an inbox.

**Fixed**
- A new account's welcome window (with the downloads) no longer disappears right after signing in:
  it opens a moment later, a tap outside does not close it, and it only counts as seen once you close it.

**Changed**
- Live: "Watch another driver" comes before "Download Pitlane HQ", with the same space between every
  box; the share code gets its dashes by itself as you type.
- My account is centred on wide screens, and says nothing about what syncs or how it is encrypted
  (only what you need, like "your data does not need to be uploaded again").
- "Compare with the community" is always in the lap analyzer, like in the coach.
- Community: just "the fastest lap of every driver…", without "every lap saved in an account counts".
- Leagues (in development): no "Read the news" button.
- Phone apps: the Analysis filters are four small menus (discipline, kind of session, car, track) and
  the days you drove open from a button, instead of long rows of chips; a track or car whose name
  came with broken accents ("AutÃ³dromo") is shown right and only once.

## 0.8.16 beta

**New**
- **The car card.** One per car, learnt by the server from the car's real laps on every track it was
  driven on: the hardest braking the drivers get out of it, the speeds the fast drivers shift up at in
  every gear, and its top speed (and where). The coach shows it against your lap when nobody known is
  ahead of you on this car and track (nobody drove it here yet, or you are the fastest): what the car
  does elsewhere, as a hint of what is left. The phone apps show it in the lap analysis. It never
  replaces the record or the driver just ahead, and it is no theoretical lap: real laps only.
- Admin: the overview counts the cars and tracks the model knows and the car cards.

**Fixed**
- Lap analyzer: with "+ Session" on, lap B is only the laps of the other session (and the model's
  references), not the laps of session A again; the coach does the same.
- The next level and the record show once each in lap B ("▲ Next level", "★ Record"), not twice
  with two names.
- "Choose a session": the title and the × stay at the top while you scroll the window (phones and
  computers), and a filter keeps where you were in the list.

## 0.8.15 beta

**New**
- **One choice of laps for the lap analyzer and the coach.** Laps A and B picked in one are picked
  in the other, and both start the same way (your last valid lap against the next level, or your best
  lap); the model's references (next level, record) are lap B in both.
- **The car and the track are two filters** in "Choose a session" (and in the phone apps): with many
  cars and tracks the list of every pair was hard to read.
- **Admin:** an Admin / Normal user switch at the top of the admin panel and in Settings → About; an
  Activity tab (the latest sessions uploaded); for each account: confirm its email, turn off its
  two-step sign-in (a lost phone), sign it out everywhere, rename it (an offensive name), unblock it;
  the blocked sign-ins listed one by one, with unblock one, unblock an email, or everything.

**Changed**
- "MY BEST" goes after the time in the lap lists (A and B), like the rest of the lap.
- Deleting your account says that the data on your PC stays until you uninstall Pitlane HQ, and
  uninstalling removes all of it from the PC (the account, the leaderboards and the coach model on the
  server are not touched).

**Fixed**
- Admin → Shared: the filter works as you type (and by kind), names show their accents, and Delete no
  longer covers the text; the same in the tools.

## 0.8.14 beta

**New**
- **"Choose a session" in Analysis.** The lap analyzer and the coach open a window to choose what to
  analyse: the discipline, the kind of session (races, qualifying, practice, test drives), the car and
  track, a day you drove on the calendar, and then the session itself (newest first, with its best lap).
  It opens by itself when you enter Analysis; the bar at the top only says what is chosen.
- **Your PC accepts or declines Connect.** When your phone or a browser of your account presses
  Connect, Pitlane HQ on the PC asks you in a window (with the device's name); nothing is sent to it
  before you accept. A device you accepted is remembered while Pitlane HQ runs.
- **A bigger admin panel**, now also on the PC: an overview (accounts, activity, leaderboards, leagues,
  supporters and Patreon, the coach models, what is set up), every account with its id, its "in
  Pitlane HQ since" date (set by hand), its profile and the supporter badge, the shared items with a
  filter, the leagues, the server's emails, and tools to rebuild the coach models and unblock sign-ins.
- **See the app as a normal user** (admins): the shield in the header (or the admin panel) hides
  everything for admins and in development on that device, to test what everyone sees; a bar at the
  top takes you back.

**Changed**
- Live: no more "Or straight over your Wi-Fi" panel, and the Live card no longer talks about
  encryption: it says whether your PC is online and offers Connect.

**Fixed**
- A PC that stopped while it saved its account (a crash, a power cut) could come back signed out: the
  account file is now replaced whole, never left empty.

## 0.8.13 beta

**Fixed**
- **Pitlane HQ stayed on the loading screen** (PC and web) for whoever had chosen several race
  reminders before 0.8.12: the page left one reminder while it started, the profile brought all of
  them back and the page reloaded for ever. The saved choice is no longer rewritten when it starts
  (the earliest reminder is used until you pick one), and a start never reloads twice in a row.

## 0.8.12 beta

**New**
- **Watch another driver's live telemetry with a code.** On the PC (Settings → Phone) or from your
  phone while it watches your PC, "Get a code" makes a code like ABCD-EFGH-JK; whoever types it in
  Pitlane HQ (web or phone) → Live → Watch another driver sees your telemetry from anywhere, read
  only. A new code stops the old one; "Stop sharing" ends it. The server can neither read the
  telemetry nor find the code (its room is one hash of the code, the key another one).
- **Live on the web and the phones: Connect and Disconnect.** The screen shows whether your PC is
  online and connects only when you press Connect (it stays connected until Disconnect); the
  download of the PC app is right under it.
- **Leagues** (in development, admins only): a menu to explore the leagues by discipline, post
  yours with a direct link to its Discord (and its website, schedule, cars and language) and edit or
  remove the ones you posted. Everyone else still reads that we are working on it.
- **The supporter badge comes by itself** to the people who support Pitlane HQ on Patreon with the
  same email as their account (also when they create the account later); a badge given by hand
  stays. The badge shows next to your name everywhere: Home, Settings, your account and your profile.
- **Profiles:** each lap on the leaderboards opens its leaderboard with that driver marked and says
  their place (P3 / 14); the profile shows the days they drove, like Home.
- **The lap analyzer and the coach use the same discipline selector as Community**, with the
  disciplines you have no session in greyed out.

**Changed**
- **Leaderboards without license classes**: only the fastest drivers of each car and track of the
  discipline. The discipline symbols are our own.
- **The account tab in order**: your name and badges on top, with your email and account id hidden
  until you press Show (one button each); security on one side, sync and devices on the other, and
  everything for admins in one panel (shared items, accounts, server, test email).
- **One race reminder at a time** (5, 15, 30 or 60 minutes before).

**Fixed**
- Choosing a discipline with no laps yet in Community broke the screen ("This screen could not be
  drawn"); it now says the discipline has no laps yet.
- What's new in Settings stayed on "…": the server did not hand the notes to the web.

## 0.8.11 beta

**New**
- **Leaderboards by discipline and license.** Community opens on the five iRacing disciplines (Oval,
  Sports Car, Formula Car, Dirt Oval, Dirt Road) with how many cars, tracks and laps each has. Each
  leaderboard is by lap time, shows every driver's license class with the colours of the sim and
  can be filtered by class (R, D, C, B, A, Pro); a driver keeps their place in the whole board.
- **Your fastest lap is shared by itself.** As soon as a lap is saved in your account, the fastest
  of each car and track goes to the leaderboard, with its telemetry, under your public name (or as
  Anonymous if you chose so). "Share from your account" is gone. The laps already in the accounts
  were added when the server updated.
- **Driver profiles.** Tap a driver on a leaderboard: their nickname (never the iRacing name), their
  license class in each discipline, their recent races (position, places gained, incidents, iRating,
  best lap) and their laps on the leaderboards. Yours is in Community → My profile (and in the
  phone apps' Account). Anonymous laps open no profile and never show on one; only the admins see
  them.
- **Supporter badge.** People who donate get a ♥ Supporter badge next to their name, given and taken
  away by hand from the admin profile; a supporter hides or shows it with one click on their profile.
- **Leagues** (in development): a new Community tab. Admins see what is coming; everyone else reads
  that we are working on it.
- **The coach and the lap analyzer filter your sessions**: first the license (discipline), then the
  car and track, then the session; a line under the controls says which car, track, discipline and
  license class you are looking at.

**Fixed**
- **The coach says when you are the fastest.** With your best lap being the record of the car and
  track, the record and the next level stayed empty; now the coach says you are the fastest among
  the drivers it knows (on the phones, the leaderboard says it).
- **Incidents in race summaries made before 0.8.7.** Races summarised by an older PC showed no
  incidents while the analyzer had them: the summaries are completed from the account's laps of
  that race (per lap and where on the lap) and saved in the race history, so every device shows them.
- **Test drives never teach the model nor go to the leaderboard**: anything can happen in one. Only
  practice, qualifying and race laps count, and for the model only sessions of official series
  (hosted, league and AI sessions still show on the leaderboard). What the model learnt from test
  drives before is forgotten.
- **A main tab always opens on its first sub-tab** (Home, Analysis, Community…): where you were last
  time is no longer kept.
- The discipline of road "Cup" cars (MX-5 Cup, Porsche Cup) was taken as oval.

## 0.8.10 beta

**Fixed**
- **Your account syncs by itself, everywhere, with everything in it.** A public name changed on the
  phone did not reach the PC (it read the account every 6 hours and never the name) nor the other
  browsers. Now the PC reads your profile and syncs when it starts, every minute, when its window
  comes back and a few seconds after anything synced changes on it; the web does it when it opens,
  when it comes back to the screen and every minute; the phone apps when they open and every time
  they come back to the screen. What is synced: your public name (and anonymous or not), settings,
  layouts, overlays, per-car settings, setup notes, race history, track notes, calendar and, new,
  what you chose to share (so every PC shares the same way; the web shows it too).
- **No more "which copy do you keep?".** When two devices change things at the same time, the
  changes are merged: setting by setting, race by race (a race recorded on one PC and a race
  deleted on the phone both count); the same setting changed on both goes to the newer change.
  A PC that signs in to an account takes the account's settings and adds its own races.
- **One public name per account.** Changing your name in the PC's community settings changes the
  account's (it used to stay on that PC); laps shared under your name show the new one, also when
  you switch between nickname and iRacing name; and the laps a PC shared with its own token before
  it signed in (an older version, or before the account existed) move under your account and its
  name, keeping the faster lap of each car and track.
- **Updates on the PC come by themselves.** PitlaneHQ.exe looked for a new version once every 12
  hours and its notification never came from the app (it looked for a shortcut with the wrong
  name). Now it checks every 30 minutes (and whenever the window asks), shows a Windows
  notification once per version and the banner in the app, and installs the new version by
  itself as soon as no sim is running; Settings → About has the switch to install only with
  Update now. This version still has to be installed by hand once: from it on, they come alone.
- The race summary's map no longer ends with the long note about T1, T2…, braking and the purple
  ring.

**Changed**
- **Deleting your account keeps the leaderboard and the coach model whole.** Your account, email,
  synced data, devices, race analyses and setups go; your laps on the leaderboard (with their
  telemetry) and the laps the model learns from stay, as an anonymous driver without your name.
  An admin removing an account (abuse, spam) still removes everything it shared. The privacy notice
  and the delete button say so.

## 0.8.9 beta

**Changed**
- **A shorter coach.** The coach is now the gap to the reference, what to work on first, the plan
  for the next session, the map, the sectors and the three corners that cost the most (a button
  shows them all). The phase bars, the "over the session" panel and the long notes are gone; the
  plan already says what they said.
- **The model has no panel of its own.** The "The model" block under the coach and the analyzer
  is gone. What it said that matters is in the coach now: the record, the next level (the driver
  just ahead) and your pace among the drivers known for that car and track, learnt from everyone's
  real laps. The record and the next level are offered directly as lap B in the coach and in the
  analyzer, and the next level is the coach's default reference whenever someone is ahead.
- **A shorter lap analyzer.** The summary is the gap and three facts (the corner that costs the
  most, where lap A falls furthest behind, where it gains most); the corner cards moved to the
  coach, where a new "Plan in the Coach" button opens the same two laps.



## 0.8.8 beta

**Fixed**
- **Coach, as it is shown.** The sector table fits on a phone screen (columns B and Diff. were off
  the edge). The coach and the lap analyzer use the same sector times: the game's when both laps
  have them, otherwise thirds of the lap from the traces, and the coach says so when there are
  none. The reference in the lap selector shows its name ("Record", "Next level") instead of an
  empty label, lap A starts as your last valid lap (in the analyzer too), the next-level reference is always a lap
  really ahead of yours (never your own lap at +0.000), and the time to gain of each plan item no
  longer wraps or gets cut on narrow screens.
- The phone apps' session screen shows the average of the valid laps instead of a lap made of the
  best sectors: one model, from real laps, no theoretical lap anywhere.

## 0.8.7 beta

**Added**
- **The community learns from everyone you race against.** After a race, the best lap of every other
  driver of your class goes to the community as an anonymous driver: time, sectors and the speed
  trace their position on track gave (iRacing sends nobody else's pedals, so those are estimated
  from the speed and labelled as such). The coach model, the leaderboard ("rival of a race") and
  the comparisons use them. One anonymous driver per real driver; switch in Settings → Community.
- **Races without a report are rebuilt from the saved laps**: a race the PC recorded laps for but
  wrote no summary of (the app closed before the flag, an older version) appears in My races as
  a reconstructed summary: laps, incidents, fuel, best lap and consistency, without positions.

- **One model, from real laps.** The community model, the coach's reference and the "ideal" rows were
  separate things with different numbers. Now there is one model per car and track, learnt from
  every real lap it knows (yours, shared or not; the shared ones; your race rivals'), and its
  references are real laps: the record (the fastest lap really driven) and, for your pace, the lap
  of the driver just ahead. The coach compares against that lap by default, Analysis offers the
  same two references, the lap list no longer invents an "ideal" from best sectors, and the race
  summary drops its theoretical lap. It also says where your pace stands among the drivers it knows.
- **Rivals on the leaderboard only when faster than you and with their trace**; the others (slower,
  or whose lap the PC did not see whole) teach the model unseen.

**Fixed**
- **The real iRating change replaces the estimate.** When you join the next session, iRacing shows
  your new iRating; the difference with the one you had in the last race is what it really gave
  or cost, and the summary says "real" instead of "est.".
- **One story for incidents**: the race summary takes its incidents, lap by lap, from the lap
  recorder (what Analysis and the coach show), instead of counting them on its own.
- **"Compare with" in the race summary lists the drivers in finishing order.**
- Reports carry the Pitlane HQ version that wrote them, to tell old ones apart.

**Removed**
- **The Garage 61 import.** What it brought (sessions, laps, leaderboard laps and the model's
  memory of them) is removed from the server; the models of those cars and tracks are rebuilt.

## 0.8.6 beta

**Added**
- **The top 3 of each race go to the community, anonymously.** After a race, the best lap of each
  of the top 3 of your class (you aside) goes to the leaderboard as an anonymous driver: lap time
  and sectors only, no name and no telemetry (iRacing sends nobody else's). One anonymous driver
  per real driver, so their faster lap of a later race replaces the earlier one. It needs your
  account and that you share your own laps; it has its switch in Settings → Community.
- **The Garage 61 import also shares your best laps**: for every car and track it imports, your
  best lap (with its telemetry when Garage 61 had it) goes to the leaderboard under your nickname;
  a faster lap you shared before stays.

**Fixed**
- **The Garage 61 import works with the real Garage 61** (already on the server): it lists laps
  per track (Garage 61 takes no other way), 40 tracks per request out of its 479, and when
  Garage 61 asks for a pause it waits and goes on from the same lap; the progress shows the
  track group and the pause.
- **Garage 61 laps are filed under their own track and car** (with several tracks per request a lap
  whose track came in another shape was filed under the group's first track), one session per
  track, car and day; and the admin profile has "Delete import" to undo a Garage 61 import
  (its sessions, laps and the leaderboard laps that came from them) and run it again clean.
- **Garage 61 laps look like laps recorded with Pitlane HQ**: the telemetry keeps the track's shape
  (from Lat/Lon or from yaw and velocity), so the analyzer draws its map; the kind of session
  (practice, qualifying, race), temperatures, incident points, whether the lap was clean, its
  number and the fuel it used come along; dirty laps stay out of the leaderboard and the model.
- **The coach model uses up to 10 laps of a lone driver** (3 when there are three or more), so one
  driver's Garage 61 history gives a steadier ideal lap.
- **Your own laps and analyses are marked "you" on the web too**: the web did not send your
  session when reading the leaderboard, so the server could not tell which were yours.
- **The race summary's table shows each driver's sectors** of their best lap when the PC saw the
  lap whole (thirds of the lap, like yours).

## 0.8.5 beta

**Fixed**
- **The estimated iRating change was biased.** It summed the chance of each rival beating you
  instead of the chance of you beating each rival, so drivers below the field's level were
  over-penalised and those above it flattered (a −43 that iRacing settled as −28). The known
  formula is applied the right way round.
- **Your own laps and analyses are marked "you" in the community lists**, also the anonymous
  ones (only you see that mark), on the PC, the web and the phones; the separate "You" row
  appears only when your best lap is not shared.
- **The race summary's table showed 0 incidents for everyone.** iRacing leaves the incidents of
  its results at 0 while the session runs; the table now takes each driver's own count (the
  team's in a team race) and, for you, what was counted during the race.
- **The Garage 61 import stopped with "HTTP 400".** Garage 61 only lists laps per track, so the
  import now walks its track list (one query per track, shown as "track 12/310" while it runs),
  takes the token with or without "Bearer" in front, and shows Garage 61's own reason when
  something else fails.

## 0.8.4 beta

**Fixed**
- **The lap list showed its sector times stacked in boxes** (0.8.2 gave the sector strip the same
  class name as the table's sector cells). The list also no longer stretches across an ultra-wide
  window.
- **Sharing never waits for the ids any more.** A lap of a session recorded without iRacing's track
  and car ids is shared anyway: the ids come from your own newer sessions or what others shared,
  and if nobody recorded that track and car with its ids yet, provisional ids made from the names
  are used and replaced everywhere by the real ones the first time a session brings them.

**Added**
- **Import my laps from Garage 61** (admin profile → Server, on the web): once, every lap of
  yours in Garage 61 with its telemetry goes into your account like laps from the PC, and the
  coach model learns them. The token is used for the import only and never stored. (Server fix
  the same day: when Garage 61 refuses a request, its own reason is shown, and plainer requests
  are tried.)

**Changed**
- **DRINKS mode is a bounded card** (text and controls on the left, its state on the right)
  instead of a strip across the whole window, on ultra-wide and normal screens alike.
- **Bigger top menu on every computer**: the labels were shrunk to 12.5 px on the most common
  window widths and hidden under 1180 px; now they stay readable and are hidden only under
  1000 px, where the brand shrinks to its mark so the header stays on one row.

## 0.8.3 beta

**Fixed**
- **Live telemetry on the web and the phones works again.** Since 0.6.1 the server rewrapped every
  answer to add its security headers, and that broke the live connection (a WebSocket): the web and
  the phones could not connect to the PC's live view. It now passes through untouched.

**Changed**
- **The coach model's map is the analyzer's map**, with everything it has (corners, sectors, your
  braking points and the reference's, incidents, coach tips, green and red where you gain and lose,
  and hover or touch to read a point), here your lap against the model's next level for your pace.
  It is the same model in Analysis and in Coach.

## 0.8.2 beta

**Fixed**
- **The coach model ignores laps that do not add up.** A lap whose telemetry does not give back its
  time (it started part way round: out of the pits, a reset) or that does not fit the other laps
  (another layout, a part impossibly faster) no longer makes the ideal lap faster than any real one.
- **Old sessions are matched to a car and track by the exact name and layout.** 0.7.2 used the track
  name alone, so sessions of another layout could end up in a model; those are undone.
- **"My best lap" in the analyzer** skips laps whose telemetry does not add up to their time.
- **Sector times are right**: they are the game's own (the same as the lap table); a lap whose first
  points still carried the previous lap's clock showed a negative S1.
- **Diagnostics and the connection center close with their ×** (it never found the window, so the
  app had to be closed), the full report opens and stays open, and "Copy report" works. They also
  close with Escape or a click outside.
- **The alerts panel has an X** to close it, next to "Clear all".

**Changed**
- **Analysis takes less room**: the sectors are a strip of four boxes (S1, S2, S3, lap) and the lap
  list uses the whole width; the braking points table is compact.
- **Settings shows a proper account card**: name, email, whether the email is confirmed and
  two-step sign-in is on, the public name you use, this device, the last sync, and the buttons to
  manage the account or sign out.

## 0.8.1 beta

**Changed**
- **Pitlane HQ Desktop (preview) comes as an installer**, PitlaneHQ-Desktop-Setup.exe, with
  everything inside. Its menu is the same as everywhere: Home, Analysis, Community, Live,
  Account and Settings ("My races" opened an old screen).

**Fixed**
- **A screen that fails to draw says so** with the error, instead of staying blank, so it can
  be reported and fixed.
- **The coach model recognises your account laps** on tracks and cars nobody shared yet.

## 0.8.0 beta

**Added**
- **Confirm your email before signing in.** A new account gets an email with a link; it signs in
  once the link is opened. "Send it again" sends a new one. Accounts made before this keep
  working. If the email cannot be sent, the account still signs in so nobody is locked out.
- **Welcome popup that fits the device**: what to install on the PC app, Windows, Mac or Linux,
  Android and iPhone (with how to add the web to the home screen).
- **Admin profile:** delete an account (with its synced data, laps and shares), and a Server
  tab with the state of the emails, the last email error and the numbers of the platform.

**Changed**
- **Sign out is in Settings** on every device.
- **Every popup has an X** to close it.
- **Light theme with a purple accent**, and the fastest laps and sectors in green there so they
  do not look like it.

**Fixed**
- **Signed-in devices name the right browser**: Firefox, Chrome and Edge on iPhone showed as
  Safari; the list now also says the system (Windows, Mac, iPhone, Android…).

## 0.7.2 beta

**Fixed**
- **Laps from before the model keep teaching it.** Sessions recorded before the PC sent the
  iRacing ids of the track and car are recognised by name, so laps that already worked are
  learnt too. Every car and track with laps gets its model, even if nobody opened it yet.

**Changed**
- **The model never forgets.** Every lap that teaches it is kept in its own anonymous memory
  (no account, no name), in its original telemetry. A new version of the model relearns from
  all of it, and if a lap is later deleted, what the model learnt from it stays.

## 0.7.1 beta

**Changed**
- **The coach model learns on the server** from every valid lap with telemetry of a car and
  track, shared or not. Laps that were not shared only teach it: they are never listed, opened
  or shown, and their telemetry never leaves the server. Only what the model learnt goes to
  the apps (the realistic ideal lap and the next level at every pace).
- **It learns as soon as a lap arrives.** The PC uploads laps on its own, so nothing else has
  to be open. The model is rebuilt on the next request and every 10 minutes.
- **Sturdier model:** at most three laps per driver so nobody weighs too much, broken or
  mismatched recordings and far slower laps left out, and the ideal lap never slower than the
  fastest lap really driven.

## 0.7.0 beta

**Added**
- **Unique nicknames.** No two accounts can use the same nickname (capital letters don't make a
  new one, and "Anonymous" is reserved). Picking a name that is taken shows a message.
- **Choose your name before every share.** Anonymous, your nickname or your iRacing name.
  Anonymous stays anonymous even if you change your name later. Nickname and iRacing name
  follow your changes.
- **Admin profile** in My account on the web and the phone apps (admins only): the accounts, and every shared
  lap and race analysis with the name it shows and who really uploaded it, with a delete button.

## 0.6.2 beta

**Changed**
- **The app is called Pitlane HQ again** everywhere: TrackIQ.exe becomes PitlaneHQ.exe (the
  installer and the updater take care of it; the 0.5–0.6.1 installs keep updating), the web,
  the phone apps, the server emails and the documents.
- **The server lives at https://pitlanehq.app**: the PC, the web and the phone apps point there.
  Accounts, laps and the community are the same.
- **Clean addresses**: the web app is simply https://pitlanehq.app/ (no more `/app/?companion=1`;
  the old addresses land there), with its own icon in the browser tab and on the home screen.
- **Signing in first**: without a session the app shows the sign-in with the slogan and a button
  to create a free account. The first time an account signs in, a welcome explains the two pieces
  and offers them: the **agent** (Pitlane HQ for Windows, which records the laps) and the
  **companion** (the phone apps, which show them).
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
