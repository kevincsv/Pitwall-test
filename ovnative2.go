package main

// Native overlays, second part: the gauges (flag, dash, timing, fuel, engine, tyres, inputs, boost, telemetry and
// the g-force circle). They show the same as the app's widgets, with its fonts, colours and labels, in its
// language and units, and remember between frames what they need (fuel per lap, the input trace, the g trail).

import (
	"fmt"
	"math"
	"strconv"
	"strings"
	"sync"
	"time"

	"golang.org/x/image/font"
)

func gaugeOverlay(name string) bool {
	switch name {
	case "flag", "dash", "timing", "fuel", "engine", "tyres", "inputs", "boost", "telemetry", "gg":
		return true
	}
	return false
}

// the telemetry overlay's default list (the app's UI_DEFAULTS.tel)
var telDefault = []string{"LatAccel", "LongAccel", "YawRate", "SteeringWheelAngle", "FuelUsePerHour", "OilTemp", "WaterTemp", "Voltage"}

// gaugeVars: what each gauge asks the PC for
func gaugeVars(name string, st *ovState) []string {
	switch name {
	case "flag":
		return []string{"SessionFlags"}
	case "dash":
		return []string{"Gear", "Speed", "RPM", "Throttle", "Brake", "Clutch", "PlayerCarSLShiftRPM", "dcTractionControl", "dcTractionControlMax", "dcTractionControl2", "dcTractionControl2Max",
			"dcABS", "dcABSMax", "dcEngineMap", "dcEngineMapMax", "dcBrakeBias", "VirtualEnergyPct", "EnergyERSBatteryPct"}
	case "timing":
		return []string{"LapCurrentLapTime", "LapBestLapTime", "LapLastLapTime", "LapDistPct", "LapDeltaToBestLap", "LapDeltaToBestLap_OK", "LapDeltaToSessionBestLap", "LapDeltaToSessionBestLap_OK",
			"LapDeltaToOptimalLap", "LapDeltaToOptimalLap_OK", "LapDeltaToSessionOptimalLap", "LapDeltaToSessionOptimalLap_OK"}
	case "fuel":
		return []string{"FuelLevel", "FuelLevelPct", "FuelUsePerHour", "LapLastLapTime", "LapCompleted", "LapDistPct", "OnPitRoad", "SessionLapsRemainEx", "SessionTimeRemain"}
	case "engine":
		return []string{"WaterTemp", "OilTemp", "OilPress", "Voltage", "AirTemp", "TrackTempCrew"}
	case "tyres":
		out := []string{}
		for _, c := range []string{"LF", "RF", "LR", "RR"} {
			for _, k := range []string{"tempL", "tempM", "tempR", "tempCL", "tempCM", "tempCR", "wearL", "wearM", "wearR"} {
				out = append(out, c+k)
			}
		}
		return out
	case "inputs":
		return []string{"Gear", "Speed", "Throttle", "Brake", "Clutch", "SteeringWheelAngle", "BrakeABSactive"}
	case "boost":
		return []string{"DRS_Status", "P2P_Status", "P2P_Count", "EnergyERSBatteryPct", "EnergyMGU_KLapDeployPct"}
	case "telemetry":
		st.mu.Lock()
		v := uiList(st.uiMap("tel"), "vars", telDefault)
		st.mu.Unlock()
		return v
	case "gg":
		return []string{"LatAccel", "LongAccel", "LapCompleted"}
	}
	return nil
}

// ---------- what the gauges remember ----------

type ovLive struct {
	fuelInit  bool
	fuelLap   int
	fuelStart float64
	fuelPit   bool
	fuelUses  []float64
	trace     [][5]float64 // throttle, brake, clutch, steering (−1…1), ABS
	gg        [][2]float64
	ggLap     int
	ggLat     float64
	ggBrk     float64
	ggAcc     float64
	telHist   map[string][]float64
	p2pOn     bool
	p2pSince  time.Time
}

// collect keeps what the gauges need from each frame; st.mu is held
func (st *ovState) collect() {
	L := &st.live
	f := func(n string) float64 { v, _ := st.num(n); return v }
	if lc, ok := st.num("LapCompleted"); ok {
		fuel, hasFuel := st.num("FuelLevel")
		if !L.fuelInit {
			L.fuelInit, L.fuelLap, L.fuelStart = true, int(lc), fuel
		} else if int(lc) != L.fuelLap {
			if int(lc) == L.fuelLap+1 && hasFuel && L.fuelStart > 0 && !L.fuelPit {
				if use := L.fuelStart - fuel; use > 0 {
					L.fuelUses = append(L.fuelUses, use)
					if len(L.fuelUses) > 10 {
						L.fuelUses = L.fuelUses[1:]
					}
				}
			}
			L.fuelLap, L.fuelStart, L.fuelPit = int(lc), fuel, false
		}
		if f("OnPitRoad") != 0 {
			L.fuelPit = true
		}
	}
	if _, ok := st.num("Throttle"); ok {
		clu := 1.0
		if v, ok := st.num("Clutch"); ok {
			clu = v
		}
		steer := math.Max(-1, math.Min(1, -f("SteeringWheelAngle")/(math.Pi*1.5)))
		L.trace = append(L.trace, [5]float64{f("Throttle"), f("Brake"), 1 - clu, steer, f("BrakeABSactive")})
		if len(L.trace) > 1800 {
			L.trace = L.trace[len(L.trace)-1800:]
		}
	}
	if lat, ok := st.num("LatAccel"); ok {
		lat /= 9.81
		lon := f("LongAccel") / 9.81
		if lc := int(f("LapCompleted")); lc != L.ggLap {
			L.ggLap, L.ggLat, L.ggBrk, L.ggAcc = lc, 0, 0, 0
		}
		L.ggLat = math.Max(L.ggLat, math.Abs(lat))
		if lon < 0 {
			L.ggBrk = math.Max(L.ggBrk, -lon)
		} else {
			L.ggAcc = math.Max(L.ggAcc, lon)
		}
		L.gg = append(L.gg, [2]float64{lat, lon})
		if len(L.gg) > 90 {
			L.gg = L.gg[1:]
		}
	}
	if L.telHist == nil {
		L.telHist = map[string][]float64{}
	}
	for _, n := range uiList(st.uiMap("tel"), "vars", telDefault) {
		if v, ok := st.num(n); ok {
			h := append(L.telHist[n], v)
			if len(h) > 120 {
				h = h[1:]
			}
			L.telHist[n] = h
		}
	}
	st.collectSession()
	st.collectLaps()
	if on := f("P2P_Status") != 0; on != L.p2pOn {
		L.p2pOn = on
		if on {
			L.p2pSince = time.Now()
		}
	}
}

