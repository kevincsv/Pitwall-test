package main

import (
	"math"
	"testing"
	"time"
)

// A car at a steady 50 m/s sampled 30 times a second: every 5 m point must
// get exactly distance/speed seconds, whatever the sample spacing.
func TestLapRecInterpolatesTimes(t *testing.T) {
	r := &lapRec{}
	for i := 0; i <= 30*60; i++ {
		tt := float64(i) / 30
		d := 3 + 50*tt // first sample 3 m after the line
		if d > 3000 {
			break
		}
		r.add(d, tt+3.0/50, 50, [4]float64{1, 0, 4, 0})
	}
	for k, b := range r.bins {
		want := float64(k*lapBin) / 50
		if math.Abs(b[5]-want) > 0.001 {
			t.Fatalf("point %d m: time %.4f, want %.4f", k*lapBin, b[5], want)
		}
	}
}

func TestLapRecIgnoresOldClock(t *testing.T) {
	r := &lapRec{}
	r.add(2, 98.4, 50, [4]float64{}) // previous lap's time still showing after the line
	if len(r.bins) != 0 {
		t.Fatal("a stale lap time must be ignored")
	}
	r.add(2, 0.04, 50, [4]float64{})
	if len(r.bins) != 1 || r.bins[0][5] != 0 {
		t.Fatalf("lap start should be at 0 s, got %v", r.bins)
	}
}

func TestSessionMeta(t *testing.T) {
	y := "WeekendInfo:\n TrackDisplayName: Spa\n SubSessionID: 123\nSessionInfo:\n Sessions:\n - SessionNum: 0\n   SessionType: Practice\n - SessionNum: 2\n   SessionType: Race\nDriverInfo:\n DriverCarIdx: 7\n Drivers:\n - CarIdx: 6\n   UserName: Other\n   CarScreenName: Wrong\n - CarIdx: 7\n   UserName: Driver C.\n   CarScreenName: Porsche 911 GT3 R\n"
	s := sessionMeta(y, 2, timeZero)
	if s.Track != "Spa" || s.Car != "Porsche 911 GT3 R" || s.Driver != "Driver C." || s.Kind != "Race" || s.ID != "ir-123-2" {
		t.Fatalf("bad meta %+v", s)
	}
}

var timeZero = time.Unix(0, 0)
