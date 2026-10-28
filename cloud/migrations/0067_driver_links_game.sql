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
