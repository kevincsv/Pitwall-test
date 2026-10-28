package main

// The field's laps: what the game says of every other car, 60 times a second (its place on the lap, gear and revs
// and, where the game gives them, its steering, pedals and position). iRacing sends every car's position on the lap
// (not its pedals), so their speed along the lap comes from how fast that position moves, cleaned with the engine's
// revs where the gear held; a braking zone starts where the speed starts to drop. Everyone (you included) is
// measured the same way, so they compare fairly. A rival's lap that left the track, that the game said does not
// count or that the game did not take as the car's best is never its best here and never shared.

import (
	"encoding/binary"
	"fmt"
	"math"
	"sort"
	"strconv"
	"strings"
	"sync"
	"time"
)

const fieldBin = 10.0 // metres

// fieldOffTime: a third of a second off the track makes a rival's lap not valid, as offTrackSamples does for your own
// laps; counted in the game's time, so it means the same whether the game updates the car 60 or 5 times a second
const fieldOffTime = 1.0 / 3

// fieldFillBins: a car the game moves less often than it draws it (Le Mans Ultimate updates the other cars about five
// times a second) can go through more than one 10 m bin between two positions; up to this many bins in one move take
// the move's speed (more is a hole in what the game sent, left empty)
const fieldFillBins = 6

// fbin: what was seen of a car in one 10 m stretch of its lap
type fbin struct {
	v     float32 // speed from how its position moved, m/s (0 not seen)
	rpm   float32 // the engine's revs, averaged over the bin (0 not seen; -1 the gear changed inside the bin)
	steer float32 // steering wheel angle, rad, averaged over the bin's samples
	thr   float32 // the car's own pedals when the game gives them (ped set)
	brk   float32
	x, y  float32 // where the car was, metres east and north of the paths' origin, when the game gives its position (pos set)
	gear  int8    // the gear at the last sample (0 neutral, -1 reverse)
	n     uint8   // samples seen in the bin
	ped   bool
	pos   bool
}

