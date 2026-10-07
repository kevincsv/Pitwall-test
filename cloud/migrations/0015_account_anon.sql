-- the account shares anonymously (others see "Anonymous"), the same on every device
ALTER TABLE accounts ADD COLUMN anon INTEGER NOT NULL DEFAULT 0;
