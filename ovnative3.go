package main

// Native overlays, third part: the ones that follow the session (stats, pit stop, mini-sectors, gaps, incidents).
// They keep what the app's widgets keep (each lap's pedal use, the mini-sector times, the gap history, the
// incident log) from the frames they get, and draw the same.

import (
	"fmt"
	"math"
	"sort"
	"strconv"
	"strings"
)

func sessionOverlay(name string) bool {
	switch name {
	case "stats", "pit", "sectors", "gaps", "incidents":
		return true
	}
	return false
}

func sessionVars(name string) []string {
	switch name {
	case "stats":
		return []string{"SessionTime", "LapCompleted", "Throttle", "Brake", "Gear", "Speed", "IsOnTrack", "VelocityX", "VelocityY"}
	case "sectors":
		return []string{"SessionTime", "LapDistPct", "IsOnTrack"}
	case "gaps":
		return []string{"SessionTime", "CarIdxLapDistPct", "CarIdxLap", "CarIdxEstTime", "CarIdxPosition", "LapBestLapTime"}
	case "incidents":
		return []string{"PlayerCarMyIncidentCount", "Lap", "LapDistPct", "SessionTime"}
	case "pit":
		return []string{"FuelLevel", "FuelLevelPct", "FuelUsePerHour", "LapLastLapTime", "LapBestLapTime", "LapCompleted", "OnPitRoad", "Lap", "LapDistPct", "SessionLapsRemainEx",
			"SessionTimeRemain", "PlayerCarPosition", "CarIdxLapDistPct", "CarIdxLap", "CarIdxEstTime", "CarIdxPosition", "CarIdxLastLapTime", "CarIdxBestLapTime",
			"Speed", "PitstopActive", "PitRepairLeft", "PitOptRepairLeft", "PitSvFuel", "EngineWarnings"}
	}
	return nil
}

// ---------- what they remember ----------

type lapStats struct {
	lc                             int
	t, full, brk, coast, top, slip float64
	shifts                         int
	gear                           float64
	hasGear                        bool
}

type msCell struct {
	dt  float64
	col byte // 'p' best of the session, 'g' faster than your best lap, 'y' slower
}

type ovSessionMem struct {
	sess int
	init bool
	// stats
	stCur, stLast *lapStats
	stT           float64
	stHasT        bool
	// mini-sectors
	msIdx         int
	msT0          float64
	msHasT0       bool
	msLp, msLt    float64
	msHasLp       bool
	msCur, msLast []*msCell
	msBest        []float64
	msBestLap     []float64
	msBestLapT    float64
	// gaps
	gapAt float64
	gapH  map[int][][2]float64
	// incidents
	incN   int
	incHas bool
	incLog []ovIncEvent
}

type ovIncEvent struct {
	d, tot, lap int
	pct         float64
}

const msN = 24

func (st *ovState) mem() *ovSessionMem {
	if st.sm == nil {
		st.sm = &ovSessionMem{msIdx: -1, gapH: map[int][][2]float64{}, msCur: make([]*msCell, msN), msBest: make([]float64, msN)}
		for i := range st.sm.msBest {
			st.sm.msBest[i] = -1
		}
	}
	return st.sm
}

// estLap: the lap time the gaps are worked out with (iRacing's estimate for the car, else your best)
func (st *ovState) estLap() float64 {
	if st.ses != nil && st.ses.Car["DriverCarEstLapTime"] > 0 {
		return st.ses.Car["DriverCarEstLapTime"]
	}
	if v, _ := st.num("LapBestLapTime"); v > 0 {
		return v
	}
	return 100
}

type relCar struct {
	i          int
	g, lapDiff float64
}

// relList: every car racing, with its gap in laps to you (the app's relList)
func (st *ovState) relList() []relCar {
	pct, laps := st.arr("CarIdxLapDistPct"), st.arr("CarIdxLap")
	mev, ok := st.num("PlayerCarIdx")
	me := int(mev)
	if !ok || st.ses == nil || me < 0 || me >= len(pct) || me >= len(laps) {
		return nil
	}
	var out []relCar
	for _, d := range st.ses.Drivers {
		i := d.Idx
		if d.Skip || d.Name == "" || i >= len(pct) || i >= len(laps) || pct[i] < 0 {
			continue
		}
		out = append(out, relCar{i: i, lapDiff: (laps[i] + pct[i]) - (laps[me] + pct[me])})
	}
	sort.Slice(out, func(a, b int) bool { return out[a].i < out[b].i })
	return out
}

