package main

// Track maps are drawn by the app from the player's own laps and shared here,
// so every phone, tablet and overlay window gets the same map instantly.

import (
	"encoding/json"
	"io"
	"net/http"
	"os"
	"path/filepath"
	"regexp"
)

var mapKeyRe = regexp.MustCompile(`^[A-Za-z0-9_-]{1,64}$`)

func mapPath(key string) string {
	dir, err := os.UserConfigDir()
	if err != nil {
		dir = "."
	}
	return filepath.Join(dir, "PitWall", "maps", key+".json")
}

func registerMapRoutes(mux *http.ServeMux) {
	mux.HandleFunc("/api/map", func(w http.ResponseWriter, r *http.Request) {
		key := r.URL.Query().Get("key")
		if !mapKeyRe.MatchString(key) {
			http.Error(w, "bad key", 400)
			return
		}
		p := mapPath(key)
		switch r.Method {
		case http.MethodGet:
			b, err := os.ReadFile(p)
			if err != nil {
				http.Error(w, "no map yet", 404)
				return
			}
			w.Header().Set("Content-Type", "application/json")
			w.Header().Set("Cache-Control", "no-cache")
			w.Write(b)
		case http.MethodPost:
			b, err := io.ReadAll(io.LimitReader(r.Body, 4<<20))
			if err != nil {
				http.Error(w, err.Error(), 400)
				return
			}
			var in struct {
				Laps int `json:"laps"`
			}
			if json.Unmarshal(b, &in) != nil {
				http.Error(w, "bad map", 400)
				return
			}
			if old, err := os.ReadFile(p); err == nil {
				var o struct {
					Laps int `json:"laps"`
				}
				if json.Unmarshal(old, &o) == nil && o.Laps > in.Laps {
					writeJSON(w, map[string]any{"kept": "existing", "laps": o.Laps})
					return
				}
			}
			os.MkdirAll(filepath.Dir(p), 0o755)
			if err := os.WriteFile(p, b, 0o644); err != nil {
				http.Error(w, err.Error(), 500)
				return
			}
			writeJSON(w, map[string]any{"saved": true, "laps": in.Laps})
		default:
			http.Error(w, "GET or POST", 405)
		}
	})
}
