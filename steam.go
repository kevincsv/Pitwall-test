package main

import (
	"os"
	"path/filepath"
	"strings"
	"sync"
)

// The Steam build is the same app folder (out-desktop) uploaded as a Steam depot: Steam installs and updates it,
// so under Steam the program never updates itself and never writes next to its exe. Steam puts SteamAppId
// and SteamGameId in the environment of what it launches (the engine and the overlay windows inherit them);
// an exe started by hand from steamapps\common counts too, so a shortcut to the depot's exe behaves the same.
var (
	steamOnce sync.Once
	steamOn   bool
)

func underSteam() bool {
	steamOnce.Do(func() {
		if os.Getenv("SteamAppId") != "" || os.Getenv("SteamGameId") != "" {
			steamOn = true
			return
		}
		exe, err := os.Executable()
		if err != nil {
			return
		}
		p := strings.ToLower(filepath.ToSlash(exe))
		steamOn = strings.Contains(p, "/steamapps/common/")
	})
	return steamOn
}