// collectSession: the session overlays' memory, from each frame; st.mu is held
func (st *ovState) collectSession() {
	m := st.mem()
	f := func(n string) float64 { v, _ := st.num(n); return v }
	sn := int(f("SessionNum"))
	if !m.init || sn != m.sess {
		*m = ovSessionMem{init: true, sess: sn, msIdx: -1, gapH: map[int][][2]float64{}, msCur: make([]*msCell, msN), msBest: make([]float64, msN)}
		for i := range m.msBest {
			m.msBest[i] = -1
		}
		if n, ok := st.num("PlayerCarMyIncidentCount"); ok {
			m.incN, m.incHas = int(n), true
		}
	}
	t, hasT := st.num("SessionTime")
	onTrack := f("IsOnTrack") != 0
	// incidents
	if n, ok := st.num("PlayerCarMyIncidentCount"); ok {
		if m.incHas && int(n) > m.incN {
			m.incLog = append([]ovIncEvent{{d: int(n) - m.incN, tot: int(n), lap: int(f("Lap")), pct: f("LapDistPct")}}, m.incLog...)
		}
		m.incN, m.incHas = int(n), true
	}
	// stats: each lap's share of full throttle, braking and coasting, the shifts, the top speed and the slip
	if lcv, ok := st.num("LapCompleted"); ok && hasT {
		lc := int(lcv)
		if m.stCur == nil || m.stCur.lc != lc {
			if m.stCur != nil && lc == m.stCur.lc+1 && m.stCur.t > 20 {
				m.stLast = m.stCur
			}
			m.stCur = &lapStats{lc: lc}
		}
		dt := 0.0
		if m.stHasT {
			dt = t - m.stT
		}
		m.stT, m.stHasT = t, true
		if dt > 0 && dt < 0.5 && onTrack {
			c := m.stCur
			th, br := f("Throttle"), f("Brake")
			c.t += dt
			if th > .98 {
				c.full += dt
			}
			if br > .05 {
				c.brk += dt
			}
			if th < .05 && br < .05 {
				c.coast += dt
			}
			if g, ok := st.num("Gear"); ok {
				if c.hasGear && g != c.gear && g > 0 {
					c.shifts++
				}
				c.gear, c.hasGear = g, true
			}
			c.top = math.Max(c.top, f("Speed"))
			if b, ok := st.slipAngle(); ok {
				c.slip = math.Max(c.slip, math.Abs(b))
			}
		}
	}
	// mini-sectors: 24 pieces of the lap, timed where the car crosses each boundary
	if p, ok := st.num("LapDistPct"); ok && hasT && p >= 0 {
		if !onTrack {
			m.msIdx, m.msHasT0, m.msHasLp = -1, false, false
			m.msCur = make([]*msCell, msN)
		} else {
			k := int(math.Min(msN-1, math.Floor(p*msN)))
			lp, lt, hadLp := m.msLp, m.msLt, m.msHasLp
			m.msLp, m.msLt, m.msHasLp = p, t, true
			if k != m.msIdx {
				prev := m.msIdx
				m.msIdx = k
				forward := prev >= 0 && (k == prev+1 || (prev == msN-1 && k == 0))
				tb := t
				if forward && hadLp {
					edge := float64(k) / msN
					if k == 0 {
						edge = 1
					}
					pp := p
					if k == 0 && p < lp {
						pp = p + 1
					}
					if pp > lp {
						tb = lt + (t-lt)*(edge-lp)/(pp-lp)
					}
				}
				if forward && m.msHasT0 {
					dt := tb - m.msT0
					b := m.msBest[prev]
					col := byte('y')
					if b < 0 || dt <= b {
						col = 'p'
					} else if m.msBestLap != nil && dt <= m.msBestLap[prev] {
						col = 'g'
					}
					m.msCur[prev] = &msCell{dt, col}
					if b < 0 || dt < b {
						m.msBest[prev] = dt
					}
				} else if !forward {
					m.msCur = make([]*msCell, msN)
				}
				if forward && k == 0 {
					full, tot := true, 0.0
					for _, c := range m.msCur {
						if c == nil {
							full = false
						} else {
							tot += c.dt
						}
					}
					if full && (m.msBestLap == nil || tot < m.msBestLapT) {
						m.msBestLapT = tot
						m.msBestLap = make([]float64, msN)
						for i, c := range m.msCur {
							m.msBestLap[i] = c.dt
						}
					}
					m.msLast = m.msCur
					m.msCur = make([]*msCell, msN)
				}
				m.msT0, m.msHasT0 = tb, forward
			}
		}
	}
	// gaps: once a second, the gap in seconds to every car
	if hasT && (t-m.gapAt >= 1 || t < m.gapAt) {
		m.gapAt = t
		le := st.estLap()
		keep := uiNum(st.uiMap("gaps"), "mins", 5)*60 + 5
		for _, r := range st.relList() {
			a := append(m.gapH[r.i], [2]float64{t, r.lapDiff * le})
			for len(a) > 0 && a[0][0] < t-keep {
				a = a[1:]
			}
			m.gapH[r.i] = a
		}
	}
}

