//go:build !windows

package main

import (
	"errors"
	"os/exec"
)

func openOverlay(o overlayReq, url, engine string) error {
	return errors.New("overlay windows are only available on Windows")
}
func setOverlays(o overlayReq) int                      { return 0 }
func closeOverlays(widget string) int                   { return 0 }
func listOverlays() []string                            { return nil }
func overlayRects() map[string][4]int                   { return nil }
func setOverlayVisible(name string, on bool)            {}
func setStartWithWindows(on bool) error                 { return errors.New("only on Windows") }
func minimizeConsole()                                  {}
func runOverlayWindow(name, url string, x, y, w, h int) {}

func moveOverlay(name string, x, y, w, h int) {}
func screenInfo() map[string]any {
	return map[string]any{"virtual": [4]int{0, 0, 1920, 1080}, "primary": [4]int{0, 0, 1920, 1080}}
}

const overlaysSupported = false

func hideChildWindow(cmd *exec.Cmd) {}
