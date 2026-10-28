package main

import (
	"encoding/binary"
	"fmt"
	"math"
	"os"
	"path/filepath"
	"strings"
	"testing"
)

// a made-up LMU_Data snapshot: 3 cars at Le Mans, the player second and a car
// alongside on the player's left
func fakeLMU() []byte {
	b := make([]byte, lmuDataSize)
	pf64 := func(o int, v float64) { binary.LittleEndian.PutUint64(b[o:], math.Float64bits(v)) }
	pf32 := func(o int, v float64) { binary.LittleEndian.PutUint32(b[o:], math.Float32bits(float32(v))) }
	pi32 := func(o int, v int) { binary.LittleEndian.PutUint32(b[o:], uint32(int32(v))) }
	pi16 := func(o int, v int) { binary.LittleEndian.PutUint16(b[o:], uint16(int16(v))) }
	ps := func(o int, s string) { copy(b[o:], s) }
	si := lmuOffScoring
	ps(si+si_mTrackName, "Circuit de la Sarthe")
	pi32(si+si_mSession, 10)
	pf64(si+si_mCurrentET, 600)
	pf64(si+si_mEndET, 3600)
	pi32(si+si_mMaxLaps, 999999)
	pf64(si+si_mLapDist, 13626)
	pi32(si+si_mNumVehicles, 3)
	b[si+si_mGamePhase] = 5
	b[si+si_mInRealtime] = 1
	pf64(si+si_mAmbientTemp, 21)
	pf64(si+si_mTrackTemp, 30)
	pi32(lmuOffGameVer, 14000)
	type car struct {
		name, veh, class string
		place, laps      int
		dist             float64
		x, z             float64
		player           bool
	}
	cars := []car{
		{"Ana Duarte", "Toyota GR010 #7", "Hypercar", 1, 5, 6000, 0, -40, false},
		{"Driver", "Porsche 963 #6", "Hypercar", 2, 5, 5980, 0, 0, true},
		{"Luca Bianchi", "Ferrari 296 #55", "LMGT3", 3, 5, 5981, 3, 1, false}, // 3 m to the left (+x)
	}
	for i, c := range cars {
		o := lmuOffVehScoring + i*lmuVehScSize
		pi32(o+vs_mID, 100+i)
		ps(o+vs_mDriverName, c.name)
		ps(o+vs_mVehicleName, c.veh)
		ps(o+vs_mVehicleClass, c.class)
		b[o+vs_mPlace] = byte(c.place)
		pi16(o+vs_mTotalLaps, c.laps)
		pf64(o+vs_mLapDist, c.dist)
		pf64(o+vs_mBestLapTime, 210.5+float64(i))
		pf64(o+vs_mLastLapTime, 212+float64(i))
		pf64(o+vs_mLapStartET, 550)
		pf64(o+vs_mPos, c.x)
		pf64(o+vs_mPos+16, c.z)
		if c.player {
			b[o+vs_mIsPlayer] = 1
		}
		t := lmuOffTelem + i*lmuTelSize
		pi32(t+vt_mID, 100+i)
		pi32(t+vt_mGear, 4)
		pf64(t+vt_mEngineRPM, 7000)
		pf64(t+vt_mEngineMaxRPM, 8500)
		pf64(t+vt_mLocalVel+16, -70) // 70 m/s forward (local -z)
		pf64(t+vt_mFilteredThrottle, 0.9)
		pf64(t+vt_mFuel, 45)
		pf64(t+vt_mFuelCapacity, 90)
		b[t+vt_mTC], b[t+vt_mTCMax] = 3, 9
		pf64(t+vt_mRearBrakeBias, 0.44)
		pf32(t+vt_mVirtualEnergy, 0.62)
		pf32(t+vt_mPhysicalSteeringWheelRange, 360)
		pf64(t+vt_mPos, c.x)
		pf64(t+vt_mPos+16, c.z)
		// identity orientation
		pf64(t+vt_mOri, 1)
		pf64(t+vt_mOri+24+8, 1)
		pf64(t+vt_mOri+48+16, 1)
		for w := 0; w < 4; w++ {
			wo := t + vt_mWheels + w*lmuWheelSize
			for z := 0; z < 3; z++ {
				pf64(wo+wh_mTemperature+z*8, 273.15+85)
			}
			pf64(wo+wh_mWear, 0.93)
			pf64(wo+wh_mPressure, 165)
			pf64(wo+wh_mBrakeTemp, 273.15+450)
		}
	}
	b[lmuOffActive] = 3
	b[lmuOffPlayerIdx] = 1
	b[lmuOffPlayerHas] = 1
	return b
}

