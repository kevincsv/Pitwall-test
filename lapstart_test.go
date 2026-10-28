package main

import (
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
