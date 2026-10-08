package main

// Engineer sharing. On the same network anyone can open the PC's address.
// For another house, Pitlane HQ starts a free Cloudflare quick tunnel
// (cloudflared, downloaded from Cloudflare's GitHub releases on first use)
// and gives a private link. Remote viewers need the key in that link and get a
// read-only view: no settings, overlays or account data.

import (
	"bufio"
	"crypto/rand"
	"encoding/hex"
	"errors"
	"fmt"
	"io"
	"log"
	"net"
	"net/http"
	"net/url"
	"os"
	"os/exec"
	"path/filepath"
	"regexp"
	"runtime"
	"strings"
	"sync"
	"time"
)

var (
	shareMu   sync.Mutex
	shareCmd  *exec.Cmd
	shareURL  string
	shareKey  string
	shareErr  string
	shareBusy bool
	tunnelRe  = regexp.MustCompile(`https://[a-z0-9-]+\.trycloudflare\.com`)
)

func newKey() string {
	b := make([]byte, 12)
	rand.Read(b)
	return hex.EncodeToString(b)
}

func cloudflaredPath() string {
	dir := os.Getenv("LOCALAPPDATA")
	if dir == "" {
		dir, _ = os.UserCacheDir()
	}
	name := "cloudflared"
	if runtime.GOOS == "windows" {
		name += ".exe"
	}
	return filepath.Join(dir, "PitlaneHQ", name)
}

func ensureCloudflared() (string, error) {
	p := cloudflaredPath()
	if st, err := os.Stat(p); err == nil && st.Size() > 5<<20 {
		return p, nil
	}
	if path, err := exec.LookPath("cloudflared"); err == nil {
		return path, nil
	}
	asset := map[string]string{"windows": "cloudflared-windows-amd64.exe", "linux": "cloudflared-linux-amd64", "darwin": "cloudflared-darwin-amd64.tgz"}[runtime.GOOS]
	if asset == "" || strings.HasSuffix(asset, ".tgz") {
		return "", errors.New("internet sharing is not available on this system")
	}
	log.Println("Downloading cloudflared for internet sharing...")
	client := &http.Client{Timeout: 5 * time.Minute}
	resp, err := client.Get("https://github.com/cloudflare/cloudflared/releases/latest/download/" + asset)
	if err != nil {
		return "", fmt.Errorf("could not download cloudflared: %w", err)
	}
	defer resp.Body.Close()
	if resp.StatusCode != 200 {
		return "", fmt.Errorf("could not download cloudflared (HTTP %d)", resp.StatusCode)
	}
	os.MkdirAll(filepath.Dir(p), 0o755)
	tmp := p + ".part"
	f, err := os.Create(tmp)
	if err != nil {
		return "", err
	}
	n, err := io.Copy(f, resp.Body)
	f.Close()
	if err != nil || n < 5<<20 {
		os.Remove(tmp)
		return "", errors.New("cloudflared download was incomplete")
	}
	os.Chmod(tmp, 0o755)
	if err := os.Rename(tmp, p); err != nil {
		return "", err
	}
	return p, nil
}

func startShare() {
	shareMu.Lock()
	if shareBusy || shareCmd != nil {
		shareMu.Unlock()
		return
	}
	shareBusy, shareErr, shareURL = true, "", ""
	if shareKey == "" {
		shareKey = newKey()
	}
	shareMu.Unlock()
	fail := func(err error) {
		shareMu.Lock()
		shareErr, shareBusy = err.Error(), false
		shareMu.Unlock()
		log.Println("Sharing:", err)
	}
	bin, err := ensureCloudflared()
	if err != nil {
		fail(err)
		return
	}
	cmd := exec.Command(bin, "tunnel", "--no-autoupdate", "--url", fmt.Sprintf("http://localhost:%d", listenPort))
	hideChildWindow(cmd)
	stderr, _ := cmd.StderrPipe()
	if err := cmd.Start(); err != nil {
		fail(err)
		return
	}
	shareMu.Lock()
	shareCmd = cmd
	shareMu.Unlock()
	go func() {
		sc := bufio.NewScanner(stderr)
		for sc.Scan() {
			if m := tunnelRe.FindString(sc.Text()); m != "" {
				shareMu.Lock()
				if shareURL == "" {
					shareURL = m
					shareBusy = false
					log.Println("Engineer link ready")
				}
				shareMu.Unlock()
			}
		}
	}()
	go func() {
		cmd.Wait()
		shareMu.Lock()
		if shareCmd == cmd {
			shareCmd, shareURL, shareBusy = nil, "", false
		}
		shareMu.Unlock()
	}()
	go func() { // give up if no link appears
		time.Sleep(45 * time.Second)
		shareMu.Lock()
		stuck := shareCmd == cmd && shareURL == ""
		shareMu.Unlock()
		if stuck {
			cmd.Process.Kill()
			fail(errors.New("Cloudflare did not give a link; check the internet connection and try again"))
		}
	}()
}

func stopShare() {
	shareMu.Lock()
	defer shareMu.Unlock()
	if shareCmd != nil && shareCmd.Process != nil {
		shareCmd.Process.Kill()
	}
	shareCmd, shareURL, shareBusy, shareErr = nil, "", false, ""
	shareKey = newKey() // old links stop working
}

