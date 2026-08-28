#!/usr/bin/env node
'use strict';

/*
 * Dependency-free contract tests for zplkit/backend-client.js.
 *
 * Run with:
 *   node test/backend-client-contract.test.js
 *
 * The browser client is deliberately loaded into a fresh VM context per test:
 * this makes the optional-backend state independent between cases without a
 * test framework, a DOM, or a real HTTP server.
 */
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');

const clientPath = path.join(__dirname, '..', 'zplkit', 'backend-client.js');
const clientSource = fs.readFileSync(clientPath, 'utf8');

function responseJson(value, status) {
  status = status == null ? 200 : status;
  return {
    ok: status >= 200 && status < 300,
    status: status,
    json: async function () { return value; },
    text: async function () {
      return typeof value === 'string' ? value : JSON.stringify(value);
    },
  };
}

function toPlain(value) {
  return JSON.parse(JSON.stringify(value));
}

function loadClient(fetchImpl, options) {
  options = options || {};
  const context = {
    AbortController: AbortController,
    clearTimeout: options.clearTimeout || clearTimeout,
    fetch: fetchImpl,
    setTimeout: options.setTimeout || setTimeout,
  };
  context.globalThis = context;
  vm.createContext(context);
  vm.runInContext(clientSource, context, { filename: clientPath });
  return context.BackendClient;
}

const tests = [];
function test(name, fn) {
  tests.push({ name: name, fn: fn });
}

test('treats 404s and network errors as an absent optional backend', async function () {
  const calls = [];
  const client = loadClient(async function (url) {
    calls.push(url);
    if (url === '../api/backend') return responseJson('not found', 404);
    throw new Error('network unavailable');
  });

  assert.deepEqual(Array.from(await client.probe()), []);
  assert.equal(client.hasCapability('print.zebra'), false);
  assert.deepEqual(calls, ['../api/backend', '../api/backend.php', 'api/backend', 'api/backend.php']);
});

test('falls back to a co-located legacy API when the parent route is absent', async function () {
  const calls = [];
  const client = loadClient(async function (url) {
    calls.push(url);
    if (url === 'api/backend') return responseJson({ capabilities: ['printers.list'] });
    return responseJson('not found', 404);
  });

  await client.probe();
  assert.deepEqual(calls, ['../api/backend', '../api/backend.php', 'api/backend']);
  assert.equal(client.endpoint('printers'), 'api/printers');
});

test('accepts a valid discovery document and gates unavailable operations', async function () {
  const calls = [];
  const client = loadClient(async function (url) {
    calls.push(url);
    if (url === '../api/backend') {
      return responseJson({ capabilities: ['printers.list'] });
    }
    throw new Error('unexpected request: ' + url);
  });

  assert.deepEqual(Array.from(await client.probe()), ['printers.list']);
  assert.equal(client.hasCapability('printers.list'), true);
  assert.equal(client.hasCapability('print.zebra'), false);
  assert.throws(function () { client.printZebra('^XA^XZ'); }, /print\.zebra/);
  assert.deepEqual(calls, ['../api/backend']);
});

test('rejects ambiguous print options before any physical-print request', async function () {
  const calls = [];
  const client = loadClient(async function (url) {
    calls.push(url);
    return responseJson({ capabilities: ['print.zebra'] });
  });

  await client.probe();
  assert.throws(function () { client.printZebra('^XA^XZ', { copies: 0 }); }, /copies/);
  assert.throws(function () { client.printZebra('^XA^XZ', { printerId: '  ' }); }, /printerId/);
  assert.throws(function () { client.printZebra('   '); }, /zpl/);
  assert.deepEqual(calls, ['../api/backend']);
});

test('marks a lost print response as delivery-unknown instead of retrying it', async function () {
  const calls = [];
  const client = loadClient(async function (url) {
    calls.push(url);
    if (url === '../api/backend') return responseJson({ capabilities: ['print.zebra'] });
    if (url === '../api/print') throw new Error('connection reset');
    throw new Error('unexpected request: ' + url);
  });

  await client.probe();
  await assert.rejects(client.printZebra('^XA^XZ'), function (error) {
    return error && error.code === 'delivery_unknown';
  });
  assert.deepEqual(calls, ['../api/backend', '../api/print']);
});

