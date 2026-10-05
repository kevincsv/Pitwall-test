package main

// Community: you choose what to share (nothing by default): your best lap
// times, the whole lap (telemetry trace) and your race analyses. Shared laps
// can be compared in the braking coach. Other drivers' names are removed from
// the race analyses you share.

import (
	"bytes"
	"encoding/json"
	"errors"
	"fmt"
	"io"
	"net/http"
	"net/url"
	"path/filepath"
	"strconv"
	"strings"
	"sync"
	"time"
)

// the central community server (set it when it is deployed; overridable in the app)
var communityURL = ""

type commConfig struct {
	URL          string `json:"url,omitempty"`
	Alias        string `json:"alias"`
	ShareTimes   bool   `json:"shareTimes"`
	ShareTraces  bool   `json:"shareTraces"`
	ShareReports bool   `json:"shareReports"`
	UserID       string `json:"userId,omitempty"`
	Token        string `json:"token,omitempty"`
	Shared       int    `json:"shared"`
	LastErr      string `json:"lastErr,omitempty"`
}

var (
	commMu   sync.Mutex
	commCfg  commConfig
	commHTTP = &http.Client{Timeout: 25 * time.Second}
	commBest = map[string]float64{} // carId:trackId → best shared this run
)

func commPath() string { return filepath.Join(activeDir(), "community.json") }

func loadCommunity() {
	c := commConfig{}
	if b, err := readSecret(commPath()); err == nil {
		json.Unmarshal(b, &c)
	}
	commMu.Lock()
	commCfg = c
	commMu.Unlock()
}

func saveCommLocked() {
	b, _ := json.Marshal(commCfg)
	writeSecret(commPath(), b)
}

func commBase() string {
	commMu.Lock()
	defer commMu.Unlock()
	u := commCfg.URL
	if u == "" {
		u = communityURL
	}
	return strings.TrimRight(u, "/")
}

func commCall(method, path string, body any, auth bool) ([]byte, error) {
	base := commBase()
	if base == "" {
		return nil, errors.New("the community server is not set up yet")
	}
	var rd io.Reader
	if body != nil {
		b, _ := json.Marshal(body)
		rd = bytes.NewReader(b)
	}
	req, _ := http.NewRequest(method, base+"/community"+path, rd)
	req.Header.Set("Content-Type", "application/json")
	if auth {
		commMu.Lock()
		tok := commCfg.Token
		commMu.Unlock()
		if tok == "" {
			return nil, errors.New("not registered")
		}
		req.Header.Set("Authorization", "Bearer "+tok)
	}
	resp, err := commHTTP.Do(req)
	if err != nil {
		return nil, fmt.Errorf("could not reach the community: %w", err)
	}
	defer resp.Body.Close()
	b, _ := io.ReadAll(io.LimitReader(resp.Body, 8<<20))
	if resp.StatusCode >= 300 {
		var e struct{ Error string }
		json.Unmarshal(b, &e)
		if e.Error == "" {
			e.Error = fmt.Sprintf("community answered HTTP %d", resp.StatusCode)
		}
		return nil, errors.New(e.Error)
	}
	return b, nil
}

// ensureRegistered gets a device token the first time something is shared.
func ensureRegistered() error {
	commMu.Lock()
	has, alias := commCfg.Token != "", commCfg.Alias
	commMu.Unlock()
	if has {
		return nil
	}
	b, err := commCall("POST", "/register", map[string]string{"alias": alias}, false)
	if err != nil {
		return err
	}
	var r struct{ ID, Token string }
	json.Unmarshal(b, &r)
	if r.Token == "" {
		return errors.New("registration failed")
	}
	commMu.Lock()
	commCfg.UserID, commCfg.Token = r.ID, r.Token
	saveCommLocked()
	commMu.Unlock()
	return nil
}

func commNote(err error) {
	commMu.Lock()
	if err != nil {
		commCfg.LastErr = err.Error()
	} else {
		commCfg.LastErr = ""
		commCfg.Shared++
	}
	saveCommLocked()
	commMu.Unlock()
}

// shareLap: called for every valid lap; sends it only when it beats what you shared for that car and track.
func shareLap(l cloudLap) {
	commMu.Lock()
	on, traces := commCfg.ShareTimes, commCfg.ShareTraces
	commMu.Unlock()
	if !on || !l.Valid {
		return
	}
	c := currentCarTrack(sessionYAML())
	if c.CarID == 0 || c.TrackID == 0 {
		return
	}
	key := fmt.Sprintf("%d:%d", c.CarID, c.TrackID)
	commMu.Lock()
	if b, ok := commBest[key]; ok && b <= l.Time {
		commMu.Unlock()
		return
	}
	commBest[key] = l.Time
	commMu.Unlock()
	go func() {
		if err := ensureRegistered(); err != nil {
			commNote(err)
			return
		}
		body := map[string]any{"carId": c.CarID, "car": c.Car, "trackId": c.TrackID, "track": c.Track, "time": l.Time, "sectors": l.Sectors}
		if traces && l.Trace != nil {
			body["trace"] = l.Trace
		}
		_, err := commCall("POST", "/laps", body, true)
		commNote(err)
	}()
}

