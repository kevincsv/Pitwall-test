package main

// Pitlane HQ Cloud agent: records every lap you drive in iRacing (whether or
// not the app is open) and uploads it to your own Pitlane HQ Cloud
// (a Cloudflare Worker, see ./cloud). Laps wait on disk until the upload
// works, so nothing is lost when the internet drops.

import (
	"bytes"
	"crypto/rand"
	"encoding/hex"
	"encoding/json"
	"errors"
	"fmt"
	"io"
	"log"
	"math"
	"net/http"
	"net/url"
	"os"
	"path/filepath"
	"regexp"
	"strings"
	"sync"
	"time"
)

type cloudConfig struct {
	URL     string `json:"url"`
	Key     string `json:"key"`
	Enabled bool   `json:"enabled"`
}

type cloudSession struct {
	ID          string  `json:"id"`
	Started     int64   `json:"started"`
	Track       string  `json:"track"`
	TrackConfig string  `json:"trackConfig,omitempty"`
	Car         string  `json:"car"`
	Kind        string  `json:"kind,omitempty"`
	Series      string  `json:"series,omitempty"`
	Driver      string  `json:"driver,omitempty"`
	AirTemp     float64 `json:"airTemp,omitempty"`
	TrackTemp   float64 `json:"trackTemp,omitempty"`
	Game        string  `json:"game,omitempty"`
	TrackID     int     `json:"trackId,omitempty"` // to share a lap from the account to the community
	CarID       int     `json:"carId,omitempty"`
	Lic         string  `json:"lic,omitempty"`      // your license in this session (iRacing's LicString, e.g. "B 3.21"): the leaderboard's class
	Cat         string  `json:"cat,omitempty"`      // the discipline iRacing names (Oval, Road, DirtOval, DirtRoad…)
	Official    *bool   `json:"official,omitempty"` // a session of an official series: those teach the model
	AI          bool    `json:"ai,omitempty"`       // a session with iRacing's AI drivers: its people's laps teach the model too
	Imported    bool    `json:"imported,omitempty"` // read afterwards from a telemetry file on the PC (ibtimport.go), not driven now
	// where you finished (or stand) in the session and how many cars it had (sessionplace.go): practice, qualifying and
	// warmup by the best lap, a race by its order; Cls when it is the place in your class (a multiclass session)
	Pos   int  `json:"pos,omitempty"`
	Field int  `json:"field,omitempty"`
	Cls   bool `json:"cls,omitempty"`
}

type cloudLap struct {
	ID      string    `json:"id"`
	N       int       `json:"n"`
	Time    float64   `json:"time"`
	Valid   bool      `json:"valid"`
	Fuel    float64   `json:"fuel,omitempty"`
	Vmax    float64   `json:"vmax,omitempty"`
	Sectors []float64 `json:"sectors,omitempty"`
	Pit     bool      `json:"pit,omitempty"` // through the pit lane: a real lap, but never a best or shared
	Inc     int       `json:"inc,omitempty"` // incident points during the lap (they do not make it invalid)
	Drv     string    `json:"drv,omitempty"` // DRINKS mode: the friend who drove most of the lap ("" you)
	Trace   *lapTrace `json:"trace,omitempty"`
}

type lapTrace struct {
	Bin  int          `json:"bin"`
	D    [][6]float64 `json:"d"`           // speed m/s, throttle, brake, gear, steering rad, lap time s
	X    []float64    `json:"x,omitempty"` // where the car was at each point (m): the track's shape, from the game's position (G set) or dead reckoning
	Y    []float64    `json:"y,omitempty"`
	G    []float64    `json:"g,omitempty"`    // the origin of X/Y when they come from the game's position: [lat, lon] of x=0, y=0 (x east, y north)
	Inc  []float64    `json:"inc,omitempty"`  // lap distance (m) of each incident, with its points: [d, pts, d, pts…]
	IncK []string     `json:"incK,omitempty"` // what each incident was: "off", "loss", "light" (light contact) or "contact"
	Src  string       `json:"src,omitempty"`  // "field": another car's lap from its position on track (speed real, pedals estimated)
	F    []string     `json:"f,omitempty"`    // what this lap was driven in: "traffic" (a car within a second ahead for a fifth of the lap), "cold" (the first lap of a run, tyres cold); the coach and the model leave such laps aside
}

type cloudItem struct {
	Session cloudSession `json:"session"`
	Laps    []cloudLap   `json:"laps"`
}

// cloudDemo also records the demo race (testing only, -cloud-demo).
var cloudDemo bool

var (
	cloudMu    sync.Mutex
	cloudCfg   cloudConfig
	cloudQueue []cloudItem
	cloudLast  time.Time
	cloudErr   string
	cloudSent  int
	cloudKick  = make(chan struct{}, 1)
	// cloudSending: the head of the outbox is on its way; nothing is added to it (it goes once the server has it)
	cloudSending bool
	cloudClient  = &http.Client{Transport: tlsTransport(), Timeout: 20 * time.Second}
)

func cloudPath() string  { return filepath.Join(activeDir(), "cloud.json") }
func outboxPath() string { return filepath.Join(activeDir(), "cloud-outbox.json") }

// loadCloud reads the active profile's cloud settings (encrypted, they hold the key).
func loadCloud() {
	c := cloudConfig{}
	if b, err := readSecret(cloudPath()); err == nil {
		json.Unmarshal(b, &c)
	}
	var q []cloudItem
	if b, err := os.ReadFile(outboxPath()); err == nil {
		json.Unmarshal(b, &q)
	}
	cloudMu.Lock()
	cloudCfg, cloudQueue, cloudErr = c, q, ""
	cloudMu.Unlock()
}

func saveCloudLocked() {
	b, _ := json.Marshal(cloudCfg)
	writeSecret(cloudPath(), b)
}

func saveOutboxLocked() {
	if len(cloudQueue) == 0 {
		os.Remove(outboxPath())
		return
	}
	b, _ := json.Marshal(cloudQueue)
	os.MkdirAll(activeDir(), 0o700)
	os.WriteFile(outboxPath(), b, 0o600)
}

func cleanCloudURL(u string) (string, error) {
	u = strings.TrimRight(strings.TrimSpace(u), "/")
	if u == "" {
		return "", nil
	}
	if !strings.Contains(u, "://") {
		u = "https://" + u
	}
	p, err := url.Parse(u)
	if err != nil || p.Host == "" || (p.Scheme != "https" && !strings.HasPrefix(p.Host, "localhost") && !strings.HasPrefix(p.Host, "127.0.0.1")) {
		return "", errors.New("the address must start with https://")
	}
	return p.Scheme + "://" + p.Host + strings.TrimRight(p.Path, "/"), nil
}

