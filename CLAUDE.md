# Pitlane HQ: rules for working on this project

These rules apply to every task. How each feature behaves is in `docs/spec/` (index at the end): read the file for the
area you are changing before you change it, and update it in the same commit when the behaviour changes.

## Talking to the owner

- Reply to the owner in Spanish.
- The apps' languages are English, Spanish and Portuguese (Brazil) only (`LANGS` in index.html, `uiLang` in Go, `lang` in
  email.js): no German and no bilingual "EN + ES"; a German or bilingual choice from before reads English or Spanish.

## Git, pushing and releases

- Push only when the owner says so ("súbelo", "sube todo"…). Never create pull requests unless asked. When they say
  so, push every pending change (designs and small fixes included), never only part of it.
- Changes are released in big batches, never one by one: people should not get a stream of small updates. Every
  change is committed and pushed to the working branch only (never master), tested together, and goes to master in
  one push when the owner asks for the batch ("sube todo", "súbelo a producción"). A fix that cannot wait (the app
  broken for people) is the one exception, and only when the owner says so.
- `master` is the main branch the builds come from (Windows and the server). Builds of other branches only check;
  nothing is published unless it is master.
- Pushing never builds or deploys: `windows.yml` and `cloud.yml` run only when started by hand (Actions → Run
  workflow, or `gh workflow run <file> --ref master`). Never start one unless the owner says "build"/"compila";
  "sube"/"push" means push only.
- The notices the apps show in their inbox (`web/dist/app-news.json`, every device reads it from the server) are
  never added or changed without asking the owner first, one by one, even when they say "sube todo" for everything
  else: show the text and wait for their yes before it goes in.
- Anything sensitive that goes to GitHub is encrypted or kept in GitHub secrets; never paste
  Cloudflare tokens or keys anywhere.

## Versions and release notes

- One version number for PitlaneHQ.exe, the web and the phone apps, shown with "beta" until 1.0.0. The numbering
  started again at 0.4.1 (the owner's choice): the changelogs and What's new begin there, the releases of a higher number
  are deleted by the builds, and the phones announce an update when the server's number differs from theirs (not only
  when it is higher) (`appVersion`/`appStage` in main.go = `WEB_VERSION`/`APP_STAGE` in index.html, checked by a
  test). Raise it rarely: a MINOR version for a big set of features; fixes and small changes go into the current
  version (or a PATCH only when a fix must reach PCs that already have it), never one version per build.
- CHANGELOG.md (newest first), the phones' and whats-new.json list only the big versions and only what users notice;
  internal, server and small fixes are one "Fixes and improvements" line. These notes read as a person wrote them, in
  plain short sentences: no "Title: text" headings and never a ";" or a ":". A version gets a GitHub release.

## Product rules (the owner's choices, everywhere)

- Every feature goes to the PC app, the web and the phone apps (the one exception: the "Share your feedback" window
  that asks by itself is on the PC app and the web only). Equivalent screens show the same information under the
  same names on every device (the phones' sub-tabs and labels are the PC's, never shortened versions; the web's
  phone-width layout is checked with `tools/ui-sweep.js`).
- Android and iOS are always the same app: a change asked for one of them goes to both (their own repository).
- Real data by default: no demo races, sample drivers or made-up laps on the server. Invented data only behind
  Settings → About → Demo data, which only admins see, never uploaded, with a banner on every screen
  (`docs/spec/landing-and-demo.md`).
- An admin sees Pitlane HQ exactly as everyone does until they turn admin mode on (`docs/spec/admin.md`).
- No text that explains what something is: no subtitle under a title, no line saying what a chart or a list shows;
  the title and the data say it. The one exception is the admin page, where every section and part has one short line
  saying what it is for. Only the notes the driver needs to act. A text never joins two phrases with a colon
  ("No records yet: the first lap…"); it is one sentence, or two.
