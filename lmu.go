package main

// Le Mans Ultimate: reads the game's own LMU_Data shared memory (LMU → Settings →
// Gameplay → Enable Plugins: ON, then restart the game; no plugin to install) and
// writes it into an iRacing-style memory image, so live screens, overlays,
// relative, standings, radar, fuel, tyres, lap analysis and race reports work the
// same as with iRacing. Layout: lmu_layout.go.

import (
	"encoding/binary"
	"fmt"
	"hash/fnv"
	"log"
	"math"
	"path/filepath"
	"regexp"
	"sort"
	"strings"
	"sync"
	"time"
)

const lmuCars = 64 // iRacing-style arrays hold 64 cars

// lmuFuelKgPerLtr: LMU counts fuel in litres and iRacing's FuelUsePerHour is kg/h, so the
// rate goes out with this density and the session says it (DriverCarFuelKgPerLtr) for the way back
const lmuFuelKgPerLtr = 0.75

// Contacts stand in for incidents (LMU has no incident count). The recorder names each incident by the points it adds, as
// iRacing does (1x Off Track, which alone makes the lap not valid; 2x Loss of Control; 4x Car Contact; 0x Light Contact), so
// a strong impact adds lmuImpactPoints and a light one nothing: a touch never reads as an Off Track. The game's
// mLastImpactMagnitude has no documented unit (its header says only "magnitude of last impact"): a rub along a wall or a
// wheel-to-wheel touch stays in the low hundreds and a crash reaches the thousands, so the line is kept high and only an
// unmistakable contact counts.
const (
	lmuImpactStrong = 1000.0
	lmuImpactPoints = 4
)

// the start bits of SessionFlags (irsdk_Flags)
const (
	lmuStartHidden = 0x10000000
	lmuStartReady  = 0x20000000
	lmuStartSet    = 0x40000000
	lmuStartGo     = 0x80000000
)

// the variables LMU fills: the demo's (the same names iRacing uses) plus a few more
func lmuVarDefs() []demoVar {
	extra := []demoVar{
		{name: "Lat", desc: "Latitude in decimal degrees", unit: "deg", typ: TypeDouble},
		{name: "Lon", desc: "Longitude in decimal degrees", unit: "deg", typ: TypeDouble},
		{name: "EnergyERSBatteryPct", desc: "Engine ERS battery charge", unit: "%", typ: TypeFloat},
		{name: "PlayerCarDriverIncidentCount", desc: "Team incident count for this session", typ: TypeInt},
		{name: "dcTractionControl", desc: "In car traction control setting", typ: TypeFloat},
		{name: "dcTractionControlMax", desc: "Highest traction control setting of this car", typ: TypeFloat},
		{name: "dcABS", desc: "In car abs setting", typ: TypeFloat},
		{name: "dcABSMax", desc: "Highest abs setting of this car", typ: TypeFloat},
		{name: "dcEngineMap", desc: "Engine / motor map", typ: TypeFloat},
		{name: "dcEngineMapMax", desc: "Highest engine map of this car", typ: TypeFloat},
		{name: "dcBrakeBias", desc: "In car brake bias (front)", unit: "%", typ: TypeFloat},
		{name: "VirtualEnergyPct", desc: "Virtual energy left (Le Mans Ultimate)", unit: "%", typ: TypeFloat},
		{name: "WindVel", desc: "Wind velocity at start/finish line", unit: "m/s", typ: TypeFloat},
		{name: "WindDir", desc: "Wind direction at start/finish line", unit: "rad", typ: TypeFloat},
		// the game's own verdict on the lap under way: 2 the lap and its time count, 1 the lap only, 0 neither
		{name: "LapCountFlag", desc: "Whether the game counts this lap and its time (Le Mans Ultimate)", typ: TypeInt},
	}
	for _, c := range []string{"LF", "RF", "LR", "RR"} {
		extra = append(extra, demoVar{name: c + "pressure", desc: c + " tire pressure", unit: "kPa", typ: TypeFloat},
			demoVar{name: c + "brakeTemp", desc: c + " brake temperature", unit: "C", typ: TypeFloat})
	}
	extra = append(extra, lmuFieldVars()...)
	seen := map[string]bool{}
	var out []demoVar
	for _, v := range append(append([]demoVar{}, demoVarDefs...), extra...) {
		if !seen[v.name] {
			seen[v.name] = true
			v.offset = 0
			out = append(out, v)
		}
	}
	return out
}

// lmuFieldVars: what LMU gives beyond iRacing's variables, for every car (the field's own telemetry) and for the player.
// iRacing has none of them, so their readers (field.go, cloud.go) take their absence for "unknown".
func lmuFieldVars() []demoVar {
	return []demoVar{
		{name: "CarIdxSteer", desc: "Steering wheel angle by car index", unit: "rad", typ: TypeFloat, count: lmuCars},
		{name: "CarIdxBestLapNum", desc: "Cars best lap number", typ: TypeInt, count: lmuCars},
		// the game's own verdict on each car's lap under way: 2 the lap and its time count, 1 the lap only, 0 neither, -1 no car
		{name: "CarIdxLapCountFlag", desc: "Whether the game counts the cars lap and its time", typ: TypeInt, count: lmuCars},
		{name: "CarIdxLapStartET", desc: "Session time the cars current lap started", unit: "s", typ: TypeFloat, count: lmuCars},
		// every car's position in the player's made-up latitude/longitude, so a rival's path and the player's share one frame
		{name: "CarIdxLat", desc: "Latitude by car index", unit: "deg", typ: TypeDouble, count: lmuCars},
		{name: "CarIdxLon", desc: "Longitude by car index", unit: "deg", typ: TypeDouble, count: lmuCars},
		// a car's own pedals when the game gives its telemetry (a rival's lap then carries real pedals), -1 when it does not
		{name: "CarIdxThrottle", desc: "Throttle by car index, -1 unknown", unit: "%", typ: TypeFloat, count: lmuCars},
		{name: "CarIdxBrake", desc: "Brake by car index, -1 unknown", unit: "%", typ: TypeFloat, count: lmuCars},
		{name: "PlayerNumPenalties", desc: "Penalties outstanding against the player", typ: TypeInt},
		{name: "PlayerTrackSurfaceMaterial", desc: "Players car track surface material type", unit: "irsdk_TrkSurf", typ: TypeInt},
	}
}

// lmuCarMem is what the source remembers of a car between frames, by the game's vehicle id
type lmuCarMem struct {
	best float64 // mBestLapTime the frame before
	num  int     // the lap that set it, -1 unknown
}

