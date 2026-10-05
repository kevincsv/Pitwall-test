package main

// Haptics: bass shakers and tactile transducers.
//
// Pitlane HQ's own effects engine sends the effects as sound to a sound card or
// USB audio box wired to an amplifier and bass shakers (seat, pedals). Chosen
// per profile: "engine" or "off".

import (
	"encoding/json"
	"errors"
	"io"
	"math"
	"math/rand"
	"net/http"
	"os"
	"path/filepath"
	"sync"
	"time"
)

const hapRate = 48000 // samples per second
const hapBlock = 480  // 10 ms

type hapEffect struct {
	On   bool    `json:"on"`
	Gain float64 `json:"gain"` // 0..1.5
	Freq float64 `json:"freq"` // Hz
	Ch   []int   `json:"ch"`   // output channels (even = left, odd = right)
}

type hapConfig struct {
	Mode     string                `json:"mode"` // "engine" or "off"
	Device   int                   `json:"device"`
	Channels int                   `json:"channels"`
	Master   float64               `json:"master"`
	InCar    bool                  `json:"inCar"` // only while driving
	Effects  map[string]*hapEffect `json:"effects"`
}

var hapEffectOrder = []string{"engine", "shift", "road", "abs", "impact", "offtrack", "slip", "tc", "lock", "slide", "gforce", "bottom", "limiter", "pitlimiter"}

func defaultHaptics() hapConfig {
	return hapConfig{Mode: "engine", Device: -1, Channels: 2, Master: 0.7, InCar: true, Effects: map[string]*hapEffect{
		"engine":   {On: true, Gain: 0.6, Freq: 32, Ch: []int{0, 1}},
		"shift":    {On: true, Gain: 1, Freq: 38, Ch: []int{0, 1}},
		"road":     {On: true, Gain: 0.8, Freq: 46, Ch: []int{0, 1}},
		"abs":      {On: true, Gain: 0.9, Freq: 55, Ch: []int{0, 1}},
		"impact":   {On: true, Gain: 1, Freq: 28, Ch: []int{0, 1}},
		"offtrack": {On: true, Gain: 0.7, Freq: 24, Ch: []int{0, 1}},
		// like TrackImpulse: traction loss, TC, lock-ups, slides, braking g, bottoming, limiters
		"slip":       {On: true, Gain: 0.9, Freq: 42, Ch: []int{0, 1}},
		"tc":         {On: true, Gain: 0.7, Freq: 50, Ch: []int{0, 1}},
		"lock":       {On: true, Gain: 1, Freq: 62, Ch: []int{0, 1}},
		"slide":      {On: true, Gain: 0.7, Freq: 36, Ch: []int{0, 1}},
		"gforce":     {On: false, Gain: 0.6, Freq: 18, Ch: []int{0, 1}},
		"bottom":     {On: true, Gain: 0.9, Freq: 26, Ch: []int{0, 1}},
		"limiter":    {On: true, Gain: 0.6, Freq: 70, Ch: []int{0, 1}},
		"pitlimiter": {On: true, Gain: 0.4, Freq: 30, Ch: []int{0, 1}},
	}}
}

var (
	hapMu    sync.Mutex
	hapCfg   = defaultHaptics()
	hapLevel = map[string]float64{} // last level of each effect, for the meters
	hapTest  struct {
		name  string
		until time.Time
	}
	hapErr     string
	hapRunning bool
	hapStop    chan struct{}
)

func hapPath() string { return filepath.Join(activeDir(), "haptics.json") }

// loadHaptics reads the active profile's haptics settings and (re)starts the engine.
func loadHaptics() {
	c := defaultHaptics()
	if b, err := os.ReadFile(hapPath()); err == nil {
		json.Unmarshal(b, &c)
	}
	cleanHaptics(&c)
	hapMu.Lock()
	hapCfg = c
	hapMu.Unlock()
	applyHapticsMode()
}