func cloudCall(c cloudConfig, method, path string, body any) ([]byte, error) {
	var rd io.Reader
	if body != nil {
		b, _ := json.Marshal(body)
		rd = bytes.NewReader(b)
	}
	req, err := http.NewRequest(method, c.URL+path, rd)
	if err != nil {
		return nil, err
	}
	req.Header.Set("Authorization", "Bearer "+c.Key)
	req.Header.Set("Content-Type", "application/json")
	resp, err := cloudClient.Do(req)
	if err != nil {
		return nil, errors.New("could not reach your Pitlane HQ Cloud")
	}
	defer resp.Body.Close()
	b, _ := io.ReadAll(io.LimitReader(resp.Body, 1<<20))
	if resp.StatusCode != 200 {
		var e struct{ Error string }
		json.Unmarshal(b, &e)
		if e.Error == "" {
			e.Error = fmt.Sprintf("HTTP %d", resp.StatusCode)
		}
		return nil, httpErr{resp.StatusCode, e.Error}
	}
	return b, nil
}

type httpErr struct {
	code int
	msg  string
}

func (e httpErr) Error() string { return e.msg }

// cloudUploader sends queued laps, retrying every minute when it fails.
func cloudUploader() {
	t := time.NewTicker(time.Minute)
	for {
		select {
		case <-t.C:
		case <-cloudKick:
		}
		for uploadNext() {
		}
	}
}

// uploadNext sends the item at the head of the outbox; true when the next one may go at once
func uploadNext() bool {
	acct := accountCloud()
	cloudMu.Lock()
	c := cloudCfg
	if !c.Enabled || c.URL == "" || c.Key == "" {
		c = acct // no own site set up: the laps go to your Pitlane HQ account
	}
	if !c.Enabled || c.URL == "" || c.Key == "" || len(cloudQueue) == 0 {
		cloudMu.Unlock()
		return false
	}
	item := cloudQueue[0]
	cloudSending = true
	cloudMu.Unlock()
	_, err := cloudCall(c, "POST", "/api/upload", item)
	cloudMu.Lock()
	defer cloudMu.Unlock()
	cloudSending = false
	if err != nil {
		cloudErr = err.Error()
		var he httpErr
		if errors.As(err, &he) && he.code >= 400 && he.code < 500 && he.code != 401 && he.code != 403 && he.code != 429 {
			// rejected for good (bad data): drop it so the queue keeps moving
			log.Printf("cloud: dropped session %s: %v", item.Session.ID, err)
			if len(cloudQueue) > 0 {
				cloudQueue = cloudQueue[1:]
			}
			saveOutboxLocked()
			return true
		}
		return false
	}
	cloudErr = ""
	cloudLast = time.Now()
	cloudSent += len(item.Laps)
	// the app's page reads the account's sessions again (Home's numbers, My sessions) once a lap is up
	go pushNotice("cloud", map[string]any{"session": item.Session.ID, "laps": len(item.Laps)})
	if len(cloudQueue) > 0 {
		cloudQueue = cloudQueue[1:]
	}
	saveOutboxLocked()
	return true
}

func kickCloud() {
	select {
	case cloudKick <- struct{}{}:
	default:
	}
}

// queueLap: every lap goes to the account as soon as it is done (a friend's in DRINKS mode too, with their name:
// the session and its race summary keep every lap, and the server never takes a friend's lap for yours)
func queueLap(s cloudSession, l cloudLap) {
	acct := accountCloud()
	cloudMu.Lock()
	defer cloudMu.Unlock()
	if !cloudCfg.Enabled && !acct.Enabled {
		return
	}
	// the session's latest place (the lap may wait a moment for its time while the place moves on)
	if p, ok := sessPlaces[s.ID]; ok {
		s.setPlace(p)
	} else if s.Pos > 0 {
		notePlaceLocked(s.ID, s.place())
	}
	if len(lapsQueued) > 200 {
		lapsQueued = map[string]bool{}
	}
	lapsQueued[s.ID] = true
	// laps of the same session travel together
	if n := len(cloudQueue); n > 0 && cloudQueue[n-1].Session.ID == s.ID && len(cloudQueue[n-1].Laps) < 20 && (n > 1 || !cloudSending) {
		cloudQueue[n-1].Laps = append(cloudQueue[n-1].Laps, l)
		cloudQueue[n-1].Session.setPlace(s.place())
	} else {
		cloudQueue = append(cloudQueue, cloudItem{Session: s, Laps: []cloudLap{l}})
	}
	if len(cloudQueue) > 500 { // about 10 000 laps waiting: drop the oldest (never the one on its way)
		if cloudSending {
			cloudQueue = append(cloudQueue[:1], cloudQueue[len(cloudQueue)-499:]...)
		} else {
			cloudQueue = cloudQueue[len(cloudQueue)-500:]
		}
	}
	saveOutboxLocked()
	go kickCloud()
}

// the latest place of each session laps went for (sessionplace.go), and which sessions laps were queued for
var (
	sessPlaces = map[string]sessPlace{}
	lapsQueued = map[string]bool{}
)

func notePlaceLocked(id string, p sessPlace) {
	if len(sessPlaces) > 200 {
		sessPlaces = map[string]sessPlace{}
	}
	sessPlaces[id] = p
}

// notePlace: the session's place now; the laps queued after this carry it
func notePlace(s cloudSession) {
	cloudMu.Lock()
	defer cloudMu.Unlock()
	notePlaceLocked(s.ID, s.place())
}

// queueSession: the session's final place once it ends (others may improve after your last lap, the results come a
// moment after the line): the session goes again without laps, or rides with laps still waiting. Only for a session
// that has laps in the account.
func queueSession(s cloudSession) {
	acct := accountCloud()
	cloudMu.Lock()
	defer cloudMu.Unlock()
	if (!cloudCfg.Enabled && !acct.Enabled) || s.Pos <= 0 {
		return
	}
	notePlaceLocked(s.ID, s.place())
	if !lapsQueued[s.ID] { // its laps are still waiting for their time: they carry the place
		return
	}
	for i := range cloudQueue {
		if cloudQueue[i].Session.ID == s.ID {
			cloudQueue[i].Session.setPlace(s.place())
		}
	}
	// always an item of its own: the one at the head may be on its way already with the place before
	cloudQueue = append(cloudQueue, cloudItem{Session: s})
	saveOutboxLocked()
	go kickCloud()
}

// ---------- reading the session ----------

func yamlField(block, key string) string {
	re := regexp.MustCompile(`(?m)^\s*` + regexp.QuoteMeta(key) + `:\s*(.*)$`)
	if m := re.FindStringSubmatch(block); m != nil {
		return strings.Trim(strings.TrimSpace(m[1]), `"`)
	}
	return ""
}

