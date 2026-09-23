# ZPLkit

ZPLkit besteht aus **ZPL-Studio**, einem browserbasierten Editor für Zebra-kompatible Etiketten, und einer JavaScript-Bibliothek zum Parsen und Erzeugen von ZPL.

Die Anwendung kann als statische Website betrieben werden oder mit dem mitgelieferten Go-Server um eine gemeinsame Vorlagenbibliothek und direkten Zebra-Druck ergänzt werden.

## Funktionen

- Etiketten visuell erstellen und bestehende ZPL-Dateien bearbeiten
- Etiketten oder ganze Dokumente als komprimierten Link teilen; aus anderer Software direkt in Studio öffnen
- Text, Barcodes, Formen und Grafiken platzieren
- Dateien mit mehreren Etiketten (Druck-Spools) öffnen, bearbeiten und speichern
- QR-Codes (`^BQ`) echt codieren – scanbar in Vorschau und Export (siehe unten)
- Etiketten zwischen Druckerauflösungen umrechnen (siehe unten)
- Maße in Dots oder Millimetern eingeben und anzeigen
- ZPL sowie PNG, JPG, GIF und PDF exportieren
- Seriendruck mit CSV-, TSV- oder XLSX-Daten vorbereiten
- ZPL-Dateien vergleichen und ZPL-Befehle erläutern
- Arbeitsbereich mit größenveränderbaren Seitenleisten und einblendbarer ZPL-Konsole anpassen
- Zwischen System-, hellem, dunklem und kontrastreichem Theme wechseln; Layout und Theme bleiben lokal gespeichert
- Elemente mit intelligentem Snapping, frei gesetzten Hilfslinien und Ebenensperren präzise anordnen
- Elemente und Gruppen per Zwischenablage zwischen Labels kopieren oder verschieben
- Ungespeicherte Arbeit automatisch lokal sichern und nach einem Neustart wiederherstellen
- Labels vor Export und Druck per Preflight auf Grenzen, Barcodes, Ruhebereiche und nicht darstellbares ZPL prüfen
- ZPLkit als eigenständige Browser- oder CommonJS-Bibliothek einbinden

Hilfslinien werden über „Hilfslinien…“ in der Kopfzeile als X- und
Y-Positionen gepflegt. Eine Position steht jeweils in einer eigenen Zeile;
die aktuelle Einheit (Dots oder Millimeter) gilt auch für diesen Dialog.
Sperren und Sichtbarkeit befinden sich im Tab „Ebenen“. `Ctrl/Cmd+C`, `X`
und `V` funktionieren für Elemente und Gruppen, ohne die normale
Zwischenablage in Textfeldern zu überschreiben.

## Teilen und aus anderer Software öffnen

„Teilen“ erstellt einen Link zur bearbeitbaren Momentaufnahme des aktuellen
Etiketts oder des ganzen Dokuments, inklusive DPI und Editor-Metadaten.
Die Daten liegen komprimiert im URL-Fragment `#share=v1.z.…`; ein Upload-Backend
ist nicht erforderlich. Große Dokumente können stattdessen als ZPL-Datei
weitergegeben werden. Vor dem Ersetzen eines bestehenden Arbeitsstands fragt
Studio nach. Jeder mit dem Link kann seinen Inhalt lesen.

Andere Anwendungen können mit `ZPLkit.Sharing.createUrl(studioUrl, payload)`
einen „In ZPLkit-Studio öffnen“-Link erzeugen. Das funktioniert mit beiden
Bundles oder dem eigenständigen `zplkit/zpl-sharing.js`.

„Studio-JSON“ exportiert dieselbe portable Dokumentstruktur als Datei mit
`zpl`, `dpi`, `activeLabel` und optionalem `name`. Sie lässt sich über
„Datei öffnen…“ wieder importieren und behält Etikettenauswahl, DPI und die
im ZPL eingebetteten Editor-Metadaten. JSON-Dateien folgen dem Payload-Format
von `ZPLkit.Sharing`; damit kann eine Integration dieselben Daten auch direkt
an `ZPLkit.Sharing.toDocument(payload)` übergeben. Die bisherigen Grenzen von
256 Etiketten und 1 MiB ZPL gelten auch für diesen Import.