func (st *ovState) slipAngle() (float64, bool) {
	vx, ok1 := st.num("VelocityX")
	vy, ok2 := st.num("VelocityY")
	if !ok1 || !ok2 || math.Abs(vx) < 5 {
		return 0, false
	}
	return math.Atan2(vy, vx) * 180 / math.Pi, true
}

// ---------- drawing ----------

func drawSessionOv(name string, c *ovCanvas, st *ovState, z float64) int {
	switch name {
	case "stats":
		return drawStatsOv(c, st, z)
	case "pit":
		return drawPitOv(c, st, z)
	case "sectors":
		return drawSectorsOv(c, st, z)
	case "gaps":
		return drawGapsOv(c, st, z)
	case "incidents":
		return drawIncidentsOv(c, st, z)
	}
	return 0
}

func drawStatsOv(c *ovCanvas, st *ovState, z float64) int {
	W := float64(c.w)
	pad := 14 * z
	m := st.mem()
	rowH := 25 * z
	pc := func(s *lapStats, v float64) string {
		if s == nil || s.t <= 0 {
			return "–"
		}
		return strconv.Itoa(int(math.Round(v/s.t*100))) + "%"
	}
	type row struct {
		l string
		f func(s *lapStats) string
	}
	rows := []row{
		{st.T("Full throttle", "Gas a fondo"), func(s *lapStats) string { return pc(s, ifs(s, func() float64 { return s.full })) }},
		{st.T("Braking", "Frenando"), func(s *lapStats) string { return pc(s, ifs(s, func() float64 { return s.brk })) }},
		{st.T("Coasting", "Sin pedales"), func(s *lapStats) string { return pc(s, ifs(s, func() float64 { return s.coast })) }},
		{st.T("Gear changes", "Cambios de marcha"), func(s *lapStats) string {
			if s == nil {
				return "–"
			}
			return strconv.Itoa(s.shifts)
		}},
		{st.T("Top speed", "Vel. máxima"), func(s *lapStats) string {
			if s == nil || s.top <= 0 {
				return "–"
			}
			return strconv.Itoa(int(math.Round(st.spd(s.top)))) + " " + st.spdU()
		}},
		{st.T("Max slip angle", "Deslizamiento máx."), func(s *lapStats) string {
			if s == nil || s.slip <= 0 {
				return "–"
			}
			return strconv.FormatFloat(s.slip, 'f', 1, 64) + "°"
		}},
	}
	H := pad + 18*z + 22*z + float64(len(rows))*rowH + 10*z + 18*z + 14*z + pad
	panel(c, H, z)
	c.label(z, st.T("Lap stats", "Estadísticas de vuelta"), pad, pad+6*z, 0)
	y := pad + 18*z
	tf, kf, vf := ovFace(fkData, 10.5*z), ovFace(fkBody, 13.5*z), ovFace(fkData, 13.5*z)
	c1, c2 := W-pad-100*z, W-pad
	c.textT(tf, strings.ToUpper(st.T("This lap", "Esta vuelta")), c1, y+11*z, colMuted, 1, 1, 0.6*z)
	c.textT(tf, strings.ToUpper(st.T("Last", "Última")), c2, y+11*z, colMuted, 1, 1, 0.6*z)
	y += 22 * z
	c.rect(pad-4*z, y-1, W-2*pad+8*z, 1, colLine, 1)
	for k, r := range rows {
		if k%2 == 1 {
			c.rect(pad-4*z, y, W-2*pad+8*z, rowH, colText, 0.04)
		}
		c.text(kf, r.l, pad, y+rowH/2, colText, 1, 0)
		c.text(vf, r.f(m.stCur), c1, y+rowH/2, colText, 1, 1)
		c.text(vf, r.f(m.stLast), c2, y+rowH/2, colMuted, 1, 1)
		y += rowH
	}
	y += 10 * z
	b, ok := st.slipAngle()
	c.label(z, st.T("Car slip angle now", "Deslizamiento del coche ahora"), pad, y+6*z, 0)
	s := "–"
	if ok {
		s = strconv.FormatFloat(b, 'f', 1, 64) + "°"
	}
	c.text(ovFace(fkData, 13*z), s, W-pad, y+6*z, colText, 1, 1)
	y += 18 * z
	bw := W - 2*pad
	c.roundRect(pad, y, bw, 10*z, 5*z, colSurf2, 1, colLine, 1, 1)
	c.rect(pad+bw/2, y+1, 1, 10*z-2, colLine, 1)
	pos := 0.5
	if ok {
		pos = 0.5 + math.Max(-1, math.Min(1, b/10))*0.5
	}
	c.disc(pad+bw*pos, y+5*z, 6*z, colAmber, 1)
	return int(math.Ceil(H))
}

