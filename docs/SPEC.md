# wyea.ai rebuild: spec

Written 2026-10-07 from the WYEA Website Rebuild Runbook, docs/brief/decisions.md and docs/audit.md. Decisions override this spec where they differ. The website brief itself is not in the repo yet (see Open decisions).

## Goal

An insurance-only wyea.ai, built from one coded design system, with a page that answers a vendor review. Every page opens by saying what WYEA does and for whom: WYEA builds firm-owned document engines for specialty insurers, MGAs and program administrators.

## Visual direction

Direction A stays: true white ground, ink, oxblood accent, Newsreader display, Public Sans text, square corners, hairline rules, no drop shadows. Items in a set sit under a rule, not inside a box.

Structure follows eudia.com's section order: category headline, proof band, product shown working, four trust pillars, process, security, call to action. Spacing follows glean.com's generous rhythm. Both are structural references only. No asset, color value, wording or layout detail is copied. The proof band is the two principals and the one-week prototype, never customer logos.

## Navigation

Insurers (menu: Overview, Carriers, MGAs and program administrators, Reinsurers and run-off), Platform (menu: Overview, four subpages, Shared product or your own engine), Security, How we work, About, Book a demo.

The header, footer and contact form are partials in `partials/`, synced into every page by `npm run build`.

## Pages

