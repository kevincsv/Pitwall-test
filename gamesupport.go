package main

// Which game each overlay, relative and standings column and header or footer item works with. The table is
// web/dist/pitwall-games.js, the same file the app reads: what each game does not send ("lacks") against what each
// thing needs ("needs"). The agent never opens by itself an overlay that does not work in the game being read, nor one
// the driver switched off for that game (ui.autoOff), and the relative and the standings leave out the columns and
// items the game does not send.

import (
	"encoding/json"
	"errors"
	"strings"
	"sync"
)

type gameTable struct {
	Games []string                       `json:"games"`
	Lacks map[string][]string            `json:"lacks"`
	Needs map[string]map[string][]string `json:"needs"`
}

var (
	gameSupOnce sync.Once
	gameSup     gameTable
)

// parseGameTable reads the JSON between the first "{" after "PW_GAMES=" and the last "}" of the file.
func parseGameTable(src string) (gameTable, error) {
	var t gameTable
	i := strings.Index(src, "PW_GAMES=")
	if i < 0 {
		return t, errors.New("no PW_GAMES table")
	}
	s := src[i:]
	a, b := strings.Index(s, "{"), strings.LastIndex(s, "}")
	if a < 0 || b < a {
		return t, errors.New("no PW_GAMES table")
	}
	err := json.Unmarshal([]byte(s[a:b+1]), &t)
	return t, err
}

func gameSupport() gameTable {
	gameSupOnce.Do(func() {
		if b, err := webFS.ReadFile("web/dist/pitwall-games.js"); err == nil {
			gameSup, _ = parseGameTable(string(b))
		}
	})
	return gameSup
}

// gameHas: the thing (kind "widgets", "columns" or "items") works in that game. An unknown game, or an empty one
// (the overlay before the stream said which), counts as iRacing.
func gameHas(game, kind, name string) bool {
	t := gameSupport()
	if game == "" || game == "demo" {
		game = "iracing"
	}
	lacks := t.Lacks[game]
	for _, n := range t.Needs[kind][name] {
		for _, l := range lacks {
			if n == l {
				return false
			}
		}
	}
	return true
}

// gameKeep: the names of a list the game has.
func gameKeep(game, kind string, list []string) []string {
	out := make([]string, 0, len(list))
	for _, n := range list {
		if gameHas(game, kind, n) {
			out = append(out, n)
		}
	}
	if len(out) == len(list) {
		return list
	}
	return out
}

// autoFor: the overlays on Auto that open in this game: those that work there and that the driver did not switch off
// for it (ui.autoOff = {"lmu": ["radar"]}).
func autoFor(c Config, game string) []string {
	off := map[string]bool{}
	if m, ok := c.UI["autoOff"].(map[string]any); ok {
		if l, ok := m[game].([]any); ok {
			for _, x := range l {
				if s, ok := x.(string); ok {
					off[s] = true
				}
			}
		}
	}
	out := []string{}
	for _, w := range c.AutoWidgets {
		if !off[w] && gameHas(game, "widgets", w) {
			out = append(out, w)
		}
	}
	return out
}
