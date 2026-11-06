# Ausgaben-Tracker

Persönliche PWA (React + TypeScript + Vite, Dexie/IndexedDB) für Amazon-Ausgaben und Kassenbons. Läuft als statische Seite auf GitHub Pages; alle Nutzerdaten bleiben im Browser des Geräts. Sprache in UI, Doku und Commits: Deutsch.

**Zuerst lesen:** `docs/PLAN.md` – Abschnitt „Aktueller Stand“ (was fertig ist, nächste Schritte, offene Entscheidungen).

## Befehle
- `npm run dev` / `npm run build` (kopiert vorher OCR-Dateien nach `public/ocr`)
- `npm test` (Vitest), `npm run lint` (oxlint) – vor jedem Push ausführen

## Wichtige Stellen
- `src/db/schema.ts` – Datenmodell (Schema-Änderungen nur als neue Dexie-Version)
- `src/import/amazon.ts` – Amazon-Austauschformat, Duplikate per Bestellnummer
- `amazon-script/amazon-export.js` – Konsolen-Skript für amazon.de (in der App per `?raw` kopierbar); Parser getestet in `tests/amazon-script.test.ts` (happy-dom)
- `src/receipts/parse.ts` – Bon-Leser für alle Läden; jede Anpassung mit Testfall in `tests/parse.test.ts`
- `src/receipts/ocr.ts`, `src/receipts/pdf.ts` – lokale Bild- bzw. PDF-Texterkennung
- `src/receipts/store.ts`, `src/normalize/match.ts` – Zuordnung Bontext → Produkt
- `src/finance/` – Haushaltsbuch: Standardkonten/-kategorien (`defaults.ts`, werden beim Start ergänzt), Buchungen speichern (`store.ts`), Hooks (`useFinance.ts`)
- `src/import/ing.ts`, `src/import/amex.ts`, `src/import/bank.ts` (einheitliches `BankExport`), `src/finance/classify.ts` – Bank-Import (ING-CSV, Amex-CSV), Einordnung jeder Buchung (eingebaute Regeln + gelernte Regeln + „Erkennen an“ der Konten), Neu-Einordnen; jede Regeländerung mit Test in `tests/ing.test.ts`
- `src/stats/overview.ts` – Monatsübersicht über alle Quellen; **Grundregel: Geld zählt einmal** (Umbuchungen, `viaTransactionId`, verknüpfte Bestellungen/Bons nicht doppelt) – Änderungen immer mit Test in `tests/overview.test.ts`
- `src/index.css` – alle Farben als Variablen je Farbwelt (`data-look` auf `<html>`: frisch, sonne, abend; Kategoriefarben `--cat-1…10` gemeinsam für alle); `src/lib/look.ts` wählt sie, `src/components/Icon.tsx` enthält die Icons
- `tests/fixtures/` – echte Bon-Texte, **ohne Adressen, Karten- und Zahlungsdaten**; Bank-Testdateien sind **komplett erfunden** (Max/Erika Muster). Echte Exporte des Nutzers nie committen, auch keine Werte daraus (Beträge, Händler- oder Ortsnamen) in Testdateien, Tests oder Kommentaren; vor jedem Commit danach suchen (Repo ist öffentlich)

## Arbeitsweise
- Mobile-first (Nutzer verwendet ein iPhone); UI-Änderungen in Playwright mit iPhone-Emulation prüfen.
- Feature-Branch → PR → Squash-Merge nach `main` → Deploy-Lauf (GitHub Actions) prüfen.
- Beträge immer in ganzen Cent.
- Neue Farben nur als Variablen in allen drei Farbwelten (hell und dunkel) anlegen; keine Emojis als Icons, sondern `<Icon>`.
