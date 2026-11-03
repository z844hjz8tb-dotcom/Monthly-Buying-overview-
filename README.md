# Ausgaben-Tracker

Persönliche Ausgabenübersicht: zuerst Amazon-Bestellungen, später Kassenbons (Lidl, Rewe, Kaufland, Penny, …).
Die App läuft als statische Seite im Browser. **Alle Daten bleiben auf dem Gerät** (IndexedDB).

Plan und Meilensteine: [docs/PLAN.md](docs/PLAN.md)

## Entwicklung

```bash
npm install
npm run dev      # Entwicklungsserver
npm test         # Unit-Tests
npm run build    # Produktions-Build nach dist/
npm run lint
```

## Deployment

Jeder Push auf `main` baut die App und veröffentlicht sie über GitHub Actions auf GitHub Pages.
Einmalig nötig: im Repository unter **Settings → Pages → Source** „GitHub Actions“ auswählen.

## Auf dem Handy nutzen

1. Seite im Browser öffnen und „Zum Startbildschirm hinzufügen“ wählen.
2. Im Tab **Daten** „Dauerhaften Speicher anfordern“ antippen.
3. Nach jedem Import ein Backup herunterladen.
