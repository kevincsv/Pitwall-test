# Changelog

Pitlane HQ is in **beta**. PitlaneHQ.exe, the web app and the phone apps share one version
number: `0.MINOR.PATCH`. PATCH for fixes, MINOR for a set of new features, and 1.0.0 when the
beta ends. Every version is listed here, newest first, and gets a release on GitHub.

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
