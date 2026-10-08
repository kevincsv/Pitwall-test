package main

import (
	"math"
	"strings"
	"testing"
)

// a lap 3 m more to the inside around one point of a corner than the reference: the line sees 3 m there and
// nothing far from it, inside is inside whichever way the track turns, and the coach says it
func TestRacingLine(t *testing.T) {
	for _, dir := range []float64{1, -1} { // a left-hand and a right-hand circle
		const R, n = 400.0, 500
		bx, by, ax, ay := make([]float64, n), make([]float64, n), make([]float64, n), make([]float64, n)
		for i := 0; i < n; i++ {
			th := float64(i) * 5 / R * dir
			bx[i], by[i] = R*math.Sin(th)*dir, R-R*math.Cos(th)
			// 3 m closer to the centre around point 200 (a bump 20 points wide)
			off := 3 * math.Exp(-math.Pow(float64(i-200)/8, 2))
			cx, cy := 0.0, R
			dx, dy := cx-bx[i], cy-by[i]
			m := math.Hypot(dx, dy)
			ax[i], ay[i] = bx[i]+dx/m*off+0.8, by[i]+dy/m*off-0.5 // and a constant drift
		}
		lat := lineOffsets(ax, ay, bx, by)
		if lat == nil {
			t.Fatal("no line")
		}
		e, a, x, ok := cornerLine(lat, bx, by, 200, 200)
		if !ok || math.Abs(a-3) > 0.4 || e < 2.5 {
			t.Fatalf("dir %v: inside at the apex %.2f, entry %.2f, exit %.2f, ok %v", dir, a, e, x, ok)
		}
		if math.Abs(lat[400]) > 0.4 && math.Abs(-lat[400]) > 0.4 {
			t.Fatalf("far from the bump the line is the same: %.2f", lat[400])
		}
		en, es := lineTip(e, a, x, true)
		if !strings.Contains(en, "more to the inside") || !strings.Contains(es, "más por dentro") {
			t.Fatalf("tip: %q / %q", en, es)
		}
	}
	// paths of two different tracks: no line
	a := make([]float64, 200)
	b := make([]float64, 200)
	c := make([]float64, 200)
	for i := range a {
		a[i], b[i], c[i] = float64(i)*5, 0, float64(i)*9
	}
	if lineOffsets(a, b, c, b) != nil {
		t.Fatal("two different paths gave a line")
	}
}
