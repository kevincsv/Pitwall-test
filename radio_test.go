package main

import (
	"archive/zip"
	"bytes"
	"os"
	"path/filepath"
	"strings"
	"testing"
)

func TestVoicePacks(t *testing.T) {
	dir := t.TempDir()
	t.Setenv("XDG_CONFIG_HOME", dir)
	t.Setenv("HOME", dir)
	t.Setenv("APPDATA", dir)
	initProfiles()

	if k := clipKey("car_left.mp3"); k != "car_left" {
		t.Fatalf("clipKey file: %q", k)
	}
	for in, want := range map[string]string{"Car-Left/2.WAV": "car_left", "clear/clear_3.wav": "clear", "My pack/car_left.mp3": "car_left", "x/n_5.ogg": "n_5", "Box this lap.mp3": "box_this_lap"} {
		if k := clipKey(in); k != want {
			t.Fatalf("clipKey(%q) = %q, want %q", in, k, want)
		}
	}
	for _, bad := range []string{"../x.mp3", "a/../../x.mp3", "c:/x.mp3", "x.exe", "a/b/c/../d.mp3"} {
		if p, ok := packClipPath("Mine", bad); ok {
			t.Fatalf("unsafe path accepted: %q → %q", bad, p)
		}
	}

	var buf bytes.Buffer
	zw := zip.NewWriter(&buf)
	for _, n := range []string{"pack/car_left.mp3", "pack/clear/1.wav", "pack/clear/2.wav", "../evil.mp3", "readme.txt", "deep/a/b/n_5.ogg"} {
		w, _ := zw.Create(n)
		w.Write([]byte("RIFF"))
	}
	zw.Close()
	if err := installPack("Mine", buf.Bytes()); err != nil {
		t.Fatal(err)
	}
	packs := listPacks()
	if len(packs) != 1 || packs[0].Name != "Mine" {
		t.Fatalf("packs: %+v", packs)
	}
	f := packs[0].Files
	if len(f["car_left"]) != 1 || len(f["clear"]) != 2 || len(f["n_5"]) != 1 || len(f) != 3 {
		t.Fatalf("files: %+v", f)
	}
	if f["car_left"][0] != "pack/car_left.mp3" {
		t.Fatalf("mixed folders must keep their names: %v", f["car_left"])
	}
	var one bytes.Buffer
	zw = zip.NewWriter(&one)
	for _, n := range []string{"Mi voz/car_left.mp3", "Mi voz/clear/1.wav"} {
		w, _ := zw.Create(n)
		w.Write([]byte("RIFF"))
	}
	zw.Close()
	if err := installPack("Folder", one.Bytes()); err != nil {
		t.Fatal(err)
	}
	for _, p := range listPacks() {
		if p.Name == "Folder" && (p.Files["car_left"][0] != "car_left.mp3" || p.Files["clear"][0] != "clear/1.wav") {
			t.Fatalf("zipped folder not flattened: %v", p.Files)
		}
	}
	if _, err := os.Stat(filepath.Join(packsDir(), "evil.mp3")); err == nil {
		t.Fatal("zip escaped the pack folder")
	}
	if err := installPack("Empty", []byte("not a zip")); err == nil || !strings.Contains(err.Error(), "zip") {
		t.Fatalf("bad zip: %v", err)
	}
}
