package main

// Subscription and licences. license_plans.json (built in, and overridable
// with a license_plans.json next to PitlaneHQ.exe) says whether licences are
// required, the plans and prices shown, and the shop. Licence keys are
// checked with Lemon Squeezy's licence API or with your own server
// ("custom") when there is internet; offline it keeps working. The key is stored
// encrypted on this PC.

import (
	_ "embed"
	"encoding/json"
	"errors"
	"fmt"
	"io"
	"net/http"
	"net/url"
	"os"
	"path/filepath"
	"strings"
	"sync"
	"time"
)

//go:embed license_plans.json
var defaultPlans []byte

type planCfg struct {
	Enforce      bool              `json:"enforce"`
	Provider     string            `json:"provider"`
	CustomURL    string            `json:"customUrl"`
	StoreURL     string            `json:"storeUrl"`
	TrialDays    int               `json:"trialDays"`
	GraceDays    int               `json:"graceDays"`
	Plans        []json.RawMessage `json:"plans"`
	VariantPlans map[string]string `json:"variantPlans"`
	ProViews     []string          `json:"proViews"`
	ProFeatures  []string          `json:"proFeatures"`
}

type licState struct {
	Key        string    `json:"key,omitempty"`
	Instance   string    `json:"instance,omitempty"`
	Plan       string    `json:"plan,omitempty"`
	Status     string    `json:"status,omitempty"` // active, expired, disabled, invalid
	Expires    time.Time `json:"expires,omitempty"`
	CheckedAt  time.Time `json:"checkedAt,omitempty"`
	TrialStart time.Time `json:"trialStart"`
	Error      string    `json:"error,omitempty"`
}

var (
	licMu   sync.Mutex
	lic     licState
	plans   planCfg
	licHTTP = &http.Client{Timeout: 20 * time.Second}
	lsAPI   = "https://api.lemonsqueezy.com/v1/licenses/"
)

func licPath() string { return filepath.Join(dataDir(), "license.json") }

func loadLicense() {
	p := planCfg{}
	json.Unmarshal(defaultPlans, &p)
	if exe, err := os.Executable(); err == nil {
		if b, err := os.ReadFile(filepath.Join(filepath.Dir(exe), "license_plans.json")); err == nil {
			json.Unmarshal(b, &p)
		}
	}
	s := licState{}
	if b, err := readSecret(licPath()); err == nil {
		json.Unmarshal(b, &s)
	}
	licMu.Lock()
	defer licMu.Unlock()
	plans = p
	if s.TrialStart.IsZero() {
		s.TrialStart = time.Now()
	}
	lic = s
	saveLicLocked()
}

func saveLicLocked() {
	b, _ := json.Marshal(lic)
	writeSecret(licPath(), b)
}

// licensed: what the app may unlock right now.
func licenseInfoLocked() map[string]any {
	trialLeft := 0
	if plans.TrialDays > 0 {
		left := lic.TrialStart.AddDate(0, 0, plans.TrialDays).Sub(time.Now())
		if left > 0 {
			trialLeft = int(left.Hours()/24) + 1
		}
	}
	// once activated it keeps working offline for as long as you like: only an answer
	// from the store (expired, cancelled, refunded…) turns it off, never a missing
	// connection or a renewal date that could not be checked
	active := lic.Status == "active"
	pro := !plans.Enforce || active || trialLeft > 0
	key := ""
	if len(lic.Key) > 8 {
		key = lic.Key[:4] + "…" + lic.Key[len(lic.Key)-4:]
	}
	m := map[string]any{"enforce": plans.Enforce, "pro": pro, "active": active, "plan": lic.Plan, "status": lic.Status, "key": key, "trialLeft": trialLeft,
		"storeUrl": plans.StoreURL, "plans": plans.Plans, "proViews": plans.ProViews, "proFeatures": plans.ProFeatures, "error": lic.Error}
	if !lic.Expires.IsZero() {
		m["expires"] = lic.Expires.UnixMilli()
	}
	if !lic.CheckedAt.IsZero() {
		m["checked"] = lic.CheckedAt.UnixMilli()
	}
	return m
}

func planFromVariant(name string) string {
	n := strings.ToLower(name)
	for k, v := range plans.VariantPlans {
		if strings.Contains(n, strings.ToLower(k)) {
			return v
		}
	}
	return "monthly"
}

// lemon squeezy: activate / validate / deactivate
func lsCall(action string, form url.Values) (map[string]any, error) {
	resp, err := licHTTP.PostForm(lsAPI+action, form)
	if err != nil {
		return nil, fmt.Errorf("could not reach the licence server: %w", err)
	}
	defer resp.Body.Close()
	var m map[string]any
	json.NewDecoder(io.LimitReader(resp.Body, 1<<16)).Decode(&m)
	if e, _ := m["error"].(string); e != "" {
		return m, errors.New(e)
	}
	if resp.StatusCode >= 400 {
		return m, fmt.Errorf("licence server answered HTTP %d", resp.StatusCode)
	}
	return m, nil
}

