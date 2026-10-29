package main

// The laps already on the PC: iRacing keeps a telemetry file (.ibt) of every session driven with telemetry logging on
// (Documents\iRacing\telemetry). The agent reads the files it has not read yet, one at a time and slowly (a quarter of
// one core at most, ibtPace), through the same lap recorder as a lap driven now (lapStream in cloud.go): the same lap
// numbers, verdicts, sectors, paths and tags, and the laps go to the account like any other. Nobody presses anything.
// The old files (the backlog) are read only while the PC is idle (nobody has touched it for 5 minutes and no sim
// runs, pcIdle); somebody coming back stops it within a second and it goes on later. Once the backlog is read, the
// folders are looked at again only 2 minutes after the sim closes and once a day (ibtSched). Never while a sim runs
// (it stops and starts again later), never a file still being written, never the same file twice (ibt-imported.json),
// and never a lap the account already has.

import (
	"crypto/sha256"
	"encoding/hex"
	"encoding/json"
	"errors"
	"fmt"
	"io"
	"io/fs"
	"log"
	"math"
	"net/url"
	"os"
	"path/filepath"
	"sort"
	"strings"
	"sync"
	"time"
)

// ---------- replaying a file through the lap recorder ----------

var errImportPaused = errors.New("a sim started")

// ibtSession: one session of a file and its laps, as the recorder made them
type ibtSession struct {
	sess   cloudSession
	laps   []cloudLap
	yaml   string
	end    int64 // the last sample's time (ms)
	drinks bool  // left out: the account has DRINKS laps of it
}

// errBadIBT: the file is not a telemetry file iRacing wrote (or is broken): it is marked and never read again. Any
// other error (the file in use, a read failing) leaves it for a later round.
var errBadIBT = errors.New("not a readable telemetry file")

type ibtPending struct {
	r              *lapRec
	s              cloudSession
	fuelNow, prevL float64
	left           int // samples left to wait for the game's time of the lap (6 s, like waitLastLap)
}

// importLapEnv: the recorder's samples come from a file; its laps are collected, nothing live is touched (the race
// report's per-lap memory, the session runs and the paths' origin of the game running now stay as they are)
type importLapEnv struct {
	x       *ibtFile
	rd      *ibtReader
	hash    string
	v       []float64
	runs    sessionRun
	org     map[string][2]float64
	pending []ibtPending
	out     map[string]*ibtSession
	order   []string
	wall    time.Time
	key     string // sessionKey of the file's YAML, read once
	others  bool   // the session has other cars (not the pace car)
	carIdx  bool   // the file has the cars' positions (CarIdxLapDistPct)
}

func (e *importLapEnv) yaml() (string, int) { return e.x.yaml, 1 }
func (e *importLapEnv) runKey(sn int) string {
	return e.key + "|" + itoa(sn)
}
func (e *importLapEnv) noteRun(key string, st float64, lap int) (int, int) {
	return e.runs.note(key, st, lap)
}
func (e *importLapEnv) carsAhead(dist, pct, speed float64, me int) (bool, bool) {
	p := e.rd.array("CarIdxLapDistPct")
	if len(p) == 0 {
		return false, false
	}
	return carAhead(p, e.rd.array("CarIdxOnPitRoad"), dist, pct, speed, me), true
}
func (e *importLapEnv) driver() string { return "" } // the account's own laps: a file knows no DRINKS driver
func (e *importLapEnv) geo(key string, lat, lon float64) [2]float64 {
	if o, ok := e.org[key]; ok {
		return o
	}
	o := [2]float64{math.Round(lat*100) / 100, math.Round(lon*100) / 100}
	e.org[key] = o
	return o
}
func (e *importLapEnv) has(name string) bool { _, ok := e.x.index[name]; return ok }
func (e *importLapEnv) now() time.Time       { return e.wall }

// the file's YAML is the one of the session's end: its results give the place (sessionplace.go), the same on every lap
func (e *importLapEnv) livePlace() (int, int)       { return 0, 0 }
func (e *importLapEnv) sessionEnded(s cloudSession) {}

