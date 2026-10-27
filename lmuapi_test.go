package main

import (
	"compress/gzip"
	"context"
	"encoding/json"
	"errors"
	"io"
	"net/http"
	"net/http/httptest"
	"os"
	"path/filepath"
	"strings"
	"sync"
	"testing"
	"time"
)

// a path that does something or hands out a secret is never called, whatever its method; reading ones are
func TestLMUAPIPathOK(t *testing.T) {
	bad := []string{"/rest/profile/getAuthSessionTicket", "/rest/multiplayer/join", "/rest/race/startSession", "/rest/garage/setSetup",
		"/rest/garage/loadSetup", "/rest/garage/saveSetup", "/rest/chat/messages", "/rest/steam/friends", "/rest/store/purchaseItem",
		"/rest/sessions/restart", "/rest/garage/deleteSetup", "/rest/app/quit", "/rest/app/exit", "/rest/profile/password",
		"/rest/multiplayer/leave", "/rest/race/stop", "/rest/admin/kick", "/rest/admin/ban", "/rest/token", "/rest/store/buy",
		"/rest/replays/upload", "/rest/watch/focus", "/rest/sessions/settings/set_value"}
	for _, p := range bad {
		if lmuAPIPathOK(p) {
			t.Errorf("%s allowed", p)
		}
	}
	good := []string{"/rest/garage/getPlayerSetups", "/rest/sessions/settings", "/rest/watch/standings", "/rest/sessions/weather",
		"/rest/race/car", "/rest/profile/profileInfo/getProfileInfo", "/rest/strategy/overall", "/rest/garage/setup",
		"/rest/race/track", "/rest/watch/replays", "/rest/sessions/getAllVehicles", "/rest/startingGrid"}
	for _, p := range good {
		if !lmuAPIPathOK(p) {
			t.Errorf("%s left out", p)
		}
	}
	if w := strings.Join(lmuPathWords("/rest/garage/getHTTPSetup_SESSSET_x9"), " "); w != "rest garage get http setup sessset x9" {
		t.Fatalf("words: %s", w)
	}
}

const lmuTestSwagger = `{"swagger":"2.0","info":{"version":"1.2"},"paths":{
	"/rest/tracks":{"get":{}},
	"/rest/tracks/{id}":{"get":{"parameters":[{"in":"path","name":"id","required":true}]}},
	"/rest/race/car":{"get":{}},
	"/rest/profile/ratings":{"get":{}},
	"/rest/multiplayer/join":{"get":{}},
	"/rest/garage/setSetup":{"get":{},"post":{}},
	"/rest/garage/setup":{"post":{}},
	"/rest/cars/{carId}":{"get":{}},
	"/rest/sessions/weather":{"parameters":[{"in":"query","name":"session","required":true,"enum":["RACE","QUALIFY"]}],"get":{}},
	"/rest/sessions/info":{"get":{"parameters":[{"in":"query","name":"verbose","required":false}]}}}}`

