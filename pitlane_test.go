package main

import (
	"math"
	"testing"
)

// a round track and a lap through the pits: the pit road 20 m inside the track for 100 points, the lap's dead
// reckoning a few metres off; the pit lane comes out 20 m to one side, at the right points, drift taken out
func TestPitOffsets(t *testing.T) {
	const n, R = 400, 2000 / (2 * math.Pi) // 2 km, a point every 5 m
	rx, ry, px, py := make([]float64, n), make([]float64, n), make([]float64, n), make([]float64, n)
	pit := make([]bool, n)
	for i := 0; i < n; i++ {
		a := 2 * math.Pi * float64(i) / n
		rx[i], ry[i] = R*math.Cos(a), R*math.Sin(a)
		r := R
		if i >= 150 && i <= 250 {
			r, pit[i] = R-20, true
		}
		px[i], py[i] = r*math.Cos(a)+3, r*math.Sin(a)+2
	}
	runs := pitRuns(pit)
	if len(runs) != 1 || runs[0] != [2]int{150, 250} {
		t.Fatalf("runs %v", runs)
	}
	pts := pitOffsets(px, py, rx, ry, 150, 250)
	if len(pts) != 101 {
		t.Fatalf("%d points", len(pts))
	}
	for _, p := range pts[5:96] {
		if math.Abs(math.Abs(p[1])-20) > 1.5 {
			t.Fatalf("offset %v", p)
		}
	}
	if pts[50][0] < 195 || pts[50][0] > 205 {
		t.Fatalf("placed at %v", pts[50])
	}
	// counter-clockwise, the inside is to the left: positive
	if pts[50][1] < 0 {
		t.Fatalf("side %v", pts[50])
	}
}
