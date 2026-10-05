package main

// Rig: SimHub (dashboards, overlays, LEDs), the AZOM plugin for MOZA wheels
// and MOZA Pit House / Dashboard Studio, controlled from Pitlane HQ.
//
// None of these programs has a public control API, so Pitlane HQ uses what they
// do offer: SimHub's command line (-triggeraction, -minimize, -switchgame),
// its web server on port 8888 for showing dashboards, the dashboard folders on
// disk, and MOZA Dashboard Studio's command line to open .mzdash files.

import (
	"archive/zip"
	"bytes"
	"encoding/json"
	"errors"
	"io"
	"net/http"
	"os"
	"os/exec"
	"path/filepath"
	"regexp"
	"sort"
	"strings"
	"time"
)

var (
	dashNameRe   = regexp.MustCompile(`^[^<>:"/\\|?*\x00-\x1f]{1,120}$`)
	simActionRe  = regexp.MustCompile(`^[A-Za-z0-9_.\-]{1,80}$`)
	simhubPort   = 8888
	simhubClient = &http.Client{Timeout: 800 * time.Millisecond}
)

// Common AZOM actions (see github.com/giantorth/AZOM, Integration/SimHubRegistrar.cs).
var azomActions = []string{"AZOM.DashboardNext", "AZOM.DashboardPrev", "AZOM.WorkModeToggle", "AZOM.CalibrateCenter",
	"AZOM.DisplayBrightness30", "AZOM.DisplayBrightness50", "AZOM.DisplayBrightness70", "AZOM.DisplayBrightness100"}

func simhubExe() string {
	if c, ok := catalogByID("simhub"); ok {
		if e, found := detectCatalogApp(c); found && strings.EqualFold(filepath.Ext(e.Path), ".exe") {
			return e.Path
		}
	}
	return ""
}

func simhubDir() string {
	if p := simhubExe(); p != "" {
		return filepath.Dir(p)
	}
	return ""
}

func safeDashDir(root, name string) (string, bool) {
	if root == "" || !dashNameRe.MatchString(name) || strings.Contains(name, "..") || strings.TrimSpace(name) != name {
		return "", false
	}
	return filepath.Join(root, name), true
}

type simDash struct {
	Name    string    `json:"name"`
	Overlay bool      `json:"overlay"`
	Preview bool      `json:"preview"`
	Changed time.Time `json:"changed"`
}

// simhubDashes lists the dashboards and overlays in SimHub's DashTemplates folder.
func simhubDashes(dir string) []simDash {
	root := filepath.Join(dir, "DashTemplates")
	ents, err := os.ReadDir(root)
	if err != nil {
		return nil
	}
	var out []simDash
	for _, e := range ents {
		if !e.IsDir() || strings.HasPrefix(e.Name(), "_") || strings.HasPrefix(e.Name(), ".") {
			continue
		}
		d := simDash{Name: e.Name()}
		if fi, err := e.Info(); err == nil {
			d.Changed = fi.ModTime()
		}
		files, _ := os.ReadDir(filepath.Join(root, e.Name()))
		for _, f := range files {
			n := strings.ToLower(f.Name())
			if strings.HasSuffix(n, ".png") {
				d.Preview = true
			}
			if !d.Overlay && (strings.HasSuffix(n, ".metadata") || strings.HasSuffix(n, ".djson")) {
				if b, err := os.ReadFile(filepath.Join(root, e.Name(), f.Name())); err == nil && len(b) < 64<<20 {
					d.Overlay = d.Overlay || isOverlayMeta(b)
				}
			}
		}
		out = append(out, d)
	}
	sort.Slice(out, func(i, j int) bool { return strings.ToLower(out[i].Name) < strings.ToLower(out[j].Name) })
	return out
}

// isOverlayMeta looks for SimHub's overlay flag in a dashboard file.
func isOverlayMeta(b []byte) bool {
	var m map[string]any
	if json.Unmarshal(bytes.TrimPrefix(b, []byte("\xef\xbb\xbf")), &m) != nil {
		return false
	}
	for _, k := range []string{"IsOverlay", "isOverlay", "Overlay"} {
		if v, ok := m[k].(bool); ok && v {
			return true
		}
	}
	return false
}

func simhubWebUp() bool {
	resp, err := simhubClient.Get("http://127.0.0.1:" + itoa(simhubPort) + "/")
	if err != nil {
		return false
	}
	resp.Body.Close()
	return resp.StatusCode < 500
}

// simhubCmd runs SimHubWPF.exe with arguments; a running SimHub receives them.
func simhubCmd(args ...string) error {
	if !appsSupported {
		return errNotWindows
	}
	exe := simhubExe()
	if exe == "" {
		return errors.New("SimHub is not installed on this PC")
	}
	cmd := exec.Command(exe, args...)
	cmd.Dir = filepath.Dir(exe)
	return cmd.Start()
}

// ---------- MOZA ----------

func mozaRoot() string {
	return filepath.Join(os.Getenv("LOCALAPPDATA"), "MOZA Pit House", "_dashes", "dashes")
}

