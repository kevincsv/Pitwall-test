package main

import (
	"bytes"
	"net/http"
	"net/http/httptest"
	"net/url"
	"strings"
	"testing"
)

// the page's read-only community proxies pass every parameter of the query through (limit, game…), not only a few
func TestProxyPathKeepsQuery(t *testing.T) {
	cases := []struct{ path, raw, want string }{
		{"/records", "game=lmu&limit=50&cat=road", "/records?cat=road&game=lmu&limit=50"},
		{"/laps", "id=abc_1&game=iracing", "/laps/abc_1?game=iracing"},
		{"/car", "carId=7", "/car?carId=7"},
		{"/combos", "", "/combos"},
		{"/model", "trackId=1&carId=2&game=iracing&v=8", "/model?carId=2&game=iracing&trackId=1&v=8"},
	}
	for _, c := range cases {
		q, _ := url.ParseQuery(c.raw)
		got, ok := proxyPath(c.path, q)
		if !ok || got != c.want {
			t.Errorf("%s?%s: %q %v, want %q", c.path, c.raw, got, ok, c.want)
		}
	}
	for _, bad := range []string{"id=../x", "id=a/b", "id=a.b", "id=" + strings.Repeat("a", 65)} {
		q, _ := url.ParseQuery(bad)
		if _, ok := proxyPath("/laps", q); ok {
			t.Errorf("%s must be refused", bad)
		}
	}
}

func TestCommunityProxyRoutes(t *testing.T) {
	dir := shareHome(t)
	t.Setenv("XDG_CONFIG_HOME", dir)
	t.Setenv("HOME", dir)
	t.Setenv("APPDATA", dir)
	seen := make(chan string, 4)
	srv := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		seen <- r.URL.RequestURI()
		w.Write([]byte(`{"n":1}`))
	}))
	defer srv.Close()
	commMu.Lock()
	old := commCfg
	commCfg = commConfig{URL: srv.URL}
	commMu.Unlock()
	defer func() { commMu.Lock(); commCfg = old; commMu.Unlock() }()
	mux := http.NewServeMux()
	registerCommunityRoutes(mux)
	for in, want := range map[string]string{
		"/api/community/car?carId=7&game=iracing":   "/community/car?carId=7&game=iracing",
		"/api/community/records?game=lmu&limit=200": "/community/records?game=lmu&limit=200",
	} {
		rec := httptest.NewRecorder()
		mux.ServeHTTP(rec, httptest.NewRequest("GET", in, nil))
		if rec.Code != 200 || rec.Body.String() != `{"n":1}` {
			t.Fatalf("%s: %d %s", in, rec.Code, rec.Body.String())
		}
		if got := <-seen; got != want {
			t.Errorf("%s reached the server as %s, want %s", in, got, want)
		}
	}
}

// an answer up to the cap is read whole; a bigger one is an error, never cut
func TestReadCapped(t *testing.T) {
	b, err := readCapped(bytes.NewReader(make([]byte, 1000)), 1000)
	if err != nil || len(b) != 1000 {
		t.Fatalf("1000 of 1000: %d %v", len(b), err)
	}
	if _, err := readCapped(bytes.NewReader(make([]byte, 1001)), 1000); err == nil {
		t.Fatal("1001 of 1000 must fail")
	}
	if commMaxAnswer < 64<<20 {
		t.Fatalf("the cap is %d MB: a session with every lap's telemetry needs 64", commMaxAnswer>>20)
	}
}

// commRequest reads an answer over the old 16 MB cap in full
func TestCommRequestBigAnswer(t *testing.T) {
	big := bytes.Repeat([]byte("a"), 20<<20)
	srv := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		w.Write([]byte(`"`))
		w.Write(big)
		w.Write([]byte(`"`))
	}))
	defer srv.Close()
	commMu.Lock()
	old := commCfg
	commCfg = commConfig{URL: srv.URL}
	commMu.Unlock()
	defer func() { commMu.Lock(); commCfg = old; commMu.Unlock() }()
	b, err := commRequestWith(commHTTPLong, "GET", "/api/sessions/x?traces=1", nil, "")
	if err != nil || len(b) != len(big)+2 {
		t.Fatalf("got %d bytes, %v", len(b), err)
	}
}
