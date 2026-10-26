---
name: WYEA
description: Quiet paper-and-light site for firm-owned insurance document engines; proof shown as translucent sheets that cite their source.
colors:
  paper: "#fbfaf5"
  paper-warm: "#f4f2ea"
  paper-deep: "#ebe8dc"
  paper-rule: "#d9d5c6"
  white: "#ffffff"
  ink: "#2a2220"
  ink-soft: "#4a3f3b"
  ink-muted: "#5b504b"
  ink-faint: "#6b5f59"
  ink-mist: "#d6cfc8"
  indigo: "#3a3fe0"
  indigo-wash: "#f1f1ff"
  indigo-line: "#c7c9ff"
  indigo-on-ink: "#a5b4fc"
  glow-blush: "#f2c4cf"
  glow-periwinkle: "#c4cbf3"
  glow-peach: "#f8d3b8"
  glow-sage: "#d3e0cf"
  found-green: "#166534"
  found-green-wash: "#dcfce7"
  flag-rust: "#9a3412"
  flag-rust-wash: "#ffedd5"
typography:
  display:
    fontFamily: "Geist, system-ui, -apple-system, Segoe UI, sans-serif"
    fontSize: "clamp(2.75rem, 5.7vw, 5.4rem)"
    fontWeight: 300
    lineHeight: 1.04
    letterSpacing: "-0.035em"
  headline:
    fontFamily: "Geist, system-ui, -apple-system, Segoe UI, sans-serif"
    fontSize: "clamp(2.1rem, 4.2vw, 3.5rem)"
    fontWeight: 300
    lineHeight: 1.04
    letterSpacing: "-0.03em"
  statement:
    fontFamily: "Geist, system-ui, -apple-system, Segoe UI, sans-serif"
    fontSize: "clamp(1.75rem, 3.5vw, 3.25rem)"
    fontWeight: 300
    lineHeight: 1.16
    letterSpacing: "-0.03em"
  title:
    fontFamily: "Geist, system-ui, -apple-system, Segoe UI, sans-serif"
    fontSize: "1.375rem"
    fontWeight: 400
    lineHeight: 1.25
    letterSpacing: "-0.015em"
  body:
    fontFamily: "Geist, system-ui, -apple-system, Segoe UI, sans-serif"
    fontSize: "1.0625rem"
    fontWeight: 400
    lineHeight: 1.6
  label:
    fontFamily: "Geist, system-ui, -apple-system, Segoe UI, sans-serif"
    fontSize: "0.8125rem"
    fontWeight: 500
    letterSpacing: "0.12em"
rounded:
  sm: "6px"
  md: "10px"
  lg: "14px"
  xl: "20px"
  pill: "999px"
spacing:
  xs: "4px"
  sm: "8px"
  md: "16px"
  lg: "24px"
  xl: "48px"
  band: "clamp(80px, 9vw, 128px)"
  gutter: "28px"
components:
  button-primary:
    backgroundColor: "{colors.ink}"
    textColor: "{colors.paper}"
    typography: "{typography.label}"
    rounded: "{rounded.pill}"
    padding: "0 28px"
    height: "48px"
  button-primary-hover:
    backgroundColor: "{colors.indigo}"
    textColor: "{colors.white}"
  button-ghost:
    backgroundColor: "transparent"
    textColor: "{colors.ink}"
    rounded: "{rounded.pill}"
    padding: "0 28px"
    height: "48px"
  button-light:
    backgroundColor: "{colors.paper}"
    textColor: "{colors.ink}"
    rounded: "{rounded.pill}"
    padding: "0 28px"
    height: "48px"
  sheet:
    backgroundColor: "{colors.white}"
    textColor: "{colors.ink}"
    rounded: "{rounded.md}"
    padding: "20px"
  cap-panel:
    backgroundColor: "{colors.white}"
    rounded: "{rounded.xl}"
    padding: "clamp(32px, 5vw, 80px)"
  ink-panel:
    backgroundColor: "{colors.ink}"
    textColor: "{colors.paper}"
    rounded: "{rounded.xl}"
  input:
    backgroundColor: "{colors.white}"
    textColor: "{colors.ink}"
    rounded: "{rounded.sm}"
    padding: "12px 16px"
  chip:
    backgroundColor: "{colors.indigo-wash}"
    textColor: "{colors.indigo}"
    rounded: "{rounded.pill}"
    padding: "2px 8px"
---

# Design System: WYEA

## Overview

**Creative North Star: "Paper in Daylight"**