// listItem returns the YAML list entry that starts with "- key: value".
func listItem(y, key, value string) string {
	re := regexp.MustCompile(`(?m)^(\s*)- ` + regexp.QuoteMeta(key) + `: ` + regexp.QuoteMeta(value) + `\s*$`)
	loc := re.FindStringSubmatchIndex(y)
	if loc == nil {
		return ""
	}
	indent := y[loc[2]:loc[3]]
	rest := y[loc[1]:]
	end := regexp.MustCompile(`(?m)^` + regexp.QuoteMeta(indent) + `- |^\S`).FindStringIndex(rest)
	if end != nil {
		rest = rest[:end[0]]
	}
	return rest
}

func sessionMeta(y string, sessionNum int, started time.Time) cloudSession {
	return sessionMetaGame(y, sessionNum, started, currentGame())
}

// sessionMetaGame: the session as sessionMeta reads it, for a given game (the import of old laps reads files, not
// the game running now)
func sessionMetaGame(y string, sessionNum int, started time.Time, game string) cloudSession {
	s := cloudSession{Started: started.UnixMilli(), Track: yamlField(y, "TrackDisplayName"), TrackConfig: yamlField(y, "TrackConfigName"), Game: game, TrackID: atoi(yamlField(y, "TrackID"))}
	me := yamlField(y, "DriverCarIdx")
	if d := driverBlock(y, me); d != "" {
		s.Car = yamlField(d, "CarScreenName")
		s.CarID = atoi(yamlField(d, "CarID"))
		s.Driver = yamlField(d, "UserName")
		s.Lic = yamlField(d, "LicString")
	}
	switch s.Game {
	case "", "iracing":
		s.Cat = yamlField(y, "Category")
		if o := yamlField(y, "Official"); o == "0" || o == "1" {
			off := o == "1"
			s.Official = &off
		}
		s.AI = hasAI(y)
	case "lmu":
		// LMU has no official series: an online session counts as official for the model and an offline one (AI
		// drivers in the field, lmu.go marks them) as a session against the AI, which the model learns from too
		s.Cat = yamlField(y, "Category")
		s.AI = hasAI(y)
		off := !s.AI
		s.Official = &off
	}
	if si := listItem(y, "SessionNum", fmt.Sprint(sessionNum)); si != "" {
		s.Kind = yamlField(si, "SessionType")
	}
	sub := yamlField(y, "SubSessionID")
	if sub != "" && sub != "0" {
		s.ID = fmt.Sprintf("ir-%s-%d", sub, sessionNum)
	} else {
		b := make([]byte, 4)
		rand.Read(b)
		s.ID = fmt.Sprintf("t-%d-%s", started.UnixMilli(), hex.EncodeToString(b))
	}
	if s.Track == "" {
		s.Track = "Unknown track"
	}
	if s.Car == "" {
		s.Car = "Unknown car"
	}
	return s
}

// ---------- lap recorder ----------

var lapVars = []string{"Lap", "LapDist", "LapDistPct", "Speed", "Throttle", "Brake", "Gear", "SteeringWheelAngle",
	"LapLastLapTime", "FuelLevel", "OnPitRoad", "PlayerCarMyIncidentCount", "IsOnTrack", "SessionNum", "SessionTime", "AirTemp", "TrackTempCrew", "LapCurrentLapTime", "PlayerTrackSurface",
	"Yaw", "VelocityX", "VelocityY", "CarLeftRight", "Lat", "Lon", "PlayerCarIdx", "LapBestLapTime", "LapCountFlag"}

const lapBin = 5 // metres

type lapRec struct {
	n                    int
	bins                 [][6]float64 // speed, throttle, brake, gear, steering, lap time at the 5 m point
	fuel0, vmax          float64
	inc0                 float64
	pit, bad             bool
	off                  int // samples with the car off the track (cutting a corner)
	hasLast              bool
	lastD, lastT, lastSp float64
	// where the car was at every 5 m point: from the game's position (Lat/Lon, exact, geo set) or, without it, from
	// its heading and speed (dead reckoning); the shape of the track, drawn by the app from the lap itself
	xy             [][2]float64
	pos, lastPos   [2]float64
	pyaw, pvx, pvy float64
	pt             float64
	hasPos, posBad bool
	geo            bool
	org            [2]float64 // the [lat, lon] of x=0, y=0 when the path comes from the game's position
	// the lap's company: how often a car was within a second ahead (checked twice a second), and whether it is the
	// first lap of a run (out of the pits or the session's start: cold tyres)
	trafficN, trafficS int
	cold               bool
	lastPct            float64 // where on the lap the last sample was (0–1)
	early              bool    // started at the line, a moment before iRacing counted the lap
	st0                float64 // a lap seen crossing the line: the session time it crossed it (its own clock, SessionTime - st0)
	ownClock           bool
	bestAt0            float64   // the game's own best lap as this lap ended, the lap before's included (iRacing counts only the laps it accepts)
	gameNo             bool      // the game itself said this lap does not count (Le Mans Ultimate's LapCountFlag)
	incPrev            float64   // the incident count at the previous sample
	incAt              []float64 // [distance, points] of every incident on this lap
	incK               []string  // the kind of each incident
	besideAt           time.Time // the last moment another car was right beside you
	pitB               []bool    // the 5 m points on the pit road (pitlane.go)
	lastPitB           int
	drv                map[string]int // DRINKS mode: who was at the wheel, sampled once a second ("" you)
	drvAt              time.Time
	driver             string // who drove most of the lap, set when it ends
}

// noteDriver counts who is driving (DRINKS mode), once a second: the lap is theirs who drove most of it, so a
// driver changed just after the line or while the car sits in the pits never takes the lap before
func (r *lapRec) noteDriver(now time.Time, who func() string) {
	if !r.drvAt.IsZero() && now.Sub(r.drvAt) < time.Second {
		return
	}
	r.drvAt = now
	if r.drv == nil {
		r.drv = map[string]int{}
	}
	r.drv[who()]++
}

// topDriver: who drove most of the lap ("" you, also when nothing was counted)
func (r *lapRec) topDriver() string {
	best, n := "", -1
	for k, c := range r.drv {
		if c > n || (c == n && k < best) {
			best, n = k, c
		}
	}
	return best
}

