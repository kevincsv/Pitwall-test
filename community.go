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
	ShareCode    string `json:"shareCode,omitempty"`   // the code others type to watch your live telemetry (empty: not shared)
	NoField      bool   `json:"noField,omitempty"`     // do not share the top 3 of each race anonymously (shared by default, times only)
	// DRINKS mode, formerly Friday night mode (admins only): friends drive on this PC and their laps go to the
	// community under their own names, so the model learns from them; they stay out of My laps
	Friday    bool     `json:"friday,omitempty"`
	Guest     string   `json:"guest,omitempty"`     // who is driving now ("" = me)
	GuestAuto bool     `json:"guestAuto,omitempty"` // take the name from iRacing (each friend in their own iRacing account)
	Guests    []string `json:"guests,omitempty"`    // names used before, for a quick pick
}

var (
	commMu   sync.Mutex
	commCfg  commConfig
	commHTTP = &http.Client{Transport: tlsTransport(), Timeout: 25 * time.Second}
	// a session with every lap's telemetry (/api/sessions/:id?traces=1) can take longer than 25 s on a slow line
	commHTTPLong = &http.Client{Transport: tlsTransport(), Timeout: 3 * time.Minute}
	commBest     = map[string]float64{} // carId:trackId → best shared this run
	commTraced   = map[string]bool{}    // … and whether it went with its telemetry
)

func commPath() string { return filepath.Join(activeDir(), "community.json") }

func loadCommunity() {
	c := commConfig{}
	if b, err := readSecret(commPath()); err == nil {
		json.Unmarshal(b, &c)
	}
	// the laps, their telemetry, the layouts, the race rivals' best laps and the live link always go, as on the web: there
	// is no switch to leave them out (the race analyses keep their own setting)
	c.ShareTimes, c.ShareTraces, c.NoField, c.NoMaps, c.NoLive = true, true, false, false, false
	commMu.Lock()
	commCfg = c
	commMu.Unlock()
}

func saveCommLocked() {
	b, _ := json.Marshal(commCfg)
	writeSecret(commPath(), b)
}

func commBase() string {
	if u := localServer(); u != "" { // local mode: the server on this PC (localmode.go)
		return u
	}
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

// clientTag tells the server which app asks (the admin page's Online tab): the agent by itself ("pc") or as the engine
// of the Pitlane HQ window ("desktop"), with the version
// clientTag: which app this is, for the server (presence, the admin page's Online tab): the version and the build
func clientTag() string {
	v := appVersion
	if buildID != "dev" && len(buildID) >= 7 {
		v += "+" + buildID[:7]
	}
	if engineMode {
		return "desktop/" + v
	}
	return "pc/" + v
}

// commMaxAnswer: the biggest answer read from the server (a session with every lap's telemetry is tens of MB); a bigger
// one is an error, never a cut answer that fails to parse further on
const commMaxAnswer = 64 << 20

// readCapped reads all of r, or fails when it holds more than max bytes
func readCapped(r io.Reader, max int64) ([]byte, error) {
	b, err := io.ReadAll(io.LimitReader(r, max+1))
	if err != nil {
		return nil, fmt.Errorf("the server's answer was cut: %w", err)
	}
	if int64(len(b)) > max {
		return nil, fmt.Errorf("the server's answer is bigger than %d MB", max>>20)
	}
	return b, nil
}

// proxyPath: the community server's address for a read-only proxy of the app's page; ?id= becomes the path's last part
// and every other parameter of the query goes through as it came (limit, game, trackId…). ok is false for a bad id
func proxyPath(path string, q url.Values) (string, bool) {
	p := path
	if id := q.Get("id"); id != "" {
		if strings.ContainsAny(id, "/?#.") || len(id) > 64 {
			return "", false
		}
		p += "/" + id
	}
	rest := url.Values{}
	for k, v := range q {
		if k != "id" {
			rest[k] = v
		}
	}
	if len(rest) > 0 {
		p += "?" + rest.Encode()
	}
	return p, true
}

func commRequest(method, path string, body any, tok string) ([]byte, error) {
	return commRequestWith(commHTTP, method, path, body, tok)
}

func commRequestWith(client *http.Client, method, path string, body any, tok string) ([]byte, error) {
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
	req.Header.Set("X-Pitlane-Client", clientTag())
	if tok != "" {
		req.Header.Set("Authorization", "Bearer "+tok)
	}
	resp, err := client.Do(req)
	if err != nil {
		return nil, fmt.Errorf("could not reach the Pitlane HQ server: %w", err)
	}
	defer resp.Body.Close()
	if nb := resp.Header.Get("X-Pitlane-Build"); nb != "" {
		updateNudge(nb) // the server names the newest build: a PC behind checks for its update at once
	}
	b, rerr := readCapped(resp.Body, commMaxAnswer)
	if rerr != nil && resp.StatusCode < 300 {
		return nil, rerr
	}
	if resp.StatusCode >= 300 {
		var e struct{ Error string }
		json.Unmarshal(b, &e)
		if e.Error == "" {
			e.Error = fmt.Sprintf("the server answered HTTP %d", resp.StatusCode)
		}
		return nil, httpErr{resp.StatusCode, e.Error}
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
			if !strings.EqualFold(x, g) && len(list) < 60 {
				list = append(list, x)
			}
		}
		commCfg.Guests = list
	}
	saveCommLocked()
	return nil
}

