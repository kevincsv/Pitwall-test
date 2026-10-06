package main

// lmuView is the game's LMU_Data mapping (or, for tests, a recorded copy).
type lmuView interface {
	Bytes() []byte
	Close()
}
