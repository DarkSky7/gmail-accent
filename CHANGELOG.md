# Changelog

Working directory is `F:\Documents\GitHub\gmail-accent` and the repository is
`DarkSky7/gmail-accent` — folder and repo names match. The extension is loaded
unpacked in Brave from that folder path.

## 1.5.8 — 2026-10-18

**AMO validator clean-ups.** Three warnings raised on the first submission:

- `strict_min_version` was `128.0` while `browser_specific_settings.gecko.
  data_collection_permissions` only exists from Firefox 140 — the manifest promised support
  for a version that cannot read one of its own keys. Now `140.0`, matching DarkMode and
  transcript-first-guard.
- the same claim on Android, which needs `142.0`; an explicit `gecko_android` block is now
  present instead of inheriting 128 from the desktop value.
- **`Unsafe assignment to innerHTML`** — `renderFilters()` built the `feColorMatrix` from a
  string. AMO is right: `innerHTML` parses the string as markup, so a dynamic value becomes
  markup. The filter and its matrix are now created with `createElementNS` in the SVG
  namespace, and the colour is written with `setAttribute` — a value that can never be
  parsed as markup. The node is built once and only its `values` attribute is rewritten.

## 1.5.7 — 2026-10-18

**Restored the active-tab indicator and killed the last white surfaces.**

*The tab underline is back.* 1.5.6 hid every thin `::before` bar on the theory that the
hairline was unwanted. It was the active-column indicator, and the owner noticed it had
gone. Thin bars are now **tinted, never hidden** — accent on accent still marks the
selected tab, and the band that looked like a "gap" is Gmail's real toolbar row.

*Compose and the reading view are no longer white islands.* Gmail hard-codes
`.aaZ{background:#fff}`, `td.Ap{background-color:#fff}` and a `#f0f4f9` compose banner with
no dark variant, so inside a dark inbox a maximised compose measured **82% white** and an
open message **88% white** (body 85.7%). Both are now flattened to Gmail's dark surface
with accent text: the compose banner stays a **separate gray** (`#333`) so it still reads as
a title bar, and message bodies get accent text on the dark base. Compose measures **0.00%
white**; the reading pane **10.9%** (residue is the senders' own imagery, deliberately left
alone). Inverting the island was tried first and rejected: inversion turns every colour we
set into its inverse — the accent rendered as `rgb(156,102,97)` — and leaves text white.

*Icons that were painting nothing.* Three separate faults, all measured as flat background
RGB with zero ink:

- The replacement mask lives on `::before`, and Gmail ships `.G-Ni .T-Jo::before` and
  `.apF .asa::before` as `{opacity:0;background:none}` — more specific than one class, so the
  checkbox and its dropdown arrow rendered at opacity 0 with no background.
- The same pseudo also carries `transform:matrix(0,0,0,0,0,0)`: Gmail scales the *tick* to
  zero and reveals it when the box is checked. Forcing opacity and inset was not enough.
- `<img>` glyphs were blanked outright: a replaced element never renders `::before`, so the
  mask had nowhere to paint while `background-image:none` had already removed the artwork.

Every property that decides whether the mask is *seen* is now `!important`
(`opacity/visibility/inset/transform/z-index`), and glyphs that must keep their own artwork
are recoloured by a constant-RGB **`feColorMatrix`** instead of being masked: it writes the
accent into RGB and passes alpha through, so a checkbox tick still appears and disappears on
toggle and a `<img>` glyph keeps its shape. Menus and file pickers that are open during a
rescan keep working.

## 1.5.6 — 2026-10-18

**Removed the extra line above the Primary row.** It was the selected tab's underline: a
`::before` of `237x3px` pure white on `div.aAy.J-KU-KO`. Natively that hairline is subtle;
tinted accent it read as a conspicuous rule across the tab row, which is exactly what the
owner asked to be rid of.

Pseudo bars are now classified by geometry: **thin** (height <= 8px) means an *indicator*
and is hidden (`display:none` on the pseudo); anything taller is a real *plate* and still
gets the accent. The active tab remains marked by its accent label and the row's
translucent overlay.

Verified by scanning rows y=155..161 for runs of accent longer than 2px: none. Layout diff
1,930 elements: 0 changed. White pixels unchanged at 2,919 (wordmark + avatar only).

## 1.5.5 — 2026-10-18

**Accent square outlines around icons — and the "box" above the tab row.** Owner reported a
square outline around the magnifier, another around the support `?`, and a wrap/box above
the `Primary … Updates` row. One root cause: Google's icon SVGs open with a **transparent
hit-area path**, `<path fill="none" d="M0 0h24v24H0z">`. It has no stroke of its own, so it
**inherits `stroke` from the `<svg>` element** — and `CLASS_ICON` was setting
`stroke: accent !important` on the wrapper. Every such icon therefore got its 24x24 hit
area stroked: a square frame around the glyph, and a boxed look around the tab-row icon.

