package main

import (
	"embed"
	"encoding/json"
	"flag"
	"fmt"
	"io/fs"
	"log"
	"net"
	"net/http"
	"os"
	"os/signal"
	"path/filepath"
	"runtime"
	"sort"
	"strconv"
	"strings"
	"sync"
	"syscall"
	"time"
)

const appVersion = "0.24.0"

//go:embed web/dist
var webFS embed.FS

// Source is anything that exposes an irsdk-format memory block.
type Source interface {
	Name() string
	Open() error
	Mem() []byte
	Wait(time.Duration)
	Close()
}

// Telemetry holds the newest decoded state shared by every client.
type Telemetry struct {
	mu         sync.RWMutex
	source     string
	connected  bool
	demo       bool
	vars       []VarHeader
	index      map[string]int
	schemaVer  int
	session    string
	sessionVer int
	tick       int32
	buf        []byte
	tickRate   int
}

var tel = &Telemetry{index: map[string]int{}}

func (t *Telemetry) setDemo(on bool) {
	t.mu.Lock()
	t.demo = on
	t.mu.Unlock()
}

func (t *Telemetry) isDemo() bool {
	t.mu.RLock()
	defer t.mu.RUnlock()
	return t.demo
}

// reader opens iRacing (or the demo) and keeps Telemetry up to date at the sim's tick rate.
func reader(forceDemo bool) {
	tel.setDemo(forceDemo)
	var src Source
	var lastStatus bool
	var lastVarHdr, lastNumVars, lastSessUpd int32 = -1, -1, -1
	var lastTick int32 = -1
	var scratch []byte
	staleSince := time.Time{}
	closeSrc := func(reason string) {
		if src != nil {
			src.Close()
			src = nil
		}
		lastVarHdr, lastNumVars, lastSessUpd, lastTick = -1, -1, -1, -1
		tel.mu.Lock()
		tel.connected = false
		tel.source = ""
		tel.mu.Unlock()
		if reason != "" {
			log.Println(reason)
		}
	}
	for {
		wantDemo := tel.isDemo()
		if src != nil && (src.Name() == "demo") != wantDemo {
			closeSrc("Switching data source")
		}
		// the game chosen in Settings (or whichever is running, on Automatic)
		if src != nil && !wantDemo {
			if g := gamePref(); g != "auto" && src.Name() != g {
				closeSrc("Switching game")
			}
		}
		if src == nil {
			if wantDemo {
				src = newDemoSource()
				if err := src.Open(); err != nil {
					src = nil
				}
			} else {
				src = openGame(gamePref())
			}
			if src == nil {
				time.Sleep(2 * time.Second)
				continue
			}
			log.Printf("Connected to %s telemetry", src.Name())
			staleSince = time.Now()
		}
		src.Wait(20 * time.Millisecond)
		mem := src.Mem()
		h, err := readHeader(mem)
		if err != nil {
			closeSrc("Telemetry header unreadable, retrying")
			time.Sleep(time.Second)
			continue
		}
		connected := h.Status&irsdkStatusConnected != 0
		if connected != lastStatus {
			lastStatus = connected
			tel.mu.Lock()
			tel.connected = connected
			tel.source = src.Name()
			tel.schemaVer++ // let clients refresh status
			tel.mu.Unlock()
			if connected {
				log.Printf("%s session active", firstNonEmpty(gameNames[src.Name()], src.Name()))
			} else {
				log.Println("Waiting for you to get in the car...")
			}
		}
		if !connected {
			// sim closed or in menus; reopen after a while so a restarted sim is picked up
			if time.Since(staleSince) > 10*time.Second && src.Name() != "demo" {
				closeSrc("")
			}
			time.Sleep(200 * time.Millisecond)
			continue
		}
		staleSince = time.Now()
		if h.VarHeaderOffset != lastVarHdr || h.NumVars != lastNumVars {
			vars, err := readVarHeaders(mem, h)
			if err == nil {
				idx := make(map[string]int, len(vars))
				for i, v := range vars {
					idx[v.Name] = i
				}
				tel.mu.Lock()
				tel.vars, tel.index = vars, idx
				tel.schemaVer++
				tel.tickRate = int(h.TickRate)
				tel.mu.Unlock()
				lastVarHdr, lastNumVars = h.VarHeaderOffset, h.NumVars
				log.Printf("Telemetry: %d variables at %d Hz", len(vars), h.TickRate)
			}
		}
		if h.SessionInfoUpdate != lastSessUpd {
			s := readSessionInfo(mem, h)
			tel.mu.Lock()
			tel.session = s
			tel.sessionVer++
			tel.mu.Unlock()
			lastSessUpd = h.SessionInfoUpdate
		}
		tick, buf, ok := latestBuffer(mem, scratch)
		if !ok || tick == lastTick {
			continue
		}
		scratch = buf
		lastTick = tick
		tel.mu.Lock()
		if cap(tel.buf) < len(buf) {
			tel.buf = make([]byte, len(buf))
		}
		tel.buf = tel.buf[:len(buf)]
		copy(tel.buf, buf)
		tel.tick = tick
		tel.mu.Unlock()
	}
}

