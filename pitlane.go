package main

// The pit lane of a track, like iRacing's maps draw it: where it leaves the track, where it runs beside it and where
// it comes back. Every lap through the pits records which of its 5 m points were on the pit road (OnPitRoad); with a
// clean lap of the same session as the reference, each of those points becomes "so many metres to one side of the
// track at this point of the lap". The drift of dead reckoning is taken from the points just before and after, where
// both laps drive the same track. The PC sends them to the server, which keeps one pit lane per track (/pitlane),
// and every map (the app's, the phones', the map overlay) draws it beside the track.

import (
	"math"
	"strconv"
	"sync"
	"time"
)

var (
	pitMu      sync.Mutex
	pitRef     = map[int][2][]float64{} // the last clean lap's path of each track (this run of the PC)
	pitPending = map[int][]pitLap{}     // laps through the pits waiting for a clean lap of their track
	pitSent    = map[int]time.Time{}
)

type pitLap struct {
	x, y []float64
	pit  []bool
}

// markPit: this point of the lap (and the ones since the last pit-road point, when close) is on the pit road
func (r *lapRec) markPit(d float64) {
	b := int(d / lapBin)
	if b < 0 || b > 4000 {
		return
	}
	for len(r.pitB) <= b {
		r.pitB = append(r.pitB, false)
	}
	if r.lastPitB >= 0 && b > r.lastPitB && b-r.lastPitB < 30 {
		for k := r.lastPitB + 1; k < b; k++ {
			r.pitB[k] = true
		}
	}
	r.pitB[b], r.lastPitB = true, b
}

// pitRuns: the stretches of a lap on the pit road, [first, last] 5 m points, at least 50 m long
func pitRuns(p []bool) [][2]int {
	var out [][2]int
	for i := 0; i < len(p); i++ {
		if !p[i] {
			continue
		}
		j := i
		for j+1 < len(p) && p[j+1] {
			j++
		}
		if j-i >= 10 {
			out = append(out, [2]int{i, j})
		}
		i = j
	}
	return out
}

// pitOffsets: for the pit road points a…b of a lap (px, py), the point of the reference lap beside each one and how far
// to its left (m, negative to the right). nil when the two laps do not line up.
func pitOffsets(px, py, rx, ry []float64, a, b int) [][2]float64 {
	n, m := min(len(rx), len(ry)), min(len(px), len(py))
	if n < 60 || m < 60 || a < 0 || b >= m || b <= a {
		return nil
	}
	at := func(i int) int { return ((i % n) + n) % n }
	// the drift: how far apart the two laps are just before and just after the pit road, where both are on the track
	drift := func(lo, hi int) (float64, float64, bool) {
		sx, sy, c := 0.0, 0.0, 0
		for i := lo; i <= hi; i++ {
			if i < 0 || i >= m {
				continue
			}
			sx += px[i] - rx[at(i)]
			sy += py[i] - ry[at(i)]
			c++
		}
		if c < 4 {
			return 0, 0, false
		}
		return sx / float64(c), sy / float64(c), true
	}
	bx, by, okB := drift(a-30, a-6)
	ax, ay, okA := drift(b+6, b+30)
	if !okB && !okA {
		return nil
	}
	if !okB {
		bx, by = ax, ay
	}
	if !okA {
		ax, ay = bx, by
	}
	if math.Hypot(bx, by) > 40 || math.Hypot(ax, ay) > 40 { // the laps are not in the same place: not comparable
		return nil
	}
	out := make([][2]float64, 0, b-a+1)
	for i := a; i <= b; i++ {
		f := float64(i-a) / float64(max(1, b-a))
		x, y := px[i]-(bx+(ax-bx)*f), py[i]-(by+(ay-by)*f)
		best, bd := -1, math.Inf(1)
		for k := i - 60; k <= i+60; k++ {
			d := math.Hypot(x-rx[at(k)], y-ry[at(k)])
			if d < bd {
				best, bd = at(k), d
			}
		}
		if best < 0 || bd > 120 {
			return nil
		}
		tx, ty := rx[at(best+2)]-rx[at(best-2)], ry[at(best+2)]-ry[at(best-2)]
		tm := math.Hypot(tx, ty)
		if tm == 0 {
			continue
		}
		tx, ty = tx/tm, ty/tm
		dx, dy := x-rx[best], y-ry[best]
		out = append(out, [2]float64{float64(best), math.Round((-ty*dx+tx*dy)*10) / 10})
	}
	return out
}

// notePitLap: a lap of this track through the pits, or a clean one (the reference for the pit laps of the session)
func notePitLap(trackID int, x, y []float64, pit []bool, clean bool) {
	if trackID <= 0 || len(x) < 60 || len(x) != len(y) || tel.isDemo() || currentGame() != "iracing" {
		return
	}
	pitMu.Lock()
	if clean {
		pitRef[trackID] = [2][]float64{x, y}
	} else if len(pitRuns(pit)) > 0 && len(pitPending[trackID]) < 6 {
		pitPending[trackID] = append(pitPending[trackID], pitLap{x, y, pit})
	}
	ref, ok := pitRef[trackID]
	todo := pitPending[trackID]
	if ok {
		delete(pitPending, trackID)
	}
	pitMu.Unlock()
	if !ok || len(todo) == 0 {
		return
	}
	var pts [][2]float64
	for _, l := range todo {
		for _, r := range pitRuns(l.pit) {
			pts = append(pts, pitOffsets(l.x, l.y, ref[0], ref[1], r[0], r[1])...)
		}
	}
	if len(pts) < 10 {
		return
	}
	commMu.Lock()
	off := commCfg.NoMaps
	commMu.Unlock()
	if off {
		return
	}
	go func() {
		if _, err := commCall("POST", "/pitlane", map[string]any{"game": "iracing", "trackId": trackID, "n": len(ref[0]), "pts": pts}, true); err == nil {
			pitMu.Lock()
			pitSent[trackID] = time.Now()
			pitMu.Unlock()
		}
	}()
}

// pitLaneQuery: the server's pit lane of a track, for the app (GET /api/pitlane?trackId=)
func pitLaneQuery(trackID int) ([]byte, error) {
	return commCall("GET", "/pitlane?trackId="+strconv.Itoa(trackID)+"&game=iracing", nil, false)
}
