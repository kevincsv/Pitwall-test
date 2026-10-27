package main

import (
	"encoding/json"
	"strings"
	"testing"
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
