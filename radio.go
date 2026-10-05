package main

// Radio: lets you ask the voice engineer for information from a wheel button,
// from a phone used as a button box or from the app, and stores your own
// voice packs (recorded phrases that replace the computer voice).

import (
	"archive/zip"
	"bytes"
	"encoding/json"
	"errors"
	"io"
	"net/http"
	"os"
	"path/filepath"
	"regexp"
	"sort"
	"strings"
	"sync"
	"time"
)

// What can be asked: the page knows how to say each one.
var radioAsks = []string{"fuel", "gaps", "position", "last", "remaining", "pit", "incidents", "delta", "mute"}

type radioEvent struct {
	Seq int    `json:"seq"`
	Ask string `json:"ask"`
}

type joyBinding struct {
	Joy    int `json:"joy"`
	Button int `json:"button"` // 1..32
}

var (
	radioMu      sync.Mutex
	radioSeq     int
	radioLast    []radioEvent
	radioBinds   = map[string]joyBinding{}
	radioLearn   string
	radioLearnAt time.Time
	packNameRe   = regexp.MustCompile(`^[A-Za-z0-9 _.\-]{1,40}$`)
	clipNameRe   = regexp.MustCompile(`^[a-z0-9_]{1,40}$`)
)

func radioPath() string { return filepath.Join(activeDir(), "radio.json") }
func packsDir() string  { return filepath.Join(activeDir(), "voicepacks") }

func loadRadio() {
	m := map[string]joyBinding{}
	if b, err := os.ReadFile(radioPath()); err == nil {
		json.Unmarshal(b, &m)
	}
	radioMu.Lock()
	radioBinds = m
	radioMu.Unlock()
}

func saveRadioLocked() {
	b, _ := json.MarshalIndent(radioBinds, "", "  ")
	os.MkdirAll(activeDir(), 0o700)
	os.WriteFile(radioPath(), b, 0o600)
}

func validAsk(a string) bool {
	for _, x := range radioAsks {
		if x == a {
			return true
		}
	}
	return false
}

// pushRadio sends a question to every open screen; the one with the voice on answers.
func pushRadio(ask string) {
	radioMu.Lock()
	radioSeq++
	radioLast = append(radioLast, radioEvent{radioSeq, ask})
	if len(radioLast) > 20 {
		radioLast = radioLast[len(radioLast)-20:]
	}
	radioMu.Unlock()
}

// radioSince returns the questions newer than seq (used by the live stream).
func radioSince(seq int) ([]radioEvent, int) {
	radioMu.Lock()
	defer radioMu.Unlock()
	if seq < 0 {
		return nil, radioSeq
	}
	var out []radioEvent
	for _, e := range radioLast {
		if e.Seq > seq {
			out = append(out, e)
		}
	}
	return out, radioSeq
}

// joyWatcher turns wheel / button box presses into questions.
func joyWatcher() {
	prev := map[int]uint32{}
	for range time.Tick(30 * time.Millisecond) {
		radioMu.Lock()
		nb, learn := len(radioBinds), radioLearn
		radioMu.Unlock()
		if nb == 0 && learn == "" {
			continue
		}
		for _, j := range joyButtons() {
			was := prev[j.id]
			prev[j.id] = j.buttons
			pressed := j.buttons &^ was
			if pressed == 0 || was == 0 && j.first {
				continue
			}
			for b := 0; b < 32; b++ {
				if pressed&(1<<b) == 0 {
					continue
				}
				radioMu.Lock()
				if radioLearn != "" && time.Since(radioLearnAt) < 15*time.Second {
					radioBinds[radioLearn] = joyBinding{j.id, b + 1}
					radioLearn = ""
					saveRadioLocked()
					radioMu.Unlock()
					continue
				}
				var ask string
				for a, bd := range radioBinds {
					if bd.Joy == j.id && bd.Button == b+1 {
						ask = a
					}
				}
				radioMu.Unlock()
				if ask != "" {
					pushRadio(ask)
				}
			}
		}
	}
}

type joyState struct {
	id      int
	buttons uint32
	first   bool
}

// ---------- voice packs ----------

type voicePack struct {
	Name  string              `json:"name"`
	Files map[string][]string `json:"files"` // phrase key → recordings (variants are picked at random)
}

func listPacks() []voicePack {
	ents, _ := os.ReadDir(packsDir())
	out := []voicePack{}
	for _, e := range ents {
		if !e.IsDir() {
			continue
		}
		p := voicePack{Name: e.Name(), Files: map[string][]string{}}
		base := filepath.Join(packsDir(), e.Name())
		filepath.WalkDir(base, func(path string, d os.DirEntry, err error) error {
			if err != nil || d.IsDir() || !isAudio(path) {
				return nil
			}
			rel, _ := filepath.Rel(base, path)
			rel = filepath.ToSlash(rel)
			if key := clipKey(rel); key != "" {
				p.Files[key] = append(p.Files[key], rel)
			}
			return nil
		})
		for _, v := range p.Files {
			sort.Strings(v)
		}
		out = append(out, p)
	}
	return out
}

