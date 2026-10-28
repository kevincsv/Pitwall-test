package main

import (
	"math"
	"testing"
	"time"
)

// lapSim drives the player's car through the lap recorder as the game would, 30 samples a second on a 3 km lap: the
// game's lap count goes up at the line and its lap clock starts again there; the car can sit in the pit box, drive the
// pit lane, be reset or towed to the pits, or the telemetry can stop for a while
type lapSim struct {
	t      *testing.T
	env    *lapTestEnv
	ls     *lapStream
	st     float64                          // the session clock
	lap    int                              // the game's lap count (LapCompleted + 1 in iRacing's Lap)
	d      float64                          // where on the lap
	lineAt float64                          // the session time the car last crossed the line (the game's lap clock counts from it)
	last   float64                          // the game's last lap time
	flag   func(lap int, d float64) float64 // LapCountFlag (nil: 2, the lap and its time count)
}

const lapSimL, lapSimHz = 3000.0, 30.0

func newLapSim(t *testing.T, lap int, d float64) *lapSim {
	env := &lapTestEnv{t: time.Unix(1000, 0), vars: map[string]bool{"PlayerTrackSurface": true, "LapCountFlag": true}}
	return &lapSim{t: t, env: env, ls: newLapStream(env), st: 10, lap: lap, d: d, lineAt: 10}
}

// sample sends one sample of where the car is now
func (s *lapSim) sample(speed float64, pit, onTrack bool) {
	v := make([]float64, len(lapVars))
	v[0], v[1], v[2], v[3] = float64(s.lap), s.d, s.d/lapSimL, speed
	v[8], v[9], v[13], v[14] = s.last, 50, 0, s.st
	v[17], v[18], v[27] = s.st-s.lineAt, 3, 2
	if s.flag != nil {
		v[27] = s.flag(s.lap, s.d)
	}
	if pit {
		v[10], v[18] = 1, 2
	}
	if onTrack {
		v[12] = 1
	}
	s.env.t = time.Unix(1000, 0).Add(time.Duration(s.st * float64(time.Second)))
	s.ls.step(v)
}

// move takes the car on by dist metres at speed m/s, crossing the line as it comes; send false: the telemetry is lost
// meanwhile (nothing reaches the recorder)
func (s *lapSim) move(dist, speed float64, pit, send bool) {
	step := speed / lapSimHz
	for done := 0.0; done < dist-1e-9; done += step {
		s.st += 1 / lapSimHz
		s.d += step
		if s.d >= lapSimL {
			s.d -= lapSimL
			cross := s.st - s.d/speed
			s.last = cross - s.lineAt
			s.lap++
			s.lineAt = cross
		}
		if send {
			s.sample(speed, pit, true)
		}
	}
}

// wait keeps the car still (the pit box) for sec seconds, in the car (onTrack) or not (a tow, the reset's screen)
func (s *lapSim) wait(sec float64, pit, onTrack bool) {
	for k := 0; k < int(sec*lapSimHz); k++ {
		s.st += 1 / lapSimHz
		s.sample(0, pit, onTrack)
	}
}

// ended: the laps that ended, each lap number once and in order
func (s *lapSim) ended() map[int]*lapRec {
	s.t.Helper()
	out := map[int]*lapRec{}
	prev := -1
	for _, r := range s.env.ended {
		if _, twice := out[r.n]; twice {
			s.t.Fatalf("lap %d ended twice", r.n)
		}
		if prev >= 0 && r.n != prev+1 {
			s.t.Fatalf("laps ended %d then %d: a lap lost", prev, r.n)
		}
		out[r.n], prev = r, r.n
	}
	return out
}

