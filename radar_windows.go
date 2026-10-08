//go:build windows

package main

// The radar over the game is drawn here, not by WebView2. WebView2's content is always composed opaque, so a
// web radar shows a black square around the cars. This is a layered window (UpdateLayeredWindow, alpha per
// pixel): only your car's outline, the cars coming and the nearest car's distance are drawn; everything else
// is fully see-through and lets the clicks through to the game. It reads the PC's live stream like the other
// overlays, keeps the overlay title (so Pitlane HQ finds, moves, saves and closes it) and, while the overlays
// are being moved, it can be dragged and resized from its corner.

import (
	"bufio"
	"encoding/json"
	"math"
	"net/http"
	"net/http/cookiejar"
	"net/url"
	"os"
	"strconv"
	"strings"
	"sync"
	"syscall"
	"time"
	"unsafe"
)

var (
	gdi32                 = syscall.NewLazyDLL("gdi32.dll")
	rdrRegisterClass      = user32.NewProc("RegisterClassExW")
	rdrCreateWindow       = user32.NewProc("CreateWindowExW")
	rdrGetMessage         = user32.NewProc("GetMessageW")
	rdrTranslateMessage   = user32.NewProc("TranslateMessage")
	rdrDispatchMessage    = user32.NewProc("DispatchMessageW")
	rdrPostQuit           = user32.NewProc("PostQuitMessage")
	rdrSetTimer           = user32.NewProc("SetTimer")
	rdrUpdateLayered      = user32.NewProc("UpdateLayeredWindow")
	rdrGetDC              = user32.NewProc("GetDC")
	rdrReleaseDC          = user32.NewProc("ReleaseDC")
	rdrLoadCursor         = user32.NewProc("LoadCursorW")
	rdrCreateCompatibleDC = gdi32.NewProc("CreateCompatibleDC")
	rdrCreateDIBSection   = gdi32.NewProc("CreateDIBSection")
	rdrSelectObject       = gdi32.NewProc("SelectObject")
	rdrDeleteObject       = gdi32.NewProc("DeleteObject")
)

// what the radar knows, filled by the stream and read by the window at 30 frames a second
type radarState struct {
	mu       sync.Mutex
	me       int
	pct      []float64
	surf     []float64
	lr       int
	at       time.Time // last frame
	trackLen float64
	skip     map[int]bool // the pace car and spectators
	edit     bool
	lock     bool
	rng      float64
	autohide bool
}

var rdr = &radarState{me: -1, rng: 20, autohide: true}

// runNativeRadar opens the radar window and blocks until it closes.
func runNativeRadar(rawURL string, x, y, w, h int) {
	if w < 80 {
		w = 260
	}
	if h < 80 {
		h = 300
	}
	go radarFeed(rawURL)
	hinst := uintptr(0)
	cls, _ := syscall.UTF16PtrFromString("PitlaneHQRadar")
	title, _ := syscall.UTF16PtrFromString(overlayTitlePrefix + "radar")
	cursor, _, _ := rdrLoadCursor.Call(0, 32512) // IDC_ARROW
	wc := struct {
		Size, Style                     uint32
		WndProc                         uintptr
		ClsExtra, WndExtra              int32
		Instance, Icon, Cursor, BgBrush uintptr
		MenuName, ClassName             *uint16
		IconSm                          uintptr
	}{Style: 0, WndProc: syscall.NewCallback(radarWndProc), Instance: hinst, Cursor: cursor, ClassName: cls}
	wc.Size = uint32(unsafe.Sizeof(wc))
	if r, _, _ := rdrRegisterClass.Call(uintptr(unsafe.Pointer(&wc))); r == 0 {
		os.Exit(3)
	}
	r := winRect{int32(x), int32(y), int32(x + w), int32(y + h)}
	clampMove(&r)
	ex := uintptr(wsExLayered | wsExAppWindow | wsExNoActivate | wsExTopmost | wsExTransparent)
	hwnd, _, _ := rdrCreateWindow.Call(ex, uintptr(unsafe.Pointer(cls)), uintptr(unsafe.Pointer(title)), wsPopup|wsVisible,
		uintptr(r.Left), uintptr(r.Top), uintptr(r.Right-r.Left), uintptr(r.Bottom-r.Top), 0, 0, hinst, 0)
	if hwnd == 0 {
		os.Exit(3)
	}
	noWinBorder(hwnd, true)
	radarPaint(hwnd)
	rdrSetTimer.Call(hwnd, 1, 33, 0)
	var msg [48]byte
	for {
		ret, _, _ := rdrGetMessage.Call(uintptr(unsafe.Pointer(&msg[0])), 0, 0, 0)
		if int32(ret) <= 0 {
			return
		}
		rdrTranslateMessage.Call(uintptr(unsafe.Pointer(&msg[0])))
		rdrDispatchMessage.Call(uintptr(unsafe.Pointer(&msg[0])))
	}
}

