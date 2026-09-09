#!/usr/bin/env node
'use strict';
const assert = require('node:assert/strict');
require('../zplkit/zpl-diff.js');
const { diffLines } = globalThis.ZPLDiff;

// Full-table reference deliberately retains the simple recurrence and
// deletion-first tie rule to catch changes in ambiguous repeated lines.
function reference(textA, textB) {
  const a = textA.split('\n'), b = textB.split('\n');
  const dp = Array.from({ length: a.length + 1 }, () => new Uint32Array(b.length + 1));
  for (let i = a.length - 1; i >= 0; i--) {
    for (let j = b.length - 1; j >= 0; j--) {
      dp[i][j] = a[i] === b[j] ? dp[i + 1][j + 1] + 1 : Math.max(dp[i + 1][j], dp[i][j + 1]);
    }
  }
  const out = [];
  let i = 0, j = 0;
  while (i < a.length && j < b.length) {
    if (a[i] === b[j]) { out.push({ type: 'same', line: a[i++] }); j++; }
    else if (dp[i + 1][j] >= dp[i][j + 1]) out.push({ type: 'del', line: a[i++] });
    else out.push({ type: 'add', line: b[j++] });
  }
  while (i < a.length) out.push({ type: 'del', line: a[i++] });
  while (j < b.length) out.push({ type: 'add', line: b[j++] });
  return out;
}
function check(a, b) {
  const result = diffLines(a, b);
  assert.deepEqual(result, reference(a, b));
  assert.equal(result.filter(x => x.type !== 'add').map(x => x.line).join('\n'), a);
  assert.equal(result.filter(x => x.type !== 'del').map(x => x.line).join('\n'), b);
}
const texts = ['', '\n', '^XA\r\n^XZ\r\n', 'ä\n🙂\n'];
for (let length = 1; length <= 5; length++) {
  for (let mask = 0; mask < 2 ** length; mask++) {
    texts.push(Array.from({ length }, (_, bit) => mask & (1 << bit) ? 'a' : 'b').join('\n'));
  }
}
for (const a of texts) for (const b of texts) check(a, b);
let state = 42;
function random(n) { state = (Math.imul(state, 1664525) + 1013904223) >>> 0; return state % n; }
for (let i = 0; i < 500; i++) {
  const a = Array.from({ length: 1 + random(100) }, () => String(random(7))).join('\n');
  const b = Array.from({ length: 1 + random(100) }, () => String(random(7))).join('\n');
  check(a, b);
}
// A large common prefix must not create a quadratic table (or overflow a
// 16-bit score). Also exercise the no-table append/delete paths.
const lines = Array.from({ length: 70000 }, (_, i) => 'line ' + i);
const source = lines.join('\n');
assert.deepEqual(diffLines(source, source), lines.map(line => ({ type: 'same', line })));
assert.equal(diffLines(source, source + '\nnew').at(-1).type, 'add');
assert.equal(diffLines(source + '\nold', source).at(-1).type, 'del');
assert.deepEqual(diffLines(source + '\nold', source + '\nnew').slice(-2), [
  { type: 'del', line: 'old' }, { type: 'add', line: 'new' },
]);
console.log('✓ line diff: exhaustive ties, randomized reference parity and large common prefixes');
