# The Brief — referral loop (Stage 3 growth engine)

TLDR-style referral mechanics on the owned stack: no beehiiv, the list and
the referral graph live in our D1 database, and the same double-opt-in gate
that keeps the list clean is what makes referral credit fraud-resistant.

## How it works (subscriber's view)

1. Every issue footer carries: "Forward this to one colleague who would
   use it. Or share your personal link: wyea.ai/brief?ref=<code>", their
   confirmed-referral count, and a "track your rewards" link.
2. A colleague opens the link, subscribes, and confirms (double opt-in).
3. The referrer's count increments AT CONFIRM TIME, never at signup.
4. Crossing a tier (3 confirmed referrals) triggers an email to the
   referrer ("You unlocked the WYEA practice-area prompt pack, reply and
   we will send it over") and a fulfillment notification to the operator.
5. `/brief/share?t=<their token>` shows their link, live count, and tier
   progress, authenticated by the unsubscribe token already in their email.

## Technical components

| Piece | Where | Behavior |
|---|---|---|
| `referral_codes` | schema.sql | one stable share code per email, generated lazily (worker) or in bulk (direct send) |
| `referrals` | schema.sql | one row per referee, `UNIQUE(referee_email)` = first link wins; `confirmed_at` = the credit moment; signup `ip` kept for fraud review |
| `reward_grants` | schema.sql | `UNIQUE(email, tier)` = a tier pays out exactly once |
| `?ref=` capture | brief.js `briefPage` + subscribe API | hidden form field → validated (code exists, not self-referral) → attribution recorded, `source` defaults to `referral` |
| Credit | brief.js `creditReferral`, called from the confirm handler | stamps `referrals.confirmed_at`, logs `referral_confirmed`, checks tiers, grants + emails on crossing |
| Footer merge fields | brief.js issue templates | `{{referral_url}}`, `{{referral_count}}`, `{{share_url}}` substituted per recipient in both worker and direct sends |
| Share page | brief.js `sharePage` (`GET /brief/share?t=`) | personal link, count, tier list |
| Audit | subscriber_events chain | `referred_signup`, `referral_confirmed`, `reward_granted` — all hash-chained like every other lifecycle event |

## Fraud posture

- Credit requires the referee to CLICK a confirmation email: inventing
  addresses earns nothing, bots hitting the subscribe API earn nothing.
- Self-referral blocked (code owner's email compared to subscriber email).
- One referrer per referee, permanently (first link wins) — no credit
  poaching by re-subscribing someone.
- Referee signup IP is stored next to the attribution; before fulfilling a
  reward, eyeball it:
  `SELECT referee_email, ip, confirmed_at FROM referrals WHERE code =
  (SELECT code FROM referral_codes WHERE email = '<referrer>');`
- Credit is not clawed back if a referee later unsubscribes (TLDR behaves
  the same; revisit only if abused).

## Reward tiers

Defined in `REFERRAL_TIERS` (brief.js). Currently:

- **3 confirmed referrals → the WYEA practice-area prompt pack.**
  Fulfillment is MANUAL by design: the referrer is told "reply and we will
  send it over" and the operator gets a notification email. Nothing is
  promised that does not exist yet — build the prompt pack before the
  first subscriber gets close to 3.

Adding a tier = one line in `REFERRAL_TIERS` (e.g. `{ count: 10, name:
"early access to a tool feature" }`). Grants are per-tier idempotent.

## Activation plan

- The machinery ships dormant: footers show the forward line + personal
  link from the next send onward; the tier only matters once people share.
- At ~200 subscribers (the stage gate), consider: a dedicated referral
  section in the issue template, a milestone leaderboard, and the second
  tier. The plumbing already supports all of it.

## Metrics

```
-- top referrers
SELECT rc.email, COUNT(*) AS confirmed_referrals
FROM referrals r JOIN referral_codes rc ON rc.code = r.code
WHERE r.confirmed_at IS NOT NULL GROUP BY rc.email ORDER BY 2 DESC;

-- funnel: attributed signups vs confirmed
SELECT COUNT(*) AS signups, SUM(confirmed_at IS NOT NULL) AS confirmed
FROM referrals;
```

Referred subscribers also carry `source = 'referral'` in the normal
channel-metrics query (README).
