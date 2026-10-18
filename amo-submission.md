# AMO submission kit — Gmail Accent v1.5.8

Package: `dist/gmail-accent-1.5.8.xpi` (17,958 bytes, 9 entries, byte-identical `.zip`)
Extension (Gecko) ID: `gmail-accent@addons.landis.cc` — already in `manifest.json`

> **Why this ID (decided 2026-10-18).** An earlier 1.5.7 build was submitted while signed
> in as **SM** (`Strategic.Macroeconomics@gmail.com`); it succeeded and lives in SM's
> developer hub as "Gmail Accent - recolor the white text", v1.5.7. AMO has **no ownership
> transfer**, and a GUID stays bound to the account that first registered it, so that
> listing can never become DarkSky's. The add-on is therefore being published fresh under
> **DarkSky** on the new ID `gmail-accent@addons.landis.cc`. Nothing is lost: the SM copy
> was never installable (unsigned, unlisted, zero installs) and no signed XPI was ever
> distributed from it.
> Consequences to remember:
> - Upload via **"Submit a New Add-on"** as DarkSky — *not* "Upload New Version".
> - The SM-side listing is dead weight; delete it opportunistically so it stops appearing
>   in that account's hub. Deleting it does **not** free `gmail-accent@landis.cc`, and that
>   is fine — this package no longer uses that ID.
> - Changing this ID again later would mean yet another new add-on.
Minimum: Firefox 140 / Firefox for Android 142 (matches `data_collection_permissions`)
Validator status: clean — no warnings as of 1.5.8
Repository: https://github.com/DarkSky7/gmail-accent

## Decisions (inherit from transcript-first-guard, locked 2026-08-24)
- **Account:** personal — Michael Landis (web UI, no API credentials)
- **Distribution channel:** **Unlisted** (self-distributed); AMO signs, we host
- **License:** MPL-2.0
- **Homepage / support:** the GitHub repo above

## Route
1. Sign in to addons.mozilla.org as **DarkSky** (`darkskyanarchy@gmail.com`) —
   TOTP is in **Proton Authenticator**. Do **not** sign in as SM: this add-on must not
   land in SM's hub a second time.
2. **"Submit a New Add-on"** → upload `dist/gmail-accent-1.5.8.xpi`.
   (Not "Upload New Version": that path belongs to the old SM-owned
   `gmail-accent@landis.cc` listing, which is being abandoned.)
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
