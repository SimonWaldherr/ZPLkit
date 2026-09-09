#!/usr/bin/env node
'use strict';

const assert = require('node:assert/strict');
require('../zplkit/gfa-codec.js');
const codec = globalThis.ZPLGraphic;

// Independent bitwise reference covers arbitrary initial CRC states.
function referenceCRC(bytes, initial) {
  let crc = initial & 0xFFFF;
  for (const byte of bytes) {
    crc ^= byte << 8;
    for (let bit = 0; bit < 8; bit++) {
      crc = ((crc & 0x8000) ? (crc << 1) ^ 0x1021 : crc << 1) & 0xFFFF;
    }
  }
  return crc;
}
assert.equal(codec.crc16(Buffer.from('123456789'), 0), 0x31C3);
assert.equal(codec.crc16(Buffer.from('123456789'), 0xFFFF), 0x29B1);
const allBytes = Uint8Array.from({ length: 256 }, (_, i) => i);
for (const seed of [0, 0xFFFF, 0x1234, -1, 0x123456]) {
  assert.equal(codec.crc16([], seed), seed & 0xFFFF);
  assert.equal(codec.crc16(allBytes, seed), referenceCRC(allBytes, seed));
}

// Exact wire output: repeated zero, black and mixed rows, including chains
// and a return to a previous row after a different row.
const rows = Uint8Array.from([0, 0, 0, 0, 0, 0, 255, 255, 255, 255,
  0xAB, 0xCD, 0xAB, 0xCD, 0xAB, 0xCD, 0, 0]);
assert.equal(codec.bitsToGF(rows, 2, 9), '^GFA,12,18,2,,::!:ABCD::,');
assert.equal(codec.bitsToDG(rows, 'R:TEST.GRF', 2, 9), '~DGR:TEST.GRF,18,2,,::!:ABCD::,');
assert.equal(codec.bitsToGF(new Uint8Array(), 1, 0), '^GFA,0,0,1,');
assert.equal(codec.bitsToGF(Uint8Array.of(0xAA, 0xAA), 1, 2, { compress: false }), '^GFA,4,2,1,AAAA');

let state = 123456;
function randomByte() {
  state = (Math.imul(state, 1664525) + 1013904223) >>> 0;
  return state >>> 24;
}
for (const width of [1, 3, 53, 210, 500]) {
  const height = 25;
  const bytes = Uint8Array.from({ length: width * height }, randomByte);
  // Long runs exercise repeat-count chunk boundaries (419 nibbles).
  bytes.fill(0xAA, 0, width);
  bytes.copyWithin(width, 0, width);
  bytes.copyWithin(2 * width, 0, width);
  for (const compress of [false, true]) {
    const gf = codec.bitsToGF(bytes, width, height, { compress });
    const dg = codec.bitsToDG(bytes, 'R:TEST.GRF', width, height, { compress });
    for (const decoded of [codec.decodeGF(gf.slice(3)), codec.decodeDG(dg.slice(3))]) {
      assert.equal(decoded.bytesPerRow, width);
      assert.equal(decoded.heightPx, height);
      assert.deepEqual(decoded.bytes, bytes);
    }
    if (!compress) assert.equal(gf.split(',').slice(4).join(','), Buffer.from(bytes).toString('hex').toUpperCase());
  }
}
console.log('✓ graphic codec CRC, exact output and deterministic round trips');
