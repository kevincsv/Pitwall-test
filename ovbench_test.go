package main

// What each native overlay costs to draw, one frame at its design width with a realistic race (24 cars, three laps
// recorded, the gauges' values): go test -run '^$' -bench OverlayDraw -benchmem

import (
	"encoding/json"
	"fmt"
	"math"
	"strings"
	"testing"
	"time"
)

const ovBenchCars = 24

// ovBenchYAML: a race of n cars (the player car 0) and the pace car after them
func ovBenchYAML(n int) string {
	var b strings.Builder
	b.WriteString("WeekendInfo:\n TrackDisplayName: Bench Park\n TrackID: 9\n TrackLength: 4.00 km\n WeekendOptions:\n  IncidentLimit: 17\n")
	b.WriteString("SessionInfo:\n Sessions:\n - SessionNum: 0\n   SessionType: Race\n   SessionName: RACE\n   ResultsPositions:\n")
	b.WriteString("DriverInfo:\n DriverCarIdx: 0\n Drivers:\n")
	for i := 0; i < n; i++ {
		fmt.Fprintf(&b, " - CarIdx: %d\n   UserName: Driver Number %d Surname\n   CarNumber: \"%d\"\n   IRating: %d\n   LicString: B 3.%02d\n   CarClassID: 1\n   CurDriverIncidentCount: %d\n",
			i, i, i+2, 1500+i*90, i, i%5)
	}
	fmt.Fprintf(&b, " - CarIdx: %d\n   UserName: Pace Car\n   CarIsPaceCar: 1\n   CarClassID: 11\n", n)
	return b.String()
}

