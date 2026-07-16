# Operator commands for The Brief. No credentials needed: the deployed
# Worker sends with the Resend key in its secret store, authorized by
# single-use operator tokens minted through your wrangler login (run
# `npx wrangler login` once per machine). Only test-send needs a local
# RESEND_API_KEY (env or gitignored .env). ISSUE defaults to the newest
# committed issue; override with ISSUE=brief/issues/The-Brief-YYYY-MM-DD.md.

ISSUE ?= $(shell ls brief/issues/The-Brief-????-??-??.md 2>/dev/null | sort | tail -1)

.PHONY: send test-send dry-run check-issue

# The Wednesday button: preview + count, one y/N, then the real send.
# Rerunning after a failure is safe — already-sent recipients are skipped.
send: check-issue
	node send-issue.mjs "$(ISSUE)" --dry-run
	@printf 'Send "$(ISSUE)" to the recipients counted above? [y/N] '; \
	read answer; [ "$$answer" = "y" ] || { echo "not sent."; exit 1; }
	node send-issue.mjs "$(ISSUE)"

# Render + count only; writes brief/issues/<issue>.preview.html
dry-run: check-issue
	node send-issue.mjs "$(ISSUE)" --dry-run

# Send the issue to one address only:  make test-send TEST=you@example.com
test-send: check-issue
	@[ -n "$(TEST)" ] || { echo "usage: make test-send TEST=you@example.com"; exit 1; }
	node send-issue.mjs "$(ISSUE)" --test "$(TEST)"

check-issue:
	@[ -n "$(ISSUE)" ] || { echo "no issue found in brief/issues/ — save the markdown there first"; exit 1; }

# Verify the append-only subscriber audit chain (subscriber_events).
.PHONY: audit-verify
audit-verify:
	node audit.mjs verify
