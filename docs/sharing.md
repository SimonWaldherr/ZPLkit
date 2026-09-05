# Sharing und „In ZPLkit-Studio öffnen“

Mit **Teilen** erzeugt Studio einen Link zur bearbeitbaren Momentaufnahme des
aktuellen Etiketts oder des gesamten Dokuments. Der Link enthält ZPL und
DPI-Angaben, keinen Verweis auf einen Serverdatensatz. Er funktioniert auf
statischen Hosts und benötigt keinen Upload-Dienst.

Änderungen erzeugen einen neuen Link. Links lassen sich nicht nachträglich
aktualisieren oder widerrufen. Wer den Link besitzt, kann den Inhalt lesen,
auch Editor-Metadaten, Notizen und ausgeblendete Elemente. Base64URL und
Kompression sind keine Verschlüsselung. Das Fragment wird beim normalen
HTTP-Aufruf nicht an den Server übertragen; die Studio-Seite selbst kann es
lesen. Empfänger müssen die verwendete Studio-Adresse erreichen können –
`localhost` ist keine öffentliche Freigabeadresse.

Beim Öffnen prüft Studio den Link zunächst vollständig. Ein vorhandener
Autosave wird erhalten und wiederhergestellt. Bevor ein anderer Arbeitsstand
ersetzt wird, fragt Studio nach; Abbrechen oder ein fehlerhafter Link lassen
ihn unverändert. Ein übernommenes Dokument ist lokal bearbeitbar und hat kein
Schreibziel in einer Vorlagenbibliothek. Es wird weder automatisch gedruckt
noch zu einem Vorschaudienst gesendet. Nach erfolgreicher Übernahme entfernt
Studio das Fragment aus der aktuellen Adresszeile, damit ein Neuladen nicht
erneut dieselbe Momentaufnahme importiert.

## Einbindung aus JavaScript

Beide Bundles stellen `ZPLkit.Sharing` bereit. Alternativ genügt das
DOM-unabhängige Modul `zplkit/zpl-sharing.js`, das `ZPLSharing` bereitstellt
und auch direkt per CommonJS geladen werden kann.

```html
<script src="https://YOUR-HOST/zplkit/zpl-sharing.js"></script>
<a id="openStudio" target="_blank" rel="noopener noreferrer" hidden>
  In ZPLkit-Studio öffnen
</a>
<script>
async function prepareStudioLink(zpl) {
  const link = document.getElementById('openStudio');
  link.hidden = true;
  try {
    link.href = await ZPLSharing.createUrl(
      'https://YOUR-HOST/studio/',
      { zpl, dpi: [300], activeLabel: 0, name: 'Versand.zpl' }
    );
    link.hidden = false;
  } catch (error) {
    // Statt eines Links eine ZPL-Datei anbieten, z. B. bei zu großen Grafiken.
    console.error(error.code, error.message);
  }
}
prepareStudioLink('^XA^PW600^LL400^FO30,30^A0N,35,35^FDHallo^FS^PQ1^XZ');
</script>
```

Die Linkerzeugung ist asynchron. Einen fertigen Link anzeigen, statt erst
nach einem `await` mit `window.open` ein Popup zu öffnen: Letzteres kann der
Browser blockieren. Keine Netzwerkübertragung erfolgt durch `createUrl`.

Ein ausführbares Beispiel liegt unter
[`zplkit/examples/open-in-studio.html`](../zplkit/examples/open-in-studio.html).
Es verwendet nur das eigenständige Sharing-Modul.

```js
// CommonJS, Node.js 22+
const Sharing = require('./zplkit/zpl-sharing.js');
const url = await Sharing.createUrl('https://YOUR-HOST/studio/', {
  zpl: '^XA^PQ2^XZ^XA^PQ3^XZ',
  dpi: [203, 600],
  activeLabel: 1,
  name: 'Zwei-Etiketten.zpl'
});
```

## Drahtformat v1

```text
https://YOUR-HOST/studio/#share=v1.z.<payload>
```

`payload` ist **UTF-8-JSON → zlib-komprimiertes DEFLATE → Base64URL ohne
`=`-Padding**. `z` bedeutet zlib mit Header und Adler-32-Prüfsumme (RFC 1950),
keinen rohen DEFLATE-Datenstrom und kein gzip. Das gesamte JSON wird komprimiert,
nicht der bereits Base64-codierte Text. Die Reihenfolge der JSON-Schlüssel ist
frei. Die Version steht im Fragmentpräfix.

