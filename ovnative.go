package main

// Native overlays: the radar, the delta bar, the relative and the standings are drawn by Pitlane HQ itself
// (no WebView2), on a see-through window (ovnative_windows.go). This file is the platform-free part: the
// picture (shapes and text with the Go fonts), the data from the PC's live stream and what each overlay draws.
// They follow the same settings as the web widgets (columns, header, footer, rows, range…), fit their height to
// what they show, and scale with the window's width.

import (
	"bufio"
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
	"golang.org/x/image/font/gofont/gomedium"
	"golang.org/x/image/font/gofont/gomonobold"
	"golang.org/x/image/font/opentype"
	"golang.org/x/image/math/fixed"
)

// nativeOverlay: the overlays drawn natively
func nativeOverlay(name string) bool {
	switch name {
	case "radar", "deltabar", "relative", "standings":
		return true
	}
	return false
}

// the width each overlay is designed for: the window's width scales everything from it
var ovDesign = map[string]float64{"radar": 260, "deltabar": 520, "relative": 600, "standings": 720}

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

// ---------- text (the Go fonts, drawn smooth) ----------

var (
	ovFontsOnce    sync.Once
	ovSans, ovMono *opentype.Font
	ovFaces        = map[string]font.Face{}
	ovFacesMu      sync.Mutex
)

func ovFace(mono bool, px float64) font.Face {
	ovFontsOnce.Do(func() {
		ovSans, _ = opentype.Parse(gomedium.TTF)
		ovMono, _ = opentype.Parse(gomonobold.TTF)
	})
	px = math.Max(6, math.Round(px*2)/2)
	key := fmt.Sprint(mono, px)
	ovFacesMu.Lock()
	defer ovFacesMu.Unlock()
	if f, ok := ovFaces[key]; ok {
		return f
	}
	fo := ovSans
	if mono {
		fo = ovMono
	}
	f, err := opentype.NewFace(fo, &opentype.FaceOptions{Size: px, DPI: 72, Hinting: font.HintingFull})
	if err != nil {
		return nil
	}
	ovFaces[key] = f
	return f
}

func textW(f font.Face, s string) float64 {
	if f == nil {
		return 0
	}
	return float64(font.MeasureString(f, s)) / 64
}

