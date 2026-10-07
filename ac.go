package main

// Assetto Corsa Competizione and Assetto Corsa: read the games' shared memory
// (Local\acpmf_physics, acpmf_graphics, acpmf_static; always on, nothing to set up)
// and write it into an iRacing-style memory image like LMU does. ACC also
// publishes where every car is on track (radar, relative, map); the first
// Assetto Corsa only publishes your own car. Layout: ac_layout.go.

import (
	"encoding/binary"
	"fmt"
	"math"
	"strings"
	"sync"
	"time"
	"unicode"
	"unicode/utf16"
)

type acViews interface {
	Physics() []byte
	Graphics() []byte
	Static() []byte
	Close()
}

const acPathBins = 1000

type acSource struct {
	acc  bool
	mu   sync.Mutex
	v    acViews
	img  *irImage
	stop chan struct{}

	sessKey  string
	lapLen   float64
	lapDist0 float64
	lastLaps int
	path     [acPathBins][2]float64
	pathOK   [acPathBins]bool
	prev     [2]float64
	fwd      [2]float64
	snapP    []byte
	snapG    []byte
	snapS    []byte
	t0       time.Time
}

func newACCSource() Source { return &acSource{acc: true} }
func newACSource() Source  { return &acSource{} }

func (s *acSource) Name() string {
	if s.acc {
		return "acc"
	}
	return "ac"
}

func (s *acSource) Open() error {
	v, err := openACViews()
	if err != nil {
		return err
	}
	s.v = v
	s.img = newIRImage(acVarDefs())
	s.lastLaps = -1
	s.stop = make(chan struct{})
	s.update()
	go func() {
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
	}()
	return nil
}

func (s *acSource) Mem() []byte          { return s.img.mem }
func (s *acSource) Wait(d time.Duration) { time.Sleep(d / 2) }
func (s *acSource) Close() {
	if s.stop != nil {
		close(s.stop)
		s.stop = nil
	}
	s.mu.Lock()
	if s.v != nil {
		s.v.Close()
		s.v = nil
	}
	s.mu.Unlock()
}

func acVarDefs() []demoVar {
	out := lmuVarDefs()
	for _, v := range []demoVar{
		{name: "dcTractionControl2", desc: "In car traction control 2 (cut) setting", typ: TypeFloat},
		{name: "FuelUsePerLap", desc: "Fuel used per lap (game estimate)", unit: "l", typ: TypeFloat},
		{name: "GapAhead", desc: "Gap to the car ahead", unit: "s", typ: TypeFloat},
		{name: "GapBehind", desc: "Gap to the car behind", unit: "s", typ: TypeFloat},
		{name: "LapValid", desc: "Current lap is valid", typ: TypeBool},
	} {
		out = append(out, v)
	}
	return out
}

func af32(b []byte, o int) float64 {
	return float64(math.Float32frombits(binary.LittleEndian.Uint32(b[o:])))
}
func ai32(b []byte, o int) int { return int(int32(binary.LittleEndian.Uint32(b[o:]))) }

// wide (UTF-16) string of n characters
func awstr(b []byte, o, n int) string {
	u := make([]uint16, 0, n)
	for i := 0; i < n && o+2*i+1 < len(b); i++ {
		c := binary.LittleEndian.Uint16(b[o+2*i:])
		if c == 0 {
			break
		}
		u = append(u, c)
	}
	return strings.TrimSpace(string(utf16.Decode(u)))
}

// "porsche_991ii_gt3_r" → "Porsche 991ii Gt3 R"
func acPretty(id string) string {
	w := strings.Fields(strings.NewReplacer("_", " ", "-", " ").Replace(id))
	for i, x := range w {
		r := []rune(x)
		r[0] = unicode.ToUpper(r[0])
		w[i] = string(r)
	}
	return strings.Join(w, " ")
}

func (s *acSource) update() {
	s.mu.Lock()
	defer s.mu.Unlock()
	if s.v == nil {
		return
	}
	p, g, st := s.v.Physics(), s.v.Graphics(), s.v.Static()
	need := 300
	if s.acc {
		need = acGraphSize
	}
	if len(p) < 600 || len(g) < need || len(st) < 600 {
		s.img.setConnected(false)
		return
	}
	s.snapP = append(s.snapP[:0], p...)
	s.snapG = append(s.snapG[:0], g...)
	s.snapS = append(s.snapS[:0], st...)
	s.convert(s.snapP, s.snapG, s.snapS)
}