func (e *importLapEnv) meta(y string, sn int) cloudSession {
	s := sessionMetaGame(y, sn, e.wall, "iracing")
	s.Imported = true
	// a session without a subsession (offline): the same id every time this file is read
	if strings.HasPrefix(s.ID, "t-") {
		s.ID = fmt.Sprintf("t-%d-%s", s.Started, e.hash[:8])
		if sn > 0 {
			s.ID += "-" + itoa(sn)
		}
	}
	return s
}

func (e *importLapEnv) lapEnded(sn int, done *lapRec, s cloudSession, fuelNow, prevLast float64) {
	e.pending = append(e.pending, ibtPending{r: done, s: s, fuelNow: fuelNow, prevL: prevLast, left: 180})
}

// settle: the laps waiting for the game's time of the lap (LapLastLapTime changes a moment after the line), like
// waitLastLap: the game's time once it is this lap's and agrees with the measured one, else the measured one
func (e *importLapEnv) settle(lt float64, eof bool) {
	keep := e.pending[:0]
	for _, p := range e.pending {
		measured := p.r.lastT
		t := 0.0
		p.left--
		switch {
		case lt > 0 && lt != p.prevL && (measured <= 0 || math.Abs(lt-measured) < 1.5):
			t = lt
		case p.left <= 0 || eof:
			t = -1
			if measured > 0 {
				t = measured
			}
		default:
			keep = append(keep, p)
			continue
		}
		e.finish(p, t)
	}
	e.pending = keep
}

func (e *importLapEnv) finish(p ibtPending, lt float64) {
	l, ok := buildLap(p.r, p.s, p.fuelNow, lt)
	if !ok {
		return
	}
	is := e.out[p.s.ID]
	if is == nil {
		is = &ibtSession{sess: p.s, yaml: e.x.yaml}
		e.out[p.s.ID] = is
		e.order = append(e.order, p.s.ID)
	}
	// a race with other cars and a file without their positions: whether a lap was driven in traffic is not known, so it
	// counts as one (never the coach's default lap A, never the model's); practice and qualifying laps stay as they are
	if !e.carIdx && e.others && strings.Contains(strings.ToLower(p.s.Kind), "race") && l.Trace != nil && !slicesHas(l.Trace.F, "traffic") {
		l.Trace.F = append(l.Trace.F, "traffic")
	}
	is.laps = append(is.laps, l)
	is.end = e.wall.UnixMilli()
}

func slicesHas(xs []string, v string) bool {
	for _, x := range xs {
		if x == v {
			return true
		}
	}
	return false
}

// otherCars: whether the session's drivers list has a car besides yours and the pace car
func otherCars(y string) bool {
	if i := strings.Index(y, "\nDriverInfo:"); i >= 0 {
		y = y[i:]
	}
	me := yamlField(y, "DriverCarIdx")
	n := 0
	for _, part := range strings.Split(y, "- CarIdx: ")[1:] {
		idx := strings.TrimSpace(strings.SplitN(part, "\n", 2)[0])
		if idx == me || strings.Contains(part, "CarIsPaceCar: 1") {
			continue
		}
		n++
	}
	return n > 0
}

// the import's pacing: it works in batches of about ibtBatchWork and sleeps ibtRest times what each batch took, so it
// uses 1/(1+ibtRest) of one core at most (a quarter); the process' priority is never touched
const (
	ibtBatchWork = 100 * time.Millisecond
	ibtRest      = 3
)

// ibtPace: how long to rest after a batch that took work
func ibtPace(work time.Duration) time.Duration {
	if work < time.Millisecond {
		work = time.Millisecond
	}
	return ibtRest * work
}

// ibtRestFor sleeps d in short slices, asking pause between them: true when it stopped the rest (pause said so), so a
// stop is seen within a quarter of a second even during a long rest
func ibtRestFor(d time.Duration, pause func() bool) bool {
	for d > 0 {
		if pause != nil && pause() {
			return true
		}
		step := d
		if step > 250*time.Millisecond {
			step = 250 * time.Millisecond
		}
		time.Sleep(step)
		d -= step
	}
	return pause != nil && pause()
}

