package main

// Live telemetry through your Pitlane HQ server: while you are signed in,
// PitlaneHQ.exe keeps a WebSocket open to your account's live room
// (cloud/src/live.js) and, only while a browser or phone of yours is watching,
// sends the same events as /api/stream. Every message is sealed with the
// account's data key (AES-256-GCM), which the server never has.

import (
	"bufio"
	"bytes"
	"compress/gzip"
	"crypto/aes"
	"crypto/cipher"
	"crypto/pbkdf2"
	"crypto/rand"
	"crypto/sha1"
	"crypto/sha256"
	"crypto/tls"
	"encoding/base64"
	"encoding/binary"
	"encoding/hex"
	"encoding/json"
	"errors"
	"io"
	"net/http"
	"sort"
	"strings"
	"sync"
	"time"
)

const liveAAD = "pitlanehq-live-v1"

// ---------- sealing ----------

func liveSeal(key []byte, ev string, data any) (string, error) {
	raw, err := json.Marshal([]any{ev, data})
	if err != nil {
		return "", err
	}
	var zb bytes.Buffer
	zw, _ := gzip.NewWriterLevel(&zb, gzip.BestSpeed)
	zw.Write(raw)
	zw.Close()
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
	return "e:" + base64.StdEncoding.EncodeToString(g.Seal(nonce, nonce, zb.Bytes(), []byte(liveAAD))), nil
}

func liveOpen(key []byte, msg string) (ev string, data json.RawMessage, err error) {
	if !strings.HasPrefix(msg, "e:") {
		return "", nil, errors.New("not sealed")
	}
	b, err := base64.StdEncoding.DecodeString(msg[2:])
	if err != nil {
		return "", nil, err
	}
	blk, err := aes.NewCipher(key)
	if err != nil {
		return "", nil, err
	}
	g, err := cipher.NewGCM(blk)
	if err != nil {
		return "", nil, err
	}
	if len(b) < g.NonceSize() {
		return "", nil, errors.New("damaged")
	}
	z, err := g.Open(nil, b[:g.NonceSize()], b[g.NonceSize():], []byte(liveAAD))
	if err != nil {
		return "", nil, err
	}
	raw, err := gunz(z)
	if err != nil {
		return "", nil, err
	}
	var m []json.RawMessage
	if err := json.Unmarshal(raw, &m); err != nil || len(m) != 2 {
		return "", nil, errors.New("damaged")
	}
	if err := json.Unmarshal(m[0], &ev); err != nil {
		return "", nil, err
	}
	return ev, m[1], nil
}

// ---------- a small WebSocket client (RFC 6455, text frames) ----------

type wsConn struct {
	rw  io.ReadWriteCloser
	br  *bufio.Reader
	wmu sync.Mutex
}

var liveHTTP = &http.Client{Transport: &http.Transport{
	Proxy:           http.ProxyFromEnvironment,
	TLSClientConfig: &tls.Config{NextProtos: []string{"http/1.1"}},
	TLSNextProto:    map[string]func(string, *tls.Conn) http.RoundTripper{}, // HTTP/1.1: the upgrade needs it
}}

