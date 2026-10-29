package main

import (
	"sort"
	"strconv"
)

// What every overlay's own settings can change beyond its title and opacity (ui.<overlay>.…, set in the overlay's
// Configure window): the text size and hiding by itself where it adds nothing, plus the small helpers the overlays'
// content options use. With none of them set every overlay draws exactly as before.

// textScale: the overlay's text size (ui.<overlay>.textScale: 0.85 small, 1 normal, 1.2 large), which scales its
// whole drawing; anything else is normal
func (s *ovState) textScale(name string) float64 {
	m, _ := s.ui[name].(map[string]any)
	if v, ok := m["textScale"].(float64); ok && v >= 0.8 && v <= 1.3 {
		return v
	}
	return 1
}

// hideMode: when the overlay hides by itself (ui.<overlay>.hide): "car" out of the car (the garage, the menus, no
// game), "pits" that and on the pit road too; "" never
func (s *ovState) hideMode(name string) string {
	m, _ := s.ui[name].(map[string]any)
	switch v, _ := m["hide"].(string); v {
	case "car", "pits":
		return v
	}
	return ""
}

// autoHidden: the overlay hides itself now (nothing on the screen, like the radar with nobody near); never while the
// overlays are being moved. st.mu is held
func (s *ovState) autoHidden(name string) bool {
	if s.edit {
		return false
	}
	h := s.hideMode(name)
	if h == "" {
		return false
	}
	if on, known := s.num("IsOnTrack"); !known || on == 0 {
		return true
	}
	if h == "pits" {
		if p, _ := s.num("OnPitRoad"); p != 0 {
			return true
		}
	}
	return false
}

// wantsPitRoad: the overlay needs OnPitRoad for hiding on the pit road
func (s *ovState) wantsPitRoad(name string) bool {
	s.mu.Lock()
	defer s.mu.Unlock()
	return s.hideMode(name) == "pits"
}

// uiHas: whether a list setting holds a value
func uiHas(list []string, v string) bool {
	for _, x := range list {
		if x == v {
			return true
		}
	}
	return false
}

// uiPick: one of a few numbers for a setting (sizes, widths), the default for anything else
func uiPick(m map[string]any, k string, def float64, allowed ...float64) float64 {
	v, ok := m[k].(float64)
	if !ok {
		return def
	}
	for _, a := range allowed {
		if v == a {
			return v
		}
	}
	return def
}

// sizeOf: a small / normal / large setting ("s", "m", "l") as a factor
func sizeOf(m map[string]any, k string, s, l float64) float64 {
	switch uiStr(m, k, "m") {
	case "s":
		return s
	case "l":
		return l
	}
	return 1
}

// ovClass: one class of the session, for the class headers of the relative and the standings
type ovClass struct {
	id, n, sof int
	name       string
	col        uint32
}

// clsInfo: a class's name (the game's short name, else its first car's), colour, cars and strength of field
func (st *ovState) clsInfo(id int) ovClass {
	k := ovClass{id: id}
	var irs []int
	if st.ses == nil {
		return k
	}
	for _, d := range st.ses.Drivers {
		if d == nil || d.Skip || d.Name == "" || d.Class != id {
			continue
		}
		k.n++
		if d.IR > 0 {
			irs = append(irs, d.IR)
		}
		if k.name == "" || (d.ClsName != "" && k.name == d.CarSht) {
			k.name = firstNonEmpty(d.ClsName, d.CarSht)
		}
		if k.col == 0 {
			k.col = classColor(st, d)
		}
	}
	k.sof = strengthOfField(irs)
	return k
}

// classOrder: the session's classes, the one with the race leader first
func (st *ovState) classOrder() []int {
	if st.ses == nil {
		return nil
	}
	pos := st.arr("CarIdxPosition")
	best := map[int]float64{}
	var order []int
	for _, d := range st.ses.Drivers {
		if d == nil || d.Skip || d.Name == "" {
			continue
		}
		p := 999.0
		if d.Idx < len(pos) && pos[d.Idx] > 0 {
			p = pos[d.Idx]
		}
		if b, ok := best[d.Class]; !ok {
			order = append(order, d.Class)
			best[d.Class] = p
		} else if p < b {
			best[d.Class] = p
		}
	}
	sort.Slice(order, func(a, b int) bool {
		if best[order[a]] != best[order[b]] {
			return best[order[a]] < best[order[b]]
		}
		return order[a] < order[b]
	})
	return order
}

// classHeadText: "GT3 · 14 cars · SOF 2104"
func (st *ovState) classHeadText(k ovClass) string {
	s := k.name
	if s == "" {
		s = st.T("Class", "Clase")
	}
	s += " · " + strconv.Itoa(k.n) + st.T(" cars", " coches")
	if k.sof > 0 {
		s += " · SOF " + strconv.Itoa(k.sof)
	}
	return s
}