func customCall(action string, body map[string]string) (map[string]any, error) {
	if plans.CustomURL == "" {
		return nil, errors.New("no licence server set up")
	}
	b, _ := json.Marshal(body)
	resp, err := licHTTP.Post(strings.TrimRight(plans.CustomURL, "/")+"/"+action, "application/json", strings.NewReader(string(b)))
	if err != nil {
		return nil, fmt.Errorf("could not reach the licence server: %w", err)
	}
	defer resp.Body.Close()
	var m map[string]any
	json.NewDecoder(io.LimitReader(resp.Body, 1<<16)).Decode(&m)
	if e, _ := m["error"].(string); e != "" {
		return m, errors.New(e)
	}
	return m, nil
}

func applyLicResult(m map[string]any) {
	if lk, ok := m["license_key"].(map[string]any); ok { // lemon squeezy
		lic.Status, _ = lk["status"].(string)
		lic.Expires = time.Time{}
		if s, _ := lk["expires_at"].(string); s != "" {
			lic.Expires, _ = time.Parse(time.RFC3339, s)
		}
		if meta, ok := m["meta"].(map[string]any); ok {
			v, _ := meta["variant_name"].(string)
			lic.Plan = planFromVariant(v)
		}
		if inst, ok := m["instance"].(map[string]any); ok {
			if id, _ := inst["id"].(string); id != "" {
				lic.Instance = id
			}
		}
		if v, ok := m["valid"].(bool); ok && !v && lic.Status == "active" {
			lic.Status = "invalid"
		}
	} else { // custom: {status, plan, expires, instance}
		lic.Status, _ = m["status"].(string)
		lic.Plan, _ = m["plan"].(string)
		if s, _ := m["expires"].(string); s != "" {
			lic.Expires, _ = time.Parse(time.RFC3339, s)
		}
		if s, _ := m["instance"].(string); s != "" {
			lic.Instance = s
		}
	}
	if lic.Plan == "lifetime" {
		lic.Expires = time.Time{}
	}
	lic.CheckedAt, lic.Error = time.Now(), ""
}

func machineName() string {
	h, _ := os.Hostname()
	return "Pitlane HQ · " + h
}

func activateLicense(key string) error {
	key = strings.TrimSpace(key)
	if len(key) < 8 || len(key) > 200 {
		return errors.New("this does not look like a licence key")
	}
	licMu.Lock()
	defer licMu.Unlock()
	var m map[string]any
	var err error
	if plans.Provider == "custom" {
		m, err = customCall("activate", map[string]string{"key": key, "device": machineName()})
	} else {
		m, err = lsCall("activate", url.Values{"license_key": {key}, "instance_name": {machineName()}})
	}
	if err != nil {
		lic.Error = err.Error()
		saveLicLocked()
		return err
	}
	lic.Key = key
	applyLicResult(m)
	saveLicLocked()
	return nil
}

func validateLicense() {
	licMu.Lock()
	defer licMu.Unlock()
	if lic.Key == "" {
		return
	}
	var m map[string]any
	var err error
	if plans.Provider == "custom" {
		m, err = customCall("validate", map[string]string{"key": lic.Key, "instance": lic.Instance})
	} else {
		m, err = lsCall("validate", url.Values{"license_key": {lic.Key}, "instance_id": {lic.Instance}})
	}
	if err != nil {
		lic.Error = err.Error() // offline: keep the last state, with no time limit
		if strings.Contains(strings.ToLower(err.Error()), "not found") || strings.Contains(strings.ToLower(err.Error()), "invalid") {
			lic.Status = "invalid"
		}
		saveLicLocked()
		return
	}
	applyLicResult(m)
	saveLicLocked()
}

func deactivateLicense() {
	licMu.Lock()
	defer licMu.Unlock()
	if lic.Key != "" {
		if plans.Provider == "custom" {
			customCall("deactivate", map[string]string{"key": lic.Key, "instance": lic.Instance})
		} else {
			lsCall("deactivate", url.Values{"license_key": {lic.Key}, "instance_id": {lic.Instance}})
		}
	}
	ts := lic.TrialStart
	lic = licState{TrialStart: ts}
	saveLicLocked()
}

func licenseWatcher() {
	for {
		validateLicense()
		time.Sleep(24 * time.Hour)
	}
}

func registerLicenseRoutes(mux *http.ServeMux) {
	mux.HandleFunc("/api/license", func(w http.ResponseWriter, r *http.Request) {
		if r.Method == http.MethodPost {
			if !isLoopback(r) {
				http.Error(w, "only from this PC", 403)
				return
			}
			var in struct{ Action, Key string }
			json.NewDecoder(io.LimitReader(r.Body, 4096)).Decode(&in)
			var err error
			switch in.Action {
			case "activate":
				err = activateLicense(in.Key)
			case "check":
				validateLicense()
			case "deactivate":
				deactivateLicense()
			}
			if err != nil {
				w.WriteHeader(400)
				writeJSON(w, map[string]string{"error": err.Error()})
				return
			}
		}
		licMu.Lock()
		defer licMu.Unlock()
		writeJSON(w, licenseInfoLocked())
	})
}
