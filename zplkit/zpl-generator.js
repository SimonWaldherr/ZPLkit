/* ZPL label editor — generator: label model (zpl-model.js) -> raw ZPL text. */
(function (global) {
  'use strict';

  const M = global.ZPLModel;
  const EditorMetadata = global.ZPLEditorMetadata;

  function esc(v) { return v == null ? '' : String(v); }

  function countNewlines(s) {
    let n = 0;
    for (let i = 0; i < s.length; i++) if (s.charCodeAt(i) === 10) n++;
    return n;
  }

  // Line ranges (0-indexed, half-open [start,end)) of each element's own
  // generated block within the text most recently produced by generateZPL(),
  // keyed by element id - lets the UI highlight "these are this element's
  // lines" in the ZPL-Code/Erklärte-Ansicht views without re-deriving the
  // generator's own emission order. Single "most recent" map (not per-label)
  // since only the currently-open label's generated text is ever shown.
  let lastElementLineRanges = {};

  // ^FD field data containing a literal '^', '~', or the hex-escape indicator
  // itself must be hex-escaped (indicator + 2 hex digits) - otherwise a real
  // printer (and this app's own tokenizer, which splits on any bare ^/~) would
  // misread it as the start of a new command instead of literal text.
  //
  // hexEscapeMode (pass el.hexEscape) additionally re-escapes any other
  // single-byte control/extended character (codes <0x20 or 0x7F-0xFF) -
  // needed because zpl-parser.js's decodeFieldHex decodes EVERY hex escape
  // in a ^FH field back to its raw character on import (e.g. "\E4" -> 'ä'),
  // not just ^/~/indicator ones. Without this, re-generating a field that
  // originally hex-escaped some OTHER byte (an accented character, a CR/TAB
  // control code - the actual real-world reason ^FH exists) would silently
  // emit that raw character instead of re-escaping it, changing the wire
  // bytes sent to the printer. Gated on hexEscapeMode rather than applied
  // unconditionally so a plain UTF-8 (^CI28) label's raw non-ASCII text -
  // which never went through ^FH at all - isn't suddenly hex-escaped too.
  // Codes above 0xFF (real multi-byte Unicode) aren't representable by
  // ZPL's fixed 2-hex-digit escape and are left untouched either way, same
  // as before this widening - hex-escape was never how those get sent.
  function escapeFieldData(str, indicatorChar, hexEscapeMode) {
    const s = str == null ? '' : String(str);
    const isSpecial = function (c) {
      if (c === '^' || c === '~' || c === indicatorChar) return true;
      if (hexEscapeMode) {
        const code = c.charCodeAt(0);
        return (code < 0x20 || code > 0x7E) && code <= 0xFF;
      }
      return false;
    };
    let needsHex = false;
    for (let i = 0; i < s.length; i++) { if (isSpecial(s[i])) { needsHex = true; break; } }
    if (!needsHex) return { text: s, needsHex: false };
    let out = '';
    for (let i = 0; i < s.length; i++) {
      const c = s[i];
      out += isSpecial(c) ? (indicatorChar + c.charCodeAt(0).toString(16).toUpperCase().padStart(2, '0')) : c;
    }
    return { text: out, needsHex: true };
  }

  function formatParamValue(p, value) {
    if (p.kind === 'bool') return value ? 'Y' : 'N';
    return esc(value);
  }

  function barcodeCommandString(el) {
    const schema = M.BARCODE_TYPES[el.barcodeType] || M.BARCODE_TYPES.code128;
    const parts = schema.params.map(function (p) {
      return formatParamValue(p, el.params ? el.params[p.key] : p.default);
    });
    return '^B' + schema.command + parts.join(',');
  }

  // Caches the fully-built "^GFA,..."/"~DG..." command string for a graphic
  // (inline element or storedGraphics entry), keyed by the object itself and
  // invalidated only when its packed bits, its compress flag, or the
  // available Z64 alternative actually change. Without this, generateZPL()
  // re-ran the whole RLE hex-encode (and the RLE-vs-Z64 length comparison)
  // from scratch on every call - which happens on every keystroke in ANY
  // property field, not just ones touching this graphic, since updateZplSource()
  // regenerates the entire label's ZPL text as a single string.
  const graphicCmdCache = new WeakMap();
  function cachedGraphicCommand(cacheKey, bits, compress, buildRleCmd, buildZ64Cmd) {
    // Z64 is itself a compressed format, so honor "compress: false" (meant
    // for printers too old/exotic to decode ANY compression) by skipping it
    // entirely rather than silently substituting a different compression.
    const z64 = compress && global.ZPLGraphic.z64Cache && global.ZPLGraphic.z64Cache.get(cacheKey);
    const z64Data = (z64 && z64.forBits === bits) ? z64.data : null;
    const cached = graphicCmdCache.get(cacheKey);
    if (cached && cached.forBits === bits && cached.compress === compress && cached.z64Data === z64Data) {
      return cached.cmd;
    }
    const rleCmd = buildRleCmd();
    let cmd = rleCmd;
    if (z64Data) {
      const z64Cmd = buildZ64Cmd(z64Data);
      if (z64Cmd.length < rleCmd.length) cmd = z64Cmd;
    }
    graphicCmdCache.set(cacheKey, { forBits: bits, compress: compress, z64Data: z64Data, cmd: cmd });
    return cmd;
  }

  // Builds the "^GFA,..." command for an inline graphic element, picking
  // whichever of the ASCII-hex/RLE encoding (always available) or a Z64/zlib
  // alternative (computed asynchronously elsewhere - see app.js's import/
  // replace/resize handlers - and cached by element identity in
  // global.ZPLGraphic.z64Cache, since that async work can't happen inside
  // this synchronous generator) is actually shorter. If no fresh-enough Z64
  // alternative is cached yet, this is exactly the RLE encoding this editor
  // has always produced - never worse, just not maximally compact until the
  // async compression catches up.
  function graphicFieldCommand(el) {
    const compress = el.compress !== false;
    return cachedGraphicCommand(el, el.bits, compress,
      function () {
        // el.bits is already packed 1bpp - encode it directly rather than
        // inflating to a throwaway RGBA buffer just to re-derive the same
        // bytes (bitsToGF skips exactly that round-trip; see gfa-codec.js).
        return global.ZPLGraphic.bitsToGF(el.bits, el.bytesPerRow, el.heightPx, { compress: compress });
      },
      function (z64Data) {
        const bytesPerRow = el.bytesPerRow;
        const binaryByteCount = bytesPerRow * el.heightPx;
        return '^GFA,' + z64Data.length + ',' + binaryByteCount + ',' + bytesPerRow + ',' + z64Data;
      }
    );
  }

  function generateElement(el) {
    let out = '';
    if (el.type === 'box') {
      out += '^' + el.origin + el.x + ',' + el.y + '\n';
      if (el.fieldReverse) out += '^FR\n';
      out += '^GB' + el.widthDots + ',' + el.heightDots + ',' + el.thickness + ',' + (el.color || 'B') + ',' + (el.rounding || 0) + '\n';
      out += '^FS\n';
      return out;
    }
    if (el.type === 'circle') {
      out += '^' + el.origin + el.x + ',' + el.y + '\n';
      if (el.fieldReverse) out += '^FR\n';
      out += '^GC' + el.diameter + ',' + el.thickness + ',' + (el.color || 'B') + '\n';
      out += '^FS\n';
      return out;
    }
    if (el.type === 'line') {
      out += '^' + el.origin + el.x + ',' + el.y + '\n';
      if (el.fieldReverse) out += '^FR\n';
      out += '^GD' + el.widthDots + ',' + el.heightDots + ',' + el.thickness + ',' + (el.color || 'B') + ',' + (el.diagonal || 'R') + '\n';
      out += '^FS\n';
      return out;
    }
    if (el.type === 'ellipse') {
      out += '^' + el.origin + el.x + ',' + el.y + '\n';
      if (el.fieldReverse) out += '^FR\n';
      out += '^GE' + el.widthDots + ',' + el.heightDots + ',' + el.thickness + ',' + (el.color || 'B') + '\n';
      out += '^FS\n';
      return out;
    }
    if (el.type === 'graphic') {
      out += '^' + el.origin + el.x + ',' + el.y + '\n';
      // ^FR (field reverse) must precede the field-content command, same as
      // for text/barcode - prints this graphic inverted (white ink where the
      // bitmap is black) without touching the stored bits themselves.
      if (el.fieldReverse) out += '^FR\n';
      if (el.storedName) {
        // Placement of a graphic downloaded once via ~DG (see the label-level
        // storedGraphics emission in generateZPL) - magX/magY are the ^XG
        // integer magnification factors, not this element's pixel size.
        out += '^XG' + el.storedName + ',' + (el.magX || 1) + ',' + (el.magY || 1) + '\n';
      } else if (global.ZPLGraphic && el.bits) {
        out += graphicFieldCommand(el) + '\n';
      }
      out += '^FS\n';
      return out;
    }
    if (el.type === 'barcode') {
      const indicator = el.hexIndicator || '\\';
      const escaped = escapeFieldData(el.data, indicator, el.hexEscape);
      out += '^BY' + M.normalizeBarcodeModuleWidth(el.moduleWidth) + ',' + M.normalizeBarcodeRatio(el.ratio) + ',' + ((el.params && el.params.height) || M.DEFAULT_BARCODE_HEIGHT) + '\n';
      out += '^' + el.origin + el.x + ',' + el.y + '\n';
      out += barcodeCommandString(el) + '\n';
      if (el.hexEscape || escaped.needsHex) out += '^FH' + indicator + '\n';
      if (el.fieldReverse) out += '^FR\n';
      out += '^FD' + escaped.text + '\n';
      out += '^FS\n';
      return out;
    }
    // text
    const indicator = el.hexIndicator || '\\';
    const escaped = escapeFieldData(el.text, indicator, el.hexEscape);
    out += '^' + el.origin + el.x + ',' + el.y + '\n';
    out += '^A' + el.font + el.orientation + ',' + el.height + ',' + (el.width || 0) + '\n';
    if (el.fieldBlock) {
      const fb = el.fieldBlock;
      out += '^FB' + fb.widthDots + ',' + fb.maxLines + ',' + (fb.lineSpacing || 0) + ',' + (fb.justify || 'L') + ',' + (fb.hangingIndent || 0) + '\n';
    }
    if (el.hexEscape || escaped.needsHex) out += '^FH' + indicator + '\n';
    if (el.fieldReverse) out += '^FR\n';
    out += '^FD' + escaped.text + '\n';
    out += '^FS\n';
    return out;
  }

  /* generateZPL(label, opts) -> ZPL text for ONE label.

     opts.keepPreamble        false drops the driver-config preamble
     opts.omitStoredGraphics  true skips both the ~DG download block and the
                              ^ID cleanup tail. Used by generateDocument,
                              where the store is shared across every label of
                              the file and must be emitted exactly once - not
                              once per frame. */
  function generateZPL(label, opts) {
    opts = opts || {};
    const keepPreamble = opts.keepPreamble !== false;
    const omitStoredGraphics = !!opts.omitStoredGraphics;
    let out = '';
    if (keepPreamble && label.preamble) out += label.preamble;

    // Named/stored graphics (~DG) are downloaded ONCE, outside any ^XA..^XZ
    // frame - real files put this right after the driver preamble and before
    // the main content frame, so that's where we re-emit it too. Store names
    // still referenced by some element (storedName), in first-reference
    // order, so deleting the last referencing element also drops the store -
    // PLUS any entry the parser flagged preserveUnreferenced (already unused
    // the moment it was imported, e.g. a second logo downloaded but never
    // placed in that particular print job - never "attached" to an element
    // to begin with, so there's no user deletion to clean up after; dropping
    // it anyway would silently lose real data on the very first save).
    const storedGraphics = label.storedGraphics || {};
    const referencedStoredNames = [];
    (label.elements || []).forEach(function (el) {
      if (el.type === 'graphic' && el.storedName && referencedStoredNames.indexOf(el.storedName) === -1) {
        referencedStoredNames.push(el.storedName);
      }
    });
    Object.keys(storedGraphics).forEach(function (name) {
      if (storedGraphics[name].preserveUnreferenced && referencedStoredNames.indexOf(name) === -1) {
        referencedStoredNames.push(name);
      }
    });
    (omitStoredGraphics ? [] : referencedStoredNames).forEach(function (name) {
      const stored = storedGraphics[name];
      if (!stored || !stored.bytes || !global.ZPLGraphic) return;
      // Same cache (keyed on the storedGraphics registry entry itself - a
      // different kind of object than a graphic element, but the WeakMap
      // doesn't care) and "compare against an async-computed Z64 alternative,
      // keep whichever is shorter" strategy as inline graphics.
      const cmd = cachedGraphicCommand(stored, stored.bytes, true,
        function () {
          return global.ZPLGraphic.bitsToDG(stored.bytes, name, stored.bytesPerRow, stored.heightPx, { compress: true });
        },
        function (z64Data) {
          const binaryByteCount = stored.bytesPerRow * stored.heightPx;
          return '~DG' + name + ',' + binaryByteCount + ',' + stored.bytesPerRow + ',' + z64Data;
        }
      );
      out += cmd + '\n';
    });

    out += '^XA\n';

    const s = label.settings;
    // Empty mode means the user chose to leave the printer setting unchanged.
    // Old models without the property keep the historical Tear-off default.
    if (s.mediaTracking !== null && s.mediaTracking !== '') {
      out += '^MM' + (s.mediaTracking || 'T') + (s.mediaPrepeel != null ? ',' + s.mediaPrepeel : '') + '\n';
    }
    if (s.printMethod) out += '^MT' + s.printMethod + '\n';
    if (s.mediaSensing) out += '^MN' + s.mediaSensing + (s.blackMarkOffset != null ? ',' + s.blackMarkOffset : '') + '\n';
    out += '^PW' + s.widthDots + '\n';
    out += '^LL' + s.heightDots + '\n';
    if (s.homeX || s.homeY) out += '^LH' + s.homeX + ',' + s.homeY + '\n';
    out += '^LS' + (s.labelShiftY || 0) + '\n';
    out += (s.printMode === 'I' ? '^POI' : '^PON') + '\n';
    out += '^CI' + (s.encoding || '0') + '\n';
    if (s.darkness != null && s.darkness !== '') out += '~SD' + s.darkness + '\n';
    if (s.darknessOffset != null && s.darknessOffset !== '') out += '^MD' + s.darknessOffset + '\n';
    if (s.printSpeed) out += '^PR' + s.printSpeed + '\n';
    if (s.note) out += '^FXNOTIZ:' + s.note.replace(/[\^~]/g, '') + '^FS\n';
    if (EditorMetadata && opts.editorMetadata !== false) {
      EditorMetadata.encode(label).forEach(function (command) { out += command + '\n'; });
    }

    // rawTail entries carry the elements-array length at the moment they were
    // encountered during parsing, so they can be re-interleaved at that same
    // relative position instead of being dumped as one block before every
    // element (which would silently reorder commands relative to the source).
    const rawTail = (label.rawTail || []).filter(function (entry) {
      // Invalid/incomplete sidecars are deliberately retained by the parser
      // for lossless normal saves. A caller explicitly requesting clean print
      // ZPL expects those remnants to be removed as well as valid metadata.
      return opts.editorMetadata !== false || String(entry.raw || '').indexOf('^FXZPLKIT_META:') !== 0;
    });
    let rawIdx = 0;
    // A raw/passthrough chunk's captured text may or may not already end in
    // its own trailing newline, depending on whether the tokenizer's chunk
    // boundary (the next ^/~ marker) happened to land right after one in the
    // ORIGINAL source - e.g. tokenizing this app's own pretty-printed output
    // (one command per line) always captures that newline, but a real file
    // with no whitespace between commands never does. Blindly appending '\n'
    // regardless doubled up into a growing blank line every time such a
    // label round-tripped through parse->generate again (observed on every
    // one of 214 real sample files via a parse->generate->parse->generate
    // idempotency check) - stripping any trailing newline first and always
    // adding exactly one keeps output stable no matter how it was captured.
    // lineCount is a running tally, updated by emitRaw/the loop below instead
    // of re-scanning the whole (ever-growing) `out` string on every element -
    // countNewlines(out) here would otherwise be O(output length) called
    // twice per element, making the whole loop O(n^2) in element count for no
    // reason (each element's own line range only needs the newlines IT adds).
    function emitRaw(raw) {
      const text = raw.replace(/[\r\n]+$/, '') + '\n';
      out += text;
      lineCount += countNewlines(text);
    }
    function flushRawAt(elementIndex) {
      while (rawIdx < rawTail.length && rawTail[rawIdx].atIndex === elementIndex) {
        emitRaw(rawTail[rawIdx].raw);
        rawIdx++;
      }
    }

    const elementLineRanges = {};
    const elements = label.elements || [];
    let lineCount = countNewlines(out); // one scan of the preamble/settings header already in `out`
    elements.forEach(function (el, i) {
      flushRawAt(i);
      // A layers-panel "hidden" element (see app.js's Ebenen tab) is an
      // editor-only concept, same as groupId - it's excluded from the
      // printed/exported ZPL entirely (not just the canvas preview), so
      // toggling it off is a safe way to temporarily drop content from a
      // print run without deleting it. No line range either - there's
      // nothing generated for it to highlight.
      if (el.hidden) return;
      const startLine = lineCount;
      const block = generateElement(el);
      out += block;
      lineCount += countNewlines(block);
      elementLineRanges[el.id] = { start: startLine, end: lineCount };
    });
    lastElementLineRanges = elementLineRanges;
    while (rawIdx < rawTail.length) {
      emitRaw(rawTail[rawIdx].raw);
      rawIdx++;
    }

    // Reproduces a label's own quantity/pause/replicate/override values
    // verbatim if it specified any (see the ^PQ parser case); falls back to
    // this editor's own "no quantity specified" default otherwise - same
    // default as before this was parsed structurally.
    out += '^PQ' + (s.pq != null ? s.pq : ',,,Y') + '\n';
    out += '^XZ\n';

    // Cleanup: a graphic downloaded just for this one print job is often
    // deleted again right after (seen in ~80 real files, one small frame per
    // deleted name) - re-emit that same pattern for anything flagged deleted.
    (omitStoredGraphics ? [] : referencedStoredNames).forEach(function (name) {
      const stored = storedGraphics[name];
      if (stored && stored.deleteAfterPrint) out += '^XA^ID' + name + '^FS^XZ\n';
    });

    return out;
  }

  /* generateDocument(doc, opts) -> ZPL text for a whole multi-label file.

     `doc` is what ZPLParser.parseDocument returns, or anything with the same
     shape: { labels, preamble, storedGraphics, passthrough }.

     The ~DG store and the ^ID cleanup tail are emitted ONCE around all the
     frames rather than per label - a logo shared by twelve labels is
     downloaded to the printer once, which is the whole point of ~DG and also
     what the original file did.

     `passthrough` entries (driver-config frames between labels, ^ID cleanup
     tails, stray text outside any frame) are re-inserted after the label
     index they were found behind, so a spool file keeps its original
     structure instead of having its non-label frames migrate to the end. */
  function generateDocument(doc, opts) {
    opts = opts || {};
    const labels = (doc && doc.labels) || [];
    if (!labels.length) return '';
    const keepPreamble = opts.keepPreamble !== false;
    const storedGraphics = (doc && doc.storedGraphics) || labels[0].storedGraphics || {};
    const passthrough = (doc && doc.passthrough) || [];

    // One synthetic label carrying only the shared document context, so the
    // ~DG/^ID emission logic lives in exactly one place instead of being
    // reimplemented here. Its elements are every label's elements, which is
    // precisely the set of ^XG references that keeps a store alive.
    const storeCarrier = {
      settings: labels[0].settings,
      preamble: keepPreamble ? (doc.preamble || labels[0].preamble) : null,
      elements: labels.reduce(function (all, l) { return all.concat(l.elements || []); }, []),
      rawTail: [],
      storedGraphics: storedGraphics,
    };
    const header = generateZPL(storeCarrier, { keepPreamble: keepPreamble, editorMetadata: false });
    // Everything before the carrier's own ^XA is preamble + ~DG downloads;
    // everything from the trailing ^XA^ID... on is the cleanup tail.
    const frameStart = header.indexOf('^XA\n');
    const prologue = frameStart === -1 ? '' : header.slice(0, frameStart);
    const epilogue = cleanupTail(storedGraphics, storeCarrier.elements);

    let out = prologue;
    function emitPassthroughAfter(index) {
      passthrough.forEach(function (entry) {
        if (entry.afterLabelIndex !== index) return;
        out += entry.raw.replace(/[\r\n]+$/, '') + '\n';
      });
    }
    emitPassthroughAfter(-1);
    labels.forEach(function (label, i) {
      out += generateZPL(label, {
        keepPreamble: false,
        omitStoredGraphics: true,
        editorMetadata: opts.editorMetadata !== false,
      });
      emitPassthroughAfter(i);
    });
    return out + epilogue;
  }

  function cleanupTail(storedGraphics, elements) {
    const referenced = {};
    elements.forEach(function (el) {
      if (el.type === 'graphic' && el.storedName) referenced[el.storedName] = true;
    });
    let out = '';
    Object.keys(storedGraphics).forEach(function (name) {
      const stored = storedGraphics[name];
      if (!stored || !stored.deleteAfterPrint) return;
      if (!referenced[name] && !stored.preserveUnreferenced) return;
      out += '^XA^ID' + name + '^FS^XZ\n';
    });
    return out;
  }

  global.ZPLGenerator = {
    generateZPL: generateZPL,
    generateDocument: generateDocument,
    barcodeCommandString: barcodeCommandString,
    generateElement: generateElement,
    // Line ranges from the MOST RECENT generateZPL() call - callers that need
    // this must call generateZPL() first (updateZplSource() in app.js always
    // does, right before anything reads this).
    getElementLineRanges: function () { return lastElementLineRanges; },
  };
})(typeof globalThis !== 'undefined' ? globalThis : this);
