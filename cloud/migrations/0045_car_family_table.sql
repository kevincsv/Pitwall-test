-- The badges of one car (src/carfamily.js): each car the server saw with a family's name, and the number the family's
-- laps go under (the first badge seen). The SF23's two badges were joined by 0044 under the Toyota's 171.
CREATE TABLE IF NOT EXISTS car_families (
  game TEXT NOT NULL,
  car_id INTEGER NOT NULL,
  fam_id INTEGER NOT NULL,
  fam TEXT NOT NULL,
  created INTEGER NOT NULL,
  PRIMARY KEY (game, car_id)
);
CREATE INDEX IF NOT EXISTS car_families_fam ON car_families (game, fam_id);
INSERT OR IGNORE INTO car_families (game, car_id, fam_id, fam, created) VALUES ('iracing', 171, 171, 'sf23', 0), ('iracing', 172, 171, 'sf23', 1);
