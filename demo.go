package main

// Demo source: simulates a 20-car MX-5 race on a fictional circuit and writes it into
// a memory block laid out exactly like iRacing's shared memory, so the real
// parser and stream are exercised without the sim running.

import (
	"encoding/binary"
	"fmt"
	"math"
	"math/rand"
	"strings"
	"sync"
	"time"
)

const (
	demoTrackLen = 3602.0
	demoCars     = 20
	demoPlayer   = 7
)

type demoVar struct {
	name, desc, unit string
	typ              int32
	count            int
	offset           int
}

var demoVarDefs = append(baseDemoVars, tyreDemoVars()...)

func tyreDemoVars() []demoVar {
	var out []demoVar
	for _, c := range []string{"LF", "RF", "LR", "RR"} {
		for _, z := range []struct{ k, n string }{{"L", "left"}, {"M", "middle"}, {"R", "right"}} {
			out = append(out, demoVar{name: c + "tempC" + z.k, desc: c + " tire " + z.n + " carcass temperature", unit: "C", typ: TypeFloat})
			out = append(out, demoVar{name: c + "wear" + z.k, desc: c + " tire " + z.n + " percent tread remaining", unit: "%", typ: TypeFloat})
		}
		out = append(out, demoVar{name: c + "coldPressure", desc: c + " tire cold pressure  as set in the garage", unit: "kPa", typ: TypeFloat})
		out = append(out, demoVar{name: c + "brakeLinePress", desc: c + " brake line pressure", unit: "bar", typ: TypeFloat})
	}
	return out
}

