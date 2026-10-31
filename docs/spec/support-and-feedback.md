# Support chat and feedback windows

How this part of Pitlane HQ behaves. Read it before changing this area; keep it up to date when the behaviour changes.

- "Share your feedback" (the window that asks by itself, PC app and web only): a window with a text box, 1 to 5 optional stars, Send and Not now
  (`feedbackAsk` in index.html). The server says when (GET `/community/feedback/ask` → {ask}: six hours of use, the
  usage batches' ms, or two race sessions uploaded since it was last shown; `feedback_ask` per account, so the devices
  never ask twice, its clock starting the first time the account asks). The page asks 3 minutes after it opens and every 10
  minutes, never in the car (the PC while the car is on track), in demo data, from an overlay window, over another window
  or to an admin in admin mode; shown, it is marked at once (POST `/community/feedback/seen`), so Not now waits six more
  hours of use or two races. "Send feedback" is always in Settings → About and the inbox, and a round floating
  button with a square speech bubble sits at the bottom right of every screen (its menu: "Send feedback", the stars and the text as often as they like, or "Chat with support", `fbMenu`; an admin in admin mode goes straight to the support inbox) ("Support", `fbFab` in index.html, counted
  `act:feedback_button`; PC app, web and phones): signed in only, never for a visitor, in an overlay window or in demo
  data, hidden while the car is on the track and under any open window, a toast or the voice call's bar, above the
  phone-width tab bar. It opens the support chat (`supportOpen`/`SUP` in index.html, `cloud/src/support.js`, the routes
  and statements in `supportlib.js`, migration 0075 `support_msgs` and `support_threads`, which brought in every answer
  of before): one conversation per account, the window "Support" (filling a phone's screen), the driver's messages on the
  right, Support's on the left as "Pitlane HQ Support" (never an admin's name), the newest at the bottom, Enter sends and
  Shift+Enter is a new line, "Write to us. We answer here." while empty. What the feedback and overlay windows send is a
  message of the chat too (POST `/community/feedback` adds it). GET `/community/support` {msgs [{id, me, text, created,
  kind, rating?}], unread} marks Support's replies read; POST `/community/support` {text, device, v, view, lang} (20 a
  day) emails support@ ("Support chat · nick", Reply-To the driver's email from the escrow); GET
  `/community/support/unread` {n, last?, at?} is one row by key, polled every 2 minutes while the page is on the screen
  (and the phones the same). The button carries the count of Support's replies not read ("1"… "9+", amber like the
  inbox's), and a reply not read is an inbox notice "Support replied" with its first line, both cleared when the chat
  opens. For an admin with admin mode on the button opens the support inbox and counts the conversations with messages
  not read (GET `/community/admin/support` {items [{accountId, nick, last, lastAt, lastSupport, unread}], unread}, GET
  `/community/admin/support/unread` {n}): a conversation (GET `/community/admin/support/:id` {accountId, nick, gone,
  msgs [{id, support, text, created, read, rating, device, v, view, kind, style}]}, marking the driver's read) with the
  driver's profile and the reply box (POST `/community/admin/support/:id` {text} → {ok, mailed, msg}: a reply as
  Support, emailed to the driver in the language they last wrote in, "Pitlane HQ Support replied" with "Open Pitlane HQ"
  to pitlanehq.app/app?support=1, which opens the chat on arrival; ?support=<account> opens that conversation for an
  admin, the link of support@'s email). The admin page's Feedback tab has "Open the support chat" on every answer.
  Counted `act:support_open`, `act:support_sent`, `act:support_reply`; deleting an account deletes its conversation. POST `/community/feedback`
  {text 1–4000, rating 1–5 or none, device, v, view} keeps it (`feedback`, 20 a day per account) and emails it through
  Resend to support@pitlanehq.app (`sendFeedback` in email.js: the nickname, account id, device, version, stars, where it
  was asked and the text; Reply-To the driver's email when the server keeps one in the escrow, else support@). The
  overlay window (the PC only, "How are the overlays?", the stars, the text box and the overlay design used, "Design ·
  Classic"): a race of iRacing or Le Mans Ultimate (vs AI too, never in demo data) that ends or is left with an overlay
  open goes to the server once (the agent's `reportOvRace` in ovfeedback.go, POST `/community/feedback/ovrace` {style,
  ovs, game, sid}, the same session counted once; `style` is `ui.ovstyle`, else the default design, a free name matching
  `^[a-z0-9_-]{1,20}$` so new designs come beside the old one), and the page checks a moment later once the car is off
  the track (the "ovrace" notice, `fbOvSoon`). The ask answers `ov` after the first such race and, once answered, every
  six (`ov_races`, `ov_answered`, `ov_last_style` on `feedback_ask`, migration 0073); shown, it is marked at once (POST
  `/community/feedback/seen` {kind: "overlays"}). The same blocking rules as the general window, and when both are due
  only the overlay one shows. Its answers are `kind` "overlays" with their `style` (`feedback`, the general ones
  "general") and their email says so. GET `/community/admin/feedback` (admins) lists them, the newest first, with the
  count and the average stars; the Feedback tab tags the overlay answers ("Overlays · Classic") and filters All, General
  and Overlays. Deleting an
  account deletes its usage and its feedback.
- "Send the agent's logs" (the PC app only, under the chat's box, `supLogsOk`): the agent sends the end of its log
  (400 KB, the older file first when the current one is short, with a line naming the agent's version, the game and
  whether Le Mans Ultimate runs; `logTail` in reports.go, local POST `/api/support/logs`) to POST
  `/community/support/logs` {text ≤ 512 KB, device, v} (3 a day, `support_logs`, migration 0079), which adds "Logs sent,
  N KB" to the chat (kind "logs", view "log:<id>"). In the support inbox an admin opens it ("Open the logs", GET
  `/community/admin/support/logs/:id`, Copy and Download). Logs older than 30 days go, and deleting the account deletes
  them. The phones send their own log the same way.