// replayIBT reads a telemetry file through the lap recorder and returns its sessions with their laps. pause is asked
// after every batch (and during the rests when slow): true stops the reading (errImportPaused); slow paces the
// reading to a quarter of one core (ibtPace).
func replayIBT(path, hash string, mtime time.Time, pause func() bool, slow bool) ([]*ibtSession, error) {
	x, err := openIBT(path)
	if err != nil {
		return nil, err
	}
	defer x.Close()
	rd := x.reader()
	env := &importLapEnv{x: x, rd: rd, hash: hash, v: make([]float64, len(lapVars)), org: map[string][2]float64{}, out: map[string]*ibtSession{},
		key: sessionKey(x.yaml), others: otherCars(x.yaml)}
	_, env.carIdx = x.index["CarIdxLapDistPct"]
	ls := newLapStream(env)
	// the recorder reads 30 samples a second: a file of 60 a second gives every second one, so a third of a second
	// off the track is the same number of samples
	stride := int(math.Round(float64(x.hdr.TickRate) / 30))
	if stride < 1 {
		stride = 1
	}
	// when each sample was: the recording's start date and session clock; without them, counted back from the file's
	// time at its last sample
	base := time.Unix(x.startDate, 0)
	if x.startDate <= 0 || x.startDate > time.Now().Unix()+86400 {
		base = mtime.Add(-time.Duration(float64(x.records) / float64(x.hdr.TickRate) * float64(time.Second)))
	}
	batch := time.Now()
	for i := 0; rd.next(); i++ {
		if slow && i%256 == 255 { // a batch is about ibtBatchWork of work, then three times as long asleep
			if work := time.Since(batch); work >= ibtBatchWork {
				if ibtRestFor(ibtPace(work), pause) {
					return nil, errImportPaused
				}
				batch = time.Now()
			}
		} else if !slow && i%4096 == 4095 && pause != nil && pause() {
			return nil, errImportPaused
		}
		if i%stride != 0 {
			continue
		}
		rd.nums(lapVars, env.v)
		st := env.v[14]
		if x.startDate > 0 && x.startDate <= time.Now().Unix()+86400 {
			env.wall = base.Add(time.Duration((st - x.startTime) * float64(time.Second)))
		} else {
			env.wall = base.Add(time.Duration(float64(i) / float64(x.hdr.TickRate) * float64(time.Second)))
		}
		ls.step(env.v)
		env.settle(env.v[8], false)
	}
	if rd.err != nil {
		return nil, rd.err
	}
	env.settle(0, true)
	var out []*ibtSession
	for _, id := range env.order {
		out = append(out, env.out[id])
	}
	return out, nil
}

// ---------- which files were read ----------

type ibtSeen struct {
	Size  int64  `json:"size"`
	MTime int64  `json:"mtime"`
	Hash  string `json:"hash,omitempty"`
	State string `json:"state"`          // "done", "bad" (could not be read) or "empty" (no lap in it)
	Laps  int    `json:"laps,omitempty"` // laps sent to the account
	At    int64  `json:"at"`
}

// ibtMemory: per account (another account on this PC reads the files again for itself), per file; Backlog: when the
// account's old files were all read (from then on only the new ones are looked for, ibtSched)
type ibtMemory struct {
	Accounts map[string]map[string]ibtSeen `json:"accounts"`
	Backlog  map[string]int64              `json:"backlog,omitempty"`
	Tracks   map[string]int64              `json:"tracks,omitempty"` // when the tracks of every file were last read (trackturns.go)
}

var ibtMemMu sync.Mutex

func ibtMemPath() string { return filepath.Join(dataDir(), "ibt-imported.json") }

func loadIBTMemory() ibtMemory {
	var m ibtMemory
	if b, err := os.ReadFile(ibtMemPath()); err == nil {
		json.Unmarshal(b, &m)
	}
	if m.Accounts == nil {
		m.Accounts = map[string]map[string]ibtSeen{}
	}
	return m
}

func saveIBTMemory(m ibtMemory) {
	b, _ := json.Marshal(m)
	os.MkdirAll(dataDir(), 0o700)
	tmp := ibtMemPath() + ".tmp"
	if os.WriteFile(tmp, b, 0o600) == nil {
		os.Rename(tmp, ibtMemPath())
	}
}

// known: whether this file (same path, size and time, or the same content under another name) was read already
func (m ibtMemory) known(acct, path string, size int64, mtime int64, hash string) bool {
	files := m.Accounts[acct]
	if s, ok := files[path]; ok && s.Size == size && s.MTime == mtime {
		return true
	}
	if hash == "" {
		return false
	}
	for _, s := range files {
		if s.Hash == hash && s.State != "bad" {
			return true
		}
	}
	return false
}