var baseDemoVars = []demoVar{
	{name: "SessionTime", desc: "Seconds since session start", unit: "s", typ: TypeDouble},
	{name: "SessionTick", desc: "Current update number", typ: TypeInt},
	{name: "SessionNum", desc: "Session number", typ: TypeInt},
	{name: "SessionState", desc: "Session state", unit: "irsdk_SessionState", typ: TypeInt},
	{name: "SessionFlags", desc: "Session flags", unit: "irsdk_Flags", typ: TypeBitField},
	{name: "SessionTimeRemain", desc: "Seconds left till session ends", unit: "s", typ: TypeDouble},
	{name: "SessionLapsRemainEx", desc: "New improved laps left till session ends", typ: TypeInt},
	{name: "SessionLapsTotal", desc: "Total number of laps in session", typ: TypeInt},
	{name: "PlayerCarIdx", desc: "Players carIdx", typ: TypeInt},
	{name: "PlayerCarPosition", desc: "Players position in race", typ: TypeInt},
	{name: "PlayerCarClassPosition", desc: "Players class position in race", typ: TypeInt},
	{name: "IsOnTrack", desc: "1=Car on track physics running with player in car", typ: TypeBool},
	{name: "OnPitRoad", desc: "Is the player car on pit road between the cones", typ: TypeBool},
	{name: "Speed", desc: "GPS vehicle speed", unit: "m/s", typ: TypeFloat},
	{name: "RPM", desc: "Engine rpm", unit: "revs/min", typ: TypeFloat},
	{name: "Gear", desc: "-1=reverse  0=neutral  1..n=current gear", typ: TypeInt},
	{name: "Throttle", desc: "0=off throttle to 1=full throttle", unit: "%", typ: TypeFloat},
	{name: "Brake", desc: "0=brake released to 1=max pedal force", unit: "%", typ: TypeFloat},
	{name: "Clutch", desc: "0=disengaged to 1=fully engaged", unit: "%", typ: TypeFloat},
	{name: "SteeringWheelAngle", desc: "Steering wheel angle", unit: "rad", typ: TypeFloat},
	{name: "Lap", desc: "Laps started count", typ: TypeInt},
	{name: "LapCompleted", desc: "Laps completed count", typ: TypeInt},
	{name: "LapDist", desc: "Meters traveled from S/F this lap", unit: "m", typ: TypeFloat},
	{name: "LapDistPct", desc: "Percentage distance around lap", unit: "%", typ: TypeFloat},
	{name: "LapCurrentLapTime", desc: "Estimate of players current lap time as shown in F3 box", unit: "s", typ: TypeFloat},
	{name: "LapLastLapTime", desc: "Players last lap time", unit: "s", typ: TypeFloat},
	{name: "LapBestLapTime", desc: "Players best lap time", unit: "s", typ: TypeFloat},
	{name: "LapBestLap", desc: "Players best lap number", typ: TypeInt},
	{name: "LapDeltaToBestLap", desc: "Delta time for best lap", unit: "s", typ: TypeFloat},
	{name: "LapDeltaToBestLap_OK", desc: "Delta time for best lap is valid", typ: TypeBool},
	{name: "LapDeltaToSessionBestLap", desc: "Delta time for session best lap", unit: "s", typ: TypeFloat},
	{name: "FuelLevel", desc: "Liters of fuel remaining", unit: "l", typ: TypeFloat},
	{name: "FuelLevelPct", desc: "Percent fuel remaining", unit: "%", typ: TypeFloat},
	{name: "FuelUsePerHour", desc: "Engine fuel used instantaneous", unit: "kg/h", typ: TypeFloat},
	{name: "WaterTemp", desc: "Engine coolant temp", unit: "C", typ: TypeFloat},
	{name: "OilTemp", desc: "Engine oil temperature", unit: "C", typ: TypeFloat},
	{name: "OilPress", desc: "Engine oil pressure", unit: "bar", typ: TypeFloat},
	{name: "Voltage", desc: "Engine voltage", unit: "V", typ: TypeFloat},
	{name: "AirTemp", desc: "Temperature of air at start/finish line", unit: "C", typ: TypeFloat},
	{name: "TrackTempCrew", desc: "Temperature of track measured by crew around track", unit: "C", typ: TypeFloat},
	{name: "LatAccel", desc: "Lateral acceleration (including gravity)", unit: "m/s^2", typ: TypeFloat},
	{name: "LongAccel", desc: "Longitudinal acceleration (including gravity)", unit: "m/s^2", typ: TypeFloat},
	{name: "YawRate", desc: "Yaw rate", unit: "rad/s", typ: TypeFloat},
	{name: "CarLeftRight", desc: "Notify if car is to the left or right of driver", unit: "irsdk_CarLeftRight", typ: TypeInt},
	{name: "DRS_Status", desc: "Drag Reduction System Status", typ: TypeInt},
	{name: "P2P_Status", desc: "Push2Pass active or not", typ: TypeBool},
	{name: "P2P_Count", desc: "Push2Pass count of usage (or remaining in Race)", typ: TypeInt},
	{name: "PlayerCarMyIncidentCount", desc: "Players own incident count for this session", typ: TypeInt},
	{name: "SessionTimeOfDay", desc: "Time of day in seconds", unit: "s", typ: TypeFloat},
	{name: "TrackWetness", desc: "How wet is the average track surface", unit: "irsdk_TrackWetness", typ: TypeInt},
	{name: "BrakeABSactive", desc: "true if abs is currently reducing brake force pressure", typ: TypeBool},
	{name: "Yaw", desc: "Yaw orientation", unit: "rad", typ: TypeFloat},
	{name: "YawNorth", desc: "Yaw orientation relative to north", unit: "rad", typ: TypeFloat},
	{name: "VelocityX", desc: "X velocity", unit: "m/s", typ: TypeFloat},
	{name: "VelocityY", desc: "Y velocity", unit: "m/s", typ: TypeFloat},
	{name: "PlayerTireCompound", desc: "Players car current tire compound", typ: TypeInt},
	{name: "TireSetsUsed", desc: "How many tire sets used so far", typ: TypeInt},
	{name: "TireSetsAvailable", desc: "How many tire sets are remaining  255 is unlimited", typ: TypeInt},
	{name: "PitSvFuel", desc: "Pit service fuel add amount", unit: "l or kWh", typ: TypeFloat},
	{name: "CarIdxLap", desc: "Laps started by car index", typ: TypeInt, count: 64},
	{name: "CarIdxLapCompleted", desc: "Laps completed by car index", typ: TypeInt, count: 64},
	{name: "CarIdxLapDistPct", desc: "Percentage distance around lap by car index", unit: "%", typ: TypeFloat, count: 64},
	{name: "CarIdxPosition", desc: "Cars position in race by car index", typ: TypeInt, count: 64},
	{name: "CarIdxClassPosition", desc: "Cars class position in race by car index", typ: TypeInt, count: 64},
	{name: "CarIdxEstTime", desc: "Estimated time to reach current location on track", unit: "s", typ: TypeFloat, count: 64},
	{name: "CarIdxF2Time", desc: "Race time behind leader or fastest lap time otherwise", unit: "s", typ: TypeFloat, count: 64},
	{name: "CarIdxLastLapTime", desc: "Cars last lap time", unit: "s", typ: TypeFloat, count: 64},
	{name: "CarIdxBestLapTime", desc: "Cars best lap time", unit: "s", typ: TypeFloat, count: 64},
	{name: "CarIdxOnPitRoad", desc: "On pit road between the cones by car index", typ: TypeBool, count: 64},
	{name: "CarIdxTrackSurface", desc: "Track surface type by car index", unit: "irsdk_TrkLoc", typ: TypeInt, count: 64},
	{name: "CarIdxGear", desc: "Cars current gear by car index", typ: TypeInt, count: 64},
	{name: "CarIdxRPM", desc: "Engine rpm by car index", unit: "revs/min", typ: TypeFloat, count: 64},
	{name: "CarIdxTireCompound", desc: "Cars current tire compound", typ: TypeInt, count: 64},
}

