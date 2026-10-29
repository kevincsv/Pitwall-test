package main

import (
	"os"
	"regexp"
	"testing"
)

// The one table of what works in which game (web/dist/pitwall-games.js) reads in Go, names only real overlays,
// columns and items, and keeps iRacing-only things out of Le Mans Ultimate.
func TestGameSupportTable(t *testing.T) {
	b, err := os.ReadFile("web/dist/pitwall-games.js")
	if err != nil {
		t.Fatal(err)
	}
	tb, err := parseGameTable(string(b))
	if err != nil {
		t.Fatal("pitwall-games.js is not plain JSON:", err)
	}
	if len(tb.Games) != 2 || tb.Games[0] != "iracing" || tb.Games[1] != "lmu" {
		t.Fatalf("games %v", tb.Games)
	}
	for g := range gameNames {
		if _, ok := tb.Lacks[g]; !ok {
			t.Errorf("no lacks for %s", g)
		}
	}
	ovs := map[string]bool{}
	for _, n := range overlayOrder {
		ovs[n] = true
	}
	for n := range tb.Needs["widgets"] {
		if !ovs[n] {
			t.Errorf("widgets.%s is no overlay", n)
		}
	}
	html, _ := os.ReadFile("web/dist/index.html")
	for _, kind := range []string{"columns", "items"} { // COLS and ITEMS in index.html
		for n := range tb.Needs[kind] {
			if !regexp.MustCompile(`\b` + n + `:\{n:\[`).Match(html) {
				t.Errorf("%s.%s is not in index.html", kind, n)
			}
		}
	}
	for _, c := range []struct {
		game, kind, name string
		want             bool
	}{
		{"lmu", "columns", "ir", false}, {"lmu", "columns", "irc", false}, {"lmu", "columns", "lic", false}, {"lmu", "columns", "inc", false},
		{"lmu", "items", "sof", false}, {"lmu", "items", "irc", false}, {"lmu", "columns", "last", true}, {"lmu", "widgets", "radar", true},
		{"lmu", "widgets", "incidents", false}, {"iracing", "columns", "ir", true}, {"", "columns", "ir", true}, {"iracing", "widgets", "incidents", true},
	} {
		if got := gameHas(c.game, c.kind, c.name); got != c.want {
			t.Errorf("gameHas(%q,%q,%q) = %v", c.game, c.kind, c.name, got)
		}
	}
	got := gameKeep("lmu", "columns", []string{"pos", "num", "name", "lic", "ir", "irc", "last", "gap"})
	if len(got) != 5 || got[3] != "last" {
		t.Errorf("lmu columns %v", got)
	}
}

// Auto opens only what works in the game and what the driver did not switch off for it.
func TestAutoForGame(t *testing.T) {
	c := defaultConfig()
	c.AutoWidgets = []string{"radar", "relative", "incidents", "fuel"}
	c.UI = map[string]any{"autoOff": map[string]any{"lmu": []any{"fuel"}}}
	if got := autoFor(c, "iracing"); len(got) != 4 {
		t.Errorf("iracing %v", got)
	}
	got := autoFor(c, "lmu")
	if len(got) != 2 || got[0] != "radar" || got[1] != "relative" {
		t.Errorf("lmu %v", got)
	}
}
