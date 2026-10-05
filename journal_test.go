package main

import (
	"encoding/json"
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
     Incidents: 2
     ReasonOutStr: Running
   - Position: 3
     ClassPosition: 2
     CarIdx: 2
     Lap: 11
     FastestTime: 98.300
     LapsComplete: 11
     Incidents: 4
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
   UserName: Alex D
   CarID: 67
   CarPath: mx5 mx52016
   CarScreenName: Global Mazda MX-5 Cup
   CarClassID: 74
   CarClassShortName: MX5
   IRating: 2000
 - CarIdx: 1
   UserName: Fast One
   CarID: 67
   CarScreenName: Global Mazda MX-5 Cup
   CarClassID: 74
   IRating: 2600
 - CarIdx: 2
   UserName: Slow One
   CarID: 67
   CarScreenName: Global Mazda MX-5 Cup
   CarClassID: 74
   IRating: 1500
`

func TestRaceReport(t *testing.T) {
	c := currentCarTrack(testRaceYAML)
	if c.CarID != 67 || c.TrackID != 515 || c.Car != "Global Mazda MX-5 Cup" || c.CarPath != "mx5 mx52016" || c.Track != "Circuito de Navarra · Full" || c.Tank != 45 {
		t.Fatalf("car/track: %+v", c)
	}
	res := sessionResults(testRaceYAML, 2)
	if len(res) != 3 || res[0].Name != "Fast One" || res[1].Name != "Alex D" || !res[1].Me || res[1].ClassPos != 2 || res[2].Best != 98.3 {
		t.Fatalf("results: %+v", res)
	}
	tr := &raceTrack{id: "900-2", meta: c, started: true, start: 3, lastPos: 2, lastInc: 2, fuel0: 30, lastFuel: 6, pits: 0,
		laps: []raceLap{{N: 1, Time: 99.5, Pos: 3}, {N: 2, Time: 98.0, Pos: 3}, {N: 3, Time: 98.2, Pos: 2}, {N: 4, Time: 101.0, Pos: 2, Inc: 2}, {N: 5, Time: 97.9, Pos: 2}}}
	r := buildReport(testRaceYAML, tr, false)
	if r.Finish != 2 || r.Start != 3 || r.Field != 3 || r.Inc != 2 || r.Best != 97.9 || r.FieldBest != 97.5 || r.FuelUsed != 24 {
		t.Fatalf("report: %+v", r)
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

func TestDriverBlockSkipsFastestLap(t *testing.T) {
	d := driverBlock(testRaceYAML, "0")
	if !strings.Contains(d, "UserName: Alex D") {
		t.Fatalf("driver block: %q", d)
	}
}