type demoCar struct {
	pace      float64 // >1 = slower than reference
	dist      float64 // total meters driven
	lapStart  float64
	last, bst float64
	name      string
	num       int
	ir        int
	lic       string
	licColor  string
}

type demoSource struct {
	mu      sync.Mutex
	mem     []byte
	vars    map[string]*demoVar
	bufOff  [3]int
	bufLen  int
	tick    int32
	cur     int
	t       float64
	cars    []demoCar
	prof    []float64
	tBest   []float64
	fuel    float64
	lapFuel float64
	steer   float64
	rng     *rand.Rand
	sessUpd int32
	lapF    float64
	tgtF    float64
	stop    chan struct{}
	vmax    float64
	head    []float64
	p2pLeft float64
	kappa   []float64
}

var demoRate = 1.0

func newDemoSource() Source { return &demoSource{} }

func (d *demoSource) Name() string { return "demo" }

func (d *demoSource) Open() error {
	d.rng = rand.New(rand.NewSource(7))
	d.buildTrack()
	names := []string{"Jonas Weber", "Mia Okafor", "Luca Bianchi", "Sam Reyes", "Hana Sato", "Tom Fischer", "Iván Morales", "Alex D.", "Ella Novak", "Rui Costa", "Noah Brandt", "Aiko Tanaka", "Pierre Lefèvre", "Omar Haddad", "Lena Kraus", "Diego Ruiz", "Finn O'Neill", "Sara Lind", "Marco Rossi", "Ana Duarte"}
	lics := []string{"A", "B", "B", "C", "B", "A", "C", "B", "D", "C", "B", "C", "A", "D", "B", "C", "D", "R", "B", "C"}
	colors := map[string]string{"R": "0xff0000", "D": "0xff8c00", "C": "0xffcc00", "B": "0x00c702", "A": "0x0153db"}
	d.cars = make([]demoCar, demoCars)
	for i := range d.cars {
		pace := 0.992 + float64(i)*0.0011 + d.rng.Float64()*0.002
		if i == demoPlayer {
			pace = 1.0
		}
		start := -float64(i) * 9.0
		d.cars[i] = demoCar{pace: pace, dist: demoTrackLen*6 + 0.62*demoTrackLen + start, name: names[i], num: []int{17, 42, 23, 91, 5, 33, 12, 8, 64, 2, 71, 19, 3, 88, 27, 55, 9, 46, 11, 30}[i],
			ir: 2650 - i*31 + d.rng.Intn(60), lic: lics[i], licColor: colors[lics[i]]}
		d.cars[i].lapStart = -d.tBest[int(math.Mod(d.cars[i].dist, demoTrackLen))] * pace
		d.cars[i].bst = 98.2 * pace
		d.cars[i].last = 98.6 * pace
	}
	d.fuel, d.lapFuel = 29.6, 29.6
	d.p2pLeft = 168
	d.lapF, d.tgtF = 1.004, 1.004

	// lay out the memory block
	off := 0
	for i := range demoVarDefs {
		v := &demoVarDefs[i]
		if v.count == 0 {
			v.count = 1
		}
		v.offset = off
		off += typeSize[v.typ] * v.count
	}
	d.bufLen = (off + 15) &^ 15
	d.vars = map[string]*demoVar{}
	for i := range demoVarDefs {
		d.vars[demoVarDefs[i].name] = &demoVarDefs[i]
	}
	varHdrOff := 1024
	sessOff := varHdrOff + len(demoVarDefs)*varHeaderSize
	sessLen := 64 * 1024
	bufStart := (sessOff + sessLen + 4095) &^ 4095
	total := bufStart + 3*d.bufLen
	d.mem = make([]byte, total)
	for i := range d.bufOff {
		d.bufOff[i] = bufStart + i*d.bufLen
	}
	put := func(o int, v int32) { binary.LittleEndian.PutUint32(d.mem[o:], uint32(v)) }
	put(0, 2)
	put(4, irsdkStatusConnected)
	put(8, 60)
	put(16, int32(sessLen))
	put(20, int32(sessOff))
	put(24, int32(len(demoVarDefs)))
	put(28, int32(varHdrOff))
	put(32, 3)
	put(36, int32(d.bufLen))
	for i := range d.bufOff {
		put(48+i*16+4, int32(d.bufOff[i]))
	}
	for i, v := range demoVarDefs {
		o := varHdrOff + i*varHeaderSize
		put(o, v.typ)
		put(o+4, int32(v.offset))
		put(o+8, int32(v.count))
		copy(d.mem[o+16:o+48], v.name)
		copy(d.mem[o+48:o+112], v.desc)
		copy(d.mem[o+112:o+144], v.unit)
	}
	d.writeSession()
	d.stop = make(chan struct{})
	go d.run()
	return nil
}

