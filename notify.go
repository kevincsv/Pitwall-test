package main

import "log"

// notify: Pitlane HQ never shows Windows notifications (nothing in the action centre); what it would have told
// (a new version, a race summary ready) the app shows inside its own window, so here it only goes to the log.
func notify(title, body string) { log.Printf("Notice: %s · %s", title, body) }
