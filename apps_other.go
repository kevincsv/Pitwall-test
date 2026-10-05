//go:build !windows

package main

import "regexp"

const appsSupported = false

func scanStartMenu() []shortcut                   { return nil }
func findInstalled(re *regexp.Regexp) string      { return "" }
func runningProcs() map[string]bool               { return map[string]bool{} }
func procPaths(name string) []string              { return nil }
func shellOpen(path, args string, min bool) error { return errNotWindows }
func pickProgram() (string, error)                { return "", errNotWindows }
func killProcs(name, skipDir string) int          { return 0 }

func documentsDir() string { return "" }
