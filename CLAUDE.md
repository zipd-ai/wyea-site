# WYEA website

## What this site is
WYEA builds firm-owned document engines for specialty insurers, MGAs and program administrators. Insurance only.
Brief: @docs/brief/WYEA_Website_Brief_2026-09-27.md
Decisions override the brief: @docs/brief/decisions.md

## Hard rules
- IMPORTANT: Never name any client or prospect, or use anything from a client engagement. Every example is invented and labeled invented.
- No em dashes or en dashes anywhere: copy, titles, meta, alt text, schema.
- Held (Anderson, 2026-10-08): SOC 2, ISO 27001, independent penetration test, MFA, encryption in transit and at rest. Never claim hosting in a client's cloud or on premises, customer-managed keys, automated export or deletion, or a client-readable support-access log; and never publish a list of what is not held.
- Every statistic links to a source page that opens. No source, no statistic.
- No customer logos, testimonials, customer metrics or case studies.
- "Enterprise" names the audience only. Never "enterprise-grade".
- No hype words: revolutionary, cutting-edge, AI-powered, seamless, unlock, leverage, robust, game-changer.
- Every "Book a demo" links to /demo (the funnel: role, company size, problem, contact), which then offers the booking link (https://calendar.app.google/hMuBjTub3YHa9rKT7). Do not link the calendar directly or change it, or the contact form fields.

## How to work
- Use design tokens and components from the design system: `styles.css` (tokens at the top), usage notes in `docs/design-system.md`, live reference at `/design-system`. Never hard-code colors, sizes or spacing in a page; a `style` attribute fails the build.
- Header, footer and contact form are partials in `partials/`. Edit the partial, then run the build.
- Before saying a change works, run the check and show the output.
- Commands: install: none (no dependencies). Dev: `npm run dev` (wrangler on :8080). Build: `npm run build` (syncs partials, then checks dashes, titles, canonicals, sitemap, links, JSON-LD, inline styles). Check only: `npm run check`. Contrast: `npm run contrast`. There is no test or lint step; the full gate list is docs/ship-checklist.md.
- A new indexable page needs an entry in the sitemap list in worker.js and a line in llms.txt.
- When compacting, keep the list of modified files and the open decisions.
