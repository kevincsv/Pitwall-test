package main

import (
	"path/filepath"
	"strings"
	"testing"
)

// the official number of turns from the session text, sent once per track and count while Pitlane HQ runs
func TestTrackNumTurns(t *testing.T) {
	y := "WeekendInfo:\n TrackName: spa\n TrackID: 163\n TrackNumTurns: 19\n TrackLength: 7.00 km\n"
	if n := trackNumTurns(y); n != 19 {
		t.Fatalf("turns %d", n)
	}
	if trackNumTurns("WeekendInfo:\n TrackID: 1\n") != 0 || trackNumTurns("WeekendInfo:\n TrackNumTurns: 0\n") != 0 || trackNumTurns("WeekendInfo:\n TrackNumTurns: 400\n") != 0 {
		t.Fatal("no count, zero or nonsense is not a count")
	}
	if !turnsToSend("iracing", 9001, 19) || turnsToSend("iracing", 9001, 19) {
		t.Fatal("once per track and count")
	}
	if !turnsToSend("iracing", 9001, 20) {
		t.Fatal("a new count goes again")
	}
}

// the .ibt header carries the session text: its track and count are read without replaying the file
func TestIBTHeaderTurns(t *testing.T) {
	p := filepath.Join(t.TempDir(), "a.ibt")
	writeTestIBTYAML(t, p, strings.Replace(testIBTYAML, " TrackID: 77\n", " TrackID: 77\n TrackNumTurns: 12\n", 1), -1)
	x, err := openIBT(p)
	if err != nil {
		t.Fatal(err)
	}
	defer x.Close()
	if c := currentCarTrack(x.yaml); c.TrackID != 77 || trackNumTurns(x.yaml) != 12 {
		t.Fatalf("track %d turns %d", c.TrackID, trackNumTurns(x.yaml))
	}
}
