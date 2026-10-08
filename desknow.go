package main

// What the native desktop window (desktop/, C# / WPF) shows live: /api/desk gives the values of its Telemetry and
// Home screens already worked out the same way as the native overlays (the relative's rows, the fuel, the delta, the
// header items with their labels in the app's language), so the window only lays them out.

import (
	"encoding/json"
	"math"
	"net/http"
	"strconv"
	"time"
)

var deskVars = []string{"PlayerCarIdx", "SessionNum", "Gear", "Speed", "RPM", "Throttle", "Brake", "Clutch", "PlayerCarSLShiftRPM", "Lap", "LapCompleted",
	"LapDistPct", "LapCurrentLapTime", "LapBestLapTime", "LapLastLapTime", "LapDeltaToBestLap", "LapDeltaToBestLap_OK", "LapDeltaToSessionBestLap",
	"LapDeltaToSessionBestLap_OK", "LapDeltaToOptimalLap", "LapDeltaToOptimalLap_OK", "LapDeltaToSessionOptimalLap", "LapDeltaToSessionOptimalLap_OK",
	"FuelLevel", "FuelLevelPct", "FuelUsePerHour", "OnPitRoad", "IsOnTrack", "SessionLapsRemainEx", "SessionTimeRemain", "PlayerCarPosition",
	"PlayerCarClassPosition", "PlayerCarMyIncidentCount", "SessionFlags", "WaterTemp", "OilTemp", "AirTemp", "TrackTempCrew",
	"CarIdxLapDistPct", "CarIdxEstTime", "CarIdxLap", "CarIdxLapCompleted", "CarIdxPosition", "CarIdxClassPosition", "CarIdxF2Time",
	"CarIdxLastLapTime", "CarIdxBestLapTime", "CarIdxOnPitRoad"}

// one state for the desk window, fed from the telemetry at each call (it keeps the fuel use per lap between calls)
var (
	deskSt         = newOvState("en")
	deskSess int64 = -1
)

func deskState() *ovState {
	st := deskSt
	tel.mu.RLock()
	idx := []int{}
	names := []string{}
	for _, n := range deskVars {
		if i, ok := tel.index[n]; ok {
			idx = append(idx, i)
			names = append(names, n)
		}
	}
	var vals []any
	if len(tel.buf) > 0 {
		vals = decodeValues(tel.vars, tel.buf, idx)
	}
	y, sv := tel.session, int64(tel.sessionVer)
	tel.mu.RUnlock()
	c, _ := settingsSnapshot()
	st.mu.Lock()
	defer st.mu.Unlock()
	st.lang, st.units, st.ui, st.alpha = uiLangChoice(), uiUnits(), c.UI, c.Alpha
	if sv != deskSess {
		deskSess = sv
		st.ses = parseOvSession(y)
	}
	st.frame = map[string]json.RawMessage{}
	for k, n := range names {
		if k < len(vals) {
			b, _ := json.Marshal(vals[k])
			st.frame[n] = b
		}
	}
	if len(vals) > 0 {
		st.at = time.Now()
		st.countPits()
		st.collect()
	}
	return st
}

type deskRow struct {
	Pos, Num, Name, Lic, IR, Gap, Last string
	LicColor, NameColor                string
	Me, Pit, Blank                     bool
}

func hexCol(c uint32) string { return "#" + strconv.FormatUint(uint64(0xff000000|c), 16)[2:] }

func registerDeskRoutes(mux *http.ServeMux) {
	mux.HandleFunc("/api/desk", func(w http.ResponseWriter, r *http.Request) {
		st := deskState()
		cs := currentStatus()
		st.mu.Lock()
		defer st.mu.Unlock()
		num := func(n string) float64 { v, _ := st.num(n); return v }
		first, shift, blink := st.shiftPoints()
		d, dOK := st.delta()
		out := map[string]any{"connected": cs.Connected, "demo": cs.Demo, "lang": st.lang, "units": st.units, "wip": wipAllowed(),
			"gear": gearText(st), "speed": int(math.Round(st.spd(num("Speed")))), "speedUnit": st.spdU(), "rpm": int(num("RPM")),
			"rpmFirst": first, "rpmShift": shift, "rpmBlink": blink, "throttle": num("Throttle"), "brake": num("Brake"), "clutch": 1 - func() float64 {
				if v, ok := st.num("Clutch"); ok {
					return v
				}
				return 1
			}(), "lapPct": num("LapDistPct"),
			"cur": fmtCur(num("LapCurrentLapTime")), "best": fmtLap(num("LapBestLapTime")), "last": fmtLap(num("LapLastLapTime"))}
		if dOK {
			out["delta"], out["deltaGood"] = signed(d, 2), d <= 0
		} else {
			out["delta"] = "–"
		}
		if st.ses != nil {
			out["track"] = st.ses.Track
		}
		// the header items, labelled in the app's language
		items := []map[string]string{}
		for _, k := range []string{"session", "pos", "lap", "lapsleft", "timeleft", "sof", "irc", "inc", "fuel"} {
			l, v, col := st.item(k)
			if l != "" {
				items = append(items, map[string]string{"k": k, "label": l, "value": v, "color": hexCol(col)})
			}
		}
		out["items"] = items
		// fuel: in the tank, laps it lasts, per lap
		fuel, hasFuel := st.num("FuelLevel")
		per := st.fuelPerLap()
		fu := map[string]string{"unit": st.volU(), "tank": "–", "laps": "–", "per": "–"}
		if hasFuel {
			fu["tank"] = strconv.FormatFloat(st.vol(fuel), 'f', 1, 64)
			if per > 0 {
				fu["laps"] = strconv.FormatFloat(fuel/per, 'f', 1, 64)
				fu["per"] = strconv.FormatFloat(st.vol(per), 'f', 2, 64)
			}
		}
		out["fuel"] = fu
		// the relative: the rows chosen ahead and behind, you in the middle
		me := -1
		if v, ok := st.num("PlayerCarIdx"); ok {
			me = int(v)
		}
		irc := st.irEstimates()
		rows := []deskRow{}
		for _, rr := range st.tableRows(true, st.uiMap("rel"), me) {
			if rr.blank || rr.sep {
				rows = append(rows, deskRow{Blank: true})
				continue
			}
			cell := func(k string) string { v, _, _ := st.cell(k, rr, irc); return v }
			lic := cell("lic")
			pit := st.arr("CarIdxOnPitRoad")
			nameCol := rr.nameCol
			if nameCol == 0 {
				nameCol = colText
			}
			rows = append(rows, deskRow{Pos: cell("pos"), Num: cell("num"), Name: cell("name"), Lic: lic, IR: cell("ir"), Gap: cell("gap"), Last: cell("last"),
				LicColor: hexCol(licColor(lic)), NameColor: hexCol(nameCol), Me: rr.idx == me, Pit: rr.idx < len(pit) && pit[rr.idx] != 0})
		}
		out["relative"] = rows
		writeJSON(w, out)
	})
}
