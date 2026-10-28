package main

import (
	"strconv"
	"testing"
)

// the PC links its own driver per game: iRacing by its own id, Le Mans Ultimate by the id made from the name the game
// shows (the one other PCs share that driver's laps under as a rival), never a profile's default name
func TestOwnLinkKey(t *testing.T) {
	ana := strconv.Itoa(lmuDriverID("Ana García"))
	cases := []struct {
		name, game, id, who string
		want                string
	}{
		{"iRacing by its id", "iracing", "123456", "whoever", driverKey("123456")},
		{"iRacing without an id", "iracing", "", "Ana", ""},
		{"LMU by the name's id", "lmu", ana, "Ana García", driverKey(ana)},
		{"LMU, the default name", "lmu", strconv.Itoa(lmuDriverID("Player")), "Player", ""},
		{"LMU, the default name in other letters", "lmu", strconv.Itoa(lmuDriverID("DRIVER")), " DRIVER ", ""},
		{"LMU, two letters", "lmu", strconv.Itoa(lmuDriverID("Jo")), "Jo", ""},
		{"LMU without a name", "lmu", "0", "", ""},
		{"a game nobody links", "acc", "123456", "Ana", ""},
	}
	for _, c := range cases {
		if got := ownLinkKey(c.game, c.id, c.who); got != c.want {
			t.Errorf("%s: %q, want %q", c.name, got, c.want)
		}
	}
	// the key the PC links by in LMU is the one its rivals' laps went up under
	if ownLinkKey("lmu", ana, "Ana García") != driverKey(strconv.Itoa(lmuDriverID("Ana García"))) {
		t.Error("the link and the rival's laps must share one key")
	}
}
