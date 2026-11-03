# Plan: Ausgaben-Tracker

Persönliches Tool für die Ausgabenübersicht. Start mit Amazon-Bestellungen (Phase 1), danach Kassenbons aus Lebensmittel- und Drogerieeinkäufen (Phase 2).

## Entscheidungen

| Thema | Entscheidung |
|---|---|
| Hauptgerät | Handy (Mobile-first, als PWA installierbar) |
| Hosting | Statische Seite auf GitHub Pages; **Daten bleiben im Browser des Geräts** |
| Framework | React + TypeScript + Vite |
| Speicher | IndexedDB über Dexie.js, Beträge als ganze Cent |
| Routing | HashRouter (funktioniert ohne Server-Konfiguration auf GitHub Pages) |
| Tests | Vitest (+ fake-indexeddb) |
| Bon-Erkennung (Phase 2) | **offen**: lokal (Tesseract.js) oder Claude Vision API |

## Datenmodell

```
Order        { orderId (PK), date, totalCents, source: "amazon", status?, importedAt, updatedAt }
OrderItem    { id, orderId, title, quantity, unitPriceCents | null, asin? }
Receipt      { id, store, date, totalCents, source: "photo"|"app"|"manual", createdAt }
ReceiptLine  { id, receiptId, rawText, quantity, priceCents, productId? }
Product      { id, canonicalName, category? }
Alias        { id, store, rawText -> productId }   // eindeutig je [store+rawText]
Meta         { key, value }                        // z. B. lastBackupAt, lastImportAt
```

Duplikate: `orderId` ist Primärschlüssel. Ein erneuter Import derselben Bestellung **aktualisiert** sie (z. B. nachträgliche Stornierung), statt sie doppelt anzulegen.

## Projektstruktur

```
amazon-script/     Konsolen-Skript für die amazon.de-Bestellübersicht
src/db/            Dexie-Schema, Backup
src/import/        Amazon-Import, Duplikat-Erkennung
src/receipts/      (Phase 2) Bon-Erfassung
src/normalize/     (Phase 2) Artikel-Zusammenführung
src/views/         Übersicht, Import, Daten/Backup
src/lib/           Hilfsfunktionen (Geld, Download)
tests/             Unit-Tests, tests/fixtures/ für Beispieldaten
```

## Meilensteine

| # | Inhalt | Status |
|---|---|---|
| M1 | Projektgerüst, Datenbank, Backup-Export/-Import, PWA, GitHub-Pages-Deployment | ✅ |
| M2 | Amazon-Konsolen-Skript (paginiert, lädt Detailseiten für Einzelpreise, Selektoren im `CONFIG`-Block, Prüfbericht am Ende) | ⏳ wartet auf gespeicherte Amazon-Seiten |
| M3 | Import mit Vorschau ("neu / aktualisiert / unverändert") und Duplikat-Erkennung | ✅ |
| M4 | Jahresübersicht, Monatsübersicht, Artikelliste pro Monat → **Phase 1 fertig** | ✅ (mit Beispieldaten getestet) |
| M5 | Kassenbon-Erfassung (manuell + Foto) mit Summenprüfung | ✅ |
| M6 | Normalisierung (Alias-Tabelle, Vorschläge per Fuzzy-Match, lernt aus Bestätigungen), Top-Artikel des Monats | ✅ |
| M7a | Bon-Leser + PDF-eBons (pdf.js, lokal) | ✅ |
| M7b | Bon-Bilder lokal auslesen (tesseract.js, deutsch) | ✅ Müller getestet (46/46 und 7/7 Artikel) |
| M7c | Kaufland, Penny, Lidl am echten Bon prüfen | ⏳ wartet auf Beispiel-Bons |
| M7d | Optional: KI-Erkennung für Fotos von Papierbons | offen |
| später | Abgleich der Top-Artikel mit Prospektangeboten | – |

## Austauschformat Amazon-Skript → App

Die App erwartet eine JSON-Datei in diesem Format (siehe `src/import/amazon.ts`):

```json
{
  "format": "ausgaben-tracker-amazon",
  "version": 1,
  "exportedAt": "2026-12-01T08:00:00Z",
  "orders": [
    {
      "orderId": "302-1234567-1234567",
      "date": "2026-11-02",
      "totalCents": 2498,
      "status": "ok",
      "items": [{ "title": "USB-C Kabel", "quantity": 2, "unitPriceCents": 999, "asin": "B0..." }]
    }
  ]
}
```