func cleanHaptics(c *hapConfig) {
	d := defaultHaptics()
	if c.Mode != "off" {
		c.Mode = "engine" // older settings may say "simhub"
	}
	switch c.Channels {
	case 2, 4, 6, 8:
	default:
		c.Channels = 2
	}
	c.Master = clampF(c.Master, 0, 1)
	if c.Effects == nil {
		c.Effects = map[string]*hapEffect{}
	}
	for _, k := range hapEffectOrder {
		e, ok := c.Effects[k]
		if !ok || e == nil {
			c.Effects[k] = d.Effects[k]
			continue
		}
		e.Gain = clampF(e.Gain, 0, 1.5)
		if e.Freq < 10 || e.Freq > 120 {
			e.Freq = d.Effects[k].Freq
		}
		ch := e.Ch[:0]
		for _, x := range e.Ch {
			if x >= 0 && x < 8 {
				ch = append(ch, x)
			}
		}
		e.Ch = ch
	}
	for k := range c.Effects {
		if _, ok := d.Effects[k]; !ok {
			delete(c.Effects, k)
		}
	}
}

func clampF(v, lo, hi float64) float64 { return math.Max(lo, math.Min(hi, v)) }

func saveHaptics() {
	hapMu.Lock()
	b, _ := json.MarshalIndent(hapCfg, "", "  ")
	hapMu.Unlock()
	os.MkdirAll(activeDir(), 0o700)
	os.WriteFile(hapPath(), b, 0o600)
}

func applyHapticsMode() {
	hapMu.Lock()
	want := hapCfg.Mode == "engine"
	dev, chans := hapCfg.Device, hapCfg.Channels
	running := hapRunning
	stop := hapStop
	hapMu.Unlock()
	if running {
		close(stop)
		for i := 0; i < 50; i++ {
			hapMu.Lock()
			r := hapRunning
			hapMu.Unlock()
			if !r {
				break
			}
			time.Sleep(20 * time.Millisecond)
		}
	}
	if !want {
		return
	}
	hapMu.Lock()
	hapStop = make(chan struct{})
	hapRunning = true
	hapErr = ""
	s := hapStop
	hapMu.Unlock()
	go func() {
		err := runHapticsOutput(dev, chans, s)
		hapMu.Lock()
		hapRunning = false
		if err != nil {
			hapErr = err.Error()
		}
		hapMu.Unlock()
	}()
}

// ---------- telemetry to effect levels ----------

var hapVars = []string{"RPM", "Throttle", "Gear", "LFshockVel", "RFshockVel", "LRshockVel", "RRshockVel", "BrakeABSactive", "VertAccel", "PlayerTrackSurface", "Speed", "IsOnTrack",
	"Brake", "LongAccel", "VelocityX", "VelocityY", "EngineWarnings", "dcTractionControl", "Clutch", "LFrideHeight", "RFrideHeight", "LRrideHeight", "RRrideHeight"}

func telNums(names []string) []float64 {
	out := make([]float64, len(names))
	tel.mu.RLock()
	defer tel.mu.RUnlock()
	if len(tel.buf) == 0 {
		return out
	}
	idx := make([]int, 0, len(names))
	pos := make([]int, 0, len(names))
	for k, n := range names {
		if i, ok := tel.index[n]; ok {
			idx = append(idx, i)
			pos = append(pos, k)
		}
	}
	for j, v := range decodeValues(tel.vars, tel.buf, idx) {
		out[pos[j]] = toF(v)
	}
	return out
}

func toF(v any) float64 {
	switch x := v.(type) {
	case float64:
		return x
	case int32:
		return float64(x)
	case int:
		return float64(x)
	case bool:
		if x {
			return 1
		}
	}
	return 0
}

// hapState turns telemetry into a level (0..1) per effect and side.
type hapState struct {
	ratio            map[int]float64 // RPM per m/s in each gear, learned while the tyres grip
	tcPhase          float64
	bottomT          float64
	rpmMax, lastGear float64
	shiftT, impactT  float64 // seconds left of a burst
	impactAmp        float64
	absPhase         float64
}