func wsDial(url, token string) (*wsConn, error) {
	k := make([]byte, 16)
	rand.Read(k)
	key := base64.StdEncoding.EncodeToString(k)
	req, _ := http.NewRequest("GET", url, nil)
	req.Header.Set("Connection", "Upgrade")
	req.Header.Set("Upgrade", "websocket")
	req.Header.Set("Sec-WebSocket-Version", "13")
	req.Header.Set("Sec-WebSocket-Key", key)
	req.Header.Set("Authorization", "Bearer "+token)
	resp, err := liveHTTP.Do(req)
	if err != nil {
		return nil, err
	}
	if resp.StatusCode != http.StatusSwitchingProtocols {
		b, _ := io.ReadAll(io.LimitReader(resp.Body, 4096))
		resp.Body.Close()
		var e struct{ Error string }
		json.Unmarshal(b, &e)
		if e.Error == "" {
			e.Error = resp.Status
		}
		return nil, errors.New(e.Error)
	}
	h := sha1.Sum([]byte(key + "258EAFA5-E914-47DA-95CA-C5AB0DC85B11"))
	if resp.Header.Get("Sec-WebSocket-Accept") != base64.StdEncoding.EncodeToString(h[:]) {
		resp.Body.Close()
		return nil, errors.New("bad WebSocket answer")
	}
	rw, ok := resp.Body.(io.ReadWriteCloser)
	if !ok {
		resp.Body.Close()
		return nil, errors.New("no WebSocket")
	}
	return &wsConn{rw: rw, br: bufio.NewReader(rw)}, nil
}

func (c *wsConn) writeFrame(op byte, p []byte) error {
	c.wmu.Lock()
	defer c.wmu.Unlock()
	hdr := []byte{0x80 | op}
	switch n := len(p); {
	case n < 126:
		hdr = append(hdr, 0x80|byte(n))
	case n < 65536:
		hdr = append(hdr, 0x80|126, byte(n>>8), byte(n))
	default:
		hdr = append(hdr, 0x80|127)
		hdr = binary.BigEndian.AppendUint64(hdr, uint64(n))
	}
	mask := make([]byte, 4)
	rand.Read(mask)
	hdr = append(hdr, mask...)
	out := make([]byte, len(hdr)+len(p))
	copy(out, hdr)
	for i, b := range p {
		out[len(hdr)+i] = b ^ mask[i&3]
	}
	_, err := c.rw.Write(out)
	return err
}

func (c *wsConn) send(s string) error { return c.writeFrame(1, []byte(s)) }

// read returns the next text message; pings are answered here.
func (c *wsConn) read() (string, error) {
	var msg []byte
	for {
		var h [2]byte
		if _, err := io.ReadFull(c.br, h[:]); err != nil {
			return "", err
		}
		fin, op := h[0]&0x80 != 0, h[0]&0x0f
		n := uint64(h[1] & 0x7f)
		switch n {
		case 126:
			var e [2]byte
			if _, err := io.ReadFull(c.br, e[:]); err != nil {
				return "", err
			}
			n = uint64(binary.BigEndian.Uint16(e[:]))
		case 127:
			var e [8]byte
			if _, err := io.ReadFull(c.br, e[:]); err != nil {
				return "", err
			}
			n = binary.BigEndian.Uint64(e[:])
		}
		if n > 4<<20 {
			return "", errors.New("message too big")
		}
		var mask []byte
		if h[1]&0x80 != 0 {
			mask = make([]byte, 4)
			if _, err := io.ReadFull(c.br, mask); err != nil {
				return "", err
			}
		}
		p := make([]byte, n)
		if _, err := io.ReadFull(c.br, p); err != nil {
			return "", err
		}
		if mask != nil {
			for i := range p {
				p[i] ^= mask[i&3]
			}
		}
		switch op {
		case 8:
			c.writeFrame(8, nil)
			return "", io.EOF
		case 9:
			c.writeFrame(10, p)
			continue
		case 10:
			continue
		}
		msg = append(msg, p...)
		if fin {
			return string(msg), nil
		}
	}
}

func (c *wsConn) close() {
	c.writeFrame(8, []byte{0x03, 0xe8})
	c.rw.Close()
}

// ---------- the relay ----------

var liveState struct {
	sync.Mutex
	on      bool // connected to the live room
	viewers int
	err     string
	shareOn bool // connected to the room of the share code
	shareN  int  // people watching with the code
}

func liveStatus() map[string]any {
	liveState.Lock()
	defer liveState.Unlock()
	commMu.Lock()
	code := commCfg.ShareCode
	commMu.Unlock()
	return map[string]any{"connected": liveState.on, "viewers": liveState.viewers, "error": liveState.err, "shareCode": shareShow(code), "shareOn": liveState.shareOn, "shareViewers": liveState.shareN}
}