type lmuSource struct {
	mu         sync.Mutex
	view       lmuView
	img        *irImage
	snap       []byte
	stop       chan struct{}
	sessHead   lmuSessHead  // what the session text was last built from (writeSession), compared field by field
	sessCars   []lmuSessCar // so a frame where nothing changed builds no string
	sessBuilt  bool
	impactET   float64
	impactSeen bool // impactET holds a value read from the game (the impact before the program watched, or none)
	impacts    int
	carMem     map[int]lmuCarMem
	idxByID    map[int]int     // each car's index in the image's arrays this session, by the game's vehicle id (carIdx)
	idxSeen    map[int]float64 // the session clock each of those cars was last in the game's list
	telSeen    [2]int          // the cars and how many had telemetry when the log last said so (zero: not yet)
	telLogET   float64         // the session clock then
	sessNum    int
	phase      int     // the game phase of the frame before
	goET       float64 // the session clock when the race went green, 0 none
	sec        lmuSectors
	secStore   map[string][3]float64 // the learned sector starts of every track, kept in secPath
	secPath    string                // "" in tests: nothing is written
	fuel       lmuFuel
	onTrack    bool // the game in its realtime (driving, or in the car in the garage): its REST API is left alone (lmurest.go)
}

func newLMUSource() Source { return &lmuSource{} }

func (s *lmuSource) Name() string { return "lmu" }

func (s *lmuSource) Open() error {
	v, err := openLMUView()
	if err != nil {
		return err
	}
	s.view = v
	s.img = newIRImage(lmuVarDefs())
	s.snap = make([]byte, lmuDataSize)
	s.stop = make(chan struct{})
	s.secPath = filepath.Join(dataDir(), "lmu-sectors.json")
	readJSON(s.secPath, &s.secStore)
	if !s.update() {
		// the mapping exists but holds nothing yet (menus): still connected to the game
		s.img.setConnected(false)
	}
	go s.run()
	lmuRestOpened() // the game's own API (lmurest.go): its ratings, read only in the menus
	return nil
}

func (s *lmuSource) run() {
	t := time.NewTicker(16 * time.Millisecond)
	defer t.Stop()
	for {
		select {
		case <-s.stop:
			return
		case <-t.C:
			s.update()
		}
	}
}

func (s *lmuSource) Mem() []byte { return s.img.mem }

// Alive: the game's program still runs, so in its menus the source stays open instead of closing and opening the
// mapping every 10 s (a game closed and started again is a new program: the source closes and finds the new mapping)
func (s *lmuSource) Alive() bool { return lmuRunning() }

func lmuRunning() bool {
	r := runningProcs()
	return r["le mans ultimate.exe"] || r["lemansultimate.exe"]
}

func (s *lmuSource) Wait(d time.Duration) { time.Sleep(d / 2) }

func (s *lmuSource) Close() {
	if s.stop != nil {
		close(s.stop)
		s.stop = nil
		lmuRestClosed()
	}
	s.mu.Lock()
	if s.view != nil {
		s.view.Close()
		s.view = nil
	}
	s.mu.Unlock()
}

// ---------- reading the mapping ----------

func lf64(b []byte, o int) float64 { return math.Float64frombits(binary.LittleEndian.Uint64(b[o:])) }
func lf32(b []byte, o int) float64 {
	return float64(math.Float32frombits(binary.LittleEndian.Uint32(b[o:])))
}
func li32(b []byte, o int) int { return int(int32(binary.LittleEndian.Uint32(b[o:]))) }
func li16(b []byte, o int) int { return int(int16(binary.LittleEndian.Uint16(b[o:]))) }
func lu16(b []byte, o int) int { return int(binary.LittleEndian.Uint16(b[o:])) }
func lu8(b []byte, o int) int  { return int(b[o]) }
func lstr(b []byte, o, n int) string {
	s := b[o : o+n]
	if i := indexByte(s, 0); i >= 0 {
		s = s[:i]
	}
	return strings.ToValidUTF8(strings.TrimSpace(string(s)), "")
}

type lmuVec struct{ x, y, z float64 }

func lvec(b []byte, o int) lmuVec { return lmuVec{lf64(b, o), lf64(b, o+8), lf64(b, o+16)} }

// update copies the mapping (re-reading if the game wrote during the copy) and
// converts it. It returns false when there is no session to show.
func (s *lmuSource) update() bool {
	s.mu.Lock()
	defer s.mu.Unlock()
	if s.view == nil {
		return false
	}
	live := s.view.Bytes()
	if len(live) < lmuDataSize {
		return false
	}
	for try := 0; try < 3; try++ {
		et := lf64(live, lmuOffScoring+si_mCurrentET)
		copy(s.snap, live[:lmuDataSize])
		if lf64(live, lmuOffScoring+si_mCurrentET) == et {
			break
		}
	}
	return s.convert(s.snap)
}

type lmuCar struct {
	slot, idx                 int
	id                        int
	name, vehicle, class, num string
	place, classPlace, laps   int
	lapDist, est, behind      float64
	last, best                float64
	inPits, garage, player    bool
	control                   int
	sector                    int // rF2's mSector: 0 = sector 3, 1 = sector 1, 2 = sector 2
	tel                       int // telemetry slot, -1 if none
	pos                       lmuVec
	countFlag, penalties      int     // mCountLapFlag (2 lap and time count, 1 lap only, 0 neither), mNumPenalties
	lapStart                  float64 // when this lap started (mLapStartET)
	finish                    int     // mFinishStatus: 0 none, 1 finished, 2 DNF, 3 disqualified
}

// lmuSessHead and lmuSessCar: what the session text says, so writeSession rebuilds it only when one of them changes
type lmuSessHead struct {
	track                  string
	session, player, plTel int
	known                  [3]float64
}

type lmuSessCar struct {
	idx, laps, finish    int
	best                 float64
	name, vehicle, class string
}

// lmuSectors learns where the official sectors start from the player's mSector. rF2 and LMU number the
// sector a car is in 0 = sector 3, 1 = sector 1, 2 = sector 2 (SharedMemoryInterface.hpp says so, "don't
// ask why"), so a lap runs 1 → 2 → 0 and the two starts to learn are those of sectors 2 and 3, as fractions
// of the lap; sector 1 starts at the line. A start counts once two laps put it in the same place (within
// 25 m), so one glitch never moves it, and once known it stays.
type lmuSectors struct {
	track   string
	has     bool // last and lastPct hold the frame before
	last    int
	lastPct float64
	seen    [3][]float64 // where each start was seen, lap by lap, until two agree
	known   [3]float64   // the confirmed starts (index 1 and 2), 0 none
}

