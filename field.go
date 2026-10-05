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
			if c.lastT > 0 && t > c.lastT && t-c.lastT < 0.5 {
				d := pct - c.lastPct
				if d < -0.5 {
					d++
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
