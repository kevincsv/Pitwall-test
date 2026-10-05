//go:build windows

package main

// Overlay windows: each Live widget can open in its own Edge app window.
// PitWall then finds that window by its title and makes it stay on top of
// iRacing (borderless/windowed mode), with optional transparency and
// click-through.

import (
	"errors"
	"os"
	"os/exec"
	"path/filepath"
	"strings"
	"sync"
	"syscall"
	"time"
	"unsafe"
)

var (
	user32                  = syscall.NewLazyDLL("user32.dll")
	procEnumWindows         = user32.NewProc("EnumWindows")
	procGetWindowTextW      = user32.NewProc("GetWindowTextW")
	procIsWindowVisible     = user32.NewProc("IsWindowVisible")
	procSetWindowPos        = user32.NewProc("SetWindowPos")
	procGetWindowLongPtrW   = user32.NewProc("GetWindowLongPtrW")
	procSetWindowLongPtrW   = user32.NewProc("SetWindowLongPtrW")
	procSetLayeredWindowAtt = user32.NewProc("SetLayeredWindowAttributes")
	procPostMessageW        = user32.NewProc("PostMessageW")
)

const (
	overlayTitlePrefix = "PitWall Overlay · "
	wsExLayered        = 0x00080000
	wsExTransparent    = 0x00000020
	lwaAlpha           = 0x2
	swpNoSize          = 0x0001
	swpNoMove          = 0x0002
	swpNoActivate      = 0x0010
	wmClose            = 0x0010
)

var (
	enumMu      sync.Mutex
	enumFound   map[uintptr]string
	enumCB      = syscall.NewCallback(enumProc)
	gwlExStyle  = -20
	hwndTopmost = -1
	hwndNoTop   = -2
)

func enumProc(h uintptr, _ uintptr) uintptr {
	if v, _, _ := procIsWindowVisible.Call(h); v == 0 {
		return 1
	}
	buf := make([]uint16, 256)
	n, _, _ := procGetWindowTextW.Call(h, uintptr(unsafe.Pointer(&buf[0])), 256)
	if n > 0 {
		t := syscall.UTF16ToString(buf[:n])
		if i := strings.Index(t, overlayTitlePrefix); i >= 0 {
			name := strings.TrimSpace(t[i+len(overlayTitlePrefix):])
			if j := strings.IndexAny(name, " -"); j > 0 {
				name = name[:j]
			}
			enumFound[h] = name
		}
	}
	return 1
}

func overlayWindows() map[uintptr]string {
	enumMu.Lock()
	defer enumMu.Unlock()
	enumFound = map[uintptr]string{}
	procEnumWindows.Call(enumCB, 0)
	out := enumFound
	enumFound = nil
	return out
}

func applyOverlayStyle(h uintptr, top bool, alpha int, lock bool) {
	after := uintptr(hwndNoTop)
	if top {
		after = uintptr(hwndTopmost)
	}
	procSetWindowPos.Call(h, after, 0, 0, 0, 0, swpNoMove|swpNoSize|swpNoActivate)
	ex, _, _ := procGetWindowLongPtrW.Call(h, uintptr(gwlExStyle))
	ex |= wsExNoActivate
	if alpha < 255 || lock {
		ex |= wsExLayered
	} else {
		ex &^= wsExLayered
	}
	if lock {
		ex |= wsExTransparent
	} else {
		ex &^= wsExTransparent
	}
	procSetWindowLongPtrW.Call(h, uintptr(gwlExStyle), ex)
	if ex&wsExLayered != 0 {
		if alpha < 40 {
			alpha = 40
		}
		procSetLayeredWindowAtt.Call(h, 0, uintptr(alpha), lwaAlpha)
	}
}

func edgePath() string {
	for _, base := range []string{os.Getenv("ProgramFiles(x86)"), os.Getenv("ProgramFiles"), os.Getenv("LocalAppData")} {
		if base == "" {
			continue
		}
		p := filepath.Join(base, "Microsoft", "Edge", "Application", "msedge.exe")
		if _, err := os.Stat(p); err == nil {
			return p
		}
	}
	return ""
}

