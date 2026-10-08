-- The supporter badge by itself for Patreon patrons (0.8.12): where the badge came from ('patreon' or 'manual',
-- so ending a membership never removes a badge an admin gave by hand), and the patrons by the hash of their
-- email (never the email), so an account created later with that email gets it too
ALTER TABLE accounts ADD COLUMN supporter_src TEXT;
UPDATE accounts SET supporter_src='manual' WHERE supporter=1;
CREATE TABLE IF NOT EXISTS patreon_patrons (
  email_hash TEXT PRIMARY KEY,
  active INTEGER NOT NULL DEFAULT 0,
  updated INTEGER NOT NULL
);
