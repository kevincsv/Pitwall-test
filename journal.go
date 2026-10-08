package main

// Your racing journal: what Pitlane HQ learns about each car at each track
// (best lap, fuel per lap), a report after every race, and your notes for each
// corner of each track (the engineer can read them to you).

import (
	"crypto/sha256"
	"encoding/hex"
	"encoding/json"
	"errors"
	"fmt"
	"io"
	"log"
	"math"
	"net/http"
	"os"
	"path/filepath"
	"regexp"
	"sort"
	"strconv"
	"strings"
	"sync"
	"time"
)

// ---------- session YAML helpers ----------

// driverBlock is the DriverInfo entry of a car (not the "fastest lap" lists
// earlier in the YAML, which also start with "- CarIdx:").
func driverBlock(y, carIdx string) string {
	if i := strings.Index(y, "\nDriverInfo:"); i >= 0 {
		y = y[i:]
	}
	return listItem(y, "CarIdx", carIdx)
}

func atoi(s string) int {
	n, _ := strconv.Atoi(strings.TrimSpace(s))
	return n
}

func atof(s string) float64 {
	f, _ := strconv.ParseFloat(strings.Fields(s + " 0")[0], 64)
	return f
}

type carTrack struct {
	CarID, TrackID         int
	Car, CarPath, Track    string
	Tank                   float64
	SeriesID, SeasonID     int
	Subsession             int
	Official               bool
	CarClassID, NumClasses int
	Cat                    string // the discipline iRacing names (Oval, Road, DirtOval, DirtRoad…)
}

func currentCarTrack(y string) carTrack {
	c := carTrack{TrackID: atoi(yamlField(y, "TrackID")), Track: yamlField(y, "TrackDisplayName"), SeriesID: atoi(yamlField(y, "SeriesID")),
		SeasonID: atoi(yamlField(y, "SeasonID")), Subsession: atoi(yamlField(y, "SubSessionID")), Official: yamlField(y, "Official") == "1",
		NumClasses: atoi(yamlField(y, "NumCarClasses")), Cat: yamlField(y, "Category")}
	if cfg := yamlField(y, "TrackConfigName"); cfg != "" {
		c.Track += " · " + cfg
	}
	c.Tank = atof(yamlField(y, "DriverCarFuelMaxLtr"))
	if p := atof(yamlField(y, "DriverCarMaxFuelPct")); p > 0 && p < 1 {
		c.Tank *= p
	}
	if d := driverBlock(y, yamlField(y, "DriverCarIdx")); d != "" {
		c.CarID, c.Car, c.CarPath = atoi(yamlField(d, "CarID")), yamlField(d, "CarScreenName"), yamlField(d, "CarPath")
		c.CarClassID = atoi(yamlField(d, "CarClassID"))
	}
	return c
}

func sessionYAML() string {
	tel.mu.RLock()
	defer tel.mu.RUnlock()
	return tel.session
}

// ---------- trackbook: each car at each track ----------

type bookEntry struct {
	Car     string    `json:"car"`
	CarPath string    `json:"carPath,omitempty"`
	CarID   int       `json:"carId"`
	Track   string    `json:"track"`
	TrackID int       `json:"trackId"`
	Laps    int       `json:"laps"`
	Best    float64   `json:"best,omitempty"`
	Fuel    float64   `json:"fuel,omitempty"` // litres per lap, average of recent clean laps
	FuelN   int       `json:"fuelN,omitempty"`
	Tank    float64   `json:"tank,omitempty"`
	Races   int       `json:"races,omitempty"`
	Updated time.Time `json:"updated"`
	Game    string    `json:"game,omitempty"` // empty: iRacing
}

var (
	journalMu sync.Mutex
	book      = map[string]*bookEntry{}
	races     []*raceReport
	notes     = map[string]*trackNotes{}
	noticeSeq int
	notices   []notice
)

func journalFile(n string) string { return filepath.Join(activeDir(), n) }

func loadJournal() {
	b, r, n := map[string]*bookEntry{}, []*raceReport{}, map[string]*trackNotes{}
	readJSON(journalFile("trackbook.json"), &b)
	readJSON(journalFile("races.json"), &r)
	readJSON(journalFile("notes.json"), &n)
	fixed := false
	for _, x := range r {
		if repairRealIR(x) {
			fixed = true
		}
	}
	journalMu.Lock()
	book, races, notes = b, r, n
	if fixed {
		writeJSONFile(journalFile("races.json"), races)
	}
	journalMu.Unlock()
}

// maxRealIRStep: more than this between one race and the next session is not that race's result but the
// iRating of another category (a Sports Car session after a Formula Car race: each category has its own)
const maxRealIRStep = 300

