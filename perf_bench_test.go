package main

// Benchmarks of the agent's hot paths (the ones that run 30 to 60 times a second, or on every session change), so a
// change to them can be measured: go test -run '^$' -bench . -benchmem

import (
	"encoding/binary"
	"encoding/json"
	"fmt"
	"io"
	"log"
	"math"
	"strconv"
	"testing"
	"time"
)

// quietLog keeps the source's log lines out of a benchmark's output
func quietLog(b *testing.B) {
	w := log.Writer()
	log.SetOutput(io.Discard)
	b.Cleanup(func() { log.SetOutput(w) })
}

// fakeLMUField: fakeLMU's snapshot with n cars (the first three its own, the rest copies of the third car with their
// own ids, names, numbers, classes and places, every one with telemetry)
func fakeLMUField(n int) []byte {
	b := fakeLMU()
	pi32 := func(o int, v int) { binary.LittleEndian.PutUint32(b[o:], uint32(int32(v))) }
	pf64 := func(o int, v float64) { binary.LittleEndian.PutUint64(b[o:], math.Float64bits(v)) }
	pi16 := func(o int, v int) { binary.LittleEndian.PutUint16(b[o:], uint16(int16(v))) }
	classes := []string{"Hypercar", "LMP2", "LMGT3"}
	for i := 3; i < n; i++ {
		o := lmuOffVehScoring + i*lmuVehScSize
		copy(b[o:o+lmuVehScSize], b[lmuOffVehScoring+2*lmuVehScSize:lmuOffVehScoring+3*lmuVehScSize])
		pi32(o+vs_mID, 100+i)
		name := fmt.Sprintf("Driver Number %d", i)
		clear(b[o+vs_mDriverName : o+vs_mDriverName+32])
		copy(b[o+vs_mDriverName:], name)
		clear(b[o+vs_mVehicleName : o+vs_mVehicleName+64])
		copy(b[o+vs_mVehicleName:], fmt.Sprintf("Car Model %d #%d", i%7, i+10))
		clear(b[o+vs_mVehicleClass : o+vs_mVehicleClass+32])
		copy(b[o+vs_mVehicleClass:], classes[i%3])
		b[o+vs_mPlace] = byte(i + 1)
		pi16(o+vs_mTotalLaps, 5)
		pf64(o+vs_mLapDist, 6000-float64(i)*90)
		pf64(o+vs_mPos, float64(i)*7)
		pf64(o+vs_mPos+16, float64(i)*-11)
		t := lmuOffTelem + i*lmuTelSize
		copy(b[t:t+lmuTelSize], b[lmuOffTelem+2*lmuTelSize:lmuOffTelem+3*lmuTelSize])
		pi32(t+vt_mID, 100+i)
	}
	pi32(lmuOffScoring+si_mNumVehicles, n)
	b[lmuOffActive] = byte(n)
	return b
}

// lmuFrameAdvance moves the clock and every car 1/60 s on (60 m/s), as the next frame would
func lmuFrameAdvance(b []byte, n, k int) {
	pf64 := func(o int, v float64) { binary.LittleEndian.PutUint64(b[o:], math.Float64bits(v)) }
	pf64(lmuOffScoring+si_mCurrentET, 600+float64(k)/60)
	for i := 0; i < n; i++ {
		o := lmuOffVehScoring + i*lmuVehScSize
		d := lf64(b, o+vs_mLapDist) + 1
		if d > 13000 {
			d = 100
		}
		pf64(o+vs_mLapDist, d)
	}
}

func BenchmarkLMUConvert60(b *testing.B) {
	quietLog(b)
	s := &lmuSource{img: newIRImage(lmuVarDefs())}
	snap := fakeLMUField(60)
	s.convert(snap)
	b.ReportAllocs()
	b.ResetTimer()
	for k := 0; k < b.N; k++ {
		lmuFrameAdvance(snap, 60, k)
		s.convert(snap)
	}
}

