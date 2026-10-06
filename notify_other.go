//go:build !windows

package main

import "log"

func notify(title, body string) { log.Printf("Notification: %s · %s", title, body) }