// ---------- units, as the app ----------

func (st *ovState) imperial() bool { return st.units == "imperial" }
func (st *ovState) spd(ms float64) float64 {
	if st.imperial() {
		return ms * 2.23694
	}
	return ms * 3.6
}
func (st *ovState) spdU() string {
	if st.imperial() {
		return "mph"
	}
	return "km/h"
}
func (st *ovState) vol(l float64) float64 {
	if st.imperial() {
		return l * 0.264172
	}
	return l
}
func (st *ovState) volU() string {
	if st.imperial() {
		return "gal"
	}
	return "L"
}
func (st *ovState) tmp(c float64) float64 {
	if st.imperial() {
		return c*9/5 + 32
	}
	return c
}
func (st *ovState) tmpU() string {
	if st.imperial() {
		return "°F"
	}
	return "°C"
}

// ---------- shapes the gauges need ----------

// line draws a smooth line with round ends
func (c *ovCanvas) line(x0, y0, x1, y1, w float64, col uint32, a float64) {
	dx, dy := x1-x0, y1-y0
	l2 := dx*dx + dy*dy
	r := w / 2
	for py := int(math.Min(y0, y1) - r - 1); py <= int(math.Max(y0, y1)+r+1); py++ {
		for px := int(math.Min(x0, x1) - r - 1); px <= int(math.Max(x0, x1)+r+1); px++ {
			qx, qy := float64(px)+0.5-x0, float64(py)+0.5-y0
			t := 0.0
			if l2 > 0 {
				t = math.Max(0, math.Min(1, (qx*dx+qy*dy)/l2))
			}
			d := math.Hypot(qx-t*dx, qy-t*dy) - r
			c.blend(px, py, col, a*clamp01(0.5-d))
		}
	}
}

// ring draws a circle's outline (w wide); disc fills one
func (c *ovCanvas) ring(cx, cy, r, w float64, col uint32, a float64) {
	for py := int(cy - r - w - 1); py <= int(cy+r+w+1); py++ {
		for px := int(cx - r - w - 1); px <= int(cx+r+w+1); px++ {
			d := math.Abs(math.Hypot(float64(px)+0.5-cx, float64(py)+0.5-cy)-r) - w/2
			c.blend(px, py, col, a*clamp01(0.5-d))
		}
	}
}

func (c *ovCanvas) disc(cx, cy, r float64, col uint32, a float64) {
	for py := int(cy - r - 1); py <= int(cy+r+1); py++ {
		for px := int(cx - r - 1); px <= int(cx+r+1); px++ {
			d := math.Hypot(float64(px)+0.5-cx, float64(py)+0.5-cy) - r
			c.blend(px, py, col, a*clamp01(0.5-d))
		}
	}
}

// hsl turns the app's hsl() colours into RGB
func hsl(h, s, l float64) uint32 {
	h = math.Mod(h, 360) / 360
	q := l * (1 + s)
	if l >= 0.5 {
		q = l + s - l*s
	}
	p := 2*l - q
	f := func(t float64) uint32 {
		if t < 0 {
			t++
		}
		if t > 1 {
			t--
		}
		v := p
		switch {
		case t < 1.0/6:
			v = p + (q-p)*6*t
		case t < 0.5:
			v = q
		case t < 2.0/3:
			v = p + (q-p)*(2.0/3-t)*6
		}
		return uint32(math.Round(v * 255))
	}
	return f(h+1.0/3)<<16 | f(h)<<8 | f(h-1.0/3)
}

// the app's labels: small, uppercase, spaced (.label)
func (c *ovCanvas) label(z float64, s string, x, cy float64, align int) {
	c.textT(ovFace(fkData, 11*z), strings.ToUpper(s), x, cy, colMuted, 1, align, 1.1*z)
}

// labelFit is a label cut with "…" to fit maxW
func (c *ovCanvas) labelFit(z float64, s string, x, cy, maxW float64) {
	f, tr := ovFace(fkData, 11*z), 1.1*z
	s = strings.ToUpper(s)
	r := []rune(s)
	for len(r) > 1 && textWT(f, string(r), tr) > maxW {
		r = r[:len(r)-1]
		s = string(r) + "…"
		if textWT(f, s, tr) <= maxW {
			break
		}
	}
	c.textT(f, s, x, cy, colMuted, 1, 0, tr)
}

// a value with its unit after it (.mid + .unit); returns its width
func (c *ovCanvas) valueUnit(f font_, z float64, v, unit string, x, cy float64, col uint32) float64 {
	c.text(f.face, v, x, cy, col, 1, 0)
	w := textW(f.face, v)
	if unit != "" {
		uf := ovFace(fkDisplay, 15*z)
		c.text(uf, unit, x+w+4*z, cy+f.size*0.12, colMuted, 1, 0)
		w += 4*z + textW(uf, unit)
	}
	return w
}

// font_ carries a face and its size (for the unit's baseline)
type font_ struct {
	face font.Face
	size float64
}

const (
	colWarn  = 0xf2c94c
	colBlue  = 0x5c9dff
	colSurf2 = 0x1e2631
)

func fmtCur(t float64) string {
	if !(t > 0) {
		return "–:––.–––"
	}
	return fmtLap(t)
}

// ---------- the gauges ----------

func drawGauge(name string, c *ovCanvas, st *ovState, z float64, now time.Time) int {
	switch name {
	case "flag":
		return drawFlagOv(c, st, z)
	case "dash":
		return drawDashOv(c, st, z, now)
	case "timing":
		return drawTimingOv(c, st, z)
	case "fuel":
		return drawFuelOv(c, st, z)
	case "engine":
		return drawEngineOv(c, st, z)
	case "tyres":
		return drawTyresOv(c, st, z)
	case "inputs":
		return drawInputsOv(c, st, z)
	case "boost":
		return drawBoostOv(c, st, z, now)
	case "telemetry":
		return drawTelOv(c, st, z)
	case "gg":
		return drawGGOv(c, st, z)
	}
	return 0
}

// the flags, most important first (the app's FLAGS)
var ovFlags = []struct {
	bit    uint32
	kind   string
	en, es string
}{
	{0x10000, "black", "Black flag", "Bandera negra"}, {0x10, "red", "Red flag", "Bandera roja"}, {0x100000, "black", "Repair required", "Reparación obligatoria"},
	{0x1, "checkered", "Checkered flag", "Bandera a cuadros"}, {0x2, "white", "Last lap", "Última vuelta"}, {0x8, "yellow", "Yellow", "Amarilla"},
	{0x100, "yellow", "Yellow waving", "Amarilla agitada"}, {0x4000, "yellow", "Caution", "Safety car"}, {0x8000, "yellow", "Caution", "Safety car"},
	{0x20, "blue", "Blue flag · let faster car by", "Bandera azul · deja pasar"},
}