// Demo circuit: a Catmull-Rom spline through hand-placed control points,
// scaled to demoTrackLen metres. The speed profile follows the curvature.
var demoControl = [][2]float64{{0, 0}, {520, 0}, {700, 40}, {760, 170}, {690, 280}, {560, 250}, {470, 330}, {540, 470}, {420, 560}, {300, 500}, {330, 400}, {180, 330}, {-80, 330}, {-230, 230}, {-210, 70}}

func demoGeometry() (head, kappa []float64) {
	c := demoControl
	n := len(c)
	var px, py []float64
	cr := func(a, b, cc, d, t float64) float64 {
		t2, t3 := t*t, t*t*t
		return 0.5 * (2*b + (-a+cc)*t + (2*a-5*b+4*cc-d)*t2 + (-a+3*b-3*cc+d)*t3)
	}
	for i := 0; i < n; i++ {
		p0, p1, p2, p3 := c[(i-1+n)%n], c[i], c[(i+1)%n], c[(i+2)%n]
		for k := 0; k < 400; k++ {
			t := float64(k) / 400
			px = append(px, cr(p0[0], p1[0], p2[0], p3[0], t))
			py = append(py, cr(p0[1], p1[1], p2[1], p3[1], t))
		}
	}
	px, py = append(px, px[0]), append(py, py[0])
	L := []float64{0}
	for k := 1; k < len(px); k++ {
		L = append(L, L[k-1]+math.Hypot(px[k]-px[k-1], py[k]-py[k-1]))
	}
	sc := demoTrackLen / L[len(L)-1]
	N := int(demoTrackLen)
	xs, ys := make([]float64, N), make([]float64, N)
	j := 0
	for i := 0; i < N; i++ {
		s := float64(i) / sc
		for L[j+1] < s {
			j++
		}
		f := (s - L[j]) / (L[j+1] - L[j])
		xs[i] = (px[j] + (px[j+1]-px[j])*f) * sc
		ys[i] = (py[j] + (py[j+1]-py[j])*f) * sc
	}
	head, kappa = make([]float64, N), make([]float64, N)
	for i := 0; i < N; i++ {
		a, b := (i-1+N)%N, (i+1)%N
		head[i] = math.Atan2(ys[b]-ys[a], xs[b]-xs[a])
	}
	wrap := func(a float64) float64 { return math.Mod(a+3*math.Pi, 2*math.Pi) - math.Pi }
	raw := make([]float64, N)
	for i := 0; i < N; i++ {
		raw[i] = wrap(head[(i+1)%N]-head[(i-1+N)%N]) / 2
	}
	for i := 0; i < N; i++ {
		sum := 0.0
		for k := -7; k <= 7; k++ {
			sum += raw[(i+k+N)%N]
		}
		kappa[i] = sum / 15
	}
	return
}

