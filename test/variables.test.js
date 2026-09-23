#!/usr/bin/env node
'use strict';
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
require('../zplkit/zpl-variables.js');
const V = globalThis.ZPLVariables;
const template = {
  settings: { widthDots: 400, comment: '$IGNORED$' },
  elements: [
    { type: 'text', text: '$NAME$ / $name$ / $ZERO$ / $BOOL$ / $EMPTY$' },
    { type: 'barcode', data: '$CODE$-$NAME$', params: { height: 40 } },
    { type: 'graphic', bits: Uint8Array.of(0x80, 0xFF), data: '$IGNORED$' },
  ],
  rawTail: [{ raw: '^FX$IGNORED$^FS' }],
  storedGraphics: { logo: { bytes: Uint8Array.of(0x55) } },
};
assert.deepEqual(V.discover(template), ['BOOL', 'CODE', 'EMPTY', 'NAME', 'ZERO', 'name']);
const row = { Name: 'Äpfel', CODE: '00123', ZERO: 0, BOOL: false, EMPTY: '' };
const snapshot = JSON.stringify(template);
const applied = V.apply(template, row);
assert.equal(applied.elements[0].text, 'Äpfel / Äpfel / 0 / false / $EMPTY$');
assert.equal(applied.elements[1].data, '00123-Äpfel');
assert.deepEqual(applied.rawTail, template.rawTail);
assert.equal(applied.settings.comment, '$IGNORED$');
assert.equal(applied.elements[2].data, '$IGNORED$');
applied.elements[2].bits[0] = 0;
applied.storedGraphics.logo.bytes[0] = 0;
applied.elements[1].params.height = 1;
applied.settings.widthDots = 1;
assert.equal(JSON.stringify(template), snapshot);
assert.ok(applied.elements[2].bits instanceof Uint8Array);
assert.equal(V.substitute('$NAME$', { NAME: '$CODE$' }), '$CODE$'); // one pass
assert.equal(V.substitute('$NAME$', { NAME: '$&' }), '$&');
assert.equal(V.substitute('$NAME$-$name$', { NAME: 'A', name: 'B' }), 'A-B');
assert.equal(V.substitute('$NaMe$', { NAME: 'A', name: 'B' }), 'A');
assert.equal(V.substitute('$NAME$', { name: 'A' }, { caseSensitive: true }), '$NAME$');
assert.equal(V.substitute('$A$/$B$/$C$', { A: null, B: undefined, C: '' }, { missing: 'empty' }), '//');
assert.equal(V.substitute('no variables', {}), 'no variables');
assert.deepEqual(V.discover({}), []);

const single = { elements: [{ type: 'text', text: '$COUNT$' }] };
const options = { fields: [{ name: 'count', type: 'integer', min: 0, max: 100, required: true, default: 2 }] };
assert.equal(V.apply(single, {}, options).elements[0].text, '2');
assert.equal(V.apply(single, { count: '' }, options).elements[0].text, '2');
assert.equal(V.apply(single, { count: '007' }, options).elements[0].text, '007');
assert.deepEqual(V.resolve(single, { count: '7' }, options).missing, []);
assert.deepEqual(Object.keys(V.resolve(single, { count: '7' }, options).values), ['COUNT']);
for (const [value, code] of [['1.5', 'type'], [101, 'range'], ['NaN', 'type'], ['0x10', 'type'], [' ', 'type'], [true, 'type'], [Infinity, 'type']]) {
  const report = V.resolve(single, { count: value }, options);
  assert.equal(report.valid, false);
  assert.equal(report.errors[0].code, code);
  assert.throws(() => V.apply(single, { count: value }, options), error =>
    error.name === 'VariableValidationError' && error.errors[0].name === 'COUNT');
}
for (const value of ['1.25', '-2e3', 0.1]) {
  assert.equal(V.resolve(single, { COUNT: value }, { fields: [{ name: 'COUNT', type: 'number' }] }).valid, true);
}
for (const value of [true, false, 'true', 'false']) {
  assert.equal(V.resolve(single, { COUNT: value }, { fields: [{ name: 'COUNT', type: 'boolean' }] }).valid, true);
}
assert.equal(V.resolve(single, { COUNT: 'Y' }, { fields: [{ name: 'COUNT', type: 'boolean' }] }).valid, false);
assert.equal(V.resolve(single, { COUNT: 1 }, { fields: [{ name: 'COUNT', type: 'string' }] }).valid, false);
assert.equal(V.resolve(single, { COUNT: 'abc' }, { fields: [{ name: 'COUNT', maxLength: 2 }] }).errors[0].code, 'maxLength');
assert.equal(V.resolve(single, {}, { fields: [{ name: 'COUNT', required: true }] }).valid, false);
assert.equal(V.resolve(single, {}).valid, true);
assert.deepEqual(V.resolve(single, {}).missing, ['COUNT']);
assert.equal(V.resolve(single, {}, { missing: 'error' }).valid, false);
assert.throws(() => V.substitute('$COUNT$', {}, { missing: 'error' }), /Missing value/);
assert.throws(() => V.apply(single, {}, { fields: [{ name: 'COUNT', required: true }], missing: 'empty' }), /Missing value/);
assert.equal(V.resolve({ elements: [] }, {}, { fields: [{ name: 'EXTRA', required: true }] }).valid, false);
for (const value of [{}, [], () => 'text', NaN, 1n]) {
  assert.equal(V.resolve(single, { COUNT: value }).valid, false);
}
for (const fields of [null, {}, [{ name: 'bad-name' }], [{ name: 'A' }, { name: 'a' }],
  [{ name: 'A', type: 'date' }], [{ name: 'A', required: 'yes' }],
  [{ name: 'A', min: 1 }], [{ name: 'A', type: 'number', min: 2, max: 1 }],
  [{ name: 'A', maxLength: -1 }]]) {
  assert.throws(() => V.resolve(single, {}, { fields }), TypeError);
}
assert.throws(() => V.resolve(single, {}, { missing: 'ignore' }), TypeError);
assert.throws(() => V.resolve(single, {}, { caseSensitive: 'false' }), TypeError);
assert.throws(() => V.apply(single, []), TypeError);