type hapTargets struct {
	amp   map[string][2]float64 // left, right
	freq  map[string]float64
	noise map[string]float64 // 0..1 roughness
}

func (s *hapState) step(v []float64, c hapConfig, dt float64) hapTargets {
	rpm, thr, gear := v[0], v[1], v[2]
	shL, shR := math.Abs(v[3])+math.Abs(v[5]), math.Abs(v[4])+math.Abs(v[6])
	abs, vert, surf, speed, onTrack := v[7] > 0, v[8], v[9], v[10], v[11] > 0
	t := hapTargets{amp: map[string][2]float64{}, freq: map[string]float64{}, noise: map[string]float64{}}
	for k, e := range c.Effects {
		t.freq[k] = e.Freq
	}
	if c.InCar && !onTrack {
		s.lastGear = gear
		return t
	}
	if s.rpmMax < 3000 {
		s.rpmMax = 7000
	}
	if rpm > s.rpmMax {
		s.rpmMax = rpm
	}
	if rpm > 300 {
		r := clampF(rpm/s.rpmMax, 0, 1)
		a := 0.25 + 0.75*thr
		t.amp["engine"] = [2]float64{a, a}
		t.freq["engine"] = c.Effects["engine"].Freq * (1 + 1.3*r)
	}
	if gear != s.lastGear && s.lastGear != 0 && gear != 0 {
		s.shiftT = 0.09
	}
	s.lastGear = gear
	if s.shiftT > 0 {
		s.shiftT -= dt
		t.amp["shift"] = [2]float64{1, 1}
	}
	// suspension movement: about 0.4 m/s of shock speed is a kerb
	road := func(x float64) float64 { return clampF(x/0.4, 0, 1) }
	t.amp["road"] = [2]float64{road(shL), road(shR)}
	t.noise["road"] = 0.5
	if abs {
		s.absPhase += dt * 14
		p := 0.0
		if math.Mod(s.absPhase, 1) < 0.5 {
			p = 1
		}
		t.amp["abs"] = [2]float64{p, p}
	}
	if d := math.Abs(vert - 9.81); d > 6 && s.impactT <= 0 {
		s.impactT, s.impactAmp = 0.14, clampF((d-6)/15, 0.3, 1)
	}
	if s.impactT > 0 {
		s.impactT -= dt
		a := s.impactAmp * s.impactT / 0.14
		t.amp["impact"] = [2]float64{a, a}
	}
	if surf == 0 && speed > 5 {
		t.amp["offtrack"] = [2]float64{0.8, 0.8}
		t.noise["offtrack"] = 0.8
	}
	s.stepExtra(v, dt, &t)
	return t
}

