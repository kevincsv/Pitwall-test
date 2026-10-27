package main

// Le Mans Ultimate's own ratings, the Safety Rating (SR) and the Driver Rating / Rank (DR). The shared memory
// (lmu.go) does not carry them; the game's own UI is a web page served by the game on 127.0.0.1:6397 (an
// unofficial REST API that community tools read: TinyPedal, irdashies, lmu-pitwall, go-lmu-api). No community tool
// documents an endpoint with SR or DR yet (the known profile ones, /rest/profile/ and
// /rest/profile/profileInfo/getProfileInfo, carry name, nick, nationality and language), so the agent discovers it:
// once per run of the game it reads the game's own API list (/swagger-schema.json), tries the read-only GET paths
// whose names speak of the profile or a rating, logs once which answered and their top-level keys, and keeps SR and
// DR from any field named like them, as the game writes them ("Silver 2.45", or whatever the game says). The paths
// that gave them are read again at most once a minute. Never while the player is on track (in the game's realtime:
// community tools report freezes when the API is polled while driving), never a POST or PUT, never a value made up.
// What it finds goes to ratings.json as "lmu" {sr, dr, at}, next to iRacing's disciplines.

import (
	"context"
	"encoding/json"
	"fmt"
	"io"
	"log"
	"math"
	"net"
	"net/http"
	"regexp"
	"sort"
	"strconv"
	"strings"
	"sync"
	"time"
)

// the game's own address: IPv4 first, IPv6 for the builds that refuse it (race-engineer's notes saw both)
var lmuRestBases = []string{"http://127.0.0.1:6397", "http://[::1]:6397"}

// the profile paths the community found (go-lmu-api, generated from the game's swagger), always tried
var lmuRestKnown = []string{"/rest/profile/", "/rest/profile/profileInfo/getProfileInfo"}

const (
	lmuRestEvery     = time.Minute // at most one round of reads a minute
	lmuRestMaxProbes = 10          // at most this many paths tried in one discovery
	lmuRestMaxBody   = 4 << 20
)

// paths from the game's API list worth a try (their name speaks of the profile or a rating) …
var lmuRestWanted = regexp.MustCompile(`(?i)profile|rating|rank|safety|licen[cs]e|competit|career|stat(s|istic)|elo|skill`)

// … and never those that do something or hand out a secret, even as a GET (/rest/multiplayer/join is a GET)
var lmuRestAvoid = regexp.MustCompile(`(?i)auth|ticket|token|password|join|set|start|exit|delete|remove|reset|command|play|load|save|cancel|take|focus|restart|kick|ban|chat|dlc|steam|eac|devmode|firstrun|vehicle|/cars?\b|track|session|garage|setup|watch|replay|weather|strategy|standings`)

// lmuRestGate: when a round of reads may run (the game in its menus, a minute since the last round)
type lmuRestGate struct {
	last time.Time
}

func (g *lmuRestGate) due(now time.Time, onTrack bool) bool {
	if onTrack || (!g.last.IsZero() && now.Sub(g.last) < lmuRestEvery) {
		return false
	}
	g.last = now
	return true
}

// lmuRest: what one run of the game taught (lmuSource keeps one; reset when the game closes)
type lmuRest struct {
	mu         sync.Mutex
	gate       lmuRestGate
	base       string   // the address that answered
	discovered bool     // the discovery ran and was logged
	paths      []string // the paths that gave SR or DR
	get        func(ctx context.Context, url string) (int, []byte, error)
}

var lmuRestHTTP = &http.Client{
	Timeout: 3 * time.Second,
	Transport: &http.Transport{
		Proxy:             nil, // the game is on this PC: never through a proxy
		DialContext:       localDialContext((&net.Dialer{Timeout: 2 * time.Second}).DialContext),
		DisableKeepAlives: true,
	},
}

func lmuRestGet(ctx context.Context, url string) (int, []byte, error) {
	req, err := http.NewRequestWithContext(ctx, http.MethodGet, url, nil)
	if err != nil {
		return 0, nil, err
	}
	req.Header.Set("Accept", "application/json")
	resp, err := lmuRestHTTP.Do(req)
	if err != nil {
		return 0, nil, err
	}
	defer resp.Body.Close()
	b, err := io.ReadAll(io.LimitReader(resp.Body, lmuRestMaxBody))
	return resp.StatusCode, b, err
}

// tick: called every few seconds while the game is open; onTrack is the game's realtime (lmuSource.onTrack)
func (r *lmuRest) tick(onTrack bool) {
	r.mu.Lock()
	defer r.mu.Unlock()
	if !r.gate.due(time.Now(), onTrack) {
		return
	}
	if r.get == nil {
		r.get = lmuRestGet
	}
	if r.base == "" && !r.findBase() {
		return // the game's API is not up yet (loading): next minute
	}
	var sr, dr string
	if !r.discovered {
		sr, dr = r.discover()
	} else {
		for _, p := range r.paths {
			code, b, err := r.get(context.Background(), r.base+p)
			if err != nil || code != 200 {
				continue
			}
			s, d := lmuRatingsFromJSON(b)
			if sr == "" {
				sr = s
			}
			if dr == "" {
				dr = d
			}
		}
	}
	if sr != "" || dr != "" {
		noteLMURating(sr, dr, time.Now().UnixMilli())
	}
}

