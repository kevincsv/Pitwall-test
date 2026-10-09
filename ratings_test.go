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
	if r["formula_car"] == nil || r["formula_car"].IR != 1858 || r["formula_car"].Lic != "" || r["sports_car"].IR != 995 || r["oval"].IR != 1520 {
		t.Fatalf("from the races: %+v %+v %+v", r["formula_car"], r["sports_car"], r["oval"])
	}
	// what the last races of each discipline gave, for the licence cards (the copies only: ratings.json keeps none of it)
	if r["oval"].Chg != 20 || r["oval"].N != 1 || r["formula_car"].Chg != -42 || r["sports_car"].N != 1 || ratings["oval"].N != 0 {
		t.Fatalf("changes: %+v %+v", r["oval"], r["formula_car"])
	}
	sessionRating("WeekendInfo:\n Category: Road\nDriverInfo:\n DriverCarIdx: 0\n Drivers:\n - CarIdx: 0\n   UserName: Me\n   CarScreenName: Dallara F3\n   IRating: 1870\n   LicString: A 2.10\n")
	r = ratingsCopy()
	if r["formula_car"].IR != 1870 || r["formula_car"].Lic != "A 2.10" || r["formula_car"].Src != "session" || r["sports_car"].IR != 995 {
		t.Fatalf("from a session: %+v", r["formula_car"])
	}
}

// the licence is what the game shows in a session ("B 3.21") and nothing a race says: a later race keeps the one seen
// before, whatever class its record shows, and a class letter alone is no licence
func TestRaceKeepsTheLicence(t *testing.T) {
	ratingsMu.Lock()
	defer ratingsMu.Unlock()
	ratings = map[string]*discRating{}
	defer func() { ratings = map[string]*discRating{} }()
	noteRating("formula_car", 1000, "B 3.21", "session", 100)
	noteRating("formula_car", 1012, "", "race", 200)  // a race record without its licence
	noteRating("formula_car", 1020, "B", "race", 300) // a race record with the class alone
	noteRating("formula_car", 1030, "C", "race", 400) // a race record with another class
	if r := ratings["formula_car"]; r.Lic != "B 3.21" || r.IR != 1030 || r.Src != "race" {
		t.Fatalf("a race changed the licence: %+v", r)
	}
	noteRating("formula_car", 1040, "C 2.50", "session", 500) // the game shows the new licence in a session
	if r := ratings["formula_car"]; r.Lic != "C 2.50" || r.Src != "session" {
		t.Fatalf("a session did not set the licence: %+v", r)
	}
}

// a class letter alone, left in ratings.json by older versions (it came from a race), is no licence any more
func TestClassLetterIsNoLicence(t *testing.T) {
	dir := t.TempDir()
	t.Setenv("XDG_CONFIG_HOME", dir)
	t.Setenv("HOME", dir)
	t.Setenv("APPDATA", dir)
	initProfiles()
	journalMu.Lock()
	saved := races
	races = nil
	journalMu.Unlock()
	defer func() { journalMu.Lock(); races = saved; journalMu.Unlock() }()
	ratingsMu.Lock()
	ratings = map[string]*discRating{
		"sports_car":  {IR: 938, Lic: "R", At: 100, Src: "race"},
		"formula_car": {IR: 980, Lic: "B 3.21", At: 100, Src: "session"},
	}
	ratingsMu.Unlock()
	ratingsFromRaces()
	r := ratingsCopy()
	if r["sports_car"].Lic != "" || r["formula_car"].Lic != "B 3.21" {
		t.Fatalf("sports %+v, formula %+v", r["sports_car"], r["formula_car"])
	}
}
