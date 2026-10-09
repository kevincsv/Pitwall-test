package main

import (
	"encoding/json"
	"image"
	"image/color"
	"image/png"
	"math"
	"net/http"
	"net/http/httptest"
	"os"
	"path/filepath"
	"testing"
	"time"
)

const ovTestYAML = `WeekendInfo:
 TrackLength: 4.00 km
 WeekendOptions:
  IncidentLimit: 17
SessionInfo:
 Sessions:
 - SessionNum: 0
   SessionType: Race
   SessionName: RACE
   ResultsPositions:
QualifyResultsInfo:
 Results:
 - Position: 0
   ClassPosition: 0
   CarIdx: 1
 - Position: 1
   ClassPosition: 1
   CarIdx: 0
 - Position: 2
   ClassPosition: 2
   CarIdx: 2
DriverInfo:
 DriverCarIdx: 0
 Drivers:
 - CarIdx: 0
   UserName: Driver Zero
   CarNumber: "7"
   IRating: 2100
   LicString: B 3.20
   CarClassID: 1
   CurDriverIncidentCount: 2
 - CarIdx: 1
   UserName: Fast Rival
   CarNumber: "12"
   IRating: 3400
   LicString: A 4.10
   CarClassID: 1
 - CarIdx: 2
   UserName: Somebody Slower With A Very Long Name
   CarNumber: "3"
   IRating: 1400
   LicString: C 2.50
   CarClassID: 1
 - CarIdx: 3
   UserName: Pace Car
   CarIsPaceCar: 1
   CarClassID: 11
`

func ovTestState(t *testing.T, ui map[string]any) *ovState {
	st := newOvState("es")
	st.ses = parseOvSession(ovTestYAML)
	set := func(k string, v any) {
		b, _ := json.Marshal(v)
		st.frame[k] = b
	}
	set("PlayerCarIdx", 0)
	set("SessionNum", 0)
	set("CarIdxLapDistPct", []float64{0.5, 0.502, 0.4985, -1})
	set("CarIdxTrackSurface", []float64{3, 3, 3, -1})
	set("CarLeftRight", 1)
	set("CarIdxEstTime", []float64{45, 45.4, 44.7, 0})
	set("CarIdxLap", []float64{3, 3, 2, 0})
	set("CarIdxLapCompleted", []float64{2, 2, 1, 0})
	set("CarIdxPosition", []float64{2, 1, 3, 0})
	set("CarIdxClassPosition", []float64{2, 1, 3, 0})
	set("CarIdxF2Time", []float64{1.4, 0, 30.2, 0})
	set("CarIdxLastLapTime", []float64{91.2, 90.8, 95.5, 0})
	set("CarIdxBestLapTime", []float64{91.2, 90.5, 94.1, 0})
	set("CarIdxOnPitRoad", []bool{false, false, true, false})
	set("SessionLapsRemainEx", 12)
	set("SessionTimeRemain", 1234)
	set("PlayerCarMyIncidentCount", 2)
	set("LapDeltaToBestLap", -0.37)
	set("LapDeltaToBestLap_OK", true)
	st.at = time.Now()
	if ui != nil {
		st.ui = ui
	}
	return st
}

func ovSavePNG(t *testing.T, c *ovCanvas, h int, name string) {
	dir := os.Getenv("OV_PNG_DIR")
	if dir == "" {
		return
	}
	img := image.NewRGBA(image.Rect(0, 0, c.w, h))
	for y := 0; y < h; y++ {
		for x := 0; x < c.w; x++ {
			p := c.px[y*c.w+x]
			a := float64(p>>24) / 255
			// over a light grey "game", to see what is see-through
			bg := 60.0
			mix := func(v uint32) uint8 { return uint8(float64(v&0xff) + bg*(1-a)) }
			img.Set(x, y, color.RGBA{mix(p >> 16), mix(p >> 8), mix(p), 255})
		}
	}
	f, _ := os.Create(filepath.Join(dir, name+".png"))
	defer f.Close()
	png.Encode(f, img)
}

