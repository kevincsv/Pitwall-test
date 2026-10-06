//go:build windows

package main

import (
	"errors"
	"syscall"
	"unsafe"
)

type acMap struct {
	h, view uintptr
	mem     []byte
}

type acWin struct{ p, g, s acMap }

func (w *acWin) Physics() []byte  { return w.p.mem }
func (w *acWin) Graphics() []byte { return w.g.mem }
func (w *acWin) Static() []byte   { return w.s.mem }
func (w *acWin) Close() {
	for _, m := range []*acMap{&w.p, &w.g, &w.s} {
		if m.view != 0 {
			procUnmapViewOfFile.Call(m.view)
		}
		if m.h != 0 {
			syscall.CloseHandle(syscall.Handle(m.h))
		}
		*m = acMap{}
	}
}

func openACMap(name string) (acMap, error) {
	n, _ := syscall.UTF16PtrFromString(name)
	h, _, _ := procOpenFileMappingW.Call(fileMapRead, 0, uintptr(unsafe.Pointer(n)))
	if h == 0 {
		return acMap{}, errors.New("Assetto Corsa is not running")
	}
	view, _, _ := procMapViewOfFile.Call(h, fileMapRead, 0, 0, 0)
	if view == 0 {
		syscall.CloseHandle(syscall.Handle(h))
		return acMap{}, errors.New("could not map Assetto Corsa memory")
	}
	var mbi [mbiSizeAMD64]byte
	procVirtualQuery.Call(view, uintptr(unsafe.Pointer(&mbi[0])), mbiSizeAMD64)
	size := *(*uintptr)(unsafe.Pointer(&mbi[24]))
	if size == 0 {
		size = 4096
	}
	return acMap{h: h, view: view, mem: unsafe.Slice((*byte)(unsafe.Pointer(view)), size)}, nil
}

// openACViews maps the three pages the game keeps while it runs.
func openACViews() (acViews, error) {
	w := &acWin{}
	var err error
	if w.p, err = openACMap(`Local\acpmf_physics`); err != nil {
		return nil, err
	}
	if w.g, err = openACMap(`Local\acpmf_graphics`); err != nil {
		w.Close()
		return nil, err
	}
	if w.s, err = openACMap(`Local\acpmf_static`); err != nil {
		w.Close()
		return nil, err
	}
	return w, nil
}

// which Assetto Corsa is running: "acc", "ac" or ""
func runningAC() string {
	r := runningProcs()
	switch {
	case r["ac2-win64-shipping.exe"]:
		return "acc"
	case r["acs.exe"], r["acs_x86.exe"]:
		return "ac"
	}
	return ""
}
