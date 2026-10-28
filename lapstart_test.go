package main

import (
	"math"
	"strings"
	"testing"
	"time"
)

// a fake game for the lap recorder: one session, laps ended are kept
type lapTestEnv struct {
	ended []*lapRec
	t     time.Time
	vars  map[string]bool // the variables the source sends (nil: PlayerTrackSurface only)
}

func (e *lapTestEnv) yaml() (string, int)                                { return "", 1 }
func (e *lapTestEnv) runKey(sn int) string                               { return "" }
func (e *lapTestEnv) noteRun(key string, st float64, lap int) (int, int) { return 0, 0 }
func (e *lapTestEnv) carsAhead(dist, pct, speed float64, me int) (bool, bool) {
	return false, false
}
func (e *lapTestEnv) driver() string                              { return "" }
func (e *lapTestEnv) geo(key string, lat, lon float64) [2]float64 { return [2]float64{} }
func (e *lapTestEnv) has(name string) bool {
	if e.vars != nil {
		return e.vars[name]
	}
	return name == "PlayerTrackSurface"
}
func (e *lapTestEnv) meta(y string, sn int) cloudSession { return cloudSession{ID: "t"} }
func (e *lapTestEnv) lapEnded(sn int, done *lapRec, s cloudSession, fuelNow, prevLL float64) {
	e.ended = append(e.ended, done)
}
func (e *lapTestEnv) now() time.Time              { return e.t }
func (e *lapTestEnv) livePlace() (int, int)       { return 0, 0 }
func (e *lapTestEnv) sessionEnded(s cloudSession) {}

// iRacing counts the new lap and starts its lap clock a second after the line: the lap still starts at the line,
// with no hole at its start, and its clock counts from the line (the hole made every clean lap not valid)
func TestLapStartsAtLineWithLateClock(t *testing.T) {
	lapStartCase(t, true)  // practice and qualifying: the lap counted and its clock restarted a second late
	lapStartCase(t, false) // a race: the lap counted at the line, its clock restarted a second late
}

func lapStartCase(t *testing.T, lateCount bool) {
	t.Helper()
	env := &lapTestEnv{t: time.Unix(1000, 0)}
	ls := newLapStream(env)
	const L, sp, hz = 3000.0, 60.0, 30.0 // a 3 km lap at 60 m/s: 50 s
	lapT := L / sp
	st := 0.0
	for i := 0; i < int(3*lapT*hz); i++ {
		st = float64(i) / hz
		pos := st * sp
		lap := int(pos / L)
		d := pos - float64(lap)*L
		inLap := d / sp
		gameLap, clock := lap, inLap
		if lap > 0 && inLap < 1.0 { // a second late: the lap before's clock (and count)
			clock = lapT + inLap
			if lateCount {
				gameLap = lap - 1
			}
		}
		v := make([]float64, len(lapVars))
		v[0], v[1], v[2], v[3] = float64(gameLap+1), d, d/L, sp
		v[9], v[12], v[13], v[14] = 50, 1, 0, st
		v[17], v[18] = clock, 3
		if lap > 0 {
			v[8] = lapT
		}
		ls.step(v)
	}
	if len(env.ended) < 2 {
		t.Fatalf("laps ended: %d", len(env.ended))
	}
	r := env.ended[1]
	l, ok := buildLap(r, cloudSession{ID: "t"}, 50, lapT)
	if !ok {
		t.Fatal("no lap")
	}
	if !l.Valid {
		gap := 0
		for _, b := range r.bins {
			if b[0] < 0 {
				gap++
			}
		}
		t.Fatalf("a clean lap not valid (%d empty points)", gap)
	}
	if t0 := l.Trace.D[0][5]; t0 > 0.2 {
		t.Fatalf("the lap's clock at the line: %.3f", t0)
	}
	if mid := l.Trace.D[len(l.Trace.D)/2][5]; mid < lapT/2-0.2 || mid > lapT/2+0.2 {
		t.Fatalf("the lap's clock half way: %.3f", mid)
	}
}

// the game's own best lap: a faster lap it does not take was not accepted; a slower one, or no best yet, says nothing
func TestGameAccepts(t *testing.T) {
	best := func(v float64) func() float64 { return func() float64 { return v } }
	if !gameAccepts(100, 101, best(100), 1) {
		t.Fatal("a slower lap judged")
	}
	if !gameAccepts(0, 99, best(0), 1) {
		t.Fatal("judged with no best yet")
	}
	if !gameAccepts(100, 99.5, best(99.5), 1) {
		t.Fatal("a lap the game took as its best")
	}
	if gameAccepts(100, 99.5, best(100), 2) {
		t.Fatal("a faster lap the game did not take")
	}
}

