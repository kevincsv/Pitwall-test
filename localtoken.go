package main

// The local API is only for Pitlane HQ's own windows. Another program or a web page on this PC
// used to be able to call http://localhost:8484/api/* just because it ran here; now a window
// needs a ticket that only Pitlane HQ hands out: the app window and each overlay open their
// address with a one-use ticket (?lt=…) that the server swaps for a cookie (HttpOnly,
// SameSite=Strict, so another site in your browser never sends it). Without it a loopback
// request is treated like an unpaired device: the PIN. The PIN can be turned off as before.

import (
	"crypto/rand"
	"crypto/subtle"
	"crypto/tls"
	"encoding/hex"
	"net/http"
	"strings"
	"sync"
	"time"
)

const localCookie = "pw_lt"

var (
	ltMu         sync.Mutex
	localSecret  string                   // the cookie value every Pitlane HQ window ends up with (this run only)
	localTickets = map[string]time.Time{} // one-use tickets and when they expire
)

func randHex(n int) string {
	b := make([]byte, n)
	rand.Read(b)
	return hex.EncodeToString(b)
}

// localTicket returns a fresh one-use ticket to put in a window's address (?lt=…), good for 2 minutes.
func localTicket() string {
	ltMu.Lock()
	defer ltMu.Unlock()
	if localSecret == "" {
		localSecret = randHex(32)
	}
	now := time.Now()
	for t, exp := range localTickets {
		if now.After(exp) {
			delete(localTickets, t)
		}
	}
	t := randHex(24)
	localTickets[t] = now.Add(2 * time.Minute)
	return t
}

// withTicket appends a one-use ticket to a local address.
func withTicket(u string) string {
	if i := strings.Index(u, "://"); i >= 0 && !strings.Contains(u[i+3:], "/") {
		u += "/" // "http://localhost:8484" → ".../": a plain address for the desktop shell
	}
	sep := "?"
	if strings.Contains(u, "?") {
		sep = "&"
	}
	return u + sep + "lt=" + localTicket()
}

// localCookieValue: the cookie of this run (for the desktop shell, which talks to the API directly).
func localCookieValue() string {
	ltMu.Lock()
	defer ltMu.Unlock()
	if localSecret == "" {
		localSecret = randHex(32)
	}
	return localSecret
}

func useTicket(t string) bool {
	if len(t) != 48 {
		return false
	}
	ltMu.Lock()
	defer ltMu.Unlock()
	exp, ok := localTickets[t]
	if !ok {
		return false
	}
	delete(localTickets, t)
	return time.Now().Before(exp)
}

// localWindow reports whether a loopback request comes from one of Pitlane HQ's own windows.
// A valid ticket in the address sets the cookie for the rest of the run.
func localWindow(w http.ResponseWriter, r *http.Request) bool {
	if t := r.URL.Query().Get("lt"); t != "" && useTicket(t) {
		ltMu.Lock()
		s := localSecret
		ltMu.Unlock()
		http.SetCookie(w, &http.Cookie{Name: localCookie, Value: s, Path: "/", HttpOnly: true, SameSite: http.SameSiteStrictMode})
		return true
	}
	c, err := r.Cookie(localCookie)
	if err != nil {
		return false
	}
	ltMu.Lock()
	s := localSecret
	ltMu.Unlock()
	return s != "" && subtle.ConstantTimeCompare([]byte(c.Value), []byte(s)) == 1
}

// localOpen: what any program on this PC may still ask without a ticket (nothing private):
// who is here, the pairing flow, and "bring the window to the front" when Pitlane HQ starts twice.
func localOpen(p string) bool {
	return p == "/api/info" || p == "/api/pair" || p == "/pair" || p == "/api/show" || p == "/favicon.ico" || strings.HasPrefix(p, "/icon-") || p == "/manifest.webmanifest" || p == "/api/qr"
}

// tlsTransport: every connection to the internet uses TLS 1.2 or newer (and HTTP/2 when offered).
func tlsTransport() *http.Transport {
	t := http.DefaultTransport.(*http.Transport).Clone()
	t.TLSClientConfig = &tls.Config{MinVersion: tls.VersionTLS12}
	return t
}
