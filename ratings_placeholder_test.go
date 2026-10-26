package main

import "testing"

// An offline session shows iRating 1 and "R 0.01" in every discipline: never anybody's rating.
func TestOfflinePlaceholderRating(t *testing.T) {
	ratingsMu.Lock()
	old := ratings
	ratings = map[string]*discRating{}
	defer func() { ratings = old; ratingsMu.Unlock() }()
	if noteRating("formula_car", 1, "R 0.01", "session", 10) {
		t.Fatal("the offline placeholder was kept")
	}
	if !noteRating("formula_car", 1850, "C 2.41", "session", 20) || ratings["formula_car"].IR != 1850 {
		t.Fatal("a real rating was not kept")
	}
}

// A lap counts only when it went round the whole circuit.
func TestFullLap(t *testing.T) {
	if fullLap(90, 620) || !fullLap(600, 620) || fullLap(0, 0) {
		t.Fatal("fullLap")
	}
}
