package main

// Native overlays, fourth part: the ones that need laps or the track (track map, live compare, braking markers,
// coach). Each window records the laps it sees, every 5 m, like the app, and gets the track's outline and the
// model's reference lap from the PC.

import (
	"encoding/json"
	"fmt"
	"math"
	"sort"
	"strconv"
	"strings"
	"time"

	"golang.org/x/image/font"
)

func lapOverlay(name string) bool {
	switch name {
	case "map", "compare", "brakes", "coach":
		return true
	}
	return false
}

// the values the lap recorder needs (the app's recordLap)
var recVars = []string{"LapDist", "LapCompleted", "LapCurrentLapTime", "IsOnTrack", "Speed", "Throttle", "Brake", "Gear", "SteeringWheelAngle", "RPM", "Lap", "LapLastLapTime", "OnPitRoad", "LapBestLapTime", "PlayerTireCompound"}

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
	pit    bool      // it went through the pit lane (an out-lap or an in-lap): never the reference
	drv    string    // DRINKS mode: who drove most of it ("" the owner)
}

type ovRec struct {
	lc, lap, cnt, maxBin int
	bins                 []*lapPt
	t, ld, lt            float64
	hasLd                bool
	pv                   lapPt
	started, pit         bool
	drv                  map[string]int // DRINKS mode: the samples each driver drove
}

type ovExtra struct {
	notes    map[string]*driverNote // your notes on drivers (drivers.json), from the PC every 15 s
	notesAt  time.Time
	rec      ovRec
	laps     []*ovLap
	pending  *ovLap // a lap just finished: its time comes with the next frames (LapLastLapTime)
	pendAt   time.Time
	mapKey   string
	mapLayer mapLayer // the map overlay's still part, drawn once per window size and track
	mapX     []float64
	mapY     []float64
	turnsKey string
	turns    []float64 // the track's official turns (T1 … Tn), as fractions of the lap
	modelKey string
	modelRef *ovLap
	modelAt  time.Time
	modelCor []ovCorner // the model's corner card: where the fastest drivers brake and how fast they take each corner
	coach    ovCoachState
	bm       bmState
	drinks   bool   // DRINKS mode is on (the PC's "driver" event)
	driver   string // who drives now ("" the owner)
}

