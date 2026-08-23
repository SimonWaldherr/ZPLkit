/* ZPLkit label-sheets -- geometry for printing many labels onto one physical
 * A4 sheet.
 *
 * This is pure geometry/data, no rendering: given a sheet layout (either a
 * built-in PRESET or a hand-entered custom grid), computeSlots() returns the
 * millimeter position/size of every physical label position on one page, in
 * left-to-right, top-to-bottom order. The mail-merge UI (app.js) rasterizes
 * each row's label and places it into these slots.
 *
 * A sheet's nominal label size and its actual grid pitch can differ slightly.
 * The built-in layouts keep both values explicitly, and the mail-merge
 * renderer fits a label into its slot while preserving its aspect ratio.
 *
 * No external dependencies -- plain <script> tag, attaches window.LabelSheets.
 */
(function (global) {
  'use strict';

  var PAGE_SIZES = {
    A4: { widthMM: 210, heightMM: 297 }
  };

  // Every preset assumes row-major slot order (left-to-right, then top-to-
  // bottom) and a grid with constant pitch -- true of every real label sheet
  // product below (none of them stagger rows/columns).
  var PRESETS = [
    {
      id: 'a4-70x37-24', name: '70 × 37 mm · 24 / A4', page: 'A4',
      cols: 3, rows: 8, labelWidthMM: 70, labelHeightMM: 37,
      marginLeftMM: 0, marginTopMM: 0, pitchXMM: 70, pitchYMM: 37,
      note: 'Universal-Etiketten, 24 St./Bogen, randlos (kein Rand/Abstand).'
    },
    {
      id: 'a4-70x36-24', name: '70 × 36 mm · 24 / A4', page: 'A4',
      cols: 3, rows: 8, labelWidthMM: 70, labelHeightMM: 36,
      marginLeftMM: 0, marginTopMM: 4.4, pitchXMM: 70, pitchYMM: 36,
      note: 'Universal-Etiketten, 24 St./Bogen.'
    },
    {
      id: 'a4-105x41-14', name: '105 × 41 mm · 14 / A4', page: 'A4',
      cols: 2, rows: 7, labelWidthMM: 105, labelHeightMM: 41,
      marginLeftMM: 0, marginTopMM: 4.9, pitchXMM: 105, pitchYMM: 41,
      note: 'Adress-Etiketten, 14 St./Bogen.'
    },
    {
      id: 'a4-52x29_5-40', name: '52 × 29,5 mm · 40 / A4', page: 'A4',
      cols: 4, rows: 10, labelWidthMM: 52, labelHeightMM: 29.5,
      marginLeftMM: 1, marginTopMM: 1, pitchXMM: 52, pitchYMM: 29.5,
      note: 'Kleinformat-Etiketten, 40 St./Bogen.'
    },
    {
      id: 'a4-63_5x38_1-21', name: '63,5 × 38,1 mm · 21 / A4', page: 'A4',
      cols: 3, rows: 7, labelWidthMM: 63.5, labelHeightMM: 38.1,
      marginLeftMM: 7.5, marginTopMM: 15.5, pitchXMM: 66, pitchYMM: 38.1,
      note: 'Adress-/Versandetiketten, 21 St./Bogen.'
    },
    {
      id: 'a4-63_5x46_6-18', name: '63,5 × 46,6 mm · 18 / A4', page: 'A4',
      cols: 3, rows: 6, labelWidthMM: 63.5, labelHeightMM: 46.6,
      marginLeftMM: 7.4, marginTopMM: 8.1, pitchXMM: 65.9, pitchYMM: 46.6,
      note: 'Versandetiketten, 18 St./Bogen.'
    },
    {
      id: 'a4-99_1x38_1-14', name: '99,1 × 38,1 mm · 14 / A4', page: 'A4',
      cols: 2, rows: 7, labelWidthMM: 99.1, labelHeightMM: 38.1,
      marginLeftMM: 3.4, marginTopMM: 15.2, pitchXMM: 103, pitchYMM: 38.1,
      note: 'Versandetiketten, 14 St./Bogen.'
    },
    {
      id: 'a4-99_1x67_7-8', name: '99,1 × 67,7 mm · 8 / A4', page: 'A4',
      cols: 2, rows: 4, labelWidthMM: 99.1, labelHeightMM: 67.7,
      marginLeftMM: 4.7, marginTopMM: 13, pitchXMM: 101.7, pitchYMM: 67.7,
      note: 'Große Adress-/Versandetiketten, 8 St./Bogen.'
    },
    {
      id: 'custom', name: 'Eigene Maße…', page: 'A4',
      cols: 3, rows: 8, labelWidthMM: 70, labelHeightMM: 37,
      marginLeftMM: 0, marginTopMM: 0, gapXMM: 0, gapYMM: 0,
      note: 'Frei einstellbares Raster für Bögen, die nicht in der Liste stehen.'
    }
  ];

  function presetById(id) {
    for (var i = 0; i < PRESETS.length; i++) {
      if (PRESETS[i].id === id) return PRESETS[i];
    }
    return null;
  }

  function pageSizeMM(pageId) {
    return PAGE_SIZES[pageId] || PAGE_SIZES.A4;
  }

  // Custom sheets are entered as label-size + gap (the intuitive way to fill
  // out a form: "how big is the label, how much space between them"), while
  // presets already carry the resulting pitch straight from the source
  // template data. Accept either shape here so callers don't have to care
  // which one they're holding: pitch wins if present, else it's derived from
  // labelSize + gap (gap defaults to 0, i.e. edge-to-edge).
  function resolvedPitch(cfg) {
    var pitchXMM = cfg.pitchXMM != null ? cfg.pitchXMM : (cfg.labelWidthMM + (cfg.gapXMM || 0));
    var pitchYMM = cfg.pitchYMM != null ? cfg.pitchYMM : (cfg.labelHeightMM + (cfg.gapYMM || 0));
    return { pitchXMM: pitchXMM, pitchYMM: pitchYMM };
  }

  // Returns every physical label slot on ONE page, in row-major (left-to-
  // right, top-to-bottom) order -- the order rows from the merge data should
  // be poured into.
  function computeSlots(cfg) {
    var pitch = resolvedPitch(cfg);
    var slots = [];
    for (var r = 0; r < cfg.rows; r++) {
      for (var c = 0; c < cfg.cols; c++) {
        slots.push({
          xMM: cfg.marginLeftMM + c * pitch.pitchXMM,
          yMM: cfg.marginTopMM + r * pitch.pitchYMM,
          widthMM: cfg.labelWidthMM,
          heightMM: cfg.labelHeightMM
        });
      }
    }
    return slots;
  }

  function mmToPx(mm, dpi) {
    return (mm / 25.4) * (dpi || 96);
  }

  global.LabelSheets = {
    PAGE_SIZES: PAGE_SIZES,
    PRESETS: PRESETS,
    presetById: presetById,
    pageSizeMM: pageSizeMM,
    computeSlots: computeSlots,
    mmToPx: mmToPx
  };

})(typeof globalThis !== 'undefined' ? globalThis : this);
