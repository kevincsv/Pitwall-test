package main

// Which sim Pitlane HQ reads: iRacing, Le Mans Ultimate, or whichever is running.

import "strings"

var gameNames = map[string]string{"iracing": "iRacing", "lmu": "Le Mans Ultimate"}

func gamePref() string {
	cfgMu.Lock()
	g := strings.ToLower(cfg.Game)
	cfgMu.Unlock()
	if _, ok := gameNames[g]; ok {
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
	default:
		try = []func() Source{newSimSource, newLMUSource}
	}
	for _, f := range try {
		s := f()
		if err := s.Open(); err == nil {
			return s
		}
	}
	return nil
}
