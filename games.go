package main

// Which sim Pitlane HQ reads: iRacing, Le Mans Ultimate, Assetto Corsa
// Competizione, Assetto Corsa, or whichever is running.

import (
	"fmt"
	"strings"
)

var gameNames = map[string]string{"iracing": "iRacing", "lmu": "Le Mans Ultimate", "acc": "Assetto Corsa Competizione", "ac": "Assetto Corsa"}

// currentGame is the game whose data Pitlane HQ reads now (the demo counts as iRacing).
func currentGame() string {
	tel.mu.RLock()
	g := tel.source
	tel.mu.RUnlock()
	if _, ok := gameNames[g]; ok {
		return g
	}
	return "iracing"
}

// gameKey keeps the keys of iRacing data as they were and prefixes the other games'.
func gameKey(game string, carID, trackID int) string {
	if game == "" || game == "iracing" {
		return fmt.Sprintf("%d:%d", carID, trackID)
	}
	return fmt.Sprintf("%s:%d:%d", game, carID, trackID)
}

// gameTag: what is stored with data (empty for iRacing, as before).
func gameTag(g string) string {
	if g == "iracing" {
		return ""
	}
	return g
}

// gameWIP: games still in development. Their readers stay in the code but Pitlane HQ
// does not open them yet: their tracks and data do not match iRacing's everywhere.
var gameWIP = map[string]bool{"lmu": true, "acc": true, "ac": true}

// wipAllowed: the admins of the server (signed in on this PC) can use what is still in development.
func wipAllowed() bool {
	loadPL()
	plMu.Lock()
	defer plMu.Unlock()
	return plAcc.Admin && plAcc.Token != ""
}

// gameLocked: a game in development, closed except for the admins of the server, who test it.
func gameLocked(g string) bool {
	if !gameWIP[g] {
		return false
	}
	return !wipAllowed()
}

func gamePref() string {
	cfgMu.Lock()
	g := strings.ToLower(cfg.Game)
	cfgMu.Unlock()
	if _, ok := gameNames[g]; ok && !gameLocked(g) {
		return g
	}
	return "auto"
}

// openGame opens the chosen game's data, or on Automatic the first one running.
func openGame(pref string) Source {
	var try []func() Source
	switch pref {
	case "iracing":
		try = []func() Source{newSimSource}
	case "lmu":
		try = []func() Source{newLMUSource}
	case "acc":
		try = []func() Source{newACCSource}
	case "ac":
		try = []func() Source{newACSource}
	default:
		try = []func() Source{newSimSource}
		if !gameLocked("lmu") {
			try = append(try, newLMUSource)
		}
		// both Assetto Corsa games use the same memory names: tell them apart by the program
		switch g := runningAC(); {
		case g == "acc" && !gameLocked("acc"):
			try = append(try, newACCSource)
		case g == "ac" && !gameLocked("ac"):
			try = append(try, newACSource)
		}
	}
	for _, f := range try {
		s := f()
		if err := s.Open(); err == nil {
			return s
		}
	}
	return nil
}