func isAudio(p string) bool {
	switch strings.ToLower(filepath.Ext(p)) {
	case ".mp3", ".wav", ".ogg", ".m4a":
		return true
	}
	return false
}

// clipKey: "car_left.mp3" → car_left; "clear/2.wav" or "clear/clear_2.wav" → clear
// (several recordings of one phrase); "My pack/car_left.mp3" → car_left.
func clipKey(rel string) string {
	norm := func(x string) string {
		return strings.ToLower(strings.NewReplacer("-", "_", " ", "_").Replace(strings.TrimSpace(x)))
	}
	parts := strings.Split(rel, "/")
	base := norm(strings.TrimSuffix(parts[len(parts)-1], filepath.Ext(parts[len(parts)-1])))
	k := base
	if len(parts) >= 2 {
		parent := norm(parts[len(parts)-2])
		if strings.Trim(base, "0123456789") == "" || base == parent || strings.HasPrefix(base, parent+"_") && strings.Trim(base[len(parent)+1:], "0123456789") == "" {
			k = parent
		}
	}
	if !clipNameRe.MatchString(k) {
		return ""
	}
	return k
}

// installPack unpacks a .zip of recordings (audio files only, 120 MB at most).
func installPack(name string, data []byte) error {
	zr, err := zip.NewReader(bytes.NewReader(data), int64(len(data)))
	if err != nil {
		return errors.New("this is not a .zip file")
	}
	dir := filepath.Join(packsDir(), name)
	os.RemoveAll(dir)
	// a zipped folder ("My pack/car_left.mp3"): drop the folder name
	top, same := "", true
	for _, f := range zr.File {
		p := strings.ReplaceAll(f.Name, `\`, "/")
		if f.FileInfo().IsDir() || !isAudio(p) {
			continue
		}
		first, _, nested := strings.Cut(p, "/")
		if !nested || top != "" && first != top {
			same = false
			break
		}
		top = first
	}
	n := 0
	var total int64
	for _, f := range zr.File {
		p := strings.ReplaceAll(f.Name, `\`, "/")
		if f.FileInfo().IsDir() || !isAudio(p) || strings.Contains(p, "..") || strings.HasPrefix(p, "/") {
			continue
		}
		if same && top != "" {
			p = strings.TrimPrefix(p, top+"/")
		}
		parts := strings.Split(p, "/")
		if len(parts) > 2 { // keep only "phrase.mp3" or "phrase/variant.mp3"
			parts = parts[len(parts)-2:]
		}
		if clipKey(strings.Join(parts, "/")) == "" {
			continue
		}
		total += int64(f.UncompressedSize64)
		if total > 120<<20 || n > 3000 {
			return errors.New("the pack is too big (120 MB at most)")
		}
		rc, err := f.Open()
		if err != nil {
			continue
		}
		b, err := io.ReadAll(io.LimitReader(rc, 20<<20))
		rc.Close()
		if err != nil {
			continue
		}
		out := filepath.Join(append([]string{dir}, parts...)...)
		os.MkdirAll(filepath.Dir(out), 0o700)
		if os.WriteFile(out, b, 0o600) == nil {
			n++
		}
	}
	if n == 0 {
		os.RemoveAll(dir)
		return errors.New("no audio files (.mp3, .wav, .ogg) found in the .zip")
	}
	return nil
}

// packClipPath turns "car_left.mp3" or "car_left/2.wav" into a safe path inside the pack.
func packClipPath(pack, rel string) (string, bool) {
	parts := strings.Split(strings.ReplaceAll(rel, `\`, "/"), "/")
	if len(parts) > 2 {
		parts = parts[len(parts)-2:]
	}
	for _, p := range parts {
		if p == "" || p == "." || p == ".." || strings.ContainsAny(p, ":") {
			return "", false
		}
	}
	if !isAudio(parts[len(parts)-1]) || clipKey(strings.Join(parts, "/")) == "" {
		return "", false
	}
	return filepath.Join(append([]string{packsDir(), pack}, parts...)...), true
}

func registerRadioRoutes(mux *http.ServeMux) {
	mux.HandleFunc("/api/radio/ask", func(w http.ResponseWriter, r *http.Request) {
		if r.Method != http.MethodPost {
			http.Error(w, "POST only", 405)
			return
		}
		a := r.URL.Query().Get("q")
		if !validAsk(a) {
			http.Error(w, "unknown question", 400)
			return
		}
		pushRadio(a)
		writeJSON(w, map[string]string{"result": "ok"})
	})
	mux.HandleFunc("/api/radio/buttons", func(w http.ResponseWriter, r *http.Request) {
		if r.Method == http.MethodPost {
			var in struct{ Action, Ask string }
			json.NewDecoder(io.LimitReader(r.Body, 4096)).Decode(&in)
			radioMu.Lock()
			switch in.Action {
			case "learn":
				if validAsk(in.Ask) {
					radioLearn, radioLearnAt = in.Ask, time.Now()
				}
			case "cancel":
				radioLearn = ""
			case "clear":
				delete(radioBinds, in.Ask)
				saveRadioLocked()
			}
			radioMu.Unlock()
		}
		radioMu.Lock()
		learning := radioLearn
		if learning != "" && time.Since(radioLearnAt) > 15*time.Second {
			radioLearn, learning = "", ""
		}
		binds := map[string]joyBinding{}
		for k, v := range radioBinds {
			binds[k] = v
		}
		radioMu.Unlock()
		writeJSON(w, map[string]any{"bindings": binds, "learning": learning, "devices": joyNames(), "windows": appsSupported})
	})
	mux.HandleFunc("/api/voicepacks", func(w http.ResponseWriter, r *http.Request) {
		fail := func(err error) {
			w.WriteHeader(400)
			writeJSON(w, map[string]string{"error": err.Error()})
		}
		if r.Method == http.MethodPost {
			if strings.HasPrefix(r.Header.Get("Content-Type"), "multipart/") {
				// a .zip (replaces the pack) or loose recordings (added to the pack)
				if err := r.ParseMultipartForm(32 << 20); err != nil {
					fail(errors.New("could not read the files"))
					return
				}
				defer r.MultipartForm.RemoveAll()
				files, paths := r.MultipartForm.File["file"], r.MultipartForm.Value["path"]
				if len(files) == 0 {
					fail(errors.New("no file"))
					return
				}
				name := strings.TrimSpace(r.FormValue("name"))
				if len(files) == 1 && strings.EqualFold(filepath.Ext(files[0].Filename), ".zip") {
					if name == "" {
						name = strings.TrimSuffix(files[0].Filename, filepath.Ext(files[0].Filename))
					}
					if !packNameRe.MatchString(name) || strings.Contains(name, "..") {
						name = "My pack"
					}
					f, err := files[0].Open()
					if err != nil {
						fail(errors.New("could not read the file"))
						return
					}
					b, _ := io.ReadAll(io.LimitReader(f, 130<<20))
					f.Close()
					if err := installPack(name, b); err != nil {
						fail(err)
						return
					}
				} else {
					if !packNameRe.MatchString(name) || strings.Contains(name, "..") {
						name = "My pack"
					}
					n := 0
					for i, fh := range files {
						rel := fh.Filename
						if i < len(paths) && paths[i] != "" {
							rel = paths[i]
						}
						dst, ok := packClipPath(name, rel)
						if !ok || fh.Size > 20<<20 {
							continue
						}
						f, err := fh.Open()
						if err != nil {
							continue
						}
						b, _ := io.ReadAll(io.LimitReader(f, 20<<20))
						f.Close()
						os.MkdirAll(filepath.Dir(dst), 0o700)
						if os.WriteFile(dst, b, 0o600) == nil {
							n++
						}
					}
					if n == 0 {
						fail(errors.New("no audio files (.mp3, .wav, .ogg, .m4a) with a phrase name"))
						return
					}
				}
			} else {
				var in struct{ Action, Name string }
				json.NewDecoder(io.LimitReader(r.Body, 4096)).Decode(&in)
				if in.Action == "delete" && packNameRe.MatchString(in.Name) && !strings.Contains(in.Name, "..") {
					os.RemoveAll(filepath.Join(packsDir(), in.Name))
				}
			}
		}
		writeJSON(w, map[string]any{"packs": listPacks()})
	})
	// /api/voicepack/<pack>/<phrase>.mp3 or /api/voicepack/<pack>/<phrase>/<variant>.wav
	mux.HandleFunc("/api/voicepack/", func(w http.ResponseWriter, r *http.Request) {
		parts := strings.SplitN(strings.TrimPrefix(r.URL.Path, "/api/voicepack/"), "/", 2)
		if len(parts) < 2 || !packNameRe.MatchString(parts[0]) || strings.Contains(parts[0], "..") {
			http.NotFound(w, r)
			return
		}
		p, ok := packClipPath(parts[0], parts[1])
		if !ok {
			http.NotFound(w, r)
			return
		}
		w.Header().Set("Cache-Control", "max-age=3600")
		http.ServeFile(w, r, p)
	})
}
