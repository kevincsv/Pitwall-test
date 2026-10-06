-- Email verification and password reset. The email address itself is still
-- not stored: links are sent to the address typed at that moment.
ALTER TABLE accounts ADD COLUMN verified INTEGER NOT NULL DEFAULT 0;
CREATE TABLE IF NOT EXISTS email_tokens (
  token_hash TEXT PRIMARY KEY,
  account_id TEXT NOT NULL,
  kind TEXT NOT NULL,
  expires INTEGER NOT NULL
);
CREATE INDEX IF NOT EXISTS email_tokens_acc ON email_tokens(account_id, kind);
