# Pitlane HQ 0.8 — iRacing companion

**English** · [Español](#español)

## Download / Descargar

Everything is on one page / Todo en una sola página: **https://github.com/kevincsv/Pitwall-test/releases/tag/pitlanehq-latest**

- Windows: [PitlaneHQ-windows.zip](https://github.com/kevincsv/Pitwall-test/releases/download/pitlanehq-latest/PitlaneHQ-windows.zip)
- Android: [PitlaneHQ-android.apk](https://github.com/kevincsv/Pitwall-test/releases/download/pitlanehq-latest/PitlaneHQ-android.apk)
- iPhone / iPad: [PitlaneHQ.ipa](https://github.com/kevincsv/Pitwall-test/releases/download/pitlanehq-latest/PitlaneHQ.ipa) (Sideloadly)
- Web version / Versión web: [![Deploy to Cloudflare](https://deploy.workers.cloudflare.com/button)](https://deploy.workers.cloudflare.com/?url=https://github.com/kevincsv/Pitwall-test/tree/pitlanehq-latest/cloud)

## Start

1. Copy `PitlaneHQ.exe` to the PC where you run iRacing (any folder, no install).
2. Double-click it. If Windows SmartScreen appears, click **More info → Run anyway** (the app is not signed yet).
3. If the Windows Firewall asks, tick **Private networks** and click **Allow**. This lets your phone connect.
4. A Pitlane HQ window opens. Start iRacing and get in the car: telemetry appears automatically.

Keep the black Pitlane HQ window open while you race. Close it to stop.

## Menus

| Section | Pages |
|---|---|
| **Race** (while you drive) | Live · Standings · Strategy · Tyres |
| **Analysis** (after the session) | Races · Laps · Braking coach · Tracks · Data |
| **Season** | Calendar · Series · News · Goals |
| **Rig** | Overlays · Programs & gear · Haptics · Car profiles · Setups |
| **Community** | Leaderboards, shared laps and analyses |
| **Account** | Account · Settings (also the gear button) |

**Ctrl+K** (or **/**, or the magnifier) opens a quick search: type "fuel", "spotter", "simhub", "cloudflare"… to jump to any page, setting or action. **Alt+1…5** switches section.

## Phone and tablet (Android, iPhone, iPad)

1. Connect the phone to the same Wi-Fi as the PC.
2. In Pitlane HQ on the PC, open **Settings** (gear icon) and scan the QR code, or type the address shown in the black window (for example `http://192.168.1.20:8484`).
3. Install it as an app:
   - **iPhone/iPad**: Safari → Share → *Add to Home Screen*.
   - **Android**: Chrome → ⋮ → *Add to Home screen* / *Install app*.

## What it does

- **Live**: gear, speed, shift lights from the car's real RPM points, pedals, lap timing and delta, fuel per lap and fuel to add, engine temps, tyres, flags, relative and track position.
- **Track map**: drawn automatically from your own car on the first clean lap (iRacing does not provide map coordinates, so Pitlane HQ traces it), then saved and shared with every device. Shows every car live, your line this lap coloured by throttle and brake, your best lap, braking points with how many metres earlier or later you braked, and an estimated ideal line built from your fastest mini-sectors. Every layer can be switched off; the map can be rotated or mirrored.
- **Overlays (RaceLab style)**: relative, standings, radar, car inputs, gear/speed/RPM, DRS and push-to-pass, track map, fuel, tyres, flags, timing and any telemetry value. Each opens in a frameless window that stays on top of iRacing (borderless/windowed mode) without taking focus. The **padlock** at the top of the app (on the PC or the phone) unlocks every overlay so you can drag and resize it, and locks them all again. The **Overlays** tab also shows your screen in miniature: drag the boxes there and the real windows move. Pitlane HQ remembers where you left each one.
- **Automatic**: choose your overlays once (Layout → Auto) and they open by themselves when you get in the car, and close when iRacing closes. Pitlane HQ can also start with Windows.
- **Relative and standings you build yourself**: pick and order the columns (position, class position, number, driver, car, licence, iRating, estimated iRating change, laps, last/best lap, gap, interval, pit stops, places gained, tyre compound, incidents) and the header and footer items (session, time left, laps left, lap, position, SOF, your iRating change, incidents vs limit, fuel laps, delta, track/air temperature, track wetness, real and sim time).
- **Radar**: shows cars alongside and close behind or ahead, and hides itself when nobody is near.
- **DRS and push-to-pass**: state, time or uses left with the unit shown (IndyCar and Super Formula count seconds, shown as minutes:seconds), and how long the current boost has been on (only on cars that have them).
- **Telemetry widget**: pin any of the ~300 iRacing variables from the Data tab and see it live with a mini graph.
- **Rig → Overlays**: one place to choose which overlays open automatically, open or close them, move them on the screen and configure each one with a **live preview** that updates as you change columns or options. A phone can control the overlays on the PC.
- **Your own Live screen**: drag any block by its ⠿ handle to move it, change its width in Layout, or hide it. The blocks always stretch to fill each row, so there are no gaps when you move things. Each device remembers its own layout.
- **Delta bar**: a wide bar that shows at a glance whether you are gaining (green) or losing (red) against your best lap.
- **G-force circle**: braking, acceleration and cornering grip with a trail, plus the peaks of the session.
- **Driving stats** (inspired by Cosworth Pi Toolbox): time at full throttle, coasting, braking, peak braking, gear shifts and slip angle per lap.
- **Lap comparison**: your best lap of the session (it updates every time you go faster), your last lap and the lap you are driving, overlaid by distance: speed, throttle and brake, time delta, gear, steering or RPM, with a live "now vs best" delta. "Follow me" zooms in around where you are. **+ Garage 61** adds a lap from Garage 61 (yours, a teammate's or a fast driver's) as an extra reference.
- **Readable telemetry**: every iRacing variable shows a plain name (for example "Brake bias" instead of dcBrakeBias), in English or Spanish, with the original code underneath.
- **Tyres**: inner/middle/outer temperature per tyre with a heat map, tread per zone, cold pressures, live brake pressure, front/rear and left/right balance, camber and pressure hints, and a log of every pit reading. iRacing only sends tyre data when you stop in your pit box.
- **Series**: every active series with filters (category, licence, what your licence allows, what you own, setup, length, favourites, starting soon), next race countdown, weather, full 12-week schedule per series.
- **Schedule**: upcoming races of your favourites, a personal plan, and export to your phone's calendar with a reminder 15 minutes before.
- **Season plan**: favourites × weeks grid showing which tracks you own, the best track to buy, and whether you can still earn the participation credit.
- **Standings**: the full field with licence, iRating, laps, last/best lap, gap and incidents.
- **Laps**: records each lap while the app is open and compares two laps (speed trace, cumulative delta, sectors).
- **Data**: every variable iRacing exposes (about 300 at 60 Hz) live, plus the full session info.
- **Account**: iRating history, licence, recent races and an explorer for any iRacing Data API endpoint.
- **Language**: English (default), Spanish, or both at the same time. Settings → Language.

## Profiles (several people on one PC)

The round button at the top right (with your initial) opens **Profiles**. Each person gets their own profile with their settings, language, overlays and their positions, Live layout, favourite series and race plan, programs to start, and their own iRacing and Garage 61 sign-ins. Switch profile and every open screen and overlay changes to that person's setup.

- Everything stays on the PC in `%APPDATA%\PitlaneHQ\profiles\`. Nothing is uploaded to any cloud.
- Sign-ins are **encrypted with Windows (DPAPI)**: only your Windows user on this PC can read them. Older plain files are encrypted automatically the first time 0.8 starts.
- **Export** saves a profile file (settings and layouts only, never sign-ins) to copy to another PC; **Import a profile file** loads it there.
- Phones and tablets keep their own Live layout; language, units, favourites and the rest follow the profile.

## Rig tab: your programs, SimHub, AZOM and MOZA

**Programs.** Pitlane HQ looks for iRacing, Steam, Crew Chief, Garage 61, TrackImpulse, SimHub, MOZA Pit House, RaceLab, Coach Dave Delta, Track Titan, VRS, iOverlay, Kapps, Discord and OBS (known folders, Start menu and installed programs). Add the ones you want and choose for each one:

- **With Pitlane HQ**: starts when Pitlane HQ opens.
- **When iRacing starts**: starts each time the sim starts.
- **Only by hand**: stays in the list with a Start button.

You can start them minimised, change the order, start them all at once, remove them, and add any other program from the Start menu or with **Browse…**. Programs that are already open are left alone. Turn on **Start with Windows** (Rig → Overlays) and your whole rig starts by itself. For safety, a phone can only start programs you already added on the PC.

**SimHub.** Start, show, minimise or close SimHub and switch it to iRacing. Every dashboard and overlay in SimHub is listed with its preview: **Open** it in a window, put it **On Live**, or open it as a Pitlane HQ **overlay** window on top of iRacing. **Import .simhubdash** sends a dashboard file to SimHub (also from your phone). The **SimHub dashboard** widget shows any SimHub dashboard live (SimHub's web server must be on, port 8888).

**AZOM (MOZA wheels in SimHub).** Pitlane HQ carries its own copy of the AZOM plugin (source in the `azom` folder, copied from [giantorth/AZOM](https://github.com/giantorth/AZOM), GPL v3). **Install in SimHub** closes SimHub, copies the plugin into its folder (Windows asks for permission once if SimHub is in Program Files), keeps the previous version as a backup and opens SimHub again; **Update**, **Remove** and **Previous version** work the same way. With AZOM installed, Pitlane HQ controls the wheel screen (page, on/off, telemetry, brightness), the wheelbase (FFB strength, torque, rotation, damper, friction, inertia, spring and more, in fine or big steps), switches like reverse FFB and hands-off protection, centre calibration and LEDs. It can also change the wheel screen page, brightness, work mode and centre, and run any other SimHub action by name. Pitlane HQ warns you when MOZA Pit House is open (AZOM needs it closed) and can close it for you.

**MOZA Pit House.** Open Pit House or Dashboard Studio, see your MOZA dashboards (`.mzdash`), add one from a file (even from your phone) and open it in Dashboard Studio to send it to the wheel. MOZA has no public API to upload dashboards, so that last click (Upload) happens in Dashboard Studio or with AZOM's upload button.

## New Live widgets in 0.8

- **Pit stop calculator**: stops left, pit window (first and last lap), fuel to add, and where you would rejoin given your pit loss (−/+ to adjust per track).
- **Mini-sectors**: the lap split into 24 parts, coloured purple (best of the session), green (faster than your best lap) or yellow, with your ideal lap.
- **Gap graph**: how the gap to the cars around you changes over the last minutes, and whether you are catching them.
- **Incident log**: every incident with lap and place on track, against the session limit.

## Calendar, phone apps and your own web version

- **Season → Calendar**: only what you add. **+ Add race** → choose the series (favourites, what your licence allows, what you own or all; search and category) → choose the day and time it runs → it is in your calendar, the reminders and the phone widget. Also your own events (league races, practice, times you are not available), clashes in red, optional suggestions from your favourites, reminders 5/15/30/60 minutes before and export to any calendar (.ics).
- **iPhone/iPad app** (see `ios/README.md`): reminders before each race even with the app closed, and a **Next races** widget for the home screen and lock screen.
- **Android app**: GitHub Actions → *Build Android app* → **PitlaneHQ-android** (install the .apk). Same reminders and a **Next races** home-screen widget with a live countdown.
- **Pitlane HQ Cloud** (see `cloud/README.md`): your own free website on Cloudflare. Pitlane HQ records every lap (even with the screen closed) and uploads it; open the site anywhere to see sessions, records per track and car, and compare laps.

## Haptics (Rig → Haptics)

- **SimHub ShakeIt** (recommended for Simsonn Pro Haptics and MOZA pedal haptics through AZOM): mute, unmute and change the strength of bass shakers and motors from Pitlane HQ. Warns you when SIMSONN Manager is open, because Simsonn asks not to use it together with SimHub.
- **Pitlane HQ engine**: Pitlane HQ's own effects for bass shakers on any sound card or USB sound box (2, 4, 6 or 8 channels): engine, gear shifts, road and kerbs (left/right), ABS, impacts and off track, each with strength, frequency, the channels it goes to and a **Feel it** test.

## Coaching, strategy and more

- **Voice engineer and spotter** (Race → Engineer), like CrewChief. Buttons to choose what it tells you: spotter (car left / right, three wide, clear), off track, incidents, flags, places gained or lost, laps or minutes to go, lap time and personal best, gaps, fuel, *box this lap*, pit limiter, water / oil warnings and a braking tip. Presets (All, Race, Practice, Spotter only) and *wait for the straight* so it does not talk while you brake or turn.
  - **Ask it**: fuel, gaps, position, last lap, how long left, pit stop, incidents, delta, quiet / talk. Press the buttons on the page, on the phone (Live → Radio, the phone becomes a button box) or bind them to **wheel or button box buttons** (Windows app; works while iRacing has the focus).
  - **Your own audio packs**: record each phrase with its name (`car_left.mp3`, `off_track.wav`, …; a folder such as `car_left/1.mp3`, `car_left/2.mp3` for several takes) and add a .zip or a folder. *Phrase list* shows every name with what to say (copy or save it). Numbers (`n_0` … `n_99`, `point`) are optional. Anything not recorded is said by the computer voice. Packs are kept in your profile folder.
- **Braking coach** (Analysis → Braking coach, and a Live widget): compares a lap with your best lap or a Garage 61 lap corner by corner: braking point (metres earlier or later), entry and minimum speed, time won or lost, and a tip for the three corners that cost the most.
- **Exact deltas**: every lap keeps the time at each 5 m, interpolated between telemetry samples, so comparisons are accurate to about a millisecond. The delta bar can compare with your best, the session best, the optimal lap or Pitlane HQ's own recorded best, with the range you choose.
- **Endurance strategy** (Race → Strategy): race length, drivers and their maximum stint, fuel, tank, pit loss, refuelling speed and tyre changes give a stint plan (laps, fuel to add, tyres, stop time) that follows the race live ("box in 9").
- **Goals** (Season → Goals): iRating, licence and safety rating, races per week, incidents per race and lap time targets per track and car, with progress.
- **Car profiles** (Rig → Car profiles): save overlays, haptics and SimHub/AZOM actions for each car; they are applied when you get in it.
- **Setups** (Rig → Setups): every setup in Documents\iRacing\setups with notes, tags and your best lap with it at each track.
- **Team on the web**: your Pitlane HQ Cloud can have team mates with their own keys; records per track and car for the whole team and comparison with the team's fastest lap.
- **Settings** now holds everything you set up once: general, profiles, connections (iRacing, Garage 61, Pitlane HQ Cloud), phone and engineer view.
- **Inputs widget**: choose gear, speed, wheel and angle, pedal bars (vertical or horizontal), values, ABS light, trace lines (incl. steering and ABS zones), trace length and height. Live blocks resize from their corner; overlays from any edge in edit mode.

## Race reports, tracks, beeps and more (0.10)

- **Race reports** (Analysis → Races): after every race, automatically: start and finish, places gained, incidents, best lap against the fastest, average and consistency, fuel, stops, SOF and an **iRating estimate** (the official change too when you are signed in to iRacing). Lap-time and position charts and your class results. History with totals.
- **Tracks** (Analysis → Tracks): best lap and **fuel per lap** for each car at each track, learned while you drive, and your **notes per corner**. The engineer reads them a few seconds before each corner in your first laps ("Read my track notes").
- **Prepare a race**: tap a race in the calendar: track and car (and whether you own them), length and laps, weather, your best lap there, **fuel needed** (and stops if it does not fit in the tank), your setups with laps there, and your notes.
- **Braking markers** (Live widget and overlay): the next corner, the distance to your braking point from your best lap, 1 or 3 beeps, and afterwards how many metres early or late you braked. **With a car close ahead** it moves the marker earlier (more the closer it is) and does not count that corner.
- **Shift beep** (Rig → Car profiles): on/off and settings **for each car**: iRacing's shift lights, an **estimated best shift RPM** for each gear (from your own flat-out acceleration) or your own RPM per gear; how early it sounds, tone and volume. The dash shift lights follow it.
- **Engineer: multiclass and rain**: "faster class behind, 2 seconds", "slower car ahead"; rain starting / heavier / easing / stopped with iRacing's **precipitation %**, the **track wetness** level (dry … extremely wet), **wet declared**, and when to think about wets or slicks. Ask it "weather".
- **Discord** (Settings → Connections): your results posted automatically, and "Share on Discord" for your next races. The webhook link is stored encrypted.
- **Updates**: the Windows app checks the downloads page and updates itself with one click (Settings → About, or the banner).

- **Haptics engine effects** like TrackImpulse: wheelspin, traction control, wheel lock, slide, braking g, bottoming, rev limiter and pit limiter, each with how it is worked out from iRacing's telemetry.
- **Car profiles**: a **general profile** for any car without its own; select and remove cars you do not need.
- **Account**: recent races open their details; safety rating history, this year and career by category, and what Pitlane HQ recorded. Race reports show the **track map with your braking points and those of the drivers around you**.

- **Race analysis**: for every lap, sector times, gaps to the cars ahead and behind, % flat out, braking and with no pedal, top speed, gear changes, fuel, time in the pits and track temperature; your **ideal lap** from your best sectors, and automatic tips (least consistent sector, pace drop, time lost in traffic, coasting, where the incidents were). On the track map: **incidents** (✕) and the **coach** marking the corners where you lose time against the driver you compare with.
- **Season → News**: iRacing news from iracing.com.

- **Installer** `PitlaneHQ-Setup.exe` (no administrator needed), **phone PIN** (Settings → Phone: devices on your network pair with a PIN or QR), **Account → Subscription** (Free / Pro monthly / Pro yearly / Lifetime, licence key) — see `docs/SELLING.md`.

> **This version (0.14):** telemetry and analysis only. The voice engineer, the spotter and the subscription page are switched off (`FEATURES` in `web/dist/index.html`); the shift and braking beeps stay.

- **Community** (new tab): you decide what to share (nothing by default): your best lap times, the whole lap (telemetry) and your race analyses (other drivers' names are removed). Leaderboards per track and car, shared race analyses, and **Compare** loads someone's lap as the reference in the braking coach. Server set-up: `cloud/README.md`.

## Streaming the data elsewhere (OBS, dashboards, scripts)

| Address | What you get |
|---|---|
| `/api/stream?vars=*&hz=60` | Server-Sent Events stream of every variable. `vars=Speed,RPM,Gear` to pick, `hz=1…60` |
| `/api/snapshot` | All variables once, JSON |
| `/api/schema` | Name, type, unit and description of each variable |
| `/api/session` | Session info YAML (drivers, track, weather, setup, results) |
| `/api/iracing/<endpoint>` | Any iRacing Data API endpoint, e.g. `/api/iracing/member/info` |

Add `http://localhost:8484` as a Browser Source in OBS to show the app on stream.

## Engineer view (another PC, tablet or phone)

Settings → **Engineer view**.

- **Same network**: open the address shown there (it ends in `/?view=engineer`) or scan its QR code on the other device.
- **From another house**: press **Create link**. Pitlane HQ downloads Cloudflare's free `cloudflared` tool once and gives you a private `https://….trycloudflare.com` link with a secret key. Send it to your engineer. The link only lets them watch (telemetry, map, relative, laps, tyres); they cannot change settings, overlays or see your account. It stops working when you press **Stop sharing** or close Pitlane HQ, and a new link is different every time.

## Garage 61 (optional)

Create a personal token at https://garage61.net/developer and paste it in Settings → Connections → Garage 61. Then use **+ Garage 61** in the lap comparison to load a reference lap for your car and track. The token is stored encrypted in your profile folder and only sent to Garage 61.

## iRacing account (optional)

iRacing requires a registered OAuth client to read account data. As of October 2026 iRacing has **paused creating new client IDs** while it reviews third-party use (https://support.iracing.com/support/solutions/articles/31000177790-oauth-client-credentials). Until then the Series tab shows a real sample season. When it reopens, request a **password limited** client for personal use. Enter the Client ID, secret, your iRacing email and password once in Settings → Connections. The password is only sent to iRacing and never saved; the sign-in is stored encrypted in your profile folder.

## iPhone / iPad app

See `source/ios/README.md` to build it for free without a Mac and install it from Windows. / Mira `source/ios/README.md` para compilarla gratis sin Mac e instalarla desde Windows.

## Options

`PitlaneHQ.exe -port 9000` uses another port. `-demo` starts with a simulated race. `-no-browser` does not open the window.

---

## Español

## Arrancar

1. Copia `PitlaneHQ.exe` al PC donde usas iRacing (cualquier carpeta, no se instala).
2. Haz doble clic. Si aparece Windows SmartScreen, pulsa **Más información → Ejecutar de todas formas** (la app aún no está firmada).
3. Si el Firewall de Windows pregunta, marca **Redes privadas** y pulsa **Permitir**. Así el móvil puede conectarse.
4. Se abre la ventana de Pitlane HQ. Abre iRacing y súbete al coche: la telemetría aparece sola.

Deja abierta la ventana negra de Pitlane HQ mientras corres. Ciérrala para parar.

## Menús

| Sección | Páginas |
|---|---|
| **Carrera** (mientras conduces) | En vivo · Posiciones · Estrategia · Neumáticos |
| **Análisis** (después de la sesión) | Carreras · Vueltas · Coach de frenada · Circuitos · Datos |
| **Temporada** | Calendario · Series · Noticias · Objetivos |
| **Rig** | Overlays · Programas y equipo · Hápticos · Perfiles por coche · Setups |
| **Comunidad** | Clasificaciones, vueltas y análisis compartidos |
| **Cuenta** | Cuenta · Ajustes (también el botón del engranaje) |

**Ctrl+K** (o **/**, o la lupa) abre un buscador rápido: escribe "gasolina", "spotter", "simhub", "cloudflare"… para ir a cualquier página, ajuste o acción. **Alt+1…5** cambia de sección.

## Móvil y tablet (Android, iPhone, iPad)

1. Conecta el móvil a la misma WiFi que el PC.
2. En Pitlane HQ en el PC, abre **Ajustes** (icono de engranaje) y escanea el código QR, o escribe la dirección que muestra la ventana negra (por ejemplo `http://192.168.1.20:8484`).
3. Instálala como app:
   - **iPhone/iPad**: Safari → Compartir → *Añadir a pantalla de inicio*.
   - **Android**: Chrome → ⋮ → *Añadir a pantalla de inicio* / *Instalar app*.

## Qué hace

- **En vivo**: marcha, velocidad, luces de cambio con las RPM reales del coche, pedales, tiempos y delta, consumo por vuelta y combustible a añadir, temperaturas, neumáticos, banderas, relative y posición en pista.
- **Mapa del circuito**: se dibuja solo con tu coche en la primera vuelta limpia (iRacing no da coordenadas del circuito, así que Pitlane HQ lo traza), se guarda y se comparte con todos tus dispositivos. Muestra todos los coches en vivo, tu trazada de esta vuelta coloreada por acelerador y freno, tu mejor vuelta, los puntos de frenada con cuántos metros antes o después frenaste, y una línea ideal estimada con tus mini-sectores más rápidos. Cada capa se puede desactivar; el mapa se puede girar o reflejar.
- **Overlays (estilo RaceLab)**: relative, clasificación, radar, pedales, marcha/velocidad/RPM, DRS y push-to-pass, mapa, combustible, neumáticos, banderas, tiempos y cualquier valor de telemetría. Cada uno se abre en una ventana sin bordes que queda encima de iRacing (modo ventana o sin bordes) sin quitarle el foco. El **candado** de arriba de la app (en el PC o en el móvil) desbloquea todos los overlays para moverlos y cambiar su tamaño, y los vuelve a bloquear. La pestaña **Overlays** también muestra tu pantalla en miniatura: arrastra los recuadros y las ventanas reales se mueven. Pitlane HQ recuerda dónde dejaste cada uno.
- **Automático**: elige tus overlays una vez (Diseño → Auto) y se abren solos al subirte al coche, y se cierran al cerrar iRacing. Pitlane HQ también puede iniciarse con Windows.
- **Relative y clasificación a tu medida**: elige y ordena las columnas (posición, posición en clase, número, piloto, coche, licencia, iRating, cambio de iRating estimado, vueltas, última/mejor vuelta, gap, intervalo, paradas, posiciones ganadas, compuesto, incidentes) y lo que va en la cabecera y el pie (sesión, tiempo restante, vueltas restantes, vuelta, posición, SOF, tu cambio de iRating, incidentes vs límite, vueltas de gasolina, delta, temperatura de pista/aire, humedad de pista, hora real y del simulador).
- **Radar**: muestra los coches a tu lado y cerca por delante o por detrás, y se oculta solo cuando no hay nadie cerca.
- **DRS y push-to-pass**: estado, tiempo o usos restantes con su unidad (IndyCar y Super Formula cuentan segundos, mostrados como minutos:segundos), y cuánto tiempo lleva activo (solo en coches que lo tienen).
- **Widget de telemetría**: fija cualquiera de las ~300 variables de iRacing desde la pestaña Datos y mírala en vivo con una mini gráfica.
- **Pestaña Overlays**: un solo sitio para elegir qué overlays se abren solos, abrirlos o cerrarlos, moverlos en la pantalla y configurar cada uno con una **vista previa en vivo** que cambia mientras eliges columnas u opciones. Desde el móvil puedes controlar los overlays del PC.
- **Tu propia pantalla En vivo**: arrastra cualquier bloque por su asa ⠿ para moverlo, cambia su ancho en Diseño u ocúltalo. Los bloques siempre se estiran para llenar cada fila, así no quedan huecos al moverlos. Cada dispositivo recuerda su diseño.
- **Barra de delta**: una barra ancha que muestra de un vistazo si ganas (verde) o pierdes (rojo) tiempo contra tu mejor vuelta.
- **Círculo de fuerzas G**: frenada, aceleración y agarre en curva con estela, más los picos de la sesión.
- **Estadísticas de conducción** (inspiradas en Cosworth Pi Toolbox): tiempo a fondo, sin pedales, frenando, pico de frenada, cambios de marcha y ángulo de deriva por vuelta.
- **Comparación de vueltas**: tu mejor vuelta de la sesión (se actualiza cada vez que mejoras), tu última vuelta y la que estás dando, superpuestas por distancia: velocidad, acelerador y freno, diferencia de tiempo, marcha, volante o RPM, con el delta "ahora vs mejor" en vivo. "Seguirme" hace zoom donde estás. **+ Garage 61** añade una vuelta de Garage 61 (tuya, de un compañero o de alguien rápido) como referencia extra.
- **Telemetría legible**: cada variable de iRacing muestra un nombre claro (por ejemplo "Reparto de frenada" en vez de dcBrakeBias), en inglés o español, con el código original debajo.
- **Neumáticos**: temperatura interior/centro/exterior de cada rueda con mapa de calor, desgaste por zona, presiones en frío, presión de freno en vivo, balance delante/detrás e izquierda/derecha, consejos de caída y presión, y registro de cada lectura en boxes. iRacing solo envía datos de neumáticos al parar en tu box.
- **Series**: todas las series activas con filtros (categoría, licencia, lo que tu licencia permite, lo que tienes comprado, setup, duración, favoritas, empieza pronto), cuenta atrás, clima y calendario de 12 semanas.
- **Agenda**: próximas carreras de tus favoritas, tu plan personal y exportación al calendario del móvil con aviso 15 minutos antes.
- **Plan de temporada**: cuadrícula favoritas × semanas con los circuitos que tienes, el mejor circuito para comprar y si aún puedes conseguir el crédito de participación.
- **Posiciones**: toda la parrilla con licencia, iRating, vueltas, última/mejor vuelta, gap e incidentes.
- **Vueltas**: graba cada vuelta mientras la app está abierta y compara dos (velocidad, delta acumulado, sectores).
- **Datos**: todas las variables que expone iRacing (unas 300 a 60 Hz) en vivo, más toda la información de sesión.
- **Cuenta**: historial de iRating, licencia, carreras recientes y un explorador de cualquier endpoint de la Data API.
- **Idioma**: inglés (por defecto), español o los dos a la vez. Ajustes → Idioma.

## Perfiles (varias personas en un PC)

El botón redondo de arriba a la derecha (con tu inicial) abre **Perfiles**. Cada persona tiene su perfil con sus ajustes, idioma, overlays y sus posiciones, diseño de En vivo, series favoritas y plan, programas a iniciar y sus propias sesiones de iRacing y Garage 61. Al cambiar de perfil, todas las pantallas y overlays abiertos pasan a la configuración de esa persona.

- Todo se queda en el PC en `%APPDATA%\PitlaneHQ\profiles\`. No se sube nada a ninguna nube.
- Las sesiones se **cifran con Windows (DPAPI)**: solo tu usuario de Windows en este PC puede leerlas. Los archivos antiguos sin cifrar se cifran solos la primera vez que arranca la 0.8.
- **Exportar** guarda un archivo de perfil (solo ajustes y diseños, nunca sesiones) para llevarlo a otro PC; **Importar un archivo de perfil** lo carga allí.
- Móviles y tablets mantienen su propio diseño de En vivo; idioma, unidades, favoritas y lo demás siguen al perfil.

## Pestaña Rig: tus programas, SimHub, AZOM y MOZA

**Programas.** Pitlane HQ busca iRacing, Steam, Crew Chief, Garage 61, TrackImpulse, SimHub, MOZA Pit House, RaceLab, Coach Dave Delta, Track Titan, VRS, iOverlay, Kapps, Discord y OBS (carpetas conocidas, menú Inicio y programas instalados). Añade los que quieras y elige para cada uno:

- **Con Pitlane HQ**: se abre al abrir Pitlane HQ.
- **Al abrir iRacing**: se abre cada vez que arranca el simulador.
- **Solo a mano**: queda en la lista con un botón Iniciar.

Puedes abrirlos minimizados, cambiar el orden, abrirlos todos a la vez, quitarlos y añadir cualquier otro programa del menú Inicio o con **Buscar…**. Los que ya están abiertos no se tocan. Activa **Iniciar con Windows** (Rig → Overlays) y todo tu equipo arranca solo. Por seguridad, un móvil solo puede abrir programas que ya añadiste en el PC.

**SimHub.** Abre, muestra, minimiza o cierra SimHub y cámbialo a iRacing. Aparecen todos tus dashboards y overlays de SimHub con su vista previa: **Ábrelo** en una ventana, ponlo **En vivo** o ábrelo como **overlay** de Pitlane HQ encima de iRacing. **Importar .simhubdash** envía un dashboard a SimHub (también desde el móvil). El widget **Dashboard de SimHub** muestra cualquier dashboard en vivo (el servidor web de SimHub debe estar activo, puerto 8888).

**AZOM (volantes MOZA en SimHub).** Pitlane HQ lleva su propia copia del plugin AZOM (código en la carpeta `azom`, copiado de [giantorth/AZOM](https://github.com/giantorth/AZOM), GPL v3). **Instalar en SimHub** cierra SimHub, copia el plugin en su carpeta (Windows pide permiso una vez si SimHub está en Archivos de programa), guarda la versión anterior como copia y vuelve a abrir SimHub; **Actualizar**, **Quitar** y **Versión anterior** funcionan igual. Con AZOM instalado, Pitlane HQ controla la pantalla del volante (página, encendido, telemetría, brillo), la base (fuerza FFB, par, rotación, amortiguación, fricción, inercia, muelle y más, en pasos finos o grandes), interruptores como invertir FFB y protección sin manos, el centrado y los LEDs. También puede cambiar la página de la pantalla del volante, el brillo, el modo de trabajo y el centrado, y ejecutar cualquier otra acción de SimHub por su nombre. Te avisa cuando MOZA Pit House está abierto (AZOM necesita que esté cerrado) y puede cerrarlo por ti.

**MOZA Pit House.** Abre Pit House o Dashboard Studio, mira tus dashboards de MOZA (`.mzdash`), añade uno desde un archivo (incluso desde el móvil) y ábrelo en Dashboard Studio para enviarlo al volante. MOZA no tiene API pública para subir dashboards, así que ese último clic (Upload) se hace en Dashboard Studio o con el botón de subir de AZOM.

## Widgets nuevos en la 0.8

- **Calculadora de parada**: paradas que quedan, ventana de parada (primera y última vuelta), gasolina a añadir y dónde saldrías según tu pérdida en boxes (−/+ para ajustarla por circuito).
- **Mini-sectores**: la vuelta en 24 partes, en morado (mejor de la sesión), verde (más rápido que tu mejor vuelta) o amarillo, con tu vuelta ideal.
- **Gráfica de gaps**: cómo cambia el gap con los coches de alrededor en los últimos minutos y si los estás alcanzando.
- **Registro de incidentes**: cada incidente con vuelta y punto de la pista, frente al límite de la sesión.

## Calendario, apps del móvil y tu propia versión web

- **Temporada → Calendario**: solo lo que tú añades. **+ Añadir carrera** → eliges la serie (favoritas, lo que tu licencia permite, lo que tienes o todas; con buscador y categoría) → eliges el día y la hora en que corre → queda en tu calendario, en los avisos y en el widget del móvil. También tus propios eventos (carreras de liga, prácticas, ratos en que no estás disponible), solapes en rojo, sugerencias opcionales de tus favoritas, avisos 5/15/30/60 minutos antes y exportación a cualquier calendario (.ics).
- **App de iPhone/iPad** (mira `ios/README.md`): avisos antes de cada carrera aunque la app esté cerrada, y un widget **Próximas carreras** para la pantalla de inicio y la de bloqueo.
- **App de Android**: GitHub Actions → *Build Android app* → **PitlaneHQ-android** (instala el .apk). Los mismos avisos y un widget **Próximas carreras** con cuenta atrás en vivo.
- **Pitlane HQ Cloud** (mira `cloud/README.md`): tu propia web gratuita en Cloudflare. Pitlane HQ graba cada vuelta (aunque la pantalla esté cerrada) y la sube; abre la web desde cualquier sitio para ver sesiones, récords por circuito y coche, y comparar vueltas.

## Hápticos (Rig → Hápticos)

- **SimHub ShakeIt** (recomendado para Simsonn Pro Haptics y hápticos de pedales MOZA vía AZOM): silencia, activa y cambia la intensidad de bass shakers y motores desde Pitlane HQ. Avisa si SIMSONN Manager está abierto, porque Simsonn pide no usarlo a la vez que SimHub.
- **Motor de Pitlane HQ**: efectos propios para bass shakers en cualquier tarjeta o caja de sonido USB (2, 4, 6 u 8 canales): motor, cambios de marcha, asfalto y pianos (izquierda/derecha), ABS, impactos y fuera de pista, cada uno con fuerza, frecuencia, los canales a los que va y un botón **Probar**.

## Coach, estrategia y más

- **Ingeniero por voz y spotter** (Carrera → Ingeniero), como CrewChief. Botones para elegir qué te dice: spotter (coche a la izquierda / derecha, tres en paralelo, libre), fuera de pista, incidentes, banderas, posiciones ganadas o perdidas, vueltas o minutos restantes, tiempo de vuelta y récord, gaps, gasolina, *box esta vuelta*, limitador en pit lane, avisos de agua / aceite y un consejo de frenada. Ajustes rápidos (Todo, Carrera, Entreno, Solo spotter) y *espera a la recta* para que no hable mientras frenas o giras.
  - **Pregúntale**: gasolina, gaps, posición, última vuelta, cuánto queda, parada, incidentes, delta, callar / hablar. Con los botones de la página, desde el móvil (En vivo → Radio, el móvil hace de botonera) o asignándolos a **botones del volante o de una botonera** (app de Windows; funcionan con iRacing en primer plano).
  - **Tus propios paquetes de audio**: graba cada frase con su nombre (`car_left.mp3`, `off_track.wav`, …; una carpeta como `car_left/1.mp3`, `car_left/2.mp3` para varias versiones) y añade un .zip o una carpeta. *Lista de frases* muestra todos los nombres con lo que hay que decir (cópiala o guárdala). Los números (`n_0` … `n_99`, `point`) son opcionales. Lo que no grabes lo dice la voz del ordenador. Los paquetes se guardan en la carpeta de tu perfil.
- **Coach de frenada** (Análisis → Coach de frenada, y widget en En vivo): compara una vuelta con tu mejor vuelta o una de Garage 61 curva a curva: punto de frenada (metros antes o después), velocidad de entrada y mínima, tiempo ganado o perdido, y un consejo para las tres curvas que más cuestan.
- **Deltas exactos**: cada vuelta guarda el tiempo cada 5 m, interpolado entre muestras de telemetría, así las comparaciones son precisas a ~1 milésima. La barra de delta puede compararse con tu mejor vuelta, la mejor de la sesión, la vuelta óptima o la mejor grabada por Pitlane HQ, con el rango que elijas.
- **Estrategia de resistencia** (Carrera → Estrategia): duración, pilotos y su stint máximo, gasolina, depósito, pérdida en boxes, velocidad de repostaje y cambio de ruedas dan un plan de stints (vueltas, gasolina a añadir, ruedas, tiempo de parada) que sigue la carrera en vivo ("box en 9").
- **Objetivos** (Temporada → Objetivos): iRating, licencia y safety rating, carreras por semana, incidentes por carrera y tiempos objetivo por circuito y coche, con progreso.
- **Perfiles por coche** (Rig → Perfiles por coche): guarda overlays, hápticos y acciones de SimHub/AZOM para cada coche; se aplican al subirte a él.
- **Setups** (Rig → Setups): todos los setups de Documentos\iRacing\setups con notas, etiquetas y tu mejor vuelta con cada uno en cada circuito.
- **Equipo en la web**: tu Pitlane HQ Cloud puede tener compañeros con su propia clave; récords por circuito y coche de todo el equipo y comparación con la vuelta más rápida del equipo.
- **Ajustes** reúne todo lo que se configura una vez: general, perfiles, conexiones (iRacing, Garage 61, Pitlane HQ Cloud), móvil y vista de ingeniero.
- **Widget de pedales**: elige marcha, velocidad, volante y ángulo, barras de pedales (verticales u horizontales), valores, aviso de ABS, líneas de la gráfica (incluido volante y zonas de ABS), duración y altura. Los bloques de En vivo cambian de tamaño desde su esquina; los overlays desde cualquier borde en modo edición.

## Informes de carrera, circuitos, pitidos y más (0.10)

- **Informes de carrera** (Análisis → Carreras): tras cada carrera, solo: salida y llegada, posiciones ganadas, incidentes, mejor vuelta frente a la más rápida, media y regularidad, gasolina, paradas, SOF y un **iRating estimado** (y el cambio oficial si has iniciado sesión en iRacing). Gráficas de tiempos y posición y los resultados de tu clase. Historial con totales.
- **Circuitos** (Análisis → Circuitos): mejor vuelta y **gasolina por vuelta** de cada coche en cada circuito, aprendidas mientras conduces, y tus **notas por curva**. El ingeniero las lee unos segundos antes de cada curva en tus primeras vueltas («Leer mis notas del circuito»).
- **Preparar una carrera**: toca una carrera del calendario: circuito y coche (y si los tienes), duración y vueltas, clima, tu mejor vuelta allí, **gasolina necesaria** (y paradas si no cabe en el depósito), tus setups con vuelta allí y tus notas.
- **Marcas de frenada** (widget de En vivo y overlay): la próxima curva, la distancia a tu punto de frenada de tu mejor vuelta, 1 o 3 pitidos, y después cuántos metros antes o tarde frenaste. **Con un coche justo delante** adelanta la marca (más cuanto más cerca) y esa curva no cuenta.
- **Pitido de cambio** (Rig → Perfiles por coche): activar/desactivar y ajustes **por coche**: luces de cambio de iRacing, **RPM óptimas estimadas** por marcha (a partir de tu propia aceleración a fondo) o tus propias RPM por marcha; cuánto se adelanta, tono y volumen. Las luces del dash lo siguen.
- **Ingeniero: multiclase y lluvia**: «clase más rápida detrás, a 2 segundos», «coche más lento delante»; empieza a llover / llueve más / menos / ha parado con el **% de precipitación** de iRacing, el nivel de **mojado de la pista** (seca … extremadamente mojada), **pista declarada mojada** y cuándo pensar en neumáticos de lluvia o slicks. Pregúntale «tiempo».
- **Discord** (Ajustes → Conexiones): tus resultados se publican solos, y «Compartir en Discord» para tus próximas carreras. El enlace del webhook se guarda cifrado.
- **Actualizaciones**: la app de Windows mira la página de descargas y se actualiza con un clic (Ajustes → Acerca de, o el aviso de arriba).

- **Efectos del motor háptico** como TrackImpulse: patinaje, control de tracción, bloqueo, derrape, g de frenada, tocar fondo, limitador de vueltas y de pit, cada uno con cómo se calcula a partir de la telemetría de iRacing.
- **Perfiles por coche**: un **perfil general** para cualquier coche sin perfil propio; selecciona y quita los coches que no necesites.
- **Cuenta**: las carreras recientes abren su detalle; historial de safety rating, este año y trayectoria por categoría, y lo registrado por Pitlane HQ. Los informes de carrera muestran el **mapa del circuito con tus puntos de frenada y los de los pilotos a tu alrededor**.

- **Análisis de carrera**: en cada vuelta, sectores, gaps con el de delante y el de detrás, % a fondo, frenando y sin pedales, velocidad punta, cambios de marcha, gasolina, tiempo en boxes y temperatura de pista; tu **vuelta ideal** con tus mejores sectores, y consejos automáticos (sector menos regular, caída de ritmo, tiempo perdido con tráfico, ir sin pedales, dónde fueron los incidentes). En el mapa: los **incidentes** (✕) y el **coach** marcando las curvas donde pierdes tiempo frente al piloto con el que comparas.
- **Temporada → Noticias**: las noticias de iRacing desde iracing.com.

- **Instalador** `PitlaneHQ-Setup.exe` (sin administrador), **PIN del móvil** (Ajustes → Móvil: los dispositivos de tu red se emparejan con un PIN o QR), **Cuenta → Suscripción** (Gratis / Pro mensual / Pro anual / De por vida, clave de licencia) — ver `docs/SELLING.md`.

> **Esta versión (0.14):** solo telemetría y análisis. El ingeniero por voz, el spotter y la página de suscripción están desactivados (`FEATURES` en `web/dist/index.html`); los pitidos de cambio y de frenada se quedan.

- **Comunidad** (pestaña nueva): tú decides qué compartes (nada por defecto): tus mejores tiempos, la vuelta completa (telemetría) y tus análisis de carrera (sin los nombres de los demás pilotos). Clasificaciones por circuito y coche, análisis compartidos, y **Comparar** carga la vuelta de otro piloto como referencia en el coach de frenada. Montar el servidor: `cloud/README.md`.

## Transmitir los datos (OBS, dashboards, scripts)

Usa las direcciones de la tabla de arriba. Añade `http://localhost:8484` como Fuente de navegador en OBS para mostrar la app en tu stream.

## Vista de ingeniero (otro PC, tablet o móvil)

Ajustes → **Vista de ingeniero**.

- **Misma red**: abre la dirección que aparece ahí (termina en `/?view=engineer`) o escanea su código QR en el otro dispositivo.
- **Desde otra casa**: pulsa **Crear enlace**. Pitlane HQ descarga una vez la herramienta gratuita `cloudflared` de Cloudflare y te da un enlace privado `https://….trycloudflare.com` con una clave secreta. Envíaselo a tu ingeniero. Solo puede mirar (telemetría, mapa, relative, vueltas, neumáticos); no puede cambiar ajustes ni overlays ni ver tu cuenta. Deja de funcionar al pulsar **Dejar de compartir** o al cerrar Pitlane HQ, y cada enlace nuevo es distinto.

## Garage 61 (opcional)

Crea un token personal en https://garage61.net/developer y pégalo en Ajustes → Conexiones → Garage 61. Después usa **+ Garage 61** en la comparación de vueltas para cargar una vuelta de referencia de tu coche y circuito. El token se guarda cifrado en la carpeta de tu perfil y solo se envía a Garage 61.

## Cuenta de iRacing (opcional)

iRacing exige un cliente OAuth registrado para leer datos de la cuenta. Desde octubre de 2026 iRacing tiene **pausada la creación de nuevos Client ID** mientras revisa el uso de terceros (https://support.iracing.com/support/solutions/articles/31000177790-oauth-client-credentials). Mientras tanto, la pestaña Series muestra una temporada real de ejemplo. Cuando se reabra, solicita un cliente **password limited** para uso personal. Introduce el Client ID, el secret, tu email y tu contraseña de iRacing una vez en Ajustes → Conexiones. La contraseña solo se envía a iRacing y nunca se guarda.

## Descargar PitlaneHQ.exe con AZOM dentro

Cada cambio en GitHub compila en Windows el plugin AZOM y PitlaneHQ.exe con el plugin dentro (Actions → *Build PitlaneHQ.exe with AZOM* → Artifacts → **Pitlane HQ-windows**). / Every push builds AZOM and PitlaneHQ.exe with the plugin inside on Windows (Actions → *Build PitlaneHQ.exe with AZOM* → Artifacts → **Pitlane HQ-windows**).

## Compilar desde el código

Requiere Go 1.22+: `GOOS=windows GOARCH=amd64 go build -mod=vendor -ldflags "-s -w" -o PitlaneHQ.exe .`