// collectLaps records the laps this window sees; st.mu is held
func (st *ovState) collectLaps() {
	E := &st.ext
	f := func(n string) float64 { v, _ := st.num(n); return v }
	// iRacing updates the last lap time a moment after the line (the race recorder waits 1.5 s too): read too early,
	// LapLastLapTime is still the lap before, and a slow lap would take a fast lap's time and become the "best"
	if E.pending != nil && time.Since(E.pendAt) > 1500*time.Millisecond {
		E.pending.time = lapTimeOf(f("LapLastLapTime"), E.pending.time)
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
	onPit := f("OnPitRoad") != 0
	if !R.started || lc != R.lc {
		if R.started && lc == R.lc+1 && R.cnt > 0 && float64(R.cnt)/float64(R.maxBin+1) > .9 {
			E.pending, E.pendAt = &ovLap{n: R.lap, time: R.t, bins: R.bins, maxBin: R.maxBin, pit: R.pit, drv: topOf(R.drv)}, time.Now()
		}
		*R = ovRec{lc: lc, lap: int(f("Lap")), started: true}
	}
	if onPit {
		R.pit = true
	}
	if R.drv == nil {
		R.drv = map[string]int{}
	}
	R.drv[E.driver]++
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

// lapTimeOf: a finished lap's time: the game's LapLastLapTime when it is this lap's (within 1.5 s of the time the
// recorder saw at the line), else the recorder's own (the game's still showed the lap before, or none)
func lapTimeOf(gameLast, seen float64) float64 {
	if gameLast > 0 && (seen <= 0 || math.Abs(gameLast-seen) < 1.5) {
		return gameLast
	}
	return seen
}

// topOf: who drove most of a lap ("" the owner, also when nobody was counted)
func topOf(m map[string]int) string {
	best, n := "", -1
	for k, c := range m {
		if c > n || (c == n && k < best) {
			best, n = k, c
		}
	}
	return best
}

// bestLap: the reference of the live compare and the coach: the lap the game itself counts as your best
// (LapBestLapTime, a valid lap) when this window recorded it, else the fastest recorded lap that did not go
// through the pits. In DRINKS mode only the laps of who is driving now: each driver against their own
func (st *ovState) bestLap(except *ovLap) *ovLap {
	gb, _ := st.num("LapBestLapTime")
	var best *ovLap
	for _, l := range st.ext.laps {
		if l == except || l.pit || l.time <= 0 || (st.ext.drinks && l.drv != st.ext.driver) {
			continue
		}
		if gb > 0 && math.Abs(l.time-gb) < 0.02 {
			return l
		}
		if best == nil || l.time < best.time {
			best = l
		}
	}
	return best
}

// ownDelta: the current lap against the driver's own best lap recorded here, at the same point of the lap
func (st *ovState) ownDelta() (float64, bool) {
	b := st.bestLap(nil)
	d, ok1 := st.num("LapDist")
	t, ok2 := st.num("LapCurrentLapTime")
	if b == nil || !ok1 || !ok2 || d < 20 {
		return 0, false
	}
	r, ok := timeAt(b.series(), d)
	if !ok {
		return 0, false
	}
	return t - r, true
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
			if st.fetchJSON("/api/trackmap?trackId="+strconv.Itoa(tid), &c) && len(c.X) > 10 && len(c.X) == len(c.Y) {
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
		if st.fetchJSON("/api/turns?trackId="+strconv.Itoa(tid), &d) {
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
	// the tyres on the car: the model's references of the same compound when it has them apart (0 the first, or the only one)
	cmp := 0
	if v, ok := st.num("PlayerTireCompound"); ok && v > 0 {
		cmp = int(v)
	}
	key := fmt.Sprintf("%d:%d:%.1f:%d", st.ses.TrackID, car, best, cmp)
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
			Corners []ovCorner `json:"corners"`
		}
		if !st.fetchJSON(fmt.Sprintf("/api/community/model?trackId=%d&carId=%d&game=iracing&cmp=%d", tid, car, cmp), &m) || len(m.Ladder) == 0 {
			return
		}
		st.mu.Lock()
		st.ext.modelCor = m.Corners
		st.mu.Unlock()
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
	}
	return 0
}

func drawMapOv(c *ovCanvas, st *ovState, z float64) int {
	W, H := float64(c.w), float64(c.h)
	st.loadMap()
	X, Y := st.ext.mapX, st.ext.mapY
	nf := ovFace(fkBody, 13*z)
	if len(X) < 10 {
		panel(c, H, z)
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
	st.loadTurns()
	// the panel, the track, its line, arrow, sectors and turns change only with the window or the track: drawn once,
	// then copied under the cars every frame (the same pixels)
	key := mapLayerKey{w: c.w, h: c.h, z: z, x: &X[0], y: &Y[0], n: N, ny: len(Y), ses: st.ses, turns: st.ext.turns}
	if L := &st.ext.mapLayer; L.ok && L.key.same(key) && len(L.px) == len(c.px) {
		copy(c.px, L.px)
	} else {
		panel(c, H, z)
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
		// the sectors: a short bar across the track where each one starts (the first is the line)
		if len(st.ses.Sectors) >= 2 {
			sf := ovFace(fkData, 9*z)
			for k, f := range st.ses.Sectors[1:] {
				i := int(math.Floor(f*float64(N))) % N
				i0, i1 := (i-2+N)%N, (i+2)%N
				x0, y0 := P(X[i0], Y[i0])
				x1, y1 := P(X[i1], Y[i1])
				a := math.Atan2(y1-y0, x1-x0) + math.Pi/2
				px, py := P(X[i], Y[i])
				c.line(px+math.Cos(a)*8*z, py+math.Sin(a)*8*z, px-math.Cos(a)*8*z, py-math.Sin(a)*8*z, 2*z, colMuted, 0.9)
				c.text(sf, "S"+strconv.Itoa(k+2), px-math.Cos(a)*14*z, py-math.Sin(a)*14*z, colMuted, 0.9, 2)
			}
		}
		// the official turns, numbered on the outside of the track
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
		L.key, L.px, L.ok = key, append(L.px[:0], c.px...), true
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
	ton, th := st.titleOn("compare"), st.titleH("compare", z)
	W := float64(c.w)
	pad := 14 * z
	cfg := st.uiMap("cmp")
	ch, follow := uiStr(cfg, "ch", "speed"), uiBool(cfg, "follow", false)
	plotH := 200 * z
	H := pad + th + 24*z + plotH + pad
	panel(c, H, z)
	title := st.T("Live compare", "Comparación en vivo")
	for _, x := range cmpChannels {
		if x.k == ch {
			title += " · " + st.T(x.en, x.es)
		}
	}
	if ton {
		c.label(z, title, pad, pad+6*z, 0)
	}
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
	y := pad + th
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
		t, _ := st.num("LapCurrentLapTime") // -1 while the game does not time this lap (an out lap)
		if r, ok := timeAt(bs, curD); ok && curD > 20 && t > 0 {
			d := t - r
			nowS, nowC = signed(d, 2), colBad
			if d <= 0 {
				nowC = colGood
			}
		}
	}
	item(st.T("Now", "Ahora"), nowS, colAmber, nowC)
	top := pad + th + 24*z
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

// ---------- braking markers (the app's brakeTick; no beeps: the rev beep is the one that sounds) ----------

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
	ton, th := st.titleOn("brakes"), st.titleH("brakes", z)
	W := float64(c.w)
	pad := 14 * z
	st.bmTick()
	B := &st.ext.bm
	H := pad + th + 44*z + 14*z + 12*z + 22*z + pad
	panel(c, H, z)
	if ton {
		c.label(z, st.T("Braking markers", "Marcas de frenada"), pad, pad+6*z, 0)
	}
	nf := ovFace(fkBody, 13*z)
	y := pad + th
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
	d      float64 // where the corner's braking starts (m from the line)
	apex   float64 // the corner's slowest point (m from the line): its official turn
	lost   float64
	en, es string
	cueEn  string // two or three words for the big style ("BRAKE EARLIER")
	cueEs  string
	dd     float64 // metres A brakes after the reference (negative: before), when hasDd
	hasDd  bool
}

// coachCue: the tip in two or three words, for the big style of the coach overlay (read in a glance, in VR too)
func coachCue(en string) (string, string) {
	has := func(x string) bool { return strings.Contains(en, x) }
	switch {
	case strings.HasPrefix(en, "You brake ") && has("later than the reference"), has("too late"):
		return "BRAKE EARLIER", "FRENA ANTES"
	case strings.HasPrefix(en, "Brake ") && has("m later"):
		return "BRAKE LATER", "FRENA MÁS TARDE"
	case has("Brake harder"), has("Brake hard at once"):
		return "BRAKE HARDER", "FRENA MÁS FUERTE"
	case has("trail braking"), has("release the brake"):
		return "EASE OFF THE BRAKE", "SUELTA SUAVE"
	case has("coast"), has("Do not wait"):
		return "NO COASTING", "SIN ESPERAR"
	case has("inside"), has("outside"), has("line"):
		return "WATCH THE LINE", "OJO A LA TRAZADA"
	case has("gear"):
		return "OTHER GEAR", "OTRA MARCHA"
	case has("throttle") && (has("earlier") || has("sooner")):
		return "THROTTLE SOONER", "GAS ANTES"
	case has("throttle"):
		return "SMOOTH THROTTLE", "GAS SUAVE"
	case has("apex"), has("speed"):
		return "MORE SPEED", "MÁS VELOCIDAD"
	case has("steering"):
		return "ONE SMOOTH TURN", "GIRA SUAVE"
	}
	return "", ""
}

// cornerZone: a corner of the reference lap for the coach (cornerZones)
type cornerZone struct {
	i, imin int
	v, vmin float64
	turn    int  // the track's turn (0-based) it is, -1 when the track has no turns
	lift    bool // taken without braking (a lift): no braking phase to speak of
}

// cornerZones: the reference's corners, like the web's cornerZones (index.html) and the phones' (LapMath): its braking
// zones, each named by the track's turn (the official ones, or the ones the layout's geometry gives through /api/turns) so
// two brake applications in one corner are one corner, plus the turns the reference takes without braking (a lift, a fast
// corner) as corners of their own; without turns, the braking zones as they are. st.mu is held.
func (st *ovState) cornerZones(sb []*lapPt, n int) []cornerZone {
	zb := brakeZones(sb)
	t := st.ext.turns
	if len(t) == 0 || n <= 0 {
		out := make([]cornerZone, 0, len(zb))
		for _, z := range zb {
			out = append(out, cornerZone{z.i, z.imin, z.v, z.vmin, -1, false})
		}
		return out
	}
	ap := make([]int, 0, len(t))
	for _, f := range t {
		if i := int(math.Round(f * float64(n))); i > 0 && i < n-1 {
			ap = append(ap, i)
		}
	}
	near := func(i int) int { // the turn whose apex is within 150 m
		b, bd := -1, 1<<30
		for k, a := range ap {
			if d := int(math.Abs(float64(a - i))); d < bd {
				bd, b = d, k
			}
		}
		if bd <= 30 {
			return b
		}
		return -1
	}
	byTurn := map[int]*cornerZone{}
	var out []cornerZone
	for _, z := range zb {
		k := near(z.imin)
		if k < 0 {
			out = append(out, cornerZone{z.i, z.imin, z.v, z.vmin, -1, false})
			continue
		}
		if o := byTurn[k]; o != nil {
			if z.vmin < o.vmin {
				o.vmin, o.imin = z.vmin, z.imin
			}
			o.i, o.v = min(o.i, z.i), math.Max(o.v, z.v)
			continue
		}
		byTurn[k] = &cornerZone{z.i, z.imin, z.v, z.vmin, k, false}
	}
	// a turn the reference takes without braking: from where it lifts (its last full throttle before the apex, or 100 m
	// before) to its slowest point, when it really slows
	for k, a := range ap {
		if byTurn[k] != nil {
			continue
		}
		i0 := max0(a - 20)
		for i := a; i > max0(a-40); i-- {
			if ok := i < len(sb) && sb[i] != nil; ok && sb[i][2] > .9 {
				i0 = i
				break
			}
		}
		if i0 >= len(sb) || sb[i0] == nil || a >= len(sb) || sb[a] == nil {
			continue
		}
		imin, vmin := a, sb[a][0]
		for i := i0; i < n && i < a+10 && i < len(sb); i++ {
			if sb[i] != nil && sb[i][0] < vmin {
				vmin, imin = sb[i][0], i
			}
		}
		if v := sb[i0][0]; v-vmin > 2 {
			byTurn[k] = &cornerZone{i0, imin, v, vmin, k, true}
		}
	}
	for _, z := range byTurn {
		out = append(out, *z)
	}
	sort.Slice(out, func(a, b int) bool { return out[a].i < out[b].i })
	return out
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
	n := len(sa)
	if len(sb) < n {
		n = len(sb)
	}
	zb, za := st.cornerZones(sb, n), brakeZones(sa)
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
		if z.lift && ph[0].k == "brake" { // a corner taken without braking has no braking phase to speak of
			ph[0].k = "entry"
		}
		// how the throttle is opened after the apex: metres from picking it up (5 %) to full (95 %), and the wheel's corrections
		ramp := func(sx []*lapPt, from, to int) (float64, bool) {
			a := -1
			for k := from; k <= to && k < len(sx); k++ {
				if sx[k] == nil {
					continue
				}
				if a < 0 && sx[k][2] > .05 {
					a = k
				}
				if a >= 0 && sx[k][2] > .95 {
					return float64(k-a) * ovLapBin, true
				}
			}
			return 0, false
		}
		rampA, okRA := 0.0, false
		if hasM {
			rampA, okRA = ramp(sa, za[mi].imin, i1)
		}
		rampB, okRB := ramp(sb, z.imin, i1)
		revA, _ := reversals(sa, i0, i1)
		revB, _ := reversals(sb, i0, i1)
		var en, es string
		if hasM && dd > 6 && dmin < -2 {
			// braking later than the reference and arriving slower at the apex is one mistake, whatever phase pays for it
			en = fmt.Sprintf("You brake %d m later than the reference and lose %d %s at the apex. Brake a little earlier and carry the speed", r(dd), r(-dmin), st.spdU())
			es = fmt.Sprintf("Frenas %d m más tarde que la referencia y pierdes %d %s en el vértice. Frena un poco antes y conserva la velocidad", r(dd), r(-dmin), st.spdU())
		} else {
			switch ph[0].k {
			case "brake":
				switch {
				case hasM && dd < -6:
					en, es = fmt.Sprintf("Brake %d m later", r(-dd)), fmt.Sprintf("Frena %d m más tarde", r(-dd))
				case hasM && pa < pb-.05:
					en, es = fmt.Sprintf("Brake harder at first (%d%% vs %d%%)", r(pa*100), r(pb*100)), fmt.Sprintf("Pisa más fuerte al empezar a frenar (%d %% frente a %d %%)", r(pa*100), r(pb*100))
				case hasM && dd > 6:
					en, es = fmt.Sprintf("You braked %d m too late and lost the corner. Brake earlier", r(dd)), fmt.Sprintf("Frenaste %d m demasiado tarde y perdiste la curva. Frena antes", r(dd))
				case hasTrail && trailB-trailA >= 15:
					en, es = fmt.Sprintf("Release the brake more gradually into the turn (trail braking. %d m vs %d m)", r(trailA), r(trailB)), fmt.Sprintf("Suelta el freno más progresivamente al entrar (trail braking. %d m frente a %d m)", r(trailA), r(trailB))
				case hasM:
					en, es = "Same braking point, slower through the braking zone. Brake hard at once, then release progressively", "Mismo punto de frenada, pero más lento en la frenada. Pisa fuerte de golpe y suelta progresivamente"
				default:
					en, es = "Brake a little later and harder", "Frena un poco más tarde y más fuerte"
				}
			case "entry":
				switch {
				case hasTrail && trailB-trailA >= 15:
					en, es = fmt.Sprintf("Release the brake more gradually into the turn (trail braking. %d m vs %d m)", r(trailA), r(trailB)), fmt.Sprintf("Suelta el freno más progresivamente al entrar (trail braking. %d m frente a %d m)", r(trailA), r(trailB))
				case coastA-coastB >= 10:
					en, es = fmt.Sprintf("Do not coast before the apex. %d m without throttle or brake (reference %d m)", r(coastA), r(coastB)), fmt.Sprintf("No vayas sin gas ni freno antes del vértice. %d m (referencia %d m)", r(coastA), r(coastB))
				case hasM && dmin >= 0:
					en, es = "You reach the apex as fast as the reference. The time goes before it, so release the brake more gradually as you turn in", "Llegas al vértice tan rápido como la referencia. El tiempo se va antes, suelta el freno más progresivamente al girar"
				default:
					en, es = "Carry more speed into the turn", "Entra con más velocidad en la curva"
				}
			case "apex":
				switch {
				case hasM && dmin < -2:
					en, es = fmt.Sprintf("Carry %d %s more through the apex", r(-dmin), st.spdU()), fmt.Sprintf("Pasa %d %s más rápido por el vértice", r(-dmin), st.spdU())
				case hasM && dmin >= 0:
					en, es = "As fast at the slowest point, but slow for longer. Shorten the slow part of the corner (turn in later, later apex)", "Igual de rápido en el punto más lento, pero lento durante más metros. Acorta la parte lenta de la curva (gira más tarde, vértice más tardío)"
				default:
					en, es = "A rounder, faster line through the apex", "Una trazada más redonda y rápida por el vértice"
				}
			default:
				switch {
				case hasLate && late >= 8:
					en, es = fmt.Sprintf("Get on the throttle %d m earlier", r(late)), fmt.Sprintf("Acelera %d m antes", r(late))
				case okRA && okRB && rampB-rampA >= 15 && hasM && (lifts(sa, za[mi].imin, i1) > lifts(sb, z.imin, i1) || revA > revB+1):
					en, es = fmt.Sprintf("You open the throttle faster than the reference and then have to correct. Open it more progressively (%d m to full vs %d m)", r(rampA), r(rampB)), fmt.Sprintf("Abres el gas más rápido que la referencia y luego tienes que corregir. Ábrelo más progresivo (%d m hasta el fondo frente a %d m)", r(rampA), r(rampB))
				case okRA && okRB && rampA-rampB >= 15:
					en, es = fmt.Sprintf("You take %d m to reach full throttle (reference %d m). Squeeze it to full sooner", r(rampA), r(rampB)), fmt.Sprintf("Tardas %d m en llegar a fondo (referencia %d m). Llega al 100 %% antes", r(rampA), r(rampB))
				case coastA-coastB >= 10:
					en, es = "Do not wait between the brake and the throttle", "No esperes entre el freno y el acelerador"
				case hasLate && late <= -8 && hasM && dmin < -1:
					en, es = fmt.Sprintf("You pick up the throttle %d m earlier but leave the apex %d %s slower. Carry the speed through the apex, the exit follows", r(-late), r(-dmin), st.spdU()), fmt.Sprintf("Aceleras %d m antes pero sales del vértice %d %s más lento. Conserva la velocidad en el vértice y la salida vendrá sola", r(-late), r(-dmin), st.spdU())
				default:
					en, es = "Full throttle sooner on exit", "Acelerador a fondo antes en la salida"
				}
			}
		}
		// a generic tip gives way to what the data shows plainly: the gear through the corner, lifts on the exit,
		// corrections of the wheel
		generic := coachGeneric(en)
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
				en, es = fmt.Sprintf("Smoother throttle on exit. You lifted %d times after the apex (reference %d)", lA, lB), fmt.Sprintf("Acelera más progresivo a la salida. Levantaste %d veces tras el vértice (referencia %d)", lA, lB)
			case hasA && hasB && rA >= 3 && rA > rB+2:
				en, es = fmt.Sprintf("%d steering corrections in this corner (reference %d). Turn in once, smoothly", rA, rB), fmt.Sprintf("%d correcciones de volante en esta curva (referencia %d). Gira una vez, suave", rA, rB)
			}
		}
		// the line: where the car was across the track. A lap that brakes at the reference's point but on the wrong
		// part of the track hears that first; otherwise it follows the tip of the phase
		if lat != nil {
			if le, la, lx, okL := cornerLine(lat, R.x, R.y, z.i, z.imin); okL {
				generic := coachGeneric(en)
				if ln, ls := lineTip(le, la, lx, hasM && math.Abs(dd) <= 6); ln != "" {
					if generic || (ph[0].k == "brake" && hasM && math.Abs(dd) <= 6) {
						en, es = ln, ls
					} else {
						en, es = en+". "+ln, es+". "+ls
					}
				}
			}
		}
		cn := k + 1
		if z.turn >= 0 {
			cn = z.turn + 1
		}
		ce, cs := coachCue(en)
		out = append(out, coachTip{n: cn, d: float64(z.i) * ovLapBin, apex: float64(z.imin) * ovLapBin, lost: lost, en: en, es: es, cueEn: ce, cueEs: cs, dd: dd, hasDd: hasM})
	}
	sort.SliceStable(out, func(a, b int) bool { return out[a].lost > out[b].lost })
	if len(out) > max {
		out = out[:max]
	}
	return out
}

