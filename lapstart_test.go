package main

import (
	"testing"
	"time"
)

// a fake game for the lap recorder: one session, laps ended are kept
type lapTestEnv struct {
	ended []*lapRec
	t     time.Time
}

func (e *lapTestEnv) yaml() (string, int)                                { return "", 1 }
func (e *lapTestEnv) runKey(sn int) string                               { return "" }
func (e *lapTestEnv) noteRun(key string, st float64, lap int) (int, int) { return 0, 0 }
func (e *lapTestEnv) carsAhead(dist, pct, speed float64, me int) (bool, bool) {
	return false, false
}
func (e *lapTestEnv) driver() string                              { return "" }
func (e *lapTestEnv) geo(key string, lat, lon float64) [2]float64 { return [2]float64{} }
func (e *lapTestEnv) has(name string) bool                        { return name == "PlayerTrackSurface" }
func (e *lapTestEnv) meta(y string, sn int) cloudSession          { return cloudSession{ID: "t"} }
func (e *lapTestEnv) lapEnded(sn int, done *lapRec, s cloudSession, fuelNow, prevLL float64) {
	e.ended = append(e.ended, done)
}
func (e *lapTestEnv) now() time.Time              { return e.t }
func (e *lapTestEnv) livePlace() (int, int)       { return 0, 0 }
func (e *lapTestEnv) sessionEnded(s cloudSession) {}

// iRacing counts the new lap and starts its lap clock a second after the line: the lap still starts at the line,
// with no hole at its start, and its clock counts from the line (the hole made every clean lap not valid)
func TestLapStartsAtLineWithLateClock(t *testing.T) {
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
		if lap > 0 && inLap < 1.0 { // a second late: the lap before's count and clock
			gameLap, clock = lap-1, lapT+inLap
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
