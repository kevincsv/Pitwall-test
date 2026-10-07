package main

import (
	"encoding/binary"
	"math"
	"os"
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

func TestLMUConversion(t *testing.T) {
	// LMU_DUMP=file writes the made-up snapshot, to try the app with PITLANE_LMU_FILE
	if p := os.Getenv("LMU_DUMP"); p != "" {
		os.WriteFile(p, fakeLMU(), 0o644)
	}
	s := &lmuSource{img: newIRImage(lmuVarDefs())}
	if !s.convert(fakeLMU()) {
		t.Fatal("conversion found no session")
	}
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
	get := func(name string) float64 {
		i, ok := idx[name]
		if !ok {
			t.Fatalf("no %s", name)
		}
		return toF(decodeValues(vars, buf, []int{i})[0])
	}
	checks := map[string]float64{"PlayerCarIdx": 1, "PlayerCarPosition": 2, "PlayerCarClassPosition": 2, "Gear": 4, "RPM": 7000, "Speed": 70,
		"FuelLevel": 45, "FuelLevelPct": 0.5, "Lap": 6, "LapCompleted": 5, "LapBestLapTime": 211.5, "LapCurrentLapTime": 50,
		"SessionNum": 10, "SessionState": 4, "IsOnTrack": 1, "LFtempCM": 85, "RRwearL": 0.93, "LFbrakeTemp": 450, "CarLeftRight": 2,
		"VelocityX": 70, "AirTemp": 21, "SessionTimeRemain": 3000, "dcTractionControl": 3, "dcBrakeBias": 56, "VirtualEnergyPct": 0.62}
	for k, want := range checks {
		if got := get(k); math.Abs(got-want) > 0.01 {
			t.Errorf("%s = %v, want %v", k, got, want)
		}
	}
	if p := get("LapDistPct"); math.Abs(p-5980.0/13626) > 1e-4 {
		t.Errorf("LapDistPct = %v", p)
	}
	y := readSessionInfo(s.img.mem, h)
	for _, want := range []string{"TrackDisplayName: Circuit de la Sarthe", "SessionType: Race", "DriverCarIdx: 1", "UserName: Luca Bianchi",
		"CarClassShortName: LMGT3", `CarNumber: "55"`, "DriverCarRedLine: 8500.000", "Game: Le Mans Ultimate"} {
		if !strings.Contains(y, want) {
			t.Errorf("session text lacks %q", want)
		}
	}
	if yamlField(listItem(y, "CarIdx", "2"), "CarClassShortName") != "LMGT3" {
		t.Errorf("the session parser does not read the drivers")
	}
}

func TestLMUNoSession(t *testing.T) {
	s := &lmuSource{img: newIRImage(lmuVarDefs())}
	if s.convert(make([]byte, lmuDataSize)) {
		t.Fatal("an empty mapping should mean no session")
	}
}