// coachGeneric: a tip that says nothing the data showed; what the data shows plainly (the gear, lifts, the wheel, the
// line) replaces it
func coachGeneric(en string) bool {
	switch en {
	case "Brake a little later and harder", "Carry more speed into the turn", "A rounder, faster line through the apex", "Full throttle sooner on exit",
		"Same braking point, slower through the braking zone. Brake hard at once, then release progressively",
		"You reach the apex as fast as the reference. The time goes before it, so release the brake more gradually as you turn in",
		"As fast at the slowest point, but slow for longer. Shorten the slow part of the corner (turn in later, later apex)":
		return true
	}
	return false
}

// ---------- the coach overlay, live ----------
// The overlay follows the lap (design A): as the car comes to a corner with a tip it shows the corner, the metres to the
// reference's braking point, the tip and the fast drivers' range; after the corner, for a few seconds, the verdict (what
// this lap did there against the reference); and the lap's corners as dots. "The plan" shows the chosen corners as rows,
// "one line" the next corner alone. Everything is chosen in the overlay's settings on the web (UI_DEFAULTS.coach): the
// reference, what it shows, which corners, the hint, the verdict's seconds, how far ahead it speaks.

type ovCorner struct {
	Apex, B0, B1, V0, V1 float64
	N                    int
}

