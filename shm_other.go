//go:build !windows

package main

import (
	"errors"
	"time"
)

// iRacing only runs on Windows; elsewhere the bridge can only serve demo data.
type simSource struct{}

func newSimSource() Source              { return &simSource{} }
func (s *simSource) Name() string       { return "iracing" }
func (s *simSource) Open() error        { return errors.New("iRacing telemetry is only available on Windows") }
func (s *simSource) Mem() []byte        { return nil }
func (s *simSource) Wait(time.Duration) {}
func (s *simSource) Close()             {}
