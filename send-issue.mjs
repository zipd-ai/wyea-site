#!/usr/bin/env node
// Send an issue of The Brief to every confirmed subscriber.
//
//   RESEND_API_KEY=... node send-issue.mjs brief/issues/The-Brief-2026-07-15.md [--dry-run] [--test you@x.com]
//
// Reads the confirmed, not-unsubscribed list from the remote D1 database
// (via wrangler, so `npx wrangler login` must have run), renders the issue
// markdown with the same renderer the archive pages use, and sends one email
// per subscriber through Resend with a personalized unsubscribe link and
// RFC 8058 one-click List-Unsubscribe headers.
//
//   --dry-run   render + count only; writes a preview HTML next to the issue
//   --test X    send the rendered issue only to address X, nothing else
//
// Publishing order matters: merge the issue (markdown + manifest entry) to
// main FIRST so the online/unsubscribe links resolve, then send.

import { readFileSync, writeFileSync } from "node:fs";
import { execFileSync } from "node:child_process";
import { basename } from "node:path";
import { renderMarkdown } from "./brief.js";

const SITE = "https://wyea.ai";
const FROM = process.env.BRIEF_FROM_EMAIL || "The Brief by WYEA <brief@wyea.ai>";
// CAN-SPAM requires a valid physical postal address in every issue.
// TODO(anderson): set the street or PO box address before the first send.
const POSTAL_ADDRESS = "WYEA, Newport Beach, California";
const SIGNATURE = "Curated by WYEA, Newport Beach - firm-owned drafting and review tools.";
const SEND_INTERVAL_MS = 700; // stay under Resend's default 2 req/s

const args = process.argv.slice(2);
const dryRun = args.includes("--dry-run");
const testIdx = args.indexOf("--test");
const testAddress = testIdx >= 0 ? args[testIdx + 1] : null;
const issuePath = args.find((a) => a.endsWith(".md"));

