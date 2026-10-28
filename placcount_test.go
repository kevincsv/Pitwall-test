package main

import (
	"bytes"
	"encoding/hex"
	"encoding/json"
	"io"
	"net/http"
	"net/http/httptest"
	"net/url"
	"os"
	"path/filepath"
	"strings"
	"testing"
	"time"
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

// the server no longer knows this PC's sign-in: the PC signs out by itself (keeping the email, the account's id
// and its data key, so a sign-in with Steam needs no password) instead of staying half signed in; a wrong
// password (also a 401) never signs it out
func TestAccountSessionEndedByServer(t *testing.T) {
	dir := t.TempDir()
	t.Setenv("XDG_CONFIG_HOME", dir)
	t.Setenv("HOME", dir)
	t.Setenv("APPDATA", dir)
	srv := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		w.WriteHeader(401)
		if r.URL.Path == "/account/password" {
			w.Write([]byte(`{"error":"the current password is wrong"}`))
			return
		}
		w.Write([]byte(`{"error":"signed out: sign in again"}`))
	}))
	defer srv.Close()
	commMu.Lock()
	old := commCfg
	commCfg = commConfig{URL: srv.URL}
	commMu.Unlock()
	defer func() { commMu.Lock(); commCfg = old; commMu.Unlock() }()
	loadPL()
	plMu.Lock()
	plAcc = plAccount{Email: "driver@example.com", ID: "a1", Token: "tok-0123456789abcdefghij0123456789abcdefghij", DataKey: strings.Repeat("ab", 32), KeyTag: "k1", Display: "Ana"}
	plMu.Unlock()
	if _, err := plCall("POST", "/password", map[string]string{}); err == nil {
		t.Fatal("the wrong password must fail")
	}
	plMu.Lock()
	still := plAcc.Token != ""
	plMu.Unlock()
	if !still {
		t.Fatal("a wrong password must not sign the PC out")
	}
	if _, err := plCall("GET", "/sync/meta", nil); err == nil {
		t.Fatal("the call must fail")
	}
	plMu.Lock()
	a := plAcc
	plMu.Unlock()
	if a.Token != "" || !a.Ended || a.Display != "" || a.Email != "driver@example.com" || a.ID != "a1" || a.DataKey != strings.Repeat("ab", 32) || a.KeyTag != "k1" {
		t.Fatalf("the PC must be signed out with its email, id and data key kept: %+v", a)
	}
}

// a state, a grant or a code is 48 lowercase hex characters, and the browser only opens Steam's own sign-in page
func TestSteamStateClean(t *testing.T) {
	state := strings.Repeat("0f", 24)
	if steamStateClean(state) != state || steamStateClean(strings.ToUpper(state)) != "" || steamStateClean(state[:47]) != "" || steamStateClean(state[:47]+"g") != "" || steamStateClean("") != "" {
		t.Fatal("a state is 48 lowercase hex characters")
	}
	if !steamURLOK("https://steamcommunity.com/openid/login?openid.ns=x") || steamURLOK("http://steamcommunity.com/openid/login?x") || steamURLOK("https://steamcommunity.com.evil.net/openid/login?x") || steamURLOK("C:\\x.exe") || steamURLOK("") {
		t.Fatal("only Steam's sign-in page is opened")
	}
}

