# ZPLkit

ZPLkit besteht aus **ZPL-Studio**, einem browserbasierten Editor für Zebra-kompatible Etiketten, und einer JavaScript-Bibliothek zum Parsen und Erzeugen von ZPL.

Die Anwendung kann als statische Website betrieben werden oder mit dem mitgelieferten Go-Server um eine gemeinsame Vorlagenbibliothek und direkten Zebra-Druck ergänzt werden.

## Funktionen

- Etiketten visuell erstellen und bestehende ZPL-Dateien bearbeiten
- Text, Barcodes, Formen und Grafiken platzieren
- ZPL sowie PNG, JPG, GIF und PDF exportieren
- Seriendruck mit CSV- oder XLSX-Daten vorbereiten
- ZPL-Dateien vergleichen und ZPL-Befehle erläutern
- ZPLkit als eigenständige Browser- oder CommonJS-Bibliothek einbinden

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
