-- everything Le Mans Ultimate's own API (127.0.0.1:6397) answered on an admin's PC, once per version of the game's API
-- (the agent's lmuapi.go, POST /community/admin/lmu-api): for the admins to see what Pitlane HQ could use. One row per
-- account, version and path ("#meta" the plan, "#swagger/N" the API list in parts); body is the answer's JSON or the
-- start of its text, at most 256 KB (size is the whole answer's)
CREATE TABLE IF NOT EXISTS lmu_api (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  account_id TEXT NOT NULL,
  at INTEGER NOT NULL,
  game_version TEXT NOT NULL,
  path TEXT NOT NULL,
  status INTEGER NOT NULL DEFAULT 0,
  ctype TEXT,
  size INTEGER,
  ms INTEGER,
  body TEXT,
  UNIQUE (account_id, game_version, path)
);
CREATE INDEX IF NOT EXISTS lmu_api_version ON lmu_api (game_version, path);
