package main

// One app on Windows: the native window (PitlaneHQ.Desktop.exe, desktop/) is Pitlane HQ, and PitlaneHQ.exe is its
// engine. Every way of starting PitlaneHQ.exe by itself (a shortcut, "start with Windows", the updater's restart)
// opens the native window instead when it is installed next to it; the window starts the engine (-engine).

import (
	"os"
	"path/filepath"
)

const desktopExeName = "PitlaneHQ.Desktop.exe"

// desktopNext: the native window next to this program, "" when it is not installed here
func desktopNext() string {
	exe, err := os.Executable()
	if err != nil {
		return ""
	}
	p := filepath.Join(filepath.Dir(exe), desktopExeName)
	if fi, err := os.Stat(p); err == nil && !fi.IsDir() {
		return p
	}
	return ""
}
