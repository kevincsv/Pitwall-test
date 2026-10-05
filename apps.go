package main

// App launcher: finds your sim-racing programs (iRacing, Steam, CrewChief,
// Garage 61, TrackImpulse, SimHub, MOZA Pit House…) and starts the ones you
// pick when Pitlane HQ opens or when iRacing starts.
//
// Safety: the app never accepts a program path from the network. Paths come
// only from this PC's Start menu, known install folders, or a file dialog
// shown on this PC, so a phone on your Wi-Fi can start only programs you
// added yourself.

import (
	"crypto/sha1"
	"encoding/hex"
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

type appEntry struct {
	ID     string `json:"id"`
	Name   string `json:"name,omitempty"`
	Path   string `json:"path,omitempty"`
	Args   string `json:"args,omitempty"`
	When   string `json:"when"` // "pitwall", "sim" or "" (only by hand)
	Min    bool   `json:"min"`  // start minimised
	Custom bool   `json:"custom,omitempty"`
}

type catalogApp struct {
	ID      string
	Name    string
	Procs   []string // process names, lower case
	Paths   []string // likely install paths, %VAR% expanded
	Match   *regexp.Regexp
	Args    string
	MinArgs string // extra arguments to start minimised
	What    [2]string
}

var appCatalog = []catalogApp{
	{ID: "iracing", Name: "iRacing", Procs: []string{"iracingui.exe"},
		Paths: []string{`%ProgramFiles(x86)%\iRacing\ui\iRacingUI.exe`, `%ProgramFiles%\iRacing\ui\iRacingUI.exe`, `C:\iRacing\ui\iRacingUI.exe`},
		Match: regexp.MustCompile(`(?i)^iracing(\s*(ui|launcher|\.com.*|member site))?$`), What: [2]string{"The iRacing app", "La app de iRacing"}},
	{ID: "steam", Name: "Steam", Procs: []string{"steam.exe"},
		Paths: []string{`%ProgramFiles(x86)%\Steam\steam.exe`, `%ProgramFiles%\Steam\steam.exe`},
		Match: regexp.MustCompile(`(?i)^steam$`), MinArgs: "-silent", What: [2]string{"Games and iRacing on Steam", "Juegos e iRacing en Steam"}},
	{ID: "crewchief", Name: "Crew Chief", Procs: []string{"crewchiefv4.exe"},
		Paths: []string{`%ProgramFiles(x86)%\Britton IT Ltd\CrewChiefV4\CrewChiefV4.exe`, `%ProgramFiles%\Britton IT Ltd\CrewChiefV4\CrewChiefV4.exe`},
		Match: regexp.MustCompile(`(?i)crew\s*chief`), What: [2]string{"Spotter and race engineer voice", "Spotter e ingeniero por voz"}},
	{ID: "garage61", Name: "Garage 61", Procs: []string{"garage61-launcher.exe", "garage61-agent.exe", "garage61.exe", "garage 61 telemetry agent.exe", "garage61agent.exe"},
		Paths: []string{`%LOCALAPPDATA%\Programs\garage61\garage61-launcher.exe`, `%LOCALAPPDATA%\garage61\garage61-launcher.exe`, `%ProgramFiles%\Garage 61\garage61-launcher.exe`},
		Match: regexp.MustCompile(`(?i)garage\s*61`), What: [2]string{"Telemetry agent that uploads your laps", "Agente que sube tus vueltas"}},
	{ID: "trackimpulse", Name: "TrackImpulse", Procs: []string{"trackimpulse.exe", "track impulse.exe", "trackimpulseoverlay.exe"},
		Paths: []string{`%LOCALAPPDATA%\Programs\TrackImpulse\TrackImpulse.exe`, `%ProgramFiles%\TrackImpulse\TrackImpulse.exe`, `%LOCALAPPDATA%\TrackImpulse\TrackImpulse.exe`},
		Match: regexp.MustCompile(`(?i)track\s*impulse`), What: [2]string{"Overlays", "Overlays"}},
	{ID: "simhub", Name: "SimHub", Procs: []string{"simhubwpf.exe"},
		Paths: []string{`%ProgramFiles(x86)%\SimHub\SimHubWPF.exe`, `%ProgramFiles%\SimHub\SimHubWPF.exe`},
		Match: regexp.MustCompile(`(?i)^simhub$`), MinArgs: "-minimize", What: [2]string{"Dashboards and LEDs", "Dashboards y LEDs"}},
	{ID: "pithouse", Name: "MOZA Pit House", Procs: []string{"moza pit house.exe"},
		Paths: []string{`%ProgramFiles(x86)%\MOZA Pit House\MOZA Pit House.exe`, `%ProgramFiles%\MOZA Pit House\MOZA Pit House.exe`},
		Match: regexp.MustCompile(`(?i)pit\s*house`), What: [2]string{"MOZA settings and firmware", "Ajustes y firmware de MOZA"}},
	{ID: "racelab", Name: "RaceLab", Procs: []string{"racelabapps.exe", "racelab.exe"},
		Paths: []string{`%LOCALAPPDATA%\racelabapps\RacelabApps.exe`, `%LOCALAPPDATA%\racelab\RaceLab.exe`},
		Match: regexp.MustCompile(`(?i)^race\s*lab`), What: [2]string{"Overlays", "Overlays"}},
	{ID: "coachdave", Name: "Coach Dave Delta", Procs: []string{"coach dave delta.exe"},
		Paths: []string{`%LOCALAPPDATA%\CoachDaveDelta\Coach Dave Delta.exe`},
		Match: regexp.MustCompile(`(?i)coach\s*dave`), What: [2]string{"Setups and coaching", "Setups y coaching"}},
	{ID: "tracktitan", Name: "Track Titan", Procs: []string{"track titan desktop application.exe", "track titan.exe"},
		Paths: []string{`%LOCALAPPDATA%\Programs\track-titan-desktop-application\Track Titan Desktop Application.exe`},
		Match: regexp.MustCompile(`(?i)track\s*titan`), What: [2]string{"Coaching from your laps", "Coaching con tus vueltas"}},
	{ID: "vrs", Name: "VRS Telemetry", Procs: []string{"vrs-telemetrylogger.exe"},
		Paths: []string{`%USERPROFILE%\VirtualRacingSchool\VRS-TelemetryLogger.exe`},
		Match: regexp.MustCompile(`(?i)virtual\s*racing\s*school|vrs.*telemetry`), What: [2]string{"Virtual Racing School logger", "Registro de Virtual Racing School"}},
	{ID: "ioverlay", Name: "iOverlay", Procs: []string{"ioverlay.exe"},
		Paths: []string{`%ProgramFiles%\iOverlay\iOverlay.exe`, `%LOCALAPPDATA%\Programs\iOverlay\iOverlay.exe`},
		Match: regexp.MustCompile(`(?i)^ioverlay`), What: [2]string{"Overlays", "Overlays"}},
	{ID: "kapps", Name: "Kapps", Procs: []string{"kapps.exe"},
		Paths: []string{`%LOCALAPPDATA%\kapps\Kapps.exe`},
		Match: regexp.MustCompile(`(?i)^kapps`), What: [2]string{"Overlays", "Overlays"}},
	{ID: "discord", Name: "Discord", Procs: []string{"discord.exe"},
		Paths: []string{`%LOCALAPPDATA%\Discord\Update.exe`}, Args: "--processStart Discord.exe",
		Match: regexp.MustCompile(`(?i)^discord$`), What: [2]string{"Voice chat with your team", "Chat de voz con tu equipo"}},
	{ID: "obs", Name: "OBS Studio", Procs: []string{"obs64.exe"},
		Paths: []string{`%ProgramFiles%\obs-studio\bin\64bit\obs64.exe`},
		Match: regexp.MustCompile(`(?i)^obs\s*studio`), MinArgs: "--minimize-to-tray", What: [2]string{"Streaming and recording", "Streaming y grabación"}},
}

func catalogByID(id string) (catalogApp, bool) {
	for _, c := range appCatalog {
		if c.ID == id {
			return c, true
		}
	}
	return catalogApp{}, false
}

func cleanWhen(w string) string {
	if w == "pitwall" || w == "sim" {
		return w
	}
	return ""
}

var envRe = regexp.MustCompile(`%([A-Za-z0-9_()]+)%`)

// expandPath replaces %VAR% with environment values.
func expandPath(p string) string {
	return envRe.ReplaceAllStringFunc(p, func(m string) string {
		v := os.Getenv(strings.Trim(m, "%"))
		if v == "" {
			return m
		}
		return v
	})
}

func fileExists(p string) bool {
	st, err := os.Stat(p)
	return err == nil && !st.IsDir()
}

// shortcut is a Start menu entry found on this PC.
type shortcut struct {
	Key    string `json:"key"`
	Name   string `json:"name"`
	Path   string `json:"-"`
	Target string `json:"-"`
}

var (
	scanMu    sync.Mutex
	scanCache []shortcut
	scanAt    time.Time
)

func shortcutKey(p string) string {
	h := sha1.Sum([]byte(strings.ToLower(p)))
	return hex.EncodeToString(h[:6])
}

// shortcuts lists the Start menu (cached for a minute).
func shortcuts() []shortcut {
	scanMu.Lock()
	defer scanMu.Unlock()
	if scanCache != nil && time.Since(scanAt) < time.Minute {
		return scanCache
	}
	scanCache = scanStartMenu()
	scanAt = time.Now()
	return scanCache
}

func shortcutByKey(k string) (shortcut, bool) {
	for _, s := range shortcuts() {
		if s.Key == k {
			return s, true
		}
	}
	return shortcut{}, false
}

// detectCatalogApp looks for a known program on this PC.
func detectCatalogApp(c catalogApp) (appEntry, bool) {
	e := appEntry{ID: c.ID, Name: c.Name, Args: c.Args}
	for _, p := range c.Paths {
		if x := expandPath(p); fileExists(x) {
			e.Path = x
			return e, true
		}
	}
	for _, s := range shortcuts() {
		if c.Match.MatchString(s.Name) {
			e.Path = s.Path
			return e, true
		}
	}
	if x := findInstalled(c.Match); x != "" {
		e.Path = x
		return e, true
	}
	return e, false
}

// procNames are the process names that mean the app is already running.
func procNames(a appEntry) []string {
	if c, ok := catalogByID(a.ID); ok {
		return c.Procs
	}
	t := a.Path
	if strings.EqualFold(filepath.Ext(t), ".lnk") {
		t = lnkTarget(t)
	}
	if strings.EqualFold(filepath.Ext(t), ".exe") {
		return []string{strings.ToLower(filepath.Base(t))}
	}
	return nil
}

func isAppRunning(a appEntry, running map[string]bool) bool {
	for _, p := range procNames(a) {
		if running[p] {
			return true
		}
	}
	return false
}

// ---------- the profile's app list ----------

var (
	appsMu sync.Mutex
	apps   []appEntry
)

func appsPath(id string) string { return filepath.Join(profileDir(id), "apps.json") }

func readAppsFile(id string) []appEntry {
	var out struct {
		Apps []appEntry `json:"apps"`
	}
	if b, err := os.ReadFile(appsPath(id)); err == nil {
		json.Unmarshal(b, &out)
	}
	return out.Apps
}

func writeAppsFile(id string, list []appEntry) {
	if list == nil {
		list = []appEntry{}
	}
	b, _ := json.MarshalIndent(map[string]any{"apps": list}, "", "  ")
	os.MkdirAll(profileDir(id), 0o700)
	os.WriteFile(appsPath(id), b, 0o600)
}

func loadApps() {
	appsMu.Lock()
	defer appsMu.Unlock()
	apps = readAppsFile(activeID())
}

func saveAppsLocked() { writeAppsFile(activeID(), apps) }

func appIndexLocked(id string) int {
	for i, a := range apps {
		if a.ID == id {
			return i
		}
	}
	return -1
}

var errNotWindows = errors.New("programs can only be started on Windows")

// launchApp starts one program unless it is already running.
func launchApp(a appEntry, force bool) (string, error) {
	if a.Path == "" {
		return "", errors.New("program not found on this PC")
	}
	if !force && isAppRunning(a, runningProcs()) {
		return "running", nil
	}
	args := a.Args
	if a.Min {
		if c, ok := catalogByID(a.ID); ok && c.MinArgs != "" {
			args = strings.TrimSpace(args + " " + c.MinArgs)
		}
	}
	if err := shellOpen(a.Path, args, a.Min); err != nil {
		return "", err
	}
	log.Println("Started", a.Name)
	return "started", nil
}

// launchGroup starts every app set to start at that moment, one by one.
func launchGroup(when string) {
	appsMu.Lock()
	list := append([]appEntry{}, apps...)
	appsMu.Unlock()
	running := runningProcs()
	for _, a := range list {
		if (when != "*" && a.When != when) || isAppRunning(a, running) {
			continue
		}
		if _, err := launchApp(a, true); err != nil {
			log.Println("Could not start", a.Name+":", err)
			continue
		}
		time.Sleep(1500 * time.Millisecond)
	}
}

// appsOnSim starts the "when iRacing starts" apps each time iRacing opens.
func appsOnSim() {
	was := false
	for range time.Tick(2 * time.Second) {
		st := currentStatus()
		on := st.connected() && !st.Demo
		if on && !was {
			go launchGroup("sim")
		}
		was = on
	}
}

func registerAppRoutes(mux *http.ServeMux) {
	mux.HandleFunc("/api/apps", func(w http.ResponseWriter, r *http.Request) {
		running := runningProcs()
		appsMu.Lock()
		list := append([]appEntry{}, apps...)
		appsMu.Unlock()
		added := map[string]bool{}
		type row struct {
			appEntry
			Running bool   `json:"running"`
			Found   bool   `json:"found"`
			File    string `json:"file"`
		}
		out := []row{}
		for _, a := range list {
			added[a.ID] = true
			out = append(out, row{a, isAppRunning(a, running), fileExists(a.Path), filepath.Base(a.Path)})
		}
		var found []map[string]any
		for _, c := range appCatalog {
			if added[c.ID] {
				continue
			}
			if e, ok := detectCatalogApp(c); ok {
				found = append(found, map[string]any{"id": c.ID, "name": c.Name, "what": c.What, "running": isAppRunning(e, running)})
			}
		}
		var missing []map[string]any
		for _, c := range appCatalog {
			if added[c.ID] {
				continue
			}
			if _, ok := detectCatalogApp(c); !ok {
				missing = append(missing, map[string]any{"id": c.ID, "name": c.Name, "what": c.What})
			}
		}
		for i := range out {
			if c, ok := catalogByID(out[i].ID); ok {
				out[i].Name = c.Name
			}
		}
		writeJSON(w, map[string]any{"apps": out, "found": found, "missing": missing, "windows": appsSupported})
	})

	mux.HandleFunc("/api/apps/shortcuts", func(w http.ResponseWriter, r *http.Request) {
		list := append([]shortcut{}, shortcuts()...)
		sort.Slice(list, func(i, j int) bool { return strings.ToLower(list[i].Name) < strings.ToLower(list[j].Name) })
		writeJSON(w, list)
	})

	mux.HandleFunc("/api/apps/do", func(w http.ResponseWriter, r *http.Request) {
		if r.Method != http.MethodPost {
			http.Error(w, "POST only", 405)
			return
		}
		var in struct {
			Action string   `json:"action"`
			ID     string   `json:"id"`
			Key    string   `json:"key"`
			When   string   `json:"when"`
			Min    bool     `json:"min"`
			Order  []string `json:"order"`
		}
		if err := json.NewDecoder(io.LimitReader(r.Body, 1<<14)).Decode(&in); err != nil {
			http.Error(w, "bad request", 400)
			return
		}
		fail := func(err error) {
			w.WriteHeader(400)
			writeJSON(w, map[string]string{"error": err.Error()})
		}
		switch in.Action {
		case "add": // a known program found on this PC
			c, ok := catalogByID(in.ID)
			if !ok {
				fail(errors.New("unknown program"))
				return
			}
			e, found := detectCatalogApp(c)
			if !found {
				fail(errors.New("not installed on this PC"))
				return
			}
			e.When = "pitwall"
			appsMu.Lock()
			if appIndexLocked(e.ID) < 0 {
				apps = append(apps, e)
				saveAppsLocked()
			}
			appsMu.Unlock()
		case "addShortcut": // anything else from the Start menu
			s, ok := shortcutByKey(in.Key)
			if !ok {
				fail(errors.New("shortcut not found"))
				return
			}
			e := appEntry{ID: "c" + s.Key, Name: s.Name, Path: s.Path, When: "pitwall", Custom: true}
			appsMu.Lock()
			if appIndexLocked(e.ID) < 0 {
				apps = append(apps, e)
				saveAppsLocked()
			}
			appsMu.Unlock()
		case "browse": // pick a program with a window on this PC
			p, err := pickProgram()
			if err != nil {
				fail(err)
				return
			}
			if p == "" {
				writeJSON(w, map[string]string{"result": "cancelled"})
				return
			}
			name := strings.TrimSuffix(filepath.Base(p), filepath.Ext(p))
			e := appEntry{ID: "c" + shortcutKey(p), Name: name, Path: p, When: "pitwall", Custom: true}
			appsMu.Lock()
			if appIndexLocked(e.ID) < 0 {
				apps = append(apps, e)
				saveAppsLocked()
			}
			appsMu.Unlock()
		case "set":
			appsMu.Lock()
			if i := appIndexLocked(in.ID); i >= 0 {
				apps[i].When, apps[i].Min = cleanWhen(in.When), in.Min
				saveAppsLocked()
			}
			appsMu.Unlock()
		case "remove":
			appsMu.Lock()
			if i := appIndexLocked(in.ID); i >= 0 {
				apps = append(apps[:i], apps[i+1:]...)
				saveAppsLocked()
			}
			appsMu.Unlock()
		case "order":
			appsMu.Lock()
			pos := map[string]int{}
			for i, id := range in.Order {
				pos[id] = i
			}
			sort.SliceStable(apps, func(i, j int) bool {
				pi, oi := pos[apps[i].ID]
				pj, oj := pos[apps[j].ID]
				if !oi {
					pi = 1 << 20
				}
				if !oj {
					pj = 1 << 20
				}
				return pi < pj
			})
			saveAppsLocked()
			appsMu.Unlock()
		case "launch":
			appsMu.Lock()
			i := appIndexLocked(in.ID)
			var a appEntry
			if i >= 0 {
				a = apps[i]
			}
			appsMu.Unlock()
			if i < 0 {
				// a detected program not added yet
				if c, ok := catalogByID(in.ID); ok {
					if e, found := detectCatalogApp(c); found {
						a, i = e, 0
					}
				}
			}
			if i < 0 {
				fail(errors.New("unknown program"))
				return
			}
			res, err := launchApp(a, false)
			if err != nil {
				fail(err)
				return
			}
			writeJSON(w, map[string]string{"result": res})
			return
		case "launchAll":
			go launchGroup("*")
		default:
			fail(errors.New("unknown action"))
			return
		}
		writeJSON(w, map[string]string{"result": "ok"})
	})
}
