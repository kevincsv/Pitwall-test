package main

// Native overlays, fifth part: the weather and the track (temperatures, the wind against your car, rain and how
// wet the track is), the car's controls (the in-car adjustments, lit up as you change them), the track position
// bar (every car along the lap on one line) and the PC's performance (frames a second, GPU and CPU, the
// connection). Like the rest, each asks the PC only for what it shows.

import (
	"fmt"
	"math"
	"sort"
	"strconv"
	"time"
)

func extraOverlay(name string) bool {
	switch name {
	case "weather", "controls", "trackbar", "system":
		return true
	}
	return false
}

// extraVars: what each asks the PC for
func extraVars(name string) []string {
	switch name {
	case "weather":
		return []string{"AirTemp", "TrackTempCrew", "TrackTemp", "WindVel", "WindDir", "YawNorth", "Skies", "RelativeHumidity", "Precipitation",
			"TrackWetness", "WeatherDeclaredWet", "SessionTimeOfDay", "SolarAltitude"}
	case "controls":
		out := []string{}
		for _, r := range controlRows {
			out = append(out, r.name)
			if r.max {
				out = append(out, r.name+"Max")
			}
		}
		return out
	case "trackbar":
		return []string{"CarIdxLapDistPct", "CarIdxOnPitRoad", "CarIdxTrackSurface", "CarIdxPosition", "PlayerCarPosition"}
	case "system":
		return []string{"FrameRate", "GpuUsage", "CpuUsageFG", "ChanLatency", "ChanQuality"}
	}
	return nil
}

// ovMem5: what these overlays keep between frames
type ovMem5 struct {
	ctl   map[string]float64   // controls: each value as last seen
	ctlAt map[string]time.Time // and when it changed (its row lights up for a moment)
	fps   []float64            // performance: one frame rate a second, the last minute
	fpsAt time.Time
}

// the in-car adjustments the game can give (each car has its own few): shown only when the car has them
type controlRow struct {
	name, en, es string
	max          bool // the game also gives <name>Max: shown as "3 / 12"
	kind         byte // 'i' a step, 'p' a percentage, 'b' on or off, 'f' a number with a decimal
}

var controlRows = []controlRow{
	{"dcBrakeBias", "Brake bias", "Reparto de frenada", false, 'p'},
	{"dcPeakBrakeBias", "Peak brake bias", "Reparto de frenada pico", false, 'p'},
	{"dcTractionControl", "Traction control", "Control de tracción", true, 'i'},
	{"dcTractionControl2", "Traction control 2", "Control de tracción 2", true, 'i'},
	{"dcTractionControlToggle", "TC", "TC", false, 'b'},
	{"dcABS", "ABS", "ABS", true, 'i'},
	{"dcAntiRollFront", "Anti-roll bar front", "Barra delantera", false, 'i'},
	{"dcAntiRollRear", "Anti-roll bar rear", "Barra trasera", false, 'i'},
	{"dcDiffEntry", "Diff entry", "Diferencial entrada", false, 'i'},
	{"dcDiffMiddle", "Diff middle", "Diferencial medio", false, 'i'},
	{"dcDiffExit", "Diff exit", "Diferencial salida", false, 'i'},
	{"dcDiffPreload", "Diff preload", "Precarga del diferencial", false, 'i'},
	{"dcEngineMap", "Engine map", "Mapa de motor", true, 'i'},
	{"dcFuelMixture", "Fuel mixture", "Mezcla", false, 'i'},
	{"dcThrottleShape", "Throttle map", "Mapa de acelerador", false, 'i'},
	{"dcEngineBraking", "Engine braking", "Freno motor", false, 'i'},
	{"dcMGUKDeployMode", "Hybrid deploy", "Despliegue híbrido", false, 'i'},
	{"dcMGUKDeployFixed", "Hybrid fixed deploy", "Despliegue híbrido fijo", false, 'i'},
	{"dcMGUKRegenGain", "Hybrid regen", "Regeneración híbrida", false, 'i'},
	{"dcWingFront", "Front wing", "Alerón delantero", false, 'f'},
	{"dcWingRear", "Rear wing", "Alerón trasero", false, 'f'},
	{"dcWeightJackerRight", "Weight jacker", "Weight jacker", false, 'f'},
	{"dcPowerSteering", "Power steering", "Dirección asistida", false, 'i'},
	{"dcPitSpeedLimiterToggle", "Pit limiter", "Limitador de boxes", false, 'b'},
	{"dcToggleWindshieldWipers", "Wipers", "Limpiaparabrisas", false, 'b'},
}

