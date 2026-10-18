# AMO submission kit — Gmail Accent v1.5.8

Package: `dist/gmail-accent-1.5.8.xpi` (17,958 bytes, 9 entries, byte-identical `.zip`)
Extension (Gecko) ID: `gmail-accent@landis.cc` — already in `manifest.json`
Minimum: Firefox 140 / Firefox for Android 142 (matches `data_collection_permissions`)
Validator status: clean — no warnings as of 1.5.8
Repository: https://github.com/DarkSky7/gmail-accent

## Decisions (inherit from transcript-first-guard, locked 2026-08-24)
- **Account:** personal — Michael Landis (web UI, no API credentials)
- **Distribution channel:** **Unlisted** (self-distributed); AMO signs, we host
- **License:** MPL-2.0
- **Homepage / support:** the GitHub repo above

## Route
1. Sign in to addons.mozilla.org as Michael Landis.
2. "Submit a New Add-on" → upload `dist/gmail-accent-1.4.1.xpi`.
3. Distribution channel: **Unlisted** → minimal metadata → submit.
4. AMO signs it; download the signed XPI from the Developer Hub.
5. Install the **signed** XPI in Zen/Firefox (drag onto `about:addons`, or
   `about:addons` → gear → Install Add-on From File). An unsigned XPI is refused
   with "this extension cannot be added because it has not been verified";
   `xpinstall.signatures.required=false` is ignored on branded builds, which Zen is.

## Why an unlisted listing at all
A branded Firefox/Zen release build enforces signature checks. There are exactly two
ways to run this extension there:
- **temporary** — `about:debugging` → This Firefox → Load Temporary Add-on; vanishes on restart
- **signed** — the route above; survives restart

Brave/Chromium need neither: they run it unpacked with no signature gate. So one
listing covers Firefox and Zen permanently, and Chromium is served by the unpacked
folder plus this XPI as the distributable archive.

## Metadata
**Name:** Gmail Accent — recolor the white text
**Summary (<=250 chars):**
In Gmail's dark theme, replaces near-white text, icons and image glyphs with a colour
of your choice (default muted cyan), leaving deliberate white-on-colour contrast alone.

**Detailed description:**
Gmail's dark theme paints almost everything in near-white: body text, nav labels,
monochrome SVG icons, and white PNG sprite glyphs. This extension substitutes a colour
you choose for all of it, while leaving text that was deliberately white on a light or
coloured plate untouched.

- Colour picker, hex entry and six presets in the toolbar popup; saved via storage.sync
- Separate threshold control and a "tint dim text too" toggle
- White PNG glyphs are recoloured by reusing the bitmap as an alpha mask, so no raster
  asset is ever repainted as a solid block
- Containers that carry their own glyph are never masked with a plate colour, so icons
  keep a readable symbol instead of becoming a bare coloured square
- Works on `https://mail.google.com/*` only; requests no network access and collects
  no data

**Permissions justification:** `storage` — remembers the chosen colour and options
between sessions. No host permissions beyond the Gmail content-script match.

## Data collection
`browser_specific_settings.gecko.data_collection_permissions.required = ["none"]`
— nothing is collected, transmitted or stored off-device.
