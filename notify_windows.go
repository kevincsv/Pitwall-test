//go:build windows

package main

import (
	"os"
	"os/exec"
	"path/filepath"
	"strings"
)

// notify shows a Windows notification (bottom right, and in the action
// centre), so a new version is seen even when the window is closed.
func notify(title, body string) {
	// the installer's Start menu shortcut carries this id; without it
	// (ZIP version) the notification comes from PowerShell
	app := "{1AC14E77-02E7-4E5D-B744-2EB1AE5198B7}\\WindowsPowerShell\\v1.0\\powershell.exe"
	for _, dir := range []string{os.Getenv("APPDATA"), os.Getenv("ProgramData")} {
		if m, _ := filepath.Glob(filepath.Join(dir, "Microsoft", "Windows", "Start Menu", "Programs", "*", "Pitlane HQ.lnk")); dir != "" && len(m) > 0 {
			app = "PitlaneHQ.App"
		}
	}
	x := func(s string) string {
		s = strings.NewReplacer("&", "&amp;", "<", "&lt;", ">", "&gt;", `"`, "&quot;").Replace(s)
		return strings.ReplaceAll(s, "'", "''")
	}
	ps := `[Windows.UI.Notifications.ToastNotificationManager, Windows.UI.Notifications, ContentType = WindowsRuntime] > $null;` +
		`[Windows.Data.Xml.Dom.XmlDocument, Windows.Data.Xml.Dom.XmlDocument, ContentType = WindowsRuntime] > $null;` +
		`$x = New-Object Windows.Data.Xml.Dom.XmlDocument;` +
		`$x.LoadXml('<toast><visual><binding template="ToastGeneric"><text>` + x(title) + `</text><text>` + x(body) + `</text></binding></visual></toast>');` +
		`[Windows.UI.Notifications.ToastNotificationManager]::CreateToastNotifier('` + app + `').Show([Windows.UI.Notifications.ToastNotification]::new($x))`
	cmd := exec.Command("powershell.exe", "-NoProfile", "-NonInteractive", "-WindowStyle", "Hidden", "-Command", ps)
	hideChildWindow(cmd)
	cmd.Start()
	go cmd.Wait()
}
