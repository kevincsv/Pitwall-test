package main

// The overlays' pace (ovpace.go) and the faster drawing keep every picture as it was: the shapes and the text are
// checked pixel for pixel against the drawing as it was written before (refCanvas below), and every overlay draws
// the same picture again for the same values and another one when a value it shows changes.

import (
	"image"
	"math"
	"math/rand"
	"strings"
	"testing"
	"time"

	"golang.org/x/image/font"
	"golang.org/x/image/math/fixed"
)

// refCanvas: the shapes and the text as they were drawn before the overlays were made lighter, kept to compare with
type refCanvas struct{ *ovCanvas }

func (c refCanvas) blend(x, y int, col uint32, a float64) {
	if x < 0 || y < 0 || x >= c.w || y >= c.h || a <= 0 {
		return
	}
	if a > 1 {
		a = 1
	}
	i := y*c.w + x
	d := c.px[i]
	inv := 1 - a
	ch := func(s uint32) uint32 {
		v := float64((col>>s)&0xff)*a + float64((d>>s)&0xff)*inv
		if v > 255 {
			v = 255
		}
		return uint32(v + 0.5)
	}
	na := a*255 + float64(d>>24)*inv
	if na > 255 {
		na = 255
	}
	c.px[i] = uint32(na+0.5)<<24 | ch(16)<<16 | ch(8)<<8 | ch(0)
}

func (c refCanvas) roundRect(x, y, w, h, rad float64, fill uint32, fa float64, stroke uint32, sa, lw float64) {
	cx, cy := x+w/2, y+h/2
	rad = math.Min(rad, math.Min(w, h)/2)
	hx, hy := w/2-rad, h/2-rad
	for py := int(y - lw - 1); py <= int(y+h+lw+1); py++ {
		for px := int(x - lw - 1); px <= int(x+w+lw+1); px++ {
			qx, qy := math.Abs(float64(px)+0.5-cx)-hx, math.Abs(float64(py)+0.5-cy)-hy
			d := math.Hypot(math.Max(qx, 0), math.Max(qy, 0)) + math.Min(math.Max(qx, qy), 0) - rad
			if fa > 0 {
				c.blend(px, py, fill, fa*clamp01(0.5-d))
			}
			if sa > 0 && lw > 0 {
				c.blend(px, py, stroke, sa*clamp01(math.Min(0.5-d, 0.5+d+lw)))
			}
		}
	}
}

func (c refCanvas) rect(x, y, w, h float64, col uint32, a float64) {
	for py := int(math.Floor(y)); py < int(math.Ceil(y+h)); py++ {
		for px := int(math.Floor(x)); px < int(math.Ceil(x+w)); px++ {
			c.blend(px, py, col, a)
		}
	}
}

func (c refCanvas) line(x0, y0, x1, y1, w float64, col uint32, a float64) {
	dx, dy := x1-x0, y1-y0
	l2 := dx*dx + dy*dy
	r := w / 2
	for py := int(math.Min(y0, y1) - r - 1); py <= int(math.Max(y0, y1)+r+1); py++ {
		for px := int(math.Min(x0, x1) - r - 1); px <= int(math.Max(x0, x1)+r+1); px++ {
			qx, qy := float64(px)+0.5-x0, float64(py)+0.5-y0
			t := 0.0
			if l2 > 0 {
				t = math.Max(0, math.Min(1, (qx*dx+qy*dy)/l2))
			}
			d := math.Hypot(qx-t*dx, qy-t*dy) - r
			c.blend(px, py, col, a*clamp01(0.5-d))
		}
	}
}

func (c refCanvas) ring(cx, cy, r, w float64, col uint32, a float64) {
	for py := int(cy - r - w - 1); py <= int(cy+r+w+1); py++ {
		for px := int(cx - r - w - 1); px <= int(cx+r+w+1); px++ {
			d := math.Abs(math.Hypot(float64(px)+0.5-cx, float64(py)+0.5-cy)-r) - w/2
			c.blend(px, py, col, a*clamp01(0.5-d))
		}
	}
}

func (c refCanvas) disc(cx, cy, r float64, col uint32, a float64) {
	for py := int(cy - r - 1); py <= int(cy+r+1); py++ {
		for px := int(cx - r - 1); px <= int(cx+r+1); px++ {
			d := math.Hypot(float64(px)+0.5-cx, float64(py)+0.5-cy) - r
			c.blend(px, py, col, a*clamp01(0.5-d))
		}
	}
}

