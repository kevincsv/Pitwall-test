# SimHub

The Pitlane HQ plugin for SimHub (`simhub/PitlaneHQ.SimHub/`) shows what Pitlane HQ works out as SimHub properties, so a
driver can put them on SimHub dashboards, LEDs and other devices. In development: the agent answers it only for admins
with admin mode on (`wipAllowed()`), and it is installed by hand.

## How the plugin reaches the agent

- The local API is only for Pitlane HQ's own windows (`localtoken.go`), so the plugin has its own key. Every run the
  agent writes `simhub.json` in its data folder (`%APPDATA%\PitlaneHQ`): `{"port","key","v"}`, a new key each run
  (`writeSimhubFile`, `simhub.go`). The plugin reads it again on every connection.
- `GET /api/simhub` with the header `X-PitlaneHQ-Key`: only from this PC (loopback, never a remote viewer), only with
  that key (403 otherwise). With the feature not allowed it answers 409 `{"off":true}`, and a stream already open sends
  `event: off` and closes. Otherwise a server-sent stream: a `data:` frame 30 times a second when something changed, a
  keepalive every 2 s when nothing did.
- The values come from an overlay state fed like an overlay window (`ovFeed`, the delta bar's and the coach's
  variables), so the plugin shows exactly what the delta bar and the coach overlay show, with the same settings.
  The feed starts with the first plugin and stops reading when none listens (`simhubJoin`). The lap's validity is the lap
  recorder's own verdict (`simhubLapLive`, `simhubLapDone` in `cloud.go`), including iRacing not taking a lap as its
  best.
- The frame has a version (`simhubFeedVersion`, `v`). A change that removes or renames a field raises it; the plugin
  shows Status "old" for a version newer than it knows.

## Properties (`PitlaneHQ.<name>`)

| Property | What it holds |
| --- | --- |
| Status | `ok`, `no-agent` (Pitlane HQ not running), `off` (not allowed), `old` (plugin older than the agent) |
| Connected | Pitlane HQ is reading a game now |
| Delta | The delta bar's delta to its reference (s, negative is faster) |
| CoachReference | What the coach measures against ("vs your best lap") |
| CoachDelta | This lap against the coach's reference at the same point (s) |
| CoachTurn, CoachDistance | The next corner the coach speaks about and the metres to its braking point |
| CoachTip, CoachCue | The tip for it, and the same in two or three words |
| CoachLost | What that corner cost on the last lap (s) |
| LastTurn, LastTurnGain | The corner just taken and what it gained (negative) or lost, for 8 s |
| Lap, LapValid | The lap under way and whether it is still valid |
| LastLap, LastLapValid | The last lap and its verdict |

A value Pitlane HQ does not have now is null (a text is empty). Texts are in the app's language and units.

## Building and installing

- .NET Framework 4.8, built against SimHub's own `SimHub.Plugins.dll` and `GameReaderCommon.dll` from the SimHub
  folder (`-p:SimHubPath=…`, `C:\Program Files (x86)\SimHub\` by default). SimHub's DLLs are never copied into this
  repository or shipped with Pitlane HQ; only `PitlaneHQ.SimHub.dll` is.
- `dotnet build simhub/PitlaneHQ.SimHub -c Release`, then copy `PitlaneHQ.SimHub.dll` into the SimHub folder with
  SimHub closed. SimHub asks to enable the new plugin on its next start.
- Not yet: a build in CI (it needs SimHub's DLLs on the runner), the installer copying the DLL, a ready dashboard, and
  the plugin offered in the app.
