package main

// Pitlane HQ account: optional, to keep your profile in sync between PCs and
// to show a public name in the community.
//
// Your data is end-to-end encrypted: the password never leaves this PC.
//   master  = PBKDF2-SHA256(password, email, 600 000 rounds)
//   auth    = HKDF(master, "auth")  → the only thing the server sees (it stores a salted PBKDF2 of it)
//   wrap    = HKDF(master, "wrap")  → encrypts a random data key
//   data key: AES-256-GCM key for everything that is synced; the server only
//   keeps it wrapped, so it cannot read your profile, races or notes.
// The data key and the session token are kept on this PC encrypted with
// Windows DPAPI. Changing the password only re-wraps the data key.

import (
	"bytes"
	"compress/gzip"
	"crypto/aes"
	"crypto/cipher"
	"crypto/hkdf"
	"crypto/pbkdf2"
	"crypto/rand"
	"crypto/sha256"
	"encoding/base64"
	"encoding/hex"
	"encoding/json"
	"errors"
	"io"
	"log"
	"net/http"
	"net/mail"
	"os"
	"path/filepath"
	"strings"
	"sync"
	"time"
	"unicode/utf8"
)

const kdfRounds = 600000

type plAccount struct {
	Email    string    `json:"email,omitempty"`
	ID       string    `json:"id,omitempty"`
	Token    string    `json:"token,omitempty"`
	DataKey  string    `json:"dataKey,omitempty"` // hex, never sent anywhere
	Display  string    `json:"display,omitempty"`
	NameKind string    `json:"nameKind,omitempty"` // "iracing" or "nick"
	AutoSync bool      `json:"autoSync"`
	Version  int64     `json:"version"`  // server version this PC last synced
	LastHash string    `json:"lastHash"` // hash of the data at that time
	LastSync time.Time `json:"lastSync"`
	SyncErr  string    `json:"syncErr,omitempty"`
	Conflict bool      `json:"conflict,omitempty"`
	NoLaps   bool      `json:"noLaps,omitempty"` // do not keep my laps on the server
	Admin    bool      `json:"admin,omitempty"`  // an admin of the Pitlane HQ server (sees Connections)
}

var (
	plMu   sync.Mutex
	plAcc  plAccount
	plLoad sync.Once
	plBusy sync.Mutex // one sync at a time
)

func plPath() string { return filepath.Join(dataDir(), "account.json") }

func loadPL() {
	plLoad.Do(func() {
		if b, err := readSecret(plPath()); err == nil {
			json.Unmarshal(b, &plAcc)
		}
	})
}

func savePLLocked() {
	b, _ := json.Marshal(plAcc)
	writeSecret(plPath(), b)
}

func normEmail(e string) string { return strings.ToLower(strings.TrimSpace(e)) }

// deriveKeys turns the password into the server login key and the key that wraps the data key.
func deriveKeys(email, password string) (auth string, wrap []byte, err error) {
	salt := sha256.Sum256([]byte("pitlanehq-account-v1:" + normEmail(email)))
	master, err := pbkdf2.Key(sha256.New, password, salt[:], kdfRounds, 32)
	if err != nil {
		return "", nil, err
	}
	a, err := hkdf.Key(sha256.New, master, nil, "pitlanehq auth", 32)
	if err != nil {
		return "", nil, err
	}
	wrap, err = hkdf.Key(sha256.New, master, nil, "pitlanehq wrap", 32)
	return hex.EncodeToString(a), wrap, err
}

func sealAES(key, plain []byte) (string, error) {
	blk, err := aes.NewCipher(key)
	if err != nil {
		return "", err
	}
	g, err := cipher.NewGCM(blk)
	if err != nil {
		return "", err
	}
	nonce := make([]byte, g.NonceSize())
	rand.Read(nonce)
	return base64.StdEncoding.EncodeToString(g.Seal(nonce, nonce, plain, []byte("pitlanehq-v1"))), nil
}

func openAES(key []byte, sealed string) ([]byte, error) {
	b, err := base64.StdEncoding.DecodeString(sealed)
	if err != nil {
		return nil, err
	}
	blk, err := aes.NewCipher(key)
	if err != nil {
		return nil, err
	}
	g, err := cipher.NewGCM(blk)
	if err != nil {
		return nil, err
	}
	if len(b) < g.NonceSize() {
		return nil, errors.New("damaged data")
	}
	return g.Open(nil, b[:g.NonceSize()], b[g.NonceSize():], []byte("pitlanehq-v1"))
}

func checkPassword(p string) error {
	if utf8.RuneCountInString(p) < 10 {
		return errors.New("use at least 10 characters for the password")
	}
	if len(p) > 200 {
		return errors.New("password too long")
	}
	return nil
}