// repairRealIR undoes a "real" iRating taken from a session of another category (older versions did): the
// race goes back to the estimate from its field, until the right one comes
func repairRealIR(r *raceReport) bool {
	if r == nil || !r.IRReal || abs(r.IRChange) <= maxRealIRStep {
		return false
	}
	r.IRReal = false
	r.IRChange = 0
	cls := append([]raceResult(nil), r.Results...)
	sort.Slice(cls, func(i, j int) bool { return cls[i].Pos < cls[j].Pos })
	irs, ps, st := make([]int, len(cls)), make([]int, len(cls)), make([]bool, len(cls))
	for i, x := range cls {
		irs[i], ps[i], st[i] = x.IR, i+1, x.Laps > 0
	}
	ch := irChanges(irs, ps, st)
	for i := range cls {
		if cls[i].Me {
			r.IRChange = ch[i]
		}
	}
	for i := range r.Results {
		if r.Results[i].Me {
			r.Results[i].IRChange = r.IRChange
		}
	}
	return true
}

func abs(n int) int {
	if n < 0 {
		return -n
	}
	return n
}

func readJSON(p string, v any) {
	if b, err := os.ReadFile(p); err == nil {
		json.Unmarshal(b, v)
	}
}

func writeJSONFile(p string, v any) {
	b, _ := json.MarshalIndent(v, "", " ")
	os.MkdirAll(filepath.Dir(p), 0o700)
	tmp := p + ".tmp"
	if os.WriteFile(tmp, b, 0o600) == nil {
		os.Rename(tmp, p)
	}
}

// recordBookLap learns from a finished lap: best valid lap, and fuel per lap
// from clean green-flag laps.
func recordBookLap(lapTime, fuel float64, valid bool) {
	c := currentCarTrack(sessionYAML())
	if c.CarID == 0 || c.TrackID == 0 {
		return
	}
	game := currentGame()
	key := gameKey(game, c.CarID, c.TrackID)
	journalMu.Lock()
	defer journalMu.Unlock()
	e := book[key]
	if e == nil {
		e = &bookEntry{CarID: c.CarID, TrackID: c.TrackID}
		if game != "iracing" {
			e.Game = game
		}
		book[key] = e
	}
	e.Car, e.CarPath, e.Track, e.Updated = c.Car, c.CarPath, c.Track, time.Now()
	if c.Tank > 0 {
		e.Tank = round(c.Tank, 1)
	}
	e.Laps++
	if valid && lapTime > 0 && (e.Best == 0 || lapTime < e.Best) {
		e.Best = round(lapTime, 3)
	}
	if valid && fuel > 0.05 && fuel < 25 {
		n := float64(min(e.FuelN, 9))
		e.Fuel = round((e.Fuel*n+fuel)/(n+1), 3)
		e.FuelN++
	}
	writeJSONFile(journalFile("trackbook.json"), book)
}

// ---------- race reports ----------

type raceLap struct {
	N    int     `json:"n"`
	Time float64 `json:"t"`
	Pos  int     `json:"p"`
	Inc  int     `json:"i,omitempty"`
	Pit  bool    `json:"pit,omitempty"`
	Cut  bool    `json:"cut,omitempty"` // left the track (cutting a corner): not a valid lap
	Fuel float64 `json:"f,omitempty"`
	*lapStat
}

type raceResult struct {
	Pos      int       `json:"pos"`
	ClassPos int       `json:"cpos"`
	Name     string    `json:"name"`
	Car      string    `json:"car,omitempty"`
	CarID    int       `json:"carId,omitempty"`
	Class    string    `json:"class,omitempty"`
	ClassID  int       `json:"classId,omitempty"`
	IR       int       `json:"ir,omitempty"`
	Laps     int       `json:"laps"`
	Best     float64   `json:"best,omitempty"`
	Sectors  []float64 `json:"sectors,omitempty"` // of the best lap, when the field watcher saw it whole
	Inc      int       `json:"inc"`
	Out      string    `json:"out,omitempty"`
	Me       bool      `json:"me,omitempty"`
	IRChange int       `json:"irChange,omitempty"`
	Lic      string    `json:"lic,omitempty"` // the license class (R, D, C, B, A, P) of the driver in this discipline
	carIdx   int
	key      string // an opaque key of the driver (never their id or name): the same driver gets the same key
}

// driverKey: the key of an iRacing driver for the community's anonymous laps, from their customer
// id; the id itself never leaves this PC.
func driverKey(userID string) string {
	userID = strings.TrimSpace(userID)
	if userID == "" || userID == "-1" || userID == "0" {
		return ""
	}
	h := sha256.Sum256([]byte("pitlanehq-other|" + userID))
	return hex.EncodeToString(h[:16])
}

