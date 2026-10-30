# Telemetry screen, rev beep, voice chat and live link

How this part of Pitlane HQ behaves. Read it before changing this area; keep it up to date when the behaviour changes.

- The rev beep (Telemetry → Rev beep, its own sub-tab after Tyres, `v-revbeep`, `renderShiftPanel`/`shiftTick`, `pw.shift`;
  on Pitlane HQ Desktop the "REV BEEP" card at the top of Telemetry opens it): a beep to change up at the revs the driver chooses, kept per car: "Every gear
  at" one RPM, or one for each gear ("My RPM"), or iRacing's shift lights, or the estimate from their own flat-out laps;
  a moment early for the reaction time, pitch and volume, "Beeps in this screen" (the PC by default). No braking beeps
  any more (they did not work well): the Braking markers widget and overlay only show where to brake. There is no voice
  engineer, spotter, radio or audio packs anywhere any more (the owner's choice): the PC never speaks and the only
  sound it makes by itself is the rev beep. The one exception is the voice chat, for admins only (`voice.go`, `VOICE`/
  `voiceIn` in index.html, `/voice/ice` in voiceice.js): a person talking to the driver, never a computer voice. A WebRTC
  call (Opus at 32 kbps at most, nothing sent while nobody talks (DTX, `voiceSdp`), no extra jitter buffer, echo and
  noise cancelled; TURN only when the two cannot reach each other directly) between the driver's PC (the app's page; it answers by
  itself, the driver is driving) and whoever watches it live (a device of the account the PC accepted, or anyone with its
  share code): "Talk to the driver" shows for them only while the PC is live and its account is an admin's. The call's
  messages go through the live room sealed like the telemetry (the agent passes them between the room and the page, and
  one window of the PC answers each call); the voice goes straight between the two. STUN by default, Cloudflare TURN
  when the server has TURN_KEY_ID and TURN_KEY_TOKEN; none in local mode. The bar (who, time, Mute, Hang up) stays above
  every window. Both PC windows let the app's own page use the microphone (Pitlane HQ Desktop's PermissionRequested for
  loopback; the agent's window through go-webview2, patched in vendor/ to read the permission's kind and allow the
  microphone: keep the patch if the library is vendored again). Settings → Phone & sharing has "Test the microphone"
  for admins, and a microphone that fails says why (`voiceMicError`: Windows' privacy switch, none found, in use). Web and PC for now (phone browsers too). Their braking
  points come from the model (the next level for your best lap of the session; your own best lap while the model has
  none or you are its fastest), each marker moves with your speed against that lap and with a car close ahead or
  alongside, and they name their corners by the official turns (`turnNo`, `turnName`), like the coach: "T7", never "C7".
- Telemetry has three modes (`LIVE_MODE`, `liveModeBar`): Basic (the essentials below), Full (every basic widget, the
  experimental ones too (not on a PC without Pro), and the lap's traces of speed, throttle/brake, delta and gear, `drawLiveTraces`)
  and Compare laps, live (`renderLiveCmp`/`tickLiveCmp`: the lap now against B, "My best" in purple, the last lap, other
  laps, and "▲ Next level" / "★ Record" only when the model has a full-telemetry lap of someone else, corner by corner by
  the official turns). Standings: gap to the leader or interval, the class filter only when several classes race, your
  position lap by lap (`renderStandings`, `drawPosHistory`); Tyres show their wear. The rev beep page is a list of cars
  and the chosen car's mode as three cards (iRacing lights, My laps, My RPM with one number or one per gear) and its
  sound (early, pitch, volume, test). Overlays is one list (`renderOverlaysTab`, `.ov-row`): every overlay always (no switch for the
  experimental ones, which keep their "Experimental" pill and ask for Pro on a PC without it), each with its games and its
  "when I get in the car" switch for each game, Open/Closed and Configure, the presets and the buttons on top, "Place on the screen" shows
  the screen editor. The PC app never zooms (Ctrl+wheel and Ctrl +/− blocked, `IsZoomControlEnabled` off).
- In Basic, the Telemetry screen shows only the essentials (`LIVE_ESSENTIAL`: flags, the top card with position, delta, last
  lap and fuel beside the cars ahead and behind, incidents and what is left, the delta bar, the map, the relative,
  fuel and incidents); every other widget is one click away in Layout ("Essentials" puts them back). The live map is
  the coach maps' road with depth, its start/finish line, the direction arrow and the official turns; it has no
  "ideal" line.
- Live in the web and phone apps: Connect/Disconnect for your own PC (presence only until Connect),
  and watching someone else with a share code made on the PC (Settings → Phone) or from the phone.
  The room is one hash of the code and the key a PBKDF2 of it, so the server never reads the
  telemetry; code viewers only watch (no DRINKS, no race summaries). Connect asks the PC first: a
  window there accepts or declines the device (by its name) and nothing is sent to it before you
  accept; an accepted device is remembered while Pitlane HQ runs. A declined device is not asked again by its automatic
  retries for two minutes, but pressing Connect again always asks the PC again (`again` in the hello). No Wi-Fi pairing panel and no
  encryption wording on the Live card. The Live page is: your PC, watch another driver (the code gets
  its dashes as you type), then the download, with the same gap between the boxes.
