/* ZPL label editor — pdf-writer: minimal from-scratch PDF generator for
   full-bleed JPEG or lossless 1-bit monochrome pages. No build step, no npm.

   The trick that makes a hand-rolled PDF writer tractable without writing a
   compressor or an image re-encoder: PDF's /Filter /DCTDecode literally
   means "this stream's bytes ARE a JPEG file's own compressed data". JPEG
   pages are therefore embedded byte-for-byte; 1-bit pages are likewise raw
   packed DeviceGray streams and need no filter at all. The module reduces to
   (1) reading width/height/component-count out of a JPEG's own SOF marker
   when applicable and (2) emitting plain PDF object/xref syntax with correct
   byte offsets.

   Depends on nothing. Attaches global PdfWriter. */
(function (global) {
  'use strict';

  // ---------------------------------------------------------------------
  // parseJpegHeader: walk JPEG marker segments until the frame header
  // (SOFn) is found. We never touch entropy-coded scan data - decoding
  // pixels is exactly what embedding via DCTDecode lets us skip.
  // ---------------------------------------------------------------------
  function parseJpegHeader(jpegBytes) {
    if (jpegBytes.length < 4 || jpegBytes[0] !== 0xFF || jpegBytes[1] !== 0xD8) {
      throw new Error('PdfWriter: not a JPEG (missing SOI marker 0xFFD8)');
    }

    var offset = 2;
    while (offset + 1 < jpegBytes.length) {
      if (jpegBytes[offset] !== 0xFF) { offset++; continue; } // resync on stray byte

      var marker = jpegBytes[offset + 1];

      // 0xFF00/0xFFFF are stuffing/fill bytes, not markers - re-scan from
      // the next byte instead of misreading a "length" that isn't one.
      if (marker === 0xFF) { offset++; continue; }

      // Standalone markers carry no length field: SOI, EOI, RSTn, TEM.
      if (marker === 0xD8 || marker === 0xD9 || marker === 0x01 ||
          (marker >= 0xD0 && marker <= 0xD7)) {
        offset += 2;
        continue;
      }

      if (offset + 3 >= jpegBytes.length) break;
      var segmentLen = (jpegBytes[offset + 2] << 8) | jpegBytes[offset + 3];

      // SOFn (0xC0-0xCF) marks "start of frame" and carries width/height -
      // except 0xC4 (DHT), 0xC8 (JPG, reserved), 0xCC (DAC), which share the
      // numeric range but aren't frame headers. This covers baseline (C0)
      // and progressive (C2), the two variants browsers actually emit, plus
      // the rarer arithmetic/lossless SOF variants for free.
      if (marker >= 0xC0 && marker <= 0xCF && marker !== 0xC4 && marker !== 0xC8 && marker !== 0xCC) {
        var p = offset + 4;
        if (p + 5 >= jpegBytes.length) break;
        var height = (jpegBytes[p + 1] << 8) | jpegBytes[p + 2];
        var width = (jpegBytes[p + 3] << 8) | jpegBytes[p + 4];
        var numComponents = jpegBytes[p + 5];
        return { width: width, height: height, numComponents: numComponents };
      }

      if (marker === 0xDA) break; // SOS: compressed scan data starts, no SOF seen before it

      offset += 2 + segmentLen;
    }

    throw new Error('PdfWriter: no SOF0/SOF2 marker found (unsupported or corrupt JPEG)');
  }

  function jpegDimensions(jpegBytes) {
    var header = parseJpegHeader(jpegBytes);
    return { width: header.width, height: header.height };
  }

  // ---------------------------------------------------------------------
  // PDF has no exponential-notation number syntax, and integers-as-floats
  // read poorly - toFixed(4) gives sub-point precision without float noise,
  // then trailing zeros (and a now-bare trailing '.') are trimmed.
  // ---------------------------------------------------------------------
  function formatNum(n) {
    if (typeof n !== 'number' || !isFinite(n)) {
      throw new Error('PdfWriter: expected a finite number, got ' + n);
    }
    var s = n.toFixed(4);
    if (s.indexOf('.') !== -1) {
      s = s.replace(/0+$/, '').replace(/\.$/, '');
    }
    return s === '' || s === '-' ? '0' : s;
  }

  function padOffset10(n) {
    var s = String(n);
    while (s.length < 10) s = '0' + s;
    return s;
  }

  // ---------------------------------------------------------------------
  // Byte builder: accumulates chunks and tracks the running byte offset,
  // so each object's "N 0 obj" start position can be recorded for the
  // xref table as it's written, rather than serializing the whole file
  // twice or patching offsets back in afterwards.
  // ---------------------------------------------------------------------
  function createBuilder() {
    var chunks = [];
    var length = 0;

    function pushBytes(bytes) {
      chunks.push(bytes);
      length += bytes.length;
    }
    // Every string this module emits is plain PDF structural syntax
    // (ASCII-only by construction), so a charCodeAt loop is both correct
    // and avoids pulling in TextEncoder for latin1-range text.
    function pushStr(str) {
      var bytes = new Uint8Array(str.length);
      for (var i = 0; i < str.length; i++) bytes[i] = str.charCodeAt(i) & 0xFF;
      pushBytes(bytes);
    }

    return {
      offset: function () { return length; },
      pushStr: pushStr,
      pushBytes: pushBytes,
      toUint8Array: function () {
        var out = new Uint8Array(length);
        var pos = 0;
        for (var i = 0; i < chunks.length; i++) {
          out.set(chunks[i], pos);
          pos += chunks[i].length;
        }
        return out;
      }
    };
  }

  // Escapes a JS string into a PDF literal string's byte content: WinAnsi
  // (code page 1252-compatible) single-byte encoding, which is numerically
  // identical to Unicode/Latin-1 for the whole German alphabet including
  // umlauts and ß (all sit in U+00C0-U+00FF, mapped 1:1 by WinAnsiEncoding) -
  // so a plain charCodeAt() is correct for exactly the text this editor's
  // labels actually contain. Anything outside single-byte range (emoji, CJK,
  // ...) has no representation in a non-embedded Standard-14 font anyway;
  // '?' is an honest fallback rather than silently corrupting the byte stream.
  function encodeWinAnsiBytes(text) {
    var bytes = new Uint8Array(text.length);
    for (var i = 0; i < text.length; i++) {
      var code = text.charCodeAt(i);
      bytes[i] = code <= 0xFF ? code : 0x3F; // '?'
    }
    return bytes;
  }
  // Escapes the PDF literal-string metacharacters ( ) \ and control
  // characters that would otherwise break out of the "(...)" string syntax
  // or confuse a naive line-based PDF parser.
  function escapePdfString(bytes) {
    var out = [];
    for (var i = 0; i < bytes.length; i++) {
      var c = bytes[i];
      if (c === 0x28 || c === 0x29 || c === 0x5C) out.push(0x5C, c); // ( ) \
      else if (c === 0x0A) out.push(0x5C, 0x6E); // \n
      else if (c === 0x0D) out.push(0x5C, 0x72); // \r
      else out.push(c);
    }
    return new Uint8Array(out);
  }

  // Appends an invisible, selectable text layer to an image page. Keeping
  // this in one helper ensures JPEG and monochrome exports expose identical
  // search/copy behavior.
  function appendInvisibleText(contentStream, runs) {
    for (var r = 0; r < runs.length; r++) {
      var run = runs[r];
      var tm = run.tm || [1, 0, 0, 1, 0, 0];
      var fontKey = run.font === 'Courier' ? '/FC' : '/FH';
      var fontSize = run.fontSize > 0 ? run.fontSize : 12;
      var escaped = escapePdfString(encodeWinAnsiBytes(run.text || ''));
      var literal = '';
      for (var ci = 0; ci < escaped.length; ci++) literal += String.fromCharCode(escaped[ci]);
      contentStream += '\nBT 3 Tr ' + fontKey + ' ' + formatNum(fontSize) + ' Tf ' +
        formatNum(tm[0]) + ' ' + formatNum(tm[1]) + ' ' + formatNum(tm[2]) + ' ' + formatNum(tm[3]) + ' ' +
        formatNum(tm[4]) + ' ' + formatNum(tm[5]) + ' Tm (' + literal + ') Tj ET';
    }
    return contentStream;
  }

  // ---------------------------------------------------------------------
  // fromJpegPages: one full-bleed JPEG per page, plus an optional invisible
  // text layer (see each page's `textRuns`) for search/select/copy without
  // changing how the page looks - the same technique OCR'd scanned-document
  // PDFs use. Object numbering is fixed and simple: 1 = Catalog, 2 = Pages,
  // 3/4 = the two Standard-14 fonts used for text runs (Helvetica/Courier -
  // no embedding needed, every PDF viewer already has them), then 3 objects
  // per page (Page, its content stream, its image XObject) - so object
  // numbers never need a lookup table, just arithmetic on the page index.
  //
  // page.textRuns (optional): [{ text, tm: [a,b,c,d,e,f], fontSize, font }]
  //   tm: the PDF text matrix - rotation/skew (a,b,c,d) plus translation
  //       (e,f) in page-point space. Callers with rotated text (this
  //       editor's ^A orientation N/R/I/B) fold the rotation directly into
  //       this matrix; unrotated text just uses [1,0,0,1,x,y].
  //   fontSize: in points. font: 'Helvetica' (default) or 'Courier'.
  // ---------------------------------------------------------------------
  function fromJpegPages(pages) {
    if (!Array.isArray(pages) || pages.length === 0) {
      throw new Error('PdfWriter.fromJpegPages: pages must be a non-empty array');
    }

    var n = pages.length;
    var catalogNum = 1;
    var pagesNum = 2;
    var helveticaNum = 3;
    var courierNum = 4;
    function pageNum(i) { return 5 + i * 3; }
    function contentNum(i) { return 6 + i * 3; }
    function imageNum(i) { return 7 + i * 3; }

    var b = createBuilder();
    var objectOffsets = []; // 1-based: objectOffsets[num] = byte offset of "num 0 obj"

    function beginObject(num) {
      objectOffsets[num] = b.offset();
      b.pushStr(num + ' 0 obj\n');
    }
    function endObject() {
      b.pushStr('endobj\n');
    }

    b.pushStr('%PDF-1.4\n');
    // Conventional binary-marker comment (a byte >= 0x80 on the second
    // header line) so naive line-based tools/transfers treat the file as
    // binary rather than text - harmless either way since every offset
    // used below comes from objectOffsets, not from counting lines.
    b.pushBytes(new Uint8Array([0x25, 0xE2, 0xE3, 0xCF, 0xD3, 0x0A]));

    beginObject(catalogNum);
    b.pushStr('<< /Type /Catalog /Pages ' + pagesNum + ' 0 R >>\n');
    endObject();

    beginObject(pagesNum);
    var kids = [];
    for (var i = 0; i < n; i++) kids.push(pageNum(i) + ' 0 R');
    b.pushStr('<< /Type /Pages /Kids [' + kids.join(' ') + '] /Count ' + n + ' >>\n');
    endObject();

    // Standard-14 fonts: no font file to embed, every PDF viewer already has
    // these - WinAnsiEncoding covers the German text (umlauts, ß) this
    // editor's labels actually contain (see encodeWinAnsiBytes above).
    beginObject(helveticaNum);
    b.pushStr('<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica /Encoding /WinAnsiEncoding >>\n');
    endObject();
    beginObject(courierNum);
    b.pushStr('<< /Type /Font /Subtype /Type1 /BaseFont /Courier /Encoding /WinAnsiEncoding >>\n');
    endObject();

    // A page with no text runs at all skips the /Font resource entirely -
    // referencing an unused resource is harmless, but there's no reason to.
    var anyTextRuns = pages.some(function (p) { return p.textRuns && p.textRuns.length; });

    for (i = 0; i < n; i++) {
      var page = pages[i];
      if (!page || !page.jpegBytes) {
        throw new Error('PdfWriter.fromJpegPages: page ' + i + ' is missing jpegBytes');
      }
      var widthPt = page.widthPt;
      var heightPt = page.heightPt;
      if (!(widthPt > 0) || !(heightPt > 0)) {
        throw new Error('PdfWriter.fromJpegPages: page ' + i + ' needs positive widthPt/heightPt');
      }

      var header = parseJpegHeader(page.jpegBytes);
      // The JPEG's own component count tells us what DCTDecode will hand
      // back: 1 -> gray, 4 -> CMYK, otherwise (3, the common case) -> RGB.
      var colorSpace = header.numComponents === 1 ? '/DeviceGray'
        : header.numComponents === 4 ? '/DeviceCMYK'
        : '/DeviceRGB';

      // Image XObjects live in unit (0..1) space; scaling by the full page
      // size via the "cm" operator before "/Im0 Do" makes it fill the page.
      var contentStream = 'q ' + formatNum(widthPt) + ' 0 0 ' + formatNum(heightPt) + ' 0 0 cm /Im0 Do Q';

      // Invisible text layer (render mode 3 = neither fill nor stroke, but
      // still selectable/searchable/copyable - the same trick OCR'd scanned
      // PDFs use to make a raster page searchable without altering how it
      // looks). One BT/ET block per run rather than one shared block, since
      // each run has its own rotation/position (Tm) and possibly its own font.
      contentStream = appendInvisibleText(contentStream, page.textRuns || []);

      var fontResources = anyTextRuns ? ' /Font << /FH ' + helveticaNum + ' 0 R /FC ' + courierNum + ' 0 R >>' : '';

      beginObject(pageNum(i));
      b.pushStr(
        '<< /Type /Page /Parent ' + pagesNum + ' 0 R' +
        ' /MediaBox [0 0 ' + formatNum(widthPt) + ' ' + formatNum(heightPt) + ']' +
        ' /Resources << /XObject << /Im0 ' + imageNum(i) + ' 0 R >>' + fontResources + ' >>' +
        ' /Contents ' + contentNum(i) + ' 0 R >>\n'
      );
      endObject();

      beginObject(contentNum(i));
      b.pushStr('<< /Length ' + contentStream.length + ' >>\nstream\n');
      b.pushStr(contentStream);
      b.pushStr('\nendstream\n');
      endObject();

      beginObject(imageNum(i));
      b.pushStr(
        '<< /Type /XObject /Subtype /Image /Width ' + header.width + ' /Height ' + header.height +
        ' /ColorSpace ' + colorSpace + ' /BitsPerComponent 8 /Filter /DCTDecode' +
        ' /Length ' + page.jpegBytes.length + ' >>\nstream\n'
      );
      // The raw JPEG bytes, byte-for-byte, as the DCTDecode-filtered stream
      // data - this is the entire "codec" for images in this module.
      b.pushBytes(page.jpegBytes);
      b.pushStr('\nendstream\n');
      endObject();
    }

    var maxObjNum = imageNum(n - 1);
    var xrefOffset = b.offset();
    b.pushStr('xref\n0 ' + (maxObjNum + 1) + '\n');
    b.pushStr('0000000000 65535 f \n');
    for (var num = 1; num <= maxObjNum; num++) {
      b.pushStr(padOffset10(objectOffsets[num]) + ' 00000 n \n');
    }

    b.pushStr(
      'trailer\n<< /Size ' + (maxObjNum + 1) + ' /Root ' + catalogNum + ' 0 R >>\n' +
      'startxref\n' + xrefOffset + '\n%%EOF\n'
    );

    return b.toUint8Array();
  }

  // ---------------------------------------------------------------------
  // fromMonoPages: lossless, full-bleed, 1-bit DeviceGray pages for thermal
  // labels. `monoBytes` is packed row-major, most-significant bit first,
  // with one bit per pixel. A set bit means black; /Decode [1 0] reverses
  // PDF's native DeviceGray polarity (where a set sample would be white).
  // No image filter is used: the bytes are embedded exactly as supplied.
  // ---------------------------------------------------------------------
  function fromMonoPages(pages) {
    if (!Array.isArray(pages) || pages.length === 0) {
      throw new Error('PdfWriter.fromMonoPages: pages must be a non-empty array');
    }

    var n = pages.length;
    var catalogNum = 1;
    var pagesNum = 2;
    var helveticaNum = 3;
    var courierNum = 4;
    function pageNum(i) { return 5 + i * 3; }
    function contentNum(i) { return 6 + i * 3; }
    function imageNum(i) { return 7 + i * 3; }

    var b = createBuilder();
    var objectOffsets = [];

    function beginObject(num) {
      objectOffsets[num] = b.offset();
      b.pushStr(num + ' 0 obj\n');
    }
    function endObject() {
      b.pushStr('endobj\n');
    }

    b.pushStr('%PDF-1.4\n');
    b.pushBytes(new Uint8Array([0x25, 0xE2, 0xE3, 0xCF, 0xD3, 0x0A]));

    beginObject(catalogNum);
    b.pushStr('<< /Type /Catalog /Pages ' + pagesNum + ' 0 R >>\n');
    endObject();

    beginObject(pagesNum);
    var kids = [];
    for (var i = 0; i < n; i++) kids.push(pageNum(i) + ' 0 R');
    b.pushStr('<< /Type /Pages /Kids [' + kids.join(' ') + '] /Count ' + n + ' >>\n');
    endObject();

    beginObject(helveticaNum);
    b.pushStr('<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica /Encoding /WinAnsiEncoding >>\n');
    endObject();
    beginObject(courierNum);
    b.pushStr('<< /Type /Font /Subtype /Type1 /BaseFont /Courier /Encoding /WinAnsiEncoding >>\n');
    endObject();

    var anyTextRuns = pages.some(function (p) { return p.textRuns && p.textRuns.length; });

    for (i = 0; i < n; i++) {
      var page = pages[i];
      if (!page || !(page.monoBytes instanceof Uint8Array)) {
        throw new Error('PdfWriter.fromMonoPages: page ' + i + ' is missing monoBytes Uint8Array');
      }
      if (typeof page.widthPx !== 'number' || !isFinite(page.widthPx) ||
          page.widthPx <= 0 || Math.floor(page.widthPx) !== page.widthPx ||
          typeof page.heightPx !== 'number' || !isFinite(page.heightPx) ||
          page.heightPx <= 0 || Math.floor(page.heightPx) !== page.heightPx) {
        throw new Error('PdfWriter.fromMonoPages: page ' + i + ' needs positive integer widthPx/heightPx');
      }
      var widthPt = page.widthPt;
      var heightPt = page.heightPt;
      if (!(widthPt > 0) || !(heightPt > 0)) {
        throw new Error('PdfWriter.fromMonoPages: page ' + i + ' needs positive widthPt/heightPt');
      }
      var rowBytes = Math.ceil(page.widthPx / 8);
      var expectedBytes = rowBytes * page.heightPx;
      if (page.monoBytes.length !== expectedBytes) {
        throw new Error('PdfWriter.fromMonoPages: page ' + i + ' monoBytes length must be ' + expectedBytes +
          ' for ' + page.widthPx + 'x' + page.heightPx + ' pixels');
      }

      var contentStream = 'q ' + formatNum(widthPt) + ' 0 0 ' + formatNum(heightPt) + ' 0 0 cm /Im0 Do Q';
      contentStream = appendInvisibleText(contentStream, page.textRuns || []);

      var fontResources = anyTextRuns ? ' /Font << /FH ' + helveticaNum + ' 0 R /FC ' + courierNum + ' 0 R >>' : '';

      beginObject(pageNum(i));
      b.pushStr(
        '<< /Type /Page /Parent ' + pagesNum + ' 0 R' +
        ' /MediaBox [0 0 ' + formatNum(widthPt) + ' ' + formatNum(heightPt) + ']' +
        ' /Resources << /XObject << /Im0 ' + imageNum(i) + ' 0 R >>' + fontResources + ' >>' +
        ' /Contents ' + contentNum(i) + ' 0 R >>\n'
      );
      endObject();

      beginObject(contentNum(i));
      b.pushStr('<< /Length ' + contentStream.length + ' >>\nstream\n');
      b.pushStr(contentStream);
      b.pushStr('\nendstream\n');
      endObject();

      beginObject(imageNum(i));
      b.pushStr(
        '<< /Type /XObject /Subtype /Image /Width ' + page.widthPx + ' /Height ' + page.heightPx +
        ' /ColorSpace /DeviceGray /BitsPerComponent 1 /Decode [1 0]' +
        ' /Length ' + page.monoBytes.length + ' >>\nstream\n'
      );
      b.pushBytes(page.monoBytes);
      b.pushStr('\nendstream\n');
      endObject();
    }

    var maxObjNum = imageNum(n - 1);
    var xrefOffset = b.offset();
    b.pushStr('xref\n0 ' + (maxObjNum + 1) + '\n');
    b.pushStr('0000000000 65535 f \n');
    for (var num = 1; num <= maxObjNum; num++) {
      b.pushStr(padOffset10(objectOffsets[num]) + ' 00000 n \n');
    }

    b.pushStr(
      'trailer\n<< /Size ' + (maxObjNum + 1) + ' /Root ' + catalogNum + ' 0 R >>\n' +
      'startxref\n' + xrefOffset + '\n%%EOF\n'
    );

    return b.toUint8Array();
  }

  global.PdfWriter = {
    fromJpegPages: fromJpegPages,
    fromMonoPages: fromMonoPages,
    jpegDimensions: jpegDimensions
  };
  if (typeof module === 'object' && module && module.exports) module.exports = global.PdfWriter;
})(typeof globalThis !== 'undefined' ? globalThis : this);
