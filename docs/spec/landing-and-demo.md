# Real data, demo data and the landing page

How this part of Pitlane HQ behaves. Read it before changing this area; keep it up to date when the behaviour changes.

- Real data by default: no demo races, sample drivers or made-up laps on the server. Invented data
  only behind Settings → About → Demo data, which only admins see (web/PC: pitwall-demo.js; phone
  apps: Settings → Admin), never uploaded, with a banner on every screen. The `-demo` flag of
  PitlaneHQ.exe is for development only and has no button in the app. The one exception is the web's visitor
  (`web/dist/pitwall-tour.js`, COMPANION and not signed in): the landing, the "Boxes" design 1 (the owner's choice,
  built exactly as its mockup). The app header carries real buttons (Records, Leagues, the language, Downloads in
  amber; at phone width only their icons, the version badge hidden). The hero is the tagline ("Telemetry, coach and
  overlays for your laps", the eyebrow "iRacing · Le Mans Ultimate (beta)"), one sentence, Create account, Download for
  Windows, Android and "Run an iRacing or LMU league? Post it for free", beside the "me" view's own sign-in (or create
  account) panel moved there as a card (`#tour` after `#meBody`, mounted by `signWall` while the wall is up; its title
  and welcome hidden). Under it "See it from the inside": one app window in a Windows 11 frame (its icon and name,
  minimise, maximise, close; never a browser bar or an address) with tabs on its left that change what it shows (Coach,
  Analyzer, Races, Your laps and Leaderboards are screenshots, `landing/<lang>/*.jpg`; Live telemetry is a canvas that
  plays two real laps of the owner's account in a loop, `landing/live-lap.json` (Super Formula SF23 at Spa, lap 5 against
  the lap before, one row every 10 m), with the speed, pedals, wheel and G cards over the live lap comparison and no
  driver's name); "The most active leagues right now", the three first of `/community/leagues/found` (the section shows
  once they are there), with "See every league" and "Post your league for free"; "Over the game", the overlays as the
  agent draws them (`landing/<lang>/ov-*.png`: the default design's from `OV_LANG=<lang> OV_STYLE_DIR=dir go test -run
  'TestOverlayStylesDraw$' .`, the older ones from `ovSavePNG`) with four chips and one line naming the rest; "Three
  steps"; the footer. No community numbers on it (too few yet, the owner's choice). The screenshots are the app with
  its demo data, without the demo badge and with plausible names (never the owner's). "Create account" scrolls to the
  form at the top; a visitor never enters the app on invented data (`sampleOn()` is always false). Never on the PC app.