func (d *demoSource) buildTrack() {
	n := int(demoTrackLen)
	d.head, d.kappa = demoGeometry()
	vmax, ab, aa := 188/3.6, 10.5, 3.4
	d.prof = make([]float64, n)
	for i := range d.prof {
		d.prof[i] = math.Min(vmax, math.Sqrt(14/math.Max(math.Abs(d.kappa[i]), 1e-6)))
	}
	for pass := 0; pass < 2; pass++ {
		for i := n - 1; i >= 0; i-- {
			d.prof[i] = math.Min(d.prof[i], math.Sqrt(d.prof[(i+1)%n]*d.prof[(i+1)%n]+2*ab))
		}
		for i := 0; i < n; i++ {
			p := d.prof[(i-1+n)%n]
			d.prof[i] = math.Min(d.prof[i], math.Sqrt(p*p+2*aa))
		}
	}
	raw := 0.0
	for _, v := range d.prof {
		raw += 1 / v
	}
	scale := raw / 98.214
	d.vmax = vmax * scale
	d.tBest = make([]float64, n)
	t := 0.0
	for i := range d.prof {
		d.prof[i] *= scale
		d.tBest[i] = t
		t += 1 / d.prof[i]
	}
}

func (d *demoSource) speedAt(m float64) float64 {
	i := int(math.Mod(math.Mod(m, demoTrackLen)+demoTrackLen, demoTrackLen))
	return d.prof[i]
}

func (d *demoSource) run() {
	tk := time.NewTicker(time.Second / 60)
	defer tk.Stop()
	for {
		select {
		case <-d.stop:
			return
		case <-tk.C:
			d.step(demoRate / 60)
		}
	}
}

