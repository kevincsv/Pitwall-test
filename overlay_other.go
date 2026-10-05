//go:build !windows

package main

import "errors"

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

const overlaysSupported = false