// lmuRead reads the converted image: the latest frame's variables and the session text
func lmuRead(t *testing.T, s *lmuSource) (func(string) float64, string) {
	t.Helper()
	h, err := readHeader(s.img.mem)
	if err != nil || h.Status&irsdkStatusConnected == 0 {
		t.Fatalf("header %v status %d", err, h.Status)
	}
	vars, err := readVarHeaders(s.img.mem, h)
	if err != nil {
		t.Fatal(err)
	}
	idx := map[string]int{}
	for i, v := range vars {
		idx[v.Name] = i
	}
	_, buf, ok := latestBuffer(s.img.mem, nil)
	if !ok {
		t.Fatal("no buffer")
	}
	return func(name string) float64 {
		i, ok := idx[name]
		if !ok {
			t.Fatalf("no %s", name)
		}
		return toF(decodeValues(vars, buf, []int{i})[0])
	}, readSessionInfo(s.img.mem, h)
}

func TestLMUConversion(t *testing.T) {
	// LMU_DUMP=file writes the made-up snapshot, to try the app with PITLANE_LMU_FILE
	if p := os.Getenv("LMU_DUMP"); p != "" {
		os.WriteFile(p, fakeLMU(), 0o644)
	}
	s := &lmuSource{img: newIRImage(lmuVarDefs())}
	b := fakeLMU()
	binary.LittleEndian.PutUint64(b[lmuOffScoring+si_mWind:], math.Float64bits(5)) // blowing along +x, west in the game's left-handed frame: from the east
	if !s.convert(b) {
		t.Fatal("conversion found no session")
	}
	get, y := lmuRead(t, s)
	checks := map[string]float64{"PlayerCarIdx": 1, "PlayerCarPosition": 2, "PlayerCarClassPosition": 2, "Gear": 4, "RPM": 7000, "Speed": 70,
		"FuelLevel": 45, "FuelLevelPct": 0.5, "Lap": 6, "LapCompleted": 5, "LapBestLapTime": 211.5, "LapCurrentLapTime": 50,
		"SessionNum": 10, "SessionState": 4, "IsOnTrack": 1, "LFtempCM": 85, "RRwearL": 0.93, "LFbrakeTemp": 450, "CarLeftRight": 2,
		"VelocityX": 70, "AirTemp": 21, "SessionTimeRemain": 3000, "dcTractionControl": 3, "dcBrakeBias": 56, "VirtualEnergyPct": 0.62,
		"WindVel": 5, "WindDir": 0.5 * math.Pi, "YawNorth": 0, "SessionFlags": 0x4, "SessionLapsTotal": 32767}
	for k, want := range checks {
		if got := get(k); math.Abs(got-want) > 0.01 {
			t.Errorf("%s = %v, want %v", k, got, want)
		}
	}
	if p := get("LapDistPct"); math.Abs(p-5980.0/13626) > 1e-4 {
		t.Errorf("LapDistPct = %v", p)
	}
	for _, want := range []string{"TrackDisplayName: Circuit de la Sarthe", "SessionType: Race", "DriverCarIdx: 1", "UserName: Luca Bianchi",
		"CarClassShortName: LMGT3", `CarNumber: "55"`, "DriverCarRedLine: 8500.000", "Game: Le Mans Ultimate", "SessionLaps: unlimited",
		"SessionTime: 3600.0000 sec", "DriverCarFuelKgPerLtr: 0.750"} {
		if !strings.Contains(y, want) {
			t.Errorf("session text lacks %q", want)
		}
	}
	if strings.Contains(y, "SplitTimeInfo") {
		t.Error("the sectors are written before they are learned")
	}
	if yamlField(listItem(y, "CarIdx", "2"), "CarClassShortName") != "LMGT3" {
		t.Errorf("the session parser does not read the drivers")
	}
}