func drawExtraOv(name string, c *ovCanvas, st *ovState, z float64, now time.Time) int {
	switch name {
	case "weather":
		return drawWeatherOv(c, st, z)
	case "controls":
		return drawControlsOv(c, st, z, now)
	case "trackbar":
		return drawTrackbarOv(c, st, z)
	case "system":
		return drawSystemOv(c, st, z, now)
	}
	return 0
}

// ---------- the weather ----------

// compassFrom: the eight points of the compass for a direction in radians, clockwise from north
func compassFrom(rad float64) string {
	pts := []string{"N", "NE", "E", "SE", "S", "SW", "W", "NW"}
	k := int(math.Round(rad/(math.Pi/4))) % 8
	if k < 0 {
		k += 8
	}
	return pts[k]
}

func drawWeatherOv(c *ovCanvas, st *ovState, z float64) int {
	W := float64(c.w)
	pad := 14 * z
	H := pad + 18*z + 48*z + 58*z + 24*z + 26*z + pad - 6*z
	panel(c, H, z)
	c.label(z, st.T("Weather", "Tiempo"), pad, pad+6*z, 0)
	// the game's clock at the right, with the sun up or down
	if tod, ok := st.num("SessionTimeOfDay"); ok && tod >= 0 {
		f := ovFace(fkData, 12*z)
		s := fmt.Sprintf("%02d:%02d", int(tod)/3600%24, int(tod)/60%60)
		c.text(f, s, W-pad, pad+6*z, colText, 1, 1)
		if alt, ok := st.num("SolarAltitude"); ok {
			x := W - pad - textW(f, s) - 10*z
			if alt > 0 {
				c.disc(x, pad+6*z, 4.5*z, colAmber, 1)
			} else {
				c.ring(x, pad+6*z, 4*z, 1.5*z, colMuted, 1)
			}
		}
	}
	y := pad + 18*z
	// the track and the air, side by side
	temp := func(name, alt, en, es string, x float64) {
		v, ok := st.num(name)
		if !ok && alt != "" {
			v, ok = st.num(alt)
		}
		c.label(z, st.T(en, es), x, y+6*z, 0)
		s, col := "–", uint32(colMuted)
		if ok {
			s, col = strconv.FormatFloat(st.tmp(v), 'f', 1, 64), colText
		}
		c.valueUnit(font_{ovFace(fkDisplayB, 26*z), 26 * z}, z, s, st.tmpU(), x, y+32*z, col)
	}
	temp("TrackTempCrew", "TrackTemp", "Track", "Pista", pad)
	temp("AirTemp", "", "Air", "Aire", pad+(W-2*pad)/2)
	y += 48 * z
	// the wind against your car: a ring with your nose at the top, the arrow blows across it
	r := 22 * z
	cx, cy := pad+r, y+r+5*z
	c.ring(cx, cy, r, 1.5*z, colLine, 1)
	c.tri(cx, cy-r-3*z, cx-4*z, cy-r+4*z, cx+4*z, cy-r+4*z, colMuted, 1)
	tf, sf := ovFace(fkDataB, 14*z), ovFace(fkBody, 12*z)
	tx := pad + 2*r + 12*z
	wv, hasW := st.num("WindVel")
	wd, hasD := st.num("WindDir")
	if hasW && hasD {
		// the wind comes from WindDir (from the north, clockwise); against the car's heading, where it comes from
		// relative to the nose; both come from the game in the same sense, so their difference is the angle
		rel := wd
		if yn, ok := st.num("YawNorth"); ok {
			rel = wd - yn
		}
		fx, fy := math.Sin(rel), -math.Cos(rel) // the point of the ring the wind comes from (nose up)
		col := uint32(colBlue)
		if wv*3.6 > 25 {
			col = colAmber
		}
		x0, y0, x1, y1 := cx+fx*r*0.78, cy+fy*r*0.78, cx-fx*r*0.78, cy-fy*r*0.78
		c.line(x0, y0, x1, y1, 2.2*z, col, 1)
		hx, hy := -fx, -fy // the arrowhead where it blows to
		c.tri(x1+hx*4*z, y1+hy*4*z, x1-hy*5*z-hx*6*z, y1+hx*5*z-hy*6*z, x1+hy*5*z-hx*6*z, y1-hx*5*z-hy*6*z, col, 1)
		c.text(tf, st.T("Wind", "Viento")+" "+strconv.FormatFloat(st.spd(wv), 'f', 0, 64)+" "+st.spdU()+" · "+st.T("from", "del")+" "+compassFrom(wd), tx, y+16*z, colText, 1, 0)
		a := math.Abs(math.Mod(rel+3*math.Pi, 2*math.Pi) - math.Pi) // 0 from ahead … π from behind
		kind := st.T("Crosswind", "Viento cruzado")
		switch {
		case a < math.Pi/4:
			kind = st.T("Headwind", "Viento de cara")
		case a > 3*math.Pi/4:
			kind = st.T("Tailwind", "Viento de cola")
		}
		c.text(sf, kind, tx, y+36*z, colMuted, 1, 0)
	} else {
		c.text(tf, st.T("Wind", "Viento")+" –", tx, y+16*z, colMuted, 1, 0)
	}
	y += 58 * z
	// the sky and the humidity
	sky := "–"
	if v, ok := st.num("Skies"); ok {
		en := []string{"Clear", "Partly cloudy", "Mostly cloudy", "Overcast"}
		es := []string{"Despejado", "Parcialmente nublado", "Muy nublado", "Cubierto"}
		if k := int(v); k >= 0 && k < len(en) {
			sky = st.T(en[k], es[k])
		}
	}
	hum := ""
	if v, ok := st.num("RelativeHumidity"); ok {
		if v <= 1 {
			v *= 100
		}
		hum = " · " + st.T("humidity", "humedad") + " " + strconv.Itoa(int(math.Round(v))) + "%"
	}
	c.text(sf, st.T("Sky", "Cielo")+": "+sky+hum, pad, y+10*z, colText, 1, 0)
	y += 24 * z
	// rain and how wet the track is
	rain := "–"
	if v, ok := st.num("Precipitation"); ok {
		if v <= 1 {
			v *= 100
		}
		rain = strconv.Itoa(int(math.Round(v))) + "%"
	}
	wet := ""
	if v, ok := st.num("TrackWetness"); ok {
		en := []string{"", "dry", "mostly dry", "very lightly wet", "lightly wet", "moderately wet", "very wet", "extremely wet"}
		es := []string{"", "seca", "casi seca", "muy ligeramente mojada", "ligeramente mojada", "moderadamente mojada", "muy mojada", "extremadamente mojada"}
		if k := int(v); k > 0 && k < len(en) {
			wet = " · " + st.T("track", "pista") + " " + st.T(en[k], es[k])
		}
	}
	c.text(sf, st.T("Rain", "Lluvia")+" "+rain+wet, pad, y+10*z, colText, 1, 0)
	if v, _ := st.num("WeatherDeclaredWet"); v != 0 {
		pf := ovFace(fkDataB, 10.5*z)
		s := st.T("DECLARED WET", "EN MOJADO")
		w := textW(pf, s) + 12*z
		c.roundRect(W-pad-w, y+2*z, w, 17*z, 4*z, colBad, 0.9, 0, 0, 0)
		c.text(pf, s, W-pad-w/2, y+10*z, 0xffffff, 1, 2)
	}
	return int(math.Ceil(H))
}

