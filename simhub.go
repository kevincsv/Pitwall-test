package main

// SimHub (simhub/, docs/spec/simhub.md): the Pitlane HQ plugin for SimHub on this PC reads what Pitlane HQ works out
// (the delta bar's delta, the coach's next corner and tip, the lap valid or not) and shows it as SimHub properties
// for its dashboards and LEDs. The local API is only for Pitlane HQ's own windows (localtoken.go), so the plugin has a
// key of its own: simhub.json in the data folder ({"port","key"}), a new key every run. /api/simhub answers only on
// this PC, with that key, and while the feature is allowed (in development: admins with admin mode on).

import (
	"crypto/subtle"
	"encoding/json"
	"fmt"
	"net/http"
	"os"
	"path/filepath"
	"strings"
	"sync"
	"time"
)

const simhubFeedVersion = 1 // the frame's shape: the plugin reads only the versions it knows

var (
	simhubKey     = randHex(24)
	simhubMu      sync.Mutex
	simhubClients int
	simhubSt      *ovState // the values the delta bar and the coach overlays work from, fed like an overlay window
	simhubLast    []byte   // the newest frame, written 30 times a second while a plugin listens
	simhubLap     simhubLapState
)

// simhubLapState: the lap under way and the last one, as the lap recorder judges them (cloud.go)
type simhubLapState struct {
	n, lastN      int
	bad, lastBad  bool
	live, hasLast bool
}

// simhubFrame: what the plugin gets, 30 times a second. A value Pitlane HQ does not have now is null.
type simhubFrame struct {
	V            int      `json:"v"`
	Connected    bool     `json:"connected"`
	Game         string   `json:"game,omitempty"`
	Delta        *float64 `json:"delta"`        // to the delta bar's reference (s, negative is faster)
	CoachRef     string   `json:"coachRef"`     // what the coach measures against ("vs your best lap")
	CoachDelta   *float64 `json:"coachDelta"`   // this lap against the coach's reference at the same point (s)
	CoachTurn    string   `json:"coachTurn"`    // the next corner the coach speaks about ("T4", or its name)
	CoachDist    *float64 `json:"coachDist"`    // metres to its braking point
	CoachTip     string   `json:"coachTip"`     // the tip for it
	CoachCue     string   `json:"coachCue"`     // the tip in two or three words ("BRAKE EARLIER")
	CoachLost    *float64 `json:"coachLost"`    // what it cost on the last lap (s)
	LastTurn     string   `json:"lastTurn"`     // the corner just taken
	LastTurnGain *float64 `json:"lastTurnGain"` // what it gained (negative) or lost against the reference (s)
	Lap          int      `json:"lap"`
	LapValid     *bool    `json:"lapValid"` // the lap under way, so far
	LastLap      int      `json:"lastLap"`
	LastLapValid *bool    `json:"lastLapValid"`
}

// writeSimhubFile tells the plugin where the agent listens and its key (the plugin reads it again on every reconnect)
func writeSimhubFile(port int) {
	b, _ := json.Marshal(map[string]any{"port": port, "key": simhubKey, "v": simhubFeedVersion})
	p := filepath.Join(dataDir(), "simhub.json")
	tmp := p + ".tmp"
	if os.WriteFile(tmp, b, 0o600) == nil {
		os.Rename(tmp, p)
	}
}

// simhubLapLive: the lap recorder's lap under way after every sample (nil: out of the car)
func simhubLapLive(cur *lapRec) {
	simhubMu.Lock()
	defer simhubMu.Unlock()
	if cur == nil {
		simhubLap.live = false
		return
	}
	simhubLap.live, simhubLap.n, simhubLap.bad = true, cur.n, cur.invalid()
}

// simhubLapDone: a lap ended with this verdict (again a moment later when iRacing did not take it as its best)
func simhubLapDone(n int, valid bool) {
	simhubMu.Lock()
	defer simhubMu.Unlock()
	simhubLap.hasLast, simhubLap.lastN, simhubLap.lastBad = true, n, !valid
}

// simhubAllowed: the request comes from a program on this PC with this run's key, and the feature is on
func simhubAllowed(r *http.Request) bool {
	if !isLoopback(r) || isRemote(r) {
		return false
	}
	k := r.Header.Get("X-PitlaneHQ-Key")
	return len(k) == len(simhubKey) && subtle.ConstantTimeCompare([]byte(k), []byte(simhubKey)) == 1
}