// the list: the plain GET paths, those with parameters, those left out, and a version that does not depend on the order
func TestLMUSwaggerPlan(t *testing.T) {
	ver, plain, filled, skipped, err := lmuSwaggerPlan([]byte(lmuTestSwagger))
	if err != nil {
		t.Fatal(err)
	}
	if got := strings.Join(plain, " "); got != "/rest/profile/ratings /rest/race/car /rest/sessions/info /rest/tracks" {
		t.Fatalf("plain: %s", got)
	}
	var fp []string
	for _, f := range filled {
		fp = append(fp, f.Path)
	}
	if got := strings.Join(fp, " "); got != "/rest/cars/{carId} /rest/sessions/weather /rest/tracks/{id}" {
		t.Fatalf("filled: %s", got)
	}
	if got := strings.Join(skipped, " "); got != "/rest/garage/setSetup /rest/multiplayer/join" {
		t.Fatalf("skipped: %s", got)
	}
	if !strings.HasPrefix(ver, "1.2-") || len(ver) != 12 {
		t.Fatalf("version %q", ver)
	}
	re := strings.Replace(lmuTestSwagger, `"/rest/race/car":{"get":{}},`, "", 1)
	re = strings.Replace(re, `"/rest/tracks":{"get":{}},`, `"/rest/tracks":{"get":{}},"/rest/race/car":{"get":{}},`, 1)
	if v2, _, _, _, _ := lmuSwaggerPlan([]byte(re)); v2 != ver {
		t.Fatalf("order changed the version: %s %s", v2, ver)
	}
	if v3, _, _, _, _ := lmuSwaggerPlan([]byte(strings.Replace(lmuTestSwagger, `"/rest/race/car"`, `"/rest/race/cars"`, 1))); v3 == ver {
		t.Fatal("another API, same version")
	}
	if _, _, _, _, err := lmuSwaggerPlan([]byte(`{"paths":{}}`)); err == nil {
		t.Fatal("an empty list")
	}
}

// lmuFakeGame: the game's API on 127.0.0.1:6397, answering from a map; every call is recorded
type lmuFakeGame struct {
	mu     sync.Mutex
	calls  []string
	sr     string
	during func(path string) // runs inside a call (a session loading while it is in flight)
	crash  map[string]bool   // paths the game closes on
}

func (g *lmuFakeGame) fetch(ctx context.Context, url string) lmuAnswer {
	p := strings.TrimPrefix(url, "http://127.0.0.1:6397")
	g.mu.Lock()
	g.calls = append(g.calls, p)
	during := g.during
	g.mu.Unlock()
	if p == url {
		return lmuAnswer{err: io.ErrUnexpectedEOF}
	}
	if during != nil {
		during(p)
	}
	if ctx.Err() != nil {
		return lmuAnswer{err: ctx.Err()}
	}
	g.mu.Lock()
	crash := g.crash[p]
	g.mu.Unlock()
	if crash {
		return lmuAnswer{err: errors.New("connection reset")}
	}
	ans := func(code int, b string) lmuAnswer {
		return lmuAnswer{code: code, ctype: "application/json", size: int64(len(b)), body: []byte(b), ms: 3}
	}
	switch {
	case p == "/swagger-schema.json":
		return ans(200, lmuTestSwagger)
	case p == "/rest/tracks":
		return ans(200, `[{"id":"lemans","name":"Le Mans"},{"id":"spa","name":"Spa"}]`)
	case strings.HasPrefix(p, "/rest/tracks/"):
		return ans(200, `{"id":"`+strings.TrimPrefix(p, "/rest/tracks/")+`","waypoints":[[0,0],[1,1]]}`)
	case p == "/rest/profile/ratings":
		return ans(200, `{"safetyRating":"`+g.sr+`","driverRating":"Bronze 1200"}`)
	case p == "/rest/profile/":
		return ans(200, `{"name":"A","nick":"a"}`)
	case strings.HasPrefix(p, "/rest/sessions/weather"):
		return ans(200, `{"rain":0}`)
	case p == "/rest/race/car":
		return lmuAnswer{code: 200, ctype: "text/plain", size: 5, body: []byte("hello")}
	}
	return ans(404, `{}`)
}

func (g *lmuFakeGame) took() []string {
	g.mu.Lock()
	defer g.mu.Unlock()
	c := g.calls
	g.calls = nil
	return c
}

type lmuClock struct{ t time.Time }

func (c *lmuClock) now() time.Time { return c.t }