func ifs(s *lapStats, f func() float64) float64 {
	if s == nil {
		return 0
	}
	return f()
}

// lapsLeftRace: the laps left (the app's lapsLeft: by laps, else by time over the leader's lap)
func (st *ovState) lapsLeftRace() (float64, bool) {
	if r, ok := st.num("SessionLapsRemainEx"); ok && r >= 0 && r < 32000 {
		return r, true
	}
	tr, _ := st.num("SessionTimeRemain")
	if !(tr > 0 && tr < 600000) {
		return 0, false
	}
	pos, lastT, best, pct := st.arr("CarIdxPosition"), st.arr("CarIdxLastLapTime"), st.arr("CarIdxBestLapTime"), st.arr("CarIdxLapDistPct")
	lead := -1
	for i, p := range pos {
		if p == 1 {
			lead = i
		}
	}
	lt := st.estLap()
	p, _ := st.num("LapDistPct")
	if lead >= 0 {
		if lead < len(lastT) && lastT[lead] > 0 {
			lt = lastT[lead]
		} else if lead < len(best) && best[lead] > 0 {
			lt = best[lead]
		}
		if lead < len(pct) {
			p = pct[lead]
		}
	}
	first := (1 - p) * lt
	return 1 + math.Max(0, math.Ceil((tr-first)/lt)), true
}

// drawPitLane: on the pit road, the overlay is your speed against the limit and what the stop is doing
func drawPitLane(c *ovCanvas, st *ovState, z float64) int {
	W := float64(c.w)
	pad := 14 * z
	H := pad + 18*z + 56*z + 24*z + pad
	sp, _ := st.num("Speed")
	lim := 0.0
	if st.ses != nil {
		lim = st.ses.PitLimit
	}
	over := lim > 0 && sp > lim+0.4
	wv, _ := st.num("EngineWarnings")
	limiter := uint32(int64(wv))&16 != 0
	panel(c, H, z)
	if over { // over the limit: the whole card goes red
		c.roundRect(0.5, 0.5, W-1, H-1, 10*z, colBad, 0.25, colBad, 0.9, 2)
	}
	c.label(z, st.T("Pit lane", "Pit lane"), pad, pad+6*z, 0)
	if limiter {
		pf := ovFace(fkDataB, 10*z)
		s := st.T("LIMITER ON", "LIMITADOR")
		w := textW(pf, s) + 12*z
		c.roundRect(W-pad-w, pad-2*z, w, 16*z, 4*z, colGood, 0.2, colGood, 1, 1)
		c.text(pf, s, W-pad-w/2, pad+6*z, colGood, 1, 2)
	}
	y := pad + 18*z
	bf := ovFace(fkDisplayB, 40*z)
	col := uint32(colGood)
	if over {
		col = colBad
	} else if lim <= 0 {
		col = colText
	}
	v := strconv.Itoa(int(math.Round(st.spd(sp))))
	c.text(bf, v, pad, y+26*z, col, 1, 0)
	x := pad + textW(bf, v) + 8*z
	if lim > 0 {
		lf := ovFace(fkDisplay, 22*z)
		c.text(lf, "/ "+strconv.Itoa(int(math.Round(st.spd(lim))))+" "+st.spdU(), x, y+30*z, colMuted, 1, 0)
	} else {
		c.text(ovFace(fkDisplay, 18*z), st.spdU(), x, y+30*z, colMuted, 1, 0)
	}
	if over {
		c.text(ovFace(fkDisplayB, 22*z), st.T("SLOW DOWN", "FRENA"), W-pad, y+28*z, colBad, 1, 1)
	}
	y += 56 * z
	nf := ovFace(fkBody, 13*z)
	note := st.T("Keep it under the limit until the pit exit.", "Mantén la velocidad bajo el límite hasta la salida.")
	if act, _ := st.num("PitstopActive"); act != 0 {
		rep, _ := st.num("PitRepairLeft")
		opt, _ := st.num("PitOptRepairLeft")
		fuel, _ := st.num("PitSvFuel")
		note = st.T("Stopped", "Parado")
		if rep > 0 || opt > 0 {
			note += " · " + st.T("repairs ", "reparaciones ") + strconv.FormatFloat(rep, 'f', 1, 64) + " s"
			if opt > 0 {
				note += " (+" + strconv.FormatFloat(opt, 'f', 1, 64) + " " + st.T("optional", "opcionales") + ")"
			}
		}
		if fuel > 0 {
			note += " · " + st.T("fuel ", "gasolina ") + strconv.FormatFloat(st.vol(fuel), 'f', 1, 64) + " " + st.volU()
		}
	}
	c.text(nf, ellipsis(nf, note, W-2*pad), pad, y+10*z, colMuted, 1, 0)
	return int(math.Ceil(H))
}

