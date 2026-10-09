package main

// Native overlays, fourth part: the ones that need laps or the track (track map, live compare, braking markers,
// coach) and the radio's buttons. Each window records the laps it sees, every 5 m, like the app, gets the track's
// outline and the model's reference lap from the PC, and the radio window takes clicks to ask the engineer.

import (
	"encoding/json"
	"fmt"
	"math"
	"net/url"
	"sort"
	"strconv"
	"strings"
	"time"
)

func lapOverlay(name string) bool {
	switch name {
	case "map", "compare", "brakes", "coach", "radio":
		return true
	}
	return false
}

// the values the lap recorder needs (the app's recordLap)
var recVars = []string{"LapDist", "LapCompleted", "LapCurrentLapTime", "IsOnTrack", "Speed", "Throttle", "Brake", "Gear", "SteeringWheelAngle", "RPM", "Lap", "LapLastLapTime", "OnPitRoad", "LapBestLapTime"}

func lapOvVars(name string) []string {
	switch name {
	case "map":
		return []string{"CarIdxLapDistPct", "CarIdxPosition", "CarIdxOnPitRoad", "CarIdxLap"}
	case "compare", "coach":
		return recVars
	case "brakes":
		return append([]string{"LapDist", "Speed", "Brake", "LapCompleted", "IsOnTrack", "OnPitRoad", "CarIdxLapDistPct", "CarIdxTrackSurface", "CarIdxOnPitRoad", "CarLeftRight", "LapBestLapTime"}, recVars...)
	}
	return nil
}

const ovLapBin = 5.0 // metres between two points of a recorded lap (the app's BIN)

// one point of a lap: speed, time, throttle, brake, gear, steering, rpm
type lapPt [7]float64

type ovLap struct {
	n      int
	time   float64
	bins   []*lapPt
	maxBin int
	name   string
	x, y   []float64 // the path the car drove, every 5 m, when the lap carries it (racingline.go)
}

type ovRec struct {
	lc, lap, cnt, maxBin int
	bins                 []*lapPt
	t, ld, lt            float64
	hasLd                bool
	pv                   lapPt
	started              bool
}

type ovExtra struct {
	notes    map[string]*driverNote // your notes on drivers (drivers.json), from the PC every 15 s
	notesAt  time.Time
	rec      ovRec
	laps     []*ovLap
	pending  *ovLap // a lap just finished: its time comes with the next frames (LapLastLapTime)
	pendAt   time.Time
	mapKey   string
	mapX     []float64
	mapY     []float64
	turnsKey string
	turns    []float64 // the track's official turns (T1 … Tn), as fractions of the lap
	modelKey string
	modelRef *ovLap
	modelAt  time.Time
	bm       bmState
	buttons  []ovButton
	pressed  string
	pressAt  time.Time
}

type ovButton struct {
	x, y, w, h float64
	q          string
}

// collectLaps records the laps this window sees; st.mu is held
func (st *ovState) collectLaps() {
	E := &st.ext
	f := func(n string) float64 { v, _ := st.num(n); return v }
	if E.pending != nil && time.Since(E.pendAt) > 400*time.Millisecond {
		if ll := f("LapLastLapTime"); ll > 0 {
			E.pending.time = ll
		}
		if E.pending.time > 0 {
			E.laps = append(E.laps, E.pending)
			if len(E.laps) > 40 {
				E.laps = E.laps[1:]
			}
		}
		E.pending = nil
	}
	d, ok1 := st.num("LapDist")
	lcv, ok2 := st.num("LapCompleted")
	t, ok3 := st.num("LapCurrentLapTime")
	if !ok1 || !ok2 || f("IsOnTrack") == 0 {
		return
	}
	R := &E.rec
	lc := int(lcv)
	if !R.started || lc != R.lc {
		if R.started && lc == R.lc+1 && R.cnt > 0 && float64(R.cnt)/float64(R.maxBin+1) > .9 {
			E.pending, E.pendAt = &ovLap{n: R.lap, time: R.t, bins: R.bins, maxBin: R.maxBin}, time.Now()
		}
		*R = ovRec{lc: lc, lap: int(f("Lap")), started: true}
	}
	if !ok3 || d < 0 || (d < 60 && t > 8) {
		return
	}
	if R.hasLd && t < R.lt {
		R.hasLd = false
	}
	R.t = t
	b := int(math.Floor(d / ovLapBin))
	if b >= 12000 {
		return
	}
	v := lapPt{f("Speed"), t, f("Throttle"), f("Brake"), f("Gear"), f("SteeringWheelAngle"), f("RPM")}
	put := func(k int, row lapPt) {
		for len(R.bins) <= k {
			R.bins = append(R.bins, nil)
		}
		if R.bins[k] == nil {
			r := row
			R.bins[k] = &r
			R.cnt++
			if k > R.maxBin {
				R.maxBin = k
			}
		}
	}
	if !R.hasLd || d < R.ld || d-R.ld > 150 {
		if b == 0 {
			r := v
			r[1] = math.Max(0, t-d/math.Max(v[0], 1))
			put(0, r)
		} else {
			put(b, v)
		}
	} else {
		p := R.pv
		for k := int(math.Floor(R.ld/ovLapBin)) + 1; k <= b; k++ {
			fr := (float64(k)*ovLapBin - R.ld) / math.Max(d-R.ld, 1e-9)
			r := v
			r[0] = p[0] + (v[0]-p[0])*fr
			r[1] = R.lt + (t-R.lt)*fr
			put(k, r)
		}
	}
	R.ld, R.lt, R.pv, R.hasLd = d, t, v, true
}

// series: a lap's points with the gaps filled from the point before (the app's lapSeries)
func (l *ovLap) series() []*lapPt {
	out := make([]*lapPt, 0, len(l.bins))
	var last *lapPt
	lim := l.maxBin + 1
	if lim > len(l.bins) {
		lim = len(l.bins)
	}
	for i := 0; i < lim; i++ {
		b := l.bins[i]
		if b == nil {
			b = last
		}
		out = append(out, b)
		if b != nil {
			last = b
		}
	}
	return out
}

func timeAt(s []*lapPt, d float64) (float64, bool) {
	i := int(math.Floor(d / ovLapBin))
	if i < 0 || i >= len(s) || s[i] == nil {
		return 0, false
	}
	if i+1 >= len(s) || s[i+1] == nil {
		return s[i][1], true
	}
	return s[i][1] + (d/ovLapBin-float64(i))*(s[i+1][1]-s[i][1]), true
}

func (st *ovState) bestLap(except *ovLap) *ovLap {
	var best *ovLap
	for _, l := range st.ext.laps {
		if l != except && (best == nil || l.time < best.time) {
			best = l
		}
	}
	return best
}

// ---------- the PC's API (the map, the model) ----------

func (st *ovState) fetchJSON(path string, out any) bool {
	st.mu.Lock()
	cl, base := st.client, st.base
	st.mu.Unlock()
	if cl == nil {
		return false
	}
	r, err := cl.Get(base + path)
	if err != nil {
		return false
	}
	defer r.Body.Close()
	if r.StatusCode != 200 {
		return false
	}
	return json.NewDecoder(r.Body).Decode(out) == nil
}

