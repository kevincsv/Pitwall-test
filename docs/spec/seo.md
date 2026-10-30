# SEO and public pages

How this part of Pitlane HQ behaves. Read it before changing this area; keep it up to date when the behaviour changes.

- SEO: index.html has the title, a short plain description (both naming iRacing and Le Mans Ultimate), Open Graph/Twitter
  cards (`og.png`, and `og-es.png`/`og-pt.png` for the Spanish and Portuguese public pages) and JSON-LD (SoftwareApplication,
  WebSite and Organization, never a rating); robots.txt is in web/dist (it lets robots read `/community/leagues/found`,
  which the landing shows). Descriptions are short and plain, never hype. The public pages (`cloud/src/seo.js`, plain HTML,
  English, Spanish and Portuguese, each naming the other two with hreflang (`pt-BR`) and x-default): for iRacing
  /iracing-telemetry, /es/telemetria-iracing and /pt/telemetria-iracing and the overlays (/iracing-overlays,
  /es/overlays-iracing, /pt/overlays-iracing); for Le Mans Ultimate (beta) /le-mans-ultimate-telemetry,
  /es/telemetria-le-mans-ultimate, /pt/telemetria-le-mans-ultimate and /le-mans-ultimate-overlays,
  /es/overlays-le-mans-ultimate, /pt/overlays-le-mans-ultimate (short addresses such as /lmu, /lmu-telemetry,
  /lmu-overlays, /lmu-coach go there with 301); the guides (`seo-topics.js`, one page per thing people search for, each in
  the three languages, linked at the foot of every public page and in the app's <noscript>: the coach, comparing laps,
  braking points, the racing line, the iRating, the shift beep, telemetry on the phone, free telemetry, and the Le Mans
  Ultimate coach /le-mans-ultimate-coach; the iRacing guides that work in Le Mans Ultimate say so and link its page, the
  iRating one stays iRacing only); /records, /es/records and /pt/records, one page per car and track (BreadcrumbList; the
  records index an ItemList and a FAQPage; the landings WebSite, Organization, SoftwareApplication and FAQPage; every
  guide and overlays page a SoftwareApplication with its screenshots); Le Mans Ultimate's records
  (/le-mans-ultimate-records, /es/records-le-mans-ultimate, /pt/recordes-le-mans-ultimate, its cars and tracks under
  /records/lmu/<track>-<car>/<slug>, never mixed with iRacing's ids) and leagues (/le-mans-ultimate-leagues,
  /es/ligas-le-mans-ultimate, /pt/ligas-le-mans-ultimate) exist only while there is something to show: else a real 404,
  no link to them and nothing in the sitemap. A league discipline page with fewer than 3 leagues (`LG_MIN`) is shown but
  noindex and left out of the sitemap; league pages carry no ItemList (their leagues are not pages of the site) and the
  app's links from them are nofollow. The pages show the app's screenshots (`landing/<lang>/`, with width and height,
  lazy), keep their whole style inline, load the fonts without blocking (`media="print"` swapped on load), and are
  kept at the edge (Cache API) for their max-age with an ETag (304); the landing's pictures and the og images are cached
  a day. No text on them joins two phrases with a colon, and titles stay near 60 characters, each its own (a record
  page names the game in full, then as "LMU", then not at all while its car and track do not fit, `recTitle`; one
  driver's record says it is the only lap). A Le Mans Ultimate page promises only what the game gives (no pit lane
  limit, the rivals' positions about five times a second), the Le Mans Ultimate pages name the shared guides without
  "iRacing" (`LMU_TOO_H`), the league pages say their leagues are found on Reddit, and the 404 page has no canonical.
  `cloud/test/seo.test.mjs` draws every page in the three languages and checks the titles, descriptions, canonical,
  hreflang, JSON-LD, links, sitemap and index.html's head and <noscript>. The sitemap carries every language
  (xhtml:link) and a lastmod everywhere (`SEO_DATE` for the pages without data); IndexNow sends every page again when
  SEO_VER changes; the app's "/" has its doctype, no hreflang of its own (it is the brand's page; the landings carry the
  language set) and a <noscript> with crawlable links after an explicit `</head><body>` (never before the head's tags, never
  inside the head, where a browser reads it as text) (one canonical address, 301 for any other such as /index.html, a real
  404 page for any address that does not exist, never the app or the lap viewer with 200; the viewer is noindex), the
  sitemap made by the server, IndexNow once a day. www.pitlanehq.app is a custom domain of the Worker
  (made by the deploy) that answers 301 to pitlanehq.app.
  Titles, descriptions and texts name the brand as people search it (Pitlane HQ, PitlaneHQ; `alternateName` in the
  JSON-LD) and what it is (iRacing and Le Mans Ultimate telemetry, sim racing telemetry, lap analysis, overlays), plainly,
  never stuffed, never claiming an iPhone app before it is on the App Store; competitors' names only in a question, never a
  claim about them.
  They show the accounts' nicknames (never their iRacing names), race rivals by their whole name as the game shows it,
  or Anonymous.