var radarEditShown = false

func radarWndProc(h, msg, wp, lp uintptr) uintptr {
	switch msg {
	case 0x0113: // WM_TIMER
		rdr.mu.Lock()
		edit := rdr.edit
		rdr.mu.Unlock()
		if edit != radarEditShown { // moving the overlays: it takes the mouse; otherwise every click goes to the game
			radarEditShown = edit
			st, _, _ := procGetWindowLongPtrW.Call(h, uintptr(gwlExStyle))
			if edit {
				st &^= wsExTransparent
			} else {
				st |= wsExTransparent
			}
			procSetWindowLongPtrW.Call(h, uintptr(gwlExStyle), st)
		}
		radarPaint(h)
		return 0
	case 0x0084: // WM_NCHITTEST: drag it anywhere, resize it from the bottom-right corner
		if !radarEditShown {
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
		if r.Bottom-r.Top < 80 {
			r.Bottom = r.Top + 80
		}
		return 1
	case 0x0005: // WM_SIZE
		radarPaint(h)
		return 0
	case 0x0002: // WM_DESTROY
		rdrPostQuit.Call(0)
		return 0
	}
	r, _, _ := procDefWindowProc.Call(h, msg, wp, lp)
	return r
}

// ---------- the picture ----------

type radarCanvas struct {
	w, h int
	px   []uint32 // premultiplied BGRA
}

// blend paints a straight colour with alpha a (0..1) over a pixel
func (c *radarCanvas) blend(x, y int, col uint32, a float64) {
	if x < 0 || y < 0 || x >= c.w || y >= c.h || a <= 0 {
		return
	}
	if a > 1 {
		a = 1
	}
	i := y*c.w + x
	d := c.px[i]
	inv := 1 - a
	ch := func(s, sh uint32) uint32 {
		v := float64((col>>s)&0xff)*a + float64((d>>sh)&0xff)*inv
		if v > 255 {
			v = 255
		}
		return uint32(v + 0.5)
	}
	da := float64(d>>24) * inv
	na := a*255 + da
	if na > 255 {
		na = 255
	}
	c.px[i] = uint32(na+0.5)<<24 | ch(16, 16)<<16 | ch(8, 8)<<8 | ch(0, 0)
}

// roundRect fills (and outlines) a rounded rectangle with smooth edges
func (c *radarCanvas) roundRect(cx, cy, w, h, rad float64, fill uint32, fa float64, stroke uint32, sa, lw float64) {
	x0, y0, x1, y1 := int(cx-w/2-lw-2), int(cy-h/2-lw-2), int(cx+w/2+lw+2), int(cy+h/2+lw+2)
	hx, hy := w/2-rad, h/2-rad
	for y := y0; y <= y1; y++ {
		for x := x0; x <= x1; x++ {
			qx, qy := math.Abs(float64(x)+0.5-cx)-hx, math.Abs(float64(y)+0.5-cy)-hy
			d := math.Hypot(math.Max(qx, 0), math.Max(qy, 0)) + math.Min(math.Max(qx, qy), 0) - rad
			if fa > 0 {
				c.blend(x, y, fill, fa*clamp01(0.5-d))
			}
			if sa > 0 && lw > 0 {
				c.blend(x, y, stroke, sa*clamp01(math.Min(0.5-d, 0.5+d+lw)))
			}
		}
	}
}

func clamp01(v float64) float64 { return math.Max(0, math.Min(1, v)) }

// 5×7 digits for the distance (and the dot and the m)
var radarFont = map[rune][7]uint8{
	'0': {14, 17, 19, 21, 25, 17, 14}, '1': {4, 12, 4, 4, 4, 4, 14}, '2': {14, 17, 1, 2, 4, 8, 31}, '3': {31, 2, 4, 2, 1, 17, 14},
	'4': {2, 6, 10, 18, 31, 2, 2}, '5': {31, 16, 30, 1, 1, 17, 14}, '6': {6, 8, 16, 30, 17, 17, 14}, '7': {31, 1, 2, 4, 8, 8, 8},
	'8': {14, 17, 17, 14, 17, 17, 14}, '9': {14, 17, 17, 15, 1, 2, 12}, '.': {0, 0, 0, 0, 0, 12, 12}, 'm': {0, 0, 26, 21, 21, 21, 21},
}

func (c *radarCanvas) text(s string, cx, cy, sc float64, col uint32) {
	n := len([]rune(s))
	w := float64(n*6-1) * sc
	x0, y0 := cx-w/2, cy-3.5*sc
	draw := func(grow float64, col uint32, a float64) {
		for k, r := range []rune(s) {
			g, ok := radarFont[r]
			if !ok {
				continue
			}
			for row := 0; row < 7; row++ {
				for bit := 0; bit < 5; bit++ {
					if g[row]&(1<<(4-bit)) == 0 {
						continue
					}
					px, py := x0+float64(k*6+bit)*sc, y0+float64(row)*sc
					for yy := int(py - grow); yy < int(py+sc+grow+0.5); yy++ {
						for xx := int(px - grow); xx < int(px+sc+grow+0.5); xx++ {
							c.blend(xx, yy, col, a)
						}
					}
				}
			}
		}
	}
	draw(math.Max(1, sc*0.6), 0x000000, 0.75) // a dark edge, readable over any part of the game
	draw(0, col, 1)
}

type radarCar struct{ dm, lat float64 }

// radarDraw: the cars within the range around yours, as seen from above (yours in the middle, the track going up)
func radarDraw(c *radarCanvas, now time.Time) {
	for i := range c.px {
		c.px[i] = 0
	}
	rdr.mu.Lock()
	edit, rng, autohide := rdr.edit, rdr.rng, rdr.autohide
	me, lr, L, fresh := rdr.me, rdr.lr, rdr.trackLen, now.Sub(rdr.at) < 2*time.Second
	pct, surf, skip := append([]float64(nil), rdr.pct...), append([]float64(nil), rdr.surf...), rdr.skip
	rdr.mu.Unlock()
	if rng < 5 {
		rng = 20
	}
	if edit { // where it is while you move it
		for y := 0; y < c.h; y++ {
			for x := 0; x < c.w; x++ {
				a := 0.32
				if x < 2 || y < 2 || x >= c.w-2 || y >= c.h-2 {
					c.blend(x, y, 0xffb02e, 1)
					continue
				}
				c.blend(x, y, 0x0b0e13, a)
			}
		}
		for k := 0; k < 14; k++ { // the resize corner
			for j := 0; j <= k; j++ {
				c.blend(c.w-3-j, c.h-3-14+k, 0xffb02e, 1)
			}
		}
	}
	var near []radarCar
	if fresh && me >= 0 && me < len(pct) && pct[me] >= 0 && L > 0 {
		for i, p := range pct {
			if i == me || p < 0 || skip[i] || (i < len(surf) && surf[i] != 3) {
				continue
			}
			d := p - pct[me]
			if d > .5 {
				d--
			} else if d < -.5 {
				d++
			}
			if dm := d * L; math.Abs(dm) < rng+6 {
				near = append(near, radarCar{dm: dm})
			}
		}
	}
	busy := lr >= 2
	for _, n := range near {
		if math.Abs(n.dm) < rng {
			busy = true
		}
	}
	if busy {
		radarClearSince = time.Time{}
	} else if radarClearSince.IsZero() {
		radarClearSince = now
	}
	if !edit && autohide && !busy && now.Sub(radarClearSince) > 1500*time.Millisecond {
		return // nobody near: nothing at all on the screen
	}
	// who is alongside, and on which side (iRacing's CarLeftRight)
	side := []int{}
	for k, n := range near {
		if math.Abs(n.dm) < 5.5 {
			side = append(side, k)
		}
	}
	for a := 0; a < len(side); a++ { // nearest first
		for b := a + 1; b < len(side); b++ {
			if math.Abs(near[side[b]].dm) < math.Abs(near[side[a]].dm) {
				side[a], side[b] = side[b], side[a]
			}
		}
	}
	put := func(k int, l float64) {
		if k < len(side) {
			near[side[k]].lat = l
		}
	}
	switch lr {
	case 2:
		put(0, -1)
	case 3:
		put(0, 1)
	case 4:
		put(0, -1)
		put(1, 1)
	case 5:
		put(0, -1)
		put(1, -1)
	case 6:
		put(0, 1)
		put(1, 1)
	}
	S := math.Min(float64(c.w), float64(c.h))
	cx, cy := float64(c.w)/2, float64(c.h)/2
	ppm := (S/2 - 8) / rng
	const CL, CW, LW = 4.6, 1.9, 2.7
	// someone next to you: a red bar down that side
	bar := func(dir float64) {
		X, H := cx+dir*(LW*ppm+CW*ppm*1.1), CL*ppm*2.6
		half := math.Max(2.5, ppm*0.3)
		for y := int(cy - H/2); y < int(cy+H/2); y++ {
			a := 1 - math.Abs(float64(y)-cy)/(H/2)
			for x := int(X - half); x < int(X+half); x++ {
				c.blend(x, y, 0xff4d4f, 0.9*a)
			}
		}
	}
	if lr == 2 || lr == 4 || lr == 5 {
		bar(-1)
	}
	if lr == 3 || lr == 4 || lr == 6 {
		bar(1)
	}
	W, H := CW*ppm, CL*ppm
	for _, n := range near {
		d := math.Abs(n.dm)
		if d > rng+3 {
			continue
		}
		col := uint32(0xc9d1da)
		switch {
		case n.lat != 0 || d < CL*1.2:
			col = 0xff4d4f
		case d < 10:
			col = 0xffb02e
		}
		a := 1.0
		if n.lat == 0 {
			a = math.Max(0.35, 1-d/(rng+3)*0.65)
		}
		X, Y := cx+n.lat*LW*ppm, cy-n.dm*ppm
		c.roundRect(X, Y+1.5, W+3, H+3, math.Min(W, H)*0.4, 0x000000, 0.35*a, 0, 0, 0) // a soft shadow
		c.roundRect(X, Y, W, H, math.Min(W, H)*0.35, col, a, 0x000000, 0.55*a, 1.2)
	}
	c.roundRect(cx, cy, W, H, math.Min(W, H)*0.35, 0xffffff, 0.12, 0xffffff, 0.9, 2) // you
	// the nearest car's distance
	var best *radarCar
	for k := range near {
		n := &near[k]
		if n.lat == 0 && math.Abs(n.dm) <= rng && (best == nil || math.Abs(n.dm) < math.Abs(best.dm)) {
			best = n
		}
	}
	if best != nil {
		col := uint32(0xe8edf3)
		if math.Abs(best.dm) < 10 {
			col = 0xffb02e
		}
		sc := math.Max(2, math.Round(ppm*0.28))
		y := cy - best.dm*ppm
		if best.dm > 0 {
			y -= H/2 + 6*sc
		} else {
			y += H/2 + 6*sc
		}
		c.text(strconv.FormatFloat(math.Abs(best.dm), 'f', 1, 64)+"m", cx, y, sc, col)
	}
}

var radarClearSince time.Time

var radarBuf struct {
	dc, bmp, old uintptr
	bits         unsafe.Pointer
	w, h         int
}

// radarPaint draws a frame and hands it to Windows with its alpha
func radarPaint(hwnd uintptr) {
	x, y, w, h := windowRect(hwnd)
	if w <= 0 || h <= 0 {
		return
	}
	if radarBuf.w != w || radarBuf.h != h || radarBuf.dc == 0 {
		if radarBuf.dc != 0 {
			rdrSelectObject.Call(radarBuf.dc, radarBuf.old)
			rdrDeleteObject.Call(radarBuf.bmp)
			rdrDeleteObject.Call(radarBuf.dc)
		}
		screen, _, _ := rdrGetDC.Call(0)
		dc, _, _ := rdrCreateCompatibleDC.Call(screen)
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
		bmp, _, _ := rdrCreateDIBSection.Call(dc, uintptr(unsafe.Pointer(&bi)), 0, uintptr(unsafe.Pointer(&bits)), 0, 0)
		rdrReleaseDC.Call(0, screen)
		if bmp == 0 || bits == nil {
			return
		}
		old, _, _ := rdrSelectObject.Call(dc, bmp)
		radarBuf.dc, radarBuf.bmp, radarBuf.old, radarBuf.bits, radarBuf.w, radarBuf.h = dc, bmp, old, bits, w, h
	}
	c := &radarCanvas{w: w, h: h, px: unsafe.Slice((*uint32)(radarBuf.bits), w*h)}
	radarDraw(c, time.Now())
	pt, src := [2]int32{int32(x), int32(y)}, [2]int32{0, 0}
	size := [2]int32{int32(w), int32(h)}
	blend := uint32(0x01FF0000)                                                                                                                                                     // AC_SRC_OVER, flags 0, constant alpha 255, AC_SRC_ALPHA
	rdrUpdateLayered.Call(hwnd, 0, uintptr(unsafe.Pointer(&pt)), uintptr(unsafe.Pointer(&size)), radarBuf.dc, uintptr(unsafe.Pointer(&src)), 0, uintptr(unsafe.Pointer(&blend)), 2) // ULW_ALPHA
}

// ---------- the data: the PC's live stream ----------

func radarFeed(rawURL string) {
	u, err := url.Parse(rawURL)
	if err != nil {
		return
	}
	base, lt := u.Scheme+"://"+u.Host, u.Query().Get("lt")
	jar, _ := cookiejar.New(nil)
	client := &http.Client{Jar: jar}
	for {
		q := base + "/api/stream?vars=PlayerCarIdx,CarIdxLapDistPct,CarIdxTrackSurface,CarLeftRight&hz=30"
		if lt != "" { // the one-use ticket of this window: it leaves a cookie for the reconnections
			q += "&lt=" + url.QueryEscape(lt)
			lt = ""
		}
		resp, err := client.Get(q)
		if err == nil && resp.StatusCode == 200 {
			radarRead(resp)
		}
		if resp != nil {
			resp.Body.Close()
		}
		time.Sleep(time.Second)
	}
}

func radarRead(resp *http.Response) {
	sc := bufio.NewScanner(resp.Body)
	sc.Buffer(make([]byte, 64<<10), 8<<20)
	var fields []string
	ev, data := "", ""
	for sc.Scan() {
		line := sc.Text()
		switch {
		case strings.HasPrefix(line, "event: "):
			ev = line[7:]
		case strings.HasPrefix(line, "data: "):
			data = line[6:]
		case line == "":
			radarEvent(ev, data, &fields)
			ev, data = "", ""
		}
	}
}

func radarEvent(ev, data string, fields *[]string) {
	switch ev {
	case "fields":
		json.Unmarshal([]byte(data), fields)
	case "t":
		var f struct{ V []json.RawMessage }
		if json.Unmarshal([]byte(data), &f) != nil {
			return
		}
		rdr.mu.Lock()
		defer rdr.mu.Unlock()
		for i, n := range *fields {
			if i >= len(f.V) {
				break
			}
			switch n {
			case "PlayerCarIdx":
				var v float64
				if json.Unmarshal(f.V[i], &v) == nil {
					rdr.me = int(v)
				}
			case "CarLeftRight":
				var v float64
				if json.Unmarshal(f.V[i], &v) == nil {
					rdr.lr = int(v)
				}
			case "CarIdxLapDistPct":
				rdr.pct = rdr.pct[:0]
				json.Unmarshal(f.V[i], &rdr.pct)
			case "CarIdxTrackSurface":
				rdr.surf = rdr.surf[:0]
				json.Unmarshal(f.V[i], &rdr.surf)
			}
		}
		rdr.at = time.Now()
	case "session":
		var y string
		if json.Unmarshal([]byte(data), &y) != nil {
			return
		}
		L, skip := radarSession(y)
		rdr.mu.Lock()
		if L > 0 {
			rdr.trackLen = L
		}
		rdr.skip = skip
		rdr.mu.Unlock()
	case "config":
		var c struct {
			Config struct {
				Edit, Lock bool
				UI         map[string]any `json:"ui"`
			}
		}
		if json.Unmarshal([]byte(data), &c) != nil {
			return
		}
		rdr.mu.Lock()
		rdr.edit, rdr.lock = c.Config.Edit, c.Config.Lock
		rdr.rng, rdr.autohide = 20, true
		if m, ok := c.Config.UI["radar"].(map[string]any); ok {
			if v, ok := m["range"].(float64); ok && v >= 5 && v <= 100 {
				rdr.rng = v
			}
			if v, ok := m["autohide"].(bool); ok {
				rdr.autohide = v
			}
		}
		rdr.mu.Unlock()
	}
}

// radarSession: the track's length in metres and the cars that are not racing (pace car, spectators)
func radarSession(y string) (float64, map[int]bool) {
	L := 0.0
	skip := map[int]bool{}
	car := -1
	for _, line := range strings.Split(y, "\n") {
		t := strings.TrimSpace(strings.TrimPrefix(strings.TrimSpace(line), "- "))
		k, v, ok := strings.Cut(t, ":")
		if !ok {
			continue
		}
		v = strings.TrimSpace(v)
		switch k {
		case "TrackLength":
			if f, err := strconv.ParseFloat(strings.TrimSuffix(strings.TrimSuffix(v, " km"), "km"), 64); err == nil && L == 0 {
				L = f * 1000
			}
		case "CarIdx":
			car, _ = strconv.Atoi(v)
		case "CarIsPaceCar", "IsSpectator":
			if v == "1" && car >= 0 {
				skip[car] = true
			}
		}
	}
	return L, skip
}
