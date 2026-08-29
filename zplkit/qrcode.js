/* ZPLkit — QR Code (ISO/IEC 18004) encoder.

   Unlike Data Matrix, Aztec and MaxiCode - which this editor renders as
   clearly-labeled placeholders because a spec-complete encoder for them is a
   much larger undertaking - QR Code is implemented for real here: the module
   matrix this produces is the same one a printer produces, so the on-screen
   preview and every raster export (PNG/PDF/GIF) carry a genuinely scannable
   symbol rather than a decorative approximation.

   That matters because ^BQ is one of the most common commands on real
   labels, and a placeholder would silently block the whole raster export
   path (see inspectRasterOutput's 'placeholder-barcode' blocker).

   Scope: model 2 symbols, versions 1-40, error-correction levels L/M/Q/H,
   numeric / alphanumeric / byte (UTF-8) segments, all 8 mask patterns with
   the spec's own penalty-based automatic selection. Kanji mode (ZPL's 'K'
   character mode) is NOT encoded - it needs a Shift-JIS table this project
   has no other use for; such a segment is encoded as byte-mode UTF-8
   instead, which every reader still decodes correctly, just less densely.

   Depends on nothing. Attaches global ZPLQr. */
(function (global) {
  'use strict';

  const MIN_VERSION = 1;
  const MAX_VERSION = 40;

  // Error-correction levels, in the SPEC's numeric order (which is not the
  // "amount of redundancy" order): the two-bit format value differs again,
  // hence formatBits being carried separately rather than derived.
  const ECC = {
    L: { name: 'L', ordinal: 0, formatBits: 1 }, // ~7% recovery
    M: { name: 'M', ordinal: 1, formatBits: 0 }, // ~15%
    Q: { name: 'Q', ordinal: 2, formatBits: 3 }, // ~25%
    H: { name: 'H', ordinal: 3, formatBits: 2 }, // ~30%
  };

  // ISO/IEC 18004 Table 9: error-correction codewords per block, indexed
  // [eccOrdinal][version]; index 0 is unused so `version` indexes directly.
  const ECC_CODEWORDS_PER_BLOCK = [
    // L
    [-1, 7, 10, 15, 20, 26, 18, 20, 24, 30, 18, 20, 24, 26, 30, 22, 24, 28, 30, 28, 28, 28, 28, 30, 30, 26, 28, 30, 30, 30, 30, 30, 30, 30, 30, 30, 30, 30, 30, 30, 30],
    // M
    [-1, 10, 16, 26, 18, 24, 16, 18, 22, 22, 26, 30, 22, 22, 24, 24, 28, 28, 26, 26, 26, 26, 28, 28, 28, 28, 28, 28, 28, 28, 28, 28, 28, 28, 28, 28, 28, 28, 28, 28, 28],
    // Q
    [-1, 13, 22, 18, 26, 18, 24, 18, 22, 20, 24, 28, 26, 24, 20, 30, 24, 28, 28, 26, 30, 28, 30, 30, 30, 30, 28, 30, 30, 30, 30, 30, 30, 30, 30, 30, 30, 30, 30, 30, 30],
    // H
    [-1, 17, 28, 22, 16, 22, 28, 26, 26, 24, 28, 24, 28, 22, 24, 24, 30, 28, 28, 26, 28, 30, 24, 30, 30, 30, 30, 30, 30, 30, 30, 30, 30, 30, 30, 30, 30, 30, 30, 30, 30],
  ];

  // ISO/IEC 18004 Table 7: total DATA codewords per version and level.
  //
  // The block COUNT is deliberately not a second hand-transcribed table -
  // it is derived from this one (see numEccBlocks). Two independent tables
  // that must agree is exactly the shape a silent off-by-one hides in: an
  // earlier draft of this file had the H column shifted by one from version
  // 38 upwards, which produced a structurally valid but unscannable symbol
  // only at the very top of the version range. Deriving instead means a bad
  // entry cannot stay consistent - the division below stops coming out
  // whole, and assertBlockStructure() catches it for all 160 combinations.
  //
  // These numbers are also cross-checkable against the far more widely
  // published byte-mode capacity table: capacity = data - 2 for versions
  // 1-9 and data - 3 for 10-40 (the mode indicator plus the character-count
  // field). test/qrcode.test.js checks exactly that, for every combination.
  const DATA_CODEWORDS = [
    // L
    [-1, 19, 34, 55, 80, 108, 136, 156, 194, 232, 274, 324, 370, 428, 461, 523, 589, 647, 721, 795, 861, 932, 1006, 1094, 1174, 1276, 1370, 1468, 1531, 1631, 1735, 1843, 1955, 2071, 2191, 2306, 2434, 2566, 2702, 2812, 2956],
    // M
    [-1, 16, 28, 44, 64, 86, 108, 124, 154, 182, 216, 254, 290, 334, 365, 415, 453, 507, 563, 627, 669, 714, 782, 860, 914, 1000, 1062, 1128, 1193, 1267, 1373, 1455, 1541, 1631, 1725, 1812, 1914, 1992, 2102, 2216, 2334],
    // Q
    [-1, 13, 22, 34, 48, 62, 76, 88, 110, 132, 154, 180, 206, 244, 261, 295, 325, 367, 397, 445, 485, 512, 568, 614, 664, 718, 754, 808, 871, 911, 985, 1033, 1115, 1171, 1231, 1286, 1354, 1426, 1502, 1582, 1666],
    // H
    [-1, 9, 16, 26, 36, 46, 60, 66, 86, 100, 122, 140, 158, 180, 197, 223, 253, 283, 313, 341, 385, 406, 442, 464, 514, 538, 596, 628, 661, 701, 745, 793, 845, 901, 961, 986, 1054, 1096, 1142, 1222, 1276],
  ];

  // Penalty weights from the spec's evaluation rules 1-4.
  const PENALTY_N1 = 3;
  const PENALTY_N2 = 3;
  const PENALTY_N3 = 40;
  const PENALTY_N4 = 10;

  const ALPHANUMERIC_CHARSET = '0123456789ABCDEFGHIJKLMNOPQRSTUVWXYZ $%*+-./:';

  // ---------------------------------------------------------------------
  // GF(256) arithmetic for Reed-Solomon, primitive polynomial x^8+x^4+x^3+x^2+1
  // (0x11D), generator 2 - the field the QR spec mandates.
  // ---------------------------------------------------------------------
  const GF_EXP = new Uint8Array(512);
  const GF_LOG = new Uint8Array(256);
  (function buildTables() {
    let x = 1;
    for (let i = 0; i < 255; i++) {
      GF_EXP[i] = x;
      GF_LOG[x] = i;
      x <<= 1;
      if (x & 0x100) x ^= 0x11D;
    }
    // Duplicated upper half so a product's exponent sum never needs a modulo.
    for (let i = 255; i < 512; i++) GF_EXP[i] = GF_EXP[i - 255];
  })();

  function gfMultiply(a, b) {
    if (a === 0 || b === 0) return 0;
    return GF_EXP[GF_LOG[a] + GF_LOG[b]];
  }

  // Coefficients of the generator polynomial for `degree` EC codewords,
  // highest power first, with the implicit leading 1 omitted.
  const generatorCache = {};
  function reedSolomonGenerator(degree) {
    if (generatorCache[degree]) return generatorCache[degree];
    const result = new Uint8Array(degree);
    result[degree - 1] = 1;
    let root = 1;
    for (let i = 0; i < degree; i++) {
      for (let j = 0; j < degree; j++) {
        result[j] = gfMultiply(result[j], root);
        if (j + 1 < degree) result[j] ^= result[j + 1];
      }
      root = gfMultiply(root, 2);
    }
    generatorCache[degree] = result;
    return result;
  }

  function reedSolomonRemainder(data, degree) {
    const generator = reedSolomonGenerator(degree);
    const result = new Uint8Array(degree);
    for (let i = 0; i < data.length; i++) {
      const factor = data[i] ^ result[0];
      result.copyWithin(0, 1);
      result[degree - 1] = 0;
      for (let j = 0; j < degree; j++) result[j] ^= gfMultiply(generator[j], factor);
    }
    return result;
  }

  // ---------------------------------------------------------------------
  // Capacity math
  // ---------------------------------------------------------------------

  // Modules available for data + EC in a version, before the format/version
  // information and function patterns are subtracted differently per version.
  function numRawDataModules(version) {
    let result = (16 * version + 128) * version + 64;
    if (version >= 2) {
      const numAlign = Math.floor(version / 7) + 2;
      result -= (25 * numAlign - 10) * numAlign - 55;
      if (version >= 7) result -= 36;
    }
    return result;
  }

  function numTotalCodewords(version) {
    return Math.floor(numRawDataModules(version) / 8);
  }

  function numDataCodewords(version, eccOrdinal) {
    return DATA_CODEWORDS[eccOrdinal][version];
  }

  // Derived, never transcribed: total minus data is the whole EC budget, and
  // every block carries exactly the same number of EC codewords, so the
  // block count is forced. A non-integer result would mean one of the two
  // tables is wrong - see assertBlockStructure().
  function numEccBlocks(version, eccOrdinal) {
    const totalEcc = numTotalCodewords(version) - DATA_CODEWORDS[eccOrdinal][version];
    return totalEcc / ECC_CODEWORDS_PER_BLOCK[eccOrdinal][version];
  }

  /* Verifies the two tables against each other for every version/level.
     Returns an array of human-readable problems - empty means consistent.
     Exposed rather than run at load time: it is a test's job, and a library
     should not spend milliseconds re-proving its own constants on every
     page load. */
  function assertBlockStructure() {
    const problems = [];
    for (let ecc = 0; ecc < 4; ecc++) {
      for (let version = MIN_VERSION; version <= MAX_VERSION; version++) {
        const blocks = numEccBlocks(version, ecc);
        const where = 'v' + version + ' ' + ['L', 'M', 'Q', 'H'][ecc];
        if (!isFinite(blocks) || blocks <= 0 || blocks !== Math.floor(blocks)) {
          problems.push(where + ': block count is not a whole number (' + blocks + ')');
          continue;
        }
        // Every block must end up with at least one data codeword, and the
        // short/long split may differ by at most one codeword.
        const total = numTotalCodewords(version);
        const shortBlockLen = Math.floor(total / blocks);
        if (shortBlockLen - ECC_CODEWORDS_PER_BLOCK[ecc][version] < 1) {
          problems.push(where + ': block would hold no data codewords');
        }
      }
    }
    return problems;
  }

  // Bit width of a segment's character-count field, which grows in three
  // steps across the version range (spec Table 3).
  function charCountBits(mode, version) {
    const i = version <= 9 ? 0 : (version <= 26 ? 1 : 2);
    return mode.charCountBits[i];
  }

  const MODE_NUMERIC = { name: 'numeric', indicator: 0x1, charCountBits: [10, 12, 14] };
  const MODE_ALPHANUMERIC = { name: 'alphanumeric', indicator: 0x2, charCountBits: [9, 11, 13] };
  const MODE_BYTE = { name: 'byte', indicator: 0x4, charCountBits: [8, 16, 16] };

  // ---------------------------------------------------------------------
  // Bit buffer
  // ---------------------------------------------------------------------
  function BitBuffer() {
    this.bits = [];
  }
  BitBuffer.prototype.append = function (value, length) {
    for (let i = length - 1; i >= 0; i--) this.bits.push((value >>> i) & 1);
  };
  BitBuffer.prototype.length = function () { return this.bits.length; };

  // ---------------------------------------------------------------------
  // Segments
  // ---------------------------------------------------------------------
  function isNumeric(text) { return /^[0-9]*$/.test(text); }
  function isAlphanumeric(text) {
    for (let i = 0; i < text.length; i++) {
      if (ALPHANUMERIC_CHARSET.indexOf(text.charAt(i)) === -1) return false;
    }
    return true;
  }

  // UTF-8 bytes. Byte mode has no declared character set of its own, and
  // UTF-8 is what every modern reader assumes in its absence - and what this
  // editor writes to disk anyway (^CI28).
  function toUtf8Bytes(text) {
    const out = [];
    for (let i = 0; i < text.length; i++) {
      let code = text.charCodeAt(i);
      // Combine a surrogate pair into its real code point before encoding,
      // otherwise an emoji becomes two invalid 3-byte sequences.
      if (code >= 0xD800 && code <= 0xDBFF && i + 1 < text.length) {
        const next = text.charCodeAt(i + 1);
        if (next >= 0xDC00 && next <= 0xDFFF) {
          code = 0x10000 + ((code - 0xD800) << 10) + (next - 0xDC00);
          i++;
        }
      }
      if (code < 0x80) out.push(code);
      else if (code < 0x800) out.push(0xC0 | (code >> 6), 0x80 | (code & 0x3F));
      else if (code < 0x10000) out.push(0xE0 | (code >> 12), 0x80 | ((code >> 6) & 0x3F), 0x80 | (code & 0x3F));
      else out.push(0xF0 | (code >> 18), 0x80 | ((code >> 12) & 0x3F), 0x80 | ((code >> 6) & 0x3F), 0x80 | (code & 0x3F));
    }
    return out;
  }

  function makeNumericSegment(text) {
    const buffer = new BitBuffer();
    for (let i = 0; i < text.length;) {
      const n = Math.min(3, text.length - i);
      buffer.append(parseInt(text.substr(i, n), 10), n * 3 + 1);
      i += n;
    }
    return { mode: MODE_NUMERIC, numChars: text.length, bits: buffer.bits };
  }

  function makeAlphanumericSegment(text) {
    const buffer = new BitBuffer();
    let i = 0;
    for (; i + 2 <= text.length; i += 2) {
      const value = ALPHANUMERIC_CHARSET.indexOf(text.charAt(i)) * 45 + ALPHANUMERIC_CHARSET.indexOf(text.charAt(i + 1));
      buffer.append(value, 11);
    }
    if (i < text.length) buffer.append(ALPHANUMERIC_CHARSET.indexOf(text.charAt(i)), 6);
    return { mode: MODE_ALPHANUMERIC, numChars: text.length, bits: buffer.bits };
  }

  function makeByteSegment(text) {
    const bytes = toUtf8Bytes(text);
    const buffer = new BitBuffer();
    for (let i = 0; i < bytes.length; i++) buffer.append(bytes[i], 8);
    // numChars for byte mode counts BYTES, not characters - an umlaut is two.
    return { mode: MODE_BYTE, numChars: bytes.length, bits: buffer.bits };
  }

  // The densest single mode that can represent the whole string. Splitting one
  // string into a mixed-mode sequence can occasionally be denser still, but
  // needs a shortest-path search whose only payoff is a slightly smaller
  // symbol - never correctness. A caller that knows better (ZPL's manual
  // character mode) can pass explicit segments instead.
  function makeAutoSegment(text) {
    if (text === '') return { mode: MODE_BYTE, numChars: 0, bits: [] };
    if (isNumeric(text)) return makeNumericSegment(text);
    if (isAlphanumeric(text)) return makeAlphanumericSegment(text);
    return makeByteSegment(text);
  }

  function makeSegment(text, mode) {
    if (mode === 'numeric') {
      if (!isNumeric(text)) return null;
      return makeNumericSegment(text);
    }
    if (mode === 'alphanumeric') {
      if (!isAlphanumeric(text)) return null;
      return makeAlphanumericSegment(text);
    }
    if (mode === 'byte') return makeByteSegment(text);
    return makeAutoSegment(text);
  }

  function segmentsBitLength(segments, version) {
    let total = 0;
    for (let i = 0; i < segments.length; i++) {
      const seg = segments[i];
      const ccBits = charCountBits(seg.mode, version);
      // A count that doesn't fit its field means this version cannot carry
      // the segment at all, no matter how much room is left.
      if (seg.numChars >= (1 << ccBits)) return Infinity;
      total += 4 + ccBits + seg.bits.length;
    }
    return total;
  }

  // ---------------------------------------------------------------------
  // Matrix construction
  // ---------------------------------------------------------------------
  function alignmentPatternPositions(version) {
    if (version === 1) return [];
    const numAlign = Math.floor(version / 7) + 2;
    const size = version * 4 + 17;
    // Version 32 is the one case the general formula gets wrong (the spec's
    // own table has an irregular step there).
    const step = version === 32 ? 26 : Math.ceil((size - 13) / (numAlign * 2 - 2)) * 2;
    const result = [6];
    for (let pos = size - 7; result.length < numAlign; pos -= step) result.splice(1, 0, pos);
    return result;
  }

  function Matrix(size) {
    this.size = size;
    this.modules = new Uint8Array(size * size);   // 1 = dark
    this.reserved = new Uint8Array(size * size);  // 1 = function pattern, not maskable
  }
  Matrix.prototype.get = function (x, y) { return this.modules[y * this.size + x]; };
  Matrix.prototype.set = function (x, y, dark, isFunction) {
    this.modules[y * this.size + x] = dark ? 1 : 0;
    if (isFunction) this.reserved[y * this.size + x] = 1;
  };
  Matrix.prototype.isReserved = function (x, y) { return this.reserved[y * this.size + x] === 1; };

  function drawFinderPattern(matrix, centerX, centerY) {
    for (let dy = -4; dy <= 4; dy++) {
      for (let dx = -4; dx <= 4; dx++) {
        const x = centerX + dx, y = centerY + dy;
        if (x < 0 || x >= matrix.size || y < 0 || y >= matrix.size) continue;
        const distance = Math.max(Math.abs(dx), Math.abs(dy));
        // Rings at Chebyshev distance 0-2 and 4 are dark; 3 is the white
        // separator ring.
        matrix.set(x, y, distance !== 2 && distance !== 4, true);
      }
    }
  }

  function drawAlignmentPattern(matrix, centerX, centerY) {
    for (let dy = -2; dy <= 2; dy++) {
      for (let dx = -2; dx <= 2; dx++) {
        matrix.set(centerX + dx, centerY + dy, Math.max(Math.abs(dx), Math.abs(dy)) !== 1, true);
      }
    }
  }

  function drawFunctionPatterns(matrix, version) {
    const size = matrix.size;

    // Timing patterns (row/column 6), drawn before the finders so the finder
    // separators overwrite their ends, as the spec requires.
    for (let i = 0; i < size; i++) {
      matrix.set(6, i, i % 2 === 0, true);
      matrix.set(i, 6, i % 2 === 0, true);
    }

    drawFinderPattern(matrix, 3, 3);
    drawFinderPattern(matrix, size - 4, 3);
    drawFinderPattern(matrix, 3, size - 4);

    const positions = alignmentPatternPositions(version);
    for (let i = 0; i < positions.length; i++) {
      for (let j = 0; j < positions.length; j++) {
        // The three corners are occupied by finder patterns.
        const isCorner = (i === 0 && j === 0) ||
          (i === 0 && j === positions.length - 1) ||
          (i === positions.length - 1 && j === 0);
        if (!isCorner) drawAlignmentPattern(matrix, positions[i], positions[j]);
      }
    }

    // Reserve the format-information areas; the real bits are written after
    // masking, because they encode the chosen mask.
    reserveFormatArea(matrix);
    if (version >= 7) reserveVersionArea(matrix);

    // The permanently dark module below the top-left finder.
    matrix.set(8, size - 8, true, true);
  }

  function reserveFormatArea(matrix) {
    const size = matrix.size;
    for (let i = 0; i <= 8; i++) {
      if (i !== 6) { matrix.set(i, 8, false, true); matrix.set(8, i, false, true); }
    }
    for (let i = 0; i < 8; i++) {
      matrix.set(size - 1 - i, 8, false, true);
      matrix.set(8, size - 1 - i, false, true);
    }
  }

  function reserveVersionArea(matrix) {
    const size = matrix.size;
    for (let i = 0; i < 18; i++) {
      const a = Math.floor(i / 3);
      const b = i % 3 + size - 11;
      matrix.set(a, b, false, true);
      matrix.set(b, a, false, true);
    }
  }

  function drawFormatBits(matrix, eccFormatBits, mask) {
    const size = matrix.size;
    const data = (eccFormatBits << 3) | mask;
    let rem = data;
    for (let i = 0; i < 10; i++) rem = (rem << 1) ^ ((rem >>> 9) * 0x537);
    const bits = ((data << 10) | rem) ^ 0x5412; // spec's fixed XOR mask

    // Copy 1 (around the top-left finder).
    for (let i = 0; i <= 5; i++) matrix.set(8, i, (bits >>> i) & 1, true);
    matrix.set(8, 7, (bits >>> 6) & 1, true);
    matrix.set(8, 8, (bits >>> 7) & 1, true);
    matrix.set(7, 8, (bits >>> 8) & 1, true);
    for (let i = 9; i < 15; i++) matrix.set(14 - i, 8, (bits >>> i) & 1, true);

    // Copy 2 (split between the other two finders), so a damaged corner
    // still leaves the format readable.
    for (let i = 0; i < 8; i++) matrix.set(size - 1 - i, 8, (bits >>> i) & 1, true);
    for (let i = 8; i < 15; i++) matrix.set(8, size - 15 + i, (bits >>> i) & 1, true);
  }

  function drawVersionBits(matrix, version) {
    if (version < 7) return;
    const size = matrix.size;
    let rem = version;
    for (let i = 0; i < 12; i++) rem = (rem << 1) ^ ((rem >>> 11) * 0x1F25);
    const bits = (version << 12) | rem;
    for (let i = 0; i < 18; i++) {
      const bit = (bits >>> i) & 1;
      const a = Math.floor(i / 3);
      const b = i % 3 + size - 11;
      matrix.set(a, b, bit, true);
      matrix.set(b, a, bit, true);
    }
  }

  // Zigzag placement: two-module-wide columns from the right edge leftwards,
  // alternating upward/downward, skipping the vertical timing column 6.
  function drawCodewords(matrix, codewords) {
    const size = matrix.size;
    let bitIndex = 0;
    for (let right = size - 1; right >= 1; right -= 2) {
      if (right === 6) right = 5;
      for (let vert = 0; vert < size; vert++) {
        for (let j = 0; j < 2; j++) {
          const x = right - j;
          const upward = ((right + 1) & 2) === 0;
          const y = upward ? size - 1 - vert : vert;
          if (matrix.isReserved(x, y)) continue;
          // Data may run out before the matrix does; the spec's remainder
          // bits are simply left light.
          const dark = bitIndex < codewords.length * 8 &&
            ((codewords[bitIndex >>> 3] >>> (7 - (bitIndex & 7))) & 1) === 1;
          matrix.set(x, y, dark, false);
          bitIndex++;
        }
      }
    }
    return bitIndex;
  }

  function maskCondition(mask, x, y) {
    switch (mask) {
      case 0: return (x + y) % 2 === 0;
      case 1: return y % 2 === 0;
      case 2: return x % 3 === 0;
      case 3: return (x + y) % 3 === 0;
      case 4: return (Math.floor(x / 3) + Math.floor(y / 2)) % 2 === 0;
      case 5: return (x * y) % 2 + (x * y) % 3 === 0;
      case 6: return ((x * y) % 2 + (x * y) % 3) % 2 === 0;
      case 7: return ((x + y) % 2 + (x * y) % 3) % 2 === 0;
      default: return false;
    }
  }

  function applyMask(matrix, mask) {
    for (let y = 0; y < matrix.size; y++) {
      for (let x = 0; x < matrix.size; x++) {
        if (matrix.isReserved(x, y)) continue;
        if (maskCondition(mask, x, y)) {
          matrix.modules[y * matrix.size + x] ^= 1;
        }
      }
    }
  }

  // Spec evaluation rules 1-4. Lower is better; the encoder tries all eight
  // masks and keeps the best, which is what makes a symbol robust rather
  // than merely valid.
  function penaltyScore(matrix) {
    const size = matrix.size;
    let score = 0;

    // Rule 1: runs of 5+ same-colour modules in a row or column.
    for (let y = 0; y < size; y++) {
      let runColor = matrix.get(0, y), runLength = 1;
      for (let x = 1; x < size; x++) {
        const c = matrix.get(x, y);
        if (c === runColor) { runLength++; } else { score += runPenalty(runLength); runColor = c; runLength = 1; }
      }
      score += runPenalty(runLength);
    }
    for (let x = 0; x < size; x++) {
      let runColor = matrix.get(x, 0), runLength = 1;
      for (let y = 1; y < size; y++) {
        const c = matrix.get(x, y);
        if (c === runColor) { runLength++; } else { score += runPenalty(runLength); runColor = c; runLength = 1; }
      }
      score += runPenalty(runLength);
    }

    // Rule 2: 2x2 blocks of one colour.
    for (let y = 0; y < size - 1; y++) {
      for (let x = 0; x < size - 1; x++) {
        const c = matrix.get(x, y);
        if (c === matrix.get(x + 1, y) && c === matrix.get(x, y + 1) && c === matrix.get(x + 1, y + 1)) {
          score += PENALTY_N2;
        }
      }
    }

    // Rule 3: the finder-lookalike 1:1:3:1:1 pattern with four light modules
    // on either side, which a scanner could mistake for a finder.
    for (let y = 0; y < size; y++) {
      for (let x = 0; x < size; x++) {
        if (x + 11 <= size && matchesFinderLike(matrix, x, y, true)) score += PENALTY_N3;
        if (y + 11 <= size && matchesFinderLike(matrix, x, y, false)) score += PENALTY_N3;
      }
    }

    // Rule 4: deviation of the dark-module proportion from 50%.
    let dark = 0;
    for (let i = 0; i < matrix.modules.length; i++) dark += matrix.modules[i];
    const total = size * size;
    const percentStepsAwayFromHalf = Math.floor(Math.abs(dark * 20 - total * 10) / total);
    score += percentStepsAwayFromHalf * PENALTY_N4;

    return score;
  }

  function runPenalty(runLength) {
    return runLength >= 5 ? PENALTY_N1 + (runLength - 5) : 0;
  }

  // The two orientations of "dark light dark dark dark light dark" preceded
  // or followed by four light modules.
  const FINDER_LIKE_A = [1, 0, 1, 1, 1, 0, 1, 0, 0, 0, 0];
  const FINDER_LIKE_B = [0, 0, 0, 0, 1, 0, 1, 1, 1, 0, 1];
  function matchesFinderLike(matrix, x, y, horizontal) {
    let matchA = true, matchB = true;
    for (let i = 0; i < 11; i++) {
      const value = horizontal ? matrix.get(x + i, y) : matrix.get(x, y + i);
      if (value !== FINDER_LIKE_A[i]) matchA = false;
      if (value !== FINDER_LIKE_B[i]) matchB = false;
      if (!matchA && !matchB) return false;
    }
    return matchA || matchB;
  }

  // ---------------------------------------------------------------------
  // Codeword assembly
  // ---------------------------------------------------------------------
  function buildCodewords(segments, version, eccOrdinal) {
    const dataCapacityBits = numDataCodewords(version, eccOrdinal) * 8;
    const buffer = new BitBuffer();
    for (let i = 0; i < segments.length; i++) {
      const seg = segments[i];
      buffer.append(seg.mode.indicator, 4);
      buffer.append(seg.numChars, charCountBits(seg.mode, version));
      for (let j = 0; j < seg.bits.length; j++) buffer.bits.push(seg.bits[j]);
    }
    // Terminator, then pad to a byte boundary, then the spec's alternating
    // pad bytes.
    buffer.append(0, Math.min(4, dataCapacityBits - buffer.length()));
    buffer.append(0, (8 - buffer.length() % 8) % 8);
    for (let pad = 0xEC; buffer.length() < dataCapacityBits; pad ^= 0xEC ^ 0x11) buffer.append(pad, 8);

    const dataCodewords = new Uint8Array(buffer.length() / 8);
    for (let i = 0; i < buffer.bits.length; i++) {
      dataCodewords[i >>> 3] |= buffer.bits[i] << (7 - (i & 7));
    }
    return interleaveBlocks(dataCodewords, version, eccOrdinal);
  }

  // Splits the data into the version's block structure, appends each block's
  // Reed-Solomon codewords, then interleaves both - so a burst of damage is
  // spread across blocks instead of destroying one of them entirely.
  function interleaveBlocks(data, version, eccOrdinal) {
    const numBlocks = numEccBlocks(version, eccOrdinal);
    const blockEccLen = ECC_CODEWORDS_PER_BLOCK[eccOrdinal][version];
    const rawCodewords = numTotalCodewords(version);
    const numShortBlocks = numBlocks - rawCodewords % numBlocks;
    const shortBlockLen = Math.floor(rawCodewords / numBlocks);

    const blocks = [];
    for (let i = 0, k = 0; i < numBlocks; i++) {
      const dataLen = shortBlockLen - blockEccLen + (i < numShortBlocks ? 0 : 1);
      const dat = data.slice(k, k + dataLen);
      k += dataLen;
      const ecc = reedSolomonRemainder(dat, blockEccLen);
      const block = new Uint8Array(dat.length + ecc.length);
      block.set(dat, 0);
      block.set(ecc, dat.length);
      blocks.push({ data: dat, ecc: ecc, total: block });
    }

    const result = new Uint8Array(rawCodewords);
    let index = 0;
    const maxDataLen = shortBlockLen - blockEccLen + 1;
    for (let i = 0; i < maxDataLen; i++) {
      for (let j = 0; j < blocks.length; j++) {
        // The one shorter data codeword of every short block is simply absent
        // at the last index.
        if (i < blocks[j].data.length) result[index++] = blocks[j].data[i];
      }
    }
    for (let i = 0; i < blockEccLen; i++) {
      for (let j = 0; j < blocks.length; j++) result[index++] = blocks[j].ecc[i];
    }
    return result;
  }

  // ---------------------------------------------------------------------
  // Public encode
  // ---------------------------------------------------------------------

  /* encode(input, opts) -> {ok, size, modules, version, ecLevel, mask, mode, error}

     `input` is either a string (encoded with the densest single mode that
     fits) or an array of {text, mode} segments, where mode is
     'numeric' | 'alphanumeric' | 'byte' | 'auto' - ZPL's manual character
     mode maps straight onto that.

     opts:
       ecLevel     'L' | 'M' | 'Q' | 'H'  (default 'M', ZPL's ^BQ default is 'Q')
       mask        0-7 to force a mask, or null/undefined for the spec's own
                   penalty-based selection (what a printer does)
       minVersion  smallest version to consider (default 1)
       maxVersion  largest version to consider (default 40)

     `modules` is a Uint8Array of size*size, row-major, 1 = dark. It contains
     the symbol only - the mandatory 4-module quiet zone around it is the
     renderer's business, not the encoder's.

     Never throws: a payload too large for version 40, or a segment whose
     characters do not fit its declared mode, comes back as {ok:false,error}. */
  function encode(input, opts) {
    opts = opts || {};
    const ecName = String(opts.ecLevel || 'M').toUpperCase();
    const ecc = ECC[ecName];
    if (!ecc) return fail('Unbekannte Fehlerkorrekturstufe: ' + opts.ecLevel);

    let segments;
    if (Array.isArray(input)) {
      segments = [];
      for (let i = 0; i < input.length; i++) {
        const spec = input[i] || {};
        const seg = makeSegment(String(spec.text == null ? '' : spec.text), spec.mode || 'auto');
        if (!seg) {
          return fail('Daten passen nicht zum angegebenen Zeichenmodus „' + spec.mode + '“: ' + spec.text);
        }
        segments.push(seg);
      }
    } else {
      segments = [makeAutoSegment(String(input == null ? '' : input))];
    }

    const minVersion = Math.max(MIN_VERSION, opts.minVersion || MIN_VERSION);
    const maxVersion = Math.min(MAX_VERSION, opts.maxVersion || MAX_VERSION);
    if (minVersion > maxVersion) return fail('Ungültiger Versionsbereich');

    let version = -1;
    for (let v = minVersion; v <= maxVersion; v++) {
      if (segmentsBitLength(segments, v) <= numDataCodewords(v, ecc.ordinal) * 8) { version = v; break; }
    }
    if (version === -1) {
      return fail('Datenmenge passt in keinen QR-Code der Version ' + minVersion + '–' + maxVersion +
        ' bei Fehlerkorrektur ' + ecName + '.');
    }

    const codewords = buildCodewords(segments, version, ecc.ordinal);
    const size = version * 4 + 17;

    // Each candidate mask needs its own matrix: masking is an XOR over the
    // data modules, and the penalty must be measured with the format bits
    // for THAT mask already in place.
    let best = null;
    const forced = (opts.mask == null || opts.mask === '') ? null : Math.max(0, Math.min(7, parseInt(opts.mask, 10) || 0));
    const candidates = forced == null ? [0, 1, 2, 3, 4, 5, 6, 7] : [forced];
    for (let i = 0; i < candidates.length; i++) {
      const mask = candidates[i];
      const matrix = new Matrix(size);
      drawFunctionPatterns(matrix, version);
      drawVersionBits(matrix, version);
      drawCodewords(matrix, codewords);
      applyMask(matrix, mask);
      drawFormatBits(matrix, ecc.formatBits, mask);
      const score = candidates.length === 1 ? 0 : penaltyScore(matrix);
      if (!best || score < best.score) best = { score: score, mask: mask, matrix: matrix };
    }

    return {
      ok: true,
      size: size,
      modules: best.matrix.modules,
      version: version,
      ecLevel: ecName,
      mask: best.mask,
      mode: segments.length === 1 ? segments[0].mode.name : 'mixed',
      error: '',
    };
  }

  function fail(message) {
    return { ok: false, size: 0, modules: new Uint8Array(0), version: 0, ecLevel: '', mask: 0, mode: '', error: message };
  }

  // ---------------------------------------------------------------------
  // ZPL ^BQ field-data grammar
  //
  // Zebra puts the error-correction level, the input mode and (for manual
  // mode) the per-segment character modes INSIDE the ^FD data rather than in
  // the ^BQ command:
  //
  //   ^FDQA,https://example.com      automatic input, EC level Q
  //   ^FDHM,N0123456789              manual input, numeric segment, level H
  //   ^FDMM,AHELLO,B0004test         manual, alphanumeric then 4 byte chars
  //   ^FD2,QA,payload                model-1 style with a leading mask digit
  //
  // The editor keeps el.data as the VERBATIM field text (same as every other
  // symbology, so round-trip is lossless by construction) and calls this to
  // work out what to actually encode - exactly the split that
  // stripBarcodeControlPrefix already does for Code 128's >: prefixes.
  // ---------------------------------------------------------------------

  /* parseFieldData(data) -> {ecLevel, inputMode, mask, segments, payload, prefix}

     `segments` is ready to hand to encode(). `payload` is the concatenated
     text for display. `prefix` is the consumed control text, so a caller can
     show or rebuild it. Unrecognized input is treated as pure payload with no
     prefix, which is what a printer does with a bare ^FD too. */
  function parseFieldData(data) {
    const text = data == null ? '' : String(data);
    const empty = { ecLevel: null, inputMode: null, mask: null, segments: [{ text: text, mode: 'auto' }], payload: text, prefix: '' };

    // [mask digit] EC-level [input mode] ','
    const m = /^(?:([0-7]),)?([HQML])([AM])?,/.exec(text);
    if (!m) return empty;

    const prefix = m[0];
    const rest = text.slice(prefix.length);
    const inputMode = m[3] || 'A';
    const base = {
      ecLevel: m[2],
      inputMode: inputMode,
      mask: m[1] == null ? null : parseInt(m[1], 10),
      prefix: prefix,
    };

    if (inputMode !== 'M') {
      base.segments = [{ text: rest, mode: 'auto' }];
      base.payload = rest;
      return base;
    }

    const parsed = parseManualSegments(rest);
    base.segments = parsed.segments.length ? parsed.segments : [{ text: '', mode: 'auto' }];
    base.payload = parsed.segments.map(function (s) { return s.text; }).join('');
    return base;
  }

  // Manual mode: a run of "<character mode><data>" chunks separated by commas.
  // N=numeric, A=alphanumeric, B<4 digits>=that many bytes, K=kanji (encoded
  // as byte mode here - see the module header).
  function parseManualSegments(rest) {
    const segments = [];
    let i = 0;
    while (i < rest.length) {
      const code = rest.charAt(i).toUpperCase();
      if (code === 'B') {
        const count = parseInt(rest.substr(i + 1, 4), 10);
        if (isFinite(count)) {
          const start = i + 5;
          segments.push({ text: rest.substr(start, count), mode: 'byte' });
          i = start + count;
          if (rest.charAt(i) === ',') i++;
          continue;
        }
      }
      const mode = code === 'N' ? 'numeric' : (code === 'A' ? 'alphanumeric' : 'byte');
      const known = code === 'N' || code === 'A' || code === 'K' || code === 'B';
      const start = known ? i + 1 : i;
      const comma = rest.indexOf(',', start);
      const end = comma === -1 ? rest.length : comma;
      segments.push({ text: rest.slice(start, end), mode: mode });
      i = comma === -1 ? rest.length : comma + 1;
    }
    return { segments: segments };
  }

  /* encodeFieldData(data, opts) -> same shape as encode()

     The one call a renderer needs: takes the raw ^FD text of a ^BQ field,
     honours whatever control prefix it carries, and falls back to the
     command-level ^BQ parameters (opts.ecLevel / opts.mask) when the data
     states none - matching the printer's own precedence. */
  function encodeFieldData(data, opts) {
    opts = opts || {};
    const parsed = parseFieldData(data);
    if (!parsed.payload) return fail('Keine Daten für den QR-Code (^FD ist leer).');
    return encode(parsed.segments, {
      ecLevel: parsed.ecLevel || opts.ecLevel || 'Q',
      mask: parsed.mask != null ? parsed.mask : (opts.mask == null ? null : opts.mask),
      minVersion: opts.minVersion,
      maxVersion: opts.maxVersion,
    });
  }

  global.ZPLQr = {
    MIN_VERSION: MIN_VERSION,
    MAX_VERSION: MAX_VERSION,
    ALPHANUMERIC_CHARSET: ALPHANUMERIC_CHARSET,
    encode: encode,
    parseFieldData: parseFieldData,
    encodeFieldData: encodeFieldData,
    // Exposed for tests and for capacity hints in the UI.
    numDataCodewords: numDataCodewords,
    numTotalCodewords: numTotalCodewords,
    numEccBlocks: numEccBlocks,
    assertBlockStructure: assertBlockStructure,
    alignmentPatternPositions: alignmentPatternPositions,
  };
})(typeof globalThis !== 'undefined' ? globalThis : this);
