package main

import (
	"encoding/binary"
	"encoding/json"
	"math"
	"os"
	"path/filepath"
	"strings"
	"testing"
	"time"
)

// a small telemetry file like iRacing writes: header, disk sub-header, variable headers, session YAML and the samples
type ibtVar struct {
	name string
	typ  int32
}

var testIBTVars = []ibtVar{{"Lap", TypeInt}, {"LapDist", TypeFloat}, {"LapDistPct", TypeFloat}, {"Speed", TypeFloat},
	{"Throttle", TypeFloat}, {"Brake", TypeFloat}, {"Gear", TypeInt}, {"SteeringWheelAngle", TypeFloat},
	{"LapLastLapTime", TypeFloat}, {"FuelLevel", TypeFloat}, {"OnPitRoad", TypeBool}, {"PlayerCarMyIncidentCount", TypeInt},
	{"IsOnTrack", TypeBool}, {"SessionNum", TypeInt}, {"SessionTime", TypeDouble}, {"AirTemp", TypeFloat},
	{"TrackTempCrew", TypeFloat}, {"LapCurrentLapTime", TypeFloat}, {"PlayerTrackSurface", TypeInt},
	{"Lat", TypeDouble}, {"Lon", TypeDouble}, {"PlayerCarIdx", TypeInt}}

const testIBTYAML = "WeekendInfo:\n TrackDisplayName: Test Ring\n TrackID: 77\n SubSessionID: %SUB%\n Official: 1\n Category: Road\n TrackLength: 1.00 km\nSessionInfo:\n Sessions:\n - SessionNum: 0\n   SessionType: Race\nDriverInfo:\n DriverCarIdx: 0\n Drivers:\n - CarIdx: 0\n   UserName: Driver T.\n   CarScreenName: Test Car\n   CarID: 99\n   LicString: B 3.21\n"

// writeTestIBT: 3 laps of 20 s on a 1 km circle at 60 samples a second, then a moment of the 4th; offAt (seconds
// from the start, -1 none) leaves the track for one second
func writeTestIBT(t *testing.T, path, sub string, offAt float64) {
	writeTestIBTYAML(t, path, strings.ReplaceAll(testIBTYAML, "%SUB%", sub), offAt)
}

