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
- One model per car and track (`cloud/src/model.js`, shown by `web/dist/pitwall-model.js`): it
  learns from every real lap it knows (the accounts' laps, shared or not; shared laps; the laps
  of the rivals of your races) and its references are real laps, never composites: the record
  (the fastest lap really driven) and, for your pace, the lap of the driver just ahead. Analysis,
  the coach and the lap list use this one model; no second "ideal" or theoretical lap anywhere.
- In development (shown with "In development", usable only by admins, on every device): the
  Planner (until iRacing switches its data API back on), Le Mans Ultimate, ACC, Assetto Corsa,
  NASCAR 26, team mode, the overlays on top of the game, and the Data and Full telemetry views.
  Switched off for now: setups, per-car settings, the Data view and sharing race analyses.
  (`wipOk()`/`wipView()` in index.html, `wipAllowed()` in Go).
- This repository is only the PC app (PitlaneHQ.exe, Go) and the web (`cloud/`, Cloudflare).
  The Android and iOS apps live in their own repository.
- One app everywhere: `web/dist` is the PC app and the web app at `/app` (computers and phones).
  Web scripts are loaded with relative paths.
- `master` is the main branch the builds come from (Windows and the server).
- The owner's name never appears in the code, the documents or the tests; the apps never link to
  GitHub: downloads and release notes come from https://pitlanehq.app (R2 bucket, `cloud/src/downloads.js`).