// loadMap gets the track's outline: the one this PC learnt, else the community's (both from the PC); st.mu is held
func (st *ovState) loadMap() {
	if st.ses == nil || st.ses.TrackID <= 0 {
		return
	}
	key := "t" + strconv.Itoa(st.ses.TrackID)
	if st.ext.mapKey == key {
		return
	}
	st.ext.mapKey = key
	tid := st.ses.TrackID
	go func() {
		var d struct {
			N    int
			Laps int
			X, Y []float64
		}
		ok := st.fetchJSON("/api/map?key="+key, &d) && len(d.X) > 10 && len(d.X) == len(d.Y)
		if !ok || d.Laps == 0 {
			var c struct {
				N    int `json:"n"`
				X, Y []float64
			}
			if st.fetchJSON("/api/trackmap?trackId="+strconv.Itoa(tid)+"&game=iracing", &c) && len(c.X) > 10 && len(c.X) == len(c.Y) {
				d.X, d.Y, ok = c.X, c.Y, true
			}
		}
		if ok {
			st.mu.Lock()
			st.ext.mapX, st.ext.mapY = d.X, d.Y
			st.mu.Unlock()
		}
	}()
}

// loadTurns gets the track's official turn numbers from the PC (the ones an admin placed on its map); st.mu is held
func (st *ovState) loadTurns() {
	if st.ses == nil || st.ses.TrackID <= 0 {
		return
	}
	key := "t" + strconv.Itoa(st.ses.TrackID)
	if st.ext.turnsKey == key {
		return
	}
	st.ext.turnsKey = key
	tid := st.ses.TrackID
	go func() {
		var d struct {
			Turns []float64 `json:"turns"`
		}
		if st.fetchJSON("/api/turns?trackId="+strconv.Itoa(tid)+"&game=iracing", &d) {
			st.mu.Lock()
			st.ext.turns = d.Turns
			st.mu.Unlock()
		}
	}()
}

// turnName: the official turn nearest to a point of the lap ("T4"), or the corner's own number when the track has
// no official turns yet; st.mu is held
func (st *ovState) turnName(d float64, fb int) string {
	st.loadTurns()
	t := st.ext.turns
	L := 0.0
	if st.ses != nil {
		L = st.ses.TrackLen
	}
	if len(t) == 0 || L <= 0 {
		return "T" + strconv.Itoa(fb)
	}
	f := math.Mod(math.Mod(d/L, 1)+1, 1)
	bi, bd := 0, 2.0
	for i, x := range t {
		dd := math.Abs(x - f)
		dd = math.Min(dd, 1-dd)
		if dd < bd {
			bd, bi = dd, i
		}
	}
	return "T" + strconv.Itoa(bi+1)
}

// loadModelRef gets the model's next level for your pace (the real lap of the driver just ahead) from the PC;
// st.mu is held
func (st *ovState) loadModelRef() {
	if st.ses == nil || st.ses.TrackID <= 0 {
		return
	}
	car := 0
	if d := st.ses.Drivers[st.ses.MyIdx]; d != nil {
		car = d.CarID
	}
	if car <= 0 {
		return
	}
	best, _ := st.num("LapBestLapTime")
	key := fmt.Sprintf("%d:%d:%.1f", st.ses.TrackID, car, best)
	if st.ext.modelKey == key && (st.ext.modelRef != nil || time.Since(st.ext.modelAt) < 5*time.Minute) {
		return
	}
	st.ext.modelKey, st.ext.modelAt = key, time.Now()
	tid := st.ses.TrackID
	go func() {
		var m struct {
			NB     int `json:"nb"`
			Ladder []struct {
				Time float64     `json:"time"`
				UpTo float64     `json:"upTo"`
				Bins [][]float64 `json:"bins"`
			} `json:"ladder"`
		}
		if !st.fetchJSON(fmt.Sprintf("/api/community/model?trackId=%d&carId=%d&game=iracing", tid, car), &m) || len(m.Ladder) == 0 {
			return
		}
		t := best
		if t <= 0 {
			t = math.Inf(1)
		}
		i := -1
		for k, x := range m.Ladder {
			if t <= x.UpTo {
				i = k
				break
			}
		}
		if i < 0 {
			i = len(m.Ladder) - 1
		}
		for i > 0 && !(m.Ladder[i].Time < t*0.997) {
			i--
		}
		x := m.Ladder[i]
		if !(x.Time < t-0.001) && !math.IsInf(t, 1) {
			return // you are the fastest the model knows: your own best lap is the reference
		}
		// the model keeps one point in two: back to every 5 m (the app's up())
		var bins []*lapPt
		for k, b := range x.Bins {
			if len(b) < 5 {
				continue
			}
			p := lapPt{b[0], b[1], b[2], b[3], b[4]}
			bins = append(bins, &p)
			q := p
			if k+1 < len(x.Bins) && len(x.Bins[k+1]) >= 2 {
				q[0], q[1] = (b[0]+x.Bins[k+1][0])/2, (b[1]+x.Bins[k+1][1])/2
			}
			bins = append(bins, &q)
		}
		if m.NB > 0 && len(bins) > m.NB {
			bins = bins[:m.NB]
		}
		if len(bins) < 10 {
			return
		}
		st.mu.Lock()
		st.ext.modelRef = &ovLap{time: x.Time, bins: bins, maxBin: len(bins) - 1, name: "model"}
		st.mu.Unlock()
	}()
}

// ---------- drawing ----------

func drawLapOv(name string, c *ovCanvas, st *ovState, z float64, now time.Time) int {
	switch name {
	case "map":
		return drawMapOv(c, st, z)
	case "compare":
		return drawCompareOv(c, st, z)
	case "brakes":
		return drawBrakesOv(c, st, z)
	case "coach":
		return drawCoachOv(c, st, z)
	case "radio":
		return drawRadioOv(c, st, z, now)
	}
	return 0
}

