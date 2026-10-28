-- An account's own driver is linked per game (community.js /link-driver): one iRacing driver and one Le Mans Ultimate
-- driver per account, one account per driver of each game. Le Mans Ultimate gives no driver id, so its rivals are known
-- by a hash of the name the game shows (lmuDriverID), and a driver with an account was on the LMU boards twice, as
-- that name and as their nickname; the links of before are iRacing's.
CREATE TABLE IF NOT EXISTS driver_links_g (
  game TEXT NOT NULL DEFAULT 'iracing',
  oid TEXT NOT NULL,
  account_id TEXT NOT NULL,
  created INTEGER NOT NULL,
  PRIMARY KEY (game, oid),
  UNIQUE (game, account_id)
);
INSERT OR IGNORE INTO driver_links_g (game, oid, account_id, created) SELECT 'iracing', oid, account_id, created FROM driver_links;
DROP TABLE driver_links;
ALTER TABLE driver_links_g RENAME TO driver_links;
-- Le Mans Ultimate's name can be typed by anyone (driverlinks.js): the link waits until the account's own PC saw that
-- name at the wheel on three different days (one row a day; "undone" when an admin undid the link, which never comes
-- back by itself), and it keeps what it moved so the admin's undo gives the laps back to the rival
CREATE TABLE IF NOT EXISTS driver_link_seen (
  game TEXT NOT NULL,
  oid TEXT NOT NULL,
  account_id TEXT NOT NULL,
  day TEXT NOT NULL,
  PRIMARY KEY (game, oid, account_id, day)
);
CREATE TABLE IF NOT EXISTS driver_link_moves (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  game TEXT NOT NULL,
  account_id TEXT NOT NULL,
  oid TEXT NOT NULL,
  kind TEXT NOT NULL,
  row TEXT NOT NULL,
  created INTEGER NOT NULL
);
CREATE INDEX IF NOT EXISTS driver_link_moves_acct ON driver_link_moves (account_id, game);
