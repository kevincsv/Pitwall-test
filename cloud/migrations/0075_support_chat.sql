-- The support chat behind the floating feedback button (support.js): what a driver writes (the chat, the feedback
-- window and the overlay window) and what Support answers, one conversation per account. read_at stays NULL until the
-- other side read it. support_threads keeps each conversation's last message and its unread counts, so the admin's
-- list, the driver's unread poll and the admin's badge are one read by key or by a small index, never a scan.
CREATE TABLE IF NOT EXISTS support_msgs (
  id TEXT PRIMARY KEY,
  account_id TEXT NOT NULL,         -- the driver's account (Support's replies too)
  from_support INTEGER NOT NULL DEFAULT 0,
  text TEXT NOT NULL,
  created INTEGER NOT NULL,
  read_at INTEGER,                  -- when the other side read it
  rating INTEGER,
  device TEXT,
  v TEXT,
  view TEXT,
  kind TEXT NOT NULL DEFAULT 'chat', -- chat, general (the feedback window), overlays (the overlay window), reply
  style TEXT,
  lang TEXT                          -- the app's language when the driver wrote (the reply's email follows it)
);
CREATE INDEX IF NOT EXISTS support_msgs_acct ON support_msgs(account_id, created);
CREATE INDEX IF NOT EXISTS support_msgs_unread ON support_msgs(account_id, from_support) WHERE read_at IS NULL;

CREATE TABLE IF NOT EXISTS support_threads (
  account_id TEXT PRIMARY KEY,
  last_at INTEGER NOT NULL,
  last_text TEXT NOT NULL,
  last_support INTEGER NOT NULL DEFAULT 0, -- Support wrote the last message
  unread_support INTEGER NOT NULL DEFAULT 0, -- the driver's messages Support has not read
  unread_driver INTEGER NOT NULL DEFAULT 0   -- Support's messages the driver has not read
);
CREATE INDEX IF NOT EXISTS support_threads_last ON support_threads(last_at DESC);
CREATE INDEX IF NOT EXISTS support_threads_unread ON support_threads(unread_support) WHERE unread_support > 0;

-- what the drivers sent before through the feedback windows, so they see it in the chat
INSERT OR IGNORE INTO support_msgs (id, account_id, from_support, text, created, rating, device, v, view, kind, style)
  SELECT id, account_id, 0, text, created, rating, device, v, view, COALESCE(kind, 'general'), style FROM feedback;
INSERT OR REPLACE INTO support_threads (account_id, last_at, last_text, last_support, unread_support, unread_driver)
  SELECT m.account_id, m.created, substr(m.text, 1, 200), m.from_support,
    (SELECT COUNT(*) FROM support_msgs u WHERE u.account_id=m.account_id AND u.from_support=0 AND u.read_at IS NULL),
    (SELECT COUNT(*) FROM support_msgs u WHERE u.account_id=m.account_id AND u.from_support=1 AND u.read_at IS NULL)
  FROM support_msgs m
  WHERE m.created = (SELECT MAX(created) FROM support_msgs x WHERE x.account_id=m.account_id)
  GROUP BY m.account_id;
