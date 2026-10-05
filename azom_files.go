package main

import (
	"encoding/base64"
	"errors"
	"io"
	"os"
	"os/exec"
	"runtime"
	"strings"
	"unicode/utf16"
)

// replaceFile copies src over dst (keeping dst.bak when backup is set). When
// the folder is protected (Program Files) Windows asks for permission once.
func replaceFile(src, dst string, backup bool) error {
	err := func() error {
		if backup && fileExists(dst) {
			if err := copyFile(dst, dst+".bak"); err != nil {
				return err
			}
		}
		return copyFile(src, dst)
	}()
	if err == nil || !errors.Is(err, os.ErrPermission) || runtime.GOOS != "windows" {
		return err
	}
	script := "$ErrorActionPreference='Stop';"
	if backup {
		script += "if(Test-Path -LiteralPath " + psq(dst) + "){Copy-Item -LiteralPath " + psq(dst) + " -Destination " + psq(dst+".bak") + " -Force};"
	}
	script += "Copy-Item -LiteralPath " + psq(src) + " -Destination " + psq(dst) + " -Force"
	return runElevated(script)
}

// removeFile renames dst to dst.bak (or deletes it), asking for permission if needed.
func removeFile(dst string, backup bool) error {
	var err error
	if backup {
		os.Remove(dst + ".bak")
		err = os.Rename(dst, dst+".bak")
	} else {
		err = os.Remove(dst)
	}
	if err == nil || errors.Is(err, os.ErrNotExist) {
		return nil
	}
	if !errors.Is(err, os.ErrPermission) || runtime.GOOS != "windows" {
		return err
	}
	if backup {
		return runElevated("$ErrorActionPreference='Stop';Move-Item -LiteralPath " + psq(dst) + " -Destination " + psq(dst+".bak") + " -Force")
	}
	return runElevated("$ErrorActionPreference='Stop';Remove-Item -LiteralPath " + psq(dst) + " -Force")
}

func copyFile(src, dst string) error {
	in, err := os.Open(src)
	if err != nil {
		return err
	}
	defer in.Close()
	out, err := os.OpenFile(dst, os.O_CREATE|os.O_WRONLY|os.O_TRUNC, 0o644)
	if err != nil {
		return err
	}
	if _, err := io.Copy(out, in); err != nil {
		out.Close()
		return err
	}
	return out.Close()
}

// psq quotes a path for PowerShell.
func psq(s string) string { return "'" + strings.ReplaceAll(s, "'", "''") + "'" }

// runElevated runs a PowerShell script as administrator (Windows shows its
// permission prompt) and waits for it.
func runElevated(script string) error {
	u := utf16.Encode([]rune(script))
	b := make([]byte, len(u)*2)
	for i, c := range u {
		b[2*i], b[2*i+1] = byte(c), byte(c>>8)
	}
	enc := base64.StdEncoding.EncodeToString(b)
	outer := "$p=Start-Process powershell.exe -Verb RunAs -Wait -PassThru -WindowStyle Hidden -ArgumentList '-NoProfile','-ExecutionPolicy','Bypass','-EncodedCommand','" + enc + "';exit $p.ExitCode"
	cmd := exec.Command("powershell.exe", "-NoProfile", "-NonInteractive", "-ExecutionPolicy", "Bypass", "-Command", outer)
	hideChildWindow(cmd)
	if err := cmd.Run(); err != nil {
		return errors.New("Windows permission was refused or the copy failed")
	}
	return nil
}