func drawFlagOv(c *ovCanvas, st *ovState, z float64) int {
	H := 60 * z
	W := float64(c.w)
	fv, _ := st.num("SessionFlags")
	f := uint32(int64(fv))
	hit := -1
	for k, x := range ovFlags {
		if f&x.bit != 0 {
			hit = k
			break
		}
	}
	if hit < 0 { // no flag: nothing over the game (a placeholder while moving the overlays)
		if st.edit {
			panel(c, H, z)
			c.label(z, st.T("Flags", "Banderas"), W/2, H/2, 2)
		}
		return int(math.Ceil(H))
	}
	x := ovFlags[hit]
	bg, fg := uint32(0x0b0d10), uint32(0xffffff)
	switch x.kind {
	case "red":
		bg = 0xe5484d
	case "white":
		bg, fg = 0xf2f4f7, 0x11151b
	case "yellow":
		bg, fg = colWarn, 0x11151b
	case "blue":
		bg = 0x3d7bff
	}
	r := 10 * z
	c.roundRect(0.5, 0.5, W-1, H-1, r, bg, 0.96, 0xffffff, 0.25, 1)
	if x.kind == "checkered" { // a chequered band
		sq := H / 4
		for py := 0; py < int(H); py++ {
			for px := 0; px < int(W); px++ {
				if (int(float64(px)/sq)+int(float64(py)/sq))%2 == 0 {
					if inRound(float64(px)+0.5, float64(py)+0.5, 0.5, 0.5, W-1, H-1, r) {
						c.blend(px, py, 0xffffff, 0.92)
					}
				}
			}
		}
		tf := ovFace(fkDisplayB, 26*z)
		s := strings.ToUpper(st.T(x.en, x.es))
		pw := textW(tf, s) + 28*z
		c.roundRect(W/2-pw/2, H/2-16*z, pw, 32*z, 8*z, 0x0b0d10, 0.92, 0, 0, 0)
		c.text(tf, s, W/2, H/2, 0xffffff, 1, 2)
		return int(math.Ceil(H))
	}
	if x.kind == "black" {
		c.roundRect(1.5, 1.5, W-3, H-3, r, 0, 0, 0xffffff, 0.9, 2)
	}
	c.text(ovFace(fkDisplayB, 28*z), strings.ToUpper(st.T(x.en, x.es)), W/2, H/2, fg, 1, 2)
	return int(math.Ceil(H))
}

// inRound: whether a point is inside a rounded rectangle
func inRound(px, py, x, y, w, h, r float64) bool {
	cx, cy := x+w/2, y+h/2
	qx, qy := math.Abs(px-cx)-(w/2-r), math.Abs(py-cy)-(h/2-r)
	return math.Hypot(math.Max(qx, 0), math.Max(qy, 0))+math.Min(math.Max(qx, qy), 0)-r <= 0
}

func gearText(st *ovState) string {
	g, ok := st.num("Gear")
	switch {
	case !ok:
		return "–"
	case g == 0:
		return "N"
	case g < 0:
		return "R"
	}
	return strconv.Itoa(int(g))
}

// a vertical pedal bar (filled from the bottom)
func pedalBar(c *ovCanvas, x, y, w, h, v float64, col uint32) {
	c.roundRect(x, y, w, h, 3, colSurf2, 1, colLine, 1, 1)
	v = clamp01(v)
	if v > 0 {
		c.roundRect(x+1, y+h-1-(h-2)*v, w-2, (h-2)*v, 2, col, 1, 0, 0, 0)
	}
}

func drawDashOv(c *ovCanvas, st *ovState, z float64, now time.Time) int {
	W := float64(c.w)
	pad := 14 * z
	y := pad
	gf, sf := ovFace(fkDisplayB, 64*z), ovFace(fkDisplayB, 48*z)
	topH := 80 * z
	// gear, speed, the pedals
	H := pad + topH + 10*z + 16*z + 8*z + 18*z + pad
	dc := st.dcItems()
	if len(dc) > 0 {
		H += 30 * z
	}
	panel(c, H, z)
	c.label(z, st.T("Gear", "Marcha"), pad, y+6*z, 0)
	c.text(gf, gearText(st), pad, y+topH/2+10*z, colText, 1, 0)
	sx := pad + math.Max(70*z, textW(gf, "8")+24*z)
	c.label(z, st.T("Speed", "Velocidad"), sx, y+6*z, 0)
	sp, _ := st.num("Speed")
	c.valueUnit(font_{sf, 48 * z}, z, strconv.Itoa(int(math.Round(st.spd(sp)))), st.spdU(), sx, y+topH/2+10*z, colText)
	bw, bh := 16*z, topH-4*z
	bx := W - pad - 3*bw - 2*8*z
	thr, _ := st.num("Throttle")
	brk, _ := st.num("Brake")
	clu := 1.0
	if v, ok := st.num("Clutch"); ok {
		clu = v
	}
	pedalBar(c, bx, y+2*z, bw, bh, 1-clu, colBlue)
	pedalBar(c, bx+bw+8*z, y+2*z, bw, bh, brk, colBad)
	pedalBar(c, bx+2*(bw+8*z), y+2*z, bw, bh, thr, colGood)
	y += topH + 10*z
	// the shift lights: 16 segments, green, yellow, red; all purple at the shift point, blinking past it
	rpm, _ := st.num("RPM")
	first, shift, blink := st.shiftPoints()
	on := 0
	if shift > first {
		on = int(math.Round(math.Max(0, math.Min(16, (rpm-first)/(shift-first)*16))))
	}
	gap := 3 * z
	segW := (W - 2*pad - 15*gap) / 16
	lit := !(rpm >= blink && now.UnixMilli()/80%2 == 0)
	for i := 0; i < 16; i++ {
		x := pad + float64(i)*(segW+gap)
		if i < on && lit {
			col := uint32(colGood)
			switch {
			case rpm >= shift:
				col = colPB
			case i >= 13:
				col = colBad
			case i >= 10:
				col = colWarn
			}
			c.roundRect(x, y, segW, 16*z, 2*z, col, 1, 0, 0, 0)
		} else {
			c.roundRect(x, y, segW, 16*z, 2*z, colSurf2, 1, colLine, 1, 1)
		}
	}
	y += 16*z + 8*z
	c.label(z, "RPM", pad, y+9*z, 0)
	c.text(ovFace(fkData, 12*z), fmt.Sprintf("%d", int(rpm)), pad+textWT(ovFace(fkData, 11*z), "RPM", 1.1*z)+8*z, y+9*z, colText, 1, 0)
	if shift > 0 {
		c.label(z, st.T("Shift ", "Cambio ")+strconv.Itoa(int(shift)), W-pad, y+9*z, 1)
	}
	y += 18 * z
	if len(dc) > 0 { // the car's controls: TC, ABS, map, bias, energy
		y += 6 * z
		x := pad
		lf, vf := ovFace(fkData, 10*z), ovFace(fkData, 14*z)
		for _, it := range dc {
			w := textWT(lf, it[0], 0.8*z) + 6*z + textW(vf, it[1]) + textW(lf, it[2]) + 16*z
			if x+w > W-pad {
				break
			}
			c.roundRect(x, y, w, 22*z, 6*z, colSurf2, 1, colLine, 1, 1)
			c.textT(lf, it[0], x+8*z, y+11*z, colMuted, 1, 0, 0.8*z)
			vx := x + 8*z + textWT(lf, it[0], 0.8*z) + 6*z
			c.text(vf, it[1], vx, y+11*z, colText, 1, 0)
			c.text(lf, it[2], vx+textW(vf, it[1]), y+11*z, colMuted, 1, 0)
			x += w + 6*z
		}
	}
	return int(math.Ceil(H))
}

