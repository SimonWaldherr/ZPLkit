# Variablen und Datensätze

Seit ZPLkit 1.6.0 ist `ZPLkit.Variables` in beiden Bundles enthalten.
Ohne Bundle genügt `zplkit/zpl-variables.js`; es stellt `ZPLVariables` bereit
und benötigt weder DOM noch andere Module. Studio verwendet dieses Modul
für Beispieldaten und den CSV/XLSX-Seriendruck.

## Beispiel

```js
const ZPLkit = require('../zplkit/dist/zplkit-lite.js');
const template = ZPLkit.parse(
  '^XA^FO20,20^A0N,30,20^FD$PRODUCT$ – $COUNT$ Stück^FS^XZ'
);
const options = {
  missing: 'error',
  fields: [
    { name: 'PRODUCT', type: 'string', required: true, maxLength: 60 },
    { name: 'COUNT', type: 'integer', default: 1, min: 1, max: 999 }
  ]
};
const row = { product: 'Schrauben', count: '25' };
const report = ZPLkit.Variables.resolve(template, row, options);
if (!report.valid) {
  console.error(report.errors);
} else {
  const label = ZPLkit.Variables.apply(template, row, options);
  const zpl = ZPLkit.generate(label);
  // template enthält weiterhin $PRODUCT$ und $COUNT$.
  console.log(zpl);
}
```

Felddefinitionen werden als `options.fields` übergeben. Sie werden nicht
in ZPL gespeichert. Studio nutzt zunächst die bestehende Bedienoberfläche;
ein Formular zum Bearbeiten dieser Definitionen ist noch nicht enthalten.

## API

| Funktion | Ergebnis |
| --- | --- |
| `discover(label)` | Alphabetisch sortierte, eindeutige Platzhalternamen aus Text- und Barcode-Inhalten. Die Schreibweise bleibt erhalten. |
| `lookup(row, name, options?)` | Passender eigener Datensatzwert oder `undefined`. |
| `resolve(label, row, options?)` | `{ valid, values, missing, errors }`, ohne das Label zu verändern. |
| `apply(label, row, options?)` | Vollständige Kopie des Labels mit ersetzten Text- und Barcode-Inhalten; Grafikbytes werden ebenfalls kopiert. |
| `substitute(text, row, options?)` | Ersetzt Platzhalter in einem einzelnen **Feldinhalt**. Nicht auf generiertes ZPL anwenden. |

`values` ist ein Objekt ohne Prototyp mit den aufgelösten Werten, adressiert
über die Schreibweise des jeweiligen Platzhalters. `missing` enthält Namen,
für die auch nach Berücksichtigung von Standardwerten kein Wert vorliegt.
`errors` enthält Einträge `{ name, code, message }`. Fehlercodes sind
`required`, `type`, `range` und `maxLength`.

`apply` und `substitute` werfen bei Validierungsfehlern einen Fehler mit
`name === 'VariableValidationError'` und einer `.errors`-Liste. Ungültige
Optionen oder Felddefinitionen führen zu einem `TypeError`, auch bei
`resolve`. Die englischen Meldungen sind für Entwickler gedacht;
Oberflächen können anhand von `code` eigene übersetzte Meldungen anzeigen.

## Platzhalter und Zuordnung

- Syntax: `$NAME$`; zulässige Namenszeichen sind `A–Z`, `a–z`, `0–9` und `_`.
- Standardmäßig wird ohne Beachtung der Groß-/Kleinschreibung zugeordnet.
  `caseSensitive: true` aktiviert die exakte Zuordnung.
- Ein exakt passender eigener Schlüssel mit einem Wert ungleich `undefined`
  hat Vorrang. Sonst wird bei unempfindlicher Zuordnung der erste passende
  Schlüssel in `Object.keys(row)` verwendet. Vererbte Eigenschaften werden
  nie als Daten gelesen.