func writeTestIBTYAML(t *testing.T, path, yaml string, offAt float64) {
	const tick, L, v = 60, 1000.0, 50.0 // m, m/s: 20 s a lap
	off := map[string]int{}
	bufLen := 0
	for _, x := range testIBTVars {
		off[x.name] = bufLen
		bufLen += typeSize[x.typ]
	}
	varOff := headerSize + ibtDiskHeaderSize
	sessOff := varOff + len(testIBTVars)*varHeaderSize
	dataOff := sessOff + len(yaml) + 1
	n := int(62.5 * tick)
	b := make([]byte, dataOff+n*bufLen)
	p32 := func(o int, x int32) { binary.LittleEndian.PutUint32(b[o:], uint32(x)) }
	p32(0, 2)
	p32(4, 1)
	p32(8, tick)
	p32(16, int32(len(yaml)+1))
	p32(20, int32(sessOff))
	p32(24, int32(len(testIBTVars)))
	p32(28, int32(varOff))
	p32(32, 1)
	p32(36, int32(bufLen))
	p32(48+4, int32(dataOff))
	start := time.Date(2025, 3, 14, 18, 30, 0, 0, time.UTC)
	binary.LittleEndian.PutUint64(b[headerSize:], uint64(start.Unix()))
	binary.LittleEndian.PutUint64(b[headerSize+8:], math.Float64bits(100))
	binary.LittleEndian.PutUint64(b[headerSize+16:], math.Float64bits(100+62.5))
	p32(headerSize+24, 3)
	p32(headerSize+28, int32(n))
	for i, x := range testIBTVars {
		o := varOff + i*varHeaderSize
		p32(o, x.typ)
		p32(o+4, int32(off[x.name]))
		p32(o+8, 1)
		copy(b[o+16:o+48], x.name)
	}
	copy(b[sessOff:], yaml)
	R := L / (2 * math.Pi)
	for i := 0; i < n; i++ {
		r := b[dataOff+i*bufLen : dataOff+(i+1)*bufLen]
		ts := float64(i) / tick
		d := math.Mod(ts*v, L)
		lap := 1 + int(ts*v/L)
		// the game's time of the lap before, a second after the line (each lap 50 ms apart, so a change shows)
		last := float32(-1)
		if done := lap - 1; ts-float64(done)*20 <= 1 {
			done--
			if done >= 1 {
				last = float32(20 + 0.05*float64(done))
			}
		} else {
			last = float32(20 + 0.05*float64(done))
		}
		fl := func(name string, x float64) {
			binary.LittleEndian.PutUint32(r[off[name]:], math.Float32bits(float32(x)))
		}
		db := func(name string, x float64) { binary.LittleEndian.PutUint64(r[off[name]:], math.Float64bits(x)) }
		in := func(name string, x int32) { binary.LittleEndian.PutUint32(r[off[name]:], uint32(x)) }
		in("Lap", int32(lap))
		fl("LapDist", d)
		fl("LapDistPct", d/L)
		fl("Speed", v)
		fl("Throttle", 1)
		in("Gear", 4)
		binary.LittleEndian.PutUint32(r[off["LapLastLapTime"]:], math.Float32bits(last))
		fl("FuelLevel", 50-ts*0.05)
		r[off["IsOnTrack"]] = 1
		db("SessionTime", 100+ts)
		fl("AirTemp", 21)
		fl("TrackTempCrew", 30)
		fl("LapCurrentLapTime", ts-float64(lap-1)*20)
		surf := int32(3)
		if offAt >= 0 && ts >= offAt && ts < offAt+1 {
			surf = 0
		}
		in("PlayerTrackSurface", surf)
		a := d / R
		db("Lat", 50+R*math.Sin(a)/110540)
		db("Lon", 6+(R-R*math.Cos(a))/(111320*math.Cos(50*math.Pi/180)))
	}
	if err := os.WriteFile(path, b, 0o600); err != nil {
		t.Fatal(err)
	}
}

func TestIBTImportLaps(t *testing.T) {
	dir := t.TempDir()
	p := filepath.Join(dir, "testcar_testring 2025-03-14 18-30-00.ibt")
	writeTestIBT(t, p, "4242", 30) // off the track 10 s into lap 2
	st, _ := os.Stat(p)
	hash, err := fileHash(p, st.Size())
	if err != nil {
		t.Fatal(err)
	}
	ss, err := replayIBT(p, hash, st.ModTime(), nil, false)
	if err != nil {
		t.Fatal(err)
	}
	if len(ss) != 1 {
		t.Fatalf("one session: %d", len(ss))
	}
	s := ss[0]
	if s.sess.ID != "ir-4242-0" || !s.sess.Imported || s.sess.Track != "Test Ring" || s.sess.Car != "Test Car" || s.sess.Kind != "Race" ||
		s.sess.Game != "iracing" || s.sess.Official == nil || !*s.sess.Official || s.sess.TrackID != 77 || s.sess.CarID != 99 {
		t.Fatalf("session %+v", s.sess)
	}
	if want := time.Date(2025, 3, 14, 18, 30, 0, 0, time.UTC).UnixMilli(); s.sess.Started != want {
		t.Fatalf("started %d, want %d", s.sess.Started, want)
	}
	if len(s.laps) != 3 {
		t.Fatalf("3 laps: %d", len(s.laps))
	}
	for i, l := range s.laps {
		if l.N != i+1 || l.ID != "ir-4242-0-"+itoa(i+1) || math.Abs(l.Time-20-0.05*float64(l.N)) > 0.0001 {
			t.Fatalf("lap %d: %+v", i, l)
		}
		if len(l.Sectors) != 3 || math.Abs(l.Sectors[0]+l.Sectors[1]+l.Sectors[2]-l.Time) > 0.01 || math.Abs(l.Sectors[0]-6.67) > 0.1 {
			t.Fatalf("lap %d sectors %v", l.N, l.Sectors)
		}
		if l.Trace == nil || len(l.Trace.D) < 190 || len(l.Trace.X) != len(l.Trace.D) || len(l.Trace.G) != 2 || l.Drv != "" {
			t.Fatalf("lap %d trace", l.N)
		}
		if l.Valid != (l.N != 2) {
			t.Fatalf("lap %d valid=%v (lap 2 left the track)", l.N, l.Valid)
		}
	}
	if f := s.laps[0].Trace.F; len(f) != 1 || f[0] != "cold" {
		t.Fatalf("the first lap is on cold tyres: %v", f)
	}
	// the account already has lap 1 of this session: only 2 and 3 go
	fetch := func(path string) ([]byte, error) {
		if strings.HasPrefix(path, "/api/sessions?") {
			return json.Marshal([]acctSession{{ID: "acct_x:ir-4242-0", Started: s.sess.Started}})
		}
		return json.Marshal(map[string]any{"laps": []acctLap{{N: 1, Time: s.laps[0].Time}}})
	}
	if err := dedupe(s, fetch); err != nil {
		t.Fatal(err)
	}
	if len(s.laps) != 2 || s.laps[0].N != 2 {
		t.Fatalf("after dedupe: %d laps", len(s.laps))
	}
}

