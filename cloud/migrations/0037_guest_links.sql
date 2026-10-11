-- A DRINKS driver (a friend who drove on an admin's PC, "guest-…") joined by an admin to the friend's own
-- Pitlane HQ account: what was shared under the driver's name went to the account, and what comes later goes
-- there too. One account per driver; an account may hold several drivers (a name typed two ways).
CREATE TABLE IF NOT EXISTS guest_links (
  gid TEXT PRIMARY KEY,
  account_id TEXT NOT NULL,
  created INTEGER NOT NULL
);
CREATE INDEX IF NOT EXISTS guest_links_account ON guest_links(account_id);
