# Real data, demo data and the landing page

How this part of Pitlane HQ behaves. Read it before changing this area; keep it up to date when the behaviour changes.

- Real data by default: no demo races, sample drivers or made-up laps on the server. Invented data
  only behind Settings → About → Demo data, which only admins see (web/PC: pitwall-demo.js; phone
  apps: Settings → Admin), never uploaded, with a banner on every screen. The `-demo` flag of
  PitlaneHQ.exe is for development only and has no button in the app. The one exception is the web's visitor
  (`web/dist/pitwall-tour.js`, COMPANION and not signed in): the landing. The app header carries Downloads, Records
  and the language; the "me" view's own sign-in (or create account) panel moves into the hero beside the tagline (styled
  as the design: sentence-case buttons, Sign in and Create account side by side), its title and welcome hidden; and under it (`#tour` after `#meBody`, mounted by `signWall` while the wall is up) one page
  like a product site in the "clean data" design (never a slideshow): the tagline and the calls to action, the app in a
  Windows 11 window (its icon and name, minimise, maximise, close; never a browser bar or an address), "What Pitlane HQ
  does" as rows (a title, one short sentence, a screenshot of the app in that window), "Overlays over iRacing and Le Mans Ultimate" (the
  overlays moving over a dark scene: one lap played in a loop with the relative, delta bar, the agent's own radar
  (`drawRadarOv`: no box, 20 m, grey/amber/red cars, the red side bar, trails, the nearest distance), dash, pedals,
  map and fuel, labelled only "● LIVE", each frame writing only the overlays' boxes; then the overlays as the agent
  draws them, `landing/ov-*.png` from `ovSavePNG`), "Also on your phone" (the phone apps' own screenshots,
  `landing/<lang>/m-*.png` from the phones' screenshot job: race summary, laps, coach, telemetry), "And also" (driver notes, rev beeps,
  overlays in VR; never "one account everywhere") and "Start in two minutes". The screenshots (`landing/*.jpg`) are
  the app with its demo data, in Spanish, without the demo badge and with plausible names (never the owner's).
  "Create account" scrolls to the form at the top; a visitor never enters the app on invented data (`sampleOn()` is
  always false). Never on the PC app.