func drawMapOv(c *ovCanvas, st *ovState, z float64) int {
	W, H := float64(c.w), float64(c.h)
	st.loadMap()
	panel(c, H, z)
	X, Y := st.ext.mapX, st.ext.mapY
	nf := ovFace(fkBody, 13*z)
	if len(X) < 10 {
		c.text(nf, st.T("Waiting for the track…", "Esperando el circuito…"), W/2, H/2, colMuted, 1, 2)
		return 0
	}
	mnx, mny, mxx, mxy := math.Inf(1), math.Inf(1), math.Inf(-1), math.Inf(-1)
	for i := range X {
		mnx, mxx = math.Min(mnx, X[i]), math.Max(mxx, X[i])
		mny, mxy = math.Min(mny, Y[i]), math.Max(mxy, Y[i])
	}
	pad := 22 * z
	sc := math.Min((W-2*pad)/math.Max(mxx-mnx, 1), (H-2*pad)/math.Max(mxy-mny, 1))
	ox, oy := (W-(mxx-mnx)*sc)/2, (H-(mxy-mny)*sc)/2
	P := func(x, y float64) (float64, float64) { return ox + (x-mnx)*sc, H - (oy + (y-mny)*sc) }
	N := len(X)
	// the track: a wide dark band and a lighter one inside, like the app
	step := 1
	if N > 600 {
		step = N / 600
	}
	for pass, w := range []float64{14 * z, 9 * z} {
		col := uint32(colLine)
		if pass == 1 {
			col = colSurf2
		}
		for i := 0; i < N; i += step {
			j := (i + step) % N
			x0, y0 := P(X[i], Y[i])
			x1, y1 := P(X[j], Y[j])
			c.line(x0, y0, x1, y1, w, col, 1)
		}
	}
	// the pit lane beside the track, dashed, like iRacing's map; the cars on the pit road are drawn on it
	// the start line
	if N > 4 {
		sx, sy := P(X[0], Y[0])
		tx, ty := P(X[3], Y[3])
		a := math.Atan2(ty-sy, tx-sx) + math.Pi/2
		c.line(sx+math.Cos(a)*9*z, sy+math.Sin(a)*9*z, sx-math.Cos(a)*9*z, sy-math.Sin(a)*9*z, 3*z, colText, 1)
		// the way the cars go, like iRacing's maps: an arrow beside the line, on the outside of the track
		if N > 20 {
			qx, qy := P(X[max(2, N/60)], Y[max(2, N/60)])
			ux, uy := qx-sx, qy-sy
			m := math.Max(math.Hypot(ux, uy), 1e-6)
			ux, uy = ux/m, uy/m
			nx, ny := -uy, ux
			if (sx-W/2)*nx+(sy-H/2)*ny < 0 {
				nx, ny = -nx, -ny
			}
			bx, by := sx+nx*15*z, sy+ny*15*z
			tx, ty := bx+ux*20*z, by+uy*20*z
			h := 7 * z
			c.line(bx, by, tx-ux*h, ty-uy*h, 2.6*z, colBad, 1)
			c.line(tx, ty, tx-ux*h+nx*h*.6, ty-uy*h+ny*h*.6, 2.6*z, colBad, 1)
			c.line(tx, ty, tx-ux*h-nx*h*.6, ty-uy*h-ny*h*.6, 2.6*z, colBad, 1)
		}
	}
	// the official turns, numbered on the outside of the track
	st.loadTurns()
	if len(st.ext.turns) > 0 {
		cxm, cym := 0.0, 0.0
		for i := range X {
			cxm += X[i]
			cym += Y[i]
		}
		cxm, cym = cxm/float64(N), cym/float64(N)
		tf := ovFace(fkDataB, 9.5*z)
		for k, f := range st.ext.turns {
			i := int(math.Floor(f*float64(N))) % N
			px, py := P(X[i], Y[i])
			ox, oy := P(cxm, cym)
			dx, dy := px-ox, py-oy
			m := math.Max(math.Hypot(dx, dy), 1e-6)
			c.text(tf, "T"+strconv.Itoa(k+1), px+dx/m*15*z, py+dy/m*15*z, colMuted, 1, 2)
		}
	}
	// the cars: you in amber, a lap ahead red, a lap behind blue, the rest light (their class's colour when several
	// classes race); their place inside
	multi := st.multiClass()
	pct, pos, pit, laps := st.arr("CarIdxLapDistPct"), st.arr("CarIdxPosition"), st.arr("CarIdxOnPitRoad"), st.arr("CarIdxLap")
	mev, _ := st.num("PlayerCarIdx")
	me := int(mev)
	at := func(q float64) (float64, float64) {
		f := q * float64(N)
		i := int(math.Floor(f)) % N
		j := (i + 1) % N
		t := f - math.Floor(f)
		return P(X[i]+(X[j]-X[i])*t, Y[i]+(Y[j]-Y[i])*t)
	}
	if st.ses == nil {
		return 0
	}
	var idx []int
	for _, d := range st.ses.Drivers {
		if !d.Skip && d.Name != "" && d.Idx < len(pct) && pct[d.Idx] >= 0 {
			idx = append(idx, d.Idx)
		}
	}
	sort.SliceStable(idx, func(a, b int) bool { // you last, on top of the others
		if (idx[a] == me) != (idx[b] == me) {
			return idx[b] == me
		}
		return idx[a] < idx[b]
	})
	numF := ovFace(fkDataB, 9.5*z)
	for _, i := range idx {
		x, y := at(pct[i])
		col := uint32(colText)
		lapDiff := 0.0
		if me >= 0 && me < len(pct) && i < len(laps) && me < len(laps) {
			lapDiff = (laps[i] + pct[i]) - (laps[me] + pct[me])
		}
		switch {
		case i == me:
			col = colAmber
		case multi:
			if d := st.ses.Drivers[i]; d != nil {
				col = classColor(st, d)
			}
		case lapDiff > .5:
			col = colBad
		case lapDiff < -.5:
			col = colBlue
		}
		r := 7.5 * z
		if i == me {
			r = 9 * z
		}
		a := 1.0
		if i < len(pit) && pit[i] != 0 {
			a = 0.45
		}
		c.disc(x, y, r+2*z, colPanel, a)
		c.disc(x, y, r, col, a)
		if i < len(pos) && pos[i] > 0 {
			ink := uint32(colPanel)
			c.text(numF, strconv.Itoa(int(pos[i])), x, y, ink, a, 2)
		}
	}
	return 0
}

// the compare overlay's channels (the app's CMPCH)
var cmpChannels = []struct{ k, en, es string }{{"speed", "Speed", "Velocidad"}, {"pedals", "Throttle & brake", "Acelerador y freno"}, {"delta", "Time delta", "Diferencia de tiempo"},
	{"gear", "Gear", "Marcha"}, {"steer", "Steering", "Volante"}, {"rpm", "RPM", "RPM"}}

