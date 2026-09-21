// The Brief — WYEA's weekly legal newsletter (free, double opt-in).
//
// Routes (dispatched from worker.js):
//   POST /api/subscribe        — store a pending subscriber, email a confirm link
//   GET  /brief                — subscribe page + format sample + issue archive
//   GET  /brief/confirm        — double opt-in landing (?t=confirm_token)
//   GET  /brief/unsubscribe    — one-click unsubscribe (?t=unsubscribe_token);
//        POST accepted too, for RFC 8058 List-Unsubscribe one-click
//   GET  /brief/YYYY-MM-DD     — an archived issue, rendered from the committed
//        markdown at brief/issues/The-Brief-YYYY-MM-DD.md
//
// The list is owned: subscribers live in the same D1 database as the
// contact-form leads (schema.sql). Rows are never deleted — an unsubscribe
// sets unsubscribed_at, so the suppression is never forgotten.
//
// Secrets/vars: RESEND_API_KEY (shared with the contact form). BRIEF_FROM_EMAIL
// optionally overrides the sender; the default needs only the already-verified
// wyea.ai domain in Resend. Without a key (local dev) the confirm link is
// logged to the console instead of emailed, so the flow tests end to end.

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
const MAX_EMAIL = 254;
const MAX_SOURCE = 64;
const SUBSCRIBES_PER_IP_PER_HOUR = 10;
const EMAIL_COOLDOWN_MINUTES = 10; // at most one email per address per window
const DEFAULT_FROM = "The Brief by WYEA <brief@wyea.ai>";

export async function handleBrief(request, env, ctx, url) {
  const path = url.pathname.replace(/\/+$/, "") || "/";

  if (path === "/api/subscribe") {
    if (request.method !== "POST") return json({ error: "method not allowed" }, 405);
    try {
      return await handleSubscribe(request, env, url);
    } catch (err) {
      console.error("subscribe error:", err);
      return json({ error: "server error" }, 500);
    }
  }

  if (path === "/api/resend-events") {
    if (request.method !== "POST") return json({ error: "method not allowed" }, 405);
    try {
      return await handleResendEvents(request, env);
    } catch (err) {
      console.error("resend webhook error:", err);
      return json({ error: "server error" }, 500);
    }
  }

  if (path === "/api/brief/blast") {
    if (request.method !== "POST") return json({ error: "method not allowed" }, 405);
    try {
      return await handleBlast(request, env, url);
    } catch (err) {
      console.error("blast error:", err);
      return json({ error: "server error" }, 500);
    }
  }

  if (path === "/brief" && request.method === "GET") return briefPage(env, url);
  if (path === "/brief/share" && request.method === "GET") return sharePage(env, url);
  if (path === "/brief/confirm") return confirmPage(env, url);
  if (path === "/brief/unsubscribe") return unsubscribePage(request, env, url);

  const issue = path.match(/^\/brief\/(\d{4}-\d{2}-\d{2})$/);
  if (issue && request.method === "GET") return issuePage(env, url, issue[1]);

  return null; // not a Brief route — worker.js falls through to assets
}

/* ---------- subscribe ---------- */

async function handleSubscribe(request, env, url) {
  let body;
  try {
    body = await request.json();
  } catch {
    return json({ error: "bad request" }, 400);
  }

  // Honeypot: a person never fills the hidden field. Pretend success.
  if (body.website) return json({ ok: true });

  const email = clean(body.email, MAX_EMAIL).toLowerCase();
  const ref = clean(body.ref, 16).toLowerCase();
  const source = clean(body.source, MAX_SOURCE) || (ref ? "referral" : "unknown");
  if (!EMAIL_RE.test(email)) {
    return json({ error: "please enter a valid email address" }, 400);
  }

  let row = await env.DB.prepare("SELECT * FROM subscribers WHERE email = ?1")
    .bind(email).first();

  // Cooldown: whatever the state, one email per address per window. The
  // response is the same as success so repeat submits stay quiet.
  if (row && row.confirm_sent_at) {
    const recent = await env.DB.prepare(
      `SELECT 1 AS hit FROM subscribers
       WHERE email = ?1 AND confirm_sent_at > datetime('now', '-${EMAIL_COOLDOWN_MINUTES} minutes')`
    ).bind(email).first();
    if (recent) return json({ ok: true });
  }

  const ip = request.headers.get("CF-Connecting-IP") || "";
  if (!row) {
    const recent = await env.DB.prepare(
      "SELECT COUNT(*) AS n FROM subscribers WHERE ip = ?1 AND created_at > datetime('now', '-1 hour')"
    ).bind(ip).first();
    if (recent && recent.n >= SUBSCRIBES_PER_IP_PER_HOUR) {
      return json({ error: "too many sign-ups from this connection, please try again later" }, 429);
    }
    row = {
      email,
      confirm_token: randomToken(),
      unsubscribe_token: randomToken(),
      confirmed_at: null,
      unsubscribed_at: null,
    };
    await env.DB.prepare(
      `INSERT INTO subscribers (email, source, confirm_token, unsubscribe_token, ip)
       VALUES (?1, ?2, ?3, ?4, ?5)`
    ).bind(email, source, row.confirm_token, row.unsubscribe_token, ip).run();
    await logEvent(env, email, "subscribed", source, ip);
    // Referral attribution: only for brand-new signups, only when the code
    // is real and not the subscriber's own. First link wins (UNIQUE email).
    if (ref) {
      try {
        const owner = await env.DB.prepare("SELECT email FROM referral_codes WHERE code = ?1")
          .bind(ref).first();
        if (owner && owner.email !== email) {
          await env.DB.prepare(
            "INSERT OR IGNORE INTO referrals (referee_email, code, ip) VALUES (?1, ?2, ?3)"
          ).bind(email, ref, ip).run();
          await logEvent(env, email, "referred_signup", `code:${ref}`, ip);
        }
      } catch (err) {
        console.error("referral attribution failed:", err);
      }
    }
  } else if (row.unsubscribed_at) {
    await logEvent(env, email, "resubscribe_requested", source, ip);
  }

  // Active subscribers get a short note instead of a confirm link; everyone
  // else (new, pending, or previously unsubscribed) gets the confirm email.
  // Re-subscribing after an unsubscribe is a fresh consent, so it re-confirms.
  const active = row.confirmed_at && !row.unsubscribed_at;
  const sent = active
    ? await sendAlreadySubscribed(env, url.origin, row)
    : await sendConfirm(env, url.origin, row);
  if (!sent) {
    return json({ error: "we could not send the confirmation email, please try again in a minute" }, 500);
  }
  await logEvent(env, email, active ? "already_subscribed_note_sent" : "confirm_email_sent", "", ip);
  await env.DB.prepare("UPDATE subscribers SET confirm_sent_at = datetime('now') WHERE email = ?1")
    .bind(email).run();
  return json({ ok: true });
}

