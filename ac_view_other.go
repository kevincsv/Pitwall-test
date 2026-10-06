//go:build !windows

package main

import (
	"errors"
	"os"
	"path/filepath"
)

// Off Windows there is no game; PITLANE_AC_DIR can point to a folder with recorded
// physics.bin, graphics.bin and static.bin to try the conversion.
type acFiles struct{ dir string }

func (f acFiles) read(n string) []byte {
	b, _ := os.ReadFile(filepath.Join(f.dir, n))
	return b
}
func (f acFiles) Physics() []byte  { return f.read("physics.bin") }
func (f acFiles) Graphics() []byte { return f.read("graphics.bin") }
func (f acFiles) Static() []byte   { return f.read("static.bin") }
func (f acFiles) Close()           {}

func openACViews() (acViews, error) {
	if d := os.Getenv("PITLANE_AC_DIR"); d != "" {
		return acFiles{d}, nil
	}
	return nil, errors.New("Assetto Corsa runs on Windows")
}

// which Assetto Corsa is running: "acc", "ac" or ""
func runningAC() string { return os.Getenv("PITLANE_AC_GAME") }
