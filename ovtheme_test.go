package main

import (
	"encoding/json"
	"fmt"
	"image"
	"image/color"
	"image/png"
	"os"
	"path/filepath"
	"strings"
	"testing"
	"time"
)

// a race of three classes with their drivers' flairs, for the designs' pictures
var styleNames = []string{"Matthew Naylor", "Sindre Setsaas", "Samuel Libeert", "Renan Azeredo", "Rick Zwieten", "Alexandr Fescov",
	"Preston Perlmutter", "Lucía Romero", "Jonas Weber", "Marco Bellini", "Tom Hartley", "Hugo Lambert", "Kenji Sato", "Ana Ribeiro",
	"Liam O'Connor", "Mateo García", "Elias Berg", "Noah Smith", "Pablo Ruiz", "Ines Costa", "Oskar Nowak", "Finn Meyer", "Luca Rossi", "Sam Carter"}
var styleFlairs = []string{"United States", "Norway", "Belgium", "Brazil", "Netherlands", "Russia", "United States", "Spain", "Germany", "Italy",
	"United Kingdom", "France", "Japan", "Portugal", "Ireland", "Spain", "Sweden", "Australia", "Argentina", "Portugal", "Poland", "Scotland", "Italy", "Canada"}

func styleYAML() string {
	var b strings.Builder
	b.WriteString("WeekendInfo:\n TrackDisplayName: Bench Park\n TrackID: 9\n TrackLength: 4.00 km\n WeekendOptions:\n  IncidentLimit: 17\n")
	b.WriteString("SessionInfo:\n Sessions:\n - SessionNum: 0\n   SessionType: Race\n   SessionName: RACE\n   ResultsPositions:\n")
	b.WriteString("DriverInfo:\n DriverCarIdx: 0\n Drivers:\n")
	cls := []string{"LMP2", "GTE", "GT3"}
	for i := 0; i < ovBenchCars; i++ {
		c := []int{2, 0, 1}[i%3]
		fmt.Fprintf(&b, " - CarIdx: %d\n   UserName: %s\n   CarNumber: \"%d\"\n   IRating: %d\n   LicString: B 3.%02d\n   CarClassID: %d\n   CarClassShortName: %s\n   FlairName: %s\n   CurDriverIncidentCount: %d\n",
			i, styleNames[i], i+2, 1500+i*190, i, 10+c, cls[c], styleFlairs[i], i%5)
	}
	fmt.Fprintf(&b, " - CarIdx: %d\n   UserName: Pace Car\n   CarIsPaceCar: 1\n   CarClassID: 11\n", ovBenchCars)
	return b.String()
}

func styleState(t testing.TB, style string) *ovState {
	st := ovBenchState(t)
	car := st.ses.Car
	st.ses = parseOvSession(styleYAML())
	st.ses.Car = car
	set := func(k string, v any) {
		b, _ := json.Marshal(v)
		st.frame[k] = b
	}
	n := ovBenchCars + 1
	fl, surf := make([]float64, n), make([]float64, n)
	for i := range surf {
		surf[i] = 3
	}
	fl[3], fl[6] = irFlagBlack, irFlagFurled
	surf[9] = -1
	cp, seen := make([]float64, n), map[int]int{}
	for i := 0; i < ovBenchCars; i++ { // the class places, in the order of the race
		seen[i%3]++
		cp[i] = float64(seen[i%3])
	}
	cp[ovBenchCars] = -1
	set("CarIdxClassPosition", cp)
	set("CarIdxSessionFlags", fl)
	set("CarIdxTrackSurface", surf)
	st.ui = map[string]any{"ovstyle": style, "std": map[string]any{"myClass": false, "top": 12.0}}
	return st
}

// every overlay draws in every design: nothing breaks and its height stays sane
func TestOverlayStylesDraw(t *testing.T) {
	dir := os.Getenv("OV_STYLE_DIR")
	for _, style := range ovStyles {
		for _, name := range overlayOrder {
			st := styleState(t, style)
			w := int(ovDesign[name])
			c := newCanvas(w, 1000)
			st.at = time.Now()
			h := ovDraw(name, c, st, st.at)
			if name != "radar" && name != "map" && name != "gg" && (h < 20 || h > 1000) {
				t.Errorf("%s in %s: height %d", name, style, h)
			}
			if ovTh != nil {
				t.Fatalf("the design stays set after a draw")
			}
			if dir != "" {
				if h <= 0 {
					h = 300
				}
				saveStylePNG(t, c, h, filepath.Join(dir, style+"-"+name+".png"))
			}
		}
	}
}

// a design changes the picture, Classic chosen is the picture with nothing chosen, and an overlay's own design wins
func TestOverlayStyleChoice(t *testing.T) {
	draw := func(ui map[string]any) []uint32 {
		st := styleState(t, "classic")
		st.ui = ui
		c := newCanvas(600, 600)
		st.at = time.Now()
		ovDraw("relative", c, st, st.at)
		return c.px
	}
	plain, def := draw(map[string]any{}), draw(map[string]any{"ovstyle": ovDefaultStyle})
	if !samePixels(plain, def) {
		t.Fatal("nothing chosen is not the default design")
	}
	for _, s := range ovStyles {
		if s != ovDefaultStyle && samePixels(plain, draw(map[string]any{"ovstyle": s})) {
			t.Errorf("%s draws the default design's picture", s)
		}
	}
	if !samePixels(draw(map[string]any{"ovstyle": "lane", "relative": map[string]any{"style": "board"}}), draw(map[string]any{"ovstyle": "board"})) {
		t.Error("the overlay's own design does not win")
	}
	if !samePixels(draw(map[string]any{"ovstyle": "lane", "relative": map[string]any{"style": ""}}), draw(map[string]any{"ovstyle": "lane"})) {
		t.Error("an empty design does not follow the one for all")
	}
	if ovStyleOf("relative", map[string]any{"ovstyle": "glass"}) != ovDefaultStyle || ovStyleOf("relative", map[string]any{"ovstyle": "light", "relative": map[string]any{"style": "classic"}}) != "classic" {
		t.Error("an unknown design or Classic for one overlay")
	}
}

