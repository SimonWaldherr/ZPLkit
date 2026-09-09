// Usage: node scripts/benchmark-diff.cjs /path/to/previous/zpl-diff.js
// Reports warmed median times, checks exact output; no timing gate in CI.
'use strict';
const fs = require('node:fs');
const path = require('node:path');
const assert = require('node:assert/strict');
function load(file) {
  // Isolate module exports while using native built-ins in both versions.
  return new Function('globalThis', fs.readFileSync(file, 'utf8') +
    '\nreturn globalThis.ZPLDiff.diffLines;')({});
}
if (!process.argv[2]) throw new Error('Provide the previous zpl-diff.js path');
const before = load(process.argv[2]);
const after = load(path.join(__dirname, '../zplkit/zpl-diff.js'));
function median(fn) {
  for (let i = 0; i < 3; i++) fn();
  const times = [];
  for (let i = 0; i < 9; i++) {
    const start = performance.now(); fn(); times.push(performance.now() - start);
  }
  return times.sort((a, b) => a - b)[4];
}
const lines = Array.from({ length: 2500 }, (_, i) => '^FDline ' + i + '^FS');
const source = lines.join('\n');
const replacement = lines.slice(); replacement[2400] = '^FDchanged^FS';
for (const [name, a, b] of [
  ['identical 2500 lines', source, source],
  ['late edit, 2500 lines', source, replacement.join('\n')],
  ['all replaced, 2500 lines', source, lines.map(x => x + 'new').join('\n')],
]) {
  assert.equal(JSON.stringify(after(a, b)), JSON.stringify(before(a, b)));
  const oldMs = median(() => before(a, b)), newMs = median(() => after(a, b));
  console.log(`${name}: ${oldMs.toFixed(2)} -> ${newMs.toFixed(2)} ms (${(oldMs / newMs).toFixed(2)}x)`);
}
