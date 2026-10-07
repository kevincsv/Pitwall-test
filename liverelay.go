package main

// Live telemetry through your TrackIQ server: while you are signed in,
// TrackIQ.exe keeps a WebSocket open to your account's live room
// (cloud/src/live.js) and, only while a browser or phone of yours is watching,
// sends the same events as /api/stream. Every message is sealed with the
// account's data key (AES-256-GCM), which the server never has.

import (
	"bufio"
	"bytes"
	"compress/gzip"
	"crypto/aes"
	"crypto/cipher"
	"crypto/rand"
	"crypto/sha1"
	"crypto/tls"
	"encoding/base64"
	"encoding/binary"
	"encoding/json"
	"errors"
	"io"
	"net/http"
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
}

func liveStatus() map[string]any {
	liveState.Lock()
	defer liveState.Unlock()
	return map[string]any{"connected": liveState.on, "viewers": liveState.viewers, "error": liveState.err}
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
func liveRun(c *wsConn, key []byte) {
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
					liveState.viewers = ctl.N
					liveState.Unlock()
				}
				continue
			}
			ev, data, err := liveOpen(key, m)
			if err != nil {
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
			if ev != "want" {
				continue
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
		if _, _, _, ok := liveWanted(); !ok {
			return
		}
		mu.Lock()
		n, w := viewers, want
		mu.Unlock()
		if n == 0 {
			continue
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
		out := func(ev string, v any) bool {
			s, err := liveSeal(key, ev, v)
			if err != nil {
				return true
			}
			return c.send(s) == nil
		}
		if st := currentStatus(); st != lastStatus {
			if !out("status", st) {
				return
			}
			lastStatus = st
		}
		// DRINKS mode: sent when it changes (and the driver, who can change with iRacing's name)
		if b, err := json.Marshal(drinksState()); err == nil && (string(b) != lastDrinks || rs) {
			if !out("drinks", json.RawMessage(b)) {
				return
			}
			lastDrinks = string(b)
		}
		if evs, seq := noticesSince(noticeSeen); seq != noticeSeen {
			for _, e := range evs {
				out("notice", e)
			}
			noticeSeen = seq
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
