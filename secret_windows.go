//go:build windows

package main

import (
	"unsafe"

	"golang.org/x/sys/windows"
)

var secretEntropy = []byte("PitWall sign-in v1")

func blob(b []byte) *windows.DataBlob {
	if len(b) == 0 {
		return &windows.DataBlob{}
	}
	return &windows.DataBlob{Size: uint32(len(b)), Data: &b[0]}
}

func fromBlob(d *windows.DataBlob) []byte {
	if d.Data == nil || d.Size == 0 {
		return nil
	}
	out := make([]byte, d.Size)
	copy(out, unsafe.Slice(d.Data, d.Size))
	windows.LocalFree(windows.Handle(unsafe.Pointer(d.Data)))
	return out
}

// protect encrypts with the current Windows user's key (DPAPI).
func protect(data []byte) ([]byte, error) {
	var out windows.DataBlob
	name, _ := windows.UTF16PtrFromString("PitWall")
	if err := windows.CryptProtectData(blob(data), name, blob(secretEntropy), 0, nil, windows.CRYPTPROTECT_UI_FORBIDDEN, &out); err != nil {
		return nil, err
	}
	return fromBlob(&out), nil
}

func unprotect(data []byte) ([]byte, error) {
	var out windows.DataBlob
	if err := windows.CryptUnprotectData(blob(data), nil, blob(secretEntropy), 0, nil, windows.CRYPTPROTECT_UI_FORBIDDEN, &out); err != nil {
		return nil, err
	}
	return fromBlob(&out), nil
}
