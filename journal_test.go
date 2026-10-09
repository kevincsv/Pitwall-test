package main

import (
	"encoding/json"
	"math"
	"net/http"
	"net/http/httptest"
	"strings"
	"testing"
)

const testRaceYAML = `---
WeekendInfo:
 TrackDisplayName: Circuito de Navarra
 TrackConfigName: Full
 TrackID: 515
 SeriesID: 139
 SeasonID: 5000
 SubSessionID: 900
 Official: 1
 NumCarClasses: 1
SessionInfo:
 CurrentSessionNum: 2
 Sessions:
 - SessionNum: 0
   SessionType: Practice
 - SessionNum: 2
   SessionType: Race
   ResultsPositions:
   - Position: 1
     ClassPosition: 0
     CarIdx: 1
     Lap: 12
     FastestTime: 97.500
     LapsComplete: 12
     Incidents: 0
     ReasonOutStr: Running
   - Position: 2
     ClassPosition: 1
     CarIdx: 0
     Lap: 12
     FastestTime: 97.900
     LapsComplete: 12
     Incidents: 0
     ReasonOutStr: Running
   - Position: 3
     ClassPosition: 2
     CarIdx: 2
     Lap: 11
     FastestTime: 98.300
     LapsComplete: 11
     Incidents: 0
     ReasonOutStr: Running
   ResultsFastestLap:
   - CarIdx: 0
     FastestLap: 5
     FastestTime: 97.900
DriverInfo:
 DriverCarIdx: 0
 DriverCarFuelMaxLtr: 45.000
 Drivers:
 - CarIdx: 0
   UserID: 100001
   UserName: Driver C
   CarID: 67
   CarPath: mx5 mx52016
   CarScreenName: Global Mazda MX-5 Cup
   CarClassID: 74
   CarClassShortName: MX5
   IRating: 2000
 - CarIdx: 1
   UserID: 100002
   UserName: Fast One
   CarID: 67
   CarScreenName: Global Mazda MX-5 Cup
   CarClassID: 74
   IRating: 2600
 - CarIdx: 2
   UserID: 100003
   UserName: Slow One
   CarID: 67
   CarScreenName: Global Mazda MX-5 Cup
   CarClassID: 74
   IRating: 1500
   CurDriverIncidentCount: 4
   TeamIncidentCount: 4
`

