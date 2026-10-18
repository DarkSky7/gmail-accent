# Changelog

Working directory is `F:\Documents\GitHub\gmail-accent` and the repository is
`DarkSky7/gmail-accent` — folder and repo names match. The extension is loaded
unpacked in Brave from that folder path.

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
