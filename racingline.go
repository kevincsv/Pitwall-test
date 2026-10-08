package main

// The racing line: where lap A's car was across the track against lap B's, metre by metre. The PC records the
// path its car drove on every lap (from its heading and speed, closed into a loop; Trace.X/Y every 5 m), and the
// game's heading is the same for every lap, so two paths share their orientation. At the same lap distance, A's
// point measured along B's normal is how far A was to one side of B; the slow drift of that dead reckoning is taken
// out with a long moving average (±400 m: it never shapes a corner). The coach (here and in the app,
// lineOffsets in index.html) turns it into inside/outside at turn-in, apex and exit, so a lap that brakes where the
// reference does but on the wrong part of the track hears about it.

import (
	"fmt"
	"math"
	"sort"
)

const lineDriftBins = 80 // ±400 m

// lineOffsets: A's distance (m) to one side of B at every 5 m point (NaN where the paths do not line up); nil when
// either lap has no path or the two paths are not the same track.
func lineOffsets(ax, ay, bx, by []float64) []float64 {
	n := min(len(ax), len(ay), len(bx), len(by))
	if n < 60 {
		return nil
	}
	lat, lon := make([]float64, n), make([]float64, n)
	for i := 0; i < n; i++ {
		i0, i1 := max(0, i-2), min(n-1, i+2)
		tx, ty := bx[i1]-bx[i0], by[i1]-by[i0]
		tm := math.Hypot(tx, ty)
		if tm == 0 {
			tm = 1
		}
		tx, ty = tx/tm, ty/tm
		dx, dy := ax[i]-bx[i], ay[i]-by[i]
		lat[i], lon[i] = -ty*dx+tx*dy, tx*dx+ty*dy
	}
	smooth := func(v []float64) []float64 {
		pre := make([]float64, n+1)
		for i, x := range v {
			pre[i+1] = pre[i] + x
		}
		out := make([]float64, n)
		for i := range v {
			lo, hi := max(0, i-lineDriftBins), min(n-1, i+lineDriftBins)
			out[i] = v[i] - (pre[hi+1]-pre[lo])/float64(hi-lo+1)
		}
		return out
	}
	latc, lonc := smooth(lat), smooth(lon)
	abs := make([]float64, n)
	for i, v := range lonc {
		abs[i] = math.Abs(v)
	}
	sort.Float64s(abs)
	if abs[n/2] > 6 { // along the track they disagree by metres: not the same line to compare
		return nil
	}
	for i := range latc {
		if math.Abs(lonc[i]) > 20 || math.Abs(latc[i]) > 25 {
			latc[i] = math.NaN()
		}
	}
	return latc
}

// cornerLine: how far lap A was to the inside of lap B (m, + is inside) at the reference's turn-in (its braking
// point), its apex and its exit; ok is false on a straight or without a line.
func cornerLine(lat, bx, by []float64, brake, apex int) (entry, mid, exit float64, ok bool) {
	n := min(len(lat), len(bx), len(by))
	if lat == nil || apex <= 0 || apex >= n-1 {
		return 0, 0, 0, false
	}
	tan := func(i int) (float64, float64) {
		i0, i1 := max(0, i-2), min(n-1, i+2)
		tx, ty := bx[i1]-bx[i0], by[i1]-by[i0]
		m := math.Hypot(tx, ty)
		if m == 0 {
			return 0, 0
		}
		return tx / m, ty / m
	}
	t1x, t1y := tan(max(0, apex-8))
	t2x, t2y := tan(min(n-1, apex+8))
	cr := t1x*t2y - t1y*t2x
	if math.Abs(cr) < 0.05 { // hardly a turn: no inside or outside
		return 0, 0, 0, false
	}
	sg := 1.0
	if cr < 0 {
		sg = -1
	}
	at := func(i int) float64 {
		s, c := 0.0, 0
		for k := max(0, i-2); k <= min(n-1, i+2); k++ {
			if !math.IsNaN(lat[k]) {
				s += lat[k]
				c++
			}
		}
		if c == 0 {
			return math.NaN()
		}
		return s / float64(c) * sg
	}
	entry, mid, exit = at(brake), at(apex), at(min(n-1, apex+16))
	if math.IsNaN(entry) || math.IsNaN(mid) || math.IsNaN(exit) {
		return 0, 0, 0, false
	}
	return entry, mid, exit, true
}

// lineTip: the advice the line gives in a corner (English, Spanish), "" when the line is like the reference's
func lineTip(entry, apex, exit float64, sameBrake bool) (string, string) {
	r := func(v float64) string { return fmt.Sprintf("%.1f", math.Abs(v)) }
	type t struct {
		v      float64
		en, es string
	}
	var c []t
	if entry >= 1.5 {
		if sameBrake {
			c = append(c, t{entry, "You brake where the reference does but " + r(entry) + " m more to the inside: turn in from the outside",
				"Frenas donde la referencia pero " + r(entry) + " m más por dentro: entra a la curva desde fuera"})
		} else {
			c = append(c, t{entry, "You turn in " + r(entry) + " m more to the inside: start the corner from the outside",
				"Entras " + r(entry) + " m más por dentro: empieza la curva desde fuera"})
		}
	}
	if apex <= -1.5 {
		c = append(c, t{-apex, "You pass " + r(apex) + " m away from the apex: get closer to the inside",
			"Pasas a " + r(apex) + " m del vértice: acércate más por dentro"})
	}
	if exit >= 1.5 {
		c = append(c, t{exit, "You use " + r(exit) + " m less track on exit: let the car run out to the outside",
			"Usas " + r(exit) + " m menos de pista a la salida: deja correr el coche hacia fuera"})
	}
	if len(c) == 0 {
		return "", ""
	}
	sort.SliceStable(c, func(i, j int) bool { return c[i].v > c[j].v })
	return c[0].en, c[0].es
}