func drawPitOv(c *ovCanvas, st *ovState, z float64) int {
	W := float64(c.w)
	pad := 14 * z
	if v, _ := st.num("OnPitRoad"); v != 0 {
		return drawPitLane(c, st, z)
	}
	cfg := st.uiMap("pit")
	loss, margin := uiNum(cfg, "loss", 25), uiNum(cfg, "margin", .3)
	fuel, hasFuel := st.num("FuelLevel")
	per := st.fuelPerLap()
	cellH := 54 * z
	nf := ovFace(fkBody, 13*z)
	if !hasFuel || per <= 0 {
		H := pad + 18*z + 30*z + pad
		panel(c, H, z)
		c.label(z, st.T("Pit stop", "Parada en boxes"), pad, pad+6*z, 0)
		c.text(nf, ellipsis(nf, st.T("Appears after your first full lap, once fuel use is known.", "Aparece tras tu primera vuelta completa, cuando se conoce el consumo."), W-2*pad), pad, pad+34*z, colMuted, 1, 0)
		return int(math.Ceil(H))
	}
	H := pad + 18*z + 2*cellH + 26*z + pad
	panel(c, H, z)
	c.label(z, st.T("Pit stop", "Parada en boxes"), pad, pad+6*z, 0)
	max := 0.0
	if st.ses != nil {
		max = st.ses.Car["DriverCarFuelMaxLtr"]
	}
	if max <= 0 {
		max = fuel
	}
	lapNow := int(func() float64 { v, _ := st.num("Lap"); return v }())
	lapsFuel, tank := fuel/per, max/per
	p, _ := st.num("LapDistPct")
	ll, hasLL := st.lapsLeftRace()
	left := math.Max(0, ll-p)
	stops, first, last := 0, 0, lapNow+int(math.Floor(lapsFuel))
	add, hasAdd := 0.0, false
	if hasLL {
		if need := left - lapsFuel; need > 0 {
			stops = int(math.Ceil(need/tank - 1e-6))
		}
		if stops > 0 {
			first = lapNow + int(math.Max(0, math.Ceil(left-float64(stops)*tank)))
			atStop := math.Max(0, fuel-float64(first-lapNow)*per)
			stint := (left-float64(first-lapNow))*per/float64(stops) + per*margin
			add, hasAdd = math.Max(0, math.Min(max-atStop, stint-atStop)), true
		}
	}
	// where you would rejoin: the cars racing behind you within the pit loss pass you
	le := st.estLap()
	myPos, _ := st.num("PlayerCarPosition")
	lose, nextI, nextG := 0, -1, 0.0
	for _, r := range st.relList() {
		if g := r.lapDiff * le; g < 0 && g > -loss {
			lose++
			if nextI < 0 || g < nextG {
				nextI, nextG = r.i, g
			}
		}
	}
	vf := ovFace(fkData, 22*z)
	colW := (W - 2*pad) / 3
	cell := func(i, j int, l, v string, col uint32) {
		x, y := pad+float64(j)*colW, pad+18*z+float64(i)*cellH
		c.labelFit(z, l, x, y+8*z, colW-8*z)
		c.text(vf, v, x, y+32*z, col, 1, 0)
	}
	sv, wv, av := "–", "–", "–"
	wcol := uint32(colText)
	if hasLL {
		sv = strconv.Itoa(stops)
		if stops > 0 {
			wv = fmt.Sprintf("%d–%d", first, last)
			if lapNow >= first {
				wcol = colGood
			}
		} else {
			wv = st.T("none", "no hace falta")
		}
	}
	if hasAdd {
		av = strconv.FormatFloat(st.vol(add), 'f', 1, 64) + " " + st.volU()
	}
	cell(0, 0, st.T("Stops left", "Paradas"), sv, colText)
	cell(0, 1, st.T("Window", "Ventana"), wv, wcol)
	cell(0, 2, st.T("Add", "Añadir"), av, colText)
	cell(1, 0, st.T("Laps of fuel", "Vueltas de gasolina"), strconv.FormatFloat(lapsFuel, 'f', 1, 64), colText)
	rj := "–"
	if myPos > 0 {
		rj = "P" + strconv.Itoa(int(myPos)+lose)
	}
	cell(1, 1, st.T("Rejoin", "Sales"), rj, colText)
	if myPos > 0 && lose > 0 {
		x := pad + colW + textW(vf, rj) + 6*z
		c.text(ovFace(fkDisplay, 15*z), "−"+strconv.Itoa(lose), x, pad+18*z+cellH+34*z, colBad, 1, 0)
	}
	cell(1, 2, st.T("Pit loss", "Pérdida"), strconv.Itoa(int(loss))+"s", colText)
	note := ""
	if stops > 0 {
		if lapNow >= first {
			note = st.T("Pit window is open. ", "La ventana de parada está abierta. ")
		} else {
			note = st.T(fmt.Sprintf("Window opens on lap %d. ", first), fmt.Sprintf("La ventana se abre en la vuelta %d. ", first))
		}
	}
	if nextI >= 0 && st.ses != nil {
		if d := st.ses.Drivers[nextI]; d != nil {
			note += st.T("You would come out near ", "Saldrías cerca de ") + "#" + d.Num + " " + d.Name
		}
	}
	c.text(nf, ellipsis(nf, note, W-2*pad), pad, pad+18*z+2*cellH+12*z, colMuted, 1, 0)
	return int(math.Ceil(H))
}