// lmuBenchSession: the session text of a 60-car LMU session, as writeSession makes it
func lmuBenchSession(tb testing.TB) string {
	if b, ok := tb.(*testing.B); ok {
		quietLog(b)
	}
	s := &lmuSource{img: newIRImage(lmuVarDefs())}
	if !s.convert(fakeLMUField(60)) {
		tb.Fatal("no session")
	}
	h, err := readHeader(s.img.mem)
	if err != nil {
		tb.Fatal(err)
	}
	return readSessionInfo(s.img.mem, h)
}

func BenchmarkYAMLField(b *testing.B) {
	y := lmuBenchSession(b)
	b.ReportAllocs()
	b.ResetTimer()
	for k := 0; k < b.N; k++ {
		for _, key := range []string{"TrackID", "SubSessionID", "TrackDisplayName", "DriverCarIdx", "TrackLength"} {
			yamlField(y, key)
		}
	}
}

func BenchmarkDriverBlock60(b *testing.B) {
	y := lmuBenchSession(b)
	b.ReportAllocs()
	b.ResetTimer()
	for k := 0; k < b.N; k++ {
		for i := 0; i < 60; i++ {
			yamlField(driverBlock(y, strconv.Itoa(i)), "UserName")
		}
	}
}

func BenchmarkSessionResults60(b *testing.B) {
	y := lmuBenchSession(b)
	if len(sessionResults(y, 10)) != 60 {
		b.Fatal("not 60 results")
	}
	b.ReportAllocs()
	b.ResetTimer()
	for k := 0; k < b.N; k++ {
		sessionResults(y, 10)
	}
}

func BenchmarkSessionKey(b *testing.B) {
	y := lmuBenchSession(b)
	b.ReportAllocs()
	b.ResetTimer()
	for k := 0; k < b.N; k++ {
		sessionKey(y)
	}
}

// the field watcher's step with 60 cars going round a 5 km track, 60 samples a second
func BenchmarkFieldStep60(b *testing.B) {
	const n, L = 60, 5000.0
	fieldSession(fmt.Sprintf("bench-%d", time.Now().UnixNano()))
	mk := func(v float64) []float64 {
		a := make([]float64, n)
		for i := range a {
			a[i] = v
		}
		return a
	}
	s := fieldSample{pct: mk(0), lap: mk(1), last: mk(0), best: mk(0), pit: mk(0), surf: mk(3), gear: mk(4), rpm: mk(7000),
		steer: mk(0.1), thr: mk(-1), brk: mk(-1), lat: mk(0), lon: mk(0), cnt: mk(2), start: mk(0), mat: mk(1), wet: 1}
	pos := make([]float64, n)
	for i := range pos {
		pos[i] = float64(i) * 80
	}
	b.ReportAllocs()
	b.ResetTimer()
	for k := 0; k < b.N; k++ {
		s.t = 100 + float64(k)/60
		for i := 0; i < n; i++ {
			pos[i] += 1
			lap := int(pos[i] / L)
			s.lap[i] = float64(lap + 1)
			s.pct[i] = (pos[i] - float64(lap)*L) / L
			s.lat[i], s.lon[i] = 45+s.pct[i]*0.01, 7+s.pct[i]*0.01
			if lap > 0 {
				s.last[i] = 83.3
			}
		}
		fieldStep(&s, L, "bench")
	}
}

// the player's lap recorder, 30 samples a second on a 3 km lap
func BenchmarkLapStreamStep(b *testing.B) {
	env := &lapTestEnv{t: time.Unix(1000, 0), vars: map[string]bool{"PlayerTrackSurface": true, "Lat": true, "Lon": true, "LapCountFlag": true,
		"PlayerTrackSurfaceMaterial": true, "TrackWetness": true, "PlayerTireCompound": true, "PlayerNumPenalties": true}}
	ls := newLapStream(env)
	const L, sp, hz = 3000.0, 60.0, 30.0
	v := make([]float64, len(lapVars))
	b.ReportAllocs()
	b.ResetTimer()
	for k := 0; k < b.N; k++ {
		st := float64(k) / hz
		pos := st * sp
		lap := int(pos / L)
		d := pos - float64(lap)*L
		clear(v)
		v[0], v[1], v[2], v[3] = float64(lap+1), d, d/L, sp
		v[9], v[12], v[13], v[14] = 50, 1, 0, st
		v[17], v[18], v[27] = d/sp, 3, 2
		v[23], v[24] = 45+d/1e5, 7+d/1e5
		v[28], v[29] = 1, 1
		ls.step(v)
		if len(env.ended) > 50 {
			env.ended = env.ended[:0]
		}
	}
}

