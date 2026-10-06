package main

// Parser for the iRacing SDK shared-memory layout (irsdk_defines.h).
// The same parser reads the real memory map on Windows and the synthetic
// block produced by the demo source, so both paths are exercised the same way.

import (
	"encoding/binary"
	"errors"
	"math"
	"strings"
	"unicode/utf8"
)

const (
	irsdkStatusConnected = 1
	irsdkMaxBufs         = 4
	headerSize           = 112
	varHeaderSize        = 144
)

// Var types as defined by irsdk_VarType.
const (
	TypeChar     = 0
	TypeBool     = 1
	TypeInt      = 2
	TypeBitField = 3
	TypeFloat    = 4
	TypeDouble   = 5
)

var typeSize = map[int32]int{TypeChar: 1, TypeBool: 1, TypeInt: 4, TypeBitField: 4, TypeFloat: 4, TypeDouble: 8}
var typeName = map[int32]string{TypeChar: "char", TypeBool: "bool", TypeInt: "int", TypeBitField: "bitfield", TypeFloat: "float", TypeDouble: "double"}

type Header struct {
	Ver               int32
	Status            int32
	TickRate          int32
	SessionInfoUpdate int32
	SessionInfoLen    int32
	SessionInfoOffset int32
	NumVars           int32
	VarHeaderOffset   int32
	NumBuf            int32
	BufLen            int32
	Bufs              [irsdkMaxBufs]struct{ TickCount, BufOffset int32 }
}

type VarHeader struct {
	Name        string `json:"name"`
	Desc        string `json:"desc"`
	Unit        string `json:"unit"`
	Type        string `json:"type"`
	Count       int    `json:"count"`
	CountAsTime bool   `json:"countAsTime,omitempty"`
	typ         int32
	offset      int
}

func le32(b []byte, o int) int32 { return int32(binary.LittleEndian.Uint32(b[o:])) }

func cstr(b []byte) string {
	if i := indexByte(b, 0); i >= 0 {
		b = b[:i]
	}
	return latin1(b)
}

func indexByte(b []byte, c byte) int {
	for i, x := range b {
		if x == c {
			return i
		}
	}
	return -1
}

// iRacing writes ISO-8859-1 text (older builds) or UTF-8 (newer ones): keep valid UTF-8 as it
// is, so "Autódromo" does not turn into "AutÃ³dromo", and convert the rest to UTF-8.
func latin1(b []byte) string {
	if utf8.Valid(b) {
		return string(b)
	}
	var sb strings.Builder
	sb.Grow(len(b))
	for _, c := range b {
		sb.WriteRune(rune(c))
	}
	return sb.String()
}

func readHeader(mem []byte) (Header, error) {
	var h Header
	if len(mem) < headerSize {
		return h, errors.New("memory too small")
	}
	h.Ver = le32(mem, 0)
	h.Status = le32(mem, 4)
	h.TickRate = le32(mem, 8)
	h.SessionInfoUpdate = le32(mem, 12)
	h.SessionInfoLen = le32(mem, 16)
	h.SessionInfoOffset = le32(mem, 20)
	h.NumVars = le32(mem, 24)
	h.VarHeaderOffset = le32(mem, 28)
	h.NumBuf = le32(mem, 32)
	h.BufLen = le32(mem, 36)
	for i := 0; i < irsdkMaxBufs; i++ {
		o := 48 + i*16
		h.Bufs[i].TickCount = le32(mem, o)
		h.Bufs[i].BufOffset = le32(mem, o+4)
	}
	if h.NumBuf < 1 || h.NumBuf > irsdkMaxBufs {
		return h, errors.New("bad buffer count")
	}
	return h, nil
}

func readVarHeaders(mem []byte, h Header) ([]VarHeader, error) {
	out := make([]VarHeader, 0, h.NumVars)
	for i := 0; i < int(h.NumVars); i++ {
		o := int(h.VarHeaderOffset) + i*varHeaderSize
		if o+varHeaderSize > len(mem) {
			return nil, errors.New("var header out of range")
		}
		v := VarHeader{
			typ:         le32(mem, o),
			offset:      int(le32(mem, o+4)),
			Count:       int(le32(mem, o+8)),
			CountAsTime: mem[o+12] != 0,
			Name:        cstr(mem[o+16 : o+48]),
			Desc:        cstr(mem[o+48 : o+112]),
			Unit:        cstr(mem[o+112 : o+144]),
		}
		v.Type = typeName[v.typ]
		if v.Count < 1 {
			v.Count = 1
		}
		out = append(out, v)
	}
	return out, nil
}

func readSessionInfo(mem []byte, h Header) string {
	a, n := int(h.SessionInfoOffset), int(h.SessionInfoLen)
	if a <= 0 || n <= 0 || a+n > len(mem) {
		return ""
	}
	return cstr(mem[a : a+n])
}

// latestBuffer copies the newest telemetry buffer, retrying if the sim
// overwrote it while we were copying.
func latestBuffer(mem []byte, dst []byte) (tick int32, buf []byte, ok bool) {
	for attempt := 0; attempt < 3; attempt++ {
		h, err := readHeader(mem)
		if err != nil {
			return 0, nil, false
		}
		best := 0
		for i := 1; i < int(h.NumBuf); i++ {
			if h.Bufs[i].TickCount > h.Bufs[best].TickCount {
				best = i
			}
		}
		off, n := int(h.Bufs[best].BufOffset), int(h.BufLen)
		if off <= 0 || n <= 0 || off+n > len(mem) {
			return 0, nil, false
		}
		if cap(dst) < n {
			dst = make([]byte, n)
		}
		dst = dst[:n]
		copy(dst, mem[off:off+n])
		// confirm the buffer was not rewritten during the copy
		if le32(mem, 48+best*16) == h.Bufs[best].TickCount {
			return h.Bufs[best].TickCount, dst, true
		}
	}
	return 0, nil, false
}

// decodeValues returns one JSON-ready value per var: a scalar, or a slice for arrays.
func decodeValues(vars []VarHeader, buf []byte, want []int) []any {
	out := make([]any, len(want))
	for k, idx := range want {
		v := vars[idx]
		sz := typeSize[v.typ]
		if v.offset+sz*v.Count > len(buf) {
			continue
		}
		if v.typ == TypeChar {
			out[k] = cstr(buf[v.offset : v.offset+v.Count])
			continue
		}
		if v.Count == 1 {
			out[k] = decodeOne(v.typ, buf, v.offset)
			continue
		}
		arr := make([]any, v.Count)
		for i := 0; i < v.Count; i++ {
			arr[i] = decodeOne(v.typ, buf, v.offset+i*sz)
		}
		out[k] = arr
	}
	return out
}

func decodeOne(t int32, b []byte, o int) any {
	switch t {
	case TypeBool:
		return b[o] != 0
	case TypeInt, TypeBitField:
		return le32(b, o)
	case TypeFloat:
		return jsonFloat(float64(math.Float32frombits(binary.LittleEndian.Uint32(b[o:]))), 5)
	case TypeDouble:
		return jsonFloat(math.Float64frombits(binary.LittleEndian.Uint64(b[o:])), 6)
	}
	return nil
}

// Round floats to keep the stream small and turn NaN/Inf into null.
func jsonFloat(f float64, digits int) any {
	if math.IsNaN(f) || math.IsInf(f, 0) {
		return nil
	}
	p := math.Pow(10, float64(digits))
	return math.Round(f*p) / p
}