func TestRaceReport(t *testing.T) {
	c := currentCarTrack(testRaceYAML)
	if c.CarID != 67 || c.TrackID != 515 || c.Car != "Global Mazda MX-5 Cup" || c.CarPath != "mx5 mx52016" || c.Track != "Circuito de Navarra · Full" || c.Tank != 45 {
		t.Fatalf("car/track: %+v", c)
	}
	res := sessionResults(testRaceYAML, 2)
	if len(res) != 3 || res[0].Name != "Fast One" || res[1].Name != "Driver C" || !res[1].Me || res[1].ClassPos != 2 || res[2].Best != 98.3 {
		t.Fatalf("results: %+v", res)
	}
	// the results' Incidents stay 0 live: the per-driver counts fill them in, and the player's own count from the race
	if res[2].Inc != 4 || res[0].Inc != 0 {
		t.Fatalf("incidents from the driver counts: %+v", res)
	}
	tr := &raceTrack{id: "900-2", meta: c, started: true, start: 3, lastPos: 2, lastInc: 2, fuel0: 30, lastFuel: 6, pits: 0,
		laps: []raceLap{{N: 1, Time: 99.5, Pos: 3}, {N: 2, Time: 98.0, Pos: 3}, {N: 3, Time: 98.2, Pos: 2}, {N: 4, Time: 101.0, Pos: 2, Inc: 2}, {N: 5, Time: 97.9, Pos: 2}}}
	r := buildReport(testRaceYAML, tr, false)
	if r.Finish != 2 || r.Start != 3 || r.Field != 3 || r.Inc != 2 || r.Best != 97.9 || r.FieldBest != 97.5 || r.FuelUsed != 24 {
		t.Fatalf("report: %+v", r)
	}
	if r.Results[1].Inc != 2 || r.Results[2].Inc != 4 {
		t.Fatalf("incidents in the table: %+v", r.Results)
	}
	// the top 3 for the community: P1 and P3 (P2 is me), by car and track, time and an opaque key, no name
	top := fieldTopLaps(r)
	if len(top) != 2 || top[0]["time"] != 97.5 || top[1]["time"] != 98.3 || top[0]["carId"] != 67 || top[0]["trackId"] != 515 || top[0]["other"] == "" || top[0]["other"] == top[1]["other"] {
		t.Fatalf("top 3 laps: %v", top)
	}
	for _, b := range top {
		if len(b["other"].(string)) != 32 || b["other"].(string) == driverKey("100001") {
			t.Fatalf("the wrong key went with a top-3 lap: %v", b)
		}
	}
	// their whole name, as the game shows it
	if top[0]["name"] == nil || top[0]["name"] == "" {
		t.Fatalf("name of a rival: %v", top[0])
	}
	if driverKey("") != "" || driverKey("-1") != "" || driverKey("100002") != top[0]["other"] {
		t.Fatalf("driver keys: %q %q", driverKey(""), driverKey("100002"))
	}
	if r.Avg != 98.033 || r.Consistency <= 0 || r.Consistency > 0.2 {
		t.Fatalf("clean laps: avg %v sd %v", r.Avg, r.Consistency)
	}
	if r.SOF < 1500 || r.SOF > 2600 {
		t.Fatalf("sof %d", r.SOF)
	}
	if r.IRChange < -10 || r.IRChange > 10 { // P2 between a 2600 and a 1500 is about what a 2000 is expected to do
		t.Fatalf("ir change %d", r.IRChange)
	}
	// the winner gains, the last loses, and the changes roughly cancel out
	ch := irChanges([]int{2600, 2000, 1500}, []int{1, 2, 3}, []bool{true, true, true})
	if ch[0] <= 0 || ch[2] >= 0 || ch[0]+ch[1]+ch[2] > 15 || ch[0]+ch[1]+ch[2] < -15 {
		t.Fatalf("ir changes %v", ch)
	}
	if !strings.Contains(raceText(r, true, "es"), "**P2** de 3 (salía P3, +1)") {
		t.Fatalf("discord text: %s", raceText(r, true, "es"))
	}
}

func TestNotesAndDiscordRoutes(t *testing.T) {
	dir := t.TempDir()
	t.Setenv("XDG_CONFIG_HOME", dir)
	t.Setenv("HOME", dir)
	t.Setenv("APPDATA", dir)
	initProfiles()
	loadJournal()
	loadDiscord()
	mux := http.NewServeMux()
	registerJournalRoutes(mux)
	registerDiscordRoutes(mux)
	do := func(method, path, body string) (int, map[string]any) {
		req := httptest.NewRequest(method, path, strings.NewReader(body))
		rec := httptest.NewRecorder()
		mux.ServeHTTP(rec, req)
		var m map[string]any
		json.Unmarshal(rec.Body.Bytes(), &m)
		return rec.Code, m
	}
	code, m := do("POST", "/api/notes", `{"trackId":515,"track":"Navarra","general":"Kerbs are high","corners":[{"n":1,"dist":420,"note":"3rd gear, brake at the 100 board"},{"n":2,"dist":900,"note":""}]}`)
	if code != 200 {
		t.Fatalf("notes save %d %v", code, m)
	}
	n := m["notes"].(map[string]any)["515"].(map[string]any)
	if n["general"] != "Kerbs are high" || len(n["corners"].([]any)) != 1 {
		t.Fatalf("notes: %v", n)
	}
	loadJournal()
	if notes["515"] == nil || notes["515"].Corners[0].Dist != 420 {
		t.Fatal("notes not kept on disk")
	}
	if code, _ := do("POST", "/api/discord", `{"action":"save","webhook":"https://evil.example/api/webhooks/1/abc"}`); code != 400 {
		t.Fatal("a non-Discord link was accepted")
	}
	code, m = do("POST", "/api/discord", `{"action":"save","webhook":"https://discord.com/api/webhooks/123/abc_DEF-1","results":true,"lang":"es"}`)
	if code != 200 || m["connected"] != true {
		t.Fatalf("discord save %d %v", code, m)
	}
	b, _ := json.Marshal(m)
	if strings.Contains(string(b), "webhooks") {
		t.Fatal("the webhook link was sent back to the page")
	}
	loadDiscord()
	if discordCfg.Webhook == "" || discordCfg.Lang != "es" {
		t.Fatalf("discord config not kept: %+v", discordCfg)
	}
}

