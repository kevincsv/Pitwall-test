-- The coach learns from what happens after its tips: every tip the coach showed (the corner, the tip's kind, what the
-- lap lost there and the time the session's best lap spent in that corner) stays with the account, and the driver's next
-- session on that car and track says whether that corner got faster (outcome, seconds gained). The 👍/👎 the driver
-- presses on a tip goes with it. Only the admins see the counts (by the tip's kind and the corner's speed).
CREATE TABLE IF NOT EXISTS coach_tips (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  account TEXT NOT NULL,
  game TEXT NOT NULL DEFAULT 'iracing',
  track_id INTEGER NOT NULL,
  car_id INTEGER NOT NULL,
  session_id TEXT NOT NULL,
  started INTEGER NOT NULL,       -- when the session started (ms): the next session is a later one
  n INTEGER NOT NULL,             -- the corner, as the coach numbers it (the official turn when the track has them)
  d REAL,                         -- the reference's braking point, metres from the line
  apex REAL,                      -- the reference's slowest point, metres from the line: the same corner next time
  kind TEXT,                      -- the tip's kind (brake_later, trail, coast, apex_speed…), '' when the corner lost nothing
  cls TEXT,                       -- the corner's speed at the reference's slowest point: slow, medium, fast
  ref TEXT,                       -- the reference: level (the driver just ahead), record, own (your own lap), comm
  lost REAL,                      -- seconds the lap lost in the corner against the reference
  ta REAL,                        -- seconds the lap spent in the corner
  tb REAL,                        -- seconds the reference spent in it
  tbest REAL,                     -- seconds the session's best lap spent in it: what the next session is measured against
  rating INTEGER NOT NULL DEFAULT 0,  -- 1 thumbs up, -1 thumbs down
  outcome REAL,                   -- seconds the next session's best lap gained in this corner (negative: lost), NULL until it comes
  outcome_at INTEGER,
  created INTEGER NOT NULL,
  UNIQUE(account, session_id, n)
);
CREATE INDEX IF NOT EXISTS coach_tips_next ON coach_tips(account, game, track_id, car_id, started);
CREATE INDEX IF NOT EXISTS coach_tips_kind ON coach_tips(kind, cls);
