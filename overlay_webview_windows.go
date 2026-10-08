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
	procDwmSetAttr     = syscall.NewLazyDLL("dwmapi.dll").NewProc("DwmSetWindowAttribute")
	procCallWindowProc = user32.NewProc("CallWindowProcW")
	procDefWindowProc  = user32.NewProc("DefWindowProcW")
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
	if seeThrough(name) {  // the radar is drawn natively: WebView2 cannot be see-through
		runNativeRadar(url, x, y, w, h)
		return
	}
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
	noWinBorder(hwnd, seeThrough(name))
	keepOnScreen(hwnd)
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
			x, y, _, _ := windowRect(hwnd)
			r := winRect{int32(x), int32(y), int32(x + nw), int32(y + nh)}
			clampMove(&r) // growing never pushes it off the screen
			procSetWindowPos.Call(hwnd, uintptr(hwndTopmost), uintptr(r.Left), uintptr(r.Top), uintptr(r.Right-r.Left), uintptr(r.Bottom-r.Top), swpNoActivate)
		})
	})
	// resize from any edge: the page sends the new position and size
	wv.Bind("pwRect", func(nx, ny, nw, nh int) {
		if nw < 120 || nh < 50 || nw > 6000 || nh > 4000 {
			return
		}
		wv.Dispatch(func() {
			r := winRect{int32(nx), int32(ny), int32(nx + nw), int32(ny + nh)}
			clampSize(&r) // an edge stops at the screen's border
			procSetWindowPos.Call(hwnd, uintptr(hwndTopmost), uintptr(r.Left), uintptr(r.Top), uintptr(r.Right-r.Left), uintptr(r.Bottom-r.Top), swpNoActivate)
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

// noWinBorder: Windows 11 draws its own border and corners around every window. An overlay gets rounded corners
// with a thin, quiet border (antialiased by Windows, like its own windows); a see-through one (the radar) gets
// neither, so nothing outlines it over the game. Nothing happens on Windows 10.
func noWinBorder(hwnd uintptr, clear bool) {
	if procDwmSetAttr.Find() != nil {
		return
	}
	border, corner := uint32(0x00453a30), uint32(2) // #303a45; DWMWCP_ROUND
	if clear {
		border, corner = 0xFFFFFFFE, 1 // DWMWA_COLOR_NONE; DWMWCP_DONOTROUND
	}
	procDwmSetAttr.Call(hwnd, 34, uintptr(unsafe.Pointer(&border)), 4) // DWMWA_BORDER_COLOR
	procDwmSetAttr.Call(hwnd, 33, uintptr(unsafe.Pointer(&corner)), 4) // DWMWA_WINDOW_CORNER_PREFERENCE
}

// the desktop the overlays live in: every screen together (an overlay can still go from one screen to another)
func desktopRect() winRect {
	x, y := int32(metric(76)), int32(metric(77)) // SM_XVIRTUALSCREEN, SM_YVIRTUALSCREEN
	return winRect{x, y, x + int32(metric(78)), y + int32(metric(79))}
}

// clampMove keeps a window's size and slides it back inside the desktop.
func clampMove(r *winRect) {
	s := desktopRect()
	if s.Right <= s.Left || s.Bottom <= s.Top {
		return
	}
	w, h := r.Right-r.Left, r.Bottom-r.Top
	if w > s.Right-s.Left {
		w = s.Right - s.Left
	}
	if h > s.Bottom-s.Top {
		h = s.Bottom - s.Top
	}
	if r.Left < s.Left {
		r.Left = s.Left
	}
	if r.Top < s.Top {
		r.Top = s.Top
	}
	if r.Left+w > s.Right {
		r.Left = s.Right - w
	}
	if r.Top+h > s.Bottom {
		r.Top = s.Bottom - h
	}
	r.Right, r.Bottom = r.Left+w, r.Top+h
}

// clampSize cuts the edges that go past the desktop (resizing).
func clampSize(r *winRect) {
	s := desktopRect()
	if s.Right <= s.Left || s.Bottom <= s.Top {
		return
	}
	if r.Left < s.Left {
		r.Left = s.Left
	}
	if r.Top < s.Top {
		r.Top = s.Top
	}
	if r.Right > s.Right {
		r.Right = s.Right
	}
	if r.Bottom > s.Bottom {
		r.Bottom = s.Bottom
	}
}

var (
	ovPrevProc uintptr
	ovProcCB   = syscall.NewCallback(ovWndProc)
)

// ovWndProc: while the overlay is dragged or resized by Windows, it never leaves the screen
func ovWndProc(h, msg, wp, lp uintptr) uintptr {
	switch msg {
	case 0x0216: // WM_MOVING
		clampMove((*winRect)(unsafe.Pointer(lp)))
		return 1
	case 0x0214: // WM_SIZING
		clampSize((*winRect)(unsafe.Pointer(lp)))
		return 1
	}
	if ovPrevProc == 0 {
		r, _, _ := procDefWindowProc.Call(h, msg, wp, lp)
		return r
	}
	r, _, _ := procCallWindowProc.Call(ovPrevProc, h, msg, wp, lp)
	return r
}

// keepOnScreen puts ovWndProc in front of the window's own handler, and brings the window back inside the
// screen if it was saved somewhere off it (a screen that is gone, another resolution).
func keepOnScreen(hwnd uintptr) {
	ovPrevProc, _, _ = procSetWindowLongPtrW.Call(hwnd, ^uintptr(3), ovProcCB) // GWLP_WNDPROC (-4)
	x, y, w, h := windowRect(hwnd)
	r := winRect{int32(x), int32(y), int32(x + w), int32(y + h)}
	clampMove(&r)
	if int(r.Left) != x || int(r.Top) != y {
		procSetWindowPos.Call(hwnd, uintptr(hwndTopmost), uintptr(r.Left), uintptr(r.Top), 0, 0, swpNoSize|swpNoActivate)
	}
}

var gwlStyle = -16

// WebView2 needs its window on the main OS thread.
func init() { runtime.LockOSThread() }