// ---------- sharing your live telemetry with a code ----------
// Anyone with the code watches (read only): the room on the server is one hash of the code and the key
// that seals every message another one (PBKDF2), so the server can neither read the telemetry nor
// find the code. A new code stops the old one at once.

const shareAlphabet = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789" // no 0/O, 1/I

func shareNewCode() string {
	b := make([]byte, 10)
	rand.Read(b)
	for i := range b {
		b[i] = shareAlphabet[int(b[i])%len(shareAlphabet)]
	}
	return string(b)
}

// shareShow: "ABCDEFGHJK" → "ABCD-EFGH-JK"
func shareShow(c string) string {
	if len(c) != 10 {
		return c
	}
	return c[:4] + "-" + c[4:8] + "-" + c[8:]
}

func shareRoom(code string) string {
	h := sha256.Sum256([]byte("pitlanehq-share-room|" + code))
	return hex.EncodeToString(h[:16])
}

func liveCodeKey(code string) []byte {
	k, _ := pbkdf2.Key(sha256.New, code, []byte("pitlanehq-share-key-v1"), 100000, 32)
	return k
}

// setShare starts sharing (a new code when asked or when there is none) or stops it; the code shown
func setShare(on, fresh bool) string {
	commMu.Lock()
	defer commMu.Unlock()
	switch {
	case !on:
		commCfg.ShareCode = ""
	case fresh || commCfg.ShareCode == "":
		commCfg.ShareCode = shareNewCode()
	}
	saveCommLocked()
	return shareShow(commCfg.ShareCode)
}

func liveShareRelay() {
	wait := 5 * time.Second
	for {
		token, _, base, ok := liveWanted()
		commMu.Lock()
		code := commCfg.ShareCode
		commMu.Unlock()
		if !ok || code == "" {
			time.Sleep(3 * time.Second)
			continue
		}
		c, err := wsDial(strings.TrimRight(base, "/")+"/live?role=pc&share="+shareRoom(code), token)
		if err != nil {
			time.Sleep(wait)
			if wait < 2*time.Minute {
				wait *= 2
			}
			continue
		}
		wait = 5 * time.Second
		liveState.Lock()
		liveState.shareOn, liveState.shareN = true, 0
		liveState.Unlock()
		liveRunWith(c, liveCodeKey(code), func() bool {
			commMu.Lock()
			defer commMu.Unlock()
			return commCfg.ShareCode == code
		})
		c.close()
		liveState.Lock()
		liveState.shareOn, liveState.shareN = false, 0
		liveState.Unlock()
		time.Sleep(time.Second)
	}
}

func liveWanted() (token string, key []byte, base string, ok bool) {
	plMu.Lock()
	token = plAcc.Token
	plMu.Unlock()
	commMu.Lock()
	off := commCfg.NoLive
	commMu.Unlock()
	if token == "" || off {
		return "", nil, "", false
	}
	k, err := dataKey()
	base = commBase()
	if err != nil || base == "" {
		return "", nil, "", false
	}
	return token, k, base, true
}

func liveRelay() {
	wait := 5 * time.Second
	for {
		token, key, base, ok := liveWanted()
		if !ok {
			time.Sleep(5 * time.Second)
			continue
		}
		// net/http makes the upgrade request on the https:// address itself
		c, err := wsDial(strings.TrimRight(base, "/")+"/live?role=pc", token)
		if err != nil {
			liveState.Lock()
			liveState.on, liveState.err = false, err.Error()
			liveState.Unlock()
			time.Sleep(wait)
			if wait < 2*time.Minute {
				wait *= 2
			}
			continue
		}
		wait = 5 * time.Second
		liveState.Lock()
		liveState.on, liveState.err, liveState.viewers = true, "", 0
		liveState.Unlock()
		liveRun(c, key)
		c.close()
		liveState.Lock()
		liveState.on, liveState.viewers = false, 0
		liveState.Unlock()
		time.Sleep(2 * time.Second)
	}
}

