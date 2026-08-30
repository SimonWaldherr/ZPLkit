#!/usr/bin/env node
'use strict';

/*
 * Contract tests for multi-label documents — a .zpl file holding several
 * ^XA..^XZ frames, which is what a print spool normally is.
 *
 * Before parseDocument existed, parseZPL merged every frame into ONE label:
 * three labels' elements ended up stacked at the same coordinates and were
 * re-emitted as a single unprintable frame. The regression that matters most
 * here is therefore not "does it split" but "does a SINGLE-label file still
 * produce byte-identical output", since that is every existing caller.
 */
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');

function loadModule(context, name) {
  const source = fs.readFileSync(path.join(__dirname, '..', 'zplkit', name), 'utf8');
  vm.runInContext(source, context, { filename: name });
}

function load() {
  const context = { console: console, performance: { now: function () { return 0; } } };
  context.globalThis = context;
  vm.createContext(context);
  loadModule(context, 'zpl-model.js');
  // The ~DG graphic codec is optional for the parser, but the shared-store
  // tests below need a ~DG to actually decode: without it the parser keeps
  // the command verbatim (by design) and the registry stays empty.
  loadModule(context, 'inflate.js');
  loadModule(context, 'gfa-codec.js');
  loadModule(context, 'zpl-parser.js');
  loadModule(context, 'zpl-generator.js');
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

const LABEL_A = '^XA^PW400^LL400^FO20,20^A0N,30,0^FDEINS^FS^XZ';
const LABEL_B = '^XA^PW400^LL400^FO20,20^A0N,30,0^FDZWEI^FS^XZ';
const LABEL_C = '^XA^PW400^LL400^FO20,20^A0N,30,0^FDDREI^FS^XZ';

function texts(doc) {
  // The parser runs in a vm context. Array.prototype.map from that context
  // creates a foreign-realm Array, which strict assert versions correctly
  // treat as a different prototype even when every value matches. Build the
  // assertion value in this realm so the test checks document content rather
  // than VM implementation details.
  return Array.from(doc.labels, function (l) {
    return l.elements.map(function (e) { return e.text || e.data || e.type; }).join('+');
  });
}

// Generating twice must produce the same bytes - the property that catches
// a chunk of passthrough growing a newline, or a frame drifting position, on
// every save.
function assertStable(c, source, message) {
  const once = c.ZPLGenerator.generateDocument(c.ZPLParser.parseDocument(source));
  const twice = c.ZPLGenerator.generateDocument(c.ZPLParser.parseDocument(once));
  assert.equal(twice, once, message || 'round trip is not stable');
  return once;
}

test('a single-label file still generates byte-identical output', function () {
  const c = load();
  const single = '^XA\n^PW680\n^LL440\n^FO40,40\n^A0N,30,0\n^FDNur eins^FS\n^XZ\n';
  const viaLabel = c.ZPLGenerator.generateZPL(c.ZPLParser.parseZPL(single));
  const viaDocument = c.ZPLGenerator.generateDocument(c.ZPLParser.parseDocument(single));
  assert.equal(viaDocument, viaLabel);
  assert.equal(c.ZPLParser.parseDocument(single).labels.length, 1);
});

test('splits a spool file into one label per frame', function () {
  const c = load();
  const doc = c.ZPLParser.parseDocument([LABEL_A, LABEL_B, LABEL_C].join('\n'));
  assert.equal(doc.labels.length, 3);
  assert.deepEqual(texts(doc), ['EINS', 'ZWEI', 'DREI']);
  // Each frame keeps its own geometry rather than the frames piling up.
  doc.labels.forEach(function (l) {
    assert.equal(l.elements.length, 1);
    assert.equal(l.elements[0].x, 20);
  });
  const out = assertStable(c, [LABEL_A, LABEL_B, LABEL_C].join('\n'));
  assert.equal((out.match(/\^XA/g) || []).length, 3);
});

test('parseZPL keeps returning one label, and says how many there were', function () {
  const c = load();
  const first = c.ZPLParser.parseZPL([LABEL_A, LABEL_B, LABEL_C].join('\n'));
  assert.equal(first.elements[0].text, 'EINS');
  // Discoverable rather than silent: a caller handed a third of a spool file
  // can notice and switch to parseDocument.
  assert.equal(first.labelCount, 3);
  assert.equal(c.ZPLParser.parseZPL(LABEL_A).labelCount, 1);
});

test('driver-config and ^ID cleanup frames are not labels', function () {
  const c = load();
  const source = [
    '^XA~TA000^JSN^XZ',          // driver preamble
    LABEL_A,
    '^XA^JZY^SZ2^XZ',            // reconfiguration between labels
    LABEL_B,
    '^XA^IDR:LOGO.GRF^FS^XZ',    // graphic cleanup tail
  ].join('\n');
  const doc = c.ZPLParser.parseDocument(source);

  assert.equal(doc.labels.length, 2, 'config/cleanup frames became labels');
  assert.deepEqual(texts(doc), ['EINS', 'ZWEI']);
  assert.ok(doc.preamble && doc.preamble.indexOf('~TA000') !== -1);
  // Each non-label frame is anchored to the label it followed, so it does not
  // migrate to the end of the file on save.
  assert.deepEqual(Array.from(doc.passthrough, function (p) { return p.afterLabelIndex; }), [0, 1]);

  const out = assertStable(c, source);
  assert.ok(out.indexOf('~TA000') !== -1, 'preamble lost');
  assert.ok(out.indexOf('^JZY') !== -1, 'config frame lost');
  assert.ok(out.indexOf('^IDR:LOGO.GRF') !== -1, 'cleanup frame lost');
  assert.ok(out.indexOf('^FDEINS') < out.indexOf('^JZY'), 'config frame moved before its label');
  assert.ok(out.indexOf('^JZY') < out.indexOf('^FDZWEI'), 'config frame moved past the next label');
});

test('^ID is recognised even though the object name follows it immediately', function () {
  const c = load();
  // "^IDR:LOGO.GRF" has no word boundary after ID; a \b in the detector
  // silently turned every cleanup frame into an extra empty label.
  assert.equal(c.ZPLParser.parseDocument(LABEL_A + '\n^XA^IDR:LOGO.GRF^FS^XZ').labels.length, 1);
  assert.equal(c.ZPLParser.parseDocument(LABEL_A + '\n^XA^IDE:X.GRF^FS^XZ').labels.length, 1);
});

test('a graphic shared by several labels is downloaded once', function () {
  const c = load();
  const source = '~DGR:L.GRF,8,1,FFFFFFFFFFFFFFFF\n' +
    '^XA^PW400^LL400^FO10,10^XGR:L.GRF,1,1^FS^XZ\n' +
    '^XA^PW400^LL400^FO50,50^XGR:L.GRF,1,1^FS^XZ\n';
  const doc = c.ZPLParser.parseDocument(source);
  assert.equal(doc.labels.length, 2);
  // One registry object, not a copy per label - otherwise editing the logo on
  // label 1 would leave label 2 pointing at the old bits.
  assert.equal(doc.labels[0].storedGraphics, doc.labels[1].storedGraphics);

  const out = assertStable(c, source);
  assert.equal((out.match(/~DG/g) || []).length, 1, '~DG emitted per label instead of once');
  assert.equal((out.match(/\^XG/g) || []).length, 2, 'a placement was lost');
});

test('a logo only a later label places is still counted as referenced', function () {
  const c = load();
  const source = '~DGR:L.GRF,8,1,FFFFFFFFFFFFFFFF\n' + LABEL_A + '\n' +
    '^XA^PW400^LL400^FO50,50^XGR:L.GRF,1,1^FS^XZ\n';
  const doc = c.ZPLParser.parseDocument(source);
  // Deciding "unreferenced" per label would flag it while looking at label 1.
  assert.notEqual(doc.storedGraphics['R:L.GRF'].preserveUnreferenced, true);
});

test('text outside any frame survives instead of being dropped', function () {
  const c = load();
  const source = LABEL_A + '\n^RFW,H,1,2,1\n' + LABEL_B;
  const out = assertStable(c, source);
  assert.ok(out.indexOf('^RFW,H,1,2,1') !== -1, 'inter-frame command lost');
});

test('degenerate input still yields exactly one label', function () {
  const c = load();
  // Callers rely on labels[0] existing; there is no "document with no labels".
  assert.equal(c.ZPLParser.parseDocument('').labels.length, 1);
  assert.equal(c.ZPLParser.parseDocument('kein zpl').labels.length, 1);
  assert.equal(c.ZPLParser.parseDocument('^XA^PW400^FO10,10^A0N,20,0^FDZ^FS').labels.length, 1,
    'unterminated final frame');
  assert.equal(c.ZPLGenerator.generateDocument({ labels: [] }), '');
});

test('generateZPL can omit the shared graphic store', function () {
  const c = load();
  const label = c.ZPLParser.parseZPL('~DGR:L.GRF,8,1,FFFFFFFFFFFFFFFF\n' +
    '^XA^PW400^LL400^FO10,10^XGR:L.GRF,1,1^FS^XZ');
  assert.ok(c.ZPLGenerator.generateZPL(label).indexOf('~DG') !== -1);
  const omitted = c.ZPLGenerator.generateZPL(label, { omitStoredGraphics: true });
  assert.equal(omitted.indexOf('~DG'), -1);
  // The placement itself must stay - only the download moves elsewhere.
  assert.ok(omitted.indexOf('^XGR:L.GRF') !== -1);
});

test('splitFrames reports what sat between the frames', function () {
  const c = load();
  const parts = c.ZPLParser.splitFrames('junk^XAone^XZ mid ^XAtwo^XZtail');
  assert.equal(parts.frames.length, 2);
  assert.equal(parts.frames[0].text, '^XAone^XZ');
  assert.equal(parts.frames[0].between, 'junk');
  assert.equal(parts.frames[1].between, ' mid ');
  assert.equal(parts.trailing, 'tail');
});
