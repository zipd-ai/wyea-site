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

  if (path === "/brief" && request.method === "GET") return briefPage(env, url);
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
  const source = clean(body.source, MAX_SOURCE) || "unknown";
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

  if (!row) {
    const ip = request.headers.get("CF-Connecting-IP") || "";
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
  await env.DB.prepare("UPDATE subscribers SET confirm_sent_at = datetime('now') WHERE email = ?1")
    .bind(email).run();
  return json({ ok: true });
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
  return page("You're in — The Brief", statusCard(
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
  // RFC 8058 one-click POST (mail clients) gets a plain 200; a person in a
  // browser gets the page.
  if (request.method === "POST") return json({ ok: true });
  return page("Unsubscribed — The Brief", statusCard(
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
      <p style="margin:28px 0"><a href="${link}" style="background:#16213a;color:#ffffff;
      padding:12px 24px;border-radius:7px;text-decoration:none;font-weight:600">
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

async function sendEmail(env, { to, subject, text, html }) {
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
    },
    body: JSON.stringify({
      from: env.BRIEF_FROM_EMAIL || DEFAULT_FROM,
      to: [to],
      subject,
      text,
      html,
    }),
  });
  if (!res.ok) console.error("brief resend failed:", res.status, await res.text());
  return res.ok;
}

function emailShell(inner) {
  return `<div style="font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',sans-serif;
    color:#16213a;font-size:16px;line-height:1.6;max-width:560px;margin:0 auto;padding:8px 4px">
    <p style="font-size:13px;letter-spacing:0.12em;text-transform:uppercase;color:#8a6a2f;
    font-weight:600">The Brief &middot; by WYEA</p>
    ${inner}
    <p style="font-size:13px;color:#8b94ad;border-top:1px solid #e3ddd1;padding-top:14px;
    margin-top:28px">The Brief by WYEA, Newport Beach, California</p>
  </div>`;
}

/* ---------- pages ---------- */

async function briefPage(env, url) {
  const issues = await loadManifest(env, url.origin);
  const src = clean(url.searchParams.get("src"), MAX_SOURCE) || "brief-page";

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
      rule changes, and AI-and-practice developments, each verified against the
      source before it is summarized. Free.</p>
      ${subscribeFormHtml(src, "brief")}
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
          <h3>A bold, factual headline stating exactly what happened (3 minute read)</h3>
          <p>Two or three sentences that give you the complete story, so the
          headline never baits: what the court held or the rule changed, who it
          applies to, and the so-what for your practice. You click through only
          when you want the full text.</p>
          <p class="item-source">the source link: the opinion, the rule text, or primary reporting</p>
        </article>
        <p class="sample-section">AI &amp; PRACTICE</p>
        <article class="item">
          <h3>A development in legal AI or practice management, stated plainly (2 minute read)</h3>
          <p>The same shape: the fact, the context, and what a small or midsize
          firm should do about it, if anything. No hype, no vendor pitches.</p>
          <p class="item-source">the source link</p>
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

  return page("The Brief — a weekly legal newsletter by WYEA", body, 200, {
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
  return page(`The Brief, ${prettyDate(date)} — WYEA`, body, 200, {
    description: `The Brief for ${prettyDate(date)}: the week's legal developments, national to Orange County, verified against the sources.`,
    canonical: `${url.origin}/brief/${date}`,
  });
}

function subscribeFormHtml(source, idSuffix) {
  return `
  <form class="subscribe-form" data-source="${escapeHtml(source)}" id="subscribe-${idSuffix}">
    <div class="subscribe-row">
      <label class="visually-hidden" for="email-${idSuffix}">Email</label>
      <input id="email-${idSuffix}" type="email" name="email" autocomplete="email"
             maxlength="254" placeholder="you@yourfirm.com" required>
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
  <link rel="preconnect" href="https://fonts.googleapis.com">
  <link rel="preconnect" href="https://fonts.gstatic.com" crossorigin>
  <link href="https://fonts.googleapis.com/css2?family=Fraunces:opsz,wght@9..144,400;9..144,500;9..144,600&family=Inter:wght@400;500;600&display=swap" rel="stylesheet">
  <style>${PAGE_CSS}</style>
  <link rel="icon" href="data:image/svg+xml,<svg xmlns='http://www.w3.org/2000/svg' viewBox='0 0 100 100'><text y='.9em' font-size='90'>⚖️</text></svg>">
</head>
<body>
  <header class="site-header">
    <div class="container header-inner">
      <a class="wordmark" href="/">WYEA<span class="wordmark-sub">Whittle &amp; Ye Engineering Associates</span></a>
      <nav class="site-nav">
        <a href="/brief">The Brief</a>
        <a class="nav-cta" href="/#contact">Start a conversation</a>
      </nav>
    </div>
  </header>
  <main>${body}</main>
  <footer class="site-footer">
    <div class="container footer-inner">
      <span>Curated by WYEA, Newport Beach - firm-owned drafting and review tools.</span>
      <span>© 2026 Whittle and Ye Engineering Associates LLC</span>
    </div>
  </footer>
  <script>${SUBSCRIBE_JS}</script>
</body>
</html>`;
  return new Response(html, {
    status,
    headers: { "Content-Type": "text/html; charset=utf-8" },
  });
}

const PAGE_CSS = `
:root{--ink:#16213a;--ink-soft:#3c4763;--paper:#faf8f4;--paper-deep:#f1ede5;
--bronze:#a5803c;--bronze-deep:#8a6a2f;--line:#e3ddd1;--white:#ffffff;
--font-display:"Fraunces",Georgia,"Times New Roman",serif;
--font-body:"Inter",-apple-system,BlinkMacSystemFont,"Segoe UI",sans-serif}
*{margin:0;padding:0;box-sizing:border-box}
body{font-family:var(--font-body);color:var(--ink);background:var(--paper);
line-height:1.65;font-size:17px;-webkit-font-smoothing:antialiased}
.container{max-width:1080px;margin:0 auto;padding:0 28px}
.container.narrow{max-width:720px}
h1,h2,h3{font-family:var(--font-display);font-weight:500;line-height:1.15;letter-spacing:-0.01em}
h1{font-size:clamp(1.9rem,4.5vw,2.9rem)}
h2{font-size:clamp(1.5rem,3vw,2rem);margin-bottom:.6em}
h3{font-size:1.15rem;margin-bottom:.35em}
p{color:var(--ink-soft)}
a{color:var(--bronze-deep)}
.eyebrow{font-size:.8rem;font-weight:600;letter-spacing:.14em;text-transform:uppercase;
color:var(--bronze-deep);margin-bottom:1.1em}
.quiet-link{color:inherit;text-decoration:none}
.quiet-link:hover{text-decoration:underline}
.site-header{position:sticky;top:0;z-index:20;background:rgba(250,248,244,.92);
backdrop-filter:blur(8px);border-bottom:1px solid var(--line)}
.header-inner{display:flex;align-items:center;justify-content:space-between;
padding-top:14px;padding-bottom:14px;gap:24px}
.wordmark{font-family:var(--font-display);font-size:1.5rem;font-weight:600;color:var(--ink);
text-decoration:none;display:flex;flex-direction:column;line-height:1.1}
.wordmark-sub{font-family:var(--font-body);font-size:.62rem;font-weight:500;
letter-spacing:.08em;text-transform:uppercase;color:var(--ink-soft);white-space:nowrap}
.site-nav{display:flex;align-items:center;gap:20px}
.site-nav a{font-size:.88rem;font-weight:500;color:var(--ink-soft);text-decoration:none;white-space:nowrap}
.site-nav a:hover{color:var(--ink)}
.nav-cta{color:var(--white)!important;background:var(--ink);padding:8px 16px;border-radius:6px}
.nav-cta:hover{background:var(--ink-soft)}
.brief-hero{padding:80px 0 64px;background:
radial-gradient(1100px 480px at 85% -10%,rgba(165,128,60,.10),transparent 60%),var(--paper)}
.lede{max-width:640px;margin-top:1.2em;font-size:1.08rem}
.band{padding:72px 0;background:var(--white);border-top:1px solid var(--line)}
.band-alt{background:var(--paper-deep)}
.btn{display:inline-block;padding:12px 24px;border-radius:7px;font-weight:600;
font-size:.98rem;text-decoration:none;border:0;cursor:pointer;font-family:var(--font-body);
transition:background .15s ease}
.btn-primary{background:var(--ink);color:var(--white)}
.btn-primary:hover{background:var(--ink-soft)}
.btn[disabled]{opacity:.6;cursor:default}
.subscribe-form{margin-top:1.8em;max-width:480px}
.subscribe-row{display:flex;gap:10px}
.subscribe-form input[type=email]{flex:1;min-width:0;padding:12px 14px;border:1px solid var(--line);
border-radius:7px;background:var(--white);color:var(--ink);font-family:var(--font-body);font-size:.97rem}
.subscribe-form input[type=email]:focus{outline:2px solid var(--bronze);outline-offset:1px}
.micro{font-size:.85rem;color:var(--ink-soft);margin-top:.7em}
.form-status{font-size:.9rem;color:#a04b32;min-height:1.4em;margin-top:.4em}
.subscribe-success{font-size:1.05rem;color:var(--bronze-deep);font-weight:600;margin-top:.6em}
.hp{position:absolute;left:-10000px;width:1px;height:1px;overflow:hidden}
.visually-hidden{position:absolute;left:-10000px;width:1px;height:1px;overflow:hidden}
.sample{border:1px solid var(--line);border-radius:10px;background:var(--paper);
padding:26px 28px;margin-top:1.6em}
.sample-section{font-size:.78rem;font-weight:600;letter-spacing:.14em;color:var(--bronze-deep);
margin:1.4em 0 .6em}
.sample-section:first-child{margin-top:0}
.item h3{font-size:1.05rem}
.item p{font-size:.95rem}
.item-source{font-size:.85rem;color:var(--bronze-deep);margin-top:.3em}
.fine{font-size:.88rem;margin-top:1.6em}
.empty-note{font-size:1rem}
.archive-list{list-style:none;margin-top:.5em}
.archive-list li{display:flex;justify-content:space-between;gap:16px;align-items:baseline;
padding:14px 2px;border-bottom:1px solid var(--line)}
.archive-list a{font-family:var(--font-display);font-size:1.1rem;color:var(--ink);text-decoration:none}
.archive-list a:hover{color:var(--bronze-deep)}
.archive-date{font-size:.85rem;color:var(--ink-soft);white-space:nowrap}
.issue{margin-top:.5em}
.issue h1{font-size:clamp(1.7rem,4vw,2.4rem);margin-bottom:.4em}
.issue h2{font-size:1rem;font-weight:600;font-family:var(--font-body);letter-spacing:.14em;
text-transform:uppercase;color:var(--bronze-deep);margin:2em 0 .7em}
.issue h3{font-size:1.12rem;margin-top:1.4em}
.issue p{margin:.5em 0;font-size:1rem}
.issue ul{margin:.5em 0 .5em 1.2em}
.issue hr{border:0;border-top:1px solid var(--line);margin:2em 0}
.issue a{word-break:break-all}
.issue-cta{margin-top:56px;padding-top:32px;border-top:1px solid var(--line)}
.site-footer{background:#101a30;color:#8b94ad;font-size:.85rem;margin-top:0}
.footer-inner{display:flex;justify-content:space-between;flex-wrap:wrap;gap:8px;
padding-top:22px;padding-bottom:22px}
@media(max-width:640px){.subscribe-row{flex-direction:column}.brief-hero{padding:56px 0 44px}
.band{padding:52px 0}.wordmark-sub{white-space:normal}}
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

function prettyDate(iso) {
  const [y, m, d] = iso.split("-").map(Number);
  const months = ["January", "February", "March", "April", "May", "June",
    "July", "August", "September", "October", "November", "December"];
  return `${months[(m || 1) - 1]} ${d}, ${y}`;
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
