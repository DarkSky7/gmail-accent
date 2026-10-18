/* Gmail Accent - replace WHITE with a colour of your choice in Gmail's dark theme.
 *
 * White arrives through five different channels, and each needs its own handling:
 *   1. text          -> computed `color`
 *   2. inline icons  -> `fill` / `stroke` (including <path fill="#fff">, which beats
 *                       an inherited fill, hence the descendant selector)
 *   3. white plates  -> `background-color` (the Compose pill is a white box with a
 *                       DARK glyph; swapping the plate keeps that contrast)
 *   4. outline glyphs-> `border-color` (checkboxes)
 *   5. PNG sprites   -> `background-image` of a *_white_*.png. No property can colour
 *                       that, so the image is reused as an alpha MASK and the element
 *                       is painted with the accent instead.
 *
 * Guards: nothing on a genuinely light/saturated plate gets its TEXT recoloured (a
 * white label on a coloured button was chosen for contrast), alpha is composited
 * before any luminance test, and a plate is only repainted when the glyph on it is
 * dark - otherwise we would paint white-on-white.
 */
(() => {
  'use strict';

  const CLASS = 'gm-accent-hit';
  const CLASS_ICON = 'gm-accent-icon';
  const CLASS_PLATE = 'gm-accent-plate';
  const CLASS_PLATE_CLEAR = 'gm-accent-plate-clear';
  const CLASS_BORDER = 'gm-accent-border';
  const CLASS_GLYPH = 'gm-accent-glyph';
  const CLASS_SHAPE = 'gm-accent-shape';
  const CLASS_BAR = 'gm-accent-bar';
  const CLASS_BAR2 = 'gm-accent-bar2';
  const CLASS_BARHIDE = 'gm-accent-barhide';
  const CLASS_BARHIDE2 = 'gm-accent-barhide2';
  const CLASS_IMGHIDE = 'gm-accent-imghide';
  const CLASS_IMGGLYPH = 'gm-accent-imgglyph';
  /* White bitmaps that must keep their OWN artwork - state-bearing controls and replaced
   * elements - are recoloured by an SVG feColorMatrix instead of being masked.
   * The matrix writes a constant RGB and passes alpha through, so a white glyph becomes the
   * accent and a transparent pixel stays transparent: the checked/unchecked tick and the
   * arrow bitmaps keep working, which a mask (or `background-image:none`) destroyed. */
  const CLASS_FILTER = 'gm-accent-filter';
  const FILTER_ID = 'gm-accent-tint';
  const FILTERS_ID = 'gm-accent-filters';
  /* A light-UI SUBTREE inside the dark page: Gmail's compose window, whose plate is
   * hard-coded `background:#fff` and whose banner is `#f0f4f9`, with no dark variant.
   * These islands are FLATTENED to Gmail's dark surface with accent text rather than
   * recoloured white-by-white, because the island is a whole small UI - banner, fields,
   * editor, formatting bar - and every one of those parts is light.
   *
   * Inverting the island was tried first and rejected: inversion gets the darkness right but
   * turns every colour we set into its own inverse (the accent rendered as rgb(156,102,97)),
   * and it leaves the text white, which is not the requested look. */
  const CLASS_DARK = 'gm-accent-dark';
  const DARK_SURFACES = 'div.nH.Hd.rT5Apb,div.aaZ';
  /* The READING view is the same problem one level up: the message pane is white with black
   * text inside a dark inbox (measured 85.7% white in the body, 88% across the pane). It is
   * flattened the same way - dark base, accent text - but WITHOUT the icon recolouring that
   * the compose island gets, because a message body is third-party content: a sender's 40 px
   * logo must not turn into a solid accent silhouette. */
  const CLASS_FLAT = 'gm-accent-flat';
  const FLAT_SURFACES = 'div.adn,div.a3s';
  const STYLE_ID = 'gm-accent-style';
  const SETTINGS_VERSION = 2;

  const DEFAULTS = {
    enabled: true,
    color: '#7BC8CE',
    threshold: 190,
    tintDim: false,
    tintIcons: true,
    version: SETTINGS_VERSION
  };

  let settings = Object.assign({}, DEFAULTS);
  let styleEl = null;
  let observer = null;
  let hits = 0;
  let iconHits = 0;
  let plateHits = 0;
  let plateCleared = 0;
  let maskHits = 0;
  let shapeHits = 0;
  let barHits = 0;
  let imgHits = 0;
  let darkHits = 0;
  let flatHits = 0;
  let queue = [];
  let scheduled = false;

  /* ---------- colour maths ---------- */

  function parseColor(str) {
    if (!str) return null;
    const m = str.match(/rgba?\(([^)]+)\)/);
    if (!m) return null;
    const p = m[1].split(',').map(v => parseFloat(v.trim()));
    if (p.length < 3 || p.some(v => !isFinite(v))) return null;
    return { r: p[0], g: p[1], b: p[2], a: p.length > 3 ? p[3] : 1 };
  }

  function hexToRgb(hex) {
    const h = String(hex || '').replace('#', '');
    if (h.length !== 6) return { r: 123, g: 200, b: 206 };
    return {
      r: parseInt(h.slice(0, 2), 16),
      g: parseInt(h.slice(2, 4), 16),
      b: parseInt(h.slice(4, 6), 16)
    };
  }

  function luminance(c) {
    const f = v => {
      v /= 255;
      return v <= 0.03928 ? v / 12.92 : Math.pow((v + 0.055) / 1.055, 2.4);
    };
    return 0.2126 * f(c.r) + 0.7152 * f(c.g) + 0.0722 * f(c.b);
  }

  /* Lightness as actually seen: a translucent light plate over a dark theme reads
     DARK. Gmail's account bar is rgba(241,243,244,0.24) = #3a3b3c over black, so the
     raw channels (0.893) must not be trusted. Composite over black. */
  function effectiveLuminance(c) {
    if (c.a >= 1) return luminance(c);
    return luminance({ r: c.r * c.a, g: c.g * c.a, b: c.b * c.a });
  }

  function isNearWhite(c) {
    const max = Math.max(c.r, c.g, c.b);
    const min = Math.min(c.r, c.g, c.b);
    if (max - min > 26) return false;
    const floor = settings.tintDim
      ? Math.max(140, settings.threshold - 40)
      : settings.threshold;
    return min >= floor;
  }

  function onColouredPlate(cs) {
    const bg = parseColor(cs.backgroundColor);
    if (!bg || bg.a < 0.1) return false;
    return effectiveLuminance(bg) > 0.18;
  }

  function inColouredPlate(el) {
    let node = el;
    for (let depth = 0; node && depth < 5; depth++, node = node.parentElement) {
      const cs = getComputedStyle(node);
      if (!cs) break;
      const bg = parseColor(cs.backgroundColor);
      if (!bg || bg.a < 0.1) continue;
      if (effectiveLuminance(bg) > 0.18) return true;
      return false;
    }
    return false;
  }

  /* ---------- engine ---------- */

  const SKIP_TAGS = new Set([
    'SCRIPT', 'STYLE', 'NOSCRIPT', 'TEXTAREA', 'INPUT', 'SELECT', 'OPTION'
  ]);

  // 1. white text
  function consider(el) {
    if (!el || el.nodeType !== 1) return;
    if (SKIP_TAGS.has(el.tagName)) return;
    if (el.classList.contains(CLASS) || el.classList.contains(CLASS_ICON)) return;

    const cs = getComputedStyle(el);
    if (!cs) return;
    const fg = parseColor(cs.color);
    if (!fg || fg.a < 0.1 || !isNearWhite(fg)) return;
    if (onColouredPlate(cs)) return;

    el.classList.add(CLASS);
    hits++;
  }

  // 2. white inline icons
  function considerIcon(svg) {
    if (!settings.tintIcons) return;
    if (!svg || svg.nodeType !== 1) return;
    if (svg.classList.contains(CLASS_ICON)) return;

    const cs = getComputedStyle(svg);
    if (!cs) return;
    const fill = parseColor(cs.fill);
    const stroke = parseColor(cs.stroke);
    const fillWhite = fill && fill.a > 0.1 && isNearWhite(fill);
    const strokeWhite = stroke && stroke.a > 0.1 && isNearWhite(stroke);
    if (!fillWhite && !strokeWhite) return;
    if (inColouredPlate(svg)) return;

    svg.classList.add(CLASS_ICON);
    iconHits++;
  }

  /* 2b. Shapes that are white in their own right.
   *
   * An <svg> wrapper is frequently transparent (computed fill/stroke `none`) and hands
   * the paint to <path fill="currentColor">, so reading only the wrapper misses every
   * icon whose colour arrives via `color`. Testing the SHAPE also keeps multicolour art
   * safe: the Gemini sparkle carries a gradient, so no single shape tests near-white and
   * nothing there gets touched.
   *
   * Only the property that actually tested white is overridden. Setting `fill` on a
   * path whose fill is `none` would suddenly fill an outline glyph solid.
   */
  function considerShape(shape) {
    if (!settings.tintIcons) return;
    /* Deliberately NOT skipping shapes inside a .gm-accent-icon svg: an icon is often a
     * white plate path plus a darker glyph path, and tinting the wrapper alone leaves the
     * plate white while forcing the whole subtree to one colour kills the symbol. Each
     * shape is tested and overridden on its own, so the dark glyph path keeps its
     * contrast against the now-accent plate. */
    if (shape.classList.contains(CLASS_SHAPE)) return;
    const cs = getComputedStyle(shape);
    if (!cs) return;
    const fill = parseColor(cs.fill);
    const stroke = parseColor(cs.stroke);
    const white = c => c && c.a > 0.1 && isNearWhite(c);
    const fillWhite = white(fill);
    const strokeWhite = white(stroke);
    if (!fillWhite && !strokeWhite) return;
    if (inColouredPlate(shape)) return;

    if (fillWhite) shape.style.setProperty('fill', 'var(--gm-accent-fg)', 'important');
    if (strokeWhite) shape.style.setProperty('stroke', 'var(--gm-accent-fg)', 'important');
    shape.classList.add(CLASS_SHAPE);
    shapeHits++;
  }

  /* 2c. Decorative white pseudo backs (no longer used for <img> bitmaps).
   *
   * The Gmail wordmark is an <img> of white pixels and was briefly masked onto its
   * parent's ::after. That tinted the brand lockup, which the owner does not want - the
   * "M" should keep its native colours - so the <img> pass is deliberately gone. The
   * remaining pseudo handling below only touches generated white boxes.
   */
  /* Deliberately no <img> pass: the only bitmap it ever matched was the Gmail wordmark,
   * and tinting the brand lockup is not wanted. Re-adding this requires the owner's say-so.
   */

  /* Gmail marks the SELECTED tab and several chrome rows with a bare pseudo-element
   * whose background-color is pure white (measured: the "Primary" tab's ::before is
   * rgb(255,255,255) with no image and no mask). Nothing in the text/glyph/plate passes
   * can see that, so it renders as a white bar under a cyan label. */
  const PSEUDO_CANDIDATES = '[role="tab"],[role="tablist"] [role="tab"],.aAy,.aAA,[role="toolbar"]>*,'
    + '[role="banner"] [role="button"],.J-KU-KO,[role="navigation"] [role="link"]';

  function considerPseudoBar(el) {
    if (!settings.tintIcons) return;
    const b = el.getBoundingClientRect();
    if (b.width < 4 || b.height < 2 || b.width > 640 || b.height > 420) return;
    for (const [pseudo, cls, hideCls] of [['::before', CLASS_BAR, CLASS_BARHIDE],
                                          ['::after', CLASS_BAR2, CLASS_BARHIDE2]]) {
      if (el.classList.contains(cls) || el.classList.contains(hideCls)) continue;
      const c = getComputedStyle(el, pseudo);
      if (!c) continue;
      if (!/^(""|'')$/.test((c.content || '').trim())) continue;   // must be a generated box
      const bg = parseColor(c.backgroundColor);
      if (!bg || bg.a < 0.5 || !isNearWhite(bg)) continue;
      if (c.backgroundImage && c.backgroundImage !== 'none') continue;
      const mask = c.webkitMaskImage || c.maskImage;
      if (mask && mask !== 'none') continue;

      /* Thin bars are INDICATORS (the active category tab's underline) and are tinted,
       * not hidden: the owner wants that marker kept. An earlier round hid them on the
       * assumption the hairline was unwanted, which removed the active-column indicator
       * entirely - do not repeat that. */
      el.classList.add(cls);
      barHits++;
    }
  }

  /* 3. white plates (the Compose pill and friends).
   *
   * Two very different cases look identical in CSS:
   *   - plate + DARK glyph  -> repaint the plate with the accent; the glyph still reads.
   *   - plate + WHITE glyph -> clearing the plate is the only thing that works. Repainting
   *     it accent while the glyph is also tinted gives accent-on-accent: the glyph
   *     disappears and the button reads as a bare tinted square.
   */
  function considerPlate(el) {
    if (!settings.tintIcons) return;
    if (el.classList.contains(CLASS_PLATE) || el.classList.contains(CLASS_PLATE_CLEAR)) return;
    if (el.classList.contains(CLASS_GLYPH)) return;   // its own background belongs to the glyph
    const cs = getComputedStyle(el);
    if (!cs) return;
    const bg = parseColor(cs.backgroundColor);
    if (!bg || bg.a < 0.5) return;
    if (effectiveLuminance(bg) <= 0.5) return;        // not white-ish

    /* A plate that also paints a glyph image (a sidebar row, the support button) must be
     * CLEARED, not tinted: tinting it fills the whole box with the accent and the glyph
     * on top of it disappears. Making it transparent lets the surrounding chrome show, so
     * the accent glyph reads against the same background it always sat on. */
    const hasGlyphImage = cs.backgroundImage && cs.backgroundImage.indexOf('url(') >= 0;
    if (hasGlyphImage) {
      el.classList.add(CLASS_PLATE_CLEAR);
      plateCleared++;
      return;
    }

    // does this plate carry a glyph we have already tinted?
    if (el.querySelector('.' + CLASS_GLYPH + ',.' + CLASS_ICON)) {
      el.classList.add(CLASS_PLATE_CLEAR);            // let the surroundings show through
      plateCleared++;
      return;
    }

    const fg = parseColor(cs.color);
    if (!fg || luminance(fg) > 0.25) return;          // glyph must be dark
    if (bg.a >= 0.95) {
      el.classList.add(CLASS_PLATE);
    } else {
      const ac = hexToRgb(settings.color);
      el.style.setProperty('background-color',
        'rgba(' + ac.r + ',' + ac.g + ',' + ac.b + ',' + bg.a + ')', 'important');
      el.classList.add(CLASS_PLATE);
    }
    plateHits++;
  }

  // 4. white outline borders (checkboxes)
  function considerBorder(el) {
    if (el.classList.contains(CLASS_BORDER)) return;
    const cs = getComputedStyle(el);
    if (!cs) return;
    const sides = [
      [cs.borderTopColor, cs.borderTopWidth],
      [cs.borderRightColor, cs.borderRightWidth],
      [cs.borderBottomColor, cs.borderBottomWidth],
      [cs.borderLeftColor, cs.borderLeftWidth]
    ];
    let white = false;
    for (const [c, w] of sides) {
      const p = parseColor(c);
      if (p && p.a > 0.1 && isNearWhite(p) && parseFloat(w) > 0) { white = true; break; }
    }
    if (!white) return;
    el.classList.add(CLASS_BORDER);
  }

  /* 5. white PNG glyphs painted as a background image.
   *
   * No CSS property recolours a bitmap, so the image is reused as an alpha mask. It is
   * drawn on a ::after pseudo-element, NOT on the element's own background, because such
   * an element usually also owns a white plate (support button, sidebar expand, the
   * search-hourglass button). Painting the element's background fills the whole box with
   * the accent and swallows the glyph - a bare tinted square. The pseudo-element carries
   * the glyph only, and the plate is made transparent so the surrounding chrome shows
   * through exactly as it would without the button being white.
   */
  function considerMask(el) {
    if (!settings.tintIcons) return;
    if (el.classList.contains(CLASS_GLYPH) || el.classList.contains(CLASS_FILTER)) return;
    const cs = getComputedStyle(el);
    const bi = cs.backgroundImage;
    /* A replaced element carries its artwork in `src`, not in a background image, so the
     * `background-image` test below would skip every <img> before it reached the IMG branch. */
    const src = el.tagName === 'IMG' ? (el.currentSrc || el.getAttribute('src') || '') : '';
    const art = (bi && bi !== 'none' && bi.indexOf('url(') >= 0) ? bi : src;
    if (!art) return;
    /* Two kinds of glyph must keep their OWN artwork instead of being masked:
     *
     *  - replaced elements (<img>): a pseudo-element never renders on them, so a mask has
     *    nowhere to paint, and `background-image:none` has already been applied by the
     *    stylesheet's CLASS_GLYPH rule - so taking one over BLANKS it. The message toolbar's
     *    newer/older chevrons measured as flat background with not one pixel of ink.
     *  - state-bearing controls: the master-select checkbox and every message row's checkbox
     *    swap their bitmap (check_box_outline_blank -> check_box) when ticked, and the only
     *    place that state is observable IS the bitmap, which masking deletes. A masked
     *    checkbox stays an empty box forever.
     *
     * Both are recoloured with the constant-RGB matrix filter instead: it paints the accent
     * over whatever the artwork's alpha is, so the tick still appears and disappears. */
    const keepArtwork = el.tagName === 'IMG' ||
      el.matches('[role=checkbox],[role=radio],[aria-checked],.T-Jo');
    /* Gmail ships the same glyph in several variants: "*_white_20dp.png" for the dark
     * theme, but also neutral/light ones such as "info_baseline_nv200_20dp.png" used in
     * the tab bar. Testing only for "white" left those permanently light. Photos never
     * match either pattern, so their pixels are never masked. */
    if (!/white|nv200|nv100/i.test(art) || /skinnable/i.test(art)) return;
    // never paint over real text; child elements are fine (a checkbox tick lives there)
    if (el.textContent.trim()) return;
    /* A glyph drawn by a child <svg>/<img> colours itself. Masking the parent would paint
     * the WHOLE box - the bare tinted square the owner explicitly does not want (search
     * magnifier, side-panel toggle, support). Let the child handle it. */
    if (el.querySelector('svg,img')) return;

    const b = el.getBoundingClientRect();
    if (b.width < 8 || b.height < 8 || b.width > 64 || b.height > 64) return;

    // if a light plate sits behind it, this glyph was deliberately white on light
    let node = el.parentElement;
    for (let d = 0; node && d < 3; d++, node = node.parentElement) {
      const bg = parseColor(getComputedStyle(node).backgroundColor);
      if (bg && bg.a > 0.5 && effectiveLuminance(bg) > 0.5) return;
    }

    /* Keep-the-artwork glyphs take the matrix filter and stop here - no mask variables, no
     * `position:relative`, no plate clearing, so nothing about their layout or state changes. */
    if (keepArtwork) {
      el.classList.add(CLASS_FILTER);
      imgHits++;
      return;
    }

    if (cs.position === 'static') el.style.setProperty('position', 'relative', 'important');
    el.style.setProperty('--gm-ico', bi);
    /* Fit the mask to the box, always. Copying Gmail's own background-size/position was
     * wrong: for the neutral variants (e.g. info_baseline_nv200_20dp.png) the copied
     * size exceeded the 20 px box, so only a corner of the glyph showed - a diagonal
     * streak - and a copied `repeat` tiled it. These elements are single-glyph icon
     * boxes (the pass already requires the element's OWN background-image to be the
     * icon), so contain/center/no-repeat is the correct, predictable rendering. */
    el.style.setProperty('--gm-ico-size', 'contain');
    el.style.setProperty('--gm-ico-pos', 'center');
    el.style.setProperty('--gm-ico-rep', 'no-repeat');

    // an own white plate becomes transparent: the glyph should read against the
    // surrounding chrome, not against a coloured box
    const own = parseColor(cs.backgroundColor);
    if (own && own.a > 0.1 && effectiveLuminance(own) > 0.5) {
      el.style.setProperty('background-color', 'transparent', 'important');
      el.classList.add(CLASS_PLATE_CLEAR);
      plateCleared++;
    }

    el.classList.add(CLASS_GLYPH);
    maskHits++;
  }

  /* `root` is itself a candidate, not merely the container of candidates.
   *
   * Gmail repaints single icons in place - the sidebar glyph when a folder is
   * selected, the support button, the search magnifier - and a MutationRecord hands us
   * that icon as the added node. querySelectorAll never returns its own root, so those
   * icons were tinted by the first full-body pass and then came back WHITE the moment
   * Gmail re-rendered them. That is the "some icons regressed to white" report, and it
   * is why every pass below seeds itself with root before walking descendants.
   */
  function walk(root) {
    if (!root || root.nodeType !== 1 || !root.isConnected) return;

    /* Mark any light island in this subtree BEFORE tinting it, then refuse to descend into
     * one. Two reasons, both load-bearing:
     *   - the invert filter flips every colour we set inside it, so the accent would render
     *     as its own inverse (measured: #7BC8CE came out rgb(156,102,97));
     *   - the compose window's own icons are DARK light-theme bitmaps and its text is dark on
     *     white. Inversion fixes both; a tint pass would leave dark-on-dark text. */
    markDarkSurfaces(root);
    markFlatSurfaces(root);
    if (root !== document.body && root.closest &&
        root.closest('.' + CLASS_DARK + ',.' + CLASS_FLAT)) return;

    const walker = document.createTreeWalker(root, NodeFilter.SHOW_TEXT, null);
    const parents = new Set();
    let node;
    while ((node = walker.nextNode())) {
      const text = node.nodeValue;
      if (!text || !text.trim()) continue;
      const p = node.parentElement;
      if (p && !parents.has(p)) parents.add(p);
    }
    // the walker only sees descendants; root's own direct text needs its own test
    if (root.firstChild && root.firstChild.nodeType === 3 && root.firstChild.nodeValue.trim()) {
      parents.add(root);
    }
    parents.forEach(consider);

    if (root.tagName.toLowerCase() === 'svg') considerIcon(root);
    for (const svg of root.querySelectorAll('svg')) considerIcon(svg);

    if (/^(PATH|RECT|CIRCLE|ELLIPSE|POLYGON|LINE|USE)$/.test(root.tagName)) considerShape(root);
    for (const s of root.querySelectorAll('path,rect,circle,ellipse,polygon,line,use')) considerShape(s);

    // white bitmaps delivered as <img>, and decorative white pseudo bars
    if (root.matches && root.matches(PSEUDO_CANDIDATES)) considerPseudoBar(root);
    for (const pb of root.querySelectorAll(PSEUDO_CANDIDATES)) considerPseudoBar(pb);

    // checkbox-ish controls only: cheap and targeted
    if (root.getAttribute && root.getAttribute('role') === 'checkbox') considerBorder(root);
    for (const box of root.querySelectorAll('[role=checkbox]')) considerBorder(box);

    // Two passes in a fixed order: masks first, so that the plate pass can ask
    // "does this plate already carry a tinted glyph?" and get a true answer.
    const boxes = [];
    const addBox = el => {
      const b = el.getBoundingClientRect();
      /* Wider than the mask cap on purpose: considerMask applies its own tighter 64 px
       * bound, while considerPlate needs the room to reach light chips like the 105x18
       * label pill in the message list (a light plate with dark text - the same case as
       * the Compose button, only bigger). */
      if (b.width < 8 || b.height < 8 || b.width > 360 || b.height > 120) return;
      boxes.push(el);
    };
    if (/^(DIV|SPAN|IMG|LI|A|BUTTON)$/.test(root.tagName)) addBox(root);
    /* LI/A/BUTTON matter: Gmail puts white icon PNGs on <li> rows (archive, delete,
     * drafts, schedule in the hover toolbar) and on <a> entries, so enumerating only
     * div/span/img left those icons permanently white. */
    for (const el of root.querySelectorAll('div,span,img,li,a,button')) addBox(el);
    for (const el of boxes) considerMask(el);
    for (const el of boxes) considerPlate(el);
  }

  function flush() {
    scheduled = false;
    const budgetStart = performance.now();
    while (queue.length) {
      walk(queue.shift());
      if (performance.now() - budgetStart > 8) {
        if (!scheduled) {
          scheduled = true;
          setTimeout(flush, 16);
        }
        return;
      }
    }
  }

  function enqueue(root) {
    if (!root) return;
    queue.push(root);
    if (!scheduled) {
      scheduled = true;
      setTimeout(flush, 0);
    }
  }

  function renderStyle() {
    if (!styleEl || !styleEl.isConnected) {
      styleEl = document.createElement('style');
      styleEl.id = STYLE_ID;
      (document.head || document.documentElement).appendChild(styleEl);
    }
    styleEl.textContent =
      ':root{--gm-accent-fg:' + settings.color + ';' +
        '--gm-dark-bg:#1b1b1b;--gm-dark-banner:#333333;--gm-dark-line:#5f6368;}' +
      '.' + CLASS + '{color:var(--gm-accent-fg)!important;}' +
      // ONLY fill. Google's icon SVGs open with a transparent hit-area path,
      // `<path fill="none" d="M0 0h24v24H0z">`, which INHERITS `stroke` from the svg
      // element: forcing stroke here stroked that 24x24 hit area and drew an accent
      // square outline around every such icon (magnifier, support, tab-bar icons).
      // Any genuinely stroked glyph is handled per-shape by considerShape, which only
      // overrides a shape whose own stroke tested white.
      '.' + CLASS_ICON + '{fill:var(--gm-accent-fg)!important;}' +
      '.' + CLASS_PLATE + '{background-color:var(--gm-accent-fg)!important;}' +
      '.' + CLASS_PLATE_CLEAR + '{background-color:transparent!important;}' +
      '.' + CLASS_BORDER + '{border-color:var(--gm-accent-fg)!important;}' +
      // constant-RGB matrix: white artwork -> accent, alpha untouched (see CLASS_FILTER)
      '.' + CLASS_FILTER + '{filter:url(#' + FILTER_ID + ')!important;}' +
      // flatten a light-UI island: Gmail's dark surface, accent text, gray banner
      '.' + CLASS_DARK + '{background-color:var(--gm-dark-bg)!important;filter:none!important;}' +
      '.' + CLASS_DARK + ' *{background-color:transparent!important;color:var(--gm-accent-fg)!important;' +
        'border-color:var(--gm-dark-line)!important;}' +
      '.' + CLASS_DARK + ' .l.m{background-color:var(--gm-dark-banner)!important;}' +
      // same flatten for the reading view, minus the banner override
      '.' + CLASS_FLAT + '{background-color:var(--gm-dark-bg)!important;}' +
      '.' + CLASS_FLAT + ' *{background-color:transparent!important;color:var(--gm-accent-fg)!important;' +
        'border-color:var(--gm-dark-line)!important;}' +
      // the glyph lives on ::before so the element's own plate stays free to be cleared
      '.' + CLASS_GLYPH + '{background-image:none!important;}' +
      // Every property that decides whether the mask is SEEN has to win against Gmail's
      // own pseudo rules. Gmail ships `.G-Ni .T-Jo::before` and `.apF .asa::before` as
      // `{display:block;opacity:0;background:none}` - a reserved, invisible box. Both are
      // MORE SPECIFIC than a single class (0,2,1 vs 0,1,1) and the `background` shorthand
      // also resets background-color. The result was a dead icon: the native white bitmap
      // had already been removed by the rule above, and our replacement mask rendered at
      // opacity 0 over a transparent background, so the Select checkbox and its dropdown
      // arrow painted NOTHING (measured: a 20x20 box of flat rgb(44,44,44)). `!important`
      // on opacity/visibility/inset/background-color is what makes the glyph visible.
      '.' + CLASS_GLYPH + '::before{content:""!important;position:absolute!important;' +
        'top:0!important;right:0!important;bottom:0!important;left:0!important;' +
        'display:block!important;opacity:1!important;visibility:visible!important;' +
        // `transform: matrix(0,0,0,0,0,0)` is Gmail scaling the pseudo to ZERO. On the Select
        // checkbox this pseudo is the tick mark, held at scale 0 until the box is checked, so
        // every property above was honoured and the icon still painted nothing. `z-index:-1`
        // comes from the same Gmail rule and would bury the glyph behind a plate.
        'transform:none!important;z-index:0!important;' +
        'pointer-events:none!important;' +
        'background-color:var(--gm-accent-fg)!important;background-image:none!important;' +
        '-webkit-mask-image:var(--gm-ico)!important;mask-image:var(--gm-ico)!important;' +
        '-webkit-mask-position:var(--gm-ico-pos)!important;mask-position:var(--gm-ico-pos)!important;' +
        '-webkit-mask-size:var(--gm-ico-size)!important;mask-size:var(--gm-ico-size)!important;' +
        '-webkit-mask-repeat:var(--gm-ico-rep)!important;mask-repeat:var(--gm-ico-rep)!important;}' +
      // Gmail often paints its OWN glyph bitmap on ::before of the same element; left in
      // place it sits on top of the accent mask and the icon reads white again
      '.' + CLASS_GLYPH + '::after{background-image:none!important;}' +
      // placeholder text is not an element, so the text pass can never reach it
      'input::placeholder,textarea::placeholder{color:var(--gm-accent-fg)!important;opacity:1!important;}' +
      // decorative white pseudo backs (the selected-tab underline bar)
      '.' + CLASS_BAR + '::before{background-color:var(--gm-accent-fg)!important;}' +
      '.' + CLASS_BAR2 + '::after{background-color:var(--gm-accent-fg)!important;}' +
      // thin indicator bars are hidden, not recoloured (a 3px hairline in accent reads as
      // a conspicuous extra rule across the tab row)
      '.' + CLASS_BARHIDE + '::before{display:none!important;}' +
      '.' + CLASS_BARHIDE2 + '::after{display:none!important;}' +
      // scrollbars are browser chrome, not DOM: only a UA rule reaches them
      '::-webkit-scrollbar{width:12px;height:12px;}' +
      '::-webkit-scrollbar-track{background:transparent;}' +
      '::-webkit-scrollbar-thumb{background:var(--gm-accent-fg);border-radius:6px;}' +
      '::-webkit-scrollbar-corner{background:transparent;}';
  }

  /* The feColorMatrix the CLASS_FILTER rule points at. It has to live in the page, not in
   * the stylesheet: `filter:url(#id)` resolves against the DOCUMENT. Values are 0..1.
   * Row 1-3 write the accent into RGB for every pixel; row 4 (`0 0 0 1 0`) copies alpha
   * across unchanged, which is what keeps a checkbox tick transparent when it is invisible.
   *
   * Built with createElementNS, never by assigning an HTML string. AMO flags that pattern
   * as an unsafe assignment (and it is right to): a string-built subtree is parsed as HTML,
   * so anything injected into it becomes markup. Every node here is created in the SVG
   * namespace explicitly and the colour reaches the DOM as an attribute value, which cannot
   * be parsed as markup at all. */
  const SVG_NS = 'http://www.w3.org/2000/svg';

  function renderFilters() {
    let svg = document.getElementById(FILTERS_ID);
    if (!svg || !svg.isConnected) {
      svg = document.createElementNS(SVG_NS, 'svg');
      svg.id = FILTERS_ID;
      svg.setAttribute('aria-hidden', 'true');
      svg.setAttribute('width', '0');
      svg.setAttribute('height', '0');
      svg.style.cssText = 'position:absolute;left:-9999px;top:0;width:0;height:0;overflow:hidden';
      (document.body || document.documentElement).appendChild(svg);
    }

    // the filter node is created once and only its `values` attribute is rewritten
    let filter = svg.firstElementChild;
    if (!filter || filter.localName !== 'filter') {
      while (svg.firstChild) svg.removeChild(svg.firstChild);
      filter = document.createElementNS(SVG_NS, 'filter');
      filter.setAttribute('id', FILTER_ID);
      filter.setAttribute('color-interpolation-filters', 'sRGB');
      const matrix = document.createElementNS(SVG_NS, 'feColorMatrix');
      matrix.setAttribute('type', 'matrix');
      filter.appendChild(matrix);
      svg.appendChild(filter);
    }

    const c = hexToRgb(settings.color);
    const f = v => (v / 255).toFixed(5);
    const matrix = filter.firstElementChild;
    if (matrix) {
      matrix.setAttribute('values',
        '0 0 0 0 ' + f(c.r) + ' ' +
        '0 0 0 0 ' + f(c.g) + ' ' +
        '0 0 0 0 ' + f(c.b) + ' ' +
        '0 0 0 1 0');
    }
  }

  /* Gmail's compose window is a LIGHT island: `.aaZ{background:#fff}` and
   * `td.Ap{background-color:#fff}` are hard-coded with no dark-theme variant, which is why a
   * maximised compose was 82% white inside an otherwise dark inbox. Marking the island lets
   * the CSS invert it, and marking it FIRST lets every tint pass skip the subtree - tinting
   * inside an inverted area would render the accent as its inverse. */
  function markSurfaces(root, selector, cls, doAccentise) {
    if (!settings.enabled) return;
    const nodes = [];
    if (root && root.nodeType === 1 && root.matches && root.matches(selector)) nodes.push(root);
    if (root && root.querySelectorAll) {
      for (const n of root.querySelectorAll(selector)) nodes.push(n);
    }
    for (const n of nodes) {
      if (n.classList.contains(cls)) continue;
      n.classList.add(cls);
      if (cls === CLASS_DARK) darkHits++; else flatHits++;
      if (doAccentise) accentiseIsland(n);
    }
  }

  function markDarkSurfaces(root) { markSurfaces(root, DARK_SURFACES, CLASS_DARK, true); }
  function markFlatSurfaces(root) { markSurfaces(root, FLAT_SURFACES, CLASS_FLAT, false); }

  /* The island's own icons are LIGHT-theme bitmaps - dark glyphs on transparency - so flattening
   * the background leaves them invisible. The constant-RGB matrix recolours a bitmap whatever
   * its original colour is, so every small image box inside the island is tagged and comes out
   * accent. Text is handled by the island's CSS rule. */
  function accentiseIsland(island) {
    for (const n of island.querySelectorAll('*')) {
      if (n.classList.contains(CLASS_FILTER) || n.classList.contains(CLASS_GLYPH)) continue;
      const r = n.getBoundingClientRect();
      if (r.width < 4 || r.height < 4 || r.width > 64 || r.height > 64) continue;
      const cs = getComputedStyle(n);
      const bi = cs.backgroundImage;
      const src = n.tagName === 'IMG' ? (n.currentSrc || n.getAttribute('src') || '') : '';
      if (!((bi && bi.indexOf('url(') >= 0) || src)) continue;
      n.classList.add(CLASS_FILTER);
      imgHits++;
    }
  }

  function clearMaskInline(el) {
    for (const p of ['--gm-ico', '--gm-ico-pos', '--gm-ico-size', '--gm-ico-rep',
                     'position', 'background-color',
                     '-webkit-mask-image', 'mask-image', '-webkit-mask-position',
                     'mask-position', '-webkit-mask-size', 'mask-size',
                     '-webkit-mask-repeat', 'mask-repeat']) {
      el.style.removeProperty(p);
    }
  }

  function reset() {
    document.querySelectorAll('.' + CLASS).forEach(el => el.classList.remove(CLASS));
    document.querySelectorAll('.' + CLASS_ICON).forEach(el => el.classList.remove(CLASS_ICON));
    document.querySelectorAll('.' + CLASS_PLATE).forEach(el => {
      el.classList.remove(CLASS_PLATE);
      el.style.removeProperty('background-color');
    });
    document.querySelectorAll('.' + CLASS_PLATE_CLEAR).forEach(el => {
      el.classList.remove(CLASS_PLATE_CLEAR);
    });
    document.querySelectorAll('.' + CLASS_BORDER).forEach(el => el.classList.remove(CLASS_BORDER));
    document.querySelectorAll('.' + CLASS_GLYPH).forEach(el => {
      el.classList.remove(CLASS_GLYPH);
      clearMaskInline(el);
    });
    document.querySelectorAll('.' + CLASS_SHAPE).forEach(el => {
      el.classList.remove(CLASS_SHAPE);
      el.style.removeProperty('fill');
      el.style.removeProperty('stroke');
    });
    document.querySelectorAll('.' + CLASS_BAR + ',.' + CLASS_BAR2 + ',.'
      + CLASS_BARHIDE + ',.' + CLASS_BARHIDE2).forEach(el => {
      el.classList.remove(CLASS_BAR); el.classList.remove(CLASS_BAR2);
      el.classList.remove(CLASS_BARHIDE); el.classList.remove(CLASS_BARHIDE2);
    });
    document.querySelectorAll('.' + CLASS_IMGHIDE).forEach(el => el.classList.remove(CLASS_IMGHIDE));
    document.querySelectorAll('.' + CLASS_FILTER).forEach(el => el.classList.remove(CLASS_FILTER));
    document.querySelectorAll('.' + CLASS_DARK).forEach(el => el.classList.remove(CLASS_DARK));
    document.querySelectorAll('.' + CLASS_FLAT).forEach(el => el.classList.remove(CLASS_FLAT));
    document.querySelectorAll('.' + CLASS_IMGGLYPH).forEach(el => {
      el.classList.remove(CLASS_IMGGLYPH);
      for (const p of ['--gm-ico', '--gm-ico-size', '--gm-ico-pos', '--gm-ico-rep', 'position']) {
        el.style.removeProperty(p);
      }
    });
    hits = 0;
    iconHits = 0;
    plateHits = 0;
    plateCleared = 0;
    maskHits = 0;
    shapeHits = 0;
    barHits = 0;
    imgHits = 0;
    darkHits = 0;
    flatHits = 0;
    queue = [];
  }

  function applyAll() {
    if (!settings.enabled) {
      reset();
      if (styleEl) styleEl.textContent = '';
      const svg = document.getElementById(FILTERS_ID);
      if (svg) svg.remove();
      return;
    }
    renderStyle();
    renderFilters();
    reset();
    /* mark the light islands BEFORE the first tint pass: `reset()` just cleared every marker,
     * and a tint applied inside one would survive the inversion as its own inverse. */
    markDarkSurfaces(document.body);
    markFlatSurfaces(document.body);
    enqueue(document.body);
    settle();
  }

  /* Gmail paints some labels after the first pass; three converging rescans remove
     the "some of it is still white" class of bug. */
  function settle() {
    [1500, 5000, 12000].forEach(ms => setTimeout(() => {
      if (settings.enabled && document.body) enqueue(document.body);
    }, ms));
  }

  function startObserver() {
    if (observer) return;
    observer = new MutationObserver(mutations => {
      if (!settings.enabled) return;
      for (const m of mutations) {
        if (m.type === 'characterData') {
          const p = m.target && m.target.parentElement;
          if (p) enqueue(p);
          continue;
        }
        if (m.type === 'attributes') {
          /* Icons and toolbar rows are revealed by toggling a class/style on an
           * ancestor (a row gains .btC on hover, a panel gains .aIf-aLf when opened).
           * With only childList observed, such an icon became visible AFTER the walk
           * that would have tinted it, and stayed white forever - the reported
           * "regressed to white" symptom. Re-walk the mutated element.
           *
           * Our own writes also fire here, so skip anything already carrying a marker
           * class: that both stops self-feedback and keeps this from re-tinting itself
           * in a loop. */
          const t = m.target;
          if (t && t.nodeType === 1 && !/(^|\s)gm-accent-/.test(t.className || '')) enqueue(t);
          continue;
        }
        for (const node of m.addedNodes) {
          if (node.nodeType === 1) enqueue(node);
        }
      }
    });
    observer.observe(document.body, {
      childList: true, subtree: true, characterData: true,
      attributes: true, attributeFilter: ['class', 'style']
    });
  }

  /* ---------- wiring ---------- */

  function migrate(stored) {
    const merged = Object.assign({}, DEFAULTS, stored);
    if (!stored || stored.version !== SETTINGS_VERSION) {
      merged.threshold = DEFAULTS.threshold;
      merged.tintIcons = DEFAULTS.tintIcons;
      merged.version = SETTINGS_VERSION;
    }
    return merged;
  }

  function boot() {
    renderStyle();
    if (!settings.enabled) return;
    applyAll();
    startObserver();
  }

  chrome.storage.sync.get(DEFAULTS, stored => {
    settings = migrate(stored);
    if (!stored || stored.version !== SETTINGS_VERSION) chrome.storage.sync.set(settings);
    if (document.body) boot();
    else document.addEventListener('DOMContentLoaded', boot, { once: true });
  });

  chrome.storage.onChanged.addListener((changes, area) => {
    if (area !== 'sync') return;
    let touched = false;
    for (const key of Object.keys(changes)) {
      if (key in DEFAULTS) { settings[key] = changes[key].newValue; touched = true; }
    }
    if (touched) applyAll();
  });

  chrome.runtime.onMessage.addListener((msg, _sender, respond) => {
    if (!msg || !msg.type) return;
    const counts = () => ({ hits, iconHits, plateHits, plateCleared, maskHits, shapeHits, barHits, imgHits, darkHits, flatHits });
    if (msg.type === 'gm-accent:apply' && msg.settings) {
      settings = Object.assign({}, settings, msg.settings);
      applyAll();
      respond(Object.assign({ ok: true }, counts()));
      return true;
    }
    if (msg.type === 'gm-accent:status') {
      respond(Object.assign({ ok: true, settings, ready: true }, counts()));
      return true;
    }
    if (msg.type === 'gm-accent:rescan') {
      applyAll();
      respond(Object.assign({ ok: true }, counts()));
      return true;
    }
  });
})();
