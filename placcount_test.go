package main

import (
	"bytes"
	"os"
	"path/filepath"
	"strings"
	"testing"
)

func TestAccountKeysAndSealing(t *testing.T) {
	a1, w1, err := deriveKeys("Driver@Example.com ", "correct horse battery")
	if err != nil {
		t.Fatal(err)
	}
	a2, w2, _ := deriveKeys("driver@example.com", "correct horse battery")
	if a1 != a2 || !bytes.Equal(w1, w2) {
		t.Fatal("keys must not depend on email case or spaces")
	}
	a3, _, _ := deriveKeys("driver@example.com", "correct horse battery!")
	if a3 == a1 || len(a1) != 64 || strings.Contains(a1, "correct") {
		t.Fatal("login key must change with the password and never contain it")
	}
	if bytes.Equal(w1[:16], []byte(a1)[:16]) {
		t.Fatal("wrap key must differ from the login key")
	}
	sealed, _ := sealAES(w1, []byte("secret profile"))
	if strings.Contains(sealed, "secret") {
		t.Fatal("not encrypted")
	}
	if out, err := openAES(w1, sealed); err != nil || string(out) != "secret profile" {
		t.Fatal("round trip failed", err)
	}
	_, w3, _ := deriveKeys("driver@example.com", "another password")
	if _, err := openAES(w3, sealed); err == nil {
		t.Fatal("a wrong key must not open the data")
	}
	if checkPassword("short") == nil || checkPassword("long enough pw") != nil {
		t.Fatal("password rule")
	}
}

func TestInstallSetup(t *testing.T) {
	root := t.TempDir()
	data := []byte("STO-DATA")
	p, err := installSetup(root, "mx5 mx52016", "Laguna/../../evil", "Ana R.", data)
	if err != nil {
		t.Fatal(err)
	}
	if rel, _ := filepath.Rel(root, p); strings.HasPrefix(rel, "..") || filepath.Ext(p) != ".sto" || !strings.Contains(rel, "Pitlane Community") {
		t.Fatal("bad path", p)
	}
	if b, _ := os.ReadFile(p); !bytes.Equal(b, data) {
		t.Fatal("content")
	}
	if p2, _ := installSetup(root, "mx5 mx52016", "Laguna/../../evil", "Ana R.", data); p2 != p {
		t.Fatal("same file must not be installed twice")
	}
	if p3, _ := installSetup(root, "mx5 mx52016", "Laguna/../../evil", "Ana R.", []byte("other")); p3 == p {
		t.Fatal("a different setup with the same name must not overwrite")
	}
	for _, car := range []string{"../windows", "a/b", "", "c:\\x"} {
		if _, err := installSetup(root, car, "x", "", data); err == nil {
			t.Fatal("car folder accepted:", car)
		}
	}
	if _, err := installSetup(root, "mx5", "x", "", make([]byte, maxSetupSize+1)); err == nil {
		t.Fatal("too large accepted")
	}
}

func TestHostAllowed(t *testing.T) {
	for _, h := range []string{"localhost:8484", "127.0.0.1:8484", "192.168.1.20:8484", "[::1]:8484", "mypc:8484", "mypc.local", "x.trycloudflare.com"} {
		if !hostAllowed(h) {
			t.Error("should allow", h)
		}
	}
	for _, h := range []string{"evil.com", "attacker.example.com:8484", "localhost.evil.com"} {
		if hostAllowed(h) {
			t.Error("should block", h)
		}
	}
}

// a secret file is put in place whole: never an empty one if the PC stops while it saves, no temp left behind
func TestWriteSecretReplacesWhole(t *testing.T) {
	p := filepath.Join(t.TempDir(), "account.json")
	if err := writeSecret(p, []byte(`{"email":"a@b.c"}`)); err != nil {
		t.Fatal(err)
	}
	if err := writeSecret(p, []byte(`{"email":"d@e.f"}`)); err != nil {
		t.Fatal(err)
	}
	b, err := readSecret(p)
	if err != nil || string(b) != `{"email":"d@e.f"}` {
		t.Fatalf("read back %q, %v", b, err)
	}
	if _, err := os.Stat(p + ".tmp"); !os.IsNotExist(err) {
		t.Fatal("the temp file must not stay")
	}
}
