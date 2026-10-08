-- An account's own iRacing driver: the laps other PCs shared of them as a race rival ("o:" drivers, a hash
-- of their iRacing id, never the id) go under the account once its PC sees them at the wheel. One driver
-- per account and one account per driver.
CREATE TABLE IF NOT EXISTS driver_links (
  oid TEXT PRIMARY KEY,
  account_id TEXT NOT NULL UNIQUE,
  created INTEGER NOT NULL
);