// move integrates the car's position from its yaw and velocity (m/s, in the car's frame).
func (r *lapRec) move(t, yaw, vx, vy float64) {
	if r.hasPos {
		dt := t - r.pt
		if dt <= 0 || dt > .25 { // a lost stretch: the shape is no longer trusted
			if dt > .25 {
				r.posBad = true
			}
		} else {
			d := yaw - r.pyaw
			for d > math.Pi {
				d -= 2 * math.Pi
			}
			for d < -math.Pi {
				d += 2 * math.Pi
			}
			h, mx, my := r.pyaw+d/2, (vx+r.pvx)/2, (vy+r.pvy)/2
			r.pos[0] += (mx*math.Cos(h) - my*math.Sin(h)) * dt
			r.pos[1] += (mx*math.Sin(h) + my*math.Cos(h)) * dt
		}
	}
	r.hasPos, r.pt, r.pyaw, r.pvx, r.pvy = true, t, yaw, vx, vy
}

// geoOrigin: the point x=0, y=0 of every lap's path on this track while the program runs (the first position seen,
// rounded to 0.01°, so every lap of the session shares its frame); the apps put two laps with different origins
// together by their G
var (
	geoMu  sync.Mutex
	geoKey string
	geoOrg [2]float64
)

func geoBase(key string, lat, lon float64) [2]float64 {
	geoMu.Lock()
	defer geoMu.Unlock()
	if geoKey != key {
		geoKey, geoOrg = key, [2]float64{math.Round(lat*100) / 100, math.Round(lon*100) / 100}
	}
	return geoOrg
}

// geoXY: metres east and north of the origin for a latitude and longitude
func geoXY(org [2]float64, lat, lon float64) (float64, float64) {
	return (lon - org[1]) * 111320 * math.Cos(org[0]*math.Pi/180), (lat - org[0]) * 110540
}

// place puts the car where the game says it is (its latitude and longitude): no drift, every lap in the same frame
func (r *lapRec) place(t float64, org [2]float64, lat, lon float64) {
	x, y := geoXY(org, lat, lon)
	if r.hasPos && r.geo {
		if dx, dy := x-r.pos[0], y-r.pos[1]; math.Hypot(dx, dy) > 400 { // a jump: a reset or a tow, not the lap's shape
			r.posBad = true
		}
	}
	r.pos, r.hasPos, r.geo, r.org, r.pt = [2]float64{x, y}, true, true, org, t
}

// add records one telemetry sample at lap distance d (m) and lap time t (s).
// Every 5 m point crossed since the previous sample gets its time
// interpolated, so laps can be compared to the millisecond.
func (r *lapRec) add(d, t, speed float64, ch [4]float64) {
	if d < 0 || t < 0 || (d < 60 && t > 8) { // the previous lap's clock can linger after the line
		return
	}
	if r.hasLast && t < r.lastT { // reset or tow
		r.hasLast = false
	}
	b := int(d / lapBin)
	if b > 4000 {
		return
	}
	for len(r.bins) <= b {
		r.bins = append(r.bins, [6]float64{-1})
		r.xy = append(r.xy, [2]float64{math.NaN(), math.NaN()})
	}
	set := func(k int, sp, tt, f float64) {
		if r.bins[k][0] < 0 {
			r.bins[k] = [6]float64{round(sp, 2), round(ch[0], 3), round(ch[1], 3), ch[2], round(ch[3], 3), round(tt, 4)}
			if r.hasPos {
				r.xy[k] = [2]float64{r.lastPos[0] + (r.pos[0]-r.lastPos[0])*f, r.lastPos[1] + (r.pos[1]-r.lastPos[1])*f}
			}
		}
	}
	if r.hasLast && d >= r.lastD && d-r.lastD < 150 {
		for k := int(r.lastD/lapBin) + 1; k <= b; k++ {
			f := (float64(k*lapBin) - r.lastD) / math.Max(d-r.lastD, 1e-6)
			set(k, r.lastSp+(speed-r.lastSp)*f, r.lastT+(t-r.lastT)*f, f)
		}
	} else if b == 0 {
		set(0, speed, math.Max(0, t-d/math.Max(speed, 1)), 1)
	} else {
		set(b, speed, t, 1)
	}
	r.hasLast, r.lastD, r.lastT, r.lastSp, r.lastPos = true, d, t, speed, r.pos
}

// lapEnv: where the lap recorder's samples come from and where its laps go. The live game (liveLapEnv) and the
// telemetry files on the PC (ibtimport.go) drive the same recorder, so a lap read afterwards follows exactly the rules
// of a lap driven now.
type lapEnv interface {
	yaml() (string, int)                                     // the session YAML and its version
	runKey(sn int) string                                    // the session the samples belong to (noteRun's key)
	noteRun(key string, st float64, lap int) (int, int)      // the run's lap offset (sessionrun.go)
	carsAhead(dist, pct, speed float64, me int) (bool, bool) // a car within a second ahead; false, false without the cars' positions
	driver() string                                          // who is at the wheel (DRINKS mode, "" you)
	geo(key string, lat, lon float64) [2]float64             // the origin of the paths of this session's laps
	has(name string) bool                                    // whether the source sends this variable
	meta(y string, sn int) cloudSession                      // the session the laps go to
	lapEnded(sn int, done *lapRec, s cloudSession, fuelNow, prevLL float64)
	now() time.Time
	livePlace() (int, int)       // the game's live place of the player and in its class (0, 0 unknown)
	sessionEnded(s cloudSession) // the session is over: its final place (sessionplace.go)
}

// lapStream: the lap recorder's state between two samples
type lapStream struct {
	env              lapEnv
	cur              *lapRec
	sess             cloudSession
	sessNum, sessVer int
	sessKey          string
	lastBase         int     // the lap offset of the session's current run (sessionrun.go)
	lastLL           float64 // LapLastLapTime one sample before, to tell when iRacing updates it
	lastST           float64 // SessionTime one sample before
	tick             int
	// the session's place (sessionplace.go): the YAML of its event as last seen, the game's live place of the player
	// (sampled once a second), the laps that ended in it and the place they carried
	sessY            string
	livePos, liveCls int
	sessLaps         int
	sentPlace        sessPlace
	placeTick        int
}

func newLapStream(env lapEnv) *lapStream {
	return &lapStream{env: env, sessNum: -1, sessVer: -1, lastLL: -1}
}

// reset: the game is gone (or not read): the lap under way is dropped
func (ls *lapStream) reset() {
	ls.endSession()
	ls.cur, ls.sessNum, ls.sessKey = nil, -1, ""
}

// place: the session's place now, from the game's results and its live place
func (ls *lapStream) place(y string, sn int) sessPlace {
	return sessionPlaceOf(y, sn, ls.sess.Kind, ls.livePos, ls.liveCls)
}