/* ---------- operator blast ----------
   Sends an issue to every confirmed subscriber using the Worker's own
   Resend key, so the key never leaves the secret store. Authorized by a
   single-use token whose SHA-256 was written to operator_tokens through
   wrangler — i.e. by someone already authenticated to the Cloudflare
   account; the token is consumed on use and expires in 15 minutes.
   Idempotent per issue via the same issue_sends log as the direct send
   path. Capped per invocation to respect Worker subrequest limits; the
   caller (send-issue.mjs) loops on `remaining` with a fresh token. */

const BLAST_BATCH = 25;
const MAX_ISSUE_BYTES = 200_000;

async function handleBlast(request, env, url) {
  let body;
  try {
    body = await request.json();
  } catch {
    return json({ error: "bad request" }, 400);
  }
  const token = clean(body.token, 64);
  const date = clean(body.date, 10);
  const markdown = typeof body.markdown === "string" ? body.markdown : "";
  if (!token || !/^\d{4}-\d{2}-\d{2}$/.test(date) || !markdown || markdown.length > MAX_ISSUE_BYTES) {
    return json({ error: "bad request" }, 400);
  }

  const grant = await env.DB.prepare(
    `SELECT id FROM operator_tokens
     WHERE token_hash = ?1 AND used_at IS NULL
       AND created_at > datetime('now', '-15 minutes')`
  ).bind(await sha256Hex(token)).first();
  if (!grant) return json({ error: "invalid or expired operator token" }, 403);
  await env.DB.prepare("UPDATE operator_tokens SET used_at = datetime('now') WHERE id = ?1")
    .bind(grant.id).run();

  const { results: eligible } = await env.DB.prepare(
    `SELECT s.email, s.unsubscribe_token FROM subscribers s
     WHERE s.confirmed_at IS NOT NULL AND s.unsubscribed_at IS NULL
       AND NOT EXISTS (SELECT 1 FROM issue_sends x WHERE x.issue = ?1 AND x.email = s.email)
     ORDER BY s.id`
  ).bind(date).all();

  // Subject is always just "The Brief" (owner's call); the date lives in
  // the email body title and the markdown h1.
  const subject = "The Brief";
  const rendered = renderMarkdown(markdown);
  // Content hash in the idempotency key: a crash-rerun of the same issue
  // still dedupes at Resend, but an intentional re-send of CHANGED content
  // is a new key instead of a 409 conflict. Hashed over the final email
  // HTML so template changes count as new content too.
  const contentHash = (await sha256Hex(issueEmailHtml(rendered, date))).slice(0, 12);

  const batch = eligible.slice(0, BLAST_BATCH);
  let sent = 0;
  const failed = [];
  const htmlTemplate = issueEmailHtml(rendered, date);
  const textTemplate = issueEmailText(markdown, date);
  for (const r of batch) {
    const unsubUrl = `${url.origin}/brief/unsubscribe?t=${r.unsubscribe_token}`;
    const code = await referralCode(env, r.email);
    const fills = {
      "{{unsubscribe_url}}": unsubUrl,
      "{{referral_url}}": `${url.origin}/brief?ref=${code}`,
      "{{referral_count}}": String(await referralCount(env, code)),
      "{{share_url}}": `${url.origin}/brief/share?t=${r.unsubscribe_token}`,
      "{{postal_address}}": env.POSTAL_ADDRESS || POSTAL_ADDRESS_FALLBACK,
    };
    const fill = (s) => Object.entries(fills).reduce((acc, [k, v]) => acc.replaceAll(k, v), s);
    const ok = await sendEmail(env, {
      to: r.email,
      subject,
      text: fill(textTemplate),
      html: fill(htmlTemplate),
      emailHeaders: {
        "List-Unsubscribe": `<${unsubUrl}>`,
        "List-Unsubscribe-Post": "List-Unsubscribe=One-Click",
      },
      idempotencyKey: `brief-${date}-${contentHash}-${(await sha256Hex(r.email)).slice(0, 24)}`,
    });
    if (ok) {
      await env.DB.prepare("INSERT OR IGNORE INTO issue_sends (issue, email) VALUES (?1, ?2)")
        .bind(date, r.email).run();
      await logEvent(env, r.email, "issue_sent", date);
      sent++;
    } else {
      failed.push(r.email);
    }
  }
  return json({ ok: true, sent, failed, remaining: eligible.length - batch.length });
}

/* ---------- confirm / unsubscribe ---------- */

async function confirmPage(env, url) {
  const token = clean(url.searchParams.get("t"), 64);
  const row = token
    ? await env.DB.prepare("SELECT * FROM subscribers WHERE confirm_token = ?1").bind(token).first()
    : null;
  if (!row) {
    return page("The Brief", statusCard(
      "That link did not work",
      `This confirmation link is not valid. If you are trying to subscribe,
       <a href="/brief">start again here</a> and we will send a fresh link.`
    ), 404);
  }
  await env.DB.prepare(
    `UPDATE subscribers
     SET confirmed_at = COALESCE(confirmed_at, datetime('now')), unsubscribed_at = NULL
     WHERE confirm_token = ?1`
  ).bind(token).run();
  await logEvent(env, row.email, "confirmed", row.unsubscribed_at ? "after-unsubscribe" : "");
  // Double opt-in complete: if someone referred this subscriber, the
  // referrer's credit exists as of this moment (and never before it).
  if (!row.confirmed_at || row.unsubscribed_at) {
    await creditReferral(env, url, row.email);
  }
  // Tell the operator the list grew — same channel as contact-form leads.
  // Only on a real state change: repeat clicks of the same link stay quiet.
  if (env.CONTACT_EMAIL && (!row.confirmed_at || row.unsubscribed_at)) {
    try {
      await sendEmail(env, {
        to: env.CONTACT_EMAIL,
        subject: `The Brief: new subscriber confirmed (${row.email})`,
        text: [
          `${row.email} just confirmed their subscription to The Brief.`,
          `Source: ${row.source || "unknown"}${row.unsubscribed_at ? " (resubscribe after an unsubscribe)" : ""}`,
        ].join("\n"),
      });
    } catch (err) {
      console.error("subscriber notification failed:", err);
    }
  }
  return page("You're in | The Brief", statusCard(
    "You're in.",
    `First issue arrives Wednesday. One email a week, readable in four minutes.
     Until then, <a href="/brief">the archive</a> has past issues.`
  ));
}

