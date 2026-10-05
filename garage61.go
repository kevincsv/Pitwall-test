package main

// Garage 61 (garage61.net) connection: lets Pitlane HQ load reference laps
// (yours or your team's) from Garage 61 to compare against while you drive.
// Uses a personal developer token from garage61.net/developer.

import (
	"encoding/json"
	"errors"
	"io"
	"net/http"
	"os"
	"path/filepath"
	"strings"
	"sync"
	"time"
)

const g61Base = "https://garage61.net/api/v1/"

var (
	g61Mu    sync.Mutex
	g61Token string
	g61User  map[string]any
)

func g61Path() string { return filepath.Join(activeDir(), "garage61.json") }

// loadG61 reads the Garage 61 token of the active profile.
func loadG61() {
	g61Mu.Lock()
	defer g61Mu.Unlock()
	g61Token, g61User = "", nil
	b, err := readSecret(g61Path())
	if err != nil {
		return
	}
	var v struct{ Token string }
	if json.Unmarshal(b, &v) == nil {
		g61Token = v.Token
	}
}

func g61Get(path, rawQuery, token string) ([]byte, string, int, error) {
	u := g61Base + strings.TrimPrefix(path, "/")
	if rawQuery != "" {
		u += "?" + rawQuery
	}
	req, _ := http.NewRequest("GET", u, nil)
	req.Header.Set("Authorization", "Bearer "+token)
	req.Header.Set("Accept", "application/json, text/csv")
	resp, err := httpc.Do(req)
	if err != nil {
		return nil, "", 502, errors.New("could not reach Garage 61")
	}
	defer resp.Body.Close()
	b, err := io.ReadAll(io.LimitReader(resp.Body, 32<<20))
	return b, resp.Header.Get("Content-Type"), resp.StatusCode, err
}

func registerG61Routes(mux *http.ServeMux) {
	mux.HandleFunc("/api/g61/status", func(w http.ResponseWriter, r *http.Request) {
		g61Mu.Lock()
		tok, user := g61Token, g61User
		g61Mu.Unlock()
		if tok != "" && user == nil {
			if b, _, code, err := g61Get("me", "", tok); err == nil && code == 200 {
				json.Unmarshal(b, &user)
				g61Mu.Lock()
				g61User = user
				g61Mu.Unlock()
			}
		}
		writeJSON(w, map[string]any{"connected": tok != "", "user": user})
	})
	mux.HandleFunc("/api/g61/token", func(w http.ResponseWriter, r *http.Request) {
		if r.Method != http.MethodPost {
			http.Error(w, "POST only", 405)
			return
		}
		var in struct{ Token string }
		json.NewDecoder(io.LimitReader(r.Body, 1<<14)).Decode(&in)
		tok := strings.TrimSpace(in.Token)
		if tok == "" { // sign out
			g61Mu.Lock()
			g61Token, g61User = "", nil
			g61Mu.Unlock()
			os.Remove(g61Path())
			writeJSON(w, map[string]any{"connected": false})
			return
		}
		b, _, code, err := g61Get("me", "", tok)
		if err != nil || code != 200 {
			w.WriteHeader(400)
			msg := "Garage 61 did not accept this token"
			if err != nil {
				msg = err.Error()
			}
			writeJSON(w, map[string]string{"error": msg})
			return
		}
		var user map[string]any
		json.Unmarshal(b, &user)
		g61Mu.Lock()
		g61Token, g61User = tok, user
		g61Mu.Unlock()
		data, _ := json.Marshal(map[string]string{"token": tok, "saved": time.Now().Format(time.RFC3339)})
		writeSecret(g61Path(), data)
		writeJSON(w, map[string]any{"connected": true, "user": user})
	})
	// Any Garage 61 API path, e.g. /api/g61/tracks, /api/g61/laps?tracks=1&drivers=me, /api/g61/laps/ID/csv
	mux.HandleFunc("/api/g61/", func(w http.ResponseWriter, r *http.Request) {
		path := strings.TrimPrefix(r.URL.Path, "/api/g61/")
		if path == "" || strings.Contains(path, "..") {
			http.Error(w, "missing path", 400)
			return
		}
		g61Mu.Lock()
		tok := g61Token
		g61Mu.Unlock()
		if tok == "" {
			w.WriteHeader(401)
			writeJSON(w, map[string]string{"error": "Garage 61 is not connected"})
			return
		}
		b, ct, code, err := g61Get(path, r.URL.RawQuery, tok)
		if err != nil {
			w.WriteHeader(code)
			writeJSON(w, map[string]string{"error": err.Error()})
			return
		}
		if ct == "" {
			ct = "application/json"
		}
		w.Header().Set("Content-Type", ct)
		w.WriteHeader(code)
		w.Write(b)
	})
}