// lapCheck: the lap's verdict at its end (what the race summary reads) and as it goes to the account, and that a valid
// lap starts at the line with its own clock
func lapCheck(t *testing.T, name string, r *lapRec, valid bool) cloudLap {
	t.Helper()
	if r == nil {
		t.Fatalf("%s: no lap", name)
	}
	if r.invalid() == valid {
		t.Errorf("%s: not valid %v at its end, want valid %v", name, r.invalid(), valid)
	}
	lt := 50.0
	if len(r.bins) > 0 {
		lt = math.Max(lt, r.bins[len(r.bins)-1][5])
	}
	l, ok := buildLap(r, cloudSession{ID: "t"}, 50, lt)
	if !ok {
		if valid {
			t.Fatalf("%s: no lap built", name)
		}
		return l
	}
	if l.Valid != valid {
		t.Errorf("%s: sent valid %v, want %v", name, l.Valid, valid)
	}
	if valid {
		if t0 := l.Trace.D[0][5]; t0 > 0.2 {
			t.Errorf("%s: the lap's clock at the line %.3f", name, t0)
		}
		if n := len(l.Trace.D); float64(n*lapBin) < lapSimL-10 {
			t.Errorf("%s: %d points, not the whole lap", name, n)
		}
	}
	return l
}

// out of the pits: the car leaves its box before the line, crosses it on the pit road and goes on. The bit from the
// box to the line is no lap (not the whole circuit); the out-lap starts at the line, goes through the pit lane and is
// valid, tagged cold; the laps after are valid too
func TestLapOutOfThePits(t *testing.T) {
	s := newLapSim(t, 1, 2600)
	s.wait(5, true, true)       // in the box
	s.move(400, 20, true, true) // down the pit lane, over the line
	s.move(300, 20, true, true) // to the pit exit
	s.move(3*3000-300, 60, false, true)
	s.move(200, 60, false, true)
	laps := s.ended()
	if len(laps) != 4 {
		t.Fatalf("laps ended: %d", len(laps))
	}
	lapCheck(t, "the box to the line", laps[1], false)
	out := lapCheck(t, "the out-lap", laps[2], true)
	if !out.Pit || !laps[2].cold {
		t.Errorf("the out-lap: pit %v cold %v", out.Pit, laps[2].cold)
	}
	// the lap after a lap through the pits is the first of the run on the track: cold tyres; the one after it is not
	lapCheck(t, "the first flying lap", laps[3], true)
	if !laps[3].cold || laps[3].pit {
		t.Errorf("the first flying lap: cold %v pit %v", laps[3].cold, laps[3].pit)
	}
	lapCheck(t, "the second flying lap", laps[4], true)
	if laps[4].cold || laps[4].pit {
		t.Errorf("the second flying lap: cold %v pit %v", laps[4].cold, laps[4].pit)
	}
}

// reset to the pits mid-lap: the car is in its box at once (the game's lap count unchanged). That lap did not go round
// the whole circuit: never valid, never a best; the lap after it starts at the line and is valid
func TestLapResetToPits(t *testing.T) {
	s := newLapSim(t, 1, 0)
	s.sample(60, false, true)
	s.move(3000, 60, false, true) // lap 1, then into lap 2
	s.move(1500, 60, false, true) // half of lap 2
	s.d = 2600                    // reset: in the pit box
	s.wait(4, true, true)
	s.move(400, 20, true, true) // out of the box, over the line
	s.move(300, 20, true, true)
	s.move(3000, 60, false, true)
	s.move(200, 60, false, true)
	laps := s.ended()
	if len(laps) != 3 {
		t.Fatalf("laps ended: %d", len(laps))
	}
	lapCheck(t, "the lap before", laps[1], true)
	lapCheck(t, "the lap reset", laps[2], false)
	lapCheck(t, "the lap after", laps[3], true)
}

// a tow: the car leaves the world (out of the car while it is towed) and comes back in its box. The lap under way is
// dropped while the car is away, so its number ends once, from the box to the line, and never valid; the next lap is
func TestLapTow(t *testing.T) {
	s := newLapSim(t, 1, 0)
	s.sample(60, false, true)
	s.move(3000, 60, false, true)
	s.move(1800, 60, false, true)
	s.wait(30, false, false) // towed
	s.d = 2600
	s.wait(3, true, true)
	s.move(400, 20, true, true)
	s.move(300, 20, true, true)
	s.move(3000, 60, false, true)
	s.move(200, 60, false, true)
	laps := s.ended()
	if len(laps) != 3 {
		t.Fatalf("laps ended: %d", len(laps))
	}
	lapCheck(t, "the lap before", laps[1], true)
	lapCheck(t, "the lap towed", laps[2], false)
	lapCheck(t, "the lap after", laps[3], true)
}