// note takes one frame of the player's car and says whether the three starts just became known
func (x *lmuSectors) note(sector int, pct, trackLen float64, onTrack bool) bool {
	if !onTrack || sector < 0 || sector > 2 {
		x.has = false
		return false
	}
	prev, lp, had := x.last, x.lastPct, x.has
	x.has, x.last, x.lastPct = true, sector, pct
	if !had || sector == prev {
		return false
	}
	idx := 0
	switch {
	case prev == 1 && sector == 2:
		idx = 1
	case prev == 2 && sector == 0:
		idx = 2
	default: // the line (0 → 1) is 0 by definition; anything else is a reset or a glitch
		return false
	}
	// the car crossed it between the two frames: a jump (a tow, a reset) teaches nothing
	if d := (pct - lp) * trackLen; d <= 0 || d > 100 {
		return false
	}
	at := (lp + pct) / 2
	if x.known[idx] > 0 || at <= 0 || at >= 1 {
		return false
	}
	for _, seen := range x.seen[idx] {
		if math.Abs(seen-at)*trackLen <= 25 {
			x.known[idx] = (seen + at) / 2
		}
	}
	if x.known[idx] == 0 {
		if x.seen[idx] = append(x.seen[idx], at); len(x.seen[idx]) > 5 {
			x.seen[idx] = x.seen[idx][1:]
		}
		return false
	}
	if x.known[1] > 0 && x.known[2] > 0 {
		if x.known[1] < x.known[2] {
			return true
		}
		x.known, x.seen = [3]float64{}, [3][]float64{} // out of order: start again
	}
	return false
}

// lmuFuel makes FuelUsePerHour, which LMU does not give: the fuel going down while the car runs on the
// track, counted over ten-second stretches and smoothed over about a lap
type lmuFuel struct {
	has           bool
	et, level     float64 // the telemetry clock and the litres of the frame before
	accUsed, accT float64 // the stretch being counted
	rate          float64 // litres an hour
}

// note takes one frame: the telemetry's own clock (mElapsedTime) and fuel, the speed, whether the car is in
// the pits or the garage and the lap time to smooth over (0 when unknown)
func (f *lmuFuel) note(et, level, speed, lap float64, pits bool) {
	dt := et - f.et
	if f.has && dt == 0 { // the game has not written since
		return
	}
	last, had := f.level, f.has
	f.has, f.et, f.level = true, et, level
	if !had || dt < 0 || dt > 2 || pits || speed < 5 { // a pause, a reset, the pits: start the stretch again
		f.accUsed, f.accT = 0, 0
		return
	}
	used := last - level
	if used < 0 || used > 1 { // refuelled, or a new car
		f.accUsed, f.accT = 0, 0
		return
	}
	f.accUsed += used
	f.accT += dt
	if f.accT < 10 {
		return
	}
	inst := f.accUsed / f.accT * 3600
	tau := 90.0
	if lap > 0 {
		tau = lap
	}
	if f.rate <= 0 {
		f.rate = inst
	} else {
		f.rate += math.Min(1, f.accT/tau) * (inst - f.rate)
	}
	f.accUsed, f.accT = 0, 0
}

var lmuNumRe = regexp.MustCompile(`#\s*(\d{1,3})`)

// lmuDriverID: a stable id for a driver of Le Mans Ultimate, from the name the game shows (the game gives no id):
// the same driver takes the same id in every session, two drivers never the same one in practice, and far above
// iRacing's ids, so their rivals never meet on the server (driverKey hashes it as "pitlanehq-other|<id>")
func lmuDriverID(name string) int {
	if strings.TrimSpace(name) == "" {
		return 0
	}
	return lmuHash("driver|"+strings.TrimSpace(name), 1_000_000_000, 1_000_000_000)
}

func lmuPlayerName(cars []lmuCar, player int) string {
	if player < 0 || player >= len(cars) {
		return ""
	}
	return cars[player].name
}

func lmuHash(s string, base, span uint32) int {
	h := fnv.New32a()
	h.Write([]byte(strings.ToLower(s)))
	return int(base + h.Sum32()%span)
}