// iracingName reads your display name from the iRacing account connected on this PC.
func iracingName() (string, error) {
	b, code, err := dataGet("member/info", "")
	if err != nil || code >= 300 {
		return "", errors.New("connect your iRacing account first to use your iRacing name")
	}
	var m struct {
		DisplayName string `json:"display_name"`
	}
	json.Unmarshal(b, &m)
	if m.DisplayName == "" {
		return "", errors.New("could not read your iRacing name")
	}
	return m.DisplayName, nil
}

func publicName(kind, nick string) (string, string, error) {
	if kind == "iracing" {
		n, err := iracingName()
		return n, kind, err
	}
	n := cleanText(nick, 32)
	if n == "" {
		return "", "", errors.New("choose a nickname")
	}
	return n, "nick", nil
}

func plCall(method, path string, body any) ([]byte, error) {
	plMu.Lock()
	tok := plAcc.Token
	plMu.Unlock()
	return commRequest(method, "/account"+path, body, tok)
}

// ---------- the synced data: the active profile's files ----------

var syncFiles = []string{"settings.json", "local.json", "apps.json", "haptics.json", "setups.json", "carprofiles.json", "trackbook.json", "races.json", "notes.json", "companion.json"}

func syncBundle() ([]byte, string) {
	files := map[string][]byte{}
	for _, f := range syncFiles {
		if b, err := os.ReadFile(filepath.Join(activeDir(), f)); err == nil {
			files[f] = b
		}
	}
	raw, _ := json.Marshal(files) // map keys are sorted: same data, same hash
	h := sha256.Sum256(raw)
	return raw, hex.EncodeToString(h[:])
}

func gz(b []byte) []byte {
	var buf bytes.Buffer
	w, _ := gzip.NewWriterLevel(&buf, gzip.BestCompression)
	w.Write(b)
	w.Close()
	return buf.Bytes()
}

func gunz(b []byte) ([]byte, error) {
	r, err := gzip.NewReader(bytes.NewReader(b))
	if err != nil {
		return nil, err
	}
	return io.ReadAll(io.LimitReader(r, 64<<20))
}

func dataKey() ([]byte, error) {
	plMu.Lock()
	k := plAcc.DataKey
	plMu.Unlock()
	b, err := hex.DecodeString(k)
	if err != nil || len(b) != 32 {
		return nil, errors.New("sign in again on this PC")
	}
	return b, nil
}

func syncPush(force bool) error {
	key, err := dataKey()
	if err != nil {
		return err
	}
	raw, hash := syncBundle()
	sealed, err := sealAES(key, gz(raw))
	if err != nil {
		return err
	}
	if len(sealed) > 8<<20 {
		return errors.New("your data is too large to sync (over 8 MB): delete old races first")
	}
	plMu.Lock()
	base := plAcc.Version
	plMu.Unlock()
	body := map[string]any{"blob": sealed, "base": base}
	if force {
		body["force"] = true
	}
	b, err := plCall("PUT", "/sync", body)
	if err != nil {
		if strings.Contains(err.Error(), "conflict") {
			plMu.Lock()
			plAcc.Conflict = true
			savePLLocked()
			plMu.Unlock()
		}
		return err
	}
	var r struct{ Version int64 }
	json.Unmarshal(b, &r)
	plMu.Lock()
	plAcc.Version, plAcc.LastHash, plAcc.LastSync, plAcc.Conflict, plAcc.SyncErr = r.Version, hash, time.Now(), false, ""
	savePLLocked()
	plMu.Unlock()
	return nil
}

func syncPull() error {
	key, err := dataKey()
	if err != nil {
		return err
	}
	b, err := plCall("GET", "/sync", nil)
	if err != nil {
		return err
	}
	var r struct {
		Version int64
		Blob    string
	}
	json.Unmarshal(b, &r)
	if r.Blob == "" {
		return errors.New("nothing saved in your account yet")
	}
	z, err := openAES(key, r.Blob)
	if err != nil {
		return errors.New("could not decrypt your data (was the password changed on another PC? sign in again)")
	}
	raw, err := gunz(z)
	if err != nil {
		return err
	}
	var files map[string][]byte
	if err := json.Unmarshal(raw, &files); err != nil {
		return err
	}
	allowed := map[string]bool{}
	for _, f := range syncFiles {
		allowed[f] = true
	}
	dir := activeDir()
	os.MkdirAll(dir, 0o700)
	for name, data := range files {
		if !allowed[name] || !json.Valid(data) {
			continue
		}
		os.WriteFile(filepath.Join(dir, name), data, 0o600)
	}
	loadProfileState()
	bumpConfig()
	_, hash := syncBundle()
	plMu.Lock()
	plAcc.Version, plAcc.LastHash, plAcc.LastSync, plAcc.Conflict, plAcc.SyncErr = r.Version, hash, time.Now(), false, ""
	savePLLocked()
	plMu.Unlock()
	return nil
}

