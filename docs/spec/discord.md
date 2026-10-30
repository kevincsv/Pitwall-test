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
  what the public pages show: nicknames, race rivals by their whole name, anonymous laps and accounts as
  "Anonymous"; an anonymous account's answers only to itself; the Windows app is "Pitlane HQ for Windows", as on the downloads page.
