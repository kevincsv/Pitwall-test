package main

// Updates: the downloads page has a version.json next to TrackIQ-windows.zip.
// TrackIQ compares it with its own build, and on request downloads the zip,
// replaces its files (the running .exe is renamed, Windows allows that) and
// starts the new version.

import (
	"archive/zip"
	"bytes"
	"encoding/json"
	"errors"
	"fmt"
	"io"
	"log"
	"net/http"
	"os"
	"path/filepath"
	"strconv"
	"strings"
	"sync"
	"time"
)

// set when CI builds the .exe: -X main.buildID=<commit> -X main.updateRepo=<owner/repo>
var (
	buildID    = "dev"
	updateRepo = "kevincsv/Pitwall-test"
)

type updateInfo struct {
	Version string `json:"version"`
	Build   string `json:"build"`
	Date    string `json:"date,omitempty"`
	Min     string `json:"min,omitempty"` // older versions than this must update (they no longer work with the server)
}

// versionLess: "0.6.1" < "0.6.10" (numbers, not text)
func versionLess(a, b string) bool {
	pa, pb := strings.Split(strings.TrimPrefix(a, "v"), "."), strings.Split(strings.TrimPrefix(b, "v"), ".")
	for i := 0; i < len(pa) || i < len(pb); i++ {
		var x, y int
		if i < len(pa) {
			x, _ = strconv.Atoi(strings.SplitN(pa[i], "-", 2)[0])
		}
		if i < len(pb) {
			y, _ = strconv.Atoi(strings.SplitN(pb[i], "-", 2)[0])
		}
		if x != y {
			return x < y
		}
	}
	return false
}

var (
	updMu      sync.Mutex
	updLatest  *updateInfo
	updChecked time.Time
	updErr     string
	updBusy    bool
	updHTTP    = &http.Client{Transport: tlsTransport(), Timeout: 5 * time.Minute}
)

func updateBase() string {
	return "https://github.com/" + updateRepo + "/releases/download/pitlanehq-latest/"
}

func checkUpdate() error {
	resp, err := (&http.Client{Transport: tlsTransport(), Timeout: 20 * time.Second}).Get(updateBase() + "version.json")
	if err != nil {
		return fmt.Errorf("could not check for updates: %w", err)
	}
	defer resp.Body.Close()
	if resp.StatusCode != 200 {
		return fmt.Errorf("could not check for updates (HTTP %d)", resp.StatusCode)
	}
	var u updateInfo
	if err := json.NewDecoder(io.LimitReader(resp.Body, 1<<14)).Decode(&u); err != nil || u.Build == "" {
		return errors.New("the downloads page has no version information yet")
	}
	updMu.Lock()
	updLatest, updChecked, updErr = &u, time.Now(), ""
	updMu.Unlock()
	return nil
}

func updateStatus() map[string]any {
	updMu.Lock()
	defer updMu.Unlock()
	avail := updLatest != nil && buildID != "dev" && updLatest.Build != buildID
	// required: this version is older than the newest one's minimum, so it no longer works properly
	required := avail && updLatest.Min != "" && versionLess(appVersion, updLatest.Min)
	m := map[string]any{"version": appVersion, "build": buildID, "available": avail, "required": required, "busy": updBusy, "error": updErr, "supported": updateSupported && buildID != "dev"}
	if updLatest != nil {
		m["latest"] = updLatest
	}
	if !updChecked.IsZero() {
		m["checked"] = updChecked.UnixMilli()
	}
	return m
}

// updateWatcher checks a minute after start and then every 12 hours; a new
// version also shows a Windows notification (once per version).
func updateWatcher() {
	cleanOldFiles()
	time.Sleep(time.Minute)
	told := ""
	for {
		if buildID != "dev" {
			if err := checkUpdate(); err != nil {
				updMu.Lock()
				updErr = err.Error()
				updMu.Unlock()
			} else if st := updateStatus(); st["available"] == true {
				updMu.Lock()
				l := *updLatest
				updMu.Unlock()
				if l.Build != told {
					told = l.Build
					v := l.Version
					if v == "" {
						v = "new"
					}
					notify("TrackIQ "+v+" is available", "Open TrackIQ and press Update now. Your settings and laps are kept.")
				}
			}
		}
		time.Sleep(12 * time.Hour)
	}
}

// cleanOldFiles removes the .old files left by the previous update.
func cleanOldFiles() {
	exe, err := os.Executable()
	if err != nil {
		return
	}
	matches, _ := filepath.Glob(filepath.Join(filepath.Dir(exe), "*.old"))
	for _, m := range matches {
		os.Remove(m)
	}
}

