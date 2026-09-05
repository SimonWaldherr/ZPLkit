/* Portable Studio links: JSON -> UTF-8 -> zlib/DEFLATE -> unpadded Base64URL.
   No DOM, network or storage access. Browser / Node 22+ Web APIs only.
   The envelope is deliberately independent of the editor's internal model. */
(function (global) {
  'use strict';
  const PREFIX = '#share=v1.z.';
  const LIMITS = Object.freeze({ warningUrlLength: 8000, maxUrlLength: 131072,
    maxPayloadBytes: 1048576, maxLabels: 256 });

  function fail(code, message) {
    const error = new Error(message);
    error.name = 'ZPLSharingError';
    error.code = code;
    return error;
  }
  function invalid() { return fail('invalid', 'Invalid sharing payload.'); }
  function tooLarge() { return fail('tooLarge', 'Sharing limit exceeded. Use a ZPL file instead.'); }

  function validatePayload(value) {
    if (!value || typeof value !== 'object' || Array.isArray(value) ||
        typeof value.zpl !== 'string' || !value.zpl.trim()) throw invalid();
    if (value.zpl.length > LIMITS.maxPayloadBytes) throw tooLarge();
    const result = { zpl: value.zpl };
    if (value.dpi !== undefined) {
      if (!Array.isArray(value.dpi) || !value.dpi.length || value.dpi.length > LIMITS.maxLabels ||
          value.dpi.some(dpi => !Number.isInteger(dpi) || dpi < 50 || dpi > 2400)) throw invalid();
      result.dpi = value.dpi.slice();
    }
    result.activeLabel = value.activeLabel === undefined ? 0 : value.activeLabel;
    if (!Number.isInteger(result.activeLabel) || result.activeLabel < 0 || result.activeLabel >= LIMITS.maxLabels ||
        (result.dpi && result.activeLabel >= result.dpi.length)) throw invalid();
    if (value.name !== undefined) {
      if (typeof value.name !== 'string' || value.name.length > 200 || /[\x00-\x1f\x7f/\\]/.test(value.name)) throw invalid();
      result.name = value.name;
    }
    return result;
  }

  function toBase64Url(bytes) {
    let binary = '';
    for (let i = 0; i < bytes.length; i += 8192) binary += String.fromCharCode.apply(null, bytes.subarray(i, i + 8192));
    return btoa(binary).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
  }
  function fromBase64Url(text) {
    if (!text || !/^[A-Za-z0-9_-]+$/.test(text) || text.length % 4 === 1) throw invalid();
    let binary;
    try { binary = atob(text.replace(/-/g, '+').replace(/_/g, '/') + '='.repeat((4 - text.length % 4) % 4)); }
    catch (_) { throw invalid(); }
    const bytes = Uint8Array.from(binary, c => c.charCodeAt(0));
    if (toBase64Url(bytes) !== text) throw invalid(); // reject noncanonical trailing bits
    return bytes;
  }

  // Count output as it arrives, before concatenating or parsing it. In
  // particular, do not use Response(...).arrayBuffer() for untrusted input.
  async function transform(bytes, decompress) {
    const Stream = decompress ? global.DecompressionStream : global.CompressionStream;
    if (typeof Stream !== 'function') throw fail('unsupported', 'Compression Streams API is unavailable.');
    const reader = new Blob([bytes]).stream().pipeThrough(new Stream('deflate')).getReader();
    const chunks = [];
    let length = 0;
    const limit = decompress ? LIMITS.maxPayloadBytes : LIMITS.maxUrlLength;
    try {
      for (;;) {
        const part = await reader.read();
        if (part.done) break;
        length += part.value.length;
        if (length > limit) {
          await reader.cancel().catch(function () {});
          throw tooLarge();
        }
        chunks.push(part.value);
      }
    } catch (error) {
      if (error.name === 'ZPLSharingError') throw error;
      throw fail('corrupt', 'The compressed sharing data is damaged or incomplete.');
    } finally { reader.releaseLock(); }
    const output = new Uint8Array(length);
    let offset = 0;
    chunks.forEach(chunk => { output.set(chunk, offset); offset += chunk.length; });
    return output;
  }

  async function encodeFragment(payload) {
    const bytes = new TextEncoder().encode(JSON.stringify(validatePayload(payload)));
    if (bytes.length > LIMITS.maxPayloadBytes) throw tooLarge();
    const fragment = PREFIX + toBase64Url(await transform(bytes, false));
    if (fragment.length > LIMITS.maxUrlLength) throw tooLarge();
    return fragment;
  }
  async function decodeFragment(fragment) {
    if (typeof fragment !== 'string' || !fragment.startsWith('#share=')) throw invalid();
    if (fragment.length > LIMITS.maxUrlLength) throw tooLarge();
    if (!fragment.startsWith(PREFIX)) throw fail('version', 'Unsupported sharing version or compression format.');
    const bytes = await transform(fromBase64Url(fragment.slice(PREFIX.length)), true);
    let value;
    try { value = JSON.parse(new TextDecoder('utf-8', { fatal: true }).decode(bytes)); }
    catch (_) { throw invalid(); }
    return validatePayload(value);
  }
  async function createUrl(studioUrl, payload) {
    let url;
    try { url = new URL(studioUrl); } catch (_) { throw fail('url', 'An absolute HTTP(S) Studio URL is required.'); }
    if (!/^https?:$/.test(url.protocol) || url.username || url.password) throw fail('url', 'An absolute HTTP(S) Studio URL is required.');
    url.hash = await encodeFragment(payload);
    const result = url.href;
    if (result.length > LIMITS.maxUrlLength) throw tooLarge();
    return result;
  }

  // Optional parser integration for Studio/full-bundle consumers. Decoding a
  // fragment alone never executes ZPL or loads external assets.
  function toDocument(payload) {
    const data = validatePayload(payload);
    if (!global.ZPLParser) throw fail('parser', 'ZPLParser is required to open a shared document.');
    // Bound parsing work before the parser allocates label models.
    if ((data.zpl.match(/\^XA/g) || []).length > LIMITS.maxLabels) throw tooLarge();
    const doc = global.ZPLParser.parseDocument(data.zpl);
    if (doc.labels.length > LIMITS.maxLabels || data.activeLabel >= doc.labels.length ||
        (data.dpi && data.dpi.length !== doc.labels.length)) throw invalid();
    doc.labels.forEach(function (label, index) {
      label.settings.dpi = data.dpi ? data.dpi[index] : 203;
      label.sourceFileName = data.name || null;
    });
    doc.activeIndex = data.activeLabel;
    return doc;
  }

  const api = { limits: LIMITS, encodeFragment: encodeFragment, decodeFragment: decodeFragment,
    createUrl: createUrl, toDocument: toDocument };
  global.ZPLSharing = api;
  if (typeof module === 'object' && module && module.exports) module.exports = api;
})(typeof globalThis !== 'undefined' ? globalThis : this);
