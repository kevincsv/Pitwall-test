# Discord bot

How this part of Pitlane HQ behaves. Read it before changing this area; keep it up to date when the behaviour changes.

- The Discord bot (`cloud/src/discord.js`, commands in `discord-commands.js`, registered by the deploy with
  `discord-register.mjs`, migrations 0040 to 0042): slash commands (their names in English only, one per command; the
  descriptions in each language) answered by the Worker at `/discord/interactions`
  (Ed25519, DISCORD_PUBLIC_KEY), lap alerts posted with DISCORD_BOT_TOKEN. In English, Spanish and Portuguese: the
  language each user chose with /language (`discord_users`), else their Discord app's; the alerts in the language
  chosen in /alerts or /setup, else the server's. /setup (the server's managers) is a panel of Discord's own pickers: the
  channels the bot answers in (`cmd_channels`: the public commands only there, private answers anywhere), the channel
  of new best laps, the channel of new records (else the best laps' one) and the alerts' language. Account → Discord
  (PC, web, Pitlane HQ Desktop, phones; `/account/discord`, actions `discord*` in /api/sync) links the Discord account
  with Discord's sign-in (`/discord/oauth`, DISCORD_APP_ID + DISCORD_CLIENT_SECRET, only "identify") and shows it on the
  public profile only when the driver says (`shown`, off by default), so other drivers can find them there (the
  profile's "Discord: @handle", /driver too). Free: /record, /driver, /link, /unlink, /download, /help, /language, /setup; Pro (`discordPro` in license_plans.json, open to
  everyone while `enforce` is false): /coach, /compare, /board (the server's ranking), /alerts (a channel for the
  server's new best laps and records, `discordLapAlert` from autoShare, `/laps` and `reshareSession`). /link gives a
  one-use button to pitlanehq.app (`?discord=`) where the signed-in web app confirms (`discordLinkAsk`). It shows
  what the public pages show: nicknames; race rivals, anonymous laps and accounts as
  "Anonymous"; an anonymous account's answers only to itself; the Windows app is "Pitlane HQ for Windows", as on the downloads page.
- /recent (free, only to you): the account's last 8 sessions (date, track, car, Race/Qualifying/Practice with the place,
  laps, best lap, LMU marked) with "Open Pitlane HQ". /track (free, public): a track's record on each of its 10 most
  driven cars with how many drivers, and your three best places there (not for an anonymous account); the track picked
  from a list as you type (`tracks`).
- /league (the server's managers): links the server to its league in the leagues hub (picked as you type; empty
  unlinks). The league's invite must lead to that server (the bot asks Discord where it goes, `inviteGuild`), so nobody
  takes another server's league. A linked league shows "Pitlane HQ bot" in the hub (`bot` on GET /community/leagues;
  migration 0081 `discord_guilds.league_id`).
- The weekly post (`discordWeekly`, Monday from 09:00 UTC, up to 20 servers each hourly run, each once a week,
  `week_at`): every server with alerts on gets "The week's best laps" in its alerts channel (with its league's name when
  linked), each of its drivers' laps of the last seven days with the place on the leaderboard, the best places first,
  at most 10, while the account that set the alerts up has Pro. Nothing is posted in a week without laps.
