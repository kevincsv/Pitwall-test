//go:build windows

package main

// The overlays in VR: with Settings → VR on, every overlay window also shows in the headset as a SteamVR overlay
// (OpenVR, openvr_api.dll embedded here and written next to the app's files), with the same picture it draws on the
// screen, placed where it is on the main screen (vrmath.go). It never starts SteamVR: it joins it when it is running
// (a background app) and lets go when it quits. Meta headsets work through SteamVR (SteamVR as the OpenXR runtime).

import (
	_ "embed"
	"log"
	"math"
	"os"
	"path/filepath"
	"syscall"
	"time"
	"unsafe"
)

//go:embed vr/openvr_api.dll
var openvrDLL []byte

// the IVROverlay_027 and IVRSystem_022 function tables of openvr_capi.h (OpenVR 2.5.1): each call's place
const (
	ovrCreate        = 1
	ovrDestroy       = 2
	ovrSetAlpha      = 15
	ovrSetSortOrder  = 19
	ovrSetWidth      = 21
	ovrSetTransAbs   = 32
	ovrShow          = 41
	ovrHide          = 42
	ovrSetRaw        = 60
	sysPollNextEvent = 29
	sysAckQuit       = 43
	vrEventQuit      = 700
	vrAppBackground  = 3 // never starts SteamVR
	vrAppOverlay     = 2
	vrSeated         = 0
)

var vr struct {
	dll                                  *syscall.LazyDLL
	init, getIface, shutdown, hmdPresent *syscall.LazyProc
	ok                                   bool
	ovl, sys                             uintptr // the function tables
	handle                               uint64
	retryAt, sentAt                      time.Time
	asOverlay                            bool // SteamVR refused a background app's overlay: joined as an overlay app
	buf                                  []byte
	lastW                                float32
	lastM                                [12]float32
	lastAlpha                            int
}

// vrDLL writes the embedded openvr_api.dll to the app's folder (once) and loads it from there
func vrDLL() bool {
	if vr.dll != nil {
		return true
	}
	dir := filepath.Join(os.Getenv("LOCALAPPDATA"), "PitlaneHQ", "openvr")
	p := filepath.Join(dir, "openvr_api.dll")
	if fi, err := os.Stat(p); err != nil || fi.Size() != int64(len(openvrDLL)) {
		if os.MkdirAll(dir, 0o755) != nil {
			return false
		}
		tmp := p + ".tmp" + itoa(os.Getpid())
		if os.WriteFile(tmp, openvrDLL, 0o644) != nil {
			return false
		}
		if os.Rename(tmp, p) != nil { // another overlay wrote it at the same moment
			os.Remove(tmp)
		}
	}
	d := syscall.NewLazyDLL(p)
	if d.Load() != nil {
		return false
	}
	vr.dll = d
	vr.init, vr.getIface, vr.shutdown, vr.hmdPresent = d.NewProc("VR_InitInternal2"), d.NewProc("VR_GetGenericInterface"), d.NewProc("VR_ShutdownInternal"), d.NewProc("VR_IsHmdPresent")
	return true
}

func vrFn(table uintptr, i int) uintptr {
	return *(*uintptr)(unsafe.Pointer(table + uintptr(i)*unsafe.Sizeof(uintptr(0))))
}

// vrCall calls a function of a table; the result is its error (0 = none). Like syscall's Proc.Call, the pointers
// given as uintptr stay alive until it returns.
//
//go:uintptrescapes
func vrCall(table uintptr, i int, args ...uintptr) int32 {
	r, _, _ := syscall.SyscallN(vrFn(table, i), args...)
	return int32(r)
}

func vrStr(s string) *byte { b := append([]byte(s), 0); return &b[0] }

func f32(v float32) uintptr { return uintptr(math.Float32bits(v)) }