// shiftPoints: where the shift lights start, change and blink (iRacing's own values for the car)
func (st *ovState) shiftPoints() (first, shift, blink float64) {
	car := map[string]float64{}
	if st.ses != nil {
		car = st.ses.Car
	}
	first = car["DriverCarSLFirstRPM"]
	if first <= 0 {
		first = 5000
	}
	if v, ok := st.num("PlayerCarSLShiftRPM"); ok && v > 0 {
		shift = v
	} else if car["DriverCarSLShiftRPM"] > 0 {
		shift = car["DriverCarSLShiftRPM"]
	} else {
		rl := car["DriverCarRedLine"]
		if rl <= 0 {
			rl = 7500
		}
		shift = rl * 0.94
	}
	blink = car["DriverCarSLBlinkRPM"]
	if blink <= 0 {
		blink = shift * 1.03
	}
	return
}

// dcItems: the car's driver controls that it has (label, value, after)
func (st *ovState) dcItems() [][3]string {
	var out [][3]string
	lv := func(k, l string) {
		v, ok := st.num(k)
		mx, _ := st.num(k + "Max")
		if ok && (mx > 0 || v > 0) {
			after := ""
			if mx > 0 {
				after = "/" + strconv.Itoa(int(math.Round(mx)))
			}
			out = append(out, [3]string{l, strconv.Itoa(int(math.Round(v))), after})
		}
	}
	lv("dcTractionControl", "TC")
	lv("dcTractionControl2", "TC2")
	lv("dcABS", "ABS")
	lv("dcEngineMap", st.T("MAP", "MAPA"))
	if v, _ := st.num("dcBrakeBias"); v > 0 {
		out = append(out, [3]string{st.T("BIAS", "REPARTO"), strconv.FormatFloat(v, 'f', 1, 64), "%"})
	}
	if v, _ := st.num("VirtualEnergyPct"); v > 0 {
		out = append(out, [3]string{st.T("ENERGY", "ENERGÍA"), strconv.Itoa(int(math.Round(v * 100))), "%"})
	}
	if v, _ := st.num("EnergyERSBatteryPct"); v > 0 {
		out = append(out, [3]string{st.T("BATTERY", "BATERÍA"), strconv.Itoa(int(math.Round(v * 100))), "%"})
	}
	return out
}

// a meter: the app's thin progress bar
func meter(c *ovCanvas, x, y, w, z, v float64, col uint32) {
	c.roundRect(x, y, w, 8*z, 4*z, colSurf2, 1, colLine, 1, 1)
	if v = clamp01(v); v > 0 {
		c.roundRect(x+1, y+1, math.Max(8*z-2, (w-2)*v), 8*z-2, 4*z-1, col, 1, 0, 0, 0)
	}
}

func drawTimingOv(c *ovCanvas, st *ovState, z float64) int {
	W := float64(c.w)
	pad := 14 * z
	vf := ovFace(fkData, 24*z)
	cellH := 54 * z
	H := pad + 2*cellH + 10*z + 8*z + pad
	panel(c, H, z)
	colW := (W - 2*pad) / 2
	cell := func(i, j int, l, v string, col uint32) {
		x, y := pad+float64(j)*colW, pad+float64(i)*cellH
		c.labelFit(z, l, x, y+8*z, colW-8*z)
		c.text(vf, v, x, y+32*z, col, 1, 0)
	}
	cur, _ := st.num("LapCurrentLapTime")
	best, _ := st.num("LapBestLapTime")
	last, _ := st.num("LapLastLapTime")
	cell(0, 0, st.T("Current lap", "Vuelta actual"), fmtCur(cur), colText)
	if d, ok := st.delta(); ok {
		col := uint32(colBad)
		if d <= 0 {
			col = colGood
		}
		cell(0, 1, st.T("Delta to best", "Delta vs mejor"), signed(d, 2), col)
	} else {
		cell(0, 1, st.T("Delta to best", "Delta vs mejor"), "–", colText)
	}
	cell(1, 0, st.T("Best lap", "Mejor vuelta"), fmtLap(best), colPB)
	cell(1, 1, st.T("Last lap", "Última vuelta"), fmtLap(last), colText)
	p, _ := st.num("LapDistPct")
	meter(c, pad, pad+2*cellH+10*z, W-2*pad, z, p, colAmber)
	return int(math.Ceil(H))
}

// fuelPerLap: the average of your last laps (up to 5), else iRacing's use per hour over your last lap
func (st *ovState) fuelPerLap() float64 {
	u := st.live.fuelUses
	if n := len(u); n > 0 {
		k := n
		if k > 5 {
			k = 5
		}
		sum := 0.0
		for _, v := range u[n-k:] {
			sum += v
		}
		return sum / float64(k)
	}
	ph, _ := st.num("FuelUsePerHour")
	ll, _ := st.num("LapLastLapTime")
	if ph > 0 && ll > 0 {
		kg := 0.75
		if st.ses != nil && st.ses.Car["DriverCarFuelKgPerLtr"] > 0 {
			kg = st.ses.Car["DriverCarFuelKgPerLtr"]
		}
		return ph / kg * ll / 3600
	}
	return 0
}

