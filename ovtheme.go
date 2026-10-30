package main

// The overlays' designs: Classic (the native look, the default, drawn exactly as before) and the Beta designs beside
// it, Lane, Wall, Board, Frameless and Light (the owner's choice). The design is set for all the overlays
// (ui.ovstyle) and, over it, for one overlay (ui.<overlay>.style, empty follows the one for all). A design is an
// ovTheme: the panel (its fill, opacity, border and corners), the title's treatment (a band, an amber block, a dot),
// the type (the numbers bold; condensed on Board), the rows of the relative and the standings (their height, the
// names' size, your row, the class bar, the iRating pill, the class bands), the text's shadow (Frameless) and the
// light palette (Light). ovDraw sets it for the frame (ovTh) and the drawing primitives read it: the colours go through
// it in blender/blend, the faces in ovFace, the panel in panel() and the title in label(), so every overlay takes the
// design without drawing code of its own. Classic is no theme at all (ovTh nil): nothing in its path changes.

import (
	"math"
	"strings"
	"sync"

	"golang.org/x/image/font"
)

const (
	hdrNone  = iota // the title as it is (a small label)
	hdrBand         // Lane: a band across the top with the title in white
	hdrBlock        // Board: a solid amber block, the title in dark ink
	hdrDot          // Wall: an amber dot before the title and a hairline under it
)

type ovColMap struct {
	col uint32
	am  float64 // the alpha's factor, 0 none
}

type ovTheme struct {
	id                  string
	fill, line          uint32
	fillA, lineA, lineW float64
	rad                 float64 // the panel's corners (design px)
	hdr                 int
	titleKind           int
	titleSz, titleTr    float64
	titleCol            uint32
	titleA              float64
	shadow              bool    // Frameless: every text with a soft shadow, for contrast over the game
	light               bool    // Light: the dark palette turned light (lightCol)
	board               bool    // Board: the numbers and the names in the condensed face, bigger
	numBold             bool    // the numbers white and bold
	surfA               float64 // the dark surfaces inside the panel this see-through (Frameless), 0 as they are
	nameScale, rowScale float64
	monoScale           float64
	me                  uint32 // your row
	meA, meRad          float64
	meBar               bool
	meInk               uint32 // your row's text (Board: dark on white), 0 as it is
	rowLine             uint32 // the line under each row, instead of the classic stripes
	rowLineA            float64
	clsBar, clsRad      float64 // the class bar before the name (design px wide), 0 none
	irPill              bool
	pillBg, pillFg      uint32
	bands, dimOut       bool
	ink                 uint32 // the text on Board's amber header

	// set for each frame (under ovThMu)
	ttl, armed bool    // the overlay shows its title; the next label at the top is it
	bandBot    float64 // Board: the amber header's bottom, the text above it in ink
	raw        bool    // the panel and the design's own colours: never mapped
	cmap       map[uint32]ovColMap
}

var (
	ovThMu sync.Mutex
	ovTh   *ovTheme // the design of the overlay being drawn, nil Classic (set by ovDraw)
)

// the class colours of the designs: our own palette (turquoise, violet, orange, then blue, yellow, pink)
var ovClassPal = []uint32{0x22c7b0, 0x9a7bff, 0xff7a2f, 0x4da3ff, 0xffd23f, 0xff5d8f}

