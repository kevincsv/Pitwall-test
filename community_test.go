package main

import (
	"encoding/json"
	"io"
	"net/http"
	"net/http/httptest"
	"strings"
	"testing"
	"time"
)

func TestCommunityShareReport(t *testing.T) {
	dir := t.TempDir()
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
	commCfg = commConfig{URL: srv.URL, Alias: "Alex", ShareReports: true}
	commMu.Unlock()
	shareReport(&raceReport{ID: "r1", Track: "Navarra", Results: []raceResult{{Pos: 1, Name: "Real Person"}, {Pos: 2, Name: "Alex D", Me: true}},
		Brakes: []carBrakes{{Name: "Real Person", Pos: 1}, {Name: "Alex D", Me: true}}})
	select {
	case b := <-got:
		if strings.Contains(b, "Real Person") || !strings.Contains(b, `"P1"`) || !strings.Contains(b, "Alex D") {
			t.Fatalf("other drivers' names must be removed: %s", b)
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
