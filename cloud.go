package main

// TrackIQ Cloud agent: records every lap you drive in iRacing (whether or
// not the app is open) and uploads it to your own TrackIQ Cloud
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
	Trace   *lapTrace `json:"trace,omitempty"`
}

type lapTrace struct {
	Bin int          `json:"bin"`
	D   [][6]float64 `json:"d"`           // speed m/s, throttle, brake, gear, steering rad, lap time s
	X   []float64    `json:"x,omitempty"` // where the car was at each point (m, dead reckoning): the track's shape
	Y   []float64    `json:"y,omitempty"`
}

type cloudItem struct {
	Session cloudSession `json:"session"`
	Laps    []cloudLap   `json:"laps"`
}

// cloudDemo also records the demo race (testing only, -cloud-demo).
var cloudDemo bool

var (
	cloudMu     sync.Mutex
	cloudCfg    cloudConfig
	cloudQueue  []cloudItem
	cloudLast   time.Time
	cloudErr    string
	cloudSent   int
	cloudKick   = make(chan struct{}, 1)
	cloudClient = &http.Client{Timeout: 20 * time.Second}
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
		return nil, errors.New("could not reach your TrackIQ Cloud")
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
		for {
			acct := accountCloud()
			cloudMu.Lock()
			c := cloudCfg
			if !c.Enabled || c.URL == "" || c.Key == "" {
				c = acct // no own site set up: the laps go to your TrackIQ account
			}
			if !c.Enabled || c.URL == "" || c.Key == "" || len(cloudQueue) == 0 {
				cloudMu.Unlock()
				break
			}
			item := cloudQueue[0]
			cloudMu.Unlock()
			_, err := cloudCall(c, "POST", "/api/upload", item)
			cloudMu.Lock()
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
					cloudMu.Unlock()
					continue
				}
				cloudMu.Unlock()
				break
			}
			cloudErr = ""
			cloudLast = time.Now()
			cloudSent += len(item.Laps)
			if len(cloudQueue) > 0 {
				cloudQueue = cloudQueue[1:]
			}
			saveOutboxLocked()
			cloudMu.Unlock()
		}
	}
}

func kickCloud() {
	select {
	case cloudKick <- struct{}{}:
	default:
	}
}

