package main

import (
	"reflect"
	"testing"
)

func TestProLimits(t *testing.T) {
	loadPL()
	plMu.Lock()
	was := plAcc
	plMu.Unlock()
	defer func() { plMu.Lock(); plAcc = was; plMu.Unlock() }()
	set := func(gate, pro, elsewhere, admin bool) {
		plMu.Lock()
		plAcc.ProGate, plAcc.Pro, plAcc.ProElsewhere, plAcc.Admin = gate, pro, elsewhere, admin
		plMu.Unlock()
	}
	ovs := []string{"gg", "radar", "relative", "stats", "standings", "fuel"}
	apps := []appEntry{{ID: "a", When: "pitwall"}, {ID: "b"}, {ID: "c", When: "sim"}, {ID: "d", When: "sim"}, {ID: "e", When: "pitwall"}}
	all := map[string]bool{"a": true, "c": true, "d": true, "e": true}
	three := map[string]bool{"a": true, "c": true, "d": true}
	cases := []struct {
		name                    string
		gate, pro, where, admin bool
		ovs                     []string
		apps                    map[string]bool
	}{
		{"beta", false, false, false, false, ovs, all},
		{"pro here", true, true, false, false, ovs, all},
		{"no pro", true, false, false, false, []string{"radar", "relative", "standings", "fuel"}, three},
		{"pro on another PC", true, true, true, false, []string{"radar", "relative", "standings", "fuel"}, three},
		{"admin", true, false, false, true, ovs, all},
	}
	for _, c := range cases {
		set(c.gate, c.pro, c.where, c.admin)
		if got := proAutoList(ovs); !reflect.DeepEqual(got, c.ovs) {
			t.Fatalf("%s overlays: %v", c.name, got)
		}
		if got := proAppsAllowed(apps); !reflect.DeepEqual(got, c.apps) {
			t.Fatalf("%s apps: %v", c.name, got)
		}
	}
	if len(pcID()) != 32 || pcID() != pcID() {
		t.Fatalf("pc id %q", pcID())
	}
}