func drawCompareOv(c *ovCanvas, st *ovState, z float64) int {
	W := float64(c.w)
	pad := 14 * z
	cfg := st.uiMap("cmp")
	ch, follow := uiStr(cfg, "ch", "speed"), uiBool(cfg, "follow", false)
	plotH := 200 * z
	H := pad + 18*z + 24*z + plotH + pad
	panel(c, H, z)
	title := st.T("Live compare", "Comparación en vivo")
	for _, x := range cmpChannels {
		if x.k == ch {
			title += " · " + st.T(x.en, x.es)
		}
	}
	c.label(z, title, pad, pad+6*z, 0)
	E := &st.ext
	var last *ovLap
	if n := len(E.laps); n > 0 {
		last = E.laps[n-1]
	}
	best := st.bestLap(nil)
	cur := &ovLap{bins: E.rec.bins, maxBin: E.rec.maxBin}
	var bs, ls, cs []*lapPt
	if best != nil {
		bs = best.series()
	}
	if last != nil && last != best {
		ls = last.series()
	}
	cs = cur.series()
	curD, _ := st.num("LapDist")
	// the strip: best, last, now against the best
	y := pad + 18*z
	lf, vf := ovFace(fkData, 10*z), ovFace(fkData, 13*z)
	x := pad
	item := func(l, v string, lc, vc uint32) {
		l = strings.ToUpper(l)
		lw := textWT(lf, l, 0.8*z)
		c.textT(lf, l, x, y+10*z, lc, 1, 0, 0.8*z)
		c.text(vf, v, x+lw+6*z, y+10*z, vc, 1, 0)
		x += lw + 6*z + textW(vf, v) + 16*z
	}
	lapTxt := func(l *ovLap) string {
		if l == nil {
			return "–"
		}
		return st.T("L", "V") + strconv.Itoa(l.n) + " " + fmtLap(l.time)
	}
	item(st.T("Best", "Mejor"), lapTxt(best), colPB, colText)
	item(st.T("Last", "Última"), lapTxt(last), colMuted, colText)
	nowS, nowC := "–", uint32(colText)
	if bs != nil {
		if r, ok := timeAt(bs, curD); ok && curD > 20 {
			t, _ := st.num("LapCurrentLapTime")
			d := t - r
			nowS, nowC = signed(d, 2), colBad
			if d <= 0 {
				nowC = colGood
			}
		}
	}
	item(st.T("Now", "Ahora"), nowS, colAmber, nowC)
	top := pad + 18*z + 24*z
	c.roundRect(pad, top, W-2*pad, plotH, 6*z, colSurf2, 0.6, colLine, 1, 1)
	if bs == nil {
		nf := ovFace(fkBody, 13*z)
		c.text(nf, st.T("Complete a lap to start comparing.", "Completa una vuelta para empezar a comparar."), W/2, top+plotH/2, colMuted, 1, 2)
		return int(math.Ceil(H))
	}
	L := math.Max(float64(len(bs))*ovLapBin, 100)
	d0, d1 := 0.0, L
	if follow {
		d0 = math.Max(0, curD-300)
		d1 = math.Min(L, d0+500)
	}
	val := func(p *lapPt, k int) (float64, bool) {
		if p == nil {
			return 0, false
		}
		switch ch {
		case "speed":
			return st.spd(p[0]), true
		case "gear":
			return p[4], true
		case "steer":
			return p[5] * 180 / math.Pi, true
		case "rpm":
			return p[6], true
		case "pedals":
			return p[k], true
		}
		return 0, false
	}
	lo, hi := 0.0, 1.0
	switch ch {
	case "speed", "rpm", "gear", "steer":
		lo, hi = math.Inf(1), math.Inf(-1)
		for _, s := range [][]*lapPt{bs, ls, cs} {
			for i, p := range s {
				if d := float64(i) * ovLapBin; d < d0 || d > d1 {
					continue
				}
				if v, ok := val(p, 0); ok {
					lo, hi = math.Min(lo, v), math.Max(hi, v)
				}
			}
		}
		if math.IsInf(lo, 1) {
			lo, hi = 0, 1
		}
		m := (hi - lo) * 0.08
		lo, hi = lo-m, hi+m+1e-9
	case "delta":
		lo, hi = -1, 1
	}
	px := func(d float64) float64 { return pad + 4*z + (d-d0)/(d1-d0)*(W-2*pad-8*z) }
	py := func(v float64) float64 { return top + plotH - 6*z - (v-lo)/(hi-lo)*(plotH-12*z) }
	draw := func(s []*lapPt, k int, col uint32, w, a float64) {
		var x0, y0 float64
		has := false
		for i, p := range s {
			d := float64(i) * ovLapBin
			if d < d0 || d > d1 {
				has = false
				continue
			}
			v, ok := val(p, k)
			if !ok {
				has = false
				continue
			}
			x1, y1 := px(d), py(v)
			if has {
				c.line(x0, y0, x1, y1, w, col, a)
			}
			x0, y0, has = x1, y1, true
		}
	}
	if ch == "delta" { // the gap to the best lap along the lap: below the line you are faster
		delta := func(s []*lapPt) []*lapPt {
			out := make([]*lapPt, len(s))
			for i, p := range s {
				if p != nil && i < len(bs) && bs[i] != nil {
					q := lapPt{}
					q[2] = p[1] - bs[i][1]
					out[i] = &q
				}
			}
			return out
		}
		dl, dc := delta(ls), delta(cs)
		m := 0.5
		for _, s := range [][]*lapPt{dl, dc} {
			for _, p := range s {
				if p != nil {
					m = math.Max(m, math.Abs(p[2]))
				}
			}
		}
		lo, hi = -m*1.1, m*1.1
		c.rect(pad+4*z, py(0), W-2*pad-8*z, 1, colPB, 0.8)
		ch = "pedals"
		draw(dl, 2, colMuted, 1.5*z, 0.9)
		draw(dc, 2, colAmber, 2.2*z, 1)
	} else if ch == "pedals" {
		draw(bs, 2, colGood, 1.2*z, 0.35)
		draw(bs, 3, colBad, 1.2*z, 0.35)
		draw(cs, 2, colGood, 2*z, 1)
		draw(cs, 3, colBad, 2*z, 1)
	} else {
		draw(bs, 0, colPB, 1.6*z, 1)
		draw(ls, 0, colMuted, 1.2*z, 0.8)
		draw(cs, 0, colAmber, 2.2*z, 1)
	}
	if curD >= d0 && curD <= d1 { // where you are now
		c.rect(px(curD), top+3*z, 1.5*z, plotH-6*z, colText, 0.5)
	}
	return int(math.Ceil(H))
}

// ---------- braking markers (the app's brakeTick, without the beeps: the app plays them) ----------

type bmZone struct {
	n               int
	d, v, vmin, dec float64
}

type bmState struct {
	key   string
	zones []bmZone
	src   string
	cur   *bmCur
	lap   int
	watch *bmWatch
	fb    *bmFeedback
}

type bmCur struct {
	n                                  int
	d                                  float64 // where the reference brakes (m from the line)
	mark, tTo, early, fast, vref, vmin float64
	side, traffic                      bool
	trafficDt                          float64
}

type bmWatch struct {
	key           string
	n             int
	d             float64
	traffic, done bool
}

type bmFeedback struct {
	n       int
	d       float64
	dd      float64
	hasDD   bool
	traffic bool
	at      time.Time
}

// brakeZones: where a lap starts to brake for each corner, its speed there and the slowest speed after (the app's)
func brakeZones(s []*lapPt) []struct {
	i, imin int
	v, vmin float64
} {
	var out []struct {
		i, imin int
		v, vmin float64
	}
	for i := 1; i < len(s); i++ {
		a, b := s[i], s[i-1]
		if a == nil || b == nil {
			continue
		}
		if a[3] > .12 && b[3] <= .12 {
			k, vmin, imin := i, a[0], i
			for k < len(s) && k < i+120 && s[k] != nil && !(s[k][2] > .6 && s[k][3] < .05) {
				if s[k][0] < vmin {
					vmin, imin = s[k][0], k
				}
				k++
			}
			if a[0]-vmin > 4 {
				out = append(out, struct {
					i, imin int
					v, vmin float64
				}{i, imin, a[0], vmin})
			}
			i = k
		}
	}
	return out
}

