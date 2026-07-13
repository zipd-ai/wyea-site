# WYEA — Company Site

Marketing site for **Whittle and Ye Engineering Associates LLC** (WYEA):
catered software for Orange County law firms, cutting-edge tech, white-glove
service.

A single self-contained `index.html` (CSS inlined, renders styled from any
viewer) plus a small Cloudflare Worker (`worker.js`) behind the contact form.
No build step, no dependencies.

## Contact form

`POST /api/contact` (worker.js) validates, de-duplicates, stores the lead in
D1 (`wyea-leads`, schema in `schema.sql`), and emails it via Resend. The
recipient address lives only in the `CONTACT_EMAIL` secret — never in the
page or the repo. De-duplication is two-layer: a per-page-load idempotency
token (double-clicks/retries) and a hash of email + message (repeat
inquiries); both are `UNIQUE` columns, and a duplicate reads as success.
Spam: honeypot field always; Turnstile once `TURNSTILE_SITEKEY` (index.html)
and the `TURNSTILE_SECRET` secret are set — the Worker skips verification
until then.

## Run locally

```
npx wrangler dev --port 8080
npx wrangler d1 execute wyea-leads --file schema.sql   # once, local DB
```

Then open http://localhost:8080. Without secrets configured, submissions
store locally and skip the email — the form still works end to end.

## Deploy (Cloudflare)

One-time setup:

```
npx wrangler login
npx wrangler d1 create wyea-leads        # paste the id into wrangler.jsonc
npx wrangler d1 execute wyea-leads --file schema.sql --remote
npx wrangler secret put CONTACT_EMAIL    # where leads are delivered
npx wrangler secret put RESEND_API_KEY   # resend.com API key
npx wrangler secret put TURNSTILE_SECRET # optional, with the sitekey in index.html
```

Then `npx wrangler deploy`. Reading the lead log:

```
npx wrangler d1 execute wyea-leads --remote \
  --command "SELECT created_at, name, firm, email, emailed FROM submissions ORDER BY id DESC LIMIT 20"
```

## Before going live

The case study intentionally does not name the client firm — get the firm's
written OK before naming them.
