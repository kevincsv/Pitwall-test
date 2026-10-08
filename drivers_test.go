package main

import (
	"encoding/json"
	"net/http"
	"net/http/httptest"
	"strings"
	"testing"
)

// your notes on drivers: saved by key (or by name for older races), a name note moves to the key, the
// tag of a driver of the session is found by their id's key, and an empty note goes away
func TestDriverNotes(t *testing.T) {
	dir := t.TempDir()
	t.Setenv("XDG_CONFIG_HOME", dir)
	t.Setenv("HOME", dir)
	t.Setenv("APPDATA", dir)
	initProfiles()
	loadJournal()
	mux := http.NewServeMux()
	registerDriverRoutes(mux)
	do := func(body string) (int, map[string]*driverNote) {
		req := httptest.NewRequest("POST", "/api/drivers", strings.NewReader(body))
		rec := httptest.NewRecorder()
		mux.ServeHTTP(rec, req)
		var m struct{ Drivers map[string]*driverNote }
		json.Unmarshal(rec.Body.Bytes(), &m)
		return rec.Code, m.Drivers
	}
	if code, d := do(`{"name":"Fast  Rival","tag":"danger","note":"closes the door in T1"}`); code != 200 || d["n:fast rival"] == nil || d["n:fast rival"].Tag != "danger" {
		t.Fatalf("by name: %d %v", code, d)
	}
	if tagOfDriver("", "fast rival") != "danger" {
		t.Fatal("a note by name is found by name")
	}
	k := driverKey("4242")
	if code, d := do(`{"key":"` + k + `","name":"Fast Rival","tag":"careful","note":"x"}`); code != 200 || d["n:fast rival"] != nil || d[k] == nil || d[k].Tag != "careful" {
		t.Fatalf("the note by name moves to the key: %d %v", code, d)
	}
	if tagOfDriver("4242", "Someone Else") != "careful" {
		t.Fatal("a driver of the session is found by their id's key")
	}
	if _, d := do(`{"key":"` + k + `","name":"Fast Rival","tag":"bogus","note":""}`); len(d) != 0 {
		t.Fatalf("no tag and no note removes it: %v", d)
	}
	if code, _ := do(`{"key":"nothex","name":"","tag":"danger"}`); code != 400 {
		t.Fatal("a driver with no key and no name was accepted")
	}
	// kept on disk, and found again after a reload (a sync)
	do(`{"name":"Joe","tag":"friend"}`)
	loadJournal()
	if tagOfDriver("", "Joe") != "friend" {
		t.Fatal("notes not kept on disk")
	}
}
