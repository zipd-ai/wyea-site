# Decisions

Answers to "Before you start" in the WYEA Website Rebuild Runbook. These override the brief.
Recorded 2026-10-07. Where Anderson took the runbook default, the row says so.

| Decision | Answer | Source |
|---|---|---|
| Legal name in footer, copyright and schema | WYEA LLC, the name on contracts | Default |
| Law firm material: /custom-ai-for-law-firms, the "Two lines of work" section, the law firm FAQ, The Brief banner | Remove from navigation and home. Keep the URLs live, unlinked and set to noindex | Default |
| Prototype price | "Fixed price, quoted before work starts" everywhere. The prototype is no longer described as free. The first call stays at no charge | Anderson, 2026-10-07 |
| Published starting prices | Keep "Builds start at $25,000. The monthly fee starts at $5,500 and covers hosting, support and every model provider cost." Add "Multi-entity groups are quoted at a fixed price after the prototype." | Default |
| Vendor-review facts (MFA, encryption in transit, breach-notice window, security reps and warranties) | Each row reads "Ask us" until Anderson or Johnson confirms in writing | Default |
| 551-insurer engineering data | Build the research template only. Publish nothing | Default |
| Events page | None | Default |
| Principal photos, LinkedIn URLs, logo file URL | Photos exist in assets/. Any missing item is a placeholder that blocks launch | Default |
| Who merges to production | The agent opens the pull request. Anderson merges | Default |
| Visual direction | Direction A (2026-10-08): light, Geist, indigo accent, rounded cards, product-led. Replaces the August white, ink and oxblood look | Anderson, 2026-10-08 |
| Website brief file | Not in the repo yet. Work from the runbook's approved statements, vendor-review table and search rows until Anderson adds it | Anderson, 2026-10-07 |

## Open items

- Add `WYEA_Website_Brief_2026-09-27.md` from the Go-To-Market project to this folder. Sections 6, 7 and 9 were applied from the runbook's summary of them, not the brief itself.
- Confirm the four "Ask us" rows in vendor-review.md in writing.

## 2026-10-08

- Positioning (Anderson): insights and drafting, focused on policy and claims workflow optimization and automation. Homepage, /insurance and llms.txt updated. New lines to confirm: "Claims, checked against cover: find the wording that applies to a claim, with its source" and "Routine steps, automated: drafts and checks run on their own; your reviewer signs off."
- Billing removed from the privacy policy: the platform has no billing system.
- The "one week" prototype timeframe is dropped everywhere (Anderson, 2026-10-08). No delivery time is promised; the prototype stays fixed price, quoted before work starts.