type coachVerdict struct {
	n    int
	gain float64 // seconds against the reference in that corner (negative: gained)
	at   time.Time
}

type ovCoachState struct {
	key     string
	tips    []coachTip // every corner of the reference, in lap order
	ref     string
	refLap  *ovLap
	lapA    *ovLap // the lap the tips judge (your last one): its path for the curve style
	lap     int
	dots    map[int]float64 // this lap's corners: seconds against the reference (negative: gained)
	watch   int             // the corner under way (its index in tips), -1 none
	watchD0 float64
	verdict *coachVerdict
}

// coachRef: the reference the overlay measures against: the model's next level when it is faster than your best and the
// settings allow it, else your own best lap of the session (the lap to judge, A, is your last one)
func (st *ovState) coachRef(pref string) (A, R *ovLap, name string) {
	E := &st.ext
	if len(E.laps) < 1 {
		return nil, nil, ""
	}
	A = E.laps[len(E.laps)-1]
	R = st.bestLap(nil)
	if R == A {
		R = st.bestLap(A)
	}
	st.loadModelRef()
	name = st.T("vs your best lap", "vs tu mejor vuelta")
	if pref != "best" {
		if m := E.modelRef; m != nil && m.time < A.time-0.001 && (R == nil || m.time < R.time-0.001) {
			R, name = m, st.T("vs the driver just ahead", "vs el piloto justo por delante")
		}
	}
	if R == nil || R == A {
		return A, nil, ""
	}
	return A, R, name
}

// liveDelta: the current lap against a reference lap at the same point of the lap
func (st *ovState) liveDelta(R *ovLap) (float64, bool) {
	d, ok1 := st.num("LapDist")
	t, ok2 := st.num("LapCurrentLapTime")
	if R == nil || !ok1 || !ok2 || d < 20 {
		return 0, false
	}
	r, ok := timeAt(R.series(), d)
	if !ok {
		return 0, false
	}
	return t - r, true
}

