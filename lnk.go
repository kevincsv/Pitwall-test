package main

// Minimal reader for Windows shortcut (.lnk) files: returns the program the
// shortcut points to, so TrackIQ can tell whether it is already running.

import (
	"encoding/binary"
	"os"
	"strings"
)

func lnkTarget(path string) string {
	b, err := os.ReadFile(path)
	if err != nil || len(b) < 0x4C || binary.LittleEndian.Uint32(b) != 0x4C {
		return ""
	}
	flags := binary.LittleEndian.Uint32(b[0x14:])
	off := 0x4C
	if flags&0x01 != 0 { // HasLinkTargetIDList
		if off+2 > len(b) {
			return ""
		}
		off += 2 + int(binary.LittleEndian.Uint16(b[off:]))
	}
	if flags&0x02 == 0 || off+0x1C > len(b) { // no LinkInfo
		return ""
	}
	info := b[off:]
	size := int(binary.LittleEndian.Uint32(info))
	if size > len(info) || size < 0x1C {
		return ""
	}
	info = info[:size]
	if binary.LittleEndian.Uint32(info[8:])&0x01 == 0 { // no local path
		return ""
	}
	p := int(binary.LittleEndian.Uint32(info[0x10:]))
	if p <= 0 || p >= len(info) {
		return ""
	}
	end := strings.IndexByte(string(info[p:]), 0)
	if end < 0 {
		return ""
	}
	return string(info[p : p+end])
}
