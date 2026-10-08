# WYEA site audit

Audited 2026-10-07 (evening PDT) on branch `redesign` at commit `deedefb`. Repo: `/Users/andersonwhittle/Documents/wyea-site`. Live: https://wyea.ai.

Read this first:

- **Snapshot caveat.** While this audit ran, another process was editing the working tree (uncommitted changes to `styles.css`, `worker.js`, `brief.js`, `README.md`, `.assetsignore`, `audit.mjs`, `send-issue.mjs`, `LAUNCH_CHECKLIST.md`, `REFERRALS.md`, plus new `partials/` and `scripts/`). All HTML files were unmodified. Every CSS, `worker.js` and `brief.js` finding below was measured on the committed (HEAD) versions, read with `git show HEAD:<file>`. Line numbers for those three files refer to HEAD. HTML line numbers refer to the working tree, which equals HEAD.
- **Branch drift.** `redesign` is 2 commits ahead of and 4 commits behind `origin/main` (merge base `a58deb7`). `origin/main` has `terms.html`, a `/terms` sitemap entry, a Terms link in every footer, a larger `privacy.html`, and `.well-known/microsoft-identity-association.json`. None of that is on this branch. The live site is built from main (inferred from live `/sitemap.xml` listing `/terms`, which this branch does not).
- **Marking.** "Documented" means stated in a repo file. "Observed" means I ran it. "Inferred" means neither.

---

## 1. Stack

| Item | Finding |
|---|---|
| Framework | None. Plain hand-written HTML files. No bundler, no templating at build time. README.md:10-11 says "No build step, no dependencies." |
| Router | Cloudflare Workers Static Assets plus a Worker. `wrangler.jsonc:6` `main: "worker.js"`. `wrangler.jsonc:8-18` assets block: `directory: "./"` (the repo root is the asset root), `binding: "ASSETS"`, `html_handling: "auto-trailing-slash"` (so `/about` serves `about.html`, while `/about.html` and `/about/` return 307 to `/about`, observed), `not_found_handling: "404-page"` (unknown URL returns `404.html` with status 404, observed live and locally), `run_worker_first: ["/api/*", "/brief", "/brief/*", "/sitemap.xml", "/what-we-build", "/build/*"]` (`wrangler.jsonc:17`). Every other path is served from assets without invoking the Worker. |
| Stale comments | `wrangler.jsonc:2-3` says only POST `/api/contact` invokes the Worker. `wrangler.jsonc:13-16` talks about SPA fallback, but `not_found_handling` is `404-page`, not SPA. Both comments are out of date. |
| Styling | One shared stylesheet `/styles.css` (1790 lines at HEAD, 127 top-level rule selectors, 157 distinct class names) loaded by every page, plus `/site.js` (241 lines, vanilla JS, `defer`) for nav, mega menu, reveal-on-scroll and the contact form. Fonts self-hosted in `/fonts` (Newsreader, Public Sans; `fraunces-var.woff2` and `inter-var.woff2` are present but not referenced by `styles.css` `@font-face`, inferred leftover). Design tokens are CSS custom properties in `styles.css:50-101`. No Tailwind, no preprocessor. |
| Content source | Hand-edited HTML. The header and footer are copy-pasted into each page and again as `SITE_HEADER`/`SITE_FOOTER` strings in `brief.js:790-871` (README.md:42-44 documents this). Sitemap entries are a hard-coded array in `worker.js:63-83`. The Brief issues are markdown in `brief/issues/` with `index.json`. A `partials/` folder (header, footer, contact-form) and `scripts/` appeared uncommitted during the audit, so a templating step may be coming. |
| Dynamic pieces | `POST /api/contact` (`worker.js:32-42`) writes to D1 database `wyea-leads` (`wrangler.jsonc:19-25`, schema in `schema.sql`) and emails via Resend. Secrets (documented, README.md:48-56 and `worker.js:8-11`): `CONTACT_EMAIL`, `RESEND_API_KEY`, `TURNSTILE_SECRET` (optional), `FROM_EMAIL`, `POSTAL_ADDRESS`, `RESEND_WEBHOOK_SECRET`. Turnstile is off: `site.js:137` `TURNSTILE_SITEKEY = ""`. |
| Hosting | Cloudflare Workers (Worker name `wyea-site`, `wrangler.jsonc:5`). The custom domain wyea.ai is not in `wrangler.jsonc` (no `routes`), so it is attached in the Cloudflare dashboard (inferred). Observed headers: `server: cloudflare`, `cf-ray` on every response. |
| Deploy method | Documented, two statements that agree: README.md:75 "PR + merge to main (auto-deploys)", and README.md:133 (`npx wrangler deploy` for manual deploys). `docs/brief/decisions.md` row "Who merges to production": "The agent opens the pull request. Anderson merges." `git log --all` shows merge commits "Merge pull request #1" to "#6" from `zipd-ai/wyea-site`. There is no `.github/` directory and no CI config in the repo, so the auto-deploy is a Cloudflare-side Git integration (Workers Builds) configured in the dashboard (inferred, not verifiable from the repo). Evidence it exists: live `/sitemap.xml` and `/terms` match `origin/main`, not any local branch. |
| Preview deploy | Not documented anywhere in the repo. Inferred options: (a) `npx wrangler versions upload` creates a non-production Worker version with a preview URL (needs the workers.dev subdomain and Preview URLs enabled for the Worker); (b) if the Cloudflare Git integration is Workers Builds, pushing a non-main branch usually builds a preview URL for it. Neither was run or verified. The only documented local preview is `npx wrangler dev --port 8080` (README.md:107, `.claude/launch.json:5-9`). |
| Asset hygiene | `.assetsignore` keeps source and docs out of the deployed bundle (at HEAD it lists README, wrangler.jsonc, worker.js, brief.js, schema.sql, Makefile, CLAUDE.md, `docs/`, `.claude/`, `node_modules/`, `package.json`, `scripts/` and others). Observed live: `/CLAUDE.md`, `/docs/brief/decisions.md`, `/.claude/settings.json`, `/.claude/blocklist.local.txt`, `/package.json`, `/worker.js`, `/README.md` all return 404. **Not ignored and publicly served (200): `/brief/issues/index.json` and `/brief/issues/The-Brief-*.md`** (observed `application/json` and `text/markdown`), so the retired newsletter's archive is still public. |
| Other files at root | `google9c6033754ec9d367.html` (Search Console verification, contains only the token string, no HTML), `de5df1e70914428d86942424b57728e7.txt` (IndexNow key), `Makefile`, `send-issue.mjs`, `audit.mjs`, `schema.sql` (all Brief operations), `REFERRALS.md`, `LAUNCH_CHECKLIST.md` (The Brief launch gates, not a site checklist). |
| Untracked | `package.json` and `node_modules/` are untracked (`git status`). `package.json` says `"type": "commonjs"` and `"main": "brief.js"`, which makes `node --check worker.js` fail (see section 8). Its description still reads "catered software for Orange County law firms". |

---

## 2. Commands