// coachTick: the tips of the last lap (once per lap), which corner comes next, and the verdict of the corner just taken
func (st *ovState) coachTick(cfg map[string]any) {
	E := &st.ext
	C := &E.coach
	A, R, name := st.coachRef(uiStr(cfg, "ref", "level"))
	if A == nil || R == nil {
		C.tips, C.ref, C.refLap = nil, "", nil
		return
	}
	key := fmt.Sprintf("%d|%.3f|%.3f|%s", len(E.laps), A.time, R.time, E.driver)
	if C.key != key {
		C.key, C.ref, C.refLap, C.lapA = key, name, R, A
		C.tips = st.compareLaps(A, R, 1000)
		sort.Slice(C.tips, func(i, j int) bool { return C.tips[i].d < C.tips[j].d })
		C.watch = -1
	}
	f := func(n string) float64 { v, _ := st.num(n); return v }
	lap := int(f("LapCompleted"))
	if lap != C.lap || C.dots == nil {
		C.lap, C.dots, C.watch = lap, map[int]float64{}, -1
	}
	if f("IsOnTrack") == 0 || f("OnPitRoad") != 0 {
		C.watch = -1
		return
	}
	d, ok := st.num("LapDist")
	if !ok {
		return
	}
	// the corner under way: its window from 50 m before the braking to 150 m after the slowest point, like the coach's lost
	for i, t := range C.tips {
		if !st.coachPicked(cfg, t) {
			continue
		}
		i0, i1 := t.d-50, t.apex+150
		if C.watch != i && d >= i0 && d < i0+30 {
			if dl, ok := st.liveDelta(R); ok {
				C.watch, C.watchD0 = i, dl
			}
		}
		if C.watch == i && d >= i1 && d < i1+200 {
			if dl, ok := st.liveDelta(R); ok {
				g := dl - C.watchD0
				C.dots[t.n] = g
				C.verdict = &coachVerdict{n: t.n, gain: g, at: time.Now()}
			}
			C.watch = -1
		}
	}
}

// coachPicked: whether the settings want this corner: the chosen turns ("T4") on the track they were chosen for
// (turnsTrack, from the coach's plan or the chips of the track the game was on), else the three that cost the most
func (st *ovState) coachPicked(cfg map[string]any, t coachTip) bool {
	turns := uiList(cfg, "turns", nil)
	if tt := int(uiNum(cfg, "turnsTrack", 0)); tt > 0 && st.ses != nil && st.ses.TrackID > 0 && tt != st.ses.TrackID {
		turns = nil
	}
	if len(turns) > 0 {
		for _, x := range turns {
			if x == "T"+strconv.Itoa(t.n) {
				return true
			}
		}
		return false
	}
	C := &st.ext.coach
	if t.lost <= .03 {
		return false
	}
	worse := 0
	for _, o := range C.tips {
		if o.lost > t.lost {
			worse++
		}
	}
	return worse < 3
}

// coachNext: the next chosen corner ahead of the car and the metres to its braking point (round the lap)
func (st *ovState) coachNext(cfg map[string]any) (*coachTip, float64) {
	C := &st.ext.coach
	d, ok := st.num("LapDist")
	if !ok || len(C.tips) == 0 {
		return nil, 0
	}
	L := 4000.0
	if st.ses != nil && st.ses.TrackLen > 0 {
		L = st.ses.TrackLen
	}
	var first *coachTip
	for i := range C.tips {
		t := &C.tips[i]
		if !st.coachPicked(cfg, *t) {
			continue
		}
		if first == nil {
			first = t
		}
		if t.apex+150 > d {
			return t, t.d - d
		}
	}
	if first == nil {
		return nil, 0
	}
	return first, first.d - d + L
}

// wrapLines cuts a text into lines of at most w pixels, up to max lines (the last one with "…")
func wrapLines(f font.Face, s string, w float64, max int) []string {
	words := strings.Fields(s)
	var out []string
	cur := ""
	for _, wd := range words {
		try := strings.TrimSpace(cur + " " + wd)
		if cur != "" && textW(f, try) > w {
			out = append(out, cur)
			cur = wd
			if len(out) == max-1 {
				rest := strings.Join(words[len(strings.Fields(strings.Join(out, " "))):], " ")
				out = append(out, ellipsis(f, rest, w))
				return out
			}
			continue
		}
		cur = try
	}
	if cur != "" {
		out = append(out, cur)
	}
	return out
}