func TestNativeOverlaysDraw(t *testing.T) {
	for _, tc := range []struct {
		name string
		w    int
	}{{"radar", 260}, {"deltabar", 520}, {"relative", 600}, {"standings", 720}, {"relative", 360}} {
		st := ovTestState(t, nil)
		ch := 900
		if tc.name == "radar" {
			ch = 300
		}
		c := newCanvas(tc.w, ch)
		h := ovDraw(tc.name, c, st, time.Now())
		painted := 0
		for _, p := range c.px {
			if p>>24 > 0 {
				painted++
			}
		}
		if painted == 0 {
			t.Fatalf("%s drew nothing", tc.name)
		}
		if tc.name != "radar" && (h < 40 || h > 600) {
			t.Fatalf("%s needs a height of %d", tc.name, h)
		}
		if tc.name == "radar" {
			h = 300
		} else {
			// below the content nothing is drawn: the window fits it
			for y := h + 1; y < c.h; y++ {
				for x := 0; x < c.w; x++ {
					if c.px[y*c.w+x]>>24 > 0 {
						t.Fatalf("%s draws below its height %d (row %d)", tc.name, h, y)
					}
				}
			}
		}
		ovSavePNG(t, c, h, tc.name+"-"+itoa(tc.w))
	}
}

func TestNativeOverlayEditFrame(t *testing.T) {
	st := ovTestState(t, nil)
	st.edit = true
	c := newCanvas(600, 400)
	h := ovDraw("relative", c, st, time.Now())
	if p := c.px[(h-3)*c.w+c.w/2]; p>>24 == 0 {
		t.Fatal("no frame at the bottom of the content while moving the overlays")
	}
	ovSavePNG(t, c, h, "relative-edit")
}

func TestNativeRelativeKeepsRows(t *testing.T) {
	st := ovTestState(t, map[string]any{"rel": map[string]any{"ahead": 4.0, "behind": 2.0}})
	rows := st.tableRows(true, st.uiMap("rel"), 0)
	if len(rows) != 7 {
		t.Fatalf("relative has %d rows, want 4 ahead + you + 2 behind", len(rows))
	}
	if rows[4].idx != 0 || rows[4].blank {
		t.Fatalf("you are not in the middle: %+v", rows)
	}
	if !rows[0].blank || rows[3].idx != 1 || rows[5].idx != 2 || !rows[6].blank {
		t.Fatalf("rows out of order: %+v", rows)
	}
}

func TestNativeOverlayLanguageAndSession(t *testing.T) {
	st := ovTestState(t, nil)
	if l, _, _ := st.item("lapsleft"); l != "Vueltas restantes" {
		t.Fatalf("label in Spanish: %q", l)
	}
	if st.ses.TrackLen != 4000 || st.ses.IncLimit != 17 || !st.ses.Drivers[3].Skip || st.ses.Grid[1][0] != 1 {
		t.Fatalf("session read wrong: %+v grid %v", st.ses, st.ses.Grid)
	}
	if langFromURL("http://127.0.0.2:8484/?overlay=relative&lang=es&lt=x") != "es" {
		t.Fatal("language from the address")
	}
	ir := st.irEstimates()
	if len(ir) != 3 || ir[1] <= ir[2] {
		t.Fatalf("iRating estimates: %v", ir)
	}
}

