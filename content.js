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
  const CLASS_IMGHIDE = 'gm-accent-imghide';
  const CLASS_IMGGLYPH = 'gm-accent-imgglyph';
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

  /* 2c. White glyphs delivered as <img>, and decorative white pseudo backs.
   *
   * The Gmail wordmark is an <img> whose pixels are white: no CSS property recolours a
   * bitmap, and the element cannot mask itself (opacity/mask apply to its own painted
   * content). The trick is to hide the <img> and paint the SAME bitmap as an alpha mask
   * on its parent's ::after, which is free to carry the accent.
   */
  function considerWhiteImg(img) {
    if (!settings.tintIcons) return;
    if (!img || img.tagName !== 'IMG') return;
    if (img.classList.contains(CLASS_IMGHIDE)) return;
    const src = img.currentSrc || img.src || '';
    if (!src || !/white|logo|lockup/i.test(src)) return;
    const b = img.getBoundingClientRect();
    if (b.width < 12 || b.height < 8 || b.width > 420 || b.height > 140) return;

    const parent = img.parentElement;
    if (!parent || parent.classList.contains(CLASS_IMGGLYPH)) return;
    const pcs = getComputedStyle(parent);
    if (pcs.position === 'static') parent.style.setProperty('position', 'relative', 'important');
    parent.style.setProperty('--gm-ico', 'url("' + src + '")');
    parent.style.setProperty('--gm-ico-size', 'contain');
    parent.style.setProperty('--gm-ico-pos', 'center');
    parent.style.setProperty('--gm-ico-rep', 'no-repeat');
    parent.classList.add(CLASS_IMGGLYPH);
    img.classList.add(CLASS_IMGHIDE);
    imgHits++;
  }

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
    for (const [pseudo, cls] of [['::before', CLASS_BAR], ['::after', CLASS_BAR2]]) {
      if (el.classList.contains(cls)) continue;
      const c = getComputedStyle(el, pseudo);
      if (!c) continue;
      if (!/^(""|'')$/.test((c.content || '').trim())) continue;   // must be a generated box
      const bg = parseColor(c.backgroundColor);
      if (!bg || bg.a < 0.5 || !isNearWhite(bg)) continue;
      if (c.backgroundImage && c.backgroundImage !== 'none') continue;
      const mask = c.webkitMaskImage || c.maskImage;
      if (mask && mask !== 'none') continue;
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
    if (el.classList.contains(CLASS_GLYPH)) return;
    const cs = getComputedStyle(el);
    const bi = cs.backgroundImage;
    if (!bi || bi === 'none' || bi.indexOf('url(') < 0) return;
    /* Gmail ships the same glyph in several variants: "*_white_20dp.png" for the dark
     * theme, but also neutral/light ones such as "info_baseline_nv200_20dp.png" used in
     * the tab bar. Testing only for "white" left those permanently light. Photos never
     * match either pattern, so their pixels are never masked. */
    if (!/white|nv200|nv100/i.test(bi) || /skinnable/i.test(bi)) return;
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

    if (cs.position === 'static') el.style.setProperty('position', 'relative', 'important');
    el.style.setProperty('--gm-ico', bi);
    el.style.setProperty('--gm-ico-pos', cs.backgroundPosition);
    el.style.setProperty('--gm-ico-size', cs.backgroundSize);
    el.style.setProperty('--gm-ico-rep', cs.backgroundRepeat);

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
    if (root.tagName === 'IMG') considerWhiteImg(root);
    for (const im of root.querySelectorAll('img')) considerWhiteImg(im);
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
      ':root{--gm-accent-fg:' + settings.color + ';}' +
      '.' + CLASS + '{color:var(--gm-accent-fg)!important;}' +
      // ONLY the svg's own fill/stroke. The old rule also forced every descendant
      // ('*') to the accent, which erased two-tone icons: Gmail draws e.g. the Support
      // bubble as a white plate path PLUS a darker glyph path, and painting both accent
      // produced a featureless square. Descendant shapes are handled one at a time by
      // considerShape, which only overrides a shape that actually tested white.
      '.' + CLASS_ICON + '{fill:var(--gm-accent-fg)!important;stroke:var(--gm-accent-fg)!important;}' +
      '.' + CLASS_PLATE + '{background-color:var(--gm-accent-fg)!important;}' +
      '.' + CLASS_PLATE_CLEAR + '{background-color:transparent!important;}' +
      '.' + CLASS_BORDER + '{border-color:var(--gm-accent-fg)!important;}' +
      // the glyph lives on ::before so the element's own plate stays free to be cleared
      '.' + CLASS_GLYPH + '{background-image:none!important;}' +
      '.' + CLASS_GLYPH + '::before{content:"";position:absolute;inset:0;pointer-events:none;' +
        'background-color:var(--gm-accent-fg);background-image:none!important;' +
        '-webkit-mask-image:var(--gm-ico);mask-image:var(--gm-ico);' +
        '-webkit-mask-position:var(--gm-ico-pos);mask-position:var(--gm-ico-pos);' +
        '-webkit-mask-size:var(--gm-ico-size);mask-size:var(--gm-ico-size);' +
        '-webkit-mask-repeat:var(--gm-ico-rep);mask-repeat:var(--gm-ico-rep);}' +
      // Gmail often paints its OWN glyph bitmap on ::before of the same element; left in
      // place it sits on top of the accent mask and the icon reads white again
      '.' + CLASS_GLYPH + '::after{background-image:none!important;}' +
      // placeholder text is not an element, so the text pass can never reach it
      'input::placeholder,textarea::placeholder{color:var(--gm-accent-fg)!important;opacity:1!important;}' +
      // decorative white pseudo backs (the selected-tab underline bar)
      '.' + CLASS_BAR + '::before{background-color:var(--gm-accent-fg)!important;}' +
      '.' + CLASS_BAR2 + '::after{background-color:var(--gm-accent-fg)!important;}' +
      // white <img> bitmaps: hidden, with the same bitmap masking an accent ::after
      '.' + CLASS_IMGHIDE + '{visibility:hidden!important;}' +
      '.' + CLASS_IMGGLYPH + '{position:relative!important;}' +
      '.' + CLASS_IMGGLYPH + '::after{content:"";position:absolute;inset:0;pointer-events:none;' +
        'background-color:var(--gm-accent-fg);' +
        '-webkit-mask-image:var(--gm-ico);mask-image:var(--gm-ico);' +
        '-webkit-mask-size:var(--gm-ico-size);mask-size:var(--gm-ico-size);' +
        '-webkit-mask-position:var(--gm-ico-pos);mask-position:var(--gm-ico-pos);' +
        '-webkit-mask-repeat:var(--gm-ico-rep);mask-repeat:var(--gm-ico-rep);}' +
      // scrollbars are browser chrome, not DOM: only a UA rule reaches them
      '::-webkit-scrollbar{width:12px;height:12px;}' +
      '::-webkit-scrollbar-track{background:transparent;}' +
      '::-webkit-scrollbar-thumb{background:var(--gm-accent-fg);border-radius:6px;}' +
      '::-webkit-scrollbar-corner{background:transparent;}';
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
    document.querySelectorAll('.' + CLASS_BAR + ',.' + CLASS_BAR2).forEach(el => {
      el.classList.remove(CLASS_BAR); el.classList.remove(CLASS_BAR2);
    });
    document.querySelectorAll('.' + CLASS_IMGHIDE).forEach(el => el.classList.remove(CLASS_IMGHIDE));
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
    queue = [];
  }

  function applyAll() {
    if (!settings.enabled) {
      reset();
      if (styleEl) styleEl.textContent = '';
      return;
    }
    renderStyle();
    reset();
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
    const counts = () => ({ hits, iconHits, plateHits, plateCleared, maskHits, shapeHits, barHits, imgHits });
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
