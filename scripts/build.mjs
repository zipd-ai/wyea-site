#!/usr/bin/env node
// Site build for wyea.ai. There is no bundler: the HTML in the repo is what
// Cloudflare serves. This script does two jobs.
//
//   1. Sync partials. Every page carries marked regions
//        <!-- @partial header --> ... <!-- @end header -->
//      and the text between the markers is replaced with partials/<name>.html.
//      The nav link for the current page gets aria-current="page".
//
//   2. Check the site against the rules in CLAUDE.md that a machine can
//      check, and exit 1 if any fails:
//        - no em or en dashes in anything deployed
//        - every page has one h1, a title of 60 characters or fewer and a
//          meta description of 160 or fewer, unique across indexable pages
//        - every indexable page has a canonical URL and is in the sitemap;
//          no noindex page is in the sitemap
//        - every internal link resolves to a page, a file or a Worker route
//        - every JSON-LD block parses
//        - no style attributes or <style> blocks in pages (tokens only)
//        - the booking link is the one booking link
//
// Usage: node scripts/build.mjs           sync, then check
//        node scripts/build.mjs --check   check only, change nothing

import { readFileSync, writeFileSync, readdirSync, statSync, existsSync } from "node:fs";
import { join, relative, sep } from "node:path";

const ROOT = new URL("..", import.meta.url).pathname;
const CHECK_ONLY = process.argv.includes("--check");
const BOOKING = "https://calendar.app.google/hMuBjTub3YHa9rKT7";

// Built from code points so this file never contains the characters it bans.
const EN_DASH = String.fromCharCode(0x2013);
const EM_DASH = String.fromCharCode(0x2014);

// Never deployed, or not ours to rewrite.
const SKIP_DIRS = new Set(["node_modules", ".git", ".wrangler", ".claude", "docs", "partials", "brief", "scripts", "fonts", "assets"]);
const SKIP_FILES = new Set(["google9c6033754ec9d367.html"]);

// Paths the Worker answers itself, so a link to them is not a missing file.
const WORKER_ROUTES = ["/sitemap.xml", "/api/contact"];

// Content left untouched on purpose (decisions.md): only their header and
// footer are synced, so their own inline styles are not reported.
const UNTOUCHED = new Set(["/privacy", "/terms"]);

function walk(dir, out = []) {
  for (const name of readdirSync(dir)) {
    const p = join(dir, name);
    if (statSync(p).isDirectory()) {
      if (!SKIP_DIRS.has(name)) walk(p, out);
    } else if (name.endsWith(".html") && !SKIP_FILES.has(name)) {
      out.push(p);
    }
  }
  return out;
}

function urlPath(file) {
  const rel = relative(ROOT, file).split(sep).join("/");
  if (rel === "index.html") return "/";
  return "/" + rel.replace(/\.html$/, "");
}

const pages = walk(ROOT).sort();
const partials = {};
for (const name of readdirSync(join(ROOT, "partials"))) {
  if (name.endsWith(".html")) partials[name.replace(/\.html$/, "")] = readFileSync(join(ROOT, "partials", name), "utf8").replace(/\n$/, "");
}

// ------------------------------------------------------------ 1. sync ---

function indent(text, pad) {
  return text.split("\n").map((l) => (l ? pad + l : l)).join("\n");
}

function render(name, path) {
  let html = partials[name];
  if (name === "header") {
    html = html.replace(/(<a class="(?:nav-link|mega-link)" href=")([^"]+)(")/g, (m, a, href, c) =>
      href === path ? `${a}${href}${c} aria-current="page"` : m);
  }
  return html;
}

let synced = 0;
if (!CHECK_ONLY) {
  for (const file of pages) {
    const before = readFileSync(file, "utf8");
    const path = urlPath(file);
    const after = before.replace(
      /^([ \t]*)<!-- @partial ([a-z-]+) -->\n[\s\S]*?^[ \t]*<!-- @end \2 -->/gm,
      (m, pad, name) => {
        if (!partials[name]) throw new Error(`${relative(ROOT, file)}: unknown partial "${name}"`);
        return `${pad}<!-- @partial ${name} -->\n${indent(render(name, path), pad)}\n${pad}<!-- @end ${name} -->`;
      }
    );
    if (after !== before) {
      writeFileSync(file, after);
      synced++;
    }
  }
}

// brief.js renders the remaining Worker pages (confirm, unsubscribe) and
// keeps its own copy of the chrome in two template literals. Sync those too.
if (!CHECK_ONLY) {
  const briefPath = join(ROOT, "brief.js");
  const before = readFileSync(briefPath, "utf8");
  const footer = partials.footer.replace(/\n*<script src="\/site\.js" defer><\/script>\s*$/, "");
  const after = before
    .replace(/const SITE_HEADER = `[\s\S]*?`;/, () => "const SITE_HEADER = `" + partials.header + "`;")
    .replace(/const SITE_FOOTER = `[\s\S]*?`;/, () => "const SITE_FOOTER = `" + footer + "`;");
  if (after !== before) {
    writeFileSync(briefPath, after);
    synced++;
  }
}

// ----------------------------------------------------------- 2. check ---

const problems = [];
const fail = (file, msg) => problems.push(`${file.startsWith("/") ? relative(ROOT, file) : file}: ${msg}`);

