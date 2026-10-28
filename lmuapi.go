package main

// Everything Le Mans Ultimate's own API offers, for the admins of the server to see what Pitlane HQ could use (track
// layouts, cars, weather, strategy, standings, setups…). Only on a PC where an admin of the server is signed in
// (wipAllowed): on everybody else's this never runs and nothing is read, kept or sent (their game data is theirs).
//
// Once per version of the game's API (its list's version and a hash of its paths; lmu-api/done.json remembers the
// versions already sent), while the game is in its menus (lmuRestWorker: never with a session loaded, the request in
// flight cancelled the moment one loads, and on from where it stopped next time in the menus), the agent reads the
// list (/swagger-schema.json) and calls every GET path of it that needs no parameter, then the GET paths whose
// parameters can be filled from other answers (a value under the parameter's own name, its enum or default) or the
// list of the path above it (an "id"). Never a POST, PUT or DELETE, never a path that does something or hands out a
// secret (lmuAPIPathOK). One request every lmuAPIPace, lmuReqTimeout each, an answer read up to lmuReadCap (bigger: its
// first lmuKeepCap and its size). The results (path, status, content type, size, duration, the JSON or the start of the
// text) are kept in lmu-api/<version>.json.gz (to go on from there) and sent gzipped to the server's admin-only route
// POST /community/admin/lmu-api (table lmu_api).

import (
	"bytes"
	"compress/gzip"
	"context"
	"crypto/sha256"
	"encoding/hex"
	"encoding/json"
	"errors"
	"fmt"
	"log"
	"net/http"
	"net/url"
	"os"
	"path/filepath"
	"regexp"
	"sort"
	"strings"
	"time"
	"unicode"
	"unicode/utf8"
)

const (
	lmuAPIPace     = 5 * time.Second // at most one request to the game in this time
	lmuAPIMaxCalls = 1000            // requests per version at most
	lmuAPIFills    = 3               // concrete paths tried for one path with parameters
	lmuAPITextCap  = 16 << 10        // the start kept of an answer that is not JSON
	lmuAPIBatch    = 4 << 20         // raw JSON per upload (gzipped it is far less)
	lmuAPIBatchN   = 150             // items per upload
	lmuAPISaveN    = 25              // the local copy written every so many answers
	lmuAPIRetry    = 10 * time.Minute
)

// words in a path that do something or hand out a secret: the whole word (set, load…) or its start (auth…, token…)
var (
	lmuAPIVerbs = map[string]bool{
		"set": true, "save": true, "load": true, "join": true, "leave": true, "start": true, "stop": true, "restart": true,
		"delete": true, "del": true, "remove": true, "reset": true, "quit": true, "exit": true, "kick": true, "ban": true,
		"chat": true, "buy": true, "add": true, "create": true, "update": true, "apply": true, "send": true, "post": true,
		"put": true, "clear": true, "cancel": true, "connect": true, "disconnect": true, "toggle": true, "select": true,
		"enter": true, "drive": true, "focus": true, "take": true, "play": true, "launch": true, "close": true,
		"open": true, "write": true, "change": true, "submit": true, "accept": true, "decline": true, "command": true,
		"install": true, "uninstall": true, "unlock": true, "skip": true, "retire": true, "pause": true, "resume": true,
		"run": true, "execute": true, "exec": true, "trigger": true, "upload": true, "import": true, "export": true,
		"copy": true, "rename": true, "move": true, "spectate": true, "vote": true, "invite": true, "report": true,
		"eac": true, "devmode": true, "firstrun": true, "shutdown": true, "reboot": true, "login": true, "logout": true,
		"signin": true, "signout": true, "register": true, "pay": true, "key": true, "keys": true, "cookie": true,
	}
	lmuAPISecret = []string{"auth", "token", "ticket", "password", "passwd", "secret", "credential", "steam", "purchase",
		"upload", "delete", "restart", "session_ticket", "apikey", "privatekey", "encrypt", "decrypt", "license_key",
		// the car's own screens answer only with a session loaded ("Invalid state" in the menus): never asked
		"garage", "pitmenu"}
)