// the official sectors: learned from mSector over two laps, written like iRacing's SplitTimeInfo and kept in the file
func TestLMUSectors(t *testing.T) {
	path := filepath.Join(t.TempDir(), "lmu-sectors.json")
	s := &lmuSource{img: newIRImage(lmuVarDefs()), secPath: path}
	b := fakeLMU()
	po := lmuOffVehScoring + 1*lmuVehScSize
	frame := func(dist float64, sector int) string {
		binary.LittleEndian.PutUint64(b[po+vs_mLapDist:], math.Float64bits(dist))
		b[po+vs_mSector] = byte(sector)
		if !s.convert(b) {
			t.Fatal("no session")
		}
		_, y := lmuRead(t, s)
		return y
	}
	// rF2's numbering: sector 1 is 1, sector 2 is 2, sector 3 is 0; the starts at 4500 m and 9000 m of 13626
	lap := func(s2, s3 float64) {
		for d := 100.0; d < 13600; d += 10 {
			sec := 1
			if d >= s3 {
				sec = 0
			} else if d >= s2 {
				sec = 2
			}
			frame(d, sec)
		}
	}
	lap(4500, 9000)
	if y := frame(100, 1); strings.Contains(y, "SplitTimeInfo") {
		t.Fatal("one lap is not enough to trust the sectors")
	}
	// a glitch (a sector seen 200 m early for one lap) never moves them
	lap(4300, 9000)
	lap(4500, 9000)
	y := frame(100, 1)
	// each start is the middle of the two frames either side of it (4490 and 4500 m, 8990 and 9000 m)
	s2, s3 := fmt.Sprintf("%.6f", 4495.0/13626), fmt.Sprintf("%.6f", 8995.0/13626)
	if !strings.Contains(y, "SplitTimeInfo:\n Sectors:\n - SectorNum: 0\n   SectorStartPct: 0.000000\n - SectorNum: 1\n   SectorStartPct: "+s2+"\n - SectorNum: 2\n   SectorStartPct: "+s3+"\n...") {
		t.Fatalf("session text lacks the sectors:\n%s", y[strings.LastIndex(y, "CurDriverIncidentCount"):])
	}
	if ses := parseOvSession(y); len(ses.Sectors) != 3 || math.Abs(ses.Sectors[1]-4500.0/13626) > 0.001 || math.Abs(ses.Sectors[2]-9000.0/13626) > 0.001 {
		t.Errorf("the overlays read %v", ses.Sectors)
	}
	// the next session on the track has them at once
	var store map[string][3]float64
	readJSON(path, &store)
	if k := store["Circuit de la Sarthe"]; k[1] == 0 || k[2] == 0 {
		t.Fatalf("the file holds %v", store)
	}
	next := &lmuSource{img: newIRImage(lmuVarDefs()), secStore: store}
	if !next.convert(fakeLMU()) {
		t.Fatal("no session")
	}
	if _, y := lmuRead(t, next); !strings.Contains(y, "SectorStartPct: "+s3) {
		t.Error("the learned sectors are not used from the start")
	}
}

func TestLMUStartLights(t *testing.T) {
	s := &lmuSource{img: newIRImage(lmuVarDefs())}
	b := fakeLMU()
	si := lmuOffScoring
	flags := func(phase, light, red int, et float64) int {
		b[si+si_mGamePhase], b[si+si_mStartLight], b[si+si_mNumRedLights] = byte(phase), byte(light), byte(red)
		binary.LittleEndian.PutUint64(b[si+si_mCurrentET:], math.Float64bits(et))
		if !s.convert(b) {
			t.Fatal("no session")
		}
		get, _ := lmuRead(t, s)
		return int(uint32(int64(get("SessionFlags"))))
	}
	for _, c := range []struct {
		phase, light, red int
		et                float64
		want              int
	}{
		{3, 0, 5, 10, lmuStartHidden}, {4, 0, 5, 20, lmuStartReady}, {4, 2, 5, 21, lmuStartReady}, {4, 5, 5, 22, lmuStartSet},
		{4, 6, 5, 23, lmuStartGo}, {5, 0, 5, 24, lmuStartGo | 0x4}, {5, 0, 5, 26, lmuStartGo | 0x4}, {5, 0, 5, 29, 0x4},
	} {
		if got := flags(c.phase, c.light, c.red, c.et); got != c.want {
			t.Errorf("phase %d light %d/%d at %.0f s: flags %#x, want %#x", c.phase, c.light, c.red, c.et, got, c.want)
		}
	}
	// without the number of lamps the countdown says ready and the green says go
	s = &lmuSource{img: newIRImage(lmuVarDefs())}
	if got := flags(4, 3, 0, 40); got != lmuStartReady {
		t.Errorf("countdown without lamps: %#x", got)
	}
	if got := flags(5, 0, 0, 41); got != lmuStartGo|0x4 {
		t.Errorf("green after the countdown: %#x", got)
	}
}