func TestNativeGaugesDraw(t *testing.T) {
	st := ovTestState(t, nil)
	set := func(k string, v any) {
		b, _ := json.Marshal(v)
		st.frame[k] = b
	}
	for k, v := range map[string]any{"SessionFlags": 0x8, "Gear": 4, "Speed": 52.3, "RPM": 7350, "Throttle": 0.86, "Brake": 0.0, "Clutch": 1.0, "dcBrakeBias": 54.5,
		"dcTractionControl": 3, "dcTractionControlMax": 12, "dcABS": 2, "dcABSMax": 9, "LapCurrentLapTime": 43.2, "LapBestLapTime": 90.512, "LapLastLapTime": 91.004, "LapDistPct": 0.46,
		"FuelLevel": 31.7, "FuelLevelPct": 0.6, "LapCompleted": 2, "WaterTemp": 88.4, "OilTemp": 101.2, "OilPress": 4.52, "Voltage": 13.8, "AirTemp": 21, "TrackTempCrew": 33,
		"SteeringWheelAngle": -0.6, "BrakeABSactive": true, "DRS_Status": 2, "P2P_Count": 120, "P2P_Status": false, "LatAccel": 12.1, "LongAccel": -6.3, "YawRate": 0.31,
		"FuelUsePerHour": 52.1, "LFtempCL": 82, "LFtempCM": 86, "LFtempCR": 90, "RFtempCL": 96, "RFtempCM": 101, "RFtempCR": 99, "LRtempCM": 70, "RRtempCM": 79,
		"LFwearM": 0.97, "RFwearM": 0.94, "LRwearM": 0.99, "RRwearM": 0.98} {
		set(k, v)
	}
	st.ses.Car["DriverCarSLFirstRPM"], st.ses.Car["DriverCarSLShiftRPM"], st.ses.Car["DriverCarFuelMaxLtr"] = 5800, 7600, 52
	st.live.fuelUses = []float64{2.41, 2.38}
	for i := 0; i < 200; i++ { // a little history for the traces
		set("Throttle", 0.5+0.5*math.Sin(float64(i)/12))
		set("Brake", math.Max(0, -math.Sin(float64(i)/12)))
		set("LatAccel", 12*math.Sin(float64(i)/9))
		set("LongAccel", 8*math.Cos(float64(i)/9))
		st.collect()
	}
	for name, w := range ovDesign {
		if !gaugeOverlay(name) {
			continue
		}
		c := newCanvas(int(w), 900)
		h := ovDraw(name, c, st, time.Now())
		painted := 0
		for _, p := range c.px {
			if p>>24 > 0 {
				painted++
			}
		}
		if painted == 0 || h < 40 || h > 700 {
			t.Fatalf("%s: height %d, %d pixels drawn", name, h, painted)
		}
		for y := h + 1; y < c.h; y++ {
			for x := 0; x < c.w; x++ {
				if c.px[y*c.w+x]>>24 > 0 {
					t.Fatalf("%s draws below its height %d (row %d)", name, h, y)
				}
			}
		}
		ovSavePNG(t, c, h, "g-"+name)
	}
	if len(gaugeVars("tyres", st)) != 44 || gaugeVars("telemetry", st)[0] != "LatAccel" {
		t.Fatal("gauge variables")
	}
	if st.units = "imperial"; st.spdU() != "mph" || math.Abs(st.tmp(100)-212) > 1e-9 {
		t.Fatal("imperial units")
	}
}

func TestNativeSessionOverlaysDraw(t *testing.T) {
	st := ovTestState(t, nil)
	set := func(k string, v any) {
		b, _ := json.Marshal(v)
		st.frame[k] = b
	}
	set("IsOnTrack", true)
	set("FuelLevel", 18.0)
	set("PlayerCarPosition", 2)
	st.ses.Car["DriverCarEstLapTime"], st.ses.Car["DriverCarFuelMaxLtr"] = 90, 52
	st.live.fuelUses = []float64{2.4}
	set("SessionLapsRemainEx", 20)
	inc := 0
	// three laps: 90 s each, 30 frames a second
	for f := 0; f < 3*90*30; f++ {
		tt := float64(f) / 30
		lap := int(tt / 90)
		p := math.Mod(tt, 90) / 90
		set("SessionTime", tt)
		set("LapDistPct", p)
		set("LapCompleted", lap)
		set("Lap", lap+1)
		set("Throttle", math.Max(0, math.Sin(tt)))
		set("Brake", math.Max(0, -math.Sin(tt)))
		set("Gear", 3+int(tt/7)%3)
		set("Speed", 50+10*math.Sin(tt/5))
		set("VelocityX", 50.0)
		set("VelocityY", 2*math.Sin(tt))
		set("CarIdxLapDistPct", []float64{p, math.Mod(p+0.004, 1), math.Mod(p-0.003+1, 1), -1})
		set("CarIdxLap", []float64{float64(lap), float64(lap), float64(lap), 0})
		if f%900 == 450 {
			inc += 2
		}
		set("PlayerCarMyIncidentCount", inc)
		st.collect()
	}
	m := st.mem()
	if m.stLast == nil || m.msLast == nil || m.msBestLap == nil || len(m.incLog) != 9 || len(m.gapH[1]) < 100 {
		t.Fatalf("memory: last lap %v, sectors %v/%v, incidents %d, gaps %d", m.stLast != nil, m.msLast != nil, m.msBestLap != nil, len(m.incLog), len(m.gapH[1]))
	}
	for _, name := range []string{"stats", "pit", "sectors", "gaps", "incidents"} {
		c := newCanvas(int(ovDesign[name]), 900)
		h := ovDraw(name, c, st, time.Now())
		if h < 60 || h > 700 {
			t.Fatalf("%s: height %d", name, h)
		}
		for y := h + 1; y < c.h; y++ {
			for x := 0; x < c.w; x++ {
				if c.px[y*c.w+x]>>24 > 0 {
					t.Fatalf("%s draws below its height %d", name, h)
				}
			}
		}
		ovSavePNG(t, c, h, "s-"+name)
	}
}

