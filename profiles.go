package main

// Profiles: each person who uses Pitlane HQ on this PC gets their own settings,
// overlay layout, Live layout, favourite series, apps to start, iRacing and
// Garage 61 sign-ins. Everything stays on this PC under
// %APPDATA%\PitlaneHQ\profiles\<id>\ — nothing goes to any cloud.

import (
	"crypto/rand"
	"encoding/hex"
	"encoding/json"
	"errors"
	"fmt"
	"io"
	"log"
	"net/http"
	"os"
	"os/user"
	"path/filepath"
	"regexp"
	"strings"
	"sync"
	"sync/atomic"
	"time"
)

type profileMeta struct {
	ID      string    `json:"id"`
	Name    string    `json:"name"`
	Created time.Time `json:"created"`
}

type profileIndex struct {
	Active string        `json:"active"`
	List   []profileMeta `json:"list"`
}

var (
	profMu       sync.Mutex
	profs        profileIndex
	profileEpoch atomic.Int64 // changes on every switch
	profileIDRe  = regexp.MustCompile(`^p[0-9a-f]{1,16}$`)
	localKeyRe   = regexp.MustCompile(`^pw\.[A-Za-z0-9_.-]{1,48}$`)
)

func dataDir() string {
	dir, err := os.UserConfigDir()
	if err != nil {
		dir = "."
	}
	return filepath.Join(dir, "PitlaneHQ")
}

// migrateDataDir moves the data of versions called Pit Wall to the new folder.
func migrateDataDir() {
	old := filepath.Join(filepath.Dir(dataDir()), "PitWall")
	if _, err := os.Stat(dataDir()); err == nil {
		return
	}
	if _, err := os.Stat(old); err == nil {
		if err := os.Rename(old, dataDir()); err != nil {
			log.Println("Could not move your Pit Wall data:", err)
		}
	}
}

func profileDir(id string) string { return filepath.Join(dataDir(), "profiles", id) }

func activeID() string {
	profMu.Lock()
	defer profMu.Unlock()
	return profs.Active
}

func activeDir() string { return profileDir(activeID()) }

func activeName() string {
	profMu.Lock()
	defer profMu.Unlock()
	for _, p := range profs.List {
		if p.ID == profs.Active {
			return p.Name
		}
	}
	return ""
}

func saveProfilesLocked() {
	os.MkdirAll(dataDir(), 0o700)
	b, _ := json.MarshalIndent(profs, "", "  ")
	if err := os.WriteFile(filepath.Join(dataDir(), "profiles.json"), b, 0o600); err != nil {
		log.Println("Could not save profiles:", err)
	}
}

func findProfileLocked(id string) int {
	for i, p := range profs.List {
		if p.ID == id {
			return i
		}
	}
	return -1
}

func defaultProfileName() string {
	if u, err := user.Current(); err == nil {
		n := u.Username
		if i := strings.LastIndexAny(n, `\/`); i >= 0 {
			n = n[i+1:]
		}
		if n = strings.TrimSpace(n); n != "" && len(n) <= 40 {
			return n
		}
	}
	return "Driver 1"
}

// initProfiles loads the profile list. The first time, the files from older
// versions (settings, sign-ins) move into the first profile.
func initProfiles() {
	migrateDataDir()
	profMu.Lock()
	defer profMu.Unlock()
	if b, err := os.ReadFile(filepath.Join(dataDir(), "profiles.json")); err == nil {
		if json.Unmarshal(b, &profs) == nil && len(profs.List) > 0 {
			if findProfileLocked(profs.Active) < 0 {
				profs.Active = profs.List[0].ID
			}
			return
		}
	}
	profs = profileIndex{Active: "p1", List: []profileMeta{{ID: "p1", Name: defaultProfileName(), Created: time.Now()}}}
	os.MkdirAll(profileDir("p1"), 0o700)
	for _, f := range []string{"settings.json", "account.json", "garage61.json"} {
		old := filepath.Join(dataDir(), f)
		if _, err := os.Stat(old); err == nil {
			if err := os.Rename(old, filepath.Join(profileDir("p1"), f)); err != nil {
				log.Println("Could not move", f, "into your profile:", err)
			}
		}
	}
	saveProfilesLocked()
}

// loadProfileState reads everything that belongs to the active profile.
func loadProfileState() {
	loadSettings()
	loadConfig()
	loadG61()
	loadApps()
	loadHaptics()
	loadCloud()
	loadSetups()
	loadCars()
}

