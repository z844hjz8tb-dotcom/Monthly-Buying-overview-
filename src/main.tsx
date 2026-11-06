import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import './index.css'
import App from './App.tsx'
import { applyLook } from './lib/look'
import { db } from './db/schema'
import { ensureDefaults } from './finance/defaults'
import { RULES_VERSION } from './finance/classify'
import { reclassifyImported } from './import/bank'
import { findReceiptLinks } from './finance/links'

applyLook()
ensureDefaults(db)
  .then(async () => {
    // Eingebaute Regeln geändert (z. B. neue Kategorien) → importierte Buchungen einmal neu einordnen
    const stored = (await db.meta.get('rulesVersion'))?.value
    if (stored !== String(RULES_VERSION)) {
      await reclassifyImported(db)
      await db.meta.put({ key: 'rulesVersion', value: String(RULES_VERSION) })
    }
    // Bons mit Kartenzahlungen verknüpfen (z. B. für Daten von vor diesem Update)
    await findReceiptLinks(db)
  })
  .catch((e) => console.error('Standarddaten konnten nicht angelegt werden', e))

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <App />
  </StrictMode>,
)
