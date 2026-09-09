/* ZPL label editor — diff: compare two label models.
   Pure data-layer logic (element matching, property diff, text-line diff);
   the canvas overlay rendering lives in app.js next to the existing renderer. */
(function (global) {
  'use strict';

  function dist2(a, b) { const dx = a.x - b.x, dy = a.y - b.y; return dx * dx + dy * dy; }

  // Greedy nearest-neighbor bipartite matching, bucketed by type (+
  // barcodeType for barcodes) within a tolerance radius so e.g. a moved text
  // field never matches a moved barcode. A second pass below catches
  // same-content elements that moved further than the tolerance.
  function matchElements(elsA, elsB, opts) {
    opts = opts || {};
    const tol2 = Math.pow(opts.tolerance || 60, 2);
    const bucketKey = function (el) { return el.type + (el.type === 'barcode' ? ':' + el.barcodeType : ''); };

    const bucketsA = {}, bucketsB = {};
    elsA.forEach(function (el, i) { const k = bucketKey(el); (bucketsA[k] = bucketsA[k] || []).push(i); });
    elsB.forEach(function (el, i) { const k = bucketKey(el); (bucketsB[k] = bucketsB[k] || []).push(i); });

    const matchedA = elsA.map(function () { return false; });
    const matchedB = elsB.map(function () { return false; });
    const pairs = [];

    Object.keys(bucketsA).forEach(function (k) {
      const idxA = bucketsA[k] || [];
      const idxB = bucketsB[k] || [];
      const candidates = [];
      idxA.forEach(function (ai) {
        idxB.forEach(function (bi) {
          const d2 = dist2(elsA[ai], elsB[bi]);
          if (d2 <= tol2) candidates.push({ ai: ai, bi: bi, d2: d2 });
        });
      });
      candidates.sort(function (p, q) { return p.d2 - q.d2; });
      candidates.forEach(function (c) {
        if (matchedA[c.ai] || matchedB[c.bi]) return;
        matchedA[c.ai] = true; matchedB[c.bi] = true;
        pairs.push({ a: elsA[c.ai], b: elsB[c.bi] });
      });
    });

    // Fallback: identical text/barcode-data content regardless of distance -
    // catches an element that moved further than `tolerance`.
    function contentKey(el) {
      if (el.type === 'text') return 'text:' + (el.text || '');
      if (el.type === 'barcode') return 'barcode:' + el.barcodeType + ':' + (el.data || '');
      return null;
    }
    elsA.forEach(function (elA, ai) {
      if (matchedA[ai]) return;
      const key = contentKey(elA);
      if (!key) return;
      let best = -1, bestD2 = Infinity;
      elsB.forEach(function (elB, bi) {
        if (matchedB[bi] || contentKey(elB) !== key) return;
        const d2 = dist2(elA, elB);
        if (d2 < bestD2) { bestD2 = d2; best = bi; }
      });
      if (best !== -1) {
        matchedA[ai] = true; matchedB[best] = true;
        pairs.push({ a: elA, b: elsB[best] });
      }
    });

    return {
      pairs: pairs,
      removed: elsA.filter(function (_, i) { return !matchedA[i]; }),
      added: elsB.filter(function (_, i) { return !matchedB[i]; }),
    };
  }

  const TYPE_FIELDS = {
    text: ['text', 'font', 'orientation', 'height', 'width', 'fieldReverse'],
    barcode: ['barcodeType', 'data', 'moduleWidth', 'ratio'],
    box: ['widthDots', 'heightDots', 'thickness', 'color', 'rounding'],
    circle: ['diameter', 'thickness', 'color'],
    line: ['widthDots', 'heightDots', 'thickness', 'color', 'diagonal'],
    ellipse: ['widthDots', 'heightDots', 'thickness', 'color'],
    graphic: ['storedName', 'displayWidthPx', 'displayHeightPx'],
  };

  // Property-level diff for one matched pair - independent of the match
  // itself, so callers can re-run it (e.g. after editing) without re-matching.
  function diffPair(a, b) {
    const changes = [];
    const dx = b.x - a.x, dy = b.y - a.y;
    if (Math.abs(dx) > 1 || Math.abs(dy) > 1) {
      changes.push({ field: 'Position', from: '(' + a.x + ',' + a.y + ')', to: '(' + b.x + ',' + b.y + ')' });
    }
    (TYPE_FIELDS[a.type] || []).forEach(function (f) {
      const av = a[f], bv = b[f];
      if (String(av == null ? '' : av) !== String(bv == null ? '' : bv)) {
        changes.push({ field: f, from: av == null ? '' : String(av), to: bv == null ? '' : String(bv) });
      }
    });
    if (a.type === 'barcode') {
      const ap = a.params || {}, bp = b.params || {};
      Object.keys(Object.assign({}, ap, bp)).forEach(function (k) {
        if (String(ap[k] == null ? '' : ap[k]) !== String(bp[k] == null ? '' : bp[k])) {
          changes.push({ field: 'params.' + k, from: ap[k] == null ? '' : String(ap[k]), to: bp[k] == null ? '' : String(bp[k]) });
        }
      });
    }
    return changes;
  }

  function describeElement(el) {
    if (el.type === 'text') return 'Text "' + (el.text || '').slice(0, 40) + '"';
    if (el.type === 'barcode') return 'Barcode (' + el.barcodeType + ')';
    if (el.type === 'graphic') return 'Grafik' + (el.storedName ? ' (' + el.storedName + ')' : '');
    if (el.type === 'box') return 'Box';
    if (el.type === 'circle') return 'Kreis';
    if (el.type === 'line') return 'Linie';
    if (el.type === 'ellipse') return 'Ellipse';
    return el.type;
  }

  // Compare two full labels: matched/changed pairs plus removed (only in A)
  // and added (only in B) elements.
  function compareLabels(labelA, labelB, opts) {
    const m = matchElements(labelA.elements || [], labelB.elements || [], opts);
    const changed = [];
    m.pairs.forEach(function (p) {
      const changes = diffPair(p.a, p.b);
      if (changes.length) changed.push({ a: p.a, b: p.b, changes: changes });
    });
    return { removed: m.removed, added: m.added, changed: changed, unchangedCount: m.pairs.length - changed.length };
  }

  // LCS line diff with deletion-first ties. Keep only two score rows and
  // one direction bit per cell, instead of a full matrix of LCS lengths.
  function diffLines(textA, textB) {
    const a = textA.split('\n'), b = textB.split('\n');
    const out = [];
    let prefix = 0;
    while (prefix < a.length && prefix < b.length && a[prefix] === b[prefix]) {
      out.push({ type: 'same', line: a[prefix++] });
    }
    const n = a.length - prefix, m = b.length - prefix;
    if (n === 0 || m === 0) {
      for (let i = prefix; i < a.length; i++) out.push({ type: 'del', line: a[i] });
      for (let j = prefix; j < b.length; j++) out.push({ type: 'add', line: b[j] });
      return out;
    }

    const directions = new Array(n);
    let next = new Uint32Array(m + 1), current = new Uint32Array(m + 1);
    for (let i = n - 1; i >= 0; i--) {
      const row = directions[i] = new Uint8Array(Math.ceil(m / 8));
      const line = a[prefix + i];
      for (let j = m - 1; j >= 0; j--) {
        if (line === b[prefix + j]) {
          current[j] = next[j + 1] + 1;
        } else if (next[j] >= current[j + 1]) {
          current[j] = next[j];
          row[j >> 3] |= 1 << (j & 7);
        } else {
          current[j] = current[j + 1];
        }
      }
      const swap = next; next = current; current = swap;
    }
    let i = 0, j = 0;
    while (i < n && j < m) {
      if (a[prefix + i] === b[prefix + j]) {
        out.push({ type: 'same', line: a[prefix + i] }); i++; j++;
      } else if (directions[i][j >> 3] & (1 << (j & 7))) {
        out.push({ type: 'del', line: a[prefix + i++] });
      } else {
        out.push({ type: 'add', line: b[prefix + j++] });
      }
    }
    while (i < n) out.push({ type: 'del', line: a[prefix + i++] });
    while (j < m) out.push({ type: 'add', line: b[prefix + j++] });
    return out;
  }

  global.ZPLDiff = {
    matchElements: matchElements,
    diffPair: diffPair,
    describeElement: describeElement,
    compareLabels: compareLabels,
    diffLines: diffLines,
  };
})(typeof globalThis !== 'undefined' ? globalThis : this);
