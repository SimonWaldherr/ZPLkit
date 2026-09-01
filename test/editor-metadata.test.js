#!/usr/bin/env node
'use strict';

const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');

function load() {
  const c = { console: console, performance: { now: function () { return 0; } } };
  c.globalThis = c;
  vm.createContext(c);
  ['zpl-model.js', 'editor-metadata.js', 'zpl-parser.js', 'zpl-generator.js'].forEach(function (name) {
    vm.runInContext(fs.readFileSync(path.join(__dirname, '..', 'zplkit', name), 'utf8'), c, { filename: name });
  });
  return c;
}

function test(name, fn) {
  try { fn(); process.stdout.write('✓ ' + name + '\n'); }
  catch (error) { process.stderr.write('✗ ' + name + '\n' + (error.stack || error) + '\n'); process.exitCode = 1; }
}

test('round-trips guides and layer state through ^FX comments', function () {
  const c = load();
  const label = c.ZPLModel.defaultLabel();
  const first = c.ZPLModel.makeText();
  first.id = 'headline'; first.text = 'Visible'; first.name = 'Titel'; first.locked = true; first.groupId = 'group-a';
  const hidden = c.ZPLModel.makeBox();
  hidden.id = 'draft-box'; hidden.name = 'Entwurf'; hidden.hidden = true;
  label.elements = [first, hidden];
  label.editorGuides = { visible: false, snap: true, vertical: [100, 250], horizontal: [42] };

  const zpl = c.ZPLGenerator.generateZPL(label);
  assert.match(zpl, /\^FXZPLKIT_META:1:/);
  const parsed = c.ZPLParser.parseZPL(zpl);
  assert.equal(parsed.elements.length, 2);
  assert.equal(parsed.elements[0].id, 'headline');
  assert.equal(parsed.elements[0].name, 'Titel');
  assert.equal(parsed.elements[0].locked, true);
  assert.equal(parsed.elements[0].groupId, 'group-a');
  assert.equal(parsed.elements[1].id, 'draft-box');
  assert.equal(parsed.elements[1].hidden, true);
  assert.deepEqual(Array.from(parsed.editorGuides.vertical), [100, 250]);
  assert.equal(parsed.editorGuides.visible, false);
  assert.equal(parsed.editorMetadataStatus.state, 'valid');
  assert.equal(c.ZPLGenerator.generateZPL(parsed), zpl);
});

test('chunks large metadata and restores byte arrays in hidden graphics', function () {
  const c = load();
  const label = c.ZPLModel.defaultLabel();
  const hidden = { id: 'image', type: 'graphic', x: 0, y: 0, widthPx: 8, heightPx: 800,
    bytesPerRow: 1, bits: new Uint8Array(800), hidden: true, name: 'x'.repeat(700) };
  label.elements = [hidden];
  const zpl = c.ZPLGenerator.generateZPL(label);
  assert.ok((zpl.match(/\^FXZPLKIT_META:/g) || []).length > 1);
  const parsed = c.ZPLParser.parseZPL(zpl);
  assert.equal(parsed.elements[0].bits.length, 800);
  assert.equal(parsed.elements[0].name.length, 700);
});

test('ignores damaged metadata without losing the comment or printable label', function () {
  const c = load();
  const label = c.ZPLModel.defaultLabel();
  const text = c.ZPLModel.makeText(); text.name = 'Layer'; label.elements = [text];
  const damaged = c.ZPLGenerator.generateZPL(label).replace(/:([A-Za-z0-9_-]+)\^FS/, function (_, payload) {
    return ':' + (payload[0] === 'A' ? 'B' : 'A') + payload.slice(1) + '^FS';
  });
  const parsed = c.ZPLParser.parseZPL(damaged);
  assert.equal(parsed.elements.length, 1);
  assert.equal(parsed.elements[0].name, undefined);
  assert.equal(parsed.editorMetadataStatus.state, 'invalid');
  assert.ok(parsed.rawTail.some(function (entry) { return entry.raw.indexOf('^FXZPLKIT_META:') === 0; }));
  assert.match(c.ZPLGenerator.generateZPL(parsed), /\^FXZPLKIT_META:/);
  assert.doesNotMatch(c.ZPLGenerator.generateZPL(parsed, { editorMetadata: false }), /ZPLKIT_META/);
});

test('can generate a clean multi-label print document without editor metadata', function () {
  const c = load();
  const a = c.ZPLModel.defaultLabel();
  const b = c.ZPLModel.defaultLabel();
  const first = c.ZPLModel.makeText(); first.name = 'Layer A'; a.elements = [first];
  const second = c.ZPLModel.makeText(); second.locked = true; b.elements = [second];
  const doc = { labels: [a, b], storedGraphics: {}, passthrough: [] };
  assert.equal((c.ZPLGenerator.generateDocument(doc).match(/ZPLKIT_META/g) || []).length, 2);
  const clean = c.ZPLGenerator.generateDocument(doc, { editorMetadata: false });
  assert.doesNotMatch(clean, /ZPLKIT_META/);
  assert.equal((clean.match(/\^XA/g) || []).length, 2);
});

test('does not add metadata to ordinary labels and preserves foreign comments', function () {
  const c = load();
  const label = c.ZPLModel.defaultLabel();
  assert.doesNotMatch(c.ZPLGenerator.generateZPL(label), /ZPLKIT_META/);
  const parsed = c.ZPLParser.parseZPL('^XA^FXFREMDER KOMMENTAR^FS^FO1,2^A0N,30,0^FDTest^FS^XZ');
  assert.ok(parsed.rawTail.some(function (entry) { return entry.raw.indexOf('^FXFREMDER') === 0; }));
});
