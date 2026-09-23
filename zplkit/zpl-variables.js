/* ZPLkit variables: resolve $NAME$ fields in label models before generation.
   No DOM or model dependency. Never substitute into generated/raw ZPL. */
(function (global) {
  'use strict';

  const TOKEN = /\$([A-Za-z0-9_]+)\$/g;
  const own = function (object, key) { return Object.prototype.hasOwnProperty.call(object, key); };
  const blank = function (value) { return value == null || value === ''; };

  function namesIn(text) {
    const names = new Set();
    if (typeof text === 'string') text.replace(TOKEN, function (_, name) { names.add(name); return _; });
    return Array.from(names);
  }
  function contentField(el) {
    return el.type === 'text' ? 'text' : (el.type === 'barcode' ? 'data' : null);
  }
  function discover(label) {
    const names = new Set();
    (label.elements || []).forEach(function (el) {
      const field = contentField(el);
      if (field) namesIn(el[field]).forEach(function (name) { names.add(name); });
    });
    return Array.from(names).sort();
  }

  // Exact own keys win; otherwise the first own key with matching case wins.
  // Build the index once per record, not once per occurrence of a variable.
  function indexRow(row, caseSensitive) {
    if (row == null) row = {};
    if (typeof row !== 'object' || Array.isArray(row)) throw new TypeError('Variables: data must be a record');
    const folded = new Map();
    if (!caseSensitive) Object.keys(row).forEach(function (key) {
      const lower = key.toLowerCase();
      if (!folded.has(lower)) folded.set(lower, row[key]);
    });
    return function (name) {
      if (own(row, name) && row[name] !== undefined) return row[name];
      return caseSensitive ? undefined : folded.get(name.toLowerCase());
    };
  }
  function lookup(row, name, options) {
    return indexRow(row, options && options.caseSensitive)(name);
  }

  function configuration(options) {
    options = options || {};
    const missing = options.missing === undefined ? 'keep' : options.missing;
    if (!['keep', 'empty', 'error'].includes(missing)) throw new TypeError('Variables: invalid missing policy');
    if (options.caseSensitive !== undefined && typeof options.caseSensitive !== 'boolean') {
      throw new TypeError('Variables: caseSensitive must be boolean');
    }
    const fields = options.fields === undefined ? [] : options.fields;
    if (!Array.isArray(fields)) throw new TypeError('Variables: fields must be an array');
    const definitions = new Map();
    fields.forEach(function (field) {
      if (!field || typeof field.name !== 'string' || !/^[A-Za-z0-9_]+$/.test(field.name)) {
        throw new TypeError('Variables: invalid field name');
      }
      const key = options.caseSensitive ? field.name : field.name.toLowerCase();
      if (definitions.has(key)) throw new TypeError('Variables: duplicate field ' + field.name);
      if (field.type !== undefined && !['string', 'number', 'integer', 'boolean'].includes(field.type)) {
        throw new TypeError('Variables: invalid type for ' + field.name);
      }
      if (field.required !== undefined && typeof field.required !== 'boolean') {
        throw new TypeError('Variables: required must be boolean for ' + field.name);
      }
      ['min', 'max'].forEach(function (bound) {
        if (field[bound] !== undefined && (!Number.isFinite(field[bound]) || !['number', 'integer'].includes(field.type))) {
          throw new TypeError('Variables: invalid ' + bound + ' for ' + field.name);
        }
      });
      if (field.min !== undefined && field.max !== undefined && field.min > field.max) {
        throw new TypeError('Variables: min exceeds max for ' + field.name);
      }
      if (field.maxLength !== undefined && (!Number.isSafeInteger(field.maxLength) || field.maxLength < 0)) {
        throw new TypeError('Variables: invalid maxLength for ' + field.name);
      }
      definitions.set(key, field);
    });
    return { missing: missing, caseSensitive: options.caseSensitive === true, definitions: definitions };
  }

  function resolveNames(names, row, config) {
    const read = indexRow(row, config.caseSensitive);
    const values = Object.create(null), errors = [], missing = [];
    const allNames = new Set(names);
    const used = new Set(names.map(function (name) { return config.caseSensitive ? name : name.toLowerCase(); }));
    config.definitions.forEach(function (field, key) {
      if (!used.has(key)) allNames.add(field.name);
    });
    function error(name, code, message) { errors.push({ name: name, code: code, message: message }); }
    allNames.forEach(function (name) {
      const field = config.definitions.get(config.caseSensitive ? name : name.toLowerCase()) || {};
      let value = read(name);
      if (blank(value) && own(field, 'default')) value = field.default;
      if (blank(value)) {
        missing.push(name);
        if (field.required || config.missing === 'error') error(name, 'required', 'Missing value for ' + name);
        return;
      }
      const kind = typeof value;
      if (!['string', 'number', 'boolean'].includes(kind) || (kind === 'number' && !Number.isFinite(value))) {
        error(name, 'type', 'Expected a finite scalar value for ' + name); return;
      }
      let number;
      if (field.type === 'number' || field.type === 'integer') {
        // Accept decimal CSV cells without losing leading zeros in output.
        number = kind === 'number' ? value : (kind === 'string' && /^[+-]?(?:\d+(?:\.\d*)?|\.\d+)(?:e[+-]?\d+)?$/i.test(value.trim()) ? Number(value) : NaN);
        if (!Number.isFinite(number) || (field.type === 'integer' && !Number.isSafeInteger(number))) {
          error(name, 'type', 'Expected ' + field.type + ' for ' + name); return;
        }
      } else if ((field.type === 'string' && kind !== 'string') ||
                 (field.type === 'boolean' && kind !== 'boolean' && value !== 'true' && value !== 'false')) {
        error(name, 'type', 'Expected ' + field.type + ' for ' + name); return;
      }
      if ((field.min !== undefined && number < field.min) || (field.max !== undefined && number > field.max)) {
        error(name, 'range', 'Value out of range for ' + name); return;
      }
      if (field.maxLength !== undefined && String(value).length > field.maxLength) {
        error(name, 'maxLength', 'Value too long for ' + name); return;
      }
      values[name] = value;
    });
    return { valid: errors.length === 0, values: values, missing: missing, errors: errors };
  }

  function resolve(label, row, options) {
    return resolveNames(discover(label), row, configuration(options));
  }
  function checked(report) {
    if (!report.valid) {
      const error = new Error('Variable validation failed: ' + report.errors.map(function (e) { return e.message; }).join('; '));
      error.name = 'VariableValidationError';
      error.errors = report.errors;
      throw error;
    }
    return report;
  }
  function replace(text, report, policy) {
    if (typeof text !== 'string') return text;
    return text.replace(TOKEN, function (whole, name) {
      return own(report.values, name) ? String(report.values[name]) : (policy === 'empty' ? '' : whole);
    });
  }
  function substitute(text, row, options) {
    const config = configuration(options);
    return replace(text, checked(resolveNames(namesIn(text), row, config)), config.missing);
  }

  // Label models contain JSON data and packed Uint8Array graphics. Copy both
  // without a JSON round trip or shared mutable buffers. Keep shared references.
  function clone(value, seen) {
    if (value === null || typeof value !== 'object') return value;
    if (seen.has(value)) return seen.get(value);
    const bytes = Object.prototype.toString.call(value) === '[object Uint8Array]';
    const copy = bytes ? new Uint8Array(value) : (Array.isArray(value) ? [] : {});
    seen.set(value, copy);
    if (!bytes) Object.keys(value).forEach(function (key) {
      Object.defineProperty(copy, key, { value: clone(value[key], seen), enumerable: true, writable: true, configurable: true });
    });
    return copy;
  }
  function apply(label, row, options) {
    const config = configuration(options);
    const report = checked(resolveNames(discover(label), row, config));
    const result = clone(label, new Map());
    (result.elements || []).forEach(function (el) {
      const field = contentField(el);
      if (field) el[field] = replace(el[field], report, config.missing);
    });
    return result;
  }

  global.ZPLVariables = { discover: discover, lookup: lookup, resolve: resolve, substitute: substitute, apply: apply };
})(typeof globalThis !== 'undefined' ? globalThis : this);