// the telemetry of a 60-car LMU frame in the reader's place (tel), as the stream and telNums read it
func benchTel(b *testing.B) (vars []VarHeader, buf []byte) {
	quietLog(b)
	s := &lmuSource{img: newIRImage(lmuVarDefs())}
	s.convert(fakeLMUField(60))
	h, err := readHeader(s.img.mem)
	if err != nil {
		b.Fatal(err)
	}
	vars, err = readVarHeaders(s.img.mem, h)
	if err != nil {
		b.Fatal(err)
	}
	_, buf, _ = latestBuffer(s.img.mem, nil)
	idx := map[string]int{}
	for i, v := range vars {
		idx[v.Name] = i
	}
	tel.mu.Lock()
	tel.vars, tel.index, tel.buf = vars, idx, append([]byte(nil), buf...)
	tel.mu.Unlock()
	b.Cleanup(func() {
		tel.mu.Lock()
		tel.vars, tel.index, tel.buf = nil, map[string]int{}, nil
		tel.mu.Unlock()
	})
	return vars, buf
}

// the lap recorder's read of its values, 30 times a second (into the storage it keeps)
func BenchmarkTelNumsLapVars(b *testing.B) {
	benchTel(b)
	var v []float64
	b.ReportAllocs()
	b.ResetTimer()
	for k := 0; k < b.N; k++ {
		v = telNumsInto(v, lapVars)
	}
}

// one frame of the live stream with every variable, as /api/stream?vars=* sends it to the page
func BenchmarkStreamFrameAll(b *testing.B) {
	vars, buf := benchTel(b)
	want := make([]int, len(vars))
	for i := range want {
		want[i] = i
	}
	var out []byte
	b.ReportAllocs()
	b.ResetTimer()
	for k := 0; k < b.N; k++ {
		out, _ = streamFrame(out[:0], vars, buf, want, int32(k))
	}
}

// one frame of the live stream with the relative overlay's values
func BenchmarkStreamFrameRelative(b *testing.B) {
	vars, buf := benchTel(b)
	var want []int
	for i, v := range vars {
		switch v.Name {
		case "CarIdxLapDistPct", "CarIdxEstTime", "CarIdxLap", "CarIdxOnPitRoad", "CarIdxPosition", "CarIdxClassPosition",
			"CarIdxLastLapTime", "PlayerCarIdx", "SessionTime", "SessionNum", "CarIdxTrackSurface", "LapDistPct":
			want = append(want, i)
		}
	}
	var out []byte
	b.ReportAllocs()
	b.ResetTimer()
	for k := 0; k < b.N; k++ {
		out, _ = streamFrame(out[:0], vars, buf, want, int32(k))
	}
}

// an overlay window reading a frame of the stream (the relative's values) and the values it draws
func BenchmarkOverlayFrameRead(b *testing.B) {
	vars, buf := benchTel(b)
	var want []int
	var names []string
	for i, v := range vars {
		switch v.Name {
		case "CarIdxLapDistPct", "CarIdxEstTime", "CarIdxLap", "CarIdxOnPitRoad", "CarIdxPosition", "CarIdxClassPosition",
			"CarIdxLastLapTime", "PlayerCarIdx", "SessionTime", "SessionNum", "CarIdxTrackSurface", "LapDistPct":
			want = append(want, i)
			names = append(names, v.Name)
		}
	}
	frame, _ := streamFrame(nil, vars, buf, want, 1)
	data := string(frame)
	st := &ovState{frame: map[string]json.RawMessage{}}
	b.ReportAllocs()
	b.ResetTimer()
	for k := 0; k < b.N; k++ {
		var f struct{ V []json.RawMessage }
		if json.Unmarshal([]byte(data), &f) != nil {
			b.Fatal("bad frame")
		}
		for i, n := range names {
			st.frame[n] = f.V[i]
		}
		for _, n := range names {
			if len(st.arr(n)) == 0 {
				st.num(n)
			}
		}
	}
}