type raceReport struct {
	Game        string       `json:"game,omitempty"` // empty: iRacing
	ID          string       `json:"id"`
	When        int64        `json:"when"`
	Track       string       `json:"track"`
	TrackID     int          `json:"trackId"`
	Car         string       `json:"car"`
	CarID       int          `json:"carId"`
	SeriesID    int          `json:"seriesId,omitempty"`
	SeasonID    int          `json:"seasonId,omitempty"`
	Subsession  int          `json:"subsession,omitempty"`
	Official    bool         `json:"official,omitempty"`
	Cat         string       `json:"cat,omitempty"` // the discipline iRacing names (Oval, Road, DirtOval, DirtRoad…)
	Start       int          `json:"start"`
	Finish      int          `json:"finish"`
	Field       int          `json:"field"`
	Multiclass  bool         `json:"multiclass,omitempty"`
	Inc         int          `json:"inc"`
	Best        float64      `json:"best,omitempty"`
	FieldBest   float64      `json:"fieldBest,omitempty"`
	Avg         float64      `json:"avg,omitempty"`
	Consistency float64      `json:"consistency,omitempty"` // standard deviation of clean laps, s
	Pits        int          `json:"pits"`
	FuelUsed    float64      `json:"fuelUsed,omitempty"`
	IR          int          `json:"ir,omitempty"`
	IRChange    int          `json:"irChange"` // estimate from the field's iRatings, until iRacing shows the real one
	IRReal      bool         `json:"irReal,omitempty"`
	App         string       `json:"app,omitempty"` // the Pitlane HQ that wrote the report
	SOF         int          `json:"sof,omitempty"`
	DNF         bool         `json:"dnf,omitempty"`
	Laps        []raceLap    `json:"laps"`
	Results     []raceResult `json:"results,omitempty"` // your class
	Brakes      []carBrakes  `json:"brakes,omitempty"`
	Incidents   []incEvent   `json:"incidents,omitempty"` // where on the lap each incident happened  // braking points of you and the drivers around you
	TrackLen    float64      `json:"trackLen,omitempty"`
	Posted      bool         `json:"posted,omitempty"`
}

// lapInc: the incidents of one lap of a race
type lapInc struct {
	N int `json:"n"`
	I int `json:"i"`
}

// fixRaceIncidents fills in the incidents of a race summarised before they were recorded like the
// laps' (older versions): per lap where the summary has none, where on the lap when it has no list,
// and the total when it is higher. It only adds, never removes. true when the summary changed.
func fixRaceIncidents(x *raceReport, laps []lapInc, evs []incEvent, inc int) bool {
	changed := false
	per := map[int]int{}
	for _, l := range laps {
		if l.N > 0 && l.I > 0 && l.I < 1000 {
			per[l.N] = l.I
		}
	}
	for k := range x.Laps {
		if x.Laps[k].Inc == 0 && per[x.Laps[k].N] > 0 {
			x.Laps[k].Inc = per[x.Laps[k].N]
			changed = true
		}
	}
	if len(x.Incidents) == 0 && len(evs) > 0 {
		for _, e := range evs {
			if e.Lap <= 0 || e.Pts <= 0 || e.Pts > 100 || e.D < 0 || e.D > 50000 || len(x.Incidents) >= 500 {
				continue
			}
			switch e.Kind {
			case "off", "loss", "light", "contact":
			default:
				e.Kind = "off"
			}
			x.Incidents = append(x.Incidents, e)
			changed = true
		}
	}
	total := 0
	for _, l := range x.Laps {
		total += l.Inc
	}
	ev := 0
	for _, e := range x.Incidents {
		ev += e.Pts
	}
	for _, v := range []int{total, ev, inc} {
		if v > x.Inc && v < 10000 {
			x.Inc = v
			changed = true
		}
	}
	return changed
}

type incEvent struct {
	Lap  int     `json:"lap"`
	D    float64 `json:"d"` // metres from the line
	Pts  int     `json:"pts"`
	Kind string  `json:"kind,omitempty"` // "off" (left the track), "loss" (loss of control), "light" (light contact) or "contact"
}

type raceTrack struct {
	incs                        []incEvent
	incPrev                     float64
	besideAt                    time.Time // the last moment another car was right beside you (CarLeftRight)
	id, kind                    string
	meta                        carTrack
	started                     bool
	start, startClass           int
	inc0, fuel0                 float64
	lapSeen, lapAtChk           int
	lapInc, lapFuel             float64
	lapPit, pitPrev             bool
	pits                        int
	pending                     int
	pendingAt, chkAt, doneAt    time.Time
	laps                        []raceLap
	lastPos, lastClass, lastInc int
	lastFuel                    float64
	state                       int
	saved                       bool
}

