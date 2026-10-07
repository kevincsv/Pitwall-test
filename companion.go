package main

// Companion snapshot: the phone app can show your iRacing account, licences,
// credits, recent races and the season schedule without the PC. The PC keeps
// the last answer of a few iRacing Data API calls in companion.json; with a
// TrackIQ account it travels end-to-end encrypted with the rest of your
// synced profile. Big answers are trimmed to the fields the app uses.

import (
	"bytes"
	"encoding/json"
	"html"
	"log"
	"os"
	"path/filepath"
	"strconv"
	"strings"
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
	"track/get": {"track_id", "track_name", "config_name", "package_id", "free_with_subscription", "price", "track_config_length", "corners_per_lap",
		"location", "latitude", "longitude", "category", "max_cars", "grid_stalls", "pit_road_speed_limit", "night_lighting", "track_types", "track_type",
		"retired", "time_zone", "site_url", "is_oval", "is_dirt", "has_svg_map", "first_sale", "created"},
	"car/get": {"car_id", "car_name", "car_name_abbreviated", "package_id", "free_with_subscription", "price", "hp", "car_weight", "car_make",
		"car_model", "categories", "car_types", "car_type", "retired", "has_headlights", "has_multiple_dry_tire_types", "rain_enabled", "max_power_adjust_pct", "created"},
	// pictures and maps (served by iRacing's public image server), by id
	"track/assets":      nil,
	"car/assets":        nil,
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
	if strings.HasSuffix(path, "/assets") {
		body = trimAssets(body)
		if body == nil {
			return
		}
	} else if fields != nil {
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

// companionRefresher keeps the snapshot fresh while you are signed in to iRacing and to a TrackIQ account.
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
	for _, p := range []string{"series/seasons", "track/get", "car/get", "carclass/get", "season/race_guide", "track/assets", "car/assets"} {
		get(p, "")
	}
	publishSeason()
}

// publishSeason shares the season schedule (no personal data) with the TrackIQ
// server so apps without an iRacing login see the real season. The server only
// accepts it from the accounts its owner lists in SEASON_UPLOADERS.
func publishSeason() {
	compMu.Lock()
	part := func(k string) json.RawMessage {
		if e, ok := compData[k]; ok {
			return e.Body
		}
		return json.RawMessage("null")
	}
	season := map[string]json.RawMessage{"seasons": part("series/seasons"), "tracks": part("track/get"), "cars": part("car/get"),
		"classes": part("carclass/get"), "guide": part("season/race_guide"), "trackAssets": part("track/assets"), "carAssets": part("car/assets")}
	compMu.Unlock()
	if string(season["seasons"]) == "null" {
		return
	}
	if _, err := commCall("POST", "/season", map[string]any{"season": season}, true); err != nil && !strings.Contains(err.Error(), "cannot publish") {
		log.Println("Season schedule:", err)
	}
}

// trimAssets keeps, for each track or car id, the picture and map file names and a short description.
func trimAssets(body []byte) []byte {
	var all map[string]map[string]any
	if json.Unmarshal(body, &all) != nil {
		return nil
	}
	keep := map[string]bool{"folder": true, "small_image": true, "large_image": true, "logo": true, "track_map": true, "track_map_layers": true, "detail_copy": true}
	for id, a := range all {
		if a == nil {
			delete(all, id)
			continue
		}
		for k, v := range a {
			if !keep[k] {
				delete(a, k)
				continue
			}
			if k == "detail_copy" {
				if t, ok := v.(string); ok {
					a[k] = plainText(t, 900)
				}
			}
		}
	}
	b, _ := json.Marshal(all)
	return b
}

// plainText removes HTML tags and entities and cuts the text at max characters.
func plainText(h string, max int) string {
	t := tagRe.ReplaceAllString(h, " ")
	t = html.UnescapeString(t)
	t = strings.Join(strings.Fields(t), " ")
	if r := []rune(t); len(r) > max {
		t = strings.TrimSpace(string(r[:max])) + "…"
	}
	return t
}
