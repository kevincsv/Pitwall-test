package main

import (
	"encoding/binary"
	"math"
	"testing"
)

// fieldSim: a made-up car driven round a lap at 60 Hz and fed to the field watcher as the game would send it: the
// lap counter, the last lap time and (when the game takes the lap) its best change at the line, and the arrays the
// game lacks stay nil
type fieldSim struct {
	L       float64
	speed   func(lap int, d float64) float64 // the true speed (m/s) at lap distance d of that lap (the first is 1)
	noise   func(k int) float64              // metres added to the position the game reports at sample k
	lag     bool                             // the game's position a frame late
	gear    func(v float64) int              // nil: the game gives no gear
	ratio   []float64                        // speed per rpm by gear (index = gear); nil: no revs
	steer   func(d float64) float64          // nil: no steering
	pedals  bool                             // the game gives the car's pedals
	geo     bool                             // the game gives the car's position
	startET bool                             // the game gives the moment each lap started
	surf    func(lap int, d float64) float64 // nil: 3 (on track)
	cnt     func(lap int, d float64) float64 // nil: no CarIdxLapCountFlag
	pit     func(lap int, d float64) float64 // nil: never on the pit road
	refuse  func(lap int) bool               // the game does not take this lap as the car's best
	key     string
	// what happened, exactly: the session time of every line crossing (the start of lap 1 first), the thirds of
	// every lap and the lap times in order
	cross []float64
	marks [][2]float64
	times []float64
}

const fieldSimT0 = 10.0 // the session clock when the car crosses the line the first time

// a circle the length of the lap, as a made-up latitude and longitude like LMU's
func (m *fieldSim) latLon(d float64) (float64, float64) {
	r := m.L / (2 * math.Pi)
	th := 2 * math.Pi * d / m.L
	x, y := r*math.Sin(th), r*(1-math.Cos(th))
	return 45 + y/110540, x / (111320 * math.Cos(45*math.Pi/180))
}

// run drives laps whole laps and then a few seconds more (the last lap's time has to arrive)
func (m *fieldSim) run(laps int) {
	const dt = 1.0 / 60
	d, lap, k := 0.0, 1, 0
	last, best := -1.0, -1.0
	m.cross = []float64{fieldSimT0}
	m.marks = [][2]float64{{0, 0}}
	var tail float64
	prevPct := 0.0
	for {
		t := fieldSimT0 + float64(k)*dt
		if lap > laps {
			if tail == 0 {
				tail = t
			}
			if t-tail > 8 {
				return
			}
		}
		in := d - float64(lap-1)*m.L
		v := m.speed(lap, in)
		s := fieldSample{t: t}
		pos := d
		if m.noise != nil {
			pos += m.noise(k)
		}
		pct := math.Mod(pos, m.L) / m.L
		if pct < 0 {
			pct += 1
		}
		rep := pct
		if m.lag {
			rep, prevPct = prevPct, pct
		}
		s.pct, s.lap, s.last, s.best = []float64{rep}, []float64{float64(lap)}, []float64{last}, []float64{best}
		surf := 3.0
		if m.surf != nil {
			surf = m.surf(lap, in)
		}
		s.surf = []float64{surf}
		pit := 0.0
		if m.pit != nil {
			pit = m.pit(lap, in)
		}
		s.pit = []float64{pit}
		if m.gear != nil {
			g := m.gear(v)
			s.gear = []float64{float64(g)}
			if m.ratio != nil && g > 0 && g < len(m.ratio) {
				s.rpm = []float64{v / m.ratio[g]}
			}
		}
		if m.steer != nil {
			s.steer = []float64{m.steer(in)}
		}
		if m.pedals {
			dv := m.speed(lap, in+1) - v
			th, br := 0.0, 0.0
			if dv < -0.01 {
				br = math.Min(1, -dv*5)
			} else {
				th = math.Min(1, 0.6+dv*20)
			}
			s.thr, s.brk = []float64{th}, []float64{br}
		}
		if m.geo {
			la, lo := m.latLon(in)
			s.lat, s.lon = []float64{la}, []float64{lo}
		}
		if m.cnt != nil {
			s.cnt = []float64{m.cnt(lap, in)}
		}
		if m.startET {
			s.start = []float64{m.cross[len(m.cross)-1]}
		}
		fieldStep(&s, m.L, m.key)
		// the car moves on; a line or a third mark crossed between two samples has its exact moment
		d2 := d + v*dt
		edge := float64(lap) * m.L
		for z, mk := range [2]float64{edge - 2*m.L/3, edge - m.L/3} {
			if d < mk && d2 >= mk {
				m.marks[len(m.marks)-1][z] = t + (mk-d)/(d2-d)*dt
			}
		}
		if d2 >= edge {
			tc := t + (edge-d)/(d2-d)*dt
			lt := tc - m.cross[len(m.cross)-1]
			m.cross = append(m.cross, tc)
			m.marks = append(m.marks, [2]float64{})
			m.times = append(m.times, lt)
			last = lt
			if (m.refuse == nil || !m.refuse(lap)) && (best < 0 || lt < best) {
				best = lt
			}
			lap++
		}
		d = d2
		k++
	}
}

