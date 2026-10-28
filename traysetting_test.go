package main

import (
	"net/http"
	"net/http/httptest"
	"strings"
	"testing"
)

// closing Pitlane HQ Desktop's window keeps it in the notification area by default, and a page that does not know
// the setting (older, or the native screens' save) never turns it off
func TestTrayOnCloseSetting(t *testing.T) {
	t.Setenv("PITLANEHQ_DATA", t.TempDir())
	loadSettings()
	defer loadSettings()
	if c, _ := settingsSnapshot(); !c.TrayOnClose {
		t.Fatal("trayOnClose should be on by default")
	}
	mux := http.NewServeMux()
	registerConfigRoutes(mux)
	post := func(body string) {
		rec := httptest.NewRecorder()
		mux.ServeHTTP(rec, httptest.NewRequest("POST", "/api/config", strings.NewReader(body)))
		if rec.Code != 200 {
			t.Fatalf("POST %s: %d", body, rec.Code)
		}
	}
	post(`{"trayOnClose":false,"ui":{}}`)
	if c, _ := settingsSnapshot(); c.TrayOnClose {
		t.Fatal("trayOnClose should be off after the page turned it off")
	}
	post(`{"alpha":200,"ui":{}}`)
	if c, _ := settingsSnapshot(); c.TrayOnClose {
		t.Fatal("a save without trayOnClose must keep it off")
	}
	post(`{"trayOnClose":true}`)
	loadSettings()
	if c, _ := settingsSnapshot(); !c.TrayOnClose {
		t.Fatal("trayOnClose should be saved on")
	}
}