// the telemetry stops for 2 s mid-lap (120 m at 60 m/s): a hole of more than 40 m, so that lap is not valid, at its
// end as when it goes to the account; the laps around it are valid. A short stop (half a second, 30 m) is no hole
func TestLapTelemetryGap(t *testing.T) {
	for _, c := range []struct {
		name string
		sec  float64
		bad  bool
	}{{"2 s", 2, true}, {"half a second", 0.5, false}} {
		s := newLapSim(t, 1, 0)
		s.sample(60, false, true)
		s.move(3000, 60, false, true)
		s.move(1200, 60, false, true)
		s.move(60*c.sec, 60, false, false) // nothing reaches the recorder
		s.move(1800-60*c.sec, 60, false, true)
		s.move(3000, 60, false, true)
		s.move(200, 60, false, true)
		laps := s.ended()
		if len(laps) != 3 {
			t.Fatalf("%s: laps ended: %d", c.name, len(laps))
		}
		lapCheck(t, c.name+": the lap before", laps[1], true)
		lapCheck(t, c.name+": the lap with the gap", laps[2], !c.bad)
		lapCheck(t, c.name+": the lap after", laps[3], true)
	}
}

// a reset to a pit box behind the car on the lap: the box just past the line, the car half way round. Every point of
// the lap is filled again as the car drives on from the box (over the points of its first pass), so no hole shows; the
// jump back is the reset, and that lap is never valid. A reset in the last tenth of the lap to that box looks like the
// line being crossed (the end of the lap to its start), but the car could never have driven it: the lap goes on, never
// valid, and ends at the line once, as the game counts it
func TestLapResetToABoxBehind(t *testing.T) {
	for _, at := range []float64{1500, 2800} {
		s := newLapSim(t, 1, 0)
		s.sample(60, false, true)
		s.move(3000, 60, false, true) // lap 1, then into lap 2
		s.move(at, 60, false, true)
		s.d = 100 // reset: in the pit box, just past the line
		s.wait(4, true, true)
		s.move(300, 20, true, true) // down the pit lane to its exit
		s.move(2600, 60, false, true)
		s.move(3000, 60, false, true)
		s.move(200, 60, false, true)
		laps := s.ended()
		if len(laps) != 3 || s.lap != 4 {
			t.Fatalf("reset at %.0f m: laps ended %d, the game's lap %d", at, len(laps), s.lap)
		}
		lapCheck(t, "the lap before", laps[1], true)
		lapCheck(t, "the lap reset", laps[2], false)
		lapCheck(t, "the lap after", laps[3], true)
	}
}

// the telemetry stops for the last 100 m before the line and comes back after it: the lap that ended has a hole at its
// end (nothing recorded past 2900 m of 3000), so it is not valid; the next lap starts at the line and is
func TestLapTelemetryGapAtTheLine(t *testing.T) {
	s := newLapSim(t, 1, 0)
	s.sample(60, false, true)
	s.move(3000, 60, false, true)
	s.move(2900, 60, false, true)
	s.move(100, 60, false, false) // lost, up to the line
	s.move(3000, 60, false, true)
	s.move(200, 60, false, true)
	laps := s.ended()
	if len(laps) != 3 {
		t.Fatalf("laps ended: %d", len(laps))
	}
	lapCheck(t, "the lap before", laps[1], true)
	lapCheck(t, "the lap cut short", laps[2], false)
	lapCheck(t, "the lap after", laps[3], true)
}

// Le Mans Ultimate's lap flag: a lap whose flag never says its time counts (the game's practice says "lap, not time" for
// every lap) is valid, while a lap whose flag drops from "time counts" (a cut) is not
func TestLapCountFlagOnlyADrop(t *testing.T) {
	s := newLapSim(t, 1, 0)
	s.flag = func(lap int, d float64) float64 {
		switch {
		case lap == 2:
			return 1 // the whole lap: practice
		case lap == 3 && d >= 1500:
			return 1 // dropped half way: a cut
		}
		return 2
	}
	s.move(4*3000+100, 60, false, true)
	laps := s.ended()
	lapCheck(t, "time counts", laps[1], true)
	lapCheck(t, "the flag never said the time counts", laps[2], true)
	lapCheck(t, "the flag dropped", laps[3], false)
	lapCheck(t, "time counts again", laps[4], true)
}
