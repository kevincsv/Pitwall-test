//go:build windows

package main

// The native overlays' window (the radar, the delta bar, the relative and the standings; ovnative.go draws them).
// WebView2's content is always composed opaque, so these are layered windows (UpdateLayeredWindow, alpha per
// pixel): only what the overlay draws is on the screen, everything else is see-through and lets the clicks through
// to the game. The window keeps the overlay title (so Pitlane HQ finds, moves, saves and closes it), fits its height
// to what it shows (grows at once, shrinks after a moment) and, while the overlays are being moved, it can be
// dragged and resized from its corner. Its opacity is the overlays' opacity from Settings.

import (
	"log"
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
	ovIsWindowVisible    = user32.NewProc("IsWindowVisible")
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
	pace     ovPace   // when it draws (ovpace.go)
	shown    []uint32 // the picture on the screen now
	shownAt  [5]int   // where, how big and how opaque (x, y, w, h, alpha)
	vrAt     time.Time
	timerMs  uintptr
	hidden   bool
}

// runNativeOverlay opens a native overlay's window and blocks until it closes.
func runNativeOverlay(name, rawURL string, x, y, w, h int) {
	if w < 80 {
		w = 260
	}
	if h < 40 {
		h = 90
	}
	if mw, mh := overlayMinSize(name); w < mw || h < mh { // one made smaller before stays readable
		w, h = max(w, mw), max(h, mh)
	}
	nat.name = name
	nat.st = newOvState(langFromURL(rawURL))
	nat.st.units = unitsFromURL(rawURL)
	if name == "radar" {
		nat.st.hz = 60 // every sample the game gives
	}
	nat.st.varsFn = func() []string { return ovWithOnTrack(ovVars(name, nat.st)) }
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
	// the radar every frame the game gives (60 a second): the cars around you where they are now
	nat.timerMs = ovTimerMs(name, nil)
	ovSetTimer.Call(hwnd, 1, nat.timerMs, 0)
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

func ovNativeProc(h, msg, wp, lp uintptr) (ret uintptr) {
	// a panic inside a window callback would take the whole program down: it is logged and the frame is skipped
	defer func() {
		if r := recover(); r != nil {
			log.Printf("overlay %s: %v", nat.name, r)
			ret = 0
		}
	}()
	switch msg {
	case 0x0113: // WM_TIMER
		nat.st.mu.Lock()
		edit, ms := nat.st.edit, ovTimerMs(nat.name, nat.st.ui)
		nat.st.mu.Unlock()
		// hidden (Overlays → Hide): nothing drawn, its stream closed, the timer slow until it shows again
		vis, _, _ := ovIsWindowVisible.Call(h)
		if hide := vis == 0; hide != nat.hidden {
			nat.hidden = hide
			nat.st.hidden.Store(hide)
			nat.pace = ovPace{}
		}
		if nat.hidden {
			ms = 250
		}
		if ms != nat.timerMs { // Overlays → Frame rate
			nat.timerMs = ms
			ovSetTimer.Call(h, 1, ms, 0)
		}
		if nat.hidden {
			return 0
		}
		if edit != nat.edit || !nat.styled { // moving the overlays: it takes the mouse; otherwise every click goes to the game
			nat.edit, nat.styled = edit, true
			st, _, _ := procGetWindowLongPtrW.Call(h, uintptr(gwlExStyle))
			if edit {
				st &^= wsExTransparent
			} else {
				st |= wsExTransparent
			}
			procSetWindowLongPtrW.Call(h, uintptr(gwlExStyle), st)
		}
		ovTick(h)
		return 0
	case 0x0084: // WM_NCHITTEST: drag it anywhere, resize it from the bottom-right corner
		if !nat.edit {
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
		mw, mh := overlayMinSize(nat.name)
		if r.Right-r.Left < int32(mw) {
			r.Right = r.Left + int32(mw)
		}
		if r.Bottom-r.Top < int32(mh) {
			r.Bottom = r.Top + int32(mh)
		}
		return 1
	case 0x0024: // WM_GETMINMAXINFO: the frame never goes below the smallest it can be read at, not even while dragging
		mw, mh := overlayMinSize(nat.name)
		mi := (*[10]int32)(unsafe.Pointer(lp)) // ptReserved, ptMaxSize, ptMaxPosition, ptMinTrackSize, ptMaxTrackSize
		mi[6], mi[7] = int32(mw), int32(mh)
		return 0
	case 0x0021: // WM_MOUSEACTIVATE: a click never takes the focus from the game
		return 3 // MA_NOACTIVATE
	case 0x0231: // WM_ENTERSIZEMOVE
		nat.sizing = true
	case 0x0232: // WM_EXITSIZEMOVE
		nat.sizing = false
	case 0x0005: // WM_SIZE
		nat.pace = ovPace{}
		ovPaint(h)
		return 0
	case 0x0002: // WM_DESTROY
		vrStop()
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

// ovTick: the timer's frame, drawn only when it may show something new (ovPace)
func ovTick(hwnd uintptr) {
	_, _, w, h := windowRect(hwnd)
	if nat.sizing || nat.pace.due(nat.st, w, h, time.Now()) {
		ovPaint(hwnd)
	}
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
	alpha, ui := nat.st.alpha, nat.st.ui
	nat.st.mu.Unlock()
	if alpha < 40 || alpha > 255 {
		alpha = 255
	}
	px := unsafe.Slice((*uint32)(nat.bits), w*h)
	// the same picture at the same place as the one on the screen: Windows is not asked to compose it again
	at := [5]int{x, y, w, h, int(alpha)}
	same := at == nat.shownAt && samePixels(px, nat.shown)
	nat.pace.done(nat.st, w, h, now, same)
	if same && !nat.sizing {
		if now.Sub(nat.vrAt) >= 500*time.Millisecond { // the headset still hears from it now and then (SteamVR's events)
			nat.vrAt = now
			vrFrame(nat.name, px, x, y, w, h, int(alpha), ui)
		}
		return
	}
	nat.shown, nat.shownAt, nat.vrAt = append(nat.shown[:0], px...), at, now
	defer vrFrame(nat.name, px, x, y, w, h, int(alpha), ui) // and in the headset, with VR on
	pt, src, size := [2]int32{int32(x), int32(y)}, [2]int32{0, 0}, [2]int32{int32(w), int32(h)}
	blend := uint32(0x01000000) | uint32(alpha)<<16 // AC_SRC_OVER, the overlays' opacity, AC_SRC_ALPHA
	// with the position and the size, this also moves and resizes the window; while Windows itself drags or resizes
	// it, neither is given (the two would fight over where the window is, and it flickers)
	ppt, psize := uintptr(unsafe.Pointer(&pt)), uintptr(unsafe.Pointer(&size))
	if nat.sizing {
		ppt, psize = 0, 0
	}
	ovUpdateLayered.Call(hwnd, 0, ppt, psize, nat.dc, uintptr(unsafe.Pointer(&src)), 0, uintptr(unsafe.Pointer(&blend)), 2) // ULW_ALPHA
}
