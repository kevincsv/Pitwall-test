//go:build !windows

package main

import (
	"errors"
	"os"
)

// Off Windows there is no game; PITLANE_LMU_FILE can point to a recorded
// LMU_Data copy to try the conversion.
type fileView struct{ path string }

func (f fileView) Bytes() []byte {
	b, _ := os.ReadFile(f.path)
	return b
}
func (f fileView) Close() {}

func openLMUView() (lmuView, error) {
	if p := os.Getenv("PITLANE_LMU_FILE"); p != "" {
		if _, err := os.Stat(p); err == nil {
			return fileView{p}, nil
		}
	}
	return nil, errors.New("Le Mans Ultimate runs on Windows")
}
