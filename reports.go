package main

// What breaks, and what the driver should know (the server's side is cloud/src/reports.js):
//   - keepAlive runs each long-lived part of the agent (the game reader, the recorder, the uploader…) so a panic in one
//     is logged, reported to the server (POST /community/crash) and that part starts again, instead of closing the agent
//   - a crash Go cannot catch (a fatal error, a panic in another goroutine) is written to crash.txt
//     (debug.SetCrashOutput) and reported the next time the agent starts
//   - POST /api/support/logs sends the end of the agent's log to the support chat (POST /community/support/logs)
//   - GET /api/health says what the driver should act on: laps waiting to upload, and Le Mans Ultimate running with its
//     plugins off (Pitlane HQ cannot read it then)

import (
	"fmt"
	"io"
	"log"
	"net/http"
	"os"
	"path/filepath"
	"runtime"
	"runtime/debug"
	"strings"
	"sync"
	"time"
)

var (
	crashMu   sync.Mutex
	crashSent = map[string]bool{} // one report per kind of error and run
)

// keepAlive runs fn, and runs it again after a panic (waiting longer each time, at most 20 times a run).
func keepAlive(name string, fn func()) {
	wait := 2 * time.Second
	for i := 0; i < 20; i++ {
		if !runGuarded(name, fn) {
			return // fn ended by itself
		}
		time.Sleep(wait)
		if wait < time.Minute {
			wait *= 2
		}
		log.Printf("%s: started again after a crash", name)
	}
}

// safeGo runs fn once in its own goroutine; a panic is logged and reported, never the end of the agent.
func safeGo(name string, fn func()) { go runGuarded(name, fn) }

// runGuarded runs fn; true when it panicked.
func runGuarded(name string, fn func()) (panicked bool) {
	defer func() {
		if r := recover(); r != nil {
			panicked = true
			st := string(debug.Stack())
			log.Printf("%s crashed: %v\n%s", name, r, st)
			reportCrash(name, fmt.Sprint(r), st)
		}
	}()
	fn()
	return false
}

// reportCrash sends one error to the server once per run (signed in or not; nothing about the driver but the account).
func reportCrash(where, msg, stack string) {
	key := where + "|" + strings.SplitN(msg, "\n", 2)[0]
	crashMu.Lock()
	if crashSent[key] || len(crashSent) > 50 {
		crashMu.Unlock()
		return
	}
	crashSent[key] = true
	crashMu.Unlock()
	go func() {
		defer func() { recover() }()
		loadPL()
		plMu.Lock()
		tok := plAcc.Token
		plMu.Unlock()
		if len(stack) > 8000 {
			stack = stack[:8000]
		}
		commRequest("POST", "/community/crash", map[string]any{"app": "pc", "v": appVersion, "os": runtime.GOOS + "/" + runtime.GOARCH,
			"where": where, "msg": msg, "stack": stack}, tok)
	}()
}

func crashFilePath() string { return filepath.Join(dataDir(), "crash.txt") }

// watchFatalCrashes reports the crash of the last run (when there was one) and sends the next one to crash.txt.
func watchFatalCrashes() {
	p := crashFilePath()
	if b, err := os.ReadFile(p); err == nil && len(strings.TrimSpace(string(b))) > 0 {
		os.Rename(p, p+".old")
		s := string(b)
		msg := strings.TrimSpace(strings.SplitN(s, "\n", 2)[0])
		if len(s) > 8000 {
			s = s[:8000]
		}
		log.Printf("the last run crashed: %s", msg)
		go func() {
			time.Sleep(20 * time.Second) // once the account is loaded
			reportCrash("fatal", msg, s)
		}()
	}
	os.MkdirAll(filepath.Dir(p), 0o700)
	if f, err := os.OpenFile(p, os.O_CREATE|os.O_TRUNC|os.O_WRONLY, 0o600); err == nil {
		debug.SetCrashOutput(f, debug.CrashOptions{}) // it keeps its own copy of the file
		f.Close()
	}
}

