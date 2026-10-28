package main

import (
	"testing"
	"time"
)

// the server names the newest build: a PC on another build checks at once, at most once every two minutes; the
// same build, a build it already knows, or a dev build never check
func TestUpdateNudge(t *testing.T) {
	saved, savedLatest, savedAt := buildID, updLatest, updNudgeAt
	t.Cleanup(func() {
		buildID = saved
		updMu.Lock()
		updLatest = savedLatest
		updMu.Unlock()
		updNudgeAt = savedAt
		updCheck = checkUpdate
	})
	checks := make(chan struct{}, 8)
	updCheck = func() error { checks <- struct{}{}; return nil }
	updNudgeAt = time.Time{}
	updMu.Lock()
	updLatest = nil
	updMu.Unlock()
	buildID = "dev"
	if nudgeBuild("abc1234", true) {
		t.Fatal("a dev build checked")
	}
	buildID = "aaaaaaa1"
	if nudgeBuild("aaaaaaa1", true) || nudgeBuild("", true) || nudgeBuild("bbbbbbb2", false) {
		t.Fatal("the same build, none, or where updates do not work: checked")
	}
	if !nudgeBuild("bbbbbbb2", true) {
		t.Fatal("a newer build did not check")
	}
	select {
	case <-checks:
	case <-time.After(2 * time.Second):
		t.Fatal("no check started")
	}
	if nudgeBuild("ccccccc3", true) {
		t.Fatal("checked again within two minutes")
	}
	updNudgeAt = time.Time{}
	updMu.Lock()
	updLatest = &updateInfo{Build: "ccccccc3"}
	updMu.Unlock()
	if nudgeBuild("ccccccc3", true) {
		t.Fatal("a build already known checked")
	}
}

// the client tag carries the build, so the admin page's Online tab says which build every PC runs
func TestClientTagBuild(t *testing.T) {
	saved := buildID
	t.Cleanup(func() { buildID = saved })
	buildID = "d5d1e9a28feb48ee19a3723dedefeccf50652b3d"
	if got := clientTag(); got != "pc/"+appVersion+"+d5d1e9a" && got != "desktop/"+appVersion+"+d5d1e9a" {
		t.Fatalf("tag %q", got)
	}
	buildID = "dev"
	if got := clientTag(); got != "pc/"+appVersion && got != "desktop/"+appVersion {
		t.Fatalf("dev tag %q", got)
	}
}
