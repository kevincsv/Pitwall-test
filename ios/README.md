# Pit Wall for iPhone and iPad (free, no Mac)

**English** · [Español](#español)

The iOS app is a full-screen shell around the same Pit Wall app your PC serves. On top of the browser version it finds your PC on the Wi-Fi by itself, keeps the screen on while you race, and reminds you 15 minutes before each race in your plan.

Apple only builds iOS apps on a Mac, so the build runs for free on a Mac in GitHub's cloud. You then install it from Windows with your normal Apple ID. With a free Apple ID the app works for 7 days; reinstall it (one click) after that.

## 1. Build the app (once, and after each Pit Wall update)
1. Create a free account at github.com.
2. Create a new repository (Public builds are unlimited; Private ones get about 200 Mac minutes a month, enough for 20+ builds).
3. Click **Add file → Upload files** and drag in everything inside the `source` folder, including the `.github` folder. Commit.
4. Open the **Actions** tab → **Build iOS app** → **Run workflow**. It takes about 5–8 minutes.
5. Open the finished run and download **PitWall-iOS**. Unzip it to get `PitWall.ipa`.

## 2. Install on the iPhone from Windows
1. Install **iTunes** and **iCloud** from apple.com (not the Microsoft Store versions).
2. Install **Sideloadly** from sideloadly.io.
3. Plug in the iPhone with a cable and tap **Trust** on the phone.
4. Drag `PitWall.ipa` into Sideloadly, type your Apple ID and press **Start**.
5. On the iPhone: **Settings → Privacy & Security → Developer Mode → On** (the phone restarts), then **Settings → General → VPN & Device Management →** your Apple ID → **Trust**.
6. Open Pit Wall, allow **Local Network**, and tap your PC.

Every 7 days, repeat step 4 (Sideloadly can also refresh it automatically over Wi-Fi while your PC is on).

---

## Español

La app de iOS es una ventana a pantalla completa con la misma app Pit Wall que sirve tu PC. Además, encuentra tu PC en la WiFi sola, mantiene la pantalla encendida mientras corres y te avisa 15 minutos antes de cada carrera de tu plan.

Apple solo compila apps de iOS en un Mac, así que la compilación se hace gratis en un Mac en la nube de GitHub. Después la instalas desde Windows con tu Apple ID normal. Con un Apple ID gratuito la app funciona 7 días; después se reinstala con un clic.

## 1. Compilar la app (una vez, y tras cada actualización)
1. Crea una cuenta gratuita en github.com.
2. Crea un repositorio nuevo (los públicos compilan sin límite; los privados tienen unos 200 minutos de Mac al mes, suficiente para más de 20 compilaciones).
3. Pulsa **Add file → Upload files** y arrastra todo lo que hay dentro de la carpeta `source`, incluida la carpeta `.github`. Confirma con Commit.
4. Abre la pestaña **Actions** → **Build iOS app** → **Run workflow**. Tarda unos 5–8 minutos.
5. Abre la ejecución terminada y descarga **PitWall-iOS**. Descomprímelo para obtener `PitWall.ipa`.

## 2. Instalar en el iPhone desde Windows
1. Instala **iTunes** e **iCloud** desde apple.com (no las versiones de Microsoft Store).
2. Instala **Sideloadly** desde sideloadly.io.
3. Conecta el iPhone con cable y pulsa **Confiar** en el teléfono.
4. Arrastra `PitWall.ipa` a Sideloadly, escribe tu Apple ID y pulsa **Start**.
5. En el iPhone: **Ajustes → Privacidad y seguridad → Modo de desarrollador → Activado** (se reinicia), y luego **Ajustes → General → VPN y gestión de dispositivos →** tu Apple ID → **Confiar**.
6. Abre Pit Wall, permite **Red local** y toca tu PC.

Cada 7 días, repite el paso 4 (Sideloadly también puede renovarla sola por WiFi mientras el PC está encendido).
