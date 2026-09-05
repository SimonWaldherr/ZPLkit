#!/usr/bin/env node
'use strict';
const assert = require('node:assert/strict');
require('../zplkit/csv-parser.js');
const { parse, detectDelimiter } = globalThis.CSVParser;

// Spreadsheet dialects, including BOMs, blank lines and Excel separator hints.
for (const delimiter of [',', ';', '\t']) {
  const source = '\uFEFF\r\n  \r\nName' + delimiter + 'Preis\r\nArtikel' + delimiter + '12,50';
  assert.equal(detectDelimiter(source), delimiter);
  const parsed = parse(source);
  assert.deepEqual(parsed.headers, ['Name', 'Preis']);
  assert.equal(parsed.rows[0].Name, 'Artikel');
  if (delimiter !== ',') assert.equal(parsed.rows[0].Preis, '12,50');
}
for (const ending of ['\n', '\r', '\r\n']) {
  const source = '\uFEFF\nsep=|' + ending + 'Name|Preis' + ending + 'Artikel|12,50';
  assert.equal(detectDelimiter(source), '|');
  assert.deepEqual(parse(source).rows, [{ Name: 'Artikel', Preis: '12,50' }]);
}
assert.deepEqual(parse('SEP=;\nA,B\nx,y', { delimiter: ',' }).rows, [{ A: 'x', B: 'y' }]);
assert.equal(detectDelimiter('"Last, First";"a\tb"\nx;y'), ';');
assert.deepEqual(parse('"Last,\nFirst";Value\n"A;B";"a""b\r\nc"').rows,
  [{ 'Last,\nFirst': 'A;B', Value: 'a"b\r\nc' }]);

// Preserve existing ragged-row and blank-record behavior.
assert.deepEqual(parse('A,B\n1\n\n,\n2,3,4\n').rows, [{ A: '1', B: '' }, { A: '2', B: '3' }]);
assert.deepEqual(parse('A\n""').rows, []);
assert.deepEqual(parse('A').rows, []);

// Reject ambiguity before any rows can be used in a print job.
for (const source of ['', '\uFEFF \r\n', 'sep=;\n']) assert.throws(() => parse(source), /input is empty/);
for (const source of ['""', 'A,\nx,y', 'A,   \nx,y']) assert.throws(() => parse(source), /empty header/);
assert.throws(() => parse('A, A \nx,y'), /duplicate header: A/);
for (const source of ['"A', 'A\n"value', 'A,B\nx,"multi\nline']) {
  assert.throws(() => parse(source), /unterminated quoted field/);
}
for (const delimiter of ['', ';;', '"', '\n', '\r', null, 5]) {
  assert.throws(() => parse('A\nx', { delimiter }), /invalid delimiter/);
}
const special = parse('__proto__,constructor,toString\nx,y,z').rows[0];
assert.equal(Object.getPrototypeOf(special), Object.prototype);
assert.equal(Object.hasOwn(special, '__proto__'), true);
assert.equal(special.__proto__, 'x');
assert.equal(special.constructor, 'y');
assert.equal(special.toString, 'z');
assert.equal(JSON.parse(JSON.stringify(special)).__proto__, 'x');
console.log('CSV import: dialects, quoting, validation and special headers passed.');