// convert turns one LMU_Data snapshot into the iRacing-style image.
func (s *lmuSource) convert(b []byte) bool {
	si := lmuOffScoring
	n := li32(b, si+si_mNumVehicles)
	trackLen := lf64(b, si+si_mLapDist)
	if n <= 0 || n > lmuMaxVehicles || trackLen <= 0 {
		s.onTrack = false
		lmuRestNote(false, false, li32(b, lmuOffGameVer))
		s.img.setConnected(false)
		return false
	}
	et := lf64(b, si+si_mCurrentET)
	session := li32(b, si+si_mSession)
	phase := lu8(b, si+si_mGamePhase)
	track := lstr(b, si+si_mTrackName, 64)

	// telemetry slots by vehicle id
	active := lu8(b, lmuOffActive)
	if active > lmuMaxVehicles {
		active = lmuMaxVehicles
	}
	telByID := map[int]int{}
	for t := 0; t < active; t++ {
		telByID[li32(b, lmuOffTelem+t*lmuTelSize+vt_mID)] = t
	}
	playerTel := -1
	if lu8(b, lmuOffPlayerHas) != 0 {
		playerTel = lu8(b, lmuOffPlayerIdx)
	}

	if session != s.sessNum || s.idxByID == nil { // another session: the indexes start again (writeSession forgets the bests)
		s.idxByID, s.idxSeen = map[int]int{}, map[int]float64{}
	}
	cars := make([]lmuCar, 0, n)
	player := -1 // the player's place in cars (cars[player].idx is their index in the image)
	for i := 0; i < n; i++ {
		o := lmuOffVehScoring + i*lmuVehScSize
		id := li32(b, o+vs_mID)
		idx := s.carIdx(id, et)
		if idx < 0 {
			continue
		}
		c := lmuCar{slot: i, idx: idx, id: id, name: lstr(b, o+vs_mDriverName, 32), vehicle: lstr(b, o+vs_mVehicleName, 64),
			class: lstr(b, o+vs_mVehicleClass, 32), place: lu8(b, o+vs_mPlace), laps: li16(b, o+vs_mTotalLaps), lapDist: lf64(b, o+vs_mLapDist),
			est: lf64(b, o+vs_mTimeIntoLap), behind: lf64(b, o+vs_mTimeBehindLeader), last: lf64(b, o+vs_mLastLapTime), best: lf64(b, o+vs_mBestLapTime),
			inPits: lu8(b, o+vs_mInPits) != 0, garage: lu8(b, o+vs_mInGarageStall) != 0, player: lu8(b, o+vs_mIsPlayer) != 0,
			control: int(int8(b[o+vs_mControl])), sector: lu8(b, o+vs_mSector), pos: lvec(b, o+vs_mPos), tel: -1}
		if t, ok := telByID[c.id]; ok {
			c.tel = t
		}
		c.countFlag, c.penalties = lu8(b, o+vs_mCountLapFlag), lu16(b, o+vs_mNumPenalties) // an unsigned short
		c.lapStart, c.finish = lf64(b, o+vs_mLapStartET), lu8(b, o+vs_mFinishStatus)
		if m := lmuNumRe.FindStringSubmatch(c.vehicle); m != nil {
			c.num = m[1]
		} else {
			c.num = fmt.Sprint(c.idx + 1)
		}
		if c.player {
			player = len(cars)
			if playerTel < 0 {
				playerTel = c.tel
			}
		}
		cars = append(cars, c)
	}
	// class positions
	byClass := map[string][]int{}
	for i, c := range cars {
		byClass[c.class] = append(byClass[c.class], i)
	}
	for _, list := range byClass {
		sort.Slice(list, func(a, b int) bool { return cars[list[a]].place < cars[list[b]].place })
		for k, i := range list {
			cars[i].classPlace = k + 1
		}
	}

	inReal := lu8(b, si+si_mInRealtime) != 0
	s.onTrack = inReal
	lmuRestNote(true, inReal, li32(b, lmuOffGameVer))
	if track != s.sec.track { // another track: its sectors from the file, or none yet
		s.sec = lmuSectors{track: track, known: s.secStore[track]}
	}
	if player >= 0 {
		p := cars[player]
		if s.sec.note(p.sector, math.Mod(math.Max(0, p.lapDist)/trackLen, 1), trackLen, inReal && !p.inPits && !p.garage) {
			if s.secStore == nil {
				s.secStore = map[string][3]float64{}
			}
			s.secStore[track] = s.sec.known
			if s.secPath != "" {
				writeJSONFile(s.secPath, s.secStore)
			}
		}
	}
	s.writeSession(b, cars, player, playerTel, track, trackLen, session)
	s.noteTelemetry(cars, et)

	m := s.img
	m.begin()
	m.set("SessionTime", et)
	m.set("SessionTick", float64(m.tick+1))
	m.set("SessionNum", float64(session))
	m.set("SessionState", float64(lmuSessionState(phase)))
	remain := lf32(b, si+si_mSessionTimeRemaining)
	if remain <= 0 {
		remain = math.Max(0, lf64(b, si+si_mEndET)-et)
	}
	m.set("SessionTimeRemain", remain)
	maxLaps := li32(b, si+si_mMaxLaps)
	if maxLaps > 0 && maxLaps < 10000 {
		m.set("SessionLapsTotal", float64(maxLaps))
		lead := 0
		for _, c := range cars {
			if c.place == 1 {
				lead = c.laps
			}
		}
		m.set("SessionLapsRemainEx", float64(max(0, maxLaps-lead)))
	} else {
		m.set("SessionLapsTotal", 32767)
		m.set("SessionLapsRemainEx", 32767)
	}
	m.set("SessionTimeOfDay", lf32(b, si+si_mTimeOfDay))
	m.set("AirTemp", lf64(b, si+si_mAmbientTemp))
	m.set("TrackTempCrew", lf64(b, si+si_mTrackTemp))
	rain := lf64(b, si+si_mRaining)
	m.set("Precipitation", rain)
	m.setBool("WeatherDeclaredWet", rain > 0)
	m.set("TrackWetness", float64(lmuWetness(lf64(b, si+si_mAvgPathWetness))))
	// the wind blows along mWind (m/s, the world's axes: the game's frame is left-handed, north = -z and east = -x,
	// as the map's Lat/Lon); WindDir is where it comes from, clockwise from north, the sense YawNorth has, so
	// the weather overlay draws it against the car
	wind := lvec(b, si+si_mWind)
	m.set("WindVel", math.Hypot(wind.x, wind.z))
	if wind.x != 0 || wind.z != 0 {
		m.set("WindDir", math.Mod(math.Atan2(wind.x, wind.z)+2*math.Pi, 2*math.Pi))
	}

	if et < s.goET { // the session's clock started again (another session, a restart): no old "go"
		s.goET = 0
	}
	if phase == 5 && (s.phase == 3 || s.phase == 4) { // the race has just gone green
		s.goET = et
	}
	s.phase = phase
	flags := 0
	switch phase {
	case 5:
		flags |= 0x4 // green
	case 6:
		flags |= 0x4000 | 0x8 // full course yellow: caution
	case 7:
		flags |= 0x10 // red
	case 8:
		flags |= 0x1 // checkered
	}
	for k := 0; k < 3; k++ {
		if int8(b[si+si_mSectorFlag+k]) > 0 && phase == 5 {
			flags |= 0x8 // local yellow
		}
	}
	flags |= lmuStartFlags(phase, lu8(b, si+si_mStartLight), lu8(b, si+si_mNumRedLights), s.goET > 0 && et-s.goET < 4)

	for _, c := range cars {
		i := c.idx
		pct := c.lapDist / trackLen
		if pct < 0 {
			pct = 0
		}
		pct = math.Mod(pct, 1)
		m.setAt("CarIdxLap", i, float64(c.laps+1))
		m.setAt("CarIdxLapCompleted", i, float64(c.laps))
		m.setAt("CarIdxLapDistPct", i, pct)
		m.setAt("CarIdxPosition", i, float64(c.place))
		m.setAt("CarIdxClassPosition", i, float64(c.classPlace))
		m.setAt("CarIdxEstTime", i, c.est)
		m.setAt("CarIdxF2Time", i, c.behind)
		m.setAt("CarIdxLastLapTime", i, lmuTime(c.last))
		m.setAt("CarIdxBestLapTime", i, lmuTime(c.best))
		bestNum := s.bestLapNum(c.id, c.best, c.laps)
		m.setAt("CarIdxBestLapNum", i, float64(bestNum))
		if c.player {
			m.set("LapBestLap", float64(max(0, bestNum)))
		}
		m.setAt("CarIdxOnPitRoad", i, b2f(c.inPits))
		m.setAt("CarIdxLapCountFlag", i, float64(c.countFlag))
		m.setAt("CarIdxLapStartET", i, c.lapStart)
		lat, lon := lmuLatLon(c.pos)
		m.setAt("CarIdxLat", i, lat)
		m.setAt("CarIdxLon", i, lon)
		throttle, brake := -1.0, -1.0 // unknown without the car's telemetry
		surf := 3
		if c.garage {
			surf = 1
		} else if c.inPits {
			surf = 2
		}
		if c.tel >= 0 {
			to := lmuOffTelem + c.tel*lmuTelSize
			m.setAt("CarIdxGear", i, float64(li32(b, to+vt_mGear)))
			m.setAt("CarIdxRPM", i, lf64(b, to+vt_mEngineRPM))
			m.setAt("CarIdxTireCompound", i, float64(lu8(b, to+vt_mFrontTireCompoundIndex)))
			m.setAt("CarIdxSteer", i, lmuSteer(lf64(b, to+vt_mUnfilteredSteering), lf32(b, to+vt_mPhysicalSteeringWheelRange)))
			throttle, brake = lf64(b, to+vt_mFilteredThrottle), lf64(b, to+vt_mFilteredBrake)
			if off, _ := lmuWheelSurface(b, to); surf == 3 && off == 4 {
				surf = 0 // off the track: all four wheels out
			}
		}
		m.setAt("CarIdxTrackSurface", i, float64(surf))
		m.setAt("CarIdxThrottle", i, throttle)
		m.setAt("CarIdxBrake", i, brake)
	}
	// the slots with no car (never taken, or whose car left): not in the world
	var used [lmuCars]bool
	for _, c := range cars {
		used[c.idx] = true
	}
	for i := 0; i < lmuCars; i++ {
		if used[i] {
			continue
		}
		m.setAt("CarIdxLapDistPct", i, -1)
		m.setAt("CarIdxTrackSurface", i, -1)
		m.setAt("CarIdxBestLapNum", i, -1)
		m.setAt("CarIdxLapCountFlag", i, -1)
		m.setAt("CarIdxThrottle", i, -1)
		m.setAt("CarIdxBrake", i, -1)
	}

	connected := player >= 0 && playerTel >= 0 && inReal
	if player >= 0 {
		p := cars[player]
		m.set("PlayerCarIdx", float64(p.idx))
		m.set("PlayerCarPosition", float64(p.place))
		m.set("PlayerCarClassPosition", float64(p.classPlace))
		m.setBool("OnPitRoad", p.inPits)
		m.set("Lap", float64(p.laps+1))
		m.set("LapCompleted", float64(p.laps))
		m.set("LapDist", math.Max(0, p.lapDist))
		m.set("LapDistPct", math.Mod(math.Max(0, p.lapDist)/trackLen, 1))
		po := lmuOffVehScoring + p.slot*lmuVehScSize
		m.set("LapCurrentLapTime", math.Max(0, et-lf64(b, po+vs_mLapStartET)))
		m.set("LapLastLapTime", lmuTime(p.last))
		m.set("LapBestLapTime", lmuTime(p.best))
		m.set("LapCountFlag", float64(lu8(b, po+vs_mCountLapFlag)))
		if fl := lu8(b, po+vs_mFlag); fl == 6 {
			flags |= 0x20 // blue
		}
		if lu8(b, po+vs_mUnderYellow) != 0 {
			flags |= 0x8
		}
		m.set("PlayerNumPenalties", float64(p.penalties))
	}
	m.set("SessionFlags", float64(int32(uint32(flags)))) // through int32, so the start bits (the top ones) keep their pattern

	if connected {
		to := lmuOffTelem + playerTel*lmuTelSize
		s.playerTelemetry(b, to, cars, player)
	}
	m.setBool("IsOnTrack", connected && player >= 0 && !cars[player].garage)
	m.commit()
	m.setConnected(true)
	return true
}

