package main

// Native overlays: the radar, the delta bar, the relative and the standings are drawn by Pitlane HQ itself
// (no WebView2), on a see-through window (ovnative_windows.go). This file is the platform-free part: the
// picture (shapes and text with the Go fonts), the data from the PC's live stream and what each overlay draws.
// They follow the same settings as the web widgets (columns, header, footer, rows, range…), fit their height to
// what they show, and scale with the window's width.

import (
	"bufio"
	_ "embed"
	"encoding/json"
	"fmt"
	"image"
	"math"
	"net/http"
	"net/http/cookiejar"
	"net/url"
	"sort"
	"strconv"
	"strings"
	"sync"
	"time"

	"golang.org/x/image/font"
	"golang.org/x/image/font/opentype"
	"golang.org/x/image/math/fixed"
)

// nativeOverlay: the overlays drawn natively
func nativeOverlay(name string) bool {
	switch name {
	case "radar", "deltabar", "relative", "standings":
		return true
	}
	return gaugeOverlay(name) || sessionOverlay(name) || lapOverlay(name) || extraOverlay(name)
}

// the width each overlay is designed for: the window's width scales everything from it
var ovDesign = map[string]float64{"radar": 260, "deltabar": 520, "relative": 600, "standings": 720,
	"flag": 520, "dash": 560, "timing": 440, "fuel": 420, "engine": 320, "tyres": 420, "inputs": 560, "boost": 360, "telemetry": 420, "gg": 280,
	"stats": 420, "pit": 440, "sectors": 560, "gaps": 560, "incidents": 380,
	"map": 440, "compare": 680, "brakes": 480, "coach": 520, "radio": 420,
	"weather": 360, "controls": 340, "trackbar": 700, "system": 320}

// ---------- the picture ----------

type ovCanvas struct {
	w, h int
	px   []uint32 // premultiplied BGRA (0xAARRGGBB)
}

func newCanvas(w, h int) *ovCanvas { return &ovCanvas{w: w, h: h, px: make([]uint32, w*h)} }

func (c *ovCanvas) clear() {
	for i := range c.px {
		c.px[i] = 0
	}
}

// blend paints a straight colour with alpha a (0..1) over a pixel
func (c *ovCanvas) blend(x, y int, col uint32, a float64) {
	if x < 0 || y < 0 || x >= c.w || y >= c.h || a <= 0 {
		return
	}
	if a > 1 {
		a = 1
	}
	i := y*c.w + x
	d := c.px[i]
	inv := 1 - a
	ch := func(s uint32) uint32 {
		v := float64((col>>s)&0xff)*a + float64((d>>s)&0xff)*inv
		if v > 255 {
			v = 255
		}
		return uint32(v + 0.5)
	}
	na := a*255 + float64(d>>24)*inv
	if na > 255 {
		na = 255
	}
	c.px[i] = uint32(na+0.5)<<24 | ch(16)<<16 | ch(8)<<8 | ch(0)
}

func clamp01(v float64) float64 { return math.Max(0, math.Min(1, v)) }

// roundRect fills (and outlines) a rounded rectangle with smooth edges; x, y is its top-left corner
func (c *ovCanvas) roundRect(x, y, w, h, rad float64, fill uint32, fa float64, stroke uint32, sa, lw float64) {
	cx, cy := x+w/2, y+h/2
	rad = math.Min(rad, math.Min(w, h)/2)
	hx, hy := w/2-rad, h/2-rad
	for py := int(y - lw - 1); py <= int(y+h+lw+1); py++ {
		for px := int(x - lw - 1); px <= int(x+w+lw+1); px++ {
			qx, qy := math.Abs(float64(px)+0.5-cx)-hx, math.Abs(float64(py)+0.5-cy)-hy
			d := math.Hypot(math.Max(qx, 0), math.Max(qy, 0)) + math.Min(math.Max(qx, qy), 0) - rad
			if fa > 0 {
				c.blend(px, py, fill, fa*clamp01(0.5-d))
			}
			if sa > 0 && lw > 0 {
				c.blend(px, py, stroke, sa*clamp01(math.Min(0.5-d, 0.5+d+lw)))
			}
		}
	}
}

func (c *ovCanvas) rect(x, y, w, h float64, col uint32, a float64) {
	for py := int(math.Floor(y)); py < int(math.Ceil(y+h)); py++ {
		for px := int(math.Floor(x)); px < int(math.Ceil(x+w)); px++ {
			c.blend(px, py, col, a)
		}
	}
}

// ---------- text: the app's own fonts, embedded (IBM Plex Sans, JetBrains Mono, Barlow Condensed; OFL) ----------

//go:embed ovfonts/IBMPlexSans-Medium.ttf
var fontBody []byte

//go:embed ovfonts/IBMPlexSans-SemiBold.ttf
var fontBodyB []byte

//go:embed ovfonts/JetBrainsMono-SemiBold.ttf
var fontData []byte

//go:embed ovfonts/JetBrainsMono-Bold.ttf
var fontDataB []byte

//go:embed ovfonts/BarlowCondensed-SemiBold.ttf
var fontDisplay []byte

//go:embed ovfonts/BarlowCondensed-Bold.ttf
var fontDisplayB []byte

// the app's type: body (names), data (numbers and labels, like --f-data), display (titles, like --f-display)
const (
	fkBody = iota
	fkBodyB
	fkData
	fkDataB
	fkDisplay
	fkDisplayB
)

var (
	ovFontsOnce sync.Once
	ovFonts     [6]*opentype.Font
	ovFaces     = map[string]font.Face{}
	ovFacesMu   sync.Mutex
)

func ovFace(kind int, px float64) font.Face {
	ovFontsOnce.Do(func() {
		for k, b := range [][]byte{fontBody, fontBodyB, fontData, fontDataB, fontDisplay, fontDisplayB} {
			ovFonts[k], _ = opentype.Parse(b)
		}
	})
	px = math.Max(6, math.Round(px*4)/4)
	key := fmt.Sprint(kind, px)
	ovFacesMu.Lock()
	defer ovFacesMu.Unlock()
	if f, ok := ovFaces[key]; ok {
		return f
	}
	if kind < 0 || kind >= len(ovFonts) || ovFonts[kind] == nil {
		return nil
	}
	// no hinting: the shapes stay as the browser draws them (smooth, the same weight at every size)
	f, err := opentype.NewFace(ovFonts[kind], &opentype.FaceOptions{Size: px, DPI: 72, Hinting: font.HintingNone})
	if err != nil {
		return nil
	}
	ovFaces[key] = f
	return f
}

func textW(f font.Face, s string) float64 { return textWT(f, s, 0) }

// textWT: the width of s with extra spacing between letters (CSS letter-spacing)
func textWT(f font.Face, s string, track float64) float64 {
	if f == nil || s == "" {
		return 0
	}
	n := len([]rune(s))
	return float64(font.MeasureString(f, s))/64 + track*float64(n-1)
}

// text draws s with its left edge at x and its vertical middle at cy; align: 0 left, 1 right (x is the right edge), 2 centre
func (c *ovCanvas) text(f font.Face, s string, x, cy float64, col uint32, a float64, align int) {
	c.textT(f, s, x, cy, col, a, align, 0)
}

// textT is text with letter spacing (the uppercase labels)
func (c *ovCanvas) textT(f font.Face, s string, x, cy float64, col uint32, a float64, align int, track float64) {
	if f == nil || s == "" {
		return
	}
	w := textWT(f, s, track)
	switch align {
	case 1:
		x -= w
	case 2:
		x -= w / 2
	}
	m := f.Metrics()
	asc, desc := float64(m.Ascent)/64, float64(m.Descent)/64
	// the middle of the capitals sits on cy (like the browser's vertical centring of a line)
	capH := float64(m.CapHeight) / 64
	if capH <= 0 {
		capH = asc * 0.7
	}
	base := cy + capH/2
	mask := image.NewAlpha(image.Rect(0, 0, int(w)+6, int(asc+desc)+6))
	// the fraction of a pixel is kept, so the letters land where they should (smooth at any size)
	fx, fy := x-math.Floor(x), base-math.Floor(base)
	d := font.Drawer{Dst: mask, Src: image.Opaque, Face: f, Dot: fixed.Point26_6{X: fixed.Int26_6((2 + fx) * 64), Y: fixed.Int26_6((math.Ceil(asc) + 2 + fy) * 64)}}
	if track == 0 {
		d.DrawString(s)
	} else {
		for _, r := range s {
			d.DrawString(string(r))
			d.Dot.X += fixed.Int26_6(track * 64)
		}
	}
	ox, oy := int(math.Floor(x))-2, int(math.Floor(base))-int(math.Ceil(asc))-2
	b := mask.Bounds()
	for yy := 0; yy < b.Dy(); yy++ {
		for xx := 0; xx < b.Dx(); xx++ {
			if v := mask.Pix[yy*mask.Stride+xx]; v > 0 {
				// a touch more coverage, as Windows draws light text on dark
				c.blend(ox+xx, oy+yy, col, a*math.Pow(float64(v)/255, 0.85))
			}
		}
	}
}