func TestNativeLapOverlaysDraw(t *testing.T) {
	st := ovTestState(t, nil)
	set := func(k string, v any) {
		b, _ := json.Marshal(v)
		st.frame[k] = b
	}
	set("IsOnTrack", true)
	L := 4000.0
	// three laps around a track with two corners; the third one is slower through the first corner
	speed := func(d float64, lap int) (v, thr, brk float64) {
		v, thr = 70, 1
		for _, at := range []float64{1200, 2900} {
			low := 30.0
			if lap == 2 && at == 1200 {
				low = 22
			}
			if d > at-150 && d < at {
				f := (d - (at - 150)) / 150
				v, thr, brk = 70-(70-low)*f, 0, 0.9
			} else if d >= at && d < at+200 {
				v, thr = low+(70-low)*(d-at)/200, 0.8
			}
		}
		return
	}
	tt := 0.0
	for lap := 0; lap < 3; lap++ {
		for d := 0.0; d < L; d += 2 {
			v, thr, brk := speed(d, lap)
			tt += 2 / v
			set("LapDist", d)
			set("LapDistPct", d/L)
			set("LapCompleted", lap)
			set("Lap", lap+1)
			set("LapCurrentLapTime", tt-float64(lap)*70)
			set("Speed", v)
			set("Throttle", thr)
			set("Brake", brk)
			set("Gear", 4)
			set("RPM", 7000)
			set("SteeringWheelAngle", 0.1)
			st.collect()
		}
		set("LapLastLapTime", 70.0+float64(lap)*0.3)
		st.ext.pendAt = time.Now().Add(-time.Second)
	}
	set("LapCompleted", 3)
	set("LapDist", 1000.0)
	set("LapDistPct", 0.25)
	set("Speed", 72.0)
	st.collect()
	st.ext.pendAt = time.Now().Add(-time.Second)
	st.collect()
	if len(st.ext.laps) != 3 {
		t.Fatalf("recorded %d laps, want 3", len(st.ext.laps))
	}
	if z := st.bmZones(); len(z) != 2 {
		t.Fatalf("braking zones: %d", len(z))
	}
	if tips, ref := st.coachTips(); len(tips) == 0 || ref == "" {
		t.Fatal("the coach finds nothing in the lap that braked late")
	}
	for i := 0; i < 200; i++ { // an oval for the map
		a := float64(i) / 200 * 2 * math.Pi
		st.ext.mapX = append(st.ext.mapX, 600*math.Cos(a))
		st.ext.mapY = append(st.ext.mapY, 300*math.Sin(a))
	}
	st.ext.mapKey = "t0"
	for _, name := range []string{"map", "compare", "brakes", "coach", "radio"} {
		h0 := 900
		if name == "map" {
			h0 = 480
		}
		c := newCanvas(int(ovDesign[name]), h0)
		h := ovDraw(name, c, st, time.Now())
		if name == "map" {
			h = h0
		}
		if h < 60 || h > 900 {
			t.Fatalf("%s: height %d", name, h)
		}
		ovSavePNG(t, c, h, "l-"+name)
	}
	b := st.ext.buttons[3]
	ovClick("radio", st, b.x+5, b.y+5)
	if st.ext.pressed != "position" {
		t.Fatalf("radio click pressed %q", st.ext.pressed)
	}
}

// every overlay is drawn natively (no WebView2 window over the game) and has its design width
func TestEveryOverlayIsNative(t *testing.T) {
	for _, n := range overlayOrder {
		if !nativeOverlay(n) || ovDesign[n] <= 0 {
			t.Errorf("overlay %s is not native", n)
		}
	}
}

