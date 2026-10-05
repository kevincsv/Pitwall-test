//go:build windows

package main

import (
	"os"
	"os/exec"
	"strings"
)

// registerURLProtocol makes pitlanehq-pc:// links start Pitlane HQ (or bring it to the
// front), so the web version can start the telemetry agent on this PC. The installer
// writes the same keys; this keeps them right for copies run from another folder.
func registerURLProtocol() {
	exe, err := os.Executable()
	if err != nil {
		return
	}
	key := `HKCU\Software\Classes\pitlanehq-pc`
	want := `"` + exe + `" "%1"`
	q := exec.Command("reg", "query", key+`\shell\open\command`, "/ve")
	hideChildWindow(q)
	if out, err := q.Output(); err == nil && strings.Contains(string(out), want) {
		return
	}
	for _, args := range [][]string{
		{"add", key, "/ve", "/t", "REG_SZ", "/d", "URL:Pitlane HQ", "/f"},
		{"add", key, "/v", "URL Protocol", "/t", "REG_SZ", "/d", "", "/f"},
		{"add", key + `\shell\open\command`, "/ve", "/t", "REG_SZ", "/d", want, "/f"},
	} {
		cmd := exec.Command("reg", args...)
		hideChildWindow(cmd)
		cmd.Run()
	}
}
