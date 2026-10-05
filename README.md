# Pit Wall 0.6 — iRacing companion

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
- **Overlays (RaceLab style)**: relative, standings, radar, car inputs, gear/speed/RPM, DRS and push-to-pass, track map, fuel, tyres, flags, timing and any telemetry value. Each opens in a frameless window that stays on top of iRacing (borderless/windowed mode) without taking focus. Turn on **Edit positions** to drag and resize them, turn it off to lock them; PitWall remembers where you left each one.
- **Automatic**: choose your overlays once (Layout → Auto) and they open by themselves when you get in the car, and close when iRacing closes. PitWall can also start with Windows.
- **Relative and standings you build yourself**: pick and order the columns (position, class position, number, driver, car, licence, iRating, estimated iRating change, laps, last/best lap, gap, interval, pit stops, places gained, tyre compound, incidents) and the header and footer items (session, time left, laps left, lap, position, SOF, your iRating change, incidents vs limit, fuel laps, delta, track/air temperature, track wetness, real and sim time).
- **Radar**: shows cars alongside and close behind or ahead, and hides itself when nobody is near.
- **DRS and push-to-pass**: state, uses or seconds left, and how long the current boost has been on (only on cars that have them).
- **Telemetry widget**: pin any of the ~300 iRacing variables from the Data tab and see it live with a mini graph.
- **Overlays tab**: one place to choose which overlays open automatically, open or close them, edit their positions and configure each one. A phone can control the overlays on the PC.
- **Your own Live screen**: drag any block by its ⠿ handle to move it, change its width in Layout, or hide it. Each device remembers its own layout.
- **Lap comparison**: your best lap of the session (it updates every time you go faster), your last lap and the lap you are driving, overlaid by distance: speed, throttle and brake, time delta, gear, steering or RPM, with a live "now vs best" delta. "Follow me" zooms in around where you are.
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

## Streaming the data elsewhere (OBS, dashboards, scripts)

| Address | What you get |
|---|---|
| `/api/stream?vars=*&hz=60` | Server-Sent Events stream of every variable. `vars=Speed,RPM,Gear` to pick, `hz=1…60` |
| `/api/snapshot` | All variables once, JSON |
| `/api/schema` | Name, type, unit and description of each variable |
| `/api/session` | Session info YAML (drivers, track, weather, setup, results) |
| `/api/iracing/<endpoint>` | Any iRacing Data API endpoint, e.g. `/api/iracing/member/info` |

Add `http://localhost:8484` as a Browser Source in OBS to show the app on stream.

## iRacing account (optional)

iRacing requires a registered OAuth client to read account data. As of October 2026 iRacing has **paused creating new client IDs** while it reviews third-party use (https://support.iracing.com/support/solutions/articles/31000177790-oauth-client-credentials). Until then the Series tab shows a real sample season. When it reopens, request a **password limited** client for personal use. Enter the Client ID, secret, your iRacing email and password once in the Account tab. The password is only sent to iRacing and never saved; the sign-in is stored in `%APPDATA%\PitWall\account.json`.

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
- **Overlays (estilo RaceLab)**: relative, clasificación, radar, pedales, marcha/velocidad/RPM, DRS y push-to-pass, mapa, combustible, neumáticos, banderas, tiempos y cualquier valor de telemetría. Cada uno se abre en una ventana sin bordes que queda encima de iRacing (modo ventana o sin bordes) sin quitarle el foco. Activa **Editar posiciones** para moverlos y cambiar su tamaño, desactívalo para fijarlos; PitWall recuerda dónde dejaste cada uno.
- **Automático**: elige tus overlays una vez (Diseño → Auto) y se abren solos al subirte al coche, y se cierran al cerrar iRacing. PitWall también puede iniciarse con Windows.
- **Relative y clasificación a tu medida**: elige y ordena las columnas (posición, posición en clase, número, piloto, coche, licencia, iRating, cambio de iRating estimado, vueltas, última/mejor vuelta, gap, intervalo, paradas, posiciones ganadas, compuesto, incidentes) y lo que va en la cabecera y el pie (sesión, tiempo restante, vueltas restantes, vuelta, posición, SOF, tu cambio de iRating, incidentes vs límite, vueltas de gasolina, delta, temperatura de pista/aire, humedad de pista, hora real y del simulador).
- **Radar**: muestra los coches a tu lado y cerca por delante o por detrás, y se oculta solo cuando no hay nadie cerca.
- **DRS y push-to-pass**: estado, usos o segundos restantes, y cuánto tiempo lleva activo (solo en coches que lo tienen).
- **Widget de telemetría**: fija cualquiera de las ~300 variables de iRacing desde la pestaña Datos y mírala en vivo con una mini gráfica.
- **Pestaña Overlays**: un solo sitio para elegir qué overlays se abren solos, abrirlos o cerrarlos, editar sus posiciones y configurar cada uno. Desde el móvil puedes controlar los overlays del PC.
- **Tu propia pantalla En vivo**: arrastra cualquier bloque por su asa ⠿ para moverlo, cambia su ancho en Diseño u ocúltalo. Cada dispositivo recuerda su diseño.
- **Comparación de vueltas**: tu mejor vuelta de la sesión (se actualiza cada vez que mejoras), tu última vuelta y la que estás dando, superpuestas por distancia: velocidad, acelerador y freno, diferencia de tiempo, marcha, volante o RPM, con el delta "ahora vs mejor" en vivo. "Seguirme" hace zoom donde estás.
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

## Transmitir los datos (OBS, dashboards, scripts)

Usa las direcciones de la tabla de arriba. Añade `http://localhost:8484` como Fuente de navegador en OBS para mostrar la app en tu stream.

## Cuenta de iRacing (opcional)

iRacing exige un cliente OAuth registrado para leer datos de la cuenta. Desde octubre de 2026 iRacing tiene **pausada la creación de nuevos Client ID** mientras revisa el uso de terceros (https://support.iracing.com/support/solutions/articles/31000177790-oauth-client-credentials). Mientras tanto, la pestaña Series muestra una temporada real de ejemplo. Cuando se reabra, solicita un cliente **password limited** para uso personal. Introduce el Client ID, el secret, tu email y tu contraseña de iRacing una vez en la pestaña Cuenta. La contraseña solo se envía a iRacing y nunca se guarda.

## Compilar desde el código

Requiere Go 1.22+: `GOOS=windows GOARCH=amd64 go build -mod=vendor -ldflags "-s -w" -o PitWall.exe .`