var raceVars = []string{"SessionNum", "SessionState", "LapCompleted", "PlayerCarPosition", "PlayerCarClassPosition", "PlayerCarMyIncidentCount", "FuelLevel", "OnPitRoad", "LapLastLapTime", "IsOnTrack", "LapDist", "PlayerTrackSurface", "CarLeftRight"}

func sessionKind(y string, sn int) string {
	if si := listItem(y, "SessionNum", strconv.Itoa(sn)); si != "" {
		return yamlField(si, "SessionType")
	}
	return ""
}

// raceWatcher follows each race you drive and writes its report when you
// cross the line after the checkered flag (or leave a race early).
func raceWatcher() {
	var cur *raceTrack
	var irSeen string // the session whose iRating was already compared with the last race
	end := func(dnf bool) {
		if cur != nil && cur.started && !cur.saved && len(cur.laps) > 0 {
			cur.saved = true
			saveRace(buildReport(sessionYAML(), cur, dnf))
		}
	}
	for range time.Tick(500 * time.Millisecond) {
		st := currentStatus()
		if !st.connected() || (st.Demo && !cloudDemo) {
			end(cur != nil && cur.state < 5)
			cur = nil
			continue
		}
		v := telNums(raceVars)
		y := sessionYAML()
		sn, state, lc := int(v[0]), int(v[1]), int(v[2])
		pos, cpos, inc, fuel, onPit, onTrack := int(v[3]), int(v[4]), v[5], v[6], v[7] > 0, v[9] > 0
		kind := sessionKind(y, sn)
		meta := currentCarTrack(y)
		id := fmt.Sprintf("%d-%d", meta.Subsession, sn)
		if meta.Subsession == 0 {
			id = fmt.Sprintf("t-%s-%d", meta.Track, sn)
		}
		if id != irSeen {
			if myIR := atoi(yamlField(driverBlock(y, yamlField(y, "DriverCarIdx")), "IRating")); myIR > 0 {
				irSeen = id
				applyRealIR(myIR, meta.Subsession, meta.Cat)
			}
		}
		if !strings.EqualFold(kind, "Race") {
			end(cur != nil && cur.state < 5)
			cur = nil
			continue
		}
		if cur == nil || cur.id != id {
			end(cur != nil && cur.state < 5)
			cur = &raceTrack{id: id, kind: kind, meta: meta}
		}
		now := time.Now()
		if !cur.started && state == 4 && pos > 0 {
			cur.started, cur.start, cur.startClass, cur.inc0, cur.fuel0, cur.lapSeen = true, pos, cpos, inc, fuel, lc
			cur.lapInc, cur.lapFuel, cur.incPrev = inc, fuel, inc
		}
		cur.state = state
		if !cur.started {
			continue
		}
		if pos > 0 {
			cur.lastPos, cur.lastClass = pos, cpos
		}
		cur.lastInc, cur.lastFuel = int(inc-cur.inc0), fuel
		if v[12] > 1 { // a car beside you, on either side
			cur.besideAt = now
		}
		if inc > cur.incPrev && len(cur.incs) < 100 {
			e := incEvent{Lap: lc + 1, D: round(math.Max(0, v[10]), 0), Pts: int(inc - cur.incPrev)}
			// iRacing: 1x leaving the track, 2x a loss of control or a light contact (another car was
			// right beside you a moment before), 4x a contact
			switch {
			case e.Pts >= 4:
				e.Kind = "contact"
			case e.Pts == 2 && !cur.besideAt.IsZero() && now.Sub(cur.besideAt) < 2*time.Second:
				e.Kind = "light"
			case e.Pts == 2:
				e.Kind = "loss"
			case e.Pts == 1 || v[11] == 0:
				e.Kind = "off"
			}
			cur.incs = append(cur.incs, e)
		}
		cur.incPrev = inc
		if onPit && !cur.pitPrev {
			cur.pits++
			cur.lapPit = true
		}
		cur.pitPrev = onPit
		if lc > cur.lapSeen && cur.pending == 0 {
			cur.pending, cur.pendingAt = lc, now
		}
		// iRacing updates the last lap time a moment after the line
		if cur.pending > 0 && now.Sub(cur.pendingAt) > 1500*time.Millisecond {
			rl := raceLap{N: cur.pending, Time: round(v[8], 3), Pos: pos, Inc: int(inc - cur.lapInc), Pit: cur.lapPit, Cut: lapCut(sn, cur.pending), Fuel: round(math.Max(0, cur.lapFuel-fuel), 2)}
			if s, ok := myLapStat(cur.pending); ok {
				rl.lapStat = &s
			}
			cur.laps = append(cur.laps, rl)
			cur.lapSeen, cur.pending, cur.lapInc, cur.lapFuel, cur.lapPit = cur.pending, 0, inc, fuel, onPit
		}
		if state >= 5 {
			if cur.chkAt.IsZero() {
				cur.chkAt, cur.lapAtChk = now, lc
			}
			if (lc > cur.lapAtChk || !onTrack || state >= 6) && cur.doneAt.IsZero() {
				cur.doneAt = now
			}
			if !cur.doneAt.IsZero() && now.Sub(cur.doneAt) > 6*time.Second && cur.pending == 0 {
				end(false)
			}
		}
	}
}

