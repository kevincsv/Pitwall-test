# Emails and logo

How this part of Pitlane HQ behaves. Read it before changing this area; keep it up to date when the behaviour changes.

- Emails go through Resend only (domain pitlanehq.app, its records on `send.` and `resend._domainkey`, secret
  RESEND_API_KEY; no SMTP or Proton any more). What people write to support@ (the Reply-To of every email) arrives by
  Cloudflare Email Routing (its MX). Admin → Server shows the last emails (Resend's delivery state) and checks the
  domain's Resend DKIM, send. records, SPF (one, no Proton), the Email Routing MX, DMARC and BIMI
  (`web/dist/bimi.svg`, the logo in SVG Tiny PS, needs DMARC at quarantine).
- The logo is the rev gauge with a kerb in the rev limit (`assets/logo.svg`, the master; `web/dist/logo.svg`).
  Its PNGs and ICOs (web/dist icons, assets/pitlanehq.ico and -1024.png, the phone apps' launcher icons)
  are rendered from it; the phone icons are the full square (no transparent corners).
- Emails look like the app (`mailHTML` in email.js: the logo from pitlanehq.app/icon-192.png, the dark
  card, the amber button), tables and inline styles only.
- The weekly email (`cloud/src/digest.js`, the pure part in `digestlib.js`, migration 0080 `digest_subs`): Account →
  "Weekly email" On/Off on every device (`loadDigest` in index.html, GET/POST `/community/digest` {on, lang}; the app's
  language when it is turned on is the email's). On Monday from 07:00 UTC each hourly run sends it to up to 40 drivers
  whose last week went out 5 days ago or more (`sendDigests`): the sessions, laps and time on track of the last seven
  days, the races with the top 5s and the best finish, and up to three new personal bests (a car and track whose best of
  the week beats every week before, `SQL_PBS`; a first time there is none). A week without driving sends nothing. Its
  last line turns it off without signing in (GET `/community/digest/off?a=&t=`, `t` the server's HMAC of the account).
  Deleting the account deletes it.
