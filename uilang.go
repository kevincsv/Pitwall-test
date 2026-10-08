package main

import (
	"net/http"
	"sync/atomic"
)

// uiLang is the language the app window uses, for messages Pitlane HQ shows on its own
// (Windows notifications). The page sends it when it starts and when it changes.
var uiLang, uiLangPick atomic.Value

// uiLangChoice: the language exactly as chosen in the app (en, es, de, pt or both), for the overlay windows
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
		switch l := r.URL.Query().Get("l"); l {
		case "en", "es", "de", "pt", "both":
			uiLangPick.Store(l)
			if l == "both" {
				l = "es"
			}
			uiLang.Store(l)
		}
		w.WriteHeader(204)
	})
}
