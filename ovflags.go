package main

// The drivers' country flags and the penalty clock beside their names in the native relative and standings.
// The flags are the flag-icons set (MIT, web/dist/flags/LICENSE-flag-icons.txt), one sprite drawn from its SVGs by
// tools/flags-sprite.js (web/dist/flags/flags.png, 32×24 a flag) with flags.json (the codes in the sprite's order and
// the names a game may give for each). iRacing gives every driver's flair (FlairName in DriverInfo, a country's
// name); Le Mans Ultimate gives no country for the cars, so its drivers carry none.
// The clock is a penalty to serve: iRacing's black or furled black flag on the car (CarIdxSessionFlags 0x10000 or
// 0x80000; iRacing does not tell a slowdown from another black flag), Le Mans Ultimate's penalties the car has
// (CarIdxNumPenalties, from the game's mNumPenalties).

import (
	"bytes"
	"encoding/json"
	"image"
	"image/draw"
	"image/png"
	"math"
	"strings"
	"sync"
	"unicode"
)

const (
	irFlagBlack  = 0x10000
	irFlagFurled = 0x80000
)

type ovFlagSet struct {
	img   *image.NRGBA
	w, h  int
	cols  int
	idx   map[string]int
	names map[string]string
}

var (
	ovFlagsOnce  sync.Once
	ovFlagData   ovFlagSet
	ovFlagMu     sync.Mutex
	ovFlagScaled = map[ovFlagKey]*ovFlagPix{}
)

type ovFlagKey struct {
	code string
	h    int
}

type ovFlagPix struct {
	w, h int
	col  []uint32
	a    []float64
}

func flagSet() *ovFlagSet {
	ovFlagsOnce.Do(func() {
		var meta struct {
			W, H, Cols int
			Codes      []string
			Names      map[string]string
		}
		b, err := webFS.ReadFile("web/dist/flags/flags.json")
		if err != nil || json.Unmarshal(b, &meta) != nil || meta.W <= 0 || meta.Cols <= 0 {
			return
		}
		p, err := webFS.ReadFile("web/dist/flags/flags.png")
		if err != nil {
			return
		}
		src, err := png.Decode(bytes.NewReader(p))
		if err != nil {
			return
		}
		img := image.NewNRGBA(src.Bounds())
		draw.Draw(img, img.Bounds(), src, src.Bounds().Min, draw.Src)
		f := ovFlagSet{img: img, w: meta.W, h: meta.H, cols: meta.Cols, idx: map[string]int{}, names: meta.Names}
		for i, c := range meta.Codes {
			f.idx[c] = i
		}
		ovFlagData = f
	})
	return &ovFlagData
}

// flagNorm: a name as flags.json keeps it (lower case, no accents, words split by one space)
func flagNorm(s string) string {
	var b strings.Builder
	sp := false
	for _, r := range strings.ToLower(s) {
		switch r {
		case 'á', 'à', 'â', 'ã', 'ä', 'å':
			r = 'a'
		case 'é', 'è', 'ê', 'ë':
			r = 'e'
		case 'í', 'ì', 'î', 'ï':
			r = 'i'
		case 'ó', 'ò', 'ô', 'õ', 'ö':
			r = 'o'
		case 'ú', 'ù', 'û', 'ü':
			r = 'u'
		case 'ç':
			r = 'c'
		case 'ñ':
			r = 'n'
		}
		if r < 128 && (unicode.IsLetter(r) || unicode.IsDigit(r)) {
			if sp && b.Len() > 0 {
				b.WriteByte(' ')
			}
			b.WriteRune(r)
			sp = false
		} else if r != '\'' && r != '’' {
			sp = true
		}
	}
	return b.String()
}

// flagCode: the flag's code (ISO 3166 alpha-2 in lower case, or a region such as gb-sct) of a country's code or name
// as the game gives it, "" when there is no flag for it
func flagCode(v string) string {
	v = strings.TrimSpace(v)
	if v == "" {
		return ""
	}
	f := flagSet()
	if f.idx == nil {
		return ""
	}
	if c := strings.ToLower(v); len(c) == 2 || strings.Contains(c, "-") {
		if _, ok := f.idx[c]; ok {
			return c
		}
	}
	if c, ok := f.names[flagNorm(v)]; ok {
		return c
	}
	return ""
}

