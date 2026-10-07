package main

import (
	"encoding/binary"
	"math"
	"os"
	"path/filepath"
	"strings"
	"testing"
	"unicode/utf16"
)

// made-up ACC pages: Monza, the player 3rd, a car 3 m to the side and one far ahead
func fakeACC() (p, g, st []byte) {
	p, g, st = make([]byte, acPhysSize), make([]byte, acGraphSize), make([]byte, acStaticSize)
	f := func(b []byte, o int, v float64) { binary.LittleEndian.PutUint32(b[o:], math.Float32bits(float32(v))) }
	i := func(b []byte, o, v int) { binary.LittleEndian.PutUint32(b[o:], uint32(int32(v))) }
	w := func(b []byte, o int, s string) {
		for k, c := range utf16.Encode([]rune(s)) {
			binary.LittleEndian.PutUint16(b[o+2*k:], c)
		}
	}
	f(p, acp_speedKmh, 180)
	i(p, acp_rpm, 7200)
	i(p, acp_gear, 5) // 4th
	f(p, acp_gas, 1)
	f(p, acp_fuel, 60)
	f(p, acp_brakeBias, 0.575)
	for k := 0; k < 4; k++ {
		f(p, acp_tyreCoreTemperature+4*k, 82)
		f(p, acp_wheelsPressure+4*k, 27.5)
		f(p, acp_brakeTemp+4*k, 420)
	}
	f(p, acp_airTemp, 24)
	f(p, acp_roadTemp, 33)
	i(g, acg_acc_status, 2)
	i(g, acg_completedLaps, 3)
	i(g, acg_position, 3)
	i(g, acg_iCurrentTime, 41250)
	i(g, acg_iLastTime, 108400)
	i(g, acg_iBestTime, 107900)
	f(g, acg_normalizedCarPosition, 0.5)
	i(g, acg_activeCars, 3)
	i(g, acg_playerCarID, 12)
	cars := [][3]float64{{12, 0, 0}, {33, 3, 0}, {7, 0, -800}} // id, x, z
	for k, c := range cars {
		i(g, acg_carID+4*k, int(c[0]))
		f(g, acg_carCoordinates+12*k, c[1])
		f(g, acg_carCoordinates+12*k+8, c[2])
	}
	i(g, acg_TC, 4)
	i(g, acg_ABS, 3)
	i(g, acg_EngineMap, 0)
	f(g, acg_fuelXLap, 2.9)
	w(st, acs_track, "monza")
	w(st, acs_carModel, "porsche_991ii_gt3_r")
	w(st, acs_playerName, "Driver")
	i(st, acs_maxRpm, 9250)
	f(st, acs_maxFuel, 120)
	f(st, acs_trackSplineLength, 5793)
	return
}

func TestACCConversion(t *testing.T) {
	p, g, st := fakeACC()
	if d := os.Getenv("ACC_DUMP"); d != "" {
		os.MkdirAll(d, 0o755)
		os.WriteFile(filepath.Join(d, "physics.bin"), p, 0o644)
		os.WriteFile(filepath.Join(d, "graphics.bin"), g, 0o644)
		os.WriteFile(filepath.Join(d, "static.bin"), st, 0o644)
	}
	s := &acSource{acc: true, img: newIRImage(acVarDefs()), lastLaps: -1}
	// the track was learned on earlier laps: a straight along -z
	for k := 0; k < acPathBins; k++ {
		s.path[k], s.pathOK[k] = [2]float64{0, -float64(k-500) * 5.793}, true
	}
	s.prev, s.fwd = [2]float64{0, 1}, [2]float64{0, -1} // driving towards -z
	if !s.convert(p, g, st) {
		t.Fatal("no session")
	}
	h, _ := readHeader(s.img.mem)
	vars, _ := readVarHeaders(s.img.mem, h)
	idx := map[string]int{}
	for k, v := range vars {
		idx[v.Name] = k
	}
	_, buf, ok := latestBuffer(s.img.mem, nil)
	if !ok {
		t.Fatal("no buffer")
	}
	get := func(n string) float64 { return toF(decodeValues(vars, buf, []int{idx[n]})[0]) }
	for k, want := range map[string]float64{"Speed": 50, "RPM": 7200, "Gear": 4, "PlayerCarPosition": 3, "Lap": 4, "LapBestLapTime": 107.9,
		"LapCurrentLapTime": 41.25, "FuelLevel": 60, "FuelLevelPct": 0.5, "LFtempCM": 82, "RRbrakeTemp": 420, "dcTractionControl": 4,
		"dcBrakeBias": 57.5, "LapDist": 2896.5, "AirTemp": 24, "LFpressure": 27.5 * 6.89476, "IsOnTrack": 1} {
		if got := get(k); math.Abs(got-want) > 0.01 {
			t.Errorf("%s = %v, want %v", k, got, want)
		}
	}
	// the car 800 m further along the straight is ahead on the lap
	arr, _ := decodeValues(vars, buf, []int{idx["CarIdxLapDistPct"]})[0].([]any)
	if len(arr) < 3 {
		t.Fatal("no car positions")
	}
	if p2 := toF(arr[2]); math.Abs(p2-(0.5+800/5793.0)) > 0.01 {
		t.Errorf("car ahead at %v", p2)
	}
	if lr := get("CarLeftRight"); lr != 2 && lr != 3 {
		t.Errorf("CarLeftRight = %v, want a car alongside", lr)
	}
	y := readSessionInfo(s.img.mem, h)
	for _, want := range []string{"TrackDisplayName: Monza", "CarScreenName: Porsche 991ii Gt3 R", "UserName: Driver", "Game: Assetto Corsa Competizione", "TrackLength: 5.79 km"} {
		if !strings.Contains(y, want) {
			t.Errorf("session lacks %q", want)
		}
	}
}