// lmuPathWords: a path's words in lower case ("/rest/garage/getPlayerSetup" → rest garage get player setup)
func lmuPathWords(p string) []string {
	var out []string
	rs := []rune(p)
	cur := []rune{}
	flush := func() {
		if len(cur) > 0 {
			out = append(out, strings.ToLower(string(cur)))
			cur = cur[:0]
		}
	}
	for i, r := range rs {
		if !unicode.IsLetter(r) && !unicode.IsDigit(r) {
			flush()
			continue
		}
		if unicode.IsUpper(r) && len(cur) > 0 {
			prevLower := unicode.IsLower(cur[len(cur)-1]) || unicode.IsDigit(cur[len(cur)-1])
			nextLower := i+1 < len(rs) && unicode.IsLower(rs[i+1])
			if prevLower || (unicode.IsUpper(cur[len(cur)-1]) && nextLower) {
				flush()
			}
		}
		cur = append(cur, r)
	}
	flush()
	return out
}

// lmuAPIPathOK: false for a path that does something or hands out a secret, whatever its method
func lmuAPIPathOK(p string) bool {
	low := lmuKeyNorm.ReplaceAllString(strings.ToLower(p), "")
	for _, s := range lmuAPISecret {
		if strings.Contains(low, lmuKeyNorm.ReplaceAllString(s, "")) {
			return false
		}
	}
	for _, w := range lmuPathWords(p) {
		if lmuAPIVerbs[w] {
			return false
		}
	}
	return true
}

// lmuParam: a parameter of the API list (OpenAPI 2 and 3)
type lmuParam struct {
	Name     string `json:"name"`
	In       string `json:"in"`
	Required bool   `json:"required"`
	Default  any    `json:"default"`
	Enum     []any  `json:"enum"`
	Schema   struct {
		Default any   `json:"default"`
		Enum    []any `json:"enum"`
	} `json:"schema"`
}

// lmuAPIReq: a GET path of the list, with the parameters it needs (path ones and required query ones)
type lmuAPIReq struct {
	Path   string
	Params []lmuParam
}

var lmuTmplRe = regexp.MustCompile(`\{([^}]+)\}`)

// lmuSwaggerPlan: the list's version key, the GET paths without parameters, those with, and the GET paths left out
func lmuSwaggerPlan(b []byte) (ver string, plain []string, filled []lmuAPIReq, skipped []string, err error) {
	var sw struct {
		Info struct {
			Version string `json:"version"`
		} `json:"info"`
		Paths map[string]map[string]json.RawMessage `json:"paths"`
	}
	if err = json.Unmarshal(b, &sw); err != nil {
		return
	}
	if len(sw.Paths) == 0 {
		err = errors.New("no paths in the API list")
		return
	}
	keys := make([]string, 0, len(sw.Paths))
	for p := range sw.Paths {
		keys = append(keys, p)
	}
	sort.Strings(keys)
	h := sha256.New()
	for _, p := range keys {
		ms := make([]string, 0, len(sw.Paths[p]))
		for m := range sw.Paths[p] {
			ms = append(ms, m)
		}
		sort.Strings(ms)
		fmt.Fprintf(h, "%s %s\n", p, strings.Join(ms, ","))
		get, ok := sw.Paths[p]["get"]
		if !ok {
			continue
		}
		if !lmuAPIPathOK(p) {
			skipped = append(skipped, p)
			continue
		}
		var common, op []lmuParam
		if raw, ok := sw.Paths[p]["parameters"]; ok {
			json.Unmarshal(raw, &common)
		}
		var o struct {
			Parameters []lmuParam `json:"parameters"`
		}
		json.Unmarshal(get, &o)
		op = append(common, o.Parameters...)
		var need []lmuParam
		for _, prm := range op {
			if prm.In == "path" || (prm.In == "query" && prm.Required) {
				need = append(need, prm)
			}
		}
		// a {name} in the path the list does not describe is a path parameter too
		for _, m := range lmuTmplRe.FindAllStringSubmatch(p, -1) {
			found := false
			for _, prm := range need {
				if prm.Name == m[1] {
					found = true
				}
			}
			if !found {
				need = append(need, lmuParam{Name: m[1], In: "path", Required: true})
			}
		}
		if len(need) == 0 && !strings.ContainsAny(p, "{}*") {
			plain = append(plain, p)
		} else {
			filled = append(filled, lmuAPIReq{Path: p, Params: need})
		}
	}
	v := strings.TrimSpace(sw.Info.Version)
	if v == "" {
		v = "0"
	}
	if len(v) > 24 {
		v = v[:24]
	}
	ver = lmuKeyNorm.ReplaceAllString(strings.ToLower(v), ".") + "-" + hex.EncodeToString(h.Sum(nil))[:8]
	return
}