func shareStatus() map[string]any {
	shareMu.Lock()
	defer shareMu.Unlock()
	link := ""
	if shareURL != "" {
		link = shareURL + "/?k=" + shareKey
	}
	return map[string]any{"active": shareCmd != nil, "starting": shareBusy, "link": link, "error": shareErr}
}

// isRemote reports a request that arrived through the internet link.
func isRemote(r *http.Request) bool {
	return r.Header.Get("Cf-Connecting-Ip") != "" || strings.HasSuffix(strings.Split(r.Host, ":")[0], ".trycloudflare.com")
}

var remoteBlocked = []string{"/api/account", "/api/desk", "/api/live/", "/api/iracing/", "/api/g61/", "/api/overlay/", "/api/share", "/api/demo", "/api/config", "/api/map", "/api/profile", "/api/apps", "/api/haptics", "/api/cloud", "/api/setups", "/api/cars", "/api/radio", "/api/voicepack", "/api/races", "/api/notes", "/api/trackbook", "/api/discord", "/api/update", "/api/news", "/api/devices", "/api/license", "/api/community", "/api/sync"}

// guard protects the app from remote viewers: they need the share key and can only read.
func guard(next http.Handler) http.Handler {
	return http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		h := w.Header()
		h.Set("X-Content-Type-Options", "nosniff")
		h.Set("Referrer-Policy", "no-referrer")
		h.Set("X-Frame-Options", "SAMEORIGIN")
		// DNS rebinding: a website must not reach this app by pointing its own name at your PC
		if !hostAllowed(r.Host) {
			http.Error(w, "blocked: unknown host name", 403)
			return
		}
		// A web page open in your browser must not be able to change settings
		// or start programs through this app: changes only from Pitlane HQ itself.
		if r.Method != http.MethodGet && r.Method != http.MethodHead {
			if o := r.Header.Get("Origin"); o != "" && o != "null" {
				if u, err := url.Parse(o); err != nil || u.Host != r.Host {
					http.Error(w, "blocked: request from another website", 403)
					return
				}
			}
		}
		// devices on your network must be paired with the PIN first
		if needsPairing(w, r) {
			if strings.HasPrefix(r.URL.Path, "/api/") {
				w.WriteHeader(401)
				writeJSON(w, map[string]string{"error": "pair this device with the PIN shown on the PC"})
				return
			}
			http.Redirect(w, r, "/pair?next="+url.QueryEscape(r.URL.RequestURI()), http.StatusFound)
			return
		}
		if !isRemote(r) {
			next.ServeHTTP(w, r)
			return
		}
		shareMu.Lock()
		key := shareKey
		shareMu.Unlock()
		ok := key != "" && r.URL.Query().Get("k") == key
		if c, err := r.Cookie("pw_k"); err == nil && key != "" && c.Value == key {
			ok = true
		}
		if !ok {
			w.Header().Set("Content-Type", "text/html; charset=utf-8")
			w.WriteHeader(403)
			fmt.Fprint(w, `<!doctype html><meta name="viewport" content="width=device-width"><body style="font:16px system-ui;background:#11151b;color:#e7ebf1;padding:24px"><h2>Pitlane HQ</h2><p>This link has expired. Ask the driver for a new one.<br>Este enlace ha caducado. Pide uno nuevo al piloto.</p>`)
			return
		}
		if r.URL.Query().Get("k") == key {
			http.SetCookie(w, &http.Cookie{Name: "pw_k", Value: key, Path: "/", HttpOnly: true, Secure: true, SameSite: http.SameSiteLaxMode})
		}
		if r.Method != http.MethodGet && r.Method != http.MethodHead {
			http.Error(w, "read-only engineer view", 403)
			return
		}
		for _, p := range remoteBlocked {
			if strings.HasPrefix(r.URL.Path, p) && !(p == "/api/config" && r.Method == http.MethodGet) && !(p == "/api/map" && r.Method == http.MethodGet) {
				http.Error(w, "not available in the engineer view", 403)
				return
			}
		}
		next.ServeHTTP(w, r)
	})
}

func registerShareRoutes(mux *http.ServeMux) {
	mux.HandleFunc("/api/share", func(w http.ResponseWriter, r *http.Request) {
		if r.Method == http.MethodPost {
			switch r.URL.Query().Get("action") {
			case "start":
				go startShare()
				time.Sleep(300 * time.Millisecond)
			case "stop":
				stopShare()
			}
		}
		writeJSON(w, shareStatus())
	})
}

// hostAllowed accepts IP addresses, localhost, this PC's name, local network
// names (.local, .lan, .home, .internal) and the engineer link.
func hostAllowed(hostport string) bool {
	h := strings.ToLower(hostport)
	if hh, _, err := net.SplitHostPort(h); err == nil {
		h = hh
	}
	h = strings.Trim(h, "[]")
	if h == "" || net.ParseIP(h) != nil || h == "localhost" || !strings.Contains(h, ".") {
		return true
	}
	if pc, _ := os.Hostname(); pc != "" && strings.HasPrefix(h, strings.ToLower(pc)+".") {
		return true
	}
	for _, suf := range []string{".local", ".lan", ".home", ".internal", ".home.arpa", ".localhost", ".trycloudflare.com"} {
		if strings.HasSuffix(h, suf) {
			return true
		}
	}
	return false
}
