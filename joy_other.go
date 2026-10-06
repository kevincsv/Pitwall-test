//go:build !windows

package main

func joyButtons() []joyState     { return nil }
func joyNames() []map[string]any { return nil }
