#!/usr/bin/env node
// Checks every text and background pair the design system uses against
// WCAG 2.2 AA (4.5:1 for text, 3:1 for large display text and UI marks),
// in both themes, reading the token values straight from styles.css.
// Writes the results table into docs/design-system.md between the
// <!-- contrast:start --> and <!-- contrast:end --> markers, and exits 1
// if any pair fails.

import { readFileSync, writeFileSync } from "node:fs";
import { fileURLToPath } from "node:url";

const ROOT = fileURLToPath(new URL("..", import.meta.url));
const css = readFileSync(ROOT + "styles.css", "utf8");

function block(re) {
  const m = css.match(re);
  if (!m) throw new Error("token block not found: " + re);
  const vars = {};
  for (const d of m[1].matchAll(/(--[a-z0-9-]+):\s*([^;]+);/g)) vars[d[1]] = d[2].trim();
  return vars;
}

// The primitive palette, then the light semantic layer, then the forced
// dark layer (identical to the prefers-color-scheme one; the build checks
// that they match).
const blocks = [...css.matchAll(/:root \{([\s\S]*?)\n\}/g)].map((m) => m[1]);
const parse = (text) => Object.fromEntries([...text.matchAll(/(--[a-z0-9-]+):\s*([^;]+);/g)].map((d) => [d[1], d[2].trim()]));
const primitives = parse(blocks[0]);
const light = { ...primitives, ...parse(blocks[1]) };
const darkForced = block(/:root\[data-theme="dark"\] \{([\s\S]*?)\n\}/);
const darkSystem = block(/:root:not\(\[data-theme="light"\]\) \{([\s\S]*?)\n  \}/);
const dark = { ...light, ...darkForced };

const problems = [];
for (const [k, v] of Object.entries(darkForced)) {
  if (darkSystem[k] !== v) problems.push(`dark token ${k} differs between the system and forced blocks`);
}
for (const k of Object.keys(darkSystem)) {
  if (!(k in darkForced)) problems.push(`dark token ${k} is missing from the forced block`);
}

function resolve(theme, name, depth = 0) {
  const v = theme[name];
  if (!v) throw new Error("unknown token " + name);
  const ref = v.match(/^var\((--[a-z0-9-]+)\)$/);
  if (ref) return resolve(theme, ref[1], depth + 1);
  return v;
}

function rgb(value) {
  if (value.startsWith("#")) {
    const h = value.slice(1);
    return [0, 2, 4].map((i) => parseInt(h.slice(i, i + 2), 16));
  }
  const m = value.match(/rgb\((\d+) (\d+) (\d+)/);
  if (m) return m.slice(1, 4).map(Number);
  throw new Error("cannot read color " + value);
}

function luminance([r, g, b]) {
  const f = (c) => { c /= 255; return c <= 0.03928 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4; };
  return 0.2126 * f(r) + 0.7152 * f(g) + 0.0722 * f(b);
}

function ratio(a, b) {
  const [x, y] = [luminance(rgb(a)), luminance(rgb(b))].sort((p, q) => q - p);
  return (x + 0.05) / (y + 0.05);
}

// [foreground, background, minimum, what uses it]
const TEXT = 4.5, LARGE = 3;
const pairs = [];
for (const bg of ["--color-bg", "--color-surface", "--color-surface-subtle", "--color-raised"]) {
  pairs.push(["--color-text", bg, TEXT, "Headings and strong text"]);
  pairs.push(["--color-text-soft", bg, TEXT, "Body text"]);
  pairs.push(["--color-text-muted", bg, TEXT, "Secondary text"]);
  pairs.push(["--color-text-faint", bg, TEXT, "Labels and captions"]);
  pairs.push(["--color-accent", bg, TEXT, "Eyebrows, roles, markers"]);
  pairs.push(["--color-accent-strong", bg, TEXT, "Links"]);
  pairs.push(["--color-ok", bg, TEXT, "Found marks"]);
  pairs.push(["--color-flag", bg, TEXT, "Flag marks"]);
  pairs.push(["--color-warning", bg, TEXT, "Invented-example label"]);
}
pairs.push(["--color-ok", "--color-ok-wash", TEXT, "Pill: ok"]);
pairs.push(["--color-flag", "--color-flag-wash", TEXT, "Pill: flag, near date"]);
pairs.push(["--color-warning", "--color-warning-wash", TEXT, "Pill: ask us, draft banner"]);
pairs.push(["--color-text", "--color-warning-wash", TEXT, "Draft banner text"]);
pairs.push(["--color-text-soft", "--color-ok-wash", TEXT, "Quote chip"]);
pairs.push(["--color-text-muted", "--color-surface", TEXT, "Pill: mute"]);
pairs.push(["--color-on-accent", "--color-accent", TEXT, "Button hover, selection"]);
pairs.push(["--color-btn-text", "--color-btn-bg", TEXT, "Primary button"]);
pairs.push(["--color-focus", "--color-bg", LARGE, "Focus ring (UI mark)"]);
pairs.push(["--color-rule", "--color-bg", LARGE, "Structural rules (UI mark)"]);
for (const fg of ["--color-on-inverse", "--color-on-inverse-soft", "--color-on-inverse-faint", "--color-inverse-accent"]) {
  pairs.push([fg, "--color-inverse-bg", TEXT, "Ink bands, CTA, footer"]);
}
pairs.push(["--color-inverse-bg", "--color-on-inverse", TEXT, "Light button on ink"]);

const rows = [];
for (const [fg, bg, min, use] of pairs) {
  const l = ratio(resolve(light, fg), resolve(light, bg));
  const d = ratio(resolve(dark, fg), resolve(dark, bg));
  const pass = l >= min && d >= min;
  if (!pass) problems.push(`${fg} on ${bg}: light ${l.toFixed(2)}, dark ${d.toFixed(2)}, needs ${min}`);
  rows.push(`| \`${fg}\` | \`${bg}\` | ${use} | ${l.toFixed(2)} | ${d.toFixed(2)} | ${min} | ${pass ? "Pass" : "FAIL"} |`);
}

const table = [
  "| Text | Background | Used for | Light | Dark | Minimum | Result |",
  "|---|---|---|---|---|---|---|",
  ...rows,
].join("\n");

const docPath = ROOT + "docs/design-system.md";
const doc = readFileSync(docPath, "utf8");
const next = doc.replace(/<!-- contrast:start -->[\s\S]*<!-- contrast:end -->/,
  `<!-- contrast:start -->\n${table}\n<!-- contrast:end -->`);
if (next !== doc) writeFileSync(docPath, next);

console.log(`${pairs.length} pairs checked in light and dark`);
if (problems.length) {
  console.error(problems.map((p) => "  " + p).join("\n"));
  process.exit(1);
}
console.log("all pairs pass WCAG 2.2 AA");