// lapsToGo: the laps left in the session (by laps, else by time over your lap time)
func (st *ovState) lapsToGo() (float64, bool) {
	p, _ := st.num("LapDistPct")
	if r, ok := st.num("SessionLapsRemainEx"); ok && r >= 0 && r < 32767 {
		return math.Max(0, r-p), true
	}
	t, _ := st.num("SessionTimeRemain")
	lap, _ := st.num("LapLastLapTime")
	if lap <= 0 && st.ses != nil {
		lap = st.ses.Car["DriverCarEstLapTime"]
	}
	if t > 0 && t < 604800 && lap > 0 {
		return t/lap + 1, true
	}
	return 0, false
}

func drawFuelOv(c *ovCanvas, st *ovState, z float64) int {
	W := float64(c.w)
	pad := 14 * z
	vf := font_{ovFace(fkData, 24*z), 24 * z}
	sf := ovFace(fkBody, 12*z)
	H := pad + 18*z + 56*z + 8*z + 10*z + 26*z + pad - 4*z
	panel(c, H, z)
	c.label(z, st.T("Fuel", "Combustible"), pad, pad+6*z, 0)
	fuel, has := st.num("FuelLevel")
	per := st.fuelPerLap()
	colW := (W - 2*pad) / 3
	y := pad + 18*z
	col3 := func(j int, v, unit, sub string) {
		x := pad + float64(j)*colW
		c.valueUnit(vf, z, v, unit, x, y+18*z, colText)
		c.text(sf, sub, x, y+42*z, colMuted, 1, 0)
	}
	v1, v2, v3 := "–", "–", "–"
	if has {
		v1 = strconv.FormatFloat(st.vol(fuel), 'f', 1, 64)
	}
	if per > 0 {
		v3 = strconv.FormatFloat(st.vol(per), 'f', 2, 64)
		if has {
			v2 = strconv.FormatFloat(fuel/per, 'f', 1, 64)
		}
	}
	col3(0, v1, st.volU(), st.T("in tank", "en el depósito"))
	col3(1, v2, "", st.T("laps of fuel", "vueltas posibles"))
	col3(2, v3, "", st.T("per lap", "por vuelta"))
	y += 56 * z
	max := 0.0
	if st.ses != nil {
		max = st.ses.Car["DriverCarFuelMaxLtr"]
	}
	if pct, ok := st.num("FuelLevelPct"); max <= 0 && ok && pct > 0 {
		max = fuel / pct
	}
	if max > 0 {
		meter(c, pad, y, W-2*pad, z, fuel/max, colAmber)
	}
	y += 8*z + 10*z
	nf := ovFace(fkBody, 13*z)
	left, ok := st.lapsToGo()
	switch {
	case per > 0 && ok && has:
		add := left*per - fuel + per*0.3
		if add <= 0 {
			c.text(nf, st.T("Enough to finish. Spare: ", "Llegas al final. Sobra: ")+strconv.FormatFloat(st.vol(-add), 'f', 1, 64)+" "+st.volU(), pad, y+10*z, colGood, 1, 0)
		} else {
			s := st.T("Add at the stop: ", "Añade en la parada: ") + strconv.FormatFloat(st.vol(add), 'f', 1, 64) + " " + st.volU()
			c.text(nf, s, pad, y+10*z, colBad, 1, 0)
			c.text(nf, " · "+strconv.FormatFloat(left, 'f', 1, 64)+st.T(" laps to go", " vueltas restantes"), pad+textW(nf, s), y+10*z, colMuted, 1, 0)
		}
	default:
		c.text(nf, ellipsis(nf, st.T("Average fuel use appears after your first full lap.", "El consumo medio aparece tras tu primera vuelta completa."), W-2*pad), pad, y+10*z, colMuted, 1, 0)
	}
	return int(math.Ceil(H))
}

func drawEngineOv(c *ovCanvas, st *ovState, z float64) int {
	W := float64(c.w)
	pad := 14 * z
	rowH := 26 * z
	rows := [][2]string{}
	t := func(n string) string {
		if v, ok := st.num(n); ok {
			return strconv.FormatFloat(st.tmp(v), 'f', 1, 64) + " " + st.tmpU()
		}
		return "–"
	}
	op := "–"
	if v, ok := st.num("OilPress"); ok {
		op = strconv.FormatFloat(v, 'f', 2, 64) + " bar"
	}
	vo := "–"
	if v, ok := st.num("Voltage"); ok {
		vo = strconv.FormatFloat(v, 'f', 1, 64) + " V"
	}
	rows = append(rows, [2]string{st.T("Water", "Agua"), t("WaterTemp")}, [2]string{st.T("Oil", "Aceite"), t("OilTemp")}, [2]string{st.T("Oil pressure", "Presión aceite"), op},
		[2]string{st.T("Voltage", "Voltaje"), vo}, [2]string{st.T("Air", "Aire"), t("AirTemp")}, [2]string{st.T("Track", "Pista"), t("TrackTempCrew")})
	H := pad + 18*z + float64(len(rows))*rowH + pad - 6*z
	panel(c, H, z)
	c.label(z, st.T("Engine", "Motor"), pad, pad+6*z, 0)
	y := pad + 18*z
	kf, vf := ovFace(fkBody, 13.5*z), ovFace(fkData, 14*z)
	for k, r := range rows {
		if k > 0 {
			c.rect(pad, y, W-2*pad, 1, colLine, 1)
		}
		c.text(kf, r[0], pad, y+rowH/2, colMuted, 1, 0)
		c.text(vf, r[1], W-pad, y+rowH/2, colText, 1, 1)
		y += rowH
	}
	return int(math.Ceil(H))
}

// heatColor: the app's tyre colour for a temperature (cold blue-green, good green, hot red), window 75–95 °C
func heatColor(t float64) uint32 {
	lo, hi := 75.0, 95.0
	var h float64
	switch {
	case t < lo:
		h = 150 + math.Min(1, (lo-t)/20)*65
	case t <= hi:
		h = 150 - (t-lo)/(hi-lo)*90
	default:
		h = 60 - math.Min(1, (t-hi)/20)*60
	}
	return hsl(h, 0.62, 0.58)
}

