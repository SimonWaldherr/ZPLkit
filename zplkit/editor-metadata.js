/* ZPLkit editor metadata embedded in printer-safe ^FX comments.
   The printable ZPL remains the source of truth; this sidecar only restores
   editor concepts (guides, layer names/locks/groups and hidden elements). */
(function (global) {
  'use strict';

  const PREFIX = '^FXZPLKIT_META:';
  const VERSION = 1;
  const CHUNK_SIZE = 480;
  const MAX_ENCODED_SIZE = 2 * 1024 * 1024;
  const B64 = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789+/';

  function utf8Encode(text) {
    const s = unescape(encodeURIComponent(text));
    const out = new Uint8Array(s.length);
    for (let i = 0; i < s.length; i++) out[i] = s.charCodeAt(i);
    return out;
  }

  function utf8Decode(bytes) {
    let s = '';
    for (let i = 0; i < bytes.length; i += 0x8000) {
      s += String.fromCharCode.apply(null, bytes.subarray(i, i + 0x8000));
    }
    return decodeURIComponent(escape(s));
  }

  function base64UrlEncode(bytes) {
    let out = '';
    for (let i = 0; i < bytes.length; i += 3) {
      const n = (bytes[i] << 16) | ((bytes[i + 1] || 0) << 8) | (bytes[i + 2] || 0);
      out += B64[(n >>> 18) & 63] + B64[(n >>> 12) & 63] +
        (i + 1 < bytes.length ? B64[(n >>> 6) & 63] : '=') +
        (i + 2 < bytes.length ? B64[n & 63] : '=');
    }
    return out.replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
  }

  function base64UrlDecode(text) {
    if (!/^[A-Za-z0-9_-]*$/.test(text)) throw new Error('invalid base64url');
    let src = text.replace(/-/g, '+').replace(/_/g, '/');
    while (src.length % 4) src += '=';
    const bytes = [];
    for (let i = 0; i < src.length; i += 4) {
      const a = B64.indexOf(src[i]);
      const b = B64.indexOf(src[i + 1]);
      const c = src[i + 2] === '=' ? 0 : B64.indexOf(src[i + 2]);
      const d = src[i + 3] === '=' ? 0 : B64.indexOf(src[i + 3]);
      if (a < 0 || b < 0 || c < 0 || d < 0) throw new Error('invalid base64url');
      const n = (a << 18) | (b << 12) | (c << 6) | d;
      bytes.push((n >>> 16) & 255);
      if (src[i + 2] !== '=') bytes.push((n >>> 8) & 255);
      if (src[i + 3] !== '=') bytes.push(n & 255);
    }
    return new Uint8Array(bytes);
  }

  function crc32(bytes) {
    let crc = 0xFFFFFFFF;
    for (let i = 0; i < bytes.length; i++) {
      crc ^= bytes[i];
      for (let bit = 0; bit < 8; bit++) crc = (crc >>> 1) ^ ((crc & 1) ? 0xEDB88320 : 0);
    }
    return ((crc ^ 0xFFFFFFFF) >>> 0).toString(16).toUpperCase().padStart(8, '0');
  }

  function jsonReplacer(key, value) {
    if (value && typeof value === 'object' && typeof value.length === 'number' &&
        value.BYTES_PER_ELEMENT === 1 && !(value instanceof Array)) {
      return { $u8: Array.from(value) };
    }
    return value;
  }

  function jsonReviver(key, value) {
    if (value && typeof value === 'object' && Array.isArray(value.$u8) && Object.keys(value).length === 1) {
      return new Uint8Array(value.$u8);
    }
    return value;
  }

  function extract(label) {
    const elements = label.elements || [];
    const g = label.editorGuides || {};
    const hasGuides = (g.vertical && g.vertical.length) || (g.horizontal && g.horizontal.length) ||
      g.visible === false || g.snap === false;
    const hasLayers = elements.some(function (el) {
      return !!(el.hidden || el.locked || el.groupId || el.name);
    });
    if (!hasGuides && !hasLayers) return null;

    let visibleIndex = 0;
    const sequence = elements.map(function (el) {
      if (el.hidden) return { hiddenElement: el };
      const item = { visibleIndex: visibleIndex++, id: el.id };
      if (el.name) item.name = el.name;
      if (el.locked) item.locked = true;
      if (el.groupId) item.groupId = el.groupId;
      return item;
    });
    return {
      version: VERSION,
      guides: {
        visible: g.visible !== false,
        snap: g.snap !== false,
        vertical: Array.from(g.vertical || []),
        horizontal: Array.from(g.horizontal || []),
      },
      elements: sequence,
    };
  }

  function encode(label) {
    const metadata = extract(label);
    if (!metadata) return [];
    const bytes = utf8Encode(JSON.stringify(metadata, jsonReplacer));
    const payload = base64UrlEncode(bytes);
    if (payload.length > MAX_ENCODED_SIZE) throw new Error('ZPLkit editor metadata exceeds 2 MiB');
    const checksum = crc32(bytes);
    const total = Math.ceil(payload.length / CHUNK_SIZE);
    const commands = [];
    for (let i = 0; i < total; i++) {
      commands.push(PREFIX + VERSION + ':' + (i + 1) + '/' + total + ':' + checksum + ':' +
        payload.slice(i * CHUNK_SIZE, (i + 1) * CHUNK_SIZE) + '^FS');
    }
    return commands;
  }

  function parseChunk(raw) {
    const clean = String(raw || '').replace(/[\r\n]+$/, '');
    if (clean.indexOf(PREFIX) !== 0) return null;
    const m = /^\^FXZPLKIT_META:(\d+):(\d+)\/(\d+):([0-9A-Fa-f]{8}):([A-Za-z0-9_-]+)(?:\^FS)?$/.exec(clean);
    if (!m) return { invalid: true, raw: clean };
    return { version: +m[1], part: +m[2], total: +m[3], checksum: m[4].toUpperCase(), payload: m[5] };
  }

  function decode(chunks) {
    if (!chunks.length || chunks.some(function (c) { return !c || c.invalid; })) return null;
    const first = chunks[0];
    if (first.version !== VERSION || first.total < 1 || first.total > 10000 || chunks.length !== first.total) return null;
    const parts = new Array(first.total);
    for (let i = 0; i < chunks.length; i++) {
      const c = chunks[i];
      if (c.version !== first.version || c.total !== first.total || c.checksum !== first.checksum ||
          c.part < 1 || c.part > c.total || parts[c.part - 1] !== undefined) return null;
      parts[c.part - 1] = c.payload;
    }
    const payload = parts.join('');
    if (payload.length > MAX_ENCODED_SIZE) return null;
    try {
      const bytes = base64UrlDecode(payload);
      if (crc32(bytes) !== first.checksum) return null;
      const data = JSON.parse(utf8Decode(bytes), jsonReviver);
      return data && data.version === VERSION && Array.isArray(data.elements) ? data : null;
    } catch (error) { return null; }
  }

  function apply(label, data) {
    if (!data || !Array.isArray(data.elements)) return false;
    const parsed = label.elements || [];
    const used = {};
    const restored = [];
    for (let i = 0; i < data.elements.length; i++) {
      const item = data.elements[i];
      if (item && item.hiddenElement && typeof item.hiddenElement.type === 'string') {
        item.hiddenElement.hidden = true;
        restored.push(item.hiddenElement);
      } else if (item && Number.isInteger(item.visibleIndex) && item.visibleIndex >= 0 &&
                 item.visibleIndex < parsed.length && !used[item.visibleIndex]) {
        used[item.visibleIndex] = true;
        const el = parsed[item.visibleIndex];
        if (typeof item.id === 'string' && item.id) el.id = item.id;
        if (typeof item.name === 'string' && item.name) el.name = item.name;
        if (item.locked) el.locked = true;
        if (typeof item.groupId === 'string' && item.groupId) el.groupId = item.groupId;
        el.hidden = false;
        restored.push(el);
      } else return false;
    }
    if (Object.keys(used).length !== parsed.length) return false;
    const g = data.guides || {};
    label.editorGuides = {
      visible: g.visible !== false,
      snap: g.snap !== false,
      vertical: Array.isArray(g.vertical) ? g.vertical.filter(Number.isFinite) : [],
      horizontal: Array.isArray(g.horizontal) ? g.horizontal.filter(Number.isFinite) : [],
    };
    label.elements = restored;
    return true;
  }

  global.ZPLEditorMetadata = { PREFIX, VERSION, encode, extract, parseChunk, decode, apply };
})(typeof globalThis !== 'undefined' ? globalThis : this);
