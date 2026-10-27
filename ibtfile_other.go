//go:build !windows

package main

import "time"

// cloudOnly: only Windows has OneDrive placeholders
func cloudOnly(path string) bool { return false }

// systemIdle: elsewhere nobody's input is known, so the PC counts as idle
func systemIdle() time.Duration { return 24 * time.Hour }
