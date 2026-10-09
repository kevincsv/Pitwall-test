package main

// Native overlays, sixth part: what several of them remember between frames (the delta bar's trend, when each
// flag came out, the official sectors of the lap) and the helpers they share.

import (
	"math"
	"time"
)

type ovMem6 struct {
	dHist    []dSample            // the delta bar: its last two seconds, to say where it is going
	flagOn   map[uint32]time.Time // the flags: when each bit came on (a green shows a few seconds, the start lights in order)
	flagLast uint32
	// the official sectors (the game's SplitTimeInfo): this lap's times, the last lap's, the best of each one of the
	// session and the sectors of the best whole lap
	secSess                              int
	secInit                              bool
	secIdx                               int
	secT0                                float64
	secHasT0                             bool
	secLp, secLt                         float64
	secHasLp                             bool
	secCur, secLast, secBest, secBestLap []float64
	secBestLapT                          float64
}

type dSample struct {
	at time.Time
	v  float64
}

// deltaTrend: how the delta moved over the last second (+ losing, − gaining); false while it is steady or unknown
func (st *ovState) deltaTrend(d float64, ok bool) (float64, bool) {
	m := &st.x6
	now := time.Now()
	if !ok {
		m.dHist = m.dHist[:0]
		return 0, false
	}
	m.dHist = append(m.dHist, dSample{now, d})
	for len(m.dHist) > 0 && now.Sub(m.dHist[0].at) > 2*time.Second {
		m.dHist = m.dHist[1:]
	}
	var ref *dSample
	for i := range m.dHist {
		if now.Sub(m.dHist[i].at) <= time.Second {
			ref = &m.dHist[i]
			break
		}
	}
	if ref == nil || now.Sub(ref.at) < 600*time.Millisecond {
		return 0, false
	}
	tr := d - ref.v
	if math.Abs(tr) < 0.02 {
		return 0, false
	}
	return tr, true
}

// flagSince: how long a flag bit has been on (0 when it is not), noted as the frames come
func (st *ovState) noteFlags(f uint32, now time.Time) {
	m := &st.x6
	if m.flagOn == nil {
		m.flagOn = map[uint32]time.Time{}
	}
	for bit := uint32(1); bit != 0; bit <<= 1 {
		on, was := f&bit != 0, m.flagLast&bit != 0
		if on && !was {
			m.flagOn[bit] = now
		} else if !on && was {
			delete(m.flagOn, bit)
		}
	}
	m.flagLast = f
}

func (st *ovState) flagSince(bit uint32, now time.Time) (time.Duration, bool) {
	t, ok := st.x6.flagOn[bit]
	if !ok {
		return 0, false
	}
	return now.Sub(t), true
}

// collectSectors times the official sectors of every lap, like the mini-sectors (the boundary's time is
// interpolated between the frames either side); st.mu is held
func (st *ovState) collectSectors() {
	m := &st.x6
	if st.ses == nil || len(st.ses.Sectors) < 2 {
		return
	}
	N := len(st.ses.Sectors)
	snv, _ := st.num("SessionNum")
	if sn := int(snv); !m.secInit || sn != m.secSess {
		*m = ovMem6{dHist: m.dHist, flagOn: m.flagOn, flagLast: m.flagLast, secInit: true, secSess: sn, secIdx: -1, secCur: make([]float64, N), secBest: make([]float64, N)}
		for i := range m.secBest {
			m.secBest[i] = -1
		}
	}
	if len(m.secCur) != N {
		m.secCur, m.secBest, m.secLast, m.secBestLap, m.secIdx = make([]float64, N), make([]float64, N), nil, nil, -1
		for i := range m.secBest {
			m.secBest[i] = -1
		}
	}
	t, hasT := st.num("SessionTime")
	p, hasP := st.num("LapDistPct")
	on, _ := st.num("IsOnTrack")
	if !hasT || !hasP || p < 0 {
		return
	}
	if on == 0 {
		m.secIdx, m.secHasT0, m.secHasLp = -1, false, false
		m.secCur = make([]float64, N)
		return
	}
	k := 0
	for i, b := range st.ses.Sectors {
		if p >= b {
			k = i
		}
	}
	lp, lt, hadLp := m.secLp, m.secLt, m.secHasLp
	m.secLp, m.secLt, m.secHasLp = p, t, true
	if k == m.secIdx {
		return
	}
	prev := m.secIdx
	m.secIdx = k
	forward := prev >= 0 && (k == prev+1 || (prev == N-1 && k == 0))
	tb := t
	if forward && hadLp {
		edge := st.ses.Sectors[k]
		if k == 0 {
			edge = 1
		}
		pp := p
		if k == 0 && p < lp {
			pp = p + 1
		}
		if pp > lp {
			tb = lt + (t-lt)*(edge-lp)/(pp-lp)
		}
	}
	if forward && m.secHasT0 {
		dt := tb - m.secT0
		m.secCur[prev] = dt
		if m.secBest[prev] < 0 || dt < m.secBest[prev] {
			m.secBest[prev] = dt
		}
	} else if !forward {
		m.secCur = make([]float64, N)
	}
	if forward && k == 0 {
		full, tot := true, 0.0
		for _, v := range m.secCur {
			if v <= 0 {
				full = false
			}
			tot += v
		}
		if full {
			if m.secBestLap == nil || tot < m.secBestLapT {
				m.secBestLapT = tot
				m.secBestLap = append([]float64(nil), m.secCur...)
			}
			m.secLast = m.secCur
		}
		m.secCur = make([]float64, N)
	}
	m.secT0, m.secHasT0 = tb, forward
}

// multiClass: whether the cars on track race in more than one class
func (st *ovState) multiClass() bool {
	if st.ses == nil {
		return false
	}
	seen := map[int]bool{}
	for _, d := range st.ses.Drivers {
		if d != nil && !d.Skip && d.Name != "" {
			seen[d.Class] = true
		}
	}
	return len(seen) > 1
}
