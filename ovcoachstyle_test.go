package main

import (
	"math"
	"testing"
	"time"
)

// the coach overlay's styles (card, column, curve, big) draw the corner coming and the verdict of the one just taken
func TestCoachOverlayStyles(t *testing.T) {
	for _, name := range []string{"both", "words", "num"} {
		coachStyles(t, name)
	}
}

func coachStyles(t *testing.T, turnName string) {
	st := ovTestState(t, map[string]any{"coach": map[string]any{"turnName": turnName}})
	if got := coachTurnLabel(st, 7, false); (turnName == "num") != (got == "T7") {
		t.Fatalf("%s: label %q", turnName, got)
	}
	// a corner: a straight, a right-hand bend, a straight, a path every 5 m
	path := func(off float64) *ovLap {
		l := &ovLap{}
		for i := 0; i < 400; i++ {
			d := float64(i) * 5
			x, y := 0.0, d
			if d > 300 {
				a := math.Min((d-300)/150, 1) * math.Pi / 2
				x, y = 95*(1-math.Cos(a))+off, 300+95*math.Sin(a)
				if d > 450 {
					x, y = 95+(d-450)+off, 395
				}
			}
			l.x, l.y = append(l.x, x), append(l.y, y)
		}
		return l
	}
	C := &st.ext.coach
	C.lapA, C.refLap = path(3), path(0)
	tip := coachTip{n: 7, d: 280, apex: 380, lost: .21, en: "You brake 8 m later than the reference and lose 4 km/h at the apex. Brake a little earlier and carry the speed",
		es: "Frenas 8 m más tarde que la referencia y pierdes 4 km/h en el vértice. Frena un poco antes y conserva la velocidad", dd: 8, hasDd: true}
	tip.cueEn, tip.cueEs = coachCue(tip.en)
	if tip.cueEs != "FRENA ANTES" {
		t.Fatalf("cue %q", tip.cueEs)
	}
	C.tips = []coachTip{tip}
	for _, mode := range []string{"column", "curve", "big"} {
		for _, v := range []bool{false, true} {
			C.verdict = &coachVerdict{n: 7, gain: -.06, at: time.Now()}
			c := newCanvas(520, 400)
			var h int
			switch mode {
			case "column":
				h = drawCoachColumn(c, st, 1, &C.tips[0], 150, 300, v)
			case "curve":
				h = drawCoachCurve(c, st, 1, &C.tips[0], 150, 300, v, func(t *coachTip) string { return st.T(t.en, t.es) })
			case "big":
				h = drawCoachBig(c, st, 1, &C.tips[0], 150, 300, v)
			}
			painted := 0
			for _, p := range c.px {
				if p>>24 > 0 {
					painted++
				}
			}
			if painted == 0 || h < 60 || h > 400 {
				t.Fatalf("%s: painted %d, height %d", mode, painted, h)
			}
			name := "coach-" + mode + "-" + turnName
			if v {
				name += "-verdict"
			}
			ovSavePNG(t, c, h, name)
		}
	}
}
