#!/usr/bin/env node
// Send an issue of The Brief to every confirmed subscriber.
//
//   node send-issue.mjs brief/issues/The-Brief-2026-07-15.md [--dry-run] [--test you@x.com] [--direct] [--local]
//
// DEFAULT MODE (worker): no credentials needed on this machine. The script
// mints a single-use operator token, writes its hash into the production
// database through wrangler (your existing Cloudflare login is the
// authorization), and asks the deployed Worker to do the sending with the
// Resend key it already holds in its secret store. The key never exists
// on this laptop. Batches loop automatically until the list is done.
//
// The send is IDEMPOTENT per issue: accepted sends are logged to
// issue_sends and logged recipients are excluded, so rerunning after a
// crash or by accident never sends the same issue to the same person
// twice. A rerun only retries failures and catches late confirms.
//
//   --dry-run   render + count only; writes a preview HTML next to the issue
//   --test X    send only to address X through Resend directly — requires
//               RESEND_API_KEY (env or gitignored .env); not logged
//   --direct    send from this machine via RESEND_API_KEY instead of the
//               Worker (the old path; kept as a fallback)
//   --local     target the local wrangler dev database + BRIEF_BLAST_URL
//               (for testing the worker path against `wrangler dev`)
//
// Publishing order matters: merge the issue (markdown + manifest entry) to
// main FIRST so the online/unsubscribe links resolve, then send.

import { readFileSync, writeFileSync } from "node:fs";
import { execFileSync } from "node:child_process";
import { basename } from "node:path";
import { createHash, randomBytes } from "node:crypto";
import { renderMarkdown, issueEmailHtml, issueEmailText, prettyDate } from "./brief.js";

// A gitignored .env next to this script may supply RESEND_API_KEY for the
// --test/--direct paths. Real environment variables win over the file.
try {
  for (const line of readFileSync(new URL(".env", import.meta.url), "utf8").split("\n")) {
    const m = line.match(/^([A-Z_]+)=(.*)$/);
    if (m && !(m[1] in process.env)) process.env[m[1]] = m[2];
  }
} catch {}

const SITE = "https://wyea.ai";
const FROM = process.env.BRIEF_FROM_EMAIL || "The Brief by WYEA <brief@wyea.ai>";
const SEND_INTERVAL_MS = 700; // direct mode: stay under Resend's 2 req/s

const args = process.argv.slice(2);
const dryRun = args.includes("--dry-run");
const local = args.includes("--local");
const direct = args.includes("--direct");
const testIdx = args.indexOf("--test");
const testAddress = testIdx >= 0 ? args[testIdx + 1] : null;
const issuePath = args.find((a) => a.endsWith(".md"));

if (!issuePath || (testIdx >= 0 && !testAddress)) {
  console.error("usage: node send-issue.mjs brief/issues/The-Brief-YYYY-MM-DD.md [--dry-run] [--test you@x.com] [--direct] [--local]");
  process.exit(1);
}
if ((direct || testAddress) && !dryRun && !process.env.RESEND_API_KEY) {
  console.error("--test/--direct send from this machine and need RESEND_API_KEY (env or .env).");
  console.error("The default worker mode needs no key — drop the flag.");
  process.exit(1);
}

const md = readFileSync(issuePath, "utf8");
const date = (basename(issuePath).match(/(\d{4}-\d{2}-\d{2})/) || [])[1];
if (!date) {
  console.error("issue filename must contain the date: The-Brief-YYYY-MM-DD.md");
  process.exit(1);
}
const heading = md.split("\n").find((l) => l.startsWith("# "));
const subject = heading ? heading.slice(2).trim() : `The Brief, ${prettyDate(date)}`;
const bodyHtml = issueEmailHtml(renderMarkdown(md), date);

if (dryRun) {
  const preview = issuePath.replace(/\.md$/, ".preview.html");
  writeFileSync(preview, bodyHtml
    .replaceAll("{{unsubscribe_url}}", `${SITE}/brief/unsubscribe?t=PREVIEW`)
    .replaceAll("{{referral_url}}", `${SITE}/brief?ref=preview`)
    .replaceAll("{{referral_count}}", "0")
    .replaceAll("{{share_url}}", `${SITE}/brief/share?t=PREVIEW`)
    .replaceAll("{{postal_address}}", process.env.POSTAL_ADDRESS || "WYEA, Newport Beach, California"));
  const list = testAddress ? [] : fetchSubscribers(date);
  console.log(`dry run: subject "${subject}", ${list.length} confirmed subscriber(s) not yet sent this issue.`);
  console.log(`preview written to ${preview}`);
  process.exit(0);
}

if (testAddress) {
  await directSend([{ email: testAddress, unsubscribe_token: "TEST" }], { log: false });
} else if (direct) {
  await directSend(fetchSubscribers(date), { log: true });
} else {
  await workerSend();
}

/* ---------- worker mode (default): the deployed Worker sends ---------- */