| Purpose | Command | Status |
|---|---|---|
| Install | None needed for the site. `npx wrangler` downloads wrangler on first use (observed: 4.148.0). `package.json` has `devDependencies: {}`. | No lockfile, nothing to install. |
| Dev | `npx wrangler dev --port 8080` (`.claude/launch.json:5-9`, README.md:107). Observed working on another port: serves assets plus Worker, local D1. Local one-time DB: `npx wrangler d1 execute wyea-leads --file schema.sql` (README.md:108). | Exists. |
| Build | **Does not exist.** No build script, no output directory. The repo root is deployed. | None. |
| Test | **Does not exist.** `package.json:8` `"test": "echo \"Error: no test specified\" && exit 1"`. No test files. | None. |
| Lint | **Does not exist.** No ESLint, Prettier, stylelint, or HTML linter configured. CLAUDE.md:22 still says "Commands: (filled in by Step 1...)". | None. |
| Deploy | `npx wrangler deploy` (README.md:133), or merge to main (auto). | Exists. |
| Brief ops | `make send`, `make dry-run`, `make test-send`, `make audit-verify` (Makefile). | Exists but The Brief is retired (see section 3). |
| Referenced but missing | `.claude/skills/ship-check/SKILL.md:5` points at `docs/ship-checklist.md`, and step 3 at `docs/SPEC.md`. Neither file exists. CLAUDE.md:3 points at `docs/brief/WYEA_Website_Brief_2026-09-27.md`, also absent (acknowledged in `docs/brief/decisions.md` open items). | Missing. |

---

## 3. Routes

### 3a. Static HTML (served from assets, `html_handling: auto-trailing-slash`)

| URL | File | In sitemap | Notes |
|---|---|---|---|
| `/` | `index.html` | yes | |
| `/insurance` | `insurance.html` | yes | `/insurance.html` returns 307 to `/insurance` (observed) |
| `/insurance/policy-wordings` | `insurance/policy-wordings.html` | yes | |
| `/insurance/endorsements` | `insurance/endorsements.html` | yes | |
| `/insurance/binding-authority-and-program-agreements` | `insurance/binding-authority-and-program-agreements.html` | yes | |
| `/insurance/reinsurance-treaty-wordings` | `insurance/reinsurance-treaty-wordings.html` | yes | |
| `/insurance/build-or-buy` | `insurance/build-or-buy.html` | yes | |
| `/insurance/contract-certainty` | `insurance/contract-certainty.html` | yes | |
| `/insurance/cost` | `insurance/cost.html` | yes | |
| `/custom-ai-for-law-firms` | `custom-ai-for-law-firms.html` | yes | Law firm page. See sections 5 and 6. |
| `/platform` | `platform.html` | yes | |
| `/platform/sources` | `platform/sources.html` | yes | |
| `/platform/verification` | `platform/verification.html` | yes | |
| `/platform/evidence` | `platform/evidence.html` | yes | |
| `/platform/isolation` | `platform/isolation.html` | yes | |
| `/how-we-work` | `how-we-work.html` | yes | |
| `/security` | `security.html` | yes | |
| `/about` | `about.html` | yes | |
| `/privacy` | `privacy.html` | yes | |
| `/404` (served for unknown URLs) | `404.html` | no | `<meta name="robots" content="noindex">` (`404.html:7`). `/404.html` returns 307 to `/404` (observed). |
| `/google9c6033754ec9d367.html` | same | no | Verification file. |
| `/de5df1e70914428d86942424b57728e7.txt` | same | no | IndexNow key. |
| `/llms.txt` | `llms.txt` | n/a | 200 `text/plain` live and local. |
| `/robots.txt` | `robots.txt` | n/a | 200 live and local. |
| `/terms` | **missing on this branch** | live only | Exists on `origin/main` (`terms.html`). Locally returns 404 (observed). CLAUDE.md:17 tells the agent not to change `/terms`, which does not exist here. |

Total HTML files in the repo: 21 (19 pages, `404.html`, the Google verification file). `404.html` and the verification file are not in the sitemap.

### 3b. Worker-handled routes (`worker.js`, `brief.js`)

| Route | Behavior | Reference |
|---|---|---|
| `POST /api/contact` | Validates name, email, message; honeypot field `website`; optional Turnstile; 5 per hour per IP; dedup by token and content hash; stores in D1; emails via Resend. Non-POST returns 405 JSON (observed live: GET returns 405). | `worker.js:32-42`, `worker.js:100-160` |
| `GET /sitemap.xml` | Generated XML, 19 hard-coded URLs, `Cache-Control: public, max-age=3600`. | `worker.js:43-45`, `58-98` |
| `GET /what-we-build` | 301 to `/platform` (observed live and local). | `worker.js:21,46-49` |
| `GET /build/verified-drafting` | 301 to `/platform/verification`. | `worker.js:23` |
| `GET /build/discovery` | 301 to `/platform/sources`. | `worker.js:24` |
| `GET /build/matter-workflow` | 301 to `/platform/evidence`. | `worker.js:25` |
| `GET /build/deployment` | 301 to `/platform/isolation`. | `worker.js:26` |
| Any other `/build/*` | Worker passes through; assets answer with the 404 page. | `worker.js:50-52` |
| `POST /api/subscribe` | Always returns 410 "The Brief is no longer published." Non-POST returns 405. The subscribe handler below the early return is unreachable. | `brief.js:34-43` |
| `POST /api/resend-events` | Resend webhook receiver (Svix signature). | `brief.js:45-53` |
| `POST /api/brief/blast` | Operator-token send endpoint for issues. | `brief.js:55-63` |
| `GET /brief`, `GET /brief/share` | 301 to `/`. | `brief.js:65-67` |
| `GET /brief/YYYY-MM-DD` | 301 to `/`. | `brief.js:70-71` |
| `GET /brief/confirm`, `GET /brief/unsubscribe` | Still live, Worker-rendered with `SITE_HEADER`/`SITE_FOOTER`/`PAGE_CSS`, `noindex`. Kept so existing subscribers can opt out (`brief.js:31-33`). | `brief.js:68-69`, `brief.js:769` |
| Any other `/brief/*` (for example `/brief/issues/index.json`) | `handleBrief` returns null, so assets serve it: 200 live for the index and the `.md` issues. | `brief.js:73-74` |
| `HEAD /brief` | Observed live: 404 with `curl -I`, because the 301 only matches `GET` (`brief.js:65`). A GET returns 301. Minor inconsistency. | `brief.js:65` |

### 3c. Unknown URL behavior (observed)

| Check | Live (`https://wyea.ai`) | Local (`wrangler dev`) |
|---|---|---|
| `/nope-xyz` | 404, `content-type: text/html`, title "Page not found \| WYEA", H1 "That page is not here" | 404, same title |
| `/llms.txt` | 200 `text/plain` | 200 |
| `/robots.txt` | 200 | 200 |
| `/sitemap.xml` | 200 `application/xml; charset=utf-8`, 20 URLs (includes `/terms`) | 200, 19 URLs |
| `/brief` (GET) | 301 to `/` | 301 to `/` |
| `/platform/` | 307 to `/platform` | 307 to `/platform` |
| `/terms` | 200 | 404 |

There is no SPA fallback: unknown paths never return the homepage.

---

## 4. Components

### 4a. Component families in `styles.css` (HEAD line numbers) and where each is used