[Format, API, JavaScript-/Python-Beispiele und Grenzen](docs/sharing.md) ·
[Ausführbares Integrationsbeispiel](zplkit/examples/open-in-studio.html)

## Arbeitsbereich und Leisten

Die obere Leiste trennt Dateiaktionen von Etikettennavigation, Zoom und
Ausrichtungshilfen. „Export & Druck“ bündelt Druck-ZPL, Bild-/PDF-Export und
Druckaktionen. Unter „Weitere Funktionen“ liegen Vorschau, Vergleich,
Preflight, Beispieldaten, Sprache und Darstellung. Die Menüs lassen sich mit
Escape schließen und bleiben auch in schmalen Fenstern im sichtbaren Bereich.

„Werkzeuge“ und „Eigenschaften“ blenden die linke bzw. rechte Seitenleiste ein
und aus; der Zustand wird wie die Leistenbreiten lokal gespeichert. Auf
schmalen Bildschirmen liegt die rechte Leiste über der Arbeitsfläche und lässt
sich über denselben Schalter wieder schließen. Die Tabs zeigen vollständige
Namen und sind mit Pfeil links/rechts sowie Pos1/Ende bedienbar.

Die untere ZPL-Konsole bündelt Code/Erklärung, Hinweise und „Übernehmen“ in
ihrer Kopfzeile. Bei Mehrfachdateien zeigt sie das aktuell bearbeitete Etikett
als Nummer an. Die Konsole bleibt ein-/ausklappbar und in der Höhe verstellbar.

## ZPL-II-Druckeinstellungen

Druckverfahren, Ausgabemodus und Medienerkennung lassen sich getrennt einstellen:

- **`^MT`**: Thermodirekt ohne Farbband oder Thermotransfer mit Farbband.
- **`^MM`**: Abreißen, Peel-off/Spendekit, Aufwickeln, Applikator, Cutter,
  verzögerter Cutter, RFID oder Kiosk. Der zweite Parameter für **Prepeel**
  bleibt beim Import erhalten und ist separat bearbeitbar. Reservierte oder
  unbekannte importierte Modusbuchstaben werden angezeigt und erhalten.
- **`^MN`**: Endlosmaterial, Lücke/Steg, Schwarzmarke sowie modellabhängige
  automatische Erkennung und variable Länge. Der Schwarzmarkenversatz wird
  in Dots gespeichert und bei einer DPI-Umrechnung mit umgerechnet.

„Druckereinstellung beibehalten“ lässt den jeweiligen Befehl im Export weg.
Eine importierte Datei ohne `^MM` erzwingt daher keinen Tear-off-Modus mehr;
neue Labels beginnen weiterhin mit Tear-off. Nicht unterstützte Parameterformen
bleiben vollständig als Rohbefehle erhalten.

Peel-off setzt ein eingebautes Spendekit, den Entnahmesensor und korrekt
geführtes Trägermaterial voraus. Prepeel wird von Link-OS nicht unterstützt.
Cutter, Applikator, RFID und Kiosk benötigen passende Hardware/Firmware.
Die Medienauswahl führt keine Kalibrierung aus. Der zulässige
Schwarzmarkenversatz hängt vom Druckermodell ab; die Oberfläche zeigt die
Bereiche an. Vorschau und Rasterexport simulieren weder Sensoren noch Kits.

Bibliotheksfelder unter `label.settings`: `mediaTracking` (historischer Name
für den `^MM`-Ausgabemodus), `mediaPrepeel`, `printMethod`, `mediaSensing` und
`blackMarkOffset`. `null` bedeutet bei den neuen Feldern „nicht angegeben“.