// endSession: a session with laps is over: its final place goes to the account when it moved since the last lap
func (ls *lapStream) endSession() {
	if ls.sessLaps == 0 || ls.sessNum < 0 {
		ls.sessLaps = 0
		return
	}
	ls.sessLaps = 0
	if p := ls.place(ls.sessY, ls.sessNum); p.pos > 0 && p != ls.sentPlace {
		ls.sess.setPlace(p)
		ls.env.sessionEnded(ls.sess)
	}
}

func lapRecorder() {
	ls := newLapStream(liveLapEnv{})
	t := time.NewTicker(time.Second / 30)
	for range t.C {
		st := currentStatus()
		if !st.connected() || (st.Demo && !cloudDemo) {
			ls.reset()
			continue
		}
		ls.step(telNums(lapVars))
	}
}

// step reads one sample (the values of lapVars, in that order), 30 a second
func (ls *lapStream) step(v []float64) {
	env := ls.env
	hasYaw := env.has("Yaw") && env.has("VelocityX")
	hasGeo := env.has("Lat") && env.has("Lon") && math.Abs(v[23]) > 0.001 && math.Abs(v[24]) > 0.001
	prevLL, prevST := ls.lastLL, ls.lastST
	ls.lastLL, ls.lastST = v[8], v[14]
	lap, dist, pct, speed := int(v[0]), v[1], v[2], v[3]
	onTrack, sn := v[12] > 0, int(v[13])
	// a new session: another SessionNum, or another event, track or car with the same
	// number (a second practice, a new race), so laps never land in the previous one
	y, ver := env.yaml()
	if ver != ls.sessVer {
		ls.sessVer = ver
		if k := sessionKey(y); k != ls.sessKey {
			if ls.sessKey != "" {
				ls.endSession() // with the YAML of its own event
				ls.sessNum = -1
			}
			ls.sessKey = k
		} else {
			ls.sessY = y
		}
	}
	if sn != ls.sessNum {
		ls.endSession()
		ls.sessNum, ls.cur = sn, nil
		ls.sess = env.meta(y, sn)
		ls.sess.AirTemp, ls.sess.TrackTemp = v[15], v[16]
		ls.sessY, ls.livePos, ls.liveCls, ls.sentPlace = y, 0, 0, sessPlace{}
	}
	if ls.placeTick++; ls.placeTick%30 == 1 { // the game's live place, once a second (in the pits too)
		if p, c := env.livePlace(); p > 0 {
			ls.livePos, ls.liveCls = p, c
		}
	}
	if !onTrack {
		ls.cur = nil
		return
	}
	cur := ls.cur
	// the session started again without leaving it: the lap under way is gone, and the new run's laps are
	// numbered after the ones already driven (lap is the session's own count from here on)
	base, _ := env.noteRun(env.runKey(sn), v[14], lap)
	if base != ls.lastBase {
		ls.lastBase, cur = base, nil
	}
	lap += base
	// iRacing counts the new lap a moment after the line (a second or more): the samples from the line on already
	// belong to it, or every lap would start with a hole of tens of metres and never be valid
	if cur != nil && cur.early && lap == cur.n-1 {
		lap = cur.n
	} else if cur != nil && lap == cur.n && cur.hasLast && cur.lastPct > 0.9 && pct >= 0 && pct < 0.1 {
		lap = cur.n + 1
	}
	now := env.now()
	if cur == nil || lap != cur.n {
		if cur != nil && lap == cur.n+1 {
			cur.driver = cur.topDriver()
			ls.sess.setPlace(ls.place(y, sn))
			ls.sentPlace = ls.sess.place()
			ls.sessLaps++
			// the game's best as this lap ends: it has the lap before's by now (published a moment after its line) and
			// not yet this one's, so gameAccepts compares this lap with the right "before"
			cur.bestAt0 = v[26]
			env.lapEnded(sn, cur, ls.sess, v[9], prevLL)
		}
		early := cur != nil && lap == cur.n+1 && lap-base != int(v[0])
		// a lap seen crossing the line keeps its own clock from the session's: iRacing restarts its lap clock a moment
		// after the line (in a race even when it counts the lap at once), and the samples before would carry the lap
		// before's time and be dropped, a hole at the start of every lap
		var st0 float64
		own := false
		if cur != nil && lap == cur.n+1 && cur.hasLast && cur.lastPct > 0.9 && pct >= 0 && pct < 0.1 && prevST > 0 && prevST < v[14] {
			own = true
			st0 = v[14]
			if f := (1 - cur.lastPct) + pct; f > 0 { // between the sample before (at lastPct) and this one (at pct)
				st0 = prevST + (v[14]-prevST)*(1-cur.lastPct)/f
			}
		}
		cur = &lapRec{n: lap, fuel0: v[9], inc0: v[11], incPrev: v[11], lastPitB: -1, cold: cur == nil || cur.pit, early: early, st0: st0, ownClock: own}
	}
	ls.cur = cur
	cur.noteDriver(now, env.driver)
	// twice a second: a car within one second ahead (by its place on the lap) is traffic
	if ls.tick++; ls.tick%15 == 0 && speed > 5 && pct > 0.02 && dist > 0 {
		if near, ok := env.carsAhead(dist, pct, speed, int(v[25])); ok {
			cur.trafficS++
			if near {
				cur.trafficN++
			}
		}
	}
	if pct < 0 || dist < 0 {
		return
	}
	if hasGeo { // the game's own position: the exact shape of the track, the same frame for every lap
		cur.place(v[14], env.geo(ls.sessKey, v[23], v[24]), v[23], v[24])
	} else if hasYaw {
		cur.move(v[14], v[19], v[20], v[21])
	}
	if v[22] > 1 { // a car beside you
		cur.besideAt = now
	}
	if v[11] > cur.incPrev && len(cur.incAt) < 80 { // an incident: where on the lap, how many points and what it was
		pts := v[11] - cur.incPrev
		cur.incAt = append(cur.incAt, math.Max(0, math.Round(dist)), pts)
		// the kind iRacing gives each incident by its points: 1x Off Track, 2x Loss of Control, 4x Car Contact
		// (a 0x Light Contact adds nothing to the count, so it is never seen here)
		k := "off"
		switch {
		case pts >= 4:
			k = "contact"
		case pts >= 2:
			k = "loss"
		}
		if int(pts)%2 == 1 { // an Off Track (1x, alone or with another incident) makes the lap invalid
			cur.bad = true
		}
		cur.incK = append(cur.incK, k)
	}
	cur.incPrev = v[11]
	// the game's lap clock goes on with the lap before for a moment after the line: a lap that started there keeps its
	// own clock from the session's, or its first metres would be dropped (the hole made every lap not valid)
	lt := v[17]
	if cur.ownClock && v[14] >= cur.st0 {
		lt = v[14] - cur.st0
	}
	cur.add(dist, lt, speed, [4]float64{v[4], v[5], v[6], v[7]})
	cur.lastPct = pct
	cur.vmax = math.Max(cur.vmax, speed)
	if v[10] > 0 {
		cur.pit = true
		cur.markPit(dist)
	} else if env.has("LapCountFlag") && v[27] < 2 && dist > 100 && !cur.pit {
		// the game says this lap's time does not count (track limits, a cut): the game's verdict is the lap's (the
		// first 100 m aside, while the flag of the lap before may still show; the pit lane aside, a lap through it
		// is valid)
		cur.gameNo, cur.bad = true, true
	}
	// an incident alone does not make a lap invalid; leaving the track for a third of a second (all
	// four wheels out, cutting a corner) does, so it is never shared; only where the game reports the surface
	if v[18] == 0 && env.has("PlayerTrackSurface") {
		if cur.off++; cur.off >= offTrackSamples {
			cur.bad = true
		}
	}
}