async function unsubscribePage(request, env, url) {
  const token = clean(url.searchParams.get("t"), 64);
  const row = token
    ? await env.DB.prepare("SELECT * FROM subscribers WHERE unsubscribe_token = ?1").bind(token).first()
    : null;
  if (!row) {
    return request.method === "POST"
      ? json({ error: "unknown token" }, 404)
      : page("The Brief", statusCard(
          "That link did not work",
          `This unsubscribe link is not valid. If you keep receiving The Brief
           and want out, reply to any issue and we will remove you by hand.`
        ), 404);
  }
  await env.DB.prepare(
    "UPDATE subscribers SET unsubscribed_at = COALESCE(unsubscribed_at, datetime('now')) WHERE unsubscribe_token = ?1"
  ).bind(token).run();
  if (!row.unsubscribed_at) {
    await logEvent(env, row.email, "unsubscribed", request.method === "POST" ? "one-click" : "link");
  }
  // RFC 8058 one-click POST (mail clients) gets a plain 200; a person in a
  // browser gets the page.
  if (request.method === "POST") return json({ ok: true });
  return page("Unsubscribed | The Brief", statusCard(
    "You're unsubscribed.",
    `No more issues will be sent to ${escapeHtml(row.email)}. If you change
     your mind, you can <a href="/brief">resubscribe anytime</a>.`
  ));
}

/* ---------- emails ---------- */

async function sendConfirm(env, origin, row) {
  const link = `${origin}/brief/confirm?t=${row.confirm_token}`;
  return sendEmail(env, {
    to: row.email,
    subject: "Confirm your subscription to The Brief",
    text: [
      "You (or someone using this address) asked to subscribe to The Brief,",
      "WYEA's weekly legal newsletter.",
      "",
      `Confirm your subscription: ${link}`,
      "",
      "One email a week. No spam. Unsubscribe anytime.",
      "If you did not request this, ignore this email and nothing will happen.",
      "",
      "The Brief by WYEA, Newport Beach, California",
    ].join("\n"),
    html: emailShell(`
      <p>You (or someone using this address) asked to subscribe to
      <strong>The Brief</strong>, WYEA's weekly legal newsletter.</p>
      <p style="margin:28px 0"><a href="${link}" style="background:#191713;color:#ffffff;
      padding:12px 24px;border-radius: 0;text-decoration:none;font-weight:600">
      Confirm subscription</a></p>
      <p>Or open this link: <a href="${link}">${link}</a></p>
      <p>One email a week. No spam. Unsubscribe anytime.<br>
      If you did not request this, ignore this email and nothing will happen.</p>
    `),
  });
}

async function sendAlreadySubscribed(env, origin, row) {
  const unsub = `${origin}/brief/unsubscribe?t=${row.unsubscribe_token}`;
  return sendEmail(env, {
    to: row.email,
    subject: "You're already subscribed to The Brief",
    text: [
      "Good news: this address is already subscribed to The Brief, so there is",
      "nothing to do. The next issue arrives Wednesday.",
      "",
      `If you meant to unsubscribe instead: ${unsub}`,
      "",
      "The Brief by WYEA, Newport Beach, California",
    ].join("\n"),
    html: emailShell(`
      <p>Good news: this address is already subscribed to <strong>The Brief</strong>,
      so there is nothing to do. The next issue arrives Wednesday.</p>
      <p>If you meant to unsubscribe instead: <a href="${unsub}">${unsub}</a></p>
    `),
  });
}

async function sendEmail(env, { to, subject, text, html, emailHeaders, idempotencyKey }) {
  if (!env.RESEND_API_KEY) {
    // Local dev: no key configured — log instead of send so the flow still
    // works end to end (the link is in the console).
    console.log(`[brief] email skipped (no RESEND_API_KEY). To: ${to} — ${subject}\n${text}`);
    return true;
  }
  const res = await fetch("https://api.resend.com/emails", {
    method: "POST",
    headers: {
      Authorization: `Bearer ${env.RESEND_API_KEY}`,
      "Content-Type": "application/json",
      ...(idempotencyKey ? { "Idempotency-Key": idempotencyKey } : {}),
    },
    body: JSON.stringify({
      from: env.BRIEF_FROM_EMAIL || DEFAULT_FROM,
      to: [to],
      subject,
      text,
      html,
      ...(emailHeaders ? { headers: emailHeaders } : {}),
    }),
  });
  if (!res.ok) console.error("brief resend failed:", res.status, await res.text());
  return res.ok;
}

/* ---------- issue email (shared with send-issue.mjs) ----------
   The markdown issue rendered as the weekly email. Inline styles: email
   clients are unreliable with <style> blocks. {{unsubscribe_url}} is
   substituted per recipient. */

export const SIGNATURE = "Curated by WYEA, Newport Beach - firm-owned drafting and review tools.";
// CAN-SPAM postal address. The real street/PO-box line lives in the
// POSTAL_ADDRESS Worker secret (this repo is public — a mailing address
// belongs in outgoing email, not in source). Issue templates carry a
// {{postal_address}} merge field filled at send time; this fallback keeps
// dev rendering sane but is NOT compliant on its own.
export const POSTAL_ADDRESS_FALLBACK = "WYEA, Newport Beach, California";
const SITE = "https://wyea.ai";

export function issueEmailText(markdown, issueDate, unsubUrl) {
  return `${markdown}\n\n--\nForward this to one colleague who would use it.\nOr share your personal link: {{referral_url}} ({{referral_count}} confirmed referrals so far)\nTrack your rewards: {{share_url}}\n\n${SIGNATURE}\n{{postal_address}}\nRead online: ${SITE}/brief/${issueDate}\nUnsubscribe: ${unsubUrl || "{{unsubscribe_url}}"}`;
}

