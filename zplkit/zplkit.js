/* ZPLkit — library facade: collects the individual modules (which each
   attach their own global, e.g. ZPLModel/ZPLParser/...) into ONE namespace so
   other tools can embed this code without knowing the internal module split.

   Load LAST, after the modules it aggregates - it reads whatever is present
   rather than requiring all of them, so a consumer who only needs
   parse/generate can include just zpl-model + zpl-parser + zpl-generator +
   this file, and ZPLkit.Barcode/ZPLkit.XLSX/... are simply absent.

   The editor itself does NOT use this facade (it predates it and talks to the
   module globals directly) - this file exists purely for external consumers,
   which is why adding it changes nothing about the editor's behavior. */
(function (global) {
  'use strict';

  // Bumped by hand on a breaking or notable change to the public surface
  // below. Not tied to the editor's own git history - a consumer pinning a
  // copy of a dist/ bundle cares about this API, not about editor UI changes.
  const VERSION = '1.5.0';

  // name-in-namespace -> global the module attaches itself to.
  const MODULES = {
    Sharing: 'ZPLSharing',
    Model: 'ZPLModel',
    Dpi: 'ZPLDpi',
    EditorMetadata: 'ZPLEditorMetadata',
    Parser: 'ZPLParser',
    Generator: 'ZPLGenerator',
    Barcode: 'ZPLBarcode',
    Qr: 'ZPLQr',
    Graphic: 'ZPLGraphic',
    Inflate: 'ZPLInflate',
    Diff: 'ZPLDiff',
    Glossary: 'ZPLGlossary',
    ImageMono: 'ImageMono',
    CSV: 'CSVParser',
    XLSX: 'XLSXParser',
    LabelSheets: 'LabelSheets',
    Render: 'ZPLRender',
    Pdf: 'PdfWriter',
    Gif: 'GifWriter',
    Backend: 'BackendClient',
  };

  const ZPLkit = { version: VERSION };
  const loaded = [];
  Object.keys(MODULES).forEach(function (key) {
    const mod = global[MODULES[key]];
    if (mod) { ZPLkit[key] = mod; loaded.push(key); }
  });
  // Lets a consumer assert what it actually got instead of discovering a
  // missing module later via a TypeError deep in a call.
  ZPLkit.modules = loaded;

  // --- Convenience wrappers -------------------------------------------------
  // The two calls virtually every consumer makes, so the common case is
  // ZPLkit.parse(text) / ZPLkit.generate(label) rather than reaching into the
  // sub-namespaces. Anything beyond this stays explicit
  // (ZPLkit.Barcode.code128 etc.) instead of growing a second,
  // half-complete API surface.
  //
  // The explicit checks matter for the "lite" bundle (see
  // tools/bundle-lib.go), which deliberately ships without several modules -
  // a clear "module X is not loaded" beats a TypeError on undefined.
  ZPLkit.parse = function (text) {
    if (!ZPLkit.Parser) throw new Error('ZPLkit.parse: zpl-parser.js is not loaded');
    return ZPLkit.Parser.parseZPL(text);
  };
  ZPLkit.generate = function (label, options) {
    if (!ZPLkit.Generator) throw new Error('ZPLkit.generate: zpl-generator.js is not loaded');
    return ZPLkit.Generator.generateZPL(label, options);
  };
  ZPLkit.emptyLabel = function () {
    if (!ZPLkit.Model) throw new Error('ZPLkit.emptyLabel: zpl-model.js is not loaded');
    return ZPLkit.Model.defaultLabel();
  };
  // Rescales every dot value in `label` from one printer resolution to
  // another so it keeps its physical size, and returns a report of what
  // changed (see zpl-dpi.js). Mutates the label unless options.dryRun is
  // set. Embedded ^GF/~DG bitmaps are NOT rescaled here - rasterizing needs
  // an image scaler, so they come back as report.graphicTasks for the caller
  // to apply (ZPL-Studio does this with a canvas).
  ZPLkit.convertDpi = function (label, fromDpi, toDpi, options) {
    if (!ZPLkit.Dpi) throw new Error('ZPLkit.convertDpi: zpl-dpi.js is not loaded');
    return ZPLkit.Dpi.convertLabel(label, fromDpi, toDpi, options);
  };

  global.ZPLkit = ZPLkit;
  // CommonJS consumers (require('./zplkit-full.js')) get the namespace as the
  // module value; the global assignment above still happens, which is what
  // the browser <script> path relies on.
  if (typeof module === 'object' && module && module.exports) module.exports = ZPLkit;
})(typeof globalThis !== 'undefined' ? globalThis : this);
