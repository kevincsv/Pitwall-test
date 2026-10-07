# TrackIQ Desktop (preview): the native Windows window

The PC app is being rewritten in two halves, step by step:

- **The engine stays in Go** (`TrackIQ.exe`): iRacing telemetry, the overlays, the local API,
  the account and the uploads. Nothing changes for it, except a new flag: `TrackIQ.exe -engine`
  runs it without a window and prints the address of its API with a one-use ticket.
- **The window is native** (this folder, C# / WPF, .NET 8): its own frame, navigation and
  status bar, native screens where they pay off (first the Home status), and the rest of the
  app inside a WebView2 while each screen is moved over. Closing the window stops the engine.

Every build is published as `TrackIQ-Desktop.zip` next to the normal download (the installer
still installs the Go app on its own). It is a **preview** for admins and the curious: both
windows show the same data, from the same engine.

## Run it

Put `TrackIQ.Desktop.exe` (and its DLLs) in the same folder as `TrackIQ.exe` and start it. The
shell starts the engine itself; if `TrackIQ.exe` is not next to it, pass its path as the first
argument. The engine's API is protected: only windows that got a ticket from it can call it
(the shell, its WebView, the overlays); any other program on the PC gets the pairing PIN.

## Build it

    cd desktop/TrackIQ.Desktop
    dotnet build -c Release

Needs the .NET 8 SDK and the WebView2 runtime (part of Windows 11 and of Edge). The CI job
`desktop` in `.github/workflows/windows.yml` builds it on every push.

## What is native already

- The frame: title bar buttons, navigation (Home, Live, Analysis, Community, Account, Settings),
  the status bar (engine, game, track and car, account).
- Home: the live status card (connection, track and car), from the engine's `/api/now`.

Next: Live and the lap tables, then the analyzer. The WebView keeps the rest meanwhile.
