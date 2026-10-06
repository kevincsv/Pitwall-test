package main

import (
	"os"
	"strings"
	"testing"
)

// The web (web/dist/index.html) and PitlaneHQ.exe are one release: same version number.
func TestWebVersionMatchesApp(t *testing.T) {
	b, err := os.ReadFile("web/dist/index.html")
	if err != nil {
		t.Fatal(err)
	}
	if !strings.Contains(string(b), `const WEB_VERSION="`+appVersion+`",APP_STAGE="`+appStage+`"`) {
		t.Fatalf("WEB_VERSION in web/dist/index.html must be %q like appVersion in main.go", appVersion)
	}
}