// lmuAPIItem: one answer, as it is kept and sent
type lmuAPIItem struct {
	Path   string `json:"path"`
	Status int    `json:"status"`
	Ctype  string `json:"ctype,omitempty"`
	Size   int64  `json:"size"`
	Ms     int64  `json:"ms"`
	Body   string `json:"body,omitempty"`
	Trunc  bool   `json:"trunc,omitempty"`
}

// lmuAPIRun: one version's reading (the local copy)
type lmuAPIRun struct {
	Version string       `json:"version"`
	Build   int          `json:"build,omitempty"`
	At      int64        `json:"at"`
	Done    bool         `json:"done,omitempty"`
	Sent    bool         `json:"sent,omitempty"`
	Crashes int          `json:"crashes,omitempty"` // requests the game closed during (never asked again)
	Items   []lmuAPIItem `json:"items"`
}

// lmuExplorer: the reading of one version (lmuRestWorker.exp; on an admin's PC only)
type lmuExplorer struct {
	dir      string // <data>/lmu-api
	ratings  string // where lmu-rating-paths.json goes (the data folder)
	off      bool   // nothing more to do while the game runs
	listTry  int
	run      *lmuAPIRun
	queue    []lmuAPIReq
	called   map[string]bool
	vals     map[string][]string            // values seen under a key, every answer
	valsAt   map[string]map[string][]string // the same, per path
	unsaved  int
	calls    int
	nextSend time.Time
	retryIn  time.Duration // the game's API not listening: the worker comes back after this
	post     func(run *lmuAPIRun, items []lmuAPIItem) error
}

func newLMUExplorer(data string) *lmuExplorer {
	return &lmuExplorer{dir: filepath.Join(data, "lmu-api"), ratings: data, post: lmuAPIUpload}
}

func (e *lmuExplorer) donePath() string { return filepath.Join(e.dir, "done.json") }
func (e *lmuExplorer) runPath(v string) string {
	return filepath.Join(e.dir, lmuKeyNorm.ReplaceAllString(v+"@"+lmuAPIRound, "_")+".json.gz")
}

// lmuAPIRound: a new round reads every version again from the start (r2: the first round read while the game was
// starting and was cut short by the game closing)
const lmuAPIRound = "r2"

func (e *lmuExplorer) doneVersions() map[string]int64 {
	m := map[string]int64{}
	readJSON(e.donePath(), &m)
	return m
}