// ---------- the car's controls ----------

func drawControlsOv(c *ovCanvas, st *ovState, z float64, now time.Time) int {
	W := float64(c.w)
	pad := 14 * z
	rowH := 24 * z
	m := &st.x5
	if m.ctl == nil {
		m.ctl, m.ctlAt = map[string]float64{}, map[string]time.Time{}
	}
	type row struct {
		r     controlRow
		v, mx float64
		hasMx bool
		hot   bool // changed a moment ago
	}
	rows := []row{}
	for _, r := range controlRows {
		v, ok := st.num(r.name)
		if !ok {
			continue
		}
		if last, seen := m.ctl[r.name]; !seen {
			m.ctl[r.name] = v
		} else if last != v {
			m.ctl[r.name], m.ctlAt[r.name] = v, now
		}
		mx, hasMx := 0.0, false
		if r.max {
			mx, hasMx = st.num(r.name + "Max")
			hasMx = hasMx && mx > 0
		}
		at := m.ctlAt[r.name]
		rows = append(rows, row{r, v, mx, hasMx, !at.IsZero() && now.Sub(at) < 2500*time.Millisecond})
	}
	n := len(rows)
	if n == 0 {
		n = 1
	}
	H := pad + 18*z + float64(n)*rowH + pad - 6*z
	panel(c, H, z)
	c.label(z, st.T("Car controls", "Ajustes del coche"), pad, pad+6*z, 0)
	y := pad + 18*z
	kf, vf := ovFace(fkBody, 13.5*z), ovFace(fkDataB, 14*z)
	if len(rows) == 0 {
		c.labelFit(z, st.T("Nothing adjustable in this car yet", "Nada ajustable en este coche aún"), pad, y+rowH/2, W-2*pad)
		return int(math.Ceil(H))
	}
	for k, r := range rows {
		if k > 0 {
			c.rect(pad, y, W-2*pad, 1, colLine, 1)
		}
		if r.hot {
			c.roundRect(pad-6*z, y+2*z, W-2*pad+12*z, rowH-4*z, 5*z, colAmber, 0.14, 0, 0, 0)
		}
		col := uint32(colText)
		var val string
		switch r.r.kind {
		case 'p':
			val = strconv.FormatFloat(r.v, 'f', 1, 64) + " %"
		case 'f':
			val = strconv.FormatFloat(r.v, 'f', 1, 64)
		case 'b':
			if r.v != 0 {
				val, col = st.T("On", "Sí"), colAmber
			} else {
				val, col = st.T("Off", "No"), colMuted
			}
		default:
			val = strconv.Itoa(int(math.Round(r.v)))
			if r.hasMx {
				val += " / " + strconv.Itoa(int(math.Round(r.mx)))
			}
		}
		if r.hot {
			col = colAmber
		}
		c.text(kf, st.T(r.r.en, r.r.es), pad, y+rowH/2, colMuted, 1, 0)
		c.text(vf, val, W-pad, y+rowH/2, col, 1, 1)
		y += rowH
	}
	return int(math.Ceil(H))
}