// a 3 km lap with four corners, a little quicker every lap so no two laps take the same time
func simSpeed(lap int, d float64) float64 {
	c := math.Max(0, math.Cos(2*math.Pi*d/3000*4))
	return (50 - 20*c) * (1 + 0.01*float64(lap))
}

func simGear(v float64) int { return min(6, 1+int(v/12)) }

var simRatio = []float64{0, 0.007, 0.010, 0.013, 0.016, 0.019, 0.022}

func newSim(key string) *fieldSim {
	return &fieldSim{L: 3000, speed: simSpeed, key: key}
}

func fieldCar(t *testing.T, i int) *carLapProf {
	t.Helper()
	fieldMu.Lock()
	defer fieldMu.Unlock()
	c := fieldCars[i]
	if c == nil {
		t.Fatal("the car was never seen")
	}
	return c
}

func resetField() {
	fieldMu.Lock()
	fieldCars = map[int]*carLapProf{}
	fieldMu.Unlock()
}

// the line crossed between two 60 Hz samples is timed by interpolation; with the game's own moment of the lap's start
// (LMU) it is exact, even when the game's position runs a frame late
func TestFieldLineTiming(t *testing.T) {
	for _, exact := range []bool{false, true} {
		resetField()
		m := newSim("timing")
		m.lag, m.startET = true, exact
		m.run(3)
		c := fieldCar(t, 0)
		want := m.cross[len(m.cross)-1]
		if exact && c.cross[0] != want {
			t.Fatalf("with the game's start time the crossing is its own: %.6f want %.6f", c.cross[0], want)
		}
		if !exact && (math.Abs(c.cross[0]-want) > 0.03 || c.cross[0] == want) {
			t.Fatalf("interpolated crossing: %.6f want about %.6f", c.cross[0], want)
		}
		// the sectors of every lap whose start was seen (lap 1's only from the game's start time), thirds of the lap
		// timed from that start
		first := 1
		if exact {
			first = 0
		}
		if len(c.lapsS) != 3-first {
			t.Fatalf("laps with sectors: %d (exact %v)", len(c.lapsS), exact)
		}
		for k, l := range c.lapsS {
			lap := first + k // index in times and marks: lap 2 is times[1]
			if math.Abs(l.time-m.times[lap]) > 1e-6 {
				t.Fatalf("lap %d timed %.4f, the game said %.4f", lap+1, l.time, m.times[lap])
			}
			s1 := m.marks[lap][0] - m.cross[lap]
			s2 := m.marks[lap][1] - m.marks[lap][0]
			s3 := m.cross[lap+1] - m.marks[lap][1]
			tol := 0.03
			if math.Abs(l.s[0]-s1) > tol || math.Abs(l.s[1]-s2) > tol || math.Abs(l.s[2]-s3) > tol {
				t.Fatalf("lap %d sectors %v, want %.3f %.3f %.3f (exact %v)", lap+1, l.s, s1, s2, s3, exact)
			}
			if math.Abs(l.s[0]+l.s[1]+l.s[2]-l.time) > 0.002 {
				t.Fatalf("sectors do not add up: %v %.3f", l.s, l.time)
			}
		}
	}
	resetField()
}