export function issueEmailHtml(rendered, issueDate) {
  // TLDR-style layout: centered header (links row, wordmark, issue title),
  // left-aligned items below. Table-based with align="center" cells —
  // margin:0 auto centering is ignored by enough mobile clients (Gmail
  // app included) that tables remain the only reliable way to center in
  // email. Font stack repeated per cell for the same reason.
  const FONT = "-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,Helvetica,Arial,sans-serif";
  const styled = rendered
    // The wordmark above already says The Brief; the title shows only the
    // date (the full "The Brief, <date>" stays as the email subject).
    .replace(/<h1>The Brief,\s*/, "<h1>")
    .replaceAll("<h1>", `<h1 align="center" style="font-family:${FONT};font-size:19px;font-weight:700;color:#191713;text-align:center;margin:6px 0 26px">`)
    .replaceAll("<h2>", `<h2 align="center" style="font-family:${FONT};font-size:13px;font-weight:600;letter-spacing:0.14em;text-transform:uppercase;color:#5a1723;text-align:center;margin:30px 0 10px">`)
    .replaceAll("<h3>", `<h3 align="center" style="font-family:${FONT};font-size:17px;font-weight:600;color:#191713;text-align:center;margin:20px 0 4px">`)
    .replaceAll("<p>", `<p align="center" style="font-family:${FONT};font-size:15px;line-height:1.6;color:#1f2733;text-align:center;margin:8px 0">`)
    .replaceAll("<ul>", `<ul style="font-family:${FONT};font-size:15px;line-height:1.6;color:#1f2733;margin:8px 0 8px 20px;padding:0">`)
    .replaceAll("<hr>", '<hr style="border:0;border-top:1px solid #e7e5e0;margin:24px 0">')
    .replaceAll("<a ", '<a style="color:#191713;text-decoration:underline" ');
  return `<table role="presentation" cellpadding="0" cellspacing="0" border="0" width="100%" style="background:#ffffff">
  <tr><td align="center" style="padding:28px 12px">
    <!-- classic newsletter centering: align attribute + fixed width
         attribute on the table. No width:100% here, since clients that strip
         max-width would blow the column out to full width; mobile apps
         shrink fixed-width tables to fit on their own. -->
    <table role="presentation" align="center" cellpadding="0" cellspacing="0" border="0" width="600" style="max-width:600px;margin:0 auto">
      <tr><td align="center" style="font-family:${FONT};font-size:13px;color:#444038;text-align:center;padding-bottom:20px">
        <a href="${SITE}/brief" style="color:#444038;text-decoration:underline">Subscribe</a>
        &nbsp;|&nbsp;
        <a href="${SITE}/brief/${issueDate}" style="color:#444038;text-decoration:underline">View Online</a>
      </td></tr>
      <tr><td align="center" style="font-family:Georgia,'Times New Roman',serif;font-size:36px;font-weight:600;color:#191713;text-align:center;line-height:1.1">The Brief</td></tr>
      <tr><td align="center" style="font-family:${FONT};font-size:11px;letter-spacing:0.16em;text-transform:uppercase;color:#5a1723;font-weight:600;text-align:center;padding:4px 0 24px">by WYEA</td></tr>
      <tr><td align="center" style="text-align:center">
        ${styled}
      </td></tr>
      <tr><td align="center" style="font-family:${FONT};font-size:13px;color:#444038;text-align:center;border-top:1px solid #e7e5e0;padding:18px 0 0;line-height:1.7">
        Forward this to one colleague who would use it.<br>
        Or share your personal link:
        <a href="{{referral_url}}" style="color:#191713;text-decoration:underline">{{referral_url}}</a><br>
        {{referral_count}} confirmed referral(s) so far &middot;
        <a href="{{share_url}}" style="color:#191713;text-decoration:underline">track your rewards</a>
      </td></tr>
      <tr><td align="center" style="font-family:${FONT};font-size:12px;color:#8f8a82;text-align:center;padding-top:16px;line-height:1.7">
        ${SIGNATURE}<br>
        {{postal_address}}<br>
        <a href="{{unsubscribe_url}}" style="color:#8f8a82;text-decoration:underline">Unsubscribe</a> with one click, anytime.
      </td></tr>
    </table>
  </td></tr>
</table>`;
}

function emailShell(inner) {
  return `<div style="font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',sans-serif;
    color:#191713;font-size:16px;line-height:1.6;max-width:560px;margin:0 auto;padding:8px 4px">
    <p style="font-size:13px;letter-spacing:0.12em;text-transform:uppercase;color:#5a1723;
    font-weight:600">The Brief &middot; by WYEA</p>
    ${inner}
    <p style="font-size:13px;color:#8f8a82;border-top:1px solid #e7e5e0;padding-top:14px;
    margin-top:28px">The Brief by WYEA, Newport Beach, California</p>
  </div>`;
}

/* ---------- pages ---------- */

async function briefPage(env, url) {
  const issues = await loadManifest(env, url.origin);
  const src = clean(url.searchParams.get("src"), MAX_SOURCE) || "brief-page";
  const ref = clean(url.searchParams.get("ref"), 16).toLowerCase();

  const archive = issues.length
    ? `<ul class="archive-list">${issues.map((i) => {
        const date = String(i.date || "");
        if (!/^\d{4}-\d{2}-\d{2}$/.test(date)) return "";
        const label = i.title ? escapeHtml(i.title) : `The Brief, ${prettyDate(date)}`;
        return `<li><a href="/brief/${date}">${label}</a><span class="archive-date">${prettyDate(date)}</span></li>`;
      }).join("")}</ul>`
    : `<p class="empty-note">The first issue lands soon. Subscribe above and it
       arrives in your inbox the Wednesday it publishes.</p>`;

  const body = `
  <section class="brief-hero">
    <div class="container narrow">
      <p class="eyebrow">The Brief · A weekly newsletter from WYEA</p>
      <h1>The legal developments that matter, national to Orange County.</h1>
      <p class="lede">One email a week, readable in four minutes. Court decisions,
      rule changes, and AI-and-practice developments. Free.</p>
      ${subscribeFormHtml(src, "brief", ref)}
    </div>
  </section>

  <section class="band">
    <div class="container narrow">
      <p class="eyebrow">The format</p>
      <h2>What an issue looks like</h2>
      <p class="lede">Four sections every week: NATIONAL, CALIFORNIA &amp; LA,
      ORANGE COUNTY, and AI &amp; PRACTICE. Two or three items per section, and
      the whole issue reads in under four minutes. Every item follows the same
      shape:</p>
      <div class="sample">
        <p class="sample-section">ORANGE COUNTY</p>
        <article class="item">
          <h3><a href="#archive" class="sample-headline">A bold, factual headline stating exactly what happened, linking to the source (3 minute read)</a></h3>
          <p>Two or three sentences that give you the complete story, so the
          headline never baits: what the court held or the rule changed, who it
          applies to, and the so-what for your practice. The headline links to
          the opinion, the rule text, or primary reporting; you click through
          only when you want the full text.</p>
        </article>
        <p class="sample-section">AI &amp; PRACTICE</p>
        <article class="item">
          <h3><a href="#archive" class="sample-headline">A development in legal AI or practice management, stated plainly (2 minute read)</a></h3>
          <p>The same shape: the fact, the context, and what a small or midsize
          firm should do about it, if anything. No hype, no vendor pitches.</p>
        </article>
      </div>
      <p class="fine">Every case and holding is verified against the fetched
      source before it is written up. The Brief never contains a sales pitch.</p>
    </div>
  </section>

  <section class="band band-alt" id="archive">
    <div class="container narrow">
      <p class="eyebrow">Archive</p>
      <h2>Past issues</h2>
      ${archive}
    </div>
  </section>`;

  return page("The Brief | a weekly legal newsletter by WYEA", body, 200, {
    description: "The Brief: one email a week with the legal developments that matter, national to Orange County, readable in four minutes. Free, by WYEA.",
    canonical: `${url.origin}/brief`,
  });
}

async function issuePage(env, url, date) {
  const md = await loadAsset(env, url.origin, `/brief/issues/The-Brief-${date}.md`);
  if (md === null) {
    return page("The Brief", statusCard(
      "No issue for that date",
      `There is no issue of The Brief dated ${escapeHtml(date)}.
       <a href="/brief#archive">Browse the archive</a>.`
    ), 404);
  }
  const body = `
  <section class="brief-hero">
    <div class="container narrow">
      <p class="eyebrow"><a href="/brief" class="quiet-link">The Brief</a> · ${prettyDate(date)}</p>
      <article class="issue">${renderMarkdown(md)}</article>
      <div class="issue-cta">
        <p class="lede">Get the next issue in your inbox. One email a week,
        readable in four minutes. Free.</p>
        ${subscribeFormHtml("issue-" + date, "issue")}
      </div>
    </div>
  </section>`;
  return page(`The Brief, ${prettyDate(date)} | WYEA`, body, 200, {
    description: `The Brief for ${prettyDate(date)}: the week's legal developments, national to Orange County, verified against the sources.`,
    canonical: `${url.origin}/brief/${date}`,
    // Article schema with datePublished: AI engines reward fresh, dated
    // content, and these issue pages are the site's citation surface.
    jsonLd: {
      "@context": "https://schema.org",
      "@type": "Article",
      headline: `The Brief, ${prettyDate(date)}`,
      datePublished: date,
      url: `https://wyea.ai/brief/${date}`,
      publisher: {
        "@type": "Organization",
        name: "WYEA",
        url: "https://wyea.ai/",
      },
    },
  });
}

