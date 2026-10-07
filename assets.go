package main

// Small generated assets: QR code for phones, app icons and the web manifest
// that lets Android and iOS install the app on the home screen.

import (
	"bytes"
	"image"
	"image/color"
	"image/png"
	"net/http"
	"strconv"
	"strings"

	qrcode "github.com/skip2/go-qrcode"
)

func registerAssetRoutes(mux *http.ServeMux) {
	mux.HandleFunc("/api/qr.png", func(w http.ResponseWriter, r *http.Request) {
		u := r.URL.Query().Get("u")
		if r.URL.Query().Get("app") == "1" {
			// opens this PC in the phone's browser, paired in one go; only for this PC's own window (it holds the PIN)
			if !isLoopback(r) {
				http.Error(w, "forbidden", 403)
				return
			}
			u = appPairLink()
		}
		if u == "" || len(u) > 600 || !strings.HasPrefix(u, "http") {
			http.Error(w, "bad url", 400)
			return
		}
		b, err := qrcode.Encode(u, qrcode.Medium, 360)
		if err != nil {
			http.Error(w, err.Error(), 500)
			return
		}
		w.Header().Set("Content-Type", "image/png")
		w.Write(b)
	})
	for _, s := range []int{180, 192, 512} {
		size := s
		mux.HandleFunc("/icon-"+strconv.Itoa(size)+".png", func(w http.ResponseWriter, r *http.Request) {
			w.Header().Set("Content-Type", "image/png")
			w.Header().Set("Cache-Control", "max-age=86400")
			w.Write(appIcon(size))
		})
	}
	mux.HandleFunc("/manifest.webmanifest", func(w http.ResponseWriter, r *http.Request) {
		w.Header().Set("Content-Type", "application/manifest+json")
		w.Write([]byte(`{"name":"TrackIQ - Telemetry & Coach","short_name":"TrackIQ","start_url":"/","display":"standalone","orientation":"any","background_color":"#11151b","theme_color":"#11151b","icons":[{"src":"/icon-192.png","sizes":"192x192","type":"image/png"},{"src":"/icon-512.png","sizes":"512x512","type":"image/png","purpose":"any maskable"}]}`))
	})
}

// appIcon draws a chequered flag corner with an amber timing bar on asphalt.
func appIcon(n int) []byte {
	img := image.NewRGBA(image.Rect(0, 0, n, n))
	bg := color.RGBA{0x11, 0x15, 0x1b, 0xff}
	light := color.RGBA{0xe7, 0xeb, 0xf1, 0xff}
	amber := color.RGBA{0xff, 0xb0, 0x2e, 0xff}
	cell := n / 8
	for y := 0; y < n; y++ {
		for x := 0; x < n; x++ {
			c := bg
			cx, cy := x/cell, y/cell
			if cx >= 2 && cx <= 5 && cy >= 2 && cy <= 4 && (cx+cy)%2 == 0 {
				c = light
			}
			if y >= cell*5+cell/2 && y < cell*6+cell/4 && x >= cell*2 && x < cell*6 {
				c = amber
			}
			img.Set(x, y, c)
		}
	}
	var buf bytes.Buffer
	png.Encode(&buf, img)
	return buf.Bytes()
}