Counts are pages (of 20 content pages including `404.html`) whose HTML contains the class. "All" means all 20 (19 pages plus 404).

| Family | Section header line | Key classes | Used by |
|---|---|---|---|
| Fonts and tokens | 22, 48 | `@font-face` x3; `:root` custom properties (22 hex values, `--font-*`, `--w-*`, `--gutter`, `--band*`, `--header-h`) | All |
| Base and measures | 107, 172 | `.wrap` (21), `.wrap-wide` (9), `.wrap-text` (9), `.skip-link` | All |
| Bands | 184 | `.band`, `.band-tight`, `.band-paper` (9), `.band-ink`, `.band-rule` (9) | All; `band-paper` on about, how-we-work, index, insurance, platform, platform/evidence, sources, verification, security |
| Section head | 203, 227 | `.head`, `.head-split` (10), `.head-stack` (16), `.eyebrow`, `.lede` | Most pages |
| Buttons | 244 | `.btn`, `.btn-primary`, `.btn-ghost` (11), `.btn-light` (19), `.btn-sm`, `.actions`, `.arrow` (4) | All; `.btn-outline-light` unused |
| Header, nav, mega menu | 310-550 | `.site-header`, `.header-inner`, `.wordmark`, `.nav`, `.nav-item`, `.nav-link`, `.nav-caret`, `.nav-cta`, `.nav-toggle`, `.mega`, `.mega-link` | All 20 pages; `.announce` and `.announce-long` (312-345) unused |
| Hero | 550 | `.hero` (11), `.hero-grid` (11), `.hero-sub` (10), `.hero-note` (2), `.stage` (9) | `.hero-sub` on 404, about, how-we-work, insurance, platform, security, 4 platform subpages; `.hero-note` on index and insurance |
| Tiles and grids | 588 | `.grid-2` (3), `.grid-3` (6), `.tile` (7), `.tile-num` (1); `.grid-4` unused | index, insurance, platform, about, how-we-work, verification, security |
| Explorer | 641 | `.explorer`, `.explorer-list`, `.explorer-item`, `.explorer-trigger`, `.explorer-body`, `.explorer-panels`, `.explorer-panel`, `.is-shown` | `index.html` only |
| Value props | 771 | `.vprops`, `.vprop-head`, `.vprop-body`, `.vprop-parts`, `.vprop-part`, `.is-plain` | 9 pages: how-we-work, index, insurance, platform, security, 4 platform subpages |
| Feature row | 822 | `.feature`, `.feature-copy`, `.feature-figure`, `.feature-flip`, `.feature-points` | Unused by any page |
| Stats | 877 | `.stats`, `.stat` | how-we-work, insurance |
| Steps | 918 | `.steps`, `.step-num` | how-we-work |
| Quote | 950 | `.quote` | Unused (CSS comment at 953 says the slot is marked in index.html; it is not) |
| Rule list | 980 | `.rulelist` | about, how-we-work, index, insurance, platform/evidence, platform/sources, security |
| FAQ | 1010 | `.faq` (`details`/`summary`) | how-we-work, index, insurance, security |
| Forms | 1072 | `.field` (19), `.field-row` (19), `.optional` (19), `.hp` honeypot, `.form-status`, `.contact-success` (19) | 19 pages (every page except 404) |
| CTA band | 1127 | `.cta-band` (19), `.cta-split` (19) | 19 pages |
| Footer | 1118 | `.site-footer`, `.footer-grid`, `.footer-brand`, `.footer-col`, `.footer-legal` | All 20 pages |
| Prose page | 1198 | `.page-head` (9), `.prose` (9), `.callout` (10), `.crumb` (19) | custom-ai-for-law-firms, privacy, 7 insurance guides |
| Explore | 1243 | `.explore` (17) | Most pages |
| Reveal | 1290 | `.reveal` (20), `.is-in` (set by `site.js`) | All |
| App figures ("screenshots" drawn in HTML) | 1309-1676 | `.app`, `.app-bar`, `.dot`, `.app-meta`, `.app-foot`, `.app-caption`; answer rows `.ans`, `.ans-row`, `.ans-mark`, `.ans-ok`, `.ans-flag`, `.ans-body`, `.ans-src`, `.ans-note`; `.fig-table`, `.fig-scroll`, `.pill`, `.pill-ok/-flag/-mute`; `.fig-dates`, `.date-row`, `.date-when`, `.date-what`, `.is-near`; `.fig-deploy`, `.boundary`, `.boundary-label`, `.node-row`, `.node`, `.egress` | `.app` on 16 pages; `.ans` on 7 insurance guides + index + insurance + platform/verification; `.fig-table` on index, platform, platform/sources; `.fig-dates` on how-we-work, index, platform/evidence; `.fig-deploy` on index, platform/isolation, security |
| Unused figure classes | 1377-1520 | `.fig-draft*`, `.fig-label`, `.cite*`, `.quote-chip`, `.is-missing`, `.src-note`, `.src-meta`, `.ln`, `.ln-90/80/70/60/45`, `.credo-row` | Unused by any page |
| The Brief band | 1677 | `.brief-form`, `.brief-row`, `.brief-micro`, `.brief-status`, `.brief-success` | Used only by `brief.js` and `site.js:210` (posts to the dead `/api/subscribe`). No HTML page uses them. |
| Credential strip | 1703 | `.credo`, `.credo-note` | index, insurance |
| People | 1760 | `.people`, `.person`, `.role`, `.people-compact` | about (full), index and insurance (compact) |

Totals at HEAD: 157 classes defined, 29 never used in any HTML, `brief.js` or `site.js`: `btn-outline-light`, `announce`, `announce-long`, `grid-4`, `feature`, `feature-copy`, `feature-figure`, `feature-flip`, `feature-points`, `ln`, `ln-90`, `ln-80`, `ln-70`, `ln-60`, `ln-45`, `fig-draft`, `fig-draft-main`, `fig-draft-side`, `fig-label`, `cite`, `cite-ok`, `cite-flag`, `cite-badge`, `quote-chip`, `is-missing`, `src-note`, `cite-mute`, `src-meta`, `credo-row`. (`.quote` is used 0 times in HTML but is matched by a string in a script, so it is not in that count.) No `prefers-color-scheme` rule exists at HEAD. The uncommitted rewrite of `styles.css` in progress adds a semantic-token layer and dark mode, which this audit does not measure.

Breakpoints at HEAD: 13 distinct `max-width` values (470, 520, 560, 620, 660, 700, 760, 800, 880, 900, 960, 1000, 1040 px).

### 4b. Hard-coded values in `styles.css` (HEAD, token block lines 50-101 excluded)

Counted by script over comment-stripped CSS. `var()` is used 302 times.

