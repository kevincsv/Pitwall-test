# Selling Pitlane HQ / Vender Pitlane HQ

## 1. Store (Lemon Squeezy, or your own server)

1. Create the product in Lemon Squeezy with three variants: **Monthly**, **Yearly**, **Lifetime** (variant names must contain "month", "year" or "lifetime"). Turn on **licence keys** for each variant and set the activation limit (e.g. 2 PCs).
2. Edit `license_plans.json` (repo root):
   - `storeUrl`: your store; each plan's `buy`: its checkout link.
   - `price`: what is shown (the store is what charges).
   - `trialDays`, `graceDays` (days it keeps working offline).
   - `proViews` / `proFeatures`: what needs Pro.
   - **`enforce: true`** when you start selling. While it is `false`, everything is free.
3. Own server instead: `"provider": "custom"`, `"customUrl": "https://your-api"`. Pitlane HQ POSTs JSON to `/activate {key, device}`, `/validate {key, instance}`, `/deactivate {key, instance}` and expects `{status:"active"|"expired"|..., plan:"monthly"|"yearly"|"lifetime", expires:"RFC3339", instance:"id"}` or `{error:"..."}`.
4. You can also put a `license_plans.json` next to `PitlaneHQ.exe` to override the built-in one (for testing).

## 2. Before the first sale

- **Make the GitHub repository private** and host the downloads yourself (e.g. Cloudflare R2). Then set `updateRepo`/download URLs accordingly (ask Claude to switch the updater to your host).
- **Code signing** (avoids the SmartScreen warning): Azure Trusted Signing or an OV/EV certificate; add a signing step to `.github/workflows/windows.yml` for `PitlaneHQ.exe` and `PitlaneHQ-Setup.exe`.
- Have a lawyer review `installer/EULA.txt` and `docs/legal/PRIVACY.md`; add your company name and contact e-mail.
- Ask iRacing about commercial use of the Data API (account/results features).

## 3. Installer

CI builds `PitlaneHQ-Setup.exe` (Inno Setup, `installer/PitlaneHQ.iss`): per-user install (no administrator), Start menu and desktop shortcuts, optional "start with Windows", uninstaller. The built-in updater keeps working in the installed folder.

## 4. Phone PIN

Devices on the network (phone, tablet, another PC) must pair with the PIN shown in Settings → Phone (or scan its QR). The PC and its overlays never need it. Paired devices can be removed; the PIN changes every 10 minutes and after each use; 5 wrong PINs block that address for 5 minutes.
