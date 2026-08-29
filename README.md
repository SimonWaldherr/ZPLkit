# ZPLkit

ZPLkit besteht aus **ZPL-Studio**, einem browserbasierten Editor für Zebra-kompatible Etiketten, und einer JavaScript-Bibliothek zum Parsen und Erzeugen von ZPL.

Die Anwendung kann als statische Website betrieben werden oder mit dem mitgelieferten Go-Server um eine gemeinsame Vorlagenbibliothek und direkten Zebra-Druck ergänzt werden.

## Funktionen

- Etiketten visuell erstellen und bestehende ZPL-Dateien bearbeiten
- Text, Barcodes, Formen und Grafiken platzieren
- Dateien mit mehreren Etiketten (Druck-Spools) öffnen, bearbeiten und speichern
- QR-Codes (`^BQ`) echt codieren – scanbar in Vorschau und Export (siehe unten)
- Etiketten zwischen Druckerauflösungen umrechnen (siehe unten)
- Maße in Dots oder Millimetern eingeben und anzeigen
- ZPL sowie PNG, JPG, GIF und PDF exportieren
- Seriendruck mit CSV- oder XLSX-Daten vorbereiten
- ZPL-Dateien vergleichen und ZPL-Befehle erläutern
- ZPLkit als eigenständige Browser- oder CommonJS-Bibliothek einbinden

## Dateien mit mehreren Etiketten

Eine `.zpl`-Datei ist nicht zwangsläufig ein Etikett – ein Druck-Spool enthält
oft dutzende `^XA…^XZ`-Rahmen hintereinander. Bisher wurden die zu **einem**
Etikett verschmolzen: alle Rahmen lagen übereinander auf denselben
Koordinaten und wurden als ein einziger, so nicht druckbarer Rahmen wieder
ausgegeben.

Der Editor zeigt jetzt eine Etikettenleiste in der Kopfzeile (nur sichtbar,
wenn die Datei mehr als ein Etikett enthält) mit Blättern, Auswahlliste sowie
Einfügen, Duplizieren, Verschieben und Löschen. „Herunterladen“ und
„Speichern“ schreiben immer die ganze Datei; der Tab „ZPL-Code“ zeigt und
bearbeitet bewusst nur das gewählte Etikett und sagt das auch.

Dateiweit statt pro Etikett behandelt werden der Treiber-Vorspann und die
`~DG`-Grafiken: ein Logo, das zwölf Etiketten platzieren, wird genau einmal
zum Drucker geladen. Rahmen, die keine Etiketten sind (weitere
Treiberkonfiguration, `^ID`-Aufräumrahmen) bleiben an der Stelle erhalten, an
der sie standen.

Rückgängig/Wiederholen arbeitet weiterhin **pro Etikett** – die Historie kann
einzelne zurückliegende Änderungen ausblenden und den Rest neu abspielen,
wofür es auf Dokumentebene keine sinnvolle Entsprechung gibt. Jedes Etikett
behält seinen eigenen Stapel, Umschalten wirft also nichts weg.

Für die Bibliothek:

```js
const doc = ZPLkit.Parser.parseDocument(zplText);  // { labels, preamble, storedGraphics, passthrough }
const out = ZPLkit.Generator.generateDocument(doc);
```

`ZPLkit.parse()` liefert weiterhin genau ein Etikett – bei einer
Mehrfachdatei das erste, mit `labelCount` als Hinweis, dass es mehr gab.

## QR-Codes (`^BQ`)

QR ist die einzige 2D-Symbologie hier mit einem **echten Encoder**
([`zplkit/qrcode.js`](zplkit/qrcode.js)): Versionen 1–40, Fehlerkorrektur
L/M/Q/H, numerisch/alphanumerisch/Byte (UTF-8) und alle acht Maskenmuster mit
der normgemäßen Auswahl über Strafpunkte. Die Vorschau und **jeder
Rasterexport (PNG/PDF/GIF) enthalten damit ein tatsächlich scanbares Symbol**
– vorher wurde ein `^BQ` unverändert als Rohtext durchgereicht, war im Editor
unsichtbar und blockierte den kompletten Bildexport.

Data Matrix, Aztec und MaxiCode bleiben bewusst klar gekennzeichnete
Platzhalter; für sie fehlt ein Encoder.

ZPL verteilt die QR-Einstellungen auf zwei Stellen, und das tut der Editor
auch: Modell, Modulgröße und Maske stehen im `^BQ`-Befehl, die
Fehlerkorrekturstufe darf zusätzlich im Datenfeld stehen
(`^FDQA,Inhalt` = Stufe Q, automatischer Modus). Steht dort eine Stufe, hat
sie Vorrang – genau wie beim Drucker. Der manuelle Modus mit eigenen
Zeichenmodi (`^FDHM,N0123456789`, `^FDMM,AHELLO,B0004test`) wird ebenfalls
gelesen. Das Datenfeld bleibt im Modell unverändert erhalten, damit der
Roundtrip verlustfrei bleibt.

Zwei Dinge, die `^BY` betreffen: Modulbreite und Verhältnis wirken sich auf
einen QR-Code **nicht** aus – seine Größe kommt allein aus der Vergrößerung im
`^BQ`. Der Editor blendet die beiden Felder für QR deshalb aus, ebenso das
Ausrichtungsfeld (Zebra dokumentiert es als festen Wert).

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
node test/qrcode.test.js
```

Die QR-Tests prüfen die Codewort-Tabellen für alle 160 Versions-/Stufen-
Kombinationen gegen die veröffentlichte Kapazitätstabelle und vergleichen
vollständige Modulmatrizen gegen Symbole, die ein unabhängiger Decoder
zurückgelesen hat.

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
