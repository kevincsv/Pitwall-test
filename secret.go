package main

// Files that hold sign-ins (iRacing tokens, Garage 61 token) are encrypted on
// Windows with DPAPI, so only your Windows user on this PC can read them.
// Copying the file to another PC or user gives unreadable data.

import (
	"bytes"
	"os"
	"path/filepath"
)

var secretMagic = []byte("PWSEC1\n")

// writeSecret encrypts data (when the OS supports it) and writes it.
func writeSecret(path string, data []byte) error {
	os.MkdirAll(filepath.Dir(path), 0o700)
	if enc, err := protect(data); err == nil && enc != nil {
		data = append(append([]byte{}, secretMagic...), enc...)
	}
	// a new file put in place of the old one: a crash or a kill while it writes never leaves it empty
	// (an empty account.json is a signed-out PC)
	tmp := path + ".tmp"
	if err := os.WriteFile(tmp, data, 0o600); err != nil {
		return err
	}
	return os.Rename(tmp, path)
}

// readSecret reads a file written by writeSecret. Older plain files are
// returned as they are and re-saved encrypted.
func readSecret(path string) ([]byte, error) {
	b, err := os.ReadFile(path)
	if err != nil {
		return nil, err
	}
	if bytes.HasPrefix(b, secretMagic) {
		return unprotect(b[len(secretMagic):])
	}
	if len(bytes.TrimSpace(b)) > 0 {
		writeSecret(path, b) // upgrade an older plain-text file
	}
	return b, nil
}
