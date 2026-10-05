//go:build !windows

package main

const updateSupported = false

func restartInto(exe string) {}