var resultSplit = regexp.MustCompile(`(?m)^\s*- Position: `)

// sessionResults reads ResultsPositions of a session from the YAML.
func sessionResults(y string, sn int) []raceResult {
	si := listItem(y, "SessionNum", strconv.Itoa(sn))
	i := strings.Index(si, "ResultsPositions:")
	if i < 0 {
		return nil
	}
	block := si[i:]
	if j := strings.Index(block, "ResultsFastestLap:"); j > 0 {
		block = block[:j]
	}
	parts := resultSplit.Split(block, -1)
	var out []raceResult
	for _, p := range parts[1:] {
		p = "Position: " + p
		r := raceResult{Pos: atoi(yamlField(p, "Position")), ClassPos: atoi(yamlField(p, "ClassPosition")) + 1, Laps: atoi(yamlField(p, "LapsComplete")),
			Inc: atoi(yamlField(p, "Incidents")), Out: yamlField(p, "ReasonOutStr")}
		if ft := atof(yamlField(p, "FastestTime")); ft > 0 {
			r.Best = round(ft, 3)
		}
		idx := yamlField(p, "CarIdx")
		r.carIdx = atoi(idx)
		if d := driverBlock(y, idx); d != "" {
			r.Name, r.Car, r.Class = yamlField(d, "UserName"), yamlField(d, "CarScreenName"), yamlField(d, "CarClassShortName")
			r.IR, r.ClassID, r.CarID = atoi(yamlField(d, "IRating")), atoi(yamlField(d, "CarClassID")), atoi(yamlField(d, "CarID"))
			r.key = driverKey(yamlField(d, "UserID"))
			r.Lic = licClass(yamlField(d, "LicString"))
			// iRacing leaves the results' Incidents at 0 during the session: the counts it does keep
			// up to date are the ones per driver (the team's in a team race, else the driver's own)
			if r.Inc == 0 {
				r.Inc = max(atoi(yamlField(d, "TeamIncidentCount")), atoi(yamlField(d, "CurDriverIncidentCount")))
			}
		}
		r.Me = idx == yamlField(y, "DriverCarIdx")
		out = append(out, r)
	}
	return out
}

// iRating estimate (the community formula used by iRating calculators).
func irChanges(irs []int, pos []int, started []bool) []int {
	n := len(irs)
	out := make([]int, n)
	if n < 2 {
		return out
	}
	br := 1600 / math.Ln2
	chance := func(a, b float64) float64 {
		ea, eb := math.Exp(-a/br), math.Exp(-b/br)
		return ((1 - ea) * eb) / ((1-eb)*ea + (1-ea)*eb)
	}
	starters := 0
	for _, s := range started {
		if s {
			starters++
		}
	}
	if starters < 2 {
		return out
	}
	nonStarters := n - starters
	for i := range irs {
		exp := -0.5
		for j := range irs {
			exp += chance(float64(irs[i]), float64(irs[j]))
		}
		if !started[i] {
			continue
		}
		fudge := (float64(n-nonStarters)/2 - float64(pos[i])) / 100
		out[i] = int(math.Round((float64(n-pos[i]) - exp - fudge) * 200 / float64(starters)))
	}
	return out
}

func strengthOfField(irs []int) int {
	if len(irs) == 0 {
		return 0
	}
	br := 1600 / math.Ln2
	s := 0.0
	for _, ir := range irs {
		s += math.Exp(-float64(ir) / br)
	}
	return int(math.Round(br * math.Log(float64(len(irs))/s)))
}

