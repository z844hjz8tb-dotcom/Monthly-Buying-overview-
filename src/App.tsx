import { HashRouter, NavLink, Navigate, Route, Routes, useLocation } from 'react-router-dom'
import { OverviewView } from './views/OverviewView'
import { ImportView } from './views/ImportView'
import { SettingsView } from './views/SettingsView'
import { MonthView } from './views/MonthView'
import { ReceiptsView } from './views/ReceiptsView'
import { ReceiptEditor } from './views/ReceiptEditor'
import { AssignView } from './views/AssignView'
import { ProductsView } from './views/ProductsView'

const NAV: { to: string; label: string; icon: string; also?: string[] }[] = [
  { to: '/uebersicht', label: 'Amazon', icon: '📦', also: ['/monat'] },
  { to: '/bons', label: 'Bons', icon: '🧾', also: ['/bon/', '/zuordnen', '/produkte'] },
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
            <Route path="/bons" element={<ReceiptsView />} />
            <Route path="/bons/:month" element={<ReceiptsView />} />
            <Route path="/bon/neu" element={<ReceiptEditor key="new" />} />
            <Route path="/bon/:id" element={<ReceiptEditor />} />
            <Route path="/zuordnen" element={<AssignView />} />
            <Route path="/produkte" element={<ProductsView />} />
            <Route path="/import" element={<ImportView />} />
            <Route path="/einstellungen" element={<SettingsView />} />
            <Route path="*" element={<Navigate to="/uebersicht" replace />} />
          </Routes>
        </main>
        <BottomNav />
      </div>
    </HashRouter>
  )
}

function BottomNav() {
  const { pathname } = useLocation()
  return (
    <nav className="bottom-nav" aria-label="Hauptnavigation">
      {NAV.map((n) => {
        const active = pathname.startsWith(n.to) || (n.also ?? []).some((p) => pathname.startsWith(p))
        return (
          <NavLink key={n.to} to={n.to} className={active ? 'active' : ''} aria-current={active ? 'page' : undefined}>
            <span aria-hidden="true">{n.icon}</span>
            <span>{n.label}</span>
          </NavLink>
        )
      })}
    </nav>
  )
}
