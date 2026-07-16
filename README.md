# WYEA — Company Site

Marketing site for **Whittle and Ye Engineering Associates LLC** (WYEA):
catered software for Orange County law firms, cutting-edge tech, white-glove
service.

A single self-contained `index.html` (CSS inlined, renders styled from any
viewer) plus a small Cloudflare Worker (`worker.js`) behind the contact form
and The Brief, our weekly newsletter (`brief.js`). No build step, no
dependencies.

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

## The Brief (newsletter)

Free weekly legal newsletter, self-hosted: the list lives in our D1 database
(`subscribers` in `schema.sql`), sends go through Resend from
`brief@wyea.ai`. Never pitch in it — The Brief is a give, the product sells
through the prototype path.

- **Subscribe** (`POST /api/subscribe`, brief.js) is double opt-in: the row is
  pending until the emailed confirm link (`/brief/confirm?t=…`) is clicked.
  Honeypot + per-IP rate limit + a 10-minute per-address email cooldown.
  Placements: `/brief` and the homepage footer band; each records a `source`.
- **Unsubscribe** is one click (`/brief/unsubscribe?t=…`, also RFC 8058
  one-click POST). Rows are never deleted — `unsubscribed_at` is the
  suppression list.
- **Pages** are Worker-rendered: `/brief` (subscribe + format sample +
  archive) and `/brief/YYYY-MM-DD` (an issue, rendered from its markdown).
  `run_worker_first` in wrangler.jsonc keeps the SPA fallback from
  swallowing them.

**Publish an issue** (Wednesdays, after the review draft is approved):

1. Save the markdown as `brief/issues/The-Brief-YYYY-MM-DD.md` and add
   `{"date": "YYYY-MM-DD"}` to `brief/issues/index.json`.
2. PR + merge to main (auto-deploys). Check `https://wyea.ai/brief/YYYY-MM-DD`.
3. Send: `RESEND_API_KEY=… node send-issue.mjs brief/issues/The-Brief-YYYY-MM-DD.md`
   (`--dry-run` first to preview; `--test you@x.com` for a single test send).
   The script adds the personalized unsubscribe link, one-click unsubscribe
   headers, and the CAN-SPAM footer. Set the physical postal address in
   `send-issue.mjs` before the first real send.

**Source tracking**: link placements as `https://wyea.ai/brief?src=email-sig`
(`src` lands in the `source` column: `email-sig`, `linkedin`, `breakup`, …).
Channel numbers for the sales tracker:

```
npx wrangler d1 execute wyea-leads --remote --command "
  SELECT source,
         COUNT(*) AS subscribes,
         SUM(confirmed_at IS NOT NULL) AS confirmed,
         SUM(unsubscribed_at IS NOT NULL) AS unsubscribed
  FROM subscribers GROUP BY source ORDER BY subscribes DESC"
```

## Run locally

```
npx wrangler dev --port 8080
npx wrangler d1 execute wyea-leads --file schema.sql   # once, local DB
```

Then open http://localhost:8080. Without secrets configured, submissions
store locally and skip the email — the contact form still works end to end,
and newsletter confirm links print to the wrangler console instead of
sending.

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
