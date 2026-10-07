package main

// Pairing: a phone, tablet or another PC on your network must enter the PIN
// shown on this PC before it can see or control TrackIQ. Paired devices
// get a long random token (only its hash is stored) and can be removed.
// TrackIQ's own windows (a ticket in their address, localtoken.go) never need it.

import (
	"crypto/rand"
	"crypto/sha256"
	"crypto/subtle"
	"encoding/hex"
	"encoding/json"
	"fmt"
	"io"
	"math/big"
	"net"
	"net/http"

	"path/filepath"
	"strings"
	"sync"
	"time"
)

type pairedDevice struct {
	ID       string    `json:"id"`
	Name     string    `json:"name"`
	Hash     string    `json:"hash"`
	Added    time.Time `json:"added"`
	LastSeen time.Time `json:"lastSeen"`
}

type pairFile struct {
	Off     bool           `json:"off"` // the owner turned the PIN off
	Devices []pairedDevice `json:"devices"`
}

var (
	pairMu    sync.Mutex
	pairs     pairFile
	pairPIN   string
	pairPINAt time.Time
	pairFails = map[string][]time.Time{}
	pairLoad  sync.Once
)

func pairPath() string { return filepath.Join(dataDir(), "paired.json") }

func loadPairs() {
	pairLoad.Do(func() {
		if b, err := readSecret(pairPath()); err == nil {
			json.Unmarshal(b, &pairs)
		}
	})
}

func savePairsLocked() {
	b, _ := json.Marshal(pairs)
	writeSecret(pairPath(), b)
}

func tokenHash(t string) string {
	h := sha256.Sum256([]byte("pitlane-pair-v1:" + t))
	return hex.EncodeToString(h[:])
}

// currentPIN changes every 10 minutes and after each use.
func currentPINLocked() string {
	if pairPIN == "" || time.Since(pairPINAt) > 10*time.Minute {
		n, _ := rand.Int(rand.Reader, big.NewInt(1000000))
		pairPIN, pairPINAt = fmt.Sprintf("%06d", n.Int64()), time.Now()
	}
	return pairPIN
}

func isLoopback(r *http.Request) bool {
	host, _, err := net.SplitHostPort(r.RemoteAddr)
	if err != nil {
		host = r.RemoteAddr
	}
	ip := net.ParseIP(host)
	return ip != nil && ip.IsLoopback()
}

// devicePaired reports whether a request from the network carries a valid token.
func devicePaired(r *http.Request) bool {
	loadPairs()
	c, err := r.Cookie("pw_dev")
	if err != nil || len(c.Value) < 20 {
		return false
	}
	h := tokenHash(c.Value)
	pairMu.Lock()
	defer pairMu.Unlock()
	for i := range pairs.Devices {
		if subtle.ConstantTimeCompare([]byte(pairs.Devices[i].Hash), []byte(h)) == 1 {
			if time.Since(pairs.Devices[i].LastSeen) > time.Hour {
				pairs.Devices[i].LastSeen = time.Now()
				savePairsLocked()
			}
			return true
		}
	}
	return false
}

func pinRequired() bool {
	loadPairs()
	pairMu.Lock()
	defer pairMu.Unlock()
	return !pairs.Off
}

// needsPairing: requests from the network (not the engineer link) without a paired token, and
// requests from this PC that do not come from one of TrackIQ's own windows (see localtoken.go).
func needsPairing(w http.ResponseWriter, r *http.Request) bool {
	if isRemote(r) || !pinRequired() {
		return false
	}
	p := r.URL.Path
	if p == "/pair" || p == "/api/pair" || p == "/api/info" || p == "/favicon.ico" {
		return false
	}
	if isLoopback(r) {
		if localOpen(p) || localWindow(w, r) {
			return false
		}
	}
	return !devicePaired(r)
}

// needsPairingAny: a network device that is not paired yet (whatever the page).
func needsPairingAny(r *http.Request) bool {
	return !isLoopback(r) && !isRemote(r) && pinRequired() && !devicePaired(r)
}

// pairCode is what the phone app asks for: the last number of this PC's
// address on the Wi-Fi and the PIN, e.g. "23-481 902". The app only looks
// for the PC on the local network; nothing goes through the internet.
func pairCodes(pin string) []string {
	var out []string
	for _, u := range lanURLs() {
		host := strings.TrimPrefix(u, "http://")
		if i := strings.LastIndex(host, ":"); i > 0 {
			host = host[:i]
		}
		if parts := strings.Split(host, "."); len(parts) == 4 {
			out = append(out, parts[3]+"-"+pin)
		}
	}
	return out
}

func tryPair(w http.ResponseWriter, r *http.Request, pin, name string) error {
	host, _, _ := net.SplitHostPort(r.RemoteAddr)
	pairMu.Lock()
	defer pairMu.Unlock()
	// five wrong PINs in 5 minutes block that address for a while
	var recent []time.Time
	for _, t := range pairFails[host] {
		if time.Since(t) < 5*time.Minute {
			recent = append(recent, t)
		}
	}
	pairFails[host] = recent
	if len(recent) >= 5 {
		return fmt.Errorf("too many wrong PINs: wait 5 minutes")
	}
	want := currentPINLocked()
	if subtle.ConstantTimeCompare([]byte(strings.TrimSpace(pin)), []byte(want)) != 1 {
		pairFails[host] = append(pairFails[host], time.Now())
		return fmt.Errorf("wrong PIN")
	}
	tok := make([]byte, 32)
	rand.Read(tok)
	t := hex.EncodeToString(tok)
	id := make([]byte, 4)
	rand.Read(id)
	name = cleanText(name, 40)
	if name == "" {
		name = deviceName(r.UserAgent())
	}
	pairs.Devices = append(pairs.Devices, pairedDevice{ID: hex.EncodeToString(id), Name: name, Hash: tokenHash(t), Added: time.Now(), LastSeen: time.Now()})
	savePairsLocked()
	pairPIN = "" // a new PIN for the next device
	http.SetCookie(w, &http.Cookie{Name: "pw_dev", Value: t, Path: "/", HttpOnly: true, SameSite: http.SameSiteLaxMode, Expires: time.Now().AddDate(5, 0, 0)})
	return nil
}