Fix: `CLASS_ICON` now sets **fill only**. Stroked glyphs are still handled, per shape, by
`considerShape`, which overrides a shape only when that shape's own stroke tested white.
Verified: the hit-area path now computes `cssStroke: none` while the glyph path keeps
`cssFill: rgb(123,200,206)`.

**Wordmark left native.** The `<img>` masking pass existed solely to tint
`logo_gmail_lockup_dark_2x_r7.png`. The owner prefers the Gmail "M" in its own colours, so
the pass is removed outright (function, CSS and call sites) rather than neutered —
re-adding it needs an explicit request. White pixels therefore go **up** to 2,919 (0.050%)
by design: the wordmark (2,000 px) plus the profile avatar are the only white left, and
both are supposed to be.

**Measurement lesson worth keeping.** The earlier "0 elements moved" layout diff was
*invalid*: it stripped our classes but left our inline `position` and `background-color`
overrides in place, so the DOM still carried the layout damage. The thorough version
strips classes **and** every property we set (`position`, `background-color`,
`background-image`, `fill`, `stroke`, `visibility`, the mask properties and `--gm-ico*`)
before re-measuring: 1,930 elements, **0 changed**. A diff that cannot fail is worthless —
strip everything you touched, or you are measuring your own leftovers.

## 1.5.4 — 2026-10-18

Two defects reported from a screenshot: **icons had moved** (the search magnifier and the
tab-bar icon) and the **support question-mark looked wrong**.

**The move was a layout bug, and it was measurable.** With the extension active the search
form was **48 px tall; with every `gm-accent-*` class stripped it was 101 px** — wait, the
other way round: 101 px with the extension, 48 px without. `button.gb_6e` (Advanced
search) jumped from `(718,8)` to `(256,54)`, i.e. wrapped onto a second row, and
`button.gb_2e` (the magnifier) shifted `312 -> 256`.

Cause: `considerWhiteImg` matched a *20 px white icon* `<img>` inside an icon button,
because it tested `/white/` on the URL. It then hid the image and set
`position: relative !important` on the button, which re-anchored that button's absolutely
positioned siblings. Fixes:
- match only `logo|lockup|wordmark`, never the generic `white` pattern
- require a **wide** bitmap (>=60 px). The wordmark is 109x40; real icons are 20-24 px
- never touch a `BUTTON` parent, never touch a parent that already contains an `<svg>`
- only ever set `position: relative` on a `static` parent

Verified: hidden `<img>` count is now exactly **1** (`logo_gmail_lockup_dark_2x_r7.png`),
and a rect-diff of 790 elements with/without the extension reports **0 moved**.

**The mask geometry was copy-paste wrong.** The mask pass reused Gmail's own
`background-size`/`background-position`/`background-repeat`. For the neutral variants
(`info_baseline_nv200_20dp.png` = a 2x asset in a 20 px box) the copied size exceeded the
box, so only a corner of the glyph showed, and a copied `repeat` tiled it — it rendered as
a diagonal streak. These passes only ever run on single-glyph icon boxes (the element's OWN
background-image must be the icon), so the mask is now fixed at
`contain / center / no-repeat`. The support icon reads as a clean question mark inside its
circle.

**Method note that cost a false alarm:** after the layout fix every icon shifted by 12 px,
so an ASCII dump taken at the *old* hard-coded coordinates sampled empty space and looked
like a broken streak. Always read icon rects from `getBoundingClientRect()` at measure
time; never reuse coordinates from an earlier run.

State after 1.5.4: white pixels 894 (0.015%), only the profile photo; layout identical to
Gmail's own.

## 1.5.2 — 2026-10-18

Closes the remaining white in Mike's screenshot, found by measuring PIXELS rather than
DOM properties (the DOM audits had already given two wrong "0 white" answers).

**Five more channels the engine could not see:**

1. **Decorative white pseudo backgrounds.** The selected tab's bar is `::before` with
   `background-color: rgb(255,255,255)` and no image or mask — invisible to every text,
   glyph and plate pass. New `considerPseudoBar()` tints those.
2. **White glyphs delivered as `<img>`.** The Gmail wordmark is an `<img>`, not a
   background-image. An `<img>` cannot mask itself, so the bitmap is hidden and the SAME
   bitmap masks an accent `::after` on the parent.
3. **Placeholder text** is not an element; the text pass can never reach it. Added
   `input::placeholder{color:accent}`.