func (st *ovState) bmZones() []bmZone {
	E := &st.ext
	st.loadModelRef()
	ref, src := E.modelRef, "model"
	if ref == nil {
		ref, src = st.bestLap(nil), "best"
	}
	if ref == nil {
		E.bm.src = ""
		return nil
	}
	key := fmt.Sprintf("%s|%.3f|%d", src, ref.time, len(ref.bins))
	if key != E.bm.key {
		E.bm.key, E.bm.src = key, src
		E.bm.zones = nil
		for k, zz := range brakeZones(ref.series()) {
			d := float64(zz.i) * ovLapBin
			dmin := math.Max(d+5, float64(zz.imin)*ovLapBin)
			dec := math.Max(4, math.Min(40, (zz.v*zz.v-zz.vmin*zz.vmin)/(2*(dmin-d))))
			E.bm.zones = append(E.bm.zones, bmZone{n: k + 1, d: d, v: zz.v, vmin: zz.vmin, dec: dec})
		}
	}
	return E.bm.zones
}

// carAhead: the nearest car physically ahead on track, 6 to 150 m away (not in the pits)
func (st *ovState) carAhead(L, v float64) (float64, bool) {
	pct, surf, pit := st.arr("CarIdxLapDistPct"), st.arr("CarIdxTrackSurface"), st.arr("CarIdxOnPitRoad")
	mev, _ := st.num("PlayerCarIdx")
	me := int(mev)
	if me < 0 || me >= len(pct) || pct[me] < 0 {
		return 0, false
	}
	best := math.Inf(1)
	for i, p := range pct {
		if i == me || p < 0 || (i < len(pit) && pit[i] != 0) || (i < len(surf) && (surf[i] == 1 || surf[i] == 2 || surf[i] == -1)) {
			continue
		}
		dm := (math.Mod(math.Mod(p-pct[me], 1)+1.5, 1) - .5) * L
		if dm > 6 && dm < 150 && dm < best {
			best = dm
		}
	}
	if math.IsInf(best, 1) {
		return 0, false
	}
	return best / v, true
}

// bmTick: the next braking point and where to brake for it now; st.mu is held
func (st *ovState) bmTick() {
	E := &st.ext
	B := &E.bm
	cfg := st.uiMap("brakes")
	f := func(n string) float64 { v, _ := st.num(n); return v }
	if !uiBool(cfg, "on", true) || f("IsOnTrack") == 0 || f("OnPitRoad") != 0 {
		B.cur = nil
		return
	}
	zs := st.bmZones()
	d, ok := st.num("LapDist")
	if len(zs) == 0 || !ok {
		B.cur = nil
		return
	}
	v := math.Max(f("Speed"), 1)
	L := 4000.0
	if st.ses != nil && st.ses.TrackLen > 0 {
		L = st.ses.TrackLen
	}
	lap := int(f("LapCompleted"))
	k, wrap := -1, false
	for i, q := range zs {
		if q.d > d-3 {
			k = i
			break
		}
	}
	if k < 0 {
		k, wrap = 0, true
	}
	nz := zs[k]
	dTo := nz.d - d
	if wrap {
		dTo += L
	}
	dt, traffic := st.carAhead(L, v)
	traffic = traffic && dt < 1.2
	side := f("CarLeftRight") >= 2
	early := 0.0
	if uiBool(cfg, "traffic", true) {
		if traffic {
			if dt < .5 {
				early = .35 * v
			} else {
				early = .2 * v
			}
		} else if side {
			early = .12 * v
		}
	}
	fast := 0.0
	if dTo < 300 {
		fast = math.Max(-25, math.Min(60, (v*v-nz.v*nz.v)/(2*nz.dec)))
	}
	mark := dTo - early - fast
	B.cur = &bmCur{n: nz.n, d: nz.d, mark: mark, tTo: mark / v, early: early, fast: fast, vref: nz.v, vmin: nz.vmin, side: side, traffic: traffic, trafficDt: dt}
	lk := lap
	if wrap {
		lk++
	}
	key := fmt.Sprintf("%d:%d", lk, k)
	if dTo < 70 && dTo > -3 && (B.watch == nil || B.watch.key != key) {
		B.watch = &bmWatch{key: key, n: nz.n, d: nz.d, traffic: traffic}
	}
	if w := B.watch; w != nil && !w.done {
		dd := d - w.d
		if dd < -L/2 {
			dd += L
		}
		if dd > L/2 {
			dd -= L
		}
		if f("Brake") > .12 && dd > -80 {
			w.done = true
			B.fb = &bmFeedback{n: w.n, d: w.d, dd: math.Round(dd), hasDD: true, traffic: w.traffic || traffic, at: time.Now()}
		} else if dd > 80 {
			w.done = true
			B.fb = &bmFeedback{n: w.n, d: w.d, traffic: w.traffic, at: time.Now()}
		}
	}
}

