/*
 * csv-parser.js -- from-scratch CSV parser (RFC 4180-ish) for the mail-merge
 * "load data" step: turns arbitrary real-world CSV text (Excel/LibreOffice/
 * spreadsheet exports) into an array of plain row objects keyed by header
 * name, ready for "$COLUMNNAME$" placeholder substitution elsewhere in the
 * app. No external libraries, no Node built-ins -- this is a plain <script>
 * file, everything is attached to `window.CSVParser`.
 *
 * Handles the real-world messiness that a naive `line.split(',')` gets wrong:
 *  - German-locale Excel exports are semicolon-delimited (comma is the
 *    decimal separator there), so the delimiter is auto-detected from the
 *    header line rather than assumed to be a comma -- see detectDelimiter().
 *  - Quoted fields (RFC 4180) may contain the delimiter itself, doubled `""`
 *    escaped quotes, and literal embedded newlines (both bare \n and \r\n).
 *  - Ragged rows (too few or too many fields vs. the header count) are
 *    tolerated rather than rejected, since real spreadsheet exports
 *    frequently have them (trailing empty columns trimmed, stray extra
 *    commas, etc).
 */
(function (global) {
  'use strict';

  // Strips a leading UTF-8 BOM (present when Excel saves "CSV UTF-8" on
  // legacy systems) so it doesn't end up glued onto the first header name.
  function stripBom(text) {
    if (text.charCodeAt(0) === 0xFEFF) return text.slice(1);
    return text;
  }

  // Scans a sample of CSV text and picks the delimiter for its header line
  // by counting unquoted comma, semicolon and tab occurrences up to the first (unquoted)
  // line break. Tabs win only with a strict majority; otherwise semicolon
  // wins over comma when more frequent, with comma as fallback. Counting happens
  // outside quoted fields so a quoted header like "Last, First" doesn't
  // skew the vote toward comma.
  //
  // This exists as its own exported function (not inlined into parse())
  // because German-locale Excel/LibreOffice exports are semicolon-delimited
  // by default -- comma is the decimal separator there -- so callers that
  // only have a text sample (e.g. a file-picker preview) can reuse the same
  // detection logic before committing to a full parse.
  function detectDelimiter(sampleText) {
    var text = stripBom(String(sampleText == null ? '' : sampleText));
    text = text.slice(findFirstContentIndex(text));
    var directive = separatorDirective(text);
    if (directive) return directive[1];
    var commaCount = 0;
    var semicolonCount = 0;
    var tabCount = 0;
    var inQuotes = false;

    for (var i = 0; i < text.length; i++) {
      var ch = text[i];

      if (inQuotes) {
        if (ch === '"') {
          if (text[i + 1] === '"') {
            i++; // escaped "" -- still inside the quoted field
          } else {
            inQuotes = false;
          }
        }
        continue;
      }

      if (ch === '"') {
        inQuotes = true;
      } else if (ch === '\n' || ch === '\r') {
        break; // end of the header line
      } else if (ch === ',') {
        commaCount++;
      } else if (ch === ';') {
        semicolonCount++;
      } else if (ch === '\t') {
        tabCount++;
      }
    }

    if (tabCount > commaCount && tabCount > semicolonCount) return '\t';
    return semicolonCount > commaCount ? ';' : ',';
  }

  // Excel's optional first-line separator hint is not a header record.
  function separatorDirective(text) {
    return /^sep=([^"\r\n])(?:\r\n|\n|\r|$)/i.exec(text);
  }

  // Finds the character index of the first non-blank line in `text`, so
  // leading blank lines (a stray empty first line some exporters produce)
  // don't get mistaken for the header. A "blank" line here means empty or
  // whitespace-only raw text -- safe to detect with a plain line scan
  // because a genuinely blank line cannot contain an embedded quoted
  // newline (there's nothing in it to quote).
  function findFirstContentIndex(text) {
    var i = 0;
    var len = text.length;
    while (i < len) {
      var lineStart = i;
      while (i < len && text[i] !== '\n' && text[i] !== '\r') i++;
      if (text.slice(lineStart, i).trim() !== '') return lineStart;
      if (text[i] === '\r' && text[i + 1] === '\n') {
        i += 2;
      } else if (i < len) {
        i += 1;
      }
    }
    return len; // every line was blank
  }

  // Character-by-character state machine (outside-field / in-quoted-field,
  // with the delimiter/newline handling folded into "outside-field") that
  // splits `text` into records (array of field-arrays). Regex-splitting on
  // the delimiter would break as soon as a quoted field contains that same
  // delimiter or an embedded newline, which real exports do routinely.
  function tokenizeRecords(text, delimiter) {
    var records = [];
    var row = [];
    var field = '';
    var inQuotes = false;
    var i = 0;
    var len = text.length;

    while (i < len) {
      var ch = text[i];

      if (inQuotes) {
        if (ch === '"') {
          if (text[i + 1] === '"') {
            field += '"'; // escaped literal quote
            i += 2;
          } else {
            inQuotes = false; // closing quote
            i++;
          }
        } else {
          field += ch; // anything, including a literal delimiter or newline
          i++;
        }
        continue;
      }

      if (ch === '"') {
        inQuotes = true;
        i++;
      } else if (ch === delimiter) {
        row.push(field);
        field = '';
        i++;
      } else if (ch === '\r') {
        row.push(field);
        field = '';
        records.push(row);
        row = [];
        // Swallow a following \n so \r\n counts as one line break, but a
        // lone trailing \r right before EOF also ends its line correctly.
        i += (text[i + 1] === '\n') ? 2 : 1;
      } else if (ch === '\n') {
        row.push(field);
        field = '';
        records.push(row);
        row = [];
        i++;
      } else {
        field += ch;
        i++;
      }
    }

    if (inQuotes) throw new Error('CSVParser.parse: unterminated quoted field in record ' + (records.length + 1));

    // No trailing newline is required on the last line -- flush whatever
    // was accumulated, but only if there is anything to flush (avoids a
    // phantom empty record when `text` ended exactly on a line break).
    if (field !== '' || row.length > 0 || (len > 0 && text[len - 1] !== '\n' && text[len - 1] !== '\r')) {
      row.push(field);
      records.push(row);
    }

    return records;
  }

  // A record counts as a "blank line" (skippable) when every field in it is
  // empty -- covers both a genuinely empty line and a line containing only
  // delimiter characters with no field content (e.g. ";" or ",,,"). Real
  // spreadsheet exports often leave stray blank lines like this, and
  // emitting them as rows-of-empty-strings would just be noise for callers.
  function isBlankRecord(fields) {
    for (var i = 0; i < fields.length; i++) {
      if (fields[i] !== '') return false;
    }
    return true;
  }

  // Parses full CSV `text` into { delimiter, headers, rows }.
  // options.delimiter forces a single-character delimiter instead of
  // auto-detecting one from the header line.
  function parse(text, options) {
    options = options || {};
    var raw = stripBom(String(text == null ? '' : text));

    if (raw.trim() === '') {
      throw new Error('CSVParser.parse: input is empty');
    }

    // Skip any leading blank lines so they can't be mistaken for the header
    // (also keeps delimiter auto-detection from looking at an empty line).
    var contentText = raw.slice(findFirstContentIndex(raw));

    var directive = separatorDirective(contentText);
    if (directive) {
      contentText = contentText.slice(directive[0].length);
      contentText = contentText.slice(findFirstContentIndex(contentText));
    }
    if (!contentText.trim()) throw new Error('CSVParser.parse: input is empty');
    var delimiter = options.delimiter !== undefined ? options.delimiter :
      (directive ? directive[1] : detectDelimiter(contentText));
    if (typeof delimiter !== 'string' || delimiter.length !== 1 || /["\r\n]/.test(delimiter)) {
      throw new Error('CSVParser.parse: invalid delimiter');
    }

    var records = tokenizeRecords(contentText, delimiter);
    // records[0] is guaranteed to exist: contentText starts at the first
    // line with real (non-whitespace) content, so it always tokenizes to
    // at least one record.
    var headerFields = records[0].map(function (h) { return h.trim(); });

    var seenHeaders = Object.create(null);
    headerFields.forEach(function (header, index) {
      if (!header) throw new Error('CSVParser.parse: empty header in column ' + (index + 1));
      if (seenHeaders[header]) throw new Error('CSVParser.parse: duplicate header: ' + header);
      seenHeaders[header] = true;
    });

    var rows = [];
    for (var r = 1; r < records.length; r++) {
      var fields = records[r];
      if (isBlankRecord(fields)) continue; // stray blank line, mid-file or trailing

      var obj = {};
      for (var c = 0; c < headerFields.length; c++) {
        // Fewer fields than headers -> missing trailing values default to
        // ''. Extra fields beyond the header count are silently dropped
        // (ragged real-world exports shouldn't blow up the whole import).
        // Keep even names such as __proto__ as ordinary, own data columns.
        Object.defineProperty(obj, headerFields[c], {
          value: c < fields.length ? fields[c] : '',
          enumerable: true, writable: true, configurable: true
        });
      }
      rows.push(obj);
    }

    return { delimiter: delimiter, headers: headerFields, rows: rows };
  }

  global.CSVParser = {
    parse: parse,
    detectDelimiter: detectDelimiter
  };

})(typeof globalThis !== 'undefined' ? globalThis : this);
