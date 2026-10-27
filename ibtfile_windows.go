package main

import (
	"time"
	"unsafe"

	"golang.org/x/sys/windows"
)

// cloudOnly: a OneDrive file that is only in the cloud (reading it would download it): skipped by the import
func cloudOnly(path string) bool {
	p, err := windows.UTF16PtrFromString(path)
	if err != nil {
		return false
	}
	a, err := windows.GetFileAttributes(p)
	if err != nil {
		return false
	}
	const recallOnDataAccess, offline = 0x400000, 0x1000
	return a&(recallOnDataAccess|offline) != 0
}

var (
	ibtProcLastInput = windows.NewLazySystemDLL("user32.dll").NewProc("GetLastInputInfo")
	ibtProcTickCount = windows.NewLazySystemDLL("kernel32.dll").NewProc("GetTickCount")
)

// systemIdle: how long since the last keyboard or mouse input in this Windows session (GetLastInputInfo). When it
// cannot tell, the PC counts as in use (the import waits rather than run while somebody plays).
func systemIdle() time.Duration {
	if ibtProcLastInput.Find() != nil || ibtProcTickCount.Find() != nil {
		return 0
	}
	var lii struct {
		cbSize uint32
		dwTime uint32
	}
	lii.cbSize = uint32(unsafe.Sizeof(lii))
	if r, _, _ := ibtProcLastInput.Call(uintptr(unsafe.Pointer(&lii))); r == 0 {
		return 0
	}
	now, _, _ := ibtProcTickCount.Call()
	return time.Duration(uint32(now)-lii.dwTime) * time.Millisecond // both wrap at 49.7 days: the difference does not
}
