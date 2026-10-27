-- "Sign in with Discord" (Discord's OAuth2 in a browser, /discord/oauth), made like "Sign in with Steam" (0056)
-- a link made by Discord's own sign-in from the account (or the sign-up) signs in with Discord (login 1); one made with the
-- bot's /link code does not until the driver links Discord again from Account. The links made before this one sign in
-- only once linked again (the old link flow did not prove the browser that finished it was the one that started)
ALTER TABLE discord_links ADD COLUMN login INTEGER NOT NULL DEFAULT 0;
-- one state per attempt for 10 minutes, as a hash, with the hash of the code only the app that started knows (its grant is
-- redeemed with it): kind "link" (an account linking its Discord) or "login" (a sign-in); port when the PC started (the
-- browser goes on to the PC's agent at 127.0.0.1:port instead of the web app), app when a phone app started (the browser
-- goes on to its scheme, pitlanehq://discord?state=…). The old table had no code: its states go. The defaults let the old
-- Worker's insert (state_hash, account_id, expires) work while the deploy goes out: such a state is "legacy" (linked at
-- once, a link that never signs in, like the phone builds that start without the password)
DROP TABLE IF EXISTS discord_oauth;
CREATE TABLE IF NOT EXISTS discord_oauth (
  state_hash TEXT PRIMARY KEY,
  code_hash TEXT NOT NULL DEFAULT '',
  account_id TEXT,
  device TEXT,
  kind TEXT NOT NULL DEFAULT 'legacy',
  port INTEGER,
  app INTEGER NOT NULL DEFAULT 0,
  expires INTEGER NOT NULL
);
-- what Discord's answer proved, handed to the app once, as a hash, good only with its code: a sign-in grant (5 minutes),
-- a sign-up grant (30 minutes, the account is created with it and linked) or a link grant (5 minutes, for the account that
-- asked)
CREATE TABLE IF NOT EXISTS discord_grants (
  grant_hash TEXT PRIMARY KEY,
  code_hash TEXT NOT NULL,
  account_id TEXT,
  discord_id TEXT NOT NULL,
  handle TEXT,
  name TEXT,
  device TEXT,
  kind TEXT NOT NULL,
  expires INTEGER NOT NULL
);
-- a sign-in with Discord waiting for the authenticator code uses login_pending.steam (0056) too: 1 means its session comes
-- without the wrapped key, whichever of the two signed in
