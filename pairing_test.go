package main

import (
	"net/http"
	"net/http/httptest"
	"strings"
	"testing"
)

func TestPairing(t *testing.T) {
	dir := t.TempDir()
	t.Setenv("XDG_CONFIG_HOME", dir)
	t.Setenv("HOME", dir)
	t.Setenv("APPDATA", dir)
	mux := http.NewServeMux()
	registerPairRoutes(mux)
	mux.HandleFunc("/api/info", func(w http.ResponseWriter, r *http.Request) { w.Write([]byte("ok")) })
	mux.HandleFunc("/api/config", func(w http.ResponseWriter, r *http.Request) { w.Write([]byte("ok")) })
	h := guard(mux)
	do := func(addr, method, path, body string, c *http.Cookie) *httptest.ResponseRecorder {
		req := httptest.NewRequest(method, path, strings.NewReader(body))
		req.RemoteAddr = addr
		req.Host = "192.168.1.10:8484"
		if c != nil {
			req.AddCookie(c)
		}
		rec := httptest.NewRecorder()
		h.ServeHTTP(rec, req)
		return rec
	}
	if r := do("127.0.0.1:5000", "GET", "/api/info", "", nil); r.Code != 200 {
		t.Fatalf("the PC itself must not need a PIN: %d", r.Code)
	}
	if r := do("127.0.0.7:5000", "GET", "/api/info", "", nil); r.Code != 200 {
		t.Fatal("overlay windows (127.0.0.x) must not need a PIN")
	}
	if r := do("192.168.1.20:5000", "GET", "/api/info", "", nil); r.Code != 200 {
		t.Fatal("the phone app must be able to find the PC before pairing")
	}
	if r := do("192.168.1.20:5000", "GET", "/api/config", "", nil); r.Code != 401 {
		t.Fatalf("a phone without PIN must be refused: %d", r.Code)
	}
	if r := do("192.168.1.20:5000", "GET", "/", "", nil); r.Code != 302 || !strings.HasPrefix(r.Header().Get("Location"), "/pair") {
		t.Fatalf("pages go to the pairing screen: %d %s", r.Code, r.Header().Get("Location"))
	}
	if r := do("192.168.1.20:5000", "POST", "/api/pair", `{"pin":"000000x"}`, nil); r.Code != 403 {
		t.Fatal("wrong PIN accepted")
	}
	pairMu.Lock()
	pin := currentPINLocked()
	pairMu.Unlock()
	r := do("192.168.1.20:5000", "POST", "/api/pair", `{"pin":"`+pin+`"}`, nil)
	if r.Code != 200 {
		t.Fatalf("right PIN refused: %d %s", r.Code, r.Body)
	}
	var cookie *http.Cookie
	for _, c := range r.Result().Cookies() {
		if c.Name == "pw_dev" {
			cookie = c
		}
	}
	if cookie == nil || !cookie.HttpOnly {
		t.Fatal("no device cookie")
	}
	if r := do("192.168.1.20:5000", "GET", "/api/config", "", cookie); r.Code != 200 {
		t.Fatal("paired device refused")
	}
	pairMu.Lock()
	again := currentPINLocked()
	pairMu.Unlock()
	if again == pin {
		t.Fatal("the PIN must change after use")
	}
	for i := 0; i < 6; i++ {
		do("192.168.1.30:5000", "POST", "/api/pair", `{"pin":"111111"}`, nil)
	}
	if r := do("192.168.1.30:5000", "POST", "/api/pair", `{"pin":"`+again+`"}`, nil); r.Code != 403 {
		t.Fatal("after 5 wrong PINs the address must wait")
	}
	if r := do("192.168.1.20:5000", "GET", "/api/devices", "", cookie); r.Code != 403 {
		t.Fatal("devices are managed from the PC only")
	}
}
