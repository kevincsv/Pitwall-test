package main

import (
	"regexp"
	"sort"
	"strings"
)

// sessionPlace: where the driver finished (or stands) in a session and how many cars it had, for every session but a
// test drive: practice, qualifying and warmup by the best lap, a race by its order. In a multiclass session the place
// is in the driver's class among the cars of that class (cls). The game's results for the session (ResultsPositions)
// first; without them (Le Mans Ultimate, or before the first lap is timed) the game's live place of the player
// (PlayerCarPosition, PlayerCarClassPosition). A session alone (no other car) or a test drive has none.
type sessPlace struct {
	pos, field int
	cls        bool
}

var (
	carIdxSplit = regexp.MustCompile(`(?m)^\s*- CarIdx: `)
	topLevelKey = regexp.MustCompile(`(?m)^[^\s-]`)
)

type placeCar struct {
	idx, class string
}

// placeCars: the cars of the session's DriverInfo, the pace car and spectators aside
func placeCars(y string) []placeCar {
	i := strings.Index(y, "\nDriverInfo:")
	if i < 0 {
		return nil
	}
	block := y[i+1:]
	if nl := strings.Index(block, "\n"); nl >= 0 {
		if j := topLevelKey.FindStringIndex(block[nl+1:]); j != nil { // the next section (SplitTimeInfo, CarSetup…)
			block = block[:nl+1+j[0]]
		}
	}
	pace := yamlField(block, "PaceCarIdx")
	var out []placeCar
	seen := map[string]bool{}
	for _, part := range carIdxSplit.Split(block, -1)[1:] {
		idx := strings.TrimSpace(strings.SplitN(part, "\n", 2)[0])
		if idx == "" || seen[idx] || idx == pace || yamlField(part, "CarIsPaceCar") == "1" || yamlField(part, "IsSpectator") == "1" {
			continue
		}
		seen[idx] = true
		out = append(out, placeCar{idx: idx, class: yamlField(part, "CarClassID")})
	}
	return out
}

func sessionPlaceOf(y string, sn int, kind string, livePos, liveCls int) sessPlace {
	if kind == "" || isTestDrive(kind) {
		return sessPlace{}
	}
	cars := placeCars(y)
	me := yamlField(y, "DriverCarIdx")
	myClass, inField := "", false
	classes := map[string]bool{}
	for _, c := range cars {
		classes[c.class] = true
		if c.idx == me {
			myClass, inField = c.class, true
		}
	}
	if !inField {
		return sessPlace{}
	}
	cls := len(classes) > 1
	field := 0
	in := map[string]bool{}
	for _, c := range cars {
		if !cls || c.class == myClass {
			field++
			in[c.idx] = true
		}
	}
	if field < 2 { // alone on the track: no place
		return sessPlace{}
	}
	pos := 0
	race := strings.Contains(strings.ToLower(kind), "race")
	var rs []raceResult
	for _, r := range sessionResults(y, sn) {
		if in[itoa(r.carIdx)] {
			rs = append(rs, r)
		}
	}
	if race {
		rs = filterResults(rs, func(r raceResult) bool { return r.Pos > 0 })
		sort.SliceStable(rs, func(a, b int) bool { return rs[a].Pos < rs[b].Pos })
	} else { // practice, qualifying, warmup: by the best lap, the cars without a time aside
		rs = filterResults(rs, func(r raceResult) bool { return r.Best > 0 })
		sort.SliceStable(rs, func(a, b int) bool {
			if rs[a].Best != rs[b].Best {
				return rs[a].Best < rs[b].Best
			}
			return rs[a].Pos < rs[b].Pos
		})
	}
	for k, r := range rs {
		if itoa(r.carIdx) == me {
			pos = k + 1
			break
		}
	}
	if pos == 0 { // not in the results yet: the game's live place
		if cls {
			pos = liveCls
		} else {
			pos = livePos
		}
	}
	if pos <= 0 {
		return sessPlace{}
	}
	if pos > field { // a car that left is still a car that was there
		field = pos
	}
	return sessPlace{pos: pos, field: field, cls: cls}
}

func filterResults(rs []raceResult, keep func(raceResult) bool) []raceResult {
	out := rs[:0]
	for _, r := range rs {
		if keep(r) {
			out = append(out, r)
		}
	}
	return out
}

// setPlace puts the place on the session
func (s *cloudSession) setPlace(p sessPlace) {
	s.Pos, s.Field, s.Cls = p.pos, p.field, p.cls
}

func (s cloudSession) place() sessPlace { return sessPlace{pos: s.Pos, field: s.Field, cls: s.Cls} }
