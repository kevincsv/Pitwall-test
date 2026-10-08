package main

// Your iRating and licence in every discipline (Oval, Sports Car, Formula Car, Dirt Oval, Dirt Road). iRacing's
// telemetry only says the iRating of the discipline of the session you are in, so the PC keeps the last one it saw
// of each: every time you join a session with Pitlane HQ open, and from your recorded races (what each one left you)
// for the disciplines you have not driven since. ratings.json, synced with the account like the rest.

import (
	"net/http"
	"sort"
	"sync"
	"time"
)

type discRating struct {
	IR  int    `json:"ir"`
	Lic string `json:"lic,omitempty"` // "B 3.21", or the class letter alone from a race
	At  int64  `json:"at"`            // when it was seen (ms)
	Src string `json:"src,omitempty"` // "session" (seen in the game) or "race" (from a recorded race)
}

var (
	ratingsMu sync.Mutex
	ratings   = map[string]*discRating{}
)

var ratingDiscs = map[string]bool{"oval": true, "sports_car": true, "formula_car": true, "dirt_oval": true, "dirt_road": true}

func loadRatings() {
	m := map[string]*discRating{}
	readJSON(journalFile("ratings.json"), &m)
	ratingsMu.Lock()
	ratings = m
	ratingsMu.Unlock()
	ratingsFromRaces()
}

// noteRating keeps the newest iRating seen of a discipline; true when it changed something (ratingsMu held)
func noteRating(disc string, ir int, lic, src string, at int64) bool {
	if !ratingDiscs[disc] || ir <= 0 {
		return false
	}
	if r := ratings[disc]; r != nil && (r.At > at || (r.At == at && r.IR == ir)) {
		return false
	}
	if r := ratings[disc]; r != nil && r.Lic != "" && len(lic) < len(r.Lic) && r.IR == ir {
		lic = r.Lic // a race only knows the class letter: the full licence seen before stays
	}
	ratings[disc] = &discRating{IR: ir, Lic: lic, At: at, Src: src}
	return true
}

// ratingsFromRaces: what each recorded race left you, for the disciplines nothing newer says
func ratingsFromRaces() {
	journalMu.Lock()
	rs := append([]*raceReport(nil), races...)
	journalMu.Unlock()
	sort.SliceStable(rs, func(i, j int) bool { return rs[i].When < rs[j].When })
	ratingsMu.Lock()
	defer ratingsMu.Unlock()
	changed := false
	defer func() {
		if changed {
			writeJSONFile(journalFile("ratings.json"), ratings)
		}
	}()
	for _, r := range rs {
		if r == nil || (r.Game != "" && r.Game != "iracing") || r.IR <= 0 {
			continue
		}
		ir := r.IR + r.IRChange // the estimate until the real change comes: closer than the iRating before the race
		lic := ""
		for _, x := range r.Results {
			if x.Me {
				lic = x.Lic
			}
		}
		if noteRating(discipline(r.Cat, r.Car), ir, lic, "race", r.When) {
			changed = true
		}
	}
}

// sessionRating: the iRating and licence the game shows for you in this session
func sessionRating(y string) {
	meta := currentCarTrack(y)
	d := driverBlock(y, yamlField(y, "DriverCarIdx"))
	if d == "" {
		return
	}
	ratingsMu.Lock()
	defer ratingsMu.Unlock()
	if noteRating(discipline(meta.Cat, meta.Car), atoi(yamlField(d, "IRating")), yamlField(d, "LicString"), "session", time.Now().UnixMilli()) {
		writeJSONFile(journalFile("ratings.json"), ratings)
	}
}

func ratingsCopy() map[string]*discRating {
	ratingsMu.Lock()
	defer ratingsMu.Unlock()
	out := make(map[string]*discRating, len(ratings))
	for k, v := range ratings {
		out[k] = v
	}
	return out
}

func registerRatingRoutes(mux *http.ServeMux) {
	mux.HandleFunc("/api/ratings", func(w http.ResponseWriter, r *http.Request) {
		writeJSON(w, map[string]any{"ratings": ratingsCopy()})
	})
}