func (c refCanvas) textT(f font.Face, s string, x, cy float64, col uint32, a float64, align int, track float64) {
	if f == nil || s == "" {
		return
	}
	w := float64(font.MeasureString(f, s))/64 + track*float64(len([]rune(s))-1)
	switch align {
	case 1:
		x -= w
	case 2:
		x -= w / 2
	}
	m := f.Metrics()
	asc, desc := float64(m.Ascent)/64, float64(m.Descent)/64
	capH := float64(m.CapHeight) / 64
	if capH <= 0 {
		capH = asc * 0.7
	}
	base := cy + capH/2
	mask := image.NewAlpha(image.Rect(0, 0, int(w)+6, int(asc+desc)+6))
	fx, fy := x-math.Floor(x), base-math.Floor(base)
	d := font.Drawer{Dst: mask, Src: image.Opaque, Face: f, Dot: fixed.Point26_6{X: fixed.Int26_6((2 + fx) * 64), Y: fixed.Int26_6((math.Ceil(asc) + 2 + fy) * 64)}}
	if track == 0 {
		d.DrawString(s)
	} else {
		for _, r := range s {
			d.DrawString(string(r))
			d.Dot.X += fixed.Int26_6(track * 64)
		}
	}
	ox, oy := int(math.Floor(x))-2, int(math.Floor(base))-int(math.Ceil(asc))-2
	b := mask.Bounds()
	for yy := 0; yy < b.Dy(); yy++ {
		for xx := 0; xx < b.Dx(); xx++ {
			if v := mask.Pix[yy*mask.Stride+xx]; v > 0 {
				c.blend(ox+xx, oy+yy, col, a*math.Pow(float64(v)/255, 0.85))
			}
		}
	}
}

// the shapes and the text, drawn over each other at random places, sizes, colours and alphas (off the canvas too),
// are the same pixels as before
func TestOverlayShapesSameAsBefore(t *testing.T) {
	rnd := rand.New(rand.NewSource(7))
	f := func(lo, hi float64) float64 { return lo + rnd.Float64()*(hi-lo) }
	col := func() uint32 { return rnd.Uint32() & 0xffffff }
	faces := []font.Face{ovFace(fkBody, 13), ovFace(fkDataB, 17.25), ovFace(fkDisplay, 9.5)}
	words := []string{"P3", "1:31.204", "Somebody Slower", "+0.37", "T7 · BRAKE", "—", "ÁÉ ñ"}
	for round := 0; round < 60; round++ {
		w, h := 50+rnd.Intn(300), 30+rnd.Intn(200)
		a, b := newCanvas(w, h), newCanvas(w, h)
		ref := refCanvas{b}
		for k := 0; k < 25; k++ {
			x, y := f(-40, float64(w)+20), f(-40, float64(h)+20)
			al := []float64{1, 0.94, 0.5, f(0, 1.2), 0}[rnd.Intn(5)]
			switch rnd.Intn(7) {
			case 0:
				ww, hh, r, lw := f(0, 300), f(0, 200), f(0, 30), []float64{0, 1, 2, f(0, 4)}[rnd.Intn(4)]
				fa, sa := al, []float64{0, 1, f(0, 1)}[rnd.Intn(3)]
				c1, c2 := col(), col()
				a.roundRect(x, y, ww, hh, r, c1, fa, c2, sa, lw)
				ref.roundRect(x, y, ww, hh, r, c1, fa, c2, sa, lw)
			case 1:
				ww, hh, c1 := f(0, 200), f(0, 100), col()
				a.rect(x, y, ww, hh, c1, al)
				ref.rect(x, y, ww, hh, c1, al)
			case 2:
				x1, y1, lw, c1 := f(-40, float64(w)+40), f(-40, float64(h)+40), f(0.3, 20), col()
				if rnd.Intn(5) == 0 {
					x1, y1 = x, y
				}
				a.line(x, y, x1, y1, lw, c1, al)
				ref.line(x, y, x1, y1, lw, c1, al)
			case 3:
				r, lw, c1 := f(0, 60), f(0.5, 10), col()
				a.ring(x, y, r, lw, c1, al)
				ref.ring(x, y, r, lw, c1, al)
			case 4:
				r, c1 := f(0, 60), col()
				a.disc(x, y, r, c1, al)
				ref.disc(x, y, r, c1, al)
			default:
				fc, s, c1, align, tr := faces[rnd.Intn(len(faces))], words[rnd.Intn(len(words))], col(), rnd.Intn(3), []float64{0, 0, 1.2}[rnd.Intn(3)]
				for rep := 0; rep < 2; rep++ { // twice: the second from the text's cache
					a.textT(fc, s, x, y, c1, al, align, tr)
					ref.textT(fc, s, x, y, c1, al, align, tr)
				}
			}
		}
		for i := range a.px {
			if a.px[i] != b.px[i] {
				t.Fatalf("round %d: pixel %d,%d is %08x, it was %08x", round, i%w, i/w, a.px[i], b.px[i])
			}
		}
	}
}

// every overlay draws the same picture again for the same values (the map's still part from its copy too), and the
// values it shows still change it
func TestOverlaysRedrawTheSame(t *testing.T) {
	for _, name := range overlayOrder {
		st := ovBenchState(t)
		w, h := ovBenchSize(st, name)
		now := time.Now()
		draw := func() []uint32 {
			c := newCanvas(w, h)
			st.at = now
			ovDraw(name, c, st, now)
			return c.px
		}
		first, again := draw(), draw()
		if !samePixels(first, again) {
			t.Errorf("%s: two draws of the same values differ", name)
		}
		if name == "map" { // another size or track draws its still part again
			st.ext.mapX = append([]float64(nil), st.ext.mapX...)
			st.ext.mapX[0] += 50
			if samePixels(first, draw()) {
				t.Errorf("map: another track kept the old picture")
			}
		}
	}
}

