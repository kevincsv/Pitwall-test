package main

import (
	"encoding/json"
	"io"
	"net/http"
	"net/http/httptest"
	"os"
	"strings"
	"testing"
	"time"
)

// shareHome: a home folder for a sharing test. Not t.TempDir: sharing saves the community settings from a
// goroutine that can still be writing when the test ends, and TempDir's cleanup fails on a folder that is not
// empty yet; this one is removed a moment later.
func shareHome(t *testing.T) string {
	dir, err := os.MkdirTemp("", "pwshare")
	if err != nil {
		t.Fatal(err)
	}
	t.Cleanup(func() {
		for i := 0; i < 10 && os.RemoveAll(dir) != nil; i++ {
			time.Sleep(50 * time.Millisecond)
		}
	})
	return dir
}

func TestCommunityShareReport(t *testing.T) {
	shareRaceReports = true // switched off in the app for now; the sharing itself stays tested
	defer func() { shareRaceReports = false }()
	dir := shareHome(t)
	t.Setenv("XDG_CONFIG_HOME", dir)
	t.Setenv("HOME", dir)
	t.Setenv("APPDATA", dir)
	got := make(chan string, 4)
	srv := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		b, _ := io.ReadAll(r.Body)
		switch r.URL.Path {
		case "/community/register":
			w.Write([]byte(`{"id":"u1","token":"tok-0123456789abcdefghij"}`))
		case "/community/reports":
			if r.Header.Get("Authorization") != "Bearer tok-0123456789abcdefghij" {
				w.WriteHeader(401)
				return
			}
			got <- string(b)
			w.Write([]byte(`{"shared":true}`))
		}
	}))
	defer srv.Close()
	commMu.Lock()
	commCfg = commConfig{URL: srv.URL, Alias: "Driver", ShareReports: true}
	commMu.Unlock()
	shareReport(&raceReport{ID: "r1", Track: "Navarra", Results: []raceResult{{Pos: 1, Name: "Real Person"}, {Pos: 2, Name: "Driver C", Me: true}},
		Brakes: []carBrakes{{Name: "Real Person", Pos: 1}, {Name: "Driver C", Me: true}}})
	select {
	case b := <-got:
		// the other drivers by first name only, you by your name (not anonymous here)
		if strings.Contains(b, "Real Person") || !strings.Contains(b, `"Real"`) || !strings.Contains(b, "Driver C") {
			t.Fatalf("other drivers must show by first name only: %s", b)
		}
		var m map[string]any
		json.Unmarshal([]byte(b), &m)
	case <-time.After(3 * time.Second):
		t.Fatal("report not sent")
	}
	commMu.Lock()
	tok := commCfg.Token
	commMu.Unlock()
	if tok == "" {
		t.Fatal("token not kept")
	}
}

// shared anonymously: your name is not inside the report either
func TestCommunityShareReportAnonymous(t *testing.T) {
	shareRaceReports = true // switched off in the app for now; the sharing itself stays tested
	defer func() { shareRaceReports = false }()
	dir := shareHome(t)
	t.Setenv("XDG_CONFIG_HOME", dir)
	t.Setenv("HOME", dir)
	t.Setenv("APPDATA", dir)
	got := make(chan string, 4)
	srv := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		b, _ := io.ReadAll(r.Body)
		switch r.URL.Path {
		case "/community/register":
			w.Write([]byte(`{"id":"u1","token":"tok-0123456789abcdefghij"}`))
		case "/community/reports":
			got <- string(b)
			w.Write([]byte(`{"shared":true}`))
		}
	}))
	defer srv.Close()
	commMu.Lock()
	commCfg = commConfig{URL: srv.URL, Alias: "Driver", ShareReports: true, Anonymous: true}
	commMu.Unlock()
	shareReport(&raceReport{ID: "r2", Track: "Navarra", Results: []raceResult{{Pos: 1, Name: "Real Person"}, {Pos: 2, Name: "Driver C", Me: true}},
		Brakes: []carBrakes{{Name: "Real Person", Pos: 1}, {Name: "Driver C", Me: true}}})
	select {
	case b := <-got:
		if strings.Contains(b, "Driver C") || !strings.Contains(b, `"Anonymous"`) || !strings.Contains(b, `"anon":true`) {
			t.Fatalf("an anonymous report must not carry your name: %s", b)
		}
	case <-time.After(3 * time.Second):
		t.Fatal("report not sent")
	}
}
