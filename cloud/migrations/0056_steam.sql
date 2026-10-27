-- "Sign in with Steam" (Steam OpenID in a browser, /steam/return)
-- a Steam account linked to a Pitlane HQ account: one each way; the persona name (when STEAM_WEB_API_KEY is set)
-- and whether the driver shows it on their public profile (off until they say)
CREATE TABLE IF NOT EXISTS steam_links (
  steamid TEXT PRIMARY KEY,
  account_id TEXT NOT NULL UNIQUE,
  persona TEXT,
  created INTEGER NOT NULL,
  shown INTEGER NOT NULL DEFAULT 0
);
-- one state per attempt for 10 minutes, as a hash, with the hash of the code only the app that started knows (its grant
-- is redeemed with it): kind "link" (an account linking its Steam) or "login" (a sign-in); port when the PC started
-- (the browser goes on to the PC's agent at 127.0.0.1:port instead of the web app)
CREATE TABLE IF NOT EXISTS steam_oauth (
  state_hash TEXT PRIMARY KEY,
  code_hash TEXT NOT NULL,
  account_id TEXT,
  device TEXT,
  kind TEXT NOT NULL,
  port INTEGER,
  expires INTEGER NOT NULL
);
-- what Steam's answer proved, handed to the app once, as a hash, good only with its code: a sign-in grant (5 minutes, the
-- Steam account has a Pitlane HQ account), a sign-up grant (30 minutes, the account is created with it and linked) or a
-- link grant (5 minutes, for the account that asked)
CREATE TABLE IF NOT EXISTS steam_grants (
  grant_hash TEXT PRIMARY KEY,
  code_hash TEXT NOT NULL,
  account_id TEXT,
  steamid TEXT NOT NULL,
  persona TEXT,
  device TEXT,
  kind TEXT NOT NULL,
  expires INTEGER NOT NULL
);
-- a sign-in with Steam waiting for the authenticator code: its session comes without the wrapped key (the password asks
-- for it, POST /account/key)
ALTER TABLE login_pending ADD COLUMN steam INTEGER NOT NULL DEFAULT 0;
