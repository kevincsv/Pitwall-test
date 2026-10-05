package main

// Community: you choose what to share (nothing by default): your best lap
// times, the whole lap (telemetry trace) and your race analyses. Shared laps
// can be compared in the braking coach. Other drivers' names are removed from
// the race analyses you share.

import (
	"bytes"
	"crypto/sha256"
	"encoding/base64"
	"encoding/hex"
	"encoding/json"
	"errors"
	"fmt"
	"io"
	"io/fs"
	"net/http"
	"net/url"
	"os"
	"path/filepath"
	"regexp"
	"strconv"
	"strings"
	"sync"
	"time"
)

// the central community server (set it when it is deployed; overridable in the app)
var communityURL = ""

type commConfig struct {
	URL          string `json:"url,omitempty"`
	Alias        string `json:"alias"`
	ShareTimes   bool   `json:"shareTimes"`
	ShareTraces  bool   `json:"shareTraces"`
	ShareReports bool   `json:"shareReports"`
	NameKind     string `json:"nameKind,omitempty"` // "iracing" or "nick"
	UserID       string `json:"userId,omitempty"`
	Token        string `json:"token,omitempty"`
	Shared       int    `json:"shared"`
	LastErr      string `json:"lastErr,omitempty"`
}

var (
	commMu   sync.Mutex
	commCfg  commConfig
	commHTTP = &http.Client{Timeout: 25 * time.Second}
	commBest = map[string]float64{} // carId:trackId → best shared this run
)

func commPath() string { return filepath.Join(activeDir(), "community.json") }

func loadCommunity() {
	c := commConfig{}
	if b, err := readSecret(commPath()); err == nil {
		json.Unmarshal(b, &c)
	}
	commMu.Lock()
	commCfg = c
	commMu.Unlock()
}

func saveCommLocked() {
	b, _ := json.Marshal(commCfg)
	writeSecret(commPath(), b)
}

func commBase() string {
	commMu.Lock()
	defer commMu.Unlock()
	u := commCfg.URL
	if u == "" {
		u = communityURL
	}
	if u == "" {
		u = bundledServer()
	}
	return strings.TrimRight(u, "/")
}

func commCall(method, path string, body any, auth bool) ([]byte, error) {
	tok := ""
	if auth {
		tok = commToken()
		if tok == "" {
			return nil, errors.New("not registered")
		}
	}
	return commRequest(method, "/community"+path, body, tok)
}

// commToken: your Pitlane HQ account when you are signed in, else this PC's community token.
func commToken() string {
	loadPL()
	plMu.Lock()
	t := plAcc.Token
	plMu.Unlock()
	if t != "" {
		return t
	}
	commMu.Lock()
	defer commMu.Unlock()
	return commCfg.Token
}

func commRequest(method, path string, body any, tok string) ([]byte, error) {
	base := commBase()
	if base == "" {
		return nil, errors.New("the community server is not set up yet")
	}
	var rd io.Reader
	if body != nil {
		b, _ := json.Marshal(body)
		rd = bytes.NewReader(b)
	}
	req, _ := http.NewRequest(method, base+path, rd)
	req.Header.Set("Content-Type", "application/json")
	if tok != "" {
		req.Header.Set("Authorization", "Bearer "+tok)
	}
	resp, err := commHTTP.Do(req)
	if err != nil {
		return nil, fmt.Errorf("could not reach the Pitlane HQ server: %w", err)
	}
	defer resp.Body.Close()
	b, _ := io.ReadAll(io.LimitReader(resp.Body, 16<<20))
	if resp.StatusCode >= 300 {
		var e struct{ Error string }
		json.Unmarshal(b, &e)
		if e.Error == "" {
			e.Error = fmt.Sprintf("the server answered HTTP %d", resp.StatusCode)
		}
		return nil, errors.New(e.Error)
	}
	return b, nil
}

// ensureRegistered gets a device token the first time something is shared.
func ensureRegistered() error {
	if commToken() != "" {
		return nil
	}
	commMu.Lock()
	has, alias := commCfg.Token != "", commCfg.Alias
	commMu.Unlock()
	if has {
		return nil
	}
	b, err := commCall("POST", "/register", map[string]string{"alias": alias}, false)
	if err != nil {
		return err
	}
	var r struct{ ID, Token string }
	json.Unmarshal(b, &r)
	if r.Token == "" {
		return errors.New("registration failed")
	}
	commMu.Lock()
	commCfg.UserID, commCfg.Token = r.ID, r.Token
	saveCommLocked()
	commMu.Unlock()
	return nil
}

