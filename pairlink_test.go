package main

import (
	"net/url"
	"strings"
	"testing"
)

func TestAppPairLink(t *testing.T) {
	l := appPairLink()
	if l == "" {
		t.Skip("no network address here")
	}
	u, err := url.Parse(l)
	if err != nil || u.Scheme != "pitlanehq" || u.Host != "open" {
		t.Fatalf("bad link %q", l)
	}
	target := u.Query().Get("url")
	pairMu.Lock()
	pin := currentPINLocked()
	pairMu.Unlock()
	if !strings.HasPrefix(target, "http://") || !strings.HasSuffix(target, "/pair?pin="+pin+"&next=%2F") {
		t.Fatalf("bad target %q", target)
	}
	t.Log(l, "→", target)
}