func (m ibtMemory) mark(acct, path string, s ibtSeen) {
	if m.Accounts[acct] == nil {
		m.Accounts[acct] = map[string]ibtSeen{}
	}
	s.At = time.Now().UnixMilli()
	m.Accounts[acct][path] = s
}

// fileHash: the file's size and its first and last 64 KB (enough to know a file again under another name, without
// reading hundreds of megabytes)
func fileHash(path string, size int64) (string, error) {
	f, err := os.Open(path)
	if err != nil {
		return "", err
	}
	defer f.Close()
	h := sha256.New()
	fmt.Fprintf(h, "%d|", size)
	b := make([]byte, 64<<10)
	n, _ := io.ReadFull(f, b)
	h.Write(b[:n])
	if size > int64(len(b)) {
		n, _ = f.ReadAt(b, size-int64(len(b)))
		h.Write(b[:n])
	}
	return hex.EncodeToString(h.Sum(nil))[:24], nil
}

// ---------- where the files are ----------

// ibtDirs: iRacing's telemetry folder (Documents\iRacing\telemetry, Documents in OneDrive too) and a folder named in
// iRacing's app.ini, when it names one that exists
func ibtDirs() []string {
	var roots []string
	if d := documentsDir(); d != "" {
		roots = append(roots, filepath.Join(d, "iRacing"))
	}
	if h, err := os.UserHomeDir(); err == nil {
		roots = append(roots, filepath.Join(h, "Documents", "iRacing"), filepath.Join(h, "OneDrive", "Documents", "iRacing"),
			filepath.Join(h, "OneDrive", "Documentos", "iRacing"))
	}
	seen := map[string]bool{}
	var out []string
	add := func(p string) {
		if p == "" {
			return
		}
		k := strings.ToLower(filepath.Clean(p))
		if seen[k] {
			return
		}
		if st, err := os.Stat(p); err == nil && st.IsDir() {
			seen[k] = true
			out = append(out, p)
		}
	}
	for _, r := range roots {
		add(filepath.Join(r, "telemetry"))
		if b, err := os.ReadFile(filepath.Join(r, "app.ini")); err == nil {
			for _, d := range iniTelemetryDirs(string(b)) {
				add(d)
			}
		}
	}
	return out
}

// iniTelemetryDirs: the values of app.ini keys that name a telemetry folder (a key with "telemetry" and "dir", "path"
// or "folder" in its name)
func iniTelemetryDirs(ini string) []string {
	var out []string
	for _, ln := range strings.Split(ini, "\n") {
		ln = strings.TrimSpace(ln)
		k, v, ok := strings.Cut(ln, "=")
		if !ok || strings.HasPrefix(ln, ";") {
			continue
		}
		k = strings.ToLower(strings.TrimSpace(k))
		if !strings.Contains(k, "telemetry") || !(strings.Contains(k, "dir") || strings.Contains(k, "path") || strings.Contains(k, "folder")) {
			continue
		}
		if i := strings.Index(v, ";"); i >= 0 {
			v = v[:i]
		}
		if v = strings.Trim(strings.TrimSpace(v), `"`); v != "" && filepath.IsAbs(v) {
			out = append(out, v)
		}
	}
	return out
}

type ibtCand struct {
	path  string
	size  int64
	mtime time.Time
}

// ibtFiles: every .ibt in those folders (and their sub-folders), the newest first
func ibtFiles(dirs []string) []ibtCand {
	var out []ibtCand
	for _, d := range dirs {
		filepath.WalkDir(d, func(p string, de fs.DirEntry, err error) error {
			if err != nil {
				return nil
			}
			if de.IsDir() {
				if rel, _ := filepath.Rel(d, p); strings.Count(rel, string(filepath.Separator)) >= 2 {
					return filepath.SkipDir
				}
				return nil
			}
			if !strings.EqualFold(filepath.Ext(p), ".ibt") {
				return nil
			}
			if st, err := de.Info(); err == nil && st.Mode().IsRegular() {
				out = append(out, ibtCand{p, st.Size(), st.ModTime()})
			}
			return nil
		})
	}
	sort.Slice(out, func(i, j int) bool { return out[i].mtime.After(out[j].mtime) })
	return out
}

// ---------- what the account already has ----------