func deviceName(ua string) string {
	switch {
	case strings.Contains(ua, "iPhone"):
		return "iPhone"
	case strings.Contains(ua, "iPad"):
		return "iPad"
	case strings.Contains(ua, "Android"):
		return "Android"
	case strings.Contains(ua, "Windows"):
		return "Windows PC"
	case strings.Contains(ua, "Mac"):
		return "Mac"
	}
	return "Device"
}

const pairPage = `<!doctype html><html lang="en"><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>TrackIQ · Pair</title>
<style>body{margin:0;min-height:100vh;display:grid;place-items:center;background:#11151b;color:#e7ebf1;font:16px system-ui,sans-serif}main{width:min(360px,calc(100% - 32px));text-align:center}
h1{font-size:22px;letter-spacing:.06em;text-transform:uppercase}p{color:#8a97a9;line-height:1.5}input{width:100%;box-sizing:border-box;font:700 34px ui-monospace,monospace;letter-spacing:.3em;text-align:center;padding:14px;border-radius:10px;border:1px solid #2b3542;background:#19202a;color:#e7ebf1}
button{margin-top:14px;width:100%;padding:14px;border:0;border-radius:10px;background:#ffb02e;color:#11151b;font:700 16px system-ui;text-transform:uppercase;letter-spacing:.06em}.err{color:#ff6363;min-height:1.4em}</style>
<main><h1>TrackIQ</h1><p id="t">Enter the PIN shown on your PC: TrackIQ → Settings → Phone.<br>Escribe el PIN que aparece en tu PC: TrackIQ → Ajustes → Móvil.</p>
<form id="f"><input id="pin" inputmode="numeric" autocomplete="one-time-code" maxlength="6" pattern="[0-9]{6}" required autofocus><div class="err" id="e"></div><button>Pair / Emparejar</button></form></main>
<script>const q=new URLSearchParams(location.search);const go=async pin=>{const r=await fetch("/api/pair",{method:"POST",headers:{"Content-Type":"application/json"},body:JSON.stringify({pin,name:""})});const j=await r.json().catch(()=>({}));if(r.ok){location.href=q.get("next")&&q.get("next").startsWith("/")?q.get("next"):"/"}else document.getElementById("e").textContent=j.error||"Error"};
document.getElementById("f").onsubmit=e=>{e.preventDefault();go(document.getElementById("pin").value)};if(q.get("pin"))go(q.get("pin"));</script></html>`

func registerPairRoutes(mux *http.ServeMux) {
	mux.HandleFunc("/pair", func(w http.ResponseWriter, r *http.Request) {
		w.Header().Set("Content-Type", "text/html; charset=utf-8")
		w.Header().Set("Cache-Control", "no-store")
		io.WriteString(w, pairPage)
	})
	mux.HandleFunc("/api/pair", func(w http.ResponseWriter, r *http.Request) {
		if r.Method != http.MethodPost {
			http.Error(w, "POST only", 405)
			return
		}
		var in struct{ PIN, Name string }
		json.NewDecoder(io.LimitReader(r.Body, 1024)).Decode(&in)
		if err := tryPair(w, r, in.PIN, in.Name); err != nil {
			w.WriteHeader(403)
			writeJSON(w, map[string]string{"error": err.Error()})
			return
		}
		writeJSON(w, map[string]bool{"paired": true})
	})
	// managed from the PC only
	mux.HandleFunc("/api/devices", func(w http.ResponseWriter, r *http.Request) {
		if !isLoopback(r) || isRemote(r) {
			http.Error(w, "only from this PC", 403)
			return
		}
		loadPairs()
		pairMu.Lock()
		defer pairMu.Unlock()
		if r.Method == http.MethodPost {
			var in struct {
				Action, ID string
				On         bool
			}
			json.NewDecoder(io.LimitReader(r.Body, 1024)).Decode(&in)
			switch in.Action {
			case "remove":
				out := pairs.Devices[:0]
				for _, d := range pairs.Devices {
					if d.ID != in.ID {
						out = append(out, d)
					}
				}
				pairs.Devices = out
			case "removeAll":
				pairs.Devices = nil
			case "pin":
				pairs.Off = !in.On
			case "newpin":
				pairPIN = ""
			}
			savePairsLocked()
		}
		type dev struct {
			ID       string    `json:"id"`
			Name     string    `json:"name"`
			Added    time.Time `json:"added"`
			LastSeen time.Time `json:"lastSeen"`
		}
		list := []dev{}
		for _, d := range pairs.Devices {
			list = append(list, dev{d.ID, d.Name, d.Added, d.LastSeen})
		}
		pin := currentPINLocked()
		writeJSON(w, map[string]any{"pin": pin, "codes": pairCodes(pin), "urls": lanURLs(), "pinOn": !pairs.Off, "expires": pairPINAt.Add(10 * time.Minute).UnixMilli(), "devices": list})
	})
}

// appPairLink is the address in the QR code: the phone's camera opens this PC in its
// browser on the same Wi-Fi, paired with the current PIN.
func appPairLink() string {
	urls := lanURLs()
	if len(urls) == 0 {
		return ""
	}
	pairMu.Lock()
	pin := currentPINLocked()
	pairMu.Unlock()
	return strings.TrimSuffix(urls[0], "/") + "/pair?pin=" + pin + "&next=%2F"
}