The site is a warm paper ground with brown-black ink, and the only imagery is light: soft blurred fields of blush, peach and sage that drift behind large, light-weight Geist. The product is shown as translucent paper sheets that answer with their source, so the page proves the one claim the buyer cares about (every line shows where it came from) instead of describing it. The direction is modelled on the look and feel of ode.com, pinned by Anderson on 2026-10-20, and replaces Direction A (indigo, rounded cards).

Density is low and sections are asymmetric: a small label sits left, large copy sits right. Structure is carried by dotted hairlines and generous bands, not by boxes. The reader is an underwriting or claims lead who reads skeptically, so the quiet surface leaves room for the invented example sheets and the plain security facts to carry the weight.

Light only. The site does not follow the OS dark setting; the single dark surface is an inset ink panel for the vendor-review block.

**Key Characteristics:**
- Warm paper ground (#fbfaf5), warm ink (#2a2220), never pure white or black as a page color.
- Display type is Geist at weight 300 with tight negative tracking; weight 400 to 500 elsewhere.
- Buttons are small, tracked, uppercase pills with a drawn arrow.
- Light fields with fine grain are the imagery; no stock photography, no screenshots.
- Product examples are always labeled "Invented example" and show a source chip.
- Dotted hairlines divide open sections; solid hairlines only for forms, header and timeline cards.

## Colors

A paper-and-ink neutral base with one indigo accent used sparingly, and four pastel glow colors that exist only as blurred light.

### Primary
- **Indigo** (#3a3fe0): the single accent. Button hover fill, inline emphasis in headings (`h1 em`), the key step marker, source chips, text selection, and the focus ring. Never a large fill at rest.
- **Indigo Wash** (#f1f1ff) and **Indigo Line** (#c7c9ff): chip ground and highlighted-step ground and border.
- **Indigo on Ink** (#a5b4fc): the accent when it sits on the ink panel.

### Secondary
- **Found Green** (#166534) on **Green Wash** (#dcfce7): a result the engine located in the source.
- **Flag Rust** (#9a3412) on **Rust Wash** (#ffedd5): a line handed to a person. Used for "your adjuster" and "signs off" states.

### Tertiary (light fields only)
- **Blush** (#f2c4cf), **Peach** (#f8d3b8), **Sage** (#d3e0cf): used only as blurred radial blobs and as the clause highlight (Peach). Never as flat fills, text, or borders. The second field (`--field-b`) is Sage. Periwinkle (#c4cbf3) stays defined but is not used in any field: Anderson, 2026-10-26, no purple gradient. Individual capability panels override a few blob tints slightly (for example #f0b3c6, #f6c39a, #b8dcc0) to vary each field.

### Neutral
- **Paper** (#fbfaf5): page ground.
- **Warm Paper** (#f4f2ea): alternate band surface (`band-paper`).
- **Deep Paper** (#ebe8dc): default border and pressed surfaces.
- **Paper Rule** (#d9d5c6): strong border and the dotted hairline color.
- **White** (#ffffff): raised surfaces, form fields, capability panels; sheets use white at 74% to 94% alpha.
- **Ink** (#2a2220): text, primary button fill, and the dark panel ground.
- **Ink Soft** (#4a3f3b), **Ink Muted** (#5b504b), **Ink Faint** (#6b5f59): body, secondary and tertiary text. Ink Faint is the lightest text color allowed; contrast is checked by `npm run contrast`.
- **Ink Mist** (#d6cfc8): text on the ink panel.

### Named Rules
**The Light Is the Image Rule.** Color enters the page as blurred light behind content, never as a flat block. If a surface needs color, it gets a `.lights` field, not a fill.

**The One Accent Rule.** Indigo marks interaction (hover, focus, selection) and the single key step. It is not a section background and not a decorative color.

## Typography

**Display Font:** Geist (variable, self-hosted, weights 100 to 900) with system-ui fallback
**Body Font:** Geist
**Label/Mono Font:** Geist Mono (400 to 600), used for figure detail only

**Character:** One family doing two jobs. Large light-weight Geist reads as calm and editorial; the same family at 400 to 500 reads as plain product text. Hierarchy comes from size and weight, not from a second face.

### Hierarchy
- **Display** (300, 44 to 86px via clamp(2.75rem, 5.7vw, 5.4rem), 1.04, -0.035em): home hero h1 only, max 12ch.
- **Headline** (300, 34 to 56px, 1.04, -0.03em): h2 for sections. Interior h1 is a step down (38 to 60px).
- **Statement** (300, 28 to 52px, 1.16): the scroll-lit mission paragraph, with a smaller regular-weight label to its left.
- **Title** (400, 22px, 1.25, -0.015em): h3 and ledes. Capability panel h3 scales up to 52px at weight 300.
- **Body** (400, 17px, 1.6): paragraphs, capped at 68ch; ledes at 22px, 34 to 48ch.
- **Label** (500, 13px, 0.12em tracking, uppercase): button text and sheet titles. 12px is the smallest size, used for sheet titles and chips.

### Named Rules
**The Light Weight Rule.** Large type is weight 300. Weight 600 appears only in small functional text (field labels, source tags, table-like rows), never in headlines.

**The Sentence Case Rule.** Uppercase with tracking is reserved for buttons and sheet titles. Section openers are plain headings, not tracked labels.

## Layout

A single 1256px page width with a 28px gutter (20px below 768px). Sections ("bands") use vertical padding of clamp(80px, 9vw, 128px); tight bands use clamp(56px, 6vw, 96px). Spacing is a 4px base scale. Breakpoints are 375, 768, 1024 and 1280, with media queries at max-width 767px and 1023px.

Home composition: a full-height hero (up to 960px tall) that slides under the transparent header, a two-column split with the headline left and the paper sheets right; a dotted-ruled ticker; an asymmetric statement section (0.8fr label, 2.2fr text) with a sticky label; three capability panels that stack with sticky scrolling; an open-ruled benefits section; the inset ink panel; a drawn six-step line; and a closing field with the demo form. Below 1024px every grid collapses to one column and sticky stacking is turned off.

Rhythm is varied on purpose: wide gaps around statements, tight dotted-rule rows for lists and facts.

## Elevation & Depth

Hybrid, mostly flat. Sections have no shadow; depth is conveyed by translucency, blur and overlap. The only large shadow belongs to floating paper (sheets, capability mini-UIs, the nav mega menu). Everything else separates with hairlines.

### Shadow Vocabulary
- **Float** (`box-shadow: 0 30px 70px rgb(60 40 40 / 0.14)`): sheets, capability mini-UIs, mega menu. Warm brown tint, never black.
- **Soft** (`box-shadow: 0 8px 22px rgb(60 40 40 / 0.07)`): small embedded snippets (`.mini`).
- **Glass** (`backdrop-filter: blur(14px)` with white at 74% to 94%): sheets and the scrolled header (blur 14px, saturate 140%).
- **Inset ring** (`box-shadow: inset 0 0 0 1px <border-strong>`): ghost buttons and the source tag, replacing a border.

### Named Rules
**The Floating Paper Rule.** Only things that behave like loose sheets of paper (sheets, example UIs, menus) may carry the Float shadow. Containers, bands and text blocks do not.

## Shapes

Soft but not bubbly: 6px on fields, 10px on sheets and small snippets, 14px on menus and legacy cards, 20px on capability panels and the ink panel, and a full pill (999px) on buttons, chips, source tags and bars. The blobs themselves are irregular organic shapes (animated border-radius morph) and are always blurred 38 to 46px so no edge reads. Open sections have no radius at all; they are defined by a dotted top rule. Sheets are rotated between -5 and 3.5 degrees to read as loose paper; capability mini-UIs rotate about 1.7 degrees and straighten on hover.

## Components

### Buttons
- **Shape:** full pill (999px), 48px tall, 28px side padding; the small variant is 40px tall.
- **Primary:** Ink fill, Paper text, 13px weight 500 uppercase with 0.12em tracking and a drawn arrow (CSS mask, 14px) that slides 4px right on hover.
- **Hover / Focus:** primary fills Indigo with white text over 240ms ease-out; focus is a 2px Indigo outline offset 4px (Indigo on Ink on the dark panel).
- **Ghost:** transparent, inset 1px Paper Rule ring that darkens to Ink on hover. The small primary is rendered as this ghost style.
- **Light / Outline-light:** Paper fill (or inset ring) for use on the ink panel.

### Sheets (signature)
Translucent white paper, 10px radius, 20px padding, Float shadow, slightly rotated, layered three deep: a faint back sheet with placeholder bars, a middle sheet with a highlighted clause, and a front sheet with a quoted answer, a source tag and a dotted-ruled flag line. The clause highlight draws in left to right in Peach once on load. Parallax offsets follow pointer and scroll (set by site.js) and stop under reduced motion. Always captioned "Invented example".

### Light fields
`.lights` holds 2 to 4 blurred blobs plus a fine grain layer. Blobs drift on a 22s alternating loop and shift a little with pointer and scroll. On the ink panel the field drops to 38% opacity. Content sits above with z-index 1.

### Capability panels
White 20px-radius panels, copy on one side and a rotated example UI on the other, each with its own light field. They stack sticky under the header on wide screens.

### Inputs / Fields
- **Style:** 1px Paper Rule border, white fill, 6px radius, 12px by 16px padding, 17px text. Labels are 15px weight 600 above the field.
- **Focus:** 2px Indigo outline, border darkens to Ink.
- **On ink:** ink fill, Ink Mist border, Indigo on Ink focus.

### Navigation
Sticky header, 72px, transparent over the hero and Paper at 82% alpha with blur after scrolling. Wordmark is 22px weight 500 with 0.34em tracking. Links are 15px Ink Faint, Ink when active or hovered. Dropdowns are white mega panels (14px radius, Float shadow) in two columns. Below 1024px the nav becomes a full-width drawer with ruled rows.

### Chips and tags
Chip: Indigo Wash with Indigo text, pill, 12px. Source tag: white pill with an inset ring, 13px. "Invented example" tag: 13px Ink Faint text.

### Hero graphic (`.const`, partial `hero-graphic`)
A drawn SVG on the hero, right of the headline: six invented document cards with one-stroke icons, dotted lines, and two lit routes (indigo, dashes flowing) into an answer card that reads "Found" with a source underline. A scanned-report card is tinted Flag Rust ("For you"). Always captioned "Invented example". Cards fade up in sequence; the routes stop under reduced motion.

### Explorer (`[data-memory]`, partial `explorer`)
Home and /explore. A clickable map of 14 invented documents on a 160 by 100 grid over a dotted field, beside a panel of four questions. The HTML is a plain list of documents and answers that works with scripting off; site.js builds the map from it. Two arrangements: "Files and folders" (meaningless filenames, folder lines) and "What it means" (four lanes, lines for what amends or cites what). The map sorts itself once on first view. A selected document or question dims the rest, lights its links with flowing dashes and a soft indigo glow. Node icons appear only when the map is wider than 680px (container query). Each question ends in Found, For you, or Not found; a passage it cannot find never becomes an answer.

### Step line (`.flow`)
/explore. Five steps (Connect, Read, Link, Answer, Review) as dots on a dotted line; the current step is indigo with a halo, earlier steps ink. One sentence and an invented example card per step.

### Ticker and steps
Ticker: a dotted-ruled strip of 32px weight 300 phrases scrolling at 48s, edge-masked, with a pause control; it wraps statically under reduced motion. Steps: a six-point line, dotted at rest and drawn solid as you reach it, with one Indigo key point.

## Do's and Don'ts

### Do:
- **Do** use only the semantic tokens in `styles.css`; never place a raw color, size or spacing value in a page. A `style` attribute fails the build.
- **Do** keep every example invented, labeled "Invented example(s)", and paired with a source tag or chip.
- **Do** let light fields carry imagery, with content layered above at z-index 1.
- **Do** use dotted hairlines (1px, Paper Rule) between open sections and list rows.
- **Do** keep the page working with scripting off and under `prefers-reduced-motion`: drift, parallax, ticker and highlight all stop, and content stays visible.
- **Do** draw button arrows with the CSS mask so they stay crisp and slide on hover.

### Don't:
- **Don't** return to the Direction A look: indigo fills, rounded card grids, dark mode.
- **Don't** put color in flat blocks; blush, peach and sage exist only as blurred light and the clause highlight.
- **Don't** use weight 300 below the title size, or weight 600 or heavier in headlines.
- **Don't** use black shadows; shadows carry the warm brown tint.
- **Don't** add stock photography, screenshots, customer logos or client names.
- **Don't** hard-code breakpoints in new CSS outside the 767px and 1023px queries.

### Not canonized (defects and drift the build carries)
- `.eyebrow` and `.tile-num` (mono, accent-colored small labels) and the numbered `.steps-n` labels are kicker-style devices left over from Direction A and the process line; they are not part of this system and new surfaces should not use them. The home page itself does not use `.eyebrow`.
- The `.stage` panel (`--gradient-glow`, now flat Deep Paper since 2026-10-26; the closing band uses the same flat ground) and the card patterns `.tile`, `.pillar` (card form), `.stat`, `.timeline li` are Direction A carryovers still used by inner pages; the card-with-fill look is not the Direction B pattern.
- Typed glyphs: `.arrow` links use a typed arrow character, mega links a typed arrow, and the explorer toggle a typed plus and minus. Buttons use the drawn arrow; the glyph versions are unconverted.
- `docs/design-system.md` still describes Direction A and needs a separate update.
