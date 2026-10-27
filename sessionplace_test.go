package main

import (
	"fmt"
	"os"
	"path/filepath"
	"strings"
	"testing"
	"time"
)

// placeYAML: a session of the given type with these results ([car, position, class position (0-based, as iRacing
// writes it), fastest time]) and these drivers ([car, class, extra lines])
func placeYAML(kind string, res [][4]float64, drivers []string) string {
	var b strings.Builder
	b.WriteString("WeekendInfo:\n TrackDisplayName: Test Ring\n TrackID: 77\n SubSessionID: 900\nSessionInfo:\n Sessions:\n - SessionNum: 0\n   SessionType: " + kind + "\n")
	if res != nil {
		b.WriteString("   ResultsPositions:\n")
		for _, r := range res {
			fmt.Fprintf(&b, "   - Position: %d\n     ClassPosition: %d\n     CarIdx: %d\n     FastestTime: %.3f\n     LapsComplete: 5\n", int(r[1]), int(r[2]), int(r[0]), r[3])
		}
		b.WriteString("   ResultsFastestLap:\n   - CarIdx: 0\n     FastestLap: 3\n")
	}
	b.WriteString("DriverInfo:\n DriverCarIdx: 0\n PaceCarIdx: 9\n Drivers:\n")
	for _, d := range drivers {
		b.WriteString(d)
	}
	b.WriteString("SplitTimeInfo:\n Sectors:\n - SectorNum: 0\n   SectorStartPct: 0.000000\n")
	return b.String()
}

func drv(idx, class int, extra string) string {
	return fmt.Sprintf(" - CarIdx: %d\n   UserName: Driver %d\n   CarClassID: %d\n   CarScreenName: Test Car\n%s", idx, idx, class, extra)
}

func TestSessionPlacePracticeByBestLap(t *testing.T) {
	// iRacing's order says 1st, but the best laps put you 2nd of the three cars with a time; the pace car and a
	// spectator are no cars of the session
	y := placeYAML("Practice", [][4]float64{{0, 1, 0, 91.2}, {1, 2, 1, 90.8}, {2, 3, 2, 92.0}, {3, 4, 3, -1}}, []string{
		drv(0, 10, ""), drv(1, 10, ""), drv(2, 10, ""), drv(3, 10, ""), drv(9, 11, "   CarIsPaceCar: 1\n"), drv(5, 10, "   IsSpectator: 1\n")})
	p := sessionPlaceOf(y, 0, "Practice", 0, 0)
	if p != (sessPlace{pos: 2, field: 4}) {
		t.Fatalf("practice: %+v", p)
	}
	// without a time of your own yet: the game's live place
	y2 := placeYAML("Qualify", [][4]float64{{1, 1, 0, 90.8}}, []string{drv(0, 10, ""), drv(1, 10, "")})
	if p := sessionPlaceOf(y2, 0, "Qualify", 0, 0); p.pos != 0 {
		t.Fatalf("no time, no place: %+v", p)
	}
	if p := sessionPlaceOf(y2, 0, "Qualify", 2, 2); p != (sessPlace{pos: 2, field: 2}) {
		t.Fatalf("live place: %+v", p)
	}
}

func TestSessionPlaceMulticlass(t *testing.T) {
	// a race of two classes: 4th overall, 2nd of the 3 cars of your class
	y := placeYAML("Race", [][4]float64{{2, 1, 0, 88}, {4, 2, 1, 88.5}, {1, 3, 0, 95}, {0, 4, 1, 95.5}, {3, 5, 2, 96}}, []string{
		drv(0, 20, ""), drv(1, 20, ""), drv(2, 30, ""), drv(3, 20, ""), drv(4, 30, ""), drv(9, 1, "   CarIsPaceCar: 1\n")})
	if p := sessionPlaceOf(y, 0, "Race", 4, 2); p != (sessPlace{pos: 2, field: 3, cls: true}) {
		t.Fatalf("class place: %+v", p)
	}
	// one class: the place overall
	y = placeYAML("Race", [][4]float64{{2, 1, 0, 88}, {0, 2, 1, 88.5}, {1, 3, 2, 95}}, []string{drv(0, 20, ""), drv(1, 20, ""), drv(2, 20, "")})
	if p := sessionPlaceOf(y, 0, "Race", 0, 0); p != (sessPlace{pos: 2, field: 3}) {
		t.Fatalf("race: %+v", p)
	}
}