// liveLapEnv: the game running now (the shared memory read by reader)
type liveLapEnv struct{}

func (liveLapEnv) yaml() (string, int) {
	tel.mu.RLock()
	defer tel.mu.RUnlock()
	return tel.session, tel.sessionVer
}
func (liveLapEnv) runKey(sn int) string { return curRunKey(sn) }
func (liveLapEnv) noteRun(key string, st float64, lap int) (int, int) {
	return noteRun(key, st, lap)
}
func (liveLapEnv) carsAhead(dist, pct, speed float64, me int) (bool, bool) {
	arr := telArrays([]string{"CarIdxLapDistPct", "CarIdxOnPitRoad"})
	if len(arr[0]) == 0 {
		return false, false
	}
	return carAhead(arr[0], arr[1], dist, pct, speed, me), true
}
func (liveLapEnv) driver() string                              { return fridayDriver() }
func (liveLapEnv) geo(key string, lat, lon float64) [2]float64 { return geoBase(key, lat, lon) }
func (liveLapEnv) has(name string) bool                        { return telHas(name) }
func (liveLapEnv) meta(y string, sn int) cloudSession          { return sessionMeta(y, sn, time.Now()) }
func (liveLapEnv) now() time.Time                              { return time.Now() }
func (liveLapEnv) livePlace() (int, int) {
	v := telNums([]string{"PlayerCarPosition", "PlayerCarClassPosition"})
	return int(v[0]), int(v[1])
}
func (liveLapEnv) sessionEnded(s cloudSession) { queueSession(s) }
func (liveLapEnv) lapEnded(sn int, done *lapRec, s cloudSession, fuelNow, prevLast float64) {
	notePlace(s)                                  // the laps still waiting for their time carry the newest place
	setLapCut(sn, done.n, done.invalid())         // the race report reads the same verdict
	setLapIncs(sn, done.n, done.incAt, done.incK) // and the same incidents
	setLapDriver(sn, done.n, done.driver)         // and the same driver
	go func() {                                   // iRacing updates the last lap time a moment after the line
		lt := waitLastLap(done, prevLast)
		setLapTime(sn, done.n, lt)
		// iRacing has no "valid" flag for a lap, but its own best lap takes only the laps it accepts: a lap faster
		// than its best that it does not take, it did not accept, so it is not valid here either
		if !done.invalid() && currentGame() == "iracing" && !gameAccepts(done.bestAt0, lt, func() float64 { return telNums([]string{"LapBestLapTime"})[0] }, 15) {
			done.bad = true
			setLapCut(sn, done.n, true)
			log.Printf("lap %d: iRacing did not count %.3f as its best (best before %.3f): not valid", done.n, lt, done.bestAt0)
		}
		finishLap(done, s, fuelNow, lt)
	}()
}

// carAhead: a car within one second ahead of yours (by its place on the lap), cars on the pit road aside
func carAhead(pcts, pits []float64, dist, pct, speed float64, me int) bool {
	L := dist / pct
	for i, p := range pcts {
		if i == me || p < 0 || (len(pits) > i && pits[i] > 0) {
			continue
		}
		gap := p - pct
		if gap < 0 {
			gap++
		}
		if g := gap * L; g > 0 && g < speed*1.0 {
			return true
		}
	}
	return false
}

// sessionKey: what makes a session different (event, track, car) besides its number.
func sessionKey(y string) string {
	c := ""
	if d := driverBlock(y, yamlField(y, "DriverCarIdx")); d != "" {
		c = yamlField(d, "CarScreenName")
	}
	return yamlField(y, "SubSessionID") + "|" + yamlField(y, "TrackID") + "|" + yamlField(y, "TrackConfigName") + "|" + c
}

// waitLastLap returns iRacing's official time of the lap just finished: it waits up to
// 6 s for LapLastLapTime to change and to agree with the time measured here (within 1.5 s).
// If it never does, the measured time is used.
func waitLastLap(r *lapRec, prev float64) float64 {
	measured := r.lastT
	for i := 0; i < 30; i++ {
		time.Sleep(200 * time.Millisecond)
		lt := telNums([]string{"LapLastLapTime"})[0]
		// still the lap before's (two laps a few tenths apart once took the same time this way): wait
		if lt <= 0 || lt == prev {
			continue
		}
		if measured <= 0 || math.Abs(lt-measured) < 1.5 {
			return lt
		}
	}
	if measured > 0 {
		return measured
	}
	return -1
}

// gameAccepts: false only when the game plainly did not count a lap: faster than its best before and
// its best did not become it within tries × 200 ms. A slower lap says nothing (the game's best stays as it was).
func gameAccepts(before, lt float64, best func() float64, tries int) bool {
	if lt <= 0 || before <= 0 || lt >= before-0.0005 {
		// not faster, or the game has no best yet this session (its best not proven to move here): it tells nothing
		return true
	}
	for i := 0; i < tries; i++ {
		if b := best(); b > 0 && math.Abs(b-lt) < 0.002 {
			return true
		}
		if i < tries-1 {
			time.Sleep(200 * time.Millisecond)
		}
	}
	return false
}

// fullLap: the car went round the whole circuit, at least 90 % of the lap's points seen on track (a few lost samples
// are filled in; a lap that skipped part of the track is not)
func fullLap(seen, bins int) bool { return bins > 0 && float64(seen) >= 0.9*float64(bins) }

// invalid: what makes a lap not valid, and only that: leaving the track (an Off Track, or all four wheels out for a
// third of a second) or lost connection (a hole in its telemetry, or not the whole circuit). A Loss of Control or a
// Car Contact counts only when it takes the car off the track; a lap through the pit lane is valid.
func (r *lapRec) invalid() bool {
	return r.bad || r.off >= offTrackSamples
}

