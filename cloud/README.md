# Pitlane HQ Cloud

Your own web version of Pitlane HQ, like Garage 61 but on your account:
PitlaneHQ.exe records every lap you drive in iRacing and uploads it here. Open
the site from any phone, tablet or PC to see your sessions, your records for
each track and car, and to compare two laps (speed, throttle and brake, gear,
time difference). It runs free on Cloudflare (Workers + D1) for personal use.

## Create it (once)

Needs a free Cloudflare account and Node.js on any PC.

    cd cloud
    npm install
    npx wrangler login
    npx wrangler d1 create pitlanehq      # paste the database_id into wrangler.toml
    npm run db:init
    npx wrangler secret put PITLANE_KEY   # the key from Pitlane HQ → Account → Pitlane HQ Cloud → Create a key
    npx wrangler deploy                   # prints https://pitlanehq.<you>.workers.dev

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
