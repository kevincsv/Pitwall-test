package main

// Local mode (the owner's own PC, development): the whole of Pitlane HQ on one PC without internet. The Pitlane HQ
// server itself (cloud/) runs on the PC with `wrangler dev --local` (tools/local.cmd starts it, the database and
// everything else stay in cloud/.wrangler), and PitlaneHQ.exe takes it as its server instead of pitlanehq.app:
// `PitlaneHQ.exe -server http://127.0.0.1:8787` or the PITLANEHQ_SERVER environment variable (which the native
// window hands to its engine). Updates are off (the local server has no downloads), the app's fonts come from the
// program itself (never from Google Fonts), and the server's ten-minute job (the models) is called from here,
// because a local server has no clock of its own.

import (
	"fmt"
	"net/http"
	"net/url"
	"os"
	"strings"
	"sync"
	"time"
)

var (
	localServerMu  sync.Mutex
	localServerURL string
)

// setLocalServer takes the address of the server on this PC (the -server flag or PITLANEHQ_SERVER).
func setLocalServer(flagURL string) {
	u := strings.TrimSpace(flagURL)
	if u == "" {
		u = strings.TrimSpace(os.Getenv("PITLANEHQ_SERVER"))
	}
	if u == "" {
		return
	}
	p, err := url.Parse(u)
	if err != nil || (p.Scheme != "http" && p.Scheme != "https") || p.Host == "" {
		fmt.Fprintln(os.Stderr, "-server: not an http(s) address:", u)
		return
	}
	localServerMu.Lock()
	localServerURL = strings.TrimRight(u, "/")
	localServerMu.Unlock()
	// the engine of the native window inherits it, and so do the overlay windows
	os.Setenv("PITLANEHQ_SERVER", localServerURL)
}

// localServer is the address of the server on this PC, or "" (the normal server).
func localServer() string {
	localServerMu.Lock()
	defer localServerMu.Unlock()
	return localServerURL
}

// localScheduler calls the server's ten-minute job (wrangler dev --test-scheduled answers /__scheduled): the models of
// the cars and tracks with new laps are built again, as the real server does by itself.
func localScheduler() {
	base := localServer()
	if base == "" {
		return
	}
	c := &http.Client{Timeout: 5 * time.Minute}
	for {
		time.Sleep(10 * time.Minute)
		resp, err := c.Get(base + "/__scheduled?cron=*/10+*+*+*+*")
		if err == nil {
			resp.Body.Close()
		}
	}
}

// localFontsCSS: the app's own fonts (ovfonts/, embedded) for the app's page, so it looks the same without internet.
// The page lists this before Google Fonts: with internet Google's files win, without them these stay.
const localFontsCSS = `/* Pitlane HQ: the app's own fonts (OFL), from the program */
@font-face{font-family:"IBM Plex Sans";font-style:normal;font-weight:100 500;src:url(fonts/IBMPlexSans-Medium.ttf) format("truetype")}
@font-face{font-family:"IBM Plex Sans";font-style:normal;font-weight:600 900;src:url(fonts/IBMPlexSans-SemiBold.ttf) format("truetype")}
@font-face{font-family:"JetBrains Mono";font-style:normal;font-weight:100 600;src:url(fonts/JetBrainsMono-SemiBold.ttf) format("truetype")}
@font-face{font-family:"JetBrains Mono";font-style:normal;font-weight:700 900;src:url(fonts/JetBrainsMono-Bold.ttf) format("truetype")}
@font-face{font-family:"Barlow Condensed";font-style:normal;font-weight:100 600;src:url(fonts/BarlowCondensed-SemiBold.ttf) format("truetype")}
@font-face{font-family:"Barlow Condensed";font-style:normal;font-weight:700 900;src:url(fonts/BarlowCondensed-Bold.ttf) format("truetype")}
`

func registerLocalRoutes(mux *http.ServeMux) {
	fonts := map[string][]byte{
		"IBMPlexSans-Medium.ttf":       fontBody,
		"IBMPlexSans-SemiBold.ttf":     fontBodyB,
		"JetBrainsMono-SemiBold.ttf":   fontData,
		"JetBrainsMono-Bold.ttf":       fontDataB,
		"BarlowCondensed-SemiBold.ttf": fontDisplay,
		"BarlowCondensed-Bold.ttf":     fontDisplayB,
	}
	mux.HandleFunc("/fonts.css", func(w http.ResponseWriter, r *http.Request) {
		w.Header().Set("Content-Type", "text/css; charset=utf-8")
		w.Header().Set("Cache-Control", "public, max-age=86400")
		w.Write([]byte(localFontsCSS))
	})
	mux.HandleFunc("/fonts/", func(w http.ResponseWriter, r *http.Request) {
		b, ok := fonts[strings.TrimPrefix(r.URL.Path, "/fonts/")]
		if !ok {
			http.NotFound(w, r)
			return
		}
		w.Header().Set("Content-Type", "font/ttf")
		w.Header().Set("Cache-Control", "public, max-age=86400")
		w.Write(b)
	})
	// the app reads the server's address from server.json: on this PC, the server on this PC
	mux.HandleFunc("/server.json", func(w http.ResponseWriter, r *http.Request) {
		w.Header().Set("Content-Type", "application/json")
		w.Header().Set("Cache-Control", "no-cache")
		if u := localServer(); u != "" {
			fmt.Fprintf(w, "{\"url\":%q}\n", u)
			return
		}
		fmt.Fprintf(w, "{\"url\":%q}\n", bundledServer())
	})
}