func (s *lmuSource) playerTelemetry(b []byte, to int, cars []lmuCar, player int) {
	m := s.img
	vel := lvec(b, to+vt_mLocalVel)
	acc := lvec(b, to+vt_mLocalAccel)
	rot := lvec(b, to+vt_mLocalRot)
	m.set("Speed", math.Sqrt(vel.x*vel.x+vel.y*vel.y+vel.z*vel.z))
	// rF2 local axes: +x left, +y up, +z back. iRacing: X forward, Y left.
	m.set("VelocityX", -vel.z)
	m.set("VelocityY", vel.x)
	m.set("LongAccel", -acc.z)
	m.set("LatAccel", acc.x)
	m.set("YawRate", rot.y)
	rpm, maxRPM := lf64(b, to+vt_mEngineRPM), lf64(b, to+vt_mEngineMaxRPM)
	m.set("RPM", rpm)
	m.set("Gear", float64(li32(b, to+vt_mGear)))
	m.set("Throttle", lf64(b, to+vt_mFilteredThrottle))
	m.set("Brake", lf64(b, to+vt_mFilteredBrake))
	m.set("Clutch", 1-lf64(b, to+vt_mFilteredClutch)) // iRacing: 1 = fully engaged
	m.set("SteeringWheelAngle", lmuSteer(lf64(b, to+vt_mUnfilteredSteering), lf32(b, to+vt_mPhysicalSteeringWheelRange)))
	fuel, capa := lf64(b, to+vt_mFuel), lf64(b, to+vt_mFuelCapacity)
	m.set("FuelLevel", fuel)
	if capa > 0 {
		m.set("FuelLevelPct", fuel/capa)
	}
	if player >= 0 {
		p := cars[player]
		s.fuel.note(lf64(b, to+vt_mElapsedTime), fuel, math.Hypot(vel.x, vel.z), lmuTime(p.last), p.inPits || p.garage)
	}
	if s.fuel.rate > 0 {
		m.set("FuelUsePerHour", s.fuel.rate*lmuFuelKgPerLtr)
	}
	m.set("WaterTemp", lf64(b, to+vt_mEngineWaterTemp))
	m.set("OilTemp", lf64(b, to+vt_mEngineOilTemp))
	m.set("LapDeltaToBestLap", lf64(b, to+vt_mDeltaBest))
	m.setBool("LapDeltaToBestLap_OK", player >= 0 && cars[player].best > 0)
	m.setBool("BrakeABSactive", lu8(b, to+vt_mABSActive) != 0)
	m.set("EnergyERSBatteryPct", lf64(b, to+vt_mBatteryChargeFraction))
	m.set("PlayerTireCompound", float64(lu8(b, to+vt_mFrontTireCompoundIndex)))
	// the car's electronics and energy, as LMU shows them in the cockpit
	if mx := lu8(b, to+vt_mTCMax); mx > 0 {
		m.set("dcTractionControl", float64(lu8(b, to+vt_mTC)))
		m.set("dcTractionControlMax", float64(mx))
	}
	if mx := lu8(b, to+vt_mABSMax); mx > 0 {
		m.set("dcABS", float64(lu8(b, to+vt_mABS)))
		m.set("dcABSMax", float64(mx))
	}
	if mx := lu8(b, to+vt_mMotorMapMax); mx > 0 {
		m.set("dcEngineMap", float64(lu8(b, to+vt_mMotorMap)))
		m.set("dcEngineMapMax", float64(mx))
	}
	if rb := lf64(b, to+vt_mRearBrakeBias); rb > 0 && rb < 1 {
		m.set("dcBrakeBias", (1-rb)*100)
	}
	if ve := lf32(b, to+vt_mVirtualEnergy); ve > 0 {
		m.set("VirtualEnergyPct", ve)
	}
	warn := 0
	if lu8(b, to+vt_mOverheating) != 0 {
		warn |= 0x01
	}
	if lu8(b, to+vt_mSpeedLimiter) != 0 {
		warn |= 0x10
	}
	if maxRPM > 0 && rpm >= maxRPM*0.995 {
		warn |= 0x20
	}
	m.set("EngineWarnings", float64(warn))
	drs := 0
	switch lu8(b, to+vt_mRearFlapLegalStatus) {
	case 1:
		drs = 1
	case 2:
		drs = 2
	}
	if lu8(b, to+vt_mRearFlapActivated) != 0 {
		drs = 3
	}
	m.set("DRS_Status", float64(drs))

	// contacts stand in for incidents (lmuImpactStrong says how they count). An impact is one while its time stays within
	// half a second of the last one that counted (a light touch never hides the crash just after it); the time found when
	// the program started watching belongs to an impact before that (or to none).
	imp := lf64(b, to+vt_mLastImpactET)
	switch {
	case !s.impactSeen:
		s.impactSeen, s.impactET = true, imp
	case imp < s.impactET: // the session's clock started again
		s.impactET = imp
	case imp > s.impactET+0.5 && lf64(b, to+vt_mLastImpactMagnitude) >= lmuImpactStrong:
		s.impacts += lmuImpactPoints
		s.impactET = imp
	}
	m.set("PlayerCarMyIncidentCount", float64(s.impacts))
	m.set("PlayerCarDriverIncidentCount", float64(s.impacts))

	// wheels: FL, FR, RL, RR
	for k, c := range []string{"LF", "RF", "LR", "RR"} {
		w := to + vt_mWheels + k*lmuWheelSize
		for z, side := range []string{"L", "M", "R"} {
			t := lf64(b, w+wh_mTemperature+z*8)
			if t > 0 {
				m.set(c+"tempC"+side, t-273.15)
			}
			m.set(c+"wear"+side, lf64(b, w+wh_mWear))
		}
		m.set(c+"pressure", lf64(b, w+wh_mPressure))
		m.set(c+"coldPressure", lf64(b, w+wh_mPressure))
		if bt := lf64(b, w+wh_mBrakeTemp); bt > 0 {
			m.set(c+"brakeTemp", bt-273.15)
		}
		m.set(c+"brakeLinePress", lf64(b, w+wh_mBrakePressure))
	}
	// off the track only with all four wheels out (a kerb never counts, and the game's own LapCountFlag says when a cut
	// is one): two wheels on the grass are a wide line, not an Off Track
	off, surface := lmuWheelSurface(b, to)
	surf := 3
	if player >= 0 {
		if cars[player].garage {
			surf = 1
		} else if cars[player].inPits {
			surf = 2
		} else if off == 4 {
			surf = 0
		}
	}
	m.set("PlayerTrackSurface", float64(surf))
	m.set("PlayerTrackSurfaceMaterial", float64(lmuMaterial(surface)))

	// position for the track map; the player's own car takes it in the field's arrays too, from this same telemetry
	pos := lvec(b, to+vt_mPos)
	lat, lon := lmuLatLon(pos)
	m.set("Lat", lat)
	m.set("Lon", lon)
	if player >= 0 {
		m.setAt("CarIdxLat", cars[player].idx, lat)
		m.setAt("CarIdxLon", cars[player].idx, lon)
	}
	ori := [3]lmuVec{lvec(b, to+vt_mOri), lvec(b, to+vt_mOri+24), lvec(b, to+vt_mOri+48)}
	// forward (local -z) in world coordinates, then the heading on the map
	fx, fz := -ori[0].z, -ori[2].z
	m.set("Yaw", math.Atan2(-fz, -fx))
	m.set("YawNorth", math.Mod(math.Atan2(-fx, -fz)+2*math.Pi, 2*math.Pi)) // clockwise from north, like WindDir
	m.set("CarLeftRight", float64(lmuSpotter(ori, pos, cars, player)))
}

