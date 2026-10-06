# Pitlane HQ: rules for working on this project

- Reply to the owner in Spanish.
- Push only when the owner says so ("súbelo", "sube todo"…). Never create pull requests unless asked.
- Anything sensitive that goes to GitHub is encrypted or kept in GitHub secrets; never paste
  Cloudflare tokens or keys anywhere.
- The subscription stays off (`license_plans.json` → `enforce: false`).
- Only real data: no demo races, sample drivers or made-up laps in the app, the web or the server.
  The `-demo` flag of PitlaneHQ.exe is for development only and has no button in the app.
- The community ideal lap must be realistic: built only from laps close to the fastest one,
  the median of the best few per micro-sector, and never more than 0.5 % faster than the
  fastest lap really driven (`IDEAL_MAX` in `web/dist/pitwall-model.js`).
- In development (shown, not usable): the Planner (until iRacing switches its data API back on),
  Le Mans Ultimate, ACC, Assetto Corsa, NASCAR 26 and team mode.
- One app everywhere: `web/dist` is the PC app, the web app at `/app` and the phone apps.
  Web scripts are loaded with relative paths.
- `master` is the main branch the builds come from (Windows, Android, iOS, server).
