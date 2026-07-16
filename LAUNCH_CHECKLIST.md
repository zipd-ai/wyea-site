# The Brief — pre-launch trial log

Everything verified against PRODUCTION (wyea.ai) before the subscribe link
goes anywhere public. "Public" = the moment wyea.ai/brief?src=... links go
into email signatures, outreach touches, or LinkedIn. Until every gate below
is checked, the page stays unannounced.

## Verified

- [x] Subscribe → double opt-in confirm → confirmed row (2026-07-16,
      whittle.anderson@gmail.com, source `brief-page`)
- [x] Confirm email: correct sender (The Brief by WYEA <brief@wyea.ai>),
      renders correctly in Gmail, lands in Primary inbox, not spam
- [x] Worker-side blast (`make send`): issue delivered to inbox from
      brief@wyea.ai; no credentials on the operator machine (2026-07-16)
- [x] Idempotency live: immediate rerun sends 0 ("nothing to send")
- [x] Multi-subscriber + late-confirm catch-up: second address
      (awhittlex2@gmail.com, source `trial-test`) confirmed AFTER the first
      blast; rerun delivered ONLY to it (2026-07-16, issue_sends shows both)
- [x] Source tracking: `source` column records placement (`brief-page`,
      `trial-test` both observed)
- [x] Bad/reused/expired operator tokens rejected (403); failed sends stay
      unlogged so reruns retry them (local, 2026-07-16)
- [x] Homepage footer band + /brief page forms both submit end to end

## Remaining gates — DO NOT go public until all checked

- [x] One-click unsubscribe from a real issue email footer (production),
      then resubscribe + reconfirm — full round trip verified 2026-07-16:
      unsubscribed_at set, fresh confirm email inboxed, re-confirm cleared
      suppression, and the issue was NOT re-sent afterward
- [x] Desktop trigger script path (make send: dry-run, count, y/N
      confirm, worker send) exercised end to end 2026-07-16 — "nothing to
      send" with all subscribers current. (Physical double-click of the
      .command file still worth doing once for feel.)
- [ ] Deliverability beyond Gmail: subscribe an Outlook/firm-domain address,
      confirm the blast lands in its INBOX (lawyer audience = Outlook heavy)
- [ ] PHYSICAL POSTAL ADDRESS in brief.js (POSTAL_ADDRESS) — CAN-SPAM
      requires a street or PO box in every issue; hard legal gate before any
      non-Anderson recipient
- [x] First real issue dress rehearsal DONE 2026-07-16: The-Brief-2026-07-16
      (9 items, every one verified against a fetched source; slip opinions
      read directly) committed + manifest, archive live at
      wyea.ai/brief/2026-07-16, blasted to the private list of 2, delivery
      confirmed in inbox, issue_sent events in the audit chain
- [x] Archive page lists the real issue (empty state gone) 2026-07-16
- [ ] Resend plan check: free tier = 100 emails/day; upgrade before the
      confirmed list approaches ~80

## Launch actions (after all gates pass)

1. Add `https://wyea.ai/brief?src=email-sig` to outreach signatures
2. Touch-3 gives and breakup emails link `?src=outreach`
3. LinkedIn issue posts link `?src=linkedin`
4. Log the newsletter channel in the sales tracker; subscriber counts via:
   `npx wrangler d1 execute wyea-leads --remote --command "SELECT source,
   COUNT(*) AS subscribes, SUM(confirmed_at IS NOT NULL) AS confirmed,
   SUM(unsubscribed_at IS NOT NULL) AS unsubscribed FROM subscribers
   GROUP BY source ORDER BY subscribes DESC"`

## Audit log (added 2026-07-16)

- [x] subscriber_events: append-only, hash-chained record of every
      subscribe / confirm / unsubscribe / resubscribe / issue-send.
      `make audit-verify` recomputes the chain; tamper test passes.
      Anchor habit: note the head hash in a commit message or email
      after each send. Head after issue 1: 13 events.
