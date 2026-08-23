/* ZPL label editor — gif-writer: minimal from-scratch GIF89a encoder for a
   single static frame (no animation, no Graphic Control Extension, no
   interlacing). No build step, no npm, depends on nothing.

   Why GIF has no real alpha channel here: GIF's only transparency mechanism
   is a single "this palette index means transparent" flag, which can't
   represent partial/anti-aliased transparency anyway. So per the caller's
   contract this module does the simplest thing that can't silently lose
   more than that: alpha < 128 -> treated as fully transparent and flattened
   to opaque white, alpha >= 128 -> treated as fully opaque and the pixel's
   own RGB is used unchanged. No blending math, no GIF transparent-index
   feature used at all.

   Palette: exact (lossless) when the image uses <=256 distinct colors after
   the alpha threshold above - which is the common case for this editor's
   labels (mostly black/white text and barcodes, plus anti-aliased edges on
   rotated shapes/fonts). Falls back to a hand-rolled median-cut quantizer
   to 256 colors otherwise (e.g. photographic imports, gradients).

   LZW: implements GIF's specific variable-code-size LZW variant directly
   (RFC-less; the "spec" is Appendix F of the GIF89a document plus decades
   of de-facto encoder/decoder convention). See lzwEncode() below for the
   exact code-size-growth and dictionary-reset rules - these must match
   what real GIF decoders (i.e. every browser) expect bit-for-bit, since
   there is no wiggle room in a compressed bitstream format.

   Attaches global GifWriter. */
