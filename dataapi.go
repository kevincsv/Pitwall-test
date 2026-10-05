package main

// iRacing Data API client (members-ng.iracing.com/data) using iRacing's
// OAuth "password_limited" grant. The password is used once to get tokens and
// is never written to disk; only the masked client secret and tokens are saved.

import (
	"crypto/sha256"
	"encoding/base64"
	"encoding/json"
	"errors"
	"fmt"
	"io"
	"log"
	"net/http"
	"net/url"
	"os"
	"path/filepath"
	"strings"
	"sync"
	"time"
)

const (
	oauthTokenURL = "https://oauth.iracing.com/oauth2/token"
	dataBaseURL   = "https://members-ng.iracing.com/data/"
)

type accountConfig struct {
	ClientID      string    `json:"clientId"`
	MaskedSecret  string    `json:"maskedSecret"`
	Username      string    `json:"username"`
	AccessToken   string    `json:"accessToken"`
	RefreshToken  string    `json:"refreshToken"`
	AccessExpiry  time.Time `json:"accessExpiry"`
	RefreshExpiry time.Time `json:"refreshExpiry"`
}

var (
	acctMu sync.Mutex
	acct   accountConfig
	httpc  = &http.Client{Timeout: 25 * time.Second}
	cache  = map[string]cacheEntry{}
)

type cacheEntry struct {
	body []byte
	at   time.Time
}

func configPath() string { return filepath.Join(activeDir(), "account.json") }

// loadConfig reads the iRacing sign-in of the active profile.
func loadConfig() {
	acctMu.Lock()
	defer acctMu.Unlock()
	acct = accountConfig{}
	cache = map[string]cacheEntry{}
	if b, err := readSecret(configPath()); err == nil {
		json.Unmarshal(b, &acct)
	}
}

// saveConfig writes the sign-in encrypted (see secret.go). Caller may hold acctMu.
func saveConfig() {
	b, _ := json.MarshalIndent(acct, "", "  ")
	if acct.ClientID == "" && acct.RefreshToken == "" && acct.AccessToken == "" {
		os.Remove(configPath())
		return
	}
	writeSecret(configPath(), b)
}

// mask implements iRacing's secret masking: base64(sha256(secret + lower(trim(id)))).
func mask(secret, id string) string {
	sum := sha256.Sum256([]byte(secret + strings.ToLower(strings.TrimSpace(id))))
	return base64.StdEncoding.EncodeToString(sum[:])
}

func accountStatus() map[string]any {
	acctMu.Lock()
	defer acctMu.Unlock()
	return map[string]any{
		"loggedIn": acct.RefreshToken != "" || (acct.AccessToken != "" && time.Now().Before(acct.AccessExpiry)),
		"username": acct.Username,
		"clientId": acct.ClientID,
	}
}

type tokenResp struct {
	AccessToken           string `json:"access_token"`
	ExpiresIn             int    `json:"expires_in"`
	RefreshToken          string `json:"refresh_token"`
	RefreshTokenExpiresIn int    `json:"refresh_token_expires_in"`
	Error                 string `json:"error"`
	ErrorDescription      string `json:"error_description"`
}

func requestToken(form url.Values) (*tokenResp, error) {
	resp, err := httpc.PostForm(oauthTokenURL, form)
	if err != nil {
		return nil, fmt.Errorf("could not reach iRacing: %w", err)
	}
	defer resp.Body.Close()
	body, _ := io.ReadAll(resp.Body)
	var tr tokenResp
	json.Unmarshal(body, &tr)
	if resp.StatusCode != 200 || tr.AccessToken == "" {
		msg := tr.ErrorDescription
		if msg == "" {
			msg = tr.Error
		}
		if msg == "" {
			msg = strings.TrimSpace(string(body))
		}
		return nil, fmt.Errorf("iRacing rejected the login (%d): %s", resp.StatusCode, msg)
	}
	return &tr, nil
}