| URL | Action | Purpose | Sections, in order |
|---|---|---|---|
| / | Rewrite | Say what WYEA builds and for whom, and get a demo booked | Hero with the category words; source-answer card; principals band; trust pillars; process timeline; vendor-review teaser; FAQ; call to action |
| /insurance | Rewrite | What the engine does for an insurer | Hero; source-answer card; segment links; documents it works with; what the engine does; barriers insurers name, with a linked statistic and a linked quotation; principals band; the terms; FAQ; further reading; call to action |
| /insurance/carriers | New | Fronting, E&S and specialty carriers | Hero; the paper; what the engine does; stat band; FAQ; call to action |
| /insurance/mgas | New | MGAs and program administrators | Same as carriers |
| /insurance/reinsurers | New | Reinsurers, intermediaries, legacy and run-off | Same as carriers |
| /insurance/* (seven guides) | Keep | Answer-first guides | Article layout; chrome synced |
| /platform and four subpages | Edit | How the engine works | Existing sections; law firm language out (matters, dockets, court record, attorneys) |
| /security | Edit | What is true about security today | Existing sections; vendor-review summary; "Last reviewed" date; not-claimed list kept |
| /security/vendor-review | New | Answer a vendor questionnaire in public | Hero; vendor-review table; not-held list; questionnaire offer; sources |
| /how-we-work | Edit | The engagement, step by step | Insurance only; process timeline; one prototype price line; The Brief signup removed |
| /compare | New | Shared product or a firm-owned engine | Hero; the argument for each; comparison table; when shared fits better; FAQ; call to action |
| /about | Edit | Who builds it | Meta and bios cover insurers; photos; LinkedIn links |
| /custom-ai-for-law-firms | Per decision | Kept live for old links | Unlinked, noindex, out of the sitemap and llms.txt |
| /brief | Per decision | Retired | Already 301 to home |
| /privacy | Keep | | Content untouched; header and footer synced |
| /terms | Keep | Added on main on 2026-09-30 and merged in | Content untouched; header and footer synced |
| /404 | Edit | | Chrome synced; links point at insurance pages |
| /design-system | New | Internal reference | Every token and component, light and dark toggle; noindex, out of nav and sitemap |

The research article for the 551-insurer data is a template only, kept at `docs/templates/research-article.html`, which is never deployed. It is published only on Anderson's approval.

## Components

| Component | Class | Used on | Content rule |
|---|---|---|---|
| Navigation | `.site-header`, `.nav`, `.mega` | Every page | The six entries above |
| Hero | `.hero`, `.hero-sub` | Home, segment pages, interior pages | H1 with the category words; one-sentence subhead; Book a demo and See how it works |
| Source-answer card | `.app` + `.ans` | Home, /insurance | The invented cancellation-notice example: query, matched passages with source lines, the unreadable item flagged, and an "Invented example" label |
| Principals band | `.people` + `.person-photo` | Home, /insurance, /about | Names, roles, one-line credentials, photos. Stands where customer logos would |
| Trust pillars | `.pillars` | Home, /security | Every line opens its source; answers keep their version; one system per insurer; a reviewer signs off |
| Process timeline | `.timeline` | Home, /how-we-work | Call, NDA, prototype, fixed-price scope, build, support. No timeframe is promised |
| Stat band | `.stats` + `cite` | Segment pages, /insurance | Sourced industry statistics only, each linked. Never customer metrics |
| Vendor-review table | `.dtable` | /security/vendor-review | Requirement, source, WYEA today, status |
| Not-held list | `.notheld` | /security, /security/vendor-review | The items /security lists as not claimed yet |
| Comparison table | `.dtable` + `.is-ours` | /compare | Shared product against firm-owned engine, including when shared fits better |
| FAQ | `.faq` | Most pages | Native details; answers in the HTML |
| Call to action band | `.cta-band` | Every page | Booking link unchanged; contact form partial |
| Article layout | `.article-meta`, `.prose`, `.sources` | Guides, research | Byline WYEA, published and updated dates, sources list |
| Footer | `.site-footer` | Every page | WYEA LLC, Newport Beach, California |

Supporting components: `.tile`, `.explorer`, `.vprop`, `.feature`, `.rulelist`, `.ticks`, `.explore`, `.callout`, `.pill`, `.tag-invented`, buttons, forms, interface figures.

## Tokens

One source: the token layer at the top of `styles.css`, exposed as CSS custom properties.

- Color: background, surface, raised surface, text (four steps), border, rule, accent, text on accent, focus ring, ok, flag, warning, inverse band set. Light default; dark through prefers-color-scheme or `data-theme`. Every text pair passes WCAG 2.2 AA; ratios in docs/design-system.md.
- Type: Newsreader display, Public Sans text, system mono for document excerpts. One scale from `--text-2xs` to `--text-3xl`. Body text never below `--text-base`.
- Space: one scale on a 4px base, `--space-1` to `--space-36`.
- Radius 0, hairline and rule border widths, no shadows.
- Motion: four durations and two easings, zero under prefers-reduced-motion.
- Breakpoints: 375, 768, 1024, 1280. No horizontal scroll at 375.

## Copy rules

CLAUDE.md's hard rules, plus:

- Plain, specific, first-person plural. No clever contrast lines and no three-part rhetorical lists.
- No em or en dashes anywhere.
- The word "AI" stays out of visible copy except where a source is quoted.
- No law firm language in any linked page.
- Prototype: "Fixed price, quoted before work starts." The first call is at no charge.
- Prices: "Builds start at $25,000. The monthly fee starts at $5,500 and covers hosting, support and every model provider cost. Multi-entity groups are quoted at a fixed price after the prototype."
- Approved statements: docs/brief/vendor-review.md.
- Banned from figures and copy: sha256, content hash, version identity, character offsets, connector ids.

## Vendor-review table

As in docs/brief/vendor-review.md. Rows not confirmed in writing read "Ask us".

## Out of scope

- The seven insurance question pages from the brief's section 5 (they follow after launch).
- Publishing the 551-insurer research.
- An events page.
- Changing the booking link, contact form fields, /privacy content or /terms.
- Customer logos, testimonials, metrics or case studies.
- Recoloring the PNG logo files.

## Open decisions

- The website brief file is missing. Sections 6, 7 and 9 were applied from the runbook's summary.
- Four vendor-review rows wait on written confirmation.
- The privacy page names the old legal entity and still describes The Brief and law firm documents. It is the one linked page exempt from check 5 while /privacy stays untouched; Anderson to decide on an edit.
- AM Best's survey page sits behind a bot check, so the /insurance citation could not be verified automatically. Open it in a browser before launch.
- `.explorer` and `.feature` are kept as documented components with no page using them yet.

## End-to-end check

The site is done when all of these hold:

1. `npm run build` exits 0. It syncs partials and checks dashes, titles, descriptions, canonicals, the sitemap, internal links, JSON-LD, inline styles and the booking link.
2. `npm run contrast` reports every token pair passing AA in both themes.
3. Every page in the table renders at 375, 768 and 1280 px with no horizontal scroll, in light and dark.
4. axe reports no serious or critical violations on any page.
5. No linked page mentions law firms, attorneys, matters, dockets or The Brief, except /privacy (see Open decisions).
6. Every statistic link returns 200.
7. brand-guardian reports nothing on the changed files.
8. An unknown URL returns 404, and /llms.txt is served as text.