func commNote(err error) {
	commMu.Lock()
	if err != nil {
		commCfg.LastErr = err.Error()
	} else {
		commCfg.LastErr = ""
		commCfg.Shared++
	}
	saveCommLocked()
	commMu.Unlock()
}

// shareLap: called for every valid lap; sends it only when it beats what you shared for that car and track.
func shareLap(l cloudLap) {
	commMu.Lock()
	on, traces := commCfg.ShareTimes, commCfg.ShareTraces
	commMu.Unlock()
	if !on || !l.Valid {
		return
	}
	c := currentCarTrack(sessionYAML())
	if c.CarID == 0 || c.TrackID == 0 {
		return
	}
	key := fmt.Sprintf("%d:%d", c.CarID, c.TrackID)
	commMu.Lock()
	if b, ok := commBest[key]; ok && b <= l.Time {
		commMu.Unlock()
		return
	}
	commBest[key] = l.Time
	commMu.Unlock()
	go func() {
		if err := ensureRegistered(); err != nil {
			commNote(err)
			return
		}
		body := map[string]any{"carId": c.CarID, "car": c.Car, "trackId": c.TrackID, "track": c.Track, "time": l.Time, "sectors": l.Sectors}
		if traces && l.Trace != nil {
			body["trace"] = l.Trace
		}
		_, err := commCall("POST", "/laps", body, true)
		commNote(err)
	}()
}

// shareReport sends a race analysis without the other drivers' names.
func shareReport(r *raceReport) {
	commMu.Lock()
	on := commCfg.ShareReports
	commMu.Unlock()
	if !on {
		return
	}
	cp := *r
	cp.Results = nil
	for _, x := range r.Results {
		if !x.Me {
			x.Name = "P" + strconv.Itoa(x.Pos)
		}
		cp.Results = append(cp.Results, x)
	}
	cp.Brakes = nil
	for _, b := range r.Brakes {
		if !b.Me {
			b.Name = "P" + strconv.Itoa(b.Pos)
		}
		cp.Brakes = append(cp.Brakes, b)
	}
	cp.Posted = false
	go func() {
		if err := ensureRegistered(); err != nil {
			commNote(err)
			return
		}
		_, err := commCall("POST", "/reports", map[string]any{"report": cp}, true)
		commNote(err)
	}()
}