// shareReport sends a race analysis without the other drivers' names.
func shareReport(r *raceReport) {
	commMu.Lock()
	on := commCfg.ShareReports
	commMu.Unlock()
	if !on {
		return
	}
	cp := *r
	cp.Results = nil
	for _, x := range r.Results {
		if !x.Me {
			x.Name = "P" + strconv.Itoa(x.Pos)
		}
		cp.Results = append(cp.Results, x)
	}
	cp.Brakes = nil
	for _, b := range r.Brakes {
		if !b.Me {
			b.Name = "P" + strconv.Itoa(b.Pos)
		}
		cp.Brakes = append(cp.Brakes, b)
	}
	cp.Posted = false
	go func() {
		if err := ensureRegistered(); err != nil {
			commNote(err)
			return
		}
		_, err := commCall("POST", "/reports", map[string]any{"report": cp}, true)
		commNote(err)
	}()
}

func registerCommunityRoutes(mux *http.ServeMux) {
	mux.HandleFunc("/api/community", func(w http.ResponseWriter, r *http.Request) {
		fail := func(err error) {
			w.WriteHeader(400)
			writeJSON(w, map[string]string{"error": err.Error()})
		}
		if r.Method == http.MethodPost {
			var in struct {
				Action, Alias, URL                    string
				ShareTimes, ShareTraces, ShareReports bool
			}
			json.NewDecoder(io.LimitReader(r.Body, 4096)).Decode(&in)
			switch in.Action {
			case "save":
				in.URL = strings.TrimSpace(in.URL)
				if in.URL != "" {
					if u, err := url.Parse(in.URL); err != nil || u.Scheme != "https" && !strings.HasPrefix(u.Host, "localhost") {
						fail(errors.New("the community server must be an https:// address"))
						return
					}
				}
				commMu.Lock()
				oldAlias := commCfg.Alias
				commCfg.Alias, commCfg.URL = cleanText(in.Alias, 32), in.URL
				commCfg.ShareTimes, commCfg.ShareTraces, commCfg.ShareReports = in.ShareTimes, in.ShareTraces && in.ShareTimes, in.ShareReports
				saveCommLocked()
				reg := commCfg.Token != "" && oldAlias != commCfg.Alias
				alias := commCfg.Alias
				commMu.Unlock()
				if reg {
					commCall("POST", "/me", map[string]string{"alias": alias}, true)
				}
			case "deleteAll":
				if _, err := commCall("DELETE", "/me", nil, true); err != nil && err.Error() != "not registered" {
					fail(err)
					return
				}
				commMu.Lock()
				commCfg.Token, commCfg.UserID, commCfg.Shared = "", "", 0
				commCfg.ShareTimes, commCfg.ShareTraces, commCfg.ShareReports = false, false, false
				commBest = map[string]float64{}
				saveCommLocked()
				commMu.Unlock()
			}
		}
		commMu.Lock()
		c := commCfg
		commMu.Unlock()
		writeJSON(w, map[string]any{"alias": c.Alias, "url": c.URL, "defaultUrl": communityURL, "ready": commBase() != "", "shareTimes": c.ShareTimes, "shareTraces": c.ShareTraces,
			"shareReports": c.ShareReports, "registered": c.Token != "", "shared": c.Shared, "error": c.LastErr})
	})
	// read-only proxies to the community server
	proxy := func(path string) http.HandlerFunc {
		return func(w http.ResponseWriter, r *http.Request) {
			p := path
			if id := r.URL.Query().Get("id"); id != "" {
				if strings.ContainsAny(id, "/?#.") || len(id) > 64 {
					http.Error(w, "bad id", 400)
					return
				}
				p += "/" + id
			} else if q := r.URL.Query(); q.Get("trackId") != "" || q.Get("carId") != "" {
				p += "?trackId=" + url.QueryEscape(q.Get("trackId")) + "&carId=" + url.QueryEscape(q.Get("carId"))
			}
			b, err := commCall("GET", p, nil, false)
			if err != nil {
				w.WriteHeader(502)
				writeJSON(w, map[string]string{"error": err.Error()})
				return
			}
			w.Header().Set("Content-Type", "application/json")
			w.Write(b)
		}
	}
	mux.HandleFunc("/api/community/combos", proxy("/combos"))
	mux.HandleFunc("/api/community/laps", proxy("/laps"))
	mux.HandleFunc("/api/community/reports", proxy("/reports"))
}
