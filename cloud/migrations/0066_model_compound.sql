-- The model keeps the tyre compound of every lap it learnt (model.js, lapCompound): the agent's "cmp:<n>" flag, 0 for
-- an account's lap without it, -1 for a rival's lap (its tyres unknown). NULL: learnt before, read again by the model's
-- next run. A car and track whose laps were driven on several compounds get the references of each one apart (byCmp).
ALTER TABLE model_laps ADD COLUMN cmp INTEGER;
