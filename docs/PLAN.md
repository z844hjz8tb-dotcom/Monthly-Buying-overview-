# Plan: Ausgaben-Tracker

Persönliches Tool für die Ausgabenübersicht. Start mit Amazon-Bestellungen (Phase 1), danach Kassenbons aus Lebensmittel- und Drogerieeinkäufen (Phase 2).

## Aktueller Stand (05.11.2026)

**Live:** https://z844hjz8tb-dotcom.github.io/Monthly-Buying-overview-/ (Deploy bei jedem Push auf `main`)

**Fertig**
- Amazon: Import der Export-Datei mit Duplikat-Erkennung, Jahres-/Monatsansicht, Artikelliste (mit Beispieldaten getestet; das Skript fehlt noch)
- Kassenbons: Erfassung, Foto, Summenprüfung, Zuordnen mit Vorschlägen, Produkte verwalten, Top-Artikel mit günstigstem Laden
- Bon einlesen: 🖼️ Bon-Bild (lokale OCR) und 📄 PDF-Bon – an echten Bons aller vier Läden geprüft, Summe jeweils auf den Cent:
  Müller-Bild (46 + 7 Artikel), Lidl-Bild (12), Kaufland-PDF (93), Penny-PDF (74)
- Backup/Wiederherstellung (inkl. Fotos), Beispieldaten, Erinnerungshinweis nach 30 Tagen ohne Import
- Design (PR #10): Hero-Bereiche mit großer Summe, eigene Icons, Schrift Plus Jakarta Sans, schwebende Navigation, Laden-Avatare, Top-Artikel mit Rang und Anteilsbalken. Drei Farbwelten unter „Daten & Design“: **Frisch** (Standard), **Sonne**, **Abend** (immer dunkel); pro Gerät gespeichert. Nutzer hat noch keine Farbwelt als Favorit gewählt.

- Haushaltsbuch H1 (PR #14): neue **Übersicht** als Startbildschirm (alle Ausgaben des Monats nach Kategorie über Buchungen, Amazon und Bons; Einnahmen; Vergleich zum Vormonat; Kacheln je Quelle), **Konten** (ING, Amex, PayPal, Bargeld) mit Buchungen je Monat, **Buchung von Hand** (Ausgabe/Einnahme/Umbuchung). Datenbank-Version 3. Navigation: Übersicht · Konten · Amazon · Bons · Daten.

- Haushaltsbuch H1b: **Konten verwalten** (anlegen, Art, IBAN, Schalter „Geld hierhin zählt als Sparen“, manueller Stand, ausblenden), **Umbuchung von → nach** als zwei verbundene Buchungen, **„Gespart“ getrennt neben den Ausgaben** (Sparquote, Karte „Gespart“ je Zielkonto), Kontenliste getrennt in „Alltag“ und „Sparen & Anlagen“.

- Haushaltsbuch H2 (ING-Import): CSV aus dem ING-Online-Banking (Daten → Importe bzw. Konten → „Umsätze importieren“). Vorschau mit Einordnung, Duplikat-Erkennung, Kontostand und IBAN aus der Datei, eigene Namen aus dem Dateikopf. Importierte Buchungen lassen sich einordnen; „Für alle … merken“ lernt Kategorie-Regeln bzw. „Erkennen an“ beim Zielkonto und ordnet alle gleichen Buchungen neu ein. Mit der echten Datei des Nutzers (504 Buchungen, Aug–Nov) lokal geprüft – die Datei ist **nicht** im Repo.

- Kategorien ergänzt (06.11.2026): **Hausbau**, **Gesundheit**, **Haustier**, **Schule & Kita** (14 Kategorien). Bei geänderten eingebauten Regeln (`RULES_VERSION`) werden importierte Buchungen beim App-Start einmal neu eingeordnet.

- Haushaltsbuch H3 (Amex-Import): gleiche Import-Seite erkennt ING- und Amex-Datei automatisch. Mit den echten Dateien des Nutzers lokal geprüft (59 Amex-Buchungen) – nicht im Repo.

- **Hilfe in der App** (`/hilfe`, `src/help/topics.tsx`): Anleitungen zu Monatsroutine, ING, Amex, Amazon-Skript, Bons, Konten, Kategorien, was zählt, Backup, FAQ; ?-Knopf oben öffnet das passende Thema. Bei geänderten Abläufen mitpflegen.
- Haushaltsbuch H5 (Bons ↔ Kartenzahlung, `src/finance/links.ts`): automatisch bei eindeutigem Laden + Betrag + Kaufdatum (±1 Tag, Kaufdatum aus „KAUFUMSATZ TT.MM“/ISO-Zeitstempel); unsichere Fälle (Coupon bis 2 €, Laden nicht erkennbar) als Vorschlag im Bons-Tab; „Bar bezahlt“ im Bon; läuft nach Bank-Import, nach Bon-Speichern und beim Start. Mit echtem Lidl-Bon + ING-Export lokal geprüft.

- Amazon-Rücksendungen: Gutschriften mit Bestellnummer werden unter Amazon bei der Bestellung abgezogen; Artikel, deren Preise genau die Erstattung ergeben, als „zurückgeschickt“ markiert; nur Zahlungen (nicht Erstattungen) mit Bestellnummer verdrängen die Bestellung in der Übersicht.

- Haushaltsbuch H4 (PayPal-Import, `src/import/paypal.ts`, `src/finance/paypal.ts`): Aktivitäts-CSV; Finanzierungszeilen („Bankgutschrift auf PayPal-Konto“, „Käuferkredit“, „Gutschrift auf Kreditkarte“) hängen über den zugehörigen Transaktionscode an der Zahlung (`funding`). Gezählt wird die PayPal-Zahlung (Netto inkl. Gebühr) mit Händler/Kategorie; die Abbuchung auf ING/Amex wird verknüpft (gleicher Betrag, 0–7 Tage später, Händlername im Verwendungszweck hat Vorrang) und zählt nicht (`viaTransactionId`). Rückzahlung an „PayPal (Europe)“ = Umbuchung (Einkauf zählt am Kauftag), „Abbuchung“ = Umbuchung aufs Girokonto, Handyzahlung von Freunden = Einnahme. Nur EUR. Mit den echten Dateien des Nutzers lokal geprüft (nicht im Repo): alle Abbuchungen im Überschneidungszeitraum verknüpft.

**Nutzer:** iPhone, Girokonto ING (dazu Extra-Konten, Depot und Kinderkonten bei der ING), Aktienkonto bei Uptevia (nur auflisten, kein Geldfluss), Kreditkarte American Express, PayPal; Kreditkosten nur als monatliche Rate; Läden Müller, Lidl (Bild-Export), Kaufland, Penny (PDF-Export).

**Nächste Schritte**
1. Rückmeldung zu PayPal abwarten: regelmäßige gleich hohe Rückzahlung an PayPal (Ratenzahlung für einen Kauf vor dem Exportzeitraum) als Rate zählen? Gibt es ein zweites PayPal-Konto (zweite PayPal-Kennung auf dem Girokonto)?
   Bausparkasse geklärt (06.11.2026): zwei Vorausdarlehen – „Zins“-Lastschrift = Kredite, „U.A.“ (Ansparung in den Bausparvertrag) = Gespart; optional Konto „Bausparvertrag“ (Tagesgeld, zählt als Sparen) als Ziel.
2. Nutzer erfasst echte Bons auf dem iPhone und ordnet Artikel zu → Rückmeldungen einarbeiten (Text unter „Erkannten Text anzeigen“ hilft bei Fehlern). Rückmeldung zum Design und zur bevorzugten Farbwelt abwarten.
3. **M2 Amazon-Skript am PC ausprobieren** – fertig (Amazon → „Amazon-Datei importieren“ → Schritt 1: Skript kopieren). Detailseite an echter Seite geprüft; das Laden der Übersichtsseiten (Amazon entschlüsselt sie erst im Browser, Skript lädt weitere Seiten in einem unsichtbaren Rahmen) kann nur der Nutzer testen → Rückmeldung abwarten.
4. Monatliche Erinnerung am 1. (z. B. `.ics`-Kalendereintrag) – bisher nur Hinweis in der App.
5. Danach: H6 (Fixkosten & Kredite), H7 (verschlüsseltes Backup), Erinnerung am Monatsersten.
6. Später: Abgleich der Top-Artikel mit Prospektangeboten (siehe Abschnitt „Prospektangebote: Machbarkeit“); optional KI für Fotos von Papierbons.

**Hinweise**
- Die Repo ist öffentlich. Testdateien enthalten keine Adressen/Zahlungsdaten – bei neuen Bons genauso bereinigen. In der Git-Historie (PR #5) steht noch eine Müller-Filialadresse; Entfernen wurde angeboten, nicht entschieden.
- Arbeitsweise: Feature-Branch → PR → Squash-Merge nach `main` (vom Nutzer so gewünscht), danach Deploy-Lauf prüfen.

## Phase 3: Haushaltsbuch (freigegeben 05.11.2026)

Ziel: Alle Ausgaben an einem Ort – Girokonto (ING), Kreditkarte (American Express), PayPal, Bargeld, feste Kosten und Kreditraten – ergänzt um die Details aus Amazon und Kassenbons. Weiterhin ohne Bank-Zugangsdaten: Import per Export-Datei, einmal im Monat.

### Bausteine der App
| Baustein | Inhalt |
|---|---|
| **Übersicht** (neuer Start) | Monat gesamt: Ausgaben nach Kategorie, Vergleich zum Vormonat, feste Kosten vs. variable Ausgaben |
| **Konten** | ING Giro, Amex, PayPal, Bargeld – Buchungsliste je Konto, Suche, Kategorie ändern |
| **Amazon** | wie bisher (Details zu Amazon-Buchungen) |
| **Bons** | wie bisher (Details zu Supermarkt-Buchungen) |
| **Fixkosten & Kredite** | Monatliche Raten, Abos, Miete; aus dem Girokonto erkannt oder von Hand angelegt |
| **Import & Daten** | alle Importe an einer Stelle, Backup, Design |

### Umbuchungen und Sparen (festgelegt 05.11.2026)
| Bewegung | Zählt als |
|---|---|
| Giro ↔ Extra-Konto (Tagesgeld) | gar nicht (Umbuchung) |
| auf ein Konto mit „Geld hierhin zählt als Sparen“ (Standard: Depot; z. B. auch Kinderkonten) | **„Gespart“**, getrennt neben den Ausgaben |
| zurück von so einem Konto | mindert „Gespart“, ist keine Einnahme |
| Dividenden, Zinsen | Einnahme |
| Uptevia | nur aufgelistet mit manuellem Stand, keine Buchungen |

Technik: Umbuchung = zwei Buchungen (`kind` "transfer" oder "saving", `transferAccountId`, gegenseitige `pairId`); gezählt wird nur die Seite auf dem Alltagskonto.

### ING-Export: Erkenntnisse (aus der echten Datei, ohne persönliche Daten)
- ISO-8859-1, Semikolon, Kopfzeilen (IBAN, Kontoname, Kunde, Zeitraum, Saldo), dann `Buchung;Wertstellungsdatum;Auftraggeber/Empfänger;Buchungstext;Verwendungszweck;Referenz;Saldo;Währung;Betrag;Währung`.
- **Keine Gegen-IBAN** in der Datei → Umbuchungen nur über Namen erkennbar (Kontoname, „Erkennen an“, eigene Namen).
- Buchungstexte: Lastschrift (auch Visa-Debit „VISA …“), Gutschrift, Überweisung, Echtzeitüberweisung, Dauerauftrag / Terminueberweisung, **Wertpapierkauf** (Sparplan), Gehalt/Rente, Bezüge, Entgelt, Abschluss.
- Die ING fügt im Verwendungszweck an Zeilenumbrüchen Leerzeichen ein („Servi ces“) → Muster erlauben ein eingeschobenes Leerzeichen.
- Amazon-Lastschriften/-Gutschriften enthalten die Bestellnummer → `linkedOrderId`.
- Girocard-Abhebung am Automaten: Empfänger = Bank, Verwendungszweck mit „Folgenr.“; Visa: „Bargeldauszahlung“.

### Grundregel gegen Doppelzählung
Geld zählt **einmal, dort wo es das Konto verlässt**. Alles andere wird damit verknüpft:
- **Umbuchungen zählen nicht:** Amex-Abrechnung vom Girokonto abgebucht, PayPal-Aufladung/Lastschrift vom Girokonto → das sind nur Verschiebungen zwischen eigenen Konten.
- **PayPal ↔ Konto/Karte:** Die PayPal-Zahlung (mit Händlername) ist die eigentliche Ausgabe; die zugehörige Abbuchung auf ING/Amex wird als „über PayPal“ verknüpft.
- **Amazon & Bons sind Details:** Eine Amex-Buchung „AMAZON…“ wird mit der Amazon-Bestellung verknüpft, „LIDL…“ mit dem Lidl-Bon (Betrag + Datum ± 3 Tage). Bons ohne passende Buchung (bar bezahlt) zählen auf dem Bargeld-Konto.
- Unsichere Fälle zeigt die App zur Bestätigung an, statt zu raten.

### Kategorien
Feste Liste zum Start (Lebensmittel, Drogerie, Online-Shopping, Wohnen, Kredite, Versicherungen, Abos, Mobilität, Freizeit, Sonstiges), änderbar. Zuordnung über Regeln nach Empfänger/Verwendungszweck („NETFLIX“ → Abos); jede Korrektur kann zur Regel werden.

### Datenmodell (neu, Dexie-Version 3)
```
Account      { id, name, kind: "giro"|"credit"|"paypal"|"cash" }
Transaction  { id, accountId, date, amountCents (negativ = Ausgabe), counterparty, purpose,
               categoryId?, kind: "expense"|"income"|"transfer", importKey (Duplikate),
               linkedOrderId?, linkedReceiptId?, viaTransactionId? }
Category     { id, name, icon, color }
CategoryRule { id, pattern, field: "counterparty"|"purpose", categoryId }
Recurring    { id, name, amountCents, dayOfMonth, start, end?, categoryId, accountId, matchPattern? }
```
Duplikate beim erneuten Import: PayPal hat Transaktionscodes; ING und Amex über einen Schlüssel aus Datum + Betrag + Text (+ laufende Nummer bei gleichen Zeilen).

### Importe (Format wird an echten Beispieldateien geprüft)
| Quelle | Export | Erwartung (noch zu bestätigen) |
|---|---|---|
| ING Girokonto | Online-Banking → Umsätze → Export CSV | Semikolon-getrennt, Kopfzeilen mit Kontodaten, dann Buchung, Valuta, Auftraggeber/Empfänger, Buchungstext, Verwendungszweck, Saldo, Betrag |
| American Express | Online-Konto → Umsätze → Herunterladen (CSV) | Datum, Beschreibung, Betrag (positiv = Belastung), ggf. Kategorie/Händlerdetails |
| PayPal | Aktivitäten → Berichte → Aktivitätsdownload (CSV) | Datum, Name, Typ, Status, Brutto, Gebühr, Netto, Transaktionscode, zugehöriger Code |

Testdateien kommen nur bereinigt ins Repo (keine IBAN, Namen, Kartennummern) – Repo ist öffentlich.

### Fixkosten & Kredite
Nur die monatliche Rate (kein Restschuld-/Zinsplan). Die App schlägt wiederkehrende Abbuchungen aus dem Girokonto als Fixkosten vor („jeden Monat ~250 € an XY-Bank“); Raten, die (noch) nicht in den Importen stehen, lassen sich von Hand anlegen. Vorschau: feste Kosten des kommenden Monats.

### Sicherheit
Bankdaten sind sensibler als Bons: Backup optional mit Passwort verschlüsseln (WebCrypto, AES-GCM). Daten bleiben weiterhin nur auf dem Gerät.

### Meilensteine
| # | Inhalt | Status |
|---|---|---|
| H1 | Datenmodell, Konten, Kategorien, manuelle Buchung, neue Übersicht nach Kategorie, Navigation in Bausteine | ✅ |
| H1b | Konten verwalten, Umbuchungen von/nach, Sparen getrennt („Gespart“), manueller Stand | ✅ |
| H2 | ING-CSV-Import: Einordnung (Kredite, Wertpapierkauf=Sparen, eigene Konten über „Erkennen an“, eigene Namen, Amex-Abrechnung, Bargeld, Gehalt, Erstattungen), Duplikate über Datum+Betrag+Saldo, Lernen per „merken“, Amazon-Bestellnummer verknüpft | ✅ |
| H3 | Amex-CSV-Import (Datum TT/MM/JJJJ, positiv = Belastung, Händler = erste 23 Zeichen); Ausgleich „Zahlung erhalten“ = Umbuchung vom Girokonto; Gutschriften = Erstattung; Duplikate über Datum+Betrag+Text+laufende Nummer | ✅ |
| H4 | PayPal-CSV-Import; Verknüpfung mit ING/Amex | ✅ |
| H5 | Verknüpfung Amazon-Bestellungen (Bestellnummer) und Bons (Laden/Betrag/Datum) mit Buchungen | ✅ |
| H6 | Fixkosten & Kredite (Erkennung + manuell), Vorschau | ⏳ |
| H7 | Verschlüsseltes Backup | ⏳ |

Benötigt vom Nutzer: je eine Beispiel-Exportdatei von ING, Amex und PayPal (gern geschwärzt).

## Entscheidungen

| Thema | Entscheidung |
|---|---|
| Hauptgerät | Handy (Mobile-first, als PWA installierbar) |
| Hosting | Statische Seite auf GitHub Pages; **Daten bleiben im Browser des Geräts** |
| Framework | React + TypeScript + Vite |
| Speicher | IndexedDB über Dexie.js, Beträge als ganze Cent |
| Routing | HashRouter (funktioniert ohne Server-Konfiguration auf GitHub Pages) |
| Tests | Vitest (+ fake-indexeddb) |
| Bon-Erkennung (Phase 2) | Lokal: pdf.js für PDF-eBons, tesseract.js für Bilder. iPhone Live Text verworfen (unvollständig). KI nur noch optional für Papierfotos |

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
| M2 | Amazon-Konsolen-Skript (`amazon-script/amazon-export.js`, in der App kopierbar): Bestellnummern aus der (im Browser entschlüsselten) Übersicht, weitere Seiten per unsichtbarem Rahmen, Details per `data-component`-Bezeichner, Selektoren im `CONFIG`-Block, Prüfbericht | ✅ gebaut, ⏳ Praxistest durch Nutzer |
| M3 | Import mit Vorschau ("neu / aktualisiert / unverändert") und Duplikat-Erkennung | ✅ |
| M4 | Jahresübersicht, Monatsübersicht, Artikelliste pro Monat → **Phase 1 fertig** | ✅ (mit Beispieldaten getestet) |
| M5 | Kassenbon-Erfassung (manuell + Foto) mit Summenprüfung | ✅ |
| M6 | Normalisierung (Alias-Tabelle, Vorschläge per Fuzzy-Match, lernt aus Bestätigungen), Top-Artikel des Monats | ✅ |
| M7a | Bon-Leser + PDF-eBons (pdf.js, lokal) | ✅ |
| M7b | Bon-Bilder lokal auslesen (tesseract.js, deutsch) | ✅ Müller getestet (46/46 und 7/7 Artikel) |
| M7c | Echte Bons prüfen | ✅ Müller-Bild, Kaufland-PDF, Penny-PDF, Lidl-Bild |
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

## Amazon-Seiten: Erkenntnisse (06.11.2026)
- **Übersicht** („Meine Bestellungen“): Inhalt der Bestellkarten ist im ausgelieferten HTML verschlüsselt (`csd-encrypted-sensitive`) und wird erst im Browser per JavaScript entschlüsselt → `fetch` der Übersicht nützt nichts; das Skript liest die geöffnete Seite und lädt weitere Seiten (`?page=N`) in einem unsichtbaren iframe.
- **Detailseite**: fertig ausgeliefert, Felder mit `data-component` markiert (`orderId`, `orderDate`, `chargeSummary`, `itemTitle`, `quantity`, `unitPrice` mit `.a-offscreen`, `cancelled`) → stabil per `fetch` + `DOMParser` lesbar.
- Amazon-Lastschriften auf der ING enthalten dieselbe Bestellnummer → Verknüpfung klappt (an einer echten Bestellung geprüft).

### Erster Praxistest (06.11.2026, 26 Bestellungen Aug–Okt)
- Gesamtsummen stimmen mit den ING-Abbuchungen überein (auch bei Abbuchung in mehreren Teilen).
- Mengen > 1 wurden nicht gelesen → Skript-Version 2: Menge zusätzlich in Markierungen im Artikelblock suchen und aus der **Zwischensumme** ableiten; Prüfbericht bei Abweichung.
- Zweiter Lauf (99 Bestellungen Jan–Okt) geprüft: Mengen stimmen. Summe > Artikel = Versandkosten, Summe < Artikel = Spar-Abo/Coupon/Gutschein, Summe 0 = komplett mit Gutschein bezahlt bzw. Ersatzlieferung – alles plausibel, vom Nutzer bestätigt.
- „Zwischensumme“ ist auf den meisten Seiten der **Netto**-Betrag → wird dann ignoriert (Steuerzeile oder Artikel = Zwischensumme × 1,19/1,07).
- „Amazon Monatsabrechnung“ auf der ING (Sammelzahlung ohne Bestellnummer) → Umbuchung, sonst Doppelzählung.
- Zeitraum „letzte 3 Monate“ lässt Bestellungen am Rand weg → ganzes Jahr wählen.

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

## Prospektangebote: Machbarkeit (Stand 04.11.2026, noch nicht selbst getestet)

Ziel: wöchentlich Angebote von Lidl, Kaufland, Penny, Müller, Rewe, Aldi Süd/Nord, Edeka holen und mit den eigenen Top-Artikeln abgleichen.

**Geplanter Aufbau:** Wöchentlicher GitHub-Actions-Lauf holt die Angebote und legt `angebote.json` neben die App (gleiche Herkunft, kein CORS-Problem). Der Abgleich mit den eigenen Produkten passiert nur auf dem Gerät (`src/normalize/match.ts`); die Einkaufsliste kommt nie ins öffentliche Repo. Start mit bundesweiten Angeboten (ohne Postleitzahl).

**Recherche (aus zweiter Hand):**
| Laden | Einschätzung |
|---|---|
| Rewe | gut: „nationale Angebote“ als HTML, laut robots.txt erlaubt; marktbezogene Angebote nur über App-API mit mTLS – nicht verwenden |
| Lidl, Penny, Aldi Süd/Nord | wahrscheinlich machbar (kommerzielle Scraper decken sie ab) |
| Edeka | machbar, aber Angebote je Markt (Markt-ID nötig) |
| Kaufland | schwierig: Bot-Schutz (Cloudflare) – nicht umgehen |
| Müller | unklar: Prospekt alle 2 Wochen, vor allem als blätterbarer Prospekt bei Portalen |
| marktguru | inoffizielle Bibliothek (npm `marktguru`), Suche nach PLZ und Laden; bequem, aber ohne Erlaubnis |

**Offen:** Direkter Test war nicht möglich – die Cloud-Umgebung sperrt die Händler-Domains, ein Testlauf über GitHub Actions wurde von der Sicherheitsprüfung gestoppt. Nutzer muss entweder die Domains in den Netzwerkeinstellungen der Umgebung freigeben oder den Actions-Testlauf ausdrücklich erlauben.

## Handy-Besonderheit: Datensicherheit

Mobile Browser können IndexedDB bei Speichermangel löschen. Gegenmaßnahmen:
1. App zum Startbildschirm hinzufügen und **dauerhaften Speicher** anfordern (Daten-Tab).
2. **Backup** nach jedem Monatsimport herunterladen.

## Monatliche Erinnerung

Am 1. jedes Monats. Möglich als Kalendertermin (`.ics`), als Hinweis in der App (letzter Import älter als 30 Tage) oder über Home Assistant.