func (d *demoSource) step(dt float64) {
	d.mu.Lock()
	defer d.mu.Unlock()
	d.t += dt
	d.lapF += (d.tgtF - d.lapF) * dt * 0.3
	for i := range d.cars {
		c := &d.cars[i]
		pace := c.pace
		if i == demoPlayer {
			pace = d.lapF
		}
		pace *= 1 + 0.003*math.Sin(d.t/7+float64(i))
		prevLap := int(c.dist / demoTrackLen)
		c.dist += d.speedAt(c.dist) / pace * dt
		if int(c.dist/demoTrackLen) > prevLap {
			lt := d.t - c.lapStart
			if c.lapStart > 0 || i != demoPlayer {
				c.last = lt
				if lt < c.bst {
					c.bst = lt
				}
			}
			c.lapStart = d.t
			if i == demoPlayer {
				d.lapFuel = d.fuel
				d.tgtF = 0.997 + d.rng.Float64()*0.016
			}
		}
	}
	me := &d.cars[demoPlayer]
	pct := math.Mod(me.dist, demoTrackLen)
	v := d.speedAt(me.dist) / d.lapF
	a := d.speedAt(me.dist+3) - d.speedAt(me.dist)
	thr, brk := 0.0, 0.0
	switch {
	case a < -0.02:
		brk = math.Min(1, -a/0.7)
	case d.speedAt(me.dist) > d.vmax*0.985:
		thr = 0.95
	default:
		thr = math.Min(1, 0.55+a*6)
	}
	d.fuel -= 1.95 / 98.5 * dt * (0.6 + 0.6*thr)
	if d.fuel < 2 {
		d.fuel = 40
	}
	kmh := v * 3.6
	gears := []float64{0, 62, 92, 122, 152, 180, 999}
	g := 6
	for i := 1; i < len(gears); i++ {
		if kmh < gears[i] {
			g = i
			break
		}
	}
	rpm := 4500 + (kmh-gears[g-1])/(gears[g]-gears[g-1])*2700
	if g == 1 {
		rpm = 2600 + kmh/62*4600
	}
	ki := int(pct) % len(d.kappa)
	d.steer += (math.Max(-4, math.Min(4, d.kappa[ki]*60)) - d.steer) * 0.2

	// race order
	order := make([]int, demoCars)
	for i := range order {
		order[i] = i
	}
	for i := 1; i < len(order); i++ {
		for j := i; j > 0 && d.cars[order[j]].dist > d.cars[order[j-1]].dist; j-- {
			order[j], order[j-1] = order[j-1], order[j]
		}
	}
	pos := make([]int, demoCars)
	for p, idx := range order {
		pos[idx] = p + 1
	}
	leader := d.cars[order[0]].dist

	d.cur = (d.cur + 1) % 3
	b := d.mem[d.bufOff[d.cur] : d.bufOff[d.cur]+d.bufLen]
	for i := range b {
		b[i] = 0
	}
	f := func(n string, val float64) {
		x := d.vars[n]
		binary.LittleEndian.PutUint32(b[x.offset:], math.Float32bits(float32(val)))
	}
	fi := func(n string, i int, val float64) {
		x := d.vars[n]
		binary.LittleEndian.PutUint32(b[x.offset+4*i:], math.Float32bits(float32(val)))
	}
	in := func(n string, val int) { binary.LittleEndian.PutUint32(b[d.vars[n].offset:], uint32(int32(val))) }
	ini := func(n string, i, val int) {
		binary.LittleEndian.PutUint32(b[d.vars[n].offset+4*i:], uint32(int32(val)))
	}
	bo := func(n string, val bool) {
		if val {
			b[d.vars[n].offset] = 1
		}
	}
	binary.LittleEndian.PutUint64(b[d.vars["SessionTime"].offset:], math.Float64bits(d.t+1834))
	in("SessionTick", int(d.tick))
	in("SessionNum", 2)
	in("SessionState", 4)
	in("SessionFlags", 0x00040000|0x00000004) // green + start
	binary.LittleEndian.PutUint64(b[d.vars["SessionTimeRemain"].offset:], math.Float64bits(604800))
	lap := int(me.dist/demoTrackLen) + 1
	in("SessionLapsRemainEx", 20-lap+1)
	in("SessionLapsTotal", 20)
	in("PlayerCarIdx", demoPlayer)
	in("PlayerCarPosition", pos[demoPlayer])
	in("PlayerCarClassPosition", pos[demoPlayer])
	bo("IsOnTrack", true)
	f("Speed", v)
	f("RPM", rpm)
	in("Gear", g)
	f("Throttle", thr)
	f("Brake", brk)
	f("Clutch", 1)
	f("SteeringWheelAngle", d.steer)
	in("Lap", lap)
	in("LapCompleted", lap-1)
	f("LapDist", pct)
	f("LapDistPct", pct/demoTrackLen)
	cur := d.t - me.lapStart
	f("LapCurrentLapTime", cur)
	f("LapLastLapTime", me.last)
	f("LapBestLapTime", me.bst)
	in("LapBestLap", 4)
	f("LapDeltaToBestLap", cur-d.tBest[int(pct)]*me.bst/98.214)
	bo("LapDeltaToBestLap_OK", true)
	f("LapDeltaToSessionBestLap", cur-d.tBest[int(pct)]*0.9935)
	f("FuelLevel", d.fuel)
	f("FuelLevelPct", d.fuel/45)
	f("FuelUsePerHour", (0.6+0.6*thr)*1.95/98.5*3600*0.75)
	f("WaterTemp", 88+thr*4)
	f("OilTemp", 101+thr*3)
	f("OilPress", 3.9+rpm/7000)
	f("Voltage", 13.8)
	f("AirTemp", 19.4)
	f("TrackTempCrew", 27.8)
	f("LatAccel", v*v*d.kappa[ki])
	f("Yaw", d.head[ki])
	f("YawNorth", d.head[ki])
	f("VelocityX", v)
	f("VelocityY", 0)
	f("LongAccel", -brk*11+thr*3)
	f("YawRate", v*d.kappa[ki])
	// tyre readings change when a lap is completed (iRacing updates them in the pits)
	for ci, c := range []string{"LF", "RF", "LR", "RR"} {
		base := []float64{78, 87, 74, 82}[ci] + float64(lap%5)*0.6 + math.Sin(float64(lap+ci))*1.2
		spread := []float64{7, 2, 6, 5}[ci] // inner hotter than outer
		left := ci%2 == 0                   // left-side tyre: "L" zone is the outside
		inner, outer := base+spread/2, base-spread/2
		zl, zr := inner, outer
		if left {
			zl, zr = outer, inner
		}
		f(c+"tempCL", zl)
		f(c+"tempCM", base+[]float64{-1, 2.5, -0.5, 0}[ci])
		f(c+"tempCR", zr)
		w := 1 - float64(lap)*[]float64{0.0021, 0.0034, 0.0016, 0.0024}[ci]
		f(c+"wearL", w-0.004)
		f(c+"wearM", w)
		f(c+"wearR", w-0.002)
		f(c+"coldPressure", []float64{138, 145, 131, 138}[ci])
		f(c+"brakeLinePress", brk*[]float64{48, 48, 31, 31}[ci])
	}
	in("PlayerTireCompound", 0)
	// cars alongside: within half a car length either way
	lr, nearL, nearR := 1, 0, 0
	for i := range d.cars {
		if i == demoPlayer {
			continue
		}
		g := math.Mod(d.cars[i].dist-me.dist+demoTrackLen*1.5, demoTrackLen) - demoTrackLen/2
		if math.Abs(g) < 4.5 {
			if i%2 == 0 {
				nearL++
			} else {
				nearR++
			}
		}
	}
	switch {
	case nearL > 0 && nearR > 0:
		lr = 4
	case nearL > 1:
		lr = 5
	case nearR > 1:
		lr = 6
	case nearL == 1:
		lr = 2
	case nearR == 1:
		lr = 3
	}
	in("CarLeftRight", lr)
	pp := pct / demoTrackLen
	drs := 0
	switch {
	case pp > 0.90 && pp < 0.97:
		drs = 1
	case pp >= 0.97 || pp < 0.02:
		drs = 2
	case pp >= 0.02 && pp < 0.14:
		drs = 3
	}
	in("DRS_Status", drs)
	// push to pass works like IndyCar: 200 seconds per race, used on the main straight
	p2p := pp > 0.04 && pp < 0.11 && d.p2pLeft > 0
	if p2p {
		d.p2pLeft -= 1.0 / 60 * demoRate
	}
	bo("P2P_Status", p2p)
	in("P2P_Count", int(math.Ceil(d.p2pLeft)))
	// a 1x or 2x now and then so the incident log has something to show
	inc := 2 + int(d.t/170) + int(d.t/410)
	in("PlayerCarMyIncidentCount", inc)
	f("SessionTimeOfDay", 14*3600+d.t)
	in("TrackWetness", 1)
	bo("BrakeABSactive", brk > 0.95)
	in("TireSetsUsed", 1)
	in("TireSetsAvailable", 255)
	for i := 0; i < 64; i++ {
		if i >= demoCars {
			fi("CarIdxLapDistPct", i, -1)
			ini("CarIdxTrackSurface", i, -1)
			ini("CarIdxPosition", i, 0)
			continue
		}
		c := d.cars[i]
		p := math.Mod(c.dist, demoTrackLen)
		ini("CarIdxLap", i, int(c.dist/demoTrackLen)+1)
		ini("CarIdxLapCompleted", i, int(c.dist/demoTrackLen))
		fi("CarIdxLapDistPct", i, p/demoTrackLen)
		ini("CarIdxPosition", i, pos[i])
		ini("CarIdxClassPosition", i, pos[i])
		fi("CarIdxEstTime", i, d.tBest[int(p)])
		fi("CarIdxF2Time", i, (leader-c.dist)/40.0)
		fi("CarIdxLastLapTime", i, c.last)
		fi("CarIdxBestLapTime", i, c.bst)
		ini("CarIdxTrackSurface", i, 3)
		ini("CarIdxGear", i, 3)
		fi("CarIdxRPM", i, 6000)
		ini("CarIdxTireCompound", i, 0)
	}
	d.tick++
	binary.LittleEndian.PutUint32(d.mem[48+d.cur*16:], uint32(d.tick))
}