type acctSession struct {
	ID      string `json:"id"`
	Started int64  `json:"started"`
	Drvs    string `json:"drvs"` // DRINKS drivers of its laps
}

type acctLap struct {
	N    int     `json:"n"`
	Time float64 `json:"time"`
}

// localID: a session's id as the PC names it (the server puts the account's name before it)
func localID(id string) string {
	if i := strings.Index(id, ":"); i >= 0 {
		return id[i+1:]
	}
	return id
}

// dedupe drops the laps the account already has. A session of the same track and car (the same one, or one around
// the same time) with DRINKS laps drops the whole file's session: a file cannot tell a friend's laps from yours.
// Otherwise it drops what the same session has (same id: a lap of the same number and time, or the same time), and,
// for an offline session (its id was random when it was recorded live), what a session of the same track and car
// around the same time has when one of these lap times is in it; the laps left then go to that session. fetch reads
// the account.
func dedupe(is *ibtSession, fetch func(path string) ([]byte, error)) error {
	s := is.sess
	q := url.Values{"track": {s.Track}, "car": {s.Car}, "game": {"iracing"}, "limit": {"200"}}
	b, err := fetch("/api/sessions?" + q.Encode())
	if err != nil {
		return err
	}
	var list []acctSession
	if err := json.Unmarshal(b, &list); err != nil {
		return err
	}
	offline := strings.HasPrefix(s.ID, "t-")
	from, to := s.Started-4*3600*1000, is.end+10*60*1000
	for _, c := range list {
		lid := localID(c.ID)
		if c.Drvs != "" && (lid == s.ID || (c.Started >= from && c.Started <= to)) {
			is.laps, is.drinks = nil, true
			return nil
		}
	}
	for _, c := range list {
		lid := localID(c.ID)
		exact := lid == s.ID
		near := offline && strings.HasPrefix(lid, "t-") && c.Started >= from && c.Started <= to
		if !exact && !near {
			continue
		}
		b, err := fetch("/api/sessions/" + url.PathEscape(c.ID))
		if err != nil {
			return err
		}
		var got struct {
			Laps []acctLap `json:"laps"`
		}
		if err := json.Unmarshal(b, &got); err != nil {
			return err
		}
		matched := exact
		for _, l := range is.laps {
			if sameLapTime(got.Laps, l.Time) {
				matched = true
				break
			}
		}
		if !matched {
			continue
		}
		haveN := map[int]float64{}
		for _, l := range got.Laps {
			haveN[l.N] = l.Time
		}
		keep := is.laps[:0]
		for _, l := range is.laps {
			if t, ok := haveN[l.N]; (ok && math.Abs(t-l.Time) < 0.0006) || sameLapTime(got.Laps, l.Time) {
				continue
			}
			keep = append(keep, l)
		}
		is.laps = keep
		if !exact { // the rest of that session goes to it
			is.sess.ID = lid
			for i := range is.laps {
				is.laps[i].ID = fmt.Sprintf("%s-%d", lid, is.laps[i].N)
			}
		}
		if len(is.laps) == 0 {
			return nil
		}
	}
	return nil
}

func sameLapTime(have []acctLap, t float64) bool {
	for _, h := range have {
		if math.Abs(h.Time-t) < 0.0006 {
			return true
		}
	}
	return false
}

// ---------- the import ----------

// uploadTarget: where the laps go (your own site when set up, else your Pitlane HQ account), as cloudUploader
func uploadTarget() cloudConfig {
	acct := accountCloud()
	cloudMu.Lock()
	c := cloudCfg
	cloudMu.Unlock()
	if !c.Enabled || c.URL == "" || c.Key == "" {
		c = acct
	}
	if !c.Enabled || c.URL == "" || c.Key == "" {
		return cloudConfig{}
	}
	return c
}

// simBusy: a sim is connected or iRacing's simulator is running (a file may be being written)
func simBusy() bool {
	if currentStatus().Connected {
		return true
	}
	for name := range runningProcs() {
		if strings.HasPrefix(name, "iracingsim") {
			return true
		}
	}
	return false
}

func outboxLen() int {
	cloudMu.Lock()
	defer cloudMu.Unlock()
	return len(cloudQueue)
}