// convert turns one physics/graphics/static set into the iRacing-style image.
func (s *acSource) convert(p, g, st []byte) bool {
	status := ai32(g, acg_acc_status) // 0 off, 1 replay, 2 live, 3 pause
	if status != 2 && status != 3 {
		s.img.setConnected(false)
		return false
	}
	norm := af32(g, acg_normalizedCarPosition)
	laps := ai32(g, acg_completedLaps)
	dist := af32(g, acg_distanceTraveled)
	// lap length: the game's own (if any), else learned from the distance driven
	if l := af32(st, acs_trackSplineLength); l > 100 {
		s.lapLen = l
	} else if s.lastLaps >= 0 && laps == s.lastLaps+1 && dist-s.lapDist0 > 300 {
		s.lapLen = dist - s.lapDist0
	}
	if laps != s.lastLaps {
		s.lastLaps, s.lapDist0 = laps, dist
	}
	if s.lapLen <= 0 && laps+1 > 0 && norm > 0.3 {
		s.lapLen = dist / (float64(laps) + norm)
	}
	trackLen := s.lapLen
	if trackLen <= 0 {
		trackLen = 5000
	}

	// cars on track (ACC): coordinates and ids; the player's index
	type car struct {
		id   int
		x, z float64
	}
	var cars []car
	player := 0
	var me [2]float64
	if s.acc {
		n := ai32(g, acg_activeCars)
		if n > 60 {
			n = 60
		}
		pid := ai32(g, acg_playerCarID)
		for i := 0; i < n && len(cars) < lmuCars; i++ {
			c := car{id: ai32(g, acg_carID+4*i), x: af32(g, acg_carCoordinates+12*i), z: af32(g, acg_carCoordinates+12*i+8)}
			if c.id == pid {
				player = len(cars)
			}
			cars = append(cars, c)
		}
		if len(cars) > 0 {
			me = [2]float64{cars[player].x, cars[player].z}
		}
	} else {
		me = [2]float64{af32(g, 252), af32(g, 260)} // Assetto Corsa: carCoordinates of your car only
		cars = []car{{id: 0, x: me[0], z: me[1]}}
	}
	// learn the track from your own driving: position at each point of the lap
	if norm >= 0 && norm < 1 && (me[0] != 0 || me[1] != 0) {
		k := int(norm * acPathBins)
		s.path[k], s.pathOK[k] = me, true
	}
	if dx, dz := me[0]-s.prev[0], me[1]-s.prev[1]; dx*dx+dz*dz > 0.25 {
		d := math.Hypot(dx, dz)
		if d < 20 {
			s.fwd = [2]float64{dx / d, dz / d}
		}
		s.prev = me
	}

	s.writeSession(st, len(cars), player)

	m := s.img
	m.begin()
	et := s.sessionTime(g)
	m.set("SessionTime", et)
	m.set("SessionTick", float64(m.tick+1))
	sess := 0
	if s.acc {
		sess = ai32(g, acg_sessionIndex)
	}
	m.set("SessionNum", float64(sess))
	state := 4
	flag := ai32(g, acg_flag)
	if !s.acc {
		flag = ai32(g, 268)
	}
	flags := 0x4
	switch flag {
	case 1:
		flags |= 0x20
	case 2:
		flags |= 0x8
	case 3, 6:
		flags |= 0x10000 // black / penalty
	case 4:
		flags |= 0x2
	case 5:
		flags |= 0x1
		state = 5
	}
	m.set("SessionState", float64(state))
	m.set("SessionFlags", float64(flags))
	left := af32(g, acg_sessionTimeLeft) / 1000
	if left < 0 {
		left = 0
	}
	m.set("SessionTimeRemain", left)
	if nl := ai32(g, acg_numberOfLaps); nl > 0 {
		m.set("SessionLapsTotal", float64(nl))
		m.set("SessionLapsRemainEx", float64(max(0, nl-laps)))
	} else {
		m.set("SessionLapsTotal", 32767)
		m.set("SessionLapsRemainEx", 32767)
	}
	m.set("AirTemp", af32(p, acp_airTemp))
	m.set("TrackTempCrew", af32(p, acp_roadTemp))

	// your car
	ms := func(o int) float64 {
		v := ai32(g, o)
		if v <= 0 || v >= 2147483647 {
			return -1
		}
		return float64(v) / 1000
	}
	best, last := ms(acg_iBestTime), ms(acg_iLastTime)
	m.set("PlayerCarIdx", float64(player))
	pos := ai32(g, acg_position)
	m.set("PlayerCarPosition", float64(pos))
	m.set("PlayerCarClassPosition", float64(pos))
	inPitLane := ai32(g, acg_isInPitLane) != 0
	inPit := ai32(g, acg_isInPit) != 0
	if !s.acc {
		inPitLane = ai32(g, 276) != 0
	}
	m.setBool("OnPitRoad", inPitLane || inPit)
	m.set("Lap", float64(laps+1))
	m.set("LapCompleted", float64(laps))
	m.set("LapDistPct", math.Max(0, norm))
	m.set("LapDist", math.Max(0, norm)*trackLen)
	m.set("LapCurrentLapTime", math.Max(0, float64(ai32(g, acg_iCurrentTime))/1000))
	m.set("LapLastLapTime", last)
	m.set("LapBestLapTime", best)
	if s.acc {
		d := float64(ai32(g, acg_ideltaLapTime)) / 1000
		m.set("LapDeltaToBestLap", d)
		m.setBool("LapDeltaToBestLap_OK", best > 0)
		m.setBool("LapValid", ai32(g, acg_isValidLap) != 0)
		m.set("FuelUsePerLap", af32(g, acg_fuelXLap))
		if v := ai32(g, acg_gapAhead); v > 0 && v < 3600000 {
			m.set("GapAhead", float64(v)/1000)
		}
		if v := ai32(g, acg_gapBehind); v > 0 && v < 3600000 {
			m.set("GapBehind", float64(v)/1000)
		}
		m.set("dcTractionControl", float64(ai32(g, acg_TC)))
		m.set("dcTractionControl2", float64(ai32(g, acg_TCCUT)))
		m.set("dcABS", float64(ai32(g, acg_ABS)))
		m.set("dcEngineMap", float64(ai32(g, acg_EngineMap)+1))
		if bb := af32(p, acp_brakeBias); bb > 0 && bb < 1 {
			m.set("dcBrakeBias", bb*100)
		}
		rain := af32(g, acg_rainIntensity) // 0 none … 5 thunderstorm
		m.set("Precipitation", rain/5)
		m.set("TrackWetness", float64([]int{1, 1, 2, 3, 4, 5, 6, 7}[min(max(ai32(g, acg_trackGripStatus), 0), 7)]))
		m.set("SessionTimeOfDay", af32(g, acg_Clock))
	}
	maxRPM := float64(ai32(st, acs_maxRpm))
	if s.acc {
		if r := float64(ai32(p, acp_currentMaxRpm)); r > 0 {
			maxRPM = r
		}
	}
	rpm := float64(ai32(p, acp_rpm))
	m.set("Speed", af32(p, acp_speedKmh)/3.6)
	m.set("RPM", rpm)
	m.set("Gear", float64(ai32(p, acp_gear)-1)) // AC: 0 reverse, 1 neutral
	m.set("Throttle", af32(p, acp_gas))
	m.set("Brake", af32(p, acp_brake))
	m.set("Clutch", 1-af32(p, acp_clutch))
	m.set("SteeringWheelAngle", -af32(p, acp_steerAngle)*450*math.Pi/180)
	fuel, capa := af32(p, acp_fuel), af32(st, acs_maxFuel)
	m.set("FuelLevel", fuel)
	if capa > 0 {
		m.set("FuelLevelPct", fuel/capa)
	}
	m.set("LongAccel", af32(p, acp_accG+8)*9.81)
	m.set("LatAccel", af32(p, acp_accG)*9.81)
	m.set("YawRate", af32(p, acp_localAngularVel+4))
	m.set("VelocityX", af32(p, acp_localVelocity+8))
	m.set("VelocityY", -af32(p, acp_localVelocity))
	if s.acc {
		m.set("WaterTemp", af32(p, acp_waterTemp))
		m.setBool("BrakeABSactive", ai32(p, acp_absinAction) != 0)
	}
	warn := 0
	if ai32(p, acp_pitLimiterOn) != 0 {
		warn |= 0x10
	}
	if maxRPM > 0 && rpm >= maxRPM*0.995 {
		warn |= 0x20
	}
	m.set("EngineWarnings", float64(warn))
	if ai32(p, acp_drsAvailable) != 0 {
		drs := 2
		if ai32(p, acp_drsEnabled) != 0 {
			drs = 3
		}
		m.set("DRS_Status", float64(drs))
	}
	if kc := af32(p, acp_kersCharge); kc > 0 {
		m.set("EnergyERSBatteryPct", kc)
	}
	surf := 3
	if inPit {
		surf = 1
	} else if inPitLane {
		surf = 2
	} else if ai32(p, acp_numberOfTyresOut) > 2 {
		surf = 0
	}
	m.set("PlayerTrackSurface", float64(surf))
	// wheels FL FR RL RR; ACC streams core temperatures, AC also inner/middle/outer
	for k, c := range []string{"LF", "RF", "LR", "RR"} {
		core := af32(p, acp_tyreCoreTemperature+4*k)
		in, mid, out := af32(p, acp_tyreTempI+4*k), af32(p, acp_tyreTempM+4*k), af32(p, acp_tyreTempO+4*k)
		if in == 0 && mid == 0 && out == 0 {
			in, mid, out = core, core, core
		}
		// inner is on the left side of the left tyres
		l, r := in, out
		if k == 1 || k == 3 {
			l, r = out, in
		}
		if mid > 0 {
			m.set(c+"tempCL", l)
			m.set(c+"tempCM", mid)
			m.set(c+"tempCR", r)
		}
		psi := af32(p, acp_wheelsPressure+4*k)
		m.set(c+"pressure", psi*6.89476)
		m.set(c+"coldPressure", psi*6.89476)
		if bt := af32(p, acp_brakeTemp+4*k); bt > 0 {
			m.set(c+"brakeTemp", bt)
		}
		if !s.acc {
			if w := af32(p, acp_tyreWear+4*k); w > 0 {
				for _, z := range []string{"L", "M", "R"} {
					m.set(c+"wear"+z, w/100)
				}
			}
		}
	}

	// map position (metres → a made-up latitude/longitude, north = -z) and heading
	const lat0 = 45.0
	m.set("Lat", lat0+(-me[1])/110540)
	m.set("Lon", me[0]/(111320*math.Cos(lat0*math.Pi/180)))
	m.set("Yaw", math.Atan2(-s.fwd[1], s.fwd[0]))

	// every car: where it is on the lap (from the track you drove) for relative and radar
	estLap := best
	if estLap <= 0 {
		estLap = 120
	}
	left2, right2 := 0, 0
	for i, c := range cars {
		pct := -1.0
		if i == player {
			pct = math.Max(0, norm)
		} else if s.acc {
			pct = s.pctAt(c.x, c.z)
			dx, dz := c.x-me[0], c.z-me[1]
			along := dx*s.fwd[0] + dz*s.fwd[1]
			side := -dx*s.fwd[1] + dz*s.fwd[0] // >0: left of the direction of travel
			if math.Abs(along) < 5.5 && math.Abs(side) > 0.8 && math.Abs(side) < 7 {
				if side > 0 {
					left2++
				} else {
					right2++
				}
			}
		}
		m.setAt("CarIdxLapDistPct", i, pct)
		if pct >= 0 {
			m.setAt("CarIdxEstTime", i, pct*estLap)
			m.setAt("CarIdxTrackSurface", i, 3)
		} else {
			m.setAt("CarIdxTrackSurface", i, -1)
		}
		if i == player {
			m.setAt("CarIdxPosition", i, float64(pos))
			m.setAt("CarIdxClassPosition", i, float64(pos))
			m.setAt("CarIdxLap", i, float64(laps+1))
			m.setAt("CarIdxLapCompleted", i, float64(laps))
			m.setAt("CarIdxLastLapTime", i, last)
			m.setAt("CarIdxBestLapTime", i, best)
			m.setAt("CarIdxOnPitRoad", i, b2f(inPitLane || inPit))
			m.setAt("CarIdxGear", i, float64(ai32(p, acp_gear)-1))
			m.setAt("CarIdxRPM", i, rpm)
		}
	}
	for i := len(cars); i < lmuCars; i++ {
		m.setAt("CarIdxLapDistPct", i, -1)
		m.setAt("CarIdxTrackSurface", i, -1)
	}
	lr := 1
	switch {
	case left2 > 0 && right2 > 0:
		lr = 4
	case left2 > 1:
		lr = 5
	case right2 > 1:
		lr = 6
	case left2 == 1:
		lr = 2
	case right2 == 1:
		lr = 3
	}
	if s.acc {
		m.set("CarLeftRight", float64(lr))
	}
	m.setBool("IsOnTrack", status == 2 && !inPit)
	m.commit()
	m.setConnected(true)
	return true
}

