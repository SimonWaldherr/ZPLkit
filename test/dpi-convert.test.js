#!/usr/bin/env node
'use strict';

/*
 * Contract tests for zplkit/zpl-dpi.js — the DPI resolution math and the
 * label conversion walk. DOM-free (the module deliberately hands embedded
 * bitmaps back to the caller as resample tasks instead of scaling them
 * itself), so this runs in the same verifier as the other node tests.
 */
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');

function loadModule(context, name) {
  const source = fs.readFileSync(path.join(__dirname, '..', 'zplkit', name), 'utf8');
  vm.runInContext(source, context, { filename: name });
}

function loadDpi() {
  const context = { console: console, performance: { now: function () { return 0; } } };
  context.globalThis = context;
  vm.createContext(context);
  loadModule(context, 'zpl-model.js');
  loadModule(context, 'zpl-dpi.js');
  return context;
}

function test(name, fn) {
  try {
    fn();
    process.stdout.write('✓ ' + name + '\n');
  } catch (error) {
    process.stderr.write('✗ ' + name + '\n' + (error.stack || error) + '\n');
    process.exitCode = 1;
  }
}

test('resolves nominal dpi labels to the printhead\'s exact dots per millimetre', function () {
  const c = loadDpi();
  const D = c.ZPLDpi;
  // 200 and 203 are the same 8 dots/mm printhead, 300 is 12 dots/mm.
  assert.equal(D.dpmmFor(200), 8);
  assert.equal(D.dpmmFor(203), 8);
  assert.equal(D.dpmmFor(300), 12);
  assert.equal(D.dpmmFor(600), 24);
  assert.equal(D.dpmmFor(152), 6);
  // An unknown resolution has no printhead to be exact about.
  assert.equal(D.dpmmFor(250), 250 / 25.4);
  assert.equal(D.isExactPair(203, 300), true);
  assert.equal(D.isExactPair(203, 250), false);
});

test('uses the exact dpmm ratio, not the rounded dpi ratio, as the scale factor', function () {
  const c = loadDpi();
  const D = c.ZPLDpi;
  // The whole point of the preset table: 300/203 would be 1.4778 and lose
  // ~1.5% of the physical size on every conversion.
  assert.equal(D.scaleFactor(203, 300), 1.5);
  assert.equal(D.scaleFactor(200, 300), 1.5);
  assert.equal(D.scaleFactor(300, 203), 2 / 3);
  assert.equal(D.scaleFactor(203, 600), 3);
  assert.equal(D.scaleFactor(300, 300), 1);
});

test('converts dots to physical units through the exact dpmm', function () {
  const c = loadDpi();
  const D = c.ZPLDpi;
  assert.equal(D.dotsToMm(680, 203), 85);
  assert.equal(D.mmToDots(85, 300), 1020);
  // 812 dots at 8 dots/mm is 101.5 mm - i.e. 3.996", not the 4.0" a naive
  // 812/203 would suggest.
  assert.equal(Math.round(D.dotsToInch(812, 203) * 1000) / 1000, 3.996);
  assert.equal(D.labelaryDpmm(200), 8);
  assert.equal(D.labelaryDpmm(300), 12);
  assert.equal(D.labelaryDpmm(240), 8); // nearest offered printer
});

test('reads a declared resolution out of the .200zpl/.300zpl file-name convention', function () {
  const c = loadDpi();
  const D = c.ZPLDpi;
  assert.equal(D.dpiFromFileName('versand.300zpl'), 300);
  assert.equal(D.dpiFromFileName('VERSAND.200ZPL'), 203); // normalized to the preset's own label
  assert.equal(D.dpiFromFileName('versand.zpl'), null);
  assert.equal(D.dpiFromFileName('versand.txt'), null);
  assert.equal(D.dpiFromFileName(''), null);
});

test('rewrites a .NNNzpl extension to match a new resolution', function () {
  const c = loadDpi();
  const D = c.ZPLDpi;
  // The convention writes the nominal name (".200zpl" for the 8 dots/mm head).
  assert.equal(D.fileNameDpiTag(203), '200');
  assert.equal(D.fileNameDpiTag(300), '300');
  assert.equal(D.fileNameDpiTag(250), null);
  assert.equal(D.renameForDpi('versand.300zpl', 203), 'versand.200zpl');
  assert.equal(D.renameForDpi('versand.200zpl', 300), 'versand.300zpl');
  // A plain .zpl makes no resolution claim, so there is nothing to correct.
  assert.equal(D.renameForDpi('versand.zpl', 300), 'versand.zpl');
  // Nor does a name get a claim it cannot express.
  assert.equal(D.renameForDpi('versand.300zpl', 250), 'versand.300zpl');
});

