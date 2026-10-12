package main

// The overlays in VR (vr_windows.go puts them in SteamVR): where each one sits in the headset and its pixels.
// They sit where they are on your main screen, on a flat screen in front of you: Size is how wide that screen is
// (metres), Dist how far it is and Height how far above (or below) your eyes its middle is; each overlay turns to
// face you. Moving them in Overlays → Edit positions moves them in VR too.

import (
	"math"
)

type vrCfg struct {
	On                 bool
	Dist, Size, Height float64
}

// vrCfgFrom reads the VR settings (CFG.ui.vr), with sane bounds and defaults
func vrCfgFrom(ui map[string]any) vrCfg {
	c := vrCfg{Dist: 0.9, Size: 1.2}
	m, _ := ui["vr"].(map[string]any)
	if m == nil {
		return c
	}
	c.On, _ = m["on"].(bool)
	num := func(k string, def, lo, hi float64) float64 {
		v, ok := m[k].(float64)
		if !ok || math.IsNaN(v) {
			return def
		}
		return math.Max(lo, math.Min(hi, v))
	}
	c.Dist = num("dist", 0.9, 0.3, 3)
	c.Size = num("size", 1.2, 0.3, 4)
	c.Height = num("height", 0, -1, 1)
	return c
}

// vrPlace: an overlay at x,y (w×h) on a screen sw×sh, in the headset's seated space: the 3×4 matrix (row major)
// from the seated origin to the overlay, and its width in metres
func vrPlace(x, y, w, h, sw, sh int, c vrCfg) (m [12]float32, width float32) {
	if sw <= 0 {
		sw = 1920
	}
	if sh <= 0 {
		sh = 1080
	}
	k := c.Size / float64(sw) // metres a pixel
	X := (float64(x) + float64(w)/2 - float64(sw)/2) * k
	Y := -(float64(y)+float64(h)/2-float64(sh)/2)*k + c.Height
	Z := -c.Dist
	n := math.Hypot(X, Z)
	s, co := -X/n, -Z/n // turned to face you: its front (+Z) points back at the seated origin
	m = [12]float32{
		float32(co), 0, float32(s), float32(X),
		0, 1, 0, float32(Y),
		float32(-s), 0, float32(co), float32(Z),
	}
	return m, float32(float64(w) * k)
}

// vrPixels: the window's pixels (32-bit, 0xAARRGGBB, alpha premultiplied, as a layered window takes them) as the
// RGBA bytes SteamVR takes (alpha not premultiplied)
func vrPixels(px []uint32, dst []byte) []byte {
	if cap(dst) < len(px)*4 {
		dst = make([]byte, len(px)*4)
	}
	dst = dst[:len(px)*4]
	for i, p := range px {
		a := p >> 24
		r, g, b := (p>>16)&0xff, (p>>8)&0xff, p&0xff
		if a > 0 && a < 255 {
			r, g, b = min(255, r*255/a), min(255, g*255/a), min(255, b*255/a)
		}
		j := i * 4
		dst[j], dst[j+1], dst[j+2], dst[j+3] = byte(r), byte(g), byte(b), byte(a)
	}
	return dst
}