var (
	procsMu  sync.Mutex
	procs    = map[string]*exec.Cmd{}
	hiddenMu sync.Mutex
	hidden   = map[string]uintptr{}
)

// openOverlay opens a frameless WebView2 window (child process), or an Edge
// app window when that engine is chosen or WebView2 is not available.
func openOverlay(o overlayReq, url, engine string) error {
	if !o.HasPos {
		n := len(listOverlays())
		o.X, o.Y = 80+n*40, 80+n*40
	}
	// Frameless overlays are Edge windows without their title bar and borders:
	// WebView2 windows stayed white on some PCs. The page moves and resizes
	// itself through /api/overlay/move (fl=1).
	if engine != "edge" {
		return openEdgeOverlayFrameless(o, url)
	}
	return openEdgeOverlay(o, url)
}

func openEdgeOverlay(o overlayReq, url string) error { return startEdgeOverlay(o, url, false) }

func openEdgeOverlayFrameless(o overlayReq, url string) error {
	return startEdgeOverlay(o, url+"&fl=1", true)
}

func startEdgeOverlay(o overlayReq, url string, frameless bool) error {
	edge := edgePath()
	if edge == "" {
		return errors.New("Microsoft Edge is needed for overlay windows")
	}
	args := []string{"--app=" + url, "--window-size=" + itoa(o.Width) + "," + itoa(o.Height)}
	if o.HasPos {
		args = append(args, "--window-position="+itoa(o.X)+","+itoa(o.Y))
	}
	if err := exec.Command(edge, args...).Start(); err != nil {
		return err
	}
	go styleWhenReady(o, frameless)
	return nil
}

func styleWhenReady(o overlayReq, frameless bool) {
	for i := 0; i < 60; i++ {
		time.Sleep(250 * time.Millisecond)
		for h, name := range overlayWindows() {
			if name == o.Widget {
				if frameless {
					removeFrame(h)
				}
				// the saved place and size are screen pixels (what Windows reports)
				if o.HasPos && o.Width > 0 && o.Height > 0 {
					procSetWindowPos.Call(h, 0, uintptr(o.X), uintptr(o.Y), uintptr(o.Width), uintptr(o.Height), swpNoActivate|0x0004) // SWP_NOZORDER
				}
				applyOverlayStyle(h, o.Top, o.Alpha, o.Lock)
				return
			}
		}
	}
}

// removeFrame takes the title bar and borders off a window, keeping its place and size.
func removeFrame(h uintptr) {
	const (
		wsCaption    = 0x00C00000
		wsThickFrame = 0x00040000
		wsSysMenu    = 0x00080000
		wsMinBox     = 0x00020000
		wsMaxBox     = 0x00010000
	)
	x, y, w, hh := windowRect(h)
	st, _, _ := procGetWindowLongPtrW.Call(h, uintptr(gwlStyle))
	st &^= wsCaption | wsThickFrame | wsSysMenu | wsMinBox | wsMaxBox
	procSetWindowLongPtrW.Call(h, uintptr(gwlStyle), st)
	procSetWindowPos.Call(h, 0, uintptr(x), uintptr(y), uintptr(w), uintptr(hh), swpFrameChanged|swpNoActivate|0x0004)
}

func overlayRects() map[string][4]int {
	out := map[string][4]int{}
	for h, name := range overlayWindows() {
		x, y, w, hh := windowRect(h)
		out[name] = [4]int{x, y, w, hh}
	}
	return out
}

func setOverlayVisible(name string, on bool) {
	hiddenMu.Lock()
	defer hiddenMu.Unlock()
	if on {
		if h, ok := hidden[name]; ok {
			procShowWindow.Call(h, swShowNoActive)
			procSetWindowPos.Call(h, uintptr(hwndTopmost), 0, 0, 0, 0, swpNoMove|swpNoSize|swpNoActivate)
			delete(hidden, name)
		}
		return
	}
	for h, n := range overlayWindows() {
		if n == name {
			procShowWindow.Call(h, swHide)
			hidden[name] = h
		}
	}
}

