//go:build windows

package main

import (
	"errors"
	"syscall"
	"time"
	"unsafe"
)

var (
	kernel32             = syscall.NewLazyDLL("kernel32.dll")
	procOpenFileMappingW = kernel32.NewProc("OpenFileMappingW")
	procMapViewOfFile    = kernel32.NewProc("MapViewOfFile")
	procUnmapViewOfFile  = kernel32.NewProc("UnmapViewOfFile")
	procVirtualQuery     = kernel32.NewProc("VirtualQuery")
	procOpenEventW       = kernel32.NewProc("OpenEventW")
	procWaitForSingle    = kernel32.NewProc("WaitForSingleObject")
)

const (
	fileMapRead  = 0x0004
	synchronize  = 0x00100000
	memMapName   = `Local\IRSDKMemMapFileName`
	dataEvName   = `Local\IRSDKDataValidEvent`
	waitObject0  = 0
	mbiSizeAMD64 = 48
)

type simSource struct {
	hMap, hView, hEvent uintptr
	mem                 []byte
}

func newSimSource() Source { return &simSource{} }

func (s *simSource) Name() string { return "iracing" }

func (s *simSource) Open() error {
	name, _ := syscall.UTF16PtrFromString(memMapName)
	h, _, _ := procOpenFileMappingW.Call(fileMapRead, 0, uintptr(unsafe.Pointer(name)))
	if h == 0 {
		return errors.New("iRacing is not running")
	}
	view, _, _ := procMapViewOfFile.Call(h, fileMapRead, 0, 0, 0)
	if view == 0 {
		syscall.CloseHandle(syscall.Handle(h))
		return errors.New("could not map iRacing memory")
	}
	var mbi [mbiSizeAMD64]byte
	procVirtualQuery.Call(view, uintptr(unsafe.Pointer(&mbi[0])), mbiSizeAMD64)
	size := *(*uintptr)(unsafe.Pointer(&mbi[24])) // RegionSize
	if size == 0 {
		size = 1164 * 1024
	}
	ev, _ := syscall.UTF16PtrFromString(dataEvName)
	hEv, _, _ := procOpenEventW.Call(synchronize, 0, uintptr(unsafe.Pointer(ev)))
	s.hMap, s.hView, s.hEvent = h, view, hEv
	s.mem = unsafe.Slice((*byte)(unsafe.Pointer(view)), size)
	return nil
}

func (s *simSource) Mem() []byte { return s.mem }

// Wait blocks until the sim signals a new tick, or the timeout passes.
func (s *simSource) Wait(d time.Duration) {
	if s.hEvent == 0 {
		time.Sleep(d)
		return
	}
	procWaitForSingle.Call(s.hEvent, uintptr(d.Milliseconds()))
}

func (s *simSource) Close() {
	if s.hView != 0 {
		procUnmapViewOfFile.Call(s.hView)
	}
	if s.hMap != 0 {
		syscall.CloseHandle(syscall.Handle(s.hMap))
	}
	if s.hEvent != 0 {
		syscall.CloseHandle(syscall.Handle(s.hEvent))
	}
	*s = simSource{}
}
