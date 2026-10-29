package main

import (
	"encoding/json"
	"testing"
	"time"
)

// every overlay's own settings (beyond its title and opacity), each value the Configure window offers: the ui key
// they live under and the values tried
var ovOptionCases = map[string]struct {
	key  string
	opts []map[string]any
}{
	"relative":  {"rel", []map[string]any{{"classHead": true}, {"dimLapped": true}, {"rowSize": "s"}, {"rowSize": "l"}, {"notes": false}}},
	"standings": {"std", []map[string]any{{"classHead": true}, {"classHead": true, "myClass": false}, {"irShort": false}, {"fastMark": false}, {"pitTag": false}}},
	"deltabar":  {"deltabar", []map[string]any{{"barOnly": true}, {"trend": false}}},
	"timing":    {"timing", []map[string]any{{"sectors": false}, {"lastBest": false}, {"flash": false}}},
	"inputs":    {"inp", []map[string]any{{"lineW": 0.6}, {"lineW": 1.6}}},
	"radar":     {"radar", []map[string]any{{"carSize": 0.8}, {"carSize": 1.25}, {"trails": false}, {"dist": false}}},
	"coach":     {"coach", []map[string]any{{"mode": "text"}}},
	"pit":       {"pit", []map[string]any{{"limTol": 0.0}, {"limTol": 1.4}, {"pitOnly": true}}},
	"gaps":      {"gaps", []map[string]any{{"numbers": true}}},
	"trackbar":  {"trackbar", []map[string]any{{"lineOnly": true}, {"height": "s"}, {"height": "l"}, {"near": false}, {"sectors": false}, {"myClass": true}}},
	"dash":      {"dash", []map[string]any{{"shift": false}, {"strip": []any{}}, {"strip": []any{"lap", "delta"}}, {"spdUnit": "kmh"}, {"spdUnit": "mph"}}},
	"fuel":      {"fuel", []map[string]any{{"show": []any{"laps"}}, {"show": []any{}}, {"show": []any{"finish", "last"}}, {"spare": 1.0}, {"spare": 0.0}}},
	"tyres":     {"tyres", []map[string]any{{"press": false}, {"wear": false}, {"avgOnly": true}}},
	"weather":   {"weather", []map[string]any{{"show": []any{"wind", "clock"}}, {"show": []any{"air", "wet"}}, {"show": []any{}}, {"trend": false}}},
	"flag":      {"flag", []map[string]any{{"lights": false}, {"kinds": []any{"blue"}}, {"kinds": []any{}}}},
	"map":       {"map", []map[string]any{{"turns": false}, {"sectors": false}, {"myClass": true}, {"width": 0.7}, {"width": 1.4}}},
	"engine":    {"engine", []map[string]any{{"rows": []any{"water", "oil"}}, {"rows": []any{}}, {"badges": false}}},
	"incidents": {"incidents", []map[string]any{{"list": false}}},
	"brakes":    {"brakes", []map[string]any{{"speeds": false}, {"fb": false}}},
	"sectors":   {"sectors", []map[string]any{{"last": false}, {"legend": false}}},
	"stats":     {"stats", []map[string]any{{"rows": []any{"full", "top"}}, {"rows": []any{}}, {"slipNow": false}}},
	"compare":   {"cmp", []map[string]any{{"last": false}}},
	"gg":        {"gg", []map[string]any{{"trail": "s"}, {"trail": "l"}, {"peaks": false}}},
	"system":    {"system", []map[string]any{{"show": []any{"fps"}}, {"show": []any{"net"}}, {"show": []any{}}}},
}

