-- Second factor (authenticator app): the secret is sealed with DATA_KEY, the recovery codes
-- are stored only as hashes. A sign-in with 2FA on waits in login_pending for the code.
ALTER TABLE accounts ADD COLUMN totp TEXT;
ALTER TABLE accounts ADD COLUMN totp_on INTEGER NOT NULL DEFAULT 0;
ALTER TABLE accounts ADD COLUMN totp_pending TEXT;
CREATE TABLE IF NOT EXISTS recovery_codes (
  account_id TEXT NOT NULL,
  code_hash TEXT NOT NULL,
  PRIMARY KEY (account_id, code_hash)
);
CREATE TABLE IF NOT EXISTS login_pending (
  token_hash TEXT PRIMARY KEY,
  account_id TEXT NOT NULL,
  device TEXT,
  expires INTEGER NOT NULL
);
-- race analyses are sealed at rest: the numbers the list needs live in their own columns
ALTER TABLE community_reports ADD COLUMN finish INTEGER;
ALTER TABLE community_reports ADD COLUMN field INTEGER;
ALTER TABLE community_reports ADD COLUMN best REAL;
