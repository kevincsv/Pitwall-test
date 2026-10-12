# Pitlane HQ for Windows: the native window

The PC app is two halves in one install:

- **The engine is Go** (`PitlaneHQ.exe`, Pitlane HQ Agent): iRacing telemetry, the overlays, the local API,
  the account and the uploads. `PitlaneHQ.exe -engine` runs it without a window and prints the address of its API
  with a one-use ticket. Started by itself next to the window (old shortcuts, start with Windows), it opens the window.
- **The window is native** (this folder, C# / WPF, .NET 8): its own frame, navigation and status bar, native
  screens, and the parts not moved yet inside a WebView2. Closing the window stops the engine.

Every build ships one installer, `PitlaneHQ-Setup.exe` (`installer/PitlaneHQ.iss`): the window with the .NET runtime
inside (nothing else to install) and the engine next to it. The updater's zip is the same folder; after an update the
engine prints `PITLANEHQ_RESTART=<window>` and the window starts again on the new version (`-replace <pid>`).

## Run it

Put `PitlaneHQ.Desktop.exe` (and its DLLs) in the same folder as `PitlaneHQ.exe` and start it. The
shell starts the engine itself; if `PitlaneHQ.exe` is not next to it, pass its path as the first
argument. The engine's API is protected: only windows that got a ticket from it can call it
(the shell, its WebView, the overlays); any other program on the PC gets the pairing PIN.

## Build it

    cd desktop/PitlaneHQ.Desktop
    dotnet build -c Release

Needs the .NET 8 SDK and the WebView2 runtime (part of Windows 11 and of Edge). The CI job
`desktop` in `.github/workflows/windows.yml` builds it on every push.

## What is native already

- The frame: title bar buttons, the same menu as everywhere (Home, Analysis, Community, Telemetry, Overlays,
  Account, then Settings) in the app's language, with the app's fonts (`ovfonts/`, the same files the native
  overlays draw with), and the status bar (engine, version, iRacing account).
- Home: the game, track and car, the live header items (session, position, lap, laps or time left, SOF,
  estimated iRating, incidents, fuel) and the recent races (from `/api/races`).
- Telemetry: gear, speed, pedals, the shift lights, lap timing with the delta, fuel and the relative, ten times a
  second from `/api/desk` (the engine works them out with the native overlays' own code); your driver notes' icons
  before the names, the note on hover (`DriverTags.cs`).
- Overlays: every overlay with Open/Close and Auto, Move/Lock, opacity, reset positions, close all, the built-in
  presets and your own (save, apply, delete). The overlays themselves are drawn natively by the engine.

- Community: the leaderboards by discipline, track and car, with search (profiles, race summaries and leagues
  open in the app).
- Account: sign in (with the two-step code), the public name, the email behind Show, the account's state,
  Sign out on this PC; the rest (password, two-step sign-in, devices, admin) opens in the app.
- Settings: start with Windows, close the overlays on exit, the braking beeps, updates; the rest opens in the app.

Not native yet: Analysis (the lap analyzer and the coach). The app runs hidden behind the native screens from the
start (its own WebView2 data folder, no background throttling), so the race engineer, the beeps and the recording
of your laps keep working, and it shows for Analysis and for the parts not moved yet.
