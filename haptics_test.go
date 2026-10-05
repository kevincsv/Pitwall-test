package main

import (
	"math"
	"testing"
)

func TestHapticsEffects(t *testing.T) {
	c := defaultHaptics()
	var s hapState
	// RPM, Throttle, Gear, 4 shock velocities, ABS, VertAccel, surface, speed, on track
	base := []float64{6000, 1, 3, 0.1, 0.1, 0.1, 0.1, 0, 9.81, 3, 40, 1}
	tg := s.step(base, c, 0.01)
	if tg.amp["engine"][0] <= 0.9 || tg.freq["engine"] <= c.Effects["engine"].Freq {
		t.Fatalf("engine should be strong and above base frequency: %v %v", tg.amp["engine"], tg.freq["engine"])
	}
	up := append([]float64{}, base...)
	up[2] = 4
	if tg = s.step(up, c, 0.01); tg.amp["shift"][0] != 1 {
		t.Fatal("gear change should fire the shift effect")
	}
	kerb := append([]float64{}, up...)
	kerb[3], kerb[5] = 0.5, 0.5 // left side over a kerb
	tg = s.step(kerb, c, 0.01)
	if tg.amp["road"][0] != 1 || tg.amp["road"][1] >= 0.6 {
		t.Fatalf("road effect should follow the left side: %v", tg.amp["road"])
	}
	off := append([]float64{}, up...)
	off[11] = 0
	if tg = s.step(off, c, 0.01); len(tg.amp) != 0 {
		t.Fatal("nothing should play outside the car")
	}
}

func TestHapticsSynthBlock(t *testing.T) {
	hapCfg = defaultHaptics()
	h := newHapSynth()
	out := make([]float32, hapBlock*2)
	vals := []float64{6000, 1, 3, 0, 0, 0, 0, 0, 9.81, 3, 40, 1}
	h.block(out, 2, vals)
	h.block(out, 2, vals)
	peak := 0.0
	for _, x := range out {
		peak = math.Max(peak, math.Abs(float64(x)))
		if x > 1 || x < -1 {
			t.Fatal("sample out of range")
		}
	}
	if peak < 0.1 {
		t.Fatalf("expected sound, peak %v", peak)
	}
}

func TestHapticsSlipLockSlide(t *testing.T) {
	c := defaultHaptics()
	var s hapState
	// RPM, Thr, Gear, shocks x4, ABS, Vert, surf, speed, onTrack, Brake, LongAccel, Vx, Vy, warn, TC, Clutch, ride x4
	v := func(rpm, thr, brk, speed, vy float64, warn float64) []float64 {
		return []float64{rpm, thr, 3, 0, 0, 0, 0, 0, 9.81, 3, speed, 1, brk, 0, speed, vy, warn, 2, 1, .05, .05, .05, .05}
	}
	for i := 0; i < 50; i++ { // learn third gear: 5000 rpm at 40 m/s
		s.step(v(5000, .5, 0, 40, 0, 0), c, .01)
	}
	if tg := s.step(v(5000, .5, 0, 40, 0, 0), c, .01); tg.amp["slip"][0] != 0 {
		t.Fatal("no slip with grip")
	}
	if tg := s.step(v(6000, 1, 0, 40, 0, 0), c, .01); tg.amp["slip"][0] <= 0 {
		t.Fatal("RPM up 20% at the same speed is wheelspin")
	}
	if tg := s.step(v(4000, 0, .9, 40, 0, 0), c, .01); tg.amp["lock"][0] <= 0 {
		t.Fatal("RPM down 20% under braking is a lock-up")
	}
	if tg := s.step(v(5000, .5, 0, 40, 6, 0), c, .01); tg.amp["slide"][0] <= 0 {
		t.Fatal("8 degrees of slip angle is a slide")
	}
	if tg := s.step(v(5000, .5, 0, 40, 0, 0x20), c, .01); tg.amp["limiter"][0] <= 0 {
		t.Fatal("rev limiter")
	}
}
