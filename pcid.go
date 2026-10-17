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

// the basic overlays (OV_BASIC in index.html): without Pro once the beta is over, only these, and only the first
// proFreeAuto of them, open by themselves (Auto)
var ovBasic = map[string]bool{"radar": true, "deltabar": true, "relative": true, "standings": true, "flag": true, "dash": true, "timing": true, "map": true, "fuel": true, "tyres": true, "inputs": true, "pit": true, "brakes": true, "coach": true, "incidents": true, "engine": true, "weather": true, "controls": true, "trackbar": true}

const proFreeAuto = 3

// what Auto opens on this PC: everything with Pro here (or during the beta, or for an admin), else the first basic ones
func proAutoList(list []string) []string {
	loadPL()
	plMu.Lock()
	gated := plAcc.ProGate && !plAcc.Admin && (!plAcc.Pro || plAcc.ProElsewhere)
	plMu.Unlock()
	if !gated {
		return list
	}
	out := []string{}
	for _, w := range list {
		if ovBasic[w] && len(out) < proFreeAuto {
			out = append(out, w)
		}
	}
	return out
}