test('keeps a label\'s physical size when converting 203 -> 300 dpi', function () {
  const c = loadDpi();
  const D = c.ZPLDpi;
  const label = c.ZPLModel.defaultLabel();
  label.settings.widthDots = 680;   // 85 mm at 8 dots/mm
  label.settings.heightDots = 440;  // 55 mm
  label.settings.homeX = 10;
  label.settings.labelShiftY = -4;
  label.elements.push(c.ZPLModel.makeText({ x: 40, y: 60, height: 30, width: 0 }));
  label.elements.push(c.ZPLModel.makeBox({ x: 10, y: 10, widthDots: 200, heightDots: 100, thickness: 3 }));
  label.elements.push(c.ZPLModel.makeCircle({ x: 300, y: 20, diameter: 40, thickness: 2 }));

  const report = D.convertLabel(label, 203, 300);

  assert.equal(report.factor, 1.5);
  assert.equal(label.settings.widthDots, 1020);
  assert.equal(label.settings.heightDots, 660);
  assert.equal(D.dotsToMm(label.settings.widthDots, 300), 85);
  assert.equal(D.dotsToMm(label.settings.heightDots, 300), 55);
  assert.equal(label.settings.homeX, 15);
  assert.equal(label.settings.labelShiftY, -6); // offsets may be negative and stay negative
  assert.equal(label.elements[0].x, 60);
  assert.equal(label.elements[0].y, 90);
  assert.equal(label.elements[0].height, 45);
  assert.equal(label.elements[0].width, 0); // 0 means "automatic" and must survive as 0
  assert.equal(label.elements[1].widthDots, 300);
  assert.equal(label.elements[1].heightDots, 150);
  assert.equal(label.elements[1].thickness, 5);
  assert.equal(label.elements[2].diameter, 60);
});

test('leaves the label untouched on a dry run but reports the same numbers', function () {
  const c = loadDpi();
  const label = c.ZPLModel.defaultLabel();
  label.settings.widthDots = 680;
  label.settings.heightDots = 440;
  label.elements.push(c.ZPLModel.makeText({ x: 40, y: 60, height: 30 }));

  const report = c.ZPLDpi.convertLabel(label, 203, 300, { dryRun: true });

  assert.equal(label.settings.widthDots, 680);
  assert.equal(label.elements[0].x, 40);
  assert.equal(label.elements[0].height, 30);
  // Rows are addressed by a stable key, and carry bare numbers plus a
  // separate unit so a localized UI can render them (see the report's own
  // doc comment) - the German `label` is only the standalone fallback.
  const sizeRow = report.changes.find(function (r) { return r.key === 'label-size'; });
  assert.equal(sizeRow.from, '680 × 440');
  assert.equal(sizeRow.to, '1020 × 660');
  assert.equal(sizeRow.unit, 'dots');
  assert.match(sizeRow.label, /\^PW/);
  const fontRow = report.changes.find(function (r) { return r.key === 'font-heights'; });
  assert.equal(fontRow.to, '45');
  // The physical size the conversion preserves is reported as numbers, not
  // as a pre-formatted string with someone else's decimal separator.
  assert.equal(report.physical.widthMM, 85);
  assert.equal(report.physical.heightMM, 55);
});