// step: at most one request; false when nothing is left to read now
func (e *lmuExplorer) step(w *lmuRestWorker, st lmuRestState, now time.Time) bool {
	if e.off {
		return false
	}
	if e.run == nil {
		return e.start(w, st, now)
	}
	for len(e.queue) > 0 && e.calls < lmuAPIMaxCalls {
		q := e.queue[0]
		e.queue = e.queue[1:]
		if len(q.Params) > 0 {
			ps, why := e.fill(q)
			if len(ps) == 0 {
				e.add(lmuAPIItem{Path: q.Path, Body: "not called: " + why})
				continue
			}
			for i := len(ps) - 1; i >= 0; i-- {
				if !e.called[ps[i]] {
					e.queue = append([]lmuAPIReq{{Path: ps[i]}}, e.queue...)
				}
			}
			continue
		}
		if e.called[q.Path] {
			continue
		}
		a := w.get(q.Path)
		if errors.Is(a.err, errLMUBusy) || errors.Is(a.err, context.Canceled) {
			e.queue = append([]lmuAPIReq{q}, e.queue...) // a session loaded: this one again next time in the menus
			e.pause()
			return false
		}
		if lmuNotListening(a.err) {
			// nothing was asked: the game's API is not up (or the game is gone), this one again later
			e.queue = append([]lmuAPIReq{q}, e.queue...)
			e.retryIn = lmuRateRetry
			e.pause()
			return false
		}
		if errors.Is(a.err, errLMUBad) {
			e.called[q.Path] = true
			continue
		}
		if a.err != nil && !errors.Is(a.err, context.DeadlineExceeded) {
			// the game went away during this request (the worker keeps it as a suspect): never asked again
			e.crashed(w, q.Path, "during this request")
			return false
		}
		e.calls++
		e.called[q.Path] = true
		e.add(e.item(q.Path, a))
		if a.err == nil && a.code == 200 {
			if sr, dr := lmuRatingsFromJSON(a.body); sr != "" || dr != "" {
				lmuLearnRatingPath(e.ratings, q.Path)
				noteLMURating(sr, dr, now.UnixMilli())
			}
		}
		return true
	}
	if !e.run.Done {
		e.run.Done = true
		e.save()
		log.Printf("lmu api: version %s read, %d paths", e.run.Version, len(e.run.Items))
	}
	if !e.run.Sent && !now.Before(e.nextSend) {
		if err := e.send(); err != nil {
			e.nextSend = now.Add(lmuAPIRetry)
			log.Printf("lmu api: not sent (%v), again later", err)
			return false
		}
		e.run.Sent = true
		e.save()
		m := e.doneVersions()
		m[e.run.Version+"@"+lmuAPIRound] = now.UnixMilli()
		writeJSONFile(e.donePath(), m)
		log.Printf("lmu api: version %s sent to the server", e.run.Version)
	}
	if e.run.Sent {
		e.off = true
	}
	return false
}

