package main

import (
	"os"
	"testing"
)

// An admin sees what is in development only with admin mode on, kept on this PC across restarts.
func TestAdminModeGatesWip(t *testing.T) {
	dir := t.TempDir()
	old := os.Getenv("PITLANEHQ_DATA")
	os.Setenv("PITLANEHQ_DATA", dir)
	defer os.Setenv("PITLANEHQ_DATA", old)
	adminModeMu.Lock()
	adminModeOn, adminModeLoaded = false, false
	adminModeMu.Unlock()
	loadPL()
	plMu.Lock()
	wasAdmin, wasTok := plAcc.Admin, plAcc.Token
	plAcc.Admin, plAcc.Token = true, "tok"
	plMu.Unlock()
	defer func() {
		plMu.Lock()
		plAcc.Admin, plAcc.Token = wasAdmin, wasTok
		plMu.Unlock()
		adminModeMu.Lock()
		adminModeOn, adminModeLoaded = false, false
		adminModeMu.Unlock()
	}()
	if wipAllowed() || !gameLocked("acc") {
		t.Fatal("admin mode is off by default: an admin sees what everyone sees")
	}
	if !realAdminSigned() {
		t.Fatal("the account is still an admin's")
	}
	setAdminMode(true)
	if !wipAllowed() || gameLocked("acc") {
		t.Fatal("admin mode on opens what is in development")
	}
	adminModeMu.Lock()
	adminModeOn, adminModeLoaded = false, false
	adminModeMu.Unlock()
	if !adminMode() {
		t.Fatal("admin mode is read back from admin-mode.json")
	}
	plMu.Lock()
	plAcc.Admin = false
	plMu.Unlock()
	if wipAllowed() {
		t.Fatal("admin mode alone is nothing without an admin's account")
	}
}
