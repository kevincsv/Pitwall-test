package main

import "testing"

// a session started again without leaving it: the new run's laps are numbered after the ones driven, so none
// takes another's place; a new session starts from zero
func TestSessionRuns(t *testing.T) {
	runNow = sessionRun{}
	if b, r := noteRun("a|2", 10, 1); b != 0 || r != 0 {
		t.Fatalf("first run: %d %d", b, r)
	}
	noteRun("a|2", 200, 4)
	if b, r := noteRun("a|2", 3, 0); b != 4 || r != 1 {
		t.Fatalf("restart: base %d run %d, want 4 1", b, r)
	}
	noteRun("a|2", 90, 2)
	if b, _ := noteRun("a|2", 1, 1); b != 6 {
		t.Fatalf("second restart: base %d, want 6", b)
	}
	if b, r := runBase("a|2"); b != 6 || r != 2 {
		t.Fatalf("runBase: %d %d", b, r)
	}
	if b, r := noteRun("b|2", 500, 1); b != 0 || r != 0 {
		t.Fatalf("another session starts at zero: %d %d", b, r)
	}
	// the clock jumping back a moment (less than 5 s) is not a restart
	if b, _ := noteRun("b|2", 497, 1); b != 0 {
		t.Fatalf("a small step back: base %d", b)
	}
}

// DRINKS mode: the lap is theirs who drove most of it
func TestLapDriver(t *testing.T) {
	r := &lapRec{drv: map[string]int{"Ana": 3, "": 80}}
	if d := r.topDriver(); d != "" {
		t.Fatalf("mostly you: %q", d)
	}
	r.drv = map[string]int{"Ana": 70, "": 5}
	if d := r.topDriver(); d != "Ana" {
		t.Fatalf("mostly Ana: %q", d)
	}
	if d := (&lapRec{}).topDriver(); d != "" {
		t.Fatalf("nothing counted: %q", d)
	}
}

// an offline race summarised before it said so is against the AI
func TestMarkOfflineAI(t *testing.T) {
	if r := (&raceReport{ID: "t-Spa-2"}); !markOfflineAI(r) || !r.AI {
		t.Fatal("an offline race")
	}
	if r := (&raceReport{ID: "123-2", Subsession: 123}); markOfflineAI(r) || r.AI {
		t.Fatal("a hosted or official race")
	}
	if r := (&raceReport{ID: "t-x-1", Game: "lmu"}); markOfflineAI(r) {
		t.Fatal("another game")
	}
}

// a race against the AI has no iRating: the estimate from the AI's missing iRatings (0/0) is never kept, and an
// older summary with it is cleaned when the journal loads
func TestAIRaceHasNoIRating(t *testing.T) {
	for _, v := range irChanges([]int{0, 0, 0}, []int{1, 2, 3}, []bool{true, true, true}) {
		if v != 0 {
			t.Fatalf("an estimate from no iRatings: %d", v)
		}
	}
	r := &raceReport{ID: "t-1", AI: true, IR: 1, IRChange: -80, IRReal: true, Results: []raceResult{{Pos: 1, IR: 0, IRChange: -9223372036854775808, AI: true}, {Pos: 2, IR: 1, IRChange: -80, Me: true}}}
	if !clearAIRatings(r) {
		t.Fatal("the summary had iRatings to clear")
	}
	if r.IR != 0 || r.IRChange != 0 || r.IRReal || r.Results[0].IRChange != 0 || r.Results[1].IR != 0 || r.Results[1].IRChange != 0 {
		t.Fatalf("iRating left on an AI race: %+v", r)
	}
	if clearAIRatings(r) || clearAIRatings(&raceReport{ID: "r2", IR: 1500, IRChange: 20}) {
		t.Fatal("nothing to clear on a clean AI race or an official one")
	}
}