func drawBrakesOv(c *ovCanvas, st *ovState, z float64) int {
	W := float64(c.w)
	pad := 14 * z
	st.bmTick()
	B := &st.ext.bm
	H := pad + 18*z + 44*z + 14*z + 12*z + 22*z + pad
	panel(c, H, z)
	c.label(z, st.T("Braking markers", "Marcas de frenada"), pad, pad+6*z, 0)
	nf := ovFace(fkBody, 13*z)
	y := pad + 18*z
	if !uiBool(st.uiMap("brakes"), "on", true) {
		c.text(nf, st.T("Off", "Apagado"), pad, y+20*z, colMuted, 1, 0)
		return int(math.Ceil(H))
	}
	if len(B.zones) == 0 {
		c.text(nf, ellipsis(nf, st.T("Drive one clean lap: your braking points appear here.", "Da una vuelta limpia: aquí aparecen tus puntos de frenada."), W-2*pad), pad, y+20*z, colMuted, 1, 0)
		return int(math.Ceil(H))
	}
	fb := B.fb
	if fb != nil && time.Since(fb.at) > 6*time.Second {
		fb = nil
	}
	fbTxt, fbCol := "", uint32(colMuted)
	if fb != nil {
		fn := st.turnName(fb.d, fb.n)
		switch {
		case !fb.hasDD:
			fbTxt, fbCol = fn+st.T(": no braking", ": sin frenar"), colBad
		case math.Abs(fb.dd) <= 3:
			fbTxt, fbCol = fn+st.T(": on the mark", ": en el punto"), colGood
		case fb.dd > 0:
			fbTxt, fbCol = fn+st.T(fmt.Sprintf(": %d m late", int(fb.dd)), fmt.Sprintf(": %d m tarde", int(fb.dd))), colBad
		default:
			fbTxt, fbCol = fn+st.T(fmt.Sprintf(": %d m early", int(-fb.dd)), fmt.Sprintf(": %d m antes", int(-fb.dd))), colWarn
		}
		if fb.traffic {
			fbTxt += st.T(" · traffic", " · tráfico")
			fbCol = colMuted
		}
	}
	cur := B.cur
	if cur == nil {
		c.text(nf, fbTxt, pad, y+20*z, fbCol, 1, 0)
		return int(math.Ceil(H))
	}
	now := cur.tTo <= 0 && cur.tTo > -.6
	if now { // brake: the whole card says so
		c.roundRect(0.5, 0.5, W-1, H-1, 10*z, colBad, 0.22, colBad, 0.9, 2)
	}
	big := ovFace(fkDisplayB, 40*z)
	cn := st.turnName(cur.d, cur.n)
	c.text(big, cn, pad, y+22*z, colText, 1, 0)
	ds := "–"
	switch {
	case now:
		ds = st.T("BRAKE", "FRENA")
	case cur.mark <= 999:
		ds = strconv.Itoa(int(math.Max(0, math.Round(cur.mark)))) + " m"
	}
	dcol := uint32(colText)
	if now {
		dcol = colBad
	}
	c.text(big, ds, pad+textW(big, cn)+18*z, y+22*z, dcol, 1, 0)
	c.text(ovFace(fkData, 13*z), fmt.Sprintf("%d → %d %s", int(math.Round(st.spd(cur.vref))), int(math.Round(st.spd(cur.vmin))), st.spdU()), W-pad, y+22*z, colMuted, 1, 1)
	y += 44 * z
	pct := clamp01(1 - cur.mark/200)
	col := uint32(colAmber)
	if now || pct > .85 {
		col = colBad
	}
	meter(c, pad, y+3*z, W-2*pad, z, pct, col)
	y += 14*z + 12*z
	sf := ovFace(fkBody, 12.5*z)
	left, lcol := "", uint32(colMuted)
	switch {
	case cur.traffic:
		left, lcol = st.T(fmt.Sprintf("Car ahead %.1f s · brake %d m earlier", cur.trafficDt, int(math.Round(cur.early))), fmt.Sprintf("Coche delante a %.1f s · frena %d m antes", cur.trafficDt, int(math.Round(cur.early)))), colWarn
	case cur.side && cur.early > 0:
		left, lcol = st.T(fmt.Sprintf("Car alongside · brake %d m earlier", int(math.Round(cur.early))), fmt.Sprintf("Coche al lado · frena %d m antes", int(math.Round(cur.early)))), colWarn
	case math.Abs(cur.fast) >= 5 && cur.fast > 0:
		left = st.T(fmt.Sprintf("Faster than the reference · %d m earlier", int(math.Round(cur.fast))), fmt.Sprintf("Más rápido que la referencia · %d m antes", int(math.Round(cur.fast))))
	case math.Abs(cur.fast) >= 5:
		left = st.T(fmt.Sprintf("Slower than the reference · %d m later", int(math.Round(-cur.fast))), fmt.Sprintf("Más lento que la referencia · %d m después", int(math.Round(-cur.fast))))
	case B.src == "model":
		left = st.T("From the model: the driver just ahead", "Del modelo: el piloto justo por delante")
	default:
		left = st.T("From your best lap", "De tu mejor vuelta")
	}
	fw := textW(sf, fbTxt)
	c.text(sf, ellipsis(sf, left, W-2*pad-fw-12*z), pad, y+8*z, lcol, 1, 0)
	if fbTxt != "" {
		c.text(sf, fbTxt, W-pad, y+8*z, fbCol, 1, 1)
	}
	return int(math.Ceil(H))
}

// ---------- coach (the app's coachCompare: corner by corner against your best lap) ----------

type coachTip struct {
	n      int
	d      float64 // where the corner's braking starts (m from the line): its official turn
	lost   float64
	en, es string
}

// coachTips: your last lap against the reference: the model's next level (the real lap of the driver just ahead)
// when it is faster than your best, else your best lap of the session; the name of the reference comes too
func (st *ovState) coachTips() ([]coachTip, string) {
	E := &st.ext
	if len(E.laps) < 1 {
		return nil, ""
	}
	A := E.laps[len(E.laps)-1]
	R := st.bestLap(nil)
	if R == A {
		R = st.bestLap(A)
	}
	st.loadModelRef()
	ref := st.T("vs your best lap", "vs tu mejor vuelta")
	if m := E.modelRef; m != nil && m.time < A.time-0.001 && (R == nil || m.time < R.time-0.001) {
		R, ref = m, st.T("vs the driver just ahead", "vs el piloto justo por delante")
	}
	if R == nil || R == A {
		return nil, ""
	}
	return st.compareLaps(A, R, 3), ref
}

