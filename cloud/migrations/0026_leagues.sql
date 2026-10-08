-- Leagues (0.8.12, in development: admins only until it opens to everyone): drivers post their league with a
-- direct link to its Discord to find drivers
CREATE TABLE IF NOT EXISTS leagues (
  id TEXT PRIMARY KEY,
  owner TEXT NOT NULL,           -- the account that posted it
  name TEXT NOT NULL,
  about TEXT,
  cat TEXT,                      -- discipline: oval, sports_car, formula_car, dirt_oval, dirt_road
  discord TEXT NOT NULL,         -- https://discord.gg/… or https://discord.com/invite/…
  web TEXT,                      -- its own page, optional
  schedule TEXT,                 -- when it races ("Tuesdays 21:00 CET")
  cars TEXT,                     -- what it races
  lang TEXT,                     -- the language of the league
  created INTEGER NOT NULL,
  updated INTEGER NOT NULL
);
CREATE INDEX IF NOT EXISTS leagues_owner ON leagues (owner);
CREATE INDEX IF NOT EXISTS leagues_updated ON leagues (updated DESC);