test('passes lossless generic documents with explicit physical metadata', async function () {
  let printBody = null;
  const client = loadClient(async function (url, options) {
    if (url === '../api/backend') return responseJson({ capabilities: ['print.generic'] });
    if (url === '../api/print') {
      printBody = JSON.parse(options.body);
      return responseJson({ ok: true, jobId: 'generic-1' });
    }
    throw new Error('unexpected request: ' + url);
  });

  await client.probe();
  await client.printGeneric({
    format: 'pdf', dataBase64: 'AA==', dpi: 609,
    pixelWidth: 2436, pixelHeight: 3654,
    widthMm: 101.6, heightMm: 152.4,
  }, { printerId: 'office-labels', copies: 2 });
  assert.deepEqual(toPlain(printBody), {
    target: { type: 'generic', printerId: 'office-labels' },
    document: {
      format: 'pdf', dataBase64: 'AA==', dpi: 609,
      pixelWidth: 2436, pixelHeight: 3654,
      widthMm: 101.6, heightMm: 152.4,
    },
    copies: 2,
  });
  assert.throws(function () {
    client.printGeneric({ format: 'pdf', dataBase64: 'AA==', pixelWidth: 1.5 });
  }, /pixelWidth/);
});

test('reports backend state, accepts legacy discovery, and caches a completed probe', async function () {
  const calls = [];
  const client = loadClient(async function (url) {
    calls.push(url);
    if (url === '../api/backend') {
      // apiVersion was not part of the original protocol. Existing deployed
      // backends must remain usable as version 1 after the client gains it.
      return responseJson({ name: 'Local Zebra Bridge', capabilities: ['printers.list'] });
    }
    throw new Error('unexpected request: ' + url);
  });

  assert.equal(client.endpoint('printers'), null);
  await client.probe();
  await client.probe();
  assert.deepEqual(calls, ['../api/backend']);
  assert.equal(client.endpoint('printers'), '../api/printers');

  const info = toPlain(client.info());
  assert.equal(info.status, 'available');
  assert.equal(info.available, true);
  assert.equal(info.apiVersion, 1);
  assert.equal(info.name, 'Local Zebra Bridge');
  assert.deepEqual(info.capabilities, ['printers.list']);
});

test('refreshes a completed discovery instead of requiring a page reload', async function () {
  let discoveryRequests = 0;
  const client = loadClient(async function (url) {
    if (url !== '../api/backend') throw new Error('unexpected request: ' + url);
    discoveryRequests += 1;
    return responseJson(discoveryRequests === 1
      ? { apiVersion: 1, name: 'Offline-compatible bridge', capabilities: [] }
      : { apiVersion: 1, name: 'Printer bridge', capabilities: ['print.zebra'] });
  });

  await client.probe();
  assert.equal(client.info().available, true);
  assert.equal(client.hasCapability('print.zebra'), false);

  await client.refresh();
  assert.equal(discoveryRequests, 2);
  assert.equal(client.info().name, 'Printer bridge');
  assert.equal(client.hasCapability('print.zebra'), true);
});

test('makes an in-flight optional-backend probe observable without blocking the editor', async function () {
  let finishDiscovery;
  const client = loadClient(function (url) {
    assert.equal(url, '../api/backend');
    return new Promise(function (resolve) { finishDiscovery = resolve; });
  });

  const pending = client.probe();
  assert.equal(client.info().status, 'probing');
  assert.equal(client.info().available, false);
  finishDiscovery(responseJson({ apiVersion: 1, capabilities: [] }));
  await pending;
  assert.equal(client.info().status, 'available');
});

test('uses the selected backend route and preserves valid printer metadata', async function () {
  const calls = [];
  const expected = [{
    id: 'warehouse-zebra',
    name: 'Warenausgang',
    type: 'zebra',
    default: true,
  }];
  const client = loadClient(async function (url) {
    calls.push(url);
    if (url === '../api/backend') return responseJson({ capabilities: ['printers.list'] });
    if (url === '../api/printers') return responseJson({ printers: expected });
    throw new Error('unexpected request: ' + url);
  });

  await client.probe();
  assert.deepEqual(toPlain(await client.listPrinters()), expected);
  assert.deepEqual(calls, ['../api/backend', '../api/printers']);
});

