package main

import (
	"net/http"
	"sync/atomic"
)

// uiLang is the language the app window uses, for messages Pitlane HQ shows on its own
// (the overlays and the log). The page sends it when it starts and when it changes.
var uiLang, uiLangPick atomic.Value

// uiLangChoice: the language as chosen in the app (en, es or pt), for the overlay windows
// the app's units ("metric" or "imperial"), told by the app like the language, for the native overlays
var uiUnitsPick atomic.Value

// uiPrefsVer changes whenever the language or the units do, so the overlays hear of it at once
var uiPrefsVer atomic.Int64

func uiUnits() string {
	if v, ok := uiUnitsPick.Load().(string); ok && v != "" {
		return v
	}
	return "metric"
}

func uiLangChoice() string {
	if v, ok := uiLangPick.Load().(string); ok && v != "" {
		return v
	}
	return uiLanguage()
}

func uiLanguage() string {
	if v, ok := uiLang.Load().(string); ok && v != "" {
		return v
	}
	return "en"
}

func registerLangRoute(mux *http.ServeMux) {
	mux.HandleFunc("/api/lang", func(w http.ResponseWriter, r *http.Request) {
		if r.Method != http.MethodPost || !isLoopback(r) {
			http.Error(w, "forbidden", 403)
			return
		}
		switch u := r.URL.Query().Get("u"); u {
		case "metric", "imperial":
			if uiUnits() != u {
				uiUnitsPick.Store(u)
				uiPrefsVer.Add(1)
			}
		}
		switch l := r.URL.Query().Get("l"); l {
		case "en", "es", "pt", "de", "both":
			// English, Spanish and Portuguese only: German (older apps) reads English, bilingual Spanish
			if l == "de" {
				l = "en"
			} else if l == "both" {
				l = "es"
			}
			if uiLangChoice() != l {
				uiPrefsVer.Add(1)
			}
			uiLangPick.Store(l)
			uiLang.Store(l)
		}
		w.WriteHeader(204)
	})
}
