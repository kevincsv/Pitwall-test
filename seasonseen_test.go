package main

import (
	"testing"
	"time"
)

func TestRaceStart(t *testing.T) {
	now := time.Date(2026, 10, 30, 14, 20, 31, 0, time.UTC)
	got, ok := raceStart(now, 5*60+40) // launched 5 min 40 s ago: 14:14:51, to the minute 14:15
	if !ok || !got.Equal(time.Date(2026, 10, 30, 14, 15, 0, 0, time.UTC)) {
		t.Fatalf("start %v %v", got, ok)
	}
	for _, st := range []float64{0, -1, 4 * 3600} {
		if _, ok := raceStart(now, st); ok {
			t.Fatalf("session time %v believed", st)
		}
	}
}
