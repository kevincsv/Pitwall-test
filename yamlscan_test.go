package main

import (
	"math/rand"
	"regexp"
	"strings"
	"testing"
)

// the regexps yamlField and listItem were before they scanned the text, except that a field's value is on its own line: an
// empty field is empty, never the next line (the old `:\s*` read "TrackConfigName: " as the TrackCity line after it)
func yamlFieldRe(block, key string) string {
	re := regexp.MustCompile(`(?m)^\s*` + regexp.QuoteMeta(key) + `:[ \t]*(.*)$`)
	if m := re.FindStringSubmatch(block); m != nil {
		return strings.Trim(strings.TrimSpace(m[1]), `"`)
	}
	return ""
}

func listItemRe(y, key, value string) string {
	re := regexp.MustCompile(`(?m)^(\s*)- ` + regexp.QuoteMeta(key) + `: ` + regexp.QuoteMeta(value) + `\s*$`)
	loc := re.FindStringSubmatchIndex(y)
	if loc == nil {
		return ""
	}
	indent := y[loc[2]:loc[3]]
	rest := y[loc[1]:]
	end := regexp.MustCompile(`(?m)^` + regexp.QuoteMeta(indent) + `- |^\S`).FindStringIndex(rest)
	if end != nil {
		rest = rest[:end[0]]
	}
	return rest
}

func TestYAMLScanMatchesRegexp(t *testing.T) {
	y := lmuBenchSession(t)
	keys := []string{"TrackID", "SubSessionID", "TrackDisplayName", "DriverCarIdx", "TrackLength", "UserName", "UserID", "CarIdx",
		"Position", "ClassPosition", "FastestTime", "SessionNum", "Sessions", "DriverInfo", "Drivers", "ResultsPositions", "Nope",
		"SectorStartPct", "CarScreenName", "CarNumber", "TeamName", "Initials", "SessionTime"}
	for _, k := range keys {
		if a, b := yamlField(y, k), yamlFieldRe(y, k); a != b {
			t.Errorf("yamlField(%q) = %q, the regexp %q", k, a, b)
		}
	}
	for _, kv := range [][2]string{{"CarIdx", "0"}, {"CarIdx", "1"}, {"CarIdx", "5"}, {"CarIdx", "59"}, {"CarIdx", "60"}, {"SessionNum", "10"},
		{"SessionNum", "1"}, {"Position", "3"}, {"SectorNum", "2"}, {"CarIdx", ""}} {
		if a, b := listItem(y, kv[0], kv[1]), listItemRe(y, kv[0], kv[1]); a != b {
			t.Errorf("listItem(%q, %q) differs:\n%q\nthe regexp:\n%q", kv[0], kv[1], a, b)
		}
	}
	// made-up texts with the odd shapes the regexps allowed: blank lines, values on the next line, tabs, carriage
	// returns, keys inside other keys, entries at several indents, no final newline
	pieces := []string{"\n", " ", "  ", "\t", "\r", "\f", "-", "- ", ":", ": ", "\"", "x", "Key", "Key:", "Key: v", "MyKey: w", "- Key: 1",
		"- Key: 12", "- Key: 1 ", "Top:", " - Key: 1", "  - Key: 1", "   Sub: s", "Other: o", "\n\n", "é", "\xff"}
	rng := rand.New(rand.NewSource(7))
	for n := 0; n < 30000; n++ {
		var sb strings.Builder
		for k := rng.Intn(14); k >= 0; k-- {
			sb.WriteString(pieces[rng.Intn(len(pieces))])
		}
		s := sb.String()
		for _, k := range []string{"Key", "MyKey", "Sub", "Top", "y"} {
			if a, b := yamlField(s, k), yamlFieldRe(s, k); a != b {
				t.Fatalf("yamlField(%q, %q) = %q, the regexp %q", s, k, a, b)
			}
		}
		for _, v := range []string{"1", "12", "v"} {
			if a, b := listItem(s, "Key", v), listItemRe(s, "Key", v); a != b {
				t.Fatalf("listItem(%q, Key, %q) = %q, the regexp %q", s, v, a, b)
			}
		}
	}
}