// ellipsis shortens s to fit w pixels
func ellipsis(f font.Face, s string, w float64) string {
	if textW(f, s) <= w {
		return s
	}
	r := []rune(s)
	for len(r) > 1 {
		r = r[:len(r)-1]
		if t := string(r) + "…"; textW(f, t) <= w {
			return t
		}
	}
	return ""
}

// ---------- colours ----------

const (
	colPanel  = 0x19202a // the app's --surface
	colLine   = 0x2b3542 // --line
	colText   = 0xe7ebf1 // --fg
	colMuted  = 0x8a97a9 // --muted
	colGood   = 0x38c97c
	colBad    = 0xff6363
	colAmber  = 0xffb02e // --accent
	colAhead  = 0xff6363 // a lap ahead (--bad)
	colBehind = 0x5c9dff // a lap behind (--blue)
	colPB     = 0xb98cff // personal / session best
)

func licColor(s string) uint32 {
	if s = strings.TrimSpace(s); s == "" {
		return 0xc9d1dc
	}
	switch s[0] {
	case 'R':
		return 0xff6363
	case 'D':
		return 0xff8f45
	case 'C':
		return 0xf2c94c
	case 'B':
		return 0x38c97c
	case 'A':
		return 0x5c9dff
	}
	return 0xc9d1dc
}

// ---------- the data from the PC ----------

type ovDriver struct {
	Idx                    int
	Name, Num, Lic, CarSht string
	UID                    string // the iRacing id: stays in this process, only its key is looked up in your notes
	IR, Class, Inc, CarID  int
	ClassCol               uint32 // the class's colour the game gives (CarClassColor)
	Skip                   bool   // pace car, spectators
}

type ovSession struct {
	TrackLen float64
	IncLimit int
	Drivers  map[int]*ovDriver
	Sessions map[int]ovSess
	Grid     map[int][2]int     // car → qualifying place, class place (1 = first)
	Car      map[string]float64 // your car: DriverCarSLShiftRPM, DriverCarRedLine, DriverCarFuelMaxLtr…
	Track    string
	TrackID  int
	MyIdx    int
}

type ovSess struct {
	Type, Name string
	Results    map[int][2]int // car → place, class place (1 = first)
}

type ovState struct {
	mu      sync.Mutex
	frame   map[string]json.RawMessage
	at      time.Time
	ses     *ovSession
	edit    bool
	alpha   int
	ui      map[string]any
	pits    map[int]int  // pit stops per car this session
	onPit   map[int]bool // was on pit road at the last frame
	sesNum  int
	lang    string
	units   string             // "metric" or "imperial", as the app
	clearAt time.Time          // radar: since when nobody has been near
	hz      int                // the stream's samples a second (30, the radar 60)
	radLat  map[int]float64    // radar: each car's place across (−1 left … 1 right), eased from frame to frame
	radSide map[int]float64    // radar: the side each car was last seen on
	radDm   map[int][2]float64 // radar: each car's distance ahead (m) and how fast it changes (m/s), filtered
	radAt   time.Time          // radar: when that was
	radSeen time.Time          // radar: the game's sample the filter last took (a draw without a new one only predicts)
	x5      ovMem5             // what the weather, controls, track bar and performance overlays remember (ovnative5.go)
	unitOf  map[string]string
	live    ovLive        // what the gauges remember between frames (ovnative2.go)
	sm      *ovSessionMem // what the session overlays remember (ovnative3.go)
	varsKey string        // the variables the stream was asked for (a change reconnects)
	varsFn  func() []string
	client  *http.Client // the PC's API, with this window's cookie (the native overlays that fetch: map, brakes)
	base    string
	ext     ovExtra // the map, the recorded laps, the model's reference, the radio's buttons (ovnative4.go)
}

// unitsFromURL: the app's units ("imperial", else metric), given to the overlay window in its address
func unitsFromURL(raw string) string {
	if u, err := url.Parse(raw); err == nil {
		return u.Query().Get("units")
	}
	return ""
}

// langFromURL: the app's language, given to the overlay window in its address
func langFromURL(raw string) string {
	if u, err := url.Parse(raw); err == nil {
		return u.Query().Get("lang")
	}
	return ""
}

func newOvState(lang string) *ovState {
	return &ovState{frame: map[string]json.RawMessage{}, alpha: 255, ui: map[string]any{}, pits: map[int]int{}, onPit: map[int]bool{}, sesNum: -1, lang: lang, unitOf: map[string]string{}}
}

// T picks the language of the app (Spanish, or English for the rest)
func (s *ovState) T(en, es string) string {
	if s.lang == "es" || s.lang == "both" {
		return es
	}
	return en
}

func (s *ovState) num(name string) (float64, bool) {
	raw, ok := s.frame[name]
	if !ok {
		return 0, false
	}
	var v any
	if json.Unmarshal(raw, &v) != nil {
		return 0, false
	}
	switch t := v.(type) {
	case float64:
		return t, true
	case bool:
		if t {
			return 1, true
		}
		return 0, true
	}
	return 0, false
}

func (s *ovState) arr(name string) []float64 {
	raw, ok := s.frame[name]
	if !ok {
		return nil
	}
	var v []any
	if json.Unmarshal(raw, &v) != nil {
		return nil
	}
	out := make([]float64, len(v))
	for i, x := range v {
		switch t := x.(type) {
		case float64:
			out[i] = t
		case bool:
			if t {
				out[i] = 1
			}
		}
	}
	return out
}

func (s *ovState) uiMap(k string) map[string]any {
	if m, ok := s.ui[k].(map[string]any); ok {
		return m
	}
	return map[string]any{}
}

func uiNum(m map[string]any, k string, def float64) float64 {
	if v, ok := m[k].(float64); ok {
		return v
	}
	return def
}

func uiBool(m map[string]any, k string, def bool) bool {
	if v, ok := m[k].(bool); ok {
		return v
	}
	return def
}

func uiList(m map[string]any, k string, def []string) []string {
	v, ok := m[k].([]any)
	if !ok {
		return def
	}
	out := []string{}
	for _, x := range v {
		if s, ok := x.(string); ok {
			out = append(out, s)
		}
	}
	return out
}

