-- The overlay feedback window (PC only): after a race driven with an overlay open the PC tells the server
-- (POST /community/feedback/ovrace, usage.js), which asks after the first such race and, once answered, every six.
-- What a driver writes says which window it came from (kind: general or overlays) and the overlay design used (style).
ALTER TABLE feedback ADD COLUMN kind TEXT NOT NULL DEFAULT 'general';
ALTER TABLE feedback ADD COLUMN style TEXT;
-- per account: races with overlays since the overlay window was last shown, whether it was ever answered, the design
-- of the last race and its session (the same race told twice counts once)
ALTER TABLE feedback_ask ADD COLUMN ov_races INTEGER NOT NULL DEFAULT 0;
ALTER TABLE feedback_ask ADD COLUMN ov_answered INTEGER NOT NULL DEFAULT 0;
ALTER TABLE feedback_ask ADD COLUMN ov_last_style TEXT;
ALTER TABLE feedback_ask ADD COLUMN ov_last_sid TEXT;
