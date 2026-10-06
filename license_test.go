package main

import (
	"net/http"
	"net/http/httptest"
	"testing"
	"time"
)

func TestLicenseLemonSqueezy(t *testing.T) {
	dir := t.TempDir()
	t.Setenv("XDG_CONFIG_HOME", dir)
	t.Setenv("HOME", dir)
	t.Setenv("APPDATA", dir)
	srv := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		r.ParseForm()
		if r.Form.Get("license_key") != "GOOD-KEY-1234" {
			w.WriteHeader(400)
			w.Write([]byte(`{"error":"license_key not found."}`))
			return
		}
		w.Write([]byte(`{"activated":true,"valid":true,"license_key":{"status":"active","expires_at":null},"instance":{"id":"inst-1"},"meta":{"variant_name":"Lifetime"}}`))
	}))
	defer srv.Close()
	lsAPI = srv.URL + "/"
	loadLicense()
	licMu.Lock()
	plans.Enforce, plans.TrialDays = true, 0
	info := licenseInfoLocked()
	licMu.Unlock()
	if info["pro"] != false {
		t.Fatal("with licences enforced and no trial, nothing is unlocked")
	}
	if err := activateLicense("BAD-KEY-0000"); err == nil {
		t.Fatal("bad key accepted")
	}
	if err := activateLicense("GOOD-KEY-1234"); err != nil {
		t.Fatal(err)
	}
	licMu.Lock()
	info = licenseInfoLocked()
	licMu.Unlock()
	if info["pro"] != true || info["plan"] != "lifetime" || info["key"] != "GOOD…1234" {
		t.Fatalf("license: %v", info)
	}
	// a year without reaching the server: it keeps working offline
	licMu.Lock()
	lic.CheckedAt = time.Now().AddDate(-1, 0, 0)
	info = licenseInfoLocked()
	licMu.Unlock()
	if info["pro"] != true {
		t.Fatal("an activated licence should keep working offline")
	}
	// only the store's answer turns it off
	licMu.Lock()
	lic.Status = "expired"
	info = licenseInfoLocked()
	licMu.Unlock()
	if info["pro"] != false {
		t.Fatal("an expired licence should not unlock Pro")
	}
}
