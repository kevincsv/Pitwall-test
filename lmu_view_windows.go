//go:build windows

package main

import (
	"errors"
	"syscall"
	"unsafe"
)

type winView struct {
	hMap, view uintptr
	mem        []byte
}

func (w *winView) Bytes() []byte { return w.mem }

func (w *winView) Close() {
	if w.view != 0 {
		procUnmapViewOfFile.Call(w.view)
		w.view = 0
	}
	if w.hMap != 0 {
		syscall.CloseHandle(syscall.Handle(w.hMap))
		w.hMap = 0
	}
	w.mem = nil
}

// openLMUView maps LMU_Data, which the game publishes while it runs with
// Settings → Gameplay → Enable Plugins switched on.
func openLMUView() (lmuView, error) {
	for _, n := range []string{"LMU_Data", `Local\LMU_Data`} {
		name, _ := syscall.UTF16PtrFromString(n)
		h, _, _ := procOpenFileMappingW.Call(fileMapRead, 0, uintptr(unsafe.Pointer(name)))
		if h == 0 {
			continue
		}
		view, _, _ := procMapViewOfFile.Call(h, fileMapRead, 0, 0, lmuDataSize)
		if view == 0 {
			syscall.CloseHandle(syscall.Handle(h))
			return nil, errors.New("could not map Le Mans Ultimate memory")
		}
		return &winView{hMap: h, view: view, mem: unsafe.Slice((*byte)(unsafe.Pointer(view)), lmuDataSize)}, nil
	}
	return nil, errors.New("Le Mans Ultimate is not running (or Enable Plugins is off)")
}
