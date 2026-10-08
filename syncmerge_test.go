package main

import (
	"encoding/json"
	"testing"
)

func dec(t *testing.T, b []byte) any {
	t.Helper()
	v, ok := decodeJSON(b)
	if !ok {
		t.Fatalf("not JSON: %s", b)
	}
	return v
}

func TestMergeJSONKeys(t *testing.T) {
	base := []byte(`{"pw.lang":"es","pw.units":"metric","pw.lapch":{"speed":true,"gear":false}}`)
	local := []byte(`{"pw.lang":"es","pw.units":"imperial","pw.lapch":{"speed":true,"gear":false}}`) // this PC changed the units
	remote := []byte(`{"pw.lang":"en","pw.units":"metric","pw.lapch":{"speed":true,"gear":true}}`)   // the phone changed the language and a chart
	got := dec(t, mergeJSON(base, local, remote, false)).(map[string]any)
	if got["pw.units"] != "imperial" || got["pw.lang"] != "en" || got["pw.lapch"].(map[string]any)["gear"] != true {
		t.Fatalf("both sides' changes should stay: %v", got)
	}
}

func TestMergeJSONBothChangedSameKey(t *testing.T) {
	base := []byte(`{"a":1}`)
	local := []byte(`{"a":2}`)
	remote := []byte(`{"a":3}`)
	if v := dec(t, mergeJSON(base, local, remote, true)).(map[string]any)["a"]; v != json.Number("3") {
		t.Fatalf("the newer side (remote) should win: %v", v)
	}
	if v := dec(t, mergeJSON(base, local, remote, false)).(map[string]any)["a"]; v != json.Number("2") {
		t.Fatalf("the newer side (local) should win: %v", v)
	}
}

func TestMergeJSONDeletedKey(t *testing.T) {
	base := []byte(`{"a":1,"b":2}`)
	local := []byte(`{"a":1,"b":2,"c":3}`) // added c
	remote := []byte(`{"a":1}`)            // removed b
	got := dec(t, mergeJSON(base, local, remote, false)).(map[string]any)
	if _, ok := got["b"]; ok {
		t.Fatalf("b was removed on the other side: %v", got)
	}
	if got["c"] != json.Number("3") {
		t.Fatalf("c was added here: %v", got)
	}
}

func TestMergeRaces(t *testing.T) {
	base := []byte(`[{"id":"r1","when":1,"track":"A"},{"id":"r2","when":2,"track":"B"}]`)
	local := []byte(`[{"id":"r1","when":1,"track":"A"},{"id":"r2","when":2,"track":"B"},{"id":"r3","when":3,"track":"C"}]`) // a race recorded on this PC
	remote := []byte(`[{"id":"r2","when":2,"track":"B","laps":[{"n":1,"cut":false}]},{"id":"r4","when":4,"track":"D"}]`)    // r1 deleted on the phone, r2 edited, r4 from another PC
	got := dec(t, mergeJSON(base, local, remote, false)).([]any)
	ids := []string{}
	for _, x := range got {
		ids = append(ids, x.(map[string]any)["id"].(string))
	}
	want := []string{"r2", "r3", "r4"}
	if len(ids) != len(want) {
		t.Fatalf("races: %v, want %v", ids, want)
	}
	for i := range want {
		if ids[i] != want[i] {
			t.Fatalf("races: %v, want %v (in the order they were driven)", ids, want)
		}
	}
	if _, ok := got[0].(map[string]any)["laps"]; !ok {
		t.Fatalf("the edit of r2 on the phone should stay: %v", got[0])
	}
}

func TestMergeFirstSyncPrefersAccount(t *testing.T) {
	// a new PC signs in: no base. Its own keys stay, the account's win where both have one
	local := []byte(`{"pw.lang":"en","pw.thisPC":1}`)
	remote := []byte(`{"pw.lang":"es","pw.fromAccount":2}`)
	got := dec(t, mergeJSON(nil, local, remote, true)).(map[string]any)
	if got["pw.lang"] != "es" || got["pw.thisPC"] != json.Number("1") || got["pw.fromAccount"] != json.Number("2") {
		t.Fatalf("first sync: %v", got)
	}
	races := dec(t, mergeJSON(nil, []byte(`[{"id":"a","when":5}]`), []byte(`[{"id":"b","when":1}]`), true)).([]any)
	if len(races) != 2 || races[0].(map[string]any)["id"] != "b" {
		t.Fatalf("the race histories of both should join: %v", races)
	}
}

func TestMergeBundlesAndSame(t *testing.T) {
	base := map[string][]byte{"local.json": []byte(`{"a":1}`)}
	local := map[string][]byte{"local.json": []byte(`{"a":1}`), "notes.json": []byte(`{"5":{"t":"x"}}`)}
	remote := map[string][]byte{"local.json": []byte(`{"a":2}`), "races.json": []byte(`[]`)}
	m := mergeBundles(base, local, remote, func(string) bool { return false })
	if string(m["local.json"]) != `{"a":2}` || string(m["notes.json"]) == "" || string(m["races.json"]) != `[]` {
		t.Fatalf("bundle: %s", mustJSON(m))
	}
	if !sameBundle(map[string][]byte{"x": []byte(`{"a":1, "b":2}`)}, map[string][]byte{"x": []byte(`{"b":2,"a":1}`)}) {
		t.Fatal("the same content written differently is the same")
	}
	if sameBundle(map[string][]byte{"x": []byte(`{"a":1}`)}, map[string][]byte{"x": []byte(`{"a":2}`)}) {
		t.Fatal("different content")
	}
}

func mustJSON(v any) string { b, _ := json.Marshal(v); return string(b) }
