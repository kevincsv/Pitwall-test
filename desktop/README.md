# Pitlane HQ Desktop (preview): the native Windows window

The PC app is being rewritten in two halves, step by step:

- **The engine stays in Go** (`PitlaneHQ.exe`): iRacing telemetry, the overlays, the local API,
  the account and the uploads. Nothing changes for it, except a new flag: `PitlaneHQ.exe -engine`
  runs it without a window and prints the address of its API with a one-use ticket.
- **The window is native** (this folder, C# / WPF, .NET 8): its own frame, navigation and
  status bar, native screens where they pay off (first the Home status), and the rest of the
  app inside a WebView2 while each screen is moved over. Closing the window stops the engine.

Every build is published as an installer, `PitlaneHQ-Desktop-Setup.exe`, next to the normal
download. It installs the window and its own copy of the engine in "Pitlane HQ Desktop", with the
.NET runtime inside (nothing else to install). The normal installer still installs the Go app. It is a **preview** for admins and the curious: both
windows show the same data, from the same engine.

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
  second from `/api/desk` (the engine works them out with the native overlays' own code).
- Overlays: every overlay with Open/Close and Auto, Move/Lock, opacity, reset positions, close all, the built-in
  presets and your own (save, apply, delete). The overlays themselves are drawn natively by the engine.

Not native yet (the app inside a WebView, started only when one of them is opened): Analysis, Community, Account
and Settings. They move over one at a time.