func TestDeskEndpoint(t *testing.T) {
	mux := http.NewServeMux()
	registerDeskRoutes(mux)
	rec := httptest.NewRecorder()
	mux.ServeHTTP(rec, httptest.NewRequest("GET", "/api/desk", nil))
	var out map[string]any
	if rec.Code != 200 || json.Unmarshal(rec.Body.Bytes(), &out) != nil {
		t.Fatalf("status %d: %s", rec.Code, rec.Body.String())
	}
	for _, k := range []string{"gear", "speed", "items", "fuel", "relative", "lang", "wip"} {
		if _, ok := out[k]; !ok {
			t.Fatalf("no %s in %s", k, rec.Body.String())
		}
	}
}

// your driver notes show as an icon before the name in the relative and the standings
func TestNativeTablesShowDriverTags(t *testing.T) {
	for _, name := range []string{"relative", "standings"} {
		st := ovTestState(t, nil)
		st.mu.Lock()
		st.ext.notesAt = time.Now() // no fetch from a PC in the test
		st.ext.notes = map[string]*driverNote{nameKey("Fast Rival"): {Tag: "danger"}, nameKey("Somebody Slower With A Very Long Name"): {Tag: "clean"}}
		st.mu.Unlock()
		if st.rowTag(1) != "danger" || st.rowTag(2) != "clean" || st.rowTag(0) != "" {
			t.Fatalf("tags by name: %q %q %q", st.rowTag(1), st.rowTag(2), st.rowTag(0))
		}
		plain := newCanvas(600, 900)
		st2 := ovTestState(t, nil)
		st2.ext.notesAt = time.Now()
		ovDraw(name, plain, st2, time.Now())
		c := newCanvas(600, 900)
		h := ovDraw(name, c, st, time.Now())
		// the red of the danger triangle is drawn somewhere
		red := 0
		for _, p := range c.px {
			r, g, b := p>>16&0xff, p>>8&0xff, p&0xff
			if p>>24 > 200 && r > 200 && g < 120 && b < 120 {
				red++
			}
		}
		if red < 20 {
			t.Fatalf("%s: no danger icon (%d red pixels)", name, red)
		}
		ovSavePNG(t, c, h, name+"-tags")
	}
	// the key of a driver wins over their name
	st := ovTestState(t, nil)
	st.ses.Drivers[1].UID = "4242"
	st.ext.notesAt = time.Now()
	st.ext.notes = map[string]*driverNote{driverKey("4242"): {Tag: "friend"}, nameKey("Fast Rival"): {Tag: "danger"}}
	if st.rowTag(1) != "friend" {
		t.Fatalf("tag by key: %q", st.rowTag(1))
	}
}

// in a race the relative marks the cars a lap (or more) up or down on you: +1L / −1L
func TestRelativeLapsUpDown(t *testing.T) {
	st := ovTestState(t, nil)
	b, _ := json.Marshal(0)
	st.frame["SessionNum"] = b
	if !st.inRace() {
		t.Fatal("the test session is a race")
	}
	found := false
	for _, r := range st.tableRows(true, nil, 0) {
		if r.idx == 2 {
			found = true
			if r.laps != -1 {
				t.Fatalf("car 2 is a lap down: %d", r.laps)
			}
		}
		if r.idx == 1 && r.laps != 0 {
			t.Fatalf("car 1 is on your lap: %d", r.laps)
		}
	}
	if !found {
		t.Fatal("car 2 not in the relative")
	}
	c := newCanvas(600, 900)
	st.ext.notesAt = time.Now()
	h := ovDraw("relative", c, st, time.Now())
	ovSavePNG(t, c, h, "relative-laps")
}

