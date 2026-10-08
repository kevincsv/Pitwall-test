//go:build windows

package main

// The native overlays' window (the radar, the delta bar, the relative and the standings; ovnative.go draws them).
// WebView2's content is always composed opaque, so these are layered windows (UpdateLayeredWindow, alpha per
// pixel): only what the overlay draws is on the screen, everything else is see-through and lets the clicks through
// to the game. The window keeps the overlay title (so Pitlane HQ finds, moves, saves and closes it), fits its height
// to what it shows (grows at once, shrinks after a moment) and, while the overlays are being moved, it can be
// dragged and resized from its corner. Its opacity is the overlays' opacity from Settings.

import (
	"os"
	"syscall"
	"time"
	"unsafe"
)

var (
	gdi32                = syscall.NewLazyDLL("gdi32.dll")
	ovRegisterClass      = user32.NewProc("RegisterClassExW")
	ovCreateWindow       = user32.NewProc("CreateWindowExW")
	ovGetMessage         = user32.NewProc("GetMessageW")
	ovTranslateMessage   = user32.NewProc("TranslateMessage")
	ovDispatchMessage    = user32.NewProc("DispatchMessageW")
	ovPostQuit           = user32.NewProc("PostQuitMessage")
	ovSetTimer           = user32.NewProc("SetTimer")
	ovUpdateLayered      = user32.NewProc("UpdateLayeredWindow")
	ovGetDC              = user32.NewProc("GetDC")
	ovReleaseDC          = user32.NewProc("ReleaseDC")
	ovLoadCursor         = user32.NewProc("LoadCursorW")
	ovCreateCompatibleDC = gdi32.NewProc("CreateCompatibleDC")
	ovCreateDIBSection   = gdi32.NewProc("CreateDIBSection")
	ovSelectObject       = gdi32.NewProc("SelectObject")
	ovDeleteObject       = gdi32.NewProc("DeleteObject")
)

var nat struct {
	name     string
	st       *ovState
	edit     bool
	styled   bool
	sizing   bool      // the driver is resizing it: the height is theirs until they let go
	shrinkAt time.Time // when the content first needed less height
	dc, bmp  uintptr
	old      uintptr
	bits     unsafe.Pointer
	bw, bh   int
}

// runNativeOverlay opens a native overlay's window and blocks until it closes.
func runNativeOverlay(name, rawURL string, x, y, w, h int) {
	if w < 80 {
		w = 260
	}
	if h < 40 {
		h = 90
	}
	nat.name = name
	nat.st = newOvState(langFromURL(rawURL))
	nat.st.units = unitsFromURL(rawURL)
	nat.st.varsFn = func() []string { return ovVars(name, nat.st) }
	go ovFeed(rawURL, nat.st.varsFn, nat.st)
	cls, _ := syscall.UTF16PtrFromString("PitlaneHQOverlay")
	title, _ := syscall.UTF16PtrFromString(overlayTitlePrefix + name)
	cursor, _, _ := ovLoadCursor.Call(0, 32512) // IDC_ARROW
	wc := struct {
		Size, Style                     uint32
		WndProc                         uintptr
		ClsExtra, WndExtra              int32
		Instance, Icon, Cursor, BgBrush uintptr
		MenuName, ClassName             *uint16
		IconSm                          uintptr
	}{WndProc: syscall.NewCallback(ovNativeProc), Cursor: cursor, ClassName: cls}
	wc.Size = uint32(unsafe.Sizeof(wc))
	if r, _, _ := ovRegisterClass.Call(uintptr(unsafe.Pointer(&wc))); r == 0 {
		os.Exit(3)
	}
	r := winRect{int32(x), int32(y), int32(x + w), int32(y + h)}
	clampMove(&r)
	ex := uintptr(wsExLayered | wsExAppWindow | wsExNoActivate | wsExTopmost | wsExTransparent)
	hwnd, _, _ := ovCreateWindow.Call(ex, uintptr(unsafe.Pointer(cls)), uintptr(unsafe.Pointer(title)), wsPopup|wsVisible,
		uintptr(r.Left), uintptr(r.Top), uintptr(r.Right-r.Left), uintptr(r.Bottom-r.Top), 0, 0, 0, 0)
	if hwnd == 0 {
		os.Exit(3)
	}
	noWinBorder(hwnd, true)
	ovPaint(hwnd)
	ms := uintptr(33)
	if name == "standings" {
		ms = 100
	}
	ovSetTimer.Call(hwnd, 1, ms, 0)
	var msg [48]byte
	for {
		ret, _, _ := ovGetMessage.Call(uintptr(unsafe.Pointer(&msg[0])), 0, 0, 0)
		if int32(ret) <= 0 {
			return
		}
		ovTranslateMessage.Call(uintptr(unsafe.Pointer(&msg[0])))
		ovDispatchMessage.Call(uintptr(unsafe.Pointer(&msg[0])))
	}
}

