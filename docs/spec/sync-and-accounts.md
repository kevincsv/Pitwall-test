# Sync, accounts and encryption

How this part of Pitlane HQ behaves. Read it before changing this area; keep it up to date when the behaviour changes.

- What is encrypted how (for us, never said in the apps): the account (settings, race summaries, notes, ratings) is
  end-to-end encrypted with the password's key, except that the server keeps a copy of the data key (and the account's
  email) sealed with its own secret (DATA_KEY, `escrow` on the account, migration 0064, `cloud/src/escrow.js`) so Steam and
  Discord sign in without the password (the owner's choice). Every device (web, PC agent,
  phones) uploads it once after a sync that opened the account (POST /account/escrow, `cpEscrow`, `plEscrowUp`,
  `escrowUp`) while the server says it has none (`escrow` on the sign-in and /account/me); a Steam or Discord sign-in (and
  its 2FA step) answers `dataKey` and `email`, and only without a copy (`needKey`), or when the copy does not open the
  account, the password is asked once as before and that key goes up instead. A password reset with a new key clears the
  copy, a password change keeps it, deleting the account deletes it; the laps' telemetry is stored sealed on the
  server (DATA_KEY), which opens it to teach the model and share the fastest laps; live telemetry with a code is
  end-to-end. The analysis of your laps runs on your device.
- Signing in with an email that has no account says so and offers to create it (`no_account`).
- Sync is automatic and covers everything in the account: every app reads the account when it starts,
  when it comes back to the screen and every minute (the PC also a few seconds after any change), and
  changes from several devices are merged (`syncmerge.go`), never a "which copy" question. The moment any device
  uploads the account (`/sync` PUT), the server nudges the account's live room (`{ctl:"sync", version}` to the PC
  and the screens in it, `live.js`): the PC syncs at once (`kickSyncFrom`, never for its own upload), the web
  companion reads the account again (`CP.refresh`) and so do the phones, which keep the live room open as presence
  (the `idle` role, nothing sent) on every screen while the app is on the screen (`startPresence`/`syncNudges` on
  Android, `Live.startPresence`/`Account.nudged` on iOS; Telemetry takes the link over while it is on screen), so a
  change on any device is on every other one in seconds. When the server
  answers "signed out" to the PC's token (`plSessionEnded`), the PC signs out by itself keeping the email and
  shows the sign-in screen with a note; a wrong password never signs it out. My account has "Sign out on this
  PC" and says when the PC could not sync; it shows no sync card (no last sync, no version) on any device (the PC's
  "My laps": keep my laps in my account and see them on the web). Nobody syncs by hand: no "Sync now" button and no switch to turn the sync
  off anywhere (PC, web, Pitlane HQ Desktop, phones); the sync is always on while signed in. One
  public name per account: changing it anywhere changes it everywhere, shared laps included.
- Deleting your own account never deletes what the leaderboard shows or what the model learns from:
  those laps stay as an anonymous driver (`deleteAccount` in `cloud/src/accounts.js`); everything
  else of the account goes (its alerts, notification settings and phone tokens too). Only an admin removing an account (abuse) removes its shares (`purgeAccount`).
