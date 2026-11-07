---
name: LendLoop
description: The neighbourhood's shadow board. Borrow what you need. Lend what you don't.
colors:
  board: "#b4895a"
  board-deep: "#8e6a42"
  board-hole: "#5e4426"
  ink: "#141414"
  ink-soft: "#2a1f12"
  paint: "#f7f4ee"
  paint-line: "#d9d1c3"
  muted: "#5d5246"
  safety: "#f5c518"
  safety-deep: "#d9a900"
  alert: "#b3261e"
  alert-paint: "#fbe3df"
  brass-tag: "#c9a44c"
typography:
  display:
    fontFamily: "Big Shoulders Stencil, Archivo, sans-serif"
    fontSize: "clamp(3.2rem, 7.6vw, 6rem)"
    fontWeight: 900
    lineHeight: 0.92
    letterSpacing: "0.01em"
  headline:
    fontFamily: "Big Shoulders Stencil, Archivo, sans-serif"
    fontSize: "3.75rem"
    fontWeight: 900
    lineHeight: 0.92
    letterSpacing: "0.01em"
  title:
    fontFamily: "Big Shoulders Stencil, Archivo, sans-serif"
    fontSize: "1.875rem"
    fontWeight: 900
    lineHeight: 0.92
    letterSpacing: "0.01em"
  name-strip:
    fontFamily: "Big Shoulders Stencil, Archivo, sans-serif"
    fontSize: "22px"
    fontWeight: 900
    lineHeight: 0.92
    letterSpacing: "0.01em"
  body:
    fontFamily: "Archivo, system-ui, sans-serif"
    fontSize: "15px"
    fontWeight: 500
    lineHeight: 1.5
    fontFeature: "\"tnum\" 1"
  button:
    fontFamily: "Archivo, system-ui, sans-serif"
    fontSize: "14px"
    fontWeight: 600
    lineHeight: 1.25
    letterSpacing: "0.025em"
    fontVariation: "\"wdth\" 88"
  label:
    fontFamily: "Archivo, system-ui, sans-serif"
    fontSize: "11px"
    fontWeight: 700
    lineHeight: 1
    letterSpacing: "0.05em"
    fontVariation: "\"wdth\" 85"
rounded:
  strip: "1px"
  plate: "2px"
  outline: "4px"
  patch: "6px"
  peg: "9999px"
spacing:
  xs: "4px"
  sm: "8px"
  md: "16px"
  card: "20px"
  page-x: "32px"
  section: "96px"
  hole-pitch: "28px"
components:
  button-primary:
    backgroundColor: "{colors.safety}"
    textColor: "{colors.ink}"
    typography: "{typography.button}"
    rounded: "{rounded.plate}"
    padding: "8px 16px"
  button-primary-hero:
    backgroundColor: "{colors.safety}"
    textColor: "{colors.ink}"
    rounded: "{rounded.plate}"
    padding: "12px 24px"
  button-ghost:
    backgroundColor: "transparent"
    textColor: "{colors.ink}"
    typography: "{typography.button}"
    rounded: "{rounded.plate}"
    padding: "8px 16px"
  button-ghost-hover:
    backgroundColor: "{colors.ink}"
    textColor: "{colors.paint}"
  button-danger:
    backgroundColor: "transparent"
    textColor: "{colors.alert}"
    typography: "{typography.button}"
    rounded: "{rounded.plate}"
    padding: "8px 16px"
  button-danger-hover:
    backgroundColor: "{colors.alert}"
    textColor: "{colors.paint}"
  panel:
    backgroundColor: "{colors.paint}"
    textColor: "{colors.ink}"
    rounded: "{rounded.plate}"
    padding: "{spacing.card}"
  input:
    backgroundColor: "#ffffff"
    textColor: "{colors.ink}"
    rounded: "{rounded.plate}"
    padding: "8px 12px"
  field-label:
    textColor: "{colors.muted}"
    typography: "{typography.label}"
  name-strip:
    backgroundColor: "{colors.paint}"
    textColor: "{colors.ink}"
    typography: "{typography.name-strip}"
    rounded: "{rounded.strip}"
    padding: "4px 8px 2px"
  board-label:
    backgroundColor: "{colors.paint}"
    textColor: "{colors.ink}"
    typography: "{typography.label}"
    rounded: "{rounded.strip}"
    padding: "3px 6px 2px"
  badge-pending:
    backgroundColor: "{colors.safety}"
    textColor: "{colors.ink}"
    typography: "{typography.label}"
    rounded: "{rounded.strip}"
  badge-out:
    backgroundColor: "{colors.ink}"
    textColor: "{colors.paint}"
    typography: "{typography.label}"
    rounded: "{rounded.strip}"
  badge-trusted:
    backgroundColor: "{colors.brass-tag}"
    textColor: "{colors.ink}"
    typography: "{typography.label}"
  nav-link:
    textColor: "{colors.paint}"
    typography: "{typography.button}"
    rounded: "{rounded.plate}"
    padding: "6px 12px"
  nav-link-active:
    backgroundColor: "{colors.safety}"
    textColor: "{colors.ink}"
  filter-tape:
    backgroundColor: "{colors.paint}"
    textColor: "{colors.ink}"
    typography: "{typography.label}"
    rounded: "{rounded.strip}"
    padding: "6px 10px 4px"
  filter-tape-active:
    backgroundColor: "{colors.safety}"
    textColor: "{colors.ink}"
  error-note:
    backgroundColor: "{colors.alert-paint}"
    textColor: "{colors.alert}"
    rounded: "{rounded.plate}"
    padding: "8px 12px"
