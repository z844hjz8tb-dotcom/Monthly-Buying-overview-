import { HashRouter, NavLink, Navigate, Route, Routes, useLocation } from 'react-router-dom'
import { OverviewView } from './views/OverviewView'
import { ImportView } from './views/ImportView'
import { SettingsView } from './views/SettingsView'
import { MonthView } from './views/MonthView'
import { ReceiptsView } from './views/ReceiptsView'
import { ReceiptEditor } from './views/ReceiptEditor'
import { AssignView } from './views/AssignView'
import { ProductsView } from './views/ProductsView'
import { Icon, type IconName } from './components/Icon'

const NAV: { to: string; label: string; icon: IconName; also?: string[] }[] = [
  { to: '/uebersicht', label: 'Amazon', icon: 'package', also: ['/monat'] },
  { to: '/bons', label: 'Bons', icon: 'receipt', also: ['/bon/', '/zuordnen', '/produkte'] },
  { to: '/import', label: 'Import', icon: 'download' },
  { to: '/einstellungen', label: 'Daten', icon: 'database' },
]

/** Seitentitel in der Kopfzeile, passend zur Route */
const TITLES: [string, string][] = [
  ['/bon/neu', 'Neuer Bon'],
  ['/bon/', 'Bon'],
  ['/bons', 'Kassenbons'],
  ['/zuordnen', 'Zuordnen'],
  ['/produkte', 'Produkte'],
  ['/monat', 'Amazon'],
  ['/uebersicht', 'Amazon'],
  ['/import', 'Import'],
  ['/einstellungen', 'Daten & Design'],
]

function Header() {
  const { pathname } = useLocation()
  const title = TITLES.find(([p]) => pathname.startsWith(p))?.[1] ?? 'Ausgaben'
  return (
    <header className="app-header">
      <span className="logo-mark" aria-hidden="true"><Icon name="up" size={18} /></span>
      <h1>{title}</h1>
    </header>
  )
}

export default function App() {
  return (
    <HashRouter>
      <div className="app">
        <Header />
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
            <Icon name={n.icon} size={22} />
            <span>{n.label}</span>
          </NavLink>
        )
      })}
    </nav>
  )
}
