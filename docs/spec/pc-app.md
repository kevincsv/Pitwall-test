# Windows app, installer, local mode, startup and updates

How this part of Pitlane HQ behaves. Read it before changing this area; keep it up to date when the behaviour changes.

- One Windows app, "Pitlane HQ" (never "preview" or a second download): one installer (`installer/PitlaneHQ.iss`,
  `PitlaneHQ-Setup.exe`; `PitlaneHQ-Desktop-Setup.exe` is the same file for old links) puts the native window
  (`PitlaneHQ.Desktop.exe`, self-contained) and the agent next to it, and its shortcuts open the window, which runs the
  agent as its engine (`-engine`). PitlaneHQ.exe started by itself (old shortcuts, the Run entry, the updater) opens
  the window when it sits next to it (`openDesktop`, desktoplaunch*.go); it uninstalls the old preview install. The
  updater's zip is the whole app folder (`out-desktop`, sub-folders kept); in engine mode it installs by itself too
  and says `PITLANEHQ_RESTART=` so the window starts again on the new version (`-replace <pid>`, with `-minimized`
  when it was hidden in the notification area, so it comes back as it was). The window is one instance
  (`Local\PitlaneHQ.Desktop`): a second start brings it forward, hidden or minimised (it sets the event
  `Local\PitlaneHQ.Desktop.Show` the running window waits on), never when Windows started it. Pitlane HQ lives in
  Windows' notification area like Steam or Garage 61 (`Tray.cs`, the app's icon with "Open Pitlane HQ" and "Quit" in
  the app's language, a click opens the window, never a balloon or a toast): closing the window (the header's close,
  Alt+F4) hides it there while the engine, the overlays, the sync, the updates and the live link keep running, and only
  Quit on its icon (or Windows shutting down or signing out) stops everything. Settings → "Closing the window keeps
  Pitlane HQ in the notification area" (`trayOnClose` in the agent's settings, on by default, read by the window from
  `/api/now`; shown only in Pitlane HQ Desktop, `INFO.desktop`) turned off makes closing quit. A device that presses
  Connect while the window is hidden brings it to the taskbar minimised with its button flashing, and the icon's menu
  says "A device wants to watch your telemetry" until it is answered (`pwAttention` from `liveAskShow`); never in front
  of the game. The installer asks it to quit first (`Local\PitlaneHQ.Desktop.Quit`, `QuitPitlaneHQ` in the .iss) so no
  icon is left behind, taskkill only as the fallback.
- Local mode (the owner's development, `tools/local.cmd`, never a button in the app): the whole of Pitlane HQ on one PC
  without internet. The server (`cloud/`, the same code as pitlanehq.app) runs on the PC with `wrangler dev --local
  --var LOCAL:1 --test-scheduled` (database and files in `cloud/.wrangler`, `DATA_KEY` in `cloud/.dev.vars`; `LOCAL=1`:
  every account is an admin, sign-up needs no email, `/server.json` names the local server). `PitlaneHQ.exe -local`
  (or `-server URL`, or the `PITLANEHQ_SERVER`, `PITLANEHQ_DATA`, `PITLANEHQ_PORT` environment the native window's engine
  and the overlay windows inherit; `localmode.go`): `commBase()` is that server, its own data folder (`PitlaneHQ-local`,
  the script copies the normal one once without the sign-ins) and port (8585), the native window its own instance, no
  updates, and the PC calls the server's ten-minute job (`/__scheduled`, the models). Nothing leaves the PC: every HTTP
  client of the program dials through `localDialContext` (`tlsTransport`, the live relay, the default transport), which
  refuses any host but the PC itself, the page is served without its Google Fonts link (`localPage`), the local server
  listens on 127.0.0.1 only and never pings IndexNow. pitlanehq.app never hears of local mode, and local mode is the
  owner's alone (the script needs the repository and Node.js; the shipped flag does nothing without that server). The
  laps already on pitlanehq.app are not there: the local server gets the laps driven from then on.
- The app's page takes its fonts from the program first (`/fonts.css` and `/fonts/*` from the embedded `ovfonts/`,
  `registerLocalRoutes`; on the web `fonts.css` is empty) and Google Fonts after, so with internet nothing changes
  and without it the app looks the same.
- Started with Windows (the installer's or Settings' "PitlaneHQ" Run entry, one only), PitlaneHQ.exe starts Pitlane HQ
  in the notification area (the window with `-minimized`: hidden there, nothing in the taskbar, the engine running,
  never shown by itself) and never brings an already open window forward.
- Uninstalling PitlaneHQ.exe removes everything it keeps on the PC (`[UninstallDelete]` in
  installer/PitlaneHQ.iss); nothing on the server is touched (the account, the leaderboards, the model).
- Pitlane HQ never shows Windows notifications (nothing in the action centre; `notify` only logs, and the PC app
  schedules no browser notifications): what it has to say shows inside the app.
- PitlaneHQ.exe checks for updates every 10 minutes, and at once when the server's answer to its minute sync names a
  newer build (`X-Pitlane-Build`, from version.json; `updateNudge`), notifies once per build and installs by itself
  when no sim is connected (unless switched off in Settings → About). A required update (the PC's version is older
  than version.json's `min`, `appMinVersion`) installs as soon as the car is not on the track, whatever that switch,
  never while driving. The client tag (`clientTag`, `X-Pitlane-Client`) carries the build, shown in Admin → Users → Online now.
