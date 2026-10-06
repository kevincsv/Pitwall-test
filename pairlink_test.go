package main

import (
	"strings"
	"testing"
)

// The QR opens this PC in the phone's browser, paired with the current PIN.
func TestAppPairLink(t *testing.T) {
	l := appPairLink()
	if l == "" {
		t.Skip("no network address here")
	}
	pairMu.Lock()
	pin := currentPINLocked()
	pairMu.Unlock()
	if !strings.HasPrefix(l, "http://") || !strings.HasSuffix(l, "/pair?pin="+pin+"&next=%2F") {
		t.Fatalf("bad link %q", l)
	}
}