// the defaults these settings have: written out, they draw exactly what no setting draws
var ovOptionDefaults = map[string]map[string]any{
	"rel":       {"classHead": false, "dimLapped": false, "rowSize": "m", "notes": true},
	"std":       {"classHead": false, "irShort": true, "fastMark": true, "pitTag": true},
	"deltabar":  {"barOnly": false, "trend": true},
	"timing":    {"sectors": true, "lastBest": true, "flash": true},
	"inp":       {"lineW": 1.0},
	"radar":     {"carSize": 1.0, "trails": true, "dist": true},
	"pit":       {"limTol": 0.4, "pitOnly": false},
	"gaps":      {"numbers": false},
	"trackbar":  {"lineOnly": false, "height": "m", "near": true, "sectors": true, "myClass": false},
	"dash":      {"shift": true, "strip": []any{"lap", "pos", "delta", "inc"}, "spdUnit": "app"},
	"fuel":      {"show": []any{"tank", "laps", "per", "finish", "last"}},
	"tyres":     {"press": true, "wear": true, "avgOnly": false},
	"weather":   {"show": []any{"track", "air", "wind", "sky", "rain", "wet", "clock"}, "trend": true},
	"flag":      {"lights": true, "kinds": []any{"black", "red", "checkered", "white", "yellow", "blue", "info", "green"}},
	"map":       {"turns": true, "sectors": true, "myClass": false, "width": 1.0},
	"engine":    {"rows": []any{"water", "oil", "oilp", "fuelp", "volt", "air", "track"}, "badges": true},
	"incidents": {"list": true},
	"brakes":    {"speeds": true, "fb": true},
	"sectors":   {"last": true, "legend": true},
	"stats":     {"rows": []any{"full", "brk", "coast", "shifts", "top", "slip"}, "slipNow": true},
	"cmp":       {"last": true},
	"gg":        {"trail": "m", "peaks": true},
	"system":    {"show": []any{"fps", "graph", "gpu", "cpu", "net"}},
}

// TestOverlayOptionsDraw: every overlay draws with each of its own settings, the text sizes and hiding by itself,
// without a panic, and the window never needs more height than it can get
func TestOverlayOptionsDraw(t *testing.T) {
	now := time.Unix(1700000000, 0)
	for _, name := range overlayOrder {
		cs := ovOptionCases[name]
		var all []map[string]any
		for _, o := range cs.opts {
			all = append(all, map[string]any{cs.key: o})
		}
		for _, ts := range []float64{0.85, 1.2} {
			all = append(all, map[string]any{name: map[string]any{"textScale": ts}})
		}
		for _, hm := range []string{"car", "pits"} {
			all = append(all, map[string]any{name: map[string]any{"hide": hm}})
		}
		states := []*ovState{ovTestState(t, nil), ovBenchState(t)} // one of each for all the draws: quicker
		for _, ui := range all {
			for _, st := range states {
				for _, edit := range []bool{false, true} {
					st.ui, st.edit = ui, edit
					c := newCanvas(int(ovDesign[name]), 900)
					st.at = now
					func() {
						defer func() {
							if r := recover(); r != nil {
								b, _ := json.Marshal(ui)
								t.Errorf("%s with %s: %v", name, b, r)
							}
						}()
						ovDraw(name, c, st, now)
					}()
				}
			}
		}
	}
}

// TestOverlayOptionDefaults: the defaults written out draw the same pixels as no settings at all
func TestOverlayOptionDefaults(t *testing.T) {
	now := time.Unix(1700000000, 0)
	for _, name := range overlayOrder {
		ui := map[string]any{name: map[string]any{"textScale": 1.0, "hide": ""}}
		if k := ovOptionCases[name].key; k != "" && ovOptionDefaults[k] != nil {
			if k == name {
				m := map[string]any{"textScale": 1.0, "hide": ""}
				for kk, v := range ovOptionDefaults[k] {
					m[kk] = v
				}
				ui[name] = m
			} else {
				ui[k] = ovOptionDefaults[k]
			}
		}
		for _, bench := range []bool{false, true} {
			draw := func(ui map[string]any) (int, []uint32) {
				st := ovTestState(t, ui)
				if bench {
					st = ovBenchState(t)
					if ui != nil {
						st.ui = ui
					}
				}
				c := newCanvas(int(ovDesign[name]), 900)
				st.at = now
				return ovDraw(name, c, st, now), c.px
			}
			h0, p0 := draw(nil)
			h1, p1 := draw(ui)
			if h0 != h1 || !samePixels(p0, p1) {
				t.Errorf("%s (bench %v): its defaults written out draw differently", name, bench)
			}
		}
	}
}

