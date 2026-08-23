#!/usr/bin/env node
'use strict';

/*
 * Geometry tests for the barcode path used by PNG/JPG/PDF export and the
 * browser print dialog.  These intentionally use a tiny canvas substitute:
 * the important contract is the exact sequence of raster rectangles, not a
 * particular browser's image encoder.
 */
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');

const source = fs.readFileSync(path.join(__dirname, '..', 'zplkit', 'barcodes.js'), 'utf8');
const context = {};
context.globalThis = context;
vm.createContext(context);
vm.runInContext(source, context, { filename: 'zplkit/barcodes.js' });
const Barcode = context.ZPLBarcode;

function isInRange(index, ranges) {
  return (ranges || []).some(function (range) {
    return index >= range[0] && index < range[1];
  });
}

function render(bars, options) {
  const calls = [];
  const ctx = {
    fillStyle: '',
    save: function () {},
    restore: function () {},
    fillRect: function (x, y, w, h) { calls.push({ x: x, y: y, w: w, h: h }); },
  };
  Barcode.renderToCanvas(
    ctx,
    bars,
    options.x || 0,
    options.y || 0,
    options.moduleWidth,
    options.height,
    options.guardRanges,
    options.guardExtension
  );
  return calls;
}

function expectedRects(bars, options) {
  let x = options.x || 0;
  const out = [];
  bars.forEach(function (modules, index) {
    const width = Barcode.renderedRunWidthPx(modules, options.moduleWidth);
    if (index % 2 === 0) {
      out.push({
        x: x,
        y: options.y || 0,
        w: width,
        h: options.height + (isInRange(index, options.guardRanges) ? (options.guardExtension || 0) : 0),
      });
    }
    x += width;
  });
  return out;
}

function assertExactRasterGeometry(name, encoded, options) {
  assert.equal(encoded.ok, true, name + ': encoder failed: ' + encoded.error);
  const actual = render(encoded.bars, options);
  const expected = expectedRects(encoded.bars, options);
  assert.deepEqual(actual, expected, name + ': bars must have exact module-aligned raster geometry');

  actual.forEach(function (rect) {
    [rect.x, rect.y, rect.w, rect.h].forEach(function (value) {
      assert.equal(Number.isInteger(value), true, name + ': raster geometry must remain on whole pixels');
    });
  });
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

test('Code 128 raster keeps every module boundary and bar/space run intact', function () {
  const encoded = Barcode.code128('12345678');
  assertExactRasterGeometry('Code 128', encoded, {
    x: 7, y: 5, moduleWidth: 3, height: 48,
  });
});

test('Code 39 and ITF raster output stays pixel-aligned, including rounded wide runs', function () {
  assertExactRasterGeometry('Code 39', Barcode.code39('AB-1234', 3), {
    x: 0, y: 0, moduleWidth: 2, height: 60,
  });
  assertExactRasterGeometry('Code 39 (2.3 ratio)', Barcode.code39('AB-1234', 2.3), {
    x: 0, y: 0, moduleWidth: 2, height: 60,
  });
  assertExactRasterGeometry('ITF', Barcode.itf('123456', 3), {
    x: 0, y: 0, moduleWidth: 2, height: 60,
  });
});

test('EAN-13 guard bars extend without changing regular bar geometry', function () {
  const encoded = Barcode.ean13('590123412345');
  const options = {
    x: 4, y: 3, moduleWidth: 2, height: 60,
    guardRanges: encoded.guardRanges, guardExtension: 13,
  };
  assertExactRasterGeometry('EAN-13', encoded, options);

  const calls = render(encoded.bars, options);
  const guardCalls = calls.filter(function (rect) { return rect.h === 73; });
  const regularCalls = calls.filter(function (rect) { return rect.h === 60; });
  assert(guardCalls.length > 0, 'EAN-13 must contain extended guard bars');
  assert(regularCalls.length > 0, 'EAN-13 must preserve regular-height data bars');
});

test('an invalid barcode produces no misleading raster bars', function () {
  const encoded = Barcode.ean13('not-a-barcode');
  assert.equal(encoded.ok, false);
  assert.deepEqual(render(encoded.bars, { moduleWidth: 2, height: 60 }), []);
});

if (process.exitCode) process.exit(process.exitCode);
