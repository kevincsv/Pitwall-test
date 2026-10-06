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
	"math"
	"regexp"
	"sort"
	"strings"
	"sync"
	"time"
)

const lmuCars = 64 // iRacing-style arrays hold 64 cars

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
	}
	for _, c := range []string{"LF", "RF", "LR", "RR"} {
		extra = append(extra, demoVar{name: c + "pressure", desc: c + " tire pressure", unit: "kPa", typ: TypeFloat},
			demoVar{name: c + "brakeTemp", desc: c + " brake temperature", unit: "C", typ: TypeFloat})
	}
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

type lmuSource struct {
	mu       sync.Mutex
	view     lmuView
	img      *irImage
	snap     []byte
	stop     chan struct{}
	sessKey  string
	impactET float64
	impacts  int
	sessNum  int
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
	if !s.update() {
		// the mapping exists but holds nothing yet (menus): still connected to the game
		s.img.setConnected(false)
	}
	go s.run()
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

func (s *lmuSource) Wait(d time.Duration) { time.Sleep(d / 2) }

func (s *lmuSource) Close() {
	if s.stop != nil {
		close(s.stop)
		s.stop = nil
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
	tel                       int // telemetry slot, -1 if none
	pos                       lmuVec
}

var lmuNumRe = regexp.MustCompile(`#\s*(\d{1,3})`)

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

	cars := make([]lmuCar, 0, n)
	player := -1
	for i := 0; i < n && len(cars) < lmuCars; i++ {
		o := lmuOffVehScoring + i*lmuVehScSize
		c := lmuCar{slot: i, idx: len(cars), id: li32(b, o+vs_mID), name: lstr(b, o+vs_mDriverName, 32), vehicle: lstr(b, o+vs_mVehicleName, 64),
			class: lstr(b, o+vs_mVehicleClass, 32), place: lu8(b, o+vs_mPlace), laps: li16(b, o+vs_mTotalLaps), lapDist: lf64(b, o+vs_mLapDist),
			est: lf64(b, o+vs_mTimeIntoLap), behind: lf64(b, o+vs_mTimeBehindLeader), last: lf64(b, o+vs_mLastLapTime), best: lf64(b, o+vs_mBestLapTime),
			inPits: lu8(b, o+vs_mInPits) != 0, garage: lu8(b, o+vs_mInGarageStall) != 0, player: lu8(b, o+vs_mIsPlayer) != 0,
			control: int(int8(b[o+vs_mControl])), pos: lvec(b, o+vs_mPos), tel: -1}
		if t, ok := telByID[c.id]; ok {
			c.tel = t
		}
		if m := lmuNumRe.FindStringSubmatch(c.vehicle); m != nil {
			c.num = m[1]
		} else {
			c.num = fmt.Sprint(c.slot + 1)
		}
		if c.player {
			player = c.idx
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

	s.writeSession(b, cars, player, playerTel, track, trackLen, session)

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
	m.set("TrackWetness", float64(lmuWetness(lf64(b, si+si_mAvgPathWetness))))

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
		m.setAt("CarIdxOnPitRoad", i, b2f(c.inPits))
		surf := 3
		if c.garage {
			surf = 1
		} else if c.inPits {
			surf = 2
		}
		m.setAt("CarIdxTrackSurface", i, float64(surf))
		if c.tel >= 0 {
			to := lmuOffTelem + c.tel*lmuTelSize
			m.setAt("CarIdxGear", i, float64(li32(b, to+vt_mGear)))
			m.setAt("CarIdxRPM", i, lf64(b, to+vt_mEngineRPM))
			m.setAt("CarIdxTireCompound", i, float64(lu8(b, to+vt_mFrontTireCompoundIndex)))
		}
	}
	for i := len(cars); i < lmuCars; i++ {
		m.setAt("CarIdxLapDistPct", i, -1)
		m.setAt("CarIdxTrackSurface", i, -1)
	}

	connected := player >= 0 && playerTel >= 0 && lu8(b, si+si_mInRealtime) != 0
	m.set("PlayerCarIdx", float64(max(player, 0)))
	if player >= 0 {
		p := cars[player]
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
		if fl := lu8(b, po+vs_mFlag); fl == 6 {
			flags |= 0x20 // blue
		}
		if lu8(b, po+vs_mUnderYellow) != 0 {
			flags |= 0x8
		}
	}
	m.set("SessionFlags", float64(flags))

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
	rng := lf32(b, to+vt_mPhysicalSteeringWheelRange)
	if rng <= 0 {
		rng = 540
	}
	m.set("SteeringWheelAngle", -lf64(b, to+vt_mUnfilteredSteering)*rng/2*math.Pi/180)
	fuel, capa := lf64(b, to+vt_mFuel), lf64(b, to+vt_mFuelCapacity)
	m.set("FuelLevel", fuel)
	if capa > 0 {
		m.set("FuelLevelPct", fuel/capa)
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

	// contacts stand in for incidents (LMU has no incident count)
	if imp := lf64(b, to+vt_mLastImpactET); imp > s.impactET+0.5 && lf64(b, to+vt_mLastImpactMagnitude) > 300 {
		if s.impactET > 0 {
			s.impacts++
		}
		s.impactET = imp
	} else if imp > s.impactET {
		s.impactET = imp
	}
	m.set("PlayerCarMyIncidentCount", float64(s.impacts))
	m.set("PlayerCarDriverIncidentCount", float64(s.impacts))

	// wheels: FL, FR, RL, RR
	off := 0
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
		if st := lu8(b, w+wh_mSurfaceType); st >= 2 && st <= 4 {
			off++
		}
	}
	surf := 3
	if player >= 0 {
		if cars[player].garage {
			surf = 1
		} else if cars[player].inPits {
			surf = 2
		} else if off >= 2 {
			surf = 0
		}
	}
	m.set("PlayerTrackSurface", float64(surf))

	// position for the track map (metres → a made-up latitude/longitude, north = -z)
	pos := lvec(b, to+vt_mPos)
	const lat0 = 45.0
	m.set("Lat", lat0+(-pos.z)/110540)
	m.set("Lon", pos.x/(111320*math.Cos(lat0*math.Pi/180)))
	ori := [3]lmuVec{lvec(b, to+vt_mOri), lvec(b, to+vt_mOri+24), lvec(b, to+vt_mOri+48)}
	// forward (local -z) in world coordinates, then the heading on the map
	fx, fz := -ori[0].z, -ori[2].z
	m.set("Yaw", math.Atan2(-fz, fx))
	m.set("CarLeftRight", float64(lmuSpotter(ori, pos, cars, player)))
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

func lmuWetness(w float64) int {
	switch {
	case w <= 0:
		return 1
	case w < 0.05:
		return 2
	case w < 0.15:
		return 3
	case w < 0.3:
		return 4
	case w < 0.5:
		return 5
	case w < 0.75:
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
	return "Practice", "TEST DAY"
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

// writeSession builds the session text (track, session, drivers) when it changes.
func (s *lmuSource) writeSession(b []byte, cars []lmuCar, player, playerTel int, track string, trackLen float64, session int) {
	var key strings.Builder
	fmt.Fprintf(&key, "%s|%d|%d|%d", track, session, player, playerTel)
	for _, c := range cars {
		key.WriteString("|" + c.name + c.vehicle + c.class)
	}
	if key.String() == s.sessKey {
		return
	}
	s.sessKey = key.String()
	if session != s.sessNum {
		s.sessNum, s.impacts, s.impactET = session, 0, 0
	}
	si := lmuOffScoring
	typ, name := lmuSessionType(session)
	maxLaps := li32(b, si+si_mMaxLaps)
	laps := "unlimited"
	if maxLaps > 0 && maxLaps < 10000 {
		laps = fmt.Sprint(maxLaps)
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
	if player >= 0 {
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
   SessionTime: %.4f sec
   SessionType: %s
   SessionName: %s
DriverInfo:
 DriverCarIdx: %d
 DriverUserID: %d
 PaceCarIdx: -1
 DriverCarIdleRPM: 1000.000
 DriverCarRedLine: %.3f
 DriverCarFuelMaxLtr: %.3f
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
		session, session, laps, lf64(b, si+si_mEndET), typ, name,
		max(player, 0), max(player, 0)+1, redline, capa, redline*0.85, redline*0.96, redline*0.94, redline*0.98, est, gears)
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
`, c.idx, yamlSafe(c.name), yamlSafe(c.name), yamlSafe(string([]rune(yamlSafe(c.name))[:1])), c.idx+1, yamlSafe(c.vehicle), c.num, c.num,
			strings.ReplaceAll(strings.ToLower(yamlSafe(model)), " ", "_"), lmuHash(c.class, 9000, 900), lmuHash(model, 10000, 90000),
			yamlSafe(model), yamlSafe(model), yamlSafe(c.class), lmuClassColor(c.class), est, ai)
	}
	sb.WriteString("...\n")
	s.img.setSession(sb.String())
}