function subscribeFormHtml(source, idSuffix, ref = "") {
  return `
  <form class="subscribe-form" data-source="${escapeHtml(source)}" id="subscribe-${idSuffix}">
    <input type="hidden" name="ref" value="${escapeHtml(ref)}">
    <div class="subscribe-row">
      <label class="visually-hidden" for="email-${idSuffix}">Email</label>
      <input id="email-${idSuffix}" type="email" name="email" autocomplete="email"
             maxlength="254" placeholder="you@example.com" required>
      <button type="submit" class="btn btn-primary">Subscribe</button>
    </div>
    <label class="hp" aria-hidden="true">Website
      <input type="text" name="website" tabindex="-1" autocomplete="off">
    </label>
    <p class="micro">No spam. Unsubscribe anytime.</p>
    <p class="form-status" role="status" aria-live="polite"></p>
    <p class="subscribe-success" hidden>Check your inbox to confirm.</p>
  </form>`;
}

function statusCard(title, inner) {
  return `
  <section class="brief-hero">
    <div class="container narrow">
      <p class="eyebrow">The Brief · A weekly newsletter from WYEA</p>
      <h1>${title}</h1>
      <p class="lede">${inner}</p>
    </div>
  </section>`;
}

/* ---------- share / referral status page ----------
   Linked from every issue footer; authenticated by the subscriber's own
   unsubscribe token (already in their email, never guessable). Shows the
   personal link, confirmed-referral count, and tier progress. */

async function sharePage(env, url) {
  const token = clean(url.searchParams.get("t"), 64);
  const row = token
    ? await env.DB.prepare("SELECT * FROM subscribers WHERE unsubscribe_token = ?1").bind(token).first()
    : null;
  if (!row) {
    return page("The Brief", statusCard(
      "That link did not work",
      `This share link is not valid. Use the Share link from any issue of
       The Brief in your inbox.`
    ), 404);
  }
  const code = await referralCode(env, row.email);
  const count = await referralCount(env, code);
  const link = `${url.origin}/brief?ref=${code}`;
  const tiers = REFERRAL_TIERS.map((t) => {
    const done = count >= t.count;
    return `<li class="${done ? "tier-done" : ""}">${done ? "Unlocked" : `${count} of ${t.count}`}:
      refer ${t.count} colleagues and get ${escapeHtml(t.name)}</li>`;
  }).join("");
  const body = `
  <section class="brief-hero">
    <div class="container narrow">
      <p class="eyebrow">The Brief · Share it</p>
      <h1>Forward The Brief to a colleague who would use it.</h1>
      <p class="lede">Your personal link. When a colleague subscribes and
      confirms through it, the referral counts toward your rewards.</p>
      <div class="share-box">
        <p class="share-link"><a href="${link}">${link}</a></p>
        <p class="micro">Confirmed referrals so far: <strong>${count}</strong></p>
      </div>
      <ul class="tier-list">${tiers}</ul>
    </div>
  </section>`;
  return page("Share The Brief | WYEA", body);
}

/* ---------- assets ---------- */

async function loadManifest(env, origin) {
  const raw = await loadAsset(env, origin, "/brief/issues/index.json");
  if (raw === null) return [];
  try {
    const data = JSON.parse(raw);
    const issues = Array.isArray(data.issues) ? data.issues : [];
    return issues.slice().sort((a, b) => String(b.date).localeCompare(String(a.date)));
  } catch (err) {
    console.error("brief manifest unreadable:", err);
    return [];
  }
}

async function loadAsset(env, origin, path) {
  const res = await env.ASSETS.fetch(new Request(new URL(path, origin)));
  // With single-page-application fallback a missing asset comes back as the
  // homepage (200, text/html) — treat that as not found.
  if (!res.ok || (res.headers.get("Content-Type") || "").includes("text/html")) return null;
  return res.text();
}

/* ---------- markdown ----------
   Renders the constrained issue format (headings, bold, links, bare URLs,
   lists, rules, paragraphs). All content is HTML-escaped first; issues are
   committed by the editor, but nothing here trusts the input. */

