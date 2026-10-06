//go:build windows

package main

import (
	"os"
	"os/exec"
)

const updateSupported = true

// restartInto starts the new version and closes this one.
func restartInto(exe string) {
	cmd := exec.Command(exe, os.Args[1:]...)
	cmd.Env = append(os.Environ(), "PITLANE_UPDATED=1")
	cmd.Dir = "."
	if wd, err := os.Getwd(); err == nil {
		cmd.Dir = wd
	}
	if err := cmd.Start(); err != nil {
		return
	}
	quitApp()
}
