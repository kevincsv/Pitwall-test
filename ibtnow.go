package main

// An admin reads the PC's iRacing telemetry files now (admin page → Server → Tools on the PC): the same round as the
// automatic import (ibtImportRound, the same rules and the same memory of files read), without waiting for the PC to
// be idle, at full speed, stopping only when a sim starts. Its progress is on GET /api/ibt.

import (
	"net/http"
	"sync"
	"time"
)

var (
	ibtNowMu sync.Mutex
	ibtNow   struct {
		Running bool   `json:"running"`
		Started int64  `json:"started,omitempty"`
		Ended   int64  `json:"ended,omitempty"`
		Files   int    `json:"files"`   // telemetry files found in the folders
		Read    int    `json:"read"`    // already read (by any round)
		Laps    int    `json:"laps"`    // laps sent by every round so far
		Done    bool   `json:"done"`    // every file was gone through
		Stopped string `json:"stopped,omitempty"`
	}
	ibtFast bool // a round started by hand: no rests between files and batches
)

// ibtCounts: the files found and those the memory has read, with their laps, for this account
func ibtCounts(acct string) (files, read, laps int) {
	fs := ibtFiles(ibtDirs())
	mem := loadIBTMemory() // written whole by a rename: read without waiting for a round that holds its lock
	for _, f := range fs {
		files++
		if mem.known(acct, f.path, f.size, f.mtime.UnixMilli(), "") {
			read++
			laps += mem.Accounts[acct][f.path].Laps
		}
	}
	return
}

func registerIBTNow(mux *http.ServeMux) {
	mux.HandleFunc("/api/ibt", func(w http.ResponseWriter, r *http.Request) {
		if !wipAllowed() {
			w.WriteHeader(403)
			writeJSON(w, map[string]string{"error": "admins only"})
			return
		}
		loadPL()
		plMu.Lock()
		acct := plAcc.ID
		plMu.Unlock()
		if r.Method == http.MethodPost {
			ibtNowMu.Lock()
			if !ibtNow.Running {
				ibtNow.Running, ibtNow.Started, ibtNow.Ended, ibtNow.Done, ibtNow.Stopped = true, time.Now().UnixMilli(), 0, false, ""
				go func() {
					ibtNowMu.Lock()
					ibtFast = true
					ibtNowMu.Unlock()
					_, done := ibtImportRound(func() bool { return currentStatus().Connected })
					ibtNowMu.Lock()
					ibtFast = false
					ibtNow.Running, ibtNow.Ended, ibtNow.Done = false, time.Now().UnixMilli(), done
					if !done {
						ibtNow.Stopped = "paused"
						if simBusy() {
							ibtNow.Stopped = "sim"
						}
					}
					ibtNowMu.Unlock()
				}()
			}
			ibtNowMu.Unlock()
		}
		files, read, laps := ibtCounts(acct)
		ibtNowMu.Lock()
		ibtNow.Files, ibtNow.Read, ibtNow.Laps = files, read, laps
		out := ibtNow
		ibtNowMu.Unlock()
		writeJSON(w, out)
	})
}

func ibtIsFast() bool {
	ibtNowMu.Lock()
	defer ibtNowMu.Unlock()
	return ibtFast
}