export function renderMarkdown(md) {
  const out = [];
  let para = [];
  let list = null;
  const flushPara = () => {
    if (para.length) { out.push(`<p>${inline(para.join(" "))}</p>`); para = []; }
  };
  const flushList = () => {
    if (list) { out.push(`<ul>${list.map((i) => `<li>${inline(i)}</li>`).join("")}</ul>`); list = null; }
  };
  for (const raw of md.replace(/\r\n/g, "\n").split("\n")) {
    const t = raw.trim();
    if (!t) { flushPara(); flushList(); continue; }
    let m;
    if ((m = t.match(/^(#{1,3})\s+(.*)$/))) {
      flushPara(); flushList();
      const level = m[1].length;
      out.push(`<h${level}>${inline(m[2])}</h${level}>`);
      continue;
    }
    if (/^(-{3,}|\*{3,}|_{3,})$/.test(t)) { flushPara(); flushList(); out.push("<hr>"); continue; }
    if ((m = t.match(/^[-*]\s+(.*)$/))) { flushPara(); if (!list) list = []; list.push(m[1]); continue; }
    flushList();
    para.push(t);
  }
  flushPara();
  flushList();
  return out.join("\n");
}

function inline(text) {
  let s = escapeHtml(text);
  s = s.replace(/\*\*([^*]+)\*\*/g, "<strong>$1</strong>");
  s = s.replace(/\[([^\]]+)\]\((https?:\/\/[^)\s]+)\)/g,
    (_, label, href) => `<a href="${href}" rel="noopener">${label}</a>`);
  s = s.replace(/(^|[\s(])(https?:\/\/[^\s<)]+)/g,
    (_, pre, href) => `${pre}<a href="${href}" rel="noopener">${href}</a>`);
  return s;
}

/* ---------- page shell ---------- */

function page(title, body, status = 200, meta = {}) {
  const html = `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>${escapeHtml(title)}</title>
  ${meta.description ? `<meta name="description" content="${escapeHtml(meta.description)}">` : ""}
  ${meta.canonical ? `<link rel="canonical" href="${escapeHtml(meta.canonical)}">` : ""}
  ${meta.jsonLd ? `<script type="application/ld+json">${JSON.stringify(meta.jsonLd)}</script>` : ""}
  <link rel="preload" href="/fonts/newsreader-var.woff2" as="font" type="font/woff2" crossorigin>
  <link rel="preload" href="/fonts/public-sans-var.woff2" as="font" type="font/woff2" crossorigin>
  <link rel="stylesheet" href="/styles.css">
  <script>document.documentElement.className += " js";</script>
  <style>${PAGE_CSS}</style>
  <link rel="icon" href="data:image/svg+xml,<svg xmlns='http://www.w3.org/2000/svg' viewBox='0 0 100 100'><text y='.9em' font-size='90'>⚖️</text></svg>">
</head>
<body>
${SITE_HEADER}
  <main id="main">${body}</main>
${SITE_FOOTER}
  <script src="/site.js" defer></script>
  <script>${SUBSCRIBE_JS}</script>
</body>
</html>`;
  return new Response(html, {
    status,
    headers: { "Content-Type": "text/html; charset=utf-8" },
  });
}

// The Brief's pages are Worker-rendered, so the site header and footer are
// duplicated here rather than in an HTML file. Keep them in step with the
// committed pages: same links, same order, same markup.
const CAL_URL = "https://calendar.app.google/hMuBjTub3YHa9rKT7";

const SITE_HEADER = `<a class="skip-link" href="#main">Skip to content</a>

<header class="site-header">
  <div class="wrap header-inner">
    <a class="wordmark" href="/">WYEA</a>
    <button class="nav-toggle" id="nav-toggle" type="button" aria-expanded="false" aria-controls="nav" aria-label="Open menu"><span></span></button>
    <nav class="nav" id="nav" aria-label="Main">
      <div class="nav-item">
        <button class="nav-link" type="button" data-mega aria-expanded="false" aria-controls="mega-build">What we build <i class="nav-caret" aria-hidden="true"></i></button>
        <div class="mega" id="mega-build" hidden>
          <a class="mega-link" href="/what-we-build"><b>Overview</b><span>The four systems a firm can have built, and how they fit together.</span></a>
          <a class="mega-link" href="/build/verified-drafting"><b>Verified drafting</b><span>First drafts in your format, with every citation matched to the source.</span></a>
          <a class="mega-link" href="/build/discovery"><b>Discovery and review</b><span>Production sets read and ranked against the requests actually served.</span></a>
          <a class="mega-link" href="/build/matter-workflow"><b>Matter workflow</b><span>Deadlines computed from the governing rules and shown with authority.</span></a>
          <a class="mega-link" href="/build/deployment"><b>Deployment and control</b><span>Your environment, your infrastructure, your audit trail.</span></a>
          <a class="mega-link" href="/custom-ai-for-law-firms"><b>For Orange County firms</b><span>What the options are, what each costs, and which one fits.</span></a>
        </div>
      </div>
      <a class="nav-link" href="/how-we-work">How we work</a>
      <a class="nav-link" href="/security">Security</a>
      <div class="nav-item">
        <button class="nav-link" type="button" data-mega aria-expanded="false" aria-controls="mega-company">Company <i class="nav-caret" aria-hidden="true"></i></button>
        <div class="mega" id="mega-company" hidden>
          <a class="mega-link" href="/about"><b>About the firm</b><span>Two principal engineers in Newport Beach, and how they work.</span></a>
          <a class="mega-link" href="/brief"><b>The Brief</b><span>A weekly note on legal technology, written for Orange County firms.</span></a>
          <a class="mega-link" href="/how-we-work"><b>Engagement model</b><span>Fixed price, one week to a prototype, defined deliverables.</span></a>
          <a class="mega-link" href="/privacy"><b>Privacy</b><span>What this site collects, and what it does not.</span></a>
        </div>
      </div>
      <a class="nav-link" href="/brief" aria-current="page">The Brief</a>
      <a class="btn btn-primary btn-sm nav-cta" href="${CAL_URL}" target="_blank" rel="noopener">Book a call</a>
    </nav>
  </div>
</header>`;

const SITE_FOOTER = `<footer class="site-footer">
  <div class="wrap">
    <div class="footer-grid">
      <div class="footer-brand">
        <a class="wordmark" href="/">WYEA</a>
        <p>Whittle and Ye Engineering Associates. Custom software for law firms, built in Newport Beach.</p>
      </div>
      <div class="footer-col">
        <h4>What we build</h4>
        <ul>
          <li><a href="/what-we-build">Overview</a></li>
          <li><a href="/build/verified-drafting">Verified drafting</a></li>
          <li><a href="/build/discovery">Discovery and review</a></li>
          <li><a href="/build/matter-workflow">Matter workflow</a></li>
          <li><a href="/build/deployment">Deployment and control</a></li>
        </ul>
      </div>
      <div class="footer-col">
        <h4>How we work</h4>
        <ul>
          <li><a href="/how-we-work">Engagement model</a></li>
          <li><a href="/security">Security and confidentiality</a></li>
          <li><a href="/custom-ai-for-law-firms">For Orange County firms</a></li>
        </ul>
      </div>
      <div class="footer-col">
        <h4>Company</h4>
        <ul>
          <li><a href="/about">About the firm</a></li>
          <li><a href="/brief">The Brief</a></li>
          <li><a href="/privacy">Privacy</a></li>
        </ul>
      </div>
      <div class="footer-col">
        <h4>Contact</h4>
        <ul>
          <li><a href="${CAL_URL}" target="_blank" rel="noopener">Book a 30-minute call</a></li>
          <li><a href="/#contact">Send a message</a></li>
        </ul>
      </div>
    </div>
    <div class="footer-legal">
      <span>&copy; 2026 WYEA</span>
      <span>Newport Beach &middot; Orange County, California</span>
      <a href="/privacy">Privacy</a>
    </div>
  </div>
</footer>`;

// Only what The Brief adds on top of /styles.css. Shared tokens, typography,
// header, footer, and buttons all come from the stylesheet the rest of the
// site loads, so a brand change lands here without a second edit.
const PAGE_CSS = `
.container{width:100%;max-width:var(--w-page);margin:0 auto;padding:0 var(--gutter)}
.container.narrow{max-width:calc(800px + var(--gutter) * 2)}
.band{border-top:1px solid var(--line)}
.band-alt{background:var(--paper-deep)}
.brief-hero{padding:clamp(56px,7vw,96px) 0 clamp(40px,5vw,64px)}
.quiet-link{color:inherit;text-decoration:none}
.quiet-link:hover{text-decoration:underline}
.visually-hidden{position:absolute;left:-10000px;width:1px;height:1px;overflow:hidden}
.subscribe-form{margin-top:1.8em;max-width:480px}
.subscribe-row{display:flex;gap:10px}
.subscribe-form input[type=email]{flex:1;min-width:0;height:46px;padding:0 14px}
.micro{font-size:.86rem;color:var(--ink-muted);margin-top:.8em}
.form-status{font-size:.9rem;color:var(--bronze-deep);min-height:1.4em;margin-top:.5em}
.subscribe-success{font-size:1.05rem;color:var(--bronze-deep);font-weight:600;margin-top:.6em}
.sample{border:1px solid var(--line);background:var(--paper);padding:28px 30px;margin-top:1.8em}
.band-alt .sample{background:var(--white)}
.sample-section{font-size:.74rem;font-weight:700;letter-spacing:.13em;text-transform:uppercase;
color:var(--bronze);margin:1.6em 0 .7em}
.sample-section:first-child{margin-top:0}
.item h3{font-size:1.06rem}
.item p{font-size:.95rem;margin-top:.3em}
.sample-headline{color:var(--bronze-deep);text-decoration:none;border-bottom:1px solid var(--bronze)}
.sample-headline:hover{color:var(--ink);border-bottom-color:var(--ink)}
.fine{font-size:.88rem;margin-top:1.6em}
.empty-note{font-size:1rem}
.archive-list{list-style:none;margin-top:1em;border-top:1px solid var(--line)}
.archive-list li{display:flex;justify-content:space-between;gap:16px;align-items:baseline;
padding:18px 2px;border-bottom:1px solid var(--line)}
.archive-list a{font-family:var(--font-display);font-size:1.18rem;font-weight:450;
letter-spacing:-.01em;color:var(--ink);text-decoration:none}
.archive-list a:hover{color:var(--bronze-deep)}
.archive-date{font-size:.85rem;color:var(--ink-muted);white-space:nowrap}
.issue{margin-top:.5em}
.issue h1{font-size:clamp(1.8rem,4vw,2.6rem);margin-bottom:.5em}
.issue h2{font-size:.82rem;font-weight:700;font-family:var(--font-body);letter-spacing:.13em;
text-transform:uppercase;color:var(--bronze);margin:2.4em 0 .8em}
.issue h3{font-size:1.14rem;margin-top:1.5em}
.issue p{margin:.55em 0;font-size:1.02rem;line-height:1.65}
.issue ul{margin:.6em 0 .6em 1.2em}
.issue li{color:var(--ink-soft);margin-bottom:.4em}
.issue hr{border:0;border-top:1px solid var(--line);margin:2.4em 0}
.issue a{color:var(--bronze-deep);word-break:break-word}
.issue-cta{margin-top:64px;padding-top:36px;border-top:1px solid var(--line)}
.share-box{border:1px solid var(--line);background:var(--white);padding:24px 26px;margin-top:1.8em}
.share-link a{font-family:var(--font-display);font-size:1.18rem;word-break:break-all}
.tier-list{list-style:none;margin-top:1.4em;border-top:1px solid var(--line)}
.tier-list li{padding:14px 2px;border-bottom:1px solid var(--line);color:var(--ink-muted)}
.tier-list li.tier-done{color:var(--bronze-deep);font-weight:600}
@media(max-width:640px){.subscribe-row{flex-direction:column}}
`;

const SUBSCRIBE_JS = `
(function () {
  if (!window.fetch) return;
  var params = new URLSearchParams(location.search);
  document.querySelectorAll(".subscribe-form").forEach(function (form) {
    var button = form.querySelector("button[type=submit]");
    var status = form.querySelector(".form-status");
    var success = form.querySelector(".subscribe-success");
    form.addEventListener("submit", function (e) {
      e.preventDefault();
      button.disabled = true;
      button.textContent = "Subscribing\\u2026";
      status.textContent = "";
      fetch("/api/subscribe", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          email: form.email.value,
          website: form.website.value,
          ref: (form.ref && form.ref.value) || params.get("ref") || "",
          source: params.get("src") || form.getAttribute("data-source") || "brief-page"
        })
      }).then(function (res) {
        return res.json().then(function (data) {
          if (res.ok && data.ok) {
            form.querySelector(".subscribe-row").hidden = true;
            form.querySelector(".micro").hidden = true;
            success.hidden = false;
          } else {
            fail(data && data.error);
          }
        });
      }).catch(function () { fail(); });
      function fail(message) {
        button.disabled = false;
        button.textContent = "Subscribe";
        status.textContent = message || "Something went wrong on our end, please try again in a minute.";
      }
    });
  });
})();
`;

/* ---------- utilities ---------- */

export function prettyDate(iso) {
  const [y, m, d] = iso.split("-").map(Number);
  const months = ["January", "February", "March", "April", "May", "June",
    "July", "August", "September", "October", "November", "December"];
  return `${months[(m || 1) - 1]} ${d}, ${y}`;
}

async function sha256Hex(text) {
  const digest = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(text));
  return [...new Uint8Array(digest)].map((b) => b.toString(16).padStart(2, "0")).join("");
}

