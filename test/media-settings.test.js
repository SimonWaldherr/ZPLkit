#!/usr/bin/env node
'use strict';
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const ctx = vm.createContext({ performance: { now: () => 0 } });
for (const name of ['zpl-model', 'zpl-dpi', 'zpl-parser', 'zpl-generator']) {
  vm.runInContext(fs.readFileSync(path.join(__dirname, '../zplkit/' + name + '.js'), 'utf8'), ctx);
}
const M = ctx.ZPLModel, P = ctx.ZPLParser, G = ctx.ZPLGenerator;
function parse(commands) { return P.parseZPL('^XA' + commands + '^FO10,10^A0N,20,20^FDTest^FS^XZ'); }

// All mode choices, omitted/explicit prepeel and reserved imported modes.
for (const mode of ['T', 'P', 'R', 'A', 'C', 'D', 'F', 'K', 'L', 'U', 'Z']) {
  for (const suffix of ['', ',', ',N', ',Y']) {
    const label = parse('^MM' + mode + suffix);
    assert.equal(label.settings.mediaTracking, mode);
    assert.equal(label.settings.mediaPrepeel, suffix ? suffix.slice(1) : null);
    label.settings.note = 'Unrelated edit';
    const output = G.generateZPL(label);
    assert.ok(output.includes('^MM' + mode + suffix + '\n'));
    assert.equal((output.match(/\^MM/g) || []).length, 1);
    assert.equal(P.parseZPL(output).settings.mediaPrepeel, label.settings.mediaPrepeel);
  }
}
for (const method of ['D', 'T']) {
  for (const sensing of ['N', 'Y', 'W', 'M', 'A', 'V']) {
    for (const suffix of ['', ',', ',0', ',-80', ',+003']) {
      const label = parse('^MMP,Y^MT' + method + '^MN' + sensing + suffix);
      assert.equal(label.settings.printMethod, method);
      assert.equal(label.settings.mediaSensing, sensing);
      assert.equal(label.settings.blackMarkOffset, suffix ? suffix.slice(1) : null);
      assert.equal(label.rawTail.length, 0);
      const output = G.generateZPL(label);
      assert.ok(output.includes('^MT' + method + '\n'));
      assert.ok(output.includes('^MN' + sensing + suffix + '\n'));
      assert.equal(P.parseZPL(output).settings.blackMarkOffset, label.settings.blackMarkOffset);
    }
  }
}
// Imported omissions must preserve the printer's configuration. New labels
// still default to Tear-off, while explicit "unchanged" survives a reload.
assert.equal(parse('').settings.mediaTracking, null);
assert.ok(!G.generateZPL(parse('')).includes('^MM'));
const fresh = M.defaultLabel();
assert.ok(G.generateZPL(fresh).includes('^MMT\n'));
fresh.settings.mediaTracking = null;
assert.equal(P.parseZPL(G.generateZPL(fresh)).settings.mediaTracking, null);
assert.ok(!G.generateZPL(fresh).includes('^MT'));
assert.ok(!G.generateZPL(fresh).includes('^MN'));
const label = parse('^MMP,Y^MTT^MNM,-10');
label.settings.mediaTracking = 'C';
assert.ok(G.generateZPL(label).includes('^MMC,Y'));
label.settings.printMethod = null;
label.settings.mediaSensing = null;
assert.ok(!G.generateZPL(label).includes('^MT'));
assert.ok(!G.generateZPL(label).includes('^MN'));

// Future/malformed parameters remain complete raw commands, without a
// synthetic ^MMT that would override an installed Peel-off setup.
for (const command of ['^MMP,Y,extra', '^MM,Y', '^MMP,X', '^MTX', '^MTD,extra', '^MNM,-10,extra', '^MNM,abc']) {
  const label = parse(command);
  assert.ok(label.rawTail.some(entry => entry.raw.includes(command)));
  assert.ok(G.generateZPL(label).includes(command));
  assert.ok(!G.generateZPL(label).includes('^MMT'));
}
const doc = P.parseDocument('^XA^MMP,Y^MTD^MNM,0^XZ^XA^MMT^MTT^MNY^XZ');
const again = P.parseDocument(G.generateDocument(doc));
assert.equal(again.labels.length, 2);
assert.equal(again.labels[0].settings.mediaPrepeel, 'Y');
assert.equal(again.labels[1].settings.mediaPrepeel, null);
assert.equal(again.labels[0].settings.printMethod, 'D');
assert.equal(again.labels[1].settings.printMethod, 'T');
// Black-mark offsets use dots and must follow the physical DPI conversion.
const scaled = parse('^MMP,Y^MTD^MNM,-20');
const dry = ctx.ZPLDpi.convertLabel(scaled, 203, 300, { dryRun: true });
assert.equal(scaled.settings.blackMarkOffset, '-20');
assert.ok(dry.warnings.some(w => w.code === 'black-mark-range'));
ctx.ZPLDpi.convertLabel(scaled, 203, 300, { label: false });
assert.equal(scaled.settings.blackMarkOffset, '-20');
ctx.ZPLDpi.convertLabel(scaled, 203, 300);
assert.equal(scaled.settings.blackMarkOffset, -30);
assert.equal(scaled.settings.mediaPrepeel, 'Y');
assert.equal(scaled.settings.printMethod, 'D');
assert.ok(G.generateZPL(scaled).includes('^MNM,-30'));
console.log('Media settings: modes, prepeel, thermal method, sensing and lossless imports passed.');
