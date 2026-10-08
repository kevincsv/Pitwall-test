package main

// Driver notes: your own marks on the other iRacing drivers, like a notebook of who races clean and who
// closes the door when they can. Each driver gets one tag (danger, careful, clean, friend) and a note; the
// relative and the standings (overlays and the app) show the tag's icon next to their name, the race summary
// lets you mark them, and the engineer warns you when a driver marked dangerous is close. They live in
// drivers.json, synced with the account like the rest. A driver is known by the same opaque key as the
// community's (driverKey, never their iRacing id), or by their name for races recorded before keys.

import (
	"encoding/json"
	"io"
	"net/http"
	"strings"
	"sync"
	"time"
)

type driverNote struct {
	Name    string `json:"name,omitempty"`
	Tag     string `json:"tag,omitempty"`
	Note    string `json:"note,omitempty"`
	Updated int64  `json:"updated,omitempty"`
}

var driverTags = map[string]bool{"danger": true, "careful": true, "clean": true, "friend": true}

var (
	driversMu sync.Mutex
	drivers   = map[string]*driverNote{}
)

func loadDrivers() {
	d := map[string]*driverNote{}
	readJSON(journalFile("drivers.json"), &d)
	driversMu.Lock()
	drivers = d
	driversMu.Unlock()
}

// nameKey: the key of a driver known only by name (races recorded before the keys)
func nameKey(name string) string {
	n := strings.ToLower(strings.Join(strings.Fields(name), " "))
	if n == "" {
		return ""
	}
	return "n:" + n
}

// noteOf: your note on a driver, by their key first and then by their name; nil when you have none
func noteOf(key, name string) *driverNote {
	driversMu.Lock()
	defer driversMu.Unlock()
	if n := drivers[key]; key != "" && n != nil {
		return n
	}
	if k := nameKey(name); k != "" {
		return drivers[k]
	}
	return nil
}

// tagOfDriver: the tag of a driver of the session (their iRacing id stays here, only its key is looked up)
func tagOfDriver(userID, name string) string {
	if n := noteOf(driverKey(userID), name); n != nil {
		return n.Tag
	}
	return ""
}

// setDriverNote saves (or with no tag and no note, removes) the note on one driver. A note kept by name
// moves to the driver's key once the key is known, so the same driver never has two.
func setDriverNote(key, name, tag, note string) (*driverNote, bool) {
	key = strings.ToLower(strings.TrimSpace(key))
	if len(key) != 32 || strings.Trim(key, "0123456789abcdef") != "" {
		key = ""
	}
	name = cleanText(name, 80)
	nk := nameKey(name)
	if key == "" {
		key = nk
	}
	if key == "" {
		return nil, false
	}
	if !driverTags[tag] {
		tag = ""
	}
	note = cleanText(note, 500)
	driversMu.Lock()
	defer driversMu.Unlock()
	if nk != "" && nk != key {
		delete(drivers, nk)
	}
	var out *driverNote
	if tag == "" && note == "" {
		delete(drivers, key)
	} else {
		out = &driverNote{Name: name, Tag: tag, Note: note, Updated: time.Now().UnixMilli()}
		drivers[key] = out
	}
	writeJSONFile(journalFile("drivers.json"), drivers)
	return out, true
}

func driversCopy() map[string]*driverNote {
	driversMu.Lock()
	defer driversMu.Unlock()
	out := make(map[string]*driverNote, len(drivers))
	for k, v := range drivers {
		out[k] = v
	}
	return out
}

func registerDriverRoutes(mux *http.ServeMux) {
	// GET: every note; POST {key, name, tag, note}: one driver's (no tag and no note removes it)
	mux.HandleFunc("/api/drivers", func(w http.ResponseWriter, r *http.Request) {
		if r.Method == http.MethodPost {
			var in struct{ Key, Name, Tag, Note string }
			if json.NewDecoder(io.LimitReader(r.Body, 1<<14)).Decode(&in) != nil {
				http.Error(w, "bad request", 400)
				return
			}
			if _, ok := setDriverNote(in.Key, in.Name, in.Tag, in.Note); !ok {
				w.WriteHeader(400)
				writeJSON(w, map[string]string{"error": "unknown driver"})
				return
			}
		}
		writeJSON(w, map[string]any{"drivers": driversCopy()})
	})
}