func drawTyresOv(c *ovCanvas, st *ovState, z float64) int {
	W := float64(c.w)
	pad := 14 * z
	boxH := 52 * z
	gap := 8 * z
	H := pad + 18*z + 2*boxH + gap + pad
	live := false
	vals := map[string][2]float64{} // average temperature, middle wear (−1 when unknown)
	for _, k := range []string{"LF", "RF", "LR", "RR"} {
		l, lok := st.num(k + "tempL")
		isLive := lok && l > 0
		live = live || isLive
		pre := "tempC"
		if isLive {
			pre = "temp"
		}
		a, ok1 := st.num(k + pre + "L")
		m, ok2 := st.num(k + pre + "M")
		r, ok3 := st.num(k + pre + "R")
		avg := -999.0
		if ok1 && ok2 && ok3 {
			avg = (a + m + r) / 3
		} else if ok2 {
			avg = m
		}
		w := -1.0
		if v, ok := st.num(k + "wearM"); ok {
			w = v
		}
		vals[k] = [2]float64{avg, w}
	}
	if !live {
		H += 20 * z
	}
	panel(c, H, z)
	c.label(z, st.T("Tyres", "Neumáticos"), pad, pad+6*z, 0)
	bw := (W - 2*pad - gap) / 2
	vf := ovFace(fkData, 14*z)
	for i, k := range []string{"LF", "RF", "LR", "RR"} {
		x, y := pad+float64(i%2)*(bw+gap), pad+18*z+float64(i/2)*(boxH+gap)
		v := vals[k]
		border := uint32(colLine)
		if v[0] > -999 {
			border = heatColor(v[0])
		}
		c.roundRect(x, y, bw, boxH, 8*z, colSurf2, 1, border, 1, 2*z)
		c.label(z, k, x+10*z, y+15*z, 0)
		t, w := "–", "–"
		if v[0] > -999 {
			t = strconv.Itoa(int(math.Round(st.tmp(v[0])))) + st.tmpU()
		}
		if v[1] >= 0 {
			w = strconv.Itoa(int(math.Round(v[1]*100))) + "%"
		}
		c.text(vf, t+" · "+w, x+10*z, y+36*z, colText, 1, 0)
	}
	if !live {
		nf := ovFace(fkBody, 12*z)
		c.text(nf, ellipsis(nf, st.T("From your last pit stop (iRacing sends them only there)", "De tu última parada (iRacing solo los envía en el box)"), W-2*pad), pad, H-pad-4*z, colMuted, 1, 0)
	}
	return int(math.Ceil(H))
}

func drawInputsOv(c *ovCanvas, st *ovState, z float64) int {
	cfg := st.uiMap("inp")
	W := float64(c.w)
	pad := 14 * z
	showGear, showSpeed, showWheel := uiBool(cfg, "gear", true), uiBool(cfg, "speed", true), uiBool(cfg, "wheel", true)
	bars := uiList(cfg, "bars", []string{"clu", "brk", "thr"})
	values, horiz, abs := uiBool(cfg, "values", true), uiStr(cfg, "barDir", "v") == "h", uiBool(cfg, "abs", true)
	trace := uiBool(cfg, "trace", true)
	traceH := uiNum(cfg, "traceH", 110) * z
	traceSecs := uiNum(cfg, "traceSecs", 12)
	traceCh := uiList(cfg, "traceCh", []string{"thr", "brk"})
	rowH := 96 * z
	H := pad + 18*z + rowH + pad
	if trace {
		H += 10*z + traceH
	}
	panel(c, H, z)
	c.label(z, st.T("Inputs", "Pedales"), pad, pad+6*z, 0)
	y := pad + 18*z
	x := pad
	thr, _ := st.num("Throttle")
	brk, _ := st.num("Brake")
	clu := 1.0
	if v, ok := st.num("Clutch"); ok {
		clu = v
	}
	val := map[string]float64{"thr": thr, "brk": brk, "clu": 1 - clu}
	barCol := map[string]uint32{"thr": colGood, "brk": colBad, "clu": colBlue}
	if showGear || showSpeed {
		gf := ovFace(fkDisplayB, 56*z)
		if showGear {
			c.text(gf, gearText(st), x, y+30*z, colText, 1, 0)
		}
		if showSpeed {
			sp, _ := st.num("Speed")
			c.valueUnit(font_{ovFace(fkData, 16*z), 16 * z}, z, strconv.Itoa(int(math.Round(st.spd(sp)))), st.spdU(), x, y+68*z, colText)
		}
		if a, _ := st.num("BrakeABSactive"); abs && a != 0 {
			pf := ovFace(fkData, 11*z)
			c.roundRect(x, y+80*z, 40*z, 16*z, 8*z, colBad, 0.2, colBad, 1, 1)
			c.textT(pf, "ABS", x+20*z, y+88*z, colBad, 1, 2, 0.5*z)
		}
		x += 90 * z
	}
	if showWheel {
		r := 38 * z
		cx, cy := x+r+4*z, y+r+6*z
		ang, _ := st.num("SteeringWheelAngle")
		a := ang // radians, left positive: the picture turns the way the wheel does
		c.ring(cx, cy, r-4*z, 7*z, colText, 0.9)
		rot := func(px, py float64) (float64, float64) {
			s, co := math.Sin(-a), math.Cos(-a)
			return cx + px*co - py*s, cy + px*s + py*co
		}
		x0, y0 := rot(-r+6*z, 0)
		x1, y1 := rot(r-6*z, 0)
		c.line(x0, y0, x1, y1, 6*z, colText, 0.9)
		x2, y2 := rot(0, 0)
		x3, y3 := rot(0, r-6*z)
		c.line(x2, y2, x3, y3, 6*z, colText, 0.9)
		mx0, my0 := rot(-3*z, -r+4*z)
		mx1, my1 := rot(3*z, -r+4*z)
		c.line(mx0, my0, mx1, my1, 6*z, colAmber, 1) // the top of the wheel
		c.disc(cx, cy, 9*z, colPanel, 1)
		c.ring(cx, cy, 9*z, 4*z, colText, 0.9)
		if uiBool(cfg, "wheelDeg", false) {
			c.text(ovFace(fkData, 11*z), strconv.Itoa(int(math.Round(-ang*180/math.Pi)))+"°", cx, y+rowH-4*z, colMuted, 1, 2)
		}
		x += 2*r + 22*z
	}
	// the pedal bars, as chosen
	vf := ovFace(fkData, 11*z)
	if horiz {
		bh := 16 * z
		gap := (rowH - float64(len(bars))*bh) / float64(len(bars)+1)
		w := W - pad - x
		if values {
			w -= 34 * z
		}
		for k, b := range bars {
			by := y + gap + float64(k)*(bh+gap)
			v := clamp01(val[b])
			c.roundRect(x, by, w, bh, 4*z, colSurf2, 1, colLine, 1, 1)
			if v > 0 {
				c.roundRect(x+1, by+1, (w-2)*v, bh-2, 3*z, barCol[b], 1, 0, 0, 0)
			}
			if values {
				c.text(vf, strconv.Itoa(int(math.Round(v*100))), W-pad, by+bh/2, colText, 1, 1)
			}
		}
	} else {
		bw := 22 * z
		bh := rowH - 18*z
		gap := 12 * z
		bx := W - pad - float64(len(bars))*bw - float64(len(bars)-1)*gap
		if bx < x {
			bx = x
		}
		for k, b := range bars {
			px := bx + float64(k)*(bw+gap)
			pedalBar(c, px, y, bw, bh, val[b], barCol[b])
			if values {
				c.text(vf, strconv.Itoa(int(math.Round(clamp01(val[b])*100))), px+bw/2, y+bh+10*z, colText, 1, 2)
			}
		}
	}
	if trace { // the last seconds of your pedals
		ty := y + rowH + 10*z
		tw := W - 2*pad
		c.roundRect(pad, ty, tw, traceH, 6*z, colSurf2, 0.7, colLine, 1, 1)
		for _, f := range []float64{.25, .5, .75} {
			c.rect(pad+1, ty+traceH*f, tw-2, 1, colLine, 1)
		}
		N := int(traceSecs * 30)
		data := st.live.trace
		if len(data) > N {
			data = data[len(data)-N:]
		}
		n := len(data)
		if n > 1 {
			sx := tw / float64(N)
			has := map[string]bool{}
			for _, k := range traceCh {
				has[k] = true
			}
			if has["abs"] {
				for i, p := range data {
					if p[4] != 0 {
						c.rect(pad+float64(N-n+i)*sx, ty+1, math.Max(1, sx), traceH-2, colBad, 0.18)
					}
				}
			}
			for _, ch := range []struct {
				k   string
				i   int
				col uint32
			}{{"thr", 0, colGood}, {"brk", 1, colBad}, {"clu", 2, colBlue}, {"steer", 3, colText}} {
				if !has[ch.k] {
					continue
				}
				py := func(p [5]float64) float64 {
					v := p[ch.i]
					if ch.i == 3 {
						v = (v + 1) / 2
					}
					return ty + traceH - 3*z - v*(traceH-6*z)
				}
				w := 2 * z
				if ch.i == 3 {
					w = 1.2 * z
				}
				// one point in two is enough for a smooth line
				step := 1
				if n > 400 {
					step = 2
				}
				px0, py0 := pad+float64(N-n)*sx, py(data[0])
				for i := step; i < n; i += step {
					px1, py1 := pad+float64(N-n+i)*sx, py(data[i])
					c.line(px0, py0, px1, py1, w, ch.col, 1)
					px0, py0 = px1, py1
				}
			}
		}
	}
	return int(math.Ceil(H))
}

