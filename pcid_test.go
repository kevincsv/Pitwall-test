package main

import (
	"reflect"
	"testing"
)

func TestProAutoList(t *testing.T) {
	loadPL()
	plMu.Lock()
	was := plAcc
	plMu.Unlock()
	defer func() { plMu.Lock(); plAcc = was; plMu.Unlock() }()
	all := []string{"gg", "radar", "relative", "stats", "standings", "fuel"}
	set := func(gate, pro, elsewhere, admin bool) {
		plMu.Lock()
		plAcc.ProGate, plAcc.Pro, plAcc.ProElsewhere, plAcc.Admin = gate, pro, elsewhere, admin
		plMu.Unlock()
	}
	set(false, false, false, false)
	if got := proAutoList(all); !reflect.DeepEqual(got, all) {
		t.Fatalf("beta: %v", got)
	}
	set(true, true, false, false)
	if got := proAutoList(all); !reflect.DeepEqual(got, all) {
		t.Fatalf("pro here: %v", got)
	}
	want := []string{"radar", "relative", "standings"}
	set(true, false, false, false)
	if got := proAutoList(all); !reflect.DeepEqual(got, want) {
		t.Fatalf("no pro: %v", got)
	}
	set(true, true, true, false)
	if got := proAutoList(all); !reflect.DeepEqual(got, want) {
		t.Fatalf("pro on another PC: %v", got)
	}
	set(true, false, false, true)
	if got := proAutoList(all); !reflect.DeepEqual(got, all) {
		t.Fatalf("admin: %v", got)
	}
	if len(pcID()) != 32 || pcID() != pcID() {
		t.Fatalf("pc id %q", pcID())
	}
}
