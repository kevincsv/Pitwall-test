package main

import "testing"

// a session of another category (Sports Car after a Formula Car race) brings that category's iRating: it is not
// what the race gave, so it never replaces the estimate; and a race already spoiled so goes back to the estimate
func TestRealIRotherCategory(t *testing.T) {
	journalMu.Lock()
	saved := races
	journalMu.Unlock()
	defer func() { journalMu.Lock(); races = saved; journalMu.Unlock() }()
	r := &raceReport{ID: "f", Subsession: 1, IR: 1959, IRChange: -40, Cat: "Road",
		Results: []raceResult{{Pos: 1, IR: 2100, Laps: 10}, {Pos: 2, IR: 1959, Laps: 10, Me: true}, {Pos: 3, IR: 1800, Laps: 10}}}
	journalMu.Lock()
	races = []*raceReport{r}
	journalMu.Unlock()
	applyRealIR(980, 2, "Road") // the Sports Car iRating: far from this race's
	if r.IRReal || r.IRChange != -40 {
		t.Fatalf("took another category's iRating: %+v", r)
	}
	applyRealIR(1917, 3, "Oval") // another category by name
	if r.IRReal {
		t.Fatal("took an Oval session's iRating")
	}
	applyRealIR(1917, 4, "Road")
	if !r.IRReal || r.IRChange != -42 {
		t.Fatalf("the real change: %+v", r)
	}
	bad := &raceReport{IR: 1959, IRChange: -979, IRReal: true, Results: []raceResult{{Pos: 1, IR: 2100, Laps: 10}, {Pos: 2, IR: 1959, Laps: 10, Me: true, IRChange: -979}}}
	if !repairRealIR(bad) || bad.IRReal || abs(bad.IRChange) > maxRealIRStep || bad.Results[1].IRChange != bad.IRChange {
		t.Fatalf("not repaired: %+v", bad)
	}
}
