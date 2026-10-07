//go:build !windows

package main

import "os"

func runMainWindow(url string, minimized bool) bool { return false }
func showMainWindow() bool                          { return false }
func openExternal(u string)                         { openAppWindow(u) }
func logFilePath() string {
	d, _ := os.UserCacheDir()
	if d == "" {
		return ""
	}
	return d + "/Pitlane HQ/pitlanehq.log"
}
