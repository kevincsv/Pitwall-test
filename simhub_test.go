package main

import (
	"encoding/json"
	"net/http"
	"net/http/httptest"
	"testing"
	"time"
)

// The plugin needs this run's key and a request from this PC; anything else is refused
func TestSimhubKey(t *testing.T) {
	r := httptest.NewRequest("GET", "/api/simhub", nil)
	r.RemoteAddr = "127.0.0.1:5000"
	if simhubAllowed(r) {
		t.Fatal("no key must be refused")
	}
	r.Header.Set("X-PitlaneHQ-Key", "x"+simhubKey[1:])
	if simhubAllowed(r) {
		t.Fatal("a wrong key must be refused")
	}
	r.Header.Set("X-PitlaneHQ-Key", simhubKey)
	if !simhubAllowed(r) {
		t.Fatal("the key from this PC must be let in")
	}
	r.RemoteAddr = "192.168.1.20:5000"
	if simhubAllowed(r) {
		t.Fatal("another device must be refused, even with the key")
	}
	r.RemoteAddr = "127.0.0.1:5000"
	r.Header.Set("Cf-Connecting-Ip", "1.2.3.4")
	if simhubAllowed(r) {
		t.Fatal("a remote viewer must be refused")
	}
}

// Without admin mode (the feature is in development) the plugin is told it is off
func TestSimhubOffWithoutAdmin(t *testing.T) {
	mux := http.NewServeMux()
	registerSimhubRoutes(mux)
	r := httptest.NewRequest("GET", "/api/simhub", nil)
	r.RemoteAddr = "127.0.0.1:5000"
	r.Header.Set("X-PitlaneHQ-Key", simhubKey)
	w := httptest.NewRecorder()
	mux.ServeHTTP(w, r)
	if w.Code != 409 {
		t.Fatalf("code %d, want 409", w.Code)
	}
	var out struct{ Off bool }
	if json.Unmarshal(w.Body.Bytes(), &out) != nil || !out.Off {
		t.Fatalf("body %s", w.Body.String())
	}
}

// The frame carries the delta bar's delta, and nulls with no game
func TestSimhubFrame(t *testing.T) {
	st := newOvState("en")
	if f := simhubCompute(st, time.Now()); f.Connected || f.Delta != nil || f.V != simhubFeedVersion {
		t.Fatalf("no game: %+v", f)
	}
	st = ovTestState(t, nil)
	f := simhubCompute(st, time.Now())
	if !f.Connected || f.Delta == nil || *f.Delta != -0.37 {
		t.Fatalf("delta: %+v", f)
	}
	if f.CoachTurn != "" || f.CoachDist != nil {
		t.Fatalf("no laps yet, no coach: %+v", f)
	}
	simhubWithLap(&f, simhubLapState{live: true, n: 7, bad: true, hasLast: true, lastN: 6})
	b, _ := json.Marshal(f)
	var m map[string]any
	json.Unmarshal(b, &m)
	if m["lap"] != 7.0 || m["lapValid"] != false || m["lastLap"] != 6.0 || m["lastLapValid"] != true || m["coachDelta"] != nil {
		t.Fatalf("frame %s", b)
	}
}