// an offline session: the same id every time the file is read, and the laps recorded live (under a random id) are known
func TestIBTImportOffline(t *testing.T) {
	dir := t.TempDir()
	p := filepath.Join(dir, "a.ibt")
	writeTestIBT(t, p, "0", -1)
	st, _ := os.Stat(p)
	hash, _ := fileHash(p, st.Size())
	a, err := replayIBT(p, hash, st.ModTime(), nil, false)
	if err != nil {
		t.Fatal(err)
	}
	b, _ := replayIBT(p, hash, st.ModTime(), nil, false)
	if len(a) != 1 || !strings.HasPrefix(a[0].sess.ID, "t-") || a[0].sess.ID != b[0].sess.ID || a[0].laps[1].ID != b[0].laps[1].ID {
		t.Fatalf("a stable id: %v %v", a[0].sess.ID, b[0].sess.ID)
	}
	s := a[0]
	live := "t-1741977000000-abcd1234"
	fetch := func(path string) ([]byte, error) {
		if strings.HasPrefix(path, "/api/sessions?") {
			return json.Marshal([]acctSession{{ID: "acct_x:" + live, Started: s.sess.Started - 60000}, {ID: "acct_x:t-1-ffffffff", Started: 1}})
		}
		if strings.Contains(path, "ffffffff") {
			t.Fatal("a session of another day is not read")
		}
		return json.Marshal(map[string]any{"laps": []acctLap{{N: 1, Time: s.laps[0].Time}, {N: 2, Time: s.laps[1].Time}}})
	}
	if err := dedupe(s, fetch); err != nil {
		t.Fatal(err)
	}
	if len(s.laps) != 1 || s.sess.ID != live || s.laps[0].ID != live+"-3" {
		t.Fatalf("the rest goes to the live session: %s %d", s.sess.ID, len(s.laps))
	}
}

func TestIBTMemory(t *testing.T) {
	m := ibtMemory{Accounts: map[string]map[string]ibtSeen{}}
	if m.known("a", "x.ibt", 10, 5, "h1") {
		t.Fatal("nothing read yet")
	}
	m.mark("a", "x.ibt", ibtSeen{Size: 10, MTime: 5, Hash: "h1", State: "done"})
	if !m.known("a", "x.ibt", 10, 5, "") || m.known("a", "x.ibt", 11, 5, "") {
		t.Fatal("by path, size and time")
	}
	if !m.known("a", "moved.ibt", 10, 9, "h1") {
		t.Fatal("the same content under another name")
	}
	if m.known("b", "x.ibt", 10, 5, "h1") {
		t.Fatal("another account reads it for itself")
	}
	m.mark("a", "bad.ibt", ibtSeen{Size: 1, MTime: 1, Hash: "h2", State: "bad"})
	if m.known("a", "other.ibt", 1, 2, "h2") || !m.known("a", "bad.ibt", 1, 1, "") {
		t.Fatal("a bad file is skipped by its path only")
	}
}