// stepExtra: effects worked out from iRacing's telemetry, as TrackImpulse-style tools do
// (iRacing does not send wheel speeds, so slip comes from the engine and the car's motion).
func (s *hapState) stepExtra(v []float64, dt float64, t *hapTargets) {
	at := func(i int) float64 {
		if i < len(v) {
			return v[i]
		}
		return 0
	}
	if len(v) < 23 {
		return
	}
	rpm, thr, gear, speed := v[0], v[1], int(v[2]), v[10]
	brk, long, vx, vy, warn, tc, clutch := at(12), at(13), at(14), at(15), int(at(16)), at(17), at(18)
	if s.ratio == nil {
		s.ratio = map[int]float64{}
	}
	// wheelspin and lock-ups: the driven wheels turn the engine, so RPM against road speed
	// rises when they spin and drops when they lock
	slip := 0.0
	if gear >= 1 && speed > 6 && rpm > 800 && clutch > 0.9 {
		r := rpm / speed
		if base := s.ratio[gear]; base > 0 {
			slip = r/base - 1
		}
		if thr > 0.15 && thr < 0.9 && brk < 0.05 || s.ratio[gear] == 0 {
			if s.ratio[gear] == 0 {
				s.ratio[gear] = r
			} else if math.Abs(slip) < 0.05 {
				s.ratio[gear] += (r - s.ratio[gear]) * 0.02
			}
		}
	}
	if thr > 0.4 && slip > 0.05 {
		a := clampF((slip-0.04)/0.15, 0, 1)
		t.amp["slip"] = [2]float64{a, a}
		t.noise["slip"] = 0.35
		if tc > 0 { // traction control cutting in: a fast stutter while it limits the spin
			s.tcPhase += dt * 12
			p := 0.0
			if math.Mod(s.tcPhase, 1) < 0.5 {
				p = 0.9
			}
			t.amp["tc"] = [2]float64{p, p}
		}
	}
	if brk > 0.3 && slip < -0.07 && v[7] == 0 {
		a := clampF((-slip-0.05)/0.2, 0.3, 1)
		t.amp["lock"] = [2]float64{a, a}
		t.noise["lock"] = 0.6
	}
	// slides: angle between where the car points and where it goes
	if speed > 12 && vx > 1 {
		ang := math.Abs(math.Atan2(vy, vx)) * 180 / math.Pi
		if ang > 4 {
			a := clampF((ang-4)/10, 0, 1)
			l, r := a, a*0.5
			if vy < 0 {
				l, r = r, l
			}
			t.amp["slide"] = [2]float64{l, r}
			t.noise["slide"] = 0.25
		}
	}
	// heavy braking: a low rumble that grows with the deceleration
	if long < -6 {
		a := clampF((-long-6)/20, 0, 1)
		t.amp["gforce"] = [2]float64{a, a}
	}
	// bottoming: a corner of the car touches the ground
	minRide := math.Min(math.Min(at(19), at(20)), math.Min(at(21), at(22)))
	if minRide > -1 && minRide < 0.004 && speed > 10 && s.bottomT <= 0 && (at(19) != 0 || at(21) != 0) {
		s.bottomT = 0.12
	}
	if s.bottomT > 0 {
		s.bottomT -= dt
		a := clampF(s.bottomT/0.12, 0, 1)
		t.amp["bottom"] = [2]float64{a, a}
	}
	if warn&0x20 != 0 { // rev limiter
		t.amp["limiter"] = [2]float64{0.8, 0.8}
	}
	if warn&0x10 != 0 && speed > 1 { // pit limiter: a slow pulse
		s.tcPhase += dt * 2
		p := 0.0
		if math.Mod(s.tcPhase, 1) < 0.3 {
			p = 0.6
		}
		t.amp["pitlimiter"] = [2]float64{p, p}
	}
}

// hapSynth mixes the effects into interleaved float samples.
type hapSynth struct {
	phase map[string]float64
	amp   map[string][2]float64
	state hapState
	rnd   *rand.Rand
}

func newHapSynth() *hapSynth {
	return &hapSynth{phase: map[string]float64{}, amp: map[string][2]float64{}, rnd: rand.New(rand.NewSource(1))}
}

