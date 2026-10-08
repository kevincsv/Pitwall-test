-- 0.9.0: the model's references carry their line (where the car was on the track); every model learns again on the
-- next cron runs (and at once when someone opens it), from the laps it already knows
UPDATE model_cache SET dirty = 1;
UPDATE car_cards SET dirty = 1;
