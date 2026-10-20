package main

import (
	"encoding/json"
	"testing"
)

func TestVoiceSignalling(t *testing.T) {
	loadPL()
	plMu.Lock()
	was := plAcc
	plAcc.Admin, plAcc.Token = true, "tok"
	plMu.Unlock()
	defer func() { plMu.Lock(); plAcc = was; plMu.Unlock() }()
	liveAsks.Lock()
	liveAsks.ok["devAAAA1"] = true
	liveAsks.Unlock()
	_, p0 := voiceSince("", -1)
	offer := json.RawMessage(`{"t":"offer","id":"devAAAA1","call":"call0001","sdp":"x"}`)
	voiceFromViewer("own", offer)
	voiceFromViewer("own", json.RawMessage(`{"t":"offer","id":"stranger","call":"call0002","sdp":"x"}`)) // never accepted
	got, _ := voiceSince("", p0)
	if len(got) != 1 || string(got[0]) != string(offer) {
		t.Fatalf("page got %s", got)
	}
	_, v0 := voiceSince("own", -1)
	if ok, why := voiceFromPage(json.RawMessage(`{"t":"answer","to":"devAAAA1","call":"call0001","page":"pageAAA1"}`)); !ok {
		t.Fatal(why)
	}
	if ok, _ := voiceFromPage(json.RawMessage(`{"t":"answer","to":"devAAAA1","call":"call0001","page":"pageBBB2"}`)); ok {
		t.Fatal("a second window answered the same call")
	}
	if v, _ := voiceSince("own", v0); len(v) != 1 {
		t.Fatalf("own room got %d", len(v))
	}
	if v, _ := voiceSince("share", v0); len(v) != 0 {
		t.Fatalf("share room got %d", len(v))
	}
	// not an admin: nothing goes through
	plMu.Lock()
	plAcc.Admin = false
	plMu.Unlock()
	_, p1 := voiceSince("", -1)
	voiceFromViewer("share", json.RawMessage(`{"t":"offer","id":"devCCCC3","call":"call0003","sdp":"x"}`))
	if got, _ := voiceSince("", p1); len(got) != 0 {
		t.Fatal("voice went through for a normal account")
	}
}
