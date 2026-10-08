package main

// The tags of your driver notes (drivers.go) in the native relative and standings: a small icon before the
// name, the same as the app's. Danger is a red triangle, careful an amber circle, clean a green one with a
// tick, friend a blue one with a star.

import (
	"math"
	"strings"
	"time"
)

const tagSize = 14.0

var tagColor = map[string]uint32{"danger": 0xff5b5b, "careful": 0xffb02e, "clean": 0x38c97c, "friend": 0x4c9bff}

// rowTag: your tag on the driver of a car, "" when none (st.mu is held)
func (st *ovState) rowTag(idx int) string {
	if st.ses == nil {
		return ""
	}
	if time.Since(st.ext.notesAt) > 15*time.Second {
		st.ext.notesAt = time.Now()
		go func() {
			var m struct {
				Drivers map[string]*driverNote `json:"drivers"`
			}
			if st.fetchJSON("/api/drivers", &m) {
				st.mu.Lock()
				st.ext.notes = m.Drivers
				st.mu.Unlock()
			}
		}()
	}
	d := st.ses.Drivers[idx]
	if d == nil || len(st.ext.notes) == 0 {
		return ""
	}
	if n := st.ext.notes[driverKey(d.UID)]; n != nil {
		return n.Tag
	}
	if n := st.ext.notes[nameKey(d.Name)]; n != nil {
		return n.Tag
	}
	return ""
}

// tri fills a triangle, smoothed with 4×4 samples per pixel
func (c *ovCanvas) tri(x0, y0, x1, y1, x2, y2 float64, col uint32, a float64) {
	minX, maxX := math.Floor(math.Min(x0, math.Min(x1, x2))), math.Ceil(math.Max(x0, math.Max(x1, x2)))
	minY, maxY := math.Floor(math.Min(y0, math.Min(y1, y2))), math.Ceil(math.Max(y0, math.Max(y1, y2)))
	edge := func(ax, ay, bx, by, px, py float64) float64 { return (bx-ax)*(py-ay) - (by-ay)*(px-ax) }
	area := edge(x0, y0, x1, y1, x2, y2)
	if area == 0 {
		return
	}
	for y := minY; y < maxY; y++ {
		for x := minX; x < maxX; x++ {
			n := 0
			for sy := 0; sy < 4; sy++ {
				for sx := 0; sx < 4; sx++ {
					px, py := x+(float64(sx)+0.5)/4, y+(float64(sy)+0.5)/4
					w0, w1, w2 := edge(x1, y1, x2, y2, px, py), edge(x2, y2, x0, y0, px, py), edge(x0, y0, x1, y1, px, py)
					if (area > 0 && w0 >= 0 && w1 >= 0 && w2 >= 0) || (area < 0 && w0 <= 0 && w1 <= 0 && w2 <= 0) {
						n++
					}
				}
			}
			if n > 0 {
				c.blend(int(x), int(y), col, a*float64(n)/16)
			}
		}
	}
}

// drawDriverTag draws the icon of a tag centred on cx, cy
func drawDriverTag(c *ovCanvas, tag string, cx, cy, z, a float64) {
	col, ok := tagColor[tag]
	if !ok {
		return
	}
	r := tagSize * z / 2
	switch tag {
	case "danger":
		c.tri(cx, cy-r*1.02, cx+r*1.1, cy+r*0.86, cx-r*1.1, cy+r*0.86, col, a)
		c.line(cx, cy-r*0.38, cx, cy+r*0.22, 1.7*z, 0xffffff, a)
		c.disc(cx, cy+r*0.56, 1.05*z, 0xffffff, a)
	case "careful":
		c.disc(cx, cy, r, col, a)
		c.line(cx, cy-r*0.5, cx, cy+r*0.12, 1.7*z, 0x14171c, a)
		c.disc(cx, cy+r*0.5, 1.05*z, 0x14171c, a)
	case "clean":
		c.disc(cx, cy, r, col, a)
		c.line(cx-r*0.45, cy+r*0.02, cx-r*0.1, cy+r*0.38, 1.6*z, 0xffffff, a)
		c.line(cx-r*0.1, cy+r*0.38, cx+r*0.5, cy-r*0.36, 1.6*z, 0xffffff, a)
	case "friend":
		c.disc(cx, cy, r, col, a)
		// a five-pointed star: the centre and its ten corners
		var px, py [10]float64
		for i := 0; i < 10; i++ {
			rr := r * 0.62
			if i%2 == 1 {
				rr = r * 0.26
			}
			ang := -math.Pi/2 + float64(i)*math.Pi/5
			px[i], py[i] = cx+rr*math.Cos(ang), cy+rr*math.Sin(ang)
		}
		for i := 0; i < 10; i++ {
			j := (i + 1) % 10
			c.tri(cx, cy, px[i], py[i], px[j], py[j], 0xffffff, a)
		}
	}
}

// driverAt: the driver of a car in this session, nil when unknown
func (st *ovState) driverAt(idx int) *ovDriver {
	if st.ses == nil {
		return nil
	}
	return st.ses.Drivers[idx]
}

// inRace: the current session is a race (lap counts against you only mean something there)
func (st *ovState) inRace() bool {
	if st.ses == nil {
		return false
	}
	sn, ok := st.num("SessionNum")
	if !ok {
		return false
	}
	return strings.EqualFold(st.ses.Sessions[int(sn)].Type, "Race")
}
