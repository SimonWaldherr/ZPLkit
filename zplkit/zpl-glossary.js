/* ZPL label editor — glossary: kurze deutsche Erklärungen zu ZPL-Befehlen,
   für die "Erklärte Ansicht" im Tab "ZPL-Code". Rein informativ (Lernzweck),
   keine Auswirkung auf Parsen/Erzeugen des ZPL-Codes.

   Ziel ist nicht Vollständigkeit gegenüber der Zebra-Referenz, sondern die
   Befehle, die dieser Editor selbst erzeugt oder unverändert durchreicht,
   verständlich zu machen - man lernt beim Editieren eines echten Labels
   automatisch, wofür jeder Befehl steht.

   Jeder Eintrag trägt zusätzlich zum kurzen "name"/"desc" (unverändert aus
   der bisherigen Fassung) ein fullName (offizieller, ausgeschriebener
   Zebra-Befehlsname auf Englisch), ein germanName (deutsche Übersetzung
   dieses Namens) sowie params (geordnete Liste der kommagetrennten
   Parameter mit Bedeutung/Default/Wertebereich) - recherchiert und
   gegengeprüft gegen das offizielle Zebra ZPL-II-Programmierhandbuch sowie,
   wo vorhanden, gegen den eigenen Generator-/Parser-Code dieses Editors. */
