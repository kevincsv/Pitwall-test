//go:build windows

package main

import (
	"os"
	"os/exec"
	"path/filepath"
)

// openDesktop starts the native window (minimized when Windows started it) and says whether it did
func openDesktop(minimized bool) bool {
	p := desktopNext()
	if p == "" {
		return false
	}
	var args []string
	if minimized {
		args = append(args, "-minimized")
	}
	cmd := exec.Command(p, args...)
	cmd.Dir = filepath.Dir(p)
	cmd.Env = os.Environ()
	return cmd.Start() == nil
}