func ovNativeProc(h, msg, wp, lp uintptr) uintptr {
	switch msg {
	case 0x0113: // WM_TIMER
		nat.st.mu.Lock()
		edit := nat.st.edit
		nat.st.mu.Unlock()
		if edit != nat.edit || !nat.styled { // moving the overlays: it takes the mouse; otherwise every click goes to the game
			nat.edit, nat.styled = edit, true
			st, _, _ := procGetWindowLongPtrW.Call(h, uintptr(gwlExStyle))
			if edit || ovClickable(nat.name) { // the radio's buttons take clicks (without taking the focus from the game)
				st &^= wsExTransparent
			} else {
				st |= wsExTransparent
			}
			procSetWindowLongPtrW.Call(h, uintptr(gwlExStyle), st)
		}
		ovPaint(h)
		return 0
	case 0x0084: // WM_NCHITTEST: drag it anywhere, resize it from the bottom-right corner
		if !nat.edit {
			if ovClickable(nat.name) {
				return 1 // HTCLIENT: its buttons
			}
			return ^uintptr(0) // HTTRANSPARENT
		}
		x, y, w, hh := windowRect(h)
		px, py := int(int16(lp&0xffff)), int(int16((lp>>16)&0xffff))
		if px > x+w-18 && py > y+hh-18 {
			return 17 // HTBOTTOMRIGHT
		}
		return 2 // HTCAPTION
	case 0x0216: // WM_MOVING
		clampMove((*winRect)(unsafe.Pointer(lp)))
		return 1
	case 0x0214: // WM_SIZING
		r := (*winRect)(unsafe.Pointer(lp))
		clampSize(r)
		if r.Right-r.Left < 80 {
			r.Right = r.Left + 80
		}
		if r.Bottom-r.Top < 40 {
			r.Bottom = r.Top + 40
		}
		return 1
	case 0x0021: // WM_MOUSEACTIVATE: a click never takes the focus from the game
		return 3 // MA_NOACTIVATE
	case 0x0201: // WM_LBUTTONDOWN
		if !nat.edit {
			ovClick(nat.name, nat.st, float64(int16(lp&0xffff)), float64(int16((lp>>16)&0xffff)))
		}
		return 0
	case 0x0231: // WM_ENTERSIZEMOVE
		nat.sizing = true
	case 0x0232: // WM_EXITSIZEMOVE
		nat.sizing = false
	case 0x0005: // WM_SIZE
		ovPaint(h)
		return 0
	case 0x0002: // WM_DESTROY
		ovPostQuit.Call(0)
		return 0
	}
	r, _, _ := procDefWindowProc.Call(h, msg, wp, lp)
	return r
}

// ovBuffer makes the bitmap the overlay is drawn into (w×h)
func ovBuffer(w, h int) bool {
	if nat.bw == w && nat.bh == h && nat.dc != 0 {
		return true
	}
	if nat.dc != 0 {
		ovSelectObject.Call(nat.dc, nat.old)
		ovDeleteObject.Call(nat.bmp)
		ovDeleteObject.Call(nat.dc)
		nat.dc = 0
	}
	screen, _, _ := ovGetDC.Call(0)
	dc, _, _ := ovCreateCompatibleDC.Call(screen)
	bi := struct {
		Size                 uint32
		Width, Height        int32
		Planes, BitCount     uint16
		Compression, SizeImg uint32
		XPels, YPels         int32
		ClrUsed, ClrImp      uint32
	}{Width: int32(w), Height: -int32(h), Planes: 1, BitCount: 32}
	bi.Size = uint32(unsafe.Sizeof(bi))
	var bits unsafe.Pointer
	bmp, _, _ := ovCreateDIBSection.Call(dc, uintptr(unsafe.Pointer(&bi)), 0, uintptr(unsafe.Pointer(&bits)), 0, 0)
	ovReleaseDC.Call(0, screen)
	if bmp == 0 || bits == nil {
		ovDeleteObject.Call(dc)
		return false
	}
	old, _, _ := ovSelectObject.Call(dc, bmp)
	nat.dc, nat.bmp, nat.old, nat.bits, nat.bw, nat.bh = dc, bmp, old, bits, w, h
	return true
}

// ovPaint draws a frame and hands it to Windows with its alpha; the window takes the height the overlay needs
func ovPaint(hwnd uintptr) {
	x, y, w, h := windowRect(hwnd)
	if w <= 0 || h <= 0 || !ovBuffer(w, h) {
		return
	}
	now := time.Now()
	c := &ovCanvas{w: w, h: h, px: unsafe.Slice((*uint32)(nat.bits), w*h)}
	need := ovDraw(nat.name, c, nat.st, now)
	if need > 0 && !nat.sizing {
		s := desktopRect()
		if max := int(s.Bottom - s.Top); need > max {
			need = max
		}
		switch {
		case need > h: // more to show: it grows at once
			nat.shrinkAt = time.Time{}
			h = need
		case need < h: // less: it shrinks after a moment (no jumping when a row comes and goes)
			if nat.shrinkAt.IsZero() {
				nat.shrinkAt = now
			} else if now.Sub(nat.shrinkAt) > 400*time.Millisecond {
				nat.shrinkAt = time.Time{}
				h = need
			}
		default:
			nat.shrinkAt = time.Time{}
		}
		if h != nat.bh {
			r := winRect{int32(x), int32(y), int32(x + w), int32(y + h)}
			clampMove(&r) // growing never pushes it off the screen
			x, y = int(r.Left), int(r.Top)
			if !ovBuffer(w, h) {
				return
			}
			c = &ovCanvas{w: w, h: h, px: unsafe.Slice((*uint32)(nat.bits), w*h)}
			ovDraw(nat.name, c, nat.st, now)
		}
	}
	nat.st.mu.Lock()
	alpha := nat.st.alpha
	nat.st.mu.Unlock()
	if alpha < 40 || alpha > 255 {
		alpha = 255
	}
	pt, src, size := [2]int32{int32(x), int32(y)}, [2]int32{0, 0}, [2]int32{int32(w), int32(h)}
	blend := uint32(0x01000000) | uint32(alpha)<<16 // AC_SRC_OVER, the overlays' opacity, AC_SRC_ALPHA
	// with the position and the size, this also moves and resizes the window
	ovUpdateLayered.Call(hwnd, 0, uintptr(unsafe.Pointer(&pt)), uintptr(unsafe.Pointer(&size)), nat.dc, uintptr(unsafe.Pointer(&src)), 0, uintptr(unsafe.Pointer(&blend)), 2) // ULW_ALPHA
}
