package main

// iRacing news: the PC reads the public news feed of iracing.com (RSS) and
// keeps it for 30 minutes, so the app can show it without the browser
// fetching another site.

import (
	"encoding/xml"
	"errors"
	"fmt"
	"html"
	"io"
	"net/http"
	"regexp"
	"strings"
	"sync"
	"time"
)

var newsFeeds = []string{"https://www.iracing.com/feed/"}

type newsItem struct {
	Title   string   `json:"title"`
	Link    string   `json:"link"`
	Date    int64    `json:"date"`
	Summary string   `json:"summary"`
	Image   string   `json:"image,omitempty"`
	Tags    []string `json:"tags,omitempty"`
}

var (
	newsMu    sync.Mutex
	newsCache []newsItem
	newsAt    time.Time
	newsErr   string
	tagRe     = regexp.MustCompile(`<[^>]+>`)
	imgRe     = regexp.MustCompile(`<img[^>]+src="([^"]+)"`)
)

type rssDoc struct {
	Items []struct {
		Title    string   `xml:"title"`
		Link     string   `xml:"link"`
		PubDate  string   `xml:"pubDate"`
		Desc     string   `xml:"description"`
		Content  string   `xml:"http://purl.org/rss/1.0/modules/content/ encoded"`
		Category []string `xml:"category"`
		Encl     struct {
			URL  string `xml:"url,attr"`
			Type string `xml:"type,attr"`
		} `xml:"enclosure"`
		Media struct {
			URL string `xml:"url,attr"`
		} `xml:"http://search.yahoo.com/mrss/ content"`
	} `xml:"channel>item"`
}

func plain(s string, max int) string {
	s = html.UnescapeString(tagRe.ReplaceAllString(s, " "))
	s = strings.Join(strings.Fields(s), " ")
	if r := []rune(s); len(r) > max {
		s = strings.TrimSpace(string(r[:max])) + "…"
	}
	return s
}

func parseNews(b []byte) ([]newsItem, error) {
	var d rssDoc
	if err := xml.Unmarshal(b, &d); err != nil {
		return nil, errors.New("the news feed could not be read")
	}
	var out []newsItem
	for _, it := range d.Items {
		if !strings.HasPrefix(it.Link, "https://") {
			continue
		}
		n := newsItem{Title: plain(it.Title, 200), Link: strings.TrimSpace(it.Link), Summary: plain(it.Desc, 320), Tags: it.Category}
		if t, err := time.Parse(time.RFC1123Z, strings.TrimSpace(it.PubDate)); err == nil {
			n.Date = t.UnixMilli()
		} else if t, err := time.Parse(time.RFC1123, strings.TrimSpace(it.PubDate)); err == nil {
			n.Date = t.UnixMilli()
		}
		for _, u := range []string{it.Media.URL, it.Encl.URL} {
			if strings.HasPrefix(u, "https://") && n.Image == "" {
				n.Image = u
			}
		}
		if n.Image == "" {
			if m := imgRe.FindStringSubmatch(it.Content + it.Desc); m != nil && strings.HasPrefix(m[1], "https://") {
				n.Image = html.UnescapeString(m[1])
			}
		}
		out = append(out, n)
	}
	return out, nil
}

func fetchNews(force bool) ([]newsItem, error) {
	newsMu.Lock()
	if !force && time.Since(newsAt) < 30*time.Minute && newsCache != nil {
		defer newsMu.Unlock()
		return newsCache, nil
	}
	newsMu.Unlock()
	var all []newsItem
	var lastErr error
	cl := &http.Client{Timeout: 20 * time.Second}
	for _, f := range newsFeeds {
		req, _ := http.NewRequest("GET", f, nil)
		req.Header.Set("User-Agent", "Pitlane HQ/"+appVersion)
		resp, err := cl.Do(req)
		if err != nil {
			lastErr = fmt.Errorf("could not reach iracing.com: %w", err)
			continue
		}
		b, _ := io.ReadAll(io.LimitReader(resp.Body, 4<<20))
		resp.Body.Close()
		if resp.StatusCode != 200 {
			lastErr = fmt.Errorf("iracing.com answered HTTP %d", resp.StatusCode)
			continue
		}
		items, err := parseNews(b)
		if err != nil {
			lastErr = err
			continue
		}
		all = append(all, items...)
	}
	newsMu.Lock()
	defer newsMu.Unlock()
	if len(all) == 0 && lastErr != nil {
		newsErr = lastErr.Error()
		if newsCache != nil {
			return newsCache, nil
		}
		return nil, lastErr
	}
	newsCache, newsAt, newsErr = all, time.Now(), ""
	return all, nil
}

func registerNewsRoutes(mux *http.ServeMux) {
	mux.HandleFunc("/api/news", func(w http.ResponseWriter, r *http.Request) {
		items, err := fetchNews(r.URL.Query().Get("refresh") == "1")
		if err != nil {
			w.WriteHeader(502)
			writeJSON(w, map[string]string{"error": err.Error()})
			return
		}
		writeJSON(w, map[string]any{"items": items, "source": "iracing.com"})
	})
}