// parseOvSession reads what the overlays need from iRacing's session YAML
func parseOvSession(y string) *ovSession {
	s := &ovSession{Drivers: map[int]*ovDriver{}, Sessions: map[int]ovSess{}, Grid: map[int][2]int{}, Car: map[string]float64{}}
	s.Track = yamlField(y, "TrackDisplayName")
	s.TrackID = atoi(yamlField(y, "TrackID"))
	s.MyIdx = atoi(yamlField(y, "DriverCarIdx"))
	s.TrackLen = trackLength(y)
	s.IncLimit = atoi(strings.TrimPrefix(yamlField(y, "IncidentLimit"), "unlimited"))
	section := ""
	var drv *ovDriver
	sesNum := -1
	inResults := false
	place := [3]int{-1, -1, -1} // position, class position, car of the result being read
	flush := func(qual bool) {
		if place[2] < 0 || place[0] < 0 {
			return
		}
		if qual {
			s.Grid[place[2]] = [2]int{place[0] + 1, place[1] + 1}
		} else if ss, ok := s.Sessions[sesNum]; ok && place[0] > 0 {
			ss.Results[place[2]] = [2]int{place[0], place[1] + 1}
		}
		place = [3]int{-1, -1, -1}
	}
	for _, line := range strings.Split(y, "\n") {
		if line == "" {
			continue
		}
		if line[0] != ' ' && line[0] != '-' { // a top-level section
			flush(section == "QualifyResultsInfo")
			section = strings.TrimSuffix(strings.TrimSpace(line), ":")
			continue
		}
		t := strings.TrimSpace(line)
		item := strings.HasPrefix(t, "- ")
		t = strings.TrimPrefix(t, "- ")
		k, v, ok := strings.Cut(t, ":")
		if !ok {
			continue
		}
		v = strings.Trim(strings.TrimSpace(v), `"`)
		switch section {
		case "DriverInfo":
			if item && k == "CarIdx" {
				drv = &ovDriver{Idx: atoi(v)}
				s.Drivers[drv.Idx] = drv
				continue
			}
			if drv == nil {
				if strings.HasPrefix(k, "DriverCar") {
					if f, err := strconv.ParseFloat(strings.Fields(v + " x")[0], 64); err == nil {
						s.Car[k] = f
					}
				}
				continue
			}
			switch k {
			case "UserName":
				drv.Name = v
			case "UserID":
				drv.UID = v
			case "CarNumber":
				drv.Num = v
			case "LicString":
				drv.Lic = v
			case "IRating":
				drv.IR = atoi(v)
			case "CarClassID":
				drv.Class = atoi(v)
			case "CarClassColor":
				if n, err := strconv.ParseUint(strings.TrimPrefix(strings.TrimSpace(v), "0x"), 16, 32); err == nil {
					drv.ClassCol = uint32(n)
				}
			case "CarID":
				drv.CarID = atoi(v)
			case "CarScreenNameShort":
				drv.CarSht = v
			case "CurDriverIncidentCount":
				drv.Inc = atoi(v)
			case "IsSpectator", "CarIsPaceCar":
				if v == "1" {
					drv.Skip = true
				}
			}
		case "SessionInfo":
			if item && k == "SessionNum" {
				flush(false)
				sesNum = atoi(v)
				s.Sessions[sesNum] = ovSess{Results: map[int][2]int{}}
				inResults = false
				continue
			}
			switch k {
			case "SessionType", "SessionName":
				if ss, ok := s.Sessions[sesNum]; ok && !inResults {
					if k == "SessionType" {
						ss.Type = v
					} else {
						ss.Name = v
					}
					s.Sessions[sesNum] = ss
				}
			case "ResultsPositions":
				inResults = true
			case "ResultsFastestLap":
				flush(false)
				inResults = false
			case "Position":
				if inResults {
					if item {
						flush(false)
					}
					place[0] = atoi(v)
				}
			case "ClassPosition":
				if inResults {
					place[1] = atoi(v)
				}
			case "CarIdx":
				if inResults {
					place[2] = atoi(v)
				}
			}
		case "QualifyResultsInfo":
			switch k {
			case "Position":
				if item {
					flush(true)
				}
				place[0] = atoi(v)
			case "ClassPosition":
				place[1] = atoi(v)
			case "CarIdx":
				place[2] = atoi(v)
			}
		}
	}
	flush(section == "QualifyResultsInfo")
	return s
}

// ovFeed reads the PC's live stream into st, reconnecting when it drops
func ovFeed(rawURL string, vars func() []string, st *ovState) {
	u, err := url.Parse(rawURL)
	if err != nil {
		return
	}
	base, lt := u.Scheme+"://"+u.Host, u.Query().Get("lt")
	jar, _ := cookiejar.New(nil)
	client := &http.Client{Jar: jar}
	st.mu.Lock()
	st.client, st.base = client, base
	st.mu.Unlock()
	for {
		want := strings.Join(vars(), ",")
		st.mu.Lock()
		st.varsKey = want
		st.mu.Unlock()
		hz := "30"
		if st.hz > 0 {
			hz = strconv.Itoa(st.hz)
		}
		q := base + "/api/stream?vars=" + want + "&hz=" + hz
		if lt != "" { // the one-use ticket of this window; it leaves a cookie for the reconnections
			q += "&lt=" + url.QueryEscape(lt)
			lt = ""
		}
		resp, err := client.Get(q)
		if err == nil && resp.StatusCode == 200 {
			ovRead(resp, st)
		}
		if resp != nil {
			resp.Body.Close()
		}
		time.Sleep(250 * time.Millisecond) // back on the stream at once (the PC restarting it, new values asked)
	}
}

func ovRead(resp *http.Response, st *ovState) {
	sc := bufio.NewScanner(resp.Body)
	sc.Buffer(make([]byte, 64<<10), 16<<20)
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
			st.event(ev, data, &fields)
			ev, data = "", ""
			if st.wantsOther() { // the overlay now shows other values: ask again
				return
			}
		}
	}
}

func (st *ovState) event(ev, data string, fields *[]string) {
	switch ev {
	case "fields":
		json.Unmarshal([]byte(data), fields)
	case "t":
		var f struct{ V []json.RawMessage }
		if json.Unmarshal([]byte(data), &f) != nil {
			return
		}
		st.mu.Lock()
		defer st.mu.Unlock()
		for i, n := range *fields {
			if i < len(f.V) {
				st.frame[n] = f.V[i]
			}
		}
		st.at = time.Now()
		st.countPits()
		st.collect()
	case "session":
		var y string
		if json.Unmarshal([]byte(data), &y) != nil {
			return
		}
		ses := parseOvSession(y)
		st.mu.Lock()
		st.ses = ses
		st.mu.Unlock()
	case "schema":
		var vars []struct{ Name, Unit string }
		if json.Unmarshal([]byte(data), &vars) != nil {
			return
		}
		st.mu.Lock()
		for _, v := range vars {
			st.unitOf[v.Name] = v.Unit
		}
		st.mu.Unlock()
	case "config":
		var c struct {
			Config struct {
				Edit  bool
				Alpha int
				UI    map[string]any `json:"ui"`
			}
			Lang, Units string
		}
		if json.Unmarshal([]byte(data), &c) != nil {
			return
		}
		st.mu.Lock()
		st.edit, st.alpha = c.Config.Edit, c.Config.Alpha
		if c.Lang != "" {
			st.lang = c.Lang
		}
		if c.Units != "" {
			st.units = c.Units
		}
		if c.Config.UI != nil {
			st.ui = c.Config.UI
		}
		st.mu.Unlock()
	}
}

// wantsOther: the variables the overlay shows changed since the stream was asked (the telemetry overlay's list)
func (st *ovState) wantsOther() bool {
	if st.varsFn == nil {
		return false
	}
	want := strings.Join(st.varsFn(), ",")
	st.mu.Lock()
	defer st.mu.Unlock()
	return st.varsKey != "" && want != st.varsKey
}

// countPits counts each car's stops (a new session starts again from zero); st.mu is held
func (st *ovState) countPits() {
	if sn, ok := st.num("SessionNum"); ok && int(sn) != st.sesNum {
		st.sesNum = int(sn)
		st.pits, st.onPit = map[int]int{}, map[int]bool{}
	}
	for i, v := range st.arr("CarIdxOnPitRoad") {
		on := v != 0
		if on && !st.onPit[i] {
			st.pits[i]++
		}
		st.onPit[i] = on
	}
}

// ---------- shared maths ----------

func fmtLap(t float64) string {
	if !(t > 0) {
		return "–"
	}
	m := int(t) / 60
	return fmt.Sprintf("%d:%06.3f", m, t-float64(m*60))
}

func signed(v float64, dec int) string {
	s := strconv.FormatFloat(math.Abs(v), 'f', dec, 64)
	if v < 0 {
		return "−" + s
	}
	return "+" + s
}

