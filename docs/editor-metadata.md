# ZPLkit-Editor-Metadaten in ZPL

## Zweck

ZPL kennt keine Ebenennamen, Gruppen, Sperren, Hilfslinien oder unsichtbaren
Objekte. ZPLkit speichert diese Angaben deshalb als druckneutrale `^FX`-
Kommentare direkt im jeweiligen `^XA…^XZ`-Rahmen. Das Label bleibt gültiges
ZPL und kann ohne Vorverarbeitung an einen Zebra-kompatiblen Drucker gehen.

## Format, Version 1

Jeder Chunk ist ein eigener ZPL-Kommentar:

```zpl
^FXZPLKIT_META:1:1/2:89ABCDEF:<base64url-daten>^FS
^FXZPLKIT_META:1:2/2:89ABCDEF:<base64url-daten>^FS
```

Die Felder bedeuten:

1. Formatversion (`1`)
2. Chunknummer und Gesamtzahl (`1/2`)
3. CRC32 des vollständigen, unkodierten JSON (`89ABCDEF`)
4. Base64URL-kodierter Teil des UTF-8-JSON

Base64URL enthält weder `^` noch `~` und kann deshalb den ZPL-Tokenizer nicht
versehentlich in einen neuen Befehl springen lassen. Ein Chunk enthält
höchstens 480 Nutzzeichen; die gesamte kodierte Nutzlast ist auf 2 MiB pro
Etikett begrenzt.

Das dekodierte JSON hat diese Grundform:

```json
{
  "version": 1,
  "guides": {
    "visible": true,
    "snap": true,
    "vertical": [100, 250],
    "horizontal": [42]
  },
  "elements": [
    { "visibleIndex": 0, "id": "title", "name": "Titel", "locked": true, "groupId": "header" },
    { "hiddenElement": { "id": "draft", "type": "box", "hidden": true } }
  ]
}
```

Sichtbare Elemente werden über ihre Reihenfolge im druckbaren ZPL zugeordnet.
Ausgeblendete Elemente stehen vollständig im Sidecar, weil sie absichtlich
nicht als druckbarer ZPL-Befehl ausgegeben werden. Binärdaten wie eine
ausgeblendete Grafik werden im JSON typisiert serialisiert und beim Laden
wieder als `Uint8Array` aufgebaut.

## Fehler- und Kompatibilitätsverhalten

- ZPLkit wendet Metadaten nur an, wenn alle Chunks vorhanden, eindeutig und
  mit Version sowie Prüfsumme konsistent sind.
- Beschädigte, unvollständige oder unbekannte Metadaten verändern das
  druckbare Label nicht. Ihre `^FX`-Kommentare bleiben als Roh-ZPL erhalten.
- Fremde `^FX`-Kommentare werden nicht als ZPLkit-Metadaten interpretiert und
  bleiben unangetastet.
- Labels ohne Editorzustand erhalten keine zusätzlichen Kommentare.
- Andere Werkzeuge dürfen Kommentare entfernen. Das Label bleibt druckbar,
  verliert dann aber die ausschließlich darin gespeicherten Editorangaben
  und ausgeblendeten Objekte.
- Mit `ZPLGenerator.generateZPL(label, { editorMetadata: false })` kann ein
  bewusst bereinigtes Druck-ZPL ohne Editor-Sidecar erzeugt werden.
- Für Dokumente mit mehreren Labels gilt entsprechend
  `ZPLGenerator.generateDocument(doc, { editorMetadata: false })`.

ZPL-Studio bietet dafür neben „Herunterladen“ die Aktion „Druck-ZPL“ an. Sie
erzeugt eine separate `*.print.zpl`-Datei, markiert die bearbeitbare Quelle
aber nicht als gespeichert: Ein bereinigter Druckexport enthält schließlich
keine ausgeblendeten Entwürfe oder sonstigen Editorzustände mehr.

`^FX` ist Zebras offizieller ZPL-Kommentarbefehl; `^FS` beendet das Feld. Siehe
[Zebra ZPL Programming Guide: `^FX` example](https://docs.zebra.com/us/en/printers/software/zpl-pg/zbi-commands/file-system/runtime-access.html).