// the fuel rate: 0.03 l/s on the track is 108 l/h, 81 kg/h; the pits and a refuel do not count
func TestLMUFuelRate(t *testing.T) {
	var f lmuFuel
	fuel, et := 60.0, 100.0
	for i := 0; i < 60*60; i++ { // a minute at 60 Hz
		et += 1.0 / 60
		fuel -= 0.03 / 60
		f.note(et, fuel, 60, 0, false)
	}
	if math.Abs(f.rate-108) > 1 {
		t.Fatalf("rate %v l/h, want 108", f.rate)
	}
	for i := 0; i < 60*30; i++ { // half a minute in the pits, refuelling
		et += 1.0 / 60
		fuel += 0.5 / 60
		f.note(et, fuel, 10, 0, true)
	}
	f.note(et+1.0/60, fuel, 60, 0, false)
	if math.Abs(f.rate-108) > 1 {
		t.Fatalf("the pits changed the rate to %v", f.rate)
	}
	s := &lmuSource{img: newIRImage(lmuVarDefs()), fuel: f}
	if !s.convert(fakeLMU()) {
		t.Fatal("no session")
	}
	if get, _ := lmuRead(t, s); math.Abs(get("FuelUsePerHour")-81) > 1 {
		t.Errorf("FuelUsePerHour = %v, want 81 kg/h", get("FuelUsePerHour"))
	}
}

func TestLMUNoSession(t *testing.T) {
	s := &lmuSource{img: newIRImage(lmuVarDefs())}
	if s.convert(make([]byte, lmuDataSize)) {
		t.Fatal("an empty mapping should mean no session")
	}
}

// lmuReadAt reads element i of one of the image's arrays (the field's variables)
func lmuReadAt(t *testing.T, s *lmuSource) func(string, int) float64 {
	t.Helper()
	h, err := readHeader(s.img.mem)
	if err != nil {
		t.Fatal(err)
	}
	vars, err := readVarHeaders(s.img.mem, h)
	if err != nil {
		t.Fatal(err)
	}
	idx := map[string]int{}
	for i, v := range vars {
		idx[v.Name] = i
	}
	_, buf, ok := latestBuffer(s.img.mem, nil)
	if !ok {
		t.Fatal("no buffer")
	}
	return func(name string, i int) float64 {
		k, ok := idx[name]
		if !ok {
			t.Fatalf("no %s", name)
		}
		arr, ok := decodeValues(vars, buf, []int{k})[0].([]any)
		if !ok || i >= len(arr) {
			t.Fatalf("%s has no element %d", name, i)
		}
		return toF(arr[i])
	}
}

// the field's own variables: every car's lap flag, its last lap's sector times (the game keeps sector 2 as the time at
// its end), when its lap started and its position; the pedals and the steering of the cars the game gives telemetry for
// (-1 for the others); the player's own car carries the player's Lat/Lon, from the telemetry, and the player their lap
// flag and penalties
func TestLMUFieldVariables(t *testing.T) {
	s := &lmuSource{img: newIRImage(lmuVarDefs())}
	b := fakeLMU()
	pf64 := func(o int, v float64) { binary.LittleEndian.PutUint64(b[o:], math.Float64bits(v)) }
	pi16 := func(o int, v int) { binary.LittleEndian.PutUint16(b[o:], uint16(int16(v))) }
	o0, po := lmuOffVehScoring, lmuOffVehScoring+1*lmuVehScSize
	b[o0+vs_mCountLapFlag], b[po+vs_mCountLapFlag] = 2, 1
	pf64(o0+vs_mLastSector1, 70.5)
	pf64(o0+vs_mLastSector2, 150.25) // the time at the end of sector 2, sector 1 included
	pf64(po+vs_mLastSector1, -1)     // no lap yet
	pf64(po+vs_mLastSector2, -1)
	pi16(po+vs_mNumPenalties, 2)
	pf64(po+vs_mPos+16, 5) // the scoring's position lags the telemetry's: the player's car takes the telemetry's
	t0, tp := lmuOffTelem, lmuOffTelem+1*lmuTelSize
	pf64(t0+vt_mFilteredBrake, 0.3)
	pf64(t0+vt_mUnfilteredSteering, 0.5) // half of a 360° wheel to the right: 90° to the right
	pf64(tp+vt_mUnfilteredSteering, -0.25)
	b[lmuOffActive] = 2 // the third car has no telemetry slot
	if !s.convert(b) {
		t.Fatal("no session")
	}
	get, _ := lmuRead(t, s)
	at := lmuReadAt(t, s)
	for _, c := range []struct {
		name string
		i    int
		want float64
	}{
		{"CarIdxLapCountFlag", 0, 2}, {"CarIdxLapCountFlag", 1, 1}, {"CarIdxLapCountFlag", 63, -1},
		{"CarIdxLastS1", 0, 70.5}, {"CarIdxLastS2", 0, 79.75}, {"CarIdxLastS1", 1, 0}, {"CarIdxLastS2", 1, 0},
		{"CarIdxLapStartET", 0, 550},
		{"CarIdxThrottle", 0, 0.9}, {"CarIdxBrake", 0, 0.3}, {"CarIdxThrottle", 2, -1}, {"CarIdxBrake", 2, -1}, {"CarIdxThrottle", 63, -1},
		{"CarIdxSteer", 0, -math.Pi / 2}, {"CarIdxSteer", 1, math.Pi / 4}, {"CarIdxSteer", 2, 0},
		{"CarIdxGear", 0, 4}, {"CarIdxGear", 2, 0},
		{"CarIdxTrackSurface", 0, 3}, {"CarIdxTrackSurface", 2, 3}, {"CarIdxBestLapNum", 0, -1}, {"CarIdxBestLapNum", 63, -1},
		{"CarIdxLat", 0, 45 + 40.0/110540}, {"CarIdxLon", 0, 0},
	} {
		if got := at(c.name, c.i); math.Abs(got-c.want) > 1e-4 {
			t.Errorf("%s[%d] = %v, want %v", c.name, c.i, got, c.want)
		}
	}
	for k, want := range map[string]float64{"LapCountFlag": 1, "PlayerNumPenalties": 2, "SteeringWheelAngle": math.Pi / 4, "WeatherDeclaredWet": 0, "Lat": 45, "Lon": 0} {
		if got := get(k); math.Abs(got-want) > 1e-4 {
			t.Errorf("%s = %v, want %v", k, got, want)
		}
	}
	if at("CarIdxLat", 1) != get("Lat") || at("CarIdxLon", 1) != get("Lon") {
		t.Errorf("the player's car is at %v, %v in the field and at %v, %v as the player", at("CarIdxLat", 1), at("CarIdxLon", 1), get("Lat"), get("Lon"))
	}
	if s.telSeen != [2]int{3, 2} {
		t.Errorf("the log counted %v, want 2 of 3 cars with telemetry", s.telSeen)
	}
}

