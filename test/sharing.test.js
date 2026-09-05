#!/usr/bin/env node
'use strict';
const assert = require('node:assert/strict');
const zlib = require('node:zlib');
const crypto = require('node:crypto');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
for (const name of ['inflate', 'gfa-codec', 'zpl-model', 'editor-metadata', 'zpl-parser', 'zpl-generator']) require('../zplkit/' + name + '.js');
const S = require('../zplkit/zpl-sharing.js');
const P = globalThis.ZPLParser;
const G = globalThis.ZPLGenerator;
const referenceFragment = bytes => '#share=v1.z.' + zlib.deflateSync(bytes).toString('base64url');
const fragmentFor = value => referenceFragment(Buffer.from(JSON.stringify(value)));
const isCode = code => error => error.code === code;

async function main() {
  const payload = { zpl: '^XA^CI28^FO10,10^A0N,30,30^FDGrüße 日本 🦓^FS^PQ50,10,1,Y,N^XZ', dpi: [300], activeLabel: 0, name: 'Versand.zpl' };
  const fragment = await S.encodeFragment(payload);
  assert.match(fragment, /^#share=v1\.z\.[A-Za-z0-9_-]+$/);
  assert.deepEqual(JSON.parse(zlib.inflateSync(Buffer.from(fragment.split('.').pop(), 'base64url'))), payload);
  assert.deepEqual(await S.decodeFragment(fragment), payload);
  assert.deepEqual(await S.decodeFragment(fragmentFor(payload)), payload);
  const url = await S.createUrl('https://example.org/project/studio/?lang=de#old', payload);
  assert.equal(new URL(url).search, '?lang=de');
  assert.equal(new URL(url).hash, fragment);
  for (const base of ['studio/', 'javascript:alert(1)', 'file:///tmp/studio/', 'https://user:pass@example.org/studio/']) {
    await assert.rejects(S.createUrl(base, payload), isCode('url'));
  }
  for (const value of [null, [], {}, {zpl:''}, {zpl:'x',dpi:203}, {zpl:'x',dpi:[]}, {zpl:'x',dpi:[49]},
    {zpl:'x',dpi:[2401]}, {zpl:'x',dpi:[203.5]}, {zpl:'x',activeLabel:-1}, {zpl:'x',activeLabel:'0'},
    {zpl:'x',dpi:[203],activeLabel:1}, {zpl:'x',name:'../private.zpl'}, {zpl:'x',name:'a\n.zpl'}]) {
    await assert.rejects(S.encodeFragment(value), isCode('invalid'));
    await assert.rejects(S.decodeFragment(fragmentFor(value)), isCode('invalid'));
  }
  for (const malformed of ['#share=v1.z.', '#share=v1.z.a', '#share=v1.z.ab==', '#share=v1.z.%20', 'https://example.org/#share=v1.z.aaa']) {
    await assert.rejects(S.decodeFragment(malformed), isCode('invalid'));
  }
  for (const version of ['v2.z.aaa', 'v1.g.aaa', 'v1.aaa']) await assert.rejects(S.decodeFragment('#share=' + version), isCode('version'));
  const corrupted = Buffer.from(fragment.split('.').pop(), 'base64url');
  corrupted[corrupted.length - 1] ^= 1;
  await assert.rejects(S.decodeFragment('#share=v1.z.' + corrupted.toString('base64url')), isCode('corrupt'));
  await assert.rejects(S.decodeFragment(fragment.slice(0, -4)), error => ['corrupt','invalid'].includes(error.code));
  await assert.rejects(S.decodeFragment(referenceFragment(Buffer.from('{bad json'))), isCode('invalid'));
  await assert.rejects(S.decodeFragment(referenceFragment(Buffer.from([0xc3, 0x28]))), isCode('invalid'));
  // Compression bomb: a tiny input inflates past the limit, before JSON parse.
  await assert.rejects(S.decodeFragment(referenceFragment(Buffer.alloc(S.limits.maxPayloadBytes + 1, 32))), isCode('tooLarge'));
  await assert.rejects(S.encodeFragment({zpl:'x'.repeat(S.limits.maxPayloadBytes)}), isCode('tooLarge'));
  await assert.rejects(S.encodeFragment({zpl:crypto.randomBytes(150000).toString('hex')}), isCode('tooLarge'));
  await assert.rejects(S.decodeFragment('#share=v1.z.'+'a'.repeat(S.limits.maxUrlLength)), isCode('tooLarge'));

  const doc = S.toDocument(await S.decodeFragment(fragment));
  assert.equal(doc.labels[0].settings.dpi, 300);
  assert.equal(doc.labels[0].settings.pq, '50,10,1,Y,N');
  assert.match(G.generateDocument(doc), /Grüße 日本 🦓/);
  const multiple = S.toDocument({zpl:'^XA^MMP,Y^MTD^XZ^XA^MMT^MTT^XZ',dpi:[203,600],activeLabel:1});
  assert.equal(multiple.activeIndex, 1);
  assert.equal(multiple.labels[1].settings.dpi, 600);
  assert.equal(multiple.labels[0].settings.mediaPrepeel, 'Y');
  assert.equal(S.toDocument({zpl:'^XA^XZ',name:'file.300zpl'}).labels[0].settings.dpi, 203); // explicit envelope wins over name
  assert.throws(()=>S.toDocument({zpl:'^XA^XZ^XA^XZ',dpi:[203]}),isCode('invalid'));
  assert.throws(()=>S.toDocument({zpl:'^XA^XZ',activeLabel:1}),isCode('invalid'));
  assert.throws(()=>S.toDocument({zpl:'^XA^XZ'.repeat(257)}),isCode('tooLarge'));

  const authored = globalThis.ZPLModel.defaultLabel();
  authored.elements = [globalThis.ZPLModel.makeText()];
  authored.elements[0].name = 'Versteckter Entwurf';
  authored.elements[0].hidden = true;
  authored.elements[0].locked = true;
  authored.editorGuides = { vertical: [100], horizontal: [200], visible: false };
  const metadataDoc = S.toDocument(await S.decodeFragment(await S.encodeFragment({
    zpl: G.generateZPL(authored), dpi: [300], name: 'Editor.zpl'
  })));
  assert.equal(metadataDoc.labels[0].elements[0].hidden, true);
  assert.equal(metadataDoc.labels[0].elements[0].locked, true);
  assert.deepEqual(metadataDoc.labels[0].editorGuides.vertical, [100]);
  const graphicSpool = '~DGR:LOGO.GRF,2,1,FF00\n^XA^FO0,0^XGR:LOGO.GRF,1,1^FS^XZ^XA^FO10,10^XGR:LOGO.GRF,1,1^FS^XZ';
  const graphics = S.toDocument(await S.decodeFragment(await S.encodeFragment({zpl: graphicSpool, dpi: [203,300], activeLabel: 1})));
  assert.equal(graphics.labels.length, 2);
  assert.equal(Object.keys(graphics.storedGraphics).length, 1);
  assert.equal((G.generateDocument(graphics).match(/~DG/g) || []).length, 1);

  // Standalone codec has no parser dependency; a missing browser API gives a
  // recoverable error rather than emitting a different, ambiguous wire format.
  const codec = fs.readFileSync(path.join(__dirname,'../zplkit/zpl-sharing.js'),'utf8');
  const unsupported = vm.createContext({ TextEncoder });
  vm.runInContext(codec,unsupported);
  await assert.rejects(unsupported.ZPLSharing.encodeFragment({zpl:'^XA^XZ'}),isCode('unsupported'));

  // Run the actual Studio import adapter with controlled asynchronous inputs.
  const app = fs.readFileSync(path.join(__dirname,'../studio/app.js'),'utf8');
  const importCode = app.slice(app.indexOf('  async function importSharedFragment()'), app.indexOf('  function openSharingDialog()'));
  let resolveDecode;
  let loads = 0, prompts = 0, replaced = 0, errors = 0, accepted = false;
  const state = {doc:{}};
  const context = vm.createContext({state, shareImportSequence:0, cleanDocumentSnapshot:'clean',
    serializedDocument:()=> 'dirty', t:key=>key, sharingError:()=> 'bad link',
    confirm:()=>{prompts++;return accepted;}, loadDocument:()=>{loads++;},
    showToast:(message,error)=>{if(error)errors++;},
    window:{location:{hash:fragment,pathname:'/studio/',search:'?x=1'},
      history:{state:null,replaceState:()=>{replaced++;}},
      ZPLSharing:{decodeFragment:()=>new Promise(resolve=>{resolveDecode=resolve;}),toDocument:S.toDocument}}});
  vm.runInContext(importCode,context);
  let pending = context.importSharedFragment();
  resolveDecode(payload); await pending;
  assert.equal(prompts,1); assert.equal(loads,0); assert.equal(replaced,0);
  accepted=true;
  pending=context.importSharedFragment(); resolveDecode(payload); await pending;
  assert.equal(loads,1); assert.equal(replaced,1);
  pending=context.importSharedFragment(); context.window.location.hash='#unrelated'; resolveDecode(payload); await pending;
  assert.equal(loads,1); // stale completion is ignored
  context.window.location.hash=fragment;
  context.window.ZPLSharing.decodeFragment=async()=>{throw Error('bad');};
  await context.importSharedFragment();
  assert.equal(errors,1); assert.equal(loads,1);
  context.serializedDocument = () => 'clean';
  context.window.ZPLSharing.decodeFragment = async () => payload;
  accepted = false;
  const previousPrompts = prompts;
  await context.importSharedFragment();
  assert.equal(loads, 2); assert.equal(prompts, previousPrompts);
  context.window.ZPLSharing.decodeFragment = () => new Promise(resolve => { resolveDecode = resolve; });
  pending = context.importSharedFragment();
  state.doc = {}; // another, clean file opened while the link was decoding
  resolveDecode(payload); await pending;
  assert.equal(loads, 2); assert.equal(prompts, previousPrompts + 1);
  console.log('Sharing: Unicode, independent zlib interoperability, validation, limits, DPI and protected Studio imports passed.');
}
main().catch(error=>{console.error(error);process.exitCode=1;});
