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