// vrStart joins SteamVR when it is running and makes this overlay's panel
func vrStart(name string, appType uintptr) bool {
	if !vrDLL() {
		return false
	}
	if r, _, _ := vr.hmdPresent.Call(); r&0xff == 0 {
		return false
	}
	var e int32
	vr.init.Call(uintptr(unsafe.Pointer(&e)), appType, 0)
	if e != 0 {
		return false
	}
	ovl, _, _ := vr.getIface.Call(uintptr(unsafe.Pointer(vrStr("FnTable:IVROverlay_027"))), uintptr(unsafe.Pointer(&e)))
	sys, _, _ := vr.getIface.Call(uintptr(unsafe.Pointer(vrStr("FnTable:IVRSystem_022"))), uintptr(unsafe.Pointer(&e)))
	if ovl == 0 || sys == 0 {
		vr.shutdown.Call()
		return false
	}
	var h uint64
	if err := vrCall(ovl, ovrCreate, uintptr(unsafe.Pointer(vrStr("pitlanehq."+name))), uintptr(unsafe.Pointer(vrStr("Pitlane HQ · "+name))), uintptr(unsafe.Pointer(&h))); err != 0 {
		log.Printf("vr %s: the overlay was refused (%d)", name, err)
		vr.shutdown.Call()
		return false
	}
	vr.ovl, vr.sys, vr.handle, vr.ok = ovl, sys, h, true
	vr.lastW, vr.lastM, vr.lastAlpha = 0, [12]float32{}, -1
	vrCall(ovl, ovrSetSortOrder, uintptr(h), 10)
	vrCall(ovl, ovrShow, uintptr(h))
	log.Printf("vr %s: in the headset", name)
	return true
}

// vrStop lets go of SteamVR (its panel goes with it)
func vrStop() {
	if !vr.ok {
		return
	}
	vrCall(vr.ovl, ovrHide, uintptr(vr.handle))
	vrCall(vr.ovl, ovrDestroy, uintptr(vr.handle))
	vr.shutdown.Call()
	vr.ok = false
}

// vrFrame: after each frame on the screen, the same picture in the headset (up to 30 a second, the radar 60)
func vrFrame(name string, px []uint32, x, y, w, h, alpha int, ui map[string]any) {
	c := vrCfgFrom(ui)
	now := time.Now()
	if !c.On {
		vrStop()
		return
	}
	if !vr.ok {
		if now.Before(vr.retryAt) {
			return
		}
		vr.retryAt = now.Add(5 * time.Second)
		app := uintptr(vrAppBackground)
		if vr.asOverlay {
			app = vrAppOverlay
		}
		if !vrStart(name, app) {
			if !vr.asOverlay && vr.dll != nil {
				if r, _, _ := vr.hmdPresent.Call(); r&0xff != 0 && vrStart(name, vrAppOverlay) { // a SteamVR that takes overlays only from overlay apps
					vr.asOverlay = true
				}
			}
			if !vr.ok {
				return
			}
		}
	}
	// SteamVR is closing: let go at once, and wait a moment before looking for it again
	var ev [64]byte
	for i := 0; i < 16; i++ {
		r, _, _ := syscall.SyscallN(vrFn(vr.sys, sysPollNextEvent), uintptr(unsafe.Pointer(&ev[0])), 64)
		if r&0xff == 0 {
			break
		}
		if *(*uint32)(unsafe.Pointer(&ev[0])) == vrEventQuit {
			syscall.SyscallN(vrFn(vr.sys, sysAckQuit))
			vrStop()
			vr.retryAt = now.Add(15 * time.Second)
			return
		}
	}
	gap := 33 * time.Millisecond
	if name == "radar" {
		gap = 16 * time.Millisecond
	}
	if now.Sub(vr.sentAt) < gap || w <= 0 || h <= 0 || len(px) < w*h {
		return
	}
	vr.sentAt = now
	sw, sh := metric(0), metric(1) // the main screen
	m, wm := vrPlace(x, y, w, h, sw, sh, c)
	if wm != vr.lastW {
		vrCall(vr.ovl, ovrSetWidth, uintptr(vr.handle), f32(wm))
		vr.lastW = wm
	}
	if m != vr.lastM {
		vrCall(vr.ovl, ovrSetTransAbs, uintptr(vr.handle), vrSeated, uintptr(unsafe.Pointer(&m[0])))
		vr.lastM = m
	}
	if alpha != vr.lastAlpha {
		vrCall(vr.ovl, ovrSetAlpha, uintptr(vr.handle), f32(float32(alpha)/255))
		vr.lastAlpha = alpha
	}
	vr.buf = vrPixels(px[:w*h], vr.buf)
	vrCall(vr.ovl, ovrSetRaw, uintptr(vr.handle), uintptr(unsafe.Pointer(&vr.buf[0])), uintptr(w), uintptr(h), 4)
}
