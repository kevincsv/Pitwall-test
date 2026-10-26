-- The coach keeps learning (coachtips.js, model.js):
-- the lap's braking point against the reference's when the tip was shown and next time (how the driver's braking moved),
-- the lap's flags (traffic, cold tyres) so such laps teach nothing, the track temperature of every lap the model knows
-- (the corner card by temperature band) and the tips an admin turned off (a kind on corners of one speed).
ALTER TABLE coach_tips ADD COLUMN dd REAL;
ALTER TABLE coach_tips ADD COLUMN ddn REAL;
ALTER TABLE coach_tips ADD COLUMN flags TEXT;
ALTER TABLE model_laps ADD COLUMN temp REAL;
CREATE TABLE IF NOT EXISTS coach_off (
  kind TEXT NOT NULL,
  cls TEXT NOT NULL,
  created INTEGER NOT NULL,
  PRIMARY KEY (kind, cls)
);
