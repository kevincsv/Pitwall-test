package main

// Discord: posts your race results (and, when you ask, your next races) to a
// channel through a webhook. The webhook link is a password for that channel,
// so it is stored encrypted like your sign-ins.

import (
	"bytes"
	"encoding/json"
	"errors"
	"fmt"
	"io"
	"net/http"
	"path/filepath"
	"regexp"
	"strings"
	"sync"
	"time"
)

type discordConfig struct {
	Webhook  string `json:"webhook"`
	Results  bool   `json:"results"`  // post each race report automatically
	IRating  bool   `json:"irating"`  // include the iRating estimate
	Name     string `json:"name"`     // name shown in Discord
	Lang     string `json:"lang"`     // "es" or "en" for the messages
	LastPost int64  `json:"lastPost"` // unix ms
}

var (
	discordMu   sync.Mutex
	discordCfg  discordConfig
	webhookRe   = regexp.MustCompile(`^https://(discord\.com|discordapp\.com|ptb\.discord\.com|canary\.discord\.com)/api/webhooks/\d+/[A-Za-z0-9_\-]+$`)
	discordHTTP = &http.Client{Transport: tlsTransport(), Timeout: 15 * time.Second}
)

func discordPath() string { return filepath.Join(activeDir(), "discord.json") }

func loadDiscord() {
	c := discordConfig{Results: true, IRating: true}
	if b, err := readSecret(discordPath()); err == nil {
		json.Unmarshal(b, &c)
	}
	discordMu.Lock()
	discordCfg = c
	discordMu.Unlock()
}

func saveDiscordLocked() {
	b, _ := json.Marshal(discordCfg)
	writeSecret(discordPath(), b)
}

func discordSend(content string) error {
	discordMu.Lock()
	c := discordCfg
	discordMu.Unlock()
	if c.Webhook == "" {
		return errors.New("add your Discord webhook first")
	}
	name := c.Name
	if name == "" {
		name = "TrackIQ"
	}
	if len(content) > 1900 {
		content = content[:1900] + "…"
	}
	body, _ := json.Marshal(map[string]any{"username": name, "content": content, "allowed_mentions": map[string]any{"parse": []string{}}})
	resp, err := discordHTTP.Post(c.Webhook, "application/json", bytes.NewReader(body))
	if err != nil {
		return fmt.Errorf("could not reach Discord: %w", err)
	}
	defer resp.Body.Close()
	io.Copy(io.Discard, io.LimitReader(resp.Body, 1<<16))
	if resp.StatusCode == 401 || resp.StatusCode == 404 {
		return errors.New("Discord does not accept this webhook (was it deleted?)")
	}
	if resp.StatusCode >= 300 {
		return fmt.Errorf("Discord answered HTTP %d", resp.StatusCode)
	}
	discordMu.Lock()
	discordCfg.LastPost = time.Now().UnixMilli()
	saveDiscordLocked()
	discordMu.Unlock()
	return nil
}

func lapText(t float64) string {
	if t <= 0 {
		return "–"
	}
	m := int(t / 60)
	return fmt.Sprintf("%d:%06.3f", m, t-float64(m*60))
}

func raceText(r *raceReport, withIR bool, lang string) string {
	es := lang == "es"
	T := func(en, sp string) string {
		if es {
			return sp
		}
		return en
	}
	var b strings.Builder
	place := fmt.Sprintf("P%d", r.Finish)
	if r.DNF {
		place = T("DNF", "Abandono")
	}
	fmt.Fprintf(&b, "🏁 **%s** %s %d", place, T("of", "de"), r.Field)
	if r.Start > 0 && !r.DNF {
		switch d := r.Start - r.Finish; {
		case d > 0:
			fmt.Fprintf(&b, T(" (started P%d, +%d)", " (salía P%d, +%d)"), r.Start, d)
		case d < 0:
			fmt.Fprintf(&b, T(" (started P%d, %d)", " (salía P%d, %d)"), r.Start, d)
		default:
			fmt.Fprintf(&b, T(" (started P%d)", " (salía P%d)"), r.Start)
		}
	}
	fmt.Fprintf(&b, "\n🚗 %s · 📍 %s\n⏱ %s %s", r.Car, r.Track, T("Best", "Mejor vuelta"), lapText(r.Best))
	if r.FieldBest > 0 && r.Best > 0 {
		fmt.Fprintf(&b, T(" (fastest %s)", " (la más rápida %s)"), lapText(r.FieldBest))
	}
	fmt.Fprintf(&b, " · ⚠ %dx", r.Inc)
	if r.SOF > 0 {
		fmt.Fprintf(&b, " · SOF %d", r.SOF)
	}
	if withIR && r.IR > 0 {
		fmt.Fprintf(&b, T(" · iR %+d (est.)", " · iR %+d (estimado)"), r.IRChange)
	}
	return b.String()
}

func discordPostRace(r *raceReport) error {
	discordMu.Lock()
	withIR, lang := discordCfg.IRating, discordCfg.Lang
	discordMu.Unlock()
	if err := discordSend(raceText(r, withIR, lang)); err != nil {
		return err
	}
	journalMu.Lock()
	r.Posted = true
	writeJSONFile(journalFile("races.json"), races)
	journalMu.Unlock()
	return nil
}

func discordRace(r *raceReport) {
	discordMu.Lock()
	on := discordCfg.Results && discordCfg.Webhook != ""
	discordMu.Unlock()
	if on && len(r.Laps) > 0 {
		discordPostRace(r)
	}
}

func registerDiscordRoutes(mux *http.ServeMux) {
	mux.HandleFunc("/api/discord", func(w http.ResponseWriter, r *http.Request) {
		fail := func(err error) {
			w.WriteHeader(400)
			writeJSON(w, map[string]string{"error": err.Error()})
		}
		if r.Method == http.MethodPost {
			var in struct {
				Action, Webhook, Name, Content, Lang string
				Results, IRating                     bool
			}
			json.NewDecoder(io.LimitReader(r.Body, 1<<15)).Decode(&in)
			switch in.Action {
			case "save":
				in.Webhook = strings.TrimSpace(in.Webhook)
				if in.Webhook != "" && in.Webhook != "keep" && !webhookRe.MatchString(in.Webhook) {
					fail(errors.New("this is not a Discord webhook link (Channel settings → Integrations → Webhooks → Copy Webhook URL)"))
					return
				}
				discordMu.Lock()
				if in.Webhook != "keep" {
					discordCfg.Webhook = in.Webhook
				}
				discordCfg.Results, discordCfg.IRating, discordCfg.Name = in.Results, in.IRating, cleanText(in.Name, 40)
				if in.Lang == "es" || in.Lang == "en" {
					discordCfg.Lang = in.Lang
				}
				saveDiscordLocked()
				discordMu.Unlock()
			case "test":
				msg := "✅ TrackIQ is connected to this channel."
				if in.Lang == "es" {
					msg = "✅ TrackIQ está conectado a este canal."
				}
				if err := discordSend(msg); err != nil {
					fail(err)
					return
				}
			case "post":
				if strings.TrimSpace(in.Content) == "" {
					fail(errors.New("nothing to post"))
					return
				}
				if err := discordSend(cleanText(in.Content, 1900)); err != nil {
					fail(err)
					return
				}
			default:
				fail(errors.New("unknown action"))
				return
			}
		}
		discordMu.Lock()
		c := discordCfg
		discordMu.Unlock()
		// the webhook itself never goes back to the page
		writeJSON(w, map[string]any{"connected": c.Webhook != "", "results": c.Results, "irating": c.IRating, "name": c.Name, "lastPost": c.LastPost})
	})
}
