package main

import (
	"encoding/json"
	"image"
	"image/color"
	"image/png"
	"math"
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
	if len(gaugeVars("tyres", st)) != 36 || gaugeVars("telemetry", st)[0] != "LatAccel" {
		t.Fatal("gauge variables")
	}
	if st.units = "imperial"; st.spdU() != "mph" || math.Abs(st.tmp(100)-212) > 1e-9 {
		t.Fatal("imperial units")
	}
}