func setStartWithWindows(on bool) error {
	key := `HKCU\Software\Microsoft\Windows\CurrentVersion\Run`
	if !on {
		cmd := exec.Command("reg", "delete", key, "/v", "PitWall", "/f")
		hideChildWindow(cmd)
		return cmd.Run()
	}
	exe, err := os.Executable()
	if err != nil {
		return err
	}
	cmd := exec.Command("reg", "add", key, "/v", "PitWall", "/t", "REG_SZ", "/d", `"`+exe+`" -no-browser -minimized`, "/f")
	hideChildWindow(cmd)
	return cmd.Run()
}

var procGetSystemMetrics = user32.NewProc("GetSystemMetrics")

func metric(i int) int { v, _, _ := procGetSystemMetrics.Call(uintptr(i)); return int(int32(v)) }

// screenInfo returns the desktop area overlays can be placed in.
func screenInfo() map[string]any {
	return map[string]any{
		"virtual": [4]int{metric(76), metric(77), metric(78), metric(79)},
		"primary": [4]int{0, 0, metric(0), metric(1)},
	}
}

func moveOverlay(name string, x, y, w, h int) {
	for hw, n := range overlayWindows() {
		if n == name {
			procSetWindowPos.Call(hw, uintptr(hwndTopmost), uintptr(x), uintptr(y), uintptr(w), uintptr(h), swpNoActivate)
		}
	}
}

func minimizeConsole() {
	if h, _, _ := procGetConsoleWin.Call(); h != 0 {
		procShowWindow.Call(h, 6) // SW_MINIMIZE
	}
}

func needsLayer(o overlayReq) bool { return o.Alpha < 255 || o.Lock }

func setOverlays(o overlayReq) int {
	n := 0
	for h, name := range overlayWindows() {
		if o.Widget == "*" || name == o.Widget {
			procsMu.Lock()
			_, webview := procs[name]
			procsMu.Unlock()
			if webview && needsLayer(o) {
				// reopen it as an Edge window, which can be see-through and click-through
				closeOverlays(name)
				go func(name string) { time.Sleep(300 * time.Millisecond); openNamedOverlay(name) }(name)
			} else {
				applyOverlayStyle(h, o.Top, o.Alpha, o.Lock)
			}
			n++
		}
	}
	return n
}

func closeOverlays(widget string) int {
	n := 0
	procsMu.Lock()
	for name, cmd := range procs {
		if widget == "*" || name == widget {
			cmd.Process.Kill()
			delete(procs, name)
			n++
		}
	}
	procsMu.Unlock()
	hiddenMu.Lock()
	for name, h := range hidden {
		if widget == "*" || name == widget {
			procPostMessageW.Call(h, wmClose, 0, 0)
			delete(hidden, name)
		}
	}
	hiddenMu.Unlock()
	for h, name := range overlayWindows() {
		if widget == "*" || name == widget {
			procPostMessageW.Call(h, wmClose, 0, 0)
			n++
		}
	}
	return n
}

func listOverlays() []string {
	seen := map[string]bool{}
	for _, name := range overlayWindows() {
		seen[name] = true
	}
	procsMu.Lock()
	for name := range procs {
		seen[name] = true
	}
	procsMu.Unlock()
	hiddenMu.Lock()
	for name := range hidden {
		seen[name] = true
	}
	hiddenMu.Unlock()
	var out []string
	for n := range seen {
		out = append(out, n)
	}
	return out
}

const overlaysSupported = true

func hideChildWindow(cmd *exec.Cmd) {
	cmd.SysProcAttr = &syscall.SysProcAttr{HideWindow: true, CreationFlags: 0x08000000}
}
