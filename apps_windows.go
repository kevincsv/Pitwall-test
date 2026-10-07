//go:build windows

package main

import (
	"errors"
	"io/fs"
	"os"
	"os/exec"
	"path/filepath"
	"regexp"
	"runtime"
	"strings"
	"unsafe"

	"golang.org/x/sys/windows"
)

const appsSupported = true

var skipShortcut = regexp.MustCompile(`(?i)uninstall|desinstalar|readme|read me|help|manual|website|web site|documentation|license|licen[cs]e|release notes|changelog|support|repair|update notes`)

// scanStartMenu lists the programs in the Start menu (all users and yours).
func scanStartMenu() []shortcut {
	roots := []string{
		filepath.Join(os.Getenv("ProgramData"), `Microsoft\Windows\Start Menu\Programs`),
		filepath.Join(os.Getenv("APPDATA"), `Microsoft\Windows\Start Menu\Programs`),
	}
	seen := map[string]bool{}
	var out []shortcut
	for _, root := range roots {
		if root == "" {
			continue
		}
		filepath.WalkDir(root, func(p string, d fs.DirEntry, err error) error {
			if err != nil {
				return nil
			}
			if d.IsDir() {
				if strings.Count(strings.TrimPrefix(p, root), `\`) > 3 {
					return filepath.SkipDir
				}
				return nil
			}
			ext := strings.ToLower(filepath.Ext(p))
			if ext != ".lnk" && ext != ".url" {
				return nil
			}
			name := strings.TrimSuffix(d.Name(), filepath.Ext(d.Name()))
			if skipShortcut.MatchString(name) || seen[strings.ToLower(name)] || len(out) > 3000 {
				return nil
			}
			seen[strings.ToLower(name)] = true
			out = append(out, shortcut{Key: shortcutKey(p), Name: name, Path: p})
			return nil
		})
	}
	return out
}

// regString reads one text value from an open registry key.
func regString(k windows.Handle, name string) string {
	n, _ := windows.UTF16PtrFromString(name)
	var typ, size uint32
	if windows.RegQueryValueEx(k, n, nil, &typ, nil, &size) != nil || size == 0 || (typ != windows.REG_SZ && typ != windows.REG_EXPAND_SZ) {
		return ""
	}
	buf := make([]uint16, size/2+1)
	if windows.RegQueryValueEx(k, n, nil, &typ, (*byte)(unsafe.Pointer(&buf[0])), &size) != nil {
		return ""
	}
	s := windows.UTF16ToString(buf)
	if typ == windows.REG_EXPAND_SZ {
		s = expandPath(s)
	}
	return s
}

// findInstalled looks through installed programs (Apps & features) for a
// name that matches, and returns its program file.
func findInstalled(re *regexp.Regexp) string {
	type root struct {
		h    windows.Handle
		path string
		flag uint32
	}
	roots := []root{
		{windows.HKEY_LOCAL_MACHINE, `SOFTWARE\Microsoft\Windows\CurrentVersion\Uninstall`, windows.KEY_WOW64_64KEY},
		{windows.HKEY_LOCAL_MACHINE, `SOFTWARE\Microsoft\Windows\CurrentVersion\Uninstall`, windows.KEY_WOW64_32KEY},
		{windows.HKEY_CURRENT_USER, `SOFTWARE\Microsoft\Windows\CurrentVersion\Uninstall`, 0},
	}
	for _, r := range roots {
		p, _ := windows.UTF16PtrFromString(r.path)
		var k windows.Handle
		if windows.RegOpenKeyEx(r.h, p, 0, windows.KEY_READ|r.flag, &k) != nil {
			continue
		}
		for i := uint32(0); i < 4000; i++ {
			name := make([]uint16, 256)
			n := uint32(len(name))
			if windows.RegEnumKeyEx(k, i, &name[0], &n, nil, nil, nil, nil) != nil {
				break
			}
			sp, _ := windows.UTF16PtrFromString(r.path + `\` + windows.UTF16ToString(name[:n]))
			var sk windows.Handle
			if windows.RegOpenKeyEx(r.h, sp, 0, windows.KEY_READ|r.flag, &sk) != nil {
				continue
			}
			dn := regString(sk, "DisplayName")
			icon := regString(sk, "DisplayIcon")
			windows.RegCloseKey(sk)
			if dn == "" || !re.MatchString(dn) || skipShortcut.MatchString(dn) {
				continue
			}
			icon = strings.Trim(strings.Split(icon, ",")[0], `" `)
			if strings.EqualFold(filepath.Ext(icon), ".exe") && fileExists(icon) && !strings.Contains(strings.ToLower(filepath.Base(icon)), "unins") {
				windows.RegCloseKey(k)
				return icon
			}
		}
		windows.RegCloseKey(k)
	}
	return ""
}

// runningProcs returns the names (lower case) of every running program.
func runningProcs() map[string]bool {
	out := map[string]bool{}
	snap, err := windows.CreateToolhelp32Snapshot(windows.TH32CS_SNAPPROCESS, 0)
	if err != nil {
		return out
	}
	defer windows.CloseHandle(snap)
	var e windows.ProcessEntry32
	e.Size = uint32(unsafe.Sizeof(e))
	for err = windows.Process32First(snap, &e); err == nil; err = windows.Process32Next(snap, &e) {
		out[strings.ToLower(windows.UTF16ToString(e.ExeFile[:]))] = true
	}
	return out
}

// procPaths returns the full file paths of running programs with that name.
func procPaths(name string) []string {
	var out []string
	snap, err := windows.CreateToolhelp32Snapshot(windows.TH32CS_SNAPPROCESS, 0)
	if err != nil {
		return nil
	}
	defer windows.CloseHandle(snap)
	var e windows.ProcessEntry32
	e.Size = uint32(unsafe.Sizeof(e))
	for err = windows.Process32First(snap, &e); err == nil; err = windows.Process32Next(snap, &e) {
		if !strings.EqualFold(windows.UTF16ToString(e.ExeFile[:]), name) {
			continue
		}
		h, err := windows.OpenProcess(windows.PROCESS_QUERY_LIMITED_INFORMATION, false, e.ProcessID)
		if err != nil {
			out = append(out, "")
			continue
		}
		buf := make([]uint16, 1024)
		n := uint32(len(buf))
		if windows.QueryFullProcessImageName(h, 0, &buf[0], &n) == nil {
			out = append(out, windows.UTF16ToString(buf[:n]))
		} else {
			out = append(out, "")
		}
		windows.CloseHandle(h)
	}
	return out
}

// shellOpen starts a program, shortcut or link the way Explorer does
// (including the administrator prompt for programs that need it).
func shellOpen(path, args string, minimized bool) error {
	done := make(chan error, 1)
	go func() {
		runtime.LockOSThread()
		defer runtime.UnlockOSThread()
		windows.CoInitializeEx(0, windows.COINIT_APARTMENTTHREADED|windows.COINIT_DISABLE_OLE1DDE)
		defer windows.CoUninitialize()
		verb, _ := windows.UTF16PtrFromString("open")
		file, _ := windows.UTF16PtrFromString(path)
		var params, dir *uint16
		if args != "" {
			params, _ = windows.UTF16PtrFromString(args)
		}
		if strings.EqualFold(filepath.Ext(path), ".exe") {
			dir, _ = windows.UTF16PtrFromString(filepath.Dir(path))
		}
		show := int32(windows.SW_SHOWNORMAL)
		if minimized {
			show = windows.SW_SHOWMINNOACTIVE
		}
		done <- windows.ShellExecute(0, verb, file, params, dir, show)
	}()
	return <-done
}

const pickScript = `Add-Type -AssemblyName System.Windows.Forms
$f = New-Object System.Windows.Forms.Form
$f.TopMost = $true
$d = New-Object System.Windows.Forms.OpenFileDialog
$d.Title = 'Pitlane HQ - choose a program / elige un programa'
$d.Filter = 'Programs (*.exe;*.lnk;*.url;*.bat;*.cmd)|*.exe;*.lnk;*.url;*.bat;*.cmd'
$d.InitialDirectory = [Environment]::GetFolderPath('ProgramFilesX86')
if ($d.ShowDialog($f) -eq [System.Windows.Forms.DialogResult]::OK) { [Console]::OutputEncoding = [Text.Encoding]::UTF8; [Console]::Out.Write($d.FileName) }`

// pickProgram shows a file window on this PC to choose any program.
func pickProgram() (string, error) {
	cmd := exec.Command("powershell.exe", "-NoProfile", "-NonInteractive", "-STA", "-ExecutionPolicy", "Bypass", "-Command", pickScript)
	hideChildWindow(cmd)
	out, err := cmd.Output()
	if err != nil {
		return "", errors.New("could not open the file window")
	}
	p := strings.TrimSpace(string(out))
	if p == "" {
		return "", nil
	}
	switch strings.ToLower(filepath.Ext(p)) {
	case ".exe", ".lnk", ".url", ".bat", ".cmd":
	default:
		return "", errors.New("choose a program (.exe) or a shortcut")
	}
	if !fileExists(p) {
		return "", errors.New("file not found")
	}
	return p, nil
}

// killProcs closes every running program with that name, except copies that
// live under skipDir (a copy of a program inside another program's folder).
func killProcs(name, skipDir string) int {
	n := 0
	snap, err := windows.CreateToolhelp32Snapshot(windows.TH32CS_SNAPPROCESS, 0)
	if err != nil {
		return 0
	}
	defer windows.CloseHandle(snap)
	var e windows.ProcessEntry32
	e.Size = uint32(unsafe.Sizeof(e))
	for err = windows.Process32First(snap, &e); err == nil; err = windows.Process32Next(snap, &e) {
		if !strings.EqualFold(windows.UTF16ToString(e.ExeFile[:]), name) {
			continue
		}
		h, err := windows.OpenProcess(windows.PROCESS_QUERY_LIMITED_INFORMATION|windows.PROCESS_TERMINATE, false, e.ProcessID)
		if err != nil {
			continue
		}
		buf := make([]uint16, 1024)
		sz := uint32(len(buf))
		path := ""
		if windows.QueryFullProcessImageName(h, 0, &buf[0], &sz) == nil {
			path = windows.UTF16ToString(buf[:sz])
		}
		if skipDir == "" || !strings.Contains(strings.ToLower(path), strings.ToLower(skipDir)) {
			if windows.TerminateProcess(h, 0) == nil {
				n++
			}
		}
		windows.CloseHandle(h)
	}
	return n
}

// documentsDir is the user's Documents folder (also when moved to OneDrive).
func documentsDir() string {
	p, err := windows.KnownFolderPath(windows.FOLDERID_Documents, 0)
	if err != nil {
		return ""
	}
	return p
}