// irEstimates: the estimated iRating change of every car (the community formula), by live place, else the
// session's last results, else the grid; a car with no known place gets none
func (st *ovState) irEstimates() map[int]int {
	out := map[int]int{}
	if st.ses == nil {
		return out
	}
	pos, cpos := st.arr("CarIdxPosition"), st.arr("CarIdxClassPosition")
	sn, _ := st.num("SessionNum")
	res := st.ses.Sessions[int(sn)].Results
	groups := map[int][]*ovDriver{}
	for _, d := range st.ses.Drivers {
		if !d.Skip && d.IR > 0 && d.Name != "" {
			groups[d.Class] = append(groups[d.Class], d)
		}
	}
	multi := len(groups) > 1
	for _, list := range groups {
		if len(list) < 2 {
			continue
		}
		type pl struct {
			d *ovDriver
			p int
		}
		var ranked []pl
		for _, d := range list {
			p := 0
			if multi && d.Idx < len(cpos) {
				p = int(cpos[d.Idx])
			} else if !multi && d.Idx < len(pos) {
				p = int(pos[d.Idx])
			}
			if p <= 0 {
				k := 0
				if multi {
					k = 1
				}
				if r, ok := res[d.Idx]; ok {
					p = r[k]
				} else if g, ok := st.ses.Grid[d.Idx]; ok {
					p = g[k]
				}
			}
			if p > 0 {
				ranked = append(ranked, pl{d, p})
			}
		}
		sort.Slice(ranked, func(a, b int) bool { return ranked[a].p < ranked[b].p })
		n := float64(len(list))
		br := 1600 / math.Ln2
		chance := func(a, b float64) float64 {
			ea, eb := math.Exp(-a/br), math.Exp(-b/br)
			return ((1 - ea) * eb) / ((1-eb)*ea + (1-ea)*eb)
		}
		for k, r := range ranked {
			p := float64(k + 1)
			exp := -0.5
			for _, o := range list {
				exp += chance(float64(r.d.IR), float64(o.IR))
			}
			out[r.d.Idx] = int(math.Round((n - p - exp - (n/2-p)/100) * 200 / n))
		}
	}
	return out
}

func (st *ovState) sof() int {
	if st.ses == nil {
		return 0
	}
	me, _ := st.num("PlayerCarIdx")
	myClass := -1
	if d := st.ses.Drivers[int(me)]; d != nil {
		myClass = d.Class
	}
	var irs []int
	for _, d := range st.ses.Drivers {
		if !d.Skip && d.IR > 0 && d.Name != "" && (myClass < 0 || d.Class == myClass) {
			irs = append(irs, d.IR)
		}
	}
	return strengthOfField(irs)
}

// item: one value of the header or the footer (label, value, colour)
func (st *ovState) item(k string) (string, string, uint32) {
	T := st.T
	me, _ := st.num("PlayerCarIdx")
	switch k {
	case "session":
		sn, _ := st.num("SessionNum")
		v := "–"
		if st.ses != nil {
			if ss, ok := st.ses.Sessions[int(sn)]; ok {
				v = strings.ToUpper(firstNonEmpty(ss.Name, ss.Type, "–"))
			}
		}
		return T("Session", "Sesión"), v, colText
	case "timeleft":
		t, ok := st.num("SessionTimeRemain")
		if !ok || !(t > 0 && t < 600000) {
			return T("Time left", "Tiempo restante"), "–", colText
		}
		h, m, s := int(t)/3600, int(t)%3600/60, int(t)%60
		if h > 0 {
			return T("Time left", "Tiempo restante"), fmt.Sprintf("%d:%02d:%02d", h, m, s), colText
		}
		return T("Time left", "Tiempo restante"), fmt.Sprintf("%d:%02d", m, s), colText
	case "lapsleft":
		if r, ok := st.num("SessionLapsRemainEx"); ok && r >= 0 && r < 32000 {
			return T("Laps left", "Vueltas restantes"), strconv.Itoa(int(r)), colText
		}
		return T("Laps left", "Vueltas restantes"), "–", colText
	case "lap":
		l, _ := st.num("Lap")
		return T("Lap", "Vuelta"), strconv.Itoa(int(l)), colText
	case "pos":
		p, _ := st.num("PlayerCarPosition")
		if p > 0 {
			n := 0
			if st.ses != nil {
				for _, d := range st.ses.Drivers {
					if !d.Skip && d.Name != "" {
						n++
					}
				}
			}
			return T("Position", "Posición"), fmt.Sprintf("P%d / %d", int(p), n), colText
		}
		return T("Position", "Posición"), "–", colText
	case "cpos":
		p, _ := st.num("PlayerCarClassPosition")
		if p > 0 {
			return T("Class pos.", "Pos. clase"), fmt.Sprintf("P%d", int(p)), colText
		}
		return T("Class pos.", "Pos. clase"), "–", colText
	case "sof":
		if v := st.sof(); v > 0 {
			return "SOF", strconv.Itoa(v), colText
		}
		return "SOF", "–", colText
	case "irc":
		if v, ok := st.irEstimates()[int(me)]; ok {
			col := uint32(colGood)
			if v < 0 {
				col = colBad
			}
			return T("iRating (est.)", "iRating (est.)"), signed(float64(v), 0), col
		}
		return T("iRating (est.)", "iRating (est.)"), "–", colText
	case "inc":
		v, ok := st.num("PlayerCarMyIncidentCount")
		if !ok {
			return T("Incidents", "Incidentes"), "–", colText
		}
		s, col := fmt.Sprintf("%dx", int(v)), uint32(colText)
		if st.ses != nil && st.ses.IncLimit > 0 {
			s += fmt.Sprintf(" / %d", st.ses.IncLimit)
			if int(v) >= st.ses.IncLimit-4 {
				col = colBad
			}
		}
		return T("Incidents", "Incidentes"), s, col
	case "fuel":
		f, ok1 := st.num("FuelLevel")
		u, ok2 := st.num("FuelUsePerLap")
		if ok1 && ok2 && u > 0.05 {
			return T("Fuel laps", "Vueltas de gasolina"), strconv.FormatFloat(f/u, 'f', 1, 64), colText
		}
		return T("Fuel laps", "Vueltas de gasolina"), "–", colText
	case "best":
		v, _ := st.num("LapBestLapTime")
		return T("Best lap", "Mejor vuelta"), fmtLap(v), colText
	case "last":
		v, _ := st.num("LapLastLapTime")
		return T("Last lap", "Última vuelta"), fmtLap(v), colText
	case "delta":
		if d, ok := st.delta(); ok {
			col := uint32(colBad)
			if d <= 0 {
				col = colGood
			}
			return "Delta", signed(d, 2), col
		}
		return "Delta", "–", colText
	case "cars":
		n := 0
		if st.ses != nil {
			for _, d := range st.ses.Drivers {
				if !d.Skip && d.Name != "" {
					n++
				}
			}
		}
		return T("Cars", "Coches"), strconv.Itoa(n), colText
	case "clock":
		return T("Time", "Hora"), time.Now().Format("15:04"), colText
	case "airtemp":
		if v, ok := st.num("AirTemp"); ok {
			return T("Air", "Aire"), fmt.Sprintf("%.0f°C", v), colText
		}
	case "tracktemp":
		if v, ok := st.num("TrackTempCrew"); ok {
			return T("Track", "Pista"), fmt.Sprintf("%.0f°C", v), colText
		}
	}
	return "", "", 0
}

// delta: your gap to the reference chosen for the delta bar (iRacing's own deltas)
func (st *ovState) delta() (float64, bool) {
	src := map[string]string{"best": "LapDeltaToBestLap", "session": "LapDeltaToSessionBestLap", "optimal": "LapDeltaToOptimalLap", "sessopt": "LapDeltaToSessionOptimalLap"}
	k, _ := st.uiMap("delta")["src"].(string)
	v := src[k]
	if v == "" {
		v = "LapDeltaToBestLap"
	}
	ok, _ := st.num(v + "_OK")
	d, has := st.num(v)
	return d, has && ok != 0
}

// ---------- the overlays ----------

// ovDraw draws one overlay at the window's width and returns the height it needs (0: keep the window's)
func ovDraw(name string, c *ovCanvas, st *ovState, now time.Time) int {
	c.clear()
	st.mu.Lock()
	defer st.mu.Unlock()
	z := math.Max(0.5, math.Min(2.5, float64(c.w)/ovDesign[name]))
	fresh := now.Sub(st.at) < 2*time.Second
	if !fresh { // no data from the game: the overlay waits, empty, without old values
		st.frame = map[string]json.RawMessage{}
	}
	var h int
	switch name {
	case "radar":
		drawRadarOv(c, st, now)
	case "deltabar":
		h = drawDeltaOv(c, st, z)
	case "relative":
		h = drawTableOv(c, st, z, true)
	case "standings":
		h = drawTableOv(c, st, z, false)
	default:
		if sessionOverlay(name) {
			h = drawSessionOv(name, c, st, z)
		} else if lapOverlay(name) {
			h = drawLapOv(name, c, st, z, now)
		} else if extraOverlay(name) {
			h = drawExtraOv(name, c, st, z, now)
		} else {
			h = drawGauge(name, c, st, z, now)
		}
	}
	if st.edit { // while you move the overlays: a rounded amber frame and the resize corner
		fh := float64(c.h)
		if h > 0 && h < c.h {
			fh = float64(h)
		}
		c.roundRect(1, 1, float64(c.w)-2, fh-2, 10*z, 0, 0, colAmber, 1, 2)
		for k := 0; k < 12; k++ {
			for j := 0; j <= k; j++ {
				c.blend(c.w-5-j, int(fh)-17+k, colAmber, 1)
			}
		}
	}
	return h
}

