//go:build !windows

package main

// cloudOnly: only Windows has OneDrive placeholders
func cloudOnly(path string) bool { return false }
