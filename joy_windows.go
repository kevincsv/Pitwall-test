//go:build windows

package main

import (
	"unsafe"

	"golang.org/x/sys/windows"
)

var (
	winmm          = windows.NewLazySystemDLL("winmm.dll")
	pJoyGetNumDevs = winmm.NewProc("joyGetNumDevs")
	pJoyGetPosEx   = winmm.NewProc("joyGetPosEx")
	pJoyGetDevCaps = winmm.NewProc("joyGetDevCapsW")
	joySeen        = map[int]bool{}
)

// joyInfoEx is JOYINFOEX (13 x 4 bytes).
type joyInfoEx struct {
	size, flags, x, y, z, r, u, v, buttons, buttonNumber, pov, res1, res2 uint32
}

// joyButtons reads the first 32 buttons of every connected wheel, button box or pedals.
func joyButtons() []joyState {
	n, _, _ := pJoyGetNumDevs.Call()
	if n > 16 {
		n = 16
	}
	var out []joyState
	for i := uintptr(0); i < n; i++ {
		ji := joyInfoEx{flags: 0x80} // JOY_RETURNBUTTONS
		ji.size = uint32(unsafe.Sizeof(ji))
		if r, _, _ := pJoyGetPosEx.Call(i, uintptr(unsafe.Pointer(&ji))); r != 0 {
			continue
		}
		first := !joySeen[int(i)]
		joySeen[int(i)] = true
		out = append(out, joyState{int(i), ji.buttons, first})
	}
	return out
}

// joyNames lists the connected controllers (JOYCAPSW: name at offset 4, 32 UTF-16 chars).
func joyNames() []map[string]any {
	n, _, _ := pJoyGetNumDevs.Call()
	if n > 16 {
		n = 16
	}
	var out []map[string]any
	for i := uintptr(0); i < n; i++ {
		ji := joyInfoEx{flags: 0x80}
		ji.size = uint32(unsafe.Sizeof(ji))
		if r, _, _ := pJoyGetPosEx.Call(i, uintptr(unsafe.Pointer(&ji))); r != 0 {
			continue
		}
		var caps [728]byte
		name := ""
		if r, _, _ := pJoyGetDevCaps.Call(i, uintptr(unsafe.Pointer(&caps[0])), uintptr(len(caps))); r == 0 {
			u := make([]uint16, 32)
			for k := range u {
				u[k] = uint16(caps[4+2*k]) | uint16(caps[5+2*k])<<8
			}
			name = windows.UTF16ToString(u)
		}
		out = append(out, map[string]any{"id": int(i), "name": name})
	}
	return out
}