// start: the API list, its version, and where the reading stopped last time
func (e *lmuExplorer) start(w *lmuRestWorker, st lmuRestState, now time.Time) bool {
	a := w.get("/swagger-schema.json")
	if a.err != nil {
		if e.listTry++; e.listTry >= 5 {
			log.Printf("lmu api: no API list (%v)", a.err)
			e.off = true
			return false
		}
		return true
	}
	if a.code != 200 || a.trunc {
		log.Printf("lmu api: no API list at /swagger-schema.json (%d, %d bytes)", a.code, a.size)
		e.off = true
		return false
	}
	ver, plain, filled, skipped, err := lmuSwaggerPlan(a.body)
	if err != nil {
		log.Printf("lmu api: API list unreadable (%v)", err)
		e.off = true
		return false
	}
	if _, ok := e.doneVersions()[ver+"@"+lmuAPIRound]; ok {
		e.off = true // this version was read and sent already
		return false
	}
	e.called, e.vals, e.valsAt = map[string]bool{}, map[string][]string{}, map[string]map[string][]string{}
	if r := e.load(ver); r != nil {
		e.run = r
		for _, it := range r.Items {
			if !strings.HasPrefix(it.Path, "#") {
				e.called[it.Path] = true
				e.learn(it.Path, []byte(it.Body))
			}
		}
		e.calls = len(e.called)
		log.Printf("lmu api: version %s, going on after %d paths", ver, e.calls)
	} else {
		e.run = &lmuAPIRun{Version: ver, Build: st.build, At: now.UnixMilli()}
		meta, _ := json.Marshal(map[string]any{"version": ver, "build": st.build, "plain": len(plain), "withParams": len(filled), "skipped": skipped})
		e.run.Items = append(e.run.Items, lmuAPIItem{Path: "#meta", Status: 200, Ctype: "application/json", Size: int64(len(meta)), Body: string(meta)})
		// the list itself, in parts the size the server keeps
		for i, n := 0, 0; i < len(a.body); i, n = i+lmuKeepCap, n+1 {
			j := min(i+lmuKeepCap, len(a.body))
			e.run.Items = append(e.run.Items, lmuAPIItem{Path: fmt.Sprintf("#swagger/%d", n), Status: a.code, Ctype: a.ctype, Size: a.size, Ms: a.ms, Body: string(a.body[i:j])})
		}
		log.Printf("lmu api: version %s, reading %d paths (%d with parameters, %d left out)", ver, len(plain), len(filled), len(skipped))
	}
	// the requests the game closed with (the worker's suspects on this build): kept as such, never again
	for _, p := range w.bad() {
		if !e.marked(p) {
			e.crashed(w, p, "right after this request")
		}
	}
	if len(w.bad()) >= lmuBadMax {
		plain, filled = nil, nil // enough: what was read is sent
	}
	for _, p := range plain {
		if !e.called[p] {
			e.queue = append(e.queue, lmuAPIReq{Path: p})
		}
	}
	e.queue = append(e.queue, filled...)
	if e.run.Build == 0 {
		e.run.Build = st.build
	}
	e.save()
	return true
}

// item: an answer as it is kept: JSON whole (up to lmuKeepCap), other text its start, nothing of binary
func (e *lmuExplorer) item(p string, a lmuAnswer) lmuAPIItem {
	it := lmuAPIItem{Path: p, Status: a.code, Ctype: a.ctype, Size: a.size, Ms: a.ms, Trunc: a.trunc}
	b := a.body
	if a.err != nil {
		it.Body = "error: " + a.err.Error()
		return it
	}
	switch {
	case !utf8.Valid(b) && !a.trunc:
		it.Body = ""
	case json.Valid(b) || a.trunc && (bytes.HasPrefix(bytes.TrimSpace(b), []byte("{")) || bytes.HasPrefix(bytes.TrimSpace(b), []byte("["))):
		if len(b) > lmuKeepCap {
			b, it.Trunc = b[:lmuKeepCap], true
		}
		it.Body = strings.ToValidUTF8(string(b), "")
		e.learn(p, b)
	default:
		if len(b) > lmuAPITextCap {
			b, it.Trunc = b[:lmuAPITextCap], true
		}
		it.Body = strings.ToValidUTF8(string(b), "")
	}
	return it
}

func (e *lmuExplorer) add(it lmuAPIItem) {
	e.run.Items = append(e.run.Items, it)
	if e.unsaved++; e.unsaved >= lmuAPISaveN {
		e.save()
	}
}

// crashed: a path the game closed with, kept as such (the worker never asks it again); after lmuBadMax the reading
// ends and what it has is sent
func (e *lmuExplorer) crashed(w *lmuRestWorker, p, why string) {
	key := p
	if e.called[p] {
		key = "#closed:" + p // its answer is kept already
	}
	e.called[p] = true
	e.calls++
	e.run.Crashes++
	e.run.Items = append(e.run.Items, lmuAPIItem{Path: key, Body: "game closed: " + why})
	if len(w.bad()) >= lmuBadMax {
		e.queue = nil
		log.Printf("lmu api: version %s, the game closed %d times, what was read goes to the server", e.run.Version, len(w.bad()))
	}
	e.save()
}

// marked: the run says already that the game closed with this path
func (e *lmuExplorer) marked(p string) bool {
	for _, it := range e.run.Items {
		if (it.Path == p || it.Path == "#closed:"+p) && strings.HasPrefix(it.Body, "game closed") {
			return true
		}
	}
	return false
}

