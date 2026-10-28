package main

import (
	"encoding/binary"
	"encoding/json"
	"math"
	"math/rand"
	"strconv"
	"testing"
)

// the stream's frame and telNums read the buffer straight: they must give exactly what decodeValues gave, through
// encoding/json for the stream and toF for telNums, whatever the buffer holds (NaN, infinities, huge and tiny
// numbers, -0, texts, a variable past the buffer's end)
func TestStreamFrameMatchesJSON(t *testing.T) {
	rng := rand.New(rand.NewSource(3))
	types := []int32{TypeChar, TypeBool, TypeInt, TypeBitField, TypeFloat, TypeDouble}
	specials := []float64{math.NaN(), math.Inf(1), math.Inf(-1), 0, math.Copysign(0, -1), 1e-7, -1e-7, 4e-6, 1e21, -3e25, 1e300, 5e-324,
		0.1, 123456.7890123, -0.000005, 0.0000049, 99999999999.5, 1.5, 2.5, 1e20, 999999999.9999995, 999999999.999999, 9999999999.999995,
		-0.0000004, 1234.56785, 0.000015, 1e9 + 0.1234565, 899999999.123456, 8.99999999e8, 1e14, 1e15, 1e16, 5e8, -7.25, 3.14159265358979}
	for round := 0; round < 400; round++ {
		var vars []VarHeader
		off := 0
		for i := 0; i < 1+rng.Intn(12); i++ {
			typ := types[rng.Intn(len(types))]
			n := 1
			if rng.Intn(3) == 0 {
				n = rng.Intn(70)
			}
			vars = append(vars, VarHeader{Name: string(rune('a' + i)), typ: typ, Count: n, offset: off})
			off += typeSize[typ] * n
		}
		buf := make([]byte, off)
		rng.Read(buf)
		for _, v := range vars { // the specials in the numbers, sometimes
			for j := 0; j < v.Count; j++ {
				if rng.Intn(2) == 0 {
					continue
				}
				f := specials[rng.Intn(len(specials))]
				if rng.Intn(2) == 0 { // a value of a realistic size, at every scale
					f = (rng.Float64()*2 - 1) * math.Pow(10, float64(rng.Intn(24)-8))
				}
				o := v.offset + j*typeSize[v.typ]
				switch v.typ {
				case TypeFloat:
					binary.LittleEndian.PutUint32(buf[o:], math.Float32bits(float32(f)))
				case TypeDouble:
					binary.LittleEndian.PutUint64(buf[o:], math.Float64bits(f))
				}
			}
		}
		if rng.Intn(4) == 0 && len(buf) > 2 { // the last variables past the buffer's end
			buf = buf[:len(buf)-1-rng.Intn(len(buf)/2)]
		}
		want := make([]int, 0, len(vars))
		for i := range vars {
			if rng.Intn(5) > 0 {
				want = append(want, i)
			}
		}
		tick := int32(rng.Intn(1 << 30))
		old, err := json.Marshal(map[string]any{"k": tick, "v": decodeValues(vars, buf, want)})
		got, ok := streamFrame([]byte("x"), vars, buf, want, tick)
		if ok != (err == nil) {
			t.Fatalf("round %d: the frame sent %v, encoding/json's error %v", round, ok, err)
		}
		if ok && (string(got[1:]) != string(old) || got[0] != 'x') {
			t.Fatalf("round %d: the frame\n%s\nencoding/json\n%s", round, got[1:], old)
		}
		// telNums over these variables
		idx := map[string]int{}
		names := []string{"missing"}
		for i, v := range vars {
			idx[v.Name] = i
			names = append(names, v.Name)
		}
		tel.mu.Lock()
		tel.vars, tel.index, tel.buf = vars, idx, buf
		tel.mu.Unlock()
		nums := telNumsInto(make([]float64, 3, 40), names)
		for k, n := range names {
			ref := 0.0
			if i, ok := idx[n]; ok {
				ref = toF(decodeValues(vars, buf, []int{i})[0])
			}
			if math.Float64bits(nums[k]) != math.Float64bits(ref) && !(nums[k] == 0 && ref == 0) {
				t.Fatalf("round %d: telNums %s = %v, decodeValues %v", round, n, nums[k], ref)
			}
		}
	}
	tel.mu.Lock()
	tel.vars, tel.index, tel.buf = nil, map[string]int{}, nil
	tel.mu.Unlock()
}