func finishLap(r *lapRec, s cloudSession, fuelNow, lt float64) {
	l, ok := buildLap(r, s, fuelNow, lt)
	if !ok {
		return
	}
	best := l.Valid          // a lap through the pit lane counts like any other
	if best && l.Drv == "" { // a friend's lap (DRINKS) is never your best
		recordSetupLap(l.Time)
	}
	recordBookLap(l.Time, l.Fuel, best && l.Drv == "")
	if best {
		shareLap(l, s)
	}
	if best && l.Trace.X != nil {
		shareLayout(l, s)
	}
	// the pit lane: laps through the pits against a clean lap of the same track
	if l.Trace.X != nil && (best || r.pit) {
		go notePitLap(s.TrackID, l.Trace.X, l.Trace.Y, r.pitB, best)
	}
	queueLap(s, l)
}

// buildLap turns a finished lap into what goes to the account: the trace with its holes filled, the verdict (valid or
// not), the path, the tags, the incidents and the sectors. false when there is no lap (no time, too few points).
func buildLap(r *lapRec, s cloudSession, fuelNow, lt float64) (cloudLap, bool) {
	if lt <= 0 || len(r.bins) < 40 {
		return cloudLap{}, false
	}
	// fill gaps from neighbours so the trace is continuous; a hole longer
	// than 40 m means part of the lap was not recorded
	gap, maxGap, seen := 0, 0, 0
	for i := range r.bins {
		if r.bins[i][0] < 0 {
			gap++
			if gap > maxGap {
				maxGap = gap
			}
		} else {
			gap = 0
			seen++
		}
	}
	// lost connection: a hole in the lap's telemetry longer than 40 m, or a lap that did not go round the whole
	// circuit (a reset or a tow to the pits), is no valid lap, whatever its time
	if !fullLap(seen, len(r.bins)) || maxGap*lapBin > 40 {
		r.bad = true
	}
	// holes (lost samples) are filled in a straight line between the points around them
	prev := -1
	for i := range r.bins {
		if r.bins[i][0] < 0 {
			continue
		}
		if prev >= 0 && i-prev > 1 {
			for k := prev + 1; k < i; k++ {
				f := float64(k-prev) / float64(i-prev)
				for c := 0; c < 6; c++ {
					r.bins[k][c] = r.bins[prev][c] + (r.bins[i][c]-r.bins[prev][c])*f
				}
			}
		} else if prev < 0 {
			for k := 0; k < i; k++ {
				r.bins[k] = r.bins[i]
			}
		}
		prev = i
	}
	if prev < 0 {
		return cloudLap{}, false
	}
	for k := prev + 1; k < len(r.bins); k++ {
		r.bins[k] = r.bins[prev]
	}
	// valid means the same here as in the race summary: the car stayed on the track (no cut).
	// A pit lane lap or one with a hole in its telemetry is still a lap, just never a best.
	l := cloudLap{ID: fmt.Sprintf("%s-%d", s.ID, r.n), N: r.n, Time: round(lt, 3), Valid: !r.invalid(), Pit: r.pit,
		Fuel: round(r.fuel0-fuelNow, 3), Vmax: round(r.vmax, 2), Drv: r.driver, Trace: &lapTrace{Bin: lapBin, D: r.bins}}
	if x, y := r.shape(maxGap); x != nil {
		l.Trace.X, l.Trace.Y = x, y
		if r.geo {
			l.Trace.G = []float64{r.org[0], r.org[1]}
		}
	}
	if r.trafficS >= 10 && float64(r.trafficN) > 0.2*float64(r.trafficS) {
		l.Trace.F = append(l.Trace.F, "traffic")
	}
	if r.cold {
		l.Trace.F = append(l.Trace.F, "cold")
	}
	if len(r.incAt) > 0 {
		l.Trace.Inc, l.Trace.IncK = r.incAt, r.incK
		for i := 1; i < len(r.incAt); i += 2 {
			l.Inc += int(r.incAt[i])
		}
	}
	// sectors: thirds of the lap distance, from the interpolated times
	n := len(r.bins)
	t1, t2 := r.bins[n/3][5], r.bins[2*n/3][5]
	if t1 > 0 && t2 > t1 && lt > t2 {
		l.Sectors = []float64{round(t1, 3), round(t2-t1, 3), round(lt-t2, 3)}
	}
	if l.Fuel < 0 {
		l.Fuel = 0
	}
	return l, true
}

// shape: the lap's x/y at every 5 m point, closed into a loop (the small drift of dead
// reckoning spread along the lap); nil when the position was not recorded or part is missing.
func (r *lapRec) shape(maxGap int) ([]float64, []float64) {
	n := len(r.bins)
	if !r.hasPos || r.posBad || len(r.xy) != n || n < 40 || maxGap*lapBin > 40 {
		return nil, nil
	}
	x, y := make([]float64, n), make([]float64, n)
	prev, missing := -1, 0
	for i := range r.xy {
		if math.IsNaN(r.xy[i][0]) {
			missing++
			continue
		}
		x[i], y[i] = r.xy[i][0], r.xy[i][1]
		if prev >= 0 && i-prev > 1 {
			for k := prev + 1; k < i; k++ {
				f := float64(k-prev) / float64(i-prev)
				x[k], y[k] = x[prev]+(x[i]-x[prev])*f, y[prev]+(y[i]-y[prev])*f
			}
		} else if prev < 0 {
			for k := 0; k < i; k++ {
				x[k], y[k] = x[i], y[i]
			}
		}
		prev = i
	}
	if prev < 0 || missing > n/10 {
		return nil, nil
	}
	for k := prev + 1; k < n; k++ {
		x[k], y[k] = x[prev], y[prev]
	}
	// a lap is a loop: the gap between where it ended and where it started is drift (dead reckoning), or a lap that was
	// not a loop (a partial lap or a reset)
	ex, ey := x[n-1]-x[0], y[n-1]-y[0]
	if math.Hypot(ex, ey) > 150 {
		return nil, nil
	}
	if r.geo { // the game's position has no drift: the points stay where the car was
		for i := range x {
			x[i], y[i] = round(x[i], 1), round(y[i], 1)
		}
		return x, y
	}
	for i := range x {
		f := float64(i) / float64(n-1)
		x[i], y[i] = round(x[i]-ex*f, 1), round(y[i]-ey*f, 1)
	}
	return x, y
}

// offTrackSamples: a third of a second off the track (at 30 samples a second) makes the lap invalid.
const offTrackSamples = 10

// which laps were cut (left the track), measured once here at 30 Hz and read by the race report, so
// the report, the lap analyzer and sharing always agree
var (
	lapCutMu sync.Mutex
	lapCuts  = map[[2]int]bool{}
)