// Dashes, across every deployed text file and the docs that feed them.
const TEXT_EXT = /\.(html|css|js|mjs|txt|xml|json|jsonc|md)$/;
function walkAll(dir, out = []) {
  for (const name of readdirSync(dir)) {
    const p = join(dir, name);
    if (statSync(p).isDirectory()) {
      if (!["node_modules", ".git", ".wrangler", "brief", "fonts", "assets"].includes(name)) walkAll(p, out);
    } else if (TEXT_EXT.test(name)) out.push(p);
  }
  return out;
}
for (const file of walkAll(ROOT)) {
  readFileSync(file, "utf8").split("\n").forEach((line, i) => {
    if (line.includes(EN_DASH) || line.includes(EM_DASH)) fail(file, `line ${i + 1}: em or en dash`);
  });
}

// Sitemap entries and redirects, read from worker.js.
const worker = readFileSync(join(ROOT, "worker.js"), "utf8");
const sitemap = new Set([...worker.matchAll(/loc: `\$\{base\}([^`]*)`/g)].map((m) => m[1] || "/"));
const moved = new Set([...worker.matchAll(/^\s*"(\/[^"]+)": "\/[^"]*",?$/gm)].map((m) => m[1]));

// Which pages are noindex, so an indexable page can be stopped from
// linking to one (the law firm page and /design-system stay unlinked).
const noindexPaths = new Set(pages
  .filter((f) => /<meta name="robots" content="[^"]*noindex/.test(readFileSync(f, "utf8")))
  .map(urlPath));

const titles = new Map();
const descs = new Map();
const known = new Set(pages.map(urlPath));

function resolves(href) {
  const path = href.split("#")[0].split("?")[0].replace(/\/$/, "") || "/";
  if (known.has(path) || WORKER_ROUTES.includes(path) || moved.has(path)) return true;
  const disk = join(ROOT, path);
  return existsSync(disk) && statSync(disk).isFile();
}

for (const file of pages) {
  const html = readFileSync(file, "utf8");
  const path = urlPath(file);
  const noindex = /<meta name="robots" content="[^"]*noindex/.test(html);
  const isErrorPage = path === "/404";

  const h1s = html.match(/<h1[\s>]/g) || [];
  if (h1s.length !== 1) fail(file, `${h1s.length} h1 elements, expected 1`);

  const title = (html.match(/<title>([^<]*)<\/title>/) || [])[1];
  if (!title) fail(file, "no <title>");
  else if (title.replace(/&amp;/g, "&").length > 60) fail(file, `title is ${title.length} characters: "${title}"`);

  const desc = (html.match(/<meta name="description" content="([^"]*)"/) || [])[1];
  if (!isErrorPage) {
    if (!desc) fail(file, "no meta description");
    else if (!UNTOUCHED.has(path) && desc.replace(/&amp;/g, "&").length > 160) fail(file, `description is ${desc.length} characters`);
  }

  if (!noindex && !isErrorPage) {
    if (titles.has(title)) fail(file, `title duplicates ${titles.get(title)}`);
    titles.set(title, path);
    if (desc && descs.has(desc)) fail(file, `description duplicates ${descs.get(desc)}`);
    descs.set(desc, path);
    const canonical = (html.match(/<link rel="canonical" href="([^"]+)"/) || [])[1];
    const want = "https://wyea.ai" + path;
    if (canonical !== want) fail(file, `canonical is ${canonical}, expected ${want}`);
    if (!sitemap.has(path)) fail(file, "indexable page missing from the sitemap in worker.js");
  } else if (sitemap.has(path)) {
    fail(file, "noindex page is listed in the sitemap");
  }

  for (const name of ["header", "footer"]) {
    if (!html.includes(`<!-- @partial ${name} -->`)) fail(file, `missing the ${name} partial markers`);
  }

  if (!UNTOUCHED.has(path) && /\sstyle="/.test(html)) fail(file, "style attribute; use a component or utility class");
  if (/<style[\s>]/.test(html)) fail(file, "<style> block; styles belong in styles.css");

  for (const m of html.matchAll(/<script type="application\/ld\+json">([\s\S]*?)<\/script>/g)) {
    try { JSON.parse(m[1]); } catch (e) { fail(file, `JSON-LD does not parse: ${e.message}`); }
  }

  for (const m of html.matchAll(/href="([^"]+)"/g)) {
    const href = m[1];
    if (href.startsWith("/") && !href.startsWith("//") && !resolves(href)) fail(file, `broken internal link ${href}`);
    const target = href.split("#")[0].replace(/\/$/, "");
    if (!noindex && href.startsWith("/") && noindexPaths.has(target)) fail(file, `links to noindex page ${target}`);
    if (href.includes("calendar.app.google") && href !== BOOKING) fail(file, `booking link changed: ${href}`);
  }
}

for (const path of sitemap) {
  if (!known.has(path)) fail("worker.js", `sitemap lists ${path}, which has no page`);
}

if (!CHECK_ONLY) console.log(`partials: ${synced} page(s) updated`);
console.log(`checked ${pages.length} pages, ${sitemap.size} sitemap entries`);
if (problems.length) {
  console.error(`\n${problems.length} problem(s):\n` + problems.map((p) => "  " + p).join("\n"));
  process.exit(1);
}
console.log("all checks passed");
