package main

import (
	"net/http"
	"net/http/httptest"
	"testing"
)

// A program on this PC without a ticket is treated like an unpaired device; Pitlane HQ's own
// windows swap their one-use ticket for a cookie and are let through for the rest of the run.
func TestLocalWindowTicket(t *testing.T) {
	pairLoad.Do(func() {})
	pairMu.Lock()
	pairs = pairFile{}
	pairMu.Unlock()
	req := func(target string, cookie *http.Cookie) (*httptest.ResponseRecorder, *http.Request) {
		r := httptest.NewRequest("GET", target, nil)
		r.RemoteAddr = "127.0.0.1:5555"
		if cookie != nil {
			r.AddCookie(cookie)
		}
		return httptest.NewRecorder(), r
	}
	if w, r := req("/api/status", nil); !needsPairing(w, r) {
		t.Fatal("a loopback request without a ticket must need pairing")
	}
	if w, r := req("/api/info", nil); needsPairing(w, r) {
		t.Fatal("/api/info stays open for the phone app's connect screen")
	}
	u := withTicket("http://localhost:8484/?overlay=relative")
	w, r := req(u[len("http://localhost:8484"):], nil)
	if needsPairing(w, r) {
		t.Fatal("a window with a ticket must be let in")
	}
	var c *http.Cookie
	for _, x := range w.Result().Cookies() {
		if x.Name == localCookie {
			c = x
		}
	}
	if c == nil || !c.HttpOnly || c.SameSite != http.SameSiteStrictMode {
		t.Fatalf("the ticket must become an HttpOnly, SameSite=Strict cookie: %+v", c)
	}
	if w2, r2 := req(u[len("http://localhost:8484"):], nil); !needsPairing(w2, r2) {
		t.Fatal("a ticket is for one use")
	}
	if w3, r3 := req("/api/status", c); needsPairing(w3, r3) {
		t.Fatal("the cookie must open the API")
	}
	if w4, r4 := req("/api/status", &http.Cookie{Name: localCookie, Value: "wrong"}); !needsPairing(w4, r4) {
		t.Fatal("a wrong cookie must not open the API")
	}
}

func TestVersionLess(t *testing.T) {
	for _, c := range []struct {
		a, b string
		want bool
	}{{"0.6.0", "0.6.1", true}, {"0.6.1", "0.6.1", false}, {"0.6.10", "0.6.9", false}, {"0.9.0", "1.0.0", true}, {"v0.6.1-beta", "0.6.2", true}} {
		if got := versionLess(c.a, c.b); got != c.want {
			t.Errorf("versionLess(%q,%q)=%v", c.a, c.b, got)
		}
	}
}
