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
}

type cloudLap struct {
	ID      string    `json:"id"`
	N       int       `json:"n"`
	Time    float64   `json:"time"`
	Valid   bool      `json:"valid"`
	Fuel    float64   `json:"fuel,omitempty"`
	Vmax    float64   `json:"vmax,omitempty"`
	Sectors []float64 `json:"sectors,omitempty"`
	Trace   *lapTrace `json:"trace,omitempty"`
}

type lapTrace struct {
	Bin int          `json:"bin"`
	D   [][5]float64 `json:"d"` // speed m/s, throttle, brake, gear, steering rad
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
		return nil, errors.New(e.Error)
	}
	return b, nil
}

// cloudUploader sends queued laps, retrying every minute when it fails.
func cloudUploader() {
	t := time.NewTicker(time.Minute)
	for {
		select {
		case <-t.C:
		case <-cloudKick:
		}
		for {
			cloudMu.Lock()
			c := cloudCfg
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
	cloudMu.Lock()
	defer cloudMu.Unlock()
	if !cloudCfg.Enabled {
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
	s := cloudSession{Started: started.UnixMilli(), Track: yamlField(y, "TrackDisplayName"), TrackConfig: yamlField(y, "TrackConfigName")}
	me := yamlField(y, "DriverCarIdx")
	if d := listItem(y, "CarIdx", me); d != "" {
		s.Car = yamlField(d, "CarScreenName")
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
	"LapLastLapTime", "FuelLevel", "OnPitRoad", "PlayerCarMyIncidentCount", "IsOnTrack", "SessionNum", "SessionTime", "AirTemp", "TrackTempCrew"}

const lapBin = 5 // metres

type lapRec struct {
	n               int
	bins            [][5]float64
	filled          int
	fuel0, vmax     float64
	inc0            float64
	pit, bad        bool
	t0              float64
	secT            []float64
	lastPct, lastSD float64
}

func lapRecorder() {
	var cur *lapRec
	var sess cloudSession
	sessNum := -1
	t := time.NewTicker(time.Second / 30)
	for range t.C {
		st := currentStatus()
		if !st.connected() || (st.Demo && !cloudDemo) {
			cur, sessNum = nil, -1
			continue
		}
		v := telNums(lapVars)
		lap, dist, pct, speed := int(v[0]), v[1], v[2], v[3]
		onTrack, sn, stime := v[12] > 0, int(v[13]), v[14]
		if sn != sessNum {
			tel.mu.RLock()
			y := tel.session
			tel.mu.RUnlock()
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
				done, s := cur, sess
				fuelNow := v[9]
				go func() { // iRacing updates the last lap time a moment after the line
					time.Sleep(2 * time.Second)
					finishLap(done, s, fuelNow)
				}()
			}
			cur = &lapRec{n: lap, fuel0: v[9], inc0: v[11], t0: stime, lastPct: pct}
		}
		if pct < 0 || dist < 0 {
			continue
		}
		b := int(dist / lapBin)
		if b > 4000 {
			continue
		}
		for len(cur.bins) <= b {
			cur.bins = append(cur.bins, [5]float64{-1})
		}
		if cur.bins[b][0] < 0 {
			cur.filled++
		}
		cur.bins[b] = [5]float64{round(speed, 2), round(v[4], 3), round(v[5], 3), v[6], round(v[7], 3)}
		cur.vmax = math.Max(cur.vmax, speed)
		if v[10] > 0 {
			cur.pit = true
		}
		if v[11] > cur.inc0 {
			cur.bad = true
		}
		// sector times at a third and two thirds of the lap
		for k, edge := range []float64{1.0 / 3, 2.0 / 3} {
			if len(cur.secT) == k && cur.lastPct < edge && pct >= edge && pct-cur.lastPct < 0.2 {
				cur.secT = append(cur.secT, stime)
			}
		}
		cur.lastPct = pct
	}
}

func finishLap(r *lapRec, s cloudSession, fuelNow float64) {
	v := telNums([]string{"LapLastLapTime"})
	lt := v[0]
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
	first := [5]float64{}
	for _, b := range r.bins {
		if b[0] >= 0 {
			first = b
			break
		}
	}
	for i := range r.bins {
		if r.bins[i][0] < 0 {
			if i > 0 {
				r.bins[i] = r.bins[i-1]
			} else {
				r.bins[i] = first
			}
		}
	}
	l := cloudLap{ID: fmt.Sprintf("%s-%d", s.ID, r.n), N: r.n, Time: round(lt, 3), Valid: !r.pit && !r.bad && maxGap*lapBin <= 40,
		Fuel: round(r.fuel0-fuelNow, 3), Vmax: round(r.vmax, 2), Trace: &lapTrace{Bin: lapBin, D: r.bins}}
	if len(r.secT) == 2 {
		s1, s2 := r.secT[0]-r.t0, r.secT[1]-r.secT[0]
		if s1 > 0 && s2 > 0 && lt-s1-s2 > 0 {
			l.Sectors = []float64{round(s1, 3), round(s2, 3), round(lt-s1-s2, 3)}
		}
	}
	if l.Fuel < 0 {
		l.Fuel = 0
	}
	queueLap(s, l)
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
				if me.Role != "owner" {
					fail(errors.New("this key can only read; use the owner key (PITLANE_KEY)"))
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