---

# Design System: LendLoop

## Overview

**Creative North Star: "The Shadow Board"**

LendLoop is the neighbourhood's tool wall. The whole page is a sheet of perforated hardboard; every tool hangs as an ink-black silhouette over its own painted outline, and when a tool is out on loan only the outline remains, with a small painted label saying when it comes back. Meaning is carried by the board itself: hanging means home, outline means out, a yellow tag means you asked.

The system is built from workshop materials, not interface chrome. White paint is applied where reading and forms happen (panels, name strips, labels); black is the rail the board hangs from (the header) and the paint tools are cut from; safety yellow is the one bright paint, kept for the thing to do next and for what is active. Headlines are stencilled straight onto the board in a heavy stencil face; everything operational is set in a slightly condensed grotesque so the board stays quick to scan. Density is moderate: the catalogue is a three-column wall of hanging tools, loans are full-width white strips.

It is a single light world. There is no dark theme: the board is a physical object under workshop light. It refuses the marketplace grid of photo cards on white.

**Key Characteristics:**
- Perforated hardboard ground with a regular 28px hole grid across every page.
- Tools are silhouettes over painted outlines; state is read from the board, not from chips alone.
- Painted plates with near-square corners (1-2px), never soft rounded cards.
- One bright paint (safety yellow) for the next action and active states.
- Stencil display for anything painted on the board; condensed Archivo for UI.
- Light only; depth is paint thickness and hanging lift, not floating layers.

## Colors

Workshop materials: a warm tan hardboard, black paint, off-white paint, one safety yellow, and a red that only ever means something went wrong.

### Primary
- **Safety Yellow** (safety): the primary action plate ("Sign in to lend or borrow", "Ask to borrow", "List a tool", "Send request"), the active nav link and active filter tape, the viewer's own pending marks ("You asked" tag, Pending badge), the today marker on the date rail, the input focus halo, the wordmark on the black rail, and text selection.
- **Yellow Lip** (safety-deep): the painted bottom edge under yellow plates; never a fill on its own.

### Neutral
- **Hardboard Tan** (board): the ground of every page and the unperforated patches behind small text. Also the swatch behind small silhouettes inside white panels.
- **Painted Outline** (board-deep): the tool outline painted on the board, dotted rules and dashed empty-state outlines on the board, scrollbar thumb. Decorative contrast only (about 1.6:1 on the board), so an outline never carries state by itself.
- **Hole Bore** (board-hole): the dark bore of each perforation, mixed at 70%.
- **Tool Black** (ink): silhouettes, stencilled headlines, the header rail, ghost-button strokes, focus outlines, primary text on paint.
- **Board Text** (ink-soft): secondary text sitting on the board (subtitles, categories, descriptions, lender line), tinted from the hardboard; 5.1:1 on board. Also the stroke of inputs and neutral badges.
- **White Paint** (paint): panels, name strips, board labels, inactive filter tapes, text on black.
- **Paint Seam** (paint-line): dotted dividers inside white panels (the activity log rule).
- **Paint Muted** (muted): secondary text on white paint only (field labels, date-rail dates, step text, placeholders); 6.9:1 on paint.

### Tertiary
- **Alert Red** (alert) on **Alert Wash** (alert-paint): error notes, failed automation entries, "days late" on the date rail, and the destructive Remove plate. Nothing else.
- **Brass Tag** (brass-tag): only the Trusted Lender inspection tag.

### Named Rules
**The One Bright Paint Rule.** Safety yellow marks the next action or the active and own state. It is never a decorative fill, a section background, or an illustration colour.

**The Red Means Wrong Rule.** Alert red appears only for errors, failures, lateness, and destructive actions. Overdue on the board itself is the hazard stripe, not red.

**The Light Workshop Rule.** One light theme. Do not add a dark palette; the board is a physical object.

## Typography