func drawSectorsOv(c *ovCanvas, st *ovState, z float64) int {
	W := float64(c.w)
	pad := 14 * z
	m := st.mem()
	cellH := 18 * z
	H := pad + 18*z + 22*z + 6*z + cellH + pad + 18*z
	if m.msLast != nil {
		H += 18*z + cellH
	}
	panel(c, H, z)
	c.label(z, st.T("Mini-sectors", "Minisectores"), pad, pad+6*z, 0)
	y := pad + 18*z
	// now against your best lap, the ideal lap (best of each piece), your best
	dsum, ref, done := 0.0, 0.0, 0
	for i, x := range m.msCur {
		if x != nil {
			dsum += x.dt
			done++
			if m.msBestLap != nil {
				ref += m.msBestLap[i]
			}
		}
	}
	ideal := 0.0
	for _, b := range m.msBest {
		if b < 0 {
			ideal = 0
			break
		}
		ideal += b
	}
	lf, vf := ovFace(fkData, 10*z), ovFace(fkData, 14*z)
	x := pad
	item := func(l, v string, col uint32) {
		l = strings.ToUpper(l)
		lw := textWT(lf, l, 0.8*z)
		c.textT(lf, l, x, y+11*z, colMuted, 1, 0, 0.8*z)
		c.text(vf, v, x+lw+6*z, y+11*z, col, 1, 0)
		x += lw + 6*z + textW(vf, v) + 16*z
	}
	cv, ccol := "–", uint32(colText)
	if m.msBestLap != nil && done > 0 {
		d := dsum - ref
		cv, ccol = signed(d, 2), colBad
		if d <= 0 {
			ccol = colGood
		}
	}
	item(st.T("Current lap", "Vuelta actual"), cv, ccol)
	item(st.T("Ideal lap", "Vuelta ideal"), fmtLap(ideal), colPB)
	item(st.T("Best", "Mejor"), fmtLap(m.msBestLapT), colText)
	y += 22*z + 6*z
	cells := func(a []*msCell, now bool) {
		gap := 2 * z
		cw := (W - 2*pad - (msN-1)*gap) / msN
		for i := 0; i < msN; i++ {
			cx := pad + float64(i)*(cw+gap)
			var x *msCell
			if i < len(a) {
				x = a[i]
			}
			switch {
			case x == nil:
				c.roundRect(cx, y, cw, cellH, 3*z, colSurf2, 1, colLine, 1, 1)
			default:
				col := uint32(colWarn)
				switch x.col {
				case 'p':
					col = colPB
				case 'g':
					col = colGood
				}
				c.roundRect(cx, y, cw, cellH, 3*z, col, 1, 0, 0, 0)
			}
			if now && i == m.msIdx {
				c.roundRect(cx-1, y-1, cw+2, cellH+2, 3*z, 0, 0, colText, 1, 1.5*z)
			}
		}
		y += cellH
	}
	cells(m.msCur, true)
	if m.msLast != nil {
		c.label(z, st.T("Last", "Última"), pad, y+9*z, 0)
		y += 18 * z
		cells(m.msLast, false)
	}
	// the legend
	y += 9 * z
	x = pad
	sf := ovFace(fkBody, 11.5*z)
	for _, it := range []struct {
		col uint32
		s   string
	}{{colPB, st.T("best of session", "mejor de la sesión")}, {colGood, st.T("faster than best lap", "más rápido que tu mejor vuelta")}, {colWarn, st.T("slower", "más lento")}} {
		c.roundRect(x, y-4*z, 8*z, 8*z, 2*z, it.col, 1, 0, 0, 0)
		c.text(sf, it.s, x+12*z, y, colMuted, 1, 0)
		x += 12*z + textW(sf, it.s) + 14*z
	}
	return int(math.Ceil(H))
}

