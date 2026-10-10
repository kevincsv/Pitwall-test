package main

// The field's braking points. iRacing sends every car's position on the lap
// (not its pedals), so their speed along the lap comes from how fast that
// position moves; a braking zone starts where the speed starts to drop.
// Everyone (you included) is measured the same way, so they compare fairly.

import (
	"fmt"
	"math"
	"strconv"
	"strings"
	"sync"
	"time"
)

const fieldBin = 10.0 // metres

type carLapProf struct {
	lap            int
	v              []float32
	valid          bool
	lastPct, lastT float64
	pendV          []float32
	pendAt         float64
	best           float64
	bestV          []float32
	// sector times (thirds of the lap, like your own): the moments this lap crossed the line and the
	// third marks, the sectors of the lap just finished (paired with its time when that arrives), and
	// the sectors of every lap whose time matched
	cross   [3]float64
	pendS   []float64
	pendSAt float64
	lapsS   []lapSecs
}

type lapSecs struct {
	time float64
	s    []float64
}

// fieldSectors: the sector times of a car's lap of that time (its best lap, for the race table and
// the community), when the field watcher saw the lap whole.
func fieldSectors(carIdx int, lapTime float64) []float64 {
	if lapTime <= 0 {
		return nil
	}
	fieldMu.Lock()
	defer fieldMu.Unlock()
	c := fieldCars[carIdx]
	if c == nil {
		return nil
	}
	for _, l := range c.lapsS {
		if math.Abs(l.time-lapTime) < 0.002 {
			return append([]float64{}, l.s...)
		}
	}
	return nil
}

var (
	fieldMu   sync.Mutex
	fieldCars = map[int]*carLapProf{}
	fieldID   string
	fieldLen  float64
)

func telArrays(names []string) [][]float64 {
	out := make([][]float64, len(names))
	tel.mu.RLock()
	defer tel.mu.RUnlock()
	if len(tel.buf) == 0 {
		return out
	}
	idx := []int{}
	pos := []int{}
	for k, n := range names {
		if i, ok := tel.index[n]; ok {
			idx = append(idx, i)
			pos = append(pos, k)
		}
	}
	for j, v := range decodeValues(tel.vars, tel.buf, idx) {
		if arr, ok := v.([]any); ok {
			f := make([]float64, len(arr))
			for i, x := range arr {
				f[i] = toF(x)
			}
			out[pos[j]] = f
		}
	}
	return out
}

// trackLength reads "3.60 km" / "2.24 mi" from the session.
func trackLength(y string) float64 {
	f := strings.Fields(yamlField(y, "TrackLength"))
	if len(f) == 0 {
		return 0
	}
	v, _ := strconv.ParseFloat(f[0], 64)
	if len(f) > 1 && f[1] == "mi" {
		return v * 1609.34
	}
	return v * 1000
}