// the incidents of each lap, as the recorder saw them: the race report takes them from here, so the
// analysis, the summary and the coach tell the same story
type lapIncRec struct {
	at []float64 // [distance, points] pairs
	k  []string
}

var (
	lapIncMu sync.Mutex
	lapIncs  = map[[2]int]lapIncRec{}
)

func setLapIncs(session, lap int, at []float64, k []string) {
	lapIncMu.Lock()
	defer lapIncMu.Unlock()
	if len(lapIncs) > 2000 {
		lapIncs = map[[2]int]lapIncRec{}
	}
	lapIncs[[2]int{session, lap}] = lapIncRec{at: append([]float64{}, at...), k: append([]string{}, k...)}
}

// recorderIncidents: the recorder's incidents of these laps as the race report keeps them, and the
// points per lap; nil when the recorder did not see the laps.
func recorderIncidents(session int, laps []raceLap) ([]incEvent, map[int]int) {
	lapIncMu.Lock()
	defer lapIncMu.Unlock()
	var out []incEvent
	per, seen := map[int]int{}, false
	for _, l := range laps {
		rec, ok := lapIncs[[2]int{session, l.N}]
		if !ok {
			continue
		}
		seen = true
		for i := 0; i+1 < len(rec.at); i += 2 {
			kind := "off"
			if i/2 < len(rec.k) {
				kind = rec.k[i/2]
			}
			out = append(out, incEvent{Lap: l.N, D: rec.at[i], Pts: int(rec.at[i+1]), Kind: kind})
			per[l.N] += int(rec.at[i+1])
		}
	}
	if !seen {
		return nil, nil
	}
	return out, per
}

// the time and the driver of each lap as the recorder settled them (the game's time once it is this lap's, who
// drove most of it): the race report takes them from here, so a lap has one time and one driver everywhere
var (
	lapMetaMu sync.Mutex
	lapTimes  = map[[2]int]float64{}
	lapDrvs   = map[[2]int]string{}
)

func setLapTime(session, lap int, t float64) {
	lapMetaMu.Lock()
	defer lapMetaMu.Unlock()
	if len(lapTimes) > 2000 {
		lapTimes = map[[2]int]float64{}
	}
	lapTimes[[2]int{session, lap}] = t
}

// lapTimeRec: the recorder's time of a lap, false while it has none yet
func lapTimeRec(session, lap int) (float64, bool) {
	lapMetaMu.Lock()
	defer lapMetaMu.Unlock()
	t, ok := lapTimes[[2]int{session, lap}]
	return t, ok
}

func setLapDriver(session, lap int, d string) {
	lapMetaMu.Lock()
	defer lapMetaMu.Unlock()
	if len(lapDrvs) > 2000 {
		lapDrvs = map[[2]int]string{}
	}
	lapDrvs[[2]int{session, lap}] = d
}

// lapDriver: who drove a lap, as the recorder counted it (false when it did not see the lap)
func lapDriver(session, lap int) (string, bool) {
	lapMetaMu.Lock()
	defer lapMetaMu.Unlock()
	d, ok := lapDrvs[[2]int{session, lap}]
	return d, ok
}

func setLapCut(session, lap int, cut bool) {
	lapCutMu.Lock()
	defer lapCutMu.Unlock()
	if len(lapCuts) > 2000 {
		lapCuts = map[[2]int]bool{}
	}
	lapCuts[[2]int{session, lap}] = cut
}

func lapCut(session, lap int) bool {
	lapCutMu.Lock()
	defer lapCutMu.Unlock()
	return lapCuts[[2]int{session, lap}]
}

func round(v float64, d int) float64 {
	p := math.Pow(10, float64(d))
	return math.Round(v*p) / p
}

// ---------- settings page ----------

func registerCloudRoutes(mux *http.ServeMux) {
	mux.HandleFunc("/api/cloud", func(w http.ResponseWriter, r *http.Request) {
		fail := func(err error) {
			w.WriteHeader(400)
			writeJSON(w, map[string]string{"error": err.Error()})
		}
		if r.Method == http.MethodPost {
			var in struct {
				Action, URL, Key string
				Enabled          bool
			}
			json.NewDecoder(io.LimitReader(r.Body, 8192)).Decode(&in)
			switch in.Action {
			case "save":
				u, err := cleanCloudURL(in.URL)
				if err != nil {
					fail(err)
					return
				}
				cloudMu.Lock()
				cloudCfg.URL, cloudCfg.Enabled = u, in.Enabled
				if k := strings.TrimSpace(in.Key); k != "" {
					cloudCfg.Key = k
				}
				saveCloudLocked()
				cloudMu.Unlock()
				kickCloud()
			case "test":
				cloudMu.Lock()
				c := cloudCfg
				cloudMu.Unlock()
				if c.URL == "" || c.Key == "" {
					fail(errors.New("save the address and the key first"))
					return
				}
				b, err := cloudCall(c, "GET", "/api/me", nil)
				if err != nil {
					fail(err)
					return
				}
				var me struct{ Role string }
				json.Unmarshal(b, &me)
				if me.Role == "viewer" {
					fail(errors.New("this key can only read; use your own key (PITLANE_KEY or a team key)"))
					return
				}
			case "newkey":
				b := make([]byte, 24)
				rand.Read(b)
				writeJSON(w, map[string]string{"key": hex.EncodeToString(b)})
				return
			case "forget":
				cloudMu.Lock()
				cloudCfg = cloudConfig{}
				cloudQueue = nil
				saveOutboxLocked()
				os.Remove(cloudPath())
				cloudMu.Unlock()
			default:
				fail(errors.New("unknown action"))
				return
			}
		}
		cloudMu.Lock()
		out := map[string]any{"url": cloudCfg.URL, "hasKey": cloudCfg.Key != "", "enabled": cloudCfg.Enabled, "waiting": 0,
			"sent": cloudSent, "error": cloudErr, "last": nil}
		n := 0
		for _, it := range cloudQueue {
			n += len(it.Laps)
		}
		out["waiting"] = n
		if !cloudLast.IsZero() {
			out["last"] = cloudLast.UnixMilli()
		}
		cloudMu.Unlock()
		writeJSON(w, out)
	})
}

// accountCloud: with a Pitlane HQ account your laps are kept on the Pitlane HQ
// server under your account, with nothing to set up (no key to create).
func accountCloud() cloudConfig {
	loadPL()
	plMu.Lock()
	tok, off := plAcc.Token, plAcc.NoLaps
	plMu.Unlock()
	if tok == "" || off {
		return cloudConfig{}
	}
	base := commBase()
	if base == "" {
		return cloudConfig{}
	}
	return cloudConfig{URL: base, Key: tok, Enabled: true}
}
