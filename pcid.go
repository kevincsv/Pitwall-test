package main

import (
	"crypto/rand"
	"crypto/sha256"
	"encoding/hex"
	"os"
	"path/filepath"
	"strings"
	"sync"
)

// Pitlane HQ Pro is kept on one PC (cloud/src/lemon.js): the PC is known by an opaque id, a hash of Windows' own
// machine id (the same after reinstalling Pitlane HQ), else a random one kept in the data folder
var (
	pcIDOnce sync.Once
	pcIDVal  string
)

func pcID() string {
	pcIDOnce.Do(func() {
		src := machineGUID()
		if src == "" {
			f := filepath.Join(dataDir(), "pc.id")
			if b, err := os.ReadFile(f); err == nil && len(strings.TrimSpace(string(b))) >= 16 {
				src = strings.TrimSpace(string(b))
			} else {
				r := make([]byte, 16)
				rand.Read(r)
				src = hex.EncodeToString(r)
				os.MkdirAll(dataDir(), 0o755)
				os.WriteFile(f, []byte(src), 0o600)
			}
		}
		h := sha256.Sum256([]byte("pitlanehq-pc:" + src))
		pcIDVal = hex.EncodeToString(h[:16])
	})
	return pcIDVal
}

// the PC's name, so the app can say where Pro is ("on DESKTOP-1")
func pcName() string {
	n, _ := os.Hostname()
	if len(n) > 40 {
		n = n[:40]
	}
	return n
}

// the basic overlays (OV_BASIC in index.html): without Pro once the beta is over, only these open by themselves (Auto)
var ovBasic = map[string]bool{"radar": true, "deltabar": true, "relative": true, "standings": true, "flag": true, "dash": true, "timing": true, "map": true, "fuel": true, "tyres": true, "inputs": true, "pit": true, "brakes": true, "coach": true, "incidents": true, "engine": true, "weather": true, "controls": true, "trackbar": true}

// without Pro, this many programs start by themselves (when Pitlane HQ opens or iRacing starts, apps.go)
const proFreeApps = 3

// proGated: the beta is over and this PC has no Pro (admins always have it)
func proGated() bool {
	loadPL()
	plMu.Lock()
	defer plMu.Unlock()
	return plAcc.ProGate && !plAcc.Admin && (!plAcc.Pro || plAcc.ProElsewhere)
}

// what Auto opens on this PC: every overlay with Pro (or during the beta), else the basic ones
func proAutoList(list []string) []string {
	if !proGated() {
		return list
	}
	out := []string{}
	for _, w := range list {
		if ovBasic[w] {
			out = append(out, w)
		}
	}
	return out
}

// the programs that may start by themselves: all with Pro, else the first proFreeApps of the list (its order)
func proAppsAllowed(list []appEntry) map[string]bool {
	ok := map[string]bool{}
	n := 0
	gated := proGated()
	for _, a := range list {
		if a.When == "" {
			continue
		}
		if gated && n >= proFreeApps {
			break
		}
		ok[a.ID] = true
		n++
	}
	return ok
}
