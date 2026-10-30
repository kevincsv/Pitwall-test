package main

// seasonseen: when an official iRacing race you are in really started, sent once per race to the Pitlane HQ server
// (/community/season/seen) so the planner can check and correct the season's race times without iRacing's data
// API. Only the subsession, season, series, track, car and the minute it started: nothing about you.

import (
	"sync"
	"time"
)

var (
	seenMu   sync.Mutex
	seenSent = map[int]bool{} // subsessions already reported (or being reported) by this PC
)

// raceStart: the race's subsession started sessionTime seconds ago. Only believed in its first session (the
// practice before the race), where the session clock counts from the launch whatever iRacing does later.
func raceStart(now time.Time, sessionTime float64) (time.Time, bool) {
	if sessionTime <= 0 || sessionTime > 3*3600 {
		return time.Time{}, false
	}
	return now.Add(-time.Duration(sessionTime * float64(time.Second))).Round(time.Minute), true
}

func noteRaceStart(meta carTrack, y string, sn int, sessionTime float64) {
	if !meta.Official || meta.Subsession <= 0 || meta.SeasonID <= 0 || meta.SeriesID <= 0 || meta.TrackID <= 0 || sn != 0 || currentGame() != "iracing" || tel.isDemo() {
		return
	}
	start, ok := raceStart(time.Now(), sessionTime)
	if !ok {
		return
	}
	seenMu.Lock()
	if seenSent[meta.Subsession] {
		seenMu.Unlock()
		return
	}
	seenSent[meta.Subsession] = true
	seenMu.Unlock()
	// the names as the sim shows them: a season imported from iRacing's schedule PDF has no ids to match
	trackName, trackConfig := yamlField(y, "TrackDisplayName"), yamlField(y, "TrackConfigName")
	go func() {
		body := map[string]any{"sub": meta.Subsession, "season": meta.SeasonID, "series": meta.SeriesID, "track": meta.TrackID, "start": start.UnixMilli(),
			"trackName": trackName, "trackConfig": trackConfig, "car": meta.Car}
		// every PC that races reports, whatever its sharing settings or access to the planner: a PC that never
		// shared anything gets its community token first (nothing about the driver goes with it)
		if ensureRegistered() != nil {
			return
		}
		commCall("POST", "/season/seen", body, true) // best effort: a race not reported is one time fewer to check
	}()
}