async function workerSend() {
  const blastUrl = process.env.BRIEF_BLAST_URL || `${SITE}/api/brief/blast`;
  let total = 0;
  let round = 0;
  for (;;) {
    const token = randomBytes(32).toString("hex");
    d1(`INSERT INTO operator_tokens (token_hash) VALUES ('${createHash("sha256").update(token).digest("hex")}')`);
    let res, data;
    try {
      res = await fetch(blastUrl, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ token, date, markdown: md }),
      });
      data = await res.json();
    } catch (err) {
      console.error(`could not reach the Worker at ${blastUrl}: ${err.message}`);
      process.exit(1);
    }
    if (!res.ok || !data.ok) {
      console.error(`blast failed (${res.status}): ${JSON.stringify(data)}`);
      process.exit(1);
    }
    total += data.sent;
    round++;
    console.log(`round ${round}: sent ${data.sent}, failed ${data.failed.length}, remaining ${data.remaining}`);
    if (data.failed.length) console.error(`  failed: ${data.failed.join(", ")} (rerun to retry)`);
    if (!data.remaining) {
      if (round === 1 && total === 0 && !data.failed.length) {
        console.log("nothing to send — every confirmed subscriber already received this issue.");
      } else {
        console.log(`done — ${total} email(s) sent by the Worker; the Resend key never left its vault.`);
      }
      process.exit(data.failed.length ? 1 : 0);
    }
    if (data.sent === 0) {
      console.error("no progress this round — stopping so a bad address can't loop forever. Rerun to retry.");
      process.exit(1);
    }
  }
}

/* ---------- direct mode (fallback): this machine sends via Resend ---------- */

async function directSend(recipients, { log }) {
  if (!recipients.length) {
    console.log("nothing to send — every confirmed subscriber already received this issue.");
    return;
  }
  console.log(`sending "${subject}" to ${recipients.length} recipient(s)...`);
  const failures = [];
  const sentUnflushed = [];
  for (const [i, r] of recipients.entries()) {
    const unsubUrl = `${SITE}/brief/unsubscribe?t=${r.unsubscribe_token}`;
    const fills = {
      "{{unsubscribe_url}}": unsubUrl,
      "{{referral_url}}": `${SITE}/brief?ref=${r.ref_code || "unknown"}`,
      "{{referral_count}}": String(r.ref_count || 0),
      "{{share_url}}": `${SITE}/brief/share?t=${r.unsubscribe_token}`,
      // Direct mode reads the address from env/.env; the worker path reads
      // its POSTAL_ADDRESS secret. Never commit the real address (public repo).
      "{{postal_address}}": process.env.POSTAL_ADDRESS || "WYEA, Newport Beach, California",
    };
    const fill = (s) => Object.entries(fills).reduce((acc, [k, v]) => acc.replaceAll(k, v), s);
    const res = await fetch("https://api.resend.com/emails", {
      method: "POST",
      headers: {
        Authorization: `Bearer ${process.env.RESEND_API_KEY}`,
        "Content-Type": "application/json",
        ...(log ? { "Idempotency-Key": idempotencyKey(date, r.email) } : {}),
      },
      body: JSON.stringify({
        from: FROM,
        to: [r.email],
        subject,
        text: fill(issueEmailText(md, date)),
        html: fill(bodyHtml),
        headers: {
          "List-Unsubscribe": `<${unsubUrl}>`,
          "List-Unsubscribe-Post": "List-Unsubscribe=One-Click",
        },
      }),
    });
    if (res.ok) {
      console.log(`  [${i + 1}/${recipients.length}] ${r.email} sent`);
      if (log) {
        sentUnflushed.push(r.email);
        if (sentUnflushed.length >= 25) flushSendLog(date, sentUnflushed);
      }
    } else {
      failures.push({ email: r.email, status: res.status, body: await res.text() });
      console.error(`  [${i + 1}/${recipients.length}] ${r.email} FAILED (${res.status})`);
    }
    if (i < recipients.length - 1) await new Promise((f) => setTimeout(f, SEND_INTERVAL_MS));
  }
  if (log) flushSendLog(date, sentUnflushed);
  if (failures.length) {
    console.error(`\n${failures.length} send(s) failed (rerun the same command to retry just these):`);
    for (const f of failures) console.error(`  ${f.email}: ${f.status} ${f.body}`);
    process.exit(1);
  }
  console.log("done — all sends accepted by Resend.");
}

/* ---------- shared ---------- */

function fetchSubscribers(issueDate) {
  // Direct mode generates any missing referral codes up front (the worker
  // path does it lazily per recipient).
  d1(`INSERT OR IGNORE INTO referral_codes (email, code)
      SELECT email, lower(hex(randomblob(4))) FROM subscribers
      WHERE confirmed_at IS NOT NULL AND unsubscribed_at IS NULL`);
  return d1(
    `SELECT s.email, s.unsubscribe_token, rc.code AS ref_code,
            (SELECT COUNT(*) FROM referrals r
             WHERE r.code = rc.code AND r.confirmed_at IS NOT NULL) AS ref_count
     FROM subscribers s
     LEFT JOIN referral_codes rc ON rc.email = s.email
     WHERE s.confirmed_at IS NOT NULL AND s.unsubscribed_at IS NULL
       AND NOT EXISTS (SELECT 1 FROM issue_sends x
                       WHERE x.issue = '${issueDate}' AND x.email = s.email)
     ORDER BY s.id`
  );
}

// Record accepted direct-mode sends. INSERT OR IGNORE: a row already logged
// (e.g. by an interrupted earlier run) is fine. Drains the passed array.
function flushSendLog(issueDate, emails) {
  if (!emails.length) return;
  const values = emails
    .map((e) => `('${issueDate}', '${e.replaceAll("'", "''")}')`)
    .join(", ");
  d1(`INSERT OR IGNORE INTO issue_sends (issue, email) VALUES ${values}`);
  emails.length = 0;
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
    console.error("\ncould not reach the subscriber database — check that `npx wrangler login`");
    console.error("has run and that schema.sql was applied (--remote for the live database).");
    process.exit(1);
  }
  return JSON.parse(out)[0]?.results || [];
}

function idempotencyKey(issueDate, email) {
  const contentHash = createHash("sha256").update(bodyHtml).digest("hex").slice(0, 12);
  return `brief-${issueDate}-${contentHash}-${createHash("sha256").update(email).digest("hex").slice(0, 24)}`;
}