// findBase: the first address of the game that answers anything over HTTP
func (r *lmuRest) findBase() bool {
	for _, b := range lmuRestBases {
		if _, _, err := r.get(context.Background(), b+lmuRestKnown[0]); err == nil {
			r.base = b
			return true
		}
	}
	return false
}

// discover: the game's API list, then every candidate path once; logs what answered (keys only, never values but
// SR and DR) and keeps the paths that gave a rating
func (r *lmuRest) discover() (sr, dr string) {
	r.discovered = true
	cands := append([]string(nil), lmuRestKnown...)
	code, b, err := r.get(context.Background(), r.base+"/swagger-schema.json")
	if err == nil && code == 200 {
		ps := lmuSwaggerCandidates(b)
		log.Printf("lmu rest: the game's API lists %d paths worth a try: %s", len(ps), strings.Join(ps, " "))
		cands = append(cands, ps...)
	} else {
		log.Printf("lmu rest: no API list at /swagger-schema.json (%d %v)", code, err)
	}
	seen := map[string]bool{}
	n := 0
	for _, p := range cands {
		if seen[p] || n >= lmuRestMaxProbes {
			continue
		}
		seen[p] = true
		n++
		code, b, err := r.get(context.Background(), r.base+p)
		if err != nil {
			log.Printf("lmu rest: %s: %v", p, err)
			continue
		}
		s, d := "", ""
		if code == 200 {
			s, d = lmuRatingsFromJSON(b)
		}
		log.Printf("lmu rest: %s → %d, %s%s", p, code, lmuJSONKeys(b), lmuFoundTxt(s, d))
		if s != "" || d != "" {
			r.paths = append(r.paths, p)
			if sr == "" {
				sr = s
			}
			if dr == "" {
				dr = d
			}
		}
	}
	if len(r.paths) == 0 {
		log.Printf("lmu rest: no Safety Rating or Driver Rating found in %d paths", n)
	}
	return sr, dr
}

func lmuFoundTxt(sr, dr string) string {
	if sr == "" && dr == "" {
		return ""
	}
	return fmt.Sprintf("; SR %q DR %q", sr, dr)
}

// lmuSwaggerCandidates: the GET paths of the game's API list (OpenAPI 2.0 "paths") without parameters, whose names
// speak of the profile or a rating, and none that does something
func lmuSwaggerCandidates(b []byte) []string {
	var sw struct {
		Paths map[string]map[string]struct {
			Parameters []struct {
				In       string `json:"in"`
				Required bool   `json:"required"`
			} `json:"parameters"`
		} `json:"paths"`
	}
	if json.Unmarshal(b, &sw) != nil {
		return nil
	}
	var out []string
	for p, ops := range sw.Paths {
		op, ok := ops["get"]
		if !ok || strings.ContainsAny(p, "{}*?") || !lmuRestWanted.MatchString(p) || lmuRestAvoid.MatchString(p) {
			continue
		}
		need := false
		for _, prm := range op.Parameters {
			if prm.Required || prm.In == "path" {
				need = true
			}
		}
		if !need {
			out = append(out, p)
		}
	}
	sort.Strings(out)
	return out
}

// lmuJSONKeys: the top-level shape of an answer, for the log ("{a, b, c}", "[3]{a, b}", "text 12 bytes")
func lmuJSONKeys(b []byte) string {
	var v any
	if json.Unmarshal(b, &v) != nil {
		return fmt.Sprintf("not JSON, %d bytes", len(b))
	}
	keys := func(m map[string]any) string {
		ks := make([]string, 0, len(m))
		for k := range m {
			ks = append(ks, k)
		}
		sort.Strings(ks)
		if len(ks) > 40 {
			ks = append(ks[:40], "…")
		}
		return "{" + strings.Join(ks, ", ") + "}"
	}
	switch x := v.(type) {
	case map[string]any:
		return keys(x)
	case []any:
		if len(x) > 0 {
			if m, ok := x[0].(map[string]any); ok {
				return fmt.Sprintf("[%d]%s", len(x), keys(m))
			}
		}
		return fmt.Sprintf("[%d]", len(x))
	default:
		return fmt.Sprintf("%T", v)
	}
}

// lmuRatingsFromJSON: SR and DR from any field named like them, as the game writes them
func lmuRatingsFromJSON(b []byte) (sr, dr string) {
	var v any
	if json.Unmarshal(b, &v) != nil {
		return "", ""
	}
	lmuScanRatings(v, "", 0, &sr, &dr)
	return sr, dr
}

var lmuKeyNorm = regexp.MustCompile(`[^a-z0-9]`)

