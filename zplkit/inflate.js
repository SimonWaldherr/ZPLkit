/*
 * inflate.js -- from-scratch DEFLATE (RFC 1951) / zlib (RFC 1950) decompressor.
 *
 * Written for decoding ZPL "^GFA...:Z64:<base64>:<crc32>" graphic fields, where
 * Zebra printers embed zlib-compressed raster data as base64 text. No external
 * libraries, no Node built-ins (no `zlib` module) -- this is a plain <script>
 * file, everything is attached to `window.ZPLInflate`.
 *
 * ---------------------------------------------------------------------------
 * TEST VECTOR (real Zebra ZPL zlib+base64 payload, safe to paste verbatim --
 * it is just a base64-encoded blob of proprietary label raster content, no
 * need to decode it by hand):
 *
 * eJzdVLFtwzAQJMNCXbSAAS0SRKtkhPQp9IIKdfFKNFxkDRpegEAaF4YUhndMTFo2lDbv4iDreff3
 * /JdSeQh/F1HNNuIM1ETj8NpIhmJIkP7XljwpP50v8KZ+iuYM7GbguY1p2hnw2Kj0rW+pb1kXEZVo
 * i3ztK6Ev8LUT9Guf6adzJU/LugMKcFr0b2ziyZ+X+yJqCChXfVkRyJd4P4FAH0fwDoMAe9Q/yDL2
 * u6jfH3ZRX3vqv3as/HlR9kGxL3AmxtbQdy0SPO/tzQMb2qpJgGsIZUf/EeXneXWk/H6mf+UqvLDo
 * /PU9FhjnJ/j3Y/SveK+qm1jv6X4F2BNRqf/39+QKUV0YHYf5v78nN+N3gYp9XTcPYf4CRv04D+Hc
 * gbhuHoL2BvovHXw59FEfjtAhrxlsgdQfe+h/9Ky/hu5UQ/fpMRMs9ivMH/z/7btzUX75/Wnegd0
 * WOG/h5ziAZ5/1USLKZV/pY498/Ynz+XcnRO2X9DXL19wizalUjU++mNk6GBjPJEiZ7J+qiB3QTB
 * mRnnF8e+L4IEtPRR3qX8UXu9kjjw==
 *
 * (the run-together base64 above has no embedded newlines in the actual ZPL
 * file -- it is wrapped here only for source-file readability; whitespace is
 * stripped by base64ToBytes anyway.) Feeding this through
 * zlibInflate(base64ToBytes(theString)) is expected to succeed without
 * throwing, and to produce EXACTLY 1792 bytes of output (a monochrome raster
 * image: 224 rows x 8 bytes/row).
 * ---------------------------------------------------------------------------
 */
