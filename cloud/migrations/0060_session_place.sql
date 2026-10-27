-- where the driver finished (or stands) in each session and how many cars it had: practice, qualifying and warmup by
-- the best lap, a race by its order (the agent's sessionplace.go). pos_cls = 1 when it is the place in the driver's
-- class (a multiclass session, field the cars of that class). Older sessions have none
ALTER TABLE sessions ADD COLUMN pos INTEGER;
ALTER TABLE sessions ADD COLUMN field INTEGER;
ALTER TABLE sessions ADD COLUMN pos_cls INTEGER;