// compareLaps: lap A corner by corner against the reference R, the corners that lose the most first (max of them)
func (st *ovState) compareLaps(A, R *ovLap, max int) []coachTip {
	sa, sb := A.series(), R.series()
	zb, za := brakeZones(sb), brakeZones(sa)
	n := len(sa)
	if len(sb) < n {
		n = len(sb)
	}
	T := func(s []*lapPt, i int) float64 { return s[i][1] }
	ok := func(s []*lapPt, i int) bool { return i >= 0 && i < len(s) && s[i] != nil }
	seg := func(x, y int) float64 {
		if x < y && ok(sa, x) && ok(sa, y) && ok(sb, x) && ok(sb, y) {
			return (T(sa, y) - T(sa, x)) - (T(sb, y) - T(sb, x))
		}
		return 0
	}
	peak := func(s []*lapPt, x, y int) (float64, int) {
		p, ip := 0.0, x
		for k := x; k <= y && k < len(s); k++ {
			if s[k] != nil && s[k][3] > p {
				p, ip = s[k][3], k
			}
		}
		return p, ip
	}
	release := func(s []*lapPt, from, to int) int {
		for k := from; k <= to && k < len(s); k++ {
			if s[k] != nil && s[k][3] < .05 {
				return k
			}
		}
		return to
	}
	coast := func(s []*lapPt, x, y int) float64 {
		c := 0
		for k := x; k <= y && k < len(s); k++ {
			if s[k] != nil && s[k][2] < .05 && s[k][3] < .05 {
				c++
			}
		}
		return float64(c) * ovLapBin
	}
	pickup := func(s []*lapPt, from, to int) (int, bool) {
		for k := from; k <= to && k < len(s); k++ {
			if s[k] != nil && s[k][2] > .5 {
				return k, true
			}
		}
		return 0, false
	}
	r := func(v float64) int { return int(math.Round(v)) }
	gearAt := func(s []*lapPt, i int) int {
		if ok(s, i) {
			return int(math.Round(s[i][4]))
		}
		return 0
	}
	// throttle lifts after the apex: back off from over 80 % to under 50 % (wheelspin, a nervous exit)
	lifts := func(s []*lapPt, from, to int) int {
		n, prev := 0, -1.0
		for k := from; k <= to && k < len(s); k++ {
			if s[k] == nil {
				continue
			}
			if prev >= 0 && prev > .8 && s[k][2] < .5 {
				n++
			}
			prev = s[k][2]
		}
		return n
	}
	// steering corrections: the wheel changing direction inside the corner
	reversals := func(s []*lapPt, from, to int) (int, bool) {
		n, prevD, last, has := 0, 0.0, math.NaN(), false
		for k := from; k <= to && k < len(s); k++ {
			if s[k] == nil {
				continue
			}
			v := s[k][5]
			if v != 0 {
				has = true
			}
			if !math.IsNaN(last) {
				if d := v - last; math.Abs(d) > .004 {
					if prevD != 0 && (d > 0) != (prevD > 0) {
						n++
					}
					prevD = d
				}
			}
			last = v
		}
		return n, has
	}
	lat := lineOffsets(A.x, A.y, R.x, R.y) // the line, when both laps carry their path
	var out []coachTip
	for k, z := range zb {
		// the same corner: the nearest braking point within 100 m
		mi := -1
		for j, q := range za {
			if int(math.Abs(float64(q.i-z.i))) <= 20 && (mi < 0 || math.Abs(float64(q.i-z.i)) < math.Abs(float64(za[mi].i-z.i))) {
				mi = j
			}
		}
		i0, i1 := max0(z.i-10), z.imin+30
		if i1 > n-1 {
			i1 = n - 1
		}
		if !ok(sa, i0) || !ok(sa, i1) || !ok(sb, i0) || !ok(sb, i1) {
			continue
		}
		lost := (T(sa, i1) - T(sa, i0)) - (T(sb, i1) - T(sb, i0))
		if lost <= .03 {
			continue
		}
		var dd, dmin float64
		hasM := mi >= 0
		if hasM {
			m := za[mi]
			dd = float64(m.i-z.i) * ovLapBin
			dmin = st.spd(m.vmin) - st.spd(z.vmin)
		}
		pb, ipb := peak(sb, z.i, z.imin)
		rel := release(sb, ipb, z.imin)
		if rel > z.imin {
			rel = z.imin
		}
		a0, a1 := rel, z.imin+4
		if z.imin-4 > a0 {
			a0 = z.imin - 4
		}
		if a1 > i1 {
			a1 = i1
		}
		ph := []struct {
			k string
			v float64
		}{{"brake", seg(i0, rel)}, {"entry", seg(rel, a0)}, {"apex", seg(a0, a1)}, {"exit", seg(a1, i1)}}
		sort.SliceStable(ph, func(a, b int) bool { return ph[a].v > ph[b].v })
		var pa, trailA float64
		hasTrail := false
		if hasM {
			m := za[mi]
			var ipa int
			pa, ipa = peak(sa, m.i, m.imin)
			trailA, hasTrail = float64(release(sa, ipa, m.imin)-ipa)*ovLapBin, true
		}
		trailB := float64(rel-ipb) * ovLapBin
		coastA, coastB := coast(sa, i0, i1), coast(sb, i0, i1)
		late, hasLate := 0.0, false
		if hasM {
			if puA, okA := pickup(sa, za[mi].imin, i1); okA {
				if puB, okB := pickup(sb, z.imin, i1); okB {
					late, hasLate = float64(puA-puB)*ovLapBin, true
				}
			}
		}
		var en, es string
		switch ph[0].k {
		case "brake":
			switch {
			case hasM && dd < -6:
				en, es = fmt.Sprintf("Brake %d m later", r(-dd)), fmt.Sprintf("Frena %d m más tarde", r(-dd))
			case hasM && pa < pb-.1:
				en, es = fmt.Sprintf("Brake harder at first (%d%% vs %d%%)", r(pa*100), r(pb*100)), fmt.Sprintf("Pisa más fuerte al empezar a frenar (%d %% frente a %d %%)", r(pa*100), r(pb*100))
			case hasM && dd > 6:
				en, es = fmt.Sprintf("You braked %d m too late and lost the corner: brake earlier", r(dd)), fmt.Sprintf("Frenaste %d m demasiado tarde y perdiste la curva: frena antes", r(dd))
			default:
				en, es = "Brake a little later and harder", "Frena un poco más tarde y más fuerte"
			}
		case "entry":
			switch {
			case hasTrail && trailB-trailA >= 15:
				en, es = fmt.Sprintf("Release the brake more gradually into the turn (trail braking: %d m vs %d m)", r(trailA), r(trailB)), fmt.Sprintf("Suelta el freno más progresivamente al entrar (trail braking: %d m frente a %d m)", r(trailA), r(trailB))
			case coastA-coastB >= 10:
				en, es = fmt.Sprintf("Do not coast before the apex: %d m without throttle or brake (reference %d m)", r(coastA), r(coastB)), fmt.Sprintf("No vayas sin gas ni freno antes del vértice: %d m (referencia %d m)", r(coastA), r(coastB))
			default:
				en, es = "Carry more speed into the turn", "Entra con más velocidad en la curva"
			}
		case "apex":
			if hasM && dmin < -2 {
				en, es = fmt.Sprintf("Carry %d %s more through the apex", r(-dmin), st.spdU()), fmt.Sprintf("Pasa %d %s más rápido por el vértice", r(-dmin), st.spdU())
			} else {
				en, es = "A rounder, faster line through the apex", "Una trazada más redonda y rápida por el vértice"
			}
		default:
			switch {
			case hasLate && late >= 8:
				en, es = fmt.Sprintf("Get on the throttle %d m earlier", r(late)), fmt.Sprintf("Acelera %d m antes", r(late))
			case coastA-coastB >= 10:
				en, es = "Do not wait between the brake and the throttle", "No esperes entre el freno y el acelerador"
			default:
				en, es = "Full throttle sooner on exit", "Acelerador a fondo antes a la salida"
			}
		}
		// a generic tip gives way to what the data shows plainly: the gear through the corner, lifts on the exit,
		// corrections of the wheel
		generic := en == "Brake a little later and harder" || en == "Carry more speed into the turn" || en == "A rounder, faster line through the apex" || en == "Full throttle sooner on exit"
		if generic {
			apexA := z.imin
			if hasM {
				apexA = za[mi].imin
			}
			gA, gB := gearAt(sa, apexA), gearAt(sb, z.imin)
			lA, lB := lifts(sa, apexA, i1), lifts(sb, z.imin, i1)
			rA, hasA := reversals(sa, i0, i1)
			rB, hasB := reversals(sb, i0, i1)
			switch {
			case gA >= 1 && gB >= 1 && gB > gA:
				en, es = fmt.Sprintf("Take this corner in gear %d like the reference (you use gear %d)", gB, gA), fmt.Sprintf("Toma esta curva en %dª como la referencia (tú vas en %dª)", gB, gA)
			case gA >= 1 && gB >= 1 && gB < gA:
				en, es = fmt.Sprintf("Drop to gear %d for the apex like the reference (you stay in gear %d)", gB, gA), fmt.Sprintf("Baja a %dª en el vértice como la referencia (tú te quedas en %dª)", gB, gA)
			case ph[0].k == "exit" && lA >= 2 && lA > lB+1:
				en, es = fmt.Sprintf("Smoother throttle on exit: you lifted %d times after the apex (reference %d)", lA, lB), fmt.Sprintf("Acelera más progresivo a la salida: levantaste %d veces tras el vértice (referencia %d)", lA, lB)
			case hasA && hasB && rA >= 3 && rA > rB+2:
				en, es = fmt.Sprintf("%d steering corrections in this corner (reference %d): turn in once, smoothly", rA, rB), fmt.Sprintf("%d correcciones de volante en esta curva (referencia %d): gira una vez, suave", rA, rB)
			}
		}
		// the line: where the car was across the track. A lap that brakes at the reference's point but on the wrong
		// part of the track hears that first; otherwise it follows the tip of the phase
		if lat != nil {
			if le, la, lx, okL := cornerLine(lat, R.x, R.y, z.i, z.imin); okL {
				generic := en == "Brake a little later and harder" || en == "Carry more speed into the turn" || en == "A rounder, faster line through the apex" || en == "Full throttle sooner on exit"
				if ln, ls := lineTip(le, la, lx, hasM && math.Abs(dd) <= 6); ln != "" {
					if generic || (ph[0].k == "brake" && hasM && math.Abs(dd) <= 6) {
						en, es = ln, ls
					} else {
						en, es = en+". "+ln, es+". "+ls
					}
				}
			}
		}
		out = append(out, coachTip{n: k + 1, d: float64(z.i) * ovLapBin, lost: lost, en: en, es: es})
	}
	sort.SliceStable(out, func(a, b int) bool { return out[a].lost > out[b].lost })
	if len(out) > max {
		out = out[:max]
	}
	return out
}