func buildReport(y string, t *raceTrack, dnf bool) *raceReport {
	m := t.meta
	r := &raceReport{Game: gameTag(currentGame()), ID: t.id, When: time.Now().UnixMilli(), Track: m.Track, TrackID: m.TrackID, Car: m.Car, CarID: m.CarID, SeriesID: m.SeriesID, SeasonID: m.SeasonID,
		Subsession: m.Subsession, Official: m.Official, Cat: m.Cat, Start: t.start, Finish: t.lastPos, Inc: t.lastInc, Pits: t.pits, Laps: t.laps, Incidents: t.incs, DNF: dnf, Multiclass: m.NumClasses > 1, App: appVersion}
	// the incidents the lap recorder saw (what the analysis and the coach show): one story everywhere
	if evs, per := recorderIncidents(sessionNumOf(t.id), t.laps); per != nil {
		r.Incidents = evs
		for i := range r.Laps {
			r.Laps[i].Inc = per[r.Laps[i].N]
		}
	}
	if r.Multiclass {
		r.Start, r.Finish = t.startClass, t.lastClass
	}
	if t.fuel0 > 0 && t.lastFuel >= 0 {
		r.FuelUsed = round(math.Max(0, t.fuel0-t.lastFuel), 1)
	}
	// lap statistics: clean laps are green-flag laps without pit or incident (not lap 1)
	var clean []float64
	for _, l := range t.laps {
		if l.Time <= 0 {
			continue
		}
		if r.Best == 0 || l.Time < r.Best {
			r.Best = l.Time
		}
		if l.N > 1 && !l.Pit && !l.Cut && l.Inc == 0 {
			clean = append(clean, l.Time)
		}
	}
	if len(clean) > 0 {
		s := 0.0
		for _, x := range clean {
			s += x
		}
		r.Avg = round(s/float64(len(clean)), 3)
		v := 0.0
		for _, x := range clean {
			v += (x - r.Avg) * (x - r.Avg)
		}
		r.Consistency = round(math.Sqrt(v/float64(len(clean))), 3)
	}
	// the field from the official results, your class only
	res := sessionResults(y, atoi(yamlField(y, "CurrentSessionNum")))
	if len(res) == 0 {
		for sn := 0; sn < 8 && len(res) == 0; sn++ {
			if strings.EqualFold(sessionKind(y, sn), "Race") {
				res = sessionResults(y, sn)
			}
		}
	}
	var cls []raceResult
	for _, x := range res {
		if x.ClassID == m.CarClassID || m.CarClassID == 0 {
			cls = append(cls, x)
		}
	}
	sort.Slice(cls, func(i, j int) bool { return cls[i].Pos < cls[j].Pos })
	irs, ps, st := make([]int, len(cls)), make([]int, len(cls)), make([]bool, len(cls))
	for i, x := range cls {
		irs[i], ps[i], st[i] = x.IR, i+1, x.Laps > 0
		if x.Best > 0 && (r.FieldBest == 0 || x.Best < r.FieldBest) {
			r.FieldBest = x.Best
		}
	}
	ch := irChanges(irs, ps, st)
	for i := range cls {
		cls[i].IRChange = ch[i]
		if cls[i].Me {
			r.IR, r.IRChange, r.Finish = cls[i].IR, ch[i], i+1
			// the results can still say 0 at the flag: keep what was counted during the race
			if cls[i].Inc > r.Inc {
				r.Inc = cls[i].Inc
			}
			if r.Inc > cls[i].Inc {
				cls[i].Inc = r.Inc
			}
			if cls[i].Best > 0 {
				r.Best = cls[i].Best
			}
		}
	}
	for i := range cls {
		if !cls[i].Me {
			cls[i].Sectors = fieldSectors(cls[i].carIdx, cls[i].Best)
		}
	}
	r.Field, r.SOF, r.Results = len(cls), strengthOfField(irs), cls
	r.Brakes, r.TrackLen = fieldBrakes(y, cls), round(trackLength(y), 0)
	if r.Field == 0 {
		r.Field = len(listDrivers(y))
	}
	return r
}

func listDrivers(y string) []string {
	if i := strings.Index(y, "\nDriverInfo:"); i >= 0 {
		return regexp.MustCompile(`(?m)^\s*- CarIdx: `).FindAllString(y[i:], -1)
	}
	return nil
}

func saveRace(r *raceReport) {
	journalMu.Lock()
	for i, x := range races {
		if x.ID == r.ID {
			races = append(races[:i], races[i+1:]...)
			break
		}
	}
	races = append(races, r)
	if len(races) > 1000 {
		races = races[len(races)-1000:]
	}
	if e := book[gameKey(r.Game, r.CarID, r.TrackID)]; e != nil {
		e.Races++
		writeJSONFile(journalFile("trackbook.json"), book)
	}
	writeJSONFile(journalFile("races.json"), races)
	pushNoticeLocked("race", r)
	journalMu.Unlock()
	log.Printf("Race report: P%d from P%d at %s", r.Finish, r.Start, r.Track)
	go notifyRaceSummary(r)
	go discordRace(r)
	shareReport(r)
	go shareFieldTop(r)
}

