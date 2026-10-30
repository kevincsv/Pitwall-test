package main

import (
	"encoding/binary"
	"fmt"
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
	hold    int                              // the game moves the car's position every hold frames and holds it in between (0, 1: every frame)
	gear    func(v float64) int              // nil: the game gives no gear
	ratio   []float64                        // speed per rpm by gear (index = gear); nil: no revs
	steer   func(d float64) float64          // nil: no steering
	pedals  bool                             // the game gives the car's pedals
	flatPed bool                             // ... but they never move (0 and 0)
	noPed   bool                             // the arrays are there, -1 for this car (no telemetry slot)
	tick    int                              // the game updates everything (clock included) every tick frames (LMU: 12, five times a second)
	mat     func(lap int, d float64) float64 // nil: no CarIdxTrackSurfaceMaterial
	wet     float64                          // TrackWetness
	rain    float64                          // Precipitation
	hide    func(lap int, d float64) bool    // the car not in the world there (pct -1)
	last0   float64                          // what the game shows as the last lap and the best before the first line (0: none)
	best0   float64
	bestLag float64                          // seconds after the line before the game's best changes
	lastLag float64                          // ... and its last lap time
	geo     bool                             // the game gives the car's position
	startET bool                             // the game gives the moment each lap started
	surf    func(lap int, d float64) float64 // nil: 3 (on track)
	cnt     func(lap int, d float64) float64 // nil: no CarIdxLapCountFlag
	pit     func(lap int, d float64) float64 // nil: never on the pit road
	refuse  func(lap int) bool               // the game does not take this lap as the car's best
	noTime  func(lap int) bool               // the game never times this lap: its last lap time (and best) stay as they were
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
	if m.last0 > 0 {
		last, best = m.last0, m.best0
	}
	lateLast, lateBest, lastAt, bestAt := 0.0, 0.0, -1.0, -1.0
	m.cross = []float64{fieldSimT0}
	m.marks = [][2]float64{{0, 0}}
	var tail float64
	prevPct, heldPct := 0.0, 0.0
	var held fieldSample
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
		if lastAt >= 0 && t >= lastAt {
			last, lastAt = lateLast, -1
		}
		if bestAt >= 0 && t >= bestAt {
			best, bestAt = lateBest, -1
		}
		in := d - float64(lap-1)*m.L
		v := m.speed(lap, in)
		s := fieldSample{t: t, wet: m.wet, rain: m.rain}
		pos := d
		if m.noise != nil {
			pos += m.noise(k)
		}
		pct := math.Mod(pos, m.L) / m.L
		if pct < 0 {
			pct += 1
		}
		rep := pct
		if m.hide != nil && m.hide(lap, in) {
			rep = -1
		}
		if m.lag {
			rep, prevPct = prevPct, pct
		}
		if m.hold > 1 {
			if k%m.hold == 0 {
				heldPct = rep
			}
			rep = heldPct
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
			if m.flatPed {
				th, br = 0, 0
			}
			s.thr, s.brk = []float64{th}, []float64{br}
		}
		if m.noPed {
			s.thr, s.brk = []float64{-1}, []float64{-1}
		}
		if m.mat != nil {
			s.mat = []float64{m.mat(lap, in)}
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
		if m.tick > 1 {
			if k%m.tick == 0 {
				held = s
			}
			fieldStep(&held, m.L, m.key)
		} else {
			fieldStep(&s, m.L, m.key)
		}
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
			if m.noTime == nil || !m.noTime(lap) {
				lateLast, lastAt = lt, tc+m.lastLag
				nb := best
				if bestAt >= 0 {
					nb = lateBest
				}
				if (m.refuse == nil || !m.refuse(lap)) && (nb < 0 || lt < nb) {
					lateBest, bestAt = lt, tc+m.bestLag
				}
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
	fieldCars, fieldWho = map[int]*carLapProf{}, map[int]string{}
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

// a frame that holds the car's position (the game updates another car's place less often than it draws it) says
// nothing of its speed: the speed is how far the position moved since the game last moved it, so a car whose place
// comes five times a second still has its lap, with the right speed, and a car stopped in a bin never halves it
func TestFieldHeldPosition(t *testing.T) {
	resetField()
	m := newSim("held")
	m.hold = 12 // five times a second
	m.run(1)
	c := fieldCar(t, 0)
	if c.best == 0 || c.bestV == nil {
		t.Fatalf("no best lap from a position held between updates: coverage %.2f", coverage(rpmSpeed(c.b)))
	}
	seen, bad := 0, 0
	for i, v := range c.bestV {
		if v == 0 {
			continue
		}
		seen++
		// the speed over the 6 to 10 m before the bin's end, against the truth there
		if tr := simSpeed(1, float64(i)*fieldBin+fieldBin/2); math.Abs(float64(v)-tr) > 0.1*tr {
			bad++
		}
	}
	if seen < 250 || bad > seen/20 {
		t.Fatalf("%d of %d bins have a speed far from the truth", bad, seen)
	}
	// a car stopped in a bin for five seconds: the bin keeps the speed it had and its samples stop at 255, the
	// averages of its steering and its position never wrap
	resetField()
	org := geoBase("stop", 45, 0)
	la, lo := 45.0001, 0.0002
	px, py := geoXY(org, la, lo)
	f := func(t, pct float64) *fieldSample {
		return &fieldSample{t: t, pct: []float64{pct}, lap: []float64{1}, steer: []float64{0.5}, lat: []float64{la}, lon: []float64{lo}}
	}
	fieldStep(f(10, 0.4990), 3000, "stop")
	fieldStep(f(10+1.0/60, 0.5), 3000, "stop")    // 3 m in a frame: 180 m/s, a jump, no speed
	fieldStep(f(10+2.0/60, 0.5002), 3000, "stop") // 0.6 m: 36 m/s
	for k := 3; k < 303; k++ {
		fieldStep(f(10+float64(k)/60, 0.5002), 3000, "stop") // held
	}
	c = fieldCar(t, 0)
	x := c.b[150]
	if x.n != 255 || math.Abs(float64(x.v)-36) > 0.5 {
		t.Fatalf("the bin of a stopped car: %d samples, speed %.1f (want 255 and 36)", x.n, x.v)
	}
	if math.Abs(float64(x.steer)-0.5) > 1e-4 || math.IsNaN(float64(x.x)) || math.IsInf(float64(x.x), 0) || math.Abs(float64(x.x)-px) > 0.01 || math.Abs(float64(x.y)-py) > 0.01 {
		t.Fatalf("the averages wrapped: steer %v, position %v,%v (want 0.5 and %.2f,%.2f)", x.steer, x.x, x.y, px, py)
	}
	resetField()
}

// a lap goes up with its real pedals and its path when the game gave them for the bins the watcher saw (a lap is
// taken from 85 % of its bins), not for every bin of the track
func TestFieldTraceSeenBins(t *testing.T) {
	resetField()
	const L = 3000
	nb := int(L/fieldBin) + 1
	org := geoBase("seen", 45, 0)
	mk := func(ped float64) *carLapProf {
		c := &carLapProf{best: 70, org: org, hasOrg: true, bestB: make([]fbin, nb), bestV: make([]float32, nb)}
		for i := range c.bestB {
			if i%8 == 0 { // 12.5 % of the bins never seen
				continue
			}
			x := fbin{v: 40, n: 3, gear: 4, pos: true, x: float32(i), y: float32(2 * i)}
			if float64(i%100) < 100*ped {
				x.ped, x.thr = true, 0.9
				if i%10 == 5 { // a braking zone
					x.thr, x.brk = 0, 0.8
				}
			}
			c.bestB[i], c.bestV[i] = x, 40
		}
		return c
	}
	fieldMu.Lock()
	fieldCars = map[int]*carLapProf{0: mk(1), 1: mk(0.5)}
	fieldMu.Unlock()
	tr := fieldTrace(0, 70)
	desc := func(tr *lapTrace) string {
		if tr == nil {
			return "no trace"
		}
		return fmt.Sprintf("src %s, %d path points, origin %v", tr.Src, len(tr.X), tr.G)
	}
	if tr == nil || tr.Src != "real" || tr.X == nil || tr.G == nil {
		t.Fatalf("a lap with pedals and a position in every bin seen: %s", desc(tr))
	}
	if tr2 := fieldTrace(1, 70); tr2 == nil || tr2.Src != "field" || tr2.X == nil {
		t.Fatalf("pedals in half of the bins seen are estimated, the path stays: %s", desc(tr2))
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

// a lap the game never times (LMU counts an out-lap or a cut lap but not its time, so the last lap time stays the lap
// before's; a tow or a reset in iRacing) is neither judged nor taken: the lap before, already timed, is never marked
// not valid in its place, and the untimed lap's bins never go under another lap's time
func TestFieldLapWithoutTime(t *testing.T) {
	// LMU: lap 2 is counted (flag 1) but not timed; lap 1 stays valid and lap 3, faster, is the best
	resetField()
	m := newSim("notime")
	m.noTime = func(lap int) bool { return lap == 2 }
	m.cnt = func(lap int, d float64) float64 {
		if lap == 2 {
			return 1
		}
		return 2
	}
	m.run(3)
	c := fieldCar(t, 0)
	if len(c.badT) != 0 {
		t.Fatalf("a lap judged not valid in the untimed lap's place: %v (lap 1 %.3f)", c.badT, m.times[0])
	}
	if math.Abs(c.best-m.times[2]) > 1e-6 {
		t.Fatalf("best %.4f, want lap 3's %.4f", c.best, m.times[2])
	}
	// iRacing: lap 2 the fastest but off the track, lap 3 untimed, lap 4 faster than lap 1: lap 3's bins never go
	// under lap 2's time, so lap 4 is the best
	resetField()
	m = newSim("notime2")
	m.speed = func(lap int, d float64) float64 {
		f := []float64{1, 1, 1.03, 1.01, 1.02}
		return simSpeed(1, d) * f[min(lap, len(f)-1)]
	}
	m.noTime = func(lap int) bool { return lap == 3 }
	m.surf = func(lap int, d float64) float64 {
		if lap == 2 && d >= 1000 && d < 1030 {
			return 0
		}
		return 3
	}
	m.run(4)
	c = fieldCar(t, 0)
	if len(c.badT) != 1 || math.Abs(c.badT[0]-m.times[1]) > 1e-6 {
		t.Fatalf("laps judged not valid: %v, want lap 2's %.4f only", c.badT, m.times[1])
	}
	if math.Abs(c.best-m.times[3]) > 1e-6 {
		t.Fatalf("best %.4f, want lap 4's %.4f (lap 2, not valid, %.4f)", c.best, m.times[3], m.times[1])
	}
	// the time the game shows when a car is first seen belongs to a lap before: the first lap seen, untimed, never
	// takes it
	resetField()
	m = newSim("notime3")
	m.noTime = func(lap int) bool { return lap == 1 }
	m.cnt = func(lap int, d float64) float64 {
		if lap == 1 {
			return 1
		}
		return 2
	}
	m.last0, m.best0 = 64.321, 64.321
	m.run(2)
	c = fieldCar(t, 0)
	if len(c.badT) != 0 || math.Abs(c.best-m.times[1]) > 1e-6 {
		t.Fatalf("the lap before the car was seen: not valid %v, best %.4f want lap 2's %.4f", c.badT, c.best, m.times[1])
	}
	resetField()
}

// the game's flag on a lap through the pit lane: an out-lap (flag 1 from the pits, still 1 past the pit exit) and an
// in-lap are counted but not timed, and are valid here like the player's own; a lap the flag refuses before it reaches
// the pit road is not
func TestFieldPitLapCountFlag(t *testing.T) {
	resetField()
	m := newSim("pitcnt")
	m.cnt = func(lap int, d float64) float64 {
		switch {
		case lap == 2: // the out-lap: the flag stays 1 the whole lap
			return 1
		case lap == 3 && d >= 500: // a cut at 500 m, the pits at the end: not valid
			return 1
		case lap == 4 && d >= 2800: // the in-lap: the flag drops as the car enters the pit lane
			return 1
		}
		return 2
	}
	m.pit = func(lap int, d float64) float64 {
		switch {
		case lap == 2 && d < 300, lap == 3 && d >= 2800, lap == 4 && d >= 2800:
			return 1
		}
		return 0
	}
	m.run(4)
	c := fieldCar(t, 0)
	if fieldLapInvalid(0, m.times[1]) || fieldLapInvalid(0, m.times[3]) {
		t.Fatalf("the out-lap or the in-lap judged not valid: %v", c.badT)
	}
	if !fieldLapInvalid(0, m.times[2]) {
		t.Fatalf("the lap cut before the pits is valid: %v", c.badT)
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

// the rivals of a Le Mans Ultimate race go up under the game's own name, like iRacing's
func TestFieldTopLapsGame(t *testing.T) {
	resetField()
	for _, c := range []struct{ game, want string }{{"", "iracing"}, {"iracing", "iracing"}, {"lmu", "lmu"}} {
		r := &raceReport{Game: c.game, TrackID: 166, Track: "Okayama", Best: 99, Results: []raceResult{
			{Name: "y", Laps: 5, Best: 98.9, CarID: 67, key: "k2", carIdx: 2},
		}}
		top := fieldTopLaps(r)
		if len(top) != 1 || top[0]["game"] != c.want {
			t.Fatalf("game %q: %v", c.game, top)
		}
	}
}

// Le Mans Ultimate moves the other cars and its clock about five times a second: a car at 70 m/s goes 14 m between two
// updates, more than a bin, and its laps are still taken whole; a third of a second off the track is still a third of
// a second
func TestFieldSlowUpdates(t *testing.T) {
	resetField()
	m := newSim("slow")
	m.tick = 12
	m.speed = func(lap int, d float64) float64 {
		return (75 - 15*math.Max(0, math.Cos(2*math.Pi*d/3000*4))) * (1 + 0.01*float64(lap))
	}
	m.run(3)
	c := fieldCar(t, 0)
	if len(c.badT) != 0 || c.best == 0 || math.Abs(c.best-m.times[2]) > 0.05 {
		t.Fatalf("at 5 Hz: best %.3f (laps %v), not valid %v", c.best, m.times, c.badT)
	}
	if tr := fieldTrace(0, c.best); tr == nil || len(tr.D) < 500 {
		t.Fatal("no trace of a lap seen at 5 Hz")
	}
	resetField()
	m = newSim("slow-off")
	m.tick = 12
	m.surf = func(lap int, d float64) float64 { // lap 2: a little over a third of a second off (two updates)
		if lap == 2 && d >= 1000 && d < 1000+0.45*50 {
			return 0
		}
		return 3
	}
	m.run(3)
	if !fieldLapInvalid(0, m.times[1]) || fieldLapInvalid(0, m.times[2]) {
		t.Fatalf("at 5 Hz the lap off the track: %v (laps %v)", fieldCar(t, 0).badT, m.times)
	}
	resetField()
}

// pedals the game gives but never move, or -1 for a car without telemetry, are no real pedals: estimated ("field")
func TestFieldPedalsMustMove(t *testing.T) {
	for _, c := range []struct {
		name        string
		flat, noPed bool
		want        string
	}{{"moving", false, false, "real"}, {"flat", true, false, "field"}, {"none", false, true, "field"}} {
		resetField()
		m := newSim("ped-" + c.name)
		m.gear, m.ratio, m.pedals, m.flatPed, m.noPed = simGear, simRatio, true, c.flat, c.noPed
		m.run(1)
		tr := fieldTrace(0, m.times[0])
		if tr == nil || tr.Src != c.want {
			t.Fatalf("%s pedals: %+v", c.name, tr)
		}
		for _, p := range tr.D {
			if p[1] < 0 || p[2] < 0 {
				t.Fatalf("%s pedals: a pedal below 0 in %v", c.name, p)
			}
		}
	}
	resetField()
}

// a rival's lap on a wet track says so, so the model leaves it aside like yours; on a damp one "damp" and in the rain "rain" (notes only)
func TestFieldWetLap(t *testing.T) {
	resetField()
	m := newSim("wet")
	m.wet = 4
	m.run(1)
	if tr := fieldTrace(0, m.times[0]); tr == nil || len(tr.F) != 1 || tr.F[0] != "wet" {
		t.Fatalf("a wet lap: %+v", tr)
	}
	resetField()
	m = newSim("dry")
	m.wet = 1
	m.run(1)
	if tr := fieldTrace(0, m.times[0]); tr == nil || len(tr.F) != 0 {
		t.Fatalf("a dry lap: %+v", tr)
	}
	resetField()
	m = newSim("rain")
	m.wet, m.rain = 3, 0.2
	m.run(1)
	if tr := fieldTrace(0, m.times[0]); tr == nil || len(tr.F) != 2 || tr.F[0] != "damp" || tr.F[1] != "rain" {
		t.Fatalf("a lap in the rain on a damp track: %+v", tr)
	}
	resetField()
	m = newSim("damp")
	m.wet = 2
	m.run(1)
	if tr := fieldTrace(0, m.times[0]); tr == nil || len(tr.F) != 1 || tr.F[0] != "damp" {
		t.Fatalf("a damp lap: %+v", tr)
	}
	resetField()
	m = newSim("both")
	m.wet, m.rain = 5, 0.6
	m.run(1)
	if tr := fieldTrace(0, m.times[0]); tr == nil || len(tr.F) != 2 || tr.F[0] != "wet" || tr.F[1] != "rain" {
		t.Fatalf("a wet lap in the rain: %+v", tr)
	}
	resetField()
}

// a rival with all four wheels on a kerb or paint is on the track, like you; on the grass it is not
func TestFieldKerbs(t *testing.T) {
	for _, c := range []struct {
		name string
		mat  float64
		bad  bool
	}{{"rumble strip", 11, false}, {"paint", 9, false}, {"grass", 15, true}, {"racing dirt", 7, true}} {
		resetField()
		m := newSim("kerb")
		m.surf = func(lap int, d float64) float64 {
			if lap == 1 && d >= 1000 && d < 1040 {
				return 0
			}
			return 3
		}
		m.mat = func(lap int, d float64) float64 { return c.mat }
		m.run(2)
		if fieldLapInvalid(0, m.times[0]) != c.bad {
			t.Fatalf("%s: not valid %v", c.name, fieldCar(t, 0).badT)
		}
	}
	resetField()
}

// the game's flag can drop a frame before the car is on the pit road: that in-lap is valid
func TestFieldPitLapCountFlagOrder(t *testing.T) {
	resetField()
	m := newSim("pitorder")
	m.cnt = func(lap int, d float64) float64 {
		if lap == 2 && d >= 2800 {
			return 1
		}
		return 2
	}
	m.pit = func(lap int, d float64) float64 {
		if (lap == 2 && d >= 2801) || (lap == 3 && d < 300) {
			return 1
		}
		return 0
	}
	m.run(3)
	if fieldLapInvalid(0, m.times[1]) {
		t.Fatalf("the in-lap judged not valid: %v", fieldCar(t, 0).badT)
	}
	resetField()
}

// the game publishes a lap's time and its best a moment after the line (iRacing about a second and a half later): a
// lap it accepts late is still the car's best, and a lap it never takes as its best is still not valid
func TestFieldLateTimes(t *testing.T) {
	for _, c := range []struct{ bestLag, lastLag float64 }{{1.5, 0}, {3, 3}} {
		resetField()
		m := newSim("late")
		m.bestLag, m.lastLag = c.bestLag, c.lastLag
		m.run(3)
		f := fieldCar(t, 0)
		if len(f.badT) != 0 || math.Abs(f.best-m.times[2]) > 1e-6 {
			t.Fatalf("lags %v: not valid %v, best %.4f want %.4f", c, f.badT, f.best, m.times[2])
		}
		resetField()
		m = newSim("late-refused")
		m.bestLag, m.lastLag = c.bestLag, c.lastLag
		m.refuse = func(lap int) bool { return lap == 2 }
		m.run(3)
		f = fieldCar(t, 0)
		if len(f.badT) != 1 || math.Abs(f.badT[0]-m.times[1]) > 1e-6 || math.Abs(f.best-m.times[2]) > 1e-6 {
			t.Fatalf("lags %v, lap 2 refused: not valid %v, best %.4f want %.4f", c, f.badT, f.best, m.times[2])
		}
	}
	resetField()
}

// a lap the PC saw only in part (the car not in the world for its first 600 m) is never the car's best
func TestFieldPartialLap(t *testing.T) {
	resetField()
	m := newSim("partial")
	m.speed = func(lap int, d float64) float64 { return simSpeed(1, d) * (1 - 0.02*float64(lap)) } // lap 1 the faster
	m.hide = func(lap int, d float64) bool { return lap == 1 && d < 600 }
	m.run(2)
	if c := fieldCar(t, 0); math.Abs(c.best-m.times[1]) > 1e-6 {
		t.Fatalf("best %.4f, want lap 2's %.4f", c.best, m.times[1])
	}
	if fieldTrace(0, m.times[0]) != nil {
		t.Fatal("a trace of the lap seen in part")
	}
	resetField()
}

// the revs never speak for a bin where they disagree with the position (wheelspin, a locked wheel) or for a gear seen
// in too few bins; a gear changed inside a bin marks it
func TestFieldRPMGuards(t *testing.T) {
	b := make([]fbin, 200)
	for i := range b {
		v := 30 + 10*math.Sin(float64(i)/30)
		g := simGear(v)
		b[i] = fbin{v: float32(v), gear: int8(g), rpm: float32(v / simRatio[g]), n: 5}
	}
	b[40].rpm *= 1.5
	for i := 100; i < 103; i++ { // a seventh gear seen in three bins
		b[i].gear, b[i].rpm = 7, 4000
	}
	out := rpmSpeed(b)
	if out[40] != b[40].v {
		t.Fatalf("revs 50 %% off the position's speed: %v want %v", out[40], b[40].v)
	}
	for i := 100; i < 103; i++ {
		if out[i] != b[i].v {
			t.Fatalf("a gear seen in three bins: %v want %v", out[i], b[i].v)
		}
	}
	var c carLapProf
	var x fbin
	s := &fieldSample{gear: []float64{3}, rpm: []float64{5000}}
	c.sample(&x, 30, s, 0, [2]float64{}, false)
	s.gear[0], s.rpm[0] = 4, 4000
	c.sample(&x, 31, s, 0, [2]float64{}, false)
	c.sample(&x, 31, s, 0, [2]float64{}, false)
	if x.rpm != -1 || x.gear != 4 {
		t.Fatalf("a shift inside the bin: rpm %v gear %d", x.rpm, x.gear)
	}
}

// fillGaps: the points not seen take the value between their neighbours, the ends the nearest; nothing seen, nil
func TestFillGaps(t *testing.T) {
	got := fillGaps([]float64{0, 0, 10, 0, 0, 20, 0}, []bool{false, false, true, false, false, true, false})
	want := []float64{10, 10, 10, 13.333, 16.667, 20, 20}
	for i := range want {
		if math.Abs(got[i]-want[i]) > 1e-3 {
			t.Fatalf("fillGaps %v", got)
		}
	}
	if fillGaps([]float64{1, 2}, []bool{false, false}) != nil {
		t.Fatal("nothing seen gives a profile")
	}
}

// the games whose rivals' laps go up
func TestFieldShareGame(t *testing.T) {
	for g, want := range map[string]bool{"": true, "iracing": true, "lmu": true, "ac": false, "acc": false, "LMU": false} {
		if fieldShareGame(g) != want {
			t.Fatalf("%q: %v", g, !want)
		}
	}
}

// Le Mans Ultimate gives an index again to a new car once all 64 are taken: the newcomer starts with a profile of its
// own (its laps are taken whatever the car before did there), while the same driver, a team whose driver changes at
// the wheel or an index the text stops listing keep theirs
func TestFieldIndexGivenToAnotherCar(t *testing.T) {
	resetField()
	text := func(drivers ...string) string {
		y := "---\nWeekendInfo:\n TrackID: 1\nDriverInfo:\n DriverCarIdx: 5\n Drivers:\n"
		for _, d := range drivers {
			y += d
		}
		return y + "SplitTimeInfo:\n Sectors:\n - SectorNum: 0\n   UserID: 999\n"
	}
	car := func(idx int, uid, name, team string) string {
		s := fmt.Sprintf(" - CarIdx: %d\n   UserName: %s\n   UserID: %s\n", idx, name, uid)
		if team != "" {
			s += "   TeamID: " + team + "\n"
		}
		return s
	}
	fieldDrivers(text(car(0, "1001", "Ana Duarte", ""), car(1, "1002", "Luca Bianchi", "")))
	fast := newSim("reuse")
	fast.speed = func(lap int, d float64) float64 { return simSpeed(lap, d) * 1.1 }
	fast.run(3)
	before := fieldCar(t, 0)
	if before.best <= 0 {
		t.Fatal("the first car has no best")
	}
	// the same drivers in a new version of the text: nothing changes
	fieldDrivers(text(car(0, "1001", "Ana Duarte", ""), car(1, "1002", "Luca Bianchi", "")))
	if fieldCar(t, 0) != before {
		t.Fatal("the same driver lost the profile")
	}
	// the index goes to another car, slower (a team's)
	fieldDrivers(text(car(0, "2001", "Pau Vidal", "77"), car(1, "1002", "Luca Bianchi", "")))
	fieldMu.Lock()
	_, kept := fieldCars[0]
	fieldMu.Unlock()
	if kept {
		t.Fatal("the newcomer kept the profile of the car before")
	}
	slow := newSim("reuse")
	slow.speed = func(lap int, d float64) float64 { return simSpeed(lap, d) * 0.9 }
	slow.run(3)
	after := fieldCar(t, 0)
	if after.best <= before.best {
		t.Fatalf("the newcomer's best %.3f is not its own (the car before did %.3f)", after.best, before.best)
	}
	found := false
	for _, lt := range slow.times {
		found = found || math.Abs(lt-after.best) < 0.002
	}
	if !found {
		t.Fatalf("the newcomer's best %.3f is none of its laps %v", after.best, slow.times)
	}
	// the team's driver changes at the wheel: the car is the same, its profile stays; a car the text stops listing too
	cur := fieldCar(t, 0)
	fieldDrivers(text(car(0, "3001", "Nour Haddad", "77")))
	if fieldCar(t, 0) != cur {
		t.Fatal("a team's driver change started the car again")
	}
	fieldDrivers(text(car(1, "1002", "Luca Bianchi", "")))
	if fieldCar(t, 0) != cur {
		t.Fatal("an index the text no longer lists lost its profile")
	}
	resetField()
}

// the same, the whole way: Le Mans Ultimate's source gives a 65th car the index of a car gone five minutes, its session
// text says the newcomer is there, and the field watcher's own reading of the text (fieldText.update: fieldSession,
// then fieldDrivers on a new version) starts that index again, the others keeping theirs
func TestFieldIndexReusedByLMU(t *testing.T) {
	resetField()
	defer resetField()
	s := &lmuSource{img: newIRImage(lmuVarDefs())}
	b := fakeLMUField(64)
	pi32 := func(o int, v int) { binary.LittleEndian.PutUint32(b[o:], uint32(int32(v))) }
	pf64 := func(o int, v float64) { binary.LittleEndian.PutUint64(b[o:], math.Float64bits(v)) }
	ft := newFieldText()
	frame := func() string {
		t.Helper()
		if !s.convert(b) {
			t.Fatal("no session")
		}
		get, y := lmuRead(t, s)
		h, err := readHeader(s.img.mem)
		if err != nil {
			t.Fatal(err)
		}
		ft.update(y, int(h.SessionInfoUpdate), int(get("SessionNum")))
		return y
	}
	name := func(y string, idx int) string { return yamlField(driverBlock(y, fmt.Sprint(idx)), "UserName") }
	y := frame()
	const gone = 10
	if name(y, gone) != "Driver Number 10" {
		t.Fatalf("index %d is %q", gone, name(y, gone))
	}
	// the field watcher has a profile of every car by now
	fieldMu.Lock()
	for i := 0; i < 64; i++ {
		fieldCars[i] = &carLapProf{best: 200 + float64(i)}
	}
	fieldMu.Unlock()
	// car 10 leaves (the game's array closes up), and five minutes go by
	slot := func(i int) ([]byte, []byte) {
		o, tt := lmuOffVehScoring+i*lmuVehScSize, lmuOffTelem+i*lmuTelSize
		return b[o : o+lmuVehScSize], b[tt : tt+lmuTelSize]
	}
	sc, te := slot(gone)
	sc63, te63 := slot(63)
	copy(sc, sc63)
	copy(te, te63)
	pi32(lmuOffScoring+si_mNumVehicles, 63)
	b[lmuOffActive] = 63
	frame()
	pf64(lmuOffScoring+si_mCurrentET, 600+301)
	frame()
	// a new car joins: every index is taken, so it gets the one of the car gone longest
	o := lmuOffVehScoring + 63*lmuVehScSize
	pi32(o+vs_mID, 999)
	clear(b[o+vs_mDriverName : o+vs_mDriverName+32])
	copy(b[o+vs_mDriverName:], "Nour Haddad")
	pi32(lmuOffTelem+63*lmuTelSize+vt_mID, 999)
	pi32(lmuOffScoring+si_mNumVehicles, 64)
	b[lmuOffActive] = 64
	y = frame()
	if name(y, gone) != "Nour Haddad" {
		t.Fatalf("the newcomer is not at index %d: %q", gone, name(y, gone))
	}
	fieldMu.Lock()
	defer fieldMu.Unlock()
	if c := fieldCars[gone]; c != nil {
		t.Fatalf("the newcomer at index %d kept the profile of the car before (best %.1f)", gone, c.best)
	}
	for _, i := range []int{0, 1, 9, 11, 63} {
		if c := fieldCars[i]; c == nil || c.best != 200+float64(i) {
			t.Fatalf("index %d lost its profile", i)
		}
	}
}

// a rival's lap whose flag never says its time counts (LMU's practice) is valid; one whose flag drops is not
func TestFieldLapCountFlagOnlyADrop(t *testing.T) {
	resetField()
	m := newSim("cntprac")
	m.cnt = func(lap int, d float64) float64 {
		switch {
		case lap == 2:
			return 1
		case lap == 3 && d >= 1500:
			return 1
		}
		return 2
	}
	m.run(4)
	if fieldLapInvalid(0, m.times[1]) {
		t.Fatal("a lap whose flag never said the time counts is not valid")
	}
	if !fieldLapInvalid(0, m.times[2]) {
		t.Fatal("a lap whose flag dropped is valid")
	}
	resetField()
}
