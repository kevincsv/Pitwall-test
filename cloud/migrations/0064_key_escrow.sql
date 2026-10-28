-- A copy of the account's data key sealed with the server's own secret (DATA_KEY, sealData in crypt.js), with the
-- account's email beside it: a sign-in with Steam or Discord gets the key from here and never asks the password (the
-- owner's choice). Each device uploads it once (POST /account/escrow); a password reset with a new key clears it.
ALTER TABLE accounts ADD COLUMN escrow TEXT;
