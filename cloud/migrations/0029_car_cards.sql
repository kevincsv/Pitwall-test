-- The car card: what a car does on every track it was driven on (its hardest braking, the speeds the
-- fast drivers shift up at, its top speed), learnt from the model's memory; one per car and game.
CREATE TABLE IF NOT EXISTS car_cards (
  game TEXT NOT NULL,
  car_id INTEGER NOT NULL,
  dirty INTEGER NOT NULL DEFAULT 1,
  built INTEGER NOT NULL DEFAULT 0,
  data BLOB,
  PRIMARY KEY (game, car_id)
);
CREATE INDEX IF NOT EXISTS car_cards_dirty ON car_cards(dirty, built);
-- every car the memory already knows gets its card on the next cron
INSERT INTO car_cards (game, car_id, dirty, built, data) SELECT DISTINCT game, car_id, 1, 0, NULL FROM model_laps WHERE car_id>0 ON CONFLICT DO NOTHING;
