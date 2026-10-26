package main

import "testing"

func TestOverlayMinSize(t *testing.T) {
	for _, n := range overlayOrder {
		w, h := overlayMinSize(n)
		d := overlaySizes[n]
		if w < d[0]/2 || w > d[0] || h < 40 || h > d[1] {
			t.Fatalf("%s: min %dx%d for default %v", n, w, h, d)
		}
	}
	if w, _ := overlayMinSize("dash"); w != 560 {
		t.Fatalf("dash min width %d", w)
	}
}
