-- What breaks and what the database costs (reports.js): the apps' crash and error reports, one row per kind of error
-- (sig) with how often it came and the newest version that sent it; the logs a driver sends from the support chat;
-- and the rows each route reads and writes per day, so a route that starts reading too much shows the day it ships.
CREATE TABLE IF NOT EXISTS crash_reports (
  sig TEXT PRIMARY KEY,
  app TEXT NOT NULL,          -- pc, web, android, ios
  v TEXT, os TEXT,
  at_where TEXT,              -- the part that broke (a goroutine, a screen, the page)
  msg TEXT, stack TEXT,
  first INTEGER NOT NULL, last INTEGER NOT NULL, n INTEGER NOT NULL DEFAULT 1,
  last_account TEXT
);
CREATE INDEX IF NOT EXISTS crash_reports_last ON crash_reports(last DESC);
CREATE TABLE IF NOT EXISTS support_logs (
  id TEXT PRIMARY KEY,
  account_id TEXT NOT NULL,
  created INTEGER NOT NULL,
  device TEXT, v TEXT,
  bytes INTEGER NOT NULL,
  text TEXT NOT NULL
);
CREATE INDEX IF NOT EXISTS support_logs_acct ON support_logs(account_id, created DESC);
CREATE TABLE IF NOT EXISTS d1_usage (
  day TEXT NOT NULL,
  route TEXT NOT NULL,
  reqs INTEGER NOT NULL DEFAULT 0,
  rows_read INTEGER NOT NULL DEFAULT 0,
  rows_written INTEGER NOT NULL DEFAULT 0,
  PRIMARY KEY (day, route)
);