// mix: colour a with t of it over b (CSS color-mix)
func mix(a, b uint32, t float64) uint32 {
	ch := func(s uint) uint32 { return uint32(float64((a>>s)&0xff)*t + float64((b>>s)&0xff)*(1-t) + 0.5) }
	return ch(16)<<16 | ch(8)<<8 | ch(0)
}

// a panel: the app's card (--surface, a --line border, rounded corners)
func panel(c *ovCanvas, h float64, z float64) {
	c.roundRect(0.5, 0.5, float64(c.w)-1, h-1, 10*z, colPanel, 0.94, colLine, 1, 1)
}

// strip draws a row of header/footer items like the app's .hstrip (a small uppercase label, then the value); returns its height
func strip(c *ovCanvas, st *ovState, keys []string, x, y, maxW, z float64) float64 {
	if len(keys) == 0 {
		return 0
	}
	lf, vf := ovFace(fkData, 10*z), ovFace(fkData, 14*z)
	tr := 0.8 * z
	h := 22 * z
	for _, k := range keys {
		l, v, col := st.item(k)
		if l == "" {
			continue
		}
		l = strings.ToUpper(l)
		lw := textWT(lf, l, tr)
		w := lw + 6*z + textW(vf, v)
		if x+w > maxW {
			break
		}
		c.textT(lf, l, x, y+h/2, colMuted, 1, 0, tr)
		c.text(vf, v, x+lw+6*z, y+h/2, col, 1, 0)
		x += w + 16*z
	}
	return h
}

func drawDeltaOv(c *ovCanvas, st *ovState, z float64) int {
	H := 54 * z
	panel(c, H, z)
	pad := 10 * z
	tx, ty, tw, th := pad, (H-34*z)/2, float64(c.w)-2*pad, 34*z
	c.roundRect(tx, ty, tw, th, th/2, 0x1e2631, 1, colLine, 1, 1)
	d, ok := st.delta()
	rng := uiNum(st.uiMap("delta"), "range", 1)
	if rng <= 0 {
		rng = 1
	}
	if ok {
		f := math.Min(math.Abs(d), rng) / rng * (tw/2 - th/2)
		col := uint32(colBad)
		x0 := tx + tw/2
		if d < 0 {
			col, x0 = colGood, tx+tw/2-f
		}
		c.roundRect(x0, ty+4*z, f, th-8*z, (th-8*z)/2, col, 0.85, 0, 0, 0)
	}
	vf := ovFace(fkDataB, 17*z)
	s, col := "–", uint32(colText)
	if ok {
		s = signed(d, 2)
		col = colBad
		if d < 0 {
			col = colGood
		}
	}
	pw := textW(vf, s) + 24*z
	c.roundRect(tx+tw/2-pw/2, ty+th/2-13*z, pw, 26*z, 13*z, 0x090c11, 0.92, colLine, 1, 1)
	c.text(vf, s, tx+tw/2, ty+th/2, col, 1, 2)
	return int(math.Ceil(H))
}

type ovRow struct {
	idx        int
	blank, sep bool
	gap, iv    string // the gap (to you, or to the leader) and the interval to the car ahead
	nameCol    uint32
	laps       int // in a race, the relative: laps this car is ahead of you (+) or behind you (−)
}

// drawTableOv: the relative (cars around you) or the standings (race order), like the app's widget table
func drawTableOv(c *ovCanvas, st *ovState, z float64, rel bool) int {
	key := "std"
	defCols, defHead, defFoot := []string{"pos", "num", "name", "lic", "ir", "irc", "laps", "last", "best", "gap", "int", "pit", "pgain"}, []string{"session", "lapsleft", "sof"}, []string{"pos", "irc", "inc"}
	if rel {
		key = "rel"
		defCols, defHead, defFoot = []string{"pos", "num", "name", "lic", "ir", "irc", "last", "gap"}, []string{"session", "timeleft", "sof"}, []string{"irc", "inc", "fuel"}
	}
	cfg := st.uiMap(key)
	cols, head, foot := uiList(cfg, "cols", defCols), uiList(cfg, "head", defHead), uiList(cfg, "foot", defFoot)
	me := -1
	if v, ok := st.num("PlayerCarIdx"); ok {
		me = int(v)
	}
	rows := st.tableRows(rel, cfg, me)
	pad, gapX := 12*z, 12*z
	rowH, headH := 27*z, 22*z
	W := float64(c.w)
	H := pad
	if len(head) > 0 {
		H += 22*z + 4*z
	}
	H += headH + float64(len(rows))*rowH
	if len(rows) == 0 {
		H += 32 * z
	}
	if len(foot) > 0 {
		H += 6*z + 22*z
	}
	H += pad - 2*z
	need := H
	if int(H) > c.h { // the window grows to it on the next frame; draw what fits now
		H = float64(c.h)
	}
	panel(c, H, z)
	y := pad - 2*z
	if len(head) > 0 {
		y += strip(c, st, head, pad, y, W-pad, z) + 4*z
	}
	irc := st.irEstimates()
	tf, nf, mf := ovFace(fkData, 10.5*z), ovFace(fkBody, 14*z), ovFace(fkData, 13*z)
	lf, pf := ovFace(fkDataB, 10.5*z), ovFace(fkData, 9.5*z)
	ttr := 0.6 * z
	pitW := textWT(pf, "PIT", 0.5*z) + 12*z
	tagW := tagSize * z
	licW := func(v string) float64 { return math.Max(textW(lf, v)+10*z, 19*z) }
	// each column's width: the widest of its title and its values
	type colInfo struct {
		key, title string
		right      bool
		w          float64
	}
	var info []colInfo
	fixedW, nameIdx := 0.0, -1
	for _, k := range cols {
		t, right := st.colTitle(k)
		if t == "" && k != "name" {
			continue
		}
		ci := colInfo{key: k, title: strings.ToUpper(t), right: right, w: textWT(tf, strings.ToUpper(t), ttr)}
		for _, r := range rows {
			if r.blank || r.sep {
				continue
			}
			v, _, mono := st.cell(k, r, irc)
			f := nf
			if mono {
				f = mf
			}
			w := textW(f, v)
			if k == "lic" && v != "–" {
				w = licW(v)
			}
			ci.w = math.Max(ci.w, w)
		}
		if k == "name" {
			nameIdx = len(info)
		} else {
			fixedW += ci.w + gapX
		}
		info = append(info, ci)
	}
	if nameIdx >= 0 {
		info[nameIdx].w = math.Max(60*z, W-2*pad-fixedW)
	}
	// titles
	x := pad
	for _, ci := range info {
		if ci.right {
			c.textT(tf, ci.title, x+ci.w, y+headH/2, colMuted, 1, 1, ttr)
		} else {
			c.textT(tf, ci.title, x, y+headH/2, colMuted, 1, 0, ttr)
		}
		x += ci.w + gapX
	}
	y += headH
	c.rect(pad-4*z, y-1, W-2*pad+8*z, 1, colLine, 1)
	if len(rows) == 0 {
		c.text(nf, st.T("Waiting for cars on track", "Esperando coches en pista"), W/2, y+16*z, colMuted, 1, 2)
		y += 32 * z
	}
	pit := st.arr("CarIdxOnPitRoad")
	for k, r := range rows {
		if y+rowH > float64(c.h) {
			break
		}
		rx, rw := pad-4*z, W-2*pad+8*z
		if k%2 == 1 {
			c.rect(rx, y, rw, rowH, colText, 0.04)
		}
		if r.sep {
			c.text(mf, "⋯", W/2, y+rowH/2, colMuted, 1, 2)
			y += rowH
			continue
		}
		if r.blank {
			y += rowH
			continue
		}
		mine := r.idx == me
		onPit := r.idx < len(pit) && pit[r.idx] != 0
		a := 1.0
		if onPit && !mine {
			a = 0.55
		}
		if mine {
			c.roundRect(rx, y+1, rw, rowH-2, 5*z, colAmber, 0.22, 0, 0, 0)
			c.roundRect(rx, y+3*z, 3*z, rowH-6*z, 1.5*z, colAmber, 1, 0, 0, 0)
		}
		x := pad
		for _, ci := range info {
			v, col, mono := st.cell(ci.key, r, irc)
			f := nf
			if mono {
				f = mf
			}
			cy := y + rowH/2
			switch {
			case ci.key == "lic" && v != "–":
				// the app's licence badge: the class colour darkened, its border in the colour, white text
				lc := licColor(v)
				bw, bh := licW(v), 19*z
				c.roundRect(x, cy-bh/2, bw, bh, 4*z, mix(lc, 0x0b0d10, 0.62), a, lc, a, 1.5*z)
				c.text(lf, v, x+bw/2, cy, 0xffffff, a, 2)
			case ci.key == "name":
				room, nx := ci.w, x
				if onPit {
					room -= pitW + 6*z
				}
				if tag := st.rowTag(r.idx); tag != "" && !mine {
					drawDriverTag(c, tag, x+7*z, cy, z, a)
					nx += tagW + 4*z
					room -= tagW + 4*z
				}
				lapTxt := ""
				if r.laps != 0 && !mine {
					lapTxt = fmt.Sprintf("%+dL", r.laps)
					if r.laps < 0 {
						lapTxt = "−" + lapTxt[1:]
					}
					room -= textWT(pf, lapTxt, 0.5*z) + 18*z
				}
				n := ellipsis(f, v, room)
				c.text(f, n, nx, cy, col, a, 0)
				if lapTxt != "" { // laps up (red: they lap you) or down (blue: you lap them), in a pill like the PIT one
					lc := uint32(colAhead)
					if r.laps < 0 {
						lc = colBehind
					}
					lw := textWT(pf, lapTxt, 0.5*z) + 12*z
					lx := nx + textW(f, n) + 6*z
					c.roundRect(lx, cy-8*z, lw, 16*z, 8*z, mix(lc, 0x0b0d10, 0.75), a, lc, a, 1)
					c.textT(pf, lapTxt, lx+lw/2, cy, lc, a, 2, 0.5*z)
					nx = lx + lw - textW(f, n)
				}
				if onPit { // the app's pill
					px := nx + textW(f, n) + 6*z
					c.roundRect(px, cy-8*z, pitW, 16*z, 8*z, colPanel, 0, colLine, 1, 1)
					c.textT(pf, "PIT", px+pitW/2, cy, colMuted, a, 2, 0.5*z)
				}
			case ci.right:
				c.text(f, v, x+ci.w, cy, col, a, 1)
			default:
				c.text(f, v, x, cy, col, a, 0)
			}
			x += ci.w + gapX
		}
		y += rowH
	}
	if len(foot) > 0 {
		c.rect(pad-4*z, y+2*z, W-2*pad+8*z, 1, colLine, 1)
		y += 6 * z
		strip(c, st, foot, pad, y, W-pad, z)
	}
	return int(math.Ceil(need))
}