// flagPix: a flag at h pixels high (4:3), averaged from the sprite, kept per code and size
func flagPix(code string, h int) *ovFlagPix {
	f := flagSet()
	i, ok := f.idx[code]
	if !ok || f.img == nil || h < 4 {
		return nil
	}
	k := ovFlagKey{code, h}
	ovFlagMu.Lock()
	defer ovFlagMu.Unlock()
	if p := ovFlagScaled[k]; p != nil {
		return p
	}
	w := int(math.Round(float64(h) * float64(f.w) / float64(f.h)))
	p := &ovFlagPix{w: w, h: h, col: make([]uint32, w*h), a: make([]float64, w*h)}
	sx0, sy0 := (i%f.cols)*f.w, (i/f.cols)*f.h
	fx, fy := float64(f.w)/float64(w), float64(f.h)/float64(h)
	for y := 0; y < h; y++ {
		for x := 0; x < w; x++ {
			var r, g, b, a, n float64
			for yy := int(float64(y) * fy); yy < int(math.Ceil(float64(y+1)*fy)) && yy < f.h; yy++ {
				for xx := int(float64(x) * fx); xx < int(math.Ceil(float64(x+1)*fx)) && xx < f.w; xx++ {
					o := f.img.PixOffset(sx0+xx, sy0+yy)
					pa := float64(f.img.Pix[o+3]) / 255
					r += float64(f.img.Pix[o]) * pa
					g += float64(f.img.Pix[o+1]) * pa
					b += float64(f.img.Pix[o+2]) * pa
					a += pa
					n++
				}
			}
			if a > 0 {
				p.col[y*w+x] = uint32(r/a+0.5)<<16 | uint32(g/a+0.5)<<8 | uint32(b/a+0.5)
				p.a[y*w+x] = a / n
			}
		}
	}
	if len(ovFlagScaled) > 256 {
		clear(ovFlagScaled)
	}
	ovFlagScaled[k] = p
	return p
}

// flag draws a country's flag h high with its left edge at x and its middle at cy; returns its width (0 none).
// Its colours are the flag's own in every design.
func (c *ovCanvas) flag(code string, x, cy, h float64, a float64) float64 {
	p := flagPix(code, int(math.Round(h)))
	if p == nil {
		return 0
	}
	x0, y0 := int(math.Round(x)), int(math.Round(cy-float64(p.h)/2))
	for y := 0; y < p.h; y++ {
		py := y0 + y
		if py < 0 || py >= c.h {
			continue
		}
		for xx := 0; xx < p.w; xx++ {
			px := x0 + xx
			if px < 0 || px >= c.w || p.a[y*p.w+xx] <= 0 {
				continue
			}
			i := py*c.w + px
			c.px[i] = blendPx(c.px[i], p.col[y*p.w+xx], a*p.a[y*p.w+xx])
		}
	}
	return float64(p.w)
}

// clock: the penalty clock, a ring with its hands and the button on top
func (c *ovCanvas) clock(cx, cy, r float64, col uint32, a float64) {
	c.ring(cx, cy+r*0.12, r*0.82, r*0.26, col, a)
	c.line(cx, cy+r*0.12, cx, cy-r*0.38, r*0.24, col, a)
	c.line(cx, cy+r*0.12, cx+r*0.36, cy+r*0.12, r*0.24, col, a)
	c.line(cx-r*0.3, cy-r*0.95, cx+r*0.3, cy-r*0.95, r*0.26, col, a)
}

// penalty: the car has a penalty to serve (st.mu is held)
func (st *ovState) penalty(idx int) bool {
	if f := st.arr("CarIdxSessionFlags"); idx >= 0 && idx < len(f) && f[idx] > 0 && uint32(int64(f[idx]))&(irFlagBlack|irFlagFurled) != 0 {
		return true
	}
	n := st.arr("CarIdxNumPenalties")
	return idx >= 0 && idx < len(n) && n[idx] > 0
}

// rowFlag: the flag of a car's driver, "" none or switched off
func (st *ovState) rowFlag(idx int) string {
	if st.ses == nil {
		return ""
	}
	if d := st.ses.Drivers[idx]; d != nil {
		return d.Flag
	}
	return ""
}