// Le Mans Ultimate says a lap does not count: not valid, except on the pit lane (a lap through it is valid)
func TestLMUCountFlag(t *testing.T) {
	for _, flag := range []float64{2, 1} {
		env := &lapTestEnv{t: time.Unix(1000, 0)}
		env.vars = map[string]bool{"PlayerTrackSurface": true, "LapCountFlag": true}
		ls := newLapStream(env)
		const L, sp, hz = 3000.0, 60.0, 30.0
		for i := 0; i < int(2.5*L/sp*hz); i++ {
			st := float64(i) / hz
			pos := st * sp
			lap := int(pos / L)
			d := pos - float64(lap)*L
			v := make([]float64, len(lapVars))
			v[0], v[1], v[2], v[3] = float64(lap+1), d, d/L, sp
			v[9], v[12], v[13], v[14] = 50, 1, 0, st
			v[17], v[18], v[27] = d/sp, 3, 2
			if lap == 1 && d > 1000 && d < 1100 {
				v[27] = flag
			}
			ls.step(v)
		}
		if len(env.ended) < 2 {
			t.Fatalf("laps ended: %d", len(env.ended))
		}
		if got := env.ended[1].gameNo; got != (flag < 2) {
			t.Fatalf("flag %v: game said no %v", flag, got)
		}
	}
}

// driveLaps runs a steady 3 km lap at 60 m/s through the recorder, laps and a half of them, on a track reported dry
// and on the only compound; mod changes a sample (lap counted from 0, d metres into it) before it is read. The laps
// ended come back: ended[k] is the lap mod saw as k.
func driveLaps(env *lapTestEnv, laps int, mod func(lap int, d float64, v []float64)) []*lapRec {
	ls := newLapStream(env)
	const L, sp, hz = 3000.0, 60.0, 30.0
	for i := 0; i < int((float64(laps)+0.5)*L/sp*hz); i++ {
		st := float64(i) / hz
		pos := st * sp
		lap := int(pos / L)
		d := pos - float64(lap)*L
		v := make([]float64, len(lapVars))
		v[0], v[1], v[2], v[3] = float64(lap+1), d, d/L, sp
		v[9], v[12], v[13], v[14] = 50, 1, 0, st
		v[17], v[18], v[27] = d/sp, 3, 2
		v[29] = 1 // dry
		if mod != nil {
			mod(lap, d, v)
		}
		ls.step(v)
	}
	return env.ended
}

// a kerb never makes a lap not valid: a sample off the track counts toward the four wheels out only when the surface
// under the car is not paved (grass, dirt, gravel, or nothing known); without the material variable, as before
func TestKerbsNeverInvalid(t *testing.T) {
	cases := []struct {
		name string
		mat  float64
		has  bool // the source sends PlayerTrackSurfaceMaterial
		bad  bool
	}{
		{"rumble strip", 11, true, false},
		{"asphalt run-off", 2, true, false},
		{"concrete", 6, true, false},
		{"paint", 9, true, false},
		{"grass", 15, true, true},
		{"gravel", 24, true, true},
		{"undefined", 0, true, true},
		{"not in the world", -1, true, true},
		{"no material variable", 11, false, true},
	}
	for _, c := range cases {
		env := &lapTestEnv{t: time.Unix(1000, 0), vars: map[string]bool{"PlayerTrackSurface": true, "PlayerTrackSurfaceMaterial": c.has}}
		ended := driveLaps(env, 2, func(lap int, d float64, v []float64) {
			if lap == 1 && d > 1200 && d < 1260 { // a second with the car off the track, on that surface
				v[18], v[28] = 0, c.mat
			}
		})
		if len(ended) < 2 {
			t.Fatalf("%s: laps ended: %d", c.name, len(ended))
		}
		if got := ended[1].invalid(); got != c.bad {
			t.Errorf("%s: not valid %v, want %v", c.name, got, c.bad)
		}
		if ended[0].invalid() {
			t.Errorf("%s: the clean lap before is not valid", c.name)
		}
	}
}