// text draws s with its left edge at x and its vertical middle at cy; align: 0 left, 1 right (x is the right edge), 2 centre
func (c *ovCanvas) text(f font.Face, s string, x, cy float64, col uint32, a float64, align int) {
	if f == nil || s == "" {
		return
	}
	w := textW(f, s)
	switch align {
	case 1:
		x -= w
	case 2:
		x -= w / 2
	}
	m := f.Metrics()
	asc, desc := float64(m.Ascent)/64, float64(m.Descent)/64
	base := cy + (asc-desc)/2
	mask := image.NewAlpha(image.Rect(0, 0, int(w)+4, int(asc+desc)+4))
	d := font.Drawer{Dst: mask, Src: image.Opaque, Face: f, Dot: fixed.P(1, int(asc)+1)}
	d.DrawString(s)
	ox, oy := int(math.Round(x))-1, int(math.Round(base-asc))-1
	b := mask.Bounds()
	for yy := 0; yy < b.Dy(); yy++ {
		for xx := 0; xx < b.Dx(); xx++ {
			if v := mask.Pix[yy*mask.Stride+xx]; v > 0 {
				c.blend(ox+xx, oy+yy, col, a*float64(v)/255)
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
	colPanel  = 0x0f1318
	colText   = 0xe7ebf1
	colMuted  = 0x8a96a5
	colGood   = 0x38c97c
	colBad    = 0xff5d5d
	colAmber  = 0xffb02e
	colAhead  = 0xff7b7b // a lap ahead
	colBehind = 0x6aa8ff // a lap behind
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
	IR, Class, Inc         int
	Skip                   bool // pace car, spectators
}

type ovSession struct {
	TrackLen float64
	IncLimit int
	Drivers  map[int]*ovDriver
	Sessions map[int]ovSess
	Grid     map[int][2]int // car → qualifying place, class place (1 = first)
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
	clearAt time.Time // radar: since when nobody has been near
}

// langFromURL: the app's language, given to the overlay window in its address
func langFromURL(raw string) string {
	if u, err := url.Parse(raw); err == nil {
		return u.Query().Get("lang")
	}
	return ""
}

func newOvState(lang string) *ovState {
	return &ovState{frame: map[string]json.RawMessage{}, alpha: 255, ui: map[string]any{}, pits: map[int]int{}, onPit: map[int]bool{}, sesNum: -1, lang: lang}
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
	s := &ovSession{Drivers: map[int]*ovDriver{}, Sessions: map[int]ovSess{}, Grid: map[int][2]int{}}
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
				continue
			}
			switch k {
			case "UserName":
				drv.Name = v
			case "CarNumber":
				drv.Num = v
			case "LicString":
				drv.Lic = v
			case "IRating":
				drv.IR = atoi(v)
			case "CarClassID":
				drv.Class = atoi(v)
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
func ovFeed(rawURL string, vars []string, st *ovState) {
	u, err := url.Parse(rawURL)
	if err != nil {
		return
	}
	base, lt := u.Scheme+"://"+u.Host, u.Query().Get("lt")
	jar, _ := cookiejar.New(nil)
	client := &http.Client{Jar: jar}
	for {
		q := base + "/api/stream?vars=" + strings.Join(vars, ",") + "&hz=30"
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
		time.Sleep(time.Second)
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
	case "session":
		var y string
		if json.Unmarshal([]byte(data), &y) != nil {
			return
		}
		ses := parseOvSession(y)
		st.mu.Lock()
		st.ses = ses
		st.mu.Unlock()
	case "config":
		var c struct {
			Config struct {
				Edit  bool
				Alpha int
				UI    map[string]any `json:"ui"`
			}
		}
		if json.Unmarshal([]byte(data), &c) != nil {
			return
		}
		st.mu.Lock()
		st.edit, st.alpha = c.Config.Edit, c.Config.Alpha
		if c.Config.UI != nil {
			st.ui = c.Config.UI
		}
		st.mu.Unlock()
	}
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
	}
	if st.edit { // while you move the overlays: a frame and the resize corner
		for x := 0; x < c.w; x++ {
			for k := 0; k < 2; k++ {
				c.blend(x, k, colAmber, 1)
				c.blend(x, c.h-1-k, colAmber, 1)
			}
		}
		for y := 0; y < c.h; y++ {
			for k := 0; k < 2; k++ {
				c.blend(k, y, colAmber, 1)
				c.blend(c.w-1-k, y, colAmber, 1)
			}
		}
		for k := 0; k < 14; k++ {
			for j := 0; j <= k; j++ {
				c.blend(c.w-3-j, c.h-17+k, colAmber, 1)
			}
		}
	}
	return h
}

// a panel: the dark rounded card the overlays sit on
func panel(c *ovCanvas, h float64, z float64) {
	c.roundRect(0.5, 0.5, float64(c.w)-1, h-1, 10*z, colPanel, 0.9, 0xffffff, 0.08, 1)
}

// strip draws a row of header/footer items; returns its height
func strip(c *ovCanvas, st *ovState, keys []string, x, y, maxW, z float64) float64 {
	if len(keys) == 0 {
		return 0
	}
	lf, vf := ovFace(false, 9*z), ovFace(true, 12*z)
	h := 20 * z
	for _, k := range keys {
		l, v, col := st.item(k)
		if l == "" {
			continue
		}
		l = strings.ToUpper(l)
		w := textW(lf, l) + 5*z + textW(vf, v)
		if x+w > maxW {
			break
		}
		c.text(lf, l, x, y+h/2, colMuted, 1, 0)
		c.text(vf, v, x+textW(lf, l)+5*z, y+h/2, col, 1, 0)
		x += w + 16*z
	}
	return h
}

func drawDeltaOv(c *ovCanvas, st *ovState, z float64) int {
	H := 54 * z
	panel(c, H, z)
	pad := 10 * z
	tx, ty, tw, th := pad, (H-34*z)/2, float64(c.w)-2*pad, 34*z
	c.roundRect(tx, ty, tw, th, th/2, 0xffffff, 0.05, 0xffffff, 0.09, 1)
	d, ok := st.delta()
	rng := uiNum(st.uiMap("delta"), "range", 1)
	if rng <= 0 {
		rng = 1
	}
	if ok {
		f := math.Min(math.Abs(d), rng) / rng * (tw/2 - 2)
		col := uint32(colBad)
		x0 := tx + tw/2
		if d < 0 {
			col, x0 = colGood, tx+tw/2-f
		}
		for x := int(x0); x < int(x0+f); x++ { // brighter towards the end
			k := (float64(x) - (tx + tw/2)) / (tw / 2)
			a := 0.35 + 0.65*math.Abs(k)
			for y := int(ty + 3); y < int(ty+th-3); y++ {
				c.blend(x, y, col, a)
			}
		}
	}
	c.rect(tx+tw/2-1, ty+5*z, 2, th-10*z, 0xffffff, 0.55)
	vf := ovFace(true, 17*z)
	s, col := "–", uint32(colText)
	if ok {
		s = signed(d, 2)
		col = colBad
		if d < 0 {
			col = colGood
		}
	}
	pw := textW(vf, s) + 22*z
	c.roundRect(tx+tw/2-pw/2, ty+th/2-12*z, pw, 24*z, 12*z, 0x090c11, 0.9, 0xffffff, 0.1, 1)
	c.text(vf, s, tx+tw/2, ty+th/2, col, 1, 2)
	return int(math.Ceil(H))
}

type ovRow struct {
	idx        int
	blank, sep bool
	gap, iv    string // the gap (to you, or to the leader) and the interval to the car ahead
	nameCol    uint32
}

// drawTableOv: the relative (cars around you) or the standings (race order)
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
	pad := 10 * z
	rowH, headH := 24*z, 18*z
	W := float64(c.w)
	H := pad + 0.0
	if len(head) > 0 {
		H += 20*z + 4*z
	}
	H += headH + float64(len(rows))*rowH
	if len(rows) == 0 {
		H += 30 * z
	}
	if len(foot) > 0 {
		H += 4*z + 20*z
	}
	H += pad
	need := H
	if int(H) > c.h { // the window grows to it on the next frame; draw what fits now
		H = float64(c.h)
	}
	panel(c, H, z)
	y := pad
	if len(head) > 0 {
		y += strip(c, st, head, pad, y, W-pad, z) + 4*z
	}
	irc := st.irEstimates()
	// each column's width: the widest of its title and its values
	tf, nf, mf := ovFace(false, 9*z), ovFace(false, 12.5*z), ovFace(true, 12*z)
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
		ci := colInfo{key: k, title: strings.ToUpper(t), right: right, w: textW(tf, strings.ToUpper(t))}
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
			if k == "lic" {
				w += 10 * z
			}
			ci.w = math.Max(ci.w, w)
		}
		if k == "name" {
			nameIdx = len(info)
		} else {
			fixedW += ci.w + 12*z
		}
		info = append(info, ci)
	}
	if nameIdx >= 0 {
		info[nameIdx].w = math.Max(60*z, W-2*pad-fixedW-12*z)
	}
	// titles
	x := pad
	for _, ci := range info {
		if ci.right {
			c.text(tf, ci.title, x+ci.w, y+headH/2, colMuted, 1, 1)
		} else {
			c.text(tf, ci.title, x, y+headH/2, colMuted, 1, 0)
		}
		x += ci.w + 12*z
	}
	y += headH
	c.rect(pad, y-1, W-2*pad, 1, 0xffffff, 0.08)
	if len(rows) == 0 {
		c.text(nf, st.T("Waiting for cars on track", "Esperando coches en pista"), W/2, y+15*z, colMuted, 1, 2)
		y += 30 * z
	}
	pit := st.arr("CarIdxOnPitRoad")
	for k, r := range rows {
		if y+rowH > float64(c.h) {
			break
		}
		if k%2 == 1 {
			c.rect(pad, y, W-2*pad, rowH, 0xffffff, 0.025)
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
		a := 1.0
		if r.idx < len(pit) && pit[r.idx] != 0 && !mine {
			a = 0.55
		}
		if mine {
			c.roundRect(pad, y+1, W-2*pad, rowH-2, 4*z, colAmber, 0.18, 0, 0, 0)
			c.rect(pad, y+2, 3*z, rowH-4, colAmber, 1)
		}
		x := pad
		for _, ci := range info {
			v, col, mono := st.cell(ci.key, r, irc)
			f := nf
			if mono {
				f = mf
			}
			switch {
			case ci.key == "lic" && v != "–":
				lc := licColor(v)
				bw := textW(mf, v) + 10*z
				c.roundRect(x, y+rowH/2-8*z, bw, 16*z, 3*z, lc, 0.85*a, 0, 0, 0)
				c.text(mf, v, x+bw/2, y+rowH/2, 0x0d1117, a, 2)
			case ci.key == "name":
				n := ellipsis(f, v, ci.w-(func() float64 {
					if r.idx < len(pit) && pit[r.idx] != 0 {
						return 34 * z
					}
					return 0
				})())
				c.text(f, n, x, y+rowH/2, col, a, 0)
				if r.idx < len(pit) && pit[r.idx] != 0 {
					pf := ovFace(true, 8.5*z)
					px := x + textW(f, n) + 6*z
					c.roundRect(px, y+rowH/2-7*z, 26*z, 14*z, 7*z, 0xffffff, 0, colMuted, 0.6*a, 1)
					c.text(pf, "PIT", px+13*z, y+rowH/2, colMuted, a, 2)
				}
			case ci.right:
				c.text(f, v, x+ci.w, y+rowH/2, col, a, 1)
			default:
				c.text(f, v, x, y+rowH/2, col, a, 0)
			}
			x += ci.w + 12*z
		}
		y += rowH
	}
	if len(foot) > 0 {
		y += 4 * z
		c.rect(pad, y-2*z, W-2*pad, 1, 0xffffff, 0.08)
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
		if d.IR > 0 {
			return fmt.Sprintf("%.1fk", float64(d.IR)/1000), colText, true
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
	for k, d := range drivers {
		r := ovRow{idx: d.Idx, nameCol: colText}
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

type radarCar struct{ dm, lat float64 }

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
			if i == me || p < 0 || (st.ses.Drivers[i] != nil && st.ses.Drivers[i].Skip) || (i < len(surf) && surf[i] != 3) {
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
		st.clearAt = time.Time{}
	} else if st.clearAt.IsZero() {
		st.clearAt = now
	}
	if !st.edit && autohide && !busy && now.Sub(st.clearAt) > 1500*time.Millisecond {
		return // nobody near: nothing at all on the screen
	}
	side := []int{}
	for k, n := range near {
		if math.Abs(n.dm) < 5.5 {
			side = append(side, k)
		}
	}
	sort.Slice(side, func(a, b int) bool { return math.Abs(near[side[a]].dm) < math.Abs(near[side[b]].dm) })
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
			col = colAmber
		}
		a := 1.0
		if n.lat == 0 {
			a = math.Max(0.35, 1-d/(rng+3)*0.65)
		}
		X, Y := cx+n.lat*LW*ppm, cy-n.dm*ppm
		c.roundRect(X-W/2-1.5, Y-H/2, W+3, H+3, math.Min(W, H)*0.4, 0x000000, 0.35*a, 0, 0, 0)
		c.roundRect(X-W/2, Y-H/2, W, H, math.Min(W, H)*0.35, col, a, 0x000000, 0.55*a, 1.2)
	}
	c.roundRect(cx-W/2, cy-H/2, W, H, math.Min(W, H)*0.35, 0xffffff, 0.12, 0xffffff, 0.9, 2)
	var best *radarCar
	for k := range near {
		n := &near[k]
		if n.lat == 0 && math.Abs(n.dm) <= rng && (best == nil || math.Abs(n.dm) < math.Abs(best.dm)) {
			best = n
		}
	}
	if best != nil {
		col := uint32(colText)
		if math.Abs(best.dm) < 10 {
			col = colAmber
		}
		f := ovFace(true, math.Max(11, ppm*1.5))
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
func ovVars(name string) []string {
	base := []string{"PlayerCarIdx", "SessionNum"}
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