func lmuTestWorker(t *testing.T, admin bool) (*lmuRestWorker, *lmuFakeGame, *lmuClock) {
	t.Helper()
	ratingsMu.Lock()
	saved := ratings
	ratings = map[string]*discRating{}
	ratingsMu.Unlock()
	t.Cleanup(func() { ratingsMu.Lock(); ratings = saved; ratingsMu.Unlock() })
	dir := t.TempDir()
	t.Setenv("XDG_CONFIG_HOME", dir)
	t.Setenv("HOME", dir)
	t.Setenv("APPDATA", dir)
	initProfiles()
	g := &lmuFakeGame{sr: "Silver 2.45"}
	c := &lmuClock{t: time.Unix(1_000_000, 0)}
	w := newLMURestWorker()
	w.fetch, w.now, w.admin, w.dir = g.fetch, c.now, func() bool { return admin }, dir
	return w, g, c
}

// everybody's PC: the ratings once in the menus after the game starts and again after a session, never more than once
// every 10 minutes, one or two GETs, nothing while a session is loaded, nothing while the game is closed
func TestLMURestRatingsPace(t *testing.T) {
	w, g, c := lmuTestWorker(t, false)
	if d := w.step(); d != 0 || len(g.took()) != 0 {
		t.Fatal("read with the game closed")
	}
	w.opened()
	w.note(true, true, 14000) // the game started straight into a session
	if d := w.step(); d != 0 || len(g.took()) != 0 {
		t.Fatal("read in a session")
	}
	w.note(false, false, 0) // back in the menus
	w.step()
	if calls := g.took(); strings.Join(calls, " ") != "/rest/profile/ /rest/profile/profileInfo/getProfileInfo" {
		t.Fatalf("first read: %v", calls)
	}
	for i := 0; i < 5; i++ { // nothing more in the menus
		c.t = c.t.Add(time.Minute)
		if d := w.step(); d != 0 {
			t.Fatalf("wakes again: %v", d)
		}
	}
	if len(g.took()) != 0 {
		t.Fatal("read again in the menus")
	}
	w.note(true, false, 0)
	w.step()
	w.note(false, false, 0) // a session ended 5 minutes after the last read: waits for the 10
	if d := w.step(); d != 5*time.Minute || len(g.took()) != 0 {
		t.Fatalf("read too soon (%v)", d)
	}
	c.t = c.t.Add(5 * time.Minute)
	w.step()
	if n := len(g.took()); n != 2 {
		t.Fatalf("after the session: %d calls", n)
	}
	// the source closes and opens again in the menus every few seconds: not a new start
	w.closed()
	c.t = c.t.Add(11 * time.Minute)
	w.opened()
	w.step()
	if n := len(g.took()); n != 2 { // closed for longer than the grace: the game started again
		t.Fatalf("after a restart: %d", n)
	}
	w.closed()
	c.t = c.t.Add(10 * time.Second)
	w.opened()
	w.step()
	if n := len(g.took()); n != 0 {
		t.Fatalf("a reopen read again: %d", n)
	}
	// an admin's PC found where the ratings are: every PC with that file reads it
	lmuLearnRatingPath(w.dir, "/rest/profile/ratings")
	if p := lmuRatingPaths(w.dir); strings.Join(p, " ") != "/rest/profile/ratings" {
		t.Fatalf("paths: %v", p)
	}
	w.note(true, true, 0)
	w.step()
	w.note(false, false, 0)
	c.t = c.t.Add(lmuRateEvery)
	w.step()
	if calls := g.took(); len(calls) != 1 || calls[0] != "/rest/profile/ratings" {
		t.Fatalf("learnt path: %v", calls)
	}
	if r := ratingsCopy()["lmu"]; r == nil || r.SR != "Silver 2.45" {
		t.Fatalf("rating: %+v", r)
	}
	// never the whole API on a PC that is not an admin's
	if w.exp != nil {
		t.Fatal("explorer on a driver's PC")
	}
	if _, err := os.Stat(filepath.Join(w.dir, "lmu-api")); err == nil {
		t.Fatal("lmu-api folder on a driver's PC")
	}
}

