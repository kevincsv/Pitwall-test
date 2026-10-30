# DRINKS mode

How this part of Pitlane HQ behaves. Read it before changing this area; keep it up to date when the behaviour changes.

- DRINKS mode (formerly Friday night mode): admins only, on the PC or from the phone app. A driver already on the
  list can be renamed (✎: the same driver on the server, `/guest-rename`, so their shared laps change name too) or
  taken off the list (×: what they shared stays; renamed, their laps in the summaries and the account follow). A lap
  is theirs who drove most of it (`noteDriver`/`topDriver`, counted once a second, `lapDriver` for the race report),
  never whoever is at the wheel after the line. Every lap goes to the account as soon as it is done, a friend's too
  with their name (`drv` on the lap, migration 0036): the session and its race summary keep every lap, and a
  friend's lap is never the account's best, its share or its trackbook best. Every race lap keeps who drove it (`drv`), and a race a friend drove
  any lap of carries them (`drinks`, you by your public name): My races, Home, My sessions, the race summary and the
  phones show a "DRINKS · Ana" badge, or "DRINKS · Multiple drivers" that opens who drove (their laps and best); the
  summary's laps say their driver (admins change it with ✎: `lapDriver` in /api/races and `/api/sessions/:id/driver`;
  a race recorded without the friends' names gets them with "Say who drove each lap (DRINKS)", `DRK_EDIT`) and
  your car in the results says who drove it; such a race never goes to your public profile. "DRINKS · Who drove"
  renames a driver everywhere (✎, `renameDrinksDriver` → `guestRename`). The PC's list of drivers (`Guests` in
  `community.json`, this PC only, never synced) comes back from the server by itself (`restoreGuests`,
  `/community/guests`: every friend who shared a lap from this account) and with "Recover the drivers from the
  server". When who drove a lap changes, the server makes every driver's shared best of that car and track again
  from the account's sessions (`reshareSession`): no leaderboard keeps a lap that is somebody else's now, and the
  lap goes up under its driver's name when it is their best. An admin joins a DRINKS driver to the friend's own
  account ("Link a DRINKS driver" on an account in the admin panel, PC, web and phones; `guest_links`, migration
  0037, `/admin/users/:id/link-guest` by driver id or name, `unlink-guest`): what was shared under the name goes
  to the account (per car and track the faster lap stays, like `/link-driver`), its reports and the model's memory
  too, and the laps shared later under that name (`/laps`, `/reports`, `reshareSession`) go to the account as it
  chose to be shown. Each driver is
  measured against their own laps only: the PC's stream says who drives (`driver` event, `drinksActive`), the overlays'
  and the app's laps keep their driver, and the delta, the live compare, the coach and the braking markers take that
  driver's best lap (`bestLap`/`ownDelta` in ovnative4.go, `liveBest`/`deltaNow` in index.html), never the game's
  best of the car.
