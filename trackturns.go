package main

import (
	"encoding/json"
	"errors"
	"log"
	"net/url"
	"sort"
	"strconv"
	"strings"
	"sync"
	"time"
)

// ---------- what the game says of a track ----------
//
// iRacing's session text says how many turns a track officially has (WeekendInfo.TrackNumTurns). The server fits the
// automatic turns of the track's layout to it (trackgeo.js, /community/turns), so the PC tells it once per track while
// it runs: for the session being driven and for every track of the .ibt files on this PC (their header only). Signed
// in only, iRacing only (Le Mans Ultimate says no such number).

var (
	turnsMu   sync.Mutex
	turnsSent = map[string]int{} // game:track → the count the server was told in this run
)

// trackNumTurns: the official number of turns of the session text's track (0 when it does not say)
func trackNumTurns(y string) int {
	n := atoi(strings.TrimSpace(yamlField(y, "TrackNumTurns")))
	if n < 1 || n > 60 {
		return 0
	}
	return n
}

// noteTrackTurns: the session being driven (the race watcher, every few seconds; once per track it is sent)
func noteTrackTurns(game, y string) {
	if game != "iracing" || tel.isDemo() {
		return
	}
	c := currentCarTrack(y)
	if n := trackNumTurns(y); n > 0 && c.TrackID > 0 && turnsToSend(game, c.TrackID, n) {
		go sendTrackTurns(game, c.TrackID, c.Track, n)
	}
}

// turnsToSend: whether the server still has to hear this count in this run (marked as sent: a failure unmarks it)
func turnsToSend(game string, id, n int) bool {
	key := game + ":" + strconv.Itoa(id)
	turnsMu.Lock()
	defer turnsMu.Unlock()
	if turnsSent[key] == n {
		return false
	}
	turnsSent[key] = n
	return true
}

func sendTrackTurns(game string, id int, track string, n int) bool {
	ok := accountSignedIn()
	if ok {
		_, err := commCall("POST", "/trackinfo", map[string]any{"game": game, "trackId": id, "track": track, "nturns": n}, true)
		ok = err == nil
	}
	if !ok {
		turnsMu.Lock()
		delete(turnsSent, game+":"+strconv.Itoa(id))
		turnsMu.Unlock()
	}
	return ok
}

// ---------- the .ibt files: every track's count, and its map again from the game's position ----------

// ibtTrack: what the headers of the .ibt files say of one track
type ibtTrack struct {
	id, turns int
	name      string
	geo       []ibtCand // the files of it with the game's position (Lat/Lon), the newest first
}

// the tracks whose map this run already tried to draw again from a file (one try each while Pitlane HQ runs)
var ibtGeoTried = map[int]bool{}

// ibtTrackScan reads the header of every .ibt on this PC once per account (later only the newer files): each track's
// official number of turns goes to the server, and a track whose community map was drawn by dead reckoning (no `g`)
// gets it drawn again from the fastest valid lap of one of its files with the game's position (shareLayoutFor, the rule
// of every layout: the game's position replaces dead reckoning). True when it went through every file; false when the
// sim or the driver came back (the next round goes on).
func ibtTrackScan(files []ibtCand, acct string, mem *ibtMemory, stop func() bool) bool {
	if mem.Tracks == nil {
		mem.Tracks = map[string]int64{}
	}
	since := mem.Tracks[acct]
	tracks := map[int]*ibtTrack{}
	for _, f := range files {
		if f.mtime.UnixMilli() <= since || cloudOnly(f.path) || time.Since(f.mtime) < 2*time.Minute {
			continue
		}
		if simBusy() || (stop != nil && stop()) {
			return false
		}
		x, err := openIBT(f.path)
		if err != nil {
			continue
		}
		c := currentCarTrack(x.yaml)
		_, lat := x.index["Lat"]
		_, lon := x.index["Lon"]
		n := trackNumTurns(x.yaml)
		test := isTestDrive(yamlField(x.yaml, "SessionType"))
		x.Close()
		if c.TrackID <= 0 {
			continue
		}
		t := tracks[c.TrackID]
		if t == nil {
			t = &ibtTrack{id: c.TrackID, name: c.Track}
			tracks[c.TrackID] = t
		}
		if n > 0 {
			t.turns = n
		}
		if lat && lon && !test {
			t.geo = append(t.geo, f)
		}
	}
	ids := make([]int, 0, len(tracks))
	for id := range tracks {
		ids = append(ids, id)
	}
	sort.Ints(ids)
	for _, id := range ids {
		t := tracks[id]
		if t.turns > 0 && turnsToSend("iracing", id, t.turns) && !sendTrackTurns("iracing", id, t.name, t.turns) {
			return false // the server cannot be reached: the next round
		}
	}
	for _, id := range ids {
		t := tracks[id]
		if len(t.geo) == 0 || ibtGeoTried[id] {
			continue
		}
		if !layoutWantsGeo(id) {
			continue
		}
		ibtGeoTried[id] = true
		for i, f := range t.geo {
			if i >= 3 { // the three newest files of the track at most
				break
			}
			if simBusy() || (stop != nil && stop()) {
				delete(ibtGeoTried, id)
				return false
			}
			if ibtGeoLayout(f, stop) {
				log.Printf("ibt import: track %d drawn again from %s", id, f.path)
				break
			}
		}
	}
	mem.Tracks[acct] = time.Now().UnixMilli()
	return true
}

// layoutWantsGeo: the community has no map of the track, or one drawn by dead reckoning
func layoutWantsGeo(id int) bool {
	b, err := commCall("GET", "/trackmaps?trackId="+strconv.Itoa(id)+"&game="+url.QueryEscape("iracing"), nil, false)
	if err != nil {
		var he httpErr
		return errors.As(err, &he) && he.code == 404 // no layout yet: one from a file is welcome
	}
	var m struct {
		G []float64 `json:"g"`
	}
	return json.Unmarshal(b, &m) != nil || len(m.G) != 2
}

// ibtGeoLayout replays one file and shares its fastest valid lap with the game's position as the track's map
func ibtGeoLayout(f ibtCand, stop func() bool) bool {
	hash, err := fileHash(f.path, f.size)
	if err != nil {
		return false
	}
	pause := func() bool { return currentStatus().Connected || (stop != nil && stop()) }
	sessions, err := replayIBT(f.path, hash, f.mtime, pause, !ibtIsFast())
	if err != nil {
		return false
	}
	var best *cloudLap
	var y string
	for _, is := range sessions {
		if isTestDrive(is.sess.Kind) {
			continue
		}
		for i := range is.laps {
			l := &is.laps[i]
			if l.Valid && l.Drv == "" && l.Trace != nil && len(l.Trace.G) == 2 && len(l.Trace.X) >= 100 && (best == nil || l.Time < best.Time) {
				best, y = l, is.yaml
			}
		}
	}
	if best == nil {
		return false
	}
	shareLayoutFor(*best, "iracing", y)
	return true
}