// waitOutbox: until no lap waits to go (so the account is read with everything sent, and the import never fills the
// outbox); false after 10 minutes, when a sim starts or when stop says so
func waitOutbox(stop func() bool) bool {
	for i := 0; i < 600; i++ {
		if outboxLen() == 0 {
			return true
		}
		if simBusy() || (stop != nil && stop()) {
			return false
		}
		time.Sleep(time.Second)
	}
	return false
}

// ---------- when ----------

const (
	ibtIdleNeed = 5 * time.Minute  // nobody touching the PC this long: the backlog may be read
	ibtAfterSim = 2 * time.Minute  // after the sim closes, so its file is closed
	ibtSafety   = 24 * time.Hour   // once the backlog is read: a look once a day besides
	ibtTick     = 5 * time.Second  // how often the importer looks at the PC (cheap: no folder is read)
	ibtFirst    = 4 * time.Minute  // after Pitlane HQ starts
	ibtPaused   = 1 * time.Minute  // a round stopped (somebody came back, a sim started): the gate decides again
	ibtNoAcct   = 15 * time.Minute // not signed in yet
)

// userIdleFor: how long nobody has touched the PC (systemIdle; tests replace it)
var userIdleFor = systemIdle

// pcIdle: the PC is idle: no input for ibtIdleNeed and no sim running
func pcIdle() bool { return userIdleFor() >= ibtIdleNeed && !simBusy() }

// userBack: somebody uses the PC again (or a sim connected): the backlog stops
func userBack() bool { return currentStatus().Connected || userIdleFor() < ibtIdleNeed }

// ibtSched: when a round runs. While the backlog is read: whenever the PC is idle (not before next). After it: 2
// minutes after the sim was connected and is gone, and at next (once a day, or a retry the last round asked for).
type ibtSched struct {
	next    time.Time
	simOn   bool      // the sim was connected at the last look
	simGone time.Time // when it went (zero: nothing waiting)
}

// due: whether a round starts now; simOn whether a sim is connected now, backlog whether old files are still to be
// read, idle asked only when it matters
func (s *ibtSched) due(now time.Time, simOn, backlog bool, idle func() bool) bool {
	if simOn {
		s.simOn, s.simGone = true, time.Time{}
		return false
	}
	if s.simOn {
		s.simOn, s.simGone = false, now
	}
	if backlog {
		return !now.Before(s.next) && idle()
	}
	if !s.simGone.IsZero() {
		if now.Sub(s.simGone) < ibtAfterSim {
			return false // its file is closing: the after-sim look comes first
		}
		s.simGone = time.Time{}
		return true
	}
	return !now.Before(s.next)
}

// ran: a round ended; retry is when it asked to look again (0: the daily look)
func (s *ibtSched) ran(now time.Time, retry time.Duration) {
	if retry <= 0 {
		retry = ibtSafety
	}
	s.next = now.Add(retry)
}

func ibtImporter() {
	time.Sleep(ibtFirst)
	var s ibtSched
	backlog := map[string]bool{} // account → its old files are all read (from ibt-imported.json, read once)
	for {
		loadPL()
		plMu.Lock()
		acct := plAcc.ID
		plMu.Unlock()
		done, ok := backlog[acct]
		if !ok {
			ibtMemMu.Lock()
			done = loadIBTMemory().Backlog[acct] > 0
			ibtMemMu.Unlock()
			backlog[acct] = done
		}
		if s.due(time.Now(), currentStatus().Connected, !done, pcIdle) {
			stop := func() bool { return currentStatus().Connected }
			if !done {
				stop = userBack
			}
			retry, _ := ibtImportRound(stop)
			delete(backlog, acct) // read again: the round may have finished the backlog
			s.ran(time.Now(), retry)
		}
		time.Sleep(ibtTick)
	}
}

