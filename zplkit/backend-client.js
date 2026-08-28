/* ZPLkit — backend-client: optional interface to a print/label
   backend (Zebra printing, generic-printer printing, an XML "label server"
   bridge, ...). This module deliberately contains only the browser-side
   protocol: it has no idea which backend is deployed. The bundled Go server
   can provide the Zebra/XML subset when started with `-printers`; a static
   or LAMP deployment may still have no print backend at all (see README).

   Discovery is short, cached and race-safe. An absent, slow or incompatible
   backend resolves to an empty capability list instead of rejecting, so the
   core editor remains fully usable from ordinary static
   hosting and file:// URLs. Calls that could cause a physical print have no
   client-side deadline or automatic retry: after a request is sent, a
   timeout cannot distinguish "not delivered" from "already printed".

   Depends on nothing. Attaches global BackendClient. */
(function (global) {
  'use strict';

  const API_VERSION = 1;
  // ZPL-Studio is served at /studio/ in the repository's static layout while
  // the optional Go routes live at /api/. Try that layout first, then retain
  // the historical co-located api/ layout for existing standalone hosts.
  const DISCOVERY_CANDIDATES = [
    { base: '../api/', suffix: '' },
    { base: '../api/', suffix: '.php' },
    { base: 'api/', suffix: '' },
    { base: 'api/', suffix: '.php' },
  ];
  const PROBE_TIMEOUT_MS = 2000;
  const PRINTER_LIST_TIMEOUT_MS = 8000;
  const MAX_CAPABILITY_LENGTH = 128;

  const state = {
    status: 'idle', // idle | probing | available | unavailable
    probed: false,
    apiBase: null, // '../api/' or 'api/' once a backend answers; null = none found
    suffix: null, // '' or '.php' once a backend answers; null = not probed or none found
    capabilities: [],
    apiVersion: null,
    name: null,
    probePromise: null,
  };

  function makeError(message, code, extra) {
    const error = new Error(message);
    error.name = 'BackendClientError';
    error.code = code || 'backend_error';
    if (extra) Object.keys(extra).forEach(function (key) { error[key] = extra[key]; });
    return error;
  }

  function endpointUrl(name) {
    if (state.apiBase == null || state.suffix == null) return null;
    return state.apiBase + name + state.suffix;
  }

  // Public for adjacent optional APIs (the template library, integrations)
  // after discovery. It never accepts a URL or path from a caller, so the
  // browser cannot be turned into an arbitrary backend proxy.
  function endpoint(name) {
    if (typeof name !== 'string' || !/^[a-z][a-z0-9-]*$/.test(name)) return null;
    return endpointUrl(name);
  }

  function normalizeCapabilities(raw) {
    if (!Array.isArray(raw)) return null;
    const seen = Object.create(null);
    const normalized = [];
    raw.forEach(function (capability) {
      if (typeof capability !== 'string' || capability.length === 0 || capability.length > MAX_CAPABILITY_LENGTH || capability.trim() !== capability || seen[capability]) return;
      seen[capability] = true;
      normalized.push(capability);
    });
    return normalized;
  }

  // apiVersion was added after the first public client. A missing value is
  // deliberately interpreted as v1 so already deployed PHP/Go backends keep
  // working; an explicitly unsupported version is ignored safely.
  function normalizeDiscovery(data) {
    if (!data || typeof data !== 'object' || Array.isArray(data)) return null;
    const capabilities = normalizeCapabilities(data.capabilities);
    if (!capabilities) return null;
    const version = Object.prototype.hasOwnProperty.call(data, 'apiVersion') ? data.apiVersion : API_VERSION;
    if (!Number.isInteger(version) || version < 1 || version > API_VERSION) return null;
    return {
      apiVersion: version,
      capabilities: capabilities,
      name: typeof data.name === 'string' && data.name.trim() ? data.name.trim() : null,
    };
  }

  // A Promise.race alone leaves a rejected late fetch unobserved in browsers
  // without AbortController. This wrapper handles both paths and gives all
  // harmless lookup/probe requests a deterministic completion time.
  function fetchWithTimeout(url, options, timeoutMs, timeoutMessage) {
    const controller = typeof AbortController === 'undefined' ? null : new AbortController();
    const requestOptions = controller ? Object.assign({}, options, { signal: controller.signal }) : options;
    return new Promise(function (resolve, reject) {
      let settled = false;
      const timer = setTimeout(function () {
        if (settled) return;
        settled = true;
        clearTimeout(timer);
        if (controller) controller.abort();
        reject(makeError(timeoutMessage, 'timeout'));
      }, timeoutMs);
      function settle(fn, value) {
        if (settled) return;
        settled = true;
        clearTimeout(timer);
        fn(value);
      }
      try {
        Promise.resolve(fetch(url, requestOptions)).then(function (response) {
          settle(resolve, response);
        }, function (error) {
          settle(reject, error);
        });
      } catch (error) {
        settle(reject, error);
      }
    });
  }

  function readJsonWithDeadline(response, timeoutMs, timeoutMessage) {
    return new Promise(function (resolve, reject) {
      let settled = false;
      const timer = setTimeout(function () {
        if (settled) return;
        settled = true;
        reject(makeError(timeoutMessage, 'timeout'));
      }, timeoutMs);
      function settle(fn, value) {
        if (settled) return;
        settled = true;
        clearTimeout(timer);
        fn(value);
      }
      try {
        Promise.resolve(response.json()).then(function (data) { settle(resolve, data); }, function (error) { settle(reject, error); });
      } catch (error) {
        settle(reject, error);
      }
    });
  }

  function becomeUnavailable() {
    state.status = 'unavailable';
    state.probed = true;
    state.apiBase = null;
    state.suffix = null;
    state.capabilities = [];
    state.apiVersion = null;
    state.name = null;
  }

  async function discover() {
    for (const candidate of DISCOVERY_CANDIDATES) {
      const url = candidate.base + 'backend' + candidate.suffix;
      try {
        const response = await fetchWithTimeout(
          url,
          { cache: 'no-store', headers: { 'Accept': 'application/json' } },
          PROBE_TIMEOUT_MS,
          'Backend-Erkennung hat zu lange gedauert'
        );
        if (!response.ok) continue;
        const descriptor = normalizeDiscovery(await readJsonWithDeadline(
          response,
          PROBE_TIMEOUT_MS,
          'Backend-Erkennung hat zu lange gedauert'
        ));
        if (!descriptor) continue;
        return { apiBase: candidate.base, suffix: candidate.suffix, descriptor: descriptor };
      } catch (e) { /* absent, malformed, offline or slow is a normal optional-backend outcome */ }
    }
    return null;
  }

  // Safe to call many times. Concurrent callers share one request cycle;
  // later calls use the cached result. refresh() is the explicit opt-in way
  // to re-detect after a backend was started or restarted.
  function probe(options) {
    const force = !!(options && options.force);
    if (state.probePromise) return state.probePromise;
    if (state.probed && !force) return Promise.resolve(capabilities());

    state.status = 'probing';
    const pending = discover().then(function (found) {
      if (!found) {
        becomeUnavailable();
        return [];
      }
      state.status = 'available';
      state.probed = true;
      state.apiBase = found.apiBase;
      state.suffix = found.suffix;
      state.capabilities = found.descriptor.capabilities;
      state.apiVersion = found.descriptor.apiVersion;
      state.name = found.descriptor.name;
      return capabilities();
    }, function () {
      // discover() is deliberately defensive already. This final guard keeps
      // the optional feature non-fatal even if a browser implementation has
      // an unexpected fetch/body error.
      becomeUnavailable();
      return [];
    });
    state.probePromise = pending;
    pending.then(function () {
      if (state.probePromise === pending) state.probePromise = null;
    }, function () {
      if (state.probePromise === pending) state.probePromise = null;
    });
    return pending;
  }

  function refresh() { return probe({ force: true }); }
  function capabilities() { return state.capabilities.slice(); }
  function hasCapability(name) { return state.capabilities.indexOf(name) !== -1; }
  function info() {
    return {
      status: state.status,
      available: state.status === 'available',
      apiVersion: state.apiVersion,
      name: state.name,
      capabilities: capabilities(),
    };
  }

  function requireCapability(name) {
    if (!hasCapability(name)) {
      throw makeError('BackendClient: "' + name + '" wird von diesem Backend nicht angeboten' +
        (state.probed ? '' : ' (probe() wurde noch nicht aufgerufen)'), 'capability_unavailable');
    }
  }

  // Reads either a JSON success body (2xx) or a plain-text error body
  // (anything else). The optional ZPL-Error-Code header adds a stable,
  // localizable error class without breaking the deliberately simple
  // plain-text error contract used by existing backends.
  async function readJsonOrError(res) {
    if (res.ok) {
      try {
        return await res.json();
      } catch (error) {
        throw makeError('Backend hat keine gültige JSON-Antwort geliefert', 'invalid_response', { cause: error });
      }
    }
    const body = await res.text().catch(function () { return ''; });
    const code = res.headers && typeof res.headers.get === 'function' ? res.headers.get('ZPL-Error-Code') : null;
    const retryAfter = res.headers && typeof res.headers.get === 'function' ? res.headers.get('Retry-After') : null;
    throw makeError(body || ('Server antwortete mit ' + res.status), code || 'http_error', {
      status: res.status,
      retryAfter: retryAfter,
    });
  }

  function normalizePrinterList(raw) {
    if (!raw || !Array.isArray(raw.printers)) return [];
    return raw.printers.reduce(function (printers, printer) {
      if (!printer || typeof printer !== 'object' || typeof printer.id !== 'string' || !printer.id || printer.id.trim() !== printer.id) return printers;
      const normalized = {
        id: printer.id,
        name: typeof printer.name === 'string' && printer.name ? printer.name : printer.id,
        type: typeof printer.type === 'string' ? printer.type : '',
        default: printer.default === true,
      };
      // Optional printhead resolution. Only carried through when the backend
      // states a usable one, so a consumer can tell "no dpi reported" apart
      // from a guessed default - and so a backend that never reported dpi
      // keeps producing exactly the descriptor it did before.
      if (typeof printer.dpi === 'number' && isFinite(printer.dpi) && printer.dpi > 0) {
        normalized.dpi = printer.dpi;
      }
      printers.push(normalized);
      return printers;
    }, []);
  }

  // printers.list: GET api/printers -> {"printers":[{id,name,type,dpi?}]}
  // `type` is 'zebra' (accepts raw ZPL directly) or 'generic' (needs an
  // already-rendered document - see printGeneric). `dpi` is optional; when
  // present it is the printhead resolution the labels sent there are
  // expected to be laid out for.
  async function listPrinters() {
    requireCapability('printers.list');
    const res = await fetchWithTimeout(
      endpointUrl('printers'),
      { cache: 'no-store', headers: { 'Accept': 'application/json' } },
      PRINTER_LIST_TIMEOUT_MS,
      'Druckerliste konnte nicht innerhalb von 8 Sekunden geladen werden'
    );
    const data = await readJsonOrError(res);
    return normalizePrinterList(data);
  }

  function normalizedPrintOptions(options) {
    const opts = options || {};
    const hasCopies = Object.prototype.hasOwnProperty.call(opts, 'copies');
    const copies = hasCopies ? opts.copies : 1;
    if (!Number.isInteger(copies) || copies < 1 || copies > 99) {
      throw makeError('copies must be an integer between 1 and 99', 'invalid_request');
    }
    const printerId = Object.prototype.hasOwnProperty.call(opts, 'printerId') ? opts.printerId : null;
    if (printerId !== null && printerId !== undefined && (typeof printerId !== 'string' || !printerId || printerId.trim() !== printerId)) {
      throw makeError('printerId must be a non-empty, trimmed string or null', 'invalid_request');
    }
    return { copies: copies, printerId: printerId == null ? null : printerId };
  }

  function requireZPL(zpl) {
    if (typeof zpl !== 'string' || !zpl.trim()) {
      throw makeError('zpl must be a non-empty string', 'invalid_request');
    }
    return zpl;
  }

  function deliveryUncertain(error) {
    if (error && error.code && error.code !== 'invalid_response' && error.code !== 'http_error') return error;
    return makeError(
      'Die Übertragung konnte nicht bestätigt werden; bitte den Drucker prüfen, bevor der Auftrag erneut gesendet wird.',
      'delivery_unknown',
      { cause: error }
    );
  }

  // Shared by printZebra/printGeneric - POST api/print, JSON body, one
  // of two shapes (see README's contract table). Response: {ok, jobId}.
  async function postPrint(body) {
    let res;
    try {
      res = await fetch(endpointUrl('print'), {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', 'Accept': 'application/json' },
        body: JSON.stringify(body),
      });
    } catch (error) {
      throw deliveryUncertain(error);
    }
    try {
      return await readJsonOrError(res);
    } catch (error) {
      // A successful HTTP status with an unreadable response can still mean
      // that the backend accepted the print job. Do not encourage a blind
      // retry in that ambiguous case.
      if (res.ok && error && error.code === 'invalid_response') throw deliveryUncertain(error);
      if (!res.ok && error && error.code === 'http_error' && res.status >= 500) throw deliveryUncertain(error);
      throw error;
    }
  }

  // print.zebra: sends raw ZPL text for the backend to forward as-is to a
  // Zebra (or Zebra-compatible) printer - typically a raw TCP/9100 send,
  // but that's the backend's concern, not this client's.
  function printZebra(zpl, opts) {
    requireCapability('print.zebra');
    const options = normalizedPrintOptions(opts);
    return postPrint({
      target: { type: 'zebra', printerId: options.printerId },
      zpl: requireZPL(zpl),
      copies: options.copies,
    });
  }

  // print.generic: sends an ALREADY-RENDERED document (PDF/PNG/JPG - see
  // this editor's own export menu for how to produce one, e.g. its lossless
  // 1-bit PDF path) for the backend to hand to a normal printer
  // (CUPS/IPP/OS print queue/...). The optional dimensions make a PNG
  // self-describing even when a third-party backend ignores browser canvas
  // metadata; PDF already carries the same physical page size internally.
  // The backend never needs to understand ZPL or labels for this path.
  function normalizeGenericDocument(doc) {
    if (!doc || typeof doc.format !== 'string' || typeof doc.dataBase64 !== 'string' || !doc.format || !doc.dataBase64) {
      throw makeError('BackendClient.printGeneric: doc needs {format, dataBase64}', 'invalid_request');
    }
    const normalized = { format: doc.format, dataBase64: doc.dataBase64 };
    const positiveNumberFields = ['dpi', 'widthMm', 'heightMm'];
    const positiveIntegerFields = ['pixelWidth', 'pixelHeight'];
    positiveNumberFields.forEach(function (field) {
      if (!Object.prototype.hasOwnProperty.call(doc, field)) return;
      if (typeof doc[field] !== 'number' || !isFinite(doc[field]) || doc[field] <= 0) {
        throw makeError('BackendClient.printGeneric: ' + field + ' must be a positive number', 'invalid_request');
      }
      normalized[field] = doc[field];
    });
    positiveIntegerFields.forEach(function (field) {
      if (!Object.prototype.hasOwnProperty.call(doc, field)) return;
      if (!Number.isInteger(doc[field]) || doc[field] <= 0) {
        throw makeError('BackendClient.printGeneric: ' + field + ' must be a positive integer', 'invalid_request');
      }
      normalized[field] = doc[field];
    });
    return normalized;
  }

  function printGeneric(doc, opts) {
    requireCapability('print.generic');
    const document = normalizeGenericDocument(doc);
    const options = normalizedPrintOptions(opts);
    return postPrint({
      target: { type: 'generic', printerId: options.printerId },
      document: document,
      copies: options.copies,
    });
  }

  // Minimal XML escaping for the two places free text lands in the
  // envelope below (a CDATA section still needs protecting against a
  // payload that itself contains "]]>", and the printerId attribute needs
  // normal attribute escaping - ZPL text otherwise passes through CDATA
  // completely unescaped, which is the whole point of using CDATA for it).
  function escapeXmlAttr(s) {
    return String(s).replace(/&/g, '&amp;').replace(/"/g, '&quot;').replace(/</g, '&lt;');
  }
  function escapeCdata(s) {
    return String(s).replace(/]]>/g, ']]]]><![CDATA[>');
  }

  // labelserver.xml: bridges to a backend that itself talks to a real
  // third-party "label server" product via HTTP+XML - see README for the
  // full rationale. This envelope is this project's OWN default; a real
  // integration's backend is expected to translate between this and
  // whatever its actual downstream system needs, not the other way round.
  async function printViaLabelServerXml(zpl, opts) {
    requireCapability('labelserver.xml');
    const options = normalizedPrintOptions(opts);
    const payload = requireZPL(zpl);
    const printerAttr = options.printerId ? ' id="' + escapeXmlAttr(options.printerId) + '"' : '';
    const xml = '<?xml version="1.0" encoding="UTF-8"?>\n' +
      '<PrintJob>\n' +
      '  <Printer' + printerAttr + '/>\n' +
      '  <Copies>' + options.copies + '</Copies>\n' +
      '  <Zpl><![CDATA[' + escapeCdata(payload) + ']]></Zpl>\n' +
      '</PrintJob>\n';
    let res;
    try {
      res = await fetch(endpointUrl('labelserver'), {
        method: 'POST',
        headers: { 'Content-Type': 'application/xml', 'Accept': 'application/xml' },
        body: xml,
      });
    } catch (error) {
      throw deliveryUncertain(error);
    }
    if (!res.ok) {
      const body = await res.text().catch(function () { return ''; });
      const code = res.headers && typeof res.headers.get === 'function' ? res.headers.get('ZPL-Error-Code') : null;
      const error = makeError(body || ('Server antwortete mit ' + res.status), code || 'http_error', { status: res.status });
      if (!code && res.status >= 500) throw deliveryUncertain(error);
      throw error;
    }
    let text;
    try {
      text = await res.text();
    } catch (error) {
      throw deliveryUncertain(error);
    }
    // Minimal, dependency-free attribute pull - the response is our own
    // fixed, simple envelope (see README), not arbitrary third-party XML,
    // so a full parser would be pure overhead for two attributes.
    const ok = /<PrintJobResult\b[^>]*\bok="true"/.test(text);
    const jobIdMatch = /\bjobId="([^"]*)"/.exec(text);
    if (!ok) throw deliveryUncertain(makeError('Backend hat keine gültige XML-Druckantwort geliefert', 'invalid_response'));
    return { ok: true, jobId: jobIdMatch ? jobIdMatch[1] : null };
  }

  global.BackendClient = {
    probe: probe,
    refresh: refresh,
    info: info,
    endpoint: endpoint,
    capabilities: capabilities,
    hasCapability: hasCapability,
    listPrinters: listPrinters,
    printZebra: printZebra,
    printGeneric: printGeneric,
    printViaLabelServerXml: printViaLabelServerXml,
  };
  if (typeof module === 'object' && module && module.exports) module.exports = global.BackendClient;
})(typeof globalThis !== 'undefined' ? globalThis : this);