// ---------- the track position bar ----------

// classColor: the colour the game gives a car's class, or one of ours by the order of the classes; one class
// alone is a quiet grey
func classColor(st *ovState, d *ovDriver) uint32 {
	ids := map[int]bool{}
	for _, x := range st.ses.Drivers {
		if x != nil && !x.Skip {
			ids[x.Class] = true
		}
	}
	if len(ids) <= 1 {
		return 0xc9d1da
	}
	if d.ClassCol != 0 && d.ClassCol != 0xffffff {
		return d.ClassCol
	}
	order := []int{}
	for k := range ids {
		order = append(order, k)
	}
	sort.Ints(order)
	pal := []uint32{colBlue, colAmber, colGood, 0xff6fb5, 0xb98cff, 0x5ad1c8}
	for k, id := range order {
		if id == d.Class {
			return pal[k%len(pal)]
		}
	}
	return 0xc9d1da
}

func drawTrackbarOv(c *ovCanvas, st *ovState, z float64) int {
	W := float64(c.w)
	pad := 14 * z
	H := 62 * z
	panel(c, H, z)
	x0, x1 := pad+6*z, W-pad-6*z
	by := H/2 + 3*z
	c.roundRect(x0, by-4*z, x1-x0, 8*z, 4*z, colSurf2, 1, colLine, 1, 1)
	for k := 0; k < 4; k++ { // the start/finish line, a small checker at the left end
		col := uint32(colText)
		if k%2 == 1 {
			col = 0x000000
		}
		c.rect(x0-1.5*z, by-6*z+float64(k)*3*z, 3*z, 3*z, col, 1)
	}
	pct, pit, surf, pos := st.arr("CarIdxLapDistPct"), st.arr("CarIdxOnPitRoad"), st.arr("CarIdxTrackSurface"), st.arr("CarIdxPosition")
	mev, _ := st.num("PlayerCarIdx")
	me := int(mev)
	if st.ses == nil || len(pct) == 0 {
		return int(H)
	}
	at := func(a []float64, i int) float64 {
		if i >= 0 && i < len(a) {
			return a[i]
		}
		return 0
	}
	xOf := func(p float64) float64 { return x0 + p*(x1-x0) }
	type near struct {
		idx int
		d   float64 // along the track from you, as a part of the lap (+ ahead)
	}
	nears := []near{}
	for i, p := range pct {
		d := st.ses.Drivers[i]
		if i == me || p < 0 || d == nil || d.Skip || (i < len(surf) && (surf[i] < 0 || surf[i] == 1)) {
			continue
		}
		col, a := classColor(st, d), 1.0
		if at(pit, i) != 0 {
			a = 0.4
		}
		x := xOf(p)
		c.disc(x, by, 4.2*z, col, a)
		if at(pos, i) == 1 {
			c.ring(x, by, 5.6*z, 1.2*z, colText, a)
		}
		if me >= 0 && me < len(pct) && pct[me] >= 0 {
			dd := p - pct[me]
			if dd > .5 {
				dd--
			} else if dd < -.5 {
				dd++
			}
			nears = append(nears, near{i, dd})
		}
	}
	if me < 0 || me >= len(pct) || pct[me] < 0 {
		return int(H)
	}
	// the numbers of the two cars just ahead and the two just behind on the track, under the bar
	sort.Slice(nears, func(a, b int) bool { return math.Abs(nears[a].d) < math.Abs(nears[b].d) })
	nf := ovFace(fkData, 10.5*z)
	ahead, behind := 0, 0
	for _, n := range nears {
		if n.d > 0 && ahead < 2 || n.d < 0 && behind < 2 {
			if n.d > 0 {
				ahead++
			} else {
				behind++
			}
			if d := st.ses.Drivers[n.idx]; d != nil && d.Num != "" {
				c.text(nf, "#"+d.Num, xOf(at(pct, n.idx)), by+14*z, colMuted, 1, 2)
			}
		}
	}
	x := xOf(pct[me])
	c.ring(x, by, 7.5*z, 2*z, colText, 1)
	c.disc(x, by, 5.5*z, colAmber, 1)
	if p, ok := st.num("PlayerCarPosition"); ok && p > 0 {
		c.text(ovFace(fkDataB, 11*z), "P"+strconv.Itoa(int(p)), x, by-14*z, colAmber, 1, 2)
	}
	return int(H)
}