// liveRun streams until the connection drops or you sign out.
// ---------- your phone or browser asks before it watches this PC ----------
// Connect in the web or phone app sends "hello" (a device id and its name); this PC asks you in a window
// (Accept / Decline) and sends your telemetry only once you accept. An accepted device is remembered while
// Pitlane HQ runs. Apps from before 0.8.14 send no hello: their first "want" asks as "a device".

type liveAsk struct {
	ID   string `json:"id"`
	Name string `json:"name"`
	At   int64  `json:"at"`
}

type liveReply struct {
	ID string
	OK bool
}

const liveLegacy = "legacy"

var liveAsks = struct {
	sync.Mutex
	ok        map[string]bool      // accepted while this PC runs
	no        map[string]time.Time // declined (the device is told again for a while)
	pending   map[string]liveAsk   // waiting for your answer
	seen      map[string]time.Time // last hello of each device: an accepted one still watching
	replies   []liveReply          // answers the relay still has to send
	lastHello time.Time
}{ok: map[string]bool{}, no: map[string]time.Time{}, pending: map[string]liveAsk{}, seen: map[string]time.Time{}}

// liveAskHello: a device says it wants to watch (again every 20 s while it is connected). again: Connect
// was pressed by hand, so a decline from before is forgotten and the window asks once more (the hellos
// every 20 s never bring it back by themselves).
func liveAskHello(id, name string, again bool) {
	if id == "" || len(id) > 64 {
		return
	}
	if r := []rune(strings.TrimSpace(name)); len(r) > 60 {
		name = string(r[:60])
	}
	liveAsks.Lock()
	defer liveAsks.Unlock()
	now := time.Now()
	liveAsks.seen[id] = now
	if id != liveLegacy {
		liveAsks.lastHello = now
	}
	if liveAsks.ok[id] {
		liveAsks.replies = append(liveAsks.replies, liveReply{id, true})
		return
	}
	if t, ok := liveAsks.no[id]; ok && again && now.Sub(t) > 3*time.Second {
		delete(liveAsks.no, id)
	}
	if t, ok := liveAsks.no[id]; ok && now.Sub(t) < 2*time.Minute {
		liveAsks.replies = append(liveAsks.replies, liveReply{id, false})
		return
	}
	if a, ok := liveAsks.pending[id]; ok && now.UnixMilli()-a.At < 120000 {
		return // already asked: one window
	}
	a := liveAsk{id, strings.TrimSpace(name), now.UnixMilli()}
	liveAsks.pending[id] = a
	journalMu.Lock()
	pushNoticeLocked("liveask", a)
	journalMu.Unlock()
}

// liveAskLegacy: a "want" from an app that never says hello (no hello from anyone for a while).
func liveAskLegacy() bool {
	liveAsks.Lock()
	defer liveAsks.Unlock()
	return time.Since(liveAsks.lastHello) > 30*time.Second
}

// liveAnswer: your answer in the window on this PC.
func liveAnswer(id string, ok bool) bool {
	liveAsks.Lock()
	defer liveAsks.Unlock()
	if _, p := liveAsks.pending[id]; !p {
		return false
	}
	delete(liveAsks.pending, id)
	if ok {
		liveAsks.ok[id] = true
		delete(liveAsks.no, id)
	} else {
		liveAsks.no[id] = time.Now()
	}
	liveAsks.replies = append(liveAsks.replies, liveReply{id, ok})
	return true
}

func liveAskTake() []liveReply {
	liveAsks.Lock()
	defer liveAsks.Unlock()
	r := liveAsks.replies
	liveAsks.replies = nil
	return r
}

