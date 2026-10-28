package main

import (
	"context"
	"net"
	"testing"
)

// local mode: nothing leaves the PC. The guard lets the PC itself through and refuses any other host; outside local
// mode it changes nothing.
func TestLocalDialGuard(t *testing.T) {
	var dialed []string
	base := func(ctx context.Context, network, addr string) (net.Conn, error) {
		dialed = append(dialed, addr)
		return nil, nil
	}
	dial := localDialContext(base)
	localServerMu.Lock()
	localServerURL = ""
	localServerMu.Unlock()
	if _, err := dial(context.Background(), "tcp", "pitlanehq.app:443"); err != nil {
		t.Fatalf("normal mode: %v", err)
	}
	localServerMu.Lock()
	localServerURL = "http://127.0.0.1:8787"
	localServerMu.Unlock()
	defer func() { localServerMu.Lock(); localServerURL = ""; localServerMu.Unlock() }()
	for _, addr := range []string{"pitlanehq.app:443", "www.iracing.com:443", "fonts.googleapis.com:443", "192.168.1.20:8787"} {
		if _, err := dial(context.Background(), "tcp", addr); err != errLocalOnly {
			t.Errorf("%s: want refused, got %v", addr, err)
		}
	}
	for _, addr := range []string{"127.0.0.1:8787", "localhost:8585", "[::1]:8787"} {
		if _, err := dial(context.Background(), "tcp", addr); err != nil {
			t.Errorf("%s: %v", addr, err)
		}
	}
	if len(dialed) != 4 {
		t.Errorf("dialed %v", dialed)
	}
	page := []byte("<link rel=\"stylesheet\" href=\"fonts.css\">\n<link rel=\"preconnect\" href=\"https://fonts.googleapis.com\">\n<link rel=\"preconnect\" href=\"https://fonts.gstatic.com\" crossorigin>\n<link rel=\"stylesheet\" href=\"https://fonts.googleapis.com/css2?family=X\">\n<style>")
	if got := string(localPage(page)); got != "<link rel=\"stylesheet\" href=\"fonts.css\">\n<style>" {
		t.Errorf("localPage: %q", got)
	}
}