// lmuRatingKind: "sr", "dr" or "" for a field's name (and its parent's: {"rating": {"safety": …, "driver": …}})
func lmuRatingKind(key, parent string) string {
	k := lmuKeyNorm.ReplaceAllString(strings.ToLower(key), "")
	p := lmuKeyNorm.ReplaceAllString(strings.ToLower(parent), "")
	switch {
	case k == "sr" || strings.Contains(k, "safetyrating") || strings.Contains(k, "safetyrank") || strings.Contains(k, "safetyscore"):
		return "sr"
	case k == "dr" || strings.Contains(k, "driverrating") || strings.Contains(k, "driverrank") || strings.Contains(k, "driverscore"):
		return "dr"
	}
	if strings.Contains(p, "rating") || strings.Contains(p, "rank") {
		switch k {
		case "safety":
			return "sr"
		case "driver", "pace", "skill":
			return "dr"
		}
	}
	return ""
}

func lmuScanRatings(v any, parent string, depth int, sr, dr *string) {
	if depth > 6 {
		return
	}
	switch x := v.(type) {
	case map[string]any:
		ks := make([]string, 0, len(x))
		for k := range x {
			ks = append(ks, k)
		}
		sort.Strings(ks)
		for _, k := range ks {
			switch lmuRatingKind(k, parent) {
			case "sr":
				if *sr == "" {
					*sr = lmuRatingText(x[k])
				}
				continue
			case "dr":
				if *dr == "" {
					*dr = lmuRatingText(x[k])
				}
				continue
			}
			lmuScanRatings(x[k], k, depth+1, sr, dr)
		}
	case []any:
		if len(x) == 1 { // a list of many is other drivers' (standings): never yours
			lmuScanRatings(x[0], parent, depth+1, sr, dr)
		}
	}
}

var (
	lmuGradeKeys = regexp.MustCompile(`(?i)^(name|tier|grade|rank|label|text|class|level|display|displayname|title|license|licence)$`)
	lmuValueKeys = regexp.MustCompile(`(?i)^(value|rating|score|points|level|rank|number|current)$`)
)

// lmuRatingText: a rating as the game shows it: its text, its number, or an object's grade and number together
// ("Silver" + 2.45 → "Silver 2.45"); "" for anything else
func lmuRatingText(v any) string {
	switch x := v.(type) {
	case string:
		s := strings.TrimSpace(x)
		if len([]rune(s)) > 24 {
			return ""
		}
		return s
	case float64:
		return lmuNum(x)
	case map[string]any:
		ks := make([]string, 0, len(x))
		for k := range x {
			ks = append(ks, k)
		}
		sort.Strings(ks)
		grade, num := "", ""
		for _, k := range ks {
			switch y := x[k].(type) {
			case string:
				if grade == "" && lmuGradeKeys.MatchString(k) {
					grade = lmuRatingText(y)
				}
			case float64:
				if num == "" && lmuValueKeys.MatchString(k) {
					num = lmuNum(y)
				}
			}
		}
		return strings.TrimSpace(grade + " " + num)
	}
	return ""
}

func lmuNum(f float64) string {
	if math.IsNaN(f) || math.IsInf(f, 0) {
		return ""
	}
	if f == math.Trunc(f) {
		return strconv.FormatFloat(f, 'f', 0, 64)
	}
	s := strconv.FormatFloat(f, 'f', -1, 64)
	if i := strings.IndexByte(s, '.'); i >= 0 && len(s)-i-1 > 2 {
		s = strconv.FormatFloat(f, 'f', 2, 64)
	}
	return s
}

// noteLMURating keeps LMU's ratings in ratings.json ("lmu": {sr, dr, at}); a value the game did not give this time
// stays as it was, and the file changes only when a rating does (so the account is not uploaded every minute)
func noteLMURating(sr, dr string, at int64) bool {
	ratingsMu.Lock()
	defer ratingsMu.Unlock()
	if !lmuSetRating(sr, dr, at) {
		return false
	}
	writeJSONFile(journalFile("ratings.json"), ratings)
	return true
}

// lmuSetRating: the in-memory part of noteLMURating (ratingsMu held)
func lmuSetRating(sr, dr string, at int64) bool {
	if sr == "" && dr == "" {
		return false
	}
	old := ratings["lmu"]
	n := &discRating{SR: sr, DR: dr, At: at, Src: "lmu"}
	if old != nil {
		if n.SR == "" {
			n.SR = old.SR
		}
		if n.DR == "" {
			n.DR = old.DR
		}
		if n.SR == old.SR && n.DR == old.DR {
			return false
		}
	}
	ratings["lmu"] = n
	return true
}

// lmuRestLoop: the game's API while the game is open (stops with the source)
func (s *lmuSource) lmuRestLoop(stop chan struct{}) {
	r := &lmuRest{}
	t := time.NewTicker(5 * time.Second)
	defer t.Stop()
	for {
		select {
		case <-stop:
			return
		case <-t.C:
			s.mu.Lock()
			on := s.onTrack
			s.mu.Unlock()
			r.tick(on)
		}
	}
}