func (e *lmuExplorer) pause() {
	if e.run != nil && e.unsaved > 0 {
		e.save()
	}
}

// learn: the values an answer carries under each key (ids, names…), to fill the parameters of other paths
func (e *lmuExplorer) learn(p string, b []byte) {
	var v any
	if json.Unmarshal(b, &v) != nil {
		return
	}
	at := e.valsAt[p]
	if at == nil {
		at = map[string][]string{}
		e.valsAt[p] = at
	}
	var walk func(v any, key string, d int)
	walk = func(v any, key string, d int) {
		if d > 6 {
			return
		}
		switch x := v.(type) {
		case map[string]any:
			ks := make([]string, 0, len(x))
			for k := range x {
				ks = append(ks, k)
			}
			sort.Strings(ks)
			for _, k := range ks {
				walk(x[k], k, d+1)
			}
		case []any:
			for i, y := range x {
				if i >= 8 {
					break
				}
				walk(y, key, d+1)
			}
		case string, float64, bool:
			s := lmuScalar(x)
			k := lmuKeyNorm.ReplaceAllString(strings.ToLower(key), "")
			if s == "" || k == "" {
				return
			}
			e.vals[k] = lmuAppendVal(e.vals[k], s)
			at[k] = lmuAppendVal(at[k], s)
		}
	}
	walk(v, "", 0)
}

func lmuScalar(v any) string {
	switch x := v.(type) {
	case string:
		s := strings.TrimSpace(x)
		if s == "" || len(s) > 64 || strings.ContainsAny(s, "\n\r\t") {
			return ""
		}
		return s
	case float64:
		return lmuNum(x)
	case bool:
		if x {
			return "true"
		}
		return "false"
	}
	return ""
}

func lmuAppendVal(l []string, s string) []string {
	if len(l) >= 5 {
		return l
	}
	for _, x := range l {
		if x == s {
			return l
		}
	}
	return append(l, s)
}

// fill: up to lmuAPIFills concrete paths for a path with parameters, or why none
func (e *lmuExplorer) fill(q lmuAPIReq) ([]string, string) {
	parent := q.Path
	if i := strings.Index(parent, "/{"); i >= 0 {
		parent = parent[:i]
	}
	cands := make([][]string, len(q.Params))
	for i, prm := range q.Params {
		cands[i] = e.valuesFor(prm, parent)
		if len(cands[i]) == 0 {
			return nil, "no value for " + prm.Name
		}
	}
	var out []string
	seen := map[string]bool{}
	for n := 0; n < lmuAPIFills; n++ {
		p := q.Path
		qs := url.Values{}
		for i, prm := range q.Params {
			v := cands[i][n%len(cands[i])]
			if prm.In == "path" || strings.Contains(p, "{"+prm.Name+"}") {
				p = strings.ReplaceAll(p, "{"+prm.Name+"}", url.PathEscape(v))
			} else {
				qs.Set(prm.Name, v)
			}
		}
		if len(qs) > 0 {
			p += "?" + qs.Encode()
		}
		if !seen[p] && !strings.ContainsAny(p, "{}") {
			seen[p] = true
			out = append(out, p)
		}
	}
	if len(out) == 0 {
		return nil, "no value"
	}
	return out, ""
}

func (e *lmuExplorer) valuesFor(prm lmuParam, parent string) []string {
	var out []string
	for _, v := range append(append([]any{}, prm.Enum...), prm.Schema.Enum...) {
		if s := lmuScalar(v); s != "" {
			out = lmuAppendVal(out, s)
		}
	}
	for _, v := range []any{prm.Default, prm.Schema.Default} {
		if s := lmuScalar(v); s != "" {
			out = lmuAppendVal(out, s)
		}
	}
	if len(out) > 0 {
		return out
	}
	k := lmuKeyNorm.ReplaceAllString(strings.ToLower(prm.Name), "")
	if v := e.vals[k]; len(v) > 0 {
		return v
	}
	// an "id" of the list one level up: /rest/tracks/{id} from /rest/tracks
	if parent != "" && (k == "id" || strings.HasSuffix(k, "id")) {
		ps := make([]string, 0, len(e.valsAt))
		for p := range e.valsAt {
			if p == parent || strings.HasPrefix(p, parent+"/") || strings.HasPrefix(p, parent+"?") {
				ps = append(ps, p)
			}
		}
		sort.Strings(ps)
		for _, p := range ps {
			if v := e.valsAt[p]["id"]; len(v) > 0 {
				return v
			}
		}
	}
	return nil
}