func TestFrameValues(t *testing.T) {
	a, b := `{"k":12,"v":[1,2.5,[1,2]]}`, `{"k":13,"v":[1,2.5,[1,2]]}`
	if frameValues(a) != frameValues(b) || frameValues(a) == frameValues(`{"k":13,"v":[1,2.6,[1,2]]}`) {
		t.Fatal("frame values")
	}
	st := newOvState("en")
	fields := []string{"Speed", "Gear"}
	st.event("t", a, &fields)
	s1 := st.dataSeq
	st.event("t", b, &fields)
	if st.dataSeq != s1 {
		t.Fatal("the same values with another tick count as new")
	}
	st.event("t", `{"k":14,"v":[2,2.5,[1,2]]}`, &fields)
	if st.dataSeq == s1 {
		t.Fatal("new values not seen")
	}
	c1 := st.cfgSeq
	st.event("config", `{"config":{"edit":false,"alpha":200}}`, &fields)
	if st.cfgSeq == c1 {
		t.Fatal("a config not seen")
	}
}

func TestOverlayPace(t *testing.T) {
	st := newOvState("en")
	set := func(k, v string) { st.frame[k] = []byte(v) }
	now := time.Now()
	st.at = now
	set("IsOnTrack", "true")
	var p ovPace
	if !p.due(st, 300, 100, now) {
		t.Fatal("the first picture")
	}
	p.done(st, 300, 100, now, false)
	now = now.Add(33 * time.Millisecond)
	st.at = now
	if !p.due(st, 300, 100, now) {
		t.Fatal("a picture that moved is drawn again")
	}
	p.done(st, 300, 100, now, true) // the same picture as the one before
	now = now.Add(33 * time.Millisecond)
	if p.due(st, 300, 100, now) {
		t.Fatal("the same values and a still picture: no new draw")
	}
	if !p.due(st, 300, 120, now) {
		t.Fatal("another size draws")
	}
	st.dataSeq++
	if !p.due(st, 300, 100, now) {
		t.Fatal("new values draw at once")
	}
	st.dataSeq--
	if !p.due(st, 300, 100, now.Add(ovStillGap)) {
		t.Fatal("a still picture is drawn again now and then")
	}
	st.cfgSeq++
	if !p.due(st, 300, 100, now) {
		t.Fatal("new settings draw at once")
	}
	p.done(st, 300, 100, now, true)
	st.edit = true
	if !p.due(st, 300, 100, now) {
		t.Fatal("moving the overlays draws every frame")
	}
	st.edit = false
	// out of the car: one picture at once, then four a second whatever the values
	set("IsOnTrack", "false")
	st.dataSeq++
	if !p.due(st, 300, 100, now) {
		t.Fatal("leaving the track draws at once")
	}
	p.done(st, 300, 100, now, false)
	st.dataSeq++
	if p.due(st, 300, 100, now.Add(100*time.Millisecond)) || !p.due(st, 300, 100, now.Add(ovOffGap)) {
		t.Fatal("off the track: four a second")
	}
	p.done(st, 300, 100, now.Add(ovOffGap), false)
	set("IsOnTrack", "true")
	st.dataSeq++
	if !p.due(st, 300, 100, now.Add(ovOffGap+time.Millisecond)) {
		t.Fatal("back on the track: at once")
	}
	// no game: the stream is stale
	if !p.due(st, 300, 100, now.Add(3*time.Second)) {
		t.Fatal("the data going stale draws (the overlay empties)")
	}
	p.done(st, 300, 100, now.Add(3*time.Second), true)
	if p.due(st, 300, 100, now.Add(3*time.Second+100*time.Millisecond)) {
		t.Fatal("no game: four a second")
	}
}

func TestOverlayTimer(t *testing.T) {
	for _, c := range []struct {
		name string
		ui   map[string]any
		ms   uintptr
	}{{"radar", nil, 16}, {"relative", nil, 33}, {"standings", nil, 100}, {"relative", map[string]any{"ovfps": 15.0}, 66},
		{"radar", map[string]any{"ovfps": 15.0}, 33}, {"standings", map[string]any{"ovfps": 10.0}, 100}, {"map", map[string]any{"ovfps": 3.0}, 33}} {
		if ms := ovTimerMs(c.name, c.ui); ms != c.ms {
			t.Errorf("%s %v: %d ms, want %d", c.name, c.ui, ms, c.ms)
		}
	}
	if v := ovWithOnTrack([]string{"Speed"}); strings.Join(v, ",") != "Speed,IsOnTrack" || len(ovWithOnTrack(v)) != 2 {
		t.Fatal("IsOnTrack")
	}
}
