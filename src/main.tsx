import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import './index.css'
import App from './App.tsx'
import { applyLook } from './lib/look'
import { db } from './db/schema'
import { ensureDefaults } from './finance/defaults'

applyLook()
ensureDefaults(db).catch((e) => console.error('Standarddaten konnten nicht angelegt werden', e))

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <App />
  </StrictMode>,
)
