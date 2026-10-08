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
	"fmt"
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

	qrcode "github.com/skip2/go-qrcode"
)

const kdfRounds = 600000

type plAccount struct {
	Email     string    `json:"email,omitempty"`
	ID        string    `json:"id,omitempty"`
	Token     string    `json:"token,omitempty"`
	DataKey   string    `json:"dataKey,omitempty"` // hex, never sent anywhere
	Display   string    `json:"display,omitempty"`
	NameKind  string    `json:"nameKind,omitempty"` // "iracing" or "nick"
	AutoSync  bool      `json:"autoSync"`
	Version   int64     `json:"version"`  // server version this PC last synced
	LastHash  string    `json:"lastHash"` // hash of the data at that time
	LastSync  time.Time `json:"lastSync"`
	SyncErr   string    `json:"syncErr,omitempty"`
	Conflict  bool      `json:"conflict,omitempty"`
	NoLaps    bool      `json:"noLaps,omitempty"`    // do not keep my laps on the server
	Admin     bool      `json:"admin,omitempty"`     // an admin of the Pitlane HQ server (sees Connections)
	Verified  bool      `json:"verified,omitempty"`  // the email was confirmed
	Mail      bool      `json:"mail,omitempty"`      // the server can send emails
	TwoFactor bool      `json:"twoFactor,omitempty"` // signs in with an authenticator app too
	Anon      bool      `json:"anon,omitempty"`      // what you share goes as "Anonymous" (kept with the account)
	Supporter bool      `json:"supporter,omitempty"` // has the supporter badge (donates)
	SupHidden bool      `json:"supHidden,omitempty"` // and chose to hide it
	SyncAuto2 bool      `json:"syncAuto2,omitempty"` // moved to the automatic sync of 0.8.10 (once)
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

// prefs.json is not a file on this PC: it carries what you chose to share (the community settings without
// this PC's own token), so every PC of the account shares the same way
const prefsName = "prefs.json"

type syncPrefs struct {
	ShareTimes    bool   `json:"shareTimes"`
	ShareTraces   bool   `json:"shareTraces"`
	ShareReports  bool   `json:"shareReports"`
	ShareMaps     bool   `json:"shareMaps"`
	LiveWeb       bool   `json:"liveWeb"`
	ShareField    bool   `json:"shareField"`
	DeleteAfter   string `json:"deleteAfter"`
	Asked         bool   `json:"asked"`
	LapsToAccount bool   `json:"lapsToAccount"`
}

func prefsJSON() []byte {
	commMu.Lock()
	c := commCfg
	commMu.Unlock()
	plMu.Lock()
	laps := !plAcc.NoLaps
	plMu.Unlock()
	b, _ := json.Marshal(syncPrefs{c.ShareTimes, c.ShareTraces, c.ShareReports, !c.NoMaps, !c.NoLive, !c.NoField, c.DeleteAfter, c.Asked, laps})
	return b
}

func applyPrefs(b []byte) {
	var p syncPrefs
	if json.Unmarshal(b, &p) != nil {
		return
	}
	commMu.Lock()
	c := &commCfg
	c.ShareTimes, c.ShareTraces, c.ShareReports, c.NoMaps, c.NoLive, c.NoField, c.DeleteAfter, c.Asked = p.ShareTimes, p.ShareTraces && p.ShareTimes, p.ShareReports, !p.ShareMaps, !p.LiveWeb, !p.ShareField, p.DeleteAfter, p.Asked
	saveCommLocked()
	commMu.Unlock()
	plMu.Lock()
	if plAcc.NoLaps != !p.LapsToAccount {
		plAcc.NoLaps = !p.LapsToAccount
		savePLLocked()
	}
	plMu.Unlock()
}

// bundleFiles: what goes to the account, file name → content
func bundleFiles() map[string][]byte {
	files := map[string][]byte{}
	for _, f := range syncFiles {
		if b, err := os.ReadFile(filepath.Join(activeDir(), f)); err == nil {
			files[f] = b
		}
	}
	files[prefsName] = prefsJSON()
	return files
}

func bundleHash(files map[string][]byte) string {
	raw, _ := json.Marshal(files) // map keys are sorted: same data, same hash
	h := sha256.Sum256(raw)
	return hex.EncodeToString(h[:])
}

// syncBundle: the bundle as it is uploaded, and its hash
func syncBundle() ([]byte, string) {
	files := bundleFiles()
	raw, _ := json.Marshal(files)
	return raw, bundleHash(files)
}

// the base of the merge: the files as they were after the last sync, for the active profile
type syncBaseT struct {
	Profile string            `json:"profile"`
	Version int64             `json:"version"`
	Files   map[string][]byte `json:"files"`
}

func syncBasePath() string { return filepath.Join(dataDir(), "sync-base.json") }

func loadSyncBase(version int64) map[string][]byte {
	b, err := readSecret(syncBasePath())
	if err != nil {
		return nil
	}
	var x syncBaseT
	if json.Unmarshal(b, &x) != nil || x.Profile != activeID() || x.Version != version {
		return nil
	}
	return x.Files
}

func saveSyncBase(version int64, files map[string][]byte) {
	b, _ := json.Marshal(syncBaseT{activeID(), version, files})
	writeSecret(syncBasePath(), b)
}

func clearSyncBase() { os.Remove(syncBasePath()) }

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

var errSyncConflict = errors.New("the account changed on another device at the same time")

// syncRecord: this PC and the account hold the same files at this version
func syncRecord(version int64, files map[string][]byte) {
	plMu.Lock()
	plAcc.Version, plAcc.LastHash, plAcc.LastSync, plAcc.Conflict, plAcc.SyncErr = version, bundleHash(files), time.Now(), false, ""
	savePLLocked()
	plMu.Unlock()
	saveSyncBase(version, files)
}

// pushFiles uploads these files over the account's version base (force: whatever the account has)
func pushFiles(files map[string][]byte, base int64, force bool) error {
	key, err := dataKey()
	if err != nil {
		return err
	}
	raw, _ := json.Marshal(files)
	sealed, err := sealAES(key, gz(raw))
	if err != nil {
		return err
	}
	if len(sealed) > 8<<20 {
		return errors.New("your data is too large to sync (over 8 MB): delete old races first")
	}
	body := map[string]any{"blob": sealed, "base": base}
	if force {
		body["force"] = true
	}
	b, err := plCall("PUT", "/sync", body)
	if err != nil {
		if strings.Contains(err.Error(), "conflict") {
			return errSyncConflict
		}
		return err
	}
	var r struct{ Version int64 }
	json.Unmarshal(b, &r)
	syncRecord(r.Version, files)
	return nil
}

// fetchFiles reads and opens the account's copy
func fetchFiles() (files map[string][]byte, version int64, updated time.Time, err error) {
	key, err := dataKey()
	if err != nil {
		return nil, 0, time.Time{}, err
	}
	b, err := plCall("GET", "/sync", nil)
	if err != nil {
		return nil, 0, time.Time{}, err
	}
	var r struct {
		Version int64
		Updated int64
		Blob    string
	}
	json.Unmarshal(b, &r)
	if r.Blob == "" {
		return map[string][]byte{}, r.Version, time.Time{}, nil
	}
	z, err := openAES(key, r.Blob)
	if err != nil {
		return nil, 0, time.Time{}, errors.New("could not decrypt your data (was the password changed on another PC? sign in again)")
	}
	raw, err := gunz(z)
	if err != nil {
		return nil, 0, time.Time{}, err
	}
	if err := json.Unmarshal(raw, &files); err != nil {
		return nil, 0, time.Time{}, err
	}
	allowed := map[string]bool{prefsName: true}
	for _, f := range syncFiles {
		allowed[f] = true
	}
	for name, data := range files {
		if !allowed[name] || !json.Valid(data) {
			delete(files, name)
		}
	}
	return files, r.Version, time.UnixMilli(r.Updated), nil
}

// writeLocal puts the merged files on this PC (only the ones that changed) and reloads what uses them
func writeLocal(files, local map[string][]byte) {
	dir := activeDir()
	os.MkdirAll(dir, 0o700)
	changed := false
	for name, data := range files {
		if bytes.Equal(data, local[name]) {
			continue
		}
		if name == prefsName {
			applyPrefs(data)
			continue
		}
		if os.WriteFile(filepath.Join(dir, name), data, 0o600) == nil {
			changed = true
		}
	}
	if changed {
		loadProfileState()
		bumpConfig()
	}
}

// syncPush keeps this PC's copy (whatever the account has); syncPull keeps the account's
func syncPush(force bool) error {
	plMu.Lock()
	base := plAcc.Version
	plMu.Unlock()
	return pushFiles(bundleFiles(), base, force)
}

func syncPull() error {
	files, version, _, err := fetchFiles()
	if err != nil {
		return err
	}
	if len(files) == 0 {
		return errors.New("nothing saved in your account yet")
	}
	writeLocal(files, bundleFiles())
	syncRecord(version, bundleFiles())
	return nil
}

// syncOnce: nothing changed → nothing; only this PC changed → upload; the account changed → merge both
// copies (see syncmerge.go), keep the result here and upload it when it differs from the account's
func syncOnce() error {
	b, err := plCall("GET", "/sync/meta", nil)
	if err != nil {
		return err
	}
	var m struct{ Version int64 }
	json.Unmarshal(b, &m)
	local := bundleFiles()
	plMu.Lock()
	ver, last := plAcc.Version, plAcc.LastHash
	plMu.Unlock()
	if m.Version == ver && bundleHash(local) == last {
		return nil
	}
	base := loadSyncBase(ver)
	if m.Version != 0 && m.Version == ver && base != nil && sameBundle(local, base) {
		syncRecord(ver, local) // only written differently (a file saved again as it was): nothing to upload
		return nil
	}
	if m.Version == 0 || m.Version == ver {
		return pushFiles(local, m.Version, false)
	}
	remote, rv, updated, err := fetchFiles()
	if err != nil {
		return err
	}
	// a value both copies changed: the newer one wins; on this PC's first sync the account's copy
	preferRemote := func(name string) bool {
		if base == nil {
			return true
		}
		path := filepath.Join(activeDir(), name)
		if name == prefsName {
			path = commPath()
		}
		st, err := os.Stat(path)
		return err != nil || updated.After(st.ModTime())
	}
	merged := mergeBundles(base, local, remote, preferRemote)
	writeLocal(merged, local)
	final := bundleFiles()
	if sameBundle(final, remote) {
		syncRecord(rv, final)
		return nil
	}
	return pushFiles(final, rv, false)
}

// syncNow: one sync, tried again when another device uploaded at the same moment
func syncNow() error {
	plBusy.Lock()
	defer plBusy.Unlock()
	var err error
	for try := 0; try < 3; try++ {
		if err = syncOnce(); err != errSyncConflict {
			break
		}
	}
	plMu.Lock()
	if err != nil {
		plAcc.SyncErr = err.Error()
	} else {
		plAcc.SyncErr = ""
	}
	savePLLocked()
	plMu.Unlock()
	return err
}

// syncStamp changes when a synced file (or what you chose to share) changes
func syncStamp() string {
	var sb strings.Builder
	for _, f := range syncFiles {
		if st, err := os.Stat(filepath.Join(activeDir(), f)); err == nil {
			fmt.Fprintf(&sb, "%s:%d:%d;", f, st.ModTime().UnixNano(), st.Size())
		}
	}
	h := sha256.Sum256(prefsJSON())
	sb.WriteString(hex.EncodeToString(h[:8]))
	return sb.String()
}

var syncKick = make(chan struct{}, 1)

// kickSync asks for a sync now (after a sign-in, a change of name, a press of Sync now)
func kickSync() {
	select {
	case syncKick <- struct{}{}:
	default:
	}
}

// syncWatcher keeps every device of the account the same, by itself: it syncs when Pitlane HQ starts,
// a few seconds after anything synced changes on this PC, and every minute for what changed on your
// other devices (your profile and public name, the files); it also brings what this PC shared before
// it signed in under the account's name.
func syncWatcher() {
	loadPL()
	plMu.Lock()
	if plAcc.Token != "" && !plAcc.SyncAuto2 { // everyone moves to the automatic sync once; the old conflict question is gone
		plAcc.AutoSync, plAcc.Conflict, plAcc.SyncAuto2 = true, false, true
		savePLLocked()
	}
	plMu.Unlock()
	time.Sleep(3 * time.Second)
	var stamp string
	var changedAt, nextRemote, lastRun time.Time
	adopted, kicked := false, false
	for {
		plMu.Lock()
		signed := plAcc.Token != ""
		on := signed && plAcc.AutoSync
		plMu.Unlock()
		now := time.Now()
		remoteDue := now.After(nextRemote) || kicked
		if signed && remoteDue {
			plRefreshMe()
			if !adopted {
				adopted = plAdopt()
			}
		}
		if on {
			if st := syncStamp(); st != stamp {
				if stamp != "" {
					changedAt = now
				}
				stamp = st
			}
			// a change goes up 3 seconds after the last edit, and at most every 20 seconds (dragging an
			// overlay during a race does not upload the account again and again)
			if remoteDue || (!changedAt.IsZero() && now.Sub(changedAt) >= 3*time.Second && now.Sub(lastRun) >= 20*time.Second) {
				if err := syncNow(); err != nil {
					log.Println("Sync:", err)
				}
				changedAt, stamp, lastRun = time.Time{}, syncStamp(), time.Now()
			}
		}
		if remoteDue {
			nextRemote = now.Add(time.Minute)
		}
		kicked = false
		select {
		case <-syncKick:
			kicked = true
		case <-time.After(4 * time.Second):
		}
	}
}

// plAdopt: what this PC shared with its own community token (before it signed in, or an older version)
// goes under the account and its one public name; the token is not needed any more
func plAdopt() bool {
	commMu.Lock()
	dev := commCfg.Token
	commMu.Unlock()
	if dev == "" {
		return true
	}
	if _, err := commRequest("POST", "/community/adopt", map[string]string{"token": dev}, commToken()); err != nil {
		return false // the next minute
	}
	commMu.Lock()
	commCfg.Token, commCfg.UserID = "", ""
	saveCommLocked()
	commMu.Unlock()
	return true
}

type plLoginRes struct {
	ID, Token, Display, NameKind, WrappedKey string
	Admin, Verified, TwoFactor               bool
	Mailed                                   *bool
}

// a sign-in that passed the password and waits for the authenticator code (5 minutes)
type pending2faT struct {
	Pending, Email string
	Wrap           []byte
	At             time.Time
}

var (
	pending2fa   *pending2faT
	pending2faMu sync.Mutex
	plRecovery   int // recovery codes left (shown on the account page)
)

func plEmail() string {
	plMu.Lock()
	defer plMu.Unlock()
	return plAcc.Email
}

// plFinishLogin keeps the signed-in account and decides between uploading this PC or asking which copy to keep.
func plFinishLogin(b []byte, email string, wrap []byte) error {
	var res plLoginRes
	json.Unmarshal(b, &res)
	if err := plSignedIn(res, email, wrap, nil); err != nil {
		return err
	}
	// this PC and the account merge by themselves (nothing saved yet: this PC goes up as it is)
	clearSyncBase()
	go func() {
		plRefreshMe()
		syncNow()
		kickSync()
	}()
	return nil
}

func plSignedIn(r plLoginRes, email string, wrap []byte, newKey []byte) error {
	key := newKey
	if key == nil {
		k, err := openAES(wrap, r.WrappedKey)
		if err != nil || len(k) != 32 {
			return errors.New("could not open your data key")
		}
		key = k
	}
	plMu.Lock()
	plAcc = plAccount{Email: normEmail(email), ID: r.ID, Token: r.Token, DataKey: hex.EncodeToString(key), Display: r.Display, NameKind: r.NameKind, AutoSync: true, Admin: r.Admin, Verified: r.Verified, Mail: r.Mailed != nil, TwoFactor: r.TwoFactor, SyncAuto2: true}
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
		"autoSync": a.AutoSync, "lapsToAccount": !a.NoLaps, "admin": a.Admin, "supporter": a.Supporter, "supporterHidden": a.SupHidden, "verified": a.Verified, "mail": a.Mail, "twoFactor": a.TwoFactor, "recoveryLeft": plRecovery, "version": a.Version, "conflict": a.Conflict, "error": a.SyncErr}
	if !a.LastSync.IsZero() {
		out["lastSync"] = a.LastSync.UnixMilli()
	}
	return out
}