type carLapProf struct {
	lap   int
	b     []fbin  // the lap being driven
	valid bool    // nothing seen yet that makes the lap not valid
	offT  float64 // time off the track this lap (s)
	cntD  float64 // where the game first said this lap's time does not count (past 100 m, off the pit road), -1 never
	cntOK bool    // the flag said this lap's time counts at some point past its first 100 m
	pitD  float64 // where the lap first touched the pit road, -1 never
	wet   uint8   // what the lap was driven in, as bits: 2 a wet track (TrackWetness 4 or more), 4 a damp one (2 or 3), 1 rain
	// the lap just finished, waiting for the game to time it: its bins, when it ended, whether it was judged not valid
	// while driven, the game's best of the car before its time was taken, and its time once read (then the game's best
	// is read again: a lap faster than that best that the game does not take was not accepted)
	pendB     []fbin
	pend      bool
	pendAt    float64
	pendBad   bool
	pendWet   uint8
	pendBest0 float64
	pendLT    float64
	prevLT    float64 // the last lap time the game showed, so a lap never takes the time of the lap before
	pit       bool    // the car touched the pit road this lap: the game's flag says nothing of it (an out-lap is counted, not timed)
	lastPct   float64
	lastT     float64
	moveT     float64 // when the game last moved the car's position: a frame that holds it says nothing of the speed
	best      float64
	bestV     []float32 // the best lap's speed every 10 m (from the revs where the gear held, else the position's)
	bestB     []fbin    // the best lap's bins (nil for a profile made before the car was seen whole)
	bestWet   uint8     // the best lap's bits: 2 a wet track ("wet" on its trace, never the model's), 4 a damp one ("damp" when never wet), 1 rain ("rain"); damp and rain are notes only
	org       [2]float64
	hasOrg    bool      // org: the origin [lat, lon] of the bins' x/y, the same as the player's laps' (geoBase)
	badT      []float64 // the times of the laps judged not valid (fieldLapInvalid)
	// sector times (thirds of the lap, like your own): the moments this lap crossed the line and the
	// third marks, the sectors of the lap just finished (paired with its time when that arrives), and
	// the sectors of every lap whose time matched
	cross   [3]float64
	startET float64 // the game's own time the current lap started at (CarIdxLapStartET), 0 unknown
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

// fieldLapInvalid: the watcher saw this car's lap of that time and judged it not valid (it left the track, the game
// said its time does not count, or the game did not take it as the car's best). Such a lap is never shared.
func fieldLapInvalid(carIdx int, lapTime float64) bool {
	if lapTime <= 0 {
		return false
	}
	fieldMu.Lock()
	defer fieldMu.Unlock()
	c := fieldCars[carIdx]
	if c == nil {
		return false
	}
	for _, x := range c.badT {
		if math.Abs(x-lapTime) < 0.002 {
			return true
		}
	}
	return false
}

var (
	fieldMu   sync.Mutex
	fieldCars = map[int]*carLapProf{}
	fieldID   string
	fieldWho  = map[int]string{} // who is at each index, as the session text last said (fieldDrivers)
)

// fieldDrivers reads who is at each car index in the session text (its DriverInfo): the team in a team event (its
// drivers change at the wheel, the car stays), else the driver's id, else their name. Le Mans Ultimate gives an index
// again to a new car when all 64 are taken (lmuSource.carIdx), so the driver at an index can change within a session;
// the profile of the car before (its best, its laps' sectors and the laps judged not valid) never goes to the
// newcomer: the index starts again. An index the text no longer lists keeps what it had.
func fieldDrivers(y string) {
	who := map[int]string{}
	i := strings.Index(y, "\nDriverInfo:")
	if i < 0 {
		return
	}
	idx, team, uid, name := -1, "", "", ""
	flush := func() {
		if idx < 0 {
			return
		}
		id := ""
		switch {
		case team != "" && team != "0":
			id = "t:" + team
		case uid != "" && uid != "0":
			id = "u:" + uid
		case name != "":
			id = "n:" + name
		}
		if id != "" {
			who[idx] = id
		}
	}
	rest := y[i+1:]
	for first := true; rest != ""; first = false {
		line := rest
		if n := strings.IndexByte(rest, '\n'); n >= 0 {
			line, rest = rest[:n], rest[n+1:]
		} else {
			rest = ""
		}
		if first { // "DriverInfo:" itself
			continue
		}
		if line != "" && line[0] != ' ' && line[0] != '-' { // the next top-level section
			break
		}
		t := strings.TrimSpace(line)
		item := strings.HasPrefix(t, "- ")
		k, v, ok := strings.Cut(strings.TrimPrefix(t, "- "), ":")
		if !ok {
			continue
		}
		v = strings.Trim(strings.TrimSpace(v), `"`)
		if item && k == "CarIdx" {
			flush()
			idx, team, uid, name = atoi(v), "", "", ""
			continue
		}
		switch k {
		case "TeamID":
			team = v
		case "UserID":
			uid = v
		case "UserName":
			name = v
		}
	}
	flush()
	fieldMu.Lock()
	defer fieldMu.Unlock()
	for idx, id := range who {
		if old, seen := fieldWho[idx]; seen && old != id {
			delete(fieldCars, idx)
		}
		fieldWho[idx] = id
	}
}

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

// telReader reads a fixed set of telemetry variables into buffers it keeps between calls, so a loop that runs 60
// times a second allocates nothing once warm: vals[k] holds the k-th variable's values (one for a scalar, one per
// car for an array), nil when the game does not send it. NaN and infinities read as 0, like the stream's values.
type telReader struct {
	names []string
	vals  [][]float64
	back  [][]float64
}

func newTelReader(names []string) *telReader {
	return &telReader{names: names, vals: make([][]float64, len(names)), back: make([][]float64, len(names))}
}

// read takes the newest frame; false when there is no telemetry yet
func (r *telReader) read() bool {
	tel.mu.RLock()
	defer tel.mu.RUnlock()
	buf := tel.buf
	for k, n := range r.names {
		r.vals[k] = nil
		if len(buf) == 0 {
			continue
		}
		i, ok := tel.index[n]
		if !ok {
			continue
		}
		v := tel.vars[i]
		sz := typeSize[v.typ]
		if v.typ == TypeChar || sz == 0 || v.Count <= 0 || v.offset+sz*v.Count > len(buf) {
			continue
		}
		if cap(r.back[k]) < v.Count {
			r.back[k] = make([]float64, v.Count)
		}
		dst := r.back[k][:v.Count]
		for j := range dst {
			o := v.offset + j*sz
			f := 0.0
			switch v.typ {
			case TypeBool:
				if buf[o] != 0 {
					f = 1
				}
			case TypeInt, TypeBitField:
				f = float64(le32(buf, o))
			case TypeFloat:
				f = float64(math.Float32frombits(binary.LittleEndian.Uint32(buf[o:])))
			case TypeDouble:
				f = math.Float64frombits(binary.LittleEndian.Uint64(buf[o:]))
			}
			if math.IsNaN(f) || math.IsInf(f, 0) {
				f = 0
			}
			dst[j] = f
		}
		r.vals[k] = dst
	}
	return len(buf) > 0
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

// fieldSample: one reading of the game's arrays, every car at one moment (nil when the game lacks the variable).
// iRacing gives every car's place on the lap, laps, times, pit road, surface, gear, revs and steering; Le Mans
// Ultimate adds its own verdict on the lap (CarIdxLapCountFlag), the exact moment each lap started, the car's
// pedals and its position, as the same made-up latitude and longitude the player's Lat/Lon use.
type fieldSample struct {
	t                                                                                      float64 // SessionTime
	wet                                                                                    float64 // TrackWetness (-1 unknown)
	rain                                                                                   float64 // it rains: Precipitation over 0 or WeatherDeclaredWet
	pct, lap, last, best, pit, surf, gear, rpm, steer, thr, brk, lat, lon, cnt, start, mat []float64
}

// the variables the watcher reads, in fieldSample's order, then SessionTime and SessionNum
var fieldVars = []string{"CarIdxLapDistPct", "CarIdxLap", "CarIdxLastLapTime", "CarIdxBestLapTime", "CarIdxOnPitRoad",
	"CarIdxTrackSurface", "CarIdxGear", "CarIdxRPM", "CarIdxSteer", "CarIdxThrottle", "CarIdxBrake", "CarIdxLat", "CarIdxLon",
	"CarIdxLapCountFlag", "CarIdxLapStartET", "SessionTime", "SessionNum", "CarIdxTrackSurfaceMaterial", "TrackWetness",
	"Precipitation", "WeatherDeclaredWet"}

// fat: a car's value in an array the game may not send (def then, or when the array is short)
func fat(a []float64, i int, def float64) float64 {
	if i < len(a) {
		return a[i]
	}
	return def
}

// fieldSession: a new session (another event, session number or track) starts the field afresh
func fieldSession(id string) {
	fieldMu.Lock()
	if id != fieldID {
		fieldID, fieldCars, fieldWho = id, map[int]*carLapProf{}, map[int]string{}
	}
	fieldMu.Unlock()
}

func fieldWatcher() {
	rd := newTelReader(fieldVars)
	var s fieldSample
	ft := newFieldText()
	for range time.Tick(16 * time.Millisecond) { // the game's own rate
		st := currentStatus()
		if !st.connected() || (st.Demo && !cloudDemo) {
			continue
		}
		if !rd.read() || rd.vals[15] == nil {
			continue
		}
		y, v := liveLapEnv{}.yaml()
		ft.update(y, v, int(fat(rd.vals[16], 0, 0)))
		s.pct, s.lap, s.last, s.best, s.pit, s.surf, s.gear, s.rpm = rd.vals[0], rd.vals[1], rd.vals[2], rd.vals[3], rd.vals[4], rd.vals[5], rd.vals[6], rd.vals[7]
		s.steer, s.thr, s.brk, s.lat, s.lon, s.cnt, s.start = rd.vals[8], rd.vals[9], rd.vals[10], rd.vals[11], rd.vals[12], rd.vals[13], rd.vals[14]
		s.t, s.mat, s.wet = rd.vals[15][0], rd.vals[17], fat(rd.vals[18], 0, -1)
		s.rain = max(fat(rd.vals[19], 0, 0), fat(rd.vals[20], 0, 0))
		fieldStep(&s, ft.L, ft.key)
	}
}

// fieldText: what the field watcher reads from the session text, read again only when the game rewrites it (its
// version) or the session number changes
type fieldText struct {
	ver, sn       int
	sub, trk, key string
	L             float64
}

func newFieldText() *fieldText { return &fieldText{ver: -1, sn: -1} }

// update takes the session text (y, its version v) and the session number n of this sample: another session starts
// the field again (fieldSession), and a new text says who is at every index, so a car whose index went to another car
// starts again (fieldDrivers, after fieldSession, which forgets who was where in a new session)
func (f *fieldText) update(y string, v, n int) {
	if v == f.ver && n == f.sn {
		return
	}
	text := v != f.ver
	if text {
		f.ver, f.sub, f.trk, f.L, f.key = v, yamlField(y, "SubSessionID"), yamlField(y, "TrackID"), trackLength(y), sessionKey(y)
	}
	f.sn = n
	fieldSession(fmt.Sprintf("%s-%d-%s", f.sub, n, f.trk))
	if text {
		fieldDrivers(y)
	}
}

// posOK: a position the game really gave (NaN read as 0; both 0 means none)
func posOK(lat, lon float64) bool { return lat != 0 || lon != 0 }

// fieldStep takes one sample of the field (every car) into the laps being built: the watcher calls it 60 times a
// second, the tests with their own streams. L is the track's length and key the session's, which names the origin
// of every path recorded in it (geoBase), so a rival's path and the player's share one frame.
func fieldStep(s *fieldSample, L float64, key string) {
	if L < 500 || s.pct == nil || s.lap == nil {
		return
	}
	t := s.t
	nb := int(L/fieldBin) + 1
	var org [2]float64
	hasOrg := false
	if s.lat != nil && s.lon != nil {
		for i := range s.lat {
			if posOK(s.lat[i], fat(s.lon, i, 0)) {
				org, hasOrg = geoBase(key, s.lat[i], s.lon[i]), true
				break
			}
		}
	}
	fieldMu.Lock()
	defer fieldMu.Unlock()
	for i, pct := range s.pct {
		if pct < 0 {
			continue
		}
		c := fieldCars[i]
		if c == nil {
			// the time the game shows now belongs to a lap before the car was seen: never the first lap's
			c = &carLapProf{lap: -1, prevLT: fat(s.last, i, 0)}
			fieldCars[i] = c
		}
		if lap := int(fat(s.lap, i, 0)); lap != c.lap {
			// the lap before is done: it waits for its time. The game's best as it stands now is the best before
			// that time is taken (when the game already took it, the two are equal and the best says nothing)
			c.endLap(t, fat(s.best, i, 0))
			c.lap, c.b, c.valid, c.offT, c.cntD, c.cntOK, c.pitD, c.wet, c.pit = lap, make([]fbin, nb), true, 0, -1, false, -1, 0, false // a lap through the pit lane counts too
		}
		if fat(s.pit, i, 0) > 0 {
			if !c.pit {
				c.pitD = pct * L
			}
			c.pit = true
		}
		if s.wet >= 4 { // lightly wet or more, on iRacing's scale (LMU's is turned into it)
			c.wet |= 2
		} else if s.wet >= 2 { // mostly dry or very lightly wet: damp
			c.wet |= 4
		}
		if s.rain > 0 { // raining (LMU's rain makes both variables)
			c.wet |= 1
		}
		c.settle(s, i, t)
		if c.pendS != nil && t-c.pendSAt > 2 {
			if lt := fat(s.last, i, 0); lt > 0 && math.Abs(c.pendS[0]+c.pendS[1]+c.pendS[2]-lt) < 0.02*lt {
				// the sectors add up to the lap time: keep them, scaled onto the official time
				k := lt / (c.pendS[0] + c.pendS[1] + c.pendS[2])
				c.lapsS = append(c.lapsS, lapSecs{time: lt, s: []float64{round(c.pendS[0]*k, 3), round(c.pendS[1]*k, 3), round(lt-round(c.pendS[0]*k, 3)-round(c.pendS[1]*k, 3), 3)}})
				if len(c.lapsS) > 300 {
					c.lapsS = c.lapsS[1:]
				}
			}
			c.pendS = nil
		}
		// the game's own moment the lap started (LMU): the line was crossed exactly then, no interpolation needed
		hasStart := s.start != nil
		if hasStart {
			if st := fat(s.start, i, 0); st > 0 && st != c.startET {
				if c.startET > 0 {
					c.crossed(st, t)
				} else {
					c.cross = [3]float64{st, 0, 0}
				}
				c.startET = st
			}
		}
		if c.lastT > 0 && t > c.lastT && t-c.lastT < 0.5 {
			d := pct - c.lastPct
			if d < -0.5 {
				d++
				if !hasStart { // the line, crossed between the two samples: the lap just finished has its sectors
					c.crossed(c.lastT+(t-c.lastT)*(1-c.lastPct)/d, t)
				}
			} else if d > 0 && d < 0.05 {
				for k, m := range [2]float64{1.0 / 3, 2.0 / 3} {
					if c.lastPct < m && pct >= m {
						c.cross[k+1] = c.lastT + (t-c.lastT)*(m-c.lastPct)/d
					}
				}
			}
			if d >= 0 && d < 0.05 {
				if b := int(pct * L / fieldBin); b >= 0 && b < len(c.b) {
					// the speed is how far the position moved since the game last moved it (the game updates another
					// car's place less often than it draws it): a frame that holds the position gives none
					sp := -1.0
					if d > 0 && c.moveT > 0 && t > c.moveT {
						sp = d * L / (t - c.moveT)
					}
					c.sample(&c.b[b], sp, s, i, org, hasOrg)
					// the bins it went through since the game last moved it take the same speed (their other columns
					// are filled between the bins seen, fieldTrace)
					if lb := int(c.lastPct * L / fieldBin); sp > 0 && b-lb > 1 && b-lb <= fieldFillBins {
						for k := max(0, lb+1); k < b; k++ {
							if c.b[k].v == 0 {
								c.b[k].v = float32(sp)
							}
						}
					}
				}
			}
			// what makes the lap not valid: off the track for a third of a second (all four wheels out, surface 0; -1
			// is a car not in the world; a kerb or paint under the car never counts, like yours, when the game says
			// the material), or the game's own word that the lap's time does not count, past its first 100 m, on a lap
			// that never touched the pit road (LMU's mCountLapFlag: 2 counts, 1 the lap only, 0 neither; an out-lap
			// or an in-lap is counted but not timed, and is valid here like yours). Judged when the lap ends: the flag
			// can drop a frame before the car is on the pit road, so a pit road reached within 200 m of it is the in-lap
			if fat(s.surf, i, 3) == 0 && (s.mat == nil || !pavedMaterial(int(fat(s.mat, i, 0)))) {
				if c.offT += t - c.lastT; c.offT >= fieldOffTime-1e-9 {
					c.valid = false
				}
			}
			// only a drop counts: the flag said this lap's time counts and then took it back (LMU's practice says
			// "lap, not time" for every lap, which says nothing of the driving)
			if cnt := fat(s.cnt, i, -1); cnt >= 2 && pct*L > 100 {
				c.cntOK = true
			} else if cnt >= 0 && cnt < 2 && c.cntOK && pct*L > 100 && !c.pit && c.cntD < 0 {
				c.cntD = pct * L
			}
		}
		if c.lastT == 0 || pct != c.lastPct {
			c.moveT = t
		}
		c.lastPct, c.lastT = pct, t
	}
}

// sample puts one reading into the bin the car is in: the speed its position gave (averaged with the bin's; none
// below 0, a jump at 120 m/s or more), the gear and the revs (the revs say nothing of the speed when the gear changed
// inside the bin), the steering averaged, and the pedals and the position when the game gives them. The averages
// weigh what the bin holds by its samples, which stop counting at 255 (a car stopped in the bin), so they never wrap.
func (c *carLapProf) sample(x *fbin, sp float64, s *fieldSample, i int, org [2]float64, hasOrg bool) {
	n, more := float32(x.n), x.n < 255
	if sp >= 0 && sp < 120 {
		if x.v == 0 {
			x.v = float32(sp)
		} else {
			x.v = (x.v + float32(sp)) / 2
		}
	}
	if s.gear != nil {
		g := int8(fat(s.gear, i, 0))
		if x.n > 0 && g != x.gear {
			x.rpm = -1
		}
		x.gear = g
	}
	if s.rpm != nil && x.rpm >= 0 {
		if r := float32(fat(s.rpm, i, 0)); r > 0 {
			if x.rpm == 0 {
				x.rpm = r
			} else {
				x.rpm = (x.rpm + r) / 2
			}
		}
	}
	if s.steer != nil && more {
		x.steer = (x.steer*n + float32(fat(s.steer, i, 0))) / (n + 1)
	}
	if s.thr != nil && s.brk != nil {
		if th, br := fat(s.thr, i, -1), fat(s.brk, i, -1); th >= 0 && br >= 0 {
			x.thr, x.brk, x.ped = float32(th), float32(br), true
		}
	}
	if hasOrg && s.lat != nil && s.lon != nil {
		if lat, lon := fat(s.lat, i, 0), fat(s.lon, i, 0); posOK(lat, lon) {
			// averaged over the bin's samples: where the car was around the bin's middle
			px, py := geoXY(org, lat, lon)
			if !x.pos {
				x.x, x.y = float32(px), float32(py)
			} else if more {
				x.x, x.y = (x.x*n+float32(px))/(n+1), (x.y*n+float32(py))/(n+1)
			}
			x.pos = true
			c.org, c.hasOrg = org, true
		}
	}
	if more {
		x.n++
	}
}

// crossed: the car crossed the line at session time at (seen at t): the lap just finished has its sectors when every
// mark of it was seen, and the new lap starts
func (c *carLapProf) crossed(at, t float64) {
	if c.cross[0] > 0 && c.cross[1] > c.cross[0] && c.cross[2] > c.cross[1] && at > c.cross[2] {
		c.pendS, c.pendSAt = []float64{c.cross[1] - c.cross[0], c.cross[2] - c.cross[1], at - c.cross[2]}, t
	}
	c.cross = [3]float64{at, 0, 0}
}

// endLap: the lap just driven waits for the game to time it (a moment after the line)
func (c *carLapProf) endLap(t, gameBest float64) {
	if c.lap < 0 || c.b == nil {
		return
	}
	c.pend, c.pendB, c.pendAt, c.pendBad, c.pendBest0, c.pendLT, c.pendWet = true, c.b, t, !c.valid || (c.cntD >= 0 && (c.pitD < 0 || c.pitD-c.cntD > 200)), gameBest, 0, c.wet
}

// settle: the lap just finished gets its time 2 s after the line (never the lap before's: a lap the game never times,
// LMU counting the lap but not its time, a tow or a reset in iRacing, is neither judged nor taken). A lap judged not
// valid while driven is noted as such; one faster than the game's best of the car before it waits 3 s more for the
// game's best to become its time, else the game did not accept it (not faster, or no best before, says nothing); the
// rest may become the car's best here.
func (c *carLapProf) settle(s *fieldSample, i int, t float64) {
	if !c.pend {
		return
	}
	if c.pendLT == 0 {
		if t-c.pendAt < 2 {
			return
		}
		lt, late := fat(s.last, i, 0), t-c.pendAt > 4
		if lt <= 0 || lt == c.prevLT {
			if late { // no time of its own after 4 s: the game shows the lap before's, or none
				c.drop()
			}
			return
		}
		c.pendLT, c.prevLT = lt, lt
		switch {
		case c.pendBad:
			c.noteBad(lt)
			c.drop()
		case c.pendBest0 > 0 && lt < c.pendBest0-0.0005:
			// the game's best is read again in a moment
		default:
			c.take(lt)
			c.drop()
		}
		return
	}
	if t-c.pendAt < 5 {
		return
	}
	if math.Abs(fat(s.best, i, 0)-c.pendLT) < 0.002 {
		c.take(c.pendLT)
	} else {
		c.noteBad(c.pendLT)
	}
	c.drop()
}

// take: a valid lap seen whole becomes the car's best when faster than the one kept
func (c *carLapProf) take(lt float64) {
	if c.pendB == nil || (c.best != 0 && lt >= c.best) {
		return
	}
	v := rpmSpeed(c.pendB)
	if len(v) >= 20 && coverage(v) > 0.85 {
		c.best, c.bestV, c.bestB, c.bestWet = lt, v, c.pendB, c.pendWet
	}
}

func (c *carLapProf) drop() { c.pend, c.pendB, c.pendLT = false, nil, 0 }

func (c *carLapProf) noteBad(lt float64) {
	c.badT = append(c.badT, lt)
	if len(c.badT) > 300 {
		c.badT = c.badT[1:]
	}
}

// rpmSpeed: the lap's speed every 10 m, cleaned with the engine's revs. The speed a rival's position gives is noisy
// (the game moves another car between the updates it receives of it, and a bin averages a handful of samples), while
// the revs in a fixed gear are proportional to the speed (the wheels turn with the road, times the gear's ratio), and
// come at the game's full rate. Per gear, the median of speed/revs over the lap's bins gives the ratio, and revs ×
// ratio is the bin's speed where the gear held through the bin; neutral or reverse, a gear changed inside the bin, a
// gear seen in too few bins, or revs that disagree with the position by more than 15 % (wheelspin, a locked wheel)
// keep the position's speed. A bin the position never filled takes the revs' speed. The result is still scaled onto
// the official lap time by fieldTrace.
func rpmSpeed(b []fbin) []float32 {
	const maxGear = 12
	out := make([]float32, len(b))
	var ratios [maxGear + 1][]float64
	for i, x := range b {
		out[i] = x.v
		if x.gear >= 1 && x.gear <= maxGear && x.rpm > 0 && x.v > 0 {
			ratios[x.gear] = append(ratios[x.gear], float64(x.v)/float64(x.rpm))
		}
	}
	var ratio [maxGear + 1]float64
	for g := 1; g <= maxGear; g++ {
		if r := ratios[g]; len(r) >= 5 {
			sort.Float64s(r)
			ratio[g] = r[len(r)/2]
		}
	}
	for i, x := range b {
		if x.gear < 1 || x.gear > maxGear || x.rpm <= 0 || ratio[x.gear] == 0 {
			continue
		}
		sp := float32(float64(x.rpm) * ratio[x.gear])
		if sp <= 0 || sp >= 120 || (x.v > 0 && math.Abs(float64(sp-x.v)) > 0.15*float64(x.v)) {
			continue
		}
		out[i] = sp
	}
	return out
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

// fillGaps: the points of a profile that were not seen (ok false) take the value between their neighbours (the ends,
// the nearest value); nil when nothing was seen
func fillGaps(v []float64, ok []bool) []float64 {
	n := len(v)
	out := make([]float64, n)
	last := -1
	for i := 0; i < n; i++ {
		if !ok[i] {
			continue
		}
		out[i] = v[i]
		if last < 0 {
			for k := 0; k < i; k++ {
				out[k] = v[i]
			}
		} else if i-last > 1 {
			for k := last + 1; k < i; k++ {
				out[k] = v[last] + (v[i]-v[last])*float64(k-last)/float64(i-last)
			}
		}
		last = i
	}
	if last < 0 {
		return nil
	}
	for k := last + 1; k < n; k++ {
		out[k] = v[last]
	}
	return out
}

// fieldTrace: a car's best lap as one of our traces, from what the game said of it every 10 m: speed and lap time
// every 5 m, scaled so they add up to the official lap time, the gear and the steering when the game gave them, and
// the pedals: the car's own when the game gave them for the lap (Le Mans Ultimate, marked "real"), else estimated
// from the speed (braking where it drops, full throttle where it rises or holds near the top; marked "field" so the
// apps say the pedals are estimates, and the server estimates them again from what that car really does). With the
// car's position for the lap, the path (X/Y) in the same frame as the player's own laps, with its origin (G). For
// the community: its model, leaderboard and comparisons.
func fieldTrace(carIdx int, lapTime float64) *lapTrace {
	fieldMu.Lock()
	c := fieldCars[carIdx]
	var raw []float32
	var bins []fbin
	var org [2]float64
	hasOrg, wet := false, uint8(0)
	if c != nil && c.bestV != nil && math.Abs(c.best-lapTime) < 0.002 {
		raw = append([]float32{}, c.bestV...)
		if len(c.bestB) == len(raw) {
			bins = append([]fbin{}, c.bestB...)
		}
		org, hasOrg, wet = c.org, c.hasOrg, c.bestWet
	}
	fieldMu.Unlock()
	if raw == nil || lapTime <= 0 || len(raw) < 20 || coverage(raw) < 0.85 {
		return nil
	}
	v := fillHoles(raw)
	n := len(v)
	// the other columns of the bins: known where seen, filled in between, and used when the lap had them
	var gear, steer, thr, brk, xs, ys []float64
	real, geo := false, false
	if bins != nil {
		gear, steer, thr, brk, xs, ys = make([]float64, n), make([]float64, n), make([]float64, n), make([]float64, n), make([]float64, n), make([]float64, n)
		seen, ped, pos := make([]bool, n), make([]bool, n), make([]bool, n)
		nSeen, nPed, nPos := 0, 0, 0
		for i, b := range bins {
			seen[i], ped[i], pos[i] = b.n > 0, b.ped, b.pos
			gear[i], steer[i], thr[i], brk[i], xs[i], ys[i] = float64(b.gear), float64(b.steer), float64(b.thr), float64(b.brk), float64(b.x), float64(b.y)
			if seen[i] {
				nSeen++
			}
			if ped[i] {
				nPed++
			}
			if pos[i] {
				nPos++
			}
		}
		if nSeen == 0 {
			gear, steer = nil, nil
		} else {
			steer = fillGaps(steer, seen)
			last := -1 // a gear is not interpolated: the nearest seen
			for i := range gear {
				if seen[i] {
					if last < 0 {
						for k := 0; k < i; k++ {
							gear[k] = gear[i]
						}
					}
					last = i
				} else if last >= 0 {
					gear[i] = gear[last]
				}
			}
		}
		// against the bins seen (a lap is taken from 85 % of them): the game gave the pedals, or the position, for the
		// lap. Pedals that never move (a telemetry slot the game leaves at 0, or held at one value) are no real pedals
		if real = nSeen > 0 && float64(nPed) >= 0.9*float64(nSeen); real {
			maxT, maxB := 0.0, 0.0
			for i := range thr {
				if ped[i] {
					maxT, maxB = math.Max(maxT, thr[i]), math.Max(maxB, brk[i])
				}
			}
			if real = maxT >= 0.5 && maxB >= 0.2; real {
				thr, brk = fillGaps(thr, ped), fillGaps(brk, ped)
			}
		}
		if geo = hasOrg && nSeen > 0 && float64(nPos) >= 0.9*float64(nSeen); geo {
			xs, ys = fillGaps(xs, pos), fillGaps(ys, pos)
		}
	}
	lerp := func(a []float64, j int, f float64) float64 {
		if j+1 < n {
			return a[j]*(1-f) + a[j+1]*f
		}
		return a[j]
	}
	// a bin's position is where the car was around its middle: the 5 m point at the middle takes it, the one at the
	// bin's start the mean with the bin before
	pathAt := func(a []float64, i int) float64 {
		j := i / 2
		if i%2 == 1 || j == 0 {
			return a[j]
		}
		return (a[j-1] + a[j]) / 2
	}
	sp := make([]float64, 0, 2*n)
	for i := 0; i < 2*n; i++ { // 5 m points between the 10 m bins
		sp = append(sp, math.Max(1, lerp(v, i/2, 0.5*float64(i%2))))
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
	tr := &lapTrace{Bin: lapBin, D: d, Src: "field"}
	if real {
		tr.Src = "real"
	}
	if wet&2 != 0 {
		tr.F = append(tr.F, "wet")
	} else if wet&4 != 0 { // informational only: the model keeps a damp lap
		tr.F = append(tr.F, "damp")
	}
	if wet&1 != 0 { // informational only: the model keeps a lap in the rain on a track not wet yet
		tr.F = append(tr.F, "rain")
	}
	if geo {
		tr.X, tr.Y, tr.G = make([]float64, len(sp)), make([]float64, len(sp)), []float64{org[0], org[1]}
	}
	t := 0.0
	for i, s := range sp {
		j, f := i/2, 0.5*float64(i%2)
		var th, br, g, st float64
		if real {
			th, br = round(lerp(thr, j, f), 3), round(lerp(brk, j, f), 3)
		} else {
			// the speed 20 m back and ahead says what the pedals were doing
			dv := sp[min(len(sp)-1, i+2)] - sp[max(0, i-2)]
			switch {
			case dv < -0.8:
				br = math.Min(1, -dv/6)
			case dv > 0.3 || s > 0.85*vmax:
				th = 1
			}
			br = round(br, 2)
		}
		if gear != nil {
			g, st = gear[j], round(lerp(steer, j, f), 3)
		}
		d[i] = [6]float64{round(s, 2), th, br, g, st, round(t, 3)}
		if geo {
			tr.X[i], tr.Y[i] = round(pathAt(xs, i), 1), round(pathAt(ys, i), 1)
		}
		t += float64(lapBin) / s
	}
	return tr
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
	var v []float64 // kept between samples, nothing in the loop holds on to it
	for range time.Tick(time.Second / 30) {
		st := currentStatus()
		if !st.connected() || (st.Demo && !cloudDemo) {
			continue
		}
		v = telNumsInto(v, vars)
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