func switchProfile(id string) error {
	profMu.Lock()
	if findProfileLocked(id) < 0 {
		profMu.Unlock()
		return errors.New("unknown profile")
	}
	same := profs.Active == id
	profs.Active = id
	saveProfilesLocked()
	profMu.Unlock()
	if same {
		return nil
	}
	closeOverlays("*")
	loadProfileState()
	profileEpoch.Add(1)
	log.Println("Profile:", activeName())
	return nil
}

func newProfileID() string {
	b := make([]byte, 4)
	rand.Read(b)
	return "p" + hex.EncodeToString(b)
}

func cleanName(n string) string {
	n = strings.TrimSpace(strings.Map(func(r rune) rune {
		if r < 32 {
			return -1
		}
		return r
	}, n))
	if len([]rune(n)) > 40 {
		n = string([]rune(n)[:40])
	}
	return n
}

func uniqueNameLocked(n string) string {
	if n == "" {
		n = "Driver"
	}
	taken := map[string]bool{}
	for _, p := range profs.List {
		taken[strings.ToLower(p.Name)] = true
	}
	if !taken[strings.ToLower(n)] {
		return n
	}
	for i := 2; ; i++ {
		c := fmt.Sprintf("%s %d", n, i)
		if !taken[strings.ToLower(c)] {
			return c
		}
	}
}

// profile files that can be copied or exported (never the sign-ins)
var shareableFiles = []string{"settings.json", "local.json", "apps.json", "haptics.json", "setups.json", "carprofiles.json"}

func createProfile(name, copyFrom string) (profileMeta, error) {
	profMu.Lock()
	defer profMu.Unlock()
	if len(profs.List) >= 20 {
		return profileMeta{}, errors.New("too many profiles")
	}
	p := profileMeta{ID: newProfileID(), Name: uniqueNameLocked(cleanName(name)), Created: time.Now()}
	os.MkdirAll(profileDir(p.ID), 0o700)
	if copyFrom != "" && findProfileLocked(copyFrom) >= 0 {
		for _, f := range shareableFiles {
			if b, err := os.ReadFile(filepath.Join(profileDir(copyFrom), f)); err == nil {
				os.WriteFile(filepath.Join(profileDir(p.ID), f), b, 0o600)
			}
		}
	}
	profs.List = append(profs.List, p)
	saveProfilesLocked()
	return p, nil
}

func readLocal(id string) map[string]json.RawMessage {
	out := map[string]json.RawMessage{}
	if b, err := os.ReadFile(filepath.Join(profileDir(id), "local.json")); err == nil {
		json.Unmarshal(b, &out)
	}
	return out
}

var localMu sync.Mutex

// exported profile file: settings and layouts only, never sign-ins
type profileFile struct {
	Kind     string                     `json:"kind"`
	Version  int                        `json:"version"`
	Name     string                     `json:"name"`
	Settings json.RawMessage            `json:"settings,omitempty"`
	Local    map[string]json.RawMessage `json:"local,omitempty"`
	Apps     []appEntry                 `json:"apps,omitempty"`
}