func (d *demoSource) writeSession() {
	var sb strings.Builder
	sb.WriteString(`---
WeekendInfo:
 TrackName: pitwalldemo
 TrackID: 9001
 TrackLength: 3.60 km
 TrackDisplayName: Pit Wall Demo Circuit
 TrackDisplayShortName: Demo Circuit
 TrackConfigName: Full Course
 TrackCity: Demo
 TrackCountry: Demo
 TrackNumTurns: 11
 TrackWeatherType: Static
 TrackSkies: Partly Cloudy
 TrackSurfaceTemp: 27.80 C
 TrackAirTemp: 19.40 C
 TrackWindVel: 2.10 m/s
 TrackRelativeHumidity: 55 %
 SeriesID: 139
 SeasonID: 5101
 SessionID: 281734001
 SubSessionID: 78120455
 LeagueID: 0
 Official: 1
 RaceWeek: 3
 EventType: Race
 Category: SportsCar
 SimMode: full
 NumCarClasses: 1
 NumCarTypes: 1
 WeekendOptions:
  NumStarters: 20
  StartingGrid: single file
  QualifyScoring: best lap
  CourseCautions: local
  StandingStart: 0
  Restarts: double file back
  IncidentLimit: 17
 BuildVersion: 2026.09.29.01
SessionInfo:
 CurrentSessionNum: 2
 Sessions:
 - SessionNum: 0
   SessionLaps: unlimited
   SessionTime: 600.0000 sec
   SessionType: Practice
   SessionName: PRACTICE
 - SessionNum: 1
   SessionLaps: 2
   SessionTime: 480.0000 sec
   SessionType: Lone Qualify
   SessionName: QUALIFY
 - SessionNum: 2
   SessionLaps: 20
   SessionTime: unlimited
   SessionType: Race
   SessionName: RACE
CameraInfo:
 Groups:
 - GroupNum: 1
   GroupName: Nose
DriverInfo:
 DriverCarIdx: 7
 DriverUserID: 401234
 PaceCarIdx: -1
 DriverCarIdleRPM: 900.000
 DriverCarRedLine: 7500.000
 DriverCarFuelKgPerLtr: 0.750
 DriverCarFuelMaxLtr: 45.000
 DriverCarMaxFuelPct: 1.000
 DriverCarSLFirstRPM: 5200.000
 DriverCarSLShiftRPM: 7000.000
 DriverCarSLLastRPM: 6900.000
 DriverCarSLBlinkRPM: 7200.000
 DriverCarVersion: 2026.09.29.01
 DriverPitTrkPct: 0.938
 DriverCarEstLapTime: 98.2140
 DriverSetupName: baseline.sto
 DriverIncidentCount: 2
 Drivers:
`)
	for i, c := range d.cars {
		fmt.Fprintf(&sb, ` - CarIdx: %d
   UserName: %s
   AbbrevName: %s
   Initials: %s
   UserID: %d
   TeamName: %s
   CarNumber: "%d"
   CarNumberRaw: %d
   CarPath: mx5 mx52016
   CarClassID: 74
   CarID: 67
   CarScreenName: Global Mazda MX-5 Cup
   CarScreenNameShort: MX-5 Cup
   CarClassShortName: MX-5 Cup
   CarClassColor: 0xffda59
   CarClassEstLapTime: 98.2140
   IRating: %d
   LicLevel: 14
   LicSubLevel: 341
   LicString: %s %.2f
   LicColor: %s
   IsSpectator: 0
   CarIsPaceCar: 0
   CarIsAI: 0
   CurDriverIncidentCount: %d
`, i, c.name, c.name, c.name[:1], 400000+i*137, c.name, c.num, c.num, c.ir, c.lic, 1.5+float64((i*37)%250)/100, c.licColor, (i*3)%7)
	}
	sb.WriteString("QualifyResultsInfo:\n Results:\n")
	for i := range d.cars {
		fmt.Fprintf(&sb, " - Position: %d\n   ClassPosition: %d\n   CarIdx: %d\n   FastestLap: 0\n   FastestTime: %.4f\n", (i*7+3)%demoCars, (i*7+3)%demoCars, i, 97.5+float64((i*7+3)%demoCars)*0.08)
	}
	sb.WriteString("...\n")
	s := sb.String()
	sessOff := int(le32(d.mem, 20))
	sessLen := int(le32(d.mem, 16))
	raw := make([]byte, 0, len(s))
	for _, r := range s { // back to latin-1 like the sim
		if r < 256 {
			raw = append(raw, byte(r))
		} else {
			raw = append(raw, '?')
		}
	}
	if len(raw) >= sessLen {
		raw = raw[:sessLen-1]
	}
	copy(d.mem[sessOff:], raw)
	d.sessUpd++
	binary.LittleEndian.PutUint32(d.mem[12:], uint32(d.sessUpd))
}

func (d *demoSource) Mem() []byte { return d.mem }

func (d *demoSource) Wait(t time.Duration) { time.Sleep(t / 2) }

func (d *demoSource) Close() {
	if d.stop != nil {
		close(d.stop)
		d.stop = nil
	}
}