func (st *ovState) colTitle(k string) (string, bool) {
	T := st.T
	switch k {
	case "pos":
		return "P", false
	case "cpos":
		return T("PC", "PC"), false
	case "num":
		return "#", false
	case "name":
		return T("Driver", "Piloto"), false
	case "car":
		return T("Car", "Coche"), false
	case "lic":
		return T("Lic.", "Lic."), false
	case "ir":
		return "iR", true
	case "irc":
		return "±iR", true
	case "laps":
		return T("Laps", "Vtas"), true
	case "last":
		return T("Last", "Última"), true
	case "best":
		return T("Best", "Mejor"), true
	case "gap":
		return "Gap", true
	case "int":
		return "Int", true
	case "pit":
		return "Pit", true
	case "pgain":
		return "+/−", true
	case "tyre":
		return T("Tyre", "Neum."), false
	case "inc":
		return "Inc", true
	}
	return "", false
}

// cell: the text of a column for a row, its colour, and whether it is a number (drawn in the mono font)
func (st *ovState) cell(k string, r ovRow, irc map[int]int) (string, uint32, bool) {
	i := r.idx
	at := func(n string) float64 {
		a := st.arr(n)
		if i < len(a) {
			return a[i]
		}
		return -1
	}
	var d *ovDriver
	if st.ses != nil {
		d = st.ses.Drivers[i]
	}
	if d == nil {
		d = &ovDriver{}
	}
	switch k {
	case "pos":
		if p := at("CarIdxPosition"); p > 0 {
			return fmt.Sprintf("P%d", int(p)), colText, true
		}
		return "–", colMuted, true
	case "cpos":
		if p := at("CarIdxClassPosition"); p > 0 {
			return strconv.Itoa(int(p)), colText, true
		}
		return "–", colMuted, true
	case "num":
		return firstNonEmpty(d.Num, "–"), colText, true
	case "name":
		return firstNonEmpty(d.Name, "–"), r.nameCol, false
	case "car":
		return d.CarSht, colMuted, false
	case "lic":
		return firstNonEmpty(d.Lic, "–"), colText, true
	case "ir":
		if d.IR >= 1000 {
			return fmt.Sprintf("%.1fk", float64(d.IR)/1000), colText, true
		}
		if d.IR > 0 {
			return strconv.Itoa(d.IR), colText, true
		}
		return "–", colMuted, true
	case "irc":
		if v, ok := irc[i]; ok {
			if v >= 0 {
				return signed(float64(v), 0), colGood, true
			}
			return signed(float64(v), 0), colBad, true
		}
		return "–", colMuted, true
	case "laps":
		if l := at("CarIdxLapCompleted"); l >= 0 {
			return strconv.Itoa(int(l)), colText, true
		}
		return "–", colMuted, true
	case "last":
		l, b := at("CarIdxLastLapTime"), at("CarIdxBestLapTime")
		if l > 0 && l == b {
			return fmtLap(l), colPB, true
		}
		return fmtLap(l), colText, true
	case "best":
		b := at("CarIdxBestLapTime")
		col := uint32(colText)
		if b > 0 {
			fast := math.MaxFloat64
			for _, v := range st.arr("CarIdxBestLapTime") {
				if v > 0 && v < fast {
					fast = v
				}
			}
			if b == fast {
				col = colPB
			}
		}
		return fmtLap(b), col, true
	case "gap":
		if r.gap == "" {
			return "–", colMuted, true
		}
		return r.gap, colText, true
	case "int":
		if r.iv == "" {
			return "–", colMuted, true
		}
		return r.iv, colText, true
	case "pit":
		if n := st.pits[i]; n > 0 {
			return strconv.Itoa(n), colText, true
		}
		return "–", colMuted, true
	case "pgain":
		if st.ses != nil {
			if g, ok := st.ses.Grid[i]; ok {
				if p := at("CarIdxPosition"); p > 0 {
					n := g[0] - int(p)
					switch {
					case n > 0:
						return fmt.Sprintf("▲%d", n), colGood, true
					case n < 0:
						return fmt.Sprintf("▼%d", -n), colBad, true
					}
					return "=", colMuted, true
				}
			}
		}
		return "–", colMuted, true
	case "tyre":
		if t := at("CarIdxTireCompound"); t >= 0 {
			return fmt.Sprintf("#%d", int(t)), colText, true
		}
		return "–", colMuted, true
	case "inc":
		return fmt.Sprintf("%dx", d.Inc), colText, true
	}
	return "", colText, false
}

