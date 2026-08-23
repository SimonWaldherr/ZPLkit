/* ZPL label editor — render: pure geometry/sizing math for label elements,
   extracted from the editor's app.js so it can be reused (or tested)
   without the rest of the editor's UI/selection/drag state.

   Design boundary (see the session's own review of app.js's draw/geometry
   call graph before this extraction): every function here is a function of
   its own explicit parameters only - it never reads the editor's selection,
   drag, history, or file-handle state. The one real dependency app.js's
   original code had on broader state - resolving a `$PLACEHOLDER$` in
   text/barcode data against sample values (state.sampleDataMode/
   sampleValues/hideUnfilledPlaceholders) - is passed in explicitly as an
   optional `resolveText(str) -> str` callback (default: identity), so this
   module works standalone; app.js wires its own applySampleData in as that
   callback to keep the editor's existing behavior.

   Depends on ZPLModel (BARCODE_TYPES/DEFAULT_BARCODE_HEIGHT/
   BITMAP_FONT_ASPECT) and, for barcode preview encoding, ZPLBarcode - both
   already-separate library modules, loaded before this one.

   Canvas-drawing functions (draw*Element, drawLabel, etc.) are a separate,
   later extraction step - this first slice is the geometry/sizing layer
   drawing, hit-testing, and the property panel's size displays all sit on
   top of. */
