package main

import (
	"fmt"
	"net/http"
	"net/url"
	"regexp"
	"strconv"
)

type overlayReq struct {
	Widget        string
	Width, Height int
	X, Y          int
	HasPos        bool
	Alpha         int
	Top, Lock     bool
}

var widgetRe = regexp.MustCompile(`^([a-z]{2,12}|\*)$`)

// Default window sizes for each widget.
var overlaySizes = map[string][2]int{"flag": {520, 90}, "dash": {560, 230}, "timing": {440, 190}, "map": {440, 480}, "relative": {600, 380}, "fuel": {420, 220},
	"engine": {320, 260}, "tyres": {420, 260}, "inputs": {560, 210}, "standings": {720, 640}, "radar": {260, 300}, "boost": {360, 170}, "telemetry": {420, 300}, "compare": {680, 320}, "gg": {280, 300}, "deltabar": {520, 90}, "stats": {420, 220},
	"pit": {440, 260}, "sectors": {560, 150}, "gaps": {560, 260}, "incidents": {380, 300}, "coach": {520, 200}, "brakes": {480, 170}, "radio": {420, 230}}

func itoa(i int) string { return strconv.Itoa(i) }

// Each overlay gets its own loopback address (127.0.0.2, 127.0.0.3, ...). Browsers
// allow only 6 open connections per host, and every overlay keeps one open for
// the live stream, so sharing one address would freeze overlays beyond the sixth.
var overlayOrder = []string{"flag", "dash", "timing", "map", "relative", "compare", "radar", "boost", "inputs", "fuel", "engine", "tyres", "standings", "telemetry", "gg", "deltabar", "stats", "pit", "sectors", "gaps", "incidents", "coach", "brakes", "radio"}

func overlayHost(name string) string {
	for i, n := range overlayOrder {
		if n == name {
			return fmt.Sprintf("127.0.0.%d", 2+i)
		}
	}
	return "127.0.0.250"
}

func overlayURL(name string) string {
	return withTicket(fmt.Sprintf("http://%s:%d/?overlay=%s&win=1", overlayHost(name), listenPort, url.QueryEscape(name)))
}

// openNamedOverlay opens a widget at its saved position, or a default one.
func openNamedOverlay(name string) error {
	c, _ := settingsSnapshot()
	sz, ok := overlaySizes[name]
	if !ok {
		sz = [2]int{460, 260}
	}
	o := overlayReq{Widget: name, Width: int(float64(sz[0]) * c.Scale), Height: int(float64(sz[1]) * c.Scale), Alpha: c.Alpha, Top: true, Lock: c.Lock && !c.Edit}
	if p, ok := c.Positions[name]; ok {
		o.X, o.Y, o.Width, o.Height, o.HasPos = p[0], p[1], p[2], p[3], true
	}
	return openOverlay(o, overlayURL(name), c.Engine)
}

func registerOverlayRoutes(mux *http.ServeMux) {
	post := func(f func(w http.ResponseWriter, r *http.Request)) http.HandlerFunc {
		return func(w http.ResponseWriter, r *http.Request) {
			if r.Method != http.MethodPost {
				http.Error(w, "POST only", 405)
				return
			}
			f(w, r)
		}
	}
	name := func(r *http.Request) (string, bool) {
		n := r.URL.Query().Get("w")
		return n, widgetRe.MatchString(n)
	}
	mux.HandleFunc("/api/overlay/open", post(func(w http.ResponseWriter, r *http.Request) {
		n, ok := name(r)
		if !ok || n == "*" {
			http.Error(w, "bad widget", 400)
			return
		}
		if !wipAllowed() { // overlays are in development: admins only
			http.Error(w, "overlays are in development", 403)
			return
		}
		if err := openNamedOverlay(n); err != nil {
			w.WriteHeader(400)
			writeJSON(w, map[string]string{"error": err.Error()})
			return
		}
		writeJSON(w, map[string]any{"opened": n})
	}))
	mux.HandleFunc("/api/overlay/close", post(func(w http.ResponseWriter, r *http.Request) {
		n, ok := name(r)
		if !ok {
			http.Error(w, "bad widget", 400)
			return
		}
		writeJSON(w, map[string]any{"closed": closeOverlays(n)})
	}))
	mux.HandleFunc("/api/overlay/reset", post(func(w http.ResponseWriter, r *http.Request) {
		cfgMu.Lock()
		cfg.Positions = map[string][4]int{}
		saveSettingsLocked()
		cfgMu.Unlock()
		writeJSON(w, map[string]any{"reset": true})
	}))
	mux.HandleFunc("/api/overlay/visible", post(func(w http.ResponseWriter, r *http.Request) {
		n, ok := name(r)
		if !ok || n == "*" {
			http.Error(w, "bad widget", 400)
			return
		}
		setOverlayVisible(n, r.URL.Query().Get("on") == "1")
		writeJSON(w, map[string]any{"ok": true})
	}))
	// Move or resize an overlay from the app (also from a phone).
	mux.HandleFunc("/api/overlay/move", post(func(w http.ResponseWriter, r *http.Request) {
		n, ok := name(r)
		q := r.URL.Query()
		x, e1 := strconv.Atoi(q.Get("x"))
		y, e2 := strconv.Atoi(q.Get("y"))
		ww, e3 := strconv.Atoi(q.Get("width"))
		hh, e4 := strconv.Atoi(q.Get("height"))
		if !ok || n == "*" || e1 != nil || e2 != nil || e3 != nil || e4 != nil || ww < 80 || hh < 40 {
			http.Error(w, "bad request", 400)
			return
		}
		moveOverlay(n, x, y, ww, hh)
		cfgMu.Lock()
		cfg.Positions[n] = [4]int{x, y, ww, hh}
		saveSettingsLocked()
		cfgMu.Unlock()
		writeJSON(w, map[string]any{"moved": n})
	}))
	mux.HandleFunc("/api/overlay/screen", func(w http.ResponseWriter, r *http.Request) {
		writeJSON(w, screenInfo())
	})
	mux.HandleFunc("/api/overlay/list", func(w http.ResponseWriter, r *http.Request) {
		// where the open overlay windows really are (they may have been dragged on the screen)
		rects := overlayRects()
		cfgMu.Lock()
		changed := false
		for n, rc := range rects {
			if !widgetRe.MatchString(n) || rc[2] < 80 || rc[3] < 40 {
				continue
			}
			if old, ok := cfg.Positions[n]; !ok || old != rc {
				if cfg.Positions == nil {
					cfg.Positions = map[string][4]int{}
				}
				cfg.Positions[n] = rc
				changed = true
			}
		}
		if changed {
			saveSettingsLocked()
		}
		cfgMu.Unlock()
		writeJSON(w, map[string]any{"supported": overlaysSupported, "open": listOverlays(), "rects": rects})
	})
}
