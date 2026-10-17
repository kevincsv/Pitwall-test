//go:build windows

package main

import (
	"unsafe"

	"golang.org/x/sys/windows"
)

// Windows' own id of this machine (HKLM\SOFTWARE\Microsoft\Cryptography\MachineGuid)
func machineGUID() string {
	var k windows.Handle
	sub, _ := windows.UTF16PtrFromString(`SOFTWARE\Microsoft\Cryptography`)
	if windows.RegOpenKeyEx(windows.HKEY_LOCAL_MACHINE, sub, 0, windows.KEY_QUERY_VALUE|windows.KEY_WOW64_64KEY, &k) != nil {
		return ""
	}
	defer windows.RegCloseKey(k)
	name, _ := windows.UTF16PtrFromString("MachineGuid")
	buf := make([]uint16, 128)
	n := uint32(len(buf) * 2)
	var typ uint32
	if windows.RegQueryValueEx(k, name, nil, &typ, (*byte)(unsafe.Pointer(&buf[0])), &n) != nil || typ != windows.REG_SZ {
		return ""
	}
	return windows.UTF16ToString(buf[:n/2])
}
