-- Pitlane HQ Pro (0.4.1): bought on Lemon Squeezy (lifetime, or a subscription later) or given by an admin by hand.
-- pro_until 0: no end (lifetime, manual); a time: a subscription paid until then.
ALTER TABLE accounts ADD COLUMN pro INTEGER NOT NULL DEFAULT 0;
ALTER TABLE accounts ADD COLUMN pro_src TEXT;
ALTER TABLE accounts ADD COLUMN pro_until INTEGER NOT NULL DEFAULT 0;
ALTER TABLE accounts ADD COLUMN pro_since INTEGER NOT NULL DEFAULT 0;
-- every purchase the store reported, so a buyer without an account yet gets Pro when they create one with that email
CREATE TABLE IF NOT EXISTS pro_orders (
  id TEXT PRIMARY KEY,
  account_id TEXT,
  email_hash TEXT,
  kind TEXT NOT NULL,
  status TEXT,
  until INTEGER NOT NULL DEFAULT 0,
  at INTEGER NOT NULL
);
CREATE INDEX IF NOT EXISTS pro_orders_email ON pro_orders (email_hash);
-- Pro is kept on one PC (an opaque id the PC makes from Windows' machine id, and its name to say where it is)
ALTER TABLE accounts ADD COLUMN pro_pc TEXT;
ALTER TABLE accounts ADD COLUMN pro_pc_name TEXT;
ALTER TABLE accounts ADD COLUMN pro_pc_at INTEGER NOT NULL DEFAULT 0;
