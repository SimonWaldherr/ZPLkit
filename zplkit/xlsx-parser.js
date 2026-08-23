/*
 * xlsx-parser.js
 * Reads .xlsx (OOXML spreadsheet) files for the mail-merge data source: one
 * printed label per row, columns substituted into $PLACEHOLDER$ fields.
 *
 * An .xlsx file is a ZIP archive of XML parts. This file implements, from
 * scratch, in plain browser JS:
 *  - a minimal ZIP central-directory reader (just enough to list/locate
 *    entries and extract their raw bytes) -- see ZIP APPNOTE.TXT 4.3;
 *  - decompression per entry: method 0 (stored) is copied as-is, method 8
 *    (DEFLATE) reuses window.ZPLInflate.rawInflate -- the SAME from-scratch
 *    RFC 1951 decompressor inflate.js already implements for ZPL "^GF"/"~DG"
 *    ":Z64:" graphic fields. ZIP's method 8 is raw DEFLATE with no zlib
 *    wrapper (no 2-byte header, no Adler-32 trailer) -- unlike ":Z64:" data,
 *    which IS zlib-wrapped and goes through zlibInflate instead, so this is
 *    deliberately the "raw" entry point, not the "zlib" one. This file must
 *    load AFTER inflate.js.
 *  - XML parsing via the browser's native DOMParser. Unlike the DEFLATE
 *    case above, there is no reason to hand-write an XML parser: DOMParser
 *    is a standard, already-appropriate-to-rely-on Web API.
 *  - just enough of the OOXML spreadsheet schema (workbook.xml, its .rels,
 *    sharedStrings.xml, worksheets/sheetN.xml) to produce { headers, rows }
 *    per sheet, in the same shape window.CSVParser.parse() produces per
 *    file (minus the CSV-only `delimiter` field), so the rest of the app
 *    can treat a CSV sheet and an XLSX sheet identically once loaded.
 *
 * Attaches window.XLSXParser = { parse }.
 */