func registerPLRoutes(mux *http.ServeMux) {
	go syncWatcher() // also keeps the profile (public name, admin…) up to date
	go companionRefresher()
	// the PC reads your laps in your account through here (the server does not answer other origins);
	// only reading, only the lap and community lists, and closed to remote viewers like /api/sync
	mux.HandleFunc("/api/sync/get", func(w http.ResponseWriter, r *http.Request) {
		p := r.URL.Query().Get("p")
		ok := false
		for _, pre := range []string{"/api/sessions", "/api/laps/", "/api/bests", "/community/"} {
			if strings.HasPrefix(p, pre) {
				ok = true
			}
		}
		// admins may also mark the laps of a session valid again (POST .../validate)
		// and your profile: the summary of your recent races, hiding your supporter badge, your license classes
		post := r.Method == http.MethodPost && ((strings.HasPrefix(p, "/api/sessions/") && (strings.HasSuffix(p, "/validate") || strings.HasSuffix(p, "/incidents"))) || (strings.HasPrefix(p, "/api/laps/") && strings.HasSuffix(p, "/valid")) ||
			p == "/community/profile/races" || p == "/community/profile/badge" || p == "/community/lics" || p == "/community/leagues" || strings.HasPrefix(p, "/community/leagues/") ||
			strings.HasPrefix(p, "/community/admin/")) // the admin panel (the server checks the account is an admin)
		// and the admin panel deletes shared items and accounts
		del := r.Method == http.MethodDelete && strings.HasPrefix(p, "/community/admin/")
		if (r.Method != http.MethodGet && !post && !del) || !ok || strings.Contains(p, "..") {
			w.WriteHeader(400)
			writeJSON(w, map[string]string{"error": "not available"})
			return
		}
		loadPL()
		plMu.Lock()
		tok := plAcc.Token
		plMu.Unlock()
		if tok == "" {
			w.WriteHeader(401)
			writeJSON(w, map[string]string{"error": "sign in with your Pitlane HQ account"})
			return
		}
		var body any
		if post { // the request's JSON goes through as it is
			var in map[string]any
			json.NewDecoder(io.LimitReader(r.Body, 1<<20)).Decode(&in)
			if in == nil {
				in = map[string]any{}
			}
			body = in
		}
		b, err := commRequest(r.Method, p, body, tok)
		if err != nil {
			w.WriteHeader(502)
			writeJSON(w, map[string]string{"error": err.Error()})
			return
		}
		w.Header().Set("Content-Type", "application/json")
		w.Write(b)
	})
	mux.HandleFunc("/api/sync", func(w http.ResponseWriter, r *http.Request) {
		loadPL()
		fail := func(err error) {
			w.WriteHeader(400)
			writeJSON(w, map[string]string{"error": err.Error()})
		}
		// the PC's own window shows "My laps" from your account: it needs the server and the session
		// token (this route is closed to remote viewers, and other sites cannot read it)
		if r.Method == http.MethodGet && r.URL.Query().Get("embed") == "1" {
			plMu.Lock()
			tok := plAcc.Token
			plMu.Unlock()
			writeJSON(w, map[string]string{"server": commBase(), "token": tok})
			return
		}
		if r.Method == http.MethodPost {
			var in struct {
				Action, Email, Password, NewPassword, Nick, NameKind, ID, Lang, Code string
				Anon                                                                 *bool // share as "Anonymous" (kept with the account)
				On                                                                   bool
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
				b, e := commRequest("POST", "/account/register", map[string]any{"email": normEmail(in.Email), "auth": auth, "wrappedKey": wrapped, "display": name, "nameKind": kind, "device": host, "lang": in.Lang}, "")
				if e != nil {
					err = e
					break
				}
				var res plLoginRes
				json.Unmarshal(b, &res)
				if res.Token == "" { // the email has to be confirmed first: then sign in
					err = errors.New("verify your email first: we sent you a link, open it and then sign in")
					break
				}
				if err = plSignedIn(res, in.Email, wrap, key); err == nil {
					clearSyncBase()
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
				b, e := commRequest("POST", "/account/login", map[string]any{"email": normEmail(in.Email), "auth": auth, "device": host, "lang": in.Lang}, "")
				if e != nil {
					err = e
					break
				}
				var step struct {
					TwoFactor bool
					Pending   string
				}
				json.Unmarshal(b, &step)
				if step.TwoFactor {
					// the password is right; the authenticator code comes next (login2fa), the key waits here
					pending2faMu.Lock()
					pending2fa = &pending2faT{Pending: step.Pending, Email: in.Email, Wrap: wrap, At: time.Now()}
					pending2faMu.Unlock()
					writeJSON(w, map[string]any{"twoFactor": true})
					return
				}
				err = plFinishLogin(b, in.Email, wrap)
			case "login2fa":
				pending2faMu.Lock()
				pd := pending2fa
				pending2faMu.Unlock()
				if pd == nil || time.Since(pd.At) > 5*time.Minute {
					err = errors.New("sign in again")
					break
				}
				b, e := commRequest("POST", "/account/login/2fa", map[string]any{"pending": pd.Pending, "code": strings.TrimSpace(in.Code)}, "")
				if e != nil {
					err = e
					break
				}
				pending2faMu.Lock()
				pending2fa = nil
				pending2faMu.Unlock()
				err = plFinishLogin(b, pd.Email, pd.Wrap)
			case "2fa-setup":
				auth, _, e := deriveKeys(plEmail(), in.Password)
				if e != nil {
					err = e
					break
				}
				b, e := plCall("POST", "/2fa/setup", map[string]any{"auth": auth})
				if e != nil {
					err = e
					break
				}
				var st struct{ Secret, URL string }
				json.Unmarshal(b, &st)
				png, _ := qrcode.Encode(st.URL, qrcode.Medium, 320)
				writeJSON(w, map[string]any{"secret": st.Secret, "url": st.URL, "qr": "data:image/png;base64," + base64.StdEncoding.EncodeToString(png)})
				return
			case "2fa-enable":
				b, e := plCall("POST", "/2fa/enable", map[string]any{"code": strings.TrimSpace(in.Code)})
				if e != nil {
					err = e
					break
				}
				var st struct{ Codes []string }
				json.Unmarshal(b, &st)
				plMu.Lock()
				plAcc.TwoFactor = true
				savePLLocked()
				plMu.Unlock()
				writeJSON(w, map[string]any{"ok": true, "codes": st.Codes})
				return
			case "2fa-disable":
				auth, _, e := deriveKeys(plEmail(), in.Password)
				if e != nil {
					err = e
					break
				}
				if _, e := plCall("POST", "/2fa/disable", map[string]any{"auth": auth, "code": strings.TrimSpace(in.Code)}); e != nil {
					err = e
					break
				}
				plMu.Lock()
				plAcc.TwoFactor = false
				savePLLocked()
				plMu.Unlock()
			case "mailtest": // admins: a test email, with the server's reason when it fails
				b, e := plCall("POST", "/mail/test", map[string]any{"email": in.Email, "lang": in.Lang})
				if e != nil {
					err = e
					break
				}
				w.Header().Set("Content-Type", "application/json")
				w.Write(b)
				return
			case "logout":
				plCall("POST", "/logout", nil)
				plMu.Lock()
				plAcc = plAccount{}
				savePLLocked()
				plMu.Unlock()
				clearSyncBase()
			case "name":
				name, kind, e := publicName(in.NameKind, in.Nick)
				if e != nil {
					err = e
					break
				}
				body := map[string]any{"display": name, "nameKind": kind}
				if in.Anon != nil {
					body["anon"] = *in.Anon
				}
				if _, err = plCall("POST", "/me", body); err == nil {
					plMu.Lock()
					plAcc.Display, plAcc.NameKind = name, kind
					if in.Anon != nil {
						plAcc.Anon = *in.Anon
					}
					savePLLocked()
					plMu.Unlock()
					commMu.Lock() // the PC shares under the same name and with the same choice
					commCfg.Alias, commCfg.NameKind = name, kind
					if in.Anon != nil {
						commCfg.Anonymous, commCfg.Asked = *in.Anon, true
					}
					saveCommLocked()
					commMu.Unlock()
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
			case "refresh": // read the account again (public name, email confirmed, admin) and sync
				plRefreshMe()
				kickSync()
			case "verify": // send the confirmation email again
				plMu.Lock()
				email, tok := plAcc.Email, plAcc.Token
				plMu.Unlock()
				_, err = commRequest("POST", "/account/verify/resend", map[string]any{"email": email, "lang": in.Lang}, tok)
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
					clearSyncBase()
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

// plRefreshMe reads the account's profile (public name, anonymous, admin, email confirmed, two-step
// sign-in) so a change made on the phone or the web shows on this PC too; the PC's community settings
// take the same name.
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
		ID           string `json:"id"`
		Display      string `json:"display"`
		NameKind     string `json:"nameKind"`
		Anon         bool   `json:"anon"`
		Admin        bool   `json:"admin"`
		Supporter    bool   `json:"supporter"`
		SupHidden    bool   `json:"supporterHidden"`
		Verified     bool   `json:"verified"`
		Mail         bool   `json:"mail"`
		TwoFactor    bool   `json:"twoFactor"`
		RecoveryLeft int    `json:"recoveryLeft"`
	}
	if json.Unmarshal(b, &me) != nil || me.ID == "" {
		return
	}
	if me.NameKind != "iracing" {
		me.NameKind = "nick"
	}
	plMu.Lock()
	if plAcc.ID != me.ID {
		plMu.Unlock()
		return
	}
	if plAcc.Admin != me.Admin || plAcc.Verified != me.Verified || plAcc.Mail != me.Mail || plAcc.TwoFactor != me.TwoFactor || plAcc.Display != me.Display || plAcc.NameKind != me.NameKind || plAcc.Anon != me.Anon || plAcc.Supporter != me.Supporter || plAcc.SupHidden != me.SupHidden {
		plAcc.Supporter, plAcc.SupHidden = me.Supporter, me.SupHidden
		plAcc.Admin, plAcc.Verified, plAcc.Mail, plAcc.TwoFactor = me.Admin, me.Verified, me.Mail, me.TwoFactor
		plAcc.Display, plAcc.NameKind, plAcc.Anon = me.Display, me.NameKind, me.Anon
		savePLLocked()
	}
	plRecovery = me.RecoveryLeft
	plMu.Unlock()
	commMu.Lock()
	if me.Display != "" && (commCfg.Alias != me.Display || commCfg.NameKind != me.NameKind || commCfg.Anonymous != me.Anon) {
		commCfg.Alias, commCfg.NameKind, commCfg.Anonymous = me.Display, me.NameKind, me.Anon
		saveCommLocked()
	}
	commMu.Unlock()
}