// sessionTime: the game gives no session clock, so a steady one since TrackIQ connected
func (s *acSource) sessionTime(g []byte) float64 {
	if s.t0.IsZero() {
		s.t0 = time.Now()
	}
	return time.Since(s.t0).Seconds()
}

// pctAt finds where on the lap a point is, from the track learned while you drive.
func (s *acSource) pctAt(x, z float64) float64 {
	best, bd := -1, math.MaxFloat64
	for k := 0; k < acPathBins; k++ {
		if !s.pathOK[k] {
			continue
		}
		dx, dz := s.path[k][0]-x, s.path[k][1]-z
		if d := dx*dx + dz*dz; d < bd {
			best, bd = k, d
		}
	}
	if best < 0 || bd > 30*30 {
		return -1
	}
	return (float64(best) + 0.5) / acPathBins
}

func (s *acSource) writeSession(st []byte, nCars, player int) {
	track := awstr(st, acs_track, 33)
	cfgName := awstr(st, acs_trackConfiguration, 33)
	carID := awstr(st, acs_carModel, 33)
	name := strings.TrimSpace(awstr(st, acs_playerName, 33) + " " + awstr(st, acs_playerSurname, 33))
	key := fmt.Sprintf("%s|%s|%s|%s|%d|%d|%.0f", track, cfgName, carID, name, nCars, player, s.lapLen)
	if key == s.sessKey {
		return
	}
	s.sessKey = key
	game := "Assetto Corsa"
	if s.acc {
		game = "Assetto Corsa Competizione"
	}
	trackName := acPretty(track)
	lenKm := s.lapLen / 1000
	var sb strings.Builder
	fmt.Fprintf(&sb, `---
WeekendInfo:
 TrackName: %s
 TrackID: %d
 TrackLength: %.2f km
 TrackDisplayName: %s
 TrackDisplayShortName: %s
 TrackConfigName: "%s"
 TrackCity: ""
 TrackCountry: ""
 SeriesID: 0
 SeasonID: 0
 SessionID: 0
 SubSessionID: 0
 Official: 0
 EventType: Race
 Category: SportsCar
 SimMode: full
 Game: %s
 NumCarClasses: 1
SessionInfo:
 CurrentSessionNum: 0
 Sessions:
 - SessionNum: 0
   SessionLaps: unlimited
   SessionTime: unlimited
   SessionType: Race
   SessionName: SESSION
DriverInfo:
 DriverCarIdx: %d
 DriverUserID: %d
 PaceCarIdx: -1
 DriverCarRedLine: %d.000
 DriverCarFuelMaxLtr: %.3f
 DriverCarMaxFuelPct: 1.000
 DriverIncidentCount: 0
 Drivers:
`, yamlSafe(track), lmuHash(track+"|"+cfgName, 1000000, 800000), lenKm, yamlSafe(trackName), yamlSafe(trackName), yamlSafe(acPretty(cfgName)),
		game, player, player+1, ai32(st, acs_maxRpm), af32(st, acs_maxFuel))
	for i := 0; i < max(nCars, 1); i++ {
		n, car := fmt.Sprintf("Car %d", i+1), acPretty(carID)
		if i == player {
			n = firstNonEmpty(name, "You")
		}
		fmt.Fprintf(&sb, ` - CarIdx: %d
   UserName: %s
   AbbrevName: %s
   Initials: %s
   UserID: %d
   TeamName: -
   CarNumber: "%d"
   CarNumberRaw: %d
   CarPath: %s
   CarClassID: 1
   CarID: %d
   CarScreenName: %s
   CarScreenNameShort: %s
   CarClassShortName: %s
   CarClassColor: 0xffda59
   IRating: 0
   LicString: ""
   IsSpectator: 0
   CarIsPaceCar: 0
   CarIsAI: 0
   CurDriverIncidentCount: 0
`, i, yamlSafe(n), yamlSafe(n), string([]rune(yamlSafe(n))[:1]), i+1, i+1, i+1, yamlSafe(carID), lmuHash(carID, 20000, 80000),
			yamlSafe(car), yamlSafe(car), yamlSafe(game))
	}
	sb.WriteString("...\n")
	s.img.setSession(sb.String())
}