- `status`: `ok` (Standard), `cancelled` oder `returned`. Die beiden letzten zählen nicht zu den Ausgaben.
- `unitPriceCents` darf `null` sein, wenn das Skript keinen Preis findet. Die Bestellsumme zählt trotzdem.
- Monats- und Jahressummen basieren auf `totalCents` (inkl. Versand).

## Amazon-Skript: bekannte Risiken

- Die Bestellübersicht zeigt oft nur Bestellsummen. Einzelpreise stehen auf der Detailseite, also ein zusätzlicher Abruf pro Bestellung (mit Pause dazwischen).
- Amazon ändert das Layout. Deshalb stehen alle Selektoren zentral im Skript, mit Ausweich-Selektoren, und am Ende kommt ein Prüfbericht.
- Sonderfälle: Stornos, Rücksendungen, Mehrfach-Artikel, Marketplace, digitale Käufe.
- Hilfreich für die Entwicklung: eine gespeicherte HTML-Seite der Bestellübersicht (persönliche Daten geschwärzt).

## Kassenbons: Zusammenführen von Artikeln

- Bonzeilen speichern nur den Originaltext. Die Zuordnung zum Produkt läuft über die Tabelle `aliases` (Laden + normalisierter Text → Produkt oder „ignoriert“). Eine geänderte Zuordnung gilt sofort für alle Bons.
- Normalisierung (`src/normalize/match.ts`): Kleinschreibung, Umlaute, „3,5“ → „3.5“, „3,5 %“ = „3,5%“, „1 kg“ = „1kg“.
- Vorschläge: wortweiser Vergleich, Abkürzungen zählen als Wortanfang („VOLLM“ → „Vollmilch“). Verglichen wird mit Produktnamen **und** allen bekannten Schreibweisen, deshalb werden die Vorschläge mit jeder Zuordnung besser.
- Top-Artikel: Stückzahl und Ausgaben pro Monat, dazu der Durchschnittspreis je Laden (günstigster zuerst). Pfand, Tüten und Rabatte lassen sich ignorieren.
- Bon-Fotos werden auf etwa 1600 px verkleinert gespeichert und sind im Backup enthalten.

## Bons aus Apps (iPhone)

| Laden | Weg |
|---|---|
| Penny | eBon-PDF → „In Dateien sichern“ → „PDF-Bon“ |
| Müller | Bild aus der App sichern → „🖼️ Bon-Bild“ |
| Lidl, Kaufland | Screenshot oder PDF → „🖼️ Bon-Bild“ bzw. „📄 PDF-Bon“ |
| Papierbon | Foto → „🖼️ Bon-Bild“ (schlechter als App-Bilder) |

Live Text (iPhone) wurde verworfen: Es erkannte nicht alle Zeilen.

**Texterkennung** (`src/receipts/ocr.ts`): tesseract.js mit deutschen Sprachdaten, von der App selbst ausgeliefert (`scripts/copy-ocr.mjs` → `public/ocr`, ca. 5 MB, wird erst beim ersten Gebrauch geladen und dann offline gespeichert). Vorher wird das Bild ganzzahlig auf ca. 1500 px Breite vergrößert und in Schwarz-Weiß umgewandelt – ohne das fehlen die Artikelzeilen. Typische Fehler (0↔9, „1l“ statt „1“) korrigiert der Leser über die Preis-Spalte.

Der Leser (`src/receipts/parse.ts`) erkennt Müller-Tabellenzeilen (Menge, Preis, Nachlass, Summe), Artikel- und Mengenzeilen, Gewichtszeilen, Rabatte (werden mit dem Artikel davor verrechnet), Summe, Laden und Datum. Live-Text-Spalten (erst alle Namen, dann alle Preise) werden der Reihe nach gepaart.

## Handy-Besonderheit: Datensicherheit

Mobile Browser können IndexedDB bei Speichermangel löschen. Gegenmaßnahmen:
1. App zum Startbildschirm hinzufügen und **dauerhaften Speicher** anfordern (Daten-Tab).
2. **Backup** nach jedem Monatsimport herunterladen.

## Monatliche Erinnerung

Am 1. jedes Monats. Möglich als Kalendertermin (`.ics`), als Hinweis in der App (letzter Import älter als 30 Tage) oder über Home Assistant.
