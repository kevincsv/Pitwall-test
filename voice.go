package main

// The engineer's voice chat (admins only): a WebRTC call between the app's page on this PC (the driver) and a
// browser watching it live (the engineer: one of your devices you accepted, or anyone with your share code). The
// voice goes straight between the two (Opus, the lowest delay WebRTC gives); the agent only carries the call's
// signalling (offer, answer, network candidates, hang up) through the live room, sealed like the telemetry, and
// only while this account is an admin's.

import (
	"encoding/json"
	"io"
	"net/http"
	"regexp"
	"sync"
	"time"
)

type voiceMsg struct {
	Seq  int
	Room string // "own" (your account's room) or "share" (your share code's)
	Data json.RawMessage
}

var (
	voiceIDRe = regexp.MustCompile(`^[0-9a-zA-Z_-]{4,64}$`)
	voiceQ    = struct {
		sync.Mutex
		seq    int
		toPage []voiceMsg           // from a viewer, for the app's page
		toView []voiceMsg           // from the page, for one viewer's room
		rooms  map[string]string    // viewer id → the room it called from
		calls  map[string]string    // call → the page that answered it (one page answers, never two)
		seen   map[string]time.Time // call → last message (old calls are forgotten)
	}{rooms: map[string]string{}, calls: map[string]string{}, seen: map[string]time.Time{}}
)

// voiceOn: the voice chat is there only for an admin's account
func voiceOn() bool {
	loadPL()
	plMu.Lock()
	defer plMu.Unlock()
	return plAcc.Admin && plAcc.Token != ""
}

func voicePush(list *[]voiceMsg, room string, data json.RawMessage) {
	voiceQ.seq++
	*list = append(*list, voiceMsg{voiceQ.seq, room, data})
	if len(*list) > 200 {
		*list = (*list)[len(*list)-200:]
	}
}

type voiceHead struct {
	T    string `json:"t"`
	ID   string `json:"id"`   // the viewer
	To   string `json:"to"`   // the viewer a page message is for
	Call string `json:"call"` // one call
	Page string `json:"page"` // the page that answers
}

// voiceFromViewer: a viewer's message (offer, candidate, hang up) from the room it came in
func voiceFromViewer(room string, data json.RawMessage) {
	if len(data) > 64<<10 || !voiceOn() {
		return
	}
	var h voiceHead
	if json.Unmarshal(data, &h) != nil || !voiceIDRe.MatchString(h.ID) || !voiceIDRe.MatchString(h.Call) {
		return
	}
	if room == "own" { // your own devices: only one you accepted
		liveAsks.Lock()
		ok := liveAsks.ok[h.ID]
		liveAsks.Unlock()
		if !ok {
			return
		}
	}
	voiceQ.Lock()
	defer voiceQ.Unlock()
	voiceQ.rooms[h.ID] = room
	voiceQ.seen[h.Call] = time.Now()
	for c, t := range voiceQ.seen {
		if time.Since(t) > 6*time.Hour {
			delete(voiceQ.seen, c)
			delete(voiceQ.calls, c)
		}
	}
	voicePush(&voiceQ.toPage, room, data)
}

// voiceSince: the messages after seq, for the page (room "") or for one room's viewers
func voiceSince(room string, seq int) ([]json.RawMessage, int) {
	voiceQ.Lock()
	defer voiceQ.Unlock()
	list := voiceQ.toView
	if room == "" {
		list = voiceQ.toPage
	}
	if seq < 0 {
		return nil, voiceQ.seq
	}
	var out []json.RawMessage
	for _, m := range list {
		if m.Seq > seq && (room == "" || m.Room == room) {
			out = append(out, m.Data)
		}
	}
	return out, voiceQ.seq
}

// voiceFromPage: the page's answer, candidate or hang up for one viewer; false when another page has the call
func voiceFromPage(data json.RawMessage) (bool, string) {
	var h voiceHead
	if json.Unmarshal(data, &h) != nil || !voiceIDRe.MatchString(h.To) || !voiceIDRe.MatchString(h.Call) || !voiceIDRe.MatchString(h.Page) {
		return false, "bad message"
	}
	voiceQ.Lock()
	defer voiceQ.Unlock()
	room, ok := voiceQ.rooms[h.To]
	if !ok {
		return false, "nobody to answer"
	}
	if p, ok := voiceQ.calls[h.Call]; ok && p != h.Page {
		return false, "another window has this call"
	}
	voiceQ.calls[h.Call] = h.Page
	voiceQ.seen[h.Call] = time.Now()
	voicePush(&voiceQ.toView, room, data)
	return true, ""
}

func registerVoiceRoutes(mux *http.ServeMux) {
	// the page's side of a call (only from this PC)
	mux.HandleFunc("/api/voice", func(w http.ResponseWriter, r *http.Request) {
		if !isLoopback(r) || isRemote(r) || r.Method != http.MethodPost {
			http.Error(w, "only from this PC", 403)
			return
		}
		if !voiceOn() {
			http.Error(w, "the voice chat is for admins", 403)
			return
		}
		b, _ := io.ReadAll(io.LimitReader(r.Body, 64<<10))
		if ok, why := voiceFromPage(json.RawMessage(b)); !ok {
			w.WriteHeader(409)
			writeJSON(w, map[string]string{"error": why})
			return
		}
		writeJSON(w, map[string]bool{"ok": true})
	})
	// the servers that help the two find each other through the routers (STUN, and TURN when the server has it);
	// none in local mode, where nothing leaves the PC
	mux.HandleFunc("/api/voice/ice", func(w http.ResponseWriter, r *http.Request) {
		if !isLoopback(r) || isRemote(r) {
			http.Error(w, "only from this PC", 403)
			return
		}
		if localServer() != "" {
			writeJSON(w, map[string]any{"iceServers": []any{}})
			return
		}
		loadPL()
		plMu.Lock()
		tok := plAcc.Token
		plMu.Unlock()
		if b, err := commRequest("GET", "/voice/ice", nil, tok); err == nil {
			w.Header().Set("Content-Type", "application/json")
			w.Write(b)
			return
		}
		writeJSON(w, map[string]any{"iceServers": voiceSTUN})
	})
}

var voiceSTUN = []map[string]any{{"urls": []string{"stun:stun.cloudflare.com:3478", "stun:stun.l.google.com:19302"}}}
