# Leagues hub

How this part of Pitlane HQ behaves. Read it before changing this area; keep it up to date when the behaviour changes.

- Leagues are a hub of posts (Community → Leagues on the web, the PC and the phones; `LEAG`/`leagCard`/`leagOpen` in
  index.html, `LeagueHub` on the phones, `/community/leagues` in community.js, migration 0033): a league post has the
  days it races (`days`, 0 Monday … 6 Sunday), the usual start (`time`) in its own time zone (`tz`, the browser's or
  phone's when posted), one or several disciplines (`cats`; several = "Mixed"), an optional Discord invite and website
  (one of the two at least), the cars, the language, "looking for drivers" (`open`) and what the creator writes.
  Every card shows a week strip, the start in the league's zone and in the viewer's, the next race (`leagNext`,
  `leagueNext`: the first of its days at its time, a race under way counts) and sorts by it; filters by discipline,
  day, open and search. A post opened counts a view and its Discord or website a click, once per viewer and day
  (`league_hits`, the account or a hash of network and browser), never the creator's own; only the creator (and the
  admins) see the counts and the last 14 days (`league_days`). A post has a link (pitlanehq.app/app?league=id,
  opened on arrival) and, on the web, an .ics of its weekly race. The hub is released, never labelled "in development". The hub's "Most active leagues" (`cloud/src/leaguescan.js`, migration 0047, `/community/leagues/found`,
  `drawLeagFound`): every six hours the server reads the public feeds of r/iRacing and r/iRacingLeagues (two requests,
  Reddit's application-only OAuth when REDDIT_CLIENT_ID/SECRET are set), keeps the posts of leagues with a Discord
  invite and asks Discord's public invite counts how many members each has and how many are online; the most active
  show (online now, then members, at least 5 online, a post in the last 60 days) with the post's link and when it was
  last read; admins hide one, edit its name, text and disciplines (`editFound`, `edit` on the row, migration 0050: the six-hourly read never undoes it, "Put back" returns to the post's), read now or add a league by its Discord invite (`addFound`, sub "manual": never
  expires, shows whoever is online; FSRS by migration 0048). The hub is open to everyone (`LEAGUES_OPEN = "1"` in wrangler.toml) and the most active leagues are public (GET
  `/community/leagues/found` needs no account): Home's "Private leagues for you" (`homeLeagHTML`, three of the discipline you
  race most), the landing's "Find your league" (six cards, "See every league", "Post your league for free" and a line
  under the hero buttons, which lead to creating the account and then the hub's form) and the public pages
  /iracing-leagues, /es/ligas-iracing and /pt/ligas-iracing (`leaguesPage` in seo.js: the leagues posted in the hub with
  their days and start, then the most active ones; one page per discipline, /iracing-leagues/oval, /es/ligas-iracing/ovalo…,
  only for a discipline with leagues; in the sitemap, the footers, the landings' guides and the app's <noscript>).
  Never iRacing's members site (its terms forbid scraping) nor another
  directory's data without its permission. Up to 3 leagues per driver, 10 for a supporter (Patreon or by hand; `LEAGUES_FREE`/`LEAGUES_SUPPORTER`,
  `limit` in the list): under "Post the league" the form says how many you have posted and, to the rest, that supporters
  post up to 10, with a small "♥ Support on Patreon" link.
