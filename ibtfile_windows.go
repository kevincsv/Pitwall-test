package main

import "golang.org/x/sys/windows"

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