// The panels are opaque (fillA 1) so the overlay's opacity setting alone makes them see-through: at 255 nothing of the
// game shows behind them. Frameless is the one see-through by design (no panel, a light shade behind the text).
var ovThemes = map[string]*ovTheme{
	"lane": {id: "lane", fill: 0x12151b, fillA: 1, line: 0xffffff, lineA: 0.06, lineW: 1, rad: 6, hdr: hdrBand,
		titleKind: fkDisplayB, titleSz: 14, titleTr: 0.8, titleCol: colText, titleA: 1, numBold: true,
		nameScale: 1.14, rowScale: 1.18, monoScale: 0.96, me: 0xc49e4a, meA: 0.42, meRad: 2,
		rowLine: 0xffffff, rowLineA: 0.05, clsBar: 5, clsRad: 2.5, irPill: true, pillBg: 0xe6e9ef, pillFg: 0x0b0e14, bands: true, dimOut: true},
	"wall": {id: "wall", fill: 0x0b0e14, fillA: 1, line: 0xffffff, lineA: 0.08, lineW: 1, rad: 12, hdr: hdrDot,
		titleKind: fkDisplay, titleSz: 12, titleTr: 1.9, titleCol: colMuted, titleA: 1, numBold: true,
		nameScale: 1, rowScale: 1.04, monoScale: 1, me: colAmber, meA: 0.16, meRad: 6, meBar: true,
		rowLineA: 0, clsBar: 3, clsRad: 1.5, bands: true, dimOut: true},
	"board": {id: "board", fill: 0x07090c, fillA: 1, line: 0x1f2632, lineA: 1, lineW: 2, rad: 4, hdr: hdrBlock,
		titleKind: fkDisplayB, titleSz: 15, titleTr: 1.2, titleCol: 0x161003, titleA: 1, board: true, numBold: true,
		nameScale: 1.08, rowScale: 1.1, monoScale: 1, me: colText, meA: 1, meRad: 0, meInk: 0x07090c,
		rowLine: 0x161b23, rowLineA: 1, clsBar: 6, clsRad: 0, bands: true, dimOut: true, ink: 0x161003},
	"frameless": {id: "frameless", fill: 0x000000, fillA: 0.26, rad: 8, hdr: hdrNone,
		titleKind: fkDisplay, titleSz: 11, titleTr: 2, titleCol: colText, titleA: 0.6, shadow: true, numBold: true, surfA: 0.35,
		nameScale: 1.07, rowScale: 1.04, monoScale: 0.96, me: colAmber, meA: 0.22, meRad: 4,
		clsBar: 3, clsRad: 1.5, dimOut: true},
	"light": {id: "light", fill: 0xf6f8fb, fillA: 1, line: 0xffffff, lineA: 0.7, lineW: 1, rad: 12, hdr: hdrNone,
		titleKind: fkDisplayB, titleSz: 13, titleTr: 1.5, titleCol: 0x9a6200, titleA: 1, light: true, numBold: true,
		nameScale: 1.07, rowScale: 1.04, monoScale: 0.96, me: 0xffe7b3, meA: 1, meRad: 6,
		rowLine: 0xe3e8ef, rowLineA: 1, clsBar: 4, clsRad: 2, irPill: true, pillBg: 0x10141c, pillFg: 0xffffff, bands: true, dimOut: true},
}

// ovTitled: the overlays with a title row (the app's OV_TITLED): only theirs takes the design's title treatment
var ovTitled = map[string]bool{"fuel": true, "engine": true, "tyres": true, "inputs": true, "boost": true, "telemetry": true, "gg": true,
	"stats": true, "pit": true, "sectors": true, "gaps": true, "incidents": true, "compare": true, "brakes": true, "coach": true,
	"weather": true, "system": true}

// ovStyles: every design in the order the app offers them
var ovStyles = []string{"classic", "lane", "wall", "board", "frameless", "light"}

// ovDefaultStyle: the design of the overlays nobody chose one for (the owner's choice: Lane, still in beta)
var ovDefaultStyle = "lane"

// ovStyleOf: the design of one overlay, its own (ui.<overlay>.style) else the one for all (ui.ovstyle), else ovDefaultStyle
func ovStyleOf(name string, ui map[string]any) string {
	if m, ok := ui[name].(map[string]any); ok {
		if s, ok := m["style"].(string); ok && (s == "classic" || ovThemes[s] != nil) {
			return s
		}
	}
	if s, ok := ui["ovstyle"].(string); ok && (s == "classic" || ovThemes[s] != nil) {
		return s
	}
	return ovDefaultStyle
}

// ovThemeFor: the theme ovDraw draws one overlay with (nil for Classic)
func ovThemeFor(name string, ui map[string]any) *ovTheme { return ovThemes[ovStyleOf(name, ui)] }

func (t *ovTheme) remaps() bool { return t.light || t.surfA > 0 }

// face: the face a design draws a kind of text with
func (t *ovTheme) face(kind int, px float64) (int, float64) {
	if t.board {
		switch kind {
		case fkData, fkDataB:
			return fkDisplayB, px * 1.22
		case fkBody:
			return fkDisplay, px * 1.12
		case fkBodyB:
			return fkDisplayB, px * 1.12
		}
	}
	if t.numBold && kind == fkData {
		return fkDataB, px
	}
	return kind, px
}

// mapCol: a colour as the design paints it, and the factor of its alpha (kept per colour: a few dozen per overlay)
func (t *ovTheme) mapCol(col uint32) (uint32, float64) {
	if m, ok := t.cmap[col]; ok {
		return m.col, m.am
	}
	m := ovColMap{col: col}
	h, s, l := rgbHSL(col)
	if t.light {
		m.col = lightCol(col, h, s, l)
	} else if t.surfA > 0 && s < 0.35 && l < 0.2 {
		m.am = t.surfA
	}
	if t.cmap == nil || len(t.cmap) > 4096 {
		t.cmap = map[uint32]ovColMap{}
	}
	t.cmap[col] = m
	return m.col, m.am
}