// ibtImportRound reads the files not read yet; stop (asked during the work) stops it. It returns when to look again
// (0: nothing to retry) and whether every file was gone through (the backlog is read).
func ibtImportRound(stop func() bool) (time.Duration, bool) {
	if currentStatus().Demo {
		return 6 * time.Hour, false
	}
	c := uploadTarget()
	loadPL()
	plMu.Lock()
	acct := plAcc.ID
	plMu.Unlock()
	if c.URL == "" || acct == "" {
		return ibtNoAcct, false // not signed in yet
	}
	files := ibtFiles(ibtDirs())
	ibtMemMu.Lock()
	defer ibtMemMu.Unlock()
	mem := loadIBTMemory()
	retry := time.Duration(0)
	for _, f := range files {
		if mem.known(acct, f.path, f.size, f.mtime.UnixMilli(), "") || cloudOnly(f.path) { // a OneDrive placeholder is not downloaded
			continue
		}
		if time.Since(f.mtime) < 2*time.Minute {
			retry = 2 * time.Minute // still being written: looked at again in a moment
			continue
		}
		if simBusy() || (stop != nil && stop()) {
			return ibtPaused, false
		}
		hash, err := fileHash(f.path, f.size)
		if err != nil {
			continue
		}
		seen := ibtSeen{Size: f.size, MTime: f.mtime.UnixMilli(), Hash: hash}
		if mem.known(acct, f.path, f.size, seen.MTime, hash) {
			seen.State = "done"
			mem.mark(acct, f.path, seen)
			saveIBTMemory(mem)
			continue
		}
		n, drinksSkip, err := importIBT(f, hash, c, stop)
		switch {
		case errors.Is(err, errImportPaused):
			return ibtPaused, false
		case err != nil && n < 0: // could not reach the account: try again later
			return 30 * time.Minute, false
		case errors.Is(err, errBadIBT):
			log.Printf("ibt import: %s: %v", filepath.Base(f.path), err)
			seen.State = "bad"
		case err != nil: // in use, or a read failed: the next round tries again
			continue
		case n == 0 && drinksSkip:
			seen.State = "drinks" // the account has DRINKS laps of it: never read again
		case n == 0:
			seen.State = "empty"
		default:
			seen.State, seen.Laps = "done", n
			log.Printf("ibt import: %s: %d laps", filepath.Base(f.path), n)
		}
		mem.mark(acct, f.path, seen)
		saveIBTMemory(mem)
		if !ibtIsFast() && ibtRestFor(5*time.Second, stop) {
			return ibtPaused, false
		}
	}
	// every track's official number of turns, and its map again from the game's position (trackturns.go)
	if ibtTrackScan(files, acct, &mem, stop) {
		saveIBTMemory(mem)
	} else if simBusy() || (stop != nil && stop()) {
		return ibtPaused, false
	}
	if mem.Backlog == nil {
		mem.Backlog = map[string]int64{}
	}
	if mem.Backlog[acct] == 0 { // every old file gone through: from now on only the new ones
		mem.Backlog[acct] = time.Now().UnixMilli()
		saveIBTMemory(mem)
	}
	return retry, true
}

// importIBT reads one file and sends its laps: the laps sent (-1 with the error when the account could not be read),
// and whether a session was left out for its DRINKS laps
func importIBT(f ibtCand, hash string, c cloudConfig, stop func() bool) (int, bool, error) {
	pause := func() bool { return currentStatus().Connected || (stop != nil && stop()) }
	sessions, err := replayIBT(f.path, hash, f.mtime, pause, !ibtIsFast()) // by hand (an admin, ibtnow.go): full speed
	if err != nil {
		return 0, false, err
	}
	fetch := func(p string) ([]byte, error) { return cloudCall(c, "GET", p, nil) }
	sent, drinks := 0, false
	for _, is := range sessions {
		if simBusy() || pause() {
			return sent, drinks, errImportPaused
		}
		if len(is.laps) == 0 {
			continue
		}
		if !waitOutbox(pause) {
			if simBusy() || pause() {
				return sent, drinks, errImportPaused
			}
			return -1, drinks, errors.New("the laps waiting to go do not leave")
		}
		if err := dedupe(is, fetch); err != nil {
			return -1, drinks, err
		}
		drinks = drinks || is.drinks
		if len(is.laps) == 0 {
			continue
		}
		var best *cloudLap
		for i := range is.laps {
			l := is.laps[i]
			queueLap(is.sess, l)
			if l.Valid && l.Trace != nil && l.Trace.X != nil && (best == nil || l.Time < best.Time) {
				best = &is.laps[i]
			}
			sent++
		}
		// the track's map: the fastest clean lap with its path, as a lap driven now draws it
		if best != nil && !isTestDrive(is.sess.Kind) {
			shareLayoutFor(*best, "iracing", is.yaml)
		}
	}
	return sent, drinks, nil
}