// tableRows: the relative's cars (you in the middle, the rows you chose ahead and behind, empty ones kept) or the
// standings (the leaders and the cars around you, a ⋯ between)
func (st *ovState) tableRows(rel bool, cfg map[string]any, me int) []ovRow {
	pct, est, laps := st.arr("CarIdxLapDistPct"), st.arr("CarIdxEstTime"), st.arr("CarIdxLap")
	if st.ses == nil || me < 0 || me >= len(pct) || pct[me] < 0 {
		return nil
	}
	drivers := []*ovDriver{}
	for _, d := range st.ses.Drivers {
		if !d.Skip && d.Name != "" {
			drivers = append(drivers, d)
		}
	}
	at := func(a []float64, i int) float64 {
		if i < len(a) {
			return a[i]
		}
		return -1
	}
	if rel {
		L := 0.0
		if v, ok := st.num("DriverCarEstLapTime"); ok {
			L = v
		}
		if L <= 0 { // the lap time the estimates are based on: the longest estimate seen
			for _, v := range est {
				L = math.Max(L, v)
			}
		}
		if L <= 0 {
			L = 90
		}
		type car struct {
			i         int
			g, lapDif float64
		}
		var ahead, behind []car
		for _, d := range drivers {
			i := d.Idx
			if at(pct, i) < 0 || i == me {
				continue
			}
			g := at(est, i) - at(est, me)
			if g > L/2 {
				g -= L
			}
			if g < -L/2 {
				g += L
			}
			cr := car{i, g, (at(laps, i) + at(pct, i)) - (at(laps, me) + at(pct, me))}
			if g > 0 {
				ahead = append(ahead, cr)
			} else {
				behind = append(behind, cr)
			}
		}
		race := st.inRace()
		sort.Slice(ahead, func(a, b int) bool { return ahead[a].g < ahead[b].g })
		sort.Slice(behind, func(a, b int) bool { return behind[a].g > behind[b].g })
		na, nb := int(uiNum(cfg, "ahead", 3)), int(uiNum(cfg, "behind", 3))
		if len(ahead) > na {
			ahead = ahead[:na]
		}
		if len(behind) > nb {
			behind = behind[:nb]
		}
		row := func(cr car) ovRow {
			r := ovRow{idx: cr.i, gap: signed(-cr.g, 1), nameCol: colText}
			if cr.g > 0 {
				r.gap = "−" + strconv.FormatFloat(cr.g, 'f', 1, 64)
			} else {
				r.gap = "+" + strconv.FormatFloat(-cr.g, 'f', 1, 64)
			}
			if cr.lapDif > 0.5 {
				r.nameCol = colAhead
			} else if cr.lapDif < -0.5 {
				r.nameCol = colBehind
			}
			if race {
				r.laps = int(math.Round(cr.lapDif))
			}
			return r
		}
		var out []ovRow
		for k := 0; k < na-len(ahead); k++ {
			out = append(out, ovRow{blank: true})
		}
		for k := len(ahead) - 1; k >= 0; k-- {
			out = append(out, row(ahead[k]))
		}
		out = append(out, ovRow{idx: me, gap: "—", nameCol: colText})
		for _, cr := range behind {
			out = append(out, row(cr))
		}
		for k := 0; k < nb-len(behind); k++ {
			out = append(out, ovRow{blank: true})
		}
		return out
	}
	// standings
	pos, cpos, f2 := st.arr("CarIdxPosition"), st.arr("CarIdxClassPosition"), st.arr("CarIdxF2Time")
	classes := map[int]bool{}
	for _, d := range drivers {
		classes[d.Class] = true
	}
	multi := len(classes) > 1
	myClass := -1
	if d := st.ses.Drivers[me]; d != nil {
		myClass = d.Class
	}
	if multi && uiBool(cfg, "myClass", true) {
		k := 0
		for _, d := range drivers {
			if d.Class == myClass {
				drivers[k] = d
				k++
			}
		}
		drivers = drivers[:k]
	}
	place := func(i int) float64 {
		p := at(pos, i)
		if multi && uiBool(cfg, "myClass", true) {
			p = at(cpos, i)
		}
		if p <= 0 {
			return 999
		}
		return p
	}
	sort.Slice(drivers, func(a, b int) bool {
		pa, pb := place(drivers[a].Idx), place(drivers[b].Idx)
		if pa != pb {
			return pa < pb
		}
		return drivers[a].Idx < drivers[b].Idx
	})
	all := make([]ovRow, len(drivers))
	prev := -1
	race := st.inRace()
	lapsA, pctA := st.arr("CarIdxLap"), st.arr("CarIdxLapDistPct")
	prog := func(i int) (float64, bool) {
		if i < 0 || i >= len(lapsA) || i >= len(pctA) || pctA[i] < 0 {
			return 0, false
		}
		return lapsA[i] + pctA[i], true
	}
	for k, d := range drivers {
		r := ovRow{idx: d.Idx, nameCol: colText}
		// in a race, whole laps this car is ahead of you (+) or behind you (−), like the relative
		if pm, okM := prog(me); race && okM && d.Idx != me {
			if pc, okC := prog(d.Idx); okC {
				r.laps = int(pc - pm)
			}
		}
		if k == 0 {
			r.gap = st.T("Leader", "Líder")
		} else if v := at(f2, d.Idx); v > 0 {
			r.gap = "+" + strconv.FormatFloat(v, 'f', 1, 64)
			if p := at(f2, prev); prev >= 0 && p >= 0 {
				r.iv = "+" + strconv.FormatFloat(v-p, 'f', 1, 64)
			}
		}
		prev = d.Idx
		all[k] = r
	}
	top, around := int(uiNum(cfg, "top", 5)), int(uiNum(cfg, "around", 3))
	mi := -1
	for k, r := range all {
		if r.idx == me {
			mi = k
		}
	}
	var out []ovRow
	last := -1
	for k, r := range all {
		if k < top || (mi >= 0 && int(math.Abs(float64(k-mi))) <= around) {
			if last >= 0 && k > last+1 {
				out = append(out, ovRow{sep: true})
			}
			out = append(out, r)
			last = k
		}
	}
	return out
}

// ---------- the radar ----------

type radarCar struct {
	idx     int
	dm, lat float64
	v       float64 // how fast its distance ahead changes (m/s): closing on you when it brings the car to you
	surf    int     // the game's surface: 3 on the track, 0 off it (still a car next to you), 2 on the pit road
}

