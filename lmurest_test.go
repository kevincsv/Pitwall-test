package main

import (
	"context"
	"encoding/json"
	"errors"
	"strings"
	"testing"
	"time"
)

// the shapes the community saw (go-lmu-api's /rest/profile/profileInfo/getProfileInfo) carry no rating; the
// shapes a rating may take are read as the game writes them, and other drivers' lists are never yours
func TestLMURatingsFromJSON(t *testing.T) {
	cases := []struct{ in, sr, dr string }{
		{`{"language":"en","name":"A B","nationality":"ES","nick":"ab","steamID":"7656"}`, "", ""},
		{`{"safetyRating":"Silver 2.45","driverRating":"Bronze"}`, "Silver 2.45", "Bronze"},
		{`{"profile":{"SafetyRating":{"tier":"Gold","value":3.141},"DriverRank":{"name":"Silver","rating":1523}}}`, "Gold 3.14", "Silver 1523"},
		{`{"ratings":{"safety":87,"driver":"Platinum"}}`, "87", "Platinum"},
		{`{"SR":"B","DR":2}`, "B", "2"},
		{`[{"driverName":"Me","safetyRating":"Gold"}]`, "Gold", ""},
		{`[{"driverName":"X","safetyRating":"Gold"},{"driverName":"Y","safetyRating":"Bronze"}]`, "", ""},
		{`{"SESSSET_safetycar_thresh":{"value":1},"Safety Car Thresh":2,"driverName":"Me"}`, "", ""},
		{`not json`, "", ""},
	}
	for _, c := range cases {
		sr, dr := lmuRatingsFromJSON([]byte(c.in))
		if sr != c.sr || dr != c.dr {
			t.Errorf("%s: got %q %q, want %q %q", c.in, sr, dr, c.sr, c.dr)
		}
	}
}

// the game's API list: only GET paths without parameters whose names speak of the profile or a rating, and none
// that does something or hands out a secret
func TestLMUSwaggerCandidates(t *testing.T) {
	sw := `{"swagger":"2.0","paths":{
		"/rest/profile/":{"get":{}},
		"/rest/profile/getAuthSessionTicket":{"get":{}},
		"/rest/profile/profileInfo/setProfileInfo":{"post":{}},
		"/rest/profile/ratings":{"get":{}},
		"/rest/competition/career":{"get":{}},
		"/rest/multiplayer/join":{"get":{"parameters":[{"in":"query","name":"password","required":true}]}},
		"/rest/race/car":{"get":{}},
		"/rest/profile/{id}":{"get":{}},
		"/rest/watch/standings":{"get":{}}}}`
	got := strings.Join(lmuSwaggerCandidates([]byte(sw)), " ")
	if got != "/rest/competition/career /rest/profile/ /rest/profile/ratings" {
		t.Fatalf("candidates: %s", got)
	}
}

// never while the player is in the game's realtime, and at most one round a minute
func TestLMURestGate(t *testing.T) {
	var g lmuRestGate
	t0 := time.Unix(1000, 0)
	if g.due(t0, true) {
		t.Fatal("polled on track")
	}
	if !g.due(t0, false) {
		t.Fatal("not polled in the menus")
	}
	if g.due(t0.Add(30*time.Second), false) || g.due(t0.Add(70*time.Second), true) {
		t.Fatal("polled too soon, or on track")
	}
	if !g.due(t0.Add(70*time.Second), false) {
		t.Fatal("not polled after a minute")
	}
}

