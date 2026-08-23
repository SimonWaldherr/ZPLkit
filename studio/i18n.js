/* ZPL-Studio — small, dependency-free UI localization layer.
   The label model and its ZPL/data values deliberately stay untouched: this
   module only translates editor chrome and generated UI copy. */
(function (global) {
  'use strict';

  const SUPPORTED = ['de', 'en', 'fr'];
  const LOCALE_TAGS = { de: 'de-DE', en: 'en-US', fr: 'fr-FR' };
  let current = 'de';
  const textSources = new WeakMap();
  const attributeSources = new WeakMap();

  // Most keys are the German source string. This makes static HTML pleasant
  // to read and lets dynamic fragments use the very same catalog. Semantic
  // keys below are reserved for messages that need variables or plural forms.
  const messages = {
    de: {
      'app.title': 'ZPL-Studio',
      'hint.variables': 'Platzhalter im Format <code>$NAME$</code> werden automatisch erkannt (z.&nbsp;B. aus XML-Exporten). Trage hier Beispielwerte ein, um die Vorschau zu testen &ndash; beim Export bleiben die Platzhalter unverändert erhalten.',
      'hint.merge-intro': 'Seriendruck: CSV- oder XLSX-Datei hochladen &ndash; für jede Zeile wird ein Label erzeugt, indem <code>$SPALTENNAME$</code>-Platzhalter (wie im Tab &bdquo;Variablen&ldquo;) durch den jeweiligen Zellwert ersetzt werden. Anschließend als ZPL für einen Zebra-Drucker oder als A4-Bogen mit mehreren Labels drucken.',
      'hint.merge-zpl-output': 'Erzeugt ein ZPL-Dokument mit allen Labels hintereinander (<code>^XA…^XZ</code> je Zeile).',
      'hint.merge-backend-print': 'Mit einem konfigurierten ZPL-Backend öffnet &bdquo;Direkt drucken&ldquo; die sichere Backend-Druckauswahl und sendet den Seriendruck direkt an den gewählten Zebra-Drucker. Ohne Backend öffnet es den Systemdruckdialog. Das funktioniert nur zuverlässig, wenn der Drucker für die unveränderte Weitergabe von ZPL eingerichtet ist; andernfalls wird der ZPL-Code als Text ausgedruckt statt vom Drucker interpretiert.',
      'history.initial': 'Ausgangszustand',
      'history.change': 'Änderung',
      'history.added.one': '{element} hinzugefügt',
      'history.added.other': '{count} Elemente hinzugefügt',
      'history.removed.one': '{element} entfernt',
      'history.removed.other': '{count} Elemente entfernt',
      'history.changed.one': '{element}: {field} geändert',
      'history.changed.other': '{count} Elemente geändert',
      'history.settings': 'Etiketteneinstellungen geändert',
      'history.graphics': 'Grafikdaten geändert',
      'history.properties': '{count} Eigenschaften',
      'print.sent': 'Gesendet{job}.',
      'print.job': ' (Job {jobId})',
      'print.failed': 'Fehlgeschlagen: {error}',
      'print.sending': 'Wird gesendet…',
      'print.copies.invalid': 'Bitte eine Anzahl von 1 bis 99 eingeben.',
      'print.error.busy': 'Der Drucker verarbeitet noch einen Auftrag. Bitte kurz warten und dann erneut senden.',
      'print.error.printer-not-found': 'Der gewählte Drucker ist nicht mehr verfügbar. Bitte die Druckerliste neu laden.',
      'print.error.backend-unavailable': 'Der Druckdienst ist nicht verfügbar. Der Editor bleibt im lokalen Browsermodus verwendbar.',
      'print.error.delivery-failed': 'Der Auftrag konnte nicht an den Drucker übertragen werden. Druckerstatus prüfen und bei Bedarf erneut senden.',
      'print.error.delivery-unknown': 'Der Druckauftrag könnte bereits am Drucker angekommen sein. Bitte prüfen, bevor er erneut gesendet wird.',
      'print.single.hint': 'Sendet dieses Label über den konfigurierten Backend-Dienst an einen Drucker.',
      'print.batch.hint': '{count} vorbereitete Label(s) werden als Seriendruck über den konfigurierten Backend-Dienst gesendet.',
      'print.pq.notice': ' Die Anzahl wird genau einmal vom Backend angewendet; eine vorhandene <code>^PQ</code>-Auflage wird dafür auf eine Kopie normalisiert.',
      'print.raster': 'Bild drucken',
      'print.raster.title': 'Label als Bild über den Systemdruckdialog drucken',
      'print.popup-blocked': 'Der Druckdialog konnte nicht geöffnet werden. Bitte Popups für diese Seite erlauben.',
      'print.printer-search': 'Drucker suchen…',
      'print.printer-count': '{count} von {total} Druckern',
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
      'toast.saved': 'Gespeichert: {name}',
      'toast.labels-exported': '{count} Label(s) als ZPL exportiert.',
      'toast.labels-generating': 'Erzeuge {count} Label(s) für den Druck…',
      'toast.no-print-rows': 'Keine Zeilen zum Drucken gefunden.',
      'toast.history-excluded': 'Diese Änderung ist ausgeschlossen – zeige den Stand davor.',
      'file.unknown-error': 'unbekannter Fehler',
      'sheet.count': '{count}/Bogen',
      'library.folder-unsupported': 'Wird von diesem Browser nicht unterstützt. Nutze stattdessen „Datei öffnen…“.',
      'library.load-failed': 'Bibliothek konnte nicht geladen werden: {error}',
      'library.server-templates': 'Server-Vorlagen: {count}',
      'library.folder': 'Ordner: {name}',
      'library.no-files': '(keine .zpl-Dateien gefunden)',
    },
    en: {
      'app.title': 'ZPL-Studio',
      'hint.variables': 'Placeholders in the form <code>$NAME$</code> are detected automatically (for example from XML exports). Enter sample values here to test the preview; placeholders remain unchanged when exporting.',
      'hint.merge-intro': 'Mail merge: upload a CSV or XLSX file &ndash; one label is created for every row by replacing <code>$COLUMN_NAME$</code> placeholders (as in the &ldquo;Variables&rdquo; tab) with the respective cell value. Then print as ZPL for a Zebra printer or as an A4 sheet with multiple labels.',
      'hint.merge-zpl-output': 'Creates one ZPL document containing all labels in sequence (<code>^XA…^XZ</code> per row).',
      'hint.merge-backend-print': 'With a configured ZPL backend, &ldquo;Print directly&rdquo; opens the safe backend printer selection and sends the mail-merge job directly to the selected Zebra printer. Without a backend, it opens the system print dialog. This is only reliable when the printer is configured to pass ZPL through unchanged; otherwise the ZPL code may be printed as text instead of being interpreted by the printer.',
      'history.initial': 'Initial state',
      'history.change': 'Change',
      'history.added.one': '{element} added',
      'history.added.other': '{count} elements added',
      'history.removed.one': '{element} removed',
      'history.removed.other': '{count} elements removed',
      'history.changed.one': '{element}: {field} changed',
      'history.changed.other': '{count} elements changed',
      'history.settings': 'Label settings changed',
      'history.graphics': 'Graphic data changed',
      'history.properties': '{count} properties',
      'print.sent': 'Sent{job}.',
      'print.job': ' (job {jobId})',
      'print.failed': 'Failed: {error}',
      'print.sending': 'Sending…',
      'print.copies.invalid': 'Enter a quantity between 1 and 99.',
      'print.error.busy': 'The printer is still processing another job. Wait briefly, then send again.',
      'print.error.printer-not-found': 'The selected printer is no longer available. Reload the printer list.',
      'print.error.backend-unavailable': 'The print service is unavailable. The editor remains usable in local browser mode.',
      'print.error.delivery-failed': 'The job could not be delivered to the printer. Check the printer status and send again if needed.',
      'print.error.delivery-unknown': 'The print job may already have reached the printer. Check it before sending again.',
      'print.single.hint': 'Sends this label to a printer through the configured backend service.',
      'print.batch.hint': '{count} prepared label(s) will be sent as a mail-merge job through the configured backend service.',
      'print.pq.notice': ' The backend applies the quantity exactly once; an existing <code>^PQ</code> quantity is normalized to one copy for this purpose.',
      'print.raster': 'Print image',
      'print.raster.title': 'Print the label as an image through the system print dialog',
      'print.popup-blocked': 'The print dialog could not be opened. Allow pop-ups for this page and try again.',
      'print.printer-search': 'Search printers…',
      'print.printer-count': '{count} of {total} printers',
      'print.no-printers-match': 'No matching printers found.',
      'raster.blocked': 'Raster output stopped: {reasons}. Send this label as ZPL to a compatible printer instead.',
      'raster.warning': 'Barcode check: {reasons}.\n\nExport as a raster image anyway?',
      'raster.lossy-format': 'JPG and GIF are not scanner-safe for barcode labels. Use PNG or PDF instead.',
      'raster.too-large': 'The label is too large for safe raster output. Reduce its size or print it directly as ZPL.',
      'raster.reason.unrendered-zpl': 'ZPL commands that cannot be rendered',
      'raster.reason.placeholder-barcode': 'a 2D code is available only as a preview',
      'raster.reason.barcode-control-prefix': 'Code 128 control data cannot be rasterized safely',
      'raster.reason.invalid-barcode': 'at least one barcode is invalid',
      'raster.reason.module-too-small': 'at least one module width is very small',
      'raster.reason.inverse-barcode': 'an inverse barcode needs a compatible scanner',
      'raster.reason.edge-quiet-zone': 'a barcode is too close to the label edge',
      'toast.saved': 'Saved: {name}',
      'toast.labels-exported': '{count} label(s) exported as ZPL.',
      'toast.labels-generating': 'Preparing {count} label(s) for printing…',
      'toast.no-print-rows': 'No rows to print were found.',
      'toast.history-excluded': 'This change is excluded — showing the preceding state.',
      'file.unknown-error': 'unknown error',
      'sheet.count': '{count} per sheet',
      'library.folder-unsupported': 'This browser does not support folders. Use “Open file…” instead.',
      'library.load-failed': 'The library could not be loaded: {error}',
      'library.server-templates': 'Server templates: {count}',
      'library.folder': 'Folder: {name}',
      'library.no-files': '(no .zpl files found)',

      'Neu': 'New',
      'Speichern': 'Save',
      'Herunterladen': 'Download',
      'Exportieren als…': 'Export as…',
      'Drucken…': 'Print…',
      'Drucken': 'Print',
      'Rückgängig': 'Undo',
      'Wiederholen': 'Redo',
      'Verkleinern': 'Zoom out',
      'Vergrößern': 'Zoom in',
      'Einpassen': 'Fit',
      'Gitter': 'Grid',
      'Beispieldaten anzeigen': 'Show sample data',
      'Vergleichen…': 'Compare…',
      'Exakte Vorschau…': 'Exact preview…',
      'Sprache': 'Language',
      'Deutsch': 'German',
      'Englisch': 'English',
      'Französisch': 'French',
      'Werkzeuge': 'Tools',
      'Auswahl': 'Select',
      'Text': 'Text',
      'Barcode': 'Barcode',
      'Box': 'Box',
      'Kreis': 'Circle',
      'Linie': 'Line',
      'Ellipse': 'Ellipse',
      'Grafik': 'Graphic',
      'Bibliothek': 'Library',
      'Ordner, Dateien & Beispiele': 'Folders, files & samples',
      'Ordner öffnen…': 'Open folder…',
      'Datei öffnen…': 'Open file…',
      'Beispiel laden…': 'Load sample…',
      'Kein Ordner geöffnet': 'No folder open',
      'Eigenschaften': 'Properties',
      'Ebenen': 'Layers',
      'Variablen': 'Variables',
      'ZPL-Code': 'ZPL code',
      'Seriendruck': 'Mail merge',
      'Verlauf': 'History',
      'Vorschau': 'Preview',
      'Übernehmen': 'Apply',
      'Code': 'Code',
      'Befehle in diesem Label': 'Commands in this label',
      'Datenquelle': 'Data source',
      'Vorlage': 'Template',
      'Ausgabe: Zebra-Drucker (ZPL)': 'Output: Zebra printer (ZPL)',
      'Ausgabe: A4-Bogen (normaler Drucker)': 'Output: A4 sheet (regular printer)',
      'Etikettenbogen': 'Label sheet',
      'CSV/XLSX-Datei wählen…': 'Choose CSV/XLSX file…',
      'Keine Datei geladen': 'No file loaded',
      'Tabellenblatt': 'Sheet',
      'Vorlagen-Dateien wählen…': 'Choose template files…',
      'Noch keine Daten geladen.': 'No data loaded yet.',
      'ZPL herunterladen': 'Download ZPL',
      'Direkt drucken…': 'Print directly…',
      'A4-Bogen drucken / als PDF speichern…': 'Print A4 sheet / save as PDF…',
      'Schließen': 'Close',
      'Abbrechen': 'Cancel',
      'Löschen': 'Delete',
      'Duplizieren': 'Duplicate',
      'Position': 'Position',
      'Abmessungen': 'Dimensions',
      'Druckeinstellungen': 'Print settings',
      'Änderungsnotiz': 'Change note',
      'Inhalt': 'Content',
      'Schrift': 'Font',
      'Ausrichtung': 'Orientation',
      'Typ': 'Type',
      'Breite (Dots)': 'Width (dots)',
      'Höhe (Dots)': 'Height (dots)',
      'Drucker-DPI': 'Printer DPI',
      'Benutzerdefiniert': 'Custom',
      'Klein (8,5 × 5,5 cm)': 'Small (8.5 × 5.5 cm)',
      'Groß (10 × 15 cm)': 'Large (10 × 15 cm)',
      'Drucker': 'Printer',
      'Ziel': 'Target',
      'Anzahl': 'Quantity',
      'Durchläufe': 'Runs',
      'Drucker werden geladen…': 'Loading printers…',
      'Keine Drucker vom Backend gemeldet.': 'The backend did not report any printers.',
      'Erneut versuchen': 'Try again',
      'Drucker-ID (optional)': 'Printer ID (optional)',
      '(Drucker auswählen…)': '(Select a printer…)',
      '(Backend-Standard)': '(Backend default)',
      'Druckerliste konnte nicht geladen werden:': 'The printer list could not be loaded:',
      'anzeigen': 'show',
      'Änderung': 'Change',
      'Backend-Standarddrucker, falls leer': 'Backend default printer when empty',
      'Zebra-Drucker (ZPL)': 'Zebra printer (ZPL)',
      'Anderer Drucker (Rasterbild)': 'Other printer (raster image)',
      'Etikettenserver (XML)': 'Label server (XML)',
      'Format kopieren': 'Copy format',
      'Format einfügen': 'Paste format',
      'Keine Elemente auf diesem Label.': 'No elements on this label.',
      'Kein Verlauf.': 'No history.',
      'Keine Platzhalter im Format $NAME$ im aktuellen Label gefunden.': 'No $NAME$ placeholders found in the current label.',
      'Beispielwert…': 'Sample value…',
      'Oder XML einfügen': 'Or paste XML',
      'XML-Datei laden…': 'Load XML file…',
      'Platzhalter umbenennen': 'Rename placeholders',
      'Von': 'From',
      'Zu': 'To',
      'Umbenennen': 'Rename',
      'Aktuelles Label für alle Zeilen verwenden': 'Use the current label for all rows',
      'Vorlagen-Datei pro Zeile aus einer Spalte wählen': 'Choose a template file per row from a column',
      'Spalte mit Dateiname': 'Column containing the file name',
      'Spalten': 'Columns',
      'Zeilen': 'Rows',
      'Label-Breite (mm)': 'Label width (mm)',
      'Label-Höhe (mm)': 'Label height (mm)',
      'Rand links (mm)': 'Left margin (mm)',
      'Rand oben (mm)': 'Top margin (mm)',
      'Abstand horizontal (mm)': 'Horizontal gap (mm)',
      'Abstand vertikal (mm)': 'Vertical gap (mm)',
      'Neue leere Label erstellen? Nicht gespeicherte Änderungen gehen verloren.': 'Create a new empty label? Unsaved changes will be lost.',
      'Beispiel-Label laden? Nicht gespeicherte Änderungen am aktuellen Label gehen verloren.': 'Load a sample label? Unsaved changes to the current label will be lost.',
      'Bild ersetzen': 'Replace image',
      'Grafik importieren': 'Import graphic',
      'Label vergleichen': 'Compare labels',
      'Exakte Vorschau (labelary.com)': 'Exact preview (labelary.com)',
      'Tastaturkürzel': 'Keyboard shortcuts',
      'Seriendruck drucken': 'Print mail merge',
      'Wird geladen…': 'Loading…',
      'ZPL-Code übernommen.': 'ZPL code applied.',
      'Format kopiert.': 'Format copied.',
      'Format eingefügt.': 'Format pasted.',
      'Bild konnte nicht geladen werden.': 'Image could not be loaded.',
      'Bitte zuerst XML in das Textfeld einfügen.': 'Paste XML into the text field first.',
      'Keine Zeilen zum Drucken gefunden.': 'No rows to print were found.',
      'Popup wurde vom Browser blockiert. Bitte Popups für diese Seite erlauben.': 'The browser blocked a pop-up. Allow pop-ups for this page and try again.',
      'Ziehen zum Umsortieren': 'Drag to reorder',
      'In der Vorschau (und beim Export) ein-/ausblenden': 'Show/hide in the preview (and export)',
      'Zu diesem Zeitpunkt springen': 'Jump to this point in time',
      'Ausgangszustand kann nicht deaktiviert werden': 'The initial state cannot be disabled',
      'Diese Änderung ein-/ausschließen, ohne spätere Änderungen zu verlieren': 'Include/exclude this change without losing later changes',
      'Kein Element ausgewählt. Wähle ein Element auf dem Label oder füge über die Werkzeugleiste eines hinzu.': 'No element selected. Select an element on the label or add one with the toolbar.',
      'Erklärte Ansicht – ZPL lernen': 'Explained view – learn ZPL',
      'Live erzeugter ZPL-Code. Du kannst ihn hier bearbeiten und auf „Übernehmen“ klicken, um das Label neu zu laden – praktisch für ZPL-Befehle, die der visuelle Editor nicht abbildet.': 'Live-generated ZPL code. You can edit it here and click “Apply” to reload the label — useful for ZPL commands that the visual editor does not represent.',
      'Basis (Box, Text, Barcode)': 'Basic (box, text, barcode)',
      'Mit Variablen ($NAME$)': 'With variables ($NAME$)',
      'Mit mehreren Barcodes': 'With multiple barcodes',
      'Reihenfolge entspricht der Druckreihenfolge – unten in der Liste wird zuerst gedruckt, oben zuletzt (also vorne). Ziehen zum Umsortieren, Auge zum Aus-/Einblenden in der Vorschau (wird nicht mitgedruckt), Name zum Umbenennen.': 'The order matches print order — the bottom item prints first and the top item last (in front). Drag to reorder; use the eye to show/hide an item in the preview (it is not printed); rename with the name field.',
      'Nicht befüllte Platzhalter in der Vorschau als leer anzeigen': 'Show unfilled placeholders as empty in the preview',
      'Ersetzt einen Platzhalternamen in allen Text- und Barcode-Feldern des Labels – praktisch, wenn sich ein Feldname ändert.': 'Replaces a placeholder name in every text and barcode field of the label — useful when a field name changes.',
      'Jeder in diesem Etikett verwendete ZPL-Befehl, kurz erklärt. Im Code oben zeigt der Mauszeiger über einem hervorgehobenen Befehl dieselbe Erklärung als Tooltip.': 'A short explanation of every ZPL command used in this label. In the code above, hovering a highlighted command shows the same explanation as a tooltip.',
      'Vorlagen werden aus dem geöffneten Ordner (siehe oben, „Ordner öffnen…“) übernommen, oder hier manuell hochgeladen.': 'Templates are taken from the open folder (see “Open folder…” above) or uploaded here manually.',
      'Neues leeres Label': 'New empty label',
      'Zurück in die geöffnete Datei speichern': 'Save back to the opened file',
      'Als .zpl-Datei herunterladen': 'Download as a .zpl file',
      'Label als Bild oder PDF exportieren': 'Export label as an image or PDF',
      'Über den konfigurierten Backend-Dienst drucken': 'Print through the configured backend service',
      'Rückgängig (Strg+Z)': 'Undo (Ctrl+Z)',
      'Wiederholen (Strg+Y)': 'Redo (Ctrl+Y)',
      'Gitterweite in Dots': 'Grid spacing in dots',
      'Aktuelles Label mit einem anderen vergleichen (aus der Bibliothek oder per Upload)': 'Compare the current label with another one (from the library or upload)',
      'Exakte Druckvorschau über den öffentlichen Labelary-Dienst abrufen (sendet den ZPL-Code an labelary.com)': 'Request an exact print preview from the public Labelary service (sends ZPL code to labelary.com)',
      'Tastaturkürzel anzeigen': 'Show keyboard shortcuts',
      'Auswählen / Verschieben': 'Select / move',
      'Textfeld hinzufügen': 'Add text field',
      'Barcode hinzufügen': 'Add barcode',
      'Box hinzufügen': 'Add box',
      'Kreis hinzufügen': 'Add circle',
      'Linie hinzufügen (Diagonale/Horizontale/Vertikale)': 'Add line (diagonal/horizontal/vertical)',
      'Ellipse hinzufügen': 'Add ellipse',
      'Grafik / Logo einfügen': 'Insert graphic / logo',
      'Ordner mit .zpl-Dateien öffnen (wenn vom Browser unterstützt)': 'Open a folder with .zpl files (if supported by the browser)',
      'Einzelne .zpl-Datei öffnen': 'Open a single .zpl file',
      'Ein eingebautes Beispiel-Label laden, um den Editor auszuprobieren': 'Load a built-in sample label to try the editor',
      'Werte aus einer Variablen-XML (z. B. einem „Variables“-Export) übernehmen': 'Import values from variables XML (for example a “Variables” export)',
      '<Variables>…</Variables> hier einfügen…': 'Paste <Variables>…</Variables> here…',
      'X (Dots)': 'X (dots)',
      'Y (Dots)': 'Y (dots)',
      'Ankerpunkt': 'Anchor point',
      'Breite (0=auto)': 'Width (0 = auto)',
      'Daten': 'Data',
      'Modulbreite': 'Module width',
      'Verhältnis': 'Ratio',
      'Linienstärke': 'Line thickness',
      'Farbe': 'Color',
      'Eckenrundung (0&ndash;8)': 'Corner rounding (0–8)',
      'Durchmesser (Dots)': 'Diameter (dots)',
      'Richtung': 'Direction',
      'Vergrößerung X (1&ndash;10)': 'Magnification X (1–10)',
      'Vergrößerung Y (1&ndash;10)': 'Magnification Y (1–10)',
      'Blockbreite (Dots)': 'Block width (dots)',
      'Max. Zeilen (0=unbegrenzt)': 'Max. lines (0 = unlimited)',
      'Zeilenabstand (Dots)': 'Line spacing (dots)',
      'Hängender Einzug (Dots)': 'Hanging indent (dots)',
      'Medientransport (^MM)': 'Media tracking (^MM)',
      'Home-Offset (^LH x,y)': 'Home offset (^LH x,y)',
      'Label-Verschiebung Y (^LS)': 'Label shift Y (^LS)',
      'Zeichensatz (^CI)': 'Character set (^CI)',
      'Druckdunkelheit (~SD, 0&ndash;30, leer = unver&auml;ndert)': 'Print darkness (~SD, 0–30, empty = unchanged)',
      'Druckgeschwindigkeit (^PR, leer = unver&auml;ndert)': 'Print speed (^PR, empty = unchanged)',
      'Notiz (wird im Label mitgespeichert, nicht gedruckt)': 'Note (saved with the label, not printed)',
      'Farbkanal': 'Color channel',
      'Dithering': 'Dithering',
      'Schwarz': 'Black',
      'Weiß': 'White',
      'Links': 'Left',
      'Zentriert': 'Centered',
      'Rechts': 'Right',
      'Blocksatz': 'Justified',
      'Normal (0°)': 'Normal (0°)',
      '90° gedreht': 'Rotated 90°',
      '180° gedreht': 'Rotated 180°',
      '270° gedreht': 'Rotated 270°',
      'In den Vordergrund': 'Bring to front',
      'In den Hintergrund': 'Send to back',
      'Element löschen': 'Delete element',
      'Ausgewählte löschen': 'Delete selected',
      'Ausrichten': 'Align',
      'Gruppieren': 'Group',
      'Gruppierung aufheben': 'Ungroup',
      'Horizontal verteilen': 'Distribute horizontally',
      'Vertikal verteilen': 'Distribute vertically',
      'Bild ersetzen…': 'Replace image…',
      'Komprimiert speichern (RLE)': 'Save compressed (RLE)',
      'Invertiert (weiß auf schwarz)': 'Inverted (white on black)',
      'Textblock (mehrzeilig / ^FB)': 'Text block (multiline / ^FB)',
      'Beim Export beibehalten': 'Keep when exporting',
      'Eigene Maße…': 'Custom dimensions…',
      'Prüfziffer': 'Check digit',
      'Modus (Code128)': 'Mode (Code 128)',
      'Klartextzeile anzeigen': 'Show human-readable line',
      'Klartextzeile oberhalb': 'Human-readable line above',
      'Qualität / ECC': 'Quality / ECC',
      'Spalten (0 = automatisch)': 'Columns (0 = automatic)',
      'Zeilen (0 = automatisch)': 'Rows (0 = automatic)',
      'Format-ID': 'Format ID',
      'Escape-Zeichen': 'Escape character',
      'Seitenverhältnis (1=quadratisch, 2=rechteckig)': 'Aspect ratio (1 = square, 2 = rectangular)',
      'Vergrößerung (1–10)': 'Magnification (1–10)',
      'Fehlerkorrektur/Symbolgröße': 'Error correction / symbol size',
      'Menü-Symbol (Bordkarten)': 'Menu symbol (boarding passes)',
      'Gruppengröße (1–26)': 'Group size (1–26)',
      'Gruppen-ID': 'Group ID',
      'ECI (erweiterte Zeichenkodierung)': 'ECI (extended character encoding)',
      'Symbolnummer': 'Symbol number',
      'Gruppengröße (Symbole gesamt)': 'Group size (total symbols)',
    },
    fr: {
      'app.title': 'ZPL-Studio',
      'hint.variables': 'Les espaces réservés au format <code>$NAME$</code> sont détectés automatiquement (par exemple depuis des exports XML). Saisissez ici des valeurs d’exemple pour tester l’aperçu ; les espaces réservés restent inchangés lors de l’export.',
      'hint.merge-intro': 'Publipostage : chargez un fichier CSV ou XLSX &ndash; une étiquette est créée pour chaque ligne en remplaçant les espaces réservés <code>$NOM_COLONNE$</code> (comme dans l’onglet &laquo; Variables &raquo;) par la valeur de cellule correspondante. Imprimez ensuite en ZPL pour une imprimante Zebra ou sur une feuille A4 avec plusieurs étiquettes.',
      'hint.merge-zpl-output': 'Crée un document ZPL contenant toutes les étiquettes à la suite (<code>^XA…^XZ</code> par ligne).',
      'hint.merge-backend-print': 'Avec un backend ZPL configuré, &laquo; Imprimer directement &raquo; ouvre la sélection d’imprimante sécurisée du backend et envoie le publipostage directement à l’imprimante Zebra choisie. Sans backend, la boîte de dialogue d’impression du système s’ouvre. Cela n’est fiable que si l’imprimante est configurée pour transmettre le ZPL sans modification ; sinon le code ZPL peut être imprimé comme du texte au lieu d’être interprété par l’imprimante.',
      'history.initial': 'État initial',
      'history.change': 'Modification',
      'history.added.one': '{element} ajouté',
      'history.added.other': '{count} éléments ajoutés',
      'history.removed.one': '{element} supprimé',
      'history.removed.other': '{count} éléments supprimés',
      'history.changed.one': '{element} : {field} modifié',
      'history.changed.other': '{count} éléments modifiés',
      'history.settings': 'Paramètres de l’étiquette modifiés',
      'history.graphics': 'Données graphiques modifiées',
      'history.properties': '{count} propriétés',
      'print.sent': 'Envoyé{job}.',
      'print.job': ' (tâche {jobId})',
      'print.failed': 'Échec : {error}',
      'print.sending': 'Envoi…',
      'print.copies.invalid': 'Saisissez une quantité comprise entre 1 et 99.',
      'print.error.busy': 'L’imprimante traite encore une autre tâche. Attendez un instant, puis réessayez.',
      'print.error.printer-not-found': 'L’imprimante sélectionnée n’est plus disponible. Rechargez la liste des imprimantes.',
      'print.error.backend-unavailable': 'Le service d’impression est indisponible. L’éditeur reste utilisable localement dans le navigateur.',
      'print.error.delivery-failed': 'La tâche n’a pas pu être transmise à l’imprimante. Vérifiez son état et renvoyez-la si nécessaire.',
      'print.error.delivery-unknown': 'La tâche d’impression est peut-être déjà arrivée à l’imprimante. Vérifiez avant de la renvoyer.',
      'print.single.hint': 'Envoie cette étiquette à une imprimante via le service backend configuré.',
      'print.batch.hint': '{count} étiquette(s) préparée(s) seront envoyées en publipostage via le service backend configuré.',
      'print.pq.notice': ' Le backend applique la quantité une seule fois ; une quantité <code>^PQ</code> existante est normalisée à une copie à cette fin.',
      'print.raster': 'Imprimer l’image',
      'print.raster.title': 'Imprimer l’étiquette comme image via la boîte de dialogue système',
      'print.popup-blocked': 'La boîte de dialogue d’impression n’a pas pu être ouverte. Autorisez les fenêtres contextuelles pour cette page.',
      'print.printer-search': 'Rechercher une imprimante…',
      'print.printer-count': '{count} imprimante(s) sur {total}',
      'print.no-printers-match': 'Aucune imprimante correspondante.',
      'raster.blocked': 'Sortie raster interrompue : {reasons}. Envoyez plutôt cette étiquette en ZPL à une imprimante compatible.',
      'raster.warning': 'Contrôle du code-barres : {reasons}.\n\nExporter quand même en image raster ?',
      'raster.lossy-format': 'JPG et GIF ne sont pas fiables pour scanner des étiquettes à codes-barres. Utilisez PNG ou PDF.',
      'raster.too-large': 'L’étiquette est trop grande pour une sortie raster fiable. Réduisez sa taille ou imprimez-la directement en ZPL.',
      'raster.reason.unrendered-zpl': 'des commandes ZPL non rendables',
      'raster.reason.placeholder-barcode': 'un code 2D disponible seulement en aperçu',
      'raster.reason.barcode-control-prefix': 'des données de contrôle Code 128 ne peuvent pas être rasterisées de manière sûre',
      'raster.reason.invalid-barcode': 'au moins un code-barres non valide',
      'raster.reason.module-too-small': 'au moins une largeur de module très faible',
      'raster.reason.inverse-barcode': 'un code-barres inversé nécessite un scanner compatible',
      'raster.reason.edge-quiet-zone': 'un code-barres est trop près du bord de l’étiquette',
      'toast.saved': 'Enregistré : {name}',
      'toast.labels-exported': '{count} étiquette(s) exportée(s) en ZPL.',
      'toast.labels-generating': 'Préparation de {count} étiquette(s) pour l’impression…',
      'toast.no-print-rows': 'Aucune ligne à imprimer n’a été trouvée.',
      'toast.history-excluded': 'Cette modification est exclue — affichage de l’état précédent.',
      'file.unknown-error': 'erreur inconnue',
      'sheet.count': '{count} par feuille',
      'library.folder-unsupported': 'Ce navigateur ne prend pas en charge les dossiers. Utilisez plutôt « Ouvrir un fichier… ».',
      'library.load-failed': 'La bibliothèque n’a pas pu être chargée : {error}',
      'library.server-templates': 'Modèles du serveur : {count}',
      'library.folder': 'Dossier : {name}',
      'library.no-files': '(aucun fichier .zpl trouvé)',

      'Neu': 'Nouveau',
      'Speichern': 'Enregistrer',
      'Herunterladen': 'Télécharger',
      'Exportieren als…': 'Exporter au format…',
      'Drucken…': 'Imprimer…',
      'Drucken': 'Imprimer',
      'Rückgängig': 'Annuler',
      'Wiederholen': 'Rétablir',
      'Verkleinern': 'Réduire le zoom',
      'Vergrößern': 'Agrandir le zoom',
      'Einpassen': 'Ajuster',
      'Gitter': 'Grille',
      'Beispieldaten anzeigen': 'Afficher les données d’exemple',
      'Vergleichen…': 'Comparer…',
      'Exakte Vorschau…': 'Aperçu exact…',
      'Sprache': 'Langue',
      'Deutsch': 'Allemand',
      'Englisch': 'Anglais',
      'Französisch': 'Français',
      'Werkzeuge': 'Outils',
      'Auswahl': 'Sélection',
      'Text': 'Texte',
      'Barcode': 'Code-barres',
      'Box': 'Rectangle',
      'Kreis': 'Cercle',
      'Linie': 'Ligne',
      'Ellipse': 'Ellipse',
      'Grafik': 'Graphique',
      'Bibliothek': 'Bibliothèque',
      'Ordner, Dateien & Beispiele': 'Dossiers, fichiers et exemples',
      'Ordner öffnen…': 'Ouvrir un dossier…',
      'Datei öffnen…': 'Ouvrir un fichier…',
      'Beispiel laden…': 'Charger un exemple…',
      'Kein Ordner geöffnet': 'Aucun dossier ouvert',
      'Eigenschaften': 'Propriétés',
      'Ebenen': 'Calques',
      'Variablen': 'Variables',
      'ZPL-Code': 'Code ZPL',
      'Seriendruck': 'Publipostage',
      'Verlauf': 'Historique',
      'Vorschau': 'Aperçu',
      'Übernehmen': 'Appliquer',
      'Code': 'Code',
      'Befehle in diesem Label': 'Commandes de cette étiquette',
      'Datenquelle': 'Source de données',
      'Vorlage': 'Modèle',
      'Ausgabe: Zebra-Drucker (ZPL)': 'Sortie : imprimante Zebra (ZPL)',
      'Ausgabe: A4-Bogen (normaler Drucker)': 'Sortie : feuille A4 (imprimante standard)',
      'Etikettenbogen': 'Feuille d’étiquettes',
      'CSV/XLSX-Datei wählen…': 'Choisir un fichier CSV/XLSX…',
      'Keine Datei geladen': 'Aucun fichier chargé',
      'Tabellenblatt': 'Feuille',
      'Vorlagen-Dateien wählen…': 'Choisir des fichiers modèles…',
      'Noch keine Daten geladen.': 'Aucune donnée chargée pour le moment.',
      'ZPL herunterladen': 'Télécharger le ZPL',
      'Direkt drucken…': 'Imprimer directement…',
      'A4-Bogen drucken / als PDF speichern…': 'Imprimer la feuille A4 / enregistrer en PDF…',
      'Schließen': 'Fermer',
      'Abbrechen': 'Annuler',
      'Löschen': 'Supprimer',
      'Duplizieren': 'Dupliquer',
      'Position': 'Position',
      'Abmessungen': 'Dimensions',
      'Druckeinstellungen': 'Paramètres d’impression',
      'Änderungsnotiz': 'Note de modification',
      'Inhalt': 'Contenu',
      'Schrift': 'Police',
      'Ausrichtung': 'Orientation',
      'Typ': 'Type',
      'Breite (Dots)': 'Largeur (points)',
      'Höhe (Dots)': 'Hauteur (points)',
      'Drucker-DPI': 'DPI de l’imprimante',
      'Benutzerdefiniert': 'Personnalisé',
      'Klein (8,5 × 5,5 cm)': 'Petit (8,5 × 5,5 cm)',
      'Groß (10 × 15 cm)': 'Grand (10 × 15 cm)',
      'Drucker': 'Imprimante',
      'Ziel': 'Destination',
      'Anzahl': 'Quantité',
      'Durchläufe': 'Exécutions',
      'Drucker werden geladen…': 'Chargement des imprimantes…',
      'Keine Drucker vom Backend gemeldet.': 'Le backend n’a signalé aucune imprimante.',
      'Erneut versuchen': 'Réessayer',
      'Drucker-ID (optional)': 'ID d’imprimante (facultatif)',
      '(Drucker auswählen…)': '(Choisir une imprimante…)',
      '(Backend-Standard)': '(Par défaut du backend)',
      'Druckerliste konnte nicht geladen werden:': 'La liste des imprimantes n’a pas pu être chargée :',
      'anzeigen': 'afficher',
      'Änderung': 'Modification',
      'Backend-Standarddrucker, falls leer': 'Imprimante par défaut du backend si vide',
      'Zebra-Drucker (ZPL)': 'Imprimante Zebra (ZPL)',
      'Anderer Drucker (Rasterbild)': 'Autre imprimante (image matricielle)',
      'Etikettenserver (XML)': 'Serveur d’étiquettes (XML)',
      'Format kopieren': 'Copier le format',
      'Format einfügen': 'Coller le format',
      'Keine Elemente auf diesem Label.': 'Aucun élément sur cette étiquette.',
      'Kein Verlauf.': 'Aucun historique.',
      'Keine Platzhalter im Format $NAME$ im aktuellen Label gefunden.': 'Aucun espace réservé $NAME$ trouvé dans l’étiquette actuelle.',
      'Beispielwert…': 'Valeur d’exemple…',
      'Oder XML einfügen': 'Ou coller du XML',
      'XML-Datei laden…': 'Charger un fichier XML…',
      'Platzhalter umbenennen': 'Renommer les espaces réservés',
      'Von': 'De',
      'Zu': 'Vers',
      'Umbenennen': 'Renommer',
      'Aktuelles Label für alle Zeilen verwenden': 'Utiliser l’étiquette actuelle pour toutes les lignes',
      'Vorlagen-Datei pro Zeile aus einer Spalte wählen': 'Choisir un fichier modèle par ligne depuis une colonne',
      'Spalte mit Dateiname': 'Colonne contenant le nom de fichier',
      'Spalten': 'Colonnes',
      'Zeilen': 'Lignes',
      'Label-Breite (mm)': 'Largeur de l’étiquette (mm)',
      'Label-Höhe (mm)': 'Hauteur de l’étiquette (mm)',
      'Rand links (mm)': 'Marge gauche (mm)',
      'Rand oben (mm)': 'Marge supérieure (mm)',
      'Abstand horizontal (mm)': 'Espacement horizontal (mm)',
      'Abstand vertikal (mm)': 'Espacement vertical (mm)',
      'Neue leere Label erstellen? Nicht gespeicherte Änderungen gehen verloren.': 'Créer une nouvelle étiquette vide ? Les modifications non enregistrées seront perdues.',
      'Beispiel-Label laden? Nicht gespeicherte Änderungen am aktuellen Label gehen verloren.': 'Charger une étiquette d’exemple ? Les modifications non enregistrées de l’étiquette actuelle seront perdues.',
      'Bild ersetzen': 'Remplacer l’image',
      'Grafik importieren': 'Importer un graphique',
      'Label vergleichen': 'Comparer les étiquettes',
      'Exakte Vorschau (labelary.com)': 'Aperçu exact (labelary.com)',
      'Tastaturkürzel': 'Raccourcis clavier',
      'Seriendruck drucken': 'Imprimer le publipostage',
      'Wird geladen…': 'Chargement…',
      'ZPL-Code übernommen.': 'Code ZPL appliqué.',
      'Format kopiert.': 'Format copié.',
      'Format eingefügt.': 'Format collé.',
      'Bild konnte nicht geladen werden.': 'L’image n’a pas pu être chargée.',
      'Bitte zuerst XML in das Textfeld einfügen.': 'Collez d’abord le XML dans le champ de texte.',
      'Keine Zeilen zum Drucken gefunden.': 'Aucune ligne à imprimer n’a été trouvée.',
      'Popup wurde vom Browser blockiert. Bitte Popups für diese Seite erlauben.': 'Le navigateur a bloqué une fenêtre contextuelle. Autorisez les fenêtres contextuelles pour cette page puis réessayez.',
      'Ziehen zum Umsortieren': 'Faire glisser pour réordonner',
      'In der Vorschau (und beim Export) ein-/ausblenden': 'Afficher/masquer dans l’aperçu (et l’export)',
      'Zu diesem Zeitpunkt springen': 'Aller à ce moment',
      'Ausgangszustand kann nicht deaktiviert werden': 'L’état initial ne peut pas être désactivé',
      'Diese Änderung ein-/ausschließen, ohne spätere Änderungen zu verlieren': 'Inclure/exclure cette modification sans perdre les suivantes',
      'Kein Element ausgewählt. Wähle ein Element auf dem Label oder füge über die Werkzeugleiste eines hinzu.': 'Aucun élément sélectionné. Sélectionnez un élément sur l’étiquette ou ajoutez-en un via la barre d’outils.',
      'Erklärte Ansicht – ZPL lernen': 'Vue expliquée – apprendre le ZPL',
      'Live erzeugter ZPL-Code. Du kannst ihn hier bearbeiten und auf „Übernehmen“ klicken, um das Label neu zu laden – praktisch für ZPL-Befehle, die der visuelle Editor nicht abbildet.': 'Code ZPL généré en direct. Vous pouvez le modifier ici et cliquer sur « Appliquer » pour recharger l’étiquette — pratique pour les commandes ZPL que l’éditeur visuel ne représente pas.',
      'Basis (Box, Text, Barcode)': 'Base (rectangle, texte, code-barres)',
      'Mit Variablen ($NAME$)': 'Avec des variables ($NAME$)',
      'Mit mehreren Barcodes': 'Avec plusieurs codes-barres',
      'Reihenfolge entspricht der Druckreihenfolge – unten in der Liste wird zuerst gedruckt, oben zuletzt (also vorne). Ziehen zum Umsortieren, Auge zum Aus-/Einblenden in der Vorschau (wird nicht mitgedruckt), Name zum Umbenennen.': 'L’ordre correspond à l’ordre d’impression : l’élément en bas est imprimé en premier, celui en haut en dernier (au premier plan). Faites glisser pour réordonner ; utilisez l’œil pour afficher ou masquer un élément dans l’aperçu (il ne sera pas imprimé) ; renommez-le avec son champ de nom.',
      'Nicht befüllte Platzhalter in der Vorschau als leer anzeigen': 'Afficher les espaces réservés non remplis comme vides dans l’aperçu',
      'Ersetzt einen Platzhalternamen in allen Text- und Barcode-Feldern des Labels – praktisch, wenn sich ein Feldname ändert.': 'Remplace un nom d’espace réservé dans tous les champs texte et code-barres de l’étiquette — pratique lorsqu’un nom de champ change.',
      'Jeder in diesem Etikett verwendete ZPL-Befehl, kurz erklärt. Im Code oben zeigt der Mauszeiger über einem hervorgehobenen Befehl dieselbe Erklärung als Tooltip.': 'Une brève explication de chaque commande ZPL utilisée dans cette étiquette. Dans le code ci-dessus, le survol d’une commande mise en évidence affiche la même explication dans une infobulle.',
      'Vorlagen werden aus dem geöffneten Ordner (siehe oben, „Ordner öffnen…“) übernommen, oder hier manuell hochgeladen.': 'Les modèles sont repris depuis le dossier ouvert (voir « Ouvrir un dossier… » ci-dessus) ou chargés ici manuellement.',
      'Neues leeres Label': 'Nouvelle étiquette vide',
      'Zurück in die geöffnete Datei speichern': 'Enregistrer dans le fichier ouvert',
      'Als .zpl-Datei herunterladen': 'Télécharger comme fichier .zpl',
      'Label als Bild oder PDF exportieren': 'Exporter l’étiquette comme image ou PDF',
      'Über den konfigurierten Backend-Dienst drucken': 'Imprimer via le service backend configuré',
      'Rückgängig (Strg+Z)': 'Annuler (Ctrl+Z)',
      'Wiederholen (Strg+Y)': 'Rétablir (Ctrl+Y)',
      'Gitterweite in Dots': 'Espacement de la grille en points',
      'Aktuelles Label mit einem anderen vergleichen (aus der Bibliothek oder per Upload)': 'Comparer l’étiquette actuelle à une autre (bibliothèque ou import)',
      'Exakte Druckvorschau über den öffentlichen Labelary-Dienst abrufen (sendet den ZPL-Code an labelary.com)': 'Demander un aperçu d’impression exact au service public Labelary (envoie le code ZPL à labelary.com)',
      'Tastaturkürzel anzeigen': 'Afficher les raccourcis clavier',
      'Auswählen / Verschieben': 'Sélectionner / déplacer',
      'Textfeld hinzufügen': 'Ajouter un champ texte',
      'Barcode hinzufügen': 'Ajouter un code-barres',
      'Box hinzufügen': 'Ajouter un rectangle',
      'Kreis hinzufügen': 'Ajouter un cercle',
      'Linie hinzufügen (Diagonale/Horizontale/Vertikale)': 'Ajouter une ligne (diagonale/horizontale/verticale)',
      'Ellipse hinzufügen': 'Ajouter une ellipse',
      'Grafik / Logo einfügen': 'Insérer un graphique / logo',
      'Ordner mit .zpl-Dateien öffnen (wenn vom Browser unterstützt)': 'Ouvrir un dossier avec des fichiers .zpl (si le navigateur le permet)',
      'Einzelne .zpl-Datei öffnen': 'Ouvrir un seul fichier .zpl',
      'Ein eingebautes Beispiel-Label laden, um den Editor auszuprobieren': 'Charger une étiquette d’exemple intégrée pour essayer l’éditeur',
      'Werte aus einer Variablen-XML (z. B. einem „Variables“-Export) übernehmen': 'Importer les valeurs depuis un XML de variables (par exemple un export « Variables »)',
      '<Variables>…</Variables> hier einfügen…': 'Collez <Variables>…</Variables> ici…',
      'X (Dots)': 'X (points)',
      'Y (Dots)': 'Y (points)',
      'Ankerpunkt': 'Point d’ancrage',
      'Breite (0=auto)': 'Largeur (0 = auto)',
      'Daten': 'Données',
      'Modulbreite': 'Largeur de module',
      'Verhältnis': 'Rapport',
      'Linienstärke': 'Épaisseur de ligne',
      'Farbe': 'Couleur',
      'Eckenrundung (0&ndash;8)': 'Arrondi des angles (0–8)',
      'Durchmesser (Dots)': 'Diamètre (points)',
      'Richtung': 'Direction',
      'Vergrößerung X (1&ndash;10)': 'Agrandissement X (1–10)',
      'Vergrößerung Y (1&ndash;10)': 'Agrandissement Y (1–10)',
      'Blockbreite (Dots)': 'Largeur du bloc (points)',
      'Max. Zeilen (0=unbegrenzt)': 'Nb. maximal de lignes (0 = illimité)',
      'Zeilenabstand (Dots)': 'Interligne (points)',
      'Hängender Einzug (Dots)': 'Retrait suspendu (points)',
      'Medientransport (^MM)': 'Mode média (^MM)',
      'Home-Offset (^LH x,y)': 'Décalage d’origine (^LH x,y)',
      'Label-Verschiebung Y (^LS)': 'Décalage vertical de l’étiquette (^LS)',
      'Zeichensatz (^CI)': 'Jeu de caractères (^CI)',
      'Druckdunkelheit (~SD, 0&ndash;30, leer = unver&auml;ndert)': 'Intensité d’impression (~SD, 0–30, vide = inchangé)',
      'Druckgeschwindigkeit (^PR, leer = unver&auml;ndert)': 'Vitesse d’impression (^PR, vide = inchangé)',
      'Notiz (wird im Label mitgespeichert, nicht gedruckt)': 'Note (enregistrée avec l’étiquette, non imprimée)',
      'Farbkanal': 'Canal de couleur',
      'Dithering': 'Tramage',
      'Schwarz': 'Noir',
      'Weiß': 'Blanc',
      'Links': 'Gauche',
      'Zentriert': 'Centré',
      'Rechts': 'Droite',
      'Blocksatz': 'Justifié',
      'Normal (0°)': 'Normal (0°)',
      '90° gedreht': 'Rotation de 90°',
      '180° gedreht': 'Rotation de 180°',
      '270° gedreht': 'Rotation de 270°',
      'In den Vordergrund': 'Mettre au premier plan',
      'In den Hintergrund': 'Envoyer à l’arrière-plan',
      'Element löschen': 'Supprimer l’élément',
      'Ausgewählte löschen': 'Supprimer la sélection',
      'Ausrichten': 'Aligner',
      'Gruppieren': 'Grouper',
      'Gruppierung aufheben': 'Dissocier',
      'Horizontal verteilen': 'Répartir horizontalement',
      'Vertikal verteilen': 'Répartir verticalement',
      'Bild ersetzen…': 'Remplacer l’image…',
      'Komprimiert speichern (RLE)': 'Enregistrer compressé (RLE)',
      'Invertiert (weiß auf schwarz)': 'Inversé (blanc sur noir)',
      'Textblock (mehrzeilig / ^FB)': 'Bloc de texte (multiligne / ^FB)',
      'Beim Export beibehalten': 'Conserver à l’export',
      'Eigene Maße…': 'Dimensions personnalisées…',
      'Prüfziffer': 'Chiffre de contrôle',
      'Modus (Code128)': 'Mode (Code 128)',
      'Klartextzeile anzeigen': 'Afficher la ligne lisible',
      'Klartextzeile oberhalb': 'Ligne lisible au-dessus',
      'Qualität / ECC': 'Qualité / ECC',
      'Spalten (0 = automatisch)': 'Colonnes (0 = automatique)',
      'Zeilen (0 = automatisch)': 'Lignes (0 = automatique)',
      'Format-ID': 'ID de format',
      'Escape-Zeichen': 'Caractère d’échappement',
      'Seitenverhältnis (1=quadratisch, 2=rechteckig)': 'Rapport d’aspect (1 = carré, 2 = rectangulaire)',
      'Vergrößerung (1–10)': 'Agrandissement (1–10)',
      'Fehlerkorrektur/Symbolgröße': 'Correction d’erreur / taille du symbole',
      'Menü-Symbol (Bordkarten)': 'Symbole de menu (cartes d’embarquement)',
      'Gruppengröße (1–26)': 'Taille de groupe (1–26)',
      'Gruppen-ID': 'ID de groupe',
      'ECI (erweiterte Zeichenkodierung)': 'ECI (codage étendu des caractères)',
      'Symbolnummer': 'Numéro de symbole',
      'Gruppengröße (Symbole gesamt)': 'Taille de groupe (total des symboles)',
    },
  };

  function normalize(locale) {
    const candidate = String(locale || '').toLowerCase().split('-')[0];
    return SUPPORTED.indexOf(candidate) !== -1 ? candidate : null;
  }

  function format(text, params) {
    if (!params) return text;
    return String(text).replace(/\{([a-zA-Z0-9_]+)\}/g, function (all, name) {
      return Object.prototype.hasOwnProperty.call(params, name) ? String(params[name]) : all;
    });
  }

  function sourceFor(key) {
    const german = messages.de[key];
    return german == null ? String(key) : german;
  }

  function t(key, params) {
    const translated = (messages[current] && messages[current][key]);
    return format(translated == null ? sourceFor(key) : translated, params);
  }

  function plural(key, count, params) {
    const category = new Intl.PluralRules(LOCALE_TAGS[current]).select(Number(count));
    const base = (messages[current] && messages[current][key + '.' + category]) != null
      ? key + '.' + category
      : key + '.other';
    return t(base, Object.assign({ count: count }, params || {}));
  }

  function lookupPlain(value) {
    const catalog = messages[current] || {};
    return Object.prototype.hasOwnProperty.call(catalog, value) ? catalog[value] : value;
  }

  function nodesWithin(root, selector) {
    const nodes = [];
    if (root && root.nodeType === 1 && root.matches(selector)) nodes.push(root);
    if (root && root.querySelectorAll) root.querySelectorAll(selector).forEach(function (node) { nodes.push(node); });
    return nodes;
  }

  function translateDataAttributes(root) {
    nodesWithin(root, '[data-i18n]').forEach(function (node) {
      // data-i18n is intentionally for simple textual elements only. Complex
      // controls use a child span, so no input/select state is ever replaced.
      node.textContent = t(node.getAttribute('data-i18n'));
    });
    nodesWithin(root, '[data-i18n-html]').forEach(function (node) {
      const source = node.getAttribute('data-i18n-html');
      const translated = t(source);
      // Keep the original DOM when a catalog has no translation for this
      // richer fragment. That is safer than flattening embedded <code> or
      // <strong> content merely because the UI was switched to another
      // locale. Entries that do have a translation can deliberately provide
      // a small, reviewed HTML fragment in the local catalog.
      if (translated !== source) node.innerHTML = translated;
    });
    ['title', 'aria-label', 'placeholder'].forEach(function (attr) {
      nodesWithin(root, '[data-i18n-' + attr + ']').forEach(function (node) {
        node.setAttribute(attr, t(node.getAttribute('data-i18n-' + attr)));
      });
    });
  }

  function originalAttribute(node, attr) {
    let stored = attributeSources.get(node);
    if (!stored) { stored = {}; attributeSources.set(node, stored); }
    if (!Object.prototype.hasOwnProperty.call(stored, attr)) stored[attr] = node.getAttribute(attr);
    return stored[attr];
  }

  function shouldSkipTextNode(node) {
    const parent = node.parentElement;
    if (!parent) return true;
    return !!parent.closest('script, style, textarea, pre, code, option, [contenteditable="true"]');
  }

  // Use this only for ephemeral UI fragments generated by app.js. It retains
  // each original German node/attribute in a WeakMap so switching EN → FR
  // works without rebuilding the document, and it never touches form values,
  // ZPL code or user data.
  function translateFragment(root) {
    if (!root) return;
    translateDataAttributes(root);
    ['title', 'aria-label', 'placeholder'].forEach(function (attr) {
      nodesWithin(root, '[' + attr + ']').forEach(function (node) {
        if (node.hasAttribute('data-i18n-' + attr)) return;
        const source = originalAttribute(node, attr);
        if (source != null) node.setAttribute(attr, lookupPlain(source));
      });
    });
    const walker = document.createTreeWalker(root, NodeFilter.SHOW_TEXT, {
      acceptNode: function (node) {
        return shouldSkipTextNode(node) || !node.nodeValue.trim() ? NodeFilter.FILTER_REJECT : NodeFilter.FILTER_ACCEPT;
      },
    });
    const textNodes = [];
    while (walker.nextNode()) textNodes.push(walker.currentNode);
    textNodes.forEach(function (node) {
      const source = textSources.has(node) ? textSources.get(node) : node.nodeValue;
      if (!textSources.has(node)) textSources.set(node, source);
      const lead = /^\s*/.exec(source)[0];
      const tail = /\s*$/.exec(source)[0];
      const body = source.slice(lead.length, source.length - tail.length);
      node.nodeValue = lead + lookupPlain(body) + tail;
    });
  }

  function translate(root) {
    translateDataAttributes(root || document);
  }

  function urlLocale() {
    try { return normalize(new URL(global.location.href).searchParams.get('lang')); } catch (e) { return null; }
  }

  function storedLocale() {
    try { return normalize(global.localStorage.getItem('zplStudioLocale')); } catch (e) { return null; }
  }

  function browserLocale() {
    return normalize((global.navigator && (global.navigator.languages && global.navigator.languages[0] || global.navigator.language)) || 'de');
  }

  function updateUrl(locale) {
    try {
      const url = new URL(global.location.href);
      url.searchParams.set('lang', locale);
      global.history.replaceState(global.history.state, '', url.pathname + url.search + url.hash);
    } catch (e) { /* A file:// or locked-down embed can still localize without changing its URL. */ }
  }

  function setLocale(locale, options) {
    const normalized = normalize(locale) || 'de';
    const changed = current !== normalized;
    current = normalized;
    try { global.localStorage.setItem('zplStudioLocale', current); } catch (e) { /* persistence is optional */ }
    document.documentElement.lang = current;
    document.title = t('app.title');
    const select = document.getElementById('languageSelect');
    if (select) select.value = current;
    translate(document);
    if (options && options.updateUrl) updateUrl(current);
    if (changed || (options && options.forceEvent)) {
      document.dispatchEvent(new CustomEvent('zpl-i18n-change', { detail: { locale: current } }));
    }
    return current;
  }

  function init() {
    const select = document.getElementById('languageSelect');
    if (select) select.addEventListener('change', function () { setLocale(select.value, { updateUrl: true }); });
    setLocale(urlLocale() || storedLocale() || browserLocale() || 'de');
  }

  global.ZPLStudioI18n = {
    supported: SUPPORTED.slice(),
    get locale() { return current; },
    localeTag: function () { return LOCALE_TAGS[current]; },
    t: t,
    plural: plural,
    translate: translate,
    translateFragment: translateFragment,
    setLocale: setLocale,
  };

  init();
})(window);