func uiStr(m map[string]any, k, def string) string {
	if v, ok := m[k].(string); ok {
		return v
	}
	return def
}

func drawBoostOv(c *ovCanvas, st *ovState, z float64, now time.Time) int {
	W := float64(c.w)
	pad := 14 * z
	H := pad + 18*z + 70*z + pad
	drs, hasDRS := st.num("DRS_Status")
	p2s, hasP2s := st.num("P2P_Status")
	p2c, hasP2c := st.num("P2P_Count")
	bat, hasBat := st.num("EnergyERSBatteryPct")
	dep, hasDep := st.num("EnergyMGU_KLapDeployPct")
	if !(hasDRS || hasP2s || hasP2c || hasBat || hasDep) {
		if !st.edit && uiBool(st.uiMap("boost"), "autohide", true) {
			return int(math.Ceil(H)) // this car has none: nothing over the game
		}
		panel(c, H, z)
		c.label(z, st.T("DRS & push-to-pass", "DRS y push-to-pass"), pad, pad+6*z, 0)
		nf := ovFace(fkBody, 13*z)
		c.text(nf, ellipsis(nf, st.T("This car has no DRS, push-to-pass or hybrid boost.", "Este coche no tiene DRS, push-to-pass ni híbrido."), W-2*pad), pad, pad+50*z, colMuted, 1, 0)
		return int(math.Ceil(H))
	}
	panel(c, H, z)
	c.label(z, st.T("DRS & push-to-pass", "DRS y push-to-pass"), pad, pad+6*z, 0)
	type cell struct {
		l, v, sub string
		col, bg   uint32
	}
	var cells []cell
	if hasDRS {
		names := [][2]string{{"Closed", "Cerrado"}, {"Next zone", "Próxima zona"}, {"Available", "Disponible"}, {"Open", "Abierto"}}
		cols := []uint32{colText, colWarn, colGood, colAmber}
		i := int(drs)
		if i >= 0 && i < len(names) {
			cells = append(cells, cell{"DRS", st.T(names[i][0], names[i][1]), "", cols[i], cols[i]})
		}
	}
	if hasP2c || hasP2s {
		v := "–"
		if hasP2c {
			v = strconv.Itoa(int(p2c))
		}
		sub, col := st.T("Ready", "Listo"), uint32(colText)
		if p2s != 0 {
			sub, col = st.T("Active", "Activo")+" · "+strconv.FormatFloat(now.Sub(st.live.p2pSince).Seconds(), 'f', 1, 64)+" s", colAmber
		}
		cells = append(cells, cell{"Push to pass", v, sub, col, col})
	}
	if hasBat {
		v := bat
		if v <= 1 {
			v *= 100
		}
		sub := ""
		if hasDep {
			d := dep
			if d <= 1 {
				d *= 100
			}
			sub = st.T("Deploy ", "Despliegue ") + strconv.Itoa(int(math.Round(d))) + "%"
		}
		cells = append(cells, cell{st.T("Battery", "Batería"), strconv.Itoa(int(math.Round(v))) + "%", sub, colText, colText})
	}
	n := float64(len(cells))
	gap := 8 * z
	cw := (W - 2*pad - (n-1)*gap) / n
	vf, sf := ovFace(fkDisplay, 24*z), ovFace(fkBody, 11.5*z)
	for k, ce := range cells {
		x, y := pad+float64(k)*(cw+gap), pad+18*z
		c.roundRect(x, y, cw, 70*z, 8*z, colSurf2, 1, colLine, 1, 1)
		if ce.bg != colText {
			c.roundRect(x, y, cw, 70*z, 8*z, ce.bg, 0.14, ce.bg, 0.7, 1)
		}
		c.label(z, ce.l, x+10*z, y+13*z, 0)
		c.text(vf, ellipsis(vf, ce.v, cw-20*z), x+10*z, y+36*z, ce.col, 1, 0)
		if ce.sub != "" {
			c.text(sf, ellipsis(sf, ce.sub, cw-20*z), x+10*z, y+58*z, colMuted, 1, 0)
		}
	}
	return int(math.Ceil(H))
}

// telValue: a telemetry value as the app shows it
func telValue(v float64) string {
	if v == math.Trunc(v) && math.Abs(v) < 1e9 {
		return strconv.Itoa(int(v))
	}
	if math.Abs(v) < 10 {
		return strconv.FormatFloat(v, 'f', 3, 64)
	}
	return strconv.FormatFloat(v, 'f', 1, 64)
}