| Category | Count | Detail |
|---|---|---|
| Raw hex colors | **3 occurrences, 2 distinct** | `#6a655c` at line 274 (`.btn-outline-light` border, a class no page uses); `#e6b8a8` at line 1115 (`.form-status` on dark) and line 1694 (`.band-ink .brief-status`). Both have no matching token. |
| Raw `rgb()/rgba()` colors | **2** | `rgba(255, 255, 255, 0.06)` at line 275; `rgba(255, 255, 255, 0.92)` at line 352 (sticky header background). |
| Raw font-size declarations | **106 of 106** | No `font-size` uses a `var()`. 50 distinct values. Body is `17px` (line 119); all others are rem or `clamp()`. Most repeated: `0.82rem`, `0.68rem`, `0.86rem`, `0.78rem` (5 each); `0.85rem`, `0.99rem`, `0.97rem`, `0.84rem` (4 each). Many values differ by 0.01rem from a neighbor (`0.79`/`0.8`, `0.84`/`0.85`, `0.86`/`0.87`/`0.88`/`0.89`). Headings use `clamp(2.6rem, 5.6vw, 4.4rem)` (h1, line 138), `clamp(1.95rem, 3.6vw, 3rem)` (h2, line 139), `1.22rem` (h3, line 140). There is no type-scale token. |
| Raw spacing declarations | **192 of 222** | Properties `padding`, `margin`, `gap`, `row-gap`, `column-gap`, `*-top/-bottom/-left`, `top`, `left` carrying a px/rem/em/vw length with no `var()`. By property: padding 46, gap 42, margin-top 35, margin-bottom 18, padding-top 10, margin 9, top 7, column-gap 7, row-gap 6, left 5, padding-left 5, margin-left 2. 257 individual length values, 64 distinct. Most used: `16px` (16), `12px` (15), `40px` (13), `20px` (12), `18px` (12), `56px` (10), `10px` (10), `14px` (10). There is no spacing-scale token; only `--gutter`, `--band`, `--band-tight`, `--header-h` exist. The full property:value-by-line list is reproducible by parsing `git show HEAD:styles.css` for those properties. |
| Other raw lengths | counted, not individually listed | `max-width` 31, `letter-spacing` 25, `border-top` 20, `border-bottom` 18, `height` 13, `border` 12, `width` 9, `transform` 6, `border-left` 6. |
| Off-screen offsets | 2 | `left: -10000px` (`.hp`, line 1114) and one more `-10000px` or `-9999px` offset in the skip-link rules. |

### 4c. Inline `style=""` attributes and `<style>` blocks

**HTML pages: 83 inline `style=""` attributes across 19 files, 12 distinct values.** `404.html` and the verification file have none. html-validate flags all 83 (`no-inline-style`).

| Count | Value | Where |
|---|---|---|
| 19 | `color:var(--on-ink-soft);font-size:0.92rem;margin-bottom:1.6em` | the CTA band note: `about.html:239`, `custom-ai-for-law-firms.html:194`, `how-we-work.html:429`, `index.html:727`, `insurance.html:542`, `privacy.html:200`, `security.html:375`, `platform.html:297`, `platform/evidence.html:225`, `platform/isolation.html:198`, `platform/sources.html:243`, `platform/verification.html:279`, and the 7 insurance guides (lines 217-236) |
| 16 | `margin-bottom:32px` | the CTA band head: `about.html:212`, `how-we-work.html:402`, `insurance.html:509`, `platform.html:270`, `security.html:348`, 4 platform subpages, 7 insurance guides |
| 16 | `font-size:clamp(1.5rem,2.4vw,2rem)` | the CTA band heading, same pages as the row above |
| 9 | `font-size:clamp(2rem,3.8vw,3rem)` | the page-head H1 on `privacy.html:63`, `custom-ai-for-law-firms.html:84`, and the 7 insurance guides (line 113) |
| 9 | `margin-top:1.4em;font-size:0.9rem;color:var(--ink-muted)` | the page-head byline: `privacy.html:64`, `custom-ai-for-law-firms.html:85`, 7 insurance guides (line 114) |
| 8 | `max-width:none;margin-bottom:1.6em` | the lede: `custom-ai-for-law-firms.html:91`, 7 insurance guides (line 120) |
| 1 each | `max-width:780px` (`how-we-work.html:352`); `margin-top:1.4em` (`index.html:151`); `margin-top:44px` (`index.html:638`); `margin-top:36px` (`index.html:662`); `margin-top:48px` (`insurance.html:419`); `margin-top:1em;font-size:0.9rem;color:var(--ink-muted)` (`security.html:92`) | |

Every value above repeats a pattern that should be a component modifier. `site.js:19` also sets `document.body.style.overflow` from script (1 JS style write).

**`<style>` blocks in HTML: 0.**

**`brief.js` (HEAD):**
- One `<style>${PAGE_CSS}</style>` block at `brief.js:769`; `PAGE_CSS` is `brief.js:877-927` (51 lines, 15 `font-size` declarations, 35 `var()` uses, 0 hex).
- 25 inline `style="..."` attributes in the email template, lines 357, 444-451, 457-491. These carry **25 raw hex occurrences, 7 distinct** (for example `#191713`, `#ffffff`, `#e7e5e0`, `#444038`, `#8f8a82`, `#5a1723`, `#1f2733`) and px font sizes. Inline styles are expected in email HTML, so these are a separate class of problem.
- The Worker-rendered pages that still run (`/brief/confirm`, `/brief/unsubscribe`) duplicate the site header and footer (`brief.js:790-871`) with different wording from the static pages (section 6).

---

## 5. Content per page

Titles are all 60 characters or fewer; descriptions are all 160 or fewer. Lengths are in characters after HTML unescape. "Desc" is `<meta name="description">`. Every page except `404.html` and the verification file has a canonical, `og:title`, `og:type`, `og:url`, `og:image`, `twitter:card=summary_large_image`. `404.html` has no description, canonical or OG (it is `noindex`).

| File | H1 (line) | Title (len) | Desc (len) |
|---|---|---|---|
| `index.html` | Take on more work with the team you have. (138) | WYEA \| Document Engines for Specialty Insurers & Law Firms (58) | 145 |
| `insurance.html` | Paper more deals with the team you have. (133) | Document Engines for Specialty Insurers and MGAs \| WYEA (55) | 144 |
| `insurance/policy-wordings.html` | Drafting policy wordings from your own precedents (113) | Drafting Policy Wordings from Your Own Precedents \| WYEA (56) | 144 |
| `insurance/endorsements.html` | Reading policies with the endorsements that amend them (113) | Reading Policies with Their Endorsements \| WYEA (47) | 149 |
| `insurance/binding-authority-and-program-agreements.html` | Binding authority and program agreements across carriers (113) | Binding Authority and Program Agreements \| WYEA (47) | 154 |
| `insurance/reinsurance-treaty-wordings.html` | Treaty and facultative wordings from your clause library (113) | Drafting Treaty and Facultative Wordings \| WYEA (47) | 149 |
| `insurance/build-or-buy.html` | Should an MGA build its own AI document tools? (113) | Should an MGA Build Its Own AI Document Tools? \| WYEA (53) | 148 |
| `insurance/contract-certainty.html` | Contract certainty when the same deal is papered on several forms (113) | Contract Certainty Across Several Forms \| WYEA (46) | 149 |
| `insurance/cost.html` | What a document engine costs (113) | What a Document Engine Costs \| WYEA (35) | 143 |
| `custom-ai-for-law-firms.html` | Custom AI software for law firms in Orange County (84) | Custom AI Software for Law Firms in Orange County \| WYEA (56) | 137 |
| `platform.html` | A document engine that can show you where every answer came from (65) | How a Document Engine Works \| WYEA (34) | 144 |
| `platform/sources.html` | It reads your systems. It does not replace them. (65) | Connected Sources \| WYEA (24) | 127 |
| `platform/verification.html` | A quote is found in the source, or it does not become an answer (65) | Grounding and Verification \| WYEA (33) | 130 |
| `platform/evidence.html` | Answers point at a version, not at a file (65) | Evidence and the Record \| WYEA (30) | 149 |
| `platform/isolation.html` | One system per client, with nothing shared underneath (65) | Isolation \| WYEA (16) | 139 |
| `how-we-work.html` | One week to a working prototype, then a fixed price for the build (65) | How We Work \| WYEA Engagement Model (35) | 139 |
| `security.html` | What is true today, and what is not finished (88) | Security \| WYEA (15) | 151 |
| `about.html` | The engineers who answer your calls (100) | About WYEA \| The Engineers Who Answer Your Calls (48) | 132 |
| `privacy.html` | How WYEA handles information (63) | Privacy \| WYEA (14) | 154 |
| `404.html` | That page is not here (58) | Page not found \| WYEA (21) | none |

