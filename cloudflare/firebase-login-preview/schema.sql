CREATE TABLE IF NOT EXISTS session (
  digest TEXT PRIMARY KEY,
  uid TEXT NOT NULL,
  expires_at INTEGER NOT NULL
) STRICT;

CREATE INDEX IF NOT EXISTS session_expiry ON session (expires_at);

CREATE TABLE IF NOT EXISTS login_window (
  address TEXT PRIMARY KEY,
  started_at INTEGER NOT NULL,
  attempts INTEGER NOT NULL
) STRICT;

CREATE INDEX IF NOT EXISTS login_window_start ON login_window (started_at);