// which lap set a car's best: unknown until mBestLapTime changes, then the lap just ended (the player's as LapBestLap
// too); a best taken away is unknown again and a new session forgets them all
func TestLMUBestLapNum(t *testing.T) {
	s := &lmuSource{img: newIRImage(lmuVarDefs())}
	b := fakeLMU()
	frame := func(laps int, best float64) [3]float64 {
		for _, o := range []int{lmuOffVehScoring, lmuOffVehScoring + 1*lmuVehScSize} {
			binary.LittleEndian.PutUint16(b[o+vs_mTotalLaps:], uint16(laps))
			binary.LittleEndian.PutUint64(b[o+vs_mBestLapTime:], math.Float64bits(best))
		}
		if !s.convert(b) {
			t.Fatal("no session")
		}
		get, _ := lmuRead(t, s)
		at := lmuReadAt(t, s)
		return [3]float64{at("CarIdxBestLapNum", 0), at("CarIdxBestLapNum", 1), get("LapBestLap")}
	}
	for _, c := range []struct {
		laps int
		best float64
		want [3]float64
	}{
		{5, 210.5, [3]float64{-1, -1, 0}}, // a best already set when first seen: the lap unknown
		{5, 210.5, [3]float64{-1, -1, 0}},
		{6, 209, [3]float64{6, 6, 6}}, // the lap just ended set it
		{7, 209, [3]float64{6, 6, 6}},
		{8, 208.2, [3]float64{8, 8, 8}},
		{8, -1, [3]float64{-1, -1, 0}}, // the best taken away
	} {
		if got := frame(c.laps, c.best); got != c.want {
			t.Errorf("laps %d best %v: %v, want %v", c.laps, c.best, got, c.want)
		}
	}
	binary.LittleEndian.PutUint32(b[lmuOffScoring+si_mSession:], 11)
	if got := frame(2, 205); got != [3]float64{-1, -1, 0} {
		t.Errorf("a new session remembers the laps before: %v", got)
	}
	if got := frame(3, 204); got != [3]float64{3, 3, 3} {
		t.Errorf("the new session's best: %v", got)
	}
}