func drawCoachOv(c *ovCanvas, st *ovState, z float64) int {
	ton, th := st.titleOn("coach"), st.titleH("coach", z)
	W := float64(c.w)
	pad := 14 * z
	cfg := st.uiMap("coach")
	st.coachTick(cfg)
	C := &st.ext.coach
	mode := uiStr(cfg, "mode", "next")
	nf, cf, pf := ovFace(fkBody, 13.5*z), ovFace(fkDisplayB, 22*z), ovFace(fkDataB, 11*z)
	hint := func(t *coachTip) string { // the fast drivers' range for this corner (the model's corner card)
		if !uiBool(cfg, "hint", true) {
			return ""
		}
		for _, k := range st.ext.modelCor {
			if math.Abs(k.Apex-t.apex) <= 60 && k.N >= 3 {
				return st.T(fmt.Sprintf("The fast drivers brake between %d and %d m and pass the apex at %d–%d %s", int(k.B0), int(k.B1), int(st.spd(k.V0)), int(st.spd(k.V1)), st.spdU()),
					fmt.Sprintf("Los rápidos frenan entre %d y %d m y pasan el vértice a %d–%d %s", int(k.B0), int(k.B1), int(st.spd(k.V0)), int(st.spd(k.V1)), st.spdU()))
			}
		}
		return ""
	}
	tipText := func(t *coachTip) string {
		if t.lost > .03 && t.en != "" {
			return st.T(t.en, t.es)
		}
		return st.T("Nothing to fix here", "Nada que corregir aquí")
	}
	pill := func(x, y, h float64, name string) float64 { // the turn's pill, returns its width
		f := cf
		if len([]rune(name)) > 4 {
			f = ovFace(fkDisplayB, 17*z)
		}
		w := textW(f, name) + 16*z
		c.roundRect(x, y, w, h, 7*z, 0x222b37, 1, colLine, 1, 1)
		c.text(f, name, x+w/2, y+h/2, colText, 1, 2)
		return w
	}
	dots := func(y float64) float64 { // this lap's corners against the reference, in lap order
		if len(C.tips) == 0 {
			return 0
		}
		x, r := pad, 5*z
		for _, t := range C.tips {
			g, ok := C.dots[t.n]
			col, a := uint32(0x222b37), 1.0
			if ok {
				col = uint32(colMuted)
				if g < -.02 {
					col = colGood
				} else if g > .02 {
					col = colBad
				}
			}
			c.roundRect(x, y, 2*r, 2*r, r, col, a, colLine, 1, 1)
			x += 2*r + 6*z
			if x > W-pad {
				break
			}
		}
		sum, n, m := 0.0, 0, 0
		for _, g := range C.dots {
			sum += g
			if g < -.02 {
				n++
			} else if g > .02 {
				m++
			}
		}
		if len(C.dots) > 0 {
			col := uint32(colGood)
			if sum > 0 {
				col = colBad
			}
			c.text(pf, fmt.Sprintf("%d ▲ · %d ▼ · %s s", n, m, signed(sum, 2)), W-pad, y+r, col, 1, 1)
		}
		return 2*r + 10*z
	}
	// nothing to measure yet
	if len(C.tips) == 0 {
		H := pad + th + 34*z + pad - 4*z
		panel(c, H, z)
		if ton {
			c.label(z, st.T("Coach", "Coach"), pad, pad+6*z, 0)
		}
		msg := st.T("Tips appear after your second lap (or your first, once the model knows a faster driver).", "Los consejos aparecen tras tu segunda vuelta (o la primera, si el modelo conoce a un piloto más rápido).")
		c.text(nf, ellipsis(nf, msg, W-2*pad), pad, pad+th+17*z, colMuted, 1, 0)
		return int(math.Ceil(H))
	}
	next, dTo := st.coachNext(cfg)
	lead := uiNum(cfg, "lead", 300)
	vsecs := uiNum(cfg, "verdict", 4)
	verdict := C.verdict != nil && vsecs > 0 && time.Since(C.verdict.at) < time.Duration(vsecs*float64(time.Second))
	switch mode {
	case "column":
		return drawCoachColumn(c, st, z, next, dTo, lead, verdict)
	case "curve":
		return drawCoachCurve(c, st, z, next, dTo, lead, verdict, tipText)
	case "big":
		return drawCoachBig(c, st, z, next, dTo, lead, verdict)
	}
	// "next": the corner coming, or the verdict of the one just taken
	tf := ovFace(fkBodyB, 14*z)
	lines := []string{}
	hl := ""
	if !verdict && next != nil && dTo <= lead {
		lines = wrapLines(tf, tipText(next), W-2*pad-10*z, 2)
		hl = hint(next)
	}
	H := pad + th + 56*z + 10*z
	if verdict {
		H += 24 * z
	} else if next != nil && dTo <= lead {
		H += float64(len(lines))*19*z + 10*z
		if hl != "" {
			H += 16 * z
		}
	}
	H += 18*z + pad - 4*z
	panel(c, H, z)
	if ton {
		c.label(z, st.T("Coach", "Coach"), pad, pad+6*z, 0)
	}
	if ton {
		c.labelFit(z, C.ref, W/2, pad+6*z, W/2-pad)
	}
	y := pad + th
	if verdict {
		v := C.verdict
		col := uint32(colGood)
		if v.gain > 0 {
			col = colBad
		}
		pw := pill(pad, y+8*z, 40*z, coachTurnLabel(st, v.n, true))
		big := ovFace(fkDataB, 28*z)
		c.text(big, signed(v.gain, 2)+" s", pad+pw+14*z, y+20*z, col, 1, 0)
		what := st.T("Better than the reference", "Mejor que la referencia")
		if v.gain > 0 {
			what = st.T("Slower than the reference", "Más lento que la referencia")
		}
		c.text(tf, what, pad+pw+14*z+textW(big, signed(v.gain, 2)+" s")+12*z, y+20*z, col, 1, 0)
		c.text(nf, ellipsis(nf, st.T("Measured from the braking zone to the exit", "Medido desde la frenada hasta la salida"), W-2*pad), pad, y+46*z, colMuted, 1, 0)
		y += 56*z + 24*z + 10*z
	} else if next != nil {
		pw := pill(pad, y+8*z, 40*z, coachTurnLabel(st, next.n, false))
		c.text(pf, signed(next.lost, 2)+" s", pad+pw/2, y+56*z, colBad, 1, 2)
		x := pad + pw + 16*z
		if dTo <= lead {
			c.label(z, st.T("Brake in", "Frena en"), x, y+6*z, 0)
			ms := fmt.Sprintf("%d m", int(math.Max(0, dTo)))
			c.text(ovFace(fkDataB, 24*z), ms, x+textW(ovFace(fkData, 11*z), strings.ToUpper(st.T("Brake in", "Frena en")))*1.1+10*z, y+8*z, colText, 1, 0)
			// the bar: the car coming to the braking point
			bx, bw := x, W-pad-x
			c.roundRect(bx, y+30*z, bw, 8*z, 4*z, 0x222b37, 1, 0, 0, 0)
			fr := 1 - math.Max(0, math.Min(1, dTo/lead))
			c.roundRect(bx, y+30*z, math.Max(8*z, bw*fr), 8*z, 4*z, colAmber, 1, 0, 0, 0)
			c.text(pf, st.T(fmt.Sprintf("The reference brakes %d m from the line", int(next.d)), fmt.Sprintf("La referencia frena a %d m de la línea", int(next.d))), x, y+48*z, colMuted, 1, 0)
			y += 56*z + 10*z
			c.rect(pad, y, 4*z, float64(len(lines))*19*z, colAmber, 1)
			for k, ln := range lines {
				c.text(tf, ln, pad+12*z, y+9*z+float64(k)*19*z, colText, 1, 0)
			}
			y += float64(len(lines))*19*z + 10*z
			if hl != "" {
				c.text(pf, ellipsis(pf, hl, W-2*pad), pad, y+6*z, colMuted, 1, 0)
				y += 16 * z
			}
		} else {
			c.text(nf, ellipsis(nf, st.T(fmt.Sprintf("Next in %d m", int(dTo)), fmt.Sprintf("Siguiente en %d m", int(dTo))), W-pad-x), x, y+28*z, colMuted, 1, 0)
			y += 56*z + 10*z
		}
	} else {
		c.text(nf, ellipsis(nf, st.T("Your last lap loses nothing clear against the reference. Keep it up", "Tu última vuelta no pierde nada claro frente a la referencia. Sigue así"), W-2*pad), pad, y+28*z, colMuted, 1, 0)
		y += 56*z + 10*z
	}
	dots(y)
	return int(math.Ceil(H))
}