func drawTelOv(c *ovCanvas, st *ovState, z float64) int {
	W := float64(c.w)
	pad := 14 * z
	vars := uiList(st.uiMap("tel"), "vars", telDefault)
	cols := 2
	if W/z < 300 {
		cols = 1
	}
	tileH, gap := 72*z, 8*z
	rows := (len(vars) + cols - 1) / cols
	H := pad + 18*z + float64(rows)*tileH + float64(max0(rows-1))*gap + pad
	if len(vars) == 0 {
		H = pad + 18*z + 30*z + pad
	}
	panel(c, H, z)
	c.label(z, st.T("Telemetry", "Telemetría"), pad, pad+6*z, 0)
	if len(vars) == 0 {
		nf := ovFace(fkBody, 13*z)
		c.text(nf, ellipsis(nf, st.T("Add values in the overlay's settings.", "Añade valores en los ajustes del overlay."), W-2*pad), pad, pad+34*z, colMuted, 1, 0)
		return int(math.Ceil(H))
	}
	tw := (W - 2*pad - float64(cols-1)*gap) / float64(cols)
	vf := ovFace(fkData, 20*z)
	for k, n := range vars {
		x, y := pad+float64(k%cols)*(tw+gap), pad+18*z+float64(k/cols)*(tileH+gap)
		c.roundRect(x, y, tw, tileH, 8*z, colSurf2, 1, colLine, 1, 1)
		lab := strings.ToUpper(telName(n, st.lang == "es" || st.lang == "both"))
		c.textT(ovFace(fkData, 10*z), ellipsis(ovFace(fkData, 10*z), lab, tw-20*z-float64(len([]rune(lab)))*0.6*z), x+10*z, y+13*z, colMuted, 1, 0, 0.6*z)
		v, ok := st.num(n)
		s := "–"
		if ok {
			s = telValue(v)
		} else if a := st.arr(n); len(a) > 0 {
			me, _ := st.num("PlayerCarIdx")
			if int(me) >= 0 && int(me) < len(a) {
				s = telValue(a[int(me)])
			}
		}
		c.valueUnit(font_{vf, 20 * z}, z, s, st.unitOf[n], x+10*z, y+34*z, colText)
		// the sparkline of its last values
		h := st.live.telHist[n]
		if len(h) > 1 {
			lo, hi := h[0], h[0]
			for _, v := range h {
				lo, hi = math.Min(lo, v), math.Max(hi, v)
			}
			if hi-lo < 1e-9 {
				hi = lo + 1
			}
			sx := (tw - 20*z) / 119
			sy0, sh := y+tileH-8*z, 16*z
			px0 := x + 10*z + float64(120-len(h))*sx
			py0 := sy0 - (h[0]-lo)/(hi-lo)*sh
			for i := 1; i < len(h); i++ {
				px1 := x + 10*z + float64(120-len(h)+i)*sx
				py1 := sy0 - (h[i]-lo)/(hi-lo)*sh
				c.line(px0, py0, px1, py1, 1.5*z, colBlue, 0.9)
				px0, py0 = px1, py1
			}
		}
	}
	return int(math.Ceil(H))
}

func max0(n int) int {
	if n < 0 {
		return 0
	}
	return n
}

func drawGGOv(c *ovCanvas, st *ovState, z float64) int {
	W := float64(c.w)
	pad := 14 * z
	plot := W - 2*pad
	H := pad + 18*z + plot + 8*z + 22*z + pad - 4*z
	panel(c, H, z)
	c.label(z, st.T("G-force circle", "Círculo de fuerzas g"), pad, pad+6*z, 0)
	L := st.live
	R := math.Max(2, math.Ceil(math.Max(L.ggLat, math.Max(L.ggBrk, L.ggAcc))*2)/2)
	cx, cy := W/2, pad+18*z+plot/2
	ppg := (plot/2 - 6*z) / R
	for k := 1.0; k <= R; k++ {
		c.ring(cx, cy, k*ppg, 1, colLine, 1)
	}
	c.rect(cx-R*ppg, cy, 2*R*ppg, 1, colLine, 1)
	c.rect(cx, cy-R*ppg, 1, 2*R*ppg, colLine, 1)
	c.text(ovFace(fkData, 10*z), "1g", cx+ppg+3*z, cy-7*z, colMuted, 1, 0)
	for k, p := range L.gg {
		c.disc(cx+p[0]*ppg, cy+p[1]*ppg, 2.5*z, colBlue, float64(k+1)/float64(len(L.gg))*0.6)
	}
	if n := len(L.gg); n > 0 {
		p := L.gg[n-1]
		c.disc(cx+p[0]*ppg, cy+p[1]*ppg, 6*z, colAmber, 1)
	}
	// the most of this lap: cornering, braking, traction
	y := pad + 18*z + plot + 8*z
	lf, vf := ovFace(fkData, 9*z), ovFace(fkData, 12*z)
	items := [][2]string{{st.T("Corner", "Curva"), fmt.Sprintf("%.2f g", L.ggLat)}, {st.T("Brake", "Frenada"), fmt.Sprintf("%.2f g", L.ggBrk)}, {st.T("Traction", "Tracción"), fmt.Sprintf("%.2f g", L.ggAcc)}}
	cw := (W - 2*pad) / 3
	for k, it := range items {
		x := pad + float64(k)*cw
		c.textT(lf, strings.ToUpper(it[0]), x, y+5*z, colMuted, 1, 0, 0.6*z)
		c.text(vf, it[1], x, y+17*z, colText, 1, 0)
	}
	return int(math.Ceil(H))
}

// telNames: the friendly names of iRacing's values, read from the app's own list (TELN in index.html), so both
// show the same; an unknown value keeps its iRacing name
var (
	telNamesOnce sync.Once
	telNames     map[string][2]string
)

func telName(n string, es bool) string {
	telNamesOnce.Do(func() {
		telNames = map[string][2]string{}
		b, err := webFS.ReadFile("web/dist/index.html")
		if err != nil {
			return
		}
		s := string(b)
		i := strings.Index(s, "const TELN=(()=>{const t={};`")
		if i < 0 {
			return
		}
		s = s[i+len("const TELN=(()=>{const t={};`"):]
		if j := strings.Index(s, "`"); j >= 0 {
			s = s[:j]
		}
		for _, l := range strings.Split(s, "\n") {
			if p := strings.Split(strings.TrimSpace(l), "|"); len(p) == 3 {
				telNames[p[0]] = [2]string{p[1], p[2]}
			}
		}
	})
	if p, ok := telNames[n]; ok {
		if es {
			return p[1]
		}
		return p[0]
	}
	return n
}
