package main

// Restarts inside one session: iRacing can run a session again without leaving it (an AI race restarted, a
// session reset), with the same session number, track and car, its clock and its laps back at zero. Each run's
// laps are numbered after the previous run's, so a lap never takes another's place: not on the server (a lap is
// known by its session and number), not in the race summary, not in the per-lap verdicts (cuts, incidents, driver).

import (
	"sync"
)

type sessionRun struct {
	key    string  // the session (event, track, car and number) the runs belong to
	st     float64 // the session clock at the last sample on track
	maxLap int     // the highest lap number seen in this run
	base   int     // what this run's lap numbers are counted after
	n      int     // how many times the session started again
}

var (
	runMu  sync.Mutex
	runNow sessionRun
)

// noteRun reads one sample on track (the session's key, its clock SessionTime, the lap being driven) and returns
// the lap offset of the current run and its number. The session clock going back more than 5 s is a new run:
// it never goes back otherwise while you are in the car.
func noteRun(key string, st float64, lap int) (base, run int) {
	runMu.Lock()
	defer runMu.Unlock()
	r := &runNow
	if key != r.key {
		*r = sessionRun{key: key, st: st}
	}
	if r.st > 5 && st >= 0 && st < r.st-5 {
		r.base += r.maxLap
		r.maxLap = 0
		r.n++
	}
	if st >= 0 {
		r.st = st
	}
	if lap > r.maxLap {
		r.maxLap = lap
	}
	return r.base, r.n
}

// runBase: the lap offset and number of the current run of the session with this key (0, 0 for another session)
func runBase(key string) (base, run int) {
	runMu.Lock()
	defer runMu.Unlock()
	if runNow.key != key {
		return 0, 0
	}
	return runNow.base, runNow.n
}

// curRunKey: the session the samples belong to now, for noteRun: what sessionKey says of the session YAML plus the
// session number (sessionKey read again only when the game sends a new YAML)
var (
	rkMu  sync.Mutex
	rkVer = -1
	rkKey string
)

func curRunKey(sn int) string {
	tel.mu.RLock()
	y, ver := tel.session, tel.sessionVer
	tel.mu.RUnlock()
	rkMu.Lock()
	defer rkMu.Unlock()
	if ver != rkVer {
		rkVer, rkKey = ver, sessionKey(y)
	}
	return rkKey + "|" + itoa(sn)
}