func queueLap(s cloudSession, l cloudLap) {
	if fridayDriver() != "" { // a friend's lap on Friday night: community only, not the owner's laps
		return
	}
	acct := accountCloud()
	cloudMu.Lock()
	defer cloudMu.Unlock()
	if !cloudCfg.Enabled && !acct.Enabled {
		return
	}
	// laps of the same session travel together
	if n := len(cloudQueue); n > 0 && cloudQueue[n-1].Session.ID == s.ID && len(cloudQueue[n-1].Laps) < 20 {
		cloudQueue[n-1].Laps = append(cloudQueue[n-1].Laps, l)
	} else {
		cloudQueue = append(cloudQueue, cloudItem{Session: s, Laps: []cloudLap{l}})
	}
	if len(cloudQueue) > 500 { // about 10 000 laps waiting: drop the oldest
		cloudQueue = cloudQueue[len(cloudQueue)-500:]
	}
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
	s := cloudSession{Started: started.UnixMilli(), Track: yamlField(y, "TrackDisplayName"), TrackConfig: yamlField(y, "TrackConfigName"), Game: currentGame(), TrackID: atoi(yamlField(y, "TrackID"))}
	me := yamlField(y, "DriverCarIdx")
	if d := driverBlock(y, me); d != "" {
		s.Car = yamlField(d, "CarScreenName")
		s.CarID = atoi(yamlField(d, "CarID"))
		s.Driver = yamlField(d, "UserName")
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
	"Yaw", "VelocityX", "VelocityY"}

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
	// where the car was at every 5 m point, from its heading and speed (dead reckoning):
	// the shape of the track, drawn by the app from the lap itself
	xy               [][2]float64
	pos, lastPos     [2]float64
	pyaw, pvx, pvy   float64
	pt               float64
	hasPos, posBad   bool
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

func lapRecorder() {
	var cur *lapRec
	var sess cloudSession
	sessNum, sessVer, sessKey := -1, -1, ""
	lastLL := -1.0 // LapLastLapTime one sample before, to tell when iRacing updates it
	t := time.NewTicker(time.Second / 30)
	for range t.C {
		st := currentStatus()
		if !st.connected() || (st.Demo && !cloudDemo) {
			cur, sessNum, sessKey = nil, -1, ""
			continue
		}
		v := telNums(lapVars)
		hasYaw := telHas("Yaw") && telHas("VelocityX")
		prevLL := lastLL
		lastLL = v[8]
		lap, dist, pct, speed := int(v[0]), v[1], v[2], v[3]
		onTrack, sn := v[12] > 0, int(v[13])
		// a new session: another SessionNum, or another event, track or car with the same
		// number (a second practice, a new race), so laps never land in the previous one
		tel.mu.RLock()
		y, ver := tel.session, tel.sessionVer
		tel.mu.RUnlock()
		if ver != sessVer {
			sessVer = ver
			if k := sessionKey(y); k != sessKey {
				if sessKey != "" {
					sessNum = -1
				}
				sessKey = k
			}
		}
		if sn != sessNum {
			sessNum, cur = sn, nil
			sess = sessionMeta(y, sn, time.Now())
			sess.AirTemp, sess.TrackTemp = v[15], v[16]
		}
		if !onTrack {
			cur = nil
			continue
		}
		if cur == nil || lap != cur.n {
			if cur != nil && lap == cur.n+1 {
				setLapCut(sn, cur.n, cur.off >= offTrackSamples) // the race report reads the same verdict
				done, s := cur, sess
				fuelNow := v[9]
				prevLast := prevLL
				go func() { // iRacing updates the last lap time a moment after the line
					finishLap(done, s, fuelNow, waitLastLap(done, prevLast))
				}()
			}
			cur = &lapRec{n: lap, fuel0: v[9], inc0: v[11]}
		}
		if pct < 0 || dist < 0 {
			continue
		}
		if hasYaw {
			cur.move(v[14], v[19], v[20], v[21])
		}
		cur.add(dist, v[17], speed, [4]float64{v[4], v[5], v[6], v[7]})
		cur.vmax = math.Max(cur.vmax, speed)
		if v[10] > 0 {
			cur.pit = true
		}
		// an incident alone does not make a lap invalid; leaving the track for a third of a second (all
		// four wheels out, cutting a corner) does, so it is never shared; only where the game reports the surface
		if v[18] == 0 && telHas("PlayerTrackSurface") {
			if cur.off++; cur.off >= offTrackSamples {
				cur.bad = true
			}
		}
	}
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
		if lt <= 0 {
			continue
		}
		if measured > 0 && math.Abs(lt-measured) < 0.25 { // matches what was measured here
			return lt
		}
		if lt != prev && (measured <= 0 || math.Abs(lt-measured) < 1.5) {
			return lt
		}
	}
	if measured > 0 {
		return measured
	}
	return -1
}

func finishLap(r *lapRec, s cloudSession, fuelNow, lt float64) {
	if lt <= 0 || len(r.bins) < 40 {
		return
	}
	// fill gaps from neighbours so the trace is continuous; a hole longer
	// than 40 m means part of the lap was not recorded
	gap, maxGap := 0, 0
	for i := range r.bins {
		if r.bins[i][0] < 0 {
			gap++
			if gap > maxGap {
				maxGap = gap
			}
		} else {
			gap = 0
		}
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
		return
	}
	for k := prev + 1; k < len(r.bins); k++ {
		r.bins[k] = r.bins[prev]
	}
	// valid means the same here as in the race summary: the car stayed on the track (no cut).
	// A pit lane lap or one with a hole in its telemetry is still a lap, just never a best.
	l := cloudLap{ID: fmt.Sprintf("%s-%d", s.ID, r.n), N: r.n, Time: round(lt, 3), Valid: !r.bad, Pit: r.pit,
		Fuel: round(r.fuel0-fuelNow, 3), Vmax: round(r.vmax, 2), Trace: &lapTrace{Bin: lapBin, D: r.bins}}
	if x, y := r.shape(maxGap); x != nil {
		l.Trace.X, l.Trace.Y = x, y
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
	best := l.Valid && !l.Pit && maxGap*lapBin <= 40
	if best {
		recordSetupLap(l.Time)
	}
	recordBookLap(l.Time, l.Fuel, best)
	if best {
		shareLap(l)
	}
	if best && l.Trace.X != nil {
		shareLayout(l, s)
	}
	queueLap(s, l)
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
	// a lap is a loop: the gap between where it ended and where it started is drift
	ex, ey := x[n-1]-x[0], y[n-1]-y[0]
	if math.Hypot(ex, ey) > 150 { // not a loop (a partial lap or a reset): no shape
		return nil, nil
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

// accountCloud: with a TrackIQ account your laps are kept on the TrackIQ
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
