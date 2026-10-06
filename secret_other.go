//go:build !windows

package main

// Outside Windows there is no per-user key store; files stay readable only by
// this user (0600).
func protect(data []byte) ([]byte, error)   { return nil, nil }
func unprotect(data []byte) ([]byte, error) { return data, nil }
