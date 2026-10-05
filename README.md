# Pit Wall 0.8 — iRacing companion

**English** · [Español](#español)

## Start

1. Copy `PitWall.exe` to the PC where you run iRacing (any folder, no install).
2. Double-click it. If Windows SmartScreen appears, click **More info → Run anyway** (the app is not signed yet).
3. If the Windows Firewall asks, tick **Private networks** and click **Allow**. This lets your phone connect.
4. A Pit Wall window opens. Start iRacing and get in the car: telemetry appears automatically.

Keep the black PitWall window open while you race. Close it to stop.

## Phone and tablet (Android, iPhone, iPad)

1. Connect the phone to the same Wi-Fi as the PC.
2. In Pit Wall on the PC, open **Settings** (gear icon) and scan the QR code, or type the address shown in the black window (for example `http://192.168.1.20:8484`).
3. Install it as an app:
   - **iPhone/iPad**: Safari → Share → *Add to Home Screen*.
   - **Android**: Chrome → ⋮ → *Add to Home screen* / *Install app*.

## What it does

- **Live**: gear, speed, shift lights from the car's real RPM points, pedals, lap timing and delta, fuel per lap and fuel to add, engine temps, tyres, flags, relative and track position.
- **Track map**: drawn automatically from your own car on the first clean lap (iRacing does not provide map coordinates, so Pit Wall traces it), then saved and shared with every device. Shows every car live, your line this lap coloured by throttle and brake, your best lap, braking points with how many metres earlier or later you braked, and an estimated ideal line built from your fastest mini-sectors. Every layer can be switched off; the map can be rotated or mirrored.
- **Overlays (RaceLab style)**: relative, standings, radar, car inputs, gear/speed/RPM, DRS and push-to-pass, track map, fuel, tyres, flags, timing and any telemetry value. Each opens in a frameless window that stays on top of iRacing (borderless/windowed mode) without taking focus. The **padlock** at the top of the app (on the PC or the phone) unlocks every overlay so you can drag and resize it, and locks them all again. The **Overlays** tab also shows your screen in miniature: drag the boxes there and the real windows move. PitWall remembers where you left each one.
- **Automatic**: choose your overlays once (Layout → Auto) and they open by themselves when you get in the car, and close when iRacing closes. PitWall can also start with Windows.
- **Relative and standings you build yourself**: pick and order the columns (position, class position, number, driver, car, licence, iRating, estimated iRating change, laps, last/best lap, gap, interval, pit stops, places gained, tyre compound, incidents) and the header and footer items (session, time left, laps left, lap, position, SOF, your iRating change, incidents vs limit, fuel laps, delta, track/air temperature, track wetness, real and sim time).
- **Radar**: shows cars alongside and close behind or ahead, and hides itself when nobody is near.
- **DRS and push-to-pass**: state, time or uses left with the unit shown (IndyCar and Super Formula count seconds, shown as minutes:seconds), and how long the current boost has been on (only on cars that have them).
- **Telemetry widget**: pin any of the ~300 iRacing variables from the Data tab and see it live with a mini graph.
- **Overlays tab**: one place to choose which overlays open automatically, open or close them, move them on the screen and configure each one with a **live preview** that updates as you change columns or options. A phone can control the overlays on the PC.
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

- Everything stays on the PC in `%APPDATA%\PitWall\profiles\`. Nothing is uploaded to any cloud.
- Sign-ins are **encrypted with Windows (DPAPI)**: only your Windows user on this PC can read them. Older plain files are encrypted automatically the first time 0.8 starts.
- **Export** saves a profile file (settings and layouts only, never sign-ins) to copy to another PC; **Import a profile file** loads it there.
- Phones and tablets keep their own Live layout; language, units, favourites and the rest follow the profile.

## Rig tab: your programs, SimHub, AZOM and MOZA

**Programs.** Pit Wall looks for iRacing, Steam, Crew Chief, Garage 61, TrackImpulse, SimHub, MOZA Pit House, RaceLab, Coach Dave Delta, Track Titan, VRS, iOverlay, Kapps, Discord and OBS (known folders, Start menu and installed programs). Add the ones you want and choose for each one:

- **With Pit Wall**: starts when Pit Wall opens.
- **When iRacing starts**: starts each time the sim starts.
- **Only by hand**: stays in the list with a Start button.

You can start them minimised, change the order, start them all at once, remove them, and add any other program from the Start menu or with **Browse…**. Programs that are already open are left alone. Turn on **Start with Windows** (Overlays tab) and your whole rig starts by itself. For safety, a phone can only start programs you already added on the PC.

**SimHub.** Start, show, minimise or close SimHub and switch it to iRacing. Every dashboard and overlay in SimHub is listed with its preview: **Open** it in a window, put it **On Live**, or open it as a Pit Wall **overlay** window on top of iRacing. **Import .simhubdash** sends a dashboard file to SimHub (also from your phone). The **SimHub dashboard** widget shows any SimHub dashboard live (SimHub's web server must be on, port 8888).

**AZOM (MOZA wheels in SimHub).** If the [AZOM plugin](https://github.com/giantorth/AZOM) is installed, Pit Wall can change the wheel screen page, brightness, work mode and centre, and run any other SimHub action by name. Pit Wall warns you when MOZA Pit House is open (AZOM needs it closed) and can close it for you.

**MOZA Pit House.** Open Pit House or Dashboard Studio, see your MOZA dashboards (`.mzdash`), add one from a file (even from your phone) and open it in Dashboard Studio to send it to the wheel. MOZA has no public API to upload dashboards, so that last click (Upload) happens in Dashboard Studio or with AZOM's upload button.

## New Live widgets in 0.8

- **Pit stop calculator**: stops left, pit window (first and last lap), fuel to add, and where you would rejoin given your pit loss (−/+ to adjust per track).
- **Mini-sectors**: the lap split into 24 parts, coloured purple (best of the session), green (faster than your best lap) or yellow, with your ideal lap.
- **Gap graph**: how the gap to the cars around you changes over the last minutes, and whether you are catching them.
- **Incident log**: every incident with lap and place on track, against the session limit.

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
- **From another house**: press **Create link**. PitWall downloads Cloudflare's free `cloudflared` tool once and gives you a private `https://….trycloudflare.com` link with a secret key. Send it to your engineer. The link only lets them watch (telemetry, map, relative, laps, tyres); they cannot change settings, overlays or see your account. It stops working when you press **Stop sharing** or close PitWall, and a new link is different every time.

## Garage 61 (optional)

Create a personal token at https://garage61.net/developer and paste it in Account → Garage 61. Then use **+ Garage 61** in the lap comparison to load a reference lap for your car and track. The token is stored encrypted in your profile folder and only sent to Garage 61.

## iRacing account (optional)

iRacing requires a registered OAuth client to read account data. As of October 2026 iRacing has **paused creating new client IDs** while it reviews third-party use (https://support.iracing.com/support/solutions/articles/31000177790-oauth-client-credentials). Until then the Series tab shows a real sample season. When it reopens, request a **password limited** client for personal use. Enter the Client ID, secret, your iRacing email and password once in the Account tab. The password is only sent to iRacing and never saved; the sign-in is stored encrypted in your profile folder.

## iPhone / iPad app

See `source/ios/README.md` to build it for free without a Mac and install it from Windows. / Mira `source/ios/README.md` para compilarla gratis sin Mac e instalarla desde Windows.

## Options

`PitWall.exe -port 9000` uses another port. `-demo` starts with a simulated race. `-no-browser` does not open the window.

---

## Español

## Arrancar

1. Copia `PitWall.exe` al PC donde usas iRacing (cualquier carpeta, no se instala).
2. Haz doble clic. Si aparece Windows SmartScreen, pulsa **Más información → Ejecutar de todas formas** (la app aún no está firmada).
3. Si el Firewall de Windows pregunta, marca **Redes privadas** y pulsa **Permitir**. Así el móvil puede conectarse.
4. Se abre la ventana de Pit Wall. Abre iRacing y súbete al coche: la telemetría aparece sola.

Deja abierta la ventana negra de PitWall mientras corres. Ciérrala para parar.

## Móvil y tablet (Android, iPhone, iPad)

1. Conecta el móvil a la misma WiFi que el PC.
2. En Pit Wall en el PC, abre **Ajustes** (icono de engranaje) y escanea el código QR, o escribe la dirección que muestra la ventana negra (por ejemplo `http://192.168.1.20:8484`).
3. Instálala como app:
   - **iPhone/iPad**: Safari → Compartir → *Añadir a pantalla de inicio*.
   - **Android**: Chrome → ⋮ → *Añadir a pantalla de inicio* / *Instalar app*.

## Qué hace

- **En vivo**: marcha, velocidad, luces de cambio con las RPM reales del coche, pedales, tiempos y delta, consumo por vuelta y combustible a añadir, temperaturas, neumáticos, banderas, relative y posición en pista.
- **Mapa del circuito**: se dibuja solo con tu coche en la primera vuelta limpia (iRacing no da coordenadas del circuito, así que Pit Wall lo traza), se guarda y se comparte con todos tus dispositivos. Muestra todos los coches en vivo, tu trazada de esta vuelta coloreada por acelerador y freno, tu mejor vuelta, los puntos de frenada con cuántos metros antes o después frenaste, y una línea ideal estimada con tus mini-sectores más rápidos. Cada capa se puede desactivar; el mapa se puede girar o reflejar.
- **Overlays (estilo RaceLab)**: relative, clasificación, radar, pedales, marcha/velocidad/RPM, DRS y push-to-pass, mapa, combustible, neumáticos, banderas, tiempos y cualquier valor de telemetría. Cada uno se abre en una ventana sin bordes que queda encima de iRacing (modo ventana o sin bordes) sin quitarle el foco. El **candado** de arriba de la app (en el PC o en el móvil) desbloquea todos los overlays para moverlos y cambiar su tamaño, y los vuelve a bloquear. La pestaña **Overlays** también muestra tu pantalla en miniatura: arrastra los recuadros y las ventanas reales se mueven. PitWall recuerda dónde dejaste cada uno.
- **Automático**: elige tus overlays una vez (Diseño → Auto) y se abren solos al subirte al coche, y se cierran al cerrar iRacing. PitWall también puede iniciarse con Windows.
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

- Todo se queda en el PC en `%APPDATA%\PitWall\profiles\`. No se sube nada a ninguna nube.
- Las sesiones se **cifran con Windows (DPAPI)**: solo tu usuario de Windows en este PC puede leerlas. Los archivos antiguos sin cifrar se cifran solos la primera vez que arranca la 0.8.
- **Exportar** guarda un archivo de perfil (solo ajustes y diseños, nunca sesiones) para llevarlo a otro PC; **Importar un archivo de perfil** lo carga allí.
- Móviles y tablets mantienen su propio diseño de En vivo; idioma, unidades, favoritas y lo demás siguen al perfil.

## Pestaña Rig: tus programas, SimHub, AZOM y MOZA

**Programas.** Pit Wall busca iRacing, Steam, Crew Chief, Garage 61, TrackImpulse, SimHub, MOZA Pit House, RaceLab, Coach Dave Delta, Track Titan, VRS, iOverlay, Kapps, Discord y OBS (carpetas conocidas, menú Inicio y programas instalados). Añade los que quieras y elige para cada uno:

- **Con Pit Wall**: se abre al abrir Pit Wall.
- **Al abrir iRacing**: se abre cada vez que arranca el simulador.
- **Solo a mano**: queda en la lista con un botón Iniciar.

Puedes abrirlos minimizados, cambiar el orden, abrirlos todos a la vez, quitarlos y añadir cualquier otro programa del menú Inicio o con **Buscar…**. Los que ya están abiertos no se tocan. Activa **Iniciar con Windows** (pestaña Overlays) y todo tu equipo arranca solo. Por seguridad, un móvil solo puede abrir programas que ya añadiste en el PC.

**SimHub.** Abre, muestra, minimiza o cierra SimHub y cámbialo a iRacing. Aparecen todos tus dashboards y overlays de SimHub con su vista previa: **Ábrelo** en una ventana, ponlo **En vivo** o ábrelo como **overlay** de Pit Wall encima de iRacing. **Importar .simhubdash** envía un dashboard a SimHub (también desde el móvil). El widget **Dashboard de SimHub** muestra cualquier dashboard en vivo (el servidor web de SimHub debe estar activo, puerto 8888).

**AZOM (volantes MOZA en SimHub).** Si tienes el [plugin AZOM](https://github.com/giantorth/AZOM), Pit Wall puede cambiar la página de la pantalla del volante, el brillo, el modo de trabajo y el centrado, y ejecutar cualquier otra acción de SimHub por su nombre. Te avisa cuando MOZA Pit House está abierto (AZOM necesita que esté cerrado) y puede cerrarlo por ti.

**MOZA Pit House.** Abre Pit House o Dashboard Studio, mira tus dashboards de MOZA (`.mzdash`), añade uno desde un archivo (incluso desde el móvil) y ábrelo en Dashboard Studio para enviarlo al volante. MOZA no tiene API pública para subir dashboards, así que ese último clic (Upload) se hace en Dashboard Studio o con el botón de subir de AZOM.

## Widgets nuevos en la 0.8

- **Calculadora de parada**: paradas que quedan, ventana de parada (primera y última vuelta), gasolina a añadir y dónde saldrías según tu pérdida en boxes (−/+ para ajustarla por circuito).
- **Mini-sectores**: la vuelta en 24 partes, en morado (mejor de la sesión), verde (más rápido que tu mejor vuelta) o amarillo, con tu vuelta ideal.
- **Gráfica de gaps**: cómo cambia el gap con los coches de alrededor en los últimos minutos y si los estás alcanzando.
- **Registro de incidentes**: cada incidente con vuelta y punto de la pista, frente al límite de la sesión.

## Transmitir los datos (OBS, dashboards, scripts)

Usa las direcciones de la tabla de arriba. Añade `http://localhost:8484` como Fuente de navegador en OBS para mostrar la app en tu stream.

## Vista de ingeniero (otro PC, tablet o móvil)

Ajustes → **Vista de ingeniero**.

- **Misma red**: abre la dirección que aparece ahí (termina en `/?view=engineer`) o escanea su código QR en el otro dispositivo.
- **Desde otra casa**: pulsa **Crear enlace**. PitWall descarga una vez la herramienta gratuita `cloudflared` de Cloudflare y te da un enlace privado `https://….trycloudflare.com` con una clave secreta. Envíaselo a tu ingeniero. Solo puede mirar (telemetría, mapa, relative, vueltas, neumáticos); no puede cambiar ajustes ni overlays ni ver tu cuenta. Deja de funcionar al pulsar **Dejar de compartir** o al cerrar PitWall, y cada enlace nuevo es distinto.

## Garage 61 (opcional)

Crea un token personal en https://garage61.net/developer y pégalo en Cuenta → Garage 61. Después usa **+ Garage 61** en la comparación de vueltas para cargar una vuelta de referencia de tu coche y circuito. El token se guarda cifrado en la carpeta de tu perfil y solo se envía a Garage 61.

## Cuenta de iRacing (opcional)

iRacing exige un cliente OAuth registrado para leer datos de la cuenta. Desde octubre de 2026 iRacing tiene **pausada la creación de nuevos Client ID** mientras revisa el uso de terceros (https://support.iracing.com/support/solutions/articles/31000177790-oauth-client-credentials). Mientras tanto, la pestaña Series muestra una temporada real de ejemplo. Cuando se reabra, solicita un cliente **password limited** para uso personal. Introduce el Client ID, el secret, tu email y tu contraseña de iRacing una vez en la pestaña Cuenta. La contraseña solo se envía a iRacing y nunca se guarda.

## Compilar desde el código

Requiere Go 1.22+: `GOOS=windows GOARCH=amd64 go build -mod=vendor -ldflags "-s -w" -o PitWall.exe .`