4. **`_nv200` / `_nv100` icon variants.** The tab-bar icons ship as e.g.
   `info_baseline_nv200_20dp.png` — the mask pass only accepted filenames containing
   "white", so those stayed light.
5. **Light plates wider than 64 px.** The message-list label chip is 105x18 with dark
   text: a bigger version of the Compose-button case. Plate candidates now go to 360x120
   while the mask pass keeps its own tighter 64 px bound.

**And the regression that created the squares Mike reported.** `CLASS_ICON` CSS forced
`fill:accent !important` on *every descendant* (`*`). Gmail draws the Support button and
the bottom-right chip as a white plate path **plus** a darker glyph path, so forcing the
whole subtree to one colour erased the symbol — a featureless accent square. The rule now
touches only the svg's own fill/stroke, and `considerShape` tints descendant shapes one at
a time, only those that actually tested white, leaving dark glyph paths dark.

**Measured on Brave, Gmail dark theme, one Inbox view:**

- white pixels: **26,408 → 917 (0.454% → 0.016%)** of a 3123x1864 capture
- white regions: 8 → 2, and both remaining are the account **profile photo** (a real
  image, correctly left untouched)
- tinted elements sampled: 179; elements with >=55% accent coverage: 3 — the Compose
  plate (81.7%), the label chip (83.4%) and the Support ring (56.2%), each verified by
  ASCII pixel dump to contain a visible contrasting glyph

**Method note:** capture the screenshot only after `Page.bringToFront` — a backgrounded
tab returns a blank white frame, which reads as "87% white" and sends you chasing a
non-existent catastrophe.

## 1.4.1 — 2026-10-18

Fixes the two reported visual defects: sidebar/toolbar icons that "regressed to
white", and the risk of white elements being replaced by bare tinted squares with
no readable symbol on them.

**Root cause of the regression.** `walk()` enumerated candidates with
`root.querySelectorAll(...)`, which never returns its own root. Gmail repaints
individual icons in place, and a `MutationRecord` hands that icon over as the
added node — so the icon was tinted by the first full-body pass and came back
white the moment Gmail re-rendered it. Every pass now seeds itself with `root`.

**Reveal-by-class was invisible to the observer.** The `MutationObserver` watched
`childList` and `characterData` only. Gmail reveals icons by toggling a class on
an ancestor (a row gains a hover class, a panel gains a state class), so an icon
could become visible *after* the walk that would have tinted it and then stay
white indefinitely. `attributes` is now observed with
`attributeFilter: ['class', 'style']`, and mutations on elements already carrying
a `gm-accent-*` marker are skipped to prevent self-feedback loops.

**`<li>`, `<a>` and `<button>` are now enumerated.** White icon PNGs live on `<li>`
rows (archive, delete, drafts, schedule in the message toolbar) and on `<a>`
entries; enumerating only `div, span, img` left those permanently white.

**Shapes painted through `color`.** A transparent `<svg>` wrapper that hands the
paint to `<path fill="currentColor">` never tested white, because only the
wrapper's own `fill`/`stroke` was read. New `considerShape()` tests the shape
itself and overrides **only the property that tested white** — setting `fill` on
an outline glyph whose fill is `none` would suddenly fill it solid. Multicolour
art is untouched because no individual shape tests near-white.

**Square guard.** The mask pass now refuses to mask any element that contains a
child `svg`/`img`; masking such a parent paints the whole box, which is exactly
the "tinted square with no contrasting symbol" failure. Icons Gmail paints via
`-webkit-mask-image` are left alone: there `background-color` *is* the glyph
colour, so tinting it yields a tinted glyph, not a square.

**Measured after the fix** (Brave 155, Gmail dark theme, debug port, DOM audit of
1,781 visible elements in banner/nav/complementary/main):

- white text still painted: **0**
- white glyphs still painted: **0**
- accent boxes with no glyph at all: **0**
- tinted elements: 520; masked PNG glyphs: 124; Gmail self-masked icons: 38
- re-audit after 45 s of live Gmail activity: **no drift**

Audit definitions matter and cost a wrong answer once already: counting elements
whose `textContent` is white flags parent containers whose painted text sits on a
tinted child (reported 182 false positives), and treating `background-color` as a
plate on a `mask-image` icon reports correct tinted glyphs as squares (38 false
positives). Only a **direct child text node** proves an element paints text.

## 1.3.0 and earlier

See git history: 1.3.0 added white plate/PNG-glyph handling via CSS masks,
1.1.0 added `options_ui` and fixed SVG `fill` and alpha-composited plate
luminance, 1.0.0 was the initial computed-style retint engine.
