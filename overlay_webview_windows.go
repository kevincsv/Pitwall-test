//go:build windows

package main

// Frameless overlay window, run as a child process of PitWall:
//   PitWall.exe -overlay-window relative -url http://localhost:8484/?overlay=relative -x 100 -y 100 -w 600 -h 360
// The window has no title bar or taskbar button, stays on top, does not take
// focus away from iRacing, and is moved/resized from the page in edit mode.

import (
	"os"
	"path/filepath"
	"runtime"
	"syscall"
	"unsafe"

	webview2 "github.com/jchv/go-webview2"
)

const (
	wsPopup         = 0x80000000
	wsVisible       = 0x10000000
	wsExToolWindow  = 0x00000080
	wsExNoActivate  = 0x08000000
	wsExTopmost     = 0x00000008
	swpFrameChanged = 0x0020
	swpShowWindow   = 0x0040
	wmNCLButtonDown = 0x00A1
	htCaption       = 2
	swHide          = 0
	swShowNoActive  = 4
)

var (
	procReleaseCapture = user32.NewProc("ReleaseCapture")
	procSendMessageW   = user32.NewProc("SendMessageW")
	procShowWindow     = user32.NewProc("ShowWindow")
	procGetWindowRect  = user32.NewProc("GetWindowRect")
	procGetConsoleWin  = syscall.NewLazyDLL("kernel32.dll").NewProc("GetConsoleWindow")
	procFreeConsole    = syscall.NewLazyDLL("kernel32.dll").NewProc("FreeConsole")
)

type winRect struct{ Left, Top, Right, Bottom int32 }

func windowRect(h uintptr) (x, y, w, hh int) {
	var r winRect
	procGetWindowRect.Call(h, uintptr(unsafe.Pointer(&r)))
	return int(r.Left), int(r.Top), int(r.Right - r.Left), int(r.Bottom - r.Top)
}

// runOverlayWindow blocks until the window closes. Exit code 3 means WebView2
// could not start, so PitWall falls back to an Edge window.
func runOverlayWindow(name, url string, x, y, w, h int) {
	procFreeConsole.Call() // the child does not need a console window
	os.Setenv("WEBVIEW2_DEFAULT_BACKGROUND_COLOR", "FF11151B")
	data := filepath.Join(os.Getenv("LOCALAPPDATA"), "PitWall", "WebView2")
	wv := webview2.NewWithOptions(webview2.WebViewOptions{
		DataPath:      data,
		WindowOptions: webview2.WindowOptions{Title: overlayTitlePrefix + name, Width: uint(w), Height: uint(h)},
	})
	if wv == nil {
		os.Exit(3)
	}
	hwnd := uintptr(wv.Window())
	procSetWindowLongPtrW.Call(hwnd, uintptr(gwlStyle), wsPopup|wsVisible)
	procSetWindowLongPtrW.Call(hwnd, uintptr(gwlExStyle), wsExToolWindow|wsExNoActivate|wsExTopmost)
	procSetWindowPos.Call(hwnd, uintptr(hwndTopmost), uintptr(x), uintptr(y), uintptr(w), uintptr(h), swpFrameChanged|swpShowWindow|swpNoActivate)

	wv.Bind("pwDrag", func() {
		wv.Dispatch(func() {
			procReleaseCapture.Call()
			procSendMessageW.Call(hwnd, wmNCLButtonDown, htCaption, 0)
		})
	})
	wv.Bind("pwSize", func(nw, nh int) {
		if nw < 120 || nh < 50 || nw > 4000 || nh > 3000 {
			return
		}
		wv.Dispatch(func() {
			procSetWindowPos.Call(hwnd, uintptr(hwndTopmost), 0, 0, uintptr(nw), uintptr(nh), swpNoMove|swpNoActivate)
		})
	})
	wv.Bind("pwVisible", func(on bool) {
		wv.Dispatch(func() {
			if on {
				procShowWindow.Call(hwnd, swShowNoActive)
				procSetWindowPos.Call(hwnd, uintptr(hwndTopmost), 0, 0, 0, 0, swpNoMove|swpNoSize|swpNoActivate)
			} else {
				procShowWindow.Call(hwnd, swHide)
			}
		})
	})
	wv.Bind("pwClose", func() { wv.Dispatch(func() { wv.Destroy() }) })
	wv.Navigate(url)
	wv.Run()
}

var gwlStyle = -16

// WebView2 needs its window on the main OS thread.
func init() { runtime.LockOSThread() }
