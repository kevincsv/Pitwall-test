package main

// Reading iRacing's telemetry files (.ibt, written when telemetry logging is on): the same header, variable headers
// and session YAML as the shared memory (irsdk.go reads them), then a disk sub-header (when the recording started and
// how many samples it holds) and the samples one after another, TickRate a second.

import (
	"bufio"
	"encoding/binary"
	"errors"
	"fmt"
	"io"
	"math"
	"os"
)

const ibtDiskHeaderSize = 32 // sessionStartDate (time_t), sessionStartTime, sessionEndTime (double), lapCount, recordCount (int)

type ibtFile struct {
	f         *os.File
	hdr       Header
	vars      []VarHeader
	index     map[string]int
	yaml      string
	startDate int64   // when the recording started (Unix seconds), 0 when unknown
	startTime float64 // the session clock (SessionTime) at that moment
	endTime   float64
	records   int // samples in the file
}

// openIBT reads a telemetry file's header, variables and session YAML; the samples are read one by one by next.
func openIBT(path string) (*ibtFile, error) {
	f, err := os.Open(path)
	if err != nil {
		return nil, err
	}
	st, err := f.Stat()
	if err != nil {
		f.Close()
		return nil, err
	}
	size := st.Size()
	head := make([]byte, headerSize+ibtDiskHeaderSize)
	if _, err := io.ReadFull(f, head); err != nil {
		f.Close()
		if errors.Is(err, io.EOF) || errors.Is(err, io.ErrUnexpectedEOF) {
			return nil, errBadIBT
		}
		return nil, err
	}
	h, err := readHeader(head)
	if err != nil {
		f.Close()
		return nil, fmt.Errorf("%w: %v", errBadIBT, err)
	}
	end := int64(headerSize + ibtDiskHeaderSize)
	if e := int64(h.VarHeaderOffset) + int64(h.NumVars)*varHeaderSize; e > end {
		end = e
	}
	if e := int64(h.SessionInfoOffset) + int64(h.SessionInfoLen); e > end {
		end = e
	}
	data := int64(h.Bufs[0].BufOffset)
	if h.NumVars <= 0 || h.NumVars > 4096 || h.BufLen <= 0 || h.BufLen > 1<<20 || h.TickRate <= 0 || h.TickRate > 1000 ||
		h.VarHeaderOffset <= 0 || data < end || end > 64<<20 || end > size {
		f.Close()
		return nil, errBadIBT
	}
	meta := make([]byte, end)
	if _, err := f.ReadAt(meta, 0); err != nil {
		f.Close()
		return nil, err
	}
	vars, err := readVarHeaders(meta, h)
	if err != nil {
		f.Close()
		return nil, fmt.Errorf("%w: %v", errBadIBT, err)
	}
	x := &ibtFile{f: f, hdr: h, vars: vars, index: map[string]int{}, yaml: readSessionInfo(meta, h)}
	for i, v := range vars {
		if v.offset < 0 || v.offset+typeSize[v.typ]*v.Count > int(h.BufLen) {
			f.Close()
			return nil, fmt.Errorf("%w: bad variable %s", errBadIBT, v.Name)
		}
		x.index[v.Name] = i
	}
	x.startDate = int64(binary.LittleEndian.Uint64(head[headerSize:]))
	x.startTime = math.Float64frombits(binary.LittleEndian.Uint64(head[headerSize+8:]))
	x.endTime = math.Float64frombits(binary.LittleEndian.Uint64(head[headerSize+16:]))
	n := int((size - data) / int64(h.BufLen))
	if rc := int(le32(head, headerSize+28)); rc > 0 && rc < n {
		n = rc
	}
	x.records = n
	if x.yaml == "" || n <= 0 {
		f.Close()
		return nil, fmt.Errorf("%w: no samples", errBadIBT)
	}
	if _, err := f.Seek(data, io.SeekStart); err != nil {
		f.Close()
		return nil, err
	}
	return x, nil
}

func (x *ibtFile) Close() error { return x.f.Close() }

// ibtReader reads the samples in order
type ibtReader struct {
	x   *ibtFile
	rd  *bufio.Reader
	buf []byte
	n   int
	err error // a read that failed (not the end of the file)
}

func (x *ibtFile) reader() *ibtReader {
	return &ibtReader{x: x, rd: bufio.NewReaderSize(x.f, 256<<10), buf: make([]byte, x.hdr.BufLen)}
}

// next reads the next sample; false at the end of the file
func (r *ibtReader) next() bool {
	if r.n >= r.x.records {
		return false
	}
	if _, err := io.ReadFull(r.rd, r.buf); err != nil {
		if !errors.Is(err, io.EOF) && !errors.Is(err, io.ErrUnexpectedEOF) {
			r.err = err
		}
		return false
	}
	r.n++
	return true
}

// nums: the values of these variables in the current sample, as telNums reads them from the game (0 when missing)
func (r *ibtReader) nums(names []string, out []float64) {
	for k, n := range names {
		out[k] = 0
		if i, ok := r.x.index[n]; ok {
			v := r.x.vars[i]
			out[k] = toF(decodeOne(v.typ, r.buf, v.offset))
		}
	}
}

// array: every element of an array variable (nil when the file does not have it)
func (r *ibtReader) array(name string) []float64 {
	i, ok := r.x.index[name]
	if !ok {
		return nil
	}
	v := r.x.vars[i]
	out := make([]float64, v.Count)
	for k := range out {
		out[k] = toF(decodeOne(v.typ, r.buf, v.offset+k*typeSize[v.typ]))
	}
	return out
}
