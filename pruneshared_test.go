package main

import "testing"

// nothing is shared (shareRaceReports is off): the "delete once shared" setting never removes a race
func TestPruneSharedKeepsUnsharedRaces(t *testing.T) {
	commMu.Lock()
	saved := commCfg
	commCfg.ShareReports, commCfg.DeleteAfter = true, "1d"
	commMu.Unlock()
	journalMu.Lock()
	was := races
	races = []*raceReport{{ID: "old", When: 1}, {ID: "older", When: 2}}
	journalMu.Unlock()
	t.Cleanup(func() {
		commMu.Lock()
		commCfg = saved
		commMu.Unlock()
		journalMu.Lock()
		races = was
		journalMu.Unlock()
	})
	pruneShared()
	journalMu.Lock()
	n := len(races)
	journalMu.Unlock()
	if n != 2 {
		t.Fatalf("races left: %d", n)
	}
}