var gapColours = []uint32{0x5c9dff, 0x38c97c, 0xffb02e, 0xff6363, 0xb98cff, 0x2ec4c4, 0xf28cd0, 0xc9d1dc, 0x9acd32, 0xff8f45}

func drawGapsOv(c *ovCanvas, st *ovState, z float64) int {
	W := float64(c.w)
	pad := 14 * z
	m := st.mem()
	cfg := st.uiMap("gaps")
	span, near := uiNum(cfg, "mins", 5)*60, int(uiNum(cfg, "cars", 2))
	plotH := 200 * z
	t, _ := st.num("SessionTime")
	pos := st.arr("CarIdxPosition")
	mev, _ := st.num("PlayerCarIdx")
	me := int(mev)
	my := 0
	if me >= 0 && me < len(pos) {
		my = int(pos[me])
	}
	var pick []int
	for i := range m.gapH {
		if my > 0 && i < len(pos) && pos[i] > 0 && int(math.Abs(pos[i]-float64(my))) <= near {
			pick = append(pick, i)
		}
	}
	sort.Slice(pick, func(a, b int) bool { return pos[pick[a]] < pos[pick[b]] })
	legendRows := (len(pick) + 1) / 2
	if legendRows == 0 {
		legendRows = 1
	}
	H := pad + 18*z + plotH + 8*z + float64(legendRows)*20*z + pad - 4*z
	panel(c, H, z)
	c.label(z, st.T("Gaps", "Gaps"), pad, pad+6*z, 0)
	top := pad + 18*z
	mx := 2.0
	for _, i := range pick {
		for _, p := range m.gapH[i] {
			if p[0] >= t-span {
				mx = math.Max(mx, math.Abs(p[1]))
			}
		}
	}
	mx = math.Ceil(mx * 1.15)
	pw := W - 2*pad - 46*z
	Y := func(v float64) float64 { return top + plotH/2 - v/mx*(plotH/2-8*z) }
	X := func(s float64) float64 { return pad + (s-(t-span))/span*pw }
	af := ovFace(fkData, 10.5*z)
	for _, v := range []float64{mx, mx / 2, 0, -mx / 2, -mx} {
		c.rect(pad, Y(v), pw, 1, colLine, 1)
		s := strconv.FormatFloat(v, 'f', 0, 64)
		if math.Mod(v, 1) != 0 {
			s = strconv.FormatFloat(v, 'f', 1, 64)
		}
		if v > 0 {
			s = "+" + s
		}
		c.text(af, s+"s", W-pad, Y(v), colMuted, 1, 1)
	}
	c.rect(pad, Y(0)-1, pw, 2, colAmber, 1)
	type leg struct {
		col uint32
		k   string
		v   string
		tr  string
		trc uint32
	}
	var legs []leg
	for k, i := range pick {
		if i == me {
			continue
		}
		var a [][2]float64
		for _, p := range m.gapH[i] {
			if p[0] >= t-span {
				a = append(a, p)
			}
		}
		if len(a) < 2 {
			continue
		}
		col := gapColours[k%len(gapColours)]
		for j := 1; j < len(a); j++ {
			c.line(X(a[j-1][0]), Y(a[j-1][1]), X(a[j][0]), Y(a[j][1]), 2*z, col, 1)
		}
		g := a[len(a)-1][1]
		d := &ovDriver{}
		if st.ses != nil && st.ses.Drivers[i] != nil {
			d = st.ses.Drivers[i]
		}
		parts := strings.Fields(d.Name)
		last := ""
		if len(parts) > 0 {
			last = parts[len(parts)-1]
		}
		l := leg{col: col, k: fmt.Sprintf("P%d #%s %s", int(pos[i]), d.Num, last), v: signed(g, 1)}
		if len(a) > 30 {
			tr := g - a[len(a)-31][1]
			l.tr, l.trc = "▲", colBad
			if tr < 0 {
				l.tr = "▼"
			}
			if (g > 0) == (tr < 0) {
				l.trc = colGood
			}
			l.tr += strconv.FormatFloat(math.Abs(tr), 'f', 1, 64)
		}
		legs = append(legs, l)
	}
	y := top + plotH + 8*z
	kf, vf := ovFace(fkData, 10.5*z), ovFace(fkData, 13*z)
	if len(legs) == 0 {
		nf := ovFace(fkBody, 12.5*z)
		c.text(nf, ellipsis(nf, st.T("Gaps to the cars around you appear after a few seconds.", "Los gaps con los coches cercanos aparecen en unos segundos."), W-2*pad), pad, y+10*z, colMuted, 1, 0)
	}
	colW := (W - 2*pad) / 2
	for k, l := range legs {
		x, yy := pad+float64(k%2)*colW, y+float64(k/2)*20*z+10*z
		c.text(kf, ellipsis(kf, l.k, colW*0.55), x, yy, l.col, 1, 0)
		vx := x + colW*0.58
		c.text(vf, l.v, vx, yy, colText, 1, 0)
		if l.tr != "" {
			c.text(kf, l.tr, vx+textW(vf, l.v)+6*z, yy, l.trc, 1, 0)
		}
	}
	return int(math.Ceil(H))
}