(function (global) {
  'use strict';

  // Barcode-Unterbefehle: ^B<Buchstabe/Ziffer> wählt den Barcode-Typ. Jeder
  // Eintrag trägt dieselbe fullName/germanName/params-Struktur wie COMMANDS,
  // damit die "Erklärte Ansicht" barcodespezifische Befehle genauso erklärt.
  const ORIENT_PARAM = {
    name: 'Ausrichtung',
    desc: 'Drehung des Barcodes: N = normal (0°), R = 90° im Uhrzeigersinn, I = 180°, B = 270°.',
    default: 'N', range: 'N, R, I, B',
  };
  const HEIGHT_PARAM = {
    name: 'Höhe',
    desc: 'Höhe der Balken in Dots. Ohne eigene Angabe gilt die zuletzt per ^BY gesetzte Standardhöhe.',
    default: 'aus ^BY', range: '1–32000',
  };
  const INTERP_LINE_PARAM = {
    name: 'Klartextzeile',
    desc: 'Ob die codierten Daten zusätzlich als lesbarer Text unter (bzw. über) dem Barcode gedruckt werden.',
    default: 'N', range: 'Y, N',
  };
  const INTERP_LINE_ABOVE_PARAM = {
    name: 'Klartextzeile oberhalb',
    desc: 'Ob die Klartextzeile über statt unter dem Barcode gedruckt wird (nur wirksam, wenn die Klartextzeile aktiviert ist).',
    default: 'N', range: 'Y, N',
  };
  const CHECK_DIGIT_PARAM = {
    name: 'Prüfziffer',
    desc: 'Ob der Drucker automatisch eine Prüfziffer berechnet und mit ausgibt.',
    default: 'N', range: 'Y, N',
  };

  const BARCODE_SUBTYPE_INFO = {
    C: {
      label: 'Code 128', desc: 'Code 128 (variable Länge, sehr verbreitet in Logistik/Handel)',
      fullName: 'Code 128 Bar Code', germanName: 'Code-128-Barcode',
      params: [
        ORIENT_PARAM, HEIGHT_PARAM, INTERP_LINE_PARAM, INTERP_LINE_ABOVE_PARAM, CHECK_DIGIT_PARAM,
        { name: 'Modus', desc: 'Zeichensatzmodus: N = automatisch (je nach Daten), U = nur UCC/EAN (numerisch), A = nur Automatisierungs-Zeichensatz, D = nur Ziffern (dichteste Codierung).', default: 'N', range: 'N, U, A, D' },
      ],
    },
    3: {
      label: 'Code 39', desc: 'Code 39 (alphanumerisch, breit genutzt, geringere Datendichte)',
      fullName: 'Code 39 Bar Code', germanName: 'Code-39-Barcode',
      params: [ORIENT_PARAM, CHECK_DIGIT_PARAM, HEIGHT_PARAM, INTERP_LINE_PARAM, INTERP_LINE_ABOVE_PARAM],
    },
    2: {
      label: 'Interleaved 2 of 5', desc: 'Interleaved 2 of 5 (nur Ziffern, paarweise codiert, kompakt)',
      fullName: 'Interleaved 2 of 5 Bar Code', germanName: 'Interleaved-2-of-5-Barcode',
      params: [ORIENT_PARAM, HEIGHT_PARAM, INTERP_LINE_PARAM, INTERP_LINE_ABOVE_PARAM, CHECK_DIGIT_PARAM],
    },
    E: {
      label: 'EAN-13', desc: 'EAN-13 (13-stelliger Handelsartikelcode)',
      fullName: 'EAN-13 Bar Code', germanName: 'EAN-13-Barcode',
      params: [ORIENT_PARAM, HEIGHT_PARAM, INTERP_LINE_PARAM, INTERP_LINE_ABOVE_PARAM],
    },
    U: {
      label: 'UPC-A', desc: 'UPC-A (12-stelliger nordamerikanischer Handelsartikelcode)',
      fullName: 'UPC-A Bar Code', germanName: 'UPC-A-Barcode',
      params: [ORIENT_PARAM, HEIGHT_PARAM, INTERP_LINE_PARAM, INTERP_LINE_ABOVE_PARAM, CHECK_DIGIT_PARAM],
    },
    X: {
      label: 'Data Matrix', desc: 'Data Matrix (2D-Code, sehr kompakt, robust gegen Beschädigung)',
      fullName: 'Data Matrix Bar Code', germanName: 'Data-Matrix-Barcode',
      params: [
        ORIENT_PARAM,
        { name: 'Modulgröße', desc: 'Größe eines einzelnen Moduls (Punkts) in Dots - bestimmt die Gesamtgröße des Codes, nicht dessen Datenkapazität.', default: '6', range: '1–32000' },
        { name: 'Qualität/ECC', desc: 'Fehlerkorrekturstufe: 200 = ECC200 (Standard bei allen aktuellen Druckern, empfohlen); ältere Stufen 0/50/80/100/140 nur für sehr alte Firmware.', default: '0', range: '0, 50, 80, 100, 140, 200' },
        { name: 'Spalten', desc: 'Anzahl Spalten des Symbols. 0 = automatisch anhand der Datenmenge.', default: '0', range: '0, 9–49' },
        { name: 'Zeilen', desc: 'Anzahl Zeilen des Symbols. 0 = automatisch anhand der Datenmenge.', default: '0', range: '0, 9–49' },
        { name: 'Format', desc: 'Format-ID; in der Praxis fast immer 1 (Standardformat).', default: '1', range: '1–6' },
        { name: 'Escape-Zeichen', desc: 'In den Felddaten verwendetes Escape-Zeichen für Sonderfunktionen (z. B. Zeilenumbruch innerhalb des Codes).', default: '_', range: 'ein beliebiges Zeichen' },
        { name: 'Seitenverhältnis', desc: 'Form des Symbols: 1 = quadratisch (Standard), 2 = rechteckig (nur neuere Firmware).', default: '1', range: '1, 2' },
      ],
    },
    0: {
      label: 'Aztec Code', desc: 'Aztec Code (2D-Code, kompakt, z. B. Bordkarten/Tickets)',
      fullName: 'Aztec Bar Code', germanName: 'Aztec-Barcode',
      params: [
        ORIENT_PARAM,
        { name: 'Vergrößerung', desc: 'Modulgröße (Pixelgröße je Code-Modul) - Aztecs einzige Größensteuerung, es gibt keinen separaten Modulbreiten-Parameter.', default: '1', range: '1–10' },
        { name: 'ECI', desc: 'Ob die Felddaten eingebettete ECI-Escapes (Extended Channel Interpretation) für Nicht-ASCII-Zeichensätze enthalten.', default: 'N', range: 'Y, N' },
        { name: 'Fehlerkorrektur/Größe', desc: '0 = automatisch; 1–99 = minimaler Fehlerkorrekturanteil in % (Drucker wählt die kleinste passende Symbolgröße); 101–104 = feste kompakte Größe (1–4 Ebenen); 201–232 = feste normale Größe (1–32 Ebenen); 300 = „Aztec Rune“ (ein einzelnes Byte in einem eigenen Mini-Symbol).', default: '0', range: '0, 1–99, 101–104, 201–232, 300' },
        { name: 'Menü-Symbol', desc: 'Y = dieser Code ist ein Lesegerät-Steuersymbol (kein Datencode).', default: 'N', range: 'Y, N' },
        { name: 'Gruppengröße', desc: 'Anzahl Symbole in einer „Structured Append“-Gruppe, falls eine Nachricht auf mehrere Symbole aufgeteilt wird.', default: '1', range: '1–26' },
        { name: 'Gruppen-ID', desc: 'Optionale Kennung der Symbolgruppe bei „Structured Append“.', default: '', range: 'bis zu 24 Zeichen' },
      ],
    },
    D: {
      label: 'MaxiCode', desc: 'MaxiCode (2D-Code für Paket-/Frachtrouting)',
      fullName: 'MaxiCode Bar Code', germanName: 'MaxiCode-Barcode',
      params: [
        { name: 'Modus', desc: '2 = strukturierte Nachricht mit numerischer (US-)Postleitzahl, 3 = strukturierte Nachricht mit alphanumerischer (Nicht-US-)Postleitzahl, 4 = einfacher Modus ohne Kopfdaten (Felddaten werden 1:1 codiert), 5 = nur sekundäre Nachricht, 6 = Lesegerät-Steuersymbol.', default: '2', range: '2, 3, 4, 5, 6' },
        { name: 'Symbolnummer', desc: 'Nummer dieses Symbols innerhalb einer „Structured Append“-Gruppe.', default: '1', range: '1–8' },
        { name: 'Gruppengröße', desc: 'Gesamtzahl Symbole in dieser „Structured Append“-Gruppe.', default: '1', range: '1–8' },
      ],
    },
    Q: {
      label: 'QR-Code', desc: 'QR-Code (2D-Code, hohe Datenkapazität, per Smartphone lesbar)',
      fullName: 'QR Code Bar Code', germanName: 'QR-Code-Barcode',
      params: [
        { name: 'Ausrichtung', desc: 'Laut Zebra-Handbuch ein fester Wert - ^FW (globale Feldausrichtung) hat keine Wirkung auf die Drehung des QR-Codes.', default: 'N', range: 'N (fest)' },
        { name: 'Modell', desc: 'QR-Code-Modell: 1 = ursprüngliche Spezifikation, 2 = erweitertes Modell (empfohlen, üblich).', default: '2', range: '1, 2' },
        { name: 'Vergrößerung', desc: 'Modulgröße (Pixelgröße je Code-Modul) - je höher, desto größer und gröber der gedruckte Code.', default: 'abhängig von der dpi (1 bei 150dpi, 2 bei 200dpi, 3 bei 300dpi, 6 bei 600dpi)', range: '1–10' },
        { name: 'Fehlerkorrektur', desc: 'H = sehr hohe Zuverlässigkeit, Q = hoch, M = Standard, L = geringste Redundanz/höchste Datendichte. Muss zusätzlich als Präfix im ^FD-Datenfeld stehen (z. B. „^FDQA,Inhalt^FS“ für automatischen Modus mit Stufe Q).', default: 'Q', range: 'H, Q, M, L' },
        { name: 'Maskierung', desc: 'Maskierungsmuster für die Modul-Verteilung - in der Praxis fast immer auf dem Standardwert belassen.', default: '7', range: '0–7' },
      ],
    },
    7: {
      label: 'PDF417', desc: 'PDF417 (2D-Stapelcode, hohe Datenkapazität, z. B. Ausweise/Frachtpapiere)',
      fullName: 'PDF417 Bar Code', germanName: 'PDF417-Barcode',
      params: [
        ORIENT_PARAM,
        { name: 'Zeilenhöhe', desc: 'Höhe der einzelnen Codezeilen in Dots. Ohne Angabe ergibt sich die Zeilenhöhe aus der über ^BY gesetzten Gesamthöhe geteilt durch die Zeilenzahl.', default: 'aus ^BY', range: '1–Etikettenhöhe' },
        { name: 'Sicherheitsstufe', desc: 'Fehlerkorrektur: 0 = nur Fehlererkennung ohne Korrektur, höhere Stufen erhöhen Robustheit und Symbolgröße.', default: '0', range: '0–8' },
        { name: 'Spalten', desc: 'Anzahl Codewort-Spalten - steuert die Breite des Symbols. 0 = automatisch.', default: 'automatisch', range: '1–30' },
        { name: 'Zeilen', desc: 'Anzahl Codezeilen - steuert die Höhe des Symbols. Spalten × Zeilen muss unter 928 bleiben. 0 = automatisch.', default: 'automatisch', range: '3–90' },
        { name: 'Kürzung', desc: 'Kürzt die rechten Zeilenindikatoren/das Stoppmuster, um Platz zu sparen - nur bei geringem Beschädigungsrisiko verwenden.', default: 'N', range: 'N, Y' },
      ],
    },
  };

  // Reihenfolge ist unwichtig - lookup() sortiert nach Codelänge (längster
  // Treffer zuerst), damit z. B. "PON" nicht fälschlich als "PO" + Rest matcht.
  const COMMANDS = {
    XA: {
      name: '^XA – Label-Anfang', desc: 'Startet ein Etikett (einen Druckauftrag). Jedes Etikett beginnt mit ^XA und endet mit ^XZ.',
      fullName: 'Start Format', germanName: 'Format starten', params: [],
    },
    XZ: {
      name: '^XZ – Label-Ende', desc: 'Beendet das Etikett und löst den Druck dieses ^XA…^XZ-Blocks aus.',
      fullName: 'End Format', germanName: 'Format beenden', params: [],
    },

    FO: {
      name: '^FO – Feldursprung (oben links)', desc: 'Setzt die Position (X,Y in Dots) der oberen linken Ecke des nächsten Feldes (Text/Barcode/Grafik).',
      fullName: 'Field Origin', germanName: 'Feldursprung',
      params: [
        { name: 'x', desc: 'Horizontale Position in Dots, gemessen vom Label-Ursprung (^LH) nach rechts.', default: '0', range: '0–32000' },
        { name: 'y', desc: 'Vertikale Position in Dots, gemessen vom Label-Ursprung nach unten.', default: '0', range: '0–32000' },
        { name: 'z', desc: 'Optionale Justierung (0 = Standard, 1 = rechts, 2 = automatisch) - in der Praxis kaum genutzt; dieser Editor setzt sie nie.', default: '0', range: '0, 1, 2' },
      ],
    },
    FT: {
      name: '^FT – Feldursprung (Grundlinie)', desc: 'Wie ^FO, verankert Text aber an der Schriftgrundlinie statt oben links – wichtig, wenn Textfelder unterschiedliche Höhen haben und trotzdem bündig wirken sollen.',
      fullName: 'Field Typeset', germanName: 'Feld-Textsatz',
      params: [
        { name: 'x', desc: 'Horizontale Position in Dots, gemessen vom Label-Ursprung.', default: '0', range: '0–32000' },
        { name: 'y', desc: 'Vertikale Position in Dots - markiert die Schriftgrundlinie (Baseline), nicht die Oberkante wie bei ^FO.', default: '0', range: '0–32000' },
        { name: 'z', desc: 'Optionale Justierung (0 = Standard, 1 = rechts, 2 = automatisch) - selten genutzt.', default: '0', range: '0, 1, 2' },
      ],
    },
    FD: {
      name: '^FD – Felddaten', desc: 'Der eigentliche Inhalt des Feldes: der Text bzw. die zu codierenden Barcode-Daten.',
      fullName: 'Field Data', germanName: 'Felddaten',
      params: [
        { name: 'Daten', desc: 'Der zu druckende Inhalt (Text oder Barcode-Nutzdaten). Alles zwischen ^FD und dem folgenden ^FS zählt dazu.', default: '', range: '' },
      ],
    },
    FS: {
      name: '^FS – Feldende', desc: 'Schließt ein Feld ab (Text/Barcode/Grafik). Jedes Feld, das mit ^FO/^FT beginnt, endet mit ^FS.',
      fullName: 'Field Separator', germanName: 'Feldtrenner', params: [],
    },
    FH: {
      name: '^FH – Hex-Escape aktivieren', desc: 'Erlaubt in den folgenden Felddaten ein Escape-Zeichen (Standard "_"), um Sonderzeichen wie ^ oder ~ als literalen Text statt als Befehl zu codieren.',
      fullName: 'Field Hexadecimal Indicator', germanName: 'Feld-Hexadezimalindikator',
      params: [
        { name: 'Indikator', desc: 'Das Zeichen, das innerhalb der folgenden ^FD-Daten eine 2-stellige Hex-Escape-Sequenz einleitet (z. B. „_41“ für den Buchstaben „A“).', default: '_', range: 'ein beliebiges einzelnes Zeichen' },
      ],
    },
    FR: {
      name: '^FR – Feld invertieren (Field Reverse)', desc: 'Kehrt Schwarz/Weiß des nächsten Feldes um, z. B. weißer Text/Barcode auf schwarzem Untergrund.',
      fullName: 'Field Reverse Print', germanName: 'Feld-Umkehrdruck', params: [],
    },
    FB: {
      name: '^FB – Textblock', desc: 'Lässt Text automatisch in einer festen Breite umbrechen (mehrzeilig), inkl. Ausrichtung und optionalem hängenden Einzug.',
      fullName: 'Field Block', germanName: 'Feldblock',
      params: [
        { name: 'Breite', desc: 'Breite des Textblocks in Dots ab dem Feldursprung. Zu klein oder 0 lässt den Drucker ^FB ignorieren (Feld verhält sich wie ein normales, nicht geblocktes Textfeld).', default: '0', range: '0–32000' },
        { name: 'Max. Zeilen', desc: 'Maximale Anzahl Zeilen. Überschüssiger Text wird abgeschnitten statt umzubrechen.', default: '1', range: 'offiziell 1–9999; dieser Editor erlaubt zusätzlich 0 als eigene Erweiterung für „unbegrenzt viele Zeilen“' },
        { name: 'Zeilenabstand', desc: 'Zusätzlicher Abstand zwischen den Zeilen in Dots, addiert zur normalen Zeilenhöhe.', default: '0', range: '-9999–9999' },
        { name: 'Ausrichtung', desc: 'L = linksbündig, C = zentriert, R = rechtsbündig, J = Blocksatz (nur die letzte Zeile bleibt linksbündig).', default: 'L', range: 'L, C, R, J' },
        { name: 'Hängender Einzug', desc: 'Einzug in Dots, der auf alle Zeilen außer der ersten angewendet wird.', default: '0', range: '0–9999' },
      ],
    },
    FW: {
      name: '^FW – Standard-Feldausrichtung', desc: 'Legt die Standard-Drehung (0°/90°/180°/270°) für nachfolgende Felder fest, sofern diese keine eigene angeben.',
      fullName: 'Field Orientation', germanName: 'Feldausrichtung',
      params: [
        { name: 'Ausrichtung', desc: 'N = normal (0°), R = 90° im Uhrzeigersinn, I = 180°, B = 270° („von unten gelesen“).', default: 'N', range: 'N, R, I, B' },
      ],
    },
    FX: {
      name: '^FX – Kommentar', desc: 'Ein Kommentar im ZPL-Code – wird vom Drucker ignoriert, dient nur der Dokumentation.',
      fullName: 'Comment', germanName: 'Kommentar',
      params: [
        { name: 'Text', desc: 'Freier Text bis zum nächsten ^- oder ~-Steuerzeichen. Wird vollständig ignoriert.', default: '', range: 'beliebiger Text ohne ^ oder ~' },
      ],
    },

    A: {
      name: '^A – Schriftart', desc: 'Wählt Schriftart, Drehung sowie Höhe/Breite des nächsten Textfeldes, z. B. ^A0N,30,30 = Schrift 0, nicht gedreht, 30×30 Dots.',
      fullName: 'Scalable/Bitmapped Font', germanName: 'Skalierbare/Bitmap-Schriftart',
      params: [
        { name: 'Schrift', desc: 'Kennung der Schriftart (0–9, A–Z oder Kürzel einer geladenen Schrift). Wird ohne Komma direkt an das „A“ angehängt.', default: 'letzter ^CF-Wert bzw. 0', range: '0–9, A–Z' },
        { name: 'Drehung', desc: 'Ebenfalls ohne Komma direkt angehängt: N = normal, R = 90°, I = 180°, B = 270°.', default: 'N', range: 'N, R, I, B' },
        { name: 'Höhe', desc: 'Zeichenhöhe in Dots.', default: 'letzter ^CF-Wert', range: 'skalierbar: 10–32000; Bitmap-Schrift: Vielfaches der Standardhöhe' },
        { name: 'Breite', desc: 'Zeichenbreite in Dots - unabhängig von der Höhe einstellbar (Text kann gestaucht/gestreckt werden).', default: 'letzter ^CF-Wert', range: 'skalierbar: 10–32000; Bitmap-Schrift: Vielfaches der Standardbreite' },
      ],
    },

    BY: {
      name: '^BY – Barcode-Grundeinstellungen', desc: 'Legt Modulbreite (Breite des schmalsten Strichs), Verhältnis breit/schmal und Standardhöhe für den nächsten Barcode fest.',
      fullName: 'Bar Code Field Default', germanName: 'Barcode-Feld-Standardwerte',
      params: [
        { name: 'Modulbreite', desc: 'Breite des schmalsten Strichs/der schmalsten Lücke in Dots - alle weiteren Strichbreiten leiten sich daraus ab.', default: '2', range: '1–10' },
        { name: 'Verhältnis', desc: 'Verhältnis breiter zu schmaler Strich - wirkt nur bei Barcode-Typen mit zwei Strichbreiten (z. B. Code 39, Interleaved 2 of 5).', default: '3.0', range: '2.0–3.0' },
        { name: 'Höhe', desc: 'Standardhöhe in Dots für nachfolgende Barcodes, sofern deren eigener Befehl keine Höhe angibt.', default: '10', range: '1–32000' },
      ],
    },

    GB: {
      name: '^GB – Grafikbox', desc: 'Zeichnet ein Rechteck bzw. eine Linie (Breite/Höhe, Randstärke, Farbe, abgerundete Ecken über den Rundungsradius).',
      fullName: 'Graphic Box', germanName: 'Grafikbox',
      params: [
        { name: 'Breite', desc: 'Breite des Rechtecks in Dots. Gleich der Randstärke ergibt eine senkrechte Linie statt eines Rechtecks.', default: 'Randstärke bzw. 1', range: '1–32000' },
        { name: 'Höhe', desc: 'Höhe des Rechtecks in Dots. Gleich der Randstärke ergibt eine waagrechte Linie statt eines Rechtecks.', default: 'Randstärke bzw. 1', range: '1–32000' },
        { name: 'Randstärke', desc: 'Dicke des Rahmens/der Linie in Dots. Fehlen Breite und Höhe, entsteht ein vollflächig gefülltes Quadrat.', default: '1', range: '1–32000' },
        { name: 'Farbe', desc: 'B = Schwarz, W = Weiß (spart die darunterliegende Fläche aus bzw. invertiert sie).', default: 'B', range: 'B, W' },
        { name: 'Rundung', desc: 'Eckenrundung: 0 = eckig, 8 = stärkste Rundung.', default: '0', range: '0–8' },
      ],
    },
    GC: {
      name: '^GC – Grafikkreis', desc: 'Zeichnet einen Kreis (Durchmesser, Randstärke, Farbe).',
      fullName: 'Graphic Circle', germanName: 'Grafikkreis',
      params: [
        { name: 'Durchmesser', desc: 'Durchmesser des Kreises in Dots.', default: '3', range: '3–4095' },
        { name: 'Randstärke', desc: 'Dicke der Kreislinie in Dots - wächst nach innen.', default: '1', range: '1–4095' },
        { name: 'Farbe', desc: 'B = Schwarz, W = Weiß.', default: 'B', range: 'B, W' },
      ],
    },
    GD: {
      name: '^GD – Grafik-Diagonale', desc: 'Zeichnet eine diagonale Linie innerhalb eines Rechtecks.',
      fullName: 'Graphic Diagonal Line', germanName: 'Grafische Diagonallinie',
      params: [
        { name: 'Breite', desc: 'Breite des umschließenden Rechtecks in Dots. Gleich der Linienstärke ergibt eine senkrechte statt einer diagonalen Linie.', default: '', range: '1–32000' },
        { name: 'Höhe', desc: 'Höhe des umschließenden Rechtecks in Dots. Gleich der Linienstärke ergibt eine waagrechte statt einer diagonalen Linie.', default: '', range: '1–32000' },
        { name: 'Linienstärke', desc: 'Dicke der Diagonallinie in Dots.', default: '1', range: '1–32000' },
        { name: 'Farbe', desc: 'B = Schwarz, W = Weiß.', default: 'B', range: 'B, W' },
        { name: 'Richtung', desc: 'R (bzw. „/“) = rechtsgeneigt, von unten links nach oben rechts. L (bzw. „\\“) = linksgeneigt, von oben links nach unten rechts.', default: 'R', range: 'R, L' },
      ],
    },
    GE: {
      name: '^GE – Grafikellipse', desc: 'Zeichnet eine Ellipse (Breite, Höhe, Randstärke, Farbe).',
      fullName: 'Graphic Ellipse', germanName: 'Grafikellipse',
      params: [
        { name: 'Breite', desc: 'Breite der Ellipse in Dots.', default: '', range: '1–32000' },
        { name: 'Höhe', desc: 'Höhe der Ellipse in Dots. Gleiche Breite und Höhe ergeben einen Kreis.', default: '', range: '1–32000' },
        { name: 'Randstärke', desc: 'Dicke der Umrisslinie in Dots.', default: '1', range: '1–32000' },
        { name: 'Farbe', desc: 'B = Schwarz, W = Weiß.', default: 'B', range: 'B, W' },
      ],
    },
    GF: {
      name: '^GF – Eingebettete Grafik', desc: 'Bettet Bilddaten (z. B. ein Logo) direkt in das Etikett ein, Byte für Byte als Schwarz/Weiß-Bitmuster.',
      fullName: 'Graphic Field', germanName: 'Grafikfeld',
      params: [
        { name: 'Format', desc: 'A = ASCII-Hexadezimal, B = unkomprimierte Binärdaten, C = komprimierte Binärdaten.', default: '', range: 'A, B, C' },
        { name: 'Bytezähler', desc: 'Anzahl der tatsächlich übertragenen Bytes (Länge der Hex-/komprimierten Daten).', default: '', range: '' },
        { name: 'Gesamtbytes', desc: 'Gesamtzahl der Bytes des vollständig entpackten Bildes (Bytes pro Zeile × Zeilenanzahl).', default: '', range: '' },
        { name: 'Bytes/Zeile', desc: 'Anzahl der Bytes je Bildzeile.', default: '', range: '' },
        { name: 'Daten', desc: 'Die Bilddaten selbst, je nach Format als ASCII-Hex oder binär codiert.', default: '', range: '' },
      ],
    },
    GFA: {
      name: '^GFA – Eingebettete Grafik (ASCII)', desc: 'Wie ^GF, im ASCII-Hex- bzw. komprimierten Z64-Format – der übliche Weg, ein Bild direkt im Label-Code mitzuliefern.',
      fullName: 'Graphic Field (Format A, ASCII Hexadecimal)', germanName: 'Grafikfeld (Format A, ASCII-Hex)',
      params: [
        { name: 'Format', desc: 'Stets „A“ (ASCII-Hex). Dieser Editor nutzt zusätzlich eine eigene Lauflängen-Kompression (RLE) sowie optional Z64/zlib, beides weiterhin unter Format A.', default: 'A', range: 'A' },
        { name: 'Bytezähler', desc: 'Länge der (ggf. RLE-/Z64-komprimierten) übertragenen Zeichenkette.', default: '', range: '' },
        { name: 'Gesamtbytes', desc: 'Gesamtzahl der Bytes des entpackten Bildes (Bytes pro Zeile × Zeilenanzahl).', default: '', range: '' },
        { name: 'Bytes/Zeile', desc: 'Anzahl der Bytes je Bildzeile.', default: '', range: '' },
        { name: 'Daten', desc: 'ASCII-Hex-Bilddaten, komprimiert per RLE-Schema dieses Editors oder als „:Z64:“-Block.', default: '', range: '' },
      ],
    },

    XG: {
      name: '^XG – Gespeicherte Grafik platzieren', desc: 'Platziert eine zuvor mit ~DG gespeicherte, benannte Grafik (z. B. ein Logo) an der aktuellen Position, optional skaliert.',
      fullName: 'Recall Graphic', germanName: 'Grafik abrufen',
      params: [
        { name: 'Name', desc: 'Name der zuvor mit ~DG gespeicherten Grafik, optional mit Speicherort-Präfix (R:, E:, B:, A:).', default: 'Suchreihenfolge R:, E:, B:, A:', range: '' },
        { name: 'Vergrößerung X', desc: 'Vergrößerungsfaktor horizontal.', default: '1', range: '1–10' },
        { name: 'Vergrößerung Y', desc: 'Vergrößerungsfaktor vertikal.', default: '1', range: '1–10' },
      ],
    },
    ID: {
      name: '^ID – Gespeicherte Grafik löschen', desc: 'Löscht eine zuvor mit ~DG im Druckerspeicher abgelegte, benannte Grafik.',
      fullName: 'Object Delete', germanName: 'Objekt löschen',
      params: [
        { name: 'Name', desc: 'Name (optional mit Speicherort-Präfix) der zu löschenden Grafik. Unterstützt „*“ als Platzhalter für „alle“.', default: 'R:', range: '' },
      ],
    },

    PW: {
      name: '^PW – Etikettenbreite', desc: 'Die Breite des Etiketts in Dots (Bildpunkten).',
      fullName: 'Print Width', germanName: 'Druckbreite',
      params: [{ name: 'Breite', desc: 'Gesamtbreite des Etiketts in Dots.', default: '', range: '2–32000 (praktisch durch die Druckkopfbreite begrenzt)' }],
    },
    LL: {
      name: '^LL – Etikettenlänge', desc: 'Die Länge/Höhe des Etiketts in Dots (Bildpunkten).',
      fullName: 'Label Length', germanName: 'Etikettenlänge',
      params: [{ name: 'Länge', desc: 'Gesamtlänge/-höhe des Etiketts in Dots.', default: 'vorheriger Wert', range: '1–32000' }],
    },
    LH: {
      name: '^LH – Label-Home', desc: 'Verschiebt den Nullpunkt (Ursprung) des gesamten Etiketts – alle Koordinaten sind relativ dazu.',
      fullName: 'Label Home', germanName: 'Etikettenursprung',
      params: [
        { name: 'x', desc: 'Horizontale Verschiebung des Koordinaten-Nullpunkts in Dots.', default: '0', range: '0–32000' },
        { name: 'y', desc: 'Vertikale Verschiebung des Koordinaten-Nullpunkts in Dots.', default: '0', range: '0–32000' },
      ],
    },
    LS: {
      name: '^LS – Linker Versatz', desc: 'Verschiebt den Druck horizontal, ohne die Etikettenbreite selbst zu ändern.',
      fullName: 'Label Shift', germanName: 'Etikettenverschiebung',
      params: [{ name: 'Versatz', desc: 'Horizontale Verschiebung des gesamten Druckbilds in Dots (positiv = nach rechts).', default: '0', range: '-9999–9999' }],
    },
    MM: {
      name: '^MM – Druckmodus', desc: 'Was der Drucker nach dem Druck tut: abreißen, schneiden, abziehen, zurückspulen oder spenden.',
      fullName: 'Print Mode', germanName: 'Druckmodus',
      params: [
        { name: 'Modus', desc: 'T = Abreißen, P = Peel-off mit Spendekit und Entnahmesensor, R = Aufwickeln, A = Applikator, C = Cutter, D = verzögerter Cutter (~JK separat senden), F = RFID, K = Kiosk. L/U sind reservierte modellabhängige Werte.', default: 'modellabhängig', range: 'T, P, R, A, C, D, F, K, L, U' },
        { name: 'Prepeel', desc: 'Nächstes Etikett kurz vom Träger lösen, dann zurückfahren und drucken. Nur für kompatible Peel-off-Drucker, nicht für Link-OS.', default: 'N', range: 'Y, N' },
      ],
    },
    MT: {
      name: '^MT – Druckverfahren', desc: 'Wählt Thermodirekt ohne Farbband oder Thermotransfer mit Farbband.',
      fullName: 'Media Type', germanName: 'Druckverfahren',
      params: [{ name: 'Verfahren', desc: 'D = wärmeempfindliches Thermodirektmaterial, T = Thermotransfermaterial mit Farbband.', default: 'unverändert', range: 'D, T' }],
    },
    MN: {
      name: '^MN – Medienerkennung', desc: 'Bestimmt, wie Etikettengrenzen erkannt werden; löst keine Kalibrierung aus.',
      fullName: 'Media Tracking', germanName: 'Medienerkennung',
      params: [
        { name: 'Erkennung', desc: 'N = Endlos, Y/W = Lücke/Steg, M = Schwarzmarke, A = automatisch bei Kalibrierung (modellabhängig), V = Endlos mit variabler Länge (KR403).', default: 'unverändert', range: 'N, Y, W, M, A, V' },
        { name: 'Markenversatz', desc: 'Schwarzmarkenposition relativ zur Trennstelle, in Dots. Nur bei M wirksam; zulässiger Bereich hängt vom Druckermodell ab.', default: '0', range: 'meist −120 bis 283; Thermodirekt-only −80 bis 283; 600 dpi −240 bis 566; KR403 −75 bis 283' },
      ],
    },
    PO: {
      name: '^PO – Druckausrichtung', desc: 'Dreht den kompletten Druck um 180° (N = normal, I = invertiert/auf dem Kopf) – nützlich, wenn das Etikettenmaterial verkehrt eingelegt ist.',
      fullName: 'Print Orientation', germanName: 'Druckausrichtung',
      params: [{ name: 'Ausrichtung', desc: 'Wird ohne Komma direkt an „^PO“ angehängt (^PON bzw. ^POI). N = normal, I = invertiert (180°).', default: 'N', range: 'N, I' }],
    },
    CI: {
      name: '^CI – Zeichensatz', desc: 'Legt fest, wie Sonderzeichen wie Umlaute codiert werden; 28 steht für UTF-8, passend für die meisten modernen Texte.',
      fullName: 'Change International Font/Encoding', germanName: 'Internationale Schriftart/Kodierung ändern',
      params: [{ name: 'Kodierung', desc: 'Zeichensatz-/Codepage-Nummer. Gut belegt: 0 = Werksstandard, 13 = Zebra-Codepage 850, 14 = DOS 850, 15 = DOS 852, 28 = UTF-8 (von diesem Editor verwendet).', default: '0', range: '0–35 (firmwareabhängig)' }],
    },
    PR: {
      name: '^PR – Druckgeschwindigkeit', desc: 'Die Geschwindigkeit, mit der der Drucker das Etikett druckt – wird oft zusammen mit der Dunkelheit (^MD/~SD) abgestimmt.',
      fullName: 'Print Rate', germanName: 'Druckgeschwindigkeit',
      params: [
        { name: 'Druckgeschw.', desc: 'Geschwindigkeit in Zoll/Sekunde (ips), mit der gedruckt wird.', default: 'modellabhängig', range: 'meist 2–14 ips' },
        { name: 'Slew-Geschw.', desc: 'Geschwindigkeit des Materialtransports ohne Druckvorgang (z. B. Leervorschub).', default: 'höchste verfügbare Geschwindigkeit', range: 'modellabhängig' },
        { name: 'Backfeed-Geschw.', desc: 'Geschwindigkeit des Rücktransports nach dem Drucken (z. B. vor Peel-off/Rewind).', default: 'wie Druckgeschwindigkeit', range: 'modellabhängig' },
      ],
    },
    PQ: {
      name: '^PQ – Druckmenge', desc: 'Wie viele Kopien des Etiketts gedruckt werden sollen.',
      fullName: 'Print Quantity', germanName: 'Druckmenge',
      params: [
        { name: 'Menge', desc: 'Gesamtzahl der zu druckenden Etiketten.', default: '1', range: '1–99999999' },
        { name: 'Pause nach', desc: 'Nach wie vielen Etiketten der Drucker automatisch anhält (0 = nie).', default: '0', range: '0–99999999' },
        { name: 'Wiederholungen', desc: 'Anzahl Kopien je Seriennummer, bevor bei serialisierten Feldern weitergezählt wird.', default: '0', range: '0–99999999' },
        { name: 'Pause unterdrücken', desc: 'Y = keine Pause zwischen Gruppen; der Schnitt erfolgt weiterhin nach der angegebenen Anzahl. N = Pause nach jeder Gruppe.', default: 'N', range: 'Y, N' },
        { name: 'Bei Fehler schneiden', desc: 'Y = bei vorhandenem Cutter nach jedem ungültigen RFID-Etikett schneiden. N = nur beim letzten Wiederholungsversuch und wenn auch ein gültiges Etikett geschnitten würde.', default: 'Y', range: 'Y, N' },
      ],
    },

    MD: {
      name: '^MD – Relative Druckdunkelheit', desc: 'Korrigiert die Druckdunkelheit relativ zur mit ~SD eingestellten Basis.',
      fullName: 'Media Darkness', germanName: 'Relative Druckdunkelheit',
      params: [{ name: 'Korrektur', desc: 'Negative Werte drucken heller, positive dunkler. Dezimalwerte sind firmwareabhängig.', default: '0', range: '−30 bis +30' }],
    },
    SD: {
      name: '~SD – Dunkelheit (Darkness)', desc: 'Stellt die Druckdunkelheit ein – höhere Werte drucken kräftiger/dunkler, verschleißen aber den Druckkopf schneller.',
      fullName: 'Set Darkness', germanName: 'Dunkelheit einstellen',
      params: [{ name: 'Stufe', desc: '0 = sehr hell, 30 = maximale Dunkelheit. Muss auf Etiketten-/Farbbandmaterial abgestimmt werden.', default: 'zuletzt kalibrierter Wert', range: '0–30' }],
    },
    DG: {
      name: '~DG – Grafik im Speicher ablegen', desc: 'Lädt eine Grafik (z. B. ein Logo) einmalig unter einem Namen in den Druckerspeicher, damit sie per ^XG mehrfach referenziert werden kann, ohne sie jedes Mal neu zu übertragen.',
      fullName: 'Download Graphics', germanName: 'Grafik herunterladen',
      params: [
        { name: 'Name', desc: 'Name, unter dem die Grafik abgelegt wird, optional mit Speicherort-Präfix (R:, E:, B:, A:); Dateiendung ist fest .GRF.', default: 'R:', range: '' },
        { name: 'Gesamtbytes', desc: 'Gesamtzahl der Bytes des entpackten Bildes.', default: '', range: '' },
        { name: 'Bytes/Zeile', desc: 'Anzahl der Bytes je Bildzeile.', default: '', range: '' },
        { name: 'Daten', desc: 'ASCII-Hex-Bilddaten - dieselbe Codierung wie bei ^GF.', default: '', range: '' },
      ],
    },

    JM: {
      name: '^JM – Druckkopf-Auflösung', desc: 'Teil der druckerspezifischen Konfiguration/Kalibrierung, meist automatisch von der Treibersoftware erzeugt.',
      fullName: 'Set Dots per Millimeter', germanName: 'Punkte pro Millimeter festlegen',
      params: [{ name: 'Modus', desc: 'A = normale Auflösung, B = halbierte Auflösung. Muss vor dem ersten ^FS eines Formats gesendet werden und wirkt sich auf ^FO-Positionen aus.', default: 'A', range: 'A, B' }],
    },
    RS: {
      name: '^RS – RFID-Einstellungen', desc: 'Konfiguriert RFID-Lese-/Schreibparameter bei RFID-fähigen Druckern (nur relevant bei RFID-Etiketten).',
      fullName: 'Set Up RFID Parameters', germanName: 'RFID-Parameter einrichten',
      params: [
        { name: 'Tag-Typ', desc: 'Typ des RFID-Transponders (z. B. EPC Class 1 Gen 2). Nicht unterstützte Werte werden durch den Modell-Default ersetzt.', default: 'modellabhängig', range: '0–9 bzw. A–I je nach Druckerserie' },
        { name: 'Position', desc: 'Lese-/Schreibposition des Transponders relativ zum Etikettenanfang.', default: 'modellabhängig', range: 'modellabhängig' },
        { name: 'VOID-Länge', desc: 'Länge des „VOID“-Aufdrucks in Dots, falls ein Etikett wegen RFID-Fehler ungültig gemacht wird.', default: 'Etikettenlänge', range: '0–Etikettenlänge' },
        { name: 'Wiederholungen', desc: 'Anzahl Versuche bei Lese-/Programmierfehler, bevor die Fehlerbehandlung greift.', default: '3', range: '1–10' },
        { name: 'Fehlerbehandlung', desc: 'N = Format verwerfen und fortfahren, P = Drucker pausiert, E = Drucker geht in Fehlerzustand.', default: 'N', range: 'N, P, E' },
      ],
    },
    RR: {
      name: '^RR – RFID-Referenz', desc: 'Teil der RFID-Konfiguration bei RFID-fähigen Druckern.',
      fullName: 'Specify RFID Retries for a Block', germanName: 'RFID-Wiederholversuche für einen Block festlegen',
      params: [
        { name: 'Wiederholungen', desc: 'Anzahl Versuche, einen RFID-Tag-Block zu lesen/schreiben, bevor der Vorgang als fehlgeschlagen gilt.', default: '0 (Handbuch nennt widersprüchlich auch 6 als Werksvorgabe)', range: '0–10' },
        { name: 'Antennenauswahl', desc: 'Nur bei neueren Link-OS-RFID-Druckern: aktiviert adaptive Auswahl benachbarter Antennenelemente, falls das Tag nicht gefunden wird.', default: '0', range: '0, 1' },
      ],
    },
    SZ: {
      name: '^SZ – ZPL-Modus', desc: 'Wählt zwischen ZPL-II- und älteren ZPL-Modi – Treiber-/Kalibrierbefehl, im Regelfall nicht manuell nötig.',
      fullName: 'Set ZPL', germanName: 'ZPL festlegen',
      params: [{ name: 'Version', desc: '1 = ZPL (alt), 2 = ZPL II.', default: '2', range: '1, 2' }],
    },
    JZ: {
      name: '^JZ – Fehlerbehandlung', desc: 'Treiber-/Kalibrierbefehl zur Druckerkonfiguration, im Regelfall automatisch von der Druckersoftware gesetzt.',
      fullName: 'Reprint After Error', germanName: 'Nachdruck nach Fehler',
      params: [{ name: 'Nachdruck', desc: 'Ob ein durch Band-/Etikettenende oder offenen Druckkopf unterbrochenes Etikett nach Behebung der Störung automatisch neu gedruckt wird.', default: 'Y', range: 'Y, N' }],
    },
    PM: {
      name: '^PM – Druckausrichtung (Modus)', desc: 'Treiber-/Kalibrierbefehl zur Druckerkonfiguration, im Regelfall automatisch von der Druckersoftware gesetzt.',
      fullName: 'Printing Mirror Image of Label', germanName: 'Spiegelbild des Etiketts drucken',
      params: [{ name: 'Spiegeln', desc: 'Ob die gesamte bedruckbare Fläche links-rechts gespiegelt gedruckt wird.', default: 'N', range: 'Y, N' }],
    },
    TA: {
      name: '~TA – Tear-off-Anpassung', desc: 'Feinjustiert die Abrisskante des Druckers – ein Kalibrierbefehl, meist automatisch vom Treiber gesetzt.',
      fullName: 'Tear-off Adjust Position', germanName: 'Abrissposition anpassen',
      params: [{ name: 'Versatz', desc: 'Verschiebt die Ruheposition der Medien nach dem Druck (in Dots) und damit die Abriss-/Schnittkante. Muss 3-stellig übergeben werden.', default: 'zuletzt gespeicherter Wert', range: '-120–120' }],
    },
    JS: {
      name: '~JS – Sensor-Kalibrierung', desc: 'Kalibriert die Etikettensensoren des Druckers – ein Treiberbefehl, im Regelfall nicht manuell nötig.',
      fullName: 'Change Backfeed Sequence', germanName: 'Backfeed-Reihenfolge ändern',
      params: [{ name: 'Anteil', desc: 'Welcher Anteil des Rücktransports (Backfeed) direkt nach dem Drucken/Schneiden erfolgt statt erst vor dem nächsten Etikett: A = 100% sofort, B = 0% sofort, N = normal (90%), O = aus, oder ein 10er-Prozentwert.', default: 'N', range: 'A, B, N, O, 10–90' }],
    },
  };

  // Diese Codes werden mit ~ statt ^ eingeleitet (Zebra-Konvention: Befehle,
  // die auch außerhalb eines ^XA…^XZ-Blocks gültig sind).
  const TILDE_CODES = { SD: true, DG: true, TA: true, JS: true };

  // Längster Code zuerst, damit z. B. "GFA" vor "GF" und "JZ" korrekt greift.
  const SORTED_CODES = Object.keys(COMMANDS).sort(function (a, b) { return b.length - a.length; });

  // token: z. B. "^BY2,3,60" oder "~DGR:LOGO.GRF,1234,12,..." (inkl. führendem
  // ^ oder ~). Gibt {name, desc, fullName, germanName, params} zurück oder
  // null, wenn unbekannt.
  function lookup(token) {
    if (!token) return null;
    const marker = token[0];
    if (marker !== '^' && marker !== '~') return null;
    const rest = token.slice(1).toUpperCase();

    // Barcode-Feld: ^B<Typ> - vor der generischen Liste prüfen, da "B" allein
    // kein eigener Befehl ist.
    if (marker === '^' && rest[0] === 'B' && rest.length > 1) {
      const sub = BARCODE_SUBTYPE_INFO[rest[1]];
      if (sub) {
        return {
          name: '^B' + rest[1] + ' – Barcode: ' + sub.label, desc: sub.desc,
          fullName: sub.fullName, germanName: sub.germanName, params: sub.params,
        };
      }
    }

    for (let i = 0; i < SORTED_CODES.length; i++) {
      const code = SORTED_CODES[i];
      if (rest.indexOf(code) !== 0) continue;
      const isTilde = !!TILDE_CODES[code];
      if (isTilde === (marker === '~')) return COMMANDS[code];
    }
    return null;
  }

  // Zerlegt rohen ZPL-Text in Tokens: reiner Text (zwischen Befehlen) und
  // Befehls-Tokens (beginnend mit ^ oder ~ bis zum nächsten ^/~ oder Zeilenende
  // außerhalb von ^FD-Feldinhalten wird bewusst nicht unterschieden - für die
  // Lernansicht reicht eine einfache, robuste Heuristik).
  function tokenize(text) {
    const tokens = [];
    const re = /[\^~][A-Za-z0-9]{1,4}/g;
    let lastIndex = 0;
    let m;
    while ((m = re.exec(text))) {
      if (m.index > lastIndex) tokens.push({ isCommand: false, text: text.slice(lastIndex, m.index) });
      // Command token grows until the next ^/~ (its parameters), so re-scan
      // from here for the actual boundary.
      const start = m.index;
      let end = text.length;
      const nextMarker = text.slice(start + 1).search(/[\^~]/);
      end = nextMarker === -1 ? text.length : start + 1 + nextMarker;
      tokens.push({ isCommand: true, text: text.slice(start, end) });
      re.lastIndex = end;
      lastIndex = end;
    }
    if (lastIndex < text.length) tokens.push({ isCommand: false, text: text.slice(lastIndex) });
    return tokens;
  }

  // Liefert die eindeutigen, im Text vorkommenden Befehle (in erster
  // Auftrittsreihenfolge) für eine Legende unter der Code-Ansicht.
  function commandsUsedIn(text) {
    const seen = [];
    const seenKeys = {};
    tokenize(text).forEach(function (tok) {
      if (!tok.isCommand) return;
      const entry = lookup(tok.text);
      if (!entry) return;
      if (seenKeys[entry.name]) return;
      seenKeys[entry.name] = true;
      seen.push(entry);
    });
    return seen;
  }

  global.ZPLGlossary = { lookup: lookup, tokenize: tokenize, commandsUsedIn: commandsUsedIn };
})(typeof globalThis !== 'undefined' ? globalThis : this);
