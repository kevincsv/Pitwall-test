package main

import "testing"

// a session of another category (Sports Car after a Formula Car race) brings that category's iRating: it is not
// what the race gave, so it never replaces the estimate; and a race already spoiled so goes back to the estimate
func TestRealIRotherCategory(t *testing.T) {
	journalMu.Lock()
	saved := races
	journalMu.Unlock()
	defer func() { journalMu.Lock(); races = saved; journalMu.Unlock() }()
	r := &raceReport{ID: "f", Subsession: 1, IR: 1959, IRChange: -40, Cat: "Road", Car: "Dallara F3",
		Results: []raceResult{{Pos: 1, IR: 2100, Laps: 10}, {Pos: 2, IR: 1959, Laps: 10, Me: true}, {Pos: 3, IR: 1800, Laps: 10}}}
	journalMu.Lock()
	races = []*raceReport{r}
	journalMu.Unlock()
	applyRealIR(980, 2, "Road", "BMW M2 Racing") // the Sports Car iRating: far from this race's
	if r.IRReal || r.IRChange != -40 {
		t.Fatalf("took another category's iRating: %+v", r)
	}
	applyRealIR(1917, 3, "Oval", "NASCAR Cup Series Next Gen") // another category by name
	if r.IRReal {
		t.Fatal("took an Oval session's iRating")
	}
	applyRealIR(1917, 4, "Road", "Dallara F3")
	if !r.IRReal || r.IRChange != -42 {
		t.Fatalf("the real change: %+v", r)
	}
	bad := &raceReport{IR: 1959, IRChange: -979, IRReal: true, Results: []raceResult{{Pos: 1, IR: 2100, Laps: 10}, {Pos: 2, IR: 1959, Laps: 10, Me: true, IRChange: -979}}}
	if !repairRealIR(bad) || bad.IRReal || abs(bad.IRChange) > maxRealIRStep || bad.Results[1].IRChange != bad.IRChange {
		t.Fatalf("not repaired: %+v", bad)
	}
}

// a Formula Car race, then a Sports Car race: the next Formula Car session still gives the Formula race its
// real iRating (it looks for your last race of that discipline, not just your last race)
func TestRealIRskipsOtherDiscipline(t *testing.T) {
	journalMu.Lock()
	saved := races
	journalMu.Unlock()
	defer func() { journalMu.Lock(); races = saved; journalMu.Unlock() }()
	f := &raceReport{ID: "f", When: 1, Subsession: 1, IR: 1917, IRChange: -40, Cat: "Road", Car: "Super Formula Lights", Results: []raceResult{{Pos: 2, IR: 1917, Me: true}}}
	s := &raceReport{ID: "s", When: 2, Subsession: 2, IR: 980, IRChange: 12, IRReal: true, Cat: "Road", Car: "BMW M2 Racing (G87)"}
	journalMu.Lock()
	races = []*raceReport{f, s}
	journalMu.Unlock()
	applyRealIR(1875, 3, "Road", "Super Formula Lights")
	if !f.IRReal || f.IRChange != -42 || f.Results[0].IRChange != -42 || s.IRChange != 12 {
		t.Fatalf("the Formula race: %+v / the Sports Car race: %+v", f, s)
	}
	// and from the next race of the same discipline, when its session came before any other
	a := &raceReport{ID: "a", When: 1, Subsession: 10, IR: 1917, IRChange: -40, Cat: "Road", Car: "Dallara F3"}
	b := &raceReport{ID: "b", When: 2, Subsession: 11, IR: 2000, Cat: "Road", Car: "Porsche 911 GT3 Cup (992)"}
	c := &raceReport{ID: "c", When: 3, Subsession: 12, IR: 1875, Cat: "Road", Car: "Ray FF1600"}
	if !chainRealIR([]*raceReport{a, b, c}) || !a.IRReal || a.IRChange != -42 || b.IRReal {
		t.Fatalf("chained: %+v %+v", a, b)
	}
	for car, want := range map[string]string{"Dallara P217": "sports_car", "Dallara IR18": "formula_car", "Mazda MX-5 Cup": "sports_car", "Formula Vee": "formula_car", "Ligier JS F4": "formula_car", "Mercedes-AMG W13 E Performance": "formula_car"} {
		if d := discipline("Road", car); d != want {
			t.Fatalf("%s: %s, want %s", car, d, want)
		}
	}
	if discipline("DirtOval", "x") != "dirt_oval" || discipline("Oval", "Dallara IR18") != "oval" {
		t.Fatal("the session's own category wins when it is sure")
	}
}