- No text anywhere (PC, web, Pitlane HQ Desktop, phones, the server's pages, the landing) about encryption, how the data
  is protected, where the password goes or what the server can see. Only the notes the driver needs to act ("your data
  does not need to be uploaded again", what deleting the account removes, the PC uploading again after a new password).
- People see the PC program as "Pitlane HQ Agent" (or "the agent"), never "PitlaneHQ.exe" (the file keeps its name).
  Away from the PC (the web, the phones) a text never says "this PC": it is "your PC" (`PC_WORDS`/`devWords` in
  index.html, which also still rewrites the German "diesem PC" of old settings).
- Pitlane HQ never shows Windows notifications: what it has to say shows inside the app.
- The subscription stays off (`license_plans.json` → `enforce: false`); everything is free during the beta
  (`docs/spec/pro.md`).
- The owner's name never appears in the code, the documents or the tests; the apps never link to
  GitHub: downloads and release notes come from https://pitlanehq.app (R2 bucket, `cloud/src/downloads.js`).

## Feature status

- In development (shown with "In development", usable only by admins with admin mode on, every device; `wipOk()`/
  `wipView()` in index.html, `wipAllowed()` in Go): the Planner (until iRacing switches its data API back on), ACC,
  Assetto Corsa, NASCAR 26, team mode and the SimHub plugin.
- Switched off for now: setups, per-car settings (`carProfilesOn` in carprofiles.go), the Data view and sharing race
  analyses. Hidden from everyone on the PC (admins too) until the owner says otherwise: profiles and Settings →
  Connections (`CONN_ON` in index.html). Full telemetry is gone everywhere.
- Released to everyone: the overlays, the leagues hub. Le Mans Ultimate is labelled "Beta" wherever it is offered.

## Where things are

This repository is only the PC app and the web/server. The Android and iOS apps live in kevincsv/pitlanehq-mobile and
must keep this server's protocol.

- Root `*.go`: PitlaneHQ.exe (the agent): game readers (`irsdk.go`, `lmu*.go`, `ac*.go`), lap recorder and journal
  (`cloud.go`, `journal.go`, `field.go`), native overlays (`ov*.go`), sync (`syncmerge.go`), local API for the page.
- `web/dist/`: one app everywhere, the PC app's page and the web app at `/app` (computers and phones), loaded with
  relative paths. `index.html` is the app; `pitwall-analysis.js` is the lap analysis and coach every device runs;
  `pitwall-games.js` says what works in which game.
- `cloud/`: the Cloudflare Worker behind pitlanehq.app (`src/worker.js`, one file per area in `src/`), D1 migrations in
  `cloud/migrations/` (next number after the highest there), tests in `cloud/test/`.
- `desktop/PitlaneHQ.Desktop/`: the C#/WPF main window that shows `web/dist` in WebView2. `installer/`: Inno Setup.
- `simhub/`: the plugin for SimHub (C#, .NET Framework 4.8), reading the agent's `/api/simhub` (`simhub.go`).
- `vr/`, `ovfonts/`, `assets/` (the logo master), `tools/` (`local.cmd`, `ui-sweep.js`, `flags-sprite.js`).
- `vendor/`: Go dependencies, vendored; go-webview2 carries a patch for the microphone (keep it if re-vendored).

## Checks before committing

- Go: `go test -mod=vendor ./...` (benchmarks: `go test -run '^$' -bench . -benchmem`).
- Lap analysis and coach: `node cloud/test/analysis.test.mjs`. A change meant to change its answers rewrites the
  fixture with `--capture web/dist/index.html` and says why in the commit.
- Server: `node cloud/test/<name>.test.mjs` for the area changed (`seo.test.mjs` for any public page), and
  `cd cloud && npx wrangler deploy --dry-run --outdir dist` to check it builds.
- Web layout: `node tools/ui-sweep.js` (Playwright, every view at 1300 and 390 px).

## Spec index (`docs/spec/`)

| File | Read it when you touch |
| --- | --- |
| `overlays.md` | Native overlays, their settings and designs, the coach overlay, performance, VR, the Desktop window |
| `coach-and-model.md` | The coach, the lap analyzer, `pitwall-analysis.js`, corner tips, coach learning, the model |
| `laps-and-sessions.md` | Lap validity, full laps, restarted sessions, races vs AI, real iRating |
| `tracks-and-maps.md` | Lap paths, track layouts, turn detection, official turns, racing line, pit lane |
| `telemetry.md` | Telemetry modes, rev beep, voice chat, the live link with phones and share codes |
| `app-screens.md` | Home, Analysis, licence summary, track and driver notes, main menu, +1L pills |
| `community.md` | Leaderboards, records, track page, LMU class boards, wet badges, rivals, car families |
| `lmu.md` | Le Mans Ultimate support |
| `pc-app.md` | The Windows app, installer, tray, local mode, fonts, startup, updates, uninstall |
| `sync-and-accounts.md` | Sync, what is encrypted how, escrow, deleting an account |
| `admin.md` | Admin mode, the admin page, usage analytics |
| `support-and-feedback.md` | The support chat, the floating button, the feedback windows |
| `drinks.md` | DRINKS mode |
| `pro.md` | Pitlane HQ Pro and its limits |
| `landing-and-demo.md` | Demo data and the visitor's landing page |
| `seo.md` | Public pages, sitemap, JSON-LD, IndexNow |
| `leagues.md` | The leagues hub and the Reddit/Discord scan |
| `discord.md` | The Discord bot |
| `simhub.md` | The SimHub plugin (`simhub/`) and the agent's `/api/simhub` |
| `email-and-branding.md` | Emails through Resend, the logo |
