/* ZPL-Studio — application/UI layer. Ties together zpl-model / zpl-parser /
   zpl-generator / gfa-codec / barcodes into an interactive canvas editor. */
(function () {
  'use strict';

  const M = window.ZPLModel;

  // Keep localization deliberately outside the label model: $NAME$
  // placeholders, element text, barcode values and raw ZPL must remain data,
  // not UI copy. The German fallback covers the few semantic UI messages so
    // an older third-party embed that has not yet added studio/i18n.js still works.
  const I18N_FALLBACK = {
    'history.initial': 'Ausgangszustand', 'history.change': 'Änderung',
    'history.added.one': '{element} hinzugefügt', 'history.added.other': '{count} Elemente hinzugefügt',
    'history.removed.one': '{element} entfernt', 'history.removed.other': '{count} Elemente entfernt',
    'history.changed.one': '{element}: {field} geändert', 'history.changed.other': '{count} Elemente geändert',
    'history.settings': 'Etiketteneinstellungen geändert', 'history.graphics': 'Grafikdaten geändert',
    'history.properties': '{count} Eigenschaften', 'print.sent': 'Gesendet{job}.', 'print.job': ' (Job {jobId})',
    'print.failed': 'Fehlgeschlagen: {error}', 'print.sending': 'Wird gesendet…',
    'print.copies.invalid': 'Bitte eine Anzahl von 1 bis 99 eingeben.',
    'print.error.busy': 'Der Drucker verarbeitet noch einen Auftrag. Bitte kurz warten und dann erneut senden.',
    'print.error.printer-not-found': 'Der gewählte Drucker ist nicht mehr verfügbar. Bitte die Druckerliste neu laden.',
    'print.error.backend-unavailable': 'Der Druckdienst ist nicht verfügbar. Der Editor bleibt im lokalen Browsermodus verwendbar.',
    'print.error.delivery-failed': 'Der Auftrag konnte nicht an den Drucker übertragen werden. Druckerstatus prüfen und bei Bedarf erneut senden.',
    'print.error.delivery-unknown': 'Der Druckauftrag könnte bereits am Drucker angekommen sein. Bitte prüfen, bevor er erneut gesendet wird.',
    'print.single.hint': 'Sendet dieses Label über den konfigurierten Backend-Dienst an einen Drucker.',
    'print.batch.hint': '{count} vorbereitete Label(s) werden als Seriendruck über den konfigurierten Backend-Dienst gesendet.',
    'print.pq.notice': ' Die Anzahl wird genau einmal vom Backend angewendet; eine vorhandene <code>^PQ</code>-Auflage wird dafür auf eine Kopie normalisiert.',
    'print.raster': 'Bild drucken', 'print.raster.title': 'Label als Bild über den Systemdruckdialog drucken',
    'print.popup-blocked': 'Der Druckdialog konnte nicht geöffnet werden. Bitte Popups für diese Seite erlauben.',
    'print.printer-search': 'Drucker suchen…', 'print.printer-count': '{count} von {total} Druckern',
    'print.no-printers-match': 'Keine passenden Drucker gefunden.',
    'raster.blocked': 'Raster-Ausgabe abgebrochen: {reasons}. Dieses Label bitte als ZPL an einen kompatiblen Drucker senden.',
    'raster.warning': 'Barcode-Prüfung: {reasons}.\n\nTrotzdem als Raster ausgeben?',
    'raster.lossy-format': 'JPG und GIF sind für Barcode-Labels nicht scannersicher. Bitte PNG oder PDF verwenden.',
    'raster.too-large': 'Label ist für eine sichere Raster-Ausgabe zu groß. Bitte Größe reduzieren oder ZPL direkt drucken.',
    'raster.reason.unrendered-zpl': 'nicht darstellbare ZPL-Befehle',
    'raster.reason.placeholder-barcode': 'ein 2D-Code ist nur als Vorschau vorhanden',
    'raster.reason.barcode-control-prefix': 'Code-128-Steuerdaten können nicht sicher gerastert werden',
    'raster.reason.invalid-barcode': 'mindestens ein Barcode ist ungültig',
    'raster.reason.module-too-small': 'mindestens eine Modulbreite ist sehr klein',
    'raster.reason.inverse-barcode': 'ein inverser Barcode benötigt einen passenden Scanner',
    'raster.reason.edge-quiet-zone': 'ein Barcode liegt zu nah am Labelrand',
    'doc.position': '{index}/{total}',
    'doc.option.one': 'Etikett {index} (1 Element)',
    'doc.option.other': 'Etikett {index} ({count} Elemente)',
    'doc.opened-multi': 'Die Datei enthält {count} Etiketten – Auswahl oben in der Leiste.',
    'doc.added': 'Etikett {index} eingefügt.',
    'doc.duplicated': 'Etikett dupliziert (jetzt Nr. {index}).',
    'doc.deleted': 'Etikett {index} gelöscht.',
    'doc.moved': 'Etikett von Position {from} nach {to} verschoben.',
    'doc.delete-confirm': 'Etikett {index} von {total} löschen? Das lässt sich nicht rückgängig machen.',
    'doc.zpl-tab-scope': 'Diese Datei enthält {count} Etiketten. Hier steht nur das aktuell gewählte; „Herunterladen“ und „Speichern“ schreiben alle {count}.',
    'doc.apply-extra-frames': 'Nur das erste von {count} Etiketten übernommen – dieses Feld bearbeitet immer genau das gewählte Etikett.',
    'qr.status': 'Version {version} ({modules}×{modules} Module), Fehlerkorrektur {level}, Maske {mask}, {mode} · {size} bei Modulgröße {module}',
    'qr.mode.numeric': 'numerisch',
    'qr.mode.alphanumeric': 'alphanumerisch',
    'qr.mode.byte': 'Byte (UTF-8)',
    'qr.mode.mixed': 'gemischt',
    'qr.module-too-small': 'Warnung: unter 0,19 mm Modulgröße lesen viele Handscanner nicht mehr zuverlässig.',
    'qr.prefix-used': 'Steuerpräfix im Datenfeld erkannt: „{prefix}“.',
    'unit.dots': 'Dots',
    'unit.px': 'px',
    'Punkte/mm': 'Punkte/mm',
    'dpi.size-kept': '{size} bleibt',
    'dpi.resolution-info': '{dpmm} Dots pro Millimeter · {size}',
    'dpi.non-standard': 'keine übliche Zebra-Auflösung',
    'dpi.factor-exact': 'Faktor ×{factor} – exakt aus den Druckkopfauflösungen in Punkten pro Millimeter berechnet, damit die physische Etikettengröße erhalten bleibt.',
    'dpi.factor-approx': 'Faktor ×{factor} – aus dpi/25,4 berechnet; mindestens eine der Auflösungen ist keine übliche Zebra-Druckkopfauflösung.',
    'dpi.rounding-note': 'Rundung auf ganze Dots: bis zu ±{mm} Abweichung pro Wert.',
    'dpi.converted': 'Auf {dpi} dpi umgerechnet (Faktor ×{factor}).',
    'dpi.only-declared': 'DPI-Angabe geändert – die Dot-Werte blieben unverändert.',
    'dpi.graphics-failed': '{count} Grafik(en) konnten nicht neu gerastert werden – bitte prüfen.',
    'dpi.element-physical': 'Physisch bei {dpi} dpi: {x} / {y} mm · {w} × {h} mm',
    'dpi.from-filename': 'Auflösung {dpi} dpi aus dem Dateinamen übernommen.',
    'dpi.download-renamed': 'Als „{name}“ heruntergeladen – Endung an {dpi} dpi angepasst.',
    'dpi.filename-mismatch': 'Der Dateiname „{name}“ nennt {nameDpi} dpi, eingestellt sind {dpi} dpi. Bitte prüfen, für welchen Drucker dieses Etikett gedacht ist.',
    'dpi.printer-mismatch': '„{printer}“ druckt mit {printerDpi} dpi, dieses Etikett ist für {labelDpi} dpi ausgelegt. Unverändert gedruckt kommt es in der falschen Größe heraus.',
    'dpi.convert-to-printer': 'Etikett auf {dpi} dpi umrechnen…',
    'toast.history-excluded': 'Diese Änderung ist ausgeschlossen – zeige den Stand davor.',
    'sheet.count': '{count}/Bogen',
    'library.folder-unsupported': 'Wird von diesem Browser nicht unterstützt. Nutze stattdessen „Datei öffnen…“.',
    'library.load-failed': 'Bibliothek konnte nicht geladen werden: {error}',
    'library.server-templates': 'Server-Vorlagen: {count}',
    'library.folder': 'Ordner: {name}', 'library.no-files': '(keine .zpl-Dateien gefunden)',
  };
  function t(key, params) {
    if (window.ZPLStudioI18n) return window.ZPLStudioI18n.t(key, params);
    const source = I18N_FALLBACK[key] || String(key);
    if (!params) return source;
    return source.replace(/\{([a-zA-Z0-9_]+)\}/g, function (all, name) {
      return Object.prototype.hasOwnProperty.call(params, name) ? String(params[name]) : all;
    });
  }
  function translateFragment(root) {
    if (window.ZPLStudioI18n) window.ZPLStudioI18n.translateFragment(root);
  }
  // Count-aware lookup: picks "<key>.one" or "<key>.other" the same way the
  // history descriptions do, so "1 Element" doesn't read as "1 Elemente".
  function pluralT(key, count, params) {
    const merged = Object.assign({ count: count }, params || {});
    if (window.ZPLStudioI18n) return window.ZPLStudioI18n.plural(key, count, merged);
    return t(key + (count === 1 ? '.one' : '.other'), merged);
  }
  function editorLocaleTag() {
    return window.ZPLStudioI18n ? window.ZPLStudioI18n.localeTag() : 'de-DE';
  }

  // ---------------------------------------------------------------------
  // State
  // ---------------------------------------------------------------------
  const state = {
    label: M.defaultLabel(),      // the label being edited === doc.labels[doc.activeIndex]
    doc: null,                    // the whole file it belongs to (see loadDocument); seeded at boot
    labelHistories: [],           // parked undo stacks, one slot per label (see stashActiveHistory)
    selectedIds: [], // multi-selection; order doesn't matter, membership does
    tool: 'select',
    zoom: 0.6,
    sampleDataMode: false,
    sampleValues: {},
    sampleValueSource: {}, // name -> the XML tag name it was actually matched from, when different (e.g. GDTXT80 <- GDTXT)
    hideUnfilledPlaceholders: false, // once an XML is imported, placeholders it didn't cover render blank instead of literal $NAME$
    history: [],
    historyIndex: -1,
    dirHandle: null,
    currentFileHandle: null,
    currentFileName: null,
    currentServerFileName: null, // set instead of currentFileHandle when the open file came from the server template API (see writeServerTemplate)
    serverApiBase: null, // '../api/templates', '../api/templates.php' or a legacy co-located route once detected; null = no server backend found (local folder/file only)
    librarySource: null, // 'server' | 'local' | null - which source last populated #libraryList (see currentLibraryEntries)
    drag: null, // active pointer interaction, see canvas handlers
    grid: { enabled: false, size: 10 }, // dots
    // Display unit for the grid input, the coordinate HUD and the inspector's
    // size readouts - 'dots' | 'mm'. Purely a presentation choice: the label
    // model itself is always in printer dots, so switching this never edits
    // a single value (unlike the DPI conversion, which does).
    unit: 'dots',
    alignGuides: null, // { x: {at,y1,y2} | null, y: {at,x1,x2} | null } - set only while dragging a move (see computeAlignSnap), drawn by drawLabel
    // Mail-Merge / Seriendruck (see the section further down) -----------------
    mergeData: null, // { sheetNames, sheets: {name: {headers, rows}}, activeSheet, sourceName }
    mergeTemplates: {}, // fileName -> { label, fileName }, used when mergeTemplateMode === 'column'
    mergeTemplatesLoadError: null, // set by loadMergeTemplatesFromDir() when currentLibraryEntries() itself throws, so updateMergeTemplatesStatus() can tell a real fetch failure apart from "no library open yet" instead of both showing "Keine Vorlagen geladen."
    mergeTemplateMode: 'single', // 'single' | 'column'
    mergeTemplateColumn: null, // header name holding the per-row template file name, when 'column'
    mergeCustomSheet: { cols: 3, rows: 8, labelWidthMM: 70, labelHeightMM: 37, marginLeftMM: 0, marginTopMM: 0, gapXMM: 0, gapYMM: 0 },
  };

  function $(id) { return document.getElementById(id); }
  const canvas = $('labelCanvas');
  // Reassignable (not const): renderLabelOffscreen() temporarily points this
  // at a hidden canvas's context so the SAME draw*Element functions can
  // render an arbitrary label (diff overlay, multi-label thumbnails) without
  // duplicating their drawing logic.
  let ctx = canvas.getContext('2d');
  // Disabling kerning keeps drawn width closer to a simple sum of per-glyph
  // advances (matching how a printer's own fixed character-width table
  // works) rather than the browser's own font-shaping nudging specific
  // letter pairs tighter/looser - most relevant for font 0's Roboto
  // Condensed substitute. Where unsupported, assigning the property is
  // simply a silent no-op, never an error). zpl-render.js's own
  // measurement canvas sets this independently, for the same reason.
  if ('fontKerning' in ctx) ctx.fontKerning = 'none';

  // ---------------------------------------------------------------------
  // Collapsible "Bibliothek" panel in the right sidebar - remembers whether
  // the user last left it open/closed (localStorage can throw in some
  // restricted contexts, e.g. sandboxed iframes - fail silently, it's a
  // pure convenience) so it doesn't keep permanently eating vertical space
  // above the tabs on every reload once someone has collapsed it.
  (function () {
    const details = $('libraryDetails');
    let stored = null;
    try { stored = localStorage.getItem('zplStudioLibraryOpen'); } catch (e) { /* ignore */ }
    if (stored !== null) details.open = stored === 'true';
    details.addEventListener('toggle', function () {
      try { localStorage.setItem('zplStudioLibraryOpen', String(details.open)); } catch (e) { /* ignore */ }
    });
  })();

  // ---------------------------------------------------------------------
  // Workspace layout and appearance. These preferences are deliberately
  // separate from the label document: resizing a panel or changing the
  // theme must never dirty or alter printable ZPL data.
  const WORKSPACE_PREFS_KEY = 'zplStudioWorkspace';
  const THEME_PREF_KEY = 'zplStudioTheme';
  const WORKSPACE_DEFAULTS = { leftWidth: 68, rightWidth: 320, consoleHeight: 280, consoleOpen: false };
  const workspacePrefs = Object.assign({}, WORKSPACE_DEFAULTS);

  try {
    const storedWorkspace = JSON.parse(localStorage.getItem(WORKSPACE_PREFS_KEY) || 'null');
    if (storedWorkspace && typeof storedWorkspace === 'object') Object.assign(workspacePrefs, storedWorkspace);
  } catch (e) { /* optional preference only */ }

  function clamp(value, min, max) {
    return Math.min(max, Math.max(min, Number(value) || min));
  }
  function maxRightSidebarWidth() {
    return Math.max(260, Math.min(640, window.innerWidth - 360));
  }
  function maxConsoleHeight() {
    // Leave enough vertical room for the toolbar and a useful canvas even on
    // short laptop windows; the CSS cap remains a second safety net.
    return Math.max(150, Math.min(600, Math.round(window.innerHeight * 0.55), window.innerHeight - 220));
  }
  function persistWorkspace() {
    try { localStorage.setItem(WORKSPACE_PREFS_KEY, JSON.stringify(workspacePrefs)); } catch (e) { /* optional preference only */ }
  }
  function applyWorkspaceDimensions() {
    workspacePrefs.leftWidth = clamp(workspacePrefs.leftWidth, 56, 240);
    workspacePrefs.rightWidth = clamp(workspacePrefs.rightWidth, 260, maxRightSidebarWidth());
    workspacePrefs.consoleHeight = clamp(workspacePrefs.consoleHeight, 150, maxConsoleHeight());
    const rootStyle = document.documentElement.style;
    rootStyle.setProperty('--left-sidebar-width', workspacePrefs.leftWidth + 'px');
    rootStyle.setProperty('--right-sidebar-width', workspacePrefs.rightWidth + 'px');
    rootStyle.setProperty('--console-height', workspacePrefs.consoleHeight + 'px');
    $('leftSidebarSplitter').setAttribute('aria-valuenow', String(Math.round(workspacePrefs.leftWidth)));
    $('rightSidebarSplitter').setAttribute('aria-valuenow', String(Math.round(workspacePrefs.rightWidth)));
    $('rightSidebarSplitter').setAttribute('aria-valuemax', String(maxRightSidebarWidth()));
    $('consoleSplitter').setAttribute('aria-valuenow', String(Math.round(workspacePrefs.consoleHeight)));
    $('consoleSplitter').setAttribute('aria-valuemax', String(maxConsoleHeight()));
  }
  function setConsoleOpen(open, persist) {
    workspacePrefs.consoleOpen = !!open;
    $('bottomConsole').classList.toggle('is-collapsed', !workspacePrefs.consoleOpen);
    $('btnConsoleToggle').setAttribute('aria-expanded', String(workspacePrefs.consoleOpen));
    $('consoleBody').setAttribute('aria-hidden', String(!workspacePrefs.consoleOpen));
    if (persist !== false) persistWorkspace();
    if (workspacePrefs.consoleOpen) requestAnimationFrame(updateZplSource);
  }
  function setTheme(theme, persist) {
    const allowed = ['system', 'light', 'dark', 'contrast'];
    const selected = allowed.indexOf(theme) === -1 ? 'system' : theme;
    document.documentElement.dataset.theme = selected;
    $('themeSelect').value = selected;
    if (persist !== false) {
      try { localStorage.setItem(THEME_PREF_KEY, selected); } catch (e) { /* optional preference only */ }
    }
  }

  let initialTheme = 'system';
  try { initialTheme = localStorage.getItem(THEME_PREF_KEY) || 'system'; } catch (e) { /* optional preference only */ }
  setTheme(initialTheme, false);
  applyWorkspaceDimensions();
  setConsoleOpen(workspacePrefs.consoleOpen, false);

  $('themeSelect').addEventListener('change', function () {
    setTheme(this.value, true);
    drawLabel();
  });
  $('btnConsoleToggle').addEventListener('click', function () { setConsoleOpen(!workspacePrefs.consoleOpen); });
  $('btnConsoleClose').addEventListener('click', function () { setConsoleOpen(false); $('btnConsoleToggle').focus(); });

  function finishWorkspaceResize(splitter) {
    splitter.classList.remove('is-active');
    document.body.classList.remove('layout-resizing', 'layout-resizing-vertical');
    persistWorkspace();
    fitZoom();
    drawLabel();
  }
  function makeResizable(splitter, options) {
    splitter.setAttribute('aria-valuemin', String(options.min));
    splitter.setAttribute('aria-valuemax', String(options.max()));
    splitter.addEventListener('pointerdown', function (event) {
      if (event.button !== 0) return;
      const startPointer = options.axis === 'x' ? event.clientX : event.clientY;
      const startValue = workspacePrefs[options.key];
      splitter.setPointerCapture(event.pointerId);
      splitter.classList.add('is-active');
      document.body.classList.add('layout-resizing');
      if (options.axis === 'y') document.body.classList.add('layout-resizing-vertical');
      const move = function (moveEvent) {
        const pointer = options.axis === 'x' ? moveEvent.clientX : moveEvent.clientY;
        workspacePrefs[options.key] = clamp(startValue + (pointer - startPointer) * options.direction, options.min, options.max());
        applyWorkspaceDimensions();
      };
      const end = function () {
        splitter.removeEventListener('pointermove', move);
        splitter.removeEventListener('pointerup', end);
        splitter.removeEventListener('pointercancel', end);
        finishWorkspaceResize(splitter);
      };
      splitter.addEventListener('pointermove', move);
      splitter.addEventListener('pointerup', end);
      splitter.addEventListener('pointercancel', end);
      event.preventDefault();
    });
    splitter.addEventListener('keydown', function (event) {
      const step = event.shiftKey ? 32 : 8;
      let delta = 0;
      if (event.key === 'Home') workspacePrefs[options.key] = options.reset;
      else if (options.axis === 'x' && event.key === 'ArrowLeft') delta = -step * options.direction;
      else if (options.axis === 'x' && event.key === 'ArrowRight') delta = step * options.direction;
      else if (options.axis === 'y' && event.key === 'ArrowUp') delta = -step * options.direction;
      else if (options.axis === 'y' && event.key === 'ArrowDown') delta = step * options.direction;
      else return;
      workspacePrefs[options.key] = clamp(workspacePrefs[options.key] + delta, options.min, options.max());
      applyWorkspaceDimensions();
      persistWorkspace();
      event.preventDefault();
    });
    splitter.addEventListener('dblclick', function () {
      workspacePrefs[options.key] = options.reset;
      applyWorkspaceDimensions();
      persistWorkspace();
      fitZoom();
      drawLabel();
    });
  }

  makeResizable($('leftSidebarSplitter'), {
    axis: 'x', key: 'leftWidth', direction: 1, min: 56, max: function () { return 240; }, reset: WORKSPACE_DEFAULTS.leftWidth,
  });
  makeResizable($('rightSidebarSplitter'), {
    axis: 'x', key: 'rightWidth', direction: -1, min: 260, max: maxRightSidebarWidth, reset: WORKSPACE_DEFAULTS.rightWidth,
  });
  makeResizable($('consoleSplitter'), {
    axis: 'y', key: 'consoleHeight', direction: -1, min: 150, max: maxConsoleHeight, reset: WORKSPACE_DEFAULTS.consoleHeight,
  });

  // ---------------------------------------------------------------------
  // History (undo/redo) — simple full-snapshot approach, fine at label scale.
  // ---------------------------------------------------------------------
  // Shared by history snapshots below AND by cloneLabel() (mail-merge section
  // further down, which needs to deep-clone an arbitrary template label per
  // CSV/XLSX row) - Uint8Array (packed graphic bits) doesn't survive plain
  // JSON.stringify/parse on its own.
  function uint8JsonReplacer(key, value) {
    if (value instanceof Uint8Array) return { __u8: Array.from(value) };
    return value;
  }
  function uint8JsonReviver(key, value) {
    if (value && value.__u8) return new Uint8Array(value.__u8);
    return value;
  }
  function snapshot() {
    return JSON.stringify(state.label, uint8JsonReplacer);
  }
  function restore(json) {
    return JSON.parse(json, uint8JsonReviver);
  }
  function cloneLabel(label) {
    return JSON.parse(JSON.stringify(label, uint8JsonReplacer), uint8JsonReviver);
  }

  // Auto-describes what changed between two label states for the history
  // list, reusing the element-matching/diff logic the label-compare feature
  // (ZPLDiff, see zpl-diff.js) already has - so every one of the ~17
  // pushHistory() call sites elsewhere in this file can stay a bare call
  // with no per-site label string to keep in sync.
  function describeHistoryChange(prevLabel, nextLabel) {
    if (!prevLabel) return t('history.initial');
    const cmp = window.ZPLDiff.compareLabels(prevLabel, nextLabel);
    const parts = [];
    if (cmp.added.length === 1) parts.push(t('history.added.one', { element: t(window.ZPLDiff.describeElement(cmp.added[0])) }));
    else if (cmp.added.length > 1) parts.push(t('history.added.other', { count: cmp.added.length }));
    if (cmp.removed.length === 1) parts.push(t('history.removed.one', { element: t(window.ZPLDiff.describeElement(cmp.removed[0])) }));
    else if (cmp.removed.length > 1) parts.push(t('history.removed.other', { count: cmp.removed.length }));
    if (cmp.changed.length === 1) {
      const c = cmp.changed[0];
      const fieldPart = c.changes.length === 1 ? t(c.changes[0].field) : t('history.properties', { count: c.changes.length });
      parts.push(t('history.changed.one', { element: t(window.ZPLDiff.describeElement(c.b)), field: fieldPart }));
    } else if (cmp.changed.length > 1) {
      parts.push(t('history.changed.other', { count: cmp.changed.length }));
    }
    const settingsChanged = Object.keys(nextLabel).some(function (k) {
      if (k === 'elements' || k === 'storedGraphics') return false;
      return JSON.stringify(nextLabel[k]) !== JSON.stringify(prevLabel[k]);
    });
    if (settingsChanged) parts.push(t('history.settings'));
    // uint8JsonReplacer matters here: storedGraphics entries hold their bit
    // data as a Uint8Array, which plain JSON.stringify serializes as a huge
    // {"0":137,"1":80,...} keyed object (one JSON key per byte) instead of
    // the compact array form snapshot()/cloneLabel already use elsewhere -
    // and this comparison runs on every pushHistory() call whose diff found
    // nothing else to report, which includes a plain no-op click-to-select.
    if (!parts.length && JSON.stringify(nextLabel.storedGraphics, uint8JsonReplacer) !== JSON.stringify(prevLabel.storedGraphics, uint8JsonReplacer)) {
      parts.push(t('history.graphics'));
    }
    return parts.length ? parts.join(', ') : t('history.change');
  }

  function pushHistory() {
    const prevLabel = state.historyIndex >= 0 ? restore(state.history[state.historyIndex].snapshot) : null;
    state.history = state.history.slice(0, state.historyIndex + 1);
    state.history.push({
      snapshot: snapshot(),
      label: describeHistoryChange(prevLabel, state.label),
      timestamp: Date.now(),
      enabled: true,
    });
    if (state.history.length > 100) state.history.shift();
    state.historyIndex = state.history.length - 1;
    updateUndoRedoButtons();
    renderHistoryPanel();
    if ($('btnPreflight')) $('btnPreflight').classList.remove('has-warning');
    scheduleAutosave();
  }
  let nudgeHistoryTimer = null;
  function scheduleNudgeHistoryPush() {
    clearTimeout(nudgeHistoryTimer);
    nudgeHistoryTimer = setTimeout(pushHistory, 400);
  }

  // --- Selective disable of a past change ---------------------------------
  // History is a stack of full-label snapshots (see pushHistory above), not
  // composable commands, so "disable this one change" can't just skip an
  // entry - the entries after it were snapshotted with its effect already
  // baked in. Instead: id-key the element list of two consecutive snapshots
  // (stable across pushes - only newly created elements get a new id) into
  // an add/remove/modify patch, then rebuild the label from the base
  // snapshot forward, applying every enabled entry's patch in order and
  // skipping disabled ones. Cheap fast path: if nothing up to the requested
  // index is disabled, just restore that snapshot directly (the normal
  // undo/redo case, unchanged from before this feature existed).
  function diffSnapshotLabels(beforeLabel, afterLabel) {
    const settings = {};
    Object.keys(afterLabel).forEach(function (k) {
      if (k === 'elements') return;
      if (JSON.stringify(afterLabel[k]) !== JSON.stringify(beforeLabel[k])) settings[k] = afterLabel[k];
    });
    const beforeMap = {}; (beforeLabel.elements || []).forEach(function (e) { beforeMap[e.id] = e; });
    const afterMap = {}; (afterLabel.elements || []).forEach(function (e) { afterMap[e.id] = e; });
    const added = [], removed = [], modified = {};
    (afterLabel.elements || []).forEach(function (e) {
      if (!beforeMap[e.id]) added.push(e);
      else if (JSON.stringify(e) !== JSON.stringify(beforeMap[e.id])) modified[e.id] = e;
    });
    (beforeLabel.elements || []).forEach(function (e) { if (!afterMap[e.id]) removed.push(e.id); });
    return { settings: settings, added: added, removed: removed, modified: modified };
  }
  function applySnapshotDiff(label, diff) {
    Object.keys(diff.settings).forEach(function (k) { label[k] = diff.settings[k]; });
    if (diff.removed.length) {
      const removeSet = {}; diff.removed.forEach(function (id) { removeSet[id] = true; });
      label.elements = label.elements.filter(function (e) { return !removeSet[e.id]; });
    }
    Object.keys(diff.modified).forEach(function (id) {
      const idx = label.elements.findIndex(function (e) { return e.id === id; });
      if (idx !== -1) label.elements[idx] = diff.modified[id];
    });
    diff.added.forEach(function (e) {
      if (!label.elements.some(function (x) { return x.id === e.id; })) label.elements.push(e);
    });
  }
  function computeLabelAt(index) {
    const anyDisabled = state.history.slice(0, index + 1).some(function (h) { return h.enabled === false; });
    if (!anyDisabled) return restore(state.history[index].snapshot);
    const label = restore(state.history[0].snapshot);
    for (let i = 1; i <= index; i++) {
      const h = state.history[i];
      if (h.enabled === false) continue;
      if (!h.diff) h.diff = diffSnapshotLabels(restore(state.history[i - 1].snapshot), restore(h.snapshot));
      applySnapshotDiff(label, h.diff);
    }
    return label;
  }
  // Undo/redo and the history panel rebuild the label from a snapshot, i.e.
  // they produce a NEW object. state.doc.labels[activeIndex] has to follow,
  // or the file written by "Speichern"/"Herunterladen" keeps the pre-undo
  // version of that label while the editor shows the reverted one.
  // (state.doc is null only until the boot block seeds it.)
  function replaceActiveLabel(label) {
    if (state.doc) label.storedGraphics = state.doc.storedGraphics;
    state.label = label;
    if (state.doc) state.doc.labels[state.doc.activeIndex] = label;
  }

  function toggleHistoryEnabled(index) {
    const h = state.history[index];
    if (!h || index === 0) return; // base snapshot can't be turned off - nothing to diff it against
    h.enabled = h.enabled === false ? true : false;
    replaceActiveLabel(computeLabelAt(state.historyIndex));
    state.selectedIds = [];
    renderAll();
    renderHistoryPanel();
    $('btnPreflight').classList.remove('has-warning');
    scheduleAutosave();
  }

  function jumpToHistory(index) {
    if (index < 0 || index >= state.history.length || index === state.historyIndex) return;
    // Same stale-snapshot hazard as undo/redo always guarded against: a
    // pending debounced nudge-push must not fire against the label we're
    // about to jump away from.
    clearTimeout(nudgeHistoryTimer);
    state.drag = null;
    state.historyIndex = index;
    replaceActiveLabel(computeLabelAt(index));
    state.selectedIds = [];
    renderAll();
    updateUndoRedoButtons();
    renderHistoryPanel();
    $('btnPreflight').classList.remove('has-warning');
    scheduleAutosave();
    // The jumped-to entry's OWN change is excluded, so what's actually shown
    // is really the last enabled predecessor - without this, the row that's
    // now highlighted "current" contradicts what's visibly on the canvas.
    if (state.history[index].enabled === false) {
      showToast(t('toast.history-excluded'));
    }
  }
  function undo() {
    if (state.historyIndex <= 0) return;
    jumpToHistory(state.historyIndex - 1);
  }
  function redo() {
    if (state.historyIndex >= state.history.length - 1) return;
    jumpToHistory(state.historyIndex + 1);
  }
  function updateUndoRedoButtons() {
    const undoBtn = $('btnUndo'), redoBtn = $('btnRedo');
    const canUndo = state.historyIndex > 0, canRedo = state.historyIndex < state.history.length - 1;
    undoBtn.disabled = !canUndo;
    redoBtn.disabled = !canRedo;
    undoBtn.title = t('Rückgängig') + ' (Ctrl/Cmd+Z)' + (canUndo ? ': ' + state.history[state.historyIndex].label : '');
    redoBtn.title = t('Wiederholen') + ' (Ctrl/Cmd+Y)' + (canRedo ? ': ' + state.history[state.historyIndex + 1].label : '');
  }
  function formatHistoryTime(ts) {
    const d = new Date(ts);
    return d.toLocaleTimeString(editorLocaleTag(), { hour: '2-digit', minute: '2-digit', second: '2-digit' });
  }
  function renderHistoryPanel() {
    const list = $('historyList');
    if (!list || !list.offsetParent) return; // skip work while the Verlauf tab isn't visible; refreshed again on tab-activate
    const rows = state.history.map(function (h, i) {
      const isCurrent = i === state.historyIndex;
      const isBase = i === 0;
      const cls = 'history-item' + (isCurrent ? ' history-current' : '') + (h.enabled === false ? ' history-disabled' : '');
      const checkTitle = isBase ? t('Ausgangszustand kann nicht deaktiviert werden') : t('Diese Änderung ein-/ausschließen, ohne spätere Änderungen zu verlieren');
      return '<li class="' + cls + '"' + (isCurrent ? ' aria-current="true"' : '') + '>' +
        '<label class="history-check" title="' + checkTitle + '">' +
        '<input type="checkbox" data-history-toggle="' + i + '"' + (h.enabled === false ? '' : ' checked') + (isBase ? ' disabled' : '') +
        ' aria-label="' + escapeHtml((isBase ? t('history.initial') + ': ' : t('Änderung') + ': ') + h.label) + '">' +
        '</label>' +
        '<span class="history-desc" data-history-jump="' + i + '" title="' + escapeHtml(t('Zu diesem Zeitpunkt springen')) + '" tabindex="0" role="button">' + escapeHtml(h.label) + '</span>' +
        '<span class="history-time">' + formatHistoryTime(h.timestamp) + '</span>' +
        '</li>';
    }).reverse().join('');
    list.innerHTML = rows || '<li class="hint">' + escapeHtml(t('Kein Verlauf.')) + '</li>';
    translateFragment(list);
    list.querySelectorAll('[data-history-jump]').forEach(function (elx) {
      elx.addEventListener('click', function () { jumpToHistory(parseInt(elx.getAttribute('data-history-jump'), 10)); });
      // Matches refreshLibraryList()'s existing keyboard-operable <li> pattern.
      elx.addEventListener('keydown', function (e) {
        if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); jumpToHistory(parseInt(elx.getAttribute('data-history-jump'), 10)); }
      });
    });
    list.querySelectorAll('[data-history-toggle]').forEach(function (elx) {
      elx.addEventListener('change', function () { toggleHistoryEnabled(parseInt(elx.getAttribute('data-history-toggle'), 10)); });
    });
  }

  // Ebenen (layers) tab - a reorderable, renameable, show/hide list of every
  // visual element. Displayed FRONT-TO-BACK (reverse of state.label.elements,
  // which is back-to-front paint order - see drawElementsOnly) so "top of
  // the list" matches "drawn on top", the convention every layers panel
  // (Photoshop, Figma, ...) already uses.
  function layerLabel(el) {
    return el.name || t(window.ZPLDiff.describeElement(el));
  }
  function renderLayersPanel() {
    const list = $('layersList');
    if (!list || !list.offsetParent) return; // skip work while the Ebenen tab isn't visible; refreshed again on tab-activate
    const visualEls = state.label.elements.filter(function (el) { return el.type !== 'raw'; });
    const rows = visualEls.slice().reverse().map(function (el) {
      const isCurrent = state.selectedIds.indexOf(el.id) !== -1;
      return '<li class="layer-item' + (isCurrent ? ' layer-current' : '') + (el.hidden ? ' layer-hidden' : '') + (el.locked ? ' layer-locked' : '') +
        '" draggable="' + (el.locked ? 'false' : 'true') + '" data-layer-id="' + el.id + '">' +
        '<span class="layer-drag-handle" title="' + escapeHtml(t('Ziehen zum Umsortieren')) + '" aria-hidden="true">&#8942;&#8942;</span>' +
        '<label class="layer-vis" title="' + escapeHtml(t('In der Vorschau (und beim Export) ein-/ausblenden')) + '">' +
        '<input type="checkbox" data-layer-visible="' + el.id + '"' + (el.hidden ? '' : ' checked') +
        ' aria-label="' + escapeHtml(layerLabel(el) + ' ' + t('anzeigen')) + '">' +
        '</label>' +
        '<button type="button" class="layer-lock" data-layer-lock="' + el.id + '" aria-pressed="' + (el.locked ? 'true' : 'false') +
        '" title="' + escapeHtml(t(el.locked ? 'Element entsperren' : 'Element sperren')) + '">' + (el.locked ? '&#128274;' : '&#128275;') + '</button>' +
        '<input type="text" class="layer-name" data-layer-name="' + el.id + '" value="' + escapeHtml(el.name || '') + '" placeholder="' + escapeHtml(t(window.ZPLDiff.describeElement(el))) + '"' + (el.locked ? ' disabled' : '') + '>' +
        '</li>';
    }).join('');
    list.innerHTML = rows || '<li class="hint">' + escapeHtml(t('Keine Elemente auf diesem Label.')) + '</li>';
    translateFragment(list);

    list.querySelectorAll('[data-layer-id]').forEach(function (li) {
      const id = li.getAttribute('data-layer-id');
      li.addEventListener('click', function (e) {
        if (e.target.closest('[data-layer-visible], [data-layer-lock], [data-layer-name]')) return;
        state.selectedIds = [id];
        renderAll();
      });
      li.addEventListener('dragstart', function (e) {
        const dragged = elementById(id);
        if (dragged && dragged.locked) { e.preventDefault(); return; }
        e.dataTransfer.setData('text/plain', id);
        e.dataTransfer.effectAllowed = 'move';
        li.classList.add('layer-dragging');
      });
      li.addEventListener('dragend', function () { li.classList.remove('layer-dragging'); });
      li.addEventListener('dragover', function (e) { e.preventDefault(); });
      li.addEventListener('drop', function (e) {
        e.preventDefault();
        const draggedId = e.dataTransfer.getData('text/plain');
        if (!draggedId || draggedId === id) return;
        reorderLayerByDrop(draggedId, id);
      });
    });
    list.querySelectorAll('[data-layer-visible]').forEach(function (cb) {
      cb.addEventListener('change', function () {
        const el = elementById(cb.getAttribute('data-layer-visible'));
        if (!el) return;
        el.hidden = !cb.checked;
        renderAll();
        pushHistory();
      });
    });
    list.querySelectorAll('[data-layer-lock]').forEach(function (button) {
      button.addEventListener('click', function () {
        const el = elementById(button.getAttribute('data-layer-lock'));
        if (!el) return;
        el.locked = !el.locked;
        if (el.locked) state.selectedIds = state.selectedIds.filter(function (id) { return id !== el.id; });
        renderAll();
        pushHistory();
      });
    });
    list.querySelectorAll('[data-layer-name]').forEach(function (input) {
      input.addEventListener('change', function () {
        const el = elementById(input.getAttribute('data-layer-name'));
        if (!el) return;
        el.name = input.value.trim() || null;
        renderLayersPanel();
        pushHistory();
      });
    });
  }

  // Moves `draggedId` to sit directly in front of `targetId` in paint order
  // (i.e. just above it in the layers list, matching where it was visually
  // dropped) - both ids come from the FRONT-TO-BACK <li> list, so the actual
  // array splice has to work in that same reversed sense relative to
  // state.label.elements' own back-to-front storage order.
  function reorderLayerByDrop(draggedId, targetId) {
    const elements = state.label.elements;
    const draggedIdx = elements.findIndex(function (e) { return e.id === draggedId; });
    if (draggedIdx === -1) return;
    const [dragged] = elements.splice(draggedIdx, 1);
    const targetIdx = elements.findIndex(function (e) { return e.id === targetId; });
    // Dropping onto `targetId` means "take its place, pushing it one further
    // back" - insert AFTER it in array order (= visually just above it,
    // since array-later paints later = on top).
    elements.splice(targetIdx === -1 ? elements.length : targetIdx + 1, 0, dragged);
    renderAll();
    pushHistory();
  }

  // hasSaveTarget: btnSave has two mutually-exclusive targets - a local
  // FileSystemFileHandle (createWritable(), where supported) or a server
  // template name (writeServerTemplate(), the api/templates backend) -
  // loadLabel always clears whichever one doesn't apply to the file just
  // opened, so the two never both point at stale targets at once.
  function hasSaveTarget() { return !!(state.currentFileHandle || state.currentServerFileName); }

  // "Is any template library currently active" - server or local folder,
  // matching whichever currentLibraryEntries() would actually enumerate.
  // Written out as this same ternary at three separate call sites before
  // (refreshLibraryList, loadMergeTemplatesFromDir, the Seriendruck
  // template-mode radio handler) - exactly the kind of duplicated state
  // check that already caused a real bug once this session (the radio
  // handler checked state.dirHandle alone and missed the server source
  // entirely). One shared helper means a future change to how library
  // sources are represented only has one place to update.
  function hasActiveLibrary() {
    return state.librarySource === 'server' ? !!state.serverApiBase : !!state.dirHandle;
  }

  // A ZPL file states no resolution, so a freshly parsed label always starts
  // at the model's 203 dpi default - which silently misreports the physical
  // size of anything written for a 300 dpi printhead. The `.200zpl`/`.300zpl`
  // naming convention (already accepted by this editor's file pickers) is the
  // one place a file DOES declare its resolution, so honor it. This only
  // corrects the DECLARED dpi: the dot values in the file are already the
  // right ones for that printer and must not be touched.
  // Opens a parsed file as a document. Returns a short suffix describing
  // anything the user should know about it (extra labels, a corrected dpi),
  // so each caller can append it to its own "loaded" toast rather than
  // firing a second one.
  function openParsedDocument(text, fileName, fileHandle, serverFileName) {
    const doc = window.ZPLParser.parseDocument(text);
    let declaredDpi = null;
    doc.labels.forEach(function (label) {
      label.sourceFileName = fileName || null;
      const applied = applyFileNameDpi(label, fileName);
      if (applied) declaredDpi = applied;
    });
    loadDocument(doc, fileName, fileHandle, serverFileName);
    let note = '';
    if (doc.labels.length > 1) note += ' ' + t('doc.opened-multi', { count: doc.labels.length });
    if (declaredDpi) note += ' ' + t('dpi.from-filename', { dpi: declaredDpi });
    return note;
  }

  function applyFileNameDpi(label, fileName) {
    const declared = DPI.dpiFromFileName(fileName);
    if (!declared || !label || !label.settings) return null;
    if (DPI.scaleFactor(label.settings.dpi, declared) === 1) return null;
    label.settings.dpi = declared;
    return declared;
  }

  // ---------------------------------------------------------------------
  // Documents: a .zpl file can hold many ^XA..^XZ frames
  //
  // state.label stays "the label being edited" and every existing call site
  // keeps working unchanged; state.doc is the file it belongs to. The one
  // invariant to preserve everywhere below:
  //
  //     state.label === state.doc.labels[state.doc.activeIndex]
  //
  // Undo/redo deliberately stays PER LABEL rather than per document: the
  // history engine can exclude an individual past change and replay the rest
  // (see computeLabelAt), which has no meaningful document-level equivalent.
  // Each label therefore carries its own stack in labelHistories, so
  // switching away and back does not throw a label's history away - it just
  // doesn't undo across a label boundary, the same way it doesn't undo across
  // opening a different file.
  // ---------------------------------------------------------------------
  function singleLabelDocument(label) {
    return {
      labels: [label],
      activeIndex: 0,
      preamble: label.preamble || null,
      storedGraphics: label.storedGraphics,
      passthrough: [],
    };
  }

  function labelCount() { return (state.doc && state.doc.labels.length) || 1; }
  function activeIndex() { return (state.doc && state.doc.activeIndex) || 0; }

  // Parks the live history stack on the label it belongs to, so switching
  // back to it later resumes rather than restarts.
  function stashActiveHistory() {
    if (!state.doc) return;
    state.labelHistories[state.doc.activeIndex] = { history: state.history, historyIndex: state.historyIndex };
  }
  function adoptHistoryFor(index) {
    const stashed = state.labelHistories[index];
    if (stashed) {
      state.history = stashed.history;
      state.historyIndex = stashed.historyIndex;
      return;
    }
    state.history = [];
    state.historyIndex = -1;
    pushHistory(); // seed this label's own base snapshot
  }

  function loadDocument(doc, fileName, fileHandle, serverFileName, options) {
    clearTimeout(nudgeHistoryTimer);
    doc.labels.forEach(labelGuides);
    state.doc = doc;
    const recoveredIndex = options && options.recovered ? parseInt(doc.activeIndex, 10) || 0 : 0;
    state.doc.activeIndex = clamp(recoveredIndex, 0, doc.labels.length - 1);
    state.labelHistories = [];
    state.label = doc.labels[state.doc.activeIndex];
    state.selectedIds = [];
    state.currentFileName = fileName || null;
    state.currentFileHandle = fileHandle || null;
    state.currentServerFileName = serverFileName || null;
    state.history = [];
    state.historyIndex = -1;
    pushHistory();
    updateLabelNav();
    fitZoom();
    renderAll();
    $('btnSave').disabled = !hasSaveTarget();
    if (options && options.recovered) markDocumentRecovered(); else markDocumentClean();
  }

  function setActiveLabel(index) {
    if (!state.doc || index < 0 || index >= state.doc.labels.length || index === state.doc.activeIndex) return;
    clearTimeout(nudgeHistoryTimer);
    stashActiveHistory();
    state.doc.activeIndex = index;
    state.label = state.doc.labels[index];
    state.selectedIds = [];
    state.drag = null;
    adoptHistoryFor(index);
    updateLabelNav();
    fitZoom();
    renderAll();
    updateUndoRedoButtons();
  }

  // A new label inherits the current one's settings (size, dpi, media) -
  // labels in one file are nearly always the same stock, and starting from
  // the model default would silently produce a differently-sized frame.
  function insertLabel(index, label) {
    stashActiveHistory();
    labelGuides(label);
    state.doc.labels.splice(index, 0, label);
    state.labelHistories.splice(index, 0, null);
    state.doc.activeIndex = index;
    state.label = label;
    state.selectedIds = [];
    adoptHistoryFor(index);
    updateLabelNav();
    renderAll();
    updateUndoRedoButtons();
    updateZplSource();
  }

  function addLabel() {
    const fresh = M.defaultLabel();
    fresh.settings = M.clone(state.label.settings);
    fresh.settings.note = '';
    fresh.storedGraphics = state.doc.storedGraphics; // shared registry, same as the parser builds
    fresh.byState = M.clone(state.label.byState);
    insertLabel(activeIndex() + 1, fresh);
    showToast(t('doc.added', { index: activeIndex() + 1 }));
  }

  function duplicateActiveLabel() {
    const copy = cloneLabel(state.label);
    // cloneLabel deep-copies everything including element ids; fresh ids keep
    // per-element state (selection, caches, history diffs) from colliding
    // across two labels that are otherwise identical.
    copy.elements.forEach(function (el) { el.id = M.uid(el.type); });
    copy.preamble = null; // the preamble belongs to the file, not to a copy
    copy.storedGraphics = state.doc.storedGraphics;
    insertLabel(activeIndex() + 1, copy);
    showToast(t('doc.duplicated', { index: activeIndex() + 1 }));
  }

  function deleteActiveLabel() {
    if (labelCount() <= 1) return;
    if (!confirm(t('doc.delete-confirm', { index: activeIndex() + 1, total: labelCount() }))) return;
    const removed = state.doc.activeIndex;
    state.doc.labels.splice(removed, 1);
    state.labelHistories.splice(removed, 1);
    // Passthrough chunks are anchored to the label they followed; drop the
    // ones belonging to the deleted label and shift the rest, otherwise a
    // driver-config frame would migrate to a different position in the file.
    state.doc.passthrough = (state.doc.passthrough || []).filter(function (p) {
      return p.afterLabelIndex !== removed;
    }).map(function (p) {
      return p.afterLabelIndex > removed ? { afterLabelIndex: p.afterLabelIndex - 1, raw: p.raw } : p;
    });
    const next = Math.min(removed, state.doc.labels.length - 1);
    state.doc.activeIndex = next;
    state.label = state.doc.labels[next];
    state.selectedIds = [];
    adoptHistoryFor(next);
    updateLabelNav();
    fitZoom();
    renderAll();
    updateUndoRedoButtons();
    showToast(t('doc.deleted', { index: removed + 1 }));
    scheduleAutosave();
  }

  function moveActiveLabel(delta) {
    const from = activeIndex(), to = from + delta;
    if (!state.doc || to < 0 || to >= state.doc.labels.length) return;
    stashActiveHistory();
    const labels = state.doc.labels;
    labels.splice(to, 0, labels.splice(from, 1)[0]);
    state.labelHistories.splice(to, 0, state.labelHistories.splice(from, 1)[0]);
    state.doc.activeIndex = to;
    updateLabelNav();
    updateZplSource();
    showToast(t('doc.moved', { from: from + 1, to: to + 1 }));
    scheduleAutosave();
  }

  // The whole file, every frame - what "Speichern"/"Herunterladen" write.
  // The ZPL-Code tab deliberately shows only the ACTIVE frame (see its own
  // hint), because per-element line highlighting has no meaning across a
  // document.
  function documentText(options) {
    return window.ZPLGenerator.generateDocument(state.doc, Object.assign({
      keepPreamble: state.keepPreamble !== false,
    }, options || {}));
  }

  function updateLabelNav() {
    const bar = $('labelNav');
    if (!bar) return;
    const total = labelCount();
    bar.classList.toggle('single', total <= 1);
    $('labelNavPos').textContent = t('doc.position', { index: activeIndex() + 1, total: total });
    $('btnLabelPrev').disabled = activeIndex() <= 0;
    $('btnLabelNext').disabled = activeIndex() >= total - 1;
    $('btnLabelDelete').disabled = total <= 1;
    const sel = $('labelNavSelect');
    sel.innerHTML = state.doc.labels.map(function (l, i) {
      return '<option value="' + i + '"' + (i === activeIndex() ? ' selected' : '') + '>' +
        escapeHtml(pluralT('doc.option', (l.elements || []).length, { index: i + 1 })) + '</option>';
    }).join('');
  }

  function loadLabel(label, fileName, fileHandle, serverFileName) {
    loadDocument(singleLabelDocument(label), fileName, fileHandle, serverFileName);
  }


  // ---------------------------------------------------------------------
  // Selection (multi-select: Ctrl/Cmd-click to toggle, rectangle marquee)
  // ---------------------------------------------------------------------
  function elementById(id) {
    return state.label.elements.find(function (e) { return e.id === id; });
  }
  function selectedElements() {
    return state.label.elements.filter(function (e) { return state.selectedIds.indexOf(e.id) !== -1; });
  }
  function editableSelectedElements() {
    return selectedElements().filter(function (e) { return !e.locked; });
  }
  function isSelected(id) { return state.selectedIds.indexOf(id) !== -1; }
  function toggleSelection(id) {
    const idx = state.selectedIds.indexOf(id);
    if (idx === -1) state.selectedIds.push(id); else state.selectedIds.splice(idx, 1);
  }

  // Persistent groups (see groupSelected/ungroupSelected below): elements
  // sharing a non-null `groupId` are meant to always be selected/moved as one
  // unit, so every selection entry point (click, marquee, right-click) routes
  // through this to expand "the element under the cursor" into "that element
  // plus everyone else in its group".
  function groupMemberIds(el) {
    if (!el || !el.groupId) return [el.id];
    return state.label.elements.filter(function (e) { return e.groupId === el.groupId; }).map(function (e) { return e.id; });
  }
  function expandIdsToGroups(ids) {
    const out = new Set();
    ids.forEach(function (id) {
      const el = elementById(id);
      groupMemberIds(el).forEach(function (mid) { out.add(mid); });
    });
    return Array.from(out);
  }

  // ---------------------------------------------------------------------
  // Placeholder ($NAME$) handling
  // ---------------------------------------------------------------------
  // Generalized over an arbitrary label (not just state.label) so the
  // mail-merge section can check placeholder/column coverage for whichever
  // template a given CSV/XLSX row actually uses.
  function findVariablesIn(label) {
    const names = new Set();
    const re = /\$([A-Za-z0-9_]+)\$/g;
    label.elements.forEach(function (el) {
      const str = el.type === 'barcode' ? el.data : (el.type === 'text' ? el.text : '');
      if (!str) return;
      let m;
      re.lastIndex = 0;
      while ((m = re.exec(str))) names.add(m[1]);
    });
    return Array.from(names).sort();
  }
  function findVariables() {
    return findVariablesIn(state.label);
  }
  function applySampleData(str) {
    if (!state.sampleDataMode || !str) return str;
    return str.replace(/\$([A-Za-z0-9_]+)\$/g, function (whole, name) {
      const v = state.sampleValues[name];
      if (v !== undefined && v !== '') return v;
      // Either never set, or explicitly empty in an imported XML (e.g. <EIKTO/>) -
      // both are "no real value"; when the user wants unfilled placeholders
      // hidden, blank them instead of showing the literal $NAME$ token.
      return state.hideUnfilledPlaceholders ? '' : whole;
    });
  }

  // Apply preview values to a disposable label model before it reaches the
  // ZPL generator. Substituting into an already-generated ZPL string would
  // let a value containing ^ or ~ escape its ^FD field and become a command.
  // The generator owns escaping, so its output remains safe for printers.
  function labelWithSampleData(label) {
    const cloned = cloneLabel(label);
    if (!state.sampleDataMode) return cloned;
    cloned.elements.forEach(function (el) {
      if (el.type === 'text') el.text = applySampleData(el.text || '');
      else if (el.type === 'barcode') el.data = applySampleData(el.data || '');
    });
    return cloned;
  }
  // ---------------------------------------------------------------------
  // Printer resolution / physical units
  //
  // A ZPL label states no resolution of its own - every value in it is a
  // printer dot - so `settings.dpi` is what turns those dots into a physical
  // size for the ruler, the mm readouts and the DPI conversion below.
  // ZPLDpi (zplkit/zpl-dpi.js) owns the actual math, including the detail
  // that "203 dpi" and "300 dpi" are rounded labels for 8 and 12 dots/mm -
  // so converting between them is exactly ×1.5, not 300/203.
  // ---------------------------------------------------------------------
  const DPI = window.ZPLDpi;

  function currentDpi() {
    return (state.label.settings && state.label.settings.dpi) || 203;
  }
  function dotsToMm(dots, dpi) {
    return DPI.dotsToMm(dots, dpi == null ? currentDpi() : dpi);
  }
  // Shared number formatting for every physical readout, in the editor's own
  // locale (German writes "8,5 mm") - one place so the label settings, the
  // coordinate HUD and the element inspector can't drift apart.
  function formatNumber(value, decimals) {
    const d = decimals == null ? 1 : decimals;
    return Number(value).toLocaleString(editorLocaleTag(), { minimumFractionDigits: d, maximumFractionDigits: d });
  }
  function mmLabel(mm, decimals) {
    return formatNumber(mm, decimals) + ' mm';
  }
  // A DPI conversion factor: "1,5" for the clean 203 -> 300 case, but up to
  // four decimals for a custom resolution, where cutting it to the locale's
  // default three would print an approximation as if it were the exact
  // factor that was actually applied.
  function formatFactor(factor) {
    return Number(factor).toLocaleString(editorLocaleTag(), { maximumFractionDigits: 4 });
  }
  // Formats a dot value the way the toolbar's unit selector asks for it,
  // used by the readouts that follow the selection/cursor rather than by the
  // model itself - the model always stays in dots.
  function formatLength(dots) {
    return state.unit === 'mm' ? mmLabel(dotsToMm(dots)) : (Math.round(dots) + ' Dots');
  }
  function formatPoint(x, y) {
    return state.unit === 'mm'
      ? formatNumber(dotsToMm(x)) + ' / ' + formatNumber(dotsToMm(y)) + ' mm'
      : (Math.round(x) + ', ' + Math.round(y));
  }

  // ---------------------------------------------------------------------
  // Font mapping (cosmetic only — real rendering happens on the printer)
  // ---------------------------------------------------------------------
  // Moved into zpl-render.js (ZPLRender) as part of the geometry/sizing
  // extraction - aliased under the same local names so every existing call
  // site below (drawTextElement, wrapText, ...) keeps working unchanged.
  const fontFamilyForId = window.ZPLRender.fontFamilyForId;
  const fontDeclaration = window.ZPLRender.fontDeclaration;

  // ---------------------------------------------------------------------
  // Geometry helpers (all in ZPL "dots", independent of zoom)
  // ---------------------------------------------------------------------
  // ORIENT_RAD/ORIENT_CYCLE and the whole text-measurement family below
  // (dashExtraWidth/measureTextWidth/textWidthScale) moved into
  // zpl-render.js (ZPLRender) - aliased under the same local names so
  // every existing call site keeps working unchanged. ROTATE_HANDLE_RADIUS/
  // OFFSET stay here: they're specific to the rotate-handle hit-testing/
  // drawing this file still owns.
  const ORIENT_RAD = window.ZPLRender.ORIENT_RAD;
  const ORIENT_CYCLE = window.ZPLRender.ORIENT_CYCLE;
  const ROTATE_HANDLE_RADIUS = 6;  // screen px
  const ROTATE_HANDLE_OFFSET = 14; // screen px, diagonally outward from the pivot corner - scaled by zoom

  const dashExtraWidth = window.ZPLRender.dashExtraWidth;
  const measureTextWidth = window.ZPLRender.measureTextWidth;
  const textWidthScale = window.ZPLRender.textWidthScale;
  const ZEBRA_FONT0_DASH_HEIGHT_RATIO = window.ZPLRender.ZEBRA_FONT0_DASH_HEIGHT_RATIO;

  // EAN-13/UPC-A modulo-10 check digit - the weight-3 position always sits
  // immediately to the LEFT of the check digit and alternates from there,
  // which for EAN-13's 12 data digits lands weight 1 on index 0 (even count
  // of positions before the check digit) and for UPC-A's 11 data digits
  // lands weight 3 on index 0 (odd count) - verified against Zebra's own
  // ^BE/^BU docs and reproduces the standard published reference codes
  // (data "400638133393" -> check 1 -> 4006381333931; data "03600029145"
  // -> check 2 -> 036000291452).
  function ean13CheckDigit(digits12) {
    let sum = 0;
    for (let i = 0; i < 12; i++) sum += Number(digits12[i]) * (i % 2 === 0 ? 1 : 3);
    return (10 - (sum % 10)) % 10;
  }
  function upcaCheckDigit(digits11) {
    let sum = 0;
    for (let i = 0; i < 11; i++) sum += Number(digits11[i]) * (i % 2 === 0 ? 3 : 1);
    return (10 - (sum % 10)) % 10;
  }
  // Live status for the check-digit preview under an EAN-13/UPC-A data
  // field: counts only digits (a pasted code with dashes/spaces still
  // works), computes the check digit once the right digit count is typed,
  // and - since real ^BE/^BU data is fed to the printer WITHOUT a
  // pre-computed check digit (see barcodes.js's ean13/upca, which always
  // derive it themselves) - detects a pasted full code (one digit too many)
  // and cross-checks its trailing digit rather than silently accepting or
  // rejecting it.
  function eanUpcCheckDigitStatus(barcodeType, rawData) {
    const requiredLen = barcodeType === 'ean13' ? 12 : 11;
    const calc = barcodeType === 'ean13' ? ean13CheckDigit : upcaCheckDigit;
    const digits = (rawData || '').replace(/\D/g, '');
    const hadNonDigit = /\D/.test(rawData || '');
    if (digits.length === requiredLen) {
      const check = calc(digits);
      return { level: 'ok', text: digits.length + '/' + requiredLen + ' Ziffern – Prüfziffer: ' + check + ' → vollständiger Code: ' + digits + check };
    }
    if (digits.length === requiredLen + 1) {
      const dataPart = digits.slice(0, requiredLen), pastedCheck = digits.slice(requiredLen);
      const calcCheck = calc(dataPart);
      if (String(calcCheck) === pastedCheck) {
        return { level: 'ok', text: digits.length + ' Ziffern (inkl. Prüfziffer) – korrekt: ' + digits };
      }
      return { level: 'warn', text: 'Prüfziffer stimmt nicht: eingegeben ' + pastedCheck + ', berechnet ' + calcCheck + ' – richtiger Code wäre ' + dataPart + calcCheck };
    }
    return {
      level: digits.length > requiredLen + 1 ? 'warn' : 'neutral',
      text: digits.length + '/' + requiredLen + ' Ziffern' + (hadNonDigit ? ' (nur Ziffern werden gezählt)' : '') + (digits.length > requiredLen + 1 ? ' – zu viele Ziffern' : ''),
    };
  }

  // The following geometry/sizing functions all moved into zpl-render.js
  // (ZPLRender) as part of the extraction - aliased/wrapped under the same
  // local names so every existing call site below keeps working unchanged.
  // Wrappers (not plain aliases) supply this editor's own sample-data
  // resolver and label DPI, which the library itself has no opinion on -
  // see zpl-render.js's own header comment for why.
  function renderOpts() {
    return { resolveText: applySampleData, dpi: (state.label.settings && state.label.settings.dpi) || 203 };
  }
  const stripBarcodeControlPrefix = window.ZPLRender.stripBarcodeControlPrefix;
  const isPlaceholderOnlyBarcode = window.ZPLRender.isPlaceholderOnlyBarcode;
  const isUnrotatedType = window.ZPLRender.isUnrotatedType;
  const elementSupportsOrientation = window.ZPLRender.elementSupportsOrientation;
  const isFreeResizable = window.ZPLRender.isFreeResizable;
  const estimateDataMatrixModules = window.ZPLRender.estimateDataMatrixModules;
  const rotatedCorners = window.ZPLRender.rotatedCorners;
  const getOrientation = window.ZPLRender.getOrientation;
  function barcodeEncode(el) { return window.ZPLRender.barcodeEncode(el, renderOpts()); }
  function dataMatrixWH(el) { return window.ZPLRender.dataMatrixWH(el, renderOpts()); }
  function aztecWH(el) { return window.ZPLRender.aztecWH(el, renderOpts()); }
  function maxicodeWH() { return window.ZPLRender.maxicodeWH(renderOpts()); }
  function elementLocalSize(el) { return window.ZPLRender.elementLocalSize(el, renderOpts()); }
  function getBounds(el) { return window.ZPLRender.getBounds(el, renderOpts()); }
  function getLocalBounds(el) { return window.ZPLRender.getLocalBounds(el, renderOpts()); }

  // World-space position of the rotate handle: just outside the element's
  // own (el.x, el.y) origin - the actual point text/barcode rotate around
  // (ctx.translate(el.x, el.y) before ctx.rotate(angle) - see drawTextElement/
  // drawBarcodeElement) - offset diagonally into the empty quadrant next to
  // it (up-left for a top-left/FO pivot, down-left for a bottom-left/FT one)
  // rather than sitting exactly on the pivot, which would overlap the
  // element's own clickable bounds right at that corner.
  function getRotateHandlePos(el) {
    const off = ROTATE_HANDLE_OFFSET / state.zoom;
    const angle = ORIENT_RAD[getOrientation(el)] || 0;
    const lx = -off, ly = el.origin === 'FT' ? off : -off;
    const cos = Math.cos(angle), sin = Math.sin(angle);
    return { x: el.x + lx * cos - ly * sin, y: el.y + lx * sin + ly * cos };
  }

  function getWorldCorners(el, pad) { return window.ZPLRender.getWorldCorners(el, pad, renderOpts()); }
  function getAABB(el) { return window.ZPLRender.getAABB(el, renderOpts()); }

  function snapValue(v) {
    if (!state.grid.enabled) return v;
    const g = Math.max(1, state.grid.size || 1);
    return Math.round(v / g) * g;
  }

  function labelGuides(label) {
    if (!label.editorGuides || typeof label.editorGuides !== 'object') {
      label.editorGuides = { visible: true, snap: true, vertical: [], horizontal: [] };
    }
    const guides = label.editorGuides;
    if (!Array.isArray(guides.vertical)) guides.vertical = [];
    if (!Array.isArray(guides.horizontal)) guides.horizontal = [];
    if (guides.visible == null) guides.visible = true;
    if (guides.snap == null) guides.snap = true;
    return guides;
  }

  function elementAABBAt(el, x, y) { return window.ZPLRender.elementAABBAt(el, x, y, renderOpts()); }

  // Screen-space (zoom-independent) catch radius for snapping to another
  // element's edge/center - matches the feel of the existing rotate-handle
  // hit-tolerance (ROTATE_HANDLE tolerance), just for alignment instead of rotation.
  const ALIGN_SNAP_PX = 6;

  // Smart alignment guides: while dragging a move (not resize, not marquee),
  // checks the PRIMARY dragged element's edges/centers against every other
  // element's (plus the label canvas's own edges/center, a free extra given
  // the same mechanism) - snapping the drag to an exact match within a small
  // screen-pixel tolerance and returning the matched guide line(s) to draw.
  // Only the primary element drives this (not a full group AABB) so a
  // multi-select drag still has one clear, predictable anchor.
  function computeAlignSnap(primaryEl, candX, candY) {
    const tol = ALIGN_SNAP_PX / state.zoom;
    const moving = elementAABBAt(primaryEl, candX, candY);
    const movingXs = [moving.x, moving.x + moving.w / 2, moving.x + moving.w];
    const movingYs = [moving.y, moving.y + moving.h / 2, moving.y + moving.h];

    let bestDx = null, bestDxDist = tol, guideX = null;
    let bestDy = null, bestDyDist = tol, guideY = null;

    function tryTarget(box) {
      const txs = [box.x, box.x + box.w / 2, box.x + box.w];
      const tys = [box.y, box.y + box.h / 2, box.y + box.h];
      txs.forEach(function (tv) {
        movingXs.forEach(function (mv) {
          const d = Math.abs(tv - mv);
          if (d < bestDxDist) { bestDxDist = d; bestDx = tv - mv; guideX = { at: tv, other: box }; }
        });
      });
      tys.forEach(function (tv) {
        movingYs.forEach(function (mv) {
          const d = Math.abs(tv - mv);
          if (d < bestDyDist) { bestDyDist = d; bestDy = tv - mv; guideY = { at: tv, other: box }; }
        });
      });
    }

    const persistent = labelGuides(state.label);
    if (persistent.visible && persistent.snap) {
      persistent.vertical.forEach(function (tv) {
        movingXs.forEach(function (mv) {
          const d = Math.abs(tv - mv);
          if (d < bestDxDist) {
            bestDxDist = d;
            bestDx = tv - mv;
            guideX = { at: tv, other: { x: tv, y: 0, w: 0, h: state.label.settings.heightDots } };
          }
        });
      });
      persistent.horizontal.forEach(function (tv) {
        movingYs.forEach(function (mv) {
          const d = Math.abs(tv - mv);
          if (d < bestDyDist) {
            bestDyDist = d;
            bestDy = tv - mv;
            guideY = { at: tv, other: { x: 0, y: tv, w: state.label.settings.widthDots, h: 0 } };
          }
        });
      });
    }

    const s = state.label.settings;
    tryTarget({ x: 0, y: 0, w: s.widthDots, h: s.heightDots });
    const selectedSet = new Set(state.selectedIds);
    state.label.elements.forEach(function (el) {
      if (selectedSet.has(el.id)) return;
      tryTarget(getAABB(el));
    });

    const snappedX = candX + (bestDx || 0), snappedY = candY + (bestDy || 0);
    const finalMoving = elementAABBAt(primaryEl, snappedX, snappedY);
    return {
      dx: bestDx || 0, dy: bestDy || 0,
      guideX: guideX ? { at: guideX.at, y1: Math.min(finalMoving.y, guideX.other.y), y2: Math.max(finalMoving.y + finalMoving.h, guideX.other.y + guideX.other.h) } : null,
      guideY: guideY ? { at: guideY.at, x1: Math.min(finalMoving.x, guideY.other.x), x2: Math.max(finalMoving.x + finalMoving.w, guideY.other.x + guideY.other.w) } : null,
    };
  }

  function drawAlignGuides() {
    const g = state.alignGuides;
    if (!g || (!g.guideX && !g.guideY)) return;
    ctx.save();
    ctx.strokeStyle = '#FF2D78';
    ctx.lineWidth = Math.max(1, 1 / state.zoom);
    ctx.setLineDash([4 / state.zoom, 3 / state.zoom]);
    if (g.guideX) {
      ctx.beginPath();
      ctx.moveTo(g.guideX.at, g.guideX.y1 - 10 / state.zoom);
      ctx.lineTo(g.guideX.at, g.guideX.y2 + 10 / state.zoom);
      ctx.stroke();
    }
    if (g.guideY) {
      ctx.beginPath();
      ctx.moveTo(g.guideY.x1 - 10 / state.zoom, g.guideY.at);
      ctx.lineTo(g.guideY.x2 + 10 / state.zoom, g.guideY.at);
      ctx.stroke();
    }
    ctx.restore();
  }

  function drawPersistentGuides() {
    const guides = labelGuides(state.label);
    if (!guides.visible || (!guides.vertical.length && !guides.horizontal.length)) return;
    const s = state.label.settings;
    ctx.save();
    ctx.strokeStyle = '#00A7D6';
    ctx.lineWidth = Math.max(1, 1 / state.zoom);
    ctx.setLineDash([7 / state.zoom, 4 / state.zoom]);
    guides.vertical.forEach(function (x) {
      ctx.beginPath(); ctx.moveTo(x, 0); ctx.lineTo(x, s.heightDots); ctx.stroke();
    });
    guides.horizontal.forEach(function (y) {
      ctx.beginPath(); ctx.moveTo(0, y); ctx.lineTo(s.widthDots, y); ctx.stroke();
    });
    ctx.restore();
  }

  function pointInPolygon(px, py, corners) {
    let inside = false;
    for (let i = 0, j = corners.length - 1; i < corners.length; j = i++) {
      const xi = corners[i][0], yi = corners[i][1], xj = corners[j][0], yj = corners[j][1];
      const intersect = ((yi > py) !== (yj > py)) && (px < (xj - xi) * (py - yi) / (yj - yi) + xi);
      if (intersect) inside = !inside;
    }
    return inside;
  }

  // Hit-test in dot space. Rotated text/barcode elements are tested against
  // their true (rotated) quad; box/graphic against their plain AABB.
  function hitTest(dotX, dotY) {
    // A small tolerance keeps boundary/corner clicks (exactly where users grab
    // a resize handle) from missing by a sub-dot rounding difference.
    const pad = Math.max(2, 6 / state.zoom);
    const els = state.label.elements;
    for (let i = els.length - 1; i >= 0; i--) {
      const el = els[i];
      if (el.type === 'raw') continue; // not visual, never selectable
      if (el.hidden) continue; // not drawn - clicking where it would be should reach whatever's underneath
      if (el.locked) continue; // locked layers are deliberately click-through; unlock them in the layers panel
      const corners = getWorldCorners(el, pad);
      if (pointInPolygon(dotX, dotY, corners)) return el;
    }
    return null;
  }

  // ---------------------------------------------------------------------
  // Canvas rendering
  // ---------------------------------------------------------------------
  // Assigning canvas.width/height (even to their current value) forces the
  // browser to reallocate and clear the whole backing store - genuinely
  // expensive, and drawLabel() (which calls this) runs on every mousemove
  // during a drag/resize, so doing it unconditionally was a real source of
  // stutter on larger labels. Skip the reallocation entirely when nothing
  // that affects it has actually changed since the last call.
  let lastCanvasSize = null;
  function resizeCanvas() {
    const dpr = window.devicePixelRatio || 1;
    // Defensive clamp: an oversized <canvas> is silently reset to a 0x0
    // backing store by the browser rather than throwing, which would blank
    // the whole preview with no error shown.
    const widthDots = Math.min(M.MAX_LABEL_DOTS, state.label.settings.widthDots);
    const heightDots = Math.min(M.MAX_LABEL_DOTS, state.label.settings.heightDots);
    const cssW = Math.max(1, Math.round(widthDots * state.zoom));
    const cssH = Math.max(1, Math.round(heightDots * state.zoom));
    const key = cssW + 'x' + cssH + '@' + dpr;
    if (lastCanvasSize === key) return;
    lastCanvasSize = key;
    canvas.style.width = cssW + 'px';
    canvas.style.height = cssH + 'px';
    canvas.width = Math.round(cssW * dpr);
    canvas.height = Math.round(cssH * dpr);
    ctx.setTransform(dpr * state.zoom, 0, 0, dpr * state.zoom, 0, 0);
  }

  function fitZoom() {
    const wrap = $('canvasWrap');
    const availW = wrap.clientWidth - 48;
    const availH = wrap.clientHeight - 48;
    const s = state.label.settings;
    if (s.widthDots > 0 && s.heightDots > 0) {
      state.zoom = Math.max(0.1, Math.min(availW / s.widthDots, availH / s.heightDots, 2));
    }
    $('zoomLabel').textContent = Math.round(state.zoom * 100) + '%';
  }

  // Rebuilding this offscreen canvas (allocate + putImageData) on every
  // single drawLabel() call - which fires on every mousemove while dragging
  // ANYTHING on the label, not just this graphic - was wasted work for a
  // bitmap that only actually changes on import/replace/resize. Cache it per
  // element; a WeakMap means it needs no manual cleanup (never touches the
  // element's own JSON-serializable shape, so history snapshots/export are
  // unaffected) and naturally drops the entry once the element itself is
  // no longer reachable (e.g. after undo/redo rebuilds the elements array).
  const graphicCanvasCache = new WeakMap();
  function drawGraphicElement(el, b) {
    if (!el.bits || !el.widthPx || !el.heightPx) return;
    let cached = graphicCanvasCache.get(el);
    if (!cached || cached.bits !== el.bits || cached.widthPx !== el.widthPx || cached.heightPx !== el.heightPx || cached.fieldReverse !== !!el.fieldReverse) {
      const off = document.createElement('canvas');
      off.width = el.widthPx; off.height = el.heightPx;
      const imgData = window.ZPLGraphic.bitsToImageData({ widthPx: el.widthPx, heightPx: el.heightPx, bytesPerRow: el.bytesPerRow, bytes: el.bits });
      if (el.fieldReverse) {
        // ^FR prints ink exactly where the bitmap has none, and vice versa -
        // bitsToImageData only ever emits opaque black or transparent white,
        // so flipping alpha (with a matching color swap) mirrors that exactly.
        const d = imgData.data;
        for (let i = 0; i < d.length; i += 4) {
          const wasInk = d[i + 3] === 255;
          d[i] = d[i + 1] = d[i + 2] = wasInk ? 255 : 0;
          d[i + 3] = wasInk ? 0 : 255;
        }
      }
      off.getContext('2d').putImageData(imgData, 0, 0);
      cached = { canvas: off, bits: el.bits, widthPx: el.widthPx, heightPx: el.heightPx, fieldReverse: !!el.fieldReverse };
      graphicCanvasCache.set(el, cached);
    }
    // ZPL graphics are 1-bit dot bitmaps - a real printer (and Labelary)
    // always renders them as hard-edged square dots, never blurred. Canvas's
    // default bilinear smoothing would soften every scaled-up/down edge, so
    // it's turned off (and scoped to just this blit) to match.
    ctx.save();
    ctx.imageSmoothingEnabled = false;
    ctx.drawImage(cached.canvas, b.x, b.y, b.w, b.h);
    ctx.restore();
  }

  function roundedRectPath(c, x, y, w, h, r) {
    r = Math.max(0, Math.min(r, w / 2, h / 2));
    c.beginPath();
    if (c.roundRect) {
      c.roundRect(x, y, w, h, r);
    } else {
      c.moveTo(x + r, y);
      c.arcTo(x + w, y, x + w, y + h, r);
      c.arcTo(x + w, y + h, x, y + h, r);
      c.arcTo(x, y + h, x, y, r);
      c.arcTo(x, y, x + w, y, r);
      c.closePath();
    }
  }

  function drawBoxElement(el) {
    ctx.save();
    ctx.fillStyle = el.color === 'W' ? '#fff' : '#000';
    ctx.strokeStyle = ctx.fillStyle;
    const t = Math.max(1, el.thickness || 1);
    const w = Math.max(el.widthDots, 1), h = Math.max(el.heightDots, 1);
    const maxRadius = Math.min(w, h) / 2;
    const radius = Math.min(maxRadius, (el.rounding || 0) / 8 * maxRadius);
    if (w <= t * 2 || h <= t * 2) {
      roundedRectPath(ctx, el.x, el.y, w, h, radius);
      ctx.fill();
    } else {
      // A stroked rounded-rect path (inset by half the border thickness so the
      // OUTER edge lands on the given width/height) draws a hollow rounded
      // border in one shape, and degrades to the old square 4-fillRect look
      // exactly when rounding=0.
      roundedRectPath(ctx, el.x + t / 2, el.y + t / 2, w - t, h - t, Math.max(0, radius - t / 2));
      ctx.lineWidth = t;
      ctx.stroke();
    }
    ctx.restore();
  }

  function drawCircleElement(el) {
    ctx.save();
    ctx.fillStyle = el.color === 'W' ? '#fff' : '#000';
    ctx.strokeStyle = ctx.fillStyle;
    const d = Math.max(el.diameter, 1);
    const t = Math.max(1, el.thickness || 1);
    const cx = el.x + d / 2, cy = el.y + d / 2;
    ctx.beginPath();
    if (t * 2 >= d) {
      ctx.arc(cx, cy, d / 2, 0, Math.PI * 2);
      ctx.fill();
    } else {
      ctx.arc(cx, cy, Math.max(0, d / 2 - t / 2), 0, Math.PI * 2);
      ctx.lineWidth = t;
      ctx.stroke();
    }
    ctx.restore();
  }

  function drawEllipseElement(el) {
    ctx.save();
    ctx.fillStyle = el.color === 'W' ? '#fff' : '#000';
    ctx.strokeStyle = ctx.fillStyle;
    const w = Math.max(el.widthDots, 1), h = Math.max(el.heightDots, 1);
    const t = Math.max(1, el.thickness || 1);
    const cx = el.x + w / 2, cy = el.y + h / 2;
    ctx.beginPath();
    if (t * 2 >= Math.min(w, h)) {
      ctx.ellipse(cx, cy, w / 2, h / 2, 0, 0, Math.PI * 2);
      ctx.fill();
    } else {
      ctx.ellipse(cx, cy, Math.max(0, w / 2 - t / 2), Math.max(0, h / 2 - t / 2), 0, 0, Math.PI * 2);
      ctx.lineWidth = t;
      ctx.stroke();
    }
    ctx.restore();
  }

  function drawLineElement(el) {
    ctx.save();
    ctx.strokeStyle = el.color === 'W' ? '#fff' : '#000';
    const w = el.widthDots, h = el.heightDots;
    const nominalThickness = Math.max(1, el.thickness || 1);
    // ^GD's "thickness" is not a true stroke width perpendicular to the line -
    // verified against Labelary at 7 height:width ratios (fixed width, height
    // from 5 to 200): measured ink coverage tracked thickness*shortSide/
    // longSide almost exactly, meaning a shallow diagonal (the near-horizontal
    // "divider" this app's own sample label uses ^GD for) prints far fainter
    // than `thickness` alone would suggest, sometimes down to barely visible.
    const shortSide = Math.min(w, h), longSide = Math.max(w, h);
    ctx.lineWidth = longSide > 0 ? Math.max(0.05, nominalThickness * shortSide / longSide) : nominalThickness;
    ctx.beginPath();
    if (el.diagonal === 'L') {
      ctx.moveTo(el.x, el.y);
      ctx.lineTo(el.x + w, el.y + h);
    } else {
      ctx.moveTo(el.x, el.y + h);
      ctx.lineTo(el.x + w, el.y);
    }
    ctx.stroke();
    ctx.restore();
  }

  // Data Matrix has no real encoder here - draw a correctly sized/positioned
  // placeholder (checkerboard fill + clear label) instead of either a blank
  // gap or a fake-but-wrong-looking "scannable" symbol.
  // Shared placeholder renderer for every 2D symbology this editor doesn't
  // have a real scannable encoder for (Data Matrix, Aztec, MaxiCode - see
  // each one's BARCODE_TYPES comment for why) - a checkerboard-textured
  // black square with a clearly-labeled overlay, never claiming to be an
  // actually-scannable code. `dotSize` is each type's own module-size
  // concept (Data Matrix/Aztec have a real one; MaxiCode doesn't, so its
  // caller passes a purely cosmetic value).
  function drawBarcodePlaceholder2D(el, b, label, dotSize) {
    ctx.save();
    const angle = ORIENT_RAD[(el.params && el.params.orientation) || 'N'] || 0;
    ctx.translate(el.x, el.y);
    ctx.rotate(angle);
    const originY = el.origin === 'FT' ? -b.h : 0;
    ctx.fillStyle = '#000';
    ctx.fillRect(0, originY, b.w, b.h);
    ctx.fillStyle = '#fff';
    const ds = Math.max(2, dotSize || 6);
    for (let gy = 0; gy + ds <= b.h; gy += ds * 2) {
      for (let gx = 0; gx + ds <= b.w; gx += ds * 2) {
        ctx.fillRect(gx, originY + gy, ds, ds);
      }
    }
    if (b.w > 50 && b.h > 16) {
      ctx.fillStyle = 'rgba(255,255,255,0.85)';
      ctx.fillRect(0, originY + b.h / 2 - 7, b.w, 14);
      ctx.fillStyle = '#b3261e';
      ctx.font = '10px sans-serif';
      ctx.textAlign = 'center';
      ctx.textBaseline = 'middle';
      ctx.fillText(label, b.w / 2, originY + b.h / 2);
      ctx.textAlign = 'left';
    }
    ctx.restore();
  }

  // Both verified directly against Labelary's own rendering at several
  // heights/module widths/DPIs: guard bars print exactly 13 dots taller than
  // the rest, and the outside digit(s) sit exactly 13 dots clear of the bars
  // - both fixed dot amounts, not proportional to anything (the module-width
  // scaling test was inconclusive - Labelary drops the outside digit
  // entirely above a certain module width - so a fixed offset calibrated at
  // this app's own default moduleWidth of 2 is the best-evidenced choice).
  const EAN_GUARD_EXTENSION_DOTS = 13;
  const EAN_OUTSIDE_DIGIT_GAP_DOTS = 13;

  // EAN-13/UPC-A don't print one plain interpretation string like every other
  // symbology here - verified against Labelary's actual output: a digit sits
  // outside the bars on the left (both types) and right (UPC-A only), and the
  // rest are split into two groups under the left/right halves (6+6 for
  // EAN-13, 5+5 for UPC-A). Offsets are in MODULES (always exactly 7 per
  // digit, 3 for the outer guards, 5 for the middle one, regardless of how
  // many bar-array entries a given digit's pattern happens to pack them into
  // - see ean13()'s leftDigitRanges/rightDigitRanges comment for that
  // distinction), multiplied by moduleWidth to get dots.
  function drawEanUpcInterpretation(el, enc, mw, originY, drawH, above) {
    const text = enc.text;
    const ty = above ? originY - 18 : originY + drawH + 2;
    const gap = EAN_OUTSIDE_DIGIT_GAP_DOTS;
    function put(str, xDots) { if (str) ctx.fillText(str, xDots, ty); }
    if (el.barcodeType === 'upca' && text.length === 12) {
      const outsideLeft = text.charAt(0), leftGroup = text.substr(1, 5),
        rightGroup = text.substr(6, 5), outsideRight = text.charAt(11);
      put(outsideLeft, -gap - ctx.measureText(outsideLeft).width);
      put(leftGroup, 10 * mw);
      put(rightGroup, 50 * mw);
      put(outsideRight, 95 * mw + gap);
    } else if (text.length === 13) {
      const outsideLeft = text.charAt(0), leftGroup = text.substr(1, 6), rightGroup = text.substr(7, 6);
      put(outsideLeft, -gap - ctx.measureText(outsideLeft).width);
      put(leftGroup, 3 * mw);
      put(rightGroup, 50 * mw);
    } else {
      put(text, 0); // shouldn't happen - defensive fallback to the old plain layout
    }
  }

  function drawBarcodeElement(el, b) {
    if (el.barcodeType === 'datamatrix') {
      drawBarcodePlaceholder2D(el, b, 'Data Matrix – Vorschau', el.params && el.params.height);
      return;
    }
    if (el.barcodeType === 'aztec') {
      drawBarcodePlaceholder2D(el, b, 'Aztec Code – Vorschau', el.params && el.params.magnification);
      return;
    }
    if (el.barcodeType === 'maxicode') {
      // MaxiCode has no module-size parameter of its own (fixed physical
      // size regardless) - ~30 modules across its ~1 inch width is a
      // reasonable real-world approximation for a purely cosmetic texture.
      drawBarcodePlaceholder2D(el, b, 'MaxiCode – Vorschau', b.w / 30);
      return;
    }
    if (el.barcodeType === 'qrcode') {
      // The one 2D symbology drawn from a real encoder rather than as a
      // placeholder - delegated to zpl-render.js so the editor canvas and
      // every raster export paint the identical module matrix.
      window.ZPLRender.drawQrElement(ctx, el, renderOpts());
      return;
    }
    const enc = barcodeEncode(el);
    ctx.save();
    const angle = ORIENT_RAD[(el.params && el.params.orientation) || 'N'] || 0;
    ctx.translate(el.x, el.origin === 'FT' ? el.y : el.y);
    ctx.rotate(angle);
    const drawH = (el.params && el.params.height) || M.DEFAULT_BARCODE_HEIGHT;
    const originY = el.origin === 'FT' ? -drawH : 0;
    const isEanUpc = el.barcodeType === 'ean13' || el.barcodeType === 'upca';
    if (enc.ok && enc.bars.length) {
      const mw = M.normalizeBarcodeModuleWidth(el.moduleWidth);
      const guardExtension = isEanUpc ? EAN_GUARD_EXTENSION_DOTS : 0;
      const reversed = !!el.fieldReverse;
      if (reversed) {
        const hasInterpretation = !!(el.params && el.params.interpretationLine);
        const textAbove = !!(el.params && el.params.interpretationLineAbove);
        ctx.fillStyle = '#000';
        ctx.fillRect(0, textAbove && hasInterpretation ? originY - 20 : originY,
          window.ZPLBarcode.renderedWidthPx(enc.bars, mw), drawH + guardExtension + (hasInterpretation ? 20 : 0));
      }
      window.ZPLBarcode.renderToCanvas(ctx, enc.bars, 0, originY, mw, drawH, enc.guardRanges, guardExtension, reversed ? { color: '#fff' } : null);
      if (el.params && el.params.interpretationLine) {
        ctx.fillStyle = reversed ? '#fff' : '#000';
        ctx.font = '16px monospace';
        ctx.textBaseline = 'top';
        if (isEanUpc && enc.text) {
          drawEanUpcInterpretation(el, enc, mw, originY, drawH, el.params.interpretationLineAbove);
        } else {
          // interpretationLineAbove flips the human-readable line to the far
          // side of the bars instead of its usual spot underneath them.
          const ty = el.params.interpretationLineAbove ? originY - 18 : originY + drawH + 2;
          ctx.fillText(applySampleData(el.data || ''), 0, ty);
        }
      }
    } else {
      ctx.fillStyle = '#b3261e';
      // A fixed dot-space font size becomes illegible at a small render zoom
      // (e.g. Seriendruck's 0.22x preview thumbnails) - dividing by state.zoom
      // (which renderLabelOffscreen temporarily sets to whatever zoom it's
      // rendering at) keeps this readable at ~11 screen px regardless.
      ctx.font = (11 / state.zoom) + 'px sans-serif';
      ctx.textBaseline = 'top';
      ctx.fillText('[Barcode: ' + (enc.error || 'ungültig') + ']', 0, originY);
    }
    ctx.restore();
  }

  // Draws one line of text, widening any "-" the same way measureTextWidth()
  // already accounts for (see ZEBRA_FONT0_DASH_HEIGHT_RATIO) - a single plain
  // ctx.fillText() call draws the substitute font's own (much narrower) dash,
  // which would make the selection outline/wrap box (sized from
  // measureTextWidth) visibly overshoot the actually-drawn text.
  function fillTextCorrected(text, x, y, fontId, heightDots) {
    if (fontId !== '0' || !text || text.indexOf('-') === -1) { ctx.fillText(text, x, y); return; }
    const naturalDash = ctx.measureText('-').width;
    const extraPerDash = Math.max(0, ZEBRA_FONT0_DASH_HEIGHT_RATIO * heightDots - naturalDash);
    // The probe measurement showed the extra width split roughly evenly as a
    // gap BEFORE and AFTER the dash glyph (not all trailing it), so mirror
    // that rather than just widening the advance on one side.
    const parts = text.split('-');
    let cx = x;
    parts.forEach(function (part, i) {
      if (part) { ctx.fillText(part, cx, y); cx += ctx.measureText(part).width; }
      if (i < parts.length - 1) {
        cx += extraPerDash / 2;
        ctx.fillText('-', cx, y);
        cx += naturalDash + extraPerDash / 2;
      }
    });
  }

  function drawTextElement(el) {
    const displayText = applySampleData(el.text || '');
    const h = el.height || 30;
    const widthScale = textWidthScale(el);
    ctx.save();
    ctx.translate(el.x, el.y);
    ctx.rotate(ORIENT_RAD[el.orientation] || 0);
    // ^A's height,width are independent - stretch horizontally to approximate a
    // width that differs from height. Everything drawn below (and all the
    // measureTextWidth-based layout math) works in natural (pre-stretch) units;
    // this transform maps them back to true world-dot width.
    ctx.scale(widthScale, 1);
    ctx.font = fontDeclaration(h, el.font);
    ctx.textBaseline = el.origin === 'FT' ? 'alphabetic' : 'top';
    ctx.fillStyle = '#000';

    let lines = [displayText];
    let boxW = null, justify = 'L', hangingIndent = 0;
    // ZPL has no implicit line leading the way desktop/CSS fonts do - per the
    // ^FB spec, its line-spacing parameter only "adds or deletes space between
    // lines" from a default of 0, meaning consecutive lines sit exactly `h`
    // dots apart (flush) with nothing extra unless the label asks for it.
    const lineAdvance = h + (el.fieldBlock && el.fieldBlock.lineSpacing ? el.fieldBlock.lineSpacing : 0);
    if (el.fieldBlock) {
      boxW = el.fieldBlock.widthDots / widthScale;
      justify = el.fieldBlock.justify || 'L';
      hangingIndent = el.fieldBlock.hangingIndent || 0;
      // ZPL's ^FB maxLines=0 means "as many lines as needed" (unbounded), not
      // zero - `|| 1` would treat that falsy 0 as "just one line" and truncate.
      const maxLines = el.fieldBlock.maxLines != null ? el.fieldBlock.maxLines : 1;
      lines = wrapTextCached(el, displayText, boxW, el.font, h, maxLines, hangingIndent);
    }

    if (el.fieldReverse) {
      ctx.save();
      ctx.fillStyle = '#000';
      const totalH = (lines.length - 1) * lineAdvance + h;
      const topY = el.origin === 'FT' ? -h : 0;
      ctx.fillRect(0, topY, boxW || measureTextWidth(displayText, el.font, h), totalH);
      ctx.restore();
      ctx.fillStyle = '#fff';
    }

    lines.forEach(function (line, i) {
      const ly = i * lineAdvance;
      // ^FB's 5th param hangs the second and later lines in from the left
      // by this many dots, without moving the block's right edge (boxW).
      const indent = i === 0 ? 0 : hangingIndent;
      const isLastLine = i === lines.length - 1;
      if (boxW != null && justify === 'J' && !isLastLine && line.indexOf(' ') !== -1) {
        // Full justify: stretch inter-word gaps so the line exactly fills boxW.
        const words = line.split(' ');
        const availW = boxW - indent;
        const wordsWidth = words.reduce(function (sum, w) { return sum + measureTextWidth(w, el.font, h); }, 0);
        const gapCount = words.length - 1;
        const gap = gapCount > 0 ? (availW - wordsWidth) / gapCount : 0;
        let cx = indent;
        words.forEach(function (w) {
          fillTextCorrected(w, cx, ly, el.font, h);
          cx += measureTextWidth(w, el.font, h) + gap;
        });
        return;
      }
      let lx = indent;
      if (boxW != null) {
        const lw = measureTextWidth(line, el.font, h);
        const availW = boxW - indent;
        if (justify === 'C') lx = indent + (availW - lw) / 2;
        else if (justify === 'R') lx = indent + (availW - lw);
        // Note: justify 'J' (full justify) reaches here only for its last line
        // (handled above for all other lines), which is conventionally left-aligned.
      }
      fillTextCorrected(line, lx, ly, el.font, h);
    });
    ctx.restore();
  }

  // wrapText() does an O(words) measureText() pass (canvas text measurement
  // is one of the pricier canvas ops) - drawTextElement() runs it once per
  // fieldBlock text element on EVERY drawLabel() call, i.e. every mousemove
  // during a drag of any element anywhere on the label, even when this
  // particular text hasn't changed at all. Cache the wrapped lines per
  // element, keyed on everything the wrap actually depends on.
  const textWrapCache = new WeakMap();
  function wrapTextCached(el, text, maxWidth, fontId, heightDots, maxLines, hangingIndent) {
    const key = text + '|' + maxWidth + '|' + fontId + '|' + heightDots + '|' + maxLines + '|' + hangingIndent;
    const cached = textWrapCache.get(el);
    if (cached && cached.key === key) return cached.lines;
    const lines = wrapText(text, maxWidth, fontId, heightDots, maxLines, hangingIndent);
    textWrapCache.set(el, { key: key, lines: lines });
    return lines;
  }
  function wrapText(text, maxWidth, fontId, heightDots, maxLines, hangingIndent) {
    hangingIndent = hangingIndent || 0;
    const words = (text || '').split(/\s+/).filter(Boolean);
    const lines = [];
    let cur = '';
    words.forEach(function (w) {
      // Lines after the first wrap against a narrower width, since the
      // hanging indent eats into their available space without moving boxW.
      const limit = lines.length === 0 ? maxWidth : Math.max(1, maxWidth - hangingIndent);
      const test = cur ? cur + ' ' + w : w;
      if (measureTextWidth(test, fontId, heightDots) > limit && cur) {
        lines.push(cur);
        cur = w;
      } else {
        cur = test;
      }
    });
    if (cur) lines.push(cur);
    if (lines.length === 0) lines.push('');
    if (maxLines > 0 && lines.length > maxLines) lines.length = maxLines;
    return lines;
  }

  function drawSelectionOverlay(el, showHandles) {
    ctx.save();
    ctx.strokeStyle = el.locked ? '#7C879D' : '#FFD602';
    ctx.lineWidth = Math.max(1, 1.5 / state.zoom);
    ctx.setLineDash([5 / state.zoom, 3 / state.zoom]);
    let b = null; // computed below when unrotated - isFreeResizable(el) (checked further down) implies isUnrotatedType, so reuse it there instead of calling getBounds(el) twice
    if (isUnrotatedType(el.type)) {
      b = getBounds(el);
      ctx.strokeRect(b.x - 2, b.y - 2, b.w + 4, b.h + 4);
    } else {
      // Draw the outline in the same rotated frame the element itself is
      // drawn in, so a rotated text/barcode gets a matching rotated outline
      // instead of a stale unrotated one.
      const local = getLocalBounds(el);
      const angle = ORIENT_RAD[getOrientation(el)] || 0;
      ctx.translate(el.x, el.y);
      ctx.rotate(angle);
      ctx.strokeRect(local.x - 2, local.y - 2, local.w + 4, local.h + 4);
      if (showHandles && !el.locked && elementSupportsOrientation(el)) {
        // Rotate handle - drawn just outside local (0,0), the pivot
        // text/barcode actually rotates around (see getRotateHandlePos),
        // in the empty diagonal next to it (up-left for FO, down-left for
        // FT) so it stays visually tied to that corner without overlapping
        // the element's own clickable area right at the same point.
        const off = ROTATE_HANDLE_OFFSET / state.zoom;
        const hx = -off, hy = el.origin === 'FT' ? off : -off;
        ctx.setLineDash([]);
        ctx.strokeStyle = '#051E50';
        ctx.lineWidth = Math.max(1, 1 / state.zoom);
        ctx.beginPath();
        ctx.moveTo(0, 0);
        ctx.lineTo(hx, hy);
        ctx.stroke();
        ctx.beginPath();
        ctx.fillStyle = '#051E50';
        ctx.arc(hx, hy, ROTATE_HANDLE_RADIUS / state.zoom, 0, Math.PI * 2);
        ctx.fill();
        ctx.fillStyle = '#FFD602';
        ctx.beginPath();
        ctx.arc(hx, hy, ROTATE_HANDLE_RADIUS / state.zoom - 2.5 / state.zoom, 0, Math.PI * 2);
        ctx.fill();
      }
    }
    ctx.setLineDash([]);
    // Resize-handle squares only make sense (and are only interactive) when
    // this is the SOLE selected element - showing them during a multi-select
    // would suggest a per-element resize that a group-drag doesn't support.
    if (showHandles && !el.locked && isFreeResizable(el)) {
      if (!b) b = getBounds(el); // isFreeResizable implies isUnrotatedType, but guard anyway rather than assume the branch above always ran first
      const hs = 6 / state.zoom;
      ctx.fillStyle = '#051E50';
      [[b.x, b.y], [b.x + b.w, b.y], [b.x, b.y + b.h], [b.x + b.w, b.y + b.h]].forEach(function (p) {
        ctx.fillRect(p[0] - hs / 2, p[1] - hs / 2, hs, hs);
      });
    }
    ctx.restore();
  }

  function drawGrid() {
    const s = state.label.settings;
    const g = Math.max(1, state.grid.size || 1);
    const cols = s.widthDots / g, rows = s.heightDots / g;
    // A very fine grid on a large label would mean thousands of line segments
    // redrawn on every mousemove during a drag - keep snapping active but skip
    // the visual overlay rather than let the UI bog down.
    if (cols + rows > 800) return;
    ctx.save();
    ctx.strokeStyle = 'rgba(5,30,80,0.15)';
    ctx.lineWidth = Math.max(0.5, 1 / state.zoom);
    ctx.beginPath();
    for (let x = 0; x <= s.widthDots; x += g) { ctx.moveTo(x, 0); ctx.lineTo(x, s.heightDots); }
    for (let y = 0; y <= s.heightDots; y += g) { ctx.moveTo(0, y); ctx.lineTo(s.widthDots, y); }
    ctx.stroke();
    ctx.restore();
  }

  function drawMarqueeOverlay() {
    const d = state.drag;
    const x1 = Math.min(d.startDotX, d.curDotX), x2 = Math.max(d.startDotX, d.curDotX);
    const y1 = Math.min(d.startDotY, d.curDotY), y2 = Math.max(d.startDotY, d.curDotY);
    ctx.save();
    ctx.fillStyle = 'rgba(5,30,80,0.08)';
    ctx.fillRect(x1, y1, x2 - x1, y2 - y1);
    ctx.strokeStyle = '#051E50';
    ctx.lineWidth = Math.max(1, 1 / state.zoom);
    ctx.setLineDash([4 / state.zoom, 3 / state.zoom]);
    ctx.strokeRect(x1, y1, x2 - x1, y2 - y1);
    ctx.restore();
  }

  // White background + every element, nothing else (no grid/selection/marquee) -
  // shared by the live canvas (drawLabel) and any offscreen render of an
  // arbitrary label (diff overlay, multi-label thumbnails).
  // Returns the list of elements that failed to render ({id, type, error}) -
  // empty when everything drew fine. A broken element never takes down the
  // whole preview, but silently dropping it with only a console.warn meant
  // there was no way to notice from the UI - callers that care (Seriendruck's
  // batch preview, most of all: it exists specifically to catch bad data
  // BEFORE a physical print run) can surface this list instead.
  function drawElementsOnly(label) {
    ctx.save();
    ctx.fillStyle = '#ffffff';
    ctx.fillRect(0, 0, label.settings.widthDots, label.settings.heightDots);
    ctx.restore();

    const failures = [];
    label.elements.forEach(function (el) {
      if (el.hidden) return; // Ebenen-tab visibility toggle - editor/preview only, see zpl-generator.js's matching skip for the export side
      try {
        if (el.type === 'box') drawBoxElement(el);
        else if (el.type === 'circle') drawCircleElement(el);
        else if (el.type === 'line') drawLineElement(el);
        else if (el.type === 'ellipse') drawEllipseElement(el);
        else if (el.type === 'graphic') drawGraphicElement(el, getBounds(el));
        // drawBarcodeElement only reads `b` for the placeholder-rendered 2D
        // symbologies (Data Matrix/Aztec/MaxiCode) - every other symbology
        // computes its own draw height independently, so skip the
        // getBounds() call (barcode-encode + module-count) for the common
        // case rather than computing and discarding it every frame.
        else if (el.type === 'barcode') {
          const needsBounds = el.barcodeType === 'datamatrix' || el.barcodeType === 'aztec' || el.barcodeType === 'maxicode';
          drawBarcodeElement(el, needsBounds ? getBounds(el) : null);
        }
        else if (el.type === 'text') drawTextElement(el);
      } catch (e) {
        // A broken element should never take down the whole preview.
        console.warn('render error for element', el.id, e);
        failures.push({ id: el.id, type: el.type, error: e });
      }
    });
    return failures;
  }

  function drawLabel() {
    resizeCanvas();
    drawElementsOnly(state.label);

    if (state.grid.enabled) drawGrid();
    drawPersistentGuides();

    const showHandles = state.selectedIds.length === 1;
    state.selectedIds.forEach(function (id) {
      const el = elementById(id);
      if (el) drawSelectionOverlay(el, showHandles);
    });

    drawAlignGuides();
    if (state.drag && state.drag.mode === 'marquee') drawMarqueeOverlay();
  }

  // Temporarily points the module's `ctx`/`state.label`/`state.zoom` at an
  // arbitrary label and offscreen canvas context so the exact same
  // draw*Element functions (which read those as closures, not parameters)
  // render it correctly - used for the diff overlay and multi-label
  // thumbnails, without duplicating any drawing logic. Grid/selection/drag
  // are irrelevant for those and intentionally left out (see drawElementsOnly).
  function renderLabelOffscreen(label, targetCtx, zoom) {
    const savedCtx = ctx, savedLabel = state.label, savedZoom = state.zoom, savedSelected = state.selectedIds;
    ctx = targetCtx;
    state.label = label;
    state.zoom = zoom;
    state.selectedIds = [];
    targetCtx.setTransform(zoom, 0, 0, zoom, 0, 0);
    try {
      return drawElementsOnly(label);
    } finally {
      ctx = savedCtx; state.label = savedLabel; state.zoom = savedZoom; state.selectedIds = savedSelected;
    }
  }

  // ---------------------------------------------------------------------
  // Property panel (schema-driven form per element type)
  // ---------------------------------------------------------------------
  let propFormBuiltForId = null;
  let propFormBuiltForType = null;
  // "Format kopieren/einfügen" (see the text property panel below) - a tiny
  // session-only clipboard for the four cosmetic text properties that tend
  // to get re-typed by hand across many similar fields on the same label.
  // Deliberately NOT part of state/history - it's an editor convenience,
  // not label content, and should survive undo/redo untouched.
  let copiedTextFormat = null;

  // Associates the visible <label> with its control (id + matching `for`) so
  // a screen reader announces the field's name instead of just "edit text" /
  // "spin button", and clicking the label focuses/toggles the control - this
  // one helper backs nearly every field in the property panel and label
  // settings form, so fixing it here covers all of them without touching
  // each of the ~50 call sites. Derives a stable id from the input's own
  // data-bind path when there's no id already on it (some label-settings
  // fields set one explicitly, e.g. id="lsWidth" - those are reused as-is).
  // Only one property form is ever in the DOM at a time (buildPropForm
  // replaces #propForm's innerHTML wholesale on every rebuild), so reusing
  // the same derived id across rebuilds for different elements is safe.
  let fieldIdCounter = 0;
  function field(labelText, inputHtml) {
    const existingId = /\sid="([^"]+)"/.exec(inputHtml);
    let id = existingId ? existingId[1] : null;
    if (!id) {
      const tagStart = /^<(input|select|textarea)\b/.exec(inputHtml);
      if (tagStart) {
        const dataBind = /data-bind="([^"]+)"/.exec(inputHtml);
        id = dataBind ? 'f_' + dataBind[1].replace(/[^a-zA-Z0-9]/g, '_') : 'f_auto_' + (++fieldIdCounter);
        inputHtml = inputHtml.replace(/^<(input|select|textarea)\b/, '<$1 id="' + id + '"');
      }
    }
    const labelTag = id ? ('<label for="' + id + '">') : '<label>';
    return '<div class="field-row">' + labelTag + t(labelText) + '</label>' + inputHtml + '</div>';
  }
  function fieldPair(a, b) {
    return '<div class="field-row-inline">' + a + b + '</div>';
  }
  function optionsHtml(options, current, translateLabels) {
    return options.map(function (o) {
      const val = typeof o === 'object' ? o.id : o;
      const lab = typeof o === 'object' ? o.label : o;
      // Names from a CSV/XML/template are user data, so callers must opt in
      // before a display label is translated. This keeps a column literally
      // named "Text" from being rewritten to "Texte" in the UI.
      const display = translateLabels ? t(lab) : lab;
      return '<option value="' + val + '"' + (String(val) === String(current) ? ' selected' : '') + '>' + display + '</option>';
    }).join('');
  }

  // Friendly labels + input constraints for barcode schema params beyond the
  // hand-placed orientation/height - keeps every BARCODE_TYPES entry (present
  // and future) fully editable without hand-picking fields per type.
  const BARCODE_PARAM_LABELS = {
    checkDigit: 'Prüfziffer', mode: 'Modus (Code128)', interpretationLine: 'Klartextzeile anzeigen',
    interpretationLineAbove: 'Klartextzeile oberhalb', quality: 'Qualität / ECC',
    columns: 'Spalten (0 = automatisch)', rows: 'Zeilen (0 = automatisch)', format: 'Format-ID',
    escapeChar: 'Escape-Zeichen', aspect: 'Seitenverhältnis (1=quadratisch, 2=rechteckig)',
    magnification: 'Vergrößerung (1–10)', errorControl: 'Fehlerkorrektur/Symbolgröße',
    menuSymbol: 'Menü-Symbol (Bordkarten)', appendCount: 'Gruppengröße (1–26)', appendId: 'Gruppen-ID',
    eci: 'ECI (erweiterte Zeichenkodierung)', symbolNumber: 'Symbolnummer', totalSymbols: 'Gruppengröße (Symbole gesamt)',
    model: 'Modell (1 oder 2)', errorCorrection: 'Fehlerkorrektur', maskValue: 'Maskierung (0–7)',
  };
  const BARCODE_PARAM_ATTRS = {
    quality: 'min="0" max="200" step="10"', columns: 'min="0" max="49"', rows: 'min="0" max="49"',
    format: 'min="1" max="6"', aspect: 'min="1" max="2"',
    magnification: 'min="1" max="10"', appendCount: 'min="1" max="26"',
    symbolNumber: 'min="1" max="8"', totalSymbols: 'min="1" max="8"',
    model: 'min="1" max="2"', maskValue: 'min="0" max="7"',
  };
  // 'mode' means different things per barcode type (Code128's subset letter
  // vs. MaxiCode's numeric 2-6 mode) - override by type where the generic
  // key-only label would be misleading.
  const BARCODE_PARAM_LABELS_BY_TYPE = {
    maxicode: { mode: 'Modus (2–6)' },
    // For QR the magnification IS the module size in dots, and the level
    // here is only a fallback: a "QA," style prefix in the field data wins.
    qrcode: { magnification: 'Modulgröße in Dots (1–10)', errorCorrection: 'Fehlerkorrektur (H/Q/M/L, Vorgabe)' },
  };
  function barcodeParamField(p, el) {
    const path = 'params.' + p.key;
    const byType = BARCODE_PARAM_LABELS_BY_TYPE[el.barcodeType];
    const label = (byType && byType[p.key]) || BARCODE_PARAM_LABELS[p.key] || p.key;
    if (p.kind === 'bool') {
      return '<div class="field-row field-check"><input type="checkbox" data-bind="' + path + '" id="cb_' + p.key + '"><label for="cb_' + p.key + '">' + label + '</label></div>';
    }
    if (p.kind === 'int') {
      return field(label, '<input type="number" ' + (BARCODE_PARAM_ATTRS[p.key] || 'min="0"') + ' data-bind="' + path + '">');
    }
    if (p.options) {
      return field(label, '<select data-bind="' + path + '">' + optionsHtml(p.options, el.params ? el.params[p.key] : p.default, true) + '</select>');
    }
    return field(label, '<input type="text" data-bind="' + path + '">');
  }

  // Eigenschaften and Label share one tab: with nothing selected, the
  // label-level settings form is the more useful default; as soon as
  // something is selected, its own properties take over instead.
  function updatePropTabVisibility() {
    const hasSelection = state.selectedIds.length > 0;
    $('labelSettingsForm').classList.toggle('hidden', hasSelection);
    $('propForm').classList.toggle('hidden', !hasSelection);
  }

  // Thin wrapper: every call site that changes the selection or rebuilds the
  // properties form should also refresh the ZPL-view highlight, and this is
  // the one function ALL of those call sites already funnel through - easier
  // to guarantee here once than to add the same call at every selection
  // change (canvas click, marquee, context menu, keyboard, duplicate/delete...).
  function buildPropForm() {
    buildPropFormImpl();
    updateZplHighlight();
  }
  function buildPropFormImpl() {
    updatePropTabVisibility();
    // Refreshes the label-settings panel (which becomes visible right here,
    // on every transition to "nothing selected") so its Zeichensatz/umlaut
    // warning reflects whatever text was just typed into an element while
    // it was selected - buildLabelSettingsForm() is otherwise only called
    // once, when a label is first loaded.
    if (state.selectedIds.length === 0) buildLabelSettingsForm();
    const container = $('propForm');
    if (state.selectedIds.length === 0) {
      container.innerHTML = '<p class="hint">Kein Element ausgewählt. Wähle ein Element auf dem Label oder füge über die Werkzeugleiste eines hinzu.</p>';
      propFormBuiltForId = null;
      return;
    }
    if (state.selectedIds.length > 1) {
      buildMultiPropForm();
      propFormBuiltForId = 'MULTI';
      propFormBuiltForType = 'multi';
      return;
    }

    const el = elementById(state.selectedIds[0]);
    if (!el) {
      container.innerHTML = '<p class="hint">Kein Element ausgewählt. Wähle ein Element auf dem Label oder füge über die Werkzeugleiste eines hinzu.</p>';
      propFormBuiltForId = null;
      return;
    }
    if (el.locked) {
      propFormBuiltForId = el.id;
      propFormBuiltForType = 'locked';
      container.innerHTML = '<div class="section-title">' + escapeHtml(layerLabel(el)) + '</div>' +
        '<p class="hint locked-hint">Dieses Element ist gesperrt und kann weder auf dem Label noch über die Eigenschaften verändert werden.</p>' +
        '<p class="hint">Position: ' + escapeHtml(formatPoint(el.x, el.y)) + '</p>' +
        '<div class="btn-row"><button id="btnUnlockEl">Element entsperren</button></div>' +
        '<div class="btn-row"><button id="btnCopyLockedEl">Kopieren</button></div>';
      $('btnUnlockEl').addEventListener('click', function () { setSelectionLocked(false); });
      $('btnCopyLockedEl').addEventListener('click', copySelected);
      translateFragment(container);
      return;
    }
    if (propFormBuiltForId === el.id && propFormBuiltForType === el.type) {
      syncPropFormValues(el);
      return;
    }
    propFormBuiltForId = el.id;
    propFormBuiltForType = el.type;

    let html = '<div class="section-title">Position</div>';
    html += fieldPair(
      field('X (Dots)', '<input type="number" data-bind="x">'),
      field('Y (Dots)', '<input type="number" data-bind="y">')
    );
    html += field('Ankerpunkt', '<select data-bind="origin"><option value="FO">FO – obere linke Ecke</option><option value="FT">FT – Grundlinie (Typeset)</option></select>');
    html += '<p class="hint" id="elPhysical"></p>';
    html += '<p class="hint">X/Y sind der Abstand vom linken bzw. oberen Rand des Etiketts in Bildpunkten (Dots). FO verankert oben links, FT an der Schriftgrundlinie – wichtig, wenn Text unterschiedlich hoch ist.</p>';

    if (el.type === 'text') {
      html += '<div class="section-title">Text</div>';
      html += field('Inhalt', '<textarea data-bind="text" rows="2"></textarea>');
      html += fieldPair(
        field('Schrift', '<select data-bind="font">' + optionsHtml(M.FONTS.map(function (f) { return { id: f.id, label: f.label }; }), el.font, true) + '</select>'),
        field('Ausrichtung', '<select data-bind="orientation">' + optionsHtml(M.ORIENTATIONS, el.orientation, true) + '</select>')
      );
      html += '<p class="hint">Ausrichtung dreht den Text in 90°-Schritten (0°/90°/180°/270°) – freie Drehwinkel kennt ZPL nicht.</p>';
      html += fieldPair(
        field('Höhe (Dots)', '<input type="number" min="1" data-bind="height">'),
        field('Breite (0=auto)', '<input type="number" min="0" data-bind="width">')
      );
      html += '<p class="hint">Höhe und Breite lassen sich unabhängig skalieren, z. B. für besonders hohen oder schmalen Text.</p>';
      html += '<p class="hint rotate-hint">Der Punkt am Drehpunkt (Ankerpunkt) auf dem Label dreht ebenfalls (Klick = weiterdrehen).</p>';
      html += '<div class="field-row field-check"><input type="checkbox" data-bind="fieldReverse" id="cbReverse"><label for="cbReverse">Invertiert (weiß auf schwarz)</label></div>';
      html += '<div class="field-row field-check"><input type="checkbox" data-bind="hasFieldBlock" id="cbFB"><label for="cbFB">Textblock (mehrzeilig / ^FB)</label></div>';
      html += '<div id="fbFields"></div>';
      html += '<div class="btn-row">' +
        '<button id="btnCopyTextFormat" title="Schriftart, Höhe, Breite und Ausrichtung dieses Elements merken">Format kopieren</button>' +
        '<button id="btnPasteTextFormat" title="Gemerktes Format auf dieses Element anwenden"' + (copiedTextFormat ? '' : ' disabled') + '>Format einfügen</button>' +
        '</div>';
    } else if (el.type === 'barcode') {
      const schema = M.BARCODE_TYPES[el.barcodeType] || M.BARCODE_TYPES.code128;
      html += '<div class="section-title">Barcode</div>';
      html += field('Typ', '<select data-bind="barcodeType">' + optionsHtml(Object.keys(M.BARCODE_TYPES).map(function (k) { return { id: k, label: M.BARCODE_TYPES[k].label }; }), el.barcodeType, true) + '</select>');
      html += field('Daten', '<textarea data-bind="data" rows="2"></textarea>');
      html += '<p class="hint">Der Inhalt, der im Barcode codiert und beim Scannen wieder ausgelesen wird.</p>';
      if (el.barcodeType === 'ean13' || el.barcodeType === 'upca') {
        html += '<p class="hint" id="checkDigitPreview"></p>';
      }
      if (el.barcodeType === 'qrcode') {
        // ^BY (Modulbreite/Verhältnis) has no effect on a QR at all - its
        // size comes from ^BQ's own magnification parameter - so offering
        // those two fields here would only invite pointless edits.
        html += '<p class="hint" id="qrStatus"></p>';
        html += '<p class="hint">Dieser QR-Code wird echt codiert und ist scanbar &ndash; auch in PNG/PDF-Exporten. Die Fehlerkorrekturstufe darf zus&auml;tzlich im Datenfeld stehen (z.&nbsp;B. <code>QA,Inhalt</code> f&uuml;r Stufe Q im automatischen Modus); steht dort eine, hat sie Vorrang vor der Vorgabe unten. Modulbreite/Verh&auml;ltnis (^BY) wirken auf einen QR-Code nicht.</p>';
      } else if (isPlaceholderOnlyBarcode(el.barcodeType)) {
        html += '<p class="hint">2D-Code für Scanner (z. B. Sendungs-/Palettendaten). Die Vorschau ist nur eine Annäherung, kein scanbarer Code.</p>';
      } else {
        html += fieldPair(
          field('Modulbreite', '<input type="number" min="1" max="10" step="1" data-bind="moduleWidth">'),
          field('Verhältnis', '<input type="number" min="2" max="3" step="0.1" data-bind="ratio">')
        );
        html += '<p class="hint">Modulbreite ist die Breite des schmalsten Strichs, gr&ouml;&szlig;ere Werte machen den Barcode breiter und leichter lesbar.</p>';
      }
      const hasHeightParam = schema.params.some(function (p) { return p.key === 'height'; });
      // ^BQ HAS an orientation parameter positionally (it must stay in the
      // schema so the parser's positional zip and the round-trip stay
      // exact), but Zebra documents it as a fixed value that ^FW does not
      // affect - so offering the select would be an editable control with
      // no effect on the printed label. Same reasoning as hiding ^BY above,
      // and it matches elementSupportsOrientation suppressing the on-canvas
      // rotate handle for QR.
      const hasOrientationParam = schema.params.some(function (p) { return p.key === 'orientation'; }) &&
        elementSupportsOrientation(el);
      const heightField = hasHeightParam ? field('Höhe (Dots)', '<input type="number" min="1" data-bind="params.height">') : '';
      const orientField = hasOrientationParam ? field('Ausrichtung', '<select data-bind="params.orientation">' + optionsHtml(M.ORIENTATIONS, el.params.orientation, true) + '</select>') : '';
      if (hasHeightParam && hasOrientationParam) html += fieldPair(heightField, orientField);
      else html += heightField + orientField;
      if (hasOrientationParam) {
        html += '<p class="hint rotate-hint">Der Punkt am Drehpunkt (Ankerpunkt) auf dem Label dreht ebenfalls (Klick = weiterdrehen).</p>';
      }
      // Generic pass over every OTHER schema param (checkDigit, mode,
      // quality/columns/rows for Data Matrix, ...) - covers each barcode
      // type's full real option set without hand-picking fields per type.
      const otherParams = schema.params.filter(function (p) { return p.key !== 'orientation' && p.key !== 'height'; });
      const numericOrSelect = otherParams.filter(function (p) { return p.kind !== 'bool'; });
      const boolParams = otherParams.filter(function (p) { return p.kind === 'bool'; });
      for (let i = 0; i < numericOrSelect.length; i += 2) {
        const a = barcodeParamField(numericOrSelect[i], el);
        const b = numericOrSelect[i + 1] ? barcodeParamField(numericOrSelect[i + 1], el) : '';
        html += b ? fieldPair(a, b) : a;
      }
      boolParams.forEach(function (p) { html += barcodeParamField(p, el); });
      html += '<div id="barcodeError" class="hint" style="color:#B3261E"></div>';
    } else if (el.type === 'box') {
      html += '<div class="section-title">Box</div>';
      html += fieldPair(
        field('Breite (Dots)', '<input type="number" min="1" data-bind="widthDots">'),
        field('Höhe (Dots)', '<input type="number" min="1" data-bind="heightDots">')
      );
      html += fieldPair(
        field('Linienstärke', '<input type="number" min="1" data-bind="thickness">'),
        field('Farbe', '<select data-bind="color"><option value="B">Schwarz</option><option value="W">Weiß</option></select>')
      );
      html += field('Eckenrundung (0&ndash;8)', '<input type="number" min="0" max="8" data-bind="rounding">');
      html += '<p class="hint">0 ergibt scharfe Ecken, h&ouml;here Werte runden sie ab. Farbe Schwarz druckt Farbe, Wei&szlig; spart diese Stelle aus (z.&nbsp;B. um ein Loch in eine schwarze Fl&auml;che zu &bdquo;stanzen&ldquo;).</p>';
    } else if (el.type === 'circle') {
      html += '<div class="section-title">Kreis</div>';
      html += fieldPair(
        field('Durchmesser (Dots)', '<input type="number" min="3" data-bind="diameter">'),
        field('Linienstärke', '<input type="number" min="1" data-bind="thickness">')
      );
      html += field('Farbe', '<select data-bind="color"><option value="B">Schwarz</option><option value="W">Wei&szlig;</option></select>');
      html += '<p class="hint">Schwarz druckt Farbe, Wei&szlig; spart diese Stelle aus.</p>';
    } else if (el.type === 'line') {
      html += '<div class="section-title">Linie</div>';
      html += fieldPair(
        field('Breite (Dots)', '<input type="number" min="1" data-bind="widthDots">'),
        field('Höhe (Dots)', '<input type="number" min="1" data-bind="heightDots">')
      );
      html += fieldPair(
        field('Linienstärke', '<input type="number" min="1" data-bind="thickness">'),
        field('Farbe', '<select data-bind="color"><option value="B">Schwarz</option><option value="W">Weiß</option></select>')
      );
      html += field('Richtung', '<select data-bind="diagonal"><option value="R">/ (rechts ansteigend)</option><option value="L">\\ (links abfallend)</option></select>');
      html += '<p class="hint">Für eine horizontale Linie die Höhe, für eine vertikale die Breite auf die Linienstärke setzen.</p>';
    } else if (el.type === 'ellipse') {
      html += '<div class="section-title">Ellipse</div>';
      html += fieldPair(
        field('Breite (Dots)', '<input type="number" min="1" data-bind="widthDots">'),
        field('Höhe (Dots)', '<input type="number" min="1" data-bind="heightDots">')
      );
      html += fieldPair(
        field('Linienstärke', '<input type="number" min="1" data-bind="thickness">'),
        field('Farbe', '<select data-bind="color"><option value="B">Schwarz</option><option value="W">Weiß</option></select>')
      );
      html += '<p class="hint">Gleiche Breite und Höhe ergeben einen Kreis. Schwarz druckt Farbe, Weiß spart diese Stelle aus.</p>';
    } else if (el.type === 'graphic' && el.storedName) {
      html += '<div class="section-title">Verknüpfte Grafik</div>';
      html += '<p class="hint">Einmal unter dem Namen <code>' + escapeHtml(el.storedName) + '</code> gespeichert und hier nur platziert (z. B. ein Logo) &ndash; Änderungen wirken auf alle Elemente, die diesen Namen verwenden.</p>';
      html += fieldPair(
        field('Vergrößerung X (1&ndash;10)', '<input type="number" min="1" max="10" data-bind="magX">'),
        field('Vergrößerung Y (1&ndash;10)', '<input type="number" min="1" max="10" data-bind="magY">')
      );
      html += '<p class="hint">Skaliert das gespeicherte Bild beim Druck, ohne die Originaldatei zu verändern.</p>';
      html += '<div class="field-row field-check"><input type="checkbox" data-bind="fieldReverse" id="cbReverseGfxShared"><label for="cbReverseGfxShared">Invertiert (weiß auf schwarz)</label></div>';
      html += '<div class="btn-row"><button id="btnReplaceGraphic">Bild ersetzen…</button></div>';
    } else if (el.type === 'graphic') {
      html += '<div class="section-title">Grafik</div>';
      html += '<p class="hint">Native Auflösung: <span id="gfxDims"></span> Dots. Die Größe wird beim Skalieren neu abgetastet (Schwarz/Weiß-Schwellenwert).</p>';
      html += fieldPair(
        field('Breite (Dots)', '<input type="number" min="2" max="' + MAX_GRAPHIC_DIM + '" data-bind="displayWidthPx">'),
        field('Höhe (Dots)', '<input type="number" min="2" max="' + MAX_GRAPHIC_DIM + '" data-bind="displayHeightPx">')
      );
      html += '<div class="field-row field-check"><input type="checkbox" data-bind="fieldReverse" id="cbReverseGfx"><label for="cbReverseGfx">Invertiert (weiß auf schwarz)</label></div>';
      html += '<div class="field-row field-check"><input type="checkbox" data-bind="compress" id="cbCompress"><label for="cbCompress">Komprimiert speichern (RLE)</label></div>';
      html += '<p class="hint">Verkleinert den ZPL-Code für diese Grafik. Nur bei Problemen mit älteren/exotischen Druckern deaktivieren.</p>';
      html += '<div class="btn-row"><button id="btnReplaceGraphic">Bild ersetzen…</button></div>';
    }

    html += '<div class="section-title">ZPL-Code dieses Elements</div>';
    html += '<pre class="element-zpl-code" id="elementZplCode" tabindex="0" aria-label="ZPL-Code dieses Elements"></pre>';
    html += '<p class="hint">Der tats&auml;chlich erzeugte ZPL-Code f&uuml;r genau dieses Element &ndash; dieselben Zeilen sind im Tab &bdquo;ZPL-Code&ldquo; hervorgehoben.</p>';

    html += '<div class="btn-row"><button id="btnDuplicateEl" title="Kopie mit gleichen Eigenschaften erstellen (Strg+D)">Duplizieren</button></div>';
    html += '<div class="btn-row"><button id="btnLockEl">Element sperren</button></div>';
    html += '<div class="btn-row"><button id="btnBringToFront" title="Vor allen anderen Elementen anzeigen">In den Vordergrund</button><button id="btnSendToBack" title="Hinter allen anderen Elementen anzeigen">In den Hintergrund</button></div>';
    html += '<div class="btn-row"><button id="btnDeleteEl" class="danger">Element löschen</button></div>';
    container.innerHTML = html;
    wirePropForm(el);
    syncPropFormValues(el);
    $('btnDuplicateEl').addEventListener('click', duplicateSelected);
    $('btnLockEl').addEventListener('click', function () { setSelectionLocked(true); });
    $('btnBringToFront').addEventListener('click', function () { reorderSelected(true); });
    $('btnSendToBack').addEventListener('click', function () { reorderSelected(false); });
    if ($('btnCopyTextFormat')) {
      $('btnCopyTextFormat').addEventListener('click', function () {
        copiedTextFormat = { font: el.font, height: el.height, width: el.width, orientation: el.orientation };
        const pasteBtn = $('btnPasteTextFormat');
        if (pasteBtn) pasteBtn.disabled = false;
        showToast('Format kopiert.');
      });
      $('btnPasteTextFormat').addEventListener('click', function () {
        applyCopiedTextFormat(el);
        drawLabel();
        syncPropFormValues(el);
        updateZplSource();
        pushHistory();
        showToast('Format eingefügt.');
      });
    }
  }

  // Applies the "Format kopieren" clipboard (font/height/width/orientation)
  // to one text element - shared by the single-element paste button above
  // and the multi-selection one in buildMultiPropForm().
  function applyCopiedTextFormat(el) {
    if (!copiedTextFormat || el.type !== 'text') return;
    el.font = copiedTextFormat.font;
    el.height = copiedTextFormat.height;
    el.width = copiedTextFormat.width;
    el.orientation = copiedTextFormat.orientation;
  }

  function deleteSelected() {
    const ids = editableSelectedElements().map(function (el) { return el.id; });
    if (!ids.length) return;
    state.label.elements = state.label.elements.filter(function (x) { return ids.indexOf(x.id) === -1; });
    state.selectedIds = [];
    propFormBuiltForId = null;
    renderAll();
    pushHistory();
  }

  function setSelectionLocked(locked) {
    const els = selectedElements();
    if (!els.length) return;
    els.forEach(function (el) { el.locked = !!locked; });
    if (locked) state.selectedIds = [];
    propFormBuiltForId = null;
    renderAll();
    pushHistory();
  }

  // Deep-clones each selected element (reusing the same Uint8Array-safe
  // replacer/reviver cloneLabel() uses, so a graphic's packed `bits` survive
  // intact rather than degrading into a plain {"0":255,...} object under a
  // naive JSON round-trip), gives each a fresh id, and nudges the copies by
  // one grid step so they don't land exactly on top of their originals.
  function cloneElement(el) {
    return JSON.parse(JSON.stringify(el, uint8JsonReplacer), uint8JsonReviver);
  }
  let elementClipboard = null;
  let pasteSequence = 0;

  function copyElementsToClipboard(els) {
    if (!els.length) return;
    const storedGraphics = {};
    els.forEach(function (el) {
      if (el.storedName && state.doc.storedGraphics && state.doc.storedGraphics[el.storedName]) {
        storedGraphics[el.storedName] = cloneElement(state.doc.storedGraphics[el.storedName]);
      }
    });
    elementClipboard = {
      elements: els.map(cloneElement),
      storedGraphics: storedGraphics,
    };
    pasteSequence = 0;
    showToast(els.length === 1 ? 'Element kopiert.' : els.length + ' Elemente kopiert.');
  }

  function copySelected() {
    copyElementsToClipboard(selectedElements());
  }

  function cutSelected() {
    const els = editableSelectedElements();
    if (!els.length) return;
    copyElementsToClipboard(els);
    deleteSelected();
  }

  function pasteElements() {
    if (!elementClipboard || !elementClipboard.elements.length) return;
    pasteSequence++;
    const offset = (state.grid.enabled ? state.grid.size : 20) * pasteSequence;
    const groupIdMap = {};
    const storedNameMap = {};
    const newIds = [];
    Object.keys(elementClipboard.storedGraphics || {}).forEach(function (name, index) {
      let targetName = name;
      const incoming = elementClipboard.storedGraphics[name];
      const existing = state.doc.storedGraphics[name];
      if (existing && JSON.stringify(existing, uint8JsonReplacer) !== JSON.stringify(incoming, uint8JsonReplacer)) {
        targetName = 'R:CP' + Date.now().toString(36).toUpperCase() + index + '.GRF';
      }
      if (!state.doc.storedGraphics[targetName]) {
        const graphic = cloneElement(incoming);
        graphic.name = targetName;
        state.doc.storedGraphics[targetName] = graphic;
      }
      storedNameMap[name] = targetName;
    });
    elementClipboard.elements.forEach(function (source) {
      const copy = cloneElement(source);
      copy.id = M.uid(copy.type);
      copy.locked = false;
      copy.hidden = false;
      if (copy.storedName && storedNameMap[copy.storedName]) copy.storedName = storedNameMap[copy.storedName];
      if (copy.groupId) {
        if (!groupIdMap[copy.groupId]) groupIdMap[copy.groupId] = M.uid('grp');
        copy.groupId = groupIdMap[copy.groupId];
      }
      copy.x += offset;
      copy.y += offset;
      state.label.elements.push(copy);
      newIds.push(copy.id);
    });
    state.selectedIds = newIds;
    propFormBuiltForId = null;
    renderAll();
    pushHistory();
    showToast(newIds.length === 1 ? 'Element eingefügt.' : newIds.length + ' Elemente eingefügt.');
  }

  function duplicateSelected() {
    const els = editableSelectedElements();
    if (!els.length) return;
    const offset = state.grid.enabled ? state.grid.size : 20;
    // Copies of grouped elements stay grouped WITH EACH OTHER (so the
    // duplicate set still moves as one unit) but get a fresh groupId of
    // their own, rather than joining the original group they were copied
    // from - one map per duplicateSelected() call so multiple groups
    // duplicated together each get their own new group, not merged into one.
    const groupIdMap = {};
    const newIds = els.map(function (el) {
      const copy = cloneElement(el);
      copy.id = M.uid(copy.type);
      if (copy.groupId) {
        if (!groupIdMap[copy.groupId]) groupIdMap[copy.groupId] = M.uid('grp');
        copy.groupId = groupIdMap[copy.groupId];
      }
      copy.x += offset;
      copy.y += offset;
      state.label.elements.push(copy);
      return copy.id;
    });
    state.selectedIds = newIds;
    propFormBuiltForId = null;
    renderAll();
    pushHistory();
  }

  // state.label.elements's array order IS the stacking/paint order (hitTest()
  // walks it back-to-front, drawElementsOnly() paints it front-to-back) - so
  // "z-order" is just where in that array an element sits. Moving the
  // selected elements to the end/start, preserving their relative order,
  // covers the common real case (a background frame/box added after the
  // fields it should sit behind) without needing a separate z-index field.
  function reorderSelected(toFront) {
    const ids = editableSelectedElements().map(function (el) { return el.id; });
    if (!ids.length) return;
    const selected = state.label.elements.filter(function (el) { return ids.indexOf(el.id) !== -1; });
    const rest = state.label.elements.filter(function (el) { return ids.indexOf(el.id) === -1; });
    state.label.elements = toFront ? rest.concat(selected) : selected.concat(rest);
    renderAll();
    pushHistory();
  }

  function selectAll() {
    state.selectedIds = state.label.elements.filter(function (el) { return el.type !== 'raw' && !el.hidden && !el.locked; }).map(function (el) { return el.id; });
    renderAll();
    buildPropForm();
  }

  // Groups the current selection so that clicking/dragging/marquee-selecting
  // ANY one of them from now on always brings the rest along (see
  // groupMemberIds/expandIdsToGroups above). Purely an editor/session concept
  // - ZPL itself has no notion of a group, so it lives only as a `groupId` on
  // each element (JSON history snapshots pick it up for free, same as any
  // other field) and is not written to the generated ZPL.
  function groupSelected() {
    const ids = editableSelectedElements().map(function (el) { return el.id; });
    if (ids.length < 2) return;
    const gid = M.uid('grp');
    ids.forEach(function (id) {
      const el = elementById(id);
      if (el) el.groupId = gid;
    });
    buildPropForm();
    renderAll();
    pushHistory();
  }
  function ungroupSelected() {
    let changed = false;
    editableSelectedElements().forEach(function (el) {
      if (el.groupId) { el.groupId = null; changed = true; }
    });
    if (!changed) return;
    buildPropForm();
    renderAll();
    pushHistory();
  }

  // Aligns the current multi-selection's bounding boxes against each other
  // (first-selected/last-selected doesn't matter - aligns to the group's own
  // combined extent). Works for rotated text/barcode too via getBounds(),
  // which already accounts for FT vs FO origin.
  function alignSelection(mode) {
    const els = editableSelectedElements();
    if (els.length < 2) return;
    const boxed = els.map(function (el) { return { el: el, b: getBounds(el) }; });
    if (mode === 'left') {
      const target = Math.min.apply(null, boxed.map(function (o) { return o.b.x; }));
      boxed.forEach(function (o) { o.el.x += (target - o.b.x); });
    } else if (mode === 'right') {
      const target = Math.max.apply(null, boxed.map(function (o) { return o.b.x + o.b.w; }));
      boxed.forEach(function (o) { o.el.x += (target - (o.b.x + o.b.w)); });
    } else if (mode === 'hcenter') {
      const minX = Math.min.apply(null, boxed.map(function (o) { return o.b.x; }));
      const maxX = Math.max.apply(null, boxed.map(function (o) { return o.b.x + o.b.w; }));
      const target = (minX + maxX) / 2;
      boxed.forEach(function (o) { o.el.x += (target - (o.b.x + o.b.w / 2)); });
    } else if (mode === 'top') {
      const target = Math.min.apply(null, boxed.map(function (o) { return o.b.y; }));
      boxed.forEach(function (o) { o.el.y += (target - o.b.y); });
    } else if (mode === 'bottom') {
      const target = Math.max.apply(null, boxed.map(function (o) { return o.b.y + o.b.h; }));
      boxed.forEach(function (o) { o.el.y += (target - (o.b.y + o.b.h)); });
    } else if (mode === 'vcenter') {
      const minY = Math.min.apply(null, boxed.map(function (o) { return o.b.y; }));
      const maxY = Math.max.apply(null, boxed.map(function (o) { return o.b.y + o.b.h; }));
      const target = (minY + maxY) / 2;
      boxed.forEach(function (o) { o.el.y += (target - (o.b.y + o.b.h / 2)); });
    }
    renderAll();
    pushHistory();
  }

  // Evens out the GAPS between elements along one axis (Figma/Illustrator's
  // "distribute spacing", not simple equal-center-spacing) - the two
  // outermost elements anchor the range and never move; everything between
  // them gets repositioned so the space between consecutive edges is equal.
  // Needs 3+ elements: with exactly 2 there's only one gap, nothing to even
  // out (the button is hidden below that count in buildMultiPropForm).
  // Uses the same getBounds() basis alignSelection() already does, so a
  // rotated text/barcode element gets the same (pre-rotation local box,
  // not the true rotated AABB) treatment in both - consistent, if not
  // pixel-perfect for a rotated element mixed into the same selection.
  function distributeSelection(axis) {
    const els = editableSelectedElements();
    if (els.length < 3) return;
    const boxed = els.map(function (el) { return { el: el, b: getBounds(el) }; });
    const isH = axis === 'horizontal';
    boxed.sort(function (a, b) { return isH ? a.b.x - b.b.x : a.b.y - b.b.y; });
    const first = boxed[0], last = boxed[boxed.length - 1];
    const span = isH ? (last.b.x + last.b.w) - first.b.x : (last.b.y + last.b.h) - first.b.y;
    const sumSize = boxed.reduce(function (s, o) { return s + (isH ? o.b.w : o.b.h); }, 0);
    const gap = (span - sumSize) / (boxed.length - 1);
    let cursor = isH ? first.b.x + first.b.w : first.b.y + first.b.h;
    for (let i = 1; i < boxed.length - 1; i++) {
      const o = boxed[i];
      const target = cursor + gap;
      if (isH) o.el.x += (target - o.b.x); else o.el.y += (target - o.b.y);
      cursor = target + (isH ? o.b.w : o.b.h);
    }
    renderAll();
    pushHistory();
  }

  function buildMultiPropForm() {
    const container = $('propForm');
    const n = state.selectedIds.length;
    const els = selectedElements();
    // A "whole group" is currently selected when every selected element
    // shares the same non-null groupId - by construction (see
    // expandIdsToGroups, used by every click/marquee/context-menu selection
    // path) that's the only way a group's members ever end up selected
    // together, so this also tells us whether to offer "Gruppieren" (create)
    // or "Gruppierung aufheben" (dissolve) as the primary action.
    const groupIds = els.map(function (el) { return el.groupId; }).filter(Boolean);
    const lockedCount = els.filter(function (el) { return el.locked; }).length;
    const isWholeGroup = groupIds.length === n && new Set(groupIds).size === 1;
    let html = '<div class="section-title">' + n + ' Elemente ausgewählt' + (isWholeGroup ? ' (Gruppe)' : '') + '</div>';
    html += '<p class="hint">Ziehen zum gemeinsamen Verschieben (Umschalt = Achse sperren). Strg/Cmd+Klick fügt einzelne Elemente hinzu/entfernt sie, Rechteck-Auswahl auf leerer Fläche wählt mehrere aus.</p>';
    html += '<div class="section-title">Ausrichten</div>';
    html += '<div class="align-grid">' +
      '<button data-align="left" title="Linksbündig">Links</button>' +
      '<button data-align="hcenter" title="Horizontal zentrieren">Mitte&nbsp;H</button>' +
      '<button data-align="right" title="Rechtsbündig">Rechts</button>' +
      '<button data-align="top" title="Oben ausrichten">Oben</button>' +
      '<button data-align="vcenter" title="Vertikal zentrieren">Mitte&nbsp;V</button>' +
      '<button data-align="bottom" title="Unten ausrichten">Unten</button>' +
      '</div>';
    if (n >= 3) {
      html += '<div class="btn-row">' +
        '<button data-distribute="horizontal" title="Gleichmäßige Abstände in der Breite herstellen (die beiden äußeren Elemente bleiben an ihrer Position)">Horizontal verteilen</button>' +
        '<button data-distribute="vertical" title="Gleichmäßige Abstände in der Höhe herstellen (die beiden äußeren Elemente bleiben an ihrer Position)">Vertikal verteilen</button>' +
        '</div>';
    }
    html += '<div class="btn-row">';
    if (!isWholeGroup) html += '<button id="btnGroupEls" title="Diese Elemente dauerhaft verknüpfen, damit sie sich künftig immer gemeinsam auswählen und verschieben lassen (Strg+G)">Gruppieren</button>';
    if (groupIds.length) html += '<button id="btnUngroupEls" title="Gruppierung aufheben (Strg+Umschalt+G)">Gruppierung aufheben</button>';
    html += '</div>';
    html += '<div class="btn-row">' +
      (lockedCount < n ? '<button id="btnLockEls">Ausgewählte sperren</button>' : '') +
      (lockedCount ? '<button id="btnUnlockEls">Ausgewählte entsperren</button>' : '') +
      '</div>';
    html += '<div class="btn-row"><button id="btnDuplicateEl" title="Kopien mit gleichen Eigenschaften erstellen (Strg+D)">Duplizieren</button></div>';
    html += '<div class="btn-row"><button id="btnBringToFront" title="Vor allen anderen Elementen anzeigen">In den Vordergrund</button><button id="btnSendToBack" title="Hinter allen anderen Elementen anzeigen">In den Hintergrund</button></div>';
    const hasText = els.some(function (el) { return el.type === 'text'; });
    if (hasText && copiedTextFormat) {
      html += '<div class="btn-row"><button id="btnPasteTextFormatMulti" title="Gemerktes Format (Schrift/Höhe/Breite/Ausrichtung) auf alle ausgewählten Text-Elemente anwenden">Format einfügen (Text)</button></div>';
    }
    html += '<div class="btn-row"><button id="btnDeleteEl" class="danger">Ausgewählte löschen</button></div>';
    container.innerHTML = html;
    container.querySelectorAll('[data-align]').forEach(function (btn) {
      btn.addEventListener('click', function () { alignSelection(btn.getAttribute('data-align')); });
    });
    container.querySelectorAll('[data-distribute]').forEach(function (btn) {
      btn.addEventListener('click', function () { distributeSelection(btn.getAttribute('data-distribute')); });
    });
    if ($('btnGroupEls')) $('btnGroupEls').addEventListener('click', groupSelected);
    if ($('btnUngroupEls')) $('btnUngroupEls').addEventListener('click', ungroupSelected);
    if ($('btnLockEls')) $('btnLockEls').addEventListener('click', function () { setSelectionLocked(true); });
    if ($('btnUnlockEls')) $('btnUnlockEls').addEventListener('click', function () { setSelectionLocked(false); });
    $('btnDeleteEl').addEventListener('click', deleteSelected);
    $('btnDuplicateEl').addEventListener('click', duplicateSelected);
    $('btnBringToFront').addEventListener('click', function () { reorderSelected(true); });
    $('btnSendToBack').addEventListener('click', function () { reorderSelected(false); });
    if ($('btnPasteTextFormatMulti')) {
      $('btnPasteTextFormatMulti').addEventListener('click', function () {
        els.forEach(function (el) { applyCopiedTextFormat(el); });
        renderAll();
        pushHistory();
        showToast('Format auf ' + els.filter(function (el) { return el.type === 'text'; }).length + ' Text-Element(e) angewendet.');
      });
    }
  }

  function getPath(obj, path) {
    return path.split('.').reduce(function (o, k) { return o == null ? o : o[k]; }, obj);
  }
  function setPath(obj, path, value) {
    const parts = path.split('.');
    let o = obj;
    for (let i = 0; i < parts.length - 1; i++) o = o[parts[i]];
    o[parts[parts.length - 1]] = value;
  }

  // `root` scopes which [data-bind] inputs get wired - omit it to wire the
  // whole #propForm (the normal case, from buildPropForm), or pass the
  // fbFields sub-container when syncPropFormValues rebuilds JUST that
  // sub-panel (see below) so its inputs don't get wired a second time on
  // top of the listeners buildPropForm's own full-form call already attached
  // to every OTHER input still sitting in the same #propForm. Re-wiring the
  // whole form there used to double every pushHistory() call (and hence
  // silently halve Undo's effective depth) for the rest of that element's
  // lifetime once its ^FB checkbox was toggled on.
  function wirePropForm(el, root) {
    const scopedToSubform = !!root;
    const container = root || $('propForm');
    container.querySelectorAll('[data-bind]').forEach(function (input) {
      const path = input.getAttribute('data-bind');
      if (path === 'hasFieldBlock') {
        input.addEventListener('change', function () {
          el.fieldBlock = input.checked ? { widthDots: Math.round(getBounds(el).w) || 200, maxLines: 2, lineSpacing: 0, justify: 'L', hangingIndent: 0 } : null;
          propFormBuiltForId = null; // force rebuild to show/hide FB sub-fields
          buildPropForm();
          renderCanvasOnly(); updateZplSource(); pushHistory();
        });
        return;
      }
      const evt = (input.tagName === 'SELECT' || input.type === 'checkbox') ? 'change' : 'input';
      input.addEventListener(evt, function () {
        let v;
        if (input.type === 'checkbox') v = input.checked;
        else if (input.type === 'number') {
          v = input.value === '' ? 0 : parseFloat(input.value);
          // <input min/max> only affects the native spinner/validity, not what
          // .value yields - enforce it here so e.g. a typed negative width/height
          // can't desync the model from what the field claims to allow.
          if (input.min !== '' && !isNaN(parseFloat(input.min))) v = Math.max(v, parseFloat(input.min));
          if (input.max !== '' && !isNaN(parseFloat(input.max))) v = Math.min(v, parseFloat(input.max));
        } else v = input.value;
        if (path === 'moduleWidth') v = M.normalizeBarcodeModuleWidth(v);
        if (path === 'ratio') v = M.normalizeBarcodeRatio(v);
        setPath(el, path, v);
        if (path === 'barcodeType') {
          // Reset params to the new type's schema defaults, preserving orientation/height where sensible.
          const schema = M.BARCODE_TYPES[v];
          const prevHeight = el.params.height, prevOrientation = el.params.orientation;
          el.params = schema.params.reduce(function (o, p) { o[p.key] = p.default; return o; }, {});
          el.params.height = prevHeight; el.params.orientation = prevOrientation;
          propFormBuiltForId = null;
          buildPropForm();
        }
        if (path === 'displayWidthPx' || path === 'displayHeightPx') {
          resampleGraphic(el);
        }
        if (path === 'magX' || path === 'magY') {
          // A stored/^XG graphic's on-screen size is its native bitmap size
          // times the integer magnification factor - not independently resizable.
          el.magX = Math.max(1, Math.min(10, Math.round(el.magX) || 1));
          el.magY = Math.max(1, Math.min(10, Math.round(el.magY) || 1));
          el.displayWidthPx = el.widthPx * el.magX;
          el.displayHeightPx = el.heightPx * el.magY;
        }
        renderCanvasOnly();
        updateZplSource();
        // Re-derive the barcode-error/scannability text and graphic-dims
        // caption live as the user types, not just when the form is next
        // rebuilt (syncPropFormValues skips whichever input is focused, so
        // this can't clobber what's being typed).
        syncPropFormValues(el);
      });
      input.addEventListener(evt === 'input' ? 'change' : evt, function () { pushHistory(); });
    });

    // These two buttons live in the outer #propForm, not inside fbFields, so
    // they must only be (re-)wired on the full-form call - a scoped
    // fbFields-only call would otherwise double these listeners too.
    if (!scopedToSubform) {
      const delBtn = $('btnDeleteEl');
      if (delBtn) delBtn.addEventListener('click', deleteSelected);

      const replaceBtn = $('btnReplaceGraphic');
      if (replaceBtn) replaceBtn.addEventListener('click', function () {
        pendingGraphicReplaceId = el.id;
        $('graphicInput').click();
      });
    }
  }

  function syncPropFormValues(el) {
    const container = $('propForm');
    container.querySelectorAll('[data-bind]').forEach(function (input) {
      const path = input.getAttribute('data-bind');
      if (document.activeElement === input) return; // don't clobber what the user is typing
      const v = getPath(el, path);
      if (input.type === 'checkbox') input.checked = !!v;
      else input.value = v == null ? '' : v;
    });
    const zplCodeEl = $('elementZplCode');
    if (zplCodeEl && window.ZPLGenerator) zplCodeEl.textContent = window.ZPLGenerator.generateElement(el).replace(/\n$/, '');
    // What this element's dot values mean on the printer currently selected
    // in the label settings - the number that actually matters when checking
    // a label against a physical specification or a die-cut size.
    const physicalEl = $('elPhysical');
    if (physicalEl) {
      const b = getBounds(el);
      physicalEl.textContent = t('dpi.element-physical', {
        dpi: currentDpi(),
        x: formatNumber(dotsToMm(el.x)), y: formatNumber(dotsToMm(el.y)),
        w: formatNumber(dotsToMm(b.w)), h: formatNumber(dotsToMm(b.h)),
      });
    }
    const fbCb = container.querySelector('[data-bind="hasFieldBlock"]');
    if (fbCb) fbCb.checked = !!el.fieldBlock;
    const compressCb = container.querySelector('[data-bind="compress"]');
    if (compressCb) compressCb.checked = el.compress !== false; // undefined means "on", matching the generator's default
    const fbFields = $('fbFields');
    if (fbFields) {
      if (el.fieldBlock && !fbFields.dataset.built) {
        fbFields.dataset.built = '1';
        fbFields.innerHTML =
          fieldPair(
            field('Blockbreite (Dots)', '<input type="number" min="1" data-bind="fieldBlock.widthDots">'),
            field('Max. Zeilen (0=unbegrenzt)', '<input type="number" min="0" data-bind="fieldBlock.maxLines">')
          ) +
          fieldPair(
            field('Zeilenabstand (Dots)', '<input type="number" min="0" data-bind="fieldBlock.lineSpacing">'),
            field('Hängender Einzug (Dots)', '<input type="number" min="0" data-bind="fieldBlock.hangingIndent">')
          ) +
          field('Ausrichtung', '<select data-bind="fieldBlock.justify"><option value="L">Links</option><option value="C">Zentriert</option><option value="R">Rechts</option><option value="J">Blocksatz</option></select>') +
          '<p class="hint">Ab der Blockbreite bricht der Text automatisch um. Max. Zeilen begrenzt die Anzahl (0 = keine Begrenzung), H&auml;ngender Einzug r&uuml;ckt alle Zeilen au&szlig;er der ersten ein &ndash; wie bei einer Aufz&auml;hlung.</p>';
        wirePropForm(el, fbFields); // scoped - the rest of #propForm is already wired
      } else if (!el.fieldBlock) {
        fbFields.innerHTML = '';
        delete fbFields.dataset.built;
      } else {
        fbFields.querySelectorAll('[data-bind]').forEach(function (input) {
          if (document.activeElement === input) return;
          const path = input.getAttribute('data-bind');
          const v = getPath(el, path);
          input.value = v == null ? '' : v;
        });
      }
    }
    if (el.type === 'barcode') {
      // QR has a real encoder with its own result shape (a module matrix,
      // not bar runs), so it reports version/level/mask instead of going
      // through the 1D preview-error path - which would only ever say
      // "no preview for this type".
      const qrStatusEl = $('qrStatus');
      if (qrStatusEl) {
        const qr = window.ZPLRender.qrWH(el, renderOpts());
        if (!qr.enc.ok) {
          qrStatusEl.textContent = 'QR-Fehler: ' + qr.enc.error;
          qrStatusEl.style.color = '#B3261E';
        } else {
          const mmPerModule = dotsToMm(qr.moduleDots);
          const parsed = window.ZPLQr.parseFieldData(applySampleData(el.data || ''));
          qrStatusEl.style.color = mmPerModule < 0.19 ? '#B3261E' : '';
          qrStatusEl.textContent = t('qr.status', {
            version: qr.enc.version,
            modules: qr.enc.size,
            level: qr.enc.ecLevel,
            mask: qr.enc.mask,
            mode: t('qr.mode.' + qr.enc.mode),
            size: mmLabel(dotsToMm(qr.w)),
            module: mmLabel(mmPerModule, 2),
          }) + (mmPerModule < 0.19 ? ' ' + t('qr.module-too-small') : '') +
            (parsed.prefix ? ' ' + t('qr.prefix-used', { prefix: parsed.prefix }) : '');
        }
      }
      const enc = barcodeEncode(el);
      const errEl = $('barcodeError');
      if (errEl) {
        // Placeholder-only 2D symbologies never have a real preview encoder
        // here by design (see isPlaceholderOnlyBarcode) - showing "preview
        // error" for those would read as a bug rather than the intentional,
        // clearly-labeled placeholder.
        const hasOwnStatus = isPlaceholderOnlyBarcode(el.barcodeType) || el.barcodeType === 'qrcode';
        let msg = (enc.ok || hasOwnStatus) ? (enc.ok ? (enc.error || '') : '') : ('Vorschau-Fehler: ' + enc.error);
        // Scannability check: below ~0.19mm (5mil) module width, handheld
        // scanners commonly start missing reads - a real, cheap-to-catch
        // defect class distinct from "does the preview render at all".
        if (!hasOwnStatus && el.moduleWidth) {
          const dpi = state.label.settings.dpi || 203;
          const mmPerModule = (M.normalizeBarcodeModuleWidth(el.moduleWidth) / dpi) * 25.4;
          if (mmPerModule < 0.19) {
            const warn = 'Warnung: Modulbreite ~' + mmPerModule.toFixed(2) + ' mm liegt unter der üblichen Mindestbreite (0,19 mm) für zuverlässiges Scannen.';
            msg = msg ? (msg + ' ' + warn) : warn;
          }
        }
        errEl.textContent = msg;
      }
      const checkDigitEl = $('checkDigitPreview');
      if (checkDigitEl) {
        const status = eanUpcCheckDigitStatus(el.barcodeType, el.data);
        checkDigitEl.textContent = status.text;
        checkDigitEl.style.color = status.level === 'ok' ? '#1a5c34' : (status.level === 'warn' ? '#B3261E' : '');
      }
    }
    if (el.type === 'graphic') {
      const dimsEl = $('gfxDims');
      if (dimsEl) dimsEl.textContent = el.widthPx + ' × ' + el.heightPx;
    }
  }

  let pendingGraphicReplaceId = null;

  const MAX_GRAPHIC_DIM = 4000; // generous cap (~13in at 300dpi) well under browser canvas/ImageData limits

  function resampleGraphic(el) {
    if (!el.bits) return;
    const rawW = el.displayWidthPx != null ? el.displayWidthPx : el.widthPx;
    const rawH = el.displayHeightPx != null ? el.displayHeightPx : el.heightPx;
    const newW = clampGraphicDim(rawW);
    const newH = clampGraphicDim(rawH);
    if (newW === el.widthPx && newH === el.heightPx) {
      el.displayWidthPx = el.widthPx; el.displayHeightPx = el.heightPx; // reflect any clamping back into the model/UI
      return;
    }
    try {
      // Re-thresholds with whatever dither/threshold the user picked at
      // import (el.mono) instead of a fixed hidden default, so resizing
      // doesn't suddenly look different from the rest of the label - see
      // resampleMonoBits, shared with DPI conversion so both paths produce
      // identical bits for the same target size.
      const decoded = resampleMonoBits({ widthPx: el.widthPx, heightPx: el.heightPx, bytesPerRow: el.bytesPerRow, bits: el.bits }, newW, newH, el.mono);
      el.widthPx = decoded.widthPx; el.heightPx = decoded.heightPx; el.bytesPerRow = decoded.bytesPerRow; el.bits = decoded.bytes;
      el.displayWidthPx = el.widthPx; el.displayHeightPx = el.heightPx;
      scheduleZ64Compression(el, decoded.bytes);
    } catch (e) {
      // Revert to the last-known-good size rather than leaving displayWidthPx/
      // Height mutated while el.bits/widthPx/heightPx stay stale.
      el.displayWidthPx = el.widthPx; el.displayHeightPx = el.heightPx;
      showToast('Grafik konnte nicht auf diese Größe skaliert werden: ' + e.message, true);
    }
  }

  // True if any text/barcode content (or the change note) in the CURRENT
  // label has a character outside plain ASCII - e.g. a German umlaut
  // (ä ö ü Ä Ö Ü ß). Used to warn when the label's own declared ^CI
  // encoding wouldn't actually match what gets printed (see the Zeichensatz
  // hint in buildLabelSettingsForm below).
  function labelHasNonAscii() {
    const hasHighChar = function (s) {
      if (!s) return false;
      for (let i = 0; i < s.length; i++) { if (s.charCodeAt(i) > 0x7E) return true; }
      return false;
    };
    if (hasHighChar(state.label.settings.note)) return true;
    return state.label.elements.some(function (el) {
      return hasHighChar(el.type === 'barcode' ? el.data : el.text);
    });
  }

  // ---------------------------------------------------------------------
  // Label size presets and printer-resolution controls
  //
  // The preset dimensions are stated physically (in cm) and converted to
  // dots through the printhead's exact dots/mm rather than a rounded dpi
  // number: 8.5 cm at 8 dots/mm is exactly 680 dots, where 8.5/2.54*203
  // would give 679.
  // ---------------------------------------------------------------------
  const LABEL_SIZE_PRESETS = { klein: { wCm: 8.5, hCm: 5.5 }, gross: { wCm: 10, hCm: 15 } };
  function presetToDots(preset, dpi) {
    return { w: Math.round(DPI.mmToDots(preset.wCm * 10, dpi)), h: Math.round(DPI.mmToDots(preset.hCm * 10, dpi)) };
  }
  function clampLabelDots(value) {
    const n = Number(value);
    return Math.min(M.MAX_LABEL_DOTS, Math.max(1, isFinite(n) ? Math.round(n) : 1));
  }

  // "300 dpi (12 Punkte/mm)" - composed here rather than using the preset's
  // own `label`, which is the module's German default for standalone
  // consumers; the editor's UI is trilingual.
  function dpiPresetLabel(preset) {
    return preset.dpi + ' dpi (' + preset.dpmm + ' ' + t('Punkte/mm') + ')';
  }
  function dpiPresetOptions(currentDpiValue) {
    return DPI.PRESETS.map(function (p) {
      const selected = DPI.presetFor(currentDpiValue) === p ? ' selected' : '';
      return '<option value="' + p.dpi + '"' + selected + '>' + escapeHtml(dpiPresetLabel(p)) + '</option>';
    }).join('');
  }
  function dpiOptionsHtml(currentDpiValue) {
    const isPreset = !!DPI.presetFor(currentDpiValue);
    return dpiPresetOptions(currentDpiValue) +
      '<option value="custom"' + (isPreset ? '' : ' selected') + '>' + escapeHtml(t('Andere Auflösung…')) + '</option>';
  }

  // Mirrors settings.widthDots/heightDots into all four size inputs plus the
  // resolution readout. One function so the dots fields, the mm fields, the
  // preset picker and a DPI conversion can never show three different
  // versions of the same label size.
  function syncLabelSizeFields() {
    const s = state.label.settings;
    const wDots = $('lsWidth'), hDots = $('lsHeight'), wMm = $('lsWidthMm'), hMm = $('lsHeightMm');
    if (!wDots || !wMm) return; // settings panel not currently built
    if (document.activeElement !== wDots) wDots.value = s.widthDots;
    if (document.activeElement !== hDots) hDots.value = s.heightDots;
    if (document.activeElement !== wMm) wMm.value = (Math.round(dotsToMm(s.widthDots, s.dpi) * 10) / 10);
    if (document.activeElement !== hMm) hMm.value = (Math.round(dotsToMm(s.heightDots, s.dpi) * 10) / 10);
    const info = $('lsDpiInfo');
    if (info) {
      const dpmm = DPI.dpmmFor(s.dpi);
      const exact = !!DPI.presetFor(s.dpi);
      info.textContent = t('dpi.resolution-info', {
        dpmm: formatNumber(dpmm, exact ? 0 : 2),
        size: mmLabel(dotsToMm(s.widthDots, s.dpi)) + ' × ' + mmLabel(dotsToMm(s.heightDots, s.dpi)),
      }) + (exact ? '' : ' · ' + t('dpi.non-standard'));
    }
  }

  // Set by wireDpiControls on every rebuild of the settings panel; lets the
  // conversion dialog put the DPI select back if the user cancels.
  let dpiControlsReset = function () {};

  function wireDpiControls(s) {
    const select = $('lsDpi');
    const customRow = $('lsDpiCustomRow');
    const customInput = $('lsDpiCustom');
    if (!select) return;
    customInput.value = s.dpi;

    // A DPI change is offered as a conversion rather than applied silently:
    // "this label is for a 300 dpi printer" and "make this label print the
    // same size on a 300 dpi printer" are two different intentions, and only
    // the user knows which one this is. Cancelling puts the control back.
    function requestDpi(target) {
      const next = Math.round(Number(target));
      if (!isFinite(next) || next < 50 || next > 2400) { resetDpiControls(); return; }
      if (DPI.scaleFactor(s.dpi, next) === 1) {
        // Same printhead resolution under a different nominal name (200 vs
        // 203 dpi): nothing to convert, just record what the user picked.
        s.dpi = next;
        renderAll(); updateZplSource(); pushHistory();
        return;
      }
      openDpiConvertModal(s.dpi, next);
    }
    function resetDpiControls() {
      select.value = DPI.presetFor(s.dpi) ? String(DPI.presetFor(s.dpi).dpi) : 'custom';
      customRow.classList.toggle('hidden', !!DPI.presetFor(s.dpi));
      customInput.value = s.dpi;
    }
    dpiControlsReset = resetDpiControls;

    select.addEventListener('change', function () {
      if (select.value === 'custom') {
        customRow.classList.remove('hidden');
        customInput.focus();
        return;
      }
      customRow.classList.add('hidden');
      requestDpi(select.value);
    });
    customInput.addEventListener('change', function () { requestDpi(customInput.value); });
    $('btnDpiConvert').addEventListener('click', function () {
      // Pre-selects the "other" common resolution so the most frequent case
      // (203 <-> 300) is one click away.
      openDpiConvertModal(s.dpi, DPI.dpmmFor(s.dpi) >= 12 ? 203 : 300);
    });
  }

  // ---------------------------------------------------------------------
  // DPI conversion
  //
  // ZPLDpi.convertLabel does the model walk; these two functions are the
  // parts that need the browser: the confirmation dialog, and rasterizing
  // embedded ^GF/~DG bitmaps to their new pixel size (packed monochrome bits
  // can only be rescaled through a canvas).
  // ---------------------------------------------------------------------

  // Rescales packed 1bpp bits to newW x newH and re-thresholds with the
  // same mono settings the image was imported with. Shared by the graphic
  // property panel's resize (resampleGraphic) and by DPI conversion, so both
  // produce identical bits for the same target size. Throws on canvas
  // failure - callers decide whether that's fatal.
  function resampleMonoBits(src, newW, newH, mono) {
    const off1 = document.createElement('canvas');
    off1.width = src.widthPx; off1.height = src.heightPx;
    off1.getContext('2d').putImageData(window.ZPLGraphic.bitsToImageData({
      widthPx: src.widthPx, heightPx: src.heightPx, bytesPerRow: src.bytesPerRow, bytes: src.bits,
    }), 0, 0);
    const off2 = document.createElement('canvas');
    off2.width = newW; off2.height = newH;
    const octx2 = off2.getContext('2d');
    octx2.fillStyle = '#fff';
    octx2.fillRect(0, 0, newW, newH);
    octx2.drawImage(off1, 0, 0, newW, newH);
    const imgData = octx2.getImageData(0, 0, newW, newH);
    const m = mono || MONO_DEFAULTS;
    return window.ImageMono.monochromize(imgData, { dither: m.dither, threshold: m.threshold });
  }

  function clampGraphicDim(value) {
    return Math.min(MAX_GRAPHIC_DIM, Math.max(2, Math.round(value)));
  }

  // Applies the resample tasks ZPLDpi.convertLabel handed back. Returns how
  // many failed so the caller can report it instead of leaving the user with
  // a silently half-converted label.
  function applyGraphicResampleTasks(label, tasks) {
    let failed = 0;
    tasks.forEach(function (task) {
      const newW = clampGraphicDim(task.targetWidthPx);
      const newH = clampGraphicDim(task.targetHeightPx);
      try {
        if (task.kind === 'inline') {
          const el = task.element;
          if (!el.bits) return;
          const decoded = resampleMonoBits({ widthPx: el.widthPx, heightPx: el.heightPx, bytesPerRow: el.bytesPerRow, bits: el.bits }, newW, newH, el.mono);
          el.widthPx = decoded.widthPx; el.heightPx = decoded.heightPx;
          el.bytesPerRow = decoded.bytesPerRow; el.bits = decoded.bytes;
          el.displayWidthPx = decoded.widthPx; el.displayHeightPx = decoded.heightPx;
          scheduleZ64Compression(el, decoded.bytes);
          return;
        }
        // A ~DG store is rescaled once; every ^XG element placing it keeps
        // its own integer magnification (which a scale factor could not
        // honor anyway - magX/magY only go up to 10) and simply re-points at
        // the new bits.
        const entry = task.entry;
        if (!entry || !entry.bytes) return;
        const decoded = resampleMonoBits({ widthPx: entry.widthPx, heightPx: entry.heightPx, bytesPerRow: entry.bytesPerRow, bits: entry.bytes }, newW, newH, entry.mono);
        entry.widthPx = decoded.widthPx; entry.heightPx = decoded.heightPx;
        entry.bytesPerRow = decoded.bytesPerRow; entry.bytes = decoded.bytes;
        scheduleZ64Compression(entry, decoded.bytes);
        (label.elements || []).forEach(function (el) {
          if (el.type !== 'graphic' || el.storedName !== task.name) return;
          el.widthPx = decoded.widthPx; el.heightPx = decoded.heightPx;
          el.bytesPerRow = decoded.bytesPerRow; el.bits = decoded.bytes;
          el.displayWidthPx = decoded.widthPx * (el.magX || 1);
          el.displayHeightPx = decoded.heightPx * (el.magY || 1);
        });
      } catch (e) {
        failed++;
      }
    });
    return failed;
  }

  const DPI_CONVERT_GROUPS = [
    { key: 'label', label: 'Etikettengröße und Offsets (^PW/^LL/^LH/^LS)' },
    { key: 'elements', label: 'Positionen und Formen aller Elemente' },
    { key: 'fonts', label: 'Schrifthöhen und -breiten (^A)' },
    { key: 'barcodes', label: 'Barcode-Modulbreiten und -höhen (^BY/^B)' },
    { key: 'graphics', label: 'Grafiken neu rastern (^GF/~DG)' },
  ];

  function dpiConvertOptionsFromForm() {
    const opts = {};
    DPI_CONVERT_GROUPS.forEach(function (g) {
      const cb = $('dpiOpt_' + g.key);
      opts[g.key] = cb ? cb.checked : true;
    });
    return opts;
  }

  // ZPLDpi's report carries a stable key/code plus the params its wording
  // needs, next to a ready-made German sentence. Translate by key and fall
  // back to that sentence, so a warning the catalog hasn't caught up with
  // still reads as a complete sentence instead of showing a bare key.
  function dpiReportText(catalogKey, params, germanFallback) {
    const translated = t(catalogKey, params);
    return translated === catalogKey ? germanFallback : translated;
  }

  function renderDpiConvertPreview(fromDpi, toDpi) {
    const report = DPI.convertLabel(state.label, fromDpi, toDpi, Object.assign({ dryRun: true }, dpiConvertOptionsFromForm()));
    let html = '<table class="dpi-preview"><thead><tr><th>' + t('Wert') + '</th><th>' + t('Vorher') +
      '</th><th></th><th>' + t('Nachher') + '</th></tr></thead><tbody>';
    if (!report.changes.length) {
      html += '<tr><td colspan="4">' + escapeHtml(t('Mit der aktuellen Auswahl würde sich nichts ändern.')) + '</td></tr>';
    }
    report.changes.forEach(function (row) {
      const unit = row.unit === 'px' ? t('unit.px') : t('unit.dots');
      // The physical size is what a conversion is FOR, so the label-size row
      // states explicitly that it stays put - that is the reassurance
      // someone is looking for before clicking "Umrechnen".
      const note = row.key === 'label-size'
        ? t('dpi.size-kept', { size: mmLabel(report.physical.widthMM) + ' × ' + mmLabel(report.physical.heightMM) })
        : null;
      html += '<tr><td>' + escapeHtml(dpiReportText('dpi.change.' + row.key, row.params, row.label)) + '</td>' +
        '<td>' + escapeHtml(row.from + ' ' + unit) + '</td><td>&rarr;</td>' +
        '<td><strong>' + escapeHtml(row.to + ' ' + unit) + '</strong>' +
        (note ? '<br><span class="dpi-note">' + escapeHtml(note) + '</span>' : '') + '</td></tr>';
    });
    html += '</tbody></table>';
    html += '<p class="hint">' + escapeHtml(t('dpi.rounding-note', { mm: mmLabel(report.roundingErrorMM, 3) })) + '</p>';
    if (report.warnings.length) {
      html += '<ul class="dpi-warnings">' + report.warnings.map(function (w) {
        return '<li>' + escapeHtml(dpiReportText('dpi.warn.' + w.code, w.params, w.text)) + '</li>';
      }).join('') + '</ul>';
    }
    return html;
  }

  // opts.onSettled (optional) runs once the dialog is done, whichever way it
  // ended - used by the print dialog, which this one replaces mid-flow, to
  // come back afterward instead of dropping the user out of printing.
  function openDpiConvertModal(fromDpi, toDpi, opts) {
    const onSettled = (opts && opts.onSettled) || null;
    const factor = DPI.scaleFactor(fromDpi, toDpi);
    const exact = DPI.isExactPair(fromDpi, toDpi);
    const factorText = formatFactor(factor);
    let body = '<div class="dpi-convert">';
    body += '<p class="dpi-head">' + escapeHtml(String(fromDpi)) + ' dpi <span>&rarr;</span> ' +
      '<select id="dpiTarget">' + dpiPresetOptions(toDpi) +
      // A custom target (typed into "Eigene Auflösung") is no preset, so it
      // needs its own option or the select would silently jump to 152 dpi.
      (DPI.presetFor(toDpi) ? '' : '<option value="' + toDpi + '" selected>' + escapeHtml(String(toDpi)) + ' dpi</option>') +
      '</select></p>';
    body += '<p class="hint">' + escapeHtml(t(exact ? 'dpi.factor-exact' : 'dpi.factor-approx', { factor: factorText })) + '</p>';
    body += '<div class="section-title">' + t('Was umgerechnet wird') + '</div>';
    DPI_CONVERT_GROUPS.forEach(function (g) {
      body += '<div class="field-row field-check"><input type="checkbox" id="dpiOpt_' + g.key + '" checked>' +
        '<label for="dpiOpt_' + g.key + '">' + t(g.label) + '</label></div>';
    });
    body += '<div class="section-title">' + t('Vorschau') + '</div>';
    body += '<div id="dpiPreview"></div>';
    body += '<div class="btn-row">' +
      '<button id="btnDpiApply">' + t('Umrechnen') + '</button>' +
      '<button id="btnDpiOnlyDeclare" title="Nur die DPI-Angabe ändern, alle Dot-Werte unverändert lassen – das Etikett wird dadurch physisch größer oder kleiner">' + t('Nur DPI-Angabe ändern') + '</button>' +
      '<button id="btnDpiCancel">' + t('Abbrechen') + '</button>' +
      '</div>';
    body += '</div>';
    // The ×/backdrop/Escape paths must behave exactly like "Abbrechen":
    // this dialog is often reached by CHANGING the DPI select, so leaving
    // silently would leave that select showing a resolution the label
    // never got.
    openModal('DPI umrechnen', body, function () { close(false); });

    function currentTarget() { return parseInt($('dpiTarget').value, 10) || toDpi; }
    function refresh() { $('dpiPreview').innerHTML = renderDpiConvertPreview(fromDpi, currentTarget()); }
    refresh();
    $('dpiTarget').addEventListener('change', refresh);
    DPI_CONVERT_GROUPS.forEach(function (g) { $('dpiOpt_' + g.key).addEventListener('change', refresh); });

    function close(applied) {
      closeModal(false); // false: this IS the button path, don't also fire the dismiss handler
      if (!applied) dpiControlsReset();
      if (onSettled) onSettled(applied);
    }
    $('btnDpiCancel').addEventListener('click', function () { close(false); });
    $('btnDpiOnlyDeclare').addEventListener('click', function () {
      state.label.settings.dpi = currentTarget();
      syncGridSizeInput();
      renderAll(); updateZplSource(); pushHistory();
      showToast(t('dpi.only-declared'));
      close(true); // last, so onSettled (e.g. reopening the print dialog) sees the final state
    });
    $('btnDpiApply').addEventListener('click', function () {
      applyDpiConversion(fromDpi, currentTarget(), dpiConvertOptionsFromForm());
      close(true);
    });
  }

  function applyDpiConversion(fromDpi, toDpi, options) {
    const report = DPI.convertLabel(state.label, fromDpi, toDpi, options);
    const failed = applyGraphicResampleTasks(state.label, report.graphicTasks);
    state.label.settings.dpi = toDpi;
    // Snapping and the toolbar grid are physical spacings too - a 2 mm grid
    // must stay 2 mm after the conversion, not turn into 2/3 of that.
    if (options.elements !== false) {
      state.grid.size = Math.max(1, Math.round(state.grid.size * report.factor));
    }
    syncGridSizeInput();
    fitZoom();
    renderAll();
    updateZplSource();
    pushHistory();
    if (failed) {
      showToast(t('dpi.graphics-failed', { count: failed }), true);
      return;
    }
    showToast(t('dpi.converted', {
      dpi: toDpi,
      factor: formatFactor(report.factor),
    }));
  }

  // ---------------------------------------------------------------------
  // Label settings panel
  // ---------------------------------------------------------------------
  function buildLabelSettingsForm() {
    const s = state.label.settings;
    const container = $('labelSettingsForm');
    let html = '<div class="section-title">Abmessungen</div>';
    html += field('Vorlage', '<select id="lsSizePreset"><option value="">Benutzerdefiniert</option><option value="klein">Klein (8,5 &times; 5,5 cm)</option><option value="gross">Gro&szlig; (10 &times; 15 cm)</option></select>');
    html += '<p class="hint">Die beiden Standard-Etikettengr&ouml;&szlig;en: &bdquo;Klein&ldquo; f&uuml;r Kommissionierung/Wareneingang (einzig unterst&uuml;tzte Gr&ouml;&szlig;e auf mobilen Zebra QL420-Druckern), &bdquo;Gro&szlig;&ldquo; f&uuml;r Versand-/Infoetiketten. Setzt Breite/H&ouml;he anhand der aktuellen Drucker-DPI neu.</p>';
    html += fieldPair(
      field('Breite (Dots)', '<input type="number" min="1" max="' + M.MAX_LABEL_DOTS + '" id="lsWidth">'),
      field('Höhe (Dots)', '<input type="number" min="1" max="' + M.MAX_LABEL_DOTS + '" id="lsHeight">')
    );
    html += fieldPair(
      field('Breite (mm)', '<input type="number" min="0.1" step="0.1" id="lsWidthMm">'),
      field('Höhe (mm)', '<input type="number" min="0.1" step="0.1" id="lsHeightMm">')
    );
    html += field('Drucker-DPI', '<select id="lsDpi">' + dpiOptionsHtml(s.dpi) + '</select>');
    html += '<div id="lsDpiCustomRow"' + (DPI.presetFor(s.dpi) ? ' class="hidden"' : '') + '>' +
      field('Eigene Auflösung (dpi)', '<input type="number" min="50" max="2400" id="lsDpiCustom">') + '</div>';
    html += '<p class="hint" id="lsDpiInfo"></p>';
    // A `.200zpl`/`.300zpl` file name is the one place a ZPL file states its
    // own intended resolution, so a name that contradicts the setting is
    // worth surfacing - it usually means the file was written for a
    // different printhead than the editor is currently assuming.
    const nameDpi = DPI.dpiFromFileName(state.currentFileName || state.label.sourceFileName);
    if (nameDpi && DPI.scaleFactor(s.dpi, nameDpi) !== 1) {
      html += '<p class="hint" style="color:#B3261E">' + escapeHtml(t('dpi.filename-mismatch', { name: state.currentFileName || state.label.sourceFileName, nameDpi: nameDpi, dpi: s.dpi })) + '</p>';
    }
    html += '<div class="btn-row"><button id="btnDpiConvert" title="Alle Dot-Werte dieses Etiketts auf eine andere Druckerauflösung umrechnen">Auf andere DPI umrechnen&hellip;</button></div>';
    html += '<p class="hint">Breite/H&ouml;he sind die Etikettengr&ouml;&szlig;e in Bildpunkten (Dots); die Drucker-DPI bestimmt, wie viele Dots einem Millimeter entsprechen. Ein ZPL-Etikett enth&auml;lt selbst keine Auflösung &ndash; dieselbe Datei wird auf einem 300-dpi-Drucker daher nur zwei Drittel so gro&szlig; wie auf einem 203-dpi-Drucker. Beim Wechsel der DPI bietet der Editor deshalb an, alle Werte mit umzurechnen.</p>';
    html += '<div class="section-title">Druckeinstellungen</div>';
    html += field('Medientransport (^MM)', '<select id="lsMM"><option value="T">Tear-off</option><option value="C">Cutter</option><option value="P">Peel-off</option><option value="R">Rewind</option><option value="A">Applicator</option></select>');
    html += '<p class="hint">Was der Drucker nach dem Druck tut: abrei&szlig;en, schneiden, abziehen, zur&uuml;ckspulen oder spenden.</p>';
    html += field('Home-Offset (^LH x,y)', fieldPair('<input type="number" id="lsHomeX" style="margin-right:6px">', '<input type="number" id="lsHomeY">'));
    html += field('Label-Verschiebung Y (^LS)', '<input type="number" id="lsShift">');
    html += '<p class="hint">Verschiebt den Nullpunkt bzw. den Druck senkrecht &ndash; hilfreich, wenn der Drucker leicht versetzt druckt.</p>';
    html += field('Zeichensatz (^CI)', '<input type="text" id="lsEncoding" maxlength="2">');
    html += '<p class="hint">Legt fest, wie Sonderzeichen wie Uml&auml;ute codiert werden; 28 (UTF-8) passt f&uuml;r die meisten modernen Texte.</p>';
    if (s.encoding !== '28' && labelHasNonAscii()) {
      html += '<p class="hint" style="color:#B3261E">Dieses Label enth&auml;lt Sonderzeichen (z.&nbsp;B. Uml&auml;ute), aber der Zeichensatz ist nicht auf 28 (UTF-8) gesetzt &ndash; auf einem echten Drucker k&ouml;nnen diese Zeichen dann falsch oder gar nicht gedruckt werden. Auf 28 stellen, sofern der Drucker UTF-8 unterst&uuml;tzt (bei allen halbwegs aktuellen Zebra-Druckern der Fall).</p>';
    }
    html += field('Druckdunkelheit (~SD, 0&ndash;30, leer = unver&auml;ndert)', '<input type="number" min="0" max="30" id="lsDarkness">');
    html += field('Druckgeschwindigkeit (^PR, leer = unver&auml;ndert)', '<input type="text" id="lsPrintSpeed" placeholder="z.&nbsp;B. 6,6">');
    html += '<p class="hint">Dunkelheit und Geschwindigkeit werden oft zusammen abgestimmt &ndash; schneller gedruckte Labels brauchen meist etwas mehr Dunkelheit.</p>';
    html += '<div class="section-title">&Auml;nderungsnotiz</div>';
    html += field('Notiz (wird im Label mitgespeichert, nicht gedruckt)', '<textarea id="lsNote" rows="2" placeholder="z.&nbsp;B. Grund der &Auml;nderung, Datum, K&uuml;rzel&hellip;"></textarea>');
    html += '<p class="hint">Praktisch in Kombination mit dem Label-Vergleich, um sp&auml;ter nachzuvollziehen, was sich zwischen zwei Versionen ge&auml;ndert hat.</p>';
    if (state.label.preamble) {
      html += '<div class="section-title">Treiber-Vorspann</div>';
      html += '<div class="field-row field-check"><input type="checkbox" id="lsKeepPreamble" checked><label for="lsKeepPreamble">Beim Export beibehalten</label></div>';
      html += '<p class="hint">Diese Datei enthält einen Zebra-Druckertreiber-Vorspann (Netzwerk-/Kalibrierbefehle) vor dem eigentlichen Label. Er wird unverändert mitgeführt, ist aber nicht visuell bearbeitbar.</p>';
    }
    if (state.label.rawTail && state.label.rawTail.length) {
      html += '<div class="section-title">Nicht abgebildete Befehle (' + state.label.rawTail.length + ')</div>';
      html += '<p class="hint">Diese ZPL-Befehle wurden beim Import erkannt, aber nicht als Element abgebildet. Sie bleiben beim Export unverändert erhalten. Bearbeiten kannst du sie im Tab „ZPL-Code“.</p>';
      html += '<div class="hint" style="font-family:monospace;word-break:break-all;background:var(--ui-surface-alt);padding:6px">' +
        state.label.rawTail.map(function (t) { return escapeHtml(t.raw); }).join('<br>') + '</div>';
    }
    container.innerHTML = html;

    let matchedPreset = '';
    Object.keys(LABEL_SIZE_PRESETS).forEach(function (key) {
      const d = presetToDots(LABEL_SIZE_PRESETS[key], s.dpi || 203);
      if (Math.abs(s.widthDots - d.w) <= 2 && Math.abs(s.heightDots - d.h) <= 2) matchedPreset = key;
    });
    $('lsSizePreset').value = matchedPreset;
    $('lsSizePreset').addEventListener('change', function (e) {
      const key = e.target.value;
      if (!key) return; // "Benutzerdefiniert" selected - leave current dimensions as-is
      const d = presetToDots(LABEL_SIZE_PRESETS[key], s.dpi || 203);
      s.widthDots = d.w; s.heightDots = d.h;
      syncLabelSizeFields();
      renderAll(); updateZplSource(); pushHistory();
    });

    $('lsWidth').value = s.widthDots;
    $('lsHeight').value = s.heightDots;
    syncLabelSizeFields();
    wireDpiControls(s);
    $('lsMM').value = s.mediaTracking;
    $('lsHomeX').value = s.homeX;
    $('lsHomeY').value = s.homeY;
    $('lsShift').value = s.labelShiftY;
    $('lsEncoding').value = s.encoding;
    $('lsDarkness').value = s.darkness == null ? '' : s.darkness;
    $('lsPrintSpeed').value = s.printSpeed == null ? '' : s.printSpeed;
    $('lsNote').value = s.note || '';

    function bind(id, setter) {
      const elx = $(id);
      if (!elx) return;
      elx.addEventListener('change', function () { setter(elx); renderAll(); updateZplSource(); pushHistory(); });
    }
    bind('lsWidth', function (e) { s.widthDots = clampLabelDots(parseInt(e.value, 10)); e.value = s.widthDots; syncLabelSizeFields(); });
    bind('lsHeight', function (e) { s.heightDots = clampLabelDots(parseInt(e.value, 10)); e.value = s.heightDots; syncLabelSizeFields(); });
    // The mm fields are a second view of the very same ^PW/^LL dots - they
    // convert through the current DPI and write the rounded dot value back,
    // so what the label actually contains stays the single source of truth.
    // Clearing the field (or typing something unparseable) leaves the size
    // alone and puts the value back, rather than collapsing the label to the
    // 1-dot minimum a bare clamp would produce.
    function mmFieldDots(rawValue) {
      const mm = parseFloat(String(rawValue).replace(',', '.'));
      if (!isFinite(mm) || mm <= 0) return null;
      return clampLabelDots(Math.round(DPI.mmToDots(mm, s.dpi)));
    }
    bind('lsWidthMm', function (e) { const d = mmFieldDots(e.value); if (d != null) s.widthDots = d; syncLabelSizeFields(); });
    bind('lsHeightMm', function (e) { const d = mmFieldDots(e.value); if (d != null) s.heightDots = d; syncLabelSizeFields(); });
    bind('lsMM', function (e) { s.mediaTracking = e.value; });
    bind('lsHomeX', function (e) { s.homeX = parseInt(e.value, 10) || 0; });
    bind('lsHomeY', function (e) { s.homeY = parseInt(e.value, 10) || 0; });
    bind('lsShift', function (e) { s.labelShiftY = parseInt(e.value, 10) || 0; });
    bind('lsEncoding', function (e) { s.encoding = e.value || '0'; });
    bind('lsDarkness', function (e) { s.darkness = e.value === '' ? null : parseInt(e.value, 10); });
    bind('lsPrintSpeed', function (e) { s.printSpeed = e.value.trim() === '' ? null : e.value.trim(); });
    bind('lsNote', function (e) { s.note = e.value; });
    const kp = $('lsKeepPreamble');
    if (kp) kp.addEventListener('change', function () { state.keepPreamble = kp.checked; updateZplSource(); });
  }

  function escapeHtml(s) {
    return String(s).replace(/[&<>"]/g, function (c) { return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]; });
  }

  // ---------------------------------------------------------------------
  // Variables panel
  // ---------------------------------------------------------------------
  function buildVarsForm() {
    const names = findVariables();
    const renameFrom = $('varRenameFrom');
    if (renameFrom) {
      const prev = renameFrom.value;
      renameFrom.innerHTML = optionsHtml(names, prev);
      if (names.indexOf(prev) === -1 && names.length) renameFrom.value = names[0];
    }
    const container = $('varsForm');
    if (!names.length) {
      container.innerHTML = '<p class="hint">Keine Platzhalter im Format $NAME$ im aktuellen Label gefunden.</p>';
      return;
    }
    container.innerHTML = names.map(function (n) {
      const source = state.sampleValueSource[n];
      const hint = source ? ' <span class="var-source-hint">(aus $' + escapeHtml(source) + '$)</span>' : '';
      return '<div class="var-row"><span class="var-name">$' + escapeHtml(n) + '$' + hint + '</span><input type="text" data-var="' + escapeHtml(n) + '" placeholder="Beispielwert…"></div>';
    }).join('');
    container.querySelectorAll('[data-var]').forEach(function (input) {
      input.value = state.sampleValues[input.getAttribute('data-var')] || '';
      input.addEventListener('input', function () {
        const name = input.getAttribute('data-var');
        state.sampleValues[name] = input.value;
        delete state.sampleValueSource[name]; // a manual edit detaches it from wherever the XML matched it from
        // Typing a sample value is a clear signal the user wants to see it -
        // don't make them separately notice and flip the preview toggle too.
        if (!state.sampleDataMode) { state.sampleDataMode = true; $('chkSampleData').checked = true; }
        renderCanvasOnly();
      });
    });
  }

  // Parses an arbitrary "variable export" XML (for example <Variables><Data>...
  // format used at print time) into a flat {tagName: textContent} map, using
  // every LEAF element in the document (no child elements of its own) -
  // regardless of nesting - so it works for that shape without being hardcoded
  // to it, and picks up e.g. <System><PRINTER>...</PRINTER></System> too since
  // some labels do have a $PRINTER$ placeholder.
  function parseVariablesXml(xmlText) {
    const doc = new DOMParser().parseFromString(xmlText, 'application/xml');
    const parserError = doc.querySelector('parsererror');
    if (parserError) throw new Error('Ungültiges XML: ' + parserError.textContent.split('\n')[0]);
    const map = {};
    const all = doc.getElementsByTagName('*');
    for (let i = 0; i < all.length; i++) {
      const elx = all[i];
      let hasChildElement = false;
      for (let c = 0; c < elx.childNodes.length; c++) {
        if (elx.childNodes[c].nodeType === 1) { hasChildElement = true; break; }
      }
      if (!hasChildElement) map[elx.tagName] = (elx.textContent || '').trim();
    }
    return map;
  }

  // Matches the label's $NAME$ placeholders against the parsed XML map. Tries
  // an exact name match first; if that fails, strips a trailing digit group
  // from the placeholder (e.g. "GDTXT80" -> "GDTXT") and tries again, since
  // label templates sometimes suffix a field-length/width number onto the
  // underlying variable name.
  function applyXmlVariables(xmlMap) {
    const names = findVariables();
    let directCount = 0, fallbackCount = 0;
    const missing = [];
    names.forEach(function (name) {
      if (Object.prototype.hasOwnProperty.call(xmlMap, name)) {
        state.sampleValues[name] = xmlMap[name];
        delete state.sampleValueSource[name];
        directCount++;
        return;
      }
      const m = /^(.*?)(\d+)$/.exec(name);
      const baseName = m ? m[1] : null;
      if (baseName && Object.prototype.hasOwnProperty.call(xmlMap, baseName)) {
        state.sampleValues[name] = xmlMap[baseName];
        state.sampleValueSource[name] = baseName;
        fallbackCount++;
        return;
      }
      missing.push(name);
    });
    return { directCount: directCount, fallbackCount: fallbackCount, missing: missing };
  }

  // Shared by both the file-upload path and the paste-a-textarea path below.
  function importVariablesXmlText(text, sourceLabel) {
    const xmlMap = parseVariablesXml(text);
    const result = applyXmlVariables(xmlMap);
    state.sampleDataMode = true;
    $('chkSampleData').checked = true;
    state.hideUnfilledPlaceholders = true;
    $('chkHideUnfilled').checked = true;
    buildVarsForm();
    renderCanvasOnly();
    const total = result.directCount + result.fallbackCount + result.missing.length;
    if (total === 0) {
      $('varsXmlStatus').textContent = 'Keine Platzhalter im aktuellen Label, die aus „' + sourceLabel + '“ befüllt werden könnten.';
      return;
    }
    let msg = result.directCount + ' von ' + total + ' Platzhaltern aus „' + sourceLabel + '“ übernommen';
    if (result.fallbackCount) msg += ' (' + result.fallbackCount + ' über abgeleiteten Namen)';
    if (result.missing.length) msg += '. Nicht gefunden: ' + result.missing.map(function (n) { return '$' + n + '$'; }).join(', ');
    $('varsXmlStatus').textContent = msg;
  }

  $('btnImportVarsXml').addEventListener('click', function () { $('varsXmlInput').click(); });
  $('varsXmlInput').addEventListener('change', async function (e) {
    const file = e.target.files[0];
    e.target.value = '';
    if (!file) return;
    try {
      const text = await file.text();
      importVariablesXmlText(text, file.name);
    } catch (err) {
      showToast('XML konnte nicht gelesen werden: ' + err.message, true);
    }
  });

  $('btnApplyVarsXmlPaste').addEventListener('click', function () {
    const text = $('varsXmlPaste').value;
    if (!text.trim()) { showToast('Bitte zuerst XML in das Textfeld einfügen.', true); return; }
    try {
      importVariablesXmlText(text, 'eingefügtem XML');
    } catch (err) {
      showToast('XML konnte nicht gelesen werden: ' + err.message, true);
    }
  });

  // ---------------------------------------------------------------------
  // Bottom ZPL console
  // ---------------------------------------------------------------------
  function updateZplSource() {
    if (document.activeElement === $('zplSource')) return;
    $('zplSource').value = window.ZPLGenerator.generateZPL(state.label, { keepPreamble: state.keepPreamble !== false });
    // Deliberately the ACTIVE frame only: the per-element line highlighting
    // and "Übernehmen" below both work on one label, and there is no sane
    // meaning for either across a whole document. Say so rather than let
    // someone conclude the other labels were lost.
    const scope = $('zplScopeHint');
    if (scope) {
      const multi = labelCount() > 1;
      scope.classList.toggle('hidden', !multi);
      if (multi) scope.textContent = t('doc.zpl-tab-scope', { count: labelCount() });
    }
    if (state.zplExplainView) renderZplExplainView();
    updateZplHighlight();
  }

  // Half-open {start,end} line range (0-indexed, matching zplSource.value's
  // \n-split lines) belonging to the single currently-selected element, or
  // null when there's no selection, a multi-selection, or the element isn't
  // in the line-range map generateZPL() just built (e.g. selection is stale
  // for a moment mid-rebuild) - callers must treat null as "nothing to highlight".
  function selectedElementLineRange() {
    if (state.selectedIds.length !== 1) return null;
    const ranges = window.ZPLGenerator.getElementLineRanges();
    return (ranges && ranges[state.selectedIds[0]]) || null;
  }

  // Positions the Code-view's highlight bar behind the (transparent-background)
  // textarea, and re-decorates the Erklärte-Ansicht with a highlight span -
  // both driven by the SAME line range, so "click an element" always shows
  // the identical set of lines regardless of which ZPL sub-view is open.
  function updateZplHighlight() {
    const range = selectedElementLineRange();
    const bar = $('zplLineHighlightBar');
    if (!range) {
      bar.classList.add('hidden');
    } else {
      const ta = $('zplSource');
      const cs = getComputedStyle(ta);
      const lineHeight = parseFloat(cs.lineHeight) || 17;
      const paddingTop = parseFloat(cs.paddingTop) || 0;
      bar.classList.remove('hidden');
      bar.style.top = (paddingTop + range.start * lineHeight - ta.scrollTop) + 'px';
      bar.style.height = Math.max(lineHeight, (range.end - range.start) * lineHeight) + 'px';
    }
    if (state.zplExplainView) renderZplExplainView();
  }
  // The bar's `top` is expressed relative to the textarea's current scroll
  // position, so scrolling the (still fully interactive/editable) textarea
  // must reposition it live, not just on selection change.
  $('zplSource').addEventListener('scroll', updateZplHighlight);

  // Codeteil vor dem ersten " – " aus entry.name lösen (z.B. "^FD" aus
  // "^FD – Felddaten"), um ihn vor den ausgeschriebenen Namen zu setzen -
  // entry.name bleibt dabei unverändert der bisherige kurze Anzeigetext.
  function glossaryCodeLabel(entry) {
    return entry.name.split(' – ')[0];
  }
  // "^FD – Field Data (Felddaten): <desc>" - zeigt den offiziellen englischen
  // Befehlsnamen ausgeschrieben UND seine deutsche Übersetzung, wie explizit
  // gewünscht, statt nur die (bereits deutsche) Kurzbezeichnung aus entry.name.
  function glossaryTooltipText(entry) {
    let t = glossaryCodeLabel(entry) + ' – ' + entry.fullName + ' (' + entry.germanName + '): ' + entry.desc;
    if (entry.params && entry.params.length) {
      t += ' Parameter: ' + entry.params.map(function (p) { return p.name + ' (' + p.desc + ')'; }).join('; ');
    }
    return t;
  }

  // "Erklärte Ansicht": derselbe Code, read-only, mit hervorgehobenen und per
  // Tooltip/Legende erklärten Befehlen - kein Effekt auf das Label selbst,
  // rein zum Nachvollziehen/Lernen der ZPL-Syntax des gerade offenen Etiketts.
  function renderZplExplainView() {
    const text = $('zplSource').value;
    const glossary = window.ZPLGlossary;
    if (!glossary) return;
    let html = '';
    glossary.tokenize(text).forEach(function (tok) {
      if (!tok.isCommand) { html += escapeHtml(tok.text); return; }
      const entry = glossary.lookup(tok.text);
      html += entry
        // tabindex + aria-label so the explanation - the whole point of this
        // "learn ZPL" view - reaches keyboard users and screen readers too,
        // not only a mouse-hover title tooltip. Spells out the official
        // English command name before its German translation (e.g. "Field
        // Data (Felddaten)"), per the explicit ask to show both, not just
        // the already-German short label in entry.name.
        ? '<span class="zpl-cmd" tabindex="0" title="' + escapeHtml(glossaryTooltipText(entry)) + '" aria-label="' + escapeHtml(glossaryTooltipText(entry)) + '">' + escapeHtml(tok.text) + '</span>'
        : escapeHtml(tok.text);
    });
    // Every '\n' in `html` corresponds 1:1 to one in `text` (escapeHtml/the
    // ^cmd span wrapper never add or strip newlines), so splitting the
    // already-built html on '\n' safely yields one entry per source line to
    // wrap in the selected element's highlight.
    const range = selectedElementLineRange();
    if (range) {
      const lines = html.split('\n');
      for (let i = range.start; i < range.end && i < lines.length; i++) {
        lines[i] = '<span class="zpl-line-highlight">' + lines[i] + '</span>';
      }
      html = lines.join('\n');
    }
    $('zplExplainCode').innerHTML = html;

    const legend = glossary.commandsUsedIn(text);
    const legendEl = $('zplExplainLegend');
    legendEl.innerHTML = legend.length
      ? legend.map(function (entry) {
          let li = '<li><span class="zpl-cmd-name">' + escapeHtml(glossaryCodeLabel(entry)) + ' – ' + escapeHtml(entry.fullName) + ' (' + escapeHtml(entry.germanName) + ')</span>' +
            '<span class="zpl-cmd-desc">' + escapeHtml(entry.desc) + '</span>';
          if (entry.params && entry.params.length) {
            li += '<ul class="zpl-cmd-params">' + entry.params.map(function (p) {
              let paramLine = '<b>' + escapeHtml(p.name) + '</b>: ' + escapeHtml(p.desc);
              if (p.default) paramLine += ' (Standard: ' + escapeHtml(p.default) + ')';
              return '<li>' + paramLine + '</li>';
            }).join('') + '</ul>';
          }
          return li + '</li>';
        }).join('')
      : '<li class="hint">Keine bekannten Befehle erkannt.</li>';
  }

  $('btnZplViewCode').addEventListener('click', function () {
    state.zplExplainView = false;
    $('btnZplViewCode').classList.add('active');
    $('btnZplViewCode').setAttribute('aria-pressed', 'true');
    $('btnZplViewExplain').classList.remove('active');
    $('btnZplViewExplain').setAttribute('aria-pressed', 'false');
    $('zplCodeWrap').classList.remove('hidden');
    $('zplExplain').classList.add('hidden');
    updateZplHighlight();
  });
  $('btnZplViewExplain').addEventListener('click', function () {
    state.zplExplainView = true;
    $('btnZplViewExplain').classList.add('active');
    $('btnZplViewExplain').setAttribute('aria-pressed', 'true');
    $('btnZplViewCode').classList.remove('active');
    $('btnZplViewCode').setAttribute('aria-pressed', 'false');
    $('zplCodeWrap').classList.add('hidden');
    $('zplExplain').classList.remove('hidden');
    renderZplExplainView();
  });

  $('btnApplyZpl').addEventListener('click', function () {
    try {
      // Replaces the ACTIVE label only - the textarea showed exactly that
      // frame (see updateZplSource's scope hint), so replacing the whole
      // document here would silently delete the other labels.
      const doc = window.ZPLParser.parseDocument($('zplSource').value);
      const parsed = doc.labels[0];
      labelGuides(parsed);
      parsed.storedGraphics = state.doc.storedGraphics;
      state.doc.labels[state.doc.activeIndex] = parsed;
      state.label = parsed;
      state.selectedIds = [];
      renderAll();
      pushHistory();
      // Pasting a multi-frame block into a single label's textarea is a
      // plausible mistake; the extra frames were not applied, so say so.
      showToast(doc.labels.length > 1
        ? t('doc.apply-extra-frames', { count: doc.labels.length })
        : 'ZPL-Code übernommen.');
    } catch (e) {
      showToast('Konnte ZPL-Code nicht lesen: ' + e.message, true);
    }
  });

  // ---------------------------------------------------------------------
  // Master render
  // ---------------------------------------------------------------------
  function renderCanvasOnly() { drawLabel(); }
  function localizeDynamicPanels() {
    ['labelSettingsForm', 'propForm', 'varsForm', 'layersList', 'historyList', 'mergeCustomSheetFields'].forEach(function (id) {
      translateFragment($(id));
    });
  }
  function localizeIdleStatuses() {
    const defaults = [
      ['libraryStatus', 'Kein Ordner geöffnet', ['Kein Ordner geöffnet', 'No folder open', 'Aucun dossier ouvert']],
      ['mergeDataStatus', 'Keine Datei geladen', ['Keine Datei geladen', 'No file loaded', 'Aucun fichier chargé']],
      ['mergeSummary', 'Noch keine Daten geladen.', ['Noch keine Daten geladen.', 'No data loaded yet.', 'Aucune donnée chargée pour le moment.']],
    ];
    defaults.forEach(function (entry) {
      const el = $(entry[0]);
      if (el && entry[2].indexOf((el.textContent || '').trim()) !== -1) el.textContent = t(entry[1]);
    });
  }
  function renderAll() {
    drawLabel();
    buildPropForm();
    buildLabelSettingsForm();
    buildVarsForm();
    updateZplSource();
    renderMergePreview(); // no-op unless the Seriendruck tab is the active one - see its own guard
    renderLayersPanel(); // no-op unless the Ebenen tab is the active one - see its own guard
    updateLabelNav();    // element counts in the label picker follow every edit
    $('btnSave').disabled = !hasSaveTarget();
    localizeDynamicPanels();
    localizeIdleStatuses();
  }

  // ---------------------------------------------------------------------
  // Tabs
  // ---------------------------------------------------------------------
  document.querySelectorAll('.tab-btn').forEach(function (btn) {
    btn.addEventListener('click', function () {
      document.querySelectorAll('.tab-btn').forEach(function (b) { b.classList.remove('active'); b.setAttribute('aria-selected', 'false'); });
      document.querySelectorAll('.tab-panel').forEach(function (p) { p.classList.remove('active'); });
      btn.classList.add('active');
      btn.setAttribute('aria-selected', 'true');
      $('tab-' + btn.dataset.tab).classList.add('active');
      if (btn.dataset.tab === 'merge') renderMergePreview();
      if (btn.dataset.tab === 'history') renderHistoryPanel();
      if (btn.dataset.tab === 'layers') renderLayersPanel();
    });
  });

  // ---------------------------------------------------------------------
  // Toolbox / tools
  // ---------------------------------------------------------------------
  document.querySelectorAll('.tool-btn').forEach(function (btn) {
    btn.addEventListener('click', function () {
      if (btn.dataset.tool === 'graphic') { $('graphicInput').click(); return; }
      document.querySelectorAll('.tool-btn').forEach(function (b) { b.classList.remove('active'); b.setAttribute('aria-pressed', 'false'); });
      btn.classList.add('active');
      btn.setAttribute('aria-pressed', 'true');
      state.tool = btn.dataset.tool;
    });
  });
  function resetToolToSelect() {
    state.tool = 'select';
    document.querySelectorAll('.tool-btn').forEach(function (b) {
      const isSelect = b.dataset.tool === 'select';
      b.classList.toggle('active', isSelect);
      b.setAttribute('aria-pressed', isSelect ? 'true' : 'false');
    });
  }

  // Commits a monochromize() result (either as a brand-new graphic element or
  // as a replacement for pendingGraphicReplaceId) - shared by the import
  // modal's "Übernehmen" button regardless of which path opened it.
  // Kicks off the (async, browser-native) Z64/zlib alternative for a chunk of
  // packed monochrome bytes and caches it - keyed by whichever object
  // (an element, or a label.storedGraphics registry entry) the generator
  // will later look it up by - once ready. Fire-and-forget: if it resolves
  // after the bytes have already moved on again (another edit landed first),
  // the cache write is simply skipped rather than applied to stale data.
  function scheduleZ64Compression(cacheKey, bytes) {
    if (!window.ZPLGraphic || !window.ZPLGraphic.encodeZ64) return;
    window.ZPLGraphic.encodeZ64(bytes).then(function (data) {
      if (!data) return; // no CompressionStream in this browser - RLE stays in effect, silently
      window.ZPLGraphic.z64Cache.set(cacheKey, { forBits: bytes, data: data });
      updateZplSource(); // reflect the (possibly now smaller) encoding once it's ready
    });
  }

  function applyImportedGraphic(decoded, monoSettings) {
    if (pendingGraphicReplaceId) {
      const el = elementById(pendingGraphicReplaceId);
      if (el) {
        el.mono = monoSettings;
        if (el.storedName) {
          // A stored/^XG graphic is shared by name - update the registry AND
          // every other element referencing the same name, not just this one.
          const storedEntry = Object.assign({}, state.label.storedGraphics[el.storedName], {
            widthPx: decoded.widthPx, heightPx: decoded.heightPx, bytesPerRow: decoded.bytesPerRow, bits: decoded.bytes, bytes: decoded.bytes,
          });
          state.label.storedGraphics[el.storedName] = storedEntry;
          scheduleZ64Compression(storedEntry, decoded.bytes);
          state.label.elements.forEach(function (other) {
            if (other.type === 'graphic' && other.storedName === el.storedName) {
              other.widthPx = decoded.widthPx; other.heightPx = decoded.heightPx; other.bytesPerRow = decoded.bytesPerRow; other.bits = decoded.bytes;
              other.mono = monoSettings;
              other.displayWidthPx = other.widthPx * (other.magX || 1); other.displayHeightPx = other.heightPx * (other.magY || 1);
            }
          });
        } else {
          el.widthPx = decoded.widthPx; el.heightPx = decoded.heightPx; el.bytesPerRow = decoded.bytesPerRow; el.bits = decoded.bytes;
          el.displayWidthPx = el.widthPx; el.displayHeightPx = el.heightPx;
          scheduleZ64Compression(el, decoded.bytes);
        }
        propFormBuiltForId = null;
        renderAll(); pushHistory();
      }
      pendingGraphicReplaceId = null;
    } else {
      const newEl = M.makeGraphic({
        x: 20, y: 20, widthPx: decoded.widthPx, heightPx: decoded.heightPx, bytesPerRow: decoded.bytesPerRow,
        bits: decoded.bytes, displayWidthPx: decoded.widthPx, displayHeightPx: decoded.heightPx, mono: monoSettings,
      });
      scheduleZ64Compression(newEl, decoded.bytes);
      state.label.elements.push(newEl);
      state.selectedIds = [newEl.id];
      resetToolToSelect();
      renderAll(); pushHistory();
    }
  }

  const MONO_DEFAULTS = { channel: 'luminance', blur: 0, blackPoint: 0, whitePoint: 255, threshold: 128, dither: 'none', invert: false };

  // Import/replace preview modal: lets the user tune how a color image gets
  // reduced to the 1bpp black/white a ZPL printer actually understands
  // (channel, blur, levels, dithering) instead of a fixed hidden threshold,
  // with a live preview so the effect of each control is visible immediately.
  function openImageImportModal(img) {
    const maxDim = 400;
    let w = img.naturalWidth, h = img.naturalHeight;
    if (w > maxDim || h > maxDim) {
      const scale = maxDim / Math.max(w, h);
      w = Math.round(w * scale); h = Math.round(h * scale);
    }
    const srcCanvas = document.createElement('canvas');
    srcCanvas.width = w; srcCanvas.height = h;
    const sctx = srcCanvas.getContext('2d');
    sctx.fillStyle = '#fff'; sctx.fillRect(0, 0, w, h);
    sctx.drawImage(img, 0, 0, w, h);
    const srcImageData = sctx.getImageData(0, 0, w, h);

    const body =
      '<div class="mono-import">' +
        '<div class="mono-preview-wrap"><canvas id="monoPreviewCanvas" width="' + w + '" height="' + h + '"></canvas></div>' +
        '<div class="prop-form">' +
          field('Farbkanal', '<select id="monoChannel">' +
            '<option value="luminance">Luminanz (Standard)</option><option value="red">Rot</option>' +
            '<option value="green">Gr&uuml;n</option><option value="blue">Blau</option><option value="average">Durchschnitt</option></select>') +
          '<p class="hint">Welcher Farbanteil in Schwarz/Wei&szlig; umgerechnet wird &ndash; bei farbigen Logos kann ein einzelner Kanal oft mehr Kontur erhalten als der Standard.</p>' +
          field('Gau&szlig;-Wei&szlig;zeichnung: <span id="monoBlurVal">0</span>', '<input type="range" id="monoBlur" min="0" max="8" step="1" value="0">') +
          '<p class="hint">Gl&auml;ttet Rauschen/Feinstruktur vor der Umwandlung &ndash; reduziert Sprenkel bei Fotos.</p>' +
          fieldPair(
            field('Schwarzpunkt: <span id="monoBlackVal">0</span>', '<input type="range" id="monoBlack" min="0" max="254" value="0">'),
            field('Wei&szlig;punkt: <span id="monoWhiteVal">255</span>', '<input type="range" id="monoWhite" min="1" max="255" value="255">')
          ) +
          '<p class="hint">Level: Tonwerte au&szlig;erhalb dieses Bereichs werden vor dem Schwellenwert auf ganz Schwarz bzw. ganz Wei&szlig; gezogen (Kontrast).</p>' +
          field('Schwellenwert: <span id="monoThresholdVal">128</span>', '<input type="range" id="monoThreshold" min="0" max="255" value="128">') +
          '<p class="hint">Ab wann ein Bildpunkt als Schwarz statt Wei&szlig; gilt.</p>' +
          field('Dithering', '<select id="monoDither"><option value="none">Kein (harte Kante)</option><option value="floyd-steinberg">Floyd-Steinberg</option></select>') +
          '<p class="hint">Floyd-Steinberg streut die Schwarz/Wei&szlig;-Punkte statt hart abzuschneiden &ndash; wirkt bei Fotos oft deutlich weicher.</p>' +
          '<div class="field-row field-check"><input type="checkbox" id="monoInvert"><label for="monoInvert">Invertieren</label></div>' +
        '</div>' +
        '<div class="btn-row"><button id="btnMonoApply" class="primary">&Uuml;bernehmen</button><button id="btnMonoCancel">Abbrechen</button></div>' +
      '</div>';
    openModal(pendingGraphicReplaceId ? 'Bild ersetzen' : 'Grafik importieren', body);

    const previewCanvas = $('monoPreviewCanvas');
    const previewCtx = previewCanvas.getContext('2d');
    let lastDecoded = null;

    function currentSettings() {
      return {
        channel: $('monoChannel').value,
        blur: parseInt($('monoBlur').value, 10) || 0,
        blackPoint: parseInt($('monoBlack').value, 10) || 0,
        whitePoint: parseInt($('monoWhite').value, 10) || 255,
        threshold: parseInt($('monoThreshold').value, 10) || 0,
        dither: $('monoDither').value,
        invert: $('monoInvert').checked,
      };
    }

    function renderPreview() {
      const settings = currentSettings();
      $('monoBlurVal').textContent = settings.blur;
      $('monoBlackVal').textContent = settings.blackPoint;
      $('monoWhiteVal').textContent = settings.whitePoint;
      $('monoThresholdVal').textContent = settings.threshold;
      lastDecoded = window.ImageMono.monochromize(srcImageData, settings);
      const previewImgData = window.ZPLGraphic.bitsToImageData(lastDecoded);
      // bitsToImageData's "white" pixels are alpha=0, not opaque white - putting
      // them directly on the visible canvas and reading pixels back (as a
      // screenshot or a naive re-read would) can come back premultiplied to
      // (0,0,0,0) in some browsers. Composite through an offscreen canvas via
      // drawImage (proper alpha compositing) onto an explicitly white-filled
      // preview canvas instead, exactly like the real label renderer does.
      const off = document.createElement('canvas');
      off.width = lastDecoded.widthPx; off.height = lastDecoded.heightPx;
      off.getContext('2d').putImageData(previewImgData, 0, 0);
      previewCtx.fillStyle = '#fff';
      previewCtx.fillRect(0, 0, previewCanvas.width, previewCanvas.height);
      previewCtx.drawImage(off, 0, 0);
    }
    renderPreview();

    ['monoChannel', 'monoBlur', 'monoBlack', 'monoWhite', 'monoThreshold', 'monoDither', 'monoInvert'].forEach(function (id) {
      const elx = $(id);
      elx.addEventListener('input', renderPreview);
      elx.addEventListener('change', renderPreview);
    });

    // Every close path (Übernehmen, Abbrechen, the × button, clicking the
    // backdrop) must reach this exactly once, so the two listeners added
    // here for the generic × / backdrop paths don't pile up across repeated
    // imports - each is removed the moment any one of the four paths fires.
    function cleanup(shouldResetPending) {
      $('modalOverlay').classList.add('hidden');
      $('modalClose').removeEventListener('click', onCloseButtonClick);
      $('modalOverlay').removeEventListener('click', onBackdropClick);
      if (shouldResetPending) {
        $('graphicInput').value = '';
        pendingGraphicReplaceId = null;
      }
    }
    function onCloseButtonClick() { cleanup(true); }
    function onBackdropClick(e) { if (e.target === $('modalOverlay')) cleanup(true); }
    $('modalClose').addEventListener('click', onCloseButtonClick);
    $('modalOverlay').addEventListener('click', onBackdropClick);

    $('btnMonoApply').addEventListener('click', function () {
      const settings = currentSettings();
      const decoded = lastDecoded;
      cleanup(false); // applyImportedGraphic reads/clears pendingGraphicReplaceId itself
      $('graphicInput').value = '';
      applyImportedGraphic(decoded, settings);
    });
    $('btnMonoCancel').addEventListener('click', function () { cleanup(true); });
  }

  $('graphicInput').addEventListener('change', function (e) {
    const file = e.target.files[0];
    if (!file) return;
    const img = new Image();
    img.onload = function () { openImageImportModal(img); };
    img.onerror = function () { showToast('Bild konnte nicht geladen werden.', true); pendingGraphicReplaceId = null; e.target.value = ''; };
    img.src = URL.createObjectURL(file);
  });

  // ---------------------------------------------------------------------
  // Canvas interaction: select / move / resize / place-new
  // ---------------------------------------------------------------------
  function cycleOrientation(el) {
    if (el.type === 'barcode') {
      el.params = el.params || {};
      el.params.orientation = ORIENT_CYCLE[el.params.orientation || 'N'] || 'N';
    } else {
      el.orientation = ORIENT_CYCLE[el.orientation || 'N'] || 'N';
    }
    renderAll();
    pushHistory();
  }

  function canvasPointToDots(clientX, clientY) {
    const rect = canvas.getBoundingClientRect();
    return { x: (clientX - rect.left) / state.zoom, y: (clientY - rect.top) / state.zoom };
  }

  function handleForBounds(b, dotX, dotY) {
    const hs = 8 / state.zoom;
    const corners = { nw: [b.x, b.y], ne: [b.x + b.w, b.y], sw: [b.x, b.y + b.h], se: [b.x + b.w, b.y + b.h] };
    // Pick the CLOSEST matching corner rather than a fixed key order, so a
    // tiny (near its 2-dot minimum) element - where all four corners can fall
    // within the hit radius of each other - can still be grabbed by whichever
    // corner the cursor is actually nearest to, instead of always resolving
    // to the same one.
    let best = null, bestDist = Infinity;
    for (const key in corners) {
      const c = corners[key];
      const dx = dotX - c[0], dy = dotY - c[1];
      if (Math.abs(dx) <= hs && Math.abs(dy) <= hs) {
        const dist = dx * dx + dy * dy;
        if (dist < bestDist) { bestDist = dist; best = key; }
      }
    }
    return best;
  }

  canvas.addEventListener('mousedown', function (e) {
    const p = canvasPointToDots(e.clientX, e.clientY);
    const dotX = Math.round(p.x), dotY = Math.round(p.y);
    const additive = e.ctrlKey || e.metaKey;

    if (state.tool !== 'select') {
      let newEl;
      const nx = snapValue(dotX), ny = snapValue(dotY);
      if (state.tool === 'text') newEl = M.makeText({ x: nx, y: ny, origin: 'FO' });
      else if (state.tool === 'barcode') newEl = M.makeBarcode({ x: nx, y: ny, origin: 'FO' });
      else if (state.tool === 'box') newEl = M.makeBox({ x: nx, y: ny, origin: 'FO' });
      else if (state.tool === 'circle') newEl = M.makeCircle({ x: nx, y: ny, origin: 'FO' });
      else if (state.tool === 'line') newEl = M.makeLine({ x: nx, y: ny, origin: 'FO' });
      else if (state.tool === 'ellipse') newEl = M.makeEllipse({ x: nx, y: ny, origin: 'FO' });
      if (newEl) {
        state.label.elements.push(newEl);
        state.selectedIds = [newEl.id];
        resetToolToSelect();
        renderAll();
        pushHistory();
      }
      return;
    }

    // Rotate handle: only live for a lone selected text/barcode element (the
    // only two ZPL types ^A/^B orientation applies to). Checked before
    // hitTest since the handle floats above the element's own bounds.
    if (state.selectedIds.length === 1) {
      const solo = elementById(state.selectedIds[0]);
      if (solo && elementSupportsOrientation(solo)) {
        const hp = getRotateHandlePos(solo);
        const tol = Math.max(8, 10 / state.zoom);
        const hdx = dotX - hp.x, hdy = dotY - hp.y;
        if (hdx * hdx + hdy * hdy <= tol * tol) {
          cycleOrientation(solo);
          e.preventDefault();
          return;
        }
      }
    }

    const el = hitTest(dotX, dotY);
    if (!el) {
      // Empty canvas: start a rectangle marquee. The actual selection change
      // (replace, or union if Ctrl/Cmd is held) happens on mouseup, once we
      // know whether the user actually dragged or just clicked to deselect.
      state.drag = { mode: 'marquee', startDotX: dotX, startDotY: dotY, curDotX: dotX, curDotY: dotY, additive: additive };
      drawLabel();
      e.preventDefault();
      return;
    }

    // Clicking any member of a persistent group (see groupSelected) brings
    // in the rest of that group too, so the group always moves as one unit
    // from here on - clickIds is just [el.id] for an ungrouped element.
    const clickIds = groupMemberIds(el);
    if (additive) {
      // Ctrl/Cmd-click toggles the WHOLE group as a unit rather than just
      // el.id, so a group can never end up half-selected through this path.
      const allIn = clickIds.every(isSelected);
      state.selectedIds = allIn
        ? state.selectedIds.filter(function (id) { return clickIds.indexOf(id) === -1; })
        : Array.from(new Set(state.selectedIds.concat(clickIds)));
    } else if (!isSelected(el.id)) {
      state.selectedIds = clickIds;
    }
    // else: clicking an already-selected element within a multi-selection
    // keeps the whole selection intact, so a group-drag can follow.
    buildPropForm();

    // Resize handles only apply when exactly one (resizable) element is selected.
    const single = state.selectedIds.length === 1 ? elementById(state.selectedIds[0]) : null;
    const handle = (single && single.id === el.id && isFreeResizable(single))
      ? handleForBounds(getBounds(single), dotX, dotY) : null;

    // Snapshot every selected element's start position (and size, for the
    // single-resizable-element case) so mousemove can compute deltas from a
    // stable baseline regardless of how many elements are selected.
    const starts = {};
    editableSelectedElements().forEach(function (sel) {
      starts[sel.id] = {
        x: sel.x, y: sel.y,
        w: (sel.type === 'box' || sel.type === 'line' || sel.type === 'ellipse') ? sel.widthDots : (sel.type === 'circle' ? sel.diameter : (sel.displayWidthPx != null ? sel.displayWidthPx : sel.widthPx)),
        h: (sel.type === 'box' || sel.type === 'line' || sel.type === 'ellipse') ? sel.heightDots : (sel.type === 'circle' ? sel.diameter : (sel.displayHeightPx != null ? sel.displayHeightPx : sel.heightPx)),
      };
    });

    state.drag = { mode: 'move', id: el.id, handle: handle, startDotX: dotX, startDotY: dotY, starts: starts };
    drawLabel();
    e.preventDefault();
  });

  // Coordinate/size HUD - a small always-visible readout pinned to the
  // canvas corner (see .coord-hud) so a user nudging e.g. a barcode a few
  // dots to line up with something doesn't have to look away from the
  // canvas at the sidebar's X/Y fields to see where they actually are.
  function setCoordHud(text) {
    const hud = $('coordHud');
    if (text == null) { hud.classList.add('hidden'); return; }
    hud.textContent = text;
    hud.classList.remove('hidden');
  }
  canvas.addEventListener('mousemove', function (e) {
    if (state.drag || state.tool !== 'select') return; // the drag branch below owns the HUD while a drag is active
    const p = canvasPointToDots(e.clientX, e.clientY);
    setCoordHud(formatPoint(p.x, p.y));
  });
  canvas.addEventListener('mouseleave', function () {
    if (!state.drag) setCoordHud(null);
  });

  // ---------------------------------------------------------------------
  // Right-click context menu - the actions offered depend on what's under
  // the cursor: something to act on (duplicate/reorder/delete, plus a
  // graphic-specific "Bild ersetzen…" when exactly one graphic is selected)
  // vs. empty canvas (just "Alles auswählen"). Reuses the exact same
  // functions the toolbar buttons and keyboard shortcuts already call, so
  // there's only ever one implementation of each action to keep correct.
  function hideContextMenu() {
    $('canvasContextMenu').classList.add('hidden');
  }
  function showContextMenu(clientX, clientY, items) {
    const menu = $('canvasContextMenu');
    menu.innerHTML = items.map(function (item, i) {
      if (item.sep) return '<li class="context-menu-sep" role="separator"></li>';
      return '<li role="menuitem" tabindex="0" data-idx="' + i + '" class="' + (item.danger ? 'danger' : '') + '">' +
        escapeHtml(item.label) + (item.shortcut ? '<span class="context-menu-shortcut">' + escapeHtml(item.shortcut) + '</span>' : '') +
        '</li>';
    }).join('');
    menu.querySelectorAll('[data-idx]').forEach(function (li) {
      const item = items[parseInt(li.getAttribute('data-idx'), 10)];
      function activate() { hideContextMenu(); item.run(); }
      li.addEventListener('click', activate);
      li.addEventListener('keydown', function (e) { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); activate(); } });
    });
    menu.classList.remove('hidden');
    menu.style.left = clientX + 'px';
    menu.style.top = clientY + 'px';
    // Clamp so a right-click near the window edge doesn't render off-screen.
    const rect = menu.getBoundingClientRect();
    if (rect.right > window.innerWidth) menu.style.left = Math.max(0, window.innerWidth - rect.width - 4) + 'px';
    if (rect.bottom > window.innerHeight) menu.style.top = Math.max(0, window.innerHeight - rect.height - 4) + 'px';
  }
  canvas.addEventListener('contextmenu', function (e) {
    e.preventDefault();
    if (state.tool !== 'select') return; // a drawing tool is active - right-click has no defined meaning there yet
    const p = canvasPointToDots(e.clientX, e.clientY);
    const el = hitTest(Math.round(p.x), Math.round(p.y));
    if (el && !isSelected(el.id)) {
      // Right-clicking an element outside the current selection selects just
      // that one (plus the rest of its persistent group, if any - standard
      // editor convention) - but right-clicking something ALREADY part of a
      // multi-selection keeps the whole selection, so e.g. "Löschen" acts on
      // the group as expected.
      state.selectedIds = groupMemberIds(el);
      buildPropForm();
      renderAll();
    }
    // The menu variant depends on whether this click actually hit something -
    // NOT on state.selectedIds.length, which can be non-empty from an
    // unrelated earlier selection even when this particular right-click
    // landed on genuinely empty canvas (that stale selection must not make
    // an empty-space right-click show "Duplizieren"/"Löschen" for an element
    // the user didn't click on this time).
    const items = [];
    if (el) {
      items.push({ label: 'Kopieren', shortcut: 'Strg+C', run: copySelected });
      items.push({ label: 'Ausschneiden', shortcut: 'Strg+X', run: cutSelected });
      if (elementClipboard) items.push({ label: 'Einfügen', shortcut: 'Strg+V', run: pasteElements });
      items.push({ sep: true });
      items.push({ label: 'Duplizieren', shortcut: 'Strg+D', run: duplicateSelected });
      items.push({ label: 'In den Vordergrund', run: function () { reorderSelected(true); } });
      items.push({ label: 'In den Hintergrund', run: function () { reorderSelected(false); } });
      if (state.selectedIds.length === 1) {
        const solo = elementById(state.selectedIds[0]);
        if (solo && solo.type === 'graphic') {
          items.push({ sep: true });
          items.push({ label: 'Bild ersetzen…', run: function () { pendingGraphicReplaceId = solo.id; $('graphicInput').click(); } });
        }
      }
      if (state.selectedIds.length > 1) {
        items.push({ sep: true });
        items.push({ label: 'Gruppieren', shortcut: 'Strg+G', run: groupSelected });
      }
      if (selectedElements().some(function (e) { return e.groupId; })) {
        if (state.selectedIds.length <= 1) items.push({ sep: true });
        items.push({ label: 'Gruppierung aufheben', shortcut: 'Strg+Umschalt+G', run: ungroupSelected });
      }
      items.push({ sep: true });
      items.push({ label: 'Löschen', shortcut: 'Entf', danger: true, run: deleteSelected });
    } else {
      if (elementClipboard) items.push({ label: 'Einfügen', shortcut: 'Strg+V', run: pasteElements });
      items.push({ label: 'Alles auswählen', shortcut: 'Strg+A', run: selectAll });
      if (state.selectedIds.length) {
        items.push({ label: 'Auswahl aufheben', shortcut: 'Escape', run: function () { state.selectedIds = []; renderAll(); buildPropForm(); } });
      }
    }
    showContextMenu(e.clientX, e.clientY, items);
  });
  document.addEventListener('click', function (e) {
    const menu = $('canvasContextMenu');
    if (!menu.classList.contains('hidden') && !menu.contains(e.target)) hideContextMenu();
  });
  window.addEventListener('blur', hideContextMenu);

  window.addEventListener('mousemove', function (e) {
    if (!state.drag) return;
    const p = canvasPointToDots(e.clientX, e.clientY);

    if (state.drag.mode === 'marquee') {
      state.drag.curDotX = Math.round(p.x);
      state.drag.curDotY = Math.round(p.y);
      setCoordHud(formatLength(Math.abs(state.drag.curDotX - state.drag.startDotX)) + ' × ' + formatLength(Math.abs(state.drag.curDotY - state.drag.startDotY)));
      drawLabel();
      return;
    }
    // Alignment guides only ever apply to the plain-move branch below - clear
    // them up front so a resize (or a move that no longer matches) doesn't
    // leave a stale guide line drawn from a previous frame.
    state.alignGuides = null;

    let dx = Math.round(p.x - state.drag.startDotX);
    let dy = Math.round(p.y - state.drag.startDotY);

    // Axis lock: holding Shift constrains a plain move to whichever axis has
    // the larger delta (resizes already have directional handles, so this
    // only applies to moving, not resizing).
    if (e.shiftKey && !state.drag.handle) {
      if (Math.abs(dx) > Math.abs(dy)) dy = 0; else dx = 0;
    }

    if (state.drag.handle) {
      const id = state.drag.id;
      const el = elementById(id);
      if (!el) return;
      const st = state.drag.starts[id];
      const startW = st.w, startH = st.h;
      // Clamp the CURSOR DELTA (not the resulting width/height) to the point
      // where size would hit its 2-dot minimum, so the fixed opposite corner
      // never moves even if the user keeps dragging past it - previously the
      // position and the (independently clamped) size could desync, making
      // the element appear to teleport once shrunk to its minimum.
      let dxc = dx, dyc = dy;
      if (state.drag.handle === 'se') { dxc = Math.max(dx, 2 - startW); dyc = Math.max(dy, 2 - startH); }
      else if (state.drag.handle === 'sw') { dxc = Math.min(dx, startW - 2); dyc = Math.max(dy, 2 - startH); }
      else if (state.drag.handle === 'ne') { dxc = Math.max(dx, 2 - startW); dyc = Math.min(dy, startH - 2); }
      else if (state.drag.handle === 'nw') { dxc = Math.min(dx, startW - 2); dyc = Math.min(dy, startH - 2); }

      let newW = startW, newH = startH, newX = st.x, newY = st.y;
      if (state.drag.handle === 'se') { newW += dxc; newH += dyc; }
      else if (state.drag.handle === 'sw') { newW -= dxc; newH += dyc; newX += dxc; }
      else if (state.drag.handle === 'ne') { newW += dxc; newH -= dyc; newY += dyc; }
      else if (state.drag.handle === 'nw') { newW -= dxc; newH -= dyc; newX += dxc; newY += dyc; }
      newX = snapValue(newX); newY = snapValue(newY);
      newW = Math.max(2, snapValue(newW)); newH = Math.max(2, snapValue(newH));
      if (el.type === 'box' || el.type === 'line' || el.type === 'ellipse') { el.x = newX; el.y = newY; el.widthDots = newW; el.heightDots = newH; }
      else if (el.type === 'circle') { el.x = newX; el.y = newY; el.diameter = Math.max(newW, newH); }
      else if (el.type === 'graphic') { el.x = newX; el.y = newY; el.displayWidthPx = newW; el.displayHeightPx = newH; }
      syncPropFormValues(el);
      setCoordHud(formatLength(newW) + ' × ' + formatLength(newH));
    } else {
      setCoordHud('Δx ' + (dx >= 0 ? '+' : '') + formatLength(dx) + ', Δy ' + (dy >= 0 ? '+' : '') + formatLength(dy));
      // Smart alignment guides: snap based on the PRIMARY dragged element only
      // (see computeAlignSnap) - when it finds a match on an axis, that axis's
      // grid-snap is skipped for every selected element so the exact alignment
      // isn't immediately un-done by rounding to the grid.
      const primary = elementById(state.drag.id);
      const pst = primary && state.drag.starts[primary.id];
      const align = pst ? computeAlignSnap(primary, pst.x + dx, pst.y + dy) : { dx: 0, dy: 0, guideX: null, guideY: null };
      state.alignGuides = { guideX: align.guideX, guideY: align.guideY };
      const finalDx = dx + align.dx, finalDy = dy + align.dy;
      // Group move: apply the SAME delta to every selected element's own start position.
      Object.keys(state.drag.starts).forEach(function (id) {
        const el = elementById(id);
        if (!el) return;
        const st = state.drag.starts[id];
        el.x = align.guideX ? st.x + finalDx : snapValue(st.x + finalDx);
        el.y = align.guideY ? st.y + finalDy : snapValue(st.y + finalDy);
      });
      if (primary) syncPropFormValues(primary);
    }
    drawLabel();
  });

  window.addEventListener('mouseup', function () {
    if (!state.drag) return;
    setCoordHud(null);
    state.alignGuides = null;

    if (state.drag.mode === 'marquee') {
      const d = state.drag;
      const x1 = Math.min(d.startDotX, d.curDotX), x2 = Math.max(d.startDotX, d.curDotX);
      const y1 = Math.min(d.startDotY, d.curDotY), y2 = Math.max(d.startDotY, d.curDotY);
      const draggedFar = (x2 - x1) > 3 || (y2 - y1) > 3;
      let hitIds = [];
      if (draggedFar) {
        state.label.elements.forEach(function (el) {
          if (el.type === 'raw' || el.hidden || el.locked) return;
          const b = getAABB(el);
          if (b.x < x2 && b.x + b.w > x1 && b.y < y2 && b.y + b.h > y1) hitIds.push(el.id);
        });
        // A marquee that only grazes one member of a persistent group still
        // pulls in the whole group, same as a plain click would.
        hitIds = expandIdsToGroups(hitIds);
        hitIds = hitIds.filter(function (id) { const el = elementById(id); return el && !el.hidden && !el.locked; });
      }
      if (d.additive) {
        if (draggedFar) { const set = new Set(state.selectedIds.concat(hitIds)); state.selectedIds = Array.from(set); }
        // else: a plain Ctrl/Cmd-click on empty space with no drag - leave the selection untouched.
      } else {
        state.selectedIds = hitIds; // empty if it was just a click with no drag -> deselect all
      }
      state.drag = null;
      renderAll();
      return;
    }

    const wasResize = !!state.drag.handle;
    const draggedId = state.drag.id;
    state.drag = null;
    if (wasResize) {
      const el = elementById(draggedId);
      if (el && el.type === 'graphic') resampleGraphic(el);
    }
    renderAll();
    pushHistory();
  });

  window.addEventListener('keydown', function (e) {
    // Checked before the input/textarea/select early-return below, since a
    // keyboard user is often focused on one of the modal's OWN controls
    // (e.g. the image-import preview's threshold slider) - Escape closing
    // the modal from there is exactly the case that most needs it to work,
    // and previously did nothing at all (there was no way to close a modal
    // by keyboard - clicking the backdrop or the tiny × was the only path).
    if (e.key === 'Escape' && !$('modalOverlay').classList.contains('hidden')) {
      $('modalClose').click();
      e.preventDefault();
      return;
    }
    if (e.key === 'Escape' && !$('canvasContextMenu').classList.contains('hidden')) {
      hideContextMenu();
      e.preventDefault();
      return;
    }
    if ((e.ctrlKey || e.metaKey) && e.code === 'Backquote') {
      setConsoleOpen(!workspacePrefs.consoleOpen);
      e.preventDefault();
      return;
    }
    const tag = (document.activeElement && document.activeElement.tagName) || '';
    if (tag === 'INPUT' || tag === 'TEXTAREA' || tag === 'SELECT') {
      if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === 'z') { e.preventDefault(); if (e.shiftKey) redo(); else undo(); }
      return;
    }
    if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === 'z') { e.preventDefault(); if (e.shiftKey) redo(); else undo(); return; }
    if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === 'y') { e.preventDefault(); redo(); return; }
    if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === 'c') { e.preventDefault(); copySelected(); return; }
    if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === 'x') { e.preventDefault(); cutSelected(); return; }
    if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === 'v') { e.preventDefault(); pasteElements(); return; }
    if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === 'd') { e.preventDefault(); duplicateSelected(); return; }
    if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === 'a') { e.preventDefault(); selectAll(); return; }
    if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === 'g') { e.preventDefault(); if (e.shiftKey) ungroupSelected(); else groupSelected(); return; }
    if (e.key === 'Escape' && state.selectedIds.length) { state.selectedIds = []; renderAll(); e.preventDefault(); return; }
    if (!state.selectedIds.length) return;
    const els = editableSelectedElements();
    if (!els.length) return;
    const step = e.shiftKey ? 10 : 1;
    let moved = true;
    if (e.key === 'ArrowUp') els.forEach(function (el) { el.y -= step; });
    else if (e.key === 'ArrowDown') els.forEach(function (el) { el.y += step; });
    else if (e.key === 'ArrowLeft') els.forEach(function (el) { el.x -= step; });
    else if (e.key === 'ArrowRight') els.forEach(function (el) { el.x += step; });
    else if (e.key === 'Delete' || e.key === 'Backspace') {
      deleteSelected();
      e.preventDefault();
      return;
    } else { moved = false; }
    if (moved) {
      e.preventDefault();
      drawLabel();
      buildPropForm(); // cheap for both the single-element sync path and the fixed multi-select summary panel
      updateZplSource();
      // Coalesce a held-key repeat burst (OS auto-repeat can fire 20-30/sec)
      // into a single history entry instead of one full-label snapshot per
      // 1-dot step, which would otherwise fill the undo cap almost instantly.
      scheduleNudgeHistoryPush();
    }
  });

  // ---------------------------------------------------------------------
  // Top bar: zoom, undo/redo, sample-data toggle
  // ---------------------------------------------------------------------
  $('btnZoomIn').addEventListener('click', function () { state.zoom = Math.min(4, state.zoom * 1.2); $('zoomLabel').textContent = Math.round(state.zoom * 100) + '%'; drawLabel(); });
  $('btnZoomOut').addEventListener('click', function () { state.zoom = Math.max(0.1, state.zoom / 1.2); $('zoomLabel').textContent = Math.round(state.zoom * 100) + '%'; drawLabel(); });
  $('btnZoomFit').addEventListener('click', function () { fitZoom(); drawLabel(); });

  // --- Multi-label navigation -------------------------------------------
  $('btnLabelPrev').addEventListener('click', function () { setActiveLabel(activeIndex() - 1); });
  $('btnLabelNext').addEventListener('click', function () { setActiveLabel(activeIndex() + 1); });
  $('labelNavSelect').addEventListener('change', function (e) { setActiveLabel(parseInt(e.target.value, 10) || 0); });
  $('btnLabelAdd').addEventListener('click', addLabel);
  $('btnLabelDuplicate').addEventListener('click', duplicateActiveLabel);
  $('btnLabelMoveUp').addEventListener('click', function () { moveActiveLabel(-1); });
  $('btnLabelMoveDown').addEventListener('click', function () { moveActiveLabel(1); });
  $('btnLabelDelete').addEventListener('click', deleteActiveLabel);
  $('btnUndo').addEventListener('click', undo);
  $('btnRedo').addEventListener('click', redo);
  $('chkSampleData').addEventListener('change', function (e) { state.sampleDataMode = e.target.checked; drawLabel(); });
  $('chkHideUnfilled').addEventListener('change', function (e) { state.hideUnfilledPlaceholders = e.target.checked; drawLabel(); });

  // Renames a $PLACEHOLDER$ across every text/barcode field in the current
  // label in one action - e.g. when an upstream field name changes,
  // instead of hand-editing every occurrence.
  $('btnVarRename').addEventListener('click', function () {
    const from = $('varRenameFrom').value;
    const to = $('varRenameTo').value.trim().replace(/^\$+|\$+$/g, '');
    if (!from) { showToast('Kein Platzhalter zum Umbenennen gefunden.', true); return; }
    if (!to) { showToast('Bitte einen neuen Namen eingeben.', true); return; }
    if (!/^[A-Za-z0-9_]+$/.test(to)) { showToast('Der neue Name darf nur Buchstaben, Zahlen und _ enthalten.', true); return; }
    const pattern = new RegExp('\\$' + from.replace(/[.*+?^${}()|[\]\\]/g, '\\$&') + '\\$', 'g');
    let count = 0;
    // Always call .replace() and compare, rather than a separate .test()
    // first - a global regex's `.test()` mutates lastIndex, which would
    // otherwise leak state between elements in this loop.
    state.label.elements.forEach(function (el) {
      if (el.type === 'text' && el.text) {
        const next = el.text.replace(pattern, '$' + to + '$');
        if (next !== el.text) { el.text = next; count++; }
      } else if (el.type === 'barcode' && el.data) {
        const next = el.data.replace(pattern, '$' + to + '$');
        if (next !== el.data) { el.data = next; count++; }
      }
    });
    if (state.sampleValues[from] !== undefined) {
      state.sampleValues[to] = state.sampleValues[from];
      delete state.sampleValues[from];
    }
    if (state.sampleValueSource[from] !== undefined) {
      state.sampleValueSource[to] = state.sampleValueSource[from];
      delete state.sampleValueSource[from];
    }
    if (count === 0) { showToast('„$' + from + '$“ wurde in keinem Feld gefunden.', true); return; }
    $('varRenameTo').value = '';
    renderAll();
    pushHistory();
    showToast('„$' + from + '$“ in ' + count + ' Feld(ern) zu „$' + to + '$“ umbenannt.');
  });
  $('chkGrid').addEventListener('change', function (e) { state.grid.enabled = e.target.checked; drawLabel(); });
  $('gridSize').addEventListener('change', function (e) {
    // state.grid.size is always in dots (that's what snapValue/drawGrid work
    // in); the input is whatever the unit selector currently shows, so a mm
    // grid stays a mm grid across a DPI change instead of silently becoming
    // a different physical spacing.
    const raw = parseFloat(String(e.target.value).replace(',', '.'));
    if (state.unit === 'mm') {
      const mm = Math.max(0.1, isFinite(raw) ? raw : 1);
      state.grid.size = Math.max(1, Math.round(DPI.mmToDots(mm, currentDpi())));
    } else {
      state.grid.size = Math.max(1, Math.round(isFinite(raw) ? raw : 10));
    }
    syncGridSizeInput();
    drawLabel();
  });

  // Mirrors state.grid.size into the toolbar input in the currently selected
  // unit. Called after a unit switch and after a DPI conversion, both of
  // which change what the same dot value reads as.
  function syncGridSizeInput() {
    const input = $('gridSize');
    if (state.unit === 'mm') {
      input.value = formatNumber(dotsToMm(state.grid.size), 1).replace(',', '.');
      input.min = '0.1';
      input.title = t('Gitterweite in mm');
    } else {
      input.value = String(state.grid.size);
      input.min = '1';
      input.title = t('Gitterweite in Dots');
    }
  }
  $('unitSelect').addEventListener('change', function (e) {
    state.unit = e.target.value === 'mm' ? 'mm' : 'dots';
    syncGridSizeInput();
  });

  // ---------------------------------------------------------------------
  // Local crash recovery. The complete editor document is stored (including
  // graphics and editor-only locks/guides), while actual FileSystem handles
  // deliberately are not. localStorage failures/quota limits never block
  // editing; the compact status in the toolbar makes that state visible.
  const AUTOSAVE_KEY = 'zplStudioAutosaveV1';
  let autosaveTimer = null;
  let cleanDocumentSnapshot = null;
  let autosaveStatusKey = '';
  let autosaveStatusFailed = false;

  function serializedDocument() {
    if (!state.doc) return '';
    // Every parsed label points at the same document-level graphic registry.
    // Strip those repeated references before JSON serialization or a spool
    // with 20 labels would store the identical bitmap data 21 times.
    const compact = Object.assign({}, state.doc, {
      labels: state.doc.labels.map(function (label) { return Object.assign({}, label, { storedGraphics: undefined }); }),
    });
    return JSON.stringify(compact, uint8JsonReplacer);
  }
  function setAutosaveStatus(text, failed) {
    const status = $('autosaveStatus');
    if (!status) return;
    autosaveStatusKey = text || '';
    autosaveStatusFailed = !!failed;
    status.textContent = text ? t(text) : '';
    status.classList.toggle('is-error', !!failed);
  }
  function removeAutosaveDraft() {
    try { localStorage.removeItem(AUTOSAVE_KEY); } catch (e) { /* recovery is optional */ }
  }
  function writeAutosaveNow() {
    clearTimeout(autosaveTimer);
    autosaveTimer = null;
    if (!state.doc) return;
    const serialized = serializedDocument();
    if (serialized === cleanDocumentSnapshot) {
      removeAutosaveDraft();
      setAutosaveStatus('Gespeichert');
      return;
    }
    try {
      localStorage.setItem(AUTOSAVE_KEY, JSON.stringify({
        version: 1,
        savedAt: Date.now(),
        fileName: state.currentFileName || state.currentServerFileName || null,
        document: serialized,
      }));
      setAutosaveStatus('Lokal gesichert');
      $('autosaveStatus').title = 'Ungespeicherter Stand wurde lokal im Browser gesichert.';
    } catch (e) {
      setAutosaveStatus('Autosave fehlgeschlagen', true);
      $('autosaveStatus').title = 'Der lokale Browser-Speicher ist nicht verfügbar oder voll.';
    }
  }
  function scheduleAutosave() {
    clearTimeout(autosaveTimer);
    autosaveTimer = setTimeout(writeAutosaveNow, 700);
  }
  function markDocumentClean() {
    cleanDocumentSnapshot = serializedDocument();
    removeAutosaveDraft();
    setAutosaveStatus(state.currentFileName || state.currentServerFileName ? 'Gespeichert' : 'Bereit');
  }
  function markDocumentRecovered() {
    cleanDocumentSnapshot = null;
    setAutosaveStatus('Wiederhergestellt');
    scheduleAutosave();
  }
  function readAutosaveDraft() {
    try {
      const draft = JSON.parse(localStorage.getItem(AUTOSAVE_KEY) || 'null');
      if (!draft || draft.version !== 1 || typeof draft.document !== 'string') return null;
      const doc = JSON.parse(draft.document, uint8JsonReviver);
      if (!doc || !Array.isArray(doc.labels) || !doc.labels.length) return null;
      doc.storedGraphics = doc.storedGraphics || {};
      doc.labels.forEach(function (label) { label.storedGraphics = doc.storedGraphics; });
      return { doc: doc, savedAt: draft.savedAt, fileName: draft.fileName };
    } catch (e) {
      removeAutosaveDraft();
      return null;
    }
  }
  window.addEventListener('beforeunload', writeAutosaveNow);

  // ---------------------------------------------------------------------
  // File: new / open / save / download
  // ---------------------------------------------------------------------
  $('btnNew').addEventListener('click', function () {
    if (!confirm('Neues leeres Label erstellen? Nicht gespeicherte Änderungen gehen verloren.')) return;
    loadLabel(M.defaultLabel(), null, null);
  });

  // A small, self-contained demo label (fictional data) - lets someone try
  // the editor's tools with one click, without needing a real .zpl file on
  // hand first. Deliberately touches a wide spread of element types/features
  // (filled+rounded box, field-reverse, a fixed-pitch font, wrapped text with
  // a hanging indent, two barcode symbologies, a circle) rather than staying
  // minimal, so it doubles as a quick visual check that all of them render
  // correctly. The divider under the title is ^GB (a real filled bar), not
  // ^GD - a shallow ^GD "line" prints almost invisibly on a real printer
  // (see drawLineElement's comment), so it's the wrong tool for a horizontal
  // rule even though it can be dragged into looking like one on-screen.
  const SAMPLES = {
    basic:
      '^XA\n' +
      '^MMT\n' +
      '^PW812\n' +
      '^LL609\n' +
      '^LH0,0\n' +
      '^LS0\n' +
      '^PON\n' +
      '^CI0\n' +
      '^FO30,30^GB752,549,4,B,0^FS\n' +
      '^FO60,50^A0N,50,0^FDBeispiel-Label^FS\n' +
      '^FO560,42^GB190,55,55,B,4^FS\n' +
      '^FO580,55^ADN,28,0^FR^FDEILIG^FS\n' +
      '^FO60,112^GB692,3,3,B,0^FS\n' +
      '^FO60,130^A0N,30,0^FDLagerplatz: A-12-03^FS\n' +
      '^FO60,168^A0N,30,0^FDArtikel-Nr.: 100234^FS\n' +
      '^FO60,206^A0N,30,0^FDBezeichnung: Sechskantschraube M6x20^FS\n' +
      '^FO60,244^A0N,30,0^FDMenge: 500 Stk.^FS\n' +
      '^FO60,286^FB620,2,0,L,20^A0N,26,0^FDHinweis: Nur mit Handschuhen anfassen, Kanten koennen scharf sein.^FS\n' +
      '^FO60,346^BY3,3,85\n' +
      '^FO60,346^BCN,85,Y,N,N,N\n' +
      '^FD1002340001^FS\n' +
      '^FO600,346^GC70,4,B^FS\n' +
      '^FO60,472^BY2,2,50\n' +
      '^FO60,472^BEN,50,Y,N\n' +
      '^FD400123456785^FS\n' +
      '^PQ1,0,1,Y\n' +
      '^XZ\n',

    // Placeholders left unfilled on purpose - loading this sample is meant to
    // demonstrate the "Variablen" tab (enter test values there, or import an
    // XML) rather than show a fully-populated label out of the box.
    variables:
      '^XA\n' +
      '^MMT\n' +
      '^PW812\n' +
      '^LL480\n' +
      '^LH0,0\n' +
      '^LS0\n' +
      '^PON\n' +
      '^CI0\n' +
      '^FO30,30^GB752,420,4,B,0^FS\n' +
      '^FO60,50^A0N,40,0^FDLieferschein^FS\n' +
      '^FO60,110^GB692,3,3,B,0^FS\n' +
      '^FO60,140^A0N,28,0^FDKunde: $KUNDE$^FS\n' +
      '^FO60,180^A0N,28,0^FDArtikel: $ARTIKEL$^FS\n' +
      '^FO60,220^A0N,28,0^FDMenge: $MENGE$ Stk.^FS\n' +
      '^FO60,260^A0N,28,0^FDDatum: $DATUM$^FS\n' +
      '^FO60,320^FB680,4,0,L,0^A0N,22,0^FDHinweis: Nicht ausgefuellte Platzhalter siehst du im Tab "Variablen" - trage dort Testwerte ein, um die Vorschau zu pruefen.^FS\n' +
      '^PQ1,0,1,Y\n' +
      '^XZ\n',

    barcodes:
      '^XA\n' +
      '^MMT\n' +
      '^PW700\n' +
      '^LL560\n' +
      '^LH0,0\n' +
      '^LS0\n' +
      '^PON\n' +
      '^CI0\n' +
      '^FO30,30^GB640,500,4,B,0^FS\n' +
      '^FO60,50^A0N,32,0^FDBarcode-Beispiele^FS\n' +
      '^BY2,2,60\n' +
      '^FO60,100^BCN,60,Y,N,N,N\n' +
      '^FD1234567890^FS\n' +
      '^BY2,2,60\n' +
      '^FO60,190^B3N,N,60,Y,N\n' +
      '^FD987654321^FS\n' +
      '^BY2,2,60\n' +
      '^FO60,280^BEN,60,Y,N\n' +
      '^FD400123456785^FS\n' +
      '^FO60,370^A0N,18,0^FDQR (echt codiert, scanbar)^FS\n' +
      '^FO60,398^BQN,2,4^FDQA,ZPLKIT-4711^FS\n' +
      '^FO300,370^A0N,18,0^FDData Matrix (nur Platzhalter)^FS\n' +
      '^FO300,398^BXN,6,200,0,0,1,_,1^FDDEMO^FS\n' +
      '^PQ1,0,1,Y\n' +
      '^XZ\n',
  };

  const SAMPLE_LABELS = {
    basic: 'Basis-Beispiel',
    variables: 'Variablen-Beispiel',
    barcodes: 'Barcode-Beispiel',
  };

  $('sampleSelect').addEventListener('change', function (e) {
    const key = e.target.value;
    e.target.value = ''; // reset to the placeholder so the same entry can be picked again later
    if (!key) return;
    if (state.label.elements.length && !confirm('Beispiel-Label laden? Nicht gespeicherte Änderungen am aktuellen Label gehen verloren.')) return;
    const label = window.ZPLParser.parseZPL(SAMPLES[key]);
    loadLabel(label, null, null);
    showToast(SAMPLE_LABELS[key] + ' geladen.');
  });

  $('btnOpenFile').addEventListener('click', function () { $('fileInput').click(); });
  $('fileInput').addEventListener('change', function (e) {
    const file = e.target.files[0];
    if (!file) return;
    const reader = new FileReader();
    reader.onload = function () {
      try {
        const note = openParsedDocument(reader.result, file.name, null, null);
        showToast('„' + file.name + '“ geladen (nur Download zum Speichern, kein Ordnerzugriff).' + note);
      } catch (err) {
        showToast('Konnte Datei nicht lesen: ' + err.message, true);
      }
    };
    reader.onerror = function () {
      showToast('Datei „' + file.name + '“ konnte nicht gelesen werden (' + (reader.error ? reader.error.message : 'unbekannter Fehler') + ').', true);
    };
    reader.readAsText(file);
    e.target.value = '';
  });

  $('btnDownload').addEventListener('click', function () {
    const text = documentText();
    const name = state.currentFileName || 'label.zpl';
    // A `.200zpl`/`.300zpl` name states the resolution its dot values are
    // for. After a DPI conversion that claim would be wrong, so the download
    // gets the matching extension instead of quietly contradicting itself.
    // Only the download is renamed - "Speichern" still writes back into the
    // file that was actually opened.
    const adjusted = DPI.renameForDpi(name, currentDpi());
    downloadBlob(new Blob([text], { type: 'text/plain' }), adjusted);
    markDocumentClean();
    if (adjusted !== name) showToast(t('dpi.download-renamed', { name: adjusted, dpi: currentDpi() }));
  });

  $('btnDownloadPrintZpl').addEventListener('click', function () {
    const text = documentText({ editorMetadata: false });
    const original = DPI.renameForDpi(state.currentFileName || 'label.zpl', currentDpi());
    const name = /\.[^.]+$/.test(original) ? original.replace(/(\.[^.]+)$/, '.print$1') : original + '.print.zpl';
    downloadBlob(new Blob([text], { type: 'text/plain' }), name);
    // This is a derived artifact, not the editable source file. Deliberately
    // keep the document's dirty state so a print export cannot masquerade as
    // saving layers, guides or hidden drafts.
    showToast(t('metadata.print-exported', { name: name }));
  });

  function downloadBlob(blob, filename) {
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = filename;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    setTimeout(function () { URL.revokeObjectURL(url); }, 4000);
  }

  function exportFileBaseName() {
    const name = state.currentFileName || state.currentServerFileName || 'label.zpl';
    return name.replace(/\.[^.]+$/, '') || 'label';
  }

  // Raster exports deliberately use a higher, bounded resolution than the
  // live canvas. The label's physical size still comes from its original ZPL
  // DPI; the extra pixels give ordinary office/no-name printers enough source
  // detail to keep 1D barcode edges crisp when they scale the image.
  const RASTER_TARGET_DPI = 600;
  const MAX_RASTER_PIXELS = 24 * 1024 * 1024;

  function labelDpi(label) {
    return (label && label.settings && label.settings.dpi) || 203;
  }

  function rasterInfoForLabel(label) {
    const widthDots = Math.max(1, Math.round(label.settings.widthDots));
    const heightDots = Math.max(1, Math.round(label.settings.heightDots));
    const dpi = labelDpi(label);
    const basePixels = widthDots * heightDots;
    if (basePixels > MAX_RASTER_PIXELS) {
      throw new Error(t('raster.too-large'));
    }
    let scale = Math.max(1, Math.ceil(RASTER_TARGET_DPI / dpi));
    while (scale > 1 && basePixels * scale * scale > MAX_RASTER_PIXELS) scale--;
    return {
      scale: scale,
      dpi: dpi * scale,
      labelDpi: dpi,
      pixelWidth: widthDots * scale,
      pixelHeight: heightDots * scale,
      widthMM: widthDots / dpi * 25.4,
      heightMM: heightDots / dpi * 25.4,
    };
  }

  // Renders at an integer multiple of the label's dot grid, independent of
  // the live editor's zoom. `info` carries the physical metadata required by
  // PDF and generic print backends so they never have to guess from a PNG's
  // browser-default 96-DPI metadata.
  function renderLabelToCanvas(label) {
    const info = rasterInfoForLabel(label);
    const canvas = document.createElement('canvas');
    canvas.width = info.pixelWidth;
    canvas.height = info.pixelHeight;
    const outputCtx = canvas.getContext('2d');
    outputCtx.imageSmoothingEnabled = false;
    renderLabelOffscreen(label, outputCtx, info.scale);
    return { canvas: canvas, info: info };
  }

  function rasterIssueText(issue) {
    return t('raster.reason.' + issue.code);
  }

  // A raster/PDF path must never silently replace an unimplemented barcode
  // with the editor's preview placeholder or omit a raw ZPL field. Warnings
  // remain opt-in because they depend on the actual scanner/printer pair.
  function allowRasterOutput(labels) {
    const all = Array.isArray(labels) ? labels : [labels];
    const blockers = [];
    const warnings = [];
    all.forEach(function (label) {
      const report = window.ZPLRender.inspectRasterOutput(label, {
        resolveText: applySampleData,
        dpi: labelDpi(label),
      });
      blockers.push.apply(blockers, report.blockers);
      warnings.push.apply(warnings, report.warnings);
    });
    const uniqueText = function (issues) {
      return Array.from(new Set(issues.map(rasterIssueText))).join(', ');
    };
    if (blockers.length) {
      showToast(t('raster.blocked', { reasons: uniqueText(blockers) }), true);
      return false;
    }
    if (warnings.length && !confirm(t('raster.warning', { reasons: uniqueText(warnings) }))) return false;
    return true;
  }

  function hasVisibleBarcode(label) {
    return !!(label && label.elements && label.elements.some(function (el) {
      return el && !el.hidden && el.type === 'barcode';
    }));
  }

  function bytesToBase64(bytes) {
    const chunkSize = 0x8000;
    let binary = '';
    for (let start = 0; start < bytes.length; start += chunkSize) {
      binary += String.fromCharCode.apply(null, bytes.subarray(start, Math.min(bytes.length, start + chunkSize)));
    }
    return btoa(binary);
  }

  function rasterPdfBytes(label, raster) {
    if (!window.PdfWriter || !window.PdfWriter.fromMonoPages || !window.ImageMono) {
      throw new Error('PDF-Export ist in dieser Version nicht verfügbar.');
    }
    const imageData = raster.canvas.getContext('2d').getImageData(0, 0, raster.canvas.width, raster.canvas.height);
    const mono = window.ImageMono.monochromize(imageData, { dither: 'none', threshold: 128 });
    const widthPt = label.settings.widthDots / raster.info.labelDpi * 72;
    const heightPt = label.settings.heightDots / raster.info.labelDpi * 72;
    return window.PdfWriter.fromMonoPages([{
      monoBytes: mono.bytes,
      widthPx: mono.widthPx,
      heightPx: mono.heightPx,
      widthPt: widthPt,
      heightPt: heightPt,
      textRuns: buildPdfTextRuns(label, raster.info.labelDpi, heightPt),
    }]);
  }

  function genericRasterDocument(label, raster) {
    const pdfBytes = rasterPdfBytes(label, raster);
    return {
      format: 'pdf',
      dataBase64: bytesToBase64(pdfBytes),
      dpi: raster.info.dpi,
      pixelWidth: raster.info.pixelWidth,
      pixelHeight: raster.info.pixelHeight,
      widthMm: raster.info.widthMM,
      heightMm: raster.info.heightMM,
    };
  }

  // PNG uses the browser's native, lossless canvas encoder. PDF uses the
  // hand-written 1-bit writer below; JPG/GIF stay available for image-only
  // labels but are deliberately blocked for barcode labels.
  // GIF/PDF have no native browser encoder, so they go through the two
  // hand-written codec modules (gif-writer.js, pdf-writer.js, same
  // "no dependencies" approach as every other codec in this project) -
  // guarded so a build that omits either module (see tools/bundle-lib.go)
  // degrades to an explanatory toast instead of a dead click.
  $('exportFormatSelect').addEventListener('change', function (e) {
    const format = e.target.value;
    e.target.value = ''; // reset to the placeholder so the same entry can be picked again later
    if (!format) return;
    const baseName = exportFileBaseName();
    if (!allowRasterOutput(state.label)) return;
    if ((format === 'jpg' || format === 'gif') && hasVisibleBarcode(state.label)) {
      showToast(t('raster.lossy-format'), true);
      return;
    }
    let raster;
    try {
      raster = renderLabelToCanvas(state.label);
    } catch (err) {
      showToast(err.message || String(err), true);
      return;
    }
    const canvas = raster.canvas;
    if (format === 'png') {
      canvas.toBlob(function (blob) { downloadBlob(blob, baseName + '.png'); }, 'image/png');
    } else if (format === 'jpg') {
      canvas.toBlob(function (blob) { downloadBlob(blob, baseName + '.jpg'); }, 'image/jpeg', 0.92);
    } else if (format === 'gif') {
      if (!window.GifWriter) { showToast('GIF-Export ist in dieser Version nicht verfügbar.', true); return; }
      const ctx = canvas.getContext('2d');
      const imageData = ctx.getImageData(0, 0, canvas.width, canvas.height);
      const bytes = window.GifWriter.encode(imageData);
      downloadBlob(new Blob([bytes], { type: 'image/gif' }), baseName + '.gif');
    } else if (format === 'pdf') {
      try {
        const pdfBytes = rasterPdfBytes(state.label, raster);
        downloadBlob(new Blob([pdfBytes], { type: 'application/pdf' }), baseName + '.pdf');
      } catch (err) {
        showToast(err.message || String(err), true);
      }
    }
  });

  // Browser-native raster printing is the universal fallback: it works with
  // ordinary office printers, label printers installed as OS devices, and
  // image/PDF import workflows used by small Bluetooth devices. It never
  // pretends to speak a proprietary printer protocol; the system print
  // dialog or the device's companion app remains responsible for transport.
  function printRasterLabel() {
    const label = state.label;
    if (!allowRasterOutput(label)) return;
    let raster;
    try {
      raster = renderLabelToCanvas(label);
    } catch (err) {
      showToast(err.message || String(err), true);
      return;
    }
    const canvas = raster.canvas;
    const dataUrl = canvas.toDataURL('image/png');
    const widthMM = raster.info.widthMM.toFixed(2);
    const heightMM = raster.info.heightMM.toFixed(2);
    const win = window.open('', '_blank');
    if (!win) { showToast(t('print.popup-blocked'), true); return; }
    win.document.write('<!doctype html><html><head><meta charset="utf-8"><title>ZPL-Studio – Druck</title>' +
      '<style>@page{size:' + widthMM + 'mm ' + heightMM + 'mm;margin:0}' +
      'html,body{margin:0;padding:0;background:#fff}' +
      '.label{width:' + widthMM + 'mm;height:' + heightMM + 'mm;display:block}' +
      '.label img{display:block;width:100%;height:100%;image-rendering:pixelated}' +
      '.note{font:12px sans-serif;color:#555;padding:12px}' +
      '@media print{.note{display:none}}</style></head><body>' +
      '<div class="label"><img src="' + dataUrl + '" alt=""></div>' +
      '<p class="note">ZPL-Studio: beim Drucken 100&nbsp;% bzw. „Tatsächliche Größe“ wählen.</p>' +
      '</body></html>');
    win.document.close();
    win.onload = function () { win.focus(); win.print(); };
    win.onafterprint = function () { win.close(); };
  }
  $('btnPrintRaster').addEventListener('click', printRasterLabel);

  // Builds the invisible PDF text layer (see pdf-writer.js) for every
  // visible text element - lets a PDF viewer search/select/copy the label's
  // text without changing how the exported page looks (the visible layer
  // stays the rasterized image, same trick OCR'd scanned-document PDFs use).
  //
  // Each ^A orientation (N/R/I/B, ZPL's 4 discrete 90°-step rotations) needs
  // its own PDF text matrix - derived once here rather than a general
  // sin/cos rotation, since these are the only 4 cases and PDF's Y-up text
  // space needs the opposite rotation sense from canvas's Y-down space:
  //   advanceDir: where the text-flow direction (local +X) points in PDF
  //               page space; upDir: where "glyph up" (local +Y) points.
  //   N (0°):   advance=(1,0)  up=(0,1)   - normal, left-to-right
  //   R (90°):  advance=(0,-1) up=(1,0)   - reads top-to-bottom
  //   I (180°): advance=(-1,0) up=(0,-1)  - upside down, right-to-left
  //   B (270°): advance=(0,1)  up=(-1,0)  - reads bottom-to-top
  // FO-anchored text (canvas draws with the glyph TOP at the translate
  // point) needs an extra shift of one approximate ascent in the "up"
  // direction to land near the baseline instead - FT is already baseline-
  // anchored, matching PDF's own text-matrix convention directly.
  const PDF_ORIENT_MATRIX = {
    N: { advance: [1, 0], up: [0, 1] },
    R: { advance: [0, -1], up: [1, 0] },
    I: { advance: [-1, 0], up: [0, -1] },
    B: { advance: [0, 1], up: [-1, 0] },
  };
  function buildPdfTextRuns(label, dpi, pageHeightPt) {
    const runs = [];
    const ptPerDot = 72 / dpi;
    (label.elements || []).forEach(function (el) {
      if (el.type !== 'text' || el.hidden) return;
      const text = applySampleData(el.text || '');
      if (!text) return;
      const heightDots = el.height || 30;
      const fontSizePt = heightDots * ptPerDot;
      const ascentPt = heightDots * 0.8 * ptPerDot;
      const m = PDF_ORIENT_MATRIX[el.orientation] || PDF_ORIENT_MATRIX.N;
      let xPt = el.x * ptPerDot;
      let yPt = pageHeightPt - el.y * ptPerDot;
      if (el.origin !== 'FT') {
        xPt -= ascentPt * m.up[0];
        yPt -= ascentPt * m.up[1];
      }
      runs.push({
        text: text,
        tm: [m.advance[0], m.advance[1], m.up[0], m.up[1], xPt, yPt],
        fontSize: fontSizePt,
        font: el.font === '0' ? 'Helvetica' : 'Courier',
      });
    });
    return runs;
  }

  // ---------------------------------------------------------------------
  // Optional print backend (see backend-client.js + README's
  // "Backend-Schnittstelle" section for the full contract). Entirely
  // absent unless BackendClient.probe() at boot finds a backend
  // advertising print.zebra, print.generic and/or labelserver.xml - see
  // Boot below.
  // ---------------------------------------------------------------------
  function labelForBackendPrint(label) {
    // The backend repeats the complete ZPL job for the chosen number of
    // copies. Normalise an imported ^PQ here so its own quantity/replicate
    // values cannot multiply the dialog's explicit copy count. This only
    // changes the disposable print clone, never the label being edited.
    const labelForPrint = cloneLabel(label);
    labelForPrint.settings = labelForPrint.settings || {};
    labelForPrint.settings.pq = '1,0,1,Y';
    return labelForPrint;
  }

  function zplForBackendPrint() {
    const labelForPrint = labelForBackendPrint(labelWithSampleData(state.label));
    return window.ZPLGenerator.generateZPL(labelForPrint, { keepPreamble: state.keepPreamble !== false });
  }

  function availableBackendClient() {
    const backend = window.BackendClient;
    if (!backend || typeof backend.hasCapability !== 'function') return null;
    return backend;
  }

  // Backend error codes are additive: older/third-party backends still send
  // their human-readable plain text, while the bundled Go server lets the UI
  // give physical-print failures a safe, localized explanation. In particular
  // an uncertain delivery must never sound like an invitation to resend.
  function describePrintError(err) {
    const code = err && err.code;
    if (code === 'printer_busy') return t('print.error.busy');
    if (code === 'printer_not_found') return t('print.error.printer-not-found');
    if (code === 'backend_disabled' || code === 'capability_unavailable') return t('print.error.backend-unavailable');
    if (code === 'delivery_failed') return t('print.error.delivery-failed');
    if (code === 'delivery_unknown' || code === 'delivery_timeout') return t('print.error.delivery-unknown');
    return err && err.message ? err.message : t('file.unknown-error');
  }

  function openPrintModal(printOptions) {
    printOptions = printOptions || {};
    const backend = availableBackendClient();
    if (!backend) {
      showToast(t('print.error.backend-unavailable'), true);
      return;
    }
    const isBatch = typeof printOptions.zpl === 'string';
    const hasZebra = backend.hasCapability('print.zebra');
    const hasGeneric = !isBatch && backend.hasCapability('print.generic');
    const hasLabelServer = backend.hasCapability('labelserver.xml');
    const hasPrinterList = backend.hasCapability('printers.list');

    // Target type is always its own explicit control, never ONLY inferred
    // from a picked printer's `type` - labelserver.xml in particular has no
    // per-printer "type" to infer from (the label server, not this app,
    // decides which physical printer a job ends up on), so it would have no
    // way to get selected if the printer dropdown were the only input.
    let html = '<p class="hint">' + (isBatch
      ? t('print.batch.hint', { count: printOptions.labelCount })
      : t('print.single.hint')) + t('print.pq.notice') + '</p>';
    html += '<div class="field-row"><label for="printTargetType">' + t('Ziel') + '</label><select id="printTargetType">' +
      (hasZebra ? '<option value="zebra">' + t('Zebra-Drucker (ZPL)') + '</option>' : '') +
      (hasGeneric ? '<option value="generic">' + t('Anderer Drucker (Rasterbild)') + '</option>' : '') +
      (hasLabelServer ? '<option value="labelserver">' + t('Etikettenserver (XML)') + '</option>' : '') +
      '</select></div>';
    html += '<div id="printPrinterField"><p class="hint">' + t('Drucker werden geladen…') + '</p></div>';
    html += '<div id="printDpiNotice"></div>';
    html += fieldPair(
      field(isBatch ? 'Durchläufe' : 'Anzahl', '<input type="number" id="printCopies" value="1" min="1" max="99">'),
      ''
    );
    html += '<div id="printStatus" class="hint" aria-live="polite"></div>';
    html += '<div class="btn-row"><button id="btnPrintConfirm">' + t('Drucken') + '</button></div>';
    openModal(isBatch ? 'Seriendruck drucken' : 'Drucken', html);

    const printerField = $('printPrinterField');
    const targetTypeSelect = $('printTargetType');
    const printConfirm = $('btnPrintConfirm');
    let requestInFlight = false;
    let printerListReady = !hasPrinterList;
    let requiresPrinterSelection = false;
    let loadedPrinters = [];
    let selectedPrinterId = null;

    function updatePrintConfirm() {
      const printerSelect = $('printPrinterSelect');
      const selectionMissing = hasPrinterList && (!printerListReady || !printerSelect || (requiresPrinterSelection && !printerSelect.value));
      printConfirm.disabled = requestInFlight || selectionMissing;
    }

    // A label's dot values only mean the intended physical size on the
    // printhead resolution they were laid out for - the same file prints at
    // two thirds the size on a 300 dpi head as on a 203 dpi one. When the
    // registry states a printer's dpi (optional `dpi` column, see
    // printing.go) this catches the mismatch BEFORE a batch goes out at the
    // wrong size, and offers the conversion right there.
    function updatePrintDpiNotice() {
      const notice = $('printDpiNotice');
      if (!notice) return;
      const printer = selectedPrinterId && loadedPrinters.find(function (p) { return p.id === selectedPrinterId; });
      const printerDpi = printer && printer.dpi;
      const labelDpiValue = currentDpi();
      if (!printerDpi || DPI.scaleFactor(labelDpiValue, printerDpi) === 1) { notice.innerHTML = ''; return; }
      notice.innerHTML = '<p class="hint print-dpi-warning">' +
        escapeHtml(t('dpi.printer-mismatch', { printer: printer.name || printer.id, printerDpi: printerDpi, labelDpi: labelDpiValue })) +
        '</p><div class="btn-row"><button id="btnPrintDpiConvert">' +
        escapeHtml(t('dpi.convert-to-printer', { dpi: printerDpi })) + '</button></div>';
      $('btnPrintDpiConvert').addEventListener('click', function () {
        // Replaces this dialog with the conversion dialog rather than
        // converting silently: the checkbox groups and the warning list are
        // exactly what someone needs to see before rescaling a label they
        // were about to print. Reopens this dialog afterward so the print
        // the user actually came for is still one click away.
        openDpiConvertModal(labelDpiValue, printerDpi, {
          onSettled: function () { openPrintModal(printOptions); },
        });
      });
    }

    function loadPrinterList() {
      printerListReady = false;
      requiresPrinterSelection = false;
      printerField.innerHTML = '<p class="hint">' + t('Drucker werden geladen…') + '</p>';
      updatePrintConfirm();
      Promise.resolve().then(function () { return backend.listPrinters(); }).then(function (printers) {
        if (!printers.length) {
          printerField.innerHTML = '<p class="hint">' + t('Keine Drucker vom Backend gemeldet.') + '</p>';
          updatePrintConfirm();
          return;
        }
        const defaultPrinter = printers.find(function (p) { return p.default; });
        requiresPrinterSelection = !defaultPrinter;
        loadedPrinters = printers;
        selectedPrinterId = defaultPrinter ? defaultPrinter.id : null;
        printerField.innerHTML = '<div class="field-row"><label for="printPrinterSearch">' + t('print.printer-search') + '</label>' +
          '<input type="search" id="printPrinterSearch" autocomplete="off" spellcheck="false"></div>' +
          '<div class="field-row"><label for="printPrinterSelect">' + t('Drucker') + '</label>' +
          '<select id="printPrinterSelect"></select><div id="printPrinterCount" class="hint"></div></div>';
        function renderPrinterChoices() {
          const search = ($('printPrinterSearch').value || '').trim().toLocaleLowerCase();
          const matching = loadedPrinters.filter(function (p) {
            return !search || (String(p.name || '').toLocaleLowerCase().indexOf(search) !== -1 ||
              String(p.id || '').toLocaleLowerCase().indexOf(search) !== -1 ||
              String(p.type || '').toLocaleLowerCase().indexOf(search) !== -1);
          });
          const visible = matching.slice();
          const selected = selectedPrinterId && loadedPrinters.find(function (p) { return p.id === selectedPrinterId; });
          if (selected && !visible.some(function (p) { return p.id === selected.id; })) visible.unshift(selected);
          const select = $('printPrinterSelect');
          select.innerHTML = '<option value=""' + (!selectedPrinterId ? ' selected' : '') + '>' +
            (requiresPrinterSelection ? t('(Drucker auswählen…)') : t('(Backend-Standard)')) + '</option>' +
            visible.map(function (p) {
              const isSelected = selectedPrinterId && p.id === selectedPrinterId ? ' selected' : '';
              return '<option value="' + escapeHtml(p.id) + '" data-type="' + escapeHtml(p.type || '') + '"' + isSelected + '>' + escapeHtml(p.name || p.id) + '</option>';
            }).join('');
          $('printPrinterCount').textContent = matching.length ? t('print.printer-count', { count: matching.length, total: loadedPrinters.length }) : t('print.no-printers-match');
          updatePrintConfirm();
          updatePrintDpiNotice();
        }
        $('printPrinterSearch').addEventListener('input', renderPrinterChoices);
        renderPrinterChoices();
        printerListReady = true;
        // Picking a printer with a known type is a convenience default for
        // the target-type select, not a hard constraint - e.g. a zebra
        // printer's job could still legitimately be routed through
        // labelserver.xml, so the user can still change it afterward.
        $('printPrinterSelect').addEventListener('change', function (e) {
          selectedPrinterId = e.target.value || null;
          const option = e.target.selectedOptions[0];
          const type = option ? option.getAttribute('data-type') : '';
          if (type && targetTypeSelect.querySelector('option[value="' + type + '"]')) targetTypeSelect.value = type;
          updatePrintConfirm();
          updatePrintDpiNotice();
        });
        updatePrintConfirm();
      }).catch(function (err) {
        printerField.innerHTML = '<p class="hint" style="color:#B3261E">' + t('Druckerliste konnte nicht geladen werden:') + ' ' + escapeHtml(err.message) + '</p>' +
          '<div class="btn-row"><button id="btnRetryPrinterList">' + t('Erneut versuchen') + '</button></div>';
        $('btnRetryPrinterList').addEventListener('click', loadPrinterList);
        updatePrintConfirm();
      });
    }

    if (hasPrinterList) {
      // A request without a printer can be valid when the server defines a
      // default. Do not submit while the list is still loading though; and
      // make an explicit choice mandatory when it declares no default.
      loadPrinterList();
    } else {
      printerField.innerHTML = '<div class="field-row"><label for="printPrinterId">' + t('Drucker-ID (optional)') + '</label>' +
        '<input type="text" id="printPrinterId" placeholder="' + t('Backend-Standarddrucker, falls leer') + '"></div>';
      updatePrintConfirm();
    }

    printConfirm.addEventListener('click', function () {
      if (requestInFlight) return;
      const copies = Number($('printCopies').value);
      const statusEl = $('printStatus');
      if (!Number.isInteger(copies) || copies < 1 || copies > 99) {
        statusEl.textContent = t('print.copies.invalid');
        statusEl.style.color = '#B3261E';
        return;
      }
      const printerSelect = $('printPrinterSelect');
      const printerIdInput = $('printPrinterId');
      const printerId = printerSelect ? (printerSelect.value || null) : (printerIdInput ? printerIdInput.value.trim() || null : null);
      const targetType = targetTypeSelect.value;

      if (targetType === 'generic' && !allowRasterOutput(state.label)) return;

      requestInFlight = true;
      updatePrintConfirm();
      printConfirm.setAttribute('aria-busy', 'true');
      statusEl.textContent = t('print.sending');
      statusEl.style.color = '';

      let job;
      try {
        if (targetType === 'generic') {
          // A physical-size, lossless 1-bit PDF avoids JPEG artefacts in
          // narrow barcode bars and gives a generic backend an unambiguous
          // page size. It still never needs to understand ZPL.
          job = new Promise(function (resolve, reject) {
            setTimeout(function () {
              try {
                const raster = renderLabelToCanvas(state.label);
                resolve(backend.printGeneric(genericRasterDocument(state.label, raster), { printerId: printerId, copies: copies }));
              } catch (err) {
                reject(err);
              }
            }, 0);
          });
        } else {
          const zpl = isBatch ? printOptions.zpl : zplForBackendPrint();
          job = targetType === 'labelserver'
            ? backend.printViaLabelServerXml(zpl, { printerId: printerId, copies: copies })
            : backend.printZebra(zpl, { printerId: printerId, copies: copies });
        }
      } catch (err) {
        job = Promise.reject(err);
      }

      Promise.resolve(job).then(function (result) {
        statusEl.textContent = t('print.sent', { job: result && result.jobId ? t('print.job', { jobId: result.jobId }) : '' });
        setTimeout(function () { $('modalOverlay').classList.add('hidden'); }, 1200);
      }).catch(function (err) {
        requestInFlight = false;
        printConfirm.removeAttribute('aria-busy');
        updatePrintConfirm();
        statusEl.textContent = t('print.failed', { error: describePrintError(err) });
        statusEl.style.color = '#B3261E';
      });
    });
  }

  $('btnSave').addEventListener('click', async function () {
    const text = documentText();
    // Server-opened file: PUT it back through the templates API. A failure
    // here (network blip, server briefly down) is likely transient, unlike
    // a broken local file handle below, so the save target is kept intact
    // for a retry instead of being dropped.
    if (state.currentServerFileName) {
      try {
        await writeServerTemplate(state.currentServerFileName, text);
        markDocumentClean();
        showToast('Gespeichert: ' + state.currentFileName);
      } catch (err) {
        showToast('Speichern fehlgeschlagen (' + err.message + '). Bitte über „Herunterladen“ sichern.', true);
      }
      return;
    }
    if (!state.currentFileHandle) return;
    let writable = null;
    try {
      writable = await state.currentFileHandle.createWritable();
      await writable.write(text);
      await writable.close();
      markDocumentClean();
      showToast('Gespeichert: ' + state.currentFileName);
    } catch (err) {
      if (writable) { try { await writable.abort(); } catch (e) { /* best effort */ } }
      // The handle may no longer be writable (permission revoked, file moved/
      // deleted externally) - drop it so the button disables rather than
      // repeating the identical silent failure on every click, and point the
      // user at the one path guaranteed to still work.
      state.currentFileHandle = null;
      $('btnSave').disabled = !hasSaveTarget();
      showToast('Speichern fehlgeschlagen (' + err.message + '). Bitte über „Herunterladen“ sichern und die Datei erneut öffnen.', true);
    }
  });

  // ---------------------------------------------------------------------
  // Template library: a local folder (when supported by the browser) OR a
  // server-side templates API (see templates.go), completely
  // optional, auto-detected once at boot (see probeServerTemplates below,
  // called from Boot at the end of this file). Any deployment without a
  // backend (plain static hosting, file://) simply never finds
  // one and behaves exactly as before: local folder or single-file upload.
  // ---------------------------------------------------------------------
  // The static Studio lives at /studio/ while the Go server registers /api/.
  // Keep the co-located variants for existing static/PHP installations.
  const SERVER_API_CANDIDATES = ['../api/templates', '../api/templates.php', 'api/templates', 'api/templates.php'];
  const LIBRARY_EXT_RE = /\.(zpl|200zpl|300zpl|txt|prn)$/i;
  const TEMPLATE_PROBE_TIMEOUT_MS = 2000;
  const TEMPLATE_GET_TIMEOUT_MS = 5000;

  const supportsFSAccess = 'showDirectoryPicker' in window;
  if (!supportsFSAccess) {
    $('btnOpenFolder').disabled = true;
    $('btnOpenFolder').title = t('library.folder-unsupported');
  }

  // Safe GETs must not leave optional server-mode detection or a library
  // refresh pending forever. PUT deliberately does not use this helper: a
  // timed-out write has an unknown outcome and must not be retried blindly.
  function fetchOptionalBackend(url, options, timeoutMs, timeoutMessage) {
    const controller = typeof AbortController === 'undefined' ? null : new AbortController();
    const requestOptions = controller ? Object.assign({}, options, { signal: controller.signal }) : options;
    return new Promise(function (resolve, reject) {
      let settled = false;
      const timer = setTimeout(function () {
        if (settled) return;
        settled = true;
        clearTimeout(timer);
        if (controller) controller.abort();
        reject(new Error(timeoutMessage));
      }, timeoutMs);
      function settle(fn, value) {
        if (settled) return;
        settled = true;
        clearTimeout(timer);
        fn(value);
      }
      try {
        Promise.resolve(fetch(url, requestOptions)).then(function (response) { settle(resolve, response); }, function (error) { settle(reject, error); });
      } catch (error) {
        settle(reject, error);
      }
    });
  }

  function readOptionalResponse(read, timeoutMs, timeoutMessage) {
    return new Promise(function (resolve, reject) {
      let settled = false;
      const timer = setTimeout(function () {
        if (settled) return;
        settled = true;
        reject(new Error(timeoutMessage));
      }, timeoutMs);
      function settle(fn, value) {
        if (settled) return;
        settled = true;
        clearTimeout(timer);
        fn(value);
      }
      try {
        Promise.resolve(read()).then(function (value) { settle(resolve, value); }, function (error) { settle(reject, error); });
      } catch (error) {
        settle(reject, error);
      }
    });
  }

  async function serverResponseError(res) {
    const body = await readOptionalResponse(function () { return res.text(); }, TEMPLATE_GET_TIMEOUT_MS, 'Serverantwort hat zu lange gedauert').catch(function () { return ''; });
    return new Error(body || ('Server antwortete mit ' + res.status));
  }

  async function probeTemplateRouteCandidates() {
    for (const base of SERVER_API_CANDIDATES) {
      try {
        const res = await fetchOptionalBackend(
          base,
          { cache: 'no-store', headers: { 'Accept': 'application/json' } },
          TEMPLATE_PROBE_TIMEOUT_MS,
          'Vorlagen-Backend hat zu lange für die Erkennung gebraucht'
        );
        if (!res.ok) continue;
        const data = await readOptionalResponse(function () { return res.json(); }, TEMPLATE_PROBE_TIMEOUT_MS, 'Vorlagen-Backend hat zu lange für die Erkennung gebraucht');
        if (data && Array.isArray(data.files)) return base;
      } catch (e) { /* this candidate isn't it (404, not JSON, network error, ...) - try the next one */ }
    }
    return null;
  }

  async function probeDiscoveryTemplateRoute(backend, backendProbe) {
    if (!backend || !backendProbe) return null;
    try {
      await backendProbe;
      if (backend.hasCapability('templates.list') && backend.hasCapability('templates.read') && typeof backend.endpoint === 'function') {
        return backend.endpoint('templates');
      }
    } catch (e) { /* optional discovery remains non-fatal */ }
    return null;
  }

  // Tries a discovery-advertised templates API and the historical clean/.php
  // routes concurrently. The first usable route wins; an absent discovery
  // endpoint must not delay a perfectly healthy legacy templates service.
  // Never throws: "no server backend" is a normal outcome and local folders/
  // files keep working unchanged.
  function probeServerTemplates(backendProbe) {
    const fallbackProbe = probeTemplateRouteCandidates();
    const backend = availableBackendClient();
    const discoveryProbe = probeDiscoveryTemplateRoute(backend, backendProbe);
    return new Promise(function (resolve) {
      let remaining = 2;
      let settled = false;
      function complete(base) {
        if (settled) return;
        if (base) {
          settled = true;
          state.serverApiBase = base;
          resolve(base);
          return;
        }
        remaining -= 1;
        if (remaining === 0) {
          settled = true;
          state.serverApiBase = null;
          resolve(null);
        }
      }
      fallbackProbe.then(complete, function () { complete(null); });
      discoveryProbe.then(complete, function () { complete(null); });
    });
  }

  async function listServerTemplates() {
    const res = await fetchOptionalBackend(
      state.serverApiBase,
      { cache: 'no-store', headers: { 'Accept': 'application/json' } },
      TEMPLATE_GET_TIMEOUT_MS,
      'Vorlagenliste konnte nicht innerhalb von 5 Sekunden geladen werden'
    );
    if (!res.ok) throw await serverResponseError(res);
    const data = await readOptionalResponse(function () { return res.json(); }, TEMPLATE_GET_TIMEOUT_MS, 'Vorlagenliste konnte nicht innerhalb von 5 Sekunden geladen werden');
    return data && Array.isArray(data.files) ? data.files.slice().sort(function (a, b) { return a.name.localeCompare(b.name); }) : [];
  }
  async function readServerTemplate(name) {
    const res = await fetchOptionalBackend(
      state.serverApiBase + '?name=' + encodeURIComponent(name),
      { cache: 'no-store', headers: { 'Accept': 'text/plain' } },
      TEMPLATE_GET_TIMEOUT_MS,
      'Vorlage konnte nicht innerhalb von 5 Sekunden geladen werden'
    );
    if (!res.ok) throw await serverResponseError(res);
    return readOptionalResponse(function () { return res.text(); }, TEMPLATE_GET_TIMEOUT_MS, 'Vorlage konnte nicht innerhalb von 5 Sekunden geladen werden');
  }
  async function writeServerTemplate(name, text) {
    const res = await fetch(state.serverApiBase + '?name=' + encodeURIComponent(name), { method: 'PUT', body: text });
    if (!res.ok) {
      const body = await res.text().catch(function () { return ''; });
      throw new Error(body || ('Server antwortete mit ' + res.status));
    }
  }

  // The one place that knows how to enumerate "whichever library is active
  // right now" - server or local folder - as a uniform {name, readText,
  // handle}[] list. Every call site that used to iterate state.dirHandle
  // directly (the library panel, the diff-picker's "aus Bibliothek" dropdown,
  // Seriendruck's per-row template column) goes through this instead, so
  // adding the server source only had to happen in one place. `handle` is
  // only present (and only meaningful) for local entries - loadLabel() uses
  // it to re-enable createWritable()-based saving.
  async function currentLibraryEntries() {
    if (state.librarySource === 'server' && state.serverApiBase) {
      let files;
      try {
        files = await listServerTemplates();
      } catch (err) {
        // A previously detected server can disappear while the editor stays
        // open. If the user already chose a local folder, switch back to it
        // for safe read operations instead of leaving the library stuck on a
        // dead optional service. Never apply this rule to PUT/save: a write
        // has an unknown outcome and is handled explicitly at its call site.
        if (state.dirHandle) {
          state.librarySource = 'local';
          state.serverApiBase = null;
          state.currentServerFileName = null;
          $('btnSave').disabled = !hasSaveTarget();
          return currentLibraryEntries();
        }
        throw err;
      }
      return files.map(function (f) {
        return { name: f.name, handle: null, readText: function () { return readServerTemplate(f.name); } };
      });
    }
    if (state.dirHandle) {
      const raw = [];
      for await (const [name, h] of state.dirHandle.entries()) {
        if (h.kind === 'file' && LIBRARY_EXT_RE.test(name)) raw.push({ name: name, handle: h });
      }
      raw.sort(function (a, b) { return a.name.localeCompare(b.name); });
      return raw.map(function (entry) {
        return {
          name: entry.name, handle: entry.handle,
          readText: async function () { const file = await entry.handle.getFile(); return file.text(); },
        };
      });
    }
    return [];
  }

  $('btnOpenFolder').addEventListener('click', async function () {
    try {
      const handle = await window.showDirectoryPicker();
      state.dirHandle = handle;
      state.librarySource = 'local'; // explicit user choice overrides an auto-detected server library for the rest of the session
      $('libraryDetails').open = true; // just picked a folder - show the resulting list even if the panel was collapsed
      await refreshLibraryList();
    } catch (err) {
      if (err && err.name !== 'AbortError') showToast('Ordner konnte nicht geöffnet werden: ' + err.message, true);
    }
  });

  async function refreshLibraryList() {
    const list = $('libraryList');
    list.innerHTML = '';
    if (!hasActiveLibrary()) { $('libraryStatus').textContent = t('Kein Ordner geöffnet'); return; }
    let entries;
    try {
      entries = await currentLibraryEntries();
    } catch (err) {
      $('libraryStatus').textContent = t('library.load-failed', { error: err.message });
      return;
    }
    $('libraryStatus').textContent = state.librarySource === 'server'
      ? t('library.server-templates', { count: entries.length })
      : t('library.folder', { name: state.dirHandle.name });
    entries.forEach(function (entry) {
      const li = document.createElement('li');
      li.textContent = entry.name;
      li.tabIndex = 0;
      li.setAttribute('role', 'button');
      if (entry.name === state.currentFileName) li.classList.add('active');
      async function openEntry() {
        try {
          const text = await entry.readText();
          const note = openParsedDocument(text, entry.name, entry.handle,
            state.librarySource === 'server' ? entry.name : null);
          if (note.trim()) showToast(note.trim());
          await refreshLibraryList();
        } catch (err) {
          showToast('Konnte „' + entry.name + '“ nicht laden: ' + err.message, true);
        }
      }
      li.addEventListener('click', openEntry);
      // css/style.css already styles `.library-list li:focus-visible` - this
      // is what actually makes that focus reachable/actionable via keyboard,
      // matching the existing style's intent.
      li.addEventListener('keydown', function (e) {
        if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); openEntry(); }
      });
      list.appendChild(li);
    });
    if (!entries.length) {
      const li = document.createElement('li');
      li.textContent = t('library.no-files');
      li.style.cursor = 'default';
      list.appendChild(li);
    }
    // Seriendruck's "Vorlage pro Zeile aus Spalte" mode resolves template file
    // names against this same library - keep it in sync whenever the library
    // is (re)opened/refreshed, not just when the user happens to revisit
    // that tab.
    if (state.mergeTemplateMode === 'column') {
      loadMergeTemplatesFromDir().then(function () {
        updateMergeTemplatesStatus();
        renderMergePreview();
      });
    }
  }

  // ---------------------------------------------------------------------
  // Label diff/compare: current label vs. a second label (from the open
  // library folder or an uploaded file) - visual overlay + structured
  // per-element changes + a raw ZPL line diff for anyone who wants to
  // confirm exact command-level changes.
  // ---------------------------------------------------------------------
  function renderOverlayCanvas(labelA, labelB) {
    const scale = Math.min(500 / Math.max(labelA.settings.widthDots, labelB.settings.widthDots, 1), 1.5);
    const w = Math.max(1, Math.round(Math.max(labelA.settings.widthDots, labelB.settings.widthDots) * scale));
    const h = Math.max(1, Math.round(Math.max(labelA.settings.heightDots, labelB.settings.heightDots) * scale));
    const ca = document.createElement('canvas'); ca.width = w; ca.height = h;
    const cb = document.createElement('canvas'); cb.width = w; cb.height = h;
    const actxA = ca.getContext('2d'); actxA.fillStyle = '#fff'; actxA.fillRect(0, 0, w, h);
    const actxB = cb.getContext('2d'); actxB.fillStyle = '#fff'; actxB.fillRect(0, 0, w, h);
    renderLabelOffscreen(labelA, actxA, scale);
    renderLabelOffscreen(labelB, actxB, scale);
    const da = actxA.getImageData(0, 0, w, h).data;
    const db = actxB.getImageData(0, 0, w, h).data;
    const out = document.createElement('canvas'); out.width = w; out.height = h;
    const octx = out.getContext('2d');
    const outData = octx.createImageData(w, h);
    for (let i = 0; i < da.length; i += 4) {
      const inkA = da[i] < 200, inkB = db[i] < 200;
      let r, g, b;
      if (inkA && inkB) { r = 40; g = 40; b = 40; }       // unchanged ink
      else if (inkA) { r = 211; g = 47; b = 47; }         // only in A (entfernt/alt)
      else if (inkB) { r = 25; g = 118; b = 99; }         // only in B (neu/hinzugefügt)
      else { r = 255; g = 255; b = 255; }                 // neither
      outData.data[i] = r; outData.data[i + 1] = g; outData.data[i + 2] = b; outData.data[i + 3] = 255;
    }
    octx.putImageData(outData, 0, 0);
    return out;
  }

  function renderDiffResult(labelA, nameA, labelB, nameB) {
    const result = window.ZPLDiff.compareLabels(labelA, labelB);
    const overlay = renderOverlayCanvas(labelA, labelB);
    const container = $('diffResult');
    container.innerHTML = '';

    const legend = document.createElement('div');
    legend.className = 'diff-legend';
    legend.innerHTML =
      '<span><i style="background:#282828"></i> Unverändert</span>' +
      '<span><i style="background:#d32f2f"></i> Nur in „' + escapeHtml(nameA) + '“ (entfernt)</span>' +
      '<span><i style="background:#197663"></i> Nur in „' + escapeHtml(nameB) + '“ (neu)</span>';
    container.appendChild(legend);

    const canvasWrap = document.createElement('div');
    canvasWrap.className = 'diff-canvas-wrap';
    canvasWrap.appendChild(overlay);
    container.appendChild(canvasWrap);

    const summary = document.createElement('p');
    summary.className = 'hint';
    summary.textContent = result.unchangedCount + ' unverändert, ' + result.changed.length + ' geändert, ' +
      result.removed.length + ' nur in „' + nameA + '“, ' + result.added.length + ' nur in „' + nameB + '“.';
    container.appendChild(summary);

    const list = document.createElement('div');
    list.className = 'diff-changelist';
    function row(kind, label, changesHtml) {
      const div = document.createElement('div');
      div.className = 'diff-change-row';
      div.innerHTML = '<span class="kind ' + kind + '">' + kind + '</span>' + escapeHtml(label) + (changesHtml || '');
      return div;
    }
    result.changed.forEach(function (c) {
      const items = c.changes.map(function (ch) {
        return '<li>' + escapeHtml(ch.field) + ': ' + escapeHtml(ch.from) + ' &rarr; ' + escapeHtml(ch.to) + '</li>';
      }).join('');
      list.appendChild(row('changed', window.ZPLDiff.describeElement(c.b), '<ul>' + items + '</ul>'));
    });
    result.removed.forEach(function (el) { list.appendChild(row('removed', window.ZPLDiff.describeElement(el) + ' @ (' + el.x + ',' + el.y + ')')); });
    result.added.forEach(function (el) { list.appendChild(row('added', window.ZPLDiff.describeElement(el) + ' @ (' + el.x + ',' + el.y + ')')); });
    if (!result.changed.length && !result.removed.length && !result.added.length) {
      list.innerHTML = '<p class="hint">Keine Unterschiede in Position oder Eigenschaften gefunden.</p>';
    }
    container.appendChild(list);

    const advToggle = document.createElement('button');
    advToggle.textContent = 'Rohtext-Diff anzeigen';
    advToggle.style.marginTop = '10px';
    const textDiffDiv = document.createElement('div');
    textDiffDiv.className = 'diff-textdiff';
    textDiffDiv.style.display = 'none';
    advToggle.addEventListener('click', function () {
      const showing = textDiffDiv.style.display !== 'none';
      textDiffDiv.style.display = showing ? 'none' : 'block';
      advToggle.textContent = showing ? 'Rohtext-Diff anzeigen' : 'Rohtext-Diff verbergen';
      if (!showing && !textDiffDiv.dataset.built) {
        textDiffDiv.dataset.built = '1';
        const zplA = window.ZPLGenerator.generateZPL(labelA, { keepPreamble: false });
        const zplB = window.ZPLGenerator.generateZPL(labelB, { keepPreamble: false });
        const lines = window.ZPLDiff.diffLines(zplA, zplB);
        textDiffDiv.innerHTML = lines.map(function (l) {
          if (l.type === 'same') return escapeHtml(l.line);
          return '<span class="' + l.type + '">' + (l.type === 'del' ? '- ' : '+ ') + escapeHtml(l.line) + '</span>';
        }).join('\n');
      }
    });
    container.appendChild(advToggle);
    container.appendChild(textDiffDiv);
  }

  function buildComparePickerHtml() {
    return '<div class="diff-picker">' +
      '<div class="field-row"><label for="diffPickSelect">Aus Bibliothek</label><select id="diffPickSelect"><option value="">Lädt…</option></select></div>' +
      '<div class="field-row"><label for="diffPickFile">…oder Datei hochladen</label><input type="file" id="diffPickFile" accept=".zpl,.200zpl,.300zpl,.txt,.prn"></div>' +
      '</div>' +
      '<div class="btn-row"><button id="btnDiffRun" disabled>Vergleichen</button></div>' +
      '<div id="diffResult"></div>';
  }

  async function wireComparePicker() {
    let labelB = null, nameB = null;
    const sel = $('diffPickSelect');
    const fileInput = $('diffPickFile');
    const runBtn = $('btnDiffRun');
    let entries = [];
    try {
      entries = (await currentLibraryEntries()).filter(function (e) { return e.name !== state.currentFileName; });
    } catch (e) { /* leave entries empty - the file-upload fallback below still works */ }
    sel.innerHTML = '<option value="">- Datei wählen -</option>' + entries.map(function (e, i) {
      return '<option value="' + i + '">' + escapeHtml(e.name) + '</option>';
    }).join('');
    if (!entries.length) sel.innerHTML += '<option value="" disabled>(keine Bibliothek geöffnet oder keine weiteren Dateien)</option>';
    sel.addEventListener('change', async function () {
      if (sel.value === '') return;
      const entry = entries[parseInt(sel.value, 10)];
      try {
        const text = await entry.readText();
        labelB = window.ZPLParser.parseZPL(text);
        nameB = entry.name;
        fileInput.value = '';
        runBtn.disabled = false;
      } catch (e) {
        showToast('Konnte „' + entry.name + '“ nicht laden: ' + e.message, true);
      }
    });
    fileInput.addEventListener('change', function () {
      const file = fileInput.files[0];
      if (!file) return;
      const reader = new FileReader();
      reader.onload = function () {
        labelB = window.ZPLParser.parseZPL(String(reader.result));
        nameB = file.name;
        sel.value = '';
        runBtn.disabled = false;
      };
      reader.readAsText(file);
    });
    runBtn.addEventListener('click', function () {
      if (!labelB) return;
      renderDiffResult(state.label, state.currentFileName || 'Aktuelles Label', labelB, nameB);
    });
  }

  $('btnCompareLabels').addEventListener('click', function () {
    openModal('Label vergleichen', buildComparePickerHtml());
    wireComparePicker();
  });

  // ---------------------------------------------------------------------
  // Labelary (opt-in, explicit) — sends the current ZPL text to the public
  // labelary.com API to render a pixel-accurate PNG. Never called automatically.
  // ---------------------------------------------------------------------
  $('btnLabelary').addEventListener('click', async function () {
    const proceed = confirm('Dies sendet den aktuellen ZPL-Code an den öffentlichen Dienst labelary.com, um eine exakte Druckvorschau zu erzeugen. Fortfahren?');
    if (!proceed) return;

    openModal('Exakte Vorschau (labelary.com)', '<p class="loading">Wird geladen…</p>');
    const s = state.label.settings;
    // Labelary addresses printers by whole dots/mm, and its label size is in
    // inches - both derived through ZPLDpi so "203 dpi" resolves to the
    // printhead's exact 8 dots/mm instead of a rounded ratio (a 3.996" label
    // asked for as 4.00" comes back cropped by a few dots).
    const dpmm = DPI.labelaryDpmm(s.dpi);
    const widthIn = DPI.dotsToInch(s.widthDots, s.dpi).toFixed(2);
    const heightIn = DPI.dotsToInch(s.heightDots, s.dpi).toFixed(2);
    const url = 'https://api.labelary.com/v1/printers/' + dpmm + 'dpmm/labels/' + widthIn + 'x' + heightIn + '/0/';
    // Mirror the on-canvas preview using a temporary model. Generating after
    // substitution keeps values safely inside their ZPL data fields.
    const zpl = window.ZPLGenerator.generateZPL(labelWithSampleData(state.label), { keepPreamble: state.keepPreamble !== false });
    if (state.sampleDataMode) $('modalTitle').textContent = 'Exakte Vorschau (labelary.com) – mit Beispieldaten';
    try {
      const resp = await fetch(url, { method: 'POST', headers: { 'Accept': 'image/png', 'Content-Type': 'application/x-www-form-urlencoded' }, body: zpl });
      if (!resp.ok) throw new Error('HTTP ' + resp.status);
      const blob = await resp.blob();
      const imgUrl = URL.createObjectURL(blob);
      $('modalBody').innerHTML = '<img src="' + imgUrl + '" alt="Labelary-Vorschau">';
    } catch (err) {
      $('modalBody').innerHTML = '<p class="error">Vorschau fehlgeschlagen (' + escapeHtml(err.message) +
        '). Prüfe die Internetverbindung, oder öffne <strong>labelary.com/viewer.html</strong> manuell und füge den ZPL-Code aus dem Tab „ZPL-Code“ ein.</p>';
    }
  });

  // Runs when the CURRENT modal is dismissed by the ×, the backdrop or
  // Escape rather than by one of its own buttons. A dialog that had to change
  // a control in order to open (the DPI select in the label settings) needs
  // to put that control back on every exit path, not just its own
  // "Abbrechen" - otherwise the select keeps claiming a resolution the label
  // never got. Always (re-)set by openModal, so a handler can never leak
  // into the next dialog.
  let modalDismissHandler = null;

  function openModal(title, bodyHtml, onDismiss) {
    $('modalTitle').textContent = t(title);
    $('modalBody').innerHTML = bodyHtml;
    translateFragment($('modalBody'));
    modalDismissHandler = onDismiss || null;
    $('modalOverlay').classList.remove('hidden');
  }
  // dismissed: true for the ×/backdrop/Escape paths, false when one of the
  // modal's own buttons closes it (that button already did whatever the
  // dismiss handler would have done).
  function closeModal(dismissed) {
    $('modalOverlay').classList.add('hidden');
    const handler = modalDismissHandler;
    modalDismissHandler = null;
    if (dismissed && handler) handler();
  }
  $('modalClose').addEventListener('click', function () { closeModal(true); });
  $('modalOverlay').addEventListener('click', function (e) { if (e.target === $('modalOverlay')) closeModal(true); });

  function guideText(values) {
    return values.map(function (dots) {
      return state.unit === 'mm' ? (dotsToMm(dots).toFixed(2).replace(/\.00$/, '')) : String(Math.round(dots));
    }).join('\n');
  }
  function parseGuideText(text, maxDots) {
    const values = String(text || '').split(/[\n;]+/).map(function (line) {
      const n = parseFloat(line.trim().replace(',', '.'));
      if (!isFinite(n)) return null;
      const dots = state.unit === 'mm' ? DPI.mmToDots(n, currentDpi()) : n;
      return Math.round(clamp(dots, 0, maxDots));
    }).filter(function (value) { return value != null; });
    return Array.from(new Set(values)).sort(function (a, b) { return a - b; });
  }
  $('btnGuides').addEventListener('click', function () {
    const guides = labelGuides(state.label);
    const unitLabel = state.unit === 'mm' ? 'mm' : 'Dots';
    const body = '<div class="guides-dialog">' +
      '<p class="hint">Eine Position pro Zeile. Beim Verschieben rasten Kanten und Mittelpunkte an sichtbaren Hilfslinien ein.</p>' +
      '<div class="field-row-inline">' +
        field('Vertikal · X (' + unitLabel + ')', '<textarea id="guideVertical" rows="7" spellcheck="false">' + escapeHtml(guideText(guides.vertical)) + '</textarea>') +
        field('Horizontal · Y (' + unitLabel + ')', '<textarea id="guideHorizontal" rows="7" spellcheck="false">' + escapeHtml(guideText(guides.horizontal)) + '</textarea>') +
      '</div>' +
      '<div class="field-row field-check"><input type="checkbox" id="guideVisible"' + (guides.visible ? ' checked' : '') + '><label for="guideVisible">Hilfslinien anzeigen</label></div>' +
      '<div class="field-row field-check"><input type="checkbox" id="guideSnap"' + (guides.snap ? ' checked' : '') + '><label for="guideSnap">An Hilfslinien einrasten</label></div>' +
      '<div class="btn-row"><button id="btnGuideClear">Alle entfernen</button><button id="btnGuideApply" class="primary">Übernehmen</button></div>' +
      '</div>';
    openModal('Hilfslinien', body);
    $('btnGuideApply').addEventListener('click', function () {
      guides.vertical = parseGuideText($('guideVertical').value, state.label.settings.widthDots);
      guides.horizontal = parseGuideText($('guideHorizontal').value, state.label.settings.heightDots);
      guides.visible = $('guideVisible').checked;
      guides.snap = $('guideSnap').checked;
      closeModal(false);
      renderAll();
      pushHistory();
    });
    $('btnGuideClear').addEventListener('click', function () {
      guides.vertical = [];
      guides.horizontal = [];
      closeModal(false);
      renderAll();
      pushHistory();
    });
  });

  function preflightReport(label) {
    const issues = [];
    const s = label.settings;
    const visible = label.elements.filter(function (el) { return el && !el.hidden; });
    if (!visible.length) issues.push({ severity: 'warning', message: 'Das Label enthält keine sichtbaren Elemente.' });
    visible.forEach(function (el) {
      if (el.type === 'raw') {
        issues.push({ severity: 'error', id: el.id, message: 'Nicht zugeordneter ZPL-Code kann in Rasterausgaben fehlen.' });
        return;
      }
      let bounds;
      try { bounds = getAABB(el); } catch (e) {
        issues.push({ severity: 'error', id: el.id, message: 'Element kann nicht zuverlässig dargestellt werden: ' + e.message });
        return;
      }
      if (bounds.x < 0 || bounds.y < 0 || bounds.x + bounds.w > s.widthDots || bounds.y + bounds.h > s.heightDots) {
        issues.push({ severity: 'warning', id: el.id, message: 'Element liegt ganz oder teilweise außerhalb des Etiketts.' });
      }
      if (el.type === 'barcode') {
        const one = Object.assign({}, label, { elements: [el], rawTail: [] });
        const raster = window.ZPLRender.inspectRasterOutput(one, { resolveText: applySampleData, dpi: labelDpi(label) });
        raster.blockers.forEach(function (issue) {
          issues.push({ severity: 'error', id: el.id, message: rasterIssueText(issue) });
        });
        raster.warnings.forEach(function (issue) {
          issues.push({ severity: 'warning', id: el.id, message: rasterIssueText(issue) });
        });
      }
    });
    const tailRaster = window.ZPLRender.inspectRasterOutput(Object.assign({}, label, { elements: [] }), {
      resolveText: applySampleData,
      dpi: labelDpi(label),
    });
    tailRaster.blockers.forEach(function (issue) {
      issues.push({ severity: 'error', message: rasterIssueText(issue) });
    });
    const variables = findVariablesIn(label);
    if (variables.length) {
      issues.push({ severity: 'info', message: variables.length + ' Platzhalter bleiben für Seriendruck oder spätere Ersetzung erhalten: ' + variables.map(function (name) { return '$' + name + '$'; }).join(', ') });
    }
    const hiddenCount = label.elements.filter(function (el) { return el && el.hidden; }).length;
    if (hiddenCount) issues.push({ severity: 'info', message: hiddenCount + ' ausgeblendete Element(e) werden nicht gedruckt, bleiben aber in der bearbeitbaren ZPL-Datei erhalten.' });
    if (label.editorMetadataStatus && label.editorMetadataStatus.state === 'invalid') {
      issues.push({ severity: 'warning', message: 'Editor-Metadaten waren unvollständig oder beschädigt. Das druckbare ZPL wurde geladen; Ebeneninformationen konnten nicht wiederhergestellt werden.' });
    }
    return issues;
  }

  $('btnPreflight').addEventListener('click', function () {
    const issues = preflightReport(state.label);
    const errors = issues.filter(function (issue) { return issue.severity === 'error'; }).length;
    const warnings = issues.filter(function (issue) { return issue.severity === 'warning'; }).length;
    const summaryClass = errors ? ' error' : (warnings ? ' warning' : ' ok');
    const summaryText = errors
      ? errors + ' Fehler und ' + warnings + ' Warnung(en) gefunden.'
      : (warnings ? warnings + ' Warnung(en) gefunden.' : 'Keine druckrelevanten Probleme gefunden.');
    const rows = issues.map(function (issue) {
      const el = issue.id ? elementById(issue.id) : null;
      return '<li class="preflight-item preflight-' + issue.severity + '">' +
        '<span class="preflight-level">' + (issue.severity === 'error' ? 'Fehler' : (issue.severity === 'warning' ? 'Warnung' : 'Info')) + '</span>' +
        '<span class="preflight-message">' + escapeHtml(issue.message) + (el ? '<small>' + escapeHtml(layerLabel(el)) + '</small>' : '') + '</span>' +
        (el ? '<button type="button" data-preflight-id="' + el.id + '">Auswählen</button>' : '') +
        '</li>';
    }).join('');
    openModal('Preflight', '<div class="preflight-summary' + summaryClass + '">' + escapeHtml(summaryText) + '</div>' +
      (rows ? '<ul class="preflight-list">' + rows + '</ul>' : '<p class="preflight-empty">Das Label ist für die unterstützten Ausgaben bereit.</p>'));
    $('btnPreflight').classList.toggle('has-warning', !!(errors || warnings));
    $('modalBody').querySelectorAll('[data-preflight-id]').forEach(function (button) {
      button.addEventListener('click', function () {
        const el = elementById(button.getAttribute('data-preflight-id'));
        if (!el) return;
        state.selectedIds = groupMemberIds(el);
        closeModal(false);
        const propsTab = document.querySelector('.tab-btn[data-tab="props"]');
        if (propsTab) propsTab.click();
        renderAll();
      });
    });
  });

  $('btnShortcuts').addEventListener('click', function () {
    const rows = [
      ['Strg/Cmd + Z', 'Rückgängig'],
      ['Strg/Cmd + Y oder Strg/Cmd + Umschalt + Z', 'Wiederholen'],
      ['Strg/Cmd + D', 'Ausgewählte Elemente duplizieren'],
      ['Strg/Cmd + C / X / V', 'Elemente kopieren, ausschneiden und einfügen'],
      ['Strg/Cmd + A', 'Alle Elemente auswählen'],
      ['Entf / Rücktaste', 'Ausgewählte Elemente löschen'],
      ['Pfeiltasten', 'Ausgewählte Elemente um 1 Dot verschieben (mit Umschalt: 10 Dots)'],
      ['Escape', 'Auswahl aufheben, oder ein geöffnetes Dialogfenster schließen'],
      ['Strg/Cmd + Klick', 'Element zur Auswahl hinzufügen/entfernen'],
      ['Rechtsklick auf ein Element', 'Kontextmenü (Duplizieren, Vorder-/Hintergrund, Löschen, ...)'],
      ['Rechteck auf leerer Fläche ziehen', 'Mehrere Elemente per Rahmen auswählen'],
      ['Umschalt + Ziehen', 'Bewegung auf eine Achse sperren (nur X oder nur Y)'],
      ['Klick auf den Griff über einem Text-/Barcode-Element', 'Element in 90°-Schritten drehen'],
    ];
    const body = '<table style="width:100%;border-collapse:collapse;font-size:13px">' +
      rows.map(function (r) {
        return '<tr><td style="padding:5px 10px 5px 0;white-space:nowrap;font-family:Consolas,monospace;border-bottom:1px solid var(--ui-border)">' +
          escapeHtml(r[0]) + '</td><td style="padding:5px 0;border-bottom:1px solid var(--ui-border)">' + escapeHtml(r[1]) + '</td></tr>';
      }).join('') + '</table>';
    openModal('Tastaturkürzel', body);
  });

  // ---------------------------------------------------------------------
  // Toast
  // ---------------------------------------------------------------------
  let toastTimer = null;
  function showToast(msg, isError) {
    const t = $('toast');
    t.textContent = window.ZPLStudioI18n ? window.ZPLStudioI18n.t(msg) : msg;
    t.className = 'toast' + (isError ? ' error' : '');
    clearTimeout(toastTimer);
    toastTimer = setTimeout(function () { t.classList.add('hidden'); }, isError ? 6000 : 3000);
  }

  // ---------------------------------------------------------------------
  // Mail-Merge / Seriendruck: one label per CSV/XLSX row.
  //
  // Reuses the existing $NAME$ placeholder syntax (see "Placeholder handling"
  // above) but, unlike applySampleData() (preview-only, one static value
  // set), actually bakes real per-row values into a *cloned* label model
  // before handing it to ZPLGenerator/renderLabelOffscreen - state.label
  // itself (the template being edited) is never touched.
  // ---------------------------------------------------------------------

  // $NAME$ placeholders commonly use ALL-CAPS field names, but
  // spreadsheet column headers are human-written ("Lagerplatz", not
  // "LAGERPLATZ") - matching row keys case-sensitively would silently fail
  // to substitute almost every real-world column, so placeholder/header
  // matching is case-insensitive everywhere in this section (both here and
  // in renderMergePreview's coverage check below).
  function lookupRowValue(row, name) {
    if (row[name] !== undefined) return row[name]; // fast path: exact match
    const lower = name.toLowerCase();
    for (const key in row) {
      if (key.toLowerCase() === lower) return row[key];
    }
    return undefined;
  }

  // The export-time counterpart of applySampleData(): same $NAME$ syntax,
  // but applied to a cloned model for real (not just the on-screen preview),
  // and driven by one CSV/XLSX row instead of a single static value set. An
  // unmatched placeholder is left intact rather than blanked - a missing
  // column is far more likely to be a mapping mistake worth noticing in the
  // output than data the user actually wants blank.
  function applyRowToLabel(templateLabel, row) {
    const cloned = cloneLabel(templateLabel);
    function substitute(str) {
      if (!str) return str;
      return str.replace(/\$([A-Za-z0-9_]+)\$/g, function (whole, name) {
        const v = lookupRowValue(row, name);
        return (v !== undefined && v !== '') ? v : whole;
      });
    }
    cloned.elements.forEach(function (el) {
      if (el.type === 'text') el.text = substitute(el.text);
      else if (el.type === 'barcode') el.data = substitute(el.data);
    });
    return cloned;
  }

  function mergeActiveSheet() {
    return state.mergeData ? state.mergeData.sheets[state.mergeData.activeSheet] : null;
  }
  function mergeActiveRows() {
    const sheet = mergeActiveSheet();
    return sheet ? sheet.rows : [];
  }
  function mergeActiveHeaders() {
    const sheet = mergeActiveSheet();
    return sheet ? sheet.headers : [];
  }

  // Which template a given row should use - state.label itself in "single"
  // mode, or a file resolved via mergeTemplates (loaded from the open folder
  // or manually uploaded) in "column" mode. Returns null when a row can't be
  // resolved (column mode with a blank cell, or a referenced file that was
  // never loaded) so the caller can count/report it as skipped instead of
  // guessing a fallback.
  function resolveTemplateForRow(row) {
    if (state.mergeTemplateMode !== 'column') return state.label;
    if (!state.mergeTemplateColumn) return null;
    const fileName = (row[state.mergeTemplateColumn] || '').trim();
    if (!fileName) return null;
    let entry = state.mergeTemplates[fileName];
    if (!entry) {
      // Same case-insensitive fallback lookupRowValue() already applies to
      // CSV/XLSX column headers - a spreadsheet cell and the actual file on
      // disk disagreeing only in case (common on case-insensitive file
      // systems) shouldn't silently count as "no template".
      const lower = fileName.toLowerCase();
      for (const key in state.mergeTemplates) {
        if (key.toLowerCase() === lower) { entry = state.mergeTemplates[key]; break; }
      }
    }
    return entry ? entry.label : null;
  }

  // Every row's finished, placeholder-filled label model - the shared input
  // to both the ZPL batch export/print and the A4-sheet print path below.
  // Rows that resolveTemplateForRow() can't match to a template are silently
  // dropped here (already surfaced as a "skipped" count in the preview).
  function buildMergedLabels() {
    return mergeActiveRows().reduce(function (acc, row) {
      const tpl = resolveTemplateForRow(row);
      if (tpl) acc.push(applyRowToLabel(tpl, row));
      return acc;
    }, []);
  }

  async function loadMergeTemplatesFromDir() {
    if (!hasActiveLibrary()) return;
    let entries;
    try {
      entries = await currentLibraryEntries();
      state.mergeTemplatesLoadError = null;
    } catch (e) {
      // Unlike refreshLibraryList (which writes straight into its own
      // #libraryStatus), this needs to survive an unconditional
      // updateMergeTemplatesStatus() call right after - see that function.
      state.mergeTemplatesLoadError = e.message;
      return;
    }
    const map = {};
    for (const entry of entries) {
      try {
        const text = await entry.readText();
        map[entry.name] = { label: window.ZPLParser.parseZPL(text), fileName: entry.name };
      } catch (e) {
        // Unreadable/unparseable file in the library - leave it out of the
        // map; if a CSV row references it, it'll surface as "skipped" rather
        // than silently substituting the wrong template.
      }
    }
    state.mergeTemplates = map;
  }

  function updateMergeTemplatesStatus() {
    if (state.mergeTemplatesLoadError) {
      $('mergeTemplatesStatus').textContent = 'Bibliothek konnte nicht geladen werden: ' + state.mergeTemplatesLoadError;
      return;
    }
    const names = Object.keys(state.mergeTemplates);
    $('mergeTemplatesStatus').textContent = names.length
      ? (names.length + ' Vorlage(n) verfügbar: ' + names.join(', '))
      : 'Keine Vorlagen geladen.';
  }

  // ---- Data source (CSV/XLSX upload) ----
  function setMergeDataFromSheets(sheetNames, sheets, sourceName) {
    state.mergeData = { sheetNames: sheetNames, sheets: sheets, activeSheet: sheetNames[0], sourceName: sourceName };
    state.mergeTemplateColumn = null;
    buildMergeSheetPicker();
    buildMergeTemplateColumnPicker();
    renderMergeDataPreview();
    renderMergePreview();
    const rowCount = mergeActiveRows().length;
    // Persistent status (unlike the toast below, which fades) - mirrors the
    // #libraryStatus/#varsXmlStatus pattern used everywhere else in the sidebar.
    $('mergeDataStatus').textContent = 'Datei: ' + sourceName + ' (' + rowCount + ' Zeile' + (rowCount === 1 ? '' : 'n') + ')';
    showToast('„' + sourceName + '“ geladen: ' + rowCount + ' Zeile(n).');
  }

  // A handful of known parser failure strings (English, implementation-detail
  // phrasing meant for developers) translated into one actionable German
  // sentence - everything else falls back to the raw message rather than
  // silently swallowing a genuinely unexpected error.
  function friendlyMergeFileError(err) {
    const msg = (err && err.message) || String(err);
    if (/input is empty/i.test(msg)) return 'Datei ist leer.';
    if (/not a valid xlsx|missing xl\/workbook/i.test(msg)) return 'Keine gültige XLSX-Datei. Bitte aus Excel als .xlsx oder .csv erneut exportieren.';
    if (/unsupported zip compression/i.test(msg)) return 'Dieses XLSX-Dateiformat wird nicht unterstützt. Bitte aus Excel neu speichern und erneut hochladen.';
    return msg;
  }

  $('btnMergeLoadData').addEventListener('click', function () { $('mergeDataInput').click(); });
  $('mergeDataInput').addEventListener('change', function (e) {
    const file = e.target.files[0];
    if (!file) return;
    const isXlsx = /\.xlsx$/i.test(file.name);
    const handleError = function (err) { showToast('Konnte „' + file.name + '“ nicht lesen: ' + friendlyMergeFileError(err), true); };
    // Parsing (hand-rolled ZIP+inflate for XLSX, char-by-char tokenizing for
    // CSV) is real synchronous work that can visibly freeze the tab for a
    // large XML export - show feedback before it starts, same pattern as the
    // A4-sheet print path (see the setTimeout(fn, 10) comment further down).
    $('mergeDataStatus').textContent = 'Datei wird eingelesen…';
    if (isXlsx) {
      file.arrayBuffer().then(function (buf) {
        setTimeout(function () {
          try {
            const parsed = window.XLSXParser.parse(buf);
            setMergeDataFromSheets(parsed.sheetNames, parsed.sheets, file.name);
          } catch (err) { handleError(err); }
        }, 10);
      }, handleError);
    } else {
      file.text().then(function (text) {
        setTimeout(function () {
          try {
            const parsed = window.CSVParser.parse(text);
            setMergeDataFromSheets(['Daten'], { Daten: { headers: parsed.headers, rows: parsed.rows } }, file.name);
          } catch (err) { handleError(err); }
        }, 10);
      }, handleError);
    }
    e.target.value = '';
  });

  function buildMergeSheetPicker() {
    const picker = $('mergeSheetPicker');
    const select = $('mergeSheetSelect');
    if (!state.mergeData || state.mergeData.sheetNames.length <= 1) { picker.classList.add('hidden'); return; }
    picker.classList.remove('hidden');
    select.innerHTML = state.mergeData.sheetNames.map(function (n) {
      return '<option value="' + escapeHtml(n) + '"' + (n === state.mergeData.activeSheet ? ' selected' : '') + '>' + escapeHtml(n) + '</option>';
    }).join('');
  }
  $('mergeSheetSelect').addEventListener('change', function (e) {
    if (!state.mergeData) return;
    state.mergeData.activeSheet = e.target.value;
    state.mergeTemplateColumn = null;
    buildMergeTemplateColumnPicker();
    renderMergeDataPreview();
    renderMergePreview();
  });

  function renderMergeDataPreview() {
    const el = $('mergeDataPreview');
    const headers = mergeActiveHeaders();
    const rows = mergeActiveRows();
    if (!headers.length) { el.innerHTML = ''; return; }
    const previewRows = rows.slice(0, 5);
    let html = '<table class="merge-table"><thead><tr>' +
      headers.map(function (h) { return '<th>' + escapeHtml(h) + '</th>'; }).join('') + '</tr></thead><tbody>';
    previewRows.forEach(function (row) {
      html += '<tr>' + headers.map(function (h) { return '<td>' + escapeHtml(row[h] || '') + '</td>'; }).join('') + '</tr>';
    });
    html += '</tbody></table>';
    if (rows.length > previewRows.length) html += '<p class="hint">&hellip; und ' + (rows.length - previewRows.length) + ' weitere Zeile(n).</p>';
    el.innerHTML = html;
  }

  // ---- Template mode (single label vs. per-row file from a column) ----
  document.querySelectorAll('input[name="mergeTemplateMode"]').forEach(function (radio) {
    radio.addEventListener('change', function () {
      state.mergeTemplateMode = document.querySelector('input[name="mergeTemplateMode"]:checked').value;
      $('mergeColumnModeFields').classList.toggle('hidden', state.mergeTemplateMode !== 'column');
      if (state.mergeTemplateMode === 'column') {
        // Show "keine Vorlagen geladen" right away even with no folder open
        // yet - previously this status stayed blank until a folder existed,
        // instead of the informative empty-state every other path shows.
        updateMergeTemplatesStatus();
        if (hasActiveLibrary()) {
          loadMergeTemplatesFromDir().then(function () { updateMergeTemplatesStatus(); renderMergePreview(); });
        } else {
          renderMergePreview();
        }
      } else {
        renderMergePreview();
      }
    });
  });

  function buildMergeTemplateColumnPicker() {
    const select = $('mergeTemplateColumn');
    const headers = mergeActiveHeaders();
    select.innerHTML = headers.map(function (h) {
      return '<option value="' + escapeHtml(h) + '">' + escapeHtml(h) + '</option>';
    }).join('');
    if (!state.mergeTemplateColumn && headers.length) state.mergeTemplateColumn = headers[0];
    if (state.mergeTemplateColumn) select.value = state.mergeTemplateColumn;
  }
  $('mergeTemplateColumn').addEventListener('change', function (e) {
    state.mergeTemplateColumn = e.target.value;
    renderMergePreview();
  });

  $('btnMergeLoadTemplates').addEventListener('click', function () { $('mergeTemplatesInput').click(); });
  $('mergeTemplatesInput').addEventListener('change', function (e) {
    const files = Array.from(e.target.files || []);
    if (!files.length) return;
    const failed = [];
    Promise.all(files.map(function (file) {
      return file.text().then(function (text) {
        try {
          state.mergeTemplates[file.name] = { label: window.ZPLParser.parseZPL(text), fileName: file.name };
        } catch (err) { failed.push(file.name); }
      });
    })).then(function () {
      updateMergeTemplatesStatus();
      renderMergePreview();
      if (failed.length) showToast('Konnte nicht als Vorlage gelesen werden: ' + failed.join(', '), true);
    });
    e.target.value = '';
  });

  // ---- Preview: summary + a few rendered thumbnails ----
  // Thumbnail rendering (offscreen canvas per row) is real render work,
  // unlike the other buildXForm() functions renderAll() calls unconditionally
  // (those just rebuild a bit of HTML) - so this bails out immediately
  // whenever the Seriendruck tab isn't the one on screen, rather than paying
  // that cost on every unrelated edit to the current label.
  function renderMergePreview() {
    if (!$('tab-merge').classList.contains('active')) return;
    const summary = $('mergeSummary');
    const grid = $('mergePreviewGrid');
    grid.innerHTML = '';
    const rows = mergeActiveRows();
    if (!rows.length) {
      // Distinguish "nothing uploaded yet" from "a file WAS loaded but has
      // zero data rows" (e.g. a header-only XML export) - these used to
      // show the identical "nothing loaded" text, reading as a silently
      // failed upload even though the file above renders a header-only table.
      summary.textContent = state.mergeData
        ? '„' + state.mergeData.sourceName + '“ enthält keine Datenzeilen.'
        : 'Noch keine Daten geladen.';
      summary.classList.remove('warning');
      updateMergeOutputButtons();
      return;
    }

    const warnings = [];
    // Columns actually present for the placeholders this template uses -
    // checked per-row below so a BLANK cell (column exists, this row's value
    // doesn't) gets caught too, not just a column missing outright.
    let mappedVars = [];
    if (state.mergeTemplateMode !== 'column') {
      const vars = findVariablesIn(state.label);
      // Case-insensitive, matching lookupRowValue()'s matching above - a
      // placeholder is only genuinely "missing" if no header matches
      // regardless of case.
      const headersLower = mergeActiveHeaders().map(function (h) { return h.toLowerCase(); });
      const missingCols = vars.filter(function (v) { return headersLower.indexOf(v.toLowerCase()) === -1; });
      if (missingCols.length) warnings.push('Platzhalter ohne passende Spalte: ' + missingCols.map(function (v) { return '$' + v + '$'; }).join(', '));
      mappedVars = vars.filter(function (v) { return missingCols.indexOf(v) === -1; });
    }

    const maxThumbs = 6;
    let renderedCount = 0, skipped = 0;
    const blankValueRows = []; // 1-based row numbers where a mapped placeholder's cell is empty - prints the literal $NAME$ token
    const skippedFileNames = []; // column mode only - the actual unresolved filename per skipped row, not just a bare count
    const renderFailureRows = []; // 1-based row numbers where an element threw while rendering the preview thumbnail
    rows.forEach(function (row, idx) {
      const tpl = resolveTemplateForRow(row);
      if (!tpl) {
        skipped++;
        if (state.mergeTemplateMode === 'column') {
          const fileName = (row[state.mergeTemplateColumn] || '').trim();
          if (fileName) skippedFileNames.push(fileName);
        }
        return;
      }
      renderedCount++;
      if (mappedVars.some(function (v) { const val = lookupRowValue(row, v); return val === undefined || val === ''; })) {
        blankValueRows.push(idx + 1);
      }
      if (idx >= maxThumbs) return;
      const merged = applyRowToLabel(tpl, row);
      const zoomThumb = 0.22;
      const thumb = document.createElement('canvas');
      thumb.width = Math.max(1, Math.round(merged.settings.widthDots * zoomThumb));
      thumb.height = Math.max(1, Math.round(merged.settings.heightDots * zoomThumb));
      thumb.className = 'merge-thumb';
      try {
        const failures = renderLabelOffscreen(merged, thumb.getContext('2d'), zoomThumb);
        if (failures && failures.length) renderFailureRows.push(idx + 1);
      } catch (e) { renderFailureRows.push(idx + 1); /* leave the thumb blank rather than blocking the rest of the preview */ }
      const wrap = document.createElement('div');
      wrap.className = 'merge-thumb-wrap';
      wrap.appendChild(thumb);
      const capt = document.createElement('div');
      capt.className = 'merge-thumb-caption';
      capt.textContent = 'Zeile ' + (idx + 1);
      wrap.appendChild(capt);
      grid.appendChild(wrap);
    });

    if (state.mergeTemplateMode === 'column' && skipped) {
      const distinctMissing = Array.from(new Set(skippedFileNames));
      let msg = skipped + ' Zeile(n) übersprungen (keine Vorlage für die gewählte Spalte gefunden)';
      if (distinctMissing.length) {
        msg += ' – fehlende Vorlage(n): ' + distinctMissing.slice(0, 10).join(', ') + (distinctMissing.length > 10 ? ', …' : '');
      }
      warnings.push(msg + '.');
    }
    if (blankValueRows.length) {
      // The most common real-world failure this batch view exists to catch:
      // a column exists but is blank on SOME rows, so applyRowToLabel()
      // deliberately leaves the literal "$NAME$" text in place for those -
      // which otherwise only becomes visible after it's already printed.
      warnings.push(blankValueRows.length + ' Zeile(n) mit leeren Platzhalter-Werten (Zeile ' +
        blankValueRows.slice(0, 10).join(', ') + (blankValueRows.length > 10 ? ', …' : '') +
        ') – dort wird der Platzhalter unverändert gedruckt statt ersetzt.');
    }
    if (renderFailureRows.length) {
      warnings.push(renderFailureRows.length + ' Zeile(n) enthalten Elemente, die in der Vorschau nicht dargestellt werden konnten (Zeile ' +
        renderFailureRows.join(', ') + ').');
    }

    let text = rows.length + ' Zeile(n) geladen, ' + renderedCount + ' Label(s) werden erzeugt.';
    if (rows.length > maxThumbs) text += ' (Vorschau zeigt die ersten ' + maxThumbs + '.)';
    if (warnings.length) text += ' ' + warnings.join(' ');
    summary.textContent = text;
    summary.classList.toggle('warning', warnings.length > 0);
    updateMergeOutputButtons();
  }

  // Grey out the output actions until there's actually something to print -
  // matches the disabled-state convention used everywhere else in the app
  // (updateUndoRedoButtons, btnSave.disabled) instead of only reacting after
  // the fact with a toast once a user has already clicked.
  function updateMergeOutputButtons() {
    const ready = mergeActiveRows().length > 0;
    ['btnMergeDownloadZpl', 'btnMergePrintZpl', 'btnMergePrintSheet'].forEach(function (id) {
      $(id).disabled = !ready;
    });
  }

  // ---- Output: Zebra/ZPL (batch download + backend/OS print) ----
  // keepPreamble:false mirrors the existing label-diff path (renderDiffResult
  // above) rather than the single-label download - every row's preamble is
  // identical anyway (they all descend from the same template), so repeating
  // driver-config passthrough text once per row in one combined job would be
  // pure duplication, not extra fidelity.
  function mergedZplText(labels) {
    return (labels || buildMergedLabels()).map(function (l) {
      return window.ZPLGenerator.generateZPL(l, { keepPreamble: false });
    }).join('\n');
  }

  function mergedZplForBackendPrint(labels) {
    return labels.map(function (label) {
      return window.ZPLGenerator.generateZPL(labelForBackendPrint(label), { keepPreamble: false });
    }).join('\n');
  }

  $('btnMergeDownloadZpl').addEventListener('click', function () {
    const count = buildMergedLabels().length;
    if (!count) { showToast('Keine Zeilen zum Drucken gefunden.', true); return; }
    const blob = new Blob([mergedZplText()], { type: 'text/plain' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = 'seriendruck.zpl';
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    setTimeout(function () { URL.revokeObjectURL(url); }, 4000);
    showToast(count + ' Label(s) als ZPL exportiert.');
  });

  $('btnMergePrintZpl').addEventListener('click', function () {
    const labels = buildMergedLabels();
    if (!labels.length) { showToast('Keine Zeilen zum Drucken gefunden.', true); return; }
    // A configured raw-ZPL backend is the reliable path for real serial
    // print jobs. The fallback stays available for static deployments and
    // opens the system print dialog below.
    const backend = availableBackendClient();
    if (backend && backend.hasCapability('print.zebra')) {
      openPrintModal({ zpl: mergedZplForBackendPrint(labels), labelCount: labels.length });
      return;
    }
    const text = mergedZplText(labels);
    const win = window.open('', '_blank');
    if (!win) { showToast('Popup wurde vom Browser blockiert. Bitte Popups für diese Seite erlauben.', true); return; }
    win.document.write('<!doctype html><html><head><title>ZPL-Druck</title><style>body{margin:0;font-family:Consolas,monospace;white-space:pre-wrap;font-size:10pt}</style></head><body>' + escapeHtml(text) + '</body></html>');
    win.document.close();
    // This is only reliable when the selected printer is configured to pass
    // raw ZPL through unchanged. Otherwise the dialog can print the ZPL code
    // as literal text instead of letting the printer interpret it.
    win.onload = function () { win.focus(); win.print(); };
    win.onafterprint = function () { win.close(); };
  });

  // ---- Output: A4 sheet with multiple labels ----------------------------
  function currentSheetConfig() {
    const presetId = $('mergeSheetPreset').value;
    if (presetId === 'custom') return Object.assign({ page: 'A4' }, state.mergeCustomSheet);
    return window.LabelSheets.presetById(presetId) || window.LabelSheets.PRESETS[0];
  }

  function buildMergeSheetPresetOptions() {
    const select = $('mergeSheetPreset');
    const previous = select.value;
    select.innerHTML = window.LabelSheets.PRESETS.map(function (p) {
      const countInfo = p.id === 'custom' ? '' : (' (' + p.labelWidthMM + '×' + p.labelHeightMM + 'mm, ' + t('sheet.count', { count: p.cols * p.rows }) + ')');
      const name = p.id === 'custom' ? t(p.name) : p.name;
      return '<option value="' + p.id + '">' + escapeHtml(name) + escapeHtml(countInfo) + '</option>';
    }).join('');
    if (Array.prototype.some.call(select.options, function (option) { return option.value === previous; })) select.value = previous;
  }
  $('mergeSheetPreset').addEventListener('change', function () {
    $('mergeCustomSheetFields').classList.toggle('hidden', $('mergeSheetPreset').value !== 'custom');
  });

  function buildMergeCustomSheetFields() {
    const c = state.mergeCustomSheet;
    $('mergeCustomSheetFields').innerHTML =
      fieldPair(field('Spalten', '<input type="number" id="msCols" min="1" value="' + c.cols + '">'),
        field('Zeilen', '<input type="number" id="msRows" min="1" value="' + c.rows + '">')) +
      fieldPair(field('Label-Breite (mm)', '<input type="number" id="msLabelW" min="1" step="0.1" value="' + c.labelWidthMM + '">'),
        field('Label-Höhe (mm)', '<input type="number" id="msLabelH" min="1" step="0.1" value="' + c.labelHeightMM + '">')) +
      fieldPair(field('Rand links (mm)', '<input type="number" id="msMarginL" min="0" step="0.1" value="' + c.marginLeftMM + '">'),
        field('Rand oben (mm)', '<input type="number" id="msMarginT" min="0" step="0.1" value="' + c.marginTopMM + '">')) +
      fieldPair(field('Abstand horizontal (mm)', '<input type="number" id="msGapX" min="0" step="0.1" value="' + c.gapXMM + '">'),
        field('Abstand vertikal (mm)', '<input type="number" id="msGapY" min="0" step="0.1" value="' + c.gapYMM + '">'));
    // Minimum acceptable value per field, and the fallback used when the
    // input is empty/non-numeric/below that minimum - cols/rows/label size
    // must stay positive (a 0 or negative grid dimension would make
    // computeSlots() divide the page into nothing, or draw negative-size
    // slots), while margins/gaps are legitimately allowed to be exactly 0.
    const FIELD_MIN = {
      cols: 1, rows: 1, labelWidthMM: 0.1, labelHeightMM: 0.1,
      marginLeftMM: 0, marginTopMM: 0, gapXMM: 0, gapYMM: 0
    };
    const binds = [
      ['msCols', 'cols', parseInt], ['msRows', 'rows', parseInt],
      ['msLabelW', 'labelWidthMM', parseFloat], ['msLabelH', 'labelHeightMM', parseFloat],
      ['msMarginL', 'marginLeftMM', parseFloat], ['msMarginT', 'marginTopMM', parseFloat],
      ['msGapX', 'gapXMM', parseFloat], ['msGapY', 'gapYMM', parseFloat],
    ];
    binds.forEach(function (b) {
      const id = b[0], key = b[1], parseFn = b[2];
      $(id).addEventListener('input', function () {
        const min = FIELD_MIN[key];
        const parsed = parseFn($(id).value, 10);
        state.mergeCustomSheet[key] = (isFinite(parsed) && parsed >= min) ? parsed : min;
      });
    });
  }

  function renderLabelToDataUrl(label) {
    return renderLabelToCanvas(label).canvas.toDataURL('image/png');
  }

  $('btnMergePrintSheet').addEventListener('click', function () {
    const labels = buildMergedLabels();
    if (!labels.length) { showToast('Keine Zeilen zum Drucken gefunden.', true); return; }
    if (!allowRasterOutput(labels)) return;
    const cfg = currentSheetConfig();
    const slots = window.LabelSheets.computeSlots(cfg);
    const page = window.LabelSheets.pageSizeMM(cfg.page);
    if (!slots.length) { showToast('Ungültiges Bogen-Raster (0 Spalten/Zeilen).', true); return; }

    showToast('Erzeuge ' + labels.length + ' Label(s) für den Druck…');
    // Rasterizing every label + building the print document is real
    // synchronous work for a large batch - defer one tick so the toast above
    // actually paints before the tab potentially freezes for a moment.
    setTimeout(function () {
      let html = '<!doctype html><html><head><title>Etiketten-Druck</title><style>' +
        '@page { size: A4; margin: 0; }' +
        'html, body { margin: 0; padding: 0; background: #fff; }' +
        '.sheet { position: relative; width: ' + page.widthMM + 'mm; height: ' + page.heightMM + 'mm; page-break-after: always; }' +
        '.sheet:last-child { page-break-after: auto; }' +
        '.slot { position: absolute; overflow: hidden; }' +
        '.slot img { width: 100%; height: 100%; object-fit: contain; image-rendering: pixelated; }' +
        '</style></head><body>';
      for (let i = 0; i < labels.length; i += slots.length) {
        html += '<div class="sheet">';
        labels.slice(i, i + slots.length).forEach(function (label, slotIdx) {
          const slot = slots[slotIdx];
          html += '<div class="slot" style="left:' + slot.xMM + 'mm;top:' + slot.yMM + 'mm;width:' + slot.widthMM + 'mm;height:' + slot.heightMM + 'mm">' +
            '<img src="' + renderLabelToDataUrl(label) + '" alt=""></div>';
        });
        html += '</div>';
      }
      html += '</body></html>';

      const win = window.open('', '_blank');
      if (!win) { showToast('Popup wurde vom Browser blockiert. Bitte Popups für diese Seite erlauben.', true); return; }
      win.document.write(html);
      win.document.close();
      win.onload = function () { win.focus(); win.print(); };
      win.onafterprint = function () { win.close(); };
    }, 10);
  });

  buildMergeSheetPresetOptions();
  buildMergeCustomSheetFields();

  // A locale change intentionally does not reload the editor: unsaved work,
  // selected elements and imported data all remain intact. History labels are
  // derived from snapshots again because older entries contain rendered copy.
  document.addEventListener('zpl-i18n-change', function () {
    state.history.forEach(function (entry, index) {
      const previous = index > 0 ? restore(state.history[index - 1].snapshot) : null;
      entry.label = describeHistoryChange(previous, restore(entry.snapshot));
    });
    buildMergeSheetPresetOptions();
    buildMergeCustomSheetFields();
    renderAll();
    updateLabelNav();
    renderHistoryPanel();
    updateUndoRedoButtons();
    setAutosaveStatus(autosaveStatusKey, autosaveStatusFailed);
  });

  // ---------------------------------------------------------------------
  // Boot
  // ---------------------------------------------------------------------
  // state.label was created inline with the state object; wrap it in a
  // document so the invariant "state.label === doc.labels[activeIndex]"
  // holds from the very first frame rather than only after the first open.
  state.doc = singleLabelDocument(state.label);
  updateLabelNav();
  window.addEventListener('resize', function () {
    applyWorkspaceDimensions();
    fitZoom();
    drawLabel();
  });
  const recoveryDraft = readAutosaveDraft();
  if (recoveryDraft && confirm('Es gibt einen lokal gesicherten, noch nicht gespeicherten Stand' +
      (recoveryDraft.savedAt ? ' vom ' + new Date(recoveryDraft.savedAt).toLocaleString(editorLocaleTag()) : '') +
      '. Jetzt wiederherstellen?')) {
    loadDocument(recoveryDraft.doc, recoveryDraft.fileName, null, null, { recovered: true });
    showToast('Lokalen Stand wiederhergestellt. Bitte anschließend speichern oder herunterladen.');
  } else {
    if (recoveryDraft) removeAutosaveDraft();
    loadLabel(M.defaultLabel(), null, null);
  }

  // Probe the optional client once for both integrations. A missing script
  // (CSP/cache mismatch/third-party embedding), network failure or static
  // host must never interrupt editor boot; the default UI remains local-only.
  const bootBackend = availableBackendClient();
  const backendProbe = bootBackend && typeof bootBackend.probe === 'function'
    ? Promise.resolve().then(function () { return bootBackend.probe(); }).catch(function () { return []; })
    : Promise.resolve([]);

  // Server-side template library (optional, see probeServerTemplates above) -
  // a discovery-advertised implementation is preferred when available, with
  // clean/.php route probing retained for older servers. A local folder that
  // the user picked while probing always wins over this background result.
  probeServerTemplates(backendProbe).then(function (base) {
    if (!base || state.librarySource === 'local' || state.dirHandle) return;
    state.librarySource = 'server';
    $('libraryDetails').open = true;
    refreshLibraryList();
  }).catch(function () { /* optional server library must never break the editor */ });

  // The "Drucken…" button stays hidden (its default state in index.html)
  // unless an optional backend actually advertises a print capability.
  backendProbe.then(function (capabilities) {
    if (!bootBackend || capabilities.indexOf('print.zebra') === -1 && capabilities.indexOf('print.generic') === -1 && capabilities.indexOf('labelserver.xml') === -1) return;
    $('btnPrintBackend').classList.remove('hidden');
    $('btnPrintBackend').addEventListener('click', openPrintModal);
  }).catch(function () { /* no backend is a normal standalone outcome */ });
  // The very first layout pass can report a stale/zero canvas-wrap size in
  // some browsers depending on stylesheet load timing, so re-fit once the
  // browser has settled on a real layout.
  requestAnimationFrame(function () { fitZoom(); drawLabel(); });

  // The @font-face for font 0's substitute (Roboto Condensed) is declared in
  // CSS but nothing in the DOM actually renders text with it, so browsers
  // won't proactively fetch the file just from that declaration - and a
  // canvas fillText() call made before it loads silently draws with the
  // fallback font forever, with no automatic repaint once the real font
  // becomes available (unlike DOM text). Explicitly requesting the load and
  // redrawing once it resolves closes that gap; a rejected load (e.g. the
  // font file is missing) just leaves the fallback font in place.
  if (document.fonts && document.fonts.load) {
    document.fonts.load("700 20px 'Roboto Condensed'").then(function () { drawLabel(); }).catch(function () {});
  }
})();
