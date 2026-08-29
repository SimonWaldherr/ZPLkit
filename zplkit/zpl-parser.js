/* ZPL label editor — parser: raw ZPL text -> label model (see zpl-model.js).
   Design goal: never lose data. Anything we don't structurally understand is kept
   verbatim in `rawTail` (or as the opaque `preamble` blob) and re-emitted by the
   generator, so round-tripping an imported label that uses an exotic command is
   still safe even though that command isn't visually editable. */
(function (global) {
  'use strict';

  const M = global.ZPLModel;

  // A ^XA..^XZ frame is printer/driver configuration (not a real label) if it
  // contains none of the visual-element commands and does contain a
  // recognizable driver/config command signature. Some print stations emit
  // TWO such frames back to back - a "~TA/~JSN/^JMA"-style preamble, then a
  // second small reconfiguration frame (^RS/^RR/^SZ/^JZY/^PMN etc, seen on 19
  // real files) - before the actual label content starts.
  function hasVisualCommands(block) {
    return /\^(FO|FT|BC|B2|B3|BE|BU|B0|BD|GB|GF|GC|GD|GE|XG)\b/.test(block);
  }
  function looksLikeDriverConfig(block) {
    return !hasVisualCommands(block) && /~(TA|JSN)|\^(JMA|JZY|RS|RR|SZ|PMN)\b/.test(block);
  }

  function splitPreambleAndBody(text) {
    let cursor = 0;
    let preambleEnd = -1; // how much of `text` has been swallowed as opaque preamble so far
    for (;;) {
      const xa = text.indexOf('^XA', cursor);
      if (xa === -1) break;
      const xz = text.indexOf('^XZ', xa + 3);
      const blockEnd = xz === -1 ? text.length : xz + 3;
      if (!looksLikeDriverConfig(text.slice(xa, blockEnd))) break;
      preambleEnd = blockEnd;
      if (xz === -1) break; // unterminated frame - nothing sensible follows it
      cursor = blockEnd;
    }
    if (preambleEnd === -1) {
      const firstXA = text.indexOf('^XA');
      return firstXA === -1 ? { preamble: null, body: text } : { preamble: null, body: text.slice(firstXA) };
    }
    // Anything between the last recognized config frame and the next real
    // ^XA (e.g. a ~DG store extractStoredGraphics couldn't decode, so it was
    // left in place) must stay WITH the preamble, not fall into `body` -
    // tokens before body's own ^XA are silently discarded by the main parse
    // loop's `if (!sawFirstXA) continue`, not raw-preserved like elsewhere.
    const nextXA = text.indexOf('^XA', preambleEnd);
    const bodyStart = nextXA === -1 ? preambleEnd : nextXA;
    return { preamble: text.slice(0, bodyStart), body: text.slice(bodyStart) };
  }

  // ~DG (download graphic) can appear anywhere in the file - before the first
  // ^XA, between frames, or inside one - and in the dominant real-world layout
  // (store right after the driver preamble, place via ^XG in the main frame,
  // ^ID-delete in cleanup frames afterward) it lands BETWEEN two ^XA blocks,
  // which the preamble-vs-body split below would otherwise swallow whole into
  // the opaque `preamble` string. Strip every ~DG out of the raw text FIRST
  // (before that split, before tokenizing) into a name->decoded-bitmap
  // registry, so the rest of the pipeline never has to special-case it.
  // KNOWN LIMITATION: this is a flat name -> last-decoded-bitmap map, built
  // in one pass over the whole file before any ^XG placement is resolved. A
  // file that stores, places, deletes, and then RE-stores a different image
  // under the SAME name (e.g. a generic "TEMP.GRF" reused across several
  // concatenated print jobs in one file) would have every placement of that
  // name resolve to whichever ~DG for it decoded LAST, not the one that was
  // actually in effect at each placement's position in the original stream.
  // Not observed in the real label corpus this was built against (checked:
  // no file redefines a stored-graphic name), so left as a documented gap
  // rather than a position-aware redesign with no real case to validate it.
  function extractStoredGraphics(text) {
    const storedGraphics = {};
    const chunks = text.split(/(?=[\^~])/);
    const kept = [];
    for (let i = 0; i < chunks.length; i++) {
      const chunk = chunks[i];
      if (chunk.charAt(0) === '~' && chunk.slice(1, 3).toUpperCase() === 'DG' && global.ZPLGraphic) {
        try {
          const decoded = global.ZPLGraphic.decodeDG(chunk.slice(3));
          storedGraphics[decoded.name] = decoded;
          continue; // excised - the generator re-emits a fresh ~DG for anything still referenced
        } catch (e) {
          kept.push(chunk); // undecodable - keep verbatim so export still round-trips
          continue;
        }
      }
      kept.push(chunk);
    }
    return { storedGraphics: storedGraphics, text: kept.join('') };
  }

  // A ^XA..^XZ frame that only deletes stored graphics (^ID) is the cleanup
  // tail real print jobs append after using a downloaded logo - see
  // generateZPL's own re-emission of exactly that pattern. It carries no
  // label content, so it must not become an (empty) label of its own.
  function looksLikeCleanupFrame(block) {
    // No \b after ^ID: the object name follows the command immediately
    // ("^IDR:LOGO.GRF"), so there is never a word boundary there - the same
    // grammar the ^ID case in the parse loop below matches with
    // /^ID([^,\s]+)/. Requiring one silently turned every cleanup frame into
    // an empty extra label.
    return !hasVisualCommands(block) && /\^ID[^,\s]/.test(block);
  }

  // Cuts a body into its top-level ^XA..^XZ frames. ZPL frames never nest,
  // so a plain forward scan is enough.
  //
  // `between` is whatever sat OUTSIDE a frame (before it, or between it and
  // the previous one). The single-frame parser used to see that text inline
  // and keep it in rawTail; splitting frames would otherwise drop it, so it
  // is handed back for the caller to re-attach rather than silently lost.
  function splitFrames(body) {
    const frames = [];
    let cursor = 0;
    for (;;) {
      const xa = body.indexOf('^XA', cursor);
      if (xa === -1) break;
      const xz = body.indexOf('^XZ', xa + 3);
      const end = xz === -1 ? body.length : xz + 3;
      frames.push({ text: body.slice(xa, end), between: body.slice(cursor, xa) });
      cursor = end;
      if (xz === -1) break; // unterminated final frame - nothing sensible follows
    }
    return { frames: frames, trailing: body.slice(cursor) };
  }

  function tokenize(body) {
    const chunks = body.split(/(?=[\^~])/).filter(function (s) { return s.length > 0; });
    return chunks.map(function (chunk) {
      const prefix = chunk[0];
      const afterPrefix = chunk.slice(1);
      return { prefix: prefix, afterPrefix: afterPrefix, raw: chunk };
    });
  }

  function splitBarcodeParams(str) {
    // `str` is already exactly "h,f,g,e,m" (comma-joined, empty fields allowed,
    // e.g. ",N,N" means h='',f='N',g='N') — the barcode-command regex's own
    // `,?` already consumed the single separator between the orientation
    // character and this list, so no further leading-comma stripping here.
    if (str == null || str === '') return [];
    return str.split(',');
  }

  function toBool(v, def) {
    if (v === undefined || v === '') return def;
    return v === 'Y' || v === 'y';
  }
  function toInt(v, def) {
    if (v === undefined || v === '' || v === null) return def;
    const n = parseInt(v, 10);
    return isNaN(n) ? def : n;
  }
  function toFloat(v, def) {
    if (v === undefined || v === '' || v === null) return def;
    const n = parseFloat(v);
    return isNaN(n) ? def : n;
  }

  // Inverse of zpl-generator.js's escapeFieldData(): that function replaces
  // each '^'/'~'/indicator character with indicatorChar + 2 uppercase hex
  // digits, so a field parsed under an active ^FH must be decoded back to
  // its logical text here - otherwise el.text/el.data ends up holding the
  // still-hex-escaped string, which escapeFieldData then escapes AGAIN on
  // the next generate (double-encoding the indicator character itself and
  // corrupting the printed text). Only used at element-construction time,
  // never for the raw/passthrough preservation paths, which must keep the
  // original on-the-wire bytes untouched.
  function decodeFieldHex(str, indicatorChar) {
    if (!str || str.indexOf(indicatorChar) === -1) return str;
    const isHex = function (c) { return c != null && /[0-9A-Fa-f]/.test(c); };
    let out = '';
    for (let i = 0; i < str.length; i++) {
      const c = str[i];
      if (c === indicatorChar && isHex(str[i + 1]) && isHex(str[i + 2])) {
        out += String.fromCharCode(parseInt(str.substr(i + 1, 2), 16));
        i += 2;
      } else {
        out += c;
      }
    }
    return out;
  }

  // Parses ONE label's worth of body text into `label`. Split out of
  // parseZPL so a file holding several ^XA..^XZ frames can be parsed into
  // several labels without any of this logic being duplicated or diverging.
  // Everything document-level (the ~DG registry, the driver preamble, the
  // "which stored graphic is still referenced" pass) deliberately stays
  // OUTSIDE: those are shared across all frames of a file, and deciding them
  // per frame would give the wrong answer as soon as label 2 places a logo
  // that label 1 does not.
  function parseBodyInto(label, body) {
    const tokens = tokenize(body);

    let pendingOrigin = null;       // { code:'FO'|'FT', x, y, raw }
    let pendingBarcodeDraft = null; // { type, orientation, rawParams } or { unsupported:true, raw }
    let pendingData = null;         // raw ^FD content string
    let pendingFieldBlock = null;   // ^FB descriptor
    let pendingHexEscape = false;
    let pendingHexIndicator = '\\';
    let pendingFieldReverse = false;
    let pendingUnknownRaw = '';     // raw text of any structurally-unrecognized command(s)
                                     // seen between the current ^FO/^FT and its ^FS - see the
                                     // "Anything else at the top level" catch-all below.

    let currentFont = { font: '0', orientation: 'N', height: 30, width: 0 };
    let currentBY = { moduleWidth: 2, ratio: 3.0, height: 60 };
    let currentBYRaw = null; // most recent literal "^BYx,y,z" text - ^BY is sticky like currentBY itself, not per-field
    let currentFW = null; // default orientation from ^FW, applied when a command omits its own

    function resetFieldState() {
      pendingOrigin = null;
      pendingBarcodeDraft = null;
      pendingData = null;
      pendingFieldBlock = null;
      pendingHexEscape = false;
      pendingHexIndicator = '\\';
      pendingFieldReverse = false;
      pendingUnknownRaw = '';
    }

    // `atIndex` records how many elements existed when a raw/passthrough chunk was
    // encountered, so the generator can re-interleave it at the right position
    // instead of dumping every raw chunk as one block before all elements.
    function pushRaw(raw) {
      label.rawTail.push({ raw: raw, atIndex: label.elements.length });
    }

    function commitField() {
      if (pendingBarcodeDraft && pendingBarcodeDraft.unsupported && pendingOrigin) {
        // A barcode symbology this editor doesn't model structurally (e.g. QR ^BQ,
        // PDF417 ^B7, Data Matrix ^BX). Preserve the whole field byte-for-byte
        // rather than either dropping it or silently reinterpreting it as Code128.
        // ^BY (module width/ratio/height) is real configuration for some of these
        // symbologies too (e.g. PDF417) - splice in whatever ^BY was last in
        // effect, same as the structurally-supported path re-emits a fresh one
        // via currentBY at commit time below.
        const wholeRaw = (currentBYRaw || '') + pendingOrigin.raw + pendingBarcodeDraft.raw +
          (pendingHexEscape ? ('^FH' + pendingHexIndicator) : '') +
          (pendingFieldReverse ? '^FR' : '') +
          (pendingData !== null ? ('^FD' + pendingData + '^FS') : '');
        pushRaw(wholeRaw);
      } else if (pendingBarcodeDraft && pendingOrigin) {
        const typeKey = M.BARCODE_COMMAND_TO_TYPE[pendingBarcodeDraft.type] || 'code128';
        const schema = M.BARCODE_TYPES[typeKey];
        const values = splitBarcodeParams(pendingBarcodeDraft.rawParams);
        // Every barcode type here fuses its orientation letter directly onto
        // the command (^BCN..., no comma before it) - the regex above always
        // captures that separately into pendingBarcodeDraft.orientation,
        // which is why the zip below normally starts at schema.params[1] and
        // skips params[0] (orientation). MaxiCode (^BD) is the one exception:
        // its real format has NO orientation letter at all ("^BD2,1,1"), so
        // schema.params[0] is its first REAL comma-value ("mode") - starting
        // the zip at 0 there (and skipping the bogus captured "orientation"
        // entirely) is what actually reads that value instead of silently
        // dropping it and falling back to the schema default every time.
        const hasOrientationParam = schema.params.length > 0 && schema.params[0].key === 'orientation';
        const params = hasOrientationParam ? { orientation: pendingBarcodeDraft.orientation || 'N' } : {};
        const startIdx = hasOrientationParam ? 1 : 0;
        for (let i = startIdx; i < schema.params.length; i++) {
          const p = schema.params[i];
          const raw = values[i - startIdx];
          if (p.kind === 'bool') params[p.key] = toBool(raw, p.default);
          // A barcode height omitted by the field itself falls back to ^BY's
          // configured default height (real ZPL behavior) - every OTHER
          // int-kind param (Data Matrix's quality/columns/rows/format/aspect
          // etc.) has nothing to do with ^BY and must just use its own default.
          else if (p.kind === 'int' && p.key === 'height') params[p.key] = toInt(raw, currentBY.height || p.default);
          else if (p.kind === 'int') params[p.key] = toInt(raw, p.default);
          else params[p.key] = (raw === undefined || raw === '') ? p.default : raw;
        }
        label.elements.push(M.makeBarcode({
          origin: pendingOrigin.code, x: pendingOrigin.x, y: pendingOrigin.y,
          barcodeType: typeKey,
          moduleWidth: currentBY.moduleWidth, ratio: currentBY.ratio,
          params: params,
          data: pendingHexEscape ? decodeFieldHex(pendingData || '', pendingHexIndicator) : (pendingData || ''),
          hexEscape: pendingHexEscape, hexIndicator: pendingHexIndicator, fieldReverse: pendingFieldReverse,
        }));
      } else if (pendingData !== null && pendingOrigin && !pendingUnknownRaw) {
        // The "&& !pendingUnknownRaw" guard matters: without it, a field that mixes
        // a real ^FD with an unrecognized command (e.g. "^FO5,5^ZZ1^FDHello^FS")
        // would still match here and silently drop ^ZZ1, since this branch builds
        // a normal text element and has no idea pendingUnknownRaw exists. Routing
        // that combination to the fallback branch below instead is what actually
        // preserves it - see the comment there for the full reconstruction.
        label.elements.push(M.makeText({
          origin: pendingOrigin.code, x: pendingOrigin.x, y: pendingOrigin.y,
          font: currentFont.font, orientation: currentFont.orientation,
          height: currentFont.height, width: currentFont.width,
          text: pendingHexEscape ? decodeFieldHex(pendingData, pendingHexIndicator) : pendingData,
          fieldBlock: pendingFieldBlock,
          hexEscape: pendingHexEscape, hexIndicator: pendingHexIndicator, fieldReverse: pendingFieldReverse,
        }));
      } else if (pendingOrigin) {
        // Fallback: an ^FO/^FT origin was opened but the field never matched the
        // barcode-draft or ^FD branches above - either because it contained one or
        // more structurally-unrecognized commands (e.g. an exotic "^ZZ..." - see
        // pendingUnknownRaw, filled in by the "Anything else at the top level"
        // catch-all further down in this function), possibly ALONGSIDE a real ^FD
        // (the guard on the branch above sends that combination here specifically
        // so pendingData isn't lost), or because the field was completely empty (a
        // bare "^FO10,10^FS"). Either way, reconstruct it byte-for-byte instead of
        // silently dropping the origin and terminator, mirroring the exact ordering
        // convention the "unsupported barcode" branch above uses.
        //
        // ^FB (pendingFieldBlock) is deliberately NOT reconstructed here. ^FB only
        // ever affects how ^FD text is laid out (it is read in exactly one place:
        // the text-element branch above) and does nothing on a real printer without
        // an accompanying ^FD - so a "^FB...^FS" with no ^FD, while a field this
        // fallback could theoretically be asked to cover, is not a pattern any real
        // label emits (not observed anywhere in this project's label corpus).
        // pendingFieldBlock also only retains the numeric fields parsed out of ^FB,
        // not its original raw text, so reconstructing a command string from it here
        // would mean re-serializing rather than preserving actual bytes - exactly the
        // kind of "close enough" behavior this fix is trying to move away from. Given
        // the combination is both unrealistic and unobserved, it's left as a
        // documented gap (same treatment the ~DG handling above gives its own known
        // limitation) rather than adding speculative reconstruction for a case with
        // nothing real to validate it against.
        const wholeRaw = pendingOrigin.raw +
          (pendingHexEscape ? ('^FH' + pendingHexIndicator) : '') +
          (pendingFieldReverse ? '^FR' : '') +
          pendingUnknownRaw +
          (pendingData !== null ? ('^FD' + pendingData) : '') +
          '^FS';
        pushRaw(wholeRaw);
      }
      resetFieldState();
    }

    let sawFirstXA = false;
    for (let ti = 0; ti < tokens.length; ti++) {
      const tok = tokens[ti];
      const a = tok.afterPrefix;

      if (tok.prefix === '^' && a.slice(0, 2) === 'XA') { sawFirstXA = true; continue; }
      if (tok.prefix === '^' && a.slice(0, 2) === 'XZ') { commitField(); continue; }
      if (!sawFirstXA) continue; // ignore anything before the label's ^XA (shouldn't happen, body starts there)

      let m;

      if (tok.prefix === '^' && (m = /^(FO|FT)(-?\d+),(-?\d+)/.exec(a))) {
        commitField(); // a new origin always starts a fresh field
        pendingOrigin = { code: m[1], x: parseInt(m[2], 10), y: parseInt(m[3], 10), raw: tok.raw };
        continue;
      }
      if (tok.prefix === '^' && a.slice(0, 2) === 'FD') {
        // Trailing newline/CR is inter-command formatting whitespace left over from
        // the tokenizer splitting on the *next* command, not part of the field data
        // (which real ZPL never spreads across lines) - strip it so pretty-printed
        // ZPL (^FD on its own line, ^FS on the next) doesn't pick up a stray "\n".
        pendingData = a.slice(2).replace(/[\r\n]+$/, '');
        continue;
      }
      if (tok.prefix === '^' && a.slice(0, 2) === 'FS') {
        commitField();
        continue;
      }
      if (tok.prefix === '^' && (m = /^FH(\S)?/.exec(a))) {
        pendingHexEscape = true;
        pendingHexIndicator = m[1] || '\\';
        continue;
      }
      if (tok.prefix === '^' && a.slice(0, 2) === 'FR') {
        pendingFieldReverse = true;
        continue;
      }
      if (tok.prefix === '^' && (m = /^FB(\d+),(\d+),?(-?\d+)?,?([LCRJ])?,?(\d+)?/.exec(a))) {
        pendingFieldBlock = {
          widthDots: parseInt(m[1], 10), maxLines: parseInt(m[2], 10),
          lineSpacing: parseInt(m[3], 10) || 0, justify: m[4] || 'L', hangingIndent: toInt(m[5], 0),
        };
        continue;
      }
      if (tok.prefix === '^' && (m = /^FW([NRIB])/.exec(a))) {
        currentFW = m[1];
        continue;
      }
      if (tok.prefix === '^' && (m = /^A([0-9A-Za-z@])([NRIB])?,?(\d*),?(\d*)/.exec(a))) {
        currentFont = {
          font: m[1], orientation: m[2] || currentFW || 'N',
          height: toInt(m[3], currentFont.height), width: toInt(m[4], 0),
        };
        continue;
      }
      // ^CF sets the DEFAULT font for any later field that omits its own ^A
      // (^A on a specific field is a one-off override, not sticky - but until
      // the next ^CF or ^A, this is what an ^A-less ^FD field actually uses).
      if (tok.prefix === '^' && (m = /^CF([0-9A-Za-z@])?,?(\d*),?(\d*)/.exec(a))) {
        currentFont = {
          font: m[1] || currentFont.font, orientation: currentFW || 'N',
          height: toInt(m[2], currentFont.height), width: toInt(m[3], 0),
        };
        continue;
      }
      if (tok.prefix === '^' && (m = /^BY(\d+),?([\d.]+)?,?(\d+)?/.exec(a))) {
        currentBY = {
          moduleWidth: M.normalizeBarcodeModuleWidth(parseInt(m[1], 10)),
          ratio: M.normalizeBarcodeRatio(toFloat(m[2], currentBY.ratio)),
          height: toInt(m[3], currentBY.height),
        };
        currentBYRaw = tok.raw;
        continue;
      }
      if (tok.prefix === '^' && (m = /^B([0-9A-Z])([NRIB])?,?(.*)/.exec(a))) {
        // m[3] is already exactly "h,f,g,e,m" (comma-joined, empty fields allowed) in
        // BOTH cases - the regex's own `,?` consumes the one separator comma whether
        // or not an orientation letter preceded it - so no further slicing is needed
        // (a previous version re-sliced here for the no-orientation case and
        // reintroduced a leading comma, shifting every parameter by one position).
        if (M.BARCODE_COMMAND_TO_TYPE[m[1]]) {
          pendingBarcodeDraft = { type: m[1], orientation: m[2] || currentFW || 'N', rawParams: m[3] };
        } else {
          // A symbology this editor doesn't model (QR ^BQ, PDF417 ^B7, Data Matrix ^BX,
          // etc.) - preserve the whole field verbatim on commit rather than losing it
          // or silently misreading it as Code128.
          pendingBarcodeDraft = { unsupported: true, raw: tok.raw };
        }
        continue;
      }
      if (tok.prefix === '^' && (m = /^GB(\d+),(\d+),(\d+),?([BW])?,?(\d+)?/.exec(a))) {
        if (pendingOrigin) {
          label.elements.push(M.makeBox({
            origin: pendingOrigin.code, x: pendingOrigin.x, y: pendingOrigin.y,
            widthDots: parseInt(m[1], 10), heightDots: parseInt(m[2], 10),
            thickness: parseInt(m[3], 10), color: m[4] || 'B', rounding: toInt(m[5], 0),
            fieldReverse: pendingFieldReverse,
          }));
        } else {
          pushRaw((pendingFieldReverse ? '^FR' : '') + tok.raw); // no origin to anchor a box to - preserve verbatim instead of dropping it
        }
        resetFieldState();
        continue;
      }
      if (tok.prefix === '^' && (m = /^GC(\d+),?(\d+)?,?([BW])?/.exec(a))) {
        if (pendingOrigin) {
          label.elements.push(M.makeCircle({
            origin: pendingOrigin.code, x: pendingOrigin.x, y: pendingOrigin.y,
            diameter: parseInt(m[1], 10), thickness: toInt(m[2], 1), color: m[3] || 'B',
            fieldReverse: pendingFieldReverse,
          }));
        } else {
          pushRaw((pendingFieldReverse ? '^FR' : '') + tok.raw);
        }
        resetFieldState();
        continue;
      }
      if (tok.prefix === '^' && (m = /^GD(\d+),(\d+),(\d+),?([BW])?,?([RL])?/.exec(a))) {
        if (pendingOrigin) {
          label.elements.push(M.makeLine({
            origin: pendingOrigin.code, x: pendingOrigin.x, y: pendingOrigin.y,
            widthDots: parseInt(m[1], 10), heightDots: parseInt(m[2], 10),
            thickness: parseInt(m[3], 10), color: m[4] || 'B', diagonal: m[5] || 'R',
            fieldReverse: pendingFieldReverse,
          }));
        } else {
          pushRaw((pendingFieldReverse ? '^FR' : '') + tok.raw);
        }
        resetFieldState();
        continue;
      }
      if (tok.prefix === '^' && (m = /^GE(\d+),(\d+),(\d+),?([BW])?/.exec(a))) {
        if (pendingOrigin) {
          label.elements.push(M.makeEllipse({
            origin: pendingOrigin.code, x: pendingOrigin.x, y: pendingOrigin.y,
            widthDots: parseInt(m[1], 10), heightDots: parseInt(m[2], 10),
            thickness: parseInt(m[3], 10), color: m[4] || 'B',
            fieldReverse: pendingFieldReverse,
          }));
        } else {
          pushRaw((pendingFieldReverse ? '^FR' : '') + tok.raw); // no origin to anchor an ellipse to - preserve verbatim instead of dropping it
        }
        resetFieldState();
        continue;
      }
      if (tok.prefix === '^' && a.slice(0, 2) === 'GF') {
        if (pendingOrigin && global.ZPLGraphic) {
          try {
            const decoded = global.ZPLGraphic.decodeGF(a.slice(2));
            label.elements.push(M.makeGraphic({
              origin: pendingOrigin.code, x: pendingOrigin.x, y: pendingOrigin.y,
              widthPx: decoded.widthPx, heightPx: decoded.heightPx, bytesPerRow: decoded.bytesPerRow,
              bits: decoded.bytes, sourceMode: decoded.mode, fieldReverse: pendingFieldReverse,
            }));
          } catch (e) {
            pushRaw(pendingOrigin.raw + (pendingFieldReverse ? '^FR' : '') + tok.raw); // couldn't decode for preview/editing, but keep the original bytes intact on export
          }
        } else {
          pushRaw((pendingOrigin ? pendingOrigin.raw : '') + (pendingFieldReverse ? '^FR' : '') + tok.raw); // no origin, or the codec isn't loaded - preserve verbatim
        }
        resetFieldState();
        continue;
      }
      // ^XG places a graphic that was downloaded ONCE via ~DG and is referenced
      // by name (commonly a reused company logo) - m[2]/m[3] are integer
      // magnification factors (1-10 each), not pixel dimensions.
      if (tok.prefix === '^' && (m = /^XG([^,]+)(?:,(\d+))?(?:,(\d+))?/.exec(a))) {
        const stored = pendingOrigin ? label.storedGraphics[m[1]] : null;
        if (stored) {
          const magX = parseInt(m[2], 10) || 1;
          const magY = parseInt(m[3], 10) || 1;
          label.elements.push(M.makeGraphic({
            origin: pendingOrigin.code, x: pendingOrigin.x, y: pendingOrigin.y,
            widthPx: stored.widthPx, heightPx: stored.heightPx, bytesPerRow: stored.bytesPerRow,
            bits: stored.bytes, sourceMode: 'XG', storedName: m[1], magX: magX, magY: magY,
            displayWidthPx: stored.widthPx * magX, displayHeightPx: stored.heightPx * magY,
            fieldReverse: pendingFieldReverse,
          }));
        } else {
          // Referenced name was never stored (or its ~DG failed to decode) -
          // preserve verbatim rather than silently dropping the placement.
          pushRaw((pendingOrigin ? pendingOrigin.raw : '') + (pendingFieldReverse ? '^FR' : '') + tok.raw);
        }
        resetFieldState();
        continue;
      }
      // ^ID deletes a previously-stored graphic (usually right after the main
      // frame, as printer housekeeping) - modeled as a flag on the stored
      // graphic itself, not as a visual element, and consumed here rather
      // than left in rawTail so the generator can re-emit a clean cleanup
      // frame instead of a stray top-level command.
      if (tok.prefix === '^' && (m = /^ID([^,\s]+)/.exec(a))) {
        if (label.storedGraphics[m[1]]) {
          label.storedGraphics[m[1]].deleteAfterPrint = true;
        } else {
          pushRaw(tok.raw); // unknown/wildcard name - preserve verbatim rather than lose it
        }
        continue;
      }
      if (tok.prefix === '^' && (m = /^PW(\d+)/.exec(a))) { label.settings.widthDots = Math.min(M.MAX_LABEL_DOTS, parseInt(m[1], 10)); continue; }
      if (tok.prefix === '^' && (m = /^LL(\d+)/.exec(a))) { label.settings.heightDots = Math.min(M.MAX_LABEL_DOTS, parseInt(m[1], 10)); continue; }
      if (tok.prefix === '^' && (m = /^LH(-?\d+),(-?\d+)/.exec(a))) { label.settings.homeX = parseInt(m[1], 10); label.settings.homeY = parseInt(m[2], 10); continue; }
      if (tok.prefix === '^' && (m = /^LS(-?\d+)/.exec(a))) { label.settings.labelShiftY = parseInt(m[1], 10); continue; }
      if (tok.prefix === '^' && (m = /^MM([A-Z])/.exec(a))) { label.settings.mediaTracking = m[1]; continue; }
      if (tok.prefix === '^' && (m = /^PO([NI])/.exec(a))) { label.settings.printMode = m[1]; continue; }
      if (tok.prefix === '^' && (m = /^CI(\d+)/.exec(a))) { label.settings.encoding = m[1]; continue; }
      if (tok.prefix === '~' && (m = /^SD(\d+)/.exec(a))) { label.settings.darkness = parseInt(m[1], 10); continue; }
      if (tok.prefix === '^' && (m = /^PR([\d,]+)/.exec(a))) { label.settings.printSpeed = m[1]; continue; }
      // ^PQ (quantity/pause/replicates/override) verbatim - stored so a label
      // that already specified these round-trips with its own values intact
      // instead of this editor's own default (see generateZPL) silently
      // replacing them, and so this doesn't fall to rawTail (which would
      // make a fresh parse of this editor's OWN generated output gain a
      // rawTail entry it didn't start with, growing on every re-save).
      if (tok.prefix === '^' && a.slice(0, 2) === 'PQ') { label.settings.pq = a.slice(2).replace(/[\r\n]+$/, ''); continue; }
      // This editor's own version-note convention: a "^FX" comment (ignored
      // by the printer either way) tagged "NOTIZ:" so it round-trips as a
      // structured field instead of opaque passthrough - any OTHER ^FX
      // comment a file already had is left alone and falls to the raw case below.
      if (tok.prefix === '^' && (m = /^FXNOTIZ:([\s\S]*)/.exec(a))) { label.settings.note = m[1].replace(/[\r\n]+$/, ''); continue; }

      // Anything else: if we're inside an active field (an ^FO/^FT has already been
      // seen and its ^FS hasn't arrived yet), don't push it standalone - that would
      // strand it between two rawTail entries with no ^FO/^FS around it and, worse,
      // would leave the origin+terminator pair themselves dangling with nothing to
      // commit (see commitField's fallback branch above for the full story). Buffer
      // it on pendingUnknownRaw instead; the field's eventual ^FS (or the frame's
      // ^XZ, which also calls commitField) will flush it as one lossless unit
      // together with the origin, any ^FH/^FR seen, and any ^FD data. Only a command
      // seen OUTSIDE any field (pendingOrigin still null - a stray/unanchored
      // top-level command) keeps the original immediate-pushRaw behavior.
      if (pendingOrigin) {
        pendingUnknownRaw += tok.raw;
      } else {
        pushRaw(tok.raw);
      }
    }

    label.byState = currentBY;
    return label;
  }

  // A ~DG-stored graphic that ISN'T placed anywhere via ^XG in this same
  // file is real, observed data (found in labels/multitest2.300zpl: a
  // second stored logo downloaded but never placed in that particular
  // print job) - generateZPL only re-emits ~DG for names an element still
  // references (so deleting that element also drops its store, see the
  // comment there), which would otherwise silently drop this never-placed
  // entry on the very first save. Flagging it here lets the generator
  // preserve it unconditionally, since it was never "attached" to any
  // element to begin with - there's no user deletion to clean up after.
  //
  // Runs across ALL labels of a document, not per label: a logo that only
  // label 3 places is still referenced, and flagging it while looking at
  // label 1 alone would be wrong.
  function flagUnreferencedGraphics(storedGraphics, labels) {
    const referencedNames = {};
    labels.forEach(function (label) {
      label.elements.forEach(function (el) {
        if (el.type === 'graphic' && el.storedName) referencedNames[el.storedName] = true;
      });
    });
    Object.keys(storedGraphics).forEach(function (name) {
      if (!referencedNames[name]) storedGraphics[name].preserveUnreferenced = true;
    });
  }

  /* parseDocument(text) -> { labels, preamble, storedGraphics, passthrough }

     A .zpl file is not necessarily one label: a print spool commonly holds
     dozens of ^XA..^XZ frames back to back. Parsing those into a single
     label - which is what a lone parseZPL() call did before this existed -
     stacks every frame's elements on top of each other at the same
     coordinates and re-emits them as one unprintable frame.

     What is shared across the whole file rather than per label:
       preamble        the opaque driver-config frame(s) at the top
       storedGraphics  the ~DG registry (every label sees the same object,
                       so a logo placed by several labels is stored once)
       passthrough     frames that are not labels (further driver config,
                       ^ID cleanup tails) and any text outside a frame, each
                       tagged with the label index it followed so the
                       generator can put it back in the same place

     `labels` is never empty: a file with no frame at all still yields one
     empty label, so every caller can rely on labels[0] existing.          */
  function parseDocument(text) {
    const extracted = extractStoredGraphics(text || '');
    const split = splitPreambleAndBody(extracted.text);
    const parts = splitFrames(split.body);

    const labels = [];
    const passthrough = [];
    let pendingBetween = '';

    // Stored trimmed: the whitespace between two frames is pretty-printing,
    // not data, and keeping it would make a re-generated file grow a blank
    // line on every round trip (the generator re-adds exactly one newline,
    // the same normalization emitRaw applies to rawTail entries).
    function keepPassthrough(raw) {
      const trimmed = (raw || '').trim();
      if (trimmed) passthrough.push({ afterLabelIndex: labels.length - 1, raw: trimmed });
    }

    parts.frames.forEach(function (frame) {
      pendingBetween += frame.between;
      // Driver-config and ^ID-cleanup frames are not labels. They still have
      // to survive the round trip, so they ride along as passthrough anchored
      // to the label they followed.
      if (looksLikeDriverConfig(frame.text) || looksLikeCleanupFrame(frame.text)) {
        keepPassthrough(pendingBetween + frame.text);
        pendingBetween = '';
        return;
      }
      const label = M.defaultLabel();
      label.storedGraphics = extracted.storedGraphics; // shared, not copied
      parseBodyInto(label, frame.text);
      labels.push(label);
      if (pendingBetween.trim()) {
        // Text outside any frame used to land in rawTail of the one merged
        // label; keep it attached to the frame it preceded.
        label.rawTail.unshift({ raw: pendingBetween.trim(), atIndex: 0 });
      }
      pendingBetween = '';
    });

    keepPassthrough(pendingBetween + parts.trailing);

    if (!labels.length) {
      const empty = M.defaultLabel();
      empty.storedGraphics = extracted.storedGraphics;
      labels.push(empty);
    }
    labels[0].preamble = split.preamble;
    flagUnreferencedGraphics(extracted.storedGraphics, labels);

    return {
      labels: labels,
      preamble: split.preamble,
      storedGraphics: extracted.storedGraphics,
      passthrough: passthrough,
    };
  }

  /* parseZPL(text) -> the FIRST label of the document.

     Kept as the single-label entry point every existing caller uses. For a
     multi-frame file it returns frame 1 rather than a merge of all frames -
     `labelCount` says how many there were, so a caller that cares can notice
     and switch to parseDocument() instead of being silently handed a third
     of a spool file. */
  function parseZPL(text) {
    const doc = parseDocument(text);
    const label = doc.labels[0];
    label.labelCount = doc.labels.length;
    return label;
  }

  global.ZPLParser = {
    parseZPL: parseZPL, parseDocument: parseDocument,
    splitPreambleAndBody: splitPreambleAndBody, splitFrames: splitFrames, tokenize: tokenize,
    extractStoredGraphics: extractStoredGraphics,
  };
})(typeof globalThis !== 'undefined' ? globalThis : this);