func TestRadarThreeWideAndMerge(t *testing.T) {
	st := ovTestState(t, nil)
	L := st.ses.TrackLen
	if L <= 0 {
		t.Skip("no track length")
	}
	set := func(k string, v any) {
		b, _ := json.Marshal(v)
		st.frame[k] = b
	}
	at := func(m ...float64) []float64 {
		out := []float64{0.5}
		for _, x := range m {
			out = append(out, 0.5+x/L)
		}
		return out
	}
	set("CarIdxLapDistPct", append(at(1, -1), -1))
	set("CarLeftRight", 5) // two cars on your left
	now := time.Now()
	for k := 0; k < 30; k++ {
		now = now.Add(16 * time.Millisecond)
		st.at = now // a new sample of the game each time
		drawRadarOv(newCanvas(260, 300), st, now)
	}
	a, b := st.radLat[1], st.radLat[2]
	if math.Min(a, b) > -1.8 || math.Max(a, b) > -0.8 || math.Max(a, b) < -1.2 {
		t.Fatalf("three wide: the cars should be one beside you and one beyond it, got %.2f and %.2f", a, b)
	}
	// the car beside you pulls 9 m ahead: it moves back into line little by little, not at once
	near := 1
	if b > a {
		near = 2
	}
	pos := []float64{1, -1}
	pos[near-1] = 9
	set("CarIdxLapDistPct", append(at(pos...), -1))
	set("CarLeftRight", 1)
	for k := 0; k < 30; k++ {
		now = now.Add(16 * time.Millisecond)
		st.at = now // a new sample of the game each time
		drawRadarOv(newCanvas(260, 300), st, now)
	}
	if l := st.radLat[near]; l > -0.2 || l < -0.9 {
		t.Fatalf("a car that just passed should be easing back into line, got %.2f", l)
	}
}

func TestExtraOverlaysDraw(t *testing.T) {
	st := ovTestState(t, nil)
	set := func(k string, v any) {
		b, _ := json.Marshal(v)
		st.frame[k] = b
	}
	set("AirTemp", 21.5)
	set("TrackTempCrew", 31.2)
	set("WindVel", 4.2)
	set("WindDir", 0.8)
	set("YawNorth", 2.1)
	set("Skies", 1)
	set("RelativeHumidity", 0.62)
	set("Precipitation", 0.2)
	set("TrackWetness", 4)
	set("WeatherDeclaredWet", 1)
	set("SessionTimeOfDay", 52345)
	set("SolarAltitude", 0.6)
	set("dcBrakeBias", 54.5)
	set("dcTractionControl", 3)
	set("dcTractionControlMax", 12)
	set("dcPitSpeedLimiterToggle", 1)
	set("CarIdxOnPitRoad", []float64{0, 0, 1, 0})
	set("FrameRate", 118)
	set("GpuUsage", 0.71)
	set("CpuUsageFG", 0.34)
	set("ChanLatency", 0.041)
	set("ChanQuality", 0.98)
	now := time.Now()
	for k, tc := range []struct {
		name string
		w    int
	}{{"weather", 360}, {"controls", 340}, {"trackbar", 700}, {"system", 320}} {
		for pass := 0; pass < 2; pass++ { // twice: the second draw has memory (a changed control, a frame rate kept)
			if pass == 1 {
				set("dcTractionControl", 10+k) // another value than any draw before saw
				now = now.Add(1100 * time.Millisecond)
			}
			st.at = now // the game keeps sending
			c := newCanvas(tc.w, 600)
			h := ovDraw(tc.name, c, st, now)
			painted := 0
			for _, p := range c.px {
				if p>>24 > 0 {
					painted++
				}
			}
			if painted == 0 || h < 30 || h > 600 {
				t.Fatalf("%s: painted %d, height %d", tc.name, painted, h)
			}
			ovSavePNG(t, c, h, tc.name)
		}
	}
	// a control that changed lights up; the frame rate history grows
	if at := st.x5.ctlAt["dcTractionControl"]; at.IsZero() {
		t.Fatal("the changed control was not noticed")
	}
	if len(st.x5.fps) < 2 {
		t.Fatalf("frame rate history: %d", len(st.x5.fps))
	}
	// an empty frame (the game closed) still draws every one
	st.frame = map[string]json.RawMessage{}
	for _, n := range []string{"weather", "controls", "trackbar", "system"} {
		if h := ovDraw(n, newCanvas(400, 600), st, now); h < 30 {
			t.Fatalf("%s with no data: height %d", n, h)
		}
	}
}

