package main

import (
	"regexp"
	"sort"
)

// The overlay feedback window (index.html's ovFeedbackAsk, usage.js on the server): a race driven with at least one
// overlay open goes to the server once when it ends or is left (POST /community/feedback/ovrace), and the app's page,
// told by the "ovrace" notice, asks a moment later whether to show the window (after the first such race, and once
// answered every six). Never in demo data; iRacing and Le Mans Ultimate races only, AI races too.

var ovStyleRe = regexp.MustCompile(`^[a-z0-9_-]{1,20}$`)

// ovStyle is the overlay design in use (ui.ovstyle in the settings): "classic" until other designs come beside it.
func ovStyle(ui map[string]any) string {
	if s, ok := ui["ovstyle"].(string); ok && ovStyleRe.MatchString(s) {
		return s
	}
	return "classic"
}

// noteOverlays adds the overlays open now to the ones a race saw.
func noteOverlays(seen map[string]bool, open []string) map[string]bool {
	for _, n := range open {
		if n == "" {
			continue
		}
		if seen == nil {
			seen = map[string]bool{}
		}
		seen[n] = true
	}
	return seen
}

// ovRaceBody is what the PC tells the server of a race with overlays; nil when there is nothing to tell.
func ovRaceBody(sid, game, style string, ovs map[string]bool) map[string]any {
	if len(ovs) == 0 || (game != "iracing" && game != "lmu") {
		return nil
	}
	names := make([]string, 0, len(ovs))
	for n := range ovs {
		names = append(names, n)
	}
	sort.Strings(names)
	return map[string]any{"sid": sid, "game": game, "style": style, "ovs": names}
}

// reportOvRace tells the server of a race that ended with overlays open, then the page (the "ovrace" notice).
func reportOvRace(sid, game string, ovs map[string]bool) {
	if tel.isDemo() {
		return
	}
	c, _ := settingsSnapshot()
	body := ovRaceBody(sid, game, ovStyle(c.UI), ovs)
	if body == nil {
		return
	}
	go func() {
		if !accountSignedIn() {
			return
		}
		if _, err := commCall("POST", "/feedback/ovrace", body, true); err == nil {
			pushNotice("ovrace", map[string]any{"style": body["style"]})
		}
	}()
}
