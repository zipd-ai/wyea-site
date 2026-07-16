#!/usr/bin/env node
// Audit-log tooling for The Brief's subscriber_events chain.
//
//   node audit.mjs verify [--local]     recompute the hash chain; exit 1 on
//                                       any break. Prints the head hash —
//                                       note it somewhere external (a git
//                                       commit, an email) as an anchor.
//   node audit.mjs backfill [--local]   one-time: seed the chain from the
//                                       pre-audit-log state (subscribers +
//                                       issue_sends rows, plus the trial
//                                       events observed on 2026-07-16).
//                                       Refuses if events already exist.
//
// The chain gives tamper EVIDENCE, not tamper proofing: every row's hash
// covers the previous row's hash, so any edit, insertion, or deletion
// inside the log breaks verification. Truncating the tail is detectable
// only against an externally noted head hash — hence the anchor habit.

import { execFileSync } from "node:child_process";
import { eventHash } from "./brief.js";

const local = process.argv.includes("--local");
const cmd = process.argv[2];

if (cmd === "verify") await verify();
else if (cmd === "backfill") await backfill();
else {
  console.error("usage: node audit.mjs verify|backfill [--local]");
  process.exit(1);
}

async function verify() {
  const rows = d1("SELECT id, email, event, detail, ip, created_at, prev_hash, event_hash FROM subscriber_events ORDER BY id");
  if (!rows.length) {
    console.log("audit log is empty — nothing to verify.");
    return;
  }
  let prev = "genesis";
  for (const r of rows) {
    if (r.prev_hash !== prev) {
      console.error(`CHAIN BROKEN at event ${r.id}: prev_hash does not match the previous row`);
      process.exit(1);
    }
    const expect = await eventHash(r.prev_hash, r.email, r.event, r.detail, r.ip, r.created_at);
    if (expect !== r.event_hash) {
      console.error(`CHAIN BROKEN at event ${r.id}: row content does not match its hash`);
      process.exit(1);
    }
    prev = r.event_hash;
  }
  console.log(`chain OK: ${rows.length} events, head ${prev}`);
  console.log("anchor the head hash externally now and then (git commit message, an email to yourself).");
}

async function backfill() {
  const existing = d1("SELECT COUNT(*) AS n FROM subscriber_events");
  if (existing[0].n > 0) {
    console.error(`refusing: subscriber_events already has ${existing[0].n} row(s).`);
    process.exit(1);
  }
  const subs = d1("SELECT email, source, ip, created_at, confirmed_at FROM subscribers ORDER BY id");
  const sends = d1("SELECT issue, email, sent_at FROM issue_sends ORDER BY id");

  const events = [];
  for (const s of subs) {
    events.push({ email: s.email, event: "subscribed", detail: `${s.source || ""} (backfill)`, ip: s.ip || "", at: s.created_at });
    if (s.confirmed_at) {
      events.push({ email: s.email, event: "confirmed", detail: "(backfill)", ip: "", at: s.confirmed_at });
    }
  }
  for (const x of sends) {
    events.push({ email: x.email, event: "issue_sent", detail: `${x.issue} (backfill)`, ip: "", at: x.sent_at });
  }
  // Trial events observed live on 2026-07-16 whose state was later
  // overwritten by design (unsubscribe round trip; see LAUNCH_CHECKLIST.md).
  events.push({ email: "whittle.anderson@gmail.com", event: "unsubscribed", detail: "link (backfill, session-observed)", ip: "", at: "2026-07-16 22:00:52" });
  events.push({ email: "whittle.anderson@gmail.com", event: "resubscribe_requested", detail: "trial-test (backfill, session-observed)", ip: "", at: "2026-07-16 22:01:07" });
  events.push({ email: "whittle.anderson@gmail.com", event: "confirmed", detail: "after-unsubscribe (backfill, approx time)", ip: "", at: "2026-07-16 22:02:00" });

  events.sort((a, b) => a.at.localeCompare(b.at));

  let prev = "genesis";
  const values = [];
  for (const e of events) {
    const hash = await eventHash(prev, e.email, e.event, e.detail, e.ip, e.at);
    values.push(`('${q(e.email)}', '${q(e.event)}', '${q(e.detail)}', '${q(e.ip)}', '${q(e.at)}', '${prev}', '${hash}')`);
    prev = hash;
  }
  d1(`INSERT INTO subscriber_events (email, event, detail, ip, created_at, prev_hash, event_hash) VALUES ${values.join(", ")}`);
  console.log(`backfilled ${events.length} events, head ${prev}`);
}

function q(s) {
  return String(s).replaceAll("'", "''");
}

function d1(sql) {
  let out;
  try {
    out = execFileSync("npx", [
      "wrangler", "d1", "execute", "wyea-leads", local ? "--local" : "--remote",
      "--json", "--command", sql,
    ], { encoding: "utf8", maxBuffer: 32 * 1024 * 1024, stdio: ["ignore", "pipe", "pipe"] });
  } catch (err) {
    console.error(String(err.stderr || err.message).trim());
    process.exit(1);
  }
  return JSON.parse(out)[0]?.results || [];
}
