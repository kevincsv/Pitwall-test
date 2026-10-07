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
	"log"
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
	Anonymous    bool   `json:"anonymous,omitempty"`   // others see "Anonymous" instead of the name
	DeleteAfter  string `json:"deleteAfter,omitempty"` // shared race analyses leave this PC: "now", "1d", "2d", "7d" ("" keeps them)
	Asked        bool   `json:"asked,omitempty"`       // the first-start question was answered
	NoMaps       bool   `json:"noMaps,omitempty"`      // do not share track layouts (shared by default)
	NoLive       bool   `json:"noLive,omitempty"`      // do not offer live telemetry to my browsers and phones through the server
	// DRINKS mode, formerly Friday night mode (admins only): friends drive on this PC and their laps go to the
	// community under their own names, so the model learns from them; they stay out of My laps
	Friday    bool     `json:"friday,omitempty"`
	Guest     string   `json:"guest,omitempty"`     // who is driving now ("" = me)
	GuestAuto bool     `json:"guestAuto,omitempty"` // take the name from iRacing (each friend in their own iRacing account)
	Guests    []string `json:"guests,omitempty"`    // names used before, for a quick pick
}

var (
	commMu     sync.Mutex
	commCfg    commConfig
	commHTTP   = &http.Client{Transport: tlsTransport(), Timeout: 25 * time.Second}
	commBest   = map[string]float64{} // carId:trackId → best shared this run
	commTraced = map[string]bool{}    // … and whether it went with its telemetry
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
	if u == "" { // your own Pitlane HQ Cloud site is also your server
		cloudMu.Lock()
		u = cloudCfg.URL
		cloudMu.Unlock()
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

// setDrinks turns DRINKS mode (Friday night mode) on or off and sets who is driving. Admins
// only; used by the PC app and by your phone through the encrypted live link.
func setDrinks(on bool, guest string, auto bool) error {
	loadPL()
	plMu.Lock()
	admin := plAcc.Admin
	plMu.Unlock()
	if !admin {
		return errors.New("only the admins of the server can use DRINKS mode")
	}
	g := cleanText(guest, 32)
	commMu.Lock()
	defer commMu.Unlock()
	commCfg.Friday, commCfg.Guest, commCfg.GuestAuto = on, g, auto
	if g != "" {
		list := []string{g}
		for _, x := range commCfg.Guests {
			if !strings.EqualFold(x, g) && len(list) < 30 {
				list = append(list, x)
			}
		}
		commCfg.Guests = list
	}
	saveCommLocked()
	return nil
}

// drinksState is what the phone shows of DRINKS mode.
func drinksState() map[string]any {
	loadPL()
	plMu.Lock()
	admin := plAcc.Admin
	plMu.Unlock()
	commMu.Lock()
	c := commCfg
	guests := append([]string{}, c.Guests...)
	commMu.Unlock()
	return map[string]any{"admin": admin, "on": c.Friday, "guest": c.Guest, "guestAuto": c.GuestAuto, "guests": guests, "driver": fridayDriver()}
}

// shareLap: called for every valid lap; sends it only when it beats what you shared for that car and track.
// fridayDriver: on Friday night mode, the friend driving now; "" when it is the account owner.
func fridayDriver() string {
	loadPL()
	plMu.Lock()
	admin, signed, own := plAcc.Admin, plAcc.Token != "", plAcc.Display
	plMu.Unlock()
	commMu.Lock()
	on, name, auto := commCfg.Friday, commCfg.Guest, commCfg.GuestAuto
	commMu.Unlock()
	if !on || !admin || !signed {
		return ""
	}
	if auto {
		y := sessionYAML()
		name = ""
		if d := driverBlock(y, yamlField(y, "DriverCarIdx")); d != "" {
			name = yamlField(d, "UserName")
		}
		if own != "" && strings.EqualFold(own, name) { // the owner driving: their own laps as usual
			name = ""
		}
	}
	return cleanText(name, 32)
}

func shareLap(l cloudLap) {
	commMu.Lock()
	on, traces, anon := commCfg.ShareTimes, commCfg.ShareTraces, commCfg.Anonymous
	commMu.Unlock()
	if tel.isDemo() { // the demo race is never shared
		return
	}
	guest := fridayDriver()
	if guest != "" { // a friend's lap: always shared with its telemetry, under their name
		on, traces, anon = true, true, false
	}
	if !on || !l.Valid {
		return
	}
	c := currentCarTrack(sessionYAML())
	if c.CarID == 0 || c.TrackID == 0 {
		return
	}
	game := currentGame()
	key := gameKey(game, c.CarID, c.TrackID) + "|" + guest
	commMu.Lock()
	// a slower lap still goes when the faster one went without its telemetry and this one has it
	withTrace := traces && l.Trace != nil
	if b, ok := commBest[key]; ok && b <= l.Time && (commTraced[key] || !withTrace) {
		commMu.Unlock()
		return
	}
	commBest[key] = l.Time
	commTraced[key] = withTrace
	commMu.Unlock()
	go func() {
		if err := ensureRegistered(); err != nil {
			commNote(err)
			return
		}
		body := map[string]any{"carId": c.CarID, "car": c.Car, "trackId": c.TrackID, "track": c.Track, "time": l.Time, "sectors": l.Sectors, "anon": anon, "game": game}
		if guest != "" {
			body["guest"] = guest
		}
		if traces && l.Trace != nil {
			body["trace"] = l.Trace
		}
		_, err := commCall("POST", "/laps", body, true)
		commNote(err)
	}()
}

// shareReport sends a race analysis without the other drivers' names.
// shareRaceReports: sharing race analyses with the community is switched off for now
var shareRaceReports = false

func shareReport(r *raceReport) {
	if !shareRaceReports {
		return
	}
	commMu.Lock()
	on, anon := commCfg.ShareReports, commCfg.Anonymous
	commMu.Unlock()
	if !on {
		return
	}
	cp := *r
	// the other drivers by their first name only; you by your name, or "Anonymous" when you share anonymously
	name := func(n string, me bool, pos int) string {
		if me {
			if anon {
				return "Anonymous"
			}
			return n
		}
		if f := strings.Fields(n); len(f) > 0 {
			return f[0]
		}
		return "P" + strconv.Itoa(pos)
	}
	cp.Results = nil
	for _, x := range r.Results {
		x.Name = name(x.Name, x.Me, x.Pos)
		cp.Results = append(cp.Results, x)
	}
	cp.Brakes = nil
	for _, b := range r.Brakes {
		b.Name = name(b.Name, b.Me, b.Pos)
		cp.Brakes = append(cp.Brakes, b)
	}
	cp.Posted = false
	go func() {
		if err := ensureRegistered(); err != nil {
			commNote(err)
			return
		}
		_, err := commCall("POST", "/reports", map[string]any{"report": cp, "anon": anon, "game": firstNonEmpty(cp.Game, "iracing")}, true)
		commNote(err)
	}()
}

// pruneShared removes race analyses already shared with the community from this PC, after the chosen time.
func pruneShared() {
	commMu.Lock()
	after, on := commCfg.DeleteAfter, commCfg.ShareReports
	commMu.Unlock()
	keep := map[string]time.Duration{"now": 0, "1d": 24 * time.Hour, "2d": 48 * time.Hour, "7d": 7 * 24 * time.Hour}
	d, ok := keep[after]
	if !ok || !on {
		return
	}
	journalMu.Lock()
	defer journalMu.Unlock()
	kept := races[:0]
	n := 0
	for _, x := range races {
		if t := raceTime(x); !t.IsZero() && time.Since(t) >= d {
			n++
			continue
		}
		kept = append(kept, x)
	}
	if n > 0 {
		races = kept
		writeJSONFile(journalFile("races.json"), races)
		log.Printf("Removed %d shared race analyses from this PC", n)
	}
}

func shareCleaner() {
	for {
		time.Sleep(10 * time.Minute)
		pruneShared()
	}
}

func registerCommunityRoutes(mux *http.ServeMux) {
	go shareCleaner()
	mux.HandleFunc("/api/community", func(w http.ResponseWriter, r *http.Request) {
		fail := func(err error) {
			w.WriteHeader(400)
			writeJSON(w, map[string]string{"error": err.Error()})
		}
		if r.Method == http.MethodPost {
			var in struct {
				Action, Alias, URL, NameKind, DeleteAfter        string
				ShareTimes, ShareTraces, ShareReports, Anonymous bool
				ShareMaps, LiveWeb                               *bool
				Friday, GuestAuto                                bool
				Guest                                            string
				SessionID, LapID                                 string
				Anon                                             bool
				As, IracingName                                  string
			}
			json.NewDecoder(io.LimitReader(r.Body, 4096)).Decode(&in)
			switch in.Action {
			case "nameCheck": // a DRINKS driver name: free on the platform?
				b, err := commCall("POST", "/name-check", map[string]any{"name": in.Guest}, true)
				if err != nil {
					fail(err)
					return
				}
				w.Header().Set("Content-Type", "application/json")
				w.Write(b)
				return
			case "shareLap": // a lap of your account to the community: the server takes it from the account
				b, err := commCall("POST", "/share-lap", map[string]any{"sessionId": in.SessionID, "lapId": in.LapID, "anon": in.Anon, "as": in.As, "iracingName": in.IracingName}, true)
				if err != nil {
					fail(err)
					return
				}
				w.Header().Set("Content-Type", "application/json")
				w.Write(b)
				return
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
				commCfg.Anonymous, commCfg.Asked = in.Anonymous, true
				if in.ShareMaps != nil {
					commCfg.NoMaps = !*in.ShareMaps
				}
				if in.LiveWeb != nil {
					commCfg.NoLive = !*in.LiveWeb
				}
				switch in.DeleteAfter {
				case "now", "1d", "2d", "7d":
					commCfg.DeleteAfter = in.DeleteAfter
				default:
					commCfg.DeleteAfter = ""
				}
				saveCommLocked()
				reg := commCfg.Token != "" && oldAlias != commCfg.Alias
				alias := commCfg.Alias
				commMu.Unlock()
				if reg {
					commCall("POST", "/me", map[string]string{"alias": alias}, true)
				}
			case "friday":
				if err := setDrinks(in.Friday, in.Guest, in.GuestAuto); err != nil {
					fail(err)
					return
				}
			case "deleteAll":
				if _, err := commCall("DELETE", "/me", nil, true); err != nil && err.Error() != "not registered" {
					fail(err)
					return
				}
				commMu.Lock()
				commCfg.Token, commCfg.UserID, commCfg.Shared = "", "", 0
				commCfg.ShareTimes, commCfg.ShareTraces, commCfg.ShareReports = false, false, false
				commBest, commTraced = map[string]float64{}, map[string]bool{}
				saveCommLocked()
				commMu.Unlock()
			}
		}
		commMu.Lock()
		c := commCfg
		commMu.Unlock()
		writeJSON(w, map[string]any{"alias": c.Alias, "url": c.URL, "defaultUrl": firstNonEmpty(communityURL, bundledServer()), "server": commBase(), "ready": commBase() != "", "shareTimes": c.ShareTimes, "shareTraces": c.ShareTraces,
			"shareReports": c.ShareReports, "shareMaps": !c.NoMaps, "liveWeb": !c.NoLive, "live": liveStatus(), "friday": c.Friday, "guest": c.Guest, "guestAuto": c.GuestAuto, "guests": c.Guests, "fridayDriver": fridayDriver(), "anonymous": c.Anonymous, "deleteAfter": c.DeleteAfter, "asked": c.Asked, "nameKind": c.NameKind, "account": plStatus()["signedIn"], "registered": c.Token != "", "shared": c.Shared, "error": c.LastErr})
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
				p += "?trackId=" + url.QueryEscape(q.Get("trackId")) + "&carId=" + url.QueryEscape(q.Get("carId")) + "&game=" + url.QueryEscape(q.Get("game"))
			} else if g := r.URL.Query().Get("game"); g != "" {
				p += "?game=" + url.QueryEscape(g)
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
	mux.HandleFunc("/api/trackmap", handleTrackMap)
	mux.HandleFunc("/api/community/season", proxy("/season"))
	mux.HandleFunc("/api/community/combos", proxy("/combos"))
	mux.HandleFunc("/api/community/laps", proxy("/laps"))
	mux.HandleFunc("/api/community/model", proxy("/model"))
	mux.HandleFunc("/api/community/reports", proxy("/reports"))
	mux.HandleFunc("/api/community/admin", handleCommAdmin)
}

// POST /api/community/admin {kind, id, game}: an admin of the server removes something shared
func handleCommAdmin(w http.ResponseWriter, r *http.Request) {
	if r.Method != http.MethodPost {
		http.Error(w, "POST only", http.StatusMethodNotAllowed)
		return
	}
	var in struct{ Kind, ID, Game, Action string }
	json.NewDecoder(io.LimitReader(r.Body, 1024)).Decode(&in)
	switch in.Kind {
	case "laps", "reports", "setups", "trackmaps":
	default:
		http.Error(w, "unknown kind", http.StatusBadRequest)
		return
	}
	plMu.Lock()
	tok := plAcc.Token
	plMu.Unlock()
	if tok == "" {
		w.WriteHeader(http.StatusForbidden)
		writeJSON(w, map[string]string{"error": "sign in with your Pitlane HQ account"})
		return
	}
	method, path := "DELETE", "/community/admin/"+in.Kind+"/"+url.PathEscape(in.ID)+"?game="+url.QueryEscape(in.Game)
	if in.Action == "uncut" && in.Kind == "reports" { // every lap of a shared analysis valid again
		method, path = "POST", "/community/admin/reports/"+url.PathEscape(in.ID)+"/uncut"
	}
	b, err := commRequest(method, path, nil, tok)
	if err != nil {
		w.WriteHeader(http.StatusBadGateway)
		writeJSON(w, map[string]string{"error": err.Error()})
		return
	}
	w.Header().Set("Content-Type", "application/json")
	w.Write(b)
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
		for _, k := range []string{"car", "track", "q", "game"} {
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

func raceTime(r *raceReport) time.Time {
	if r == nil || r.When <= 0 {
		return time.Time{}
	}
	return time.UnixMilli(r.When)
}

// handleTrackMap: GET the community outline of a track; POST this PC's outline from a
// lap without incidents (only the shape, no speed or braking), unless switched off.
func handleTrackMap(w http.ResponseWriter, r *http.Request) {
	if r.Method != http.MethodPost {
		q := r.URL.Query()
		t, _ := strconv.Atoi(q.Get("trackId"))
		if t <= 0 {
			http.Error(w, "trackId", 400)
			return
		}
		b, err := commCall("GET", "/trackmaps?trackId="+strconv.Itoa(t)+"&game="+url.QueryEscape(firstNonEmpty(q.Get("game"), "iracing")), nil, false)
		if err != nil {
			http.Error(w, err.Error(), 404)
			return
		}
		w.Header().Set("Content-Type", "application/json")
		w.Write(b)
		return
	}
	if !isLoopback(r) || isRemote(r) {
		http.Error(w, "only from this PC", 403)
		return
	}
	commMu.Lock()
	off := commCfg.NoMaps
	commMu.Unlock()
	if off {
		writeJSON(w, map[string]string{"kept": "sharing track layouts is off"})
		return
	}
	var in map[string]any
	if err := json.NewDecoder(io.LimitReader(r.Body, 2<<20)).Decode(&in); err != nil {
		http.Error(w, "bad layout", 400)
		return
	}
	// only these fields go to the server: the outline and which lap it came from
	out := map[string]any{"game": "iracing", "clean": in["clean"] == true}
	for _, k := range []string{"trackId", "track", "time", "n", "len", "x", "y"} {
		out[k] = in[k]
	}
	go func() {
		if err := ensureRegistered(); err != nil {
			commNote(err)
			return
		}
		_, err := commCall("POST", "/trackmaps", out, true)
		commNote(err)
	}()
	writeJSON(w, map[string]bool{"sending": true})
}

// ---------- the shape of the track, from your own laps ----------

// commLayoutBest: the lap time of the layout the community already has per track (-1: none), so a
// slower lap is never sent; filled the first time a track is seen in this run.
var commLayoutBest = map[int]float64{}

// shareLayout sends the outline of a valid lap (only its x/y points) to the community when it is
// faster than the layout everyone already has. iRacing only, and never when sharing layouts is off:
// it is what draws the track map in the analyzer, the coach, the race summaries and the phone apps.
func shareLayout(l cloudLap, s cloudSession) {
	if tel.isDemo() || currentGame() != "iracing" || l.Trace == nil || len(l.Trace.X) < 100 || len(l.Trace.X) > 3000 || !(l.Time > 10) {
		return
	}
	commMu.Lock()
	off := commCfg.NoMaps
	commMu.Unlock()
	if off {
		return
	}
	y := sessionYAML()
	c := currentCarTrack(y)
	if c.TrackID == 0 {
		return
	}
	n := len(l.Trace.X)
	body := map[string]any{"game": "iracing", "clean": true, "trackId": c.TrackID, "track": c.Track, "time": l.Time, "n": n,
		"len": trackLengthM(y), "x": l.Trace.X, "y": l.Trace.Y}
	go func() {
		commMu.Lock()
		best, known := commLayoutBest[c.TrackID]
		commMu.Unlock()
		if !known {
			best = -1
			if b, err := commCall("GET", "/trackmaps?trackId="+strconv.Itoa(c.TrackID)+"&game=iracing", nil, false); err == nil {
				var m struct {
					Time float64 `json:"time"`
				}
				if json.Unmarshal(b, &m) == nil && m.Time > 0 {
					best = m.Time
				}
			}
		}
		if best > 0 && best <= l.Time {
			commMu.Lock()
			commLayoutBest[c.TrackID] = best
			commMu.Unlock()
			return
		}
		commMu.Lock()
		commLayoutBest[c.TrackID] = l.Time
		commMu.Unlock()
		if err := ensureRegistered(); err != nil {
			commNote(err)
			return
		}
		_, err := commCall("POST", "/trackmaps", body, true)
		commNote(err)
	}()
}

// trackLengthM: the track length from the session info ("5.80 km", "2.5 mi"), 0 when unknown.
func trackLengthM(y string) float64 {
	f := strings.Fields(yamlField(y, "TrackLength"))
	if len(f) == 0 {
		return 0
	}
	v := atof(f[0])
	if len(f) > 1 && strings.HasPrefix(f[1], "mi") {
		v *= 1609.34
	} else {
		v *= 1000
	}
	return v
}