func TestFieldSectors(t *testing.T) {
	fieldMu.Lock()
	fieldCars = map[int]*carLapProf{7: {lapsS: []lapSecs{{time: 97.5, s: []float64{31.2, 33.1, 33.2}}, {time: 98.1, s: []float64{31.5, 33.3, 33.3}}}}}
	fieldMu.Unlock()
	if s := fieldSectors(7, 98.1); len(s) != 3 || s[1] != 33.3 {
		t.Fatalf("sectors of the 98.1 lap: %v", s)
	}
	if fieldSectors(7, 99) != nil || fieldSectors(8, 97.5) != nil || fieldSectors(7, 0) != nil {
		t.Fatal("sectors for a lap or car that was not seen")
	}
	// a race result takes its driver's sectors from the watcher
	fieldMu.Lock()
	fieldCars[1] = &carLapProf{lapsS: []lapSecs{{time: 97.5, s: []float64{31.2, 33.1, 33.2}}}}
	fieldMu.Unlock()
	tr := &raceTrack{id: "900-2", meta: currentCarTrack(testRaceYAML), started: true, start: 3, lastPos: 2, laps: []raceLap{{N: 1, Time: 99.5, Pos: 3}}}
	r := buildReport(testRaceYAML, tr, false)
	if len(r.Results[0].Sectors) != 3 || r.Results[0].Sectors[0] != 31.2 || r.Results[1].Sectors != nil {
		t.Fatalf("sectors in the results: %+v", r.Results)
	}
	if top := fieldTopLaps(r); len(top) != 2 || top[0]["sectors"] == nil || top[1]["sectors"] != nil {
		t.Fatalf("sectors with the top-3 laps: %v", top)
	}
	// without a trace a rival's lap is hidden (the model alone takes it); with one, only when faster than you
	if top := fieldTopLaps(r); top[0]["hidden"] != true || top[1]["hidden"] != true {
		t.Fatalf("rivals without a trace should be hidden: %v", top)
	}
	raw := make([]float32, 300)
	for i := range raw {
		raw[i] = float32(31 - 0.01*float64(i%7))
	}
	fieldMu.Lock()
	fieldCars[1] = &carLapProf{best: 97.5, bestV: raw, lapsS: []lapSecs{{time: 97.5, s: []float64{31.2, 33.1, 33.2}}}}
	fieldMu.Unlock()
	r = buildReport(testRaceYAML, tr, false)
	if top := fieldTopLaps(r); top[0]["trace"] == nil || top[0]["hidden"] == true || top[1]["hidden"] != true {
		t.Fatalf("the faster rival with a trace shows, the slower one without stays hidden: %v %v", top[0]["hidden"], top[1]["hidden"])
	}
	fieldMu.Lock()
	fieldCars = map[int]*carLapProf{}
	fieldMu.Unlock()
}

