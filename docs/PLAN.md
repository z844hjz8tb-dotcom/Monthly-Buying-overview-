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
| M5 | Kassenbon-Erfassung (Foto/PDF) mit Prüf-Ansicht (Summe der Zeilen = Bon-Summe?) | ⏳ |
| M6 | Normalisierung (Alias-Tabelle, Vorschläge per Fuzzy-Match, lernt aus Bestätigungen), Top-Artikel des Monats → **Phase 2 fertig** | ⏳ |
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

## Handy-Besonderheit: Datensicherheit

Mobile Browser können IndexedDB bei Speichermangel löschen. Gegenmaßnahmen:
1. App zum Startbildschirm hinzufügen und **dauerhaften Speicher** anfordern (Daten-Tab).
2. **Backup** nach jedem Monatsimport herunterladen.

## Monatliche Erinnerung

Am 1. jedes Monats. Möglich als Kalendertermin (`.ics`), als Hinweis in der App (letzter Import älter als 30 Tage) oder über Home Assistant.