// rgbHSL: a colour's hue (degrees), saturation and lightness
func rgbHSL(col uint32) (h, s, l float64) {
	r, g, b := float64((col>>16)&0xff)/255, float64((col>>8)&0xff)/255, float64(col&0xff)/255
	mx, mn := math.Max(r, math.Max(g, b)), math.Min(r, math.Min(g, b))
	l = (mx + mn) / 2
	if mx == mn {
		return 0, 0, l
	}
	d := mx - mn
	if l > 0.5 {
		s = d / (2 - mx - mn)
	} else {
		s = d / (mx + mn)
	}
	switch mx {
	case r:
		h = (g - b) / d
		if g < b {
			h += 6
		}
	case g:
		h = (b-r)/d + 2
	default:
		h = (r-g)/d + 4
	}
	return h * 60, s, l
}

// lightCol: the Light design's colour for one of the dark palette: the greys turn over (a dark surface light, the
// white text dark), the dark tints light and the bright colours a little darker, so they read on white
func lightCol(col uint32, h, s, l float64) uint32 {
	r, g, b := float64((col>>16)&0xff), float64((col>>8)&0xff), float64(col&0xff)
	chroma := (math.Max(r, math.Max(g, b)) - math.Min(r, math.Min(g, b))) / 255
	switch {
	case chroma < 0.16: // a grey (the text, the surfaces, the lines)
		return hsl(h, s, 0.06+(1-l)*0.92)
	case l < 0.35:
		return hsl(h, s*0.8, 1-l*0.6)
	case l > 0.45 && h > 38 && h < 75: // the yellows, darker still
		return hsl(h, s, l*0.55)
	case l > 0.45:
		return hsl(h, s, l*0.72)
	}
	return hsl(h, s, l)
}

// themedPanel: the design's panel (panel() for a theme)
func themedPanel(c *ovCanvas, t *ovTheme, h, z float64) {
	t.raw = true
	lw := t.lineW
	if t.lineA == 0 {
		lw = 0
	}
	c.roundRect(0.5, 0.5, float64(c.w)-1, h-1, t.rad*z, t.fill, t.fillA, t.line, t.lineA, lw)
	t.raw = false
	t.armed, t.bandBot = t.ttl, 0
}

// themeTitle: an overlay's title in the design (the first label at the top after its panel)
func themeTitle(c *ovCanvas, t *ovTheme, z float64, s string, x, cy float64, align int) {
	t.raw = true
	defer func() { t.raw = false }()
	W := float64(c.w)
	bot := cy + 9*z
	switch t.hdr {
	case hdrBand, hdrBlock:
		themeBand(c, t, z, bot)
	case hdrDot:
		c.disc(x+3*z, cy, 3*z, colAmber, 1)
		c.rect(x, bot+1, W-2*x, 1, 0xffffff, 0.07)
		x += 11 * z
	}
	f := ovFace(t.titleKind, t.titleSz*z)
	c.textT(f, strings.ToUpper(s), x, cy, t.titleCol, t.titleA, align, t.titleTr*z)
}

// themeBand: Lane's band or Board's amber block across the top of the panel, down to bot
func themeBand(c *ovCanvas, t *ovTheme, z, bot float64) {
	W := float64(c.w)
	t.raw = true
	if t.hdr == hdrBlock {
		r := t.rad * z
		c.roundRect(1, 1, W-2, bot, r, colAmber, 1, 0, 0, 0)
		c.rect(1, math.Max(1, bot-r-1), W-2, r+1, colAmber, 1)
		t.bandBot = bot
	} else {
		c.roundRect(1, 1, W-2, bot, t.rad*z, 0xffffff, 0.04, 0, 0, 0)
		c.rect(1, bot, W-2, 1, 0xffffff, 0.07)
	}
	t.raw = false
}

// labelFace: the face of the small uppercase labels (the classic mono one; the designs' condensed one)
func labelFace(z float64) (font.Face, float64) {
	if t := ovTh; t != nil {
		if t.board {
			return ovFace(fkDisplayB, 12.5*z), 1.2 * z
		}
		return ovFace(fkDisplay, 12*z), 1.3 * z
	}
	return ovFace(fkData, 11*z), 1.1 * z
}

// themeRect: a shape in the design's own colour (never mapped)
func (c *ovCanvas) themeRect(x, y, w, h, r float64, col uint32, a float64) {
	t := ovTh
	if t != nil {
		t.raw = true
	}
	c.roundRect(x, y, w, h, r, col, a, 0, 0, 0)
	if t != nil {
		t.raw = false
	}
}

// T3 picks the app's language among English, Spanish and Portuguese
func (s *ovState) T3(en, es, pt string) string {
	switch s.lang {
	case "es", "both":
		return es
	case "pt":
		return pt
	}
	return en
}