// coachTurn: how the coach overlay names a corner (its settings, "turnName"): "both" says "Next turn (T7)" (the
// default, for drivers who do not know the numbers), "words" only "Next turn", "num" only "T7". words is the part in
// words ("" for "num"), num the turn's number ("" for "words"); done names the corner just taken
func coachTurn(st *ovState, n int, done bool) (words, num string) {
	style := uiStr(st.uiMap("coach"), "turnName", "both")
	if style != "words" {
		num = "T" + strconv.Itoa(n)
	}
	if style != "num" {
		words = st.T("Next turn", "Próxima curva")
		if done {
			words = st.T("This turn", "Esta curva")
		}
	}
	return
}

// coachTurnLabel: the corner's name in one piece ("Next turn (T7)", "Next turn" or "T7")
func coachTurnLabel(st *ovState, n int, done bool) string {
	w, num := coachTurn(st, n, done)
	switch {
	case w == "":
		return num
	case num == "":
		return w
	}
	return w + " (" + num + ")"
}

// coachVerdictCol: green for a corner gained against the reference, red for one lost
func coachVerdictCol(g float64) uint32 {
	if g > 0 {
		return colBad
	}
	return colGood
}

// drawCoachColumn: style 3, a narrow column in the middle of the window: the turn, a bar that fills as the car comes to
// the reference's braking point (amber in the last 100 m) and the metres; after the corner a tick or a cross and the time
func drawCoachColumn(c *ovCanvas, st *ovState, z float64, next *coachTip, dTo, lead float64, verdict bool) int {
	W := float64(c.w)
	cw := 112 * z
	x0 := math.Round((W - cw) / 2)
	H := 250 * z
	c.roundRect(x0+0.5, 0.5, cw-1, H-1, 10*z, colPanel, 0.94, colLine, 1, 1)
	cx := x0 + cw/2
	C := &st.ext.coach
	head := st.T("Coach", "Coach")
	if verdict || next != nil {
		n := C.verdict.n
		if !verdict {
			n = next.n
		}
		if w, _ := coachTurn(st, n, verdict); w != "" {
			head = w
		}
	}
	hf := ovFace(fkData, 10*z)
	c.text(hf, ellipsis(hf, strings.ToUpper(head), cw-12*z), cx, 18*z, colMuted, 1, 2)
	cf := ovFace(fkDisplayB, 24*z)
	turn := func(n int) {
		_, name := coachTurn(st, n, verdict)
		if name == "" { // only the words: they are the column's title
			return
		}
		w := textW(cf, name) + 22*z
		c.roundRect(cx-w/2, 32*z, w, 38*z, 7*z, 0x222b37, 1, colLine, 1, 1)
		c.text(cf, name, cx, 51*z, colText, 1, 2)
	}
	switch {
	case verdict:
		v := C.verdict
		col := coachVerdictCol(v.gain)
		turn(v.n)
		c.roundRect(cx-22*z, 92*z, 44*z, 44*z, 22*z, col, 0.12, col, 1, 2*z)
		mark := "✓"
		if v.gain > 0 {
			mark = "✗"
		}
		c.text(ovFace(fkBodyB, 20*z), mark, cx, 114*z, col, 1, 2)
		c.text(ovFace(fkDataB, 20*z), signed(v.gain, 2), cx, 162*z, col, 1, 2)
		c.text(ovFace(fkBody, 11*z), st.T("vs ref", "vs ref"), cx, 184*z, colMuted, 1, 2)
	case next != nil:
		turn(next.n)
		bx, by, bw, bh := cx-9*z, 84*z, 18*z, 118*z
		c.roundRect(bx, by, bw, bh, 9*z, 0x222b37, 1, 0, 0, 0)
		fr := 0.0
		if dTo <= lead {
			fr = 1 - math.Max(0, math.Min(1, dTo/lead))
		}
		fh := math.Max(bw, bh*fr)
		c.roundRect(bx, by+bh-fh, bw, fh, 9*z, colAmber, 1, 0, 0, 0)
		col := uint32(colText)
		if dTo <= 100 {
			col = colAmber
		}
		c.text(ovFace(fkDataB, 20*z), strconv.Itoa(int(math.Max(0, dTo))), cx, 224*z, col, 1, 2)
	default:
		c.text(ovFace(fkBody, 11*z), st.T("No tip yet", "Sin consejo"), cx, 120*z, colMuted, 1, 2)
	}
	return int(math.Ceil(H))
}

// pathAt: the points of a lap's path between two distances of the lap (every 5 m)
func pathAt(l *ovLap, d0, d1 float64) (xs, ys []float64) {
	if l == nil || len(l.x) < 4 || len(l.x) != len(l.y) {
		return nil, nil
	}
	for d := d0; d <= d1; d += 5 {
		i := int(math.Round(d / 5))
		if i < 0 || i >= len(l.x) {
			continue
		}
		xs, ys = append(xs, l.x[i]), append(ys, l.y[i])
	}
	return xs, ys
}