// syncNow pulls when only the account changed, pushes when only this PC changed
// and stops on a conflict so you choose which copy to keep.
func syncNow() error {
	plBusy.Lock()
	defer plBusy.Unlock()
	b, err := plCall("GET", "/sync/meta", nil)
	if err != nil {
		return err
	}
	var m struct{ Version int64 }
	json.Unmarshal(b, &m)
	_, hash := syncBundle()
	plMu.Lock()
	ver, last := plAcc.Version, plAcc.LastHash
	plMu.Unlock()
	localChanged, remoteChanged := hash != last, m.Version != ver
	switch {
	case remoteChanged && !localChanged:
		return syncPull()
	case localChanged && !remoteChanged:
		return syncPush(false)
	case localChanged && remoteChanged:
		plMu.Lock()
		plAcc.Conflict = true
		savePLLocked()
		plMu.Unlock()
		return errors.New("conflict: this PC and your account both changed")
	}
	return nil
}

func syncWatcher() {
	loadPL()
	for {
		time.Sleep(5 * time.Minute)
		plMu.Lock()
		on := plAcc.Token != "" && plAcc.AutoSync && !plAcc.Conflict
		plMu.Unlock()
		if !on {
			continue
		}
		err := syncNow()
		plMu.Lock()
		if err != nil {
			plAcc.SyncErr = err.Error()
		} else {
			plAcc.SyncErr = ""
		}
		savePLLocked()
		plMu.Unlock()
		if err != nil {
			log.Println("Sync:", err)
		}
	}
}

func plSignedIn(r struct {
	ID, Token, Display, NameKind, WrappedKey string
	Admin                                    bool
}, email string, wrap []byte, newKey []byte) error {
	key := newKey
	if key == nil {
		k, err := openAES(wrap, r.WrappedKey)
		if err != nil || len(k) != 32 {
			return errors.New("could not open your data key")
		}
		key = k
	}
	plMu.Lock()
	plAcc = plAccount{Email: normEmail(email), ID: r.ID, Token: r.Token, DataKey: hex.EncodeToString(key), Display: r.Display, NameKind: r.NameKind, AutoSync: true, Admin: r.Admin}
	savePLLocked()
	plMu.Unlock()
	return nil
}

func plStatus() map[string]any {
	loadPL()
	plMu.Lock()
	defer plMu.Unlock()
	a := plAcc
	out := map[string]any{"ready": commBase() != "", "signedIn": a.Token != "", "id": a.ID, "email": a.Email, "display": a.Display, "nameKind": a.NameKind,
		"autoSync": a.AutoSync, "lapsToAccount": !a.NoLaps, "admin": a.Admin, "version": a.Version, "conflict": a.Conflict, "error": a.SyncErr}
	if !a.LastSync.IsZero() {
		out["lastSync"] = a.LastSync.UnixMilli()
	}
	return out
}

