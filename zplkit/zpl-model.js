/* ZPL label editor — shared data model, constants and small helpers.
   Loaded first; everything else (parser, generator, app) depends on window.ZPLModel. */
(function (global) {
  'use strict';

  let uidCounter = 1;
  function uid(prefix) {
    return (prefix || 'el') + '_' + (uidCounter++) + '_' + Math.floor(1e6 * (performance && performance.now ? (performance.now() % 1) : 0.123456));
  }

  function clone(obj) {
    return JSON.parse(JSON.stringify(obj));
  }

  // Zebra built-in font identifiers. '0' is the default scalable font; every
  // other one (A-H, P-V) is a fixed-matrix bitmap font - together the full
  // "15 bitmapped fonts + 1 scalable font" Zebra's own documentation
  // describes as standard-resident on essentially every 203/300/600 dpi ZPL
  // II printer (P-V are absent only on legacy/rare 152 dpi printheads).
  // Dimensions verified against Zebra's official Font Matrices reference
  // (docs.zebra.com ZPL II Programming Guide) - width x height in dots at
  // 203 dpi. Only used to populate a friendly <select>; anything the user
  // types is still accepted verbatim.
  const FONTS = [
    { id: '0', label: '0 – Standard (skalierbar)' },
    { id: 'A', label: 'A – Bitmap 5x9' },
    { id: 'B', label: 'B – Bitmap 7x11 (OCR-ähnlich)' },
    { id: 'C', label: 'C – Bitmap 10x18' },
    { id: 'D', label: 'D – Bitmap 10x18' },
    { id: 'E', label: 'E – OCR-B (15x28)' },
    { id: 'F', label: 'F – Bitmap 13x26' },
    { id: 'G', label: 'G – Bitmap 40x60' },
    { id: 'H', label: 'H – OCR-A (13x21)' },
    { id: 'P', label: 'P – Bitmap 18x20' },
    { id: 'Q', label: 'Q – Bitmap 24x28' },
    { id: 'R', label: 'R – Bitmap 31x35' },
    { id: 'S', label: 'S – Bitmap 35x40' },
    { id: 'T', label: 'T – Bitmap 42x48' },
    { id: 'U', label: 'U – Bitmap 53x59' },
    { id: 'V', label: 'V – Bitmap 71x80' },
  ];

  // Each fixed bitmap font's own native width:height ratio (from the exact
  // dimensions in the FONTS labels above, all width x height at 203 dpi) -
  // unlike scalable font '0', these are NOT close to a generic monospace
  // substitute's proportions, so rendering them with no aspect correction
  // (the behavior whenever a field doesn't override ^A's width) distorts
  // them relative to real printed output.
  //
  // CORRECTED 2026-08: F and G were previously modeled as WIDER than tall
  // (26/13=2.0 and 60/40=1.5) - that was backwards. Cross-checked against
  // Zebra's official Font Matrices table, both are actually TALLER than
  // wide (13x26 and 40x60), same general shape as every other bitmap font
  // here - there is no bitmap font that's wider than tall. B's dimensions
  // were also off (previously 9x15, corrected to the documented 7x11).
  const BITMAP_FONT_ASPECT = {
    A: 5 / 9,
    B: 7 / 11,
    C: 10 / 18,
    D: 10 / 18,
    E: 15 / 28,
    F: 13 / 26,
    G: 40 / 60,
    H: 13 / 21,
    P: 18 / 20,
    Q: 24 / 28,
    R: 31 / 35,
    S: 35 / 40,
    T: 42 / 48,
    U: 53 / 59,
    V: 71 / 80,
  };

  const ORIENTATIONS = [
    { id: 'N', label: 'Normal (0°)' },
    { id: 'R', label: '90° gedreht' },
    { id: 'I', label: '180° gedreht' },
    { id: 'B', label: '270° gedreht' },
  ];

  // Barcode symbologies we understand structurally. `command` is the ZPL mnemonic after ^B.
  // `params` describes the comma-separated parameters IN ORDER exactly as ZPL expects them,
  // so the generator can rebuild "^B<command><p1>,<p2>,..." generically.
  const BARCODE_TYPES = {
    code128: {
      label: 'Code 128', command: 'C',
      params: [
        { key: 'orientation', kind: 'orientation', default: 'N' },
        { key: 'height', kind: 'int', default: 60 },
        { key: 'interpretationLine', kind: 'bool', default: false },
        { key: 'interpretationLineAbove', kind: 'bool', default: false },
        { key: 'checkDigit', kind: 'bool', default: false },
        { key: 'mode', kind: 'enum', options: ['N', 'U', 'A', 'D'], default: 'N' },
      ],
      previewEncoder: 'code128',
    },
    code39: {
      label: 'Code 39', command: '3',
      params: [
        { key: 'orientation', kind: 'orientation', default: 'N' },
        { key: 'checkDigit', kind: 'bool', default: false },
        { key: 'height', kind: 'int', default: 60 },
        { key: 'interpretationLine', kind: 'bool', default: false },
        { key: 'interpretationLineAbove', kind: 'bool', default: false },
      ],
      previewEncoder: 'code39',
    },
    itf: {
      label: 'Interleaved 2 of 5', command: '2',
      params: [
        { key: 'orientation', kind: 'orientation', default: 'N' },
        { key: 'height', kind: 'int', default: 60 },
        { key: 'interpretationLine', kind: 'bool', default: false },
        { key: 'interpretationLineAbove', kind: 'bool', default: false },
        { key: 'checkDigit', kind: 'bool', default: false },
      ],
      previewEncoder: 'itf',
    },
    ean13: {
      label: 'EAN-13', command: 'E',
      params: [
        { key: 'orientation', kind: 'orientation', default: 'N' },
        { key: 'height', kind: 'int', default: 60 },
        { key: 'interpretationLine', kind: 'bool', default: true },
        { key: 'interpretationLineAbove', kind: 'bool', default: false },
      ],
      previewEncoder: 'ean13',
    },
    upca: {
      label: 'UPC-A', command: 'U',
      params: [
        { key: 'orientation', kind: 'orientation', default: 'N' },
        { key: 'height', kind: 'int', default: 60 },
        { key: 'interpretationLine', kind: 'bool', default: true },
        { key: 'interpretationLineAbove', kind: 'bool', default: false },
        { key: 'checkDigit', kind: 'bool', default: true },
      ],
      previewEncoder: 'upca',
    },
    // Data Matrix (2D) - used for GS1/transport-label payloads (confirmed real
    // usage: matlabel*.zpl). No real ECC200 encoder here (Reed-Solomon +
    // module placement is a much larger undertaking) - structurally editable
    // and losslessly round-tripped, rendered as a clearly-labeled placeholder
    // rather than a fake-but-wrong-looking scannable code.
    datamatrix: {
      label: 'Data Matrix (2D)', command: 'X',
      params: [
        { key: 'orientation', kind: 'orientation', default: 'N' },
        { key: 'height', kind: 'int', default: 6 },      // module (dot) size, NOT the symbol's total height
        { key: 'quality', kind: 'int', default: 200 },   // ECC level: 0/50/80/100/140 (older) or 200 (ECC200, standard today)
        { key: 'columns', kind: 'int', default: 0 },     // 0 = automatic
        { key: 'rows', kind: 'int', default: 0 },        // 0 = automatic
        { key: 'format', kind: 'int', default: 1 },      // format id, almost always 1
        { key: 'escapeChar', default: '_' },             // in-data escape character, Zebra's own default for quality 200
        { key: 'aspect', kind: 'int', default: 1 },       // 1=square (default), 2=rectangular (newer firmware)
      ],
      previewEncoder: null,
    },
    // Aztec Code (2D) - real ZPL command is ^B0 (digit zero, not letter O).
    // Same reasoning as Data Matrix: a spec-complete encoder needs a
    // generalized Reed-Solomon engine across four different Galois-field
    // sizes depending on layer count (harder than Data Matrix's single
    // fixed GF(256)), so this is structural-only too - editable/round-trips
    // losslessly, rendered as a clearly-labeled placeholder.
    aztec: {
      label: 'Aztec Code (2D)', command: '0',
      params: [
        { key: 'orientation', kind: 'orientation', default: 'N' },
        { key: 'magnification', kind: 'int', default: 1 },   // module size factor 1-10 (Aztec's only size control - no separate module-width param)
        { key: 'eci', kind: 'bool', default: false },        // Y = ^FD contains embedded Extended Channel Interpretation escapes
        { key: 'errorControl', kind: 'int', default: 0 },    // 0=auto, 1-99=min ECC%, 101-104=compact 1-4 layers, 201-232=full-range 1-32 layers, 300=Aztec "Rune"
        { key: 'menuSymbol', kind: 'bool', default: false }, // Y = this is a reader-program "menu symbol", not a data carrier
        { key: 'appendCount', kind: 'int', default: 1 },     // Structured Append: total symbols in this multi-symbol message (1-26)
        { key: 'appendId', default: '' },                    // Structured Append: optional group ID string (up to 24 chars)
      ],
      previewEncoder: null,
    },
    // MaxiCode (2D) - real ZPL command is ^BD, used for parcel/courier
    // routing. Unlike every other symbology here, it has NO
    // orientation parameter and ^BY has no effect on it - a MaxiCode symbol
    // is always the same fixed physical size (~1 inch square) at a fixed
    // orientation. Its payload structure (a Structured Carrier Message
    // header + free-form secondary message) is carrier-specific and not
    // modeled here - structural-only, same placeholder approach as Data
    // Matrix/Aztec, but even more so given how narrow/carrier-specific its
    // real-world use is (this editor's own real label corpus uses none).
    maxicode: {
      label: 'MaxiCode (2D)', command: 'D',
      params: [
        { key: 'mode', kind: 'int', default: 2 },          // 2=US numeric postal, 3=non-US alphanumeric postal, 4=freeform (no structured header), 5=full EEC, 6=reader-program
        { key: 'symbolNumber', kind: 'int', default: 1 },  // this symbol's number within a Structured Append set (1-8)
        { key: 'totalSymbols', kind: 'int', default: 1 },  // total symbols in that Structured Append set (1-8)
      ],
      previewEncoder: null,
    },
  };
  // Reverse lookup: ZPL command letter (after ^B) -> our type key.
  const BARCODE_COMMAND_TO_TYPE = {};
  Object.keys(BARCODE_TYPES).forEach(function (k) { BARCODE_COMMAND_TO_TYPE[BARCODE_TYPES[k].command] = k; });

  // ^BY's module width is an integer dot count (1..10); its ratio is a
  // tenth-step value (2.0..3.0).  Keeping this normalization next to the
  // model makes the editor, parser, generator and raster renderer agree on
  // the values that a real ZPL printer can actually produce.
  function normalizeBarcodeModuleWidth(value) {
    const n = Number(value);
    return Math.max(1, Math.min(10, Math.round(isFinite(n) ? n : 2)));
  }

  function normalizeBarcodeRatio(value) {
    const n = Number(value);
    return Math.max(2, Math.min(3, Math.round((isFinite(n) ? n : 3) * 10) / 10));
  }

  function defaultLabel() {
    return {
      settings: {
        widthDots: 812,       // ^PW
        heightDots: 1218,     // ^LL
        dpi: 203,             // not a ZPL field itself, just informs the ruler/zoom + new-image export
        homeX: 0, homeY: 0,   // ^LH
        mediaTracking: 'T',   // ^MM (T=tear off, C=cutter, P=peel-off, R=rewind, A=applicator, D=delayed cut)
        printMode: 'N',       // ^PON / ^POI (N=normal, I=invert both axes)
        // ^CI - defaults to UTF-8 (28), matching what this editor actually
        // exports (a .zpl file is always saved as UTF-8 bytes, see app.js's
        // download/Blob code) and what virtually all Zebra firmware from the
        // last 10+ years understands - so German umlauts typed straight into
        // a new label just print correctly with no further setup. A label
        // IMPORTED from a real file keeps whatever ^CI it already declared
        // (see zpl-parser.js) rather than being silently overridden here.
        encoding: '28',
        darkness: null,       // ~SD (0-30), null = leave unspecified
        printSpeed: null,     // ^PR
        labelShiftY: 0,       // ^LS
        note: '',             // free-text version/change note, round-tripped via a "^FXNOTIZ:" comment (ignored by the printer)
        pq: null,             // ^PQ (raw parameter text verbatim, e.g. "1,0,1,Y") - not surfaced in the UI, kept only
                              // so re-generating a label that already stated its own print quantity/pause/replicate/
                              // override values reproduces them exactly instead of silently overwriting them with
                              // this editor's own "no quantity specified" default of "^PQ,,,Y".
      },
      preamble: null,        // raw driver-config frame text (verbatim passthrough), or null
      elements: [],          // ordered array of element nodes (see makeElement)
      rawTail: [],           // top-level commands we don't model structurally but must keep (e.g. RFID/calibration commands), each {raw:string}
      byState: { moduleWidth: 2, ratio: 3.0, height: 60 }, // last ^BY seen while parsing / used as default for new elements
      // Graphics stored once (~DG) and placed by name (^XG), typically a
      // reused company logo. Keyed by the exact name string as written in the
      // file (may include a "device:" memory-location prefix, e.g.
      // "R:SSGFX000.GRF"). Each graphic ELEMENT referencing one of these still
      // carries its own copy of the decoded bits for rendering (see
      // makeGraphic's storedName) - this registry is the source of truth for
      // (re-)generating the ~DG store and the ^ID cleanup frame.
      storedGraphics: {},    // name -> { widthPx, heightPx, bytesPerRow, bits, mode, deleteAfterPrint }
      sourceFileName: null,
    };
  }

  function makeElement(type, extra) {
    const base = {
      id: uid(type),
      type: type,          // 'text' | 'barcode' | 'box' | 'circle' | 'line' | 'ellipse' | 'graphic' | 'raw'
      origin: 'FO',         // 'FO' (top-left) or 'FT' (baseline/typeset)
      x: 20, y: 20,
      hexEscape: false,     // ^FH was set for this field
      hexIndicator: '\\',   // the ^FH indicator character (defaults to backslash per ZPL spec)
      fieldReverse: false,  // ^FR was set for this field (white on black)
      comment: null,
    };
    return Object.assign(base, extra || {});
  }

  function makeText(extra) {
    return makeElement('text', Object.assign({
      font: '0', orientation: 'N', height: 30, width: 0,
      text: 'Text', fieldBlock: null, // fieldBlock: {widthDots, maxLines, lineSpacing, justify} from ^FB
    }, extra));
  }

  function makeBarcode(extra) {
    const barcode = makeElement('barcode', Object.assign({
      barcodeType: 'code128',
      moduleWidth: 2, ratio: 3.0,
      params: clone(BARCODE_TYPES.code128.params.reduce(function (o, p) { o[p.key] = p.default; return o; }, {})),
      data: '123456789',
    }, extra));
    barcode.moduleWidth = normalizeBarcodeModuleWidth(barcode.moduleWidth);
    barcode.ratio = normalizeBarcodeRatio(barcode.ratio);
    return barcode;
  }

  function makeBox(extra) {
    return makeElement('box', Object.assign({
      widthDots: 100, heightDots: 60, thickness: 4, color: 'B', rounding: 0,
    }, extra));
  }

  function makeCircle(extra) {
    return makeElement('circle', Object.assign({
      diameter: 60, thickness: 4, color: 'B',
    }, extra));
  }

  function makeLine(extra) {
    return makeElement('line', Object.assign({
      widthDots: 150, heightDots: 3, thickness: 3, color: 'B', diagonal: 'R', // diagonal: 'R' = "/" (bottom-left to top-right), 'L' = "\" (top-left to bottom-right)
    }, extra));
  }

  function makeEllipse(extra) {
    return makeElement('ellipse', Object.assign({
      widthDots: 100, heightDots: 60, thickness: 4, color: 'B', // ^GE - same shape as ^GB (box) but drawn as an ellipse
    }, extra));
  }

  function makeGraphic(extra) {
    return makeElement('graphic', Object.assign({
      widthPx: 0, heightPx: 0, bytesPerRow: 0,
      bits: null,          // Uint8Array packed monochrome rows (owned by this element)
      compress: true,      // whether to RLE-compress on export
      sourceMode: null,    // 'A' | 'Z64' | 'B' | 'XG' (how it was found in the imported file, informational)
      storedName: null,    // if set, this is a ^XG placement of label.storedGraphics[storedName] rather than an inline ^GF
      magX: 1, magY: 1,    // ^XG magnification factors (integers 1-10), only meaningful when storedName is set
      mono: null,          // {channel,blur,blackPoint,whitePoint,threshold,dither,invert} chosen at import time
                            // (only set for images imported through this editor - null for graphics decoded
                            // straight from a file's ^GF/~DG, which never went through this pipeline at all).
                            // Reused by resampleGraphic (dither/threshold only) so resizing stays consistent.
    }, extra));
  }


  global.ZPLModel = {
    uid: uid,
    clone: clone,
    // Generous cap (~65in at 300dpi) well under real browsers' canvas/GPU
    // texture size limits, so a garbled or hand-edited ^PW/^LL value can't
    // silently blank the whole preview (browsers clamp an oversized canvas to
    // a 0x0 backing store rather than throwing).
    MAX_LABEL_DOTS: 20000,
    // Canonical "barcode height when a field/schema doesn't say otherwise" -
    // referenced instead of the bare literal 60 by app.js's bounds/draw code
    // and zpl-generator.js's ^BY fallback, so all three can't quietly drift
    // apart from what this schema itself declares as code128's default.
    // Looked up by key, not by params[1] - the params array is edited over
    // time like an ordered ZPL-spec mirror, and a positional index would
    // silently start pointing at a different param's default (e.g. a
    // boolean or a letter) the moment code128's param order changes,
    // producing a broken barcode height with no error anywhere.
    DEFAULT_BARCODE_HEIGHT: BARCODE_TYPES.code128.params.find(function (p) { return p.key === 'height'; }).default,
    FONTS: FONTS,
    BITMAP_FONT_ASPECT: BITMAP_FONT_ASPECT,
    ORIENTATIONS: ORIENTATIONS,
    BARCODE_TYPES: BARCODE_TYPES,
    BARCODE_COMMAND_TO_TYPE: BARCODE_COMMAND_TO_TYPE,
    normalizeBarcodeModuleWidth: normalizeBarcodeModuleWidth,
    normalizeBarcodeRatio: normalizeBarcodeRatio,
    defaultLabel: defaultLabel,
    makeElement: makeElement,
    makeText: makeText,
    makeBarcode: makeBarcode,
    makeBox: makeBox,
    makeCircle: makeCircle,
    makeLine: makeLine,
    makeEllipse: makeEllipse,
    makeGraphic: makeGraphic,
  };
})(typeof globalThis !== 'undefined' ? globalThis : this);