| JSON-Feld | Bedeutung |
| --- | --- |
| `zpl` | Erforderlicher, nicht leerer ZPL-Text. Ein oder mehrere Etiketten, einschließlich vorhandener Editor-Metadaten. |
| `dpi` | Optionales Array mit genau einem ganzzahligen DPI-Wert je geparstem Etikett, 50–2400. Ohne Angabe gilt 203 für alle Etiketten. |
| `activeLabel` | Optionaler, nullbasierter Etikettenindex; Standard 0. |
| `name` | Optionaler Anzeigen-/Dateiname, maximal 200 Zeichen, ohne Pfadseparatoren oder Steuerzeichen. |

DPI-Angaben beschreiben die vorhandenen Dot-Werte; sie skalieren das Label
nicht. Der Dateiname überschreibt diese Angaben nicht. Treiber-Vorspann,
Grafikdownloads und Aufräumrahmen zählen nicht als separate Etiketten für
`dpi`. Unbekannte JSON-Felder werden ignoriert und nicht übernommen.

## Erzeugung aus anderer Software, z. B. Python

Die Standardbibliothek reicht:

```python
import base64
import json
import zlib
from urllib.parse import urlsplit, urlunsplit


def studio_link(studio_url, zpl, dpi=203, name="label.zpl"):
    envelope = {"zpl": zpl, "dpi": [dpi], "activeLabel": 0, "name": name}
    raw = json.dumps(envelope, ensure_ascii=False, separators=(",", ":")).encode("utf-8")
    if len(raw) > 1_048_576:
        raise ValueError("Bitte eine ZPL-Datei statt eines Links verwenden")
    encoded = base64.urlsafe_b64encode(zlib.compress(raw)).rstrip(b"=").decode("ascii")
    parts = urlsplit(studio_url)
    if parts.scheme not in ("http", "https") or not parts.netloc or parts.username or parts.password:
        raise ValueError("Vollständige HTTP(S)-Studio-Adresse erforderlich")
    link = urlunsplit((parts.scheme, parts.netloc, parts.path, parts.query, "share=v1.z." + encoded))
    if len(link) > 131_072:
        raise ValueError("Bitte eine ZPL-Datei statt eines Links verwenden")
    return link


print(studio_link("https://YOUR-HOST/studio/", "^XA^FDHallo^FS^XZ", dpi=300))
```

## API und Grenzen

- `encodeFragment(payload)` → `Promise<string>`: vollständiges `#share=…`.
- `decodeFragment(fragment)` → `Promise<object>`: geprüftes JSON, ohne Änderungen an Studio, Browseradresse oder Speicher.
- `createUrl(studioUrl, payload)` → `Promise<string>`: vollständige HTTP(S)-URL; vorhandene Query bleibt, vorhandenes Fragment wird ersetzt. Keine Zugangsdaten in der Basisadresse.
- `toDocument(payload)` → Dokumentmodell: benötigt zusätzlich `ZPLParser`, prüft Etikettenanzahl/DPI-Zuordnung und setzt DPI und aktive Auswahl. Wird von Studio verwendet.
- `limits` enthält die Konstanten für die Größenprüfung.

Der Codec prüft JSON-Typen, Zahlenbereiche, kanonisches Base64URL, UTF-8 und
die zlib-Prüfsumme. `toDocument` prüft zusätzlich die tatsächliche Anzahl
geparster Etiketten. Die Prüfung erfolgt, bevor Studio den Arbeitsstand ersetzt.

Ab **8.000 URL-Zeichen** zeigt Studio einen Hinweis. Das ist eine empfohlene
Produktgrenze, kein allgemeines Browserlimit. Die harten Grenzen sind
**131.072 URL-/Fragmentzeichen**, **1.048.576 entpackte JSON-Bytes** und
**256 Etiketten bzw. höchstens 256 `^XA`-Vorkommen vor dem Parsen**.
Die Ausgabegrenze wird bereits während der Dekompression kontrolliert.

Fehler tragen `name: 'ZPLSharingError'` und einen `code`:
`invalid`, `tooLarge`, `unsupported`, `corrupt`, `version`, `url` oder `parser`.
Der Codec benötigt die nativen `CompressionStream`-/`DecompressionStream`-APIs
mit dem Format `deflate`, UTF-8-Codecs und Blob-Streams. Fehlen sie, wird kein
alternatives Drahtformat erfunden: Studio bietet die ZPL-Datei an.

Tests: `node test/sharing.test.js`, außerdem im vollständigen `scripts/verify.sh`.