// a sign-in with Steam: the account whose data key this PC kept signs in without the password while the key is still
// the account's (the server's tag); another account, or the same one after a password reset (another tag), waits for
// the password (needKey) and nothing is kept until it opens the key
func TestSteamLoginKeepsKey(t *testing.T) {
	dir := t.TempDir()
	t.Setenv("XDG_CONFIG_HOME", dir)
	t.Setenv("HOME", dir)
	t.Setenv("APPDATA", dir)
	loadPL()
	key := strings.Repeat("ab", 32)
	plMu.Lock()
	plAcc = plAccount{Email: "driver@example.com", ID: "a1", DataKey: key, KeyTag: "k1", Ended: true}
	plMu.Unlock()
	steamPendingMu.Lock()
	steamPending = nil
	steamPendingMu.Unlock()
	if _, err := plSteamLogin([]byte(`{"id":"a1"}`)); err == nil {
		t.Fatal("an answer without a token must fail")
	}
	needKey, err := plSteamLogin([]byte(`{"id":"a2","token":"t2","display":"Bo","nameKind":"nick","keyTag":"k1"}`))
	if err != nil || !needKey {
		t.Fatal("another account needs the password", err, needKey)
	}
	if needKey, err = plSteamLogin([]byte(`{"id":"a1","token":"t3","display":"Ana","nameKind":"nick","keyTag":"k2"}`)); err != nil || !needKey {
		t.Fatal("the same account with another key (a password reset) needs the password", err, needKey)
	}
	plMu.Lock()
	a := plAcc
	plMu.Unlock()
	if a.Token != "" || a.ID != "a1" || a.DataKey != key || !a.Ended {
		t.Fatalf("nothing changes until the key opens: %+v", a)
	}
	if steamKnownEmail("a2") != "" || steamKnownEmail("a1") != "driver@example.com" {
		t.Fatal("the kept email is only offered to its own account")
	}
	steamPendingMu.Lock()
	sp := steamPending
	steamPendingMu.Unlock()
	if sp == nil || sp.Res.ID != "a1" || sp.Res.Token != "t3" {
		t.Fatal("the last sign-in waits for the password")
	}
	needKey, err = plSteamLogin([]byte(`{"id":"a1","token":"t1","display":"Ana","nameKind":"nick","keyTag":"k1","admin":true,"verified":true,"twoFactor":true}`))
	if err != nil || needKey {
		t.Fatal("the same account signs in with its kept key", err, needKey)
	}
	plMu.Lock()
	a = plAcc
	plMu.Unlock()
	if a.Token != "t1" || a.ID != "a1" || a.DataKey != key || a.KeyTag != "k1" || a.Email != "driver@example.com" || a.Display != "Ana" || !a.Admin || !a.Verified || !a.TwoFactor || a.Ended {
		t.Fatalf("signed in with the kept key: %+v", a)
	}
	if k, err := dataKey(); err != nil || len(k) != 32 {
		t.Fatal("the data key must open", err)
	}
	plMu.Lock()
	plAcc = plAccount{}
	plMu.Unlock()
}