Observations: the titles of `isolation`, `security` and `privacy` are 14-16 characters and carry no keyword. `index.html:6` has a raw `&` in the `<title>` (html-validate `no-raw-characters`).

### 5a. Statistics and sources

Link status is from `curl -sL -o /dev/null -w '%{http_code}' -A Mozilla/5.0`. Four sources did not return 200 to curl; they are likely bot blocks, not dead pages, but I could not confirm that a human browser opens them. CLAUDE.md:15 requires every statistic's source to open.

| Page:line | Statistic or quote | Source link | Status |
|---|---|---|---|
| `insurance.html:381` | AM Best April 2026 survey of "more than 150 insurers and MGAs"; top impediments to AI deployment named | news.ambest.com/NewsContent.aspx?refnum=274090 | 200 |
| `insurance.html:421` | AI in underwriting "from 14% today to 70% in the next three years"; survey of 430 underwriting executives, August 2025 | accenture.com/se-en/insights/insurance/underwriting-rewritten | 200 |
| `insurance.html:424` | 200 US insurance executives; lack of business line support the top reason implementations failed (Deloitte, April 2025) | deloitte.com/us/en/insights/industry/financial-services/scaling-gen-ai-insurance.html | 200 |
| `insurance/binding-authority-and-program-agreements.html:124` | Delegated underwriting is "approximately 45% of the market's premium income" at Lloyd's | lloyds.com/coverholder | 200 |
| `insurance/binding-authority-and-program-agreements.html:126` | NAIC Managing General Agents Act, Section 4 and Section 5 (on-site review, semi-annual) | content.naic.org/.../model-law-225.pdf | **403** (also 403 with a Chrome user agent and HTTP/1.1) |
| `insurance/build-or-buy.html:131` | McKinsey July 2025: "ideally 70 to 80 percent of digital talent being in-house" | mckinsey.com/industries/financial-services/our-insights/the-future-of-ai-in-the-insurance-industry | **000** (no response in 60 s; HTTP/2 stream error, same with `--http1.1`) |
| `insurance/contract-certainty.html:123` | Contract Certainty Code of Practice definition; FCA "clear, comprehensive and fully-agreed policy wordings before inception" | lmg.london/.../CC-COP-Sept-2018.pdf; lloyds.com/wordingsmatters | 200; 200 |
| `insurance/cost.html:184` | Gartner July 2024: "at least 30% of generative AI projects" abandoned after proof of concept by end of 2025; analyst quote | gartner.com/en/newsroom/press-releases/2024-07-29-gartner-predicts-30-percent-... | **403** |
| `insurance/policy-wordings.html:124` | LMA model wordings "purely illustrative"; about 2,100 live wordings in the Lloyd's Wordings Repository; LMA publishes 50 to 100 new or updated wordings a year | lmalloyds.com/specialist-areas/underwriting/wordings/ | 200 |
| `insurance/endorsements.html:133` | Contract Certainty Code of Practice: "Contract changes need to be certain and documented promptly." | lmg.london/.../CC-COP-Sept-2018.pdf | 200 |
| `insurance/reinsurance-treaty-wordings.html:125` | Guy Carpenter, January 2024 renewal: market "increased contract-level consistency on both wording and structural variations" | guycarp.com/.../january-2024-renewals.html | 200 |
| `insurance/reinsurance-treaty-wordings.html:129` | NAIC Credit for Reinsurance Model Regulation, Section 15, insolvency clause | content.naic.org/.../model-law-786.pdf | **403** |
| `custom-ai-for-law-firms.html:122-124` | "One in three attorneys who book a legal-tech demo book more within a week"; 3.2 vendors evaluated (FlyTech Q2 2026 via LawSites) | lawnext.com/2026/07/q2-report-on-legal-tech-advertising-... | 200 |
| `custom-ai-for-law-firms.html:140-142` | Data security cited by 46% of legal professionals as the concern slowing AI adoption, ethics 42% (8am 2026 Legal Industry Report) | 8am.com/reports/legal-tech-buyers-guide/ | 200 |

Other numbers on the pages that are not third-party statistics:
- **Our own prices**: `$25,000` and `$5,500` appear in 6 files plus `llms.txt` (section 6b).
- **Invented example figures** inside app figures: `12,400 documents` and `1,890 documents` (`index.html:408,414`, `platform.html:93,99`, `platform/sources.html:93,99`), and the policy limits and dates inside the insurance guide figures (for example USD 5,000,000 and USD 7,500,000 in `insurance/endorsements.html:154,162,182`). "Invented" notes exist on 11 files (`index.html` x3, `insurance/cost.html` x2, `insurance/build-or-buy.html` x2, one each on 8 others). `platform.html` and `platform/sources.html` show the 12,400 and 1,890 figures with no "invented" label (the count of "invented" in those two files is 0). That is an inferred gap against CLAUDE.md:8.
- **Biography numbers**: `about.html:127` "scale a fintech platform from a $20M to a $100M valuation" and "Machine learning since 2017". No source link (claims about the principals, not market statistics).
- **Customer-metric check**: no customer logos, testimonials or customer metrics found.

### 5b. Law firms, attorneys, matters, dockets, court, The Brief

CLAUDE.md:2 says "Insurance only". `docs/brief/decisions.md` row 2 says law firm material should be removed from navigation and home, with URLs kept live, unlinked and set to `noindex`. None of that has happened yet.