func applyToken(tr *tokenResp) {
	acct.AccessToken = tr.AccessToken
	acct.AccessExpiry = time.Now().Add(time.Duration(tr.ExpiresIn-30) * time.Second)
	if tr.RefreshToken != "" {
		acct.RefreshToken = tr.RefreshToken
		if tr.RefreshTokenExpiresIn > 0 {
			acct.RefreshExpiry = time.Now().Add(time.Duration(tr.RefreshTokenExpiresIn) * time.Second)
		}
	}
	saveConfig()
}

func login(clientID, clientSecret, username, password string) error {
	clientID, username = strings.TrimSpace(clientID), strings.TrimSpace(username)
	if clientID == "" || clientSecret == "" || username == "" || password == "" {
		return errors.New("all four fields are required")
	}
	ms := mask(clientSecret, clientID)
	form := url.Values{
		"grant_type":    {"password_limited"},
		"client_id":     {clientID},
		"client_secret": {ms},
		"username":      {username},
		"password":      {mask(password, username)},
		"scope":         {"iracing.auth"},
	}
	tr, err := requestToken(form)
	if err != nil && strings.Contains(strings.ToLower(err.Error()), "scope") {
		form.Del("scope") // some clients are registered without scopes
		tr, err = requestToken(form)
	}
	if err != nil {
		return err
	}
	acctMu.Lock()
	defer acctMu.Unlock()
	acct = accountConfig{ClientID: clientID, MaskedSecret: ms, Username: username}
	applyToken(tr)
	return nil
}

// token returns a valid access token, refreshing it when needed.
func token() (string, error) {
	acctMu.Lock()
	defer acctMu.Unlock()
	if acct.AccessToken != "" && time.Now().Before(acct.AccessExpiry) {
		return acct.AccessToken, nil
	}
	if acct.RefreshToken == "" {
		return "", errors.New("not signed in")
	}
	tr, err := requestToken(url.Values{
		"grant_type":    {"refresh_token"},
		"client_id":     {acct.ClientID},
		"client_secret": {acct.MaskedSecret},
		"refresh_token": {acct.RefreshToken},
	})
	if err != nil {
		acct.AccessToken, acct.RefreshToken = "", ""
		saveConfig()
		return "", errors.New("your iRacing sign-in expired, sign in again")
	}
	applyToken(tr)
	return acct.AccessToken, nil
}

func fetchJSON(u, bearer string) ([]byte, int, error) {
	req, _ := http.NewRequest("GET", u, nil)
	if bearer != "" {
		req.Header.Set("Authorization", "Bearer "+bearer)
	}
	resp, err := httpc.Do(req)
	if err != nil {
		return nil, 0, err
	}
	defer resp.Body.Close()
	b, err := io.ReadAll(resp.Body)
	return b, resp.StatusCode, err
}

// dataGet calls /data/<path>, follows the signed "link" iRacing returns, and
// merges chunked result files into a "chunks" array.
func dataGet(path, rawQuery string) ([]byte, int, error) {
	key := path + "?" + rawQuery
	acctMu.Lock()
	if c, ok := cache[key]; ok && time.Since(c.at) < cacheTTL(path) {
		acctMu.Unlock()
		return c.body, 200, nil
	}
	acctMu.Unlock()
	tok, err := token()
	if err != nil {
		return nil, 401, err
	}
	u := dataBaseURL + strings.TrimPrefix(path, "/")
	if rawQuery != "" {
		u += "?" + rawQuery
	}
	b, code, err := fetchJSON(u, tok)
	if err != nil {
		return nil, 502, err
	}
	if code == 401 {
		acctMu.Lock()
		acct.AccessToken = ""
		acctMu.Unlock()
		return nil, 401, errors.New("iRacing did not accept the sign-in, sign in again")
	}
	if code != 200 {
		return b, code, nil
	}
	var linked struct {
		Link string `json:"link"`
	}
	if json.Unmarshal(b, &linked) == nil && linked.Link != "" {
		b, code, err = fetchJSON(linked.Link, "")
		if err != nil || code != 200 {
			return b, 502, fmt.Errorf("could not download data from iRacing (%d)", code)
		}
	}
	b = mergeChunks(b)
	acctMu.Lock()
	cache[key] = cacheEntry{b, time.Now()}
	acctMu.Unlock()
	return b, 200, nil
}

