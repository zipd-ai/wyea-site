// Cloudflare Worker: serves the static site, handles the contact form, and
// runs The Brief (newsletter subscribe + archive — brief.js).
//
// POST /api/contact — validate, de-duplicate against D1, store the lead,
// notify by email through Resend. /api/subscribe and /brief* are handled in
// brief.js. Everything else falls through to the static assets.
//
// Bindings (wrangler.jsonc): DB (D1), ASSETS (static assets).
// Secrets (wrangler secret put): CONTACT_EMAIL — where leads are delivered;
// RESEND_API_KEY — Resend (shared with The Brief); TURNSTILE_SECRET —
// optional, enables Turnstile verification when set.

import { handleBrief } from "./brief.js";

const MAX_FIELD = { name: 200, firm: 200, email: 254, message: 5000 };
const RATE_LIMIT_PER_HOUR = 5;

export default {
  async fetch(request, env, ctx) {
    const url = new URL(request.url);
    if (url.pathname === "/api/contact") {
      if (request.method !== "POST") {
        return json({ error: "method not allowed" }, 405);
      }
      try {
        return await handleContact(request, env, ctx);
      } catch (err) {
        console.error("contact form error:", err);
        return json({ error: "server error" }, 500);
      }
    }
    const brief = await handleBrief(request, env, ctx, url);
    if (brief) return brief;
    return env.ASSETS.fetch(request);
  },
};

async function handleContact(request, env, ctx) {
  let body;
  try {
    body = await request.json();
  } catch {
    return json({ error: "bad request" }, 400);
  }

  // Honeypot: a real visitor never fills the hidden field. Pretend success
  // so bots learn nothing.
  if (body.website) return json({ ok: true });

  const name = clean(body.name, MAX_FIELD.name);
  const firm = clean(body.firm, MAX_FIELD.firm);
  const email = clean(body.email, MAX_FIELD.email).toLowerCase();
  const message = clean(body.message, MAX_FIELD.message);
  const token = clean(body.token, 64);

  if (!name || !message || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
    return json({ error: "please fill in your name, a valid email, and a message" }, 400);
  }
  if (!token) return json({ error: "bad request" }, 400);

  // Turnstile runs only when the secret is configured, so the form works
  // before the widget exists and can be enabled without a code change.
  if (env.TURNSTILE_SECRET) {
    const ok = await verifyTurnstile(env.TURNSTILE_SECRET, body.turnstile, request);
    if (!ok) return json({ error: "verification failed — please try again" }, 403);
  }

  const ip = request.headers.get("CF-Connecting-IP") || "";
  const recent = await env.DB.prepare(
    "SELECT COUNT(*) AS n FROM submissions WHERE ip = ?1 AND created_at > datetime('now', '-1 hour')"
  ).bind(ip).first();
  if (recent && recent.n >= RATE_LIMIT_PER_HOUR) {
    return json({ error: "too many messages — please try again later" }, 429);
  }

  // Dedup: the token catches mechanical resubmits (double-click, retry);
  // the content hash catches the same person sending the same inquiry
  // again. Either duplicate reads as success — idempotent to the visitor.
  const dedupHash = await sha256(`${email}\n${normalize(message)}`);
  let inserted;
  try {
    inserted = await env.DB.prepare(
      `INSERT INTO submissions (token, dedup_hash, name, firm, email, message, ip)
       VALUES (?1, ?2, ?3, ?4, ?5, ?6, ?7)`
    ).bind(token, dedupHash, name, firm || null, email, message, ip).run();
  } catch (err) {
    if (String(err).includes("UNIQUE constraint failed")) {
      return json({ ok: true, duplicate: true });
    }
    throw err;
  }

  // The lead is stored; notification failure must not fail the request.
  ctx.waitUntil(
    notify(env, { id: inserted.meta.last_row_id, name, firm, email, message })
  );
  return json({ ok: true });
}

async function notify(env, lead) {
  if (!env.RESEND_API_KEY || !env.CONTACT_EMAIL) {
    console.error("notify skipped: RESEND_API_KEY / CONTACT_EMAIL not configured");
    return;
  }
  const text = [
    `Name: ${lead.name}`,
    lead.firm ? `Firm: ${lead.firm}` : null,
    `Email: ${lead.email}`,
    "",
    lead.message,
  ].filter((l) => l !== null).join("\n");

  const res = await fetch("https://api.resend.com/emails", {
    method: "POST",
    headers: {
      Authorization: `Bearer ${env.RESEND_API_KEY}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      // FROM_EMAIL: set to "WYEA <contact@wyea.ai>" once the domain is
      // verified in Resend; the onboarding address needs no verification.
      from: env.FROM_EMAIL || "WYEA Site <onboarding@resend.dev>",
      to: [env.CONTACT_EMAIL],
      reply_to: [lead.email],
      subject: `New inquiry from wyea.ai — ${lead.name}`,
      text,
    }),
  });
  if (res.ok) {
    await env.DB.prepare("UPDATE submissions SET emailed = 1 WHERE id = ?1")
      .bind(lead.id).run();
  } else {
    console.error("resend failed:", res.status, await res.text());
  }
}

async function verifyTurnstile(secret, turnstileToken, request) {
  if (!turnstileToken) return false;
  const res = await fetch("https://challenges.cloudflare.com/turnstile/v0/siteverify", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      secret,
      response: turnstileToken,
      remoteip: request.headers.get("CF-Connecting-IP") || undefined,
    }),
  });
  if (!res.ok) return false;
  const data = await res.json();
  return data.success === true;
}

function clean(value, max) {
  return typeof value === "string" ? value.trim().slice(0, max) : "";
}

function normalize(text) {
  return text.toLowerCase().replace(/\s+/g, " ").trim();
}

async function sha256(text) {
  const digest = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(text));
  return [...new Uint8Array(digest)].map((b) => b.toString(16).padStart(2, "0")).join("");
}

function json(data, status = 200) {
  return new Response(JSON.stringify(data), {
    status,
    headers: { "Content-Type": "application/json" },
  });
}