func TestIBTBadFile(t *testing.T) {
	p := filepath.Join(t.TempDir(), "bad.ibt")
	os.WriteFile(p, []byte("not a telemetry file at all, just text................................................................................................................................................"), 0o600)
	if _, err := replayIBT(p, "0123456789abcdef", time.Now(), nil, false); err == nil {
		t.Fatal("a broken file is an error")
	}
}

func TestIniTelemetryDirs(t *testing.T) {
	d := iniTelemetryDirs("[Misc]\nirsdkLog=1\ntelemetryDiskPath=\"C:\\Telemetry\" ; mine\nfoo=bar\n")
	if len(d) != 1 || d[0] != `C:\Telemetry` {
		if filepath.IsAbs(`C:\Telemetry`) || len(d) != 0 { // only Windows takes C:\ as absolute
			t.Fatalf("%v", d)
		}
	}
}

// a race with other cars from a file without their positions: its laps count as driven in traffic (never lap A nor the
// model's); alone on track (the pace car aside) they do not
func TestIBTRaceTrafficUnknown(t *testing.T) {
	dir := t.TempDir()
	y := strings.ReplaceAll(testIBTYAML, "%SUB%", "55") + " - CarIdx: 1\n   UserName: Other D.\n   CarScreenName: Test Car\n"
	p := filepath.Join(dir, "r.ibt")
	writeTestIBTYAML(t, p, y, -1)
	ss, err := replayIBT(p, "0123456789abcdef", time.Now(), nil, false)
	if err != nil || len(ss) != 1 {
		t.Fatal(err)
	}
	for _, l := range ss[0].laps {
		if !slicesHas(l.Trace.F, "traffic") {
			t.Fatalf("lap %d: %v", l.N, l.Trace.F)
		}
	}
	y = strings.ReplaceAll(testIBTYAML, "%SUB%", "56") + " - CarIdx: 1\n   UserName: Pace Car\n   CarIsPaceCar: 1\n"
	writeTestIBTYAML(t, p, y, -1)
	ss, _ = replayIBT(p, "0123456789abcdef", time.Now(), nil, false)
	for _, l := range ss[0].laps {
		if slicesHas(l.Trace.F, "traffic") {
			t.Fatalf("alone: lap %d %v", l.N, l.Trace.F)
		}
	}
}

// DRINKS: a session of the account around that time with a friend's laps leaves the file's session out; a lap of the
// same number but another time is not the same lap
func TestIBTDedupeDrinksAndNumbers(t *testing.T) {
	p := filepath.Join(t.TempDir(), "d.ibt")
	writeTestIBT(t, p, "4243", -1)
	ss, _ := replayIBT(p, "0123456789abcdef", time.Now(), nil, false)
	s := ss[0]
	fetch := func(path string) ([]byte, error) {
		if strings.HasPrefix(path, "/api/sessions?") {
			return json.Marshal([]acctSession{{ID: "acct_x:ir-9-0", Started: s.sess.Started + 1000, Drvs: "Ana"}})
		}
		t.Fatal("no lap read")
		return nil, nil
	}
	if err := dedupe(s, fetch); err != nil || len(s.laps) != 0 || !s.drinks {
		t.Fatalf("DRINKS: %v %d", err, len(s.laps))
	}
	ss, _ = replayIBT(p, "0123456789abcdef", time.Now(), nil, false)
	s = ss[0]
	fetch = func(path string) ([]byte, error) {
		if strings.HasPrefix(path, "/api/sessions?") {
			return json.Marshal([]acctSession{{ID: "acct_x:ir-4243-0", Started: s.sess.Started}})
		}
		return json.Marshal(map[string]any{"laps": []acctLap{{N: 1, Time: 99.5}, {N: 2, Time: s.laps[1].Time}}})
	}
	if err := dedupe(s, fetch); err != nil || len(s.laps) != 2 || s.laps[0].N != 1 || s.laps[1].N != 3 {
		t.Fatalf("by number and time: %v %d", err, len(s.laps))
	}
}
