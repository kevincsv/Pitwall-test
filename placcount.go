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
	"net/url"
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
	Email        string    `json:"email,omitempty"`
	ID           string    `json:"id,omitempty"`
	Token        string    `json:"token,omitempty"`
	DataKey      string    `json:"dataKey,omitempty"` // hex, never sent anywhere
	KeyTag       string    `json:"keyTag,omitempty"`  // the server's short name of the wrapped key this one came from
	Display      string    `json:"display,omitempty"`
	NameKind     string    `json:"nameKind,omitempty"` // "iracing" or "nick"
	Version      int64     `json:"version"`            // server version this PC last synced
	LastHash     string    `json:"lastHash"`           // hash of the data at that time
	LastSync     time.Time `json:"lastSync"`
	SyncErr      string    `json:"syncErr,omitempty"`
	NoLaps       bool      `json:"noLaps,omitempty"`    // do not keep my laps on the server
	Admin        bool      `json:"admin,omitempty"`     // an admin of the Pitlane HQ server (sees Connections)
	Verified     bool      `json:"verified,omitempty"`  // the email was confirmed
	Mail         bool      `json:"mail,omitempty"`      // the server can send emails
	TwoFactor    bool      `json:"twoFactor,omitempty"` // signs in with an authenticator app too
	Anon         bool      `json:"anon,omitempty"`      // what you share goes as "Anonymous" (kept with the account)
	Supporter    bool      `json:"supporter,omitempty"` // has the supporter badge (donates)
	SupHidden    bool      `json:"supHidden,omitempty"` // and chose to hide it
	Pro          bool      `json:"pro,omitempty"`       // has Pitlane HQ Pro (lifetime, a subscription or given by hand)
	ProSrc       string    `json:"proSrc,omitempty"`
	ProGate      bool      `json:"proGate,omitempty"`      // the beta is over: Pro is needed for what it unlocks
	ProElsewhere bool      `json:"proElsewhere,omitempty"` // the account's Pro is on another PC
	Ended        bool      `json:"ended,omitempty"`        // signed out by the server (see plSessionEnded); the email stays
	Escrow       bool      `json:"escrow,omitempty"`       // the server keeps a copy of the data key (Steam and Discord sign in without the password)
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
	b, err := commRequest(method, "/account"+path, body, tok)
	plSessionEnded(tok, err)
	return b, err
}

// plSessionEnded: the server no longer knows this PC's sign-in (signed out everywhere, the password or
// the two-step sign-in changed on another device, the account deleted, the server's data made again).
// This PC then shows the sign-in screen with the email filled in, instead of staying half signed in
// with every sync failing; its data stays and joins the account again on the next sign-in. The account's
// id and its data key stay too (under DPAPI as before, with the server's tag of the key), so a sign-in with
// Steam of the same account on this PC needs no password while the key is still the account's; only a
// sign-out on this PC (logout, delete) wipes them.
func plSessionEnded(tok string, err error) {
	var he httpErr
	if tok == "" || !errors.As(err, &he) || he.code != 401 || !strings.HasPrefix(he.msg, "signed out") {
		return
	}
	plMu.Lock()
	ended := plAcc.Token == tok
	if ended {
		plAcc = plAccount{Email: plAcc.Email, ID: plAcc.ID, DataKey: plAcc.DataKey, KeyTag: plAcc.KeyTag, Ended: true}
		savePLLocked()
	}
	plMu.Unlock()
	if ended {
		clearSyncBase()
		log.Println("Account: the server signed this PC out; sign in again")
	}
}

// ---------- the synced data: the active profile's files ----------

var syncFiles = []string{"settings.json", "local.json", "apps.json", "haptics.json", "setups.json", "carprofiles.json", "trackbook.json", "races.json", "notes.json", "drivers.json", "ratings.json", "companion.json"}

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
	c.ShareReports, c.DeleteAfter, c.Asked = p.ShareReports, p.DeleteAfter, p.Asked // the laps, rivals, layouts and live always go (loadCommunity)
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
	plAcc.Version, plAcc.LastHash, plAcc.LastSync, plAcc.SyncErr = version, bundleHash(files), time.Now(), ""
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

