package main

// Le Mans Ultimate's own ratings, the Safety Rating (SR) and the Driver Rating / Rank (DR). The shared memory
// (lmu.go) does not carry them; the game's own UI is a web page served by the game on 127.0.0.1:6397 (an
// unofficial REST API that community tools read: TinyPedal, irdashies, lmu-pitwall, go-lmu-api). No community tool
// documents an endpoint with SR or DR yet (the known profile ones, /rest/profile/ and
// /rest/profile/profileInfo/getProfileInfo, carry name, nick, nationality and language). On every PC the agent reads
// one or two paths (those, or the ones an admin's PC found the ratings in, lmu-rating-paths.json): once when the
// game's menus are reached after the game starts and again only when a session ends (back in the menus), never more
// than once every 10 minutes, never while the player is in a session (community tools report freezes when the API is
// polled while driving), never a POST or PUT, never a value made up. What it finds goes to ratings.json as "lmu"
// {sr, dr, at}, next to iRacing's disciplines. On an admin's PC alone the same worker also reads the whole API once
// per game version (lmuapi.go).
//
// One goroutine for all of it (lmuRestW), started the first time the game is found: it sleeps on the source's
// events (opened, closed, a session loaded or left) and wakes on a timer only while it has something to do.

import (
	"context"
	"encoding/json"
	"errors"
	"fmt"
	"io"
	"log"
	"math"
	"net"
	"net/http"
	"os"
	"path/filepath"
	"regexp"
	"sort"
	"strconv"
	"strings"
	"sync"
	"time"
)

// the game's own address: IPv4 first, IPv6 for the builds that refuse it (race-engineer's notes saw both)
var lmuRestBases = []string{"http://127.0.0.1:6397", "http://[::1]:6397"}

// the profile paths the community found (go-lmu-api, generated from the game's swagger), read while no admin's PC
// has found where the ratings are
var lmuRestKnown = []string{"/rest/profile/", "/rest/profile/profileInfo/getProfileInfo"}

const (
	lmuRateEvery  = 10 * time.Minute // at most one read of the ratings in this time
	lmuRateRetry  = 30 * time.Second // the game's API not up yet (loading): the read again after this
	lmuGameGrace  = time.Minute      // the source closes and opens again every few seconds in the menus: closed longer is the game gone
	lmuReqTimeout = 5 * time.Second
	lmuReadCap    = 1 << 20   // never more than this read of one answer
	lmuKeepCap    = 256 << 10 // what is kept of a bigger one
	lmuDrainCap   = 64 << 20  // a bigger answer without Content-Length is counted up to this
)

// one client for the game's API: one connection kept alive, nothing through a proxy (the game is on this PC)
var lmuRestHTTP = &http.Client{
	Transport: &http.Transport{
		Proxy:               nil,
		DialContext:         localDialContext((&net.Dialer{Timeout: 2 * time.Second}).DialContext),
		MaxIdleConns:        1,
		MaxIdleConnsPerHost: 1,
		IdleConnTimeout:     30 * time.Second,
	},
}

// lmuAnswer: one answer of the game's API
type lmuAnswer struct {
	code  int
	ctype string
	size  int64  // the whole answer's size (Content-Length, or counted)
	body  []byte // all of it up to lmuReadCap, else its first lmuKeepCap
	trunc bool
	ms    int64
	err   error
}

// lmuFetch: one GET, read up to lmuReadCap (a bigger answer keeps its first lmuKeepCap and says its size), the body
// always read to its end or closed
func lmuFetch(ctx context.Context, url string) lmuAnswer {
	t0 := time.Now()
	ctx, cancel := context.WithTimeout(ctx, lmuReqTimeout)
	defer cancel()
	a := lmuAnswer{}
	req, err := http.NewRequestWithContext(ctx, http.MethodGet, url, nil)
	if err != nil {
		a.err = err
		return a
	}
	req.Header.Set("Accept", "application/json")
	resp, err := lmuRestHTTP.Do(req)
	if err != nil {
		a.err = err
		a.ms = time.Since(t0).Milliseconds()
		return a
	}
	defer resp.Body.Close()
	a.code, a.ctype = resp.StatusCode, resp.Header.Get("Content-Type")
	b, err := io.ReadAll(io.LimitReader(resp.Body, lmuReadCap+1))
	a.size = int64(len(b))
	if len(b) > lmuReadCap {
		n, _ := io.Copy(io.Discard, io.LimitReader(resp.Body, lmuDrainCap))
		a.size += n
		if resp.ContentLength > a.size {
			a.size = resp.ContentLength
		}
		b, a.trunc = b[:lmuKeepCap], true
	} else if err != nil {
		a.err = err
	}
	a.body = b
	a.ms = time.Since(t0).Milliseconds()
	return a
}

