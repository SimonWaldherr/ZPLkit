#!/usr/bin/env node
'use strict';

/*
 * Contract tests for zplkit/qrcode.js — the QR Code (ISO/IEC 18004) encoder
 * behind ^BQ. DOM-free, so this runs in the same verifier as the other node
 * tests.
 *
 * Two things make these tests stronger than "the code agrees with itself":
 *
 * 1. BYTE_CAPACITY below is the published character-capacity table, fetched
 *    from a reference OUTSIDE this repository. The module's own
 *    DATA_CODEWORDS table is checked against it for all 160 version/level
 *    combinations, and the encoder is driven to the exact byte where each
 *    combination must stop fitting. An earlier draft of the module had its
 *    H column shifted by one from version 38 up - a defect that produces a
 *    structurally perfect but unscannable symbol only at the very top of the
 *    version range, and that this check catches immediately.
 *
 * 2. GOLDEN below are complete module matrices that were confirmed to DECODE
 *    back to their payload by jsQR - an independent decoder, not this code.
 *    Node has no barcode decoder, so pinning the verified output is how that
 *    verification stays permanent instead of being a one-off.
 */
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');

function loadQr() {
  const context = { console: console };
  context.globalThis = context;
  vm.createContext(context);
  const source = fs.readFileSync(path.join(__dirname, '..', 'zplkit', 'qrcode.js'), 'utf8');
  vm.runInContext(source, context, { filename: 'zplkit/qrcode.js' });
  return context.ZPLQr;
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

// QR code objects are produced inside a vm context. Convert compound values
// to host-realm JSON data before strict structural assertions; otherwise
// recent Node releases compare the foreign Array/Object prototypes too and
// report matching data as "not reference-equal".
function toPlain(value) {
  return JSON.parse(JSON.stringify(value));
}

const LEVELS = ['L', 'M', 'Q', 'H'];

// ISO/IEC 18004 byte-mode character capacity, [version] -> [L, M, Q, H].
const BYTE_CAPACITY = {
  1: [17, 14, 11, 7], 2: [32, 26, 20, 14], 3: [53, 42, 32, 24], 4: [78, 62, 46, 34],
  5: [106, 84, 60, 44], 6: [134, 106, 74, 58], 7: [154, 122, 86, 64], 8: [192, 152, 108, 84],
  9: [230, 180, 130, 98], 10: [271, 213, 151, 119], 11: [321, 251, 177, 137], 12: [367, 287, 203, 155],
  13: [425, 331, 241, 177], 14: [458, 362, 258, 194], 15: [520, 412, 292, 220], 16: [586, 450, 322, 250],
  17: [644, 504, 364, 280], 18: [718, 560, 394, 310], 19: [792, 624, 442, 338], 20: [858, 666, 482, 382],
  21: [929, 711, 509, 403], 22: [1003, 779, 565, 439], 23: [1091, 857, 611, 461], 24: [1171, 911, 661, 511],
  25: [1273, 997, 715, 535], 26: [1367, 1059, 751, 593], 27: [1465, 1125, 805, 625], 28: [1528, 1190, 868, 658],
  29: [1628, 1264, 908, 698], 30: [1732, 1370, 982, 742], 31: [1840, 1452, 1030, 790], 32: [1952, 1538, 1112, 842],
  33: [2068, 1628, 1168, 898], 34: [2188, 1722, 1228, 958], 35: [2303, 1809, 1283, 983], 36: [2431, 1911, 1351, 1051],
  37: [2563, 1989, 1423, 1093], 38: [2699, 2099, 1499, 1139], 39: [2809, 2213, 1579, 1219], 40: [2953, 2331, 1663, 1273],
};

// Symbols whose payload jsQR read back correctly. `modules` is the matrix
// packed MSB-first, row-major, base64 - regenerating one of these by hand
// means re-running the browser harness, which is the point: they are not
// allowed to drift silently.
const GOLDEN = [
  { text: 'HELLO WORLD', ec: 'M', mask: 4, version: 1, size: 21, mode: 'alphanumeric',
    modules: '/ov8EdBunLt1FduprsFVB/qv4BQAi+/OYl8qwmt5c8Bnc4B8o/tIMEj6uu9t03PuiwkEcZ/vOYA=' },
  { text: '12345678', ec: 'L', mask: null, version: 1, size: 21, usedMask: 3, mode: 'numeric',
    modules: '/sv8ElBuqrt1JduuLsEBB/qv4AwA8qTqA0vem+ihmBi9SQByp/ka0EPNunIt1SSurSkF9b/pkQA=' },
  { text: 'https://example.com/etikett?id=4711', ec: 'Q', mask: null, version: 4, size: 33, usedMask: 7, mode: 'byte',
    modules: '/oQTP8E8Z5BuppJrt1xKpdukcWLsFzl5B/qqqv4BU70AV/yUdsbqBHhbktWGvbNIFZt7IRtaaTA7zrskJb0J4i5CvxLcrVxPZuq28uCY8oblojO2QTAL6afRD160uMrikAhwp/a8/IBGzcZ/ufMr0FJtEQunUC/V1t7heunVmTMFZMmA/kcF7QA=' },
  { text: 'Größe: 12 Stück', ec: 'H', mask: null, version: 3, size: 29, usedMask: 2, mode: 'byte',
    modules: '/r4r/BeXkG69zrt0RPXbomMuwV0VB/qqr+AWUAA6wS89iQImfJZawOL9xNC2XphA6qsHyJcMh6qw3dq/ohUDJWyhsNRZcqLxePNf/wBZFEP5COuQQnkWutNP9ddXZy6uSsUEReiv5nQaAA==' },
  { text: 'ZPLKIT', ec: 'L', mask: 0, version: 1, size: 21, mode: 'alphanumeric',
    modules: '/lv8E5Butrt0pduirsEFB/qv4BsA7/YiqxCg4jKKROi6q4Bqv/tccFe1urdt0hqusjsFRn/sqoA=' },
  { text: 'ZPLKIT', ec: 'L', mask: 7, version: 1, size: 21, mode: 'alphanumeric',
    modules: '/lv8FpBusrt0pduorsFNB/qv4B8A02OyqxCyqxbDYHi6q4B49/sVUEe1uhP91ojukjsFD1/tjgA=' },
];

function packModules(result) {
  const bytes = Buffer.alloc(Math.ceil(result.modules.length / 8));
  for (let i = 0; i < result.modules.length; i++) {
    if (result.modules[i]) bytes[i >> 3] |= 1 << (7 - (i & 7));
  }
  return bytes.toString('base64');
}

test('the two capacity tables agree for every version and level', function () {
  const Qr = loadQr();
  assert.deepEqual(toPlain(Qr.assertBlockStructure()), []);
});

test('data codewords match the published byte-mode capacity table', function () {
  const Qr = loadQr();
  const bad = [];
  for (let v = 1; v <= 40; v++) {
    for (let e = 0; e < 4; e++) {
      // capacity = data codewords minus the mode indicator (4 bits) and the
      // character-count field (8 bits below v10, 16 from v10), rounded up.
      const overhead = v <= 9 ? 2 : 3;
      const expected = BYTE_CAPACITY[v][e] + overhead;
      const got = Qr.numDataCodewords(v, e);
      if (got !== expected) bad.push('v' + v + LEVELS[e] + ': ' + got + ' statt ' + expected);
    }
  }
  assert.deepEqual(bad, []);
});

test('derived block counts match ISO/IEC 18004 Table 9', function () {
  const Qr = loadQr();
  // The v38-40 H rows are the ones an earlier draft got wrong; v14-Q and
  // v32-H are the irregular entries a formula would miss.
  const cases = [[1, 'L', 1], [7, 'H', 5], [14, 'Q', 16], [32, 'H', 54],
    [38, 'L', 22], [38, 'M', 45], [38, 'Q', 62], [38, 'H', 74],
    [39, 'H', 77], [40, 'L', 25], [40, 'M', 49], [40, 'Q', 68], [40, 'H', 81]];
  cases.forEach(function (c) {
    assert.equal(Qr.numEccBlocks(c[0], LEVELS.indexOf(c[1])), c[2], 'v' + c[0] + c[1]);
  });
});

test('the capacity boundary is exact: the last byte fits, the next does not', function () {
  const Qr = loadQr();
  const bad = [];
  for (let v = 1; v <= 40; v++) {
    for (let e = 0; e < 4; e++) {
      const max = BYTE_CAPACITY[v][e];
      const opts = { ecLevel: LEVELS[e], minVersion: v, maxVersion: v };
      if (!Qr.encode([{ text: 'A'.repeat(max), mode: 'byte' }], opts).ok) {
        bad.push('v' + v + LEVELS[e] + ': ' + max + ' Bytes passen nicht');
      }
      if (Qr.encode([{ text: 'A'.repeat(max + 1), mode: 'byte' }], opts).ok) {
        bad.push('v' + v + LEVELS[e] + ': ' + (max + 1) + ' Bytes passen fälschlich noch');
      }
    }
  }
  assert.deepEqual(bad, []);
});

test('reproduces symbols an independent decoder read back correctly', function () {
  const Qr = loadQr();
  GOLDEN.forEach(function (g) {
    const r = Qr.encode(g.text, { ecLevel: g.ec, mask: g.mask });
    const where = JSON.stringify(g.text) + ' / ' + g.ec + ' / Maske ' + g.mask;
    assert.equal(r.ok, true, where + ': ' + r.error);
    assert.equal(r.version, g.version, where + ' Version');
    assert.equal(r.size, g.size, where + ' Größe');
    assert.equal(r.mode, g.mode, where + ' Modus');
    assert.equal(r.mask, g.mask == null ? g.usedMask : g.mask, where + ' Maske');
    assert.equal(packModules(r), g.modules, where + ': Modulmatrix weicht ab');
  });
});

test('draws the function patterns the spec requires', function () {
  const Qr = loadQr();
  const r = Qr.encode('FUNKTIONSMUSTER', { ecLevel: 'M' });
  const n = r.size;
  const at = function (x, y) { return r.modules[y * n + x]; };

  // Finder pattern: dark 7x7 ring, light ring at Chebyshev distance 2, dark core.
  [[0, 0], [n - 7, 0], [0, n - 7]].forEach(function (p) {
    for (let dy = 0; dy < 7; dy++) {
      for (let dx = 0; dx < 7; dx++) {
        const want = Math.max(Math.abs(dx - 3), Math.abs(dy - 3)) !== 2 ? 1 : 0;
        assert.equal(at(p[0] + dx, p[1] + dy), want, 'Finder ' + p + ' bei ' + dx + ',' + dy);
      }
    }
  });
  // Separator: the row/column just outside each finder is light.
  for (let i = 0; i < 8; i++) {
    assert.equal(at(7, i), 0);
    assert.equal(at(i, 7), 0);
    assert.equal(at(n - 8, i), 0);
    assert.equal(at(7, n - 1 - i), 0);
  }
  // Timing patterns alternate along row/column 6.
  for (let i = 8; i < n - 8; i++) {
    assert.equal(at(i, 6), i % 2 === 0 ? 1 : 0, 'Timing x=' + i);
    assert.equal(at(6, i), i % 2 === 0 ? 1 : 0, 'Timing y=' + i);
  }
  // The one permanently dark module.
  assert.equal(at(8, n - 8), 1);
});

test('places alignment patterns where the spec says', function () {
  const Qr = loadQr();
  const expected = {
    1: [], 2: [6, 18], 7: [6, 22, 38], 14: [6, 26, 46, 66],
    21: [6, 28, 50, 72, 94], 32: [6, 34, 60, 86, 112, 138], 40: [6, 30, 58, 86, 114, 142, 170],
  };
  Object.keys(expected).forEach(function (v) {
    assert.deepEqual(toPlain(Qr.alignmentPatternPositions(Number(v))), expected[v], 'Version ' + v);
  });
});

test('picks the densest mode that fits the data', function () {
  const Qr = loadQr();
  assert.equal(Qr.encode('12345').mode, 'numeric');
  assert.equal(Qr.encode('HELLO WORLD').mode, 'alphanumeric');
  assert.equal(Qr.encode('Hello world').mode, 'byte'); // lower case is not in the alphanumeric set
  assert.equal(Qr.encode('Größe').mode, 'byte');
  // Denser really means smaller: the same 40 characters need a lower version
  // as digits than as raw bytes.
  const numeric = Qr.encode('1'.repeat(40), { ecLevel: 'M' });
  const bytes = Qr.encode([{ text: '1'.repeat(40), mode: 'byte' }], { ecLevel: 'M' });
  assert.ok(numeric.version < bytes.version, 'v' + numeric.version + ' vs v' + bytes.version);
});

test('honours a forced mask and is deterministic without one', function () {
  const Qr = loadQr();
  for (let mask = 0; mask <= 7; mask++) {
    assert.equal(Qr.encode('MASKE', { ecLevel: 'M', mask: mask }).mask, mask);
  }
  const a = Qr.encode('DETERMINISMUS', { ecLevel: 'Q' });
  const b = Qr.encode('DETERMINISMUS', { ecLevel: 'Q' });
  assert.equal(a.mask, b.mask);
});

test('fails cleanly instead of throwing', function () {
  const Qr = loadQr();
  const tooBig = Qr.encode('X'.repeat(5000), { ecLevel: 'H' });
  assert.equal(tooBig.ok, false);
  assert.match(tooBig.error, /passt in keinen/);
  assert.equal(tooBig.modules.length, 0);
  // Data that does not belong to the declared mode is a caller error, not a
  // reason to emit a broken symbol.
  assert.equal(Qr.encode([{ text: 'ABC', mode: 'numeric' }], { ecLevel: 'M' }).ok, false);
  assert.equal(Qr.encode([{ text: 'abc', mode: 'alphanumeric' }], { ecLevel: 'M' }).ok, false);
  assert.equal(Qr.encode('X', { ecLevel: 'Z' }).ok, false);
});

test('splits ZPL ^BQ field data into its control prefix and payload', function () {
  const Qr = loadQr();

  const auto = Qr.parseFieldData('QA,https://example.com/x');
  assert.equal(auto.ecLevel, 'Q');
  assert.equal(auto.inputMode, 'A');
  assert.equal(auto.prefix, 'QA,');
  assert.equal(auto.payload, 'https://example.com/x');

  const manual = Qr.parseFieldData('HM,N0123456789');
  assert.equal(manual.ecLevel, 'H');
  assert.equal(manual.inputMode, 'M');
  assert.deepEqual(toPlain(manual.segments), [{ text: '0123456789', mode: 'numeric' }]);

  // Manual mode chains "<character mode><data>" chunks; B carries a 4-digit
  // byte count rather than running to the next comma.
  const mixed = Qr.parseFieldData('MM,AHELLO,B0004test');
  assert.deepEqual(toPlain(mixed.segments), [
    { text: 'HELLO', mode: 'alphanumeric' },
    { text: 'test', mode: 'byte' },
  ]);

  // Model-1 style puts a mask digit in front.
  const model1 = Qr.parseFieldData('3,MA,Inhalt');
  assert.equal(model1.mask, 3);
  assert.equal(model1.ecLevel, 'M');
  assert.equal(model1.payload, 'Inhalt');

  // A bare ^FD makes no claim and is pure payload - which is also what a
  // printer does with it.
  const bare = Qr.parseFieldData('https://example.com');
  assert.equal(bare.prefix, '');
  assert.equal(bare.ecLevel, null);
  assert.equal(bare.payload, 'https://example.com');
});

test('the field-data prefix outranks the ^BQ command parameters', function () {
  const Qr = loadQr();
  assert.equal(Qr.encodeFieldData('HA,TEST', { ecLevel: 'L' }).ecLevel, 'H');
  assert.equal(Qr.encodeFieldData('TEST', { ecLevel: 'L' }).ecLevel, 'L');
  // With neither, ZPL's own ^BQ default applies.
  assert.equal(Qr.encodeFieldData('TEST', {}).ecLevel, 'Q');
  assert.equal(Qr.encodeFieldData('', {}).ok, false);
});

test('encodes a surrogate pair as one UTF-8 code point', function () {
  const Qr = loadQr();
  // Naively encoding each UTF-16 half separately produces two invalid 3-byte
  // sequences, which decodes to mojibake rather than the emoji.
  const withEmoji = Qr.encode('A😀B', { ecLevel: 'L' });
  assert.equal(withEmoji.ok, true);
  const plain = Qr.encode([{ text: 'A' + 'ð' + 'B', mode: 'byte' }], { ecLevel: 'L' });
  // 1 + 4 + 1 = 6 UTF-8 bytes either way, so both land in the same version.
  assert.equal(withEmoji.version, plain.version);
});
