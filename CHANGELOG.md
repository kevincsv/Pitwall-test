# Changelog

Pitlane HQ is in **beta**. PitlaneHQ.exe, the web app and the phone apps share one version
number: `0.MINOR.PATCH`. PATCH for fixes, MINOR for a set of new features, and 1.0.0 when the
beta ends. Every version is listed here, newest first, and gets a release on GitHub.

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
