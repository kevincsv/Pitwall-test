//go:build windows

package main

// The main Pitlane HQ window: the app in its own window (WebView2, built into
// Windows 10/11), no console and no browser. Closing it quits Pitlane HQ.
// Links to other websites open in your normal browser.

import (
	"os"
	"os/exec"
	"path/filepath"
	"strings"
	"syscall"

	webview2 "github.com/jchv/go-webview2"
)

var (
	mainWV                  webview2.WebView
	mainHwnd                uintptr
	procSetForegroundWindow = user32.NewProc("SetForegroundWindow")
)

const externalLinks = `(function(){var ext=function(u){try{var x=new URL(u,location.href);return x.origin!==location.origin&&/^https?:$/.test(x.protocol)}catch(e){return false}};
document.addEventListener("click",function(e){var a=e.target&&e.target.closest&&e.target.closest("a[href]");if(a&&ext(a.href)){e.preventDefault();window.pwOpen(a.href)}},true);
var o=window.open;window.open=function(u){if(u&&ext(u)){window.pwOpen(new URL(u,location.href).href);return null}return o.apply(window,arguments)}})();`

// runMainWindow shows the app and blocks until its window is closed.
// It returns false when WebView2 is not available.
func runMainWindow(url string, minimized bool) bool {
	os.Setenv("WEBVIEW2_DEFAULT_BACKGROUND_COLOR", "FF11151B")
	data := filepath.Join(os.Getenv("LOCALAPPDATA"), "PitlaneHQ", "WebView2")
	wv := webview2.NewWithOptions(webview2.WebViewOptions{
		DataPath:      data,
		AutoFocus:     true,
		WindowOptions: webview2.WindowOptions{Title: "Pitlane HQ", Width: 1360, Height: 860, Center: true},
	})
	if wv == nil {
		return false
	}
	mainWV, mainHwnd = wv, uintptr(wv.Window())
	procShowWindow.Call(mainHwnd, 3) // SW_MAXIMIZE: use the whole screen
	if minimized {
		procShowWindow.Call(mainHwnd, 6) // SW_MINIMIZE
	}
	wv.Bind("pwOpen", func(u string) {
		if strings.HasPrefix(u, "https://") || strings.HasPrefix(u, "http://") {
			openExternal(u)
		}
	})
	wv.Init(externalLinks)
	wv.Navigate(url)
	wv.Run()
	return true
}

// showMainWindow brings the window back (used when Pitlane HQ is started a second time).
func showMainWindow() bool {
	if mainWV == nil {
		return false
	}
	mainWV.Dispatch(func() {
		procShowWindow.Call(mainHwnd, 9) // SW_RESTORE
		procSetForegroundWindow.Call(mainHwnd)
	})
	return true
}

// openExternal opens a website in the default browser.
func openExternal(u string) {
	cmd := exec.Command("rundll32", "url.dll,FileProtocolHandler", u)
	cmd.SysProcAttr = &syscall.SysProcAttr{HideWindow: true}
	cmd.Start()
}

// logToFile: without a console the log goes to %LOCALAPPDATA%\PitlaneHQ\pitlanehq.log.
func logFilePath() string {
	return filepath.Join(os.Getenv("LOCALAPPDATA"), "PitlaneHQ", "pitlanehq.log")
}