(function (global) {
  'use strict';

  // RFC 1951 3.2.5 -- length code (257-285) base lengths and extra bit counts.
  // Index 0 corresponds to length code 257.
  var LENGTH_BASE = [
    3, 4, 5, 6, 7, 8, 9, 10, 11, 13, 15, 17, 19, 23, 27, 31,
    35, 43, 51, 59, 67, 83, 99, 115, 131, 163, 195, 227, 258
  ];
  var LENGTH_EXTRA_BITS = [
    0, 0, 0, 0, 0, 0, 0, 0, 1, 1, 1, 1, 2, 2, 2, 2,
    3, 3, 3, 3, 4, 4, 4, 4, 5, 5, 5, 5, 0
  ];

  // RFC 1951 3.2.5 -- distance code (0-29) base distances and extra bit counts.
  var DIST_BASE = [
    1, 2, 3, 4, 5, 7, 9, 13, 17, 25, 33, 49, 65, 97, 129, 193,
    257, 385, 513, 769, 1025, 1537, 2049, 3073, 4097, 6145,
    8193, 12289, 16385, 24577
  ];
  var DIST_EXTRA_BITS = [
    0, 0, 0, 0, 1, 1, 2, 2, 3, 3, 4, 4, 5, 5, 6, 6,
    7, 7, 8, 8, 9, 9, 10, 10, 11, 11, 12, 12, 13, 13
  ];

  // RFC 1951 3.2.7 -- order in which code-length-code lengths are stored.
  var CL_ORDER = [16, 17, 18, 0, 8, 7, 9, 6, 10, 5, 11, 4, 12, 3, 13, 2, 14, 1, 15];

  // ---------------------------------------------------------------------
  // Bit reader: reads DEFLATE's LSB-first bit order from a byte array.
  // ---------------------------------------------------------------------
  function BitReader(bytes) {
    this.bytes = bytes;
    this.bytePos = 0;
    this.bitBuf = 0;   // bits accumulated, LSB-first
    this.bitCount = 0; // number of valid bits currently in bitBuf
  }

  BitReader.prototype._fill = function (need) {
    while (this.bitCount < need) {
      if (this.bytePos >= this.bytes.length) {
        throw new Error('Unexpected end of input while reading bitstream');
      }
      this.bitBuf |= this.bytes[this.bytePos++] << this.bitCount;
      this.bitCount += 8;
    }
  };

  // Reads n bits (0-16), LSB-first, returns as an unsigned integer.
  BitReader.prototype.readBits = function (n) {
    if (n === 0) return 0;
    this._fill(n);
    var value = this.bitBuf & ((1 << n) - 1);
    this.bitBuf >>>= n;
    this.bitCount -= n;
    return value;
  };

  // Discards any partial byte so the next read starts at a byte boundary.
  BitReader.prototype.alignToByte = function () {
    this.bitBuf = 0;
    this.bitCount = 0;
  };

  BitReader.prototype.readByteAligned = function () {
    if (this.bytePos >= this.bytes.length) {
      throw new Error('Unexpected end of input while reading stored block');
    }
    return this.bytes[this.bytePos++];
  };

  // ---------------------------------------------------------------------
  // Canonical Huffman decoder, built from an array of code lengths
  // (RFC 1951 3.2.2: bl_count / next_code construction).
  // ---------------------------------------------------------------------
  function buildHuffmanTable(codeLengths) {
    var MAX_BITS = 15;
    var blCount = new Array(MAX_BITS + 1).fill(0);
    var i;
    for (i = 0; i < codeLengths.length; i++) {
      var len = codeLengths[i];
      if (len > MAX_BITS) {
        throw new Error('Invalid Huffman code length: ' + len);
      }
      if (len > 0) blCount[len]++;
    }

    var nextCode = new Array(MAX_BITS + 1).fill(0);
    var code = 0;
    for (var bits = 1; bits <= MAX_BITS; bits++) {
      code = (code + blCount[bits - 1]) << 1;
      nextCode[bits] = code;
    }

    // Map: bit-length -> { code -> symbol }, decoded by reading bits one at a
    // time MSB-first-of-the-code (canonical Huffman codes are assigned/read
    // that way even though the surrounding bitstream is otherwise LSB-first).
    var codes = {}; // key: len + ':' + code  -> symbol
    for (i = 0; i < codeLengths.length; i++) {
      var length = codeLengths[i];
      if (length === 0) continue;
      codes[length + ':' + nextCode[length]] = i;
      nextCode[length]++;
    }

    return { codes: codes, maxLen: MAX_BITS };
  }

  // Decodes one symbol by reading bits one at a time and building up the
  // code MSB-first, matching how canonical Huffman codes are assigned.
  function decodeSymbol(reader, table) {
    var code = 0;
    for (var len = 1; len <= table.maxLen; len++) {
      code = (code << 1) | reader.readBits(1);
      var key = len + ':' + code;
      if (Object.prototype.hasOwnProperty.call(table.codes, key)) {
        return table.codes[key];
      }
    }
    throw new Error('Invalid Huffman code in bitstream');
  }

  // ---------------------------------------------------------------------
  // Growable byte output buffer.
  // ---------------------------------------------------------------------
  // Ceiling on total decompressed size - a classic "zip bomb" DEFLATE stream
  // (a handful of back-references each copying a large length from a small
  // preceding pattern) can be a few KB yet decompress to hundreds of MB/GB;
  // since this runs synchronously on the main thread while importing/parsing
  // a file, an unbounded buffer would hang or crash the tab before the
  // caller's own try/catch (which already treats a decode failure as "keep
  // the command raw/undecoded") gets a chance to react. 32MB is generous -
  // even a 4000x4000px monochrome raster (this editor's own resize cap) is
  // only ~2MB packed.
  var MAX_INFLATE_OUTPUT_BYTES = 32 * 1024 * 1024;

  function OutputBuffer(initialSize) {
    this.buf = new Uint8Array(initialSize || 1024);
    this.length = 0;
  }

  OutputBuffer.prototype._ensureCapacity = function (extra) {
    var needed = this.length + extra;
    if (needed > MAX_INFLATE_OUTPUT_BYTES) {
      throw new Error('Inflate output exceeds ' + MAX_INFLATE_OUTPUT_BYTES + ' bytes - refusing to decompress further');
    }
    if (needed <= this.buf.length) return;
    var newSize = this.buf.length * 2;
    while (newSize < needed) newSize *= 2;
    var newBuf = new Uint8Array(newSize);
    newBuf.set(this.buf.subarray(0, this.length));
    this.buf = newBuf;
  };

  OutputBuffer.prototype.pushByte = function (b) {
    this._ensureCapacity(1);
    this.buf[this.length++] = b;
  };

  // Copies `length` bytes from `distance` bytes back in the output (LZ77
  // back-reference). Overlapping copies (distance < length) are handled
  // byte-by-byte, which is required since source and destination can overlap.
  OutputBuffer.prototype.copyMatch = function (distance, length) {
    if (distance <= 0 || distance > this.length) {
      throw new Error('Invalid distance in back-reference: ' + distance + ' (output so far: ' + this.length + ')');
    }
    this._ensureCapacity(length);
    var srcStart = this.length - distance;
    for (var i = 0; i < length; i++) {
      this.buf[this.length + i] = this.buf[srcStart + i];
    }
    this.length += length;
  };

  OutputBuffer.prototype.toUint8Array = function () {
    return this.buf.slice(0, this.length);
  };

  // ---------------------------------------------------------------------
  // Fixed Huffman tables (RFC 1951 3.2.6), built once and reused.
  // ---------------------------------------------------------------------
  var FIXED_LITLEN_TABLE = (function () {
    var lengths = new Array(288);
    var i;
    for (i = 0; i <= 143; i++) lengths[i] = 8;
    for (i = 144; i <= 255; i++) lengths[i] = 9;
    for (i = 256; i <= 279; i++) lengths[i] = 7;
    for (i = 280; i <= 287; i++) lengths[i] = 8;
    return buildHuffmanTable(lengths);
  })();

  var FIXED_DIST_TABLE = (function () {
    var lengths = new Array(30).fill(5);
    return buildHuffmanTable(lengths);
  })();

  // ---------------------------------------------------------------------
  // Block decoders.
  // ---------------------------------------------------------------------
  function inflateStoredBlock(reader, out) {
    reader.alignToByte();
    var len = reader.readByteAligned() | (reader.readByteAligned() << 8);
    var nlen = reader.readByteAligned() | (reader.readByteAligned() << 8);
    if ((len ^ nlen) !== 0xFFFF) {
      throw new Error('Stored block LEN/NLEN mismatch');
    }
    for (var i = 0; i < len; i++) {
      out.pushByte(reader.readByteAligned());
    }
  }

  function inflateHuffmanBlockData(reader, out, litlenTable, distTable) {
    for (;;) {
      var symbol = decodeSymbol(reader, litlenTable);
      if (symbol < 256) {
        out.pushByte(symbol);
      } else if (symbol === 256) {
        return; // end-of-block
      } else if (symbol <= 285) {
        var lenIdx = symbol - 257;
        if (lenIdx >= LENGTH_BASE.length) {
          throw new Error('Invalid length code: ' + symbol);
        }
        var length = LENGTH_BASE[lenIdx] + reader.readBits(LENGTH_EXTRA_BITS[lenIdx]);

        var distSymbol = decodeSymbol(reader, distTable);
        if (distSymbol >= DIST_BASE.length) {
          throw new Error('Invalid distance code: ' + distSymbol);
        }
        var distance = DIST_BASE[distSymbol] + reader.readBits(DIST_EXTRA_BITS[distSymbol]);

        out.copyMatch(distance, length);
      } else {
        throw new Error('Invalid literal/length symbol: ' + symbol);
      }
    }
  }

  function inflateFixedBlock(reader, out) {
    inflateHuffmanBlockData(reader, out, FIXED_LITLEN_TABLE, FIXED_DIST_TABLE);
  }

  // Reads the dynamic Huffman tree definitions (RFC 1951 3.2.7) and decodes
  // the block's data using them.
  function inflateDynamicBlock(reader, out) {
    var hlit = reader.readBits(5) + 257;  // # of literal/length codes (257-286)
    var hdist = reader.readBits(5) + 1;   // # of distance codes (1-32)
    var hclen = reader.readBits(4) + 4;   // # of code-length codes (4-19)

    var clLengths = new Array(19).fill(0);
    for (var i = 0; i < hclen; i++) {
      clLengths[CL_ORDER[i]] = reader.readBits(3);
    }
    var clTable = buildHuffmanTable(clLengths);

    // Decode the combined literal/length + distance code-length array using
    // the code-length alphabet (with repeat codes 16/17/18).
    var totalLengths = hlit + hdist;
    var lengths = [];
    while (lengths.length < totalLengths) {
      var sym = decodeSymbol(reader, clTable);
      if (sym <= 15) {
        lengths.push(sym);
      } else if (sym === 16) {
        if (lengths.length === 0) {
          throw new Error('Repeat code 16 with no previous code length');
        }
        var repeatCount = reader.readBits(2) + 3;
        var prev = lengths[lengths.length - 1];
        for (var r = 0; r < repeatCount; r++) lengths.push(prev);
      } else if (sym === 17) {
        var zeroCount1 = reader.readBits(3) + 3;
        for (var z1 = 0; z1 < zeroCount1; z1++) lengths.push(0);
      } else if (sym === 18) {
        var zeroCount2 = reader.readBits(7) + 11;
        for (var z2 = 0; z2 < zeroCount2; z2++) lengths.push(0);
      } else {
        throw new Error('Invalid code-length symbol: ' + sym);
      }
    }
    if (lengths.length !== totalLengths) {
      throw new Error('Dynamic Huffman code-length overrun');
    }

    var litlenLengths = lengths.slice(0, hlit);
    var distLengths = lengths.slice(hlit, hlit + hdist);

    var litlenTable = buildHuffmanTable(litlenLengths);
    var distTable = buildHuffmanTable(distLengths);

    inflateHuffmanBlockData(reader, out, litlenTable, distTable);
  }

  // ---------------------------------------------------------------------
  // Public API.
  // ---------------------------------------------------------------------

  // Decompresses a raw DEFLATE bitstream (RFC 1951).
  function rawInflate(bytes) {
    if (!(bytes instanceof Uint8Array)) {
      bytes = new Uint8Array(bytes);
    }
    var reader = new BitReader(bytes);
    var out = new OutputBuffer(Math.max(1024, bytes.length * 3));

    var bfinal;
    do {
      bfinal = reader.readBits(1);
      var btype = reader.readBits(2);

      if (btype === 0) {
        inflateStoredBlock(reader, out);
      } else if (btype === 1) {
        inflateFixedBlock(reader, out);
      } else if (btype === 2) {
        inflateDynamicBlock(reader, out);
      } else {
        throw new Error('Invalid DEFLATE block type: ' + btype);
      }
    } while (bfinal === 0);

    return out.toUint8Array();
  }

  // Strips the 2-byte zlib header (RFC 1950), verifies the header checksum
  // relationship, runs rawInflate on the compressed payload, and ignores the
  // trailing 4-byte Adler-32 (not verified).
  function zlibInflate(bytes) {
    if (!(bytes instanceof Uint8Array)) {
      bytes = new Uint8Array(bytes);
    }
    if (bytes.length < 2) {
      throw new Error('Input too short to contain a zlib header');
    }
    var cmf = bytes[0];
    var flg = bytes[1];
    var header = (cmf << 8) | flg;
    if (header % 31 !== 0) {
      throw new Error('Invalid zlib header (checksum bits do not satisfy CMF*256+FLG mod 31 == 0)');
    }
    var method = cmf & 0x0F;
    if (method !== 8) {
      throw new Error('Unsupported zlib compression method: ' + method + ' (expected 8 = deflate)');
    }
    if (flg & 0x20) {
      // FDICT bit set: a preset dictionary id follows the 2-byte header.
      // ZPL/Zebra streams do not use this, but skip it correctly if present.
      var payloadStart = 6; // 2 header bytes + 4 DICTID bytes
      return rawInflate(bytes.subarray(payloadStart, bytes.length - 4));
    }
    // Compressed data is everything after the 2-byte header, minus the
    // trailing 4-byte Adler-32 checksum (unverified per spec above).
    return rawInflate(bytes.subarray(2, bytes.length - 4));
  }

  // Decodes a base64 string (after stripping whitespace/newlines) to bytes.
  function base64ToBytes(b64) {
    var cleaned = String(b64).replace(/\s+/g, '');
    var binaryString = atob(cleaned);
    var len = binaryString.length;
    var result = new Uint8Array(len);
    for (var i = 0; i < len; i++) {
      result[i] = binaryString.charCodeAt(i);
    }
    return result;
  }

  function bytesToBase64(bytes) {
    var binary = '';
    var chunkSize = 0x8000; // avoid a call-stack blowup from fromCharCode.apply on large arrays
    for (var i = 0; i < bytes.length; i += chunkSize) {
      binary += String.fromCharCode.apply(null, bytes.subarray(i, i + chunkSize));
    }
    return btoa(binary);
  }

  // zlib-wrapped (RFC 1950) DEFLATE compression for ^GF/~DG's ":Z64:" data -
  // this editor only ever wrote decompression from scratch (see rawInflate/
  // zlibInflate above); for the encode direction it uses the browser's own
  // native Compression Streams API rather than hand-rolling a DEFLATE
  // encoder (a real correctness risk for a feature that only affects file
  // size, not anything the format requires this editor to implement itself).
  // 'deflate' (not 'deflate-raw') is the zlib-wrapped variant - exactly the
  // header+Adler32 framing zlibInflate already expects, and what real Z64
  // data uses. Resolves null (never throws) when the API isn't available,
  // so callers can fall back to the ASCII-hex/RLE encoding unconditionally.
  function zlibDeflate(bytes) {
    if (typeof CompressionStream === 'undefined') return Promise.resolve(null);
    return new Promise(function (resolve) {
      try {
        var cs = new CompressionStream('deflate');
        var writer = cs.writable.getWriter();
        writer.write(bytes instanceof Uint8Array ? bytes : new Uint8Array(bytes));
        writer.close();
        var reader = cs.readable.getReader();
        var chunks = [];
        var total = 0;
        (function pump() {
          reader.read().then(function (result) {
            if (result.done) {
              var out = new Uint8Array(total);
              var offset = 0;
              for (var i = 0; i < chunks.length; i++) { out.set(chunks[i], offset); offset += chunks[i].length; }
              resolve(out);
              return;
            }
            chunks.push(result.value);
            total += result.value.length;
            pump();
          }, function () { resolve(null); });
        })();
      } catch (e) {
        resolve(null);
      }
    });
  }

  global.ZPLInflate = {
    rawInflate: rawInflate,
    zlibInflate: zlibInflate,
    base64ToBytes: base64ToBytes,
    bytesToBase64: bytesToBase64,
    zlibDeflate: zlibDeflate
  };

})(typeof globalThis !== 'undefined' ? globalThis : this);