func mozaStudio() string {
	for _, base := range []string{os.Getenv("ProgramFiles(x86)"), os.Getenv("ProgramFiles")} {
		if base == "" {
			continue
		}
		p := filepath.Join(base, "MOZA Pit House", "bin", "MOZA Dashboard Studio.exe")
		if fileExists(p) {
			return p
		}
	}
	if c, ok := catalogByID("pithouse"); ok {
		if e, found := detectCatalogApp(c); found {
			for _, p := range []string{filepath.Join(filepath.Dir(e.Path), "bin", "MOZA Dashboard Studio.exe"), filepath.Join(filepath.Dir(e.Path), "MOZA Dashboard Studio.exe")} {
				if fileExists(p) {
					return p
				}
			}
		}
	}
	return ""
}

type mozaDash struct {
	Name    string    `json:"name"`
	Changed time.Time `json:"changed"`
}

func mozaDashes() []mozaDash {
	ents, err := os.ReadDir(mozaRoot())
	if err != nil {
		return nil
	}
	var out []mozaDash
	for _, e := range ents {
		if !e.IsDir() {
			continue
		}
		p := filepath.Join(mozaRoot(), e.Name(), e.Name()+".mzdash")
		if fi, err := os.Stat(p); err == nil {
			out = append(out, mozaDash{e.Name(), fi.ModTime()})
		}
	}
	sort.Slice(out, func(i, j int) bool { return out[i].Changed.After(out[j].Changed) })
	return out
}