// lmuLatLon turns a world position (metres) into the made-up latitude/longitude the track map and the laps' paths use,
// the same for the player and for every other car so their paths share one frame. The game's world frame is left-handed
// (local +x is the car's left, +y up, +z back, and mOri is a rotation), so with y up north = -z goes with east = -x, else
// the map comes out mirrored. To be confirmed against a real circuit the first time
func lmuLatLon(pos lmuVec) (lat, lon float64) {
	const lat0 = 45.0
	return lat0 + (-pos.z)/110540, -pos.x / (111320 * math.Cos(lat0*math.Pi/180))
}

// lmuSteer: the steering wheel's angle in rad, as iRacing gives it (positive to the left), from the game's input
// (mUnfilteredSteering, -1 … 1, positive to the right) and the car's physical wheel range in degrees (540 when the game
// says none)
func lmuSteer(input, rangeDeg float64) float64 {
	if rangeDeg <= 0 {
		rangeDeg = 540
	}
	return -input * rangeDeg / 2 * math.Pi / 180
}

// lmuWheelSurface reads a car's four wheels (wh_mSurfaceType: 0 dry asphalt, 1 wet asphalt, 2 grass, 3 dirt, 4 gravel,
// 5 kerb, 6 special): how many are off the track (grass, dirt or gravel; a kerb never counts) and the surface under most
// of them (a tie goes to the one further from the asphalt)
func lmuWheelSurface(b []byte, to int) (off, surface int) {
	var n [7]int
	for k := 0; k < 4; k++ {
		st := lu8(b, to+vt_mWheels+k*lmuWheelSize+wh_mSurfaceType)
		if st > 6 {
			st = 6
		}
		n[st]++
		if st >= 2 && st <= 4 {
			off++
		}
	}
	for st := 1; st < len(n); st++ {
		if n[st] >= n[surface] {
			surface = st
		}
	}
	return off, surface
}

// lmuMaterial turns the surface under the wheels into iRacing's irsdk_TrkSurf material: asphalt 1 (dry or wet), a kerb 11
// (a rumble strip), grass 15, dirt 19, gravel 24, anything else 0 (undefined)
func lmuMaterial(surface int) int {
	switch surface {
	case 0, 1:
		return 1
	case 5:
		return 11
	case 2:
		return 15
	case 3:
		return 19
	case 4:
		return 24
	}
	return 0
}

// carIdx: a car's index in the image's arrays (CarIdx in the session text too), given the first time the car is seen in
// the session and kept while it lasts, so a car that leaves never moves the others (the game's own array closes up behind
// it, and the field watcher follows every car by this index); a slot is given again only when all 64 are taken, to a
// car long gone. -1 when no slot is free.
func (s *lmuSource) carIdx(id int, et float64) int {
	if s.idxSeen == nil {
		s.idxSeen = map[int]float64{}
	}
	if i, ok := s.idxByID[id]; ok {
		s.idxSeen[id] = et
		return i
	}
	i := len(s.idxByID)
	if i >= lmuCars {
		// every index taken: the one of the car gone longest, when it left the game's list five minutes ago or more
		// (a public server where drivers come and go), so a car that joins late is never left out of the image
		old, at := -1, et-300
		for o, t := range s.idxSeen {
			if t < at {
				old, at = o, t
			}
		}
		if old < 0 {
			return -1
		}
		i = s.idxByID[old]
		delete(s.idxByID, old)
		delete(s.idxSeen, old)
	}
	s.idxByID[id], s.idxSeen[id] = i, et
	return i
}

// bestLapNum says which lap set a car's best (iRacing's CarIdxBestLapNum): the lap that had just ended when mBestLapTime
// changed. -1 while unknown: no best yet, or a best already set when the car was first seen (the program started
// mid-session). The memory is written only when the best changes, so a frame costs no allocation.
func (s *lmuSource) bestLapNum(id int, best float64, laps int) int {
	mem, seen := s.carMem[id]
	if seen && best == mem.best {
		return mem.num
	}
	mem.best, mem.num = best, -1
	if seen && best > 0 && laps > 0 {
		mem.num = laps
	}
	if s.carMem == nil {
		s.carMem = map[int]lmuCarMem{}
	}
	s.carMem[id] = mem
	return mem.num
}