func TestFieldTrace(t *testing.T) {
	// a 3000 m lap seen every 10 m: fast on the straights, slow in six corners
	raw := make([]float32, 300)
	for i := range raw {
		c := math.Max(0, math.Cos(float64(i)/300*2*math.Pi*6))
		raw[i] = float32(60 * (1 - 0.5*c))
	}
	raw[17], raw[18] = 0, 0 // a hole
	fieldMu.Lock()
	fieldCars = map[int]*carLapProf{3: {best: 71.25, bestV: raw}}
	fieldMu.Unlock()
	tr := fieldTrace(3, 71.25)
	if tr == nil || tr.Src != "field" || tr.Bin != lapBin || len(tr.D) != 600 {
		t.Fatalf("trace: %+v", tr)
	}
	sum, brk, thr := 0.0, 0, 0
	for _, b := range tr.D {
		sum += float64(lapBin) / b[0]
		if b[2] > 0 {
			brk++
		}
		if b[1] > 0 {
			thr++
		}
	}
	if math.Abs(sum-71.25) > 0.05 || tr.D[0][5] != 0 || tr.D[599][5] <= tr.D[1][5] {
		t.Fatalf("the trace does not add up to the lap: %.3f, t0 %v tN %v", sum, tr.D[0][5], tr.D[599][5])
	}
	if brk < 30 || thr < 100 {
		t.Fatalf("estimated pedals: braking in %d bins, throttle in %d", brk, thr)
	}
	if fieldTrace(3, 70) != nil || fieldTrace(4, 71.25) != nil {
		t.Fatal("a trace for another lap time or car")
	}
	fieldMu.Lock()
	fieldCars = map[int]*carLapProf{}
	fieldMu.Unlock()
	if sessionNumOf("900-2") != 2 || sessionNumOf("t-Spa-0") != 0 || sessionNumOf("x") != -1 {
		t.Fatal("session number of an id")
	}
	// the recorder's incidents replace the watcher's, lap by lap
	setLapIncs(2, 4, []float64{420, 2, 900, 1}, []string{"loss", "off"})
	evs, per := recorderIncidents(2, []raceLap{{N: 3}, {N: 4}})
	if len(evs) != 2 || evs[0].Lap != 4 || evs[0].Pts != 2 || evs[0].Kind != "loss" || per[4] != 3 || per[3] != 0 {
		t.Fatalf("recorder incidents: %+v %v", evs, per)
	}
	if _, per := recorderIncidents(9, []raceLap{{N: 1}}); per != nil {
		t.Fatal("incidents of laps the recorder never saw")
	}
}

func TestDriverBlockSkipsFastestLap(t *testing.T) {
	d := driverBlock(testRaceYAML, "0")
	if !strings.Contains(d, "UserName: Driver C") {
		t.Fatalf("driver block: %q", d)
	}
}

func TestBrakePoints(t *testing.T) {
	// 60 m/s, braking at 500 m down to 25 m/s by 600 m, then back up; a hole in the data
	v := make([]float32, 200)
	for i := range v {
		d := float64(i) * fieldBin
		s := 60.0
		if d >= 500 && d < 600 {
			s = 60 - (d-500)*0.35
		} else if d >= 600 && d < 900 {
			s = 25 + (d-600)*0.1
		}
		v[i] = float32(s)
	}
	v[30] = 0
	d, vm := brakePoints(v)
	if len(d) != 1 || d[0] < 480 || d[0] > 510 || vm[0] > 27 {
		t.Fatalf("brake points %v %v", d, vm)
	}
}

func TestParseNews(t *testing.T) {
	feed := `<?xml version="1.0"?><rss xmlns:content="http://purl.org/rss/1.0/modules/content/"><channel>
<item><title>2026 Season 4 Release Notes &amp; more</title><link>https://www.iracing.com/2026-s4/</link><pubDate>Tue, 08 Sep 2026 15:00:00 +0000</pubDate>
<description><![CDATA[<p>New cars and <b>tracks</b> this season.</p>]]></description><category>News</category>
<content:encoded><![CDATA[<img src="https://www.iracing.com/img.jpg">Text]]></content:encoded></item>
<item><title>Bad</title><link>javascript:alert(1)</link></item></channel></rss>`
	n, err := parseNews([]byte(feed))
	if err != nil || len(n) != 1 || n[0].Title != "2026 Season 4 Release Notes & more" || n[0].Summary != "New cars and tracks this season." || n[0].Image != "https://www.iracing.com/img.jpg" || n[0].Date == 0 {
		t.Fatalf("news: %+v %v", n, err)
	}
}
func TestFixRaceIncidents(t *testing.T) {
	r := &raceReport{Inc: 0, Laps: []raceLap{{N: 1}, {N: 2}, {N: 3, Inc: 1}}}
	ch := fixRaceIncidents(r, []lapInc{{N: 2, I: 4}, {N: 3, I: 2}}, []incEvent{{Lap: 2, D: 300, Pts: 4, Kind: "contact"}, {Lap: 3, D: 10, Pts: 1, Kind: "weird"}}, 6)
	if !ch || r.Laps[1].Inc != 4 || r.Laps[2].Inc != 1 || len(r.Incidents) != 2 || r.Incidents[1].Kind != "off" || r.Inc != 6 {
		t.Fatalf("incidents not filled in: %+v", r)
	}
	if fixRaceIncidents(r, []lapInc{{N: 2, I: 4}}, nil, 3) {
		t.Fatal("a second repair with nothing new changes nothing")
	}
}