// lmuRestState: what the LMU source says (lmu.go)
type lmuRestState struct {
	open     bool
	closedAt time.Time
	inSess   bool // a session loaded (the 3D world)
	onTrack  bool // the game in its realtime (driving, or in the car in the garage)
	build    int  // the game's version from the shared memory, 0 unknown
}

// lmuRestWorker: the ratings for everyone, the whole API on an admin's PC
type lmuRestWorker struct {
	mu     sync.Mutex
	st     lmuRestState
	fresh  bool               // the game was started again (closed longer than lmuGameGrace)
	cancel context.CancelFunc // the request in flight: cancelled when a session loads
	kick   chan struct{}

	// only the worker's goroutine (or a test) touches these
	gameSeen, wasBusy, pendingRead bool
	lastRead                       time.Time
	base                           string
	exp                            *lmuExplorer

	fetch func(ctx context.Context, url string) lmuAnswer
	now   func() time.Time
	admin func() bool // an admin of the server signed in on this PC (the only PCs that read the whole API)
	dir   string      // "" = dataDir()
}

func newLMURestWorker() *lmuRestWorker {
	return &lmuRestWorker{kick: make(chan struct{}, 1), fetch: lmuFetch, now: time.Now, admin: wipAllowed}
}

// errLMUBusy: a request not made because a session is loaded
var errLMUBusy = errors.New("in a session")

var (
	lmuRestW    = newLMURestWorker()
	lmuRestOnce sync.Once
)

func (w *lmuRestWorker) poke() {
	select {
	case w.kick <- struct{}{}:
	default:
	}
}

// lmuRestOpened / lmuRestClosed / lmuRestNote: the LMU source's events (the worker starts with the first one)
func lmuRestOpened() {
	lmuRestOnce.Do(func() { go lmuRestW.loop() })
	lmuRestW.opened()
}

func lmuRestClosed() { lmuRestW.closed() }

func lmuRestNote(inSess, onTrack bool, build int) { lmuRestW.note(inSess, onTrack, build) }

func (w *lmuRestWorker) opened() {
	w.mu.Lock()
	if !w.st.open && !w.st.closedAt.IsZero() && w.now().Sub(w.st.closedAt) > lmuGameGrace {
		w.fresh = true
	}
	w.st.open = true
	w.mu.Unlock()
	w.poke()
}

func (w *lmuRestWorker) closed() {
	w.mu.Lock()
	w.st.open, w.st.closedAt, w.st.inSess, w.st.onTrack = false, w.now(), false, false
	w.mu.Unlock()
	w.poke()
}

func (w *lmuRestWorker) note(inSess, onTrack bool, build int) {
	w.mu.Lock()
	ch := w.st.inSess != inSess || w.st.onTrack != onTrack || (build != 0 && w.st.build != build)
	w.st.inSess, w.st.onTrack = inSess, onTrack
	if build != 0 {
		w.st.build = build
	}
	if (inSess || onTrack) && w.cancel != nil {
		w.cancel() // a session is loading: the request in flight stops at once
	}
	w.mu.Unlock()
	if ch {
		w.poke()
	}
}

// loop: sleeps until an event, or until the step asked to be woken
func (w *lmuRestWorker) loop() {
	for {
		d := w.step()
		if d <= 0 {
			<-w.kick
			continue
		}
		t := time.NewTimer(d)
		select {
		case <-w.kick:
			t.Stop()
		case <-t.C:
		}
	}
}