func registerCommunityRoutes(mux *http.ServeMux) {
	mux.HandleFunc("/api/community", func(w http.ResponseWriter, r *http.Request) {
		fail := func(err error) {
			w.WriteHeader(400)
			writeJSON(w, map[string]string{"error": err.Error()})
		}
		if r.Method == http.MethodPost {
			var in struct {
				Action, Alias, URL, NameKind          string
				ShareTimes, ShareTraces, ShareReports bool
			}
			json.NewDecoder(io.LimitReader(r.Body, 4096)).Decode(&in)
			switch in.Action {
			case "save":
				in.URL = strings.TrimSpace(in.URL)
				if in.URL != "" {
					if u, err := url.Parse(in.URL); err != nil || u.Scheme != "https" && !strings.HasPrefix(u.Host, "localhost") {
						fail(errors.New("the community server must be an https:// address"))
						return
					}
				}
				if in.NameKind == "iracing" {
					n, err := iracingName()
					if err != nil {
						fail(err)
						return
					}
					in.Alias = n
				} else {
					in.NameKind = "nick"
				}
				commMu.Lock()
				oldAlias := commCfg.Alias
				commCfg.NameKind = in.NameKind
				commCfg.Alias, commCfg.URL = cleanText(in.Alias, 32), in.URL
				commCfg.ShareTimes, commCfg.ShareTraces, commCfg.ShareReports = in.ShareTimes, in.ShareTraces && in.ShareTimes, in.ShareReports
				saveCommLocked()
				reg := commCfg.Token != "" && oldAlias != commCfg.Alias
				alias := commCfg.Alias
				commMu.Unlock()
				if reg {
					commCall("POST", "/me", map[string]string{"alias": alias}, true)
				}
			case "deleteAll":
				if _, err := commCall("DELETE", "/me", nil, true); err != nil && err.Error() != "not registered" {
					fail(err)
					return
				}
				commMu.Lock()
				commCfg.Token, commCfg.UserID, commCfg.Shared = "", "", 0
				commCfg.ShareTimes, commCfg.ShareTraces, commCfg.ShareReports = false, false, false
				commBest = map[string]float64{}
				saveCommLocked()
				commMu.Unlock()
			}
		}
		commMu.Lock()
		c := commCfg
		commMu.Unlock()
		writeJSON(w, map[string]any{"alias": c.Alias, "url": c.URL, "defaultUrl": firstNonEmpty(communityURL, bundledServer()), "ready": commBase() != "", "shareTimes": c.ShareTimes, "shareTraces": c.ShareTraces,
			"shareReports": c.ShareReports, "nameKind": c.NameKind, "account": plStatus()["signedIn"], "registered": c.Token != "", "shared": c.Shared, "error": c.LastErr})
	})
	// read-only proxies to the community server
	proxy := func(path string) http.HandlerFunc {
		return func(w http.ResponseWriter, r *http.Request) {
			p := path
			if id := r.URL.Query().Get("id"); id != "" {
				if strings.ContainsAny(id, "/?#.") || len(id) > 64 {
					http.Error(w, "bad id", 400)
					return
				}
				p += "/" + id
			} else if q := r.URL.Query(); q.Get("trackId") != "" || q.Get("carId") != "" {
				p += "?trackId=" + url.QueryEscape(q.Get("trackId")) + "&carId=" + url.QueryEscape(q.Get("carId"))
			}
			b, err := commCall("GET", p, nil, false)
			if err != nil {
				w.WriteHeader(502)
				writeJSON(w, map[string]string{"error": err.Error()})
				return
			}
			w.Header().Set("Content-Type", "application/json")
			w.Write(b)
		}
	}
	mux.HandleFunc("/api/community/setups", handleCommSetups)
	mux.HandleFunc("/api/community/combos", proxy("/combos"))
	mux.HandleFunc("/api/community/laps", proxy("/laps"))
	mux.HandleFunc("/api/community/reports", proxy("/reports"))
}

// ---------- shared setups: .sto files that the app installs for you ----------

var (
	setupCarRe  = regexp.MustCompile(`^[A-Za-z0-9 _.\-]{1,80}$`)
	setupNameRe = regexp.MustCompile(`[^A-Za-z0-9 _\-()+.,]`)
)

const maxSetupSize = 400 << 10

func cleanSetupName(n string) string {
	n = strings.TrimSuffix(strings.TrimSpace(n), ".sto")
	n = strings.Trim(setupNameRe.ReplaceAllString(n, ""), " .")
	if len(n) > 60 {
		n = n[:60]
	}
	if n == "" {
		n = "setup"
	}
	return n
}

// installSetup writes a downloaded setup to Documents\iRacing\setups\<car>\Pitlane Community.
// Only .sto files inside the setups folder are ever written; nothing is run.
func installSetup(root, carPath, name, author string, data []byte) (string, error) {
	if root == "" {
		return "", errors.New("iRacing setups folder not found (Documents\\iRacing\\setups)")
	}
	if !setupCarRe.MatchString(carPath) || strings.Contains(carPath, "..") {
		return "", errors.New("unknown car folder")
	}
	if len(data) == 0 || len(data) > maxSetupSize {
		return "", errors.New("setup file missing or too large")
	}
	dir := filepath.Join(root, carPath, "Pitlane Community")
	if rel, err := filepath.Rel(root, dir); err != nil || strings.HasPrefix(rel, "..") {
		return "", errors.New("bad folder")
	}
	if err := os.MkdirAll(dir, 0o755); err != nil {
		return "", err
	}
	base := cleanSetupName(name)
	if a := cleanSetupName(author); author != "" && a != "setup" {
		base += " (" + a + ")"
	}
	p := filepath.Join(dir, base+".sto")
	for i := 2; ; i++ {
		if old, err := os.ReadFile(p); err != nil {
			break
		} else if bytes.Equal(old, data) {
			return p, nil // already installed
		}
		p = filepath.Join(dir, fmt.Sprintf("%s %d.sto", base, i))
	}
	return p, os.WriteFile(p, data, 0o644)
}