// pitHouseRunning ignores AZOM's stand-in process, which has the same name.
func pitHouseRunning() bool {
	for _, p := range procPaths("MOZA Pit House.exe") {
		if !strings.Contains(strings.ToLower(p), `\simhub\`) {
			return true
		}
	}
	return false
}

// ---------- uploads ----------

// readUpload takes one file from a multipart form (from the PC or a phone).
func readUpload(r *http.Request, exts ...string) (string, []byte, error) {
	if err := r.ParseMultipartForm(64 << 20); err != nil {
		return "", nil, errors.New("could not read the file")
	}
	f, h, err := r.FormFile("file")
	if err != nil {
		return "", nil, errors.New("no file")
	}
	defer f.Close()
	name := filepath.Base(strings.ReplaceAll(h.Filename, `\`, "/"))
	ok := false
	for _, x := range exts {
		if strings.EqualFold(filepath.Ext(name), x) {
			ok = true
		}
	}
	if !ok {
		return "", nil, errors.New("wrong file type, expected " + strings.Join(exts, " or "))
	}
	b, err := io.ReadAll(io.LimitReader(f, 64<<20))
	if err != nil {
		return "", nil, err
	}
	if _, err := zip.NewReader(bytes.NewReader(b), int64(len(b))); err != nil && strings.EqualFold(filepath.Ext(name), ".simhubdash") {
		return "", nil, errors.New("this .simhubdash file is damaged")
	}
	base := strings.TrimSuffix(name, filepath.Ext(name))
	if !dashNameRe.MatchString(base) || strings.Contains(base, "..") {
		base = "Dashboard"
	}
	return base, b, nil
}

func inboxPath(name string) string {
	dir := filepath.Join(os.TempDir(), "PitWall")
	os.MkdirAll(dir, 0o700)
	return filepath.Join(dir, name)
}

func registerRigRoutes(mux *http.ServeMux) {
	mux.HandleFunc("/api/simhub", func(w http.ResponseWriter, r *http.Request) {
		dir := simhubDir()
		running := runningProcs()
		azom := dir != "" && (fileExists(filepath.Join(dir, "MozaPlugin.dll")) || fileExists(filepath.Join(dir, "AZOM.dll")))
		writeJSON(w, map[string]any{
			"installed": dir != "", "running": running["simhubwpf.exe"], "web": simhubWebUp(), "port": simhubPort,
			"dashes": simhubDashes(dir), "azom": azom, "azomActions": azomActions, "azomPkg": azomStatus(), "pitHouse": pitHouseRunning(), "windows": appsSupported,
		})
	})
	mux.HandleFunc("/api/simhub/preview", func(w http.ResponseWriter, r *http.Request) {
		d, ok := safeDashDir(filepath.Join(simhubDir(), "DashTemplates"), r.URL.Query().Get("name"))
		if !ok {
			http.NotFound(w, r)
			return
		}
		files, _ := os.ReadDir(d)
		for _, f := range files {
			if strings.HasSuffix(strings.ToLower(f.Name()), ".png") && !f.IsDir() {
				w.Header().Set("Cache-Control", "max-age=300")
				http.ServeFile(w, r, filepath.Join(d, f.Name()))
				return
			}
		}
		http.NotFound(w, r)
	})
	mux.HandleFunc("/api/simhub/do", func(w http.ResponseWriter, r *http.Request) {
		if r.Method != http.MethodPost {
			http.Error(w, "POST only", 405)
			return
		}
		fail := func(err error) {
			w.WriteHeader(400)
			writeJSON(w, map[string]string{"error": err.Error()})
		}
		if strings.HasPrefix(r.Header.Get("Content-Type"), "multipart/") { // import a .simhubdash
			name, b, err := readUpload(r, ".simhubdash")
			if err != nil {
				fail(err)
				return
			}
			p := inboxPath(name + ".simhubdash")
			if err := os.WriteFile(p, b, 0o600); err != nil {
				fail(err)
				return
			}
			if err := shellOpen(p, "", false); err != nil { // SimHub imports it
				fail(err)
				return
			}
			writeJSON(w, map[string]string{"result": "importing", "name": name})
			return
		}
		var in struct{ Action, Name string }
		json.NewDecoder(io.LimitReader(r.Body, 4096)).Decode(&in)
		var err error
		switch in.Action {
		case "start":
			if runningProcs()["simhubwpf.exe"] {
				err = simhubCmd("-restore")
			} else {
				err = simhubCmd("-minimize")
			}
		case "show":
			err = simhubCmd("-restore")
		case "minimize":
			err = simhubCmd("-minimize")
		case "exit":
			err = simhubCmd("-exit")
		case "iracing":
			err = simhubCmd("-switchgame", "IRacing")
		case "trigger":
			if !simActionRe.MatchString(in.Name) {
				err = errors.New("invalid action name")
				break
			}
			err = simhubCmd("-triggeraction", in.Name)
		case "folder":
			if d := simhubDir(); d != "" {
				err = shellOpen(filepath.Join(d, "DashTemplates"), "", false)
			} else {
				err = errors.New("SimHub is not installed on this PC")
			}
		case "azomInstall", "azomRemove", "azomRestore":
			err = azomJob(strings.ToLower(strings.TrimPrefix(in.Action, "azom")))
		case "closePitHouse": // AZOM and Pit House cannot share the wheel
			n := killProcs("MOZA Pit House.exe", `\simhub\`)
			writeJSON(w, map[string]any{"result": "ok", "closed": n})
			return
		default:
			err = errors.New("unknown action")
		}
		if err != nil {
			fail(err)
			return
		}
		writeJSON(w, map[string]string{"result": "ok"})
	})

	mux.HandleFunc("/api/moza", func(w http.ResponseWriter, r *http.Request) {
		studio := mozaStudio()
		phOK := false
		if c, ok := catalogByID("pithouse"); ok {
			_, phOK = detectCatalogApp(c)
		}
		writeJSON(w, map[string]any{"installed": phOK || studio != "", "studio": studio != "", "running": pitHouseRunning(),
			"dashes": mozaDashes(), "folder": mozaRoot(), "windows": appsSupported})
	})
	mux.HandleFunc("/api/moza/do", func(w http.ResponseWriter, r *http.Request) {
		if r.Method != http.MethodPost {
			http.Error(w, "POST only", 405)
			return
		}
		fail := func(err error) {
			w.WriteHeader(400)
			writeJSON(w, map[string]string{"error": err.Error()})
		}
		studio := mozaStudio()
		if strings.HasPrefix(r.Header.Get("Content-Type"), "multipart/") { // add a .mzdash to Pit House
			name, b, err := readUpload(r, ".mzdash")
			if err != nil {
				fail(err)
				return
			}
			dir, _ := safeDashDir(mozaRoot(), name)
			if _, err := os.Stat(dir); err == nil {
				name += " " + time.Now().Format("0102-1504")
				dir, _ = safeDashDir(mozaRoot(), name)
			}
			if err := os.MkdirAll(dir, 0o755); err != nil {
				fail(err)
				return
			}
			p := filepath.Join(dir, name+".mzdash")
			if err := os.WriteFile(p, b, 0o644); err != nil {
				fail(err)
				return
			}
			if studio != "" {
				shellOpen(studio, `"`+p+`"`, false)
			}
			writeJSON(w, map[string]string{"result": "added", "name": name})
			return
		}
		var in struct{ Action, Name string }
		json.NewDecoder(io.LimitReader(r.Body, 4096)).Decode(&in)
		var err error
		switch in.Action {
		case "open": // a dashboard in Dashboard Studio, ready to send to the wheel
			dir, ok := safeDashDir(mozaRoot(), in.Name)
			p := filepath.Join(dir, in.Name+".mzdash")
			if !ok || !fileExists(p) {
				err = errors.New("dashboard not found")
			} else if studio == "" {
				err = errors.New("MOZA Dashboard Studio not found")
			} else {
				err = shellOpen(studio, `"`+p+`"`, false)
			}
		case "studio":
			if studio == "" {
				err = errors.New("MOZA Dashboard Studio not found")
			} else {
				err = shellOpen(studio, "", false)
			}
		case "pithouse":
			if c, ok := catalogByID("pithouse"); ok {
				if e, found := detectCatalogApp(c); found {
					_, err = launchApp(e, false)
					break
				}
			}
			err = errors.New("MOZA Pit House is not installed on this PC")
		case "folder":
			os.MkdirAll(mozaRoot(), 0o755)
			err = shellOpen(mozaRoot(), "", false)
		default:
			err = errors.New("unknown action")
		}
		if err != nil {
			fail(err)
			return
		}
		writeJSON(w, map[string]string{"result": "ok"})
	})
}