// an admin's PC: every GET path once (one request a step), paused the moment a session loads and on from there, sent
// once, and not again for the same version
func TestLMUExplorerAdmin(t *testing.T) {
	w, g, c := lmuTestWorker(t, true)
	var sent []lmuAPIItem
	posts := 0
	w.opened()
	w.note(false, false, 14000)
	w.step() // the ratings first
	g.took()
	if w.exp == nil {
		w.step() // the list
	}
	if calls := g.took(); len(calls) != 1 || calls[0] != "/swagger-schema.json" {
		t.Fatalf("list: %v", calls)
	}
	w.exp.post = func(run *lmuAPIRun, items []lmuAPIItem) error {
		posts++
		sent = append(sent, items...)
		return nil
	}
	steps := 0
	paused := false
	for steps < 100 {
		steps++
		c.t = c.t.Add(lmuAPIPace)
		d := w.step()
		calls := g.took()
		if len(calls) > 1 {
			t.Fatalf("step %d: %d requests %v", steps, len(calls), calls)
		}
		if len(calls) == 1 && d != lmuAPIPace {
			t.Fatalf("step %d: next in %v", steps, d)
		}
		if !paused && len(calls) == 1 && calls[0] == "/rest/race/car" {
			// a session loads while the next request is in flight: cancelled, nothing more until the menus
			paused = true
			g.during = func(string) { w.note(true, false, 0) }
			w.step()
			g.during = nil
			if got := g.took(); len(got) != 1 {
				t.Fatalf("in flight: %v", got)
			}
			for i := 0; i < 3; i++ {
				if d := w.step(); d != 0 || len(g.took()) != 0 {
					t.Fatal("read in a session")
				}
			}
			w.note(false, false, 0)
			continue
		}
		if d == 0 {
			break
		}
	}
	if !paused || posts == 0 {
		t.Fatalf("paused %v, posts %d", paused, posts)
	}
	byPath := map[string]lmuAPIItem{}
	for _, it := range sent {
		if _, dup := byPath[it.Path]; dup {
			t.Fatalf("%s twice", it.Path)
		}
		byPath[it.Path] = it
	}
	for _, p := range []string{"#meta", "#swagger/0", "/rest/tracks", "/rest/tracks/lemans", "/rest/tracks/spa", "/rest/race/car", "/rest/profile/ratings",
		"/rest/sessions/weather?session=RACE", "/rest/sessions/weather?session=QUALIFY", "/rest/sessions/info", "/rest/cars/{carId}"} {
		if _, ok := byPath[p]; !ok {
			t.Errorf("missing %s (sent %d)", p, len(sent))
		}
	}
	for p := range byPath {
		if strings.Contains(p, "join") || strings.Contains(p, "setSetup") {
			t.Fatalf("called %s", p)
		}
	}
	if it := byPath["/rest/cars/{carId}"]; it.Status != 0 || !strings.Contains(it.Body, "no value for carId") {
		t.Fatalf("unfilled: %+v", it)
	}
	if it := byPath["/rest/race/car"]; it.Body != "hello" || it.Ctype != "text/plain" {
		t.Fatalf("text: %+v", it)
	}
	if !strings.Contains(byPath["#meta"].Body, "/rest/multiplayer/join") {
		t.Fatalf("meta: %s", byPath["#meta"].Body)
	}
	if p := lmuRatingPaths(w.dir); p[0] != "/rest/profile/ratings" {
		t.Fatalf("rating path not learnt: %v", p)
	}
	// the same version again (another run of the game): only the list is read, nothing sent
	w2 := newLMURestWorker()
	w2.fetch, w2.now, w2.admin, w2.dir = g.fetch, c.now, func() bool { return true }, w.dir
	w2.opened()
	w2.note(false, false, 0)
	w2.lastRead = c.t // the ratings were read just now
	w2.gameSeen = true
	for i := 0; i < 5; i++ {
		w2.step()
	}
	if calls := g.took(); len(calls) != 1 || calls[0] != "/swagger-schema.json" {
		t.Fatalf("same version read again: %v", calls)
	}
}