// a sign-in with Steam or Discord that brings the server's copy of the data key signs in without the password when that key
// opens the account's data; one that does not open it waits for the password like before. A PC signed in uploads its key
// once (with the email) while the server keeps none
func TestSteamLoginEscrow(t *testing.T) {
	dir := t.TempDir()
	t.Setenv("XDG_CONFIG_HOME", dir)
	t.Setenv("HOME", dir)
	t.Setenv("APPDATA", dir)
	good, bad := bytes.Repeat([]byte{7}, 32), bytes.Repeat([]byte{9}, 32)
	blob, _ := sealAES(good, gz([]byte(`{}`)))
	var sent map[string]string
	down := false
	oldWait := keyCheckWait
	keyCheckWait = 0
	defer func() { keyCheckWait = oldWait }()
	srv := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		switch r.URL.Path {
		case "/account/sync":
			if down {
				w.WriteHeader(503)
				return
			}
			json.NewEncoder(w).Encode(map[string]any{"version": 3, "blob": blob})
		case "/account/escrow":
			b, _ := io.ReadAll(r.Body)
			json.Unmarshal(b, &sent)
			w.Write([]byte(`{"ok":true,"escrow":true}`))
		default:
			w.WriteHeader(404)
		}
	}))
	defer srv.Close()
	commMu.Lock()
	old := commCfg
	commCfg = commConfig{URL: srv.URL}
	commMu.Unlock()
	defer func() { commMu.Lock(); commCfg = old; commMu.Unlock() }()
	loadPL()
	plMu.Lock()
	plAcc = plAccount{}
	plMu.Unlock()
	steamPendingMu.Lock()
	steamPending = nil
	steamPendingMu.Unlock()
	ans := func(tok string, key []byte) []byte {
		b, _ := json.Marshal(map[string]any{"id": "a1", "token": tok, "display": "Ana", "nameKind": "nick", "keyTag": "k1", "escrow": true, "dataKey": hex.EncodeToString(key), "email": "Ana@Example.com"})
		return b
	}
	needKey, err := plSteamLogin(ans("t-bad", bad))
	if err != nil || !needKey {
		t.Fatal("a copy of the key that does not open the account waits for the password", err, needKey)
	}
	plMu.Lock()
	a := plAcc
	plMu.Unlock()
	if a.Token != "" || a.DataKey != "" {
		t.Fatalf("nothing is kept from a key that does not open the account: %+v", a)
	}
	if needKey, err = plSteamLogin(ans("t-good", good)); err != nil || needKey {
		t.Fatal("the server's copy of the key signs in without the password", err, needKey)
	}
	steamPendingMu.Lock()
	sp := steamPending
	steamPendingMu.Unlock()
	plMu.Lock()
	a = plAcc
	plMu.Unlock()
	if sp != nil || a.Token != "t-good" || a.DataKey != hex.EncodeToString(good) || a.Email != "ana@example.com" || !a.Escrow || a.Display != "Ana" {
		t.Fatalf("signed in with the server's key and email, nothing left waiting: %+v %v", a, sp)
	}
	plEscrowUp()
	if sent != nil {
		t.Fatal("the server keeps the key already: nothing goes up")
	}
	plMu.Lock()
	plAcc.Escrow = false
	plMu.Unlock()
	plEscrowUp()
	if sent["key"] != hex.EncodeToString(good) || sent["email"] != "ana@example.com" {
		t.Fatalf("the key and the email go up once: %v", sent)
	}
	plMu.Lock()
	up := plAcc.Escrow
	plAcc = plAccount{}
	plMu.Unlock()
	if !up {
		t.Fatal("the PC knows the server keeps it now")
	}
	// a key the PC could not check (the server's copy of the account cannot be read) is not taken: the password, and the
	// server's email fills its window
	down = true
	if needKey, err = plSteamLogin(ans("t-down", good)); err != nil || !needKey {
		t.Fatal("a key that could not be checked waits for the password", err, needKey)
	}
	if e := steamAskEmail(); e != "ana@example.com" {
		t.Fatal("the password window has the server's email:", e)
	}
	plMu.Lock()
	a = plAcc
	plMu.Unlock()
	if a.Token != "" || a.DataKey != "" {
		t.Fatalf("nothing is kept from a key that could not be checked: %+v", a)
	}
	down = false
	steamPendingMu.Lock()
	steamPending = nil
	steamPendingMu.Unlock()
	// a PC that kept the account's key (same tag) while the server's copy is another one: its own key goes up again
	plMu.Lock()
	plAcc = plAccount{Email: "ana@example.com", ID: "a1", Token: "t-old", DataKey: hex.EncodeToString(good), KeyTag: "k1", Escrow: true}
	plMu.Unlock()
	if needKey, err = plSteamLogin(ans("t-kept", bad)); err != nil || needKey {
		t.Fatal("the key this PC kept signs in", err, needKey)
	}
	plMu.Lock()
	a = plAcc
	plMu.Unlock()
	if a.Token != "t-kept" || a.DataKey != hex.EncodeToString(good) || a.Escrow {
		t.Fatalf("the PC keeps its own key and sends it over the wrong copy: %+v", a)
	}
	sent = nil
	plEscrowUp()
	if sent["key"] != hex.EncodeToString(good) {
		t.Fatalf("the PC's key goes up over the wrong copy: %v", sent)
	}
	// the same copy as the PC's: nothing to send
	plMu.Lock()
	plAcc = plAccount{Email: "ana@example.com", ID: "a1", Token: "t-old", DataKey: hex.EncodeToString(good), KeyTag: "k1"}
	plMu.Unlock()
	plSteamLogin(ans("t-same", good))
	plMu.Lock()
	a = plAcc
	plAcc = plAccount{}
	plMu.Unlock()
	if !a.Escrow {
		t.Fatal("the server's copy is the PC's key")
	}
	// the escrow without an email never fills in the email of an account signed out on this PC before
	plMu.Lock()
	plAcc = plAccount{Email: "old@example.com"}
	plMu.Unlock()
	b, _ := json.Marshal(map[string]any{"id": "a2", "token": "t-new", "keyTag": "k2", "escrow": true, "dataKey": hex.EncodeToString(good)})
	if needKey, err = plSteamLogin(b); err != nil || needKey {
		t.Fatal("signed in with the server's key", err, needKey)
	}
	plMu.Lock()
	a = plAcc
	plAcc = plAccount{}
	plMu.Unlock()
	if a.Email != "" || a.ID != "a2" {
		t.Fatalf("no email of another account: %+v", a)
	}
}

// the page's actions name their outside sign-in, and the browser only opens Discord's own sign-in page
func TestOAuthAction(t *testing.T) {
	for a, want := range map[string][2]string{"steamLoginPoll": {"steam", "LoginPoll"}, "discordLoginStart": {"discord", "LoginStart"}, "discord": {"discord", ""}, "discordStart": {"discord", "Start"}, "steamUnlink": {"steam", "Unlink"}} {
		pv, op, ok := oauthAction(a)
		if !ok || pv.Name != want[0] || op != want[1] {
			t.Fatalf("%s: %s %s %v", a, pv.Name, op, ok)
		}
	}
	if _, _, ok := oauthAction("login"); ok {
		t.Fatal("login is no outside sign-in")
	}
	if discordProv.LinkUse != "/discord/link/grant" || discordProv.Login != "/login/discord" || steamProv.LinkUse != "/steam/link" {
		t.Fatal("the server's routes")
	}
	if !discordURLOK("https://discord.com/oauth2/authorize?client_id=1") || discordURLOK("http://discord.com/oauth2/authorize?x") || discordURLOK("https://discord.com.evil.net/oauth2/authorize?x") || discordURLOK("https://steamcommunity.com/openid/login?x") || discordURLOK("") {
		t.Fatal("only Discord's sign-in page is opened")
	}
	if !localOpen("/discord/done") || !localOpen("/steam/done") || localOpen("/discord/donex") {
		t.Fatal("the browser's way back reaches the agent without a ticket")
	}
}