func fieldWatcher() {
	for range time.Tick(50 * time.Millisecond) {
		st := currentStatus()
		if !st.connected() || (st.Demo && !cloudDemo) {
			continue
		}
		y := sessionYAML()
		sn := int(telNums([]string{"SessionNum"})[0])
		id := fmt.Sprintf("%s-%d-%s", yamlField(y, "SubSessionID"), sn, yamlField(y, "TrackID"))
		a := telArrays([]string{"CarIdxLapDistPct", "CarIdxLap", "CarIdxLastLapTime", "CarIdxOnPitRoad"})
		t := telNums([]string{"SessionTime"})[0]
		if a[0] == nil || a[1] == nil {
			continue
		}
		fieldMu.Lock()
		if id != fieldID {
			fieldID, fieldCars, fieldLen = id, map[int]*carLapProf{}, trackLength(y)
		}
		L := fieldLen
		if L < 500 {
			fieldMu.Unlock()
			continue
		}
		nb := int(L/fieldBin) + 1
		for i, pct := range a[0] {
			if pct < 0 {
				continue
			}
			c := fieldCars[i]
			if c == nil {
				c = &carLapProf{lap: -1}
				fieldCars[i] = c
			}
			pit := a[3] != nil && i < len(a[3]) && a[3][i] > 0
			lap := int(a[1][i])
			if lap != c.lap {
				if c.lap >= 0 && c.valid && coverage(c.v) > 0.85 {
					c.pendV, c.pendAt = c.v, t
				}
				c.lap, c.v, c.valid = lap, make([]float32, nb), !pit
			}
			if pit {
				c.valid = false
			}
			// the last lap time arrives a moment after the line
			if c.pendV != nil && t-c.pendAt > 2 {
				if lt := a[2][i]; lt > 0 && (c.best == 0 || lt < c.best) {
					c.best, c.bestV = lt, c.pendV
				}
				c.pendV = nil
			}
			if c.pendS != nil && t-c.pendSAt > 2 {
				if lt := a[2][i]; lt > 0 && math.Abs(c.pendS[0]+c.pendS[1]+c.pendS[2]-lt) < 0.02*lt {
					// the sectors add up to the lap time: keep them, scaled onto the official time
					k := lt / (c.pendS[0] + c.pendS[1] + c.pendS[2])
					c.lapsS = append(c.lapsS, lapSecs{time: lt, s: []float64{round(c.pendS[0]*k, 3), round(c.pendS[1]*k, 3), round(lt-round(c.pendS[0]*k, 3)-round(c.pendS[1]*k, 3), 3)}})
					if len(c.lapsS) > 300 {
						c.lapsS = c.lapsS[1:]
					}
				}
				c.pendS = nil
			}
			if c.lastT > 0 && t > c.lastT && t-c.lastT < 0.5 {
				d := pct - c.lastPct
				if d < -0.5 {
					d++
					// the line, crossed between the two samples: the lap just finished has its sectors
					at := c.lastT + (t-c.lastT)*(1-c.lastPct)/d
					if c.cross[0] > 0 && c.cross[1] > c.cross[0] && c.cross[2] > c.cross[1] && at > c.cross[2] {
						c.pendS, c.pendSAt = []float64{c.cross[1] - c.cross[0], c.cross[2] - c.cross[1], at - c.cross[2]}, t
					}
					c.cross = [3]float64{at, 0, 0}
				} else if d > 0 && d < 0.05 {
					for k, m := range []float64{1.0 / 3, 2.0 / 3} {
						if c.lastPct < m && pct >= m {
							c.cross[k+1] = c.lastT + (t-c.lastT)*(m-c.lastPct)/d
						}
					}
				}
				if d >= 0 && d < 0.05 {
					sp := d * L / (t - c.lastT)
					if b := int(pct * L / fieldBin); b < nb && sp < 120 {
						if c.v[b] == 0 {
							c.v[b] = float32(sp)
						} else {
							c.v[b] = (c.v[b] + float32(sp)) / 2
						}
					}
				}
			}
			c.lastPct, c.lastT = pct, t
		}
		fieldMu.Unlock()
	}
}

func coverage(v []float32) float64 {
	if len(v) == 0 {
		return 0
	}
	n := 0
	for _, x := range v {
		if x > 0 {
			n++
		}
	}
	return float64(n) / float64(len(v))
}

// brakePoints finds where the speed starts to drop by more than 4 m/s.
func brakePoints(raw []float32) (d, vmin []float64) {
	n := len(raw)
	if n < 20 {
		return
	}
	v := make([]float64, n)
	for i, x := range raw { // fill holes from the neighbours
		v[i] = float64(x)
	}
	last := -1
	for i := range v {
		if v[i] > 0 {
			if last >= 0 && i-last > 1 {
				for k := last + 1; k < i; k++ {
					v[k] = v[last] + (v[i]-v[last])*float64(k-last)/float64(i-last)
				}
			}
			last = i
		}
	}
	s := make([]float64, n) // smooth over 30 m
	for i := range v {
		a, c := 0.0, 0
		for k := i - 1; k <= i+1; k++ {
			if k >= 0 && k < n && v[k] > 0 {
				a += v[k]
				c++
			}
		}
		if c > 0 {
			s[i] = a / float64(c)
		}
	}
	for i := 1; i < n-6; i++ {
		if s[i] <= 0 || s[i] < s[i-1] || s[i+6] <= 0 || s[i]-s[i+6] < 4 {
			continue
		}
		for i < n-7 && s[i+1] >= s[i]-0.3 { // the drop starts here
			i++
		}
		lo, k := s[i], i
		for k < n-1 && s[k+1] > 0 && s[k+1] <= s[k]+0.3 {
			k++
			lo = math.Min(lo, s[k])
		}
		d = append(d, round(float64(i)*fieldBin, 0))
		vmin = append(vmin, round(lo, 1))
		i = k
	}
	return
}

