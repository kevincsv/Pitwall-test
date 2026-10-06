package main

// Settings shared by every screen and overlay window, stored on the PC so the
// overlays (which run in their own windows) and phones all see the same ones.

import (
	"encoding/json"
	"io"
	"log"
	"net/http"
	"os"
	"path/filepath"
	"sync"
	"time"
)

type Config struct {
	AutoStart        bool              `json:"autoStart"`
	AutoWidgets      []string          `json:"autoWidgets"`
	CloseOnExit      bool              `json:"closeOnExit"`
	Engine           string            `json:"engine"` // "webview" (frameless) or "edge"
	Edit             bool              `json:"edit"`
	Alpha            int               `json:"alpha"`
	Lock             bool              `json:"lock"`
	Scale            float64           `json:"scale"`
	StartWithWindows bool              `json:"startWithWindows"`
	Positions        map[string][4]int `json:"positions"`
	UI               map[string]any    `json:"ui"`
	Game             string            `json:"game"` // "auto" (default), "iracing" or "lmu"
}

func defaultConfig() Config {
	return Config{CloseOnExit: true, Engine: "webview", Alpha: 255, Scale: 1, Positions: map[string][4]int{}, UI: map[string]any{}}
}

var (
	cfgMu  sync.Mutex
	cfg    = defaultConfig()
	cfgVer = 1
)

func cfgPath() string { return filepath.Join(activeDir(), "settings.json") }

// loadSettings reads the settings of the active profile (defaults if none).
func loadSettings() {
	cfgMu.Lock()
	defer cfgMu.Unlock()
	cfg = defaultConfig()
	cfgVer++
	b, err := os.ReadFile(cfgPath())
	if err != nil {
		return
	}
	json.Unmarshal(b, &cfg)
	if cfg.Positions == nil {
		cfg.Positions = map[string][4]int{}
	}
	if cfg.UI == nil {
		cfg.UI = map[string]any{}
	}
	if cfg.Engine == "" {
		cfg.Engine = "webview"
	}
	if cfg.Alpha == 0 {
		cfg.Alpha = 255
	}
	if cfg.Scale == 0 {
		cfg.Scale = 1
	}
}

// saveSettingsLocked writes the file; caller holds cfgMu.
func saveSettingsLocked() {
	p := cfgPath()
	os.MkdirAll(filepath.Dir(p), 0o755)
	b, _ := json.MarshalIndent(cfg, "", "  ")
	if err := os.WriteFile(p, b, 0o644); err != nil {
		log.Println("Could not save settings:", err)
	}
	cfgVer++
}

func settingsSnapshot() (Config, int) {
	cfgMu.Lock()
	defer cfgMu.Unlock()
	c := cfg
	c.Positions = map[string][4]int{}
	for k, v := range cfg.Positions {
		c.Positions[k] = v
	}
	return c, cfgVer
}

func registerConfigRoutes(mux *http.ServeMux) {
	mux.HandleFunc("/api/config", func(w http.ResponseWriter, r *http.Request) {
		if r.Method == http.MethodPost {
			b, err := io.ReadAll(io.LimitReader(r.Body, 1<<20))
			if err != nil {
				http.Error(w, err.Error(), 400)
				return
			}
			var in Config
			if err := json.Unmarshal(b, &in); err != nil {
				http.Error(w, "bad settings", 400)
				return
			}
			cfgMu.Lock()
			startChanged := in.StartWithWindows != cfg.StartWithWindows
			in.Positions = cfg.Positions // window positions are owned by PitWall
			if in.Engine != "edge" {
				in.Engine = "webview"
			}
			if in.Alpha < 40 || in.Alpha > 255 {
				in.Alpha = 255
			}
			if in.Scale < 0.5 || in.Scale > 2 {
				in.Scale = 1
			}
			if in.UI == nil {
				in.UI = map[string]any{}
			}
			cfg = in
			saveSettingsLocked()
			c := cfg
			cfgMu.Unlock()
			if startChanged {
				if err := setStartWithWindows(c.StartWithWindows); err != nil {
					log.Println("Start with Windows:", err)
				}
			}
			setOverlays(overlayReq{Widget: "*", Alpha: c.Alpha, Top: true, Lock: c.Lock && !c.Edit})
		}
		c, v := settingsSnapshot()
		writeJSON(w, map[string]any{"config": c, "version": v})
	})
}

// autoOverlays opens the chosen overlays when you get in the car and closes
// them when iRacing closes.
func autoOverlays() {
	opened := false
	var lostAt time.Time
	epoch := profileEpoch.Load()
	for range time.Tick(time.Second) {
		if e := profileEpoch.Load(); e != epoch { // another profile: open its overlays
			epoch, opened = e, false
		}
		st := currentStatus()
		c, _ := settingsSnapshot()
		inCar, _ := telBool("IsOnTrack")
		if st.connected() && inCar && !opened && c.AutoStart && len(c.AutoWidgets) > 0 && !st.Demo {
			open := map[string]bool{}
			for _, n := range listOverlays() {
				open[n] = true
			}
			for _, wdg := range c.AutoWidgets {
				if !open[wdg] && widgetRe.MatchString(wdg) && wdg != "*" {
					openNamedOverlay(wdg)
					time.Sleep(300 * time.Millisecond)
				}
			}
			opened = true
			log.Println("Opened your overlays")
		}
		if st.connected() {
			lostAt = time.Time{}
		} else if opened {
			if lostAt.IsZero() {
				lostAt = time.Now()
			} else if time.Since(lostAt) > 8*time.Second {
				if c.CloseOnExit {
					closeOverlays("*")
					log.Println("iRacing closed: overlays closed")
				}
				opened = false
			}
		}
	}
}

func (s statusMsg) connected() bool { return s.Connected && s.Source != "" }

// telBool reads one boolean telemetry value from the newest frame.
func telBool(name string) (bool, bool) {
	tel.mu.RLock()
	defer tel.mu.RUnlock()
	i, ok := tel.index[name]
	if !ok || len(tel.buf) == 0 {
		return false, false
	}
	v := decodeValues(tel.vars, tel.buf, []int{i})[0]
	b, ok := v.(bool)
	return b, ok
}

// positionKeeper remembers where you leave each overlay window.
func positionKeeper() {
	for range time.Tick(2 * time.Second) {
		rects := overlayRects()
		if len(rects) == 0 {
			continue
		}
		cfgMu.Lock()
		changed := false
		for name, r := range rects {
			if r[2] < 60 || r[3] < 40 || r[0] < -10000 {
				continue
			}
			if cfg.Positions[name] != r {
				cfg.Positions[name] = r
				changed = true
			}
		}
		if changed {
			saveSettingsLocked()
		}
		cfgMu.Unlock()
	}
}