// off the track only with all four wheels on grass, dirt or gravel, a kerb never (two wheels on the grass are a wide
// line), for the player and for the cars with telemetry; the pits say so whatever the wheels; the surface under most
// wheels as iRacing's material
func TestLMUWheelsOff(t *testing.T) {
	s := &lmuSource{img: newIRImage(lmuVarDefs())}
	b := fakeLMU()
	wheels := func(tel int, st [4]int) {
		for k, v := range st {
			b[lmuOffTelem+tel*lmuTelSize+vt_mWheels+k*lmuWheelSize+wh_mSurfaceType] = byte(v)
		}
	}
	for _, c := range []struct {
		st        [4]int
		surf, mat float64
	}{
		{[4]int{0, 0, 0, 0}, 3, 1}, {[4]int{1, 1, 1, 1}, 3, 1}, {[4]int{0, 0, 2, 2}, 3, 15}, {[4]int{2, 2, 2, 0}, 3, 15},
		{[4]int{2, 2, 2, 5}, 3, 15}, {[4]int{2, 2, 2, 2}, 0, 15}, {[4]int{5, 5, 5, 5}, 3, 11}, {[4]int{0, 0, 0, 5}, 3, 1},
		{[4]int{4, 4, 4, 5}, 3, 24}, {[4]int{3, 3, 3, 3}, 0, 19}, {[4]int{4, 4, 4, 4}, 0, 24}, {[4]int{2, 3, 4, 2}, 0, 15},
	} {
		wheels(1, c.st) // the player
		wheels(0, c.st) // a rival with telemetry
		if !s.convert(b) {
			t.Fatal("no session")
		}
		get, _ := lmuRead(t, s)
		at := lmuReadAt(t, s)
		if got, mat := get("PlayerTrackSurface"), get("PlayerTrackSurfaceMaterial"); got != c.surf || mat != c.mat {
			t.Errorf("wheels %v: PlayerTrackSurface %v material %v, want %v and %v", c.st, got, mat, c.surf, c.mat)
		}
		if a, p := at("CarIdxTrackSurface", 0), at("CarIdxTrackSurface", 1); a != c.surf || p != c.surf {
			t.Errorf("wheels %v: CarIdxTrackSurface %v (rival) %v (player), want %v", c.st, a, p, c.surf)
		}
	}
	wheels(0, [4]int{2, 2, 2, 2})
	b[lmuOffVehScoring+vs_mInPits] = 1
	if !s.convert(b) {
		t.Fatal("no session")
	}
	if got := lmuReadAt(t, s)("CarIdxTrackSurface", 0); got != 2 {
		t.Errorf("in the pits on the grass: CarIdxTrackSurface %v, want 2", got)
	}
}

// the game's wetness on iRacing's scale (4, lightly wet, is where a lap is tagged wet) and the wet declaration from the rain
func TestLMUWetness(t *testing.T) {
	for _, c := range []struct {
		w    float64
		want int
	}{{0, 1}, {0.019, 1}, {0.02, 2}, {0.09, 2}, {0.1, 3}, {0.19, 3}, {0.2, 4}, {0.34, 4}, {0.35, 5}, {0.54, 5}, {0.55, 6}, {0.79, 6}, {0.8, 7}, {1, 7}} {
		if got := lmuWetness(c.w); got != c.want {
			t.Errorf("wetness %v: %d, want %d", c.w, got, c.want)
		}
	}
	s := &lmuSource{img: newIRImage(lmuVarDefs())}
	b := fakeLMU()
	si := lmuOffScoring
	pf64 := func(o int, v float64) { binary.LittleEndian.PutUint64(b[o:], math.Float64bits(v)) }
	pf64(si+si_mAvgPathWetness, 0.25)
	pf64(si+si_mRaining, 0.3)
	if !s.convert(b) {
		t.Fatal("no session")
	}
	get, _ := lmuRead(t, s)
	if get("TrackWetness") != 4 || get("WeatherDeclaredWet") != 1 || math.Abs(get("Precipitation")-0.3) > 1e-4 {
		t.Errorf("wetness %v declared wet %v rain %v", get("TrackWetness"), get("WeatherDeclaredWet"), get("Precipitation"))
	}
	pf64(si+si_mRaining, 0)
	pf64(si+si_mAvgPathWetness, 0.01)
	if !s.convert(b) {
		t.Fatal("no session")
	}
	if get, _ = lmuRead(t, s); get("TrackWetness") != 1 || get("WeatherDeclaredWet") != 0 {
		t.Errorf("dry: wetness %v declared wet %v", get("TrackWetness"), get("WeatherDeclaredWet"))
	}
}