// the speed from the revs in a fixed gear is closer to the truth than the speed the car's position gives
func TestFieldRPMSpeed(t *testing.T) {
	// the pure cleaning: a noisy position speed, exact revs, six gears, a neutral bin, a gear changed inside a bin
	truth := func(i int) float64 { return 30 + 20*math.Sin(float64(i)/40) }
	b := make([]fbin, 300)
	for i := range b {
		v := truth(i)
		g := simGear(v)
		noise := 1.5 * math.Sin(float64(i)*2.3)
		b[i] = fbin{v: float32(v + noise), gear: int8(g), rpm: float32(v / simRatio[g]), n: 5}
	}
	b[10].gear, b[10].rpm = 0, 3000 // neutral: the position's speed stays
	b[20].rpm = -1                  // the gear changed inside the bin: the position's speed stays
	b[30].v, b[30].rpm = 0, float32(truth(30)/simRatio[simGear(truth(30))])
	out := rpmSpeed(b)
	eRaw, eClean := 0.0, 0.0
	for i := range b {
		if i == 10 || i == 20 || i == 30 {
			continue
		}
		eRaw += math.Pow(float64(b[i].v)-truth(i), 2)
		eClean += math.Pow(float64(out[i])-truth(i), 2)
	}
	if eClean > 0.3*eRaw {
		t.Fatalf("the revs' speed is not cleaner: %.1f vs %.1f", eClean, eRaw)
	}
	if out[10] != b[10].v || out[20] != b[20].v {
		t.Fatalf("neutral or a shift inside the bin keep the position's speed: %v %v", out[10], out[20])
	}
	if math.Abs(float64(out[30])-truth(30)) > 0.5 {
		t.Fatalf("a bin the position never filled takes the revs' speed: %v want %.1f", out[30], truth(30))
	}
	// through the watcher: a noisy position and the car's revs; the best lap's speed is the cleaned one
	resetField()
	m := newSim("rpm")
	m.gear, m.ratio = simGear, simRatio
	m.noise = func(k int) float64 { return 0.05*math.Sin(float64(k)*1.7) + 0.03*math.Cos(float64(k)*0.9) }
	m.run(1) // one lap: its time is the best (a second one would be quicker)
	c := fieldCar(t, 0)
	if c.best == 0 || c.bestB == nil || len(c.bestV) != len(c.bestB) {
		t.Fatalf("no best lap with its bins: %.3f %d %d", c.best, len(c.bestV), len(c.bestB))
	}
	eRaw, eClean = 0, 0
	for i := range c.bestV {
		if c.bestB[i].v == 0 {
			continue
		}
		tr := simSpeed(1, float64(i)*fieldBin+fieldBin/2)
		eRaw += math.Pow(float64(c.bestB[i].v)-tr, 2)
		eClean += math.Pow(float64(c.bestV[i])-tr, 2)
	}
	if eRaw < 50 || eClean > 0.5*eRaw {
		t.Fatalf("the best lap's speed should be the cleaned one: %.1f (position %.1f)", eClean, eRaw)
	}
	resetField()
}

// off the track for a third of a second (20 samples at 60 Hz) makes the lap not valid: never the car's best, never
// shared; fewer samples, or a car not in the world (-1), do not
func TestFieldInvalidOffTrack(t *testing.T) {
	resetField()
	m := newSim("off")
	m.surf = func(lap int, d float64) float64 {
		switch {
		case lap == 2 && d >= 1000 && d < 1030: // about 35 samples at 45 m/s
			return 0
		case lap == 3 && d >= 1000 && d < 1007: // about 9
			return 0
		case lap == 3 && d >= 2000 && d < 2100:
			return -1
		}
		return 3
	}
	m.run(4)
	c := fieldCar(t, 0)
	if !fieldLapInvalid(0, m.times[1]) {
		t.Fatal("the lap that left the track is valid")
	}
	if fieldLapInvalid(0, m.times[0]) || fieldLapInvalid(0, m.times[2]) || fieldLapInvalid(0, m.times[3]) {
		t.Fatalf("a lap on the track judged not valid: %v", c.badT)
	}
	if math.Abs(c.best-m.times[3]) > 1e-6 { // the quickest valid lap, never the one off the track
		t.Fatalf("best %.4f, want lap 4's %.4f (lap 2 %.4f)", c.best, m.times[3], m.times[1])
	}
	if fieldLapInvalid(0, 12.345) || fieldLapInvalid(5, m.times[1]) || fieldLapInvalid(0, 0) {
		t.Fatal("a lap or car never seen judged not valid")
	}
	resetField()
}