// drawCoachCurve: style 4, the corner drawn (your last lap's path as the road, the reference's line dashed when it has
// one, both braking points) beside the turn, the metres and the tip; after it the corner in green or red and the time
func drawCoachCurve(c *ovCanvas, st *ovState, z float64, next *coachTip, dTo, lead float64, verdict bool, tipText func(*coachTip) string) int {
	W := float64(c.w)
	pad := 14 * z
	C := &st.ext.coach
	H := 140 * z
	panel(c, H, z)
	var t *coachTip
	if verdict {
		for i := range C.tips {
			if C.tips[i].n == C.verdict.n {
				t = &C.tips[i]
			}
		}
	} else if next != nil {
		t = next
	}
	nf, tf := ovFace(fkBody, 12*z), ovFace(fkBodyB, 13.5*z)
	if t == nil {
		c.text(nf, ellipsis(nf, st.T("No tip yet", "Sin consejo todavía"), W-2*pad), pad, H/2, colMuted, 1, 0)
		return int(math.Ceil(H))
	}
	// the corner's piece of the track, fitted into a box on the left
	bx, by, bs := pad, pad, H-2*pad
	ax, ay := pathAt(C.lapA, t.d-80, t.apex+150)
	rx, ry := pathAt(C.refLap, t.d-80, t.apex+150)
	if len(ax) >= 2 {
		minX, maxX, minY, maxY := ax[0], ax[0], ay[0], ay[0]
		for i := range ax {
			minX, maxX, minY, maxY = math.Min(minX, ax[i]), math.Max(maxX, ax[i]), math.Min(minY, ay[i]), math.Max(maxY, ay[i])
		}
		span := math.Max(maxX-minX, maxY-minY) + 20
		k := (bs - 16*z) / span
		mx, my := (minX+maxX)/2, (minY+maxY)/2
		P := func(x, y float64) (float64, float64) { return bx + bs/2 + (x-mx)*k, by + bs/2 - (y-my)*k }
		poly := func(xs, ys []float64, w float64, col uint32, a float64, dash bool) {
			for i := 1; i < len(xs); i++ {
				if dash && i%3 == 0 {
					continue
				}
				x0, y0 := P(xs[i-1], ys[i-1])
				x1, y1 := P(xs[i], ys[i])
				c.line(x0, y0, x1, y1, w, col, a)
			}
		}
		poly(ax, ay, 14*z, 0x2b3542, 1, false)
		lineCol := uint32(colAmber)
		if verdict {
			lineCol = coachVerdictCol(C.verdict.gain)
		}
		if len(rx) >= 2 {
			poly(rx, ry, 2*z, colText, 0.9, true)
		}
		poly(ax, ay, 2.5*z, lineCol, 1, false)
		mark := func(l *ovLap, d float64, col uint32) { // a short bar across the road at a braking point
			xs, ys := pathAt(l, d, d+5)
			if len(xs) < 2 {
				return
			}
			x0, y0 := P(xs[0], ys[0])
			x1, y1 := P(xs[1], ys[1])
			dx, dy := x1-x0, y1-y0
			n := math.Hypot(dx, dy)
			if n == 0 {
				return
			}
			nx, ny := -dy/n*8*z, dx/n*8*z
			c.line(x0-nx, y0-ny, x0+nx, y0+ny, 2.5*z, col, 1)
		}
		if !verdict {
			src := C.refLap
			if len(rx) < 2 {
				src = C.lapA
			}
			mark(src, t.d, colText)
			if t.hasDd {
				mark(C.lapA, t.d+t.dd, colAmber)
			}
			if d, ok := st.num("LapDist"); ok && d >= t.d-80 && d <= t.apex+150 {
				if xs, ys := pathAt(C.lapA, d, d); len(xs) == 1 {
					x, y := P(xs[0], ys[0])
					c.roundRect(x-5*z, y-5*z, 10*z, 10*z, 5*z, colAmber, 1, 0x0f1216, 1, 2*z)
				}
			}
		}
	} else {
		c.roundRect(bx, by, bs, bs, 8*z, 0x222b37, 0.5, 0, 0, 0)
	}
	// the text on the right
	x := bx + bs + 14*z
	cf := ovFace(fkDisplayB, 18*z)
	name := coachTurnLabel(st, t.n, verdict)
	if len([]rune(name)) > 4 {
		cf = ovFace(fkDisplayB, 15*z)
	}
	pw := textW(cf, name) + 14*z
	c.roundRect(x, pad, pw, 28*z, 6*z, 0x222b37, 1, colLine, 1, 1)
	c.text(cf, name, x+pw/2, pad+14*z, colText, 1, 2)
	big := ovFace(fkDataB, 20*z)
	if verdict {
		g := C.verdict.gain
		c.text(big, signed(g, 2), x+pw+10*z, pad+14*z, coachVerdictCol(g), 1, 0)
		what := st.T("Better than the reference", "Mejor que la referencia")
		if g > 0 {
			what = st.T("Slower than the reference", "Más lento que la referencia")
		}
		c.text(tf, ellipsis(tf, what, W-pad-x), x, pad+48*z, colText, 1, 0)
		return int(math.Ceil(H))
	}
	ms := st.T("next", "próxima")
	if dTo <= lead {
		ms = fmt.Sprintf("%d m", int(math.Max(0, dTo)))
	}
	c.text(big, ms, x+pw+10*z, pad+14*z, colText, 1, 0)
	lines := wrapLines(tf, tipText(t), W-pad-x, 3)
	for k, ln := range lines {
		c.text(tf, ln, x, pad+46*z+float64(k)*18*z, colText, 1, 0)
	}
	legend := st.T("white the reference, amber you", "blanca la referencia, amarilla tú")
	c.text(nf, ellipsis(nf, legend, W-pad-x), x, H-pad-4*z, colMuted, 1, 0)
	return int(math.Ceil(H))
}

// drawCoachBig: style 8, big letters and few words for VR: the turn, the metres and the tip in two or three words;
// after the corner the turn and the time
func drawCoachBig(c *ovCanvas, st *ovState, z float64, next *coachTip, dTo, lead float64, verdict bool) int {
	W := float64(c.w)
	pad := 18 * z
	C := &st.ext.coach
	n := 0
	switch {
	case verdict:
		n = C.verdict.n
	case next != nil:
		n = next.n
	}
	words, num := "", ""
	if n > 0 {
		words, num = coachTurn(st, n, verdict)
	}
	H, cy := 96*z, 48*z
	if words != "" { // the words over the row, in capitals: "NEXT TURN"
		H, cy = 120*z, 72*z
	}
	panel(c, H, z)
	if words != "" {
		c.text(ovFace(fkDisplayB, 22*z), strings.ToUpper(words), pad, 26*z, colMuted, 1, 0)
	}
	tf := ovFace(fkDisplayB, 52*z)
	x := pad
	if num != "" {
		c.text(tf, num, pad, cy, colText, 1, 0)
		x += textW(tf, num) + 20*z
	}
	switch {
	case verdict:
		c.text(ovFace(fkDataB, 44*z), signed(C.verdict.gain, 2), x, cy, coachVerdictCol(C.verdict.gain), 1, 0)
	case next != nil:
		cue := st.T(next.cueEn, next.cueEs)
		if dTo > lead {
			c.text(ovFace(fkDataB, 30*z), fmt.Sprintf("%d m", int(dTo)), x, cy, colMuted, 1, 0)
			break
		}
		c.text(ovFace(fkDataB, 38*z), strconv.Itoa(int(math.Max(0, dTo))), x, cy-12*z, colText, 1, 0)
		if cue == "" {
			cue = st.T("BRAKE", "FRENA")
		}
		cf := ovFace(fkDisplayB, 20*z)
		c.text(cf, ellipsis(cf, cue, W-pad-x), x, cy+22*z, colAmber, 1, 0)
	default:
		c.text(ovFace(fkBody, 14*z), st.T("No tip yet", "Sin consejo todavía"), pad, cy, colMuted, 1, 0)
	}
	return int(math.Ceil(H))
}

// the map overlay's still picture (the panel and the track), kept with what it was drawn from
type mapLayer struct {
	key mapLayerKey
	px  []uint32
	ok  bool
}

type mapLayerKey struct {
	w, h  int
	z     float64
	x, y  *float64
	n, ny int
	ses   *ovSession
	turns []float64
}

func (a mapLayerKey) same(b mapLayerKey) bool {
	if a.w != b.w || a.h != b.h || a.z != b.z || a.x != b.x || a.y != b.y || a.n != b.n || a.ny != b.ny || a.ses != b.ses || len(a.turns) != len(b.turns) {
		return false
	}
	return len(a.turns) == 0 || &a.turns[0] == &b.turns[0]
}
