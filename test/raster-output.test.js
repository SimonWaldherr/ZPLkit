#!/usr/bin/env node
'use strict';

/*
 * Contract tests for the scan-safe non-ZPL path. These stay DOM-free so they
 * can run in the release verifier alongside the Go and browser-client tests.
 */
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');

function loadModule(context, name) {
  const source = fs.readFileSync(path.join(__dirname, '..', 'zplkit', name), 'utf8');
  vm.runInContext(source, context, { filename: name });
}

function loadRenderer() {
  const context = { console: console, performance: { now: function () { return 0; } } };
  context.globalThis = context;
  vm.createContext(context);
  loadModule(context, 'zpl-model.js');
  loadModule(context, 'barcodes.js');
  loadModule(context, 'zpl-render.js');
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

test('normalizes ^BY settings and rounds wide raster runs to printer dots', function () {
  const c = loadRenderer();
  assert.equal(c.ZPLModel.normalizeBarcodeModuleWidth(1.6), 2);
  assert.equal(c.ZPLModel.normalizeBarcodeModuleWidth(99), 10);
  assert.equal(c.ZPLModel.normalizeBarcodeRatio(2.34), 2.3);
  assert.equal(c.ZPLBarcode.renderedRunWidthPx(2.3, 2), 5);
  assert.equal(c.ZPLBarcode.renderedWidthPx([1, 2.3, 1], 2), 9);
});

test('allows a supported 1D barcode while reporting no false blocker', function () {
  const c = loadRenderer();
  const label = c.ZPLModel.defaultLabel();
  label.elements.push(c.ZPLModel.makeBarcode({ x: 60, y: 60, data: '12345678' }));
  const report = c.ZPLRender.inspectRasterOutput(label, { dpi: 203 });
  assert.equal(report.blockers.length, 0);
});

test('blocks placeholders, raw ZPL and Code 128 control prefixes from raster output', function () {
  const c = loadRenderer();
  const withPlaceholder = c.ZPLModel.defaultLabel();
  withPlaceholder.elements.push(c.ZPLModel.makeBarcode({ barcodeType: 'datamatrix', x: 60, y: 60 }));
  assert.equal(c.ZPLRender.inspectRasterOutput(withPlaceholder, { dpi: 203 }).blockers[0].code, 'placeholder-barcode');

  const withRaw = c.ZPLModel.defaultLabel();
  withRaw.rawTail.push({ raw: '^FO30,30^BQ,2,5^FDhello^FS' });
  assert.equal(c.ZPLRender.inspectRasterOutput(withRaw, { dpi: 203 }).blockers[0].code, 'unrendered-zpl');

  const withEmptyOrigin = c.ZPLModel.defaultLabel();
  withEmptyOrigin.rawTail.push({ raw: '^FO30,30^FS' });
  assert.equal(c.ZPLRender.inspectRasterOutput(withEmptyOrigin, { dpi: 203 }).blockers.length, 0);

  const withControl = c.ZPLModel.defaultLabel();
  withControl.elements.push(c.ZPLModel.makeBarcode({ x: 60, y: 60, data: '>:12345678' }));
  assert.equal(c.ZPLRender.inspectRasterOutput(withControl, { dpi: 203 }).blockers[0].code, 'barcode-control-prefix');
});

test('writes a lossless 1-bit PDF image with the requested physical page size', function () {
  const PdfWriter = require(path.join(__dirname, '..', 'zplkit', 'pdf-writer.js'));
  const bytes = PdfWriter.fromMonoPages([{
    monoBytes: new Uint8Array([0x80, 0x40]), // 8 pixels × 2 rows, 1 = black
    widthPx: 8,
    heightPx: 2,
    widthPt: 72,
    heightPt: 18,
    textRuns: [{ text: 'SCAN', tm: [1, 0, 0, 1, 2, 2], fontSize: 6 }],
  }]);
  const text = Buffer.from(bytes).toString('latin1');
  assert.match(text, /\/BitsPerComponent 1/);
  assert.match(text, /\/Decode \[1 0\]/);
  assert.match(text, /\/MediaBox \[0 0 72 18\]/);
  assert.match(text, /\(SCAN\)/);
  assert.doesNotMatch(text, /\/DCTDecode/);
});
