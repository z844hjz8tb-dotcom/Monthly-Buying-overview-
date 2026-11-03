import { HashRouter, NavLink, Navigate, Route, Routes } from 'react-router-dom'
import { OverviewView } from './views/OverviewView'
import { ImportView } from './views/ImportView'
import { SettingsView } from './views/SettingsView'
import { MonthView } from './views/MonthView'

const NAV = [
  { to: '/uebersicht', label: 'Übersicht', icon: '📊' },
  { to: '/import', label: 'Import', icon: '📥' },
  { to: '/einstellungen', label: 'Daten', icon: '⚙️' },
]

export default function App() {
  return (
    <HashRouter>
      <div className="app">
        <header className="app-header">
          <h1>Ausgaben</h1>
        </header>
        <main className="app-main">
          <Routes>
            <Route path="/uebersicht" element={<OverviewView />} />
            <Route path="/monat/:key" element={<MonthView />} />
            <Route path="/import" element={<ImportView />} />
            <Route path="/einstellungen" element={<SettingsView />} />
            <Route path="*" element={<Navigate to="/uebersicht" replace />} />
          </Routes>
        </main>
        <nav className="bottom-nav" aria-label="Hauptnavigation">
          {NAV.map((n) => (
            <NavLink key={n.to} to={n.to} className={({ isActive }) => (isActive ? 'active' : '')}>
              <span aria-hidden="true">{n.icon}</span>
              <span>{n.label}</span>
            </NavLink>
          ))}
        </nav>
      </div>
    </HashRouter>
  )
}