if (!issuePath || (testIdx >= 0 && !testAddress)) {
  console.error("usage: node send-issue.mjs brief/issues/The-Brief-YYYY-MM-DD.md [--dry-run] [--test you@x.com]");
  process.exit(1);
}
if (!dryRun && !process.env.RESEND_API_KEY) {
  console.error("RESEND_API_KEY is not set (find it in the Resend dashboard).");
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

const bodyHtml = emailHtml(renderMarkdown(md), date);
const text = `${md}\n\n--\n${SIGNATURE}\n${POSTAL_ADDRESS}\nRead online: ${SITE}/brief/${date}\nUnsubscribe: {{unsubscribe_url}}`;

if (dryRun) {
  const preview = issuePath.replace(/\.md$/, ".preview.html");
  writeFileSync(preview, bodyHtml.replaceAll("{{unsubscribe_url}}", `${SITE}/brief/unsubscribe?t=PREVIEW`));
  const list = testAddress ? [] : fetchSubscribers();
  console.log(`dry run: subject "${subject}", ${list.length} confirmed subscriber(s).`);
  console.log(`preview written to ${preview}`);
  process.exit(0);
}

const recipients = testAddress
  ? [{ email: testAddress, unsubscribe_token: "TEST" }]
  : fetchSubscribers();

if (!recipients.length) {
  console.log("no confirmed subscribers — nothing to send.");
  process.exit(0);
}

console.log(`sending "${subject}" to ${recipients.length} recipient(s)...`);
const failures = [];
for (const [i, r] of recipients.entries()) {
  const unsubUrl = `${SITE}/brief/unsubscribe?t=${r.unsubscribe_token}`;
  const res = await fetch("https://api.resend.com/emails", {
    method: "POST",
    headers: {
      Authorization: `Bearer ${process.env.RESEND_API_KEY}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      from: FROM,
      to: [r.email],
      subject,
      text: text.replaceAll("{{unsubscribe_url}}", unsubUrl),
      html: bodyHtml.replaceAll("{{unsubscribe_url}}", unsubUrl),
      headers: {
        "List-Unsubscribe": `<${unsubUrl}>`,
        "List-Unsubscribe-Post": "List-Unsubscribe=One-Click",
      },
    }),
  });
  if (res.ok) {
    console.log(`  [${i + 1}/${recipients.length}] ${r.email} sent`);
  } else {
    failures.push({ email: r.email, status: res.status, body: await res.text() });
    console.error(`  [${i + 1}/${recipients.length}] ${r.email} FAILED (${res.status})`);
  }
  if (i < recipients.length - 1) await new Promise((f) => setTimeout(f, SEND_INTERVAL_MS));
}

if (failures.length) {
  console.error(`\n${failures.length} send(s) failed:`);
  for (const f of failures) console.error(`  ${f.email}: ${f.status} ${f.body}`);
  process.exit(1);
}
console.log("done — all sends accepted by Resend.");

function fetchSubscribers() {
  const out = execFileSync("npx", [
    "wrangler", "d1", "execute", "wyea-leads", "--remote", "--json",
    "--command",
    "SELECT email, unsubscribe_token FROM subscribers WHERE confirmed_at IS NOT NULL AND unsubscribed_at IS NULL ORDER BY id",
  ], { encoding: "utf8", maxBuffer: 32 * 1024 * 1024 });
  const parsed = JSON.parse(out);
  return parsed[0]?.results || [];
}

function emailHtml(rendered, issueDate) {
  // Inline the styles the archive page gets from its stylesheet — email
  // clients are unreliable with <style> blocks.
  const styled = rendered
    .replaceAll("<h1>", '<h1 style="font-family:Georgia,serif;font-weight:500;font-size:26px;line-height:1.2;color:#16213a;margin:0 0 12px">')
    .replaceAll("<h2>", '<h2 style="font-size:13px;font-weight:600;letter-spacing:0.14em;text-transform:uppercase;color:#8a6a2f;margin:28px 0 10px">')
    .replaceAll("<h3>", '<h3 style="font-size:17px;font-weight:600;color:#16213a;margin:20px 0 4px">')
    .replaceAll("<p>", '<p style="font-size:15px;line-height:1.6;color:#3c4763;margin:6px 0">')
    .replaceAll("<ul>", '<ul style="font-size:15px;line-height:1.6;color:#3c4763;margin:6px 0 6px 20px;padding:0">')
    .replaceAll("<hr>", '<hr style="border:0;border-top:1px solid #e3ddd1;margin:24px 0">')
    .replaceAll("<a ", '<a style="color:#8a6a2f" ');
  return `<div style="font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',sans-serif;background:#faf8f4;padding:24px 8px">
  <div style="max-width:600px;margin:0 auto;background:#ffffff;border:1px solid #e3ddd1;border-radius:10px;padding:28px 30px">
    <p style="font-size:12px;letter-spacing:0.12em;text-transform:uppercase;color:#8a6a2f;font-weight:600;margin:0 0 18px">
      The Brief · ${prettyDate(issueDate)} ·
      <a href="${SITE}/brief/${issueDate}" style="color:#8a6a2f">read online</a></p>
    ${styled}
    <p style="font-size:12px;color:#8b94ad;border-top:1px solid #e3ddd1;padding-top:14px;margin:28px 0 0;line-height:1.6">
      ${SIGNATURE}<br>
      ${POSTAL_ADDRESS}<br>
      <a href="{{unsubscribe_url}}" style="color:#8b94ad">Unsubscribe</a> with one click, anytime.</p>
  </div>
</div>`;
}

function prettyDate(iso) {
  const [y, m, d] = iso.split("-").map(Number);
  const months = ["January", "February", "March", "April", "May", "June",
    "July", "August", "September", "October", "November", "December"];
  return `${months[m - 1]} ${d}, ${y}`;
}
