//go:build windows

package main

// Frameless overlay window, run as a child process of PitWall:
//   PitlaneHQ.exe -overlay-window relative -url http://localhost:8484/?overlay=relative -x 100 -y 100 -w 600 -h 360
// The window has no title bar, has a taskbar button, stays on top, does not take
// focus away from iRacing, and is moved/resized from the page in edit mode.

import (
	"os"
	"path/filepath"
	"runtime"
	"sync/atomic"
	"syscall"
	"time"
	"unsafe"

	webview2 "github.com/jchv/go-webview2"
)

const (
	wsPopup         = 0x80000000
	wsVisible       = 0x10000000
	wsExAppWindow   = 0x00040000
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
	// its own browser data, apart from the main window's
	data := filepath.Join(os.Getenv("LOCALAPPDATA"), "PitlaneHQ", "WebView2-overlays")
	// a window that never shows the page (blank and impossible to close) gives up after
	// a few seconds; Pitlane HQ then opens this overlay in an Edge window instead
	var ready atomic.Bool
	go func() {
		time.Sleep(8 * time.Second)
		if !ready.Load() {
			os.Exit(3)
		}
	}()
	wv := webview2.NewWithOptions(webview2.WebViewOptions{
		DataPath:      data,
		WindowOptions: webview2.WindowOptions{Title: overlayTitlePrefix + name, Width: uint(w), Height: uint(h)},
	})
	if wv == nil {
		os.Exit(3)
	}
	hwnd := uintptr(wv.Window())
	// no title bar or borders, on top, never takes the focus from iRacing; it has its own
	// taskbar button (like RaceLab), so it can also be closed from the taskbar
	procSetWindowLongPtrW.Call(hwnd, uintptr(gwlStyle), wsPopup|wsVisible)
	procSetWindowLongPtrW.Call(hwnd, uintptr(gwlExStyle), wsExAppWindow|wsExNoActivate|wsExTopmost)
	procSetWindowPos.Call(hwnd, uintptr(hwndTopmost), uintptr(x), uintptr(y), uintptr(w), uintptr(h), swpFrameChanged|swpShowWindow|swpNoActivate)
	procShowWindow.Call(hwnd, swShowNoActive) // a real show, so WebView2 draws
	// a resize makes WebView2 lay itself out again in the new client area
	procSetWindowPos.Call(hwnd, uintptr(hwndTopmost), uintptr(x), uintptr(y), uintptr(w), uintptr(h+1), swpNoActivate)
	procSetWindowPos.Call(hwnd, uintptr(hwndTopmost), uintptr(x), uintptr(y), uintptr(w), uintptr(h), swpNoActivate)

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
	// resize from any edge: the page sends the new position and size
	wv.Bind("pwRect", func(nx, ny, nw, nh int) {
		if nw < 120 || nh < 50 || nw > 6000 || nh > 4000 {
			return
		}
		wv.Dispatch(func() {
			procSetWindowPos.Call(hwnd, uintptr(hwndTopmost), uintptr(nx), uintptr(ny), uintptr(nw), uintptr(nh), swpNoActivate)
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
	wv.Bind("pwReady", func() { ready.Store(true) })
	wv.Navigate(url)
	wv.Run()
}

var gwlStyle = -16

// WebView2 needs its window on the main OS thread.
func init() { runtime.LockOSThread() }