// ovBenchState: one window's memory in the middle of a race, every overlay with something to show
func ovBenchState(tb testing.TB) *ovState {
	st := ovTestState(nil, nil)
	st.ses = parseOvSession(ovBenchYAML(ovBenchCars))
	st.ses.Car["DriverCarSLFirstRPM"], st.ses.Car["DriverCarSLShiftRPM"], st.ses.Car["DriverCarFuelMaxLtr"], st.ses.Car["DriverCarEstLapTime"] = 5800, 7600, 52, 70
	set := func(k string, v any) {
		b, _ := json.Marshal(v)
		st.frame[k] = b
	}
	for k, v := range map[string]any{"SessionFlags": 0x8, "Gear": 4, "Speed": 52.3, "RPM": 7350, "Throttle": 0.86, "Brake": 0.0, "Clutch": 1.0, "dcBrakeBias": 54.5,
		"dcTractionControl": 3, "dcTractionControlMax": 12, "dcABS": 2, "dcABSMax": 9, "LapBestLapTime": 70.2, "LapLastLapTime": 70.6,
		"FuelLevel": 31.7, "FuelLevelPct": 0.6, "WaterTemp": 88.4, "OilTemp": 101.2, "OilPress": 4.52, "Voltage": 13.8, "AirTemp": 21.5, "TrackTempCrew": 31.2,
		"BrakeABSactive": true, "DRS_Status": 2, "P2P_Count": 120, "P2P_Status": false, "YawRate": 0.31,
		"FuelUsePerHour": 52.1, "LFtempCL": 82, "LFtempCM": 86, "LFtempCR": 90, "RFtempCL": 96, "RFtempCM": 101, "RFtempCR": 99, "LRtempCM": 70, "RRtempCM": 79,
		"LFwearM": 0.97, "RFwearM": 0.94, "LRwearM": 0.99, "RRwearM": 0.98, "WindVel": 4.2, "WindDir": 0.8, "YawNorth": 2.1, "Skies": 1, "RelativeHumidity": 0.62,
		"Precipitation": 0.2, "TrackWetness": 2, "SessionTimeOfDay": 52345, "SolarAltitude": 0.6, "FrameRate": 118, "GpuUsage": 0.71, "CpuUsageFG": 0.34,
		"ChanLatency": 0.041, "ChanQuality": 0.98, "IsOnTrack": true, "SessionLapsRemainEx": 20, "SessionTimeRemain": 1234, "PlayerCarPosition": 5,
		"PlayerCarClassPosition": 5, "LapDeltaToBestLap": -0.37, "LapDeltaToBestLap_OK": true, "CarLeftRight": 2} {
		set(k, v)
	}
	st.live.fuelUses = []float64{2.41, 2.38}
	n := ovBenchCars + 1
	arr := func(f func(i int) float64) []float64 {
		a := make([]float64, n)
		for i := range a {
			a[i] = -1
			if i < ovBenchCars {
				a[i] = f(i)
			}
		}
		return a
	}
	L := 4000.0
	speed := func(d float64) (v, thr, brk float64) {
		v, thr = 70, 1
		for _, at := range []float64{1200, 2900} {
			if d > at-150 && d < at {
				f := (d - (at - 150)) / 150
				v, thr, brk = 70-40*f, 0, 0.9
			} else if d >= at && d < at+200 {
				v, thr = 30+40*(d-at)/200, 0.8
			}
		}
		return
	}
	tt := 0.0
	for lap := 0; lap < 3; lap++ {
		for d := 0.0; d < L; d += 4 {
			v, thr, brk := speed(d)
			tt += 4 / v
			p := d / L
			set("SessionTime", tt)
			set("LapDist", d)
			set("LapDistPct", p)
			set("LapCompleted", lap)
			set("Lap", lap+1)
			set("LapCurrentLapTime", tt-float64(lap)*70)
			set("Speed", v)
			set("Throttle", thr)
			set("Brake", brk)
			set("Gear", 4)
			set("RPM", 7000)
			set("SteeringWheelAngle", 0.1)
			set("LatAccel", 12*math.Sin(tt/9))
			set("LongAccel", 8*math.Cos(tt/9))
			set("VelocityX", v)
			set("VelocityY", 2*math.Sin(tt))
			set("CarIdxLapDistPct", arr(func(i int) float64 { return math.Mod(p+1-float64(i-4)*0.0041, 1) }))
			set("CarIdxLap", arr(func(i int) float64 { return float64(lap + 1) }))
			set("CarIdxLapCompleted", arr(func(i int) float64 { return float64(lap) }))
			set("CarIdxEstTime", arr(func(i int) float64 { return math.Mod(p+1-float64(i-4)*0.0041, 1) * 70 }))
			set("CarIdxPosition", arr(func(i int) float64 { return float64(i + 1) }))
			set("CarIdxClassPosition", arr(func(i int) float64 { return float64(i + 1) }))
			set("CarIdxF2Time", arr(func(i int) float64 { return float64(i) * 0.29 }))
			set("CarIdxLastLapTime", arr(func(i int) float64 { return 70.1 + float64(i)*0.07 }))
			set("CarIdxBestLapTime", arr(func(i int) float64 { return 69.9 + float64(i)*0.06 }))
			set("CarIdxOnPitRoad", arr(func(i int) float64 { return 0 }))
			set("CarIdxTrackSurface", arr(func(i int) float64 { return 3 }))
			st.collect()
		}
		set("LapLastLapTime", 70.0+float64(lap)*0.3)
		st.ext.pendAt = time.Now().Add(-2 * time.Second)
	}
	set("LapCompleted", 3)
	set("LapDist", 1000.0)
	set("LapDistPct", 0.25)
	st.collect()
	st.ext.pendAt = time.Now().Add(-2 * time.Second)
	st.collect()
	for i := 0; i < 200; i++ { // an oval for the map
		a := float64(i) / 200 * 2 * math.Pi
		st.ext.mapX = append(st.ext.mapX, 600*math.Cos(a))
		st.ext.mapY = append(st.ext.mapY, 300*math.Sin(a))
	}
	st.ext.mapKey = "t0"
	return st
}

// ovBenchSize: the window an overlay has at its design width once it fits its content
func ovBenchSize(st *ovState, name string) (int, int) {
	w := int(ovDesign[name])
	_, mh := overlayMinSize(name)
	c := newCanvas(w, 900)
	st.at = time.Now()
	h := ovDraw(name, c, st, time.Now())
	if h <= 0 {
		h = max(mh, 260)
	}
	return w, h
}

func BenchmarkOverlayDraw(b *testing.B) {
	quietLog(b)
	for _, name := range overlayOrder {
		b.Run(name, func(b *testing.B) {
			st := ovBenchState(b)
			w, h := ovBenchSize(st, name)
			c := newCanvas(w, h)
			now := time.Now()
			b.ReportAllocs()
			b.ResetTimer()
			for k := 0; k < b.N; k++ {
				now = now.Add(33 * time.Millisecond)
				st.at = now
				ovDraw(name, c, st, now)
			}
			b.ReportMetric(float64(w*h), "px")
		})
	}
}