**Display Font:** Big Shoulders Stencil 700/900 (with Archivo, sans-serif)
**Body Font:** Archivo with the width axis (with system-ui, sans-serif)

**Character:** A heavy, tall stencil that reads as spray paint through a template, paired with a workmanlike grotesque narrowed to 85-88% width for labels and buttons so it echoes the stencil without competing.

### Hierarchy
- **Display** (900, clamp(3.2rem, 7.6vw, 6rem), 0.92): the stencilled tagline on the landing board, two lines, black paint, uppercase.
- **Headline** (900, 3rem mobile / 3.75rem from 640px, 0.92): page titles stencilled on the board ("All tools", "My listings").
- **Title** (900, 1.5-3rem, 0.92): section heads and loan/listing names in stencil ("How a loan runs" at 2.25-3rem; step titles and section heads at 1.875rem; loan names at 1.5rem).
- **Name strip** (900 stencil, 18-22px): the tool's name on its white strip under the silhouette.
- **Body** (500, 15px, ~1.5): subtitles and copy on the board in ink-soft, capped at a prose measure (`max-w-prose` / `max-w-md`). Copy inside panels is 14px in muted. Numbers are tabular everywhere.
- **Button / Nav** (600, 13-14px, 0.025em, uppercase, 88% width): plates and header links.
- **Label** (700, 11px, 0.05em, uppercase, 85% width): board labels, badges, categories, field labels (field labels at 12px semibold in muted).

### Named Rules
**The Painted-On Rule.** Stencil is for things painted on the board or on a strip: the tagline, page and section titles, tool and loan names, the wordmark. Never stencil for body copy, buttons, form text, or labels.

**The Narrow Caps Rule.** Every uppercase UI string uses Archivo narrowed (85% for labels, 88% for buttons and nav) with positive tracking. Mixed-case body text stays at normal width.

## Layout

A centred column (max 72rem) with 16px side padding, 32px from 640px, and 40px top/bottom page padding; the hardboard runs edge to edge behind it. Landing sections are separated by 96px. The landing hero stacks on mobile and splits 0.8fr / 1.2fr from 1024px (copy and action left, live board right). The catalogue is a wall of slots: three columns on the landing board with 16px column and 40px row gaps; empty positions in the last row are filled with bare peg pairs so the wall stays regular. Loans and listings are full-width white strips stacked in a single column, with the small board swatch dropping out below 640px. The "How a loan runs" steps hang from a black hook rail: horizontal across four columns from 640px, a vertical rail down the left on phones. The header is sticky; on phones the nav wraps to its own scrollable row.

## Elevation & Depth

Depth is paint and hanging, not floating. White panels sit flat on the board with only a hairline edge catching the light. Tools hang slightly up-and-left of their painted outline (offset 9%) so the outline reads as a shadow, and lift further (13% / 16%) on hover, focus or press. Yellow plates have a painted lip plus a soft warm drop and lift 1px on hover. The header rail casts the only strong shadow, because the whole board hangs from it. All shadows are warm brown, never neutral grey.

### Shadow Vocabulary
- **Panel edge** (`box-shadow: 0 0 0 1px rgb(60 40 10 / 0.14)`): panels, cards, name strips.
- **Plate rest** (`box-shadow: 0 1px 0 var(--safety-deep), 0 3px 8px rgb(60 40 10 / 0.28)`): primary plate at rest.
- **Plate lift** (`box-shadow: 0 2px 0 var(--safety-deep), 0 6px 14px rgb(60 40 10 / 0.3)`): primary plate hover, with `translateY(-1px)`.
- **Rail** (`box-shadow: 0 4px 12px rgb(40 25 8 / 0.35)`): the sticky header only.
- **Tape lift** (`box-shadow: 0 2px 6px rgb(40 25 8 / 0.3)`): the active filter tape.
- **Peg glint** (`box-shadow: 0 1px 0 rgb(255 255 255 / 0.25)`): the two pegs above a slot.
- **Patch feather** (`box-shadow: 0 0 8px 7px var(--board)`): solid-board patches, so the holes fade out instead of being sliced.

### Named Rules
**The Hanging Lift Rule.** The only thing that moves in depth is a hanging tool (or the primary plate). Panels never lift on hover.

**The Quiet Patch Rule.** Small metadata on the board (11-13px category lines, legend captions, tool details) sits on an unperforated, feathered patch of board colour so holes never run through it.

## Shapes

Painted plates and strips with near-square corners: 1px for strips, labels, badges and filter tapes; 2px for buttons, panels, inputs, notes and nav links. Larger radii belong to specific objects: the 4px dashed outline of an empty stretch of board, the 6px feathered solid-board patch, and the brass tag's notched end (1px 6px 6px 1px). Full circles are hardware only: pegs, holes and the today marker. Silhouettes are flat filled shapes on a 64-unit grid with small internal radii, one per category. Strokes are drawn as inset box-shadows (2px on ghost and danger plates, 1.5px on inputs and neutral badges) so they never change an element's size.