func drawCoachOv(c *ovCanvas, st *ovState, z float64) int {
	W := float64(c.w)
	pad := 14 * z
	tips, ref := st.coachTips()
	rowH := 34 * z
	rows := len(tips)
	if rows == 0 {
		rows = 1
	}
	H := pad + 18*z + float64(rows)*rowH + pad - 4*z
	panel(c, H, z)
	c.label(z, st.T("Coach", "Coach"), pad, pad+6*z, 0)
	if ref != "" {
		c.labelFit(z, ref, W/2, pad+6*z, W/2-pad)
	}
	y := pad + 18*z
	nf := ovFace(fkBody, 13.5*z)
	if len(tips) == 0 {
		msg := st.T("Your last lap loses nothing clear against the reference: keep it up.", "Tu última vuelta no pierde nada claro frente a la referencia: sigue así.")
		if ref == "" {
			msg = st.T("Tips appear after your second lap (or your first, once the model knows a faster driver).", "Los consejos aparecen tras tu segunda vuelta (o la primera, si el modelo conoce a un piloto más rápido).")
		}
		c.text(nf, ellipsis(nf, msg, W-2*pad), pad, y+rowH/2, colMuted, 1, 0)
		return int(math.Ceil(H))
	}
	cf, vf := ovFace(fkDataB, 11*z), ovFace(fkData, 13.5*z)
	for k, t := range tips {
		if k > 0 {
			c.rect(pad, y, W-2*pad, 1, colLine, 1)
		}
		cn := st.turnName(t.d, t.n)
		cw := textW(cf, cn) + 12*z
		c.roundRect(pad, y+rowH/2-10*z, cw, 20*z, 5*z, colSurf2, 1, colLine, 1, 1)
		c.text(cf, cn, pad+cw/2, y+rowH/2, colText, 1, 2)
		ls := signed(t.lost, 2)
		lw := textW(vf, ls)
		c.text(vf, ls, W-pad, y+rowH/2, colBad, 1, 1)
		tip := st.T(t.en, t.es)
		c.text(nf, ellipsis(nf, tip, W-2*pad-cw-lw-24*z), pad+cw+10*z, y+rowH/2, colText, 1, 0)
		y += rowH
	}
	return int(math.Ceil(H))
}

// ---------- radio: the questions to the engineer, as buttons ----------

var ovRadioAsks = [][3]string{{"weather", "Weather", "Tiempo"}, {"fuel", "Fuel", "Gasolina"}, {"gaps", "Gaps", "Gaps"}, {"position", "Position", "Posición"},
	{"last", "Last lap", "Última vuelta"}, {"remaining", "How long left", "Cuánto queda"}, {"pit", "Pit stop", "Parada"}, {"incidents", "Incidents", "Incidentes"},
	{"delta", "Delta", "Delta"}, {"mute", "Quiet / talk", "Callar / hablar"}}

func drawRadioOv(c *ovCanvas, st *ovState, z float64, now time.Time) int {
	W := float64(c.w)
	pad := 14 * z
	cols := 2
	bh, gap := 38*z, 8*z
	rows := (len(ovRadioAsks) + cols - 1) / cols
	H := pad + 18*z + float64(rows)*bh + float64(rows-1)*gap + pad
	panel(c, H, z)
	c.label(z, st.T("Radio", "Radio"), pad, pad+6*z, 0)
	bw := (W - 2*pad - gap) / float64(cols)
	bf := ovFace(fkBodyB, 13.5*z)
	st.ext.buttons = st.ext.buttons[:0]
	for k, a := range ovRadioAsks {
		x, y := pad+float64(k%cols)*(bw+gap), pad+18*z+float64(k/cols)*(bh+gap)
		on := st.ext.pressed == a[0] && now.Sub(st.ext.pressAt) < 600*time.Millisecond
		if on {
			c.roundRect(x, y, bw, bh, 8*z, colAmber, 0.25, colAmber, 1, 1.5*z)
		} else {
			c.roundRect(x, y, bw, bh, 8*z, colSurf2, 1, colLine, 1, 1)
		}
		c.text(bf, ellipsis(bf, st.T(a[1], a[2]), bw-16*z), x+bw/2, y+bh/2, colText, 1, 2)
		st.ext.buttons = append(st.ext.buttons, ovButton{x, y, bw, bh, a[0]})
	}
	return int(math.Ceil(H))
}

// ovClickable: the native overlays that take clicks when the overlays are not being moved (the radio's buttons)
func ovClickable(name string) bool { return name == "radio" }

// ovClick handles a click at x, y (window pixels): a radio button asks the engineer through the PC
func ovClick(name string, st *ovState, x, y float64) {
	if name != "radio" {
		return
	}
	st.mu.Lock()
	q := ""
	for _, b := range st.ext.buttons {
		if x >= b.x && x < b.x+b.w && y >= b.y && y < b.y+b.h {
			q = b.q
		}
	}
	if q != "" {
		st.ext.pressed, st.ext.pressAt = q, time.Now()
	}
	cl, base := st.client, st.base
	st.mu.Unlock()
	if q == "" || cl == nil {
		return
	}
	go func() {
		r, err := cl.Post(base+"/api/radio/ask?q="+url.QueryEscape(q), "text/plain", nil)
		if err == nil {
			r.Body.Close()
		}
	}()
}