test('carries a printer\'s printhead resolution through, but never invents one', async function () {
  const client = loadClient(async function (url) {
    if (url === '../api/backend') return responseJson({ capabilities: ['printers.list'] });
    if (url === '../api/printers') {
      return responseJson({
        printers: [
          { id: 'p300', name: 'Versand', type: 'zebra', dpi: 300 },
          { id: 'p-unknown', name: 'Alt', type: 'zebra' },
          { id: 'p-bad', name: 'Kaputt', type: 'zebra', dpi: '300' }, // wrong JSON type
          { id: 'p-zero', name: 'Null', type: 'zebra', dpi: 0 },
        ],
      });
    }
    throw new Error('unexpected request: ' + url);
  });

  await client.probe();
  const printers = toPlain(await client.listPrinters());
  assert.equal(printers[0].dpi, 300);
  // "No dpi reported" must stay distinguishable from a guessed default, so
  // the key is absent rather than set to something plausible.
  assert.equal('dpi' in printers[1], false);
  assert.equal('dpi' in printers[2], false);
  assert.equal('dpi' in printers[3], false);
});

test('handles a malformed printer-list envelope without breaking the frontend', async function () {
  const client = loadClient(async function (url) {
    if (url === '../api/backend') return responseJson({ capabilities: ['printers.list'] });
    if (url === '../api/printers') return responseJson({ printers: 'not an array' });
    throw new Error('unexpected request: ' + url);
  });

  await client.probe();
  assert.deepEqual(Array.from(await client.listPrinters()), []);
});

test('does not call the printer route when printers.list was not advertised', async function () {
  const calls = [];
  const client = loadClient(async function (url) {
    calls.push(url);
    return responseJson({ capabilities: [] });
  });

  await client.probe();
  await assert.rejects(client.listPrinters(), /printers\.list/);
  assert.deepEqual(calls, ['../api/backend']);
});

test('exposes an unavailable state after every discovery candidate fails', async function () {
  const client = loadClient(async function () { return responseJson('not found', 404); });

  await client.probe();
  const info = toPlain(client.info());
  assert.equal(info.status, 'unavailable');
  assert.equal(info.available, false);
  assert.equal(info.apiVersion, null);
  assert.equal(info.name, null);
  assert.deepEqual(info.capabilities, []);
  assert.equal(client.endpoint('printers'), null);
});

test('gives printer lookup a bounded abortable deadline', async function () {
  const timers = [];
  let clearedTimer = null;
  const client = loadClient(function (url, options) {
    if (url === '../api/backend') return Promise.resolve(responseJson({ capabilities: ['printers.list'] }));
    if (url !== '../api/printers') return Promise.reject(new Error('unexpected request: ' + url));
    return new Promise(function (_resolve, reject) {
      options.signal.addEventListener('abort', function () { reject(new Error('request aborted')); });
    });
  }, {
    setTimeout: function (callback, ms) {
      const timer = { callback: callback, ms: ms, cleared: false };
      timers.push(timer);
      return timer;
    },
    clearTimeout: function (timer) {
      timer.cleared = true;
      clearedTimer = timer;
    },
  });

  await client.probe();
  const pending = client.listPrinters();
  const activeTimers = timers.filter(function (timer) { return !timer.cleared; });
  const activeTimer = activeTimers[activeTimers.length - 1];
  assert.ok(activeTimer, 'printer lookup should create a deadline');
  assert.ok(activeTimer.ms > 0 && activeTimer.ms <= 8000, 'deadline should stay short');
  activeTimer.callback();
  await assert.rejects(pending, /Druckerliste|timeout|Sekunden/i);
  assert.equal(clearedTimer, activeTimer);
});

async function main() {
  let failures = 0;
  for (const current of tests) {
    try {
      await current.fn();
      process.stdout.write('✓ ' + current.name + '\n');
    } catch (err) {
      failures += 1;
      process.stderr.write('✗ ' + current.name + '\n' + (err.stack || err) + '\n');
    }
  }
  if (failures) {
    process.stderr.write('\n' + failures + ' backend-client contract test(s) failed.\n');
    process.exitCode = 1;
  }
}

main();
