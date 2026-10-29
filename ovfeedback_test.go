package main

import (
	"reflect"
	"testing"
)

func TestOverlayFeedbackRace(t *testing.T) {
	if s := ovStyle(map[string]any{}); s != ovDefaultStyle {
		t.Fatalf("no design chosen: %q", s)
	}
	if s := ovStyle(map[string]any{"ovstyle": "neon_2"}); s != "neon_2" {
		t.Fatalf("a new design: %q", s)
	}
	for _, bad := range []any{"Bad Style", "", 3, "x123456789012345678901"} {
		if s := ovStyle(map[string]any{"ovstyle": bad}); s != ovDefaultStyle {
			t.Fatalf("%v: %q", bad, s)
		}
	}
	var seen map[string]bool
	seen = noteOverlays(seen, nil)
	if seen != nil {
		t.Fatal("no overlay open: nothing to tell")
	}
	if b := ovRaceBody("1-2", "iracing", "classic", seen); b != nil {
		t.Fatal("a race without overlays is not told")
	}
	seen = noteOverlays(seen, []string{"relative", "radar"})
	seen = noteOverlays(seen, []string{"radar", "", "fuel"})
	b := ovRaceBody("1-2", "lmu", "classic", seen)
	want := map[string]any{"sid": "1-2", "game": "lmu", "style": "classic", "ovs": []string{"fuel", "radar", "relative"}}
	if !reflect.DeepEqual(b, want) {
		t.Fatalf("got %v", b)
	}
	if ovRaceBody("1-2", "acc", "classic", seen) != nil {
		t.Fatal("only iRacing and Le Mans Ultimate races")
	}
}