func TestSessionPlaceNone(t *testing.T) {
	y := placeYAML("Offline Testing", [][4]float64{{0, 1, 0, 90}, {1, 2, 1, 91}}, []string{drv(0, 10, ""), drv(1, 10, "")})
	if p := sessionPlaceOf(y, 0, "Offline Testing", 1, 1); p.pos != 0 {
		t.Fatalf("a test drive has no place: %+v", p)
	}
	// alone with the pace car
	y = placeYAML("Practice", [][4]float64{{0, 1, 0, 90}}, []string{drv(0, 10, ""), drv(9, 11, "   CarIsPaceCar: 1\n")})
	if p := sessionPlaceOf(y, 0, "Practice", 1, 1); p.pos != 0 {
		t.Fatalf("alone: %+v", p)
	}
	// Le Mans Ultimate writes no results: the live place and the field from its drivers
	y = placeYAML("Race", nil, []string{drv(0, 10, ""), drv(1, 10, ""), drv(2, 10, "")})
	if p := sessionPlaceOf(y, 0, "Race", 3, 3); p != (sessPlace{pos: 3, field: 3}) {
		t.Fatalf("live only: %+v", p)
	}
}

// the importer fills the place from the file's results
func TestIBTImportPlace(t *testing.T) {
	y := strings.ReplaceAll(testIBTYAML, "SessionType: Race\n", "SessionType: Practice\n   ResultsPositions:\n   - Position: 1\n     ClassPosition: 0\n     CarIdx: 1\n     FastestTime: 19.900\n   - Position: 2\n     ClassPosition: 1\n     CarIdx: 0\n     FastestTime: 20.050\n")
	y = strings.ReplaceAll(y, "%SUB%", "57") + " - CarIdx: 1\n   UserName: Other D.\n   CarScreenName: Test Car\n - CarIdx: 2\n   UserName: Third D.\n   CarScreenName: Test Car\n"
	p := filepath.Join(t.TempDir(), "p.ibt")
	writeTestIBTYAML(t, p, y, -1)
	ss, err := replayIBT(p, "0123456789abcdef", time.Now(), nil, false)
	if err != nil || len(ss) != 1 {
		t.Fatal(err)
	}
	if s := ss[0].sess; s.Pos != 2 || s.Field != 3 || s.Cls {
		t.Fatalf("imported place: %+v", s)
	}
	os.Remove(p)
}

// the final place reaches the account: a session update without laps, and the laps still waiting carry it
func TestQueueSessionPlace(t *testing.T) {
	cloudMu.Lock()
	saved, savedCfg := cloudQueue, cloudCfg
	cloudQueue, cloudCfg = nil, cloudConfig{Enabled: true}
	cloudMu.Unlock()
	defer func() {
		cloudMu.Lock()
		cloudQueue, cloudCfg = saved, savedCfg
		cloudMu.Unlock()
	}()
	t.Setenv("PITLANEHQ_DATA", t.TempDir())
	s := cloudSession{ID: "ir-1-0", Track: "T", Car: "C", Kind: "Practice", Pos: 3, Field: 10}
	queueSession(s) // no lap of it yet: nothing goes
	if len(cloudQueue) != 0 {
		t.Fatalf("no laps, no update: %d", len(cloudQueue))
	}
	s.Pos = 4
	queueLap(s, cloudLap{ID: "ir-1-0-1", N: 1, Time: 90})
	s.Pos = 2
	queueSession(s)
	if len(cloudQueue) != 2 || cloudQueue[0].Session.Pos != 2 || cloudQueue[1].Session.Pos != 2 || len(cloudQueue[1].Laps) != 0 {
		t.Fatalf("queue %+v", cloudQueue)
	}
	s.Pos = 5 // a lap that waited for its time with the place before carries the newest
	queueLap(s, cloudLap{ID: "ir-1-0-2", N: 2, Time: 90})
	if n := len(cloudQueue); cloudQueue[n-1].Session.Pos != 2 {
		t.Fatalf("the newest place: %+v", cloudQueue[n-1].Session)
	}
}

type placeEnv struct {
	lapEnv
	ended []cloudSession
}

func (e *placeEnv) sessionEnded(s cloudSession) { e.ended = append(e.ended, s) }

// a session that ends with a place other than its last lap's sends it; one that did not move sends nothing
func TestEndSessionPlace(t *testing.T) {
	y := placeYAML("Practice", [][4]float64{{1, 1, 0, 90.5}, {0, 2, 1, 90.8}, {2, 3, 2, 91}}, []string{drv(0, 10, ""), drv(1, 10, ""), drv(2, 10, "")})
	env := &placeEnv{}
	ls := &lapStream{env: env, sessNum: 0, sessY: y, sess: cloudSession{ID: "ir-900-0", Kind: "Practice"}, sessLaps: 4, sentPlace: sessPlace{pos: 1, field: 3}}
	ls.endSession()
	if len(env.ended) != 1 || env.ended[0].Pos != 2 || env.ended[0].Field != 3 {
		t.Fatalf("final place: %+v", env.ended)
	}
	ls.endSession() // once
	ls.sessLaps, ls.sentPlace = 2, sessPlace{pos: 2, field: 3}
	ls.endSession()
	if len(env.ended) != 1 {
		t.Fatalf("unchanged: %+v", env.ended)
	}
}