func registerPLRoutes(mux *http.ServeMux) {
	go syncWatcher()
	go func() { // keep the admin flag (and public name) up to date
		for {
			plRefreshMe()
			time.Sleep(6 * time.Hour)
		}
	}()
	go companionRefresher()
	mux.HandleFunc("/api/sync", func(w http.ResponseWriter, r *http.Request) {
		loadPL()
		fail := func(err error) {
			w.WriteHeader(400)
			writeJSON(w, map[string]string{"error": err.Error()})
		}
		if r.Method == http.MethodPost {
			var in struct {
				Action, Email, Password, NewPassword, Nick, NameKind, ID string
				On                                                       bool
			}
			json.NewDecoder(io.LimitReader(r.Body, 8192)).Decode(&in)
			host, _ := os.Hostname()
			var err error
			switch in.Action {
			case "register":
				if _, e := mail.ParseAddress(in.Email); e != nil || !strings.Contains(in.Email, "@") {
					err = errors.New("write a valid email")
					break
				}
				if err = checkPassword(in.Password); err != nil {
					break
				}
				name, kind, e := publicName(in.NameKind, in.Nick)
				if e != nil {
					err = e
					break
				}
				auth, wrap, e := deriveKeys(in.Email, in.Password)
				if e != nil {
					err = e
					break
				}
				key := make([]byte, 32)
				rand.Read(key)
				wrapped, _ := sealAES(wrap, key)
				b, e := commRequest("POST", "/account/register", map[string]any{"email": normEmail(in.Email), "auth": auth, "wrappedKey": wrapped, "display": name, "nameKind": kind, "device": host}, "")
				if e != nil {
					err = e
					break
				}
				var res struct {
					ID, Token, Display, NameKind, WrappedKey string
					Admin                                    bool
				}
				json.Unmarshal(b, &res)
				if err = plSignedIn(res, in.Email, wrap, key); err == nil {
					go func() {
						plBusy.Lock()
						defer plBusy.Unlock()
						syncPush(true)
					}()
				}
			case "login":
				auth, wrap, e := deriveKeys(in.Email, in.Password)
				if e != nil {
					err = e
					break
				}
				b, e := commRequest("POST", "/account/login", map[string]any{"email": normEmail(in.Email), "auth": auth, "device": host}, "")
				if e != nil {
					err = e
					break
				}
				var res struct {
					ID, Token, Display, NameKind, WrappedKey string
					Admin                                    bool
				}
				json.Unmarshal(b, &res)
				if err = plSignedIn(res, in.Email, wrap, nil); err != nil {
					break
				}
				// nothing saved yet: upload this PC; otherwise you choose which copy to keep
				var meta struct{ Version int64 }
				if mb, e := plCall("GET", "/sync/meta", nil); e == nil {
					json.Unmarshal(mb, &meta)
				}
				plBusy.Lock()
				if meta.Version == 0 {
					syncPush(true)
				} else {
					plMu.Lock()
					plAcc.Conflict = true
					savePLLocked()
					plMu.Unlock()
				}
				plBusy.Unlock()
			case "logout":
				plCall("POST", "/logout", nil)
				plMu.Lock()
				plAcc = plAccount{}
				savePLLocked()
				plMu.Unlock()
			case "name":
				name, kind, e := publicName(in.NameKind, in.Nick)
				if e != nil {
					err = e
					break
				}
				if _, err = plCall("POST", "/me", map[string]string{"display": name, "nameKind": kind}); err == nil {
					plMu.Lock()
					plAcc.Display, plAcc.NameKind = name, kind
					savePLLocked()
					plMu.Unlock()
				}
			case "password":
				if err = checkPassword(in.NewPassword); err != nil {
					break
				}
				plMu.Lock()
				email := plAcc.Email
				plMu.Unlock()
				oldAuth, _, e := deriveKeys(email, in.Password)
				if e != nil {
					err = e
					break
				}
				newAuth, newWrap, e := deriveKeys(email, in.NewPassword)
				if e != nil {
					err = e
					break
				}
				key, e := dataKey()
				if e != nil {
					err = e
					break
				}
				wrapped, _ := sealAES(newWrap, key)
				_, err = plCall("POST", "/password", map[string]string{"auth": oldAuth, "newAuth": newAuth, "wrappedKey": wrapped})
			case "laps":
				plMu.Lock()
				plAcc.NoLaps = !in.On
				savePLLocked()
				plMu.Unlock()
				kickCloud()
			case "autosync":
				plMu.Lock()
				plAcc.AutoSync = in.On
				savePLLocked()
				plMu.Unlock()
			case "sync":
				err = syncNow()
			case "push": // keep this PC's copy
				plBusy.Lock()
				err = syncPush(true)
				plBusy.Unlock()
			case "pull": // keep the account's copy
				plBusy.Lock()
				err = syncPull()
				plBusy.Unlock()
			case "sessions":
				b, e := plCall("GET", "/sessions", nil)
				if e != nil {
					fail(e)
					return
				}
				w.Header().Set("Content-Type", "application/json")
				w.Write(b)
				return
			case "revoke":
				_, err = plCall("POST", "/sessions/revoke", map[string]string{"id": in.ID})
			case "delete":
				plMu.Lock()
				email := plAcc.Email
				plMu.Unlock()
				auth, _, e := deriveKeys(email, in.Password)
				if e != nil {
					err = e
					break
				}
				if _, err = plCall("POST", "/delete", map[string]string{"auth": auth}); err == nil {
					plMu.Lock()
					plAcc = plAccount{}
					savePLLocked()
					plMu.Unlock()
				}
			default:
				err = errors.New("unknown action")
			}
			if err != nil {
				plMu.Lock()
				if in.Action == "sync" {
					plAcc.SyncErr = err.Error()
					savePLLocked()
				}
				plMu.Unlock()
				fail(err)
				return
			}
		}
		writeJSON(w, plStatus())
	})
}

// plRefreshMe asks the server whether this account is an admin.
func plRefreshMe() {
	loadPL()
	plMu.Lock()
	tok := plAcc.Token
	plMu.Unlock()
	if tok == "" {
		return
	}
	b, err := commRequest("GET", "/account/me", nil, tok)
	if err != nil {
		return
	}
	var me struct {
		ID    string `json:"id"`
		Admin bool   `json:"admin"`
	}
	if json.Unmarshal(b, &me) != nil || me.ID == "" {
		return
	}
	plMu.Lock()
	if plAcc.ID == me.ID && plAcc.Admin != me.Admin {
		plAcc.Admin = me.Admin
		savePLLocked()
	}
	plMu.Unlock()
}