type statusMsg struct {
	Connected bool   `json:"connected"`
	Source    string `json:"source"`
	Demo      bool   `json:"demo"`
	TickRate  int    `json:"tickRate"`
	Game      string `json:"game"` // the game chosen in Settings: auto, iracing or lmu
}

func currentStatus() statusMsg {
	g := gamePref()
	tel.mu.RLock()
	defer tel.mu.RUnlock()
	return statusMsg{tel.connected, tel.source, tel.demo, tel.tickRate, g}
}

// GET /api/stream?vars=Speed,RPM|*&hz=30 — Server-Sent Events.
// Events: status, schema (all vars), fields (names in frame order), session (raw YAML), t (frame).
func handleStream(w http.ResponseWriter, r *http.Request) {
	fl, ok := w.(http.Flusher)
	if !ok {
		http.Error(w, "streaming unsupported", 500)
		return
	}
	hz, _ := strconv.Atoi(r.URL.Query().Get("hz"))
	if hz <= 0 {
		hz = 30
	}
	if hz > 60 {
		hz = 60
	}
	wantAll := r.URL.Query().Get("vars") == "*"
	var wantNames []string
	if !wantAll {
		for _, n := range strings.Split(r.URL.Query().Get("vars"), ",") {
			if n = strings.TrimSpace(n); n != "" {
				wantNames = append(wantNames, n)
			}
		}
	}
	h := w.Header()
	h.Set("Content-Type", "text/event-stream")
	h.Set("Cache-Control", "no-cache")
	h.Set("Connection", "keep-alive")
	h.Set("Access-Control-Allow-Origin", "*")
	h.Set("X-Accel-Buffering", "no")

	send := func(event string, v any) bool {
		b, err := json.Marshal(v)
		if err != nil {
			return true
		}
		if _, err := fmt.Fprintf(w, "event: %s\ndata: %s\n\n", event, b); err != nil {
			return false
		}
		return true
	}
	fmt.Fprint(w, "retry: 2000\n\n")
	schemaVer, sessionVer, configVer := -1, -1, -1
	_, radioSeen := radioSince(-1) // only questions asked after this screen connected
	_, noticeSeen := noticesSince(-1)
	var lastTick int32 = -1
	var want []int
	var lastStatus statusMsg
	tk := time.NewTicker(time.Second / time.Duration(hz))
	defer tk.Stop()
	keep := time.NewTicker(15 * time.Second)
	defer keep.Stop()
	first := true
	for {
		select {
		case <-r.Context().Done():
			return
		case <-keep.C:
			if _, err := fmt.Fprint(w, ": keepalive\n\n"); err != nil {
				return
			}
			fl.Flush()
			continue
		case <-tk.C:
		}
		st := currentStatus()
		if first || st != lastStatus {
			if !send("status", st) {
				return
			}
			lastStatus = st
		}
		if evs, seq := radioSince(radioSeen); seq != radioSeen {
			for _, e := range evs {
				if !send("radio", e) {
					return
				}
			}
			radioSeen = seq
		}
		if evs, seq := noticesSince(noticeSeen); seq != noticeSeen {
			for _, e := range evs {
				if !send("notice", e) {
					return
				}
			}
			noticeSeen = seq
		}
		if c, v := settingsSnapshot(); v != configVer {
			configVer = v
			if !send("config", map[string]any{"config": c, "version": v, "profile": activeID(), "profileName": activeName()}) {
				return
			}
		}
		tel.mu.RLock()
		if tel.schemaVer != schemaVer {
			schemaVer = tel.schemaVer
			want = want[:0]
			names := []string{}
			if wantAll {
				for i, v := range tel.vars {
					want = append(want, i)
					names = append(names, v.Name)
				}
			} else {
				for _, n := range wantNames {
					if i, ok := tel.index[n]; ok {
						want = append(want, i)
						names = append(names, n)
					}
				}
			}
			vars := tel.vars
			tel.mu.RUnlock()
			if !send("schema", vars) || !send("fields", names) {
				return
			}
			tel.mu.RLock()
		}
		if tel.sessionVer != sessionVer {
			sessionVer = tel.sessionVer
			s := tel.session
			tel.mu.RUnlock()
			if !send("session", s) {
				return
			}
			tel.mu.RLock()
		}
		var frame []any
		tick := tel.tick
		if tel.connected && tick != lastTick && len(tel.buf) > 0 {
			frame = decodeValues(tel.vars, tel.buf, want)
		}
		tel.mu.RUnlock()
		if frame != nil {
			lastTick = tick
			if !send("t", map[string]any{"k": tick, "v": frame}) {
				return
			}
		}
		fl.Flush()
		first = false
	}
}