// applyUpdate downloads the new version, puts its files next to the running
// .exe and starts it. The current files are kept as .old until the next start.
func applyUpdate() error {
	if !updateSupported || buildID == "dev" {
		return errors.New("updates work in the Windows app downloaded from the downloads page")
	}
	if err := checkUpdate(); err != nil {
		return err
	}
	updMu.Lock()
	latest := *updLatest
	updMu.Unlock()
	if latest.Build == buildID {
		return errors.New("you already have the latest version")
	}
	resp, err := updHTTP.Get(updateBase() + "TrackIQ-windows.zip")
	if err != nil {
		return fmt.Errorf("could not download the update: %w", err)
	}
	defer resp.Body.Close()
	if resp.StatusCode != 200 {
		return fmt.Errorf("could not download the update (HTTP %d)", resp.StatusCode)
	}
	data, err := io.ReadAll(io.LimitReader(resp.Body, 200<<20))
	if err != nil {
		return fmt.Errorf("the download was interrupted: %w", err)
	}
	zr, err := zip.NewReader(bytes.NewReader(data), int64(len(data)))
	if err != nil {
		return errors.New("the downloaded file is damaged; try again")
	}
	exe, err := os.Executable()
	if err != nil {
		return err
	}
	dir := filepath.Dir(exe)
	hasExe := false
	for _, f := range zr.File {
		if isProgramName(filepath.Base(f.Name)) {
			hasExe = true
		}
	}
	if !hasExe {
		return errors.New("the download does not contain TrackIQ.exe")
	}
	// installs made before the rename keep their PitlaneHQ.exe name (shortcuts point to it): the new
	// program replaces that file instead of appearing beside it under another name
	exeName := "TrackIQ.exe"
	if strings.EqualFold(filepath.Base(exe), "PitlaneHQ.exe") {
		exeName = "PitlaneHQ.exe"
	}
	var newExe string
	for _, f := range zr.File {
		name := filepath.Base(strings.ReplaceAll(f.Name, `\`, "/"))
		if f.FileInfo().IsDir() || name == "" || name == "." || name == ".." || strings.Contains(f.Name, "..") {
			continue
		}
		rc, err := f.Open()
		if err != nil {
			return err
		}
		b, err := io.ReadAll(io.LimitReader(rc, 200<<20))
		rc.Close()
		if err != nil {
			return err
		}
		dst := filepath.Join(dir, name)
		if isProgramName(name) {
			// write the new .exe beside the old one, then swap names
			dst = filepath.Join(dir, exeName)
			if strings.EqualFold(filepath.Base(exe), exeName) || filepath.Clean(exe) == filepath.Clean(dst) {
				os.Remove(exe + ".old")
				if err := os.Rename(exe, exe+".old"); err != nil {
					return fmt.Errorf("could not replace the program: %w", err)
				}
			}
			newExe = dst
		} else if _, err := os.Stat(dst); err == nil {
			os.Remove(dst + ".old")
			os.Rename(dst, dst+".old")
		}
		if err := os.WriteFile(dst, b, 0o755); err != nil {
			if newExe == dst {
				os.Rename(exe+".old", exe) // put the old one back
			}
			return fmt.Errorf("could not write %s: %w", name, err)
		}
	}
	log.Println("Updated to", latest.Version, latest.Build)
	go func() {
		time.Sleep(800 * time.Millisecond)
		restartInto(newExe)
	}()
	return nil
}

// isProgramName: the program inside an update zip. Its old name was PitlaneHQ.exe; the zip that
// installs made before the rename download still carries it under that name.
func isProgramName(n string) bool {
	return strings.EqualFold(n, "TrackIQ.exe") || strings.EqualFold(n, "PitlaneHQ.exe")
}

func registerUpdateRoutes(mux *http.ServeMux) {
	mux.HandleFunc("/api/update", func(w http.ResponseWriter, r *http.Request) {
		if r.Method == http.MethodPost {
			var err error
			switch r.URL.Query().Get("action") {
			case "check":
				err = checkUpdate()
			case "apply":
				updMu.Lock()
				busy := updBusy
				updBusy = true
				updMu.Unlock()
				if busy {
					err = errors.New("already updating")
					break
				}
				err = applyUpdate()
				updMu.Lock()
				updBusy = false
				updMu.Unlock()
				if err == nil {
					writeJSON(w, map[string]any{"restarting": true})
					return
				}
			}
			if err != nil {
				updMu.Lock()
				updErr = err.Error()
				updMu.Unlock()
				w.WriteHeader(400)
				writeJSON(w, map[string]string{"error": err.Error()})
				return
			}
		}
		writeJSON(w, updateStatus())
	})
}
