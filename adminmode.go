package main

// Admin mode: an admin of the server sees Pitlane HQ exactly as everyone does until they turn admin mode on with
// the header's Admin button (index.html, `adminMode`, remembered per device). The page tells the agent (POST
// /api/adminmode) so what is in development for the admins (wipAllowed: the games in development, the .ibt import)
// follows it; it is kept in admin-mode.json in the data folder, this PC only (never synced), so it holds before the
// page loads. The account's own admin powers that are not "in development" (DRINKS, the voice chat, the LMU data
// capture) keep reading the account (realAdminSigned).

import (
	"encoding/json"
	"io"
	"net/http"
	"os"
	"path/filepath"
	"sync"
)

var (
	adminModeMu     sync.Mutex
	adminModeOn     bool
	adminModeLoaded bool
)

func adminModePath() string { return filepath.Join(dataDir(), "admin-mode.json") }

func adminMode() bool {
	adminModeMu.Lock()
	defer adminModeMu.Unlock()
	if !adminModeLoaded {
		adminModeLoaded = true
		var v struct {
			On bool `json:"on"`
		}
		if b, err := os.ReadFile(adminModePath()); err == nil && json.Unmarshal(b, &v) == nil {
			adminModeOn = v.On
		}
	}
	return adminModeOn
}

func setAdminMode(on bool) {
	adminMode()
	adminModeMu.Lock()
	defer adminModeMu.Unlock()
	if adminModeOn == on {
		return
	}
	adminModeOn = on
	os.MkdirAll(filepath.Dir(adminModePath()), 0o755)
	b, _ := json.Marshal(map[string]bool{"on": on})
	os.WriteFile(adminModePath(), b, 0o644)
}

// realAdminSigned: an admin of the server is signed in on this PC, whatever admin mode says.
func realAdminSigned() bool {
	loadPL()
	plMu.Lock()
	defer plMu.Unlock()
	return plAcc.Admin && plAcc.Token != ""
}

func registerAdminModeRoute(mux *http.ServeMux) {
	mux.HandleFunc("/api/adminmode", func(w http.ResponseWriter, r *http.Request) {
		if r.Method == http.MethodPost {
			var in struct {
				On bool `json:"on"`
			}
			json.NewDecoder(io.LimitReader(r.Body, 1<<10)).Decode(&in)
			setAdminMode(in.On)
		}
		writeJSON(w, map[string]bool{"on": adminMode(), "admin": realAdminSigned()})
	})
}
