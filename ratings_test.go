package main

import "testing"

// your iRating of every discipline: the newest race of each says what it left you, a session seen in the game wins
// over an older race, and an Oval race never touches the Formula Car one
func TestRatingsPerDiscipline(t *testing.T) {
	dir := t.TempDir()
	t.Setenv("XDG_CONFIG_HOME", dir)
	t.Setenv("HOME", dir)
	t.Setenv("APPDATA", dir)
	initProfiles()
	journalMu.Lock()
	saved := races
	races = []*raceReport{
		{ID: "a", When: 1, IR: 1900, IRChange: -42, IRReal: true, Cat: "Road", Car: "Dallara F3", Results: []raceResult{{Me: true, Lic: "A"}}},
		{ID: "b", When: 2, IR: 980, IRChange: 15, Cat: "Road", Car: "BMW M2 Racing (G87)"},
		{ID: "c", When: 3, IR: 1500, IRChange: 20, IRReal: true, Cat: "Oval", Car: "NASCAR Cup Series Next Gen"},
	}
	journalMu.Unlock()
	defer func() { journalMu.Lock(); races = saved; journalMu.Unlock() }()
	ratingsMu.Lock()
	ratings = map[string]*discRating{}
	ratingsMu.Unlock()
	ratingsFromRaces()
	r := ratingsCopy()
	if r["formula_car"] == nil || r["formula_car"].IR != 1858 || r["formula_car"].Lic != "A" || r["sports_car"].IR != 980 || r["oval"].IR != 1520 {
		t.Fatalf("from the races: %+v %+v %+v", r["formula_car"], r["sports_car"], r["oval"])
	}
	sessionRating("WeekendInfo:\n Category: Road\nDriverInfo:\n DriverCarIdx: 0\n Drivers:\n - CarIdx: 0\n   UserName: Me\n   CarScreenName: Dallara F3\n   IRating: 1870\n   LicString: A 2.10\n")
	r = ratingsCopy()
	if r["formula_car"].IR != 1870 || r["formula_car"].Lic != "A 2.10" || r["formula_car"].Src != "session" || r["sports_car"].IR != 980 {
		t.Fatalf("from a session: %+v", r["formula_car"])
	}
}
