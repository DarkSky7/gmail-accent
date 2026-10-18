# Gmail Accent

In Gmail's **dark theme**, substitutes a colour of your choice for the near-white
foreground. Default: **muted cyan** (`#7BC8CE`).

Ask: "white text, but in a colour I pick". Answer: this extension, and nothing else —
it only repaints foreground text, never backgrounds, images, or buttons.

## How it decides what to recolour

It does **not** chase Gmail's obfuscated class names — those churn weekly. It walks
text nodes, reads the **computed** colour, and tints the parent when both hold:

- the colour is **near-white**: every channel at or above the threshold *and* the
  spread between max and min channel is small (<= 26), so genuinely coloured text
  (links, labels, the unread dot) is never touched;
- the element is **not sitting on a light or saturated plate**. White text on the
  blue Compose button, on a chip, or on a coloured label was chosen *for contrast*
  there — recolouring it would produce cyan-on-blue. Luminance of the nearest own
  background above 0.18 means "leave it alone". **Alpha is composited before that
  test**: Gmail's account bar is `rgba(241,243,244,0.24)`, which is `#3a3b3c` over
  black — dark, so its icons get tinted. Judging the raw channels (0.893) instead
  would have protected it and left four glyphs white.

SVG glyphs are handled separately, because they paint with `fill`, not `color`, and
Gmail sets `fill="#fff"` on the `<path>` itself — a value that beats an inherited
fill. The icon rule therefore carries a descendant selector:
`.gm-accent-icon, .gm-accent-icon * { fill: ... !important; }`.

Inputs, textareas and selects are skipped: recolouring them moves the caret colour
and looks broken.

## Where the settings are

Three routes to the same panel, because the `brave://extensions` card itself has
no controls:

1. **Toolbar icon** (pin it via the puzzle-piece menu) — the popup.
2. **Right-click the toolbar icon -> Options** — full page.
3. **`brave://extensions` -> Details -> Extension options** — full page.

- **Enable/disable** — off means the page is left exactly as Gmail renders it.
- **Foreground** — colour picker, hex box, and six presets: muted cyan (default),
  amber, mint, rose, lavender, sand.
- **White threshold** — 170..250. Lower catches more greys; higher only true white.
- **Also tint dim grey text** — extends the net to Gmail's secondary greys
  (`#bdc1c6` and friends), which by default stay grey.
- **Reset** — back to muted cyan, enabled.

Settings live in `storage.sync` and apply live to open Gmail tabs via a message;
no reload needed.

## Install (Brave / Chrome / Edge, unpacked)

1. `brave://extensions` (or `chrome://extensions`)
2. Enable **Developer mode** (top right)
3. **Load unpacked** -> `F:\Documents\GitHub\gmail-accent`
4. Open Gmail. Text should be cyan; the toolbar icon shows the tint count.

## Implementation notes

- `content.js` is a single IIFE, MV3, no build step, no dependencies, no network.
- Scanning is time-sliced (~8 ms budget per slice) because Gmail's DOM is huge;
  a `MutationObserver` feeds newly added subtrees back in, so opened messages,
  sidebar changes and newly loaded rows get tinted without a rescan of the page.
- Recolouring is one CSS class (`.gm-accent-hit`) plus a `:root` custom property,
  so a colour change is a single string swap and every element updates at once.
- Three converging rescans (1.5 s / 5 s / 12 s after a pass) catch labels Gmail
  paints late, such as the tab strip and the account chip.
- Verified against a live Gmail dark-theme inbox: 534 elements tinted; a synthetic
  white-on-blue block stayed `rgb(255,255,255)` while a white-on-dark block became
  the accent, confirming the plate guard.

## Changelog

**1.3.0** — white arrives through five channels, and each is now handled: text
(`color`), inline icons (`fill`/`stroke`), white **plates** (`background-color`),
outline glyphs (`border-color`), and **PNG glyphs** painted via `background-image`.
PNG glyphs cannot be recoloured by any property, so the image is reused as an alpha
mask drawn on a `::before` pseudo-element (`::before`, not `::after`, so a checkbox
tick stays visible above it).

Plate handling splits by what the plate carries:

| plate carries | action | why |
|---|---|---|
| a white glyph image | `background-color: transparent` | tinting it buries the glyph; clearing lets the accent glyph read against the surrounding chrome |
| a dark glyph | repaint with the accent | dark-on-accent keeps contrast (the Compose pill) |

Verified synthetically: a white plate with a white glyph image returns
`plateClear=true, bg=rgba(0,0,0,0)`; a white plate with dark text returns
`plate=true, bg=rgb(123,200,206)`.

Also: alpha is composited before every luminance test, and the checkbox-style
`border-color` path handles outlined controls that carry no background image.

**1.1.0** — white threshold default 200 -> 190 (200 silently skipped Gmail's
196-ish near-whites: the account chip, "Mike Landis", tab labels); tint SVG icon
glyphs including `<path fill>`; alpha-composite plate luminance (fixes four
account-bar icons left white); converging rescue passes; `options_ui` so the panel
is reachable from the Extensions page. Stored v1 settings migrate automatically.

**1.0.0** — text-only recolouring, muted cyan default.

## Not included

- Gmail's light theme. This is a dark-theme recolour; on light backgrounds the
  plate guard keeps almost everything untouched by design.
- Firefox port. `content.js` avoids Chrome-only APIs except the `chrome.*` shim, so
  a Gecko build needs only a manifest variant — see the DarkMode repo for the shape
  of that.
