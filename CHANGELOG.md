# Changelog

Pitlane HQ is in **beta**. PitlaneHQ.exe, the web app and the phone apps share one version
number: `0.MINOR.PATCH`. PATCH for fixes, MINOR for a set of new features, and 1.0.0 when the
beta ends. Every version is listed here, newest first, and gets a release on GitHub.

## 0.3.4 beta

**Fixed**
- Race analyses (yours and the shared ones): the incident count no longer shows 0 when the laps
  had incidents (iRacing's results can still say 0 at the flag), so the summary no longer calls
  it a clean race. Laps without a time are left out of the lap chart instead of dropping to the
  bottom.
- Track and car names with accents ("Autódromo Hermanos Rodríguez") are no longer garbled.
- PC: Analysis shows the laps in your account when the window has none of its own (after a race
  or a restart), and My laps works on the PC when you are signed in.

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