test('scales barcode geometry per symbology and reports a clamped module width', function () {
  const c = loadDpi();
  const label = c.ZPLModel.defaultLabel();
  const code128 = c.ZPLModel.makeBarcode({ x: 20, y: 20, moduleWidth: 2 });
  code128.params.height = 60;
  const wide = c.ZPLModel.makeBarcode({ x: 20, y: 200, moduleWidth: 8 }); // 8 * 1.5 = 12, over ZPL's max of 10
  wide.params.height = 40;
  const dm = c.ZPLModel.makeBarcode({ barcodeType: 'datamatrix', x: 300, y: 20 });
  dm.params = { orientation: 'N', height: 6, quality: 200, columns: 0, rows: 0, format: 1, escapeChar: '_', aspect: 1 };
  const aztec = c.ZPLModel.makeBarcode({ barcodeType: 'aztec', x: 400, y: 20 });
  aztec.params = { orientation: 'N', magnification: 2, eci: false, errorControl: 0, menuSymbol: false, appendCount: 1, appendId: '' };
  const maxi = c.ZPLModel.makeBarcode({ barcodeType: 'maxicode', x: 500, y: 20 });
  maxi.params = { mode: 2, symbolNumber: 1, totalSymbols: 1 };
  label.elements.push(code128, wide, dm, aztec, maxi);

  const report = c.ZPLDpi.convertLabel(label, 203, 300);

  assert.equal(code128.moduleWidth, 3);
  assert.equal(code128.params.height, 90);
  assert.equal(wide.moduleWidth, 10); // clamped, and reported
  assert.equal(dm.params.height, 9);  // Data Matrix's "height" is its module size
  assert.equal(dm.params.quality, 200); // ECC level is not a length
  assert.equal(dm.params.columns, 0);
  assert.equal(aztec.params.magnification, 3);
  assert.equal(aztec.params.errorControl, 0);
  assert.deepEqual(maxi.params, { mode: 2, symbolNumber: 1, totalSymbols: 1 }); // fixed physical size
  assert.equal(report.warnings.find(function (w) { return w.code === 'module-clamped'; }).params.wanted, 12);
  assert.ok(report.warnings.some(function (w) { return w.code === 'maxicode-fixed'; }));
  // ^BY defaults carried by the label itself move too.
  assert.equal(label.byState.moduleWidth, 3);
  assert.equal(label.byState.height, 90);
});

test('hands embedded bitmaps back as resample tasks instead of touching their bits', function () {
  const c = loadDpi();
  const label = c.ZPLModel.defaultLabel();
  const bits = new Uint8Array(8 * 40); // 64 x 40 px, 8 bytes per row
  const gfx = c.ZPLModel.makeGraphic({
    x: 10, y: 10, widthPx: 64, heightPx: 40, bytesPerRow: 8, bits: bits,
    displayWidthPx: 64, displayHeightPx: 40,
  });
  label.elements.push(gfx);
  label.storedGraphics['R:LOGO.GRF'] = { widthPx: 100, heightPx: 50, bytesPerRow: 13, bytes: new Uint8Array(13 * 50) };

  const report = c.ZPLDpi.convertLabel(label, 203, 300);

  assert.equal(gfx.x, 15); // placement converted
  assert.equal(gfx.widthPx, 64); // bits untouched - only the caller can rasterize
  assert.equal(gfx.bits, bits);
  assert.equal(report.graphicTasks.length, 2);
  const inline = report.graphicTasks.find(function (t) { return t.kind === 'inline'; });
  assert.equal(inline.targetWidthPx, 96);
  assert.equal(inline.targetHeightPx, 60);
  const storedTask = report.graphicTasks.find(function (t) { return t.kind === 'stored'; });
  assert.equal(storedTask.name, 'R:LOGO.GRF');
  assert.equal(storedTask.targetWidthPx, 150);
  assert.equal(storedTask.targetHeightPx, 75);
  const row = report.changes.find(function (r) { return r.key === 'graphics'; });
  assert.equal(row.unit, 'px');
  assert.equal(row.params.count, 2);
});

test('honors the per-group opt-outs', function () {
  const c = loadDpi();
  const label = c.ZPLModel.defaultLabel();
  label.settings.widthDots = 680;
  label.settings.heightDots = 440;
  const text = c.ZPLModel.makeText({ x: 40, y: 60, height: 30 });
  const bc = c.ZPLModel.makeBarcode({ x: 40, y: 300, moduleWidth: 2 });
  bc.params.height = 60;
  label.elements.push(text, bc);

  c.ZPLDpi.convertLabel(label, 203, 300, { label: false, fonts: false, barcodes: false });

  assert.equal(label.settings.widthDots, 680); // label frame left alone
  assert.equal(text.x, 60);                    // positions still converted
  assert.equal(text.height, 30);               // font height not
  assert.equal(bc.moduleWidth, 2);             // barcode geometry not
  assert.equal(bc.params.height, 60);
});