func writeJSON(w http.ResponseWriter, v any) {
	w.Header().Set("Content-Type", "application/json")
	json.NewEncoder(w).Encode(v)
}

var listenPort int

func lanURLs() []string {
	type cand struct {
		url   string
		score int
	}
	var list []cand
	ifs, _ := net.Interfaces()
	for _, ifc := range ifs {
		if ifc.Flags&net.FlagUp == 0 || ifc.Flags&net.FlagLoopback != 0 {
			continue
		}
		name := strings.ToLower(ifc.Name)
		addrs, _ := ifc.Addrs()
		for _, a := range addrs {
			ipn, ok := a.(*net.IPNet)
			if !ok || ipn.IP.To4() == nil || ipn.IP.IsLinkLocalUnicast() {
				continue
			}
			ip := ipn.IP.To4()
			score := 0
			// the home network first: 192.168.x.x, then 10.x, then 172.16-31.x
			switch {
			case ip[0] == 192 && ip[1] == 168:
				score += 30
			case ip[0] == 10:
				score += 20
			case ip[0] == 172 && ip[1] >= 16 && ip[1] <= 31:
				score += 10
			}
			// the real Wi-Fi or Ethernet adapter before virtual ones (WSL, Hyper-V, VPNs…)
			for _, v := range []string{"vethernet", "virtual", "vmware", "vbox", "hyper-v", "wsl", "docker", "tailscale", "zerotier", "vpn", "tap", "tun", "bluetooth", "radmin", "hamachi"} {
				if strings.Contains(name, v) {
					score -= 100
					break
				}
			}
			if strings.Contains(name, "wi-fi") || strings.Contains(name, "wlan") || strings.Contains(name, "wireless") || strings.HasPrefix(name, "ethernet") || strings.HasPrefix(name, "eth") || strings.HasPrefix(name, "en") {
				score += 5
			}
			list = append(list, cand{fmt.Sprintf("http://%s:%d", ip, listenPort), score})
		}
	}
	sort.SliceStable(list, func(i, j int) bool { return list[i].score > list[j].score })
	out := make([]string, len(list))
	for i, c := range list {
		out[i] = c.url
	}
	return out
}