// sessionNumOf: the session number at the end of a race id ("subsession-sn", "t-track-sn").
func sessionNumOf(id string) int {
	if i := strings.LastIndex(id, "-"); i >= 0 {
		if n, err := strconv.Atoi(id[i+1:]); err == nil {
			return n
		}
	}
	return -1
}

// licClass: the class letter of an iRacing license ("B 3.21" → "B", "WC 4.99" or "Pro" → "P"), "" when unknown
func licClass(s string) string {
	s = strings.ToUpper(strings.TrimSpace(s))
	switch {
	case s == "":
		return ""
	case strings.HasPrefix(s, "WC"), strings.HasPrefix(s, "PRO"):
		return "P"
	case strings.ContainsRune("RDCBAP", rune(s[0])):
		return s[:1]
	}
	return ""
}

// fieldTopLaps: the best lap of every other driver of your class (your own laps go the usual way), as
// the community takes them: time, sectors, car and track, the speed trace their position gave when
// the PC saw the lap whole, and an opaque key per driver. No names. Only the faster rivals with a
// trace show on the leaderboard; the rest feed the model unseen.
func fieldTopLaps(r *raceReport) []map[string]any {
	var out []map[string]any
	if r == nil || r.TrackID == 0 {
		return nil
	}
	for _, x := range r.Results {
		if x.Me || x.Laps <= 0 || x.Best <= 10 || x.CarID == 0 || x.key == "" {
			continue
		}
		b := map[string]any{"carId": x.CarID, "car": x.Car, "trackId": r.TrackID, "track": r.Track, "time": x.Best, "game": "iracing", "other": x.key, "kind": "Race", "official": r.Official}
		if x.Lic != "" {
			b["lic"] = x.Lic
		}
		if r.Cat != "" {
			b["cat"] = r.Cat
		}
		if len(x.Sectors) == 3 {
			b["sectors"] = x.Sectors
		}
		tr := fieldTrace(x.carIdx, x.Best)
		if tr != nil {
			b["trace"] = tr
		}
		// on the leaderboard only the rivals faster than you whose lap the PC saw whole; every other
		// lap goes hidden, for the model alone
		if tr == nil || r.Best <= 0 || x.Best >= r.Best {
			b["hidden"] = true
		}
		out = append(out, b)
	}
	return out
}

// applyRealIR: iRacing shows your new iRating when you join the next session; its difference with
// the iRating you had in your last race is what that race really gave or cost (the report keeps the
// estimate until then).
func applyRealIR(ir, subsession int, cat string) {
	journalMu.Lock()
	defer journalMu.Unlock()
	if len(races) == 0 || ir <= 0 {
		return
	}
	r := races[len(races)-1]
	if (r.Game != "" && r.Game != "iracing") || r.IRReal || r.IR <= 0 || r.Subsession == subsession || ir == r.IR {
		return
	}
	// only a session of the same category says what the race gave: each category has its own iRating
	if (r.Cat != "" && cat != "" && !strings.EqualFold(r.Cat, cat)) || abs(ir-r.IR) > maxRealIRStep {
		return
	}
	r.IRChange, r.IRReal = ir-r.IR, true
	for i := range r.Results {
		if r.Results[i].Me {
			r.Results[i].IRChange = r.IRChange
		}
	}
	writeJSONFile(journalFile("races.json"), races)
	pushNoticeLocked("race", r)
}

// ---------- notices to open screens (a new race report) ----------

type notice struct {
	Seq  int    `json:"seq"`
	Kind string `json:"kind"`
	Data any    `json:"data"`
}

func pushNoticeLocked(kind string, data any) {
	noticeSeq++
	notices = append(notices, notice{noticeSeq, kind, data})
	if len(notices) > 10 {
		notices = notices[len(notices)-10:]
	}
}

func noticesSince(seq int) ([]notice, int) {
	journalMu.Lock()
	defer journalMu.Unlock()
	if seq < 0 {
		return nil, noticeSeq
	}
	var out []notice
	for _, n := range notices {
		if n.Seq > seq {
			out = append(out, n)
		}
	}
	return out, noticeSeq
}

// ---------- track notes ----------

type cornerNote struct {
	N    int     `json:"n"`
	Dist float64 `json:"dist"` // metres from the line where the braking zone starts
	Name string  `json:"name,omitempty"`
	Note string  `json:"note"`
}

type trackNotes struct {
	TrackID int          `json:"trackId"`
	Track   string       `json:"track"`
	General string       `json:"general,omitempty"`
	Corners []cornerNote `json:"corners,omitempty"`
	Updated time.Time    `json:"updated"`
}