test('warns about the things a conversion cannot get right on its own', function () {
  const c = loadDpi();
  const label = c.ZPLModel.defaultLabel();
  label.preamble = '^XA^JUS^XZ';
  label.rawTail = [{ raw: '^RFW,H', atIndex: 0 }];
  label.elements.push(c.ZPLModel.makeText({ x: 10, y: 10, font: 'D', height: 18 }));

  const report = c.ZPLDpi.convertLabel(label, 203, 250);
  const codes = report.warnings.map(function (w) { return w.code; });

  assert.ok(codes.includes('inexact-dpi'));   // 250 dpi is no Zebra printhead
  assert.ok(codes.includes('bitmap-fonts'));  // font D has a fixed character matrix
  assert.ok(codes.includes('preamble'));
  assert.ok(codes.includes('raw-tail'));
  // Each warning carries the numbers its wording needs, so a localized UI
  // can build its own sentence instead of parsing the German one.
  const bitmap = report.warnings.find(function (w) { return w.code === 'bitmap-fonts'; });
  assert.equal(bitmap.params.count, 1);
  assert.match(bitmap.text, /Bitmap-Schrift/);
  assert.equal(report.warnings.find(function (w) { return w.code === 'raw-tail'; }).params.count, 1);
  // Rounding cost is stated rather than hidden: half a dot at the target dpi.
  assert.equal(report.roundingErrorMM, 0.5 / (250 / 25.4));
});

test('warns only about elements the conversion itself pushes off the label', function () {
  const c = loadDpi();
  const label = c.ZPLModel.defaultLabel();
  label.settings.widthDots = 680;
  label.settings.heightDots = 440;
  label.elements.push(c.ZPLModel.makeText({ x: 600, y: 100 })); // inside, would land at 900
  const report = c.ZPLDpi.convertLabel(label, 203, 300, { label: false }); // frame deliberately left alone
  assert.equal(report.warnings.find(function (w) { return w.code === 'outside'; }).params.count, 1);

  // Same element, but the frame scales with it: nothing leaves the label.
  const scaled = c.ZPLModel.defaultLabel();
  scaled.settings.widthDots = 680;
  scaled.settings.heightDots = 440;
  scaled.elements.push(c.ZPLModel.makeText({ x: 600, y: 100 }));
  assert.equal(c.ZPLDpi.convertLabel(scaled, 203, 300).warnings.some(function (w) { return w.code === 'outside'; }), false);

  // An element that was ALREADY outside is the label's own pre-existing
  // state, not something the conversion did.
  const already = c.ZPLModel.defaultLabel();
  already.settings.widthDots = 680;
  already.settings.heightDots = 440;
  already.elements.push(c.ZPLModel.makeText({ x: 900, y: 100 }));
  assert.equal(c.ZPLDpi.convertLabel(already, 203, 300, { label: false }).warnings.some(function (w) { return w.code === 'outside'; }), false);
});

test('is a no-op between identical resolutions', function () {
  const c = loadDpi();
  const label = c.ZPLModel.defaultLabel();
  label.elements.push(c.ZPLModel.makeText({ x: 40, y: 60, height: 30 }));
  const report = c.ZPLDpi.convertLabel(label, 203, 200); // same 8 dots/mm printhead
  assert.equal(report.factor, 1);
  assert.equal(report.changes.length, 0);
  assert.equal(report.graphicTasks.length, 0);
  assert.equal(label.elements[0].x, 40);
});

test('round-trips 203 -> 300 -> 203 back to the original dots for clean factors', function () {
  const c = loadDpi();
  const label = c.ZPLModel.defaultLabel();
  label.settings.widthDots = 680;
  label.settings.heightDots = 440;
  label.elements.push(c.ZPLModel.makeText({ x: 40, y: 60, height: 30 }));
  label.elements.push(c.ZPLModel.makeBox({ x: 12, y: 24, widthDots: 200, heightDots: 100, thickness: 4 }));

  c.ZPLDpi.convertLabel(label, 203, 300);
  c.ZPLDpi.convertLabel(label, 300, 203);

  assert.equal(label.settings.widthDots, 680);
  assert.equal(label.settings.heightDots, 440);
  assert.equal(label.elements[0].x, 40);
  assert.equal(label.elements[0].height, 30);
  assert.equal(label.elements[1].widthDots, 200);
  assert.equal(label.elements[1].thickness, 4);
});
