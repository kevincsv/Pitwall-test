//go:build ignore

// mkicon draws the TrackIQ icon (a checkered flag tile on a dark rounded
// square, in the app colours) and writes assets/pitlanehq.ico and a 1024 px PNG.
//
//	go run tools/mkicon/main.go
package main

import (
	"bytes"
	"encoding/binary"
	"image"
	"image/color"
	"image/png"
	"math"
	"os"
)

var (
	bgTop  = color.NRGBA{0x1f, 0x27, 0x33, 0xff}
	bgBot  = color.NRGBA{0x0d, 0x11, 0x16, 0xff}
	orange = color.NRGBA{0xff, 0xb0, 0x2e, 0xff}
	light  = color.NRGBA{0xf2, 0xf4, 0xf7, 0xff}
)

// roundedInside: is (x,y) inside a rounded rectangle?
func roundedInside(x, y, x0, y0, x1, y1, r float64) bool {
	if x < x0 || x > x1 || y < y0 || y > y1 {
		return false
	}
	cx := math.Max(x0+r, math.Min(x, x1-r))
	cy := math.Max(y0+r, math.Min(y, y1-r))
	return (x-cx)*(x-cx)+(y-cy)*(y-cy) <= r*r
}

func blend(a, b color.NRGBA, t float64) color.NRGBA {
	l := func(p, q uint8) uint8 { return uint8(float64(p) + (float64(q)-float64(p))*t + .5) }
	return color.NRGBA{l(a.R, b.R), l(a.G, b.G), l(a.B, b.B), l(a.A, b.A)}
}

// sample returns the colour at a point of the unit square (0..1).
func sample(u, v float64) (color.NRGBA, bool) {
	if !roundedInside(u, v, 0.02, 0.02, 0.98, 0.98, 0.22) {
		return color.NRGBA{}, false
	}
	c := blend(bgTop, bgBot, v)
	// orange outline just inside the edge
	if !roundedInside(u, v, 0.075, 0.075, 0.925, 0.925, 0.17) {
		return c, true
	}
	if !roundedInside(u, v, 0.105, 0.105, 0.895, 0.895, 0.145) {
		return blend(orange, c, 0.15), true
	}
	// checkered flag: 4 x 4 tiles, slightly waving
	fx0, fy0, fx1, fy1 := 0.22, 0.25, 0.80, 0.70
	wave := 0.035 * math.Sin((u-fx0)/(fx1-fx0)*math.Pi*1.6)
	vv := v - wave
	if u >= fx0 && u <= fx1 && vv >= fy0 && vv <= fy1 {
		i := int((u - fx0) / (fx1 - fx0) * 4)
		j := int((vv - fy0) / (fy1 - fy0) * 4)
		if i > 3 {
			i = 3
		}
		if j > 3 {
			j = 3
		}
		if (i+j)%2 == 0 {
			return orange, true
		}
		return light, true
	}
	// pole
	if u >= 0.185 && u <= 0.225 && v >= 0.22 && v <= 0.82 {
		return light, true
	}
	return c, true
}

func render(n int) *image.NRGBA {
	img := image.NewNRGBA(image.Rect(0, 0, n, n))
	const ss = 4
	for y := 0; y < n; y++ {
		for x := 0; x < n; x++ {
			var r, g, b, a float64
			for sy := 0; sy < ss; sy++ {
				for sx := 0; sx < ss; sx++ {
					u := (float64(x) + (float64(sx)+.5)/ss) / float64(n)
					v := (float64(y) + (float64(sy)+.5)/ss) / float64(n)
					if c, ok := sample(u, v); ok {
						r += float64(c.R)
						g += float64(c.G)
						b += float64(c.B)
						a += 255
					}
				}
			}
			k := float64(ss * ss)
			if a == 0 {
				continue
			}
			img.SetNRGBA(x, y, color.NRGBA{uint8(r / (a / 255)), uint8(g / (a / 255)), uint8(b / (a / 255)), uint8(a / k)})
		}
	}
	return img
}

func main() {
	sizes := []int{16, 24, 32, 48, 64, 128, 256}
	var pngs [][]byte
	for _, s := range sizes {
		var buf bytes.Buffer
		png.Encode(&buf, render(s))
		pngs = append(pngs, buf.Bytes())
	}
	// ICO with PNG entries (Windows Vista and later)
	var ico bytes.Buffer
	binary.Write(&ico, binary.LittleEndian, []uint16{0, 1, uint16(len(sizes))})
	off := 6 + 16*len(sizes)
	for i, s := range sizes {
		w := byte(s)
		if s >= 256 {
			w = 0
		}
		ico.Write([]byte{w, w, 0, 0})
		binary.Write(&ico, binary.LittleEndian, []uint16{1, 32})
		binary.Write(&ico, binary.LittleEndian, []uint32{uint32(len(pngs[i])), uint32(off)})
		off += len(pngs[i])
	}
	for _, p := range pngs {
		ico.Write(p)
	}
	os.WriteFile("assets/pitlanehq.ico", ico.Bytes(), 0o644)
	f, _ := os.Create("assets/pitlanehq-1024.png")
	png.Encode(f, render(1024))
	f.Close()
}