Referenzen: [Zebra: ^MM](https://docs.zebra.com/us/en/printers/software/zpl-pg/zpl-commands/%5Emm.html),
[Zebra: ^MN](https://docs.zebra.com/us/en/printers/software/zpl-pg/zpl-commands/%5Emn.html),
[Zebra-Programmierhandbuch: ^MT](https://cpws.zebra.com/cpws/docs/zpl/zpl-zbi2-pm-en.pdf).

Die Etiketteneigenschaften bieten alle fünf Parameter von `^PQq,p,r,o,e`:
Druckmenge, Pause-/Schnittintervall, Kopien je Seriennummer, Unterdrücken der
Pause und Schneiden nach einem RFID-Fehleretikett. Leere Felder verwenden die
ZPL-Standardwerte; bestehende Parameter bleiben beim Bearbeiten anderer
Felder erhalten. Neue Labels behalten die bisherige Vorgabe `^PQ,,,Y`.

`^PQ50,10,1,Y,N` druckt insgesamt 50 Etiketten mit einem Gruppenintervall von
10, ohne zwischen den Gruppen anzuhalten. Die Wiederholungen je Seriennummer
multiplizieren die Gesamtmenge nicht. Vorschau und Bild-/PDF-Export zeigen
weiterhin das einzelne Layout. Der direkte Backend-Druck verwendet die Anzahl
aus dem Druckdialog und normalisiert dazu nur die Druckkopie des Labels;
die bearbeitete Datei und das separate RFID-Fehler-Schnittverhalten bleiben
erhalten. Seriennummern werden durch diese Erweiterung nicht im Editor simuliert.

`^MD` lässt sich als relative Dunkelheit von −30 bis +30 einstellen.
Die absolute Dunkelheit `~SD` und die relative Korrektur bleiben getrennt;
Dezimalwerte wie `~SD16.5^MD-2.5` gehen beim Import und Export nicht mehr verloren.
Ob der Drucker Zehntelschritte unterstützt, hängt von Modell und Firmware ab.

Die Bibliothek behält `label.settings.pq` als unveränderten Parametertext und
bietet über `ZPLkit.Model` zusätzlich geprüfte Hilfsfunktionen:

```js
const label = ZPLkit.parse('^XA^PQ50,10,1,Y,N^XZ');
const quantity = ZPLkit.Model.parsePrintQuantity(label.settings.pq);
// quantity.quantity === 50; quantity.cutOnError === 'N'
label.settings.pq = ZPLkit.Model.setPrintQuantityParameter(
  label.settings.pq, 'quantity', 100
);
label.settings.darknessOffset = -2.5;
const zpl = ZPLkit.generate(label);
```

`parsePrintQuantity` ergänzt ausgelassene Parameter mit den ZPL-Standardwerten
und wirft bei ungültigen Werten einen Fehler. Der normale ZPL-Import bewahrt
auch unbekannte Parametertexte, damit bestehende Dateien lesbar bleiben.

Referenzen: [Zebra: ^PQ](https://docs.zebra.com/us/en/printers/software/zpl-pg/zpl-commands/%5Epq.html),
[Zebra-Programmierhandbuch: ^MD und ~SD](https://www.zebra.com/content/dam/support-dam/en/documentation/unrestricted/guide/software/zpl-zbi2-pg-en.pdf).

## Datenimport für den Seriendruck

Der Import erkennt Komma, Semikolon und Tabulator als Trennzeichen automatisch.
Auch Excel-Dateien mit einer vorangestellten `sep=;`-Zeile werden unterstützt;
diese Zeile wird nicht als Spaltenüberschrift übernommen. `.tsv`-Dateien können
im selben Dateidialog wie CSV und XLSX geöffnet werden.

CSV-Spalten benötigen eindeutige, nicht leere Überschriften. Doppelte Namen
(nach Entfernen äußerer Leerzeichen) und nicht geschlossene Anführungszeichen
werden mit einer Fehlermeldung abgewiesen, damit keine Spaltenwerte unbemerkt
überschrieben oder mehrere Datensätze zusammengezogen werden. Anführungszeichen,
Trennzeichen und Zeilenumbrüche innerhalb korrekt zitierter Felder bleiben
erhalten. Fehlende Werte am Zeilenende werden weiterhin als leer behandelt;
zusätzliche Werte jenseits der Kopfspalten werden weiterhin ignoriert.

## Editor-Metadaten im ZPL

ZPLkit schreibt Hilfslinien, Ebenennamen, Sperren, Gruppen und ausgeblendete
Objekte als versionierte `^FXZPLKIT_META`-Kommentare direkt in die ZPL-Datei.
`^FX` ist der offizielle ZPL-Kommentarbefehl und beeinflusst den Ausdruck
nicht. Größere Zustände werden in mehrere Base64URL-Chunks zerlegt und mit
CRC32 geprüft. Fehlt ein Chunk oder stimmt die Prüfsumme nicht, ignoriert der
Editor die Metadaten sicher; das druckbare Label bleibt davon unberührt.

Fremde `^FX`-Kommentare bleiben erhalten. Labels ohne Editor-spezifischen
Zustand bekommen keinen Metadatenblock. Eine genaue Formatspezifikation,
Fehlerregeln und das Abschalten beim Generieren stehen in
[`docs/editor-metadata.md`](docs/editor-metadata.md).

„Herunterladen“ erzeugt die weiterhin vollständig bearbeitbare Datei.
„Druck-ZPL“ erzeugt daneben eine bereinigte `*.print.zpl`-Datei ohne
Editor-Sidecar; sie enthält weiterhin alle sichtbaren druckbaren Elemente,
aber bewusst keine ausgeblendeten Entwürfe.

## Dateien mit mehreren Etiketten

Eine `.zpl`-Datei ist nicht zwangsläufig ein Etikett – ein Druck-Spool enthält
oft dutzende `^XA…^XZ`-Rahmen hintereinander. Bisher wurden die zu **einem**
Etikett verschmolzen: alle Rahmen lagen übereinander auf denselben
Koordinaten und wurden als ein einziger, so nicht druckbarer Rahmen wieder
ausgegeben.

Der Editor zeigt jetzt eine Etikettenleiste in der Kopfzeile (nur sichtbar,
wenn die Datei mehr als ein Etikett enthält) mit Blättern, Auswahlliste sowie
Einfügen, Duplizieren, Verschieben und Löschen. „Herunterladen“ und
„Speichern“ schreiben immer die ganze Datei; die „ZPL-Konsole“ am unteren
Rand zeigt und bearbeitet bewusst nur das gewählte Etikett und sagt das auch.

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

Für ein einzelnes, portables Server-Binary:

```sh
go build -trimpath -o zpl-studio-server .
./zpl-studio-server
```

Beim Beenden mit `Ctrl+C` oder `SIGTERM` wartet der Server kurz auf laufende Speicher- und Druckanfragen, bevor er sauber herunterfährt.

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

Der vollständige lokale Prüflauf benötigt Go 1.21+ und Node.js 22+ und führt Go-Tests, `go vet`, JavaScript-Syntaxprüfungen, alle Node-Tests sowie den Bundle-Abgleich aus:

```sh
./scripts/verify.sh
```

Die Prüfung läuft für jeden Push und Pull Request zusätzlich über GitHub Actions. Einzelne DOM-freie JavaScript-Tests unter `test/` lassen sich weiterhin direkt mit Node starten:

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

Ob die eingecheckten Bundles aktuell sind, lässt sich ohne Dateiänderungen prüfen:

```sh
go run tools/bundle-lib.go -check
```

## Projektstruktur

- `studio/` – Editor-Oberfläche
- `zplkit/` – Parser, Generator und Browser-Bibliothek
- `zplkit/dist/` – veröffentlichte Bundles
- `main.go`, `printing.go`, `templates.go` – optionaler Go-Server
- `config/printers.csv.example` – Beispiel für die Drucker-Registry
- `scripts/verify.sh` – vollständiger lokaler Prüflauf
- `.github/workflows/ci.yml` – dieselbe Prüfung in GitHub Actions
