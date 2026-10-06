package main

// telNums reads several telemetry values at once, as numbers (0 when missing).
func telNums(names []string) []float64 {
	out := make([]float64, len(names))
	tel.mu.RLock()
	defer tel.mu.RUnlock()
	if len(tel.buf) == 0 {
		return out
	}
	idx := make([]int, 0, len(names))
	pos := make([]int, 0, len(names))
	for k, n := range names {
		if i, ok := tel.index[n]; ok {
			idx = append(idx, i)
			pos = append(pos, k)
		}
	}
	for j, v := range decodeValues(tel.vars, tel.buf, idx) {
		out[pos[j]] = toF(v)
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