// the overlay windows read a frame without encoding/json when it has the stream's plain shape: the values they get
// (num and arr) must be the ones encoding/json gave, for every frame the stream writes and for odd texts too
func TestOverlayFrameReadMatchesJSON(t *testing.T) {
	numRef := func(raw json.RawMessage) (float64, bool) {
		var v any
		if json.Unmarshal(raw, &v) != nil {
			return 0, false
		}
		switch x := v.(type) {
		case float64:
			return x, true
		case bool:
			if x {
				return 1, true
			}
			return 0, true
		}
		return 0, false
	}
	arrRef := func(raw json.RawMessage) []float64 {
		var v []any
		if json.Unmarshal(raw, &v) != nil {
			return nil
		}
		out := make([]float64, len(v))
		for i, x := range v {
			switch y := x.(type) {
			case float64:
				out[i] = y
			case bool:
				if y {
					out[i] = 1
				}
			}
		}
		return out
	}
	check := func(data string) {
		t.Helper()
		var ref struct{ V []json.RawMessage }
		refErr := json.Unmarshal([]byte(data), &ref)
		got, ok := splitFrame(data)
		if ok {
			if refErr != nil {
				t.Fatalf("%q: split, but encoding/json refuses it (%v)", data, refErr)
			}
			if len(got) != len(ref.V) {
				t.Fatalf("%q: %d values, encoding/json %d", data, len(got), len(ref.V))
			}
		} else {
			got = ref.V
		}
		st := &ovState{frame: map[string]json.RawMessage{}}
		for i := range got {
			if ok && string(got[i]) != string(ref.V[i]) {
				t.Fatalf("%q: value %d %q, encoding/json %q", data, i, got[i], ref.V[i])
			}
			st.frame["x"] = got[i]
			f, fok := st.num("x")
			rf, rok := numRef(got[i])
			if fok != rok || math.Float64bits(f) != math.Float64bits(rf) {
				t.Fatalf("%q: num %v %v, encoding/json %v %v", got[i], f, fok, rf, rok)
			}
			a, ra := st.arr("x"), arrRef(got[i])
			if (a == nil) != (ra == nil) || len(a) != len(ra) {
				t.Fatalf("%q: arr %v, encoding/json %v", got[i], a, ra)
			}
			for k := range a {
				if math.Float64bits(a[k]) != math.Float64bits(ra[k]) {
					t.Fatalf("%q: arr %v, encoding/json %v", got[i], a, ra)
				}
			}
		}
	}
	for _, d := range []string{`{"k":1,"v":[]}`, `{"k":1,"v":[1,2.5,-0,true,false,null,[1,2],[],[true,null,-3e-7]]}`, `{"k":1,"v":["a",1]}`,
		`{"k":1,"v":[1e400,[1e400]]}`, `{"k":1,"v":[1,]}`, `{"k":1,"v":[,1]}`, `{"k":1,"v":[[1,],2]}`, `{"k":1,"v":[[,],2]}`, `{"k":1,"v":[[[1]]]}`,
		`{"k":1,"v":[01]}`, `{"k":1,"v":[1.]}`, `{"k":1,"v":[.5]}`, `{"k":1,"v":[+1]}`, `{"k":1,"v":[Inf]}`, `{"k":-1,"v":[1]}`, `{"k":01,"v":[1]}`,
		`{"k":1, "v":[1]}`, `{"k":1,"v":[1 ]}`, `{"v":[1],"k":1}`, `{"k":1,"v":[1]}x`, `{"k":1,"v":[1E+2,1e-2,2E5]}`, `{"k":1,"v":[[1,2]`, `{"k":1,"v":[tru]}`} {
		check(d)
	}
	rng := rand.New(rand.NewSource(11))
	types := []int32{TypeBool, TypeInt, TypeBitField, TypeFloat, TypeDouble, TypeChar}
	for round := 0; round < 300; round++ {
		var vars []VarHeader
		off := 0
		for i := 0; i < 1+rng.Intn(10); i++ {
			typ := types[rng.Intn(len(types))]
			n := 1
			if rng.Intn(2) == 0 {
				n = rng.Intn(65)
			}
			vars = append(vars, VarHeader{typ: typ, Count: n, offset: off})
			off += typeSize[typ] * n
		}
		buf := make([]byte, off)
		rng.Read(buf)
		want := make([]int, len(vars))
		for i := range want {
			want[i] = i
		}
		if f, ok := streamFrame(nil, vars, buf, want, int32(round)); ok {
			check(string(f))
		}
	}
}

// plainDecimal gives strconv.ParseFloat's float64 for every number it takes
func TestPlainDecimalMatchesParseFloat(t *testing.T) {
	rng := rand.New(rand.NewSource(5))
	for k := 0; k < 300000; k++ {
		var b []byte
		if rng.Intn(3) == 0 {
			b = append(b, '-')
		}
		b = strconv.AppendUint(b, rng.Uint64()>>uint(rng.Intn(64)), 10)
		if rng.Intn(4) > 0 {
			b = append(b, '.')
			for n := 1 + rng.Intn(18); n > 0; n-- {
				b = append(b, byte('0'+rng.Intn(10)))
			}
		}
		if !jsonNumber(b) {
			continue
		}
		v, ok := plainDecimal(b)
		if !ok {
			continue
		}
		ref, err := strconv.ParseFloat(string(b), 64)
		if err != nil || math.Float64bits(v) != math.Float64bits(ref) {
			t.Fatalf("%s: %v, ParseFloat %v (%v)", b, v, ref, err)
		}
	}
}