// Only own properties are data; special column names are safe literal keys.
const inherited = Object.create({ NAME: 'must not leak' });
assert.equal(V.substitute('$NAME$/$constructor$', inherited), '$NAME$/$constructor$');
const special = JSON.parse('{"__proto__":"p","constructor":"c","toString":"t"}');
assert.equal(V.substitute('$__proto__$/$constructor$/$toString$', special), 'p/c/t');
const specialLabel = JSON.parse('{"elements":[],"__proto__":{"value":1}}');
assert.equal(Object.getPrototypeOf(V.apply(specialLabel, {})), Object.prototype);
assert.ok(Object.hasOwn(V.apply(specialLabel, {}), '__proto__'));

// Both distributable builds expose the same API and escape data only when
// generating ZPL. Round-tripping a command-shaped value must keep one text.
for (const build of ['lite', 'full']) {
  const kit = require('../zplkit/dist/zplkit-' + build + '.js');
  assert.ok(kit.modules.includes('Variables'));
  assert.equal(kit.version, '1.6.0');
  const label = kit.parse('^XA^FO10,20^A0N,30,20^FD$NAME$^FS^XZ');
  const value = 'Äpfel ^FS^XZ~JA $OTHER$';
  const filled = kit.Variables.apply(label, { NAME: value });
  const generated = kit.generate(filled);
  assert.equal(generated.includes('~JA'), false);
  const reparsed = kit.parse(generated);
  assert.equal(reparsed.elements.length, 1);
  assert.equal(reparsed.elements[0].text, value);
  assert.equal(label.elements[0].text, '$NAME$');
}

// Exercise the actual Studio adapters without booting its unrelated UI.
const app = fs.readFileSync(path.join(__dirname, '../studio/app.js'), 'utf8');
const context = vm.createContext({
  window: { ZPLVariables: V },
  state: { sampleDataMode: true, sampleValues: { NAME: 'Example' }, hideUnfilledPlaceholders: false },
  cloneLabel: structuredClone,
});
for (const [start, end] of [
  ['  function findVariablesIn(', '  function findVariables()'],
  ['  function applySampleData(', '  // Apply preview values'],
  ['  function labelWithSampleData(', '  // ---------------------------------------------------------------------\n  // Printer resolution'],
  ['  function lookupRowValue(', '  // The export-time counterpart'],
  ['  function applyRowToLabel(', '  function mergeActiveSheet()'],
]) vm.runInContext(app.slice(app.indexOf(start), app.indexOf(end, app.indexOf(start))), context);
context.template = template; context.row = row;
assert.equal(vm.runInContext('applyRowToLabel(template, row).elements[1].data', context), '00123-Äpfel');
assert.equal(vm.runInContext('applySampleData("$NAME$/$name$")', context), 'Example/$name$');
assert.equal(vm.runInContext('labelWithSampleData(template).elements[1].data', context), '$CODE$-Example');
context.state.hideUnfilledPlaceholders = true;
assert.equal(vm.runInContext('applySampleData("$NAME$/$name$")', context), 'Example/');
context.state.sampleDataMode = false;
assert.equal(vm.runInContext('applySampleData("$NAME$")', context), '$NAME$');
assert.equal(vm.runInContext('labelWithSampleData(template).elements[1].data', context), '$CODE$-$NAME$');
console.log('✓ variables: resolution, schema validation, immutable graphics, bundles and Studio adapters');
