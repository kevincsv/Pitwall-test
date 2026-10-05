package main

// Per-car rig profiles: when you get in a car, Pitlane HQ applies what you
// saved for it: which overlays open, the haptics settings and SimHub
// actions to run (for example a wheel screen page or a brightness).

import (
	"encoding/json"
	"errors"
	"io"
	"log"
	"net/http"
	"os"
	"path/filepath"
	"regexp"
	"sort"
	"strings"
	"sync"
	"time"
)

type carProfile struct {
	Name     string     `json:"name"`
	Overlays []string   `json:"overlays,omitempty"`
	UseOv    bool       `json:"useOverlays"`
	Haptics  *hapConfig `json:"haptics,omitempty"`
	Actions  []string   `json:"actions,omitempty"`
	Saved    time.Time  `json:"saved"`
}

type carFile struct {
	Profiles map[string]*carProfile `json:"profiles"`
	Seen     map[string]string      `json:"seen"` // car folder → name
}

var (
	carsMu     sync.Mutex
	cars       = carFile{Profiles: map[string]*carProfile{}, Seen: map[string]string{}}
	carCurrent string
	carApplied string
	carKeyRe   = regexp.MustCompile(`^[A-Za-z0-9 _.\-]{1,80}$`)
)

// generalKey is the profile used for every car that has none of its own.
const generalKey = "*"

func carsPath() string { return filepath.Join(activeDir(), "carprofiles.json") }

func loadCars() {
	c := carFile{}
	if b, err := os.ReadFile(carsPath()); err == nil {
		json.Unmarshal(b, &c)
	}
	if c.Profiles == nil {
		c.Profiles = map[string]*carProfile{}
	}
	if c.Seen == nil {
		c.Seen = map[string]string{}
	}
	carsMu.Lock()
	cars, carApplied = c, ""
	carsMu.Unlock()
}

func saveCarsLocked() {
	b, _ := json.MarshalIndent(cars, "", "  ")
	os.MkdirAll(activeDir(), 0o700)
	os.WriteFile(carsPath(), b, 0o600)
}

// carWatcher applies a car's profile when you get in that car.
func carWatcher() {
	for range time.Tick(2 * time.Second) {
		st := currentStatus()
		if !st.connected() {
			carsMu.Lock()
			carCurrent, carApplied = "", ""
			carsMu.Unlock()
			continue
		}
		key, name, _, _ := currentCarSetup()
		if key == "" {
			continue
		}
		carsMu.Lock()
		carCurrent = key
		if cars.Seen[key] != name {
			cars.Seen[key] = name
			saveCarsLocked()
		}
		p := cars.Profiles[key]
		apply := p != nil && carApplied != key
		if apply {
			carApplied = key
		}
		carsMu.Unlock()
		if apply {
			applyCarProfile(*p)
		}
	}
}

func applyCarProfile(p carProfile) {
	log.Println("Car profile:", p.Name)
	if p.UseOv {
		cfgMu.Lock()
		cfg.AutoWidgets = append([]string{}, p.Overlays...)
		saveSettingsLocked()
		cfgMu.Unlock()
		closeOverlays("*")
		profileEpoch.Add(1) // the overlay watcher opens this car's overlays
	}
	if p.Haptics != nil {
		h := *p.Haptics
		cleanHaptics(&h)
		hapMu.Lock()
		restart := h.Mode != hapCfg.Mode || h.Device != hapCfg.Device || h.Channels != hapCfg.Channels
		hapCfg = h
		hapMu.Unlock()
		saveHaptics()
		if restart {
			applyHapticsMode()
		}
	}
	go func() {
		for _, a := range p.Actions {
			if simActionRe.MatchString(a) {
				simhubCmd("-triggeraction", a)
				time.Sleep(400 * time.Millisecond)
			}
		}
	}()
}

func registerCarRoutes(mux *http.ServeMux) {
	mux.HandleFunc("/api/cars", func(w http.ResponseWriter, r *http.Request) {
		if r.Method == http.MethodPost {
			var in struct {
				Action, Key       string
				Keys              []string
				Overlays, Haptics bool
				Actions           []string
			}
			json.NewDecoder(io.LimitReader(r.Body, 1<<16)).Decode(&in)
			var err error
			carsMu.Lock()
			switch in.Action {
			case "save": // current overlays and haptics become this car's
				if !carKeyRe.MatchString(in.Key) && in.Key != generalKey {
					err = errors.New("unknown car")
					break
				}
				p := &carProfile{Name: cars.Seen[in.Key], UseOv: in.Overlays, Saved: time.Now()}
				if in.Key == generalKey {
					p.Name = "General"
				}
				if p.Name == "" {
					p.Name = in.Key
				}
				if in.Overlays {
					c, _ := settingsSnapshot()
					p.Overlays = c.AutoWidgets
				}
				if in.Haptics {
					hapMu.Lock()
					h := hapCfg
					hapMu.Unlock()
					p.Haptics = &h
				}
				for _, a := range in.Actions {
					if a = strings.TrimSpace(a); simActionRe.MatchString(a) && len(p.Actions) < 20 {
						p.Actions = append(p.Actions, a)
					}
				}
				cars.Profiles[in.Key] = p
				saveCarsLocked()
			case "delete":
				delete(cars.Profiles, in.Key)
				saveCarsLocked()
			case "forget", "forgetMany": // remove cars (and their profiles) from the list
				keys := append([]string{in.Key}, in.Keys...)
				for _, k := range keys {
					delete(cars.Profiles, k)
					delete(cars.Seen, k)
				}
				carApplied = ""
				saveCarsLocked()
			case "apply":
				p := cars.Profiles[in.Key]
				if p == nil {
					err = errors.New("no profile for this car")
					break
				}
				cp := *p
				carsMu.Unlock()
				applyCarProfile(cp)
				carsMu.Lock()
			default:
				err = errors.New("unknown action")
			}
			carsMu.Unlock()
			if err != nil {
				w.WriteHeader(400)
				writeJSON(w, map[string]string{"error": err.Error()})
				return
			}
		}
		carsMu.Lock()
		type row struct {
			Key     string      `json:"key"`
			Name    string      `json:"name"`
			Profile *carProfile `json:"profile"`
		}
		var list []row
		for k, n := range cars.Seen {
			list = append(list, row{k, n, cars.Profiles[k]})
		}
		for k, p := range cars.Profiles {
			if _, ok := cars.Seen[k]; !ok && k != generalKey {
				list = append(list, row{k, p.Name, p})
			}
		}
		cur, gen := carCurrent, cars.Profiles[generalKey]
		carsMu.Unlock()
		sort.Slice(list, func(i, j int) bool {
			if (list[i].Key == cur) != (list[j].Key == cur) {
				return list[i].Key == cur
			}
			return strings.ToLower(list[i].Name) < strings.ToLower(list[j].Name)
		})
		writeJSON(w, map[string]any{"current": cur, "cars": list, "general": gen})
	})
}
