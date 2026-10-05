# Pitlane HQ Cloud

Your own web version of Pitlane HQ, like Garage 61 but on your account:
PitlaneHQ.exe records every lap you drive in iRacing and uploads it here. Open
the site from any phone, tablet or PC to see your sessions, your records for
each track and car, and to compare two laps (speed, throttle and brake, gear,
time difference). It runs free on Cloudflare (Workers + D1) for personal use.

## Your server, for you and everyone who uses your app (quick guide)

One Cloudflare Worker + D1 database does it all: Pitlane HQ accounts (end-to-end encrypted sync between PC and phone), everyone's laps on the web (each driver sees only their own), the community and shared setups, and the season schedule. The free plan is enough. **Only you set this up, once; your drivers just create an account in the app.**

1. **Cloudflare account ID**: dash.cloudflare.com → Workers & Pages → copy *Account ID* (right column).
2. **API token**: My Profile → API Tokens → Create Token → template **Edit Cloudflare Workers** → *Add more*: Account · **D1** · Edit → Continue → Create Token → copy it (shown once).
3. **GitHub** → this repository → Settings → Secrets and variables → Actions → *New repository secret*: `CLOUDFLARE_API_TOKEN` and `CLOUDFLARE_ACCOUNT_ID`.
4. GitHub → Actions → **Pitlane HQ Cloud (web version)** → *Run workflow*. It creates the database and tables, publishes the server and shows its address in the run summary (`https://pitlanehq.<you>.workers.dev`).
5. Put that address in `web/dist/server.json` (`{"url": "https://…"}`) so every Pitlane HQ (PC, iPhone, Android) built from now on uses it with nothing to configure.
6. In the app: Account → **My account** → create the account. Laps upload by themselves; **See my laps on the web** opens the site, where you sign in with the same email and password.
7. Optional, real season for everyone: copy your account id (My account) → GitHub → Settings → Secrets and variables → Actions → **Variables** → `SEASON_UPLOADERS` = that id → run the workflow again.

`PITLANE_KEY` is optional now: only for the older key sign-in (owner/team keys) of the lap site.

## Create it with one click