// noteTelemetry logs how many of the session's cars the game gives telemetry for (the player's always; the rivals' says
// whether their laps come with real pedals), once per change. A car going to the garage and back changes the count, so a
// change within ten seconds of the last line waits. It says whether a line went out.
func (s *lmuSource) noteTelemetry(cars []lmuCar, et float64) bool {
	with := 0
	for i := range cars {
		if cars[i].tel >= 0 {
			with++
		}
	}
	now := [2]int{len(cars), with}
	if now == s.telSeen || (s.telSeen != [2]int{} && et >= s.telLogET && et-s.telLogET < 10) {
		return false
	}
	s.telSeen, s.telLogET = now, et
	log.Printf("lmu: telemetry for %d of %d cars", with, len(cars))
	return true
}

// lmuSpotter: cars alongside, in iRacing's CarLeftRight values.
func lmuSpotter(ori [3]lmuVec, me lmuVec, cars []lmuCar, player int) int {
	left, right := 0, 0
	for i, c := range cars {
		if i == player || c.inPits || c.garage {
			continue
		}
		dx, dy, dz := c.pos.x-me.x, c.pos.y-me.y, c.pos.z-me.z
		// world → local: the transpose of the orientation rows
		lx := ori[0].x*dx + ori[1].x*dy + ori[2].x*dz
		lz := ori[0].z*dx + ori[1].z*dy + ori[2].z*dz
		if math.Abs(lz) > 5.5 || math.Abs(lx) > 7 || math.Abs(lx) < 0.8 {
			continue
		}
		if lx > 0 {
			left++
		} else {
			right++
		}
	}
	switch {
	case left > 0 && right > 0:
		return 4
	case left > 1:
		return 5
	case right > 1:
		return 6
	case left == 1:
		return 2
	case right == 1:
		return 3
	}
	return 1
}

func lmuTime(t float64) float64 {
	if t <= 0 {
		return -1
	}
	return t
}

func b2f(v bool) float64 {
	if v {
		return 1
	}
	return 0
}

// lmuStartFlags: the start lights as iRacing's start bits. rF2 counts the gantry's frames in mStartLight
// (1 … mNumRedLights lamps lit, the frame past the last one is the lamps going out) while the game phase is
// the countdown (4); the formation lap (3) hides them, and the first seconds of green (justGreen) say go.
func lmuStartFlags(phase, light, red int, justGreen bool) int {
	switch {
	case phase == 3:
		return lmuStartHidden
	case phase == 4 && red > 0 && light > red:
		return lmuStartGo
	case phase == 4 && red > 0 && light >= red:
		return lmuStartSet
	case phase == 4:
		return lmuStartReady
	case phase == 5 && justGreen:
		return lmuStartGo
	}
	return 0
}

// LMU game phase → iRacing session state
func lmuSessionState(phase int) int {
	switch phase {
	case 0:
		return 1 // in the garage: get in car
	case 1, 2:
		return 2 // warmup, grid walk
	case 3, 4:
		return 3 // formation lap, countdown
	case 5, 6, 7, 9:
		return 4 // racing (also under yellow, stopped, paused)
	case 8:
		return 5 // checkered
	}
	return 0
}

// lmuWetness maps the game's average path wetness (0 dry … 1 soaked) onto iRacing's irsdk_TrackWetness scale: under 0.02
// is 1 dry (the game rarely says exactly 0), under 0.1 is 2 mostly dry, under 0.2 is 3 very lightly wet, under 0.35 is 4
// lightly wet (from here the recorder tags the lap "wet"), under 0.55 is 5 moderately wet, under 0.8 is 6 very wet, else 7
// extremely wet
func lmuWetness(w float64) int {
	switch {
	case w < 0.02:
		return 1
	case w < 0.1:
		return 2
	case w < 0.2:
		return 3
	case w < 0.35:
		return 4
	case w < 0.55:
		return 5
	case w < 0.8:
		return 6
	}
	return 7
}

func lmuSessionType(session int) (string, string) {
	switch {
	case session >= 10:
		return "Race", "RACE"
	case session == 9:
		return "Warmup", "WARMUP"
	case session >= 5:
		return "Qualify", "QUALIFY"
	case session >= 1:
		return "Practice", "PRACTICE"
	}
	return "Offline Testing", "TEST DAY" // iRacing's name for a test drive: never a best, a share or the model's
}

func lmuClassColor(class string) string {
	c := strings.ToLower(class)
	switch {
	case strings.Contains(c, "hyper"):
		return "0xd81e1e"
	case strings.Contains(c, "lmp2"):
		return "0x1e6bd8"
	case strings.Contains(c, "lmp3"):
		return "0x8f3fd8"
	case strings.Contains(c, "gte"):
		return "0xf2a20c"
	case strings.Contains(c, "gt3"):
		return "0x2fb24a"
	}
	return "0xffda59"
}

func yamlSafe(s string) string {
	s = strings.Map(func(r rune) rune {
		if r < 32 || r == ':' || r == '"' || r == '#' {
			return ' '
		}
		return r
	}, s)
	s = strings.TrimSpace(s)
	if s == "" {
		return "-"
	}
	return s
}

// lmuResults: the session's results as iRacing writes them (ResultsPositions, under the session), in the game's order:
// the place, the class place (from 0), the laps done and the best lap of every car, so the race summary has its field
// and its rivals like an iRacing race. Le Mans Ultimate counts no incidents.
func lmuResults(cars []lmuCar) string {
	order := make([]int, 0, len(cars))
	for i, c := range cars {
		if c.place > 0 {
			order = append(order, i)
		}
	}
	if len(order) == 0 {
		return ""
	}
	sort.Slice(order, func(a, b int) bool { return cars[order[a]].place < cars[order[b]].place })
	var sb strings.Builder
	sb.WriteString("   ResultsPositions:\n")
	for _, i := range order {
		c := cars[i]
		out := "Running"
		switch c.finish {
		case 2:
			out = "Disconnected"
		case 3:
			out = "Disqualified"
		}
		fmt.Fprintf(&sb, "   - Position: %d\n     ClassPosition: %d\n     CarIdx: %d\n     Lap: %d\n     FastestTime: %.4f\n     LastTime: %.4f\n     LapsComplete: %d\n     Incidents: 0\n     ReasonOutStr: %s\n",
			c.place, max(0, c.classPlace-1), c.idx, c.laps, lmuTime(c.best), lmuTime(c.last), c.laps, out)
	}
	return sb.String()
}

