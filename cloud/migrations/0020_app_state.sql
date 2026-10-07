-- small server facts the admins look at (the last email error, the last email sent)
CREATE TABLE IF NOT EXISTS app_state (
  k TEXT PRIMARY KEY,
  v TEXT,
  at INTEGER NOT NULL
);