| Where | Reference |
|---|---|
| Law firm landing page, live, linked, indexable, in sitemap | `custom-ai-for-law-firms.html`: `<title>` line 6, description line 7, `og:title/description` lines 9-10, JSON-LD `Service` lines 20-40 (`serviceType` "Custom legal AI software development", `areaServed` Orange County plus United States), eyebrow line 83 and H1 line 84 ("Orange County"), body 92-163 ("attorney review" 97 and 149, "legal AI" 100-101, "Attorneys shop" 117, "attorneys" 122) |
| "Orange County" counts | 11 uses on that page; 2 on every other page: footer link text "For Orange County firms" and the footer-legal line "Newport Beach · Orange County, California" |
| Nav (every page and the `brief.js` shell) | Platform dropdown item "Comparing your options" links to `/custom-ai-for-law-firms` (all 21 HTML files) |
| Footer (every page) | `<a href="/custom-ai-for-law-firms">For Orange County firms</a>` on 20 pages (`index.html:787`, `about.html:298`, `how-we-work.html:488`, `insurance.html:601`, and 16 more) |
| Sitemap | `worker.js:73` |
| `llms.txt` | line 3 ("specialty insurers, MGAs and law firms"), lines 20-21 (`## Law firms` section) |
| Homepage | `index.html:6,9` title and og:title "& Law Firms"; `7,10` description; `33` JSON-LD description; `43` `knowsAbout` "legal document review"; `89-90` FAQ "Does WYEA only work with law firms?"; `143` hero text "and law firms"; `287` "a wordings team and a litigation practice"; `301-304` "Law firms" card: "Matters, served paper, discovery, motions and deadlines, with the public court record connected alongside the firm's own files"; `700-701` visible FAQ repeat |
| Matters / court / docket mentions on home and platform | `index.html:261-262` ("deals and matters", "the courts you appear in"), `335`, `394` (aria-label: "Outlook matter mail", "the public court record"), `405-406`, `424-425` ("The public record: dockets and opinions", "Filings in your matters"), `563`, `575`, `601`, `623`, `685`; `platform.html:79,109-110,255-261` ("Legal" card with "For law firms", "public court record and case law"); `platform/sources.html:79,109-110,142-145` (iManage, NetDocuments, "Dockets and opinions"); `platform/evidence.html:172` ("Matters outlive that schedule"); `platform/sources.html:181-182` |
| Other pages | `about.html:7,10,106,203` ("and law firms", "not all of them are law firms"); `how-we-work.html:68,392-393` ("and law firms", "Do you work outside legal?"); `privacy.html:7,10,105` (description and body about a law firm's documents); `404.html:74` footer link; `security.html:262` ("legal hold") |
| Favicon | All 20 pages and `brief.js:771` use an emoji favicon of the scales of justice (U+2696), which reads as legal branding on an insurance-only site |
| Package metadata | `package.json:4` and README.md:3-5 "catered software for Orange County law firms" |
| The Brief | `privacy.html:91` still says "The Brief, our email publication, keeps the email..." although The Brief is retired. No other HTML page mentions The Brief. The code still carries it: `worker.js:2`, `brief.js` throughout, `Makefile`, `send-issue.mjs`, `audit.mjs`, `LAUNCH_CHECKLIST.md`, `brief/` (issues and previews), `schema.sql`. Dead CSS for it at `styles.css:1677-1702`. |

### 5c. Em dashes and en dashes

Searched with `grep -nP '\x{2014}|\x{2013}'` over all HTML, `site.js`, `styles.css`, `brief.js`, `worker.js`, `llms.txt`, `robots.txt`, `wrangler.jsonc`.

| File | Result |
|---|---|
| All 21 HTML files | **0** |
| `site.js`, `styles.css`, `llms.txt`, `robots.txt` | **0** |
| `worker.js` (HEAD) | 7 lines: 2, 9, 10, 127, 135, 140, 187. Visitor-facing: line 127 (JSON error "verification failed", em dash, "please try again"), line 135 (429 error "too many messages", em dash, "please try again later"), line 187 (email subject "New inquiry from wyea.ai", em dash, the name). The rest are comments. |
| `brief.js` (HEAD) | 16 lines: 1, 4, 5, 6, 7, 9, 13, 74, 170, 283, 392, 422, 435, 702, 991, 1086 (comments and a `console.log`) |
| `wrangler.jsonc` | 1 line: 1 (comment) |

At audit time an uncommitted edit to `worker.js` was already replacing those seven with commas and colons, so expect the `worker.js` row to be 0 once that lands. HTML is clean today, including titles, meta, alt text and JSON-LD.

### 5d. Claims against the /security "not claimed yet" list

`security.html:242-300` lists six items not claimed: (1) client-controlled hosting, (2) export, deletion, retention, legal hold and offboarding, (3) client-visible operator access, (4) customer-managed keys, (5) independent audit (no SOC 2, ISO, third-party pen test), (6) production history ("early", nothing battle-tested).

Result: no page claims SOC 2, ISO, a penetration test, client-hosted deployment or customer-managed keys. Every page that discusses them states them as not built: `insurance.html:63,485,489`, `insurance/build-or-buy.html:183`, `insurance/cost.html:178`, `insurance/reinsurance-treaty-wordings.html:178`, `platform/isolation.html:151-155`, `custom-ai-for-law-firms.html:131-134`, `llms.txt:8`. Items worth a human check, listed by risk:

1. `insurance.html:489` and the matching JSON-LD answer at `insurance.html:68`: "what the system learns from your documents belongs to you, and the terms for taking it with you are written into the agreement before the build starts." This sits next to "export ... not built" (item 2). It promises contract terms for taking learned content out, while the product has no export. Possible overclaim; the same passage does say hosting inside your cloud is not built.
2. `how-we-work.html:393` and `index.html:701` (plus JSON-LD `index.html:90`): "it runs in insurance as well as legal" and "Legal work is where it started. Insurance is the other line it runs in." Against item 6 (production history; the platform is early) this implies two lines of business in operation. No customer is named, but the sentence asserts deployed use.
3. `security.html:114`, `index.html:526`, `platform/isolation.html:90`: "Your history: Every answer, and what it rested on." Item 3 says the client cannot yet see an audit log of operator access, and the `security.html` FAQ says no client-facing view of the audit chain exists. "Your history" reads as a client-facing record.
4. `platform/evidence.html` and `insurance/reinsurance-treaty-wordings.html:177`: "Copies of the pages you relied on are kept." This is a retention claim; item 2 says retention is "specified and not yet implemented". Check wording.
5. `custom-ai-for-law-firms.html:133` mentions an "audit trail your firm can read for itself" only to say it is not claimed. Consistent.

---

## 6. Inconsistencies

### 6a. "Document engines" versus "document knowledge systems"

The phrase "document knowledge system" (and the word "knowledge" at all) appears **nowhere** in the repo (searched all files outside `node_modules`, `.git`, `.wrangler`). The site uses "document engine(s)" on every page and in `llms.txt` and CLAUDE.md:3, well over 100 occurrences (for example `index.html` 10, `insurance/cost.html` 9, `insurance.html` 9, `about.html` 6, `platform.html` 7). The memory note describing the product as a "document knowledge system" is therefore not reflected in copy. Related mixed vocabulary: pages say "document engine", "the engine", "the system" and "the platform" interchangeably (`security.html` and `platform/isolation.html` say "system" and "platform", the guides say "engine"), and "your document system" (meaning the client's Dropbox or SharePoint) is used about 28 times, which can be misread as WYEA's product.

### 6b. Free / no charge versus fixed-price prototype

`docs/brief/decisions.md` (2026-10-07, Anderson): "Fixed price, quoted before work starts" everywhere. The prototype is no longer described as free. The first call stays at no charge. Current copy says the **one-week prototype is at no charge or free** in all of these places (all must change; the consultation lines may stay):

| Place | Lines |
|---|---|
| Platform-dropdown/company-dropdown item "A one-week prototype at no charge, then a fixed-price build." in the header of every page | `404.html:41`, `about.html:83`, `custom-ai-for-law-firms.html:69`, `how-we-work.html:48`, `index.html:123`, `insurance.html:116`, `platform.html:48`, `privacy.html:48`, `security.html:71`, `platform/{evidence,isolation,sources,verification}.html:48`, `insurance/{binding-authority-and-program-agreements,build-or-buy,contract-certainty,cost,endorsements,policy-wordings,reinsurance-treaty-wordings}.html:98`; also `brief.js:812` (20 HTML files plus the Worker shell) |
| `how-we-work.html` | 79 (aria-label of schedule figure: prototype "at no charge in week one"), 88 pill "No charge" (consultation row), 98 pill "No charge" (prototype row), 282, 355, 381 ("at no cost to you") |
| `index.html` | 705 (FAQ answer) |
| `insurance.html` | 78 (JSON-LD FAQ answer), 444, 497 (visible FAQ) |
| `custom-ai-for-law-firms.html` | 159-160 |
| `insurance/cost.html` | 7 and 10 (meta description and og:description: "a free one-week prototype"), 27 (JSON-LD description "a free one-week prototype"), 120, 126 ("There is no charge" for the prototype), 185 ("The prototype costs you nothing"), 202 |
| `insurance/build-or-buy.html` | 189 |
| `insurance/policy-wordings.html` | 183 |
| `insurance/endorsements.html` | 194 |
| `insurance/contract-certainty.html` | 184 |
| `insurance/binding-authority-and-program-agreements.html` | 185 |
| `insurance/reinsurance-treaty-wordings.html` | 184 |
| `llms.txt` | 6 |

Counts: about 60 lines in HTML and `llms.txt` carry "no charge", "no cost", "free" or "costs you nothing" about the prototype (20 of them are the identical dropdown line). Third-party "free to amend" in `insurance/policy-wordings.html:124` is a quote and is not a pricing claim. Lines consistent with the decision: `insurance/cost.html:124` ("Consultation or demo. There is no charge."), and the consultation parts of `how-we-work.html:79,88`. The sentence "Multi-entity groups are quoted at a fixed price after the prototype" (decisions row 4) appears nowhere yet.

Starting prices `Builds start at $25,000` and `monthly fee starts at $5,500` are repeated at: `index.html:705`, `insurance.html:78,497`, `how-we-work.html:357-358`, `custom-ai-for-law-firms.html:162-163`, `insurance/cost.html:7,10,27,120,127,128`, `llms.txt:6`.

Also: `custom-ai-for-law-firms.html:7` says "a working prototype in one week" with no price wording, and `insurance.html:83` (JSON-LD) and `501` say "within the first week there is a working prototype running on your own wordings", with no price statement.

### 6c. Footer and company lines

- Footer markup is identical on all 20 pages except the "Send a message" link: `index.html`, `404.html`, `how-we-work.html` use `/#contact`; the other 17 content pages use `#contact` (in-page anchor, which works because each has `id="contact"`). Both resolve; the inconsistency is cosmetic.
- `brief.js` `SITE_FOOTER` differs from the HTML footers: link "Comparing your options" (`brief.js:849`) versus "For Orange County firms" on the pages; "Book a 30-minute call" (`brief.js:859`) versus "Book a consultation or demo".
- Legal line: `© 2026 WYEA LLC` and `Newport Beach · Orange County, California` on all pages and in `brief.js:867`. Footer brand line: "Whittle and Ye Engineering Associates. Firm-owned document engines, built in Newport Beach." everywhere. "Orange County" in the footer conflicts with the service area being the whole United States (JSON-LD `areaServed` United States at `index.html:34`).
- Legal-name drift: `package.json:4` and README.md:3 say "Whittle and Ye Engineering Associates LLC"; JSON-LD `legalName` is "WYEA LLC" (`index.html:30`, `about.html:29`); `privacy.html:64` says "WYEA LLC (Whittle and Ye Engineering Associates)"; `llms.txt:3` says "Whittle and Ye Engineering Associates". The `origin/main` footer adds a Terms link not present here.

### 6d. Banner and announce placement

No HTML page renders an announcement banner or The Brief banner. `.announce` and `.announce-long` (`styles.css:312-345`) are unused CSS. The old homepage "Brief band" is gone from the HTML; only dead CSS and `site.js:200-241` (posts to the 410 endpoint) remain. `docs/brief/decisions.md` mentions a "The Brief banner" to remove: nothing is left to remove in HTML.

### 6e. Navigation differences between pages

The header is byte-identical across pages apart from the `aria-current="page"` marker, which sits on: the Insurers link (`insurance.html` and the 7 insurance guides), the Platform button (`platform.html` and 4 subpages), How we work, Security, and the Company button (`about.html`, `privacy.html`). `custom-ai-for-law-firms.html`, `index.html` and `404.html` have no current marker. The nav has two dropdowns (Platform, Company), three plain links (Insurers, How we work, Security), and the "Book a call" button. The Law firms link was removed from the top nav (commit `a58deb7`), but the law firm page is still reachable through "Comparing your options" inside the Platform dropdown on every page, and from the footer. The Company dropdown description repeats the free-prototype wording (6b).

Header and footer are copied by hand across 21 files plus `brief.js`; there is no single source on this branch (the new `partials/` folder is uncommitted).

---

## 7. Search plumbing

### 7a. Sitemap (`worker.js:58-98`, observed live and local)

All entries share `lastmod` `2026-09-27` (`worker.js:62`, one constant). `priority` values: `/` 1.0; `/insurance`, `/platform`, `/how-we-work` 0.9; `/security` and 12 child pages 0.8; `/about` 0.7; `/privacy` 0.3. No `changefreq`. 19 URLs local, 20 live (adds `/terms`, 0.3). `404.html`, the verification file and the IndexNow key are absent (correct). `/custom-ai-for-law-firms` is present at 0.8 (conflicts with the decision to noindex it). Because `lastmod` is one hard-coded string, any page edit after 2026-09-27 leaves it stale; the comment at `worker.js:60-61` says to update it in the same commit as the page.

### 7b. robots.txt

`robots.txt:1-33`: `User-agent: *` Allow `/`, then explicit Allow blocks for GPTBot, OAI-SearchBot, ChatGPT-User, ClaudeBot, Claude-SearchBot, Claude-User, PerplexityBot, Perplexity-User, Google-Extended. `Sitemap: https://wyea.ai/sitemap.xml`. Nothing is disallowed, so `/brief/issues/*` (200 live) is crawlable; `/brief/confirm` is `noindex` by meta (`brief.js:764`).

### 7c. JSON-LD (14 files contain blocks)

| File | Block | Types and key properties |
|---|---|---|
| `index.html:22` | graph | `ProfessionalService` (`@id https://wyea.ai/#org`, name WYEA, legalName WYEA LLC, alternateName, url, description, `foundingDate 2026`, `areaServed` Country United States, `address` Newport Beach CA, `founder` two refs, `knowsAbout` six topics incl. "legal document review"); `WebSite` (`@id #website`, publisher ref) |
| `index.html:57` | single | `FAQPage`, 6 questions |
| `insurance.html:20` | graph | `Service` (`@id`, serviceType "Insurance wording and document drafting", provider, audience `BusinessAudience`, areaServed United States, url, description); `BreadcrumbList` Home > Specialty insurance |
| `insurance.html:45` | single | `FAQPage`, 7 questions (includes the "no charge" prototype answer at line 78) |
| 7 insurance guides, line 20 | graph | `Article` (headline, description, `datePublished` and `dateModified` both `2026-09-27`, author and publisher `Organization` with `@id https://wyea.ai/#org`, `mainEntityOfPage`); `BreadcrumbList` Home > Specialty insurance > guide name |
| `custom-ai-for-law-firms.html:20` | single | `Service` (serviceType "Custom legal AI software development", provider with `@id`, areaServed Orange County plus United States, url, description). No breadcrumb, no FAQPage. |
| `about.html:20` | graph | `AboutPage`; `ProfessionalService` (`@id #org`, legalName, alternateName, founder); two `Person` (jobTitle, worksFor, alumniOf, `sameAs` LinkedIn) |
| `security.html:20` | single | `FAQPage`, 3 questions |
| No JSON-LD | | `how-we-work.html`, `platform.html`, the 4 platform subpages, `privacy.html`, `404.html` |

Issues: `ProfessionalService` is defined on both `index.html` and `about.html` with the same `@id` (duplicate entity, minor). The insurance guides reference `@id https://wyea.ai/#org`, which resolves only because the homepage defines it. FAQ JSON-LD answers duplicate visible FAQ answers on `index.html` and `insurance.html`, so they must be edited in pairs (as in 6b). `dateModified` is hard-coded.

### 7d. Open Graph and canonical

- All indexable pages: `<link rel="canonical" href="https://wyea.ai/<path>">` (self-referencing, no trailing slash, `/` for home). `404.html` has none.
- `og:image` is `https://wyea.ai/assets/og-image.png` on every page (one shared image, 1200 by 630, 36 KB). The local file exists; live returned 200 on retry (one earlier attempt timed out). No page has a page-specific image, `og:image:width/height/alt`, `og:site_name` or `og:locale`. No `twitter:image` (the card falls back to OG).
- `og:type`: `website` for home, platform, security, about, privacy, how-we-work, law-firm, insurance index; `article` for the 7 insurance guides.
- `og:description` is present on every indexable page; `404.html` has no OG at all.
- `404.html:7` is `noindex`. Worker-rendered Brief pages are `noindex` (`brief.js:764`).
- `/terms` canonical and sitemap entry exist only on main.
- Internal link check (script): every `href`/`src` starting with `/` in the 21 HTML files resolves to an existing file or route, and every `#fragment` resolves to an `id`. 0 broken internal links.

---

## 8. Baseline

### 8a. `node --check`

Command as requested: `node --check worker.js site.js brief.js` (also run per file).

| File | Result |
|---|---|
| `site.js` | passes |
| `worker.js` | **fails** in place: `SyntaxError: Cannot use import statement outside a module`. Cause: the untracked `package.json` declares `"type": "commonjs"`, so Node parses `.js` as CommonJS. Not a code defect (Wrangler bundles ES modules itself). |
| `brief.js` | **fails** in place: `SyntaxError: Unexpected token 'export'`. Same cause. |
| `send-issue.mjs`, `audit.mjs` | pass |

Copies of `worker.js`, `brief.js` and `site.js` saved as `.mjs` in the scratchpad all pass `node --check`. So there are 0 real syntax errors. If CI ever runs `node --check` on the `.js` files, either the files must be named `.mjs` or `package.json` `type` must be `module`.

### 8b. HTML sanity

`npx html-validate` installed in about 5 seconds (into the scratchpad, not the repo; v11.16.2) with `html-validate:recommended`, run over all 21 HTML files.

- **84 errors, 0 warnings, 2 rules.**
- `no-inline-style`: 83 (the inline styles listed in 4c; 3 to 6 per file in 19 files).
- `no-raw-characters`: 1, `index.html:6` raw `&` in the `<title>`.
- `404.html` and the verification file: clean.
- No duplicate ids, missing alt, bad nesting or unclosed tags reported.
- Zero warnings is partly because the recommended preset has no accessibility or SEO rules; it does not check heading order, link text or contrast.

### 8c. Other checks

- Live external links: 14 external source URLs on the pages, 10 return 200, 4 do not (3 return 403: two NAIC PDFs and Gartner; 1 times out: McKinsey). The booking link `https://calendar.app.google/hMuBjTub3YHa9rKT7` returns 200 and appears 78 times. The two LinkedIn profile links return 200.
- Raw hex in `styles.css` outside `:root`: 3. Inline styles: 83. Em or en dashes in HTML: 0.
- `.claude/launch.json` is untracked and contains a second configuration (`scratchpad-preview`) with a session-specific absolute path that will go stale.

---

## Prioritised findings

1. **Law firm material is still live and promoted**, against `docs/brief/decisions.md` and CLAUDE.md:2: `/custom-ai-for-law-firms` is indexable, in the sitemap (`worker.js:73`), in `llms.txt:20-21`, in the Platform dropdown on every page ("Comparing your options"), in 20 footers ("For Orange County firms"), and the homepage has a "Law firms" card (`index.html:301-304`), an FAQ (`index.html:89-90,700-701`) and law firm wording in the title, description and JSON-LD.
2. **Prototype price wording must change in about 60 lines across 21 files** (6b), including meta descriptions and JSON-LD on `insurance/cost.html` and the dropdown line in every header and in `brief.js`.
3. **Hard-coded values**: 106 raw `font-size` declarations (50 distinct, no type scale), 192 raw spacing declarations (64 distinct lengths), 3 raw hex plus 2 `rgba()`, 83 inline styles in HTML (12 patterns), 25 inline styles with 25 hex in `brief.js`, plus a `<style>` block in the Brief shell.
4. **Branch is behind main**: missing `terms.html`, `/terms` sitemap entry, footer Terms link, Microsoft identity file, revised `privacy.html`. Merge or rebase before shipping.
5. **Source links that may not open**: two NAIC PDFs and the Gartner page return 403, the McKinsey page does not respond. Verify in a real browser or replace.
6. **Retired Brief archive still public**: `/brief/issues/index.json` and `/brief/issues/*.md` return 200 live. `privacy.html:91` still describes The Brief.
7. **Possible overclaims to review** against the not-claimed list: `insurance.html:68,489`, `how-we-work.html:393`, `index.html:701`, retention wording on `platform/evidence.html` and `insurance/reinsurance-treaty-wordings.html:177`.
8. **No build, test or lint exist**; CLAUDE.md:22 and `ship-check` reference missing `docs/ship-checklist.md` and `docs/SPEC.md`.
9. **Dead code**: 29 unused CSS classes, `.announce`, the Brief band CSS and `site.js` subscribe code, the unreachable subscribe handler in `brief.js:37-43`, stale comments in `wrangler.jsonc`.
10. **Dashes**: none in HTML; 7 lines in `worker.js` and 16 in `brief.js` at HEAD (a concurrent edit is already fixing `worker.js`).
