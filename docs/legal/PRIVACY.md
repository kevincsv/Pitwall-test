# Pitlane HQ — Privacy / Privacidad

*Borrador / Draft — revisar con un abogado antes de vender (RGPD/GDPR).*

## Español

**Qué se queda en tu PC.** Telemetría, vueltas, informes de carrera, notas, perfiles, ajustes y grabaciones de voz se guardan en tu PC (`%APPDATA%\PitlaneHQ`). Los inicios de sesión (iRacing, Garage 61), el webhook de Discord, la licencia y la lista de dispositivos emparejados se guardan **cifrados** con tu cuenta de Windows.

**Qué sale de tu PC, y solo si lo activas:**
- iRacing Data API (tu cuenta, resultados): directamente entre tu PC e iRacing.
- Garage 61: vueltas de referencia que pides.
- Pitlane HQ Cloud (versión web): tus vueltas y sesiones, a **tu** cuenta de Cloudflare (o al servicio alojado, si lo contratas).
- Discord: los mensajes que publicas en tu canal.
- Enlace de ingeniero: una conexión temporal de Cloudflare mientras está activo.
- Licencia: tu clave y el nombre del PC, para comprobarla con la tienda (Lemon Squeezy u otro proveedor).
- Actualizaciones y noticias: se descargan de GitHub e iracing.com.

**Tus derechos.** Puedes borrar tus datos locales en cualquier momento (desinstalar y borrar `%APPDATA%\PitlaneHQ`). Para datos en el servicio alojado o en la tienda, escríbenos: [correo de contacto].

## English

**What stays on your PC.** Telemetry, laps, race reports, notes, profiles, settings and voice recordings are stored on your PC (`%APPDATA%\PitlaneHQ`). Sign-ins (iRacing, Garage 61), the Discord webhook, the licence and the list of paired devices are stored **encrypted** with your Windows account.

**What leaves your PC, only if you turn it on:** iRacing Data API (directly between your PC and iRacing), Garage 61, Pitlane HQ Cloud (your laps, to **your** Cloudflare account or the hosted service), Discord (the messages you post), the engineer link (a temporary Cloudflare tunnel), the licence (your key and PC name, checked with the store) and updates and news (from GitHub and iracing.com).

**Your rights.** Delete your local data at any time (uninstall and delete `%APPDATA%\PitlaneHQ`). For data in the hosted service or the store, contact us: [contact e-mail].