func TestFlairAndFlags(t *testing.T) {
	for in, want := range map[string]string{"Spain": "es", "United States": "us", "Brazil": "br", "ES": "es", "Türkiye": "tr", "Turkey": "tr",
		"Scotland": "gb-sct", "Korea, Republic of": "kr", "Côte d'Ivoire": "ci", "Pride": "", "": "", "None": ""} {
		if got := flagCode(in); got != want {
			t.Errorf("flagCode(%q) = %q, want %q", in, got, want)
		}
	}
	s := parseOvSession("DriverInfo:\n DriverCarIdx: 0\n Drivers:\n - CarIdx: 0\n   UserName: A B\n   FlairName: Spain\n   FlairID: 207\n - CarIdx: 1\n   UserName: C D\n   FlairName: Pride\n - CarIdx: 2\n   UserName: E F\n   CarClassShortName: GT3\n")
	if s.Drivers[0].Flag != "es" || s.Drivers[1].Flag != "" || s.Drivers[2].Flag != "" || s.Drivers[2].ClsName != "GT3" {
		t.Fatalf("drivers %+v %+v %+v", s.Drivers[0], s.Drivers[1], s.Drivers[2])
	}
	if p := flagPix("es", 12); p == nil || p.w != 16 || p.h != 12 {
		t.Fatal("the flag's picture")
	}
	y := "DriverInfo:\n DriverCarIdx: 0\n Drivers:\n - CarIdx: 0\n   UserName: A B\n   FlairName: Brazil\n - CarIdx: 1\n   UserName: C D\n" +
		"SessionInfo:\n Sessions:\n - SessionNum: 0\n   ResultsPositions:\n   - Position: 1\n     ClassPosition: 0\n     CarIdx: 0\n     LapsComplete: 3\n   - Position: 2\n     ClassPosition: 1\n     CarIdx: 1\n     LapsComplete: 3\n   ResultsFastestLap:\n"
	r := sessionResults(y, 0)
	if len(r) != 2 || r[0].CC != "br" || r[0].Flair != "Brazil" || r[1].CC != "" {
		t.Fatalf("results %+v", r)
	}
}

func TestPenaltyClock(t *testing.T) {
	st := newOvState("en")
	set := func(k string, v any) {
		b, _ := json.Marshal(v)
		st.frame[k] = b
	}
	set("CarIdxSessionFlags", []float64{0, irFlagBlack, irFlagFurled, 0x4, -1})
	for i, want := range []bool{false, true, true, false, false} {
		if st.penalty(i) != want {
			t.Errorf("iRacing car %d: penalty %v", i, !want)
		}
	}
	st = newOvState("en")
	b, _ := json.Marshal([]float64{0, 2, -1})
	st.frame["CarIdxNumPenalties"] = b
	if st.penalty(0) || !st.penalty(1) || st.penalty(2) {
		t.Error("Le Mans Ultimate's penalties")
	}
}

// saveStylePNG: the overlay over a game-like scene (a sky, the track, the kerbs), to look at the designs
func saveStylePNG(t *testing.T, c *ovCanvas, h int, path string) {
	img := image.NewRGBA(image.Rect(0, 0, c.w, h))
	for y := 0; y < h; y++ {
		f := float64(y) / float64(h)
		for x := 0; x < c.w; x++ {
			bg := [3]float64{150 - 90*f, 170 - 110*f, 190 - 140*f}
			if (x/40+y/40)%2 == 0 && f > 0.5 {
				bg = [3]float64{bg[0] + 40, bg[1] + 40, bg[2] + 40}
			}
			p := c.px[y*c.w+x]
			a := float64(p>>24) / 255
			mix := func(v uint32, b float64) uint8 { return uint8(min(255, float64(v&0xff)+b*(1-a))) }
			img.Set(x, y, color.RGBA{mix(p>>16, bg[0]), mix(p>>8, bg[1]), mix(p, bg[2]), 255})
		}
	}
	f, err := os.Create(path)
	if err != nil {
		t.Fatal(err)
	}
	defer f.Close()
	png.Encode(f, img)
}

// at the highest opacity a design's panel hides the game: the window's alpha alone makes it see-through (the owner saw
// the game through the Beta panels at 255). Frameless has no panel by design.
func TestOverlayStylesOpaque(t *testing.T) {
	for _, style := range ovStyles {
		if style == "classic" || style == "frameless" {
			continue
		}
		for _, name := range []string{"relative", "standings", "fuel", "inputs"} {
			st := styleState(t, style)
			w := int(ovDesign[name])
			c := newCanvas(w, 1000)
			st.at = time.Now()
			h := ovDraw(name, c, st, st.at)
			if h <= 20 {
				continue
			}
			for _, y := range []int{h / 2, h - 6} {
				for _, x := range []int{4, w / 2, w - 5} {
					if a := c.px[y*w+x] >> 24; a != 255 {
						t.Errorf("%s in %s: alpha %d at %d,%d", name, style, a, x, y)
					}
				}
			}
		}
	}
}
