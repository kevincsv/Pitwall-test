package main

import (
	"testing"
	"time"
)

// the overlays that draw a title (ui.<overlay>.title hides it); the others have none to hide
var ovWithTitle = map[string]bool{"fuel": true, "engine": true, "tyres": true, "inputs": true, "boost": true, "telemetry": true, "gg": true,
	"stats": true, "pit": true, "sectors": true, "gaps": true, "incidents": true, "compare": true, "brakes": true, "coach": true, "weather": true, "system": true}

// TestOverlayTitleOff: with its title hidden an overlay draws without crashing and needs less height (the map, the
// radar and the g-force keep the window's, so never more); the overlays without a title draw the same
func TestOverlayTitleOff(t *testing.T) {
	for _, name := range overlayOrder {
		w := overlaySizes[name][0]
		draw := func(ui map[string]any) (int, []uint32) {
			st := ovTestState(t, ui)
			st.edit = true // the overlays that hide without data draw their card
			c := newCanvas(w, 900)
			h := ovDraw(name, c, st, time.Now())
			if h == 0 {
				h = c.h
			}
			return h, append([]uint32(nil), c.px...)
		}
		on, pOn := draw(nil)
		off, pOff := draw(map[string]any{name: map[string]any{"title": false}})
		if ovWithTitle[name] {
			if off >= on {
				t.Errorf("%s: %d high without its title, %d with it", name, off, on)
			}
			continue
		}
		if off != on || !samePixels(pOn, pOff) {
			t.Errorf("%s has no title but draws differently without it", name)
		}
	}
	// the title shown by default and with title: true is the same picture
	for name := range ovWithTitle {
		a, b := ovTestState(t, nil), ovTestState(t, map[string]any{name: map[string]any{"title": true}})
		ca, cb := newCanvas(overlaySizes[name][0], 900), newCanvas(overlaySizes[name][0], 900)
		now := time.Now()
		if ovDraw(name, ca, a, now) != ovDraw(name, cb, b, now) || !samePixels(ca.px, cb.px) {
			t.Errorf("%s: title true draws differently from the default", name)
		}
	}
}

func TestOverlayAlpha(t *testing.T) {
	ui := map[string]any{"fuel": map[string]any{"alpha": 120.0}, "tyres": map[string]any{"title": false}}
	for _, tc := range []struct {
		name string
		all  int
		want int
	}{{"fuel", 200, 120}, {"tyres", 200, 200}, {"map", 0, 255}, {"map", 300, 255}, {"fuel", 0, 120}} {
		if got := ovAlpha(tc.name, ui, tc.all); got != tc.want {
			t.Errorf("ovAlpha(%s, %d) = %d, want %d", tc.name, tc.all, got, tc.want)
		}
	}
}
