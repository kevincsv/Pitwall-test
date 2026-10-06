package main

// irImage is a memory block laid out exactly like iRacing's shared memory
// (header, variable headers, session YAML, three rotating data buffers). Other
// sims (Le Mans Ultimate) write their data into one, so the same reader, stream,
// overlays, race reports and analysis work for every game.

import (
	"encoding/binary"
	"math"
)

type irImage struct {
	mem     []byte
	vars    map[string]*demoVar
	bufOff  [3]int
	bufLen  int
	cur     int
	tick    int32
	sessUpd int32
	sessOff int
	sessLen int
	buf     []byte
}

func newIRImage(defs []demoVar) *irImage {
	m := &irImage{vars: map[string]*demoVar{}}
	own := make([]demoVar, len(defs))
	copy(own, defs)
	off := 0
	for i := range own {
		v := &own[i]
		if v.count == 0 {
			v.count = 1
		}
		v.offset = off
		off += typeSize[v.typ] * v.count
		m.vars[v.name] = v
	}
	m.bufLen = (off + 15) &^ 15
	varHdrOff := 1024
	m.sessOff = varHdrOff + len(own)*varHeaderSize
	m.sessLen = 128 * 1024
	bufStart := (m.sessOff + m.sessLen + 4095) &^ 4095
	m.mem = make([]byte, bufStart+3*m.bufLen)
	for i := range m.bufOff {
		m.bufOff[i] = bufStart + i*m.bufLen
	}
	put := func(o int, v int32) { binary.LittleEndian.PutUint32(m.mem[o:], uint32(v)) }
	put(0, 2)
	put(8, 60)
	put(16, int32(m.sessLen))
	put(20, int32(m.sessOff))
	put(24, int32(len(own)))
	put(28, int32(varHdrOff))
	put(32, 3)
	put(36, int32(m.bufLen))
	for i := range m.bufOff {
		put(48+i*16+4, int32(m.bufOff[i]))
	}
	for i, v := range own {
		o := varHdrOff + i*varHeaderSize
		put(o, v.typ)
		put(o+4, int32(v.offset))
		put(o+8, int32(v.count))
		copy(m.mem[o+16:o+48], v.name)
		copy(m.mem[o+48:o+112], v.desc)
		copy(m.mem[o+112:o+144], v.unit)
	}
	return m
}

// setConnected sets the "sim running" bit of the header.
func (m *irImage) setConnected(on bool) {
	v := int32(0)
	if on {
		v = irsdkStatusConnected
	}
	binary.LittleEndian.PutUint32(m.mem[4:], uint32(v))
}

// begin starts writing the next data buffer (cleared); commit publishes it.
func (m *irImage) begin() {
	m.cur = (m.cur + 1) % 3
	m.buf = m.mem[m.bufOff[m.cur] : m.bufOff[m.cur]+m.bufLen]
	clear(m.buf)
}

func (m *irImage) commit() {
	m.tick++
	binary.LittleEndian.PutUint32(m.mem[48+m.cur*16:], uint32(m.tick))
}

// set writes element i of a variable, in the variable's own type.
func (m *irImage) setAt(name string, i int, val float64) {
	v := m.vars[name]
	if v == nil || i < 0 || i >= v.count || math.IsNaN(val) || math.IsInf(val, 0) {
		return
	}
	o := v.offset + typeSize[v.typ]*i
	switch v.typ {
	case TypeFloat:
		binary.LittleEndian.PutUint32(m.buf[o:], math.Float32bits(float32(val)))
	case TypeDouble:
		binary.LittleEndian.PutUint64(m.buf[o:], math.Float64bits(val))
	case TypeInt, TypeBitField:
		binary.LittleEndian.PutUint32(m.buf[o:], uint32(int32(val)))
	case TypeBool, TypeChar:
		if val != 0 {
			m.buf[o] = 1
		} else {
			m.buf[o] = 0
		}
	}
}

func (m *irImage) set(name string, val float64) { m.setAt(name, 0, val) }

func (m *irImage) setBool(name string, on bool) {
	if on {
		m.set(name, 1)
	} else {
		m.set(name, 0)
	}
}

// setSession replaces the session YAML (latin-1, like the sim) when it changes.
func (m *irImage) setSession(s string) {
	raw := make([]byte, 0, len(s))
	for _, r := range s {
		if r < 256 {
			raw = append(raw, byte(r))
		} else {
			raw = append(raw, '?')
		}
	}
	if len(raw) >= m.sessLen {
		raw = raw[:m.sessLen-1]
	}
	clear(m.mem[m.sessOff : m.sessOff+m.sessLen])
	copy(m.mem[m.sessOff:], raw)
	m.sessUpd++
	binary.LittleEndian.PutUint32(m.mem[12:], uint32(m.sessUpd))
}