func handleCommSetups(w http.ResponseWriter, r *http.Request) {
	fail := func(code int, err error) {
		w.WriteHeader(code)
		writeJSON(w, map[string]string{"error": err.Error()})
	}
	root := setupsRoot()
	if r.Method != http.MethodPost {
		q := r.URL.Query()
		v := url.Values{}
		for _, k := range []string{"car", "track", "q"} {
			if x := q.Get(k); x != "" {
				v.Set(k, x)
			}
		}
		path := "/setups"
		if q.Get("mine") == "1" {
			path = "/setups/mine"
		}
		if len(v) > 0 {
			path += "?" + v.Encode()
		}
		b, err := commCall("GET", path, nil, q.Get("mine") == "1")
		if err != nil {
			fail(502, err)
			return
		}
		w.Header().Set("Content-Type", "application/json")
		w.Write(b)
		return
	}
	var in struct {
		Action, Key, ID, Notes, Track, Name string
	}
	json.NewDecoder(io.LimitReader(r.Body, 8192)).Decode(&in)
	idOK := in.ID != "" && len(in.ID) <= 64 && !strings.ContainsAny(in.ID, "/?#.")
	switch in.Action {
	case "share":
		p, ok := safeSetupPath(root, in.Key)
		if !ok || !strings.EqualFold(filepath.Ext(p), ".sto") {
			fail(400, errors.New("unknown setup"))
			return
		}
		data, err := os.ReadFile(p)
		if err != nil || len(data) == 0 || len(data) > maxSetupSize {
			fail(400, errors.New("could not read the setup (max 400 KB)"))
			return
		}
		car := strings.SplitN(in.Key, "/", 2)[0]
		carName := car
		carsMu.Lock()
		if n := cars.Seen[car]; n != "" {
			carName = n
		}
		carsMu.Unlock()
		name := in.Name
		if name == "" {
			name = strings.TrimSuffix(filepath.Base(p), filepath.Ext(p))
		}
		if err := ensureRegistered(); err != nil {
			fail(400, err)
			return
		}
		sum := sha256.Sum256(data)
		b, err := commCall("POST", "/setups", map[string]any{"carPath": car, "car": carName, "track": cleanText(in.Track, 80), "name": cleanSetupName(name),
			"notes": cleanText(in.Notes, 1000), "data": base64.StdEncoding.EncodeToString(data), "sha": hex.EncodeToString(sum[:])}, true)
		if err != nil {
			fail(400, err)
			return
		}
		w.Header().Set("Content-Type", "application/json")
		w.Write(b)
	case "install":
		if !idOK {
			fail(400, errors.New("bad id"))
			return
		}
		b, err := commCall("GET", "/setups/"+in.ID, nil, false)
		if err != nil {
			fail(502, err)
			return
		}
		var s struct {
			CarPath, Name, Alias, Data, Sha string
		}
		json.Unmarshal(b, &s)
		data, err := base64.StdEncoding.DecodeString(s.Data)
		if err != nil {
			fail(400, errors.New("damaged setup"))
			return
		}
		if s.Sha != "" {
			if sum := sha256.Sum256(data); hex.EncodeToString(sum[:]) != s.Sha {
				fail(400, errors.New("the download does not match its checksum"))
				return
			}
		}
		p, err := installSetup(root, s.CarPath, s.Name, s.Alias, data)
		if err != nil {
			fail(400, err)
			return
		}
		rel, _ := filepath.Rel(root, p)
		writeJSON(w, map[string]string{"installed": filepath.ToSlash(rel)})
	case "delete":
		if !idOK {
			fail(400, errors.New("bad id"))
			return
		}
		if _, err := commCall("DELETE", "/setups/"+in.ID, nil, true); err != nil {
			fail(400, err)
			return
		}
		writeJSON(w, map[string]bool{"deleted": true})
	default:
		fail(400, errors.New("unknown action"))
	}
}

// bundledServer is the Pitlane HQ server written in web/dist/server.json
// (the same file the phone apps read), so the address lives in one place.
var bundledServerOnce sync.Once
var bundledServerURL string

func bundledServer() string {
	bundledServerOnce.Do(func() {
		if b, err := fs.ReadFile(webFS, "web/dist/server.json"); err == nil {
			var c struct{ URL string }
			json.Unmarshal(b, &c)
			bundledServerURL = strings.TrimRight(strings.TrimSpace(c.URL), "/")
		}
	})
	return bundledServerURL
}

func firstNonEmpty(v ...string) string {
	for _, s := range v {
		if s != "" {
			return s
		}
	}
	return ""
}