/* ---------- delivery telemetry (Resend webhooks) ----------
   POST /api/resend-events ingests what happens AFTER Resend accepts an
   email: delivered / bounced / complained / opened / clicked. Signature
   verified (Svix scheme: HMAC-SHA256 over "id.timestamp.body" with the
   whsec_ secret, 5-minute replay window). Hard bounces and spam
   complaints auto-suppress the subscriber exactly like an unsubscribe —
   they stop receiving and the suppression is never forgotten; a genuine
   re-opt-in through the normal double-confirm flow clears it. Everything
   lands in the audit chain, which makes opens-per-issue a query.
   Inactive (503) until the RESEND_WEBHOOK_SECRET Worker secret is set. */

async function handleResendEvents(request, env) {
  if (!env.RESEND_WEBHOOK_SECRET) return json({ error: "webhook not configured" }, 503);
  const svixId = request.headers.get("svix-id") || "";
  const svixTs = request.headers.get("svix-timestamp") || "";
  const svixSig = request.headers.get("svix-signature") || "";
  const body = await request.text();
  if (!svixId || !svixTs || !svixSig) return json({ error: "missing signature" }, 401);
  const age = Math.abs(Date.now() / 1000 - Number(svixTs));
  if (!Number.isFinite(age) || age > 300) return json({ error: "stale timestamp" }, 401);

  const keyBytes = Uint8Array.from(atob(env.RESEND_WEBHOOK_SECRET.replace(/^whsec_/, "")),
    (c) => c.charCodeAt(0));
  const key = await crypto.subtle.importKey("raw", keyBytes,
    { name: "HMAC", hash: "SHA-256" }, false, ["sign"]);
  const mac = await crypto.subtle.sign("HMAC", key,
    new TextEncoder().encode(`${svixId}.${svixTs}.${body}`));
  const expected = btoa(String.fromCharCode(...new Uint8Array(mac)));
  const match = svixSig.split(" ").some((part) => part.split(",")[1] === expected);
  if (!match) return json({ error: "bad signature" }, 401);

  let evt;
  try {
    evt = JSON.parse(body);
  } catch {
    return json({ error: "bad request" }, 400);
  }
  const type = String(evt.type || "");
  const to = Array.isArray(evt.data?.to) ? String(evt.data.to[0] || "").toLowerCase() : "";
  const subject = clean(evt.data?.subject, 80);
  if (!to) return json({ ok: true, ignored: true });

  const suppress = async (reason) => {
    await env.DB.prepare(
      "UPDATE subscribers SET unsubscribed_at = COALESCE(unsubscribed_at, datetime('now')) WHERE email = ?1"
    ).bind(to).run();
    await logEvent(env, to, "suppressed", reason);
  };

  if (type === "email.bounced") {
    const bounceType = String(evt.data?.bounce?.type || "").toLowerCase();
    const transient = bounceType === "transient";
    await logEvent(env, to, "email_bounced", `${transient ? "transient" : "permanent"}: ${subject}`);
    if (!transient) await suppress("hard bounce");
  } else if (type === "email.complained") {
    await logEvent(env, to, "email_complained", subject);
    await suppress("spam complaint");
  } else if (type === "email.delivered") {
    await logEvent(env, to, "email_delivered", subject);
  } else if (type === "email.opened") {
    await logEvent(env, to, "email_opened", subject);
  } else if (type === "email.clicked") {
    await logEvent(env, to, "email_clicked", clean(evt.data?.click?.link, 120) || subject);
  }
  return json({ ok: true });
}