// liveAccepted: someone you accepted is watching (n: the viewers in the room).
func liveAccepted(n int) bool {
	if n == 0 {
		return false
	}
	liveAsks.Lock()
	defer liveAsks.Unlock()
	for id := range liveAsks.ok {
		if id == liveLegacy || time.Since(liveAsks.seen[id]) < 50*time.Second {
			return true
		}
	}
	return false
}

// liveAskList: the devices waiting for your answer, oldest first.
func liveAskList() []liveAsk {
	liveAsks.Lock()
	defer liveAsks.Unlock()
	out := []liveAsk{}
	now := time.Now().UnixMilli()
	for id, a := range liveAsks.pending {
		if now-a.At > 120000 {
			delete(liveAsks.pending, id)
			continue
		}
		out = append(out, a)
	}
	sort.Slice(out, func(i, j int) bool { return out[i].At < out[j].At })
	return out
}

func liveRun(c *wsConn, key []byte) { liveRunWith(c, key, nil) }

// liveRunWith: share is the check of a share code's room (nil: your account's room). Viewers with a code
// only watch: no DRINKS mode, no race summaries, no sharing control.
func liveRunWith(c *wsConn, key []byte, share func() bool) {
	shareReply := make(chan string, 4)
	type wantMsg struct {
		Vars []string `json:"vars"`
		All  bool     `json:"all"`
	}
	var mu sync.Mutex
	var want wantMsg
	viewers, reset := 0, true
	done := make(chan struct{})
	go func() {
		defer close(done)
		for {
			m, err := c.read()
			if err != nil {
				return
			}
			if strings.HasPrefix(m, "{") {
				var ctl struct {
					Ctl string `json:"ctl"`
					N   int    `json:"n"`
				}
				if json.Unmarshal([]byte(m), &ctl) == nil && ctl.Ctl == "viewers" {
					mu.Lock()
					if ctl.N > viewers {
						reset = true // someone new: send everything again
					}
					viewers = ctl.N
					mu.Unlock()
					liveState.Lock()
					if share != nil {
						liveState.shareN = ctl.N
					} else {
						liveState.viewers = ctl.N
					}
					liveState.Unlock()
				}
				continue
			}
			ev, data, err := liveOpen(key, m)
			if err != nil {
				continue
			}
			if share != nil && ev != "want" { // with a code you only watch
				continue
			}
			if ev == "share" { // your phone or browser starts, renews or stops the share code
				var d struct {
					On  bool `json:"on"`
					New bool `json:"new"`
				}
				if json.Unmarshal(data, &d) == nil {
					select {
					case shareReply <- setShare(d.On, d.New):
					default:
					}
				}
				continue
			}
			if ev == "drinks" { // DRINKS mode from your phone (admins only)
				var d struct {
					On        bool   `json:"on"`
					Guest     string `json:"guest"`
					GuestAuto bool   `json:"guestAuto"`
				}
				if json.Unmarshal(data, &d) == nil {
					setDrinks(d.On, d.Guest, d.GuestAuto)
				}
				continue
			}
			if ev == "hello" { // Connect in the web or phone app: this PC asks you first
				var d struct {
					ID    string `json:"id"`
					Name  string `json:"name"`
					Again bool   `json:"again"`
				}
				if json.Unmarshal(data, &d) == nil {
					liveAskHello(d.ID, d.Name, d.Again)
				}
				continue
			}
			if ev != "want" {
				continue
			}
			if share == nil && liveAskLegacy() {
				liveAskHello(liveLegacy, "", false)
			}
			var w wantMsg
			if json.Unmarshal(data, &w) == nil {
				mu.Lock()
				want, reset = w, true
				mu.Unlock()
			}
		}
	}()

	tk := time.NewTicker(100 * time.Millisecond)
	defer tk.Stop()
	ping := time.NewTicker(30 * time.Second)
	defer ping.Stop()
	schemaVer, sessionVer := -1, -1
	var lastTick int32 = -1
	var lastStatus statusMsg
	lastDrinks := ""
	var idx []int
	_, noticeSeen := noticesSince(-1)
	for {
		select {
		case <-done:
			return
		case <-ping.C:
			if c.send("ping") != nil {
				return
			}
			continue
		case <-tk.C:
		}
		if _, _, _, ok := liveWanted(); !ok || (share != nil && !share()) {
			return
		}
		select {
		case code := <-shareReply:
			if s, err := liveSeal(key, "share", map[string]any{"code": code}); err == nil && c.send(s) != nil {
				return
			}
		default:
		}
		mu.Lock()
		n, w := viewers, want
		mu.Unlock()
		if n == 0 {
			continue
		}
		out := func(ev string, v any) bool {
			s, err := liveSeal(key, ev, v)
			if err != nil {
				return true
			}
			return c.send(s) == nil
		}
		// your devices: the answers to their hello, and nothing more until you accept one
		if share == nil {
			for _, r := range liveAskTake() {
				ev := "no"
				if r.OK {
					ev = "ok"
					mu.Lock()
					reset = true // the device just accepted gets everything
					mu.Unlock()
				}
				if !out(ev, map[string]any{"id": r.ID}) {
					return
				}
			}
			if !liveAccepted(n) {
				continue
			}
		}
		// a request to send everything again is only taken once someone is watching, so it
		// is never lost while nobody was counted yet
		mu.Lock()
		rs := reset
		reset = false
		mu.Unlock()
		if rs {
			schemaVer, sessionVer, lastTick = -1, -1, -1
			lastStatus = statusMsg{Source: "\x00"}
		}
		if st := currentStatus(); st != lastStatus {
			if !out("status", st) {
				return
			}
			lastStatus = st
		}
		// DRINKS mode: sent when it changes (and the driver, who can change with iRacing's name); never to a share code
		if b, err := json.Marshal(drinksState()); share == nil && err == nil && (string(b) != lastDrinks || rs) {
			if !out("drinks", json.RawMessage(b)) {
				return
			}
			lastDrinks = string(b)
		}
		if evs, seq := noticesSince(noticeSeen); seq != noticeSeen {
			for _, e := range evs {
				if share == nil && e.Kind != "liveask" {
					out("notice", e)
				}
			}
			noticeSeen = seq
		}
		// your share code, so the phone shows it (and knows whether you share)
		if rs && share == nil {
			commMu.Lock()
			sc := commCfg.ShareCode
			commMu.Unlock()
			out("share", map[string]any{"code": shareShow(sc)})
		}
		tel.mu.RLock()
		if tel.schemaVer != schemaVer || rs {
			schemaVer = tel.schemaVer
			idx = idx[:0]
			names := []string{}
			var vars []VarHeader
			if w.All {
				for i, v := range tel.vars {
					idx = append(idx, i)
					names = append(names, v.Name)
				}
				vars = tel.vars
			} else {
				for _, nm := range w.Vars {
					if i, ok := tel.index[nm]; ok {
						idx = append(idx, i)
						names = append(names, nm)
						vars = append(vars, tel.vars[i])
					}
				}
			}
			tel.mu.RUnlock()
			if !out("schema", vars) || !out("fields", names) {
				return
			}
			tel.mu.RLock()
		}
		if tel.sessionVer != sessionVer {
			sessionVer = tel.sessionVer
			s := tel.session
			tel.mu.RUnlock()
			if !out("session", s) {
				return
			}
			tel.mu.RLock()
		}
		var frame []any
		tick := tel.tick
		if tel.connected && tick != lastTick && len(tel.buf) > 0 && len(idx) > 0 {
			frame = decodeValues(tel.vars, tel.buf, idx)
		}
		tel.mu.RUnlock()
		if frame != nil {
			lastTick = tick
			if !out("t", map[string]any{"k": tick, "v": frame}) {
				return
			}
		}
	}
}