// contacts as incidents: a strong impact is 4 points (a Car Contact), a light one none, never the 1 of an Off Track; an
// impact counts once, the one found when the program starts watching never, and a new session starts at zero
func TestLMUImpacts(t *testing.T) {
	s := &lmuSource{img: newIRImage(lmuVarDefs())}
	b := fakeLMU()
	tp := lmuOffTelem + 1*lmuTelSize
	frame := func(et, mag float64) float64 {
		binary.LittleEndian.PutUint64(b[tp+vt_mLastImpactET:], math.Float64bits(et))
		binary.LittleEndian.PutUint64(b[tp+vt_mLastImpactMagnitude:], math.Float64bits(mag))
		if !s.convert(b) {
			t.Fatal("no session")
		}
		get, _ := lmuRead(t, s)
		if get("PlayerCarDriverIncidentCount") != get("PlayerCarMyIncidentCount") {
			t.Errorf("the team's count %v differs from the driver's %v", get("PlayerCarDriverIncidentCount"), get("PlayerCarMyIncidentCount"))
		}
		return get("PlayerCarMyIncidentCount")
	}
	for _, c := range []struct{ et, mag, want float64 }{
		{0, 0, 0},       // no impact yet
		{10, 200, 0},    // a light touch
		{20, 5000, 4},   // a crash
		{20.3, 5000, 4}, // the same one, still reported
		{21, 1000, 8},   // another, at the line
		{22, 999, 8},    // under it
		{22, 999, 8},    // nothing new
	} {
		if got := frame(c.et, c.mag); got != c.want {
			t.Errorf("impact at %v s of %v: %v points, want %v", c.et, c.mag, got, c.want)
		}
	}
	// another session starts at zero, and the impact it finds reported is not one of its own
	binary.LittleEndian.PutUint32(b[lmuOffScoring+si_mSession:], 11)
	if got := frame(22, 999); got != 0 {
		t.Errorf("a new session starts with %v points", got)
	}
	if got := frame(30, 5000); got != 4 {
		t.Errorf("the new session's crash: %v points, want 4", got)
	}
	// a program started mid-session: the crash already there is not counted, the next is
	s = &lmuSource{img: newIRImage(lmuVarDefs())}
	if got := frame(300, 5000); got != 0 {
		t.Errorf("the impact before the program watched counts %v", got)
	}
	if got := frame(310, 5000); got != 4 {
		t.Errorf("the first impact watched: %v points, want 4", got)
	}
}

// the log of how many cars have telemetry: once, again when the number changes (not within ten seconds of the last
// line, a car to the garage and back), and at once when the clock started again
func TestLMUTelemetryLog(t *testing.T) {
	s := &lmuSource{}
	cars := []lmuCar{{tel: 0}, {tel: 1}, {tel: -1}}
	if !s.noteTelemetry(cars, 100) {
		t.Fatal("the first frame says nothing")
	}
	if s.telSeen != [2]int{3, 2} {
		t.Fatalf("counted %v, want 2 of 3", s.telSeen)
	}
	if s.noteTelemetry(cars, 101) {
		t.Fatal("the same numbers again")
	}
	cars[2].tel = 2
	if s.noteTelemetry(cars, 105) {
		t.Fatal("a change within ten seconds went out at once")
	}
	if !s.noteTelemetry(cars, 111) {
		t.Fatal("the change never went out")
	}
	if s.telSeen != [2]int{3, 3} {
		t.Errorf("counted %v, want 3 of 3", s.telSeen)
	}
	cars[2].tel = -1
	if !s.noteTelemetry(cars, 2) {
		t.Error("the clock started again and the change waited")
	}
}

// a Le Mans Ultimate driver's id comes from the name the game shows: the same in every session, different per
// driver, far above iRacing's ids, none for a nameless car
func TestLMUDriverIDs(t *testing.T) {
	a, b := lmuDriverID("Ana García"), lmuDriverID("Luis Pérez")
	if a == b || a < 1_000_000_000 || b < 1_000_000_000 {
		t.Fatalf("ids %d %d", a, b)
	}
	if lmuDriverID(" Ana García ") != a {
		t.Fatal("the same name, another id")
	}
	if lmuDriverID("") != 0 || lmuDriverID("  ") != 0 {
		t.Fatal("an id for no name")
	}
	cars := []lmuCar{{name: "Ana García"}, {name: "Luis Pérez"}}
	if lmuPlayerName(cars, 1) != "Luis Pérez" || lmuPlayerName(cars, -1) != "" || lmuPlayerName(cars, 5) != "" {
		t.Fatal("player name")
	}
}

