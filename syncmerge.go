package main

// Merging the synced files of the account: this PC's copy, the account's copy and what both had at
// the last sync (the base). What changed on one side only is taken from that side; a value both sides
// changed differently goes to the newer side. Objects merge key by key, lists of items with an "id"
// (the race history) item by item, so a race recorded on one PC and a race deleted on the phone both
// survive. Nothing asks which copy to keep.

import (
	"bytes"
	"encoding/json"
	"fmt"
	"reflect"
	"sort"
)

func decodeJSON(b []byte) (any, bool) {
	if b == nil {
		return nil, false
	}
	d := json.NewDecoder(bytes.NewReader(b))
	d.UseNumber()
	var v any
	if d.Decode(&v) != nil {
		return nil, false
	}
	return v, true
}

func sameJSON(a, b any) bool { return reflect.DeepEqual(a, b) }

// mergeJSON merges one file. base is nil when unknown (the first sync of this PC with the account);
// preferRemote decides the values both sides changed.
func mergeJSON(base, local, remote []byte, preferRemote bool) []byte {
	if bytes.Equal(local, remote) {
		return local
	}
	if base != nil && bytes.Equal(local, base) {
		return remote
	}
	if base != nil && bytes.Equal(remote, base) {
		return local
	}
	l, okL := decodeJSON(local)
	r, okR := decodeJSON(remote)
	if !okL || !okR {
		if preferRemote && okR || !okL {
			return remote
		}
		return local
	}
	b, okB := decodeJSON(base)
	m := mergeValue(b, l, r, okB, preferRemote)
	switch {
	case sameJSON(m, l):
		return local
	case sameJSON(m, r):
		return remote
	}
	out, err := json.Marshal(m)
	if err != nil {
		if preferRemote {
			return remote
		}
		return local
	}
	return out
}

func mergeValue(b, l, r any, hasB, preferRemote bool) any {
	if sameJSON(l, r) {
		return l
	}
	if hasB && sameJSON(l, b) {
		return r
	}
	if hasB && sameJSON(r, b) {
		return l
	}
	if lm, ok := l.(map[string]any); ok {
		if rm, ok := r.(map[string]any); ok {
			bm, _ := b.(map[string]any)
			return mergeMaps(bm, lm, rm, hasB && bm != nil, preferRemote)
		}
	}
	if la, ok := l.([]any); ok {
		if ra, ok := r.([]any); ok && itemsWithID(la) && itemsWithID(ra) {
			ba, _ := b.([]any)
			return mergeItems(ba, la, ra, hasB && itemsWithID(ba), preferRemote)
		}
	}
	if preferRemote {
		return r
	}
	return l
}

func mergeMaps(b, l, r map[string]any, hasB, preferRemote bool) map[string]any {
	out := map[string]any{}
	keys := map[string]bool{}
	for k := range l {
		keys[k] = true
	}
	for k := range r {
		keys[k] = true
	}
	for k := range keys {
		lv, inL := l[k]
		rv, inR := r[k]
		bv, inB := b[k]
		inB = inB && hasB
		switch {
		case inL && inR:
			out[k] = mergeValue(bv, lv, rv, inB, preferRemote)
		case inL: // removed on the other side when it was the same as before
			if !(inB && sameJSON(lv, bv)) {
				out[k] = lv
			}
		case inR:
			if !(inB && sameJSON(rv, bv)) {
				out[k] = rv
			}
		}
	}
	return out
}

func itemID(x any) (string, bool) {
	m, ok := x.(map[string]any)
	if !ok {
		return "", false
	}
	v, ok := m["id"]
	if !ok || v == nil {
		return "", false
	}
	s := fmt.Sprint(v)
	return s, s != ""
}

// itemsWithID: a list whose items all carry a different "id" (an empty list counts too)
func itemsWithID(a []any) bool {
	seen := map[string]bool{}
	for _, x := range a {
		id, ok := itemID(x)
		if !ok || seen[id] {
			return false
		}
		seen[id] = true
	}
	return true
}

func mergeItems(b, l, r []any, hasB, preferRemote bool) []any {
	index := func(a []any) map[string]any {
		m := map[string]any{}
		for _, x := range a {
			id, _ := itemID(x)
			m[id] = x
		}
		return m
	}
	bi, ri := index(b), index(r)
	out := []any{}
	seen := map[string]bool{}
	for _, lv := range l {
		id, _ := itemID(lv)
		seen[id] = true
		bv, inB := bi[id]
		inB = inB && hasB
		if rv, inR := ri[id]; inR {
			out = append(out, mergeValue(bv, lv, rv, inB, preferRemote))
		} else if !(inB && sameJSON(lv, bv)) { // deleted on the other side
			out = append(out, lv)
		}
	}
	for _, rv := range r {
		id, _ := itemID(rv)
		if seen[id] {
			continue
		}
		if bv, inB := bi[id]; !(inB && hasB && sameJSON(rv, bv)) { // deleted here
			out = append(out, rv)
		}
	}
	// the race history stays in the order it was driven
	when := func(x any) (float64, bool) {
		m, _ := x.(map[string]any)
		n, ok := m["when"].(json.Number)
		if !ok {
			return 0, false
		}
		f, err := n.Float64()
		return f, err == nil
	}
	all := len(out) > 1
	for _, x := range out {
		if _, ok := when(x); !ok {
			all = false
			break
		}
	}
	if all {
		sort.SliceStable(out, func(i, j int) bool { a, _ := when(out[i]); c, _ := when(out[j]); return a < c })
	}
	return out
}

// mergeBundles merges every file of the account. A file only one side has is taken as it is.
func mergeBundles(base, local, remote map[string][]byte, preferRemote func(name string) bool) map[string][]byte {
	out := map[string][]byte{}
	for name, l := range local {
		r, inR := remote[name]
		if !inR {
			out[name] = l
			continue
		}
		var b []byte
		if base != nil {
			b = base[name]
		}
		out[name] = mergeJSON(b, l, r, preferRemote(name))
	}
	for name, r := range remote {
		if _, inL := local[name]; !inL {
			out[name] = r
		}
	}
	return out
}

// sameBundle: the same files with the same content (however they are formatted)
func sameBundle(a, b map[string][]byte) bool {
	if len(a) != len(b) {
		return false
	}
	for k, x := range a {
		y, ok := b[k]
		if !ok {
			return false
		}
		if bytes.Equal(x, y) {
			continue
		}
		vx, okx := decodeJSON(x)
		vy, oky := decodeJSON(y)
		if !okx || !oky || !sameJSON(vx, vy) {
			return false
		}
	}
	return true
}