// step: at most one request to the game; how long until the next (0: nothing to do until an event)
func (w *lmuRestWorker) step() time.Duration {
	now := w.now()
	w.mu.Lock()
	st, fresh := w.st, w.fresh
	w.fresh = false
	w.mu.Unlock()
	if fresh { // the game started again: read once in its menus, and its API again if it is a new version
		w.gameSeen, w.wasBusy, w.exp = false, false, nil
	}
	if !st.open && (st.closedAt.IsZero() || now.Sub(st.closedAt) >= lmuGameGrace) {
		return 0 // the game is not running
	}
	if !w.gameSeen {
		w.gameSeen, w.pendingRead = true, true
	}
	if st.inSess || st.onTrack {
		if !w.wasBusy && w.exp != nil {
			w.exp.pause()
		}
		w.wasBusy = true
		return 0 // nothing while a session is loaded: the next event wakes the worker
	}
	if w.wasBusy { // a session ended: back in the menus
		w.wasBusy, w.pendingRead = false, true
	}
	var wait time.Duration
	if w.pendingRead {
		if wait = w.lastRead.Add(lmuRateEvery).Sub(now); w.lastRead.IsZero() || wait <= 0 {
			switch ok := w.readRatings(); {
			case ok:
				w.pendingRead, w.lastRead = false, now
			case !st.open:
				w.pendingRead = false // the game is gone
			default:
				return lmuRateRetry
			}
			return lmuAPIPace
		}
	}
	if st.open && w.admin() { // the whole API: an admin's PC only, with the game surely there
		if w.exp == nil {
			w.exp = newLMUExplorer(w.dirOr())
		}
		if w.exp.step(w, st, now) {
			return lmuAPIPace
		}
	}
	if w.pendingRead {
		return wait
	}
	return 0
}

func (w *lmuRestWorker) dirOr() string {
	if w.dir != "" {
		return w.dir
	}
	return dataDir()
}

// get: one GET of the game's API, at the address that answered last (else each in turn); a session loading cancels it
func (w *lmuRestWorker) get(path string) lmuAnswer {
	bases := lmuRestBases
	if w.base != "" {
		bases = []string{w.base}
	}
	var a lmuAnswer
	for _, b := range bases {
		ctx, cancel := context.WithCancel(context.Background())
		w.mu.Lock()
		busy := w.st.inSess || w.st.onTrack
		if !busy {
			w.cancel = cancel
		}
		w.mu.Unlock()
		if busy {
			cancel()
			return lmuAnswer{err: errLMUBusy}
		}
		a = w.fetch(ctx, b+path)
		w.mu.Lock()
		w.cancel = nil
		w.mu.Unlock()
		cancel()
		if a.err == nil {
			w.base = b
			return a
		}
		if errors.Is(a.err, context.Canceled) {
			return a
		}
	}
	w.base = ""
	return a
}

// readRatings: one or two GETs; true when the game's API answered
func (w *lmuRestWorker) readRatings() bool {
	answered := false
	var sr, dr string
	for _, p := range lmuRatingPaths(w.dirOr()) {
		a := w.get(p)
		if a.err != nil {
			continue
		}
		answered = true
		if a.code != 200 {
			continue
		}
		s, d := lmuRatingsFromJSON(a.body)
		if sr == "" {
			sr = s
		}
		if dr == "" {
			dr = d
		}
	}
	if sr != "" || dr != "" {
		if noteLMURating(sr, dr, w.now().UnixMilli()) {
			log.Printf("lmu rest: SR %q DR %q", sr, dr)
		}
	}
	return answered
}

// the paths the ratings are read from: those an admin's PC found them in (lmu-rating-paths.json), else the known ones;
// two at most
var lmuRatingMu sync.Mutex

func lmuRatingFile(dir string) string { return filepath.Join(dir, "lmu-rating-paths.json") }

func lmuRatingPaths(dir string) []string {
	lmuRatingMu.Lock()
	defer lmuRatingMu.Unlock()
	var ps []string
	if b, err := os.ReadFile(lmuRatingFile(dir)); err == nil {
		json.Unmarshal(b, &ps)
	}
	if len(ps) == 0 {
		ps = lmuRestKnown
	}
	if len(ps) > 2 {
		ps = ps[:2]
	}
	return ps
}

// lmuLearnRatingPath: a path that gave SR or DR goes first in lmu-rating-paths.json
func lmuLearnRatingPath(dir, p string) {
	lmuRatingMu.Lock()
	defer lmuRatingMu.Unlock()
	var ps []string
	if b, err := os.ReadFile(lmuRatingFile(dir)); err == nil {
		json.Unmarshal(b, &ps)
	}
	out := []string{p}
	for _, x := range ps {
		if x != p && len(out) < 2 {
			out = append(out, x)
		}
	}
	if fmt.Sprint(out) != fmt.Sprint(ps) {
		writeJSONFile(lmuRatingFile(dir), out)
	}
}

// lmuRatingsFromJSON: SR and DR from any field named like them, as the game writes them
func lmuRatingsFromJSON(b []byte) (sr, dr string) {
	var v any
	if json.Unmarshal(b, &v) != nil {
		return "", ""
	}
	lmuScanRatings(v, "", 0, &sr, &dr)
	return sr, dr
}

