# ZPLkit

ZPLkit besteht aus **ZPL-Studio**, einem browserbasierten Editor für Zebra-kompatible Etiketten, und einer JavaScript-Bibliothek zum Parsen und Erzeugen von ZPL.

Die Anwendung kann als statische Website betrieben werden oder mit dem mitgelieferten Go-Server um eine gemeinsame Vorlagenbibliothek und direkten Zebra-Druck ergänzt werden.

## Funktionen

- Etiketten visuell erstellen und bestehende ZPL-Dateien bearbeiten
- Text, Barcodes, Formen und Grafiken platzieren
- Etiketten zwischen Druckerauflösungen umrechnen (siehe unten)
- Maße in Dots oder Millimetern eingeben und anzeigen
- ZPL sowie PNG, JPG, GIF und PDF exportieren
- Seriendruck mit CSV- oder XLSX-Daten vorbereiten
- ZPL-Dateien vergleichen und ZPL-Befehle erläutern
- ZPLkit als eigenständige Browser- oder CommonJS-Bibliothek einbinden

## Druckerauflösung (DPI) umrechnen

Ein ZPL-Etikett enthält selbst keine Auflösung: jede Koordinate, Schrifthöhe,
Barcode-Höhe und jedes Grafikpixel darin ist ein Druckerpunkt (Dot). Dieselbe
Datei kommt auf einem 300-dpi-Druckkopf deshalb nur zwei Drittel so groß heraus
wie auf einem 203-dpi-Druckkopf. Ein Auflösungswechsel ist damit keine
Metadaten-Änderung, sondern eine Umrechnung aller Dot-Werte.

In den Etiketteneinstellungen führt jeder Wechsel der Drucker-DPI (sowie der
Knopf „Auf andere DPI umrechnen…“) deshalb in einen Dialog, der vorher zeigt,
was passieren würde:

- Vorher/Nachher aller betroffenen Werte, plus die physische Größe, die
  erhalten bleibt
- einzeln abwählbare Gruppen (Etikettengröße, Positionen/Formen, Schriften,
  Barcodes, Grafiken)
- Warnungen zu allem, was eine Umrechnung nicht sauber lösen kann: auf 1–10
  Dots begrenzte Barcode-Modulbreiten, Bitmap-Schriften mit fester
  Zeichenmatrix, MaxiCode mit fester physischer Größe, Treiber-Vorspann und
  nicht abgebildete ZPL-Befehle, die Dot-Werte enthalten könnten
- „Nur DPI-Angabe ändern“ als Ausweg, wenn die Dot-Werte bereits stimmen und
  nur die Annahme des Editors falsch war

Der Umrechnungsfaktor kommt aus den Druckkopfauflösungen in **Punkten pro
Millimeter**, nicht aus den gerundeten dpi-Zahlen: „203 dpi“ und „300 dpi“
heißen in Wirklichkeit 8 bzw. 12 Punkte/mm, der Faktor ist also exakt 1,5.
Mit 300/203 = 1,4778 würde jedes umgerechnete Etikett um ~1,5 % schrumpfen.
Deshalb ist „200 dpi“ hier derselbe Druckkopf wie „203 dpi“.

Weitere Stellen, an denen die Auflösung berücksichtigt wird:

- Beim Öffnen einer Datei mit der Endung `.200zpl`/`.300zpl` wird die darin
  genannte Auflösung übernommen; widerspricht der Dateiname der Einstellung,
  weist der Editor darauf hin. Der Download passt die Endung an.
- Ist im optionalen Druck-Backend die `dpi`-Spalte der Drucker-Registry
  gefüllt (siehe [`config/printers.csv.example`](config/printers.csv.example)),
  warnt der Druckdialog, wenn Etikett und gewählter Drucker unterschiedliche
  Auflösungen haben – und bietet die Umrechnung direkt an.
- Die Umrechnung selbst steckt in `zplkit/zpl-dpi.js` und ist damit auch ohne
  Studio nutzbar: `ZPLkit.convertDpi(label, 203, 300)`.

## Lokal starten

Voraussetzung ist Go 1.21 oder neuer.

```sh
go run .
```

Danach ist die Startseite unter <http://127.0.0.1:8080> und ZPL-Studio unter <http://127.0.0.1:8080/studio/> erreichbar. Für einen abweichenden Host oder Port:

```sh
go run . -addr 127.0.0.1:8081
```

Die statischen Dateien im Repository-Root können auch direkt über einen statischen Webserver ausgeliefert werden.

## Optionale Server-Funktionen

Der Go-Server stellt eine zentrale Vorlagenbibliothek bereit. Standardmäßig verwendet sie das Verzeichnis `templates`; mit dem folgenden Flag wählst du ein anderes Verzeichnis für `.zpl`-Dateien:

```sh
go run . -templates ./templates
```

Für den direkten Druck wird eine Drucker-Registry benötigt. Die Vorlage liegt unter [`config/printers.csv.example`](config/printers.csv.example). Lege daraus eine eigene CSV-Datei mit den erlaubten Druckern an und starte den Server beispielsweise so:

```sh
go run . -printers ./config/printers.csv
```

Der Server akzeptiert Druckaufträge ausschließlich für Drucker aus dieser Registry; Zieladresse und Port werden nicht vom Browser übergeben.

## ZPLkit als Bibliothek verwenden

Die fertigen Bundles liegen in `zplkit/dist/`:

- `zplkit-full.js` enthält den vollständigen Funktionsumfang.
- `zplkit-lite.js` enthält Parser, Generator, Modell und Barcode-Encoder.

```html
<script src="zplkit/dist/zplkit-full.js"></script>
<script>
  const label = ZPLkit.parse(zplText);
  const generatedZpl = ZPLkit.generate(label);
</script>
```

In CommonJS kann das Bundle direkt geladen werden:

```js
const ZPLkit = require('./zplkit/dist/zplkit-full.js');
```

Ein ausführbares Einbindungsbeispiel gibt es unter `zplkit/examples/library-demo.html`.

## Entwicklung

Go-Tests lassen sich mit folgendem Befehl ausführen:

```sh
go test ./...
```

Die DOM-freien JavaScript-Tests unter `test/` laufen direkt mit Node:

```sh
node test/dpi-convert.test.js
```

Wird eine Bibliotheksdatei in `zplkit/` geändert, aktualisiere die Bundles mit:

```sh
go run tools/bundle-lib.go
```

## Projektstruktur

- `studio/` – Editor-Oberfläche
- `zplkit/` – Parser, Generator und Browser-Bibliothek
- `zplkit/dist/` – veröffentlichte Bundles
- `main.go`, `printing.go`, `templates.go` – optionaler Go-Server
- `config/printers.csv.example` – Beispiel für die Drucker-Registry