// the caps: an answer read up to 1 MB, a bigger one keeps its first 256 KB and its size; the upload's batches
func TestLMUAPICaps(t *testing.T) {
	big := strings.Repeat("x", 3<<20)
	srv := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		w.Header().Set("Content-Type", "application/json")
		if r.URL.Path == "/big" {
			io.WriteString(w, `{"a":"`+big+`"}`)
			return
		}
		io.WriteString(w, `{"ok":true}`)
	}))
	defer srv.Close()
	a := lmuFetch(context.Background(), srv.URL+"/big")
	if a.err != nil || !a.trunc || len(a.body) != lmuKeepCap || a.size != int64(len(big)+8) {
		t.Fatalf("big: err %v trunc %v body %d size %d", a.err, a.trunc, len(a.body), a.size)
	}
	if a := lmuFetch(context.Background(), srv.URL+"/small"); a.err != nil || a.trunc || string(a.body) != `{"ok":true}` || a.code != 200 {
		t.Fatalf("small: %+v", a)
	}
	e := &lmuExplorer{vals: map[string][]string{}, valsAt: map[string]map[string][]string{}}
	it := e.item("/x", lmuAnswer{code: 200, body: []byte(strings.Repeat("y", 100<<10))})
	if len(it.Body) != lmuAPITextCap || !it.Trunc {
		t.Fatalf("text kept %d", len(it.Body))
	}
	items := make([]lmuAPIItem, 0, 400)
	for i := 0; i < 400; i++ {
		items = append(items, lmuAPIItem{Path: "/p", Body: strings.Repeat("z", 100<<10)})
	}
	bs := lmuAPIBatches(items)
	n := 0
	for _, b := range bs {
		size := 0
		for _, it := range b {
			size += len(it.Body)
		}
		if size > lmuAPIBatch || len(b) > lmuAPIBatchN {
			t.Fatalf("batch of %d items, %d bytes", len(b), size)
		}
		n += len(b)
	}
	if n != 400 || len(bs) < 10 {
		t.Fatalf("%d items in %d batches", n, len(bs))
	}
}

// the upload: only with an admin signed in (a driver's PC never posts), gzipped, with the account's token
func TestLMUAPIUploadGate(t *testing.T) {
	var got []map[string]any
	var auth string
	srv := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		auth = r.Header.Get("Authorization")
		if r.URL.Path != "/community/admin/lmu-api" || r.Header.Get("Content-Type") != "application/gzip" {
			w.WriteHeader(400)
			return
		}
		z, err := gzip.NewReader(r.Body)
		if err != nil {
			w.WriteHeader(400)
			return
		}
		var m map[string]any
		json.NewDecoder(z).Decode(&m)
		got = append(got, m)
		io.WriteString(w, `{"ok":true}`)
	}))
	defer srv.Close()
	localServerMu.Lock()
	savedURL := localServerURL
	localServerURL = srv.URL
	localServerMu.Unlock()
	loadPL()
	plMu.Lock()
	savedAcc := plAcc
	plAcc = plAccount{Token: strings.Repeat("t", 48)}
	plMu.Unlock()
	defer func() {
		localServerMu.Lock()
		localServerURL = savedURL
		localServerMu.Unlock()
		plMu.Lock()
		plAcc = savedAcc
		plMu.Unlock()
	}()
	run := &lmuAPIRun{Version: "1.2-abcdef01"}
	items := []lmuAPIItem{{Path: "/rest/tracks", Status: 200, Body: "[]"}}
	if err := lmuAPIUpload(run, items); err != errLMUNotAdmin || len(got) != 0 {
		t.Fatalf("a driver's PC posted: %v %d", err, len(got))
	}
	plMu.Lock()
	plAcc.Admin = true
	plMu.Unlock()
	if err := lmuAPIUpload(run, items); err != nil || len(got) != 1 {
		t.Fatalf("admin: %v %d", err, len(got))
	}
	if got[0]["version"] != "1.2-abcdef01" || got[0]["game"] != "lmu" || auth != "Bearer "+strings.Repeat("t", 48) {
		t.Fatalf("payload: %v %s", got[0], auth)
	}
}

