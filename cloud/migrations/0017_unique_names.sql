-- nicknames are unique on the platform (accounts and the Drinks-mode drivers of admins);
-- each shared item remembers which name it was shared under: anonymous, nickname or iRacing name
ALTER TABLE community_users ADD COLUMN owner TEXT;
ALTER TABLE community_users ADD COLUMN iracing TEXT;
ALTER TABLE community_laps ADD COLUMN shown TEXT;
ALTER TABLE community_reports ADD COLUMN shown TEXT;
CREATE INDEX IF NOT EXISTS community_users_alias ON community_users(lower(alias));