(function (global) {
  'use strict';

  // =========================================================================
  // Palette construction
  // =========================================================================

  // Applies the binary alpha threshold described above and returns:
  //   pixelKeys:  Int32Array (one 24-bit 0xRRGGBB key per pixel)
  //   histogram:  Map<key, count> of distinct post-threshold colors
  function buildHistogram(imageData) {
    var width = imageData.width, height = imageData.height;
    var src = imageData.data;
    var n = width * height;

    var pixelKeys = new Int32Array(n);
    var histogram = new Map();

    for (var i = 0, p = 0; i < n; i++, p += 4) {
      var r, g, b;
      if (src[p + 3] < 128) {
        // Fully transparent under our threshold -> flattened to white, not
        // blended - the caller's contract explicitly rules out real alpha
        // blending here.
        r = 255; g = 255; b = 255;
      } else {
        r = src[p]; g = src[p + 1]; b = src[p + 2];
      }
      var key = (r << 16) | (g << 8) | b;
      pixelKeys[i] = key;
      histogram.set(key, (histogram.get(key) || 0) + 1);
    }

    return { pixelKeys: pixelKeys, histogram: histogram };
  }

  // Median-cut color quantizer: reduces an arbitrarily large histogram down
  // to at most maxColors palette entries. Operates on the histogram's
  // distinct (r,g,b,count) entries (population-weighted), not on individual
  // pixels, which is both the classic formulation and far cheaper when a
  // photo-like image has many more pixels than distinct colors.
  //
  // Algorithm: start with one bucket holding every distinct color. Repeatedly
  // find the bucket whose widest channel (R, G, or B - whichever has the
  // largest max-min spread in that bucket) has the largest range of any
  // bucket, sort that bucket's colors along that channel, and split it at
  // the point where the running pixel-population count first reaches half
  // the bucket's total population (a population-weighted median, so each
  // half represents roughly equal pixel coverage rather than equal color
  // count). Stop once there are maxColors buckets or every remaining bucket
  // is down to a single distinct color (range 0 everywhere, nothing left
  // worth splitting). Each final bucket's population-weighted average color
  // becomes one palette entry.
  function medianCutQuantize(histogram, maxColors) {
    var entries = [];
    histogram.forEach(function (count, key) {
      entries.push({ r: (key >> 16) & 0xFF, g: (key >> 8) & 0xFF, b: key & 0xFF, count: count });
    });

    var buckets = [entries];

    function widestChannel(bucket) {
      var rLo = 255, rHi = 0, gLo = 255, gHi = 0, bLo = 255, bHi = 0;
      for (var i = 0; i < bucket.length; i++) {
        var e = bucket[i];
        if (e.r < rLo) rLo = e.r;
        if (e.r > rHi) rHi = e.r;
        if (e.g < gLo) gLo = e.g;
        if (e.g > gHi) gHi = e.g;
        if (e.b < bLo) bLo = e.b;
        if (e.b > bHi) bHi = e.b;
      }
      var rRange = rHi - rLo, gRange = gHi - gLo, bRange = bHi - bLo;
      if (rRange >= gRange && rRange >= bRange) return { channel: 'r', range: rRange };
      if (gRange >= bRange) return { channel: 'g', range: gRange };
      return { channel: 'b', range: bRange };
    }

    while (buckets.length < maxColors) {
      var bestIdx = -1, bestRange = 0, bestChannel = null;
      for (var bi = 0; bi < buckets.length; bi++) {
        // A bucket with a single distinct color has zero range on every
        // channel (histogram entries are already deduplicated by exact
        // RGB, so >1 entries guarantees >0 range on at least one channel) -
        // skip it rather than let it "win" a bestRange===0 comparison.
        if (buckets[bi].length <= 1) continue;
        var wc = widestChannel(buckets[bi]);
        if (wc.range > bestRange) { bestRange = wc.range; bestIdx = bi; bestChannel = wc.channel; }
      }
      if (bestIdx === -1) break; // nothing left worth splitting

      var bucket = buckets[bestIdx];
      bucket.sort(function (a, b2) { return a[bestChannel] - b2[bestChannel]; });

      var total = 0;
      for (var ci = 0; ci < bucket.length; ci++) total += bucket[ci].count;
      var half = total / 2;
      var running = 0, splitAt = 0;
      for (var si = 0; si < bucket.length; si++) {
        running += bucket[si].count;
        splitAt = si;
        if (running >= half) break;
      }
      // Guard against a degenerate split that would leave one side empty
      // (possible when almost all the population sits in the bucket's last
      // color) - clamp so both halves keep at least one entry.
      if (splitAt >= bucket.length - 1) splitAt = bucket.length - 2;

      var lo = bucket.slice(0, splitAt + 1);
      var hi = bucket.slice(splitAt + 1);
      buckets.splice(bestIdx, 1, lo, hi);
    }

    var palette = [];
    for (var pi = 0; pi < buckets.length; pi++) {
      var b = buckets[pi];
      var sumR = 0, sumG = 0, sumB = 0, sumCount = 0;
      for (var j = 0; j < b.length; j++) {
        sumR += b[j].r * b[j].count;
        sumG += b[j].g * b[j].count;
        sumB += b[j].b * b[j].count;
        sumCount += b[j].count;
      }
      palette.push([Math.round(sumR / sumCount), Math.round(sumG / sumCount), Math.round(sumB / sumCount)]);
    }
    return palette;
  }

  // Maps every distinct histogram color to its nearest palette entry
  // (squared Euclidean RGB distance, plain linear scan - palette is capped
  // at 256 entries so this is cheap even done once per distinct color).
  // Done per distinct color rather than per pixel: every pixel's color is
  // one of these distinct colors, so this produces the exact same per-pixel
  // mapping for a fraction of the comparisons on images with repeated colors.
  function buildNearestColorMap(histogram, palette) {
    var map = new Map();
    histogram.forEach(function (count, key) {
      var r = (key >> 16) & 0xFF, g = (key >> 8) & 0xFF, b = key & 0xFF;
      var bestIdx = 0, bestDist = Infinity;
      for (var i = 0; i < palette.length; i++) {
        var pc = palette[i];
        var dr = r - pc[0], dg = g - pc[1], db = b - pc[2];
        var dist = dr * dr + dg * dg + db * db;
        if (dist < bestDist) { bestDist = dist; bestIdx = i; }
      }
      map.set(key, bestIdx);
    });
    return map;
  }

  // =========================================================================
  // LZW (GIF variant)
  // =========================================================================

  // Encodes a stream of palette indices (0..255) into GIF's LZW bitstream:
  // a leading Clear code, then codes for each recognized prefix+symbol run,
  // a trailing End-of-Information code, with the code's bit-width starting
  // at minCodeSize+1 and growing as the dictionary fills. Returns a plain
  // array of raw bytes (NOT yet split into 255-byte sub-blocks - the caller
  // does that, since sub-block framing is a container concern, not a
  // compression one).
  //
  // Code-size-growth rule (the one part of GIF's LZW that isn't obvious from
  // the format description and MUST match what real decoders assume): right
  // when a newly-assigned dictionary code's value reaches the current code
  // size's power-of-two ceiling (e.g. code 8 is assigned while codes are
  // still 3 bits wide, which can only represent 0-7), bump the code size by
  // one bit immediately - before that code could ever be referenced again.
  // This is the same convention every real-world GIF encoder uses, which is
  // why browsers' built-in decoders need it followed exactly.
  //
  // Dictionary-reset rule: GIF codes are at most 12 bits (0-4095). Once the
  // dictionary has handed out code 4095, there is no room left to grow -
  // emit a fresh Clear code and start over with an empty dictionary.
  function lzwEncode(indices, minCodeSize) {
    var clearCode = 1 << minCodeSize;
    var eoiCode = clearCode + 1;

    var codeSize = minCodeSize + 1;
    var nextCode = eoiCode + 1;
    var codeTable = new Map();

    var bytes = [];
    var bitBuffer = 0, bitCount = 0;

    // LSB-first bit packing: each code's low-order bit lands in the current
    // lowest free bit position of the byte being assembled - the exact
    // convention GIF's LZW data (unlike, say, DEFLATE's Huffman codes) uses.
    function emitCode(code) {
      bitBuffer |= code << bitCount;
      bitCount += codeSize;
      while (bitCount >= 8) {
        bytes.push(bitBuffer & 0xFF);
        bitBuffer >>>= 8;
        bitCount -= 8;
      }
    }

    emitCode(clearCode);

    var n = indices.length;
    if (n === 0) {
      emitCode(eoiCode);
    } else {
      var prefix = indices[0];
      for (var i = 1; i < n; i++) {
        var k = indices[i];
        // prefix is always <4096 and k is always <256 (palette index byte),
        // so this numeric key is unique per (prefix, symbol) pair without
        // needing a string-concatenation hash.
        var key = prefix * 256 + k;
        var existing = codeTable.get(key);
        if (existing !== undefined) {
          prefix = existing;
          continue;
        }

        emitCode(prefix);

        var newCode = nextCode++;
        codeTable.set(key, newCode);
        if (newCode === (1 << codeSize) && codeSize < 12) {
          codeSize++;
        }
        if (newCode === 4095) {
          // Dictionary exhausted the full 12-bit code space - clear and
          // restart exactly as a fresh stream would, mid-image.
          emitCode(clearCode);
          codeTable = new Map();
          nextCode = eoiCode + 1;
          codeSize = minCodeSize + 1;
        }
        prefix = k;
      }
      emitCode(prefix);
      emitCode(eoiCode);
    }

    if (bitCount > 0) {
      bytes.push(bitBuffer & 0xFF);
    }

    return bytes;
  }

  // Splits a raw LZW byte stream into GIF's length-prefixed sub-blocks (each
  // up to 255 data bytes preceded by its own length byte), followed by the
  // zero-length block terminator that ends the Image Data block.
  function packSubBlocks(byteArray) {
    var out = [];
    var i = 0;
    var n = byteArray.length;
    while (i < n) {
      var chunkLen = Math.min(255, n - i);
      out.push(chunkLen);
      for (var j = 0; j < chunkLen; j++) out.push(byteArray[i + j]);
      i += chunkLen;
    }
    out.push(0x00); // block terminator
    return out;
  }

  // =========================================================================
  // Byte builder + GIF container assembly
  // =========================================================================

  function pushAscii(out, str) {
    for (var i = 0; i < str.length; i++) out.push(str.charCodeAt(i));
  }

  function pushU16LE(out, v) {
    out.push(v & 0xFF, (v >> 8) & 0xFF);
  }

  // Assembles the complete GIF89a byte stream: header, logical screen
  // descriptor + global color table, image descriptor, LZW image data, and
  // trailer. No Graphic Control Extension is emitted - this encoder never
  // uses GIF's transparent-color-index feature (see the alpha-threshold note
  // at the top of this file), and with only one frame there is nothing for
  // a GCE's disposal/delay fields to describe either.
  function assembleGif(width, height, palette, indices) {
    // Global Color Table size must be a power of two, minimum 2 entries
    // (even a 1-color image still needs a real color table).
    var actualTableSize = 2;
    while (actualTableSize < palette.length) actualTableSize *= 2;

    // Exact log2 of actualTableSize (it's constructed as a power of two
    // above, so no float log2/rounding concerns).
    var gctBits = 1;
    while ((1 << gctBits) < actualTableSize) gctBits++;

    // GIF89a's "LZW Minimum Code Size" byte has a documented floor of 2,
    // even for a 2-color (1-bit) image - a spec quirk, not a bug.
    var minCodeSize = Math.max(2, gctBits);
    var sizeField = gctBits - 1; // Logical Screen Descriptor's GCT-size field: table has 2^(sizeField+1) entries

    var out = [];

    // --- Header ---
    pushAscii(out, 'GIF89a');

    // --- Logical Screen Descriptor ---
    pushU16LE(out, width);
    pushU16LE(out, height);
    // bit7 Global Color Table Flag=1, bits6-4 Color Resolution (informational
    // only; conventionally mirrors the GCT size), bit3 Sort Flag=0,
    // bits2-0 Size of Global Color Table.
    out.push(0x80 | (sizeField << 4) | sizeField);
    out.push(0x00); // Background Color Index
    out.push(0x00); // Pixel Aspect Ratio (0 = unspecified/square)

    // --- Global Color Table --- (padded with black past the real palette)
    for (var c = 0; c < actualTableSize; c++) {
      if (c < palette.length) {
        out.push(palette[c][0], palette[c][1], palette[c][2]);
      } else {
        out.push(0, 0, 0);
      }
    }

    // --- Image Descriptor ---
    out.push(0x2C); // Image Separator
    pushU16LE(out, 0); // Left
    pushU16LE(out, 0); // Top
    pushU16LE(out, width);
    pushU16LE(out, height);
    out.push(0x00); // no local color table, not interlaced, no sort

    // --- Image Data ---
    out.push(minCodeSize);
    var lzwBytes = lzwEncode(indices, minCodeSize);
    var blocks = packSubBlocks(lzwBytes);
    for (var k = 0; k < blocks.length; k++) out.push(blocks[k]);

    // --- Trailer ---
    out.push(0x3B);

    return new Uint8Array(out);
  }

  // =========================================================================
  // Public API
  // =========================================================================

  // encode(imageData) -> Uint8Array of a complete GIF89a file.
  // imageData: { width, height, data: Uint8ClampedArray of RGBA bytes }
  // (i.e. anything shaped like a browser ImageData - a real ImageData works
  // directly, and so does a plain object literal for headless/test use).
  function encode(imageData) {
    var width = imageData.width, height = imageData.height;

    var hist = buildHistogram(imageData);
    var pixelKeys = hist.pixelKeys;
    var histogram = hist.histogram;

    var palette, colorIndexMap;
    if (histogram.size <= 256) {
      // Exact path: every distinct post-threshold color gets its own
      // palette slot, so this is lossless (aside from the documented alpha
      // threshold itself) - the common case for this editor's mostly
      // black/white/anti-aliased label graphics.
      palette = [];
      colorIndexMap = new Map();
      histogram.forEach(function (count, key) {
        colorIndexMap.set(key, palette.length);
        palette.push([(key >> 16) & 0xFF, (key >> 8) & 0xFF, key & 0xFF]);
      });
    } else {
      palette = medianCutQuantize(histogram, 256);
      colorIndexMap = buildNearestColorMap(histogram, palette);
    }

    var n = width * height;
    var indices = new Uint8Array(n);
    for (var i = 0; i < n; i++) {
      indices[i] = colorIndexMap.get(pixelKeys[i]);
    }

    return assembleGif(width, height, palette, indices);
  }

  global.GifWriter = {
    encode: encode
  };
  if (typeof module === 'object' && module && module.exports) module.exports = global.GifWriter;
})(typeof globalThis !== 'undefined' ? globalThis : this);
