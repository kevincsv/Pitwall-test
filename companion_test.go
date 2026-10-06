package main

import (
	"encoding/json"
	"os"
	"strings"
	"testing"
)

func TestCompanionStoreTrims(t *testing.T) {
	dir := t.TempDir()
	os.Setenv("XDG_CONFIG_HOME", dir)
	os.Setenv("APPDATA", dir)
	compData = map[string]compEntry{}
	body := `[{"track_id":1,"track_name":"Spa","config_name":"GP","price":11.95,"track_map":"https://big","pit_road_speed_limit":60}]`
	companionStore("track/get", "", []byte(body))
	companionStore("results/get", "subsession_id=1", []byte(`{"x":1}`)) // not something the phone needs
	compMu.Lock()
	defer compMu.Unlock()
	e, ok := compData["track/get"]
	if !ok {
		t.Fatal("track/get not kept")
	}
	if strings.Contains(string(e.Body), "track_map") || !strings.Contains(string(e.Body), `"track_name":"Spa"`) {
		t.Fatal("not trimmed:", string(e.Body))
	}
	if _, ok := compData["results/get?subsession_id=1"]; ok {
		t.Fatal("unlisted path stored")
	}
	var v []map[string]any
	json.Unmarshal(e.Body, &v)
	if len(v) != 1 || len(v[0]) != 5 { // pit_road_speed_limit is track info too
		t.Fatal("fields", v)
	}
}

func TestTrimAssets(t *testing.T) {
	b := trimAssets([]byte(`{"1":{"folder":"/img/tracks/spa","small_image":"s.jpg","gallery_images":"x","detail_copy":"<p>Spa &amp; <b>Eau Rouge</b></p>"}}`))
	var m map[string]map[string]any
	json.Unmarshal(b, &m)
	if m["1"]["gallery_images"] != nil || m["1"]["folder"] != "/img/tracks/spa" || m["1"]["detail_copy"] != "Spa & Eau Rouge" {
		t.Fatal("assets", string(b))
	}
}
