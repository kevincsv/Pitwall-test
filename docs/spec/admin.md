# Admin mode, admin panel and usage analytics

How this part of Pitlane HQ behaves. Read it before changing this area; keep it up to date when the behaviour changes.

- The admin panel is its own page, only for admins (pitlanehq.app/admin → `/app#admin`, `v-admin`), reached from the
  header's Admin button with admin mode on (Account shows its button only then).
- Admin mode (the owner's choice): an admin sees Pitlane HQ exactly as everyone does by default, on every device. The
  header's Admin button (`#viewTg`, a shield, only for admins; `renderViewToggle`) turns admin mode on for that device
  (`pw.adminMode` in localStorage, `adminMode()`/`setAdminMode` in index.html; `isAdmin()` = an admin's account and admin
  mode on, `realAdmin()` the account alone) and opens the admin page; with it on, the button opens a small menu (Open the
  admin page, Turn admin mode off) and everything for admins and in development shows. Opening /admin with it off turns
  it on. The PC's agent follows the page (POST `/api/adminmode`, `adminmode.go`, `admin-mode.json` in the data folder,
  never synced): `wipAllowed()` is an admin's account and admin mode on, while what is not "in development" keeps
  reading the account (`realAdminSigned`: DRINKS, the voice chat answering, the LMU data capture). About also has the
  switch. The phones have their own admin mode (off by default) in Settings.
- Admins: the admin page (on the PC, the web and the phones; `admSecs`/`admParts`/`wireAdminProfile` in index.html) is
  sections as tabs, each with its line of explanation: Summary (the key numbers, then the analytics), Users (every
  account with what it uses in the last 30 days, its devices and when it was seen, a name opening its detail,
  `admUserDetail`; member since set by hand, the supporter badge, its profile, delete; per account: confirm its email,
  turn off its two-step sign-in, sign it out everywhere, rename it, join a DRINKS driver to it or undo it, unlink its
  game drivers; `/admin/guests` lists every DRINKS driver on the platform for the chooser; and Online now), Feedback
  (every answer of "Share your feedback", the newest first), Content (the shared items, the leagues and the newest
  records, a record's lap deleted by hand), Sessions (the latest sessions of any driver, a private one too: an admin
  opens every account's profile from the leaderboards, and the profile lists its sessions for admins; "See the laps"
  opens its laps one by one with their top speed and sectors, and an admin marks a lap not valid or valid again:
  `admSessionLaps`, `/api/laps/:id/valid`; the session's best, the driver's share and the model follow), Coach (the
  coach's buckets) and Server (the server's emails and the domain's records, the tools: rebuild the coach models, the
  blocked sign-ins one by one, by email or all, the .ibt import, demo data, admin mode; and Pro). Networks are only ever a
  hash of their address.
- What the drivers use (`cloud/src/usage.js`, the pure part in `usagelib.js`, migration 0070 `usage_days`): every app
  counts the views it opens (`view:<name>`), its notable actions (`act:<name>`: race summary opened, plan to the coach
  overlay, track page, leaderboard, overlay opened, profile, coach report, feedback sent…) and the game it drives
  (`game:iracing`, `game:lmu`, once when the car goes on track in a new session; the game read, `STATUS.source`, never the
  Settings choice "auto", and the server keeps only real games, `USAGE_GAMES`, and leaves the old `game:auto` rows out of
  the analytics) and sends them as POST `/community/usage`
  {device: web|pc|android|ios, v, counts, ms} every 5 minutes and when the page goes to the background (fetch with
  keepalive; `USAGE`/`usageCount`/`usageFlush` in index.html, through the agent's `/api/sync/get` on the PC); never in
  demo data, never for a visitor (dropped unsent), never from an overlay window, never while an admin has admin mode on.
  The server keeps keys matching `^(view|act|game):[a-z0-9_.-]{1,40}$` only, 100 a batch, 1000 per key, added into one row
  per day, account, device and key (rows over 400 days go, hourly). `ms` (how long the page was on the screen, 10 minutes
  a batch at most) adds to the account's use for the feedback window. GET `/community/admin/analytics?days=N` (admins, 1 to
  90 days) answers {days, active [{day, users}], byDevice [{device, users, n}], top [{key, n, users}], games [{game, users,
  n}], versions [{device, v, devices}] from presence, users [{id, nick, lastSeen, devices, n, top [{key, n}]}]} from two
  grouped reads of usage_days and one of presence, never a query per account; the Summary draws it (active drivers per
  day, devices, games, screens and actions with how many drivers, versions) and Users merges it into every account.
