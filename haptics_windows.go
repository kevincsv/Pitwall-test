//go:build windows

package main

// Sends the haptic effects to a sound output (the one wired to your
// amplifier and bass shakers) through the Windows waveOut API, as 16-bit
// sound with 2 to 8 channels.

import (
	"encoding/binary"
	"errors"
	"fmt"
	"math"
	"runtime"
	"time"
	"unsafe"

	"golang.org/x/sys/windows"
)

var (
	winmm                     = windows.NewLazySystemDLL("winmm.dll")
	pWaveOutGetNumDevs        = winmm.NewProc("waveOutGetNumDevs")
	pWaveOutGetDevCaps        = winmm.NewProc("waveOutGetDevCapsW")
	pWaveOutOpen              = winmm.NewProc("waveOutOpen")
	pWaveOutPrepare           = winmm.NewProc("waveOutPrepareHeader")
	pWaveOutUnprepare         = winmm.NewProc("waveOutUnprepareHeader")
	pWaveOutWrite             = winmm.NewProc("waveOutWrite")
	pWaveOutReset             = winmm.NewProc("waveOutReset")
	pWaveOutClose             = winmm.NewProc("waveOutClose")
	ksSubtypePCM              = [16]byte{0x01, 0, 0, 0, 0, 0, 0x10, 0, 0x80, 0, 0, 0xaa, 0, 0x38, 0x9b, 0x71}
	waveMapper         uint32 = 0xFFFFFFFF
)

// waveHdr is WAVEHDR (48 bytes on 64-bit Windows).
type waveHdr struct {
	data     uintptr
	length   uint32
	recorded uint32
	user     uintptr
	flags    uint32
	loops    uint32
	next     uintptr
	reserved uintptr
}

const whdrDone = 1

// audioDevices lists the sound outputs (index, name, channels).
func audioDevices() []map[string]any {
	n, _, _ := pWaveOutGetNumDevs.Call()
	var out []map[string]any
	for i := uintptr(0); i < n && i < 64; i++ {
		var caps [84]byte
		if r, _, _ := pWaveOutGetDevCaps.Call(i, uintptr(unsafe.Pointer(&caps[0])), uintptr(len(caps))); r != 0 {
			continue
		}
		name := make([]uint16, 32)
		for k := range name {
			name[k] = binary.LittleEndian.Uint16(caps[8+2*k:])
		}
		out = append(out, map[string]any{"id": int(i), "name": windows.UTF16ToString(name), "channels": int(binary.LittleEndian.Uint16(caps[76:]))})
	}
	return out
}

func channelMask(n int) uint32 {
	switch n {
	case 4:
		return 0x33 // front L/R, back L/R
	case 6:
		return 0x3F // 5.1
	case 8:
		return 0x63F // 7.1
	}
	return 0x3
}

func runHapticsOutput(device, chans int, stop chan struct{}) error {
	runtime.LockOSThread()
	defer runtime.UnlockOSThread()
	// WAVEFORMATEXTENSIBLE, 40 bytes
	var wf [40]byte
	le := binary.LittleEndian
	le.PutUint16(wf[0:], 0xFFFE)
	le.PutUint16(wf[2:], uint16(chans))
	le.PutUint32(wf[4:], hapRate)
	le.PutUint32(wf[8:], uint32(hapRate*chans*2))
	le.PutUint16(wf[12:], uint16(chans*2))
	le.PutUint16(wf[14:], 16)
	le.PutUint16(wf[16:], 22)
	le.PutUint16(wf[18:], 16)
	le.PutUint32(wf[20:], channelMask(chans))
	copy(wf[24:], ksSubtypePCM[:])
	dev := uintptr(waveMapper)
	if device >= 0 {
		dev = uintptr(device)
	}
	var h uintptr
	if r, _, _ := pWaveOutOpen.Call(uintptr(unsafe.Pointer(&h)), dev, uintptr(unsafe.Pointer(&wf[0])), 0, 0, 0); r != 0 {
		return fmt.Errorf("this sound output does not accept %d channels (error %d); choose fewer channels or another output", chans, r)
	}
	defer pWaveOutClose.Call(h)

	const nbuf = 4
	bytesPer := hapBlock * chans * 2
	hdrSize := unsafe.Sizeof(waveHdr{})
	// memory Windows keeps using after the call: allocate it outside Go's heap
	mem, err := windows.VirtualAlloc(0, uintptr(nbuf)*(hdrSize+uintptr(bytesPer)), windows.MEM_COMMIT|windows.MEM_RESERVE, windows.PAGE_READWRITE)
	if err != nil {
		return errors.New("could not get memory for sound")
	}
	defer windows.VirtualFree(mem, 0, windows.MEM_RELEASE)
	hdrs := make([]*waveHdr, nbuf)
	datas := make([][]byte, nbuf)
	for i := 0; i < nbuf; i++ {
		base := mem + uintptr(i)*(hdrSize+uintptr(bytesPer))
		hdrs[i] = (*waveHdr)(unsafe.Pointer(base))
		datas[i] = unsafe.Slice((*byte)(unsafe.Pointer(base+hdrSize)), bytesPer)
		*hdrs[i] = waveHdr{data: base + hdrSize, length: uint32(bytesPer)}
		pWaveOutPrepare.Call(h, uintptr(unsafe.Pointer(hdrs[i])), hdrSize)
		hdrs[i].flags |= whdrDone // free to fill
	}
	defer func() {
		pWaveOutReset.Call(h)
		for i := 0; i < nbuf; i++ {
			pWaveOutUnprepare.Call(h, uintptr(unsafe.Pointer(hdrs[i])), hdrSize)
		}
	}()
	syn := newHapSynth()
	samples := make([]float32, hapBlock*chans)
	for i := 0; ; i = (i + 1) % nbuf {
		for hdrs[i].flags&whdrDone == 0 {
			select {
			case <-stop:
				return nil
			default:
			}
			time.Sleep(time.Millisecond)
		}
		select {
		case <-stop:
			return nil
		default:
		}
		syn.block(samples, chans, telNums(hapVars))
		for k, x := range samples {
			le.PutUint16(datas[i][2*k:], uint16(int16(math.Round(float64(x)*32000))))
		}
		hdrs[i].flags &^= whdrDone
		if r, _, _ := pWaveOutWrite.Call(h, uintptr(unsafe.Pointer(hdrs[i])), hdrSize); r != 0 {
			return fmt.Errorf("sound output stopped (error %d)", r)
		}
	}
}
