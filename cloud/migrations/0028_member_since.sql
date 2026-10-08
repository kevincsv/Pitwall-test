-- "In Pitlane HQ since" on a profile (0.8.14): an admin can set it by hand for an account (older drivers who
-- were there before their account); empty means the day the account was created
ALTER TABLE accounts ADD COLUMN member_since INTEGER;
-- the owner of Pitlane HQ, there since 15 May 2026
UPDATE accounts SET member_since=1778846400000 WHERE id='3e224233fde0e11f670d2d97';
