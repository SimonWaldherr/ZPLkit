/*
 * ZPLBarcode - vanilla JS 1D barcode bar-pattern generator for on-screen preview.
 *
 * This module does NOT print barcodes - the Zebra printer renders the real
 * barcode from the raw ZPL (^BC, ^B3, ^B2, ^BE, ...). This module only produces
 * an array of bar/space module-widths so the editor's canvas preview looks
 * correct to the user while they edit the label.
 *
 * Every encoder returns { bars: number[], ok: boolean, error?: string }.
 * `bars` alternates BAR, space, BAR, space, ... starting with a bar (index 0).
 * Widths are expressed in "modules" (narrow-bar units) - the caller multiplies
 * by a pixel-per-module value to draw.
 */
(function (global) {
  'use strict';

  // ===========================================================================
  // Code 128 (ISO/IEC 15417)
  // ===========================================================================

  // The standard Code 128 symbol table. Index = symbol value (0-102), plus
  // START A=103, START B=104, START C=105, STOP=106.
  // Each pattern is 6 digits, bar/space/bar/space/bar/space widths in modules,
  // summing to 11 (the stop pattern has an extra 7th digit for the trailing bar).
  // Columns below (for reference, not stored): value | Code A | Code B | Code C | pattern
  var CODE128_PATTERNS = [
    '212222', '222122', '222221', '121223', '121322', '131222', '122213',
    '122312', '132212', '221213', '221312', '231212', '112232', '122132',
    '122231', '113222', '123122', '123221', '223211', '221132', '221231',
    '213212', '223112', '312131', '311222', '321122', '321221', '312212',
    '322112', '322211', '212123', '212321', '232121', '111323', '131123',
    '131321', '112313', '132113', '132311', '211313', '231113', '231311',
    '112133', '112331', '132131', '113123', '113321', '133121', '313121',
    '211331', '231131', '213113', '213311', '213131', '311123', '311321',
    '331121', '312113', '312311', '332111', '314111', '221411', '431111',
    '111224', '111422', '121124', '121421', '141122', '141221', '112214',
    '112412', '122114', '122411', '142112', '142211', '241211', '221114',
    '413111', '241112', '134111', '111242', '121142', '121241', '114212',
    '124112', '124211', '411212', '421112', '421211', '212141', '214121',
    '412121', '111143', '111341', '131141', '114113', '114311', '411113',
    '411311', '113141', '114131', '311141', '411131',
    '211412', // 103 START A
    '211214', // 104 START B
    '211232', // 105 START C
    '2331112' // 106 STOP (includes trailing termination bar, 7 digits, 13 modules)
  ];

  var CODE128_START_B = 104;
  var CODE128_START_C = 105;
  var CODE128_STOP = 106;
  var CODE128_CODE_B = 100; // switch to Code B (from A or C)
  var CODE128_CODE_C = 99;  // switch to Code C (from A or B)

  // Build Code Set B value->char and char->value maps (ASCII 32-127, values 0-95).
  function code128BValue(ch) {
    var code = ch.charCodeAt(0);
    if (code < 32 || code > 127) return -1;
    return code - 32;
  }

  function patternToWidths(pattern) {
    var out = [];
    for (var i = 0; i < pattern.length; i++) {
      out.push(parseInt(pattern.charAt(i), 10));
    }
    return out;
  }

  // Find runs of 4+ consecutive digits suitable for Code C (pairs of digits).
  // Returns an array of segments: { type: 'C'|'B', text: string }
  function code128Segment(text) {
    var segments = [];
    var i = 0;
    var n = text.length;
    while (i < n) {
      // Look for a run of consecutive digits starting at i.
      var j = i;
      while (j < n && text.charAt(j) >= '0' && text.charAt(j) <= '9') j++;
      var runLen = j - i;
      if (runLen >= 4) {
        // Use Code C for the largest even prefix of this run.
        var evenLen = runLen - (runLen % 2);
        segments.push({ type: 'C', text: text.substr(i, evenLen) });
        i += evenLen;
        // Leftover single digit (if run was odd) falls through to Code B below.
        if (evenLen < runLen) {
          segments.push({ type: 'B', text: text.charAt(i) });
          i += 1;
        }
      } else {
        // Not a digit run of 4+: consume one char as Code B, but merge with
        // previous B segment if present.
        var chunkStart = i;
        // Consume until the next qualifying digit run of length >= 4, or end.
        while (i < n) {
          var k = i;
          while (k < n && text.charAt(k) >= '0' && text.charAt(k) <= '9') k++;
          if (k - i >= 4) break; // stop before a run that will become Code C
          i = (k > i) ? k : i + 1;
        }
        segments.push({ type: 'B', text: text.substring(chunkStart, i) });
      }
    }
    // Merge adjacent same-type segments (can happen due to leftover-digit logic)
    var merged = [];
    for (var s = 0; s < segments.length; s++) {
      if (merged.length && merged[merged.length - 1].type === segments[s].type) {
        merged[merged.length - 1].text += segments[s].text;
      } else {
        merged.push({ type: segments[s].type, text: segments[s].text });
      }
    }
    return merged;
  }

  function code128(text) {
    if (typeof text !== 'string' || text.length === 0) {
      return { bars: [], ok: false, error: 'Code 128 input must be a non-empty string' };
    }
    // Validate: every char must be encodable in either B (ASCII 32-126) since
    // that's the character set this implementation supports (plus digits, a
    // subset of B). DEL (127) and control chars are not supported here.
    for (var c = 0; c < text.length; c++) {
      var code = text.charCodeAt(c);
      if (code < 32 || code > 126) {
        return { bars: [], ok: false, error: 'Character "' + text.charAt(c) + '" is not supported (only printable ASCII 32-126 and digits)' };
      }
    }

    var segments = code128Segment(text);
    if (segments.length === 0) {
      return { bars: [], ok: false, error: 'Nothing to encode' };
    }

    var values = []; // sequence of symbol values (start...data...) before checksum
    var startValue;
    var currentSet; // 'B' or 'C'

    if (segments[0].type === 'C') {
      startValue = CODE128_START_C;
      currentSet = 'C';
    } else {
      startValue = CODE128_START_B;
      currentSet = 'B';
    }
    values.push(startValue);

    for (var si = 0; si < segments.length; si++) {
      var seg = segments[si];
      if (si > 0) {
        // Need a code-set switch symbol if the set differs from currentSet.
        if (seg.type !== currentSet) {
          values.push(seg.type === 'C' ? CODE128_CODE_C : CODE128_CODE_B);
          currentSet = seg.type;
        }
      }
      if (seg.type === 'C') {
        if (seg.text.length % 2 !== 0) {
          return { bars: [], ok: false, error: 'Internal error: Code C segment has odd length' };
        }
        for (var p = 0; p < seg.text.length; p += 2) {
          var pair = seg.text.substr(p, 2);
          var val = parseInt(pair, 10);
          if (isNaN(val)) {
            return { bars: [], ok: false, error: 'Invalid digit pair "' + pair + '" for Code C' };
          }
          values.push(val);
        }
      } else {
        for (var ci = 0; ci < seg.text.length; ci++) {
          var bval = code128BValue(seg.text.charAt(ci));
          if (bval < 0) {
            return { bars: [], ok: false, error: 'Character "' + seg.text.charAt(ci) + '" is not encodable in Code Set B' };
          }
          values.push(bval);
        }
      }
    }

    // Checksum: startValue + sum(value_i * position_i), position starts at 1
    // for the first symbol AFTER start.
    var checksum = startValue;
    for (var pos = 1; pos < values.length; pos++) {
      checksum += values[pos] * pos;
    }
    checksum = checksum % 103;
    values.push(checksum);
    values.push(CODE128_STOP);

    var bars = [];
    for (var vi = 0; vi < values.length; vi++) {
      var pattern = CODE128_PATTERNS[values[vi]];
      if (!pattern) {
        return { bars: [], ok: false, error: 'Internal error: no pattern for value ' + values[vi] };
      }
      var widths = patternToWidths(pattern);
      for (var w = 0; w < widths.length; w++) bars.push(widths[w]);
    }

    return { bars: bars, ok: true };
  }

  // ===========================================================================
  // Code 39 (ISO/IEC 16388)
  // ===========================================================================

  // Standard Code 39 table: each entry is 9 elements, bar,space,bar,space,...,bar
  // (5 bars + 4 spaces), 'N' = narrow (1 module), 'W' = wide (3 modules).
  var CODE39_TABLE = {
    '0': 'NNNWWNWNN', '1': 'WNNWNNNNW', '2': 'NNWWNNNNW', '3': 'WNWWNNNNN',
    '4': 'NNNWWNNNW', '5': 'WNNWWNNNN', '6': 'NNWWWNNNN', '7': 'NNNWNNWNW',
    '8': 'WNNWNNWNN', '9': 'NNWWNNWNN',
    'A': 'WNNNNWNNW', 'B': 'NNWNNWNNW', 'C': 'WNWNNWNNN', 'D': 'NNNNWWNNW',
    'E': 'WNNNWWNNN', 'F': 'NNWNWWNNN', 'G': 'NNNNNWWNW', 'H': 'WNNNNWWNN',
    'I': 'NNWNNWWNN', 'J': 'NNNNWWWNN',
    'K': 'WNNNNNNWW', 'L': 'NNWNNNNWW', 'M': 'WNWNNNNWN', 'N': 'NNNNWNNWW',
    'O': 'WNNNWNNWN', 'P': 'NNWNWNNWN', 'Q': 'NNNNNNWWW', 'R': 'WNNNNNWWN',
    'S': 'NNWNNNWWN', 'T': 'NNNNWNWWN',
    'U': 'WWNNNNNNW', 'V': 'NWWNNNNNW', 'W': 'WWWNNNNNN', 'X': 'NWNNWNNNW',
    'Y': 'WWNNWNNNN', 'Z': 'NWWNWNNNN',
    '-': 'NWNNNNWNW', '.': 'WWNNNNWNN', ' ': 'NWWNNNWNN',
    '$': 'NWNWNWNNN', '/': 'NWNWNNNWN', '+': 'NWNNNWNWN', '%': 'NNNWNWNWN',
    '*': 'NWNNWNWNN' // start/stop character
  };

  // Value-to-character table for the Mod 43 check character, in the
  // standard Code 39 value order (0-9 -> 0-9, A-Z -> 10-35, then the 7
  // special characters -> 36-42) - a character's check-digit VALUE is its
  // index here, distinct from CODE39_TABLE above (which maps a character to
  // its bar/space pattern, not a number).
  var CODE39_VALUES = '0123456789ABCDEFGHIJKLMNOPQRSTUVWXYZ-. $/+%';
  function code39CheckChar(chars) {
    var sum = 0;
    for (var i = 0; i < chars.length; i++) sum += CODE39_VALUES.indexOf(chars[i]);
    return CODE39_VALUES.charAt(sum % 43);
  }

  function code39(text, ratio, checkDigit) {
    if (typeof text !== 'string' || text.length === 0) {
      return { bars: [], ok: false, error: 'Code 39 input must be a non-empty string' };
    }
    // ^BY's wide:narrow ratio (default 3.0, printer-accepted range ~2.0-3.0)
    // - the inter-character gap below is defined by the spec as always one
    // narrow module and doesn't scale with it.
    var wide = (typeof ratio === 'number' && ratio > 0) ? ratio : 3;
    var upper = text.toUpperCase();
    var chars = [];
    for (var i = 0; i < upper.length; i++) {
      var ch = upper.charAt(i);
      if (!CODE39_TABLE.hasOwnProperty(ch) || ch === '*') {
        return { bars: [], ok: false, error: 'Character "' + text.charAt(i) + '" is not valid in Code 39' };
      }
      chars.push(ch);
    }

    // ^B3's checkDigit=Y tells the PRINTER to compute and print a Mod 43
    // check character after the data (before the stop character) - mirror
    // that here too, or a barcode with the check digit enabled would render
    // narrower in this preview than what the printer actually produces.
    var sequence = checkDigit
      ? ['*'].concat(chars, [code39CheckChar(chars)], ['*'])
      : ['*'].concat(chars, ['*']);
    var bars = [];
    for (var s = 0; s < sequence.length; s++) {
      if (s > 0) bars.push(1); // inter-character gap, narrow space
      var pattern = CODE39_TABLE[sequence[s]];
      for (var e = 0; e < pattern.length; e++) {
        bars.push(pattern.charAt(e) === 'W' ? wide : 1);
      }
    }

    return { bars: bars, ok: true };
  }

  // ===========================================================================
  // Interleaved 2 of 5 (ITF, ISO/IEC 16390)
  // ===========================================================================

  // Standard 2-of-5 digit patterns: 5 elements each, exactly 2 wide (W), 3 narrow (N).
  var ITF_DIGIT_TABLE = [
    'NNWWN', // 0
    'WNNNW', // 1
    'NWNNW', // 2
    'WWNNN', // 3
    'NNWNW', // 4
    'WNWNN', // 5
    'NWWNN', // 6
    'NNNWW', // 7
    'WNNWN', // 8
    'NWNWN'  // 9
  ];

  // Mod 10 check digit, weight 3/1 alternating starting from the RIGHTMOST
  // data digit - the same GS1/UPC/EAN "Modulo 10" family already used by
  // ean13()/upca() below (there expressed as weights [1,3] from the LEFT of
  // a fixed-length run, which is the identical pattern for even-length data;
  // written right-to-left here since ITF's data length varies).
  function itfCheckDigit(digitsStr) {
    var sum = 0;
    for (var i = 0; i < digitsStr.length; i++) {
      var digit = parseInt(digitsStr.charAt(digitsStr.length - 1 - i), 10);
      sum += digit * (i % 2 === 0 ? 3 : 1);
    }
    return String((10 - (sum % 10)) % 10);
  }

  function itf(text, ratio, checkDigit) {
    if (typeof text !== 'string' || text.length === 0) {
      return { bars: [], ok: false, error: 'ITF input must be a non-empty string' };
    }
    if (!/^[0-9]+$/.test(text)) {
      return { bars: [], ok: false, error: 'ITF only supports digits 0-9' };
    }
    // ^BY's wide:narrow ratio (default 3.0) - same knob Code 39 uses.
    var wide = (typeof ratio === 'number' && ratio > 0) ? ratio : 3;
    var digits = text;
    // ^B2's checkDigit=Y tells the printer to compute and print a Mod 10
    // check digit after the data - mirror that here too (computed over the
    // data BEFORE any padding, matching how the printer itself would see
    // it), or a barcode with the check digit enabled would render one digit
    // narrower in this preview than what actually prints.
    if (checkDigit) digits += itfCheckDigit(digits);
    if (digits.length % 2 !== 0) {
      digits = '0' + digits; // standard convention: pad odd-length input
    }

    var bars = [];
    // Start pattern: narrow bar, narrow space, narrow bar, narrow space.
    bars.push(1, 1, 1, 1);

    for (var i = 0; i < digits.length; i += 2) {
      var barDigit = digits.charAt(i);
      var spaceDigit = digits.charAt(i + 1);
      var barPattern = ITF_DIGIT_TABLE[parseInt(barDigit, 10)];
      var spacePattern = ITF_DIGIT_TABLE[parseInt(spaceDigit, 10)];
      for (var el = 0; el < 5; el++) {
        bars.push(barPattern.charAt(el) === 'W' ? wide : 1);   // bar element
        bars.push(spacePattern.charAt(el) === 'W' ? wide : 1); // space element
      }
    }

    // Stop pattern: wide bar, narrow space, narrow bar.
    bars.push(wide, 1, 1);

    return { bars: bars, ok: true };
  }

  // ===========================================================================
  // EAN-13 (ISO/IEC 15420)
  // ===========================================================================

  // Standard L-parity (odd) digit patterns, 7 modules/bits each.
  var EAN_L_PATTERNS = [
    '0001101', '0011001', '0010011', '0111101', '0100011',
    '0110001', '0101111', '0111011', '0110111', '0001011'
  ];

  // G-parity (even) patterns - could also be derived from L via bit-mirroring,
  // but listed explicitly per the standard for clarity/correctness.
  var EAN_G_PATTERNS = [
    '0100111', '0110011', '0011011', '0100001', '0011101',
    '0111001', '0000101', '0010001', '0001001', '0010111'
  ];

  // R-parity patterns: bitwise complement of L patterns.
  var EAN_R_PATTERNS = EAN_L_PATTERNS.map(function (p) {
    var out = '';
    for (var i = 0; i < p.length; i++) out += (p.charAt(i) === '0') ? '1' : '0';
    return out;
  });

  // First-digit parity table: for each leading digit (0-9), the L/G pattern
  // used for the following 6 digits (positions 2-7 of the barcode).
  var EAN_FIRST_DIGIT_PARITY = [
    'LLLLLL', // 0
    'LLGLGG', // 1
    'LLGGLG', // 2
    'LLGGGL', // 3
    'LGLLGG', // 4
    'LGGLLG', // 5
    'LGGGLL', // 6
    'LGLGLG', // 7
    'LGLGGL', // 8
    'LGGLGL'  // 9
  ];

  function eanChecksum(digits12) {
    // Standard mod-10 weighted algorithm, weights alternating 1,3 from the
    // rightmost digit of the 12-digit payload (equivalently 3,1,3,1,... from
    // the left for a 12-digit EAN-13 payload).
    var sum = 0;
    for (var i = 0; i < 12; i++) {
      var d = parseInt(digits12.charAt(i), 10);
      // Position from left: 0-indexed i. EAN-13 weighting from the left is
      // 1,3,1,3,1,3,1,3,1,3,1,3 for positions 1-12.
      var weight = (i % 2 === 0) ? 1 : 3;
      sum += d * weight;
    }
    var check = (10 - (sum % 10)) % 10;
    return check;
  }

  function bitsToWidths(bits) {
    // Convert a run-length-encoded bit string into module widths. The caller
    // must know whether the first run represents a bar or a space; for L/G/R
    // digit patterns, bit '1' = bar, '0' = space is not how these tables are
    // conventionally read - the standard convention is: reading left to
    // right, a run of equal bits is one element, and elements alternate
    // space/bar/space/bar... beginning with space for a *pattern string*,
    // OR bar/space depending on context. Since callers here already track
    // bar/space parity in the tables themselves as "0=space unit,1=bar unit"
    // per official EAN spec (module=bar when bit=1), we convert by run-length
    // grouping of equal consecutive bits, and rely on the fact these are
    // 7-module digit patterns always starting with a space run (bit '0') for
    // L/G and starting with a bar run (bit '1') for R - handled by caller.
    var widths = [];
    var i = 0;
    while (i < bits.length) {
      var j = i;
      while (j < bits.length && bits.charAt(j) === bits.charAt(i)) j++;
      widths.push(j - i);
      i = j;
    }
    return widths;
  }

  function ean13(text) {
    if (typeof text !== 'string' || !/^[0-9]{12,13}$/.test(text)) {
      return { bars: [], ok: false, error: 'EAN-13 requires 12 or 13 digits' };
    }

    var digits12 = text.substr(0, 12);
    var computedCheck = eanChecksum(digits12);
    var checkDigit;
    var checkMismatch = false;

    if (text.length === 13) {
      var providedCheck = parseInt(text.charAt(12), 10);
      checkDigit = providedCheck;
      if (providedCheck !== computedCheck) {
        checkMismatch = true;
      }
    } else {
      checkDigit = computedCheck;
    }

    var firstDigit = parseInt(digits12.charAt(0), 10);
    var parityPattern = EAN_FIRST_DIGIT_PARITY[firstDigit];

    var bars = [];
    // Start guard: bar,space,bar = [1,1,1]
    bars.push(1, 1, 1);
    var startGuardRange = [0, bars.length];

    // Left 6 digits (digits12[1..6]), using L or G pattern per parity table.
    // Each digit's own bar-array index range is recorded (not just its total
    // 7-module width) because upca() below needs to single out exactly the
    // FIRST one for guard-style height extension, and a digit's L/G/R pattern
    // packs its 7 modules into a variable number of array entries (2-4)
    // depending on the digit value - so that range can't be derived from the
    // loop index alone.
    var leftDigitRanges = [];
    for (var i = 0; i < 6; i++) {
      var digit = parseInt(digits12.charAt(i + 1), 10);
      var isL = parityPattern.charAt(i) === 'L';
      var bits = isL ? EAN_L_PATTERNS[digit] : EAN_G_PATTERNS[digit];
      // L/G patterns always start with a space (bit '0') as their first run.
      var widths = bitsToWidths(bits);
      var leftStart = bars.length;
      for (var w = 0; w < widths.length; w++) bars.push(widths[w]);
      leftDigitRanges.push([leftStart, bars.length]);
    }

    // Middle guard: space,bar,space,bar,space = [1,1,1,1,1]
    var middleGuardRange = [bars.length, bars.length + 5];
    bars.push(1, 1, 1, 1, 1);

    // Right 6 digits: digits12[7..11] plus the check digit, always R-pattern.
    var rightDigits = digits12.substr(7, 5) + String(checkDigit);
    var rightDigitRanges = [];
    for (var r = 0; r < 6; r++) {
      var rd = parseInt(rightDigits.charAt(r), 10);
      var rbits = EAN_R_PATTERNS[rd];
      // R patterns always start with a bar (bit '1') as their first run.
      var rwidths = bitsToWidths(rbits);
      var rightStart = bars.length;
      for (var rw = 0; rw < rwidths.length; rw++) bars.push(rwidths[rw]);
      rightDigitRanges.push([rightStart, bars.length]);
    }

    // End guard: bar,space,bar = [1,1,1]
    var endGuardRange = [bars.length, bars.length + 3];
    bars.push(1, 1, 1);

    // The overall array assembly is guaranteed to start with a bar because
    // the start guard's first element (1) represents a bar.
    var result = {
      bars: bars, ok: true,
      text: digits12 + String(checkDigit), // the actually-encoded 13 digits, check digit included even when the input omitted it
      // Bar-array index ranges (see leftDigitRanges comment above for why
      // these aren't plain module offsets) of the three guard patterns -
      // verified against Labelary's own rendering to print ~13 dots taller
      // than the regular digit bars, always, regardless of height/module
      // width/DPI or whether the interpretation line is even shown.
      guardRanges: [startGuardRange, middleGuardRange, endGuardRange],
      leftDigitRanges: leftDigitRanges,
      rightDigitRanges: rightDigitRanges
    };
    if (checkMismatch) {
      result.error = 'Provided check digit ' + text.charAt(12) + ' does not match computed check digit ' + computedCheck + ' (rendered anyway)';
    }
    return result;
  }

  // ===========================================================================
  // UPC-A - GS1 unified UPC/EAN encoding decades ago, so a UPC-A payload's
  // bars are bit-for-bit identical to an EAN-13 payload with an implicit
  // leading '0' "number system" digit (confirmed by EAN_FIRST_DIGIT_PARITY[0]
  // already being 'LLLLLL', exactly the parity a leading 0 requires) - this
  // is the real encoding, not an approximation.
  // ===========================================================================
  function upca(text) {
    if (typeof text !== 'string' || !/^[0-9]{11,12}$/.test(text)) {
      return { bars: [], ok: false, error: 'UPC-A requires 11 or 12 digits' };
    }
    var result = ean13('0' + text);
    if (!result.ok) return result;
    if (result.error) result.error = result.error.replace('EAN-13', 'UPC-A');
    // True UPC-A shows 12 digits, not EAN-13's 13 - the leading '0' above was
    // only ever there to reuse EAN-13's parity-encoding trick.
    result.text = result.text.slice(1);
    // UPC-A prints its outer number-system and check digits beside (not
    // under) the bars - like the guards, verified against Labelary to have
    // no digit text under them and to print ~13 dots taller as a result.
    result.guardRanges = result.guardRanges.concat([result.leftDigitRanges[0], result.rightDigitRanges[5]]);
    return result;
  }

  // ===========================================================================
  // Canvas rendering helper
  // ===========================================================================

  function inAnyRange(i, ranges) {
    for (var r = 0; r < ranges.length; r++) {
      if (i >= ranges[r][0] && i < ranges[r][1]) return true;
    }
    return false;
  }

  // A Zebra printer can only make a bar edge on a whole dot.  In particular,
  // ^BY permits 0.1-step wide:narrow ratios, but the resulting wide run is
  // rounded to the nearest dot.  Applying that rule per run here makes the
  // browser raster match the physical ZPL result and, importantly, avoids
  // half-pixel bar edges in PNG/PDF/non-ZPL print output.
  function renderedRunWidthPx(modules, moduleWidthPx) {
    var width = Number(modules) * Number(moduleWidthPx);
    if (!isFinite(width) || width <= 0) return 0;
    return Math.max(1, Math.round(width));
  }

  function renderedWidthPx(bars, moduleWidthPx) {
    if (!bars || !bars.length) return 0;
    var width = 0;
    for (var i = 0; i < bars.length; i++) width += renderedRunWidthPx(bars[i], moduleWidthPx);
    return width;
  }

  // guardRanges/guardExtensionPx are optional (EAN-13/UPC-A only, see ean13()/
  // upca() above) - bars whose array index falls in one of guardRanges are
  // drawn guardExtensionPx taller, everything else is unaffected.
  function renderToCanvas(ctx, bars, x, y, moduleWidthPx, heightPx, guardRanges, guardExtensionPx, options) {
    if (!ctx || !bars || !bars.length) return;
    var cursorX = x;
    ctx.save();
    ctx.fillStyle = options && options.color ? options.color : '#000';
    for (var i = 0; i < bars.length; i++) {
      var widthPx = renderedRunWidthPx(bars[i], moduleWidthPx);
      var isBar = (i % 2 === 0); // element 0 is always a bar
      if (isBar) {
        var extend = (guardRanges && guardExtensionPx && inAnyRange(i, guardRanges)) ? guardExtensionPx : 0;
        ctx.fillRect(cursorX, y, widthPx, heightPx + extend);
      }
      cursorX += widthPx;
    }
    ctx.restore();
  }

  // ===========================================================================
  // Export
  // ===========================================================================

  global.ZPLBarcode = {
    code128: code128,
    code39: code39,
    itf: itf,
    ean13: ean13,
    upca: upca,
    renderedRunWidthPx: renderedRunWidthPx,
    renderedWidthPx: renderedWidthPx,
    renderToCanvas: renderToCanvas
  };

})(typeof globalThis !== 'undefined' ? globalThis : this);