func TestLicClassAndTestDrive(t *testing.T) {
	for in, want := range map[string]string{"B 3.21": "B", "a 4.99": "A", "WC 4.99": "P", "Pro 3.0": "P", "R 2.50": "R", "": "", "X 1.0": ""} {
		if got := licClass(in); got != want {
			t.Fatalf("licClass(%q) = %q, want %q", in, got, want)
		}
	}
	if !isTestDrive("Offline Testing") || isTestDrive("Practice") || isTestDrive("Race") || isTestDrive("Lone Qualify") {
		t.Fatal("only a test drive is a test drive")
	}
	r := &raceReport{TrackID: 166, Track: "Okayama", Best: 99, Cat: "Road", Official: true, Results: []raceResult{{Name: "x", Laps: 5, Best: 98.5, CarID: 67, key: "k1", Lic: "A"}}}
	top := fieldTopLaps(r)
	if len(top) != 1 || top[0]["lic"] != "A" || top[0]["cat"] != "Road" || top[0]["official"] != true || top[0]["kind"] != "Race" {
		t.Fatalf("a rival's lap carries their class, the discipline and the official flag: %v", top)
	}
}

// AI drivers (an AI race, or bots filling a hosted one) and the pace car never go to the community
func TestFieldSkipsAI(t *testing.T) {
	y := strings.Replace(testRaceYAML, "   UserName: Fast One\n", "   UserName: Fast One\n   CarIsAI: 1\n", 1)
	if y == testRaceYAML {
		t.Fatal("the test race has no Fast One to turn into a bot")
	}
	res := sessionResults(y, 2)
	if len(res) != 3 || !res[0].ai || res[2].ai {
		t.Fatalf("AI flag: %+v", res)
	}
	r := &raceReport{TrackID: 515, Track: "Navarra", Best: 99, Results: res}
	for _, b := range fieldTopLaps(r) {
		if b["name"] == "Fast One" {
			t.Fatalf("a bot's lap would go to the community: %v", b)
		}
	}
	if top := fieldTopLaps(r); len(top) != 1 || top[0]["name"] != "Slow One" {
		t.Fatalf("only the real rival goes: %v", top)
	}
}

// DRINKS mode: a race says who drove it when a friend drove any lap (you by your public name), in order
func TestDrinksDrivers(t *testing.T) {
	if d := drinksDrivers([]raceLap{{N: 1}, {N: 2}}, "Kev"); d != nil {
		t.Fatalf("all mine: %v", d)
	}
	if d := drinksDrivers([]raceLap{{N: 1, Drv: "Ana"}, {N: 2, Drv: "ana"}}, "Kev"); len(d) != 1 || d[0] != "Ana" {
		t.Fatalf("one friend: %v", d)
	}
	if d := drinksDrivers([]raceLap{{N: 1}, {N: 2, Drv: "Ana"}, {N: 3, Drv: "Bob"}, {N: 4}}, ""); len(d) != 3 || d[0] != "Me" || d[1] != "Ana" || d[2] != "Bob" {
		t.Fatalf("several: %v", d)
	}
}

// a session with iRacing's AI drivers: its people's laps teach the model, the bots' never go up
func TestHasAI(t *testing.T) {
	if hasAI(testRaceYAML) {
		t.Fatal("no bots in the test race")
	}
	if !hasAI(strings.Replace(testRaceYAML, "   UserName: Slow One\n", "   UserName: Slow One\n   CarIsAI: 1\n", 1)) {
		t.Fatal("a bot in the race")
	}
}