[![Deploy to Cloudflare](https://deploy.workers.cloudflare.com/button)](https://deploy.workers.cloudflare.com/?url=https://github.com/kevincsv/Pitwall-test/tree/pitlanehq-latest/cloud)

Sign in to (or create) your free Cloudflare account, keep the suggested names,
and paste the key from Pitlane HQ → Settings → Connections → Create a key when
it asks for `PITLANE_KEY`. Cloudflare creates the database, the tables and the
site, and gives you its address (…workers.dev) to paste in Pitlane HQ.

## Create it by hand (once)

Needs a free Cloudflare account and Node.js on any PC.

    cd cloud
    npm install
    npx wrangler login
    npx wrangler d1 create pitlanehq      # add database_id = "…" under [[d1_databases]] in wrangler.toml
    npx wrangler secret put PITLANE_KEY   # the key from Pitlane HQ → Account → Pitlane HQ Cloud → Create a key
    npm run deploy                        # creates the tables, prints https://pitlanehq.<you>.workers.dev

Then in Pitlane HQ → Account → Pitlane HQ Cloud: paste the address and the key,
tick **Upload my laps**, save and press **Test connection**.

Optional read-only key for your engineer or team: `npx wrangler secret put VIEW_KEY`.

## Or let GitHub publish it

Add these repository secrets (GitHub → Settings → Secrets and variables → Actions):
`CLOUDFLARE_API_TOKEN`, `CLOUDFLARE_ACCOUNT_ID`, `PITLANE_D1_ID` (from `npx wrangler d1 create pitlanehq`)
and `PITLANE_KEY`. Every change to the `cloud` folder is then published by the
*Pitlane HQ Cloud (web version)* workflow.

## Team

On your site open **Equipo** and create a key for each team mate. They paste
your site's address and their key in their Pitlane HQ (Settings → Connections →
Pitlane HQ Cloud). Everyone's laps appear in **Récords** per track and car, and
any session can be compared with the team's fastest lap. Members can delete
only their own sessions; only you manage the team.

Sites created before team support: run
`npx wrangler d1 execute pitlanehq --remote --file migrations/0002_team.sql` once.

## Privacy

Only you hold the keys. Data lives in your Cloudflare account. The key is
stored encrypted on your PC (Windows DPAPI) and only sent to your own site.
What is uploaded: track, car, session type, your name, temperatures, lap times,
sectors, fuel used, top speed and a trace every 5 m (speed, throttle, brake,
gear, steering).

## Try it on your PC

    printf 'PITLANE_KEY=dev-key-123\n' > .dev.vars
    npx wrangler d1 execute pitlanehq --local --file schema.sql
    npx wrangler dev        # http://127.0.0.1:8787

## Community server (one, run by the Pitlane HQ owner)

The same Worker can host the **community** (shared laps and race analyses of everyone who opts in):

1. Deploy this folder once more as your central server (its own D1 database): `npm run deploy`. The migrations create the community tables (`migrations/0003_community.sql`).
2. In the Cloudflare dashboard → the Worker → Settings → Variables, add **`COMMUNITY` = `1`**.
3. Put its address in `community.go` (`var communityURL = "https://…"`) so every Pitlane HQ uses it, or type it in Community → Server.

Endpoints (all under `/community`): `POST /register`, `GET /combos`, `GET /laps?trackId&carId`, `GET /laps/:id`, `POST /laps` (token), `GET /reports?trackId&carId`, `GET /reports/:id`, `POST /reports` (token), `POST /me` (alias), `DELETE /me` (deletes everything a driver shared). Reading is public; each driver uploads with their own token; 300 uploads a day per driver; only each driver's best lap per car and track is kept.

### Accounts and shared setups (same server, same `COMMUNITY = 1`)

Migration `0004_accounts_setups.sql` adds Pitlane HQ accounts and shared setups.

- **Accounts** (`/account/…`): `POST /register`, `POST /login`, `GET|POST /me`, `POST /logout`, `GET /sessions`, `POST /sessions/revoke`, `POST /password`, `POST /delete`, `GET /sync/meta`, `GET|PUT /sync`.
  - The password never reaches the server. The PC derives a login key from it (PBKDF2-SHA256, 600 000 rounds, then HKDF) and the server stores only a salted hash of that key.
  - Synced data is encrypted on the PC with AES-256-GCM using a random data key; the server keeps that key only wrapped by the password, so it cannot read anything you sync. Forgetting the password means the synced copy cannot be recovered (the data on each PC stays).
  - Emails are stored only as a hash. Optionally set a secret `EMAIL_PEPPER` (`npx wrangler secret put EMAIL_PEPPER`) **before** the first account is created.
  - 5 wrong passwords per email (30 per network) lock sign-in for 15 minutes; 5 new accounts per network per 15 minutes. Sessions expire after 180 idle days and can be closed one by one; changing the password closes all other sessions.
- **Setups** (`/community/setups…`): `GET /setups?car&track&q`, `GET /setups/cars`, `GET /setups/:id`, `GET /setups/mine` (token), `POST /setups` (token, `.sto` up to 400 KB with its SHA-256), `DELETE /setups/:id` (token, own only). The PC app checks the checksum and only writes `.sto` files inside `Documents\iRacing\setups\<car>\Pitlane Community`.

### The phone apps without the PC

Put the server address in **`web/dist/server.json`** (`{"url": "https://…workers.dev"}`). PitlaneHQ.exe and the iPhone and Android apps (which bundle `web/dist`) read it from there, so it is set in one place.

With a Pitlane HQ account the phone app works on its own: it signs in directly against this server (the password is turned into keys on the phone, like on the PC), downloads the encrypted copy of your profile and decrypts it on the phone. That copy includes a small snapshot of your iRacing data (licences, credits, recent races, season schedule) that PitlaneHQ.exe refreshes every 6 hours while you are signed in to iRacing. Planner changes made on the phone are encrypted and uploaded the same way, and the PC picks them up. Only live telemetry and the rig need the PC, paired over the local Wi-Fi with the code it shows.

### The current season for everyone

iRacing only gives the season schedule to signed-in apps. So that the planner shows the real season in apps without an iRacing login (the phone without the PC, or a PC whose owner has not connected iRacing), your own PitlaneHQ.exe publishes it to the server every 6 hours: only the schedule (series, weeks, tracks, cars, session times), no personal data.

1. Create your Pitlane HQ account in PitlaneHQ.exe and connect iRacing there.
2. Find your account id: `npx wrangler d1 execute pitlanehq --remote --command "select id, display from accounts"`.
3. In Cloudflare → the Worker → Settings → Variables add **`SEASON_UPLOADERS`** = that id (several ids separated by commas).

Everyone reads it from `GET /community/season`; if it is not there yet, the apps show the bundled sample season. Check that sharing the schedule this way fits iRacing's Data API terms before turning it on.
