//go:build windows

package main

// The main Pitlane HQ window: the app in its own window (WebView2, built into
// Windows 10/11), no console and no browser. Closing it quits Pitlane HQ.
// Links to other websites open in your normal browser.

import (
	_ "embed"
	"encoding/binary"
	"os"
	"os/exec"
	"path/filepath"
	"strings"
	"syscall"
	"unsafe"

	webview2 "github.com/jchv/go-webview2"
)

//go:embed assets/pitlanehq.ico
var appIconICO []byte

var (
	procCreateIconFromResourceEx = user32.NewProc("CreateIconFromResourceEx")
	mainWV                       webview2.WebView
	mainHwnd                     uintptr
	procSetForegroundWindow      = user32.NewProc("SetForegroundWindow")
)

const externalLinks = `(function(){var ext=function(u){try{var x=new URL(u,location.href);return x.origin!==location.origin&&/^https?:$/.test(x.protocol)}catch(e){return false}};
document.addEventListener("click",function(e){var a=e.target&&e.target.closest&&e.target.closest("a[href]");if(a&&ext(a.href)){e.preventDefault();window.pwOpen(a.href)}},true);
var o=window.open;window.open=function(u){if(u&&ext(u)){window.pwOpen(new URL(u,location.href).href);return null}return o.apply(window,arguments)}})();`

// runMainWindow shows the app and blocks until its window is closed.
// It returns false when WebView2 is not available.
func runMainWindow(url string, minimized bool) bool {
	setDPIAware()
	os.Setenv("WEBVIEW2_DEFAULT_BACKGROUND_COLOR", "FF11151B")
	data := filepath.Join(os.Getenv("LOCALAPPDATA"), "PitlaneHQ", "WebView2")
	wv := webview2.NewWithOptions(webview2.WebViewOptions{
		DataPath:      data,
		AutoFocus:     true,
		WindowOptions: webview2.WindowOptions{Title: "Pitlane HQ", Width: 1360, Height: 860, Center: true},
	})
	if wv == nil {
		return false
	}
	mainWV, mainHwnd = wv, uintptr(wv.Window())
	setWindowIcon(mainHwnd)
	styleTitleBar(mainHwnd)
	ownTitleBar(mainHwnd)
	procShowWindow.Call(mainHwnd, 3) // SW_MAXIMIZE: use the whole screen
	if minimized {
		procShowWindow.Call(mainHwnd, 6) // SW_MINIMIZE
	}
	wv.Bind("pwOpen", func(u string) {
		if strings.HasPrefix(u, "https://") || strings.HasPrefix(u, "http://") {
			openExternal(u)
		}
	})
	// the app's header is the title bar: drag it, double-click it, its buttons minimise, maximise and close
	wv.Bind("pwWin", func(a string) bool {
		zoomed := func() bool { z, _, _ := procIsZoomed.Call(mainHwnd); return z != 0 }
		switch a {
		case "min":
			wv.Dispatch(func() { procShowWindow.Call(mainHwnd, 6) }) // SW_MINIMIZE
		case "max":
			z := zoomed()
			wv.Dispatch(func() {
				if z {
					procShowWindow.Call(mainHwnd, 9) // SW_RESTORE
				} else {
					procShowWindow.Call(mainHwnd, 3) // SW_MAXIMIZE
				}
			})
			return !z
		case "close":
			procPostMessageW.Call(mainHwnd, wmClose, 0, 0)
		case "drag", "top", "topleft", "topright":
			hit := map[string]uintptr{"drag": htCaption, "top": 12, "topleft": 13, "topright": 14}[a]
			wv.Dispatch(func() {
				procReleaseCapture.Call()
				procSendMessageW.Call(mainHwnd, wmNCLButtonDown, hit, 0)
			})
		}
		return zoomed()
	})
	wv.Init(externalLinks)
	wv.Navigate(url)
	wv.Run()
	return true
}