func cleanText(s string, max int) string {
	s = strings.TrimSpace(strings.Map(func(r rune) rune {
		if r < 32 && r != '\n' {
			return -1
		}
		return r
	}, s))
	if len([]rune(s)) > max {
		s = string([]rune(s)[:max])
	}
	return s
}

func registerJournalRoutes(mux *http.ServeMux) {
	mux.HandleFunc("/api/trackbook", func(w http.ResponseWriter, r *http.Request) {
		journalMu.Lock()
		list := make([]*bookEntry, 0, len(book))
		for _, e := range book {
			list = append(list, e)
		}
		journalMu.Unlock()
		sort.Slice(list, func(i, j int) bool { return list[i].Updated.After(list[j].Updated) })
		writeJSON(w, map[string]any{"entries": list})
	})
	mux.HandleFunc("/api/races", func(w http.ResponseWriter, r *http.Request) {
		if r.Method == http.MethodPost {
			var in struct {
				Action, ID string
				Laps       []lapInc   `json:"laps"`      // "incidents": the incidents of each lap, from the account's laps of the race
				Incidents  []incEvent `json:"incidents"` // and where on the lap they happened
				Inc        int        `json:"inc"`
			}
			json.NewDecoder(io.LimitReader(r.Body, 1<<17)).Decode(&in)
			journalMu.Lock()
			var found *raceReport
			for i, x := range races {
				if x.ID == in.ID {
					found = x
					if in.Action == "delete" {
						races = append(races[:i], races[i+1:]...)
						writeJSONFile(journalFile("races.json"), races)
					}
					if in.Action == "uncut" && wipAllowed() { // admins: the laps without incidents count as valid again (a wrong cut check)
						for k := range x.Laps {
							if x.Laps[k].Inc == 0 {
								x.Laps[k].Cut = false
							}
						}
						writeJSONFile(journalFile("races.json"), races)
					}
					if in.Action == "incidents" && fixRaceIncidents(x, in.Laps, in.Incidents, in.Inc) {
						writeJSONFile(journalFile("races.json"), races)
					}
					break
				}
			}
			journalMu.Unlock()
			if in.Action == "discord" {
				if found == nil {
					w.WriteHeader(404)
					writeJSON(w, map[string]string{"error": "race not found"})
					return
				}
				if err := discordPostRace(found); err != nil {
					w.WriteHeader(400)
					writeJSON(w, map[string]string{"error": err.Error()})
					return
				}
			}
		}
		journalMu.Lock()
		out := make([]*raceReport, len(races))
		for i := range races {
			out[len(races)-1-i] = races[i]
		}
		journalMu.Unlock()
		writeJSON(w, map[string]any{"races": out})
	})
	mux.HandleFunc("/api/notes", func(w http.ResponseWriter, r *http.Request) {
		if r.Method == http.MethodPost {
			var in trackNotes
			if err := json.NewDecoder(io.LimitReader(r.Body, 1<<17)).Decode(&in); err != nil || in.TrackID <= 0 {
				w.WriteHeader(400)
				writeJSON(w, map[string]string{"error": errors.New("unknown track").Error()})
				return
			}
			in.Track, in.General, in.Updated = cleanText(in.Track, 120), cleanText(in.General, 2000), time.Now()
			var cs []cornerNote
			for _, c := range in.Corners {
				c.Note, c.Name = cleanText(c.Note, 300), cleanText(c.Name, 40)
				if c.Note != "" && c.N >= 0 && c.N < 100 && c.Dist >= 0 && c.Dist < 50000 && len(cs) < 60 {
					cs = append(cs, c)
				}
			}
			in.Corners = cs
			journalMu.Lock()
			if in.General == "" && len(cs) == 0 {
				delete(notes, strconv.Itoa(in.TrackID))
			} else {
				notes[strconv.Itoa(in.TrackID)] = &in
			}
			writeJSONFile(journalFile("notes.json"), notes)
			journalMu.Unlock()
		}
		journalMu.Lock()
		defer journalMu.Unlock()
		writeJSON(w, map[string]any{"notes": notes})
	})
}

// notifyRaceSummary tells you, even with the window closed, that the race summary is ready.
func notifyRaceSummary(r *raceReport) {
	res := fmt.Sprintf("P%d", r.Finish)
	if r.DNF {
		res = "DNF"
	} else if d := r.Start - r.Finish; d != 0 {
		res += fmt.Sprintf(" (%+d)", d)
	}
	if uiLanguage() == "es" {
		notify("Resumen de la carrera · "+res, r.Track+" · Abre Pitlane HQ → Análisis → Carreras para ver qué salió bien y dónde perdiste tiempo.")
		return
	}
	notify("Race summary · "+res, r.Track+" · Open Pitlane HQ → Analysis → Races to see what went well and where you lost time.")
}
