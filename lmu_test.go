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