// Catalogue data changes rarely; race guide and member stats change often.
func cacheTTL(path string) time.Duration {
	for _, p := range []string{"track/get", "car/get", "carclass/get", "lookup/", "constants/", "series/get", "series/assets", "track/assets", "car/assets"} {
		if strings.HasPrefix(path, p) {
			return 6 * time.Hour
		}
	}
	if strings.HasPrefix(path, "series/seasons") || strings.HasPrefix(path, "series/season_list") {
		return 30 * time.Minute
	}
	return time.Minute
}

func mergeChunks(b []byte) []byte {
	var doc map[string]any
	if json.Unmarshal(b, &doc) != nil {
		return b
	}
	find := func(m map[string]any) map[string]any {
		if ci, ok := m["chunk_info"].(map[string]any); ok {
			return ci
		}
		if d, ok := m["data"].(map[string]any); ok {
			if ci, ok := d["chunk_info"].(map[string]any); ok {
				return ci
			}
		}
		return nil
	}
	ci := find(doc)
	if ci == nil {
		return b
	}
	base, _ := ci["base_download_url"].(string)
	names, _ := ci["chunk_file_names"].([]any)
	var all []any
	for _, n := range names {
		s, _ := n.(string)
		cb, code, err := fetchJSON(base+s, "")
		if err != nil || code != 200 {
			continue
		}
		var part []any
		if json.Unmarshal(cb, &part) == nil {
			all = append(all, part...)
		}
	}
	doc["chunks"] = all
	out, err := json.Marshal(doc)
	if err != nil {
		return b
	}
	return out
}

func registerAccountRoutes(mux *http.ServeMux) {
	mux.HandleFunc("/api/account", func(w http.ResponseWriter, r *http.Request) {
		writeJSON(w, accountStatus())
	})
	mux.HandleFunc("/api/account/login", func(w http.ResponseWriter, r *http.Request) {
		if r.Method != http.MethodPost {
			http.Error(w, "POST only", 405)
			return
		}
		var in struct{ ClientID, ClientSecret, Username, Password string }
		json.NewDecoder(io.LimitReader(r.Body, 1<<16)).Decode(&in)
		if err := login(in.ClientID, in.ClientSecret, in.Username, in.Password); err != nil {
			w.WriteHeader(400)
			writeJSON(w, map[string]string{"error": err.Error()})
			return
		}
		log.Println("Signed in to iRacing as", in.Username)
		writeJSON(w, accountStatus())
	})
	mux.HandleFunc("/api/account/logout", func(w http.ResponseWriter, r *http.Request) {
		if r.Method != http.MethodPost {
			http.Error(w, "POST only", 405)
			return
		}
		acctMu.Lock()
		acct = accountConfig{}
		cache = map[string]cacheEntry{}
		saveConfig()
		acctMu.Unlock()
		writeJSON(w, accountStatus())
	})
	// Any Data API endpoint: /api/iracing/member/info, /api/iracing/stats/member_recent_races, ...
	mux.HandleFunc("/api/iracing/", func(w http.ResponseWriter, r *http.Request) {
		path := strings.TrimPrefix(r.URL.Path, "/api/iracing/")
		if path == "" || strings.Contains(path, "..") {
			http.Error(w, "missing endpoint", 400)
			return
		}
		b, code, err := dataGet(path, r.URL.RawQuery)
		if err != nil {
			w.WriteHeader(code)
			writeJSON(w, map[string]string{"error": err.Error()})
			return
		}
		w.Header().Set("Content-Type", "application/json")
		w.WriteHeader(code)
		w.Write(b)
	})
}