// a penalty the game gives during the lap (Le Mans Ultimate's track limits) makes it not valid and reads as a 1x Off
// Track where it was given; one on the pit road or in the lap's first 100 m does not, the lap after starts from the new
// count, and a game without a penalty count (iRacing) is never judged by it
func TestPenaltyMakesLapInvalid(t *testing.T) {
	cases := []struct {
		name string
		has  bool    // the source sends PlayerNumPenalties
		at   float64 // where on lap 1 the count rises
		pit  bool    // on the pit road there
		bad  bool
	}{
		{"on the track", true, 1500, false, true},
		{"on the pit road", true, 1500, true, false},
		{"in the first 100 m", true, 50, false, false},
		{"iRacing has no penalty count", false, 1500, false, false},
	}
	for _, c := range cases {
		env := &lapTestEnv{t: time.Unix(1000, 0), vars: map[string]bool{"PlayerTrackSurface": true, "PlayerNumPenalties": c.has}}
		ended := driveLaps(env, 3, func(lap int, d float64, v []float64) {
			if lap > 1 || (lap == 1 && d >= c.at) {
				v[31] = 1
			}
			if c.pit && lap == 1 && d > c.at-100 && d < c.at+100 {
				v[10] = 1
			}
		})
		if len(ended) < 3 {
			t.Fatalf("%s: laps ended: %d", c.name, len(ended))
		}
		r := ended[1]
		if r.invalid() != c.bad || r.penalty != c.bad {
			t.Errorf("%s: not valid %v, penalty %v, want %v", c.name, r.invalid(), r.penalty, c.bad)
		}
		if ended[0].invalid() || ended[2].invalid() {
			t.Errorf("%s: the laps around it are not valid", c.name)
		}
		if !c.bad {
			if len(r.incAt) != 0 {
				t.Errorf("%s: an incident recorded: %v", c.name, r.incAt)
			}
			continue
		}
		if len(r.incAt) != 2 || math.Abs(r.incAt[0]-c.at) > 2 || r.incAt[1] != 1 || len(r.incK) != 1 || r.incK[0] != "off" {
			t.Errorf("%s: incidents %v %v, want [%v 1] [off]", c.name, r.incAt, r.incK, c.at)
		}
		l, ok := buildLap(r, cloudSession{ID: "t"}, 50, 50)
		if !ok || l.Valid || l.Inc != 1 || len(l.Trace.Inc) != 2 {
			t.Errorf("%s: the lap sent: ok %v valid %v inc %d", c.name, ok, l.Valid, l.Inc)
		}
	}
}

// the lap's flags: "wet" when the track was at least lightly wet (4 on iRacing's scale) at any point of the lap,
// "cmp:<n>" with the tyre compound at the lap's end when the car has several; nothing on a dry lap on the only one
func TestLapFlagsWetAndCompound(t *testing.T) {
	cases := []struct {
		name       string
		wetAt, wet float64 // TrackWetness between 1000 and 1100 m of lap 1, and over the rest of it
		cmp0, cmp1 float64 // the compound over the first half of lap 1 and over the second
		want       string
	}{
		{"dry on the only compound", 1, 1, 0, 0, ""},
		{"very lightly wet is dry", 3, 3, 0, 0, ""},
		{"a wet patch", 4, 1, 0, 0, "wet"},
		{"soaked on the third compound", 7, 7, 2, 2, "wet cmp:2"},
		{"dry on the second compound", 1, 1, 1, 1, "cmp:1"},
		{"the compound at the lap's end", 1, 1, 1, 2, "cmp:2"},
	}
	for _, c := range cases {
		env := &lapTestEnv{t: time.Unix(1000, 0), vars: map[string]bool{"PlayerTrackSurface": true, "TrackWetness": true, "PlayerTireCompound": true}}
		ended := driveLaps(env, 2, func(lap int, d float64, v []float64) {
			if lap != 1 {
				return
			}
			v[29] = c.wet
			if d > 1000 && d < 1100 {
				v[29] = c.wetAt
			}
			v[30] = c.cmp0
			if d >= 1500 {
				v[30] = c.cmp1
			}
		})
		if len(ended) < 2 {
			t.Fatalf("%s: laps ended: %d", c.name, len(ended))
		}
		l, ok := buildLap(ended[1], cloudSession{ID: "t"}, 50, 50)
		if !ok || !l.Valid {
			t.Fatalf("%s: the lap sent: ok %v valid %v", c.name, ok, l.Valid)
		}
		if got := strings.Join(l.Trace.F, " "); got != c.want {
			t.Errorf("%s: flags %q, want %q", c.name, got, c.want)
		}
	}
}
