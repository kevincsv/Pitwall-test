# Overlays, Pitlane HQ Desktop window, VR and overlay designs

How this part of Pitlane HQ behaves. Read it before changing this area; keep it up to date when the behaviour changes.

- The coach overlay is live (`drawCoachOv`, `coachTick` in ovnative4.go, design A): as the car comes to a corner with a
  tip it shows the turn, the metres to the reference's braking point with a bar, the last lap's loss there, the tip and
  the fast drivers' range (the model's corner card, `modelCor`); after the corner, for a few seconds, the verdict (this
  lap against the reference from the braking zone to the exit, `liveDelta`) and the lap's corners as dots (green gained,
  red lost). The tips are computed once per lap (`compareLaps` with every corner, cached by `key`). It is set before the
  session in the overlay's settings on the web (Overlays → Coach → configure, `UI_DEFAULTS.coach`, `CONFIGURABLE.coach`):
  the reference (the next level or your best lap), its style (the card, the column with a bar filling to the braking point,
  the corner drawn with your path, the reference's line and both braking points, big letters for VR with the tip in two
  or three words, `coachCue`; how it names the corner, "Next turn (T7)" by default, "Next turn" or "T7", `turnName`/`coachTurn`; the preview in its settings draws the chosen style, `coachStyleHTML`), which
  corners (the three that cost the most, or the track's turns as chips), the fast drivers' hint, the verdict's seconds and
  from how far it speaks. The settings travel with the account like every overlay's. The coach's plan has "Take the plan
  to the coach overlay" (`planToOverlay`): the plan's corners become the overlay's chosen ones on that track (`turns`, `turnsTrack`; on another
  track the overlay speaks at the three that cost the most, `coachPicked`, and the chips of Overlays → Coach are the
  track's the game is on, `coachTurnsHere`); on the PC it opens
  the coach overlay when it is closed, on the web it writes `ui.coach` into the account's settings.json (`cpSetUI`) and the
  PC takes it at its next sync.
- Overlay windows (what is in development or switched off is in CLAUDE.md, "Feature status"):
  A sync reload never closes or reopens the overlays. An overlay
  window is the widget itself, with Windows 11's rounded corners and a quiet border (`ovwin`, `noWinBorder`); it
  fits its content's height (grows at once, shrinks after a moment). An overlay never leaves the desktop when
  dragged, resized or placed (`keepOnScreen`, `clampMove`). Nor is it made smaller than it can be read: its default width
  (`overlayMinSize`; the map, the radar and the g-force their default height too), when resized, moved or opened, and
  not even while the corner is dragged (`WM_GETMINMAXINFO`, `OV_MINW` in the Overlays screen editor). The
  Overlays cards show no OBS address. An overlay window draws only its own widget; only the
  radar's window hides itself when nobody is near. Every overlay is native UI drawn in Go, never WebView2 (its
  content is always opaque; a test checks every overlay in `overlayOrder`): `ovnative.go` (shapes, the app's own
  fonts embedded from `ovfonts/` (IBM Plex Sans, JetBrains Mono, Barlow Condensed, OFL), its colours, licence badges
  and pills; the live stream; radar, delta bar, relative, standings), `ovnative2.go` (flag, dash, timing, fuel,
  engine, tyres, inputs, DRS & push-to-pass, telemetry, g-force), `ovnative3.go` (stats, pit stop, mini-sectors,
  gaps, incidents), `ovnative4.go` (track map from `/api/map` or the community's layout, live compare, braking
  markers with the model's next level from `/api/community/model`, coach), `ovnative5.go` (weather: the track's and
  the air's temperature, the wind against your car with the game's clock, rain and how wet the track is; the track position
  bar: every car along the lap on one line, class colours, you marked, the two nearest numbers each way; performance:
  frames a second with the last minute, GPU and CPU, the connection's latency and quality) and `ovnative_windows.go` (a
  layered window with alpha per pixel and each overlay's opacity). Only the panel and its content show, the rest is
  see-through, every click goes to the game, and while
  moving the overlays they are dragged and resized from the corner. They scale with the window's width and fit
  their height to what they show (the map and the radar keep the window's). The radar is only your car's outline,
  the cars coming, the red side bar and the nearest distance; it reads and draws every sample the game gives (60 a
  second), each car where its lap distance puts it (an alpha-beta filter predicts every draw and corrects on each new
  sample, plus the sample's age, so it glides at its own closing speed and sits where it is now), a car beside you keeps
  its side (even while the game's flag lags) and slides there smoothly, three wide puts the second car beyond the first,
  a car that stops overlapping eases back into line over the next 7 m, a car closing fast turns red before it is beside
  you and trails a fading line, a car off the track beside you still shows as an outline, a car on the pit road dimmed. The windows that need laps record the ones they see.
  The main window (Pitlane HQ Desktop, `desktop/PitlaneHQ.Desktop`, C#/WPF) is the app itself: `web/dist` served by the
  engine in a WebView2 on every screen, exactly the web (the owner's choice: the native WPF screens were never
  the same as the web). The window has no title bar of its own: the app's header is the title bar (`ownFrame`:
  `window.pwWin` for drag, minimise, maximise, close and the top edges, `window.pwOpen` for other sites, given to the
  page by the shell before its scripts run, `HostScript`, as the agent's own window did), a 6 px margin leaves the
  resize borders to the window. The native screens (Home, Analysis with `DrawMap`, Telemetry from `/api/desk`,
  Overlays, Community, Account, Settings; `/api/desk/coach`, `/api/trackmap`, `desknow.go`) stay in the code but are
  not shown (`Native` is empty). Builds of other branches only check
  (nothing is published unless it is master). The app tells the PC its language and units (`/api/lang?l=&u=`), and the native overlays get
  both in the stream's config event, so they change at once. The gaps overlay and widget drop a sample a whole lap
  off from both its neighbours (`cleanGaps`: the game counts a car's lap a moment before or after its distance
  wraps), the track bar's car numbers never overlap, and the live compare's "Now" waits for a lap the game times.
  Overlay presets: the four built in and your own (saved in the overlay settings, `CFG.ui.ovpresets`, so they go
  with the account), applied with one click and deleted with their ×; names asked in the app's own dialog.
  Overlay windows use the app's language (`&lang=` from `uiLangChoice`). The Overlays screen editor shows only the
  overlays that are open or Auto, always inside the screen. In a narrow PC window the main tabs show only icons. The delta bar overlay has no title: a rounded track and the delta in a pill in the centre.
  An overlay asks the PC only for the values it shows, 60 times a second, and redraws fast (relative 10/s,
  standings 4/s, radar 30/s). The agent stays light: the stream's frame is written straight from the telemetry buffer
  (`streamFrame`, byte for byte what encoding/json wrote) and an overlay reads it without encoding/json (`ovframe.go`,
  the same values), the session text is read by scanning (`yamlField`/`listItem`, never a regexp compiled per call),
  the LMU frame decodes a car's texts only when they change, the stream's frame and the LMU frame allocate nothing once
  warm, the lap recorder and the field watcher only as their laps grow, and an overlay a few lists of numbers per frame
  (`perf_bench_test.go` measures them, `go test -run '^$' -bench . -benchmem`). An overlay draws and pushes to the screen
  only what changed (`ovpace.go`: a frame with the same values, settings and a still picture is not drawn again, a
  picture the same as the one on the screen is never handed to UpdateLayeredWindow again, off the track or with no game
  four draws a second, at once at its full rate back on the track, a hidden overlay closes its stream), its shapes skip
  the per-pixel distance where the answer is known and the text's glyphs and widths are kept (`textMask`, `ovWidths`),
  the map's still part is drawn once per size and track (`mapLayer`), always the same pixels as before
  (`TestOverlayShapesSameAsBefore`, `TestOverlaysRedrawTheSame`; `ovbench_test.go` measures every overlay's draw), and
  Overlays → More → Frame rate (30 by default, 20, 15 or 10 a second, `ui.ovfps`; the radar twice it) lowers it.
  Every overlay's Configure window has its own Opacity (`ui.<overlay>.alpha`, 60–255, `ovAlpha`/`ovAlphaOf`; unset, the
  old setting for all of them, `CFG.alpha`, else opaque; VR too; the designs' panels are opaque themselves, fillA 1, so at 255 nothing of the game shows through, Frameless aside, `TestOverlayStylesOpaque`) and, for the overlays with a title (`OV_TITLED`),
  "Show the title" (`ui.<overlay>.title`, on by default, `titleOn`/`titleH`: off, the content moves up and the overlay
  is shorter; the engine's and the pit lane's badges keep their row while lit); Overlays → More → Titles shows or
  hides them all at once. Every overlay window's Configure also has its text size (`ui.<overlay>.textScale` 0.85/1/1.2,
  scaling its whole drawing, `textScale`) and "Hide by itself" (`ui.<overlay>.hide`: "car" out of the car, garage or no
  game, "pits" that and on the pit road; nothing on the screen, like the radar with nobody near, never while moving the
  overlays; `autoHidden`, OnPitRoad asked only then; the web widget in an overlay window the same, `ovOwnApply`), and
  each overlay its own content options (`OV_OPTS` in index.html, the native overlays read the same keys, `ovsettings.go`;
  unset, everything draws exactly as before, `TestOverlayOptionDefaults`): relative (`ui.rel`: classHead, a band of the
  classes with their SOF; dimLapped; rowSize s/m/l; notes), standings (`ui.std`: classHead, each class under a header
  with its cars and SOF, the same class bands the Beta designs always draw, made in `tableRows`; irShort "1.8k"; fastMark; pitTag), delta bar (`ui.deltabar`: barOnly, trend), timing
  (`ui.timing`: sectors, lastBest, flash), inputs (`ui.inp.lineW`), radar (`ui.radar`: carSize, trails, dist), coach
  ("text": the tip only, nothing between corners), pit (`ui.pit`: limTol, the margin over the pit limit in m/s, 0.4 by
  default; pitOnly), gaps (`ui.gaps.numbers`), track bar (`ui.trackbar`: lineOnly, height, near, sectors, myClass), dash
  (`ui.dash`: shift, strip, spdUnit), fuel (`ui.fuel`: show, spare laps of margin, unset 0.3 in the verdict and none in
  "to finish without a stop"), tyres (`ui.tyres`: press, wear, avgOnly), weather (`ui.weather`: show, trend; with its
  title hidden the game's clock moves into the content), flags (`ui.flag`: lights, kinds), map (`ui.map`: turns,
  sectors, myClass, width), engine (`ui.engine`: rows, badges), incidents (`ui.incidents.list`), braking markers
  (`ui.brakes`: speeds, fb), mini-sectors (`ui.sectors`: last, legend), stats (`ui.stats`: rows, slipNow), compare
  (`ui.cmp.last`), g-force (`ui.gg`: trail s/m/l, peaks) and performance (`ui.system.show`).
  The relative always has the rows you chose ahead and behind (empty when no car).
  A widget's or overlay's settings open in a floating window you drag by its title (`floatDrawer`), not a side
  panel, with its live preview always in view on the left and the settings on the right (`.cfgsplit`; stacked on a phone). Changing tab closes the side panel and any open window (`closeOpenPanels`), on the PC as on the web.
  Its live preview is the overlay itself; with no real telemetry it runs the demo data's invented race only inside
  the preview, tagged "Sample data" (`previewDemoTick`), and switches to the real data once the game sends it.
    What the overlays show beyond the basics (`ovnative6.go` keeps the memory): the flags show the start lights (ready,
  set, go), a green for 4 s only, debris, 10 and 5 to go, one lap to green, disqualified; the delta bar a ▲/▼ for the
  last second's trend; the relative and the standings colour the car number by class when several race and offer a
  "pace" column (their last lap against yours); the dash lights the brake bar with the ABS and carries a strip with
  the lap, the place, the delta and the incidents; the timing times the official sectors (SplitTimeInfo) of the lap,
  purple for the session's best, green when better than your best lap's; the fuel says the last lap's use and what
  you may use per lap to finish without a stop; the engine shows the game's EngineWarnings (rows in red, badges for
  the pit limiter, the rev limiter and a stalled engine); the tyres show the three zones (inside, middle, outside)
  and the pressure; the pit stop overlay turns into the pit lane on the pit road (your speed against
  TrackPitSpeedLimit, red when over, the stop's repairs and fuel); the map numbers the official turns and colours the
  classes; the braking markers and the coach name corners by the official turns (`turnName`). The relative marks
  each gap's trend over ten seconds (`gapTrend`: ▼ green catching the car ahead, ▲ red the car behind catching you);
  the timing flashes the lap just finished for 4 s (purple a best, green better than the one before); the delta bar
  shows the lap this pace gives (best + delta, `predict` in its settings); the weather says where the track's
  temperature goes over ten minutes (`trackTrend`); the map and the track bar mark the sectors.
  The overlays in VR (Settings → VR on the PC and Pitlane HQ Desktop, `CFG.ui.vr`: on, distance, size, height):
  every open overlay window also shows in the headset as a SteamVR overlay (OpenVR 2.5.1, `vr/openvr_api.dll`
  embedded and written to %LOCALAPPDATA%\PitlaneHQ\openvr, `vr_windows.go`) with the same picture it draws on the
  screen, where it sits on the main screen (`vrPlace` in vrmath.go: a flat screen of that width at that distance and
  height, each overlay turned to face you), so moving them in Overlays → Edit positions moves them in VR. It joins
  SteamVR only when it is running (a background app, never starting it), lets go when it quits, and Meta headsets
  work through SteamVR as the OpenXR runtime.
  There is no car controls overlay. The overlays' designs (the owner's choice): Lane is the default (still labelled Beta,
  `ovDefaultStyle` in ovtheme.go, `OV_DEFAULT_STYLE` in index.html: every overlay nobody chose a design for), Classic is
  the native look drawn exactly as before, and beside them the Beta designs Lane, Wall, Board, Frameless and Light (Carril, Muro, Pizarra,
  Sin marco, Claro; Faixa, Muro, Quadro, Sem moldura, Claro), each labelled "Beta" wherever it is offered, never replacing
  Classic. One design for all the overlays (Overlays → Design, `ui.ovstyle`) and one per overlay over it (its Configure
  window's Design, `ui.<overlay>.style`, empty follows the one for all); `ovtheme.go` draws them (an `ovTheme` set per
  frame in `ovDraw`, read by the panel, the title, the labels, the faces, the colours and the relative's and standings'
  rows: Lane's big white names, the class bar in our palette, turquoise, violet and orange, straight and rounded, never
  slanted stripes, the class bands with their cars and SOF, the iRating pill, your row in muted gold, the cars out of the
  race faded), the numbers white and bold in every Beta design, and the app's overlay windows approximate them in CSS
  (`OV_STYLES`, `ovStyleOf`, `data-ovs`). The relative and the standings overlays (only the overlays, the owner's choice: never the
  Telemetry tables, the race summary, the leaderboards or the phones) show the
  driver's country flag before the name where the game gives it (iRacing's FlairName; `flagCode`, the flag-icons set, MIT,
  `web/dist/flags/` made by `tools/flags-sprite.js`; "Country flags" in their overlay settings, `ui.rel.flags`/`ui.std.flags`, off by
  default; the race results keep `cc` and `flair` but show no flag) and a clock after it for a penalty to serve (iRacing's black or furled
  black flag on the car, `CarIdxSessionFlags`, which cannot tell a slowdown from another black flag; Le Mans Ultimate's
  `CarIdxNumPenalties`).
  The basic overlays (`OV_BASIC`): radar, delta bar, relative, standings,
  flags, dash, timing, map, fuel, tyres, inputs, pit, brakes, coach, incidents, engine, weather, track bar.
  Experimental (listed with the rest, an "Experimental" pill): compare, boost, gg, stats, sectors, gaps, telemetry, system.