// every car keeps its index for the session: the game's own array closes up when a car leaves, but the image's CarIdx
// (and the session text's) follows each car, the slot left stays empty (not in the world) and is never given again, a
// car that joins takes the next one, and another session starts the indexes again
func TestLMUStableCarIdx(t *testing.T) {
	s := &lmuSource{img: newIRImage(lmuVarDefs())}
	b := fakeLMU()
	si := lmuOffScoring
	pf64 := func(o int, v float64) { binary.LittleEndian.PutUint64(b[o:], math.Float64bits(v)) }
	pi32 := func(o int, v int) { binary.LittleEndian.PutUint32(b[o:], uint32(int32(v))) }
	block := func(slot int) []byte {
		return b[lmuOffVehScoring+slot*lmuVehScSize : lmuOffVehScoring+(slot+1)*lmuVehScSize]
	}
	car := func(slot, id int, name string, dist float64) { // a car in a scoring slot (no telemetry)
		copy(block(slot), block(2))
		o := lmuOffVehScoring + slot*lmuVehScSize
		pi32(o+vs_mID, id)
		clear(b[o+vs_mDriverName : o+vs_mDriverName+32])
		copy(b[o+vs_mDriverName:], name)
		b[o+vs_mIsPlayer] = 0
		pf64(o+vs_mLapDist, dist)
	}
	frame := func(n int) (func(string, int) float64, func(string) float64, string) {
		pi32(si+si_mNumVehicles, n)
		if !s.convert(b) {
			t.Fatal("no session")
		}
		get, y := lmuRead(t, s)
		return lmuReadAt(t, s), get, y
	}
	pct := func(dist float64) float64 { return dist / 13626 }
	near := func(a, b float64) bool { return math.Abs(a-b) < 1e-4 } // the image keeps the fraction as a float32
	name := func(y string, idx int) string { return yamlField(driverBlock(y, fmt.Sprint(idx)), "UserName") }
	car(3, 103, "Pau Vidal", 7000)
	at, get, y := frame(4)
	if !near(at("CarIdxLapDistPct", 3), pct(7000)) || get("PlayerCarIdx") != 1 || yamlField(y, "DriverCarIdx") != "1" || name(y, 3) != "Pau Vidal" {
		t.Fatalf("four cars: Pau at %v (want %v), player %v / %q, CarIdx 3 is %q", at("CarIdxLapDistPct", 3), pct(7000), get("PlayerCarIdx"), yamlField(y, "DriverCarIdx"), name(y, 3))
	}
	// the third car (id 102) leaves: Pau moves to the game's slot 2 and keeps index 3; index 2 is empty
	copy(block(2), block(3))
	at, get, y = frame(3)
	if !near(at("CarIdxLapDistPct", 3), pct(7000)) || name(y, 3) != "Pau Vidal" || name(y, 2) != "" {
		t.Fatalf("after a car left: index 3 at %v is %q, index 2 is %q", at("CarIdxLapDistPct", 3), name(y, 3), name(y, 2))
	}
	for _, v := range []string{"CarIdxLapDistPct", "CarIdxTrackSurface", "CarIdxLapCountFlag", "CarIdxThrottle", "CarIdxBrake", "CarIdxBestLapNum"} {
		if at(v, 2) != -1 {
			t.Errorf("the slot left: %s[2] = %v, want -1", v, at(v, 2))
		}
	}
	if get("PlayerCarIdx") != 1 || yamlField(y, "DriverCarIdx") != "1" || at("CarIdxLat", 1) != get("Lat") || !near(at("CarIdxLapDistPct", 0), pct(6000)) {
		t.Fatalf("the player and the leader moved: %v / %q, lat %v vs %v, leader at %v", get("PlayerCarIdx"), yamlField(y, "DriverCarIdx"), at("CarIdxLat", 1), get("Lat"), at("CarIdxLapDistPct", 0))
	}
	// a car joins: the next index, never the slot left
	car(3, 104, "Nour Haddad", 8000)
	at, _, y = frame(4)
	if !near(at("CarIdxLapDistPct", 4), pct(8000)) || name(y, 4) != "Nour Haddad" || at("CarIdxLapDistPct", 2) != -1 || name(y, 2) != "" {
		t.Fatalf("a car joined: index 4 at %v is %q, index 2 at %v is %q", at("CarIdxLapDistPct", 4), name(y, 4), at("CarIdxLapDistPct", 2), name(y, 2))
	}
	// another session: the indexes start again in the order the cars come
	pi32(si+si_mSession, 11)
	at, _, y = frame(4)
	if !near(at("CarIdxLapDistPct", 2), pct(7000)) || name(y, 2) != "Pau Vidal" || !near(at("CarIdxLapDistPct", 3), pct(8000)) || at("CarIdxLapDistPct", 4) != -1 {
		t.Fatalf("a new session: index 2 at %v is %q, index 3 at %v, index 4 at %v", at("CarIdxLapDistPct", 2), name(y, 2), at("CarIdxLapDistPct", 3), at("CarIdxLapDistPct", 4))
	}
}
