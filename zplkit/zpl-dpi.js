/* ZPLkit — DPI resolution helpers and label DPI conversion.

   A ZPL label carries no resolution of its own: every coordinate, font
   height, bar height and graphic pixel in it is a printer DOT. The same file
   printed on a 203 dpi and on a 300 dpi printhead therefore comes out at two
   different physical sizes - roughly 8.5 x 5.5 cm becomes 5.7 x 3.7 cm. That
   makes "switch this label to another printer resolution" a conversion of
   every dot value in the model, not a metadata change.

   This module is the pure math + model-walk half of that (no DOM, no canvas),
   so it can be unit-tested and reused outside the editor. The one thing it
   cannot do itself is re-rasterize an embedded monochrome bitmap (^GF/~DG),
   which needs an image scaler: for those it hands the caller a list of
   resample tasks with the target pixel sizes and leaves the bits untouched.

   Depends on ZPLModel only (MAX_LABEL_DOTS, BARCODE_TYPES). */
(function (global) {
  'use strict';

  const M = global.ZPLModel;

  // Zebra printheads are specified in whole dots per MILLIMETRE; the "dpi"
  // numbers printed on the datasheet are rounded labels for those. 8 dots/mm
  // is exactly 203.2 dpi (sold as "203 dpi", older documentation and many
  // ERP systems say "200 dpi"), 12 dots/mm is exactly 304.8 dpi ("300 dpi"),
  // 24 dots/mm is 609.6 dpi ("600 dpi").
  //
  // This distinction is the whole reason this table exists rather than just
  // dividing the two dpi numbers: the physically correct 8 -> 12 dots/mm
  // factor is EXACTLY 1.5, while a naive 300/203 gives 1.4778 and would
  // shrink every converted label by ~1.5% - about 1.3 mm across a 8.5 cm
  // label, enough to push a barcode into the die-cut edge.
  //
  // `aliases` lists the nominal dpi values seen in the wild for each
  // printhead (203 and 200 are the same printer), so a label that declares
  // "200 dpi" is recognized as 8 dots/mm rather than falling through to the
  // generic dpi/25.4 path.
  const PRESETS = [
    { dpi: 152, dpmm: 6, aliases: [150, 152, 153], label: '152 dpi (6 Punkte/mm)' },
    { dpi: 203, dpmm: 8, aliases: [200, 203, 204], label: '203 dpi (8 Punkte/mm)' },
    { dpi: 300, dpmm: 12, aliases: [300, 304, 305], label: '300 dpi (12 Punkte/mm)' },
    { dpi: 600, dpmm: 24, aliases: [600, 609, 610], label: '600 dpi (24 Punkte/mm)' },
  ];

  const MM_PER_INCH = 25.4;

  function presetFor(dpi) {
    const n = Math.round(Number(dpi));
    if (!isFinite(n)) return null;
    for (let i = 0; i < PRESETS.length; i++) {
      if (PRESETS[i].aliases.indexOf(n) !== -1) return PRESETS[i];
    }
    return null;
  }

  // Exact dots per millimetre for a nominal dpi value: the printhead's own
  // whole-number dpmm when this is a known resolution, otherwise the plain
  // dpi/25.4 (a custom/simulated resolution has no printhead to be exact
  // about).
  function dpmmFor(dpi) {
    const preset = presetFor(dpi);
    if (preset) return preset.dpmm;
    const n = Number(dpi);
    return (isFinite(n) && n > 0 ? n : 203) / MM_PER_INCH;
  }

  // True when both resolutions are real printhead resolutions, i.e. the
  // conversion factor between them is the exact dpmm ratio and not an
  // approximation derived from rounded dpi labels.
  function isExactPair(fromDpi, toDpi) {
    return !!(presetFor(fromDpi) && presetFor(toDpi));
  }

  function scaleFactor(fromDpi, toDpi) {
    const from = dpmmFor(fromDpi);
    const to = dpmmFor(toDpi);
    if (!(from > 0)) return 1;
    return to / from;
  }

  function dotsToMm(dots, dpi) { return Number(dots) / dpmmFor(dpi); }
  function mmToDots(mm, dpi) { return Number(mm) * dpmmFor(dpi); }
  function dotsToInch(dots, dpi) { return dotsToMm(dots, dpi) / MM_PER_INCH; }
  function inchToDots(inch, dpi) { return mmToDots(Number(inch) * MM_PER_INCH, dpi); }

  // The public Labelary render API addresses printers by whole dots/mm
  // (6/8/12/24dpmm), not by dpi - map to the nearest one it actually offers.
  function labelaryDpmm(dpi) {
    const preset = presetFor(dpi);
    if (preset) return preset.dpmm;
    const raw = dpmmFor(dpi);
    return PRESETS.reduce(function (best, p) {
      return Math.abs(p.dpmm - raw) < Math.abs(best - raw) ? p.dpmm : best;
    }, PRESETS[0].dpmm);
  }

  // A printer DPI implied by a file name, for the `.200zpl`/`.300zpl`
  // convention (a plain `.zpl`/`.txt`/`.prn` says nothing and returns null).
  // Deliberately NOT a guess from the label's dimensions: this is only the
  // resolution the file itself states in its own name.
  function dpiFromFileName(name) {
    const m = /\.(\d{3})zpl$/i.exec(String(name || ''));
    if (!m) return null;
    const declared = parseInt(m[1], 10);
    const preset = presetFor(declared);
    return preset ? preset.dpi : declared;
  }

  // The number a `.NNNzpl` file name uses for a resolution - the nominal
  // label the convention actually writes (".200zpl" for the 8 dots/mm head,
  // not ".203zpl"), so a converted label can be saved under a name that no
  // longer contradicts its content. null for a resolution the convention has
  // no established name for.
  function fileNameDpiTag(dpi) {
    const preset = presetFor(dpi);
    return preset ? String(preset.aliases[0]) : null;
  }

  // Rewrites a `.NNNzpl` extension to match `dpi`, or returns the name
  // unchanged when it carries no resolution in the first place (a plain
  // `.zpl` makes no claim, so there is nothing to correct).
  function renameForDpi(name, dpi) {
    const str = String(name || '');
    if (!/\.\d{3}zpl$/i.test(str)) return str;
    const tag = fileNameDpiTag(dpi);
    if (!tag) return str;
    return str.replace(/\.\d{3}zpl$/i, '.' + tag + 'zpl');
  }

  // ---------------------------------------------------------------------
  // Value scaling
  //
  // Each kind exists because ZPL treats these numbers differently, and
  // rounding them all the same way would produce invalid commands:
  //   'length'   a size in dots that must stay >= 1 (a 0-dot bar height or
  //              line thickness prints nothing)
  //   'optional' a size in dots where 0 means "automatic" (^A's width, ^FB's
  //              spacing) - 0 must survive as 0, not become 1
  //   'coord'    a position/offset, may legitimately be 0 or negative
  //   'step'     an integer 1..10 step counter (^BY module width, ^XG and
  //              Aztec magnification): scaled, then clamped to the range the
  //              printer accepts
  // ---------------------------------------------------------------------
  const STEP_MIN = 1;
  const STEP_MAX = 10;

  function scaleValue(value, kind, factor) {
    const n = Number(value);
    if (!isFinite(n)) return { value: value, clamped: false };
    if (kind === 'coord') return { value: Math.round(n * factor), clamped: false };
    if (kind === 'optional' && n === 0) return { value: 0, clamped: false };
    if (kind === 'step') {
      const scaled = Math.round(n * factor);
      const clampedValue = Math.max(STEP_MIN, Math.min(STEP_MAX, scaled));
      return { value: clampedValue, clamped: clampedValue !== scaled, wanted: scaled };
    }
    return { value: Math.max(1, Math.round(n * factor)), clamped: false };
  }

  // How each barcode type's own size parameters behave under a DPI change.
  // ^BY's module width applies to all of them, but the per-symbology
  // parameters differ in meaning: for the 1D types `height` IS the bar height
  // in dots, for Data Matrix it is the module (single cell) size, Aztec has
  // no height at all and sizes itself through `magnification`, and MaxiCode
  // has a fixed physical size (~1 inch) that no parameter can change - so
  // converting it is correctly a no-op rather than an oversight.
  const BARCODE_SIZE_FIELDS = {
    code128: [{ key: 'height', kind: 'length' }],
    code39: [{ key: 'height', kind: 'length' }],
    itf: [{ key: 'height', kind: 'length' }],
    ean13: [{ key: 'height', kind: 'length' }],
    upca: [{ key: 'height', kind: 'length' }],
    datamatrix: [{ key: 'height', kind: 'length' }],
    // QR sizes itself through ^BQ's magnification (module size in dots),
    // exactly like Aztec - it has no `height` parameter at all, so the
    // generic fallback below would look for one, find nothing, and leave a
    // converted QR at its old physical size without saying a word.
    qrcode: [{ key: 'magnification', kind: 'step' }],
    aztec: [{ key: 'magnification', kind: 'step' }],
    maxicode: [],
  };

  function barcodeSizeFields(barcodeType) {
    if (Object.prototype.hasOwnProperty.call(BARCODE_SIZE_FIELDS, barcodeType)) {
      return BARCODE_SIZE_FIELDS[barcodeType];
    }
    // Unknown/newly added symbology: assume the common "^B?'s second
    // parameter is a dot height" shape rather than silently leaving it alone.
    return [{ key: 'height', kind: 'length' }];
  }

  const DEFAULT_OPTIONS = {
    label: true,      // ^PW/^LL, ^LH, ^LS
    elements: true,   // every element's position and its geometry (^GB/^GC/^GD/^GE, graphic placement)
    fonts: true,      // ^A character height/width
    barcodes: true,   // ^BY module width and the per-symbology size parameters
    graphics: true,   // re-rasterize embedded ^GF/~DG bitmaps (needs a caller-side image scaler)
  };

  function resolveOptions(options) {
    const out = {};
    Object.keys(DEFAULT_OPTIONS).forEach(function (key) {
      out[key] = options && Object.prototype.hasOwnProperty.call(options, key) ? !!options[key] : DEFAULT_OPTIONS[key];
    });
    return out;
  }

  function fmtPair(a, b) { return a + ' × ' + b; }

  /* Converts every dot value in `label` from one printer resolution to
     another so the label keeps its PHYSICAL size, and reports what that did.

     Mutates `label` in place unless options.dryRun is set - the editor calls
     it directly on its live model (its undo history takes a snapshot around
     the call), while the confirmation dialog calls it with dryRun to show the
     resulting numbers and warnings before anything changes.

     Embedded bitmaps are NOT touched here: rescaling packed monochrome bits
     needs an image scaler (a canvas in the browser), so each one becomes an
     entry in report.graphicTasks with the target pixel size for the caller
     to apply. Their x/y placement is converted normally either way.

     Returns a report:
       { fromDpi, toDpi, fromDpmm, toDpmm, factor, exact, options,
         physical: {widthMM, heightMM}, roundingErrorMM,
         changes: [{key, label, from, to, unit}], counts: {...},
         warnings: [{code, params, text}], graphicTasks: [...] }

     Every `changes` row and every warning carries a stable `key`/`code` plus
     the `params` its wording needs, next to a ready-made German sentence.
     A standalone consumer can print `label`/`text` as-is; a localized UI
     (ZPL-Studio) translates by key and only falls back to the German. That
     is also why `from`/`to` are bare numbers with a separate `unit` field
     rather than pre-joined strings - the unit word and the decimal separator
     belong to whoever renders them.                                        */
  function convertLabel(label, fromDpi, toDpi, options) {
    const opts = resolveOptions(options);
    const dryRun = !!(options && options.dryRun);
    const fromDpmm = dpmmFor(fromDpi);
    const toDpmm = dpmmFor(toDpi);
    const factor = scaleFactor(fromDpi, toDpi);
    const settings = (label && label.settings) || {};

    const report = {
      fromDpi: Number(fromDpi),
      toDpi: Number(toDpi),
      fromDpmm: fromDpmm,
      toDpmm: toDpmm,
      factor: factor,
      exact: isExactPair(fromDpi, toDpi),
      options: opts,
      physical: {
        widthMM: dotsToMm(settings.widthDots || 0, fromDpi),
        heightMM: dotsToMm(settings.heightDots || 0, fromDpi),
      },
      // Every converted value lands on a whole dot, so each one can be off
      // by up to half a dot at the TARGET resolution - the honest upper
      // bound on what this conversion costs in precision.
      roundingErrorMM: 0.5 / toDpmm,
      changes: [],
      counts: { elements: 0, text: 0, barcode: 0, graphic: 0, shape: 0, raw: 0, skipped: 0 },
      warnings: [],
      graphicTasks: [],
    };

    function warn(code, text, params) {
      if (!report.warnings.some(function (w) { return w.code === code; })) {
        report.warnings.push({ code: code, params: params || {}, text: text });
      }
    }
    function change(key, label, from, to, unit) {
      report.changes.push({ key: key, label: label, from: from, to: to, unit: unit || 'dots' });
    }

    if (factor === 1) {
      return report; // same printhead resolution - nothing to convert
    }

    // --- Label frame -------------------------------------------------------
    // Captured before anything is written back: the "did this element get
    // pushed off the label" check below needs the ORIGINAL frame, which the
    // non-dry-run path is about to overwrite.
    const origWidth = settings.widthDots || 0;
    const origHeight = settings.heightDots || 0;
    const newWidth = Math.min(M.MAX_LABEL_DOTS, Math.max(1, Math.round(origWidth * factor)));
    const newHeight = Math.min(M.MAX_LABEL_DOTS, Math.max(1, Math.round(origHeight * factor)));
    if (opts.label) {
      change('label-size', 'Etikettengröße (^PW/^LL)', fmtPair(origWidth, origHeight), fmtPair(newWidth, newHeight));
      if (Math.round(origWidth * factor) > M.MAX_LABEL_DOTS || Math.round(origHeight * factor) > M.MAX_LABEL_DOTS) {
        warn('label-clamped', 'Die umgerechnete Etikettengröße überschreitet das Maximum von ' + M.MAX_LABEL_DOTS + ' Dots und wurde begrenzt.', { max: M.MAX_LABEL_DOTS });
      }
      if (settings.homeX || settings.homeY) {
        const hx = scaleValue(settings.homeX, 'coord', factor).value;
        const hy = scaleValue(settings.homeY, 'coord', factor).value;
        change('home-offset', 'Home-Offset (^LH)', settings.homeX + ', ' + settings.homeY, hx + ', ' + hy);
        if (!dryRun) { settings.homeX = hx; settings.homeY = hy; }
      }
      if (settings.labelShiftY) {
        const ls = scaleValue(settings.labelShiftY, 'coord', factor).value;
        change('label-shift', 'Label-Verschiebung (^LS)', String(settings.labelShiftY), String(ls));
        if (!dryRun) settings.labelShiftY = ls;
      }
      if (!dryRun) { settings.widthDots = newWidth; settings.heightDots = newHeight; }
    }

    // --- ^BY defaults carried by the label itself ---------------------------
    if (opts.barcodes && label && label.byState) {
      const by = label.byState;
      const mw = scaleValue(by.moduleWidth, 'step', factor);
      const bh = scaleValue(by.height, 'length', factor);
      if (!dryRun) { by.moduleWidth = mw.value; by.height = bh.value; }
      if (mw.clamped) warn('by-module-clamped', 'Die Vorgabe-Modulbreite (^BY) konnte nicht vollständig umgerechnet werden – ZPL erlaubt nur 1–10 Dots.');
    }

    // --- Elements ----------------------------------------------------------
    const elements = (label && label.elements) || [];
    const barcodeHeights = [];
    const fontHeights = [];
    let bitmapFontCount = 0;
    let outsideCount = 0;
    const boundsW = opts.label ? newWidth : origWidth;
    const boundsH = opts.label ? newHeight : origHeight;

    elements.forEach(function (el) {
      report.counts.elements++;
      if (el.type === 'raw') { report.counts.raw++; return; }

      if (opts.elements) {
        const nx = scaleValue(el.x, 'coord', factor).value;
        const ny = scaleValue(el.y, 'coord', factor).value;
        // Only elements the conversion PUSHES off the label are worth a
        // warning. One that already sat outside stays outside at any
        // resolution - reporting that here would blame the conversion for a
        // pre-existing state of the label.
        const wasInside = !origWidth || !origHeight || (el.x <= origWidth && el.y <= origHeight);
        if (!dryRun) { el.x = nx; el.y = ny; }
        if (wasInside && boundsW && boundsH && (nx > boundsW || ny > boundsH)) outsideCount++;
      }

      if (el.type === 'text') {
        report.counts.text++;
        if (el.font && el.font !== '0') bitmapFontCount++;
        if (opts.fonts) {
          const h = scaleValue(el.height, 'length', factor);
          const w = scaleValue(el.width, 'optional', factor);
          fontHeights.push({ from: el.height, to: h.value });
          if (!dryRun) { el.height = h.value; el.width = w.value; }
        }
        if (opts.elements && el.fieldBlock) {
          const fb = el.fieldBlock;
          const fbW = scaleValue(fb.widthDots, 'length', factor).value;
          const fbSpacing = scaleValue(fb.lineSpacing, 'optional', factor).value;
          const fbIndent = scaleValue(fb.hangingIndent, 'optional', factor).value;
          if (!dryRun) { fb.widthDots = fbW; fb.lineSpacing = fbSpacing; fb.hangingIndent = fbIndent; }
        }
        return;
      }

      if (el.type === 'barcode') {
        report.counts.barcode++;
        if (opts.barcodes) {
          const mw = scaleValue(el.moduleWidth, 'step', factor);
          if (mw.clamped) {
            warn('module-clamped', 'Mindestens eine Barcode-Modulbreite ließ sich nicht umrechnen: ZPL erlaubt nur 1–10 Dots (gewünscht: ' +
              mw.wanted + '). Der Barcode wird dadurch schmaler oder breiter als das Original.', { wanted: mw.wanted });
          }
          if (!dryRun) el.moduleWidth = mw.value;
          const params = el.params || {};
          barcodeSizeFields(el.barcodeType).forEach(function (f) {
            if (params[f.key] == null) return;
            const scaled = scaleValue(params[f.key], f.kind, factor);
            if (f.key === 'height' && f.kind === 'length') barcodeHeights.push({ from: params[f.key], to: scaled.value });
            if (scaled.clamped) {
              warn('barcode-step-clamped', 'Mindestens ein 2D-Code (QR oder Aztec) konnte nicht vollständig umgerechnet werden – seine Vergrößerung ist auf 1–10 begrenzt.');
            }
            if (!dryRun) params[f.key] = scaled.value;
          });
          if (el.barcodeType === 'maxicode') {
            warn('maxicode-fixed', 'MaxiCode hat eine feste physische Größe (~1 Zoll) und wird nicht mitskaliert – nur seine Position.');
          }
        }
        return;
      }

      if (el.type === 'graphic') {
        report.counts.graphic++;
        if (!opts.graphics) {
          warn('graphics-skipped', 'Grafiken wurden nicht neu berechnet: sie behalten ihre Pixelmaße und ändern damit ihre gedruckte Größe.');
          return;
        }
        if (el.storedName) {
          // A ^XG placement is sized by the STORE's bitmap plus integer
          // magnification factors. Rescaling the stored bitmap (below, via
          // graphicTasks) keeps magX/magY meaningful and avoids clamping a
          // 1..10 factor - so nothing to do on the element itself here
          // beyond the position already converted above.
          return;
        }
        const srcW = el.displayWidthPx != null ? el.displayWidthPx : el.widthPx;
        const srcH = el.displayHeightPx != null ? el.displayHeightPx : el.heightPx;
        if (!srcW || !srcH) { report.counts.skipped++; return; }
        const targetW = Math.max(2, Math.round(srcW * factor));
        const targetH = Math.max(2, Math.round(srcH * factor));
        report.graphicTasks.push({ kind: 'inline', element: el, fromWidthPx: srcW, fromHeightPx: srcH, targetWidthPx: targetW, targetHeightPx: targetH });
        return;
      }

      // box / circle / line / ellipse
      report.counts.shape++;
      if (!opts.elements) return;
      const fields = el.type === 'circle'
        ? [['diameter', 'length'], ['thickness', 'length']]
        : [['widthDots', 'length'], ['heightDots', 'length'], ['thickness', 'length']];
      fields.forEach(function (pair) {
        if (el[pair[0]] == null) return;
        const scaled = scaleValue(el[pair[0]], pair[1], factor);
        if (!dryRun) el[pair[0]] = scaled.value;
      });
    });

    // --- Stored graphics (~DG) ---------------------------------------------
    const stored = (label && label.storedGraphics) || {};
    if (opts.graphics) {
      Object.keys(stored).forEach(function (name) {
        const entry = stored[name];
        if (!entry || !entry.widthPx || !entry.heightPx) return;
        report.graphicTasks.push({
          kind: 'stored', name: name, entry: entry,
          fromWidthPx: entry.widthPx, fromHeightPx: entry.heightPx,
          targetWidthPx: Math.max(2, Math.round(entry.widthPx * factor)),
          targetHeightPx: Math.max(2, Math.round(entry.heightPx * factor)),
        });
      });
    }

    // --- Summary rows for the dialog ---------------------------------------
    if (fontHeights.length) {
      change('font-heights', 'Schrifthöhen (^A)', summarizeRange(fontHeights, 'from'), summarizeRange(fontHeights, 'to'));
    }
    if (barcodeHeights.length) {
      change('barcode-heights', 'Barcode-Höhen (^B)', summarizeRange(barcodeHeights, 'from'), summarizeRange(barcodeHeights, 'to'));
    }
    if (report.graphicTasks.length) {
      // One representative row rather than one per graphic: they all scale by
      // the same factor, and a logo-heavy label would otherwise bury the
      // rows that differ.
      const first = report.graphicTasks[0];
      const more = report.graphicTasks.length > 1 ? ' …' : '';
      const row = { key: 'graphics', label: 'Grafiken (' + report.graphicTasks.length + ')',
        from: fmtPair(first.fromWidthPx, first.fromHeightPx) + more,
        to: fmtPair(first.targetWidthPx, first.targetHeightPx) + more,
        unit: 'px', params: { count: report.graphicTasks.length } };
      report.changes.push(row);
    }

    // --- Warnings that are about the label as a whole ----------------------
    if (!report.exact) {
      warn('inexact-dpi', 'Mindestens eine der beiden Auflösungen ist keine übliche Zebra-Druckkopfauflösung (152/203/300/600 dpi). ' +
        'Der Faktor wird aus dpi/25,4 berechnet und trifft die physische Größe nur ungefähr.');
    }
    if (bitmapFontCount) {
      warn('bitmap-fonts', bitmapFontCount + ' Textfeld(er) verwenden eine Bitmap-Schrift (A–H, P–V). Diese Schriften haben feste Zeichenmatrizen; ' +
        'der Drucker rundet die umgerechnete Höhe auf das nächste ganzzahlige Vielfache – die Textgröße kann leicht abweichen. ' +
        'Die skalierbare Schrift 0 ist von dieser Einschränkung nicht betroffen.', { count: bitmapFontCount });
    }
    if (label && label.preamble) {
      warn('preamble', 'Diese Datei enthält einen Treiber-Vorspann. Er wird unverändert übernommen und kann eigene, jetzt nicht mehr passende Auflösungsangaben enthalten.');
    }
    if (label && label.rawTail && label.rawTail.length) {
      warn('raw-tail', label.rawTail.length + ' nicht abgebildete(r) ZPL-Befehl(e) bleiben unverändert. Enthalten sie Dot-Werte, müssen sie im Tab „ZPL-Code“ von Hand angepasst werden.', { count: label.rawTail.length });
    }
    if (outsideCount) {
      warn('outside', outsideCount + ' Element(e) liegen nach der Umrechnung außerhalb des Etiketts. Etikettengröße mitumrechnen oder Positionen prüfen.', { count: outsideCount });
    }
    if (report.graphicTasks.length && factor > 1) {
      warn('graphics-upscaled', 'Grafiken werden hochskaliert und neu gerastert. Aus einer kleinen Vorlage kann kein Detail entstehen, das nicht schon vorhanden war – für Logos ist ein erneuter Import der Originaldatei besser.');
    }

    return report;
  }

  function summarizeRange(items, key) {
    const values = items.map(function (i) { return Number(i[key]); }).filter(function (v) { return isFinite(v); });
    if (!values.length) return '–';
    const min = Math.min.apply(null, values);
    const max = Math.max.apply(null, values);
    return min === max ? String(min) : (min + '–' + max);
  }

  global.ZPLDpi = {
    PRESETS: PRESETS,
    MM_PER_INCH: MM_PER_INCH,
    STEP_MIN: STEP_MIN,
    STEP_MAX: STEP_MAX,
    presetFor: presetFor,
    dpmmFor: dpmmFor,
    isExactPair: isExactPair,
    scaleFactor: scaleFactor,
    dotsToMm: dotsToMm,
    mmToDots: mmToDots,
    dotsToInch: dotsToInch,
    inchToDots: inchToDots,
    labelaryDpmm: labelaryDpmm,
    dpiFromFileName: dpiFromFileName,
    fileNameDpiTag: fileNameDpiTag,
    renameForDpi: renameForDpi,
    scaleValue: scaleValue,
    barcodeSizeFields: barcodeSizeFields,
    convertLabel: convertLabel,
  };
})(typeof globalThis !== 'undefined' ? globalThis : this);