// save / load: the local copy, gzipped
func (e *lmuExplorer) save() {
	e.unsaved = 0
	if e.run == nil {
		return
	}
	var buf bytes.Buffer
	z := gzip.NewWriter(&buf)
	json.NewEncoder(z).Encode(e.run)
	z.Close()
	os.MkdirAll(e.dir, 0o700)
	p := e.runPath(e.run.Version)
	if os.WriteFile(p+".tmp", buf.Bytes(), 0o600) == nil {
		os.Rename(p+".tmp", p)
	}
}

func (e *lmuExplorer) load(ver string) *lmuAPIRun {
	f, err := os.Open(e.runPath(ver))
	if err != nil {
		return nil
	}
	defer f.Close()
	z, err := gzip.NewReader(f)
	if err != nil {
		return nil
	}
	var r lmuAPIRun
	if json.NewDecoder(z).Decode(&r) != nil || r.Version != ver {
		return nil
	}
	return &r
}

// send: the reading in batches (lmuAPIBatch, lmuAPIBatchN), every one through the admin gate
func (e *lmuExplorer) send() error {
	for _, b := range lmuAPIBatches(e.run.Items) {
		if err := e.post(e.run, b); err != nil {
			return err
		}
	}
	return nil
}

func lmuAPIBatches(items []lmuAPIItem) [][]lmuAPIItem {
	var out [][]lmuAPIItem
	var cur []lmuAPIItem
	size := 0
	for _, it := range items {
		n := len(it.Body) + len(it.Path) + 120
		if len(cur) > 0 && (size+n > lmuAPIBatch || len(cur) >= lmuAPIBatchN) {
			out = append(out, cur)
			cur, size = nil, 0
		}
		cur = append(cur, it)
		size += n
	}
	if len(cur) > 0 {
		out = append(out, cur)
	}
	return out
}

var errLMUNotAdmin = errors.New("not an admin of the server")

// lmuAPIUpload: one batch to the server, gzipped; only with an admin of the server signed in on this PC
func lmuAPIUpload(run *lmuAPIRun, items []lmuAPIItem) error {
	if !realAdminSigned() { // the capture runs for an admin's account whatever admin mode says
		return errLMUNotAdmin
	}
	body, err := lmuAPIGzip(run, items)
	if err != nil {
		return err
	}
	base := commBase()
	if base == "" {
		return errors.New("no server")
	}
	req, _ := http.NewRequest(http.MethodPost, base+"/community/admin/lmu-api", bytes.NewReader(body))
	req.Header.Set("Content-Type", "application/gzip")
	req.Header.Set("Authorization", "Bearer "+commToken())
	resp, err := commHTTP.Do(req)
	if err != nil {
		return err
	}
	defer resp.Body.Close()
	if resp.StatusCode >= 300 {
		return fmt.Errorf("the server answered HTTP %d", resp.StatusCode)
	}
	return nil
}

func lmuAPIGzip(run *lmuAPIRun, items []lmuAPIItem) ([]byte, error) {
	var buf bytes.Buffer
	z := gzip.NewWriter(&buf)
	err := json.NewEncoder(z).Encode(map[string]any{"game": "lmu", "version": run.Version, "build": run.Build, "items": items})
	if cerr := z.Close(); err == nil {
		err = cerr
	}
	return buf.Bytes(), err
}
