-- "Sign in with Steam" from the phone apps: a state started by one (app 1) goes back to it by its own scheme
-- (pitlanehq://steam?state=…), its grant still good only with the app's code. Discord's has it in 0057
ALTER TABLE steam_oauth ADD COLUMN app INTEGER NOT NULL DEFAULT 0;