// fillHoles: the empty bins of a speed profile take the value of their neighbours (the ends, the
// nearest value).
func fillHoles(raw []float32) []float64 {
	n := len(raw)
	v := make([]float64, n)
	last := -1
	for i, x := range raw {
		if x <= 0 {
			continue
		}
		v[i] = float64(x)
		if last < 0 {
			for k := 0; k < i; k++ {
				v[k] = v[i]
			}
		} else if i-last > 1 {
			for k := last + 1; k < i; k++ {
				v[k] = v[last] + (v[i]-v[last])*float64(k-last)/float64(i-last)
			}
		}
		last = i
	}
	for k := last + 1; k < n; k++ {
		if last >= 0 {
			v[k] = v[last]
		}
	}
	return v
}

// fieldTrace: a car's best lap as one of our traces, from the speed its position gave every 10 m:
// speed and lap time every 5 m, scaled so they add up to the official lap time, and the pedals
// estimated from the speed (braking where it drops, full throttle where it rises or holds near the
// top). For the community: its model, leaderboard and comparisons; marked "field" so the apps say
// the pedals are estimates.
func fieldTrace(carIdx int, lapTime float64) *lapTrace {
	fieldMu.Lock()
	c := fieldCars[carIdx]
	var raw []float32
	if c != nil && c.bestV != nil && math.Abs(c.best-lapTime) < 0.002 {
		raw = append([]float32{}, c.bestV...)
	}
	fieldMu.Unlock()
	if raw == nil || lapTime <= 0 || len(raw) < 20 || coverage(raw) < 0.85 {
		return nil
	}
	v := fillHoles(raw)
	n := len(v)
	sp := make([]float64, 0, 2*n)
	for i := 0; i < 2*n; i++ { // 5 m points between the 10 m bins
		j, f := i/2, 0.5*float64(i%2)
		x := v[j]
		if j+1 < n {
			x = v[j]*(1-f) + v[j+1]*f
		}
		sp = append(sp, math.Max(1, x))
	}
	sum := 0.0
	for _, s := range sp {
		sum += float64(lapBin) / s
	}
	k, vmax := sum/lapTime, 0.0
	for i := range sp {
		sp[i] *= k
		vmax = math.Max(vmax, sp[i])
	}
	d := make([][6]float64, len(sp))
	t := 0.0
	for i, s := range sp {
		// the speed 20 m back and ahead says what the pedals were doing
		dv := sp[min(len(sp)-1, i+2)] - sp[max(0, i-2)]
		thr, brk := 0.0, 0.0
		switch {
		case dv < -0.8:
			brk = math.Min(1, -dv/6)
		case dv > 0.3 || s > 0.85*vmax:
			thr = 1
		}
		d[i] = [6]float64{round(s, 2), thr, round(brk, 2), 0, 0, round(t, 3)}
		t += float64(lapBin) / s
	}
	return &lapTrace{Bin: lapBin, D: d, Src: "field"}
}

type carBrakes struct {
	Name string    `json:"name"`
	Pos  int       `json:"pos,omitempty"`
	Best float64   `json:"best,omitempty"`
	Me   bool      `json:"me,omitempty"`
	D    []float64 `json:"d"`
	Vmin []float64 `json:"vmin"`
}

// fieldBrakes: your braking points and those of the fastest drivers of your
// class and of the cars that finished around you, from each one's best lap.
func fieldBrakes(y string, res []raceResult) []carBrakes {
	fieldMu.Lock()
	defer fieldMu.Unlock()
	me := atoi(yamlField(y, "DriverCarIdx"))
	idxByName := map[string]int{}
	for i := range fieldCars {
		if d := driverBlock(y, strconv.Itoa(i)); d != "" {
			idxByName[yamlField(d, "UserName")] = i
		}
	}
	var out []carBrakes
	add := func(i int, name string, pos int) {
		c := fieldCars[i]
		if c == nil || c.bestV == nil {
			return
		}
		for _, o := range out {
			if o.Name == name {
				return
			}
		}
		d, vm := brakePoints(c.bestV)
		out = append(out, carBrakes{Name: name, Pos: pos, Best: round(c.best, 3), Me: i == me, D: d, Vmin: vm})
	}
	myPos := 0
	for i, r := range res {
		if r.Me {
			myPos = i
		}
	}
	for i, r := range res {
		if i < 5 || r.Me || (i >= myPos-1 && i <= myPos+1) {
			if k, ok := idxByName[r.Name]; ok {
				add(k, r.Name, i+1)
			}
		}
	}
	if len(res) == 0 {
		if d := driverBlock(y, strconv.Itoa(me)); d != "" {
			add(me, yamlField(d, "UserName"), 0)
		}
	}
	return out
}

