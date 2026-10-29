package main

// The designs' relative and standings (ovtheme.go): the class colours of our palette, the standings grouped by class
// under a band with its car count and SOF, and the cars out of the race faded.

import (
	"fmt"
	"sort"
	"strconv"
)

// the classes' places in the palette, per session (drawn under ovThMu)
var ovClsCache struct {
	ses  *ovSession
	rank map[int]int
}

// classColor: a class's colour in the designs (our palette, the classes by their id, the same all session)
func (st *ovState) classColor(cls int) uint32 {
	if st.ses == nil {
		return ovClassPal[0]
	}
	if ovClsCache.ses != st.ses {
		ids := []int{}
		seen := map[int]bool{}
		for _, d := range st.ses.Drivers {
			if d != nil && !d.Skip && d.Name != "" && !seen[d.Class] {
				seen[d.Class] = true
				ids = append(ids, d.Class)
			}
		}
		sort.Ints(ids)
		ovClsCache.ses, ovClsCache.rank = st.ses, map[int]int{}
		for i, id := range ids {
			ovClsCache.rank[id] = i
		}
	}
	return ovClassPal[ovClsCache.rank[cls]%len(ovClassPal)]
}

// outOfRace: the car is not in the world (iRacing's CarIdxTrackSurface −1: gone to the garage or disconnected)
func (st *ovState) outOfRace(idx int) bool {
	s := st.arr("CarIdxTrackSurface")
	return idx >= 0 && idx < len(s) && s[idx] == -1
}

// classInfo: a class's short name, its cars and its strength of field
func (st *ovState) classInfo(cls int) (string, int, int) {
	name, n := "", 0
	var irs []int
	for _, d := range st.ses.Drivers {
		if d == nil || d.Skip || d.Name == "" || d.Class != cls {
			continue
		}
		n++
		if name == "" {
			name = firstNonEmpty(d.ClsName, d.CarSht)
		}
		if d.IR > 0 {
			irs = append(irs, d.IR)
		}
	}
	return name, n, strengthOfField(irs)
}

// drawBand: a class's band in the designs' standings, its name in a block of its colour, its cars and its SOF
func (st *ovState) drawBand(c *ovCanvas, cls int, x, y, w, h, z float64) {
	if st.ses == nil {
		return
	}
	col := st.classColor(cls)
	name, n, sof := st.classInfo(cls)
	if name == "" {
		name = st.T3("Class", "Clase", "Classe")
	}
	cy := y + h/2 + z
	c.themeRect(x, y+h-2*z, w, 2*z, 0, col, 1)
	f, tr := ovFace(fkDisplayB, 13*z), 0.8*z
	pw := textWT(f, name, tr) + 18*z
	c.themeRect(x, cy-9*z, pw, 18*z, 3*z, col, 1)
	t := ovTh
	if t != nil {
		t.raw = true
	}
	c.textT(f, name, x+pw/2, cy, 0x0b0e14, 1, 2, tr)
	if t != nil {
		t.raw = false
	}
	sf := ovFace(fkDisplay, 13*z)
	c.text(sf, fmt.Sprintf("%d %s", n, st.T3("cars", "coches", "carros")), x+pw+10*z, cy, colMuted, 1, 0)
	if sof > 0 {
		c.textT(ovFace(fkDisplayB, 13*z), "SOF "+strconv.Itoa(sof), x+w-6*z, cy, col, 1, 1, 0.6*z)
	}
}
