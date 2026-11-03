# Ausgaben-Tracker

Persönliche PWA (React + TypeScript + Vite, Dexie/IndexedDB) für Amazon-Ausgaben und Kassenbons. Läuft als statische Seite auf GitHub Pages; alle Nutzerdaten bleiben im Browser des Geräts. Sprache in UI, Doku und Commits: Deutsch.

**Zuerst lesen:** `docs/PLAN.md` – Abschnitt „Aktueller Stand“ (was fertig ist, nächste Schritte, offene Entscheidungen).

## Befehle
- `npm run dev` / `npm run build` (kopiert vorher OCR-Dateien nach `public/ocr`)
- `npm test` (Vitest), `npm run lint` (oxlint) – vor jedem Push ausführen

## Wichtige Stellen
- `src/db/schema.ts` – Datenmodell (Schema-Änderungen nur als neue Dexie-Version)
- `src/import/amazon.ts` – Amazon-Austauschformat, Duplikate per Bestellnummer
- `src/receipts/parse.ts` – Bon-Leser für alle Läden; jede Anpassung mit Testfall in `tests/parse.test.ts`
- `src/receipts/ocr.ts`, `src/receipts/pdf.ts` – lokale Bild- bzw. PDF-Texterkennung
- `src/receipts/store.ts`, `src/normalize/match.ts` – Zuordnung Bontext → Produkt
- `tests/fixtures/` – echte Bon-Texte, **ohne Adressen, Karten- und Zahlungsdaten** (Repo ist öffentlich)

## Arbeitsweise
- Mobile-first (Nutzer verwendet ein iPhone); UI-Änderungen in Playwright mit iPhone-Emulation prüfen.
- Feature-Branch → PR → Squash-Merge nach `main` → Deploy-Lauf (GitHub Actions) prüfen.
- Beträge immer in ganzen Cent.