// a path the game closes on is never asked again (the agent saw the error, or it stopped too and only the pending
// request on disk tells), and after lmuAPICrashMax of them the reading ends and what it has is sent
func TestLMUExplorerCrash(t *testing.T) {
	w, g, c := lmuTestWorker(t, true)
	g.crash = map[string]bool{"/rest/tracks": true}
	var sent []lmuAPIItem
	post := func(run *lmuAPIRun, items []lmuAPIItem) error { sent = append(sent, items...); return nil }
	run := func(n int) []string {
		var all []string
		for i := 0; i < n; i++ {
			c.t = c.t.Add(lmuAPIPace)
			if w.exp != nil {
				w.exp.post = post
			}
			w.step()
			all = append(all, g.took()...)
		}
		return all
	}
	w.opened()
	w.note(false, false, 14000)
	for i := 0; i < 40 && (w.exp == nil || w.exp.run == nil || w.exp.run.Crashes == 0); i++ {
		run(1)
	}
	if w.exp.run.Crashes != 1 {
		t.Fatalf("crashes %d", w.exp.run.Crashes)
	}
	// the game starts again: /rest/tracks never again
	g.crash = map[string]bool{"/rest/sessions/weather?session=RACE": true}
	lmuTestRestart(w, c)
	w.note(false, false, 0)
	calls := run(40)
	for _, p := range calls {
		if p == "/rest/tracks" {
			t.Fatal("asked again for a path the game closed on")
		}
	}
	// the second crash ends it: sent with what it read
	if w.exp.run.Crashes != 2 || !w.exp.run.Sent {
		t.Fatalf("crashes %d sent %v", w.exp.run.Crashes, w.exp.run.Sent)
	}
	found := 0
	for _, it := range sent {
		if (it.Path == "/rest/tracks" || it.Path == "/rest/sessions/weather?session=RACE") && strings.HasPrefix(it.Body, "game closed") {
			found++
		}
	}
	if found != 2 {
		t.Fatalf("crashed paths sent: %d of %d", found, len(sent))
	}
	if run(5); len(g.took()) != 0 {
		t.Fatal("asked more after it was sent")
	}
}

// the agent stopped with the game: the request on disk is the one the game closed on
func TestLMUExplorerPendingOnDisk(t *testing.T) {
	w, g, c := lmuTestWorker(t, true)
	w.opened()
	w.note(false, false, 14000)
	for w.exp == nil || w.exp.run == nil {
		c.t = c.t.Add(lmuAPIPace)
		w.step()
	}
	ver := w.exp.run.Version
	w.exp.markPending("/rest/tracks")
	g.took()
	lmuTestRestart(w, c) // a new run of the game (and of the agent's explorer)
	w.note(false, false, 0)
	for i := 0; i < 40; i++ {
		c.t = c.t.Add(lmuAPIPace)
		if w.exp != nil {
			w.exp.post = func(*lmuAPIRun, []lmuAPIItem) error { return nil }
		}
		w.step()
		for _, p := range g.took() {
			if p == "/rest/tracks" {
				t.Fatal("asked again for the pending path")
			}
		}
	}
	if w.exp.run.Version != ver || w.exp.run.Crashes != 1 {
		t.Fatalf("run %s crashes %d", w.exp.run.Version, w.exp.run.Crashes)
	}
}

func lmuTestRestart(w *lmuRestWorker, c *lmuClock) {
	w.closed()
	c.t = c.t.Add(lmuGameGrace + time.Second)
	w.opened()
}