// renameGuest gives a DRINKS driver another name: on the server (the same driver and laps under the new name)
// and in this PC's list. Admins only.
func renameGuest(from, to string) error {
	loadPL()
	plMu.Lock()
	admin := plAcc.Admin
	plMu.Unlock()
	if !admin {
		return errors.New("only the admins of the server can use DRINKS mode")
	}
	from, to = cleanText(from, 32), cleanText(to, 32)
	if from == "" || to == "" {
		return errors.New("a name is needed")
	}
	if _, err := commCall("POST", "/guest-rename", map[string]string{"from": from, "to": to}, true); err != nil && err.Error() != "not registered" {
		return err
	}
	commMu.Lock()
	defer commMu.Unlock()
	for i, x := range commCfg.Guests {
		if strings.EqualFold(x, from) {
			commCfg.Guests[i] = to
		}
	}
	if strings.EqualFold(commCfg.Guest, from) {
		commCfg.Guest = to
	}
	saveCommLocked()
	go renameRaceDriver(from, to) // and in the race summaries
	return nil
}

// forgetGuest takes a DRINKS driver off this PC's list; what they shared stays on the server.
func forgetGuest(name string) error {
	loadPL()
	plMu.Lock()
	admin := plAcc.Admin
	plMu.Unlock()
	if !admin {
		return errors.New("only the admins of the server can use DRINKS mode")
	}
	commMu.Lock()
	defer commMu.Unlock()
	list := commCfg.Guests[:0]
	for _, x := range commCfg.Guests {
		if !strings.EqualFold(x, name) {
			list = append(list, x)
		}
	}
	commCfg.Guests = list
	if strings.EqualFold(commCfg.Guest, name) {
		commCfg.Guest = ""
	}
	saveCommLocked()
	return nil
}

// restoreGuests brings this account's DRINKS drivers back from the server (every friend who ever shared a lap
// from this PC, /community/guests): a list lost on this PC comes back. Admins only; by itself when the list is
// empty or every 30 minutes, at once when forced ("Recover the drivers from the server").
var guestsSyncAt time.Time

func restoreGuests(force bool) error {
	loadPL()
	plMu.Lock()
	admin, signed := plAcc.Admin, plAcc.Token != ""
	plMu.Unlock()
	if !admin || !signed {
		return nil
	}
	commMu.Lock()
	due := force || len(commCfg.Guests) == 0 || time.Since(guestsSyncAt) > 30*time.Minute
	commMu.Unlock()
	if !due {
		return nil
	}
	commMu.Lock()
	guestsSyncAt = time.Now()
	commMu.Unlock()
	b, err := commCall("GET", "/guests", nil, true)
	if err != nil {
		return err
	}
	var r struct {
		Guests []struct {
			Name string `json:"name"`
		} `json:"guests"`
	}
	if json.Unmarshal(b, &r) != nil {
		return errors.New("the server gave no list")
	}
	names := make([]string, 0, len(r.Guests))
	for _, g := range r.Guests {
		names = append(names, g.Name)
	}
	commMu.Lock()
	defer commMu.Unlock()
	if merged, changed := mergeGuests(commCfg.Guests, names); changed {
		commCfg.Guests = merged
		saveCommLocked()
	}
	return nil
}

