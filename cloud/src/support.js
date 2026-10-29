// The support chat behind the floating feedback button (migration 0075, the pure part in supportlib.js). One
// conversation per account: the driver's messages (the chat, and the feedback and overlay windows' answers, which
// usage.js adds too) and Support's replies, shown to the driver as "Pitlane HQ Support", never an admin's name.
//
// GET  /community/support (signed in)  {msgs: [{id, me, text, created, kind, rating?}], unread}  the oldest first;
//   reading it marks Support's messages read (unread is how many were unread before)
// POST /community/support (signed in)  {text, device, v, view, lang}  → {ok, msg}  emailed to support@, 20 a day
// GET  /community/support/unread (signed in)  {n, last?, at?}  Support's messages the driver has not read (one row by
//   key) and, when there are, Support's last message (its first 200 characters) and when it was written
// GET  /community/admin/support (admins)  {items: [{accountId, nick, last, lastAt, lastSupport, unread}], unread}
//   the conversations, the newest first; unread is how many have driver messages Support has not read
// GET  /community/admin/support/unread (admins)  {n}  conversations with driver messages Support has not read
// GET  /community/admin/support/:accountId (admins)  {accountId, nick, gone, msgs: [{id, support, text, created, read,
//   rating, device, v, view, kind, style}]}  marks the driver's messages read by Support
// POST /community/admin/support/:accountId (admins)  {text}  → {ok, msg, mailed}  a reply as Support, emailed to the
//   driver when the server keeps their email, in the language they last wrote in
import { sessionAccount, isAdmin } from "./accounts.js";
import { openEscrow } from "./escrow.js";
import { sendSupportChat, sendSupportReply } from "./email.js";
import { handleSupport } from "./supportlib.js";

export const supportRoute = (req, env, url) => handleSupport(req, env, url, { sessionAccount, isAdmin, openEscrow, sendSupportChat, sendSupportReply });
