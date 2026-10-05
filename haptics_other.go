//go:build !windows

package main

// Without Windows there is no sound output; the engine still runs so the
// meters move (useful with the demo race).
func runHapticsOutput(device, chans int, stop chan struct{}) error {
	syn := newHapSynth()
	buf := make([]float32, hapBlock*chans)
	for {
		select {
		case <-stop:
			return nil
		default:
		}
		syn.block(buf, chans, telNums(hapVars))
		sleepBlock()
	}
}

func audioDevices() []map[string]any { return nil }