func drawRadarOv(c *ovCanvas, st *ovState, now time.Time) {
	cfg := st.uiMap("radar")
	rng, autohide := uiNum(cfg, "range", 20), uiBool(cfg, "autohide", true)
	if rng < 5 {
		rng = 20
	}
	if st.edit {
		c.rect(0, 0, float64(c.w), float64(c.h), 0x0b0e13, 0.32)
	}
	pct, surf := st.arr("CarIdxLapDistPct"), st.arr("CarIdxTrackSurface")
	mev, _ := st.num("PlayerCarIdx")
	lrv, _ := st.num("CarLeftRight")
	me, lr := int(mev), int(lrv)
	L := 0.0
	if st.ses != nil {
		L = st.ses.TrackLen
	}
	var near []radarCar
	if me >= 0 && me < len(pct) && pct[me] >= 0 && L > 0 {
		for i, p := range pct {
			// a car in its pit stall or out of the world is no car near you; one off the track beside you still is
			sf := 3
			if i < len(surf) {
				sf = int(surf[i])
			}
			if i == me || p < 0 || (st.ses.Drivers[i] != nil && st.ses.Drivers[i].Skip) || sf < 0 || sf == 1 {
				continue
			}
			d := p - pct[me]
			if d > .5 {
				d--
			} else if d < -.5 {
				d++
			}
			if dm := d * L; math.Abs(dm) < rng+6 {
				near = append(near, radarCar{idx: i, dm: dm, surf: sf})
			}
		}
	}
	// the distances come in steps (the game's samples, other cars' network updates): an alpha-beta filter keeps each
	// car moving at its own closing speed between them, so it glides instead of jumping or shaking. Every draw
	// predicts where the car is now; a new sample from the game corrects it, and the sample's age (the stream's
	// delay) is added so the car is drawn where it is at this moment, not where it was when the game said so
	if st.radDm == nil {
		st.radDm = map[int][2]float64{}
	}
	dt := now.Sub(st.radAt).Seconds()
	st.radAt = now
	sample := !st.at.Equal(st.radSeen)
	st.radSeen = st.at
	age := now.Sub(st.at).Seconds()
	if age < 0 || age > 0.12 {
		age = 0
	}
	seen := map[int]bool{}
	for k := range near {
		i, z := near[k].idx, near[k].dm
		seen[i] = true
		f, ok := st.radDm[i]
		if !ok || dt <= 0 || dt > 0.25 {
			st.radDm[i] = [2]float64{z, 0}
			continue
		}
		x, v := f[0]+f[1]*dt, f[1]
		if sample {
			r := z - x
			if math.Abs(r) > 15 { // a jump (a reset, a tow): start again from where it is
				st.radDm[i] = [2]float64{z, 0}
				continue
			}
			x, v = x+0.5*r, math.Max(-60, math.Min(60, v+0.12*r/dt))
		}
		st.radDm[i] = [2]float64{x, v}
		near[k].dm, near[k].v = x+v*age, v
	}
	for i := range st.radDm {
		if !seen[i] {
			delete(st.radDm, i)
		}
	}
	busy := lr >= 2
	for _, n := range near {
		if math.Abs(n.dm) < rng {
			busy = true
		}
	}
	if busy {
		st.clearAt = time.Time{}
	} else if st.clearAt.IsZero() {
		st.clearAt = now
	}
	if !st.edit && autohide && !busy && now.Sub(st.clearAt) > 1500*time.Millisecond {
		return // nobody near: nothing at all on the screen
	}
	// the cars beside you: CarLeftRight says how many and on which side; each car keeps the side it was on (the one
	// that was left stays left), the closest one otherwise, and slides there smoothly instead of jumping
	if st.radLat == nil {
		st.radLat, st.radSide = map[int]float64{}, map[int]float64{}
	}
	side := []int{}
	for k, n := range near {
		if math.Abs(n.dm) < 5.5 && n.surf != 2 { // a car on the pit road is not the one beside you on the track
			side = append(side, k)
		}
	}
	sort.Slice(side, func(a, b int) bool { return math.Abs(near[side[a]].dm) < math.Abs(near[side[b]].dm) })
	want := map[int]float64{}
	pick := func(s float64, taken map[int]bool) {
		best := -1
		for _, k := range side {
			if !taken[k] && st.radSide[near[k].idx] == s {
				best = k
				break
			}
		}
		if best < 0 {
			for _, k := range side {
				if !taken[k] {
					best = k
					break
				}
			}
		}
		if best >= 0 {
			taken[best] = true
			want[near[best].idx] = s
		}
	}
	taken := map[int]bool{}
	switch lr {
	case 2:
		pick(-1, taken)
	case 3:
		pick(1, taken)
	case 4:
		pick(-1, taken)
		pick(1, taken)
	case 5: // three wide, you on the right: one car beside you, the other one beyond it
		pick(-1, taken)
		pick(-2, taken)
	case 6:
		pick(1, taken)
		pick(2, taken)
	}
	for k := range near {
		i := near[k].idx
		t, d := want[i], math.Abs(near[k].dm)
		if t != 0 {
			st.radSide[i] = t
		} else if sd := st.radSide[i]; sd != 0 && d <= 4.6 {
			// still overlapping you while the game's flag lags: it stays on its side, never drawn over your car
			t = sd
		} else if sd != 0 {
			// a car that was beside you and has just passed you (or dropped back) moves back into line little by
			// little, as cars do, instead of jumping to the middle the moment it stops overlapping
			t = sd * math.Max(0, 1-(d-4.6)/7)
		}
		if d > 12 {
			delete(st.radSide, i)
		}
		cur := st.radLat[i]
		cur += (t - cur) * 0.35 // eased: about a tenth of a second to cross
		if math.Abs(cur) < 0.02 {
			cur = 0
		}
		st.radLat[i] = cur
		near[k].lat = cur
	}
	S := math.Min(float64(c.w), float64(c.h))
	cx, cy := float64(c.w)/2, float64(c.h)/2
	ppm := (S/2 - 8) / rng
	const CL, CW, LW = 4.6, 1.9, 2.7
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
		// closing speed: how fast the car comes to you (a faster class from behind, a car you are catching)
		closing := -n.v
		if n.dm < 0 {
			closing = n.v
		}
		col := uint32(0xc9d1da)
		switch {
		case math.Abs(n.lat) >= 0.5 || d < CL*1.2:
			col = 0xff4d4f
		case closing > 3 && d/closing < 1.2: // on you within a second: red before it is beside you
			col = 0xff4d4f
		case d < 10:
			col = colAmber
		}
		a := 1.0
		if math.Abs(n.lat) < 0.5 {
			a = math.Max(0.35, 1-d/(rng+3)*0.65)
		}
		if n.surf == 2 { // on the pit road: there, but not in your way
			col, a = colMuted, a*0.45
		}
		X, Y := cx+n.lat*LW*ppm, cy-n.dm*ppm
		if closing > 2 { // a trail behind a car coming at you, as long as it is fast
			tl := math.Min(2*H, closing*0.35*ppm)
			for q := 0.0; q < tl; q += 1 {
				yy := Y + H/2 + q // behind you: the trail goes further behind
				if n.dm > 0 {
					yy = Y - H/2 - q // ahead of you and dropping back: the trail goes further ahead
				}
				c.rect(X-W*0.25, yy, W*0.5, 1, col, 0.45*a*(1-q/tl))
			}
		}
		c.roundRect(X-W/2-1.5, Y-H/2, W+3, H+3, math.Min(W, H)*0.4, 0x000000, 0.35*a, 0, 0, 0)
		if n.surf == 0 { // off the track (grass, gravel): an outline, so you see it is not on the road
			c.roundRect(X-W/2, Y-H/2, W, H, math.Min(W, H)*0.35, col, 0.3*a, col, a, 1.6)
		} else {
			c.roundRect(X-W/2, Y-H/2, W, H, math.Min(W, H)*0.35, col, a, 0x000000, 0.55*a, 1.2)
		}
	}
	c.roundRect(cx-W/2, cy-H/2, W, H, math.Min(W, H)*0.35, 0xffffff, 0.12, 0xffffff, 0.9, 2)
	var best *radarCar
	for k := range near {
		n := &near[k]
		if math.Abs(n.lat) < 0.5 && math.Abs(n.dm) <= rng && (best == nil || math.Abs(n.dm) < math.Abs(best.dm)) {
			best = n
		}
	}
	if best != nil {
		col := uint32(colText)
		if math.Abs(best.dm) < 10 {
			col = colAmber
		}
		f := ovFace(fkDataB, math.Max(11, ppm*1.5))
		y := cy - best.dm*ppm
		if best.dm > 0 {
			y -= H/2 + 10
		} else {
			y += H/2 + 10
		}
		s := strconv.FormatFloat(math.Abs(best.dm), 'f', 1, 64) + " m"
		for _, o := range [][2]float64{{-1, 0}, {1, 0}, {0, -1}, {0, 1}, {-1, -1}, {1, 1}, {-1, 1}, {1, -1}} { // a dark edge, readable over the game
			c.text(f, s, cx+o[0]*1.5, y+o[1]*1.5, 0x000000, 0.6, 2)
		}
		c.text(f, s, cx, y, col, 1, 2)
	}
}

// ovVars: what each native overlay asks the PC for
func ovVars(name string, st *ovState) []string {
	base := []string{"PlayerCarIdx", "SessionNum"}
	if gaugeOverlay(name) {
		return append(base, gaugeVars(name, st)...)
	}
	if sessionOverlay(name) {
		return append(base, sessionVars(name)...)
	}
	if lapOverlay(name) {
		return append(base, lapOvVars(name)...)
	}
	if extraOverlay(name) {
		return append(base, extraVars(name)...)
	}
	switch name {
	case "radar":
		return append(base, "CarIdxLapDistPct", "CarIdxTrackSurface", "CarLeftRight")
	case "deltabar":
		return append(base, "LapDeltaToBestLap", "LapDeltaToBestLap_OK", "LapDeltaToSessionBestLap", "LapDeltaToSessionBestLap_OK", "LapDeltaToOptimalLap", "LapDeltaToOptimalLap_OK", "LapDeltaToSessionOptimalLap", "LapDeltaToSessionOptimalLap_OK")
	}
	return append(base, "CarIdxLapDistPct", "CarIdxEstTime", "CarIdxLap", "CarIdxLapCompleted", "CarIdxPosition", "CarIdxClassPosition", "CarIdxF2Time",
		"CarIdxLastLapTime", "CarIdxBestLapTime", "CarIdxOnPitRoad", "CarIdxTireCompound", "SessionTimeRemain", "SessionLapsRemainEx", "Lap",
		"PlayerCarPosition", "PlayerCarClassPosition", "PlayerCarMyIncidentCount", "FuelLevel", "FuelUsePerLap", "LapBestLapTime", "LapLastLapTime",
		"LapDeltaToBestLap", "LapDeltaToBestLap_OK", "AirTemp", "TrackTempCrew")
}
