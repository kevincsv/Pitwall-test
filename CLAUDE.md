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
- One version number for PitlaneHQ.exe and the web (`appVersion` in main.go = `WEB_VERSION` in
  index.html, checked by a test). Every feature goes to the PC app, the web and the phone apps.
- DRINKS mode (formerly Friday night mode): admins only, on the PC or from the phone app.
- The community ideal lap must be realistic: built only from laps close to the fastest one,
  the median of the best few per micro-sector, and never more than 0.5 % faster than the
  fastest lap really driven (`IDEAL_MAX` in `web/dist/pitwall-model.js`).
- In development (shown, not usable): the Planner (until iRacing switches its data API back on),
  Le Mans Ultimate, ACC, Assetto Corsa, NASCAR 26 and team mode.
- This repository is only the PC app (PitlaneHQ.exe, Go) and the web (`cloud/`, Cloudflare).
  The Android and iOS apps live in their own repository.
- One app everywhere: `web/dist` is the PC app and the web app at `/app` (computers and phones).
  Web scripts are loaded with relative paths.
- `master` is the main branch the builds come from (Windows and the server).
