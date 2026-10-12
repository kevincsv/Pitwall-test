package main

import (
	"math"
	"testing"
)

func TestVRPlace(t *testing.T) {
	c := vrCfg{On: true, Dist: 1, Size: 1.92}
	// in the middle of the screen: straight ahead, facing you, as wide as on the screen
	m, w := vrPlace(860, 490, 200, 100, 1920, 1080, c)
	if math.Abs(float64(m[3])) > 1e-6 || math.Abs(float64(m[7])) > 1e-6 || math.Abs(float64(m[11])+1) > 1e-6 {
		t.Fatalf("centre: %v", m)
	}
	if math.Abs(float64(m[0])-1) > 1e-6 || math.Abs(float64(w)-0.2) > 1e-6 {
		t.Fatalf("centre rotation/width: %v %v", m, w)
	}
	// top left: to the left, above, turned towards you (its front points right and back)
	m, _ = vrPlace(0, 0, 200, 100, 1920, 1080, c)
	if !(m[3] < 0 && m[7] > 0 && m[2] > 0) {
		t.Fatalf("top left: %v", m)
	}
	// the height lifts everything
	c.Height = 0.2
	m, _ = vrPlace(860, 490, 200, 100, 1920, 1080, c)
	if math.Abs(float64(m[7])-0.2) > 1e-6 {
		t.Fatalf("height: %v", m)
	}
}

func TestVRCfgAndPixels(t *testing.T) {
	c := vrCfgFrom(map[string]any{"vr": map[string]any{"on": true, "dist": 9.0, "size": 0.1}})
	if !c.On || c.Dist != 3 || c.Size != 0.3 || c.Height != 0 {
		t.Fatalf("cfg: %+v", c)
	}
	if d := vrCfgFrom(nil); d.On || d.Dist != 0.9 || d.Size != 1.2 {
		t.Fatalf("defaults: %+v", d)
	}
	// half-transparent red (premultiplied 0x80800000) comes out as full red at half alpha
	b := vrPixels([]uint32{0x80800000, 0xff00ff00, 0}, nil)
	if b[0] != 255 || b[1] != 0 || b[3] != 0x80 || b[5] != 255 || b[7] != 255 || b[11] != 0 {
		t.Fatalf("pixels: %v", b)
	}
}