func drawIncidentsOv(c *ovCanvas, st *ovState, z float64) int {
	W := float64(c.w)
	pad := 14 * z
	m := st.mem()
	lim := 0
	if st.ses != nil {
		lim = st.ses.IncLimit
	}
	n := m.incN
	if !m.incHas {
		v, _ := st.num("PlayerCarMyIncidentCount")
		n = int(v)
	}
	rows := len(m.incLog)
	if rows == 0 {
		rows = 1
	}
	if rows > 8 {
		rows = 8
	}
	rowH := 22 * z
	H := pad + 18*z + 56*z + float64(rows)*rowH + pad
	if lim > 0 {
		H += 18 * z
	}
	panel(c, H, z)
	c.label(z, st.T("Incidents", "Incidentes"), pad, pad+6*z, 0)
	y := pad + 18*z
	col := uint32(colText)
	if lim > 0 && float64(n) >= float64(lim)*.75 {
		col = colBad
	}
	bf := ovFace(fkDisplayB, 44*z)
	c.text(bf, strconv.Itoa(n)+"x", pad, y+22*z, col, 1, 0)
	sub := st.T("no limit", "sin límite")
	if lim > 0 {
		sub = st.T(fmt.Sprintf("of %dx limit", lim), fmt.Sprintf("de %dx de límite", lim))
	}
	c.text(ovFace(fkBody, 12.5*z), sub, pad, y+48*z, colMuted, 1, 0)
	y += 56 * z
	if lim > 0 {
		mc := uint32(colAmber)
		if col == colBad {
			mc = colBad
		}
		meter(c, pad, y+2*z, W-2*pad, z, float64(n)/float64(lim), mc)
		y += 18 * z
	}
	kf, vf := ovFace(fkBody, 13*z), ovFace(fkData, 13*z)
	if len(m.incLog) == 0 {
		c.text(kf, st.T("Clean so far", "Limpio hasta ahora"), pad, y+rowH/2, colMuted, 1, 0)
	}
	for k, e := range m.incLog {
		if k >= rows {
			break
		}
		if k > 0 {
			c.rect(pad, y, W-2*pad, 1, colLine, 1)
		}
		c.text(kf, fmt.Sprintf("%s %d · %d%%", st.T("Lap", "Vuelta"), e.lap, int(math.Round(e.pct*100))), pad, y+rowH/2, colText, 1, 0)
		c.text(vf, fmt.Sprintf("+%dx", e.d), W-pad-48*z, y+rowH/2, colBad, 1, 1)
		c.text(vf, fmt.Sprintf("%dx", e.tot), W-pad, y+rowH/2, colMuted, 1, 1)
		y += rowH
	}
	return int(math.Ceil(H))
}
