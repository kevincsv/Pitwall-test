package main

// Companion snapshot: the phone app can show your iRacing account, licences,
// credits, recent races and the season schedule without the PC. The PC keeps
// the last answer of a few iRacing Data API calls in companion.json; with a
// Pitlane HQ account it travels end-to-end encrypted with the rest of your
// synced profile. Big answers are trimmed to the fields the app uses.

import (
	"bytes"
	"encoding/json"
	"log"
	"os"
	"path/filepath"
	"strconv"
	"sync"
	"time"
)

type compEntry struct {
	T    int64           `json:"t"`
	Body json.RawMessage `json:"body"`
}

var (
	compMu   sync.Mutex
	compData map[string]compEntry
)

// paths the phone app reads, with the fields kept for the big ones (nil: keep all)
var compKeep = map[string][]string{
	"member/info": nil, "member/account": nil, "member/participation_credits": nil, "member/chart_data": nil,
	"stats/member_recent_races": nil, "stats/member_career": nil, "stats/member_yearly": nil, "stats/member_summary": nil,
	"series/seasons": {"season_id", "series_id", "schedules", "series_name", "season_name", "license_group", "fixed_setup", "official", "multiclass",
		"schedule_description", "car_class_ids", "max_weeks", "drops", "incident_limit", "active", "complete", "race_week_num", "start_date",
		"week_end_time", "category", "track", "track_id", "track_name", "race_week_cars", "car_id", "race_lap_limit", "race_time_limit",
		"race_time_descriptors", "repeating", "first_session_time", "repeat_minutes", "day_offset", "session_times", "session_minutes",
		"weather", "weather_summary", "temp_high", "temp_low", "temp_units", "precip_chance"},
	"track/get":         {"track_id", "track_name", "config_name", "package_id", "free_with_subscription", "price"},
	"car/get":           {"car_id", "car_name", "car_name_abbreviated", "package_id", "free_with_subscription"},
	"carclass/get":      {"car_class_id", "cars_in_class", "car_id"},
	"season/race_guide": {"sessions", "season_id", "start_time", "entry_count"},
}

func compPath() string { return filepath.Join(activeDir(), "companion.json") }

func loadCompanion() {
	m := map[string]compEntry{}
	if b, err := os.ReadFile(compPath()); err == nil {
		json.Unmarshal(b, &m)
	}
	compMu.Lock()
	compData = m
	compMu.Unlock()
}

// prune keeps only the allowed keys (at any depth).
func prune(v any, keep map[string]bool) any {
	switch x := v.(type) {
	case map[string]any:
		for k, val := range x {
			if !keep[k] {
				delete(x, k)
				continue
			}
			x[k] = prune(val, keep)
		}
	case []any:
		for i := range x {
			x[i] = prune(x[i], keep)
		}
	}
	return v
}

// companionStore remembers an answer the phone may need (called after each successful iRacing call).
func companionStore(path, rawQuery string, body []byte) {
	fields, ok := compKeep[path]
	if !ok || len(body) == 0 || len(body) > 32<<20 {
		return
	}
	if fields != nil {
		var v any
		if json.Unmarshal(body, &v) != nil {
			return
		}
		keep := map[string]bool{}
		for _, f := range fields {
			keep[f] = true
		}
		body, _ = json.Marshal(prune(v, keep))
	}
	key := path
	if rawQuery != "" {
		key += "?" + rawQuery
	}
	compMu.Lock()
	defer compMu.Unlock()
	if compData == nil {
		compData = map[string]compEntry{}
	}
	if old, ok := compData[key]; ok && bytes.Equal(old.Body, body) {
		return // unchanged: the file stays the same so nothing new is synced
	}
	compData[key] = compEntry{T: time.Now().UnixMilli(), Body: body}
	b, _ := json.Marshal(compData)
	os.MkdirAll(activeDir(), 0o700)
	os.WriteFile(compPath(), b, 0o600)
}

// companionRefresher keeps the snapshot fresh while you are signed in to iRacing and to a Pitlane HQ account.
func companionRefresher() {
	time.Sleep(90 * time.Second)
	for {
		loadPL()
		plMu.Lock()
		signed := plAcc.Token != ""
		plMu.Unlock()
		if signed {
			if st, _ := accountStatus()["loggedIn"].(bool); st {
				refreshCompanion()
			}
		}
		time.Sleep(6 * time.Hour)
	}
}

func refreshCompanion() {
	get := func(path, q string) []byte {
		b, code, err := dataGet(path, q)
		if err != nil || code >= 300 {
			return nil
		}
		companionStore(path, q, b)
		return b
	}
	info := get("member/info", "")
	var m struct {
		CustID int `json:"cust_id"`
	}
	json.Unmarshal(info, &m)
	if m.CustID == 0 {
		log.Println("Companion: could not read member/info")
		return
	}
	id := strconv.Itoa(m.CustID)
	get("member/account", "")
	get("member/participation_credits", "")
	get("stats/member_recent_races", "cust_id="+id)
	get("stats/member_career", "cust_id="+id)
	get("stats/member_yearly", "cust_id="+id)
	for _, cat := range []string{"1", "2", "3", "4", "5", "6"} {
		get("member/chart_data", "cust_id="+id+"&category_id="+cat+"&chart_type=1")
		get("member/chart_data", "cust_id="+id+"&category_id="+cat+"&chart_type=3")
	}
	for _, p := range []string{"series/seasons", "track/get", "car/get", "carclass/get", "season/race_guide"} {
		get(p, "")
	}
}