// the game's own verdict (LMU): a lap whose time does not count past its first 100 m and off the pit road
func TestFieldInvalidLapCountFlag(t *testing.T) {
	resetField()
	m := newSim("cnt")
	m.cnt = func(lap int, d float64) float64 {
		switch {
		case lap == 2 && d >= 500 && d < 600:
			return 1
		case lap == 3 && d < 100: // the flag lags at the start of a lap
			return 1
		case lap == 4 && d >= 500 && d < 600: // on the pit road
			return 0
		case lap == 5:
			return -1 // unknown
		}
		return 2
	}
	m.pit = func(lap int, d float64) float64 {
		if lap == 4 && d >= 500 && d < 600 {
			return 1
		}
		return 0
	}
	m.run(5)
	c := fieldCar(t, 0)
	if !fieldLapInvalid(0, m.times[1]) {
		t.Fatal("the lap the game does not count is valid")
	}
	for _, k := range []int{0, 2, 3, 4} {
		if fieldLapInvalid(0, m.times[k]) {
			t.Fatalf("lap %d judged not valid: %v", k+1, c.badT)
		}
	}
	if math.Abs(c.best-m.times[4]) > 1e-6 {
		t.Fatalf("best %.4f, want lap 5's %.4f", c.best, m.times[4])
	}
	resetField()
}

// the game's best lap: a lap faster than the car's best before it that the game does not take as the new best was
// not accepted; a slower lap, or a car with no best yet, says nothing
func TestFieldInvalidGameBest(t *testing.T) {
	resetField()
	m := newSim("best")
	m.speed = func(lap int, d float64) float64 {
		if lap == 4 { // slower than the best, refused too: nothing to say
			return simSpeed(1, d) * 0.98
		}
		return simSpeed(lap, d)
	}
	m.refuse = func(lap int) bool { return lap == 2 || lap == 4 }
	m.run(4)
	c := fieldCar(t, 0)
	if fieldLapInvalid(0, m.times[0]) {
		t.Fatal("the first lap (no best before it) judged not valid")
	}
	if !fieldLapInvalid(0, m.times[1]) {
		t.Fatal("the lap the game refused as its best is valid")
	}
	if fieldLapInvalid(0, m.times[2]) || fieldLapInvalid(0, m.times[3]) {
		t.Fatalf("laps 3 and 4: %v", c.badT)
	}
	if math.Abs(c.best-m.times[2]) > 1e-6 {
		t.Fatalf("best %.4f, want lap 3's %.4f", c.best, m.times[2])
	}
	if len(c.badT) != 1 {
		t.Fatalf("laps judged not valid: %v", c.badT)
	}
	resetField()
}

// the trace of a rival's lap carries the gear and the steering, the car's own pedals when the game gave them ("real")
// and its path in the player's frame when the game gave its position
func TestFieldTraceColumns(t *testing.T) {
	resetField()
	m := newSim("trace")
	m.gear, m.ratio, m.pedals, m.geo, m.startET = simGear, simRatio, true, true, true
	m.steer = func(d float64) float64 { return 0.3 * math.Sin(2*math.Pi*d/3000*3) }
	m.run(1)
	c := fieldCar(t, 0)
	if c.best == 0 {
		t.Fatal("no best lap")
	}
	tr := fieldTrace(0, m.times[0])
	if tr == nil || tr.Src != "real" || len(tr.D) != 2*(int(3000/fieldBin)+1) {
		t.Fatalf("trace: %+v", tr)
	}
	la0, lo0 := m.latLon(0)
	org := geoBase("trace", la0, lo0)
	if len(tr.X) != len(tr.D) || len(tr.Y) != len(tr.D) || len(tr.G) != 2 || tr.G[0] != org[0] || tr.G[1] != org[1] {
		t.Fatalf("path: %d %d %v want origin %v", len(tr.X), len(tr.Y), tr.G, org)
	}
	thr, brk := 0, 0
	for i, p := range tr.D {
		d := float64(i) * lapBin
		if d < 20 || d > 2980 {
			continue
		}
		if g1, g2 := simGear(simSpeed(1, d-15)), simGear(simSpeed(1, d+15)); g1 == g2 && int(p[3]) != g1 {
			t.Fatalf("gear at %.0f m: %v want %d", d, p[3], g1)
		}
		if math.Abs(p[4]-m.steer(d)) > 0.05 {
			t.Fatalf("steering at %.0f m: %.3f want %.3f", d, p[4], m.steer(d))
		}
		if p[1] > 0 && p[1] < 1 {
			thr++ // the car's own throttle, not the estimate's 0 or 1
		}
		if p[2] > 0 {
			brk++
		}
		// the path, placed as the lap recorder places the player's own car
		r := &lapRec{}
		la, lo := m.latLon(d)
		r.place(0, org, la, lo)
		if math.Hypot(r.pos[0]-tr.X[i], r.pos[1]-tr.Y[i]) > 3 {
			t.Fatalf("path at %.0f m: %.1f,%.1f want %.1f,%.1f", d, tr.X[i], tr.Y[i], r.pos[0], r.pos[1])
		}
	}
	if thr < 50 || brk < 30 {
		t.Fatalf("the car's own pedals: throttle in %d points, braking in %d", thr, brk)
	}
	sum := 0.0
	for _, p := range tr.D {
		sum += float64(lapBin) / p[0]
	}
	if math.Abs(sum-m.times[0]) > 0.05 {
		t.Fatalf("the trace does not add up to the lap: %.3f want %.3f", sum, m.times[0])
	}
	// iRacing: gear, revs and steering, no pedals and no position: the pedals are estimated, no path
	resetField()
	m = newSim("trace2")
	m.gear, m.ratio = simGear, simRatio
	m.steer = func(d float64) float64 { return 0.2 }
	m.run(1)
	tr = fieldTrace(0, m.times[0])
	if tr == nil || tr.Src != "field" || tr.X != nil || tr.G != nil {
		t.Fatalf("iRacing trace: %+v", tr)
	}
	if p := tr.D[100]; p[3] != float64(simGear(simSpeed(1, 500))) || math.Abs(p[4]-0.2) > 0.001 || (p[1] != 0 && p[1] != 1) {
		t.Fatalf("iRacing columns: %v", p)
	}
	resetField()
}