var lmuKeyNorm = regexp.MustCompile(`[^a-z0-9]`)

// lmuRatingKind: "sr", "dr" or "" for a field's name (and its parent's: {"rating": {"safety": …, "driver": …}})
func lmuRatingKind(key, parent string) string {
	k := lmuKeyNorm.ReplaceAllString(strings.ToLower(key), "")
	p := lmuKeyNorm.ReplaceAllString(strings.ToLower(parent), "")
	switch {
	case k == "sr" || strings.Contains(k, "safetyrating") || strings.Contains(k, "safetyrank") || strings.Contains(k, "safetyscore"):
		return "sr"
	case k == "dr" || strings.Contains(k, "driverrating") || strings.Contains(k, "driverrank") || strings.Contains(k, "driverscore"):
		return "dr"
	}
	if strings.Contains(p, "rating") || strings.Contains(p, "rank") {
		switch k {
		case "safety":
			return "sr"
		case "driver", "pace", "skill":
			return "dr"
		}
	}
	return ""
}

func lmuScanRatings(v any, parent string, depth int, sr, dr *string) {
	if depth > 6 {
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
			switch lmuRatingKind(k, parent) {
			case "sr":
				if *sr == "" {
					*sr = lmuRatingText(x[k])
				}
				continue
			case "dr":
				if *dr == "" {
					*dr = lmuRatingText(x[k])
				}
				continue
			}
			lmuScanRatings(x[k], k, depth+1, sr, dr)
		}
	case []any:
		if len(x) == 1 { // a list of many is other drivers' (standings): never yours
			lmuScanRatings(x[0], parent, depth+1, sr, dr)
		}
	}
}

var (
	lmuGradeKeys = regexp.MustCompile(`(?i)^(name|tier|grade|rank|label|text|class|level|display|displayname|title|license|licence)$`)
	lmuValueKeys = regexp.MustCompile(`(?i)^(value|rating|score|points|level|rank|number|current)$`)
)

// lmuRatingText: a rating as the game shows it: its text, its number, or an object's grade and number together
// ("Silver" + 2.45 → "Silver 2.45"); "" for anything else
func lmuRatingText(v any) string {
	switch x := v.(type) {
	case string:
		s := strings.TrimSpace(x)
		if len([]rune(s)) > 24 {
			return ""
		}
		return s
	case float64:
		return lmuNum(x)
	case map[string]any:
		ks := make([]string, 0, len(x))
		for k := range x {
			ks = append(ks, k)
		}
		sort.Strings(ks)
		grade, num := "", ""
		for _, k := range ks {
			switch y := x[k].(type) {
			case string:
				if grade == "" && lmuGradeKeys.MatchString(k) {
					grade = lmuRatingText(y)
				}
			case float64:
				if num == "" && lmuValueKeys.MatchString(k) {
					num = lmuNum(y)
				}
			}
		}
		return strings.TrimSpace(grade + " " + num)
	}
	return ""
}

func lmuNum(f float64) string {
	if math.IsNaN(f) || math.IsInf(f, 0) {
		return ""
	}
	if f == math.Trunc(f) {
		return strconv.FormatFloat(f, 'f', 0, 64)
	}
	s := strconv.FormatFloat(f, 'f', -1, 64)
	if i := strings.IndexByte(s, '.'); i >= 0 && len(s)-i-1 > 2 {
		s = strconv.FormatFloat(f, 'f', 2, 64)
	}
	return s
}

// noteLMURating keeps LMU's ratings in ratings.json ("lmu": {sr, dr, at}); a value the game did not give this time
// stays as it was, and the file changes only when a rating does (so the account is not uploaded every minute)
func noteLMURating(sr, dr string, at int64) bool {
	ratingsMu.Lock()
	defer ratingsMu.Unlock()
	if !lmuSetRating(sr, dr, at) {
		return false
	}
	writeJSONFile(journalFile("ratings.json"), ratings)
	return true
}

// lmuSetRating: the in-memory part of noteLMURating (ratingsMu held)
func lmuSetRating(sr, dr string, at int64) bool {
	if sr == "" && dr == "" {
		return false
	}
	old := ratings["lmu"]
	n := &discRating{SR: sr, DR: dr, At: at, Src: "lmu"}
	if old != nil {
		if n.SR == "" {
			n.SR = old.SR
		}
		if n.DR == "" {
			n.DR = old.DR
		}
		if n.SR == old.SR && n.DR == old.DR {
			return false
		}
	}
	ratings["lmu"] = n
	return true
}
