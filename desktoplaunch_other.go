//go:build !windows

package main

func openDesktop(minimized bool) bool { return false }