(function (global) {
  'use strict';

  const M = global.ZPLModel;

  function identity(str) { return str; }
  // Normalizes the optional trailing options object every function below
  // accepts, so callers can omit it, pass only resolveText, or only dpi.
  // `zoom` is only consumed by the draw*Element functions (a fixed dot-space
  // font size for the invalid-barcode error message would otherwise become
  // illegible at a small render zoom, e.g. Seriendruck's thumbnail previews).
  function opt(o) {
    return {
      resolveText: (o && o.resolveText) || identity,
      dpi: (o && o.dpi) || 203,
      zoom: (o && o.zoom) || 1,
    };
  }

  // ZPL only offers 4 discrete field orientations (^A/^B) - N/R/I/B in 90°
  // steps - so "rotating" a text/barcode element means cycling this list,
  // never a free-angle drag.
  const ORIENT_RAD = { N: 0, R: Math.PI / 2, I: Math.PI, B: 3 * Math.PI / 2 };
  const ORIENT_CYCLE = { N: 'R', R: 'I', I: 'B', B: 'N' };

  // EAN-13/UPC-A guard bars print taller than the field's own `height` even
  // with the interpretation line off.
  const EAN_GUARD_EXTENSION_DOTS = 13;
  // Both verified directly against Labelary's own rendering at several
  // heights/module widths/DPIs: guard bars print exactly 13 dots taller than
  // the rest, and the outside digit(s) sit exactly 13 dots clear of the bars
  // - both fixed dot amounts, not proportional to anything (the module-width
  // scaling test was inconclusive - Labelary drops the outside digit
  // entirely above a certain module width - so a fixed offset calibrated at
  // this app's own default moduleWidth of 2 is the best-evidenced choice).
  const EAN_OUTSIDE_DIGIT_GAP_DOTS = 13;

  // ---------------------------------------------------------------------
  // Pure geometry (all in ZPL "dots", independent of zoom/canvas)
  // ---------------------------------------------------------------------
  function rotatedCorners(b, angleRad, pivotX, pivotY) {
    const pts = [[b.x, b.y], [b.x + b.w, b.y], [b.x + b.w, b.y + b.h], [b.x, b.y + b.h]];
    const cos = Math.cos(angleRad), sin = Math.sin(angleRad);
    return pts.map(function (p) {
      const dx = p[0] - pivotX, dy = p[1] - pivotY;
      return [pivotX + dx * cos - dy * sin, pivotY + dx * sin + dy * cos];
    });
  }

  function getOrientation(el) {
    return el.type === 'barcode' ? ((el.params && el.params.orientation) || 'N') : (el.orientation || 'N');
  }

  // box/graphic/circle/line/ellipse are never rotated in this app (ZPL doesn't
  // rotate ^GB/^GC/^GD/^GE/^GF via ^A-style orientation) - text/barcode are
  // the only rotated types, and need the rotated-corners path for
  // hit-testing/selection.
  function isUnrotatedType(type) {
    return type === 'box' || type === 'graphic' || type === 'circle' || type === 'line' || type === 'ellipse';
  }

  // MaxiCode (^BD) is a barcode type but has no orientation parameter at all
  // (see BARCODE_TYPES.maxicode) - unlike every other barcode/text element,
  // so it shouldn't get a rotate handle that would visually spin the
  // placeholder in the editor without any matching effect on the printed label.
  function elementSupportsOrientation(el) {
    if (el.type === 'text') return true;
    return el.type === 'barcode' && el.barcodeType !== 'maxicode';
  }

  // A ^XG-placed stored graphic can only be sized by its integer 1-10
  // magnification factors (magX/magY), never by free pixel-drag resize like a
  // normal inline graphic - so it gets move handles but no corner resize
  // handles; magX/magY are edited as their own fields in the property panel.
  function isFreeResizable(el) {
    return isUnrotatedType(el.type) && !(el.type === 'graphic' && el.storedName);
  }

  // The 2D symbologies with no real scannable encoder here (see each one's
  // BARCODE_TYPES comment) - shared by every place that needs to treat them
  // as "intentional placeholder", not "broken preview".
  function isPlaceholderOnlyBarcode(barcodeType) {
    return barcodeType === 'datamatrix' || barcodeType === 'aztec' || barcodeType === 'maxicode';
  }

  // Data Matrix (^BX) has no real encoder here (ECC200's Reed-Solomon +
  // module placement is a much bigger undertaking than this editor's other
  // barcode support) - approximate a plausible symbol side length from the
  // payload length so the placeholder is at least sized/positioned right,
  // rather than picking an arbitrary fixed box. Not the real ECC200 codeword
  // table, just a rough "how big would this roughly need to be" estimate.
  function estimateDataMatrixModules(dataLength) {
    const modules = Math.ceil(Math.sqrt(Math.max(1, dataLength) * 8));
    const clamped = Math.max(10, Math.min(144, modules));
    return clamped + (clamped % 2); // real symbol sizes are always even
  }

  // ZPL in-field mode-switch shortcuts (">:" ">;" ">=" etc.) used in barcode
  // ^FD data are not literal data characters - strip for the preview encoder.
  function stripBarcodeControlPrefix(str) {
    return (str || '').replace(/^>[0-9:;=]/, '');
  }

  // ---------------------------------------------------------------------
  // Text measurement - owns its own offscreen canvas so this module never
  // depends on the editor's own DOM (a real <canvas> is still required;
  // this only works in a browser-like environment, same caveat the rest of
  // this app's DOM-dependent library modules already have).
  // ---------------------------------------------------------------------
  const measureCanvas = global.document ? global.document.createElement('canvas') : null;
  const mctx = measureCanvas ? measureCanvas.getContext('2d') : null;
  if (mctx && 'fontKerning' in mctx) mctx.fontKerning = 'none';
  let lastMctxFont = null;

  function fontFamilyForId(fontId) {
    // '0' is Zebra's only scalable, proportional font. Community consensus
    // identifies it as close to Roboto Condensed at bold weight (self-hosted
    // via the editor's own css/style.css @font-face; 'Arial Narrow' sits in
    // the fallback chain since it's condensed like the real substitute, so
    // width drift stays smaller if the bundled font ever fails to load) -
    // every other font id here is one of Zebra's fixed-pitch bitmap fonts,
    // approximated with a monospace substitute since there's no way to
    // embed the real bitmap glyphs in a canvas font.
    if (fontId === '0') return "'Roboto Condensed', 'Arial Narrow', Arial, Helvetica, sans-serif";
    return '"Consolas","Courier New",monospace';
  }
  // Font 0 actually prints bold/blocky on real Zebra printers (confirmed
  // against Labelary's exact-render preview) - a plain-weight substitute
  // reads noticeably thinner/narrower on screen than what comes off the
  // printer. Math.max(1, ...) keeps a zero/negative heightDots (malformed
  // input) from producing an invalid "0px ..." font string, which canvas
  // silently ignores rather than erroring on - leaving whatever font was
  // set previously in place instead of the one this call actually wanted.
  function fontDeclaration(heightDots, fontId) {
    const weight = fontId === '0' ? 'bold ' : '';
    return weight + Math.max(1, heightDots) + 'px ' + fontFamilyForId(fontId);
  }

  // Zebra's real font 0 renders the ASCII hyphen-minus ("-") as a much wider
  // dash than any bold sans-serif substitute draws it - measured directly
  // against Labelary's Zebra-accurate rendering (probe "AAA-AAA" at height
  // 100: the dash's own advance came out to ~91 dots, i.e. ~0.91x the field
  // height). This target ratio is a property of Zebra's OWN real output, not
  // of whichever substitute font we draw with, so it stays valid regardless
  // of the substitute - naturalDashWidth is always re-measured live against
  // whatever font is actually set on the context.
  const ZEBRA_FONT0_DASH_HEIGHT_RATIO = 0.91;
  function dashExtraWidth(text, naturalDashWidth, heightDots) {
    const dashCount = (text.match(/-/g) || []).length;
    if (!dashCount) return 0;
    return dashCount * Math.max(0, ZEBRA_FONT0_DASH_HEIGHT_RATIO * heightDots - naturalDashWidth);
  }
  function measureTextWidth(text, fontId, heightDots) {
    const font = fontDeclaration(heightDots, fontId);
    if (lastMctxFont !== font) { mctx.font = font; lastMctxFont = font; }
    const s = text || '';
    const base = mctx.measureText(s).width;
    if (fontId !== '0' || s.indexOf('-') === -1) return base;
    return base + dashExtraWidth(s, mctx.measureText('-').width, heightDots);
  }

  // ZPL ^A's height and width are independent - characters are drawn `width`
  // dots wide regardless of their `height`. Canvas font-size only controls
  // height, so text width is approximated as a horizontal stretch factor
  // relative to a natural width==height baseline.
  function textWidthScale(el) {
    if (el.width && el.height) return el.width / el.height;
    // No explicit width override (the common case) - the field just uses
    // whatever width its font naturally has: for the fixed bitmap fonts,
    // each font's own documented aspect ratio (BITMAP_FONT_ASPECT), not the
    // substitute monospace font's proportions. Font '0' (scalable) has no
    // correction (1), matching its substitute's own natural proportions.
    return M.BITMAP_FONT_ASPECT[el.font] || 1;
  }

  // ---------------------------------------------------------------------
  // Barcode preview encoding + 2D-placeholder sizing
  // ---------------------------------------------------------------------
  // getBounds/getLocalBounds/drawBarcodeElement each independently need the
  // encoded bar pattern - the encoder call only ever depends on barcodeType
  // + the resolved data string + ratio (^BY's wide:narrow ratio, which
  // code39/itf bake into the returned bar widths) + checkDigit (code39/itf
  // only), so that foursome is a correct and cheap cache key.
  const barcodeEncodeCache = new WeakMap();

  function barcodeModuleWidth(el) {
    return M.normalizeBarcodeModuleWidth(el && el.moduleWidth);
  }

  function barcodeRatio(el) {
    return M.normalizeBarcodeRatio(el && el.ratio);
  }

  function barcodeEncode(el, opts) {
    const o = opt(opts);
    const schema = M.BARCODE_TYPES[el.barcodeType] || M.BARCODE_TYPES.code128;
    const encoderName = schema.previewEncoder;
    const data = stripBarcodeControlPrefix(o.resolveText(el.data));
    if (!encoderName || !global.ZPLBarcode || !global.ZPLBarcode[encoderName]) {
      return { bars: [], ok: false, error: 'Keine Vorschau für diesen Barcode-Typ', totalModules: 40 };
    }
    const checkDigit = !!(el.params && el.params.checkDigit);
    const ratio = barcodeRatio(el);
    const cacheKey = el.barcodeType + '|' + data + '|' + ratio + '|' + checkDigit;
    const cached = barcodeEncodeCache.get(el);
    if (cached && cached.key === cacheKey) return cached.result;
    const result = global.ZPLBarcode[encoderName](data, ratio, checkDigit);
    result.totalModules = result.bars.reduce(function (a, b) { return a + b; }, 0) || 40;
    barcodeEncodeCache.set(el, { key: cacheKey, result: result });
    return result;
  }

  function dataMatrixWH(el, opts) {
    const o = opt(opts);
    const dotSize = Math.max(1, (el.params && el.params.height) || 6);
    const cols = (el.params && el.params.columns) || 0;
    const rows = (el.params && el.params.rows) || 0;
    const dataLen = o.resolveText(el.data || '').length;
    const side = estimateDataMatrixModules(dataLen);
    return { w: (cols > 0 ? cols : side) * dotSize, h: (rows > 0 ? rows : side) * dotSize };
  }

  // Aztec (^B0) has no real encoder here either - same rough "plausible
  // module count from payload length" approach as Data Matrix, scaled by
  // the "magnification" param (Aztec's own module-size control).
  function aztecWH(el, opts) {
    const o = opt(opts);
    const moduleDots = Math.max(1, (el.params && el.params.magnification) || 1);
    const dataLen = o.resolveText(el.data || '').length;
    const side = estimateDataMatrixModules(dataLen);
    return { w: side * moduleDots, h: side * moduleDots };
  }

  // MaxiCode (^BD) is the one 2D symbology here with a genuinely fixed,
  // parameter-independent size in real ZPL - always ~1 inch square,
  // regardless of payload or any size parameter (it has none). Takes dpi
  // via opts instead of a label object, so a caller with just a dpi number
  // (not a whole label) can still use it.
  function maxicodeWH(opts) {
    const o = opt(opts);
    return { w: o.dpi, h: o.dpi };
  }

  // ---------------------------------------------------------------------
  // Per-element bounding box
  // ---------------------------------------------------------------------
  // Per-type size in the element's own LOCAL frame (origin at 0,0 - for FT-
  // anchored text/barcode/DataMatrix that means the box sits above y=0,
  // since that's their baseline). getBounds()/getLocalBounds() below are
  // both just this, differing only in whether the result gets translated by
  // (el.x, el.y) - having one shared computation means a barcode/text sizing
  // change can't update one of the two call sites and silently drift from
  // the other, desyncing the hit-test box from the drawn/selection box.
  function elementLocalSize(el, opts) {
    const o = opt(opts);
    if (el.type === 'box' || el.type === 'line' || el.type === 'ellipse') {
      return { x: 0, y: 0, w: Math.max(el.widthDots, 1), h: Math.max(el.heightDots, 1) };
    }
    if (el.type === 'circle') {
      return { x: 0, y: 0, w: Math.max(el.diameter, 1), h: Math.max(el.diameter, 1) };
    }
    if (el.type === 'graphic') {
      const w = (el.displayWidthPx != null ? el.displayWidthPx : el.widthPx) || 10;
      const h = (el.displayHeightPx != null ? el.displayHeightPx : el.heightPx) || 10;
      return { x: 0, y: 0, w: w, h: h };
    }
    if (el.type === 'barcode' && el.barcodeType === 'datamatrix') {
      const dm = dataMatrixWH(el, o);
      return { x: 0, y: el.origin === 'FT' ? -dm.h : 0, w: dm.w, h: dm.h };
    }
    if (el.type === 'barcode' && el.barcodeType === 'aztec') {
      const az = aztecWH(el, o);
      return { x: 0, y: el.origin === 'FT' ? -az.h : 0, w: az.w, h: az.h };
    }
    if (el.type === 'barcode' && el.barcodeType === 'maxicode') {
      const mc = maxicodeWH(o);
      return { x: 0, y: el.origin === 'FT' ? -mc.h : 0, w: mc.w, h: mc.h };
    }
    if (el.type === 'barcode') {
      const enc = barcodeEncode(el, o);
      const mw = barcodeModuleWidth(el);
      const w = global.ZPLBarcode && global.ZPLBarcode.renderedWidthPx
        ? global.ZPLBarcode.renderedWidthPx(enc.bars, mw)
        : enc.totalModules * mw;
      const h = (el.params && el.params.height) || M.DEFAULT_BARCODE_HEIGHT;
      // EAN-13/UPC-A guard bars print taller than `h` even with the
      // interpretation line off - the +20 below already covers that when
      // the line IS on, so only the "off" case needs its own floor.
      const isEanUpc = el.barcodeType === 'ean13' || el.barcodeType === 'upca';
      const extra = (el.params && el.params.interpretationLine) ? 20 : (isEanUpc ? EAN_GUARD_EXTENSION_DOTS : 0);
      return { x: 0, y: el.origin === 'FT' ? -h : 0, w: w, h: h + extra };
    }
    // text
    const h = el.height || 30;
    const displayText = o.resolveText(el.text || '');
    const w = el.fieldBlock ? el.fieldBlock.widthDots : Math.max(4, measureTextWidth(displayText, el.font, h) * textWidthScale(el));
    return { x: 0, y: el.origin === 'FT' ? -h : 0, w: w, h: h * 1.25 };
  }

  // Bounding box (unrotated, in dots) - used both for drawing pivot and hit-testing.
  function getBounds(el, opts) {
    const local = elementLocalSize(el, opts);
    return { x: el.x + local.x, y: el.y + local.y, w: local.w, h: local.h };
  }

  // Bounds in the element's own local (pre-rotation) frame - i.e. exactly the
  // box a rotated text/barcode draw fills after translating to (el.x, el.y)
  // and rotating. Only meaningful for text/barcode; box/graphic/etc. are
  // never rotated so getBounds() alone already describes them. (Purely a
  // naming alias over elementLocalSize, kept because callers already use
  // this name for "give me the untranslated box".)
  function getLocalBounds(el, opts) {
    return elementLocalSize(el, opts);
  }

  // World-space corners of an element's true visual rectangle, honoring
  // rotation for text/barcode (box/graphic are never rotated, so their
  // corners are just the plain axis-aligned box).
  function getWorldCorners(el, pad, opts) {
    pad = pad || 0;
    if (isUnrotatedType(el.type)) {
      const b = getBounds(el, opts);
      return [[b.x - pad, b.y - pad], [b.x + b.w + pad, b.y - pad], [b.x + b.w + pad, b.y + b.h + pad], [b.x - pad, b.y + b.h + pad]];
    }
    const local = getLocalBounds(el, opts);
    const padded = { x: local.x - pad, y: local.y - pad, w: local.w + pad * 2, h: local.h + pad * 2 };
    const angle = ORIENT_RAD[getOrientation(el)] || 0;
    return rotatedCorners(padded, angle, 0, 0).map(function (p) { return [p[0] + el.x, p[1] + el.y]; });
  }

  // Axis-aligned bounding box of an element's true (possibly rotated) extent -
  // used for the marquee/rectangle selection overlap test and alignment guides.
  function getAABB(el, opts) {
    const corners = getWorldCorners(el, 0, opts);
    const xs = corners.map(function (c) { return c[0]; });
    const ys = corners.map(function (c) { return c[1]; });
    const minX = Math.min.apply(null, xs), maxX = Math.max.apply(null, xs);
    const minY = Math.min.apply(null, ys), maxY = Math.max.apply(null, ys);
    return { x: minX, y: minY, w: maxX - minX, h: maxY - minY };
  }

  // Raster/PDF output cannot hand off unsupported fields to a real ZPL
  // printer.  Keep this inspection next to the shared barcode renderer so
  // every consumer (the Studio UI and an embedding of ZPLkit) gets the same
  // answer before it creates a seemingly-valid but unscannable image.
  //
  // `blockers` mean that an output would omit or fake a barcode and must not
  // be produced. `warnings` are still renderable, but deserve an explicit
  // human decision because scan reliability depends on the target printer and
  // scanner too (especially X-dimension and inverse printing).
  function inspectRasterOutput(label, opts) {
    const o = opt(opts);
    const blockers = [];
    const warnings = [];
    const elements = (label && label.elements) || [];
    const rawTail = Array.isArray(label && label.rawTail) ? label.rawTail : [];

    // The parser may preserve a bare ^FO/^FT...^FS field when a sticky ^BY
    // appears between the origin and the actual barcode field. That empty
    // field has no visual effect and must not make an otherwise safe PNG/PDF
    // export impossible; every other raw chunk remains a blocker because the
    // raster renderer cannot know whether it paints content.
    const visibleRawTail = rawTail.filter(function (entry) {
      const raw = entry && String(entry.raw || '').replace(/[\s\r\n]+/g, '');
      return raw && !/^(?:\^(?:FO|FT)-?\d+,-?\d+\^FS)+$/.test(raw);
    });
    if (visibleRawTail.length) {
      blockers.push({ code: 'unrendered-zpl', count: visibleRawTail.length });
    }

    elements.forEach(function (el) {
      if (!el || el.hidden) return;
      if (el.type === 'raw') {
        blockers.push({ code: 'unrendered-zpl', count: 1 });
        return;
      }
      if (el.type !== 'barcode') return;

      if (isPlaceholderOnlyBarcode(el.barcodeType)) {
        blockers.push({ code: 'placeholder-barcode', barcodeType: el.barcodeType });
        return;
      }

      // These ZPL prefixes change Code 128's invocation/data semantics. The
      // lightweight 1D encoder intentionally strips them for an editor
      // preview, so using that preview as final raster output would encode a
      // different payload.
      const resolved = o.resolveText(el.data || '');
      if (/^>[0-9:;=]/.test(resolved)) {
        blockers.push({ code: 'barcode-control-prefix', barcodeType: el.barcodeType });
        return;
      }

      const enc = barcodeEncode(el, o);
      if (!enc.ok || !enc.bars.length) {
        blockers.push({ code: 'invalid-barcode', barcodeType: el.barcodeType, error: enc.error || '' });
        return;
      }

      const mw = barcodeModuleWidth(el);
      const mmPerModule = mw / o.dpi * 25.4;
      if (mmPerModule < 0.19) {
        warnings.push({ code: 'module-too-small', barcodeType: el.barcodeType, millimeters: mmPerModule });
      }
      if (el.fieldReverse) {
        warnings.push({ code: 'inverse-barcode', barcodeType: el.barcodeType });
      }

      // A quiet zone is white space around the symbol; we can reliably catch
      // a code placed too close to the label edge here. We deliberately do
      // not claim to detect overlaps with arbitrary neighboring artwork.
      const quietZone = (el.barcodeType === 'ean13' || el.barcodeType === 'upca' ? 11 : 10) * mw;
      const aabb = getAABB(el, o);
      const labelWidth = label && label.settings && label.settings.widthDots;
      const labelHeight = label && label.settings && label.settings.heightDots;
      if (Number.isFinite(labelWidth) && Number.isFinite(labelHeight) &&
          (aabb.x < quietZone || aabb.y < quietZone ||
           aabb.x + aabb.w > labelWidth - quietZone || aabb.y + aabb.h > labelHeight - quietZone)) {
        warnings.push({ code: 'edge-quiet-zone', barcodeType: el.barcodeType, dots: quietZone });
      }
    });

    return { blockers: blockers, warnings: warnings, ok: blockers.length === 0 };
  }

  // Same shape as getAABB(el), but for a hypothetical (x, y) instead of the
  // element's current position - lets an in-progress drag test a candidate
  // position without mutating the element first.
  function elementAABBAt(el, x, y, opts) {
    const local = getLocalBounds(el, opts);
    if (isUnrotatedType(el.type)) {
      return { x: x + local.x, y: y + local.y, w: local.w, h: local.h };
    }
    const angle = ORIENT_RAD[getOrientation(el)] || 0;
    const corners = rotatedCorners(local, angle, 0, 0).map(function (p) { return [p[0] + x, p[1] + y]; });
    const xs = corners.map(function (c) { return c[0]; }), ys = corners.map(function (c) { return c[1]; });
    const minX = Math.min.apply(null, xs), maxX = Math.max.apply(null, xs);
    const minY = Math.min.apply(null, ys), maxY = Math.max.apply(null, ys);
    return { x: minX, y: minY, w: maxX - minX, h: maxY - minY };
  }

  // ---------------------------------------------------------------------
  // Canvas drawing (element-level) - draws one already-positioned element
  // into a caller-supplied 2D context. Every function takes `ctx` as an
  // explicit first parameter rather than closing over one, so this module
  // has no notion of "the current canvas" - a caller can render the same
  // label into any number of contexts (live editor canvas, an offscreen
  // thumbnail, a diff overlay) without any save/restore-the-world juggling.
  // ---------------------------------------------------------------------
  function roundedRectPath(c, x, y, w, h, r) {
    r = Math.max(0, Math.min(r, w / 2, h / 2));
    c.beginPath();
    if (c.roundRect) {
      c.roundRect(x, y, w, h, r);
    } else {
      c.moveTo(x + r, y);
      c.arcTo(x + w, y, x + w, y + h, r);
      c.arcTo(x + w, y + h, x, y + h, r);
      c.arcTo(x, y + h, x, y, r);
      c.arcTo(x, y, x + w, y, r);
      c.closePath();
    }
  }

  // Rebuilding this offscreen canvas (allocate + putImageData) on every
  // single drawElementsOnly() call - which fires on every mousemove while
  // dragging ANYTHING on the label, not just this graphic - was wasted work
  // for a bitmap that only actually changes on import/replace/resize. Cache
  // it per element; a WeakMap means it needs no manual cleanup (never
  // touches the element's own JSON-serializable shape, so history
  // snapshots/export are unaffected) and naturally drops the entry once the
  // element itself is no longer reachable (e.g. after undo/redo rebuilds the
  // elements array).
  const graphicCanvasCache = new WeakMap();
  function drawGraphicElement(ctx, el, b) {
    if (!el.bits || !el.widthPx || !el.heightPx) return;
    let cached = graphicCanvasCache.get(el);
    if (!cached || cached.bits !== el.bits || cached.widthPx !== el.widthPx || cached.heightPx !== el.heightPx || cached.fieldReverse !== !!el.fieldReverse) {
      const off = global.document.createElement('canvas');
      off.width = el.widthPx; off.height = el.heightPx;
      const imgData = global.ZPLGraphic.bitsToImageData({ widthPx: el.widthPx, heightPx: el.heightPx, bytesPerRow: el.bytesPerRow, bytes: el.bits });
      if (el.fieldReverse) {
        // ^FR prints ink exactly where the bitmap has none, and vice versa -
        // bitsToImageData only ever emits opaque black or transparent white,
        // so flipping alpha (with a matching color swap) mirrors that exactly.
        const d = imgData.data;
        for (let i = 0; i < d.length; i += 4) {
          const wasInk = d[i + 3] === 255;
          d[i] = d[i + 1] = d[i + 2] = wasInk ? 255 : 0;
          d[i + 3] = wasInk ? 0 : 255;
        }
      }
      off.getContext('2d').putImageData(imgData, 0, 0);
      cached = { canvas: off, bits: el.bits, widthPx: el.widthPx, heightPx: el.heightPx, fieldReverse: !!el.fieldReverse };
      graphicCanvasCache.set(el, cached);
    }
    // ZPL graphics are 1-bit dot bitmaps - a real printer (and Labelary)
    // always renders them as hard-edged square dots, never blurred. Canvas's
    // default bilinear smoothing would soften every scaled-up/down edge, so
    // it's turned off (and scoped to just this blit) to match.
    ctx.save();
    ctx.imageSmoothingEnabled = false;
    ctx.drawImage(cached.canvas, b.x, b.y, b.w, b.h);
    ctx.restore();
  }

  function drawBoxElement(ctx, el) {
    ctx.save();
    ctx.fillStyle = el.color === 'W' ? '#fff' : '#000';
    ctx.strokeStyle = ctx.fillStyle;
    const t = Math.max(1, el.thickness || 1);
    const w = Math.max(el.widthDots, 1), h = Math.max(el.heightDots, 1);
    const maxRadius = Math.min(w, h) / 2;
    const radius = Math.min(maxRadius, (el.rounding || 0) / 8 * maxRadius);
    if (w <= t * 2 || h <= t * 2) {
      roundedRectPath(ctx, el.x, el.y, w, h, radius);
      ctx.fill();
    } else {
      // A stroked rounded-rect path (inset by half the border thickness so the
      // OUTER edge lands on the given width/height) draws a hollow rounded
      // border in one shape, and degrades to the old square 4-fillRect look
      // exactly when rounding=0.
      roundedRectPath(ctx, el.x + t / 2, el.y + t / 2, w - t, h - t, Math.max(0, radius - t / 2));
      ctx.lineWidth = t;
      ctx.stroke();
    }
    ctx.restore();
  }

  function drawCircleElement(ctx, el) {
    ctx.save();
    ctx.fillStyle = el.color === 'W' ? '#fff' : '#000';
    ctx.strokeStyle = ctx.fillStyle;
    const d = Math.max(el.diameter, 1);
    const t = Math.max(1, el.thickness || 1);
    const cx = el.x + d / 2, cy = el.y + d / 2;
    ctx.beginPath();
    if (t * 2 >= d) {
      ctx.arc(cx, cy, d / 2, 0, Math.PI * 2);
      ctx.fill();
    } else {
      ctx.arc(cx, cy, Math.max(0, d / 2 - t / 2), 0, Math.PI * 2);
      ctx.lineWidth = t;
      ctx.stroke();
    }
    ctx.restore();
  }

  function drawEllipseElement(ctx, el) {
    ctx.save();
    ctx.fillStyle = el.color === 'W' ? '#fff' : '#000';
    ctx.strokeStyle = ctx.fillStyle;
    const w = Math.max(el.widthDots, 1), h = Math.max(el.heightDots, 1);
    const t = Math.max(1, el.thickness || 1);
    const cx = el.x + w / 2, cy = el.y + h / 2;
    ctx.beginPath();
    if (t * 2 >= Math.min(w, h)) {
      ctx.ellipse(cx, cy, w / 2, h / 2, 0, 0, Math.PI * 2);
      ctx.fill();
    } else {
      ctx.ellipse(cx, cy, Math.max(0, w / 2 - t / 2), Math.max(0, h / 2 - t / 2), 0, 0, Math.PI * 2);
      ctx.lineWidth = t;
      ctx.stroke();
    }
    ctx.restore();
  }

  function drawLineElement(ctx, el) {
    ctx.save();
    ctx.strokeStyle = el.color === 'W' ? '#fff' : '#000';
    const w = el.widthDots, h = el.heightDots;
    const nominalThickness = Math.max(1, el.thickness || 1);
    // ^GD's "thickness" is not a true stroke width perpendicular to the line -
    // verified against Labelary at 7 height:width ratios (fixed width, height
    // from 5 to 200): measured ink coverage tracked thickness*shortSide/
    // longSide almost exactly, meaning a shallow diagonal (the near-horizontal
    // "divider" this app's own sample label uses ^GD for) prints far fainter
    // than `thickness` alone would suggest, sometimes down to barely visible.
    const shortSide = Math.min(w, h), longSide = Math.max(w, h);
    ctx.lineWidth = longSide > 0 ? Math.max(0.05, nominalThickness * shortSide / longSide) : nominalThickness;
    ctx.beginPath();
    if (el.diagonal === 'L') {
      ctx.moveTo(el.x, el.y);
      ctx.lineTo(el.x + w, el.y + h);
    } else {
      ctx.moveTo(el.x, el.y + h);
      ctx.lineTo(el.x + w, el.y);
    }
    ctx.stroke();
    ctx.restore();
  }

  // Data Matrix has no real encoder here - draw a correctly sized/positioned
  // placeholder (checkerboard fill + clear label) instead of either a blank
  // gap or a fake-but-wrong-looking "scannable" symbol.
  // Shared placeholder renderer for every 2D symbology this editor doesn't
  // have a real scannable encoder for (Data Matrix, Aztec, MaxiCode - see
  // each one's BARCODE_TYPES comment for why) - a checkerboard-textured
  // black square with a clearly-labeled overlay, never claiming to be an
  // actually-scannable code. `dotSize` is each type's own module-size
  // concept (Data Matrix/Aztec have a real one; MaxiCode doesn't, so its
  // caller passes a purely cosmetic value).
  function drawBarcodePlaceholder2D(ctx, el, b, label, dotSize) {
    ctx.save();
    const angle = ORIENT_RAD[(el.params && el.params.orientation) || 'N'] || 0;
    ctx.translate(el.x, el.y);
    ctx.rotate(angle);
    const originY = el.origin === 'FT' ? -b.h : 0;
    ctx.fillStyle = '#000';
    ctx.fillRect(0, originY, b.w, b.h);
    ctx.fillStyle = '#fff';
    const ds = Math.max(2, dotSize || 6);
    for (let gy = 0; gy + ds <= b.h; gy += ds * 2) {
      for (let gx = 0; gx + ds <= b.w; gx += ds * 2) {
        ctx.fillRect(gx, originY + gy, ds, ds);
      }
    }
    if (b.w > 50 && b.h > 16) {
      ctx.fillStyle = 'rgba(255,255,255,0.85)';
      ctx.fillRect(0, originY + b.h / 2 - 7, b.w, 14);
      ctx.fillStyle = '#b3261e';
      ctx.font = '10px sans-serif';
      ctx.textAlign = 'center';
      ctx.textBaseline = 'middle';
      ctx.fillText(label, b.w / 2, originY + b.h / 2);
      ctx.textAlign = 'left';
    }
    ctx.restore();
  }

  // EAN-13/UPC-A don't print one plain interpretation string like every other
  // symbology here - verified against Labelary's actual output: a digit sits
  // outside the bars on the left (both types) and right (UPC-A only), and the
  // rest are split into two groups under the left/right halves (6+6 for
  // EAN-13, 5+5 for UPC-A). Offsets are in MODULES (always exactly 7 per
  // digit, 3 for the outer guards, 5 for the middle one, regardless of how
  // many bar-array entries a given digit's pattern happens to pack them into
  // - see ean13()'s leftDigitRanges/rightDigitRanges comment for that
  // distinction), multiplied by moduleWidth to get dots.
  function drawEanUpcInterpretation(ctx, el, enc, mw, originY, drawH, above) {
    const text = enc.text;
    const ty = above ? originY - 18 : originY + drawH + 2;
    const gap = EAN_OUTSIDE_DIGIT_GAP_DOTS;
    function put(str, xDots) { if (str) ctx.fillText(str, xDots, ty); }
    if (el.barcodeType === 'upca' && text.length === 12) {
      const outsideLeft = text.charAt(0), leftGroup = text.substr(1, 5),
        rightGroup = text.substr(6, 5), outsideRight = text.charAt(11);
      put(outsideLeft, -gap - ctx.measureText(outsideLeft).width);
      put(leftGroup, 10 * mw);
      put(rightGroup, 50 * mw);
      put(outsideRight, 95 * mw + gap);
    } else if (text.length === 13) {
      const outsideLeft = text.charAt(0), leftGroup = text.substr(1, 6), rightGroup = text.substr(7, 6);
      put(outsideLeft, -gap - ctx.measureText(outsideLeft).width);
      put(leftGroup, 3 * mw);
      put(rightGroup, 50 * mw);
    } else {
      put(text, 0); // shouldn't happen - defensive fallback to the old plain layout
    }
  }

  function drawBarcodeElement(ctx, el, b, opts) {
    const o = opt(opts);
    if (el.barcodeType === 'datamatrix') {
      drawBarcodePlaceholder2D(ctx, el, b, 'Data Matrix – Vorschau', el.params && el.params.height);
      return;
    }
    if (el.barcodeType === 'aztec') {
      drawBarcodePlaceholder2D(ctx, el, b, 'Aztec Code – Vorschau', el.params && el.params.magnification);
      return;
    }
    if (el.barcodeType === 'maxicode') {
      // MaxiCode has no module-size parameter of its own (fixed physical
      // size regardless) - ~30 modules across its ~1 inch width is a
      // reasonable real-world approximation for a purely cosmetic texture.
      drawBarcodePlaceholder2D(ctx, el, b, 'MaxiCode – Vorschau', b.w / 30);
      return;
    }
    const enc = barcodeEncode(el, o);
    ctx.save();
    const angle = ORIENT_RAD[(el.params && el.params.orientation) || 'N'] || 0;
    ctx.translate(el.x, el.origin === 'FT' ? el.y : el.y);
    ctx.rotate(angle);
    const drawH = (el.params && el.params.height) || M.DEFAULT_BARCODE_HEIGHT;
    const originY = el.origin === 'FT' ? -drawH : 0;
    const isEanUpc = el.barcodeType === 'ean13' || el.barcodeType === 'upca';
    if (enc.ok && enc.bars.length) {
      const mw = barcodeModuleWidth(el);
      const guardExtension = isEanUpc ? EAN_GUARD_EXTENSION_DOTS : 0;
      const reversed = !!el.fieldReverse;
      if (reversed) {
        const w = global.ZPLBarcode.renderedWidthPx(enc.bars, mw);
        const hasInterpretation = !!(el.params && el.params.interpretationLine);
        const textAbove = !!(el.params && el.params.interpretationLineAbove);
        ctx.fillStyle = '#000';
        ctx.fillRect(0, textAbove && hasInterpretation ? originY - 20 : originY, w,
          drawH + guardExtension + (hasInterpretation ? 20 : 0));
      }
      global.ZPLBarcode.renderToCanvas(ctx, enc.bars, 0, originY, mw, drawH, enc.guardRanges, guardExtension, reversed ? { color: '#fff' } : null);
      if (el.params && el.params.interpretationLine) {
        ctx.fillStyle = reversed ? '#fff' : '#000';
        ctx.font = '16px monospace';
        ctx.textBaseline = 'top';
        if (isEanUpc && enc.text) {
          drawEanUpcInterpretation(ctx, el, enc, mw, originY, drawH, el.params.interpretationLineAbove);
        } else {
          // interpretationLineAbove flips the human-readable line to the far
          // side of the bars instead of its usual spot underneath them.
          const ty = el.params.interpretationLineAbove ? originY - 18 : originY + drawH + 2;
          ctx.fillText(o.resolveText(el.data || ''), 0, ty);
        }
      }
    } else {
      ctx.fillStyle = '#b3261e';
      // A fixed dot-space font size becomes illegible at a small render zoom
      // (e.g. Seriendruck's 0.22x preview thumbnails) - dividing by the
      // caller's zoom (via opts) keeps this readable at ~11 screen px
      // regardless.
      ctx.font = (11 / o.zoom) + 'px sans-serif';
      ctx.textBaseline = 'top';
      ctx.fillText('[Barcode: ' + (enc.error || 'ungültig') + ']', 0, originY);
    }
    ctx.restore();
  }

  // Draws one line of text, widening any "-" the same way measureTextWidth()
  // already accounts for (see ZEBRA_FONT0_DASH_HEIGHT_RATIO) - a single plain
  // ctx.fillText() call draws the substitute font's own (much narrower) dash,
  // which would make the selection outline/wrap box (sized from
  // measureTextWidth) visibly overshoot the actually-drawn text.
  function fillTextCorrected(ctx, text, x, y, fontId, heightDots) {
    if (fontId !== '0' || !text || text.indexOf('-') === -1) { ctx.fillText(text, x, y); return; }
    const naturalDash = ctx.measureText('-').width;
    const extraPerDash = Math.max(0, ZEBRA_FONT0_DASH_HEIGHT_RATIO * heightDots - naturalDash);
    // The probe measurement showed the extra width split roughly evenly as a
    // gap BEFORE and AFTER the dash glyph (not all trailing it), so mirror
    // that rather than just widening the advance on one side.
    const parts = text.split('-');
    let cx = x;
    parts.forEach(function (part, i) {
      if (part) { ctx.fillText(part, cx, y); cx += ctx.measureText(part).width; }
      if (i < parts.length - 1) {
        cx += extraPerDash / 2;
        ctx.fillText('-', cx, y);
        cx += naturalDash + extraPerDash / 2;
      }
    });
  }

  // wrapText() does an O(words) measureText() pass (canvas text measurement
  // is one of the pricier canvas ops) - drawTextElement() runs it once per
  // fieldBlock text element on EVERY drawElementsOnly() call, i.e. every
  // mousemove during a drag of any element anywhere on the label, even when
  // this particular text hasn't changed at all. Cache the wrapped lines per
  // element, keyed on everything the wrap actually depends on.
  const textWrapCache = new WeakMap();
  function wrapTextCached(el, text, maxWidth, fontId, heightDots, maxLines, hangingIndent) {
    const key = text + '|' + maxWidth + '|' + fontId + '|' + heightDots + '|' + maxLines + '|' + hangingIndent;
    const cached = textWrapCache.get(el);
    if (cached && cached.key === key) return cached.lines;
    const lines = wrapText(text, maxWidth, fontId, heightDots, maxLines, hangingIndent);
    textWrapCache.set(el, { key: key, lines: lines });
    return lines;
  }
  function wrapText(text, maxWidth, fontId, heightDots, maxLines, hangingIndent) {
    hangingIndent = hangingIndent || 0;
    const words = (text || '').split(/\s+/).filter(Boolean);
    const lines = [];
    let cur = '';
    words.forEach(function (w) {
      // Lines after the first wrap against a narrower width, since the
      // hanging indent eats into their available space without moving boxW.
      const limit = lines.length === 0 ? maxWidth : Math.max(1, maxWidth - hangingIndent);
      const test = cur ? cur + ' ' + w : w;
      if (measureTextWidth(test, fontId, heightDots) > limit && cur) {
        lines.push(cur);
        cur = w;
      } else {
        cur = test;
      }
    });
    if (cur) lines.push(cur);
    if (lines.length === 0) lines.push('');
    if (maxLines > 0 && lines.length > maxLines) lines.length = maxLines;
    return lines;
  }

  function drawTextElement(ctx, el, opts) {
    const o = opt(opts);
    const displayText = o.resolveText(el.text || '');
    const h = el.height || 30;
    const widthScale = textWidthScale(el);
    ctx.save();
    ctx.translate(el.x, el.y);
    ctx.rotate(ORIENT_RAD[el.orientation] || 0);
    // ^A's height,width are independent - stretch horizontally to approximate a
    // width that differs from height. Everything drawn below (and all the
    // measureTextWidth-based layout math) works in natural (pre-stretch) units;
    // this transform maps them back to true world-dot width.
    ctx.scale(widthScale, 1);
    ctx.font = fontDeclaration(h, el.font);
    ctx.textBaseline = el.origin === 'FT' ? 'alphabetic' : 'top';
    ctx.fillStyle = '#000';

    let lines = [displayText];
    let boxW = null, justify = 'L', hangingIndent = 0;
    // ZPL has no implicit line leading the way desktop/CSS fonts do - per the
    // ^FB spec, its line-spacing parameter only "adds or deletes space between
    // lines" from a default of 0, meaning consecutive lines sit exactly `h`
    // dots apart (flush) with nothing extra unless the label asks for it.
    const lineAdvance = h + (el.fieldBlock && el.fieldBlock.lineSpacing ? el.fieldBlock.lineSpacing : 0);
    if (el.fieldBlock) {
      boxW = el.fieldBlock.widthDots / widthScale;
      justify = el.fieldBlock.justify || 'L';
      hangingIndent = el.fieldBlock.hangingIndent || 0;
      // ZPL's ^FB maxLines=0 means "as many lines as needed" (unbounded), not
      // zero - `|| 1` would treat that falsy 0 as "just one line" and truncate.
      const maxLines = el.fieldBlock.maxLines != null ? el.fieldBlock.maxLines : 1;
      lines = wrapTextCached(el, displayText, boxW, el.font, h, maxLines, hangingIndent);
    }

    if (el.fieldReverse) {
      ctx.save();
      ctx.fillStyle = '#000';
      const totalH = (lines.length - 1) * lineAdvance + h;
      const topY = el.origin === 'FT' ? -h : 0;
      ctx.fillRect(0, topY, boxW || measureTextWidth(displayText, el.font, h), totalH);
      ctx.restore();
      ctx.fillStyle = '#fff';
    }

    lines.forEach(function (line, i) {
      const ly = i * lineAdvance;
      // ^FB's 5th param hangs the second and later lines in from the left
      // by this many dots, without moving the block's right edge (boxW).
      const indent = i === 0 ? 0 : hangingIndent;
      const isLastLine = i === lines.length - 1;
      if (boxW != null && justify === 'J' && !isLastLine && line.indexOf(' ') !== -1) {
        // Full justify: stretch inter-word gaps so the line exactly fills boxW.
        const words = line.split(' ');
        const availW = boxW - indent;
        const wordsWidth = words.reduce(function (sum, w) { return sum + measureTextWidth(w, el.font, h); }, 0);
        const gapCount = words.length - 1;
        const gap = gapCount > 0 ? (availW - wordsWidth) / gapCount : 0;
        let cx = indent;
        words.forEach(function (w) {
          fillTextCorrected(ctx, w, cx, ly, el.font, h);
          cx += measureTextWidth(w, el.font, h) + gap;
        });
        return;
      }
      let lx = indent;
      if (boxW != null) {
        const lw = measureTextWidth(line, el.font, h);
        const availW = boxW - indent;
        if (justify === 'C') lx = indent + (availW - lw) / 2;
        else if (justify === 'R') lx = indent + (availW - lw);
        // Note: justify 'J' (full justify) reaches here only for its last line
        // (handled above for all other lines), which is conventionally left-aligned.
      }
      fillTextCorrected(ctx, line, lx, ly, el.font, h);
    });
    ctx.restore();
  }

  // White background + every element, nothing else (no grid/selection/marquee) -
  // shared by the live editor canvas and any offscreen render of an arbitrary
  // label (diff overlay, multi-label thumbnails, Seriendruck previews).
  // Returns the list of elements that failed to render ({id, type, error}) -
  // empty when everything drew fine. A broken element never takes down the
  // whole preview, but silently dropping it with only a console.warn meant
  // there was no way to notice from the UI - callers that care (Seriendruck's
  // batch preview, most of all: it exists specifically to catch bad data
  // BEFORE a physical print run) can surface this list instead.
  function drawElementsOnly(ctx, label, opts) {
    ctx.save();
    ctx.fillStyle = '#ffffff';
    ctx.fillRect(0, 0, label.settings.widthDots, label.settings.heightDots);
    ctx.restore();

    const failures = [];
    label.elements.forEach(function (el) {
      try {
        if (el.type === 'box') drawBoxElement(ctx, el);
        else if (el.type === 'circle') drawCircleElement(ctx, el);
        else if (el.type === 'line') drawLineElement(ctx, el);
        else if (el.type === 'ellipse') drawEllipseElement(ctx, el);
        else if (el.type === 'graphic') drawGraphicElement(ctx, el, getBounds(el, opts));
        // drawBarcodeElement only reads `b` for the placeholder-rendered 2D
        // symbologies (Data Matrix/Aztec/MaxiCode) - every other symbology
        // computes its own draw height independently, so skip the
        // getBounds() call (barcode-encode + module-count) for the common
        // case rather than computing and discarding it every frame.
        else if (el.type === 'barcode') {
          const needsBounds = el.barcodeType === 'datamatrix' || el.barcodeType === 'aztec' || el.barcodeType === 'maxicode';
          drawBarcodeElement(ctx, el, needsBounds ? getBounds(el, opts) : null, opts);
        }
        else if (el.type === 'text') drawTextElement(ctx, el, opts);
      } catch (e) {
        // A broken element should never take down the whole preview.
        console.warn('render error for element', el.id, e);
        failures.push({ id: el.id, type: el.type, error: e });
      }
    });
    return failures;
  }

  global.ZPLRender = {
    ORIENT_RAD: ORIENT_RAD,
    ORIENT_CYCLE: ORIENT_CYCLE,
    EAN_GUARD_EXTENSION_DOTS: EAN_GUARD_EXTENSION_DOTS,
    rotatedCorners: rotatedCorners,
    getOrientation: getOrientation,
    isUnrotatedType: isUnrotatedType,
    elementSupportsOrientation: elementSupportsOrientation,
    isFreeResizable: isFreeResizable,
    isPlaceholderOnlyBarcode: isPlaceholderOnlyBarcode,
    estimateDataMatrixModules: estimateDataMatrixModules,
    stripBarcodeControlPrefix: stripBarcodeControlPrefix,
    fontFamilyForId: fontFamilyForId,
    fontDeclaration: fontDeclaration,
    ZEBRA_FONT0_DASH_HEIGHT_RATIO: ZEBRA_FONT0_DASH_HEIGHT_RATIO,
    dashExtraWidth: dashExtraWidth,
    measureTextWidth: measureTextWidth,
    textWidthScale: textWidthScale,
    barcodeModuleWidth: barcodeModuleWidth,
    barcodeRatio: barcodeRatio,
    barcodeEncode: barcodeEncode,
    dataMatrixWH: dataMatrixWH,
    aztecWH: aztecWH,
    maxicodeWH: maxicodeWH,
    elementLocalSize: elementLocalSize,
    getBounds: getBounds,
    getLocalBounds: getLocalBounds,
    getWorldCorners: getWorldCorners,
    getAABB: getAABB,
    inspectRasterOutput: inspectRasterOutput,
    elementAABBAt: elementAABBAt,
    roundedRectPath: roundedRectPath,
    drawGraphicElement: drawGraphicElement,
    drawBoxElement: drawBoxElement,
    drawCircleElement: drawCircleElement,
    drawEllipseElement: drawEllipseElement,
    drawLineElement: drawLineElement,
    drawBarcodePlaceholder2D: drawBarcodePlaceholder2D,
    EAN_OUTSIDE_DIGIT_GAP_DOTS: EAN_OUTSIDE_DIGIT_GAP_DOTS,
    drawEanUpcInterpretation: drawEanUpcInterpretation,
    drawBarcodeElement: drawBarcodeElement,
    fillTextCorrected: fillTextCorrected,
    wrapText: wrapText,
    wrapTextCached: wrapTextCached,
    drawTextElement: drawTextElement,
    drawElementsOnly: drawElementsOnly,
  };
  if (typeof module === 'object' && module && module.exports) module.exports = global.ZPLRender;
})(typeof globalThis !== 'undefined' ? globalThis : this);
