package main

// Reading the live stream's frames in an overlay window without encoding/json: the frames streamFrame writes are a
// fixed shape ({"k":tick,"v":[values]}, numbers, true, false, null and arrays of them, no spaces), read 60 times a
// second by every overlay. Anything else (a text among the values, a space) goes to encoding/json as before, so the
// values read are always the ones encoding/json would give.

import (
	"encoding/json"
	"strconv"
)

// splitFrame: the values of a frame, each the exact text of its element (what json.RawMessage holds), sharing one
// copy of the frame; false when the frame is not of the plain shape
func splitFrame(data string) ([]json.RawMessage, bool) {
	const head = `{"k":`
	if len(data) < len(head)+len(`0,"v":[]}`) || data[:len(head)] != head || data[len(data)-2:] != "]}" {
		return nil, false
	}
	i := len(head)
	if i < len(data) && data[i] == '-' {
		i++
	}
	d0 := i
	for i < len(data) && data[i] >= '0' && data[i] <= '9' {
		i++
	}
	if i == d0 || (data[d0] == '0' && i-d0 > 1) || data[i:min(len(data), i+6)] != `,"v":[` {
		return nil, false
	}
	i += 6
	body := []byte(data[i : len(data)-2]) // the values, without the brackets around them
	if len(body) == 0 {
		return []json.RawMessage{}, true
	}
	n, depth := 1, 0 // the values, counted first so the list is made once
	for _, c := range body {
		switch c {
		case '[':
			depth++
		case ']':
			depth--
		case ',':
			if depth == 0 {
				n++
			}
		}
	}
	out := make([]json.RawMessage, 0, n)
	for p := 0; p <= len(body); {
		e := p
		if e < len(body) && body[e] == '[' { // an array of plain values: up to its closing bracket
			e++
			for q := e; ; e++ {
				if e == len(body) {
					return nil, false
				}
				if body[e] == ',' || body[e] == ']' {
					if (q < e || body[e] == ',' || body[e-1] != '[') && !plainScalar(body[q:e]) {
						return nil, false
					}
					q = e + 1
					if body[e] == ']' {
						break
					}
				}
			}
			e++
		} else {
			for e < len(body) && body[e] != ',' {
				e++
			}
			if !plainScalar(body[p:e]) {
				return nil, false
			}
		}
		out = append(out, json.RawMessage(body[p:e:e]))
		if e == len(body) {
			break
		}
		if body[e] != ',' || e+1 == len(body) {
			return nil, false
		}
		p = e + 1
	}
	return out, true
}

// plainScalar: a JSON number, true, false or null
func plainScalar(b []byte) bool {
	switch string(b) {
	case "true", "false", "null":
		return true
	}
	return jsonNumber(b)
}

// jsonScalar reads a plain JSON number, true, false or null as ovState.num reads it through encoding/json (a number
// or true/false give their value, null nothing); known false for anything else, left to encoding/json
func jsonScalar(raw []byte) (f float64, ok, known bool) {
	switch string(raw) {
	case "true":
		return 1, true, true
	case "false":
		return 0, true, true
	case "null":
		return 0, false, true
	}
	if !jsonNumber(raw) {
		return 0, false, false
	}
	if v, ok := plainDecimal(raw); ok {
		return v, true, true
	}
	v, err := strconv.ParseFloat(string(raw), 64)
	if err != nil { // out of range: encoding/json refuses it, and so does num
		return 0, false, false
	}
	return v, true, true
}

// jsonNumbers reads a plain array of numbers, true, false and null as ovState.arr reads it (true 1, false and null 0);
// known false for anything else
func jsonNumbers(raw []byte) ([]float64, bool) {
	if len(raw) < 2 || raw[0] != '[' || raw[len(raw)-1] != ']' {
		return nil, false
	}
	body := raw[1 : len(raw)-1]
	if len(body) == 0 {
		return []float64{}, true
	}
	n := 1
	for _, c := range body {
		if c == ',' {
			n++
		}
	}
	out := make([]float64, 0, n)
	for p := 0; p <= len(body); {
		e := p
		for e < len(body) && body[e] != ',' {
			e++
		}
		f, _, known := jsonScalar(body[p:e])
		if !known {
			return nil, false
		}
		out = append(out, f)
		if e == len(body) {
			break
		}
		p = e + 1
	}
	return out, true
}

// exact10: the powers of ten a float64 holds exactly
var exact10 = [23]float64{1e0, 1e1, 1e2, 1e3, 1e4, 1e5, 1e6, 1e7, 1e8, 1e9, 1e10, 1e11, 1e12, 1e13, 1e14, 1e15, 1e16, 1e17, 1e18, 1e19, 1e20, 1e21, 1e22}

// plainDecimal: a number without an exponent whose digits make an integer below 2^53 (what the stream writes): n / 10^d
// of two exact float64s is correctly rounded, so it is the float64 strconv.ParseFloat gives, found without it
func plainDecimal(b []byte) (float64, bool) {
	neg := len(b) > 0 && b[0] == '-'
	i := 0
	if neg {
		i = 1
	}
	var n uint64
	d, dot := 0, false
	for ; i < len(b); i++ {
		c := b[i]
		switch {
		case c == '.':
			dot = true
		case c >= '0' && c <= '9':
			n = n*10 + uint64(c-'0')
			if n >= 1<<53 {
				return 0, false
			}
			if dot {
				d++
			}
		default:
			return 0, false // an exponent
		}
	}
	if d >= len(exact10) {
		return 0, false
	}
	v := float64(n) / exact10[d]
	if neg {
		v = -v
	}
	return v, true
}

// jsonNumber: the text is a number by JSON's grammar: -?(0|[1-9][0-9]*)(\.[0-9]+)?([eE][+-]?[0-9]+)?
func jsonNumber(b []byte) bool {
	i := 0
	if i < len(b) && b[i] == '-' {
		i++
	}
	digits := func() int {
		s := i
		for i < len(b) && b[i] >= '0' && b[i] <= '9' {
			i++
		}
		return i - s
	}
	if i < len(b) && b[i] == '0' {
		i++
	} else if digits() == 0 {
		return false
	}
	if i < len(b) && b[i] == '.' {
		i++
		if digits() == 0 {
			return false
		}
	}
	if i < len(b) && (b[i] == 'e' || b[i] == 'E') {
		i++
		if i < len(b) && (b[i] == '+' || b[i] == '-') {
			i++
		}
		if digits() == 0 {
			return false
		}
	}
	return i == len(b)
}