// logTail is the end of the agent's log (the older file first when the current one is short), with a header saying
// which agent and PC it comes from.
func logTail(max int) string {
	read := func(p string) string {
		f, err := os.Open(p)
		if err != nil {
			return ""
		}
		defer f.Close()
		if st, err := f.Stat(); err == nil && st.Size() > int64(max) {
			f.Seek(-int64(max), io.SeekEnd)
		}
		b, _ := io.ReadAll(io.LimitReader(f, int64(max)))
		return string(b)
	}
	p := logFilePath()
	cur := read(p)
	if len(cur) < max/2 {
		if old := read(p + ".old"); old != "" {
			if keep := max - len(cur); len(old) > keep {
				old = old[len(old)-keep:]
			}
			cur = old + "\n----- (pitlanehq.log) -----\n" + cur
		}
	}
	st := currentStatus()
	head := fmt.Sprintf("Pitlane HQ Agent %s %s · %s/%s · game %s (chosen %s), connected %v\n", appVersion, appStage, runtime.GOOS, runtime.GOARCH,
		firstNonEmpty(st.Source, "none"), st.Game, st.Connected)
	if lmuRunning() {
		head += "Le Mans Ultimate is running\n"
	}
	return head + "\n" + cur
}

// ---------- what the driver should act on ----------

var (
	healthMu     sync.Mutex
	lmuUnreadAt  time.Time // Le Mans Ultimate running while the agent does not read it, since
	waitingSince time.Time // laps waiting to upload, since
)

// healthWatcher looks every 10 s at what the page's GET /api/health reports.
func healthWatcher() {
	for {
		time.Sleep(10 * time.Second)
		st := currentStatus()
		lmu := lmuRunning() && st.Source != "lmu"
		cloudMu.Lock()
		n := len(cloudQueue)
		cloudMu.Unlock()
		healthMu.Lock()
		if !lmu {
			lmuUnreadAt = time.Time{}
		} else if lmuUnreadAt.IsZero() {
			lmuUnreadAt = time.Now()
		}
		if n == 0 {
			waitingSince = time.Time{}
		} else if waitingSince.IsZero() {
			waitingSince = time.Now()
		}
		healthMu.Unlock()
	}
}

// healthNow: the laps waiting more than two minutes and whether the account can take them; LMU not readable for a
// minute while the game is set to it or to Automatic
func healthNow() map[string]any {
	healthMu.Lock()
	lmuAt, wAt := lmuUnreadAt, waitingSince
	healthMu.Unlock()
	out := map[string]any{"waiting": 0}
	if !wAt.IsZero() && time.Since(wAt) > 2*time.Minute {
		cloudMu.Lock()
		n := 0
		for _, it := range cloudQueue {
			n += len(it.Laps)
		}
		own := cloudCfg.Enabled && cloudCfg.URL != "" && cloudCfg.Key != ""
		cloudMu.Unlock()
		acct := accountCloud()
		out["waiting"] = n
		out["signedIn"] = own || acct.Enabled
		out["since"] = wAt.UnixMilli()
	}
	g := gamePref()
	out["lmuPlugins"] = !lmuAt.IsZero() && time.Since(lmuAt) > time.Minute && (g == "auto" || g == "lmu") && !tel.isDemo()
	return out
}

func registerReportRoutes(mux *http.ServeMux) {
	mux.HandleFunc("/api/health", func(w http.ResponseWriter, r *http.Request) {
		writeJSON(w, healthNow())
	})
	// "Retry" beside the laps waiting to upload
	mux.HandleFunc("/api/health/retry", func(w http.ResponseWriter, r *http.Request) {
		if r.Method != http.MethodPost {
			w.WriteHeader(405)
			return
		}
		kickCloud()
		writeJSON(w, map[string]bool{"ok": true})
	})
	// "Send logs" in the support chat: the agent sends the end of its log itself, with the account's sign-in
	mux.HandleFunc("/api/support/logs", func(w http.ResponseWriter, r *http.Request) {
		if r.Method != http.MethodPost || !isLoopback(r) {
			w.WriteHeader(400)
			writeJSON(w, map[string]string{"error": "not available"})
			return
		}
		loadPL()
		plMu.Lock()
		tok := plAcc.Token
		plMu.Unlock()
		if tok == "" {
			w.WriteHeader(401)
			writeJSON(w, map[string]string{"error": "sign in with your Pitlane HQ account"})
			return
		}
		b, err := commRequest("POST", "/community/support/logs", map[string]any{"text": logTail(400 << 10), "device": "pc", "v": appVersion}, tok)
		if err != nil {
			w.WriteHeader(502)
			writeJSON(w, map[string]string{"error": err.Error()})
			return
		}
		w.Header().Set("Content-Type", "application/json")
		w.Write(b)
	})
}