// a round through a fake game: discovery once, then only the path that gave a rating; nothing on track
func TestLMURestTick(t *testing.T) {
	dir := t.TempDir()
	t.Setenv("XDG_CONFIG_HOME", dir)
	t.Setenv("HOME", dir)
	t.Setenv("APPDATA", dir)
	initProfiles()
	ratingsMu.Lock()
	saved := ratings
	ratings = map[string]*discRating{}
	ratingsMu.Unlock()
	defer func() { ratingsMu.Lock(); ratings = saved; ratingsMu.Unlock() }()

	var calls []string
	sr := "Silver 2.45"
	r := &lmuRest{get: func(_ context.Context, url string) (int, []byte, error) {
		calls = append(calls, url)
		if !strings.HasPrefix(url, "http://127.0.0.1:6397") {
			return 0, nil, errors.New("refused")
		}
		switch strings.TrimPrefix(url, "http://127.0.0.1:6397") {
		case "/swagger-schema.json":
			return 200, []byte(`{"paths":{"/rest/profile/ratings":{"get":{}},"/rest/multiplayer/join":{"get":{}}}}`), nil
		case "/rest/profile/ratings":
			return 200, []byte(`{"safetyRating":"` + sr + `","driverRating":"Bronze 1200"}`), nil
		case "/rest/profile/":
			return 200, []byte(`{"name":"A","nick":"a","steamID":"1"}`), nil
		}
		return 404, nil, nil
	}}
	r.tick(true)
	if len(calls) != 0 {
		t.Fatalf("called on track: %v", calls)
	}
	r.tick(false)
	for _, c := range calls {
		if strings.Contains(c, "join") {
			t.Fatalf("called %s", c)
		}
	}
	ratingsMu.Lock()
	got := ratings["lmu"]
	ratingsMu.Unlock()
	if got == nil || got.SR != "Silver 2.45" || got.DR != "Bronze 1200" || got.IR != 0 {
		t.Fatalf("lmu: %+v", got)
	}
	if len(r.paths) != 1 || r.paths[0] != "/rest/profile/ratings" {
		t.Fatalf("paths: %v", r.paths)
	}
	calls = nil
	sr = "Gold 3.10"
	r.gate.last = time.Now().Add(-2 * time.Minute)
	r.tick(false)
	if len(calls) != 1 {
		t.Fatalf("second round: %v", calls)
	}
	ratingsMu.Lock()
	got = ratings["lmu"]
	ratingsMu.Unlock()
	if got.SR != "Gold 3.10" || got.DR != "Bronze 1200" {
		t.Fatalf("second round: %+v", got)
	}
	// ratings.json keeps it next to iRacing's disciplines, and the races never drop it
	ratingsFromRaces()
	if c := ratingsCopy(); c["lmu"] == nil || c["lmu"].SR != "Gold 3.10" {
		t.Fatalf("dropped: %+v", c["lmu"])
	}
}

// the same value again changes nothing (ratings.json is not rewritten every minute); a value missing keeps the old
func TestLMUSetRating(t *testing.T) {
	ratingsMu.Lock()
	defer ratingsMu.Unlock()
	saved := ratings
	ratings = map[string]*discRating{"formula_car": {IR: 1500, Lic: "B 3.21", At: 1}}
	defer func() { ratings = saved }()
	if lmuSetRating("", "", 5) || !lmuSetRating("Silver 2.45", "", 10) || lmuSetRating("Silver 2.45", "", 20) {
		t.Fatal("set")
	}
	if !lmuSetRating("", "Gold", 30) || ratings["lmu"].SR != "Silver 2.45" || ratings["lmu"].DR != "Gold" || ratings["lmu"].At != 30 {
		t.Fatalf("%+v", ratings["lmu"])
	}
	b, _ := json.Marshal(ratings)
	if !strings.Contains(string(b), `"lmu":{"sr":"Silver 2.45","dr":"Gold","at":30,"src":"lmu"}`) || !strings.Contains(string(b), `"formula_car":{"ir":1500,"lic":"B 3.21","at":1}`) {
		t.Fatalf("ratings.json: %s", b)
	}
}

// two devices: one PC saw LMU's ratings, the other a new iRating; the account keeps both
func TestMergeRatingsWithLMU(t *testing.T) {
	base := []byte(`{"formula_car":{"ir":1500,"lic":"B 3.21","at":1}}`)
	local := []byte(`{"formula_car":{"ir":1500,"lic":"B 3.21","at":1},"lmu":{"sr":"Silver 2.45","dr":"Bronze","at":5,"src":"lmu"}}`)
	remote := []byte(`{"formula_car":{"ir":1550,"lic":"B 3.40","at":9}}`)
	for _, pref := range []bool{false, true} {
		var m map[string]*discRating
		if err := json.Unmarshal(mergeJSON(base, local, remote, pref), &m); err != nil {
			t.Fatal(err)
		}
		if m["lmu"] == nil || m["lmu"].SR != "Silver 2.45" || m["formula_car"].IR != 1550 {
			t.Fatalf("merged (%v): %+v %+v", pref, m["lmu"], m["formula_car"])
		}
	}
}

// the game's address is on this PC: local mode lets it through
func TestLMURestIsLocal(t *testing.T) {
	for _, b := range lmuRestBases {
		h := strings.TrimPrefix(b, "http://")
		if !localHost(h) {
			t.Fatalf("%s is not local", h)
		}
	}
}
