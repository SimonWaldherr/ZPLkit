/*
 * gfa-codec.js
 * Encode/decode ZPL "Graphic Field" raster images (^GF / ~DG payload body).
 * Classic script, no build step. Attaches window.ZPLGraphic.
 * Depends on window.ZPLInflate (zlibInflate, base64ToBytes) for :Z64: payloads.
 */
(function (global) {
  'use strict';

  // ---------------------------------------------------------------------
  // CRC-16/CCITT, MSB-first, polynomial 0x1021, selectable initial value.
  // ---------------------------------------------------------------------
  const CRC16_TABLE = new Uint16Array(256);
  for (let i = 0; i < CRC16_TABLE.length; i++) {
    let crc = i << 8;
    for (let bit = 0; bit < 8; bit++) {
      crc = (crc & 0x8000) ? ((crc << 1) ^ 0x1021) : (crc << 1);
    }
    CRC16_TABLE[i] = crc & 0xFFFF;
  }

  function crc16(bytes, initial) {
    let crc = initial & 0xFFFF;
    for (let i = 0; i < bytes.length; i++) {
      crc = ((crc << 8) ^ CRC16_TABLE[((crc >> 8) ^ bytes[i]) & 0xFF]) & 0xFFFF;
    }
    return crc;
  }

  // Lookup tables for the repeat-count letters.
  // Index 0 is unused (space) in both tables per the spec.
  const LOWER_MULT = ' ghijklmnopqrstuvwxyz'; // index*20, index 1..20 (index 20 = 'z' = 400)
  const UPPER_ADD = ' GHIJKLMNOPQRSTUVWXY';   // index*1,  index 1..19 (index 19 = 'Y')

  function isHexDigit(ch) {
    return (ch >= '0' && ch <= '9') || (ch >= 'A' && ch <= 'F') || (ch >= 'a' && ch <= 'f');
  }

  // Precomputed 2-char uppercase hex string per byte value - avoids calling
  // toString(16)+toUpperCase() (real overhead, each its own allocation) for
  // every single byte of a graphic's data, which for a large embedded image
  // is by far the hottest loop in the whole encode path.
  const HEX_BYTE = new Array(256);
  for (let hb = 0; hb < 256; hb++) {
    HEX_BYTE[hb] = (hb < 16 ? '0' : '') + hb.toString(16).toUpperCase();
  }

  // Nibble value of one hex-digit character code, used to decode two hex
  // characters straight into a byte without the substring allocation
  // (rowHex.slice(...)) and general-purpose parseInt() overhead that a naive
  // per-byte decode would otherwise pay for every byte of the image.
  function hexNibble(code) {
    if (code >= 48 && code <= 57) return code - 48; // '0'-'9'
    if (code >= 65 && code <= 70) return code - 55; // 'A'-'F'
    if (code >= 97 && code <= 102) return code - 87; // 'a'-'f'
    return 0;
  }

  // -----------------------------------------------------------------------
  // Decode Zebra "compressed ASCII" hex data (used inside ^GFA payloads).
  // Returns { bytesPerRow, rows, bytes }.
  // -----------------------------------------------------------------------
  function decodeCompressedAscii(data, bytesPerRow) {
    const rowLen = bytesPerRow * 2;
    const rows = [];
    let currentRow = '';
    let pendingRepeat = 0;

    function flushRun(count, ch) {
      currentRow += ch.repeat(count);
      while (currentRow.length >= rowLen) {
        rows.push(currentRow.slice(0, rowLen));
        currentRow = currentRow.slice(rowLen);
      }
    }

    for (let i = 0; i < data.length; i++) {
      const ch = data[i];

      // Hex digits are the overwhelming majority of characters in real
      // compressed graphic data (repeat-codes/whitespace are comparatively
      // rare) - checked first so the common case skips every other branch
      // below instead of falling through two LOWER_MULT/UPPER_ADD .indexOf()
      // scans first. Neither table contains any hex-digit character, so
      // reordering doesn't change which branch ultimately matches.
      if (isHexDigit(ch)) {
        const count = pendingRepeat > 0 ? pendingRepeat : 1;
        flushRun(count, ch.toUpperCase());
        pendingRepeat = 0;
        continue;
      }

      // Ignore whitespace/newlines entirely - not meaningful. A plain
      // character check instead of a /\s/ regex literal, since re-testing a
      // fresh regex on every character of a large graphic is real overhead.
      if (ch === ' ' || ch === '\n' || ch === '\r' || ch === '\t') continue;

      if (ch === ':') {
        if (currentRow !== '' || rows.length === 0) {
          throw new Error('Invalid ZPL graphic data: unexpected ":" row-repeat token');
        }
        rows.push(rows[rows.length - 1]);
        continue;
      }

      if (ch === ',') {
        currentRow += '0'.repeat(rowLen - currentRow.length);
        rows.push(currentRow);
        currentRow = '';
        pendingRepeat = 0;
        continue;
      }

      if (ch === '!') {
        currentRow += 'F'.repeat(rowLen - currentRow.length);
        rows.push(currentRow);
        currentRow = '';
        pendingRepeat = 0;
        continue;
      }

      const lowerIdx = LOWER_MULT.indexOf(ch);
      if (lowerIdx > 0) {
        pendingRepeat += lowerIdx * 20;
        continue;
      }

      const upperIdx = UPPER_ADD.indexOf(ch);
      if (upperIdx > 0) {
        pendingRepeat += upperIdx;
        continue;
      }

      throw new Error('Invalid ZPL graphic data: unexpected character "' + ch + '"');
    }

    if (currentRow.length > 0) {
      rows.push(currentRow);
    }
    // pendingRepeat can only be nonzero here if a repeat letter was consumed
    // but never followed by the literal hex digit it modifies (no table
    // entry maps to a repeat value of 0, so this check is unambiguous).
    if (pendingRepeat !== 0) {
      throw new Error('Invalid ZPL graphic data: trailing repeat code with no literal digit');
    }

    // Hex rows -> flat byte array (row-major). Decodes each byte's two hex
    // characters directly via hexNibble() rather than slice()+parseInt(),
    // which would otherwise allocate one throwaway 2-char string per byte.
    const bytes = new Uint8Array(rows.length * bytesPerRow);
    for (let r = 0; r < rows.length; r++) {
      const rowHex = rows[r];
      const base = r * bytesPerRow;
      for (let c = 0; c < bytesPerRow; c++) {
        const p = c * 2;
        const hi = hexNibble(rowHex.charCodeAt(p));
        const lo = hexNibble(rowHex.charCodeAt(p + 1));
        bytes[base + c] = (hi << 4) | lo;
      }
    }

    return { bytesPerRow, rows: rows.length, bytes };
  }

  // -----------------------------------------------------------------------
  // Encode raw hex rows (array of uppercase hex strings, each length
  // bytesPerRow*2) into Zebra compressed-ASCII form.
  // -----------------------------------------------------------------------
  function repeatCodeFor(count) {
    // Express `count` (1..419, caller chunks longer runs) as one optional
    // lowercase multiplier (g..y = 20..380, z = 400) plus one optional
    // uppercase addend (G..Y = 1..19). Math.floor(count/20) naturally lands
    // on 20 -> 'z' for count in [400,419], so no special-case is needed.
    let code = '';
    let remaining = count;
    const mult = Math.floor(remaining / 20);
    if (mult > 0) {
      code += LOWER_MULT[mult];
      remaining -= mult * 20;
    }
    if (remaining > 0) {
      code += UPPER_ADD[remaining];
    }
    return code;
  }

  function encodeRunLength(hexRow) {
    const out = [];
    let i = 0;
    const n = hexRow.length;
    while (i < n) {
      const ch = hexRow[i];
      let j = i + 1;
      while (j < n && hexRow[j] === ch) j++;
      let runLen = j - i;

      if (runLen <= 4) {
        out.push(ch.repeat(runLen));
      } else {
        let remaining = runLen;
        while (remaining > 0) {
          const chunk = Math.min(remaining, 419);
          out.push(repeatCodeFor(chunk) + ch);
          remaining -= chunk;
        }
      }
      i = j;
    }
    return out.join('');
  }

  function compressRow(rowHex) {
    let isAllZero = true;
    let isAllF = true;
    for (let k = 0; k < rowHex.length; k++) {
      if (rowHex[k] !== '0') isAllZero = false;
      if (rowHex[k] !== 'F') isAllF = false;
      if (!isAllZero && !isAllF) break;
    }
    if (isAllZero) return ',';
    if (isAllF) return '!';
    return encodeRunLength(rowHex);
  }

  // -----------------------------------------------------------------------
  // decodeMonochromeBody: shared decode core for ^GF and ~DG, which carry the
  // exact same picture-data encoding (Zebra's ~DG doc explicitly reuses ^GF's
  // format) but differ in their leading field layout - ^GF has an explicit
  // compression-type letter ('A'=ASCII hex w/ RLE shortcuts, 'B'=raw binary),
  // ~DG has none and is always 'A'-equivalent unless the data is :Z64:-prefixed.
  // -----------------------------------------------------------------------
  // Generous sanity bound for a DECODED graphic's dimensions - well above
  // anything a real label graphic needs (this editor's own UI resize cap,
  // MAX_GRAPHIC_DIM in app.js, is 4000px). Exists purely to reject a
  // corrupt/malicious bytesPerRow+binaryByteCount header pair (e.g. a typo'd
  // "0" row width, or a huge declared size) BEFORE it drives an allocation
  // sized off that header rather than the actual data - both decodeCompressedAscii
  // (an infinite loop when bpr<=0, since its row length becomes 0) and
  // bitsToImageData()'s widthPx*heightPx*4 ImageData buffer (multi-GB for a
  // wildly oversized header) are downstream of this value.
  const MAX_DECODE_DIM_PX = 8000;

  function decodeMonochromeBody(typeLetter, binaryByteCount, bpr, data) {
    bpr = Math.trunc(bpr);
    if (!(bpr > 0)) {
      throw new Error('Invalid graphic data: bytesPerRow must be a positive integer, got ' + bpr);
    }
    if (bpr * 8 > MAX_DECODE_DIM_PX) {
      throw new Error('Invalid graphic data: declared width ' + (bpr * 8) + 'px exceeds ' + MAX_DECODE_DIM_PX + 'px');
    }
    const heightPx = Math.round(binaryByteCount / bpr);
    if (heightPx > MAX_DECODE_DIM_PX) {
      throw new Error('Invalid graphic data: declared height ' + heightPx + 'px exceeds ' + MAX_DECODE_DIM_PX + 'px');
    }
    const widthPx = bpr * 8;
    const trimmedData = data.trim();

    let bytes;
    let mode;

    if (trimmedData.indexOf(':Z64:') === 0) {
      mode = 'Z64';
      // Format: :Z64:<base64>:<CRC-hex>
      const segments = trimmedData.split(':');
      // segments = ['', 'Z64', '<base64>', '<crchex>', ...maybe trailing '']
      const b64 = segments[2] || '';
      const crcHex = (segments[3] || '').trim();

      const compressedBytes = global.ZPLInflate.base64ToBytes(b64);

      let crcMatched = null;
      if (crcHex) {
        const expectedCrc = parseInt(crcHex, 16);
        const crcZero = crc16(compressedBytes, 0x0000);
        const crcFFFF = crc16(compressedBytes, 0xFFFF);
        if (crcZero === expectedCrc) crcMatched = '0000';
        else if (crcFFFF === expectedCrc) crcMatched = 'FFFF';
      }

      bytes = global.ZPLInflate.zlibInflate(compressedBytes);

      return { widthPx, heightPx, bytesPerRow: bpr, bytes, mode, crcMatched };
    } else if (typeLetter === 'A') {
      mode = 'A';
      const decoded = decodeCompressedAscii(trimmedData, bpr);
      bytes = decoded.bytes;
    } else if (typeLetter === 'B') {
      mode = 'B';
      if (typeof data === 'string') {
        bytes = new Uint8Array(data.length);
        for (let i = 0; i < data.length; i++) {
          bytes[i] = data.charCodeAt(i) & 0xFF;
        }
      } else {
        // Already byte-like (Uint8Array or array-like).
        bytes = new Uint8Array(data);
      }
    } else {
      throw new Error('Unsupported graphic type: ' + typeLetter);
    }

    return { widthPx, heightPx, bytesPerRow: bpr, bytes, mode };
  }

  // Shared "comma-delimited structural fields, then an opaque tail" cursor
  // used by both decodeGF and decodeDG below - they differ only in which
  // command name to quote in the error message when a field is missing, and
  // in how many fields precede the opaque data. The tail must never be
  // split further once reached: compressed-ASCII data legitimately contains
  // literal ',' characters (the whole-row-of-zeros shortcut token), which
  // are not delimiters there.
  function makeFieldCursor(initial, cmdLabel) {
    let remainder = initial;
    return {
      next: function () {
        const idx = remainder.indexOf(',');
        if (idx === -1) {
          throw new Error('Invalid ' + cmdLabel + ' data: expected more fields');
        }
        const field = remainder.slice(0, idx);
        remainder = remainder.slice(idx + 1);
        return field;
      },
      rest: function () { return remainder; },
    };
  }

  // -----------------------------------------------------------------------
  // decodeGF: parse the body following "^GF" (starts with the type letter).
  // -----------------------------------------------------------------------
  function decodeGF(body) {
    const typeLetter = body.charAt(0).toUpperCase();
    const rest = body.slice(1);

    // rest begins with a leading comma ("A,1792,1792,8,...") so a naive
    // split(',') produces an empty first element - drop it explicitly by
    // slicing past the first comma rather than relying on split() quirks.
    const firstComma = rest.indexOf(',');
    if (firstComma === -1) {
      throw new Error('Invalid ^GF data: missing field separators');
    }
    const cursor = makeFieldCursor(rest.slice(firstComma + 1), '^GF'); // "1792,1792,8,data..."

    cursor.next(); // field 'b' (total encoded-field byte count) - not needed for decoding
    const binaryByteCount = parseInt(cursor.next(), 10); // field 'c' - drives heightPx below
    const bpr = parseInt(cursor.next(), 10);             // field 'd' - bytesPerRow
    const data = cursor.rest();

    return decodeMonochromeBody(typeLetter, binaryByteCount, bpr, data);
  }

  // -----------------------------------------------------------------------
  // decodeDG: parse the body following "~DG" - "<name>,<t>,<w>,<data>" where
  // name may itself contain a "device:" memory-location prefix (e.g.
  // "R:SSGFX000.GRF"), t = total (decompressed) byte count, w = bytes per row.
  // -----------------------------------------------------------------------
  function decodeDG(body) {
    const firstComma = body.indexOf(',');
    if (firstComma === -1) {
      throw new Error('Invalid ~DG data: missing name separator');
    }
    const name = body.slice(0, firstComma);
    const cursor = makeFieldCursor(body.slice(firstComma + 1), '~DG');

    const binaryByteCount = parseInt(cursor.next(), 10); // t
    const bpr = parseInt(cursor.next(), 10);             // w
    const data = cursor.rest();

    const decoded = decodeMonochromeBody('A', binaryByteCount, bpr, data);
    decoded.name = name;
    return decoded;
  }

  // -----------------------------------------------------------------------
  // bitsToImageData: packed monochrome rows -> browser ImageData.
  // -----------------------------------------------------------------------
  function bitsToImageData(decoded) {
    const { widthPx, heightPx, bytesPerRow, bytes } = decoded;
    const rgba = new Uint8ClampedArray(widthPx * heightPx * 4);

    for (let y = 0; y < heightPx; y++) {
      const rowBase = y * bytesPerRow;
      for (let x = 0; x < widthPx; x++) {
        const byteIndex = rowBase + (x >> 3);
        const bitIndex = 7 - (x & 7);
        const bit = byteIndex < bytes.length ? (bytes[byteIndex] >> bitIndex) & 1 : 0;
        const pixelOffset = (y * widthPx + x) * 4;
        if (bit === 1) {
          rgba[pixelOffset] = 0;
          rgba[pixelOffset + 1] = 0;
          rgba[pixelOffset + 2] = 0;
          rgba[pixelOffset + 3] = 255;
        } else {
          rgba[pixelOffset] = 255;
          rgba[pixelOffset + 1] = 255;
          rgba[pixelOffset + 2] = 255;
          rgba[pixelOffset + 3] = 0;
        }
      }
    }

    return new ImageData(rgba, widthPx, heightPx);
  }

  // -----------------------------------------------------------------------
  // encodeMonochromeBitmap: shared encode core for ^GF and ~DG - rasterizes
  // imageData to a 1bpp bitmap and hex/RLE-encodes it, without either
  // command's own field-layout prefix (that's added by the two callers below).
  // -----------------------------------------------------------------------
  // Shared final stage: row-major packed 1bpp bytes -> hex-encoded rows,
  // optionally RLE-compressed, plus the byte-count metadata every ^GF/~DG
  // caller needs. Split out of encodeMonochromeBitmap so a caller that
  // already HAS packed bits (an imported/decoded graphic's own .bits, or a
  // stored graphic's .bytes) can reach it directly via bitsToGF/bitsToDG
  // below instead of inflating them back out to a throwaway RGBA buffer
  // just to re-derive the exact same bytes through the threshold step again.
  function hexEncodeBits(bytes, bytesPerRow, height, compress) {
    const encodedRows = [];
    let previousRow = null;
    for (let y = 0; y < height; y++) {
      let rowHex = '';
      const rowBase = y * bytesPerRow;
      for (let c = 0; c < bytesPerRow; c++) {
        rowHex += HEX_BYTE[bytes[rowBase + c]];
      }
      // Retain only the preceding raw row. Repeated rows need no second
      // RLE pass, and compressed images no longer retain every hex row.
      encodedRows.push(compress ? (rowHex === previousRow ? ':' : compressRow(rowHex)) : rowHex);
      previousRow = rowHex;
    }
    const data = encodedRows.join('');
    return { bytesPerRow: bytesPerRow, binaryByteCount: bytesPerRow * height, data: data };
  }

  function encodeMonochromeBitmap(imageData, opts) {
    opts = opts || {};
    const threshold = opts.threshold != null ? opts.threshold : 128;

    const width = imageData.width;
    const height = imageData.height;
    const src = imageData.data;
    const bytesPerRow = Math.ceil(width / 8);

    const bytes = new Uint8Array(bytesPerRow * height);

    for (let y = 0; y < height; y++) {
      const rowBase = y * bytesPerRow;
      for (let x = 0; x < width; x++) {
        const off = (y * width + x) * 4;
        const r = src[off];
        const g = src[off + 1];
        const b = src[off + 2];
        const a = src[off + 3] / 255;

        // Flatten alpha onto a white background.
        const outR = 255 * (1 - a) + r * a;
        const outG = 255 * (1 - a) + g * a;
        const outB = 255 * (1 - a) + b * a;

        const luminance = 0.299 * outR + 0.587 * outG + 0.114 * outB;
        const black = luminance < threshold ? 1 : 0;

        if (black) {
          const byteIndex = rowBase + (x >> 3);
          const bitIndex = 7 - (x & 7);
          bytes[byteIndex] |= (1 << bitIndex);
        }
      }
    }

    return hexEncodeBits(bytes, bytesPerRow, height, opts.compress !== false);
  }

  // -----------------------------------------------------------------------
  // imageDataToGF: browser ImageData -> full "^GFA,...,...,...,<data>" string.
  // -----------------------------------------------------------------------
  function imageDataToGF(imageData, opts) {
    const enc = encodeMonochromeBitmap(imageData, opts);
    return '^GFA,' + enc.data.length + ',' + enc.binaryByteCount + ',' + enc.bytesPerRow + ',' + enc.data;
  }

  // -----------------------------------------------------------------------
  // imageDataToDG: browser ImageData -> full "~DG<name>,<t>,<w>,<data>" string
  // for storing a named/reusable graphic (paired with ^XG to place it and
  // optionally ^ID to delete it after printing).
  // -----------------------------------------------------------------------
  function imageDataToDG(imageData, name, opts) {
    const enc = encodeMonochromeBitmap(imageData, opts);
    return '~DG' + name + ',' + enc.binaryByteCount + ',' + enc.bytesPerRow + ',' + enc.data;
  }

  // -----------------------------------------------------------------------
  // bitsToGF / bitsToDG: same output as imageDataToGF/imageDataToDG, but for
  // a graphic that's ALREADY packed 1bpp bytes (every graphic this editor
  // decodes from a real file, or has previously imported, already is) -
  // skips the RGBA round-trip and re-thresholding entirely.
  // -----------------------------------------------------------------------
  function bitsToGF(bytes, bytesPerRow, height, opts) {
    const compress = !opts || opts.compress !== false;
    const enc = hexEncodeBits(bytes, bytesPerRow, height, compress);
    return '^GFA,' + enc.data.length + ',' + enc.binaryByteCount + ',' + enc.bytesPerRow + ',' + enc.data;
  }
  function bitsToDG(bytes, name, bytesPerRow, height, opts) {
    const compress = !opts || opts.compress !== false;
    const enc = hexEncodeBits(bytes, bytesPerRow, height, compress);
    return '~DG' + name + ',' + enc.binaryByteCount + ',' + enc.bytesPerRow + ',' + enc.data;
  }

  // Async: zlib-compresses ALREADY-PACKED monochrome bytes (row-major, 1bpp,
  // MSB-first per byte - exactly what decodeGF/decodeDG/ImageMono.monochromize
  // already produce) into the ":Z64:<base64>:<crcHex>:" data segment used by
  // ^GF/~DG. This is often smaller than ASCII-hex+RLE for photo-like/noisy
  // images (where RLE has little to compress), and never worse in practice
  // since callers compare both and keep whichever is shorter. Resolves null
  // when the browser has no native CompressionStream - callers fall back to
  // the always-available ASCII-hex/RLE encoding in that case.
  async function encodeZ64(packedBytes) {
    if (!global.ZPLInflate || !global.ZPLInflate.zlibDeflate) return null;
    const compressed = await global.ZPLInflate.zlibDeflate(packedBytes);
    if (!compressed) return null;
    const b64 = global.ZPLInflate.bytesToBase64(compressed);
    const crcHex = crc16(compressed, 0x0000).toString(16).toUpperCase().padStart(4, '0');
    return ':Z64:' + b64 + ':' + crcHex + ':';
  }

  // Shared cache for the async-computed Z64 alternative of a graphic
  // element's packed bits, keyed by the element object itself. A WeakMap
  // (rather than a property on the element) so it never touches the
  // element's own JSON-serializable shape - history snapshots and export
  // stay exactly as they were, and stale entries are naturally dropped once
  // an element is no longer reachable (e.g. after undo/redo rebuilds the
  // elements array via JSON parse, which creates fresh objects with no
  // entry here - correctly falls back to re-deriving/using RLE until a
  // fresh async compression completes for the new object). app.js writes
  // to this after import/replace/resize; zpl-generator.js reads it when
  // deciding between the RLE and Z64 encoding for export - both need the
  // SAME cache, hence living here rather than in either file alone.
  const z64Cache = new WeakMap();

  global.ZPLGraphic = {
    crc16: crc16,
    decodeGF: decodeGF,
    decodeDG: decodeDG,
    bitsToImageData: bitsToImageData,
    imageDataToGF: imageDataToGF,
    imageDataToDG: imageDataToDG,
    bitsToGF: bitsToGF,
    bitsToDG: bitsToDG,
    encodeZ64: encodeZ64,
    z64Cache: z64Cache
  };

})(typeof globalThis !== 'undefined' ? globalThis : this);