(function (global) {
  'use strict';

  // =========================================================================
  // ZIP reading (ZIP APPNOTE.TXT section 4.3) -- just enough to list and
  // extract entries by name. No support for Zip64, multi-disk archives, or
  // encryption -- none of which real .xlsx files (small, single-file, XML
  // + a few media parts) ever need.
  // =========================================================================

  const EOCD_SIGNATURE = 0x06054b50;
  const CENTRAL_DIR_SIGNATURE = 0x02014b50;
  const LOCAL_FILE_SIGNATURE = 0x04034b50;

  // Finds the End Of Central Directory record by scanning backwards from the
  // end of the buffer. It is NOT safe to assume it sits in the last 22
  // bytes: the EOCD record can be preceded by a variable-length (0-65535
  // byte) archive comment, which some zip writers set to a non-empty value
  // (or leave a few bytes of padding), so every position back to that
  // maximum distance has to be checked for the signature.
  function findEndOfCentralDirectory(view) {
    const minPos = Math.max(0, view.byteLength - 22 - 65535);
    for (let pos = view.byteLength - 22; pos >= minPos; pos--) {
      if (view.getUint32(pos, true) === EOCD_SIGNATURE) {
        return pos;
      }
    }
    throw new Error('Not a valid ZIP/XLSX file: End Of Central Directory record not found');
  }

  // Walks the central directory (the authoritative entry list) starting
  // from the EOCD's recorded offset/count, reading one 46-byte-fixed-plus-
  // variable-length record at a time.
  function readCentralDirectory(view, bytes) {
    const eocdPos = findEndOfCentralDirectory(view);
    const entryCount = view.getUint16(eocdPos + 10, true);
    const centralDirOffset = view.getUint32(eocdPos + 16, true);

    const entries = [];
    let pos = centralDirOffset;
    const decoder = new TextDecoder('utf-8');

    for (let i = 0; i < entryCount; i++) {
      if (view.getUint32(pos, true) !== CENTRAL_DIR_SIGNATURE) {
        throw new Error('Corrupt ZIP: expected central directory entry signature at offset ' + pos);
      }
      const compressionMethod = view.getUint16(pos + 10, true);
      const compressedSize = view.getUint32(pos + 20, true);
      const uncompressedSize = view.getUint32(pos + 24, true);
      const nameLen = view.getUint16(pos + 28, true);
      const extraLen = view.getUint16(pos + 30, true);
      const commentLen = view.getUint16(pos + 32, true);
      const localHeaderOffset = view.getUint32(pos + 42, true);
      const name = decoder.decode(bytes.subarray(pos + 46, pos + 46 + nameLen));

      entries.push({
        name: name,
        compressionMethod: compressionMethod,
        compressedSize: compressedSize,
        uncompressedSize: uncompressedSize,
        localHeaderOffset: localHeaderOffset
      });

      // Advance past this record's fixed 46 bytes plus ITS OWN name/extra/
      // comment lengths -- these vary per entry, so the next record's start
      // can only be computed after reading this one, never assumed.
      pos += 46 + nameLen + extraLen + commentLen;
    }

    return entries;
  }

  // Extracts and decompresses one entry's data, given its central-directory
  // record.
  //
  // Deliberately does NOT reuse the central directory's name/extra-field
  // lengths to locate the compressed data -- it re-reads the LOCAL file
  // header's own lengths instead. This is the single most common bug in
  // hand-rolled ZIP readers: many real-world zip writers store a different
  // "extra field" in the local header than in the central directory (for
  // example, an Info-ZIP Unix timestamp extra added only to one copy, or a
  // Zip64 extra present in one but not the other), which shifts where the
  // actual file data begins. Only the local header's own lengths give the
  // true offset.
  function extractEntry(view, bytes, entry) {
    const pos = entry.localHeaderOffset;
    if (view.getUint32(pos, true) !== LOCAL_FILE_SIGNATURE) {
      throw new Error('Corrupt ZIP: expected local file header signature for "' + entry.name + '"');
    }
    const nameLen = view.getUint16(pos + 26, true);
    const extraLen = view.getUint16(pos + 28, true);
    const dataStart = pos + 30 + nameLen + extraLen;
    const compressed = bytes.subarray(dataStart, dataStart + entry.compressedSize);

    if (entry.compressionMethod === 0) {
      return compressed;
    } else if (entry.compressionMethod === 8) {
      return global.ZPLInflate.rawInflate(compressed);
    }
    throw new Error('Unsupported ZIP compression method ' + entry.compressionMethod +
      ' for "' + entry.name + '" (only 0=stored and 8=deflate occur in real .xlsx files)');
  }

  // Builds a small read-only view over the archive: hasEntry()/readText() by
  // zip-internal path (e.g. "xl/workbook.xml"), decoding on demand rather
  // than eagerly inflating every part up front.
  function readZip(arrayBuffer) {
    const bytes = arrayBuffer instanceof Uint8Array ? arrayBuffer : new Uint8Array(arrayBuffer);
    const view = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);
    const entries = readCentralDirectory(view, bytes);

    const byName = {};
    for (let i = 0; i < entries.length; i++) {
      byName[entries[i].name] = entries[i];
    }
    const decoder = new TextDecoder('utf-8');

    return {
      hasEntry: function (name) {
        return Object.prototype.hasOwnProperty.call(byName, name);
      },
      readText: function (name) {
        const entry = byName[name];
        if (!entry) return null;
        return decoder.decode(extractEntry(view, bytes, entry));
      }
    };
  }

  // =========================================================================
  // OOXML spreadsheet parsing.
  // =========================================================================

  function parseXml(xmlText) {
    const doc = new DOMParser().parseFromString(xmlText, 'application/xml');
    // Cross-browser convention: a failed parse produces a document whose
    // tree contains a <parsererror> element instead of throwing. Its tag
    // has no namespace prefix in any browser, so plain getElementsByTagName
    // finds it regardless of which namespace URI that browser puts it in.
    const errorNode = doc.getElementsByTagName('parsererror')[0];
    if (errorNode) {
      throw new Error('Failed to parse XML: ' + errorNode.textContent);
    }
    return doc;
  }

  // xl/workbook.xml: <sheets><sheet name="Sheet1" sheetId="1" r:id="rId1"/>...
  // in display/declared order. "r:id" is a namespaced attribute (prefix "r"
  // bound to the officeDocument relationships namespace) -- getAttribute
  // matches it by its literal qualified name, which is simpler and just as
  // correct here as resolving the namespace URI via getAttributeNS.
  function getWorkbookSheetList(workbookXml) {
    const doc = parseXml(workbookXml);
    const sheetEls = doc.getElementsByTagName('sheet');
    const sheets = [];
    for (let i = 0; i < sheetEls.length; i++) {
      sheets.push({
        name: sheetEls[i].getAttribute('name'),
        rId: sheetEls[i].getAttribute('r:id')
      });
    }
    return sheets;
  }

  // xl/_rels/workbook.xml.rels: <Relationship Id="rId1" Target="worksheets/
  // sheet1.xml" .../> -- maps r:id -> Target so a sheet's declared r:id can
  // be turned into its actual zip path.
  function getRelationshipTargets(relsXml) {
    const doc = parseXml(relsXml);
    const relEls = doc.getElementsByTagName('Relationship');
    const targets = {};
    for (let i = 0; i < relEls.length; i++) {
      targets[relEls[i].getAttribute('Id')] = relEls[i].getAttribute('Target');
    }
    return targets;
  }

  // Relationship Targets for worksheet parts are relative to the folder the
  // .rels file itself describes (i.e. "xl/"), and in practice are always a
  // plain relative path like "worksheets/sheet1.xml". A small number of
  // writers instead emit a package-absolute path starting with "/xl/..." --
  // handle both rather than assuming only one convention.
  function resolveWorksheetPath(target) {
    if (target.charAt(0) === '/') {
      return target.slice(1);
    }
    return 'xl/' + target;
  }

  // Concatenates the text of a shared-string <si> or inline-string <is>
  // element: either a direct <t> child, or one-or-more rich-text <r> run
  // children (each with its own <t>) that must be joined in document order.
  // Run-level formatting (bold, color, font...) is intentionally ignored --
  // only the text matters for placeholder substitution.
  function extractStringItemText(itemEl) {
    const runEls = itemEl.getElementsByTagName('r');
    if (runEls.length > 0) {
      let text = '';
      for (let i = 0; i < runEls.length; i++) {
        const tEls = runEls[i].getElementsByTagName('t');
        if (tEls.length > 0) text += tEls[0].textContent;
      }
      return text;
    }
    const directT = itemEl.getElementsByTagName('t');
    return directT.length > 0 ? directT[0].textContent : '';
  }

  // xl/sharedStrings.xml is OPTIONAL: a workbook containing only numeric
  // cells and/or inline strings (no t="s" cell references at all) can omit
  // this part entirely, so its absence must not be treated as an error.
  function readSharedStrings(zip) {
    if (!zip.hasEntry('xl/sharedStrings.xml')) return [];
    const doc = parseXml(zip.readText('xl/sharedStrings.xml'));
    const siEls = doc.getElementsByTagName('si');
    const strings = [];
    for (let i = 0; i < siEls.length; i++) {
      strings.push(extractStringItemText(siEls[i]));
    }
    return strings;
  }

  // Converts a spreadsheet column-letter prefix ("A", "Z", "AA", "BA", ...)
  // to a zero-based index. This is NOT plain base-26 arithmetic: the
  // alphabet used has no digit for zero (a lone "A" already means position
  // 1, not 0), so a straight base-26 expansion would make "A" and "AA"
  // collide. The correct rule accumulates value = value*26 + digit using
  // digit = 1..26 for 'A'..'Z', then subtracts 1 once at the end to make the
  // whole thing zero-based.
  function columnLettersToIndex(letters) {
    let value = 0;
    for (let i = 0; i < letters.length; i++) {
      value = value * 26 + (letters.charCodeAt(i) - 64); // 'A' -> 1 .. 'Z' -> 26
    }
    return value - 1;
  }

  // Inverse of columnLettersToIndex, used only to synthesize a header name
  // (e.g. "Spalte_D") for a column the header row left blank.
  function indexToColumnLetters(index) {
    let letters = '';
    let n = index + 1;
    while (n > 0) {
      const rem = (n - 1) % 26;
      letters = String.fromCharCode(65 + rem) + letters;
      n = Math.floor((n - 1) / 26);
    }
    return letters;
  }

  function cellRefColumnLetters(cellRef) {
    const match = /^([A-Za-z]+)/.exec(cellRef || '');
    return match ? match[1].toUpperCase() : '';
  }

  // Resolves one <c> cell element to its string value, per its `t` (type)
  // attribute:
  //  - t="s": <v> holds an INDEX into the shared-strings table, resolved
  //    here.
  //  - t="str" (formula result string), t="n" (number), t="b" (boolean, "1"
  //    or "0"), or no `t` at all (the default -- plain number): all of
  //    these just pass their <v> text through completely unchanged. Numbers
  //    are deliberately NOT reformatted or locale-converted, and booleans
  //    are deliberately NOT mapped to any localized word -- the destination
  //    is $PLACEHOLDER$ text substitution, not spreadsheet math or display.
  //  - t="inlineStr": the text lives directly in an <is> child of <c>
  //    instead of a shared-strings-indexed <v>; reuses the same run-
  //    concatenation logic as shared strings.
  //  - no <v> and no <is>: an empty cell -> ''.
  function cellValue(cellEl, sharedStrings) {
    const type = cellEl.getAttribute('t');

    if (type === 'inlineStr') {
      const isEls = cellEl.getElementsByTagName('is');
      return isEls.length > 0 ? extractStringItemText(isEls[0]) : '';
    }

    const vEls = cellEl.getElementsByTagName('v');
    if (vEls.length === 0) return '';
    const raw = vEls[0].textContent;

    if (type === 's') {
      const idx = parseInt(raw, 10);
      return sharedStrings[idx] !== undefined ? sharedStrings[idx] : '';
    }
    return raw;
  }

  // Parses one <row>'s <c> children into { cells, maxIndex }, where `cells`
  // is a sparse columnIndex -> string map (spreadsheets routinely skip
  // empty cells rather than emitting them with an empty <v>).
  function parseRowCells(rowEl, sharedStrings) {
    const cellEls = rowEl.getElementsByTagName('c');
    const cells = {};
    let maxIndex = -1;
    for (let i = 0; i < cellEls.length; i++) {
      const cellEl = cellEls[i];
      const colLetters = cellRefColumnLetters(cellEl.getAttribute('r'));
      // Real writers always emit the `r` attribute; falling back to the
      // cell's position among this row's own <c> children only guards
      // against a hand-edited/minimal file that omits it.
      const colIndex = colLetters ? columnLettersToIndex(colLetters) : i;
      cells[colIndex] = cellValue(cellEl, sharedStrings);
      if (colIndex > maxIndex) maxIndex = colIndex;
    }
    return { cells: cells, maxIndex: maxIndex };
  }

  function isBlankParsedRow(parsedRow) {
    if (parsedRow.maxIndex === -1) return true;
    for (const key in parsedRow.cells) {
      if (parsedRow.cells[key] !== '') return false;
    }
    return true;
  }

  // Parses one worksheet part (xl/worksheets/sheetN.xml) into { headers,
  // rows }, matching window.CSVParser's per-sheet shape.
  function parseWorksheet(sheetXml, sharedStrings) {
    const doc = parseXml(sheetXml);
    const rowEls = doc.getElementsByTagName('row');
    if (rowEls.length === 0) {
      return { headers: [], rows: [] };
    }

    // The FIRST <row> in document order is the header row, regardless of
    // its own `r` attribute -- spreadsheets are not required to start data
    // at row 1, and this mirrors "first row = header" the same way the CSV
    // parser treats its first line.
    const headerParsed = parseRowCells(rowEls[0], sharedStrings);

    let dataParsed = [];
    for (let r = 1; r < rowEls.length; r++) {
      dataParsed.push(parseRowCells(rowEls[r], sharedStrings));
    }

    // Skip fully-blank trailing rows (no <c> children, or all cells empty),
    // mirroring the CSV parser's behavior of not emitting a phantom
    // trailing empty row -- some writers pad <sheetData> with a few empty
    // <row> elements past the last row that actually has data.
    let lastNonBlank = dataParsed.length - 1;
    while (lastNonBlank >= 0 && isBlankParsedRow(dataParsed[lastNonBlank])) {
      lastNonBlank--;
    }
    dataParsed = dataParsed.slice(0, lastNonBlank + 1);

    // The header row does not necessarily reach as far right as every data
    // row does (a column can be entirely blank in the header but still hold
    // data below it) -- the true column count is whichever of the header or
    // any data row reaches furthest.
    let overallMax = headerParsed.maxIndex;
    for (let d = 0; d < dataParsed.length; d++) {
      if (dataParsed[d].maxIndex > overallMax) overallMax = dataParsed[d].maxIndex;
    }

    const headerNames = [];
    for (let c = 0; c <= overallMax; c++) {
      const name = headerParsed.cells[c];
      // A column the header row left blank or omitted must not silently
      // drop the data rows hold for it -- synthesize a name instead.
      headerNames[c] = (name !== undefined && name !== '') ? name : ('Spalte_' + indexToColumnLetters(c));
    }

    const rows = [];
    for (let d = 0; d < dataParsed.length; d++) {
      const parsedRow = dataParsed[d];
      const rowObj = {};
      for (let c = 0; c <= overallMax; c++) {
        rowObj[headerNames[c]] = parsedRow.cells[c] !== undefined ? parsedRow.cells[c] : '';
      }
      rows.push(rowObj);
    }

    return { headers: headerNames, rows: rows };
  }

  // =========================================================================
  // Public API.
  // =========================================================================

  // Parses an .xlsx file (as an ArrayBuffer, e.g. from
  // input.files[0].arrayBuffer() or a FileReader) into every sheet declared
  // by the workbook:
  //   { sheetNames: string[], sheets: { [name]: { headers, rows } } }
  function parse(arrayBuffer) {
    const zip = readZip(arrayBuffer);

    if (!zip.hasEntry('xl/workbook.xml')) {
      throw new Error('Not a valid XLSX file: missing xl/workbook.xml');
    }
    if (!zip.hasEntry('xl/_rels/workbook.xml.rels')) {
      throw new Error('Not a valid XLSX file: missing xl/_rels/workbook.xml.rels');
    }

    const sheetList = getWorkbookSheetList(zip.readText('xl/workbook.xml'));
    const relTargets = getRelationshipTargets(zip.readText('xl/_rels/workbook.xml.rels'));
    const sharedStrings = readSharedStrings(zip);

    const sheetNames = [];
    const sheets = {};

    for (let i = 0; i < sheetList.length; i++) {
      const sheetInfo = sheetList[i];
      const target = relTargets[sheetInfo.rId];
      if (!target) {
        throw new Error('Missing relationship target for sheet "' + sheetInfo.name + '" (r:id=' + sheetInfo.rId + ')');
      }
      const sheetPath = resolveWorksheetPath(target);
      if (!zip.hasEntry(sheetPath)) {
        throw new Error('Worksheet part not found in workbook: ' + sheetPath + ' (sheet "' + sheetInfo.name + '")');
      }

      sheets[sheetInfo.name] = parseWorksheet(zip.readText(sheetPath), sharedStrings);
      sheetNames.push(sheetInfo.name);
    }

    return { sheetNames: sheetNames, sheets: sheets };
  }

  global.XLSXParser = {
    parse: parse
  };

})(typeof globalThis !== 'undefined' ? globalThis : this);