// syncPush uploads this PC's copy (force: whatever the account has)
func syncPush(force bool) error {
	plMu.Lock()
	base := plAcc.Version
	plMu.Unlock()
	return pushFiles(bundleFiles(), base, force)
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
	if err == nil {
		plEscrowUp()
	}
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

// kickSyncFrom: the server says another device uploaded the account (version v): this PC syncs at once,
// unless it has that version already (its own upload).
func kickSyncFrom(v int64) {
	plMu.Lock()
	have := plAcc.Version
	plMu.Unlock()
	if v != 0 && v <= have {
		return
	}
	kickSync()
}

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
	time.Sleep(3 * time.Second)
	var stamp string
	var changedAt, nextRemote, lastRun time.Time
	adopted, kicked, rivalsNamed := false, false, false
	for {
		plMu.Lock()
		signed := plAcc.Token != ""
		on := signed // the sync is always on: nobody syncs by hand
		plMu.Unlock()
		now := time.Now()
		remoteDue := now.After(nextRemote) || kicked
		if signed && remoteDue {
			plRefreshMe()
			if !adopted {
				adopted = plAdopt()
			}
			if !rivalsNamed {
				rivalsNamed = nameOldRivals()
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
	KeyTag                                   string // the server's short name of the wrapped key (never the key)
	Admin, Verified, TwoFactor               bool
	Mailed                                   *bool
	Escrow                                   bool   // the server keeps a copy of the data key
	DataKey, Email                           string // a sign-in with Steam or Discord: the server's copy of the data key (hex) and the account's email
}

// a sign-in that passed the password (or Steam or Discord, with no key yet: NoKey) and waits for the authenticator code
// (5 minutes)
type pending2faT struct {
	Pending, Email string
	Wrap           []byte
	NoKey          bool
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
	plAcc = plAccount{Email: normEmail(email), ID: r.ID, Token: r.Token, DataKey: hex.EncodeToString(key), KeyTag: r.KeyTag, Display: r.Display, NameKind: r.NameKind, Admin: r.Admin, Verified: r.Verified, Mail: r.Mailed != nil, TwoFactor: r.TwoFactor, Escrow: r.Escrow}
	savePLLocked()
	plMu.Unlock()
	return nil
}

// plEscrowUp: the data key goes to the server once (POST /account/escrow, with the account's email), after a sync that opened
// or sealed the account's copy with it, so the sign-ins with Steam and Discord need no password. Tried once per sign-in
// while this program runs; the caller holds plBusy.
var escrowTried string

func plEscrowUp() {
	plMu.Lock()
	tok, key, email, has := plAcc.Token, plAcc.DataKey, plAcc.Email, plAcc.Escrow
	plMu.Unlock()
	if tok == "" || has || len(key) != 64 || escrowTried == tok {
		return
	}
	escrowTried = tok
	body := map[string]string{"key": key}
	if email != "" {
		body["email"] = email
	}
	if _, err := plCall("POST", "/escrow", body); err != nil {
		log.Println("Account: the server did not keep the key:", err)
		return
	}
	plMu.Lock()
	if plAcc.Token == tok {
		plAcc.Escrow = true
		savePLLocked()
	}
	plMu.Unlock()
}

// keyOpens: the server's copy of the data key opens the account's synced data (or there is none yet). A server that
// cannot be reached says nothing against it (the sync tells later).
func keyOpens(tok string, key []byte) bool {
	b, err := commRequest("GET", "/account/sync", nil, tok)
	if err != nil {
		return true
	}
	var r struct{ Blob string }
	json.Unmarshal(b, &r)
	if r.Blob == "" {
		return true
	}
	_, err = openAES(key, r.Blob)
	return err == nil
}

// ---------- "Sign in with Steam" ----------
//
// Steam only says who: the browser signs in at steamcommunity.com and comes back to the server, which sends it on to
// this PC (http://127.0.0.1:<port>/steam/done) with a one-use grant that only this PC can redeem, with the code the
// server gave it when it started (steamLoginStart opens the browser; the page asks how it goes with steamLoginPoll,
// which signs in with the grant; "status": wait, new, twoFactor, password). The data key still comes from the password,
// asked once on this PC (steamLoginKey, the server hands the wrapped key to the password alone) only when the server keeps
// no copy of it (dataKey in its answer) or that copy does not open the account: a PC that kept the same account's key,
// still the account's (KeyTag), needs none either.

// a state, a grant or a code is 48 hex characters, nothing else goes in an address to the server
func steamStateClean(s string) string {
	if len(s) != 48 {
		return ""
	}
	for _, c := range s {
		if (c < '0' || c > '9') && (c < 'a' || c > 'f') {
			return ""
		}
	}
	return s
}

// steamURLOK: the browser only ever opens Steam's own sign-in page, whatever the server answered
func steamURLOK(u string) bool {
	return strings.HasPrefix(u, "https://steamcommunity.com/openid/login?")
}

// ---------- "Sign in with Discord" ----------
//
// The same as Steam's, with Discord's OAuth2 (discord.js): the browser signs in at discord.com, the server sends it on to
// this PC (http://127.0.0.1:<port>/discord/done) with the grant, redeemed with this PC's code (discordLoginStart,
// discordLoginPoll, discordLoginKey, discordLoginCancel; Account → Discord's discordStart and discordUnlink ask the
// password). The waits, the sign-up grant and the sign-in waiting for the password are the ones below, per provider.

// discordURLOK: the browser only ever opens Discord's own sign-in page, whatever the server answered
func discordURLOK(u string) bool {
	return strings.HasPrefix(u, "https://discord.com/oauth2/authorize?")
}

// an outside sign-in (Steam or Discord): its server routes, the parameters the browser comes back with and the page it
// may open
type oauthProv struct {
	Name                                  string // "steam" or "discord": the actions' and the answers' prefix
	Label                                 string // for the errors ("sign in with Steam again")
	LoginStart, Login, LinkStart, LinkUse string // the server's routes (under /account)
	Unlink                                string
	LinkParam                             string // the link grant in the browser's way back (steamLink=, discordLink=)
	URLOK                                 func(string) bool
}

var (
	steamProv   = oauthProv{Name: "steam", Label: "Steam", LoginStart: "/steam/login/start", Login: "/login/steam", LinkStart: "/steam/start", LinkUse: "/steam/link", Unlink: "/steam/unlink", LinkParam: "steamLink", URLOK: steamURLOK}
	discordProv = oauthProv{Name: "discord", Label: "Discord", LoginStart: "/discord/login/start", Login: "/login/discord", LinkStart: "/discord/start", LinkUse: "/discord/link/grant", Unlink: "/discord/unlink", LinkParam: "discordLink", URLOK: discordURLOK}
)

// oauthAction: which outside sign-in an action of the page is for, and what it asks ("steamLoginPoll" → Steam,
// "LoginPoll"; "discordStart" → Discord, "Start"), or ok false
func oauthAction(a string) (pv oauthProv, op string, ok bool) {
	for _, p := range []oauthProv{steamProv, discordProv} {
		if strings.HasPrefix(a, p.Name) {
			return p, a[len(p.Name):], true
		}
	}
	return oauthProv{}, "", false
}

func (p oauthProv) again() error { return errors.New("sign in with " + p.Label + " again") }

// the sign-in of each provider this PC started and waits for, and the sign-up grant it was given (under steamPendingMu)
func (p oauthProv) wait() **steamWaitT {
	if p.Name == "discord" {
		return &discordWait
	}
	return &steamWait
}

func (p oauthProv) newGrant() *struct{ Sid, Code string } {
	if p.Name == "discord" {
		return &discordNew
	}
	return &steamNew
}

// the Steam (or Discord) sign-in this PC started and waits for (a sign-in, or Account → Steam's link): the browser comes back to
// /steam/done with the answer, read by the page (steamLoginPoll) or, for a link, used there at once
type steamWaitT struct {
	State, Code string
	Link        bool // Account → Steam: the grant links this account
	At          time.Time
	Done        bool
	Ans         url.Values // what Steam's answer gave: steamLogin=<grant>, or steamLogin=0&new=1&sid=…
}

// a sign-in with Steam the server accepted, waiting for the password that opens the data key (10 minutes)
type steamPendingT struct {
	Res plLoginRes
	At  time.Time
}

var (
	steamWait      *steamWaitT
	steamNew       struct{ Sid, Code string } // the sign-up grant and its code, for the account "register" creates
	discordWait    *steamWaitT
	discordNew     struct{ Sid, Code string }
	steamPending   *steamPendingT
	steamPendingMu sync.Mutex
)

// newCode: the code of the sign-up grant this PC was given, for "register"
func (p oauthProv) newCode(sid string) string {
	steamPendingMu.Lock()
	defer steamPendingMu.Unlock()
	if n := p.newGrant(); sid != "" && n.Sid == sid {
		return n.Code
	}
	return ""
}

// plSteamLogin takes the server's answer to a sign-in with Steam: the same account whose data key this PC kept, while
// the key is still the account's (the same tag), signs in at once (no password), and so does one whose answer brings
// the server's copy of the key when it opens the account's data; any other waits for the password (needKey) in
// steamPending. The caller syncs.
func plSteamLogin(b []byte) (needKey bool, err error) {
	var res plLoginRes
	json.Unmarshal(b, &res)
	if res.ID == "" || res.Token == "" {
		return false, errors.New("sign in again")
	}
	plMu.Lock()
	if plAcc.ID == res.ID && plAcc.DataKey != "" && plAcc.KeyTag != "" && plAcc.KeyTag == res.KeyTag {
		plAcc = plAccount{Email: plAcc.Email, ID: res.ID, Token: res.Token, DataKey: plAcc.DataKey, KeyTag: plAcc.KeyTag, Display: res.Display, NameKind: res.NameKind, Admin: res.Admin, Verified: res.Verified, Mail: res.Mailed != nil, TwoFactor: res.TwoFactor, Escrow: res.Escrow}
		savePLLocked()
		plMu.Unlock()
		return false, nil
	}
	plMu.Unlock()
	if k, err := hex.DecodeString(res.DataKey); err == nil && len(k) == 32 && keyOpens(res.Token, k) {
		email := normEmail(res.Email)
		if email == "" {
			email = steamKnownEmail(res.ID)
		}
		res.Escrow = true
		plSignedIn(res, email, nil, k)
		steamPendingMu.Lock()
		if old := steamPending; old != nil && old.Res.Token != res.Token { // a sign-in left waiting for the password is let go
			go commRequest("POST", "/account/logout", nil, old.Res.Token)
		}
		steamPending = nil
		steamPendingMu.Unlock()
		return false, nil
	}
	steamPendingMu.Lock()
	if old := steamPending; old != nil && old.Res.Token != res.Token { // started again: the sign-in waiting is let go
		go commRequest("POST", "/account/logout", nil, old.Res.Token)
	}
	steamPending = &steamPendingT{Res: res, At: time.Now()}
	steamPendingMu.Unlock()
	return true, nil
}

// steamKnownEmail: the email the password step may fill in, when this PC's account is (or may be) the one signing in
func steamKnownEmail(id string) string {
	plMu.Lock()
	defer plMu.Unlock()
	if plAcc.ID == "" || plAcc.ID == id {
		return plAcc.Email
	}
	return ""
}

// plSteamFinish: signed in with Steam and the key opened, the PC and the account merge like after a password sign-in
func plSteamFinish() {
	clearSyncBase()
	go func() {
		plRefreshMe()
		syncNow()
		kickSync()
	}()
}

// what the browser's way back said about a sign-in (pure, so a test can run it): the sign-in grant, or a new driver's
// sign-up grant and the name to offer, or a Discord linked only by the bot (Relink); anything else is nothing
type oauthRes struct {
	Grant, Sid, Name string
	Relink           bool
}

func oauthAnswer(pv oauthProv, q url.Values) oauthRes {
	if g := steamStateClean(q.Get(pv.Name + "Login")); g != "" {
		return oauthRes{Grant: g}
	}
	if q.Get(pv.Name+"Login") != "0" {
		return oauthRes{}
	}
	if sid := steamStateClean(q.Get("sid")); q.Get("new") == "1" && sid != "" {
		name := q.Get("persona")
		if pv.Name == "discord" {
			name = q.Get("name")
		}
		return oauthRes{Sid: sid, Name: cleanText(strings.NewReplacer("<", "", ">", "", "\n", "").Replace(name), 32)}
	}
	return oauthRes{Relink: pv.Name == "discord" && q.Get("relink") == "1"}
}

// oauthDone: the browser comes back from Steam or Discord (the server sends it on to
// http://127.0.0.1:<port>/steam/done?state=… or /discord/done): the answer of the sign-in this PC started waits for the
// page (…LoginPoll); the grant of Account → Steam's (or Discord's) link is used at once. Then the browser goes on to the
// web app, which only says to come back here (?steamLogin=pc, ?steamLinked=1|0|taken; the same with discord…)
func oauthDone(pv oauthProv) http.HandlerFunc {
	return func(w http.ResponseWriter, r *http.Request) {
		q := r.URL.Query()
		state := steamStateClean(q.Get("state"))
		steamPendingMu.Lock()
		wp := pv.wait()
		sw := *wp
		ok := r.Method == http.MethodGet && state != "" && sw != nil && sw.State == state && !sw.Done && time.Since(sw.At) <= 10*time.Minute
		if ok {
			sw.Done, sw.Ans = true, q
			if sw.Link {
				*wp = nil
			}
		}
		steamPendingMu.Unlock()
		if !ok {
			http.Error(w, "sign in with "+pv.Label+" again", 400)
			return
		}
		back := pv.Name + "Login=pc"
		if sw.Link {
			back = pv.Name + "Linked=0"
			if g := steamStateClean(q.Get(pv.LinkParam)); g != "" {
				_, e := plCall("POST", pv.LinkUse, map[string]any{"grant": g, "code": sw.Code})
				var he httpErr
				if e == nil {
					back = pv.Name + "Linked=1"
				} else if errors.As(e, &he) && he.code == 409 {
					back = pv.Name + "Linked=taken"
				}
			}
		}
		http.Redirect(w, r, commBase()+"/?"+back, http.StatusFound)
	}
}

func plStatus() map[string]any {
	loadPL()
	plMu.Lock()
	defer plMu.Unlock()
	a := plAcc
	out := map[string]any{"ready": commBase() != "", "signedIn": a.Token != "", "id": a.ID, "email": a.Email, "display": a.Display, "nameKind": a.NameKind,
		"lapsToAccount": !a.NoLaps, "admin": a.Admin, "supporter": a.Supporter, "supporterHidden": a.SupHidden, "pro": a.Pro, "proSrc": a.ProSrc, "proGate": a.ProGate, "proElsewhere": a.ProElsewhere, "verified": a.Verified, "mail": a.Mail, "twoFactor": a.TwoFactor, "recoveryLeft": plRecovery, "version": a.Version, "error": a.SyncErr, "ended": a.Ended}
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
			p == "/community/profile/races" || p == "/community/profile/badge" || strings.HasPrefix(p, "/community/coach/") || p == "/community/pro/pc" || p == "/community/lics" || p == "/community/leagues" || strings.HasPrefix(p, "/community/leagues/") ||
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
		// Pro is kept on one PC: its questions carry this PC's id and name
		if p == "/community/pro" || strings.HasPrefix(p, "/community/pro?") || p == "/community/pro/pc" {
			sep := "?"
			if strings.Contains(p, "?") {
				sep = "&"
			}
			p += sep + "pc=" + pcID() + "&pcname=" + url.QueryEscape(pcName())
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
		// one session with its laps (and their telemetry with ?traces=1) can be big: it gets the longer timeout
		client := commHTTP
		if r.Method == http.MethodGet && strings.HasPrefix(p, "/api/sessions/") {
			client = commHTTPLong
		}
		b, err := commRequestWith(client, r.Method, p, body, tok)
		if err != nil {
			w.WriteHeader(502)
			writeJSON(w, map[string]string{"error": err.Error()})
			return
		}
		if post && strings.HasPrefix(p, "/community/pro/pc") {
			go plRefreshMe() // Pro moved to this PC: Auto opens everything again
		}
		w.Header().Set("Content-Type", "application/json")
		w.Write(b)
	})
	mux.HandleFunc("/steam/done", oauthDone(steamProv))
	mux.HandleFunc("/discord/done", oauthDone(discordProv))
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
				Device, State, Sid, DiscordSid                                       string // the sign-in with Steam or Discord: this device's name, its state, the sign-up grant of a new account
				Anon                                                                 *bool  // share as "Anonymous" (kept with the account)
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
				reg := map[string]any{"email": normEmail(in.Email), "auth": auth, "wrappedKey": wrapped, "display": name, "nameKind": kind, "device": host, "lang": in.Lang}
				if sid := steamStateClean(in.Sid); sid != "" { // created from the Steam sign-in: linked to that Steam at once
					reg["sid"], reg["code"] = sid, steamProv.newCode(sid)
				} else if sid := steamStateClean(in.DiscordSid); sid != "" { // the same from the Discord sign-in
					reg["discordSid"], reg["code"] = sid, discordProv.newCode(sid)
				}
				b, e := commRequest("POST", "/account/register", reg, "")
				if e != nil {
					err = e
					break
				}
				steamPendingMu.Lock()
				steamNew, discordNew = struct{ Sid, Code string }{}, struct{ Sid, Code string }{}
				steamPendingMu.Unlock()
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
				if pd.NoKey { // a sign-in with Steam or Discord: the key is still to open, unless this PC kept it
					needKey, e := plSteamLogin(b)
					if e != nil {
						err = e
						break
					}
					if needKey {
						writeJSON(w, map[string]any{"status": "password", "needKey": true, "email": steamKnownEmail("")})
						return
					}
					plSteamFinish()
					break
				}
				err = plFinishLogin(b, pd.Email, pd.Wrap)
			case "steamLoginStart", "discordLoginStart":
				// the sign-in screen: the server gives the address Steam (or Discord) signs in at (and the code only this PC
				// keeps), this PC opens it in the browser, which comes back to /steam/done (/discord/done); the page asks how
				// it goes (steamLoginPoll, discordLoginPoll)
				pv, _, _ := oauthAction(in.Action)
				device := cleanText(in.Device, 64)
				if device == "" {
					device = host
				}
				b, e := commRequest("POST", "/account"+pv.LoginStart, map[string]any{"device": device, "port": listenPort}, "")
				if e != nil {
					err = e
					break
				}
				var st struct{ URL, State, Code string }
				json.Unmarshal(b, &st)
				state, code := steamStateClean(st.State), steamStateClean(st.Code)
				if !pv.URLOK(st.URL) || state == "" || code == "" {
					err = pv.again()
					break
				}
				steamPendingMu.Lock()
				*pv.wait() = &steamWaitT{State: state, Code: code, At: time.Now()}
				steamPendingMu.Unlock()
				openExternal(st.URL)
				writeJSON(w, map[string]any{"url": st.URL, "state": state, "opened": true})
				return
			case "steamLoginPoll", "discordLoginPoll":
				// did the browser come back yet: pending, a new driver (the page creates the account, linked with sid), or the
				// grant, which signs this PC in; then the authenticator code (login2fa) or the password for the key (needKey)
				pv, _, _ := oauthAction(in.Action)
				state := steamStateClean(in.State)
				steamPendingMu.Lock()
				wp := pv.wait()
				sw := *wp
				if sw != nil && sw.Done && sw.State == state {
					*wp = nil
				}
				steamPendingMu.Unlock()
				if state == "" || sw == nil || sw.State != state || sw.Link || time.Since(sw.At) > 10*time.Minute {
					err = pv.again()
					break
				}
				if !sw.Done {
					writeJSON(w, map[string]any{"status": "wait", "pending": true})
					return
				}
				res := oauthAnswer(pv, sw.Ans)
				if res.Grant == "" {
					if res.Sid != "" {
						steamPendingMu.Lock()
						*pv.newGrant() = struct{ Sid, Code string }{res.Sid, sw.Code}
						steamPendingMu.Unlock()
						out := map[string]any{"status": "new", "new": true, "sid": res.Sid, pv.Name: true}
						if pv.Name == "discord" {
							out["name"] = res.Name
						} else {
							out["persona"] = res.Name
						}
						writeJSON(w, out)
						return
					}
					if res.Relink {
						err = errors.New("this Discord account was linked with the bot. Sign in with your password and link Discord again in Account")
						break
					}
					err = pv.again()
					break
				}
				grant := res.Grant
				b, e := commRequest("POST", "/account"+pv.Login, map[string]any{"grant": grant, "code": sw.Code, "device": host, "lang": in.Lang}, "")
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
					pending2faMu.Lock()
					pending2fa = &pending2faT{Pending: step.Pending, NoKey: true, At: time.Now()}
					pending2faMu.Unlock()
					writeJSON(w, map[string]any{"status": "twoFactor", "twoFactor": true})
					return
				}
				needKey, e := plSteamLogin(b)
				if e != nil {
					err = e
					break
				}
				if needKey {
					writeJSON(w, map[string]any{"status": "password", "needKey": true, "email": steamKnownEmail("")})
					return
				}
				plSteamFinish()
			case "steamLoginCancel", "discordLoginCancel":
				// the password step closed without the password: the sign-in waits no more and its session is let go
				steamPendingMu.Lock()
				sp := steamPending
				steamPending = nil
				steamPendingMu.Unlock()
				pending2faMu.Lock()
				if pending2fa != nil && pending2fa.NoKey {
					pending2fa = nil
				}
				pending2faMu.Unlock()
				if sp != nil {
					go commRequest("POST", "/account/logout", nil, sp.Res.Token)
				}
			case "steamLoginKey", "loginSteamKey", "discordLoginKey", "loginDiscordKey":
				// the password, once on this PC, for the data key of the account Steam (or Discord) signed in: the server checks it (with
				// its limit of wrong ones) and answers with the wrapped key, which the password opens here
				steamPendingMu.Lock()
				sp := steamPending
				steamPendingMu.Unlock()
				if sp == nil || time.Since(sp.At) > 10*time.Minute {
					err = errors.New("sign in again")
					break
				}
				email := normEmail(in.Email)
				if email == "" {
					email = steamKnownEmail(sp.Res.ID)
				}
				if email == "" {
					err = errors.New("write the email of your account")
					break
				}
				auth, wrap, e := deriveKeys(email, in.Password)
				if e != nil {
					err = e
					break
				}
				kb, e := commRequest("POST", "/account/key", map[string]any{"auth": auth}, sp.Res.Token)
				var he httpErr
				if errors.As(e, &he) && he.code == 401 {
					e = errors.New("the email or the password is wrong")
				}
				if e != nil {
					err = e
					break
				}
				res := sp.Res
				var k struct{ WrappedKey, KeyTag string }
				json.Unmarshal(kb, &k)
				res.WrappedKey, res.KeyTag = k.WrappedKey, k.KeyTag
				res.Escrow = false // the server's copy (if any) did not open the account: this key goes up instead
				if plSignedIn(res, email, wrap, nil) != nil {
					err = errors.New("the email or the password is wrong")
					break
				}
				steamPendingMu.Lock()
				steamPending = nil
				steamPendingMu.Unlock()
				plSteamFinish()
			case "steam", "steamStart", "steamShow", "steamUnlink", "discord", "discordStart", "discordShow", "discordUnlink":
				// the Steam (or Discord) account linked to this one (Account → Steam, Account → Discord): what is linked, the
				// sign-in to link it (the password first; this PC opens the address in the browser, which comes back to
				// /steam/done or /discord/done), shown on the profile or not, and unlink (the password first)
				pv, op, _ := oauthAction(in.Action)
				var b []byte
				var e error
				switch op {
				case "":
					b, e = plCall("GET", "/"+pv.Name, nil)
				case "Start", "Unlink":
					auth, _, ea := deriveKeys(plEmail(), in.Password)
					if ea != nil {
						fail(ea)
						return
					}
					if op == "Start" {
						b, e = plCall("POST", pv.LinkStart, map[string]any{"device": host, "auth": auth, "port": listenPort})
					} else {
						b, e = plCall("POST", pv.Unlink, map[string]any{"auth": auth})
					}
				default:
					if pv.Name == "discord" {
						b, e = plCall("POST", "/discord/show", map[string]bool{"shown": in.On})
					} else {
						b, e = plCall("POST", "/steam/shown", map[string]bool{"shown": in.On})
					}
				}
				if e != nil {
					fail(e)
					return
				}
				if op == "Start" {
					var st struct{ URL, State, Code string }
					json.Unmarshal(b, &st)
					state, code := steamStateClean(st.State), steamStateClean(st.Code)
					if !pv.URLOK(st.URL) || state == "" || code == "" {
						fail(pv.again())
						return
					}
					steamPendingMu.Lock()
					*pv.wait() = &steamWaitT{State: state, Code: code, Link: true, At: time.Now()}
					steamPendingMu.Unlock()
					openExternal(st.URL)
					writeJSON(w, map[string]any{"url": st.URL, "opened": true})
					return
				}
				w.Header().Set("Content-Type", "application/json")
				w.Write(b)
				return
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
	b, err := commRequest("GET", "/account/me?pc="+pcID()+"&pcname="+url.QueryEscape(pcName()), nil, tok)
	if err != nil {
		plSessionEnded(tok, err)
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
		Pro          bool   `json:"pro"`
		ProSrc       string `json:"proSrc"`
		ProGate      bool   `json:"proGate"`
		PcOk         *bool  `json:"pcOk"`
		Verified     bool   `json:"verified"`
		Mail         bool   `json:"mail"`
		TwoFactor    bool   `json:"twoFactor"`
		RecoveryLeft int    `json:"recoveryLeft"`
		Escrow       *bool  `json:"escrow"`
	}
	if json.Unmarshal(b, &me) != nil || me.ID == "" {
		return
	}
	if me.NameKind != "iracing" {
		me.NameKind = "nick"
	}
	elsewhere := me.Pro && me.PcOk != nil && !*me.PcOk // Pro is on another PC of the account
	plMu.Lock()
	if plAcc.ID != me.ID {
		plMu.Unlock()
		return
	}
	if plAcc.Admin != me.Admin || plAcc.Verified != me.Verified || plAcc.Mail != me.Mail || plAcc.TwoFactor != me.TwoFactor || plAcc.Display != me.Display || plAcc.NameKind != me.NameKind || plAcc.Anon != me.Anon || plAcc.Supporter != me.Supporter || plAcc.SupHidden != me.SupHidden || plAcc.Pro != me.Pro || plAcc.ProSrc != me.ProSrc || plAcc.ProGate != me.ProGate || plAcc.ProElsewhere != elsewhere {
		plAcc.Supporter, plAcc.SupHidden = me.Supporter, me.SupHidden
		plAcc.Pro, plAcc.ProSrc, plAcc.ProGate, plAcc.ProElsewhere = me.Pro, me.ProSrc, me.ProGate, elsewhere
		plAcc.Admin, plAcc.Verified, plAcc.Mail, plAcc.TwoFactor = me.Admin, me.Verified, me.Mail, me.TwoFactor
		plAcc.Display, plAcc.NameKind, plAcc.Anon = me.Display, me.NameKind, me.Anon
		savePLLocked()
	}
	if me.Escrow != nil && plAcc.Escrow != *me.Escrow {
		plAcc.Escrow = *me.Escrow
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
