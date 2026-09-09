// Usage: node scripts/benchmark-gfa.cjs /path/to/previous/gfa-codec.js
// Compare wire compatibility and median timings; no timing thresholds in CI.
const fs = require('node:fs');
const vm = require('node:vm');
const assert = require('node:assert/strict');
function load(path) {
  const context = vm.createContext({ Uint8Array, Uint16Array });
  vm.runInContext(fs.readFileSync(path, 'utf8'), context);
  return context.ZPLGraphic;
}
if (!process.argv[2]) throw new Error('Provide the previous gfa-codec.js path');
const before = load(process.argv[2]);
const after = load(require('node:path').join(__dirname, '../zplkit/gfa-codec.js'));
let state = 42;
function random() { state = (Math.imul(state, 1664525) + 1013904223) >>> 0; return state >>> 24; }
for (let i = 0; i < 200; i++) {
  const width = 1 + random(), height = 1 + random();
  const bytes = Uint8Array.from({ length: width * height }, random);
  if (i % 2) for (let row = 1; row < height; row++) bytes.copyWithin(row * width, 0, width);
  for (const compress of [false, true]) {
    assert.equal(after.bitsToGF(bytes, width, height, { compress }), before.bitsToGF(bytes, width, height, { compress }));
    assert.equal(after.bitsToDG(bytes, 'R:X.GRF', width, height, { compress }), before.bitsToDG(bytes, 'R:X.GRF', width, height, { compress }));
  }
}
console.log('200 randomized images: GF/DG byte-identical in both compression modes');
const width = 500, height = 2000;
const repeated = Uint8Array.from({length: width * height}, (_, i) => i % width % 256);
const noise = Uint8Array.from({length: width * height}, random);
function median(fn) {
  for (let i = 0; i < 3; i++) fn();
  const times = [];
  for (let i = 0; i < 9; i++) { const start = performance.now(); fn(); times.push(performance.now() - start); }
  return times.sort((a,b) => a-b)[4];
}
for (const [name, fn] of [
  ['repeated-row export', c => c.bitsToGF(repeated, width, height)],
  ['noise export', c => c.bitsToGF(noise, width, height)],
  ['CRC 1 MB', c => c.crc16(noise, 0)],
]) {
  const a = median(() => fn(before)), b = median(() => fn(after));
  console.log(`${name}: ${a.toFixed(2)} -> ${b.toFixed(2)} ms (${(a/b).toFixed(2)}x)`);
}