// ---------- per-lap detail of your own laps (30 times a second) ----------

type lapStat struct {
	Full   float64   `json:"full"`  // share of the lap flat out
	Brk    float64   `json:"brk"`   // share braking
	Coast  float64   `json:"coast"` // share with no pedal
	Vmax   float64   `json:"vmax"`
	Shifts int       `json:"shifts"`
	S      []float64 `json:"s,omitempty"` // three sector times
	GapA   float64   `json:"gapA,omitempty"`
	GapB   float64   `json:"gapB,omitempty"`
	PitT   float64   `json:"pitT,omitempty"` // seconds on pit road
	Track  float64   `json:"track,omitempty"`
	Wet    int       `json:"wet,omitempty"`
}

var (
	myMu    sync.Mutex
	myStats = map[int]lapStat{}
	mySess  string
)

func myLapStat(lap int) (lapStat, bool) {
	myMu.Lock()
	defer myMu.Unlock()
	s, ok := myStats[lap]
	return s, ok
}

func myLapWatcher() {
	vars := []string{"Lap", "LapDistPct", "Throttle", "Brake", "Speed", "Gear", "SessionTime", "OnPitRoad", "IsOnTrack", "SessionNum", "PlayerCarIdx", "TrackTempCrew", "TrackWetness"}
	var lap, n, full, brk, coast, shifts, runSeen int
	var vmax, lastT, pitT, lastPct, lastGear float64
	var cross [3]float64
	for range time.Tick(time.Second / 30) {
		st := currentStatus()
		if !st.connected() || (st.Demo && !cloudDemo) {
			continue
		}
		v := telNums(vars)
		if v[8] == 0 {
			continue
		}
		y := sessionYAML()
		id := yamlField(y, "SubSessionID") + "-" + strconv.Itoa(int(v[9]))
		myMu.Lock()
		if id != mySess {
			mySess, myStats = id, map[int]lapStat{}
			lap = -1
		}
		myMu.Unlock()
		l, pct, t := int(v[0]), v[1], v[6]
		// a lap is known by its number in the session, counted over its restarts (sessionrun.go)
		if base, _ := noteRun(curRunKey(int(v[9])), t, l); base != runSeen {
			runSeen, lap = base, -1
		}
		l += runSeen
		if l != lap {
			if lap > 0 && n > 30 {
				s := lapStat{Full: round(float64(full)/float64(n), 3), Brk: round(float64(brk)/float64(n), 3), Coast: round(float64(coast)/float64(n), 3), Vmax: round(vmax, 1), Shifts: shifts, PitT: round(pitT, 1), Track: round(v[11], 1), Wet: int(v[12])}
				if cross[0] > 0 && cross[1] > cross[0] && cross[2] > cross[1] {
					s.S = []float64{round(cross[1]-cross[0], 3), round(cross[2]-cross[1], 3), round(t-cross[2], 3)}
				}
				// gaps to the cars just ahead and behind, from their time behind the leader
				a := telArrays([]string{"CarIdxPosition", "CarIdxF2Time"})
				if me := int(v[10]); a[0] != nil && a[1] != nil && me < len(a[0]) {
					mp := a[0][me]
					for i := range a[0] {
						if a[0][i] == mp-1 {
							s.GapA = round(a[1][me]-a[1][i], 3)
						}
						if a[0][i] == mp+1 {
							s.GapB = round(a[1][i]-a[1][me], 3)
						}
					}
				}
				myMu.Lock()
				myStats[lap] = s
				myMu.Unlock()
			}
			lap, n, full, brk, coast, shifts, vmax, pitT = l, 0, 0, 0, 0, 0, 0, 0
			cross = [3]float64{t, 0, 0}
		}
		n++
		if v[2] > 0.98 {
			full++
		}
		if v[3] > 0.05 {
			brk++
		}
		if v[2] < 0.05 && v[3] < 0.05 {
			coast++
		}
		vmax = math.Max(vmax, v[4])
		if v[5] != lastGear && lastGear > 0 && v[5] > 0 {
			shifts++
		}
		lastGear = v[5]
		if v[7] > 0 && lastT > 0 && t > lastT {
			pitT += t - lastT
		}
		if lastPct < 1.0/3 && pct >= 1.0/3 {
			cross[1] = t
		}
		if lastPct < 2.0/3 && pct >= 2.0/3 {
			cross[2] = t
		}
		lastPct, lastT = pct, t
	}
}