// TestOverlayTextScaleAndHide: a larger text makes an overlay that fits its content taller, and hidden by itself out
// of the car it draws nothing (but always while the overlays are being moved)
func TestOverlayTextScaleAndHide(t *testing.T) {
	now := time.Unix(1700000000, 0)
	for _, name := range []string{"fuel", "relative", "timing", "engine", "deltabar"} {
		h := func(ts float64) int {
			st := ovBenchState(t)
			st.ui = map[string]any{name: map[string]any{"textScale": ts}}
			st.at = now
			return ovDraw(name, newCanvas(int(ovDesign[name]), 1200), st, now)
		}
		if a, b := h(1), h(1.2); b <= a {
			t.Errorf("%s: %d high with large text, %d normal", name, b, a)
		}
	}
	for _, edit := range []bool{false, true} {
		st := ovBenchState(t)
		st.ui = map[string]any{"fuel": map[string]any{"hide": "car"}}
		st.frame["IsOnTrack"] = json.RawMessage("false")
		st.edit = edit
		st.at = now
		c := newCanvas(420, 400)
		ovDraw("fuel", c, st, now)
		empty := true
		for _, p := range c.px {
			if p != 0 {
				empty = false
				break
			}
		}
		if empty != !edit {
			t.Errorf("fuel hidden out of the car, edit %v: empty %v", edit, empty)
		}
	}
	st := ovBenchState(t)
	st.ui = map[string]any{"fuel": map[string]any{"hide": "pits"}}
	if v := ovVars("fuel", st); v[2] != "OnPitRoad" {
		t.Errorf("an overlay hiding in the pits asks for OnPitRoad: %v", v)
	}
}

// TestOverlayClassHeads: with several classes the standings put each class under its header (its cars and strength
// of field) and the relative shows the classes' band; with one class nothing changes
func TestOverlayClassHeads(t *testing.T) {
	now := time.Unix(1700000000, 0)
	multi := func() *ovState {
		st := ovBenchState(t)
		for i, d := range st.ses.Drivers {
			if !d.Skip && i%2 == 1 {
				d.Class, d.ClsName, d.ClassCol = 2, "GTP", 0xff6fb5
			}
		}
		return st
	}
	st := multi()
	rows := st.tableRows(false, map[string]any{"classHead": true, "myClass": false, "top": 3.0, "around": 1.0}, 0)
	heads := 0
	for _, r := range rows {
		if r.band {
			heads++
		}
	}
	if heads != 2 {
		t.Errorf("two classes, %d headers", heads)
	}
	for _, tc := range []struct {
		name, key string
		cfg       map[string]any
	}{{"standings", "std", map[string]any{"classHead": true, "myClass": false}}, {"relative", "rel", map[string]any{"classHead": true}}} {
		draw := func(cfg map[string]any) (int, []uint32) {
			st := multi()
			st.ui = map[string]any{"ovstyle": "classic", tc.key: cfg} // Classic: the Beta designs band the classes anyway
			c := newCanvas(int(ovDesign[tc.name]), 900)
			st.at = now
			return ovDraw(tc.name, c, st, now), c.px
		}
		h0, p0 := draw(map[string]any{"myClass": false})
		h1, p1 := draw(tc.cfg)
		if h1 <= h0 || samePixels(p0, p1) {
			t.Errorf("%s: the class headers changed nothing (%d → %d)", tc.name, h0, h1)
		}
	}
}
