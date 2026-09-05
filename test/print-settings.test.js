#!/usr/bin/env node
'use strict';
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const ctx = vm.createContext({ performance: { now: () => 0 } });
for (const name of ['zpl-model', 'zpl-parser', 'zpl-generator']) {
  vm.runInContext(fs.readFileSync(path.join(__dirname, '../zplkit/' + name + '.js'), 'utf8'), ctx);
}
const M = ctx.ZPLModel;
const P = ctx.ZPLParser;
const G = ctx.ZPLGenerator;
const plain = value => JSON.parse(JSON.stringify(value));

// Zebra's documented defaults and five-parameter example, not q * r copies.
assert.deepEqual(plain(M.parsePrintQuantity('')), {
  quantity: 1, pauseEvery: 0, replicates: 0, overridePause: 'N', cutOnError: 'Y',
});
assert.deepEqual(plain(M.parsePrintQuantity('50,10,1,Y,N')), {
  quantity: 50, pauseEvery: 10, replicates: 1, overridePause: 'Y', cutOnError: 'N',
});
assert.equal(M.parsePrintQuantity('99999999,99999999,99999999').quantity, 99999999);
for (const raw of ['0', '-1', '1.5', '100000000', '1,-1', '1,0,0,X', '1,0,0,Y,X', '1,0,0,Y,N,2', '1e3']) {
  assert.throws(() => M.parsePrintQuantity(raw), /\^PQ/);
}
assert.equal(M.setPrintQuantityParameter('050,,2,,N', 'quantity', 20), '20,,2,,N');
assert.equal(M.setPrintQuantityParameter('50,10,1,Y,N', 'quantity', ''), ',10,1,Y,N');
assert.equal(M.setPrintQuantityParameter(null, 'cutOnError', 'N'), ',,,,N');
assert.throws(() => M.setPrintQuantityParameter('1', 'quantity', 1.5), /\^PQ/);
assert.throws(() => M.setPrintQuantityParameter('1', 'unknown', 1), /Unknown/);

// No editing: preserve omitted fields, leading zeros, unknown future values
// and legacy raw settings. Never expand a quantity into model elements.
for (const raw of ['', '7', ',,,Y', '050,,2,,N', '50,10,1,Y,N', 'future']) {
  const label = P.parseZPL('^XA^FO10,10^A0N,20,20^FDTest^FS^PQ' + raw + '^XZ');
  assert.equal(label.settings.pq, raw);
  assert.equal(label.elements.length, 1);
  const out = G.generateZPL(label);
  assert.equal((out.match(/\^PQ/g) || []).length, 1);
  assert.ok(out.includes('^PQ' + raw + '\n^XZ'));
  assert.equal(P.parseZPL(out).settings.pq, raw);
}
const doc = P.parseDocument('^XA^PQ3^XZ^XA^PQ8,2,0,N,N^XZ');
assert.equal(doc.labels.length, 2);
assert.deepEqual(Array.from(P.parseDocument(G.generateDocument(doc)).labels, l => l.settings.pq), ['3', '8,2,0,N,N']);
assert.ok(G.generateZPL(M.defaultLabel()).includes('^PQ,,,Y\n'));

// Absolute and relative darkness are independent and decimal precision survives.
for (const value of [-30, -8.3, 0, 8.3, 30]) {
  const label = P.parseZPL('^XA~SD16.5^MD' + value + '^PQ2^XZ');
  assert.equal(label.settings.darkness, 16.5);
  assert.equal(label.settings.darknessOffset, value);
  assert.equal(label.rawTail.length, 0);
  const roundtrip = P.parseZPL(G.generateZPL(label));
  assert.equal(roundtrip.settings.darkness, 16.5);
  assert.equal(roundtrip.settings.darknessOffset, value);
}
assert.equal(P.parseZPL('^XA^MD+2.5^XZ').settings.darknessOffset, 2.5);
assert.equal(P.parseZPL('^XA^MD-6^MD2^XZ').settings.darknessOffset, 2);
assert.ok(!G.generateZPL(M.defaultLabel()).includes('^MD'));
for (const command of ['^MD', '^MD2oops', '~SD8.3oops']) {
  const label = P.parseZPL('^XA' + command + '^XZ');
  assert.ok(G.generateZPL(label).includes(command));
}

// Exercise the actual Studio backend adapter: only the disposable print copy
// is normalized; preserve the independent RFID error-cut setting.
const app = fs.readFileSync(path.join(__dirname, '../studio/app.js'), 'utf8');
const start = app.indexOf('  function labelForBackendPrint(');
const end = app.indexOf('  function zplForBackendPrint(', start);
ctx.M = M;
ctx.cloneLabel = plain;
vm.runInContext(app.slice(start, end), ctx);
const original = P.parseZPL('^XA^PQ50,10,2,N,N^XZ');
const printCopy = ctx.labelForBackendPrint(original);
assert.equal(printCopy.settings.pq, '1,0,1,Y,N');
assert.equal(original.settings.pq, '50,10,2,N,N');
assert.equal(ctx.labelForBackendPrint(M.defaultLabel()).settings.pq, '1,0,1,Y');
console.log('Print settings: PQ defaults, editing, roundtrips, backend copies and MD/SD passed.');