func TestFlagsStartLightsAndGreen(t *testing.T) {
	st := ovTestState(t, nil)
	set := func(k string, v any) {
		b, _ := json.Marshal(v)
		st.frame[k] = b
	}
	painted := func(c *ovCanvas) int {
		n := 0
		for _, p := range c.px {
			if p>>24 > 0 {
				n++
			}
		}
		return n
	}
	now := time.Now()
	st.at = now.Add(20 * time.Second) // the game keeps sending all along
	set("SessionFlags", float64(flagStartSet))
	c := newCanvas(520, 90)
	ovDraw("flag", c, st, now)
	if painted(c) == 0 {
		t.Fatal("the start lights draw nothing")
	}
	// the green: shown the first seconds only
	set("SessionFlags", 0x4)
	c = newCanvas(520, 90)
	ovDraw("flag", c, st, now.Add(time.Second))
	if painted(c) == 0 {
		t.Fatal("a fresh green flag draws nothing")
	}
	c = newCanvas(520, 90)
	ovDraw("flag", c, st, now.Add(10*time.Second))
	if painted(c) != 0 {
		t.Fatal("a green flag still shows after ten seconds")
	}
	set("SessionFlags", 0x40) // debris
	c = newCanvas(520, 90)
	ovDraw("flag", c, st, now.Add(11*time.Second))
	if painted(c) == 0 {
		t.Fatal("the debris flag draws nothing")
	}
}

func TestOfficialSectorsAndPitLane(t *testing.T) {
	st := ovTestState(t, nil)
	st.ses = parseOvSession(ovTestYAML + "SplitTimeInfo:\n Sectors:\n - SectorNum: 0\n   SectorStartPct: 0.000000\n - SectorNum: 1\n   SectorStartPct: 0.400000\n - SectorNum: 2\n   SectorStartPct: 0.700000\n")
	st.ses.PitLimit = 60 / 3.6
	if len(st.ses.Sectors) != 3 {
		t.Fatalf("sectors parsed: %v", st.ses.Sectors)
	}
	set := func(k string, v any) {
		b, _ := json.Marshal(v)
		st.frame[k] = b
	}
	set("IsOnTrack", 1)
	// two laps of 90 s, the second one faster in its first sector
	tm := 0.0
	for lap := 0; lap < 2; lap++ {
		for i := 0; i <= 100; i++ {
			p := float64(i) / 100
			if p >= 1 {
				p = 0
			}
			set("LapDistPct", p)
			set("SessionTime", tm)
			st.collectSectors()
			dt := 0.9
			if lap == 1 && p < 0.4 {
				dt = 0.8
			}
			tm += dt
		}
	}
	m := &st.x6
	if m.secBestLap == nil || len(m.secLast) != 3 || !(m.secLast[0] < 36) {
		t.Fatalf("sector timing: last %v best lap %v", m.secLast, m.secBestLap)
	}
	if !(m.secBest[0] > 0 && m.secBest[0] <= m.secLast[0]+1e-6) {
		t.Fatalf("best sectors: %v", m.secBest)
	}
	c := newCanvas(440, 400)
	if h := ovDraw("timing", c, st, time.Now()); h < 150 {
		t.Fatalf("timing with sectors: height %d", h)
	}
	ovSavePNG(t, c, 260, "g-timing-sectors")
	// the pit lane: over the limit the card says so
	set("OnPitRoad", 1)
	set("Speed", 20.0)
	c = newCanvas(440, 300)
	h := ovDraw("pit", c, st, time.Now())
	red := 0
	for _, p := range c.px {
		if p>>24 > 0 && (p>>16)&0xff > 0xc0 && (p>>8)&0xff < 0x80 {
			red++
		}
	}
	if h < 60 || red < 200 {
		t.Fatalf("pit lane over the limit: height %d, red pixels %d", h, red)
	}
	ovSavePNG(t, c, h, "s-pitlane")
}

func TestDeltaTrendAndPace(t *testing.T) {
	st := ovTestState(t, nil)
	if _, has := st.deltaTrend(0.1, true); has {
		t.Fatal("a trend with one sample")
	}
	st.x6.dHist = []dSample{{time.Now().Add(-900 * time.Millisecond), 0.4}}
	if tr, has := st.deltaTrend(0.1, true); !has || tr >= 0 {
		t.Fatalf("gaining three tenths: %v %v", tr, has)
	}
	if v, col, _ := st.cell("pace", ovRow{idx: 1}, nil); v != "−0.4" || col != colBad {
		t.Fatalf("pace of the faster rival: %q", v)
	}
	st.ui = map[string]any{"rel": map[string]any{"cols": []any{"pos", "num", "name", "pace", "gap"}}}
	c := newCanvas(600, 600)
	if h := ovDraw("relative", c, st, time.Now()); h < 100 {
		t.Fatalf("relative with the pace column: %d", h)
	}
}