// showMainWindow brings the window back (used when Pitlane HQ is started a second time).
func showMainWindow() bool {
	if mainWV == nil {
		return false
	}
	mainWV.Dispatch(func() {
		procShowWindow.Call(mainHwnd, 9) // SW_RESTORE
		procSetForegroundWindow.Call(mainHwnd)
	})
	return true
}

// openExternal opens a website in the default browser.
func openExternal(u string) {
	cmd := exec.Command("rundll32", "url.dll,FileProtocolHandler", u)
	cmd.SysProcAttr = &syscall.SysProcAttr{HideWindow: true}
	cmd.Start()
}

// logToFile: without a console the log goes to %LOCALAPPDATA%\PitlaneHQ\pitlanehq.log.
func logFilePath() string {
	return filepath.Join(os.Getenv("LOCALAPPDATA"), "PitlaneHQ", "pitlanehq.log")
}

// iconFromICO makes a Windows icon of the given size from the embedded .ico.
func iconFromICO(size int) uintptr {
	if len(appIconICO) < 6 {
		return 0
	}
	n := int(binary.LittleEndian.Uint16(appIconICO[4:]))
	best, bestDiff := -1, 1<<30
	for i := 0; i < n; i++ {
		e := appIconICO[6+16*i:]
		w := int(e[0])
		if w == 0 {
			w = 256
		}
		d := w - size
		if d < 0 {
			d = -d * 2 // prefer a larger image scaled down
		}
		if d < bestDiff {
			best, bestDiff = i, d
		}
	}
	if best < 0 {
		return 0
	}
	e := appIconICO[6+16*best:]
	ln := int(binary.LittleEndian.Uint32(e[8:]))
	off := int(binary.LittleEndian.Uint32(e[12:]))
	if off+ln > len(appIconICO) {
		return 0
	}
	data := appIconICO[off : off+ln]
	h, _, _ := procCreateIconFromResourceEx.Call(uintptr(unsafe.Pointer(&data[0])), uintptr(ln), 1, 0x00030000, uintptr(size), uintptr(size), 0)
	return h
}

// setWindowIcon puts the Pitlane HQ icon on the window title and taskbar button.
func setWindowIcon(hwnd uintptr) {
	const wmSetIcon = 0x0080
	if h := iconFromICO(16); h != 0 {
		procSendMessageW.Call(hwnd, wmSetIcon, 0, h) // ICON_SMALL
	}
	if h := iconFromICO(48); h != 0 {
		procSendMessageW.Call(hwnd, wmSetIcon, 1, h) // ICON_BIG
	}
}

// setDPIAware: sharp text on screens with Windows scaling (125 %, 150 %…).
// Without it Windows stretches the window and the letters look blurry.
func setDPIAware() {
	if p := user32.NewProc("SetProcessDpiAwarenessContext"); p.Find() == nil {
		if r, _, _ := p.Call(^uintptr(3)); r != 0 { // DPI_AWARENESS_CONTEXT_PER_MONITOR_AWARE_V2 (-4)
			return
		}
	}
	if p := syscall.NewLazyDLL("shcore.dll").NewProc("SetProcessDpiAwareness"); p.Find() == nil {
		p.Call(2) // PROCESS_PER_MONITOR_DPI_AWARE
		return
	}
	if p := user32.NewProc("SetProcessDPIAware"); p.Find() == nil {
		p.Call()
	}
}

var procDwmSetWindowAttribute = syscall.NewLazyDLL("dwmapi.dll").NewProc("DwmSetWindowAttribute")

