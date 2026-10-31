package main

import (
	"strings"
	"sync/atomic"
	"testing"
)

// a part that panics starts again and is reported once per kind of error; one that ends by itself is not started again
func TestKeepAliveRestartsAfterPanic(t *testing.T) {
	var runs atomic.Int32
	runGuardedWait := func() {
		keepAliveN := 0
		for keepAliveN < 3 {
			keepAliveN++
			if !runGuarded("test", func() {
				if runs.Add(1) < 3 {
					panic("boom 1")
				}
			}) {
				return
			}
		}
	}
	runGuardedWait()
	if runs.Load() != 3 {
		t.Fatalf("runs %d, want 3 (two panics, then it ends)", runs.Load())
	}
	crashMu.Lock()
	n := 0
	for k := range crashSent {
		if strings.HasPrefix(k, "test|") {
			n++
		}
	}
	crashMu.Unlock()
	if n != 1 {
		t.Fatalf("reported %d kinds, want 1", n)
	}
	if runGuarded("test2", func() {}) {
		t.Fatal("a part that ends by itself did not panic")
	}
}

func TestLogTailHasHeader(t *testing.T) {
	s := logTail(1 << 10)
	if !strings.HasPrefix(s, "Pitlane HQ Agent "+appVersion) {
		t.Fatalf("header missing: %q", s[:min(len(s), 80)])
	}
}

func TestHealthNowQuiet(t *testing.T) {
	h := healthNow()
	if h["waiting"] != 0 || h["lmuPlugins"] != false {
		t.Fatalf("nothing to act on, got %v", h)
	}
}