func main() {
	port := flag.Int("port", 8484, "port for the app")
	demo := flag.Bool("demo", runtime.GOOS != "windows", "start with demo data instead of iRacing")
	noBrowser := flag.Bool("no-browser", false, "do not open the app window on start")
	minimized := flag.Bool("minimized", false, "start with this window minimized")
	ovName := flag.String("overlay-window", "", "internal: run one overlay window")
	ovURL := flag.String("url", "", "internal: overlay address")
	ovX := flag.Int("x", 100, "internal")
	ovY := flag.Int("y", 100, "internal")
	ovW := flag.Int("w", 460, "internal")
	ovH := flag.Int("h", 260, "internal")
	rate := flag.Float64("demo-rate", 1, "demo playback speed (testing)")
	cd := flag.Bool("cloud-demo", false, "internal: upload the demo race laps (testing)")
	flag.Parse()
	cloudDemo = *cd
	demoRate = *rate
	if *ovName != "" {
		runOverlayWindow(*ovName, *ovURL, *ovX, *ovY, *ovW, *ovH)
		return
	}
	log.SetFlags(log.Ltime)
	if runtime.GOOS == "windows" {
		// no console window: the log goes to a file
		if p := logFilePath(); p != "" {
			os.MkdirAll(filepath.Dir(p), 0o700)
			if st, err := os.Stat(p); err == nil && st.Size() > 5<<20 {
				os.Rename(p, p+".old")
			}
			if f, err := os.OpenFile(p, os.O_CREATE|os.O_APPEND|os.O_WRONLY, 0o600); err == nil {
				log.SetOutput(f)
				log.SetFlags(log.Ldate | log.Ltime)
			}
		}
		// already running: bring its window to the front instead of starting again
		if os.Getenv("PITLANE_UPDATED") == "" && !*noBrowser {
			c := &http.Client{Timeout: 1500 * time.Millisecond}
			if resp, err := c.Post(fmt.Sprintf("http://localhost:%d/api/show", *port), "application/json", nil); err == nil {
				resp.Body.Close()
				if resp.StatusCode == 200 {
					return
				}
			}
		}
	}

	initProfiles()
	loadProfileState()
	go reader(*demo)
	go autoOverlays()
	go positionKeeper()
	go appsOnSim()
	go lapRecorder()
	go carWatcher()
	go joyWatcher()
	go raceWatcher()
	go fieldWatcher()
	go myLapWatcher()
	go updateWatcher()
	loadLicense()
	go licenseWatcher()
	go liveRelay()
	go cloudUploader()
	go func() { // programs you chose to start with Pitlane HQ
		time.Sleep(2 * time.Second)
		launchGroup("pitwall")
	}()

	sub, _ := fs.Sub(webFS, "web/dist")
	mux := http.NewServeMux()
	mux.HandleFunc("/api/stream", handleStream)
	mux.HandleFunc("/api/info", func(w http.ResponseWriter, r *http.Request) {
		st := currentStatus()
		host, _ := os.Hostname()
		w.Header().Set("Access-Control-Allow-Origin", "*") // the phone app's connect screen looks for this PC
		if !isLoopback(r) && !isRemote(r) && needsPairingAny(r) {
			writeJSON(w, map[string]any{"app": "PitWall", "host": host, "version": appVersion, "pair": true})
			return
		}
		if isRemote(r) {
			writeJSON(w, map[string]any{"app": "PitWall", "host": host, "version": appVersion, "status": currentStatus(), "remote": true, "account": map[string]any{"loggedIn": false}, "overlays": false})
			return
		}
		writeJSON(w, map[string]any{"app": "PitWall", "host": host, "version": appVersion, "status": st, "urls": lanURLs(), "os": runtime.GOOS, "account": accountStatus(), "overlays": overlaysSupported, "profile": activeID(), "profileName": activeName()})
	})
	mux.HandleFunc("/api/show", func(w http.ResponseWriter, r *http.Request) {
		if r.Method != http.MethodPost || !isLoopback(r) || isRemote(r) {
			http.Error(w, "only from this PC", 403)
			return
		}
		if !showMainWindow() {
			http.Error(w, "no window", 404)
			return
		}
		writeJSON(w, map[string]bool{"shown": true})
	})
	mux.HandleFunc("/api/quit", func(w http.ResponseWriter, r *http.Request) {
		if r.Method != http.MethodPost || !isLoopback(r) || isRemote(r) {
			http.Error(w, "only from this PC", 403)
			return
		}
		writeJSON(w, map[string]bool{"quitting": true})
		go func() { time.Sleep(300 * time.Millisecond); quitApp() }()
	})
	mux.HandleFunc("/api/demo", func(w http.ResponseWriter, r *http.Request) {
		if r.Method != http.MethodPost {
			http.Error(w, "POST only", 405)
			return
		}
		tel.setDemo(r.URL.Query().Get("on") == "1")
		writeJSON(w, map[string]bool{"demo": tel.isDemo()})
	})
	mux.HandleFunc("/api/schema", func(w http.ResponseWriter, r *http.Request) {
		tel.mu.RLock()
		defer tel.mu.RUnlock()
		writeJSON(w, tel.vars)
	})
	mux.HandleFunc("/api/session", func(w http.ResponseWriter, r *http.Request) {
		tel.mu.RLock()
		s := tel.session
		tel.mu.RUnlock()
		w.Header().Set("Content-Type", "text/yaml; charset=utf-8")
		w.Header().Set("Access-Control-Allow-Origin", "*")
		fmt.Fprint(w, s)
	})
	mux.HandleFunc("/api/snapshot", func(w http.ResponseWriter, r *http.Request) {
		tel.mu.RLock()
		out := map[string]any{"tick": tel.tick}
		all := make([]int, len(tel.vars))
		for i := range all {
			all[i] = i
		}
		if len(tel.buf) > 0 {
			vals := decodeValues(tel.vars, tel.buf, all)
			for i, v := range tel.vars {
				out[v.Name] = vals[i]
			}
		}
		tel.mu.RUnlock()
		writeJSON(w, out)
	})
	registerAccountRoutes(mux)
	registerAssetRoutes(mux)
	registerMapRoutes(mux)
	registerOverlayRoutes(mux)
	registerLangRoute(mux)
	registerConfigRoutes(mux)
	registerG61Routes(mux)
	registerShareRoutes(mux)
	registerProfileRoutes(mux)
	registerAppRoutes(mux)
	registerCloudRoutes(mux)
	registerSetupRoutes(mux)
	registerCarRoutes(mux)
	registerRadioRoutes(mux)
	registerJournalRoutes(mux)
	registerDiscordRoutes(mux)
	registerUpdateRoutes(mux)
	registerNewsRoutes(mux)
	registerPairRoutes(mux)
	registerLicenseRoutes(mux)
	registerCommunityRoutes(mux)
	registerPLRoutes(mux)
	files := http.FileServer(http.FS(sub))
	mux.Handle("/", http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		w.Header().Set("Cache-Control", "no-cache")
		if r.URL.Path == "/" || r.URL.Path == "/index.html" {
			// the page is authored without a doctype; add it so browsers use standards mode
			b, err := fs.ReadFile(sub, "index.html")
			if err != nil {
				http.Error(w, "missing app", 500)
				return
			}
			w.Header().Set("Content-Type", "text/html; charset=utf-8")
			w.Write([]byte("<!doctype html>\n"))
			w.Write(b)
			return
		}
		files.ServeHTTP(w, r)
	}))

	var ln net.Listener
	var err error
	// after an update the previous version is still closing: wait for its port
	if os.Getenv("PITLANE_UPDATED") != "" {
		for i := 0; i < 40; i++ {
			if ln, err = net.Listen("tcp", fmt.Sprintf(":%d", *port)); err == nil {
				break
			}
			time.Sleep(250 * time.Millisecond)
		}
	}
	if ln != nil {
		listenPort = *port
	} else {
		for p := *port; p < *port+10; p++ {
			ln, err = net.Listen("tcp", fmt.Sprintf(":%d", p))
			if err == nil {
				listenPort = p
				break
			}
		}
	}
	if err != nil {
		log.Fatalf("Could not open a port: %v", err)
	}
	local := fmt.Sprintf("http://localhost:%d", listenPort)
	fmt.Println()
	fmt.Println("  PIT WALL " + appVersion)
	fmt.Println("  ------------------------------------------------------------")
	fmt.Println("  Keep this window open while you race. / Deja esta ventana abierta.")
	fmt.Println()
	fmt.Println("  On this PC / En este PC:      " + local)
	for _, u := range lanURLs() {
		fmt.Println("  Phone or tablet / Móvil:      " + u)
	}
	fmt.Println("  ------------------------------------------------------------")
	fmt.Println()
	// close the internet link and overlay windows when PitWall closes
	sig := make(chan os.Signal, 1)
	signal.Notify(sig, os.Interrupt, syscall.SIGTERM)
	go func() {
		<-sig
		quitApp()
	}()
	srv := &http.Server{Handler: guard(mux), ReadHeaderTimeout: 10 * time.Second}
	if runtime.GOOS == "windows" {
		go func() {
			if err := srv.Serve(ln); err != nil {
				log.Println(err)
				os.Exit(1)
			}
		}()
		// the app in its own window; closing it quits Pitlane HQ
		if runMainWindow(local, *minimized || *noBrowser) {
			quitApp()
		}
		if !*noBrowser {
			openAppWindow(local) // no WebView2 on this PC: an Edge app window
		}
		select {}
	}
	if !*noBrowser {
		go func() {
			time.Sleep(400 * time.Millisecond)
			openAppWindow(local)
		}()
	}
	if err := srv.Serve(ln); err != nil {
		log.Println(err)
		os.Exit(1)
	}
}

// quitApp closes the internet link and the overlay windows, then exits.
func quitApp() {
	stopShare()
	closeOverlays("*")
	os.Exit(0)
}