// styleTitleBar paints the window's title bar and border in the app's colours:
// dark on Windows 10, and on Windows 11 the exact background, border and text
// colours with rounded corners, so the frame blends into the app. Windows keeps
// drawing it, so snapping, resizing and maximising work as usual.
func styleTitleBar(hwnd uintptr) {
	if procDwmSetWindowAttribute.Find() != nil {
		return
	}
	set := func(attr uintptr, v uint32) {
		procDwmSetWindowAttribute.Call(hwnd, attr, uintptr(unsafe.Pointer(&v)), 4)
	}
	set(20, 1)                                                                                           // DWMWA_USE_IMMERSIVE_DARK_MODE (Windows 10 20H1 and later)
	set(19, 1)                                                                                           // the same on older Windows 10 builds
	set(35, 0x001B1511)                                                                                  // DWMWA_CAPTION_COLOR: #11151b, the app background
	set(34, 0x0031261E)                                                                                  // DWMWA_BORDER_COLOR: #1e2631, like the panels
	set(36, 0x00F1EBE7)                                                                                  // DWMWA_TEXT_COLOR: #e7ebf1
	set(33, 2)                                                                                           // DWMWA_WINDOW_CORNER_PREFERENCE: round
	procSetWindowPos.Call(hwnd, 0, 0, 0, 0, 0, swpNoMove|swpNoSize|swpNoActivate|0x0004|swpFrameChanged) // redraw the frame
}

var (
	procIsZoomed               = user32.NewProc("IsZoomed")
	procCallWindowProcW        = user32.NewProc("CallWindowProcW")
	procGetDpiForWindow        = user32.NewProc("GetDpiForWindow")
	procGetSystemMetricsForDpi = user32.NewProc("GetSystemMetricsForDpi")
	origMainProc               uintptr
	mainProcCB                 uintptr
)

type ncCalcSizeParams struct {
	Rgrc  [3]winRect
	Lppos uintptr
}

// frameSize is the width of the (invisible) resize border Windows keeps around the window.
func frameSize(hwnd uintptr) (int32, int32) {
	m := func(i uintptr) int32 { v, _, _ := procGetSystemMetrics.Call(i); return int32(v) }
	if procGetDpiForWindow.Find() == nil && procGetSystemMetricsForDpi.Find() == nil {
		dpi, _, _ := procGetDpiForWindow.Call(hwnd)
		if dpi != 0 {
			md := func(i uintptr) int32 { v, _, _ := procGetSystemMetricsForDpi.Call(i, dpi); return int32(v) }
			pad := md(92)                     // SM_CXPADDEDBORDER
			return md(32) + pad, md(33) + pad // SM_CXSIZEFRAME, SM_CYSIZEFRAME
		}
	}
	pad := m(92)
	return m(32) + pad, m(33) + pad
}

// ownTitleBar removes Windows' title bar: the app's own header takes its place.
// The window keeps its frame styles, so Windows still resizes it from the edges,
// snaps it to the sides, animates and shadows it.
func ownTitleBar(hwnd uintptr) {
	mainProcCB = syscall.NewCallback(func(h, msg, wp, lp uintptr) uintptr {
		if msg == 0x0083 && wp != 0 { // WM_NCCALCSIZE: the client area covers the title bar
			p := (*ncCalcSizeParams)(unsafe.Pointer(lp))
			bx, by := frameSize(h)
			if z, _, _ := procIsZoomed.Call(h); z != 0 {
				// maximised windows hang over the screen by the frame size on every side
				p.Rgrc[0].Left += bx
				p.Rgrc[0].Right -= bx
				p.Rgrc[0].Top += by
				p.Rgrc[0].Bottom -= by
			} else {
				// the resize borders stay at the sides and the bottom (they are invisible)
				p.Rgrc[0].Left += bx
				p.Rgrc[0].Right -= bx
				p.Rgrc[0].Bottom -= by
			}
			return 0
		}
		r, _, _ := procCallWindowProcW.Call(origMainProc, h, msg, wp, lp)
		return r
	})
	origMainProc, _, _ = procSetWindowLongPtrW.Call(hwnd, ^uintptr(3), mainProcCB) // GWLP_WNDPROC (-4)
	procSetWindowPos.Call(hwnd, 0, 0, 0, 0, 0, swpNoMove|swpNoSize|swpNoActivate|0x0004|swpFrameChanged)
}