func registerProfileRoutes(mux *http.ServeMux) {
	mux.HandleFunc("/api/profiles", func(w http.ResponseWriter, r *http.Request) {
		if r.Method == http.MethodPost {
			q := r.URL.Query()
			var in struct {
				Name     string `json:"name"`
				CopyFrom string `json:"copyFrom"`
			}
			json.NewDecoder(io.LimitReader(r.Body, 4096)).Decode(&in)
			id := q.Get("id")
			switch q.Get("action") {
			case "switch":
				if err := switchProfile(id); err != nil {
					http.Error(w, err.Error(), 400)
					return
				}
			case "create":
				p, err := createProfile(in.Name, in.CopyFrom)
				if err != nil {
					http.Error(w, err.Error(), 400)
					return
				}
				if q.Get("switch") == "1" {
					switchProfile(p.ID)
				}
			case "rename":
				profMu.Lock()
				if i := findProfileLocked(id); i >= 0 {
					if n := cleanName(in.Name); n != "" && !strings.EqualFold(n, profs.List[i].Name) {
						profs.List[i].Name = uniqueNameLocked(n)
					}
					saveProfilesLocked()
				}
				profMu.Unlock()
				bumpConfig()
			case "delete":
				profMu.Lock()
				i := findProfileLocked(id)
				if i < 0 || len(profs.List) < 2 {
					profMu.Unlock()
					http.Error(w, "keep at least one profile", 400)
					return
				}
				profs.List = append(profs.List[:i], profs.List[i+1:]...)
				wasActive := profs.Active == id
				next := profs.List[0].ID
				saveProfilesLocked()
				profMu.Unlock()
				if wasActive {
					switchProfile(next)
				}
				if profileIDRe.MatchString(id) {
					os.RemoveAll(profileDir(id))
				}
			default:
				http.Error(w, "unknown action", 400)
				return
			}
		}
		profMu.Lock()
		out := profs
		out.List = append([]profileMeta{}, profs.List...)
		profMu.Unlock()
		writeJSON(w, out)
	})

	// Browser-side state of the active profile (Live layout, favourites…)
	mux.HandleFunc("/api/profile/local", func(w http.ResponseWriter, r *http.Request) {
		localMu.Lock()
		defer localMu.Unlock()
		id := activeID()
		cur := readLocal(id)
		if r.Method == http.MethodPost {
			var in map[string]json.RawMessage
			if err := json.NewDecoder(io.LimitReader(r.Body, 1<<20)).Decode(&in); err != nil {
				http.Error(w, "bad data", 400)
				return
			}
			for k, v := range in {
				if !localKeyRe.MatchString(k) {
					continue
				}
				if string(v) == "null" {
					delete(cur, k)
				} else {
					cur[k] = v
				}
			}
			b, _ := json.Marshal(cur)
			if len(b) > 2<<20 {
				http.Error(w, "too much data", 413)
				return
			}
			os.MkdirAll(profileDir(id), 0o700)
			os.WriteFile(filepath.Join(profileDir(id), "local.json"), b, 0o600)
		}
		writeJSON(w, map[string]any{"profile": id, "local": cur})
	})

	mux.HandleFunc("/api/profile/export", func(w http.ResponseWriter, r *http.Request) {
		id := r.URL.Query().Get("id")
		profMu.Lock()
		i := findProfileLocked(id)
		var name string
		if i >= 0 {
			name = profs.List[i].Name
		}
		profMu.Unlock()
		if i < 0 {
			http.Error(w, "unknown profile", 404)
			return
		}
		pf := profileFile{Kind: "pitwall-profile", Version: 1, Name: name, Local: readLocal(id)}
		if b, err := os.ReadFile(filepath.Join(profileDir(id), "settings.json")); err == nil {
			pf.Settings = b
		}
		for _, a := range readAppsFile(id) {
			if !a.Custom { // custom apps point at files on this PC only
				pf.Apps = append(pf.Apps, appEntry{ID: a.ID, When: a.When, Min: a.Min})
			}
		}
		fn := strings.Map(func(r rune) rune {
			if strings.ContainsRune(`<>:"/\|?*`, r) || r < 32 {
				return '_'
			}
			return r
		}, name)
		w.Header().Set("Content-Disposition", fmt.Sprintf(`attachment; filename="Pitlane HQ profile - %s.json"`, fn))
		writeJSON(w, pf)
	})

	mux.HandleFunc("/api/profile/import", func(w http.ResponseWriter, r *http.Request) {
		if r.Method != http.MethodPost {
			http.Error(w, "POST only", 405)
			return
		}
		var pf profileFile
		if err := json.NewDecoder(io.LimitReader(r.Body, 4<<20)).Decode(&pf); err != nil || pf.Kind != "pitwall-profile" {
			http.Error(w, "this is not a Pitlane HQ profile file", 400)
			return
		}
		p, err := createProfile(pf.Name, "")
		if err != nil {
			http.Error(w, err.Error(), 400)
			return
		}
		dir := profileDir(p.ID)
		if len(pf.Settings) > 0 {
			var c Config
			if json.Unmarshal(pf.Settings, &c) == nil {
				b, _ := json.MarshalIndent(c, "", "  ")
				os.WriteFile(filepath.Join(dir, "settings.json"), b, 0o600)
			}
		}
		loc := map[string]json.RawMessage{}
		for k, v := range pf.Local {
			if localKeyRe.MatchString(k) {
				loc[k] = v
			}
		}
		if b, _ := json.Marshal(loc); len(b) < 2<<20 {
			os.WriteFile(filepath.Join(dir, "local.json"), b, 0o600)
		}
		// apps: only known programs, found again on this PC
		var apps []appEntry
		for _, a := range pf.Apps {
			if c, ok := catalogByID(a.ID); ok {
				if e, found := detectCatalogApp(c); found {
					e.When, e.Min = cleanWhen(a.When), a.Min
					apps = append(apps, e)
				}
			}
		}
		writeAppsFile(p.ID, apps)
		writeJSON(w, p)
	})
}

// bumpConfig makes every screen re-read the settings (e.g. profile renamed).
func bumpConfig() {
	cfgMu.Lock()
	cfgVer++
	cfgMu.Unlock()
}