// writeSession builds the session text (track, session, drivers) when it changes.
func (s *lmuSource) writeSession(b []byte, cars []lmuCar, player, playerTel int, track string, trackLen float64, session int) {
	// rebuilt when the track, the session, the player or a car changes, a car crosses the line or sets its best (the
	// results, as iRacing updates them), compared field by field so the usual frame builds nothing
	head := lmuSessHead{track: track, session: session, player: player, plTel: playerTel, known: s.sec.known}
	same := s.sessBuilt && head == s.sessHead && len(cars) == len(s.sessCars)
	for i := 0; same && i < len(cars); i++ {
		c := cars[i]
		same = s.sessCars[i] == lmuSessCar{idx: c.idx, laps: c.laps, finish: c.finish, best: c.best, name: c.name, vehicle: c.vehicle, class: c.class}
	}
	if same {
		return
	}
	s.sessHead, s.sessBuilt, s.sessCars = head, true, s.sessCars[:0]
	for _, c := range cars {
		s.sessCars = append(s.sessCars, lmuSessCar{idx: c.idx, laps: c.laps, finish: c.finish, best: c.best, name: c.name, vehicle: c.vehicle, class: c.class})
	}
	if session != s.sessNum {
		s.sessNum, s.impacts, s.impactET, s.impactSeen, s.goET = session, 0, 0, false, 0
		clear(s.carMem) // the bests belong to the session before
		s.telSeen = [2]int{}
	}
	si := lmuOffScoring
	typ, name := lmuSessionType(session)
	maxLaps := li32(b, si+si_mMaxLaps)
	laps := "unlimited"
	if maxLaps > 0 && maxLaps < 10000 { // a timed session says 32767 (or more) laps
		laps = fmt.Sprint(maxLaps)
	}
	// the session's length, like iRacing's "SessionTime: 3600.0000 sec" (unlimited when laps alone end it)
	length := "unlimited"
	if endET, startET := lf64(b, si+si_mEndET), lf64(b, si+si_mStartET); endET > 0 && endET < 1e7 {
		length = fmt.Sprintf("%.4f sec", endET-math.Max(0, math.Min(startET, endET)))
	}
	classes := map[string]bool{}
	for _, c := range cars {
		classes[c.class] = true
	}
	redline, capa, gears, est := 0.0, 0.0, 0, 0.0
	if playerTel >= 0 {
		to := lmuOffTelem + playerTel*lmuTelSize
		redline, capa, gears = lf64(b, to+vt_mEngineMaxRPM), lf64(b, to+vt_mFuelCapacity), lu8(b, to+vt_mMaxGears)
	}
	pIdx := 0 // DriverCarIdx: the player's index in the image
	if player >= 0 {
		pIdx = cars[player].idx
		est = lf64(b, lmuOffVehScoring+cars[player].slot*lmuVehScSize+vs_mEstimatedLapTime)
	}
	var sb strings.Builder
	fmt.Fprintf(&sb, `---
WeekendInfo:
 TrackName: %s
 TrackID: %d
 TrackLength: %.2f km
 TrackDisplayName: %s
 TrackDisplayShortName: %s
 TrackConfigName: ""
 TrackCity: ""
 TrackCountry: ""
 TrackSurfaceTemp: %.2f C
 TrackAirTemp: %.2f C
 SeriesID: 0
 SeasonID: 0
 SessionID: 0
 SubSessionID: 0
 LeagueID: 0
 Official: 0
 EventType: %s
 Category: SportsCar
 SimMode: full
 Game: Le Mans Ultimate
 NumCarClasses: %d
 BuildVersion: LMU %d
SessionInfo:
 CurrentSessionNum: %d
 Sessions:
 - SessionNum: %d
   SessionLaps: %s
   SessionTime: %s
   SessionType: %s
   SessionName: %s
%sDriverInfo:
 DriverCarIdx: %d
 DriverUserID: %d
 PaceCarIdx: -1
 DriverCarIdleRPM: 1000.000
 DriverCarRedLine: %.3f
 DriverCarFuelMaxLtr: %.3f
 DriverCarFuelKgPerLtr: %.3f
 DriverCarMaxFuelPct: 1.000
 DriverCarSLFirstRPM: %.3f
 DriverCarSLShiftRPM: %.3f
 DriverCarSLLastRPM: %.3f
 DriverCarSLBlinkRPM: %.3f
 DriverCarEstLapTime: %.4f
 DriverCarGearNumForward: %d
 DriverIncidentCount: 0
 Drivers:
`, strings.ReplaceAll(strings.ToLower(yamlSafe(track)), " ", "_"), lmuHash(track, 100000, 800000), trackLen/1000, yamlSafe(track), yamlSafe(track),
		lf64(b, si+si_mTrackTemp), lf64(b, si+si_mAmbientTemp), typ, len(classes), li32(b, lmuOffGameVer),
		session, session, laps, length, typ, name, lmuResults(cars),
		pIdx, lmuDriverID(lmuPlayerName(cars, player)), redline, capa, lmuFuelKgPerLtr, redline*0.85, redline*0.96, redline*0.94, redline*0.98, est, gears)
	for _, c := range cars {
		model := strings.TrimSpace(lmuNumRe.ReplaceAllString(c.vehicle, ""))
		if c.tel >= 0 {
			if v := lstr(b, lmuOffTelem+c.tel*lmuTelSize+vt_mVehicleModel, 30); v != "" {
				model = v
			}
		}
		ai := 0
		if c.control == 1 {
			ai = 1
		}
		fmt.Fprintf(&sb, ` - CarIdx: %d
   UserName: %s
   AbbrevName: %s
   Initials: %s
   UserID: %d
   TeamName: %s
   CarNumber: "%s"
   CarNumberRaw: %s
   CarPath: %s
   CarClassID: %d
   CarID: %d
   CarScreenName: %s
   CarScreenNameShort: %s
   CarClassShortName: %s
   CarClassColor: %s
   CarClassEstLapTime: %.4f
   IRating: 0
   LicLevel: 0
   LicSubLevel: 0
   LicString: ""
   LicColor: 0xffffff
   IsSpectator: 0
   CarIsPaceCar: 0
   CarIsAI: %d
   CurDriverIncidentCount: 0
`, c.idx, yamlSafe(c.name), yamlSafe(c.name), yamlSafe(string([]rune(yamlSafe(c.name))[:1])), lmuDriverID(c.name), yamlSafe(c.vehicle), c.num, c.num,
			strings.ReplaceAll(strings.ToLower(yamlSafe(model)), " ", "_"), lmuHash(c.class, 9000, 900), lmuHash(model, 10000, 90000),
			yamlSafe(model), yamlSafe(model), yamlSafe(c.class), lmuClassColor(c.class), est, ai)
	}
	// the official sectors once learned, written as iRacing does, so the timing overlay and the sectors work
	if k := s.sec.known; k[1] > 0 && k[2] > k[1] {
		sb.WriteString("SplitTimeInfo:\n Sectors:\n")
		for i, start := range []float64{0, k[1], k[2]} {
			fmt.Fprintf(&sb, " - SectorNum: %d\n   SectorStartPct: %.6f\n", i, start)
		}
	}
	sb.WriteString("...\n")
	s.img.setSession(sb.String())
}
