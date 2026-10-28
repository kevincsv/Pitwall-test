package main

// telNums reads several telemetry values at once, as numbers (0 when missing).
func telNums(names []string) []float64 { return telNumsInto(nil, names) }

// telNumsInto is telNums into dst's storage when it is big enough (a loop that reads the same values 30 times a
// second allocates nothing): a scalar's value with the stream's rounding, 0 for an array, a text or a missing one
func telNumsInto(dst []float64, names []string) []float64 {
	if cap(dst) < len(names) {
		dst = make([]float64, len(names))
	}
	out := dst[:len(names)]
	clear(out)
	tel.mu.RLock()
	defer tel.mu.RUnlock()
	if len(tel.buf) == 0 {
		return out
	}
	for k, n := range names {
		i, ok := tel.index[n]
		if !ok {
			continue
		}
		v := tel.vars[i]
		if v.typ == TypeChar || v.Count != 1 || v.offset+typeSize[v.typ]*v.Count > len(tel.buf) {
			continue
		}
		out[k] = decodeNum(v.typ, tel.buf, v.offset)
	}
	return out
}

func toF(v any) float64 {
	switch x := v.(type) {
	case float64:
		return x
	case int32:
		return float64(x)
	case int:
		return float64(x)
	case bool:
		if x {
			return 1
		}
	}
	return 0
}

// telHas: whether the running game sends this variable (a missing one reads as 0).
func telHas(name string) bool {
	tel.mu.RLock()
	defer tel.mu.RUnlock()
	_, ok := tel.index[name]
	return ok
}
