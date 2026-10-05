package main

// AZOM plugin carried inside PitlaneHQ.exe: the Windows build compiles it from
// ./azom and puts MozaPlugin.dll in ./azomdist before building Pitlane HQ.
// Pitlane HQ copies it into the SimHub folder (asking Windows for permission
// when SimHub lives in Program Files), restarting SimHub around the copy.

import (
	"crypto/sha256"
	"embed"
	"encoding/hex"
	"errors"
	"os"
	"path/filepath"
	"strings"
	"sync"
	"time"
)

//go:embed azomdist
var azomFS embed.FS

const azomDLL = "MozaPlugin.dll"

// bundledAZOM returns the plugin carried by this Pitlane HQ, or one placed next
// to PitlaneHQ.exe (handy when building the plugin yourself).
func bundledAZOM() ([]byte, string) {
	if b, err := azomFS.ReadFile("azomdist/" + azomDLL); err == nil && len(b) > 0 {
		v, _ := azomFS.ReadFile("azomdist/VERSION.txt")
		return b, strings.TrimSpace(string(v))
	}
	if exe, err := os.Executable(); err == nil {
		if b, err := os.ReadFile(filepath.Join(filepath.Dir(exe), azomDLL)); err == nil && len(b) > 0 {
			return b, "next to PitlaneHQ.exe"
		}
	}
	return nil, ""
}

func shortHash(b []byte) string {
	h := sha256.Sum256(b)
	return hex.EncodeToString(h[:6])
}

type azomState struct {
	Bundled     bool   `json:"bundled"`
	Version     string `json:"version"`
	Installed   bool   `json:"installed"`
	UpToDate    bool   `json:"upToDate"`
	Backup      bool   `json:"backup"`
	Busy        bool   `json:"busy"`
	LastMessage string `json:"message"`
}

var (
	azomMu  sync.Mutex
	azomMsg string
	azomRun bool
)

func azomStatus() azomState {
	b, ver := bundledAZOM()
	st := azomState{Bundled: b != nil, Version: ver}
	if dir := simhubDir(); dir != "" {
		if cur, err := os.ReadFile(filepath.Join(dir, azomDLL)); err == nil {
			st.Installed = true
			st.UpToDate = b != nil && shortHash(cur) == shortHash(b)
		}
		st.Backup = fileExists(filepath.Join(dir, azomDLL+".bak"))
	}
	azomMu.Lock()
	st.Busy, st.LastMessage = azomRun, azomMsg
	azomMu.Unlock()
	return st
}

// waitSimHubClosed asks SimHub to exit and waits for it.
func waitSimHubClosed() (wasRunning bool, err error) {
	if !runningProcs()["simhubwpf.exe"] {
		return false, nil
	}
	simhubCmd("-exit")
	for i := 0; i < 40; i++ {
		time.Sleep(500 * time.Millisecond)
		if !runningProcs()["simhubwpf.exe"] {
			time.Sleep(time.Second) // let Windows release the plugin file
			return true, nil
		}
	}
	return true, errors.New("SimHub did not close; close it and try again")
}

func setAzomMsg(m string) {
	azomMu.Lock()
	azomMsg = m
	azomMu.Unlock()
}

// azomJob runs install/remove in the background so the page stays responsive.
func azomJob(action string) error {
	azomMu.Lock()
	if azomRun {
		azomMu.Unlock()
		return errors.New("already working on it")
	}
	azomRun = true
	azomMu.Unlock()
	go func() {
		defer func() {
			azomMu.Lock()
			azomRun = false
			azomMu.Unlock()
		}()
		if err := azomDo(action); err != nil {
			setAzomMsg("error: " + err.Error())
			return
		}
	}()
	return nil
}

func azomDo(action string) error {
	if !appsSupported {
		return errNotWindows
	}
	dir := simhubDir()
	if dir == "" {
		return errors.New("SimHub is not installed on this PC")
	}
	dest := filepath.Join(dir, azomDLL)
	var data []byte
	if action == "install" {
		data, _ = bundledAZOM()
		if data == nil {
			return errors.New("this Pitlane HQ does not carry the AZOM plugin (use the build from GitHub Actions)")
		}
	}
	setAzomMsg("closing SimHub")
	was, err := waitSimHubClosed()
	if err != nil {
		return err
	}
	switch action {
	case "install":
		setAzomMsg("installing")
		tmp := inboxPath(azomDLL)
		if err := os.WriteFile(tmp, data, 0o644); err != nil {
			return err
		}
		if err := replaceFile(tmp, dest, true); err != nil {
			return err
		}
		if cur, err := os.ReadFile(dest); err != nil || shortHash(cur) != shortHash(data) {
			return errors.New("the plugin was not copied (Windows permission refused?)")
		}
		setAzomMsg("installed")
	case "remove":
		setAzomMsg("removing")
		if err := removeFile(dest, true); err != nil {
			return err
		}
		setAzomMsg("removed")
	case "restore":
		setAzomMsg("restoring")
		if err := replaceFile(dest+".bak", dest, false); err != nil {
			return err
		}
		setAzomMsg("restored previous version")
	default:
		return errors.New("unknown action")
	}
	if was || action == "install" {
		simhubCmd("-minimize") // start SimHub again so the plugin loads
	}
	return nil
}