// what the browser's way back says: a sign-in grant, a new driver (with the name to offer), a Discord linked only by the
// bot, or nothing
func TestOAuthAnswer(t *testing.T) {
	g := strings.Repeat("ab", 24)
	q := func(s string) url.Values { v, _ := url.ParseQuery(s); return v }
	if r := oauthAnswer(discordProv, q("discordLogin="+g)); r.Grant != g || r.Sid != "" {
		t.Fatalf("a sign-in grant: %+v", r)
	}
	if r := oauthAnswer(discordProv, q("steamLogin="+g)); r.Grant != "" {
		t.Fatal("Steam's grant is not Discord's")
	}
	if r := oauthAnswer(discordProv, q("discordLogin=0&new=1&sid="+g+"&name=Ana%3Cb%3E")); r.Grant != "" || r.Sid != g || r.Name == "" || strings.ContainsAny(r.Name, "<>") {
		t.Fatalf("a new driver: %+v", r)
	}
	if r := oauthAnswer(steamProv, q("steamLogin=0&new=1&sid="+g+"&persona=Bo")); r.Sid != g || r.Name != "Bo" {
		t.Fatalf("a new Steam driver: %+v", r)
	}
	if r := oauthAnswer(discordProv, q("discordLogin=0&relink=1")); !r.Relink || r.Sid != "" || r.Grant != "" {
		t.Fatalf("linked by the bot only: %+v", r)
	}
	if r := oauthAnswer(discordProv, q("discordLogin=0&new=1&sid=xyz")); r != (oauthRes{}) {
		t.Fatalf("a bad sign-up grant is nothing: %+v", r)
	}
	if r := oauthAnswer(discordProv, q("discordLogin=1")); r != (oauthRes{}) {
		t.Fatalf("nothing: %+v", r)
	}
}

// the browser comes back to the agent: only the state this PC is waiting for, once, and only for its own provider; the
// sign-up grant's code is given only for its own grant
func TestOAuthDone(t *testing.T) {
	state, g := strings.Repeat("0f", 24), strings.Repeat("ab", 24)
	steamPendingMu.Lock()
	discordWait = &steamWaitT{State: state, Code: strings.Repeat("cd", 24), At: time.Now()}
	steamWait = nil
	steamPendingMu.Unlock()
	defer func() {
		steamPendingMu.Lock()
		discordWait, steamWait = nil, nil
		discordNew = struct{ Sid, Code string }{}
		steamPendingMu.Unlock()
	}()
	get := func(h http.HandlerFunc, u string) *httptest.ResponseRecorder {
		w := httptest.NewRecorder()
		h(w, httptest.NewRequest("GET", u, nil))
		return w
	}
	if w := get(oauthDone(steamProv), "/steam/done?state="+state+"&steamLogin="+g); w.Code != 400 {
		t.Fatal("Steam's way back never answers Discord's sign-in", w.Code)
	}
	if w := get(oauthDone(discordProv), "/discord/done?state="+strings.Repeat("1f", 24)+"&discordLogin="+g); w.Code != 400 {
		t.Fatal("another state is refused", w.Code)
	}
	w := get(oauthDone(discordProv), "/discord/done?state="+state+"&discordLogin="+g)
	if w.Code != http.StatusFound || !strings.HasSuffix(w.Header().Get("Location"), "/?discordLogin=pc") {
		t.Fatal("the browser goes on to the web app", w.Code, w.Header().Get("Location"))
	}
	steamPendingMu.Lock()
	sw := discordWait
	steamPendingMu.Unlock()
	if sw == nil || !sw.Done || oauthAnswer(discordProv, sw.Ans).Grant != g {
		t.Fatal("the answer waits for the page")
	}
	if w := get(oauthDone(discordProv), "/discord/done?state="+state+"&discordLogin="+g); w.Code != 400 {
		t.Fatal("the way back is used once", w.Code)
	}
	steamPendingMu.Lock()
	discordNew = struct{ Sid, Code string }{g, "c1"}
	steamPendingMu.Unlock()
	if discordProv.newCode(g) != "c1" || discordProv.newCode(strings.Repeat("ef", 24)) != "" || discordProv.newCode("") != "" || steamProv.newCode(g) != "" {
		t.Fatal("the sign-up code goes only with its own grant")
	}
}