// a rival whose best lap the watcher judged not valid is not shared at all
func TestFieldShareSkipsInvalid(t *testing.T) {
	fieldMu.Lock()
	fieldCars = map[int]*carLapProf{1: {badT: []float64{98.5}}}
	fieldMu.Unlock()
	r := &raceReport{TrackID: 166, Track: "Okayama", Best: 99, Results: []raceResult{
		{Name: "x", Laps: 5, Best: 98.5, CarID: 67, key: "k1", carIdx: 1},
		{Name: "y", Laps: 5, Best: 98.9, CarID: 67, key: "k2", carIdx: 2},
	}}
	top := fieldTopLaps(r)
	if len(top) != 1 || top[0]["name"] != "y" {
		t.Fatalf("the rival's refused lap went to the community: %v", top)
	}
	resetField()
}

// the watcher's reader decodes every type of the game's arrays into buffers it keeps, nil for a variable the game lacks
func TestTelReader(t *testing.T) {
	buf := make([]byte, 64)
	binary.LittleEndian.PutUint32(buf[0:], math.Float32bits(1.5))
	binary.LittleEndian.PutUint32(buf[4:], math.Float32bits(float32(math.NaN())))
	neg := int32(-7)
	binary.LittleEndian.PutUint32(buf[8:], uint32(neg))
	buf[12] = 1
	binary.LittleEndian.PutUint64(buf[16:], math.Float64bits(45.25))
	vars := []VarHeader{
		{Name: "F", typ: TypeFloat, offset: 0, Count: 2},
		{Name: "I", typ: TypeInt, offset: 8, Count: 1},
		{Name: "B", typ: TypeBool, offset: 12, Count: 1},
		{Name: "D", typ: TypeDouble, offset: 16, Count: 1},
		{Name: "Far", typ: TypeDouble, offset: 60, Count: 2}, // beyond the buffer
	}
	tel.mu.Lock()
	oldVars, oldIdx, oldBuf := tel.vars, tel.index, tel.buf
	tel.vars, tel.index, tel.buf = vars, map[string]int{}, buf
	for i, v := range vars {
		tel.index[v.Name] = i
	}
	tel.mu.Unlock()
	defer func() {
		tel.mu.Lock()
		tel.vars, tel.index, tel.buf = oldVars, oldIdx, oldBuf
		tel.mu.Unlock()
	}()
	rd := newTelReader([]string{"F", "I", "B", "D", "Far", "Missing"})
	if !rd.read() {
		t.Fatal("nothing read")
	}
	v := rd.vals
	if len(v[0]) != 2 || v[0][0] != 1.5 || v[0][1] != 0 || len(v[1]) != 1 || v[1][0] != -7 || v[2][0] != 1 || v[3][0] != 45.25 || v[4] != nil || v[5] != nil {
		t.Fatalf("values: %v", v)
	}
	first := &rd.back[0][0]
	rd.read()
	if &rd.back[0][0] != first {
		t.Fatal("the reader allocated again")
	}
}