// mergeGuests adds to the list the names it lacks (a name is the same whatever its case), the list's own
// order first; 60 at most.
func mergeGuests(list, names []string) ([]string, bool) {
	out := append([]string{}, list...)
	changed := false
	for _, n := range names {
		n = cleanText(n, 32)
		if n == "" || len(out) >= 60 {
			continue
		}
		dup := false
		for _, x := range out {
			if strings.EqualFold(x, n) {
				dup = true
				break
			}
		}
		if !dup {
			out, changed = append(out, n), true
		}
	}
	return out, changed
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

// drinksActive: whether DRINKS mode is on (an admin signed in) and who drives now ("" the owner)
func drinksActive() (bool, string) {
	loadPL()
	plMu.Lock()
	admin, signed := plAcc.Admin, plAcc.Token != ""
	plMu.Unlock()
	commMu.Lock()
	on := commCfg.Friday
	commMu.Unlock()
	if !on || !admin || !signed {
		return false, ""
	}
	return true, fridayDriver()
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

// isTestDrive: a test drive (iRacing's "Offline Testing"): anything can happen in one, so its laps
// never go to the leaderboard nor teach the model.
func isTestDrive(kind string) bool { return strings.Contains(strings.ToLower(kind), "test") }

func shareLap(l cloudLap, s cloudSession) {
	if isTestDrive(s.Kind) {
		return
	}
	commMu.Lock()
	on, traces, anon := commCfg.ShareTimes, commCfg.ShareTraces, commCfg.Anonymous
	commMu.Unlock()
	if tel.isDemo() { // the demo race is never shared
		return
	}
	guest := l.Drv   // who drove most of the lap (DRINKS mode), not who is at the wheel now
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
	cls := lapClass(game, c.Class) // Le Mans Ultimate's class of the car (its class board)
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
		body := map[string]any{"carId": c.CarID, "car": c.Car, "trackId": c.TrackID, "track": c.Track, "time": l.Time, "sectors": l.Sectors, "anon": anon, "game": game, "kind": s.Kind}
		if guest == "" && s.Lic != "" { // a friend's lap in DRINKS mode is not of your license
			body["lic"] = s.Lic
		}
		if s.Cat != "" {
			body["cat"] = s.Cat
		}
		if cls != "" {
			body["cls"] = cls
		}
		if s.Official != nil {
			body["official"] = *s.Official
		}
		if s.AI {
			body["ai"] = true
		}
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

// shareFieldTop: after a race, the best lap of every other driver of your class goes to the
// community as an anonymous driver (time, sectors and the speed trace their position gave; iRacing
// sends no one else's pedals, so those are estimated from the speed), when you share your own laps
// and did not switch this off. Needs your account: the server keeps one anonymous driver per real
// driver, so a later faster lap replaces the earlier one.
// fieldShareGame: the games whose rivals' laps go up: iRacing's and Le Mans Ultimate's (LMU names its drivers by a
// stable id made from their name, lmuDriverID); a report without a game is an iRacing one from before
func fieldShareGame(game string) bool { return game == "" || game == "iracing" || game == "lmu" }

func shareFieldTop(r *raceReport) {
	commMu.Lock()
	on := commCfg.ShareTimes
	commMu.Unlock()
	if !on || tel.isDemo() || !fieldShareGame(r.Game) || !accountSignedIn() {
		return
	}
	for _, body := range fieldTopLaps(r) {
		_, err := commCall("POST", "/laps", body, true)
		commNote(err)
	}
}

// linkOwnDriver: the driver at the wheel of this PC is the account's own: the server puts under the account
// the laps other PCs shared of them as a race rival in that game (and the ones still to come). One driver of each
// game per account (ownLinkKey says which); asked once per driver while Pitlane HQ runs, again after a failure a few
// minutes later. In Le Mans Ultimate the server links only once it has seen the name at the wheel on a few days
// (driverlinks.js): while it is not linked yet the PC asks again some hours later, and never after an admin undid it.
var (
	linkMu   sync.Mutex
	linkNext = map[string]time.Time{} // when the PC may ask again; zero: linked (or undone), never again
)

// linkAgain: when the PC asks the server again after its answer to /link-driver (zero: never while it runs)
func linkAgain(b []byte, now time.Time) time.Time {
	var r struct {
		Linked *bool `json:"linked"`
		Undone bool  `json:"undone"`
	}
	if json.Unmarshal(b, &r) != nil || r.Linked == nil || *r.Linked || r.Undone {
		return time.Time{}
	}
	return now.Add(6 * time.Hour)
}

// lmuDefaultNames: the names a Le Mans Ultimate profile has before its driver names it: many people share them, so
// none is ever linked to one account
var lmuDefaultNames = map[string]bool{"player": true, "driver": true, "user": true, "guest": true, "pilot": true, "you": true}

// ownLinkKey: the key the PC links its own driver of a game by ("" when it does not): iRacing's own id; in Le Mans
// Ultimate the id made from the name the game shows (lmuDriverID, what other PCs share that driver's laps under as a
// rival), never a profile's default name nor one of a letter or two
func ownLinkKey(game, userID, name string) string {
	switch game {
	case "iracing":
		return driverKey(userID)
	case "lmu":
		n := strings.ToLower(strings.TrimSpace(name))
		if len([]rune(n)) < 3 || lmuDefaultNames[n] {
			return ""
		}
		return driverKey(userID)
	}
	return ""
}

func linkOwnDriver(game, userID, name string) {
	k := ownLinkKey(game, userID, name)
	if k == "" || tel.isDemo() {
		return
	}
	lk := game + "|" + k
	linkMu.Lock()
	if t, ok := linkNext[lk]; ok && (t.IsZero() || time.Now().Before(t)) {
		linkMu.Unlock()
		return
	}
	linkNext[lk] = time.Now().Add(5 * time.Minute)
	linkMu.Unlock()
	go func() {
		if !accountSignedIn() {
			return
		}
		if b, err := commCall("POST", "/link-driver", map[string]any{"key": k, "game": game}, true); err == nil {
			linkMu.Lock()
			linkNext[lk] = linkAgain(b, time.Now())
			linkMu.Unlock()
		}
	}()
}

// accountSignedIn: this PC is signed in to a Pitlane HQ account.
func accountSignedIn() bool {
	loadPL()
	plMu.Lock()
	defer plMu.Unlock()
	return plAcc.Token != ""
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
// Nothing is shared while shareRaceReports is off, so nothing goes: the setting removed every race older than the
// chosen time from the PC (and through the sync from every device) although none of them had been shared.
func pruneShared() {
	if !shareRaceReports {
		return
	}
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
	// your live telemetry for others, with a code: GET the state, POST {on, new} to start, renew or stop
	mux.HandleFunc("/api/live/share", func(w http.ResponseWriter, r *http.Request) {
		if r.Method == http.MethodPost {
			var in struct{ On, New bool }
			json.NewDecoder(io.LimitReader(r.Body, 1024)).Decode(&in)
			setShare(in.On, in.New)
		}
		writeJSON(w, liveStatus())
	})
	go shareCleaner()
	// a device that pressed Connect: GET the waiting ones, POST {id, ok} with your answer
	mux.HandleFunc("/api/live/ask", func(w http.ResponseWriter, r *http.Request) {
		if r.Method == http.MethodPost {
			var in struct {
				ID string `json:"id"`
				OK bool   `json:"ok"`
			}
			json.NewDecoder(io.LimitReader(r.Body, 1024)).Decode(&in)
			liveAnswer(in.ID, in.OK)
		}
		writeJSON(w, map[string]any{"asks": liveAskList()})
	})
	mux.HandleFunc("/api/community", func(w http.ResponseWriter, r *http.Request) {
		fail := func(err error) {
			w.WriteHeader(400)
			writeJSON(w, map[string]string{"error": err.Error()})
		}
		if r.Method == http.MethodPost {
			var in struct {
				Action, Alias, URL, NameKind, DeleteAfter        string
				ShareTimes, ShareTraces, ShareReports, Anonymous bool
				ShareMaps, LiveWeb, ShareField                   *bool
				Friday, GuestAuto                                bool
				Guest, To                                        string
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
				// signed in, the name is the account's: one public name on every device and on everything
				// shared under it (the server keeps it); a name someone else has is refused here
				in.Alias = cleanText(in.Alias, 32)
				if accountSignedIn() {
					plMu.Lock()
					cur, curKind, curAnon := plAcc.Display, plAcc.NameKind, plAcc.Anon
					plMu.Unlock()
					if in.Alias == "" {
						in.Alias = cur
					}
					if in.Alias != cur || in.NameKind != firstNonEmpty(curKind, "nick") || in.Anonymous != curAnon {
						if _, err := plCall("POST", "/me", map[string]any{"display": in.Alias, "nameKind": in.NameKind, "anon": in.Anonymous}); err != nil {
							fail(err)
							return
						}
						plMu.Lock()
						plAcc.Display, plAcc.NameKind, plAcc.Anon = in.Alias, in.NameKind, in.Anonymous
						savePLLocked()
						plMu.Unlock()
						kickSync()
					}
				}
				signed := accountSignedIn()
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
				if in.ShareField != nil {
					commCfg.NoField = !*in.ShareField
				}
				switch in.DeleteAfter {
				case "now", "1d", "2d", "7d":
					commCfg.DeleteAfter = in.DeleteAfter
				default:
					commCfg.DeleteAfter = ""
				}
				saveCommLocked()
				reg := commCfg.Token != "" && oldAlias != commCfg.Alias && !signed
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
			case "guestRename": // a DRINKS driver gets another name (their laps on the server follow)
				if err := renameGuest(in.Guest, in.To); err != nil {
					fail(err)
					return
				}
			case "guestForget": // off the list of DRINKS drivers (their laps stay on the leaderboards)
				if err := forgetGuest(in.Guest); err != nil {
					fail(err)
					return
				}
			case "guestsRestore": // the list of DRINKS drivers back from the server
				if err := restoreGuests(true); err != nil {
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
		if r.Method == http.MethodGet {
			restoreGuests(false) // a lost list of DRINKS drivers comes back by itself
		}
		commMu.Lock()
		c := commCfg
		commMu.Unlock()
		writeJSON(w, map[string]any{"alias": c.Alias, "url": c.URL, "defaultUrl": firstNonEmpty(communityURL, bundledServer()), "server": commBase(), "ready": commBase() != "", "shareTimes": c.ShareTimes, "shareTraces": c.ShareTraces,
			"shareReports": c.ShareReports, "shareMaps": !c.NoMaps, "liveWeb": !c.NoLive, "shareField": !c.NoField, "live": liveStatus(), "friday": c.Friday, "guest": c.Guest, "guestAuto": c.GuestAuto, "guests": c.Guests, "fridayDriver": fridayDriver(), "anonymous": c.Anonymous, "deleteAfter": c.DeleteAfter, "asked": c.Asked, "nameKind": c.NameKind, "account": plStatus()["signedIn"], "registered": c.Token != "", "shared": c.Shared, "error": c.LastErr})
	})
	// read-only proxies to the community server
	proxy := func(path string) http.HandlerFunc {
		return func(w http.ResponseWriter, r *http.Request) {
			p, ok := proxyPath(path, r.URL.Query())
			if !ok {
				http.Error(w, "bad id", 400)
				return
			}
			// with your account token when you are signed in: the server then marks your own laps as yours
			b, err := commRequest("GET", "/community"+p, nil, commToken())
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
	mux.HandleFunc("/api/turns", handleTurns)
	mux.HandleFunc("/api/pitlane", func(w http.ResponseWriter, r *http.Request) {
		t, _ := strconv.Atoi(r.URL.Query().Get("trackId"))
		b, err := pitLaneQuery(t, firstNonEmpty(r.URL.Query().Get("game"), "iracing"))
		if t <= 0 || err != nil {
			writeJSON(w, map[string]any{"trackId": t, "pts": [][2]float64{}})
			return
		}
		w.Header().Set("Content-Type", "application/json")
		w.Write(b)
	})
	mux.HandleFunc("/api/community/season", proxy("/season"))
	mux.HandleFunc("/api/community/combos", proxy("/combos"))
	mux.HandleFunc("/api/community/records", proxy("/records"))
	mux.HandleFunc("/api/community/track", proxy("/track"))
	mux.HandleFunc("/api/community/laps", proxy("/laps"))
	mux.HandleFunc("/api/community/model", proxy("/model"))
	mux.HandleFunc("/api/community/car", proxy("/car"))
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
		b, err := commCall("GET", "/trackmaps?trackId="+strconv.Itoa(t)+"&game="+url.QueryEscape(firstNonEmpty(q.Get("game"), currentGame())), nil, false)
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
	// only these fields go to the server: the outline, its game and which lap it came from
	out := map[string]any{"game": "iracing", "clean": in["clean"] == true}
	if g, _ := in["game"].(string); layoutGames[g] {
		out["game"] = g
	}
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

// commLayoutBest: the lap time of the layout the community already has per game and track (-1: none), so a
// slower lap is never sent; filled the first time a track is seen in this run.
var commLayoutBest = map[string]float64{}
var commLayoutGeo = map[string]bool{} // whether that layout comes from the game's position

// layoutGames: the games whose laps draw the community's track maps (the server keeps one layout per game and track)
var layoutGames = map[string]bool{"iracing": true, "lmu": true}

// shareLayout sends the outline of a valid lap (only its x/y points) to the community when it is
// faster than the layout everyone already has. iRacing and LMU, and never when sharing layouts is off:
// it is what draws the track map in the analyzer, the coach, the race summaries and the phone apps.
func shareLayout(l cloudLap, s cloudSession) {
	shareLayoutFor(l, currentGame(), sessionYAML())
}

// shareLayoutFor: shareLayout for a lap of this game and session YAML (the import of old laps reads them from a file)
func shareLayoutFor(l cloudLap, game, y string) {
	if tel.isDemo() || !layoutGames[game] || l.Trace == nil || len(l.Trace.X) < 100 || len(l.Trace.X) > 3000 || !(l.Time > 10) {
		return
	}
	commMu.Lock()
	off := commCfg.NoMaps
	commMu.Unlock()
	if off {
		return
	}
	c := currentCarTrack(y)
	if c.TrackID == 0 {
		return
	}
	n := len(l.Trace.X)
	body := map[string]any{"game": game, "clean": true, "trackId": c.TrackID, "track": c.Track, "time": l.Time, "n": n,
		"len": trackLengthM(y), "x": l.Trace.X, "y": l.Trace.Y}
	if n := trackNumTurns(y); n > 0 && game == "iracing" { // the official number of turns travels with the layout
		body["nturns"] = n
	}
	geo := len(l.Trace.G) == 2 // the path comes from the game's position: exact, with the origin of its frame
	if geo {
		body["g"] = l.Trace.G
	}
	key := game + ":" + strconv.Itoa(c.TrackID) // LMU's track ids are hashes of the name: one layout per game
	go func() {
		commMu.Lock()
		best, known := commLayoutBest[key]
		commGeo := commLayoutGeo[key]
		commMu.Unlock()
		if !known {
			best = -1
			if b, err := commCall("GET", "/trackmaps?trackId="+strconv.Itoa(c.TrackID)+"&game="+url.QueryEscape(game), nil, false); err == nil {
				var m struct {
					Time float64   `json:"time"`
					G    []float64 `json:"g"`
				}
				if json.Unmarshal(b, &m) == nil && m.Time > 0 {
					best, commGeo = m.Time, len(m.G) == 2
				}
			}
		}
		// a faster lap already drew this track: nothing to send, unless ours comes from the game's position and the
		// community's does not (the exact shape replaces dead reckoning whatever the time)
		if best > 0 && best <= l.Time && (!geo || commGeo) {
			commMu.Lock()
			commLayoutBest[key], commLayoutGeo[key] = best, commGeo
			commMu.Unlock()
			return
		}
		commMu.Lock()
		commLayoutBest[key], commLayoutGeo[key] = l.Time, geo
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

// handleTurns: a track's official turn numbers (where T1 … Tn are on the lap), read by anyone; an admin signed in on
// this PC places them on the map and saves them for everyone
func handleTurns(w http.ResponseWriter, r *http.Request) {
	if r.Method != http.MethodPost {
		q := r.URL.Query()
		t, _ := strconv.Atoi(q.Get("trackId"))
		if t <= 0 {
			http.Error(w, "trackId", 400)
			return
		}
		b, err := commCall("GET", "/turns?trackId="+strconv.Itoa(t)+"&game="+url.QueryEscape(firstNonEmpty(q.Get("game"), currentGame())), nil, false)
		if err != nil {
			writeJSON(w, map[string]any{"trackId": t, "turns": []float64{}})
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
	var in map[string]any
	if err := json.NewDecoder(io.LimitReader(r.Body, 64<<10)).Decode(&in); err != nil {
		http.Error(w, "bad turns", 400)
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
	b, err := commRequest("POST", "/community/turns", in, tok)
	if err != nil {
		w.WriteHeader(http.StatusBadGateway)
		writeJSON(w, map[string]string{"error": err.Error()})
		return
	}
	w.Header().Set("Content-Type", "application/json")
	w.Write(b)
}