## Components

### Buttons
Painted plates: tactile, condensed, uppercase.
- **Shape:** near-square (2px).
- **Primary:** safety yellow with ink text, 8px 16px (12px 24px and 16px text on the landing hero), yellow lip plus warm drop.
- **Hover / Focus:** primary lifts 1px with a deeper drop; all transitions 150ms on transform, background and shadow; focus is a 3px ink outline offset 3px. Disabled at 50% opacity.
- **Ghost:** transparent with a 2px inset ink stroke; fills ink with paint text on hover. On the black rail the stroke and hover fill are paint.
- **Danger:** transparent with a 2px inset alert stroke; fills alert on hover. Destructive actions only.

### Chips
- **Filter tapes:** label-type strips in white paint at 85% opacity, 1px corners; active tape is safety yellow with the tape lift shadow and `aria-pressed`.
- **Badges:** 11px narrow caps on 1px strips. Pending is yellow, Out on loan is ink with paint text, Declined / Cancelled / Back on the board are a 1.5px ink-soft outline, Overdue is the hazard stripe framing an ink strip with yellow text.
- **Trusted Lender tag:** brass, with a notched end and a small inline check SVG.

### Cards / Containers
- **Corner Style:** 2px.
- **Background:** white paint.
- **Shadow Strategy:** panel edge only (see Elevation).
- **Border:** none; dotted paint-line rules divide sections inside.
- **Internal Padding:** 20px (16px for the inline request form).

### Inputs / Fields
- **Style:** pure white fill, 1.5px inset ink-soft stroke, 2px corners, 8px 12px, 14px text, muted placeholder.
- **Focus:** stroke thickens to 2.5px ink with a 3px safety-yellow halo outside.
- **Error:** an alert note (alert on alert wash, 2px corners) below the fields, announced with `role="alert"`.
- **Labels:** 12px semibold narrow caps in muted, above the field.

### Navigation
The header is the black top cleat the board hangs from: sticky, ink, with the stencil wordmark in safety yellow at 28px. Nav links are 13px narrow caps in paint at 80%, brightening with a faint paint wash on hover; the active link is a yellow plate with `aria-current="page"`. On phones the links drop to their own horizontally scrollable row.

### Board Slot (signature)
A slot is two pegs, a painted outline in board-deep, and, when the tool is home, the ink silhouette hanging offset over it. Sizes 48 / 80 / 112px. Out on loan, only the outline shows, always paired with a white "Back {date}" board label (or the hazard-framed Overdue label). The viewer's own request adds a yellow "You asked" label tilted 6deg. Under the slot: the tool's stencil name strip, then category, condition and details on a solid-board patch.

### Loan Strip and Date Rail (signature)
A loan is a white panel: small board swatch with the silhouette, stencil tool name with status badge, the people line in first names only, then the date rail. The rail is a 5px ink bar with end ticks; a yellow today marker ringed in ink sits on it; when late the bar becomes the hazard stripe and the note turns alert. Finished loans dim the rail to 60%. The automation log follows under a dotted rule, each entry with an inline SVG envelope (or warning triangle in alert when failed) and a relative time.

### Empty State
A stretch of board inside a 2.5px dashed board-deep outline (4px corners) with centred ink-soft copy. Bare peg pairs mark free hooks on the landing wall.

## Do's and Don'ts

### Do:
- **Do** put every page on the perforated hardboard (28px hole pitch) and keep white paint for panels, strips and labels where reading or forms happen.
- **Do** show a tool's state on the board: silhouette hanging for home, outline plus a dated label for out, hazard stripe for overdue.
- **Do** set small metadata on the board on a feathered solid-board patch (`0 0 8px 7px` in board colour).
- **Do** keep corners at 1px for strips and 2px for plates and panels.
- **Do** use narrow caps Archivo (85-88% width) for every label, badge, button and nav link.
- **Do** draw strokes as inset box-shadows and keep all shadows warm brown.
- **Do** honour reduced motion: transitions and the tagline's lift-in collapse to near zero.

### Don't:
- **Don't** build a marketplace grid of photo cards on white.
- **Don't** use safety yellow as decoration or a section fill; it marks the next action and the active or own state.
- **Don't** use alert red for anything but errors, failures, lateness and destructive actions.
- **Don't** set body copy, buttons or form text in the stencil face.
- **Don't** use soft rounded cards or pill buttons; circles are for pegs, holes and the today marker.
- **Don't** let an outline carry state alone; it always has its label.
- **Don't** add a dark theme.
