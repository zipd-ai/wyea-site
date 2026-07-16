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

-- Subscribers for The Brief (the weekly newsletter — brief.js). Double
-- opt-in: a row is pending until confirmed_at is set via the emailed confirm
-- link. Rows are never deleted: unsubscribed_at set = suppressed, so an
-- unsubscribe is never forgotten (CAN-SPAM suppression list).
CREATE TABLE IF NOT EXISTS subscribers (
  id                INTEGER PRIMARY KEY AUTOINCREMENT,
  email             TEXT NOT NULL UNIQUE,
  source            TEXT,               -- placement that captured the subscribe: brief-page, homepage-footer, email-sig, ...
  confirm_token     TEXT NOT NULL UNIQUE,
  unsubscribe_token TEXT NOT NULL UNIQUE,
  ip                TEXT,
  created_at        TEXT NOT NULL DEFAULT (datetime('now')),
  confirm_sent_at   TEXT,               -- last confirm/notice email, throttles resends
  confirmed_at      TEXT,
  unsubscribed_at   TEXT
);

CREATE INDEX IF NOT EXISTS idx_subscribers_ip_time ON subscribers (ip, created_at);

-- Single-use operator tokens authorizing a Worker-side blast
-- (POST /api/brief/blast). Minted by send-issue.mjs through wrangler, so the
-- ability to write to the production database IS the operator credential —
-- no long-lived secret exists on the operator's machine. Hashed at rest,
-- consumed on first use, expire after 15 minutes.
CREATE TABLE IF NOT EXISTS operator_tokens (
  id         INTEGER PRIMARY KEY AUTOINCREMENT,
  token_hash TEXT NOT NULL UNIQUE,
  created_at TEXT NOT NULL DEFAULT (datetime('now')),
  used_at    TEXT
);

-- Send log for The Brief: one row per (issue, recipient) accepted by Resend.
-- This is what makes the weekly send idempotent — send-issue.mjs skips
-- anyone already logged for the issue, so a rerun (crash recovery, or a
-- second invocation by mistake) never sends the same issue to the same
-- person twice. It doubles as the delivery record per issue.
CREATE TABLE IF NOT EXISTS issue_sends (
  id      INTEGER PRIMARY KEY AUTOINCREMENT,
  issue   TEXT NOT NULL,               -- issue date, YYYY-MM-DD
  email   TEXT NOT NULL,
  sent_at TEXT NOT NULL DEFAULT (datetime('now')),
  UNIQUE (issue, email)
);