// block fills out (hapBlock*chans samples, -1..1) from the newest telemetry.
func (h *hapSynth) block(out []float32, chans int, vals []float64) {
	hapMu.Lock()
	c := hapCfg
	effects := map[string]hapEffect{}
	for k, e := range c.Effects {
		effects[k] = *e
	}
	test := ""
	if time.Now().Before(hapTest.until) {
		test = hapTest.name
	}
	hapMu.Unlock()
	c.Effects = nil
	tg := h.state.step(vals, hapConfig{InCar: c.InCar && test == "", Effects: toPtrs(effects)}, float64(hapBlock)/hapRate)
	if test != "" {
		for k := range tg.amp {
			delete(tg.amp, k)
		}
		tg.amp[test] = [2]float64{0.8, 0.8}
	}
	for i := range out {
		out[i] = 0
	}
	levels := map[string]float64{}
	for name, e := range effects {
		target := tg.amp[name]
		if !e.On && name != test {
			target = [2]float64{}
		}
		start := h.amp[name]
		f := tg.freq[name]
		if f == 0 {
			f = e.Freq
		}
		nz := tg.noise[name]
		ph := h.phase[name]
		inc := 2 * math.Pi * f / hapRate
		for i := 0; i < hapBlock; i++ {
			k := float64(i) / hapBlock
			aL := (start[0] + (target[0]-start[0])*k) * e.Gain * c.Master
			aR := (start[1] + (target[1]-start[1])*k) * e.Gain * c.Master
			ph += inc
			x := math.Sin(ph)
			if nz > 0 {
				x = x*(1-nz) + (h.rnd.Float64()*2-1)*nz*0.7
			}
			for _, ch := range e.Ch {
				if ch >= chans {
					continue
				}
				a := aL
				if ch%2 == 1 {
					a = aR
				}
				out[i*chans+ch] += float32(x * a)
			}
		}
		h.phase[name] = math.Mod(ph, 2*math.Pi)
		h.amp[name] = target
		levels[name] = math.Max(target[0], target[1]) * e.Gain
	}
	for i, x := range out { // soft limit so several effects never clip harshly
		out[i] = float32(math.Tanh(float64(x)))
	}
	hapMu.Lock()
	hapLevel = levels
	hapMu.Unlock()
}

func toPtrs(m map[string]hapEffect) map[string]*hapEffect {
	o := map[string]*hapEffect{}
	for k, v := range m {
		v := v
		o[k] = &v
	}
	return o
}

func registerHapticsRoutes(mux *http.ServeMux) {
	mux.HandleFunc("/api/haptics", func(w http.ResponseWriter, r *http.Request) {
		if r.Method == http.MethodPost {
			var in hapConfig
			if err := json.NewDecoder(io.LimitReader(r.Body, 1<<16)).Decode(&in); err != nil {
				http.Error(w, "bad settings", 400)
				return
			}
			cleanHaptics(&in)
			hapMu.Lock()
			restart := in.Mode != hapCfg.Mode || in.Device != hapCfg.Device || in.Channels != hapCfg.Channels
			hapCfg = in
			hapMu.Unlock()
			saveHaptics()
			if restart {
				applyHapticsMode()
			}
		}
		hapMu.Lock()
		out := map[string]any{"config": hapCfg, "levels": hapLevel, "running": hapRunning, "error": hapErr, "order": hapEffectOrder}
		hapMu.Unlock()
		out["devices"] = audioDevices()
		out["windows"] = appsSupported
		writeJSON(w, out)
	})
	mux.HandleFunc("/api/haptics/levels", func(w http.ResponseWriter, r *http.Request) {
		hapMu.Lock()
		defer hapMu.Unlock()
		writeJSON(w, map[string]any{"levels": hapLevel, "running": hapRunning, "error": hapErr})
	})
	mux.HandleFunc("/api/haptics/do", func(w http.ResponseWriter, r *http.Request) {
		if r.Method != http.MethodPost {
			http.Error(w, "POST only", 405)
			return
		}
		var in struct{ Action, Effect string }
		json.NewDecoder(io.LimitReader(r.Body, 4096)).Decode(&in)
		var err error
		if in.Action == "test" {
			hapMu.Lock()
			_, ok := hapCfg.Effects[in.Effect]
			running := hapRunning
			if ok {
				hapTest.name, hapTest.until = in.Effect, time.Now().Add(1200*time.Millisecond)
			}
			hapMu.Unlock()
			if !ok {
				err = errors.New("unknown effect")
			} else if !running {
				err = errors.New("turn on the Pitlane HQ engine first")
			}
		} else {
			err = errors.New("unknown action")
		}
		if err != nil {
			w.WriteHeader(400)
			writeJSON(w, map[string]string{"error": err.Error()})
			return
		}
		writeJSON(w, map[string]string{"result": "ok"})
	})
}

func sleepBlock() { time.Sleep(time.Second * hapBlock / hapRate) }
