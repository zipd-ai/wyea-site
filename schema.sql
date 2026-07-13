-- Lead log for the contact form. Apply once per environment:
--   npx wrangler d1 execute wyea-leads --file schema.sql --remote
-- (drop --remote to apply to the local dev database)

CREATE TABLE IF NOT EXISTS submissions (
  id         INTEGER PRIMARY KEY AUTOINCREMENT,
  token      TEXT NOT NULL UNIQUE,  -- per-page-load idempotency token: absorbs double-clicks and retries
  dedup_hash TEXT NOT NULL UNIQUE,  -- sha256(email + normalized message): absorbs repeat inquiries
  name       TEXT NOT NULL,
  firm       TEXT,
  email      TEXT NOT NULL,
  message    TEXT NOT NULL,
  ip         TEXT,
  emailed    INTEGER NOT NULL DEFAULT 0,  -- 1 once the Resend notification succeeded
  created_at TEXT NOT NULL DEFAULT (datetime('now'))
);

CREATE INDEX IF NOT EXISTS idx_submissions_ip_time ON submissions (ip, created_at);