/* ---------- referral loop ----------
   TLDR-style growth engine on the owned stack. Codes are stable per
   subscriber and generated lazily; credit exists only when a referee
   completes double opt-in; rewards are granted once per (referrer, tier)
   and fulfillment is manual (operator notification) until an asset ships. */

export const REFERRAL_TIERS = [
  { count: 3, name: "the WYEA practice-area prompt pack" },
];

async function referralCode(env, email) {
  const existing = await env.DB.prepare("SELECT code FROM referral_codes WHERE email = ?1")
    .bind(email).first();
  if (existing) return existing.code;
  const bytes = new Uint8Array(5);
  crypto.getRandomValues(bytes);
  const code = [...bytes].map((b) => "abcdefghjkmnpqrstuvwxyz23456789"[b % 31]).join("");
  await env.DB.prepare("INSERT OR IGNORE INTO referral_codes (email, code) VALUES (?1, ?2)")
    .bind(email, code).run();
  // INSERT OR IGNORE lost a race or the code collided: read back the truth.
  const row = await env.DB.prepare("SELECT code FROM referral_codes WHERE email = ?1")
    .bind(email).first();
  return row ? row.code : code;
}

async function referralCount(env, code) {
  const r = await env.DB.prepare(
    "SELECT COUNT(*) AS n FROM referrals WHERE code = ?1 AND confirmed_at IS NOT NULL"
  ).bind(code).first();
  return r ? r.n : 0;
}

// Called when a referee completes double opt-in: stamp the credit, then
// grant any tier the referrer just crossed. Everything best-effort — a
// referral hiccup must never break the confirm page.
async function creditReferral(env, url, refereeEmail) {
  try {
    const ref = await env.DB.prepare(
      "SELECT code FROM referrals WHERE referee_email = ?1 AND confirmed_at IS NULL"
    ).bind(refereeEmail).first();
    if (!ref) return;
    await env.DB.prepare(
      "UPDATE referrals SET confirmed_at = datetime('now') WHERE referee_email = ?1"
    ).bind(refereeEmail).run();
    const owner = await env.DB.prepare("SELECT email FROM referral_codes WHERE code = ?1")
      .bind(ref.code).first();
    if (!owner) return;
    await logEvent(env, owner.email, "referral_confirmed", `referee:${refereeEmail}`);
    const count = await referralCount(env, ref.code);
    for (const tier of REFERRAL_TIERS) {
      if (count < tier.count) continue;
      const granted = await env.DB.prepare(
        "INSERT OR IGNORE INTO reward_grants (email, tier) VALUES (?1, ?2)"
      ).bind(owner.email, tier.count).run();
      if (!granted.meta.changes) continue; // already granted earlier
      await logEvent(env, owner.email, "reward_granted", `tier:${tier.count}`);
      await sendEmail(env, {
        to: owner.email,
        subject: `You unlocked ${tier.name}`,
        text: [
          `${tier.count} colleagues you referred are now confirmed readers of The Brief.`,
          `That unlocks ${tier.name}. Reply to this email and we will send it over.`,
          "",
          `Keep sharing: ${url.origin}/brief?ref=${ref.code}`,
          "",
          "The Brief by WYEA, Newport Beach, California",
        ].join("\n"),
        html: emailShell(`
          <p><strong>${tier.count} colleagues you referred are now confirmed readers of The Brief.</strong></p>
          <p>That unlocks ${escapeHtml(tier.name)}. Reply to this email and we will send it over.</p>
          <p>Keep sharing: <a href="${url.origin}/brief?ref=${ref.code}">${url.origin}/brief?ref=${ref.code}</a></p>
        `),
      });
      if (env.CONTACT_EMAIL) {
        await sendEmail(env, {
          to: env.CONTACT_EMAIL,
          subject: `The Brief: reward tier ${tier.count} unlocked by ${owner.email}`,
          text: `${owner.email} reached ${count} confirmed referrals and was promised ${tier.name}. Fulfill by reply.`,
        });
      }
    }
  } catch (err) {
    console.error("referral credit failed:", err);
  }
}

/* ---------- audit log ----------
   Append-only, hash-chained record of every subscriber lifecycle event
   (schema.sql: subscriber_events). Best-effort: a logging failure is
   reported but never blocks the user action it describes. The canonical
   hash is exported so audit.mjs verifies the chain with the same code. */

export async function eventHash(prevHash, email, event, detail, ip, createdAt) {
  return sha256Hex([prevHash, email, event, detail || "", ip || "", createdAt].join("|"));
}

async function logEvent(env, email, event, detail = "", ip = "") {
  try {
    const head = await env.DB.prepare(
      "SELECT event_hash FROM subscriber_events ORDER BY id DESC LIMIT 1"
    ).first();
    const prev = head ? head.event_hash : "genesis";
    const ts = new Date().toISOString();
    const hash = await eventHash(prev, email, event, detail, ip, ts);
    await env.DB.prepare(
      `INSERT INTO subscriber_events (email, event, detail, ip, created_at, prev_hash, event_hash)
       VALUES (?1, ?2, ?3, ?4, ?5, ?6, ?7)`
    ).bind(email, event, detail, ip, ts, prev, hash).run();
  } catch (err) {
    console.error("audit log failed:", err);
  }
}

function randomToken() {
  const bytes = new Uint8Array(32);
  crypto.getRandomValues(bytes);
  return [...bytes].map((b) => b.toString(16).padStart(2, "0")).join("");
}

function clean(value, max) {
  return typeof value === "string" ? value.trim().slice(0, max) : "";
}

function escapeHtml(text) {
  return String(text)
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}

function json(data, status = 200) {
  return new Response(JSON.stringify(data), {
    status,
    headers: { "Content-Type": "application/json" },
  });
}