// ---------- the PC's performance ----------

func drawSystemOv(c *ovCanvas, st *ovState, z float64, now time.Time) int {
	W := float64(c.w)
	pad := 14 * z
	m := &st.x5
	fps, hasFps := st.num("FrameRate")
	if hasFps && now.Sub(m.fpsAt) >= time.Second {
		m.fpsAt = now
		m.fps = append(m.fps, fps)
		if len(m.fps) > 60 {
			m.fps = m.fps[len(m.fps)-60:]
		}
	}
	rowH := 26 * z
	H := pad + 18*z + 50*z + 3*rowH + pad - 6*z
	panel(c, H, z)
	c.label(z, st.T("Performance", "Rendimiento"), pad, pad+6*z, 0)
	y := pad + 18*z
	// frames a second, big, with the last minute beside it
	s, col := "–", uint32(colMuted)
	if hasFps {
		s, col = strconv.Itoa(int(math.Round(fps))), colText
		switch {
		case fps < 30:
			col = colBad
		case fps < 55:
			col = colWarn
		}
	}
	c.valueUnit(font_{ovFace(fkDisplayB, 34*z), 34 * z}, z, s, "fps", pad, y+22*z, col)
	if len(m.fps) > 1 {
		gx0, gx1, gy0, gy1 := W/2, W-pad, y+4*z, y+42*z
		top := 60.0
		for _, v := range m.fps {
			top = math.Max(top, v)
		}
		c.rect(gx0, gy1, gx1-gx0, 1, colLine, 1)
		step := (gx1 - gx0) / 59
		for k := 1; k < len(m.fps); k++ {
			xa, xb := gx0+float64(k-1)*step, gx0+float64(k)*step
			ya, yb := gy1-(gy1-gy0)*clamp01(m.fps[k-1]/top), gy1-(gy1-gy0)*clamp01(m.fps[k]/top)
			c.line(xa, ya, xb, yb, 1.5*z, colMuted, 0.9)
		}
	}
	y += 50 * z
	kf, vf := ovFace(fkBody, 13.5*z), ovFace(fkData, 14*z)
	use := func(label, name string) {
		c.rect(pad, y, W-2*pad, 1, colLine, 1)
		c.text(kf, label, pad, y+rowH/2, colMuted, 1, 0)
		if v, ok := st.num(name); ok {
			if v <= 1 {
				v *= 100
			}
			mc := uint32(colBlue)
			switch {
			case v > 90:
				mc = colBad
			case v > 75:
				mc = colAmber
			}
			meter(c, pad+56*z, y+rowH/2-4*z, W-2*pad-56*z-50*z, z, v/100, mc)
			c.text(vf, strconv.Itoa(int(math.Round(v)))+"%", W-pad, y+rowH/2, colText, 1, 1)
		} else {
			c.text(vf, "–", W-pad, y+rowH/2, colMuted, 1, 1)
		}
		y += rowH
	}
	use("GPU", "GpuUsage")
	use("CPU", "CpuUsageFG")
	// the connection with iRacing's server
	c.rect(pad, y, W-2*pad, 1, colLine, 1)
	c.text(kf, st.T("Connection", "Conexión"), pad, y+rowH/2, colMuted, 1, 0)
	lat, hasLat := st.num("ChanLatency")
	q, hasQ := st.num("ChanQuality")
	if !hasLat && !hasQ {
		c.text(vf, "–", W-pad, y+rowH/2, colMuted, 1, 1)
		return int(math.Ceil(H))
	}
	parts, col := "", uint32(colText)
	if hasLat {
		if st.unitOf["ChanLatency"] == "s" || lat < 5 { // the game says it in seconds
			lat *= 1000
		}
		switch {
		case lat > 300:
			col = colBad
		case lat > 150:
			col = colAmber
		}
		parts = strconv.Itoa(int(math.Round(lat))) + " ms"
	}
	if hasQ {
		if q <= 1 {
			q *= 100
		}
		switch {
		case q < 60:
			col = colBad
		case q < 80 && col == colText:
			col = colAmber
		}
		if parts != "" {
			parts += " · "
		}
		parts += strconv.Itoa(int(math.Round(q))) + "%"
	}
	c.text(vf, parts, W-pad, y+rowH/2, col, 1, 1)
	return int(math.Ceil(H))
}