func registerSimhubRoutes(mux *http.ServeMux) {
	mux.HandleFunc("/api/simhub", func(w http.ResponseWriter, r *http.Request) {
		if !simhubAllowed(r) {
			http.Error(w, "no key", 403)
			return
		}
		if !wipAllowed() {
			w.WriteHeader(409)
			writeJSON(w, map[string]any{"v": simhubFeedVersion, "off": true})
			return
		}
		fl, ok := w.(http.Flusher)
		if !ok {
			http.Error(w, "streaming unsupported", 500)
			return
		}
		h := w.Header()
		h.Set("Content-Type", "text/event-stream")
		h.Set("Cache-Control", "no-cache")
		simhubJoin(1)
		defer simhubJoin(-1)
		tk := time.NewTicker(time.Second / 30)
		defer tk.Stop()
		var sent []byte
		lastAt := time.Now()
		for {
			select {
			case <-r.Context().Done():
				return
			case <-tk.C:
			}
			if !wipAllowed() { // admin mode turned off: the plugin hears it and waits
				fmt.Fprint(w, "event: off\ndata: {}\n\n")
				fl.Flush()
				return
			}
			simhubMu.Lock()
			b := simhubLast
			simhubMu.Unlock()
			if b == nil || string(b) == string(sent) {
				if time.Since(lastAt) > 2*time.Second { // nothing new (no game): the plugin knows the agent is still there
					if _, err := fmt.Fprint(w, ": keepalive\n\n"); err != nil {
						return
					}
					fl.Flush()
					lastAt = time.Now()
				}
				continue
			}
			sent, lastAt = b, time.Now()
			if _, err := fmt.Fprintf(w, "data: %s\n\n", b); err != nil {
				return
			}
			fl.Flush()
		}
	})
}

// simhubJoin counts the plugins listening: the first starts the feed, and with none it stops reading
func simhubJoin(d int) {
	simhubMu.Lock()
	defer simhubMu.Unlock()
	simhubClients += d
	if simhubSt == nil && simhubClients > 0 {
		st := newOvState(uiLangTold())
		st.varsFn = func() []string { return simhubVars(st) }
		simhubSt = st
		go ovFeed(withTicket(fmt.Sprintf("http://127.0.0.1:%d", listenPort)), st.varsFn, st)
		go simhubLoop(st)
	}
	if simhubSt != nil {
		simhubSt.hidden.Store(simhubClients <= 0) // like a hidden overlay: its stream closed until a plugin is back
	}
}

// simhubVars: the values the delta bar and the coach read
func simhubVars(st *ovState) []string {
	seen := map[string]bool{}
	var out []string
	for _, n := range append(ovVars("deltabar", st), ovVars("coach", st)...) {
		if !seen[n] {
			seen[n] = true
			out = append(out, n)
		}
	}
	return ovWithOnTrack(out)
}

func simhubLoop(st *ovState) {
	tk := time.NewTicker(time.Second / 30)
	defer tk.Stop()
	for range tk.C {
		if st.hidden.Load() {
			continue
		}
		st.mu.Lock()
		f := simhubCompute(st, time.Now())
		st.mu.Unlock()
		simhubMu.Lock()
		simhubWithLap(&f, simhubLap)
		simhubMu.Unlock()
		b, _ := json.Marshal(f)
		simhubMu.Lock()
		simhubLast = b
		simhubMu.Unlock()
	}
}

// simhubWithLap adds the lap recorder's verdicts to a frame
func simhubWithLap(f *simhubFrame, l simhubLapState) {
	if l.live {
		v := !l.bad
		f.Lap, f.LapValid = l.n, &v
	}
	if l.hasLast {
		v := !l.lastBad
		f.LastLap, f.LastLapValid = l.lastN, &v
	}
}

// simhubCompute: the frame from the overlay state, as the delta bar and the coach overlay would draw it; st.mu is held
func simhubCompute(st *ovState, now time.Time) simhubFrame {
	f := simhubFrame{V: simhubFeedVersion, Game: st.game}
	if now.Sub(st.at) > 2*time.Second || len(st.frame) == 0 { // no data from the game
		return f
	}
	f.Connected = true
	num := func(v float64) *float64 { return &v }
	if d, ok := st.delta(); ok {
		f.Delta = num(round(d, 3))
	}
	cfg := st.uiMap("coach")
	st.coachTick(cfg)
	C := &st.ext.coach
	f.CoachRef = C.ref
	if C.refLap != nil {
		if d, ok := st.liveDelta(C.refLap); ok {
			f.CoachDelta = num(round(d, 3))
		}
	}
	if t, dTo := st.coachNext(cfg); t != nil {
		f.CoachTurn, f.CoachDist, f.CoachLost = coachTurnLabel(st, t.n, false), num(round(dTo, 0)), num(round(t.lost, 2))
		if t.lost > .03 && t.en != "" {
			f.CoachTip = st.T(t.en, t.es)
			f.CoachCue = strings.TrimSpace(st.T(t.cueEn, t.cueEs))
		}
	}
	if v := C.verdict; v != nil && now.Sub(v.at) < 8*time.Second {
		f.LastTurn, f.LastTurnGain = coachTurnLabel(st, v.n, true), num(round(v.gain, 2))
	}
	return f
}