- `undefined`, `null` und `''` gelten als fehlend. `0` und `false` sind Werte.
  Leerzeichen werden nicht automatisch aus Textwerten entfernt.
- Ersetzung erfolgt einmalig: Ein Wert `'$OTHER$'` wird unverändert eingefügt.
- Ohne Typdefinition sind Zeichenketten, endliche Zahlen und boolesche Werte
  erlaubt. Objekte, Arrays, Funktionen und nicht-endliche Zahlen werden
  abgewiesen. Zahlen und boolesche Werte werden erst beim Einsetzen in Text
  in Zeichenketten umgewandelt.
- Einstellungen, Rohbefehle, Grafiken und Barcode-Parameter werden nicht
  nach Platzhaltern durchsucht oder ersetzt.

## Fehlende Werte

| `options.missing` | Verhalten |
| --- | --- |
| `'keep'` (Standard) | Platzhalter bleibt sichtbar; fehlende optionale Werte machen den Bericht nicht ungültig. |
| `'empty'` | Platzhalter wird durch einen leeren Text ersetzt. |
| `'error'` | Fehlende Werte werden als Validierungsfehler gemeldet. |

`required: true` verlangt unabhängig von der gewählten Strategie einen Wert.
Ein `default` wird bei fehlenden oder leeren Eingaben eingesetzt und danach
wie jeder andere Wert validiert. Ein leerer Standardwert bleibt fehlend.
Alle definierten Felder werden validiert, auch wenn sie nicht im Label
vorkommen. Nicht definierte Platzhalter können weiterhin aus dem Datensatz
befüllt werden; Definitionen sind keine Positivliste.

## Felddefinitionen

Jedes Element von `options.fields` benötigt einen `name`. Doppelte Namen
unter der gewählten Groß-/Kleinschreibungsregel werden abgewiesen.

| Eigenschaft | Bedeutung |
| --- | --- |
| `type: 'string'` | Nur Zeichenketten. |
| `type: 'number'` | Endliche Zahl oder dezimale Zahlenzeichenkette, auch mit Exponent. Dezimalzeichen ist `.`; keine Tausendertrennzeichen. |
| `type: 'integer'` | Wie `number`, zusätzlich eine sichere ganze JavaScript-Zahl. |
| `type: 'boolean'` | `true`, `false`, `'true'` oder `'false'`. |
| `required` | Optionaler boolescher Pflichtfeldschalter. |
| `default` | Ersatzwert für fehlende Eingaben. |
| `min`, `max` | Inklusive numerische Grenzen, nur mit `number` oder `integer`. |
| `maxLength` | Maximale Länge der Textdarstellung in JavaScript-UTF-16-Codeeinheiten. |

Numerische Prüfung ändert den ursprünglichen Wert nicht: `'0007'` besteht
eine Ganzzahlprüfung und wird weiterhin mit führenden Nullen ausgegeben.
Der Unterschied zwischen `number` und `integer` betrifft die Prüfung,
nicht das Ausgabeformat.

## Erzeugung und Seriendruck

Immer **erst das Modell befüllen, dann ZPL erzeugen**. Der Generator übernimmt
die Maskierung von Zeichen wie `^` und `~` innerhalb der Datenfelder.
Das Variablenmodul interpretiert keine Formeln und führt keine Skripte aus.
Barcode-spezifische Inhaltsprüfung und Raster-Preflight sind weiterhin
separate Schritte; eine gültige Variable garantiert noch keinen gültigen Barcode.

```js
const labels = rows.map(row => ZPLkit.Variables.apply(template, row, options));
const zpl = labels.map(label => ZPLkit.generate(label)).join('\n');
```

Für einzelne Zeilenberichte zuerst `resolve` je Datensatz aufrufen und
Fehler zusammen mit der eigenen Zeilennummer anzeigen. Diese API druckt
nicht selbst und vergibt keine persistenten Seriennummern.
